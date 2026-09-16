// The bridge to Jolt. Everything the rest of PhysLab knows about the running simulation
// goes through this file, so the engine can later move into a worker without touching the UI.
//
// Rules kept here (they are easy to get wrong with a WebAssembly C++ API):
//  * every Jolt object we create is tracked and destroyed again (`track`);
//  * contact callbacks only record, they never change bodies (that happens after the step);
//  * `step()` hands back a plain Float32Array, so the renderer never touches Jolt objects.

import { loadJolt, type Jolt } from './jolt'
import { dragCoefficient, frontalArea, materialById, shapeVolume } from './materials'
import type { BodyDef, BodyId, BodyState, ContactEvent, WorldSettings } from './types'
import { DEFAULT_WORLD } from './types'
import type { V3 } from '../math/vec'

/** Object layers: things that never move, and things that do. */
const LAYER_STATIC = 0
const LAYER_MOVING = 1
const NUM_LAYERS = 2

/** Floats per body in the transform buffer: position (3) + rotation quaternion (4). */
export const STRIDE = 7

interface Entry {
  def: BodyDef
  /** The Jolt Body itself: a stable pointer. A BodyID returned by value is a temporary
   *  and using it after the call that produced it crashes the WebAssembly heap. */
  body: InstanceType<Jolt['Body']>
  mass: number
}

type AnyJolt = Record<string, never>

export class SimWorld {
  private jolt: Jolt
  private joltInterface: InstanceType<Jolt['JoltInterface']>
  private physics: InstanceType<Jolt['PhysicsSystem']>
  private bodies: InstanceType<Jolt['BodyInterface']>
  private handles = new Set<unknown>()
  private entries = new Map<BodyId, Entry>()
  private order: BodyId[] = []
  private transforms = new Float32Array(0)
  private contacts: ContactEvent[] = []
  private settings: WorldSettings = { ...DEFAULT_WORLD }
  private accumulator = 0
  private grabbed: { id: BodyId; target: V3 } | null = null
  /** Simulated time in seconds since the last reset. */
  time = 0

  private constructor(jolt: Jolt) {
    this.jolt = jolt
    const J = jolt as unknown as AnyJolt & Jolt

    const objectFilter = this.track(new J.ObjectLayerPairFilterTable(NUM_LAYERS))
    objectFilter.EnableCollision(LAYER_STATIC, LAYER_MOVING)
    objectFilter.EnableCollision(LAYER_MOVING, LAYER_MOVING)

    const bpStatic = this.track(new J.BroadPhaseLayer(LAYER_STATIC))
    const bpMoving = this.track(new J.BroadPhaseLayer(LAYER_MOVING))
    const bpInterface = this.track(new J.BroadPhaseLayerInterfaceTable(NUM_LAYERS, NUM_LAYERS))
    bpInterface.MapObjectToBroadPhaseLayer(LAYER_STATIC, bpStatic)
    bpInterface.MapObjectToBroadPhaseLayer(LAYER_MOVING, bpMoving)

    const settings = this.track(new J.JoltSettings())
    settings.mMaxBodies = 2048
    settings.mMaxBodyPairs = 8192
    settings.mMaxContactConstraints = 4096
    settings.mObjectLayerPairFilter = objectFilter
    settings.mBroadPhaseLayerInterface = bpInterface
    settings.mObjectVsBroadPhaseLayerFilter = this.track(
      new J.ObjectVsBroadPhaseLayerFilterTable(bpInterface, NUM_LAYERS, objectFilter, NUM_LAYERS)
    )

    this.joltInterface = this.track(new J.JoltInterface(settings))
    this.physics = this.joltInterface.GetPhysicsSystem()
    this.bodies = this.physics.GetBodyInterface()
    this.installContactListener()
    this.applyWorldSettings()
  }

  private static instance: SimWorld | null = null

  /**
   * The one and only world. Jolt registers global types and allocators, so a second
   * physics interface would corrupt the first; this hands back the same world, emptied.
   */
  static async create(settings?: Partial<WorldSettings>): Promise<SimWorld> {
    const jolt = await loadJolt()
    if (!SimWorld.instance) SimWorld.instance = new SimWorld(jolt)
    const world = SimWorld.instance
    world.clear()
    world.settings = { ...DEFAULT_WORLD, ...settings }
    world.applyWorldSettings()
    return world
  }

  /** Removes every body but keeps the engine ready for the next scene. */
  clear(): void {
    for (const id of [...this.order]) this.removeBody(id)
    this.time = 0
    this.accumulator = 0
    this.contacts = []
    this.grabbed = null
  }

  // -------------------------------------------------------------------------
  // Handles: every Jolt object is a C++ pointer that has to be destroyed again
  // -------------------------------------------------------------------------

  private track<T>(obj: T): T {
    this.handles.add(obj)
    return obj
  }

  private release(obj: unknown) {
    if (!this.handles.delete(obj)) return
    ;(this.jolt as unknown as { destroy: (o: unknown) => void }).destroy(obj)
  }

  /** How many Jolt objects are alive; a leak shows up as a number that keeps climbing. */
  get handleCount(): number {
    return this.handles.size
  }

  private v3(v: V3) {
    return this.track(new (this.jolt as unknown as AnyJolt & Jolt).Vec3(v[0], v[1], v[2]))
  }

  private rv3(v: V3) {
    return this.track(new (this.jolt as unknown as AnyJolt & Jolt).RVec3(v[0], v[1], v[2]))
  }

  // -------------------------------------------------------------------------
  // World settings
  // -------------------------------------------------------------------------

  setWorldSettings(patch: Partial<WorldSettings>): void {
    const before = this.settings
    this.settings = { ...before, ...patch }
    this.applyWorldSettings()
    // Switching 2D on or off changes what a body is allowed to do, so rebuild them.
    if (patch.twoD !== undefined && patch.twoD !== before.twoD) this.rebuild()
    if (patch.allowSleeping !== undefined && patch.allowSleeping !== before.allowSleeping) this.rebuild()
  }

  getWorldSettings(): WorldSettings {
    return { ...this.settings }
  }

  private applyWorldSettings() {
    const g = this.v3([0, -this.settings.gravity, 0])
    this.physics.SetGravity(g)
    this.release(g)
  }

  // -------------------------------------------------------------------------
  // Bodies
  // -------------------------------------------------------------------------

  /** Mass in kg for a definition, worked out the same way the panel shows it. */
  static massOf(def: BodyDef): number {
    if (def.massMode === 'mass') return Math.max(1e-6, def.mass)
    const density = materialById(def.material).density
    return Math.max(1e-6, density * shapeVolume(def.shape, def.size))
  }

  addBody(def: BodyDef): void {
    const J = this.jolt as unknown as AnyJolt & Jolt
    const shape = this.makeShape(def)
    if (!shape) return
    const motion =
      def.motion === 'static' ? J.EMotionType_Static : def.motion === 'kinematic' ? J.EMotionType_Kinematic : J.EMotionType_Dynamic
    const layer = def.motion === 'dynamic' ? LAYER_MOVING : LAYER_STATIC
    const pos = this.rv3(def.position)
    const rot = this.quatFromEuler(def.rotation)
    const settings = this.track(new J.BodyCreationSettings(shape, pos, rot, motion, layer))

    const mass = SimWorld.massOf(def)
    settings.mRestitution = def.restitution
    settings.mFriction = def.friction
    // Mass, damping, sleeping, continuous collision and the 2D lock only mean anything for a
    // body that moves; Jolt refuses them on a static one.
    if (def.motion === 'dynamic') {
      settings.mOverrideMassProperties = J.EOverrideMassProperties_CalculateInertia
      settings.mMassPropertiesOverride.mMass = mass
      settings.mLinearDamping = def.linearDamping
      settings.mAngularDamping = def.angularDamping
      settings.mAllowSleeping = this.settings.allowSleeping
      // Fast, thin objects must not tunnel through walls.
      settings.mMotionQuality = J.EMotionQuality_LinearCast
      if (this.settings.twoD) settings.mAllowedDOFs = J.EAllowedDOFs_Plane2D
    }
    const lv = this.v3(def.velocity)
    const av = this.v3(def.angularVelocity)
    settings.mLinearVelocity = lv
    settings.mAngularVelocity = av

    const body = this.bodies.CreateBody(settings)
    body.SetUserData(this.order.length + 1)
    this.bodies.AddBody(body.GetID(), def.motion === 'dynamic' ? J.EActivation_Activate : J.EActivation_DontActivate)

    this.entries.set(def.id, { def, body, mass })
    this.order.push(def.id)
    this.transforms = new Float32Array(this.order.length * STRIDE)
    this.release(settings)
    this.release(pos)
    this.release(rot)
    this.release(lv)
    this.release(av)
  }

  removeBody(id: BodyId): void {
    const e = this.entries.get(id)
    if (!e) return
    const bodyId = e.body.GetID()
    this.bodies.RemoveBody(bodyId)
    this.bodies.DestroyBody(bodyId)
    this.entries.delete(id)
    this.order = this.order.filter((x) => x !== id)
    this.transforms = new Float32Array(this.order.length * STRIDE)
    // Re-number the user data so contacts still map to the right body.
    this.order.forEach((bid, i) => {
      const entry = this.entries.get(bid)
      if (entry) entry.body.SetUserData(i + 1)
    })
  }

  /** Replace every body with its definition again (Reset, or a change that needs a rebuild). */
  rebuild(defs?: BodyDef[]): void {
    const list = defs ?? this.order.map((id) => this.entries.get(id)!.def)
    this.clear()
    for (const def of list) this.addBody(def)
  }

  /**
   * Builds the collision shape. Shapes are created directly (not through settings that are then
   * thrown away) because a freed ShapeSettings takes its shape with it.
   */
  private makeShape(def: BodyDef): InstanceType<Jolt['Shape']> | null {
    const J = this.jolt as unknown as AnyJolt & Jolt
    const [a, b, c] = def.size
    const min = (v: number) => Math.max(0.01, v)
    // Shapes are reference counted by Jolt and freed with the body that uses them,
    // so they are deliberately not tracked here.
    const cast = (shape: unknown) => shape as InstanceType<Jolt['Shape']>
    switch (def.shape) {
      case 'sphere':
        return cast(new J.SphereShape(min(a)))
      case 'cylinder':
        return cast(new J.CylinderShape(min(b / 2), min(a), 0.02))
      case 'capsule':
        return cast(new J.CapsuleShape(min(b / 2), min(a)))
      case 'ramp':
      case 'cone':
        return this.hullShape(def)
      default: {
        const half = this.v3([min(a / 2), min(b / 2), min(c / 2)])
        const shape = new J.BoxShape(half, 0.02)
        this.release(half)
        return cast(shape)
      }
    }
  }

  /** A wedge (ramp) or a cone, built from corner points. */
  private hullShape(def: BodyDef): InstanceType<Jolt['Shape']> | null {
    const J = this.jolt as unknown as AnyJolt & Jolt
    const [a, b, c] = def.size
    const hx = Math.max(0.01, a / 2)
    const hy = Math.max(0.01, b / 2)
    const hz = Math.max(0.01, c / 2)
    const corners: V3[] =
      def.shape === 'ramp'
        ? [
            [-hx, -hy, -hz],
            [hx, -hy, -hz],
            [-hx, hy, -hz],
            [-hx, -hy, hz],
            [hx, -hy, hz],
            [-hx, hy, hz]
          ]
        : [
            [0, hy, 0],
            [-hx, -hy, -hz],
            [hx, -hy, -hz],
            [hx, -hy, hz],
            [-hx, -hy, hz]
          ]
    const pts = this.track(new J.ArrayVec3())
    for (const p of corners) {
      const v = this.v3(p)
      pts.push_back(v)
      this.release(v)
    }
    const settings = new J.ConvexHullShapeSettings()
    settings.mPoints = pts
    settings.mMaxConvexRadius = 0.02
    const shape = settings.Create().Get() as unknown as InstanceType<Jolt['Shape']>
    this.release(pts)
    return shape
  }

  private quatFromEuler(deg: V3) {
    const J = this.jolt as unknown as AnyJolt & Jolt
    const [x, y, z] = deg.map((d) => (d * Math.PI) / 180)
    const cx = Math.cos(x / 2)
    const sx = Math.sin(x / 2)
    const cy = Math.cos(y / 2)
    const sy = Math.sin(y / 2)
    const cz = Math.cos(z / 2)
    const sz = Math.sin(z / 2)
    return this.track(
      new J.Quat(
        sx * cy * cz - cx * sy * sz,
        cx * sy * cz + sx * cy * sz,
        cx * cy * sz - sx * sy * cz,
        cx * cy * cz + sx * sy * sz
      )
    )
  }

  // -------------------------------------------------------------------------
  // Running
  // -------------------------------------------------------------------------

  /**
   * Advances the world by up to `dt` real seconds (scaled by the slow-motion setting)
   * in fixed 1/60 s steps, and returns the new positions.
   * The accumulator is clamped so a slow machine falls behind gracefully instead of freezing.
   */
  step(dt: number): { transforms: Float32Array; contacts: ContactEvent[] } {
    const FIXED = 1 / 60
    this.accumulator = Math.min(this.accumulator + dt * this.settings.timeScale, FIXED * 3)
    this.contacts = []
    while (this.accumulator >= FIXED) {
      this.beforeStep(FIXED)
      this.joltInterface.Step(FIXED, this.settings.collisionSteps)
      this.accumulator -= FIXED
      this.time += FIXED
    }
    this.readTransforms()
    return { transforms: this.transforms, contacts: this.contacts }
  }

  /** Forces that PhysLab applies itself: air drag, wind, and the grab spring. */
  private beforeStep(dt: number) {
    const J = this.jolt as unknown as AnyJolt & Jolt
    const rho = this.settings.airDensity
    for (const id of this.order) {
      const e = this.entries.get(id)!
      if (e.def.motion !== 'dynamic') continue
      const body = e.body
      if (!body.IsActive()) continue

      if (rho > 0) {
        const v = body.GetLinearVelocity()
        const rel: V3 = [v.GetX() - this.settings.wind[0], v.GetY() - this.settings.wind[1], v.GetZ() - this.settings.wind[2]]
        const speed = Math.hypot(rel[0], rel[1], rel[2])
        if (speed > 1e-4) {
          const dir: V3 = [rel[0] / speed, rel[1] / speed, rel[2] / speed]
          const cd = e.def.dragCd ?? dragCoefficient(e.def.shape)
          const area = e.def.dragArea ?? frontalArea(e.def.shape, e.def.size, dir)
          const mag = 0.5 * rho * cd * area * speed * speed
          const f = this.v3([-dir[0] * mag, -dir[1] * mag, -dir[2] * mag])
          body.AddForce(f)
          this.release(f)
        }
      }

      if (this.grabbed && this.grabbed.id === id) {
        // A spring to the cursor: F = k(target − x) − c·v, the same model as a real spring.
        const p = body.GetPosition()
        const v = body.GetLinearVelocity()
        const k = 60 * e.mass
        const c = 12 * e.mass
        const f = this.v3([
          k * (this.grabbed.target[0] - p.GetX()) - c * v.GetX(),
          k * (this.grabbed.target[1] - p.GetY()) - c * v.GetY(),
          k * (this.grabbed.target[2] - p.GetZ()) - c * v.GetZ()
        ])
        body.AddForce(f)
        this.bodies.ActivateBody(body.GetID())
        this.release(f)
      }
    }
    void dt
  }

  private readTransforms() {
    this.order.forEach((id, i) => {
      const e = this.entries.get(id)!
      const p = e.body.GetPosition()
      const q = e.body.GetRotation()
      const o = i * STRIDE
      this.transforms[o] = p.GetX()
      this.transforms[o + 1] = p.GetY()
      this.transforms[o + 2] = p.GetZ()
      this.transforms[o + 3] = q.GetX()
      this.transforms[o + 4] = q.GetY()
      this.transforms[o + 5] = q.GetZ()
      this.transforms[o + 6] = q.GetW()
    })
  }

  /** Body ids in the same order as the transform buffer. */
  get bodyOrder(): BodyId[] {
    return this.order
  }

  state(id: BodyId): BodyState | null {
    const e = this.entries.get(id)
    if (!e) return null
    const p = e.body.GetPosition()
    const q = e.body.GetRotation()
    const v = e.body.GetLinearVelocity()
    const w = e.body.GetAngularVelocity()
    return {
      position: [p.GetX(), p.GetY(), p.GetZ()],
      rotation: [q.GetX(), q.GetY(), q.GetZ(), q.GetW()],
      velocity: [v.GetX(), v.GetY(), v.GetZ()],
      angularVelocity: [w.GetX(), w.GetY(), w.GetZ()],
      mass: e.mass,
      asleep: !e.body.IsActive()
    }
  }

  setVelocity(id: BodyId, velocity: V3): void {
    const e = this.entries.get(id)
    if (!e) return
    const v = this.v3(velocity)
    this.bodies.SetLinearVelocity(e.body.GetID(), v)
    this.bodies.ActivateBody(e.body.GetID())
    this.release(v)
  }

  setPosition(id: BodyId, position: V3): void {
    const e = this.entries.get(id)
    if (!e) return
    const J = this.jolt as unknown as AnyJolt & Jolt
    const p = this.rv3(position)
    const q = e.body.GetRotation()
    this.bodies.SetPositionAndRotation(e.body.GetID(), p, q, J.EActivation_Activate)
    this.release(p)
  }

  grab(id: BodyId, target: V3): void {
    this.grabbed = { id, target }
  }

  moveGrab(target: V3): void {
    if (this.grabbed) this.grabbed.target = target
  }

  release_(): void {
    this.grabbed = null
  }

  get grabbedId(): BodyId | null {
    return this.grabbed?.id ?? null
  }

  // -------------------------------------------------------------------------
  // Contacts: recorded during the step, read afterwards (never act inside the callback)
  // -------------------------------------------------------------------------

  private installContactListener() {
    const J = this.jolt as unknown as AnyJolt & Jolt
    const listener = this.track(new J.ContactListenerJS())
    const record = (body1: number, body2: number, manifold: number) => {
      const b1 = J.wrapPointer(body1, J.Body)
      const b2 = J.wrapPointer(body2, J.Body)
      const m = J.wrapPointer(manifold, J.ContactManifold)
      const i1 = Number(b1.GetUserData()) - 1
      const i2 = Number(b2.GetUserData()) - 1
      const a = this.order[i1]
      const b = this.order[i2]
      if (!a || !b) return
      const n = m.mWorldSpaceNormal
      const normal: V3 = [n.GetX(), n.GetY(), n.GetZ()]
      const v1 = b1.GetLinearVelocity()
      const v2 = b2.GetLinearVelocity()
      const rel: V3 = [v1.GetX() - v2.GetX(), v1.GetY() - v2.GetY(), v1.GetZ() - v2.GetZ()]
      const approach = -(rel[0] * normal[0] + rel[1] * normal[1] + rel[2] * normal[2])
      const p = m.GetWorldSpaceContactPointOn1(0)
      this.contacts.push({
        a,
        b,
        t: this.time,
        approachSpeed: approach,
        normal,
        point: [p.GetX(), p.GetY(), p.GetZ()]
      })
    }
    listener.OnContactAdded = (body1: number, body2: number, manifold: number, _settings: number) => record(body1, body2, manifold)
    listener.OnContactPersisted = (_b1: number, _b2: number, _manifold: number, _settings: number) => undefined
    listener.OnContactRemoved = (_subShapePair: number) => undefined
    listener.OnContactValidate = (_b1: number, _b2: number, _offset: number, _result: number) =>
      J.ValidateResult_AcceptAllContactsForThisBodyPair
    this.physics.SetContactListener(listener)
  }

  // -------------------------------------------------------------------------

  /** Empties the world. The engine itself stays loaded, ready for the next scene. */
  destroy(): void {
    this.clear()
  }
}

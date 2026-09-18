// The bridge to Jolt. Everything the rest of PhysLab knows about the running simulation
// goes through this file, so the engine can later move into a worker without touching the UI.
//
// Rules kept here (they are easy to get wrong with a WebAssembly C++ API):
//  * every Jolt object we create is tracked and destroyed again (`track`);
//  * contact callbacks only record, they never change bodies (that happens after the step);
//  * `step()` hands back a plain Float32Array, so the renderer never touches Jolt objects.

import { loadJolt, type Jolt } from './jolt'
import { dragCoefficient, frontalArea, materialById, shapeVolume } from './materials'
import type { BodyDef, BodyId, BodyState, ContactEvent, Link, WorldSettings } from './types'
import { DEFAULT_WORLD } from './types'
import type { V3 } from '../math/vec'

/** Object layers: things that never move, and things that do. */
const LAYER_STATIC = 0
const LAYER_MOVING = 1
const NUM_LAYERS = 2

/** Floats per body in the transform buffer: position (3) + rotation quaternion (4). */
export const STRIDE = 7

/**
 * The hardest a dragged object can be pulled, in newtons — roughly a firm two-handed pull. It is
 * what stops the cursor behaving like an infinitely strong crane: with the force bounded, a = F/m
 * finally depends on m again.
 */
const GRAB_MAX_FORCE = 800

/** Shapes that roll, and so are slowed by rolling resistance rather than sliding friction. */
const ROLLING_SHAPES = new Set(['sphere', 'cylinder', 'capsule'])

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
  /** Who is touching what, refilled by the contact listener every step: body → the body under it. */
  private touching = new Map<BodyId, BodyId>()
  /** Rods, strings and springs, by their id. */
  private links = new Map<string, InstanceType<Jolt['Constraint']>>()
  /** The definitions behind them, so a rebuild can put them back. */
  private linkDefs: Link[] = []
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
    // Constraints refer to bodies, so they have to go first or Jolt is left holding a reference
    // to something that no longer exists.
    for (const c of this.links.values()) this.physics.RemoveConstraint(c)
    this.links.clear()
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

    // Jolt's defaults let a body creep for half a second below a threshold meant for a game, where
    // a barrel drifting a millimetre goes unnoticed. In a physics lab the question is "has it
    // stopped?", so a body has to be slower and stay slow before it is allowed to settle.
    const ps = this.physics.GetPhysicsSettings()
    ps.mPointVelocitySleepThreshold = 0.02
    ps.mTimeBeforeSleep = 0.35
    this.physics.SetPhysicsSettings(ps)
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
    const built = this.makeShape(def)
    if (!built) return
    const { shape, settings: shapeSettings } = built
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
      // Held to one axis: a trolley on a track, a lift in a shaft. Isolating one direction is how
      // half of mechanics is taught, and there was no way to ask for it.
      if (def.lock === 'x') settings.mAllowedDOFs = J.EAllowedDOFs_TranslationX | J.EAllowedDOFs_RotationZ
      else if (def.lock === 'y') settings.mAllowedDOFs = J.EAllowedDOFs_TranslationY | J.EAllowedDOFs_RotationZ
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
    // The body holds its own reference to the shape now, so the settings that built it can go.
    if (shapeSettings) this.release(shapeSettings)
    this.release(pos)
    this.release(rot)
    this.release(lv)
    this.release(av)
  }

  /**
   * Applies a changed definition to a body that is already in the world, and says whether it
   * managed it. Renaming a ball, recolouring it or making it bouncier costs nothing; changing its
   * shape, size, mass or whether it moves at all means Jolt has to build the body again.
   *
   * This exists because the panel used to rebuild the entire world on every keystroke, so typing a
   * new name for a falling ball snapped every object back to where it started.
   */
  updateBody(def: BodyDef): boolean {
    const e = this.entries.get(def.id)
    if (!e) return false
    const was = e.def
    const structural =
      was.shape !== def.shape ||
      was.motion !== def.motion ||
      was.size.some((v, i) => v !== def.size[i]) ||
      was.material !== def.material ||
      was.massMode !== def.massMode ||
      was.mass !== def.mass ||
      was.lock !== def.lock
    if (structural) return false

    const body = e.body
    if (was.restitution !== def.restitution) body.SetRestitution(def.restitution)
    if (was.friction !== def.friction) body.SetFriction(def.friction)
    if (def.motion === 'dynamic') {
      const mp = body.GetMotionProperties()
      if (was.linearDamping !== def.linearDamping) mp.SetLinearDamping(def.linearDamping)
      if (was.angularDamping !== def.angularDamping) mp.SetAngularDamping(def.angularDamping)
    }
    // Position and velocity are only pushed when they really changed, so a body mid-flight is not
    // yanked back to the number sitting in the panel on every unrelated edit.
    if (was.position.some((v, i) => v !== def.position[i])) this.setPosition(def.id, def.position)
    if (was.velocity.some((v, i) => v !== def.velocity[i])) this.setVelocity(def.id, def.velocity)
    e.def = def
    return true
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

  // -------------------------------------------------------------------------
  // Connections between bodies
  // -------------------------------------------------------------------------

  /**
   * Rebuilds every rod, string and spring. All three are Jolt distance constraints; what differs
   * is the range they allow and whether it is soft:
   *
   *  * a **rod** holds exactly its length, so it pushes as well as pulls;
   *  * a **string** allows anything from nothing up to its length, so it pulls when taut and
   *    goes slack otherwise — which is what makes a pendulum swing rather than orbit;
   *  * a **spring** holds its length through a soft limit of stiffness k, so F = kx and a mass
   *    on it oscillates with the period the textbook gives.
   */
  setLinks(links: Link[]): void {
    const J = this.jolt as unknown as AnyJolt & Jolt
    this.linkDefs = links
    for (const c of this.links.values()) this.physics.RemoveConstraint(c)
    this.links.clear()

    for (const link of links) {
      const a = this.entries.get(link.a)
      const b = this.entries.get(link.b)
      if (!a || !b || a === b) continue
      const settings = this.track(new J.DistanceConstraintSettings())
      // The set_* methods, not plain assignment: the generated typings offer both, but only
      // these actually reach the C++ object. Assigning `settings.mPoint1 = …` left both
      // attachment points at the world origin, which pinned the bodies where they stood instead
      // of joining them — a pendulum that would not swing at all.
      // Attached at each body's own centre, in its own frame. Giving world-space points instead
      // leaves the constraint holding whatever positions the bodies happened to have when it was
      // made, which pinned them where they stood — a slack string held a ball in mid-air.
      settings.set_mSpace(J.EConstraintSpace_LocalToBodyCOM)
      const p1 = this.rv3([0, 0, 0])
      const p2 = this.rv3([0, 0, 0])
      settings.set_mPoint1(p1)
      settings.set_mPoint2(p2)
      const L = Math.max(0.01, link.length)
      // A string may go slack — that is the whole difference between a string and a rod.
      settings.set_mMinDistance(link.kind === 'string' ? 0 : L)
      settings.set_mMaxDistance(L)
      if (link.kind === 'spring') {
        const spring = settings.get_mLimitsSpringSettings()
        spring.set_mMode(J.ESpringMode_StiffnessAndDamping)
        spring.set_mStiffness(Math.max(0.01, link.stiffness))
        spring.set_mDamping(Math.max(0, link.damping))
        settings.set_mLimitsSpringSettings(spring)
      }
      const constraint = settings.Create(a.body, b.body)
      this.physics.AddConstraint(constraint)
      this.links.set(link.id, constraint)
      // The settings and the points they hold are NOT released here. Jolt's constraint keeps
      // referring to them, exactly as a ShapeSettings owns the shape it built — free them and the
      // constraint pins both bodies rigidly in place instead of joining them. They are tracked,
      // so they still go when the world is destroyed.
      void p1
      void p2
    }
  }

  /** Replace every body with its definition again (Reset, or a change that needs a rebuild). */
  rebuild(defs?: BodyDef[], links?: Link[]): void {
    const list = defs ?? this.order.map((id) => this.entries.get(id)!.def)
    const joins = links ?? this.linkDefs
    this.clear()
    for (const def of list) this.addBody(def)
    // Constraints are built after the bodies, because each one needs both of them to exist.
    this.linkDefs = joins
    this.setLinks(joins)
  }

  /**
   * Builds the collision shape. Simple shapes are created directly, because a freed ShapeSettings
   * takes its shape with it. A hull (ramp, cone) can only be built through settings, so those come
   * back with the shape and addBody() frees them once the body holds its own reference.
   */
  private makeShape(def: BodyDef): { shape: InstanceType<Jolt['Shape']>; settings: unknown | null } | null {
    const J = this.jolt as unknown as AnyJolt & Jolt
    const [a, b, c] = def.size
    const min = (v: number) => Math.max(0.01, v)
    // Shapes are reference counted by Jolt and freed with the body that uses them,
    // so they are deliberately not tracked here.
    const cast = (shape: unknown) => shape as InstanceType<Jolt['Shape']>
    switch (def.shape) {
      case 'sphere':
        return { shape: cast(new J.SphereShape(min(a))), settings: null }
      case 'cylinder':
        return { shape: cast(new J.CylinderShape(min(b / 2), min(a), 0.02)), settings: null }
      case 'capsule':
        return { shape: cast(new J.CapsuleShape(min(b / 2), min(a))), settings: null }
      case 'ramp':
      case 'cone':
        return this.hullShape(def)
      default: {
        const half = this.v3([min(a / 2), min(b / 2), min(c / 2)])
        const shape = new J.BoxShape(half, 0.02)
        this.release(half)
        return { shape: cast(shape), settings: null }
      }
    }
  }

  /** A wedge (ramp) or a cone, built from corner points. */
  private hullShape(def: BodyDef): { shape: InstanceType<Jolt['Shape']>; settings: unknown } | null {
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
    const settings = this.track(new J.ConvexHullShapeSettings())
    settings.mPoints = pts
    settings.mMaxConvexRadius = 0.02
    const shape = settings.Create().Get() as unknown as InstanceType<Jolt['Shape']>
    this.release(pts)
    // These settings hold the only reference to the new shape, so they are freed in addBody()
    // once the body has taken one of its own; freeing them here would take the shape too.
    return { shape, settings }
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
      // beforeStep reads the contacts the last step found; the listener refills them during Step.
      this.beforeStep(FIXED)
      this.touching.clear()
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

      // Rolling resistance. Jolt has none, so a ball on a level floor rolls until the scene is
      // closed. The resistive torque is μr·N·r against the spin, with N ≈ mg, and it is applied
      // only while the body is actually touching something — in flight there is no surface to
      // resist against. μr comes from both materials, the way friction does, so a ball on ice
      // runs and the same ball on concrete stops.
      const touch = this.touching.get(id)
      if (touch && ROLLING_SHAPES.has(e.def.shape)) {
        const w = body.GetAngularVelocity()
        const spin = Math.hypot(w.GetX(), w.GetY(), w.GetZ())
        if (spin > 1e-3) {
          // A figure typed on the body wins over the one its material carries, so a student can
          // put a textbook value in and watch what it changes.
          const mine = e.def.rolling ?? materialById(e.def.material).rolling
          const other = this.entries.get(touch)?.def
          const theirs = other ? (other.rolling ?? materialById(other.material).rolling) : mine
          // Rolling resistance comes from whichever surface deforms more, so the larger figure
          // wins rather than the two averaging out: a steel ball rolls a long way on ice and a
          // short way on concrete, which is the pair of results a student can check by eye.
          const mu = Math.max(mine, theirs)
          const radius = Math.max(1e-3, e.def.size[0])
          const mag = mu * e.mass * this.settings.gravity * radius
          const t = this.v3([(-w.GetX() / spin) * mag, (-w.GetY() / spin) * mag, (-w.GetZ() / spin) * mag])
          body.AddTorque(t)
          this.release(t)
        }
      }

      if (this.grabbed && this.grabbed.id === id) {
        // A spring to the cursor: F = k(target − x) − c·v, the same model as a real spring. The
        // stiffness scales with mass so a light object is not flung across the scene, but that
        // alone cancelled the mass out of a = F/m and made a two-tonne block as easy to drag as a
        // marble. A hand can only pull so hard, so the force is capped: heavy things now barely
        // shift, which is the whole point of giving them a mass.
        const p = body.GetPosition()
        const v = body.GetLinearVelocity()
        const k = 60 * e.mass
        const c = 12 * e.mass
        let fx = k * (this.grabbed.target[0] - p.GetX()) - c * v.GetX()
        let fy = k * (this.grabbed.target[1] - p.GetY()) - c * v.GetY()
        let fz = k * (this.grabbed.target[2] - p.GetZ()) - c * v.GetZ()
        const pull = Math.hypot(fx, fy, fz)
        if (pull > GRAB_MAX_FORCE) {
          const s = GRAB_MAX_FORCE / pull
          fx *= s
          fy *= s
          fz *= s
        }
        const f = this.v3([fx, fy, fz])
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
    // A contact that is merely continuing is not an event worth logging, but it is what tells
    // rolling resistance there is a surface underneath. Both callbacks note who is touching whom;
    // only a new contact becomes a collision the student can read.
    const noteTouch = (body1: number, body2: number) => {
      const b1 = J.wrapPointer(body1, J.Body)
      const b2 = J.wrapPointer(body2, J.Body)
      const a = this.order[Number(b1.GetUserData()) - 1]
      const b = this.order[Number(b2.GetUserData()) - 1]
      if (a && b) {
        this.touching.set(a, b)
        this.touching.set(b, a)
      }
    }
    listener.OnContactAdded = (body1: number, body2: number, manifold: number, _settings: number) => {
      noteTouch(body1, body2)
      record(body1, body2, manifold)
    }
    listener.OnContactPersisted = (body1: number, body2: number, _manifold: number, _settings: number) => noteTouch(body1, body2)
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

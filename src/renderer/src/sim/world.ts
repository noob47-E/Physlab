// The bridge to Jolt. Everything the rest of PhysLab knows about the running simulation
// goes through this file, so the engine can later move into a worker without touching the UI.
//
// Rules kept here (they are easy to get wrong with a WebAssembly C++ API):
//  * every Jolt object we create is tracked and destroyed again (`track`);
//  * contact callbacks only record, they never change bodies (that happens after the step);
//  * `step()` hands back a plain Float32Array, so the renderer never touches Jolt objects.

import { loadJolt, type Jolt } from './jolt'
import { dragCoefficient, frontalArea, materialById, shapeVolume } from './materials'
import { pulleyRim, reachOf, ropeLayout, ropeLinkMass, ropeSegments } from './links'
import { eulerToQuat } from './rotate'
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

/**
 * How hard the hand may pull on a body of this mass. The flat 800 N cap made mass matter, but
 * it also made the default steel ball (514 kg) and wooden crate (151 kg) impossible to lift or
 * even to slide. The hand can now always beat the weight by half — a heavy thing rises slowly,
 * a light thing still flies — so nothing in the scene is beyond it.
 */
export const grabForceCap = (mass: number, gravity: number): number => Math.max(GRAB_MAX_FORCE, 1.5 * mass * gravity)

/** Shapes that roll, and so are slowed by rolling resistance rather than sliding friction. */
const ROLLING_SHAPES = new Set(['sphere', 'cylinder', 'capsule'])

/** A rope link's radius in metres. */
const ROPE_RADIUS = 0.02

interface Entry {
  def: BodyDef
  /** The Jolt Body itself: a stable pointer. A BodyID returned by value is a temporary
   *  and using it after the call that produced it crashes the WebAssembly heap. */
  body: InstanceType<Jolt['Body']>
  mass: number
}

type Body = InstanceType<Jolt['Body']>
type Constraint = InstanceType<Jolt['Constraint']>

/** A rope: its own small bodies and the joints between them. Not in `order`, never in the panel. */
interface Rope {
  bodies: Body[]
  constraints: Constraint[]
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
  /** Rods, strings, springs, pulleys, hinges and welds, by their id. */
  private links = new Map<string, Constraint>()
  /** Ropes, by their id. */
  private ropes = new Map<string, Rope>()
  private ropeCount = 0
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
    this.removeLinks()
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
    // Switching 2D on or off changes what a body is allowed to do, so rebuild them — keeping
    // the run where it is; ticking a box is not a Reset.
    if (patch.twoD !== undefined && patch.twoD !== before.twoD) this.rebuild(undefined, undefined, true)
    if (patch.allowSleeping !== undefined && patch.allowSleeping !== before.allowSleeping) this.rebuild(undefined, undefined, true)
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
    const moved = was.position.some((v, i) => v !== def.position[i])
    if (moved) this.setPosition(def.id, def.position)
    if (was.velocity.some((v, i) => v !== def.velocity[i])) this.setVelocity(def.id, def.velocity)
    // Rotation and spin were neither structural nor applied, so typing them did nothing at all.
    const turned = was.rotation.some((v, i) => v !== def.rotation[i])
    if (turned) this.setRotation(def.id, def.rotation)
    if (was.angularVelocity.some((v, i) => v !== def.angularVelocity[i])) this.setAngularVelocity(def.id, def.angularVelocity)
    e.def = def
    // A pulley bakes its wheel's rim into the constraint when the link is made, and a rope is a
    // chain laid between its two ends. Moving or turning the wheel, or moving an end, used to
    // leave that where it was: the rope was drawn over the moved wheel while both masses still
    // hung from the old rim. The links are laid again when one of them touches this body.
    const touches = (l: Link) => l.over === def.id || ((l.kind === 'pulley' || l.kind === 'rope') && (l.a === def.id || l.b === def.id))
    if ((moved || turned) && this.linkDefs.some(touches)) this.setLinks(this.linkDefs)
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
   * Rebuilds every connection. A rod, a string and a spring are Jolt distance constraints that
   * differ only in the range they allow and whether it is soft; a pulley is Jolt's own pulley
   * constraint; a hinge and a weld are what their names say; a rope is a chain of small bodies.
   *
   *  * a **rod** holds exactly its length, so it pushes as well as pulls;
   *  * a **string** allows anything from nothing up to its length, so it pulls when taut and
   *    goes slack otherwise — which is what makes a pendulum swing rather than orbit;
   *  * a **spring** holds its length through a soft limit of stiffness k, so F = kx and a mass
   *    on it oscillates with the period the textbook gives.
   */
  setLinks(links: Link[]): void {
    this.linkDefs = links
    this.removeLinks()
    for (const link of links) {
      const a = this.entries.get(link.a)
      const b = this.entries.get(link.b)
      if (!a || !b || a === b) continue
      switch (link.kind) {
        case 'rope':
          this.addRope(link, a, b)
          break
        case 'pulley':
          this.addPulley(link, a, b)
          break
        case 'hinge':
          this.addHinge(link, a, b)
          break
        case 'weld':
          this.addWeld(link, a, b)
          break
        default:
          this.addDistance(link, a, b)
      }
    }
  }

  private removeLinks(): void {
    for (const c of this.links.values()) this.physics.RemoveConstraint(c)
    this.links.clear()
    for (const rope of this.ropes.values()) {
      for (const c of rope.constraints) this.physics.RemoveConstraint(c)
      for (const body of rope.bodies) {
        const id = body.GetID()
        this.bodies.RemoveBody(id)
        this.bodies.DestroyBody(id)
      }
    }
    this.ropes.clear()
  }

  private addDistance(link: Link, a: Entry, b: Entry): void {
    const J = this.jolt as unknown as AnyJolt & Jolt
    const settings = this.track(new J.DistanceConstraintSettings())
    // The set_* methods, not plain assignment: the generated typings offer both, but only
    // these actually reach the C++ object. Assigning `settings.mPoint1 = …` left both
    // attachment points at the world origin, which pinned the bodies where they stood instead
    // of joining them — a pendulum that would not swing at all.
    // Attached at each body's own centre, in its own frame. Giving world-space points instead
    // leaves the constraint holding whatever positions the bodies happened to have when it was
    // made, which pinned them where they stood — a slack string held a ball in mid-air.
    settings.set_mSpace(J.EConstraintSpace_LocalToBodyCOM)
    settings.set_mPoint1(this.rv3([0, 0, 0]))
    settings.set_mPoint2(this.rv3([0, 0, 0]))
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
    // The settings and the points they hold are NOT released: Jolt's constraint keeps referring
    // to them, exactly as a ShapeSettings owns the shape it built — free them and the constraint
    // pins both bodies rigidly in place instead of joining them.
    this.addConstraint(link.id, settings.Create(a.body, b.body))
  }

  private addConstraint(id: string, c: Constraint): void {
    this.physics.AddConstraint(c)
    this.links.set(id, c)
  }

  /** Two bodies glued together exactly as they stand. */
  private addWeld(link: Link, a: Entry, b: Entry): void {
    const J = this.jolt as unknown as AnyJolt & Jolt
    const settings = this.track(new J.FixedConstraintSettings())
    settings.set_mSpace(J.EConstraintSpace_WorldSpace)
    settings.set_mAutoDetectPoint(true)
    this.addConstraint(link.id, settings.Create(a.body, b.body))
  }

  /** A pin through both bodies, turning about the z axis — a seesaw on its stand, a door on its post. */
  private addHinge(link: Link, a: Entry, b: Entry): void {
    const J = this.jolt as unknown as AnyJolt & Jolt
    const settings = this.track(new J.HingeConstraintSettings())
    settings.set_mSpace(J.EConstraintSpace_LocalToBodyCOM)
    settings.set_mPoint1(this.rv3(link.pivotA ?? [0, 0, 0]))
    settings.set_mPoint2(this.rv3(link.pivotB ?? [0, 0, 0]))
    settings.set_mHingeAxis1(this.v3([0, 0, 1]))
    settings.set_mHingeAxis2(this.v3([0, 0, 1]))
    settings.set_mNormalAxis1(this.v3([1, 0, 0]))
    settings.set_mNormalAxis2(this.v3([1, 0, 0]))
    this.addConstraint(link.id, settings.Create(a.body, b.body))
  }

  /**
   * A rope over a wheel: Jolt's pulley constraint keeps the two straight runs adding up to the
   * rope's length. The wheel itself is only a picture; the rim points are where the rope leaves it.
   */
  private addPulley(link: Link, a: Entry, b: Entry): void {
    const J = this.jolt as unknown as AnyJolt & Jolt
    const wheel = link.over ? this.entries.get(link.over) : undefined
    if (!wheel) return
    const { p1, p2 } = pulleyRim(wheel.def, this.positionOf(a), this.positionOf(b))
    const settings = this.track(new J.PulleyConstraintSettings())
    settings.set_mSpace(J.EConstraintSpace_LocalToBodyCOM)
    settings.set_mBodyPoint1(this.rv3([0, 0, 0]))
    settings.set_mBodyPoint2(this.rv3([0, 0, 0]))
    // The fixed points are always in world space, whatever mSpace says.
    settings.set_mFixedPoint1(this.rv3(p1))
    settings.set_mFixedPoint2(this.rv3(p2))
    settings.set_mRatio(1)
    settings.set_mMinLength(0)
    settings.set_mMaxLength(Math.max(0.05, link.length))
    this.addConstraint(link.id, settings.Create(a.body, b.body))
  }

  /**
   * A real rope: a chain of light capsules pinned end to end, tied to the surface of each body.
   * Neighbouring links are told not to collide with each other (they overlap at the joints), but
   * the rest of the rope still collides, so it can hang over a wheel or lie on the floor.
   */
  private addRope(link: Link, a: Entry, b: Entry): void {
    const J = this.jolt as unknown as AnyJolt & Jolt
    const pa = this.positionOf(a)
    const pb = this.positionOf(b)
    let dir: V3 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]]
    const span = Math.hypot(...dir)
    dir = span > 1e-6 ? [dir[0] / span, dir[1] / span, dir[2] / span] : [0, -1, 0]
    const reachA = reachOf(a.def)
    const reachB = reachOf(b.def)
    const start: V3 = [pa[0] + dir[0] * reachA, pa[1] + dir[1] * reachA, pa[2] + dir[2] * reachA]
    const end: V3 = [pb[0] - dir[0] * reachB, pb[1] - dir[1] * reachB, pb[2] - dir[2] * reachB]
    // The rope is as long as its definition says, not as long as the gap happens to be: a
    // longer rope hangs in a sag, a shorter one pulls the two ends together. The chain used to
    // be laid straight across the gap whatever length was typed, so editing L did nothing.
    const length = Math.max(0.1, link.length)
    const n = link.segments ?? ropeSegments(length)
    const joints = ropeLayout(start, end, length, n)
    const half = length / n / 2
    // The rope's weight is a fraction of its load (see ropeLinkMass): far lighter and the solver
    // loses the fight against the mass ratio and the rope stretches; far heavier and it drags the
    // load about.
    const loads = [a, b].filter((e) => e.def.motion === 'dynamic').map((e) => e.mass)
    const perLink = ropeLinkMass(loads, n)
    const filter = this.track(new J.GroupFilterTable(n))
    for (let i = 0; i + 1 < n; i++) filter.DisableCollision(i, i + 1)
    const group = this.ropeCount++
    const rope: Rope = { bodies: [], constraints: [] }

    for (let i = 0; i < n; i++) {
      const p = joints[i]
      const q = joints[i + 1]
      const centre: V3 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]
      // Each link stands along its own piece of the curve, so a sagging rope is laid sagging.
      let seg: V3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]]
      const len = Math.hypot(...seg)
      seg = len > 1e-9 ? [seg[0] / len, seg[1] / len, seg[2] / len] : dir
      const rot = this.quatFromY(seg)
      const shape = new J.CapsuleShape(Math.max(0.005, half - ROPE_RADIUS), ROPE_RADIUS) as unknown as InstanceType<Jolt['Shape']>
      const pos = this.rv3(centre)
      const settings = this.track(new J.BodyCreationSettings(shape, pos, rot, J.EMotionType_Dynamic, LAYER_MOVING))
      settings.mOverrideMassProperties = J.EOverrideMassProperties_CalculateInertia
      settings.mMassPropertiesOverride.mMass = perLink
      settings.mMotionQuality = J.EMotionQuality_LinearCast
      settings.mAllowSleeping = this.settings.allowSleeping
      settings.mLinearDamping = 0.05
      settings.mAngularDamping = 0.3
      settings.mFriction = 0.6
      if (this.settings.twoD) settings.mAllowedDOFs = J.EAllowedDOFs_Plane2D
      settings.set_mCollisionGroup(this.track(new J.CollisionGroup(filter, group, i)))
      // A chain is solved link by link, so it needs more solver passes than a lone box.
      settings.set_mNumPositionStepsOverride(10)
      settings.set_mNumVelocityStepsOverride(20)
      const body = this.bodies.CreateBody(settings)
      // User data 0: the contact listener maps user data to `order` and skips what it cannot find.
      body.SetUserData(0)
      this.bodies.AddBody(body.GetID(), J.EActivation_Activate)
      rope.bodies.push(body)
      this.release(settings)
      this.release(pos)
      this.release(rot)
    }

    const pin = (b1: Body, p1: V3, b2: Body, p2: V3) => {
      const s = this.track(new J.PointConstraintSettings())
      s.set_mSpace(J.EConstraintSpace_LocalToBodyCOM)
      s.set_mPoint1(this.rv3(p1))
      s.set_mPoint2(this.rv3(p2))
      const c = s.Create(b1, b2)
      this.physics.AddConstraint(c)
      rope.constraints.push(c)
    }
    pin(a.body, [dir[0] * reachA, dir[1] * reachA, dir[2] * reachA], rope.bodies[0], [0, -half, 0])
    for (let i = 0; i + 1 < n; i++) pin(rope.bodies[i], [0, half, 0], rope.bodies[i + 1], [0, -half, 0])
    pin(rope.bodies[n - 1], [0, half, 0], b.body, [-dir[0] * reachB, -dir[1] * reachB, -dir[2] * reachB])
    // The joints are solved one at a time, and against a load a hundred times heavier than a
    // link each pass moves the link and hardly the load: a hanging load stretched the chain a
    // few centimetres, and a chain shorter than the gap could not reel its load in at all, so
    // shortening a rope changed nothing. One straight string from end to end, no longer than the
    // rope, holds the length exactly. It does nothing while the rope hangs slack or bends round
    // something, and takes the load the moment the rope is straight.
    const cap = this.track(new J.DistanceConstraintSettings())
    cap.set_mSpace(J.EConstraintSpace_LocalToBodyCOM)
    cap.set_mPoint1(this.rv3([0, 0, 0]))
    cap.set_mPoint2(this.rv3([0, 0, 0]))
    cap.set_mMinDistance(0)
    cap.set_mMaxDistance(length + reachA + reachB)
    const straight = cap.Create(a.body, b.body)
    this.physics.AddConstraint(straight)
    rope.constraints.push(straight)
    this.ropes.set(link.id, rope)
  }

  /** The points a rope or pulley rope is drawn through, in world space. */
  linkPath(link: Link): V3[] {
    const a = this.entries.get(link.a)
    const b = this.entries.get(link.b)
    if (!a || !b) return []
    const pa = this.positionOf(a)
    const pb = this.positionOf(b)
    if (link.kind === 'pulley') {
      const wheel = link.over ? this.entries.get(link.over) : undefined
      if (!wheel) return [pa, pb]
      const { p1, p2 } = pulleyRim(wheel.def, pa, pb)
      return [pa, p1, p2, pb]
    }
    const rope = this.ropes.get(link.id)
    if (!rope) return [pa, pb]
    const pts: V3[] = [pa]
    for (const body of rope.bodies) {
      const p = body.GetPosition()
      pts.push([p.GetX(), p.GetY(), p.GetZ()])
    }
    pts.push(pb)
    return pts
  }

  private positionOf(e: Entry): V3 {
    const p = e.body.GetPosition()
    return [p.GetX(), p.GetY(), p.GetZ()]
  }

  /** The rotation that stands a capsule (whose axis is y) along `dir`. */
  private quatFromY(dir: V3) {
    const J = this.jolt as unknown as AnyJolt & Jolt
    const d = dir[1]
    if (d < -0.9999) return this.track(new J.Quat(1, 0, 0, 0))
    let x = dir[2]
    let y = 0
    let z = -dir[0]
    let w = 1 + d
    const n = Math.hypot(x, y, z, w) || 1
    x /= n
    y /= n
    z /= n
    w /= n
    return this.track(new J.Quat(x, y, z, w))
  }

  /**
   * Replace every body with its definition again (Reset, or a change that needs a rebuild).
   *
   * With `preserve`, bodies whose definition object is unchanged keep their live position,
   * velocity and the clock keeps counting: changing one crate's mass mid-run used to snap every
   * other object back to its start, which read as a Reset nobody had asked for.
   */
  rebuild(defs?: BodyDef[], links?: Link[], preserve = false): void {
    const list = defs ?? this.order.map((id) => this.entries.get(id)!.def)
    const joins = links ?? this.linkDefs
    const kept = new Map<BodyId, { def: BodyDef; state: BodyState }>()
    const time = this.time
    if (preserve) {
      for (const id of this.order) {
        const e = this.entries.get(id)
        const st = this.state(id)
        if (e && st) kept.set(id, { def: e.def, state: st })
      }
    }
    this.clear()
    for (const def of list) {
      this.addBody(def)
      const k = kept.get(def.id)
      if (k && k.def === def) this.placeState(def.id, k.state)
    }
    if (preserve) this.time = time
    // Constraints are built after the bodies, because each one needs both of them to exist.
    this.linkDefs = joins
    this.setLinks(joins)
  }

  /** Put a body exactly into a recorded state. */
  private placeState(id: BodyId, st: BodyState): void {
    const e = this.entries.get(id)
    if (!e) return
    const J = this.jolt as unknown as AnyJolt & Jolt
    const p = this.rv3(st.position)
    const q = this.track(new J.Quat(st.rotation[0], st.rotation[1], st.rotation[2], st.rotation[3]))
    const v = this.v3(st.velocity)
    const w = this.v3(st.angularVelocity)
    if (e.def.motion === 'dynamic') this.bodies.SetPositionRotationAndVelocity(e.body.GetID(), p, q, v, w)
    else this.bodies.SetPositionAndRotation(e.body.GetID(), p, q, J.EActivation_DontActivate)
    this.release(p)
    this.release(q)
    this.release(v)
    this.release(w)
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
      case 'pulley':
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
    // One formula for the engine and for anything that places a body-fixed point (a pulley's
    // rim), so the drawn rope and the solved rope leave the wheel at the same place.
    const [x, y, z, w] = eulerToQuat(deg)
    return this.track(new J.Quat(x, y, z, w))
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
    const rho = this.settings.airDensity
    for (const id of this.order) {
      const e = this.entries.get(id)!
      if (e.def.motion !== 'dynamic') continue
      const body = e.body
      // A body Jolt has put to sleep is skipped — except the one in the hand, which the grab
      // block below wakes. It used to be skipped too, so anything that had settled for a third
      // of a second could never be picked up again.
      if (!body.IsActive() && this.grabbed?.id !== id) continue

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
        // marble. A hand can only pull so hard, so the force is capped.
        const p = body.GetPosition()
        const v = body.GetLinearVelocity()
        const k = 60 * e.mass
        const c = 12 * e.mass
        let fx = k * (this.grabbed.target[0] - p.GetX()) - c * v.GetX()
        let fy = k * (this.grabbed.target[1] - p.GetY()) - c * v.GetY()
        let fz = k * (this.grabbed.target[2] - p.GetZ()) - c * v.GetZ()
        const pull = Math.hypot(fx, fy, fz)
        const cap = grabForceCap(e.mass, this.settings.gravity)
        if (pull > cap) {
          const s = cap / pull
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
    const e = this.entries.get(id)
    if (!e || e.def.motion !== 'dynamic') return
    this.grabbed = { id, target }
    this.bodies.ActivateBody(e.body.GetID())
  }

  /**
   * Put a body somewhere, at rest, whatever it was doing: arranging the scene while paused. A
   * static body (wall, ramp, floor) is moved the same way, and everything else is woken so a
   * ball asleep on a floor that has just moved notices.
   */
  placeBody(id: BodyId, position: V3): void {
    const e = this.entries.get(id)
    if (!e) return
    const J = this.jolt as unknown as AnyJolt & Jolt
    const p = this.rv3(position)
    const q = e.body.GetRotation()
    if (e.def.motion === 'dynamic') {
      const zero = this.v3([0, 0, 0])
      this.bodies.SetPositionRotationAndVelocity(e.body.GetID(), p, q, zero, zero)
      this.release(zero)
    } else {
      this.bodies.SetPositionAndRotation(e.body.GetID(), p, q, J.EActivation_DontActivate)
      this.wakeAll()
    }
    this.release(p)
  }

  setRotation(id: BodyId, degrees: V3): void {
    const e = this.entries.get(id)
    if (!e) return
    const J = this.jolt as unknown as AnyJolt & Jolt
    const q = this.quatFromEuler(degrees)
    this.bodies.SetPositionAndRotation(e.body.GetID(), e.body.GetPosition(), q, e.def.motion === 'dynamic' ? J.EActivation_Activate : J.EActivation_DontActivate)
    this.release(q)
    if (e.def.motion !== 'dynamic') this.wakeAll()
  }

  setAngularVelocity(id: BodyId, w: V3): void {
    const e = this.entries.get(id)
    if (!e || e.def.motion !== 'dynamic') return
    const v = this.v3(w)
    this.bodies.SetAngularVelocity(e.body.GetID(), v)
    this.bodies.ActivateBody(e.body.GetID())
    this.release(v)
  }

  /** Wake every moving body, after something they may be resting on has moved. */
  wakeAll(): void {
    for (const e of this.entries.values()) if (e.def.motion === 'dynamic') this.bodies.ActivateBody(e.body.GetID())
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

// The bridge to Jolt. Everything the rest of PhysLab knows about the running simulation
// goes through this file, so the engine can later move into a worker without touching the UI.
//
// Rules kept here (they are easy to get wrong with a WebAssembly C++ API):
//  * every Jolt object we create is tracked and destroyed again (`track`);
//  * contact callbacks only record, they never change bodies (that happens after the step);
//  * `step()` hands back a plain Float32Array, so the renderer never touches Jolt objects.

import { loadJolt, type Jolt } from './jolt'
import { dragCoefficient, frontalAreaTurned, materialById, shapeVolume } from './materials'
import { comOffset, linkDepths, linkTies, pulleyPartnerMove, pulleyRim, reachAlong, ropeLayout, ropeLinkMass, ropeSegments, toLocal } from './links'
import { eulerToQuat, rotateVec } from './rotate'
import type { Actuator, AfterStep, Driver, BodyDef, BodyId, BodyState, ContactEvent, Keyframe, Link, OwnForces, StepRate, StepWork, Touch, WorldSettings } from './types'
import { DEFAULT_STEP_RATE, DEFAULT_WORLD, rateOf } from './types'
import { REC_FLOATS, type RecordLayout } from './tape'
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

/**
 * How wide a floor must be, in both directions, to be the ground itself: an exact plane that runs
 * on for ever, not a slab with edges. The Sandbox draws its floor kilometres wide so it meets the
 * horizon, and as a box that size the engine worked out every contact against corners 5 km from
 * the origin in 32-bit numbers: a ball dropped straight down drifted a centimetre sideways. A plane
 * has no corners to be far from. A narrower floor is a box of the size typed, with an edge a ball
 * can roll off, exactly as before.
 */
export const PLANE_FLOOR_FROM = 1000

/** How far a plane floor reaches for the engine's broad phase, in metres each way: the drawn floor's own half-width. */
const PLANE_FLOOR_HALF_EXTENT = 5000

/** Whether this body is built as an engine plane: the fixed floor, wide enough to be the ground. */
export const isPlaneFloor = (def: BodyDef): boolean => def.shape === 'ground' && def.motion === 'static' && Math.min(def.size[0], def.size[2]) >= PLANE_FLOOR_FROM

/** The one empty list handed back for a body nothing is pushing. */
const NO_ACTUATORS: Actuator[] = []

const samePoses = (a: Float32Array, b: Float32Array): boolean => a.length === b.length && a.every((v, i) => v === b[i])

/**
 * The poses `alpha` of the way from `from` to `to` (0 to 1), into `out`: positions in a straight
 * line, rotations along the shorter way round (a quaternion and its negative are the same turn).
 */
function blendPoses(from: Float32Array, to: Float32Array, alpha: number, out: Float32Array): void {
  const a = Math.min(1, Math.max(0, alpha))
  for (let o = 0; o + STRIDE <= out.length; o += STRIDE) {
    for (let k = 0; k < 3; k++) out[o + k] = from[o + k] + (to[o + k] - from[o + k]) * a
    let dot = 0
    for (let k = 3; k < 7; k++) dot += from[o + k] * to[o + k]
    const sign = dot < 0 ? -1 : 1
    let n = 0
    for (let k = 3; k < 7; k++) {
      out[o + k] = from[o + k] * (1 - a) + to[o + k] * sign * a
      n += out[o + k] * out[o + k]
    }
    n = Math.sqrt(n) || 1
    for (let k = 3; k < 7; k++) out[o + k] /= n
  }
}

/**
 * A cone's collision hull: its apex, and its base as a ring of points on the circle it is drawn with
 * (radius a/2, as THREE.ConeGeometry, shapeVolume and the inertia all take it). It used to be four
 * corners at ±a/2: a pyramid whose corners stood 41 % past the drawn base (H17).
 */
export function coneHull(a: number, b: number, sides = 24): V3[] {
  const r = Math.max(0.01, a / 2)
  const hy = Math.max(0.01, b / 2)
  const ring = Array.from({ length: sides }, (_, i): V3 => [r * Math.cos((2 * Math.PI * i) / sides), -hy, r * Math.sin((2 * Math.PI * i) / sides)])
  return [[0, hy, 0], ...ring]
}

/**
 * The clock counts in ticks of 1/1200 s, a whole number of them per step at every rate (20, 10, 5
 * and 2 at 60, 120, 240 and 600). Time is ticks / 1200, the nearest double to the true time, so it
 * reads 2 exactly after 2·rate steps and stays exact across a change of rate part-way through a run.
 */
const TICKS_PER_SECOND = 1200

/**
 * Readings are taken ten times a simulated second, on t = 0, 0.1, 0.2 … of the simulation's own
 * clock (every 120 ticks), so a recorded run is a table on a grid and not a scatter of frame times.
 */
const READING_TICKS = 120

/**
 * The most simulated time one frame may gather, in seconds: a slow machine falls behind gracefully
 * instead of freezing while it tries to catch up. It is rate/20 steps at every rate.
 */
const MAX_GATHER_SECONDS = 0.05

/**
 * How near a whole step the gathered time must come for the step to be taken. Frame times are
 * sums of doubles: sixty frames of 1/60 s at 240 steps a second gather 3.9999999999999996 steps
 * as often as 4, and without the slack a frame would take three steps and the next five.
 * A millionth of a step is far above that rounding and far below anything a step can show.
 */
const STEP_SLACK = 1e-6

/**
 * The floors the engine puts under a spring's length and stiffness. They are the readout's too
 * (energy.ts `springStretch` and `springEnergyOf`), so the ½kx² on screen is the spring that acts.
 */
const SPRING_FLOOR = 0.01

/**
 * A Jolt vector's numbers, copied out. The WebAssembly binding returns a vector by value through
 * ONE object per getter, overwritten by the next call of that getter on any body: after
 * `p1 = a.GetPosition(); p2 = b.GetPosition()` both read b's position. Copy before calling again.
 */
const xyz = (v: { GetX(): number; GetY(): number; GetZ(): number }): V3 => [v.GetX(), v.GetY(), v.GetZ()]

/** One key for a pair of engine pointers, whichever order the engine names them in. */
const pairKey = (p: number, q: number): string => (p < q ? `${p}:${q}` : `${q}:${p}`)

const zeroForces = (): OwnForces => ({ drag: [0, 0, 0], push: [0, 0, 0], hand: [0, 0, 0], spring: [0, 0, 0], rollingTorque: [0, 0, 0] })
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const addInto = (to: V3, f: V3): void => {
  to[0] += f[0]
  to[1] += f[1]
  to[2] += f[2]
}

/**
 * What the engine saw of every moving body at one reading time. The Sandbox recorder is built
 * from these and never from the frame loop: a frame can span several steps and only the last
 * one's state is left to look at afterwards, so the frame loop cannot know what the world looked
 * like on the step a reading belongs to.
 */
export interface SimSample {
  /** The simulation clock at this reading: a multiple of 0.1 s, exact (a step count over the rate, not a running sum). */
  t: number
  /** Every moving (dynamic) body's state at that moment, by id. Floors, walls and ramps are not read. */
  states: Record<BodyId, BodyState>
}

/** How fast the knot damps a tied body's spin against its link, per second (SB61: about a twentieth of a second). */
const KNOT_DAMPING = 20
/** Below this spin against its link (rad/s) a tied body is taken to turn with it: float noise, not a wobble. */
const KNOT_DEAD_ZONE = 1e-3

/** The product a·b of two quaternions (x, y, z, w): b first, then a. */
function quatMul(a: [number, number, number, number], b: [number, number, number, number]): [number, number, number, number] {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz]
}

/** The shortest turn (a unit quaternion) that takes the unit vector `from` onto the unit vector `to`. */
function shortestArc(from: V3, to: V3): [number, number, number, number] {
  const c: V3 = [from[1] * to[2] - from[2] * to[1], from[2] * to[0] - from[0] * to[2], from[0] * to[1] - from[1] * to[0]]
  const w = 1 + from[0] * to[0] + from[1] * to[1] + from[2] * to[2]
  // Opposite ways: half a turn about any axis square to `from`.
  if (w < 1e-9) return Math.abs(from[0]) < 0.9 ? [0, -from[2], from[1], 0] : [from[1], -from[0], 0, 0]
  const l = Math.hypot(c[0], c[1], c[2], w)
  return [c[0] / l, c[1] / l, c[2] / l, w / l]
}

/** A hold point as Jolt's LocalToBodyCOM wants it: from the body's centre of mass (null: at the centre). */
function fromCom(def: BodyDef, offset: V3 | null): V3 {
  const c = comOffset(def)
  return offset ? [offset[0] - c[0], offset[1] - c[1], offset[2] - c[2]] : [0, 0, 0]
}

/** Where a body's tie point is now (its centre when there is none). Numbers copied out at once (see `xyz`). */
function tiePoint(body: InstanceType<Jolt['Body']>, tie: V3 | null): V3 {
  const p = xyz(body.GetPosition())
  if (!tie) return p
  const q = body.GetRotation()
  const w = rotateVec([q.GetX(), q.GetY(), q.GetZ(), q.GetW()], tie)
  return [p[0] + w[0], p[1] + w[1], p[2] + w[2]]
}

/** The speed of a body's material point at `at`: v + ω × (at − position). */
function pointVelocity(body: InstanceType<Jolt['Body']>, at: V3): V3 {
  const v = xyz(body.GetLinearVelocity())
  const w = xyz(body.GetAngularVelocity())
  const p = xyz(body.GetPosition())
  const r: V3 = [at[0] - p[0], at[1] - p[1], at[2] - p[2]]
  return [v[0] + w[1] * r[2] - w[2] * r[1], v[1] + w[2] * r[0] - w[0] * r[2], v[2] + w[0] * r[1] - w[1] * r[0]]
}

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

/** A spring PhysLab works out itself, before every step: F = k(L − L₀) + c·v_rel along the line of centres. */
interface OwnSpring {
  link: Link
  a: Entry
  b: Entry
  k: number
  c: number
  L0: number
  /** Where the spring holds each end (SB61): an offset from the body's position in its own frame, or null for its centre. */
  tieA: V3 | null
  tieB: V3 | null
}

/** What PhysLab pushed one body with during the step being taken, and where the body was before it. */
interface Applied {
  e: Entry
  before: V3
  f: OwnForces
  /** The damper's share of `f.spring`: the only part of a spring that does work (its Hooke part is ½kx²). */
  damper: V3
  /** The knot's damping torque (SB61): it takes out only a tied body's spin against its link; its work is the damper's. */
  knot: V3
}

type AfterStepListener = (w: SimWorld, s: AfterStep) => void
type BeforeStepListener = (w: SimWorld) => void

/**
 * What a keyframe holds besides its step, time and build (SB9): Jolt's own state (bodies, the
 * contact cache that warm-starts the next step, the joints' impulses, gravity and the last Δt) in a
 * recorder, and every piece of PhysLab's own state a step reads — the clock, the rate (and one still
 * waiting for the grid), the settings, who touches whom (rolling resistance), the hand, the last own
 * forces, the pushes, the own springs in their order, and each body's definition (its bounce,
 * friction and damping live in Jolt but are not part of Jolt's saved state).
 */
interface Saved {
  rec: InstanceType<Jolt['StateRecorderImpl']>
  rebuild: number
  steps: number
  ticks: number
  startRead: boolean
  rate: StepRate
  pendingRate: StepRate | null
  settings: WorldSettings
  touching: Map<BodyId, BodyId>
  grabbed: { id: BodyId; target: V3 } | null
  applied: { id: BodyId; before: V3; f: OwnForces; damper: V3; knot: V3 }[]
  actuators: Map<BodyId, Actuator[]>
  ownSprings: OwnSpring[]
  defs: BodyDef[]
}

const copyForces = (f: OwnForces): OwnForces => ({
  drag: [...f.drag],
  push: [...f.push],
  hand: [...f.hand],
  spring: [...f.spring],
  rollingTorque: [...f.rollingTorque]
})

/** Whether two values of a definition or a settings object are the same (arrays number by number). */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

/** Whether `patch` says anything `into` does not already say. */
function changes(into: object, patch: object): boolean {
  const was = into as Record<string, unknown>
  return Object.entries(patch).some(([key, v]) => !sameValue(was[key], v))
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
  /**
   * The poses before and after the last fixed step. A frame draws the pose between them, as far
   * along as the time it has gathered towards the next step (P13): at 0.1× a step falls due once in
   * ten frames, and drawing the last step's pose left a moving body still for nine frames and then
   * jumped it.
   */
  private prevPose = new Float32Array(0)
  private curPose = new Float32Array(0)
  private contacts: ContactEvent[] = []
  /** The collisions and touches the engine finds during the one step being taken. */
  private stepContacts: ContactEvent[] = []
  private stepTouches: Touch[] = []
  private settings: WorldSettings = { ...DEFAULT_WORLD }
  /** The step rate in force: `rateOf(settings)`, kept so a change of it can be noticed. */
  private rate: StepRate = DEFAULT_STEP_RATE
  /** Time gathered towards the next step, in steps (not seconds), so a whole step is exactly 1. */
  private accumulator = 0
  private grabbed: { id: BodyId; target: V3 } | null = null
  /** Who is touching what, refilled by the contact listener every step: body → the body under it. */
  private touching = new Map<BodyId, BodyId>()
  /** Rods, strings, pulleys, hinges, welds and the springs too stiff to work out ourselves, by their id. */
  private links = new Map<string, Constraint>()
  /** Springs PhysLab works out itself, and which way each spring link was built. */
  private ownSprings: OwnSpring[] = []
  private springKinds = new Map<string, 'own' | 'engine'>()
  /** PhysLab's forces on each body in the step being taken (after it: the last step), by body. */
  private applied = new Map<BodyId, Applied>()
  private listeners = new Set<AfterStepListener>()
  /** Called just before each engine step (`onBeforeStep`): where the tape (SB12) takes a run's first record. */
  private beforeListeners = new Set<BeforeStepListener>()
  /** Ropes, by their id. */
  private ropes = new Map<string, Rope>()
  /**
   * Every rope link with each of the two bodies its rope is tied to, as pairs of engine pointers the
   * contact validator refuses (`installContactListener`); the rope still meets everything else. The
   * end link's tip sits on the body's surface at the tie and a slack rope folds onto its load; left
   * to collide, the contact pushed link and load apart while the pins pulled them together, every
   * step: a pump that lifted the Crane's crate off its shortened rope, to 4.1 m in 6 s at 600 steps
   * a second, faster the finer the step.
   */
  private ropeTies = new Set<string>()
  private ropeCount = 0
  /** The definitions behind them, so a rebuild can put them back. */
  private linkDefs: Link[] = []
  /** Each body's distance in links from a fixed one (links.ts linkDepths): who a rod, string or spring hangs from. */
  private depths = new Map<string, number>()
  /**
   * Forces a question drives bodies with, by body. They belong to the experiment, not to one
   * run: a Reset rebuilds the bodies and must find the same push waiting at t = 0.
   */
  private actuators = new Map<BodyId, Actuator[]>()
  /** Kinematic bodies moved along a known path (SB60), by body id; set and cleared like the actuators. */
  private drivers = new Map<BodyId, Driver>()
  /**
   * Engine steps taken since the last reset. The clock is this count, not a running sum of 1/60:
   * six steps added up read 0.09999999999999999, so "is it past 0.1 s yet?" was false at step 6
   * and true only at step 7, and a hundred and twenty read 1.9999999999999978. A count over the
   * rate is the nearest number to the true time at every step.
   */
  private steps = 0
  /**
   * The clock in ticks of 1/1200 s (TICKS_PER_SECOND): the steps taken, each worth 1200/rate ticks
   * at the rate it was taken at. Equal to startTime + (stepIndex − startStep)/rate for the rate in
   * force since its start, and exact: the readings stay on the 0.1 s grid after a change of rate.
   * Counted per step from where the rate began, a change at t = 1/60 put them at 0.1167, 0.2167 …
   */
  private ticks = 0
  /** Whether this run's t = 0 reading has been handed out (see `step`). Reset with the step count. */
  private startRead = false
  /**
   * A rate asked for part-way through a run that the clock cannot yet land on the 0.1 s grid with:
   * the rate in force carries on until a step ends on the new rate's own grid (at most 1/60 s), so
   * every reading stays on k/10. One step at 600 and then 240 used to read at 122/1200 s.
   */
  private pendingRate: StepRate | null = null
  /** +1 on every change from outside the run (I-4): the recorder takes a keyframe after each one. */
  private inputs = 0
  /** +1 whenever the engine's bodies or joints are built again: a keyframe from before can never come back. */
  private rebuilds = 0
  /** The keyframes alive, with what each holds besides its step, time and build. */
  private keyframes = new Map<Keyframe, Saved>()
  /** The bodies a step record reads, in layout order (bodies, then rope links); made again after a rebuild. */
  private recBodies: Body[] | null = null
  /** True while the before- or after-step listeners run: a keyframe may be saved then, never restored. */
  private inHook = false

  /** Simulated time in seconds since the last reset: the ticks over 1200, the nearest number to it. */
  get time(): number {
    return this.ticks / TICKS_PER_SECOND
  }

  /** Engine steps a simulated second. */
  get stepRate(): StepRate {
    return this.rate
  }

  /** Engine steps taken since the last reset. */
  get stepIndex(): number {
    return this.steps
  }

  /**
   * Raised by every change made from outside the run (I-4): grab, moveGrab, release_, placeBody,
   * setVelocity, setPosition, setRotation, setAngularVelocity, an updateBody that changed something,
   * setWorldSettings that changed something other than slow motion, setActuators, setLinks, wakeAll,
   * addBody and removeBody. Stepping, reading and restoring a keyframe never raise it.
   */
  get inputSerial(): number {
    return this.inputs
  }

  /**
   * Raised whenever the engine's bodies or joints are built again (I-4): rebuild and Reset (clear),
   * and anything else that adds or removes an engine body or joint — addBody, removeBody, setLinks,
   * and a spring a new rate moves between PhysLab's force and the engine's. A keyframe from an
   * earlier build cannot be restored, so the step record's layout and the tape start again with it.
   */
  get rebuildSerial(): number {
    return this.rebuilds
  }

  private input(): void {
    this.inputs++
  }

  /** The engine's bodies or joints were built again: older keyframes are useless, so they are freed. */
  private restructured(): void {
    this.rebuilds++
    this.recBodies = null
    for (const k of [...this.keyframes.keys()]) this.freeKeyframe(k)
  }

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
    // A new scene starts with nothing pushing it; `clear()` alone keeps the actuators because
    // Reset goes through it too and must not lose them.
    world.actuators.clear()
    world.drivers.clear()
    // And nobody is listening to it yet: a listener belongs to the scene it was made for (Reset,
    // which is `clear()`, keeps them, as it keeps the pushes).
    world.listeners.clear()
    world.beforeListeners.clear()
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
    this.steps = 0
    this.ticks = 0
    this.startRead = false
    this.accumulator = 0
    this.contacts = []
    this.applied = new Map()
    this.grabbed = null
    // Who touched whom belongs to the run that just ended: kept, the first step after Reset gave
    // a spinning ball in mid-air one step of rolling torque from the floor it rolled on before.
    this.touching.clear()
    // At t = 0 every rate lands on the grid: one still waiting starts with the new run.
    if (this.pendingRate !== null) this.switchRate(this.pendingRate)
    this.restructured()
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
    // Slow motion is how the run is watched, not part of it (a keyframe leaves it as it is).
    if (changes(before, { ...patch, timeScale: before.timeScale })) this.input()
    this.settings = { ...before, ...patch }
    const rateChanged = this.applyWorldSettings()
    // Switching 2D on or off changes what a body is allowed to do, so rebuild them — keeping
    // the run where it is; ticking a box is not a Reset.
    if (patch.twoD !== undefined && patch.twoD !== before.twoD) this.rebuild(undefined, undefined, true)
    else if (patch.allowSleeping !== undefined && patch.allowSleeping !== before.allowSleeping) this.rebuild(undefined, undefined, true)
    // Whether a spring is stable worked out by us depends on the step, so a new rate decides again.
    else if (rateChanged) this.redecideSprings()
  }

  getWorldSettings(): WorldSettings {
    return { ...this.settings }
  }

  /** Puts the settings into the engine; says whether the step rate changed. */
  private applyWorldSettings(): boolean {
    const rateChanged = this.applyRate()
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
    return rateChanged
  }

  /**
   * Takes up the rate the settings ask for, and says whether it did. Part-way through a run the
   * clock carries on from where it is (it counts ticks, and only the ticks per step change), and the
   * time gathered towards the next step stays the same length of time. A rate whose steps cannot
   * land on the 0.1 s grid from the clock's tick waits (`pendingRate`): the rate in force takes the
   * few steps to the first tick the new rate can go on from, and `advance` switches there.
   */
  private applyRate(): boolean {
    const next = rateOf(this.settings)
    this.pendingRate = null
    if (next === this.rate) return false
    if (this.ticks % (TICKS_PER_SECOND / next) !== 0) {
      this.pendingRate = next
      return false
    }
    this.switchRate(next)
    return true
  }

  private switchRate(next: StepRate): void {
    this.accumulator *= next / this.rate
    this.rate = next
    this.pendingRate = null
  }

  /** Starts a rate waiting for the grid once the clock is on a tick its steps go on from (see `applyRate`). */
  private takeUpRate(): void {
    if (this.pendingRate === null || this.ticks % (TICKS_PER_SECOND / this.pendingRate) !== 0) return
    this.switchRate(this.pendingRate)
    // Whether each spring is stable worked out by us depends on the step, as in setWorldSettings.
    this.redecideSprings()
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
    this.input()
    this.restructured()
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
    // Any change at all is an input for the recorder (I-4); a definition handed back as it was is not.
    if (changes(was, def) || changes(def, was)) this.input()

    const body = e.body
    if (was.restitution !== def.restitution) body.SetRestitution(def.restitution)
    if (was.friction !== def.friction) body.SetFriction(def.friction)
    if (def.motion === 'dynamic') {
      const mp = body.GetMotionProperties()
      if (was.linearDamping !== def.linearDamping) mp.SetLinearDamping(def.linearDamping)
      if (was.angularDamping !== def.angularDamping) mp.SetAngularDamping(def.angularDamping)
    }
    // Position and velocity are only pushed when they really changed, so a body mid-flight is not
    // yanked back to the number sitting in the panel on every unrelated edit. Part-way through a
    // run they are a moving body's start, not where it is now: typing them changes where Reset
    // goes and the run carries on (H20, the owner's choice). A fixed body is where its numbers say.
    const startOnly = this.steps > 0 && def.motion === 'dynamic'
    const moved = !startOnly && was.position.some((v, i) => v !== def.position[i])
    if (moved) this.setPosition(def.id, def.position)
    // A fixed body moved by a typed number is the floor's only way to move now that a drag cannot
    // (owner, 2026-10-09): a ball asleep on it would hang where the floor had been, as placeBody
    // already knows.
    if (moved && def.motion !== 'dynamic') this.wakeAll()
    if (!startOnly && was.velocity.some((v, i) => v !== def.velocity[i])) this.setVelocity(def.id, def.velocity)
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
    this.input()
    this.restructured()
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
   *  * a **spring** is PhysLab's own Hooke force F = kx (plus its damper), worked out before every
   *    step (`addSpring`), so a mass on it oscillates with the period the textbook gives and keeps
   *    its energy; only a spring too stiff for the step is left to Jolt's soft limit.
   */
  setLinks(links: Link[]): void {
    this.input()
    this.restructured()
    this.linkDefs = links
    this.removeLinks()
    this.depths = linkDepths([...this.entries.values()].map((e) => e.def), links)
    for (const link of links) {
      const a = this.entries.get(link.a)
      const b = this.entries.get(link.b)
      if (!a || !b || a === b) continue
      // Between two ends that nothing pushes (fixed, or moved along a path: SB60's twins) a link has nothing to hold;
      // it is drawn, and Jolt is not asked to solve a joint it could only fight.
      if (a.def.motion !== 'dynamic' && b.def.motion !== 'dynamic') continue
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
        case 'spring':
          this.addSpring(link, a, b)
          break
        default:
          this.addDistance(link, a, b)
      }
    }
  }

  /**
   * Whether a spring link is PhysLab's own Hooke force ('own') or Jolt's soft spring ('engine');
   * null for a link that is not a spring, or not in the world.
   */
  springModel(linkId: string): 'own' | 'engine' | null {
    return this.springKinds.get(linkId) ?? null
  }

  /**
   * A spring as PhysLab's own force, unless it is too stiff for the step. Our force is worked out
   * from where the ends are at the start of each step and Jolt then moves them (semi-implicit
   * Euler): that keeps the energy in a band of ±ωΔt/2 with no drift, but only while ωΔt stays
   * below about 2. The rule asks for ω/rate < 1, with ω = √(k/μ) and μ the reduced mass of the two
   * moving ends (a body on a fixed post: its own mass). Stiffer than that, Jolt's soft spring is
   * built as it always was: it loses energy, but it cannot blow up.
   */
  private addSpring(link: Link, a: Entry, b: Entry): void {
    if (this.springKindAt(link, a, b) === 'engine') {
      this.addDistance(link, a, b)
      this.springKinds.set(link.id, 'engine')
      return
    }
    const k = Math.max(SPRING_FLOOR, link.stiffness)
    // Held at its tie points (SB61): the hanging end at the surface that faces the other, so it hangs from there and turns
    // with the spring. The rest length is the hold points' distance at the spring's natural length.
    const ties = linkTies(link, a.def, b.def, this.depths)
    this.ownSprings.push({ link, a, b, k, c: Math.max(0, link.damping), L0: Math.max(SPRING_FLOOR, ties.length), tieA: ties.a, tieB: ties.b })
    this.springKinds.set(link.id, 'own')
  }

  /** Which way a spring is built at the rate in force: ours while ω/rate < 1, the engine's beyond. */
  private springKindAt(link: Link, a: Entry, b: Entry): 'own' | 'engine' {
    const k = Math.max(SPRING_FLOOR, link.stiffness)
    const moving = [a, b].filter((e) => e.def.motion === 'dynamic')
    const mu = moving.length === 2 ? (a.mass * b.mass) / (a.mass + b.mass) : moving.length === 1 ? moving[0].mass : Infinity
    return Math.sqrt(k / mu) / this.rate >= 1 ? 'engine' : 'own'
  }

  /**
   * After a change of rate: each spring built the other way from what the new rate calls for is
   * built again, and nothing else is touched. A full `setLinks` would lay every rope again
   * straight from its ends, part-way through the run. A spring that stays as it was is left
   * exactly where it is — its own force in its place in the order, its engine joint unbuilt — so a
   * rate change that moves no spring changes nothing a keyframe holds (SB9).
   */
  private redecideSprings(): void {
    let rebuilt = false
    for (const link of this.linkDefs) {
      const was = this.springKinds.get(link.id)
      if (link.kind !== 'spring' || !was) continue
      const a = this.entries.get(link.a)
      const b = this.entries.get(link.b)
      if (!a || !b || this.springKindAt(link, a, b) === was) continue
      if (was === 'engine') {
        const c = this.links.get(link.id)
        if (c) this.physics.RemoveConstraint(c)
        this.links.delete(link.id)
      } else this.ownSprings = this.ownSprings.filter((s) => s.link.id !== link.id)
      this.springKinds.delete(link.id)
      this.addSpring(link, a, b)
      rebuilt = true
    }
    // An engine joint came or went: keyframes from before cannot be restored over it.
    if (rebuilt) this.restructured()
  }

  private removeLinks(): void {
    this.ownSprings = []
    this.springKinds.clear()
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
    this.ropeTies.clear()
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
    // SB61: a rod with a fixed end to hang from is a ball joint there, so its other end turns with it (addRodPin). A
    // string, a rod between two free bodies and a stiff spring hold the hanging end at its surface tie point (links.ts
    // linkTies): it hangs from there and turns with the link, where held at its centre it kept facing one way.
    const ties = linkTies(link, a.def, b.def, this.depths)
    if (link.kind === 'rod' && ties.parent) {
      this.release(settings)
      this.addRodPin(link, ties.parent === 'a' ? a : b, ties.parent === 'a' ? b : a)
      return
    }
    settings.set_mSpace(J.EConstraintSpace_LocalToBodyCOM)
    const p1 = this.rv3(fromCom(a.def, ties.a))
    const p2 = this.rv3(fromCom(b.def, ties.b))
    settings.set_mPoint1(p1)
    settings.set_mPoint2(p2)
    const L = ties.length
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
    this.addConstraint(link.id, settings.Create(a.body, b.body))
    this.made(settings, p1, p2)
  }

  private addConstraint(id: string, c: Constraint): void {
    this.physics.AddConstraint(c)
    this.links.set(id, c)
  }

  /**
   * A rod hanging from `parent` (SB61): a ball joint at the parent's centre, held by the child at the point of its own frame
   * that lies the rod's length towards the parent. The two centres stay the rod's length apart, as before, and the child
   * turns exactly with the rod, like a bob on a real rod.
   */
  private addRodPin(link: Link, parent: Entry, child: Entry): void {
    const J = this.jolt as unknown as AnyJolt & Jolt
    const pp = parent.def.position
    const pc = child.def.position
    let dir: V3 = [pp[0] - pc[0], pp[1] - pc[1], pp[2] - pc[2]]
    const span = Math.hypot(...dir)
    dir = span > 1e-9 ? [dir[0] / span, dir[1] / span, dir[2] / span] : [0, 1, 0]
    const L = Math.max(0.01, link.length)
    const local = toLocal(child.def.rotation, dir)
    const s = this.track(new J.PointConstraintSettings())
    s.set_mSpace(J.EConstraintSpace_LocalToBodyCOM)
    const v1 = this.rv3(fromCom(parent.def, null))
    const v2 = this.rv3(fromCom(child.def, [local[0] * L, local[1] * L, local[2] * L]))
    s.set_mPoint1(v1)
    s.set_mPoint2(v2)
    this.addConstraint(link.id, s.Create(parent.body, child.body))
    this.made(s, v1, v2)
  }

  /**
   * Frees a joint's settings, and the vectors put into them, once the joint is made. A Jolt joint
   * copies what it needs from its settings when it is created (Jolt's own samples build them on the
   * stack), and the setters copy each vector in. They used to be kept for good, in the belief that
   * the joint went on reading them: every setLinks — a rope end dragged, a length typed — left them
   * behind, 61 engine objects for one each of rod, string, hinge, weld, stiff spring, pulley and an
   * 8-link rope (SB9). A rod, a string, a hinge and a pulley still swing exactly as before (goldens).
   */
  private made(...objs: unknown[]): void {
    for (const o of objs) this.release(o)
  }

  /** Two bodies glued together exactly as they stand. */
  private addWeld(link: Link, a: Entry, b: Entry): void {
    const J = this.jolt as unknown as AnyJolt & Jolt
    const settings = this.track(new J.FixedConstraintSettings())
    settings.set_mSpace(J.EConstraintSpace_WorldSpace)
    settings.set_mAutoDetectPoint(true)
    this.addConstraint(link.id, settings.Create(a.body, b.body))
    this.made(settings)
  }

  /** A pin through both bodies, turning about the z axis — a seesaw on its stand, a door on its post. */
  private addHinge(link: Link, a: Entry, b: Entry): void {
    const J = this.jolt as unknown as AnyJolt & Jolt
    const settings = this.track(new J.HingeConstraintSettings())
    settings.set_mSpace(J.EConstraintSpace_LocalToBodyCOM)
    const vs = [this.rv3(link.pivotA ?? [0, 0, 0]), this.rv3(link.pivotB ?? [0, 0, 0]), this.v3([0, 0, 1]), this.v3([0, 0, 1]), this.v3([1, 0, 0]), this.v3([1, 0, 0])] as const
    settings.set_mPoint1(vs[0])
    settings.set_mPoint2(vs[1])
    settings.set_mHingeAxis1(vs[2])
    settings.set_mHingeAxis2(vs[3])
    settings.set_mNormalAxis1(vs[4])
    settings.set_mNormalAxis2(vs[5])
    this.addConstraint(link.id, settings.Create(a.body, b.body))
    this.made(settings, ...vs)
  }

  /**
   * A rope over a wheel: Jolt's pulley constraint keeps the two straight runs adding up to the
   * rope's length. The wheel itself is only a picture; the rim points are where the rope leaves it.
   */
  private addPulley(link: Link, a: Entry, b: Entry): void {
    const J = this.jolt as unknown as AnyJolt & Jolt
    const wheel = link.over ? this.entries.get(link.over) : undefined
    if (!wheel) return
    // The wheel where it is now: placed or dragged since it was made, its rim moved with it.
    const { p1, p2 } = pulleyRim({ ...wheel.def, position: this.positionOf(wheel) }, this.positionOf(a), this.positionOf(b))
    const settings = this.track(new J.PulleyConstraintSettings())
    settings.set_mSpace(J.EConstraintSpace_LocalToBodyCOM)
    // The fixed points are always in world space, whatever mSpace says.
    const vs = [this.rv3([0, 0, 0]), this.rv3([0, 0, 0]), this.rv3(p1), this.rv3(p2)] as const
    settings.set_mBodyPoint1(vs[0])
    settings.set_mBodyPoint2(vs[1])
    settings.set_mFixedPoint1(vs[2])
    settings.set_mFixedPoint2(vs[3])
    settings.set_mRatio(1)
    settings.set_mMinLength(0)
    settings.set_mMaxLength(Math.max(0.05, link.length))
    this.addConstraint(link.id, settings.Create(a.body, b.body))
    this.made(settings, ...vs)
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
    const negDir: V3 = [-dir[0], -dir[1], -dir[2]]
    const reachA = reachAlong(a.def, dir)
    const reachB = reachAlong(b.def, negDir)
    const localA = toLocal(a.def.rotation, dir)
    const localB = toLocal(b.def.rotation, negDir)
    const start: V3 = [pa[0] + dir[0] * reachA, pa[1] + dir[1] * reachA, pa[2] + dir[2] * reachA]
    const end: V3 = [pb[0] - dir[0] * reachB, pb[1] - dir[1] * reachB, pb[2] - dir[2] * reachB]
    // The rope is as long as its definition says, not as long as the gap happens to be: a
    // longer rope hangs in a sag, a shorter one pulls the two ends together. The chain used to
    // be laid straight across the gap whatever length was typed, so editing L did nothing.
    const length = Math.max(0.1, link.length)
    const n = link.segments ?? ropeSegments(length)
    // A joint laid inside the floor stays there: nothing pushes a link out once it is in.
    const top = this.groundTop()
    const joints = ropeLayout(start, end, length, n, top === undefined ? undefined : top + ROPE_RADIUS)
    const half = length / n / 2
    // The rope's weight is a fraction of its load (see ropeLinkMass): far lighter and the solver
    // loses the fight against the mass ratio and the rope stretches; far heavier and it drags the
    // load about.
    const loads = [a, b].filter((e) => e.def.motion === 'dynamic').map((e) => e.mass)
    const perLink = ropeLinkMass(loads, n)
    // Not tracked: the filter is reference counted, held by each link's collision group, and Jolt
    // frees it with the last link (SB9). Destroying it by hand as well would free it twice.
    const filter = new J.GroupFilterTable(n)
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
      const collisionGroup = this.track(new J.CollisionGroup(filter, group, i))
      settings.set_mCollisionGroup(collisionGroup)
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
      // The body holds its own copy of the group (and with it a hold on the filter) now.
      this.release(collisionGroup)
    }

    const pin = (b1: Body, p1: V3, b2: Body, p2: V3) => {
      const s = this.track(new J.PointConstraintSettings())
      s.set_mSpace(J.EConstraintSpace_LocalToBodyCOM)
      const v1 = this.rv3(p1)
      const v2 = this.rv3(p2)
      s.set_mPoint1(v1)
      s.set_mPoint2(v2)
      const c = s.Create(b1, b2)
      this.physics.AddConstraint(c)
      rope.constraints.push(c)
      this.made(s, v1, v2)
    }
    // A moving end is FIXED to its end link (SB61): it turns with the rope. On a ball joint the Rope swing's bob spun on
    // its tie at up to 4.5 rad/s. A fixed end (a beam) keeps the ball joint, so the rope hangs from it freely.
    const fix = (body: Body, bead: Body) => {
      const s = this.track(new J.FixedConstraintSettings())
      s.set_mSpace(J.EConstraintSpace_WorldSpace)
      s.set_mAutoDetectPoint(true)
      const c = s.Create(body, bead)
      this.physics.AddConstraint(c)
      rope.constraints.push(c)
      this.made(s)
    }
    // Only a body the rope HANGS from something fixed by: a rope between two free bodies (the tug's crates) keeps its ball
    // joints, so it pulls exactly as before (fixed ends made its slack snap 12 % harder).
    const hangs = (e: Entry) => e.def.motion === 'dynamic' && Number.isFinite(this.depths.get(e.def.id) ?? Infinity)
    if (hangs(a)) fix(a.body, rope.bodies[0])
    else pin(a.body, [localA[0] * reachA, localA[1] * reachA, localA[2] * reachA], rope.bodies[0], [0, -half, 0])
    for (const link of rope.bodies) for (const end of [a.body, b.body]) this.ropeTies.add(pairKey(J.getPointer(end), J.getPointer(link)))
    for (let i = 0; i + 1 < n; i++) pin(rope.bodies[i], [0, half, 0], rope.bodies[i + 1], [0, -half, 0])
    if (hangs(b)) fix(b.body, rope.bodies[n - 1])
    else pin(rope.bodies[n - 1], [0, half, 0], b.body, [localB[0] * reachB, localB[1] * reachB, localB[2] * reachB])
    // The joints are solved one at a time, and against a load a hundred times heavier than a
    // link each pass moves the link and hardly the load: a hanging load stretched the chain a
    // few centimetres, and a chain shorter than the gap could not reel its load in at all, so
    // shortening a rope changed nothing. One straight string from end to end, no longer than the
    // rope, holds the length exactly. It does nothing while the rope hangs slack or bends round
    // something, and takes the load the moment the rope is straight.
    const cap = this.track(new J.DistanceConstraintSettings())
    cap.set_mSpace(J.EConstraintSpace_LocalToBodyCOM)
    const c1 = this.rv3([0, 0, 0])
    const c2 = this.rv3([0, 0, 0])
    cap.set_mPoint1(c1)
    cap.set_mPoint2(c2)
    cap.set_mMinDistance(0)
    cap.set_mMaxDistance(length + reachA + reachB)
    const straight = cap.Create(a.body, b.body)
    this.physics.AddConstraint(straight)
    rope.constraints.push(straight)
    this.made(cap, c1, c2)
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

  /** The top of the floor, where it is now, or undefined when the scene has no floor. */
  private groundTop(): number | undefined {
    for (const e of this.entries.values()) if (e.def.shape === 'ground') return this.positionOf(e)[1] + e.def.size[1] / 2
    return undefined
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
   * other object back to its start, which read as a Reset nobody had asked for. Part-way through a
   * run the changed body keeps its place and speed too (H20, the owner's choice): it alone went
   * back to its start. Before the run, and for a body that was fixed, the definition is the place.
   */
  rebuild(defs?: BodyDef[], links?: Link[], preserve = false): void {
    const list = defs ?? this.order.map((id) => this.entries.get(id)!.def)
    const joins = links ?? this.linkDefs
    const kept = new Map<BodyId, { def: BodyDef; state: BodyState }>()
    // The clock is the step count, so these two are what "the clock keeps counting" means: with
    // them restored the run goes on from the same step, on the same grid, with no second t = 0.
    const steps = this.steps
    const ticks = this.ticks
    const startRead = this.startRead
    // The time gathered towards the next step too: dropped, every mid-run edit lost up to a step.
    const accumulator = this.accumulator
    // And the rate the run is at, with one still waiting for the grid (clear() would take it up at t = 0).
    const rate = this.rate
    const pendingRate = this.pendingRate
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
      if (k && (k.def === def || (steps > 0 && k.def.motion === 'dynamic'))) this.placeState(def.id, k.state)
    }
    if (preserve) {
      this.steps = steps
      this.ticks = ticks
      this.startRead = startRead
      this.accumulator = accumulator
      this.rate = rate
      this.pendingRate = pendingRate
    }
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
    if (isPlaneFloor(def)) {
      // The floor's top face, where the box's top was: the slab's centre is the body's position, so
      // its top is half the thickness above it in the body's own frame. The plane's solid side is
      // the one the normal points away from, so the normal is up and the constant is minus that height.
      const up = this.v3([0, 1, 0])
      const plane = this.track(new J.Plane(up, -min(b / 2)))
      const half = Math.max(PLANE_FLOOR_HALF_EXTENT, Math.max(a, c) / 2)
      // The material is passed as null, not left out: the binding reads an omitted argument as "use the
      // defaults" and drops the half-extent after it, which left the floor 1 km wide and a ball
      // 1 km from the origin fell through it.
      const shape = new J.PlaneShape(plane, null as unknown as undefined, half)
      this.release(plane)
      this.release(up)
      return { shape: cast(shape), settings: null }
    }
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
        : coneHull(a, b)
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
   * Advances the world by up to `dt` real seconds (scaled by the slow-motion setting) in engine
   * steps of 1/rate s, and returns the new positions. The time gathered is clamped to 0.05 s of
   * simulated time, so a slow machine falls behind gracefully instead of freezing.
   *
   * It also hands back the readings the recorder is made of: one every rate/10 steps (see
   * `SimSample`), and the t = 0 one before the first step of a run. They are taken here, inside
   * the loop, because that is the only place the state at those steps exists; they are named by the
   * step count, so they land on 0, 0.1, 0.2 … whatever the frame rate or the slow-motion setting.
   * Most calls return none.
   */
  step(dt: number): { transforms: Float32Array; contacts: ContactEvent[]; samples: SimSample[] } {
    this.accumulator = Math.min(this.accumulator + dt * this.settings.timeScale * this.rate, Math.round(this.rate * MAX_GATHER_SECONDS))
    return this.advance(dt > 0)
  }

  /**
   * Exactly one engine step of 1/rate s, whatever the time scale: the Sandbox's Step button.
   * Through step() a frame of 1/60 s in slow motion was a tenth of a step, and nothing moved.
   */
  stepOnce(): { transforms: Float32Array; contacts: ContactEvent[]; samples: SimSample[] } {
    // Before the one step is gathered, so that step is taken at the rate it starts (see `advance`).
    this.takeUpRate()
    this.accumulator = 1
    const out = this.advance(true)
    // Nothing gathered towards a next step: the pose drawn is the one the step reached.
    this.prevPose.set(this.curPose)
    this.transforms.set(this.curPose)
    return out
  }

  /**
   * Calls `fn` after every engine step with what the step did (I-2): its number, the clock, Δt,
   * the work PhysLab's own forces did, the collisions found, and — only while someone listens —
   * every touch. It reads; it must never move or change a body. Hands back the way to stop.
   */
  onAfterStep(fn: AfterStepListener): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  /**
   * Calls `fn` just before every engine step, with the world as that step will start from it
   * (`stepIndex` and `time` not yet moved on), before PhysLab's own forces are worked out. The
   * tape (SB12) takes a new recording's first record and keyframe here: a run's untouched start
   * is only there before its first step, and Reset rebuilds the world where the tape cannot see
   * it. Like the after-step hook it reads: a keyframe may be saved, a restore is refused. Hands
   * back the way to stop.
   */
  onBeforeStep(fn: BeforeStepListener): () => void {
    this.beforeListeners.add(fn)
    return () => {
      this.beforeListeners.delete(fn)
    }
  }

  private beforeStepHook(): void {
    this.inHook = true
    try {
      for (const fn of this.beforeListeners) fn(this)
    } finally {
      this.inHook = false
    }
  }

  /** PhysLab's forces on a body in the last step taken: zeros for one nothing pushed, null for no such body. */
  ownForces(id: BodyId): OwnForces | null {
    if (!this.entries.has(id)) return null
    return this.applied.get(id)?.f ?? zeroForces()
  }

  /** Runs the steps the accumulator holds; `running` is whether time is going (not a paused redraw). */
  private advance(running: boolean): { transforms: Float32Array; contacts: ContactEvent[]; samples: SimSample[] } {
    this.contacts = []
    const samples: SimSample[] = []
    // The run's first reading is the untouched start. A paused frame calls step(0) every frame, so
    // `dt > 0` is what says the run is going, and the flag keeps it to one per run; `steps === 0`
    // is the guard that the start is never a state some steps have already moved.
    if (running && !this.startRead && this.steps === 0) {
      this.startRead = true
      samples.push(this.snapshot())
    }
    const size = this.order.length * STRIDE
    if (this.curPose.length !== size) {
      // Bodies were added or taken away: start the blend afresh from where everything is.
      this.curPose = new Float32Array(size)
      this.prevPose = new Float32Array(size)
      this.readPoses(this.curPose)
      this.prevPose.set(this.curPose)
    }
    let stepped = false
    // A rate still waiting although the clock is on its grid (a keyframe saved from the after-step
    // hook on the very step it could start) starts before the next step, as it did in the run saved.
    this.takeUpRate()
    while (this.accumulator >= 1 - STEP_SLACK) {
      // Before the own forces below: a keyframe saved here must not hold this step's forces too.
      if (this.beforeListeners.size > 0) this.beforeStepHook()
      const dt = 1 / this.rate
      // PhysLab's own forces, worked out from where everything is now, before EVERY engine step:
      // held over Jolt's collision sub-steps (the old Step(1/60, n)) a stiff force pumped energy
      // in — an own spring grew from 9.0 J to 33.1 J in ten swings.
      // beforeStep reads the contacts the last step found; the listener refills them during Step.
      this.beforeStep(dt)
      this.touching.clear()
      this.stepContacts = []
      this.stepTouches = []
      // Before the last step of this call: that pose is where the drawn blend starts.
      if (this.accumulator - 1 < 1 - STEP_SLACK) this.readPoses(this.prevPose)
      // One collision step: a sub-step would run on the forces above without working them out again.
      this.joltInterface.Step(dt, 1)
      stepped = true
      this.accumulator -= 1
      const before = this.ticks
      this.steps += 1
      this.ticks += TICKS_PER_SECOND / this.rate
      this.landDrivers()
      this.afterStep(dt)
      // On the step that reaches the next 0.1 s, which is exactly on it: the steps land there at one
      // rate, and a change of rate waits until its steps can (`applyRate`).
      if (Math.floor(this.ticks / READING_TICKS) > Math.floor(before / READING_TICKS)) samples.push(this.snapshot())
      this.takeUpRate()
    }
    // A step can be taken a millionth early (STEP_SLACK); what it overdrew is not owed to the next.
    if (this.accumulator < 0) this.accumulator = 0
    // The engine's own pose now. With no step taken, a pose that differs from the last step's was
    // put there from outside (a drag, a placed body, an edit): draw it where it is at once.
    this.readPoses(this.transforms)
    if (stepped) this.curPose.set(this.transforms)
    else if (!samePoses(this.transforms, this.curPose)) {
      this.curPose.set(this.transforms)
      this.prevPose.set(this.transforms)
    }
    blendPoses(this.prevPose, this.curPose, this.accumulator, this.transforms)
    return { transforms: this.transforms, contacts: this.contacts, samples }
  }

  /**
   * After an engine step: the speeds each new contact left its bodies with, and — for whoever
   * listens — the work PhysLab's forces did and the step's contacts and touches. Reads only.
   */
  private afterStep(dt: number): void {
    for (const c of this.stepContacts) {
      c.vAfterA = this.velocityOf(c.a)
      c.vAfterB = this.velocityOf(c.b)
    }
    if (this.listeners.size === 0) return
    const work: StepWork = { drag: 0, rolling: 0, push: 0, hand: 0, damper: 0 }
    for (const a of this.applied.values()) {
      // W = F·Δx over the step, with the force PhysLab applied and the step Jolt took.
      const p = a.e.body.GetPosition()
      const dx: V3 = [p.GetX() - a.before[0], p.GetY() - a.before[1], p.GetZ() - a.before[2]]
      work.drag += dot(a.f.drag, dx)
      work.push += dot(a.f.push, dx)
      work.hand += dot(a.f.hand, dx)
      work.damper += dot(a.damper, dx)
      const t = a.f.rollingTorque
      if (t[0] !== 0 || t[1] !== 0 || t[2] !== 0) {
        const w = a.e.body.GetAngularVelocity()
        work.rolling += (t[0] * w.GetX() + t[1] * w.GetY() + t[2] * w.GetZ()) * dt
      }
      const k = a.knot
      if (k[0] !== 0 || k[1] !== 0 || k[2] !== 0) {
        const w = a.e.body.GetAngularVelocity()
        work.damper += (k[0] * w.GetX() + k[1] * w.GetY() + k[2] * w.GetZ()) * dt
      }
    }
    const s: AfterStep = { step: this.steps, time: this.time, dt, work, contacts: this.stepContacts, touches: this.stepTouches }
    this.inHook = true
    try {
      for (const fn of this.listeners) fn(this, s)
    } finally {
      this.inHook = false
    }
  }

  private velocityOf(id: BodyId): V3 {
    const e = this.entries.get(id)
    if (!e) return [0, 0, 0]
    const v = e.body.GetLinearVelocity()
    return [v.GetX(), v.GetY(), v.GetZ()]
  }

  /**
   * The state of every moving body at this step, labelled with the clock. It only reads: no body is
   * moved or created, so it is safe inside the step loop.
   */
  private snapshot(): SimSample {
    const states: Record<BodyId, BodyState> = {}
    for (const id of this.order) {
      if (this.entries.get(id)?.def.motion !== 'dynamic') continue
      const st = this.state(id)
      if (st) states[id] = st
    }
    return { t: this.time, states }
  }

  /**
   * Forces a question applies while the run plays, replacing whatever was set before. They are
   * kept by body id, so a body the list names that is not in the scene is simply never pushed,
   * and a Reset that rebuilds the bodies finds the same pushes waiting.
   */
  setActuators(list: Actuator[]): void {
    this.input()
    this.actuators.clear()
    for (const a of list) {
      const mine = this.actuators.get(a.bodyId)
      if (mine) mine.push(a)
      else this.actuators.set(a.bodyId, [a])
    }
  }

  /**
   * Kinematic bodies that follow a known path (SB60), replacing whatever was set before. Kept by body id like the
   * actuators, so a Reset finds them waiting; a body named that is not in the scene, or is not kinematic, is left alone.
   */
  setDrivers(list: Driver[]): void {
    this.input()
    this.drivers.clear()
    for (const d of list) this.drivers.set(d.bodyId, d)
  }

  /** The driven bodies steered towards where their path has them at the end of the coming step. */
  private steerDrivers(dt: number): void {
    if (this.drivers.size === 0) return
    const t = (this.ticks + TICKS_PER_SECOND / this.rate) / TICKS_PER_SECOND
    for (const [id, d] of this.drivers) {
      const e = this.entries.get(id)
      if (!e || e.def.motion !== 'kinematic') continue
      const goal = d.at(t)
      const q = goal.rotation ?? (() => { const r = e.body.GetRotation(); return [r.GetX(), r.GetY(), r.GetZ(), r.GetW()] as [number, number, number, number] })()
      const J = this.jolt as unknown as AnyJolt & Jolt
      this.bodies.MoveKinematic(e.body.GetID(), this.rv3(goal.position), this.track(new J.Quat(q[0], q[1], q[2], q[3])), dt)
    }
  }

  /**
   * After the step: each driven body put exactly on its path, with the path's own velocity. Jolt's move leaves it at the
   * chord's average speed and a rounding off the point; the readings (energy, the gap between the twins) want the path.
   */
  private landDrivers(): void {
    if (this.drivers.size === 0) return
    const J = this.jolt as unknown as AnyJolt & Jolt
    for (const [id, d] of this.drivers) {
      const e = this.entries.get(id)
      if (!e || e.def.motion !== 'kinematic') continue
      const goal = d.at(this.time)
      const q = goal.rotation ? this.track(new J.Quat(goal.rotation[0], goal.rotation[1], goal.rotation[2], goal.rotation[3])) : e.body.GetRotation()
      this.bodies.SetPositionAndRotation(e.body.GetID(), this.rv3(goal.position), q, J.EActivation_DontActivate)
      this.bodies.SetLinearVelocity(e.body.GetID(), this.v3(goal.velocity))
    }
  }

  /** The pushes on one body that are switched on during the step that starts now and lasts dt. */
  private activeActuators(id: BodyId, dt: number): Actuator[] {
    const mine = this.actuators.get(id)
    // Every step for every body: the ordinary case, no actuator at all, must not allocate anything.
    if (!mine) return NO_ACTUATORS
    // The window is judged at the middle of the step, not its start. The clock used to be a
    // running sum of 1/60, which at a nominal 2 s read 1.9999999999999978, and a window "from 1 s
    // to 2 s" judged on the raw reading acted for 61 steps while "2 s to 3 s" got 59: a question
    // saying 3 N for one second read 3.05 m/s in the panel. The clock is now a step count and
    // exact, but a window's edges are typed or imported numbers (0.1 + 0.2 is 0.30000000000000004),
    // so the middle is still the safe place to judge: a step whose midpoint lies inside the
    // window is half a step from either edge, further than any rounding can drift.
    const t = this.time + dt / 2
    return mine.filter((a) => a.from <= t && t < a.until)
  }

  /** This step's record of what PhysLab pushes one body with, made the first time it is pushed. */
  private appliedTo(id: BodyId, e: Entry): Applied {
    let a = this.applied.get(id)
    if (!a) {
      const p = e.body.GetPosition()
      a = { e, before: [p.GetX(), p.GetY(), p.GetZ()], f: zeroForces(), damper: [0, 0, 0], knot: [0, 0, 0] }
      this.applied.set(id, a)
    }
    return a
  }

  /** Hands a force to Jolt for the coming step. */
  private push(body: Body, f: V3): void {
    const force = this.v3(f)
    body.AddForce(force)
    this.release(force)
  }

  /** A force at a world point: it turns the body as well as moving it (a spring held at its tie, SB61). */
  private pushAt(body: Body, f: V3, at: V3): void {
    const force = this.v3(f)
    const point = this.rv3(at)
    body.AddForce(force, point)
    this.release(force)
    this.release(point)
  }

  /**
   * Forces that PhysLab applies itself, before every engine step: air drag, wind, rolling
   * resistance, a question's actuators, the grab spring and its own springs. Each is worked out
   * from where everything is at the start of the step, and recorded for the work and `ownForces`.
   */
  private beforeStep(dt: number) {
    this.applied = new Map()
    this.steerDrivers(dt)
    const rho = this.settings.airDensity
    for (const id of this.order) {
      const e = this.entries.get(id)!
      if (e.def.motion !== 'dynamic') continue
      const body = e.body
      const pushes = this.activeActuators(id, dt)
      // A body Jolt has put to sleep is skipped — except the one in the hand, which the grab
      // block below wakes, and one a question is pushing, which the actuator block wakes. It
      // used to be skipped too, so anything that had settled for a third of a second could
      // never be picked up again.
      if (!body.IsActive() && this.grabbed?.id !== id && pushes.length === 0) continue

      if (rho > 0) {
        const v = body.GetLinearVelocity()
        const rel: V3 = [v.GetX() - this.settings.wind[0], v.GetY() - this.settings.wind[1], v.GetZ() - this.settings.wind[2]]
        const speed = Math.hypot(rel[0], rel[1], rel[2])
        if (speed > 1e-4) {
          const dir: V3 = [rel[0] / speed, rel[1] / speed, rel[2] / speed]
          const cd = e.def.dragCd ?? dragCoefficient(e.def.shape)
          // The face the air meets is the one turned towards the motion (H22), not the unturned one.
          const q = body.GetRotation()
          const area = e.def.dragArea ?? frontalAreaTurned(e.def.shape, e.def.size, [q.GetX(), q.GetY(), q.GetZ(), q.GetW()], dir)
          const mag = 0.5 * rho * cd * area * speed * speed
          const f: V3 = [-dir[0] * mag, -dir[1] * mag, -dir[2] * mag]
          this.push(body, f)
          addInto(this.appliedTo(id, e).f.drag, f)
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
          const tq: V3 = [(-w.GetX() / spin) * mag, (-w.GetY() / spin) * mag, (-w.GetZ() / spin) * mag]
          const t = this.v3(tq)
          body.AddTorque(t)
          this.release(t)
          addInto(this.appliedTo(id, e).f.rollingTorque, tq)
        }
      }

      // A question's push: F(t) read at the middle of the step, so a force that grows with the
      // clock is not read a half-step early every step — F = 4t used to give 1.967 m/s at 1 s,
      // not 2. A body that had settled and gone to sleep would swallow the force otherwise —
      // Jolt ignores a force on a sleeping body — so it is woken first, the way the grab spring
      // wakes the body in the hand; a push that has cut out by returning zero leaves the body
      // alone, or it could never settle again. A force the expression cannot give a number for
      // (a division by zero near t = 0) is left out of that step rather than handed to the
      // engine as NaN, which would take the body with it.
      for (const a of pushes) {
        const f = a.force(this.time + dt / 2)
        if (!Number.isFinite(f[0]) || !Number.isFinite(f[1]) || !Number.isFinite(f[2])) continue
        if (f[0] === 0 && f[1] === 0 && f[2] === 0) continue
        this.bodies.ActivateBody(body.GetID())
        this.push(body, f)
        addInto(this.appliedTo(id, e).f.push, f)
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
        // Recorded before the push: the body's place before the step is read on the first record.
        const rec = this.appliedTo(id, e)
        this.push(body, [fx, fy, fz])
        this.bodies.ActivateBody(body.GetID())
        addInto(rec.f.hand, [fx, fy, fz])
      }
    }
    this.springForces()
    this.knotDampers()
  }

  /**
   * PhysLab's own springs: F = (k(L − L₀) + c·v_rel) n̂ with n̂ from A to B and v_rel = (v_B − v_A)·n̂,
   * +F on A and −F on B; a fixed end gets nothing. Jolt ignores a force on a sleeping body, so a
   * sleeping end is woken when the other end is awake (it is being pulled); two ends at rest stay
   * asleep, which is how a hanging mass settles.
   */
  private springForces(): void {
    for (const s of this.ownSprings) {
      // Only a dynamic end is pushed; a kinematic end (moved by script, not by forces) still moves,
      // so its speed counts for the damper and its being awake wakes the other end.
      const aMoves = s.a.def.motion === 'dynamic'
      const bMoves = s.b.def.motion === 'dynamic'
      const aGoes = s.a.def.motion !== 'static'
      const bGoes = s.b.def.motion !== 'static'
      const aAwake = aGoes && s.a.body.IsActive()
      const bAwake = bGoes && s.b.body.IsActive()
      if (!aAwake && !bAwake) continue
      // Copied out at once: the binding hands back ONE shared vector per getter (see `xyz`).
      // Between the tie points (SB61), and pushed there: a spring held at a surface turns its end with it.
      const pa = tiePoint(s.a.body, s.tieA)
      const pb = tiePoint(s.b.body, s.tieB)
      const d: V3 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]]
      const L = Math.hypot(d[0], d[1], d[2])
      // Two centres in one place give the spring no direction to pull in.
      if (!(L > 0)) continue
      const n: V3 = [d[0] / L, d[1] / L, d[2] / L]
      const vA: V3 = aGoes ? pointVelocity(s.a.body, pa) : [0, 0, 0]
      const vB: V3 = bGoes ? pointVelocity(s.b.body, pb) : [0, 0, 0]
      const hooke = s.k * (L - s.L0)
      const damp = s.c * (dot(vB, n) - dot(vA, n))
      const total: V3 = [(hooke + damp) * n[0], (hooke + damp) * n[1], (hooke + damp) * n[2]]
      const damper: V3 = [damp * n[0], damp * n[1], damp * n[2]]
      const ends: [Entry, boolean, number, V3, V3 | null][] = [
        [s.a, aMoves, 1, pa, s.tieA],
        [s.b, bMoves, -1, pb, s.tieB]
      ]
      for (const [e, moves, sign, at, tie] of ends) {
        if (!moves) continue
        if (!e.body.IsActive()) this.bodies.ActivateBody(e.body.GetID())
        const rec = this.appliedTo(e.def.id, e)
        const f: V3 = [sign * total[0], sign * total[1], sign * total[2]]
        if (tie) this.pushAt(e.body, f, at)
        else this.push(e.body, f)
        addInto(rec.f.spring, f)
        const dF: V3 = [sign * damper[0], sign * damper[1], sign * damper[2]]
        addInto(rec.damper, dF)
        // Pushed at its tie, the damper also turns the body: that torque r × F works too, and goes with the damper's work.
        if (tie) {
          const c = xyz(e.body.GetPosition())
          const r: V3 = [at[0] - c[0], at[1] - c[1], at[2] - c[2]]
          addInto(rec.knot, [r[1] * dF[2] - r[2] * dF[1], r[2] * dF[0] - r[0] * dF[2], r[0] * dF[1] - r[1] * dF[0]])
        }
      }
    }
  }

  /**
   * The knot (SB61): a body hung from a string or a spring by a point of its surface is a small second pendulum, and
   * after a drag it swung round that point at up to 4.5 rad/s. A real knot, and the air, damp that: a torque
   * −c·I·(ω − ω_link) takes out the body's spin AGAINST its link (ω_link = r × v_rel / |r|²) and nothing else, so it
   * turns with the link and stops wobbling. c = KNOT_DAMPING; I is taken as 0.4 m r² (r the tie's reach). Its work goes
   * to the step's damper work, so the energy ledger counts it. A rod is pinned and needs none.
   */
  private knotDampers(): void {
    // A body hung by two or more tied links (the swing bridge's V) is held at two points: it has no wobble of its own to
    // damp, and a knot on each link fought the other (0.8 % of its energy in 10 s).
    const hung = new Map<string, number>()
    for (const l of this.linkDefs) {
      if (l.kind !== 'string' && l.kind !== 'spring' && l.kind !== 'rod') continue
      const la = this.entries.get(l.a)
      const lb = this.entries.get(l.b)
      if (!la || !lb) continue
      const t = linkTies(l, la.def, lb.def, this.depths)
      if (t.parent) {
        const id = t.parent === 'a' ? l.b : l.a
        hung.set(id, (hung.get(id) ?? 0) + 1)
      }
    }
    for (const link of this.linkDefs) {
      if (link.kind !== 'string' && link.kind !== 'spring') continue
      const a = this.entries.get(link.a)
      const b = this.entries.get(link.b)
      if (!a || !b) continue
      const ties = linkTies(link, a.def, b.def, this.depths)
      // Only a body that HANGS from its link's other end (ties.parent): between two free bodies the knot would be a torque
      // from nowhere and the pair would lose angular momentum.
      if (!ties.parent) continue
      const [child, parent, tie] = ties.parent === 'a' ? [b, a, ties.b] : [a, b, ties.a]
      {
        if (!tie || child.def.motion !== 'dynamic' || !child.body.IsActive() || (hung.get(child.def.id) ?? 0) > 1) continue
        const pc = xyz(child.body.GetPosition())
        const pp = xyz(parent.body.GetPosition())
        const vc = xyz(child.body.GetLinearVelocity())
        const vp: V3 = parent.def.motion === 'static' ? [0, 0, 0] : xyz(parent.body.GetLinearVelocity())
        const r: V3 = [pp[0] - pc[0], pp[1] - pc[1], pp[2] - pc[2]]
        const r2 = r[0] * r[0] + r[1] * r[1] + r[2] * r[2]
        // Centres within a millimetre give the link no direction to turn by.
        if (!(r2 > 1e-6)) continue
        const v: V3 = [vp[0] - vc[0], vp[1] - vc[1], vp[2] - vc[2]]
        const wl: V3 = [(r[1] * v[2] - r[2] * v[1]) / r2, (r[2] * v[0] - r[0] * v[2]) / r2, (r[0] * v[1] - r[1] * v[0]) / r2]
        const w = xyz(child.body.GetAngularVelocity())
        const reach2 = tie[0] * tie[0] + tie[1] * tie[1] + tie[2] * tie[2]
        const c = KNOT_DAMPING * 0.4 * child.mass * reach2
        const dw: V3 = [w[0] - wl[0], w[1] - wl[1], w[2] - wl[2]]
        // A body turning with its link (float noise aside) is left alone: no torque, no work, nothing for the ledger to name.
        if (Math.hypot(dw[0], dw[1], dw[2]) < KNOT_DEAD_ZONE) continue
        const tq: V3 = [-c * dw[0], -c * dw[1], -c * dw[2]]
        const torque = this.v3(tq)
        child.body.AddTorque(torque)
        this.release(torque)
        addInto(this.appliedTo(child.def.id, child).knot, tq)
        // The reaction goes to a moving parent, so the pair keeps its angular momentum (a fixed one takes it into the world).
        if (parent.def.motion === 'dynamic') {
          const back: V3 = [-tq[0], -tq[1], -tq[2]]
          const counter = this.v3(back)
          parent.body.AddTorque(counter)
          this.release(counter)
          addInto(this.appliedTo(parent.def.id, parent).knot, back)
        }
      }
    }
  }

  /** Every body's position and rotation, in body order, into `into` (STRIDE numbers each). */
  private readPoses(into: Float32Array) {
    this.order.forEach((id, i) => {
      const e = this.entries.get(id)!
      const p = e.body.GetPosition()
      const q = e.body.GetRotation()
      const o = i * STRIDE
      into[o] = p.GetX()
      into[o + 1] = p.GetY()
      into[o + 2] = p.GetZ()
      into[o + 3] = q.GetX()
      into[o + 4] = q.GetY()
      into[o + 5] = q.GetZ()
      into[o + 6] = q.GetW()
    })
  }

  /** Body ids in the same order as the transform buffer. */
  get bodyOrder(): BodyId[] {
    return this.order
  }

  /**
   * A body's state with the position and rotation it is drawn at this frame, for whatever is drawn
   * beside it (labels, arrows, the lines of a link). Bodies are drawn between the last two steps
   * (P13); read off the engine, those followed in jumps in slow motion and sat apart from their body.
   */
  drawn(id: BodyId): BodyState | null {
    const st = this.state(id)
    const o = this.order.indexOf(id) * STRIDE
    const t = this.transforms
    if (!st || o < 0 || o + STRIDE > t.length) return st
    return { ...st, position: [t[o], t[o + 1], t[o + 2]], rotation: [t[o + 3], t[o + 4], t[o + 5], t[o + 6]] }
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
    this.input()
    const v = this.v3(velocity)
    this.bodies.SetLinearVelocity(e.body.GetID(), v)
    this.bodies.ActivateBody(e.body.GetID())
    this.release(v)
  }

  setPosition(id: BodyId, position: V3): void {
    const e = this.entries.get(id)
    if (!e) return
    this.input()
    const J = this.jolt as unknown as AnyJolt & Jolt
    const p = this.rv3(position)
    const q = e.body.GetRotation()
    this.bodies.SetPositionAndRotation(e.body.GetID(), p, q, J.EActivation_Activate)
    this.release(p)
  }

  grab(id: BodyId, target: V3): void {
    const e = this.entries.get(id)
    if (!e || e.def.motion !== 'dynamic') return
    this.input()
    this.grabbed = { id, target }
    this.bodies.ActivateBody(e.body.GetID())
  }

  /**
   * Put a body somewhere, at rest, whatever it was doing: arranging the scene while paused. A
   * static body (wall, ramp) is moved the same way, and everything else is woken so a ball asleep
   * on something that has just moved notices. The floor is never moved this way (owner,
   * 2026-10-09): a drag across it slid the ground out from under the experiment. A typed position
   * still moves it, through updateBody, because that is a choice and not a slip of the mouse.
   */
  placeBody(id: BodyId, position: V3): void {
    const e = this.entries.get(id)
    if (!e || e.def.shape === 'ground') return
    this.input()
    const from = this.positionOf(e)
    this.put(e, position)
    this.faceTies(e)
    if (e.def.motion !== 'dynamic') this.wakeAll()
    // A mass on a pulley takes its partner the other way, so the rope stays its length while it
    // is dragged and nothing jumps on Play. `put`, not `placeBody`, for the partner: placing it
    // would move this body back again.
    for (const link of this.linkDefs) {
      if (link.kind !== 'pulley' || (link.a !== id && link.b !== id)) continue
      const partner = this.entries.get(link.a === id ? link.b : link.a)
      const wheel = link.over ? this.entries.get(link.over) : undefined
      if (!partner || !wheel || partner.def.motion !== 'dynamic') continue
      this.put(partner, pulleyPartnerMove(wheel.def, from, position, this.positionOf(partner)))
    }
    // A rope or pulley bakes its end points and rim into its constraints. Move a wheel or a rope
    // end and those must be laid again, exactly as updateBody does.
    if (this.linkDefs.some((l) => l.over === id || ((l.kind === 'pulley' || l.kind === 'rope') && (l.a === id || l.b === id)))) {
      this.setLinks(this.linkDefs)
    }
  }

  /**
   * After a placement (SB61): a body that hangs from a rod, string or spring by a tie on its surface is turned so the tie
   * faces what it hangs from again. Moved and left turned as it was, a bob pulled back from 15° to 30° hung from a tie
   * 15° off its string and whipped round it at 4.5 rad/s.
   */
  private faceTies(e: Entry): void {
    if (e.def.motion !== 'dynamic') return
    const J = this.jolt as unknown as AnyJolt & Jolt
    for (const link of this.linkDefs) {
      const mineIsA = link.a === e.def.id
      if (!mineIsA && link.b !== e.def.id) continue
      const other = this.entries.get(mineIsA ? link.b : link.a)
      if (!other) continue
      const ties = mineIsA ? linkTies(link, e.def, other.def, this.depths) : linkTies(link, other.def, e.def, this.depths)
      const tie = mineIsA ? ties.a : ties.b
      if (!tie || ties.parent !== (mineIsA ? 'b' : 'a')) continue
      const r = this.rotationOf(e)
      const span = Math.hypot(...tie)
      const now = rotateVec(r, [tie[0] / span, tie[1] / span, tie[2] / span])
      const pe = this.positionOf(e)
      const po = this.positionOf(other)
      const d: V3 = [po[0] - pe[0], po[1] - pe[1], po[2] - pe[2]]
      const dl = Math.hypot(...d)
      if (!(dl > 1e-9)) return
      const turned = quatMul(shortestArc(now, [d[0] / dl, d[1] / dl, d[2] / dl]), r)
      const q = new J.Quat(turned[0], turned[1], turned[2], turned[3])
      const zero = this.v3([0, 0, 0])
      this.bodies.SetPositionRotationAndVelocity(e.body.GetID(), e.body.GetPosition(), q, zero, zero)
      this.release(q)
      this.release(zero)
      // One link decides: the first a body hangs from.
      return
    }
  }

  /** A body's rotation now, x, y, z, w (copied out at once: the binding hands back one shared quaternion). */
  private rotationOf(e: Entry): [number, number, number, number] {
    const q = e.body.GetRotation()
    return [q.GetX(), q.GetY(), q.GetZ(), q.GetW()]
  }

  /** Sets a body down at `position`, at rest, keeping the way it is turned. */
  private put(e: Entry, position: V3): void {
    const J = this.jolt as unknown as AnyJolt & Jolt
    const p = this.rv3(position)
    const q = e.body.GetRotation()
    if (e.def.motion === 'dynamic') {
      const zero = this.v3([0, 0, 0])
      this.bodies.SetPositionRotationAndVelocity(e.body.GetID(), p, q, zero, zero)
      this.release(zero)
    } else this.bodies.SetPositionAndRotation(e.body.GetID(), p, q, J.EActivation_DontActivate)
    this.release(p)
  }

  setRotation(id: BodyId, degrees: V3): void {
    const e = this.entries.get(id)
    if (!e) return
    this.input()
    const J = this.jolt as unknown as AnyJolt & Jolt
    const q = this.quatFromEuler(degrees)
    this.bodies.SetPositionAndRotation(e.body.GetID(), e.body.GetPosition(), q, e.def.motion === 'dynamic' ? J.EActivation_Activate : J.EActivation_DontActivate)
    this.release(q)
    if (e.def.motion !== 'dynamic') this.wakeAll()
  }

  setAngularVelocity(id: BodyId, w: V3): void {
    const e = this.entries.get(id)
    if (!e || e.def.motion !== 'dynamic') return
    this.input()
    const v = this.v3(w)
    this.bodies.SetAngularVelocity(e.body.GetID(), v)
    this.bodies.ActivateBody(e.body.GetID())
    this.release(v)
  }

  /** Wake every moving body, after something they may be resting on has moved. */
  wakeAll(): void {
    this.input()
    for (const e of this.entries.values()) if (e.def.motion === 'dynamic') this.bodies.ActivateBody(e.body.GetID())
  }

  moveGrab(target: V3): void {
    if (!this.grabbed) return
    this.input()
    this.grabbed.target = target
  }

  release_(): void {
    if (this.grabbed) this.input()
    this.grabbed = null
  }

  get grabbedId(): BodyId | null {
    return this.grabbed?.id ?? null
  }

  // -------------------------------------------------------------------------
  // Step records and keyframes (SB9, I-4): what the tape is made of
  // -------------------------------------------------------------------------

  /**
   * Each body's definition as the world holds it now, in `bodyOrder`, the links and the pushes, as
   * copies of the lists. A restored keyframe puts back the definitions it was saved with (bounce,
   * friction, damping), the pushes and the settings, so after "Branch from here" the Sandbox's store
   * takes them from here (SB12) rather than keep later edits the run no longer has.
   */
  definitions(): { bodies: BodyDef[]; links: Link[]; actuators: Actuator[] } {
    return {
      bodies: this.order.map((id) => this.entries.get(id)!.def),
      links: [...this.linkDefs],
      actuators: [...this.actuators.values()].flat()
    }
  }

  /** What a step record holds, in order: the bodies as `bodyOrder`, then each rope's links, rope by rope (I-3). */
  recordLayout(): RecordLayout {
    return { bodies: [...this.order], ropes: [...this.ropes].map(([linkId, rope]) => ({ linkId, count: rope.bodies.length })) }
  }

  /**
   * This step's record into `out` (I-4): REC_FLOATS float32 numbers for each body of
   * `recordLayout()` — position, rotation quaternion (x, y, z, w), velocity, angular velocity, as the
   * engine holds them. It makes no new objects, so the recorder can call it after every engine step.
   * A buffer too short for the layout is refused rather than half filled.
   */
  readRecord(out: Float32Array): void {
    const list = this.recordBodies()
    const need = list.length * REC_FLOATS
    if (out.length < need) throw new RangeError(`A step record needs ${need} numbers and this buffer holds ${out.length}.`)
    for (let i = 0; i < list.length; i++) {
      const b = list[i]
      const o = i * REC_FLOATS
      // Each read off before the next getter: the binding shares one vector per getter (see `xyz`).
      const p = b.GetPosition()
      out[o] = p.GetX()
      out[o + 1] = p.GetY()
      out[o + 2] = p.GetZ()
      const q = b.GetRotation()
      out[o + 3] = q.GetX()
      out[o + 4] = q.GetY()
      out[o + 5] = q.GetZ()
      out[o + 6] = q.GetW()
      const v = b.GetLinearVelocity()
      out[o + 7] = v.GetX()
      out[o + 8] = v.GetY()
      out[o + 9] = v.GetZ()
      const w = b.GetAngularVelocity()
      out[o + 10] = w.GetX()
      out[o + 11] = w.GetY()
      out[o + 12] = w.GetZ()
    }
  }

  /** The engine bodies of `recordLayout()`, in its order; made once per build of the world. */
  private recordBodies(): Body[] {
    if (!this.recBodies) {
      const list = this.order.map((id) => this.entries.get(id)!.body)
      for (const rope of this.ropes.values()) list.push(...rope.bodies)
      this.recBodies = list
    }
    return this.recBodies
  }

  /**
   * Saves this moment of the run (I-4): Jolt's whole state (`SaveState`, every part of it: bodies,
   * the contact cache, the joints' impulses, gravity, the last Δt) and PhysLab's own (see `Saved`).
   * Restoring it and stepping on gives the very same numbers, step for step. It holds an engine
   * object until `freeKeyframe` (or a rebuild, after which it is useless).
   */
  saveKeyframe(): Keyframe {
    const J = this.jolt as unknown as AnyJolt & Jolt
    const rec = this.track(new J.StateRecorderImpl())
    this.physics.SaveState(rec, J.EStateRecorderState_All)
    const k: Keyframe = Object.freeze({ step: this.steps, time: this.time, rebuild: this.rebuilds })
    this.keyframes.set(k, {
      rec,
      rebuild: this.rebuilds,
      steps: this.steps,
      ticks: this.ticks,
      startRead: this.startRead,
      rate: this.rate,
      pendingRate: this.pendingRate,
      settings: { ...this.settings, wind: [...this.settings.wind] },
      touching: new Map(this.touching),
      grabbed: this.grabbed ? { id: this.grabbed.id, target: [...this.grabbed.target] } : null,
      applied: [...this.applied].map(([id, a]) => ({ id, before: [...a.before], f: copyForces(a.f), damper: [...a.damper], knot: [...a.knot] })),
      actuators: new Map(this.actuators),
      ownSprings: [...this.ownSprings],
      defs: this.order.map((id) => this.entries.get(id)!.def)
    })
    return k
  }

  /**
   * Puts the run back to a keyframe (I-4) and says whether it could. A keyframe from another build
   * of the world (`rebuildSerial` moved on), or one already freed, is refused and nothing changes.
   * Everything a step reads comes back: the engine, the clock and rate, the settings (all but the
   * slow-motion setting, which is the student's way of watching, not the run), who touches whom,
   * the hand, the pushes, the own springs, each body's definition. Time gathered towards a next step
   * is dropped and the drawn pose is the restored one, so nothing is blended across the jump.
   * Neither serial moves: a restore is not an input. Refused from inside the after-step hook, where
   * it would put the world back under the step loop that is running.
   */
  restoreKeyframe(k: Keyframe): boolean {
    const s = this.keyframes.get(k)
    if (!s || s.rebuild !== this.rebuilds || this.inHook) return false
    s.rec.Rewind()
    if (!this.physics.RestoreState(s.rec)) return false
    this.steps = s.steps
    this.ticks = s.ticks
    this.startRead = s.startRead
    this.rate = s.rate
    this.pendingRate = s.pendingRate
    this.settings = { ...s.settings, wind: [...s.settings.wind], timeScale: this.settings.timeScale }
    this.touching = new Map(s.touching)
    this.grabbed = s.grabbed ? { id: s.grabbed.id, target: [...s.grabbed.target] } : null
    this.applied = new Map()
    for (const a of s.applied) {
      const e = this.entries.get(a.id)
      if (e) this.applied.set(a.id, { e, before: [...a.before], f: copyForces(a.f), damper: [...a.damper], knot: [...a.knot] })
    }
    this.actuators = new Map(s.actuators)
    this.ownSprings = [...s.ownSprings]
    s.defs.forEach((def, i) => {
      const e = this.entries.get(this.order[i])
      if (!e || e.def === def) return
      // Bounce, friction and damping live in the engine's bodies but not in its saved state.
      e.body.SetRestitution(def.restitution)
      e.body.SetFriction(def.friction)
      if (def.motion === 'dynamic') {
        const mp = e.body.GetMotionProperties()
        mp.SetLinearDamping(def.linearDamping)
        mp.SetAngularDamping(def.angularDamping)
      }
      e.def = def
    })
    this.accumulator = 0
    this.contacts = []
    this.stepContacts = []
    this.stepTouches = []
    const size = this.order.length * STRIDE
    if (this.curPose.length !== size) {
      this.curPose = new Float32Array(size)
      this.prevPose = new Float32Array(size)
    }
    this.readPoses(this.curPose)
    this.prevPose.set(this.curPose)
    this.transforms.set(this.curPose)
    return true
  }

  /** Lets a keyframe go, with the engine object it holds. Freeing one twice, or a stale one, is harmless. */
  freeKeyframe(k: Keyframe): void {
    const s = this.keyframes.get(k)
    if (!s) return
    this.keyframes.delete(k)
    this.release(s.rec)
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
      // The speeds as the engine found the contact, before it solved it: the "in" of a bounce.
      // Each is copied out before the next call (see `xyz`): read the old way, both were the second
      // body's, so every approach speed came out 0 — which hid that its sign was the wrong way round.
      const vBeforeA = xyz(b1.GetLinearVelocity())
      const vBeforeB = xyz(b2.GetLinearVelocity())
      const rel: V3 = [vBeforeA[0] - vBeforeB[0], vBeforeA[1] - vBeforeB[1], vBeforeA[2] - vBeforeB[2]]
      // Jolt's normal points from body 1 into body 2 (the way to push 2 out), so 1 closing on 2 is a
      // positive (v₁ − v₂)·n: a ball falling at 7.67 m/s onto a floor approaches at +7.67.
      const approach = rel[0] * normal[0] + rel[1] * normal[1] + rel[2] * normal[2]
      const p = m.GetWorldSpaceContactPointOn1(0)
      // Jolt combines the pair as max(e₁, e₂) and √(μ₁μ₂) (AGENTS.md): read from what the student
      // set on each body, so a card quoting them shows the figures typed, not their float32 copies.
      const da = this.entries.get(a)?.def
      const db = this.entries.get(b)?.def
      const event: ContactEvent = {
        a,
        b,
        // The clock at the end of the step it is found in, the same instant as `step`: the bounce
        // happens during this step, and the start of it was a whole step early (0.7800 s for a drop
        // whose ball meets the floor at 0.7819 s and whose step ends at 0.7817 s, at 600 a second).
        t: (this.ticks + TICKS_PER_SECOND / this.rate) / TICKS_PER_SECOND,
        approachSpeed: approach,
        normal,
        point: [p.GetX(), p.GetY(), p.GetZ()],
        step: this.steps + 1,
        vBeforeA,
        vBeforeB,
        // Filled in once the step is over (`afterStep`).
        vAfterA: vBeforeA,
        vAfterB: vBeforeB,
        eUsed: Math.max(da?.restitution ?? 0, db?.restitution ?? 0),
        muUsed: Math.sqrt(Math.max(0, da?.friction ?? 0) * Math.max(0, db?.friction ?? 0))
      }
      this.contacts.push(event)
      this.stepContacts.push(event)
    }
    // A contact that is merely continuing is not an event worth logging, but it is what tells
    // rolling resistance there is a surface underneath. Both callbacks note who is touching whom;
    // only a new contact becomes a collision the student can read. While an after-step listener
    // exists every contact of the step is also handed on as a Touch (free-body arrows need the
    // normal of a block resting on a slope, which is never a new contact).
    const noteTouch = (body1: number, body2: number, manifold: number, added: boolean) => {
      const b1 = J.wrapPointer(body1, J.Body)
      const b2 = J.wrapPointer(body2, J.Body)
      const a = this.order[Number(b1.GetUserData()) - 1]
      const b = this.order[Number(b2.GetUserData()) - 1]
      if (a && b) {
        this.touching.set(a, b)
        this.touching.set(b, a)
        if (this.listeners.size > 0) {
          const m = J.wrapPointer(manifold, J.ContactManifold)
          const nv = m.mWorldSpaceNormal
          const p = m.GetWorldSpaceContactPointOn1(0)
          this.stepTouches.push({ a, b, normal: [nv.GetX(), nv.GetY(), nv.GetZ()], point: [p.GetX(), p.GetY(), p.GetZ()], added })
        }
      }
    }
    listener.OnContactAdded = (body1: number, body2: number, manifold: number, _settings: number) => {
      noteTouch(body1, body2, manifold, true)
      record(body1, body2, manifold)
    }
    listener.OnContactPersisted = (body1: number, body2: number, manifold: number, _settings: number) => noteTouch(body1, body2, manifold, false)
    listener.OnContactRemoved = (_subShapePair: number) => undefined
    listener.OnContactValidate = (b1: number, b2: number, _offset: number, _result: number) =>
      this.ropeTies.size > 0 && this.ropeTies.has(pairKey(b1, b2)) ? J.ValidateResult_RejectAllContactsForThisBodyPair : J.ValidateResult_AcceptAllContactsForThisBodyPair
    this.physics.SetContactListener(listener)
  }

  // -------------------------------------------------------------------------

  /** Empties the world. The engine itself stays loaded, ready for the next scene. */
  destroy(): void {
    this.clear()
  }
}

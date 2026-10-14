// What a sandbox scene is made of. These definitions are what the user edits, saves and undoes;
// the live positions during a run live in a plain Float32Array instead (see world.ts).

import type { V3 } from '../math/vec'

export type BodyId = string

/** Shapes a student can drop into the world. Sizes are in metres. */
export type ShapeKind = 'box' | 'sphere' | 'cylinder' | 'capsule' | 'cone' | 'ramp' | 'plank' | 'wall' | 'ground' | 'pulley'

type MotionKind = 'dynamic' | 'static' | 'kinematic'

export interface BodyDef {
  id: BodyId
  name: string
  shape: ShapeKind
  /** Box/ramp/plank/wall: full width, height, depth. Sphere: [radius]. Cylinder/capsule/cone: [radius, height]. */
  size: V3
  position: V3
  /** Euler angles in degrees, which is what a student expects to type. */
  rotation: V3
  velocity: V3
  angularVelocity: V3
  motion: MotionKind
  material: string
  /** 'mass' uses `mass` directly; 'density' works it out from the material and the volume. */
  massMode: 'mass' | 'density'
  mass: number
  restitution: number
  friction: number
  linearDamping: number
  angularDamping: number
  color: string
  /** Air drag: coefficient and the area facing the motion (m²). Empty = worked out from the shape. */
  dragCd?: number
  dragArea?: number
  showArrows?: boolean
  trace?: boolean
  /** Coefficient of rolling resistance. Empty means "whatever this material has". */
  rolling?: number
  /** Which way it is allowed to move: free, or held to one axis so a student can isolate what
   *  they are studying (a trolley on a track, a lift in a shaft). */
  lock?: 'free' | 'x' | 'y'
}

/**
 * How many engine steps the Sandbox takes per simulated second. Each step is ONE Jolt step with
 * PhysLab's own forces worked out before it, so the error a student can see is the step's alone:
 * a free fall loses ½g²Δt per kg each second, a launch lands v₀ₓΔt short (Idea #39 §2.3).
 */
export type StepRate = 60 | 120 | 240 | 600
export const STEP_RATES: readonly StepRate[] = [60, 120, 240, 600]
/** Owner decision D3 (12 Oct): 240, half the step error of the old default for almost no cost. */
export const DEFAULT_STEP_RATE: StepRate = 240

export interface WorldSettings {
  /** Downward acceleration, m/s². 9.81 on Earth, 1.62 on the Moon, 0 in free space. */
  gravity: number
  /** True 2D: bodies are held in the x–y plane so the textbook formulas apply exactly. */
  twoD: boolean
  /** Air density kg/m³ (1.225 at sea level). 0 is a vacuum. */
  airDensity: number
  wind: V3
  /** Engine steps per simulated second: more is more accurate and slower. Read it through `rateOf`. */
  stepRate: StepRate
  /**
   * The old "Accuracy" figure: collision sub-steps per 1/60 s. Nothing writes it any more; a preset
   * not yet rewritten may still say it, and `rateOf` reads it as the step rate it amounted to.
   */
  collisionSteps?: number
  allowSleeping: boolean
  /** Slow motion: 1 = real time, 0.1 = ten times slower. */
  timeScale: number
}

const isStepRate = (v: unknown): v is StepRate => STEP_RATES.includes(v as StepRate)

/** The step rate an old collisionSteps n amounted to: 60·n steps a second, rounded UP to a rate PhysLab runs. */
function legacyRate(n: number | undefined): StepRate | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 1) return null
  return STEP_RATES.find((r) => r >= 60 * n) ?? 600
}

/**
 * The step rate a world runs at: its `stepRate` when it is one PhysLab runs; else an old
 * `collisionSteps` n as 60·n rounded up (1 → 60, 2 → 120, 3–4 → 240, 5–10 → 600); else the default.
 *
 * When a world says both, the finer of the two wins. A preset that still asks for collisionSteps 8
 * (Newton's cradle, until its rate is written as a stepRate) is spread over DEFAULT_WORLD, which
 * always carries a stepRate, so "stepRate first" alone would quietly run the cradle at 240 instead
 * of the 600 its 8 sub-steps amounted to, and its balls would hit as one lump again. The "Steps a
 * second" row clears collisionSteps when the student picks a rate, so their choice is never
 * overruled.
 */
export function rateOf(w: Partial<WorldSettings>): StepRate {
  const own = isStepRate(w.stepRate) ? w.stepRate : null
  const old = legacyRate(w.collisionSteps)
  if (own !== null && old !== null) return Math.max(own, old) as StepRate
  return own ?? old ?? DEFAULT_STEP_RATE
}

/**
 * The work PhysLab's own forces did ON the bodies during one engine step, in joules, signed:
 * F·(x after − x before) with the force PhysLab applied and the step Jolt took. Drag, rolling and
 * damper take energy out (≤ 0); a damper's step at a turning point can read a hair above 0 (the
 * force is set by the speed at the start of the step, the motion by the speed at its end), never
 * over a swing. A spring's Hooke force is conservative and is NOT here — its energy is ½kx², which
 * the readout counts; only its damper spends energy.
 */
export interface StepWork {
  drag: number
  rolling: number
  push: number
  hand: number
  damper: number
}

/** One collision, recorded while the engine solves it and read afterwards. */
export interface ContactEvent {
  a: BodyId
  b: BodyId
  /** Simulated time when it happened (s): the clock at the end of the step it was found in, as `step`. */
  t: number
  /** How fast the two bodies were approaching along the contact normal (m/s). */
  approachSpeed: number
  normal: V3
  point: V3
  /** The step count at the END of the step during which the engine found it. */
  step: number
  /** Each body's velocity as the engine found the contact, before it was solved (m/s). */
  vBeforeA: V3
  vBeforeB: V3
  /** Each body's velocity once that step was over (m/s). */
  vAfterA: V3
  vAfterB: V3
  /** The restitution and friction the engine combined for the pair: max(e₁, e₂) and √(μ₁μ₂). */
  eUsed: number
  muUsed: number
}

/** Every contact in a step, new or continuing, with the engine's own normal (from a to b) and first point. */
export interface Touch {
  a: BodyId
  b: BodyId
  normal: V3
  point: V3
  /** True for a contact the engine found this step; false for one that carried on from the last. */
  added: boolean
}

/** What the after-step hook is handed after every engine step. */
export interface AfterStep {
  /** The step count once this step is done. */
  step: number
  /** The clock once this step is done (s). */
  time: number
  /** The step's length, 1/rate (s). */
  dt: number
  work: StepWork
  /** The collisions the engine found during this step. */
  contacts: ContactEvent[]
  /** Every contact in this step; filled only while an after-step listener exists. */
  touches: Touch[]
}

/** The forces (and the rolling torque) PhysLab applied to one body in the last step, in N and N m. */
export interface OwnForces {
  drag: V3
  push: V3
  hand: V3
  spring: V3
  rollingTorque: V3
}

/**
 * A saved moment of a run (SB9, I-4): the step it was saved at, the clock then, and the build of the
 * world it belongs to (`SimWorld.rebuildSerial`). Everything else — the engine's own state and
 * PhysLab's — stays private to the world that saved it. It holds an engine object until
 * `freeKeyframe`; a rebuild frees it too, since it can never be restored after one.
 */
export interface Keyframe {
  readonly step: number
  readonly time: number
  readonly rebuild: number
}

/** Live values of one body, read out for the panels and labels. */
export interface BodyState {
  position: V3
  rotation: [number, number, number, number]
  velocity: V3
  angularVelocity: V3
  mass: number
  asleep: boolean
}

/**
 * A force a question applies to one body while the run plays — an engine pushing a train, a
 * thrust that cuts out — as a function of the clock, so a student can watch F(t) act and read
 * the result off the trail. It acts while `from ≤ t < until`, in seconds since Reset.
 */
export interface Actuator {
  bodyId: BodyId
  /** The force at clock reading t, in newtons, as [x, y, z]. */
  force: (t: number) => V3
  from: number
  until: number
  /**
   * What the Sandbox panel says about it ("25 N on Crate, 0–2 s"). A question's push used to act
   * with nothing on screen saying so: the crate simply sped up, and stayed pushed through the
   * student's own edits with no way to see or take the push off.
   */
  label?: string
}

/**
 * A kinematic body moved along a known path instead of by forces (SB60: the chaos twins follow the exact solution of
 * the double pendulum). `at(t)` is where the body is, how fast it moves and, if given, how it is turned (a quaternion
 * x, y, z, w) at clock reading t; the world steers the body onto it at the end of every step.
 */
export interface Driver {
  bodyId: BodyId
  at: (t: number) => { position: V3; velocity: V3; rotation?: [number, number, number, number] }
}

export const DEFAULT_WORLD: WorldSettings = {
  gravity: 9.81,
  twoD: true,
  airDensity: 1.225,
  wind: [0, 0, 0],
  stepRate: DEFAULT_STEP_RATE,
  allowSleeping: true,
  timeScale: 1
}

/** Gravity a student is likely to want. */
export const GRAVITY_PRESETS: { label: string; value: number }[] = [
  { label: 'Earth', value: 9.81 },
  { label: 'Moon', value: 1.62 },
  { label: 'Mars', value: 3.72 },
  { label: 'Jupiter', value: 24.79 },
  { label: 'None (free space)', value: 0 }
]

/** What two objects can be joined with. */
export type LinkKind = 'rod' | 'string' | 'spring' | 'rope' | 'pulley' | 'hinge' | 'weld'

/**
 * A connection between two bodies. Without these a pendulum, a spring-mass system and a pulley
 * are all impossible, which rules out half of school mechanics.
 */
export interface Link {
  id: string
  kind: LinkKind
  a: BodyId
  b: BodyId
  /** Natural length in metres: how long the rod is, or the spring at rest. */
  length: number
  /** Spring only: the spring constant k in N/m, so F = kx and T = 2π√(m/k) come out right. */
  stiffness: number
  /** Spring only: how quickly the bouncing dies away. 0 is a spring that never stops. */
  damping: number
  /** Rope only: how many short links it is made of. */
  segments?: number
  /** Pulley only: the wheel the rope runs over. */
  over?: BodyId
  /** Hinge only: the pivot, in each body's own frame, fixed when the hinge was made. */
  pivotA?: V3
  pivotB?: V3
}

export const LINK_LABELS: Record<LinkKind, string> = {
  string: 'String — pulls when taut, goes slack',
  rod: 'Rod — a fixed distance, pushes and pulls',
  spring: 'Spring — F = kx',
  rope: 'Rope — a real rope that hangs, swings and wraps',
  pulley: 'Rope over a pulley — the wheel is a Pulley object',
  hinge: 'Hinge — turns about the second object\'s centre',
  weld: 'Weld — glued together'
}

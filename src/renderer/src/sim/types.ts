// What a sandbox scene is made of. These definitions are what the user edits, saves and undoes;
// the live positions during a run live in a plain Float32Array instead (see world.ts).

import type { V3 } from '../math/vec'

export type BodyId = string

/** Shapes a student can drop into the world. Sizes are in metres. */
export type ShapeKind = 'box' | 'sphere' | 'cylinder' | 'capsule' | 'cone' | 'ramp' | 'plank' | 'wall' | 'ground' | 'pulley'

export type MotionKind = 'dynamic' | 'static' | 'kinematic'

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

export interface WorldSettings {
  /** Downward acceleration, m/s². 9.81 on Earth, 1.62 on the Moon, 0 in free space. */
  gravity: number
  /** True 2D: bodies are held in the x–y plane so the textbook formulas apply exactly. */
  twoD: boolean
  /** Air density kg/m³ (1.225 at sea level). 0 is a vacuum. */
  airDensity: number
  wind: V3
  /** Collision steps per 1/60 s step: more is more accurate and slower. */
  collisionSteps: number
  allowSleeping: boolean
  /** Slow motion: 1 = real time, 0.1 = ten times slower. */
  timeScale: number
}

/** One collision, recorded while the engine solves it and read afterwards. */
export interface ContactEvent {
  a: BodyId
  b: BodyId
  /** Simulated time when it happened (s). */
  t: number
  /** How fast the two bodies were approaching along the contact normal (m/s). */
  approachSpeed: number
  normal: V3
  point: V3
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

export const DEFAULT_WORLD: WorldSettings = {
  gravity: 9.81,
  twoD: true,
  airDensity: 1.225,
  wind: [0, 0, 0],
  collisionSteps: 2,
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

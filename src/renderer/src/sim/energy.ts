// What the simulation is worth in joules.
//
// The Sandbox could always show you a ball moving; it could never tell you whether energy was
// conserved, which is the question every mechanics practical actually asks. These are plain
// functions over a body's definition and its state, so the arithmetic can be checked against the
// formulas in a test rather than trusted because it looked right on screen.

import type { BodyDef, BodyState, Link } from './types'
import type { V3 } from '../math/vec'

export interface Energy {
  /** ½mv², the energy of going somewhere. */
  linear: number
  /** ½Iω², the energy of spinning. A rolling ball has both. */
  rotational: number
  /** The two together. */
  kinetic: number
  /** mgh above the datum. */
  potential: number
  /**
   * ½kx², what a stretched or squeezed spring holds. It belongs to the spring, not to either body
   * it joins, so only `springEnergyOf` fills it in and `energyOf` always leaves it 0.
   */
  elastic: number
  /** Kinetic, potential and elastic together. */
  total: number
}

export const EMPTY_ENERGY: Energy = { linear: 0, rotational: 0, kinetic: 0, potential: 0, elastic: 0, total: 0 }

/**
 * Moment of inertia about an axis through the centre, in kg·m².
 *
 * The one figure a textbook quotes for the shape (about a cylinder's own axis, a box's z). The spin
 * energy no longer uses it: a body has a moment about each axis, and `principalMoments` gives all three.
 */
export function momentOfInertia(def: BodyDef, mass: number): number {
  const [a, b] = def.size
  switch (def.shape) {
    case 'sphere':
      return 0.4 * mass * a * a
    case 'cylinder':
    case 'capsule':
    case 'pulley':
      return 0.5 * mass * a * a
    case 'cone':
      // A cone's first size is its base width, not its radius (the hull, the mesh and
      // `shapeVolume` all halve it); taking it as the radius quoted spin energy four times too big.
      return 0.3 * mass * (a / 2) ** 2
    default:
      // A box about its centre: 1/12 m (w² + h²).
      return (mass * (a * a + b * b)) / 12
  }
}

const square = (v: V3) => v[0] * v[0] + v[1] * v[1] + v[2] * v[2]

/**
 * The moments of inertia about the body's own x, y and z axes through its centre, in kg·m² (a
 * cylinder, capsule, pulley and cone stand along y). The spin energy uses all three (H15): one
 * figure, the axial one, read a cylinder tumbling end over end at a fraction of its true energy.
 */
export function principalMoments(def: BodyDef, mass: number): V3 {
  const [a, b, c] = def.size
  switch (def.shape) {
    case 'sphere':
      return [0.4 * mass * a * a, 0.4 * mass * a * a, 0.4 * mass * a * a]
    case 'cylinder':
    case 'pulley': {
      const across = (mass * (3 * a * a + b * b)) / 12
      return [across, 0.5 * mass * a * a, across]
    }
    case 'capsule': {
      // Taken as a cylinder of its whole height: close enough to read energy off the screen.
      const h = b + 2 * a
      const across = (mass * (3 * a * a + h * h)) / 12
      return [across, 0.5 * mass * a * a, across]
    }
    case 'cone': {
      // About its centre of mass, a quarter of the height up from the base.
      const r = a / 2
      const across = mass * ((3 * r * r) / 20 + (3 * b * b) / 80)
      return [across, 0.3 * mass * r * r, across]
    }
    default:
      // A box (and a ramp, taken as the box it fits in): 1/12 m (the other two sides squared).
      return [(mass * (b * b + c * c)) / 12, (mass * (a * a + c * c)) / 12, (mass * (a * a + b * b)) / 12]
  }
}

/** A world vector in the body's own frame: rotated by the inverse of its turn (a unit quaternion x, y, z, w). */
export function intoBody(v: V3, q: readonly number[]): V3 {
  const [x, y, z, w] = q.length === 4 ? q : [0, 0, 0, 1]
  // Rotating by the conjugate (−x, −y, −z, w).
  const ix = -x
  const iy = -y
  const iz = -z
  const tx = 2 * (iy * v[2] - iz * v[1])
  const ty = 2 * (iz * v[0] - ix * v[2])
  const tz = 2 * (ix * v[1] - iy * v[0])
  return [v[0] + w * tx + (iy * tz - iz * ty), v[1] + w * ty + (iz * tx - ix * tz), v[2] + w * tz + (ix * ty - iy * tx)]
}

/**
 * The energy of one body. `datumY` is the height potential energy is measured from — the top of
 * the floor — because "how much PE" is only ever a question relative to something.
 */
export function energyOf(def: BodyDef, state: BodyState, gravity: number, datumY = 0): Energy {
  if (def.motion !== 'dynamic') return EMPTY_ENERGY
  const m = state.mass
  const linear = 0.5 * m * square(state.velocity)
  const [ix, iy, iz] = principalMoments(def, m)
  const [wx, wy, wz] = intoBody(state.angularVelocity, state.rotation)
  const rotational = 0.5 * (ix * wx * wx + iy * wy * wy + iz * wz * wz)
  const kinetic = linear + rotational
  const potential = m * gravity * (state.position[1] - datumY)
  return { linear, rotational, kinetic, potential, elastic: 0, total: kinetic + potential }
}

/**
 * The floors the engine puts under a spring's length and stiffness: `addDistance` in world.ts builds
 * the constraint from max(0.01, …) of both. Reading a typed 0 or a negative number the same way
 * keeps the joules matching the motion the student actually sees.
 */
const SPRING_FLOOR = 0.01

/**
 * How far a spring is past its natural length, in metres, negative when it is squeezed. The engine
 * fixes a spring at the centre of both bodies, so the length is centre to centre and not surface to
 * surface as a rope's reach is.
 */
export function springStretch(link: Link, a: V3, b: V3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) - Math.max(SPRING_FLOOR, link.length)
}

/**
 * ½kx², what a spring link holds, from where its two ends are. It belongs to the link and not to a
 * body: the readout added up bodies alone, so the 9 J in Spring on ice's stretched spring was missing
 * from the total and the total swung as the block moved. Only a spring stores energy (a rod or a
 * string is a hard limit), and its damping spends energy instead of storing any, so neither enters.
 */
export function springEnergyOf(link: Link, a: V3, b: V3): Energy {
  if (link.kind !== 'spring') return EMPTY_ENERGY
  const x = springStretch(link, a, b)
  const elastic = 0.5 * Math.max(SPRING_FLOOR, link.stiffness) * x * x
  return { ...EMPTY_ENERGY, elastic, total: elastic }
}

/** Everything in the scene added up: the number that should stay still while things fall. */
export function systemEnergy(parts: Energy[]): Energy {
  return parts.reduce(
    (acc, e) => ({
      linear: acc.linear + e.linear,
      rotational: acc.rotational + e.rotational,
      kinetic: acc.kinetic + e.kinetic,
      potential: acc.potential + e.potential,
      elastic: acc.elastic + e.elastic,
      total: acc.total + e.total
    }),
    { ...EMPTY_ENERGY }
  )
}

/** p = mv, the vector. */
export function momentumOf(state: BodyState): V3 {
  return [state.mass * state.velocity[0], state.mass * state.velocity[1], state.mass * state.velocity[2]]
}

/** |p|, for when the direction is not the point. */
export const momentumSize = (state: BodyState): number => Math.hypot(...momentumOf(state))

/** The total momentum of a set of bodies: what a collision must leave unchanged. */
export function systemMomentum(states: BodyState[]): V3 {
  return states.reduce<V3>(
    (acc, s) => {
      const p = momentumOf(s)
      return [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]]
    },
    [0, 0, 0]
  )
}

/** The floor is the ground shape. A fixed block, ramp or pivot is not one, however early it comes in the list. */
export const floorOf = (bodies: BodyDef[]): BodyDef | undefined => bodies.find((b) => b.shape === 'ground')

/**
 * The height potential energy is measured from: the top of the floor, or zero when there is no
 * floor. Quoting PE from the world origin would make a ball resting on the ground carry energy
 * it plainly does not have.
 *
 * With no floor this used to fall back to the first fixed body, whatever it was: deleting the
 * pendulum's floor measured the bob from the top of its pivot and gave it a negative PE, against
 * this very comment.
 */
export function groundTopOf(bodies: BodyDef[]): number {
  const floor = floorOf(bodies)
  return floor ? floor.position[1] + floor.size[1] / 2 : 0
}

/**
 * A body's state before the run starts: where it was typed, moving as it was typed. The energy
 * readout works from this until the engine reports, so the Energy rows are on screen from the
 * start instead of appearing on Play and pushing Gravity and Slow motion out from under the
 * pointer (Fix 22).
 */
export function startStateOf(def: BodyDef, mass: number): BodyState {
  return {
    position: [...def.position] as V3,
    rotation: [0, 0, 0, 1],
    velocity: [...def.velocity] as V3,
    angularVelocity: [...def.angularVelocity] as V3,
    mass,
    asleep: false
  }
}

/** Each moving body with the state to read it from: the engine's when it has one, else its start. */
export function readoutStates(bodies: BodyDef[], live: Record<string, BodyState>, massOf: (b: BodyDef) => number): { def: BodyDef; state: BodyState }[] {
  return bodies.filter((b) => b.motion === 'dynamic').map((def) => ({ def, state: live[def.id] ?? startStateOf(def, massOf(def)) }))
}

/** One spring as the Energy readout lists it. */
export interface SpringReading {
  link: Link
  a: BodyDef
  b: BodyDef
  /** Metres past its natural length; negative when squeezed. */
  stretch: number
  energy: Energy
}

/**
 * Every spring in the scene and what it holds. An end is where the engine says once it reports and
 * where it was typed until then; a fixed post is nothing but its definition before Play, which is
 * why springs cannot be read through `readoutStates`, which lists moving bodies alone. A link whose
 * end was deleted, or that joins a body to itself, is skipped exactly as `setLinks` skips it.
 */
export function springReadings(bodies: BodyDef[], links: Link[], live: Record<string, BodyState>): SpringReading[] {
  const where = (d: BodyDef): V3 => live[d.id]?.position ?? d.position
  const out: SpringReading[] = []
  for (const link of links) {
    if (link.kind !== 'spring') continue
    const a = bodies.find((d) => d.id === link.a)
    const b = bodies.find((d) => d.id === link.b)
    if (!a || !b || a === b) continue
    out.push({ link, a, b, stretch: springStretch(link, where(a), where(b)), energy: springEnergyOf(link, where(a), where(b)) })
  }
  return out
}

/** What the Energy readout shows, worked out in one place so a test runs the same arithmetic the panel does. */
export interface SceneEnergy {
  /** The height potential energy is measured from. */
  datum: number
  /** Every moving body, with the state it was read from. */
  known: { def: BodyDef; state: BodyState; energy: Energy }[]
  springs: SpringReading[]
  /** Bodies and springs added up: the figure that stays still while nothing rubs or is pushed. */
  total: Energy
}

export function sceneEnergy(bodies: BodyDef[], links: Link[], live: Record<string, BodyState>, gravity: number, massOf: (b: BodyDef) => number): SceneEnergy {
  const datum = groundTopOf(bodies)
  const known = readoutStates(bodies, live, massOf).map(({ def, state }) => ({ def, state, energy: energyOf(def, state, gravity, datum) }))
  const springs = springReadings(bodies, links, live)
  const total = systemEnergy([...known.map((p) => p.energy), ...springs.map((s) => s.energy)])
  return { datum, known, springs, total }
}

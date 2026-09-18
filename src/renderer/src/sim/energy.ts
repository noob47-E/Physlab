// What the simulation is worth in joules.
//
// The Sandbox could always show you a ball moving; it could never tell you whether energy was
// conserved, which is the question every mechanics practical actually asks. These are plain
// functions over a body's definition and its state, so the arithmetic can be checked against the
// formulas in a test rather than trusted because it looked right on screen.

import type { BodyDef, BodyState } from './types'
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
  total: number
}

export const EMPTY_ENERGY: Energy = { linear: 0, rotational: 0, kinetic: 0, potential: 0, total: 0 }

/**
 * Moment of inertia about an axis through the centre, in kg·m².
 *
 * A real body has a tensor, not a number, and it differs by axis. For reading energy off the
 * screen one figure is enough and it is the one a textbook quotes, so the principal axis is used
 * and the difference is never more than a factor of two for these shapes.
 */
export function momentOfInertia(def: BodyDef, mass: number): number {
  const [a, b] = def.size
  switch (def.shape) {
    case 'sphere':
      return 0.4 * mass * a * a
    case 'cylinder':
    case 'capsule':
      return 0.5 * mass * a * a
    case 'cone':
      return 0.3 * mass * a * a
    default:
      // A box about its centre: 1/12 m (w² + h²).
      return (mass * (a * a + b * b)) / 12
  }
}

const square = (v: V3) => v[0] * v[0] + v[1] * v[1] + v[2] * v[2]

/**
 * The energy of one body. `datumY` is the height potential energy is measured from — the top of
 * the floor — because "how much PE" is only ever a question relative to something.
 */
export function energyOf(def: BodyDef, state: BodyState, gravity: number, datumY = 0): Energy {
  if (def.motion !== 'dynamic') return EMPTY_ENERGY
  const m = state.mass
  const linear = 0.5 * m * square(state.velocity)
  const rotational = 0.5 * momentOfInertia(def, m) * square(state.angularVelocity)
  const kinetic = linear + rotational
  const potential = m * gravity * (state.position[1] - datumY)
  return { linear, rotational, kinetic, potential, total: kinetic + potential }
}

/** Everything in the scene added up: the number that should stay still while things fall. */
export function systemEnergy(parts: Energy[]): Energy {
  return parts.reduce(
    (acc, e) => ({
      linear: acc.linear + e.linear,
      rotational: acc.rotational + e.rotational,
      kinetic: acc.kinetic + e.kinetic,
      potential: acc.potential + e.potential,
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

/**
 * The height potential energy is measured from: the top of the floor, or zero when there is no
 * floor. Quoting PE from the world origin would make a ball resting on the ground carry energy
 * it plainly does not have.
 */
export function groundTopOf(bodies: BodyDef[]): number {
  const floor = bodies.find((b) => b.shape === 'ground') ?? bodies.find((b) => b.motion === 'static')
  return floor ? floor.position[1] + floor.size[1] / 2 : 0
}

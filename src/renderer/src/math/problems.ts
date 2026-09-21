// Random practice problems for the Problem Sets mode.
//
// Every problem is built from the same solvers that write the step-by-step solutions, so the
// answer a student is marked against is the answer PhysLab would work out itself, and the hints
// are that solution revealed one step at a time. Nothing here needs a network or an AI: the
// numbers come from a seeded generator, so the same seed always gives the same problem.

import { add, cross, dot, fromPolar, len, neg, toDeg, toRad, type V3 } from './vec'
import * as VS from './vectorSolver'

export type Level = 'Basic' | 'Intermediate' | 'Advanced'

export type TopicId =
  | 'components'
  | 'magdir'
  | 'add'
  | 'twoforces'
  | 'dot'
  | 'cross'
  | 'equilibrium'
  | 'work'
  | 'torque'
  | 'projection'

/** A wrong value a common mistake produces, and what to say to the student who typed it. */
export interface Trap {
  value: number
  why: string
}

/** One box the student fills in. */
export interface AnswerField {
  key: string
  /** Shown beside the box, e.g. "Fx". */
  label: string
  unit?: string
  /** What the student should get. */
  value: number
  /** How far off still counts as right (absolute). */
  tol: number
  /**
   * A 'direction' is which way a vector points, measured from +x: it is also checked for
   * quadrant and full-turn mistakes, and 420° counts as 60°. An 'angle' is an amount of turning
   * (between two vectors, at a corner), where 420° is simply wrong; it only gets the
   * radians-for-degrees checks.
   */
  kind?: 'number' | 'angle' | 'direction'
  traps?: Trap[]
}

export interface Problem {
  id: string
  topic: TopicId
  level: Level
  title: string
  /** The question in plain words. */
  prompt: string
  fields: AnswerField[]
  /** The full worked solution; its steps are the hints. */
  solution: VS.Solution
}

export type Rng = () => number

/** Small deterministic generator (mulberry32): the same seed always gives the same problem. */
export function rngFor(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const int = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))
const pick = <T,>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
/** An integer in the range that is never 0, so no vector collapses to a point. */
const nz = (r: Rng, lo: number, hi: number): number => {
  const v = int(r, lo, hi)
  return v === 0 ? (r() < 0.5 ? lo : hi) : v
}

/** 1% of the answer, never tighter than a rounding slip an honest student makes. */
const tolOf = (v: number, min = 0.05) => Math.max(Math.abs(v) * 0.01, min)
const ANGLE_TOL = 0.6

/** Angles that turn up in textbooks (37° and 53° come from the 3-4-5 triangle). */
const ANGLES = [15, 20, 25, 30, 35, 37, 40, 45, 50, 53, 55, 60, 65, 70, 75] as const

const vec2 = (r: Rng, lo = -9, hi = 9): V3 => [nz(r, lo, hi), nz(r, lo, hi), 0]
const compText = (name: string, v: V3) => `${name} = (${v[0]}, ${v[1]})`

export interface Topic {
  id: TopicId
  label: string
  level: Level
  /** One line, so a student can choose without guessing. */
  about: string
  make: (r: Rng) => Omit<Problem, 'id' | 'topic' | 'level'>
}

export const TOPICS: Topic[] = [
  {
    id: 'components',
    label: 'Resolve into components',
    level: 'Basic',
    about: 'Ax = A cos θ, Ay = A sin θ',
    make: (r) => {
      const F = int(r, 6, 60)
      const th = pick(r, ANGLES) + (r() < 0.4 ? pick(r, [90, 180, 270]) : 0)
      const x = F * Math.cos(toRad(th))
      const y = F * Math.sin(toRad(th))
      return {
        title: 'Components of a force',
        prompt: `A force of ${F} N pulls at ${th}° to the +x axis. Find its x- and y-components.`,
        fields: [
          {
            key: 'x',
            label: 'Fx',
            unit: 'N',
            value: x,
            tol: tolOf(x),
            traps: [{ value: y, why: 'That is F sin θ. The x-component uses cos, the y-component uses sin.' }]
          },
          {
            key: 'y',
            label: 'Fy',
            unit: 'N',
            value: y,
            tol: tolOf(y),
            traps: [{ value: x, why: 'That is F cos θ. The y-component uses sin.' }]
          }
        ],
        solution: VS.solveComponents('F', F, th, 'N')
      }
    }
  },
  {
    id: 'magdir',
    label: 'Magnitude and direction',
    level: 'Basic',
    about: 'A = √(Ax² + Ay²), θ from the signs of the components',
    make: (r) => {
      const v = vec2(r, -12, 12)
      const m = len(v)
      const th = (toDeg(Math.atan2(v[1], v[0])) + 360) % 360
      const ref = toDeg(Math.atan(Math.abs(v[1]) / Math.abs(v[0])))
      return {
        title: 'Magnitude and direction of a displacement',
        prompt: `A displacement has components Ax = ${v[0]} m and Ay = ${v[1]} m. Find its magnitude and its direction measured anticlockwise from the +x axis.`,
        fields: [
          {
            key: 'mag',
            label: '|A|',
            unit: 'm',
            value: m,
            tol: tolOf(m),
            traps: [
              { value: Math.abs(v[0]) + Math.abs(v[1]), why: 'That is Ax + Ay. Sizes combine with Pythagoras: √(Ax² + Ay²).' }
            ]
          },
          {
            key: 'theta',
            label: 'θ',
            unit: '°',
            value: th,
            tol: ANGLE_TOL,
            kind: 'direction',
            traps:
              Math.abs(ref - th) > 1
                ? [{ value: ref, why: 'That is the reference angle, from tan⁻¹ of the sizes only. Use the signs of Ax and Ay to place it in the right quadrant.' }]
                : []
          }
        ],
        solution: VS.solveMagnitudeDirection({ name: 'A', v })
      }
    }
  },
  {
    id: 'add',
    label: 'Add vectors (resultant)',
    level: 'Basic',
    about: 'Add the x-components, then the y-components',
    make: (r) => {
      const n = r() < 0.4 ? 3 : 2
      let vs = Array.from({ length: n }, (_, i) => ({ name: 'ABC'[i], v: vec2(r) }))
      let R = vs.reduce<V3>((acc, x) => add(acc, x.v), [0, 0, 0])
      // A resultant of zero has no direction to ask about.
      for (let guard = 0; len(R) < 1 && guard < 20; guard++) {
        vs = Array.from({ length: n }, (_, i) => ({ name: 'ABC'[i], v: vec2(r) }))
        R = vs.reduce<V3>((acc, x) => add(acc, x.v), [0, 0, 0])
      }
      const sumOfSizes = vs.reduce((acc, x) => acc + len(x.v), 0)
      return {
        title: `Resultant of ${n} vectors`,
        prompt: `Find the resultant R of ${vs.map((x) => compText(x.name, x.v)).join(' and ')} (metres). Give its components and its size.`,
        fields: [
          { key: 'rx', label: 'Rx', unit: 'm', value: R[0], tol: tolOf(R[0]) },
          { key: 'ry', label: 'Ry', unit: 'm', value: R[1], tol: tolOf(R[1]) },
          {
            key: 'mag',
            label: '|R|',
            unit: 'm',
            value: len(R),
            tol: tolOf(len(R)),
            traps: [{ value: sumOfSizes, why: 'You added the sizes. Sizes only add like that when the vectors point the same way — add components instead.' }]
          }
        ],
        solution: VS.solveAddition(vs)
      }
    }
  },
  {
    id: 'twoforces',
    label: 'Two forces at an angle',
    level: 'Intermediate',
    about: 'R = √(F₁² + F₂² + 2F₁F₂cos θ)',
    make: (r) => {
      const F1 = int(r, 5, 40)
      const F2 = int(r, 5, 40)
      const th = pick(r, [30, 45, 60, 75, 90, 120, 135])
      const c = Math.cos(toRad(th))
      const R = Math.sqrt(F1 * F1 + F2 * F2 + 2 * F1 * F2 * c)
      const alpha = toDeg(Math.atan2(F2 * Math.sin(toRad(th)), F1 + F2 * c))
      return {
        title: 'Resultant of two forces',
        prompt: `Two forces of ${F1} N and ${F2} N act on the same point with ${th}° between them. Find the size of the resultant and the angle it makes with the ${F1} N force.`,
        fields: [
          {
            key: 'R',
            label: 'R',
            unit: 'N',
            value: R,
            tol: tolOf(R),
            traps: [
              { value: Math.sqrt(F1 * F1 + F2 * F2 - 2 * F1 * F2 * c), why: 'That is the law of cosines with a minus sign, which gives the third side of the triangle. For the resultant of two vectors the sign is plus.' },
              { value: F1 + F2, why: 'Forces only add like that when they point the same way.' }
            ]
          },
          { key: 'alpha', label: 'α', unit: '°', value: alpha, tol: ANGLE_TOL, kind: 'angle' }
        ],
        solution: VS.solveTwoForces(F1, F2, th)
      }
    }
  },
  {
    id: 'dot',
    label: 'Scalar (dot) product',
    level: 'Intermediate',
    about: 'A·B = AxBx + AyBy = AB cos θ',
    make: (r) => {
      const A = { name: 'A', v: vec2(r) }
      const B = { name: 'B', v: vec2(r) }
      const d = dot(A.v, B.v)
      const th = toDeg(Math.acos(Math.max(-1, Math.min(1, d / (len(A.v) * len(B.v))))))
      return {
        title: 'Scalar product and the angle between',
        prompt: `For ${compText('A', A.v)} and ${compText('B', B.v)}, find A·B and the angle between the two vectors.`,
        fields: [
          {
            key: 'dot',
            label: 'A·B',
            value: d,
            tol: tolOf(d),
            traps: [
              { value: len(A.v) * len(B.v), why: 'That is AB with no cos θ. The dot product is AB cos θ.' },
              { value: cross(A.v, B.v)[2], why: 'That is the cross product (it uses sin θ). The dot product multiplies matching components: AxBx + AyBy.' }
            ]
          },
          { key: 'theta', label: 'θ', unit: '°', value: th, tol: ANGLE_TOL, kind: 'angle' }
        ],
        solution: VS.solveDot(A, B)
      }
    }
  },
  {
    id: 'cross',
    label: 'Vector (cross) product',
    level: 'Intermediate',
    about: 'A×B = (AxBy − AyBx) k̂ for vectors in the xy-plane',
    make: (r) => {
      const A = { name: 'A', v: vec2(r) }
      const B = { name: 'B', v: vec2(r) }
      const C = cross(A.v, B.v)
      return {
        title: 'Vector product of two vectors in a plane',
        prompt: `For ${compText('A', A.v)} and ${compText('B', B.v)}, find the k̂ (z) component of A × B and the size of A × B.`,
        fields: [
          {
            key: 'z',
            label: '(A×B)z',
            value: C[2],
            tol: tolOf(C[2]),
            traps: [
              { value: -C[2], why: 'That is B × A. Swapping the order flips the sign: A × B = −(B × A).' },
              { value: dot(A.v, B.v), why: 'That is the dot product. The cross product multiplies across: AxBy − AyBx.' }
            ]
          },
          { key: 'mag', label: '|A×B|', value: Math.abs(C[2]), tol: tolOf(Math.abs(C[2])) }
        ],
        solution: VS.solveCross(A, B)
      }
    }
  },
  {
    id: 'equilibrium',
    label: 'Force for equilibrium',
    level: 'Intermediate',
    about: 'The equilibrant is equal and opposite to the resultant',
    make: (r) => {
      const n = r() < 0.5 ? 3 : 2
      let vs = Array.from({ length: n }, (_, i) => ({ name: `F${i + 1}`, v: vec2(r) }))
      let R = vs.reduce<V3>((acc, x) => add(acc, x.v), [0, 0, 0])
      for (let guard = 0; len(R) < 1 && guard < 20; guard++) {
        vs = Array.from({ length: n }, (_, i) => ({ name: `F${i + 1}`, v: vec2(r) }))
        R = vs.reduce<V3>((acc, x) => add(acc, x.v), [0, 0, 0])
      }
      const E = neg(R)
      return {
        title: 'Force needed for equilibrium',
        prompt: `${vs.map((x) => compText(x.name, x.v)).join(' and ')} (newtons) act on a body. Find the extra force E that holds it in equilibrium.`,
        fields: [
          {
            key: 'ex',
            label: 'Ex',
            unit: 'N',
            value: E[0],
            tol: tolOf(E[0]),
            traps: [{ value: R[0], why: 'That is the resultant R. The balancing force is equal and opposite to it: E = −R.' }]
          },
          {
            key: 'ey',
            label: 'Ey',
            unit: 'N',
            value: E[1],
            tol: tolOf(E[1]),
            traps: [{ value: R[1], why: 'That is the resultant R. The balancing force is equal and opposite to it: E = −R.' }]
          },
          { key: 'mag', label: '|E|', unit: 'N', value: len(E), tol: tolOf(len(E)) }
        ],
        solution: VS.solveEquilibrium(vs)
      }
    }
  },
  {
    id: 'work',
    label: 'Work done by a force',
    level: 'Basic',
    about: 'W = F·d = Fd cos θ',
    make: (r) => {
      const F = int(r, 5, 50)
      const d = int(r, 2, 20)
      const th = pick(r, [0, 30, 37, 45, 53, 60, 90, 120, 150])
      const W = F * d * Math.cos(toRad(th))
      return {
        title: 'Work done by a force',
        prompt: `A force of ${F} N drags a box ${d} m along the ground. The force is ${th}° above the direction of motion. How much work does it do?`,
        fields: [
          {
            key: 'W',
            label: 'W',
            unit: 'J',
            value: W,
            tol: tolOf(W),
            traps: [
              { value: F * d, why: 'That is F × d with no cos θ. Only the part of the force along the motion does work.' },
              { value: F * d * Math.sin(toRad(th)), why: 'Work uses cos θ. The sin θ version belongs to the cross product (torque).' }
            ]
          }
        ],
        solution: VS.solveWork(fromPolar(F, toRad(th)), [d, 0, 0])
      }
    }
  },
  {
    id: 'torque',
    label: 'Torque τ = r × F',
    level: 'Advanced',
    about: 'τ = rxFy − ryFx for a force in the xy-plane',
    make: (r) => {
      const rv = vec2(r, -6, 6)
      const Fv = vec2(r, -12, 12)
      const t = cross(rv, Fv)[2]
      return {
        title: 'Torque about the origin',
        prompt: `A force ${compText('F', Fv)} newtons acts at the point ${compText('r', rv)} metres. Find the torque about the origin (its k̂ component).`,
        fields: [
          {
            key: 'tau',
            label: 'τz',
            unit: 'N m',
            value: t,
            tol: tolOf(t),
            traps: [
              { value: dot(rv, Fv), why: 'That is r · F. Torque is the cross product: τ = rxFy − ryFx.' },
              { value: len(rv) * len(Fv), why: 'That is rF with no sin θ. Only the part of the force perpendicular to r turns the body.' },
              { value: -t, why: 'Right size, wrong way round: τ = r × F, not F × r.' }
            ]
          }
        ],
        solution: VS.solveTorque(rv, Fv)
      }
    }
  },
  {
    id: 'projection',
    label: 'Projection of one vector on another',
    level: 'Advanced',
    about: 'B cos θ = (A·B)/|A|',
    make: (r) => {
      const A = { name: 'A', v: vec2(r) }
      const B = { name: 'B', v: vec2(r) }
      const d = dot(A.v, B.v)
      const s = d / len(A.v)
      return {
        title: 'Scalar projection',
        prompt: `Find the projection of B on A (that is B cos θ) for ${compText('A', A.v)} and ${compText('B', B.v)}.`,
        fields: [
          {
            key: 'proj',
            label: 'B cos θ',
            value: s,
            tol: tolOf(s),
            traps: [
              { value: d / len(B.v), why: 'You divided by |B|. The projection of B on A divides by the length of A.' },
              { value: d, why: 'That is A·B. Divide it by |A| to get the projection.' }
            ]
          }
        ],
        solution: VS.solveProjection(B, A)
      }
    }
  }
]

export const topicById = (id: TopicId): Topic => TOPICS.find((t) => t.id === id) ?? TOPICS[0]

/** One problem from a topic. The same seed always gives the same problem. */
export function generate(topic: TopicId, seed = Math.floor(Math.random() * 1e9)): Problem {
  const t = topicById(topic)
  const made = t.make(rngFor(seed))
  return { id: `${topic}-${seed}`, topic, level: t.level, ...made }
}

/** A practice set: `count` problems spread over the chosen topics. */
export function generateSet(topics: TopicId[], count: number, seed = Math.floor(Math.random() * 1e9)): Problem[] {
  const list = topics.length ? topics : TOPICS.map((t) => t.id)
  const r = rngFor(seed)
  return Array.from({ length: count }, (_, i) => generate(list[i % list.length], Math.floor(r() * 1e9)))
}

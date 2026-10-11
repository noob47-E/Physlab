// Minimal immutable 3D vector math. 2D vectors are 3D vectors with z = 0.

export type V3 = [number, number, number]

export const ZERO: V3 = [0, 0, 0]

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
export const neg = (a: V3): V3 => [-a[0], -a[1], -a[2]]
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
]
export const len = (a: V3): number => Math.hypot(a[0], a[1], a[2])
export const dist = (a: V3, b: V3): number => len(sub(a, b))
const lerp = (a: V3, b: V3, t: number): V3 => add(a, scale(sub(b, a), t))
export const mid = (a: V3, b: V3): V3 => lerp(a, b, 0.5)
/**
 * A vector shorter than this has no direction here: normalize gives the zero vector, angleBetween and
 * directionAngles NaN. It is an absolute length, so 3×10⁻¹⁹ î + 4×10⁻¹⁹ ĵ (a force on an electron) loses
 * the direction it has; a floor of exactly 0 is parked for the owner (CW9-N3-2). project below has the
 * same floor squared (10⁻²⁴). The Vectors solver
 * steps round it (math/vectorSolver.ts uses angleOf, and divides by a size under it itself).
 */
// eslint-disable-next-line no-restricted-syntax -- parked for the owner (OWNER-APPROVALS CW9-N3-2): an absolute floor on a length (see above)
export const NO_DIRECTION = 1e-12
export const normalize = (a: V3): V3 => {
  const l = len(a)
  return l < NO_DIRECTION ? [0, 0, 0] : scale(a, 1 / l)
}
const equals = (a: V3, b: V3, eps = 1e-9): boolean => dist(a, b) < eps

/**
 * The angle between two vectors in radians, 0..π, NaN only when one has exactly zero length. atan2 of
 * |a×b| and a·b is stable for tiny and near-π angles and does not depend on the vectors' size while
 * their products fit a double (about 10⁻¹⁶² to 10¹⁵⁴). The
 * one rule for it: angleBetween and the Vectors solver both ask it.
 */
export const angleOf = (a: V3, b: V3): number => (len(a) === 0 || len(b) === 0 ? NaN : Math.atan2(len(cross(a, b)), dot(a, b)))

/** angleOf, NaN for a vector under NO_DIRECTION. */
export const angleBetween = (a: V3, b: V3): number => {
  const la = len(a)
  const lb = len(b)
  if (la < NO_DIRECTION || lb < NO_DIRECTION) return NaN
  return angleOf(a, b)
}

/** Direction of a 2D vector measured counter-clockwise from +x, in radians 0..2π. */
export const heading = (a: V3): number => {
  const t = Math.atan2(a[1], a[0])
  return t < 0 ? t + 2 * Math.PI : t
}

export const fromPolar = (r: number, thetaRad: number): V3 => [r * Math.cos(thetaRad), r * Math.sin(thetaRad), 0]

/** acos that never returns NaN: rounding can push a ratio a hair past ±1. */
export const safeAcos = (x: number): number => Math.acos(Math.max(-1, Math.min(1, x)))

/** Direction cosines angles α, β, γ with the x, y, z axes (radians). */
export const directionAngles = (a: V3): V3 => {
  const l = len(a)
  if (l < NO_DIRECTION) return [NaN, NaN, NaN]
  return [safeAcos(a[0] / l), safeAcos(a[1] / l), safeAcos(a[2] / l)]
}

/** Projection of b onto a (vector). */
export const project = (b: V3, a: V3): V3 => {
  const aa = dot(a, a)
  return aa < 1e-24 ? [0, 0, 0] : scale(a, dot(a, b) / aa)
}

/** Rotate a 2D vector about +z. */
export const rotateZ = (a: V3, rad: number): V3 => {
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return [a[0] * c - a[1] * s, a[0] * s + a[1] * c, a[2]]
}

export const toDeg = (rad: number): number => (rad * 180) / Math.PI
export const toRad = (deg: number): number => (deg * Math.PI) / 180

// ---------------------------------------------------------------------------
// Laying out a vector answer the way a textbook draws it (Fix 2)
// ---------------------------------------------------------------------------

type LayoutRole = 'input' | 'result' | 'helper'
type LayoutStyle = 'head-to-tail' | 'parallelogram' | 'common-tail'

/** A vector of an answer: an input (a card's arrow), the answer, or a helper such as −B. */
interface LayoutVector {
  name: string
  v: V3
  role?: LayoutRole
  /** Where the answer's own picture puts it; an input with none starts at the origin. */
  tail?: V3
}

interface LaidOut {
  name: string
  role: LayoutRole
  tail: V3
  comp: V3
}

interface Layout {
  arrows: LaidOut[]
  /** A parallelogram's far sides: the arrows whose heads are joined to the answer's head. */
  sides: string[]
  /** The style used: a parallelogram needs exactly two vectors being added. */
  style: LayoutStyle
}

/**
 * Where every arrow of a vector answer goes, each vector drawn once. The vectors that add up to
 * the answer (the "chain") are A, B, … for a sum, and A and −B for a subtraction — which is why
 * Subtract used to start both B and −B at A's head: it chained the inputs, not what is added.
 *
 * - head-to-tail: the chain runs from the origin, each tail on the head before it; the answer
 *   closes the triangle from the origin; an input outside the chain (B in A − B) stays at the
 *   origin.
 * - parallelogram: the two chained vectors from the origin, the answer along the diagonal, and
 *   the far sides joined to the answer's head. Anything but two chained vectors is head-to-tail.
 * - common-tail: every vector at its own tail, or the origin.
 */
export function layoutVectors(vs: LayoutVector[], style: LayoutStyle): Layout {
  const inputs = vs.filter((x) => (x.role ?? 'input') === 'input')
  const helpers = vs.filter((x) => x.role === 'helper')
  // A subtraction's helper is the negated input it replaces, and carries its own tail (A's head).
  const negated = helpers.find((h) => h.tail && inputs.some((i) => equals(neg(i.v), h.v)))
  const chain = negated ? [inputs[0], negated] : inputs
  const mode: LayoutStyle = style === 'parallelogram' && chain.length !== 2 ? 'head-to-tail' : style
  const at = new Map<LayoutVector, V3>()
  if (mode === 'head-to-tail') {
    let cursor: V3 = ZERO
    for (const c of chain) {
      at.set(c, cursor)
      cursor = add(cursor, c.v)
    }
  } else if (mode === 'parallelogram') {
    for (const c of chain) at.set(c, ZERO)
  }
  const arrows = vs.map((x): LaidOut => {
    const role = x.role ?? 'input'
    // Outside the chain: an input stays where the student sees it, the answer starts at the origin.
    const tail = at.get(x) ?? (mode === 'common-tail' || role === 'helper' ? (x.tail ?? ZERO) : ZERO)
    return { name: x.name, role, tail, comp: x.v }
  })
  const sides = mode === 'parallelogram' ? chain.map((c) => c.name) : []
  return { arrows, sides, style: mode }
}

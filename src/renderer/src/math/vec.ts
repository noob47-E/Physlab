// Minimal immutable 3D vector math. 2D vectors are 3D vectors with z = 0.

export type V3 = [number, number, number]

export const ZERO: V3 = [0, 0, 0]
export const I_HAT: V3 = [1, 0, 0]
export const J_HAT: V3 = [0, 1, 0]
export const K_HAT: V3 = [0, 0, 1]

export const v3 = (x = 0, y = 0, z = 0): V3 => [x, y, z]
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
export const lerp = (a: V3, b: V3, t: number): V3 => add(a, scale(sub(b, a), t))
export const mid = (a: V3, b: V3): V3 => lerp(a, b, 0.5)
export const normalize = (a: V3): V3 => {
  const l = len(a)
  return l < 1e-12 ? [0, 0, 0] : scale(a, 1 / l)
}
export const isZero = (a: V3, eps = 1e-12): boolean => len(a) < eps
export const equals = (a: V3, b: V3, eps = 1e-9): boolean => dist(a, b) < eps
export const is2D = (a: V3): boolean => Math.abs(a[2]) < 1e-12

/** Angle between two vectors in radians, 0..π. */
export const angleBetween = (a: V3, b: V3): number => {
  const la = len(a)
  const lb = len(b)
  if (la < 1e-12 || lb < 1e-12) return NaN
  // atan2 of |a×b| and a·b is numerically stable for tiny and near-π angles.
  return Math.atan2(len(cross(a, b)), dot(a, b))
}

/** Direction of a 2D vector measured counter-clockwise from +x, in radians 0..2π. */
export const heading = (a: V3): number => {
  const t = Math.atan2(a[1], a[0])
  return t < 0 ? t + 2 * Math.PI : t
}

export const fromPolar = (r: number, thetaRad: number): V3 => [r * Math.cos(thetaRad), r * Math.sin(thetaRad), 0]

/** Direction cosines angles α, β, γ with the x, y, z axes (radians). */
export const directionAngles = (a: V3): V3 => {
  const l = len(a)
  if (l < 1e-12) return [NaN, NaN, NaN]
  return [Math.acos(a[0] / l), Math.acos(a[1] / l), Math.acos(a[2] / l)]
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

import { add, angleBetween, cross, dist, dot, len, mid, normalize, scale, sub, type V3 } from './vec'
import { fmt } from './format'

export type LineKind = 'line' | 'segment' | 'ray'

/** A line-like object: points p + t·d. Segment: t ∈ [0,1]; ray: t ≥ 0. */
export interface GLine {
  kind: LineKind
  p: V3
  d: V3
}

export interface GCircle {
  c: V3
  r: number
}

const EPS = 1e-10

export const lineThrough = (a: V3, b: V3, kind: LineKind = 'line'): GLine => ({ kind, p: a, d: sub(b, a) })

export function paramInRange(kind: LineKind, t: number): boolean {
  if (kind === 'segment') return t >= -1e-9 && t <= 1 + 1e-9
  if (kind === 'ray') return t >= -1e-9
  return true
}

export function lineLineIntersection(l1: GLine, l2: GLine): V3 | null {
  const denom = l1.d[0] * l2.d[1] - l1.d[1] * l2.d[0]
  if (Math.abs(denom) < EPS) return null
  const w = sub(l2.p, l1.p)
  const t = (w[0] * l2.d[1] - w[1] * l2.d[0]) / denom
  const u = (w[0] * l1.d[1] - w[1] * l1.d[0]) / denom
  if (!paramInRange(l1.kind, t) || !paramInRange(l2.kind, u)) return null
  const p1 = add(l1.p, scale(l1.d, t))
  // The maths above only looks at x and y. Two lines that cross on paper can pass at different
  // heights (skew lines): the meeting point has to agree in z as well, or there is none.
  const p2 = add(l2.p, scale(l2.d, u))
  if (Math.abs(p1[2] - p2[2]) > 1e-6) return null
  return p1
}

export function lineCircleIntersection(l: GLine, c: GCircle): V3[] {
  const f = sub(l.p, c.c)
  const A = dot(l.d, l.d)
  const B = 2 * dot(f, l.d)
  const C = dot(f, f) - c.r * c.r
  const disc = B * B - 4 * A * C
  if (A < EPS || disc < -EPS) return []
  if (Math.abs(disc) <= EPS) {
    const t = -B / (2 * A)
    return paramInRange(l.kind, t) ? [add(l.p, scale(l.d, t))] : []
  }
  const s = Math.sqrt(disc)
  return [(-B - s) / (2 * A), (-B + s) / (2 * A)]
    .filter((t) => paramInRange(l.kind, t))
    .map((t) => add(l.p, scale(l.d, t)))
}

export function circleCircleIntersection(c1: GCircle, c2: GCircle): V3[] {
  // Two circles only meet if they lie in the same plane; the offset below is a flat one.
  if (Math.abs(c1.c[2] - c2.c[2]) > EPS) return []
  const d = dist(c1.c, c2.c)
  if (d < EPS || d > c1.r + c2.r + EPS || d < Math.abs(c1.r - c2.r) - EPS) return []
  const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d)
  const h2 = c1.r * c1.r - a * a
  const h = h2 > 0 ? Math.sqrt(h2) : 0
  const u = scale(sub(c2.c, c1.c), 1 / d)
  const base = add(c1.c, scale(u, a))
  if (h < 1e-9) return [base]
  const perp: V3 = [-u[1], u[0], 0]
  return [add(base, scale(perp, h)), sub(base, scale(perp, h))]
}

export function footOfPerpendicular(p: V3, l: GLine): V3 {
  const dd = dot(l.d, l.d)
  if (dd < EPS) return l.p
  const t = dot(sub(p, l.p), l.d) / dd
  return add(l.p, scale(l.d, t))
}

export function distancePointLine(p: V3, l: GLine): number {
  return dist(p, footOfPerpendicular(p, l))
}

/** Distance from p to a line-like object, honouring segment/ray limits. */
export function distanceToLineLike(p: V3, l: GLine): number {
  const dd = dot(l.d, l.d)
  if (dd < EPS) return dist(p, l.p)
  let t = dot(sub(p, l.p), l.d) / dd
  if (l.kind === 'segment') t = Math.min(1, Math.max(0, t))
  if (l.kind === 'ray') t = Math.max(0, t)
  return dist(p, add(l.p, scale(l.d, t)))
}

export function circleFrom3(a: V3, b: V3, c: V3): GCircle | null {
  const center = circumcenter(a, b, c)
  return center ? { c: center, r: dist(center, a) } : null
}

export function circumcenter(a: V3, b: V3, c: V3): V3 | null {
  // The formula below is 2D only, so a tilted 3D triangle would get a wrong centre.
  const z = a[2]
  if (Math.abs(b[2] - z) > 1e-9 || Math.abs(c[2] - z) > 1e-9) return null
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]))
  if (Math.abs(d) < EPS) return null
  const a2 = a[0] * a[0] + a[1] * a[1]
  const b2 = b[0] * b[0] + b[1] * b[1]
  const c2 = c[0] * c[0] + c[1] * c[1]
  return [
    (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d,
    (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d,
    z
  ]
}

/** Signed area (counter-clockwise positive) of a planar polygon in the xy plane. */
export function signedArea2D(pts: V3[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    s += p[0] * q[1] - q[0] * p[1]
  }
  return s / 2
}

/** Area of any planar polygon in 3D. */
export function polygonArea(pts: V3[]): number {
  if (pts.length < 3) return 0
  let acc: V3 = [0, 0, 0]
  for (let i = 0; i < pts.length; i++) acc = add(acc, cross(pts[i], pts[(i + 1) % pts.length]))
  return len(acc) / 2
}

export function perimeter(pts: V3[], closed = true): number {
  let s = 0
  const n = closed ? pts.length : pts.length - 1
  for (let i = 0; i < n; i++) s += dist(pts[i], pts[(i + 1) % pts.length])
  return s
}

export function centroid(pts: V3[]): V3 {
  const s = pts.reduce<V3>((acc, p) => add(acc, p), [0, 0, 0])
  return scale(s, 1 / Math.max(1, pts.length))
}

/** Interior angle at `vertex` between rays to a and b, 0..π. */
export function angleAt(a: V3, vertex: V3, b: V3): number {
  return angleBetween(sub(a, vertex), sub(b, vertex))
}

/** Counter-clockwise angle from ray vertex→a to ray vertex→b, 0..2π (2D). */
export function orientedAngleAt(a: V3, vertex: V3, b: V3): number {
  const u = sub(a, vertex)
  const v = sub(b, vertex)
  let t = Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])
  if (t < 0) t += 2 * Math.PI
  return t
}

export interface TriangleInfo {
  /** Side lengths opposite each vertex: a = |BC|, b = |CA|, c = |AB|. */
  sides: [number, number, number]
  /** Interior angles at A, B, C in radians. */
  angles: [number, number, number]
  area: number
  perimeter: number
  bySides: 'equilateral' | 'isosceles' | 'scalene'
  byAngles: 'acute' | 'right' | 'obtuse'
  centroid: V3
  circumcenter: V3 | null
  circumradius: number
  incenter: V3
  inradius: number
  orthocenter: V3 | null
  /** Altitudes from A, B, C. */
  heights: [number, number, number]
  degenerate: boolean
}

export function triangleInfo(A: V3, B: V3, C: V3): TriangleInfo {
  const a = dist(B, C)
  const b = dist(C, A)
  const c = dist(A, B)
  const area = polygonArea([A, B, C])
  const per = a + b + c
  const angA = angleAt(B, A, C)
  const angB = angleAt(C, B, A)
  const angC = angleAt(A, C, B)
  const tol = 1e-6 * Math.max(a, b, c, 1)
  const eq = (x: number, y: number) => Math.abs(x - y) < tol
  const bySides = eq(a, b) && eq(b, c) ? 'equilateral' : eq(a, b) || eq(b, c) || eq(a, c) ? 'isosceles' : 'scalene'
  const maxAng = Math.max(angA, angB, angC)
  const byAngles = Math.abs(maxAng - Math.PI / 2) < 1e-6 ? 'right' : maxAng > Math.PI / 2 ? 'obtuse' : 'acute'
  const cc = circumcenter(A, B, C)
  const incenter: V3 = per > EPS ? scale(add(add(scale(A, a), scale(B, b)), scale(C, c)), 1 / per) : A
  const orthocenter = cc ? sub(add(add(A, B), C), scale(cc, 2)) : null
  return {
    sides: [a, b, c],
    angles: [angA, angB, angC],
    area,
    perimeter: per,
    bySides,
    byAngles,
    centroid: centroid([A, B, C]),
    circumcenter: cc,
    circumradius: area > EPS ? (a * b * c) / (4 * area) : Infinity,
    incenter,
    inradius: per > EPS ? (2 * area) / per : 0,
    orthocenter,
    heights: [a > EPS ? (2 * area) / a : 0, b > EPS ? (2 * area) / b : 0, c > EPS ? (2 * area) / c : 0],
    degenerate: area < 1e-12
  }
}

export interface LineEquation {
  /** ax + by = c */
  a: number
  b: number
  c: number
  slope: number
  yIntercept: number
  xIntercept: number
  /** Inclination with +x axis, 0..π */
  inclination: number
}

export function lineEquation(p: V3, q: V3): LineEquation {
  const a = q[1] - p[1]
  const b = p[0] - q[0]
  const c = a * p[0] + b * p[1]
  const slope = Math.abs(b) < EPS ? Infinity : -a / b
  let inc = Math.atan2(q[1] - p[1], q[0] - p[0])
  if (inc < 0) inc += Math.PI
  if (inc >= Math.PI - 1e-12) inc -= Math.PI
  return {
    a,
    b,
    c,
    slope,
    yIntercept: Math.abs(b) < EPS ? NaN : c / b,
    xIntercept: Math.abs(a) < EPS ? NaN : c / a,
    inclination: inc
  }
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

/** "3x", "x", "−x", "0.5y": a coefficient and its letter, 1 left unwritten. */
function coeffTerm(k: number, letter: string, digits: number): string {
  const t = fmt(Math.abs(k), digits)
  return `${k < 0 ? '−' : ''}${t === '1' ? '' : t}${letter}`
}

/**
 * A line's equation as a teacher writes it: y = 6 for a level line, x = −2 for an upright one,
 * otherwise ax + by = c with the x coefficient positive, whole-number coefficients cut down by
 * their common factor, no 1 written before a letter and no zero term. The raw a, b, c used to be
 * printed as they came — "0x − 4y = −24" for y = 6, and "− −" wherever a term was negative.
 */
export function lineEquationText(eq: Pick<LineEquation, 'a' | 'b' | 'c'>, digits = 3): string {
  let { a, b, c } = eq
  let big = Math.max(Math.abs(a), Math.abs(b))
  if (!(big > 0)) return 'undefined'
  // A very short segment's coefficients all print as 0: its equation is scaled up first.
  if (fmt(big, digits) === '0') [a, b, c, big] = [a / big, b / big, c / big, 1]
  // A term is left out when it would print as 0, not only when it is 0: a dragged segment from
  // (0, 0) to (3, 0.0004) has a = 0.0004, which read "0x − 3y = 0".
  const zero = (v: number) => Math.abs(v) <= 1e-9 * big || fmt(Math.abs(v), digits) === '0'
  if (zero(a)) return `y = ${fmt(c / b, digits)}`
  if (zero(b)) return `x = ${fmt(c / a, digits)}`
  if (a < 0) [a, b, c] = [-a, -b, -c]
  const whole = [a, b, c].every((v) => Math.abs(v - Math.round(v)) < 1e-9)
  if (whole) {
    const g = [a, b, c].map((v) => Math.abs(Math.round(v))).reduce((x, y) => gcd(x, y))
    if (g > 1) [a, b, c] = [a / g, b / g, c / g]
  }
  const yTerm = coeffTerm(b, 'y', digits)
  return `${coeffTerm(a, 'x', digits)} ${yTerm.startsWith('−') ? `− ${yTerm.slice(1)}` : `+ ${yTerm}`} = ${fmt(zero(c) ? 0 : c, digits)}`
}

/** (x + 4)² + (y + 1)² = 4: the sign folded into the bracket, and x² for a centre on an axis. */
export function circleEquationText(centre: V3, r: number, digits = 3): string {
  const part = (letter: string, h: number) => {
    const t = fmt(Math.abs(h), digits)
    return t === '0' ? `${letter}²` : `(${letter} ${h < 0 ? '+' : '−'} ${t})²`
  }
  return `${part('x', centre[0])} + ${part('y', centre[1])} = ${fmt(r * r, digits)}`
}

export function perpendicularBisector(a: V3, b: V3): GLine {
  const d = sub(b, a)
  return { kind: 'line', p: mid(a, b), d: [-d[1], d[0], 0] }
}

/** Internal angle bisector at vertex between rays to a and b. */
export function angleBisector(a: V3, vertex: V3, b: V3): GLine {
  const u = normalize(sub(a, vertex))
  const v = normalize(sub(b, vertex))
  let d = add(u, v)
  // Opposite arms: any perpendicular will do, but it must not be the zero vector.
  if (len(d) < EPS) d = Math.abs(u[0]) > EPS || Math.abs(u[1]) > EPS ? [-u[1], u[0], 0] : [1, 0, 0]
  return { kind: 'line', p: vertex, d }
}

export function tangentPointsFromPoint(p: V3, c: GCircle): V3[] {
  const d = dist(p, c.c)
  if (d < c.r - EPS) return []
  if (Math.abs(d - c.r) < EPS) return [p]
  // Tangent points are the intersections with the circle on diameter p–center.
  return circleCircleIntersection(c, { c: mid(p, c.c), r: d / 2 })
}

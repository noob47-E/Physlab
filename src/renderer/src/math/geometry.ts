import { add, angleBetween, cross, dist, dot, len, mid, normalize, scale, sub, type V3 } from './vec'
import { DISPLAY_FLOOR, fmt } from './format'

type LineKind = 'line' | 'segment' | 'ray'

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

function paramInRange(kind: LineKind, t: number): boolean {
  if (kind === 'segment') return t >= -1e-9 && t <= 1 + 1e-9
  if (kind === 'ray') return t >= -1e-9
  return true
}

export function lineLineIntersection(l1: GLine, l2: GLine): V3 | null {
  if (l1.d[2] !== 0 || l2.d[2] !== 0) return lineLineIntersection3D(l1, l2)
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

/**
 * Where two lines meet when either leaves the level: the closest points of the two, which must
 * coincide. Read in x and y only, two lines crossing in an upright plane had no x–y cross and were
 * "parallel — none".
 */
function lineLineIntersection3D(l1: GLine, l2: GLine): V3 | null {
  const n = cross(l1.d, l2.d)
  const nn = dot(n, n)
  if (nn <= 1e-20 * dot(l1.d, l1.d) * dot(l2.d, l2.d)) return null
  const w = sub(l2.p, l1.p)
  const t = dot(cross(w, l2.d), n) / nn
  const u = dot(cross(w, l1.d), n) / nn
  if (!paramInRange(l1.kind, t) || !paramInRange(l2.kind, u)) return null
  const p1 = add(l1.p, scale(l1.d, t))
  // Skew lines pass each other: their closest points are apart.
  if (dist(p1, add(l2.p, scale(l2.d, u))) > 1e-6 * Math.max(1, len(w), len(l1.d), len(l2.d))) return null
  return p1
}

/**
 * Where a line meets a circle. A circle lies level, at its centre's height: the line meets it where
 * it crosses that level, and only if that point is on the circle. It used to be met as a sphere, so
 * a line straight down through the centre met a circle of radius 1 at (0, 0, ±1).
 */
export function lineCircleIntersection(l: GLine, c: GCircle): V3[] {
  const dz = l.d[2]
  if (Math.abs(dz) > EPS * Math.max(1, len(l.d))) {
    const t = (c.c[2] - l.p[2]) / dz
    if (!paramInRange(l.kind, t)) return []
    const p = add(l.p, scale(l.d, t))
    return Math.abs(dist(p, c.c) - c.r) <= 1e-9 * Math.max(1, c.r) ? [[p[0], p[1], c.c[2]]] : []
  }
  if (Math.abs(l.p[2] - c.c[2]) > 1e-9 * Math.max(1, c.r)) return []
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

function circumcenter(a: V3, b: V3, c: V3): V3 | null {
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

/**
 * Signed area (counter-clockwise positive) of a planar polygon in the xy plane. It reads x and y
 * only, so a caller lays the corners flat first; a shape in any other plane goes through
 * polygonPlane, whose `flat` corners this reads correctly.
 */
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

/**
 * How far corners may lie off one plane and still make a flat shape, as a fraction of the
 * polygon's size (the distance from its centre to its farthest corner): one part in a thousand.
 * - Rounding dust (about 1e-16) and a corner nudged by 1e-8 are far inside it.
 * - Corners typed to 3 decimal places move up to √3 × 0.0005 ≈ 0.0009 off their true plane. Of
 *   20 000 tilted regular polygons typed that way, none whose corners lie 1 or more from its
 *   centre was bent past it (the worst, 0.00082); a smaller shape typed that coarsely can be,
 *   and is then called skew, since its typed corners really are not in one plane.
 * - A bend inside it changes sides and angles only to second order (about a millionth), far
 *   below the 0.2 % and 0.25° the shape names allow, so the flat name stays the right one.
 * - A corner lifted on purpose by a few thousandths of the shape's size is caught: a 2 × 2
 *   square with one corner raised 0.006 is called skew.
 */
const PLANAR_TOL = 1e-3

/** A polygon's own plane, with its corners laid out in it. */
interface PolygonPlane {
  /** Unit normal: seen from its tip, the corners run anticlockwise. */
  normal: V3
  /** The corners' average; the plane passes through it. */
  origin: V3
  /** Unit axes along the plane, at right angles, with u × v = normal. */
  u: V3
  v: V3
  /**
   * Each corner p as [(p − origin)·u, (p − origin)·v, 0]: lengths and angles kept, and the
   * corners run anticlockwise, so 2-D code (signedArea2D, interiorAngles) reads them as it would
   * a shape drawn on the page.
   */
  flat: V3[]
  /** Every corner lies within relTol × size of the plane (size: the farthest corner's distance from origin). */
  planar: boolean
}

/**
 * The plane a polygon lies in, found from Newell's normal, with its corners laid out flat in that
 * plane: for a shape anywhere in space, not only one on the page. Null when there is no plane to
 * find: fewer than three corners, all of them on one line, or a shape crossing itself whose two
 * loops have equal areas going opposite ways (Newell's normal is then nothing).
 */
export function polygonPlane(pts: V3[], relTol = PLANAR_TOL): PolygonPlane | null {
  if (pts.length < 3) return null
  const origin = centroid(pts)
  const rel = pts.map((p) => sub(p, origin))
  // Newell's normal: the sides' cross products added up give twice the area, pointing the way a
  // right hand curls round the corners. Unlike the cross product at one corner, it is not thrown
  // by a corner in line with its neighbours or one sitting slightly off the plane; taken about the
  // centre, a shape far from the origin loses no digits to it.
  let n: V3 = [0, 0, 0]
  for (let i = 0; i < rel.length; i++) n = add(n, cross(rel[i], rel[(i + 1) % rel.length]))
  const size = rel.reduce((m, r) => Math.max(m, len(r)), 0)
  // eslint-disable-next-line no-restricted-syntax -- relative already (10⁻¹² of the sizes); math/noise.ts says 10⁻¹⁵, and which number is the owner's (OWNER-APPROVALS CW9-N2-1, with CW9-N3-1)
  if (!(len(n) > 1e-12 * size * size)) return null
  const normal = normalize(n)
  const planar = rel.every((r) => Math.abs(dot(r, normal)) <= relTol * size)
  // Axes along the plane: v across the normal from the x axis (from the y axis when the normal is
  // near the x axis, where that cross product fades away), then u = v × normal. So u × v = normal,
  // and the corners run anticlockwise in (u, v) just as they do seen from the normal's tip. For a
  // shape on the page listed anticlockwise, u and v are the x and y axes themselves.
  const v = normalize(cross(normal, Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]))
  const u = cross(v, normal)
  return { normal, origin, u, v, flat: rel.map((r): V3 => [dot(r, u), dot(r, v), 0]), planar }
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

interface TriangleInfo {
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
    // eslint-disable-next-line no-restricted-syntax -- an area in grid squares, the drawing's fixed scale: a triangle under 10⁻¹² square units is a line
    degenerate: area < 1e-12
  }
}

interface LineEquation {
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
  // eslint-disable-next-line no-restricted-syntax -- an angle in radians, a fixed scale: a level line drawn backwards (atan2 gives π) has inclination 0
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

const point3 = (p: V3, digits: number) => `(${fmt(p[0], digits)}, ${fmt(p[1], digits)}, ${fmt(p[2], digits)})`

/**
 * The equation of the line through p and q, true in 3-D: on the page, the textbook form; level
 * above it, that and its height ("y = 6, z = 2"); climbing, the vector form r = p + t(q − p). It
 * used to be the line's shadow's equation, so (0, 0, 0)–(1, 1, 1) read "x − y = 0".
 */
export function lineEquation3DText(p: V3, q: V3, digits = 3): string {
  if (p[2] !== q[2]) return `r = ${point3(p, digits)} + t${point3(sub(q, p), digits)}`
  const flat = lineEquationText(lineEquation(p, q), digits)
  return Math.abs(p[2]) > DISPLAY_FLOOR ? `${flat}, z = ${fmt(p[2], digits)}` : flat
}

/** A circle's equation with its height when it is not on the page: "x² + y² = 4, z = 5". */
export function circleEquation3DText(centre: V3, r: number, digits = 3): string {
  const flat = circleEquationText(centre, r, digits)
  return Math.abs(centre[2]) > DISPLAY_FLOOR ? `${flat}, z = ${fmt(centre[2], digits)}` : flat
}

export function perpendicularBisector(a: V3, b: V3): GLine {
  const d = sub(b, a)
  // A segment straight up has no level direction across it; any level one is square to it.
  const across: V3 = [-d[1], d[0], 0]
  // eslint-disable-next-line no-restricted-syntax -- relative already (10⁻¹² of the sizes); math/noise.ts says 10⁻¹⁵, and which number is the owner's (OWNER-APPROVALS CW9-N2-1, with CW9-N3-1)
  return { kind: 'line', p: mid(a, b), d: len(across) > 1e-12 * len(d) ? across : [1, 0, 0] }
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

// Shape recognition: classify exact polygons, and turn rough freehand strokes into perfect shapes.

import { add, angleBetween, cross, dist, dot, len, normalize, scale, sub, type V3 } from './vec'
import { centroid, polygonArea, polygonPlane, signedArea2D } from './geometry'

export type ShapeKind =
  | 'equilateral-triangle'
  | 'right-isosceles-triangle'
  | 'right-triangle'
  | 'isosceles-triangle'
  | 'scalene-triangle'
  | 'square'
  | 'rectangle'
  | 'rhombus'
  | 'parallelogram'
  | 'isosceles-trapezium'
  | 'trapezium'
  | 'kite'
  | 'regular-polygon'
  | 'polygon'
  /** Corners that do not all lie in one plane: not a flat shape, so no flat name fits. */
  | 'skew'
  /** Two of its sides cross (a bow-tie): no single inside, so no flat name fits. */
  | 'crossed'
  /** All its corners on one line (or on top of each other): it encloses nothing. */
  | 'degenerate'

export interface ShapeClass {
  kind: ShapeKind
  /** Human name, e.g. "Rectangle", "Regular hexagon", "Concave polygon". */
  name: string
  n: number
  convex: boolean
  /** Every interior angle is 90° or 270°. */
  rectilinear: boolean
  /** For trapeziums: indices [i, i+1] and [j, j+1] of the parallel sides. */
  parallelSides?: [number, number]
  /**
   * Only for kinds 'skew', 'crossed' and 'degenerate': one plain sentence telling the student why
   * the shape has no flat name, area or interior angles.
   */
  notAShape?: string
}

const POLY_NAMES: Record<number, string> = { 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon', 12: 'dodecagon' }

function polygonName(n: number): string {
  return POLY_NAMES[n] ?? `${n}-gon`
}

/**
 * Every corner at the same height: the shape lies level, like one drawn on the page, so plain
 * x–y maths measures it exactly. Such shapes keep the code they always had, bit for bit; the 2-D
 * callers (decompose, lego) set z to 0 themselves and always land here.
 */
const levelInXY = (pts: V3[]) => pts.every((p) => p[2] === pts[0][2])

/**
 * Interior angle at each corner (radians, 0..2π, reflex angles kept) of a simple polygon,
 * measured in the polygon's own plane, whichever way round its corners are listed. A shape that
 * is not level is laid flat in its plane first: read from above it was only its shadow, so an
 * upright square (a line from above) had four angles of 0. Corners not all in one plane are
 * measured as seen face-on along their Newell normal (classifyPolygon calls them skew).
 */
export function interiorAngles(pts: V3[]): number[] {
  if (!levelInXY(pts)) {
    const plane = polygonPlane(pts)
    // Laid flat the corners are level and run anticlockwise, so the code below measures them.
    if (plane) return interiorAngles(plane.flat)
  }
  const n = pts.length
  const ccw = signedArea2D(pts) >= 0
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n]
    const next = pts[(i + 1) % n]
    const u = sub(prev, p)
    const v = sub(next, p)
    // Angle from v to u measured counter-clockwise gives the interior angle for CCW polygons.
    let a = Math.atan2(v[0] * u[1] - v[1] * u[0], v[0] * u[0] + v[1] * u[1])
    if (a < 0) a += 2 * Math.PI
    return ccw ? a : 2 * Math.PI - a
  })
}

export function sideLengths(pts: V3[]): number[] {
  return pts.map((p, i) => dist(p, pts[(i + 1) % pts.length]))
}

/**
 * How thin the triangle a corner makes with its two neighbours must be before cleanPolygon may
 * count the corner as in line: its least height at most this fraction of its longest side. A
 * corner standing off its neighbours' line by more than a thousandth is a corner at any size.
 */
const THIN = 1e-3

/**
 * Removes duplicate corners, and corners in line with their two neighbours.
 *
 * A corner is in line when twice the triangle it makes with its neighbours, |ab × ac|, is at most
 * eps × (the gap a–c, or 1 if that is shorter) — the rule as it always was, which every 2-D
 * caller is tuned to: decompose and lego round corners to 1e-9 and merge corners that nearly
 * meet, so a corner meant to lie on a side can sit 1e-9 or more off it, and on a short side that
 * rule allows a little more than eps. A purely relative test (a fraction of the side) was finer
 * than that dust on short sides and changed how shapes of ordinary size were cut up.
 *
 * But that rule weighs an area against a length, so the height it allows, eps ÷ gap, outgrows a
 * small shape: every square smaller than about 0.00003 lost a corner and became a triangle. So a
 * corner also has to make a THIN triangle before it can go; that test compares length with
 * length, the same at every size, and a corner that stands clearly off the line fails it (a
 * square's makes 0.5). It never overrules the old rule for a triangle whose longest side is
 * √(eps ÷ THIN) or more: 0.001 at the default eps, 0.03 at lego's 1e-6.
 *
 * The whole cross product is read, so a shape in any plane is judged alike; only its z part used
 * to be, which is 0 for a shape standing upright, so every corner of an upright square looked in
 * line. For a level shape the whole length equals |z part|, so its decisions are unchanged.
 */
export function cleanPolygon(pts: V3[], eps = 1e-9): V3[] {
  let out = pts.filter((p, i) => dist(p, pts[(i + 1) % pts.length]) > eps)
  let changed = true
  while (changed && out.length > 3) {
    changed = false
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length]
      const b = out[i]
      const c = out[(i + 1) % out.length]
      // Twice the triangle's area, in whatever plane it lies.
      const area2 = len(cross(sub(b, a), sub(c, a)))
      const longest = Math.max(dist(a, b), dist(b, c), dist(a, c))
      if (area2 <= eps * Math.max(1, dist(a, c)) && area2 <= THIN * longest * longest) {
        out = out.filter((_, j) => j !== i)
        changed = true
        break
      }
    }
  }
  return out
}

const near = (a: number, b: number, rel: number) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-12)

function parallel(d1: V3, d2: V3, tolRad: number): boolean {
  const a = angleBetween(d1, d2)
  return a < tolRad || Math.PI - a < tolRad
}

/** What a student is told when a polygon's corners do not all lie in one plane. */
const NOT_FLAT = 'Its corners do not all lie in one flat plane, so it is not a flat shape and has no area or interior angles of its own.'
const CROSSED = 'Two of its sides cross each other, so it has no single inside and no area or interior angles of its own.'
const IN_LINE = 'All its corners lie on one straight line, so it encloses nothing and has no area or interior angles.'

/**
 * Whether two sides that share no corner cross, read in x and y (the caller lays the corners flat
 * first). Only a true crossing counts: a corner that just touches another side, as when a corner is
 * dragged onto it, leaves a shape with one inside still.
 */
function sidesCross(pts: V3[]): boolean {
  const n = pts.length
  const size = pts.reduce((m, p) => Math.max(m, Math.abs(p[0] - pts[0][0]), Math.abs(p[1] - pts[0][1])), 0)
  const tiny = 1e-12 * size * size
  const side = (a: V3, b: V3, c: V3) => {
    const o = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    return o > tiny ? 1 : o < -tiny ? -1 : 0
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      const [a, b, c, d] = [pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n]]
      const s1 = side(a, b, c)
      const s2 = side(a, b, d)
      const s3 = side(c, d, a)
      const s4 = side(c, d, b)
      if (s1 * s2 < 0 && s3 * s4 < 0) return true
    }
  }
  return false
}

/** A triangle all but flat by cleanPolygon's own rule: the one it uses to drop a corner in line. */
function inLine([a, b, c]: V3[], eps = 1e-9): boolean {
  const area2 = len(cross(sub(b, a), sub(c, a)))
  const longest = Math.max(dist(a, b), dist(b, c), dist(a, c))
  return area2 <= eps * Math.max(1, dist(a, c)) && area2 <= THIN * longest * longest
}

/**
 * Classify a polygon exactly (within small tolerances). Used live for every polygon in the scene,
 * so dragging a rectangle's corner turns it into a parallelogram or trapezium immediately.
 */
export function classifyPolygon(input: V3[], tolDeg = 0.25, tolRel = 0.002): ShapeClass {
  let pts = cleanPolygon(input)
  // Corners in a line used to be named from their sides: (0, 0), (1, 0), (2, 0) has sides 1, 1, 2,
  // so it was an "Isosceles triangle" with angles 0°, 180°, 0°. cleanPolygon takes in-line corners
  // away down to three, so three is where such a shape shows.
  if (pts.length < 3 || (pts.length === 3 && inLine(pts))) {
    return { kind: 'degenerate', name: 'Corners in a line', n: pts.length, convex: false, rectilinear: false, notAShape: IN_LINE }
  }
  const crossed = (): ShapeClass => {
    const m = pts.length
    return { kind: 'crossed', name: `Crossed ${m === 4 ? 'quadrilateral' : polygonName(m)}`, n: m, convex: false, rectilinear: false, notAShape: CROSSED }
  }
  if (!levelInXY(pts)) {
    // A shape that is not level is named in its own plane: laid flat there it gets the name the
    // same shape gets on the page (it used to be named from its shadow on the x–y plane, so an
    // upright square was a triangle and a skew quadrilateral a kite). Corners that do not lie in
    // one plane make no flat shape, so no flat name is true of them.
    const plane = polygonPlane(pts)
    if (plane && !plane.planar && pts.length >= 4) {
      const m = pts.length
      return { kind: 'skew', name: `Skew ${m === 4 ? 'quadrilateral' : polygonName(m)}`, n: m, convex: false, rectilinear: false, notAShape: NOT_FLAT }
    }
    // No plane at all with four or more corners left: a bow-tie whose two loops cancel exactly.
    if (!plane) return crossed()
    pts = plane.flat
  }
  // A bow-tie used to be a "Concave quadrilateral" (angles 45°, 315°, 315°, 45°) with area 0, or the
  // difference of its loops when they differ.
  if (sidesCross(pts)) return crossed()
  const n = pts.length
  const tol = (tolDeg * Math.PI) / 180
  const angles = n >= 3 ? interiorAngles(pts) : []
  const sides = sideLengths(pts)
  const convex = angles.every((a) => a <= Math.PI + tol)
  const rectilinear = n >= 4 && angles.every((a) => Math.abs(a - Math.PI / 2) < tol || Math.abs(a - 1.5 * Math.PI) < tol)
  const base = { n, convex, rectilinear }

  if (n === 3) {
    const [a, b, c] = sides
    const right = angles.some((x) => Math.abs(x - Math.PI / 2) < tol)
    const eqAll = near(a, b, tolRel) && near(b, c, tolRel)
    const iso = near(a, b, tolRel) || near(b, c, tolRel) || near(a, c, tolRel)
    if (eqAll) return { ...base, kind: 'equilateral-triangle', name: 'Equilateral triangle' }
    if (right && iso) return { ...base, kind: 'right-isosceles-triangle', name: 'Right isosceles triangle' }
    if (right) return { ...base, kind: 'right-triangle', name: 'Right-angled triangle' }
    if (iso) return { ...base, kind: 'isosceles-triangle', name: 'Isosceles triangle' }
    return { ...base, kind: 'scalene-triangle', name: 'Scalene triangle' }
  }

  if (n === 4 && convex) {
    const d = pts.map((p, i) => sub(pts[(i + 1) % 4], p))
    const p02 = parallel(d[0], d[2], tol)
    const p13 = parallel(d[1], d[3], tol)
    const allEqual = sides.every((s) => near(s, sides[0], tolRel))
    const rightAll = angles.every((x) => Math.abs(x - Math.PI / 2) < tol)
    if (p02 && p13) {
      if (rightAll && allEqual) return { ...base, kind: 'square', name: 'Square' }
      if (rightAll) return { ...base, kind: 'rectangle', name: 'Rectangle' }
      if (allEqual) return { ...base, kind: 'rhombus', name: 'Rhombus' }
      return { ...base, kind: 'parallelogram', name: 'Parallelogram' }
    }
    if (p02 || p13) {
      const parallelSides: [number, number] = p02 ? [0, 2] : [1, 3]
      const legs = p02 ? [sides[1], sides[3]] : [sides[0], sides[2]]
      if (near(legs[0], legs[1], tolRel)) return { ...base, kind: 'isosceles-trapezium', name: 'Isosceles trapezium', parallelSides }
      return { ...base, kind: 'trapezium', name: 'Trapezium', parallelSides }
    }
    if ((near(sides[0], sides[1], tolRel) && near(sides[2], sides[3], tolRel)) || (near(sides[1], sides[2], tolRel) && near(sides[3], sides[0], tolRel))) {
      return { ...base, kind: 'kite', name: 'Kite' }
    }
  }

  if (n >= 5 && convex && sides.every((s) => near(s, sides[0], tolRel)) && angles.every((a) => Math.abs(a - angles[0]) < tol)) {
    return { ...base, kind: 'regular-polygon', name: `Regular ${polygonName(n)}` }
  }

  const label = n === 4 ? 'quadrilateral' : polygonName(n)
  return { ...base, kind: 'polygon', name: `${convex ? '' : 'Concave '}${convex ? label[0].toUpperCase() + label.slice(1) : label}` }
}

// ---------------------------------------------------------------------------
// Freehand stroke recognition
// ---------------------------------------------------------------------------

type Recognized =
  | { kind: 'segment'; a: V3; b: V3 }
  | { kind: 'circle'; center: V3; r: number }
  | { kind: 'polygon'; pts: V3[]; label: string }
  | { kind: 'none'; reason: string }

/** Ramer–Douglas–Peucker simplification (open polyline). */
function rdp(points: V3[], eps: number): V3[] {
  if (points.length < 3) return points
  const a = points[0]
  const b = points[points.length - 1]
  const ab = sub(b, a)
  const abLen = len(ab)
  let maxD = -1
  let idx = 0
  for (let i = 1; i < points.length - 1; i++) {
    const d = abLen < 1e-12 ? dist(points[i], a) : Math.abs(cross(ab, sub(points[i], a))[2]) / abLen
    if (d > maxD) {
      maxD = d
      idx = i
    }
  }
  if (maxD <= eps) return [a, b]
  const left = rdp(points.slice(0, idx + 1), eps)
  const right = rdp(points.slice(idx), eps)
  return [...left.slice(0, -1), ...right]
}

function resample(points: V3[], spacing: number): V3[] {
  const out: V3[] = [points[0]]
  let acc = 0
  for (let i = 1; i < points.length; i++) {
    let prev = out[out.length - 1]
    let d = dist(prev, points[i])
    while (acc + d >= spacing) {
      const t = (spacing - acc) / d
      const p = add(prev, scale(sub(points[i], prev), t))
      out.push(p)
      prev = p
      d = dist(prev, points[i])
      acc = 0
    }
    acc += d
  }
  return out
}

function pathLength(points: V3[]): number {
  let s = 0
  for (let i = 1; i < points.length; i++) s += dist(points[i - 1], points[i])
  return s
}

interface RecognizeOptions {
  /** Grid step used to snap corners, centres and radii (0 = no snapping). */
  gridStep: number
  /**
   * For a grid that is not squares (polar, isometric, hex): where a corner, an end or a centre
   * goes instead. Used with a `gridStep` of 0, since that grid has no step to round lengths to.
   */
  snapPoint?: (p: V3) => V3
}

const snapTo = (v: number, step: number) => (step > 0 ? Math.round(v / step) * step : v)
const snapPt = (p: V3, step: number): V3 => [snapTo(p[0], step), snapTo(p[1], step), 0]

/** Turn a rough freehand stroke into a clean segment, circle or polygon. */
export function recognizeStroke(raw: V3[], opts: RecognizeOptions): Recognized {
  const snapP = (p: V3): V3 => (opts.snapPoint ? opts.snapPoint(p) : snapPt(p, opts.gridStep))
  const flat = raw.map((p) => [p[0], p[1], 0] as V3)
  const L = pathLength(flat)
  if (flat.length < 3 || L < 1e-6) return { kind: 'none', reason: 'The stroke is too short.' }
  const pts = resample(flat, L / 160)
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  const gap = dist(pts[0], pts[pts.length - 1])
  const closed = gap < Math.max(0.2 * diag, L * 0.08)

  if (!closed) {
    const chord = dist(pts[0], pts[pts.length - 1])
    const dev = Math.max(...pts.map((p) => Math.abs(cross(sub(pts[pts.length - 1], pts[0]), sub(p, pts[0]))[2]) / Math.max(chord, 1e-12)))
    if (dev < 0.08 * chord) return { kind: 'segment', a: snapP(pts[0]), b: snapP(pts[pts.length - 1]) }
    return { kind: 'none', reason: 'Open curve: close the shape (end where you started) or draw a straight line.' }
  }

  // Close the loop for analysis.
  const loop = [...pts, pts[0]]
  const c = centroid(pts)
  const radii = pts.map((p) => dist(p, c))
  const meanR = radii.reduce((s, r) => s + r, 0) / radii.length
  const circleErr = Math.sqrt(radii.reduce((s, r) => s + (r - meanR) ** 2, 0) / radii.length) / meanR

  // Corner detection: simplify, then merge nearly-straight vertices.
  let corners = rdp(loop, diag * 0.06).slice(0, -1)
  corners = mergeStraight(corners, (20 * Math.PI) / 180)
  const polyErr = corners.length >= 3 ? meanDistanceToPolygon(pts, corners) / diag : Infinity

  const looksPolygon = corners.length >= 3 && corners.length <= 8 && polyErr < 0.035
  if (circleErr < 0.1 && (!looksPolygon || corners.length > 6 || circleErr < polyErr * 1.2)) {
    const step = opts.gridStep
    const center = snapP(c)
    const r = step > 0 ? Math.max(step, snapTo(meanR, step)) : meanR
    return { kind: 'circle', center, r }
  }
  if (!looksPolygon) return { kind: 'none', reason: 'Could not recognise this shape. Try drawing straighter sides or a rounder circle.' }
  return beautifyPolygon(corners, opts.gridStep, opts.snapPoint)
}

function mergeStraight(pts: V3[], tolRad: number): V3[] {
  let out = [...pts]
  let changed = true
  while (changed && out.length > 3) {
    changed = false
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length]
      const b = out[i]
      const c = out[(i + 1) % out.length]
      const turn = angleBetween(sub(b, a), sub(c, b))
      const shortEdge = Math.min(dist(a, b), dist(b, c)) < 0.08 * (dist(a, b) + dist(b, c))
      if (turn < tolRad || shortEdge) {
        out = out.filter((_, j) => j !== i)
        changed = true
        break
      }
    }
  }
  return out
}

function meanDistanceToPolygon(points: V3[], poly: V3[]): number {
  let total = 0
  for (const p of points) {
    let best = Infinity
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      const ab = sub(b, a)
      const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / Math.max(dot(ab, ab), 1e-12)))
      best = Math.min(best, dist(p, add(a, scale(ab, t))))
    }
    total += best
  }
  return total / points.length
}

/** Makes nearly-regular shapes exact (right angles, equal sides, parallel sides) and snaps to the grid. */
function beautifyPolygon(corners: V3[], step: number, snapPoint?: (p: V3) => V3): Recognized {
  const snapP = (p: V3): V3 => (snapPoint ? snapPoint(p) : step > 0 ? snapPt(p, step) : p)
  const n = corners.length
  let pts = corners.map((p) => [p[0], p[1], 0] as V3)
  if (signedArea2D(pts) < 0) pts = pts.reverse()
  const angles = interiorAngles(pts)
  const sides = sideLengths(pts)
  const deg = (r: number) => (r * 180) / Math.PI
  const approx = (a: number, target: number, tol: number) => Math.abs(deg(a) - target) < tol
  const meanSide = sides.reduce((s, v) => s + v, 0) / n
  const sidesEqual = sides.every((s) => Math.abs(s - meanSide) < 0.12 * meanSide)

  if (n === 4 && angles.every((a) => approx(a, 90, 14))) {
    // Rectangle/square: use the direction of the longest side, snap near-axis rectangles to the axes.
    const longest = sides.indexOf(Math.max(...sides))
    let u = normalize(sub(pts[(longest + 1) % 4], pts[longest]))
    const ang = Math.atan2(u[1], u[0])
    const snapAng = Math.round(ang / (Math.PI / 2)) * (Math.PI / 2)
    if (Math.abs(ang - snapAng) < (10 * Math.PI) / 180) u = [Math.cos(snapAng), Math.sin(snapAng), 0]
    const v: V3 = [-u[1], u[0], 0]
    const c = centroid(pts)
    const proj = pts.map((p) => [dot(sub(p, c), u), dot(sub(p, c), v)])
    let w = (Math.max(...proj.map((q) => q[0])) - Math.min(...proj.map((q) => q[0]))) / 2
    let h = (Math.max(...proj.map((q) => q[1])) - Math.min(...proj.map((q) => q[1]))) / 2
    const square = Math.abs(w - h) < 0.12 * Math.max(w, h)
    if (square) w = h = (w + h) / 2
    const axisAligned = Math.abs(u[0]) > 0.999 || Math.abs(u[1]) > 0.999
    if (axisAligned && step > 0) {
      const cx = snapTo(c[0] - w, step)
      const cy = snapTo(c[1] - h, step)
      const W = Math.max(step, snapTo(2 * w, step))
      const H = square ? W : Math.max(step, snapTo(2 * h, step))
      return { kind: 'polygon', label: square ? 'Square' : 'Rectangle', pts: [[cx, cy, 0], [cx + W, cy, 0], [cx + W, cy + H, 0], [cx, cy + H, 0]] }
    }
    const out: V3[] = [
      add(c, add(scale(u, -w), scale(v, -h))),
      add(c, add(scale(u, w), scale(v, -h))),
      add(c, add(scale(u, w), scale(v, h))),
      add(c, add(scale(u, -w), scale(v, h)))
    ]
    return { kind: 'polygon', label: square ? 'Square' : 'Rectangle', pts: out }
  }

  if (n >= 5 && sidesEqual && angles.every((a) => Math.abs(a - angles[0]) < (12 * Math.PI) / 180)) {
    // Regular polygon with the same centre and average circumradius; first vertex direction kept.
    const c = centroid(pts)
    const R = pts.reduce((s, p) => s + dist(p, c), 0) / n
    const start = Math.atan2(pts[0][1] - c[1], pts[0][0] - c[0])
    const center = snapP(c)
    const out: V3[] = Array.from({ length: n }, (_, k) => [center[0] + R * Math.cos(start + (2 * Math.PI * k) / n), center[1] + R * Math.sin(start + (2 * Math.PI * k) / n), 0])
    return { kind: 'polygon', label: `Regular ${polygonName(n)}`, pts: out }
  }

  let snapped = pts.map(snapP)
  if (n === 4) {
    const d = snapped.map((p, i) => sub(snapped[(i + 1) % 4], p))
    const p02 = angleBetween(d[0], scale(d[2], -1)) < (10 * Math.PI) / 180
    const p13 = angleBetween(d[1], scale(d[3], -1)) < (10 * Math.PI) / 180
    if (p02 && p13) {
      // Parallelogram: move the last vertex so opposite sides are exactly parallel.
      snapped = [snapped[0], snapped[1], snapped[2], add(snapped[0], sub(snapped[2], snapped[1]))]
      return { kind: 'polygon', label: 'Parallelogram', pts: snapped }
    }
  }
  if (n === 3) {
    // Nearly right-angled triangles become exactly right-angled at that vertex.
    const i = angles.findIndex((a) => approx(a, 90, 8))
    if (i >= 0) {
      const A = snapped[(i + 2) % 3]
      const V = snapped[i]
      const B = snapped[(i + 1) % 3]
      const u = normalize(sub(A, V))
      const perp: V3 = [-u[1], u[0], 0]
      const projLen = dot(sub(B, V), perp)
      const fixedB = add(V, scale(perp, projLen))
      const out = [...snapped]
      out[(i + 1) % 3] = step > 0 && (Math.abs(u[0]) > 0.999 || Math.abs(u[1]) > 0.999) ? snapPt(fixedB, step) : fixedB
      return { kind: 'polygon', label: 'Right-angled triangle', pts: out }
    }
  }
  const cls = classifyPolygon(snapped, 0.5, 0.01)
  if (polygonArea(snapped) < 1e-9) return { kind: 'none', reason: 'The corners snapped onto one line; draw it a bit larger.' }
  return { kind: 'polygon', label: cls.name, pts: snapped }
}

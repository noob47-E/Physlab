// The geometry behind angle arcs and tick marks, kept apart from the components so a test can
// check it without a canvas.

import { angleAt, orientedAngleAt } from '../math/geometry'
import { add, angleBetween, cross, len, normalize, scale, sub, toDeg, type V3 } from '../math/vec'

/** Arc in the plane spanned by two directions u, v starting at a vertex (3D-safe), the short way round. */
export function arcBetween(vertex: V3, u: V3, v: V3, r: number, steps = 40): V3[] {
  const a = normalize(u)
  const total = angleBetween(u, v)
  let perp = sub(normalize(v), scale(a, Math.cos(total)))
  const pl = len(perp)
  if (pl < 1e-9) perp = Math.abs(a[2]) < 0.9 ? [-a[1], a[0], 0] : [0, -a[2], a[1]]
  perp = normalize(perp)
  const pts: V3[] = []
  for (let i = 0; i <= steps; i++) {
    const t = (total * i) / steps
    pts.push(add(vertex, add(scale(a, r * Math.cos(t)), scale(perp, r * Math.sin(t)))))
  }
  return pts
}

/**
 * The inside angle of a corner. A triangle never has a reflex corner, so it keeps the plain angle
 * (which also works for a triangle standing in 3-D); a longer polygon is read in the x-y plane with
 * its winding, so a reflex corner reads above 180 degrees.
 */
export function cornerAngle(prev: V3, v: V3, next: V3, orientation: number, isTriangle: boolean): number {
  if (isTriangle) return angleAt(prev, v, next)
  const a = orientedAngleAt(next, v, prev)
  return orientation > 0 ? a : 2 * Math.PI - a
}

/**
 * The mark at a polygon corner: a small square for a right angle, else an arc sweeping the INSIDE
 * angle. The short-way `arcBetween` drew the outside angle at a reflex corner while the label read
 * the inside one.
 */
export function polygonCornerMark(prev: V3, v: V3, next: V3, orientation: number, isTriangle: boolean, r: number): V3[] {
  // Arms that project onto one line in x-y (an upright polygon) have no winding to read: use the true 3-D angle.
  const crossZ = (prev[0] - v[0]) * (next[1] - v[1]) - (prev[1] - v[1]) * (next[0] - v[0])
  const armScale = Math.hypot(prev[0] - v[0], prev[1] - v[1]) * Math.hypot(next[0] - v[0], next[1] - v[1])
  const flat = armScale === 0 || Math.abs(crossZ) < 1e-9 * armScale
  const ang = !isTriangle && flat ? angleAt(prev, v, next) : cornerAngle(prev, v, next, orientation, isTriangle)
  if (Math.abs(toDeg(ang) - 90) < 1e-6) {
    const u1 = scale(normalize(sub(prev, v)), r * 0.6)
    const u2 = scale(normalize(sub(next, v)), r * 0.6)
    return [add(v, u1), add(add(v, u1), u2), add(v, u2)]
  }
  if (ang <= Math.PI + 1e-9) return arcBetween(v, sub(prev, v), sub(next, v), r)
  // Reflex: counter-clockwise from `next` to `prev` for a counter-clockwise polygon, from `prev` to `next` for a clockwise one.
  const arm = sub(orientation > 0 ? next : prev, v)
  const from = Math.atan2(arm[1], arm[0])
  const pts: V3[] = []
  const steps = 60
  for (let i = 0; i <= steps; i++) {
    const t = from + (ang * i) / steps
    pts.push([v[0] + r * Math.cos(t), v[1] + r * Math.sin(t), v[2]])
  }
  return pts
}

/** The normal of the plane of two arms, or null when they are parallel. */
function planeNormal(u: V3, v: V3): V3 | null {
  const n = cross(u, v)
  return len(n) < 1e-9 * Math.max(1, len(u) * len(v)) ? null : normalize(n)
}

interface TickMark {
  a: V3
  b: V3
  n: number
}
interface ArcMark {
  vertex: V3
  a: V3
  b: V3
  n: number
}

const near = (p: V3, q: V3) => len(sub(p, q)) < 1e-9

/**
 * The plane a tick should lie in: that of the triangle it marks. It is read from an angle mark at
 * either end, else from another tick sharing an end. Null when nothing says (a lone side).
 */
export function tickNormal(t: TickMark, ticks: TickMark[], arcs: ArcMark[]): V3 | null {
  const d = sub(t.b, t.a)
  const dn = normalize(d)
  // A normal only serves when it stands perpendicular to the side.
  const fits = (n: V3 | null): n is V3 => n !== null && Math.abs(n[0] * dn[0] + n[1] * dn[1] + n[2] * dn[2]) < 1e-6
  const arcNormal = (arc: ArcMark) => planeNormal(sub(arc.a, arc.vertex), sub(arc.b, arc.vertex))
  // First choice: an angle of this side's own triangle, one arm running along the side from its end.
  const runsAlong = (arm: V3, from: V3, to: V3) => {
    const w = sub(to, from)
    return len(cross(arm, w)) < 1e-9 * Math.max(1, len(arm) * len(w)) && arm[0] * w[0] + arm[1] * w[1] + arm[2] * w[2] > 0
  }
  const along = (arc: ArcMark, from: V3, to: V3) =>
    near(arc.vertex, from) && [arc.a, arc.b].some((arm) => runsAlong(sub(arm, arc.vertex), from, to))
  for (const arc of arcs) {
    if (along(arc, t.a, t.b) || along(arc, t.b, t.a)) {
      const n = arcNormal(arc)
      if (fits(n)) return n
    }
  }
  for (const arc of arcs) {
    if (near(arc.vertex, t.a) || near(arc.vertex, t.b)) {
      const n = arcNormal(arc)
      if (fits(n)) return n
    }
  }
  for (const o of ticks) {
    if (o === t) continue
    if (near(o.a, t.a) || near(o.a, t.b) || near(o.b, t.a) || near(o.b, t.b)) {
      const n = planeNormal(d, sub(o.b, o.a))
      if (fits(n)) return n
    }
  }
  return null
}

/**
 * The short strokes across a side, `half` long each way and `gap` apart, lying in the plane with
 * normal `normal`. With no plane known the stroke is cross([0, 0, 1], side): horizontal, so a flat
 * 2-D side keeps its stroke in the x-y plane as always, and a side along z still gets a stroke.
 */
export function tickLines(t: TickMark, normal: V3 | null, half: number, gap: number): V3[][] {
  const mid = scale(add(t.a, t.b), 0.5)
  const dir = normalize(sub(t.b, t.a))
  let perp: V3 = normal ? cross(normal, dir) : cross([0, 0, 1], dir)
  if (len(perp) < 1e-9) perp = [1, 0, 0]
  perp = normalize(perp)
  const lines: V3[][] = []
  for (let i = 0; i < t.n; i++) {
    const c = add(mid, scale(dir, (i - (t.n - 1) / 2) * gap))
    lines.push([add(c, scale(perp, half)), sub(c, scale(perp, half))])
  }
  return lines
}

/** The n concentric arcs on an angle, each in the plane of its two arms (r0 first, `step` apart). */
export function arcLines(arc: ArcMark, r0: number, step: number): V3[][] {
  const lines: V3[][] = []
  for (let i = 0; i < arc.n; i++) lines.push(arcBetween(arc.vertex, sub(arc.a, arc.vertex), sub(arc.b, arc.vertex), r0 + i * step, 24))
  return lines
}

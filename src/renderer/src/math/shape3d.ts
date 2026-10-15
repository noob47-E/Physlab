// The Shape tool's outline maths (3-D Geometry): a polygon clicked point by point on the working plane.
import type { V3 } from './vec'
import { perimeter, polygonArea } from './geometry'

const EPS = 1e-9

/** Cross product z of (b - a) x (c - a), the corner's turn seen from above the working plane. */
const turn = (a: V3, b: V3, c: V3): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

const onSeg = (a: V3, b: V3, p: V3): boolean =>
  Math.min(a[0], b[0]) - EPS <= p[0] && p[0] <= Math.max(a[0], b[0]) + EPS && Math.min(a[1], b[1]) - EPS <= p[1] && p[1] <= Math.max(a[1], b[1]) + EPS

/** True when segments ab and cd touch or cross (shared end points are the caller's business). */
function segmentsTouch(a: V3, b: V3, c: V3, d: V3): boolean {
  const d1 = turn(a, b, c)
  const d2 = turn(a, b, d)
  const d3 = turn(c, d, a)
  const d4 = turn(c, d, b)
  if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) return true
  if (Math.abs(d1) <= EPS && onSeg(a, b, c)) return true
  if (Math.abs(d2) <= EPS && onSeg(a, b, d)) return true
  if (Math.abs(d3) <= EPS && onSeg(c, d, a)) return true
  return Math.abs(d4) <= EPS && onSeg(c, d, b)
}

/**
 * Does the closed outline cross itself? Sides that share a corner only meet there; any other
 * touching or crossing counts. The outline lies on one working plane, so x and y decide.
 */
export function outlineCrosses(pts: V3[]): boolean {
  const n = pts.length
  if (n < 4) return false
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1)
      if (adjacent) continue
      if (segmentsTouch(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true
    }
  }
  return false
}

/** Why the outline cannot be closed, in words, or null when it can. */
export function outlineRefusal(pts: V3[]): string | null {
  if (pts.length < 3) return 'A shape needs at least three corners.'
  if (outlineCrosses(pts)) return 'The outline crosses itself. Move a corner so no two sides cross.'
  if (polygonArea(pts) < EPS) return 'These corners lie on one line, so there is no shape. Move a corner off the line.'
  return null
}

/** Area and perimeter of a closed outline. */
export function outlineStats(pts: V3[]): { area: number; perimeter: number } {
  return { area: polygonArea(pts), perimeter: perimeter(pts, true) }
}

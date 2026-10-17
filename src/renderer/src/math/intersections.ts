// Where two drawn objects cross. The evaluator uses this for an intersection point and the
// viewport uses it to snap the cursor onto a crossing before the point exists, so the two agree
// on which crossing is number 0 and which is number 1: a point placed by snapping must land on
// the same crossing when the scene is worked out again.

import { circleCircleIntersection, lineCircleIntersection, lineLineIntersection, type GLine } from './geometry'
import type { Computed } from '../core/types'
import type { V3 } from './vec'
import { curveIntersections } from './graphs'
import { isNoise } from './noise'

/** The straight part of a line, segment, ray or vector, or null for anything else. */
export function asGLine(c: Computed): GLine | null {
  if (c.type === 'line' || c.type === 'segment' || c.type === 'ray') return c.line
  if (c.type === 'vector') return { kind: 'segment', p: c.tail, d: c.comp }
  return null
}

const isCurveLike = (c: Computed): boolean => !!asGLine(c) || c.type === 'circle' || (c.type === 'graph' && !!c.f)

/** Can these two be intersected at all (a line-like, circle, or 2-D graph on each side)? */
export const canIntersect = (a: Computed, b: Computed): boolean => isCurveLike(a) && isCurveLike(b)

/**
 * Every crossing of a and b, in a fixed order: one point for two lines, up to two for a line and
 * a circle (along the line's direction) or two circles (either side of the line of centres),
 * or curve-to-curve / curve-to-line intersections in ascending x order.
 * Segment and ray ends are respected. Empty when they do not meet or cannot be intersected.
 */
export function intersectionsOf(a: Computed, b: Computed, bounds?: { xMin?: number; xMax?: number; approx?: V3 }): V3[] {
  const la = asGLine(a)
  const lb = asGLine(b)
  if (la && lb) {
    const p = lineLineIntersection(la, lb)
    return p ? [p] : []
  }
  if (la && b.type === 'circle') return lineCircleIntersection(la, b.circle)
  if (a.type === 'circle' && lb) return lineCircleIntersection(lb, a.circle)
  if (a.type === 'circle' && b.type === 'circle') return circleCircleIntersection(a.circle, b.circle)

  const center = bounds?.approx?.[0]
  const xMin = bounds?.xMin ?? (center !== undefined ? center - 30 : -100)
  const xMax = bounds?.xMax ?? (center !== undefined ? center + 30 : 100)
  const n = bounds?.approx ? 1200 : 2000

  if (a.type === 'graph' && a.f && b.type === 'graph' && b.f) {
    const keys = curveIntersections(a.f, b.f, xMin, xMax, n)
    return keys.map((k) => [k.x, k.y, 0] as V3)
  }

  if (la && b.type === 'graph' && b.f) {
    return lineGraphIntersections(la, b.f, xMin, xMax)
  }
  if (a.type === 'graph' && a.f && lb) {
    return lineGraphIntersections(lb, a.f, xMin, xMax)
  }

  return []
}

function lineGraphIntersections(line: GLine, f: (x: number) => number, xMin: number, xMax: number): V3[] {
  if (isNoise(line.d[0], line.p[0])) {
    const x = line.p[0]
    const y = f(x)
    if (!Number.isFinite(y)) return []
    const dd = line.d[1]
    if (isNoise(dd)) return []
    const t = (y - line.p[1]) / dd
    if (line.kind === 'segment' && (t < 0 || t > 1) && !isNoise(t, 1) && !isNoise(t - 1, 1)) return []
    if (line.kind === 'ray' && t < 0 && !isNoise(t, 1)) return []
    return [[x, y, 0]]
  }

  const slope = line.d[1] / line.d[0]
  const g = (x: number) => line.p[1] + slope * (x - line.p[0])
  let low = xMin
  let high = xMax

  if (line.kind === 'segment') {
    const x0 = line.p[0]
    const x1 = line.p[0] + line.d[0]
    low = Math.max(low, Math.min(x0, x1))
    high = Math.min(high, Math.max(x0, x1))
  } else if (line.kind === 'ray') {
    if (line.d[0] > 0) low = Math.max(low, line.p[0])
    else high = Math.min(high, line.p[0])
  }

  if (low > high) return []
  const keys = curveIntersections(f, g, low, high)
  return keys.map((k) => [k.x, k.y, 0] as V3)
}

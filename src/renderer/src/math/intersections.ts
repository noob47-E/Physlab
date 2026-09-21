// Where two drawn objects cross. The evaluator uses this for an intersection point and the
// viewport uses it to snap the cursor onto a crossing before the point exists, so the two agree
// on which crossing is number 0 and which is number 1: a point placed by snapping must land on
// the same crossing when the scene is worked out again.

import { circleCircleIntersection, lineCircleIntersection, lineLineIntersection, type GLine } from './geometry'
import type { Computed } from '../core/types'
import type { V3 } from './vec'

/** The straight part of a line, segment, ray or vector, or null for anything else. */
export function asGLine(c: Computed): GLine | null {
  if (c.type === 'line' || c.type === 'segment' || c.type === 'ray') return c.line
  if (c.type === 'vector') return { kind: 'segment', p: c.tail, d: c.comp }
  return null
}

/** Can these two be intersected at all (a line-like or a circle on each side)? */
export const canIntersect = (a: Computed, b: Computed): boolean =>
  (!!asGLine(a) || a.type === 'circle') && (!!asGLine(b) || b.type === 'circle')

/**
 * Every crossing of a and b, in a fixed order: one point for two lines, up to two for a line and
 * a circle (along the line's direction) or two circles (either side of the line of centres).
 * Segment and ray ends are respected. Empty when they do not meet or cannot be intersected.
 */
export function intersectionsOf(a: Computed, b: Computed): V3[] {
  const la = asGLine(a)
  const lb = asGLine(b)
  if (la && lb) {
    const p = lineLineIntersection(la, lb)
    return p ? [p] : []
  }
  if (la && b.type === 'circle') return lineCircleIntersection(la, b.circle)
  if (a.type === 'circle' && lb) return lineCircleIntersection(lb, a.circle)
  if (a.type === 'circle' && b.type === 'circle') return circleCircleIntersection(a.circle, b.circle)
  return []
}

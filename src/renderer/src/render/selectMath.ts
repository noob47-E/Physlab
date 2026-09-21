// What a selection box takes and what it leaves, kept pure so the rule can be tested without a
// canvas. The box is dragged with the Move tool on empty space; whichever corner the drag started
// from, the rectangle is the same.

import type { ObjType } from '../core/types'
import type { Marquee } from './tools'

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface S2 {
  x: number
  y: number
}

/** A dragged box with its corners put in order, so a drag up and to the left is the same box as one down and to the right. */
export const normalizeRect = (m: Marquee): Rect => ({
  left: Math.min(m.x0, m.x1),
  top: Math.min(m.y0, m.y1),
  right: Math.max(m.x0, m.x1),
  bottom: Math.max(m.y0, m.y1)
})

export const insideRect = (p: S2, r: Rect): boolean => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom

/**
 * An object is taken when the whole of what defines it is inside the box: a point itself, both
 * ends of a segment or vector, the centre of a circle, every corner of a polygon, the anchor of a
 * graph or a piece of text. A shape that is merely crossed by the box stays out: a drag over a
 * few points inside a big triangle should take the points, not the triangle. Nothing with no
 * position on screen (a number, say) is ever taken.
 */
export function objectInRect(kind: ObjType, screenPts: S2[], rect: Rect): boolean {
  if (screenPts.length === 0) return false
  switch (kind) {
    case 'number':
      return false
    default:
      return screenPts.every((p) => insideRect(p, rect))
  }
}

/** A drag shorter than this is a click, not a box. */
export const MARQUEE_MIN_PX = 5

/** Has the pointer moved far enough from where it went down for the drag to count as a box? */
export const marqueeStarted = (m: Marquee): boolean => Math.hypot(m.x1 - m.x0, m.y1 - m.y0) >= MARQUEE_MIN_PX

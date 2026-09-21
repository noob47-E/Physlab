// What a selection box takes and what it leaves, kept pure so the rule can be tested without a
// canvas. The box is dragged with the Move tool on empty space; whichever corner the drag started
// from, the rectangle is the same.

import type { ObjId, ObjType } from '../core/types'
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

/**
 * Whether the contextmenu event that ends a right-button gesture ends a pan, not a click. On
 * Windows the event fires when the right button comes up, wherever the pointer has been dragged
 * to, so every right-drag pan used to finish by opening the background menu (or, mid-polygon, by
 * finishing the shape). The same few pixels that turn a left-drag into a box turn a right-drag
 * into a pan; `from` is null when the right button never went down on the canvas.
 */
export const rightDragPanned = (from: { x: number; y: number } | null, x: number, y: number): boolean =>
  from !== null && marqueeStarted({ x0: from.x, y0: from.y, x1: x, y1: y })

/**
 * What is selected once the box is let go: the box's contents, or with Shift held the old
 * selection plus them. Shift adds and never removes — a box that took away the objects it
 * covered read as a bug, unlike a Shift-click on one object, which toggles it.
 */
export function mergeSelection(current: readonly ObjId[], boxed: readonly ObjId[], shift: boolean): ObjId[] {
  if (!shift) return [...boxed]
  const out = [...current]
  for (const id of boxed) if (!out.includes(id)) out.push(id)
  return out
}

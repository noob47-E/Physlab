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
 * What a drawing tool's click takes, from everything within reach of it (`pickAll`, best first).
 * A tool that makes a new point on empty space takes an existing point only inside the snapping
 * radius — the radius the snap ring and the length tip beside the pointer follow. Picking reaches
 * further (22 px, a finger's width), and the release used to take a point from out there: let go
 * 16 px short of P and the tip read 3.68 while the segment was built to P, 4 long (Fix 1). A point
 * beyond the snapping radius is skipped rather than ending the search, so a segment right under
 * the pointer still wins over a point just out of reach (Midpoint's first click). Tools that never
 * make points (Perpendicular, Intersect…) draw no length from the click and keep the full reach.
 */
export function drawingClickHit<H extends { dist: number }>(hits: readonly H[], isPoint: (h: H) => boolean, createsPoints: boolean, snapPx: number): H | null {
  if (!createsPoints) return hits[0] ?? null
  return hits.find((h) => !isPoint(h) || h.dist <= snapPx) ?? null
}

/**
 * Whether the pointer joins an existing point when snapping is off (Snap unticked, or Alt held).
 * Only a tool whose click would join the point anyway (drawingClickHit, for a tool that makes
 * points) says so in its tip and ring, so the tip gives the length the side is built with (Fix 1).
 * Vector and Text stay free, as snapping off has always meant for them: a vector's ends and a text
 * box go exactly under the pointer. A drag never joins (the dragged object would snap to itself).
 */
export const joinsPointWithSnapOff = (createsPoints: boolean, dragging: boolean): boolean => createsPoints && !dragging

/**
 * Whether Shift rounds the pointer to a 15° step. The release joins an existing point it snapped
 * to rather than rounding (so a side can still close on a corner), and the tip used to round
 * anyway, showing a length and angle the drawn side did not have. A vector's head never joins a
 * point with Shift held, so it keeps the step. In 3-D there is no screen angle to round to.
 */
export const shiftConstrains = (tool: string, shift: boolean, flat: boolean, onPoint: boolean): boolean =>
  shift && flat && (tool === 'vector' || !onPoint)

/**
 * What is selected once the box is let go:the box's contents, or with Shift held the old
 * selection plus them. Shift adds and never removes — a box that took away the objects it
 * covered read as a bug, unlike a Shift-click on one object, which toggles it.
 */
export function mergeSelection(current: readonly ObjId[], boxed: readonly ObjId[], shift: boolean): ObjId[] {
  if (!shift) return [...boxed]
  const out = [...current]
  for (const id of boxed) if (!out.includes(id)) out.push(id)
  return out
}

// The pixel decisions of the object views, kept pure so they can be tested without a canvas:
// how big an arrow head is at this zoom, how big a point is drawn, and where a point's letter
// goes so it does not sit on the point or on a neighbour.

// ---------------------------------------------------------------------------
// Arrow heads
// ---------------------------------------------------------------------------

/** How a flat 2-D arrow head is drawn: a fixed 12 px length and a 25° half-angle at every zoom. */
export const HEAD_PX = 12
export const HEAD_HALF_ANGLE_DEG = 25

/**
 * How far the selection halo's tip reaches past the arrow's, in pixels. The halo is 2.2 px
 * thicker than the arrow, 1.1 px a side; the two heads share a tip and a 25° half-angle, so
 * along the slanted edges the outline would be no wider than zero. Moving the halo's tip on
 * by 1.1 / sin 25° puts its edges 1.1 px outside the head's as well.
 */
export const HALO_TIP_PX = 1.1 / Math.sin((HEAD_HALF_ANGLE_DEG * Math.PI) / 180)

export interface ArrowHead {
  /** Head length along the arrow, in world units. */
  headLen: number
  /** Half the width of the head's base, in world units. */
  halfWidth: number
  /** What is left for the shaft, in world units; never quite zero so the mesh keeps a scale. */
  shaftLen: number
}

/**
 * The head of an arrow of world length `L` when one pixel is `wpp` world units. The head is
 * `headPx` pixels long whatever the zoom, except on a very short arrow, where it gives up
 * most of the length to the shaft (a 10 px arrow drawn as one 12 px head reads as a blob).
 */
export function arrowHead(L: number, wpp: number, headPx = HEAD_PX, halfAngleDeg = HEAD_HALF_ANGLE_DEG): ArrowHead {
  const headLen = Math.min(headPx * wpp, L * 0.45)
  return { headLen, halfWidth: headLen * Math.tan((halfAngleDeg * Math.PI) / 180), shaftLen: Math.max(L - headLen, 1e-6) }
}

// ---------------------------------------------------------------------------
// Points
// ---------------------------------------------------------------------------

/** A free point's radius and a derived point's, in pixels; 0.6.0 drew them at 5 and 4. */
export const POINT_PX = { free: 3.4, derived: 2.7 }

/** The drawn radius of a point: its own size if it has one, else a free point is a touch larger. */
export function pointRadius(size: number | undefined, free: boolean, hovered: boolean): number {
  return (size ?? (free ? POINT_PX.free : POINT_PX.derived)) + (hovered ? 0.8 : 0)
}

/**
 * The halo behind a point, in the canvas colour, so it reads over a line: in proportion, but
 * never a ring thinner than a pixel, which anti-aliasing swallows (a derived point's 2.7 px dot
 * had a 0.86 px halo and vanished on a 2.2 px line).
 */
export const pointHalo = (r: number): number => Math.max(r * 1.32, r + 1)

/**
 * How far from a point's centre a click or a finger still picks it, in pixels: a 44 px target
 * (22 each side) for a touch screen, whatever size the dot is drawn at. Snapping keeps its own,
 * tighter radius in Interaction.tsx, so a new point does not leap onto one 20 px away.
 */
export const POINT_REACH_PX = 22

// ---------------------------------------------------------------------------
// Where a point's label goes
// ---------------------------------------------------------------------------

export interface Px {
  x: number
  y: number
}

/** A label's offset from its point, in screen pixels, to the label's centre. */
export interface LabelOffset {
  dx: number
  dy: number
}

/** The nominal size of a one-letter chip; the real box is measured later by the label layer. */
export const LABEL_BOX = { w: 24, h: 22 }

/** How far the label's box stays from the edge of the point, in pixels. */
const LABEL_GAP = 2

/**
 * The eight places a label may sit, best first: up-right is the textbook position, the other
 * corners keep the label clear of the point by its height alone (which is safe whatever the
 * label turns out to be), and the four sides are the last resort.
 */
const SLOTS: [number, number][] = [
  [1, -1],
  [-1, -1],
  [1, 1],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, 0],
  [-1, 0]
]

/**
 * The offset for a point's label: the first of the eight slots whose box covers neither the
 * point (radius `r` px) nor any neighbouring point, or the one that clears the most when all of
 * them are crowded. Screen y grows downwards, so "up" is a negative dy.
 */
export function pickLabelOffset(point: Px & { r: number }, neighbours: Px[], box = LABEL_BOX): LabelOffset {
  const reach = point.r + LABEL_GAP
  let best: LabelOffset | null = null
  let bestScore = -Infinity
  for (const [sx, sy] of SLOTS) {
    // A corner slot puts the box's near corner just past the point; a side slot centres it.
    const dx = sx * (box.w / 2 + (sy === 0 ? reach : reach * 0.6))
    const dy = sy * (box.h / 2 + (sx === 0 ? reach : reach * 0.6))
    const left = point.x + dx - box.w / 2
    const top = point.y + dy - box.h / 2
    // How far every point (its own disc included) stays outside the box; negative means overlap.
    let clear = Infinity
    for (const n of [point, ...neighbours]) {
      const cx = Math.max(left, Math.min(n.x, left + box.w))
      const cy = Math.max(top, Math.min(n.y, top + box.h))
      clear = Math.min(clear, Math.hypot(n.x - cx, n.y - cy) - point.r)
    }
    if (clear >= 0) return { dx, dy }
    if (clear > bestScore) {
      bestScore = clear
      best = { dx, dy }
    }
  }
  return best ?? { dx: 0, dy: 0 }
}

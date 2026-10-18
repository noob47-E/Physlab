// Where a flat shape's name-and-area label stands, worked out in PIXELS.
//
// The label used to sit on the shape's centre, where the angle badges of a small shape land (a
// badge stands 42 px in from its corner), and the first fix moved it a fixed 60 drawing units away,
// which at the default zoom of 50 px to a unit is 3000 px: off the screen. Everything the label has
// to avoid — the badges, the arcs at the corners — is measured on the screen, so the search is made
// on the screen too and handed back in drawing units at the end: the same picture at any zoom puts
// the label in the same place against it. Kept pure so a test can hold the placement.

import { centroid } from '../math/geometry'
import { add, normalize, scale, sub, type V3 } from '../math/vec'
import { cornerAngle } from './markGeometry'

/** How far in from its corner an interior-angle badge stands, in pixels (ObjectViews draws it there). */
export const BADGE_DISTANCE_PX = 42
/** The radius of the arc or square drawn at a corner, in pixels. */
const CORNER_MARK_PX = 22
/** The room one angle badge takes ("36.87°" with its padding), a little more than it needs. */
const BADGE_BOX_PX = { w: 56, h: 20 }
/** The room the shape's chip takes — a name such as "Right-angled triangle KLM" and its area — a little more than it needs. */
const LABEL_BOX_PX = { w: 230, h: 24 }

/**
 * The inside angle at a corner and the way its badge stands from the corner: along the bisector,
 * into the shape, or out of it at a reflex corner (where the badge reads above 180°). ObjectViews
 * draws the badges with this and the label placement avoids them with it, so they cannot disagree.
 */
export function cornerBadge(prev: V3, v: V3, next: V3, orientation: number, isTriangle: boolean): { angle: number; dir: V3 } {
  const angle = cornerAngle(prev, v, next, orientation, isTriangle)
  const dir = normalize(add(normalize(sub(prev, v)), normalize(sub(next, v))))
  return { angle, dir: !isTriangle && angle > Math.PI ? scale(dir, -1) : dir }
}

// ---------------------------------------------------------------------------
// Pixel geometry. Plain numbers throughout: this runs for every shape on screen whenever the zoom
// changes, so it allocates as little as it can.
// ---------------------------------------------------------------------------

type XY = [number, number]
interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

const rectAt = (cx: number, cy: number, w: number, h: number): Rect => ({ x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 })
const overlapArea = (a: Rect, b: Rect): number => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
/** The gap between two rectangles: 0 where they touch or overlap. */
const rectGap = (a: Rect, b: Rect): number => Math.hypot(Math.max(a.x0 - b.x1, b.x0 - a.x1, 0), Math.max(a.y0 - b.y1, b.y0 - a.y1, 0))

const areaOf = (poly: XY[]): number => {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    s += p[0] * q[1] - q[0] * p[1]
  }
  return Math.abs(s) / 2
}

/** The polygon cut to one side of a vertical (`x`) or horizontal line, keeping the side `keepLow` says (Sutherland-Hodgman). */
function cutAt(poly: XY[], xAxis: boolean, at: number, keepLow: boolean): XY[] {
  const k = xAxis ? 0 : 1
  const out: XY[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const ka = keepLow ? a[k] <= at : a[k] >= at
    const kb = keepLow ? b[k] <= at : b[k] >= at
    if (ka) out.push(a)
    if (ka !== kb) {
      const t = (at - a[k]) / (b[k] - a[k])
      out.push(xAxis ? [at, a[1] + (b[1] - a[1]) * t] : [a[0] + (b[0] - a[0]) * t, at])
    }
  }
  return out
}

/** How much of the polygon's area lies under the rectangle. */
function coveredArea(poly: XY[], r: Rect): number {
  let p = cutAt(poly, true, r.x0, false)
  p = cutAt(p, true, r.x1, true)
  p = cutAt(p, false, r.y0, false)
  p = cutAt(p, false, r.y1, true)
  return p.length < 3 ? 0 : areaOf(p)
}

const inPolygon = (x: number, y: number, poly: XY[]): boolean => {
  let on = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) on = !on
  }
  return on
}

/** Whether the segment ab meets the rectangle (Liang-Barsky). */
function segmentMeets(a: XY, b: XY, r: Rect): boolean {
  let t0 = 0
  let t1 = 1
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  for (let side = 0; side < 4; side++) {
    const p = side === 0 ? -dx : side === 1 ? dx : side === 2 ? -dy : dy
    const q = side === 0 ? a[0] - r.x0 : side === 1 ? r.x1 - a[0] : side === 2 ? a[1] - r.y0 : r.y1 - a[1]
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const t = q / p
    if (p < 0) {
      if (t > t1) return false
      if (t > t0) t0 = t
    } else {
      if (t < t0) return false
      if (t < t1) t1 = t
    }
  }
  return true
}

const pointToRect = (x: number, y: number, r: Rect): number => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.y0 - y, 0, y - r.y1))

/** The distance from the point (x, y) to the segment ab. */
function pointToSegment(x: number, y: number, a: XY, b: XY): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2))
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy))
}

/** The gap between the rectangle and the polygon: 0 where they touch, overlap or one holds the other. */
function gapToPolygon(r: Rect, poly: XY[]): number {
  if (inPolygon((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, poly)) return 0
  let best = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if (segmentMeets(a, b, r)) return 0
    best = Math.min(
      best,
      pointToRect(a[0], a[1], r),
      pointToSegment(r.x0, r.y0, a, b),
      pointToSegment(r.x1, r.y0, a, b),
      pointToSegment(r.x1, r.y1, a, b),
      pointToSegment(r.x0, r.y1, a, b)
    )
  }
  return best
}

// ---------------------------------------------------------------------------
// The placement
// ---------------------------------------------------------------------------

// What each thing costs a spot for the chip, in pixels-worth. The distance from the shape's centre is
// the baseline (a big shape's label stays on its centre); the rest decide when it cannot.
const AWAY = 0.5 // per pixel from the centre
const ON_BADGE = 1e4 // landing on an angle badge: only when no spot at all is clear of them
const ON_MARK = 10 // per corner whose arc or square the chip hides
const HIDES = 120 // for hiding the whole shape (in proportion to how much it hides)
const APART = 3 // per pixel between the chip and the shape
const FREE = 6 // a centre that costs no more than this needs no search

interface LabelPlacementOptions {
  /** The chip's size in pixels; the default is a long name and an area. */
  label?: { w: number; h: number }
  /** Whether the corners' angle badges are drawn and must be kept clear (the default), or not. */
  badges?: boolean
}

/**
 * Where the chip stands, as the point (in drawing units) its centre is anchored to, for a shape
 * lying flat on the page at `wpp` drawing units to a pixel.
 *
 * Spots round the shape's centre are tried, nearest first, then the chip laid against each side of
 * the shape's box and slid along it: one that lands on an angle badge is ruled out; one that hides
 * a corner's arc, or much of the shape, pays for it; one that floats off the shape pays for the
 * gap. So a big shape keeps its label on its centre, and a small, thin or tiny one gets it just
 * above (or beside) it, right against it, whatever the zoom.
 */
export function areaLabelPlacement(pts: V3[], wpp: number, opts: LabelPlacementOptions = {}): { p: V3 } {
  const home = centroid(pts)
  if (pts.length < 3 || !(wpp > 0) || !Number.isFinite(wpp)) return { p: home }
  const label = opts.label ?? LABEL_BOX_PX
  const poly: XY[] = pts.map((p) => [(p[0] - home[0]) / wpp, (p[1] - home[1]) / wpp])
  const n = poly.length
  const total = areaOf(poly)
  const flat: V3[] = poly.map(([x, y]) => [x, y, 0])
  const orientation = Math.sign(poly.reduce((s, p, i) => s + p[0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * p[1], 0)) || 1
  const shape: Rect = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const [x, y] of poly) {
    shape.x0 = Math.min(shape.x0, x)
    shape.y0 = Math.min(shape.y0, y)
    shape.x1 = Math.max(shape.x1, x)
    shape.y1 = Math.max(shape.y1, y)
  }

  const badges: Rect[] = []
  const marks: Rect[] = []
  if (opts.badges !== false) {
    flat.forEach((v, i) => {
      const { dir } = cornerBadge(flat[(i - 1 + n) % n], v, flat[(i + 1) % n], orientation, n === 3)
      badges.push(rectAt(v[0] + dir[0] * BADGE_DISTANCE_PX, v[1] + dir[1] * BADGE_DISTANCE_PX, BADGE_BOX_PX.w, BADGE_BOX_PX.h))
      marks.push(rectAt(v[0], v[1], 2 * CORNER_MARK_PX, 2 * CORNER_MARK_PX))
    })
  }

  // `limit` is the cost to beat: a spot whose cheap terms already reach it is not worked out further.
  // With `clear` set, a spot on a badge is not a candidate at all.
  const cost = (cx: number, cy: number, limit: number, clear: boolean): number => {
    const box = rectAt(cx, cy, label.w, label.h)
    let c = AWAY * Math.hypot(cx, cy)
    for (const b of badges) {
      const o = overlapArea(box, b)
      if (o > 0) {
        if (clear) return Infinity
        c += ON_BADGE + o
      }
    }
    for (const m of marks) if (overlapArea(box, m) > 0) c += ON_MARK
    if (c >= limit) return c
    // The gap to the shape's box can only be less than the gap to the shape itself.
    const lower = APART * rectGap(box, shape)
    if (c + lower >= limit) return c + lower
    // The chip is opaque: a small shape under it is a shape nobody can see.
    if (total > 0 && overlapArea(box, shape) > 0) c += (HIDES * coveredArea(poly, box)) / total
    if (c >= limit) return c
    return c + APART * gapToPolygon(box, poly)
  }

  let best: XY = [0, 0]
  let bestCost = Infinity
  // Spots are tried nearest the centre first, and a tie goes to the one tried first, so the same
  // shape is always labelled in the same place and a symmetric one does not flip with rounding.
  const consider = (cx: number, cy: number, clear: boolean): void => {
    const c = cost(cx, cy, bestCost, clear)
    if (c < bestCost - 1e-9) {
      bestCost = c
      best = [cx, cy]
    }
  }
  const reach = Math.max(...poly.map((v) => Math.hypot(v[0], v[1]))) + BADGE_DISTANCE_PX + BADGE_BOX_PX.w + (label.w + label.h) / 2
  const search = (clear: boolean): void => {
    consider(0, 0, clear)
    // A big shape whose centre is already free needs no search.
    if (bestCost <= FREE) return
    const step = Math.max(6, reach / 40)
    const ways = 32
    // Rings go outwards, and the distance alone is part of the cost, so once a ring costs more than the best spot found nothing further out can win.
    for (let r = step; r <= reach && AWAY * r < bestCost; r += step) {
      for (let k = 0; k < ways; k++) consider(r * Math.cos((2 * Math.PI * k) / ways), r * Math.sin((2 * Math.PI * k) / ways), clear)
    }
    // Then the chip laid against each side of the shape's box and slid along it. The rings miss a
    // narrow free strip, such as the one between two rows of badges round a very small shape, so
    // the slide also stops just clear of the edge of every badge, where a strip begins and ends.
    const x = [shape.x1 + label.w / 2 + 1, shape.x0 - label.w / 2 - 1]
    const y = [shape.y1 + label.h / 2 + 1, shape.y0 - label.h / 2 - 1]
    const along: number[] = [0]
    for (const b of badges) {
      for (const e of [(label.h + BADGE_BOX_PX.h) / 2, (label.w + BADGE_BOX_PX.w) / 2]) {
        along.push((b.y0 + b.y1) / 2 + e + 0.01, (b.y0 + b.y1) / 2 - e - 0.01, (b.x0 + b.x1) / 2 + e + 0.01, (b.x0 + b.x1) / 2 - e - 0.01)
      }
    }
    const slide = Math.max(3, reach / 80)
    for (let t = -reach; t <= reach; t += slide) along.push(t)
    for (const t of along) {
      for (const cx of x) consider(cx, t, clear)
      for (const cy of y) consider(t, cy, clear)
    }
  }
  search(true)
  // Every spot lands on some badge (only possible for a shape with very many corners): the least bad.
  if (!Number.isFinite(bestCost)) search(false)
  return { p: [home[0] + best[0] * wpp, home[1] + best[1] * wpp, home[2]] }
}

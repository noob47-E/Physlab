// Where a Lego piece's corner letter sits when another piece has a corner on the same spot.
//
// Break apart leaves the pieces touching along the cut, and since Fix 17 every piece is lettered,
// so each end of the cut carries two letters (E of one half, H of the other). A point's letter
// normally sits up and to the right (render/viewMath.ts pickLabelOffset), which puts both letters
// on the same spot, one printed over the other. Here each letter moves to its own piece's side of
// the cut instead, just outside the piece. Kept pure so a test can hold the placement.

import { signedArea2D } from '../math/geometry'
import type { V3 } from '../math/vec'

type V2 = [number, number]

/** How far a moved letter's centre sits from its corner, in pixels. */
export const PIECE_LETTER_PX = 22

const unit = (x: number, y: number): V2 | null => {
  const l = Math.hypot(x, y)
  return l > 1e-12 ? [x / l, y / l] : null
}

/**
 * For every piece corner that shares its spot with another piece's corner, the direction (in the
 * drawing's own x, y, y up) its letter should sit in. Corners nobody shares are left out and keep
 * the usual placement.
 *
 * The rule: a side the two pieces share (the cut) says nothing about which piece is which, so it
 * is set aside; the letter sits beyond the corner's other side — outside the piece, leaning along
 * that side into the piece's own half. Two halves of a rectangle cut on its diagonal get their
 * letters on opposite sides of the cut. With both sides shared, or neither, it takes the outward
 * bisector of the corner.
 */
export function pieceLetterDirections(pieces: { points: string[]; pts: V3[] }[], eps = 1e-6): Map<string, V2> {
  const out = new Map<string, V2>()
  const same = (a: V3, b: V3) => Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps
  const othersAt = (i: number, p: V3) => pieces.filter((q, j) => j !== i && q.pts.some((c) => same(c, p)))
  pieces.forEach((piece, i) => {
    const { pts } = piece
    const n = pts.length
    if (n < 3) return
    // Counter-clockwise, the inside is on the left of each side; clockwise, on the right.
    const ccw = signedArea2D(pts) >= 0 ? 1 : -1
    pts.forEach((V, k) => {
      const sharers = othersAt(i, V)
      if (!sharers.length) return
      const P = pts[(k - 1 + n) % n]
      const N = pts[(k + 1) % n]
      const shared = (W: V3) => sharers.some((q) => q.pts.some((c) => same(c, W)))
      // Each side at V: its direction away from V and its outward normal.
      const sides: { e: V2; nrm: V2; shared: boolean }[] = []
      const eN = unit(N[0] - V[0], N[1] - V[1])
      if (eN) sides.push({ e: eN, nrm: [ccw * eN[1], -ccw * eN[0]], shared: shared(N) })
      const eP = unit(P[0] - V[0], P[1] - V[1])
      if (eP) sides.push({ e: eP, nrm: [-ccw * eP[1], ccw * eP[0]], shared: shared(P) })
      const own = sides.filter((s) => !s.shared)
      let dir: V2 | null = null
      if (own.length === 1) dir = unit(own[0].nrm[0] + own[0].e[0], own[0].nrm[1] + own[0].e[1])
      if (!dir) dir = unit(sides.reduce((s, x) => s + x.nrm[0], 0), sides.reduce((s, x) => s + x.nrm[1], 0))
      out.set(piece.points[k], dir ?? [Math.SQRT1_2, Math.SQRT1_2])
    })
  })
  return out
}

// ---------------------------------------------------------------------------
// The pieces' own labels (INT-Wave1)
// ---------------------------------------------------------------------------
//
// After Break apart both halves' name labels sat on their centroids, a third of the way from the
// cut, reading "Right-angled triangle KLM Area 6 u²" (230 px) twice near the middle, on top of
// each other and of the side labels; each shared corner carried two letters side by side. Now a
// piece's label is short (ΔKLM · 6 u²), it stands away from the cut, a shared corner is one label
// ("G, K"), and every label goes through one collision pass that tries a ladder of places.

const samePt = (a: V3, b: V3, eps: number) => Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps

/** Is `p` inside the polygon `pts` (x, y only)? */
export function insidePolygon(p: V3, pts: V3[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** How far the name label is moved away from the cut, as a share of the centroid's own distance from it. */
export const AWAY_FROM_CUT = 0.5

/**
 * Where a piece's name label stands: its centroid, moved away from the side it shares with
 * another piece (the cut) by half its distance from it — for half a rectangle cut on the diagonal
 * that is halfway from the cut to the right angle — so the two halves' labels part instead of
 * meeting at the middle. A piece that shares no side, or would be pushed out of itself, keeps its
 * centroid.
 */
export function pieceNameAnchor(pts: V3[], others: V3[][], eps = 1e-6): V3 {
  const n = pts.length
  const c: V3 = [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n, pts[0]?.[2] ?? 0]
  if (n < 3) return c
  const onOther = (p: V3) => others.some((q) => q.some((r) => samePt(r, p, eps)))
  let mx = 0
  let my = 0
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    if (!onOther(a) || !onOther(b)) continue
    // The foot of the perpendicular from the centroid to this shared side's line.
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const l2 = dx * dx + dy * dy
    if (l2 < eps * eps) continue
    const t = ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy) / l2
    mx += c[0] - (a[0] + t * dx)
    my += c[1] - (a[1] + t * dy)
  }
  if (Math.hypot(mx, my) < eps) return c
  const moved: V3 = [c[0] + mx * AWAY_FROM_CUT, c[1] + my * AWAY_FROM_CUT, c[2]]
  return insidePolygon(moved, pts) ? moved : c
}

/** A shared corner's one label: its letters together, and where it sits. */
export interface MergedCorner {
  text: string
  dir: V2
}

/**
 * Corners of different pieces on one spot become one label, "G, K", in the order the pieces were
 * made; the first corner's point carries it and the others are left out (null). It sits in the
 * direction that is outside every piece there — the sum of each letter's own direction.
 */
export function sharedCornerLabels(pieces: { points: string[]; pts: V3[] }[], nameOf: (id: string) => string, eps = 1e-6): Map<string, MergedCorner | null> {
  const out = new Map<string, MergedCorner | null>()
  const dirs = pieceLetterDirections(pieces, eps)
  const groups: { at: V3; ids: string[] }[] = []
  pieces.forEach((q) =>
    q.points.forEach((id, k) => {
      if (!dirs.has(id)) return
      const g = groups.find((x) => samePt(x.at, q.pts[k], eps))
      if (g) g.ids.push(id)
      else groups.push({ at: q.pts[k], ids: [id] })
    })
  )
  for (const g of groups) {
    const ids = [...new Set(g.ids)]
    if (ids.length < 2) continue
    const sx = ids.reduce((s, id) => s + dirs.get(id)![0], 0)
    const sy = ids.reduce((s, id) => s + dirs.get(id)![1], 0)
    const l = Math.hypot(sx, sy)
    const dir: V2 = l > 1e-9 ? [sx / l, sy / l] : dirs.get(ids[0])!
    out.set(ids[0], { text: ids.map(nameOf).join(', '), dir })
    for (const id of ids.slice(1)) out.set(id, null)
  }
  return out
}

/** A label's box on the screen, y down. */
export interface LabelBox {
  x: number
  y: number
  w: number
  h: number
}

const hits = (a: LabelBox, b: LabelBox) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

/**
 * The collision pass every label goes through: the first free place on a ladder of steps below
 * and above where it wants to be (then to either side), or where it wanted to be if every step is
 * taken. The old pass slid the box to just past whichever label it hit, alternating down and up;
 * with the two long piece labels and four side labels at the middle of a cut it bounced between
 * two taken places and gave up on top of one.
 */
export function settleLabel(box: LabelBox, placed: readonly LabelBox[], gap = 2, rungs = 6): LabelBox {
  if (!placed.some((p) => hits(box, p))) return box
  const dy = box.h + gap
  for (let k = 1; k <= rungs; k++) {
    for (const s of [1, -1]) {
      const b = { ...box, y: box.y + s * k * dy }
      if (!placed.some((p) => hits(b, p))) return b
    }
  }
  for (const s of [1, -1]) {
    const b = { ...box, x: box.x + s * (box.w / 2 + gap) }
    if (!placed.some((p) => hits(b, p))) return b
  }
  return box
}

/**
 * Sides of pieces that lie on top of another piece's side — the cut, once from each half — each
 * with the side that keeps the label. Two "5 u" labels on one line only crowd each other and the
 * pieces' names (one was pushed below the whole rectangle to find room).
 */
export function duplicateSides(sides: { id: string; a: V3; b: V3 }[], eps = 1e-6): Map<string, string> {
  const out = new Map<string, string>()
  sides.forEach((s, i) => {
    const keeper = sides.slice(0, i).find((t) => !out.has(t.id) && ((samePt(s.a, t.a, eps) && samePt(s.b, t.b, eps)) || (samePt(s.a, t.b, eps) && samePt(s.b, t.a, eps))))
    if (keeper) out.set(s.id, keeper.id)
  })
  return out
}

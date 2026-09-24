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

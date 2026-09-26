// The printed four-place table of Φ(z), as a student reads it.
//
// The working has to say "row 1.2, column 0.03 gives 0.8907" in the words of the table in the
// student's book, so this file models the table itself: rows 0.0 … 3.4 in tenths, columns 0.00 …
// 0.09 in hundredths, every cell Φ(z) rounded to four places. Reading the table is a separate
// act from computing Φ, and the two are compared in each Working's check line: the table route
// is what the student can follow, the formula route is what PhysLab trusts, and a disagreement
// beyond the table's own rounding would mean one of them is wrong.

import { phi, phiInv } from './normal'
import { fmtPrecise, texPrecise } from '../format'

/** How many decimal places the table prints. Every school table this project has seen uses 4. */
export const PLACES = 4
/** The last z the table lists; beyond it the value comes from the formula the table was made with. */
export const Z_MAX = 3.49

const DP = (decimals: number) => ({ decimals, precisionMode: 'dp' as const })

/**
 * A number at a fixed number of places with its trailing zeros kept — 0.9500, not 0.95 — because
 * that is how a table prints it and "0.95" reads as a rounder number than the table gave. The
 * rounding and the proper minus sign still come from fmtPrecise; only the padding is added here.
 */
export function padded(v: number, places: number): string {
  const s = fmtPrecise(v, DP(places))
  if (/×10\^/.test(s) || !Number.isFinite(v)) return s
  const [whole, frac = ''] = s.split('.')
  return places === 0 ? whole : `${whole}.${frac.padEnd(places, '0')}`
}

/** `padded` for KaTeX: an ASCII minus and a real exponent. */
export function paddedTex(v: number, places: number): string {
  const s = texPrecise(v, DP(places))
  if (/\\times/.test(s) || !Number.isFinite(v)) return s
  const [whole, frac = ''] = s.split('.')
  return places === 0 ? whole : `${whole}.${frac.padEnd(places, '0')}`
}

/** Round to a number of places, the way the printer of the table did. */
export const toPlaces = (v: number, places = PLACES): number => {
  const r = Math.round(v * 10 ** places) / 10 ** places
  return r === 0 ? 0 : r
}

/** The value printed in the cell for a z that sits exactly on the grid (2 d.p.), z ≥ 0. */
export const cell = (z: number): number => toPlaces(phi(z))

/** "row 1.2, column 0.03" for z = 1.23. Integer hundredths, so 1.23 does not become 1.2299999. */
export function rowCol(z: number): { row: string; col: string } {
  const h = Math.round(z * 100)
  return { row: padded(Math.floor(h / 10) / 10, 1), col: padded((h % 10) / 100, 2) }
}


export interface Inverse {
  /** z at three places — the exact inverse, rounded. */
  z: number
  /** 'cell': p is printed in the table at exactly this z. 'between': p lies between the two cells. */
  how: 'cell' | 'between' | 'beyond'
  lo?: { z: number; cell: number }
  hi?: { z: number; cell: number }
}

/**
 * Find z for an area p ≥ 0.5 and say where it sits in the table.
 *
 * The first pass of this spike walked the cells and interpolated between the two that bracket
 * p. That fails in the tail, where neighbouring cells print the same four digits (Φ(3.08) and
 * Φ(3.09) are both 0.9990): the walk ran past them and answered 3.11 for p = 0.999, whose true
 * z is 3.090. So the three-place z now comes from the exact inverse, and the table is only used
 * to *show* it — the two printed cells either side of it. Φ is increasing, so for zlo ≤ z ≤ zhi
 * the cells satisfy cell(zlo) ≤ p ≤ cell(zhi) after rounding too: the line "p lies between
 * these two cells" is always true as written.
 */
export function readInverse(p: number): Inverse {
  const exact = phiInv(p)
  const z = toPlaces(exact, 3)
  if (z > Z_MAX) return { z, how: 'beyond' }
  const h = Math.round(z * 1000)
  if (h % 10 === 0 && Math.abs(cell(h / 1000) - p) < 1e-12) return { z, how: 'cell', lo: { z, cell: cell(z) } }
  // Bracket the exact z, not the rounded one: 1.9596 rounds to 1.960 but lies below 1.96.
  const zlo = Math.floor(exact * 100 + 1e-9) / 100
  const zhi = toPlaces(zlo + 0.01, 2)
  return { z, how: 'between', lo: { z: zlo, cell: cell(zlo) }, hi: { z: zhi, cell: cell(zhi) } }
}

/**
 * Φ(z) by the table route for a z of either sign given to at most three places — what a student
 * with the book gets, at four places. Two places: the cell. A third place: read the two cells
 * either side and go that many tenths of the way between them (1.645 → halfway from 0.9495 to
 * 0.9505 = 0.9500), which is how books quote Φ(1.645) = 0.95. Past 3.49: the formula. Negative z:
 * 1 minus the reading at |z|, the symmetry the table relies on.
 */
export function tablePhi(z: number): number {
  const a = Math.abs(z)
  let v: number
  if (a > Z_MAX + 1e-9) v = toPlaces(phi(a))
  else {
    const h = Math.round(a * 1000)
    if (h % 10 === 0) v = cell(h / 1000)
    else {
      const lo = cell(Math.floor(h / 10) / 100)
      const hi = cell(toPlaces(Math.floor(h / 10) / 100 + 0.01, 2))
      v = toPlaces(lo + ((h % 10) / 10) * (hi - lo))
    }
  }
  return z < 0 ? toPlaces(1 - v) : v
}

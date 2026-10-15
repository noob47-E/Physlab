// 3D-1: the x, y, z boxes of a typed vector card in the 3-D view. The three boxes are written into the card as the tuple
// \left(x,y,z\right), a form the vector line already reads, so a box's own text (½, 2√3, −4) is what is worked out and an
// unfinished box says what is wrong the way a typed line does.

import type { V3 } from '../math/vec'
import { exactNumber } from './vectorCalcStore'

/** The three boxes as the card's line; an empty box counts as 0. */
export function partsLatex(parts: readonly [string, string, string]): string {
  const p = parts.map((t) => (t.trim() === '' ? '0' : t.trim()))
  return String.raw`\left(` + `${p[0]},${p[1]},${p[2]}` + String.raw`\right)`
}

/** The boxes for a vector: each component as a plain number (no float noise), so switching to the boxes keeps the value. */
export function partsOf(v: V3): [string, string, string] {
  // The card's own field writer (12 figures, a power of ten as \times 10^{n}): what is written reads back as the same vector.
  const one = (n: number): string => (n === 0 ? '0' : (n < 0 ? '-' : '') + exactNumber(Math.abs(n)))
  return [one(v[0]), one(v[1]), one(v[2])]
}

// The complex pair of a quadratic, written exactly, for the "=" card.
//
// The card used to say "No real solution. In complex numbers: x = 1 ± 2.65i" for x² − 2x + 8 = 0. A textbook writes
// the same two numbers as 1 ± √7 i, and a decimal rounds away the exact answer the student was asked for. This module
// works the pair out from the typed coefficients as exact fractions (math/pure/rat.ts) and writes it with the surd
// tools the Pure Math engine already uses (simplifySurd in math/pure/cxpoly.ts).
//
// Only a quadratic is written this way. A cubic or quartic has no formula a student can carry out by hand here, and
// a rounded decimal coefficient (0.3333 is 3333/10000, not a simple fraction) would give a surd nobody recognises, so
// both keep the decimal form the search gives.

import { keypadToMath } from './engine'
import { eSub, parseExpr, varsOf } from '../math/pure/mono'
import { pTrim, polyFromExpr } from '../math/pure/poly'
import { rAbs, rDiv, rFromNumber, rIsNeg, rIsZero, rMul, rNeg, rNum, rStr, rSub, rat, type Rat } from '../math/pure/rat'
import { simplifySurd } from '../math/pure/cxpoly'

/** The coefficients a, b, c of a·x² + b·x + c = 0, highest power first, as exact fractions. */
export type ExactQuadratic = [Rat, Rat, Rat]

/**
 * The largest denominator, in lowest terms, a coefficient may have and still be written exactly. Whole numbers, halves,
 * quarters, fifths and hundredths are simple (2.5 is 5/2, 0.25 is 1/4); 0.3333 is 3333/10000 and is not.
 */
const SIMPLE_DENOMINATOR = 100n

/** The search's numbers and the exact pair may differ by this much, relative to their size: rounding only. */
const AGREE = 1e-9

/**
 * The exact coefficients of "left = right" when it is a quadratic in x whose coefficients are whole numbers or simple
 * fractions, highest power first; null for anything else (a cubic, another letter, pi, a rounded decimal, sin x). A
 * stored letter counts as another letter: x² + A = 0 keeps the decimal form, as it always did.
 */
export function exactQuadratic(left: string, right: string): ExactQuadratic | null {
  try {
    const e = eSub(parseExpr(keypadToMath(left)), parseExpr(keypadToMath(right)))
    if (varsOf(e).some((name) => name !== 'x')) return null
    const p = pTrim(polyFromExpr(e, 'x').poly)
    if (p.length !== 3) return null
    return simpleQuadratic([p[2], p[1], p[0]])
  } catch {
    // The reader refused the line (a letter it does not know, a bracket over a bracket): the decimal form stands.
    return null
  }
}

/**
 * The exact coefficients of a quadratic whose three numbers were typed into the Numbers screen's boxes, highest power
 * first; null for any other count. A typed decimal reads as it was written (2.5 is 5/2), so a rounded decimal such as
 * 0.3333 has a denominator past the limit and keeps the decimal form.
 */
export function exactQuadraticOf(coeffs: number[]): ExactQuadratic | null {
  if (coeffs.length !== 3) return null
  try {
    return simpleQuadratic([rFromNumber(coeffs[0]), rFromNumber(coeffs[1]), rFromNumber(coeffs[2])])
  } catch {
    // A number that is not finite cannot be read as a fraction: the decimal form stands.
    return null
  }
}

/** The coefficients when each one is a simple fraction (see SIMPLE_DENOMINATOR), else null. */
function simpleQuadratic(p: [Rat, Rat, Rat]): ExactQuadratic | null {
  return p.some((c) => c.d > SIMPLE_DENOMINATOR) ? null : p
}

/** The pair in parts: its real part, and the imaginary part as (imaginary coefficient) × √radical, radical 1 being none. */
interface ExactPair {
  re: Rat
  im: Rat
  radical: bigint
}

/**
 * The complex pair of a·x² + b·x + c = 0 when b² − 4ac is negative, or null when it has none to write (a real or double root,
 * or a discriminant whose root will not simplify within the search's limit).
 *
 * The roots are (−b ± √Δ)/2a with Δ = b² − 4ac < 0. Writing −Δ = p/q in lowest terms, √(−Δ) = √(pq)/q, and the square
 * part of pq comes out as a whole number, so √(−Δ) = out·√inner/q. The imaginary part is √(−Δ)/2|a|.
 */
function exactPair([a, b, c]: ExactQuadratic): ExactPair | null {
  if (rIsZero(a)) return null
  const disc = rSub(rMul(b, b), rMul(rat(4n), rMul(a, c)))
  if (!rIsNeg(disc)) return null
  const minusDisc = rNeg(disc)
  const { out, in: inner, tooBig } = simplifySurd(minusDisc.n * minusDisc.d)
  // A root that will not simplify inside the limit is left as the decimal: a surd the search could not finish is not a textbook form.
  if (tooBig) return null
  return {
    re: rDiv(rNeg(b), rMul(rat(2n), a)),
    im: rDiv(rat(out), rMul(rat(minusDisc.d), rMul(rat(2n), rAbs(a)))),
    radical: inner
  }
}

/** A rational as text, with the typographic minus the Calculator writes: 2, −5/4, 1/2 (rStr writes the hyphen). */
const plainRational = (r: Rat): string => rStr(r).replace('-', '−')

/**
 * The imaginary term without its sign, as a textbook writes it: i, 2i, (1/2)i, √7 i, 2√7 i, (√3/2)i, (3√2/4)i. A bare
 * surd or a whole multiple of one takes a space before the i; a fraction over a surd is bracketed, and the i follows it.
 */
function imaginaryTerm(im: Rat, radical: bigint): string {
  const top = im.n
  const bottom = im.d
  if (radical === 1n) {
    if (bottom === 1n) return top === 1n ? 'i' : `${top}i`
    return `(${top}/${bottom})i`
  }
  const root = `√${radical}`
  if (bottom === 1n) return top === 1n ? `${root} i` : `${top}${root} i`
  return `(${top === 1n ? '' : top}${root}/${bottom})i`
}

/**
 * The exact pair of a quadratic, written as the card says it: "1 ± √7 i", "−1/2 ± (√3/2)i", "±2i". Only the one pair is
 * written. The caller passes the coefficients the numeric search solved and the pair it found, and the exact text is
 * given only when the two agree to rounding: a pair that does not agree is a bug in one of the two readings, so the
 * decimal form stands rather than a number that was never the answer.
 *
 * `numeric` holds the search's coefficients, highest power first, and `pair` its root with a positive imaginary part.
 */
export function exactPairText(exact: ExactQuadratic, numeric: number[], pair: { re: number; im: number }): string | null {
  if (numeric.length !== 3 || exact.some((c, k) => !close(rNum(c), numeric[k]))) return null
  return exactPairFor(exact, pair)
}

/**
 * The exact pair of a quadratic, when the search's pair `pair` (real part and positive imaginary part) agrees with it to
 * rounding; null otherwise. The command bar's search solves the same typed polynomial and keeps no coefficients of its
 * own to compare, so the pair is the check there: a pair that is not the search's is never written.
 */
export function exactPairFor(exact: ExactQuadratic, pair: { re: number; im: number }): string | null {
  const root = exactPair(exact)
  if (!root) return null
  const exactIm = rNum(root.im) * (root.radical === 1n ? 1 : Math.sqrt(Number(root.radical)))
  if (!close(rNum(root.re), pair.re) || !close(exactIm, pair.im)) return null
  const im = imaginaryTerm(root.im, root.radical)
  return rIsZero(root.re) ? `±${im}` : `${plainRational(root.re)} ± ${im}`
}

/** Equal to within the rounding of the search: relative to the size of the numbers, never an absolute floor. */
function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= AGREE * Math.max(1, Math.abs(a), Math.abs(b))
}

// Rounding honesty (Idea #39 F45): a card works at full precision and shows the student's
// precision, and the numbers it puts into the formula are written with just enough digits for the
// sum on screen to check. The owner's own example: ½ × 2 kg × (3.13 m/s)² is 9.80 J, while the
// energy of a 2 kg ball that has fallen 0.5 m is 9.81 J; written v = 3.132 m/s, the clash is gone.
//
// This is math/format.ts's rule for every line of worked steps (stepPrecision): the result is the
// true value at the student's precision; the measured inputs start at that precision and gain one
// digit at a time, up to STEP_GUARD_MAX, until the calculation done from the inputs AS WRITTEN gives
// the result as written. When even that cannot (a result on a rounding boundary) the card says ≈.
// A typed given — a 2 kg mass, k = 50 N/m, g = 9.81 m/s² — is exact and keeps its typed form:
// never rounded and never padded (revealPrecision at tolerance 0, the app's rule for an exact value).

import {
  fmtKnown,
  fmtPrecise,
  revealPrecision,
  roundHalfAway,
  shownValue,
  stepPrecision,
  superscriptPowers,
  texPrecise,
  texSci,
  DISPLAY_FLOOR,
  type DigitSettings
} from '../../math/format'

/**
 * The most figures a value may have and still be read as typed. A start height of 1.731 m or a
 * mass of 2.37 kg is typed; a mass worked out from a density (110.98003481 kg) or a dragged
 * position is not, and is rounded like a measured value. Six is more than any value in a preset.
 */
export const GIVEN_FIGURES = 6

export interface DigitInput {
  key: string
  value: number
  /** Its source stays fixed through the run (a definition, the start, g): it may be a typed given. */
  given: boolean
}

/** A number as a card writes it: the value a calculator reads back from `plain`, the sentence form and the LaTeX form. */
export interface ShownNumber {
  value: number
  plain: string
  tex: string
}

interface Digits {
  inputs: Record<string, ShownNumber>
  result: ShownNumber
  /** The shown inputs give the shown result. */
  holds: boolean
}

/** How a card chooses the digits it shows: `honestDigits`, or a planted wrong rule in a test. */
export type DigitRule = (inputs: DigitInput[], compute: (v: Record<string, number>) => number, s: DigitSettings) => Digits

const ONE_FIGURE: DigitSettings = { decimals: 1, precisionMode: 'sf' }

/** The figures a double holds faithfully (format.ts's CALC_FIGURES, which it keeps to itself). */
const CALC_FIGURES = 15

/** The fewest significant figures that write `v` exactly (to the 15 a double holds). */
const typedPrecision = (v: number): DigitSettings => revealPrecision(v, 0, ONE_FIGURE)

/**
 * Whether `v` reads as typed: exact in GIVEN_FIGURES figures or fewer — rounding it there changes
 * nothing a calculator holds (its 15 figures). Asked before typedPrecision, which searches figure by
 * figure, so a value worked out to the last bit costs two roundings, not fifteen writings.
 */
export function isGivenValue(v: number): boolean {
  return Number.isFinite(v) && roundHalfAway(v, GIVEN_FIGURES, 'sf') === roundHalfAway(v, CALC_FIGURES, 'sf')
}

/**
 * `v` written at precision `q`. A measured value goes through fmtPrecise, whose 10⁻¹² floor is right
 * for a run's noise; a known value through fmtKnown, which writes a tiny one in powers of ten.
 */
function write(v: number, q: DigitSettings, known: boolean): ShownNumber {
  const text = known ? fmtKnown(v, q) : fmtPrecise(v, q)
  const tiny = known && v !== 0 && Math.abs(v) < DISPLAY_FLOOR
  return { value: shownValue(text), plain: superscriptPowers(text), tex: tiny ? texSci(v, q) : texPrecise(v, q) }
}

export const honestDigits: DigitRule = (inputs, compute, s) => {
  const value = compute(Object.fromEntries(inputs.map((i) => [i.key, i.value])))
  const result = write(value, s, false)
  const fixed: Record<string, ShownNumber> = {}
  const measured: DigitInput[] = []
  for (const i of inputs) {
    if (i.given && isGivenValue(i.value)) fixed[i.key] = write(i.value, typedPrecision(i.value), true)
    else measured.push(i)
  }
  const shownAt = (q: DigitSettings): Record<string, ShownNumber> => {
    const out = { ...fixed }
    for (const i of measured) out[i.key] = write(i.value, q, false)
    return out
  }
  const agrees = (q: DigitSettings): boolean => {
    const shown = shownAt(q)
    const again = compute(Object.fromEntries(Object.entries(shown).map(([k, n]) => [k, n.value])))
    return !Number.isNaN(value) && write(again, s, false).plain === result.plain
  }
  const { q, holds } = stepPrecision(s, agrees)
  // When no number of extra digits makes it check, the card says ≈: the extra digits would only be noise.
  return { inputs: shownAt(holds ? q : s), result, holds }
}

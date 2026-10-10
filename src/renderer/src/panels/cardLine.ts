// The Vector Calculator: what a card shows — its line under the boxes, in one number form, and whether its arrow fits the drawing.
// Out of vectorCalcStore.ts as a pure move (CLEANUP-PLAN.md CW10).

import type { SceneSettings } from '../core/types'
import { useView } from '../render/viewState'
import { formatMeasure, measureValue, notation, sciExponent, superscriptPowers, texIJK, texMeasure, texSci, texUnit, type MeasureKind } from '../math/format'
import { heading, len, type V3 } from '../math/vec'

// ---------------------------------------------------------------------------
// What a card shows: its line under the boxes, in one number form (V2, V6, H7, H13)
// ---------------------------------------------------------------------------

/**
 * The 2D camera's zoom floor in pixels per grid square: render/CameraRig.tsx's `minZoom`, which a
 * test keeps equal to this. An arrow longer than the drawing is wide at that zoom is not on screen.
 */
export const MIN_ZOOM_2D = 0.05

/**
 * Why an arrow of `length` grid squares cannot be seen, or null when it fits across the drawing at
 * the camera's zoom floor. The 19-digit size a student typed was drawn as nothing, with no word why
 * (V2). The limit is written in the student's unit; `viewportPx` is the drawing's width on screen.
 * With a coarse grid (1 square = 10⁶ cm) the limit is a power of ten, which formatMeasure writes
 * "2.4×10^10" so a value can be read back; a sentence is not read back, and a caret is programming
 * syntax, so it is raised: "2.4 × 10¹⁰ cm" (V6).
 */
export function tooBigToDraw(length: number, settings: SceneSettings, viewportPx: number = useView.getState().widthPx): string | null {
  const limit = viewportPx / MIN_ZOOM_2D
  if (length <= limit) return null
  return `Too big to draw at this scale — the graph shows vectors up to ${superscriptPowers(formatMeasure(limit, 'length', settings))}. It is still used in every answer.`
}

/** c × 10^by with no multiplication in it: the digits stay as they were and only the exponent moves. */
// eslint-disable-next-line no-restricted-syntax -- not shown: the number's own shortest digits, so the shift is exact; texIJK writes the result
const shiftTen = (c: number, by: number): number => Number(c.toExponential().replace(/e([+-]\d+)$/, (_, e: string) => `e${Number(e) + by}`))

/**
 * A vector for the card line. texIJK drops anything under 10⁻¹² as a drag's noise, which wrote a
 * vector typed as 1.6×10⁻¹⁹ î as 0⃗; a vector wholly under that is written in scientific form, one
 * power of ten for the whole of it as the answers write it, instead (H13).
 */
function texCardVector(v: V3, big: number, s: SceneSettings): string {
  // eslint-disable-next-line no-restricted-syntax -- the number writer's own display floor: texIJK writes a component under 10⁻¹² as 0
  if (big === 0 || big >= 1e-12) return texIJK(v, s)
  const parts = v.filter((c) => c !== 0).length
  if (parts === 1 && notation().components === 'ijk') {
    const at = v.findIndex((c) => c !== 0)
    return `${v[at] < 0 ? '-' : ''}${texSci(Math.abs(v[at]), s)}\\hat{${'ijk'[at]}}`
  }
  const e = sciExponent(big, s)
  const inner = texIJK(v.map((c) => shiftTen(c, -e)) as V3, s)
  // A pair or a column has its own brackets.
  const own = notation().components === 'pair' || notation().components === 'column'
  return `${own ? inner : `\\left(${inner}\\right)`}\\times 10^{${e}}`
}

/** A vector for an answer: texIJK, but one under its noise floor is written in scientific form, not as 0⃗ (H13, H17). */
export const texVector = (v: V3, s: SceneSettings): string => {
  const big = Math.max(...v.map(Math.abs))
  // eslint-disable-next-line no-restricted-syntax -- the panel's relative rule (10⁻¹² of the vector's own size); the number is CW9's (P-CW2-REPORT class 1)
  return texCardVector(v.map((c) => (Math.abs(c) < 1e-12 * big ? 0 : c)) as V3, big, s)
}

/**
 * A number written mantissa × 10ⁿ with the unit vector or unit that follows it, or a vector's own
 * brackets with their × 10ⁿ ((1.6î + 1.2ĵ) × 10⁻¹⁹): the pieces cardLineTex keeps whole. KaTeX may
 * break a line after any × that is not inside a group, and a narrow panel wrote "8.18 ×" at the end of
 * one line and "10¹⁹ ĵ" at the start of the next. A brace group is one atom to it: the line still
 * breaks between the terms (after + − =), never inside one (G4c). The answers are not grouped, their
 * TeX is compared as it is written.
 */
const WHOLE_NUMBER =
  /(?:-?\d+(?:\.\d+)?|\\left\((?:(?!\\right\)).)*\\right\)|\\begin\{pmatrix\}(?:(?!\\end\{pmatrix\}).)*\\end\{pmatrix\})\\times 10\^\{-?\d+\}(?:\\hat\{[ijk]\}|\\,\\text\{[^}]*\}(?:\^\d)?)?/g

/**
 * A card's whole line for KaTeX: the vector, its size and, for a vector in the plane, its angle —
 * one number form throughout, where the vector went through KaTeX and its size and angle through
 * plain text (V6: "8.89×10^18" beside 8.89×10¹⁸). The zero vector has no direction, and says so
 * where heading() gave it θ = 0° (H7). A vector under texIJK's and fmt's noise floor is written in
 * scientific form, never as 0⃗ and |A| = 0 (H13); a component under 10⁻¹² of the vector's own size
 * is noise beside it (5∠90° holds 3.06×10⁻¹⁶ in x) and is left out. Each × 10ⁿ number is grouped with
 * its mantissa (WHOLE_NUMBER), so a narrow panel breaks the line between terms, never inside one.
 */
export function cardLineTex(name: string, v: V3, sizeKind: MeasureKind, settings: SceneSettings): string {
  const big = Math.max(...v.map(Math.abs))
  // eslint-disable-next-line no-restricted-syntax -- the panel's relative rule (10⁻¹² of the vector's own size); the number is CW9's (P-CW2-REPORT class 1)
  const clean = v.map((c) => (Math.abs(c) < 1e-12 * big ? 0 : c)) as V3
  const size = len(clean)
  const shown = measureValue(size, sizeKind, settings)
  // texMeasure writes anything under 10⁻¹² as 0; the size of a tiny vector is a real number.
  // eslint-disable-next-line no-restricted-syntax -- the number writer's own display floor (texMeasure), as the line above says
  const sizeTex = size !== 0 && Math.abs(shown) < 1e-12 ? `${texSci(shown, settings)}${texUnit(sizeKind, settings)}` : texMeasure(size, sizeKind, settings)
  const parts = [`\\vec{${name}} = ${texCardVector(clean, big, settings)}`, `|${name}| = ${sizeTex}`]
  // In the plane: the vector keeps no z of its own, so it has an angle (unless it is the zero vector).
  if (clean[2] === 0) parts.push(size === 0 ? '\\text{no direction}' : `\\theta = ${texMeasure(heading(clean), 'direction', settings)}`)
  return parts.join('\\quad ').replace(WHOLE_NUMBER, '{$&}')
}

/**
 * One short line under a card saying what a student can do next with it. The panel's operations
 * read the cards from the top, which nothing on screen said.
 */
export function nextStepHint(names: string[], index: number): string {
  const me = names[index]
  if (names.length === 1) return `Next: Size & angle or Components take ${me} apart, or add a second vector to combine with it.`
  if (index === 0) return `${me} is the first vector: Subtract, Dot and Cross use ${me} and ${names[1]}, in that order.`
  if (index === 1) return `Next: Add all gives the resultant of every card; Subtract gives ${names[0]} − ${me}.`
  return `Add all and Equilibrium use every card, ${me} too; the two-vector operations use only ${names[0]} and ${names[1]}.`
}

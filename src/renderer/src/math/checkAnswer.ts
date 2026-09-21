// Checking a student's own answer — a verifier, not a solver.
//
// It says whether the number is right, and when it is wrong it tries to name the mistake
// (quadrant, sign, sin instead of cos, radians instead of degrees, a factor of ten) instead of
// just saying "no". Every rule is a plain comparison; nothing here guesses or asks a model.

import { getAngleMode, math, preprocess, setAngleMode } from './expr'
import { fmtPrecise, fmtSci, type MeasureSettings } from './format'
import { toDeg, toRad } from './vec'
import type { AnswerField } from './problems'

export type Verdict = 'right' | 'close' | 'wrong' | 'empty' | 'unreadable'

export interface Check {
  verdict: Verdict
  /** A sentence under the box: why it is wrong, or a note about an answer that is right. */
  message?: string
  /** The number PhysLab read from what was typed. */
  parsed?: number
}

/** Units a student is likely to type after the number; they are not part of the value. */
const UNIT_TAIL = /(?<=[\d)\s])\s*(°|N\s*[·⋅]?\s*m|m\s*\/\s*s\s*\^?\s*2|m\s*\/\s*s|N|J|W|kg|m|s|rad|deg|degrees?|units?)\s*$/i

/** Reads "12.5", "5*sqrt(2)", "−3.4 N" or "37°" as a number. Returns null if it makes no sense. */
export function parseAnswer(text: string): number | null {
  // Only a thousands separator goes: "1,234" is 1234, but the comma in "sin(30,40)" or "1,5" is
  // not, and stripping every comma turned those into different numbers instead of "unreadable".
  // The leading group is one to three digits not starting with 0: "0,500" is a decimal written
  // with a comma, and reading it as 500 told the student "wrong power of ten" for a right answer.
  let t = text
    .trim()
    .replace(/−/g, '-')
    .replace(/(?<![\d.,])([1-9]\d{0,2})((?:,\d{3})+)(?![\d,])/g, (_, head: string, tail: string) => head + tail.replace(/,/g, ''))
  if (!t) return null
  t = t.replace(UNIT_TAIL, '')
  if (!t.trim()) return null
  // The practice questions are set in degrees whatever the calculator was last switched to:
  // "sin(30)" typed as an answer must be 0.5 even after a session in radians.
  const prev = getAngleMode()
  setAngleMode('deg')
  try {
    const v = Number(math.evaluate(preprocess(t)))
    return Number.isFinite(v) ? v : null
  } catch {
    return null
  } finally {
    setAngleMode(prev)
  }
}

/** Marks one answer and, when it is wrong, tries to say which mistake produced it. */
export function checkAnswer(text: string, f: AnswerField): Check {
  if (!text.trim()) return { verdict: 'empty' }
  const a = parseAnswer(text)
  if (a === null) return { verdict: 'unreadable', message: 'I could not read that. Type a number like 12.5, or an expression like 5*sqrt(2).' }

  const near = (x: number, y: number, tol = f.tol) => Math.abs(x - y) <= tol
  const angle = f.kind === 'angle'
  /** The same direction, however many turns apart: 216.87° and −143.13° are one answer. */
  const sameWay = (x: number, y: number) => Math.abs((((x - y) % 360) + 540) % 360 - 180) <= f.tol

  // Right, in any form the question accepts.
  if (near(a, f.value)) return { verdict: 'right', parsed: a }
  if (angle) {
    if (sameWay(a, f.value)) {
      // The sentence promises a value between 0° and 360°, so it must not quote a field that was
      // set as −30° as "−30".
      const turn = ((f.value % 360) + 360) % 360
      return { verdict: 'right', parsed: a, message: `Same direction. Written between 0° and 360° it is ${fmtPrecise(turn, { decimals: 2, precisionMode: 'dp' })}°.` }
    }
  }

  // Named mistakes for this particular question come first: they are the most useful thing to say.
  for (const trap of f.traps ?? []) if (near(a, trap.value)) return { verdict: 'wrong', parsed: a, message: trap.why }

  if (near(a, -f.value)) {
    return { verdict: 'wrong', parsed: a, message: 'Right size, wrong sign. Check the direction — or the signs of the components you started from.' }
  }
  if (angle) {
    // The other three quadrants with the same reference angle, compared as directions: the
    // third-quadrant answer written between 0° and 360° (216.87° for a 36.87° field) used to
    // be checked against −143.13° as a plain number and fell through to "Not quite".
    if (sameWay(a, 180 - f.value) || sameWay(a, f.value + 180) || sameWay(a, -f.value)) {
      return { verdict: 'wrong', parsed: a, message: 'Right reference angle, wrong quadrant. The signs of the two components decide which quadrant the vector is in.' }
    }
    if (near(a, toRad(f.value), Math.max(f.tol, 0.02))) {
      return { verdict: 'wrong', parsed: a, message: 'That is the answer in radians. This box wants degrees — check your calculator is in DEG.' }
    }
    if (near(a, toDeg(f.value), Math.max(f.tol, 1))) {
      return { verdict: 'wrong', parsed: a, message: 'That looks like degrees converted a second time. Your calculator was probably in the wrong angle mode.' }
    }
  }
  for (const k of [-6, -3, -2, -1, 1, 2, 3, 6]) {
    const p = 10 ** k
    if (f.value !== 0 && Math.abs(a - f.value * p) <= f.tol * p) {
      return { verdict: 'wrong', parsed: a, message: 'Right digits, wrong power of ten. Check the decimal point and the units.' }
    }
  }
  // Nearly there: usually rounding too early in the middle of the working.
  if (near(a, f.value, f.tol * 4)) {
    return { verdict: 'close', parsed: a, message: 'Right method — just rounded a little early. Keep four digits until the last line.' }
  }
  return { verdict: 'wrong', parsed: a, message: 'Not quite. Press Hint to see the next step.' }
}

/** The answer as PhysLab would write it, for the "show me" button — in the student's precision. */
export function expectedText(f: AnswerField, s: Pick<MeasureSettings, 'decimals' | 'precisionMode'> = { decimals: 4, precisionMode: 'dp' }): string {
  // fmtPrecise writes anything under 1e-12 as 0, which is right for a dragged point and wrong
  // for a known answer: an electron's 1.6×10⁻¹⁹ N must never be revealed as "0 N".
  const v = f.value
  const n = v !== 0 && Math.abs(v) < 1e-12 ? fmtSci(v, s) : fmtPrecise(v, s)
  // A degree sign sits against its number, as formatMeasure writes it: "36.87°", not "36.87 °".
  const gap = f.unit === '°' ? '' : ' '
  return `${n}${f.unit ? `${gap}${f.unit}` : ''}`
}

/** A right or close answer counts; empty and unreadable do not. */
export const isCorrect = (c: Check | undefined): boolean => c?.verdict === 'right' || c?.verdict === 'close'

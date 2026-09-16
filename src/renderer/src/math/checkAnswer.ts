// Checking a student's own answer — a verifier, not a solver.
//
// It says whether the number is right, and when it is wrong it tries to name the mistake
// (quadrant, sign, sin instead of cos, radians instead of degrees, a factor of ten) instead of
// just saying "no". Every rule is a plain comparison; nothing here guesses or asks a model.

import { math, preprocess } from './expr'
import { fmt } from './format'
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
  let t = text.trim().replace(/−/g, '-').replace(/,/g, '')
  if (!t) return null
  t = t.replace(UNIT_TAIL, '')
  if (!t.trim()) return null
  try {
    const v = Number(math.evaluate(preprocess(t)))
    return Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

/** Marks one answer and, when it is wrong, tries to say which mistake produced it. */
export function checkAnswer(text: string, f: AnswerField): Check {
  if (!text.trim()) return { verdict: 'empty' }
  const a = parseAnswer(text)
  if (a === null) return { verdict: 'unreadable', message: 'I could not read that. Type a number like 12.5, or an expression like 5*sqrt(2).' }

  const near = (x: number, y: number, tol = f.tol) => Math.abs(x - y) <= tol
  const angle = f.kind === 'angle'

  // Right, in any form the question accepts.
  if (near(a, f.value)) return { verdict: 'right', parsed: a }
  if (angle) {
    const diff = (((a - f.value) % 360) + 540) % 360 - 180
    if (Math.abs(diff) <= f.tol) {
      return { verdict: 'right', parsed: a, message: `Same direction. Written between 0° and 360° it is ${fmt(f.value, 2)}°.` }
    }
  }

  // Named mistakes for this particular question come first: they are the most useful thing to say.
  for (const trap of f.traps ?? []) if (near(a, trap.value)) return { verdict: 'wrong', parsed: a, message: trap.why }

  if (near(a, -f.value)) {
    return { verdict: 'wrong', parsed: a, message: 'Right size, wrong sign. Check the direction — or the signs of the components you started from.' }
  }
  if (angle) {
    if (near(a, 180 - f.value) || near(a, f.value - 180) || near(a, 360 - f.value)) {
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

/** The answer as PhysLab would write it, for the "show me" button. */
export function expectedText(f: AnswerField): string {
  return `${fmt(f.value, 4)}${f.unit ? ` ${f.unit}` : ''}`
}

/** A right or close answer counts; empty and unreadable do not. */
export const isCorrect = (c: Check | undefined): boolean => c?.verdict === 'right' || c?.verdict === 'close'

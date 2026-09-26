// One decision, made in one place: does the algebra engine read sin, cos and tan in degrees?
//
// The command bar used to send SymPy the degree flag only when the expression had no x, y or t
// in it, so in DEG mode diff(sin(x)) went out in radians while the calculator's own ddx(sin(x), 30)
// worked in degrees (calc/engine.ts, lambdaOf). The same expression meant two things on one
// screen. The calculator follows the angle mode the way the fx-991EX does, so the algebra engine
// now follows it too, letters or not.

import type { AngleUnit } from '../math/format'

/** True when the CAS should treat every trigonometric argument as degrees. */
export function casInDegrees(angleUnit: AngleUnit): boolean {
  return angleUnit === 'deg'
}

/** The operations whose answer changes shape with the unit: d/dx sin(x) in degrees carries a π/180. */
const CALCULUS = new Set(['diff', 'integrate', 'limit', 'series'])
const TRIG = /\b(a?(sin|cos|tan|sec|csc|cot)h?|arc(sin|cos|tan))\b/i

/**
 * The note a calculus answer carries in DEG mode, or null when the unit made no difference.
 * Degrees are what the calculator and the fx-991EX use, so the algebra engine uses them too —
 * but a textbook's ∫₀^π sin x dx = 2 is a radian result, and an answer of 0.048 with nothing
 * said about the unit is a puzzle, not an answer.
 */
export function calculusUnitNote(op: string, expr: string, deg: boolean): string | null {
  if (!deg || !CALCULUS.has(op) || !TRIG.test(expr)) return null
  return 'angles in degrees; switch to RAD for the textbook form'
}

// What the Statistics mode works out from a fitted line, kept out of the panel so the number it
// shows can be tested without a screen.

import { compileScalar } from '../math/expr'
import type { StatResult } from './engine'

/**
 * ŷ at x: the fitted line, as `statistics` wrote it in `res.expr`, worked out at x. No value (NaN,
 * which the calculator writes as "no value") for a one-variable table, and wherever the line has
 * none — the log of a number that is not positive, a fit that could not be made.
 *
 * The expression is worked out with the compiler the viewport draws the fitted curve with, as it is,
 * so the number here and the curve cannot disagree. This used to turn ln( into log( first, and in
 * the shared maths instance log(x) is base 10 (the calculator's log key) — a log fit's ŷ came out
 * ln 10 times too small in its b·ln x term while the curve beside it was right.
 */
export function predictY(res: Pick<StatResult, 'expr'>, x: number): number {
  if (!res.expr) return NaN
  try {
    return compileScalar(res.expr, ['x'], () => ({}))({ x })
  } catch {
    return NaN
  }
}

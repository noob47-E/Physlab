// G2: what every answer checker returns. 'equal' is proved, 'different' is proved, 'unknown' is everything else, and
// the app then says it cannot solve that one yet. A checker never says 'equal' for a wrong answer.
export type Verdict = 'equal' | 'different' | 'unknown'

/**
 * The answer is not something the exact forms can hold, or is too big to work out here; the caller decides by numbers
 * or says 'unknown'.
 */
export class NotExact extends Error {}

/**
 * The checker's time is up. Not a NotExact: there is no time left to try the numbers either, so it goes straight out to
 * `safely`, which answers 'unknown'.
 */
class OutOfTime extends Error {}

/**
 * How long one public call may work, in milliseconds. The checks run on the window's own thread, and the adversarial
 * review found inputs that took minutes (sinh at 10⁶ in 40 digits, Sturm chains of huge numbers). Every loop that can
 * run long calls `tick`, and each single step between two ticks is bounded by a size guard of its own.
 */
const BUDGET_MS = 1500

let deadline = Infinity
let depth = 0

/** Throws OutOfTime once the current public call has used its budget. Cheap: call it in every loop that can run long. */
export function tick(): void {
  if (Date.now() > deadline) throw new OutOfTime('out of time')
}

/**
 * fn, except that any exception gives `fallback()`: a checker that cannot finish has proved nothing, so it says
 * 'unknown' and never throws at the caller. The outermost call starts the time budget; a checker called by another
 * (factorCheck calls polyEqual) shares its caller's.
 */
export function safely<A extends unknown[], R>(fn: (...args: A) => R, fallback: () => R): (...args: A) => R {
  return (...args: A): R => {
    if (depth++ === 0) deadline = Date.now() + BUDGET_MS
    try {
      return fn(...args)
    } catch {
      return fallback()
    } finally {
      if (--depth === 0) deadline = Infinity
    }
  }
}

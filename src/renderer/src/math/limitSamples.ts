// Reading a limit from the numbers next to its point, the way a student does it by hand: put in values that
// come closer and closer to the point and see where they go.
//
// Two jobs use this. It is the fallback when no rule (math/pure/limitWorking.ts) gives an answer, and it is
// the check on every answer a rule does give: a claimed value is accepted only when every sample agrees with
// it, so a wrong claim is refused whatever rule it came from. Nothing here is shown as an answer on its own.
//
// Pure: no store, no DOM. Trigonometry is in radians (compileScalar's rule), as every limit textbook has it.

import { compileScalar, math, preprocess } from './expr'

/**
 * How close the samples come. Each sample is 1/G from the point (or G out, at ±∞), for each G here. The closest
 * is 10⁻⁵ away: near enough for the limits a school course asks, and not so near that a difference of two nearly
 * equal numbers (1 − cos x loses all its digits at 10⁻⁸ in doubles) is taken for the limit.
 */
const SAMPLE_SIZES: readonly number[] = [1e2, 1e3, 1e4, 1e5]

/** The closest size the samples reach: a value is judged there last. */
export const FINEST_G = SAMPLE_SIZES[SAMPLE_SIZES.length - 1]

/**
 * Rounding noise in evaluating a function near its point: a fixed part, added to the part a limit's own approach
 * allows (10 / G). Both are relative to the size of the value they judge, never an absolute floor (AGENTS.md).
 */
const NOISE = 1e-9

/** The one letter a limit is taken in, with its name. */
export type Fn = (x: number) => number
/** A direction of approach: +1 from above (or +∞), −1 from below (or −∞). */
export type Side = 1 | -1
/** One value of the function: at G (1/G from the point, or G out), the function's value there. */
export interface Sample {
  g: number
  x: number
  v: number
}
/** What the function does on one side, read from its samples. */
export type Behaviour = { kind: 'value'; value: number } | { kind: 'grows'; sign: Side } | { kind: 'unclear' }

/** The names an expression may use besides the limit's letter: the two constants and infinity. */
const CONSTANT_SYMBOLS: ReadonlySet<string> = new Set(['e', 'pi', 'tau', 'Infinity'])

/**
 * The expression as a function of its one letter, or null when it uses any other letter (a limit is taken in one
 * letter; the others need values first) or cannot be read at all.
 */
export function compileLimitBody(body: string, variable: string): Fn | null {
  try {
    const node = math.parse(preprocess(body))
    let foreign = false
    node.traverse((n, path) => {
      if (math.isSymbolNode(n) && path !== 'fn' && n.name !== variable && !CONSTANT_SYMBOLS.has(n.name)) foreign = true
    })
    if (foreign) return null
    const f = compileScalar(body, [variable], () => ({}))
    return (x: number): number => {
      const v = f({ [variable]: x })
      return typeof v === 'number' ? v : NaN
    }
  } catch {
    return null
  }
}

/** The allowed wobble of a value that a limit with these samples shows at size G, judged against the value's own size. */
const tolerance = (g: number, scale: number): number => (10 / g + NOISE) * Math.max(1, Math.abs(scale))

/** The samples of `f` on one side: near a finite point, or far out along ±∞ (where `dir` is the sign). */
export function samplesOf(f: Fn, point: number, dir: Side): Sample[] {
  return SAMPLE_SIZES.map((g) => {
    const x = Number.isFinite(point) ? point + dir / g : dir * g
    return { g, x, v: f(x) }
  })
}

/** Whether every sample is within what a limit equal to `value` allows at its size. */
export function holdsValue(samples: Sample[], value: number): boolean {
  return Number.isFinite(value) && samples.every((s) => Number.isFinite(s.v) && Math.abs(s.v - value) <= tolerance(s.g, value))
}

/** Whether every sample has gone off to `sign` ∞ at least as fast as 0.9·G (so 1/x at 10⁻⁵ is 10⁵ or more). */
export function holdsGrows(samples: Sample[], sign: Side): boolean {
  return samples.every((s) => sign * s.v >= 0.9 * s.g)
}

/**
 * What the function does on one side. A side that grows past every sample is ±∞. Otherwise the value is the
 * limit taken from the last two samples (10 steps apart, so a difference that falls off as the size does is
 * cancelled), and it is accepted only if every sample agrees with it. Anything else is unclear: no answer.
 */
export function behaviourOf(samples: Sample[]): Behaviour {
  if (samples.some((s) => Number.isNaN(s.v))) return { kind: 'unclear' }
  for (const sign of [1, -1] as const) if (holdsGrows(samples, sign)) return { kind: 'grows', sign }
  const [near, nearest] = samples.slice(-2)
  if (!Number.isFinite(near.v) || !Number.isFinite(nearest.v)) return { kind: 'unclear' }
  const value = (10 * nearest.v - near.v) / 9
  return holdsValue(samples, value) ? { kind: 'value', value } : { kind: 'unclear' }
}

/** Whether the function goes to 0 on this side: its own behaviour is a value that is 0 at the size the samples reach. */
export function tendsToZero(samples: Sample[]): boolean {
  const b = behaviourOf(samples)
  const last = samples[samples.length - 1]
  return b.kind === 'value' && Math.abs(b.value) <= tolerance(last.g, 0)
}

/** Two sides agree when they go to the same number, or to ∞ in the same direction. */
export function sidesAgree(a: Behaviour, b: Behaviour): boolean {
  if (a.kind === 'value' && b.kind === 'value') return Math.abs(a.value - b.value) <= tolerance(FINEST_G, a.value)
  if (a.kind === 'grows' && b.kind === 'grows') return a.sign === b.sign
  return false
}

/**
 * Whether a derivative is the slope of the function it came from. The slope is the central difference at a few
 * points away from any pole; the derivative must agree with it to about 10⁻⁵ of its size, at at least two of them.
 */
export function derivativeMatches(f: Fn, df: Fn): boolean {
  const h = 1e-5
  let checked = 0
  for (const x of [-0.73, 0.37, 1.3, 2.7]) {
    const slope = (f(x + h) - f(x - h)) / (2 * h)
    const claim = df(x)
    if (!Number.isFinite(slope) || !Number.isFinite(claim)) continue
    if (Math.abs(slope - claim) > 1e-5 * Math.max(1, Math.abs(claim))) return false
    checked++
  }
  return checked >= 2
}

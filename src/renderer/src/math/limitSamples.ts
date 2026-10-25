// Reading a limit from the numbers next to its point, the way a student does it by hand: put in values that
// come closer and closer to the point and see where they go.
//
// Two jobs use this. It is the fallback when no rule (math/pure/limitWorking.ts) gives an answer, and it is
// the check on every answer a rule does give: a claimed value is accepted only when every sample agrees with
// it, so a wrong claim is refused whatever rule it came from. Nothing here is shown as an answer on its own.
//
// Every test is judged against the function's own size, never an absolute floor (AGENTS.md): a limit of
// 6.67·10⁻¹¹ is as much a limit as 6.67, and a function that is 10⁻⁹ everywhere is not a function that is 0.
//
// Pure: no store, no DOM. Trigonometry is in radians (compileScalar's rule), as every limit textbook has it.

import { compileScalar, math, preprocess } from './expr'
import { toPrecisionHalfAway } from './format'

/**
 * How far from the point the samples are taken: 1/G from the point (or G out, at ±∞), for each G here, from the
 * coarsest to the closest. The sizes are irrational on purpose. A size that is a simple decimal makes a function
 * such as sin(10πx) take the same value (0) at every sample, so it would read as a limit that is 0. These sizes
 * are not whole multiples of one another, so no period divides all of them.
 */
const SAMPLE_SIZES: readonly number[] = [100 * Math.SQRT2, (1000 * Math.PI) / 3, 10000 * Math.sqrt(3), 100000 * Math.sqrt(1.7)]

/**
 * A finer size, read after the samples. A jump or a steep wiggle that lies closer to the point than the samples
 * reach looks like a settled value at the samples (tanh(10⁶x) is 1 at every sample but 0 at the point); a value must
 * also hold here. It is not set finer than this: at 10⁻⁷ the rounding of 1 − cos x over x² is 2 %, which no
 * tolerance that still catches a jump could absorb.
 */
const PROBE_SIZES: readonly number[] = [1e6 * Math.sqrt(5)]

/**
 * Rounding noise in the function's values, relative to their own size, at the coarsest sample. A difference of two
 * nearly equal values loses digits in proportion to the inverse square of the distance from the point (1 − cos x
 * over x² has 4 % error at 10⁻⁷), so the allowance at a sample grows with the square of its size. The same figure
 * is the relative tolerance between the two sides.
 */
const NOISE = 1e-11

/**
 * The allowance at the probes, relative to the function's size. The probes sit closer to the point than the samples
 * do, where the rounding above is far larger than the value; they are there to catch a jump or a steep rise
 * (tanh(10⁶x) is 1 at the samples but 0 at the point, a 58 % difference), not to measure a value to the last digit.
 */
const PROBE_TOLERANCE = 1e-2

/**
 * How far a value may be off at a sample, in multiples of the error at the coarsest sample. A limit approached as
 * c/G gets ten times nearer at each step of ten, so a deviation larger than this (after the factor G₀/G) is an
 * oscillation or a slower approach, not a limit.
 */
const SLACK = 10

/**
 * A nonzero value this small beside the error the coarsest sample is off by is not told apart from the second-order
 * error of the two-point extrapolation (x² extrapolates to −4·10⁻¹⁰, which is 0) or from rounding: it is unclear
 * rather than shown as a figure the samples cannot back. Exactly 0 is 0.
 */
const TINY = 1e-4

/** The one letter a limit is taken in, with its name. */
export type Fn = (x: number) => number
/** A direction of approach: +1 from above (or +∞), −1 from below (or −∞). */
export type Side = 1 | -1
/** One value of the function: at G (1/G from the point, or G out), the function's value there. */
interface Sample {
  g: number
  x: number
  v: number
}
/** One side of the point: the samples, and the finer probes that every answer must also meet. */
export interface Reading {
  samples: Sample[]
  probes: Sample[]
}
/** What the function does on one side. `scale` is the largest value the samples took, the size the tests judge by. */
export type Behaviour = { kind: 'value'; value: number; scale: number } | { kind: 'grows'; sign: Side } | { kind: 'unclear' }

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

/** The function read at the samples and the probes on one side of the point, or at ±∞ (where `dir` is the sign). */
export function readingOf(f: Fn, point: number, dir: Side): Reading {
  const at = (g: number): Sample => {
    const x = Number.isFinite(point) ? point + dir / g : dir * g
    return { g, x, v: f(x) }
  }
  return { samples: SAMPLE_SIZES.map(at), probes: PROBE_SIZES.map(at) }
}

const allFinite = (r: Reading): boolean => [...r.samples, ...r.probes].every((s) => Number.isFinite(s.v))

/** The largest value the samples took, the size of the function near the point. */
const sizeOf = (samples: Sample[]): number => samples.reduce((m, s) => Math.max(m, Math.abs(s.v)), 0)

/**
 * The limit the two closest samples give, when the values approach as c/G: v = L + c/G, so L = (G₂v₂ − G₁v₁)/(G₂ − G₁).
 * The sizes are the samples' own (they are not 10 apart), so the formula takes them as they are.
 */
function extrapolated(samples: Sample[]): number {
  const [near, nearest] = samples.slice(-2)
  return (nearest.g * nearest.v - near.g * near.v) / (nearest.g - near.g)
}

/**
 * Whether `value` is a limit the reading supports: every sample and every probe lies within what a 1/G approach to
 * it allows. The allowance at each size is the coarsest error shrunk by G₀/G, plus the rounding that grows with G.
 */
export function holdsValue(r: Reading, value: number): boolean {
  if (!Number.isFinite(value) || !allFinite(r)) return false
  const first = r.samples[0]
  const d0 = Math.max(
    Math.abs(first.v - value),
    r.samples[1] ? Math.abs(r.samples[1].v - value) * (r.samples[1].g / first.g) : 0
  )
  const size = Math.max(Math.abs(value), sizeOf(r.samples))
  const approach = (s: Sample): number => SLACK * (first.g / s.g) * d0
  const floor = (s: Sample): number => NOISE * size * (s.g / first.g) ** 2
  const samplesAgree = r.samples.every((s) => Math.abs(s.v - value) <= approach(s) + floor(s))
  const probesAgree = r.probes.every((s) => Math.abs(s.v - value) <= approach(s) + PROBE_TOLERANCE * size)
  return samplesAgree && probesAgree
}

/**
 * Whether the deviations of a sampled value fall as one power of the size (1/G for c/G, 1/G² for c/G², and so on), at
 * every step. A bounded oscillation under a falling envelope (cos x over x, or x ln x) has deviations whose ratios come
 * out at random, so the power differs from step to step and the value is refused, however small each deviation is.
 * A deviation at the level of rounding is left out of the comparison: it has no power to speak of. This is asked of a
 * value read from the samples only; an exact value from a rule is checked by holdsValue alone, since its function is
 * not sampled into a guess (a rational function with a large second-order term changes its power from one size to the
 * next, and is still exactly the limit it is worked to be).
 */
function approachIsSteady(r: Reading, value: number): boolean {
  const first = r.samples[0]
  const size = Math.max(Math.abs(value), sizeOf(r.samples))
  const usable = r.samples
    .map((s) => ({ g: s.g, d: Math.abs(s.v - value), f: NOISE * size * (s.g / first.g) ** 2 }))
    .filter((p) => p.d > p.f)
  const orders: number[] = []
  for (let i = 0; i + 1 < usable.length; i++) {
    const near = usable[i]
    const far = usable[i + 1]
    orders.push(Math.log(near.d / far.d) / Math.log(far.g / near.g))
  }
  if (orders.length === 0) return true
  const lowest = Math.min(...orders)
  const highest = Math.max(...orders)
  return lowest > 0.3 && highest - lowest <= 0.1
}

/**
 * Whether the function has gone off to `sign` ∞: at every size its value is positive and at least as large, in
 * proportion to the size, as at the size before (so 1/x at 10⁻⁵ is 10⁵, and x/2 is a half of the size). A value that
 * grows more slowly than the size, or that drops back, is not growth.
 */
export function holdsGrows(r: Reading, sign: Side): boolean {
  if (!allFinite(r)) return false
  let previous = 0
  for (const s of [...r.samples, ...r.probes]) {
    const ratio = (sign * s.v) / s.g
    if (!(ratio > 0) || ratio < 0.9 * previous) return false
    previous = ratio
  }
  return true
}

/**
 * What the function does on one side. A side that grows in proportion to its size is ±∞. Otherwise the value is
 * the limit the two closest samples give, and it is accepted only if every sample and probe agrees with it. A value
 * that is nonzero but too small beside the function's own size is unclear: the samples cannot tell it from rounding.
 */
export function behaviourOf(r: Reading): Behaviour {
  if (!allFinite(r)) return { kind: 'unclear' }
  for (const sign of [1, -1] as const) if (holdsGrows(r, sign)) return { kind: 'grows', sign }
  const scale = sizeOf(r.samples)
  const value = extrapolated(r.samples)
  const coarseError = Math.abs(r.samples[0].v - value)
  if (value !== 0 && Math.abs(value) <= TINY * coarseError) return { kind: 'unclear' }
  return holdsValue(r, value) && approachIsSteady(r, value) ? { kind: 'value', value, scale } : { kind: 'unclear' }
}

/** Whether the function goes to 0 on this side, as a 1/G approach to 0 (so a numerator of sin x is 0 at 0). */
export function tendsToZero(r: Reading): boolean {
  return holdsValue(r, 0)
}

/**
 * Two sides agree when they go to the same number, to the rounding the sides carry, or to ∞ in the same direction.
 * The numbers are compared with a tolerance that is relative to their own size, so 10⁻¹¹ and 0 are not the same
 * limit and 2 and 2 + 10⁻⁹ are.
 */
export function sidesAgree(a: Behaviour, b: Behaviour): boolean {
  if (a.kind === 'value' && b.kind === 'value') {
    const size = Math.max(Math.abs(a.value), Math.abs(b.value))
    return Math.abs(a.value - b.value) <= 1e-7 * size + NOISE * Math.max(a.scale, b.scale)
  }
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

/** A value read from the samples, to four figures: the figures a sampled limit is shown to. */
export function settledValue(c: number): number {
  return Number(toPrecisionHalfAway(c, 4))
}

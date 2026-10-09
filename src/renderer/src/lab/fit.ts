// Fitting a shape through readings, and judging how well it matches.
//
// The calculator's statistics() already does the least-squares work for eight shapes. What it does
// not give is a number that lets the shapes be compared with each other: it returns r, and for the
// transformed fits (log, exponential, power, inverse) that r describes the straightened data, not
// the readings themselves — and for a quadratic it returns no r at all. So r² is worked out here
// from the residuals of the real readings, which is the same measure for every shape and is what
// makes "a curve fits better" an honest statement.

import { statistics } from '../calc/engine'
import { compileScalar } from '../math/expr'
import { roundHalfAway, superscriptPowers, toExponentialHalfAway, toFixedHalfAway } from '../math/format'
import type { FitShape } from './types'

export interface Fit {
  shape: FitShape
  /** How the shape is written, e.g. "y = a + bx". */
  label: string
  /** The fitted curve as a mathjs expression in x. */
  expr: string
  coef: Record<string, number>
  /** Fraction of the spread in y the fit accounts for: 1 is a perfect match. */
  r2: number
  predict: (x: number) => number
  /** Reading minus fit, one per point. */
  residuals: number[]
  /** A straight line only. */
  slope?: number
  intercept?: number
  /** How uncertain the gradient is, from the scatter of the points about the line. */
  slopeError?: number
}

export const FIT_SHAPES: FitShape[] = ['linear', 'quadratic', 'log', 'exp', 'power', 'inverse']

/** Fewer than three readings cannot show whether a shape fits; two can only ever be a line. */
export const MIN_POINTS = 3

/**
 * Fits one shape. Returns null when the readings cannot support it — too few points, or values a
 * shape cannot take (a logarithm of zero, a power of a negative reading).
 */
export function fitOf(xs: number[], ys: number[], shape: FitShape): Fit | null {
  if (xs.length < MIN_POINTS || xs.length !== ys.length) return null
  // A reading that is not a number (NaN from an empty or broken cell, ±∞) has no place on any curve:
  // it made r² NaN, and rankFits then sorted on NaN, so the "best" shape hung on the row order.
  if (!xs.every(Number.isFinite) || !ys.every(Number.isFinite)) return null
  let expr: string | undefined
  let label: string | undefined
  let coef: Record<string, number> | undefined
  try {
    const res = statistics(xs, ys, null, shape)
    expr = res.expr
    label = res.label
    coef = res.coef
  } catch {
    return null
  }
  if (!expr || !coef || Object.values(coef).some((c) => !Number.isFinite(c))) return null

  let predict: (x: number) => number
  try {
    const fn = compileScalar(expr, ['x'], () => ({}))
    predict = (x: number) => fn({ x })
  } catch {
    return null
  }

  const fitted = xs.map(predict)
  if (fitted.some((v) => !Number.isFinite(v))) return null
  const residuals = ys.map((y, i) => y - fitted[i])

  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length
  const ssTot = ys.reduce((a, y) => a + (y - meanY) ** 2, 0)
  const ssRes = residuals.reduce((a, e) => a + e * e, 0)
  // Readings that are all the same have no spread to explain; call that a perfect fit only if the
  // curve passes through them. "No spread" means spread at the level of rounding in the numbers
  // themselves, so values like 1e-7 are not all zero just because they are small, and readings of
  // 1000000.000, .001, .0021 still have a spread to fit.
  const yScale = ys.reduce((a, y) => Math.max(a, Math.abs(y)), 0)
  const noise = Math.max(ys.length * (yScale * 1e-13) ** 2, Number.MIN_VALUE)
  const r2 = ssTot <= noise ? (ssRes <= noise ? 1 : 0) : 1 - ssRes / ssTot
  if (!Number.isFinite(r2)) return null

  const fit: Fit = { shape, label: label ?? shape, expr, coef, r2, predict, residuals }

  if (shape === 'linear') {
    fit.intercept = coef.a
    fit.slope = coef.b
    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length
    const sxx = xs.reduce((a, x) => a + (x - meanX) ** 2, 0)
    // The textbook standard error of a gradient: how much the scatter about the line could have
    // tilted it. Needs at least one degree of freedom left over, and x readings that differ by more
    // than rounding — measured RELATIVE to their own size, as the y spread is above. An absolute
    // sxx > 1e-12 dropped the error for every x near 10⁻⁷ (sxx about 10⁻¹³), however real its scatter.
    const xScale = xs.reduce((a, x) => Math.max(a, Math.abs(x)), 0)
    const xNoise = Math.max(xs.length * (xScale * 1e-13) ** 2, Number.MIN_VALUE)
    // Readings exactly on the line (ssRes at rounding level, the same `noise` r² uses) have no
    // scatter, so an error of 0: far from zero their rounding read as "3.30000000000 ± 0.00000000003".
    if (xs.length > 2 && sxx > xNoise) fit.slopeError = ssRes > noise ? Math.sqrt(ssRes / (xs.length - 2) / sxx) : 0
  }
  return fit
}

/** Every shape that can be fitted, best match first. */
export function rankFits(xs: number[], ys: number[]): Fit[] {
  return FIT_SHAPES.map((s) => fitOf(xs, ys, s))
    .filter((f): f is Fit => f !== null)
    .sort((a, b) => b.r2 - a.r2)
}

/** r² at or above this is a good fit: the shape follows the readings. */
export const FIT_GOOD = 0.9
/** At or above this the readings sit very close to the shape, and no other is worth offering. */
export const FIT_CLOSE = 0.98
/** Below this even the best shape does not follow the readings: nothing is worth naming. */
export const FIT_FAIR = 0.7
/** A good shape must beat the one in use by this much to be offered at all… */
const WORTH_IT = 0.02
/** …and by this much to be called "much better", or to be offered when it is only fair. */
const MUCH_BETTER = 0.1

/** What to tell the student about the shape they have chosen. */
export type FitAdvice =
  | { kind: 'none' }
  /** Another shape fits better; `good` says whether it fits well, or only better. */
  | { kind: 'better'; best: Fit; current: number | null; much: boolean; good: boolean }
  /** No shape follows the readings: likely more than one bounce or swing in the table. */
  | { kind: 'noShape'; best: Fit }

/**
 * Whether another shape is worth suggesting over the one in use. A small improvement is not worth
 * pulling a student away from the straight line their practical was designed around, so a good
 * shape has to win by 0.02. A shape that is better but not good (r² 0.7–0.9) is still named when
 * the one in use is poor and it wins by 0.1 — before, nothing under 0.9 was ever named and the
 * student was left with "try another shape". When even the best is under 0.7 no shape is the
 * answer, and saying so is more use than naming one.
 */
export function fitAdvice(current: Fit | null, ranked: Fit[]): FitAdvice {
  const now = current ? current.r2 : null
  if (now !== null && now >= FIT_CLOSE) return { kind: 'none' }
  // A shape with as many constants as there are readings passes through every point whatever
  // they are (a parabola through any 3), so its perfect r² says nothing and is never offered.
  const tells = (f: Fit): boolean => !f.residuals || !f.coef || f.residuals.length > Object.keys(f.coef).length
  const best = ranked.find((f) => f.shape !== current?.shape && tells(f))
  const top = Math.max(now ?? -Infinity, best?.r2 ?? -Infinity)
  if (top < FIT_FAIR) {
    const closest = ranked.find(tells) ?? current
    return closest ? { kind: 'noShape', best: closest } : { kind: 'none' }
  }
  if (!best) return { kind: 'none' }
  const gain = now === null ? Infinity : best.r2 - now
  const much = gain >= MUCH_BETTER
  if (best.r2 >= FIT_GOOD && gain >= WORTH_IT) return { kind: 'better', best, current: now, much, good: true }
  if (best.r2 >= FIT_FAIR && much && (now === null || now < FIT_GOOD)) return { kind: 'better', best, current: now, much, good: false }
  return { kind: 'none' }
}

/** Another shape to offer over the one in use, or null. */
export function betterFit(current: Fit | null, ranked: Fit[]): Fit | null {
  if (!current) return null
  const advice = fitAdvice(current, ranked)
  return advice.kind === 'better' ? advice.best : null
}

const SHAPE_NAMES: Record<FitShape, string> = {
  linear: 'A straight line',
  quadratic: 'A parabola',
  log: 'A logarithm curve',
  exp: 'An exponential curve',
  power: 'A power curve',
  inverse: 'An inverse curve'
}

/** r² as the advice writes it: two places, half away; a fit worse than a flat line reads 0. */
const r2Text = (r2: number): string => toFixedHalfAway(Math.max(0, r2), 2)

/** The advice in plain English, for the line under the fit. Empty when there is nothing to say. */
export function adviceText(advice: FitAdvice): string {
  if (advice.kind === 'none') return ''
  if (advice.kind === 'noShape') {
    return (
      `No shape fits these readings well (the closest reaches r² ${r2Text(advice.best.r2)}). ` +
      'If they cover more than one bounce or swing, keep only the rows from one bounce and fit those.'
    )
  }
  const name = SHAPE_NAMES[advice.best.shape]
  const score = advice.current === null ? `r² ${r2Text(advice.best.r2)}` : `r² ${r2Text(advice.best.r2)} vs ${r2Text(advice.current)}`
  const verdict = advice.current === null ? `${name} fits these readings: ${score}` : `${name} fits ${advice.much ? 'much ' : ''}better: ${score}`
  return advice.good ? `${verdict}.` : `${verdict} — but not closely, so check the readings for a mistake.`
}

/** What a gradient usually means when these two quantities are plotted against each other. */
export function gradientMeaning(yName: string, xName: string): string | null {
  const y = yName.trim().toLowerCase()
  const x = xName.trim().toLowerCase()
  const is = (n: string, ...names: string[]) => names.includes(n)
  if (is(y, 'd', 's', 'x', 'h', 'distance') && is(x, 't²', 't^2', 'tsq', 't2')) return 'For free fall the gradient is g/2, so g = 2 × gradient.'
  if (is(y, 'd', 's', 'x', 'distance') && is(x, 't', 'time')) return 'Distance against time: the gradient is the speed.'
  if (is(y, 'v', 'velocity', 'speed') && is(x, 't', 'time')) return 'Velocity against time: the gradient is the acceleration.'
  if (is(y, 'f', 'force') && is(x, 'a', 'acceleration')) return 'Force against acceleration: the gradient is the mass (F = ma).'
  if (is(y, 'f', 'force') && is(x, 'x', 'e', 'extension')) return 'Force against extension: the gradient is the spring constant k (F = kx).'
  if (is(y, 'v', 'voltage') && is(x, 'i', 'current')) return 'Voltage against current: the gradient is the resistance (V = IR).'
  if (is(y, 't²', 't^2', 'tsq') && is(x, 'l', 'length')) return 'T² against length: for a pendulum the gradient is 4π²/g, so g = 4π²/gradient.'
  return null
}

/**
 * A measurement and its uncertainty written the way a practical is marked: the uncertainty to one
 * significant figure, and the value rounded to that same decimal place — "4.91 ± 0.06". Writing
 * more digits than the uncertainty supports is the mistake this prevents.
 */
export function pmText(value: number, error: number | undefined): string {
  // Readings that lie exactly on the line leave a standard error of about 1e-16 of the value, which
  // is arithmetic noise rather than a measurement: writing "± 0.0000000000000002" would be nonsense.
  // The cut is a millionth of a millionth of the value, far above that noise and far below any real
  // uncertainty: at 1e-9 a gradient of 1 × 10⁹ ± 0.5 lost its ±.
  // Rounding goes through math/format.ts: the built-ins round the binary double, so 2.675 read 2.67.
  if (error === undefined || !Number.isFinite(error) || error <= 0 || error < Math.abs(value) * 1e-12) {
    return Number.isFinite(value) ? sixFigures(value) : '—'
  }
  const rounded = roundHalfAway(error, 1, 'sf')
  const places = Math.max(0, -Math.floor(Math.log10(rounded)))
  const show = (v: number) => toFixedHalfAway(v, places).replace('-', '−')
  return `${show(value)} ± ${show(rounded)}`
}

/**
 * Six significant figures with the zeros trimmed (3 reads 3, not 3.00000). Outside the range plain
 * digits read well in, a raised power of ten: String() would have written "1.6e-19".
 */
function sixFigures(value: number): string {
  const r = roundHalfAway(value, 6, 'sf')
  const size = Math.abs(r)
  if (size === 0 || (size >= 1e-4 && size < 1e9)) return String(r).replace('-', '−')
  const [m, e] = toExponentialHalfAway(value, 5).split('e')
  return superscriptPowers(`${m.replace(/\.?0+$/, '').replace('-', '−')}×10^${Number(e)}`)
}

export interface GradientRange {
  /** The shallowest line that still passes through every error bar. */
  min: number
  /** The steepest one. */
  max: number
  /** Half the spread between them: the ± a practical quotes. */
  half: number
}

/**
 * The max/min gradient method, which is how a practical is actually marked once error bars are
 * drawn: the steepest line runs from the bottom of the first bar to the top of the last, the
 * shallowest from the top of the first to the bottom of the last, and the gradient's uncertainty is
 * half the difference. It answers the question the error bars ask — how much could this gradient be
 * wrong? — which the scatter of the points alone cannot.
 */
export function gradientRange(xs: number[], ys: number[], xErr: number[], yErr: number[]): GradientRange | null {
  if (xs.length < 2) return null
  // A reading that is not a number cannot be sorted into first and last: it gave { NaN, NaN }.
  if (!xs.every(Number.isFinite) || !ys.every(Number.isFinite)) return null
  const at = (i: number) => ({ x: xs[i], y: ys[i], ex: xErr[i] ?? 0, ey: yErr[i] ?? 0 })
  const order = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b])
  const first = at(order[0])
  const last = at(order[order.length - 1])
  if (![first.ex, first.ey, last.ex, last.ey].every(Number.isFinite)) return null
  if (first.ex === 0 && first.ey === 0 && last.ex === 0 && last.ey === 0) return null

  const shortRun = last.x - last.ex - (first.x + first.ex)
  const longRun = last.x + last.ex - (first.x - first.ex)
  // Bars wide enough to overlap leave no line to draw: the readings are too close together to say
  // anything about the gradient.
  if (shortRun <= 0 || longRun <= 0) return null
  const bigRise = last.y + last.ey - (first.y - first.ey)
  const smallRise = last.y - last.ey - (first.y + first.ey)
  // Every rise over every run, because which pairing is steepest depends on the sign: for a rising
  // line it is the big rise over the short run, but for a falling one the most negative is the
  // small (most negative) rise over the short run. Pairing them for a rising line only gave a
  // falling line a ± a third of the size.
  const slopes = [bigRise / shortRun, bigRise / longRun, smallRise / shortRun, smallRise / longRun]
  const min = Math.min(...slopes)
  const max = Math.max(...slopes)
  return { min, max, half: (max - min) / 2 }
}

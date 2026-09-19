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
  // curve passes through them.
  const r2 = ssTot < 1e-12 ? (ssRes < 1e-12 ? 1 : 0) : 1 - ssRes / ssTot

  const fit: Fit = { shape, label: label ?? shape, expr, coef, r2, predict, residuals }

  if (shape === 'linear') {
    fit.intercept = coef.a
    fit.slope = coef.b
    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length
    const sxx = xs.reduce((a, x) => a + (x - meanX) ** 2, 0)
    // The textbook standard error of a gradient: how much the scatter about the line could have
    // tilted it. Needs at least one degree of freedom left over.
    if (xs.length > 2 && sxx > 1e-12) fit.slopeError = Math.sqrt(ssRes / (xs.length - 2) / sxx)
  }
  return fit
}

/** Every shape that can be fitted, best match first. */
export function rankFits(xs: number[], ys: number[]): Fit[] {
  return FIT_SHAPES.map((s) => fitOf(xs, ys, s))
    .filter((f): f is Fit => f !== null)
    .sort((a, b) => b.r2 - a.r2)
}

/**
 * Whether another shape is worth suggesting over the one in use. A small improvement is not worth
 * pulling a student away from the straight line their practical was designed around, so the other
 * shape has to be clearly better and genuinely good.
 */
export function betterFit(current: Fit | null, ranked: Fit[]): Fit | null {
  if (!current) return null
  const best = ranked.find((f) => f.shape !== current.shape)
  if (!best) return null
  if (best.r2 < 0.9) return null
  if (best.r2 - current.r2 < 0.02) return null
  return best
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
  // Readings that lie exactly on the line leave a standard error of about 1e-16, which is
  // arithmetic noise rather than a measurement: writing "± 0.0000000000000002" would be nonsense.
  if (error === undefined || !Number.isFinite(error) || error <= 0 || error < Math.abs(value) * 1e-9) {
    return Number.isFinite(value) ? String(Number(value.toPrecision(6))).replace('-', '−') : '—'
  }
  const rounded = Number(error.toPrecision(1))
  const places = Math.max(0, -Math.floor(Math.log10(rounded)))
  const show = (v: number) => v.toFixed(places).replace('-', '−')
  return `${show(value)} ± ${show(rounded)}`
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
  const at = (i: number) => ({ x: xs[i], y: ys[i], ex: xErr[i] ?? 0, ey: yErr[i] ?? 0 })
  const order = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b])
  const first = at(order[0])
  const last = at(order[order.length - 1])
  if (first.ex === 0 && first.ey === 0 && last.ex === 0 && last.ey === 0) return null

  const steepRun = last.x - last.ex - (first.x + first.ex)
  const shallowRun = last.x + last.ex - (first.x - first.ex)
  // Bars wide enough to overlap leave no line to draw: the readings are too close together to say
  // anything about the gradient.
  if (steepRun <= 0 || shallowRun <= 0) return null
  const steep = (last.y + last.ey - (first.y - first.ey)) / steepRun
  const shallow = (last.y - last.ey - (first.y + first.ey)) / shallowRun
  const min = Math.min(steep, shallow)
  const max = Math.max(steep, shallow)
  return { min, max, half: (max - min) / 2 }
}

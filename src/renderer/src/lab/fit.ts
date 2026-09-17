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

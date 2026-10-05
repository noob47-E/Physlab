// P16 (Lab Data fix 8): a straight line fitted to curved readings. Before this, a better shape was
// named only once it reached r² 0.9, so a poor-but-better shape was never offered and readings no
// shape could fit (two bounces) got only "try another shape". Also the gradient range for a falling
// line, and the rounding of the numbers the fit text shows.

import { describe, expect, it } from 'vitest'
import { adviceText, fitAdvice, fitOf, gradientRange, pmText, rankFits, type Fit } from '../src/renderer/src/lab/fit'

const range = (from: number, to: number, step: number): number[] => {
  const out: number[] = []
  for (let i = 0; from + i * step <= to + 1e-9; i++) out.push(Number((from + i * step).toFixed(6)))
  return out
}

/** The advice for readings currently drawn with a straight line. */
const adviceFor = (xs: number[], ys: number[]) => fitAdvice(fitOf(xs, ys, 'linear'), rankFits(xs, ys))

describe('naming a better shape for curved readings', () => {
  it('names the parabola, with both r² values, for y = x² drawn as a line', () => {
    const xs = range(-1, 5, 0.5)
    const ys = xs.map((x) => x * x)
    const advice = adviceFor(xs, ys)
    expect(advice.kind).toBe('better')
    if (advice.kind !== 'better') return
    expect(advice.best.shape).toBe('quadratic')
    const line = fitOf(xs, ys, 'linear')!
    const text = adviceText(advice)
    expect(text).toMatch(/^A parabola fits much better: r² 1\.00 vs 0\.\d\d\.$/)
    expect(text).toContain(`vs ${line.r2.toFixed(2)}`)
  })

  it('names the exponential for a decay', () => {
    const xs = range(0, 8, 0.5)
    const ys = xs.map((x) => 10 * Math.exp(-0.6 * x))
    const advice = adviceFor(xs, ys)
    expect(advice.kind).toBe('better')
    if (advice.kind !== 'better') return
    expect(advice.best.shape).toBe('exp')
    expect(adviceText(advice)).toMatch(/^An exponential curve fits (much )?better: r² 1\.00 vs 0\.\d\d\.$/)
  })

  it('says plainly that no shape fits two bounces, and suggests fitting one', () => {
    // Height against time for a ball that bounces twice: two arcs, which none of the six shapes
    // can follow.
    const xs = range(0, 2, 0.05)
    const ys = xs.map((t) => {
      const tau = t % 1
      return 4.9 * tau * (1 - tau)
    })
    const advice = adviceFor(xs, ys)
    expect(advice.kind).toBe('noShape')
    const text = adviceText(advice)
    expect(text).toMatch(/^No shape fits these readings well/)
    expect(text).toContain('one bounce')
  })

  it('names a shape that is better even when it is not good — before, nothing under r² 0.9 was named', () => {
    const current = { shape: 'linear', r2: 0.4 } as Fit
    const best = { shape: 'quadratic', r2: 0.8 } as Fit
    const advice = fitAdvice(current, [best, current])
    expect(advice).toMatchObject({ kind: 'better', good: false })
    expect(adviceText(advice)).toMatch(/^A parabola fits much better: r² 0\.80 vs 0\.40/)
    expect(adviceText(advice)).toContain('not closely')
  })

  it('leaves a good straight line alone', () => {
    const xs = [1, 2, 3, 4, 5, 6]
    const ys = [2.1, 3.9, 6.2, 7.8, 10.1, 11.9]
    expect(adviceFor(xs, ys)).toEqual({ kind: 'none' })
  })

  it('rounds a halfway r² away from zero in the advice', () => {
    // 0.615 is stored a hair under 0.615, so the built-in rounding wrote 0.61.
    const advice = fitAdvice({ shape: 'linear', r2: 0.615 } as Fit, [{ shape: 'exp', r2: 0.995 } as Fit])
    expect(adviceText(advice)).toBe('An exponential curve fits much better: r² 1.00 vs 0.62.')
  })
})

describe('the numbers the fit text shows', () => {
  it('rounds a halfway value and uncertainty away from zero', () => {
    // 2.675 and 0.35 are stored a hair under, so toFixed/toPrecision wrote 2.67 and 0.3.
    expect(pmText(2.675, 0.01)).toBe('2.68 ± 0.01')
    expect(pmText(1.2, 0.35)).toBe('1.2 ± 0.4')
    expect(pmText(-0.004, 0.01)).toBe('0.00 ± 0.01')
  })

  it('writes a value without an uncertainty to six figures, half away, never in e-notation', () => {
    // 1.234565 is stored a hair under, so toPrecision(6) wrote 1.23456.
    expect(pmText(1.234565, undefined)).toBe('1.23457')
    expect(pmText(-2.5, undefined)).toBe('−2.5')
    expect(pmText(1.6e-19, undefined)).toBe('1.6 × 10⁻¹⁹')
  })
})

describe('the gradient range from error bars', () => {
  it('finds the full range for a falling line with sideways bars', () => {
    // The extreme lines through the bars have gradients −11/8 and −9/12; before, the half came out
    // 0.104 because the steep/shallow pairing only suits a rising line.
    const r = gradientRange([0, 5, 10], [10, 5, 0], [1, 1, 1], [0.5, 0.5, 0.5])!
    expect(r.min).toBeCloseTo(-11 / 8, 10)
    expect(r.max).toBeCloseTo(-9 / 12, 10)
    expect(r.half).toBeCloseTo(0.3125, 10)
  })

  it('gives the same range as before for a rising line', () => {
    const r = gradientRange([0, 5, 10], [0, 5, 10], [1, 1, 1], [0.5, 0.5, 0.5])!
    // Steepest: (1, −0.5) to (9, 10.5); shallowest: (−1, 0.5) to (11, 9.5).
    expect(r.max).toBeCloseTo(11 / 8, 10)
    expect(r.min).toBeCloseTo(9 / 12, 10)
    expect(r.half).toBeCloseTo((11 / 8 - 9 / 12) / 2, 10)
  })
})

describe('a shape that must pass through every point proves nothing', () => {
  it('three readings never get "a parabola fits better" (a parabola goes through any 3)', () => {
    const a = adviceFor([1, 2, 3], [1, 4, 9])
    expect(a.kind === 'better' && a.best.shape === 'quadratic').toBe(false)
  })

  it('with four readings on y = x² the parabola is offered', () => {
    const a = adviceFor([1, 2, 3, 4], [1, 4, 9, 16])
    expect(a.kind).toBe('better')
    if (a.kind === 'better') expect(a.best.shape).toBe('quadratic')
  })
})

describe('the "no shape fits" line never quotes a shape that must pass through every point', () => {
  it('x 1,2,3 and y 1,5,1: the closest named is not the parabola with r² 1.00', () => {
    const a = adviceFor([1, 2, 3], [1, 5, 1])
    if (a.kind === 'noShape') expect(a.best.shape).not.toBe('quadratic')
    expect(adviceText(a)).not.toMatch(/1\.00/)
  })
})

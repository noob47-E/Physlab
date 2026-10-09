// FB2 LF-2, LF-3, LF-4, LF-5, LF-7: lab/fit.ts leads from the 2026-10-08 hunt.
import { describe, expect, it } from 'vitest'
import { fitOf, gradientRange, pmText, rankFits } from '../src/renderer/src/lab/fit'

describe('FB2 LF-2: a fit of readings with a NaN is refused', () => {
  it('fitOf returns null when ys holds NaN', () => {
    expect(fitOf([1, 2, 3, 4, 5], [2, 4, NaN, 8, 10], 'linear')).toBeNull()
  })
  it('fitOf returns null when xs holds Infinity', () => {
    expect(fitOf([1, 2, Infinity, 4, 5], [2, 4, 6, 8, 10], 'linear')).toBeNull()
  })
  it('rankFits offers no shape when ys holds NaN', () => {
    expect(rankFits([1, 2, 3, 4, 5], [2, 4, NaN, 8, 10])).toHaveLength(0)
  })
})

describe('FB2 LF-3: a Fit never carries a non-finite r²', () => {
  it('every shape fitOf returns for bad readings has a finite r² or is null', () => {
    for (const shape of ['linear', 'quadratic'] as const) {
      const fit = fitOf([1, 2, 3, 4, 5], [2, 4, NaN, 8, 10], shape)
      if (fit !== null) expect(Number.isFinite(fit.r2)).toBe(true)
    }
  })
})

describe('FB2 LF-4: pmText keeps a real ± on a large value', () => {
  it('1e9 ± 0.5 shows the ±', () => {
    expect(pmText(1e9, 0.5)).toContain('±')
  })
})

describe('FB2 LF-5: the slope error is kept for a tiny x scale (relative rule)', () => {
  it('x around 1e-7 with real scatter still gets a slope error', () => {
    const fit = fitOf([1e-7, 2e-7, 3e-7, 4e-7, 5e-7], [2, 4, 6.1, 8, 9.9], 'linear')
    expect(fit).not.toBeNull()
    expect(fit!.slopeError).toBeDefined()
    expect(Number.isFinite(fit!.slopeError!)).toBe(true)
  })
  it('the same readings with x scaled by 10⁷ give the same relative slope error', () => {
    const tiny = fitOf([1e-7, 2e-7, 3e-7, 4e-7, 5e-7], [2, 4, 6.1, 8, 9.9], 'linear')!
    const plain = fitOf([1, 2, 3, 4, 5], [2, 4, 6.1, 8, 9.9], 'linear')!
    expect(tiny.slopeError! / tiny.slope!).toBeCloseTo(plain.slopeError! / plain.slope!, 9)
  })
})

describe('FB2 LF-4/5 (Opus checker): readings exactly on a line far from zero show no ±', () => {
  it('x = 10000.1…10000.5, y = 3.3x − 7 and x = 100000.1…, y = 1.7x + 2', () => {
    const xs = [10000.1, 10000.2, 10000.3, 10000.4, 10000.5]
    const a = fitOf(xs, xs.map((x) => 3.3 * x - 7), 'linear')!
    expect(a.slopeError).toBe(0)
    expect(pmText(a.slope!, a.slopeError)).not.toContain('±')
    const xb = [100000.1, 100000.2, 100000.3, 100000.4, 100000.5]
    const b = fitOf(xb, xb.map((x) => 1.7 * x + 2), 'linear')!
    expect(pmText(b.slope!, b.slopeError)).not.toContain('±')
  })
})

describe('FB2 LF-7: gradientRange refuses NaN readings', () => {
  it('returns null when xs holds NaN', () => {
    expect(gradientRange([NaN, 1, 5], [0, 2, 10], [0.1, 0.1, 0.1], [0.5, 0.5, 0.5])).toBeNull()
  })
})

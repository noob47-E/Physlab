import { describe, expect, it } from 'vitest'
import {
  binomialPd,
  countSigFigs,
  dimensionsOf,
  evaluateBaseN,
  evaluateComp,
  exactForm,
  formatBase,
  integrate,
  inverseNormal,
  normalCdf,
  polyInequality,
  polyRoots,
  propagate,
  solveLinearSystem,
  statistics
} from '../src/renderer/src/calc/engine'

const ctx = { vars: {}, ans: 0, angle: 'deg' as const }

describe('COMP mode', () => {
  it('evaluates calculator-style input', () => {
    expect(Number(evaluateComp('sin(30)', ctx).value)).toBeCloseTo(0.5)
    expect(Number(evaluateComp('2×3÷4', ctx).value)).toBeCloseTo(1.5)
    expect(Number(evaluateComp('√(16)+3²', ctx).value)).toBeCloseTo(13)
    expect(Number(evaluateComp('nCr(5,2)', ctx).value)).toBe(10)
    expect(Number(evaluateComp('30°30\'', ctx).value)).toBeCloseTo(30.5)
    expect(Number(evaluateComp('ddx(x^3, 2)', ctx).value)).toBeCloseTo(12, 6)
    expect(Number(evaluateComp('integral(x^2, 0, 3)', ctx).value)).toBeCloseTo(9, 8)
    expect(Number(evaluateComp('sigma(x, 1, 100)', ctx).value)).toBe(5050)
    expect(Number(evaluateComp('Ans + 1', { ...ctx, ans: 41 }).value)).toBe(42)
  })
  it('solves equations and converts polar/rectangular', () => {
    expect(Number(evaluateComp('x^2 = 2', { ...ctx, vars: { x: 1 } }).value)).toBeCloseTo(Math.SQRT2)
    const pol = evaluateComp('Pol(3, 4)', ctx)
    expect(pol.text).toBe('r = 5')
    expect(pol.extra?.[0]).toContain('53.13')
  })
})

describe('exact forms', () => {
  it('recognises fractions, surds and π', () => {
    expect(exactForm(0.75)).toBe('\\frac{3}{4}')
    expect(exactForm(Math.SQRT2 / 2)).toBe('\\frac{\\sqrt{2}}{2}')
    expect(exactForm(Math.PI / 3)).toBe('\\frac{\\pi}{3}')
    expect(exactForm(2 * Math.sqrt(3))).toBe('2\\sqrt{3}')
  })
})

describe('equations', () => {
  it('finds polynomial roots including complex ones', () => {
    const r = polyRoots([1, -5, 6])
    expect(r.map((z) => z.re)).toEqual([2, 3].map((v) => expect.closeTo(v, 9) as unknown as number))
    const c = polyRoots([1, 0, 1])
    expect(Math.abs(c[0].im)).toBeCloseTo(1)
  })
  it('solves simultaneous equations', () => {
    const x = solveLinearSystem([[2, 1], [1, -1]], [7, 2])
    expect(x[0]).toBeCloseTo(3)
    expect(x[1]).toBeCloseTo(1)
  })
  it('solves inequalities', () => {
    const iv = polyInequality([1, -5, 6], '<')
    expect(iv).toHaveLength(1)
    expect(iv[0].from).toBeCloseTo(2)
    expect(iv[0].to).toBeCloseTo(3)
  })
})

describe('stats, distributions, base-n', () => {
  it('fits a line', () => {
    const s = statistics([1, 2, 3, 4], [3, 5, 7, 9], null, 'linear')
    expect(s.coef?.a).toBeCloseTo(1)
    expect(s.coef?.b).toBeCloseTo(2)
    expect(s.r).toBeCloseTo(1)
  })
  it('computes distributions', () => {
    expect(normalCdf(-1, 1)).toBeCloseTo(0.682689, 5)
    expect(inverseNormal(0.975)).toBeCloseTo(1.959964, 5)
    expect(binomialPd(2, 4, 0.5)).toBeCloseTo(0.375)
    expect(integrate((x) => Math.sin(x), 0, Math.PI)).toBeCloseTo(2, 9)
  })
  it('does BASE-N logic', () => {
    expect(evaluateBaseN('FF + 1', 16)).toBe(256)
    expect(formatBase(evaluateBaseN('1010 and 0110', 2), 2)).toBe('0010')
    expect(formatBase(-1, 16)).toBe('FFFFFFFF')
  })
})

describe('chapter 1 measurements', () => {
  it('counts significant figures', () => {
    expect(countSigFigs('0.00450').count).toBe(3)
    expect(countSigFigs('1200').count).toBe(2)
    expect(countSigFigs('1200.').count).toBe(4)
    expect(countSigFigs('3.20×10^4').count).toBe(3)
  })
  it('propagates uncertainties and finds dimensions', () => {
    const r = propagate('×', { value: 2, unc: 0.1 }, { value: 3, unc: 0.3 })
    expect(r.value).toBe(6)
    expect(r.unc).toBeCloseTo(0.9)
    expect(dimensionsOf('N')).toBe('[M L T^-2]')
  })
})

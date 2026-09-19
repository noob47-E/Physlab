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
import { parseAnswer } from '../src/renderer/src/math/checkAnswer'
import { fmt } from '../src/renderer/src/math/format'
import { math, preprocess } from '../src/renderer/src/math/expr'

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
    // An argument with its own comma must not split in the wrong place.
    expect(evaluateComp('Pol(max(1,3), 4)', ctx).text).toBe('r = 5')
    expect(evaluateComp('Pol(3*cos(0), 4)', ctx).text).toBe('r = 5')
    expect(Number(evaluateComp('Rec(√(4), 60)', ctx).value)).toBeCloseTo(1)
    expect(Number(evaluateComp('Rec(max(1,2), 60)', ctx).value)).toBeCloseTo(1)
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

describe('the × key means what is on either side of it', () => {
  it('multiplies numbers', () => {
    expect(parseAnswer('2 × 3')).toBe(6)
    expect(parseAnswer('2.5 × 10^3')).toBe(2500)
  })

  it('reads back the scientific notation PhysLab itself prints', () => {
    // fmt() writes small and large numbers as "1.234×10^-5"; rewriting every × to a cross
    // product meant the app could not read its own output.
    for (const v of [0.00001234, 1.5e10, -2.5e-7]) {
      expect(parseAnswer(fmt(v, 4))).toBeCloseTo(v, 12)
    }
  })

  it('still takes a cross product between vectors', () => {
    const r = math.evaluate(preprocess('<1, 0, 0> × <0, 1, 0>')) as number[]
    expect([r[0], r[1], r[2]]).toEqual([0, 0, 1])
  })
})

describe('calculus follows the angle mode, like the real calculator', () => {
  const deg = { vars: {}, ans: 0, angle: 'deg' as const }
  const rad = { vars: {}, ans: 0, angle: 'rad' as const }

  it('differentiates in degrees when the calculator is in DEG', () => {
    // d/dx sin(x°) = cos(x°) × π/180 — what an fx-991EX shows in DEG mode.
    expect(Number(evaluateComp('ddx(sin(x), 30)', deg).value)).toBeCloseTo((Math.cos(Math.PI / 6) * Math.PI) / 180, 6)
    expect(Number(evaluateComp('integral(sin(x), 0, 90)', deg).value)).toBeCloseTo(180 / Math.PI, 4)
  })

  it('is unchanged in RAD', () => {
    expect(Number(evaluateComp('ddx(sin(x), 30)', rad).value)).toBeCloseTo(Math.cos(30), 6)
    expect(Number(evaluateComp('integral(sin(x), 0, pi)', rad).value)).toBeCloseTo(2, 6)
  })

  it('leaves plain algebra alone in either mode', () => {
    expect(Number(evaluateComp('ddx(x^3, 2)', deg).value)).toBeCloseTo(12, 6)
    expect(Number(evaluateComp('integral(x^2, 0, 3)', rad).value)).toBeCloseTo(9, 8)
  })
})

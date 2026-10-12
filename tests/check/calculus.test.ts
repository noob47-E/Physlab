// G2: derivativeCheck, integralCheck, partialFractionsCheck, expressionEqual and numericEqual. Numbers alone never say
// 'equal' (docs/knowledge/engine-semantics.md §6): a transcendental answer that agrees everywhere sampled is 'unknown'.

import { describe, expect, it } from 'vitest'
import {
  derivativeCheck,
  expressionEqual,
  integralCheck,
  numericEqual,
  partialFractionsCheck
} from '../../src/renderer/src/math/check/checkers'
import { int, seeded } from './gen'

type V = 'equal' | 'different' | 'unknown'

describe('derivativeCheck', () => {
  const cases: [string, string, V][] = [
    ['x^3', '3x^2', 'equal'],
    ['x^2+3x', '2x+3', 'equal'],
    ['1/x', '-1/x^2', 'equal'],
    ['(x+1)/(x-1)', '-2/(x-1)^2', 'equal'],
    // G2B: the claimed answer may have no hole the derivative has not, and the checker cannot prove that |x| has no
    // derivative at 0 (x·|x| has one), so these are unknown, not equal; never different.
    ['|x|', '|x|/x', 'unknown'],
    ['sqrt(x^2)', 'x/|x|', 'unknown'],
    ['ln(x)', '1/x', 'equal'],
    ['x^5/5 - x', 'x^4 - 1', 'equal'],
    ['(2x+1)^3', '6(2x+1)^2', 'equal'],
    ['1e-19 x^2', '2e-19 x', 'equal'],
    ['6e24 x', '6e24', 'equal'],
    ['x^-2', '-2x^-3', 'equal'],
    ['x^3', '3x', 'different'],
    ['x^2+3x', '2x', 'different'],
    ['1/x', '1/x^2', 'different'],
    ['sin(x)', '-cos(x)', 'different'],
    ['ln(x)', '1/(x ln(10))', 'different'],
    ['log(x)', '1/x', 'different'],
    ['tan(x)', 'sec(x)', 'different'],
    ['e^(2x)', 'e^(2x)', 'different'],
    ['1e-19 x^2', '2e-18 x', 'different'],
    ['|x|', 'x/x', 'different'],
    // G2B: sin, cos, e^x and ln are atoms now (atoms.ts), so these are proved; what needs sin² + cos² = 1 or a double
    // angle (sec² x, sin 2x) is still unknown.
    ['sin(x)', 'cos(x)', 'equal'],
    ['log(x)', '1/(x*ln(10))', 'equal'],
    ['e^x', 'e^x', 'equal'],
    ['tan(x)', 'sec(x)^2', 'unknown'],
    ['tan(x)', '1+tan(x)^2', 'equal'],
    ['sin(x)^2', '2 sin(x) cos(x)', 'equal'],
    ['sin(x)^2', 'sin(2x)', 'unknown'],
    ['x sin(x)', 'sin(x) + x cos(x)', 'equal'],
    ['x sin(x)', 'x cos(x)', 'different']
  ]
  it.each(cases)('d/dx %s = %s is %s', (f, d, v) => expect(derivativeCheck(f, 'x', d)).toBe(v))
  it('seeded: polynomial derivatives exactly; a changed coefficient is different (40 cases)', () => {
    const rand = seeded(23)
    for (let k = 0; k < 40; k++) {
      const cs = Array.from({ length: int(rand, 2, 5) }, () => int(rand, -9, 9))
      const f = cs.map((c, i) => `${c}*x^${i}`).join(' + ')
      const d = cs.slice(1).map((c, i) => `${c * (i + 1)}*x^${i}`).join(' + ') || '0'
      expect(derivativeCheck(f, 'x', d), f).toBe('equal')
      expect(derivativeCheck(f, 'x', `${d} + 1`), f).toBe('different')
    }
  })
})

describe('integralCheck: F′ = f, a constant of integration allowed', () => {
  const cases: [string, string, V][] = [
    ['x^2', 'x^3/3', 'equal'],
    ['x^2', 'x^3/3 + 5', 'equal'],
    ['1/x^2', '-1/x', 'equal'],
    ['1/x', 'ln(|x|)', 'equal'],
    ['2x/(x^2+1)^2', '-1/(x^2+1)', 'equal'],
    ['3x^2+2x+1', 'x^3+x^2+x-7', 'equal'],
    ['2x', 'x^2+x', 'different'],
    ['cos(x)', '-sin(x)', 'different'],
    ['1/x', 'ln(x^2)', 'different'],
    ['x', 'x^2', 'different'],
    ['cos(x)', 'sin(x)', 'equal'],
    ['e^x', 'e^x + 1', 'equal'],
    ['sin(2x)', 'sin(x)^2', 'unknown']
  ]
  it.each(cases)('∫ %s dx = %s is %s', (f, F, v) => expect(integralCheck(f, 'x', F)).toBe(v))
  it('seeded: polynomial antiderivatives; a wrong power is different (40 cases)', () => {
    const rand = seeded(29)
    for (let k = 0; k < 40; k++) {
      const n = int(rand, 0, 6)
      const c = int(rand, 1, 9)
      expect(integralCheck(`${c}*x^${n}`, 'x', `${c}*x^${n + 1}/${n + 1} + ${int(rand, -5, 5)}`), `${c}x^${n}`).toBe('equal')
      expect(integralCheck(`${c}*x^${n}`, 'x', `${c}*x^${n + 1}/${n + 2}`), `${c}x^${n}`).toBe('different')
    }
  })
})

describe('partialFractionsCheck: adds back up, and every term is in standard form', () => {
  const cases: [string, string, V][] = [
    ['1/(x(x+1))', '1/x - 1/(x+1)', 'equal'],
    ['(3x+5)/((x+1)(x+2))', '2/(x+1)+1/(x+2)', 'equal'],
    ['1/(x^2-1)', '(1/2)/(x-1) - (1/2)/(x+1)', 'equal'],
    ['x/((x+1)^2)', '1/(x+1) - 1/(x+1)^2', 'equal'],
    ['1/(x(x^2+1))', '1/x - x/(x^2+1)', 'equal'],
    ['(x^2+1)/(x-1)', 'x+1+2/(x-1)', 'equal'],
    ['(2x+3)/(x^2+3x+2)', '1/(x+1) + 1/(x+2)', 'equal'],
    ['5/((x-1)(x+4))', '1/(x-1) - 1/(x+4)', 'equal'],
    ['1/((x-1)^2(x+1))', '(1/4)/(x+1) - (1/4)/(x-1) + (1/2)/(x-1)^2', 'equal'],
    ['(x+2)/(x^3-x)', '-2/x + (3/2)/(x-1) + (1/2)/(x+1)', 'equal'],
    ['1/(x(x+1))', '1/x - 1/(x+2)', 'different'],
    ['1/(x^2-1)', '1/(x^2-1)', 'different'],
    ['x/((x+1)^2)', 'x/(x+1)^2', 'different'],
    ['(3x+5)/((x+1)(x+2))', '2/(x+1)+2/(x+2)', 'different'],
    ['1/(x(x^2+1))', '1/x - 1/(x^2+1)', 'different'],
    ['(x^2+1)/(x-1)', 'x+2/(x-1)', 'different'],
    ['1/(x^4+1)', '1/(x^4+1)', 'unknown']
  ]
  it.each(cases)('%s = %s is %s', (o, d, v) => expect(partialFractionsCheck(o, d)).toBe(v))
  it('seeded: A/(x − a) + B/(x − b) against its sum; a changed B is different (40 cases)', () => {
    const rand = seeded(31)
    for (let k = 0; k < 40; k++) {
      const a = int(rand, -6, 6)
      let b = int(rand, -6, 6)
      if (b === a) b = a + 1
      const A = int(rand, 1, 9)
      const B = int(rand, 1, 9)
      const original = `(${A}*(x - ${b}) + ${B}*(x - ${a}))/((x - ${a})*(x - ${b}))`
      expect(partialFractionsCheck(original, `${A}/(x - ${a}) + ${B}/(x - ${b})`), original).toBe('equal')
      expect(partialFractionsCheck(original, `${A}/(x - ${a}) + ${B + 1}/(x - ${b})`), original).toBe('different')
    }
  })
})

describe('expressionEqual and numericEqual: exact where it can be, numbers may only show a difference', () => {
  const cases: [string, string, V][] = [
    ['sqrt(x^2)', '|x|', 'equal'],
    ['sqrt(x^2)', 'x', 'different'],
    ['ln(x^2)', '2 ln(x)', 'different'],
    ['(-8)^(1/3)', '-2', 'equal'],
    ['(-8)^(2/3)', '4', 'equal'],
    ['(-4)^(1/2)', '2', 'different'],
    ['|x - 1|', '|1 - x|', 'equal'],
    ['|x|^2', 'x^2', 'equal'],
    ['sqrt((x-1)^2)', 'x - 1', 'different'],
    ['sqrt(x^4)', 'x^2', 'equal'],
    ['cbrt(x^3)', 'x', 'equal'],
    // Real odd roots (G00): (∛x)³ = x for every x.
    ['(x^(1/3))^3', 'x', 'equal'],
    ['x^(1/3)^3', 'x', 'different'],
    ['|x|/x', '1', 'different'],
    ['sin(x)^2 + cos(x)^2', '1', 'unknown'],
    ['sin(x)^2 + cos(x)^2', '1.0000001', 'different'],
    ['e^(ln(x))', 'x', 'different'],
    ['ln(e^x)', 'x', 'unknown'],
    ['tan(x)', 'sin(x)/cos(x)', 'equal'],
    ['sqrt(x)^2', '|x|', 'different']
  ]
  it.each(cases)('%s vs %s is %s', (a, b, v) => expect(expressionEqual(a, b)).toBe(v))

  it('numericEqual never says equal, and counts the points that agreed', () => {
    const r = numericEqual('sin(x)^2 + cos(x)^2', '1')
    expect(r.verdict).toBe('unknown')
    expect(r.agreed).toBeGreaterThanOrEqual(15)
  })
  it('a domain difference is a difference: log(x²) vs 2·log(x) at x = −1', () => {
    const r = numericEqual('log(x^2)', '2 log(x)')
    expect(r.verdict).toBe('different')
    expect(r.witness).toMatch(/not defined/)
  })
  it('a removable point is not a difference: x(x − 1)/(x − 1) vs x is unknown by numbers, with 1 noted', () => {
    const r = numericEqual('x(x-1)/(x-1)', 'x')
    expect(r.verdict).toBe('unknown')
    expect(r.excludedAt).toContain(1)
  })
  it('round-off is not a difference: (x + 10⁻⁶)² − x² − 2·10⁻⁶x vs 10⁻¹²', () => {
    expect(numericEqual('(x + 1e-6)^2 - x^2 - 2e-6 x', '1e-12').verdict).toBe('unknown')
  })
  it('extreme coefficients keep their size: 10⁻¹⁹x vs 10⁻¹⁸x, 6·10²⁴x vs 6·10²⁴x + 1', () => {
    expect(numericEqual('1e-19 x', '1e-18 x').verdict).toBe('different')
    expect(numericEqual('6e24 x', '6e24 x + 1').verdict).toBe('different')
  })
  it('two letters', () => {
    expect(numericEqual('sin(x + y)', 'sin(x)cos(y) + cos(x)sin(y)', ['x', 'y']).verdict).toBe('unknown')
    expect(numericEqual('sin(x + y)', 'sin(x) + sin(y)', ['x', 'y']).verdict).toBe('different')
  })
  it('seeded: 40 identities stay unknown with ≥ 15 agreeing points; 40 near-miss forms are different', () => {
    const rand = seeded(37)
    const forms: ((a: number, b: number) => [string, string, string])[] = [
      (a, b) => [`sin(${a}x)cos(${b}x)`, `(sin(${a + b}x) + sin(${a - b}x))/2`, `(sin(${a + b}x) - sin(${a - b}x))/2`],
      (a) => [`e^(${a}x) * e^(-x)`, `e^(${a - 1}x)`, `e^(${a}x - x + 1e-9)`],
      (a, b) => [`ln(${a}) + ln(${b})`, `ln(${a * b})`, `ln(${a * b + 1})`],
      (a) => [`cos(${a}x)^2`, `(1 + cos(${2 * a}x))/2`, `(1 + cos(${2 * a}x))/2.0000000001`],
      (a, b) => [`sqrt(x^2 + ${a * a})`, `sqrt(${a * a} + x^2)`, `sqrt(x^2 + ${a * a + b})`]
    ]
    for (let k = 0; k < 40; k++) {
      const a = int(rand, 2, 6)
      const b = int(rand, 1, a - 1)
      const [f, same, near] = forms[k % forms.length](a, b)
      const r = numericEqual(f, same)
      expect(r.verdict, `${f} vs ${same}`).toBe('unknown')
      expect(r.agreed, `${f} vs ${same}`).toBeGreaterThanOrEqual(15)
      expect(numericEqual(f, near).verdict, `${f} vs ${near}`).toBe('different')
    }
  })
  it('an unknown function is unknown, not a crash', () => {
    expect(numericEqual('gamma(x)', 'x').verdict).toBe('unknown')
  })
})

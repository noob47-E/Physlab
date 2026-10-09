// FB2 PS-9: an expression part's sampled check took any value under an absolute 10⁻¹² as zero, so
// "0" was marked RIGHT for a real answer of 10⁻¹⁴·x (an electron-sized constant times x). The noise
// floor must be relative (AGENTS.md: "The marking noise floor is relative, never absolute").
import { describe, expect, it } from 'vitest'
import { checkExpressionPart } from '../src/renderer/src/questions/parts'
import type { PQPart } from '../src/renderer/src/questions/pqjson'

type ExpressionPart = Extract<PQPart, { type: 'expression' }>

const part = (answer: string): ExpressionPart => ({ type: 'expression', prompt: 'y =', answer, symbols: ['x'], marks: 1 })

describe('FB2 PS-9: a wrong 0 is never marked right for a tiny answer', () => {
  it('"0" is wrong when the answer is 1e-14 * x', () => {
    expect(checkExpressionPart('0', part('1e-14 * x'), {}).verdict).toBe('wrong')
  })

  it('"0" is wrong when the answer is 1.6e-19 * x (a charge-sized constant)', () => {
    expect(checkExpressionPart('0', part('1.6e-19 * x'), {}).verdict).toBe('wrong')
  })

  it('"0" is wrong when the tiny size comes from a question variable', () => {
    expect(checkExpressionPart('0', part('q * x'), { q: 1.6e-19 }).verdict).toBe('wrong')
  })

  it('the right tiny answer is still right', () => {
    expect(checkExpressionPart('1.6e-19 * x', part('1.6e-19 * x'), {}).verdict).toBe('right')
    expect(checkExpressionPart('2 * 0.8e-19 * x', part('1.6e-19 * x'), {}).verdict).toBe('right')
  })

  it('an identity that cancels to floating noise still marks right against 0', () => {
    expect(checkExpressionPart('sin(x)^2 + cos(x)^2 - 1', part('0'), {}).verdict).toBe('right')
    expect(checkExpressionPart('0', part('sin(x)^2 + cos(x)^2 - 1'), {}).verdict).toBe('right')
  })

  // Opus re-check: a trig value that is 0 only up to rounding (cos 90°, sin π) is noise next to the
  // 1 a sine or cosine can reach, and a power of a cancelled sum is noise too.
  it('a zero that comes from cos 90°, sin π or a power of an identity marks right against 0', () => {
    const zeros: [string, Record<string, number>][] = [
      ['F*x*cos(t)', { F: 50, t: Math.PI / 2 }],
      ['x*sin(t)', { t: Math.PI }],
      ['x*cos(90 deg)', {}],
      ['x*sin(180 deg)', {}],
      ['ln(sin(x)^2+cos(x)^2)', {}],
      ['(sin(x)^2+cos(x)^2-1)^2', {}]
    ]
    for (const [zero, values] of zeros) {
      expect.soft(checkExpressionPart('0', part(zero), values).verdict, `0 for ${zero}`).toBe('right')
      expect.soft(checkExpressionPart(zero, part('0'), values).verdict, `${zero} for 0`).toBe('right')
    }
  })

  // Opus re-check: a typed side that cancels to exactly 0 ("x - x") lent its own terms' size to the
  // noise floor of the real answer, and was marked right where "0" is wrong.
  it('"x - x" or "1e20*x - 1e20*x" is as wrong as "0" for a tiny answer', () => {
    for (const typed of ['x - x', '1-1', 'x*(1-1)', '1e20*x-1e20*x']) {
      expect.soft(checkExpressionPart(typed, part('1.6e-19 * x'), {}).verdict, typed).toBe('wrong')
      expect.soft(checkExpressionPart(typed, part('q * x'), { q: 1.6e-19 }).verdict, `${typed} for q·x`).toBe('wrong')
    }
  })

  it('tiny real answers built with powers, roots and exponentials are still wrong against 0', () => {
    for (const tiny of ['1e-20*x^2', '(1e-8*x)^2', 'sqrt(1e-30*x)', 'exp(-50)*x', '6.63e-34*x', '1e-18/x']) {
      expect.soft(checkExpressionPart('0', part(tiny), {}).verdict, `0 for ${tiny}`).toBe('wrong')
    }
  })

  // Opus checker: an identity cancelling INSIDE a product or quotient left one "term" of noise size,
  // and a right 0 was marked wrong. The scale is carried through × and ÷.
  it('an identity that cancels inside a product or quotient still marks right against 0', () => {
    for (const zero of ['x*(sin(x)^2+cos(x)^2-1)', 'cos(x)*(tan(x)*cos(x) - sin(x))', '3*((x+1)^2 - x^2 - 2*x - 1)', '(sin(x)^2+cos(x)^2-1)*10', '(sin(x)^2+cos(x)^2-1)/x', 'x*(ln(exp(x)) - x)']) {
      expect.soft(checkExpressionPart('0', part(zero), {}).verdict, `0 for ${zero}`).toBe('right')
      expect.soft(checkExpressionPart(zero, part('0'), {}).verdict, `${zero} for 0`).toBe('right')
    }
  })
})

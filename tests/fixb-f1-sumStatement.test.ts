// F1 diagnostic (runs red on today's code, green after the fix in the findings note).
//
// The bug: on the Maths screen, typing with the keypad Σ for n = 1 to 5 of n² = 55 answers
// "x = 2 / L − R = 0" with no true mark. The sum's index letter is rewritten to x in linear form
// (latexToMath), so isEquationInX treats the line as "solve for x"; the residual is identically 0
// (the sum is a constant), so the numeric search returns its own starting guess — the stored x —
// as if it were a root. Expected: the statement is checked and marked true.
//
// Run with: npx vitest run --config _findings/vitest.findings.config.ts _findings/tests/f1-sumStatement.test.ts

import { beforeEach, describe, expect, it } from 'vitest'
import { evaluateInput } from '../src/renderer/src/calc/evaluateInput'
import { latexToMath } from '../src/renderer/src/math/latexToMath'
import { hasFreeX } from '../src/renderer/src/calc/engine'
import { resetGlobals } from './helpers/globals'

beforeEach(resetGlobals)

const opts = (x: number) => ({ vars: { x }, ans: 0, angle: 'deg' as const })

describe('F1: a sum with = is a statement to check, not an equation to solve', () => {
  it('the keypad form of Σ n² from 1 to 5 = 55 is marked true', () => {
    const latex = '\\sum_{n=1}^{5}n^{2}=55'
    expect(latexToMath(latex)).toBe('sigma(x^(2), 1, 5)=55')
    const r = evaluateInput('COMP', latex, opts(2))!
    expect(r.error).toBeUndefined()
    expect(r.main).toBe('true')
    expect(r.extra).toEqual(['L − R = 0'])
    // Nothing numeric to keep: Ans and the stored x stay what they were.
    expect(r.value).toBeUndefined()
    expect(r.solved).toBe(false)
  })

  it('the linear form of the same line is marked true too', () => {
    const r = evaluateInput('COMP', 'sigma(x^2,1,5)=55', opts(2))!
    expect(r.error).toBeUndefined()
    expect(r.main).toBe('true')
  })

  it('solving and refusals around it are untouched', () => {
    // A statement that does not hold is marked false, with how far apart the sides are — not "give x a value".
    const f = evaluateInput('COMP', '\\sum_{x=1}^{3}x=5', opts(0))!
    expect(f.main).toBe('false')
    expect(f.extra).toEqual(['L − R = 1'])
    expect(f.solved).toBe(false)
    // An x outside the sum is still solved for.
    expect(evaluateInput('COMP', 'x+sigma(x,1,100)=5100', opts(0))!.main).toBe('x = 50')
    // A constant statement with no x at all keeps its sentence.
    expect(evaluateInput('COMP', '5=5', opts(0))!.error?.sentence).toBe('Equations are solved in Numbers mode: type both sides with = and press x = ?')
  })

  it('an x in the limits of a sum or an integral is the line\'s own x, still solved for (wave-head review)', () => {
    expect(hasFreeX('sigma(x^2, 1, 5)')).toBe(false)
    expect(hasFreeX('sigma(x^2, 1, x)')).toBe(true)
    expect(hasFreeX('integrate(t, t, 0, x)')).toBe(true)
    expect(hasFreeX('integrate(x, x, 0, 2)')).toBe(false)
    expect(hasFreeX('integral(x^2, 0, x)')).toBe(true)
  })

  it('"holds" is relative to the size of the sides: a large true sum is still marked true (wave-head review)', () => {
    // 1² + … + 100000² = 333338333350000; the float sum carries rounding far above 10⁻¹⁴.
    const r = evaluateInput('COMP', 'sigma(x^2,1,100000)=333338333350000', opts(2))!
    expect(r.main).toBe('true')
    // Wrong by one part in a billion is wrong.
    expect(evaluateInput('COMP', 'sigma(x^2,1,100000)=333338333000000', opts(2))!.main).not.toBe('true')
    expect(evaluateInput('COMP', 'sigma(1/x^2,1,100000)=1.6449240668982262', opts(2))!.main).toBe('true')
  })
})

describe('F1 review: no absolute floor on "holds"', () => {
  it('tiny sides are compared by their own size', () => {
    expect(evaluateInput('COMP', 'integral(1.6e-19*x,0,1)=1e-19', opts(0))!.main).toBe('false') // 8×10⁻²⁰ ≠ 10⁻¹⁹
    expect(evaluateInput('COMP', 'sigma(1e-20*x,1,3)=5e-20', opts(0))!.main).toBe('false') // 6×10⁻²⁰ ≠ 5×10⁻²⁰
    expect(evaluateInput('COMP', 'sigma(1e-20*x,1,3)=6e-20', opts(0))!.main).toBe('true')
    expect(evaluateInput('COMP', 'sigma(0*x,1,3)=0', opts(0))!.main).toBe('true') // both exactly 0
  })
})

// P-FIX-PURE checker follow-ups for U14 and U15, built on the worker's own recorded replies.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { derivativeWorking, integralWorking, type DerivTree, type IntegralTree } from '../src/renderer/src/math/engine/sympy/calculusSteps'

const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(`${__dirname}/fixtures/calculus/${name}.json`, 'utf8')).result as T

describe('U14 follow-up: an integral whose value depends on a letter never says the function breaks', () => {
  it('a value still holding an integral says it depends on the letters, not that the function breaks', () => {
    const tree = fixture<IntegralTree>('integral-definite')
    tree.definite = {
      ...tree.definite!,
      value: {
        latex: String.raw`\begin{cases} \frac{1}{n - 1} & \text{for}\: n > 1 \\ \int\limits_{1}^{\infty} x^{- n}\, dx & \text{otherwise} \end{cases}`,
        text: 'Piecewise((1/(n - 1), n > 1), (Integral(x**(-n), (x, 1, oo)), True))'
      },
      numeric: null,
      F_lower: undefined,
      F_upper: undefined,
      agrees: false,
      infinite: false
    }
    const w = integralWorking(tree, 'x^2, 1, Infinity')
    const heads = w.moves.map((m) => m.head).join(' | ')
    expect(heads).not.toMatch(/breaks between the limits/)
    expect(heads).toMatch(/depends on the letters/)
    expect(w.answers.length).toBeGreaterThan(0)
  })

  it('a Greek letter (θ, λ spelt lamda) or a subscripted letter counts as a letter too', () => {
    for (const text of [
      'Piecewise((1/(theta - 1), Abs(theta) > 1), (Integral(x**(-theta), (x, 1, oo)), True))',
      'Piecewise((1/lamda, Abs(arg(lamda)) < pi/2), (Integral(exp(-lamda*x), (x, 0, oo)), True))',
      'Piecewise((1/(n_0 - 1), n_0 > 1), (Integral(x**(-n_0), (x, 1, oo)), True))'
    ]) {
      const tree = fixture<IntegralTree>('integral-definite')
      tree.definite = {
        ...tree.definite!,
        value: { latex: String.raw`\begin{cases} 1 & \text{for}\: 1 \\ \int\limits_{1}^{\infty} 1\, dx & \text{otherwise} \end{cases}`, text },
        numeric: null,
        F_lower: undefined,
        F_upper: undefined,
        agrees: false,
        infinite: false
      }
      const heads = integralWorking(tree, 'x^2, 1, Infinity').moves.map((m) => m.head).join(' | ')
      expect(heads, text).toMatch(/depends on the letters/)
    }
  })

  it('an unworked integral with no other letter (like ∫₀¹ xˣ dx) does not blame letters', () => {
    const tree = fixture<IntegralTree>('integral-definite')
    tree.definite = {
      ...tree.definite!,
      value: { latex: String.raw`\int\limits_{0}^{2} x^{x}\, dx`, text: 'Integral(x**x, (x, 0, 2))' },
      numeric: { re: 2.8338 },
      F_lower: undefined,
      F_upper: undefined,
      agrees: false,
      infinite: false
    }
    const w = integralWorking(tree, 'x^2, 0, 2')
    expect(w.moves.map((m) => m.head).join(' | ')).not.toMatch(/depends on the letters/)
    expect(w.answers.length).toBeGreaterThan(0)
  })

  it('a real break between the limits still says so', () => {
    const tree = fixture<IntegralTree>('integral-definite')
    tree.definite = { ...tree.definite!, F_lower: undefined, F_upper: undefined, agrees: false, infinite: false }
    const w = integralWorking(tree, 'x^2, 0, 2')
    expect(w.moves.map((m) => m.head).join(' | ')).toMatch(/breaks between the limits/)
  })
})

describe('U15 follow-up: the chain-rule and sum chips never use the variable', () => {
  it('differentiating by y: the chain chip is not dy/dy', () => {
    const tree = fixture<DerivTree>('derivative-chain')
    tree.var = 'y'
    const rules = derivativeWorking(tree, 'sin(3y^2)').moves.map((m) => m.rule ?? '')
    expect(rules.some((r) => r.includes('\\frac{dy}{dy}'))).toBe(false)
    expect(rules.some((r) => r.includes('\\frac{dw}{dy}'))).toBe(true)
  })

  it('differentiating by f: the sum chip names p and q, not f and g', () => {
    const tree = fixture<DerivTree>('derivative-polynomial')
    tree.var = 'f'
    const rules = derivativeWorking(tree, 'f').moves.map((m) => m.rule ?? '').join(' | ')
    expect(rules).not.toMatch(/\(f \+ g\)/)
    expect(rules).not.toMatch(/\(p \+ g\)/)
    expect(rules).toMatch(/\(p \+ q\)/)
  })
})

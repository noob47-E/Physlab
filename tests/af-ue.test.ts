import { describe, expect, it } from 'vitest'
import {
  derivativeWorking,
  integralWorking,
  type DerivTree,
  type IntegralTree
} from '../src/renderer/src/math/engine/sympy/calculusSteps'
import { casRequestFor } from './helpers/sympyRequests'

describe('U12: complex sums inside product/quotient are explained before the product line', () => {
  it('explains a chain inside a sum factor before naming the factors', () => {
    const tree: DerivTree = {
      var: 'x',
      expr: { latex: String.raw`x\left(x + \sin{\left(x^{2}\right)}\right)`, text: 'x*(x + sin(x^2))' },
      u: 'u',
      deg_ignored: false,
      unsupported: false,
      answer_latex: String.raw`2 x^{2} \cos{\left(x^{2}\right)} + 2 x + \sin{\left(x^{2}\right)}`,
      answer_text: '2*x**2*cos(x**2) + 2*x + sin(x**2)',
      checked: true,
      tree: {
        rule: 'product',
        expr: { latex: String.raw`x\left(x + \sin{\left(x^{2}\right)}\right)`, text: 'x*(x + sin(x^2))' },
        result: {
          latex: String.raw`2 x^{2} \cos{\left(x^{2}\right)} + 2 x + \sin{\left(x^{2}\right)}`,
          text: '2*x**2*cos(x**2) + 2*x + sin(x**2)'
        },
        substeps: [
          { rule: 'x', expr: { latex: 'x', text: 'x' }, result: { latex: '1', text: '1' } },
          {
            rule: 'sum',
            expr: { latex: String.raw`x + \sin{\left(x^{2}\right)}`, text: 'x + sin(x^2)' },
            result: { latex: String.raw`1 + 2 x \cos{\left(x^{2}\right)}`, text: '1 + 2*x*cos(x^2)' },
            shown: { latex: String.raw`1 + 2 x \cos{\left(x^{2}\right)}`, text: '1 + 2*x*cos(x^2)' },
            substeps: [
              { rule: 'x', expr: { latex: 'x', text: 'x' }, result: { latex: '1', text: '1' } },
              {
                rule: 'chain',
                expr: { latex: String.raw`\sin{\left(x^{2}\right)}`, text: 'sin(x^2)' },
                result: { latex: String.raw`2 x \cos{\left(x^{2}\right)}`, text: '2*x*cos(x^2)' },
                outer: 'sin',
                u: { latex: 'x^{2}', text: 'x^2' },
                letter: 'u',
                outer_expr: { latex: String.raw`\sin{u}`, text: 'sin(u)' },
                outer_derivative: { latex: String.raw`\cos{u}`, text: 'cos(u)' },
                outer_at_inner: { latex: String.raw`\cos{\left(x^{2}\right)}`, text: 'cos(x^2)' },
                substeps: [{ rule: 'power', expr: { latex: 'x^{2}', text: 'x^2' }, result: { latex: '2 x', text: '2*x' } }]
              }
            ]
          }
        ]
      }
    }

    const w = derivativeWorking(tree, 'x*(x + sin(x^2))')
    const heads = w.moves.map((m) => m.head)
    const inside = heads.indexOf('Called the inside u and differentiated the outside with respect to u.')
    const named = heads.indexOf('Named the two factors f and g and differentiated each.')

    expect(inside).toBeGreaterThanOrEqual(0)
    expect(named).toBeGreaterThanOrEqual(0)
    expect(inside).toBeLessThan(named)
  })
})

describe('U13: nested product/quotient rules get their own letters', () => {
  it('uses f/g for the inner product and u/v for the outer one', () => {
    const tree: DerivTree = {
      var: 'x',
      expr: { latex: String.raw`x \sin{x} e^{x}`, text: 'x*sin(x)*e^x' },
      u: 'u',
      deg_ignored: false,
      unsupported: false,
      answer_latex: String.raw`e^{x} \sin{x} + x e^{x} \sin{x} + x e^{x} \cos{x}`,
      answer_text: 'e^x*sin(x) + x*e^x*sin(x) + x*e^x*cos(x)',
      checked: true,
      tree: {
        rule: 'product',
        expr: { latex: String.raw`x \sin{x} e^{x}`, text: 'x*sin(x)*e^x' },
        result: {
          latex: String.raw`e^{x} \sin{x} + x e^{x} \sin{x} + x e^{x} \cos{x}`,
          text: 'e^x*sin(x) + x*e^x*sin(x) + x*e^x*cos(x)'
        },
        substeps: [
          { rule: 'x', expr: { latex: 'x', text: 'x' }, result: { latex: '1', text: '1' } },
          {
            rule: 'product',
            expr: { latex: String.raw`\sin{x} e^{x}`, text: 'sin(x)*e^x' },
            result: { latex: String.raw`e^{x} \cos{x} + e^{x} \sin{x}`, text: 'e^x*cos(x) + e^x*sin(x)' },
            substeps: [
              { rule: 'sin', expr: { latex: String.raw`\sin{x}`, text: 'sin(x)' }, result: { latex: String.raw`\cos{x}`, text: 'cos(x)' } },
              { rule: 'exp', expr: { latex: 'e^{x}', text: 'e^x' }, result: { latex: 'e^{x}', text: 'e^x' } }
            ]
          }
        ]
      }
    }

    const w = derivativeWorking(tree, 'x*sin(x)*e^x')

    expect(w.moves.some((m) => m.head === 'Named the two factors f and g and differentiated each.')).toBe(true)
    expect(w.moves.some((m) => m.head === 'Named the two factors u and v and differentiated each.')).toBe(true)
  })
})

describe('U14: a definite integral whose exact value is an unevaluated piecewise never has no answer', () => {
  it('gives a plain sentence answer instead of an empty answer card', () => {
    const tree: IntegralTree = {
      var: 'x',
      integrand: { latex: 'e^{- k x}', text: 'e^(-k*x)' },
      unsupported: true,
      closed: true,
      raw_latex: '',
      raw_text: '',
      answer_latex: String.raw`\frac{1}{k}`,
      answer_text: '1/k',
      checked: false,
      deg_ignored: false,
      definite: {
        lower: { latex: '0', text: '0' },
        upper: { latex: String.raw`\infty`, text: 'oo' },
        value: { latex: String.raw`\int_{0}^{\infty} e^{- k x}\, dx`, text: 'Integral(exp(-k*x), (x, 0, oo))' },
        numeric: null,
        agrees: false
      }
    }

    const w = integralWorking(tree, 'e^(-k*x), 0, Infinity')

    expect(w.error).toBeUndefined()
    expect(w.answers).toHaveLength(1)
    expect(w.answers[0].tex).toContain('depends on the symbols')
  })
})

describe('U15: rule chips never use the variable as their fixed constant', () => {
  it('differentiating n^3 by n uses k for the power in the chip', () => {
    const tree: DerivTree = {
      var: 'n',
      expr: { latex: 'n^{3}', text: 'n^3' },
      u: 'u',
      deg_ignored: false,
      unsupported: false,
      answer_latex: '3 n^{2}',
      answer_text: '3*n^2',
      checked: true,
      tree: { rule: 'power', expr: { latex: 'n^{3}', text: 'n^3' }, result: { latex: '3 n^{2}', text: '3*n^2' } }
    }

    const w = derivativeWorking(tree, 'n^3')

    expect(w.error).toBeUndefined()
    expect(w.moves[0].rule).not.toMatch(/n\^\{n\}/)
    expect(w.moves[0].rule).toMatch(/n\^\{k\}/)
  })

  it('integrating n^2 by n uses k for the power in the chip', () => {
    const tree: IntegralTree = {
      var: 'n',
      integrand: { latex: 'n^{2}', text: 'n^2' },
      unsupported: false,
      closed: true,
      raw_latex: String.raw`\frac{n^{3}}{3}`,
      raw_text: 'n^3/3',
      answer_latex: String.raw`\frac{n^{3}}{3}`,
      answer_text: 'n^3/3',
      checked: true,
      deg_ignored: false,
      tree: {
        rule: 'PowerRule',
        integrand: { latex: 'n^{2}', text: 'n^2' },
        variable: { latex: 'n', text: 'n' },
        result: { latex: String.raw`\frac{n^{3}}{3}`, text: 'n^3/3' }
      }
    }

    const w = integralWorking(tree, 'n^2')

    expect(w.error).toBeUndefined()
    expect(w.moves[0].rule).not.toMatch(/n\^\{n\}/)
    expect(w.moves[0].rule).toMatch(/n\^\{k\}/)
  })
})

describe('U16: a typed ∞ limit reaches the worker as infinity, not as the letters of Infinity', () => {
  it('Integrate e^(-x), 0, ∞ (the field writes Infinity) sends oo as the upper limit', () => {
    const req = casRequestFor('integrate', 'e^(-x), 0, Infinity', false)!
    expect(req.payload).toEqual({ expr: 'e^(-x)', var: 'x', deg: false, lower: '0', upper: 'oo' })
  })

  it('a minus infinity lower limit, a named letter, and a typed ∞ all work', () => {
    expect(casRequestFor('integrate', 'e^(-k*x), x, -Infinity, 0', false)!.payload).toMatchObject({ lower: '-oo', upper: '0' })
    expect(casRequestFor('integrate', '1/x^2, 1, ∞', false)!.payload).toMatchObject({ lower: '1', upper: 'oo' })
  })

  it('infinity inside the expression is sent as oo too, and the letter is still x', () => {
    expect(casRequestFor('differentiate', 'x e^(-Infinity)', false)!.payload).toMatchObject({ expr: 'x e^(-oo)', var: 'x' })
  })
})

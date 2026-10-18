// Part S1: Step engine working in the Calculator.
//
// Shows the math/steps working in the Calculator for the problems it covers,
// through renderWorkingToDoc into WorkingView, keeping today's working wherever math/steps has no method.
// Every step is validated before it is shown (validate.ts), never an unchecked step.

import { beforeEach, describe, expect, it } from 'vitest'
import { usePure } from '../src/renderer/src/math/pure/store'
import { reconcile } from '../src/renderer/src/calc/working'
import { evaluateInput, type EvalResult } from '../src/renderer/src/calc/evaluateInput'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  usePure.setState({ working: null, input: '', inputLatex: '', history: [] })
})

describe('S1: math/steps in the Calculator', () => {
  it('solves a linear equation with verified steps and method name', () => {
    usePure.getState().runLatex('2x + 4 = 10', 'auto')
    const w = usePure.getState().working
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.noWorking).toBeFalsy()
    expect(w?.method).toBe('Linear equation in one variable')
    expect(w?.answers).toEqual([{ label: 'x', tex: '3' }])
    expect(w?.moves.length).toBeGreaterThanOrEqual(2)
    // Check that sentences and rules come from the step framework
    expect(w?.moves[0].head).toBe('Subtract 4 from both sides')
    expect(w?.moves[0].rule).toBe('Subtract from both sides')
    expect(w?.check).toContain('Put x = 3 back: both sides give 10.')
    expect(w?.checked).toBe('ok')

    // Reconcile with the Calculator's "=" answer
    const card: EvalResult = evaluateInput('COMP', '2x + 4 = 10', { vars: {}, ans: 0, angle: 'deg' })!
    expect(card).toBeDefined()
    const r = reconcile(card, w)
    expect(r.verdict).toBe('agree')
  })

  it('solves a quadratic by factorising with completing the square as Another way', () => {
    usePure.getState().runLatex('x^2 - 5x + 6 = 0', 'auto')
    const w = usePure.getState().working
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.method).toBe('Factorising')
    expect(w?.answers).toEqual([
      { label: 'x', tex: '2' },
      { label: 'x', tex: '3' }
    ])
    // Another way is quadratic formula
    expect(w?.anotherWay).toBeDefined()
    expect(w?.anotherWay?.method).toBe('Quadratic formula')
    expect(w?.checked).toBe('ok')

    // Reconcile with Calculator "="
    const card: EvalResult = evaluateInput('COMP', 'x^2 - 5x + 6 = 0', { vars: {}, ans: 0, angle: 'deg' })!
    const r = reconcile(card, w)
    expect(r.verdict).toBe('agree')
  })

  it('solves a 2x2 linear system with elimination and substitution as Another way', () => {
    usePure.getState().runLatex('x + y = 3, 2x - y = 0', 'auto')
    const w = usePure.getState().working
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.method).toBe('Solve by elimination')
    expect(w?.anotherWay).toBeDefined()
    expect(w?.anotherWay?.method).toBe('Solve by substitution')
    expect(w?.answers).toEqual([
      { label: 'x', tex: '1' },
      { label: 'y', tex: '2' }
    ])
    expect(w?.checked).toBe('ok')
  })

  it('expands a product of brackets with checked ExprEq steps', () => {
    usePure.getState().run('expand', '(2x + 3)(3x - 1)')
    const w = usePure.getState().working
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.method).toBe('Expand')
    expect(w?.answers[0].tex).toBe('6x^2 + 7x - 3')
  })

  it('factorises a polynomial with checked product steps', () => {
    usePure.getState().run('factor', '6x^2 + 7x - 3')
    const w = usePure.getState().working
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.method).toBe('Factorise')
  })

  it('keeps today working wherever math/steps has no method', () => {
    // Primes: whole number has no method in math/steps
    usePure.getState().runLatex('360', 'auto')
    const primes = usePure.getState().working
    expect(primes).not.toBeNull()
    expect(primes?.title).toContain('360')
    expect(primes?.answers[0].tex).toContain('2^{3}')

    // Surd arithmetic: Simplify surds has no method in math/steps yet
    usePure.getState().runLatex('2/3 + \\sqrt{2}', 'auto')
    const surd = usePure.getState().working
    expect(surd).not.toBeNull()
    expect(surd?.title).toBe('Simplify surds')

    // Complex division: has no method in math/steps yet
    usePure.getState().runLatex('\\frac{3+4i}{1-2i}', 'auto')
    const complex = usePure.getState().working
    expect(complex).not.toBeNull()
    expect(complex?.title).toBe('Complex number')
  })
})

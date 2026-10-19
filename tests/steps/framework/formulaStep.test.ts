// The quadratic formula as checked steps (Phase 0.9 K): the formula line with its numbers put in, the roots after it,
// and the exact surd fallback that proves a formula's roots at the end of a working.
//
// Each wrong line must be refused. A line the checker cannot read at all is unknown, and a readable line with a wrong
// number is invalid; neither is ever shown.

import { describe, expect, it } from 'vitest'
import { validateImplication, validateStep, validateWorking, answersHoldExactly } from '../../../src/renderer/src/math/steps/validate'
import { finishStep } from '../../../src/renderer/src/math/steps/sentences'
import { createStepRouter } from '../../../src/renderer/src/math/steps/router'
import { S1A_METHODS } from '../../../src/renderer/src/math/steps/methods'
import { quadraticFormulaMethod } from '../../../src/renderer/src/math/steps/methods/quadraticFormula'
import type { Step, Working } from '../../../src/renderer/src/math/steps/types'

/** The formula step from an equation to its formula line, built the way the method builds it. */
function formulaStep(before: string, after: string): Step {
  return finishStep({ kind: 'Implication', before, after, sentence: '', data: { action: 'quadratic-formula' } })
}

/** The roots step after a formula line, built the way the method builds it. */
function rootsStep(before: string, after: string, solutions: Array<{ value: string; multiplicity?: number }>, domain = 'real'): Step {
  return finishStep({
    kind: 'SolutionSetEq',
    before,
    after,
    sentence: '',
    data: { variable: 'x', solutions: solutions.map((s) => ({ multiplicity: 1, ...s })), domain }
  })
}

describe('the formula line is checked against the equation it comes from', () => {
  it('a correct formula line is valid (x^2 - 5x + 6 = 0 with a = 1, b = -5, c = 6)', () => {
    expect(validateStep(formulaStep('x^2 - 5x + 6 = 0', 'x = \\frac{5 \\pm \\sqrt{1}}{2}')).verdict).toBe('valid')
  })

  it('a wrong sign of b is invalid', () => {
    expect(validateStep(formulaStep('x^2 - 5x + 6 = 0', 'x = \\frac{-5 \\pm \\sqrt{1}}{2}')).verdict).toBe('invalid')
  })

  it('a wrong 2a is invalid', () => {
    expect(validateStep(formulaStep('x^2 - 5x + 6 = 0', 'x = \\frac{5 \\pm \\sqrt{1}}{4}')).verdict).toBe('invalid')
  })

  it('a wrong discriminant is invalid', () => {
    expect(validateStep(formulaStep('x^2 - 5x + 6 = 0', 'x = \\frac{5 \\pm \\sqrt{4}}{2}')).verdict).toBe('invalid')
  })

  it('the same roots written with other numbers are still refused: the line must be the formula with a, b and c put in', () => {
    expect(validateStep(formulaStep('x^2 - 5x + 6 = 0', 'x = \\frac{10 \\pm \\sqrt{4}}{4}')).verdict).toBe('invalid')
  })

  it('a line that is not a formula line is unknown, never valid', () => {
    expect(validateImplication(formulaStep('x^2 - 5x + 6 = 0', '2x^2 - 10x + 12 = 0'))).not.toBe('valid')
    expect(validateStep(formulaStep('x^2 - 5x + 6 = 0', 'x = 2 \\text{ or } x = 3')).verdict).not.toBe('valid')
  })

  it('an equation that is not a quadratic with whole coefficients is unknown, never valid', () => {
    expect(validateStep(formulaStep('x + 1 = 0', 'x = \\frac{-1 \\pm \\sqrt{0}}{2}')).verdict).not.toBe('valid')
    expect(validateStep(formulaStep('0.5x^2 - x = 0', 'x = \\frac{1 \\pm \\sqrt{1}}{1}')).verdict).not.toBe('valid')
  })

  it('surd roots are checked exactly: -2 ± √8 over 2 is -1 ± √2 for x^2 + 2x - 1 = 0', () => {
    expect(validateStep(formulaStep('x^2 + 2x - 1 = 0', 'x = \\frac{-2 \\pm \\sqrt{8}}{2}')).verdict).toBe('valid')
    expect(validateStep(formulaStep('x^2 + 2x - 1 = 0', 'x = \\frac{-2 \\pm \\sqrt{12}}{2}')).verdict).toBe('invalid')
  })

  it('a negative discriminant gives the complex pair, checked exactly', () => {
    expect(validateStep(formulaStep('x^2 + x + 1 = 0', 'x = \\frac{-1 \\pm \\sqrt{-3}}{2}')).verdict).toBe('valid')
    expect(validateStep(formulaStep('x^2 + x + 1 = 0', 'x = \\frac{-1 \\pm \\sqrt{3}}{2}')).verdict).toBe('invalid')
  })
})

describe('the roots after a formula line are exactly the formula’s roots', () => {
  const line = 'x = \\frac{5 \\pm \\sqrt{1}}{2}'

  it('the exact roots 2 and 3, displayed in order, are valid', () => {
    const step = rootsStep(line, 'x = 2 \\text{ or } x = 3', [{ value: '2' }, { value: '3' }])
    expect(validateStep(step).verdict).toBe('valid')
  })

  it('a wrong root is invalid', () => {
    const step = rootsStep(line, 'x = 2 \\text{ or } x = 4', [{ value: '2' }, { value: '4' }])
    expect(validateStep(step).verdict).toBe('invalid')
  })

  it('the right roots displayed in another order are invalid', () => {
    const step = rootsStep(line, 'x = 3 \\text{ or } x = 2', [{ value: '2' }, { value: '3' }])
    expect(validateStep(step).verdict).toBe('invalid')
  })
})

describe('the exact surd fallback at the end of a working', () => {
  const working = (input: string, answers: Array<{ tex: string; value: string }>): Working => ({
    steps: [formulaStep(input, 'x = \\frac{-2 \\pm \\sqrt{8}}{2}')],
    input,
    answer: answers.map((a) => ({ label: 'x', ...a }))
  })

  it('surd answers that are roots of the problem as typed hold', () => {
    const w = working('x^2 + 2x - 1 = 0', [
      { tex: '-1-\\sqrt{2}', value: '-1 - sqrt(2)' },
      { tex: '-1+\\sqrt{2}', value: '-1 + sqrt(2)' }
    ])
    expect(answersHoldExactly(w)).toBe(true)
  })

  it('a surd answer that is not a root of the problem does not hold', () => {
    const w = working('x^2 + 2x - 1 = 0', [
      { tex: '-1-\\sqrt{3}', value: '-1 - sqrt(3)' },
      { tex: '-1+\\sqrt{2}', value: '-1 + sqrt(2)' }
    ])
    expect(answersHoldExactly(w)).toBe(false)
  })

  it('an answer the reader cannot read is not proved', () => {
    const w = working('x^2 + 2x - 1 = 0', [{ tex: 'x', value: 'banana' }])
    expect(answersHoldExactly(w)).toBe(false)
  })
})

describe('the quadratic formula method builds the checked steps', () => {
  const method = quadraticFormulaMethod
  const router = createStepRouter(S1A_METHODS)

  it('x^2 - 5x + 6 = 0: the discriminant as a sub-working, then the formula line, then the roots; the whole working is valid', () => {
    const w = method.solve({ job: 'solve', input: 'x^2 - 5x + 6 = 0', variable: 'x' }, router)
    expect(w.steps.map((s) => s.kind)).toEqual(['Implication', 'SolutionSetEq'])
    expect(w.subWorkings?.[0].steps[0].data).toMatchObject({ role: 'discriminant' })
    expect(validateWorking(w).valid).toBe(true)
  })

  it('x^2 + x + 1 = 0 (real): no formula line at all, only the conclusion; the working is valid', () => {
    const w = method.solve({ job: 'solve', input: 'x^2 + x + 1 = 0', variable: 'x' }, router)
    expect(w.steps.map((s) => s.kind)).toEqual(['SolutionSetEq'])
    expect(validateWorking(w).valid).toBe(true)
  })
})

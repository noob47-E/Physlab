// Tests for the exactness rules after the Gemini review of a982a6a4 (S0 framework):
// 1. chain comparison of large numbers is exact (no 64-bit rounding);
// 2. the answer (label and value) must equal what the validated last step displays, in every
//    sub-working and the Another way too;
// 3. a working with no steps is unknown (hidden) unless it is the explicit "can't show" fallback;
// plus: a failed check hides the working, and displayedValues splits only on the \text{or} token.

import { describe, it, expect } from 'vitest'
import { validateWorking, validateSolutionSetEq } from '../../../src/renderer/src/math/steps/validate'
import { renderWorkingToDoc } from '../../../src/renderer/src/math/steps/render'
import { createStepRouter, CANT_SHOW_STEPS_REASON } from '../../../src/renderer/src/math/steps/router'
import { displayedValues, sameState } from '../../../src/renderer/src/math/steps/check-adapter'
import { finishStep } from '../../../src/renderer/src/math/steps/sentences'
import type { EquationOp, Method, Step, Working } from '../../../src/renderer/src/math/steps/types'

/** An EquationEquiv with the declared op; its sentence and rule are the builder's. */
const eq = (before: string, after: string, op: EquationOp = { kind: 'already-solved' }, v = 'x'): Step =>
  finishStep({ kind: 'EquationEquiv', op, before, after, sentence: '', data: { variable: v } })

describe('MUST 1: the chain compares numbers exactly (no 64-bit rounding)', () => {
  it('two different 21-digit integers are different states, so the first step does not start from the input', () => {
    expect(sameState('x = 100000000000000000001', 'x = 100000000000000000002')).toBe(false)
    const w: Working = {
      title: 't',
      input: 'x = 100000000000000000001',
      steps: [eq('x = 100000000000000000002', 'x = 100000000000000000002')]
    }
    const res = validateWorking(w)
    expect(res.valid).toBe(false)
    expect(res.failedStepIndex).toBe(0)
  })

  it('a mid-chain step that starts from a different 21-digit integer is rejected at that step', () => {
    const w: Working = {
      title: 't',
      input: 'x = 1',
      steps: [
        eq('x = 1', 'x = 100000000000000000001', { kind: 'subtract-both', term: '0' }),
        eq('x = 100000000000000000002', 'x = 100000000000000000003')
      ]
    }
    const res = validateWorking(w)
    expect(res.valid).toBe(false)
    expect(res.failedStepIndex).toBe(1)
  })

  it('two decimals that differ in the 17th digit are different states, at the start and mid-chain', () => {
    expect(sameState('x = 0.12345678901234567', 'x = 0.12345678901234568')).toBe(false)
    const start: Working = {
      title: 't',
      input: 'x = 0.12345678901234567',
      steps: [eq('x = 0.12345678901234568', 'x = 0.12345678901234568')]
    }
    expect(validateWorking(start).valid).toBe(false)
    const mid: Working = {
      title: 't',
      input: 'x = 0.5',
      steps: [
        eq('x = 0.5', 'x = 0.12345678901234567', { kind: 'subtract-both', term: '0' }),
        eq('x = 0.12345678901234568', 'x = 0.12345678901234568')
      ]
    }
    const res = validateWorking(mid)
    expect(res.valid).toBe(false)
    expect(res.failedStepIndex).toBe(1)
  })

  it('a 21-digit literal is read exactly: the same text is the same state, a last-digit change is not', () => {
    expect(sameState('x = 100000000000000000001', 'x = 100000000000000000001')).toBe(true)
    expect(sameState('x = 100000000000000000001', 'x = 100000000000000000002')).toBe(false)
  })

  it('fifteen significant digits still chain, and two different ones are still different', () => {
    expect(sameState('x = 123456789012345', 'x = 123456789012345')).toBe(true)
    expect(sameState('x = 123456789012345', 'x = 123456789012346')).toBe(false)
    const w: Working = {
      title: 't',
      input: 'x = 123456789012345',
      steps: [eq('x = 123456789012345', 'x = 123456789012345')]
    }
    expect(validateWorking(w).valid).toBe(true)
  })
})

describe('MUST 2: the answer equals what the validated last step displays (label and value)', () => {
  const steps: Step[] = [
    eq('3y + 1 = 7', '3y = 6', { kind: 'subtract-both', term: '1' }, 'y'),
    eq('3y = 6', 'y = 2', { kind: 'divide-both', k: '3' }, 'y')
  ]
  const good = (): Working => ({
    title: 'Solve 3y + 1 = 7',
    input: '3y + 1 = 7',
    steps: JSON.parse(JSON.stringify(steps)),
    answer: { label: 'y', tex: '2', value: '2' }
  })

  it('a correct answer with the problem variable is valid and shown', () => {
    const w = good()
    expect(validateWorking(w).valid).toBe(true)
    expect(renderWorkingToDoc(w).answers).toEqual([{ label: 'y', tex: '2' }])
  })

  it('a wrong label (x where the problem says y) is invalid, and hidden in the rendered output', () => {
    const w = { ...good(), answer: { label: 'x', tex: '2', value: '2' } }
    expect(validateWorking(w).valid).toBe(false)
    const doc = renderWorkingToDoc(w)
    expect(doc.noWorking).toBe(true)
    expect(doc.moves).toHaveLength(0)
    expect(doc.answers).toHaveLength(0)
  })

  it('a wrong value is invalid, and hidden in the rendered output', () => {
    const w = { ...good(), answer: { label: 'y', tex: '3' } }
    expect(validateWorking(w).valid).toBe(false)
    const doc = renderWorkingToDoc(w)
    expect(doc.noWorking).toBe(true)
    expect(doc.answers).toHaveLength(0)
  })

  it('a value field that disagrees with the displayed tex is invalid', () => {
    const w = { ...good(), answer: { label: 'y', tex: '2', value: '3' } }
    expect(validateWorking(w).valid).toBe(false)
  })

  it('a wrong answer in a sub-working is invalid, and hidden in the rendered output', () => {
    const sub: Working = {
      title: 'Case',
      input: 'y - 2 = 0',
      steps: [eq('y - 2 = 0', 'y = 2', { kind: 'add-both', term: '2' }, 'y')],
      answer: { label: 'y', tex: '4' }
    }
    const w: Working = {
      title: 't',
      input: '3y + 1 = 7',
      steps: [eq('3y + 1 = 7', '3y = 6', { kind: 'subtract-both', term: '1' }, 'y')],
      subWorkings: [sub],
      answer: { label: 'y', tex: '2' }
    }
    expect(validateWorking(w).valid).toBe(false)
    const doc = renderWorkingToDoc(w)
    expect(doc.noWorking).toBe(true)
    expect(doc.moves).toHaveLength(0)
    expect(doc.answers).toHaveLength(0)
  })

  it('a wrong answer on the Another way is invalid', () => {
    const w: Working = { ...good(), anotherWay: { ...good(), answer: { label: 'y', tex: '5' } } }
    expect(validateWorking(w).valid).toBe(false)
  })

  it('the answers of a zero-product split are checked against the displayed roots', () => {
    const w: Working = {
      title: 't',
      input: 'y^2 - 5y + 6 = 0',
      steps: [
        eq('y^2 - 5y + 6 = 0', '(y - 2)(y - 3) = 0', { kind: 'factorise' }, 'y'),
        finishStep({
          kind: 'CaseSplitComplete',
          before: '(y - 2)(y - 3) = 0',
          after: 'y = 2 \\text{ or } y = 3',
          sentence: '',
          data: { form: 'zero-product', c: '1', cases: ['y - 2 = 0', 'y - 3 = 0'], variable: 'y' }
        })
      ],
      answer: [
        { label: 'y', tex: '2' },
        { label: 'y', tex: '4' }
      ]
    }
    expect(validateWorking(w).valid).toBe(false)
    w.answer = [
      { label: 'y', tex: '2' },
      { label: 'y', tex: '3' }
    ]
    expect(validateWorking(w).valid).toBe(true)
  })

  it('a solution-set ending: the answer must be exactly the displayed line', () => {
    const w = (tex: string): Working => ({
      title: 't',
      input: 'x^2 + 4 = 0',
      steps: [
        finishStep({
          kind: 'SolutionSetEq',
          before: 'x^2 + 4 = 0',
          after: '\\text{No real solution}',
          sentence: '',
          data: { variable: 'x', solutions: [] }
        })
      ],
      answer: { label: 'x', tex }
    })
    expect(validateWorking(w('\\text{No real solution}')).valid).toBe(true)
    expect(validateWorking(w('\\text{No real solutions}')).valid).toBe(false)
  })

  it('an identity ending is a SolutionSetEq that holds only for 0 = 0 (all real numbers)', () => {
    const ok = validateSolutionSetEq(
      finishStep({
        kind: 'SolutionSetEq',
        before: '0 = 0',
        after: '\\text{every real number}',
        sentence: '',
        data: { variable: 'x', solutions: [], allReals: true }
      })
    )
    expect(ok).toBe('valid')
    const notIdentity = validateSolutionSetEq(
      finishStep({
        kind: 'SolutionSetEq',
        before: 'x = 0',
        after: '\\text{every real number}',
        sentence: '',
        data: { variable: 'x', solutions: [], allReals: true }
      })
    )
    expect(notIdentity).not.toBe('valid')
  })
})

describe('MUST 3: a working with no steps is unknown unless it is the explicit can\'t-show fallback', () => {
  it('a working with no steps and no fallback reason is unknown and hidden', () => {
    const w: Working = { title: 't', input: 'x = 2', steps: [] }
    const res = validateWorking(w)
    expect(res.valid).toBe(false)
    expect(res.verdict).toBe('unknown')
    const doc = renderWorkingToDoc(w)
    expect(doc.noWorking).toBe(true)
    expect(doc.moves).toHaveLength(0)
  })

  it('a no-step working carrying an answer is hidden, and its answer is not shown either', () => {
    const w: Working = { title: 't', input: 'x = 2', steps: [], answer: { label: 'x', tex: '2' } }
    expect(validateWorking(w).valid).toBe(false)
    const doc = renderWorkingToDoc(w)
    expect(doc.moves).toHaveLength(0)
    expect(doc.answers).toHaveLength(0)
  })

  it('the explicit fallback (noWorking with the can\'t-show reason, no steps) is allowed', () => {
    const w: Working = { title: 't', input: 'x = 2', steps: [], noWorking: true, reason: CANT_SHOW_STEPS_REASON }
    expect(validateWorking(w).valid).toBe(true)
    const doc = renderWorkingToDoc(w)
    expect(doc.noWorking).toBe(true)
    expect(doc.reason).toBe(CANT_SHOW_STEPS_REASON)
  })

  it('the router never shows a method that returns no steps', () => {
    const empty: Method = {
      id: 'mock.empty',
      name: 'Empty',
      appliesTo: () => true,
      solve: () => ({ title: 't', input: 'x = 2', steps: [], answer: { label: 'x', tex: '2' } })
    }
    const w = createStepRouter([empty]).solve({ job: 'solve', input: 'x = 2' })
    expect(w.noWorking).toBe(true)
    expect(w.steps).toHaveLength(0)
    expect(w.answer).toBeUndefined()
  })
})

describe('the check status is part of the check (SHOULD)', () => {
  it('a working whose check failed is invalid and hidden, even when its steps and answer agree', () => {
    const w: Working = {
      title: 't',
      input: '3y + 1 = 7',
      steps: [
        eq('3y + 1 = 7', '3y = 6', { kind: 'subtract-both', term: '1' }, 'y'),
        eq('3y = 6', 'y = 2', { kind: 'divide-both', k: '3' }, 'y')
      ],
      answer: { label: 'y', tex: '2' },
      checked: 'failed'
    }
    expect(validateWorking(w).valid).toBe(false)
    expect(renderWorkingToDoc(w).moves).toHaveLength(0)
  })
})

describe('displayedValues splits only on the \\text{or} token, never on letters inside a name (SHOULD)', () => {
  it('a variable named r: the LaTeX and the plain separators both split on the word or, not on the letters', () => {
    expect(displayedValues('r = 2 \\text{ or } r = 3', 'r')).toEqual(['2', '3'])
    expect(displayedValues('r = 2 or r = 3', 'r')).toEqual(['2', '3'])
    expect(displayedValues('r in {2, 3}', 'r')).toEqual(['2', '3'])
  })

  it('a variable named θ', () => {
    expect(displayedValues('θ = 2 \\text{ or } θ = 3', 'θ')).toEqual(['2', '3'])
    expect(displayedValues('θ = -\\frac{1}{2} \\text{ or } θ = \\frac{2}{3}', 'θ')).toEqual(['-1/2', '2/3'])
  })

  it('a variable whose name contains the letters o and r', () => {
    expect(displayedValues('o = 2 \\text{ or } o = 3', 'o')).toEqual(['2', '3'])
    expect(displayedValues('or = 2 \\text{ or } or = 3', 'or')).toEqual(['2', '3'])
  })
})

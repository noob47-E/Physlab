// Tests for the soundness rules of P-FIX-S0SOUND (S0 framework):
// chains, declared EquationEquiv operations, displayed results of splits, the zero-product split,
// recursion into sub-workings and the Another way, and the router's fallback to the next method.

import { describe, it, expect } from 'vitest'
import {
  validateEquationEquiv,
  validateCaseSplitComplete,
  validateSubproblemReduction,
  validateWorking,
  validateStep
} from '../../../src/renderer/src/math/steps/validate'
import { createStepRouter } from '../../../src/renderer/src/math/steps/router'
import { finishStep } from '../../../src/renderer/src/math/steps/sentences'
import type { EquationOp, Method, Step, Working } from '../../../src/renderer/src/math/steps/types'

/** An EquationEquiv with the declared op; its sentence and rule are the builder's, never typed here. */
const eq = (before: string, after: string, op: EquationOp | undefined, v = 'x'): Step =>
  finishStep({ kind: 'EquationEquiv', op, before, after, sentence: '', data: { variable: v } })

describe('chains: the first step starts from the input, and each step starts where the last one ended', () => {
  const steps: Step[] = [
    eq('2*x + 3 = 11', '2*x = 8', { kind: 'subtract-both', term: '3' }),
    eq('2*x = 8', 'x = 4', { kind: 'divide-both', k: '2' })
  ]

  it('accepts a chain that starts from its input', () => {
    expect(validateWorking({ title: 't', input: '2*x + 3 = 11', steps }).valid).toBe(true)
  })

  it('accepts a layout-only difference between the input and the first step (2x+3=11 and 2*x + 3 = 11)', () => {
    expect(validateWorking({ title: 't', input: '2x + 3 = 11', steps }).valid).toBe(true)
  })

  it('rejects a first step that does not start from the input', () => {
    const res = validateWorking({ title: 't', input: '2*x + 3 = 12', steps })
    expect(res.valid).toBe(false)
    expect(res.failedStepIndex).toBe(0)
  })

  it('rejects a step that does not start where the step before it ends', () => {
    const broken: Step[] = [steps[0], { ...steps[1], before: '2*x = 9' }]
    const res = validateWorking({ title: 't', input: '2*x + 3 = 11', steps: broken })
    expect(res.valid).toBe(false)
    expect(res.failedStepIndex).toBe(1)
  })

  it('rejects a working with steps but no input to start them from', () => {
    expect(validateWorking({ title: 't', steps }).valid).toBe(false)
  })

  it('validates sub-workings and the Another way too, each with its own chain', () => {
    const sub: Working = { title: 'sub', input: '2*x = 8', steps: [steps[1]] }
    const broken: Working = { title: 'alt', input: '2*x + 3 = 11', steps: [{ ...steps[0], after: '2*x = 9' }] }
    // A sub-working must belong to its parent's own split or discriminant (P-FIX-S1SOUND2 MUST 8): this chain belongs to
    // no case of the parent, so it is refused, however valid it is on its own.
    expect(validateWorking({ title: 't', input: '2*x + 3 = 11', steps, subWorkings: [sub] }).valid).toBe(false)
    expect(validateWorking(sub).valid).toBe(true)
    expect(validateWorking({ title: 't', input: '2*x + 3 = 11', steps, subWorkings: [{ ...sub, input: 'x' }] }).valid).toBe(false)
    expect(validateWorking({ title: 't', input: '2*x + 3 = 11', steps, anotherWay: broken }).valid).toBe(false)
  })
})

describe('EquationEquiv needs a declared operation, checked side by side', () => {
  it('without an op the step is unknown, never valid', () => {
    expect(validateEquationEquiv({ kind: 'EquationEquiv', before: 'x = 2', after: 'x = 2', sentence: 's' })).toBe('unknown')
  })

  it('subtract y from both sides: -3y = 0 to -4y = 0 is rejected (the homogeneous sign slip)', () => {
    expect(validateEquationEquiv(eq('-3y = 0', '-4y = 0', { kind: 'subtract-both', term: 'y' }, 'y'))).toBe('invalid')
    // already-solved is only the form v = number: -3y = 0 is not that form, so a no-op on it is refused.
    expect(validateEquationEquiv(eq('-3y = 0', '-3y = 0', { kind: 'already-solved' }, 'y'))).not.toBe('valid')
    expect(validateEquationEquiv(eq('y = 0', 'y = 0', { kind: 'already-solved' }, 'y'))).toBe('valid')
  })

  it('work out the right side: 8 - 3 = 5 written as 6 is rejected, and 5 is accepted', () => {
    expect(validateEquationEquiv(eq('0 = 8 - 3', '0 = 6', { kind: 'work-out-right' }))).toBe('invalid')
    expect(validateEquationEquiv(eq('0 = 8 - 3', '0 = 5', { kind: 'work-out-right' }))).toBe('valid')
  })

  it('multiply both sides by 0 is never valid', () => {
    expect(validateEquationEquiv(eq('x = 2', '0 = 0', { kind: 'multiply-both', k: '0' }))).toBe('invalid')
  })

  it('multiply by k is valid only when the after is k times the before, on both sides', () => {
    expect(validateEquationEquiv(eq('x - 2 = 0', '2x - 4 = 0', { kind: 'multiply-both', k: '2' }))).toBe('valid')
    expect(validateEquationEquiv(eq('x - 2 = 0', '2x - 4 = 0', { kind: 'multiply-both', k: '3' }))).toBe('invalid')
    expect(validateEquationEquiv(eq('2*y = 0', 'y = 0', { kind: 'divide-both', k: '2' }, 'y'))).toBe('valid')
    expect(validateEquationEquiv(eq('2*y = 0', 'y = 0', { kind: 'divide-both', k: '3' }, 'y'))).toBe('invalid')
  })

  it('swap: the sides exchanged are valid; a different number is not', () => {
    expect(validateEquationEquiv(eq('x = 2', '2 = x', { kind: 'swap' }))).toBe('valid')
    expect(validateEquationEquiv(eq('x = 2', '3 = x', { kind: 'swap' }))).toBe('invalid')
  })

  it('an operation given with a non-equation is unknown, not valid', () => {
    expect(validateEquationEquiv(eq('x + 1', 'x + 1', { kind: 'already-solved' }))).toBe('unknown')
  })
})

describe('SubproblemReduction is never valid on its own (its case split is checked in the working)', () => {
  const data = { subAnswers: [{ solutions: ['2'] }, { solutions: ['3'] }], parentAnswer: { solutions: ['2', '3'] } }

  it('a displayed set that matches the data is still invalid standalone', () => {
    expect(validateSubproblemReduction({ kind: 'SubproblemReduction', before: 'p', after: 'x in {2, 3}', data, sentence: 's' })).toBe('invalid')
    expect(validateSubproblemReduction({ kind: 'SubproblemReduction', before: 'p', after: 'x = 2 \\text{ or } x = 3', data, sentence: 's' })).toBe('invalid')
  })
})

describe('CaseSplitComplete in zero-product form', () => {
  const zero = (before: string, cases: string[], after: string, c = '1') =>
    validateCaseSplitComplete({
      kind: 'CaseSplitComplete',
      before,
      after,
      sentence: 's',
      data: { form: 'zero-product', c, cases, variable: 'x' }
    })

  it('the product of the cases equal to the whole, with the roots displayed: valid', () => {
    expect(zero('(x - 2)(x - 3) = 0', ['x - 2 = 0', 'x - 3 = 0'], 'x = 2 \\text{ or } x = 3')).toBe('valid')
  })

  it('a case that is a different factor is invalid', () => {
    expect(zero('(x - 2)(x - 3) = 0', ['x - 2 = 0', 'x - 4 = 0'], 'x = 2 \\text{ or } x = 4')).toBe('invalid')
  })

  it('a displayed result that differs from the roots of the cases is invalid', () => {
    expect(zero('(x - 2)(x - 3) = 0', ['x - 2 = 0', 'x - 3 = 0'], 'x = 2')).toBe('invalid')
  })

  it('a declared constant of zero is invalid; a surd case is unknown, not valid', () => {
    expect(zero('(x - 2)(x - 3) = 0', ['x - 2 = 0', 'x - 3 = 0'], 'x = 2 \\text{ or } x = 3', '0')).toBe('invalid')
    expect(zero('(x - 2)(x - 3) = 0', ['x - \\sqrt{2} = 0', 'x - 3 = 0'], 'x = 3')).toBe('unknown')
  })

  it('validateStep dispatches the zero-product form through the step kind', () => {
    const step = finishStep({
      kind: 'CaseSplitComplete',
      before: '(x - 2)(x - 3) = 0',
      after: 'x = 2 \\text{ or } x = 3',
      sentence: '',
      data: { form: 'zero-product', c: '1', cases: ['x - 2 = 0', 'x - 3 = 0'], variable: 'x' }
    })
    expect(validateStep(step).verdict).toBe('valid')
  })
})

describe('the router tries the next method when the first one is hidden', () => {
  it('a hidden primary gives way to a shown method; a hidden working is never returned', () => {
    const hidden: Method = {
      id: 'mock.hidden',
      name: 'Hidden',
      order: 1,
      appliesTo: () => true,
      solve: () => ({
        title: 't',
        input: 'x = 2',
        steps: [eq('x = 2', 'x = 3', { kind: 'already-solved' })],
        answer: { label: 'x', tex: '2' }
      })
    }
    const shown: Method = {
      id: 'mock.shown',
      name: 'Shown',
      order: 2,
      appliesTo: () => true,
      solve: () => ({
        title: 't',
        input: 'x = 2',
        method: 'Shown',
        steps: [eq('x = 2', 'x = 2', { kind: 'already-solved' })],
        answer: { label: 'x', tex: '2' }
      })
    }
    const router = createStepRouter([hidden, shown])
    const w = router.solve({ job: 'solve', input: 'x = 2' })
    expect(w.noWorking).toBeFalsy()
    expect(w.method).toBe('Shown')
  })

  it('when every method is hidden the router reports noWorking, and shows nothing', () => {
    const hidden: Method = {
      id: 'mock.hidden',
      name: 'Hidden',
      appliesTo: () => true,
      solve: () => ({
        title: 't',
        input: 'x = 2',
        steps: [eq('x = 2', 'x = 3', { kind: 'already-solved' })]
      })
    }
    const w = createStepRouter([hidden]).solve({ job: 'solve', input: 'x = 2' })
    expect(w.noWorking).toBe(true)
    expect(w.steps).toHaveLength(0)
  })
})

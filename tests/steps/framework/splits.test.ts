// Tests for the review of 1aa6b998 (S0 framework):
// MUST 1: a SubproblemReduction is valid only when its sub-problems are exactly the cases of the case split
//         just before it, each solved by a validated sub-working, and the displayed union is theirs;
// MUST 2: an empty solution set is valid only with an exact proof from the displayed before;
// MUST 3: the zero-product constant is an exact non-zero rational, and the product has degree at least 1.

import { describe, it, expect } from 'vitest'
import {
  validateCaseSplitComplete,
  validateSolutionSetEq,
  validateStep,
  validateSubproblemReduction,
  validateWorking
} from '../../../src/renderer/src/math/steps/validate'
import { renderWorkingToDoc } from '../../../src/renderer/src/math/steps/render'
import { finishStep } from '../../../src/renderer/src/math/steps/sentences'
import type { Step, Working } from '../../../src/renderer/src/math/steps/types'

/** An EquationEquiv move with its sentence and rule built from the move (never typed here). */
const move = (before: string, after: string, op: Step['op']): Step =>
  finishStep({ kind: 'EquationEquiv', op, before, after, sentence: '', data: { variable: 'x' } })

/** Every step of a working, and of its sub-workings, takes the sentence and rule the builder gives. */
function stamped(w: Working): Working {
  return {
    ...w,
    steps: w.steps.map((s) => finishStep({ ...s })),
    subWorkings: w.subWorkings?.map(stamped),
    anotherWay: w.anotherWay ? stamped(w.anotherWay) : undefined
  }
}

/** The factor split of x^2 - 3x + 2 = 0 with two linear sub-workings: a sound working. */
function genuineSplit(): Working {
  const sub = (root: string): Working => ({
    title: 'Case',
    input: `x - ${root} = 0`,
    steps: [move(`x - ${root} = 0`, `x = ${root}`, { kind: 'add-both', term: root })],
    answer: { label: 'x', tex: root }
  })
  return stamped({
    title: 'Solve x^2 - 3x + 2 = 0',
    input: 'x^2 - 3x + 2 = 0',
    steps: [
      move('x^2 - 3x + 2 = 0', '(x - 1)(x - 2) = 0', { kind: 'factorise' }),
      {
        kind: 'CaseSplitComplete',
        before: '(x - 1)(x - 2) = 0',
        after: 'x = 1 \\text{ or } x = 2',
        sentence: '',
        data: { form: 'zero-product', c: '1', cases: ['x - 1 = 0', 'x - 2 = 0'], variable: 'x' }
      },
      {
        kind: 'SubproblemReduction',
        before: 'x = 1 \\text{ or } x = 2',
        after: 'x \\in \\{1, 2\\}',
        sentence: '',
        data: {
          variable: 'x',
          subProblems: ['x - 1 = 0', 'x - 2 = 0'],
          subAnswers: [{ solutions: ['1'] }, { solutions: ['2'] }],
          parentAnswer: { solutions: ['1', '2'] }
        }
      }
    ],
    subWorkings: [sub('1'), sub('2')],
    answer: [
      { label: 'x', tex: '1' },
      { label: 'x', tex: '2' }
    ]
  })
}

describe('MUST 1: a sub-problem reduction is tied to the case split just before it', () => {
  it('the exact planted input x = 1 with sub-answers 1 and 2 is invalid, and shows nothing', () => {
    const w: Working = {
      title: 'Solve x = 1',
      input: 'x = 1',
      steps: [
        finishStep({
          kind: 'SubproblemReduction',
          before: 'x = 1',
          after: 'x \\in \\{1, 2\\}',
          sentence: '',
          data: { subAnswers: [{ solutions: ['1'] }, { solutions: ['2'] }] }
        })
      ],
      answer: [
        { label: 'x', tex: '1' },
        { label: 'x', tex: '2' }
      ]
    }
    expect(validateWorking(w).valid).toBe(false)
    const doc = renderWorkingToDoc(w)
    expect(doc.noWorking).toBe(true)
    expect(doc.moves).toHaveLength(0)
    expect(doc.answers).toHaveLength(0)
  })

  it('a standalone reduction, with no case split in front of it, is invalid', () => {
    const step = genuineSplit().steps[2]
    expect(validateSubproblemReduction(step)).toBe('invalid')
    expect(validateStep(step).verdict).toBe('invalid')
  })

  it('a genuine split of a real equation, with its sub-answers as its roots, is valid and shown', () => {
    const w = genuineSplit()
    expect(validateWorking(w).valid).toBe(true)
    expect(renderWorkingToDoc(w).answers).toEqual([
      { label: 'x', tex: '1' },
      { label: 'x', tex: '2' }
    ])
  })

  it('the sub-problems must be the cases in the same order: swapped cases are hidden', () => {
    const w = genuineSplit()
    const red = w.steps[2]
    ;(red.data as { subProblems: string[] }).subProblems = ['x - 2 = 0', 'x - 1 = 0']
    expect(validateWorking(w).valid).toBe(false)
  })

  it('a sub-answer that is not the root of its case is hidden', () => {
    const w = genuineSplit()
    ;(w.steps[2].data as { subAnswers: { solutions: string[] }[] }).subAnswers[1] = { solutions: ['3'] }
    expect(validateWorking(w).valid).toBe(false)
  })

  it('a sub-working whose input is not its case is hidden', () => {
    const w = genuineSplit()
    w.subWorkings![0].input = 'x - 5 = 0'
    expect(validateWorking(w).valid).toBe(false)
  })

  it('a sub-working whose answer differs from the sub-answer is hidden', () => {
    const w = genuineSplit()
    w.subWorkings![1].answer = { label: 'x', tex: '4' }
    expect(validateWorking(w).valid).toBe(false)
  })

  it('a displayed union that is not the union of the sub-answers is hidden', () => {
    const w = genuineSplit()
    w.steps[2].after = 'x \\in \\{1, 3\\}'
    expect(validateWorking(w).valid).toBe(false)
  })
})

describe('MUST 2: an empty solution set is proved from the displayed before', () => {
  /** The sentence and the ending line the proof gives: linear "no value", quadratic "No real solution". */
  const empty = (before: string, variable = 'x'): Step => {
    const linear = !before.includes('^2')
    return finishStep({
      kind: 'SolutionSetEq',
      before,
      after: linear ? `\\text{no value of ${variable} works}` : '\\text{No real solution}',
      sentence: '',
      data: { variable, solutions: [] }
    })
  }

  it('x^2 - 4 = 0 has roots 2 and -2: "No real solution" is invalid', () => {
    expect(validateSolutionSetEq(empty('x^2 - 4 = 0'))).not.toBe('valid')
    expect(validateStep(empty('x^2 - 4 = 0')).verdict).not.toBe('valid')
  })

  it('x^2 + 0x + 0 = 0 has the root 0: "No real solution" is invalid', () => {
    expect(validateSolutionSetEq(empty('x^2 + 0x + 0 = 0'))).not.toBe('valid')
  })

  it('x^2 + 1 = 0 has a negative discriminant: no real solution is valid', () => {
    expect(validateSolutionSetEq(empty('x^2 + 1 = 0'))).toBe('valid')
  })

  it('a linear equation that reduces to 0 = c with c not zero has no solution: valid', () => {
    expect(validateSolutionSetEq(empty('x + 3 = x + 8'))).toBe('valid')
  })

  it('the same linear case with the quadratic wording is invalid: the line must be the one the proof gives', () => {
    const step = empty('x + 3 = x + 8')
    expect(validateSolutionSetEq({ ...step, after: '\\text{No real solution}' })).toBe('invalid')
  })

  it('a linear equation with a root has a solution: an empty set is invalid', () => {
    expect(validateSolutionSetEq(empty('2x = 6'))).not.toBe('valid')
  })

  it('the identity 0 = 0 is not an empty set', () => {
    expect(validateSolutionSetEq(empty('x = x'))).not.toBe('valid')
  })

  it('x^2 + y = 0 with variable x never proves "no real solution" (a second letter)', () => {
    expect(validateSolutionSetEq(empty('x^2 + y = 0'))).not.toBe('valid')
  })

  it('a working that ends with the false claim is hidden', () => {
    const w: Working = stamped({
      title: 't',
      input: 'x^2 - 4 = 0',
      steps: [empty('x^2 - 4 = 0')],
      answer: { label: 'x', tex: '\\text{No real solution}' }
    })
    expect(validateWorking(w).valid).toBe(false)
    expect(renderWorkingToDoc(w).moves).toHaveLength(0)
  })
})

describe('MUST 3: the zero-product constant is an exact non-zero rational, and the product has degree at least 1', () => {
  /** The split of `before` into `cases`, with the roots the displayed line `shown` lists. */
  const zero = (before: string, cases: string[], c: string, shown = 'x = 99') =>
    validateCaseSplitComplete({
      kind: 'CaseSplitComplete',
      before,
      after: shown,
      sentence: '',
      data: { form: 'zero-product', c, cases, variable: 'x' }
    })

  it('the exact planted case: 0 = 0 with c = 0 and the case x - 99 = 0 is invalid, and shows nothing', () => {
    const w: Working = stamped({
      title: 't',
      input: '0 = 0',
      steps: [
        {
          kind: 'CaseSplitComplete',
          before: '0 = 0',
          after: 'x = 99',
          sentence: '',
          data: { form: 'zero-product', c: '0', cases: ['x - 99 = 0'], variable: 'x' }
        }
      ],
      answer: { label: 'x', tex: '99' }
    })
    expect(validateWorking(w).valid).toBe(false)
    expect(renderWorkingToDoc(w).moves).toHaveLength(0)
  })

  it('c = 0 is invalid, and so is c = 0/5 (zero too)', () => {
    expect(zero('(x - 99) = 0', ['x - 99 = 0'], '0')).toBe('invalid')
    expect(zero('(x - 99) = 0', ['x - 99 = 0'], '0/5')).toBe('invalid')
  })

  it('c that is not a rational (1/0, or nothing) is invalid', () => {
    expect(zero('(x - 99) = 0', ['x - 99 = 0'], '1/0')).toBe('invalid')
    expect(zero('(x - 99) = 0', ['x - 99 = 0'], '')).toBe('invalid')
  })

  it('a product of degree 0 (every case a constant) is invalid, even with c = 1', () => {
    expect(zero('0 = 0', ['0 = 0'], '1')).toBe('invalid')
    expect(zero('5 = 0', ['5 = 0'], '1')).toBe('invalid')
  })

  it('a non-zero c with a product of degree 1 or more is valid', () => {
    expect(zero('(x - 99) = 0', ['x - 99 = 0'], '1')).toBe('valid')
    expect(zero('(2x - 3) = 0', ['2x - 3 = 0'], '2', 'x = 3/2')).toBe('invalid')
    expect(zero('2(x - 3) = 0', ['x - 3 = 0'], '1/2', 'x = 3')).toBe('valid')
    expect(zero('2(x - 3) = 0', ['x - 3 = 0'], '2', 'x = 3')).toBe('invalid')
    expect(zero('(x - 2)(x - 3) = 0', ['x - 2 = 0', 'x - 3 = 0'], '1/1', 'x = 2 \\text{ or } x = 3')).toBe('valid')
  })
})

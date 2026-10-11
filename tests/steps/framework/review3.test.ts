// Tests for the third review round of 1aa6b998 (S0 framework):
// gpt MUST A: a SolutionSetEq must display the text the validator builds from the PROVED set;
// gpt MUST B: a step's sentence and rule are not free text: they are built from the step's typed op and states;
// gpt MUST C: the check sentence is built by the validator from the validated answer, never passed through;
// SHOULD: sameState on powers, reciprocals, unary minus, exponent notation, underflow and overflow literals;
//         a move mislabelled as an add (a swap, a multiplication by -1); the extra-variable guard; variable-free
//         input; \in in displayed sets.

import { describe, it, expect } from 'vitest'
import {
  validateEquationEquiv,
  validateStep,
  validateWorking
} from '../../../src/renderer/src/math/steps/validate'
import { renderWorkingToDoc } from '../../../src/renderer/src/math/steps/render'
import { createStepRouter, CANT_SHOW_STEPS_REASON } from '../../../src/renderer/src/math/steps/router'
import { S1A_METHODS } from '../../../src/renderer/src/math/steps/methods'
import { displayedValues, sameState } from '../../../src/renderer/src/math/steps/check-adapter'
import { ruleFor, sentenceFor } from '../../../src/renderer/src/math/steps/sentences'
import type { EquationOp, Step, Working } from '../../../src/renderer/src/math/steps/types'

const router = createStepRouter(S1A_METHODS)

/** An EquationEquiv whose sentence and rule are the ones the builder gives for its op (never typed by hand). */
function eqStep(before: string, after: string, op: EquationOp, variable = 'x'): Step {
  const step: Step = { kind: 'EquationEquiv', op, before, after, sentence: '', data: { variable } }
  step.sentence = sentenceFor(step) ?? ''
  step.rule = ruleFor(step) ?? undefined
  return step
}

/** The page shows nothing for this working: not valid, no moves, no answer, no check. */
function expectHidden(w: Working, label: string): void {
  expect(validateWorking(w).valid, `${label}: the validators must reject`).toBe(false)
  const doc = renderWorkingToDoc(w)
  expect(doc.noWorking, `${label}: the bridge reports noWorking`).toBe(true)
  expect(doc.moves, `${label}: no moves on the page`).toHaveLength(0)
  expect(doc.answers, `${label}: no answer on the page`).toHaveLength(0)
  expect(doc.check, `${label}: no check on the page`).toBeUndefined()
}

const copyOf = (w: Working): Working => JSON.parse(JSON.stringify(w)) as Working

describe('gpt MUST A: a solution-set line is the text the validator builds from the proved set', () => {
  it('x + 3 = x + 8 ends with "no value of x works": the wrong line "every real number" is hidden', () => {
    const w = router.solve({ job: 'solve', input: 'x + 3 = x + 8', variable: 'x' })
    expect(w.noWorking).toBeFalsy()
    const bad = copyOf(w)
    bad.steps.at(-1)!.after = '\\text{every real number}'
    expectHidden(bad, 'linear no-solution line replaced by the identity line')
  })

  it('x + 3 = x + 3 ends with "every real number": the wrong line "No real solution" is hidden', () => {
    const w = router.solve({ job: 'solve', input: 'x + 3 = x + 3', variable: 'x' })
    const bad = copyOf(w)
    bad.steps.at(-1)!.after = '\\text{No real solution}'
    expectHidden(bad, 'identity line replaced by the no-real-solution line')
  })

  it('x^2 + 4 = 0 has no real solution: its line must read exactly "No real solution"', () => {
    const w = router.solve({ job: 'solve', input: 'x^2 + 4 = 0', variable: 'x' })
    expect(validateWorking(w).valid).toBe(true)
    const bad = copyOf(w)
    bad.steps.at(-1)!.after = '\\text{No real solutions}'
    expectHidden(bad, 'no-real-solution line with a different wording')
  })

  it('an empty set claimed for a quadratic with roots is hidden whatever the line says', () => {
    const step: Step = {
      kind: 'SolutionSetEq',
      before: 'x^2 - 4 = 0',
      after: '\\text{No real solution}',
      sentence: '',
      data: { variable: 'x', solutions: [] }
    }
    step.sentence = sentenceFor(step) ?? ''
    expect(validateStep(step).verdict).not.toBe('valid')
  })
})

describe('gpt MUST B: a sentence and a rule are built from the typed op, and any other text is invalid', () => {
  const steps = [
    eqStep('2x + 3 = 11', '2x = 8', { kind: 'subtract-both', term: '3' }),
    eqStep('2x = 8', 'x = 4', { kind: 'divide-both', k: '2' })
  ]
  const working = (): Working => ({ title: 't', input: '2x + 3 = 11', steps: JSON.parse(JSON.stringify(steps)) })

  it('the sentences the builder gives for the true moves are valid', () => {
    expect(steps[0].sentence).toBe('Subtract 3 from both sides')
    expect(validateWorking(working()).valid).toBe(true)
  })

  it('"Multiply both sides by 7" over 2x + 3 = 11 → 2x = 8 is invalid, and renders nothing', () => {
    const w = working()
    w.steps[0].sentence = 'Multiply both sides by 7'
    expectHidden(w, 'wrong operation in the sentence')
  })

  it('a wrong rule chip ("Multiply both sides") on the same step is invalid', () => {
    const w = working()
    w.steps[0].rule = 'Multiply both sides'
    expectHidden(w, 'wrong rule chip')
  })

  it('a sentence that is not the op the step declares is invalid, even when the arithmetic is right', () => {
    const w = working()
    w.steps[0].op = { kind: 'add-both', term: '3' }
    expectHidden(w, 'op changed without the sentence')
  })

  it('the wrong op is invalid: subtract 3 claimed, but the sides are not those of 2x + 3 = 11 minus 3', () => {
    const bad = eqStep('2x + 3 = 11', '2x = 8', { kind: 'subtract-both', term: '5' })
    expect(validateStep(bad).verdict).toBe('invalid')
  })
})

describe('gpt SHOULD: a mislabelled move is refused (a swap or a multiplication by -1 given as an add), and swap and multiply are checked side by side', () => {
  it('an add of 0 used for a swap (x = 2 to 2 = x) is refused', () => {
    expect(validateEquationEquiv(eqStep('x = 2', '2 = x', { kind: 'add-both', term: '0' }))).toBe('invalid')
  })

  it('an add of 0 used for multiplying both sides by -1 (x = 2 to -x = -2) is refused', () => {
    expect(validateEquationEquiv(eqStep('x = 2', '-x = -2', { kind: 'add-both', term: '0' }))).toBe('invalid')
  })

  it('the true swap and the true multiplication by -1 are valid under their own ops', () => {
    expect(validateEquationEquiv(eqStep('x = 2', '2 = x', { kind: 'swap' }))).toBe('valid')
    expect(validateEquationEquiv(eqStep('x = 2', '-x = -2', { kind: 'multiply-both', k: '-1' }))).toBe('valid')
  })
})

describe('gpt MUST C: the check sentence is built from the validated answer, and a wrong one hides the working', () => {
  const w = (): Working => {
    const step = eqStep('3y + 1 = 7', '3y = 6', { kind: 'subtract-both', term: '1' }, 'y')
    const last = eqStep('3y = 6', 'y = 2', { kind: 'divide-both', k: '3' }, 'y')
    return { title: 't', input: '3y + 1 = 7', steps: [step, last], answer: { label: 'y', tex: '2', value: '2' } }
  }

  it('the page gives the check built from the answer: both sides give 7 when y = 2', () => {
    const doc = renderWorkingToDoc(w())
    expect(doc.noWorking).toBeFalsy()
    expect(doc.check).toBe('Put y = 2 back: both sides give 7.')
  })

  it('a check that says "both sides give 5" is hidden', () => {
    const bad = w()
    bad.check = 'Put y = 2 back: both sides give 5.'
    expectHidden(bad, 'wrong check')
  })

  it('a check that is the right text is accepted', () => {
    const good = w()
    good.check = 'Put y = 2 back: both sides give 7.'
    expect(validateWorking(good).valid).toBe(true)
  })

  it('a wrong answer (y = 3) cannot carry a check that its substitution would give', () => {
    const bad = w()
    bad.answer = { label: 'y', tex: '3', value: '3' }
    expectHidden(bad, 'answer that does not satisfy the input')
  })
})

describe('SHOULD: sameState on powers, reciprocals, unary minus and exponent notation', () => {
  it('2x^2 is not (2x)^2', () => {
    expect(sameState('y = 2x^2', 'y = (2x)^2')).toBe(false)
  })

  it('1/2x is read as the app reads it, (1/2)x: it is not 1/(2x) and not x/2y', () => {
    expect(sameState('y = 1/2x', 'y = 1/(2*x)')).toBe(false)
    expect(sameState('y = 1/2x', 'y = x/2y')).toBe(false)
  })

  it('-x^2 is not (-x)^2', () => {
    expect(sameState('y = -x^2', 'y = (-x)^2')).toBe(false)
  })

  it('exponent notation is read exactly: 2e3x is 2000x, and 1e-3 is 0.001', () => {
    expect(sameState('y = 2e3x', 'y = 2000x')).toBe(true)
    expect(sameState('y = 1e-3', 'y = 0.001')).toBe(true)
  })

  it('an underflowing decimal does not collapse to zero: 0.(310 zeros)1 and 0.(310 zeros)2 differ', () => {
    const zeros = '0'.repeat(310)
    expect(sameState(`x = 0.${zeros}1`, `x = 0.${zeros}2`)).toBe(false)
  })

  it('a literal too long for the safe range is refused, even when identical', () => {
    const big = `1${'0'.repeat(400)}`
    expect(sameState(`x = ${big}`, `x = ${big}`)).toBe(false)
  })
})

describe('SHOULD: the extra-variable guard and variable-free input', () => {
  it('x^2 + y = 0 with variable x never proves "no real solutions" (it has two letters)', () => {
    const step: Step = {
      kind: 'SolutionSetEq',
      before: 'x^2 + y = 0',
      after: '\\text{No real solution}',
      sentence: '',
      data: { variable: 'x', solutions: [] }
    }
    step.sentence = sentenceFor(step) ?? ''
    expect(validateStep(step).verdict).not.toBe('valid')
  })

  it('an input with no variable (0 = 0) is not solved: no steps, no answer, and no crash', () => {
    const w = router.solve({ job: 'solve', input: '0 = 0' })
    expect(w.noWorking).toBe(true)
    expect(w.answer).toBeUndefined()
    expect(validateWorking({ title: 't', input: '0 = 0', steps: [], noWorking: true, reason: CANT_SHOW_STEPS_REASON }).valid).toBe(true)
    const withAnswer: Working = {
      title: 't',
      input: '0 = 0',
      steps: [eqStep('0 = 0', '0 = 0', { kind: 'swap' })],
      answer: { label: 'x', tex: '0' }
    }
    expect(validateWorking(withAnswer).valid).toBe(false)
  })
})

describe('SHOULD: displayed sets accept \\in as well as in', () => {
  it('x \\in {2, 3} and x in {2, 3} both list 2 and 3', () => {
    expect(displayedValues('x \\in \\{2, 3\\}', 'x')).toEqual(['2', '3'])
    expect(displayedValues('x in {2, 3}', 'x')).toEqual(['2', '3'])
  })
})

// Tests for the round 7 reviews of a7928f78 (gpt-5.4 delta5 and Gemini delta5):
// MUST 1: clear-fractions needs every written denominator to be a plain integer literal (optionally bracketed and
//         signed); a power, a letter or a bracket expression after it is refused;
// MUST 2: expand-sides needs a real product (a bracket multiplied by something other than 1, or raised to a power of 2 or
//         more); removing redundant brackets is its own op, remove-brackets;
// MUST 3: the exact case (x + 1) = 2 → x + 1 = 2 with expand-sides is hidden;
// MUST 4 (Gemini's claim, verified, not trusted): the completing-square working of x^2 + 2x - 3 = 0 and of
//         x^2 + 6x + 5 = 0 is valid, and shows its completing step, through validateWorking and the rendered output.

import { describe, it, expect } from 'vitest'
import {
  validateEquationEquiv,
  validateStep,
  validateWorking
} from '../../../src/renderer/src/math/steps/validate'
import { renderWorkingToDoc } from '../../../src/renderer/src/math/steps/render'
import { createStepRouter } from '../../../src/renderer/src/math/steps/router'
import { S1A_METHODS } from '../../../src/renderer/src/math/steps/methods'
import { finishStep, sentenceFor } from '../../../src/renderer/src/math/steps/sentences'
import type { EquationOp, Step, Working } from '../../../src/renderer/src/math/steps/types'

const router = createStepRouter(S1A_METHODS)

/** An EquationEquiv with the declared op; its sentence and rule are the builder's, never typed here. */
function eqStep(before: string, after: string, op: EquationOp, v = 'x'): Step {
  return finishStep({ kind: 'EquationEquiv', op, before, after, sentence: '', data: { variable: v } })
}

/** The page shows nothing: the working is invalid, with no moves, no answer and no check line. */
function expectHidden(w: Working, label: string): void {
  expect(validateWorking(w).valid, `${label}: the validators must reject`).toBe(false)
  const doc = renderWorkingToDoc(w)
  expect(doc.noWorking, `${label}: the bridge reports noWorking`).toBe(true)
  expect(doc.moves, `${label}: no moves on the page`).toHaveLength(0)
  expect(doc.answers, `${label}: no answer on the page`).toHaveLength(0)
  expect(doc.check, `${label}: no check on the page`).toBeUndefined()
}

describe('MUST 1: clear-fractions needs every written denominator to be a plain integer literal', () => {
  it('the review case: x/(-2)^2 = 1 → x/2 = 2 with clear-fractions k = 2 is refused (the denominator is a power)', () => {
    expect(validateEquationEquiv(eqStep('x/(-2)^2 = 1', 'x/2 = 2', { kind: 'clear-fractions', k: '2' }))).not.toBe('valid')
    expectHidden(
      { title: 't', input: 'x/(-2)^2 = 1', steps: [eqStep('x/(-2)^2 = 1', 'x/2 = 2', { kind: 'clear-fractions', k: '2' })] },
      'clear-fractions on a power denominator'
    )
  })

  it('the plain forms still clear: x/(-2) = 1 and x/2 = 1 both clear by 2', () => {
    expect(validateEquationEquiv(eqStep('x/(-2) = 1', '-x = 2', { kind: 'clear-fractions', k: '2' }))).toBe('valid')
    expect(validateEquationEquiv(eqStep('x/2 = 1', 'x = 2', { kind: 'clear-fractions', k: '2' }))).toBe('valid')
  })

  it('a denominator with a letter after it is refused: x/2y = 1 (the y may belong to the denominator)', () => {
    expect(validateEquationEquiv(eqStep('x/2y = 1', 'x = 2y', { kind: 'clear-fractions', k: '2' }))).not.toBe('valid')
  })

  it('a LaTeX denominator that is not a plain integer is refused: \\frac{x}{2^2} = 1', () => {
    expect(validateEquationEquiv(eqStep('\\frac{x}{2^2} = 1', 'x = 4', { kind: 'clear-fractions', k: '4' }))).not.toBe('valid')
  })

  it('the method does not label a power denominator as "Clear the fractions"', () => {
    const w = router.solve({ job: 'solve', input: 'x/(-2)^2 = 1', variable: 'x' })
    const doc = renderWorkingToDoc(w)
    expect(doc.moves.some((m) => m.rule === 'Clear the fractions')).toBe(false)
  })
})

describe('MUST 2: expand-sides needs a real product; removing redundant brackets is remove-brackets', () => {
  it('the exact case: (x + 1) = 2 → x + 1 = 2 with expand-sides is refused (only redundant brackets went)', () => {
    expect(validateEquationEquiv(eqStep('(x + 1) = 2', 'x + 1 = 2', { kind: 'expand-sides' }))).not.toBe('valid')
  })

  it('the exact case as a working: (x + 1) = 2 → x + 1 = 2 with expand-sides is hidden in the rendered output', () => {
    const step = eqStep('(x + 1) = 2', 'x + 1 = 2', { kind: 'expand-sides' })
    expectHidden({ title: 't', input: '(x + 1) = 2', steps: [step] }, 'expand-sides removing redundant brackets')
  })

  it('a bracket multiplied by 2 is a real product: 2(x + 1) = 4 → 2x + 2 = 4 with expand-sides is valid', () => {
    expect(validateEquationEquiv(eqStep('2(x + 1) = 4', '2x + 2 = 4', { kind: 'expand-sides' }))).toBe('valid')
  })

  it('a bracket raised to a power of 2 is a real product: (x + 1)^2 = 0 → x^2 + x + x + 1 = 0 with expand-sides is valid', () => {
    expect(validateEquationEquiv(eqStep('(x + 1)^2 = 0', 'x^2 + x + x + 1 = 0', { kind: 'expand-sides' }))).toBe('valid')
  })

  it('a bracket raised to the power 1 is not a product: (x + 1)^1 = 2 → x + 1 = 2 is refused', () => {
    expect(validateEquationEquiv(eqStep('(x + 1)^1 = 2', 'x + 1 = 2', { kind: 'expand-sides' }))).not.toBe('valid')
  })

  it('a minus before a bracket is a real product (multiplied by −1): 3 - (x + 1) = 0 → 3 - x - 1 = 0 is valid', () => {
    expect(validateEquationEquiv(eqStep('3 - (x + 1) = 0', '3 - x - 1 = 0', { kind: 'expand-sides' }))).toBe('valid')
  })

  it('a plus before a bracket is redundant: x + (x + 1) = 2 → x + x + 1 = 2 is refused as an expansion', () => {
    expect(validateEquationEquiv(eqStep('x + (x + 1) = 2', 'x + x + 1 = 2', { kind: 'expand-sides' }))).not.toBe('valid')
  })

  it('remove-brackets takes the redundant brackets: (x + 1) = 2 → x + 1 = 2 is valid', () => {
    expect(validateEquationEquiv(eqStep('(x + 1) = 2', 'x + 1 = 2', { kind: 'remove-brackets' }))).toBe('valid')
    expect(validateEquationEquiv(eqStep('x + (x + 1) = 2', 'x + x + 1 = 2', { kind: 'remove-brackets' }))).toBe('valid')
  })

  it('remove-brackets refuses a real product: 2(x + 1) = 4 → 2x + 2 = 4 is refused', () => {
    expect(validateEquationEquiv(eqStep('2(x + 1) = 4', '2x + 2 = 4', { kind: 'remove-brackets' }))).not.toBe('valid')
  })

  it('remove-brackets needs a bracket to remove, and a changed text: x + 1 = 2 → x + 1 = 2 is refused', () => {
    expect(validateEquationEquiv(eqStep('x + 1 = 2', 'x + 1 = 2', { kind: 'remove-brackets' }))).not.toBe('valid')
  })

  it('the method on (x + 1) = 2 writes "Remove brackets", then solves: x = 1', () => {
    const w = router.solve({ job: 'solve', input: '(x + 1) = 2', variable: 'x' })
    expect(w.noWorking).toBeFalsy()
    const doc = renderWorkingToDoc(w)
    expect(doc.moves[0].rule).toBe('Remove brackets')
    expect(doc.answers).toEqual([{ label: 'x', tex: '1' }])
  })

  it('the method on 2x + (x + 1) = 5 removes the brackets, then collects: 3x + 1 = 5 → x = 4/3', () => {
    const w = router.solve({ job: 'solve', input: '2x + (x + 1) = 5', variable: 'x' })
    expect(w.noWorking).toBeFalsy()
    const doc = renderWorkingToDoc(w)
    expect(doc.moves[0].rule).toBe('Remove brackets')
    expect(doc.moves[1].rule).toBe('Collect like terms')
    expect(doc.answers).toEqual([{ label: 'x', tex: '\\frac{4}{3}' }])
  })

  it('the remove-brackets sentence is its own: no other EquationEquiv op of the sample says the same', () => {
    const ops: EquationOp[] = [
      { kind: 'remove-brackets' },
      { kind: 'expand-sides' },
      { kind: 'collect-like-terms' },
      { kind: 'move-to-left' },
      { kind: 'already-solved' },
      { kind: 'swap' }
    ]
    const sentences = ops.map((op) => sentenceFor(eqStep('(x + 1) = 2', 'x + 1 = 2', op)))
    expect(new Set(sentences).size, sentences.join(' | ')).toBe(ops.length)
  })
})

describe('MUST 3 (gap): the exact case is a hidden expand-sides working', () => {
  it('(x + 1) = 2 → x + 1 = 2 with expand-sides: validateStep is not valid, and the rendered page is empty', () => {
    const step = eqStep('(x + 1) = 2', 'x + 1 = 2', { kind: 'expand-sides' })
    expect(validateStep(step).verdict).not.toBe('valid')
    expect(renderWorkingToDoc({ title: 't', input: '(x + 1) = 2', steps: [step] }).moves).toHaveLength(0)
  })
})

describe('MUST 4 (Gemini, verified): the completing-square working of x^2 + 2x - 3 = 0 and x^2 + 6x + 5 = 0', () => {
  for (const [input, answers] of [
    ['x^2 + 2x - 3 = 0', ['-3', '1']],
    ['x^2 + 6x + 5 = 0', ['-5', '-1']]
  ] as const) {
    it(`${input}: the Another way (completing the square) is valid through validateWorking and shows its completing step`, () => {
      const w = router.solve({ job: 'solve', input, variable: 'x' })
      expect(w.noWorking).toBeFalsy()
      const alt = w.anotherWay as Working
      expect(alt, input).toBeDefined()
      expect(alt.method, input).toBe('Completing the square')
      // The claim under test: every completing step is judged invalid. It is not, for these inputs.
      expect(validateWorking(alt).valid, input).toBe(true)
      expect(validateWorking(w).valid, input).toBe(true)
      const completing = alt.steps.find((s) => s.rule === 'Complete the square')
      expect(completing, input).toBeDefined()
      expect(validateStep(completing as Step).verdict, input).toBe('valid')
      const doc = renderWorkingToDoc(alt)
      expect(doc.noWorking, input).toBeFalsy()
      expect(doc.moves.some((m) => m.rule === 'Complete the square'), input).toBe(true)
      expect(doc.answers.map((a) => a.tex), input).toEqual(answers)
    })
  }
})

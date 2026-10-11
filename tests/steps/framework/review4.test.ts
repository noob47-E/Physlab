// Tests for the round 5 review of 0b0fadd7 (gpt-5.4, delta3):
// MUST 1: clearing decimals and clearing fractions are different ops, each with its own check, and render its own words;
// MUST 2+3: every rewrite op (already-solved, expand-sides, collect-like-terms, work-out-right, factorise, complete-square)
//           has its own structural check on top of the equality, so a mislabelled move is hidden;
// SHOULD 1: a letter other than the variable anywhere in `before` (even one that cancels) means no proof;
// SHOULD 2: within one kind of step, two different ops never get the same sentence;
// SHOULD 3: the 300-digit limit counts every digit of a literal, leading zeros included.

import { describe, it, expect } from 'vitest'
import {
  validateEquationEquiv,
  validateSolutionSetEq,
  validateStep,
  validateWorking
} from '../../../src/renderer/src/math/steps/validate'
import { renderWorkingToDoc } from '../../../src/renderer/src/math/steps/render'
import { createStepRouter } from '../../../src/renderer/src/math/steps/router'
import { S1A_METHODS } from '../../../src/renderer/src/math/steps/methods'
import { sameState } from '../../../src/renderer/src/math/steps/check-adapter'
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

const REWRITE_LABELS = [
  'already-solved',
  'expand-sides',
  'collect-like-terms',
  'work-out-right',
  'factorise',
  'complete-square'
] as const
type RewriteLabel = (typeof REWRITE_LABELS)[number]

describe('MUST 1: decimal clearing and fraction clearing are different ops, with their own rule and check', () => {
  it('0.2x = 1 clears the decimals by 10, and the rule chip says so (not "Clear the fractions")', () => {
    const w = router.solve({ job: 'solve', input: '0.2x = 1', variable: 'x' })
    expect(w.noWorking).toBeFalsy()
    const doc = renderWorkingToDoc(w)
    expect(doc.moves[0].head).toBe('Multiply both sides by 10 to clear the decimals')
    expect(doc.moves[0].rule).toBe('Clear the decimals')
    expect(doc.answers).toEqual([{ label: 'x', tex: '5' }])
  })

  it('x/2 = 1 clears the fractions by the denominator, and says "fractions"', () => {
    const w = router.solve({ job: 'solve', input: 'x/2 = 1', variable: 'x' })
    expect(w.noWorking).toBeFalsy()
    const doc = renderWorkingToDoc(w)
    expect(doc.moves[0].head).toBe('Multiply both sides by 2 to clear the fractions')
    expect(doc.moves[0].rule).toBe('Clear the fractions')
    expect(doc.answers).toEqual([{ label: 'x', tex: '2' }])
  })

  it('0.5x = 1/3 clears the decimals first, then the fractions by their LCD, then divides', () => {
    const w = router.solve({ job: 'solve', input: '0.5x = 1/3', variable: 'x' })
    expect(w.noWorking).toBeFalsy()
    const doc = renderWorkingToDoc(w)
    expect(doc.moves.map((m) => m.head)).toEqual([
      'Multiply both sides by 10 to clear the decimals',
      'Multiply both sides by 3 to clear the fractions',
      'Divide both sides by 15'
    ])
    expect(doc.answers).toEqual([{ label: 'x', tex: '\\frac{2}{3}' }])
  })

  it('a decimal-clearing multiplier must be a power of ten: k = 5 for 0.2x = 1 is refused', () => {
    expect(validateEquationEquiv(eqStep('0.2x = 1', '1x = 5', { kind: 'clear-decimals', k: '5' }))).not.toBe('valid')
    expect(validateEquationEquiv(eqStep('0.2x = 1', '2x = 10', { kind: 'clear-decimals', k: '10' }))).toBe('valid')
  })

  it('clear-decimals needs a decimal literal in the before: x/2 = 1 is not a decimal step', () => {
    expect(validateEquationEquiv(eqStep('x/2 = 1', '5x = 10', { kind: 'clear-decimals', k: '10' }))).not.toBe('valid')
  })

  it('clear-fractions needs the LCD of the denominators that appear: k = 3 for x/2 = 1 is refused', () => {
    expect(validateEquationEquiv(eqStep('x/2 = 1', '3x/2 = 3', { kind: 'clear-fractions', k: '3' }))).not.toBe('valid')
    expect(validateEquationEquiv(eqStep('x/2 = 1', 'x = 2', { kind: 'clear-fractions', k: '2' }))).toBe('valid')
  })

  it('clear-fractions on a decimal-only equation (0.2x = 1 by 10) is refused: there is no denominator to clear', () => {
    expect(validateEquationEquiv(eqStep('0.2x = 1', '2x = 10', { kind: 'clear-fractions', k: '10' }))).not.toBe('valid')
  })
})

describe('MUST 2+3: each rewrite op has its own structural check on top of the equality', () => {
  it('the review case: already-solved on 2x + 2 = 0 → 2(x + 1) = 0 is hidden (not the same text, not v = number)', () => {
    const step = eqStep('2x + 2 = 0', '2(x + 1) = 0', { kind: 'already-solved' })
    expect(validateStep(step).verdict).not.toBe('valid')
    expectHidden({ title: 't', input: '2x + 2 = 0', steps: [step] }, 'already-solved on an expansion')
  })

  it('already-solved is valid only for the same text of the form v = number', () => {
    expect(validateEquationEquiv(eqStep('x = 2', 'x = 2', { kind: 'already-solved' }))).toBe('valid')
    expect(validateEquationEquiv(eqStep('2x + 2 = 0', '2x + 2 = 0', { kind: 'already-solved' }))).not.toBe('valid')
  })

  it('the review case: collect-like-terms on the expansion 2(x + 1) = 0 → 2x + 2 = 0 is hidden', () => {
    const step = eqStep('2(x + 1) = 0', '2x + 2 = 0', { kind: 'collect-like-terms' })
    expect(validateStep(step).verdict).not.toBe('valid')
    expectHidden({ title: 't', input: '2(x + 1) = 0', steps: [step] }, 'collect on an expansion')
  })

  it('expand-sides: the bracket goes, the sum of monomials stays; a bracket left in the after is refused', () => {
    expect(validateEquationEquiv(eqStep('2(x + 1) = 0', '2x + 2 = 0', { kind: 'expand-sides' }))).toBe('valid')
    expect(validateEquationEquiv(eqStep('x + 3 = 5', 'x + 3 = 5', { kind: 'expand-sides' }))).not.toBe('valid')
    expect(validateEquationEquiv(eqStep('(x + 1) = 3', '(x + 1) = 3', { kind: 'expand-sides' }))).not.toBe('valid')
  })

  it('collect-like-terms: the before has like terms and no brackets; the after has each monomial once', () => {
    expect(validateEquationEquiv(eqStep('x + x = 4', '2x = 4', { kind: 'collect-like-terms' }))).toBe('valid')
    expect(validateEquationEquiv(eqStep('x + x = 4', 'x + x = 4', { kind: 'collect-like-terms' }))).not.toBe('valid')
    expect(validateEquationEquiv(eqStep('x = 2', 'x = 2', { kind: 'collect-like-terms' }))).not.toBe('valid')
  })

  it('work-out-right: the right side of before has no variable and is not already one number; after is that number', () => {
    expect(validateEquationEquiv(eqStep('x = 8 - 3', 'x = 5', { kind: 'work-out-right' }))).toBe('valid')
    expect(validateEquationEquiv(eqStep('x = 5', 'x = 5', { kind: 'work-out-right' }))).not.toBe('valid')
    expect(validateEquationEquiv(eqStep('x + 1 = 8 - 3', 'x = 5', { kind: 'work-out-right' }))).not.toBe('valid')
  })

  it('factorise: after is a product of factors, and before was not already that product', () => {
    expect(validateEquationEquiv(eqStep('x^2 - 3x + 2 = 0', '(x - 1)(x - 2) = 0', { kind: 'factorise' }))).toBe('valid')
    expect(validateEquationEquiv(eqStep('(x - 1)(x - 2) = 0', '(x - 1)(x - 2) = 0', { kind: 'factorise' }))).not.toBe('valid')
    expect(validateEquationEquiv(eqStep('x + 1 = 0', 'x + 1 = 0', { kind: 'factorise' }))).not.toBe('valid')
  })

  it('complete-square: after has the form a(x + p)^2 + q, exactly, and is equal to before', () => {
    expect(validateEquationEquiv(eqStep('x^2 - 2x = 0', '(x - 1)^2 - 1 = 0', { kind: 'complete-square' }))).toBe('valid')
    expect(validateEquationEquiv(eqStep('x^2 - 2x = 0', 'x^2 - 2x = 0', { kind: 'complete-square' }))).not.toBe('valid')
  })
})

describe('MUST 2+3: every rewrite label on a step of each other kind is hidden in the rendered output', () => {
  /** Real moves of each kind, with their own op. The label of each is swapped for each rewrite label in turn. */
  const sources: { name: string; before: string; after: string; op: EquationOp }[] = [
    { name: 'add-both', before: 'x - 3 = 5', after: 'x = 8', op: { kind: 'add-both', term: '3' } },
    { name: 'subtract-both', before: 'x + 3 = 5', after: 'x = 2', op: { kind: 'subtract-both', term: '3' } },
    { name: 'multiply-both', before: 'x = 3', after: '2x = 6', op: { kind: 'multiply-both', k: '2' } },
    { name: 'divide-both', before: '2x = 6', after: 'x = 3', op: { kind: 'divide-both', k: '2' } },
    { name: 'move-to-left', before: 'x^2 = 5x - 6', after: 'x^2 - 5x + 6 = 0', op: { kind: 'move-to-left' } },
    { name: 'swap', before: 'x = 2', after: '2 = x', op: { kind: 'swap' } },
    { name: 'clear-decimals', before: '0.5x = 1', after: '5x = 10', op: { kind: 'clear-decimals', k: '10' } },
    { name: 'clear-fractions', before: 'x/2 = 1', after: 'x = 2', op: { kind: 'clear-fractions', k: '2' } },
    { name: 'square-root-pm', before: '(x - 1)^2 - 4 = 0', after: '(x - 3)(x + 1) = 0', op: { kind: 'square-root-pm', shift: '1', root: '2' } },
    { name: 'already-solved', before: 'x = 2', after: 'x = 2', op: { kind: 'already-solved' } },
    { name: 'expand-sides', before: '2(x + 1) = 4', after: '2x + 2 = 4', op: { kind: 'expand-sides' } },
    { name: 'collect-like-terms', before: 'x + x = 4', after: '2x = 4', op: { kind: 'collect-like-terms' } },
    { name: 'work-out-right', before: 'x = 8 - 3', after: 'x = 5', op: { kind: 'work-out-right' } },
    { name: 'factorise', before: 'x^2 - 3x + 2 = 0', after: '(x - 1)(x - 2) = 0', op: { kind: 'factorise' } },
    { name: 'complete-square', before: 'x^2 - 2x = 0', after: '(x - 1)^2 - 1 = 0', op: { kind: 'complete-square' } }
  ]

  /**
   * Pairs where the mislabelled move is itself a true move of that label, so it is not a mislabel:
   * a square-root-pm is a factorisation; collecting the constants 8 and −3 is a collect-like-terms.
   */
  const trueAlready: ReadonlyArray<readonly [RewriteLabel, string]> = [
    ['factorise', 'square-root-pm'],
    ['collect-like-terms', 'work-out-right']
  ]

  for (const source of sources) {
    it(`the true ${source.name} move is valid under its own op, and is the baseline for the mislabels`, () => {
      expect(validateEquationEquiv(eqStep(source.before, source.after, source.op))).toBe('valid')
    })
  }

  for (const label of REWRITE_LABELS) {
    for (const source of sources) {
      if (source.op.kind === label) continue
      if (trueAlready.some(([l, s]) => l === label && s === source.name)) continue
      it(`${label} on a ${source.name} step is hidden: ${source.before} → ${source.after}`, () => {
        const step = eqStep(source.before, source.after, { kind: label })
        expect(validateEquationEquiv(step)).not.toBe('valid')
        expectHidden({ title: 't', input: source.before, steps: [step] }, `${label} mislabelled as ${source.name}`)
      })
    }
  }
})

describe('SHOULD 1: a letter other than the variable anywhere in before means no proof', () => {
  it('x + y = x + y + 1 (the y cancels in the difference) gets no empty-set proof', () => {
    const step = finishStep({
      kind: 'SolutionSetEq',
      before: 'x + y = x + y + 1',
      after: '\\text{no value of x works}',
      sentence: '',
      data: { variable: 'x', solutions: [] }
    })
    expect(validateSolutionSetEq(step)).toBe('unknown')
    expect(validateStep(step).verdict).not.toBe('valid')
  })

  it('a move on x + y = x + y + 1 is unknown, even though its arithmetic cancels', () => {
    expect(validateEquationEquiv(eqStep('x + y = x + y + 1', 'x = x + 1', { kind: 'subtract-both', term: 'y' }))).toBe('unknown')
  })
})

describe('SHOULD 3: the 300-digit limit counts every digit of a literal, leading zeros included', () => {
  it('a literal with exactly 300 digits (leading zero included) is read exactly', () => {
    const literal = `0.${'0'.repeat(298)}1`
    expect(sameState(`x = ${literal}`, `x = ${literal}`)).toBe(true)
  })

  it('a literal with 301 digits, only one of them non-zero, is refused even when identical', () => {
    const literal = `0.${'0'.repeat(299)}1`
    expect(sameState(`x = ${literal}`, `x = ${literal}`)).toBe(false)
  })
})

describe('SHOULD 2: within one kind of step, two different ops never get the same sentence', () => {
  it('every EquationEquiv op has its own sentence', () => {
    const ops: EquationOp[] = [
      { kind: 'add-both', term: '3' },
      { kind: 'add-both', term: 'x' },
      { kind: 'subtract-both', term: '3' },
      { kind: 'multiply-both', k: '2' },
      { kind: 'multiply-both', k: '-1', purpose: 'leading-positive' },
      { kind: 'divide-both', k: '2' },
      { kind: 'divide-both', k: '-2', purpose: 'leading-positive' },
      { kind: 'divide-both', k: '2', purpose: 'leading-one' },
      { kind: 'divide-both', k: '2', purpose: 'common-factor' },
      { kind: 'clear-decimals', k: '10' },
      { kind: 'clear-fractions', k: '2' },
      { kind: 'move-to-left' },
      { kind: 'expand-sides' },
      { kind: 'collect-like-terms' },
      { kind: 'work-out-right' },
      { kind: 'factorise' },
      { kind: 'complete-square' },
      { kind: 'square-root-pm', shift: '1', root: '2' },
      { kind: 'swap' },
      { kind: 'already-solved' }
    ]
    const sentences = ops.map((op) => sentenceFor(eqStep('x = 8 - 3', 'x = 5', op)))
    expect(sentences.every((s) => typeof s === 'string' && s.length > 0)).toBe(true)
    expect(new Set(sentences).size, sentences.join(' | ')).toBe(ops.length)
  })
})

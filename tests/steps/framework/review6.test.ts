// Tests for the round 6 review of ec556c69 (gpt-5.4, delta4):
// MUST 1: expand-sides writes the term-by-term expansion with NO collection, and only on a side that has a bracket
//         and changes its text (a step that expands and collects is two steps);
// MUST 2: factorise needs two non-constant factors, or a constant that is not ±1 times one factor; a side that
//         is already the product is no factorisation, and only a changed side is judged;
// MUST 3: complete-square needs a(v + p)^2 + q with a written bracket; every rewrite op is invalid when its after
//         reads the same as its before (except already-solved);
// Crash: a literal beyond the 300-digit limit is refused before any power is taken (no hang);
// SHOULD: a negative written denominator (x/(−2), \frac{x}{-2}) counts by its absolute value.

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

describe('MUST 1: expand-sides writes the term-by-term expansion, with no collection', () => {
  it('the review case: 2(x + x) = 0 → 4x = 0 is an expansion that also collects, so it is invalid', () => {
    expect(validateEquationEquiv(eqStep('2(x + x) = 0', '4x = 0', { kind: 'expand-sides' }))).not.toBe('valid')
    expectHidden({ title: 't', input: '2(x + x) = 0', steps: [eqStep('2(x + x) = 0', '4x = 0', { kind: 'expand-sides' })] }, 'expand that collects')
  })

  it('the term-by-term expansion of the same step, 2x + 2x = 0, is valid', () => {
    expect(validateEquationEquiv(eqStep('2(x + x) = 0', '2x + 2x = 0', { kind: 'expand-sides' }))).toBe('valid')
  })

  it('the expansion must be the exact multiset: 2(x + 3) = 0 → 2x + 5 = 0 is refused', () => {
    expect(validateEquationEquiv(eqStep('2(x + 3) = 0', '2x + 6 = 0', { kind: 'expand-sides' }))).toBe('valid')
    expect(validateEquationEquiv(eqStep('2(x + 3) = 0', '2x + 5 = 0', { kind: 'expand-sides' }))).not.toBe('valid')
  })

  it('a product of two brackets expands term by term: (x + 1)(x + 2) gives x^2 + 2x + x + 2, not x^2 + 3x + 2', () => {
    expect(validateEquationEquiv(eqStep('(x + 1)(x + 2) = 0', 'x^2 + 2x + x + 2 = 0', { kind: 'expand-sides' }))).toBe('valid')
    expect(validateEquationEquiv(eqStep('(x + 1)(x + 2) = 0', 'x^2 + 3x + 2 = 0', { kind: 'expand-sides' }))).not.toBe('valid')
  })

  it('expand-sides on an unchanged side is invalid: x^2 = 4 → x^2 = 4 has no bracket and no change', () => {
    expect(validateEquationEquiv(eqStep('x^2 = 4', 'x^2 = 4', { kind: 'expand-sides' }))).not.toBe('valid')
    expectHidden({ title: 't', input: 'x^2 = 4', steps: [eqStep('x^2 = 4', 'x^2 = 4', { kind: 'expand-sides' })] }, 'expand on an unchanged side')
  })

  it('a bracket that stays in the after is not an expansion: (x + 1) = 2 → (x + 1) = 2 is refused', () => {
    expect(validateEquationEquiv(eqStep('(x + 1) = 2', '(x + 1) = 2', { kind: 'expand-sides' }))).not.toBe('valid')
  })

  it('the method writes the expansion first, and collects in a second step: 2(x + x) = 0 gives two moves', () => {
    const w = router.solve({ job: 'solve', input: '2(x + x) = 0', variable: 'x' })
    expect(w.noWorking).toBeFalsy()
    const doc = renderWorkingToDoc(w)
    expect(doc.moves[0].rule).toBe('Expand brackets')
    expect(doc.moves[0].head).toBe('Expand the brackets on each side')
    expect(doc.moves[1].rule).toBe('Collect like terms')
    expect(doc.answers).toEqual([{ label: 'x', tex: '0' }])
  })
})

describe('MUST 2: factorise needs two non-constant factors, or a constant that is not ±1 times one factor', () => {
  it('the review case: x^2 + 1 = 0 → 1(x^2 + 1) = 0 is a trivial product, so it is invalid', () => {
    expect(validateEquationEquiv(eqStep('x^2 + 1 = 0', '1(x^2 + 1) = 0', { kind: 'factorise' }))).not.toBe('valid')
    expectHidden({ title: 't', input: 'x^2 + 1 = 0', steps: [eqStep('x^2 + 1 = 0', '1(x^2 + 1) = 0', { kind: 'factorise' })] }, 'factorise by 1')
  })

  it('a constant that is not ±1 times one factor is a factorisation: 2x^2 + 2 = 0 → 2(x^2 + 1) = 0 is valid', () => {
    expect(validateEquationEquiv(eqStep('2x^2 + 2 = 0', '2(x^2 + 1) = 0', { kind: 'factorise' }))).toBe('valid')
  })

  it('one factor with no constant is not a factorisation: x^2 + 1 = 0 → (x^2 + 1) = 0 is refused', () => {
    expect(validateEquationEquiv(eqStep('x^2 + 1 = 0', '(x^2 + 1) = 0', { kind: 'factorise' }))).not.toBe('valid')
  })

  it('two factors are a factorisation: x^2 - 3x + 2 = 0 → (x - 1)(x - 2) = 0 is valid', () => {
    expect(validateEquationEquiv(eqStep('x^2 - 3x + 2 = 0', '(x - 1)(x - 2) = 0', { kind: 'factorise' }))).toBe('valid')
  })

  it('the factorise sentence and rule never say "fully" or "completely" (no irreducibility is claimed)', () => {
    const step = eqStep('x^2 - 3x + 2 = 0', '(x - 1)(x - 2) = 0', { kind: 'factorise' })
    expect(sentenceFor(step)).not.toMatch(/fully|completely/i)
    expect(step.rule).not.toMatch(/fully|completely/i)
  })

  it('factorising a side that is already the product is a no-op, so invalid', () => {
    expect(validateEquationEquiv(eqStep('(x - 1)(x - 2) = 0', '(x - 1)(x - 2) = 0', { kind: 'factorise' }))).not.toBe('valid')
  })

  it('SHOULD: only the changed side is judged: x^2 - 1 = (x - 1)(x + 1) → (x - 1)(x + 1) = (x - 1)(x + 1) is valid', () => {
    expect(
      validateEquationEquiv(eqStep('x^2 - 1 = (x - 1)(x + 1)', '(x - 1)(x + 1) = (x - 1)(x + 1)', { kind: 'factorise' }))
    ).toBe('valid')
  })

  it('SHOULD: a changed side that is not a product is refused, even when the other side is a product', () => {
    expect(
      validateEquationEquiv(eqStep('x^2 - 1 = (x - 1)(x + 1)', 'x^2 - 1 = (x - 1)(x + 1)', { kind: 'factorise' }))
    ).not.toBe('valid')
    expect(validateEquationEquiv(eqStep('x^2 - 1 = 0', '(x - 1)(x + 1) = 2', { kind: 'factorise' }))).not.toBe('valid')
  })
})

describe('MUST 3: complete-square needs a written bracket, and every rewrite op changes the text', () => {
  it('the review case: x^2 + 1 = 0 → x^2 + 1 = 0 is a no-op, so invalid', () => {
    expect(validateEquationEquiv(eqStep('x^2 + 1 = 0', 'x^2 + 1 = 0', { kind: 'complete-square' }))).not.toBe('valid')
    expectHidden({ title: 't', input: 'x^2 + 1 = 0', steps: [eqStep('x^2 + 1 = 0', 'x^2 + 1 = 0', { kind: 'complete-square' })] }, 'complete-square no-op')
  })

  it('a written bracket is the form: x^2 + 1 = 0 → (x)^2 + 1 = 0 is accepted; a bare x^2 + q is not a completed square', () => {
    expect(validateEquationEquiv(eqStep('x^2 + 1 = 0', '(x)^2 + 1 = 0', { kind: 'complete-square' }))).toBe('valid')
    expect(validateEquationEquiv(eqStep('x^2 - 2x = 0', 'x^2 - 2x + 1 - 1 = 0', { kind: 'complete-square' }))).not.toBe('valid')
  })

  it('the completed square with p ≠ 0 is valid: x^2 - 2x = 0 → (x - 1)^2 - 1 = 0', () => {
    expect(validateEquationEquiv(eqStep('x^2 - 2x = 0', '(x - 1)^2 - 1 = 0', { kind: 'complete-square' }))).toBe('valid')
  })
})

describe('every rewrite op is invalid when its after reads the same as its before (already-solved excepted)', () => {
  const noOps: { label: string; step: Step }[] = [
    { label: 'expand-sides', step: eqStep('(x + 1) = 2', '(x + 1) = 2', { kind: 'expand-sides' }) },
    { label: 'collect-like-terms', step: eqStep('x + x = 4', 'x + x = 4', { kind: 'collect-like-terms' }) },
    { label: 'work-out-right', step: eqStep('x = 8 - 3', 'x = 8 - 3', { kind: 'work-out-right' }) },
    { label: 'factorise', step: eqStep('(x - 1)(x + 1) = 0', '(x - 1)(x + 1) = 0', { kind: 'factorise' }) },
    { label: 'complete-square', step: eqStep('(x - 1)^2 - 1 = 0', '(x - 1)^2 - 1 = 0', { kind: 'complete-square' }) },
    { label: 'square-root-pm', step: eqStep('(x - 3)(x + 1) = 0', '(x - 3)(x + 1) = 0', { kind: 'square-root-pm', shift: '1', root: '2' }) }
  ]

  for (const { label, step } of noOps) {
    it(`${label} with the same text on both sides is invalid, and hidden in the rendered output`, () => {
      expect(validateEquationEquiv(step)).not.toBe('valid')
      expectHidden({ title: 't', input: String(step.before), steps: [step] }, `${label} no-op`)
    })
  }

  it('already-solved with the same text is the one op that may keep the text (x = 2 → x = 2 is valid)', () => {
    expect(validateEquationEquiv(eqStep('x = 2', 'x = 2', { kind: 'already-solved' }))).toBe('valid')
  })
})

describe('crash: a literal beyond the 300-digit limit is refused before any power is taken', () => {
  const huge = `0.${'0'.repeat(1000000)}1`

  it('a million-digit decimal input is refused quickly: the working is not shown and nothing hangs', () => {
    const t0 = Date.now()
    const w = router.solve({ job: 'solve', input: `${huge}x = 1`, variable: 'x' })
    expect(Date.now() - t0).toBeLessThan(5000)
    expect(w.noWorking).toBe(true)
    expect(w.steps).toHaveLength(0)
  })

  it('a clearing step on a million-digit decimal is refused quickly, and is never valid', () => {
    const t0 = Date.now()
    const step = eqStep(`${huge}x = 1`, `${huge}x = 1`, { kind: 'clear-decimals', k: '10' })
    expect(validateStep(step).verdict).not.toBe('valid')
    expect(Date.now() - t0).toBeLessThan(5000)
  })
})

describe('SHOULD: a negative written denominator counts by its absolute value', () => {
  it('x/(-2) = 1 clears by 2 (the LCD of |−2|): 2·(x/(−2)) = −x, so the after is −x = 2', () => {
    expect(validateEquationEquiv(eqStep('x/(-2) = 1', '-x = 2', { kind: 'clear-fractions', k: '2' }))).toBe('valid')
  })

  it('the same with a LaTeX fraction: \\frac{x}{-2} = 1 clears by 2', () => {
    expect(validateEquationEquiv(eqStep('\\frac{x}{-2} = 1', '-x = 2', { kind: 'clear-fractions', k: '2' }))).toBe('valid')
  })

  it('the multiplier is the positive LCD: k = -2 is refused for x/(-2) = 1', () => {
    expect(validateEquationEquiv(eqStep('x/(-2) = 1', 'x = -2', { kind: 'clear-fractions', k: '-2' }))).not.toBe('valid')
  })

  it('the method solves x/(-2) = 1 through a fraction step, and answers x = -2', () => {
    const w = router.solve({ job: 'solve', input: 'x/(-2) = 1', variable: 'x' })
    expect(w.noWorking).toBeFalsy()
    expect(renderWorkingToDoc(w).moves[0].rule).toBe('Clear the fractions')
    expect(renderWorkingToDoc(w).answers).toEqual([{ label: 'x', tex: '-2' }])
  })
})

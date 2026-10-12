// P-FIX-S1SOUND2: the step checker's defences against forged or buggy workings, from the independent adversarial
// attack on math/steps at 7cb5f7cd (polish/reviews/steps-attack/REPORT.md). Each MUST below is the attacker's own case:
// it was valid, rendered, slow or a throw before the fix.

import { describe, expect, it } from 'vitest'
import { validateCaseSplitComplete, validateImplication, validateStep, validateWorking } from '../../../src/renderer/src/math/steps/validate'
import { displaySafe, renderWorkingToDoc } from '../../../src/renderer/src/math/steps/render'
import { createStepRouter } from '../../../src/renderer/src/math/steps/router'
import { finishStep, systemEndingAnswer } from '../../../src/renderer/src/math/steps/sentences'
import { S1A_METHODS } from '../../../src/renderer/src/math/steps/methods'
import { linearSystemEliminationMethod, linearSystemSubstitutionMethod } from '../../../src/renderer/src/math/steps/methods/linearSystem'
import { factoriseMethod } from '../../../src/renderer/src/math/steps/methods/factorise'
import type { EquationOp, ExprOp, Step, Working } from '../../../src/renderer/src/math/steps/types'

const R = String.raw
const eq = (before: string, after: string, op: EquationOp, v = 'x'): Step =>
  finishStep({ kind: 'EquationEquiv', op, before, after, sentence: '', data: { variable: v } })
const step = (s: Omit<Step, 'sentence'>): Step => finishStep({ ...s, sentence: '' } as Step)
const shown = (w: Working): boolean => validateWorking(w).valid
const linear = createStepRouter([...S1A_METHODS])
const systems = createStepRouter([linearSystemEliminationMethod, linearSystemSubstitutionMethod])

describe('MUST 1: a case split in the inequality form checks nothing, so it is never shown', () => {
  it('x² − 4 = 0 split into x ≥ 0 and x < 0 cannot turn into x² + 4 = 0', () => {
    const split = step({ kind: 'CaseSplitComplete', before: 'x^2 - 4 = 0', after: 'x^2 + 4 = 0', data: { cases: ['x >= 0', 'x < 0'], variable: 'x' } })
    expect(validateCaseSplitComplete(split)).not.toBe('valid')
    expect(validateStep(split).verdict).not.toBe('valid')
  })
  it('nor 2x = 4 into x = 7', () => {
    const split = step({ kind: 'CaseSplitComplete', before: '2x = 4', after: 'x = 7', data: { cases: ['x >= 0', 'x < 0'] } })
    expect(validateCaseSplitComplete(split)).not.toBe('valid')
  })
})

describe('MUST 2: an Implication may not multiply by 0, and "every real number" never follows a one-way step', () => {
  it('x + 1 = 3 times 0 is refused', () => {
    expect(validateImplication(step({ kind: 'Implication', before: 'x + 1 = 3', after: '0 = 0', data: { action: 'multiply', multiplier: '0' } }))).not.toBe('valid')
    expect(validateImplication(step({ kind: 'Implication', before: 'x + 1 = 3', after: '0 = 0', data: { action: 'multiply', multiplier: 'x - x' } }))).not.toBe('valid')
  })
  it('x = −x squared is x² = x², but "every real number" is not its answer', () => {
    const w: Working = {
      input: 'x = -x',
      steps: [
        step({ kind: 'Implication', before: 'x = -x', after: 'x^2 = x^2', data: { action: 'square' } }),
        eq('x^2 = x^2', '0 = 0', { kind: 'subtract-both', term: 'x^2' }),
        step({ kind: 'SolutionSetEq', before: '0 = 0', after: R`\text{every real number}`, data: { variable: 'x', solutions: [], allReals: true } })
      ],
      answer: { label: 'x', tex: R`\text{every real number}` }
    }
    expect(shown(w)).toBe(false)
  })
})

describe('MUST 3: a working with steps must give its answer, so the substitution is never skipped', () => {
  it('x = −2 squared: x² = 4 gives x = ±2 with no answer — hidden', () => {
    const w: Working = {
      input: 'x = -2',
      steps: [
        step({ kind: 'Implication', before: 'x = -2', after: 'x^2 = 4', data: { action: 'square' } }),
        step({ kind: 'SolutionSetEq', before: 'x^2 = 4', after: R`x = -2 \text{ or } x = 2`, data: { variable: 'x', solutions: ['-2', '2'] } })
      ]
    }
    expect(shown(w)).toBe(false)
  })
})

describe('MUST 4: an Implication says the move it makes', () => {
  it('"Square both sides" on x − 3 = 0 → 2x − 6 = 0 is refused, though the two are equivalent', () => {
    expect(validateImplication(step({ kind: 'Implication', before: 'x - 3 = 0', after: '2x - 6 = 0', data: { action: 'square' } }))).not.toBe('valid')
  })
  it('"Multiply both sides by 5" when the after is twice the before is refused', () => {
    expect(validateImplication(step({ kind: 'Implication', before: 'x - 3 = 0', after: '2x - 6 = 0', data: { action: 'multiply', multiplier: '5' } }))).not.toBe('valid')
  })
  it('"Put a, b and c into the quadratic formula" is not a move the checker can prove here', () => {
    expect(validateImplication(step({ kind: 'Implication', before: 'x^2 - 5x + 6 = 0', after: '2x^2 - 10x + 12 = 0', data: { action: 'quadratic-formula' } }))).not.toBe('valid')
  })
})

describe('MUST 5: every purpose clause and every claim in a sentence is proved', () => {
  const refused = (before: string, after: string, op: EquationOp) => expect(validateStep(eq(before, after, op)).verdict).not.toBe('valid')
  it('× −1 "so the x² term is positive", when it is now negative', () => refused('x^2 - 1 = 0', '-x^2 + 1 = 0', { kind: 'multiply-both', k: '-1', purpose: 'leading-positive' }))
  it('÷ 2 "so the x² term is 1", when it is 3/2', () => refused('3x^2 + 3 = 0', '3/2 x^2 + 3/2 = 0', { kind: 'divide-both', k: '2', purpose: 'leading-one' }))
  it('÷ 3 "by the common factor 3" on x + 1 = 2', () => refused('x + 1 = 2', 'x/3 + 1/3 = 2/3', { kind: 'divide-both', k: '3', purpose: 'common-factor' }))
  it('÷ −2 "so the x² term is positive" on a linear equation', () => refused('-2x = 4', 'x = -2', { kind: 'divide-both', k: '-2', purpose: 'leading-positive' }))
  it('"Factorise 0 as 0" when only the right side changed', () => refused('0 = x^2 - 1', '0 = (x - 1)(x + 1)', { kind: 'factorise' }))
  it('× 10 "to clear the decimals" when a decimal remains', () => refused('0.25x = 1', '2.5x = 10', { kind: 'clear-decimals', k: '10' }))
  it('"Take the square root" of x² − 5x + 6 = 0, which is no square', () =>
    refused('x^2 - 5x + 6 = 0', R`\left(x - 2\right)\left(x - 3\right) = 0`, { kind: 'square-root-pm', shift: '5/2', root: '1/2' }))
  it('"2x² + 4 cannot be factorised using rational numbers", when it is 2(x² + 2)', () => {
    const op: ExprOp = { kind: 'irreducible' }
    const s = step({ kind: 'ExprEq', op, before: '2x^2 + 4', after: '2x^2 + 4', data: { variable: 'x', factorsBefore: ['2x^2 + 4'], factorsAfter: ['2x^2 + 4'], index: 0, width: 1 } })
    expect(validateStep(s).verdict).not.toBe('valid')
  })
  it('the real moves still pass: × −1 to make −x² positive, ÷ 2 to make 2x² one, ÷ 3 by a true common factor', () => {
    expect(validateStep(eq('-x^2 + 1 = 0', 'x^2 - 1 = 0', { kind: 'multiply-both', k: '-1', purpose: 'leading-positive' })).verdict).toBe('valid')
    expect(validateStep(eq('2x^2 - 8 = 0', 'x^2 - 4 = 0', { kind: 'divide-both', k: '2', purpose: 'leading-one' })).verdict).toBe('valid')
    expect(validateStep(eq('3x^2 + 6x + 3 = 0', 'x^2 + 2x + 1 = 0', { kind: 'divide-both', k: '3', purpose: 'common-factor' })).verdict).toBe('valid')
  })
})

describe('MUST 6: what is drawn is what was checked', () => {
  it('displaySafe refuses what KaTeX would draw differently', () => {
    for (const t of ['x = 5%', 'x = 0x10', 'x = 1e-5', 'x**2 = 4', 'x = 2E3']) expect(displaySafe(t), t).toBe(false)
    for (const t of ['x^2 = 4', 'x^{10} = 1', R`x = \frac{1}{2}`, R`x = -3 \text{ or } x = 2`]) expect(displaySafe(t), t).toBe(true)
  })
  it('a working that shows 5% is hidden; x^10 is drawn as x^{10}', () => {
    expect(shown({ input: 'x = 5%', steps: [eq('x = 5%', 'x = 5%', { kind: 'already-solved' })], answer: { label: 'x', tex: '5%' } })).toBe(false)
    const doc = renderWorkingToDoc(linear.solve({ job: 'solve', input: 'x^10 = x^10 + x - 3', variable: 'x' }))
    for (const m of doc.moves) expect(m.tex ?? '').not.toMatch(/\^\d{2,}/)
  })
})

describe('MUST 7: every sub-working is validated, in every path', () => {
  it('a system working with a hand-typed sub-working is hidden', () => {
    const w = systems.solve({ job: 'solve', input: 'x + y = 3, x - y = 1' })
    expect(shown(w)).toBe(true)
    const forged: Working = { ...w, subWorkings: [{ input: '2x = 4', steps: [eq('2x = 4', 'x = 3', { kind: 'divide-both', k: '2' })], answer: { label: 'x', tex: '3' } }] }
    expect(shown(forged)).toBe(false)
  })
  it('the can’t-show fallback may carry no sub-workings', () => {
    const w: Working = { steps: [], noWorking: true, reason: "I can't show the steps for this one yet", subWorkings: [{ input: '2x = 4', steps: [eq('2x = 4', 'x = 3', { kind: 'divide-both', k: '2' })] }] }
    expect(shown(w)).toBe(false)
  })
})

describe('MUST 8: sub-workings belong to their parent, and no free text reaches the page', () => {
  it('a discriminant sub-working for other a, b, c is hidden', () => {
    const w = linear.solve({ job: 'solve', input: 'x^2 + x + 1 = 0', variable: 'x' })
    const formula = [w, w.anotherWay].find((x) => x?.method === 'Quadratic formula') ?? w
    expect(shown(formula)).toBe(true)
    const sub = formula.subWorkings![0]
    const other = R`(4)^2 - 4 \cdot 0 \cdot (0)`
    const forgedSub: Working = { ...sub, input: other, steps: [step({ kind: 'ExprEq', before: other, after: '16', data: { role: 'discriminant', a: '0', b: '4', c: '0' } })] }
    expect(shown({ ...formula, subWorkings: [forgedSub] })).toBe(false)
  })
  it('a case sub-working that solves another equation is hidden', () => {
    const w = linear.solve({ job: 'solve', input: 'x^2 - 7x + 12 = 0', variable: 'x' })
    expect(w.method).toBe('Factorising')
    const other = linear.solve({ job: 'solve', input: 'x - 5 = 0', variable: 'x' })
    expect(shown({ ...w, subWorkings: [other, w.subWorkings![1]] })).toBe(false)
  })
  it('notes, subgoals and a forged title never reach the page', () => {
    const w = linear.solve({ job: 'solve', input: '2x + 4 = 10', variable: 'x' })
    const forged: Working = { ...w, title: 'x = 9 is the answer', steps: w.steps.map((s) => ({ ...s, note: 'so x = 3', subgoal: 'x = 9 is the answer' })) }
    const doc = renderWorkingToDoc(forged)
    expect(JSON.stringify(doc)).not.toMatch(/x = 9 is the answer|so x = 3/)
  })
})

describe('MUST 9: the can’t-show branch shows no answer', () => {
  it('{steps: [], noWorking, answer x = 3} renders no answer', () => {
    const doc = renderWorkingToDoc({ steps: [], noWorking: true, reason: "I can't show the steps for this one yet", answer: { label: 'x', tex: '3' }, checked: 'ok' })
    expect(doc.answers).toEqual([])
  })
})

describe('MUST 10: π and e are numbers, not unknowns, in a system', () => {
  it.each(['π + x = 3, π - x = 1', 'pi + x = 3, pi - x = 1', 'x + 2*pi = 3, x - y = 1', 'e + y = 3, e - y = 1'])('%s is not solved for π or e', (input) => {
    const doc = renderWorkingToDoc(systems.solve({ job: 'solve', input }))
    expect(JSON.stringify(doc.answers)).not.toMatch(/"label":"(π|pi|e)"/)
    expect(JSON.stringify(doc)).not.toMatch(/infinitely many|every pair/)
  })
})

describe('MUST 11: one equation left in three letters is a plane, not a line', () => {
  it('x + y + z = 1, 2x + 2y + 2z = 2, 3x + 3y + 3z = 3', () => {
    const doc = renderWorkingToDoc(systems.solve({ job: 'solve', input: 'x + y + z = 1, 2x + 2y + 2z = 2, 3x + 3y + 3z = 3' }))
    const text = JSON.stringify(doc)
    expect(text).not.toMatch(/on the line/)
    expect(text).toMatch(/plane/)
  })
  it('the words: a line in two letters, a plane in three', () => {
    expect(systemEndingAnswer({ kind: 'infinitely-many', rows: [0], texts: ['x + y = 1'] }, 2)).toMatch(/on the line x \+ y = 1/)
    expect(systemEndingAnswer({ kind: 'infinitely-many', rows: [0], texts: ['x + y + z = 1'] }, 3)).toMatch(/on the plane x \+ y \+ z = 1/)
  })
})

describe('MUST 12: the rational-root search has a budget', () => {
  it.each(['735134400x^3 + x + 735134400', '97772875200x^3 + x + 97772875200'])('factorising %s answers within 2 s', (input) => {
    const router = createStepRouter([factoriseMethod])
    const t0 = performance.now()
    router.solve({ job: 'factor', input, variable: 'x' })
    expect(performance.now() - t0).toBeLessThan(2000)
  })
})

describe('MUST 13: nothing throws, whatever the data holds', () => {
  const forged: Working = {
    input: 'x^2 - 4 = 0',
    steps: [step({ kind: 'CaseSplitComplete', before: 'x^2 - 4 = 0', after: 'x^2 - 4 = 0', data: { cases: [2n, { n: 1n, d: 2n }] } })]
  }
  it('validateWorking and renderWorkingToDoc answer', () => {
    expect(() => validateWorking(forged)).not.toThrow()
    expect(() => renderWorkingToDoc(forged)).not.toThrow()
    expect(validateWorking(forged).valid).toBe(false)
  })
  it('the router keeps a method that returns such a working out, and does not throw', () => {
    const router = createStepRouter([{ id: 'bad', name: 'Bad', appliesTo: () => true, solve: () => forged }])
    expect(() => router.solve({ job: 'solve', input: 'x^2 - 4 = 0', variable: 'x' })).not.toThrow()
  })
})

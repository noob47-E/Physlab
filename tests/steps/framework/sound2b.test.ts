// P-FIX-S1SOUND2, the hardening's own cases: the converter, the system reader's constants and cancelled letters, the
// answer value and the Another way tied to the problem, the tree limits, the input budget, the one-sided deduction with no
// move declared, the endings drawn as text, and nothing thrown on malformed data. Each case is a forged or buggy working
// the attack described, or the control that must stay valid.

import { describe, expect, it } from 'vitest'
import { displaySafe, drawnTex } from '../../../src/renderer/src/math/steps/displaySafe'
import { readSystem } from '../../../src/renderer/src/math/steps/check-adapter'
import { createStepRouter } from '../../../src/renderer/src/math/steps/router'
import { S1A_METHODS } from '../../../src/renderer/src/math/steps/methods'
import { linearSystemEliminationMethod, linearSystemSubstitutionMethod } from '../../../src/renderer/src/math/steps/methods/linearSystem'
import { validateImplication, validateStep, validateWorking } from '../../../src/renderer/src/math/steps/validate'
import { renderWorkingToDoc } from '../../../src/renderer/src/math/steps/render'
import { finishStep } from '../../../src/renderer/src/math/steps/sentences'
import type { Step, Working } from '../../../src/renderer/src/math/steps/types'

const linear = createStepRouter([...S1A_METHODS])
const systems = createStepRouter([linearSystemEliminationMethod, linearSystemSubstitutionMethod])
const clone = (w: Working): Working => JSON.parse(JSON.stringify(w)) as Working

describe('the converter: a power of more than one character is braced, the number unchanged', () => {
  it('10^18 and 10^(-18) are drawn braced, x^2 is left as it is', () => {
    expect(drawnTex('10^18')).toBe('10^{18}')
    expect(drawnTex('1*10^(-18)')).toBe('1*10^{(-18)}')
    expect(drawnTex('x^2 - 10x')).toBe('x^2 - 10x')
    expect(displaySafe(drawnTex('(1/(2*10^18))*x - 5'))).toBe(true)
  })

  it('what the converter leaves must still be safe to draw: a percent, a hex literal, a glued name, a bare brace', () => {
    expect(displaySafe(drawnTex('x = 5%'))).toBe(false)
    expect(displaySafe(drawnTex('x = 0x10'))).toBe(false)
    expect(displaySafe(drawnTex('x2 = 4'))).toBe(false)
    expect(displaySafe(drawnTex('x = {2}'))).toBe(false)
    expect(displaySafe('x \\in \\{2, 3\\}')).toBe(true)
    expect(displaySafe('x^{-2}')).toBe(true)
  })
})

describe('the system reader: a constant is never an unknown, and a cancelled letter is never dropped', () => {
  it('π, pi and e are refused as letters of a system', () => {
    expect(readSystem('π + x = 3, π - x = 1')).toBeNull()
    expect(readSystem('pi + x = 3, pi - x = 1')).toBeNull()
    expect(readSystem('e + y = 3, e - y = 1')).toBeNull()
  })

  it('a letter that cancels out of every equation is refused, not silently left free', () => {
    expect(readSystem('x + y - y = 2, x = 2')).toBeNull()
  })

  it('an ordinary system is still read', () => {
    expect(readSystem('x + y = 3, x - y = 1')).not.toBeNull()
  })
})

describe('an answer and an Another way are tied to the problem', () => {
  it('the value of a system answer must be the number its label is solved to', () => {
    const w = systems.solve({ job: 'solve', input: 'x + y = 3, x - y = 1' })
    expect(validateWorking(w).valid).toBe(true)
    const forged = clone(w)
    forged.answer = [
      { label: 'x', tex: '2', value: '7' },
      { label: 'y', tex: '1' }
    ]
    expect(validateWorking(forged).valid).toBe(false)
  })

  it('an Another way that solves a different equation is refused', () => {
    const w = linear.solve({ job: 'solve', input: '2x = 4', variable: 'x' })
    expect(validateWorking(w).valid).toBe(true)
    const other = linear.solve({ job: 'solve', input: '3x = 9', variable: 'x' })
    expect(validateWorking({ ...w, anotherWay: other }).valid).toBe(false)
  })
})

describe('the tree is measured once: deep and cyclic workings are refused fast', () => {
  it('a 20,000-deep tree and a cycle are refused in well under two seconds', () => {
    const base = linear.solve({ job: 'solve', input: '2x = 4', variable: 'x' })
    let deep: Working = base
    for (let i = 0; i < 20000; i++) deep = { ...deep, subWorkings: [deep] }
    const t0 = performance.now()
    expect(validateWorking(deep).valid).toBe(false)
    expect(renderWorkingToDoc(deep).moves).toHaveLength(0)
    const cyc: Working = { ...base }
    cyc.subWorkings = [cyc]
    expect(validateWorking(cyc).valid).toBe(false)
    expect(performance.now() - t0).toBeLessThan(2000)
  })

  it('an input of three thousand nested brackets is declined by the router at once', () => {
    const input = `${'('.repeat(3000)}x${')'.repeat(3000)} = 1`
    const t0 = performance.now()
    const w = linear.solve({ job: 'solve', input, variable: 'x' })
    expect(w.noWorking).toBe(true)
    expect(performance.now() - t0).toBeLessThan(2000)
  })
})

describe('a one-sided deduction with no declared move', () => {
  it('an equivalence with no move named is valid as a deduction, and no move is claimed', () => {
    // As a deduction it is true; the words, if any, must be the builder's, so a step with no move names none (step level).
    const step = { kind: 'Implication', before: 'x + 1 = 3', after: 'x + 1 = 3', sentence: 'Equivalent deduction' } as unknown as Step
    expect(validateImplication(step)).toBe('valid')
    expect(validateStep(step).verdict).toBe('invalid')
  })

  it('the same step naming a move it does not make is refused', () => {
    const step: Step = finishStep({ kind: 'Implication', before: 'x - 3 = 0', after: '2x - 6 = 0', sentence: '', data: { action: 'square' } })
    expect(validateStep(step).verdict).not.toBe('valid')
  })
})

describe('the endings are drawn as text, and a line the checks cannot read is refused', () => {
  it('a system ending is the text \\text{...} on its line and its answer', () => {
    const w = systems.solve({ job: 'solve', input: 'x + y = 2, 2x + 2y = 4' })
    const last = w.steps[w.steps.length - 1]
    expect(String(last.after).startsWith('\\text{')).toBe(true)
    expect(String(w.answer && (Array.isArray(w.answer) ? w.answer[0] : w.answer).tex).startsWith('\\text{')).toBe(true)
    expect(validateWorking(w).valid).toBe(true)
  })

  it('a line with no working gives nothing: an unreadable line is refused, never shown', () => {
    const w: Working = {
      input: 'x = 5',
      steps: [finishStep({ kind: 'EquationEquiv', op: { kind: 'already-solved' }, before: 'x = 5', after: 'x = 5%', sentence: '', data: { variable: 'x' } })],
      answer: { label: 'x', tex: '5%' }
    }
    expect(validateWorking(w).valid).toBe(false)
    expect(renderWorkingToDoc(w).moves).toHaveLength(0)
  })
})

describe('nothing is thrown, whatever the data holds', () => {
  it('malformed workings are refused, and the page shows nothing for them', () => {
    const bad = [
      { input: 'x = 1', steps: 5 },
      { input: 'x = 1', steps: [null] },
      { input: 'x = 1', steps: [], subWorkings: [null] },
      { input: 'x = 1', steps: [], anotherWay: 7 }
    ] as unknown as Working[]
    for (const w of bad) {
      expect(() => validateWorking(w)).not.toThrow()
      expect(() => renderWorkingToDoc(w)).not.toThrow()
      expect(validateWorking(w).valid).toBe(false)
    }
  })
})

describe('the router and the page: no word or number a working carries reaches the page unchecked', () => {
  it('a forged title and a forged method name are not drawn', () => {
    const w = linear.solve({ job: 'solve', input: '2x = 4', variable: 'x' })
    const doc = renderWorkingToDoc({ ...w, title: 'x = 9 is the answer', method: 'anything the working says' }, { job: 'solve', input: '2x = 4' })
    expect(JSON.stringify(doc)).not.toMatch(/x = 9 is the answer|anything the working says/)
    expect(doc.method).toBeUndefined()
  })
})

// Review round 1 of P-FIX-S1SOUND2 (gpt-5.4, one call): the cases the review named, each tested before its fix.
describe('review round 1: the can’t-show page draws no unsafe input, and a discriminant needs a quadratic parent', () => {
  it('the can’t-show page does not draw an input that is not displaySafe (x_1 = 2)', () => {
    const doc = renderWorkingToDoc({ input: 'x_1 = 2', steps: [], noWorking: true, reason: "I can't show the steps for this one yet" })
    expect(doc.input).not.toMatch(/_/)
    expect(JSON.stringify(doc)).not.toMatch(/x_1/)
  })

  it('a discriminant sub-working for a linear equation (a = 0) is refused', () => {
    const w = linear.solve({ job: 'solve', input: '2x + 2 = 0', variable: 'x' })
    expect(validateWorking(w).valid).toBe(true)
    const fake = finishStep({ kind: 'ExprEq', before: '(2)^2 - 4 \\cdot 0 \\cdot (2)', after: '4', sentence: '', data: { role: 'discriminant', a: '0', b: '2', c: '2' } })
    const forged: Working = { ...w, subWorkings: [{ title: 'Discriminant', input: '(2)^2 - 4 \\cdot 0 \\cdot (2)', steps: [fake] }] }
    expect(validateWorking(forged).valid).toBe(false)
    expect(renderWorkingToDoc(forged).moves).toHaveLength(0)
  })

  it('an answer with no tex is refused (a value alone is never drawn unchecked)', () => {
    const w = linear.solve({ job: 'solve', input: '2x = 4', variable: 'x' })
    const forged: Working = { ...w, answer: { label: 'x', value: '10^18' } as never }
    expect(validateWorking(forged).valid).toBe(false)
  })

  it('a deduction that ends in a solution set with no answer is refused, whatever the input text', () => {
    const step = finishStep({ kind: 'SolutionSetEq', before: 'x^2 - 1', after: 'x = 1 \text{ or } x = -1', sentence: '', data: { variable: 'x', solutions: ['1', '-1'] } })
    const w: Working = { input: 'x^2 - 1', steps: [step] }
    expect(validateWorking(w).valid).toBe(false)
  })

  it('a sub-working that points to its parent through the Another way does not hang the router', () => {
    const base = linear.solve({ job: 'solve', input: '2x = 4', variable: 'x' })
    const loop: Working = { ...base }
    loop.anotherWay = loop
    const t0 = performance.now()
    const m = { id: 'loop', name: 'Loop', appliesTo: () => true, solve: () => loop }
    const w = createStepRouter([m]).solve({ job: 'solve', input: '2x = 4', variable: 'x' })
    expect(w.noWorking).toBe(true)
    expect(performance.now() - t0).toBeLessThan(2000)
  })

  it('a subscript is not drawn: the validator does not read x_{1}, so the line is refused', () => {
    expect(displaySafe('x_{1} = 2')).toBe(false)
  })
})

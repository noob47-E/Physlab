// Tests for the step validation framework (S0).
//
// Rule 0.2: Only 'valid' steps are ever shown.
// Tests every step kind:
// - A right step -> 'valid' (its sentence and rule are the ones the builder gives from its typed data)
// - Planted wrong steps -> 'invalid' or 'unknown', NEVER 'valid' (at least 15 per kind)

import { describe, it, expect } from 'vitest'
import {
  validateStep,
  validateExprEq,
  validateEquationEquiv,
  validateImplication,
  validateCaseSplitComplete,
  validateSolutionSetEq,
  validateSubproblemReduction,
  validateWorking
} from '../../../src/renderer/src/math/steps/validate'
import { finishStep } from '../../../src/renderer/src/math/steps/sentences'
import type { EquationOp, Step, Working } from '../../../src/renderer/src/math/steps/types'

/** A step with the sentence and rule its typed data gives (the builder, never typed here). */
const built = (step: Omit<Step, 'sentence'> & { sentence?: string }): Step => finishStep({ sentence: '', ...step } as Step)

describe('Step validation framework', () => {
  describe('ExprEq steps', () => {
    it('accepts mathematically equivalent expression steps as valid', () => {
      const validCases = [
        { before: '2*x + 3*x', after: '5*x' },
        { before: 'x^2 - 1', after: '(x - 1)*(x + 1)' },
        { before: '(x + 2)^2', after: 'x^2 + 4*x + 4' },
        { before: '3*(x + y)', after: '3*x + 3*y' },
        { before: '4*x - 2*x + 7', after: '2*x + 7' }
      ]

      for (const c of validCases) {
        const step = built({ kind: 'ExprEq', ...c })
        expect(validateExprEq(step)).toBe('valid')
        expect(validateStep(step).verdict).toBe('valid')
      }
    })

    it('rejects at least 15 planted wrong ExprEq steps (never valid)', () => {
      const planted = [
        { before: 'x + 1', after: 'x + 2' },
        { before: '2*x', after: '3*x' },
        { before: 'x^2 - 4', after: '(x - 2)^2' },
        { before: 'x^2 + 1', after: '(x + 1)^2' },
        { before: '3*(x + 1)', after: '3*x + 1' },
        { before: '-(x - 5)', after: '-x - 5' },
        { before: 'x^2 - y^2', after: '(x - y)^2' },
        { before: '4*x - 7', after: '4*x + 7' },
        { before: '2*x + 3', after: '2*x - 3' },
        { before: 'x^3 - 1', after: '(x - 1)^3' },
        { before: '5*x + 10', after: '5*(x + 5)' },
        { before: '2*(3*x - 4)', after: '6*x - 4' },
        { before: 'x + y + z', after: 'x + y - z' },
        { before: '(x + 1)*(x + 2)', after: 'x^2 + 2*x + 2' },
        { before: '(2*x + 1)^2', after: '4*x^2 + 1' },
        { before: 'x', after: 'x + 1' }
      ]

      expect(planted.length).toBeGreaterThanOrEqual(15)

      for (const p of planted) {
        const step = built({ kind: 'ExprEq', before: p.before, after: p.after })
        const verdict = validateExprEq(step)
        expect(verdict, `Planted wrong step '${p.before} -> ${p.after}' must not be valid`).not.toBe('valid')
      }
    })

    it('a sentence that is not the builder\'s is invalid, even for a right step', () => {
      const step = built({ kind: 'ExprEq', before: '2*x + 3*x', after: '5*x' })
      expect(validateStep({ ...step, sentence: 'Combine like terms' }).verdict).toBe('invalid')
      expect(validateStep({ ...step, rule: 'Combine like terms' }).verdict).toBe('invalid')
    })
  })

  describe('EquationEquiv steps', () => {
    it('accepts equivalent equations as valid', () => {
      const validCases: { before: string; after: string; op: EquationOp }[] = [
        { before: '2*x + 4 = 10', after: '2*x = 6', op: { kind: 'subtract-both', term: '4' } },
        { before: '2*x = 6', after: 'x = 3', op: { kind: 'divide-both', k: '2' } },
        { before: '3*x - 5 = x + 1', after: '2*x - 5 = 1', op: { kind: 'subtract-both', term: 'x' } },
        { before: '2*x - 5 = 1', after: '2*x = 6', op: { kind: 'add-both', term: '5' } },
        { before: '4*x = 8', after: 'x = 2', op: { kind: 'divide-both', k: '4' } }
      ]

      for (const c of validCases) {
        const step = built({ kind: 'EquationEquiv', ...c })
        expect(validateEquationEquiv(step)).toBe('valid')
        expect(validateStep(step).verdict).toBe('valid')
      }
    })

    it('rejects at least 15 planted wrong EquationEquiv steps (never valid)', () => {
      const planted = [
        { before: '2*x + 4 = 10', after: '2*x = 10' },
        { before: '3*x = 9', after: 'x = 6' },
        { before: 'x + 5 = 12', after: 'x = 17' },
        { before: '4*x = 20', after: 'x = 4' },
        { before: '2*x + 3 = 7', after: '2*x = 10' },
        { before: '5*x = 0', after: 'x = 5' },
        { before: 'x - 4 = 10', after: 'x = 6' },
        { before: '2*x = 8', after: '0 = 0' },
        { before: '3*x + 6 = 12', after: '3*x = 18' },
        { before: 'x = 4', after: 'x = -4' },
        { before: '2*x + 1 = x + 5', after: 'x + 1 = 6' },
        { before: '3*x = 15', after: '3*x = 12' },
        { before: 'x = 2', after: '2*x = 2' },
        { before: 'x + 2 = 5', after: 'x + 3 = 5' },
        { before: '2*x - 8 = 0', after: '2*x = -8' },
        { before: '4*x = 12', after: 'x = 0' }
      ]

      expect(planted.length).toBeGreaterThanOrEqual(15)

      for (const p of planted) {
        const step = built({
          kind: 'EquationEquiv',
          op: { kind: 'subtract-both', term: '1' },
          before: p.before,
          after: p.after
        })
        const verdict = validateEquationEquiv(step)
        expect(verdict, `Planted wrong equation move '${p.before} -> ${p.after}' must not be valid`).not.toBe('valid')
      }
    })

    it('returns unknown for a move with no declared op', () => {
      const step: Step = {
        kind: 'EquationEquiv',
        before: '(x - 1)^2 = 0',
        after: 'x - 1 = 0',
        sentence: 'Reduce multiplicity'
      }
      expect(validateEquationEquiv(step)).toBe('unknown')
    })
  })

  describe('Implication steps', () => {
    it('accepts sound forward deductions as valid', () => {
      const validCases = [
        { before: 'x = 3', after: 'x^2 = 9', data: { action: 'square' } },
        { before: 'x - 1 = 2', after: '(x - 1)^2 = 4', data: { action: 'square' } },
        { before: 'x = 4', after: '2*x = 8', data: { action: 'multiply', multiplier: '2' } }
      ]

      for (const c of validCases) {
        const step = built({ kind: 'Implication', ...c })
        expect(validateImplication(step)).toBe('valid')
        expect(validateStep(step).verdict).toBe('valid')
      }
    })

    it('an equivalent deduction with no declared sentence is valid as a deduction, but shows no words', () => {
      const step: Step = { kind: 'Implication', before: '2*x = 6', after: 'x = 3', sentence: 'Equivalent deduction' }
      expect(validateImplication(step)).toBe('valid')
      expect(validateStep(step).verdict).toBe('invalid')
    })

    it('rejects at least 15 planted wrong Implication steps (never valid)', () => {
      const planted = [
        { before: 'x = 3', after: 'x^2 = 3', rule: 'square' },
        { before: 'x = 2', after: 'x^2 = 8', rule: 'square' },
        { before: 'x = 5', after: 'x^2 = 10', rule: 'square' },
        { before: 'x + 1 = 3', after: '(x + 1)^2 = 3', rule: 'square' },
        { before: 'x = 2', after: '2*x = 2', data: { multiplier: '2' } },
        { before: 'x - 1 = 4', after: '(x - 1)^2 = 8', rule: 'square' },
        { before: 'x = -2', after: 'x^2 = -4', rule: 'square' },
        { before: 'x = 3', after: 'x^2 = 6', rule: 'square' },
        { before: 'x + 2 = 5', after: 'x^2 + 4 = 25', rule: 'square' },
        { before: 'x = 1', after: 'x^2 = 2', rule: 'square' },
        { before: '2*x = 4', after: '4*x^2 = 4', rule: 'square' },
        { before: 'x = 4', after: 'x = 5' },
        { before: 'x - 3 = 0', after: '(x - 3)^2 = 9', rule: 'square' },
        { before: 'x = 0', after: 'x = 1' },
        { before: '3*x = 6', after: '9*x^2 = 12', rule: 'square' },
        { before: 'x + 1 = 2', after: 'x + 1 = 4' }
      ]

      expect(planted.length).toBeGreaterThanOrEqual(15)

      for (const p of planted) {
        const step: Step = {
          kind: 'Implication',
          before: p.before,
          after: p.after,
          rule: p.rule,
          data: p.data,
          sentence: `Implication from ${p.before} to ${p.after}`
        }
        const verdict = validateImplication(step)
        expect(verdict, `Planted wrong implication '${p.before} -> ${p.after}' must not be valid`).not.toBe('valid')
      }
    })
  })

  describe('CaseSplitComplete steps', () => {
    it('accepts complete domain coverings as valid', () => {
      const validCases = [
        { before: 'real', after: 'x >= 0, x < 0', data: { cases: ['x >= 0', 'x < 0'] } },
        { before: 'real', after: 'x > 2, x = 2, x < 2', data: { cases: ['x > 2', 'x = 2', 'x < 2'] } },
        { before: 'integers', after: 'even, odd', data: { cases: ['even', 'odd'] } },
        { before: 'real', after: 'Delta > 0, Delta = 0, Delta < 0', data: { cases: ['Delta > 0', 'Delta = 0', 'Delta < 0'] } }
      ]

      for (const c of validCases) {
        const step = built({ kind: 'CaseSplitComplete', ...c })
        expect(validateCaseSplitComplete(step)).toBe('valid')
        expect(validateStep(step).verdict).toBe('valid')
      }
    })

    it('rejects at least 15 planted incomplete CaseSplitComplete steps (never valid)', () => {
      const planted = [
        { before: 'real', cases: ['x > 0', 'x < 0'] },
        { before: 'real', cases: ['x > 1', 'x < 1'] },
        { before: 'real', cases: ['x >= 2', 'x <= -2'] },
        { before: 'real', cases: ['x > 5', 'x < 3'] },
        { before: 'real', cases: ['x >= 10'] },
        { before: 'real', cases: ['x <= 0'] },
        { before: 'integers', cases: ['even'] },
        { before: 'real', cases: ['positive', 'negative'] },
        { before: 'real', cases: ['x > 0'] },
        { before: 'real', cases: ['x < 0'] },
        { before: 'real', cases: ['x >= 5', 'x <= 2'] },
        { before: 'real', cases: ['x > 3', 'x < 3'] },
        { before: 'real', cases: ['x >= 1', 'x <= -1'] },
        { before: 'real', cases: ['Delta > 0', 'Delta < 0'] },
        { before: 'real', cases: ['x > -2', 'x < -2'] },
        { before: 'real', cases: ['x >= 5', 'x < 2'] },
        { before: 'real', cases: ['x >= 10', 'y < 0'] },
        { before: 'real', cases: [] }
      ]

      expect(planted.length).toBeGreaterThanOrEqual(15)

      for (const p of planted) {
        const step = built({
          kind: 'CaseSplitComplete',
          before: p.before,
          after: p.cases.join(', '),
          data: { cases: p.cases }
        })
        const verdict = validateCaseSplitComplete(step)
        expect(verdict, `Planted incomplete cases ${JSON.stringify(p.cases)} must not be valid`).not.toBe('valid')
      }
    })
  })

  describe('SolutionSetEq steps', () => {
    it('accepts correct and complete solution sets as valid', () => {
      const validCases = [
        { before: '2*x - 6 = 0', after: 'x = 3', data: { solutions: ['3'], variable: 'x' } },
        { before: '3*x + 9 = 0', after: 'x = -3', data: { solutions: ['-3'], variable: 'x' } },
        { before: '5*x = 10', after: 'x = 2', data: { solutions: ['2'], variable: 'x' } },
        { before: 'x - 7 = 0', after: 'x = 7', data: { solutions: ['7'], variable: 'x' } },
        { before: '2*x = 0', after: 'x = 0', data: { solutions: ['0'], variable: 'x' } }
      ]

      for (const c of validCases) {
        const step = built({ kind: 'SolutionSetEq', ...c })
        expect(validateSolutionSetEq(step)).toBe('valid')
        expect(validateStep(step).verdict).toBe('valid')
      }
    })

    it('rejects at least 15 planted wrong SolutionSetEq steps (never valid)', () => {
      const planted = [
        { eq: '2*x - 6 = 0', sols: ['2'] },
        { eq: '2*x - 6 = 0', sols: ['-3'] },
        { eq: '3*x + 9 = 0', sols: ['3'] },
        { eq: '5*x = 10', sols: ['5'] },
        { eq: 'x + 4 = 10', sols: ['14'] },
        { eq: '2*x = 8', sols: ['0'] },
        { eq: '2*x = 8', sols: ['8'] },
        { eq: '4*x - 12 = 0', sols: ['4'] },
        { eq: 'x - 7 = 0', sols: ['-7'] },
        { eq: '2*x + 10 = 0', sols: ['5'] },
        { eq: '3*x - 1 = 0', sols: ['1'] },
        { eq: '2*x = 6', sols: ['3', '5'] },
        { eq: '2*x = 6', sols: ['3', '-3'] },
        { eq: '2*x = 6', sols: [] },
        { eq: 'x = 0', sols: ['1'] },
        { eq: 'x - 10 = 0', sols: ['0'] },
        { eq: 'x + y = 0', sols: ['0'] }
      ]

      expect(planted.length).toBeGreaterThanOrEqual(15)

      for (const p of planted) {
        const step = built({
          kind: 'SolutionSetEq',
          before: p.eq,
          after: p.sols.join(', '),
          data: { solutions: p.sols, variable: 'x' }
        })
        const verdict = validateSolutionSetEq(step)
        expect(verdict, `Planted wrong solution set '${p.sols.join(', ')}' for '${p.eq}' must not be valid`).not.toBe('valid')
      }
    })
  })

  describe('SubproblemReduction steps', () => {
    it('on its own a reduction is never valid: it needs the case split before it (see splits.test.ts)', () => {
      const validShapes = [
        {
          before: 'x = 1 \\text{ or } x = 2',
          after: 'x in {1, 2}',
          data: {
            subProblems: ['x - 1 = 0', 'x - 2 = 0'],
            subAnswers: [{ solutions: ['1'] }, { solutions: ['2'] }],
            parentAnswer: { solutions: ['1', '2'] }
          }
        }
      ]

      for (const c of validShapes) {
        const step = built({ kind: 'SubproblemReduction', ...c })
        expect(validateSubproblemReduction(step)).toBe('invalid')
        expect(validateStep(step).verdict).toBe('invalid')
      }
    })

    it('rejects at least 15 planted wrong SubproblemReduction steps (never valid)', () => {
      const planted = [
        { sub: ['2*x', '3'], parent: '2*x - 3' },
        { sub: ['2*x', '3'], parent: '2*x + 5' },
        { sub: ['x', '4'], parent: '2*x + 4' },
        { sub: ['3*x', '2'], parent: '3*x' },
        { sub: ['x^2', '2*x'], parent: 'x^2 - 2*x' },
        { sub: ['2*x', '1'], parent: '2*x + 2' },
        { sub: [{ solutions: ['2'] }, { solutions: ['-3'] }], parent: { solutions: ['2', '5'] } },
        { sub: [{ solutions: ['1'] }, { solutions: ['2'] }], parent: { solutions: ['1'] } },
        { sub: [{ solutions: ['1'] }, { solutions: ['2'] }], parent: { solutions: ['1', '2', '3'] } },
        { sub: ['4*x', '1'], parent: '4*x + 0' },
        { sub: ['x', 'y'], parent: 'x - y' },
        { sub: ['3*x', '4*x'], parent: '8*x' },
        { sub: [{ solutions: ['4'] }], parent: { solutions: ['5'] } },
        { sub: ['2*x', '2'], parent: '4*x + 2' },
        { sub: [{ solutions: ['0'] }], parent: { solutions: [] } },
        { sub: ['x + 1', 'x - 1'], parent: '2*x + 1' }
      ]

      expect(planted.length).toBeGreaterThanOrEqual(15)

      for (const p of planted) {
        const step = built({
          kind: 'SubproblemReduction',
          before: JSON.stringify(p.sub),
          after: JSON.stringify(p.parent),
          data: { subAnswers: p.sub, parentAnswer: p.parent }
        })
        const verdict = validateSubproblemReduction(step)
        expect(verdict, `Planted wrong reduction '${JSON.stringify(p.sub)} -> ${JSON.stringify(p.parent)}' must not be valid`).not.toBe('valid')
      }
    })
  })

  describe('Working validation', () => {
    it('accepts working where every step is valid', () => {
      const working: Working = {
        title: 'Solve 2x + 4 = 10',
        input: '2*x + 4 = 10',
        steps: [
          built({
            kind: 'EquationEquiv',
            op: { kind: 'subtract-both', term: '4' },
            before: '2*x + 4 = 10',
            after: '2*x = 6'
          }),
          built({
            kind: 'EquationEquiv',
            op: { kind: 'divide-both', k: '2' },
            before: '2*x = 6',
            after: 'x = 3'
          })
        ],
        answer: { label: 'x', tex: '3' }
      }

      const res = validateWorking(working)
      expect(res.valid).toBe(true)
    })

    it('rejects working containing even a single planted wrong step', () => {
      const working: Working = {
        title: 'Solve 2x + 4 = 10',
        input: '2*x + 4 = 10',
        steps: [
          built({
            kind: 'EquationEquiv',
            op: { kind: 'subtract-both', term: '4' },
            before: '2*x + 4 = 10',
            after: '2*x = 10' // Planted wrong move: forgot to subtract 4 from RHS
          }),
          built({
            kind: 'EquationEquiv',
            op: { kind: 'divide-both', k: '2' },
            before: '2*x = 10',
            after: 'x = 5'
          })
        ],
        answer: { label: 'x', tex: '5' }
      }

      const res = validateWorking(working)
      expect(res.valid).toBe(false)
      expect(res.failedStepIndex).toBe(0)
    })

    it('rejects working containing a wrong step in a nested sub-working', () => {
      const working: Working = {
        title: 'Parent Problem',
        input: 'x = 2',
        steps: [
          built({
            kind: 'EquationEquiv',
            op: { kind: 'multiply-both', k: '2' },
            before: 'x = 2',
            after: '2*x = 4'
          })
        ],
        subWorkings: [
          {
            title: 'Subproblem',
            input: 'x + 1',
            steps: [
              built({
                kind: 'ExprEq',
                before: 'x + 1',
                after: 'x + 5' // Planted wrong step inside subWorking
              })
            ]
          }
        ]
      }

      const res = validateWorking(working)
      expect(res.valid).toBe(false)
    })
  })
})

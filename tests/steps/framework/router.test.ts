// Tests for the StepRouter (S0).
//
// Tests:
// - Chaining sub-problems (a real case split, whose sub-answers are the equation's roots; and the false version)
// - The budget (depth and step limits)
// - The failure path (invalid steps hide working, thrown errors caught safely)
// - Alternative methods ("Another way")

import { describe, it, expect } from 'vitest'
import {
  createStepRouter,
  CANT_SHOW_STEPS_REASON
} from '../../../src/renderer/src/math/steps/router'
import { finishStep } from '../../../src/renderer/src/math/steps/sentences'
import type { Method, StepRouter, Step } from '../../../src/renderer/src/math/steps/types'

/** An EquationEquiv with its declared op; its sentence and rule are the builder's. */
const move = (before: string, after: string, op: Step['op'] & object): Step =>
  finishStep({ kind: 'EquationEquiv', op, before, after, sentence: '', data: { variable: 'x' } })

/** The one-step working of a linear equation x - r = 0 (the sub-problem method used by the chain test). */
const linearSub: Method = {
  id: 'mock.linear',
  name: 'Linear sub-problem',
  appliesTo: (p) => p.job === 'linear',
  solve: (p) => {
    const m = /^x - (\d+) = 0$/.exec(String(p.input))
    const r = m ? m[1] : '0'
    return {
      title: `Solve ${p.input}`,
      input: String(p.input),
      steps: [move(String(p.input), `x = ${r}`, { kind: 'add-both', term: r })],
      answer: { label: 'x', tex: r }
    }
  }
}

describe('StepRouter', () => {
  it('selects and executes applicable primary method', () => {
    const router = createStepRouter()

    const mockMethod: Method = {
      id: 'mock.add',
      name: 'Simple addition equation',
      order: 1,
      appliesTo: (p) => p.job === 'solve' && typeof p.input === 'string' && p.input.includes('+ 1 ='),
      solve: () => ({
        title: 'Solve x + 1 = 3',
        input: 'x + 1 = 3',
        steps: [move('x + 1 = 3', 'x = 2', { kind: 'subtract-both', term: '1' })],
        answer: { label: 'x', tex: '2' }
      })
    }

    router.registerMethod(mockMethod)

    const working = router.solve({
      job: 'solve',
      input: 'x + 1 = 3'
    })

    expect(working.noWorking).toBeFalsy()
    expect(working.steps.length).toBe(1)
    expect(working.steps[0].sentence).toBe('Subtract 1 from both sides')
    expect(working.answer).toEqual({ label: 'x', tex: '2' })
  })

  it('chains sub-problems via the router: a real case split of x^2 - 3x + 2 = 0 whose sub-answers are its roots', () => {
    const router = createStepRouter()
    const case1 = 'x - 1 = 0'
    const case2 = 'x - 2 = 0'

    // The parent factorises, splits the zero product, and reduces the two cases to their roots.
    const parent: Method = {
      id: 'mock.split',
      name: 'Split by factors',
      appliesTo: (p) => p.job === 'split',
      solve: (_p, subRouter: StepRouter) => {
        const sub1 = subRouter.solve({ job: 'linear', input: case1, variable: 'x' })
        const sub2 = subRouter.solve({ job: 'linear', input: case2, variable: 'x' })
        const tex1 = (Array.isArray(sub1.answer) ? sub1.answer[0] : sub1.answer)?.tex ?? ''
        const tex2 = (Array.isArray(sub2.answer) ? sub2.answer[0] : sub2.answer)?.tex ?? ''
        return {
          title: 'Solve x^2 - 3x + 2 = 0',
          input: 'x^2 - 3x + 2 = 0',
          method: 'Split by factors',
          steps: [
            move('x^2 - 3x + 2 = 0', '(x - 1)(x - 2) = 0', { kind: 'factorise' }),
            finishStep({
              kind: 'CaseSplitComplete',
              before: '(x - 1)(x - 2) = 0',
              after: 'x = 1 \\text{ or } x = 2',
              sentence: '',
              data: { form: 'zero-product', c: '1', cases: [case1, case2], variable: 'x' }
            }),
            finishStep({
              kind: 'SubproblemReduction',
              before: 'x = 1 \\text{ or } x = 2',
              after: 'x \\in \\{1, 2\\}',
              sentence: '',
              data: {
                variable: 'x',
                subProblems: [case1, case2],
                subAnswers: [{ solutions: [tex1] }, { solutions: [tex2] }],
                parentAnswer: { solutions: [tex1, tex2] }
              }
            })
          ],
          subWorkings: [sub1, sub2],
          answer: [
            { label: 'x', tex: tex1 },
            { label: 'x', tex: tex2 }
          ]
        }
      }
    }

    router.registerMethod(parent)
    router.registerMethod(linearSub)

    const working = router.solve({ job: 'split', input: 'x^2 - 3x + 2 = 0' })
    expect(working.noWorking).toBeFalsy()
    expect(working.steps).toHaveLength(3)
    expect(working.subWorkings).toHaveLength(2)
    expect(working.answer).toEqual([
      { label: 'x', tex: '1' },
      { label: 'x', tex: '2' }
    ])
  })

  it('the false version is hidden: a reduction with no case split before it, claiming x = 1 gives 1 and 2', () => {
    const router = createStepRouter()
    const falseMethod: Method = {
      id: 'mock.false',
      name: 'False split',
      appliesTo: (p) => p.job === 'false',
      solve: (_p, subRouter: StepRouter) => {
        const sub1 = subRouter.solve({ job: 'linear', input: 'x - 1 = 0', variable: 'x' })
        const sub2 = subRouter.solve({ job: 'linear', input: 'x - 2 = 0', variable: 'x' })
        return {
          title: 'Solve x = 1',
          input: 'x = 1',
          steps: [
            finishStep({
              kind: 'SubproblemReduction',
              before: 'x = 1',
              after: 'x \\in \\{1, 2\\}',
              sentence: '',
              data: {
                subProblems: ['x - 1 = 0', 'x - 2 = 0'],
                subAnswers: [{ solutions: ['1'] }, { solutions: ['2'] }],
                parentAnswer: { solutions: ['1', '2'] }
              }
            })
          ],
          subWorkings: [sub1, sub2],
          answer: [
            { label: 'x', tex: '1' },
            { label: 'x', tex: '2' }
          ]
        }
      }
    }
    router.registerMethod(falseMethod)
    router.registerMethod(linearSub)

    const w = router.solve({ job: 'false', input: 'x = 1' })
    expect(w.noWorking).toBe(true)
    expect(w.steps).toHaveLength(0)
    expect(w.answer).toBeUndefined()
  })

  it('stops when depth budget is exceeded and hides steps', () => {
    const router = createStepRouter()

    // Infinitely recursive method
    const loopMethod: Method = {
      id: 'mock.loop',
      name: 'Looping method',
      appliesTo: () => true,
      solve: (p, subRouter: StepRouter) => {
        return subRouter.solve(p)
      }
    }

    router.registerMethod(loopMethod)

    const working = router.solve(
      { job: 'solve', input: 'infinite' },
      { maxDepth: 4 }
    )

    expect(working.noWorking).toBe(true)
    expect(working.steps.length).toBe(0)
    expect(working.reason).toBe(CANT_SHOW_STEPS_REASON)
  })

  it('stops when step budget is exceeded', () => {
    const router = createStepRouter()

    const hugeStepMethod: Method = {
      id: 'mock.huge',
      name: 'Huge steps',
      appliesTo: () => true,
      solve: () => {
        const steps = []
        for (let i = 0; i < 20; i++) {
          steps.push({
            kind: 'EquationEquiv' as const,
            before: `x + ${i} = 0`,
            after: `x = -${i}`,
            sentence: `Step ${i}`
          })
        }
        return { steps }
      }
    }

    router.registerMethod(hugeStepMethod)

    const working = router.solve(
      { job: 'solve', input: 'huge' },
      { maxSteps: 5 }
    )

    expect(working.noWorking).toBe(true)
    expect(working.steps.length).toBe(0)
    expect(working.reason).toBe(CANT_SHOW_STEPS_REASON)
  })

  it('hides steps when any step fails validation (failure path)', () => {
    const router = createStepRouter()

    const flawedMethod: Method = {
      id: 'mock.flawed',
      name: 'Flawed method with planted wrong step',
      appliesTo: () => true,
      solve: () => ({
        steps: [move('2*x + 4 = 10', '2*x = 10', { kind: 'subtract-both', term: '4' })],
        answer: { label: 'x', tex: '5' }
      })
    }

    router.registerMethod(flawedMethod)

    const working = router.solve({ job: 'solve', input: '2*x + 4 = 10' })
    expect(working.noWorking).toBe(true)
    expect(working.steps.length).toBe(0)
    expect(working.reason).toBe(CANT_SHOW_STEPS_REASON)
  })

  it('gracefully handles thrown errors inside methods', () => {
    const router = createStepRouter()

    const crashingMethod: Method = {
      id: 'mock.crash',
      name: 'Crashing method',
      appliesTo: () => true,
      solve: () => {
        throw new Error('Unexpected internal exception')
      }
    }

    router.registerMethod(crashingMethod)

    const working = router.solve({ job: 'solve', input: 'crash' })
    expect(working.noWorking).toBe(true)
    expect(working.steps.length).toBe(0)
    expect(working.reason).toBe(CANT_SHOW_STEPS_REASON)
  })

  it('returns safe failure when no method applies', () => {
    const router = createStepRouter()

    const working = router.solve({ job: 'unknown_job', input: 'something' })
    expect(working.noWorking).toBe(true)
    expect(working.steps.length).toBe(0)
    expect(working.reason).toBe(CANT_SHOW_STEPS_REASON)
  })

  it('includes alternative methods as Another way', () => {
    const router = createStepRouter()
    const solved = (before: string, method: string): Method => ({
      id: `mock.${method}`,
      name: method,
      appliesTo: () => true,
      solve: () => ({
        method,
        input: 'x = 1',
        steps: [move(before, before, { kind: 'already-solved' })],
        answer: { label: 'x', tex: '1' }
      })
    })

    const primaryMethod: Method = { ...solved('x = 1', 'Method 1 (Primary)'), order: 1, isAlternative: false }
    const altMethod: Method = { ...solved('x = 1', 'Method 2 (Another way)'), order: 2, isAlternative: true }

    router.registerMethod(primaryMethod)
    router.registerMethod(altMethod)

    const working = router.solve({ job: 'solve', input: 'x = 1' })
    expect(working.noWorking).toBeFalsy()
    expect(working.method).toBe('Method 1 (Primary)')
    expect(working.anotherWay).toBeDefined()
    expect(working.anotherWay?.method).toBe('Method 2 (Another way)')
    expect(working.anotherWay?.steps.length).toBe(1)
  })
})

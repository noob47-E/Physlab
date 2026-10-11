// Tests for the StepRouter (S0).
//
// Tests:
// - Chaining sub-problems
// - The budget (depth and step limits)
// - The failure path (invalid steps hide working, thrown errors caught safely)
// - Alternative methods ("Another way")

import { describe, it, expect } from 'vitest'
import {
  createStepRouter,
  CANT_SHOW_STEPS_REASON
} from '../../../src/renderer/src/math/steps/router'
import type { Method, StepRouter } from '../../../src/renderer/src/math/steps/types'

describe('StepRouter', () => {
  it('selects and executes applicable primary method', () => {
    const router = createStepRouter()

    const mockMethod: Method = {
      id: 'mock.add',
      name: 'Simple addition equation',
      order: 1,
      appliesTo: (p) => p.job === 'solve' && typeof p.input === 'string' && p.input.includes('+ 1 ='),
      solve: (p) => ({
        title: `Solve ${p.input}`,
        steps: [
          {
            kind: 'EquationEquiv',
            before: 'x + 1 = 3',
            after: 'x = 2',
            sentence: 'Subtract 1 from both sides'
          }
        ],
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

  it('chains sub-problems via the router', () => {
    const router = createStepRouter()

    // Parent method splits problem into two sub-problems
    const parentMethod: Method = {
      id: 'mock.compound',
      name: 'Compound problem',
      order: 1,
      appliesTo: (p) => p.job === 'compound',
      solve: (_p, subRouter: StepRouter) => {
        const sub1 = subRouter.solve({ job: 'sub1', input: 'x = 1' })
        const sub2 = subRouter.solve({ job: 'sub2', input: 'x = 2' })

        return {
          title: 'Compound problem',
          steps: [
            {
              kind: 'SubproblemReduction',
              before: 'sub1 and sub2',
              after: 'x in {1, 2}',
              data: {
                subAnswers: [{ solutions: ['1'] }, { solutions: ['2'] }],
                parentAnswer: { solutions: ['1', '2'] }
              },
              sentence: 'Combine subproblems'
            }
          ],
          subWorkings: [sub1, sub2],
          answer: { label: 'x', tex: '1, 2' }
        }
      }
    }

    const sub1Method: Method = {
      id: 'mock.sub1',
      name: 'Sub 1',
      appliesTo: (p) => p.job === 'sub1',
      solve: () => ({
        steps: [
          {
            kind: 'EquationEquiv',
            before: 'x = 1',
            after: 'x = 1',
            sentence: 'Trivial'
          }
        ],
        answer: { label: 'x', tex: '1' }
      })
    }

    const sub2Method: Method = {
      id: 'mock.sub2',
      name: 'Sub 2',
      appliesTo: (p) => p.job === 'sub2',
      solve: () => ({
        steps: [
          {
            kind: 'EquationEquiv',
            before: 'x = 2',
            after: 'x = 2',
            sentence: 'Trivial'
          }
        ],
        answer: { label: 'x', tex: '2' }
      })
    }

    router.registerMethod(parentMethod)
    router.registerMethod(sub1Method)
    router.registerMethod(sub2Method)

    const working = router.solve({ job: 'compound', input: 'test' })
    expect(working.noWorking).toBeFalsy()
    expect(working.steps.length).toBe(1)
    expect(working.subWorkings?.length).toBe(2)
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
        steps: [
          {
            kind: 'EquationEquiv',
            before: '2*x + 4 = 10',
            after: '2*x = 10', // Wrong move! Forgot to subtract 4 from RHS
            sentence: 'Subtract 4 from both sides'
          }
        ],
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

    const primaryMethod: Method = {
      id: 'mock.primary',
      name: 'Method 1 (Primary)',
      order: 1,
      isAlternative: false,
      appliesTo: () => true,
      solve: () => ({
        method: 'Method 1 (Primary)',
        steps: [
          {
            kind: 'EquationEquiv',
            before: 'x = 1',
            after: 'x = 1',
            sentence: 'Primary step'
          }
        ],
        answer: { label: 'x', tex: '1' }
      })
    }

    const altMethod: Method = {
      id: 'mock.alt',
      name: 'Method 2 (Another way)',
      order: 2,
      isAlternative: true,
      appliesTo: () => true,
      solve: () => ({
        method: 'Method 2 (Another way)',
        steps: [
          {
            kind: 'EquationEquiv',
            before: 'x = 1',
            after: 'x = 1',
            sentence: 'Alternative step'
          }
        ],
        answer: { label: 'x', tex: '1' }
      })
    }

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

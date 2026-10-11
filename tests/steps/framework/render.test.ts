// Tests for the WorkingView render bridge (S0).
//
// Converts step engine Working documents to the Working panel's WorkingDoc format.
// Nested sub-workings fold as existing groups via subgoal headings.

import { describe, it, expect } from 'vitest'
import {
  renderWorkingToDoc,
  stepToMove,
  collectMoves,
  formatAnswers
} from '../../../src/renderer/src/math/steps'
import { finishStep } from '../../../src/renderer/src/math/steps/sentences'
import type { Working, Step, Problem } from '../../../src/renderer/src/math/steps'

describe('WorkingView render bridge', () => {
  it('converts a step to a pure move', () => {
    const step: Step = {
      kind: 'EquationEquiv',
      before: '2*x + 4 = 10',
      after: '2*x = 6',
      sentence: 'Subtract 4 from both sides',
      rule: 'Subtract from both sides',
      note: 'Keep variable terms on left',
      subgoal: 'Collect constants'
    }

    const move = stepToMove(step)
    expect(move.head).toBe('Subtract 4 from both sides')
    expect(move.rule).toBe('Subtract from both sides')
    expect(move.tex).toBe('2*x = 6')
    expect(move.note).toBe('Keep variable terms on left')
    expect(move.subgoal).toBe('Collect constants')
  })

  it('collects moves and flattens nested sub-workings with subgoal headings', () => {
    const working: Working = {
      steps: [
        {
          kind: 'EquationEquiv',
          before: 'x = 1',
          after: 'x = 1',
          sentence: 'Step 1'
        }
      ],
      subWorkings: [
        {
          title: 'Find discriminant',
          steps: [
            {
              kind: 'ExprEq',
              before: 'b^2 - 4*a*c',
              after: '4 - 0',
              sentence: 'Substitute values'
            },
            {
              kind: 'ExprEq',
              before: '4 - 0',
              after: '4',
              sentence: 'Evaluate'
            }
          ]
        }
      ]
    }

    const moves = collectMoves(working)
    expect(moves.length).toBe(3)
    expect(moves[0].head).toBe('Step 1')
    expect(moves[0].subgoal).toBeUndefined()

    // Sub-working's first move receives the title as a subgoal heading
    expect(moves[1].head).toBe('Substitute values')
    expect(moves[1].subgoal).toBe('Find discriminant')
    expect(moves[2].head).toBe('Evaluate')
    expect(moves[2].subgoal).toBeUndefined()
  })

  it('formats answers cleanly', () => {
    const single = formatAnswers({ label: 'x', tex: '5' })
    expect(single).toEqual([{ label: 'x', tex: '5' }])

    const multiple = formatAnswers([
      { label: 'x_1', tex: '2' },
      { label: 'x_2', tex: '-3' }
    ])
    expect(multiple.length).toBe(2)
    expect(multiple[0].label).toBe('x_1')
    expect(multiple[1].label).toBe('x_2')
  })

  it('renders a full Working to the panel format', () => {
    const problem: Problem = {
      job: 'solve',
      input: '2*x + 4 = 10'
    }

    const working: Working = {
      title: 'Solve 2x + 4 = 10',
      input: '2x + 4 = 10',
      method: 'Linear equation in one variable',
      steps: [
        {
          kind: 'EquationEquiv',
          op: { kind: 'subtract-both', term: '4' },
          before: '2*x + 4 = 10',
          after: '2*x = 6',
          sentence: 'Subtract 4 from both sides'
        },
        {
          kind: 'EquationEquiv',
          op: { kind: 'divide-both', k: '2' },
          before: '2*x = 6',
          after: 'x = 3',
          sentence: 'Divide both sides by 2'
        }
      ],
      answer: { label: 'x', tex: '3' },
      checked: 'ok'
    }

    for (const step of working.steps) finishStep(step)
    const doc = renderWorkingToDoc(working, problem)
    expect(doc.title).toBe('Solve 2x + 4 = 10')
    expect(doc.input).toBe('2x + 4 = 10')
    expect(doc.method).toBe('Linear equation in one variable')
    expect(doc.moves.length).toBe(2)
    expect(doc.moves[0].head).toBe('Subtract 4 from both sides')
    expect(doc.moves[1].head).toBe('Divide both sides by 2')
    expect(doc.answers).toEqual([{ label: 'x', tex: '3' }])
    expect(doc.check).toBe('Put x = 3 back: both sides give 10.')
    expect(doc.checked).toBe('ok')
    expect(doc.noWorking).toBeFalsy()
  })

  it('renders noWorking and reason when steps could not be shown', () => {
    const working: Working = {
      title: 'Complex calculation',
      input: 'integral(...)',
      noWorking: true,
      reason: "I can't show the steps for this one yet",
      steps: [],
      answer: { label: 'Result', tex: '42' }
    }

    const doc = renderWorkingToDoc(working)
    expect(doc.noWorking).toBe(true)
    expect(doc.reason).toBe("I can't show the steps for this one yet")
    expect(doc.moves.length).toBe(0)
    expect(doc.answers.length).toBe(1)
  })

  it('renders error documents when error is set', () => {
    const working: Working = {
      title: 'Invalid',
      input: 'bad input',
      steps: [],
      error: 'Cannot parse equation'
    }

    const doc = renderWorkingToDoc(working)
    expect(doc.error).toBe('Cannot parse equation')
    expect(doc.moves.length).toBe(0)
  })

  it('enforces Rule 0.2: hides moves and sets noWorking if steps contain invalid or unknown step', () => {
    const unvalidatedWorking: Working = {
      title: 'Bad solution',
      input: '2*x = 8',
      steps: [
        {
          kind: 'EquationEquiv',
          before: '2*x = 8',
          after: 'x = 99', // planted wrong step
          sentence: 'Mistaken division'
        }
      ],
      answer: { label: 'x', tex: '99' }
    }

    const doc = renderWorkingToDoc(unvalidatedWorking)
    expect(doc.moves.length).toBe(0)
    expect(doc.noWorking).toBe(true)
    expect(doc.reason).toBe("I can't show the steps for this one yet")
  })
})

// The answers of the S1a methods, checked by the framework and read off the rendered output (the review of
// a982a6a4). A wrong value, a wrong label or a wrong answer in a sub-working or the Another way must come back
// hidden in what the bridge renders: no moves and no answer on the page.

import { describe, it, expect } from 'vitest'
import { createStepRouter } from '../../../src/renderer/src/math/steps/router'
import { S1A_METHODS } from '../../../src/renderer/src/math/steps/methods'
import { linearOneVarMethod } from '../../../src/renderer/src/math/steps/methods/linearOneVar'
import { renderWorkingToDoc } from '../../../src/renderer/src/math/steps/render'
import { validateWorking } from '../../../src/renderer/src/math/steps/validate'
import type { Working } from '../../../src/renderer/src/math/steps/types'

const linearRouter = createStepRouter([linearOneVarMethod])
const quadRouter = createStepRouter(S1A_METHODS)

/** A deep copy with one thing changed. */
function copyOf(w: Working): Working {
  return JSON.parse(JSON.stringify(w)) as Working
}

/** The page shows nothing for this working: no validation, no moves, no answer. */
function expectNothingShown(w: Working, label: string): void {
  expect(validateWorking(w).valid, `${label}: the validators must reject it`).toBe(false)
  const doc = renderWorkingToDoc(w)
  expect(doc.noWorking, `${label}: the bridge must report noWorking`).toBe(true)
  expect(doc.moves, `${label}: no moves on the page`).toHaveLength(0)
  expect(doc.answers, `${label}: no answer on the page`).toHaveLength(0)
}

describe('the linear answer for 3y + 1 = 7 (the variable is y)', () => {
  const w = linearRouter.solve({ job: 'solve', input: '3y + 1 = 7', variable: 'y' })

  it('is correct: label y, value 2, shown on the page with its steps', () => {
    expect(validateWorking(w).valid).toBe(true)
    const doc = renderWorkingToDoc(w)
    expect(doc.noWorking).toBeFalsy()
    expect(doc.answers).toEqual([{ label: 'y', tex: '2' }])
    expect(doc.moves.length).toBeGreaterThan(0)
  })

  it('a wrong value (3 for 2) is hidden in the rendered output', () => {
    const bad = copyOf(w)
    bad.answer = { label: 'y', tex: '3', value: '3' }
    expectNothingShown(bad, 'wrong value')
  })

  it('a wrong label (x where the problem says y) is hidden in the rendered output', () => {
    const bad = copyOf(w)
    bad.answer = { label: 'x', tex: '2', value: '2' }
    expectNothingShown(bad, 'wrong label')
  })

  it('a failed check hides the working (the linear method sets checked: failed on a bad substitution)', () => {
    const bad = copyOf(w)
    bad.checked = 'failed'
    expectNothingShown(bad, 'checked failed')
  })
})

describe('the answers of the quadratic methods, in the problem variable', () => {
  const w = quadRouter.solve({ job: 'solve', input: 'x^2 - 5x + 6 = 0', variable: 'x' })

  it('the correct answers are shown: 2 and 3', () => {
    expect(validateWorking(w).valid).toBe(true)
    expect(renderWorkingToDoc(w).answers).toEqual([
      { label: 'x', tex: '2' },
      { label: 'x', tex: '3' }
    ])
  })

  it('a wrong answer in a sub-working (x - 3 = 0 giving 4) is hidden in the rendered output', () => {
    const bad = copyOf(w)
    ;(bad.subWorkings?.[1] as Working).answer = { label: 'x', tex: '4', value: '4' }
    expectNothingShown(bad, 'wrong sub-working answer')
  })

  it('a wrong answer on the Another way is hidden in the rendered output', () => {
    const bad = copyOf(w)
    if (!bad.anotherWay) throw new Error('the square should be the Another way here')
    bad.anotherWay.answer = [
      { label: 'x', tex: '2' },
      { label: 'x', tex: '5' }
    ]
    expectNothingShown(bad, 'wrong Another way answer')
  })

  it('the same method in the variable y: the answers carry y, and a label x is hidden', () => {
    const y = quadRouter.solve({ job: 'solve', input: 'y^2 - 5y + 6 = 0', variable: 'y' })
    expect(renderWorkingToDoc(y).answers).toEqual([
      { label: 'y', tex: '2' },
      { label: 'y', tex: '3' }
    ])
    const bad = copyOf(y)
    bad.answer = [
      { label: 'x', tex: '2' },
      { label: 'x', tex: '3' }
    ]
    expectNothingShown(bad, 'y problem labelled x')
  })
})

describe('a working that is already solved is not empty', () => {
  it('x = 5 gives one line that says so, and the answer 5 is shown with it', () => {
    const w = linearRouter.solve({ job: 'solve', input: 'x = 5', variable: 'x' })
    expect(w.noWorking).toBeFalsy()
    expect(w.steps).toHaveLength(1)
    expect(validateWorking(w).valid).toBe(true)
    expect(renderWorkingToDoc(w).answers).toEqual([{ label: 'x', tex: '5' }])
  })
})

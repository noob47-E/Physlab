// The bridge from the Calculator to the checked step engine (Part S1).
//
// Solves a problem using the sound step framework, validates every step,
// and returns a Working document for WorkingView, or null when no method applies.

import type { Problem, StepAnswer, StepRouter } from './types'
import { defaultCheckAdapter, type CheckAdapter } from './check-adapter'
import { createStepRouter } from './router'
import { renderWorkingToDoc } from './render'
import { ALL_STEP_METHODS } from './methods'
import { discriminantOf, quadraticOf } from './methods/quadratic'
import type { Working as PureWorkingDoc } from '../pure/work'

/** Create a router loaded with all checked step methods. */
export function createDefaultStepRouter(adapter: CheckAdapter = defaultCheckAdapter): StepRouter {
  return createStepRouter(ALL_STEP_METHODS, adapter)
}

/** The answer line both quadratic methods write when the discriminant is negative in the real numbers. */
const NO_REAL_SOLUTION_TEX = '\\text{No real solution}'

/**
 * Whether the step framework's answer for this problem is "No real solution" for a real quadratic with a
 * negative discriminant. That working states the conclusion before it works the discriminant out, and it
 * has no complex roots at all, which is the part a student came for. Such a line is handed to the older
 * engine (math/pure/complex/solve.ts), which works the discriminant out first and gives the exact roots.
 * Only a quadratic qualifies: a cubic or quartic with no real answer keeps the step framework's working.
 */
function isNoRealSolutionQuadratic(problem: Problem, answer: StepAnswer | StepAnswer[] | undefined): boolean {
  const answers = answer === undefined ? [] : Array.isArray(answer) ? answer : [answer]
  if (!answers.some((a) => a.tex === NO_REAL_SOLUTION_TEX)) return false
  const q = quadraticOf(problem)
  return q !== null && q.domain === 'real' && discriminantOf(q) < 0n
}

/**
 * Solve a problem using the checked step engine and render it to a PureWorkingDoc for WorkingView.
 * Returns null if no method applies, if steps could not be produced, if validation fails, or if the
 * line is a real quadratic with no real solution (see isNoRealSolutionQuadratic).
 */
export function stepWorkingFor(problem: Problem, adapter: CheckAdapter = defaultCheckAdapter): PureWorkingDoc | null {
  try {
    const router = createDefaultStepRouter(adapter)
    const working = router.solve(problem)
    if (!working || working.noWorking || !working.steps || working.steps.length === 0) return null
    if (isNoRealSolutionQuadratic(problem, working.answer)) return null
    const doc = renderWorkingToDoc(working, problem, adapter)
    if (!doc || doc.noWorking || !doc.moves || doc.moves.length === 0 || (doc.answers.length === 0 && !working.answer)) return null
    return doc
  } catch {
    return null
  }
}

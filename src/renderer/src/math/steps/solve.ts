// The bridge from the Calculator to the checked step engine (Part S1).
//
// Solves a problem using the sound step framework, validates every step,
// and returns a Working document for WorkingView, or null when no method applies.

import type { Problem, StepRouter } from './types'
import { defaultCheckAdapter, type CheckAdapter } from './check-adapter'
import { createStepRouter } from './router'
import { renderWorkingToDoc } from './render'
import { ALL_STEP_METHODS } from './methods'
import type { Working as PureWorkingDoc } from '../pure/work'

/** Create a router loaded with all checked step methods. */
export function createDefaultStepRouter(adapter: CheckAdapter = defaultCheckAdapter): StepRouter {
  return createStepRouter(ALL_STEP_METHODS, adapter)
}

/**
 * Solve a problem using the checked step engine and render it to a PureWorkingDoc for WorkingView.
 * Returns null if no method applies, if steps could not be produced, or if validation fails.
 */
export function stepWorkingFor(problem: Problem, adapter: CheckAdapter = defaultCheckAdapter): PureWorkingDoc | null {
  try {
    const router = createDefaultStepRouter(adapter)
    const working = router.solve(problem)
    if (!working || working.noWorking || !working.steps || working.steps.length === 0) return null
    const doc = renderWorkingToDoc(working, problem, adapter)
    if (!doc || doc.noWorking || !doc.moves || doc.moves.length === 0 || (doc.answers.length === 0 && !working.answer)) return null
    return doc
  } catch {
    return null
  }
}

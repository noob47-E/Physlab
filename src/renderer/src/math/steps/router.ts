// The step router: chains methods, passes sub-problems, and validates all steps.
//
// Part of the PhysLab step engine (S0), changed by P-FIX-S0SOUND.
// Rule 0.2: One invalid or unknown step hides that method's steps.
// A method whose working is hidden does not end the search: the next applicable method is tried, so a
// method that can show its steps is still used. A hidden working is never returned as shown.

import type { Problem, Working, Method, StepRouter, RouterOptions } from './types'
import { CANT_SHOW_STEPS_REASON } from './types'
import { validateWorking } from './validate'
import { defaultCheckAdapter, type CheckAdapter } from './check-adapter'

export { CANT_SHOW_STEPS_REASON }
export const DEFAULT_MAX_DEPTH = 10
export const DEFAULT_MAX_STEPS = 100

/** The longest typed input the methods read, and the most brackets in it (P-FIX-S1SOUND2 SHOULD 1). */
const MAX_INPUT_LENGTH = 400
const MAX_BRACKETS = 60

function countOf(text: string, ch: string): number {
  let n = 0
  for (const c of text) if (c === ch) n++
  return n
}

/**
 * Count all steps in a Working document including nested sub-workings. Iterative, and bounded: a tree with a cycle or too many
 * workings counts as infinitely many steps, so it is never chosen (review of P-FIX-S1SOUND2, SHOULD H: no recursion without a guard).
 */
export function countSteps(working: Working): number {
  const MAX_VISITS = 400
  let count = 0
  let visits = 0
  const stack: Working[] = [working]
  while (stack.length > 0) {
    const w = stack.pop() as Working
    visits++
    if (visits > MAX_VISITS) return Number.POSITIVE_INFINITY
    count += w.steps.length
    for (const sub of w.subWorkings ?? []) stack.push(sub)
  }
  return count
}

export class DefaultStepRouter implements StepRouter {
  private methods: Method[] = []
  private adapter: CheckAdapter

  constructor(methods: Method[] = [], adapter: CheckAdapter = defaultCheckAdapter) {
    this.methods = [...methods]
    this.adapter = adapter
  }

  registerMethod(method: Method): void {
    // Avoid duplicate registration by id
    const existingIdx = this.methods.findIndex((m) => m.id === method.id)
    if (existingIdx >= 0) {
      this.methods[existingIdx] = method
    } else {
      this.methods.push(method)
    }
  }

  getMethods(): Method[] {
    return [...this.methods]
  }

  solve(problem: Problem, options?: RouterOptions): Working {
    const depth = options?.currentDepth ?? 0
    const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH
    const maxSteps = options?.maxSteps ?? DEFAULT_MAX_STEPS
    const stepCount = options?.stepCount ?? 0

    // Depth or step budget exhausted
    if (depth >= maxDepth || stepCount >= maxSteps) {
      return {
        steps: [],
        noWorking: true,
        reason: CANT_SHOW_STEPS_REASON
      }
    }

    // An input too long or too deeply bracketed to read in time is declined before any method reads it (P-FIX-S1SOUND2
    // SHOULD 1: 3,000 nested brackets took seconds, every method rereading them).
    if (typeof problem.input === 'string' && (problem.input.length > MAX_INPUT_LENGTH || countOf(problem.input, '(') > MAX_BRACKETS)) {
      return { steps: [], noWorking: true, reason: CANT_SHOW_STEPS_REASON }
    }

    // Filter applicable methods
    const applicable = this.methods
      .filter((m) => {
        try {
          const res = m.appliesTo(problem)
          return typeof res === 'boolean' ? res : res.applies
        } catch {
          return false
        }
      })
      .sort((a, b) => {
        // Primary / international methods first: isAlternative false beats true
        const aAlt = Boolean(a.isAlternative)
        const bAlt = Boolean(b.isAlternative)
        if (aAlt !== bAlt) return aAlt ? 1 : -1
        return (a.order ?? 100) - (b.order ?? 100)
      })

    if (applicable.length === 0) {
      return {
        steps: [],
        noWorking: true,
        reason: CANT_SHOW_STEPS_REASON
      }
    }

    // Sub-router passed to a method for sub-problem recursion
    const subRouter: StepRouter = {
      solve: (subProblem: Problem, subOpts?: RouterOptions) =>
        this.solve(subProblem, {
          ...options,
          ...subOpts,
          currentDepth: depth + 1,
          stepCount: stepCount + 1
        }),
      registerMethod: (m) => this.registerMethod(m),
      getMethods: () => this.getMethods()
    }

    // A method's working when it is shown: undefined when the method throws, runs over the step budget, declines, or
    // its working does not validate. The validation is inside the try: a working that makes the validator throw is a
    // working that is not shown (P-FIX-S1SOUND2 MUST 13).
    const attempt = (method: Method): Working | undefined => {
      try {
        const w = method.solve(problem, subRouter)
        if (stepCount + countSteps(w) > maxSteps || w.noWorking) return undefined
        return validateWorking(w, this.adapter, problem.domain).valid ? w : undefined
      } catch {
        return undefined
      }
    }

    // The first method (in order) whose working is shown is the primary. A hidden working is skipped,
    // never returned: the next applicable method gets its turn.
    let chosen: Working | undefined
    let chosenIndex = -1
    for (let i = 0; i < applicable.length; i++) {
      const w = attempt(applicable[i])
      if (w) {
        chosen = w
        chosenIndex = i
        break
      }
    }
    if (!chosen) {
      return {
        steps: [],
        noWorking: true,
        reason: CANT_SHOW_STEPS_REASON
      }
    }

    // "Another way": the first later method whose working is shown, if alternatives are allowed.
    if (options?.includeAlternatives !== false) {
      for (const alt of applicable.slice(chosenIndex + 1)) {
        const altWorking = attempt(alt)
        if (altWorking) {
          chosen.anotherWay = altWorking
          break
        }
      }
    }

    return chosen
  }
}

/** Create a new step router with optional initial methods. */
export function createStepRouter(methods: Method[] = [], adapter: CheckAdapter = defaultCheckAdapter): StepRouter {
  return new DefaultStepRouter(methods, adapter)
}

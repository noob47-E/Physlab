// The step router: chains methods, passes sub-problems, and validates all steps.
//
// Part of the PhysLab step engine (S0).
// Rule 0.2: One invalid or unknown step hides that method's steps.
// A method that fails yields "I can't show the steps for this one yet".

import type { Problem, Working, Method, StepRouter, RouterOptions } from './types'
import { validateWorking } from './validate'
import { defaultCheckAdapter, type CheckAdapter } from './check-adapter'

export const DEFAULT_MAX_DEPTH = 10
export const DEFAULT_MAX_STEPS = 100
export const CANT_SHOW_STEPS_REASON = "I can't show the steps for this one yet"

/** Count all steps in a Working document including nested sub-workings. */
export function countSteps(working: Working): number {
  let count = working.steps.length
  if (working.subWorkings) {
    for (const sub of working.subWorkings) {
      count += countSteps(sub)
    }
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

    const primary = applicable.find((m) => !m.isAlternative) ?? applicable[0]
    const alternatives = applicable.filter((m) => m !== primary)

    try {
      // Sub-router passed to method for sub-problem recursion
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

      const working = primary.solve(problem, subRouter)

      // Check step budget after generation
      const totalSteps = countSteps(working)
      if (stepCount + totalSteps > maxSteps) {
        return {
          steps: [],
          noWorking: true,
          reason: CANT_SHOW_STEPS_REASON
        }
      }

      // Validate all generated steps (and sub-workings)
      const validation = validateWorking(working, this.adapter)
      if (!validation.valid) {
        // One invalid or unknown step hides all steps of that method
        return {
          ...working,
          steps: [],
          subWorkings: undefined,
          noWorking: true,
          reason: CANT_SHOW_STEPS_REASON
        }
      }

      // Try alternative methods ("Another way") if allowed
      if (options?.includeAlternatives !== false && alternatives.length > 0) {
        for (const alt of alternatives) {
          try {
            const altWorking = alt.solve(problem, subRouter)
            if (countSteps(altWorking) <= maxSteps) {
              const altValidation = validateWorking(altWorking, this.adapter)
              if (altValidation.valid) {
                working.anotherWay = altWorking
                break
              }
            }
          } catch {
            // Alternative failure is ignored; primary remains valid
          }
        }
      }

      return working
    } catch {
      return {
        steps: [],
        noWorking: true,
        reason: CANT_SHOW_STEPS_REASON
      }
    }
  }
}

/** Create a new step router with optional initial methods. */
export function createStepRouter(methods: Method[] = [], adapter: CheckAdapter = defaultCheckAdapter): StepRouter {
  return new DefaultStepRouter(methods, adapter)
}

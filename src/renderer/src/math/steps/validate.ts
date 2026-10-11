// Step validators: each step kind has its own independent validator.
//
// Part of the PhysLab step engine (S0).
// Rule 0.2: Only 'valid' steps are ever shown. One invalid or unknown step
// hides that method's steps.

import type {
  Step,
  ValidationVerdict,
  StepValidationResult,
  Working,
  WorkingValidationResult
} from './types'
import { defaultCheckAdapter, type CheckAdapter } from './check-adapter'

/**
 * Validate an ExprEq step: 'after' equals 'before' as expressions.
 * Compares the UNSIMPLIFIED ASTs, never through an engine's auto-simplify.
 */
export function validateExprEq(step: Step, adapter: CheckAdapter = defaultCheckAdapter): ValidationVerdict {
  if (step.kind !== 'ExprEq') return 'invalid'
  return adapter.checkExprEq(step.before, step.after)
}

/**
 * Validate an EquationEquiv step: both equations have the same solution set.
 * E.g. adding the same term to both sides, expanding or collecting like terms.
 */
export function validateEquationEquiv(step: Step, adapter: CheckAdapter = defaultCheckAdapter): ValidationVerdict {
  if (step.kind !== 'EquationEquiv') return 'invalid'
  const payload = step.data && typeof step.data === 'object' ? (step.data as Record<string, unknown>) : {}
  const variable = typeof payload.variable === 'string' ? payload.variable : undefined
  return adapter.checkEquationEquiv(step.before, step.after, variable)
}

/**
 * Validate an Implication step: forward deduction only (before => after).
 * For squaring both sides or multiplying by an expression that may be 0.
 * Extraneous roots are rejected by substitution at the end.
 */
export function validateImplication(step: Step, adapter: CheckAdapter = defaultCheckAdapter): ValidationVerdict {
  if (step.kind !== 'Implication') return 'invalid'
  return adapter.checkImplication(step.before, step.after, step.rule, step.data)
}

/**
 * Validate a CaseSplitComplete step: the cases cover the domain.
 */
export function validateCaseSplitComplete(step: Step, adapter: CheckAdapter = defaultCheckAdapter): ValidationVerdict {
  if (step.kind !== 'CaseSplitComplete') return 'invalid'
  const payload = step.data && typeof step.data === 'object' ? (step.data as Record<string, unknown>) : {}
  const cases = Array.isArray(payload.cases)
    ? payload.cases
    : typeof step.after === 'string'
      ? step.after.split(/\s*(?:,\s*|;\s*|\bor\b|\band\b)\s*/i).filter(Boolean)
      : []
  const domain = payload.domain ?? step.before
  return adapter.checkCaseSplitComplete(domain, cases)
}

/**
 * Validate a SolutionSetEq step: the final answer set matches the equation's roots.
 */
export function validateSolutionSetEq(step: Step, adapter: CheckAdapter = defaultCheckAdapter): ValidationVerdict {
  if (step.kind !== 'SolutionSetEq') return 'invalid'
  const payload = step.data && typeof step.data === 'object' ? (step.data as Record<string, unknown>) : {}
  const variable = typeof payload.variable === 'string' ? payload.variable : 'x'
  const solutions = Array.isArray(payload.solutions)
    ? payload.solutions
    : [step.after]
  return adapter.checkSolutionSetEq(step.before, solutions, variable)
}

/**
 * Validate a SubproblemReduction step: parent's answer follows from sub-answers.
 */
export function validateSubproblemReduction(step: Step, adapter: CheckAdapter = defaultCheckAdapter): ValidationVerdict {
  if (step.kind !== 'SubproblemReduction') return 'invalid'
  const payload = step.data && typeof step.data === 'object' ? (step.data as Record<string, unknown>) : {}
  const subProblems = Array.isArray(payload.subProblems) ? payload.subProblems : []
  const subAnswers = Array.isArray(payload.subAnswers) ? payload.subAnswers : [step.before]
  const parentAnswer = payload.parentAnswer ?? step.after
  const parentProblem = payload.parentProblem ?? step.sentence
  return adapter.checkSubproblemReduction(parentProblem, subProblems, parentAnswer, subAnswers)
}

/**
 * Validate any single step according to its declared kind.
 */
export function validateStep(step: Step, adapter: CheckAdapter = defaultCheckAdapter): StepValidationResult {
  let verdict: ValidationVerdict
  switch (step.kind) {
    case 'ExprEq':
      verdict = validateExprEq(step, adapter)
      break
    case 'EquationEquiv':
      verdict = validateEquationEquiv(step, adapter)
      break
    case 'Implication':
      verdict = validateImplication(step, adapter)
      break
    case 'CaseSplitComplete':
      verdict = validateCaseSplitComplete(step, adapter)
      break
    case 'SolutionSetEq':
      verdict = validateSolutionSetEq(step, adapter)
      break
    case 'SubproblemReduction':
      verdict = validateSubproblemReduction(step, adapter)
      break
    default:
      verdict = 'invalid'
  }

  return {
    verdict,
    reason: verdict === 'valid' ? undefined : `Step of kind '${step.kind}' returned verdict '${verdict}'`
  }
}

/**
 * Validate an entire Working document, including all nested sub-workings.
 * Rule: Only 'valid' steps are shown. One invalid or unknown step fails the working.
 */
export function validateWorking(working: Working, adapter: CheckAdapter = defaultCheckAdapter): WorkingValidationResult {
  // Check main steps
  for (let i = 0; i < working.steps.length; i++) {
    const step = working.steps[i]
    const res = validateStep(step, adapter)
    if (res.verdict !== 'valid') {
      return {
        valid: false,
        failedStepIndex: i,
        failedStep: step,
        verdict: res.verdict,
        reason: res.reason ?? `Step ${i + 1} is not valid (${res.verdict})`
      }
    }
  }

  // Check nested sub-workings recursively
  if (working.subWorkings && working.subWorkings.length > 0) {
    for (let s = 0; s < working.subWorkings.length; s++) {
      const sub = working.subWorkings[s]
      const subRes = validateWorking(sub, adapter)
      if (!subRes.valid) {
        return {
          valid: false,
          failedStep: subRes.failedStep,
          verdict: subRes.verdict,
          reason: `Sub-working ${s + 1} failed: ${subRes.reason}`
        }
      }
    }
  }

  return { valid: true }
}

// Step validators: each step kind has its own independent validator.
//
// Part of the PhysLab step engine (S0), tightened by P-FIX-S0SOUND and the reviews of a982a6a4 and 1aa6b998.
// Rule 0.2: Only 'valid' steps are ever shown. One invalid or unknown step hides that method's working.
// - Every move is an EquationEquiv with a declared op, checked side by side (check-adapter.ts).
// - A step's sentence and rule must equal what the builder gives from its typed data (sentences.ts).
// - A CaseSplitComplete in zero-product form, and a SubproblemReduction inside its working, show exactly the
//   result their data gives. A reduction is valid only with the case split right before it.
// - An empty solution set is valid only with an exact proof from the displayed before (solutionProof).
// - A working's steps chain: the first starts from the problem as typed, and each step starts where the one
//   before it ends. Sub-workings and the Another way are validated as well.
// - The answer (label and value) must equal what the validated last step displays, in the problem's own
//   variable, and the answer must satisfy the problem. The check line is the one the builder gives.
// - A working with no steps is unknown, unless it is the explicit can't-show fallback.

import {
  CANT_SHOW_STEPS_REASON,
  type Step,
  type StepValidationResult,
  type ValidationVerdict,
  type Working,
  type WorkingValidationResult
} from './types'
import { rStr, type Rat } from '../pure/rat'
import {
  checkEquationOp,
  checkZeroProduct,
  defaultCheckAdapter,
  displayedValues,
  linearRootOf,
  normalizeDisplayed,
  sameState,
  solutionProofOf,
  variableOfInput,
  type CheckAdapter
} from './check-adapter'
import { ruleFor, sentenceFor, substitutionOf } from './sentences'

function dataOf(step: Step): Record<string, unknown> {
  return step.data && typeof step.data === 'object' ? (step.data as Record<string, unknown>) : {}
}

function variableOfStep(step: Step): string {
  const v = dataOf(step).variable
  return typeof v === 'string' ? v : 'x'
}

/**
 * Validate an ExprEq step: 'after' equals 'before' as expressions. A discriminant step (role 'discriminant')
 * must also start from the substituted expression b² − 4ac that its data names.
 * Compares the UNSIMPLIFIED ASTs, never through an engine's auto-simplify.
 */
export function validateExprEq(step: Step, adapter: CheckAdapter = defaultCheckAdapter): ValidationVerdict {
  if (step.kind !== 'ExprEq') return 'invalid'
  const d = dataOf(step)
  if (d.role === 'discriminant') {
    const { a, b, c } = d
    if (typeof a !== 'string' || typeof b !== 'string' || typeof c !== 'string') return 'invalid'
    const named = `(${b})^2 - 4 \\cdot ${a} \\cdot (${c})`
    if (adapter.checkExprEq(step.before, named) !== 'valid') return 'invalid'
  }
  return adapter.checkExprEq(step.before, step.after)
}

/**
 * Validate an EquationEquiv step. The step must declare its move (op); the move is checked side by side on
 * both sides of the equation. A step without one is 'unknown': a claim of equivalence with no stated
 * operation cannot be checked on the arithmetic it hides.
 */
export function validateEquationEquiv(step: Step, _adapter: CheckAdapter = defaultCheckAdapter): ValidationVerdict {
  if (step.kind !== 'EquationEquiv') return 'invalid'
  if (!step.op) return 'unknown'
  return checkEquationOp(step.before, step.after, step.op, variableOfStep(step))
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

/** The values as text, in order, with duplicates after the first removed. */
function uniqueInOrder(values: Rat[]): string[] {
  const out: string[] = []
  for (const r of values) {
    const s = rStr(r)
    if (!out.includes(s)) out.push(s)
  }
  return out
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

/**
 * Validate a CaseSplitComplete step.
 * Zero-product form (data.form === 'zero-product', data.c, data.cases, data.variable): the product of the
 * cases must equal c times the whole equation exactly (c an exact non-zero rational, the product of degree at
 * least 1), and the displayed result must list the roots of the cases. Otherwise the S0 form: the cases cover
 * an inequality, parity or sign domain.
 */
export function validateCaseSplitComplete(step: Step, adapter: CheckAdapter = defaultCheckAdapter): ValidationVerdict {
  if (step.kind !== 'CaseSplitComplete') return 'invalid'
  const payload = dataOf(step)

  if (payload.form === 'zero-product') {
    const cases = Array.isArray(payload.cases) ? payload.cases.map((c) => String(c)) : []
    const c = typeof payload.c === 'string' ? payload.c : ''
    const v = typeof payload.variable === 'string' ? payload.variable : 'x'
    const verdict = checkZeroProduct(step.before, cases, c, v)
    if (verdict !== 'valid') return verdict
    const roots = cases.map((text) => linearRootOf(text, v))
    if (roots.some((r) => r === null)) return 'unknown'
    const shown = displayedValues(String(step.after), v)
    if (shown === null) return 'unknown'
    return sameList(shown, uniqueInOrder(roots as Rat[])) ? 'valid' : 'invalid'
  }

  const cases = Array.isArray(payload.cases)
    ? payload.cases
    : typeof step.after === 'string'
      ? step.after.split(/\s*(?:,\s*|;\s*|\bor\b|\band\b)\s*/i).filter(Boolean)
      : []
  const domain = payload.domain ?? step.before
  return adapter.checkCaseSplitComplete(domain, cases)
}

/** The value a proposed solution stands for: "x = 2" gives 2; a plain value stays as it is. */
function valueText(s: unknown): string {
  if (typeof s === 'string') return (s.includes('=') ? s.split('=')[1] : s).trim()
  if (s && typeof s === 'object' && 'value' in s) return String((s as { value: unknown }).value).trim()
  if (s && typeof s === 'object' && 'tex' in s) return normalizeDisplayed(String((s as { tex: unknown }).tex))
  return String(s).trim()
}

/**
 * Validate a SolutionSetEq step. The set is proved from the displayed before, never from a method's data:
 * - an empty set (data.solutions = []) is valid only when the proof says so: a non-zero constant (linear) or a
 *   real quadratic whose discriminant b² − 4ac is below zero (exact); the identity 0 = 0 (D the zero
 *   polynomial) is the only case of every real number, flagged allReals.
 * - the displayed after must be the text built from the proved set: "no value of x works", "No real solution",
 *   "every real number". A different line is invalid.
 * - a non-empty set is a linear equation's one root, checked exactly, and the displayed after lists it.
 * Any letter other than the variable makes the proof impossible (unknown).
 */
export function validateSolutionSetEq(step: Step, adapter: CheckAdapter = defaultCheckAdapter): ValidationVerdict {
  if (step.kind !== 'SolutionSetEq') return 'invalid'
  const payload = dataOf(step)
  const v = typeof payload.variable === 'string' ? payload.variable : 'x'
  const proof = solutionProofOf(String(step.before), v)
  if (!proof) return 'unknown'
  if (!Array.isArray(payload.solutions)) return 'invalid'
  const solutions: unknown[] = payload.solutions
  const allReals = payload.allReals === true

  if (solutions.length === 0) {
    if (proof.kind === 'roots') return 'invalid'
    if (allReals !== (proof.kind === 'all')) return 'invalid'
    const want =
      proof.kind === 'all'
        ? '\\text{every real number}'
        : proof.deg === 0
          ? `\\text{no value of ${v} works}`
          : '\\text{No real solution}'
    return normalizeDisplayed(String(step.after)) === normalizeDisplayed(want) ? 'valid' : 'invalid'
  }

  if (allReals || proof.kind !== 'roots') return 'invalid'
  const verdict = adapter.checkSolutionSetEq(String(step.before), solutions, v)
  if (verdict !== 'valid') return verdict
  const shown = displayedValues(String(step.after), v)
  return shown !== null && sameList(shown, solutions.map(valueText)) ? 'valid' : 'invalid'
}

/**
 * A SubproblemReduction on its own is never valid: it has nothing to be checked against. It is valid only
 * inside its working, with the case split right before it (validateSubproblemIn).
 */
export function validateSubproblemReduction(step: Step, _adapter: CheckAdapter = defaultCheckAdapter): ValidationVerdict {
  return step.kind === 'SubproblemReduction' ? 'invalid' : 'invalid'
}

/**
 * Validate a SubproblemReduction at position `index` of its working. It is valid only when:
 * - the step before it is a zero-product CaseSplitComplete, and the reduction's sub-problems are exactly that
 *   split's cases, in the same order;
 * - each case has a validated sub-working whose input is that case and whose answer is the case's root
 *   (the root is exact: a non-linear case is unknown);
 * - each sub-answer is that root alone, the parent's answer is the sub-answers in order, and the displayed
 *   after lists the same values.
 */
export function validateSubproblemIn(working: Working, index: number, _adapter: CheckAdapter = defaultCheckAdapter): ValidationVerdict {
  const step = working.steps[index]
  const prev = working.steps[index - 1]
  if (step.kind !== 'SubproblemReduction' || !prev || prev.kind !== 'CaseSplitComplete') return 'invalid'
  const pd = dataOf(prev)
  if (pd.form !== 'zero-product' || !Array.isArray(pd.cases)) return 'invalid'
  const cases = pd.cases.map((c) => String(c))
  const v = typeof pd.variable === 'string' ? pd.variable : 'x'

  const d = dataOf(step)
  const subProblems = Array.isArray(d.subProblems) ? d.subProblems.map((s) => String(s)) : null
  const subAnswers: unknown[] | null = Array.isArray(d.subAnswers) ? d.subAnswers : null
  const parent = d.parentAnswer && typeof d.parentAnswer === 'object' ? (d.parentAnswer as { solutions?: unknown }) : null
  const subs = working.subWorkings ?? []
  if (!subProblems || !subAnswers || !parent || subProblems.length !== cases.length) return 'invalid'
  if (subAnswers.length !== cases.length || subs.length !== cases.length) return 'invalid'

  const union: string[] = []
  for (let k = 0; k < cases.length; k++) {
    if (!sameState(subProblems[k], cases[k])) return 'invalid'
    const root = linearRootOf(cases[k], v)
    if (!root) return 'unknown'
    const sol = (subAnswers[k] as { solutions?: unknown } | null)?.solutions
    if (!Array.isArray(sol) || sol.length !== 1 || String(sol[0]) !== rStr(root)) return 'invalid'
    const sub = subs[k]
    if (!sameState(sub.input ?? '', cases[k])) return 'invalid'
    const answers = Array.isArray(sub.answer) ? sub.answer : sub.answer ? [sub.answer] : []
    if (answers.length !== 1 || normalizeDisplayed(answers[0].tex) !== rStr(root)) return 'invalid'
    union.push(String(sol[0]))
  }

  if (!Array.isArray(parent.solutions) || !sameList(parent.solutions.map((s) => String(s)), union)) return 'invalid'
  const shown = displayedValues(String(step.after), v)
  return shown !== null && sameList(shown, union) ? 'valid' : 'invalid'
}

/**
 * The sentence and the rule of a step must be the ones its typed data gives (sentences.ts). A method cannot
 * write its own words: a sentence that does not match what the move does is invalid.
 */
function wordingProblem(step: Step): string | null {
  const sentence = sentenceFor(step)
  if (sentence === null) return "The step's move has no sentence to give"
  if (step.sentence !== sentence) return 'The sentence is not the one its move gives'
  const rule = ruleFor(step)
  if (rule === null || step.rule !== rule) return 'The rule is not the one its move gives'
  return null
}

/**
 * Validate any single step according to its declared kind. A step's sentence and rule are checked first.
 */
export function validateStep(step: Step, adapter: CheckAdapter = defaultCheckAdapter): StepValidationResult {
  const wording = wordingProblem(step)
  if (wording !== null) return { verdict: 'invalid', reason: wording }

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

/** A step checked in its working: a reduction needs the working around it, every other step is checked alone. */
function validateStepIn(working: Working, index: number, adapter: CheckAdapter): StepValidationResult {
  const step = working.steps[index]
  if (step.kind !== 'SubproblemReduction') return validateStep(step, adapter)
  const wording = wordingProblem(step)
  if (wording !== null) return { verdict: 'invalid', reason: wording }
  const verdict = validateSubproblemIn(working, index, adapter)
  return {
    verdict,
    reason: verdict === 'valid' ? undefined : `Step of kind 'SubproblemReduction' returned verdict '${verdict}'`
  }
}

function chainBreak(working: Working, index: number, reason: string): WorkingValidationResult {
  return {
    valid: false,
    failedStepIndex: index,
    failedStep: working.steps[index],
    verdict: 'invalid',
    reason
  }
}

/**
 * The answer of a working must be what its validated last step displays, label and value alike, in the
 * problem's own variable. Returns the reason it does not, or null when it does (or there is no answer).
 * A solution-set ending is displayed as its text; a list of solutions as "x = 2 or x = 3" or "x in {2, 3}".
 */
function answerProblem(working: Working): string | null {
  if (working.answer === undefined) return null
  const answers = Array.isArray(working.answer) ? working.answer : [working.answer]
  const last = working.steps[working.steps.length - 1]
  const v = variableOfInput(working.input ?? '')
  if (v === null) return 'the answer cannot be checked: the input has no single variable'
  const expected = last.kind === 'SolutionSetEq'
    ? [normalizeDisplayed(String(last.after))]
    : displayedValues(String(last.after), v)
  if (expected === null) return 'the last step does not display an answer to check against'
  if (answers.length !== expected.length) return 'the answer does not list the displayed solutions'
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i]
    if (a.label !== v) return `the answer is labelled ${a.label}, but the problem's variable is ${v}`
    if (normalizeDisplayed(a.tex) !== expected[i]) return `the answer ${a.tex} is not the displayed ${expected[i]}`
    if (a.value !== undefined && normalizeDisplayed(a.value) !== expected[i]) {
      return `the answer value ${a.value} is not the displayed ${expected[i]}`
    }
  }
  return null
}

/**
 * Validate an entire Working document: its chain, its steps, its sub-workings, its Another way, its answer
 * and its check. Rule: Only 'valid' steps are shown. One invalid or unknown step fails the working.
 * Chain: the first step must start from working.input (the problem as typed), and each step must start
 * where the step before it ends. A break anywhere makes the whole working invalid.
 * An empty working is unknown, unless it is the explicit can't-show fallback (noWorking with that reason).
 * A working whose check failed is invalid. A check line the builder does not give is invalid.
 */
export function validateWorking(working: Working, adapter: CheckAdapter = defaultCheckAdapter): WorkingValidationResult {
  if (working.checked === 'failed') {
    return { valid: false, verdict: 'invalid', reason: "The answer's check failed" }
  }
  if (working.steps.length === 0) {
    const fallback = working.noWorking === true && working.reason === CANT_SHOW_STEPS_REASON
    if (!fallback) return { valid: false, verdict: 'unknown', reason: 'The working has no steps to check' }
    if (working.answer !== undefined) {
      return { valid: false, verdict: 'invalid', reason: 'An answer without steps to check it against' }
    }
    return { valid: true }
  }

  if (typeof working.input !== 'string') {
    return {
      valid: false,
      failedStepIndex: 0,
      failedStep: working.steps[0],
      verdict: 'invalid',
      reason: 'The working has steps but no input to start them from'
    }
  }
  if (!sameState(working.steps[0].before, working.input)) {
    return chainBreak(working, 0, 'The first step does not start from the problem as typed')
  }
  for (let i = 1; i < working.steps.length; i++) {
    if (!sameState(working.steps[i].before, working.steps[i - 1].after)) {
      return chainBreak(working, i, `Step ${i + 1} does not start where step ${i} ends`)
    }
  }

  // Check main steps
  for (let i = 0; i < working.steps.length; i++) {
    const step = working.steps[i]
    const res = validateStepIn(working, i, adapter)
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

  // The Another way is part of what is shown, so it is checked like any other working.
  if (working.anotherWay) {
    const alt = validateWorking(working.anotherWay, adapter)
    if (!alt.valid) {
      return { valid: false, verdict: alt.verdict, reason: `Another way failed: ${alt.reason}` }
    }
  }

  // The answer must be what the validated last step displays.
  const wrong = answerProblem(working)
  if (wrong !== null) return { valid: false, verdict: 'invalid', reason: wrong }

  // The answer must satisfy the problem, and the check line is the one built from it.
  const sub = substitutionOf(working)
  if (sub && !sub.ok) return { valid: false, verdict: 'invalid', reason: sub.reason }
  if (working.check !== undefined && working.check !== sub?.text) {
    return { valid: false, verdict: 'invalid', reason: 'The check line is not the one its answer gives' }
  }

  return { valid: true }
}

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
  type Domain,
  type ExprOp,
  type SystemOp,
  type Step,
  type StepValidationResult,
  type ValidationVerdict,
  type Working,
  type WorkingValidationResult
} from './types'
import { rEq, rIsZero, rStr, type Rat } from '../pure/rat'
import {
  checkEquationOp,
  checkProductStep,
  isExprOp,
  type ProductData,
  checkZeroProduct,
  defaultCheckAdapter,
  displayedValues,
  linearRootOf,
  normalizeDisplayed,
  sameState,
  solutionProofOf,
  startsFromTypedProduct,
  variableOfInput,
  checkSystemOp,
  checkQuadraticSolutionSet,
  checkPolySolutionSet,
  checkSurdZeroProduct,
  displayKey,
  readSurd,
  texOfAlg,
  evalForm,
  isSystemOp,
  lettersOfSystem,
  ratOfText,
  readSystem,
  sameSystem,
  solvedValues,
  type CheckAdapter,
  type LinEq,
  arePolysProportional,
  substitutedDiscriminantText,
  tryEquationPoly,
  tryParsePoly,
  coefficientOf,
  parseExactRat
} from './check-adapter'
import { exprDegree, varsOf } from '../pure/mono'
import { ruleFor, sentenceFor, substitutionOf, systemEndingAnswer } from './sentences'
import { displaySafe, drawnTex } from './displaySafe'

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
/**
 * An ExprEq that declares a product op (S1c): the factor lists in its data are checked exactly by checkProductStep.
 */
function validateProductStep(step: Step, op: ExprOp): ValidationVerdict {
  const d = dataOf(step)
  if (!Array.isArray(d.factorsBefore) || !Array.isArray(d.factorsAfter)) return 'invalid'
  if (typeof d.index !== 'number' || typeof d.width !== 'number') return 'invalid'
  const data: ProductData = {
    variable: typeof d.variable === 'string' ? d.variable : 'x',
    factorsBefore: d.factorsBefore.map((f) => String(f)),
    factorsAfter: d.factorsAfter.map((f) => String(f)),
    index: d.index,
    width: d.width
  }
  return checkProductStep(step.before, step.after, op, data)
}

export function validateExprEq(step: Step, adapter: CheckAdapter = defaultCheckAdapter): ValidationVerdict {
  if (step.kind !== 'ExprEq') return 'invalid'
  if (step.op && isExprOp(step.op)) return validateProductStep(step, step.op)
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
  if (!step.op || isExprOp(step.op) || isSystemOp(step.op)) return 'unknown'
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
    if (roots.every((r): r is Rat => r !== null)) {
      const shown = displayedValues(String(step.after), v)
      if (shown === null) return 'unknown'
      return sameList(shown, uniqueInOrder(roots)) ? 'valid' : 'invalid'
    }
    if (Array.isArray(payload.solutions)) {
      const domain = payload.domain === 'complex' ? 'complex' : 'real'
      const polyVerdict = checkPolySolutionSet(String(step.before), payload.solutions, String(step.after), v, domain)
      if (polyVerdict !== null) return polyVerdict
    }
    return 'unknown'
  }

  // The other form: a covering of a domain (real, integers) by its cases. Its before names the domain and its after is the
  // case list, so it claims nothing about an equation: x² − 4 = 0 cannot be "split" into a list that ends as x² + 4 = 0
  // (P-FIX-S1SOUND2 MUST 1). Anything else in this form is unknown, never shown.
  const cases = Array.isArray(payload.cases) && payload.cases.every((c) => typeof c === 'string') ? (payload.cases as string[]) : null
  if (!cases || cases.length < 2) return 'unknown'
  const domain = String(step.before).trim()
  if (!COVERING_DOMAINS.has(domain)) return 'unknown'
  if (normalizeDisplayed(String(step.after)) !== normalizeDisplayed(cases.join(', '))) return 'invalid'
  return adapter.checkCaseSplitComplete(domain, cases)
}

/** The domains a covering may name (the other form of CaseSplitComplete). */
const COVERING_DOMAINS = new Set(['real', 'integers'])

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
  // S1b: a surd square root's two solutions are the sides of the factored form the step names (exact, no proof needed).
  if (payload.zeroProduct && typeof payload.zeroProduct === 'object') {
    const zp = payload.zeroProduct as { shift: string; root: string }
    if (!Array.isArray(payload.solutions) || payload.solutions.length !== 2) return 'invalid'
    return checkSurdZeroProduct(String(step.before), zp, String(step.after), v, payload.solutions as unknown[])
  }
  const domain = payload.domain === 'complex' ? 'complex' : 'real'
  if (Array.isArray(payload.solutions) && payload.solutions.length > 0) {
    // S1b: a quadratic's proposed roots are checked by G2 in the domain, then displayed exactly.
    const quad = checkQuadraticSolutionSet(String(step.before), payload.solutions, String(step.after), v, domain)
    if (quad !== null) return quad
  }
  const proof = solutionProofOf(String(step.before), v)
  if (!proof) return 'unknown'
  if (!Array.isArray(payload.solutions)) return 'invalid'
  const solutions: unknown[] = payload.solutions
  const allReals = payload.allReals === true
  // In the complex domain a quadratic always has its roots: "no solution" is never the answer there (S1b).
  if (domain === 'complex' && solutions.length === 0) return 'invalid'

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
    case 'SystemEq':
      verdict = validateSystemEq(step)
      break
    default:
      verdict = 'invalid'
  }

  return {
    verdict,
    reason: verdict === 'valid' ? undefined : `Step of kind '${step.kind}' returned verdict '${verdict}'`
  }
}

/** The four exponential and logarithmic moves (EquationOp in types.ts). They are real-only (S3). */
const EXP_LOG_MOVE_KINDS: ReadonlySet<string> = new Set(['write-as-power', 'cancel-base', 'log-to-power', 'work-out-power'])

/** True for an equation step whose declared move is one of the exponential or logarithmic moves. */
function isExpLogMove(step: Step): boolean {
  if (step.kind !== 'EquationEquiv' || !step.op || typeof step.op !== 'object') return false
  return EXP_LOG_MOVE_KINDS.has((step.op as { kind: string }).kind)
}

/** A step checked in its working: a reduction needs the working around it, every other step is checked alone. */
function validateStepIn(working: Working, index: number, adapter: CheckAdapter, domain: Domain): StepValidationResult {
  const step = working.steps[index]
  // S3: the exponential and logarithmic moves cancel a base or equate a logarithm, which is an equivalence only over the real
  // numbers. In a complex problem such a move is refused, whatever the working around it says (the method never builds one).
  if (domain !== 'real' && isExpLogMove(step)) {
    return { verdict: 'invalid', reason: 'An exponential or logarithmic move is only valid over the real numbers' }
  }
  // S1b / S3: a solution set or zero-product split is proved in the domain of the problem the working answers. A step that
  // states another domain for itself is refused (a real problem with complex roots is never shown, whatever the step's data says).
  if (step.kind === 'SolutionSetEq' || step.kind === 'CaseSplitComplete') {
    const stated = dataOf(step).domain
    if (stated !== undefined && stated !== domain) {
      return { verdict: 'invalid', reason: `The step's domain (${String(stated)}) is not the problem's (${domain})` }
    }
  }
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
/** An answer's plain value is the displayed value: the same exact number, written the same way (S1b, through G2's reader). */
function valueMatches(value: string, displayed: string): boolean {
  const x = readSurd(value)
  if (!x) return false
  try {
    return displayKey(texOfAlg(x)) === displayKey(displayed)
  } catch {
    return false
  }
}

function answerProblem(working: Working): string | null {
  if (working.answer === undefined) return null
  const answers = Array.isArray(working.answer) ? working.answer : [working.answer]
  const last = working.steps[working.steps.length - 1]
  const v = variableOfInput(working.input ?? '')
  // An expression ending (ExprEq) is compared as text and needs no variable; the reader may not take the typed input.
  if (v === null && last.kind !== 'ExprEq') return 'the answer cannot be checked: the input has no single variable'
  // A solution set with roots lists each root (S1b: a quadratic's two roots, or a double root once). A sentence ending
  // ("No real solution") and an expression are compared as one text, as before.
  const listsRoots = last.kind === 'SolutionSetEq' && Array.isArray(dataOf(last).solutions) && (dataOf(last).solutions as unknown[]).length > 0
  const expected = (last.kind === 'SolutionSetEq' && !listsRoots) || last.kind === 'ExprEq'
    ? [normalizeDisplayed(String(last.after))]
    : displayedValues(String(last.after), v ?? '')
  if (expected === null) return 'the last step does not display an answer to check against'
  if (answers.length !== expected.length) return 'the answer does not list the displayed solutions'
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i]
    // An expression ending is labelled with the one letter of the typed input (a step's own recorded variable is not
    // the problem's variable: a working could otherwise carry a label of its own choosing).
    const typedLetters = [...new Set((working.input ?? '').match(/\p{L}/gu) ?? [])]
    const variable = last.kind === 'ExprEq' ? (typedLetters.length === 1 ? typedLetters[0] : '') : v
    if (a.label !== variable) return `the answer is labelled ${a.label}, but the problem's variable is ${variable}`
    if (normalizeDisplayed(a.tex) !== expected[i]) return `the answer ${a.tex} is not the displayed ${expected[i]}`
    // The value is the displayed text (as before S1b), or the same exact number written in another way (S1b).
    if (a.value !== undefined && normalizeDisplayed(a.value) !== expected[i] && !valueMatches(a.value, expected[i])) {
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
export function validateWorking(
  working: Working,
  adapter: CheckAdapter = defaultCheckAdapter,
  problemDomain?: Domain
): WorkingValidationResult {
  // P-FIX-S1SOUND2 MUST 13: nothing thrown while checking a working reaches the page or the router. A working the checks
  // cannot read is a working that is not shown. The tree is measured once here, so a deep or cyclic one is refused fast.
  if (!treeWithinLimits(working)) return { valid: false, verdict: 'invalid', reason: 'The working is too large to check' }
  try {
    return validateWorkingChecked(working, adapter, problemDomain)
  } catch {
    return { valid: false, verdict: 'invalid', reason: 'The working could not be checked' }
  }
}

/** The longest text the checks read (P-FIX-S1SOUND2 SHOULD 1): a longer line is not checked, so not shown. */
const MAX_CHECKED_TEXT = 400

/** The most nested levels and the most workings a checked tree may have (P-FIX-S1SOUND2 MUST 13: no call runs away). */
const MAX_WORKING_DEPTH = 30
const MAX_WORKING_VISITS = 400

/**
 * The tree of a working (its sub-workings and its Another way) is small, shallow and acyclic. Counted by visits, so a cycle
 * runs into the limit and is refused rather than looping.
 */
function treeWithinLimits(root: Working): boolean {
  const stack: Array<{ w: Working; depth: number }> = [{ w: root, depth: 0 }]
  let visits = 0
  while (stack.length > 0) {
    const { w, depth } = stack.pop() as { w: Working; depth: number }
    visits++
    if (visits > MAX_WORKING_VISITS || depth > MAX_WORKING_DEPTH) return false
    if (!w || typeof w !== 'object') return false
    const subs = Array.isArray(w.subWorkings) ? w.subWorkings : []
    for (const s of subs) stack.push({ w: s, depth: depth + 1 })
    if (w.anotherWay !== undefined) stack.push({ w: w.anotherWay, depth: depth + 1 })
  }
  return true
}

/** A working's maths is drawn only as it is read: the problem, every line and every answer must be displaySafe. */
function shownAsRead(working: Working): string | null {
  const lines: unknown[] = [working.input]
  for (const s of working.steps) lines.push(s.before, s.after)
  for (const a of Array.isArray(working.answer) ? working.answer : working.answer ? [working.answer] : []) {
    // An answer is drawn from its text: one with no text is refused (a value alone is never drawn unchecked).
    if (typeof a.tex !== 'string') return 'An answer has no text'
    lines.push(a.tex)
  }
  for (const t of lines) {
    if (t === undefined) continue
    if (typeof t !== 'string') return 'A line is not text'
    if (t.length > MAX_CHECKED_TEXT) return 'A line is too long to check'
    if (!displaySafe(drawnTex(t))) return 'A line would be drawn differently from how it is read'
  }
  return null
}

/** The answer's labels and displayed texts, as one key: two ways agree when their keys agree. */
function answerKey(w: Working): string {
  return (Array.isArray(w.answer) ? w.answer : w.answer ? [w.answer] : [])
    .map((a) => `${a.label}=${normalizeDisplayed(a.tex)}`)
    .sort()
    .join(';')
}

/**
 * The sub-workings of a working belong to it (P-FIX-S1SOUND2 MUST 8): each is the discriminant of this equation, or the
 * solution of one zero-product case of its own split, and every case has exactly one. Null when they belong.
 */
function subWorkingsBelong(working: Working): string | null {
  const subs = working.subWorkings ?? []
  const v = variableOfInput(working.input ?? '')
  const split = working.steps.find((s) => s.kind === 'CaseSplitComplete' && dataOf(s).form === 'zero-product')
  const cases = split && Array.isArray(dataOf(split).cases) ? (dataOf(split).cases as unknown[]).map((c) => String(c)) : null
  const parent = working.input ? tryEquationPoly(working.input) : null
  // A double root has two equal cases and one case to solve: the distinct case texts are what each sub-working belongs to.
  const distinct = cases ? cases.filter((text, i) => cases.findIndex((other) => sameState(other, text)) === i) : null
  const used = new Set<number>()
  for (const sub of subs) {
    const first = sub.steps[0]
    const d = first ? dataOf(first) : {}
    if (d.role === 'discriminant') {
      const a = String(d.a)
      const b = String(d.b)
      const c = String(d.c)
      const own = v && parent ? tryParsePoly(`(${a})*${v}^2 + (${b})*${v} + (${c})`) : null
      // The parent must be a quadratic (its x² term non-zero) and the discriminant's a must be non-zero too: a linear equation
      // has no discriminant to show (review of P-FIX-S1SOUND2, MUST C).
      const lead = parseExactRat(a)
      const parentLead = v && parent ? coefficientOf(parent, v, 2) : null
      if (
        !own ||
        !parent ||
        !lead ||
        rIsZero(lead) ||
        !parentLead ||
        rIsZero(parentLead) ||
        !arePolysProportional(parent, own) ||
        sub.input !== substitutedDiscriminantText(a, b, c)
      ) {
        return 'A discriminant does not belong to its equation'
      }
      continue
    }
    const k = distinct ? distinct.findIndex((text) => sameState(sub.input ?? '', text)) : -1
    if (!distinct || !v || k < 0) return 'A sub-working belongs to no case of its equation'
    used.add(k)
    const root = linearRootOf(distinct[k], v)
    const answers = Array.isArray(sub.answer) ? sub.answer : sub.answer ? [sub.answer] : []
    if (root) {
      if (answers.length !== 1 || normalizeDisplayed(answers[0].tex) !== rStr(root)) {
        return 'A sub-working does not solve its case'
      }
      continue
    }
    const casePoly = tryEquationPoly(distinct[k])
    if (!casePoly || varsOf(casePoly).some((name) => name !== v) || exprDegree(casePoly) < 2 || answers.length === 0) {
      return 'A sub-working does not solve its case'
    }
    const parentAnswers = Array.isArray(working.answer) ? working.answer : working.answer ? [working.answer] : []
    for (const a of answers) {
      if (normalizeDisplayed(a.tex) === normalizeDisplayed('\\text{No real solution}')) continue
      if (!parentAnswers.some((pa) => displayKey(pa.tex) === displayKey(a.tex))) {
        return 'A sub-working does not solve its case'
      }
    }
  }
  return null
}

function validateWorkingChecked(
  working: Working,
  adapter: CheckAdapter,
  problemDomain?: Domain
): WorkingValidationResult {
  // S1b: the domain is the problem's when the caller gives it (renderWorkingToDoc and the router do). The working's own
  // copy is then only a record that must agree with it: a working rewritten in both copies is refused against the problem.
  if (problemDomain !== undefined && working.domain !== undefined && working.domain !== problemDomain) {
    return { valid: false, verdict: 'invalid', reason: "The working's domain is not the problem's" }
  }
  const domain: Domain = problemDomain ?? working.domain ?? 'real'
  if (working.checked === 'failed') {
    return { valid: false, verdict: 'invalid', reason: "The answer's check failed" }
  }
  if (working.steps.length === 0) {
    const fallback = working.noWorking === true && working.reason === CANT_SHOW_STEPS_REASON
    if (!fallback) return { valid: false, verdict: 'unknown', reason: 'The working has no steps to check' }
    if (working.answer !== undefined) {
      return { valid: false, verdict: 'invalid', reason: 'An answer without steps to check it against' }
    }
    // The can't-show fallback has no sub-working to show either: a sub-working is checked against its parent's steps.
    if ((working.subWorkings ?? []).length > 0) {
      return { valid: false, verdict: 'invalid', reason: 'A sub-working without steps of its parent to belong to' }
    }
    return { valid: true }
  }

  // Every line the page would draw is checked as drawn (P-FIX-S1SOUND2 MUST 6), in both paths.
  const drawn = shownAsRead(working)
  if (drawn !== null) return { valid: false, verdict: 'invalid', reason: drawn }

  // A system (two or more equations) is validated on its own path: its own chain, its own answer and check.
  if (isSystemInput(working.input ?? '')) return validateSystemWorking(working, adapter, domain)

  if (typeof working.input !== 'string') {
    return {
      valid: false,
      failedStepIndex: 0,
      failedStep: working.steps[0],
      verdict: 'invalid',
      reason: 'The working has steps but no input to start them from'
    }
  }
  const firstStep = working.steps[0]
  const typedFactors =
    firstStep.kind === 'ExprEq' && isExprOp(firstStep.op) ? (firstStep.data as unknown as ProductData).factorsBefore : undefined
  if (!sameState(firstStep.before, working.input) && !startsFromTypedProduct(typedFactors, working.input)) {
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
    const res = validateStepIn(working, i, adapter, domain)
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
      const subRes = validateWorkingChecked(sub, adapter, domain)
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

  // The sub-workings belong to this working's own equation and split (P-FIX-S1SOUND2 MUST 8).
  const belong = subWorkingsBelong(working)
  if (belong !== null) return { valid: false, verdict: 'invalid', reason: belong }

  // The Another way is part of what is shown, so it is checked like any other working, and it answers this problem: the
  // same input and the same answer (P-FIX-S1SOUND2 SHOULD 4).
  if (working.anotherWay) {
    const alt = validateWorkingChecked(working.anotherWay, adapter, domain)
    if (!alt.valid) {
      return { valid: false, verdict: alt.verdict, reason: `Another way failed: ${alt.reason}` }
    }
    if (!sameState(working.anotherWay.input ?? '', working.input ?? '') || answerKey(working.anotherWay) !== answerKey(working)) {
      return { valid: false, verdict: 'invalid', reason: 'Another way is not a way to this answer' }
    }
  }

  // A working with steps gives its answer: with none, the substitution below would be skipped, and a one-way step could
  // show roots that are not roots (P-FIX-S1SOUND2 MUST 3).
  // A working that moves one way (an implication), splits into cases, or ends in a solution set gives its answer, so the
  // substitution below runs (P-FIX-S1SOUND2 MUST 3). A chain of equivalent equations, an expansion or a discriminant
  // claims no root, so it needs none.
  const last = working.steps[working.steps.length - 1]
  const claimsRoots =
    working.steps.some((s) => s.kind === 'Implication' || s.kind === 'CaseSplitComplete') || last.kind === 'SolutionSetEq'
  // The rule follows the steps, not the input's text: a one-way step or a solution set claims roots whatever the input looks like.
  if (claimsRoots && working.answer === undefined) {
    return { valid: false, verdict: 'invalid', reason: 'A working with steps must give its answer' }
  }

  // The answer must be what the validated last step displays.
  const wrong = answerProblem(working)
  if (wrong !== null) return { valid: false, verdict: 'invalid', reason: wrong }

  // The answer must satisfy the problem, and the check line is the one built from it.
  const sub = substitutionOf(working)
  if (sub && !sub.ok) return { valid: false, verdict: 'invalid', reason: sub.reason }

  // After a one-way step (an Implication), the last equation can have more solutions than the problem (MUST 2, 3).
  // "No solution" still follows (the problem's solutions are among the last equation's), "every real number" does not,
  // and every root shown must be put back into the problem as typed and hold.
  if (working.steps.some((s) => s.kind === 'Implication')) {
    const last = working.steps[working.steps.length - 1]
    const ld = dataOf(last)
    const noSolution = last.kind === 'SolutionSetEq' && Array.isArray(ld.solutions) && ld.solutions.length === 0 && ld.allReals !== true
    if (!noSolution && !(sub && sub.ok)) {
      return { valid: false, verdict: 'invalid', reason: 'After a one-way step, every answer must be put back into the problem and hold' }
    }
  }
  if (working.check !== undefined && working.check !== sub?.text) {
    return { valid: false, verdict: 'invalid', reason: 'The check line is not the one its answer gives' }
  }
  // The check line is drawn as the validator read it: its maths (the words of the sentence aside) must be display-safe.
  if (working.check !== undefined && !displaySafe(drawnTex(working.check.replace(/[A-Za-z]{2,}/g, ' ')))) {
    return { valid: false, verdict: 'invalid', reason: 'The check line would be drawn differently from how it is read' }
  }

  return { valid: true }
}

// ---- S1d: systems of simultaneous linear equations ----

/** True for an input that is a system: two or more equations, each a linear form read exactly. */
function isSystemInput(text: string): boolean {
  const eqs = readSystem(text)
  return eqs !== null && eqs.length >= 2
}

/** True for an ending step (no solution, or infinitely many): its after is a sentence, and it is the last step. */
function isEndingStep(step: Step): boolean {
  return (
    step.kind === 'SystemEq' &&
    isSystemOp(step.op) &&
    (step.op.kind === 'no-common-solution' || step.op.kind === 'infinitely-many')
  )
}

/** The letter list a SystemEq step carries in its data, or null when it carries none. */
function systemVarsOfStep(step: Step): string[] | null {
  const vars = (step.data as { vars?: unknown } | undefined)?.vars
  return Array.isArray(vars) && vars.every((v) => typeof v === 'string') ? (vars as string[]) : null
}

/** One SystemEq step on its own: its op checked against the system it starts from and the one it ends with. */
export function validateSystemEq(step: Step): ValidationVerdict {
  if (step.kind !== 'SystemEq' || !isSystemOp(step.op)) return 'invalid'
  const vars = systemVarsOfStep(step)
  if (!vars) return 'invalid'
  // The letters a step uses are among the letters it claims: a claimed list cannot hide a letter the system has.
  const before = readSystem(String(step.before))
  if (!before || !lettersWithin(before, vars)) return 'invalid'
  if (isEndingStep(step)) return checkSystemOp(step.op, before, null, vars)
  const after = readSystem(String(step.after))
  if (!after || !lettersWithin(after, vars)) return 'invalid'
  return checkSystemOp(step.op, before, after, vars)
}

/** True when every letter a system uses is one of the letters given. */
function lettersWithin(eqs: LinEq[], vars: string[]): boolean {
  return lettersOfSystem(eqs).every((n) => vars.includes(n))
}

/**
 * A working of a system: the first step starts from the system as typed, each step starts where the one before ends,
 * every step is valid on its own, an ending is the last step, and the answer is what the last step gives. For a
 * solution the answer's values must state every letter alone in the last system and satisfy every typed equation
 * exactly (the check: each typed equation, with the values put in, has equal sides).
 */
function validateSystemWorking(working: Working, adapter: CheckAdapter, domain: Domain): WorkingValidationResult {
  const fail = (index: number | undefined, reason: string): WorkingValidationResult => ({
    valid: false,
    verdict: 'invalid',
    failedStepIndex: index,
    failedStep: index === undefined ? undefined : working.steps[index],
    reason
  })
  if (working.checked === 'failed') return fail(undefined, "The answer's check failed")
  // A system's sub-workings and check line are never built here: a sub-working or a check that is there is not checked,
  // so it is not shown (P-FIX-S1SOUND2 MUST 7 and SHOULD 4).
  if ((working.subWorkings ?? []).length > 0) return fail(undefined, 'A system has no sub-working to check')
  if (working.check !== undefined) return fail(undefined, 'A system has no check line to check')
  const typed = readSystem(working.input ?? '')
  if (!typed) return fail(undefined, 'The system as typed is not read exactly')
  const vars = lettersOfSystem(typed)
  if (vars.length === 0) return fail(undefined, 'The system has no letters to solve for')
  const steps = working.steps
  for (let i = 0; i < steps.length; i++) {
    const named = systemVarsOfStep(steps[i])
    if (!named || named.join(',') !== vars.join(',')) return fail(i, 'A step names other letters than the system as typed')
  }
  if (steps.length === 0) return fail(undefined, 'The working has no steps to check')
  const first = readSystem(String(steps[0].before))
  if (!first || !sameSystem(first, typed)) return fail(0, 'The first step does not start from the system as typed')
  let current: LinEq[] = typed
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    if (isEndingStep(step) && i !== steps.length - 1) return fail(i, 'An ending must be the last step')
    if (i > 0) {
      const before = readSystem(String(step.before))
      if (!before || !sameSystem(before, current)) return fail(i, `Step ${i + 1} does not start where step ${i} ends`)
    }
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
    if (!isEndingStep(step)) {
      const next = readSystem(String(step.after))
      if (!next) return fail(i, 'A step does not end in a system')
      current = next
    }
  }

  const last = steps[steps.length - 1]
  const answers = working.answer === undefined ? [] : Array.isArray(working.answer) ? working.answer : [working.answer]
  if (isEndingStep(last)) {
    const words = systemEndingAnswer(last.op as SystemOp, vars.length)
    const said = normalizeDisplayed(String(last.after))
    // An ending's answer has no letter: its label is empty, and its text is the ending's words.
    // The words are drawn as text (\text{...}), so the ending's line and its answer are that text (P-FIX-S1SOUND2 SHOULD 2).
    const want = words === null ? null : normalizeDisplayed(`\\text{${words}}`)
    if (answers.length !== 1 || answers[0].label !== '' || want === null || normalizeDisplayed(answers[0].tex) !== want || said !== want) {
      return fail(steps.length - 1, 'The answer is not the ending the last step gives')
    }
  } else {
    const values = solvedValues(current, vars)
    if (!values) return fail(steps.length - 1, 'The last step does not state every letter alone')
    if (answers.length !== vars.length || new Set(answers.map((a) => a.label)).size !== vars.length) {
      return fail(undefined, 'The answer does not list each letter once')
    }
    for (const a of answers) {
      // The value the answer carries, when it has one, is the same number as its displayed text (SHOULD 4).
      const r = ratOfText(a.tex)
      const carried = a.value === undefined ? r : ratOfText(a.value)
      if (!vars.includes(a.label) || !r || !carried || !rEq(r, values[a.label]) || !rEq(carried, values[a.label])) {
        return fail(undefined, `The answer ${a.label} = ${a.tex} is not the value the last step gives`)
      }
    }
    // The check: every equation as typed holds with the answer's values put in, both sides equal, exactly.
    for (let k = 0; k < typed.length; k++) {
      const left = evalForm(typed[k].L, values)
      const right = evalForm(typed[k].R, values)
      if (!left || !right || !rEq(left, right)) return fail(undefined, `The answer does not satisfy equation ${k + 1}`)
    }
  }

  // Another way is shown with the same answer: it is checked like a working, and it must agree with this one.
  if (working.anotherWay) {
    const alt = validateWorkingChecked(working.anotherWay, adapter, domain)
    if (!alt.valid) return { valid: false, verdict: alt.verdict, reason: `Another way failed: ${alt.reason}` }
    if (!sameState(working.anotherWay.input ?? '', working.input ?? '')) return fail(undefined, 'Another way is for another system')
    // The two ways agree when they reach the same answer, or the same ending (which line names the solutions may differ).
    const key = (w: Working): string => {
      const end = w.steps[w.steps.length - 1]
      if (end && isEndingStep(end)) return `ending:${String((end.op as { kind?: unknown }).kind)}`
      return (Array.isArray(w.answer) ? w.answer : w.answer ? [w.answer] : [])
        .map((a) => `${a.label}=${normalizeDisplayed(a.tex)}`)
        .sort()
        .join(';')
    }
    if (key(working.anotherWay) !== key(working)) return fail(undefined, 'Another way gives a different answer')
  }
  return { valid: true }
}

// The step framework types: problems, typed steps, methods, working and the router.
//
// Part of the PhysLab step engine (S0). Every step in a solution carries a mathematical
// kind and must pass an independent validator before being displayed.

import type { MathNode } from 'mathjs'

export type Domain = 'real' | 'complex'

/**
 * The framework's explicit "can't show the steps" fallback. A working with no steps is accepted by the
 * validators only when it is this fallback (noWorking with this reason); any other empty working is unknown.
 */
export const CANT_SHOW_STEPS_REASON = "I can't show the steps for this one yet"

/**
 * A problem passed to the step router and methods.
 */
export interface Problem {
  /** The operation requested: 'solve', 'simplify', 'expand', 'factor', 'differentiate', etc. */
  job: string
  /** The problem expression or equation as a mathjs AST or string. */
  input: MathNode | string
  /** The unknown or target variable, if applicable (e.g. 'x'). */
  variable?: string
  /** The mathematical domain: 'real' by default (from G00 when merged). */
  domain?: Domain
  /** Real odd roots rule (e.g. (-8)^(1/3) = -2). Default true. */
  realOddRoots?: boolean
  /** Optional metadata or raw input string. */
  rawInput?: string
  angleUnit?: 'deg' | 'rad'
  metadata?: Record<string, unknown>
}

/**
 * The six sound step kinds. Each has its own independent validator.
 */
export type StepKind =
  | 'ExprEq'
  | 'EquationEquiv'
  | 'Implication'
  | 'CaseSplitComplete'
  | 'SolutionSetEq'
  | 'SubproblemReduction'
  | 'SystemEq'
  | 'IneqMove'
  | 'IneqCritical'
  | 'IneqSigns'
  | 'IneqSolutionSet'

/**
 * What a divide or multiply move is for. The sentence builder (sentences.ts) writes the words from it.
 * Quadratic normalising: the leading term made positive or 1, or a common factor divided out.
 */
export type ScalePurpose = 'leading-positive' | 'leading-one' | 'common-factor'

/**
 * The move an EquationEquiv step claims. Every move is checked SIDE BY SIDE (check-adapter.ts,
 * checkEquationOp): the new left side L2 and right side R2 are compared with the old L1 and R1, never
 * only by their difference. Numbers are exact rational text ("-2", "1/2"); terms are polynomial text.
 * - add-both / subtract-both {term}: L2 ≡ L1 ± term and R2 ≡ R1 ± term.
 * - multiply-both {k} / divide-both {k}: L2 ≡ k·L1 and R2 ≡ k·R1 (k ≠ 0); divide: L1 ≡ k·L2 and R1 ≡ k·R2.
 * - clear-decimals {k}: as multiply-both, but k must be a power of ten (≥ 10) and the before must contain a decimal.
 * - clear-fractions {k}: as multiply-both, but k must be the LCD of the reduced denominators in the before.
 * - move-to-left: L2 ≡ L1 − R1 and R2 ≡ 0.
 * - expand-sides, collect-like-terms, work-out-right, factorise, complete-square, already-solved:
 *   L2 ≡ L1 and R2 ≡ R1, AND each label's own structural check (check-adapter.ts, checkRewrite): a label
 *   whose structure is not there is invalid even when the two sides are equal.
 * - square-root-pm {shift, root}: a rewrite whose left side is (x − shift − root)(x − shift + root).
 * - swap: L2 ≡ R1 and R2 ≡ L1.
 * - write-as-power {base, power}: the right side (a whole number c) becomes base^power with base^power = c; the left is unchanged.
 * - cancel-base {base}: base^E1 = base^n becomes E1 = n (equal powers of one base above 1 have equal exponents).
 * - log-to-power {base}: log_base(A) = c becomes A = base^c (base 10 is written log(A), no base digits).
 * - work-out-power: L = base^c becomes L = its whole-number value; the left is unchanged.
 * - exp-to-log {base}: base^(x) = c (c above 0) becomes x = ln c (base e), or x = ln c / ln b (a whole base b). Exact (expRoots.ts).
 * - log-to-exp: ln(A) = c (c a whole number) becomes A = e^c. Exact (expRoots.ts).
 * - work-out-exp: L = e^(0) becomes L = 1; the left is unchanged.
 * The exponential and logarithmic moves are checked by checkExpLogOp (check-adapter.ts), exactly, never by the polynomial path.
 * add-both / subtract-both / multiply-both / divide-both are also used on a side that holds an exponential atom (2e^(x) - 3):
 * checkEquationOp routes those to expRoots.ts, which compares the sides as sums of the atom and a constant.
 */
export type EquationOp =
  | { kind: 'write-as-power'; base: string; power: string }
  | { kind: 'cancel-base'; base: string }
  | { kind: 'log-to-power'; base: string }
  | { kind: 'work-out-power' }
  | { kind: 'exp-to-log'; base: string }
  | { kind: 'log-to-exp' }
  | { kind: 'work-out-exp' }
  | { kind: 'add-both'; term: string }
  | { kind: 'subtract-both'; term: string }
  | { kind: 'multiply-both'; k: string; purpose?: 'leading-positive' }
  | { kind: 'divide-both'; k: string; purpose?: ScalePurpose }
  | { kind: 'clear-decimals'; k: string }
  | { kind: 'clear-fractions'; k: string }
  | { kind: 'move-to-left' }
  | { kind: 'expand-sides' }
  | { kind: 'collect-like-terms' }
  | { kind: 'work-out-right' }
  | { kind: 'factorise' }
  | { kind: 'complete-square' }
  | { kind: 'square-root-pm'; shift: string; root: string }
  | { kind: 'swap' }
  | { kind: 'remove-brackets' }
  | { kind: 'already-solved' }
  | { kind: 'divide-cos' }
  | { kind: 'trig-ref-angle'; angle?: string; quad?: string }
  | { kind: 'trig-general' }
  | { kind: 'trig-substitute' }
  // rejected: the roots of the equation in u that lie outside -1 to 1 (a sine or cosine has no angle for them), as values.
  | { kind: 'trig-back-substitute'; rejected?: string[] }
  // TRIGGEN: a value that is not a table value. The principal angle (its exact text and its decimal in the unit) and the general
  // solution written with the inverse function. Checked by trigInverse.ts, never by the table checks above.
  | ({ kind: 'trig-inverse'; angle: string; value: string } & TrigInverseSpec)
  | ({ kind: 'trig-inverse-general' } & TrigInverseSpec)

/**
 * The move an ExprEq step claims (S1c: expanding and factorising). A step replaces the factors
 * [index, index + width) of its product by new factors (its data holds the two factor lists, see methods/productState.ts).
 * Each op is checked exactly by check-adapter.ts (checkProductStep):
 * - expand-factors: the factors of the product multiplied out term by term, nothing collected.
 * - collect-factor: one sum, collected and put in order.
 * - take-out-hcf: a sum written as [highest common factor, rest], the rest primitive.
 * - difference-of-squares / perfect-square / cube-factor: the standard identities, with the declared parts.
 * - split-middle / group-pairs / common-binomial: the ac method, a sum split and grouped, then the common binomial.
 * - linear-factor: a linear factor found by the rational root test; the rest is the exact quotient.
 * - irreducible: a factor with no factorisation over the rationals, proved (a non-square discriminant, or no rational root for degree 3).
 */
export type ExprOp =
  | { kind: 'expand-factors' }
  | { kind: 'collect-factor' }
  | { kind: 'take-out-hcf' }
  | { kind: 'difference-of-squares'; a: string; b: string }
  | { kind: 'perfect-square'; a: string; b: string; sign: '+' | '-' }
  | { kind: 'split-middle'; p: string; q: string }
  | { kind: 'group-pairs'; m1: string; m2: string; common: string; sign: '+' | '-' }
  | { kind: 'common-binomial'; m1: string; m2: string; common: string; sign: '+' | '-' }
  | { kind: 'cube-factor'; a: string; b: string; sign: '+' | '-' }
  | { kind: 'linear-factor'; root: string }
  | { kind: 'irreducible' }

/**
 * The move a SystemEq step claims (S1d: simultaneous linear equations). A system is a list of equations, each
 * side a linear form in the letters. Indices are positions in the list, from 0. Each op is checked exactly by
 * check-adapter.ts (checkSystemOp); the texts the sentence names (expr, row, texts) are checked too.
 * - scale-equation {i, k}: equation i times k on both sides (k a non-zero, non-one rational).
 * - add-equations {i, j}: equation i becomes Eᵢ + Eⱼ side by side; subtract-equations {i, j}: Eᵢ − Eⱼ.
 * - make-subject {i, v}: equation i rearranged to v = P (the same equation: v − P is a multiple of it).
 * - substitute {i, j, v, expr}: equation j with v put as P (equation i is v = P, expr its text); the result is in
 *   the form (letters on the left, a number on the right). back-substitute: as substitute, P a number only.
 * - no-common-solution {i, row}: equation i reads 0 = c with c not zero (row is its text).
 * - infinitely-many {rows, texts}: independent equations whose lines (texts) are all the solutions, and every
 *   other equation reads 0 = 0; there are fewer of them than letters.
 */
export type SystemOp =
  | { kind: 'scale-equation'; i: number; k: string }
  | { kind: 'add-equations'; i: number; j: number }
  | { kind: 'subtract-equations'; i: number; j: number }
  | { kind: 'make-subject'; i: number; v: string }
  | { kind: 'substitute'; i: number; j: number; v: string; expr: string }
  | { kind: 'back-substitute'; i: number; j: number; v: string; expr: string }
  | { kind: 'no-common-solution'; i: number; row: string }
  | { kind: 'infinitely-many'; rows: number[]; texts: string[] }

/**
 * One step of mathematical working.
 */
export interface Step<T = unknown> {
  /** The mathematical step kind determining which validator checks it. */
  kind: StepKind
  /** The declared move. An EquationEquiv without one is 'unknown' and is never shown. */
  op?: EquationOp | ExprOp | SystemOp
  /** The state before this move (expression or equation as string or AST). */
  before: string | MathNode
  /** The state after this move (expression or equation as string or AST). */
  after: string | MathNode
  /** Plain English sentence describing what happened, maths in PhysLab notation, never code. */
  sentence: string
  /** The formula or law used, shown as a chip beside the step. */
  rule?: string
  /** An explanatory note or warning. */
  note?: string
  /** Subgoal or stage heading (e.g. "Expand brackets", "Collect like terms"). */
  subgoal?: string
  /** Extra typed data for the validator if needed (e.g. variable, cases, sub-answers). */
  data?: T
}

/**
 * The verdict of a step validator.
 * Only 'valid' steps are ever shown to a student.
 */
export type ValidationVerdict = 'valid' | 'invalid' | 'unknown'

export interface StepValidationResult {
  verdict: ValidationVerdict
  reason?: string
}

export interface WorkingValidationResult {
  valid: boolean
  failedStepIndex?: number
  failedStep?: Step
  verdict?: ValidationVerdict
  reason?: string
}

/**
 * An answer produced by a method or step.
 */
export interface StepAnswer {
  label: string
  tex: string
  value?: string
  /**
   * Set when tex is a displayed decimal of an angle whose exact value is not a table value (trigInverse.ts): the exact root lies
   * within tol of tex, and the same root comes back every period (in the unit). The card matches its own roots within this, and no more.
   */
  approx?: { tol: number; period: number }
}

/**
 * A trig equation whose value is not a table value (TRIGGEN): the function, the exact value written as rTex writes a rational
 * (2, -2, \frac{2}{3}, -\frac{2}{3}), and the unit the angles are shown in.
 */
export interface TrigInverseSpec {
  fn: 'sin' | 'cos' | 'tan'
  c: string
  unit: 'deg' | 'rad'
}

/**
 * A completed or partial piece of worked-out mathematics.
 * Steps nest cleanly via subWorkings.
 */
export interface Working {
  /** The steps of the working. Every step must validate as 'valid' to be displayed. */
  steps: Step[]
  /** Nested sub-workings (foldable). */
  subWorkings?: Working[]
  /** The final answer(s) of this working. */
  answer?: StepAnswer | StepAnswer[]
  /** An alternative genuine way to solve the problem (e.g. completing the square vs formula). */
  anotherWay?: Working
  /** Descriptive title for display: e.g. "Solve 2x + 4 = 10". */
  title?: string
  /** The input as LaTeX or formatted maths. */
  /** The problem as typed (stringified). The first step's before must match it; steps must chain (P-FIX-S0SOUND). */
  input?: string
  /** Name of the method used: "Linear equation in one variable". */
  method?: string
  /**
   * A method's own check line. Never shown as written: the validator builds the check from the validated
   * answer substituted into the input (sentences.ts, substitutionOf). A different line makes the working invalid.
   */
  check?: string
  /** Verdict of the answer check. */
  checked?: 'ok' | 'failed'
  /**
   * The problem's domain (S1b). Every SolutionSetEq step must claim this same domain (its data.domain, 'real' when
   * absent): a step cannot change the domain of the problem it answers. Absent means real.
   */
  domain?: Domain
  /** Error sentence if the problem cannot be handled. */
  error?: string
  /** True when steps could not be verified or shown; the answer alone may still show. */
  noWorking?: boolean
  /** Why steps are not shown when noWorking is true. */
  reason?: string
}

export interface MethodApplies {
  applies: boolean
  why?: string
}

/**
 * A mathematical method that solves a class of problems and generates steps.
 */
export interface Method {
  id: string
  name: string
  /** International / primary methods have lower order numbers. */
  order?: number
  /** True if this is an alternative method ("Another way"). */
  isAlternative?: boolean
  /** Whether this method applies to the given problem. */
  appliesTo: (problem: Problem) => MethodApplies | boolean
  /** Solve the problem, optionally delegating sub-problems to the router. */
  solve: (problem: Problem, router: StepRouter) => Working
}

export interface RouterOptions {
  maxDepth?: number
  maxSteps?: number
  currentDepth?: number
  stepCount?: number
  includeAlternatives?: boolean
}

/**
 * The router that chains methods, passes sub-problems, and enforces validation.
 */
export interface StepRouter {
  solve: (problem: Problem, options?: RouterOptions) => Working
  registerMethod: (method: Method) => void
  getMethods: () => Method[]
}

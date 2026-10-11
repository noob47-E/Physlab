// The step framework types: problems, typed steps, methods, working and the router.
//
// Part of the PhysLab step engine (S0). Every step in a solution carries a mathematical
// kind and must pass an independent validator before being displayed.

import type { MathNode } from 'mathjs'

export type Domain = 'real' | 'complex'

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

/**
 * One step of mathematical working.
 */
export interface Step<T = unknown> {
  /** The mathematical step kind determining which validator checks it. */
  kind: StepKind
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
  input?: string
  /** Name of the method used: "Linear equation in one variable". */
  method?: string
  /** A line that proves the answer, by substitution or verification. */
  check?: string
  /** Verdict of the answer check. */
  checked?: 'ok' | 'failed'
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

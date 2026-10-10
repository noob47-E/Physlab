// The engine socket (CLEANUP-PLAN.md CW15): what PhysLab asks an algebra engine, and what it gets
// back, in PhysLab's own terms. An adapter (math/engine/sympy/ today; Giac or Rubi later) turns a
// request into its engine's language and the reply back into these shapes. Nothing outside an
// adapter knows which engine answered, how it spells infinity, or what its rule trees look like.

import type { DigitSettings } from '../format'
import type { Working } from '../pure/work'

/** Every job an engine can be asked to do. An adapter says which of them it answers. */
export const ENGINE_JOBS = [
  'exact', // the exact form of a number: 0.333… → 1/3, 1.414… → √2
  'eval', // simplify and evaluate an expression with no letters
  'simplify',
  'expand',
  'factor', // over the rationals
  'factorComplex', // over the complex numbers ("Factorise with i")
  'apart', // partial fractions
  'diff',
  'integrate', // indefinite, or definite with lower and upper
  'limit',
  'series',
  'solve', // one equation or a system
  'integralSteps', // the answer and the worked steps of an integral
  'diffSteps' // the answer and the worked steps of a derivative
] as const
export type EngineJob = (typeof ENGINE_JOBS)[number]

/**
 * A request, in PhysLab's spelling: the line as the student's input reads it after PhysLab's own
 * reader (2*x, x^2, sin(x), sqrt(x), Greek letters as θ, infinity as ∞ or Infinity, `lambda` as a
 * name). An adapter spells it for its engine. Which keys a job reads:
 * - exact, eval, simplify, expand, factor, factorComplex, apart: `expr`
 * - diff: `expr`, `var`, `order` (1), and `at` for the value at a point
 * - integrate: `expr`, `var`, and `lower` with `upper` for a definite integral
 * - limit: `expr`, `var`, `to`, `dir` ('+', '-' or both)
 * - series: `expr`, `var`, `at` (0), `n` (6 terms)
 * - solve: `eqs` (each "lhs = rhs", or an expression equal to 0) and `vars` (all letters when left out)
 * - integralSteps, diffSteps: as integrate and diff
 * `deg` says the trig functions take degrees.
 */
export interface EngineRequest {
  expr?: string
  eqs?: string[]
  vars?: string[]
  var?: string
  order?: number
  at?: string
  lower?: string
  upper?: string
  to?: string
  dir?: '+' | '-' | '+-'
  n?: number
  deg: boolean
}

/** One value as PhysLab shows it: LaTeX for the screen, a plain form, and its number when it has one. */
export interface EngineValue {
  latex: string
  /** A plain form, for copying and for PhysLab's own checks (not shown as typed maths). */
  text: string
  numeric: { re: number; im?: number } | null
  /** diff with `at`: the derivative's value there. */
  value?: EngineValue
}

/**
 * An answer, or a refusal. `error` is always a sentence a student can read — never the engine's own
 * message. A solve answers with `solutions`: one row per solution, each letter's value.
 */
export interface EngineResult extends EngineValue {
  error?: string
  solutions?: Record<string, EngineValue>[]
  vars?: string[]
}

/** What a steps job needs besides the request: the line as the student typed it, and how to write numbers. */
export interface StepsContext {
  /** The line as typed, shown as the working's input. */
  input: string
  digits?: DigitSettings
}

/** Where an engine is, for the waiting lines: idle, loading (with how far), ready, or failed. */
export interface EngineStatus {
  status: 'idle' | 'loading' | 'ready' | 'error'
  message?: string
  /** Requests waiting for an answer. */
  busy: number
  /** The last load stage reported, 1 … `stages` while loading; 0 before the first. */
  stage: number
}

/** An algebra engine behind the socket. */
export interface MathEngine {
  /** A short name for logs and tests; never shown to a student. */
  readonly name: string
  /** The jobs this adapter answers. Asked anything else, it answers with an error sentence. */
  readonly jobs: ReadonlySet<EngineJob>
  ask(job: Exclude<EngineJob, 'integralSteps' | 'diffSteps'>, req: EngineRequest): Promise<EngineResult>
  /** The worked steps of an integral or a derivative, set out as PhysLab's working; a refusal comes back as a working with `error`. */
  workSteps?(job: 'integralSteps' | 'diffSteps', req: EngineRequest, ctx: StepsContext): Promise<Working>
}

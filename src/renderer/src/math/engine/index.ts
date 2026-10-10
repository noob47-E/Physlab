// The engine socket (CLEANUP-PLAN.md CW15): the one place that says which algebra engine answers
// each job. Everything else asks through `ask` and `workSteps` and reads `useEngineStatus`; it
// never names an engine. To plug in another engine (Giac, Rubi), write an adapter that passes
// tests/engine/conformance.ts and point its jobs at it in ENGINE_FOR.

import type { Working } from '../pure/work'
import type { EngineJob, EngineRequest, EngineResult, MathEngine, StepsContext } from './types'
import { sympyEngine } from './sympy/adapter'
import { BOOT_STAGES, STAGE_WORDS } from './sympy/stages'

export type { EngineJob, EngineRequest } from './types'

const ENGINES = { sympy: sympyEngine() } satisfies Record<string, MathEngine>

/** Which engine answers each job. One line per job, so moving one job to another engine is one edit. */
export const ENGINE_FOR: Record<EngineJob, keyof typeof ENGINES> = {
  exact: 'sympy',
  eval: 'sympy',
  simplify: 'sympy',
  expand: 'sympy',
  factor: 'sympy',
  factorComplex: 'sympy',
  apart: 'sympy',
  diff: 'sympy',
  integrate: 'sympy',
  limit: 'sympy',
  series: 'sympy',
  solve: 'sympy',
  integralSteps: 'sympy',
  diffSteps: 'sympy'
}

/** Ask the engine for a job's answer. */
export const ask = (job: Exclude<EngineJob, 'integralSteps' | 'diffSteps'>, req: EngineRequest): Promise<EngineResult> => ENGINES[ENGINE_FOR[job]].ask(job, req)

/** The worked steps of an integral or a derivative; a refusal is a working with `error`. */
export function workSteps(job: 'integralSteps' | 'diffSteps', req: EngineRequest, ctx: StepsContext): Promise<Working> {
  const engine = ENGINES[ENGINE_FOR[job]]
  if (!engine.workSteps) return Promise.resolve({ title: '', input: ctx.input, moves: [], answers: [], error: 'This engine cannot show the working of this job.' })
  return engine.workSteps(job, req, ctx)
}

// The engine that loads (the one the waiting lines follow) and how its first load reads. Passed on
// as live bindings, never read here: a test that stands in for the worker gives only what it needs.

/** How many stages the first load reports, and what each is doing in a student's words. */
export const ENGINE_BOOT_STAGES = BOOT_STAGES
export const ENGINE_STAGE_WORDS = STAGE_WORDS
// useEngineStatus: where the engine is (idle, loading and how far, ready, failed) and how many
// questions wait. cancelEngine: the Cancel button. warmupEngine(WhenIdle): start the first load early.
export { useCasStatus as useEngineStatus, cancelCas as cancelEngine, warmupCas as warmupEngine, warmupCasWhenIdle as warmupEngineWhenIdle } from './sympy/worker'

// The SymPy adapter's contract, as the tests that pin it read it: a Working-panel line's request
// as the worker's operation and payload, and a worker reply set out as the panel shows it. Built
// from the socket (math/pure/store.ts engineRequestFor) and the SymPy adapter
// (sympyRequest, stepsFromReply), so these tests pin the whole way from the typed line to the
// worker and back — the same contract the app sends through math/engine.

import { engineRequestFor, spelledOut } from '../../src/renderer/src/math/pure/store'
import { stepsFromReply, sympyRequest } from '../../src/renderer/src/math/engine/sympy/adapter'
import type { DerivTree, IntegralTree } from '../../src/renderer/src/math/engine/sympy/calculusSteps'
import type { CasResult } from '../../src/renderer/src/math/engine/sympy/worker'
import type { DigitSettings } from '../../src/renderer/src/math/format'
import type { JobId } from '../../src/renderer/src/math/pure/run'
import type { Working } from '../../src/renderer/src/math/pure/work'

/** A job's request as the SymPy worker receives it, or null when the engine has no such job. */
export function casRequestFor(job: JobId, src: string, deg: boolean): { op: string; payload: Record<string, unknown> } | null {
  const r = engineRequestFor(job, src, deg)
  return r ? sympyRequest(r.job, r.req) : null
}

/** The worker's reply to a calculus job as the working the panel shows. Pure: recorded replies go straight in. */
export function stepsWorkingFor(job: JobId, src: string, reply: CasResult | IntegralTree | DerivTree, digits?: DigitSettings): Working {
  return stepsFromReply(job === 'integrate' ? 'integralSteps' : 'diffSteps', reply, { input: src, digits })
}

/** A line with every name spelt plainly (θ as theta, glued function names apart). */
export const forSymPy = spelledOut

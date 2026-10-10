// The SymPy adapter: PhysLab's engine requests as the worker's operations and payloads
// (workers/cas.worker.ts, reached through ./worker.ts), and the worker's replies as PhysLab's
// results — the rule trees of a worked integral or derivative set out by ./calculusSteps.ts.

import { jobById } from '../../pure/run'
import { failed, type Working } from '../../pure/work'
import type { EngineJob, EngineRequest, EngineResult, EngineValue, MathEngine, StepsContext } from '../types'
import { derivativeWorking, integralWorking, type DerivTree, type IntegralTree } from './calculusSteps'
import { fromSymPyText, toSymPy } from './spelling'
import { cas, type CasOp, type CasResult } from './worker'

/** The worker's operation for each job. */
const OP: Record<EngineJob, CasOp> = {
  exact: 'exact',
  eval: 'eval',
  simplify: 'simplify',
  expand: 'expand',
  factor: 'factor',
  factorComplex: 'factor_complex',
  apart: 'apart',
  diff: 'diff',
  integrate: 'integrate',
  limit: 'limit',
  series: 'series',
  solve: 'solve',
  integralSteps: 'integral_steps',
  diffSteps: 'diff_steps'
}

/**
 * A request as the worker reads it: its operation, and a payload with the keys cas.worker.ts reads
 * (`eqs`, not `equations`: a wrong key once made every solve fail in silence), each expression in
 * SymPy's spelling. Keys a request leaves out are left out. Pure, so tests pin the contract.
 */
export function sympyRequest(job: EngineJob, req: EngineRequest): { op: CasOp; payload: Record<string, unknown> } {
  const payload: Record<string, unknown> = {}
  if (req.eqs !== undefined) payload.eqs = req.eqs.map(toSymPy)
  if (req.vars !== undefined) payload.vars = req.vars.map(toSymPy)
  if (req.expr !== undefined) payload.expr = toSymPy(req.expr)
  if (req.var !== undefined) payload.var = toSymPy(req.var)
  if (req.order !== undefined) payload.order = req.order
  if (req.at !== undefined) payload.at = toSymPy(req.at)
  if (req.lower !== undefined) payload.lower = toSymPy(req.lower)
  if (req.upper !== undefined) payload.upper = toSymPy(req.upper)
  if (req.to !== undefined) payload.to = toSymPy(req.to)
  if (req.dir !== undefined) payload.dir = req.dir
  if (req.n !== undefined) payload.n = req.n
  payload.deg = req.deg
  return { op: OP[job], payload }
}

const valueFrom = (v: CasResult | EngineValue): EngineValue => ({
  latex: v.latex,
  text: fromSymPyText(v.text ?? ''),
  numeric: v.numeric,
  ...(v.value ? { value: valueFrom(v.value) } : {})
})

/** A worker reply as PhysLab's result: the plain forms in PhysLab's spelling; the error sentence as it is. */
function resultFrom(r: CasResult): EngineResult {
  if (r.error) return { latex: '', text: '', numeric: null, error: r.error }
  const out: EngineResult = valueFrom(r)
  if (r.solutions) out.solutions = r.solutions.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, valueFrom(v)])))
  if (r.vars) out.vars = r.vars
  return out
}

/** The sentence a working carries when its rule tree could not be set out. */
const STEPS_WENT_WRONG = 'Something went wrong while setting out that working.'

/**
 * A failed request in words: the client's own sentences (a timeout, a failed start, Cancel) stand;
 * the worker's text about what it could not read never reaches a student.
 */
function stepsErrorSentence(job: 'integralSteps' | 'diffSteps', error: string): string {
  if (/^(This took too long|The algebra engine|Cancelled)/.test(error)) return error
  const verb = job === 'integralSteps' ? 'integrate' : 'differentiate'
  // The example as a student reads it: the job's own `example` is the typed form (x^2 sin(x)).
  const example = job === 'integralSteps' ? 'x eˣ' : 'x² sin x'
  return `PhysLab could not read that as something to ${verb}. Write it the way the example shows: ${example}.`
}

/**
 * A worked integral or derivative from the worker's reply: its rule tree set out as PhysLab's
 * working — which may itself be a refusal the step writer words ("no formula made of ordinary
 * functions") — or the request's failure in PhysLab's words. Pure: recorded replies go straight in.
 */
export function stepsFromReply(job: 'integralSteps' | 'diffSteps', reply: CasResult | IntegralTree | DerivTree, ctx: StepsContext): Working {
  const label = jobById(job === 'integralSteps' ? 'integrate' : 'differentiate').label
  if ((reply as CasResult).error) return failed(label, ctx.input, stepsErrorSentence(job, (reply as CasResult).error as string))
  try {
    return job === 'integralSteps' ? integralWorking(reply as IntegralTree, ctx.input, ctx.digits) : derivativeWorking(reply as DerivTree, ctx.input)
  } catch {
    return failed(label, ctx.input, STEPS_WENT_WRONG)
  }
}

/** The SymPy engine, sending through `send` (the worker in the app; a headless run in tests). */
export function sympyEngine(send: (op: string, payload: Record<string, unknown>) => Promise<CasResult> = (op, payload) => cas(op, payload)): MathEngine {
  return {
    name: 'sympy',
    jobs: new Set(Object.keys(OP) as EngineJob[]),
    async ask(job, req) {
      const { op, payload } = sympyRequest(job, req)
      return resultFrom(await send(op, payload))
    },
    async workSteps(job, req, ctx) {
      const { op, payload } = sympyRequest(job, req)
      return stepsFromReply(job, (await send(op, payload)) as CasResult | IntegralTree | DerivTree, ctx)
    }
  }
}

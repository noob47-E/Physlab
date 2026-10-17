// What the Maths screen shows once the algebra engine has answered a line that = could not answer alone.
//
// An indefinite integral has no number in it, and no formula can be found by the numeric engine. The line goes
// to the algebra engine, through the socket in math/engine; this turns what comes back into the answer the screen shows
// and a sentence when there is none. It is a function of the reply, so a test can hand it any reply.

import { ask } from '../math/engine'
import type { EngineJob, EngineRequest, EngineResult } from '../math/engine/types'
import { math } from '../math/expr'
import { spelledOut } from '../math/pure/store'
import { formulaOf } from './formula'

/** A line for the algebra engine to answer: which job, the request, and whether the answer carries a constant. */
export interface EngineAsk {
  job: 'diff' | 'integrate'
  req: EngineRequest
  /** An indefinite integral is written with its constant of integration, + C, as its working and every textbook write it. */
  plusC: boolean
}

type EngineAnswer = { ok: true; main: string; tex: string } | { ok: false; error: string }

type Asker = (job: Exclude<EngineJob, 'integralSteps' | 'diffSteps'>, req: EngineRequest) => Promise<EngineResult>

/** An integral or derivative the engine hands back still written as one is its way of saying it found no formula. */
const UNSOLVED = /\\int|\\frac\{d|Integral\(|Derivative\(/

const NO_FORMULA = 'I could not find a formula for that. Press Work it out to see what the engine makes of it.'

export async function engineAnswer(a: EngineAsk, askFn: Asker = ask): Promise<EngineAnswer> {
  // The letters go in the engine's own spelling (θ as theta, 2xcos as 2x·cos), as Work it out sends them.
  const req: EngineRequest = { ...a.req, expr: a.req.expr === undefined ? undefined : spelledOut(a.req.expr), var: a.req.var === undefined ? undefined : spelledOut(a.req.var) }
  let reply: EngineResult
  try {
    reply = await askFn(a.job, req)
  } catch {
    return { ok: false, error: 'The algebra engine could not be reached. Try again in a moment.' }
  }
  if (reply.error) return { ok: false, error: reply.error }
  if (!reply.latex || UNSOLVED.test(reply.latex) || UNSOLVED.test(reply.text)) return { ok: false, error: NO_FORMULA }
  const constant = a.plusC ? ' + C' : ''
  let main = reply.text
  try {
    main = formulaOf(math.parse(reply.text)).text
  } catch {
    // The engine's own plain form is still readable; it is the fallback for a line PhysLab's printer cannot read.
  }
  return { ok: true, main: `${main}${constant}`, tex: `${reply.latex}${constant}` }
}

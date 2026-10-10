// The socket's proof (CLEANUP-PLAN.md CW15): a second engine that answers one job — diff, with
// mathjs's own derivative — and passes the conformance suite for it (tests/engine/), with no file
// outside math/engine changing. It is what an adapter for Giac or Rubi looks like, at its smallest.
// The app does not use it: math/engine/index.ts ENGINE_FOR sends every job to SymPy.

import type { MathNode } from 'mathjs'
import { math } from '../expr'
import type { EngineJob, EngineResult, MathEngine } from './types'

const TRIG = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot'])

/** In degrees, sin x means sin(πx/180): each trig function's argument is scaled before differentiating. */
function inDegrees(node: MathNode): MathNode {
  return node.transform((n) => {
    if (n.type === 'FunctionNode') {
      const f = n as unknown as { fn: { name: string }; args: MathNode[] }
      if (TRIG.has(f.fn.name)) return new math.FunctionNode(f.fn.name, [math.parse(`pi / 180 * (${f.args[0].toString()})`)])
    }
    return n
  })
}

const refuse = (error: string): EngineResult => ({ latex: '', text: '', numeric: null, error })

export function dummyEngine(): MathEngine {
  return {
    name: 'mathjs diff (dummy)',
    jobs: new Set<EngineJob>(['diff']),
    async ask(job, req) {
      if (job !== 'diff') return refuse('This engine does not do that job.')
      let node: MathNode
      try {
        node = math.parse(req.expr ?? '')
      } catch {
        return refuse('I could not read that. Check the brackets and signs.')
      }
      try {
        if (req.deg) node = inDegrees(node)
        for (let k = 0; k < (req.order ?? 1); k++) node = math.derivative(node, req.var ?? 'x')
        const out: EngineResult = { latex: node.toTex(), text: node.toString(), numeric: null }
        if (req.at !== undefined) {
          const v = Number(node.evaluate({ [req.var ?? 'x']: math.evaluate(req.at) }))
          out.value = { latex: String(v), text: String(v), numeric: { re: v } }
        }
        return out
      } catch {
        return refuse('This engine could not work that out.')
      }
    }
  }
}

// Client for the SymPy worker. The worker boots lazily (first call takes a few seconds).

import { create } from 'zustand'

export interface CasValue {
  latex: string
  text: string
  numeric: { re: number; im?: number } | null
  value?: CasValue
}

/**
 * Every operation cas.worker.ts implements. Nothing else may be sent.
 *
 * This list is a contract with Python in another file. It is written down here, and checked
 * against the worker's source by a test, because the halves drifted apart once already: a payload
 * key of `equations` where the worker reads `eqs` made every solve fallback fail in silence.
 */
export const CAS_OPS = [
  'exact',
  'eval',
  'simplify',
  'expand',
  'factor',
  'factor_complex',
  'apart',
  'diff',
  'integrate',
  'limit',
  'series',
  'solve',
  'warmup'
] as const
export type CasOp = (typeof CAS_OPS)[number]

export type CasResult = CasValue & {
  error?: string
  solutions?: Record<string, CasValue>[]
  vars?: string[]
}

export const useCasStatus = create<{ status: 'idle' | 'loading' | 'ready' | 'error'; message?: string; busy: number }>(() => ({
  status: 'idle',
  busy: 0
}))

/** Hard stop for a calculation that never finishes (an impossible integral, say). */
const TIMEOUT_MS = 30000

let worker: Worker | null = null
let nextId = 1
const waiting = new Map<number, { resolve: (r: CasResult) => void; timer: ReturnType<typeof setTimeout> }>()

const errorResult = (message: string): CasResult => ({ latex: '', text: '', numeric: null, error: message })

const settle = (id: number, result: CasResult) => {
  const w = waiting.get(id)
  if (!w) return
  clearTimeout(w.timer)
  waiting.delete(id)
  useCasStatus.setState({ busy: waiting.size })
  w.resolve(result)
}

/** Throw the worker away; the next request starts a fresh one. */
function restartWorker(): void {
  worker?.terminate()
  worker = null
}

/** Answer everything still waiting with an error (used on a crash or when cancelled). */
function failAll(message: string): void {
  for (const id of [...waiting.keys()]) settle(id, errorResult(message))
}

/** Stop whatever the algebra engine is doing (the Cancel button). */
export function cancelCas(): void {
  if (!waiting.size) return
  failAll('Cancelled.')
  restartWorker()
  useCasStatus.setState({ status: 'idle', message: 'cancelled', busy: 0 })
}

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../workers/cas.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<{ id?: number; result?: CasResult; status?: 'loading' | 'ready' | 'error'; message?: string }>) => {
    const d = e.data
    if (d.status) {
      useCasStatus.setState({ status: d.status, message: d.message })
      if (d.status !== 'loading') console.info(`PHYSLAB_CHECK cas=${d.status}${d.message ? ` ${d.message}` : ''}`)
    }
    if (d.id !== undefined && d.result) settle(d.id, d.result)
  }
  worker.onerror = (e) => {
    useCasStatus.setState({ status: 'error', message: e.message })
    failAll(`The algebra engine stopped: ${e.message}. It will start again on the next command.`)
    restartWorker()
  }
  return worker
}

export function cas(op: string, payload: Record<string, unknown> = {}): Promise<CasResult> {
  const id = nextId++
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      settle(id, errorResult('This took too long, so it was stopped. Try a simpler expression, or give the numbers instead of symbols.'))
      // The worker is about to go, so nothing else waiting on it will ever be answered — and their
      // timers would otherwise fire later and kill a healthy worker.
      failAll('The algebra engine was restarted, so this was stopped too. Send it again.')
      restartWorker()
      useCasStatus.setState({ status: 'idle', message: 'stopped after 30 s' })
    }, TIMEOUT_MS)
    waiting.set(id, { resolve, timer })
    useCasStatus.setState({ busy: waiting.size })
    getWorker().postMessage({ id, op, payload })
  })
}

/** Start loading SymPy in the background so the first real request is fast. */
export const warmupCas = () => cas('warmup')

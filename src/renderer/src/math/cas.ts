// Client for the SymPy worker. The worker boots lazily (first call takes a few seconds).

import { create } from 'zustand'

export interface CasValue {
  latex: string
  text: string
  numeric: { re: number; im?: number } | null
  value?: CasValue
}

export type CasResult = CasValue & {
  error?: string
  solutions?: Record<string, CasValue>[]
  vars?: string[]
}

export const useCasStatus = create<{ status: 'idle' | 'loading' | 'ready' | 'error'; message?: string }>(() => ({
  status: 'idle'
}))

let worker: Worker | null = null
let nextId = 1
const waiting = new Map<number, (r: CasResult) => void>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../workers/cas.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<{ id?: number; result?: CasResult; status?: 'loading' | 'ready' | 'error'; message?: string }>) => {
    const d = e.data
    if (d.status) {
      useCasStatus.setState({ status: d.status, message: d.message })
      if (d.status !== 'loading') console.info(`PHYSLAB_CHECK cas=${d.status}${d.message ? ` ${d.message}` : ''}`)
    }
    if (d.id !== undefined && d.result) {
      waiting.get(d.id)?.(d.result)
      waiting.delete(d.id)
    }
  }
  worker.onerror = (e) => useCasStatus.setState({ status: 'error', message: e.message })
  return worker
}

export function cas(op: string, payload: Record<string, unknown> = {}): Promise<CasResult> {
  const id = nextId++
  return new Promise((resolve) => {
    waiting.set(id, resolve)
    getWorker().postMessage({ id, op, payload })
  })
}

/** Start loading SymPy in the background so the first real request is fast. */
export const warmupCas = () => cas('warmup')

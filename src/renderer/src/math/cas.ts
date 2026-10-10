// Client for the SymPy worker. The worker boots lazily (the first load takes several seconds,
// more on a slow machine) and reports each load stage, which every waiting place shows.

import { create } from 'zustand'
import { CAS_BOOT_STAGES, casWaitNote as waitNote, followCasStart as followStart } from '../ui/casStatus'

interface CasValue {
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
  // Answer + rule tree for the step engine (math/pure/calculusSteps.ts formats it).
  'integral_steps',
  'diff_steps',
  'warmup'
] as const
export type CasOp = (typeof CAS_OPS)[number]

export type CasResult = CasValue & {
  error?: string
  solutions?: Record<string, CasValue>[]
  vars?: string[]
}

/**
 * `stage` is the worker's last reported load stage (1 … CAS_BOOT_STAGES while loading, 0 before
 * the first report), so each waiting place can say how far the first load has got.
 */
export const useCasStatus = create<{ status: 'idle' | 'loading' | 'ready' | 'error'; message?: string; busy: number; stage: number }>(() => ({
  status: 'idle',
  busy: 0,
  stage: 0
}))

/**
 * Hard stop for a calculation that never finishes (an impossible integral, say). It runs only
 * while that request is the one the ready engine is working on: it used to start when the request
 * was sent, so the first load, or a long question ahead in the queue, used it up and the timer
 * killed a healthy worker.
 */
const TIMEOUT_MS = 30000

/** The first load's own limit: generous, because a slow first launch is not a failure. */
export const BOOT_TIMEOUT_MS = 120000

let worker: Worker | null = null
let ready = false
let bootTimer: ReturnType<typeof setTimeout> | null = null
let nextId = 1
// A Map keeps sending order, which is the order the worker answers in (it runs one at a time).
const waiting = new Map<number, { resolve: (r: CasResult) => void; timer: ReturnType<typeof setTimeout> | null }>()

const errorResult = (message: string): CasResult => ({ latex: '', text: '', numeric: null, error: message })

/** Start the 30 s clock for the request the engine is working on now, once it is ready. */
function startRunning(): void {
  if (!ready) return
  const head = waiting.entries().next()
  if (head.done || head.value[1].timer) return
  const [id, w] = head.value
  w.timer = setTimeout(() => timedOut(id), TIMEOUT_MS)
}

const settle = (id: number, result: CasResult) => {
  const w = waiting.get(id)
  if (!w) return
  if (w.timer) clearTimeout(w.timer)
  waiting.delete(id)
  useCasStatus.setState({ busy: waiting.size })
  w.resolve(result)
  startRunning()
}

/** Throw the worker away; the next request starts a fresh one. */
function restartWorker(): void {
  worker?.terminate()
  worker = null
  ready = false
  if (bootTimer) clearTimeout(bootTimer)
  bootTimer = null
}

/** Answer everything still waiting with an error (used on a crash or when cancelled). */
function failAll(message: string): void {
  for (const id of [...waiting.keys()]) settle(id, errorResult(message))
}

function timedOut(id: number): void {
  // The status goes first, so a line following the load (followCasStart) has let go before the
  // waiting answers arrive.
  useCasStatus.setState({ status: 'idle', message: 'stopped after 30 s', stage: 0 })
  settle(id, errorResult('This took too long, so it was stopped. Try a simpler expression, or give the numbers instead of symbols.'))
  // The worker is about to go, so nothing else waiting on it will ever be answered.
  failAll('The algebra engine was restarted, so this was stopped too. Send it again.')
  restartWorker()
}

/** The first load failed or never finished: say so, and leave the next command to start again. */
function bootFailed(reason: string, sentence: string): void {
  useCasStatus.setState({ status: 'error', message: reason, stage: 0 })
  console.info(`PHYSLAB_CHECK cas=error ${reason}`)
  restartWorker()
  failAll(sentence)
}

/** Stop whatever the algebra engine is doing (the Cancel button). */
export function cancelCas(): void {
  if (!waiting.size) return
  useCasStatus.setState({ status: 'idle', message: 'cancelled', busy: 0, stage: 0 })
  restartWorker()
  failAll('Cancelled.')
}

type FromWorker = { id?: number; result?: CasResult; status?: 'loading' | 'ready' | 'error'; stage?: number; message?: string }

function getWorker(): Worker {
  if (worker) return worker
  const w = new Worker(new URL('../workers/cas.worker.ts', import.meta.url), { type: 'module' })
  worker = w
  ready = false
  useCasStatus.setState({ status: 'loading', message: undefined, stage: 0 })
  bootTimer = setTimeout(
    () => bootFailed('it did not start within 2 minutes', 'The algebra engine did not start within 2 minutes, so it was stopped. Your next command starts it again.'),
    BOOT_TIMEOUT_MS
  )
  w.onmessage = (e: MessageEvent<FromWorker>) => {
    // A worker already thrown away (timed out, cancelled) may still have a message in flight.
    if (worker !== w) return
    const d = e.data
    if (d.status === 'loading') {
      useCasStatus.setState({ status: 'loading', stage: d.stage ?? useCasStatus.getState().stage })
    } else if (d.status === 'ready') {
      // Every request that waited out the load says 'ready' as it resumes; only the first counts.
      if (!ready) {
        ready = true
        if (bootTimer) clearTimeout(bootTimer)
        bootTimer = null
        useCasStatus.setState({ status: 'ready', message: undefined, stage: CAS_BOOT_STAGES })
        console.info('PHYSLAB_CHECK cas=ready')
        startRunning()
      }
    } else if (d.status === 'error') {
      if (!ready) {
        bootFailed(d.message ?? 'it could not load', 'The algebra engine could not start. Your next command starts it again.')
        return
      }
      // After the load an error belongs to one request, whose own result carries it; the engine
      // still answers the next one. Showing "Algebra unavailable" here stuck while later answers
      // came back fine.
      console.info(`PHYSLAB_CHECK cas=request-error ${d.message ?? ''}`)
    }
    if (d.id !== undefined && d.result) settle(d.id, d.result)
  }
  w.onerror = (e) => {
    // Like onmessage: an error from a worker already thrown away must not end its successor.
    if (worker !== w) return
    useCasStatus.setState({ status: 'error', message: e.message, stage: 0 })
    restartWorker()
    failAll(`The algebra engine stopped: ${e.message}. It will start again on the next command.`)
  }
  return w
}

export function cas(op: string, payload: Record<string, unknown> = {}): Promise<CasResult> {
  const id = nextId++
  return new Promise((resolve) => {
    waiting.set(id, { resolve, timer: null })
    useCasStatus.setState({ busy: waiting.size })
    getWorker().postMessage({ id, op, payload })
    startRunning()
  })
}

/**
 * Start loading SymPy in the background so the first real request is fast.
 *
 * This deliberately bypasses `cas()`: a warm-up is not a question. Sent as a request it counted as
 * busy for the whole load, so opening the Calculator showed "Working…" and a Stop button for a
 * question nobody had asked. With no id the worker loads and says nothing back but its stages. A
 * worker that exists is already loading or loaded, so a second warm-up does nothing.
 */
export const warmupCas = (): void => {
  if (worker) return
  getWorker().postMessage({ op: 'warmup', payload: {} })
}

let warmScheduled = false

/**
 * Warm up once the app has painted and is idle, in every mode (the bar reaches the algebra engine
 * from any of them). The load runs in the worker's own thread; idle time keeps its start-up off
 * the first frames.
 */
export function warmupCasWhenIdle(): void {
  if (warmScheduled || worker) return
  warmScheduled = true
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
  if (idle) idle(() => warmupCas(), { timeout: 3000 })
  else setTimeout(warmupCas, 1500)
}

/** ui/casStatus.ts `casWaitNote` for this engine's status. */
export const casWaitNote = (): string => waitNote(useCasStatus.getState())

/** ui/casStatus.ts `followCasStart` on this engine's status. */
export const followCasStart = (onSentence: (text: string) => void): void => followStart(useCasStatus, onSentence)

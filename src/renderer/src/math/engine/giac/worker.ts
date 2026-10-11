// The client of the Giac worker (workers/giac.worker.ts): one worker at a time, runs sent one at a
// time, and the worker's whole life — its load, its setup, the timeout that ends it, the recycling
// that replaces it — kept here, where a test can drive it with a stand-in worker or with the real
// runtime in Node (tests/engine/giacHeadless.ts). The adapter (./adapter.ts) builds the commands.
//
// The numbers (measured 2026-10-12 on the owner's PC; docs/knowledge/giac-adapter.md has the runs):
// - A run is stopped after RUN_TIMEOUT_MS. Giac cannot be interrupted, so the worker is ended and a
//   fresh one started at once; the run answers with the timeout sentence and the runs queued behind
//   it go to the fresh worker. Only the run itself is timed, never the load or the queue (the other
//   engine's first timeout counted both and killed a healthy, half-loaded worker).
// - The runtime's heap is a fixed 256 MB that malloc never gives back. 1,500 ordinary jobs (2,464
//   runs) took it from 10.1 MB to 11.6 MB; factorial(10^5) leaves 16 MB, expand((x+y+z+w)^40) 28 MB,
//   and expand((x+y+z+w)^200) fills it and aborts. So the worker is replaced after RECYCLE_AFTER_RUNS
//   runs (Giac keeps every answer in its history), or as soon as a run leaves more than
//   RECYCLE_ABOVE_MB taken, so every run starts with at least three quarters of the heap free. It is
//   replaced between runs, never during one, and the fresh worker loads at once.

import { create } from 'zustand'
import type { EngineStatus } from '../types'
import { BOOT_STAGES } from './stages'

/** What the client needs of a worker: the browser's Worker, or the Node stand-in the tests use. */
export interface GiacWorkerLike {
  postMessage(msg: unknown): void
  terminate(): void
  onmessage: ((e: { data: unknown }) => void) | null
  onerror: ((e: { message?: string }) => void) | null
}

/** A run's commands' printed answers, in order, or the sentence a student is told instead. */
type RunReply = { outs: string[] } | { error: string }

/** How a run is sent: the app's worker, or a headless one in the tests. */
export type GiacRun = (cmds: string[]) => Promise<RunReply>

/** A run that takes longer than this is stopped. */
export const RUN_TIMEOUT_MS = 20000
/** The load's own limit: generous, because a slow first launch is not a failure. */
export const BOOT_TIMEOUT_MS = 120000
/** A worker is replaced after this many runs (Giac keeps a history of every one): about 300 jobs. */
export const RECYCLE_AFTER_RUNS = 500
/** A worker is replaced once a run leaves more than this much of its 256 MB heap taken. */
export const RECYCLE_ABOVE_MB = 64

/**
 * Giac set up per G00 (docs/knowledge/engine-semantics.md), at every start, each with the answer
 * that proves it took. A worker whose setup answers differently never answers a request.
 */
export const GIAC_SETUP: readonly { cmd: string; want: string; why: string }[] = [
  { cmd: 'complex_mode:=0', want: '0', why: 'the real domain: solve gives real roots, sqrt(-4) is not simplified to 2i in a real answer' },
  { cmd: 'complex_variables:=0', want: '0', why: 'every letter is a real number' },
  { cmd: 'angle_radian:=1', want: '1', why: 'radians; a request in degrees has each trig argument written in radians (spelling.ts)' },
  { cmd: 'with_sqrt(0)', want: '0', why: 'factor works over the rationals: x^2 - 2 stays whole, as the factor job means' },
  { cmd: 'all_trig_solutions:=0', want: '0', why: 'the principal solutions of a trig equation, as the other engine gives' },
  { cmd: 'approx_mode:=0', want: '0', why: 'exact answers' }
]

/** The sentences a run can end with, in the other engine's words where it has them. */
export const SENTENCES = {
  tooLong: 'This took too long, so it was stopped. Try a simpler expression, or give the numbers instead of symbols.',
  tooBig: 'That is too big to work out. Try a simpler expression.',
  restarted: 'The algebra engine was restarted, so this was stopped too. Send it again.',
  cancelled: 'Cancelled.',
  bootSlow: 'The algebra engine did not start within 2 minutes, so it was stopped. Your next command starts it again.',
  bootFailed: 'The algebra engine could not start. Your next command starts it again.'
} as const

export interface GiacClientOptions {
  spawn: () => GiacWorkerLike
  timeoutMs?: number
  bootTimeoutMs?: number
  recycleAfterRuns?: number
  recycleAboveMb?: number
  setup?: readonly { cmd: string; want: string }[]
  onStatus?: (s: Partial<EngineStatus>) => void
}

/** What the client has seen, for tests and the knowledge note's measurements. */
interface GiacClientStats {
  /** Workers started so far. */
  spawned: number
  /** Runs answered by the worker now running. */
  runsOnWorker: number
  /** Its heap taken after the last run, in MB (null before the first). */
  heapMb: number | null
  /** How long the last load took inside the worker, in ms. */
  bootMs: number | null
  /** Why each worker before this one was replaced. */
  replaced: Array<'timeout' | 'crash' | 'recycle-runs' | 'recycle-heap' | 'cancel' | 'boot-failed'>
}

export interface GiacClient {
  run: GiacRun
  /** Start loading now, so the first real run is fast. */
  warmup(): void
  /** Stop everything (the Cancel button): every waiting run answers "Cancelled.". */
  cancel(): void
  stats(): GiacClientStats
  /** End the worker for good (tests). */
  dispose(): void
}

interface Pending {
  id: number
  cmds: string[]
  resolve: (r: RunReply) => void
}

type FromWorker = {
  id?: number
  outs?: string[]
  heapMb?: number | null
  crashed?: string
  status?: 'loading' | 'ready' | 'error'
  stage?: number
  setup?: string[]
  bootMs?: number
  message?: string
}

export function giacClient(opts: GiacClientOptions): GiacClient {
  const timeoutMs = opts.timeoutMs ?? RUN_TIMEOUT_MS
  const bootTimeoutMs = opts.bootTimeoutMs ?? BOOT_TIMEOUT_MS
  const recycleAfterRuns = opts.recycleAfterRuns ?? RECYCLE_AFTER_RUNS
  const recycleAboveMb = opts.recycleAboveMb ?? RECYCLE_ABOVE_MB
  const setup = opts.setup ?? GIAC_SETUP
  const status = (s: Partial<EngineStatus>): void => opts.onStatus?.(s)

  let worker: GiacWorkerLike | null = null
  let ready = false
  let bootTimer: ReturnType<typeof setTimeout> | null = null
  let runTimer: ReturnType<typeof setTimeout> | null = null
  let running: Pending | null = null
  const queue: Pending[] = []
  let nextId = 1
  let disposed = false
  const stats: GiacClientStats = { spawned: 0, runsOnWorker: 0, heapMb: null, bootMs: null, replaced: [] }

  const busy = (): number => queue.length + (running ? 1 : 0)

  function clearTimers(): void {
    if (bootTimer) clearTimeout(bootTimer)
    if (runTimer) clearTimeout(runTimer)
    bootTimer = null
    runTimer = null
  }

  /** End the worker; nothing it still sends is read (onmessage checks it is still the one). */
  function endWorker(why: GiacClientStats['replaced'][number]): void {
    clearTimers()
    if (worker) {
      worker.onmessage = null
      worker.onerror = null
      worker.terminate()
      stats.replaced.push(why)
    }
    worker = null
    ready = false
  }

  function spawn(): void {
    if (worker || disposed) return
    const w = opts.spawn()
    worker = w
    ready = false
    stats.spawned++
    stats.runsOnWorker = 0
    stats.heapMb = null
    status({ status: 'loading', message: undefined, stage: 0 })
    bootTimer = setTimeout(() => bootFailed('it did not start within 2 minutes', SENTENCES.bootSlow), bootTimeoutMs)
    w.onmessage = (e) => {
      if (worker === w) fromWorker(e.data as FromWorker)
    }
    w.onerror = (e) => {
      if (worker !== w) return
      if (!ready) bootFailed(e.message ?? 'it could not load', SENTENCES.bootFailed)
      else crashed(e.message ?? 'the worker stopped')
    }
    w.postMessage({ setup: setup.map((s) => s.cmd) })
  }

  function bootFailed(reason: string, sentence: string): void {
    status({ status: 'error', message: reason, stage: 0 })
    endWorker('boot-failed')
    const all = (running ? [running] : []).concat(queue.splice(0))
    running = null
    for (const p of all) p.resolve({ error: sentence })
    status({ busy: 0 })
  }

  /** The run in progress ended the runtime: it answers with `sentence`, and the queue moves to a fresh worker. */
  function replaceDuringRun(why: 'timeout' | 'crash', sentence: string): void {
    const p = running
    running = null
    endWorker(why)
    p?.resolve({ error: sentence })
    status({ status: 'idle', message: why === 'timeout' ? `stopped after ${Math.round(timeoutMs / 1000)} s` : 'restarted', stage: 0, busy: busy() })
    // A fresh worker at once, warm for the next question, and for the runs that were waiting.
    spawn()
    pump()
  }

  function crashed(message: string): void {
    void message
    replaceDuringRun('crash', SENTENCES.tooBig)
  }

  function fromWorker(d: FromWorker): void {
    if (d.status === 'loading') {
      status({ status: 'loading', stage: d.stage ?? 0 })
      return
    }
    if (d.status === 'error') {
      if (!ready) bootFailed(d.message ?? 'it could not load', SENTENCES.bootFailed)
      else crashed(d.message ?? 'the runtime stopped')
      return
    }
    if (d.status === 'ready') {
      const got = d.setup ?? []
      const wrong = setup.findIndex((s, k) => got[k] !== s.want)
      if (wrong >= 0) {
        bootFailed(`its setup "${setup[wrong].cmd}" answered "${got[wrong]}"`, SENTENCES.bootFailed)
        return
      }
      ready = true
      if (bootTimer) clearTimeout(bootTimer)
      bootTimer = null
      stats.bootMs = d.bootMs ?? null
      status({ status: 'ready', message: undefined, stage: BOOT_STAGES })
      pump()
      return
    }
    if (d.id === undefined || !running || d.id !== running.id) return
    if (d.crashed !== undefined) {
      crashed(d.crashed)
      return
    }
    const p = running
    running = null
    if (runTimer) clearTimeout(runTimer)
    runTimer = null
    stats.runsOnWorker++
    stats.heapMb = d.heapMb ?? null
    p.resolve({ outs: d.outs ?? [] })
    status({ busy: busy() })
    // Recycled between runs, never during one; the fresh worker loads at once, before it is needed.
    const why = stats.runsOnWorker >= recycleAfterRuns ? 'recycle-runs' : stats.heapMb !== null && stats.heapMb > recycleAboveMb ? 'recycle-heap' : null
    if (why) {
      endWorker(why)
      spawn()
    }
    pump()
  }

  /** Send the next run when the worker is ready and idle; start one if there is none. */
  function pump(): void {
    if (disposed || running || !queue.length) return
    if (!worker) spawn()
    if (!ready || !worker) return
    const p = queue.shift() as Pending
    running = p
    worker.postMessage({ id: p.id, cmds: p.cmds })
    // The clock starts only now, when the ready worker takes the run.
    runTimer = setTimeout(() => {
      if (running === p) replaceDuringRun('timeout', SENTENCES.tooLong)
    }, timeoutMs)
  }

  return {
    run(cmds) {
      return new Promise<RunReply>((resolve) => {
        if (disposed) {
          resolve({ error: SENTENCES.bootFailed })
          return
        }
        queue.push({ id: nextId++, cmds, resolve })
        status({ busy: busy() })
        pump()
      })
    },
    warmup() {
      if (!worker) spawn()
    },
    cancel() {
      if (!busy()) return
      const all = (running ? [running] : []).concat(queue.splice(0))
      running = null
      endWorker('cancel')
      for (const p of all) p.resolve({ error: SENTENCES.cancelled })
      status({ status: 'idle', message: 'cancelled', busy: 0, stage: 0 })
    },
    stats: () => ({ ...stats, replaced: [...stats.replaced] }),
    dispose() {
      disposed = true
      const all = (running ? [running] : []).concat(queue.splice(0))
      running = null
      endWorker('cancel')
      for (const p of all) p.resolve({ error: SENTENCES.cancelled })
    }
  }
}

/** Where the app's Giac worker is, for the waiting lines (not on screen until a job moves to Giac, part G4). */
export const useGiacStatus = create<EngineStatus>(() => ({ status: 'idle', busy: 0, stage: 0 }))

let appClient: GiacClient | null = null

/** The app's own client, made on first use: nothing loads until Giac is asked something or warmed up. */
function app(): GiacClient {
  appClient ??= giacClient({
    spawn: () => new Worker(new URL('../../../workers/giac.worker.ts', import.meta.url)) as unknown as GiacWorkerLike,
    onStatus: (s) => useGiacStatus.setState(s)
  })
  return appClient
}

/** A run through the app's worker. */
export const giacRun: GiacRun = (cmds) => app().run(cmds)

/** Start loading Giac now. */
export const warmupGiac = (): void => app().warmup()

/** Stop everything Giac is doing (the Cancel button, once a job is on Giac). */
export const cancelGiac = (): void => app().cancel()

let warmScheduled = false

/** Load Giac once the app is idle, so its first answer is quick. Not called while every job is on the other engine. */
export function warmupGiacWhenIdle(): void {
  if (warmScheduled) return
  warmScheduled = true
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
  if (idle) idle(() => warmupGiac(), { timeout: 3000 })
  else setTimeout(warmupGiac, 1500)
}

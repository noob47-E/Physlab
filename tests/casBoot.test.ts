// P17: the first use of the algebra engine, at the client/worker boundary (math/cas.ts).
//
// The real worker loads Python, then the algebra library, which can take well over 30 seconds on a
// slow first launch. The client used to start each request's 30 s timer the moment it was sent, so
// a slow boot (or a long request ahead in the queue) killed a healthy worker, and the only thing a
// student saw meanwhile was "Starting algebra…" or "Working…". These tests drive a fake Worker by
// hand with fake timers: boot stages, a late "ready", answers in order.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Msg = { id?: number; op?: string; payload?: unknown }

class FakeWorker {
  static all: FakeWorker[] = []
  posted: Msg[] = []
  terminated = false
  onmessage: ((e: { data: unknown }) => void) | null = null
  onerror: ((e: { message: string }) => void) | null = null
  constructor() {
    FakeWorker.all.push(this)
  }
  postMessage(m: Msg): void {
    this.posted.push(m)
  }
  terminate(): void {
    this.terminated = true
  }
  /** The worker says something to the client. */
  emit(data: unknown): void {
    if (!this.terminated) this.onmessage?.({ data })
  }
  /** Answer the request with this id. */
  answer(id: number, result: Record<string, unknown> = { latex: '1', text: '1', numeric: { re: 1 } }): void {
    this.emit({ id, result })
  }
  /** Ids of the real requests sent to this worker, in order. */
  ids(): number[] {
    return this.posted.filter((m) => m.id !== undefined).map((m) => m.id as number)
  }
}

let mod: typeof import('../src/renderer/src/math/cas')
let words: typeof import('../src/renderer/src/ui/casStatus')

const last = (): FakeWorker => FakeWorker.all[FakeWorker.all.length - 1]

/** Settle any promise callbacks that are ready to run. */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

/** Watch a promise without awaiting it, so fake time can pass first. */
function track<T>(p: Promise<T>): { done: () => boolean; value: () => T | undefined; times: () => number } {
  let value: T | undefined
  let times = 0
  void p.then((v) => {
    value = v
    times++
  })
  return { done: () => times > 0, value: () => value, times: () => times }
}

beforeEach(async () => {
  vi.useFakeTimers()
  FakeWorker.all = []
  vi.stubGlobal('Worker', FakeWorker)
  vi.resetModules()
  mod = await import('../src/renderer/src/math/cas')
  words = await import('../src/renderer/src/ui/casStatus')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('P17: a slow first load never times out a question', () => {
  it('a boot that takes 45 s still answers the question asked during it', async () => {
    const r = track(mod.cas('eval', { expr: '1' }))
    const w = last()
    w.emit({ status: 'loading', stage: 1 })
    await vi.advanceTimersByTimeAsync(20_000)
    w.emit({ status: 'loading', stage: 2 })
    await vi.advanceTimersByTimeAsync(25_000)
    expect(r.done()).toBe(false)
    expect(w.terminated).toBe(false)
    w.emit({ status: 'ready' })
    w.answer(w.ids()[0])
    await flush()
    expect(r.value()?.error).toBeUndefined()
    expect(r.value()?.text).toBe('1')
    expect(FakeWorker.all).toHaveLength(1)
  })

  it('a request made during boot is sent once and answered once', async () => {
    mod.warmupCas()
    const w = last()
    w.emit({ status: 'loading', stage: 1 })
    const r = track(mod.cas('eval', { expr: '2' }))
    await vi.advanceTimersByTimeAsync(40_000)
    w.emit({ status: 'ready' })
    const id = w.ids()[0]
    expect(w.ids()).toEqual([id])
    w.answer(id)
    w.answer(id) // a stray second reply changes nothing
    await flush()
    expect(r.times()).toBe(1)
    expect(r.value()?.error).toBeUndefined()
    expect(mod.useCasStatus.getState().busy).toBe(0)
  })

  it('a question queued behind a long one gets its own 30 s once it is running', async () => {
    const a = track(mod.cas('integrate', { expr: 'x' }))
    const w = last()
    w.emit({ status: 'ready' })
    const b = track(mod.cas('eval', { expr: '3' }))
    const [ia, ib] = w.ids()
    await vi.advanceTimersByTimeAsync(25_000)
    w.answer(ia)
    await vi.advanceTimersByTimeAsync(25_000) // 50 s since b was sent, 25 s since it started
    expect(a.value()?.error).toBeUndefined()
    expect(b.done()).toBe(false)
    expect(w.terminated).toBe(false)
    w.answer(ib)
    await flush()
    expect(b.value()?.error).toBeUndefined()
  })

  it('a running question is still stopped 30 s after it started', async () => {
    const a = track(mod.cas('integrate', { expr: 'x' }))
    const w = last()
    w.emit({ status: 'ready' })
    await vi.advanceTimersByTimeAsync(30_001)
    expect(a.value()?.error).toMatch(/took too long/)
    expect(w.terminated).toBe(true)
  })
})

describe('P17: the load stages reach every place that waits', () => {
  it('stage messages land in useCasStatus and read as a plain sentence', async () => {
    void mod.cas('eval', { expr: '1' })
    const w = last()
    w.emit({ status: 'loading', stage: 2 })
    const st = mod.useCasStatus.getState()
    expect(st.status).toBe('loading')
    expect(st.stage).toBe(2)
    expect(words.casStartingSentence(2)).toMatch(/^Starting the algebra engine \(2 of 3: .+\)…$/)
    // Busy during boot: the strip names the stage, never a bare "Working…".
    const s = words.describeCasStatus(st.status, st.busy, st.message, st.stage)
    expect(s.words).not.toBe('Working…')
    expect(`${s.words} ${s.tip}`).toMatch(/2 of 3/)
  })

  it('followCasStart hands each stage sentence to a waiting line and stops at ready', async () => {
    const seen: string[] = []
    mod.followCasStart((t) => seen.push(t))
    void mod.cas('eval', { expr: '1' })
    const w = last()
    w.emit({ status: 'loading', stage: 1 })
    w.emit({ status: 'loading', stage: 2 })
    w.emit({ status: 'loading', stage: 3 })
    w.emit({ status: 'ready' })
    w.emit({ status: 'loading', stage: 1 }) // nothing after ready reaches the line
    expect(seen.filter((t) => /of 3/.test(t))).toEqual([words.casStartingSentence(1), words.casStartingSentence(2), words.casStartingSentence(3)])
  })
})

describe('P17: a boot that fails says so, and the next command starts again', () => {
  it('a boot error answers the waiting question with a sentence; the next request makes a new worker', async () => {
    const r = track(mod.cas('eval', { expr: '1' }))
    const w = last()
    w.emit({ status: 'loading', stage: 1 })
    w.emit({ status: 'error', message: 'NetworkError' })
    await flush()
    expect(r.value()?.error).toMatch(/could not start/i)
    expect(r.value()?.error).toMatch(/next command/i)
    expect(mod.useCasStatus.getState().status).toBe('error')
    void mod.cas('eval', { expr: '1' })
    expect(FakeWorker.all).toHaveLength(2)
    expect(last().ids()).toHaveLength(1)
  })

  it('a boot that never finishes is stopped at its own longer limit, not at 30 s', async () => {
    const r = track(mod.cas('eval', { expr: '1' }))
    const w = last()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(r.done()).toBe(false)
    await vi.advanceTimersByTimeAsync(mod.BOOT_TIMEOUT_MS)
    expect(r.value()?.error).toMatch(/did not start/i)
    expect(r.value()?.error).toMatch(/next command/i)
    expect(w.terminated).toBe(true)
    const st = mod.useCasStatus.getState()
    expect(words.describeCasStatus(st.status, st.busy, st.message, st.stage).tip).toMatch(/next command/i)
    void mod.cas('eval', { expr: '1' })
    expect(FakeWorker.all).toHaveLength(2)
  })
})

describe('P17 / L4: a recovered error does not leave the strip saying the engine stopped', () => {
  it('after a request-level error, the next good answer reads as ready', async () => {
    const a = track(mod.cas('eval', { expr: 'bad' }))
    const w = last()
    w.emit({ status: 'ready' })
    w.emit({ status: 'error', message: 'TypeError: x is undefined' })
    w.answer(w.ids()[0], { error: 'TypeError: x is undefined' })
    await flush()
    expect(a.value()?.error).toBeTruthy()
    const b = track(mod.cas('eval', { expr: '1' }))
    w.answer(w.ids()[1])
    await flush()
    expect(b.value()?.error).toBeUndefined()
    expect(mod.useCasStatus.getState().status).toBe('ready')
    expect(FakeWorker.all).toHaveLength(1)
  })
})

describe('P17: warm-up', () => {
  it('a second warm-up never starts a second worker or a second boot', () => {
    mod.warmupCas()
    mod.warmupCas()
    expect(FakeWorker.all).toHaveLength(1)
    expect(last().posted).toHaveLength(1)
    void mod.cas('eval', { expr: '1' })
    expect(FakeWorker.all).toHaveLength(1)
  })
})

describe('crew lead: an error from a worker already thrown away is ignored', () => {
  it('a late error event from the cancelled worker neither kills the new worker nor fails its request', async () => {
    const first = track(mod.cas('eval', { expr: '1' }))
    const a = last()
    mod.cancelCas()
    await flush()
    expect(first.done()).toBe(true)
    const second = track(mod.cas('eval', { expr: '2' }))
    const b = last()
    expect(b).not.toBe(a)
    a.onerror?.({ message: 'late' })
    await flush()
    expect(b.terminated).toBe(false)
    expect(second.done()).toBe(false)
    b.emit({ status: 'ready' })
    b.answer(b.ids()[0])
    await flush()
    expect(second.value()?.error).toBeUndefined()
  })
})

describe('a real error from the live worker still ends it', () => {
  it('the waiting request gets the sentence, the status says error, and the next request starts a new worker', async () => {
    const r = track(mod.cas('eval', { expr: '1' }))
    const a = last()
    a.onerror?.({ message: 'crashed' })
    await flush()
    expect(r.value()?.error).toMatch(/stopped/)
    expect(a.terminated).toBe(true)
    expect(mod.useCasStatus.getState().status).toBe('error')
    void mod.cas('eval', { expr: '2' })
    expect(last()).not.toBe(a)
  })
})

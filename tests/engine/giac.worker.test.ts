// The Giac worker's life (math/engine/giac/worker.ts + workers/giac.worker.ts): a run that never ends
// is stopped by the timeout and the next one is answered by a fresh worker; a run that fills the heap
// or throws what the runtime cannot catch is answered in a sentence, and the next one works; the
// worker is recycled after N runs and above M MB; the clock counts only the run; a failed load is
// said in a sentence and the next run starts again; warm-up loads early; Cancel answers every waiting
// run. Against the real runtime headless (tests/engine/giacHeadless.ts), except where a stand-in
// worker is the only way to hold a load back.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { headlessGiacClient, headlessGiacEngine } from './giacHeadless'
import { BOOT_STAGES, STAGE_WORDS } from '../../src/renderer/src/math/engine/giac/stages'
import {
  BOOT_TIMEOUT_MS,
  cancelGiac,
  GIAC_SETUP,
  giacClient,
  useGiacStatus,
  warmupGiac,
  warmupGiacWhenIdle,
  RECYCLE_ABOVE_MB,
  RECYCLE_AFTER_RUNS,
  RUN_TIMEOUT_MS,
  SENTENCES,
  type GiacClient,
  type GiacWorkerLike
} from '../../src/renderer/src/math/engine/giac/worker'
import type { EngineStatus } from '../../src/renderer/src/math/engine/types'

const made: GiacClient[] = []
const track = <T extends GiacClient>(c: T): T => {
  made.push(c)
  return c
}
afterEach(() => {
  for (const c of made.splice(0)) c.dispose()
})

describe('a run that never ends', () => {
  it('is stopped by the timeout, the worker replaced, and the next run answered', async () => {
    const client = track(headlessGiacClient({ timeoutMs: 1500 }))
    // A loop the adapter could never send (its spelling has no such word), straight to the worker.
    const started = Date.now()
    const hung = await client.run(['while(true){}'])
    expect(hung).toEqual({ error: SENTENCES.tooLong })
    // The clock started after the load, so the run lasted its 1.5 s, not the load's second as well.
    expect(Date.now() - started).toBeGreaterThanOrEqual(1500)
    const next = await client.run(['factor(v_x^2-1)'])
    expect(next).toEqual({ outs: ['(v_x-1)*(v_x+1)'] })
    expect(client.stats().replaced).toEqual(['timeout'])
    expect(client.stats().spawned).toBe(2)
  }, 60000)

  it('through the adapter: a huge factorial is stopped in the timeout sentence, and the next job is answered', async () => {
    const { engine, client } = headlessGiacEngine({ timeoutMs: 2000 })
    track(client)
    const r = await engine.ask('eval', { expr: '(10^7)!', deg: false })
    expect(r.error).toBe(SENTENCES.tooLong)
    const next = await engine.ask('factor', { expr: 'x^2-9', deg: false })
    expect(next.text).toBe('(x - 3)*(x + 3)')
  }, 60000)

  it('the runs waiting behind it go to the fresh worker and are answered, not dropped', async () => {
    const client = track(headlessGiacClient({ timeoutMs: 1500 }))
    const [hung, a, b] = await Promise.all([client.run(['while(true){}']), client.run(['expand((v_x+1)^2)']), client.run(['2+3'])])
    expect(hung).toEqual({ error: SENTENCES.tooLong })
    expect(a).toEqual({ outs: ['v_x^2+2*v_x+1'] })
    expect(b).toEqual({ outs: ['5'] })
  }, 60000)
})

describe('a run that breaks the runtime', () => {
  it('filling the heap is answered in a sentence, and the next job works', async () => {
    const { engine, client } = headlessGiacEngine()
    track(client)
    const r = await engine.ask('expand', { expr: '(x+y+z+w)^200', deg: false })
    expect(r.error).toBe(SENTENCES.tooBig)
    expect(client.stats().replaced).toEqual(['crash'])
    expect((await engine.ask('factor', { expr: 'x^2-4', deg: false })).text).toBe('(x - 2)*(x + 2)')
  }, 60000)

  it('an exception the runtime cannot catch (factorial of 10^9) is answered in a sentence, and the next job works', async () => {
    const { engine, client } = headlessGiacEngine()
    track(client)
    expect((await engine.ask('eval', { expr: 'factorial(10^9)', deg: false })).error).toBe(SENTENCES.tooBig)
    expect((await engine.ask('eval', { expr: '2^10', deg: false })).text).toBe('1024')
  }, 60000)
})

describe('recycling', () => {
  it('after N runs the worker is replaced between runs, and answers stay right', async () => {
    const client = track(headlessGiacClient({ recycleAfterRuns: 3 }))
    const outs: string[] = []
    for (let k = 1; k <= 7; k++) {
      const r = await client.run([`${k}+1`])
      outs.push('outs' in r ? r.outs[0] : r.error)
    }
    expect(outs).toEqual(['2', '3', '4', '5', '6', '7', '8'])
    expect(client.stats().replaced).toEqual(['recycle-runs', 'recycle-runs'])
    expect(client.stats().spawned).toBe(3)
  }, 60000)

  it('above M MB of heap the worker is replaced, and the fresh one starts small', async () => {
    const client = track(headlessGiacClient({ recycleAboveMb: 12 }))
    const first = await client.run(['factor(v_x^2-1)'])
    expect(first).toEqual({ outs: ['(v_x-1)*(v_x+1)'] })
    const small = client.stats().heapMb as number
    expect(small).toBeGreaterThan(5)
    expect(small).toBeLessThan(12)
    // expand((x+y+z+w)^40) leaves about 28 MB of the heap taken.
    const big = await client.run(['expand((v_x+v_y+v_z+v_w)^40)'])
    expect('outs' in big).toBe(true)
    expect(client.stats().replaced).toEqual(['recycle-heap'])
    await client.run(['1+1'])
    expect(client.stats().heapMb as number).toBeLessThan(12)
  }, 60000)

  it('the numbers chosen from the measurements are the ones in force', () => {
    // docs/knowledge/giac-adapter.md: 2,464 runs grew the heap by 1.5 MB; a heavy job leaves 16–28 MB.
    expect(RECYCLE_AFTER_RUNS).toBe(500)
    expect(RECYCLE_ABOVE_MB).toBe(64)
    expect(RUN_TIMEOUT_MS).toBe(20000)
    expect(BOOT_TIMEOUT_MS).toBe(120000)
  })
})

describe('loading', () => {
  it('warm-up loads before any question, reporting every stage, and the first answer then comes at once', async () => {
    const seen: Partial<EngineStatus>[] = []
    const client = track(headlessGiacClient({ onStatus: (s) => seen.push(s) }))
    client.warmup()
    // Wait for the load, which is what an idle app does before the first question.
    for (let k = 0; k < 200 && !seen.some((s) => s.status === 'ready'); k++) await new Promise((r) => setTimeout(r, 50))
    const stages = seen.filter((s) => s.status === 'loading').map((s) => s.stage)
    expect(stages).toEqual([0, 1, 2])
    expect(seen.find((s) => s.status === 'ready')?.stage).toBe(BOOT_STAGES)
    // The first question finds the engine loaded: no load starts for it (a time limit here failed under load).
    const before = seen.length
    expect(await client.run(['factor(v_x^2-1)'])).toEqual({ outs: ['(v_x-1)*(v_x+1)'] })
    expect(seen.slice(before).some((s) => s.status === 'loading')).toBe(false)
    expect(client.stats().spawned).toBe(1)
    expect(client.stats().bootMs).toBeGreaterThan(0)
  }, 60000)

  it('has words for every load stage, in plain words', () => {
    expect(BOOT_STAGES).toBe(2)
    expect(STAGE_WORDS).toEqual({ 1: 'loading the algebra library', 2: 'getting it ready' })
  })

  it('a setup that does not take fails the load in a sentence, and the next run starts a new worker', async () => {
    const seen: Partial<EngineStatus>[] = []
    const broken = GIAC_SETUP.map((s, k) => (k === 0 ? { ...s, want: 'something else' } : s))
    const client = track(headlessGiacClient({ setup: broken, onStatus: (s) => seen.push(s) }))
    expect(await client.run(['1+1'])).toEqual({ error: SENTENCES.bootFailed })
    expect(seen.some((s) => s.status === 'error')).toBe(true)
    expect(await client.run(['1+1'])).toEqual({ error: SENTENCES.bootFailed })
    expect(client.stats().spawned).toBe(2)
  }, 60000)

  it('Cancel answers every waiting run, and the next run works', async () => {
    const client = track(headlessGiacClient())
    const waiting = [client.run(['while(true){}']), client.run(['2+2'])]
    client.cancel()
    expect(await Promise.all(waiting)).toEqual([{ error: SENTENCES.cancelled }, { error: SENTENCES.cancelled }])
    expect(await client.run(['3+3'])).toEqual({ outs: ['6'] })
  }, 60000)
})

/** A stand-in worker that loads after `loadMs` and answers each run after `runMs`. */
function slowWorker(loadMs: number, runMs: number): () => GiacWorkerLike {
  return () => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const later = (f: () => void, ms: number): void => void timers.push(setTimeout(f, ms))
    const w: GiacWorkerLike = {
      onmessage: null,
      onerror: null,
      terminate: () => timers.forEach(clearTimeout),
      postMessage: (msg) => {
        const m = msg as { setup?: string[]; id?: number; cmds?: string[] }
        if (m.setup) later(() => w.onmessage?.({ data: { status: 'ready', setup: GIAC_SETUP.map((s) => s.want), bootMs: loadMs } }), loadMs)
        else later(() => w.onmessage?.({ data: { id: m.id, outs: (m.cmds ?? []).map(() => 'ok'), heapMb: 10 } }), runMs)
      }
    }
    return w
  }
}

describe('the clock counts only the run (stand-in workers)', () => {
  it('a load slower than the timeout does not stop the run waiting for it', async () => {
    const client = track(giacClient({ spawn: slowWorker(300, 10), timeoutMs: 100 }))
    expect(await client.run(['x'])).toEqual({ outs: ['ok'] })
  })

  it('a queue longer than the timeout does not stop the runs at its end', async () => {
    const client = track(giacClient({ spawn: slowWorker(10, 60), timeoutMs: 100 }))
    const all = await Promise.all([1, 2, 3, 4].map(() => client.run(['x'])))
    expect(all).toEqual([1, 2, 3, 4].map(() => ({ outs: ['ok'] })))
  })

  it('a load that never ends is stopped by its own limit, in a sentence', async () => {
    const client = track(giacClient({ spawn: slowWorker(60000, 10), bootTimeoutMs: 100 }))
    expect(await client.run(['x'])).toEqual({ error: SENTENCES.bootSlow })
  })
})

describe("the app's own client (math/engine/giac/worker.ts)", () => {
  it('loads nothing until asked; warm-up waits for the app to be idle, once; the worker is the classic giac.worker.ts', () => {
    vi.useFakeTimers()
    const made: Array<{ url: string; options: unknown }> = []
    const idle: Array<() => void> = []
    const g = globalThis as unknown as { Worker?: unknown; requestIdleCallback?: unknown }
    const saved = { Worker: g.Worker, requestIdleCallback: g.requestIdleCallback }
    g.Worker = class {
      onmessage = null
      onerror = null
      constructor(url: URL, options?: unknown) {
        made.push({ url: String(url), options })
      }
      postMessage(): void {}
      terminate(): void {}
    }
    g.requestIdleCallback = (cb: () => void) => idle.push(cb)
    try {
      expect(useGiacStatus.getState()).toEqual({ status: 'idle', busy: 0, stage: 0 })
      warmupGiacWhenIdle()
      warmupGiacWhenIdle()
      expect(idle).toHaveLength(1)
      expect(made).toHaveLength(0)
      idle[0]()
      expect(made).toHaveLength(1)
      // A classic worker (no type: 'module'), because the runtime is loaded with importScripts.
      expect(made[0].url).toMatch(/\/workers\/giac\.worker\.ts$/)
      expect(made[0].options).toBeUndefined()
      expect(useGiacStatus.getState().status).toBe('loading')
      // A second warm-up while the worker loads makes no second worker; Cancel with nothing waiting does nothing.
      warmupGiac()
      cancelGiac()
      expect(made).toHaveLength(1)
    } finally {
      g.Worker = saved.Worker
      g.requestIdleCallback = saved.requestIdleCallback
      vi.useRealTimers()
    }
  })
})

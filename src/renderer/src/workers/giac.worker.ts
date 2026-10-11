/// <reference lib="webworker" />
// The Giac worker: loads the WebAssembly runtime (public/giac/giacwasm.js, docs/knowledge/giac.md)
// once and answers runs of Giac commands, one run at a time. Its client, math/engine/giac/worker.ts,
// builds every command, times every run, and ends this worker when a run takes too long; this file
// only evaluates. It is a classic worker because the runtime is loaded with importScripts, and it is
// written so a test can run this same file in Node behind a small stand-in for the worker scope
// (tests/engine/giacHeadless.ts).
//
// Messages in:  { setup: string[] } first, then { id, cmds: string[] }.
// Messages out: { status: 'loading', stage } while loading; { status: 'ready', setup, bootMs } once
//               the setup commands have run; { status: 'error', message } when the load fails;
//               { id, outs, heapMb } for a run; { id, crashed } when the runtime threw or aborted,
//               after which this worker answers nothing more and the client replaces it.

;(() => {
  type FromClient = { setup: string[] } | { id: number; cmds: string[] }
  type Scope = typeof self & {
    Module?: Record<string, unknown>
    UI?: Record<string, unknown>
    HEAP32?: Int32Array
    DYNAMICTOP_PTR?: number
  }
  const scope = self as Scope
  const started = performance.now()
  let caseval: ((cmd: string) => string) | null = null
  let dead = false
  const waiting: FromClient[] = []

  /** How much of the runtime's fixed 256 MB heap malloc has taken so far (it never gives any back), in MB. */
  function heapMb(): number | null {
    const heap = scope.HEAP32
    const top = scope.DYNAMICTOP_PTR
    return heap && typeof top === 'number' ? heap[top >> 2] / 1048576 : null
  }

  function handle(msg: FromClient): void {
    if (dead || !caseval) return
    if ('setup' in msg) return
    const outs: string[] = []
    for (const cmd of msg.cmds) {
      try {
        outs.push(caseval(cmd))
      } catch (err) {
        // An abort (the heap is full) or a C++ exception the build cannot catch leaves the runtime
        // unusable: nothing after it is evaluated, and the client starts a fresh worker.
        dead = true
        postMessage({ id: msg.id, crashed: String((err as Error)?.message ?? err).slice(0, 200) })
        return
      }
    }
    postMessage({ id: msg.id, outs, heapMb: heapMb() })
  }

  function boot(setup: string[]): void {
    postMessage({ status: 'loading', stage: 1 })
    // The runtime asks its page for a few settings (giacwasm.js ASM_CONSTS): add_evalf 0 stops it
    // appending "=1.414…" to every exact answer, Datestart is the clock its simplify reads (missing,
    // simplify threw "UI is not defined"), and Module.worker keeps it from reading window.navigator.
    scope.UI = { Datestart: Date.now(), add_evalf: 0 }
    scope.Module = {
      worker: true,
      print: () => undefined,
      printErr: () => undefined,
      onAbort: (what: unknown) => {
        dead = true
        if (!caseval) postMessage({ status: 'error', message: `the runtime stopped while loading: ${String(what).slice(0, 200)}` })
      },
      onRuntimeInitialized: () => {
        postMessage({ status: 'loading', stage: 2 })
        const module = scope.Module as { cwrap: (name: string, ret: string, args: string[]) => (cmd: string) => string }
        caseval = module.cwrap('caseval', 'string', ['string'])
        let outs: string[]
        try {
          outs = setup.map((cmd) => (caseval as (c: string) => string)(cmd))
        } catch (err) {
          dead = true
          postMessage({ status: 'error', message: `the setup failed: ${String(err).slice(0, 200)}` })
          return
        }
        postMessage({ status: 'ready', setup: outs, bootMs: Math.round(performance.now() - started) })
        for (const msg of waiting.splice(0)) handle(msg)
      }
    }
    try {
      importScripts(new URL('/giac/giacwasm.js', self.location.href).href)
    } catch (err) {
      dead = true
      postMessage({ status: 'error', message: `the runtime could not be loaded: ${String(err).slice(0, 200)}` })
    }
  }

  let booting = false
  self.onmessage = (e: MessageEvent<FromClient>) => {
    const msg = e.data
    if ('setup' in msg) {
      if (!booting) {
        booting = true
        boot(msg.setup)
      }
      return
    }
    if (caseval) handle(msg)
    else waiting.push(msg)
  }
})()

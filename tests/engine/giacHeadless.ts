// Giac headless, for the tests and the scoreboard (part G3b): the app's own worker file
// (src/renderer/src/workers/giac.worker.ts) run in a Node worker thread, behind a small stand-in for
// a browser worker's scope — self, location, postMessage, onmessage and importScripts — so the same
// code loads the same vendored runtime (src/renderer/public/giac/giacwasm.js) and answers through the
// same client (math/engine/giac/worker.ts) as in the app. The runtime then takes its own worker path:
// it sees importScripts, reads its WebAssembly from the data: URI inside it, and needs nothing else.
// Node can terminate a worker thread in the middle of a run, as a browser can, so the timeouts and
// the recycling are tested as they work in the app.

import { Worker } from 'node:worker_threads'
import ts from 'typescript'
import { readSource, repoPath } from '../helpers/repo'
import { giacEngine } from '../../src/renderer/src/math/engine/giac/adapter'
import { giacClient, type GiacClient, type GiacClientOptions, type GiacWorkerLike } from '../../src/renderer/src/math/engine/giac/worker'
import type { MathEngine } from '../../src/renderer/src/math/engine/types'

/**
 * The stand-in scope, run first in the thread; the worker file's code runs after it, as a classic
 * script. Its own names live inside a function: the runtime declares fs, path and the like at the top
 * level of the same global scope.
 */
const SCOPE = String.raw`;(() => {
const { parentPort, workerData } = require('node:worker_threads')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ORIGIN = 'http://physlab.invalid'
globalThis.self = globalThis
globalThis.location = new URL(ORIGIN + '/assets/giac.worker.js')
globalThis.postMessage = (msg) => parentPort.postMessage(msg)
// importScripts serves the app's public folder, as the app's own server does, and nothing outside it.
globalThis.importScripts = (...urls) => {
  for (const u of urls) {
    const url = new URL(u)
    const file = path.join(workerData.publicDir, ...url.pathname.split('/').filter(Boolean))
    if (url.origin !== ORIGIN || !file.startsWith(workerData.publicDir)) throw new Error('importScripts outside the public folder: ' + u)
    vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file })
  }
}
parentPort.on('message', (data) => { if (typeof globalThis.onmessage === 'function') globalThis.onmessage({ data }) })
vm.runInThisContext(workerData.workerJs, { filename: 'giac.worker.js' })
})()
`

let workerJs: string | null = null

/** The worker file as the browser runs it: its types taken off, nothing else changed. */
function workerSource(): string {
  workerJs ??= ts.transpileModule(readSource('src/renderer/src/workers/giac.worker.ts'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, removeComments: false }
  }).outputText
  return workerJs
}

/** One headless worker, shaped like the browser's Worker for the client. */
function nodeGiacWorker(): GiacWorkerLike {
  const thread = new Worker(SCOPE, { eval: true, workerData: { workerJs: workerSource(), publicDir: repoPath('src', 'renderer', 'public') } })
  // A test that forgets a worker must not keep the run alive.
  thread.unref()
  const like: GiacWorkerLike = {
    postMessage: (msg) => thread.postMessage(msg),
    terminate: () => void thread.terminate(),
    onmessage: null,
    onerror: null
  }
  thread.on('message', (data) => like.onmessage?.({ data }))
  thread.on('error', (err) => like.onerror?.({ message: String(err) }))
  return like
}

/** A client driving headless workers, with any of the client's options changed. */
export function headlessGiacClient(opts: Partial<GiacClientOptions> = {}): GiacClient {
  return giacClient({ spawn: nodeGiacWorker, ...opts })
}

/** The Giac engine headless, and its client (to dispose of, or to read its numbers). */
export function headlessGiacEngine(opts: Partial<GiacClientOptions> = {}): { engine: MathEngine; client: GiacClient } {
  const client = headlessGiacClient(opts)
  return { engine: giacEngine(client.run), client }
}

// The SymPy adapter (math/engine/sympy/adapter.ts) passes the conformance suite: its requests go to
// the worker's own Python, run headless in the app's bundled Pyodide and SymPy (as
// tests/casWorker.test.ts and the `cas` golden sweep run it), so the adapter's spelling both ways
// is tested against the real engine.

import { pathToFileURL } from 'node:url'
import { readSource, repoPath } from '../helpers/repo'
import { engineConformance } from './conformance'
import { sympyEngine } from '../../src/renderer/src/math/engine/sympy/adapter'
import type { CasResult } from '../../src/renderer/src/math/engine/sympy/worker'

async function headlessSend(): Promise<(op: string, payload: Record<string, unknown>) => Promise<CasResult>> {
  const src = readSource('src/renderer/src/workers/cas.worker.ts')
  const tag = 'const PRELUDE = String.raw`'
  const at = src.indexOf(tag) + tag.length
  const base = `${repoPath('src', 'renderer', 'public', 'pyodide')}/`
  const mod = (await import(/* @vite-ignore */ pathToFileURL(`${base}pyodide.mjs`).href)) as {
    loadPyodide: (o: object) => Promise<{ loadPackage: (p: string[]) => Promise<void>; runPython: (s: string) => void; globals: { get: (n: string) => unknown } }>
  }
  const py = await mod.loadPyodide({ indexURL: base })
  await py.loadPackage(['mpmath', 'sympy'])
  py.runPython(src.slice(at, src.indexOf('\n`\n', at)))
  const run = py.globals.get('cas_run') as (op: string, payload: string) => string
  // As the worker does (workers/cas.worker.ts): a reply JSON.parse refuses becomes its refusal.
  return async (op, payload) => {
    try {
      return JSON.parse(run(op, JSON.stringify(payload))) as CasResult
    } catch {
      return { latex: '', text: '', numeric: null, error: 'I could not work this out. Check what you typed, or try a simpler form.' }
    }
  }
}

engineConformance('sympy (headless)', async () => sympyEngine(await headlessSend()), {
  // The worker writes an infinite number as Infinity, which JSON.parse refuses, so an answer of ∞
  // reaches the student as a refusal. A bug, recorded for a fix part (09\cleanup-checks\CW15-FINDINGS.md):
  // fixing it changes an answer, which CW15 must not.
  knownGaps: { 'infinite-number': 'the worker cannot send an infinite number (CW15-FINDINGS 1)' }
})

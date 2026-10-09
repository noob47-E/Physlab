// Golden sweep `cas` (CLEANUP-PLAN.md §2): what the algebra worker's own Python (the PRELUDE of
// workers/cas.worker.ts) answers each job, run headless in the app's bundled Pyodide and SymPy as
// tests/casWorker.test.ts runs it. The fast subset runs every time (out/cas.txt); all the jobs run
// in the full sweep (out/cas-full.txt). The answer is the worker's reply exactly as it sends it.

import { beforeAll, describe, it } from 'vitest'
import { pathToFileURL } from 'node:url'
import { readSource, repoPath } from '../helpers/repo'
import { expectGolden, goldenLine, GOLDEN_FULL, seenOf } from './harness'
import { CAS_JOBS, FAST_COUNT } from './inputs/cas'

let run: (op: string, payload: string) => string

beforeAll(async () => {
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
  run = py.globals.get('cas_run') as (op: string, payload: string) => string
}, 240_000)

const sweep = (jobs: typeof CAS_JOBS): string[] =>
  jobs.map(([op, payload]) => {
    const p = JSON.stringify({ deg: false, ...payload })
    return goldenLine(`${op} ${p}`, seenOf(() => run(op, p)))
  })

describe('golden sweep: cas', () => {
  it('the fast subset matches tests/golden/out/cas.txt', () => {
    expectGolden('cas', sweep(CAS_JOBS.slice(0, FAST_COUNT)))
  }, 120_000)

  it.skipIf(!GOLDEN_FULL)('every job matches tests/golden/out/cas-full.txt', () => {
    expectGolden('cas-full', sweep(CAS_JOBS))
  }, 600_000)
})

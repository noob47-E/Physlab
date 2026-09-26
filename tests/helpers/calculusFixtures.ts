// The worker's recorded replies (tests/fixtures/calculus) for the jobs SymPy works. Integrate and
// Differentiate have no synchronous working, so a test that walks every job in the panel reads
// theirs from what SymPy actually answered when the fixtures were recorded.

import { readFileSync, readdirSync } from 'node:fs'
import { jobById, runPure, type JobId } from '../../src/renderer/src/math/pure/run'
import { math } from '../../src/renderer/src/math/expr'
import { casRequestFor, stepsWorkingFor } from '../../src/renderer/src/math/pure/store'
import type { Working } from '../../src/renderer/src/math/pure/work'
import { repoPath } from './repo'

/**
 * The recorded reply to the request a SymPy job sends for `src`: the one whose integrand is the
 * same function (x e^x was recorded as x*e^x) with the same limits.
 */
export function recordedFor(job: JobId, src: string): Parameters<typeof stepsWorkingFor>[2] {
  const req = casRequestFor(job, src, false)
  if (!req) throw new Error(`${job}: no request for ${src}`)
  const dir = repoPath('tests', 'fixtures', 'calculus')
  const at = (expr: string, x: number): number => Number(math.evaluate(expr, { x }))
  const same = (a: string, b: string): boolean => [0.3, 0.7, 1.9].every((x) => Math.abs(at(a, x) - at(b, x)) < 1e-9)
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const f = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8'))
    const p = req.payload
    if (f.op === req.op && f.payload.lower === p.lower && f.payload.upper === p.upper && same(f.payload.expr, String(p.expr))) return f.result
  }
  throw new Error(`${job}: no recorded reply for ${src}; record one in tests/fixtures/calculus`)
}

/** Any job's working for `src`, whichever engine works it: SymPy's jobs from their recorded reply. */
export const workedFor = (job: JobId, src: string): Working =>
  jobById(job).engine === 'cas' ? stepsWorkingFor(job, src, recordedFor(job, src)) : runPure(job, src)

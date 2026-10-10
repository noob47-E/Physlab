// Golden sweep `steps` (CLEANUP-PLAN.md §2, added in 2.1 for CW15b): the worked steps of 30
// integrals and 30 derivatives, the whole way — the typed line made into the engine's request,
// answered by the algebra worker's own Python run headless in the bundled Pyodide (as the `cas`
// sweep runs it), and set out as the Working panel shows it. The `cas` sweep alone would miss a
// break in reading the engine's rule trees. Full sweep only (about a minute).

import { beforeAll, describe, it, vi } from 'vitest'
import { pathToFileURL } from 'node:url'
import { readSource, repoPath } from '../helpers/repo'
import { expectGolden, goldenLine, GOLDEN_FULL, seenOf } from './harness'
import { DERIVATIVES, INTEGRALS } from './inputs/steps'

vi.mock('../../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { casRequestFor, stepsWorkingFor } from '../helpers/sympyRequests'
import type { Working } from '../../src/renderer/src/math/pure/work'

let run: (op: string, payload: string) => string

beforeAll(async () => {
  if (!GOLDEN_FULL) return
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

/** A working on one line: title, method, each move, the answers, the check, and why there are no steps. */
const writeWorking = (w: Working): string =>
  [
    w.error ? `ERROR ${w.error}` : '',
    w.method ? `METHOD ${w.method}` : '',
    ...w.moves.map((m) => `MOVE ${m.subgoal ? `[${m.subgoal}] ` : ''}${m.head}${m.rule ? ` | RULE ${m.rule}` : ''}${m.tex ? ` | ${m.tex}` : ''}${m.note ? ` | NOTE ${m.note}` : ''}`),
    ...w.answers.map((a) => `ANSWER ${a.label}: ${a.tex}`),
    w.check ? `CHECK ${w.check} [${w.checked ?? '—'}]` : '',
    w.noWorking ? `NO WORKING ${w.reason ?? ''}` : ''
  ]
    .filter(Boolean)
    .join(' ⏎ ')

const sweep = (): string[] =>
  [
    ...INTEGRALS.map((l) => ['integrate', l] as const),
    ...DERIVATIVES.map((l) => ['differentiate', l] as const)
  ].map(([job, line]) =>
    goldenLine(
      `${job} ${line}`,
      seenOf(() => {
        const req = casRequestFor(job, line, false)
        if (!req) return 'no request'
        const reply = JSON.parse(run(req.op, JSON.stringify(req.payload)))
        return writeWorking(stepsWorkingFor(job, line, reply, { decimals: 4, precisionMode: 'sf' }))
      })
    )
  )

describe.skipIf(!GOLDEN_FULL)('golden sweep: steps', () => {
  it('matches tests/golden/out/steps.txt', () => {
    expectGolden('steps', sweep())
  }, 600_000)
})

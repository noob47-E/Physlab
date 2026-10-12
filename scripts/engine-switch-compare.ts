// G4b: what a student would see change when classes move to Giac. Each golden CAS input (tests/golden/inputs/cas.ts)
// whose request is in one of the classes named on the command line is asked of SymPy (today's answer) and through the
// routed ask with those classes on Giac (verified, with SymPy behind it); the lines that differ are printed as
// before → after, for the [answer may change] commit and the owner's list.
//   npx tsx scripts/engine-switch-compare.ts expand "factor over Q" "partial fractions"

import { pathToFileURL } from 'node:url'
import { readSource, repoPath } from '../tests/helpers/repo'
import { headlessGiacEngine } from '../tests/engine/giacHeadless'
import { CAS_JOBS } from '../tests/golden/inputs/cas'
import { sympyEngine } from '../src/renderer/src/math/engine/sympy/adapter'
import type { CasResult } from '../src/renderer/src/math/engine/sympy/worker'
import { classOf, routedAsk, type EngineClass } from '../src/renderer/src/math/engine/switch'
import type { EngineJob, EngineRequest, EngineResult } from '../src/renderer/src/math/engine/types'
import { setAngleMode } from '../src/renderer/src/math/expr'

async function headlessSend(): Promise<(op: string, payload: Record<string, unknown>) => Promise<CasResult>> {
  const src = readSource('src/renderer/src/workers/cas.worker.ts')
  const tag = 'const PRELUDE = String.raw`'
  const at = src.indexOf(tag) + tag.length
  const base = `${repoPath('src', 'renderer', 'public', 'pyodide')}/`
  const mod = (await import(pathToFileURL(`${base}pyodide.mjs`).href)) as {
    loadPyodide: (o: object) => Promise<{ loadPackage: (p: string[]) => Promise<void>; runPython: (s: string) => void; globals: { get: (n: string) => unknown } }>
  }
  const py = await mod.loadPyodide({ indexURL: base })
  await py.loadPackage(['mpmath', 'sympy'])
  py.runPython(src.slice(at, src.indexOf('\n`\n', at)))
  const run = py.globals.get('cas_run') as (op: string, payload: string) => string
  return async (op, payload) => JSON.parse(run(op, JSON.stringify(payload))) as CasResult
}

const shown = (r: EngineResult): string => (r.error ? `error: ${r.error}` : r.latex || r.text)

async function main(): Promise<void> {
  setAngleMode('rad')
  const classes = process.argv.slice(2) as EngineClass[]
  const sympy = sympyEngine(await headlessSend())
  const { engine: giac, client } = headlessGiacEngine()
  const ask = routedAsk({ sympy, giac }, Object.fromEntries(classes.map((c) => [c, 'giac'])))
  let inClass = 0
  let changed = 0
  for (const [op, payload] of CAS_JOBS) {
    const job = op as Exclude<EngineJob, 'integralSteps' | 'diffSteps'>
    const req = { deg: false, ...payload } as EngineRequest
    const cls = classOf(job, req)
    if (!cls || !classes.includes(cls)) continue
    inClass++
    const before = shown(await sympy.ask(job, req))
    const after = shown(await ask(job, req))
    if (before !== after) {
      changed++
      console.log(`[${cls}] ${op} ${JSON.stringify(payload)}\n  before: ${before}\n  after:  ${after}`)
    }
  }
  console.log(`\n${inClass} golden inputs in ${classes.join(', ')}; ${changed} shown differently.`)
  client.dispose()
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

// The scoreboard runner (G3a; engines and judge plugged in by G3b):
//   npx tsx tests/engine/scoreboard/run.ts --engine sympy|giac --class <class>|all --corpus gating|generator|all
// asks the engine headless (SymPy in Pyodide, as tests/engine/conformance.ts does; Giac in a Node worker thread through
// tests/engine/giacHeadless.ts), marks each answer with judge.ts on G2's checkers, and reports right, WRONG (each
// listed with why), can't (no answer), unverified (no checker could decide) and the time per item. With --class all
// --corpus all it also writes tests/engine/scoreboard/results/<engine>.json. It exits 1 when anything is WRONG.

import fs from 'fs'
import path from 'path'
import { parseArgs } from 'util'
import { pathToFileURL } from 'node:url'
import { readSource, repoPath } from '../../helpers/repo'
import { sympyEngine } from '../../../src/renderer/src/math/engine/sympy/adapter'
import type { CasResult } from '../../../src/renderer/src/math/engine/sympy/worker'
import { headlessGiacEngine } from '../giacHeadless'
import { JOB_FOR, judgeAnswer, requestFor, type Judgement } from './judge'
import type { CorpusItem } from './buildCorpora'
import type { EngineResult, EngineJob, MathEngine } from '../../../src/renderer/src/math/engine/types'
import { setAngleMode } from '../../../src/renderer/src/math/expr'

const options = {
  engine: { type: 'string', short: 'e' },
  class: { type: 'string', short: 'c' },
  corpus: { type: 'string', short: 'p' }
} as const

const { values } = parseArgs({ options, args: process.argv.slice(2) })
const engineName = values.engine || 'sympy'
const className = values.class || 'all'
const corpusArg = values.corpus || 'gating'
const corpusNames = corpusArg === 'all' ? ['generator', 'gating'] : [corpusArg]

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
  return async (op, payload) => {
    try {
      return JSON.parse(run(op, JSON.stringify(payload))) as CasResult
    } catch {
      return { latex: '', text: '', numeric: null, error: 'I could not work this out. Check what you typed, or try a simpler form.' }
    }
  }
}

interface Listed {
  id: string
  stratum: string
  question: string
  engine: string
  key: string
  why: string
}
interface ClassStats {
  total: number
  right: number
  wrong: number
  cant: number
  unverified: number
  msPerItem: number
  wrongList: Listed[]
  unverifiedReasons: Record<string, number>
  /** The first few unverified answers, to see what no checker could decide. */
  unverifiedExamples: Listed[]
}

const shown = (r: EngineResult): string =>
  r.solutions ? (r.solutions.length ? r.solutions.map((s) => Object.entries(s).map(([k, v]) => `${k} = ${v.text}`).join(', ')).join('; ') : '(no solution)') : r.text

async function scoreCorpus(engine: MathEngine, corpusName: string): Promise<Record<string, ClassStats>> {
  const corpus: CorpusItem[] = JSON.parse(fs.readFileSync(path.join(__dirname, `${corpusName}.json`), 'utf8'))
  const items = className === 'all' ? corpus : corpus.filter((c) => c.class === className)
  const out: Record<string, ClassStats> = {}
  const times: Record<string, number[]> = {}
  for (const item of items) {
    const s = (out[item.class] ??= { total: 0, right: 0, wrong: 0, cant: 0, unverified: 0, msPerItem: 0, wrongList: [], unverifiedReasons: {}, unverifiedExamples: [] })
    s.total++
    const job = JOB_FOR[item.class as keyof typeof JOB_FOR]
    const start = performance.now()
    let result: EngineResult
    try {
      result = await engine.ask(job as Exclude<EngineJob, 'integralSteps' | 'diffSteps'>, requestFor(item))
    } catch (e: unknown) {
      result = { latex: '', text: '', numeric: null, error: e instanceof Error ? e.message : 'Unknown error' }
    }
    ;(times[item.class] ??= []).push(performance.now() - start)
    if (result.error && !result.solutions && !result.text) {
      s.cant++
      continue
    }
    const j: Judgement = judgeAnswer(item, result)
    if (j.mark === 'right') s.right++
    else if (j.mark === 'unverified') {
      s.unverified++
      s.unverifiedReasons[j.why] = (s.unverifiedReasons[j.why] ?? 0) + 1
      if (s.unverifiedExamples.length < 5) s.unverifiedExamples.push({ id: item.id, stratum: item.stratum, question: item.question, engine: shown(result), key: item.answer, why: j.why })
    } else {
      s.wrong++
      s.wrongList.push({ id: item.id, stratum: item.stratum, question: item.question, engine: shown(result), key: item.answer, why: j.why })
    }
  }
  for (const [cls, ts] of Object.entries(times)) out[cls].msPerItem = Math.round((ts.reduce((a, b) => a + b, 0) / ts.length) * 10) / 10
  return out
}

const pct = (n: number, d: number): string => `${((100 * n) / (d || 1)).toFixed(1)} %`

async function run(): Promise<void> {
  setAngleMode('rad')
  let engine: MathEngine
  let dispose = (): void => {}
  if (engineName === 'sympy') engine = sympyEngine(await headlessSend())
  else if (engineName === 'giac') {
    const g = headlessGiacEngine()
    engine = g.engine
    dispose = () => g.client.dispose()
  } else {
    console.error(`Unknown engine ${engineName}: use sympy or giac.`)
    process.exit(2)
  }
  const results: Record<string, Record<string, ClassStats>> = {}
  let wrong = 0
  for (const corpusName of corpusNames) {
    const byClass = await scoreCorpus(engine, corpusName)
    results[corpusName] = byClass
    console.log(`\nengine=${engineName} corpus=${corpusName}`)
    for (const [cls, s] of Object.entries(byClass)) {
      wrong += s.wrong
      console.log(`  ${cls}: ${s.right}/${s.total} right (${pct(s.right, s.total)}), WRONG ${s.wrong}, can't ${s.cant}, unverified ${s.unverified}, ${s.msPerItem} ms/item`)
      for (const w of s.wrongList) console.log(`    WRONG ${w.id} [${w.stratum}] ${w.question}\n      engine: ${w.engine}\n      key:    ${w.key}\n      why:    ${w.why}`)
    }
  }
  if (className === 'all' && corpusArg === 'all') {
    const dir = path.join(__dirname, 'results')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, `${engineName}.json`), JSON.stringify({ engine: engineName, corpora: results }, null, 2) + '\n')
    console.log(`\nwrote tests/engine/scoreboard/results/${engineName}.json`)
  }
  dispose()
  process.exit(wrong ? 1 : 0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})

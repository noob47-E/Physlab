import fs from 'fs'
import path from 'path'
import { parseArgs } from 'util'
import { pathToFileURL } from 'node:url'
import { readSource, repoPath } from '../../helpers/repo'
import { sympyEngine } from '../../../src/renderer/src/math/engine/sympy/adapter'
import type { CasResult } from '../../../src/renderer/src/math/engine/sympy/worker'
import { judgeAnswer } from './judge'
import type { CorpusItem } from './buildCorpora'
import type { EngineRequest, EngineResult, EngineJob } from '../../../src/renderer/src/math/engine/types'
import { setAngleMode } from '../../../src/renderer/src/math/expr'

const options = {
  engine: { type: 'string', short: 'e' },
  class: { type: 'string', short: 'c' },
  corpus: { type: 'string', short: 'p' },
} as const

const { values } = parseArgs({ options, args: process.argv.slice(2) })

const engineName = values.engine || 'sympy'
const className = values.class || 'all'
const corpusName = values.corpus || 'gating'

const corpusPath = path.join(__dirname, `${corpusName}.json`)
if (!fs.existsSync(corpusPath)) {
  console.error(`Corpus file not found: ${corpusPath}`)
  process.exit(1)
}

const corpus: CorpusItem[] = JSON.parse(fs.readFileSync(corpusPath, 'utf8'))

let filteredCorpus = corpus
if (className !== 'all') {
  filteredCorpus = corpus.filter(c => c.class === className)
}

if (filteredCorpus.length === 0) {
  console.log(`No items found for class ${className}`)
  process.exit(0)
}

interface RunStats {
  total: number
  right: number
  wrong: number
  cant: number
  /** Answered, but not judged: the judge (G2) is not merged yet. */
  unjudged: number
  times: number[]
  wrongList: { question: string, answer: string, expected: string, error?: string }[]
}

const stats: RunStats = {
  total: filteredCorpus.length,
  right: 0,
  wrong: 0,
  cant: 0,
  unjudged: 0,
  times: [],
  wrongList: []
}

const classToJob: Record<string, EngineJob> = {
  'expand': 'expand',
  'factor over Q': 'factor',
  'polynomial equations': 'solve',
  'linear systems': 'solve',
  'rational simplification': 'simplify',
  'derivatives': 'diff',
  'partial fractions': 'apart'
}

function buildRequest(item: CorpusItem, job: EngineJob): EngineRequest {
  if (job === 'solve') {
    if (item.class === 'linear systems') {
      const eqs = item.question.split(',').map(s => s.trim())
      return { eqs, vars: [], deg: false }
    } else {
      return { eqs: [item.question], vars: ['x'], deg: false }
    }
  } else if (job === 'diff') {
    return { expr: item.question, var: 'x', order: 1, deg: false }
  } else {
    return { expr: item.question, deg: false }
  }
}

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

async function run() {
  setAngleMode('rad')
  // Giac's adapter arrives with part G1, which plugs it in here; until then only SymPy can run.
  if (engineName !== 'sympy') {
    console.error(`The ${engineName} engine cannot run here yet: its adapter arrives with part G1. Only --engine sympy runs today.`)
    process.exit(2)
  }
  const send = await headlessSend()
  const engine = sympyEngine(send)
  
  for (const item of filteredCorpus) {
    const job = classToJob[item.class]
    if (!job) {
      console.warn(`Unknown class: ${item.class}`)
      stats.cant++
      continue
    }

    const req = buildRequest(item, job)
    
    const start = performance.now()
    let result: EngineResult
    try {
      if (engineName === 'sympy') {
        result = await engine.ask(job as Exclude<EngineJob, 'integralSteps' | 'diffSteps'>, req)
      } else {
        throw new Error(`Engine ${engineName} not implemented`)
      }
    } catch (e: unknown) {
      result = { latex: '', text: '', numeric: null, error: e instanceof Error ? e.message : 'Unknown error' }
    }
    const end = performance.now()
    stats.times.push(end - start)

    if (result.error && !result.solutions && !result.text) {
      stats.cant++
      continue
    }

    try {
      const isRight = judgeAnswer(item.answer, result)
      if (isRight) {
        stats.right++
      } else {
        stats.wrong++
        stats.wrongList.push({ question: item.question, answer: JSON.stringify(result), expected: item.answer })
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "G2 not merged yet") {
        stats.unjudged++
      } else {
        throw e
      }
    }
  }
  
  const avgTime = stats.times.reduce((a, b) => a + b, 0) / (stats.times.length || 1)
  console.log(`\nReport for engine=${engineName}, class=${className}, corpus=${corpusName}`)
  console.log(`Total: ${stats.total}`)
  console.log(`Right: ${stats.right} (${(stats.right / stats.total * 100).toFixed(1)}%)`)
  console.log(`Wrong: ${stats.wrong}`)
  console.log(`Can't answer: ${stats.cant}`)
  if (stats.unjudged) console.log(`Unjudged (judge missing): ${stats.unjudged} — the G2 checkers are not merged yet, so nothing was marked right or wrong`)
  console.log(`Time per item: ${avgTime.toFixed(2)} ms\n`)

  if (stats.wrong > 0) {
    console.log("WRONG answers:")
    for (const w of stats.wrongList) {
      console.log(` Q: ${w.question}\n Expected: ${w.expected}\n Engine: ${w.answer}\n`)
    }
    process.exit(1)
  } else {
    process.exit(0)
  }
}

run().catch(e => {
  console.error(e)
  process.exit(1)
})

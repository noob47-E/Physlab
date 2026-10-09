import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetGlobals } from '../helpers/globals'
import { expectGolden, goldenLine, freezeClock } from './harness'
import { REFUSALS } from './inputs/errors'
import { runCommand } from '../../src/renderer/src/lang/commands'
import { evaluateInput } from '../../src/renderer/src/calc/evaluateInput'
import { runPure, suggestJob } from '../../src/renderer/src/math/pure/run'
import { scene } from '../../src/renderer/src/core/store'

vi.mock('../../src/renderer/src/math/cas', () => ({
  cas: vi.fn(async (op: string) => ({ latex: `\\text{${op}}`, text: `${op}(x)`, numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {} },
  CAS_OPS: []
}))
vi.mock('../../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

beforeAll(freezeClock)
beforeEach(resetGlobals)

const runError = async (line: string): Promise<string> => {
  resetGlobals()
  scene().newScene()
  // A new scene keeps the last one's space: start each line in Vectors, the app's first space.
  scene().setActiveSpace('vectors')
  scene().clearLog()
  
  const preamble = [
    'A = <3, 4>', 'B = <2, -1>', 'C = <-1, 2>', 'P = (0, 0)', 'Q = (4, 0)', 'S = (0, 3)', 
    'r = <2, 0>', 'F = <0, 5>', 'd = <3, 0>', 'v = <1, 0>', 'q = 2', 'f = Line(P, Q)', 
    'g = Line(Q, S)', 'g(x) = sin(x)', 'h(x) = x^2', 'p(x) = x + 1'
  ]
  for (const p of preamble) await runCommand(p)
  scene().clearLog()

  const results: string[] = []

  try {
    await runCommand(line)
    const errs = scene().log.filter(l => l.kind === 'error')
    if (errs.length) results.push(`bar: ${errs.map(e => e.text).join(' | ')}`)
  } catch (e) {
    results.push(`bar THROWS: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const calc = evaluateInput('COMP', line, { vars: {}, ans: 0, angle: 'deg' })
    if (calc?.error) results.push(`calc: ${calc.error.sentence}${calc.error.detail ? ` [${calc.error.detail}]` : ''}`)
  } catch (e) {
    results.push(`calc THROWS: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const job = suggestJob(line)
    const pure = runPure(job, line)
    if (pure.error) results.push(`pure(${job}): ${pure.error}`)
  } catch (e) {
    results.push(`pure THROWS: ${e instanceof Error ? e.message : String(e)}`)
  }

  return results.join(' || ') || 'NO ERROR'
}

async function sweep(): Promise<string[]> {
  const lines: string[] = []
  for (const l of REFUSALS) {
    lines.push(goldenLine(l, await runError(l)))
  }
  return lines
}

describe('golden sweep: errors', () => {
  it('is stable: two runs in a row give the same lines', async () => {
    expect(await sweep()).toEqual(await sweep())
  }, 120_000)

  it('matches tests/golden/out/errors.txt', async () => {
    expectGolden('errors', await sweep())
  }, 120_000)
})

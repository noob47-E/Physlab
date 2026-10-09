// Golden sweep `bar` (CLEANUP-PLAN.md §2): every line the bar's tests run, and the comma corpus,
// typed on the command bar after a fixed preamble: what the bar prints and what it makes. The
// algebra engine is a stand-in here that answers \text{op}, so a line that reaches it records which
// job the bar chose, not the engine's answer (the `cas` sweep records those).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetGlobals } from '../helpers/globals'
import { expectGolden, goldenLine } from './harness'
import { BAR_COMMANDS, COMMAS } from './inputs/bar'
import { runCommand } from '../../src/renderer/src/lang/commands'
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

// Not freezeClock: two lines here (x < 0, -x, x and x^2 < 4, x) are judged by the graph checks' clock, and a
// stopped clock records an answer the app never gives (cleanup-checks/CW0-FINDINGS.md #11 in the plan folder).
beforeEach(resetGlobals)

const runLine = async (line: string): Promise<string> => {
  resetGlobals()
  scene().newScene()
  scene().clearLog()
  scene().setActiveSpace('vectors')
  
  const preamble = [
    'A = <3, 4>', 'B = <2, -1>', 'C = <-1, 2>', 'P = (0, 0)', 'Q = (4, 0)', 'S = (0, 3)', 
    'r = <2, 0>', 'F = <0, 5>', 'd = <3, 0>', 'v = <1, 0>', 'q = 2', 'f = Line(P, Q)', 
    'g = Line(Q, S)', 'g(x) = sin(x)', 'h(x) = x^2', 'p(x) = x + 1'
  ]
  for (const p of preamble) await runCommand(p)
  scene().clearLog()
  const before = new Set(scene().order)
  
  try {
    await runCommand(line)
  } catch (e) {
    return `THROWS ${e instanceof Error ? e.message : String(e)}`
  }
  
  const log = scene().log.map(l => {
    const parts: string[] = [l.kind]
    if (l.text) parts.push(`text: ${l.text}`)
    if (l.tex) parts.push(`tex: ${l.tex}`)
    return parts.join(' | ')
  }).join(' || ')
  
  // What the line made: the objects that were not there after the preamble.
  const made = Object.values(scene().objects)
    .filter(o => !before.has(o.id) && !o.auxiliary)
    .map(o => `${o.name}: ${o.type}`)
    .sort()
    .join(', ')
    
  return `${log}${made ? ` [Made: ${made}]` : ''}`
}

async function sweep(): Promise<string[]> {
  const lines: string[] = []
  for (const l of [...BAR_COMMANDS, ...COMMAS]) {
    lines.push(goldenLine(l, await runLine(l)))
  }
  return lines
}

describe('golden sweep: bar', () => {
  it('is stable: two runs in a row give the same lines', async () => {
    expect(await sweep()).toEqual(await sweep())
  }, 120_000)

  it('matches tests/golden/out/bar.txt', async () => {
    expectGolden('bar', await sweep())
  }, 120_000)
})

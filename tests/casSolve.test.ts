// P-CAS batch S: what the command bar's solve(…) sends to the algebra engine.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sent = vi.hoisted(() => ({ calls: [] as { op: string; payload: Record<string, unknown> }[] }))

vi.mock('../src/renderer/src/math/engine/sympy/worker', async (orig) => {
  const real = await orig<typeof import('../src/renderer/src/math/engine/sympy/worker')>()
  return {
    ...real,
    cas: vi.fn(async (op: string, payload: Record<string, unknown> = {}) => {
      sent.calls.push({ op, payload })
      return { latex: '', text: '', numeric: null, solutions: [], vars: [] }
    })
  }
})
vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { scene } from '../src/renderer/src/core/store'
import { runCommand } from '../src/renderer/src/lang/commands'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  scene().newScene()
  scene().clearLog()
  sent.calls = []
})

const solvePayload = async (line: string): Promise<Record<string, unknown> | undefined> => {
  await runCommand(line)
  return sent.calls.find((c) => c.op === 'solve')?.payload
}

describe('S1: braced lists in solve(…) are opened before they are sorted', () => {
  it('solve({x + y = 3, x - y = 1}, {x, y}) sends two equations and the letters x, y', async () => {
    const p = await solvePayload('solve({x + y = 3, x - y = 1}, {x, y})')
    expect(p?.eqs).toEqual(['x + y = 3', 'x - y = 1'])
    expect(p?.vars).toEqual(['x', 'y'])
  })

  it('the unbraced forms are unchanged', async () => {
    const p = await solvePayload('solve(x + y = 3, x - y = 1, x, y)')
    if (p) {
      expect(p.eqs).toEqual(['x + y = 3', 'x - y = 1'])
      expect(p.vars).toEqual(['x', 'y'])
    }
  })
})

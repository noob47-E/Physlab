// Which rule reads a typed line (CLEANUP-PLAN.md CW6a): when <…> is a vector, how an argument list splits, and what
// a refusal from the reader says. The one reader is math/expr.ts preprocess (angleVectors decides <…>, splitArgs
// splits arguments). lang/commands.ts keeps two copies of the vector rule — relationsIn, which counts a line's
// relation signs, and splitInputs, which splits a command's inputs — and they differ from preprocess on some lines.
// The pins hold where they agree today; the it.fails are the differences and two bugs found on the way, parked for
// the owner (OWNER-APPROVALS CW6a-1 … CW6a-4) and not applied.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async (op: string) => ({ latex: `\\text{${op}}`, text: `${op}(x)`, numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {}, subscribe: () => () => {} },
  CAS_OPS: []
}))
vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { runCommand } from '../src/renderer/src/lang/commands'
import { scene, type LogEntry } from '../src/renderer/src/core/store'
import { preprocess, splitArgs } from '../src/renderer/src/math/expr'
import { cas } from '../src/renderer/src/math/engine/sympy/worker'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  scene().newScene()
  vi.mocked(cas).mockClear()
})

/** Runs the lines on the bar in order and returns what it printed for the last one. */
async function bar(...lines: string[]): Promise<LogEntry> {
  for (const line of lines) {
    scene().clearLog()
    await runCommand(line)
  }
  return scene().log.at(-1) ?? ({ id: 0, input: '', kind: 'info' } as LogEntry)
}

describe('the vector rule: where the bar’s copies and preprocess agree today', () => {
  it('reads <…> as a vector at the start, after = and against a name the line ends on', async () => {
    expect(preprocess('B = k<1, 2>')).toBe('B = timesOrCross(k, vec(1, 2))')
    expect((await bar('k = 2', 'B = k<1, 2>')).kind).toBe('result')
    expect((await bar('k = 2', 'F = 2<1, 2> + <3, 4>')).kind).toBe('result')
  })

  it('reads < and > as comparisons between names: y < x, y > 2 is two inequalities', async () => {
    expect(preprocess('y < x, y > 2')).toBe('y < x, y > 2')
    expect((await bar('y < x, y > 2')).text).toMatch(/inequalities/)
  })

  it('keeps a vector whole in a command’s inputs and in an argument list', async () => {
    expect(splitArgs('<1, 0>, <0, 1>')).toEqual(['<1, 0>', '<0, 1>'])
    expect(splitArgs('k<1, 2>, x')).toEqual(['k<1, 2>', 'x'])
    expect((await bar('angle(<1, 0>, <0, 1>)')).kind).toBe('result')
  })

  it('takes the braces off solve’s lists and splits each at its own commas', async () => {
    await bar('solve({x + y = 3, x - y = 1}, {x, y})')
    expect(JSON.stringify(vi.mocked(cas).mock.calls)).toContain('"eqs":["x + y = 3","x - y = 1"],"vars":["x","y"]')
  })
})

describe('[answer may change] — waiting for the owner, not applied', () => {
  it.fails('CW6a-1: a vector function given numbers says so in words, not "Expected a vector or point"', async () => {
    // math/expr.ts toV3 throws that text and the bar's friendlyError passes it on unchanged.
    for (const line of ['distance(3, 4)', 'unit(5)', 'proj(3, 4)', 'cross(5, 2)']) {
      expect((await bar(line)).text, line).not.toMatch(/Expected a vector or point/)
    }
  })

  it.fails('CW6a-2: the bar counts relations with preprocess’s own vector rule: B = k<1, 2> + <3, 4> is one assignment', async () => {
    // relationsIn keeps k<1, 2> as two comparisons unless what follows its > ends an operand; preprocess reads a
    // vector there (a sign before another <…> ends one too), so the line was "several equations".
    expect(preprocess('B = k<1, 2> + <3, 4>')).toBe('B = timesOrCross(k, vec(1, 2)) + vec(3, 4)')
    expect((await bar('k = 2', 'B = k<1, 2> + <3, 4>')).kind).toBe('result')
    expect((await bar('k = 2', 'C = |k<1, 2>|')).kind).toBe('result')
  })
})

describe('[answer may change] found on the way — waiting for the owner, not applied', () => {
  it.fails('CW6a-3: a vector with four parts is refused, not read as its first three: |<1, 2, 3, 4>| is not 3.74', async () => {
    // math/expr.ts pt and vec keep c[0], c[1] and c[2] and drop the rest without a word.
    const said = await bar('|<1, 2, 3, 4>|')
    expect(said.kind).toBe('error')
  })

  it.fails('CW6a-4: solve takes off a pair of braces only when they hold one list: {a, b} * {c, d} is not split at "b} * {c"', async () => {
    await bar('solve({a, b} * {c, d} = 1, a)')
    expect(JSON.stringify(vi.mocked(cas).mock.calls)).not.toContain('} * {')
  })
})

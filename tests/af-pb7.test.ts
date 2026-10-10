import { beforeEach, describe, expect, it, vi } from 'vitest'

// The SymPy worker cannot start here, and the stylesheet is not loaded (as in commands.test.ts).
vi.mock('../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async (op: string) => ({ latex: `\\text{${op}}`, text: `${op}(x)`, numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {} },
  CAS_OPS: []
}))
vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { compileScalar } from '../src/renderer/src/math/expr'
import { runCommand } from '../src/renderer/src/lang/commands'
import { scene, type LogEntry } from '../src/renderer/src/core/store'
import type { SceneObject } from '../src/renderer/src/core/types'
import { cas } from '../src/renderer/src/math/engine/sympy/worker'
import { resetGlobals } from './helpers/globals'

function fresh(): void {
  resetGlobals()
  scene().newScene()
  scene().clearLog()
  scene().setActiveSpace('vectors')
  scene().setViewMode('2d')
  vi.mocked(cas).mockClear()
}
beforeEach(fresh)

const run = async (...lines: string[]): Promise<LogEntry> => {
  for (const l of lines) await runCommand(l)
  return scene().log.at(-1) ?? ({ id: 0, input: '', kind: 'info' } as LogEntry)
}
const errors = (): string[] => scene().log.filter((l) => l.kind === 'error').map((l) => `${l.input}: ${l.text}`)

/** The value of the graph the bar drew, at `at`: its stored line compiled as GraphView compiles it. */
const drawn = (vars: string[], at: Record<string, number>): number => {
  const g = Object.values(scene().objects).find((o) => o.type === 'graph') as (SceneObject & { exprs: string[] }) | undefined
  expect(g, 'a graph was drawn').toBeDefined()
  return compileScalar(g!.exprs[0], vars, () => scene().ev.scope)(at)
}

describe('H3 mod in a drawn graph', () => {
  it('compiles x mod 3 as the modulo, positive for a negative x', () => {
    const f = compileScalar('x mod 3', ['x'], () => ({}))
    expect(f({ x: -5 })).toBe(1)
    expect(f({ x: -1 })).toBe(2)
  })

  it('guard: 5 mod 3 is still 2', () => {
    expect(compileScalar('x mod 3', ['x'], () => ({}))({ x: 5 })).toBe(2)
  })

  it('the bar draws y = x mod 3 at 1 for x = −5', async () => {
    await run('y = x mod 3')
    expect(errors()).toEqual([])
    expect(drawn(['x'], { x: -5 })).toBe(1)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FunctionNode, MathNode } from 'mathjs'

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

import { math, preprocess } from '../src/renderer/src/math/expr'
import { runCommand } from '../src/renderer/src/lang/commands'
import { scene, type LogEntry } from '../src/renderer/src/core/store'
import type { SceneObject } from '../src/renderer/src/core/types'
import { cas } from '../src/renderer/src/math/engine/sympy/worker'
import { checkAnswer } from '../src/renderer/src/math/checkAnswer'
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
const named = (name: string): SceneObject | undefined => {
  const id = scene().ev.names.get(name)
  return id ? scene().objects[id] : undefined
}
const computedOf = (name: string) => scene().ev.values.get(scene().ev.names.get(name) ?? '')
const numberNamed = (name: string, value: number) => {
  expect(named(name)?.type, `${name} is a number`).toBe('number')
  const c = computedOf(name)
  expect(c?.type).toBe('number')
  if (c?.type === 'number') expect(c.value).toBeCloseTo(value, 8)
}
const vectorNamed = (name: string, comp: [number, number, number]) => {
  expect(named(name)?.type, `${name} is a vector`).toBe('vector')
  const c = computedOf(name)
  expect(c?.type).toBe('vector')
  if (c?.type === 'vector') c.comp.forEach((x, i) => expect(x).toBeCloseTo(comp[i], 6))
}
const value = (typed: string, scope: Record<string, unknown> = {}): unknown => math.evaluate(preprocess(typed), { ...scope })
const answer = (typed: string, v: number) => checkAnswer(typed, { key: 'a', label: 'A', value: v, tol: 1e-6 })

describe('R4.8 3 N × A takes N alone as the left operand', () => {
  it('takes the quantity 3 N as the left operand of ×', () => {
    const node = math.parse(preprocess('3 N × A'))
    const call = node.filter((n: MathNode) => n.type === 'FunctionNode' && (n as FunctionNode).fn.name === 'timesOrCross')[0] as FunctionNode | undefined
    expect(call, 'the × was read').toBeDefined()
    const left = call!.args[0].evaluate({}) as { toNumber: (u: string) => number }
    expect(left.toNumber('N')).toBe(3)
  })

  it('the bar makes F = 3 N × A from A = <3, 4>', async () => {
    await run('A = <3, 4>', 'F = 3 N × A')
    expect(errors()).toEqual([])
    vectorNamed('F', [9, 12, 0])
  })

  it('guard: ½mv² typed as 1/2 m × v^2 is still 9', async () => {
    await run('m = 2', 'v = 3', 'E = 1/2 m × v^2')
    expect(errors()).toEqual([])
    numberNamed('E', 9)
  })
})

describe('H5 a space before a call\'s bracket beside × or ·', () => {
  it('reads 2 × sin (30), sin (30) × 2 and 2 · sqrt (4) with the call whole', () => {
    expect(value('2 × sin (30)')).toBeCloseTo(1, 12)
    expect(value('sin (30) × 2')).toBeCloseTo(1, 12)
    expect(value('2 · sqrt (4)')).toBeCloseTo(4, 12)
  })

  it('the bar works out 2 × sin (30), and a typed answer 2 × sin (30) is marked right', async () => {
    await run('h = 2 × sin (30)')
    expect(errors()).toEqual([])
    numberNamed('h', 1)
    expect(answer('2 × sin (30)', 1).verdict).toBe('right')
  })
})

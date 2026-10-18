// A graph line typed like a calculator: y = sin x, y = sin 2x, y = 2 sin x cos x, y = sqrt x (18 Oct: the Expressions box
// refused every one of them with "Make a slider first, e.g. sin = 1"; only sin(x) worked).

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async () => ({ latex: '', text: '', numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {}, subscribe: () => () => {} },
  CAS_OPS: []
}))

import { bracketBareCalls } from '../src/renderer/src/lang/bareCalls'
import { addExpressionLine } from '../src/renderer/src/panels/expressionRows'
import { replaceGraphEquation } from '../src/renderer/src/lang/graphEdit'
import { scene } from '../src/renderer/src/core/store'
import { resetGlobals } from './helpers/globals'

describe('bracketBareCalls reads a function the way a textbook does', () => {
  it.each([
    ['y = sin x', 'y = sin(x)'],
    ['y = sin 2x', 'y = sin(2x)'],
    ['y = sin x^2', 'y = sin(x^2)'],
    ['y = 2 sin x cos x', 'y = 2 sin(x) cos(x)'],
    ['y = sin x + 1', 'y = sin(x) + 1'],
    ['y = sin^2 x', 'y = sin(x)^2'],
    ['y = sqrt x', 'y = sqrt(x)'],
    ['y = 3 cos 2.5t - 1', 'y = 3 cos(2.5t) - 1'],
    ['y = tan x / 2', 'y = tan(x) / 2'],
    ['y = arcsin x', 'y = arcsin(x)']
  ])('%s → %s', (typed, read) => expect(bracketBareCalls(typed)).toBe(read))

  it.each(['y = sin(x)', 'y = sin (x)', 'y = sinh(x)', 'y = cosine', 'y = x^2 + 1', 'y = a x^2', 'y = sinx', 'between(f, g, 0, 1)'])(
    'leaves %s as it was',
    (typed) => expect(bracketBareCalls(typed)).toBe(typed)
  )
})

describe('the Expressions box draws a calculator-style line', () => {
  beforeEach(() => {
    resetGlobals()
    scene().newScene()
    scene().clearLog()
    scene().setActiveSpace('graphing')
  })

  const valueAt = (x: number): number => {
    const id = scene().order.find((o) => scene().objects[o]?.type === 'graph')!
    const c = scene().ev.values.get(id) as { f?: (x: number) => number }
    return c.f!(x)
  }

  it.each([
    ['y = sin x', Math.PI / 2, 1],
    ['y = sin 2x', Math.PI / 4, 1],
    ['y = 2 sin x cos x', Math.PI / 4, 1],
    ['y = sin^2 x', Math.PI / 2, 1],
    ['y = sqrt x', 4, 2],
    ['y = cos x + 1', 0, 2]
  ])('%s is drawn (value at x = %d is %d)', async (line, x, y) => {
    expect((await addExpressionLine(line)).ok).toBe(true)
    expect(valueAt(x)).toBeCloseTo(y, 9)
  })

  it('editing a row to y = sin x works too', async () => {
    expect((await addExpressionLine('y = x^2')).ok).toBe(true)
    const id = scene().order.find((o) => scene().objects[o]?.type === 'graph')!
    expect((await replaceGraphEquation(id, 'y = sin x')).ok).toBe(true)
    expect(valueAt(Math.PI / 2)).toBeCloseTo(1, 9)
  })

  it('a function with nothing to work on says so, instead of offering a slider named sin', async () => {
    const r = await addExpressionLine('y = sin')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/needs what it works on/)
    expect(r.reason).not.toMatch(/slider/)
  })
})

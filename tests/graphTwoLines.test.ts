// G6 (fix plan, "to verify"): a headless capture on 16 Oct showed a second typed line replacing the first in Graphing.
// Reproduced by hand on 18 Oct it does not happen - the G3 pictures (reviews\AG-FIX\G3-pictures) show y = x² and y = 4 typed one
// after the other, both kept - so G6 is closed as "not a bug" and these tests keep it that way, through both ways of typing a line.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async () => ({ latex: '', text: '', numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {}, subscribe: () => () => {} },
  CAS_OPS: []
}))

import { addExpressionLine } from '../src/renderer/src/panels/expressionRows'
import { runCommand } from '../src/renderer/src/lang/commands'
import { scene } from '../src/renderer/src/core/store'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  scene().newScene()
  scene().clearLog()
  scene().setActiveSpace('graphing')
})

const sources = (): string[] =>
  scene()
    .order.map((id) => scene().objects[id])
    .filter((o) => o?.type === 'graph')
    .map((o) => (o as { source: string }).source)

describe('G6: a second typed line is a second graph, never a replacement', () => {
  it('in the Expressions box: y = x^2, then y = 4, then y = 2x + 1 - three graphs, in the order typed', async () => {
    for (const line of ['y = x^2', 'y = 4', 'y = 2x + 1']) expect((await addExpressionLine(line)).ok, line).toBe(true)
    expect(sources()).toEqual(['y = x^2', 'y = 4', 'y = 2x + 1'])
  })

  it('in the command bar’s language: two lines run one after the other are two graphs', async () => {
    await runCommand('y = sin(x)')
    await runCommand('y = cos(x)')
    expect(sources()).toEqual(['y = sin(x)', 'y = cos(x)'])
  })

  it('the same line typed twice is still two rows (the student may want to change one), not one overwritten', async () => {
    await addExpressionLine('y = x^2')
    await addExpressionLine('y = x^2')
    expect(sources()).toHaveLength(2)
  })
})

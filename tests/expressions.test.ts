// P-GCALC GC4: the Expressions panel's rules, through the same routes the panel uses: rows are the
// Graphing drawing's graphs, a row edit changes that graph in place, a refused line keeps it, and
// "Draw only from … to …" is the command bar's own piecewise line.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async () => ({ latex: '', text: '', numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {}, subscribe: () => () => {} },
  CAS_OPS: []
}))

import { DEFAULT_WIDTH, EXPRESSION_WORDS, expressionRows, moveRow, rangeLine } from '../src/renderer/src/panels/expressionRows'
import { replaceGraphEquation } from '../src/renderer/src/lang/graphEdit'
import { runCommand } from '../src/renderer/src/lang/commands'
import { scene } from '../src/renderer/src/core/store'
import type { GraphObj } from '../src/renderer/src/core/types'
import { resetGlobals } from './helpers/globals'
import { readSource } from './helpers/repo'

beforeEach(() => {
  resetGlobals()
  scene().newScene()
  scene().clearLog()
  scene().setActiveSpace('graphing')
})
const rows = () => expressionRows(scene().objects, scene().order)
const errors = () => scene().log.filter((l) => l.kind === 'error')

describe('the rows', () => {
  it('are the Graphing drawing\'s graphs, in scene order, and nothing else', async () => {
    await runCommand('y = x^2')
    await runCommand('A = (1, 2)')
    await runCommand('y = sin(x)')
    scene().setActiveSpace('vectors')
    await runCommand('B = <3, 4>')
    expect(errors()).toEqual([])
    expect(rows().map((r) => r.source)).toEqual(['y = x^2', 'y = sin(x)'])
    expect(rows()[0]).toMatchObject({ visible: true, width: DEFAULT_WIDTH, explicit: true })
  })

  it('a row edit changes the same graph, not a new one; a refused line keeps the old one', async () => {
    await runCommand('y = x^2')
    const id = rows()[0].id
    expect(await replaceGraphEquation(id, 'y = x^2 + 1')).toEqual({ ok: true })
    expect(rows().map((r) => [r.id, r.source])).toEqual([[id, 'y = x^2 + 1']])
    const refused = await replaceGraphEquation(id, 'y = )')
    expect(refused.ok).toBe(false)
    expect(rows().map((r) => [r.id, r.source])).toEqual([[id, 'y = x^2 + 1']])
  })
})

describe('Draw only from … to …', () => {
  it('writes the command bar\'s piecewise line', () => {
    expect(rangeLine('y = x^2', 0, 2)).toBe('piecewise(x^2 from 0 to 2)')
    expect(rangeLine('y = x^2', 2, -1.5)).toBe('piecewise(x^2 from −1.5 to 2)')
    expect(rangeLine('f(x) = sin(x)', 0, 3.14)).toBe('piecewise(sin(x) from 0 to 3.14)')
  })

  it('leaves the line alone with an end missing, or for a line that is not y = f(x)', () => {
    expect(rangeLine('y = x^2', null, null)).toBe('y = x^2')
    expect(rangeLine('y = x^2', 1, null)).toBe('y = x^2')
    expect(rangeLine('x^2 + y^2 = 4', 0, 1)).toBe('x^2 + y^2 = 4')
    expect(rangeLine('y < x^2', 0, 1)).toBe('y < x^2')
  })

  it('draws, through the real edit route, a line only on that stretch', async () => {
    await runCommand('y = x^2')
    const id = rows()[0].id
    expect(await replaceGraphEquation(id, rangeLine('y = x^2', -1.5, 2))).toEqual({ ok: true })
    const g = scene().objects[id] as GraphObj
    expect(g.kind).toBe('piecewise')
    expect(g.pieces).toEqual([{ expr: expect.any(String), from: -1.5, to: 2 }])
  })
})

describe('reordering', () => {
  it('swaps a row with its neighbour and leaves every other object where it was', () => {
    expect(moveRow(['g1', 'P', 'g2', 'g3'], ['g1', 'g2', 'g3'], 'g2', -1)).toEqual(['g2', 'P', 'g1', 'g3'])
    expect(moveRow(['g1', 'P', 'g2'], ['g1', 'g2'], 'g2', 1)).toEqual(['g1', 'P', 'g2'])
  })
})

describe('the words', () => {
  it('are the spec\'s, plain English', () => {
    expect(EXPRESSION_WORDS.placeholder).toBe('Type an equation, for example y = x^2')
    expect(EXPRESSION_WORDS.empty).toBe('No lines yet. Type an equation below, or open a picture in the Examples panel.')
    const src = readSource('src/renderer/src/panels/Expressions.tsx')
    expect(src).toContain('replaceGraphEquation(row.id')
    expect(src).toContain('runCommand(text)')
  })
})

// Tests for G2b:
// 1. expressionRows.ts:161 checks only the RHS for lone x,y,z,t so direct assignments like velocity = 3 or height = 2 make no stray sliders.
// 2. Sliders are made only when the line is accepted, so a rejected line leaves no sliders behind.
// 3. The slider and its graph undo as ONE step.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async () => ({ latex: '', text: '', numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {}, subscribe: () => () => {} },
  CAS_OPS: []
}))

import { freeParametersFor, addExpressionLine, commitGraphEquation } from '../src/renderer/src/panels/expressionRows'
import { runCommand } from '../src/renderer/src/lang/commands'
import { scene } from '../src/renderer/src/core/store'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  scene().newScene()
  scene().clearLog()
  scene().setActiveSpace('graphing')
})

const sliderNames = () =>
  Object.values(scene().objects)
    .filter((o) => o.type === 'number' && o.slider)
    .map((o) => o.name)

const graphSources = () =>
  Object.values(scene().objects)
    .filter((o) => o.type === 'graph')
    .map((o) => (o as { source: string }).source)

describe('G2b: freeParametersFor RHS check', () => {
  it('does not offer sliders for direct assignments whose names happen to contain x, y, z, or t', () => {
    expect(freeParametersFor('velocity = 3', scene().ev.scope)).toEqual([])
    expect(freeParametersFor('height = 2', scene().ev.scope)).toEqual([])
    expect(freeParametersFor('tax = 2', scene().ev.scope)).toEqual([])
    expect(freeParametersFor('weight = 9.8', scene().ev.scope)).toEqual([])
    expect(freeParametersFor('total = 100', scene().ev.scope)).toEqual([])
  })

  it('offers sliders for curve relations with parameters', () => {
    expect(freeParametersFor('y = a * x^2', scene().ev.scope)).toEqual(['a'])
    expect(freeParametersFor('y = a', scene().ev.scope)).toEqual(['a'])
    expect(freeParametersFor('y = m * x + c', scene().ev.scope)).toEqual(['m', 'c'])
  })

  it('offers sliders when assignment RHS contains curve variables like t', () => {
    expect(freeParametersFor('v = a * t', scene().ev.scope)).toEqual(['a'])
  })
})

describe('G2b: rejected line leaves no sliders behind', () => {
  it('leaves no sliders if adding an invalid line fails', async () => {
    const free = freeParametersFor('y = a * / 2', scene().ev.scope)
    // Even if free found something, committing an invalid line must not leave sliders behind
    const res = await addExpressionLine('y = a * / 2', free)
    expect(res.ok).toBe(false)
    expect(sliderNames()).toEqual([])
    expect(graphSources()).toEqual([])
  })

  it('leaves no sliders if editing a graph to a non-graph direct assignment is rejected', async () => {
    await runCommand('y = x^2')
    const g = Object.values(scene().objects).find((o) => o.type === 'graph')!
    expect(g).toBeDefined()

    const res = await commitGraphEquation(g.id, 'tax = 2')
    expect(res.ok).toBe(false)
    expect(sliderNames()).toEqual([])
    expect(graphSources()).toEqual(['y = x^2'])
  })
})

describe('G2b: slider and its graph undo as ONE step', () => {
  it('undoes auto-created sliders and the graph together in one step', async () => {
    const free = freeParametersFor('y = a * x + b', scene().ev.scope)
    expect(free).toEqual(['a', 'b'])

    const res = await addExpressionLine('y = a * x + b', free)
    expect(res.ok).toBe(true)
    expect(sliderNames().sort()).toEqual(['a', 'b'])
    expect(graphSources()).toEqual(['y = a * x + b'])

    // One undo step removes BOTH the graph and both auto-created sliders
    scene().undo()
    expect(sliderNames()).toEqual([])
    expect(graphSources()).toEqual([])

    // One redo step brings BOTH back
    scene().redo()
    expect(sliderNames().sort()).toEqual(['a', 'b'])
    expect(graphSources()).toEqual(['y = a * x + b'])
  })

  it('undoes an edited graph and its new slider together in one step', async () => {
    await runCommand('y = x^2')
    const g = Object.values(scene().objects).find((o) => o.type === 'graph')!
    expect(g).toBeDefined()

    const res = await commitGraphEquation(g.id, 'y = k * x^2')
    expect(res.ok).toBe(true)
    expect(sliderNames()).toEqual(['k'])
    expect(graphSources()).toEqual(['y = k * x^2'])

    // One undo step reverts the graph equation and removes the new slider
    scene().undo()
    expect(sliderNames()).toEqual([])
    expect(graphSources()).toEqual(['y = x^2'])

    // One redo step restores the edited equation and the slider
    scene().redo()
    expect(sliderNames()).toEqual(['k'])
    expect(graphSources()).toEqual(['y = k * x^2'])
  })
})

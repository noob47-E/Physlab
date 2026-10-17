// Tests for G2: sliders for y = a x^2, free parameter detection, no red error, and sliders listed in Expressions.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async () => ({ latex: '', text: '', numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {}, subscribe: () => () => {} },
  CAS_OPS: []
}))

import { expressionRows, freeParametersFor, createSlider, moveRow } from '../src/renderer/src/panels/expressionRows'
import { runCommand } from '../src/renderer/src/lang/commands'
import { scene } from '../src/renderer/src/core/store'
import type { NumberObj } from '../src/renderer/src/core/types'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  scene().newScene()
  scene().clearLog()
  scene().setActiveSpace('graphing')
})

const rows = () => expressionRows(scene().objects, scene().order, scene().ev)
const errors = () => scene().log.filter((l) => l.kind === 'error')

describe('G2: free parameter detection', () => {
  it('detects unknown symbol a in y = a x^2 as a free parameter', () => {
    expect(freeParametersFor('y = a x^2', scene().ev.scope)).toEqual(['a'])
  })

  it('detects multiple parameters in y = a x^2 + b x + c', () => {
    expect(freeParametersFor('y = a x^2 + b x + c', scene().ev.scope)).toEqual(['a', 'b', 'c'])
  })

  it('ignores standard variables x, y, constants pi, e and already defined sliders', async () => {
    expect(freeParametersFor('y = sin(x)', scene().ev.scope)).toEqual([])
    expect(freeParametersFor('y = pi * x', scene().ev.scope)).toEqual([])
    createSlider('a', 1)
    expect(freeParametersFor('y = a x^2', scene().ev.scope)).toEqual([])
  })

  it('does not treat direct assignment like a = 1 as a free parameter', () => {
    expect(freeParametersFor('a = 1', scene().ev.scope)).toEqual([])
    expect(freeParametersFor('k = 2.5', scene().ev.scope)).toEqual([])
  })

  it('createSlider guards against duplicate names', () => {
    const s1 = createSlider('w', 1)
    const s2 = createSlider('w', 2)
    expect(s1.id).toBe(s2.id)
    expect(Object.values(scene().objects).filter((o) => o.name === 'w').length).toBe(1)
  })
})

describe('G2: sliders listed in Expressions', () => {
  it('includes both sliders and graphs in scene order', async () => {
    await runCommand('a = 1')
    await runCommand('y = a * x^2')
    expect(errors()).toEqual([])
    const r = rows()
    expect(r.map((x) => x.source)).toEqual(['a = 1', 'y = a * x^2'])
    expect(r[0]).toMatchObject({ kind: 'slider', name: 'a', value: 1, min: -5, max: 10, step: 0.1 })
    expect(r[1]).toMatchObject({ kind: 'graph', source: 'y = a * x^2' })
  })

  it('reorders sliders and graphs with moveRow', async () => {
    await runCommand('a = 1')
    await runCommand('y = a * x^2')
    const r = rows()
    const nextOrder = moveRow(scene().order, r.map((x) => x.id), r[0].id, 1)
    scene().setOrder(nextOrder)
    expect(rows().map((x) => x.source)).toEqual(['y = a * x^2', 'a = 1'])
  })

  it('updating slider value and range updates the scene object and evaluation', async () => {
    const slider = createSlider('k', 2, -5, 5, 0.5)
    await runCommand('y = k * x')
    expect(errors()).toEqual([])
    
    // Update value to 3.5
    scene().updateObject(slider.id, (d) => {
      if (d.type === 'number') d.expr = '3.5'
    })
    expect(scene().ev.scope['k']).toBe(3.5)
    const r = rows()
    expect(r[0]).toMatchObject({ kind: 'slider', name: 'k', value: 3.5 })

    // Update range bounds
    scene().updateObject(slider.id, (d) => {
      if (d.type === 'number' && d.slider) {
        d.slider.min = -20
        d.slider.max = 20
        d.slider.step = 1
      }
    })
    const updated = scene().objects[slider.id] as NumberObj
    expect(updated.slider).toEqual({ min: -20, max: 20, step: 1 })
  })

  it('deleting a slider removes it from Expressions and scene', async () => {
    const slider = createSlider('m', 1)
    expect(rows().some((r) => r.id === slider.id)).toBe(true)
    scene().removeObjects([slider.id])
    expect(rows().some((r) => r.id === slider.id)).toBe(false)
  })
})

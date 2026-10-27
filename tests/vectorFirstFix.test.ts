import { describe, it, expect, beforeEach } from 'vitest'
import { scene } from '../src/renderer/src/core/store'
import { enterMode } from '../src/renderer/src/app/layout'
import { runCommand } from '../src/renderer/src/lang/commands'
import { runTool } from '../src/renderer/src/ai/tools'
import { spaceOf, visibleOrder } from '../src/renderer/src/core/visibility'
import type { VectorObj } from '../src/renderer/src/core/types'

describe('Part 1 First Fix: Vectors in Vectors Mode', () => {
  beforeEach(() => {
    scene().newScene()
    enterMode('vectors')
  })

  it('vector(A, B) creates an arrow with tail A and tip B in vectors space', async () => {
    await runCommand('A = (0, 0)')
    await runCommand('B = (3, 4)')
    const res = await runCommand('v = vector(A, B)')
    expect(res.ok).toBe(true)

    const vId = scene().ev.names.get('v')!
    expect(vId).toBeDefined()
    const vObj = scene().objects[vId] as VectorObj
    expect(vObj.type).toBe('vector')
    expect(vObj.space).toBe('vectors')
    expect(vObj.def.kind).toBe('points')

    const vis = visibleOrder(scene().order, scene().objects, spaceOf('vectors'))
    expect(vis).toContain(vId)

    const val = scene().ev.values.get(vId)
    expect(val?.type).toBe('vector')
    if (val?.type === 'vector') {
      expect(val.comp[0]).toBeCloseTo(3)
      expect(val.comp[1]).toBeCloseTo(4)
      expect(val.tail[0]).toBeCloseTo(0)
      expect(val.tail[1]).toBeCloseTo(0)
    }
  })

  it('AB syntax creates vector from point A to point B', async () => {
    await runCommand('A = (1, 1)')
    await runCommand('B = (4, 5)')
    const res = await runCommand('AB')
    expect(res.ok).toBe(true)

    const abId = scene().ev.names.get('AB')!
    expect(abId).toBeDefined()
    const abObj = scene().objects[abId] as VectorObj
    expect(abObj.type).toBe('vector')
    expect(abObj.space).toBe('vectors')

    const val = scene().ev.values.get(abId)
    expect(val?.type).toBe('vector')
    if (val?.type === 'vector') {
      expect(val.comp[0]).toBeCloseTo(3)
      expect(val.comp[1]).toBeCloseTo(4)
      expect(val.tail[0]).toBeCloseTo(1)
      expect(val.tail[1]).toBeCloseTo(1)
    }
  })

  it('v = B - A creates displacement vector with tail at A and tip at B', async () => {
    await runCommand('A = (2, 2)')
    await runCommand('B = (5, 6)')
    const res = await runCommand('v = B - A')
    expect(res.ok).toBe(true)

    const vId = scene().ev.names.get('v')!
    const vObj = scene().objects[vId] as VectorObj
    expect(vObj.type).toBe('vector')
    expect(vObj.def.kind).toBe('points')

    const val = scene().ev.values.get(vId)
    expect(val?.type).toBe('vector')
    if (val?.type === 'vector') {
      expect(val.comp[0]).toBeCloseTo(3)
      expect(val.comp[1]).toBeCloseTo(4)
      expect(val.tail[0]).toBeCloseTo(2)
      expect(val.tail[1]).toBeCloseTo(2)
    }
  })

  it('free vector v = 3i + 4j draws from the origin', async () => {
    const res = await runCommand('v = 3i + 4j')
    expect(res.ok).toBe(true)

    const vId = scene().ev.names.get('v')!
    const vObj = scene().objects[vId] as VectorObj
    expect(vObj.type).toBe('vector')
    expect(vObj.space).toBe('vectors')

    const val = scene().ev.values.get(vId)
    expect(val?.type).toBe('vector')
    if (val?.type === 'vector') {
      expect(val.comp[0]).toBeCloseTo(3)
      expect(val.comp[1]).toBeCloseTo(4)
      expect(val.tail).toEqual([0, 0, 0])
    }
  })

  it('"add u and v" draws resultant and head-to-tail helper vectors', async () => {
    await runCommand('u = <3, 4>')
    await runCommand('v = <1, 2>')
    const res = await runCommand('add u and v')
    expect(res.ok).toBe(true)

    const rId = scene().ev.names.get('R')!
    expect(rId).toBeDefined()
    const rObj = scene().objects[rId] as VectorObj
    expect(rObj.type).toBe('vector')
    expect(rObj.color).toBe('#ffd43b') // Yellow resultant

    // Helper vector v' placed at head of u
    const helperId = scene().ev.names.get('v′')!
    expect(helperId).toBeDefined()
    const helperObj = scene().objects[helperId] as VectorObj
    expect(helperObj.auxiliary).toBe(true)

    const val = scene().ev.values.get(rId)
    expect(val?.type).toBe('vector')
    if (val?.type === 'vector') {
      expect(val.comp[0]).toBeCloseTo(4)
      expect(val.comp[1]).toBeCloseTo(6)
    }
  })

  it('"resolve 10 N at 30°" creates vector with components shown', async () => {
    const res = await runCommand('resolve 10 N at 30°')
    expect(res.ok).toBe(true)

    const objects = Object.values(scene().objects)
    const vec = objects.find((o) => o.type === 'vector' && (o as VectorObj).showComponents) as VectorObj
    expect(vec).toBeDefined()
    expect(vec.unit).toBe('N')
    expect(vec.space).toBe('vectors')

    const val = scene().ev.values.get(vec.id)
    expect(val?.type).toBe('vector')
    if (val?.type === 'vector') {
      expect(val.comp[0]).toBeCloseTo(10 * Math.cos(Math.PI / 6))
      expect(val.comp[1]).toBeCloseTo(10 * Math.sin(Math.PI / 6))
    }
  })

  it('AI run_commands creates vector(A, B) and reports it in describe_screen', async () => {
    const res = await runTool('run_commands', {
      mode: 'vectors',
      commands: ['A = (0, 0)', 'B = (3, 4)', 'v = vector(A, B)']
    })

    expect(res.ok).toBe(true)
    expect(res.created).toBeDefined()
    expect(res.screen).toContain('Vector v')
    expect(res.screen).toContain('<3.00, 4.00>')
  })
})

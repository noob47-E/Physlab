import { describe, expect, it } from 'vitest'
import { evaluateScene } from '../src/renderer/src/core/evaluate'
import { DEFAULT_SETTINGS } from '../src/renderer/src/core/store'
import type { ObjId, SceneObject } from '../src/renderer/src/core/types'
import { surfaceGeometry } from '../src/renderer/src/math/graphs'

const point = (id: string, expr: string): SceneObject =>
  ({ id, name: id, visible: true, locked: false, color: '#fff', showLabel: true, type: 'point', def: { kind: 'expr', expr } }) as SceneObject

describe('scene evaluation', () => {
  it('handles a chain far longer than the old 50-pass limit', () => {
    const objects: Record<ObjId, SceneObject> = {}
    const order: ObjId[] = []
    objects['P0'] = { ...point('P0', ''), def: { kind: 'free', p: [0, 0, 0] } } as SceneObject
    order.push('P0')
    for (let i = 1; i <= 60; i++) {
      const id = `P${i}`
      objects[id] = point(id, `P${i - 1} + (1, 0)`)
      order.push(id)
    }
    const ev = evaluateScene(objects, order, DEFAULT_SETTINGS, 0)
    expect(ev.errors.size).toBe(0)
    const last = ev.values.get('P60')
    expect(last?.type).toBe('point')
    expect(last?.type === 'point' && last.p[0]).toBe(60)
  })
  it('explains a circular definition by name', () => {
    const objects: Record<ObjId, SceneObject> = { A: point('A', 'B + (1, 0)'), B: point('B', 'A + (1, 0)') }
    const ev = evaluateScene(objects, ['A', 'B'], DEFAULT_SETTINGS, 0)
    expect(ev.errors.get('A')).toMatch(/loop/i)
    expect(ev.errors.get('A')).toContain('B')
  })
})

describe('3D surfaces', () => {
  it('leaves a hole where the function has no value', () => {
    const f = (x: number, y: number) => Math.sqrt(x * x + y * y - 1)
    const g = surfaceGeometry(f, 2, 8)
    expect(Number.isFinite(g.zMin)).toBe(true)
    // No triangle may use a point inside the unit circle, where the function is undefined.
    const inside = (k: number) => Math.hypot(g.positions[k * 3], g.positions[k * 3 + 1]) < 1
    expect(g.indices.some(inside)).toBe(false)
  })
})

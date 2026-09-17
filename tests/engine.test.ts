import { describe, expect, it } from 'vitest'
import { evaluateScene } from '../src/renderer/src/core/evaluate'
import { DEFAULT_SETTINGS } from '../src/renderer/src/core/store'
import type { ObjId, SceneObject } from '../src/renderer/src/core/types'
import { surfaceGeometry } from '../src/renderer/src/math/graphs'
import { isValidName } from '../src/renderer/src/core/naming'

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

describe('points that live on another object', () => {
  const base = { visible: true, locked: false, color: '#fff', showLabel: true }
  it('sits at a fraction along a segment and on a circle', () => {
    const objects: Record<ObjId, SceneObject> = {
      A: { ...base, id: 'A', name: 'A', type: 'point', def: { kind: 'free', p: [0, 0, 0] } } as SceneObject,
      B: { ...base, id: 'B', name: 'B', type: 'point', def: { kind: 'free', p: [4, 0, 0] } } as SceneObject,
      s1: { ...base, id: 's1', name: 'a', type: 'segment', a: 'A', b: 'B' } as SceneObject,
      F: { ...base, id: 'F', name: 'F', type: 'point', def: { kind: 'onObject', on: 's1', t: 0.25 } } as SceneObject,
      c1: { ...base, id: 'c1', name: 'c', type: 'circle', def: { kind: 'centerRadius', c: 'A', r: '2' } } as SceneObject,
      G: { ...base, id: 'G', name: 'G', type: 'point', def: { kind: 'onObject', on: 'c1', t: 0 } } as SceneObject
    }
    const ev = evaluateScene(objects, ['A', 'B', 's1', 'F', 'c1', 'G'], DEFAULT_SETTINGS, 0)
    expect(ev.errors.size).toBe(0)
    const f = ev.values.get('F')
    expect(f?.type === 'point' && f.p[0]).toBeCloseTo(1)
    const g = ev.values.get('G')
    expect(g?.type === 'point' && g.p[0]).toBeCloseTo(2)
  })
  it('follows the segment when an end point moves', () => {
    const objects: Record<ObjId, SceneObject> = {
      A: { ...base, id: 'A', name: 'A', type: 'point', def: { kind: 'free', p: [0, 0, 0] } } as SceneObject,
      B: { ...base, id: 'B', name: 'B', type: 'point', def: { kind: 'free', p: [10, 0, 0] } } as SceneObject,
      s1: { ...base, id: 's1', name: 'a', type: 'segment', a: 'A', b: 'B' } as SceneObject,
      F: { ...base, id: 'F', name: 'F', type: 'point', def: { kind: 'onObject', on: 's1', t: 0.5 } } as SceneObject
    }
    const ev = evaluateScene(objects, ['A', 'B', 's1', 'F'], DEFAULT_SETTINGS, 0)
    const f = ev.values.get('F')
    expect(f?.type === 'point' && f.p[0]).toBeCloseTo(5)
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

describe('object names', () => {
  it('accepts the names the app gives itself', () => {
    // visualize.ts labels the placed copies A′ and B′ with the Unicode prime (U+2032); the
    // validator used to reject them, so the app produced names it considered invalid.
    expect(isValidName('A′')).toBe(true)
    expect(isValidName("A'")).toBe(true)
    expect(isValidName('R')).toBe(true)
    expect(isValidName('theta')).toBe(false)
    expect(isValidName('2A')).toBe(false)
  })
})

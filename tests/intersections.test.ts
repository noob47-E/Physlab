// Snapping onto a crossing: the viewport works out where two objects meet with the same function,
// in the same order, as the evaluator, so a point placed on crossing number 1 by snapping is still
// crossing number 1 when the scene is worked out again — and follows its parents when they move.

import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import { asGLine, canIntersect, intersectionsOf } from '../src/renderer/src/math/intersections'
import { asGLine as asGLineFromEvaluate, evaluateScene } from '../src/renderer/src/core/evaluate'
import { pickAll, pickAt, type PickContext } from '../src/renderer/src/render/picking'
import { DEFAULT_SETTINGS } from '../src/renderer/src/core/store'
import type { Computed, ObjId, SceneObject } from '../src/renderer/src/core/types'
import type { V3 } from '../src/renderer/src/math/vec'

const base = (id: string, name: string) => ({ id, name, visible: true, locked: false, color: '#000', showLabel: true })
const point = (id: string, name: string, p: V3): SceneObject => ({ ...base(id, name), type: 'point', def: { kind: 'free', p } })
const segment = (id: string, name: string, a: ObjId, b: ObjId): SceneObject => ({ ...base(id, name), type: 'segment', a, b })

const seg = (p: V3, q: V3): Computed => ({ type: 'segment', line: { kind: 'segment', p, d: [q[0] - p[0], q[1] - p[1], q[2] - p[2]] } })
const line = (p: V3, d: V3): Computed => ({ type: 'line', line: { kind: 'line', p, d } })
const circle = (c: V3, r: number): Computed => ({ type: 'circle', circle: { c, r } })

/** The two segments a student draws as a cross: (0,0)–(4,6) and (0,6)–(4,0), which meet at (2,3). */
function crossScene(): { objects: Record<ObjId, SceneObject>; order: ObjId[] } {
  const list = [point('pA', 'A', [0, 0, 0]), point('pB', 'B', [4, 6, 0]), point('pC', 'C', [0, 6, 0]), point('pD', 'D', [4, 0, 0]), segment('sAB', 'a', 'pA', 'pB'), segment('sCD', 'c', 'pC', 'pD')]
  return { objects: Object.fromEntries(list.map((o) => [o.id, o])), order: list.map((o) => o.id) }
}

describe('intersectionsOf', () => {
  it('finds where two crossed segments meet', () => {
    const pts = intersectionsOf(seg([0, 0, 0], [4, 6, 0]), seg([0, 6, 0], [4, 0, 0]))
    expect(pts).toHaveLength(1)
    expect(pts[0][0]).toBeCloseTo(2)
    expect(pts[0][1]).toBeCloseTo(3)
  })

  it('respects the ends of a segment: the lines would meet, the segments do not', () => {
    // The same directions, but the second segment stops short of the first.
    expect(intersectionsOf(seg([0, 0, 0], [4, 6, 0]), seg([0, 6, 0], [1, 4.5, 0]))).toEqual([])
    // Extended to a full line it crosses again.
    expect(intersectionsOf(seg([0, 0, 0], [4, 6, 0]), line([0, 6, 0], [1, -1.5, 0]))).toHaveLength(1)
  })

  it('numbers the two crossings of a line and a circle along the line, and two circles either side of their centres', () => {
    const lc = intersectionsOf(line([-5, 0, 0], [1, 0, 0]), circle([0, 0, 0], 2))
    expect(lc.map((p) => p[0])).toEqual([-2, 2])
    // The other way round gives the same points in the same order: the point does not care which parent came first.
    expect(intersectionsOf(circle([0, 0, 0], 2), line([-5, 0, 0], [1, 0, 0])).map((p) => p[0])).toEqual([-2, 2])
    const cc = intersectionsOf(circle([0, 0, 0], 5), circle([6, 0, 0], 5))
    expect(cc).toHaveLength(2)
    expect(cc[0][0]).toBeCloseTo(3)
    expect(cc[0][1]).toBeCloseTo(4)
    expect(cc[1][1]).toBeCloseTo(-4)
  })

  it('treats a vector as the segment from its tail to its head', () => {
    const v: Computed = { type: 'vector', tail: [0, 0, 0], comp: [4, 6, 0] }
    expect(asGLine(v)).toEqual({ kind: 'segment', p: [0, 0, 0], d: [4, 6, 0] })
    expect(intersectionsOf(v, seg([0, 6, 0], [4, 0, 0]))[0][1]).toBeCloseTo(3)
    expect(asGLine({ type: 'point', p: [1, 1, 0] })).toBeNull()
  })

  it('says what can be intersected at all', () => {
    expect(canIntersect(seg([0, 0, 0], [1, 1, 0]), circle([0, 0, 0], 1))).toBe(true)
    expect(canIntersect({ type: 'point', p: [0, 0, 0] }, circle([0, 0, 0], 1))).toBe(false)
    expect(intersectionsOf({ type: 'point', p: [0, 0, 0] }, circle([0, 0, 0], 1))).toEqual([])
  })

  it('is the one definition of a line the evaluator uses too', () => {
    expect(asGLineFromEvaluate).toBe(asGLine)
  })
})

describe('a point snapped onto a crossing', () => {
  it('re-evaluates to the crossing, and follows its parents when one of them moves', () => {
    const { objects, order } = crossScene()
    const snapped: SceneObject = { ...base('pX', 'X'), type: 'point', def: { kind: 'intersection', a: 'sAB', b: 'sCD', index: 0 } }
    const all = { ...objects, pX: snapped }
    const ev = evaluateScene(all, [...order, 'pX'], DEFAULT_SETTINGS, 0)
    expect(ev.errors.size).toBe(0)
    const x = ev.values.get('pX')
    expect(x?.type).toBe('point')
    if (x?.type !== 'point') return
    expect(x.p[0]).toBeCloseTo(2)
    expect(x.p[1]).toBeCloseTo(3)

    // Drag B: the crossing moves and X moves with it, because X is defined by the crossing.
    const moved = { ...all, pB: point('pB', 'B', [4, 12, 0]) }
    const ev2 = evaluateScene(moved, [...order, 'pX'], DEFAULT_SETTINGS, 0)
    const x2 = ev2.values.get('pX')
    if (x2?.type !== 'point') throw new Error('not a point')
    // AB is now y = 3x and CD is y = 6 − 1.5x: they meet at x = 4/3.
    expect(x2.p[0]).toBeCloseTo(4 / 3)
    expect(x2.p[1]).toBeCloseTo(4)
  })

  it('goes with its parents when they are pulled apart', () => {
    const { objects, order } = crossScene()
    const snapped: SceneObject = { ...base('pX', 'X'), type: 'point', def: { kind: 'intersection', a: 'sAB', b: 'sCD', index: 0 } }
    const apart = { ...objects, pX: snapped, pC: point('pC', 'C', [10, 6, 0]), pD: point('pD', 'D', [14, 0, 0]) }
    const ev = evaluateScene(apart, [...order, 'pX'], DEFAULT_SETTINGS, 0)
    expect(ev.errors.get('pX')).toBe('no intersection')
  })
})

describe('pickAll', () => {
  /** A 1000×800 canvas looking straight down at the drawing, 50 px to the unit, origin in the middle. */
  function ctx(): PickContext {
    const camera = new THREE.OrthographicCamera(-500, 500, 400, -400, 0.1, 1000)
    camera.position.set(0, 0, 100)
    camera.zoom = 50
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    const { objects, order } = crossScene()
    const ev = evaluateScene(objects, order, DEFAULT_SETTINGS, 0)
    return { camera, size: { width: 1000, height: 800 }, objects, order, ev }
  }
  /** Where a drawing position lands on that canvas. */
  const px = (x: number, y: number) => ({ sx: 500 + x * 50, sy: 400 - y * 50 })

  it('returns every hit within tolerance, best first, and pickAt is its first', () => {
    const c = ctx()
    const { sx, sy } = px(2, 3)
    const hits = pickAll(c, sx, sy)
    // Both segments pass through the crossing; nothing else is near.
    expect(hits.map((h) => h.id).sort()).toEqual(['sAB', 'sCD'])
    expect(hits.every((h) => h.dist < 1)).toBe(true)
    expect(pickAt(c, sx, sy)).toEqual(hits[0])
  })

  it('puts a point before a line and the nearer of two lines first', () => {
    const c = ctx()
    // Corner A: the point A and the segment a both start there.
    const { sx, sy } = px(0, 0)
    const hits = pickAll(c, sx + 2, sy)
    expect(hits[0].id).toBe('pA')
    expect(hits[0].priority).toBeLessThan(hits[1].priority)
    // 4 px to the right of the crossing: a and c are both within reach of a widened search,
    // and the one the cursor is nearer to comes first.
    const near = pickAll(c, px(2, 3).sx + 4, px(2, 3).sy, undefined, 4)
    expect(near).toHaveLength(2)
    expect(near[0].dist).toBeLessThanOrEqual(near[1].dist)
  })

  it('leaves out what is beyond reach, and widens every reach by the slack', () => {
    const c = ctx()
    const { sx, sy } = px(2, 3)
    // 20 px straight up from the crossing, between the two lines (each at 56° to the
    // horizontal): about 11 px from each, past a line's 8 px reach and inside it with 4 px of slack.
    const far = pickAll(c, sx, sy - 20)
    expect(far).toHaveLength(0)
    expect(pickAll(c, sx, sy - 20, undefined, 4)).toHaveLength(2)
  })

  it('honours the accept filter', () => {
    const c = ctx()
    const { sx, sy } = px(0, 0)
    expect(pickAll(c, sx, sy, (_o, v) => v.type !== 'point').map((h) => h.id)).toEqual(['sAB'])
  })
})

// Tests for G1b:
// 1. Moving an intersection point via a slider more than 30 units from where it was made keeps following the crossing.
// 2. Crossings beyond x = ±100 are found over the curves' whole drawn range.
// 3. Graph-circle intersections are computed accurately and accepted by the Intersect tool and evaluateScene.

import { describe, expect, it } from 'vitest'
import { canIntersect, intersectionsOf } from '../src/renderer/src/math/intersections'
import { evaluateScene } from '../src/renderer/src/core/evaluate'
import { DEFAULT_SETTINGS, useScene } from '../src/renderer/src/core/store'
import type { Computed, GraphObj, NumberObj, SceneObject } from '../src/renderer/src/core/types'
import { acceptsFor, advanceTool, resetTool, useTool } from '../src/renderer/src/render/tools'

const base = (id: string, name: string) => ({ id, name, visible: true, locked: false, color: '#000', showLabel: true })

const graph = (id: string, name: string, expr: string, extra?: Partial<GraphObj>): GraphObj => ({
  ...base(id, name),
  type: 'graph',
  kind: 'explicit',
  source: `y = ${expr}`,
  exprs: [expr],
  showRoots: true,
  showExtrema: true,
  ...extra
})

describe('G1b graph intersection improvements', () => {
  it('keeps following the crossing when a slider moves >30 units from creation point', () => {
    // 1. y = x and y = a, with a = 0 initially
    const slider: NumberObj = {
      ...base('a', 'a'),
      type: 'number',
      expr: '0',
      slider: { min: -100, max: 200, step: 1 }
    }
    const g1 = graph('g1', 'f', 'x')
    const g2 = graph('g2', 'g', 'a')
    // Intersection point created at (0, 0, 0)
    const p0: SceneObject = {
      ...base('p0', 'P0'),
      type: 'point',
      def: { kind: 'intersection', a: 'g1', b: 'g2', index: 0, approx: [0, 0, 0] }
    }

    let all: Record<string, SceneObject> = { a: slider, g1, g2, p0 }
    const order = ['a', 'g1', 'g2', 'p0']
    let ev = evaluateScene(all, order, DEFAULT_SETTINGS, 0)
    expect(ev.errors.size).toBe(0)
    let pVal = ev.values.get('p0')
    expect(pVal?.type).toBe('point')
    if (pVal?.type === 'point') {
      expect(pVal.p[0]).toBeCloseTo(0, 3)
      expect(pVal.p[1]).toBeCloseTo(0, 3)
    }

    // Now slider moves to a = 50 (>30 units away from approx [0,0,0])
    const slider50: NumberObj = { ...slider, expr: '50' }
    all = { a: slider50, g1, g2, p0 }
    ev = evaluateScene(all, order, DEFAULT_SETTINGS, 0)
    expect(ev.errors.has('p0')).toBe(false)
    pVal = ev.values.get('p0')
    expect(pVal?.type).toBe('point')
    if (pVal?.type === 'point') {
      expect(pVal.p[0]).toBeCloseTo(50, 2)
      expect(pVal.p[1]).toBeCloseTo(50, 2)
    }

    // Now slider moves to a = 150 (>100 units away, beyond default [-100, 100])
    const slider150: NumberObj = { ...slider, expr: '150' }
    all = { a: slider150, g1, g2, p0 }
    ev = evaluateScene(all, order, DEFAULT_SETTINGS, 0)
    expect(ev.errors.has('p0')).toBe(false)
    pVal = ev.values.get('p0')
    expect(pVal?.type).toBe('point')
    if (pVal?.type === 'point') {
      expect(pVal.p[0]).toBeCloseTo(150, 2)
      expect(pVal.p[1]).toBeCloseTo(150, 2)
    }
  })

  it('finds crossings beyond x = ±100 without hard-coded limits', () => {
    // Two explicit graphs crossing at x = 200: y = x and y = 200
    const g1 = graph('g1', 'f', 'x')
    const g2 = graph('g2', 'g', '200')
    const c1: Computed = { type: 'graph', graph: g1, f: (x) => x }
    const c2: Computed = { type: 'graph', graph: g2, f: () => 200 }

    const pts = intersectionsOf(c1, c2)
    expect(pts.length).toBeGreaterThanOrEqual(1)
    expect(pts[0][0]).toBeCloseTo(200, 2)
    expect(pts[0][1]).toBeCloseTo(200, 2)

    // Negative crossing at x = -250
    const g3 = graph('g3', 'h', '-250')
    const c3: Computed = { type: 'graph', graph: g3, f: () => -250 }
    const ptsNeg = intersectionsOf(c1, c3)
    expect(ptsNeg.length).toBeGreaterThanOrEqual(1)
    expect(ptsNeg[0][0]).toBeCloseTo(-250, 2)
    expect(ptsNeg[0][1]).toBeCloseTo(-250, 2)
  })

  it('respects curves drawn domain (tMin / tMax) when intersecting', () => {
    // y = x^2 drawn only from x = 0 to x = 5
    const g1 = graph('g1', 'f', 'x^2', { tMin: 0, tMax: 5 })
    const g2 = graph('g2', 'g', '4')
    const c1: Computed = { type: 'graph', graph: g1, f: (x) => x * x }
    const c2: Computed = { type: 'graph', graph: g2, f: () => 4 }

    const pts = intersectionsOf(c1, c2)
    // Only x = 2 should be returned, x = -2 is outside the drawn domain [0, 5]
    expect(pts).toHaveLength(1)
    expect(pts[0][0]).toBeCloseTo(2, 3)
    expect(pts[0][1]).toBeCloseTo(4, 3)
  })

  it('intersects an explicit graph with a circle', () => {
    // Circle at origin with radius 5: x^2 + y^2 = 25
    // Graph y = x: x^2 + x^2 = 25 -> x = ±sqrt(12.5) ≈ ±3.5355
    const circleObj: SceneObject = {
      ...base('c1', 'C1'),
      type: 'circle',
      def: { kind: 'centerRadius', c: 'centerPoint', r: '5' }
    }
    const circleComp: Computed = {
      type: 'circle',
      circle: { c: [0, 0, 0], r: 5 }
    }
    const g1 = graph('g1', 'f', 'x')
    const gComp: Computed = {
      type: 'graph',
      graph: g1,
      f: (x) => x
    }

    expect(canIntersect(circleComp, gComp)).toBe(true)
    expect(canIntersect(gComp, circleComp)).toBe(true)

    const pts = intersectionsOf(gComp, circleComp)
    expect(pts).toHaveLength(2)
    const expectedX = Math.sqrt(12.5)
    expect(pts[0][0]).toBeCloseTo(-expectedX, 3)
    expect(pts[0][1]).toBeCloseTo(-expectedX, 3)
    expect(pts[1][0]).toBeCloseTo(expectedX, 3)
    expect(pts[1][1]).toBeCloseTo(expectedX, 3)

    // Evaluate in evaluateScene
    const centerPoint: SceneObject = { ...base('centerPoint', 'O'), type: 'point', def: { kind: 'free', p: [0, 0, 0] } }
    const p0: SceneObject = { ...base('p0', 'P0'), type: 'point', def: { kind: 'intersection', a: 'c1', b: 'g1', index: 0 } }
    const p1: SceneObject = { ...base('p1', 'P1'), type: 'point', def: { kind: 'intersection', a: 'c1', b: 'g1', index: 1 } }

    const all = { centerPoint, c1: circleObj, g1, p0, p1 }
    const ev = evaluateScene(all, ['centerPoint', 'c1', 'g1', 'p0', 'p1'], DEFAULT_SETTINGS, 0)
    expect(ev.errors.size).toBe(0)
    const v0 = ev.values.get('p0')
    const v1 = ev.values.get('p1')
    expect(v0?.type).toBe('point')
    expect(v1?.type).toBe('point')
    if (v0?.type === 'point' && v1?.type === 'point') {
      expect(v0.p[0]).toBeCloseTo(-expectedX, 3)
      expect(v1.p[0]).toBeCloseTo(expectedX, 3)
    }
  })

  it('allows the Intersect tool to intersect a circle and a graph', () => {
    const centerPoint: SceneObject = { ...base('centerPoint', 'O'), type: 'point', def: { kind: 'free', p: [0, 0, 0] } }
    const circleObj: SceneObject = {
      ...base('c1', 'C1'),
      type: 'circle',
      def: { kind: 'centerRadius', c: 'centerPoint', r: '5' }
    }
    const circleComp: Computed = {
      type: 'circle',
      circle: { c: [0, 0, 0], r: 5 }
    }
    const g1 = graph('g1', 'f', 'x')
    const gComp: Computed = {
      type: 'graph',
      graph: g1,
      f: (x) => x
    }

    useScene.setState({
      objects: { centerPoint, c1: circleObj, g1 },
      order: ['centerPoint', 'c1', 'g1'],
      ev: {
        values: new Map<string, Computed>([
          ['centerPoint', { type: 'point', p: [0, 0, 0] }],
          ['c1', circleComp],
          ['g1', gComp]
        ]),
        errors: new Map(),
        scope: {},
        names: new Map()
      }
    })
    resetTool()

    expect(acceptsFor('intersect', [])(circleObj, circleComp)).toBe(true)
    expect(acceptsFor('intersect', ['c1'])(g1, gComp)).toBe(true)

    const done = advanceTool('intersect', ['c1', 'g1'])
    expect(done).toBe(true)

    const createdPoints = Object.values(useScene.getState().objects).filter((o) => o.type === 'point' && o.id !== 'centerPoint')
    expect(createdPoints.length).toBe(2)
  })

  it('snaps to integer only when both curves still agree there, keeping refined root otherwise', () => {
    // 1. y = x^2 and y = 4.0000001 (DeepSeek review case 1.1)
    // True root is ±2.000000025. It is within 1e-7 of 2, but f(2)=4 != g(2)=4.0000001.
    // Must NOT snap to 2 (which gives y = 4.00000005, lying on neither curve).
    const c1: Computed = { type: 'graph', f: (x) => x * x }
    const c2: Computed = { type: 'graph', f: () => 4.0000001 }
    const pts = intersectionsOf(c1, c2, { xMin: -5, xMax: 5 })
    expect(pts).toHaveLength(2)
    // x must NOT be exactly 2
    expect(pts[1][0]).not.toBe(2)
    expect(pts[1][0]).toBeCloseTo(2.000000025, 7)
    // y must match g(x) = 4.0000001, not 4.00000005
    expect(pts[1][1]).toBeCloseTo(4.0000001, 6)

    // 2. y = x^2 and y = 4: true integer root where both curves agree f(2) = g(2) = 4
    const c3: Computed = { type: 'graph', f: () => 4 }
    const ptsExact = intersectionsOf(c1, c3, { xMin: -5, xMax: 5 })
    expect(ptsExact).toHaveLength(2)
    expect(ptsExact[0][0]).toBe(-2)
    expect(ptsExact[0][1]).toBe(4)
    expect(ptsExact[1][0]).toBe(2)
    expect(ptsExact[1][1]).toBe(4)
  })

  it('reports "they are the same curve" when intersecting identical curves', () => {
    const g1 = graph('g1', 'f', 'x')
    const g2 = graph('g2', 'g', 'x')
    const p0: SceneObject = {
      ...base('p0', 'P0'),
      type: 'point',
      def: { kind: 'intersection', a: 'g1', b: 'g2', index: 0 }
    }
    const all = { g1, g2, p0 }
    const ev = evaluateScene(all, ['g1', 'g2', 'p0'], DEFAULT_SETTINGS, 0)
    expect(ev.errors.get('p0')).toBe('they are the same curve')

    // Intersect tool also notifies "they are the same curve"
    const c1: Computed = { type: 'graph', graph: g1, f: (x) => x }
    const c2: Computed = { type: 'graph', graph: g2, f: (x) => x }
    useScene.setState({
      objects: { g1, g2 },
      order: ['g1', 'g2'],
      ev: {
        values: new Map<string, Computed>([
          ['g1', c1],
          ['g2', c2]
        ]),
        errors: new Map(),
        scope: {},
        names: new Map()
      }
    })
    resetTool()

    advanceTool('intersect', ['g1', 'g2'])
    expect(useScene.getState().objects['p0']).toBeUndefined()
    expect(useTool.getState().notice).toBe('they are the same curve')
  })
})


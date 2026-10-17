// Curve-to-curve intersections in 2-D Graphing:
// - Two visible curves f(x) and g(x) find their pairwise crossings, marked with key points and labels.
// - The Intersect tool accepts graph curves and places intersection points.
// - Snapping and evaluateScene compute the intersection points in a deterministic order.

import { describe, expect, it } from 'vitest'
import { canIntersect, intersectionsOf } from '../src/renderer/src/math/intersections'
import { evaluateScene } from '../src/renderer/src/core/evaluate'
import { DEFAULT_SETTINGS, useScene } from '../src/renderer/src/core/store'
import type { Computed, GraphObj, SceneObject } from '../src/renderer/src/core/types'
import { acceptsFor, advanceTool, resetTool } from '../src/renderer/src/render/tools'
import { curveIntersections, keyPointLabel } from '../src/renderer/src/math/graphs'

const base = (id: string, name: string) => ({ id, name, visible: true, locked: false, color: '#000', showLabel: true })

const graph = (id: string, name: string, expr: string): GraphObj => ({
  ...base(id, name),
  type: 'graph',
  kind: 'explicit',
  source: `y = ${expr}`,
  exprs: [expr],
  showRoots: true,
  showExtrema: true
})

describe('graph curve intersections (G1)', () => {
  it('says graphs can be intersected', () => {
    const g1: Computed = { type: 'graph', f: (x: number) => x * x }
    const g2: Computed = { type: 'graph', f: () => 4 }
    expect(canIntersect(g1, g2)).toBe(true)
    expect(canIntersect(g1, { type: 'line', line: { kind: 'line', p: [0, 4, 0], d: [1, 0, 0] } })).toBe(true)
  })

  it('finds where y = x^2 and y = 4 intersect', () => {
    const g1: Computed = { type: 'graph', f: (x: number) => x * x }
    const g2: Computed = { type: 'graph', f: () => 4 }
    const pts = intersectionsOf(g1, g2, { xMin: -10, xMax: 10 })
    expect(pts).toHaveLength(2)
    expect(pts[0][0]).toBeCloseTo(-2, 4)
    expect(pts[0][1]).toBeCloseTo(4, 4)
    expect(pts[1][0]).toBeCloseTo(2, 4)
    expect(pts[1][1]).toBeCloseTo(4, 4)
  })

  it('finds where y = sin(x) and y = cos(x) intersect', () => {
    const g1: Computed = { type: 'graph', f: (x: number) => Math.sin(x) }
    const g2: Computed = { type: 'graph', f: (x: number) => Math.cos(x) }
    const pts = intersectionsOf(g1, g2, { xMin: -4, xMax: 4 })
    // In [-4, 4], sin(x) = cos(x) at -3pi/4 (~-2.3562) and pi/4 (~0.7854)
    expect(pts.length).toBeGreaterThanOrEqual(2)
    const xs = pts.map((p) => p[0])
    expect(xs.some((x) => Math.abs(x - (-3 * Math.PI) / 4) < 1e-3)).toBe(true)
    expect(xs.some((x) => Math.abs(x - Math.PI / 4) < 1e-3)).toBe(true)
  })

  it('evaluates intersection points between two graphs in evaluateScene', () => {
    const g1 = graph('g1', 'f', 'x^2')
    const g2 = graph('g2', 'g', '4')
    const p0: SceneObject = { ...base('p0', 'P0'), type: 'point', def: { kind: 'intersection', a: 'g1', b: 'g2', index: 0 } }
    const p1: SceneObject = { ...base('p1', 'P1'), type: 'point', def: { kind: 'intersection', a: 'g1', b: 'g2', index: 1 } }
    const all = { g1, g2, p0, p1 }
    const ev = evaluateScene(all, ['g1', 'g2', 'p0', 'p1'], DEFAULT_SETTINGS, 0)
    expect(ev.errors.size).toBe(0)
    const val0 = ev.values.get('p0')
    const val1 = ev.values.get('p1')
    expect(val0?.type).toBe('point')
    expect(val1?.type).toBe('point')
    if (val0?.type === 'point' && val1?.type === 'point') {
      expect(val0.p[0]).toBeCloseTo(-2, 3)
      expect(val0.p[1]).toBeCloseTo(4, 3)
      expect(val1.p[0]).toBeCloseTo(2, 3)
      expect(val1.p[1]).toBeCloseTo(4, 3)
    }
  })

  it('allows the Intersect tool to accept graphs and creates intersection points', () => {
    const g1 = graph('g1', 'f', 'x^2')
    const g2 = graph('g2', 'g', '4')
    const c1: Computed = { type: 'graph', graph: g1, f: (x) => x * x }
    const c2: Computed = { type: 'graph', graph: g2, f: () => 4 }

    // acceptsFor must return true for a graph
    const accepts = acceptsFor('intersect', [])
    expect(accepts(g1, c1)).toBe(true)

    // Set up scene and useTool
    useScene.setState({
      objects: { g1, g2 },
      order: ['g1', 'g2'],
      ev: { values: new Map([['g1', c1], ['g2', c2]]), errors: new Map(), scope: {}, names: new Map() }
    })
    resetTool()

    const done = advanceTool('intersect', ['g1', 'g2'])
    expect(done).toBe(true)

    // Two intersection points should have been created in the scene
    const createdPoints = Object.values(useScene.getState().objects).filter((o) => o.type === 'point')
    expect(createdPoints.length).toBe(2)
  })

  it('computes curveIntersections between two functions with key points and labels', () => {
    const f = (x: number) => x * x
    const g = (_x: number) => 4
    const keys = curveIntersections(f, g, -10, 10)
    expect(keys).toHaveLength(2)
    expect(keys[0].x).toBeCloseTo(-2, 3)
    expect(keys[0].y).toBeCloseTo(4, 3)
    expect(keys[0].kind).toBe('intersection')
    const label0 = keyPointLabel(keys[0], { decimals: 2, precisionMode: 'dp' })
    expect(label0).toContain('intersection')
    expect(label0).toContain('−2')
    expect(label0).toContain('4')
  })

  it('does not emit an intersection at a removable hole where a curve is undefined', () => {
    // sin(x)/x is undefined at x = 0 (0/0)
    const f = (x: number) => (x === 0 ? NaN : Math.sin(x) / x)
    const g = (_x: number) => 1
    const keys = curveIntersections(f, g, -5, 5)
    // There must be no intersection keypoint at x = 0
    expect(keys.some((k) => Math.abs(k.x) < 1e-4)).toBe(false)
  })

  it('evaluates intersections outside [-20, 20] using approx location', () => {
    const g1 = graph('g1', 'f', 'x')
    const g2 = graph('g2', 'g', '50')
    const p0: SceneObject = {
      ...base('p0', 'P0'),
      type: 'point',
      def: { kind: 'intersection', a: 'g1', b: 'g2', index: 0, approx: [50, 50, 0] }
    }
    const all = { g1, g2, p0 }
    const ev = evaluateScene(all, ['g1', 'g2', 'p0'], DEFAULT_SETTINGS, 0)
    expect(ev.errors.size).toBe(0)
    const val0 = ev.values.get('p0')
    expect(val0?.type).toBe('point')
    if (val0?.type === 'point') {
      expect(val0.p[0]).toBeCloseTo(50, 2)
      expect(val0.p[1]).toBeCloseTo(50, 2)
    }
  })

  it('keeps the clicked crossing in a high-x sub-window with many crossings', () => {
    // sin(x) = 0 at k*pi. Near x = 100, 32*pi ~ 100.531
    const targetX = 32 * Math.PI
    const g1 = graph('g1', 'f', 'sin(x)')
    const g2 = graph('g2', 'g', '0')
    const p0: SceneObject = {
      ...base('p0', 'P0'),
      type: 'point',
      def: { kind: 'intersection', a: 'g1', b: 'g2', index: 0, approx: [targetX, 0, 0] }
    }
    const all = { g1, g2, p0 }
    const ev = evaluateScene(all, ['g1', 'g2', 'p0'], DEFAULT_SETTINGS, 0)
    expect(ev.errors.size).toBe(0)
    const val0 = ev.values.get('p0')
    expect(val0?.type).toBe('point')
    if (val0?.type === 'point') {
      expect(val0.p[0]).toBeCloseTo(targetX, 2)
      expect(val0.p[1]).toBeCloseTo(0, 2)
    }
  })
})

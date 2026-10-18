// Tests for G1c:
// (a) Line/graph and graph/graph intersections far out (e.g. x = 5000 or x = 10000) using stored approx seed.
// (b) Sub-domain curves with the same formula on different x-ranges meeting at shared endpoints (e.g. y = x on [0, 1] and [1, 2]).

import { describe, expect, it } from 'vitest'
import { intersectionsOf, isSameCurve } from '../src/renderer/src/math/intersections'
import { evaluateScene } from '../src/renderer/src/core/evaluate'
import { DEFAULT_SETTINGS } from '../src/renderer/src/core/store'
import type { GraphObj, LineObj, PointObj, SceneObject } from '../src/renderer/src/core/types'

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

describe('G1c graph intersection fixes', () => {
  it('evaluates line-graph intersection far out (x = 5000) using approx seed', () => {
    // Line y = 0 through (0,0) and (1,0)
    const pA: PointObj = { ...base('pa', 'A'), type: 'point', def: { kind: 'free', p: [0, 0, 0] } }
    const pB: PointObj = { ...base('pb', 'B'), type: 'point', def: { kind: 'free', p: [1, 0, 0] } }
    const lineObj: LineObj = { ...base('l1', 'l'), type: 'line', def: { kind: 'twoPoints', a: 'pa', b: 'pb' } }

    // Graph y = x - 5000
    const g1 = graph('g1', 'f', 'x - 5000')

    // Intersection point created at x = 5000 with approx [5000, 0, 0]
    const pCross: SceneObject = {
      ...base('pCross', 'P'),
      type: 'point',
      def: { kind: 'intersection', a: 'l1', b: 'g1', index: 0, approx: [5000, 0, 0] }
    }

    const all: Record<string, SceneObject> = { pa: pA, pb: pB, l1: lineObj, g1, pCross }
    const order = ['pa', 'pb', 'l1', 'g1', 'pCross']

    const ev = evaluateScene(all, order, DEFAULT_SETTINGS, 0)
    expect(ev.errors.has('pCross')).toBe(false)
    const pVal = ev.values.get('pCross')
    expect(pVal?.type).toBe('point')
    if (pVal?.type === 'point') {
      expect(pVal.p[0]).toBeCloseTo(5000, 2)
      expect(pVal.p[1]).toBeCloseTo(0, 2)
    }

    // Direct intersectionsOf check with approx
    const compLine = ev.values.get('l1')!
    const compGraph = ev.values.get('g1')!
    const pts = intersectionsOf(compLine, compGraph, { approx: [5000, 0, 0] })
    expect(pts.length).toBe(1)
    expect(pts[0][0]).toBeCloseTo(5000, 2)
  })

  it('evaluates two curves with same formula on adjacent domains meeting at endpoint', () => {
    // y = x on [0, 1] and y = x on [1, 2]
    const g1 = graph('g1', 'f1', 'x', { tMin: 0, tMax: 1 })
    const g2 = graph('g2', 'f2', 'x', { tMin: 1, tMax: 2 })

    // Intersection point at (1, 1, 0)
    const pShared: SceneObject = {
      ...base('pShared', 'P'),
      type: 'point',
      def: { kind: 'intersection', a: 'g1', b: 'g2', index: 0, approx: [1, 1, 0] }
    }

    const all: Record<string, SceneObject> = { g1, g2, pShared }
    const order = ['g1', 'g2', 'pShared']

    const ev = evaluateScene(all, order, DEFAULT_SETTINGS, 0)
    expect(ev.errors.has('pShared')).toBe(false)
    const pVal = ev.values.get('pShared')
    expect(pVal?.type).toBe('point')
    if (pVal?.type === 'point') {
      expect(pVal.p[0]).toBeCloseTo(1, 4)
      expect(pVal.p[1]).toBeCloseTo(1, 4)
    }

    const c1 = ev.values.get('g1')!
    const c2 = ev.values.get('g2')!
    expect(isSameCurve('g1', 'g2', c1, c2)).toBe(false)
    const pts = intersectionsOf(c1, c2)
    expect(pts.length).toBe(1)
    expect(pts[0][0]).toBeCloseTo(1, 4)
  })

  it('flags two curves with same formula and identical domains as the same curve', () => {
    const g1 = graph('g1', 'f1', 'x', { tMin: 0, tMax: 1 })
    const g2 = graph('g2', 'f2', 'x', { tMin: 0, tMax: 1 })

    const pSame: SceneObject = {
      ...base('pSame', 'P'),
      type: 'point',
      def: { kind: 'intersection', a: 'g1', b: 'g2', index: 0, approx: [0.5, 0.5, 0] }
    }

    const all: Record<string, SceneObject> = { g1, g2, pSame }
    const order = ['g1', 'g2', 'pSame']

    const ev = evaluateScene(all, order, DEFAULT_SETTINGS, 0)
    expect(ev.errors.get('pSame')).toBe('they are the same curve')
  })

  it('flags two curves with same formula and overlapping interval as the same curve', () => {
    const g1 = graph('g1', 'f1', 'x', { tMin: 0, tMax: 2 })
    const g2 = graph('g2', 'f2', 'x', { tMin: 1, tMax: 3 })

    const pOverlap: SceneObject = {
      ...base('pOverlap', 'P'),
      type: 'point',
      def: { kind: 'intersection', a: 'g1', b: 'g2', index: 0, approx: [1.5, 1.5, 0] }
    }

    const all: Record<string, SceneObject> = { g1, g2, pOverlap }
    const order = ['g1', 'g2', 'pOverlap']

    const ev = evaluateScene(all, order, DEFAULT_SETTINGS, 0)
    expect(ev.errors.get('pOverlap')).toBe('they are the same curve')
  })

  it('flags two curves with microscopic positive overlap interval as the same curve', () => {
    // y = x on [0, 1] and y = x on [0.9999999999, 2] overlap on [0.9999999999, 1]
    const g1 = graph('g1', 'f1', 'x', { tMin: 0, tMax: 1 })
    const g2 = graph('g2', 'f2', 'x', { tMin: 0.9999999999, tMax: 2 })

    const pMicro: SceneObject = {
      ...base('pMicro', 'P'),
      type: 'point',
      def: { kind: 'intersection', a: 'g1', b: 'g2', index: 0, approx: [1, 1, 0] }
    }

    const all: Record<string, SceneObject> = { g1, g2, pMicro }
    const order = ['g1', 'g2', 'pMicro']

    const ev = evaluateScene(all, order, DEFAULT_SETTINGS, 0)
    expect(ev.errors.get('pMicro')).toBe('they are the same curve')
  })

  it('evaluates line-graph and graph-graph intersections far out beyond ±10000 fallback (x = 25000) strictly requiring approx seed', () => {
    // Line y = 0
    const pA: PointObj = { ...base('pa', 'A'), type: 'point', def: { kind: 'free', p: [0, 0, 0] } }
    const pB: PointObj = { ...base('pb', 'B'), type: 'point', def: { kind: 'free', p: [1, 0, 0] } }
    const lineObj: LineObj = { ...base('l1', 'l'), type: 'line', def: { kind: 'twoPoints', a: 'pa', b: 'pb' } }

    // Graph y = x - 25000
    const g1 = graph('g1', 'f1', 'x - 25000')

    const pFarLine: SceneObject = {
      ...base('pFarLine', 'PLine'),
      type: 'point',
      def: { kind: 'intersection', a: 'l1', b: 'g1', index: 0, approx: [25000, 0, 0] }
    }

    // Graph y = 2x - 50000 and y = x meeting at x = 50000
    const g2 = graph('g2', 'f2', '2 * x - 50000')
    const g3 = graph('g3', 'f3', 'x')
    const pFarGraph: SceneObject = {
      ...base('pFarGraph', 'PGraph'),
      type: 'point',
      def: { kind: 'intersection', a: 'g2', b: 'g3', index: 0, approx: [50000, 50000, 0] }
    }

    const all: Record<string, SceneObject> = { pa: pA, pb: pB, l1: lineObj, g1, pFarLine, g2, g3, pFarGraph }
    const order = ['pa', 'pb', 'l1', 'g1', 'pFarLine', 'g2', 'g3', 'pFarGraph']

    const ev = evaluateScene(all, order, DEFAULT_SETTINGS, 0)
    expect(ev.errors.has('pFarLine')).toBe(false)
    expect(ev.errors.has('pFarGraph')).toBe(false)

    const vLine = ev.values.get('pFarLine')
    if (vLine?.type === 'point') {
      expect(vLine.p[0]).toBeCloseTo(25000, 1)
      expect(vLine.p[1]).toBeCloseTo(0, 1)
    }

    const vGraph = ev.values.get('pFarGraph')
    if (vGraph?.type === 'point') {
      expect(vGraph.p[0]).toBeCloseTo(50000, 1)
      expect(vGraph.p[1]).toBeCloseTo(50000, 1)
    }

    // Proves that approx was necessary: without approx, search window fails to reach 25000 or 50000
    const compLine = ev.values.get('l1')!
    const compG1 = ev.values.get('g1')!
    const compG2 = ev.values.get('g2')!
    const compG3 = ev.values.get('g3')!
    expect(intersectionsOf(compLine, compG1, undefined)).toEqual([])
    expect(intersectionsOf(compG2, compG3, undefined)).toEqual([])
  })
})

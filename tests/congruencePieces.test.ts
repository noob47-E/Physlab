// Fix 19: congruence with the pieces Break apart and Decompose make. The owner's words: "There
// was no congruence working with those decomposed shapes at all." Two causes: the Measure panel
// left every Lego piece out of the triangle comparison (its corners were hidden helpers named
// poly2_1 until Fix 17 lettered them), and the parts of a decomposed shape — drawn, never objects
// — were never compared at all.

import { beforeEach, describe, expect, it } from 'vitest'
import { useScene } from '../src/renderer/src/core/store'
import type { PolygonObj, SceneObject } from '../src/renderer/src/core/types'
import type { V3 } from '../src/renderer/src/math/vec'
import { comparePolygons, compareTriangles, congruentParts, trianglesToCompare, type Tri } from '../src/renderer/src/math/congruence'
import { decompose } from '../src/renderer/src/math/decompose'
import { readSource } from './helpers/repo'

const sc = () => useScene.getState()
const base = (id: string, name: string, color = '#9775fa') => ({ id, name, visible: true, locked: false, color, showLabel: true, space: 'shapes' as const })

/** The owner's 3 × 2 rectangle DCBA, drawn with the Polygon tool. */
function rectangle(): SceneObject[] {
  const P: V3[] = [
    [3, 0, 0],
    [3, 2, 0],
    [0, 2, 0],
    [0, 0, 0]
  ]
  const ids = ['pD', 'pC', 'pB', 'pA']
  return [
    ...P.map((p, k): SceneObject => ({ ...base(ids[k], 'DCBA'[k], '#e7f5ff'), type: 'point', def: { kind: 'free', p } })),
    { ...base('rect', 'poly1'), type: 'polygon', points: ids, fill: true },
    ...ids.map((a, k): SceneObject => ({ ...base(`s${k}`, `s${k}`), type: 'segment', a, b: ids[(k + 1) % 4] }))
  ]
}

const triOf = (o: PolygonObj): Tri => {
  const c = sc().ev.values.get(o.id)
  return { names: o.points.map((p) => sc().objects[p].name) as Tri['names'], pts: (c?.type === 'polygon' ? c.pts : []) as Tri['pts'] }
}

describe('the two halves of a rectangle cut along its diagonal (Fix 19)', () => {
  beforeEach(() => sc().newScene())

  it('are picked for the congruence card and reported congruent by SSS, corner matched to corner', () => {
    sc().addObjects(rectangle())
    sc().breakApart('rect')
    const sel = sc().selection.map((id) => sc().objects[id])
    const tris = trianglesToCompare(sel, (id) => sc().ev.values.get(id)?.type === 'polygon') as PolygonObj[]
    expect(tris.length).toBe(2)
    expect(tris.every((t) => !!t.lego)).toBe(true)
    const [A, B] = tris.map(triOf)
    const r = compareTriangles(A, B, { fmtLength: (v) => v.toFixed(2), fmtAngle: (v) => `${((v * 180) / Math.PI).toFixed(0)}°` })
    expect(r.congruent).toBe(true)
    expect(r.test).toBe('SSS')
    // Sides 3, 2 and √13 ≈ 3.61 in both, matched in that order.
    expect(r.sides.map((p) => p.valueA.toFixed(2)).sort()).toEqual(['2.00', '3.00', '3.61'])
    for (const p of r.sides) expect(p.valueA).toBeCloseTo(p.valueB, 9)
    // The right angle of one lies on the right angle of the other.
    const right = r.angles.find((p) => Math.abs(p.valueA - Math.PI / 2) < 1e-9)!
    expect(right.valueB).toBeCloseTo(Math.PI / 2, 9)
    expect(r.reasons.at(-1)).toBe(`So △${A.names.join('')} ≅ △${r.matchedName} by SSS (three sides).`)
    // Letters, never helper names like poly2_1.
    expect(r.reasons.join(' ')).not.toMatch(/poly|_/)
  })

  it('the Measure panel asks trianglesToCompare, which keeps Lego pieces', () => {
    const src = readSource('src/renderer/src/panels/Measurements.tsx')
    expect(src).toMatch(/const triangles = trianglesToCompare\(\s*sel,\s*\(id\) => ev\.values\.get\(id\)\?\.type === 'polygon',\s*\(o\) => namedByLetters\(o, objects\)\s*\)/)
    expect(src).not.toMatch(/!o\.lego && o\.points\.length === 3/)
    const objs = [
      { id: 'a', type: 'polygon', points: ['1', '2', '3'], lego: {} },
      { id: 'b', type: 'polygon', points: ['4', '5', '6'] },
      { id: 'c', type: 'polygon', points: ['1', '2', '3', '4'] },
      { id: 'd', type: 'segment' }
    ]
    expect(trianglesToCompare(objs, () => true).map((o) => o.id)).toEqual(['a', 'b'])
    expect(trianglesToCompare(objs, (id) => id !== 'a').map((o) => o.id)).toEqual(['b'])
  })
})

describe('the parts of a decomposed shape (Fix 19)', () => {
  it('an isosceles trapezium: the two end triangles are congruent, by name and rule', () => {
    const trap: V3[] = [
      [0, 0, 0],
      [6, 0, 0],
      [5, 2, 0],
      [1, 2, 0]
    ]
    const dec = decompose(trap, 'basic', 0)
    const letters = 'ABCD'
    const extra = 'EF'
    const nameAt = (p: V3): string => {
      const k = trap.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-7)
      if (k >= 0) return letters[k]
      const n = dec.newPoints.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-7)
      return extra[n]
    }
    const parts = dec.parts.map((part) => ({ names: part.pts.map(nameAt), pts: part.pts }))
    const tris = parts.map((p, i) => ({ ...p, i })).filter((p) => p.pts.length === 3)
    expect(tris.length).toBe(2)
    const pairs = congruentParts(parts)
    expect(pairs.length).toBe(1)
    expect([pairs[0].i, pairs[0].j]).toEqual(tris.map((t) => t.i))
    expect(pairs[0].test).toBe('SSS')
    expect(pairs[0].sentence).toMatch(/^So △[A-F]{3} ≅ △[A-F]{3} by SSS \(three sides\)\.$/)
  })

  it('an L cut into two different rectangles has no congruent pair', () => {
    const ell: V3[] = [
      [0, 0, 0],
      [4, 0, 0],
      [4, 2, 0],
      [2, 2, 0],
      [2, 4, 0],
      [0, 4, 0]
    ]
    const dec = decompose(ell, 'basic', 0)
    expect(dec.parts.length).toBe(2)
    expect(congruentParts(dec.parts.map((p) => ({ names: p.pts.map((_, k) => 'PQRS'[k]), pts: p.pts })))).toEqual([])
  })

  it('the Measure card lists the congruent parts under the parts', () => {
    const src = readSource('src/renderer/src/panels/ShapeInfo.tsx')
    expect(src).toMatch(/congruentParts\(\s*dec\.parts\.map\(\(part\) => \(\{ names: part\.pts\.map\(nameAt\), pts: part\.pts \}\)\)/)
    expect(src).toMatch(/\{ROMAN\[pair\.i\]\} and \{ROMAN\[pair\.j\]\} are congruent\./)
  })
})

describe('comparePolygons', () => {
  const R = (names: string, pts: number[]): { names: string[]; pts: V3[] } => {
    const out: V3[] = []
    for (let i = 0; i < pts.length; i += 2) out.push([pts[i], pts[i + 1], 0])
    return { names: names.split(''), pts: out }
  }

  it('lays a 4 × 2 rectangle on a turned copy and matches the corners', () => {
    const B = R('PQRS', [10, 0, 10, 4, 8, 4, 8, 0])
    const r = comparePolygons(R('ABCD', [0, 0, 4, 0, 4, 2, 0, 2]), B)
    expect(r.congruent).toBe(true)
    expect(r.matchedName).toHaveLength(4)
    expect(r.reason).toBe(`So ABCD ≅ ${r.matchedName}: every side and every angle matches, in that order.`)
    // AB is 4 long, so the first two matched corners are 4 apart.
    const at = (n: string) => B.pts[B.names.indexOf(n)]
    const [m0, m1] = r.matchedName.split('')
    expect(Math.hypot(at(m0)[0] - at(m1)[0], at(m0)[1] - at(m1)[1])).toBeCloseTo(4, 9)
  })

  it('says no for a square against a rhombus with the same sides, and for different corner counts', () => {
    const sq = R('ABCD', [0, 0, 2, 0, 2, 2, 0, 2])
    const rh = R('PQRS', [0, 0, 2, 0, 3, Math.sqrt(3), 1, Math.sqrt(3)])
    expect(comparePolygons(sq, rh).congruent).toBe(false)
    expect(comparePolygons(sq, R('XYZ', [0, 0, 1, 0, 0, 1])).congruent).toBe(false)
  })
})

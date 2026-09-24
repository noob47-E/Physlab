// Fix 17: Break apart and Fuse leave one drawing of each shape on the canvas, each with its own
// letters. The owner drew a rectangle with the Segment tool — four sides, one after another —
// which `closeLoopIfAny` recognised as a polygon *after* the sides existed. Break apart removed
// that polygon and nothing else: the four segments and the corners A, B, C, D stayed on the
// canvas as an empty frame around the pieces, and the pieces had no letters at all.

import { beforeEach, describe, expect, it } from 'vitest'
import { useScene, sidesOf } from '../src/renderer/src/core/store'
import type { PolygonObj, SceneObject } from '../src/renderer/src/core/types'
import type { V3 } from '../src/renderer/src/math/vec'
import { displayName } from '../src/renderer/src/render/Labels'
import { fuseChoice, fusePlan, GAP_SENTENCE, namedByLetters, ONE_PIECE_SENTENCE, pieceLettered, signatureOf } from '../src/renderer/src/math/lego'
import { trianglesToCompare } from '../src/renderer/src/math/congruence'
import { readSource } from './helpers/repo'

const sc = () => useScene.getState()
const base = (id: string, name: string, color = '#9775fa') => ({ id, name, visible: true, locked: false, color, showLabel: true, space: 'shapes' as const })
const pointObj = (id: string, name: string, p: V3): SceneObject => ({ ...base(id, name, '#e7f5ff'), type: 'point', def: { kind: 'free', p } })
const pieces = () => sc().order.map((id) => sc().objects[id]).filter((o): o is PolygonObj => o.type === 'polygon' && !!o.lego)
const polygons = () => sc().order.map((id) => sc().objects[id]).filter((o): o is PolygonObj => o.type === 'polygon')
const cornersOf = (id: string): V3[] => {
  const c = sc().ev.values.get(id)
  return c?.type === 'polygon' ? c.pts : []
}

/**
 * The owner's rectangle: drawn A → B → C → D → A with the Segment tool, so the student's four
 * segments come first and the recognised polygon after them, its corners in the order the loop
 * was found (D, C, B, A — "Rectangle DCBA" in the owner's screenshot) and no sides of its own.
 */
function segmentRectangle(): SceneObject[] {
  const P: V3[] = [
    [0, 2, 0],
    [3, 2, 0],
    [3, 0, 0],
    [0, 0, 0]
  ]
  const ids = ['A', 'B', 'C', 'D'].map((n) => `pt${n}`)
  const out: SceneObject[] = P.map((p, i) => pointObj(ids[i], 'ABCD'[i], p))
  ids.forEach((a, i) => out.push({ ...base(`seg${i}`, 'abcd'[i], '#ced4da'), type: 'segment', a, b: ids[(i + 1) % 4] }))
  out.push({ ...base('rect', 'poly1'), type: 'polygon', points: ['ptD', 'ptC', 'ptB', 'ptA'], fill: true, decomposed: true })
  return out
}

describe('Break apart on a shape recognised from the student’s own segments', () => {
  beforeEach(() => sc().newScene())

  it('takes the old frame and its letters away, not only the polygon', () => {
    sc().addObjects(segmentRectangle())
    expect(sidesOf(sc().objects.rect as PolygonObj, sc().objects, sc().order)).toEqual([])
    sc().breakApart('rect')
    expect(pieces().length).toBe(2)
    for (const id of ['rect', 'seg0', 'seg1', 'seg2', 'seg3', 'ptA', 'ptB', 'ptC', 'ptD']) expect(sc().objects[id]).toBeUndefined()
    // Undo brings the whole frame back in one step.
    sc().undo()
    for (const id of ['rect', 'seg0', 'seg1', 'seg2', 'seg3', 'ptA', 'ptB', 'ptC', 'ptD']) expect(sc().objects[id]).toBeDefined()
    expect(pieces()).toEqual([])
  })

  it('keeps a side something else is built on, and the corners that side needs', () => {
    sc().addObjects(segmentRectangle())
    // A point the student slid onto side AB, and a diagonal of their own from A to C.
    sc().addObjects([{ ...base('on', 'M', '#e7f5ff'), type: 'point', def: { kind: 'onObject', on: 'seg0', t: 0.5 } }, { ...base('own', 'q', '#ced4da'), type: 'segment', a: 'ptA', b: 'ptC' }])
    sc().breakApart('rect')
    expect(sc().objects.own).toBeDefined()
    expect(sc().objects.on).toBeDefined()
    expect(sc().objects.seg0).toBeDefined()
    expect(sc().objects.ptA).toBeDefined()
    expect(sc().objects.ptB).toBeDefined()
    expect(sc().objects.ptC).toBeDefined()
    // The sides nobody built on go, and D, which only they used.
    expect(sc().objects.seg1).toBeUndefined()
    expect(sc().objects.seg2).toBeUndefined()
    expect(sc().objects.ptD).toBeUndefined()
  })

  it('leaves a neighbouring shape’s side alone, even where it runs between two of this shape’s corners', () => {
    sc().addObjects(segmentRectangle())
    // A triangle drawn with the Triangle tool on corners A and B, with its own side AB.
    sc().addObjects([
      pointObj('ptE', 'E', [1.5, 4, 0]),
      { ...base('tri', 'poly2'), type: 'polygon', points: ['ptA', 'ptB', 'ptE'], fill: true },
      { ...base('t0', 'e'), type: 'segment', a: 'ptA', b: 'ptB' },
      { ...base('t1', 'f'), type: 'segment', a: 'ptB', b: 'ptE' },
      { ...base('t2', 'g'), type: 'segment', a: 'ptE', b: 'ptA' }
    ])
    sc().breakApart('rect')
    expect(sc().objects.tri).toBeDefined()
    for (const id of ['t0', 't1', 't2', 'ptA', 'ptB', 'ptE']) expect(sc().objects[id]).toBeDefined()
    expect(sc().objects.seg0).toBeUndefined()
  })
})

describe('the pieces of a broken shape', () => {
  beforeEach(() => sc().newScene())

  it('each carry letters of their own, new ones, and a frame of named sides, and still move only as one', () => {
    sc().addObjects(segmentRectangle())
    sc().breakApart('rect')
    // The Console names the shape by what it is and its letters, never "poly1".
    expect(sc().log.at(-1)?.text).toBe('Rectangle DCBA is now 2 pieces. Slide, turn and flip them; put back together, they fuse on their own.')
    const ps = pieces()
    const letters = ps.map((p) => p.points.map((pid) => sc().objects[pid].name))
    // New letters, never the old A–D and never a helper name like poly2_1.
    expect(letters.flat().every((n) => /^[A-Z][′″]*$/.test(n))).toBe(true)
    expect(letters.flat().some((n) => 'ABCD'.includes(n))).toBe(false)
    expect(new Set(letters.flat()).size).toBe(6)
    for (const p of ps) {
      for (const pid of p.points) expect(sc().objects[pid]).toMatchObject({ type: 'point', visible: true, showLabel: true, locked: true })
      expect(sc().objects[p.points[0]].auxiliary).toBeFalsy()
      const sides = sidesOf(p, sc().objects, sc().order)
      expect(sides.length).toBe(p.points.length)
      for (const sid of sides) expect(sc().objects[sid]).toMatchObject({ type: 'segment', visible: true, locked: true })
      // The chip on the drawing and the side's chip read the letters.
      const c = sc().ev.values.get(p.id)
      expect(displayName(p, sc().objects, c)).toBe(`Right-angled triangle ${p.points.map((pid) => sc().objects[pid].name).join('')}`)
      const s0 = sc().objects[sides[0]]
      expect(displayName(s0, sc().objects)).toBe(`${sc().objects[p.points[0]].name}${sc().objects[p.points[1]].name}`)
    }
  })

  it('fuse back into the rectangle with one frame and one set of letters, and nothing left of the pieces', () => {
    sc().addObjects(segmentRectangle())
    sc().breakApart('rect')
    const pieceParts = pieces().flatMap((p) => [p.id, ...p.points, ...sidesOf(p, sc().objects, sc().order)])
    expect(sc().fusePieces(pieces().map((p) => p.id))).toBeNull()
    for (const id of pieceParts) expect(sc().objects[id]).toBeUndefined()
    const [shape, ...others] = polygons()
    expect(others).toEqual([])
    expect(sc().order.filter((id) => sc().objects[id].type === 'point').length).toBe(4)
    expect(sc().order.filter((id) => sc().objects[id].type === 'segment').length).toBe(4)
    expect(sidesOf(shape, sc().objects, sc().order).length).toBe(4)
    const names = shape.points.map((pid) => sc().objects[pid].name)
    expect(names.every((n) => /^[A-Z]$/.test(n))).toBe(true)
    expect(displayName(shape, sc().objects, sc().ev.values.get(shape.id))).toBe(`Rectangle ${names.join('')}`)
    expect(polygons().length).toBe(1)
    expect(cornersOf(shape.id).length).toBe(4)
  })
})

describe('Fuse joins any shapes that touch (Fix 17)', () => {
  beforeEach(() => sc().newScene())

  /** A shape drawn with the Triangle tool: corners, the polygon, then one side per edge. */
  const drawn = (id: string, letters: string, pts: V3[]): SceneObject[] => {
    const ids = pts.map((_, k) => `${id}${letters[k]}`)
    return [
      ...pts.map((p, k) => pointObj(ids[k], letters[k], p)),
      { ...base(id, `poly_${id}`, '#339af0'), type: 'polygon', points: ids, fill: true },
      ...ids.map((a, k): SceneObject => ({ ...base(`${id}s${k}`, `${id}_${k}`, '#339af0'), type: 'segment', a, b: ids[(k + 1) % ids.length] }))
    ]
  }

  it('fuses two triangles a student drew into a new rectangle, taking both frames and their letters', () => {
    sc().addObjects([
      ...drawn('t', 'ABC', [
        [0, 0, 0],
        [4, 0, 0],
        [4, 3, 0]
      ]),
      ...drawn('u', 'DEF', [
        [0, 0, 0],
        [4, 3, 0],
        [0, 3, 0]
      ])
    ])
    expect(sc().fusePieces(['t', 'u'])).toBeNull()
    const [shape, ...others] = polygons()
    expect(others).toEqual([])
    // Nothing of either triangle is left: no polygon, no side, no corner.
    for (const id of ['t', 'u', 'ts0', 'ts1', 'ts2', 'us0', 'us1', 'us2', 'tA', 'tB', 'tC', 'uD', 'uE', 'uF']) expect(sc().objects[id]).toBeUndefined()
    expect(sc().order.filter((id) => sc().objects[id].type === 'point').length).toBe(4)
    expect(shape.themed).toBe('--lego-new')
    expect(displayName(shape, sc().objects, sc().ev.values.get(shape.id))).toMatch(/^Rectangle [A-Z]{4}$/)
  })

  it('refuses shapes that do not touch in a sentence, and changes nothing', () => {
    sc().addObjects([
      ...drawn('t', 'ABC', [
        [0, 0, 0],
        [4, 0, 0],
        [4, 3, 0]
      ]),
      ...drawn('u', 'DEF', [
        [10, 0, 0],
        [14, 3, 0],
        [10, 3, 0]
      ])
    ])
    const order = sc().order
    expect(sc().fusePieces(['t', 'u'])).toBe(GAP_SENTENCE)
    expect(sc().order).toEqual(order)
  })

  it('a piece and a shape a student drew fuse into a new shape', () => {
    sc().addObjects(segmentRectangle())
    sc().breakApart('rect')
    const [p0] = pieces()
    const c = cornersOf(p0.id)
    // A triangle drawn onto one side of the first piece, outside the rectangle.
    const [a, b] = [c[0], c[1]]
    const m: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0]
    const g: V3 = [(c[0][0] + c[1][0] + c[2][0]) / 3, (c[0][1] + c[1][1] + c[2][1]) / 3, 0]
    const n: V3 = [a[1] - b[1], b[0] - a[0], 0]
    // Out on the side away from the piece's own centre.
    const sgn = n[0] * (m[0] - g[0]) + n[1] * (m[1] - g[1]) > 0 ? 1 : -1
    const out: V3 = [m[0] + sgn * n[0], m[1] + sgn * n[1], 0]
    sc().addObjects(drawn('w', 'XYZ', [b, a, out]))
    expect(sc().fusePieces([p0.id, 'w'])).toBeNull()
    expect(sc().objects[p0.id]).toBeUndefined()
    expect(sc().objects.w).toBeUndefined()
    const made = polygons().find((p) => !p.lego)!
    expect(made.themed).toBe('--lego-new')
    expect(pieces().length).toBe(1)
  })
})

describe('which shapes a Fuse button joins', () => {
  it('every selected polygon with the one the button belongs to, once each, and nothing else', () => {
    const objects: Record<string, SceneObject> = Object.fromEntries(
      [
        { ...base('p1', 'poly1'), type: 'polygon', points: [], fill: true },
        { ...base('p2', 'poly2'), type: 'polygon', points: [], fill: true, lego: { sourceId: 'x', sourceSignature: '', pieceIndex: 0, originalColor: '#9775fa' } },
        pointObj('q', 'Q', [0, 0, 0])
      ].map((o) => [o.id, o as SceneObject])
    )
    expect(fuseChoice(['p1', 'q', 'p1'], 'p2', objects)).toEqual(['p1', 'p2'])
    expect(fuseChoice(['q'], null, objects)).toEqual([])
    expect(fuseChoice(['gone', 'p2'], null, objects)).toEqual(['p2'])
  })

  it('the Measure card, the right-click menu and the palette all ask fuseChoice', () => {
    expect(readSource('src/renderer/src/panels/ShapeInfo.tsx')).toMatch(/fuseChoice\(selection, id, objects\)/)
    const ctx = readSource('src/renderer/src/app/contextActions.ts')
    expect(ctx).toMatch(/const chosen = fuseChoice\(s\(\)\.selection, o\.id, s\(\)\.objects\)/)
    expect(ctx).toMatch(/st\.fusePieces\(fuseChoice\(st\.selection, null, st\.objects\)\)/)
  })
})

describe('fusePlan', () => {
  const tA: V3[] = [
    [0, 0, 0],
    [4, 0, 0],
    [4, 3, 0]
  ]
  const tB: V3[] = [
    [0, 0, 0],
    [4, 3, 0],
    [0, 3, 0]
  ]
  const rec = (sourceId: string, pieceIndex: number) => ({ sourceId, sourceSignature: signatureOf([...tA.slice(0, 3), tB[2]]), pieceIndex, originalColor: '#9775fa' })

  it('is the original only for every piece of one shape back in its outline', () => {
    expect(fusePlan([{ pts: tA, lego: rec('s', 0) }, { pts: tB, lego: rec('s', 1) }], false)).toMatchObject({ ok: true, kind: 'original', name: 'Rectangle', area: 12, perimeter: 14 })
    expect(fusePlan([{ pts: tA, lego: rec('s', 0) }, { pts: tB, lego: rec('s', 1) }], true)).toMatchObject({ ok: true, kind: 'partial' })
    expect(fusePlan([{ pts: tA, lego: rec('s', 0) }, { pts: tB, lego: rec('t', 0) }], false)).toMatchObject({ ok: true, kind: 'new', name: 'Rectangle' })
    expect(fusePlan([{ pts: tA }, { pts: tB }], false)).toMatchObject({ ok: true, kind: 'new', name: 'Rectangle' })
    expect(fusePlan([{ pts: tA }], false)).toEqual({ ok: false, sentence: ONE_PIECE_SENTENCE })
  })
})

describe('a piece saved by 0.7.0', () => {
  beforeEach(() => sc().newScene())

  it('keeps its helper corner names as saved, but never spells them out as letters', () => {
    const P: V3[] = [
      [0, 0, 0],
      [4, 0, 0],
      [4, 3, 0]
    ]
    const ids = P.map((_, k) => `h${k}`)
    sc().addObjects([
      ...P.map((p, k): SceneObject => ({ ...pointObj(ids[k], `poly2_${k + 1}`, p), visible: false, auxiliary: true, showLabel: false })),
      { ...base('old', 'poly2'), type: 'polygon', points: ids, fill: true, label: 'Right-angled triangle', lego: { sourceId: 'gone', sourceSignature: '', pieceIndex: 0, originalColor: '#9775fa' } }
    ])
    const old = sc().objects.old as PolygonObj
    expect(sc().objects.h0.name).toBe('poly2_1')
    expect(pieceLettered(old.points, sc().objects)).toBe(false)
    expect(displayName(old, sc().objects, sc().ev.values.get('old'))).toBe('Right-angled triangle')
    // Nor does the congruence card, which names a triangle by its corners: it would print
    // "△poly2_1poly2_2poly2_3". A lettered piece and a drawn triangle are still compared.
    sc().addObjects([
      ...P.map((p, k) => pointObj(`t${k}`, 'XYZ'[k], [p[0] + 6, p[1], 0])),
      { ...base('drawn', 'poly3'), type: 'polygon', points: ['t0', 't1', 't2'], fill: true }
    ])
    const sel = [sc().objects.old, sc().objects.drawn]
    const objs = sc().objects
    expect(namedByLetters(objs.old, objs)).toBe(false)
    expect(trianglesToCompare(sel, () => true, (o) => namedByLetters(o, objs)).map((o) => o.id)).toEqual(['drawn'])
  })
})

// Round-1 review of the Lego track: what a student sees of a piece outside the drawing itself —
// the Measure panel's card, the command bar, the congruence card and the letters on the canvas.

import { beforeEach, describe, expect, it } from 'vitest'
import { useScene } from '../src/renderer/src/core/store'
import type { PolygonObj, SceneObject } from '../src/renderer/src/core/types'
import type { V3 } from '../src/renderer/src/math/vec'
import { rowsFor } from '../src/renderer/src/panels/Measurements'
import { runCommand } from '../src/renderer/src/lang/commands'
import { PIECE_LETTER_PX, pieceLetterDirections } from '../src/renderer/src/render/pieceLabels'
import { LABEL_BOX } from '../src/renderer/src/render/viewMath'
import { readSource } from './helpers/repo'

const sc = () => useScene.getState()
const base = (id: string, name: string, color = '#9775fa') => ({ id, name, visible: true, locked: false, color, showLabel: true, space: 'shapes' as const })
const pointObj = (id: string, name: string, p: V3): SceneObject => ({ ...base(id, name, '#e7f5ff'), type: 'point', def: { kind: 'free', p } })
const pieces = () => sc().order.map((id) => sc().objects[id]).filter((o): o is PolygonObj => o.type === 'polygon' && !!o.lego)
const polygons = () => sc().order.map((id) => sc().objects[id]).filter((o): o is PolygonObj => o.type === 'polygon')
const card = (o: SceneObject) => rowsFor(o, (id) => sc().ev.values.get(id), sc().objects)[0]
const nameOf = (pid: string) => sc().objects[pid].name

/** A 4 × 2 rectangle ABCD, drawn as one shape. */
function rectangle(): SceneObject[] {
  const P: V3[] = [
    [0, 0, 0],
    [4, 0, 0],
    [4, 2, 0],
    [0, 2, 0]
  ]
  const ids = P.map((_, k) => `pt${'ABCD'[k]}`)
  return [...P.map((p, k) => pointObj(ids[k], 'ABCD'[k], p)), { ...base('rect', 'poly1'), type: 'polygon', points: ids, fill: true }]
}

describe('the Measure panel names a shape as ShapeInfo does (Fix 17)', () => {
  beforeEach(() => sc().newScene())

  it('a rectangle broken apart and fused back is "Rectangle ABCD", never "Polygon poly1"', () => {
    sc().addObjects(rectangle())
    expect(card(sc().objects.rect).title).toBe('Rectangle ABCD')
    sc().breakApart('rect')
    expect(sc().fusePieces(pieces().map((p) => p.id))).toBeNull()
    const [shape] = polygons()
    expect(card(shape).title).toBe(`Rectangle ${shape.points.map(nameOf).join('')}`)
    expect(card(shape).title).not.toMatch(/poly/)
  })

  it('a lettered piece is measured by its letters, not "Side 1, Side 2"', () => {
    sc().addObjects(rectangle())
    sc().breakApart('rect')
    for (const p of pieces()) {
      const [A, B, C] = p.points.map(nameOf)
      const { title, rows } = card(p)
      // As ShapeInfo and the chip name it: the halves of a rectangle are right-angled triangles.
      expect(title).toBe(`Right-angled triangle ${A}${B}${C}`)
      const labels = rows.map((r) => r.label)
      expect(labels).toContain(`Side ${A}${B} (c)`)
      expect(labels.some((l) => /^Side \d/.test(l))).toBe(false)
    }
  })

  it('any triangle is titled by its kind, as ShapeInfo titles it', () => {
    const P: V3[] = [
      [0, 0, 0],
      [4, 0, 0],
      [1, 3, 0]
    ]
    const ids = ['tA', 'tB', 'tC']
    sc().addObjects([...P.map((p, k) => pointObj(ids[k], 'ABC'[k], p)), { ...base('tri', 'poly1'), type: 'polygon', points: ids, fill: true }])
    expect(card(sc().objects.tri).title).toBe('Scalene triangle ABC')
  })

  it('a piece’s side length cannot be typed: it would move one corner and bend the piece', () => {
    sc().addObjects(rectangle())
    sc().breakApart('rect')
    const p = pieces()[0]
    const sideIds = sc().order.filter((id) => {
      const o = sc().objects[id]
      return o.type === 'segment' && p.points.includes(o.a) && p.points.includes(o.b)
    })
    expect(sideIds.length).toBe(3)
    for (const sid of sideIds) {
      const length = card(sc().objects[sid]).rows.find((r) => r.label === 'Length')
      expect(length?.set).toBeUndefined()
    }
  })

  it('a point the student locked by hand, not a piece corner, still takes a typed length', () => {
    const Q = { ...pointObj('pQ', 'Q', [3, 0, 0]), locked: true } as SceneObject
    sc().addObjects([pointObj('pP', 'P', [0, 0, 0]), Q, { ...base('seg', 's'), type: 'segment', a: 'pP', b: 'pQ' }])
    const length = card(sc().objects.seg).rows.find((r) => r.label === 'Length')
    expect(length?.set).toBeTypeOf('function')
    length?.set?.(5)
    const at = (id: string): V3 => {
      const o = sc().objects[id]
      return o.type === 'point' && o.def.kind === 'free' ? o.def.p : [NaN, NaN, NaN]
    }
    const [a, b] = [at('pP'), at('pQ')]
    expect(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])).toBeCloseTo(5, 6)
  })
})

describe('the command bar and a piece’s corners', () => {
  beforeEach(() => sc().newScene())

  it('typing a corner’s letter does not bend the piece: every corner stays put and the bar says why', async () => {
    sc().addObjects(rectangle())
    sc().breakApart('rect')
    const corners = pieces().flatMap((p) => p.points)
    const before = corners.map((pid) => sc().ev.values.get(pid))
    const E = nameOf(corners[0])
    await runCommand(`${E} = (9, 9)`)
    expect(corners.map((pid) => sc().ev.values.get(pid))).toEqual(before)
    for (const pid of corners) expect(sc().objects[pid].locked).toBe(true)
    expect(sc().log.at(-1)).toMatchObject({ kind: 'error', text: `${E} is a corner of a piece. Slide, turn or flip the piece to move it, or choose another letter.` })
  })
})

describe('primed names in the command bar (Fix 11)', () => {
  beforeEach(() => sc().newScene())

  it('"A′ = (1, 2)" makes point A′ and "A′ = (3, 4)" then moves it', async () => {
    await runCommand('A′ = (1, 2)')
    const id = sc().ev.names.get('A′')
    expect(id).toBeDefined()
    expect(sc().objects[id!].type).toBe('point')
    expect(sc().ev.values.get(id!)).toMatchObject({ type: 'point', p: [1, 2, 0] })
    await runCommand('A′ = (3, 4)')
    expect(sc().ev.values.get(sc().ev.names.get('A′')!)).toMatchObject({ type: 'point', p: [3, 4, 0] })
    await runCommand('B″ = (5, 6)')
    expect(sc().ev.values.get(sc().ev.names.get('B″')!)).toMatchObject({ type: 'point', p: [5, 6, 0] })
  })
})

describe('the letters at the ends of the cut (Fix 17)', () => {
  beforeEach(() => sc().newScene())

  const piecesNow = () => pieces().map((p) => ({ points: p.points, pts: (sc().ev.values.get(p.id) as { pts: V3[] }).pts }))
  // Screen offset of a letter at the usual 1 world unit = 1 px scale, y down on screen.
  const offset = (d: [number, number]) => [d[0] * PIECE_LETTER_PX, -d[1] * PIECE_LETTER_PX]

  it('the two halves of a rectangle put their letters one label-width apart, each on its own side of the cut', () => {
    sc().addObjects(rectangle())
    sc().breakApart('rect')
    const ps = piecesNow()
    expect(ps.length).toBe(2)
    const dirs = pieceLetterDirections(ps)
    // Both ends of the diagonal carry a corner of each half: four letters moved, two pairs.
    expect(dirs.size).toBe(4)
    const at = (p: V3) => ps.flatMap((q) => q.points.filter((_, k) => Math.hypot(q.pts[k][0] - p[0], q.pts[k][1] - p[1]) < 1e-9))
    const ends = ps[0].pts.filter((p) => ps[1].pts.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9))
    expect(ends.length).toBe(2)
    for (const end of ends) {
      const [a, b] = at(end)
      const oa = offset(dirs.get(a)!)
      const ob = offset(dirs.get(b)!)
      expect(Math.hypot(oa[0] - ob[0], oa[1] - ob[1])).toBeGreaterThanOrEqual(LABEL_BOX.w)
    }
    // A letter sits outside its own piece: a step along its direction leaves the piece.
    for (const q of ps) {
      q.points.forEach((pid, k) => {
        const d = dirs.get(pid)
        if (!d) return
        const probe: V3 = [q.pts[k][0] + d[0] * 0.01, q.pts[k][1] + d[1] * 0.01, 0]
        expect(inside(probe, q.pts)).toBe(false)
      })
    }
  })

  it('a corner no other piece shares keeps the usual placement', () => {
    const tri: V3[] = [
      [0, 0, 0],
      [4, 0, 0],
      [4, 3, 0]
    ]
    const far = tri.map((p): V3 => [p[0] + 10, p[1], 0])
    expect(pieceLetterDirections([{ points: ['a', 'b', 'c'], pts: tri }, { points: ['d', 'e', 'f'], pts: far }]).size).toBe(0)
  })

  it('the label projector places shared corners by these directions (as one merged label since INT-Wave1)', () => {
    // sharedCornerLabels sums each letter's pieceLetterDirections direction for the one "G, K" label.
    expect(readSource('src/renderer/src/render/pieceLabels.ts')).toMatch(/const dirs = pieceLetterDirections\(pieces, eps\)/)
    const src = readSource('src/renderer/src/render/Labels.tsx')
    expect(src).toMatch(/sharedCornerLabels\(pieces/)
    expect(src).toMatch(/const dir = shared\?\.get\(id\)\?\.dir/)
  })
})

/** Strictly inside a polygon (even–odd rule). */
function inside(p: V3, poly: V3[]): boolean {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

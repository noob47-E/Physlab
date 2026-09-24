// The labels of the pieces after Break apart. Both halves' name labels used to sit on their
// centroids, a third of the way from the cut, reading "Right-angled triangle KLM Area 6 u²"
// (230 px) — on a 4 × 3 rectangle drawn 226 px wide they covered each other and the side labels,
// and each end of the cut carried two letters. Measured in the browser before the fix: at that
// size "GE 5 u × Right-angled triangle HJK Area 6 u²" and "… × HJ 5 u" intersected.

import { beforeEach, describe, expect, it } from 'vitest'
import { useScene } from '../src/renderer/src/core/store'
import type { PolygonObj, SceneObject } from '../src/renderer/src/core/types'
import type { V3 } from '../src/renderer/src/math/vec'
import { simpleCut } from '../src/renderer/src/math/lego'
import { formatMeasure } from '../src/renderer/src/math/format'
import { polygonArea } from '../src/renderer/src/math/geometry'
import { displayName } from '../src/renderer/src/core/naming'
import { duplicateSides, insidePolygon, pieceNameAnchor, settleLabel, sharedCornerLabels, type LabelBox } from '../src/renderer/src/render/pieceLabels'
import { readSource } from './helpers/repo'

const sc = () => useScene.getState()

// A chip's size in the app, measured in the browser: 25 px for one letter, 56 px for "EF4 u";
// 26 px tall. About 7.75 px a character and 17 px of padding.
const chipW = (text: string) => 17 + 7.75 * [...text].length
const CHIP_H = 26
const intersect = (a: LabelBox, b: LabelBox) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
/** The box a label with this text makes at a drawing anchor, `px` pixels to a unit, y down. */
const boxAt = (p: V3, text: string, px: number): LabelBox => ({ x: p[0] * px - chipW(text) / 2, y: -p[1] * px - CHIP_H / 2, w: chipW(text), h: CHIP_H })

const RECT: V3[] = [[0, 0, 0], [4, 0, 0], [4, 3, 0], [0, 3, 0]]
const SQUARE: V3[] = [[0, 0, 0], [4, 0, 0], [4, 4, 0], [0, 4, 0]]
const TRIANGLE: V3[] = [[0, 0, 0], [4, 0, 0], [0, 3, 0]]

describe('a piece’s name label stands away from the cut', () => {
  const cases: [string, V3[]][] = [
    ['a 4 × 3 rectangle cut on its diagonal', RECT],
    ['a 4 × 4 square cut on its diagonal', SQUARE],
    ['a 3-4-5 triangle cut along the median to its longest side', TRIANGLE]
  ]
  for (const [what, shape] of cases) {
    it(`${what}: the two piece labels never meet, down to 40 px a unit`, () => {
      const [p, q] = simpleCut(shape).map((part) => part.pts)
      const text = (pts: V3[]) => `ΔABC · ${formatMeasure(polygonArea(pts), 'area', { decimals: 2, precisionMode: 'dp', lengthUnit: 'unit' } as never)}`
      const ap = pieceNameAnchor(p, [q])
      const aq = pieceNameAnchor(q, [p])
      // Inside its own piece, and further from the other piece's centroid than its own centroid was.
      expect(insidePolygon(ap, p)).toBe(true)
      expect(insidePolygon(aq, q)).toBe(true)
      for (const px of [56, 48, 40]) {
        expect(intersect(boxAt(ap, text(p), px), boxAt(aq, text(q), px)), `${px} px a unit`).toBe(false)
      }
    })
  }

  it('moves half a rectangle’s label from a third of the way off the diagonal to halfway', () => {
    const [p, q] = simpleCut(RECT).map((part) => part.pts)
    const lineDist = (v: V3) => Math.abs(3 * v[0] - 4 * v[1]) / 5 // the diagonal 3x − 4y = 0
    const c = p.reduce<V3>((s, v) => [s[0] + v[0] / 3, s[1] + v[1] / 3, 0], [0, 0, 0])
    const a = pieceNameAnchor(p, [q])
    // Altitude to the hypotenuse of a 3-4-5 triangle: 12/5 = 2.4; the centroid is at 0.8.
    expect(lineDist(c)).toBeCloseTo(0.8, 12)
    expect(lineDist(a)).toBeCloseTo(1.2, 12)
  })

  it('a piece that shares no side keeps its centroid', () => {
    const far = RECT.map((v): V3 => [v[0] + 10, v[1], 0])
    expect(pieceNameAnchor(RECT, [far])).toEqual([2, 1.5, 0])
  })
})

describe('corners on one spot become one label', () => {
  beforeEach(() => sc().newScene())

  it('Break apart on a rectangle: each end of the cut reads "E, H", and sits outside both pieces', () => {
    const base = (id: string, name: string) => ({ id, name, visible: true, locked: false, color: '#9775fa', showLabel: true, space: 'shapes' as const })
    const ids = ['A', 'B', 'C', 'D'].map((n) => `pt${n}`)
    const objs: SceneObject[] = [[0, 3, 0], [4, 3, 0], [4, 0, 0], [0, 0, 0]].map((p, i) => ({ ...base(ids[i], 'ABCD'[i]), type: 'point', def: { kind: 'free', p: p as V3 } }))
    objs.push({ ...base('rect', 'poly1'), type: 'polygon', points: ['ptD', 'ptC', 'ptB', 'ptA'], fill: true, decomposed: true } as PolygonObj)
    sc().addObjects(objs)
    sc().breakApart('rect')
    const pieces = Object.values(sc().objects).filter((o): o is PolygonObj => o.type === 'polygon' && !!o.lego)
    expect(pieces.length).toBe(2)
    const ps = pieces.map((o) => ({ points: o.points, pts: (sc().ev.values.get(o.id) as { pts: V3[] }).pts }))
    const merged = sharedCornerLabels(ps, (id) => sc().objects[id].name)
    const keepers = [...merged].filter(([, m]) => m !== null)
    const hidden = [...merged].filter(([, m]) => m === null)
    expect(keepers.length).toBe(2)
    expect(hidden.length).toBe(2)
    for (const [id, m] of keepers) {
      const [first, second] = m!.text.split(', ')
      expect(first).toBe(sc().objects[id].name)
      expect(second).toMatch(/^[A-Z]$/)
      // One step along its direction leaves both pieces.
      const at = (sc().ev.values.get(id) as { p: V3 }).p
      const probe: V3 = [at[0] + m!.dir[0] * 0.01, at[1] + m!.dir[1] * 0.01, 0]
      for (const q of ps) expect(insidePolygon(probe, q.pts)).toBe(false)
    }
    // The pieces themselves read ΔEFG, short enough to sit apart.
    for (const o of pieces) expect(displayName(o, sc().objects, sc().ev.values.get(o.id))).toMatch(/^Δ[A-Z]{3}$/)
  })

  it('the drawing uses the merged labels, the short piece label and the ladder pass', () => {
    const src = readSource('src/renderer/src/render/Labels.tsx')
    expect(src).toMatch(/sharedCornerLabels\(pieces/)
    expect(src).toMatch(/settleLabel\(box, placed\)/)
    expect(src).toMatch(/`· \$\{formatMeasure\(polygonArea\(c\.pts\), 'area', settings\)\}`/)
    expect(readSource('src/renderer/src/render/ObjectViews.tsx')).toMatch(/pieceNameAnchor\(pts, others\)/)
  })
})

describe('the cut’s length is written once', () => {
  it('a side lying on another piece’s side (either way round) gives way to the first', () => {
    const sides = [
      { id: 'GE', a: [4, 3, 0] as V3, b: [0, 0, 0] as V3 },
      { id: 'EF', a: [0, 0, 0] as V3, b: [4, 0, 0] as V3 },
      { id: 'HJ', a: [0, 0, 0] as V3, b: [4, 3, 0] as V3 },
      { id: 'JK', a: [4, 3, 0] as V3, b: [0, 3, 0] as V3 }
    ]
    expect([...duplicateSides(sides)]).toEqual([['HJ', 'GE']])
  })

  it('the drawing leaves the copy out only while the side that keeps the label is showing', () => {
    const src = readSource('src/renderer/src/render/Labels.tsx')
    expect(src).toMatch(/duplicateSides\(sides\)/)
    expect(src).toMatch(/if \(twin && \(when === 'always' \|\| active\.has\(twin\)/)
  })
})

describe('settleLabel, the one collision pass', () => {
  it('parts a pile of labels on one spot so no two overlap', () => {
    const placed: LabelBox[] = []
    for (let i = 0; i < 7; i++) placed.push(settleLabel({ x: 100, y: 100, w: 90, h: 26 }, placed))
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) expect(intersect(placed[i], placed[j]), `${i} × ${j}`).toBe(false)
  })

  it('leaves a label that overlaps nothing where it is', () => {
    const b = { x: 0, y: 0, w: 50, h: 26 }
    expect(settleLabel(b, [{ x: 200, y: 0, w: 50, h: 26 }])).toEqual(b)
  })

  it('finds the free place the old slide-past-the-hit pass bounced over', () => {
    // Taken just below and just above: the old pass went below, hit, went above, hit, and gave up.
    const want = { x: 0, y: 100, w: 100, h: 26 }
    const placed = [want, { ...want, y: 128 }, { ...want, y: 72 }].map((b) => ({ ...b }))
    const got = settleLabel(want, placed)
    for (const p of placed) expect(intersect(got, p)).toBe(false)
  })
})

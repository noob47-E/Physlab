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

describe('sideways dodge clears the label (H11)', () => {
  // With every rung above and below taken, settleLabel tries the label's own row to either side.
  // That step was half the label's own width, so beside a label as wide as itself on the same spot
  // the two still overlapped by half a width less the gap: the step was refused and the label was
  // drawn on top of the one it was dodging.
  const H = CHIP_H
  /** Labels of width `w` at `x` filling the row at y = 100 and all six rungs above and below it, 28 px apart. */
  const stack = (x: number, w: number): LabelBox[] => Array.from({ length: 13 }, (_, i) => ({ x, y: 100 + (i - 6) * (H + 2), w, h: H }))
  /** `k` more labels in that row on each side of a stack at x = 0, each 100 px wide and 2 px from the next. */
  const beside = (k: number): LabelBox[] => [1, -1].flatMap((s) => Array.from({ length: k }, (_, i) => ({ x: s * (i + 1) * 102, y: 100, w: 100, h: H })))
  const want: LabelBox = { x: 0, y: 100, w: 100, h: H }
  const clearOfAll = (got: LabelBox, placed: LabelBox[]) => {
    for (const p of placed) expect(intersect(got, p), `${JSON.stringify(got)} lies on ${JSON.stringify(p)}`).toBe(false)
  }

  it('two piece labels on one spot, every rung above and below taken: the second sits just past the first', () => {
    const w = chipW('ΔEFG · 6 u²') // 102.25 px, as drawn
    const first: LabelBox = { x: 200, y: 100, w, h: H }
    // The old step of w/2 + 2 px still overlapped the first label by w/2 − 2 = 49 px, so it was refused.
    expect(intersect({ ...first, x: first.x + w / 2 + 2 }, first)).toBe(true)
    const placed = stack(200, w)
    const got = settleLabel({ ...first }, placed)
    clearOfAll(got, placed)
    expect(got).toEqual({ ...first, x: 200 + w + 2 })
  })

  it('goes left when the right is taken, and right when the left is taken', () => {
    const rightTaken = [...stack(0, 100), { x: 102, y: 100, w: 100, h: H }]
    const a = settleLabel(want, rightTaken)
    clearOfAll(a, rightTaken)
    expect(a).toEqual({ ...want, x: -102 })
    const leftTaken = [...stack(0, 100), { x: -102, y: 100, w: 100, h: H }]
    const b = settleLabel(want, leftTaken)
    clearOfAll(b, leftTaken)
    expect(b).toEqual({ ...want, x: 102 })
  })

  it('a place to the side that lands on a third label is refused, not used', () => {
    // The third label covers the far corner of the place just past the first label, on one side
    // and then the other; the other side is nearer than going on past it (244 px away).
    const cases: [LabelBox, number][] = [
      [{ x: 182, y: 110, w: 60, h: H }, -102],
      [{ x: -142, y: 110, w: 60, h: H }, 102]
    ]
    for (const [third, x] of cases) {
      const placed = [...stack(0, 100), third]
      const got = settleLabel(want, placed)
      expect(intersect(got, third), JSON.stringify(got)).toBe(false)
      clearOfAll(got, placed)
      expect(got).toEqual({ ...want, x })
    }
  })

  it('with both places beside it taken it goes further along, to the nearer free place (the right on a tie)', () => {
    const both = [...stack(0, 100), ...beside(1)]
    const got = settleLabel(want, both)
    clearOfAll(got, both)
    expect(got).toEqual({ ...want, x: 204 })
    // A shorter label on the left leaves a nearer free place on that side.
    const shortLeft = [...stack(0, 100), { x: 102, y: 100, w: 100, h: H }, { x: -62, y: 100, w: 60, h: H }]
    const got2 = settleLabel(want, shortLeft)
    clearOfAll(got2, shortLeft)
    expect(got2).toEqual({ ...want, x: -164 })
  })

  it('is measured from the edge of the label it must clear: past a wider label, and only as far as it must', () => {
    // A 56 px side label wanting the middle of a 230 px piece label: a step of its own width plus
    // the gap (to x = 130) would still be inside it.
    const side: LabelBox = { x: 72, y: 100, w: 56, h: H }
    const wide = stack(-15, 230)
    const got = settleLabel(side, wide)
    clearOfAll(got, wide)
    expect(got).toEqual({ ...side, x: 217 })
    // Labels covering only its last 10 px: a 12 px step to the left clears them.
    const end = stack(90, 50)
    const got2 = settleLabel(want, end)
    clearOfAll(got2, end)
    expect(got2).toEqual({ ...want, x: -12 })
  })

  it('keeps the spot it names, on purpose, only when nothing is free within six labels either way', () => {
    // Five more labels in its row on each side: the place past the sixth label is free.
    const five = [...stack(0, 100), ...beside(5)]
    const got = settleLabel(want, five)
    clearOfAll(got, five)
    expect(got).toEqual({ ...want, x: 612 })
    // Six on each side: nothing is free within reach, so it stays where it wanted to be rather than
    // being carried off beside something else it would seem to name.
    expect(settleLabel(want, [...stack(0, 100), ...beside(6)])).toEqual(want)
  })
})

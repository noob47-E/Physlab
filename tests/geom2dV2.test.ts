// Geometry 2-D, second pass: the four real bugs a strict review found in the first pass
// (PhysLab-research/09/sandbox/reviews/GEOM2D/deepseek-review.md).
//   1. The shape's name + area label was placed 60 WORLD units from the shape (3000 px at the
//      default zoom), so it vanished, and at low zoom it landed on the corner badges again.
//   2. Fuse deleted a corner another object was built on, leaving a dangling segment and a stale
//      id in the scene order.
//   3. Fuse gave a corner back its letter only when the corner sat on a whole number.
//   4. A self-crossing polygon still offered Decompose.

import { beforeEach, describe, expect, it } from 'vitest'
import { parentRefs } from '../src/renderer/src/core/evaluate'
import { useScene } from '../src/renderer/src/core/store'
import type { PolygonObj, SceneObject } from '../src/renderer/src/core/types'
import { canDecompose, sidesCross } from '../src/renderer/src/math/shapes'
import type { V3 } from '../src/renderer/src/math/vec'
import { areaLabelPlacement } from '../src/renderer/src/render/areaLabelPlacement'
import { readSource } from './helpers/repo'
import { FILE_VERSION, migrate } from '../src/renderer/src/core/migrate'
import { BREAK_APART_NEEDS_SHAPE, breakApartSelection, menuForObject } from '../src/renderer/src/app/contextActions'

const sc = () => useScene.getState()
const P = (...xy: number[]): V3[] => {
  const out: V3[] = []
  for (let i = 0; i < xy.length; i += 2) out.push([xy[i], xy[i + 1], 0])
  return out
}

// ---------------------------------------------------------------------------
// BUG 1 — where the shape's label stands, in screen terms
// ---------------------------------------------------------------------------

type Box = { x0: number; y0: number; x1: number; y1: number }
type XY = [number, number]

/** A box of this size centred on a pixel point. */
const boxAt = (cx: number, cy: number, w: number, h: number): Box => ({ x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 })
const overlap = (a: Box, b: Box): boolean => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
const inPolygon = (p: XY, poly: XY[]): boolean => {
  let on = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) on = !on
  }
  return on
}
/** Pixels between a box and a polygon, 0 when they touch or one is inside the other (sampled along the sides). */
function gapPx(box: Box, poly: XY[]): number {
  if (inPolygon([(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2], poly)) return 0
  let best = Infinity
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i]
    const [bx, by] = poly[(i + 1) % poly.length]
    const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay)))
    for (let k = 0; k <= steps; k++) {
      const x = ax + ((bx - ax) * k) / steps
      const y = ay + ((by - ay) * k) / steps
      best = Math.min(best, Math.hypot(Math.max(box.x0 - x, 0, x - box.x1), Math.max(box.y0 - y, 0, y - box.y1)))
    }
  }
  return best
}
/** Where the angle badge of every corner stands in pixels: 42 px along the bisector, into a convex corner (ObjectViews). */
function badgeCentres(px: XY[]): XY[] {
  const unit = (x: number, y: number): XY => {
    const l = Math.hypot(x, y) || 1
    return [x / l, y / l]
  }
  const n = px.length
  const area2 = px.reduce((s, p, i) => s + p[0] * px[(i + 1) % n][1] - px[(i + 1) % n][0] * p[1], 0)
  return px.map((v, i) => {
    const a = unit(px[(i - 1 + n) % n][0] - v[0], px[(i - 1 + n) % n][1] - v[1])
    const b = unit(px[(i + 1) % n][0] - v[0], px[(i + 1) % n][1] - v[1])
    let [bx, by] = unit(a[0] + b[0], a[1] + b[1])
    // A reflex corner reads above 180 degrees, and the badge then stands on the outside of the bisector.
    const turn = (v[0] - px[(i - 1 + n) % n][0]) * (px[(i + 1) % n][1] - v[1]) - (v[1] - px[(i - 1 + n) % n][1]) * (px[(i + 1) % n][0] - v[0])
    if (n > 3 && turn * Math.sign(area2) < 0) {
      bx = -bx
      by = -by
    }
    return [v[0] + bx * 42, v[1] + by * 42]
  })
}

const SHAPES: Record<string, V3[]> = {
  // The reviewer's own coordinates.
  'square 2 x 2': P(-1, -1, 1, -1, 1, 1, -1, 1),
  '3-4-5 triangle': P(-6, 1, -2, 1, -6, 4),
  'rectangle 4 x 2': P(-2, -1, 2, -1, 2, 1, -2, 1),
  // The shapes the brief names.
  pentagon: [0, 1, 2, 3, 4].map((k): V3 => [Math.sin((k * 2 * Math.PI) / 5), Math.cos((k * 2 * Math.PI) / 5), 0]),
  'thin rectangle': P(0, 0, 8, 0, 8, 0.1, 0, 0.1),
  'tiny square': P(0, 0, 0.02, 0, 0.02, 0.02, 0, 0.02),
  'L shape': P(0, 0, 4, 0, 4, 2, 2, 2, 2, 4, 0, 4)
}
// World units per pixel: 2500 px to a unit, 50 (the default), 10, 1, 0.05.
const ZOOMS = [0.0004, 0.002, 0.02, 0.1, 1, 20]

describe('BUG 1: the shape label stands by its shape at every zoom', () => {
  for (const [name, pts] of Object.entries(SHAPES)) {
    for (const wpp of ZOOMS) {
      it(`${name}, ${1 / wpp} px to a unit: inside or right beside the shape, clear of every corner badge`, () => {
        const { p } = areaLabelPlacement(pts, wpp)
        expect(p.every(Number.isFinite)).toBe(true)
        const px = pts.map((q): XY => [q[0] / wpp, q[1] / wpp])
        // A name + area chip: about 230 x 24 px; a badge such as "36.87°" about 56 x 20.
        const label = boxAt(p[0] / wpp, p[1] / wpp, 230, 24)
        expect(gapPx(label, px)).toBeLessThanOrEqual(30)
        for (const [bx, by] of badgeCentres(px)) expect(overlap(label, boxAt(bx, by, 56, 20))).toBe(false)
      })
    }
  }

  it('puts the 2 x 2 square label a few hundred pixels at most from its centre at the default zoom (it was 3000)', () => {
    const { p } = areaLabelPlacement(SHAPES['square 2 x 2'], 0.02)
    expect(Math.hypot(p[0], p[1]) / 0.02).toBeLessThan(150)
  })

  it('works in pixels: the same picture at a different scale puts the label in the same place on the screen', () => {
    for (const [name, pts] of Object.entries(SHAPES)) {
      const a = areaLabelPlacement(pts, 0.02).p
      const big = pts.map((q): V3 => [q[0] * 4, q[1] * 4, 0])
      const b = areaLabelPlacement(big, 0.08).p
      expect(b[0] / 4, name).toBeCloseTo(a[0], 9)
      expect(b[1] / 4, name).toBeCloseTo(a[1], 9)
    }
  })

  it('does not depend on where the shape lies on the page', () => {
    for (const [name, pts] of Object.entries(SHAPES)) {
      const a = areaLabelPlacement(pts, 0.02).p
      const b = areaLabelPlacement(pts.map((q): V3 => [q[0] + 120, q[1] - 75, 0]), 0.02).p
      expect(b[0] - 120, name).toBeCloseTo(a[0], 6)
      expect(b[1] + 75, name).toBeCloseTo(a[1], 6)
    }
  })

  it('PolygonView hands the placement the size of a pixel, and keeps the old centre for a shape off the page', () => {
    const src = readSource('src/renderer/src/render/ObjectViews.tsx')
    expect(src).toMatch(/areaLabelPlacement\(pts, [A-Za-z]+/)
  })
})

// ---------------------------------------------------------------------------
// BUG 2 — Fuse never deletes a corner another object is built on
// ---------------------------------------------------------------------------

const base = (id: string, name: string) => ({ id, name, visible: true, locked: false, color: '#9775fa', showLabel: true, space: 'shapes' as const })
const pointObj = (id: string, name: string, p: V3): SceneObject => ({ ...base(id, name), type: 'point', def: { kind: 'free', p } })
const polygons = () => sc().order.map((id) => sc().objects[id]).filter((o): o is PolygonObj => o?.type === 'polygon')
const pieces = () => polygons().filter((p) => !!p.lego)

/** A shape as the Polygon tool draws it: corners, the polygon and one segment per side. */
function drawn(name: string, pts: V3[], letters: string, opts: { decomposed?: boolean } = {}): SceneObject[] {
  const ids = pts.map((_, k) => `${name}c${k}`)
  return [
    ...pts.map((p, k) => pointObj(ids[k], letters[k], p)),
    { ...base(name, `poly-${name}`), type: 'polygon', points: ids, fill: true, decomposed: opts.decomposed },
    ...ids.map((a, k): SceneObject => ({ ...base(`${name}s${k}`, `${name}${k}`), type: 'segment', a, b: ids[(k + 1) % ids.length] }))
  ]
}

/** Every id the scene order names is an object, every object is in the order, and nothing refers to a missing object. */
function expectNoDanglingReference(): void {
  const { objects, order } = sc()
  for (const id of order) expect(objects[id], `order names ${id}`).toBeDefined()
  for (const id of Object.keys(objects)) expect(order, `${id} missing from the order`).toContain(id)
  expect(new Set(order).size).toBe(order.length)
  for (const o of Object.values(objects)) {
    for (const ref of parentRefs(o)) expect(objects[ref], `${o.name} refers to a missing ${ref}`).toBeDefined()
    if (o.type === 'segment') {
      expect(objects[o.a], `${o.name}.a`).toBeDefined()
      expect(objects[o.b], `${o.name}.b`).toBeDefined()
    }
    if (o.type === 'polygon') for (const k of o.points) expect(objects[k], `${o.name} corner ${k}`).toBeDefined()
  }
}

describe('BUG 2: Fuse keeps a corner that another object is built on', () => {
  beforeEach(() => {
    sc().newScene()
    sc().setActiveSpace('shapes')
  })

  it('pieces of a broken rectangle: a segment drawn on a piece corner stays joined to a corner that still exists', () => {
    sc().addObjects(drawn('r', P(0, 0, 4, 0, 4, 2, 0, 2), 'ABCD'), { record: false })
    sc().breakApart('r')
    // The piece corner at (4, 0): the student draws a segment from it to a new point.
    const corner = Object.values(sc().objects).find((o) => o.type === 'point' && o.def.kind === 'free' && o.def.p[0] === 4 && o.def.p[1] === 0)!
    sc().addObjects([pointObj('q', 'Q', [6, 1, 0]), { ...base('own', 'own'), type: 'segment', a: corner.id, b: 'q' }], { record: false })
    const before = { objects: sc().objects, order: sc().order }
    expect(sc().fusePieces(pieces().map((p) => p.id))).toBeNull()
    expect(sc().log.at(-1)?.text).toBe('Back to the original shape.')
    const own = sc().objects.own
    expect(own).toMatchObject({ type: 'segment', a: corner.id, b: 'q' })
    expect(sc().objects[corner.id]).toBeDefined()
    expect(sc().ev.values.get('own')?.type).toBe('segment')
    expectNoDanglingReference()
    // One undo puts back exactly what was there before the Fuse.
    sc().undo()
    expect(sc().objects).toEqual(before.objects)
    expect(sc().order).toEqual(before.order)
    expectNoDanglingReference()
  })

  it('two ordinary rectangles sharing a side: a segment from the shared corner keeps it', () => {
    const lower = drawn('a', P(0, 0, 4, 0, 4, 2, 0, 2), 'ABCD')
    // The upper rectangle is drawn on the lower one's top corners (a3 at (0,2), a2 at (4,2)).
    const upper: SceneObject[] = [
      pointObj('u2', 'E', [4, 4, 0]),
      pointObj('u3', 'F', [0, 4, 0]),
      { ...base('b', 'poly-b'), type: 'polygon', points: ['ac3', 'ac2', 'u2', 'u3'], fill: true }
    ]
    sc().addObjects([...lower, ...upper, pointObj('q', 'Q', [-3, 2, 0]), { ...base('own', 'own'), type: 'segment', a: 'ac3', b: 'q' }], { record: false })
    const before = { objects: sc().objects, order: sc().order }
    expect(sc().fusePieces(['a', 'b'])).toBeNull()
    expect(polygons().length).toBe(1)
    expect(sc().objects.ac3).toBeDefined()
    expect(sc().objects.own).toMatchObject({ type: 'segment', a: 'ac3', b: 'q' })
    expectNoDanglingReference()
    sc().undo()
    expect(sc().objects).toEqual(before.objects)
    expect(sc().order).toEqual(before.order)
  })

  it('a shape built on a piece corner (a second polygon) keeps that corner too', () => {
    sc().addObjects(drawn('r', P(0, 0, 4, 0, 4, 2, 0, 2), 'ABCD'), { record: false })
    sc().breakApart('r')
    const corner = Object.values(sc().objects).find((o) => o.type === 'point' && o.def.kind === 'free' && o.def.p[0] === 4 && o.def.p[1] === 0)!
    sc().addObjects(
      [
        pointObj('x', 'X', [8, 0, 0]),
        pointObj('y', 'Y', [8, 3, 0]),
        { ...base('tri', 'poly-tri'), type: 'polygon', points: [corner.id, 'x', 'y'], fill: true },
        { ...base('t0', 't0'), type: 'segment', a: corner.id, b: 'x' },
        { ...base('t1', 't1'), type: 'segment', a: 'x', b: 'y' },
        { ...base('t2', 't2'), type: 'segment', a: 'y', b: corner.id }
      ],
      { record: false }
    )
    expect(sc().fusePieces(pieces().map((p) => p.id))).toBeNull()
    expect(sc().objects[corner.id]).toBeDefined()
    expect(sc().objects.tri).toMatchObject({ points: [corner.id, 'x', 'y'] })
    expectNoDanglingReference()
  })
})

// ---------------------------------------------------------------------------
// BUG 3 — corner letters survive Break apart then Fuse wherever the corners lie
// ---------------------------------------------------------------------------

/** The letter at each position after a Fuse, matched by position within a tolerance of the shape's size. */
function lettersAfterFuse(pts: V3[], letters: string, decomposed = false): string[] {
  sc().newScene()
  sc().setActiveSpace('shapes')
  sc().addObjects(drawn('s', pts, letters, { decomposed }), { record: false })
  sc().breakApart('s')
  expect(pieces().length).toBeGreaterThanOrEqual(2)
  expect(sc().fusePieces(pieces().map((p) => p.id))).toBeNull()
  expect(sc().log.at(-1)?.text).toBe('Back to the original shape.')
  const [shape] = polygons()
  const size = Math.max(...pts.map((p) => Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1])))
  return pts.map((p) => {
    const hit = shape.points.map((k) => sc().objects[k]).find((o) => o?.type === 'point' && o.def.kind === 'free' && Math.hypot(o.def.p[0] - p[0], o.def.p[1] - p[1]) <= 1e-6 * size)
    return hit?.name ?? '?'
  })
}

describe('BUG 3: a corner off the whole numbers keeps its letter', () => {
  it("the reviewer's triangle with a corner at (1/3, 1), cut on its median and fused", () => {
    expect(lettersAfterFuse(P(0, 0, 1, 0, 1 / 3, 1), 'ABC')).toEqual(['A', 'B', 'C'])
  })

  it('the same triangle at a thousandth and at a thousand times the size, and moved off the origin', () => {
    for (const k of [1e-3, 1, 1e3]) {
      const tri = P(0, 0, 1, 0, 1 / 3, 1).map((p): V3 => [p[0] * k + 7 * k, p[1] * k - 2 * k, 0])
      expect(lettersAfterFuse(tri, 'ABC'), `scale ${k}`).toEqual(['A', 'B', 'C'])
    }
  })

  it('a parallelogram with irrational corners cut on its diagonal', () => {
    const pts = P(0, 0, Math.PI, 0, Math.PI + Math.SQRT2 / 2, Math.E, Math.SQRT2 / 2, Math.E)
    expect(lettersAfterFuse(pts, 'ABCD')).toEqual(['A', 'B', 'C', 'D'])
  })

  it('corners on whole numbers still keep theirs (a rectangle, a unit square)', () => {
    expect(lettersAfterFuse(P(0, 0, 4, 0, 4, 2, 0, 2), 'ABCD')).toEqual(['A', 'B', 'C', 'D'])
    expect(lettersAfterFuse(P(0, 0, 1, 0, 1, 1, 0, 1), 'PQRS')).toEqual(['P', 'Q', 'R', 'S'])
  })

  it('a damaged saved record (a hand-edited file) does not stop Fuse; the corners are lettered fresh', () => {
    sc().newScene()
    sc().setActiveSpace('shapes')
    sc().addObjects(drawn('s', P(0, 0, 4, 0, 4, 2, 0, 2), 'ABCD'), { record: false })
    sc().breakApart('s')
    for (const piece of pieces()) {
      sc().updateObject(piece.id, (d) => {
        if (d.type === 'polygon' && d.lego) d.lego.originalCorners = [{ p: 'x', name: 3 }, null, { p: [Number.NaN, 1, 0], name: 'A' }] as never
      })
    }
    expect(sc().fusePieces(pieces().map((p) => p.id))).toBeNull()
    const [shape] = polygons()
    const names = shape.points.map((k) => sc().objects[k].name)
    expect(new Set(names).size).toBe(4)
  })

  // DeepSeek's second review (18 Oct): a record that is not a list at all - "garbage" where the list should be - crashed Fuse with
  // "saved.filter is not a function"; the case above only spoiled the list's entries.
  it('a saved record that is not a list at all does not stop Fuse either', () => {
    for (const bad of ['garbage', 7, { p: [0, 0, 0], name: 'A' }]) {
      sc().newScene()
      sc().setActiveSpace('shapes')
      sc().addObjects(drawn('s', P(0, 0, 4, 0, 4, 2, 0, 2), 'ABCD'), { record: false })
      sc().breakApart('s')
      for (const piece of pieces()) {
        sc().updateObject(piece.id, (d) => {
          if (d.type === 'polygon' && d.lego) d.lego.originalCorners = bad as never
        })
      }
      expect(() => sc().fusePieces(pieces().map((p) => p.id)), JSON.stringify(bad)).not.toThrow()
      const [shape] = polygons()
      expect(new Set(shape.points.map((k) => sc().objects[k].name)).size, JSON.stringify(bad)).toBe(4)
    }
  })

  it('a file whose piece carries a record that is not a list opens with the record left out, the piece kept', () => {
    const piece = { id: 'pc', name: 'piece', type: 'polygon', points: [], lego: { sourceId: 's', pieceIndex: 0, originalColor: '#000000', sourceSignature: '', originalCorners: 'garbage' } }
    const [out] = migrate({ app: 'PhysLab', version: FILE_VERSION, objects: [piece] }).objects as unknown[]
    expect((out as { lego?: Record<string, unknown> }).lego).toBeDefined()
    expect((out as { lego: Record<string, unknown> }).lego.originalCorners).toBeUndefined()
  })

  it('a letter a staying object already wears is not given to a second corner', () => {
    sc().newScene()
    sc().setActiveSpace('shapes')
    sc().addObjects(drawn('s', P(0, 0, 4, 0, 4, 2, 0, 2), 'ABCD'), { record: false })
    sc().breakApart('s')
    // The student names a new point A while the pieces are apart (A is free: the shape's own A went).
    sc().addObjects([pointObj('mine', 'A', [9, 9, 0])], { record: false })
    expect(sc().fusePieces(pieces().map((p) => p.id))).toBeNull()
    const names = Object.values(sc().objects).filter((o) => o.type === 'point').map((o) => o.name)
    expect(new Set(names).size).toBe(names.length)
    expect(sc().objects.mine.name).toBe('A')
  })

  it('undo of the Fuse and then of the Break apart gives back the letters it started with', () => {
    sc().newScene()
    sc().setActiveSpace('shapes')
    sc().addObjects(drawn('s', P(0, 0, 1, 0, 1 / 3, 1), 'ABC'), { record: false })
    const start = { objects: sc().objects, order: sc().order }
    sc().breakApart('s')
    const apart = { objects: sc().objects, order: sc().order }
    sc().fusePieces(pieces().map((p) => p.id))
    sc().undo()
    expect(sc().objects).toEqual(apart.objects)
    sc().undo()
    expect(sc().objects).toEqual(start.objects)
    expect(sc().order).toEqual(start.order)
  })
})

// ---------------------------------------------------------------------------
// BUG 4 — no Decompose for a self-crossing polygon
// ---------------------------------------------------------------------------

describe('BUG 4: Decompose is not offered on a polygon whose sides cross', () => {
  const bowtie = P(0, 0, 2, 2, 2, 0, 0, 2)

  it('canDecompose says no to a bow-tie and yes to an ordinary four-sided shape', () => {
    expect(sidesCross(bowtie)).toBe(true)
    expect(canDecompose(bowtie)).toBe(false)
    expect(canDecompose(P(0, 0, 4, 0, 4, 2, 0, 2))).toBe(true)
    expect(canDecompose(P(0, 0, 4, 0, 4, 2, 2, 2, 2, 4, 0, 4))).toBe(true)
  })

  it('a triangle has no Decompose either way', () => {
    expect(canDecompose(P(0, 0, 4, 0, 0, 3))).toBe(false)
  })

  it('ShapeInfo draws the Decompose button only when canDecompose allows it, and never splits a crossed shape', () => {
    const src = readSource('src/renderer/src/panels/ShapeInfo.tsx')
    expect(src).toMatch(/canDecompose\(data\.pts\)/)
    expect(src).not.toMatch(/data\.kind === 'polygon' && data\.pts\.length >= 4 &&/)
    expect(src).toMatch(/obj\.decomposed && !sidesCross\(c\.pts\) \? decompose\(/)
  })
})

// The right-click menu and the search palette offered Decompose, Split it another way and Break apart on a bow-tie after the panel stopped
// (the helper's leftover, 17 Oct): they follow the panel's rule now.
describe('BUG 4, the menus: no Decompose or Break apart on a polygon whose sides cross', () => {
  beforeEach(() => {
    sc().newScene()
    sc().setActiveSpace('shapes')
  })
  const labels = (id: string): string[] => menuForObject(id).flatMap((g) => g.items.map((i) => i.label))

  it('a bow-tie: the menu offers none of them, even one saved as decomposed by an older build', () => {
    sc().addObjects(drawn('bt', P(0, 0, 2, 2, 2, 0, 0, 2), 'ABCD'), { record: false })
    sc().addObjects(drawn('old', P(5, 0, 7, 2, 7, 0, 5, 2), 'EFGH', { decomposed: true }), { record: false })
    for (const id of ['bt', 'old']) {
      const l = labels(id)
      expect(l, id).not.toContain('Decompose into simple shapes')
      expect(l, id).not.toContain('Split it another way')
      expect(l, id).not.toContain('Break apart')
      expect(l, id).toContain('Area with the formula')
    }
  })

  it('an ordinary rectangle still has Decompose, and once decomposed Split it another way and Break apart', () => {
    sc().addObjects(drawn('r', P(0, 0, 4, 0, 4, 2, 0, 2), 'ABCD', { decomposed: true }), { record: false })
    const l = labels('r')
    expect(l).toContain('Undo decompose')
    expect(l).toContain('Split it another way')
    expect(l).toContain('Break apart')
  })

  it('a triangle has no Decompose in the menu either, and keeps Break apart (cut along a median)', () => {
    sc().addObjects(drawn('t', P(0, 0, 4, 0, 0, 3), 'ABC'), { record: false })
    const l = labels('t')
    expect(l).not.toContain('Decompose into simple shapes')
    expect(l).toContain('Break apart')
  })

  it('the palette breaks nothing apart for a selected bow-tie, and says why', () => {
    sc().addObjects(drawn('old', P(5, 0, 7, 2, 7, 0, 5, 2), 'EFGH', { decomposed: true }), { record: false })
    sc().select(['old'])
    breakApartSelection()
    expect(pieces()).toHaveLength(0)
    expect(sc().log.at(-1)?.text).toBe(BREAK_APART_NEEDS_SHAPE)
  })
})

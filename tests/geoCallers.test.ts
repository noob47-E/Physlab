// P-GEO: the formula report and Decompose for shapes that are not level on the page (P15 callers).

import { beforeEach, describe, expect, it } from 'vitest'
import type { MeasureSettings } from '../src/renderer/src/math/format'
import { polygonReport } from '../src/renderer/src/math/shapeFormulas'
import { dist, dot, len, type V3 } from '../src/renderer/src/math/vec'
import { lineCircleIntersection, lineLineIntersection, perpendicularBisector } from '../src/renderer/src/math/geometry'
import { resetGlobals } from './helpers/globals'
import { decompose, partLabel } from '../src/renderer/src/math/decompose'
import { fuseResult, GAP_SENTENCE, OVERLAP_SENTENCE, outlineOf } from '../src/renderer/src/math/lego'
import { sidesInWorld } from '../src/renderer/src/panels/Congruence'
import { useScene } from '../src/renderer/src/core/store'
import { boxDisplay, pairRows, rowsFor, rowText, typedValue, type Row } from '../src/renderer/src/panels/Measurements'
import type { SceneSettings } from '../src/renderer/src/core/types'
import { runCommand } from '../src/renderer/src/lang/commands'

beforeEach(resetGlobals)

const S: MeasureSettings = { decimals: 2, precisionMode: 'dp', unit: 'cm', unitPerSquare: 1, angleUnit: 'deg' }
const N = ['A', 'B', 'C', 'D', 'E', 'F']

describe('P15 callers — the formula report in the shape’s own plane', () => {
  it('a skew quadrilateral gets no area row, only its sentence', () => {
    const r = polygonReport([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 1]], N, S)
    expect(r.cls?.kind).toBe('skew')
    expect(r.rows.some((row) => /area/i.test(row.title))).toBe(false)
    expect(r.note).toMatch(/not all lie in one flat plane/)
  })

  it('an upright concave pentagon’s shoelace sum adds up to its area, not its shadow’s', () => {
    // An L-ish pentagon standing in the x–z plane: its shadow on the page is a line.
    const pts: V3[] = [[0, 0, 0], [4, 0, 0], [4, 0, 2], [2, 0, 1], [0, 0, 2]]
    const r = polygonReport(pts, N, S)
    const row = r.rows.find((x) => /^Area/.test(x.title))!
    expect(row.value).toBeCloseTo(6, 9)
    // Every product in the sum uses the shape's own coordinates: the shadow's y is 0 everywhere, so
    // a sum read off x and y would be all zeros.
    const terms = [...row.substitution.matchAll(/\(([-\d.]+)\)\(([-\d.]+)\) - \(([-\d.]+)\)\(([-\d.]+)\)/g)]
    expect(terms.length).toBe(5)
    const sum = terms.reduce((acc, m) => acc + Number(m[1]) * Number(m[2]) - Number(m[3]) * Number(m[4]), 0)
    expect(Math.abs(sum) / 2).toBeCloseTo(6, 6)
    expect(row.general).not.toMatch(/x_i y_/)
  })

  it('a shape on the page keeps its x–y shoelace row', () => {
    const r = polygonReport([[0, 0, 0], [4, 0, 0], [4, 2, 0], [2, 1, 0], [0, 2, 0]], N, S)
    expect(r.rows.find((x) => /^Area/.test(x.title))!.general).toMatch(/x_i y_/)
  })
})

describe('the Measure panel for shapes that are no flat shape (P15 callers, H4, H5)', () => {
  const sc = () => useScene.getState()
  const rowsOf = (name: string) => {
    const o = Object.values(sc().objects).find((x) => x.name === name)!
    return rowsFor(o, (id) => sc().ev.values.get(id), sc().objects)
  }
  beforeEach(() => sc().newScene())

  it('a skew quadrilateral shows its sides and perimeter, and says why it has no area', async () => {
    for (const line of ['A = (0, 0, 0)', 'B = (1, 0, 0)', 'C = (1, 1, 0)', 'D = (0, 1, 1)', 'q = Polygon(A, B, C, D)']) await runCommand(line)
    const [g] = rowsOf('q')
    expect(g.title).toBe('Skew quadrilateral ABCD')
    expect(g.rows.find((r) => r.label === 'Area')?.value).toMatch(/not all lie in one flat plane/)
    expect(g.rows.find((r) => r.label === 'Perimeter')?.value).toBeCloseTo(2 + 2 * Math.SQRT2, 9)
  })

  it('a bow-tie and three corners in a line get no area and no angles', async () => {
    for (const line of ['A = (0, 0)', 'B = (2, 2)', 'C = (2, 0)', 'D = (0, 2)', 'q = Polygon(A, B, C, D)', 'E = (3, 0)', 'F = (4, 0)', 'G = (5, 0)', 'p = Polygon(E, F, G)']) await runCommand(line)
    const [bow] = rowsOf('q')
    expect(bow.title).toBe('Crossed quadrilateral ABCD')
    expect(bow.rows.find((r) => r.label === 'Area')?.value).toMatch(/cross/)
    const [flat] = rowsOf('p')
    expect(flat.title).toBe('Corners in a line EFG')
    expect(flat.rows.some((r) => /^∠|Angle/.test(r.label))).toBe(false)
  })
})

describe('lines and circles in 3-D (H2, H6, H9)', () => {
  it('two lines crossing in an upright plane meet; skew and parallel lines do not', () => {
    // In the x–z plane: the x–y cross product of the directions is 0, so they read "parallel".
    const X = lineLineIntersection({ kind: 'line', p: [0, 0, 0], d: [1, 0, 1] }, { kind: 'line', p: [2, 0, 0], d: [-1, 0, 1] })
    expect(X).not.toBeNull()
    expect(dist(X!, [1, 0, 1])).toBeLessThan(1e-12)
    // A slanted pair meeting at (1, 2, 3).
    const Y = lineLineIntersection({ kind: 'line', p: [0, 0, 0], d: [1, 2, 3] }, { kind: 'segment', p: [1, 2, 0], d: [0, 0, 4] })
    expect(dist(Y!, [1, 2, 3])).toBeLessThan(1e-12)
    // Skew: cross on paper, pass at different heights.
    expect(lineLineIntersection({ kind: 'line', p: [0, 0, 0], d: [1, 0, 0] }, { kind: 'line', p: [0, 0, 1], d: [0, 1, 0] })).toBeNull()
    expect(lineLineIntersection({ kind: 'line', p: [0, 0, 0], d: [0, 0, 1] }, { kind: 'line', p: [1, 0, 0], d: [0, 0, 2] })).toBeNull()
    // Segment limits still hold.
    expect(lineLineIntersection({ kind: 'segment', p: [0, 0, 0], d: [1, 0, 1] }, { kind: 'segment', p: [4, 0, 0], d: [-1, 0, 1] })).toBeNull()
    // On the page, as before.
    expect(lineLineIntersection({ kind: 'line', p: [0, 0, 0], d: [1, 1, 0] }, { kind: 'line', p: [0, 2, 0], d: [1, -1, 0] })).toEqual([1, 1, 0])
  })

  it('a line meets a level circle only on the circle', () => {
    const k = { c: [0, 0, 0] as V3, r: 1 }
    // Straight down through the centre: it crosses the circle's plane at the centre, not on the circle.
    expect(lineCircleIntersection({ kind: 'line', p: [0, 0, -1], d: [0, 0, 1] }, k)).toEqual([])
    // Down through a point on the circle.
    const on = lineCircleIntersection({ kind: 'line', p: [1, 0, -1], d: [0, 0, 1] }, k)
    expect(on.length).toBe(1)
    expect(dist(on[0], [1, 0, 0])).toBeLessThan(1e-12)
    // Level but at another height: no meeting.
    expect(lineCircleIntersection({ kind: 'line', p: [-2, 0, 1], d: [1, 0, 0] }, k)).toEqual([])
    // In the circle's plane: two points as before.
    expect(lineCircleIntersection({ kind: 'line', p: [-2, 0, 0], d: [1, 0, 0] }, k).length).toBe(2)
    // A slanted line through (0, 1, 0) on the circle.
    const slant = lineCircleIntersection({ kind: 'line', p: [0, 0, -1], d: [0, 1, 1] }, k)
    expect(slant.length).toBe(1)
    expect(dist(slant[0], [0, 1, 0])).toBeLessThan(1e-12)
  })

  it('the perpendicular bisector of an upright segment has a direction', () => {
    const l = perpendicularBisector([0, 0, 0], [0, 0, 2])
    expect(len(l.d)).toBeGreaterThan(0)
    expect(dot(l.d, [0, 0, 2])).toBe(0)
    expect(l.p).toEqual([0, 0, 1])
  })
})

describe('the Measure panel rows (H12–H16)', () => {
  const sc = () => useScene.getState()
  const objNamed = (name: string) => Object.values(sc().objects).find((x) => x.name === name)!
  const rowsOf = (name: string) => rowsFor(objNamed(name), (id) => sc().ev.values.get(id), sc().objects)[0].rows
  const row = (rows: { label: string }[], label: RegExp) => rows.find((r) => label.test(r.label)) as Row
  const settings = (over: Partial<SceneSettings> = {}): SceneSettings => ({ ...sc().settings, ...over })
  beforeEach(() => sc().newScene())

  it('H12: a vector’s rows read in its own unit at any grid scale', async () => {
    await runCommand('A = (0, 0)')
    await runCommand('F = Vector(A, (8.660254037844387, 5))')
    sc().updateObject(objNamed('F').id, (d) => {
      if (d.type === 'vector') d.unit = 'N'
    })
    for (const s of [settings(), settings({ unit: 'cm', unitPerSquare: 2 })]) {
      const rows = rowsOf('F')
      expect(rowText(row(rows, /magnitude/), s)).toBe('10 N')
      expect(rowText(row(rows, /x-component/), s)).toBe('8.66 N')
      expect(rowText(row(rows, /y-component/), s)).toBe('5 N')
    }
  })

  it('H14: a point off the page gives its angles with the axes, not its shadow’s heading', async () => {
    await runCommand('P = (0, 0, 5)')
    await runCommand('Q = (1, 2, 3)')
    expect(rowsOf('P').some((r) => r.label === 'Angle from +x')).toBe(false)
    expect((row(rowsOf('P'), /^α/).value as number) * (180 / Math.PI)).toBeCloseTo(90, 9)
    expect((row(rowsOf('Q'), /^α/).value as number) * (180 / Math.PI)).toBeCloseTo(74.4986, 3)
    await runCommand('R = (3, 4)')
    expect(row(rowsOf('R'), /Angle from \+x/)).toBeDefined()
  })

  it('H15: an angle box reads at the student’s precision', () => {
    const s = settings({ decimals: 2, precisionMode: 'dp' })
    expect(boxDisplay('angle', s)?.(36.869897645844)).toBe('36.87')
    expect(boxDisplay('length', s)?.(4.60634)).toBe('4.61')
  })

  it('H13: Escape cancels and an untouched box changes nothing', () => {
    expect(typedValue('7', '4.4721', true)).toBeNull()
    expect(typedValue('4.4721', '4.4721', false)).toBeNull()
    expect(typedValue('  ', '4.4721', false)).toBeNull()
    expect(typedValue('7', '4.4721', false)).toBe(7)
    expect(typedValue('−2', '4.4721', false)).toBe(-2)
  })

  it('H16: a zero vector has no direction, unit vector or angle, and nothing projects on it', async () => {
    await runCommand('A = (1, 1)')
    await runCommand('Z = Vector(A, A)')
    await runCommand('w = Vector(A, (4, 5))')
    const rows = rowsOf('Z')
    expect(row(rows, /θ with/).value).toBe('undefined — a zero vector has no direction')
    expect(row(rows, /Unit vector/).value).toBe('undefined — a zero vector has no direction')
    const pair = pairRows(objNamed('Z'), objNamed('w'), (id) => sc().ev.values.get(id))!.rows
    expect(row(pair, /Angle between/).value).toBe('undefined — a zero vector has no direction')
    expect(row(pair, /Projection of w on Z/).value).toBe('undefined — a zero vector has no direction')
    // The other way round is fine: the projection of the zero vector on w is 0.
    const back = pairRows(objNamed('w'), objNamed('Z'), (id) => sc().ev.values.get(id))!.rows
    expect(row(back, /Projection of Z on w/).value).toBe(0)
  })
})

describe('Decompose part labels and the triangle drawn from its sides (H17, H18)', () => {
  it('H17: parts past twelve keep their Roman numerals', () => {
    expect([0, 3, 8, 11, 12, 13, 18, 39, 48].map(partLabel)).toEqual(['I', 'IV', 'IX', 'XII', 'XIII', 'XIV', 'XIX', 'XL', 'XLIX'])
  })

  it('H18: sides typed in centimetres at 1 square = 2 cm are 1.5, 2 and 2.5 squares', () => {
    const s: MeasureSettings = { ...S, unit: 'cm', unitPerSquare: 2 }
    expect(sidesInWorld([3, 4, 5], s)).toEqual([1.5, 2, 2.5])
    expect(sidesInWorld([3, 4, 5], { ...S, unitPerSquare: 1 })).toEqual([3, 4, 5])
  })
})

describe('Fuse tells an overlap from a gap (H3, L9)', () => {
  const sq = (x: number, y = 0, s = 1): V3[] => [[x, y, 0], [x + s, y, 0], [x + s, y + s, 0], [x, y + s, 0]]

  it('two squares half over each other are told they overlap, not that there is a gap', () => {
    expect(fuseResult([sq(0), sq(0.5)], sq(0, 0, 2))).toEqual({ ok: false, sentence: OVERLAP_SENTENCE })
  })

  it('a square lying wholly on a bigger one overlaps', () => {
    expect(fuseResult([sq(0, 0, 2), sq(0.5, 0.5)], sq(0, 0, 2))).toEqual({ ok: false, sentence: OVERLAP_SENTENCE })
  })

  it('a true gap is still a gap, and touching squares still fuse', () => {
    expect(fuseResult([sq(0), sq(1.1)], sq(0, 0, 2))).toEqual({ ok: false, sentence: GAP_SENTENCE })
    const r = fuseResult([sq(0), sq(1)], [[0, 0, 0], [2, 0, 0], [2, 1, 0], [0, 1, 0]])
    expect(r.ok && r.kind).toBe('original')
  })

  it('a corner 0.0005 from the end of a side 1000 long splits that side', () => {
    const long: V3[] = [[0, 0, 0], [1000, 0, 0], [1000, 1, 0], [0, 1, 0]]
    const tri: V3[] = [[0, 0, 0], [0.0005, 0, 0], [0, -1, 0]]
    expect(outlineOf([long, tri])).not.toBeNull()
  })
})

describe('Decompose and Break apart for shapes off the page (H8)', () => {
  const house: V3[] = [[0, 0, 0], [6, 0, 0], [6, 3.2, 2.4], [3, 5.6, 4.2], [0, 3.2, 2.4]]

  it('the tilted house splits in its own plane and its parts add up to its 33 u²', () => {
    const dec = decompose(house)
    expect(dec.parts.length).toBe(2)
    expect(dec.parts.reduce((s, p) => s + p.area, 0)).toBeCloseTo(33, 9)
    for (const part of dec.parts) for (const p of part.pts) expect(p[2]).toBeCloseTo(0.75 * p[1], 9)
    expect(dec.parts.map((p) => p.cls.name).sort()).toEqual(['Rectangle', 'Right isosceles triangle'])
    // The shape's own corners come back exactly, so their letters match.
    for (const q of house) expect(dec.parts.some((part) => part.pts.some((p) => p[0] === q[0] && p[1] === q[1] && p[2] === q[2]))).toBe(true)
    for (const p of dec.newPoints) expect(p[2]).toBeCloseTo(0.75 * p[1], 9)
  })

  it('an upright L-shape splits too, instead of "already a simple shape"', () => {
    const L: V3[] = [[0, 0, 0], [4, 0, 0], [4, 0, 1], [1, 0, 1], [1, 0, 3], [0, 0, 3]]
    const dec = decompose(L)
    expect(dec.parts.length).toBe(2)
    expect(dec.parts.reduce((s, p) => s + p.area, 0)).toBeCloseTo(6, 9)
    for (const part of dec.parts) for (const p of part.pts) expect(p[1]).toBeCloseTo(0, 12)
  })

  it('a raised level shape splits at its own height; a shape on the page exactly as before', () => {
    const at = (z: number): V3[] => [[0, 0, z], [4, 0, z], [4, 1, z], [1, 1, z], [1, 3, z], [0, 3, z]]
    const flat = decompose(at(0))
    const raised = decompose(at(2))
    expect(raised.parts.map((p) => p.pts.map((q) => [q[0], q[1]]))).toEqual(flat.parts.map((p) => p.pts.map((q) => [q[0], q[1]])))
    for (const part of raised.parts) for (const p of part.pts) expect(p[2]).toBe(2)
  })

  it('a skew shape is one part that carries its sentence', () => {
    const dec = decompose([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 1]])
    expect(dec.parts.length).toBe(1)
    expect(dec.parts[0].cls.notAShape).toMatch(/one flat plane/)
  })

  describe('Break apart', () => {
    const sc = () => useScene.getState()
    const objNamed = (name: string) => Object.values(sc().objects).find((x) => x.name === name)!
    beforeEach(() => sc().newScene())

    it('refuses a shape not on the page in words, makes no pieces and adds no undo step', async () => {
      for (const [name, pts] of [['p', '(0, 0, 0), (2, 0, 0), (0, 0, 2)'], ['q', '(0, 0, 1), (2, 0, 1), (2, 2, 1), (0, 2, 1)']] as const) {
        await runCommand(`${name} = Polygon(${pts})`)
        const before = Object.keys(sc().objects).length
        const undo = sc().past.length
        const log = sc().log.length
        sc().breakApart(objNamed(name).id)
        expect(Object.keys(sc().objects).length).toBe(before)
        expect(sc().past.length).toBe(undo)
        expect(sc().log.slice(log).map((e) => e.text).join(' ')).toMatch(/flat on the page/)
      }
    })

    it('breaks a shape on the page apart as before', async () => {
      await runCommand('p = Polygon((0, 0), (4, 0), (4, 1), (1, 1), (1, 3), (0, 3))')
      sc().breakApart(objNamed('p').id)
      expect(Object.values(sc().objects).filter((o) => o.type === 'polygon' && o.lego).length).toBe(2)
    })
  })
})

describe('Measure panel powers of ten (N44)', () => {
  const sc = () => useScene.getState()
  beforeEach(() => sc().newScene())

  it('cards raise the power of ten at 1 square = 1.5×10¹⁰', async () => {
    await runCommand('P = (2, 1)')
    await runCommand('v = Vector((2, 1))')
    sc().setSettings({ unitPerSquare: 1.5e10 })
    const s = sc().settings
    for (const name of ['P', 'v']) {
      const o = Object.values(sc().objects).find((x) => x.name === name)!
      for (const group of rowsFor(o, (id) => sc().ev.values.get(id), sc().objects)) {
        for (const r of group.rows) expect(rowText(r, s), r.label).not.toMatch(/\^|x10/)
      }
    }
    const P = Object.values(sc().objects).find((x) => x.name === 'P')!
    const dist = rowsFor(P, (id) => sc().ev.values.get(id), sc().objects)[0].rows.find((r) => r.label === 'Distance from origin')!
    expect(rowText(dist, s)).toMatch(/10¹⁰/)
  })
})

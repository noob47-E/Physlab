// 3D-3B: the Measure panel's worked answers in Geometry's 3-D view, from what is selected - each against a hand value (the
// contract's own: a cube of side 2 is V = 8, A = 24; the planes x = 0 and y = 0 meet at 90°; (0, 0, 0) is √3 from
// x + y + z = 3; a line along (1, 1, 0) is at 0° to z = 0, along (0, 0, 1) at 90°; a pyramid 4 by 6 is 32).

import { describe, expect, it } from 'vitest'
import { measure3D, planeEquationTex, type Item3D } from '../src/renderer/src/math/measure3d'
import { solidShape, SOLID_KINDS } from '../src/renderer/src/math/solidShape'
import type { MeasureSettings } from '../src/renderer/src/math/format'

const s: MeasureSettings = { decimals: 2, precisionMode: 'dp', unit: 'unit', unitPerSquare: 1, angleUnit: 'deg' }
const P = (name: string, p: [number, number, number]): Item3D => ({ type: 'point', name, p })
const L = (name: string, p: [number, number, number], d: [number, number, number], ends?: boolean): Item3D => ({ type: 'line', name, p, d, ends: ends ? [p, [p[0] + d[0], p[1] + d[1], p[2] + d[2]]] : undefined })
const PL = (name: string, a: number, b: number, c: number, d: number): Item3D => ({ type: 'plane', name, a, b, c, d })
const SOL = (kind: (typeof SOLID_KINDS)[number], size: Record<string, number>): Item3D => {
  const sh = solidShape(kind, size, [0, 0, 0])
  return { type: 'solid', name: kind, kind, size, volume: sh.volume, area: sh.area }
}
const DEG = Math.PI / 180

describe('distances', () => {
  it('two points: d = √(Δx² + Δy² + Δz²), (0,0,0) to (1,2,2) is 3', () => {
    const m = measure3D([P('A', [0, 0, 0]), P('B', [1, 2, 2])], s)!
    expect(m.title).toBe('Distance AB')
    expect(m.rows[0].value).toBeCloseTo(3, 12)
    expect(m.rows[0].general).toContain('\\sqrt')
    expect(m.rows[0].substitution).toContain('(1 - 0)^2')
    expect(m.rows[0].answer).toContain('3')
  })
  it('a segment: its length', () => {
    const m = measure3D([L('AB', [0, 0, 0], [3, 4, 0], true)], s)!
    expect(m.title).toBe('Length of AB')
    expect(m.rows[0].value).toBeCloseTo(5, 12)
  })
  it('review: a point and a plane at 1 square = 2 cm put the point and d in cm, as the answer is', () => {
    const cm: MeasureSettings = { ...s, unit: 'cm', unitPerSquare: 2 }
    const m = measure3D([P('P', [1, 0, 0]), PL('α', 1, 0, 0, 3)], cm)!
    expect(m.rows[0].substitution).toContain('1 \\times 2')
    expect(m.rows[0].substitution).toContain('- 6|')
  })

  it('a point and a plane: (0, 0, 0) is √3 from x + y + z = 3', () => {
    const m = measure3D([P('O', [0, 0, 0]), PL('α', 1, 1, 1, 3)], s)!
    expect(m.rows[0].value).toBeCloseTo(Math.sqrt(3), 12)
    expect(m.rows[0].general).toContain('\\dfrac{|a x_0 + b y_0 + c z_0 - d|}')
    expect(m.rows[0].answer).toMatch(/\\sqrt\{3\}|1\.73/)
  })
})

describe('angles', () => {
  it('two lines along (1, 0, 0) and (1, 1, 0): 45°', () => {
    const m = measure3D([L('f', [0, 0, 0], [1, 0, 0]), L('g', [0, 0, 0], [1, 1, 0])], s)!
    expect(m.rows[0].value).toBeCloseTo(45 * DEG, 12)
    expect(m.rows[0].general).toContain('\\cos\\theta')
    expect(m.rows[0].answer).toContain('45')
  })
  it('a line and a plane: along (1, 1, 0) to z = 0 is 0°, along (0, 0, 1) is 90°, along (1, 1, 1) is 35.26°', () => {
    const z0 = PL('α', 0, 0, 1, 0)
    expect(measure3D([L('f', [0, 0, 0], [1, 1, 0]), z0], s)!.rows[0].value).toBeCloseTo(0, 12)
    expect(measure3D([z0, L('f', [0, 0, 0], [0, 0, 1])], s)!.rows[0].value).toBeCloseTo(90 * DEG, 12)
    const m = measure3D([L('f', [0, 0, 0], [1, 1, 1]), z0], s)!
    expect(m.rows[0].general).toContain('\\sin\\theta')
    expect(m.rows[0].answer).toContain('35.26')
  })
  it('two planes x = 0 and y = 0: 90°', () => {
    const m = measure3D([PL('α', 1, 0, 0, 0), PL('β', 0, 1, 0, 0)], s)!
    expect(m.title).toBe('Angle between α and β')
    expect(m.rows[0].value).toBeCloseTo(90 * DEG, 12)
  })
})

describe('a solid: volume and surface area, the formula, the numbers put in, the answer', () => {
  it('a cube of side 2: V = 8, A = 24', () => {
    const m = measure3D([SOL('cube', { a: 2 })], s)!
    expect(m.rows.map((r) => r.title)).toEqual(['Volume', 'Surface area'])
    expect(m.rows[0].value).toBeCloseTo(8, 12)
    expect(m.rows[0].general).toBe('V = a^3')
    expect(m.rows[0].substitution).toBe('V = 2^3')
    expect(m.rows[1].value).toBeCloseTo(24, 12)
  })
  it('a square pyramid 4 by 6: V = ⅓ b² h = 32', () => {
    const m = measure3D([SOL('pyramid', { b: 4, h: 6 })], s)!
    expect(m.rows[0].general).toBe('V = \\frac{1}{3} b^2 h')
    expect(m.rows[0].substitution).toBe('V = \\frac{1}{3} \\times 4^2 \\times 6')
    expect(m.rows[0].value).toBeCloseTo(32, 12)
    expect(m.rows[0].answer).toContain('32')
  })
  it('a sphere of radius 3: V = 36π, written with π', () => {
    const m = measure3D([SOL('sphere', { r: 3 })], s)!
    expect(m.rows[0].value).toBeCloseTo(36 * Math.PI, 12)
    expect(m.rows[0].answer).toContain('36\\pi')
  })
  it('every kind gives the same numbers as its shape, and a formula and a substitution for each', () => {
    for (const k of SOLID_KINDS) {
      const sh = solidShape(k, {}, [0, 0, 0])
      const m = measure3D([{ type: 'solid', name: k, kind: k, size: {}, volume: sh.volume, area: sh.area }], s)!
      expect(m.rows[0].value, k).toBeCloseTo(sh.volume, 9)
      expect(m.rows[1].value, k).toBeCloseTo(sh.area, 9)
      for (const r of m.rows) {
        expect(r.general, k).toMatch(/^[VA] = /)
        expect(r.substitution, k).toMatch(/^[VA] = /)
      }
    }
  })
})

describe('what is not a measurement', () => {
  it('nothing, three things, or two solids: none', () => {
    expect(measure3D([], s)).toBeNull()
    expect(measure3D([P('A', [0, 0, 0]), P('B', [1, 0, 0]), P('C', [0, 1, 0])], s)).toBeNull()
    expect(measure3D([SOL('cube', {}), SOL('cone', {})], s)).toBeNull()
  })
  it('a plane alone gives its equation', () => {
    const m = measure3D([PL('α', 2, 1, -1, 4)], s)!
    expect(m.rows[0].answer).toBe('2x + y - z = 4')
  })
})

describe('a plane’s equation', () => {
  it('writes 1 and −1 without the 1, leaves out a 0, and keeps a lone term', () => {
    expect(planeEquationTex(0, 0, 1, 0, s)).toBe('z = 0')
    expect(planeEquationTex(1, -2, 0, 3, s)).toBe('x - 2y = 3')
    expect(planeEquationTex(-1, 0, 0.5, -2, s)).toBe('-x + 0.5z = -2')
  })
})

describe('a plane through three points, as the card writes it', () => {
  it('its normal in lowest whole numbers: (0, 0, 0), (4, 0, 0), (0, 4, 1) is y - 4z = 0', async () => {
    const { wholeNormal } = await import('../src/renderer/src/panels/measure3dItems')
    expect(wholeNormal([0, -4, 16])).toEqual([0, 1, -4])
    expect(wholeNormal([-2, 4, 6])).toEqual([1, -2, -3])
    expect(wholeNormal([0.5, 1, 0])).toEqual([0.5, 1, 0])
    expect(planeEquationTex(0, 1, -4, 0, s)).toBe('y - 4z = 0')
  })
})

describe('the In the drawing list', () => {
  it('review: lists segments and lines with their numbers, as well as solids, planes and points', async () => {
    const { scene } = await import('../src/renderer/src/core/store')
    const { Builder } = await import('../src/renderer/src/core/factory')
    const { objectList } = await import('../src/renderer/src/panels/measure3dItems')
    scene().newScene()
    scene().setActiveSpace('shapes')
    const b = new Builder()
    const A = b.point([0, 0, 0], { name: 'A' })
    const B = b.point([3, 4, 0], { name: 'B' })
    b.segment(A.id, B.id)
    b.line({ kind: 'twoPoints', a: A.id, b: B.id })
    b.commit()
    const s = scene()
    const texts = objectList(s.order, s.objects, s.ev, s.settings).map((r) => `${r.name}: ${r.text}`)
    expect(texts.some((t) => t.startsWith('AB: length 5'))).toBe(true)
    expect(texts.some((t) => /along/.test(t))).toBe(true)
  })
})

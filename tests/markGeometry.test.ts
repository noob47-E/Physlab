// Angle arcs at polygon corners, tick marks and equal-angle arcs: the shapes, from geometry.

import { describe, expect, it } from 'vitest'
import { arcLines, cornerAngle, polygonCornerMark, tickLines, tickNormal } from '../src/renderer/src/render/markGeometry'
import { readSource } from './helpers/repo'
import type { V3 } from '../src/renderer/src/math/vec'

const L: V3[] = [[0, 0, 0], [4, 0, 0], [4, 2, 0], [2, 2, 0], [2, 4, 0], [0, 4, 0]]
const inL = (x: number, y: number) => x > 0 && x < 4 && y > 0 && y < 4 && !(x > 2 && y > 2)
const corner = (p: V3[], i: number): [V3, V3, V3] => [p[(i + p.length - 1) % p.length], p[i], p[(i + 1) % p.length]]

describe('polygon corner arcs', () => {
  for (const [name, poly, orientation] of [['counter-clockwise', L, 1], ['clockwise', [...L].reverse(), -1]] as const) {
    it(`sweep the inside 270° at the reflex corner of an L (${name})`, () => {
      const i = poly.findIndex((p) => p[0] === 2 && p[1] === 2)
      const [prev, v, next] = corner(poly, i)
      expect(cornerAngle(prev, v, next, orientation, false)).toBeCloseTo(1.5 * Math.PI, 9)
      const pts = polygonCornerMark(prev, v, next, orientation, false, 0.5)
      // Not the 3-point right-angle square the exterior 90° gave.
      expect(pts.length).toBeGreaterThan(10)
      const ang = (p: V3) => Math.atan2(p[1] - 2, p[0] - 2)
      let sweep = 0
      for (let k = 1; k < pts.length; k++) {
        let d = ang(pts[k]) - ang(pts[k - 1])
        while (d > Math.PI) d -= 2 * Math.PI
        while (d < -Math.PI) d += 2 * Math.PI
        sweep += d
      }
      expect(Math.abs(sweep)).toBeCloseTo(1.5 * Math.PI, 6)
      // Ends on the two sides at the corner (east and north of it).
      const ends = [pts[0], pts[pts.length - 1]].map((p) => Math.round(((ang(p) * 180) / Math.PI + 360) % 360))
      expect(ends.sort((p, q) => p - q)).toEqual([0, 90])
      const m = pts[Math.floor(pts.length / 2)]
      expect(inL(m[0], m[1])).toBe(true)
    })
  }

  it('keeps the right-angle square at an ordinary right corner', () => {
    const [prev, v, next] = corner(L, 1)
    expect(polygonCornerMark(prev, v, next, 1, false, 1)).toHaveLength(3)
  })
})

describe('tick marks in 3-D', () => {
  it('stand across a side along z (no zero-length stroke)', () => {
    const [s] = tickLines({ a: [0, 0, 0], b: [0, 0, 3], n: 1 }, null, 0.2, 0.1)
    expect(Math.hypot(s[0][0] - s[1][0], s[0][1] - s[1][1], s[0][2] - s[1][2])).toBeCloseTo(0.4, 9)
    expect(s[0][2]).toBeCloseTo(1.5, 9)
  })

  it('lie in the plane of the triangle they mark (x-z plane)', () => {
    const tri: V3[] = [[0, 0, 0], [4, 0, 0], [0, 0, 3]]
    const arcs = [{ vertex: tri[0], a: tri[1], b: tri[2], n: 1 }]
    const t = { a: tri[0], b: tri[1], n: 2 }
    const n = tickNormal(t, [t], arcs)
    expect(Math.abs(n![1])).toBeCloseTo(1, 9)
    const lines = tickLines(t, n, 0.2, 0.1)
    expect(lines).toHaveLength(2)
    for (const l of lines) for (const p of l) expect(p[1]).toBeCloseTo(0, 9)
    expect(Math.abs(lines[0][0][2] - lines[0][1][2])).toBeCloseTo(0.4, 9)
  })

  it('take the plane from a neighbouring tick when no arc is marked', () => {
    const a = { a: [0, 0, 0] as V3, b: [4, 0, 0] as V3, n: 1 }
    const b = { a: [0, 0, 0] as V3, b: [0, 0, 3] as V3, n: 2 }
    expect(Math.abs(tickNormal(a, [a, b], [])![1])).toBeCloseTo(1, 9)
  })
})

describe('ticks of two triangles sharing a vertex (VB round 2)', () => {
  it("keep each tick in its own triangle plane, not the neighbour's", () => {
    const A: V3 = [4, 0, 0], B: V3 = [0, 0, 0], D: V3 = [0, 0, 3], C: V3 = [0, 4, 0], E: V3 = [0, 0, 5]
    const arcs = [{ vertex: B, a: A, b: D, n: 1 }, { vertex: B, a: C, b: E, n: 1 }]
    const t1 = { a: A, b: B, n: 1 }
    const t2 = { a: C, b: B, n: 1 }
    const [l] = tickLines(t2, tickNormal(t2, [t1, t2], arcs), 0.2, 0.1)
    for (const p of l) expect(p[0]).toBeCloseTo(0, 9)
    expect(Math.abs(l[0][2] - l[1][2])).toBeCloseTo(0.4, 9)
    expect(l[0][1]).toBeCloseTo(l[1][1], 9)
    const [m] = tickLines(t1, tickNormal(t1, [t1, t2], arcs), 0.2, 0.1)
    for (const p of m) expect(p[1]).toBeCloseTo(0, 9)
  })
})

describe('right angles of an upright polygon (VB round 2)', () => {
  it('draw squares at the corners of an upright rectangle', () => {
    const R: V3[] = [[0, 0, 0], [4, 0, 0], [4, 0, 3], [0, 0, 3]]
    for (let i = 0; i < 4; i++) {
      const [prev, v, next] = corner(R, i)
      expect(polygonCornerMark(prev, v, next, 1, false, 0.5)).toHaveLength(3)
    }
  })
})

describe('equal-angle arcs in 3-D', () => {
  it('lie in the plane of an upright triangle and sweep the real angle', () => {
    const tri: V3[] = [[0, 0, 0], [4, 0, 0], [0, 0, 3]]
    const [arc] = arcLines({ vertex: tri[0], a: tri[1], b: tri[2], n: 1 }, 0.5, 0.1)
    expect(arc.length).toBeGreaterThan(5)
    for (const p of arc) expect(p[1]).toBeCloseTo(0, 9)
    const first = arc[0]
    const last = arc[arc.length - 1]
    expect(Math.atan2(first[2], first[0])).toBeCloseTo(0, 9)
    expect(Math.atan2(last[2], last[0])).toBeCloseTo(Math.PI / 2, 9)
  })
})

describe('circle and angle fills (W7)', () => {
  const src = readSource('src/renderer/src/render/ObjectViews.tsx')
  // No DOM to mount the views in, so the boundary is the source: each fill reads its colour
  // through shownColor and is keyed on the theme, because WebGPU compiles a colour in.
  for (const name of ['CircleView', 'AngleView']) {
    it(`${name}'s fill goes through shownColor and is keyed on the theme`, () => {
      const start = src.indexOf(`export const ${name} =`)
      const body = src.slice(start, src.indexOf('\n})\n', start))
      const m = body.match(/<meshBasicMaterial[^>]*>/)
      expect(m).not.toBeNull()
      expect(m![0]).toContain('key={')
      expect(m![0]).toMatch(/theme/)
      expect(m![0]).not.toContain('color={obj.color}')
      expect(body).toContain('shownColor(obj)')
    })
  }
})

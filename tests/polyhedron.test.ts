// T974: a solid made from a shape - prism by extrude, pyramid by apex, polyhedron from typed corners. Hand values:
// a 2 x 3 rectangle extruded by 4 has V = 24 and A = 52; a square pyramid of side 2, height 3 has V = 4.
import { describe, expect, it } from 'vitest'
import { extrudeOutline, hullFromCorners, parseCorners, pyramidOver } from '../src/renderer/src/math/polyhedron'
import type { V3 } from '../src/renderer/src/math/vec'

const rect: V3[] = [[0, 0, 0], [2, 0, 0], [2, 3, 0], [0, 3, 0]]

describe('extrude', () => {
  it('2 x 3 rectangle by 4: V = 24, A = 52, 6 faces, 8 corners, 12 edges', () => {
    const p = extrudeOutline(rect, 4)
    expect(p.volume).toBeCloseTo(24, 9)
    expect(p.area).toBeCloseTo(52, 9)
    expect(p.vertices).toHaveLength(8)
    expect(p.polys).toHaveLength(6)
    expect(p.edges).toHaveLength(12)
    expect(p.faceAreas.slice().sort((a, b) => a - b)).toEqual([6, 6, 8, 8, 12, 12])
  })
  it('the same either way round', () => {
    expect(extrudeOutline([...rect].reverse(), 4).volume).toBeCloseTo(24, 9)
  })
  it('an L-shaped outline: V = area x h, the caps in triangles', () => {
    const L: V3[] = [[0, 0, 1], [3, 0, 1], [3, 1, 1], [1, 1, 1], [1, 3, 1], [0, 3, 1]]
    const p = extrudeOutline(L, 2)
    expect(p.volume).toBeCloseTo(10, 9)
    expect(p.area).toBeCloseTo(2 * 5 + 2 * 12, 9)
    expect(p.faces.length).toBeGreaterThan(p.polys.length)
    expect(Math.min(...p.vertices.map((v) => v[2]))).toBe(1)
    expect(Math.max(...p.vertices.map((v) => v[2]))).toBe(3)
  })
})

describe('apex', () => {
  it('square base of side 2, height 3: V = 4', () => {
    const p = pyramidOver([[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0]], [1, 1, 3])
    expect(p.volume).toBeCloseTo(4, 9)
    expect(p.area).toBeCloseTo(4 + 4 * 0.5 * 2 * Math.sqrt(10), 9)
    expect(p.polys).toHaveLength(5)
    expect(p.edges).toHaveLength(8)
  })
  it('an apex below the base works too', () => {
    expect(pyramidOver([[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0]], [1, 1, -3]).volume).toBeCloseTo(4, 9)
  })
  it('an apex in the base plane is refused', () => {
    expect(() => pyramidOver(rect, [1, 1, 0])).toThrow(/in the plane/)
  })
})

describe('from corners', () => {
  it('the eight corners of a 2 x 2 x 2 cube: 6 faces, 12 edges, V = 8, A = 24', () => {
    const c: V3[] = []
    for (const x of [0, 2]) for (const y of [0, 2]) for (const z of [0, 2]) c.push([x, y, z])
    const p = hullFromCorners(c)
    expect(p.polys).toHaveLength(6)
    expect(p.edges).toHaveLength(12)
    expect(p.volume).toBeCloseTo(8, 9)
    expect(p.area).toBeCloseTo(24, 9)
  })
  it('a corner inside is left out; a tetrahedron (0,0,0) (1,0,0) (0,1,0) (0,0,1) has V = 1/6', () => {
    const p = hullFromCorners([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [0.1, 0.1, 0.1]])
    expect(p.volume).toBeCloseTo(1 / 6, 12)
    expect(p.vertices).toHaveLength(4)
    expect(p.polys).toHaveLength(4)
  })
  it('flat or too few corners are refused in words', () => {
    expect(() => hullFromCorners([[0, 0, 0], [1, 0, 0], [0, 1, 0]])).toThrow(/at least four/)
    expect(() => hullFromCorners([[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]])).toThrow(/flat/)
  })
  it('typed corners are read: (0,0,0), (2,0,0), ...', () => {
    expect(parseCorners('(0,0,0), (2,0,0), (0, 1.5, 0) (0,0,-1)')).toEqual([[0, 0, 0], [2, 0, 0], [0, 1.5, 0], [0, 0, -1]])
    expect(() => parseCorners('(1,2), (3,4,5)')).toThrow(/three numbers/)
  })
})

describe('as a solid and in Measure', () => {
  it('solidShape of an extrusion stands at `at`, with the true faces kept', async () => {
    const { solidShape } = await import('../src/renderer/src/math/solidShape')
    const sh = solidShape('extrusion', { h: 4 }, [10, 10, 1], { pts: [[-1, -1.5, 0], [1, -1.5, 0], [1, 1.5, 0], [-1, 1.5, 0]] })
    expect(sh.volume).toBeCloseTo(24, 9)
    expect(sh.area).toBeCloseTo(52, 9)
    expect(sh.top).toEqual([10, 10, 5])
    expect(sh.poly?.polys).toHaveLength(6)
    expect(() => solidShape('extrusion', { h: 0 }, [0, 0, 0], { pts: rect })).toThrow(/more than 0/)
  })
  it('Measure gives volume, surface, face areas, edges and angles, each with steps', async () => {
    const { solidShape } = await import('../src/renderer/src/math/solidShape')
    const { measure3D } = await import('../src/renderer/src/math/measure3d')
    const sh = solidShape('extrusion', { h: 4 }, [0, 0, 0], { pts: rect })
    const m = measure3D([{ type: 'solid', name: 'Prism', kind: 'extrusion', size: { h: 4 }, volume: sh.volume, area: sh.area, poly: { ...sh.poly!, vertices: sh.vertices } }], { decimals: 2, precisionMode: 'dp', unit: 'unit', unitPerSquare: 1, angleUnit: 'deg' })!
    expect(m.rows.map((r) => r.title)).toEqual(['Volume', 'Surface area', 'Face areas', 'Edge lengths', 'Angles between faces'])
    expect(m.rows[0].value).toBeCloseTo(24, 9)
    expect(m.rows[0].substitution).toContain('4')
    expect(m.rows[1].value).toBeCloseTo(52, 9)
    expect(m.rows[3].substitution).toContain('|AB|')
    expect(m.rows[4].substitution.match(/90/g)).toHaveLength(12)
  })
})

describe('T976 review fixes', () => {
  it('a small tetrahedron far from the origin is still a solid, V = 1/6 (tolerance scales with size, not position)', () => {
    const o = 1000
    const p = hullFromCorners([[o, o, o], [o + 0.01, o, o], [o, o + 0.01, o], [o, o, o + 0.01]])
    expect(p.volume).toBeCloseTo(1e-6 / 6, 12)
    expect(p.polys).toHaveLength(4)
  })
})

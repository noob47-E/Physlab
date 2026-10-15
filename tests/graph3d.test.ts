// 3D-2: the pure maths of Graphing in 3D (math/graph3d.ts): a curve in space, a plane, a parametric surface, the colour by
// height from the theme's three colours, the thin mesh lines, the box Home frames.

import { describe, expect, it } from 'vitest'
import { boxOf, heightColours, meshLines, parametricSurface, planeOf, planePatch, rampColour, rgbOf, spaceCurve, unionBox } from '../src/renderer/src/math/graph3d'
import { surfaceGeometry } from '../src/renderer/src/math/graphs'

describe('a curve in space', () => {
  it('the helix x = cos t, y = sin t, z = t/5 from 0 to 4π: on the unit cylinder, rising 4π/5', () => {
    const [run] = spaceCurve(Math.cos, Math.sin, (t) => t / 5, 0, 4 * Math.PI, 400)
    expect(run).toHaveLength(401)
    for (const p of run) expect(Math.hypot(p[0], p[1])).toBeCloseTo(1, 12)
    expect(run[0]).toEqual([1, 0, 0])
    expect(run[400][2]).toBeCloseTo((4 * Math.PI) / 5, 12)
  })
  it('is split where it has no value, never joined across the gap', () => {
    const runs = spaceCurve((t) => t, (t) => 1 / t, () => 0, -1, 1, 100)
    expect(runs).toHaveLength(2)
    expect(runs.every((r) => r.every((p) => p.every(Number.isFinite)))).toBe(true)
  })
})

describe('a plane ax + by + cz = d', () => {
  it('2x + y − z = 3 is read off its formula (written F = lhs − rhs)', () => {
    expect(planeOf((x, y, z) => 2 * x + y - z - 3)).toEqual({ a: 2, b: 1, c: -1, d: 3 })
  })
  it('x² + y = z is not a plane, and 0 = 3 has no normal', () => {
    expect(planeOf((x, y, z) => x * x + y - z)).toBeNull()
    expect(planeOf(() => -3)).toBeNull()
  })
  it('x + y + z = 4 is cut to the cube: every corner in the cube and in the plane, 3 to 6 corners', () => {
    const p = { a: 1, b: 1, c: 1, d: 4 }
    const poly = planePatch(p, 6)
    expect(poly.length).toBeGreaterThanOrEqual(3)
    expect(poly.length).toBeLessThanOrEqual(6)
    for (const q of poly) {
      expect(q.every((v) => Math.abs(v) <= 6 + 1e-9)).toBe(true)
      expect(q[0] + q[1] + q[2]).toBeCloseTo(4, 9)
    }
    // A plane that misses the cube has no section.
    expect(planePatch({ a: 0, b: 0, c: 1, d: 50 }, 6)).toEqual([])
  })
  it('the patch lies in the plane at every corner, over the cube, a vertical plane (x = 2) too', () => {
    for (const p of [{ a: 2, b: 1, c: -1, d: 3 }, { a: 1, b: 0, c: 0, d: 2 }, { a: 0, b: 3, c: 4, d: 1 }]) {
      const quad = planePatch(p, 5)
      // The plane's section of the cube: 3 to 6 corners.
      expect(quad.length).toBeGreaterThanOrEqual(3)
      expect(quad.length).toBeLessThanOrEqual(6)
      for (const [x, y, z] of quad) expect(p.a * x + p.b * y + p.c * z).toBeCloseTo(p.d, 9)
    }
    const vertical = planePatch({ a: 1, b: 0, c: 0, d: 2 }, 5)
    expect(vertical.every((q) => q[0] === 2)).toBe(true)
    expect(new Set(vertical.map((q) => `${q[1]},${q[2]}`)).size).toBe(4)
  })
})

describe('a parametric surface', () => {
  it('the sphere of radius 3 (x = 3 sin v cos u …): every point 3 from the centre; (nu + 1)(nv + 1) points, 2·nu·nv triangles', () => {
    const s = parametricSurface((u, v) => 3 * Math.sin(v) * Math.cos(u), (u, v) => 3 * Math.sin(v) * Math.sin(u), (_u, v) => 3 * Math.cos(v), 0, 2 * Math.PI, 0, Math.PI, 24, 12)
    expect(s.positions.length).toBe(25 * 13 * 3)
    expect(s.indices.length).toBe(24 * 12 * 2 * 3)
    for (let k = 0; k < s.positions.length; k += 3) expect(Math.hypot(s.positions[k], s.positions[k + 1], s.positions[k + 2])).toBeCloseTo(3, 5)
  })
  it('a point with no value takes no triangle', () => {
    const s = parametricSurface((u) => u, (_u, v) => v, (u) => (u > 0.5 ? NaN : 0), 0, 1, 0, 1, 4, 4)
    expect(s.indices.length).toBeLessThan(4 * 4 * 2 * 3)
  })
})

describe('the look: colour by height and thin mesh lines', () => {
  it('reads the theme colours, and the ramp goes low → mid → high', () => {
    expect(rgbOf('#ff0000')).toEqual([1, 0, 0])
    expect(rgbOf('#0f0')).toEqual([0, 1, 0])
    expect(rgbOf('red')).toEqual([0.5, 0.5, 0.5])
    const low = rgbOf('#2050c0')
    const mid = rgbOf('#30b080')
    const high = rgbOf('#f0c040')
    const at = (t: number) => rampColour(t, low, mid, high).map((c) => Math.round(c * 255))
    expect(at(0)).toEqual([0x20, 0x50, 0xc0])
    expect(at(0.5)).toEqual([0x30, 0xb0, 0x80])
    expect(at(1)).toEqual([0xf0, 0xc0, 0x40])
  })
  it('a surface is coloured from its lowest point (low) to its highest (high)', () => {
    const s = surfaceGeometry((x, y) => Math.sin(x) * Math.cos(y), 6, 20)
    const zs: number[] = []
    for (let k = 2; k < s.positions.length; k += 3) zs.push(s.positions[k])
    const cols = heightColours(zs, [0, 0, 1], [0, 1, 0], [1, 0, 0])
    const lowest = zs.indexOf(Math.min(...zs))
    const highest = zs.indexOf(Math.max(...zs))
    expect([...cols.slice(lowest * 3, lowest * 3 + 3)]).toEqual([0, 0, 1])
    expect([...cols.slice(highest * 3, highest * 3 + 3)]).toEqual([1, 0, 0])
  })
  it('the mesh lines are every k-th row and column of the grid, as segment pairs', () => {
    const s = surfaceGeometry(() => 0, 6, 8)
    const lines = meshLines(s.positions, 8, 8, 4)
    // Rows 0, 4, 8 and columns 0, 4, 8: 3 rows × 8 segments + 3 columns × 8 segments.
    expect(lines.length / 6).toBe(48)
  })
})

describe('what Home frames', () => {
  it('the box of the points that have values, and two boxes joined', () => {
    expect(boxOf([1, 2, 3, -1, 5, NaN, 4, -2, 0])).toEqual({ min: [1, -2, 0], max: [4, 2, 3] })
    expect(boxOf([NaN, 1, 2])).toBeNull()
    expect(unionBox({ min: [0, 0, 0], max: [1, 1, 1] }, { min: [-2, 0, 0], max: [0, 3, 0] })).toEqual({ min: [-2, 0, 0], max: [1, 3, 1] })
  })
})

describe('the axis names in 3D', () => {
  it('sit just past the axis end when it is on screen, else at the farthest point of the axis on screen, else nowhere', async () => {
    const { axisTitleSpot } = await import('../src/renderer/src/render/gridLabels')
    const view = { width: 800, height: 600 }
    // A flat projection: x to the right, 20 px a unit from the centre.
    const flat = (p: number[]) => ({ x: 400 + p[0] * 20, y: 300 - p[1] * 20, visible: true })
    expect(axisTitleSpot(flat, [1, 0, 0], 10, view)).toEqual({ x: 400 + 10.8 * 20, y: 300 })
    // Zoomed in: the end is off screen, so the name comes in along the axis to the edge.
    const near = (p: number[]) => ({ x: 400 + p[0] * 60, y: 300 - p[1] * 60, visible: true })
    const at = axisTitleSpot(near, [1, 0, 0], 10, view)!
    expect(at.x).toBeLessThanOrEqual(800 - 18)
    expect(at.x).toBeGreaterThan(700)
    // An axis pointing at the eye (every point on the centre... behind the camera here) has no name.
    expect(axisTitleSpot(() => ({ x: 0, y: 0, visible: false }), [0, 0, 1], 10, view)).toBeNull()
  })
})

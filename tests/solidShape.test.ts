// 3D-3B: a solid as the Geometry 3-D view draws and measures it - its corners and faces from math/solids3d.ts, standing on
// the floor with the centre of its base at `at`; the edges a student should see; its volume and surface area.

import { describe, expect, it } from 'vitest'
import { SOLID_KINDS, planeSheet, solidShape, sizesOf } from '../src/renderer/src/math/solidShape'

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 9)

describe('a solid on the floor', () => {
  it('has a size list for every kind, with a default for each', () => {
    expect(SOLID_KINDS).toEqual(['cube', 'cuboid', 'prism', 'pyramid', 'sphere', 'cylinder', 'cone', 'tetrahedron', 'octahedron', 'dodecahedron', 'icosahedron', 'frustum', 'hemisphere'])
    expect(sizesOf('pyramid').map((s) => [s.key, s.value])).toEqual([['b', 4], ['h', 6]])
    expect(sizesOf('cuboid').map((s) => s.key)).toEqual(['l', 'w', 'h'])
    for (const k of SOLID_KINDS) expect(sizesOf(k).length, k).toBeGreaterThan(0)
  })

  it('stands on the floor with the centre of its base at `at`, whatever kind', () => {
    for (const k of SOLID_KINDS) {
      const s = solidShape(k, {}, [1, 2, 0.5])
      const zs = s.vertices.map((v) => v[2])
      near(Math.min(...zs), 0.5)
      const xs = s.vertices.map((v) => v[0])
      const ys = s.vertices.map((v) => v[1])
      near((Math.min(...xs) + Math.max(...xs)) / 2, 1)
      near((Math.min(...ys) + Math.max(...ys)) / 2, 2)
    }
  })

  it('a cube of side 2: volume 8, area 24, 12 edges, height 2', () => {
    const s = solidShape('cube', { a: 2 }, [0, 0, 0])
    near(s.volume, 8)
    near(s.area, 24)
    expect(s.edges).toHaveLength(12)
    near(s.height, 2)
  })

  it('a square pyramid 4 by 6: V = 32, A = 16 + 8√10, apex above the base centre, 8 edges', () => {
    const s = solidShape('pyramid', { b: 4, h: 6 }, [0, 0, 0])
    near(s.volume, 32)
    near(s.area, 16 + 2 * 4 * Math.sqrt(4 + 36))
    expect(s.edges).toHaveLength(8)
    expect(s.top).toEqual([0, 0, 6])
  })

  it('round solids show their rims, not every facet: a cylinder two circles, a cone one, a sphere its equator', () => {
    const cyl = solidShape('cylinder', { r: 1, h: 2 }, [0, 0, 0])
    near(cyl.volume, 2 * Math.PI)
    // Two rims of 32 segments each: no seam lines down the side.
    expect(cyl.edges).toHaveLength(64)
    expect(solidShape('cone', { r: 1, h: 2 }, [0, 0, 0]).edges).toHaveLength(32)
    const sphere = solidShape('sphere', { r: 3 }, [0, 0, 0])
    near(sphere.volume, 36 * Math.PI)
    near(sphere.area, 36 * Math.PI)
    expect(sphere.edges.length).toBeGreaterThan(0)
    for (const [a, b] of sphere.edges) {
      near(a[2], 3)
      near(b[2], 3)
    }
  })

  it('a Platonic solid shows every edge: the icosahedron 30, the dodecahedron 30, the octahedron 12', () => {
    expect(solidShape('icosahedron', {}, [0, 0, 0]).edges).toHaveLength(30)
    expect(solidShape('dodecahedron', {}, [0, 0, 0]).edges).toHaveLength(30)
    expect(solidShape('octahedron', {}, [0, 0, 0]).edges).toHaveLength(12)
  })

  it('every polyhedron’s volume, worked out from its own faces, is the volume it states (the dodecahedron was rebuilt)', () => {
    for (const k of ['cube', 'cuboid', 'prism', 'pyramid', 'tetrahedron', 'octahedron', 'dodecahedron', 'icosahedron'] as const) {
      const s = solidShape(k, {}, [0, 0, 0])
      const c = s.vertices.reduce((m, v) => [m[0] + v[0] / s.vertices.length, m[1] + v[1] / s.vertices.length, m[2] + v[2] / s.vertices.length], [0, 0, 0])
      let vol = 0
      for (const f of s.faces) {
        for (let i = 1; i + 1 < f.length; i++) {
          const [a, b, d] = [s.vertices[f[0]], s.vertices[f[i]], s.vertices[f[i + 1]]].map((p) => [p[0] - c[0], p[1] - c[1], p[2] - c[2]])
          vol += (a[0] * (b[1] * d[2] - b[2] * d[1]) - a[1] * (b[0] * d[2] - b[2] * d[0]) + a[2] * (b[0] * d[1] - b[1] * d[0])) / 6
        }
      }
      expect(Math.abs(vol), k).toBeCloseTo(s.volume, 9)
    }
  })

  it('a size of zero or below, or not a number, is refused in words', () => {
    expect(() => solidShape('cube', { a: 0 }, [0, 0, 0])).toThrow(/side a must be more than 0/)
    expect(() => solidShape('cone', { r: 1, h: Number.NaN }, [0, 0, 0])).toThrow(/height h must be more than 0/)
  })

  it('a plane through three points is drawn as a sheet round them: four corners on the plane, every point inside', () => {
    const pts: [number, number, number][] = [[0, 0, 0], [2, 0, 0], [0, 2, 2]]
    const sheet = planeSheet(pts[0], pts[1], pts[2])
    expect(sheet).toHaveLength(4)
    const n = [0, -1, 1]
    for (const c of sheet) expect(c[0] * n[0] + c[1] * n[1] + c[2] * n[2]).toBeCloseTo(0, 9)
    const xs = sheet.map((c) => c[0])
    expect(Math.min(...xs)).toBeLessThan(0)
    expect(Math.max(...xs)).toBeGreaterThan(2)
  })

  it('the handles sit on the base edge (size) and on the top (height)', () => {
    const s = solidShape('cylinder', { r: 2, h: 5 }, [1, 0, 0])
    expect(s.sizeHandle).toEqual([3, 0, 0])
    expect(s.top).toEqual([1, 0, 5])
  })
})

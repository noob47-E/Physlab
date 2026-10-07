import { describe, expect, it } from 'vitest'
import { classifyPolygon, interiorAngles, recognizeStroke } from '../src/renderer/src/math/shapes'
import { sketchSnap, snapToGrid } from '../src/renderer/src/render/gridMath'
import { decompose } from '../src/renderer/src/math/decompose'
import { polygonArea, polygonPlane, signedArea2D } from '../src/renderer/src/math/geometry'
import { angleBetween, dist, dot, sub, type V3 } from '../src/renderer/src/math/vec'
import { pointAtAngle, pointAtLength } from '../src/renderer/src/math/setMeasure'

const P = (...xy: number[]): V3[] => {
  const out: V3[] = []
  for (let i = 0; i < xy.length; i += 2) out.push([xy[i], xy[i + 1], 0])
  return out
}

/** Deterministic pseudo-random noise. */
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647 - 0.5
  }
}

function strokeAround(corners: V3[], noise: number, perSide = 30, seed = 7): V3[] {
  const r = rng(seed)
  const out: V3[] = []
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i]
    const b = corners[(i + 1) % corners.length]
    for (let k = 0; k < perSide; k++) {
      const t = k / perSide
      out.push([a[0] + (b[0] - a[0]) * t + r() * noise, a[1] + (b[1] - a[1]) * t + r() * noise, 0])
    }
  }
  out.push([corners[0][0] + r() * noise, corners[0][1] + r() * noise, 0])
  return out
}

describe('classifyPolygon', () => {
  it('names quadrilaterals', () => {
    expect(classifyPolygon(P(0, 0, 4, 0, 4, 4, 0, 4)).kind).toBe('square')
    expect(classifyPolygon(P(0, 0, 5, 0, 5, 3, 0, 3)).kind).toBe('rectangle')
    expect(classifyPolygon(P(0, 0, 4, 0, 6, 3, 2, 3)).kind).toBe('parallelogram')
    expect(classifyPolygon(P(0, 0, 3, 4, 8, 4, 5, 0)).kind).toBe('rhombus')
    expect(classifyPolygon(P(0, 0, 6, 0, 4, 3, 2, 3)).kind).toBe('isosceles-trapezium')
    expect(classifyPolygon(P(0, 0, 6, 0, 5, 3, 1, 3.5)).kind).toBe('polygon')
    expect(classifyPolygon(P(0, 0, 2, -1, 5, 0, 2, 1)).kind).toBe('kite')
  })
  it('names triangles and regular polygons', () => {
    expect(classifyPolygon(P(0, 0, 4, 0, 0, 3)).kind).toBe('right-triangle')
    expect(classifyPolygon(P(0, 0, 2, 0, 1, Math.sqrt(3))).kind).toBe('equilateral-triangle')
    const hex = Array.from({ length: 6 }, (_, k) => [Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3), 0] as V3)
    expect(classifyPolygon(hex).name).toBe('Regular hexagon')
    expect(classifyPolygon(P(0, 0, 4, 0, 4, 2, 2, 2, 2, 4, 0, 4)).convex).toBe(false)
  })
})

describe('recognizeStroke', () => {
  it('recognises a rough square and snaps it', () => {
    const r = recognizeStroke(strokeAround(P(0, 0, 4, 0, 4, 4, 0, 4), 0.25), { gridStep: 1 })
    expect(r.kind).toBe('polygon')
    if (r.kind === 'polygon') {
      expect(r.label).toBe('Square')
      expect(polygonArea(r.pts)).toBeCloseTo(16)
    }
  })
  it('recognises a rough rectangle', () => {
    const r = recognizeStroke(strokeAround(P(0, 0, 6, 0, 6, 3, 0, 3), 0.2, 30, 3), { gridStep: 1 })
    expect(r.kind === 'polygon' && r.label).toBe('Rectangle')
    if (r.kind === 'polygon') expect(polygonArea(r.pts)).toBeCloseTo(18)
  })
  it('recognises a wobbly circle', () => {
    const noise = rng(11)
    const pts: V3[] = Array.from({ length: 120 }, (_, k) => {
      const t = (k / 119) * Math.PI * 2
      const rr = 3 + noise() * 0.25
      return [2 + rr * Math.cos(t), 1 + rr * Math.sin(t), 0]
    })
    const r = recognizeStroke(pts, { gridStep: 1 })
    expect(r.kind).toBe('circle')
    if (r.kind === 'circle') {
      expect(r.r).toBe(3)
      expect(r.center).toEqual([2, 1, 0])
    }
  })
  it('recognises a triangle and a straight line', () => {
    const t = recognizeStroke(strokeAround(P(0, 0, 6, 0, 0, 4), 0.15, 40, 5), { gridStep: 1 })
    expect(t.kind === 'polygon' && t.label).toBe('Right-angled triangle')
    const line = Array.from({ length: 50 }, (_, k) => [k * 0.1, k * 0.05 + (k % 3) * 0.01, 0] as V3)
    expect(recognizeStroke(line, { gridStep: 0.5 }).kind).toBe('segment')
  })

  it('snaps a sketch to the grid that is drawn, not to invisible squares', () => {
    // On isometric paper (minor step 1) a triangle's corners land on lattice points; the apex
    // sits at a height of 3·√3/2, which a square step of 1 would have rounded to 3.
    const apex: V3 = [1.5, (3 * Math.sqrt(3)) / 2, 0]
    const t = recognizeStroke(strokeAround([[0, 0, 0], [4, 0, 0], apex], 0.1, 40, 5), sketchSnap('isometric', 5, 1))
    expect(t.kind).toBe('polygon')
    if (t.kind !== 'polygon') return
    for (const c of t.pts) expect(dist(snapToGrid('isometric', c, 5, 1), c)).toBeLessThan(1e-9)
    expect(t.pts.some((c) => Math.abs(c[1] - apex[1]) < 1e-9)).toBe(true)
    // Square styles keep rounding to the snap step, halved with Fine.
    expect(sketchSnap('lines', 5, 1)).toEqual({ gridStep: 1 })
    expect(sketchSnap('fine', 5, 1)).toEqual({ gridStep: 0.5 })
    // Polar crossings spread apart: a corner far from one stays where it was drawn.
    const polar = sketchSnap('polar', 5, 1)
    expect(polar.gridStep).toBe(0)
    expect(polar.snapPoint!([4.4, 1.9, 0])).toEqual([4.4, 1.9, 0])
    expect(polar.snapPoint!([3.05, 0.02, 0])).toEqual([3, 0, 0])
  })
})

describe('decompose', () => {
  it('splits an L-shape into two rectangles', () => {
    const L = P(0, 0, 4, 0, 4, 2, 2, 2, 2, 4, 0, 4)
    const d = decompose(L)
    expect(d.parts).toHaveLength(2)
    expect(d.parts.every((p) => p.cls.kind === 'rectangle' || p.cls.kind === 'square')).toBe(true)
    expect(d.parts.reduce((s, p) => s + p.area, 0)).toBeCloseTo(polygonArea(L))
    expect(d.cuts).toHaveLength(1)
  })
  it('splits a house into a rectangle and a triangle', () => {
    const house = P(0, 0, 4, 0, 4, 3, 2, 5, 0, 3)
    const d = decompose(house)
    expect(d.parts).toHaveLength(2)
    const kinds = d.parts.map((p) => p.cls.kind).sort()
    expect(kinds).toContain('rectangle')
    expect(kinds.some((k) => k.includes('triangle'))).toBe(true)
    expect(d.parts.reduce((s, p) => s + p.area, 0)).toBeCloseTo(polygonArea(house))
  })
  it('leaves a simple rectangle alone', () => {
    expect(decompose(P(0, 0, 3, 0, 3, 2, 0, 2)).parts).toHaveLength(1)
  })
  it('splits a right trapezium into a rectangle and a right triangle, with a new corner', () => {
    const trap = P(0, 0, 5, 0, 5, 5, 0, 1)
    const d = decompose(trap)
    expect(d.parts).toHaveLength(2)
    expect(d.parts.map((p) => p.cls.kind).sort()).toEqual(['rectangle', 'right-triangle'])
    expect(d.parts.find((p) => p.cls.kind === 'rectangle')?.area).toBeCloseTo(5)
    expect(d.parts.reduce((s, p) => s + p.area, 0)).toBeCloseTo(polygonArea(trap))
    // The cut needs a point that is not a corner of the trapezium.
    expect(d.newPoints).toHaveLength(1)
    expect(d.newPoints[0][0]).toBeCloseTo(5)
    expect(d.newPoints[0][1]).toBeCloseTo(1)
    expect(d.alternatives).toBeGreaterThan(1)
  })
  it('splits an isosceles trapezium and a parallelogram into basic shapes', () => {
    for (const shape of [P(0, 0, 6, 0, 4, 2, 1, 2), P(0, 0, 4, 0, 6, 3, 2, 3)]) {
      const d = decompose(shape)
      expect(d.parts.length).toBeGreaterThan(1)
      expect(d.parts.every((p) => /rectangle|square|triangle/.test(p.cls.kind))).toBe(true)
      expect(d.parts.reduce((s, p) => s + p.area, 0)).toBeCloseTo(polygonArea(shape))
    }
  })
  it('keeps the trapezium whole when any formula shape is allowed, and cycles other ways', () => {
    const trap = P(0, 0, 5, 0, 5, 5, 0, 1)
    expect(decompose(trap, 'formula').parts).toHaveLength(1)
    const first = decompose(trap).parts.map((p) => p.cls.kind).join()
    const second = decompose(trap, 'basic', 1).parts.map((p) => p.cls.kind).join()
    expect(second).not.toBe(first)
  })
})

describe('driving a drawing from its measurements', () => {
  it('moves the far end so the length is what was typed', () => {
    const a: V3 = [0, 0, 0]
    const b: V3 = [3, 4, 0]
    const moved = pointAtLength(a, b, 10)!
    expect(dist(a, moved)).toBeCloseTo(10, 9)
    // It slid along the line it was already on, so the drawing keeps its shape.
    expect(moved[0]).toBeCloseTo(6, 9)
    expect(moved[1]).toBeCloseTo(8, 9)
  })

  it('refuses a length it cannot give', () => {
    expect(pointAtLength([0, 0, 0], [0, 0, 0], 5)).toBeNull()
    expect(pointAtLength([0, 0, 0], [1, 0, 0], 0)).toBeNull()
    expect(pointAtLength([0, 0, 0], [1, 0, 0], NaN)).toBeNull()
  })

  it('turns the free arm to the angle that was typed, keeping its length', () => {
    const vertex: V3 = [1, 1, 0]
    const fixed: V3 = [4, 1, 0]
    const moving: V3 = [1, 3, 0]
    const wanted = Math.PI / 6
    const turned = pointAtAngle(vertex, fixed, moving, wanted)!
    expect(angleBetween(sub(fixed, vertex), sub(turned, vertex))).toBeCloseTo(wanted, 9)
    // The arm is the same length as it was; only its direction changed.
    expect(dist(vertex, turned)).toBeCloseTo(dist(vertex, moving), 9)
  })

  it('keeps a flat drawing flat', () => {
    const turned = pointAtAngle([0, 0, 0], [2, 0, 0], [0, 2, 0], Math.PI / 3)!
    expect(turned[2]).toBeCloseTo(0, 12)
  })

  it('still turns an arm that is folded back on the other one', () => {
    // The two arms point the same way, so there is no plane between them to turn in.
    const turned = pointAtAngle([0, 0, 0], [2, 0, 0], [1, 0, 0], Math.PI / 2)
    expect(turned).not.toBeNull()
    expect(angleBetween([2, 0, 0], sub(turned!, [0, 0, 0]))).toBeCloseTo(Math.PI / 2, 9)
  })
})

describe('shapes in 3-D (P15)', () => {
  // A shape standing up or leaning in space is the same shape as when it lies on the page: its
  // name, corner angles and area belong to its own plane. They used to be read from above (x and
  // y only), so an upright 2 × 2 square looked like a line and was called an isosceles triangle.
  const c30 = Math.cos(Math.PI / 6)
  const s30 = Math.sin(Math.PI / 6)
  const squares: [string, V3[]][] = [
    ['standing in the x–z plane', [[0, 0, 0], [2, 0, 0], [2, 0, 2], [0, 0, 2]]],
    ['standing in the y–z plane', [[0, 0, 0], [0, 2, 0], [0, 2, 2], [0, 0, 2]]],
    ['tilted 30° about the x axis', [[0, 0, 0], [2, 0, 0], [2, 2 * c30, 2 * s30], [0, 2 * c30, 2 * s30]]],
    // Sides along (1, 2, 2)/3 and (2, 1, −2)/3: seen from above it is a rhombus, not a square.
    ['leaning on a slant', [[0, 0, 0], [2 / 3, 4 / 3, 4 / 3], [2, 2, 0], [4 / 3, 2 / 3, -4 / 3]]],
    ['lying flat at height 1', [[0, 0, 1], [2, 0, 1], [2, 2, 1], [0, 2, 1]]]
  ]
  for (const [where, square] of squares) {
    for (const [order, pts] of [['in order', square], ['in reverse order', [...square].reverse()]] as const) {
      it(`a 2 × 2 square ${where}, corners ${order}, is a Square of area 4 with four right angles`, () => {
        expect(classifyPolygon(pts).name).toBe('Square')
        expect(polygonArea(pts)).toBeCloseTo(4, 12)
        const angles = interiorAngles(pts)
        expect(angles).toHaveLength(4)
        for (const a of angles) expect(a).toBeCloseTo(Math.PI / 2, 12)
      })
    }
  }

  it('the triangle (1, 0, 0), (0, 1, 0), (0, 0, 1) is equilateral: three angles of π/3 and area √3/2', () => {
    const t: V3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
    expect(classifyPolygon(t).name).toBe('Equilateral triangle')
    const angles = interiorAngles(t)
    expect(angles).toHaveLength(3)
    for (const a of angles) expect(a).toBeCloseTo(Math.PI / 3, 12)
    expect(polygonArea(t)).toBeCloseTo(Math.sqrt(3) / 2, 12)
  })

  it('an L-shaped hexagon standing in the x–z plane keeps its reflex corner of 3π/2, either way round', () => {
    const L: V3[] = [[0, 0, 0], [4, 0, 0], [4, 0, 2], [2, 0, 2], [2, 0, 4], [0, 0, 4]]
    const q = Math.PI / 2
    const expected = [q, q, q, 3 * q, q, q]
    const cases: [V3[], number[]][] = [[L, expected], [[...L].reverse(), [...expected].reverse()]]
    for (const [pts, want] of cases) {
      expect(classifyPolygon(pts).name).toBe('Concave hexagon')
      const angles = interiorAngles(pts)
      expect(angles).toHaveLength(6)
      angles.forEach((a, i) => expect(a).toBeCloseTo(want[i], 12))
    }
  })

  it('a square of side 0.00001 is still a Square: whether a corner is in line does not depend on size', () => {
    const s = 1e-5
    expect(classifyPolygon([[0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0]]).name).toBe('Square')
  })

  it('corners that are not in one plane get no flat name, and a sentence that says why', () => {
    const quad = classifyPolygon([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 1]])
    expect(quad.kind).toBe('skew')
    expect(quad.name).toBe('Skew quadrilateral')
    expect(quad.n).toBe(4)
    expect(quad.convex).toBe(false)
    expect(quad.rectilinear).toBe(false)
    // One plain sentence: a capital at the start, a full stop at the end and none in between.
    expect(quad.notAShape).toMatch(/^[A-Z][^.!?]*\.$/)
    const five = classifyPolygon([[0, 0, 0], [2, 0, 0], [3, 1, 0], [1, 2, 1], [-1, 1, 0]])
    expect(five.kind).toBe('skew')
    expect(five.name).toBe('Skew pentagon')
    expect(five.notAShape).toBe(quad.notAShape)
    // A flat shape carries no such sentence.
    expect(classifyPolygon([[0, 0, 0], [2, 0, 0], [2, 0, 2], [0, 0, 2]]).notAShape).toBeUndefined()
  })

  it('flat to within rounding is flat: a corner 0.00000001 out of plane, or tilted corners typed to 3 decimals', () => {
    expect(classifyPolygon([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 1e-8]]).name).toBe('Square')
    expect(classifyPolygon([[0, 0, 0], [2, 0, 0], [2, 1.732, 1], [0, 1.732, 1]]).name).toBe('Square')
    // A regular hexagon of radius 2, first corner at 25°, tilted 30° about the x axis. Rounded to
    // 3 decimals its corners really are lifted off one plane (about 0.0003; a parallelogram, or
    // this hexagon started at 0°, rounds symmetrically and stays exactly flat).
    const r3 = (x: number) => Math.round(x * 1000) / 1000
    const hex = Array.from({ length: 6 }, (_, k): V3 => {
      const t = ((25 + 60 * k) * Math.PI) / 180
      return [r3(2 * Math.cos(t)), r3(2 * Math.sin(t) * c30), r3(2 * Math.sin(t) * s30)]
    })
    const plane = polygonPlane(hex)!
    expect(Math.max(...hex.map((p) => Math.abs(dot(sub(p, plane.origin), plane.normal))))).toBeGreaterThan(1e-4)
    expect(classifyPolygon(hex).name).toBe('Regular hexagon')
  })

  it('polygonPlane lays corners flat in their own plane: lengths kept, anticlockwise either way round', () => {
    const leaning: V3[] = [[0, 0, 0], [2 / 3, 4 / 3, 4 / 3], [2, 2, 0], [4 / 3, 2 / 3, -4 / 3]]
    for (const pts of [leaning, [...leaning].reverse()]) {
      const plane = polygonPlane(pts)!
      expect(plane.planar).toBe(true)
      expect(plane.flat.every((p) => p[2] === 0)).toBe(true)
      pts.forEach((p, i) => expect(dist(plane.flat[i], plane.flat[(i + 1) % 4])).toBeCloseTo(dist(p, pts[(i + 1) % 4]), 12))
      expect(signedArea2D(plane.flat)).toBeCloseTo(4, 12)
    }
    expect(polygonPlane([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 1]])!.planar).toBe(false)
    // Corners on one line have no plane to lie in.
    expect(polygonPlane([[0, 0, 0], [0, 0, 1], [0, 0, 3]])).toBeNull()
  })
})

describe('shapes that are not simple polygons (H4, H5)', () => {
  it('a crossed (bow-tie) quadrilateral is named crossed, not "Concave quadrilateral", and says why', () => {
    for (const pts of [P(0, 0, 2, 2, 2, 0, 0, 2), P(0, 0, 4, 3, 4, 0, 0, 1)]) {
      const c = classifyPolygon(pts)
      expect(c.kind).toBe('crossed')
      expect(c.name).toBe('Crossed quadrilateral')
      expect(c.convex).toBe(false)
      expect(c.notAShape).toMatch(/^[A-Z][^.!?]*\.$/)
      expect(c.notAShape).toMatch(/cross/)
    }
    // Upright in the x–z plane, the two loops of equal size (no Newell normal at all).
    expect(classifyPolygon([[0, 0, 0], [2, 0, 2], [2, 0, 0], [0, 0, 2]]).kind).toBe('crossed')
    expect(classifyPolygon(P(0, 0, 4, 0, 4, 2, 2, -1, 0, 2)).name).toBe('Crossed pentagon')
  })

  it('a concave shape and a shape whose corner touches a side are not crossed', () => {
    expect(classifyPolygon(P(0, 0, 4, 0, 4, 4, 2, 1, 0, 4)).name).toBe('Concave pentagon')
    expect(classifyPolygon(P(0, 0, 4, 0, 4, 3, 0, 3)).name).toBe('Rectangle')
  })

  it('three corners on one line are no triangle', () => {
    for (const pts of [P(0, 0, 1, 0, 2, 0), P(0, 0, 3, 3, 1, 1), P(0, 0, 1, 0, 2, 0, 3, 0)]) {
      const c = classifyPolygon(pts)
      expect(c.kind).toBe('degenerate')
      expect(c.name).toBe('Corners in a line')
      expect(c.notAShape).toMatch(/^[A-Z][^.!?]*\.$/)
    }
    expect(classifyPolygon([[0, 0, 0], [0, 0, 1], [0, 0, 3]]).kind).toBe('degenerate')
    // Two corners on top of each other leave a line too.
    expect(classifyPolygon(P(0, 0, 2, 0, 2, 0)).kind).toBe('degenerate')
    // A thin triangle that really is one stays a triangle.
    expect(classifyPolygon(P(0, 0, 1, 0, 0.5, 0.0001)).kind).toBe('isosceles-triangle')
  })
})

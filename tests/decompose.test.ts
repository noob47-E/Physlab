// Splitting a composite shape into pieces with known area formulas. The pieces must tile the
// shape exactly — no gap, no overlap — or the "A = A1 + A2" line under the drawing is a lie.

import { describe, expect, it } from 'vitest'
import { decompose, type DecomposeGoal } from '../src/renderer/src/math/decompose'
import { polygonArea } from '../src/renderer/src/math/geometry'
import type { V3 } from '../src/renderer/src/math/vec'

const P = (...xy: number[]): V3[] => {
  const out: V3[] = []
  for (let i = 0; i < xy.length; i += 2) out.push([xy[i], xy[i + 1], 0])
  return out
}

const unitSquare = P(0, 0, 1, 0, 1, 1, 0, 1)
/** An L: a 4×4 square with the top-right 2×2 corner missing. Area 12. */
const ell = P(0, 0, 4, 0, 4, 2, 2, 2, 2, 4, 0, 4)
/** A right trapezium: bottom 6, top 4, height 3. Area 15. */
const rightTrap = P(0, 0, 6, 0, 4, 3, 0, 3)

const centroid = (pts: V3[]): V3 => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length, 0]

/** Ray casting, the same test decompose uses for its own diagonals. */
function inside(p: V3, pts: V3[]): boolean {
  let hit = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit
  }
  return hit
}

/**
 * The parts add up to the whole, every part is a real piece of it, and no two parts overlap.
 * The area sum alone cannot tell an overlap from a gap of the same size, so each part's centre
 * must sit inside the original shape and outside every other part (the parts are convex, so
 * the centre of one inside another means the two share area).
 */
function tiles(pts: V3[], goal: DecomposeGoal, index = 0) {
  const d = decompose(pts, goal, index)
  const total = d.parts.reduce((s, p) => s + p.area, 0)
  expect(total).toBeCloseTo(polygonArea(pts), 9)
  for (const part of d.parts) {
    expect(part.area).toBeGreaterThan(0)
    expect(part.area).toBeCloseTo(polygonArea(part.pts), 12)
    expect(part.pts.length).toBeGreaterThanOrEqual(3)
    expect(inside(centroid(part.pts), pts), 'part centre inside the shape').toBe(true)
    for (const other of d.parts) {
      if (other !== part) expect(inside(centroid(part.pts), other.pts), 'parts overlap').toBe(false)
    }
  }
  return d
}

describe('decompose', () => {
  it('leaves a unit square as one square of area 1 with nothing cut', () => {
    for (const goal of ['basic', 'formula'] as const) {
      const d = decompose(unitSquare, goal)
      expect(d.parts).toHaveLength(1)
      expect(d.parts[0].cls.kind).toBe('square')
      expect(d.parts[0].area).toBeCloseTo(1, 12)
      expect(d.cuts).toEqual([])
      expect(d.newPoints).toEqual([])
      expect(d.alternatives).toBe(1)
    }
  })

  it('leaves any triangle and any simple quadrilateral whole', () => {
    expect(decompose(P(0, 0, 4, 0, 1, 3), 'basic').parts).toHaveLength(1)
    expect(decompose(P(0, 0, 5, 0, 7, 3, 2, 3), 'formula').parts).toHaveLength(1)
    expect(decompose(P(0, 0, 5, 0, 7, 3, 2, 3), 'formula').parts[0].cls.kind).toBe('parallelogram')
  })

  it('cuts an L into two rectangles that add up to 12, with one cut line and no overlap', () => {
    const d = tiles(ell, 'basic')
    expect(d.parts).toHaveLength(2)
    expect(d.parts.every((p) => p.cls.kind === 'rectangle' || p.cls.kind === 'square')).toBe(true)
    expect(d.cuts).toHaveLength(1)
    // The cut runs from the inner corner to the far side, where it lands on a new point.
    expect(d.newPoints).toHaveLength(1)
    const [cutA, cutB] = d.cuts[0]
    expect([cutA, cutB].some((p) => Math.hypot(p[0] - 2, p[1] - 2) < 1e-9)).toBe(true)
    // More than one way to cut it, and every way tiles it.
    expect(d.alternatives).toBeGreaterThan(1)
    for (let i = 0; i < d.alternatives; i++) tiles(ell, 'basic', i)
  })

  it('cycles through the other ways and wraps the index round', () => {
    const first = decompose(ell, 'basic', 0)
    const wrapped = decompose(ell, 'basic', first.alternatives)
    const negative = decompose(ell, 'basic', -first.alternatives)
    expect(wrapped.parts.map((p) => p.area)).toEqual(first.parts.map((p) => p.area))
    expect(negative.parts.map((p) => p.area)).toEqual(first.parts.map((p) => p.area))
  })

  it('splits a right trapezium into a rectangle and a right triangle for the basic formulas, adding the dropped corner', () => {
    const d = tiles(rightTrap, 'basic')
    expect(d.parts.map((p) => p.cls.kind).sort()).toEqual(['rectangle', 'right-triangle'])
    expect(d.parts.map((p) => p.area).sort((a, b) => a - b)).toEqual([3, 12])
    // The foot of the perpendicular from the top-right corner is a new point.
    expect(d.newPoints).toHaveLength(1)
    expect(d.newPoints[0][0]).toBeCloseTo(4, 9)
    expect(d.newPoints[0][1]).toBeCloseTo(0, 9)
    expect(d.cuts).toHaveLength(1)
  })

  it('keeps a right trapezium whole once trapeziums have a formula', () => {
    const d = decompose(rightTrap, 'formula')
    expect(d.parts).toHaveLength(1)
    expect(d.parts[0].cls.kind).toBe('trapezium')
    expect(d.parts[0].area).toBeCloseTo(15, 12)
  })

  it('handles a concave arrow, a T and a U without inventing area', () => {
    const arrow = P(0, 0, 6, 0, 6, 2, 9, 2, 5, 5, 1, 2, 4, 2)
    const tee = P(0, 0, 6, 0, 6, 2, 4, 2, 4, 6, 2, 6, 2, 2, 0, 2)
    const cup = P(0, 0, 6, 0, 6, 4, 4, 4, 4, 1, 2, 1, 2, 4, 0, 4)
    for (const shape of [arrow, tee, cup]) {
      for (const goal of ['basic', 'formula'] as const) {
        const d = tiles(shape, goal)
        expect(d.parts.length).toBeGreaterThan(1)
      }
    }
    // A T is three rectangles at most, and the basic split finds the two-rectangle way.
    expect(tiles(tee, 'basic').parts).toHaveLength(2)
    expect(tiles(cup, 'basic').parts).toHaveLength(3)
  })

  it('gives the same pieces whichever way round the corners were drawn', () => {
    const cw = [...ell].reverse()
    const a = decompose(ell, 'basic')
    const b = decompose(cw, 'basic')
    expect(b.parts.map((p) => p.area).sort()).toEqual(a.parts.map((p) => p.area).sort())
    expect(b.alternatives).toBe(a.alternatives)
  })

  it('ignores a z coordinate and a repeated or collinear corner', () => {
    const lifted = ell.map(([x, y]) => [x, y, 2.5] as V3)
    expect(decompose(lifted, 'basic').parts.map((p) => p.area).sort()).toEqual(decompose(ell, 'basic').parts.map((p) => p.area).sort())
    const noisy = P(0, 0, 2, 0, 4, 0, 4, 2, 4, 2, 2, 2, 2, 4, 0, 4)
    const d = tiles(noisy, 'basic')
    expect(d.parts).toHaveLength(2)
  })

  it('does nothing sensible-looking with fewer than three distinct points', () => {
    expect(decompose([], 'basic').parts[0].area).toBe(0)
    expect(decompose(P(1, 1), 'basic').parts).toHaveLength(1)
    expect(decompose(P(0, 0, 1, 0), 'basic').parts[0].area).toBe(0)
    const line = decompose(P(0, 0, 1, 0, 2, 0), 'basic')
    expect(line.parts[0].area).toBe(0)
    expect(line.cuts).toEqual([])
  })

  it('tiles at any scale: a millimetre L and a kilometre L', () => {
    for (const k of [1e-3, 1e3, 1e5]) {
      const scaled = ell.map(([x, y]) => [x * k, y * k, 0] as V3)
      const d = decompose(scaled, 'basic')
      const total = d.parts.reduce((s, p) => s + p.area, 0)
      expect(total / (12 * k * k)).toBeCloseTo(1, 9)
      expect(d.parts).toHaveLength(2)
    }
  })

  it('tiles a shape drawn in the negative quadrant', () => {
    const shifted = ell.map(([x, y]) => [x - 10, y - 7, 0] as V3)
    const d = tiles(shifted, 'basic')
    expect(d.parts).toHaveLength(2)
    expect(d.cuts).toHaveLength(1)
  })

  it('every cut lies on the boundary of two different parts', () => {
    const d = decompose(rightTrap, 'basic')
    for (const [a, b] of d.cuts) {
      const touching = d.parts.filter((p) => p.pts.some((q) => Math.hypot(q[0] - a[0], q[1] - a[1]) < 1e-9) && p.pts.some((q) => Math.hypot(q[0] - b[0], q[1] - b[1]) < 1e-9))
      expect(touching.length).toBe(2)
    }
  })
})

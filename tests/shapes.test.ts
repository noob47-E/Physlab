import { describe, expect, it } from 'vitest'
import { classifyPolygon, recognizeStroke } from '../src/renderer/src/math/shapes'
import { decompose } from '../src/renderer/src/math/decompose'
import { polygonArea } from '../src/renderer/src/math/geometry'
import type { V3 } from '../src/renderer/src/math/vec'

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

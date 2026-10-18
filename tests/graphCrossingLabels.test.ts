// Crossing label rendering: when two curves intersect, only the intersection
// nearest the pointer should be shown to reduce visual clutter.

import { describe, expect, it } from 'vitest'
import { crossingLabelsToShow, type ScreenPoint } from '../src/renderer/src/render/crossingLabels'
import type { KeyPoint } from '../src/renderer/src/math/graphs'
import { keyPoints } from '../src/renderer/src/math/graphs'

describe('crossingLabelsToShow', () => {
  // Real key points from y = sin x
  const sinXKeys = keyPoints(Math.sin, -Math.PI, Math.PI, 100)

  // Combine keys with some intersection points for testing
  const combinedKeys: KeyPoint[] = [
    ...sinXKeys,
    // Add a few intersection points manually (where sin x ≈ cos x)
    { x: Math.PI / 4, y: Math.sin(Math.PI / 4), kind: 'intersection', kinds: ['intersection'] },
    { x: -3 * Math.PI / 4, y: Math.sin(-3 * Math.PI / 4), kind: 'intersection', kinds: ['intersection'] }
  ]

  it('shows all non-intersection labels when pointer is null', () => {
    const screenPoints: ScreenPoint[] = combinedKeys.map((k) => ({ x: k.x * 100, y: k.y * 100 }))
    const result = crossingLabelsToShow(combinedKeys, screenPoints, null, null)

    // All non-intersection labels should be shown
    const nonIntersectionIndices = combinedKeys
      .map((k, i) => (k.kind !== 'intersection' ? i : -1))
      .filter((i) => i >= 0)

    for (const idx of nonIntersectionIndices) {
      expect(result).toContain(idx)
    }

    // No intersection labels should be shown
    const intersectionIndices = combinedKeys
      .map((k, i) => (k.kind === 'intersection' ? i : -1))
      .filter((i) => i >= 0)
    intersectionIndices.forEach((idx) => {
      expect(result).not.toContain(idx)
    })
  })

  it('returns exactly 1 crossing label when pointer is near an intersection', () => {
    const screenPoints: ScreenPoint[] = combinedKeys.map((k) => ({ x: k.x * 100, y: k.y * 100 }))

    // Find the first intersection
    const firstIntersectionIdx = combinedKeys.findIndex((k) => k.kind === 'intersection')
    expect(firstIntersectionIdx).toBeGreaterThanOrEqual(0)

    // Put pointer near that intersection
    const pointer: ScreenPoint = {
      x: screenPoints[firstIntersectionIdx].x + 10,
      y: screenPoints[firstIntersectionIdx].y + 5
    }

    const result = crossingLabelsToShow(combinedKeys, screenPoints, pointer, null)

    // Should have non-intersection labels plus 1 intersection
    const nonIntersectionCount = combinedKeys.filter((k) => k.kind !== 'intersection').length
    const intersectionCount = result.filter((i) => combinedKeys[i].kind === 'intersection').length

    expect(intersectionCount).toBe(1)
    expect(result.filter((i) => combinedKeys[i].kind !== 'intersection').length).toBe(nonIntersectionCount)
  })

  it('preserves all non-intersection labels (roots, max, min, yIntercept)', () => {
    const keys: KeyPoint[] = [
      { x: 0, y: 0, kind: 'root', kinds: ['root'] },
      { x: Math.PI / 2, y: 1, kind: 'max', kinds: ['max'] },
      { x: Math.PI, y: 0, kind: 'root', kinds: ['root'] },
      { x: -Math.PI / 2, y: -1, kind: 'min', kinds: ['min'] },
      { x: 0.5, y: 0.5, kind: 'intersection', kinds: ['intersection'] }
    ]
    const screenPoints = keys.map((k) => ({ x: k.x * 100, y: k.y * 100 }))

    const result = crossingLabelsToShow(keys, screenPoints, null, null)

    // All non-intersection labels should be present
    expect(result).toContain(0) // root
    expect(result).toContain(1) // max
    expect(result).toContain(2) // root
    expect(result).toContain(3) // min

    // No intersection should be shown (pointer is null)
    expect(result).not.toContain(4)
  })

  it('shows nothing when pointer is far from all intersections', () => {
    const keys: KeyPoint[] = [
      { x: 0, y: 0, kind: 'root', kinds: ['root'] },
      { x: 1, y: 1, kind: 'intersection', kinds: ['intersection'] },
      { x: 2, y: 2, kind: 'intersection', kinds: ['intersection'] }
    ]
    const screenPoints = keys.map((k) => ({ x: k.x * 100, y: k.y * 100 }))

    // Put pointer far from all intersections
    const pointer: ScreenPoint = { x: 500, y: 500 }

    const result = crossingLabelsToShow(keys, screenPoints, pointer, null)

    // Only the root should be shown, no intersections
    expect(result).toContain(0) // root
    expect(result).not.toContain(1) // intersection 1
    expect(result).not.toContain(2) // intersection 2
  })

  it('shows selected intersection even when pointer is far away', () => {
    const keys: KeyPoint[] = [
      { x: 0, y: 0, kind: 'root', kinds: ['root'] },
      { x: 1, y: 1, kind: 'intersection', kinds: ['intersection'] },
      { x: 2, y: 2, kind: 'intersection', kinds: ['intersection'] }
    ]
    const screenPoints = keys.map((k) => ({ x: k.x * 100, y: k.y * 100 }))

    // Put pointer far away but select intersection at index 2
    const pointer: ScreenPoint = { x: 500, y: 500 }

    const result = crossingLabelsToShow(keys, screenPoints, pointer, 2)

    // Should show root and selected intersection
    expect(result).toContain(0) // root
    expect(result).toContain(2) // selected intersection
    expect(result).not.toContain(1) // other intersection
  })
})

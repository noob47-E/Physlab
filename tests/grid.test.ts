// The grid used to be built from a canvas that had no size yet: zero-length lines, cached as done,
// leaving the viewport black on the first open until something else asked for a new frame.

import { describe, expect, it } from 'vitest'
import { finiteArea, gridKey, needsGridRebuild, usableSize } from '../src/renderer/src/render/gridMath'

const area = (xMin: number, xMax: number, yMin: number, yMax: number) => ({ xMin, xMax, yMin, yMax })

describe('a frame before the canvas has a size', () => {
  it('is never usable', () => {
    expect(usableSize({ width: 0, height: 0 })).toBe(false)
    expect(usableSize({ width: 1200, height: 0 })).toBe(false)
    expect(usableSize({ width: 1, height: 1 })).toBe(false)
    expect(usableSize({ width: NaN, height: 800 })).toBe(false)
    expect(usableSize({ width: 1200, height: 800 })).toBe(true)
  })

  it('collapses the visible area to nothing, which is rejected', () => {
    // orthoBounds() with width = height = 0 gives exactly this.
    expect(finiteArea(area(0, 0, 0, 0))).toBe(false)
    expect(finiteArea(area(-12, 12, NaN, 9))).toBe(false)
    expect(finiteArea(area(-12, 12, -9, 9))).toBe(true)
  })
})

describe('deciding when to rebuild the grid', () => {
  const built = { key: gridKey(1, { width: 1200, height: 800 }), ...area(-24, 24, -16, 16) }

  it('leaves a grid alone while the view stays inside it', () => {
    expect(needsGridRebuild(built, area(-12, 12, -8, 8), built.key)).toBe(false)
  })

  it('rebuilds when the view moves outside what was built', () => {
    expect(needsGridRebuild(built, area(-30, 12, -8, 8), built.key)).toBe(true)
    expect(needsGridRebuild(built, area(-12, 12, -8, 20), built.key)).toBe(true)
  })

  it('rebuilds when the spacing changes', () => {
    expect(needsGridRebuild(built, area(-12, 12, -8, 8), gridKey(2, { width: 1200, height: 800 }))).toBe(true)
  })

  it('rebuilds when the panel is resized at the same spacing', () => {
    // Without the size in the key a panel that grew kept the grid it had when it was small.
    expect(needsGridRebuild(built, area(-12, 12, -8, 8), gridKey(1, { width: 1600, height: 800 }))).toBe(true)
  })

  it('always rebuilds over the empty cache a zero-size frame used to leave behind', () => {
    const poisoned = { key: gridKey(1, { width: 0, height: 0 }), ...area(0, 0, 0, 0) }
    expect(needsGridRebuild(poisoned, area(-12, 12, -8, 8), gridKey(1, { width: 1200, height: 800 }))).toBe(true)
  })
})

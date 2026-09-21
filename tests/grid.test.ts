// The grid used to be built from a canvas that had no size yet: zero-length lines, cached as done,
// leaving the viewport black on the first open until something else asked for a new frame.

import { describe, expect, it } from 'vitest'
import { finiteArea, gridKey, gridVertices, GRID_STYLES, needsGridRebuild, usableSize } from '../src/renderer/src/render/gridMath'
import { axisTitle, tickDecimals, tickText } from '../src/renderer/src/render/gridLabels'
import type { MeasureSettings } from '../src/renderer/src/math/format'
import { labelPoints } from '../src/renderer/src/math/graphs'
import type { V3 } from '../src/renderer/src/math/vec'

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
  const built = { key: gridKey(1, { width: 1200, height: 800 }, 50), ...area(-24, 24, -16, 16) }

  it('leaves a grid alone while the view stays inside it', () => {
    expect(needsGridRebuild(built, area(-12, 12, -8, 8), built.key)).toBe(false)
  })

  it('rebuilds when the view moves outside what was built', () => {
    expect(needsGridRebuild(built, area(-30, 12, -8, 8), built.key)).toBe(true)
    expect(needsGridRebuild(built, area(-12, 12, -8, 20), built.key)).toBe(true)
  })

  it('rebuilds when the spacing changes', () => {
    expect(needsGridRebuild(built, area(-12, 12, -8, 8), gridKey(2, { width: 1200, height: 800 }, 50))).toBe(true)
  })

  it('rebuilds when the panel is resized at the same spacing', () => {
    // Without the size in the key a panel that grew kept the grid it had when it was small.
    expect(needsGridRebuild(built, area(-12, 12, -8, 8), gridKey(1, { width: 1600, height: 800 }, 50))).toBe(true)
  })

  it('always rebuilds over the empty cache a zero-size frame used to leave behind', () => {
    const poisoned = { key: gridKey(1, { width: 0, height: 0 }, 1), ...area(0, 0, 0, 0) }
    expect(needsGridRebuild(poisoned, area(-12, 12, -8, 8), gridKey(1, { width: 1200, height: 800 }, 50))).toBe(true)
  })
})

describe('anchoring a graph name', () => {
  it('finds nothing to anchor to when the curve has no points', () => {
    // x² + y² = −1 has no solution in view: an empty segment list used to become [undefined],
    // and projecting that crashed the viewport on every frame.
    expect(labelPoints({ polylines: [], segments: [] })).toBeUndefined()
    expect(labelPoints({ polylines: [] })).toBeUndefined()
    expect(labelPoints({ polylines: [[]], segments: [] })).toBeUndefined()
  })

  it('uses the curve when there is one', () => {
    const a: V3 = [1, 2, 0]
    const b: V3 = [3, 4, 0]
    expect(labelPoints({ polylines: [[a, b]] })).toEqual([a, b])
    expect(labelPoints({ polylines: [], segments: [a, b] })).toEqual([a])
  })
})

describe('numbering the axes', () => {
  const grid: MeasureSettings = { decimals: 2, precisionMode: 'dp', unit: 'unit', unitPerSquare: 1, angleUnit: 'deg' }

  it('writes whole ticks without decimals and fractional ticks with just enough', () => {
    expect(tickText(2, 1, grid)).toBe('2')
    expect(tickText(-3, 1, grid)).toBe('−3')
    expect(tickText(0.5, 0.5, grid)).toBe('0.5')
    expect(tickText(0.75, 0.25, grid)).toBe('0.75')
    expect(tickText(0, 0.25, grid)).toBe('0')
  })

  it("follows the drawing's scale and unit, as the Measure panel does", () => {
    // 1 square = 2.5 cm: the tick at grid 2 is 5 cm, and the picture must say so.
    const cm: MeasureSettings = { ...grid, unit: 'cm', unitPerSquare: 2.5 }
    expect(tickText(2, 1, cm)).toBe('5')
    expect(tickText(1, 1, cm)).toBe('2.5')
    expect(tickText(0.5, 0.5, cm)).toBe('1.25')
    expect(axisTitle('x', cm)).toBe('x (cm)')
    expect(axisTitle('x', grid)).toBe('x')
  })

  it('ignores a significant-figures setting, which would number the axis 1.00, 2.00, 3.00', () => {
    const sf: MeasureSettings = { ...grid, precisionMode: 'sf', decimals: 3 }
    expect(tickText(2, 1, sf)).toBe('2')
    expect(tickText(0.5, 0.5, sf)).toBe('0.5')
  })

  it("never runs past the user's decimal places when the scale does not terminate", () => {
    // 1 square = 0.3333333 cm, typed into the scale box: the step needs seven decimals to be exact,
    // and the axis would read 0.3333333, 0.6666666… on every line.
    const thirds: MeasureSettings = { ...grid, unit: 'cm', unitPerSquare: 0.3333333, decimals: 2 }
    expect(tickText(1, 1, thirds)).toBe('0.33')
    expect(tickText(2, 1, thirds)).toBe('0.67')
    expect(tickText(3, 1, thirds)).toBe('1')
    // In significant-figures mode there is no number of decimals to lean on; four is the most.
    const sfThirds: MeasureSettings = { ...thirds, precisionMode: 'sf', decimals: 3 }
    expect(tickText(1, 1, sfThirds)).toBe('0.3333')
    // A setting of 0 decimal places still leaves one, or 0.5 and 1 would both read "1".
    expect(tickText(0.5, 0.5, { ...grid, decimals: 0 })).toBe('0.5')
  })

  it('never shows −0 or floating-point dust', () => {
    expect(tickText(-0, 1, grid)).toBe('0')
    expect(tickText(3 * 0.1, 0.1, grid)).toBe('0.3')
  })

  it('knows how many decimals a step needs', () => {
    expect(tickDecimals(1)).toBe(0)
    expect(tickDecimals(10)).toBe(0)
    expect(tickDecimals(0.5)).toBe(1)
    expect(tickDecimals(0.25)).toBe(2)
    expect(tickDecimals(2.5)).toBe(1)
    expect(tickDecimals(0)).toBe(0)
  })
})

describe('grid styles', () => {
  // A 4 × 3 area with a major line every 1 and a minor line every 0.25.
  const box = area(0, 4, 0, 3)
  const lines = (flat: number[]) => flat.length / 6
  const crossings = (minor: number) => (Math.floor(4 / minor) + 1) * (Math.floor(3 / minor) + 1)

  it('lines: a minor line at every minor step and a major one at every major step', () => {
    const v = gridVertices('lines', box, 1, 0.25)
    expect(lines(v.minor)).toBe(17 + 13)
    expect(lines(v.major)).toBe(5 + 4)
    expect(v.dots).toEqual([])
  })

  it('dots: one vertex per crossing of the minor grid and no lines at all', () => {
    const v = gridVertices('dots', box, 1, 0.25)
    expect(v.minor).toEqual([])
    expect(v.major).toEqual([])
    expect(v.dots.length / 3).toBe(crossings(0.25))
    // The first dot is the bottom-left crossing, at the given height.
    expect(v.dots.slice(0, 3)).toEqual([0, 0, 0])
    expect(gridVertices('dots', box, 1, 0.25, 0.5).dots[2]).toBe(0.5)
  })

  it('fine: halves the minor step and keeps the major lines', () => {
    const v = gridVertices('fine', box, 1, 0.25)
    expect(lines(v.minor)).toBe(33 + 25)
    expect(lines(v.major)).toBe(5 + 4)
  })

  it('paper: the same lines as lines (the tint is the canvas colour, not a vertex)', () => {
    expect(gridVertices('paper', box, 1, 0.25)).toEqual(gridVertices('lines', box, 1, 0.25))
  })

  it('puts every vertex at the asked-for height', () => {
    const v = gridVertices('lines', box, 1, 0.5, 2)
    for (let i = 2; i < v.minor.length; i += 3) expect(v.minor[i]).toBe(2)
  })

  it('changes the cache key with the style, so a switch rebuilds the grid', () => {
    const size = { width: 1200, height: 800 }
    const keys = new Set(GRID_STYLES.map((g) => gridKey(1, size, 50, g.id)))
    expect(keys.size).toBe(GRID_STYLES.length)
    expect(gridKey(1, size, 50)).toBe(gridKey(1, size, 50, 'lines'))
  })

  it('lists the four styles in the order every picker shows them, each with a plain hint', () => {
    expect(GRID_STYLES.map((g) => g.id)).toEqual(['lines', 'dots', 'fine', 'paper'])
    for (const g of GRID_STYLES) expect(g.hint.length).toBeGreaterThan(10)
  })
})

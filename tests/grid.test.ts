// The grid used to be built from a canvas that had no size yet: zero-length lines, cached as done,
// leaving the viewport black on the first open until something else asked for a new frame.

import { describe, expect, it } from 'vitest'
import { finiteArea, gridKey, needsGridRebuild, usableSize } from '../src/renderer/src/render/gridMath'
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

// The lab table: what gets worked out from what, and what reaches the graph.

import { describe, expect, it } from 'vitest'
import { addColumn, addRow, emptyTable, removeColumn, setCell } from '../src/renderer/src/lab/labStore'
import { headerOf, plotPairs, ratioUnit, resolveValues } from '../src/renderer/src/lab/values'
import { betterFit, fitOf, rankFits } from '../src/renderer/src/lab/fit'
import { chartSeries } from '../src/renderer/src/lab/chartData'
import type { LabTable } from '../src/renderer/src/lab/types'

/** A table of t and d with the readings filled in. */
function freeFall(): LabTable {
  const t = emptyTable('Free fall')
  const readings: [number, number][] = [
    [0.2, 0.196],
    [0.4, 0.784],
    [0.6, 1.766],
    [0.8, 3.138],
    [1.0, 4.905]
  ]
  return { ...t, rows: readings.map(([a, b]) => [a, b]) }
}

describe('working out a column from the others', () => {
  it('computes t² for every row', () => {
    const table = addColumn(freeFall(), { name: 'tsq', unit: 's²', formula: 't^2' })
    const { values, errors } = resolveValues(table)
    expect(errors).toEqual({})
    expect(values.map((r) => r[2])).toEqual([0.2, 0.4, 0.6, 0.8, 1].map((t) => t * t))
  })

  it('leaves a cell empty when a reading it needs is missing', () => {
    const base = addColumn(freeFall(), { name: 'tsq', formula: 't^2' })
    const blank = setCell(base, 2, 0, null)
    const { values } = resolveValues(blank)
    expect(values[2][2]).toBeNull()
    expect(values[3][2]).toBeCloseTo(0.64)
  })

  it('reports a formula it cannot read instead of throwing', () => {
    const bad = addColumn(freeFall(), { name: 'oops', formula: 't ^^ 2' })
    const { errors, values } = resolveValues(bad)
    expect(Object.keys(errors)).toHaveLength(1)
    expect(values.every((r) => r[2] === null)).toBe(true)
  })

  it('can only use the columns to its left, so a formula cannot depend on itself', () => {
    // "d" is to the right of this column, so it is not in scope and the column stays empty.
    const t = freeFall()
    const columns = [t.columns[0], { id: 'mid', name: 'q', unit: '', formula: 'd * 2' }, t.columns[1]]
    const table: LabTable = { ...t, columns, rows: t.rows.map(([a, b]) => [a, null, b]) }
    const { values } = resolveValues(table)
    expect(values.every((r) => r[1] === null)).toBe(true)
  })
})

describe('what reaches the graph', () => {
  it('pairs the two chosen columns and skips incomplete rows', () => {
    const table = setCell(addRow(freeFall()), 1, 1, null)
    const { xs, ys } = plotPairs(table, resolveValues(table))
    expect(xs).toEqual([0.2, 0.6, 0.8, 1])
    expect(ys).toHaveLength(4)
  })
})

describe('the table stays rectangular', () => {
  it('keeps every row the width of the columns when one is added or removed', () => {
    const added = addColumn(freeFall(), { name: 'v', unit: 'm/s' })
    expect(added.rows.every((r) => r.length === added.columns.length)).toBe(true)
    const removed = removeColumn(added, added.columns[1].id)
    expect(removed.columns).toHaveLength(2)
    expect(removed.rows.every((r) => r.length === 2)).toBe(true)
  })

  it('never removes the last column, and repoints the graph when it loses a column', () => {
    const one: LabTable = { ...freeFall(), columns: [freeFall().columns[0]], rows: [[1]] }
    expect(removeColumn(one, one.columns[0].id)).toBe(one)
    const t = freeFall()
    const gone = removeColumn(t, t.plot.x)
    expect(gone.columns.some((c) => c.id === gone.plot.x)).toBe(true)
  })
})

describe('units and headers', () => {
  it('divides the units the way a gradient does', () => {
    expect(ratioUnit('m', 's')).toBe('m/s')
    expect(ratioUnit('m/s', 's')).toBe('m/s/s')
    expect(ratioUnit('m', 'm')).toBe('')
    expect(ratioUnit('', '')).toBe('')
    expect(ratioUnit('', 's')).toBe('1/s')
  })

  it('writes a header the way a notebook does', () => {
    expect(headerOf({ id: 'a', name: 't', unit: 's' })).toBe('t / s')
    expect(headerOf({ id: 'a', name: 'n', unit: '' })).toBe('n')
  })
})

describe('fitting a shape through the readings', () => {
  const line = { xs: [1, 2, 3, 4, 5], ys: [5, 8, 11, 14, 17] } // y = 2 + 3x exactly

  it('finds the gradient and intercept of a straight line', () => {
    const fit = fitOf(line.xs, line.ys, 'linear')!
    expect(fit.slope).toBeCloseTo(3, 10)
    expect(fit.intercept).toBeCloseTo(2, 10)
    expect(fit.r2).toBeCloseTo(1, 10)
    expect(fit.residuals.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 10)
  })

  it('gets g back from free-fall readings', () => {
    // d = ½gt², so d against t² is a straight line of gradient g/2.
    const ts = [0.2, 0.4, 0.6, 0.8, 1]
    const xs = ts.map((t) => t * t)
    const ys = ts.map((t) => 0.5 * 9.81 * t * t)
    const fit = fitOf(xs, ys, 'linear')!
    expect(2 * fit.slope!).toBeCloseTo(9.81, 6)
  })

  it('scores a quadratic, which the calculator gives no r for', () => {
    const xs = [-2, -1, 0, 1, 2, 3]
    const ys = xs.map((x) => 4 - 3 * x + 2 * x * x)
    const fit = fitOf(xs, ys, 'quadratic')!
    expect(fit.r2).toBeCloseTo(1, 8)
    expect(fitOf(xs, ys, 'linear')!.r2).toBeLessThan(0.9)
  })

  it('ranks the shape that really fits first', () => {
    const xs = [1, 2, 3, 4, 5, 6]
    const quad = xs.map((x) => 1 + x * x)
    expect(rankFits(xs, quad)[0].shape).toBe('quadratic')
    expect(rankFits(line.xs, line.ys)[0].shape).toBe('linear')
  })

  it('offers a better shape only when it is clearly better', () => {
    const xs = [1, 2, 3, 4, 5, 6]
    const quad = xs.map((x) => 1 + x * x)
    const straight = fitOf(xs, quad, 'linear')!
    expect(betterFit(straight, rankFits(xs, quad))).not.toBeNull()
    // Readings that are already a good straight line should be left alone.
    const lineFit = fitOf(line.xs, line.ys, 'linear')!
    expect(betterFit(lineFit, rankFits(line.xs, line.ys))).toBeNull()
  })

  it('puts an uncertainty on a gradient read from scattered points', () => {
    const xs = [1, 2, 3, 4, 5]
    const exact = xs.map((x) => 2 * x)
    const scattered = [2.1, 3.9, 6.2, 7.8, 10.1]
    expect(fitOf(xs, exact, 'linear')!.slopeError).toBeCloseTo(0, 8)
    const s = fitOf(xs, scattered, 'linear')!.slopeError!
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThan(0.2)
  })

  it('refuses instead of inventing a fit when there is too little to go on', () => {
    expect(fitOf([1, 2], [3, 4], 'linear')).toBeNull()
    // A logarithm cannot take zero or a negative reading.
    expect(fitOf([0, 1, 2], [1, 2, 3], 'log')).toBeNull()
  })
})

describe('what the graph is handed', () => {
  const xs = [3, 1, 2]
  const ys = [30, 10, 20]

  it('puts the readings in order, and says so plainly when there is no fit', () => {
    const s = chartSeries(xs, ys, null)
    expect(s.x).toEqual([1, 2, 3])
    expect(s.points).toEqual([10, 20, 30])
    expect(s.curve).toEqual([])
  })

  it('gives the curve many more x values than the readings, without inventing readings', () => {
    const fit = fitOf([1, 2, 3, 4, 5], [2, 4, 6, 8, 10], 'linear')!
    const s = chartSeries([1, 2, 3, 4, 5], [2, 4, 6, 8, 10], fit)
    expect(s.x.length).toBeGreaterThan(100)
    // Exactly five real readings, the rest of the row is empty.
    expect(s.points.filter((p) => p !== null)).toEqual([2, 4, 6, 8, 10])
    expect(s.curve.every((c) => c !== null)).toBe(true)
    // The shared axis stays in order, which is what uPlot needs.
    expect([...s.x].sort((a, b) => a - b)).toEqual(s.x)
  })
})

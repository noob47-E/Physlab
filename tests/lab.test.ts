// The lab table: what gets worked out from what, and what reaches the graph.

import { describe, expect, it } from 'vitest'
import { addColumn, addRow, addUncertainty, emptyTable, removeColumn, setCell, setColumn } from '../src/renderer/src/lab/labStore'
import { headerOf, isUsableName, plotPairs, plotSeries, ratioUnit, resolveValues } from '../src/renderer/src/lab/values'
import { betterFit, fitOf, gradientRange, pmText, rankFits } from '../src/renderer/src/lab/fit'
import { chartSeries } from '../src/renderer/src/lab/chartData'
import { applyPaste, cellNumber, csvFileName, parseTable, toCsv } from '../src/renderer/src/lab/csv'
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

describe('uncertainties, once they are asked for', () => {
  it('puts the ± column beside its own column, in the same unit, with a name a formula can use', () => {
    const base = freeFall()
    const table = addUncertainty(base, base.columns[0].id)
    expect(table.columns.map((c) => c.name)).toEqual(['t', 't_u', 'd'])
    expect(table.columns[1].unit).toBe('s')
    expect(table.columns[1].uncertaintyFor).toBe(base.columns[0].id)
    expect(isUsableName(table.columns[1].name)).toBe(true)
    // Every row grew a cell in the right place, so the readings did not shift along.
    expect(table.rows[0]).toEqual([0.2, null, 0.196])
  })

  it('refuses to give one column two ± columns', () => {
    const base = freeFall()
    const once = addUncertainty(base, base.columns[0].id)
    expect(addUncertainty(once, base.columns[0].id)).toBe(once)
  })

  it('keeps the ± column named and measured like the column it describes', () => {
    const base = freeFall()
    const table = addUncertainty(base, base.columns[0].id)
    const renamed = setColumn(table, base.columns[0].id, { name: 'time', unit: 'ms' })
    expect(renamed.columns[1].name).toBe('time_u')
    expect(renamed.columns[1].unit).toBe('ms')
  })

  it('takes the ± column away with the reading it belonged to', () => {
    const base = freeFall()
    const table = addUncertainty(base, base.columns[0].id)
    const gone = removeColumn(table, base.columns[0].id)
    expect(gone.columns).toHaveLength(1)
    expect(gone.rows[0]).toEqual([0.196])
  })

  it('lines the bars up with the readings that were kept, not with the rows that were typed', () => {
    const base = freeFall()
    let table = addUncertainty(base, base.columns[1].id)
    // Uncertainties of 1, 2, 3, 4, 5 mm, then the middle reading is deleted.
    table = table.rows.reduce((acc, _r, i) => setCell(acc, i, 2, (i + 1) / 1000), table)
    table = setCell(table, 2, 0, null)
    const s = plotSeries(table, resolveValues(table))
    expect(s.xs).toEqual([0.2, 0.4, 0.8, 1])
    expect(s.yErr).toEqual([0.001, 0.002, 0.004, 0.005])
    expect(s.xErr).toEqual([])
  })

  it('treats a blank ± cell as no bar, not as a missing reading', () => {
    const base = freeFall()
    const table = setCell(addUncertainty(base, base.columns[1].id), 0, 2, 0.01)
    const s = plotSeries(table, resolveValues(table))
    expect(s.xs).toHaveLength(5)
    expect(s.yErr).toEqual([0.01, 0, 0, 0, 0])
  })
})

describe('writing a value with its uncertainty', () => {
  it('rounds both to the place the uncertainty supports', () => {
    expect(pmText(4.9053, 0.0612)).toBe('4.91 ± 0.06')
    expect(pmText(9.81234, 0.1)).toBe('9.8 ± 0.1')
    expect(pmText(1234.5, 60)).toBe('1235 ± 60')
  })

  it('says nothing about ± when the readings sit exactly on the line', () => {
    expect(pmText(3, 1e-16)).toBe('3')
    expect(pmText(3.25, undefined)).toBe('3.25')
  })

  it('writes a negative gradient with a real minus sign', () => {
    expect(pmText(-2.5, 0.12)).toBe('−2.5 ± 0.1')
  })
})

describe('the gradient a practical quotes, read off the error bars', () => {
  // y = 2x exactly, with a ± 0.5 bar on the first and last readings.
  const xs = [1, 2, 3, 4, 5]
  const ys = xs.map((x) => 2 * x)

  it('draws the steepest and shallowest lines through the bars', () => {
    const yErr = [0.5, 0, 0, 0, 0.5]
    const r = gradientRange(xs, ys, [], yErr)!
    // Steepest: (1, 1.5) to (5, 10.5) — a run of 4 and a rise of 9.
    expect(r.max).toBeCloseTo(9 / 4, 10)
    expect(r.min).toBeCloseTo(7 / 4, 10)
    expect(r.half).toBeCloseTo(0.25, 10)
  })

  it('lets a sideways bar tilt the line too', () => {
    const r = gradientRange(xs, ys, [0.5, 0, 0, 0, 0.5], [])!
    // The steepest line runs from x = 1.5 to x = 4.5: the same rise over a shorter run.
    expect(r.max).toBeCloseTo(8 / 3, 10)
    expect(r.min).toBeCloseTo(8 / 5, 10)
  })

  it('says nothing when there are no bars to read', () => {
    expect(gradientRange(xs, ys, [], [])).toBeNull()
    expect(gradientRange([1], [2], [], [0.1])).toBeNull()
  })

  it('refuses when the bars are so wide the readings overlap', () => {
    expect(gradientRange([1, 2], [2, 4], [3, 3], [])).toBeNull()
  })
})

describe('readings pasted in or read from a file', () => {
  it('reads a block copied out of a spreadsheet', () => {
    const p = parseTable('t / s\td / m\n0.2\t0.196\n0.4\t0.784\n')
    expect(p.header).toEqual([
      { name: 't', unit: 's' },
      { name: 'd', unit: 'm' }
    ])
    expect(p.rows).toEqual([
      [0.2, 0.196],
      [0.4, 0.784]
    ])
  })

  it('takes commas, semicolons and a caption written with brackets', () => {
    expect(parseTable('t (s),d (m)\n1,2').header).toEqual([
      { name: 't', unit: 's' },
      { name: 'd', unit: 'm' }
    ])
    // Where semicolons separate, a comma is a decimal point.
    expect(parseTable('0,2;1,5\n0,4;3,0').rows).toEqual([
      [0.2, 1.5],
      [0.4, 3]
    ])
  })

  it('knows readings from captions, and leaves a blank cell empty', () => {
    const p = parseTable('1,2,3\n4,,6')
    expect(p.header).toBeNull()
    expect(p.rows).toEqual([
      [1, 2, 3],
      [4, null, 6]
    ])
  })

  it('accepts the minus sign a word processor inserts, and rejects words', () => {
    expect(cellNumber('−2.5')).toBe(-2.5)
    expect(cellNumber('+3')).toBe(3)
    expect(cellNumber('1.2e-3')).toBe(0.0012)
    expect(cellNumber('about 4')).toBeNull()
    expect(cellNumber('')).toBeNull()
  })

  it('writes a CSV that reads back as the same numbers', () => {
    const t = addColumn(freeFall(), { name: 'tsq', unit: 's^2', formula: 't^2' })
    const csv = toCsv(t, resolveValues(t))
    expect(csv.split('\n')[0]).toBe('t / s,d / m,tsq / s^2')
    const back = parseTable(csv)
    expect(back.rows.map((r) => [r[0], r[1]])).toEqual(t.rows.map((r) => [r[0], r[1]]))
    // The computed column is written out too, since that is what goes in the report.
    expect(back.rows[4][2]).toBeCloseTo(1, 10)
  })

  it('grows the table to fit a wider block, and takes its captions when the table is empty', () => {
    const p = parseTable('t / s,v / m s^-1,F / N\n1,2,3\n2,4,6\n3,6,9')
    const grown = applyPaste(emptyTable('Trolley'), p)
    expect(grown.columns.map((c) => c.name)).toEqual(['t', 'v', 'F'])
    expect(grown.columns[1].unit).toBe('m s^-1')
    expect(grown.rows).toEqual([
      [1, 2, 3],
      [2, 4, 6],
      [3, 6, 9]
    ])
  })

  it('keeps the captions of a table that already has readings in it', () => {
    const p = parseTable('a,b\n7,8')
    const pasted = applyPaste(freeFall(), p)
    expect(pasted.columns.map((c) => c.name)).toEqual(['t', 'd'])
    expect(pasted.rows).toEqual([[7, 8]])
  })

  it('names the file after the experiment', () => {
    expect(csvFileName('Free fall')).toBe('Free-fall.csv')
    expect(csvFileName('  ')).toBe('lab-data.csv')
    expect(csvFileName('g: from d/t?')).toBe('g-from-dt.csv')
  })
})

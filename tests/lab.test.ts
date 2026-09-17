// The lab table: what gets worked out from what, and what reaches the graph.

import { describe, expect, it } from 'vitest'
import { addColumn, addRow, emptyTable, removeColumn, setCell } from '../src/renderer/src/lab/labStore'
import { headerOf, plotPairs, ratioUnit, resolveValues } from '../src/renderer/src/lab/values'
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

import { describe, expect, it } from 'vitest'
import { addUncertainty, emptyTable, removeColumn, setCell } from '../src/renderer/src/lab/labStore'
import { applyPaste, parseTable, toCsv } from '../src/renderer/src/lab/csv'
import { headerOf, resolveValues } from '../src/renderer/src/lab/values'
import { fitOf } from '../src/renderer/src/lab/fit'
import type { LabTable } from '../src/renderer/src/lab/types'

const setCellText = setCell as unknown as (t: LabTable, row: number, col: number, value: number | null, text?: string | null) => LabTable

describe('typed precision is kept', () => {
  it('stores the text a reading was typed with', () => {
    const t = setCellText(emptyTable('Free fall'), 0, 0, 0.2, '0.200')
    expect(t.reads?.[0][0]).toBe('0.200')
    expect(t.rows[0][0]).toBe(0.2)
  })

  it('writes that text to CSV rather than shortest-form formatting', () => {
    const t = setCellText(emptyTable('Free fall'), 0, 0, 0.2, '0.200')
    const csv = toCsv(t, resolveValues(t))
    expect(csv.split('\n')[1].split(',')[0]).toBe('0.200')
  })

  it('carries the recorded text through parseTable and applyPaste', () => {
    const p = parseTable('0.200,1.2\n')
    const t = applyPaste(emptyTable('Free fall'), p)
    expect(t.rows).toEqual([[0.2, 1.2]])
    expect(t.reads?.[0][0]).toBe('0.200')
  })
})

describe('r² is relative to the readings', () => {
  it('does not call a scattered set of tiny readings a perfect fit', () => {
    const xs = [1, 2, 3]
    const ys = [1e-7, 2e-7, 3.2e-7]
    const fit = fitOf(xs, ys, 'linear')!
    // Least-squares line through these three points: y ≈ -1.333e-8 + 1.1e-7 x.
    // ssTot = 2.4266667e-14, ssRes = 6.6666667e-17, so r² = 0.9972527.
    expect(fit.r2).toBeCloseTo(0.9972527472527473, 6)
    expect(fit.r2).toBeLessThan(1)
  })
})

describe('CSV parser respects quotes and BOM', () => {
  it('keeps separators inside quotes rather than splitting them', () => {
    const p = parseTable('"Time, t","Distance, d"\n1,2\n')
    expect(p.header).toEqual([
      { name: 'Time, t', unit: '' },
      { name: 'Distance, d', unit: '' }
    ])
    expect(p.rows).toEqual([[1, 2]])
  })

  it('strips a UTF-8 BOM before reading the caption row', () => {
    const p = parseTable('\uFEFFt / s,d / m\n1,2\n')
    expect(p.header).toEqual([
      { name: 't', unit: 's' },
      { name: 'd', unit: 'm' }
    ])
    expect(p.rows).toEqual([[1, 2]])
  })
})

describe('removing a column never leaves an empty table', () => {
  it('keeps the last real column when its only companion is its uncertainty', () => {
    const base = emptyTable('Free fall')
    const one: LabTable = { ...base, columns: [base.columns[0]], rows: [[null]] }
    const withUncertainty = addUncertainty(one, one.columns[0].id)
    expect(withUncertainty.columns).toHaveLength(2)

    const removed = removeColumn(withUncertainty, withUncertainty.columns[0].id)
    expect(removed.columns.length).toBeGreaterThan(0)
    expect(removed.columns[0].name).toBe(one.columns[0].name)
  })
})

describe('captions with spaces become labels', () => {
  it('keeps the caption as a display label and derives a formula-safe name', () => {
    const p = parseTable('Drop height (m),Distance (m)\n1,2\n')
    const t = applyPaste(emptyTable('Free fall'), p)

    expect(t.columns.map((c) => c.label)).toEqual(['Drop height', undefined])
    expect(t.columns.map((c) => c.name)).toEqual(['Drop_height', 'Distance'])
    expect(t.columns[0].unit).toBe('m')
    expect(headerOf(t.columns[0])).toBe('Drop height / m')
    expect(t.rows).toEqual([[1, 2]])
  })
})

// P9: a reading keeps the figures it was recorded with ("0.200", not "0.2") through display, CSV in
// and out, save/load and undo, while every sum still uses the number. The text sits in
// `LabTable.reads` beside `rows`; every operation that moves rows or columns must move it too, and
// a text that no longer reads back as its cell's number is never shown or exported.

import { beforeEach, describe, expect, it } from 'vitest'
import { addColumn, addRow, addUncertainty, emptyTable, removeColumn, removeRow, setCell, setColumn, setRows, useLab } from '../src/renderer/src/lab/labStore'
import { applyPaste, parseTable, toCsv } from '../src/renderer/src/lab/csv'
import { plotSeries, readTyped, resolveValues, shownCell } from '../src/renderer/src/lab/values'
import { FILE_VERSION, parseSceneFile } from '../src/renderer/src/core/migrate'
import { useScene } from '../src/renderer/src/core/store'
import type { LabTable } from '../src/renderer/src/lab/types'

const scene = () => useScene.getState()

/** A t, d table with three typed rows, each recorded with trailing zeros. */
function typed(): LabTable {
  let t = emptyTable('Drop')
  const cells: [number, number, string][] = [
    [0, 0, '0.100'], [0, 1, '0.050'],
    [1, 0, '0.200'], [1, 1, '0.200'],
    [2, 0, '0.300'], [2, 1, '0.450']
  ]
  for (const [r, c, text] of cells) t = setCell(t, r, c, Number(text), text)
  return t
}

const column = (t: LabTable, c: number): string[] => t.rows.map((_, r) => shownCell(t, r, c))
const csvColumn = (t: LabTable, c: number): string[] => toCsv(t, resolveValues(t)).split('\n').slice(1).map((l) => l.split(',')[c])

beforeEach(() => {
  scene().newScene()
})

describe('a typed reading keeps its figures on screen', () => {
  it('typing 0.200 shows 0.200, and the sums use 0.2', () => {
    const t = setCell(emptyTable(), 0, 0, 0.2, '0.200')
    expect(shownCell(t, 0, 0)).toBe('0.200')
    expect(resolveValues(t).values[0][0]).toBe(0.2)
  })

  it('a cell with no recorded text shows the number as it always did', () => {
    const t = setCell(emptyTable(), 0, 0, 0.5)
    expect(shownCell(t, 0, 0)).toBe('0.5')
    expect(shownCell(t, 1, 0)).toBe('')
  })

  it('what is typed is read into a number and a recorded text', () => {
    expect(readTyped('0.200')).toEqual({ value: 0.2, text: '0.200' })
    expect(readTyped(' −1.50 ')).toEqual({ value: -1.5, text: '-1.50' })
    expect(readTyped('')).toEqual({ value: null, text: null })
    // A sum has no recorded figures of its own: the number is kept and shown as a number.
    expect(readTyped('2*0.1')).toEqual({ value: 0.2, text: null })
    expect(readTyped('9.8/')).toBeNull()
  })
})

describe('every table operation keeps each text in its own cell', () => {
  it('removing a row above keeps the right texts in the right rows', () => {
    const t = removeRow(typed(), 0)
    expect(column(t, 0).slice(0, 2)).toEqual(['0.200', '0.300'])
    expect(column(t, 1).slice(0, 2)).toEqual(['0.200', '0.450'])
    expect(csvColumn(t, 0).slice(0, 2)).toEqual(['0.200', '0.300'])
  })

  it('adding a row keeps the texts and leaves the new row empty', () => {
    const t = addRow(typed())
    expect(column(t, 0)).toEqual(['0.100', '0.200', '0.300', '', '', ''])
  })

  it('adding a column in the middle moves the texts with their columns', () => {
    const t = setCell(addColumn(typed(), { name: 'm' }, 1), 0, 1, 2, '2.0')
    expect(column(t, 0).slice(0, 3)).toEqual(['0.100', '0.200', '0.300'])
    expect(column(t, 1).slice(0, 3)).toEqual(['2.0', '', ''])
    expect(column(t, 2).slice(0, 3)).toEqual(['0.050', '0.200', '0.450'])
  })

  it('removing a value column with its ± column keeps the others in line', () => {
    let t = typed()
    t = addUncertainty(t, t.columns[0].id)
    t = setCell(t, 0, 1, 0.01, '0.010')
    t = addColumn(t, { name: 'm' })
    t = setCell(t, 0, 3, 1, '1.00')
    t = removeColumn(t, t.columns[0].id)
    expect(t.columns.map((c) => c.name)).toEqual(['d', 'm'])
    expect(column(t, 0).slice(0, 3)).toEqual(['0.050', '0.200', '0.450'])
    expect(column(t, 1)[0]).toBe('1.00')
  })

  it('replacing every reading drops the old texts', () => {
    const t = setRows(typed(), [[7, 8], [9, 10]])
    expect(column(t, 0)).toEqual(['7', '9'])
  })

  it('a worked-out column never shows a recorded text', () => {
    const base = typed()
    const t = setColumn(base, base.columns[1].id, { formula: 't*2' })
    expect(toCsv(t, resolveValues(t)).split('\n')[1]).toBe('0.100,0.2')
  })

  it('a text that no longer reads back as its number is never shown or exported', () => {
    const bad: LabTable = { ...typed(), reads: [['0.900', '0.050'], ['0.200', null]] }
    expect(shownCell(bad, 0, 0)).toBe('0.1')
    expect(shownCell(bad, 0, 1)).toBe('0.050')
    expect(csvColumn(bad, 0)[0]).toBe('0.1')
    const damaged = { ...typed(), reads: 'nonsense' } as unknown as LabTable
    expect(shownCell(damaged, 0, 0)).toBe('0.1')
  })

  it('fitting uses the numbers', () => {
    const s = plotSeries(typed(), resolveValues(typed()))
    expect(s.xs).toEqual([0.1, 0.2, 0.3])
  })
})

describe('CSV in and out', () => {
  it('writes 0.200 out', () => {
    expect(csvColumn(typed(), 0)).toEqual(['0.100', '0.200', '0.300', '', ''])
  })

  it('reads 0.200 in and keeps it, a decimal comma included', () => {
    const t = applyPaste(emptyTable(), parseTable('t / s;d / m\n0,200;1,50\n'))
    expect(t.rows[0]).toEqual([0.2, 1.5])
    expect(column(t, 0)).toEqual(['0.200'])
    expect(column(t, 1)).toEqual(['1.50'])
    expect(csvColumn(t, 0)).toEqual(['0.200'])
  })

  it('a CSV written by the table reads back with the same texts', () => {
    const back = applyPaste(emptyTable(), parseTable(toCsv(typed(), resolveValues(typed()))))
    expect(column(back, 0).slice(0, 3)).toEqual(['0.100', '0.200', '0.300'])
  })
})

describe('save and open', () => {
  it('serialize → text → load keeps the recorded texts', () => {
    useLab.getState().setTables([typed()])
    const text = JSON.stringify(scene().serialize())
    scene().newScene()
    scene().loadScene(parseSceneFile(text))
    const t = useLab.getState().tables[0]
    expect(column(t, 0).slice(0, 3)).toEqual(['0.100', '0.200', '0.300'])
    expect(t.rows[1][0]).toBe(0.2)
  })

  it('a format-6 file with no texts opens showing what it always showed', () => {
    const old = { ...typed() }
    delete old.reads
    const file = { app: 'PhysLab', version: 6, objects: [], lab: [old] }
    expect(FILE_VERSION).toBeGreaterThanOrEqual(6)
    scene().loadScene(parseSceneFile(JSON.stringify(file)))
    const t = useLab.getState().tables[0]
    expect(column(t, 0)).toEqual(['0.1', '0.2', '0.3', '', ''])
    expect(t.reads).toBeUndefined()
  })

  it('a file with a damaged text block still opens, showing the numbers', () => {
    const file = { app: 'PhysLab', version: 6, objects: [], lab: [{ ...typed(), reads: [[5, '0.050']] }] }
    scene().loadScene(parseSceneFile(JSON.stringify(file)))
    const t = useLab.getState().tables[0]
    expect(column(t, 0).slice(0, 3)).toEqual(['0.1', '0.2', '0.3'])
    expect(column(t, 1)[0]).toBe('0.050')
  })
})

describe('undo', () => {
  it('undoing a removed row brings back the texts in their rows', () => {
    useLab.getState().setTables([typed()])
    const id = useLab.getState().tables[0].id
    useLab.getState().update(id, (t) => removeRow(t, 0))
    expect(column(useLab.getState().tables[0], 0)[0]).toBe('0.200')
    useLab.getState().undo()
    expect(column(useLab.getState().tables[0], 0).slice(0, 3)).toEqual(['0.100', '0.200', '0.300'])
  })
})

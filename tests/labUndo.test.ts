// Lab Data paste and undo: a paste lands where the student is, and Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y
// and Edit ▸ Undo/Redo all reach the one lab history in Lab mode.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyTable, setCell, useLab } from '../src/renderer/src/lab/labStore'
import { applyPaste, parseTable, pasteTarget } from '../src/renderer/src/lab/csv'
import { routeHistory } from '../src/renderer/src/app/undoRoute'
import type { LabTable } from '../src/renderer/src/lab/types'

/** t and d, five rows, the first reading recorded as "0.200". */
function filled(): LabTable {
  const t = emptyTable('Drop')
  const rows = [
    [0.2, 0.196],
    [0.4, 0.784],
    [0.6, 1.766],
    [0.8, 3.138],
    [1.0, 4.905]
  ]
  return setCell({ ...t, rows }, 0, 0, 0.2, '0.200')
}

describe('pasting at the focused cell', () => {
  it('writes a block into the middle and keeps every other reading and its text', () => {
    const before = filled()
    const after = applyPaste(before, parseTable('9.50\n8.0'), { row: 2, col: 1 })
    expect(after.columns.map((c) => c.name)).toEqual(['t', 'd'])
    expect(after.rows).toEqual([
      [0.2, 0.196],
      [0.4, 0.784],
      [0.6, 9.5],
      [0.8, 8],
      [1.0, 4.905]
    ])
    expect(after.reads?.[0][0]).toBe('0.200')
    expect(after.reads?.[2][1]).toBe('9.50')
    expect(after.reads?.[3][1]).toBe('8.0')
    expect(after.reads?.[2][0]).toBeNull()
  })

  it('grows the table down and to the right, the texts growing with it', () => {
    const before = filled()
    const after = applyPaste(before, parseTable('1.10\t2.20\n3.30\t4.40\n5.50\t6.60'), { row: 4, col: 1 })
    expect(after.columns.length).toBe(3)
    expect(after.rows.length).toBe(7)
    expect(after.rows[3]).toEqual([0.8, 3.138, null])
    expect(after.rows[4]).toEqual([1.0, 1.1, 2.2])
    expect(after.rows[6]).toEqual([null, 5.5, 6.6])
    expect(after.reads?.length).toBe(7)
    expect(after.reads?.every((r) => r.length === 3)).toBe(true)
    expect(after.reads?.[0][0]).toBe('0.200')
    expect(after.reads?.[4][2]).toBe('2.20')
    expect(after.reads?.[6][1]).toBe('5.50')
  })

  it('replaces everything, captions too, when the table is still empty', () => {
    const after = applyPaste(emptyTable(), parseTable('x / m,F / N\n1,2\n3,4'), { row: 3, col: 1 })
    expect(after.columns.map((c) => c.name)).toEqual(['x', 'F'])
    expect(after.rows).toEqual([
      [1, 2],
      [3, 4]
    ])
  })

  it('replaces everything when no cell is focused (the whole table is selected)', () => {
    const after = applyPaste(filled(), parseTable('7,8'))
    expect(after.rows).toEqual([[7, 8]])
    expect(after.reads?.[0][0]).toBe('7')
  })
})

describe('what a paste is for', () => {
  it('lets a single value with a decimal comma go into the cell being edited as text', () => {
    expect(pasteTarget('1,2', true)).toBe('text')
    expect(pasteTarget('0.45', true)).toBe('text')
    expect(pasteTarget('1;2', true)).toBe('text')
  })
  it('takes a block (lines or tabs) into the table at that cell', () => {
    expect(pasteTarget('1\t2', true)).toBe('block')
    expect(pasteTarget('1\n2', true)).toBe('block')
  })
  it('takes anything with separators on the table itself as a block, and leaves plain text alone', () => {
    expect(pasteTarget('1,2', false)).toBe('block')
    expect(pasteTarget('hello', false)).toBe('text')
    expect(pasteTarget('   ', false)).toBe('text')
  })
})

describe('one lab history with redo', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  const later = () => vi.setSystemTime(Date.now() + 5000)
  const cell = () => useLab.getState().tables[0].rows[0][0]

  it('undoes, redoes, and a new edit clears what could be redone', () => {
    useLab.getState().setTables([filled()])
    const id = useLab.getState().tables[0].id
    expect(useLab.getState().future).toEqual([])
    later()
    useLab.getState().update(id, (t) => setCell(t, 0, 0, 1, '1'))
    later()
    useLab.getState().update(id, (t) => setCell(t, 0, 0, 2, '2'))
    expect(cell()).toBe(2)

    useLab.getState().undo()
    expect(cell()).toBe(1)
    useLab.getState().undo()
    expect(cell()).toBe(0.2)
    expect(useLab.getState().tables[0].reads?.[0][0]).toBe('0.200')

    useLab.getState().redo()
    expect(cell()).toBe(1)
    useLab.getState().redo()
    expect(cell()).toBe(2)
    useLab.getState().redo()
    expect(cell()).toBe(2)

    useLab.getState().undo()
    // An edit straight after an undo is its own step, and the step undone is gone for good.
    useLab.getState().update(id, (t) => setCell(t, 0, 0, 3, '3'))
    expect(useLab.getState().future).toEqual([])
    useLab.getState().redo()
    expect(cell()).toBe(3)
    useLab.getState().undo()
    expect(cell()).toBe(1)
  })

  it('takes a paste back in one undo, with its texts, and puts it back on redo', () => {
    useLab.getState().setTables([filled()])
    const id = useLab.getState().tables[0].id
    later()
    useLab.getState().update(id, (t) => applyPaste(t, parseTable('5.00\t6.00\n7\t8'), { row: 4, col: 1 }))
    expect(useLab.getState().tables[0].rows.length).toBe(6)
    useLab.getState().undo()
    expect(useLab.getState().tables[0].rows.length).toBe(5)
    expect(useLab.getState().tables[0].columns.length).toBe(2)
    useLab.getState().redo()
    expect(useLab.getState().tables[0].reads?.[4][2]).toBe('6.00')
  })

  it('opening a project forgets both directions', () => {
    useLab.getState().setTables([filled()])
    const id = useLab.getState().tables[0].id
    later()
    useLab.getState().update(id, (t) => setCell(t, 0, 0, 1))
    useLab.getState().undo()
    useLab.getState().setTables([filled()])
    expect(useLab.getState().past).toEqual([])
    expect(useLab.getState().future).toEqual([])
  })
})

describe('which history a key or the Edit menu reaches', () => {
  it('sends Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y to the table in Lab mode', () => {
    expect(routeHistory('lab', { key: 'z', shift: false })).toEqual({ stack: 'lab', action: 'undo' })
    expect(routeHistory('lab', { key: 'Z', shift: true })).toEqual({ stack: 'lab', action: 'redo' })
    expect(routeHistory('lab', { key: 'y', shift: false })).toEqual({ stack: 'lab', action: 'redo' })
  })
  it('sends the Edit menu to the same place as the keys', () => {
    for (const mode of ['lab', 'sandbox', 'author', 'motion', 'geometry']) {
      expect(routeHistory(mode, { menu: 'undo' })).toEqual(routeHistory(mode, { key: 'z', shift: false }))
      expect(routeHistory(mode, { menu: 'redo' })).toEqual(routeHistory(mode, { key: 'y', shift: false }))
    }
  })
  it('keeps the Sandbox, the Question Author and the drawing on their own histories', () => {
    expect(routeHistory('sandbox', { key: 'z', shift: true })).toEqual({ stack: 'sandbox', action: 'redo' })
    expect(routeHistory('author', { menu: 'undo' })).toEqual({ stack: 'author', action: 'undo' })
    expect(routeHistory('author', { key: 'y', shift: false })).toEqual({ stack: 'author', action: 'redo' })
    expect(routeHistory('motion', { key: 'z', shift: false })).toEqual({ stack: 'scene', action: 'undo' })
    expect(routeHistory('geometry', { key: 'Z', shift: true })).toEqual({ stack: 'scene', action: 'redo' })
  })
  it('ignores other keys', () => {
    expect(routeHistory('lab', { key: 'x', shift: false })).toBeNull()
  })
})

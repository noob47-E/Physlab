// The lab tables themselves. Kept apart from the scene store so that store.ts can save them into
// the .phys file without the two importing each other.

import { create } from 'zustand'
import type { FitShape, LabColumn, LabTable } from './types'
import { isUsableName } from './values'

let counter = 0
const nextId = (prefix: string) => `${prefix}${++counter}${Math.random().toString(36).slice(2, 6)}`

const column = (name: string, unit: string, extra: Partial<LabColumn> = {}): LabColumn => ({
  id: nextId('col'),
  name,
  unit,
  ...extra
})

/**
 * What a table is called before the student names it. One constant, because the store's first
 * table used to say "Free fall" while File ▸ New's said "Experiment", and the autosave, which
 * compares a session with File ▸ New block by block, read an untouched launch as work worth keeping.
 */
export const DEFAULT_TABLE_TITLE = 'Experiment'

/** A new table starts the way a practical does: a column for what you set, one for what you measure. */
export function emptyTable(title = DEFAULT_TABLE_TITLE): LabTable {
  const t = column('t', 's')
  const d = column('d', 'm')
  return {
    id: nextId('tab'),
    title,
    columns: [t, d],
    rows: Array.from({ length: 5 }, () => [null, null]),
    plot: { x: t.id, y: d.id, fit: 'linear' }
  }
}

interface LabStore {
  tables: LabTable[]
  currentId: string
  setCurrent: (id: string) => void
  addTable: () => void
  /** Puts a table made elsewhere (a Sandbox recording) beside the others and opens it. Undoable. */
  appendTable: (t: LabTable) => void
  removeTable: (id: string) => void
  /** Replace everything (opening a project). Not undoable: the old tables belong to the old file. */
  setTables: (tables: LabTable[]) => void
  update: (id: string, patch: (t: LabTable) => LabTable) => void
  /** Previous table lists, newest last. Deleting a column used to be final. */
  past: LabTable[][]
  undo: () => void
}

let lastRemembered = 0
/** Keystrokes into one cell arrive in a burst and fold into one undo step. */
function remember(get: () => LabStore, set: (p: Partial<LabStore>) => void): void {
  const now = Date.now()
  const burst = now - lastRemembered < 700 && get().past.length > 0
  lastRemembered = now
  if (burst) return
  set({ past: [...get().past, get().tables].slice(-50) })
}

/**
 * "Ball — from the Sandbox (2)" for a second recording of the same body: two tables with one
 * name are two identical tabs, and the student cannot tell which drop they are looking at.
 */
export function uniqueTitle(tables: LabTable[], title: string): string {
  const taken = new Set(tables.map((t) => t.title))
  if (!taken.has(title)) return title
  for (let n = 2; ; n++) if (!taken.has(`${title} (${n})`)) return `${title} (${n})`
}

const first = emptyTable()

export const useLab = create<LabStore>((set, get) => ({
  tables: [first],
  currentId: first.id,
  past: [],
  undo: () => {
    const past = get().past
    const back = past[past.length - 1]
    if (!back) return
    set({ tables: back, past: past.slice(0, -1), currentId: back.some((t) => t.id === get().currentId) ? get().currentId : back[0].id })
  },
  setCurrent: (currentId) => set({ currentId }),
  addTable: () => {
    remember(get, set)
    const t = emptyTable(`Experiment ${get().tables.length + 1}`)
    set({ tables: [...get().tables, t], currentId: t.id })
  },
  appendTable: (t) => {
    remember(get, set)
    const table = { ...t, title: uniqueTitle(get().tables, t.title) }
    set({ tables: [...get().tables, table], currentId: table.id })
  },
  removeTable: (id) => {
    remember(get, set)
    const tables = get().tables.filter((t) => t.id !== id)
    const left = tables.length ? tables : [emptyTable()]
    set({ tables: left, currentId: left.some((t) => t.id === get().currentId) ? get().currentId : left[0].id })
  },
  setTables: (tables) => {
    const left = tables.length ? tables : [emptyTable()]
    set({ tables: left, currentId: left[0].id, past: [] })
  },
  update: (id, patch) => {
    remember(get, set)
    set({ tables: get().tables.map((t) => (t.id === id ? patch(t) : t)) })
  }
}))

// Handy while developing: inspect and drive the tables from the browser console.
// (guarded for the test runner, which has no window)
if (import.meta.env?.DEV && typeof window !== 'undefined') (window as unknown as { __useLab?: typeof useLab }).__useLab = useLab

/** The table being edited. */
export const currentTable = (): LabTable => {
  const { tables, currentId } = useLab.getState()
  return tables.find((t) => t.id === currentId) ?? tables[0]
}

// ---------------------------------------------------------------------------
// Editing one table. These are plain functions on a table so they can be tested
// without a store, and the store's `update` applies them.
// ---------------------------------------------------------------------------

export const addRow = (t: LabTable): LabTable => ({ ...t, rows: [...t.rows, t.columns.map(() => null)] })

export const removeRow = (t: LabTable, index: number): LabTable => ({ ...t, rows: t.rows.filter((_, i) => i !== index) })

export function setCell(t: LabTable, row: number, col: number, value: number | null): LabTable {
  const rows = t.rows.map((r, i) => (i === row ? r.map((v, c) => (c === col ? value : v)) : r))
  return { ...t, rows }
}

/** Adds a column, at the end or beside another one when `at` says where. */
export function addColumn(t: LabTable, col?: Partial<LabColumn>, at?: number): LabTable {
  const name = col?.name ?? nextColumnName(t)
  const added: LabColumn = { id: nextId('col'), name, unit: col?.unit ?? '', formula: col?.formula, uncertaintyFor: col?.uncertaintyFor }
  const where = at === undefined ? t.columns.length : Math.max(0, Math.min(at, t.columns.length))
  return {
    ...t,
    columns: [...t.columns.slice(0, where), added, ...t.columns.slice(where)],
    rows: t.rows.map((r) => [...r.slice(0, where), null, ...r.slice(where)])
  }
}

/**
 * Gives a column a ± column of its own, right beside it. The uncertainty of a quantity is measured
 * in the same unit as the quantity, and is named after it so a formula can still reach it.
 */
export function addUncertainty(t: LabTable, parentId: string): LabTable {
  const parent = t.columns.find((c) => c.id === parentId)
  if (!parent) return t
  if (t.columns.some((c) => c.uncertaintyFor === parentId)) return t
  return addColumn(t, { name: uncertaintyName(parent.name), unit: parent.unit, uncertaintyFor: parentId }, t.columns.indexOf(parent) + 1)
}

/** "t" → "t_u". A name mathjs will take, so the column can be used in a formula like any other. */
export function uncertaintyName(parent: string): string {
  return isUsableName(parent) ? `${parent}_u` : 'u'
}

export function removeColumn(t: LabTable, id: string): LabTable {
  const index = t.columns.findIndex((c) => c.id === id)
  if (index < 0 || t.columns.length <= 1) return t
  const columns = t.columns.filter((c) => c.id !== id)
  // A column that measured this one's uncertainty has nothing left to describe.
  const kept = columns.filter((c) => c.uncertaintyFor !== id)
  const dropped = columns.filter((c) => c.uncertaintyFor === id).map((c) => t.columns.indexOf(c))
  const drop = new Set([index, ...dropped])
  return {
    ...t,
    columns: kept,
    rows: t.rows.map((r) => r.filter((_, i) => !drop.has(i))),
    plot: {
      ...t.plot,
      x: drop.has(t.columns.findIndex((c) => c.id === t.plot.x)) ? (kept[0]?.id ?? '') : t.plot.x,
      y: drop.has(t.columns.findIndex((c) => c.id === t.plot.y)) ? (kept[1]?.id ?? kept[0]?.id ?? '') : t.plot.y
    }
  }
}

export function setColumn(t: LabTable, id: string, patch: Partial<LabColumn>): LabTable {
  const before = t.columns.find((c) => c.id === id)
  if (!before) return t
  const after = { ...before, ...patch }
  return {
    ...t,
    columns: t.columns.map((c) => {
      if (c.id === id) return after
      if (c.uncertaintyFor !== id) return c
      // A ± column belongs to its quantity: renaming t to time must not leave a stray t_u behind,
      // and an uncertainty is always measured in the same unit as the reading.
      return { ...c, name: uncertaintyName(after.name), unit: after.unit }
    })
  }
}

export const setPlot = (t: LabTable, patch: Partial<{ x: string; y: string; fit: FitShape }>): LabTable => ({
  ...t,
  plot: { ...t.plot, ...patch }
})

/** Replace every reading, keeping the columns (what a paste or a CSV import does). */
export const setRows = (t: LabTable, rows: (number | null)[][]): LabTable => ({
  ...t,
  rows: rows.map((r) => t.columns.map((_, c) => r[c] ?? null))
})

/** A, B, C… skipping names already taken and the ones that read as numbers. */
function nextColumnName(t: LabTable): string {
  const used = new Set(t.columns.map((c) => c.name))
  for (const letter of 'yzabcdefghjkmnpqrsuvw') if (!used.has(letter)) return letter
  return `c${t.columns.length + 1}`
}

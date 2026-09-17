// The lab tables themselves. Kept apart from the scene store so that store.ts can save them into
// the .phys file without the two importing each other.

import { create } from 'zustand'
import type { FitShape, LabColumn, LabTable } from './types'

let counter = 0
const nextId = (prefix: string) => `${prefix}${++counter}${Math.random().toString(36).slice(2, 6)}`

const column = (name: string, unit: string, extra: Partial<LabColumn> = {}): LabColumn => ({
  id: nextId('col'),
  name,
  unit,
  ...extra
})

/** A new table starts the way a practical does: a column for what you set, one for what you measure. */
export function emptyTable(title = 'Experiment'): LabTable {
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
  removeTable: (id: string) => void
  /** Replace everything (opening a project). */
  setTables: (tables: LabTable[]) => void
  update: (id: string, patch: (t: LabTable) => LabTable) => void
}

const first = emptyTable('Free fall')

export const useLab = create<LabStore>((set, get) => ({
  tables: [first],
  currentId: first.id,
  setCurrent: (currentId) => set({ currentId }),
  addTable: () => {
    const t = emptyTable(`Experiment ${get().tables.length + 1}`)
    set({ tables: [...get().tables, t], currentId: t.id })
  },
  removeTable: (id) => {
    const tables = get().tables.filter((t) => t.id !== id)
    const left = tables.length ? tables : [emptyTable('Experiment')]
    set({ tables: left, currentId: left.some((t) => t.id === get().currentId) ? get().currentId : left[0].id })
  },
  setTables: (tables) => {
    const left = tables.length ? tables : [emptyTable('Experiment')]
    set({ tables: left, currentId: left[0].id })
  },
  update: (id, patch) => set({ tables: get().tables.map((t) => (t.id === id ? patch(t) : t)) })
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

export function addColumn(t: LabTable, col?: Partial<LabColumn>): LabTable {
  const name = col?.name ?? nextColumnName(t)
  const added: LabColumn = { id: nextId('col'), name, unit: col?.unit ?? '', formula: col?.formula, uncertaintyFor: col?.uncertaintyFor }
  return { ...t, columns: [...t.columns, added], rows: t.rows.map((r) => [...r, null]) }
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

export const setColumn = (t: LabTable, id: string, patch: Partial<LabColumn>): LabTable => ({
  ...t,
  columns: t.columns.map((c) => (c.id === id ? { ...c, ...patch } : c))
})

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

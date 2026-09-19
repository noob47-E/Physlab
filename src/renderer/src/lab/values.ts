// Turning what is typed in the table into the numbers that get plotted.
//
// A column can be typed in or worked out from the others ("t^2"). A computed column may use any
// column to its left, so a table can build up: t → t² → d/t².

import { compileScalar } from '../math/expr'
import type { LabColumn, LabTable } from './types'

export interface Resolved {
  /** Same shape as table.rows: one value per column, in column order. */
  values: (number | null)[][]
  /** Column id → what went wrong with its formula, when something did. */
  errors: Record<string, string>
}

/** A name usable as a variable in a formula (mathjs will not take "d/t" as a name). */
export const isUsableName = (name: string): boolean => /^[A-Za-z][A-Za-z0-9_]*$/.test(name)

/**
 * Works out every cell: typed values as they are, computed columns from the columns before them.
 * A formula that cannot be read leaves its column empty and says why, rather than throwing.
 */
export function resolveValues(table: LabTable): Resolved {
  const { columns, rows } = table
  const values: (number | null)[][] = rows.map((r) => columns.map((_, c) => r[c] ?? null))
  const errors: Record<string, string> = {}

  columns.forEach((col, c) => {
    if (!col.formula?.trim()) return
    // Only the columns to the left can be used, so a formula can never depend on itself.
    const usable = columns.slice(0, c).filter((o) => isUsableName(o.name))
    const names = usable.map((o) => o.name)
    let fn: ((vars: Record<string, number>) => number) | null = null
    try {
      fn = compileScalar(col.formula, names, () => ({}))
    } catch (e) {
      errors[col.id] = e instanceof Error ? e.message : String(e)
    }
    if (!fn) {
      values.forEach((row) => (row[c] = null))
      return
    }
    values.forEach((row) => {
      const vars: Record<string, number> = {}
      let ready = true
      usable.forEach((o) => {
        const v = row[columns.indexOf(o)]
        if (v === null || !Number.isFinite(v)) ready = false
        else vars[o.name] = v
      })
      if (!ready) {
        row[c] = null
        return
      }
      const out = fn(vars)
      row[c] = Number.isFinite(out) ? out : null
    })
  })

  return { values, errors }
}

/** Where the ± column of a given column sits, or −1 when it has none. */
export const uncertaintyIndex = (table: LabTable, columnId: string): number =>
  table.columns.findIndex((c) => c.uncertaintyFor === columnId)

export interface PlotSeries {
  xs: number[]
  ys: number[]
  /** One per kept reading, or empty when that column has no ± column. */
  xErr: number[]
  yErr: number[]
}

/** A blank or nonsense ± cell means "no bar on this reading", never "shift the bars along". */
const errorAt = (v: number | null | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? Math.abs(v) : 0)

/**
 * The two columns a graph needs, as plain numbers, skipping rows that are not complete — with the
 * uncertainties of the rows that were kept, in the same order, so a bar can never end up drawn on
 * the wrong point.
 */
export function plotSeries(table: LabTable, resolved: Resolved): PlotSeries {
  const xi = table.columns.findIndex((c) => c.id === table.plot.x)
  const yi = table.columns.findIndex((c) => c.id === table.plot.y)
  const out: PlotSeries = { xs: [], ys: [], xErr: [], yErr: [] }
  if (xi < 0 || yi < 0) return out
  const xe = uncertaintyIndex(table, table.plot.x)
  const ye = uncertaintyIndex(table, table.plot.y)
  for (const row of resolved.values) {
    const x = row[xi]
    const y = row[yi]
    if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) continue
    out.xs.push(x)
    out.ys.push(y)
    if (xe >= 0) out.xErr.push(errorAt(row[xe]))
    if (ye >= 0) out.yErr.push(errorAt(row[ye]))
  }
  return out
}

export function plotPairs(table: LabTable, resolved: Resolved): { xs: number[]; ys: number[] } {
  const { xs, ys } = plotSeries(table, resolved)
  return { xs, ys }
}

/** "m" over "s" reads as "m/s"; an empty unit stays empty so nothing nonsensical is shown. */
export function ratioUnit(yUnit: string, xUnit: string): string {
  const y = yUnit.trim()
  const x = xUnit.trim()
  if (!y && !x) return ''
  if (!x) return y
  if (!y) return `1/${x}`
  if (y === x) return ''
  return `${y}/${x}`
}

/** The header as it is written in a notebook: "t / s". */
export const headerOf = (col: LabColumn): string => (col.unit.trim() ? `${col.name} / ${col.unit.trim()}` : col.name)

/** The header as it is shown on screen: "± t / s" for an uncertainty, "t / s" for anything else. */
export function columnHeader(table: LabTable, col: LabColumn): string {
  if (!col.uncertaintyFor) return headerOf(col)
  const parent = table.columns.find((c) => c.id === col.uncertaintyFor)
  return `± ${headerOf(parent ? { ...col, name: parent.name } : col)}`
}

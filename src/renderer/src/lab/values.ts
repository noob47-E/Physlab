// Turning what is typed in the table into the numbers that get plotted.
//
// A column can be typed in or worked out from the others ("t^2"). A computed column may use any
// column to its left, so a table can build up: t → t² → d/t².

import { compileScalar, math, preprocess } from '../math/expr'
import type { LabColumn, LabTable } from './types'

/**
 * A plain written number ("0.200", "−1.50", "+3", "2.5e-3") as the text a reading is recorded
 * with, or null when the text is not one plain number. The typographic minus becomes "-" and a
 * leading "+" goes, so the text reads back with Number(); a trailing "." carries no figure and goes.
 */
export function readingText(raw: string, decimalComma = false): string | null {
  let s = raw.trim().replace(/[−–—]/g, '-').replace(/\s+/g, '')
  if (decimalComma) s = s.replace(',', '.')
  if (s.startsWith('+')) s = s.slice(1)
  if (!/^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null
  s = s.replace(/\.(?=$|[eE])/, '')
  return Number.isFinite(Number(s)) ? s : null
}

/**
 * What a student typed into a cell: the number the sums use, and the text it was recorded with.
 * A sum ("2*0.1") keeps its number but no text — a calculation has no recorded figures of its
 * own, and showing "2*0.1" back would be a formula, not a reading. null means it cannot be read.
 */
export function readTyped(raw: string): { value: number | null; text: string | null } | null {
  // One reading with a decimal comma ("1,2", as written in much of Europe) is 1.2: inside a single
  // cell a comma cannot be separating two readings. Exactly three digits after it ("12,000") is a
  // thousands separator just as often, so that stays unread rather than becoming 12.
  const trimmed = raw.trim().replace(/^(-?\d+),(\d{1,2}|\d{4,})$/, '$1.$2')
  if (!trimmed) return { value: null, text: null }
  const text = readingText(trimmed)
  if (text !== null) return { value: Number(text), text }
  try {
    const v = Number(math.evaluate(preprocess(trimmed.replace(/−/g, '-'))))
    return { value: Number.isFinite(v) ? v : null, text: null }
  } catch {
    return null
  }
}

/**
 * The text a typed cell was recorded with — only when it reads back as exactly that cell's number
 * and the column is typed, not worked out. Anything else (no text, a damaged file, a text left
 * behind by an edit that missed it) gives null, so a wrong number can never be shown.
 */
export function recordedText(table: LabTable, r: number, c: number): string | null {
  const col = table.columns[c]
  const v = table.rows[r]?.[c]
  if (!col || col.formula || typeof v !== 'number') return null
  const reads: unknown = table.reads
  const row: unknown = Array.isArray(reads) ? reads[r] : undefined
  const text: unknown = Array.isArray(row) ? row[c] : undefined
  if (typeof text !== 'string' || readingText(text) !== text) return null
  return Number(text) === v ? text : null
}

/**
 * A typed cell as the table shows it: its recorded text, else the number written in full. Full,
 * not rounded through math/format.ts, because this is the text the student edits: a rounded form
 * would be read back on the next edit and quietly change the reading (and it is what every
 * table showed before texts were kept, so an older file looks exactly as it did).
 */
export function shownCell(table: LabTable, r: number, c: number): string {
  const text = recordedText(table, r, c)
  if (text !== null) return text
  const v = table.rows[r]?.[c]
  return typeof v === 'number' ? String(v) : ''
}

export interface Resolved {
  /** Same shape as table.rows: one value per column, in column order. */
  values: (number | null)[][]
  /** Column id → what went wrong with its formula, when something did. */
  errors: Record<string, string>
}

/** A name usable as a variable in a formula (mathjs will not take "d/t" as a name). */
export const isUsableName = (name: string): boolean => /^[A-Za-z][A-Za-z0-9_]*$/.test(name)

/** "Drop height" -> "Drop_height", made safe and unique against `used`. */
export function formulaName(display: string, used: Set<string>): string {
  // A formula name must start with a letter; leading digits are kept behind one ("2nd try" →
  // x2nd_try, not nd_try).
  const cleaned = display.trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '').replace(/^_+/, '')
  const name = !cleaned ? 'x' : /^[A-Za-z]/.test(cleaned) ? cleaned : `x${cleaned}`
  let out = name
  for (let n = 2; used.has(out); n++) out = `${name}_${n}`
  used.add(out)
  return out
}

/**
 * What typing `typed` in a column's name box does: the same rule as a pasted caption. A plain name
 * ("t") is the name and has no label; anything else ("Drop height") is kept as the label the
 * student reads, and formulas get a safe, unique name derived from it. null = nothing to change
 * (empty text). `label: undefined` is explicit so setColumn drops an older label.
 */
export function typedColumnName(table: LabTable, columnId: string, typed: string): { name: string; label: string | undefined } | null {
  const display = typed.trim()
  if (!display) return null
  const used = new Set(table.columns.filter((c) => c.id !== columnId).map((c) => c.name))
  const name = formulaName(display, used)
  return { name, label: name === display ? undefined : display }
}

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
export const headerOf = (col: LabColumn): string => {
  const display = col.label?.trim() || col.name
  return col.unit.trim() ? `${display} / ${col.unit.trim()}` : display
}

/** The header as it is shown on screen: "± t / s" for an uncertainty, "t / s" for anything else. */
export function columnHeader(table: LabTable, col: LabColumn): string {
  if (!col.uncertaintyFor) return headerOf(col)
  const parent = table.columns.find((c) => c.id === col.uncertaintyFor)
  return `± ${headerOf(parent ? { ...col, label: parent.label ?? parent.name } : col)}`
}

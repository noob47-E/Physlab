// Getting readings in and out of the table: the clipboard, and CSV files.
//
// Readings usually start life somewhere else — a phone stopwatch, a spreadsheet, a datalogger — and
// typing them in twice is how mistakes get made. Everything here is pure text handling so it can be
// tested without a clipboard or a file dialog.

import { addColumn, setRows } from './labStore'
import type { LabTable } from './types'
import { columnHeader, isUsableName, type Resolved } from './values'

export interface ParsedTable {
  /** What the first line called each column, when it was not all numbers. */
  header: { name: string; unit: string }[] | null
  rows: (number | null)[][]
}

/** Tabs beat semicolons beat commas: a spreadsheet copies tabs, and "0,45" is a decimal in Europe. */
function separatorOf(lines: string[]): string {
  if (lines.some((l) => l.includes('\t'))) return '\t'
  if (lines.some((l) => l.includes(';'))) return ';'
  return ','
}

/**
 * One cell as a number, or null when it is empty or not a number. Copes with the typographic minus
 * a word processor inserts, a leading +, spaces inside a number, and a decimal comma when the
 * comma is not already doing the separating.
 */
export function cellNumber(cell: string, decimalComma = false): number | null {
  let s = cell.trim().replace(/[−–—]/g, '-').replace(/\s+/g, '')
  if (!s) return null
  if (decimalComma) s = s.replace(',', '.')
  if (s.startsWith('+')) s = s.slice(1)
  if (!/^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null
  const v = Number(s)
  return Number.isFinite(v) ? v : null
}

/** "t / s", "t (s)" and "t" all give back a name and a unit. */
export function headerCell(cell: string): { name: string; unit: string } {
  const text = cell.trim().replace(/^["']|["']$/g, '')
  const slash = text.match(/^(.+?)\s*\/\s*(.+)$/)
  if (slash) return { name: slash[1].trim(), unit: slash[2].trim() }
  const bracket = text.match(/^(.+?)\s*[([]\s*(.+?)\s*[)\]]$/)
  if (bracket) return { name: bracket[1].trim(), unit: bracket[2].trim() }
  return { name: text, unit: '' }
}

/** Reads a pasted block or the contents of a CSV file. */
export function parseTable(text: string): ParsedTable {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
  if (!lines.length) return { header: null, rows: [] }

  const sep = separatorOf(lines)
  const decimalComma = sep !== ','
  const split = (line: string) => line.split(sep).map((c) => c.trim().replace(/^["']|["']$/g, ''))

  const firstCells = split(lines[0])
  const filled = firstCells.filter((c) => c !== '')
  // A first line with a word in it is a caption row; a line of numbers is a reading.
  const isHeader = filled.length > 0 && filled.some((c) => cellNumber(c, decimalComma) === null)
  const header = isHeader ? firstCells.map(headerCell) : null
  const body = isHeader ? lines.slice(1) : lines

  const rows = body.filter((l) => l.trim() !== '').map((line) => split(line).map((c) => cellNumber(c, decimalComma)))
  return { header, rows }
}

/** The table as CSV: every column, computed ones included, since those are what goes in a report. */
export function toCsv(table: LabTable, resolved: Resolved): string {
  const head = table.columns.map((c) => quote(columnHeader(table, c)))
  const body = resolved.values.map((row) => row.map((v) => (v === null || v === undefined ? '' : String(v))).join(','))
  return [head.join(','), ...body].join('\n')
}

/** A caption with a comma in it would otherwise split the row in two. */
const quote = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

/**
 * Where a pasted block lands. Wider than the table and it grows columns; a table with nothing in it
 * yet also takes the pasted captions, so pasting a spreadsheet sets the whole experiment up at once.
 * A table that already holds readings keeps its own captions — they may have been chosen carefully.
 */
export function applyPaste(table: LabTable, parsed: ParsedTable): LabTable {
  const width = Math.max(0, ...parsed.rows.map((r) => r.length), parsed.header?.length ?? 0)
  let next = table
  for (let c = table.columns.length; c < width; c++) {
    const caption = parsed.header?.[c]
    next = addColumn(next, caption && isUsableName(caption.name) ? { name: caption.name, unit: caption.unit } : undefined)
  }
  const empty = table.rows.every((row) => row.every((v) => v === null || v === undefined))
  if (parsed.header && empty) {
    next = {
      ...next,
      columns: next.columns.map((col, i) => {
        const caption = parsed.header?.[i]
        if (!caption || col.uncertaintyFor || !isUsableName(caption.name)) return col
        return { ...col, name: caption.name, unit: caption.unit }
      })
    }
  }
  return setRows(next, parsed.rows)
}

/** What a saved file should be called: the experiment's own name, made safe for a filename. */
export function csvFileName(title: string): string {
  const safe = title.trim().replace(/[/:*?"<>|]/g, '').replace(/\s+/g, '-').slice(0, 40)
  return `${safe || 'lab-data'}.csv`
}


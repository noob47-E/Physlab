// Getting readings in and out of the table: the clipboard, and CSV files.
//
// Readings usually start life somewhere else — a phone stopwatch, a spreadsheet, a datalogger — and
// typing them in twice is how mistakes get made. Everything here is pure text handling so it can be
// tested without a clipboard or a file dialog.

import { addColumn, pasteRows, setRows } from './labStore'
import type { LabColumn, LabTable } from './types'
import { columnHeader, formulaName, isUsableName, readingText, recordedText, type Resolved } from './values'

interface ParsedTable {
  /** What the first line called each column, when it was not all numbers. */
  header: { name: string; unit: string }[] | null
  rows: (number | null)[][]
  /** The raw cell text for each row, after trimming and removing quotes. */
  texts?: (string | null)[][]
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
 * comma is not already doing the separating. It is the number of the text the reading is recorded
 * with (`readingText`), so the two can never read one cell differently.
 */
export function cellNumber(cell: string, decimalComma = false): number | null {
  const text = readingText(cell, decimalComma)
  return text === null ? null : Number(text)
}

/** "t / s", "t (s)" and "t" all give back a name and a unit. */
function headerCell(cell: string): { name: string; unit: string } {
  // splitLine has already taken CSV's double quotes off ("""x""" is the caption "x"), so only a
  // pair of single quotes, which CSV does not use, is taken off here.
  const text = cell.trim().replace(/^'([\s\S]*)'$/, '$1')
  const slash = text.match(/^(.+?)\s*\/\s*(.+)$/)
  if (slash) return { name: slash[1].trim(), unit: slash[2].trim() }
  const bracket = text.match(/^(.+?)\s*[([]\s*(.+?)\s*[)\]]$/)
  if (bracket) return { name: bracket[1].trim(), unit: bracket[2].trim() }
  return { name: text, unit: '' }
}

/** Splits one CSV line, keeping a separator that is inside quotes as part of the cell. */
function splitLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === sep) {
      out.push(cell)
      cell = ''
    } else {
      cell += ch
    }
  }
  out.push(cell)
  // The quotes have already come off while reading; stripping again took the last character of
  // a caption that ended in an escaped quote ("say ""hi""" read as say "hi).
  return out.map((c) => c.trim())
}

/** Reads a pasted block or the contents of a CSV file. */
export function parseTable(text: string): ParsedTable {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
  if (!lines.length) return { header: null, rows: [] }

  const sep = separatorOf(lines)
  const decimalComma = sep !== ','
  const split = (line: string) => splitLine(line, sep)

  const firstCells = split(lines[0])
  const filled = firstCells.filter((c) => c !== '')
  // A first line with a word in it is a caption row; a line of numbers is a reading.
  const isHeader = filled.length > 0 && filled.some((c) => cellNumber(c, decimalComma) === null)
  const header = isHeader ? firstCells.map(headerCell) : null
  const body = isHeader ? lines.slice(1) : lines
  const clean = body.filter((l) => l.trim() !== '')

  const rows = clean.map((line) => split(line).map((c) => cellNumber(c, decimalComma)))
  // Each reading's own written form, normalised ("0,200" in a decimal-comma file is "0.200"), so
  // the figures it was recorded with survive the import; a cell that is not a number has none.
  const texts = clean.map((line) => split(line).map((c) => readingText(c, decimalComma)))
  return { header, rows, texts }
}

/** The table as CSV: every column, computed ones included, since those are what goes in a report. */
export function toCsv(table: LabTable, resolved: Resolved): string {
  const head = table.columns.map((c) => quote(columnHeader(table, c)))
  // A typed reading goes out with the figures it was recorded with ("0.200"); recordedText gives
  // nothing for a worked-out column or a text that no longer matches its number.
  const body = resolved.values.map((row, r) =>
    row.map((v, c) => (v === null || v === undefined ? '' : recordedText(table, r, c) ?? String(v))).join(',')
  )
  return [head.join(','), ...body].join('\n')
}

/** A caption with a comma in it would otherwise split the row in two. */
const quote = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

/**
 * Where a pasted block lands. With `at` (the focused cell) it is written from that cell on, growing
 * rows and columns as needed — it used to replace every reading whatever cell was focused. Without
 * `at` (the whole table selected, or a file imported), or into a table with nothing in it yet, it
 * replaces the readings, and an empty table also takes the pasted captions, so pasting a
 * spreadsheet sets the whole experiment up at once. A table that already holds readings keeps its
 * own captions — they may have been chosen carefully.
 */
export function applyPaste(table: LabTable, parsed: ParsedTable, at?: { row: number; col: number }): LabTable {
  const empty = table.rows.every((row) => row.every((v) => v === null || v === undefined))
  const offset = at && !empty ? Math.max(0, at.col) : 0
  const width = offset + Math.max(0, ...parsed.rows.map((r) => r.length), parsed.header?.length ?? 0)
  let next = table
  const used = new Set(next.columns.map((c) => c.name))
  const makeColumn = (caption: { name: string; unit: string } | undefined, usedFor: Set<string>) => {
    if (!caption) return undefined
    const display = caption.name.trim()
    if (!display) return undefined
    const name = formulaName(display, usedFor)
    return { name, unit: caption.unit, label: isUsableName(display) ? undefined : display }
  }

  for (let c = table.columns.length; c < width; c++) {
    const caption = parsed.header?.[c - offset]
    next = addColumn(next, makeColumn(caption, used))
  }

  if (at && !empty) return pasteRows(next, Math.max(0, at.row), offset, parsed.rows, parsed.texts)
  if (parsed.header && empty) {
    // Columns the captions do not rename keep their names, so a caption must not take one: "B"
    // pasted over column A of a table with A and B made two columns called B.
    const renamed = (col: LabColumn, i: number): boolean => !!parsed.header?.[i]?.name.trim() && !col.uncertaintyFor
    const usedEmpty = new Set(next.columns.filter((col, i) => !renamed(col, i)).map((c) => c.name))
    next = {
      ...next,
      columns: next.columns.map((col, i) => {
        const caption = parsed.header?.[i]
        if (!caption || col.uncertaintyFor) return col
        const display = caption.name.trim()
        if (!display) return col
        const name = formulaName(display, usedEmpty)
        return { ...col, name, unit: caption.unit, label: isUsableName(display) ? undefined : display }
      })
    }
  }
  return setRows(next, parsed.rows, parsed.texts)
}

/**
 * What a paste is for. In a cell being edited, one line with no tab is a value like any other text
 * ("1,2" is a decimal comma, not two readings) — it used to replace the whole table. Lines or tabs
 * are a block for the table; on the table itself, any separator makes a block.
 */
export function pasteTarget(text: string, inCell: boolean): 'text' | 'block' {
  const body = text.trim()
  if (!body) return 'text'
  return (inCell ? /[\t\n]/ : /[\t\n;,]/).test(body) ? 'block' : 'text'
}

/** What a saved file should be called: the experiment's own name, made safe for a filename. */
export function csvFileName(title: string): string {
  const safe = title.trim().replace(/[/:*?"<>|]/g, '').replace(/\s+/g, '-').slice(0, 40)
  return `${safe || 'lab-data'}.csv`
}


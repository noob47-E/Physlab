// What the Spreadsheet mode works out for every cell, kept out of the panel so it can be tested
// without a screen.

import { math } from '../math/expr'
import { keypadToMath } from './engine'

/** The grid's columns, and its rows (the panel draws this many of each). */
export const SHEET_COLS = ['A', 'B', 'C', 'D', 'E']
export const SHEET_ROWS = 15

const COLUMN = `[${SHEET_COLS.join('')}]`
const RANGE = new RegExp(`(${COLUMN})(\\d+):(${COLUMN})(\\d+)`, 'g')
const CELL = new RegExp(`\\b${COLUMN}\\d+\\b`, 'g')

type Word = 'CIRC' | 'ERROR'

/**
 * The value of every cell of the grid: a number, the text a student typed, '' for an empty cell, or
 * one of two words for a formula that has no number.
 *
 *  - CIRC: the formula reads itself, straight or through other cells (=A1 in A1, A1 → B1 → A1), or
 *    reads a cell that does. Every cell of such a circle shows it.
 *  - ERROR: the formula cannot be worked out (1/0, a typing slip), or reads a cell that cannot.
 *
 * A formula never works with a cell that has one of these words as if it were 0 — that was how a
 * circle came to show 0, and a cell that summed a range including itself came to show a number made
 * of fifty rounds of its own total. An empty cell or a word typed into a cell does count as 0.
 */
export function evaluateSheet(cells: Record<string, string>): Record<string, number | string> {
  const vals: Record<string, number | string> = {}
  // The cells that show CIRC or ERROR because of their formula. A student can also type the word CIRC
  // into a cell, and a formula reading that sees only text.
  const words = new Map<string, Word>()
  // The cells whose formula is being worked out right now, from the one the sheet started at down to
  // the one asking. A formula that reaches one of them has gone round a circle.
  const open = new Set<string>()
  const show = (id: string, word: Word) => {
    vals[id] = word
    words.set(id, word)
  }

  const work = (id: string): void => {
    if (id in vals) return
    const raw = cells[id] ?? ''
    if (!raw.startsWith('=')) {
      const n = Number(raw)
      vals[id] = raw === '' ? '' : Number.isFinite(n) ? n : raw
      return
    }
    open.add(id)
    try {
      const expr = raw.slice(1).replace(RANGE, (_m, c1: string, r1: string, c2: string, r2: string) => {
        const list: string[] = []
        for (let c = SHEET_COLS.indexOf(c1); c <= SHEET_COLS.indexOf(c2); c++) for (let r = Number(r1); r <= Number(r2); r++) list.push(`${SHEET_COLS[c]}${r}`)
        return `[${list.join(',')}]`
      })
      const scope: Record<string, number> = {}
      let circular = false
      let broken = false
      for (const ref of expr.match(CELL) ?? []) {
        if (open.has(ref)) {
          circular = true
          continue
        }
        work(ref)
        const word = words.get(ref)
        if (word === 'CIRC') circular = true
        else if (word === 'ERROR') broken = true
        const v = vals[ref]
        scope[ref] = typeof v === 'number' ? v : 0
      }
      if (circular) show(id, 'CIRC')
      else if (broken) show(id, 'ERROR')
      else {
        const r = Number(math.evaluate(keypadToMath(expr), scope))
        if (Number.isFinite(r)) vals[id] = r
        else show(id, 'ERROR')
      }
    } catch {
      show(id, 'ERROR')
    } finally {
      open.delete(id)
    }
  }

  for (let r = 1; r <= SHEET_ROWS; r++) for (const c of SHEET_COLS) work(`${c}${r}`)
  return vals
}

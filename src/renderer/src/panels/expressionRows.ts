// The rules behind the Expressions panel (P-GCALC GC4), kept out of the component so a test can
// cross the same boundary the student does. The rows are the scene's graphs, nothing else: the
// scene store is the one source of truth, so a graph typed in the command bar is a row here, and a
// row deleted here is gone from the Outliner too.

import { fmt } from '../math/format'
import type { GraphObj, ObjId, SceneObject } from '../core/types'

export interface ExpressionRow {
  id: ObjId
  source: string
  color: string
  visible: boolean
  width: number
  /** A y = f(x) line, the only kind "Draw only from … to …" applies to. */
  explicit: boolean
}

/** The default line width a graph is drawn with when it has none of its own (render/GraphView.tsx). */
export const DEFAULT_WIDTH = 2.4

/** One row per graph in the Graphing drawing, in scene order. */
export function expressionRows(objects: Record<ObjId, SceneObject>, order: readonly ObjId[]): ExpressionRow[] {
  const rows: ExpressionRow[] = []
  for (const id of order) {
    const o = objects[id]
    if (o?.type !== 'graph' || o.space !== 'graphing') continue
    const g = o as GraphObj
    rows.push({ id, source: g.source, color: g.color, visible: g.visible, width: g.width ?? DEFAULT_WIDTH, explicit: g.kind === 'explicit' })
  }
  return rows
}

/** The right-hand side of a typed y = f(x) (or f(x) = …), or null for any other kind of line. */
function rightSide(source: string): string | null {
  const m = source.match(/^\s*(?:y|[a-zA-Z]\s*\(\s*x\s*\))\s*=\s*(.+)$/)
  return m && !/[<>≤≥]/.test(m[1]) ? m[1].trim() : null
}

/**
 * The line to draw for "Draw only from `from` to `to`": `piecewise(f(x) from a to b)`, which the
 * command bar already draws. Both ends empty gives the line back unchanged. Only one end typed is
 * not a range: the line is returned as it is, and the panel asks for the other end.
 */
export function rangeLine(source: string, from: number | null, to: number | null): string {
  if (from === null || to === null) return source
  const rhs = rightSide(source)
  if (rhs === null) return source
  const [a, b] = from <= to ? [from, to] : [to, from]
  return `piecewise(${rhs} from ${fmt(a, 10)} to ${fmt(b, 10)})`
}

/**
 * The scene order after moving `id` one row up (−1) or down (+1) among the rows: it swaps places
 * with the next row in that direction, and every object that is not a row keeps its place.
 */
export function moveRow(order: readonly ObjId[], rowIds: readonly ObjId[], id: ObjId, dir: -1 | 1): ObjId[] {
  const at = rowIds.indexOf(id)
  const other = rowIds[at + dir]
  if (at < 0 || other === undefined) return [...order]
  const i = order.indexOf(id)
  const j = order.indexOf(other)
  const next = [...order]
  next[i] = other
  next[j] = id
  return next
}

/** The stretch a one-piece "Draw only from … to …" line draws on, or null for any other line. */
export function rangeOf(o: SceneObject | undefined): { expr: string; from: number; to: number } | null {
  if (o?.type !== 'graph') return null
  const g = o as GraphObj
  return g.kind === 'piecewise' && g.pieces?.length === 1 ? g.pieces[0] : null
}

/** A typed end of the range: a plain number, with the minus sign the panel itself writes (U+2212). */
const readEnd = (s: string): number | null | undefined => {
  const t = s.trim().replace(/\u2212/g, '-')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

/**
 * What the two range boxes ask for: the line to commit (null for nothing to do) and a sentence to
 * show under the row. Both ends: draw only there. Both emptied on a ranged line: the whole line
 * again. One end, or an end that is not a number: nothing changes, and the sentence says why.
 */
export function rangeEdit(source: string, range: { expr: string } | null, a: string, b: string): { line: string | null; note: string | null } {
  const lo = readEnd(a)
  const hi = readEnd(b)
  if (lo === undefined || hi === undefined) return { line: null, note: EXPRESSION_WORDS.notANumber }
  if (lo === null && hi === null) return { line: range ? `y = ${range.expr}` : null, note: null }
  if (lo === null || hi === null) return { line: null, note: EXPRESSION_WORDS.oneEnd }
  const base = range ? `y = ${range.expr}` : source
  const line = rangeLine(base, lo, hi)
  if (line === base) return { line: null, note: EXPRESSION_WORDS.cannotRange }
  return { line: line === source ? null : line, note: null }
}

export const EXPRESSION_WORDS = {
  heading: 'Expressions',
  add: 'Add an expression',
  placeholder: 'Type an equation, for example y = x^2',
  empty: 'No lines yet. Type an equation below, or open a picture in the Examples panel.',
  showHide: 'Show or hide this line',
  remove: 'Delete this line',
  width: 'Width',
  range: 'Draw only from',
  rangeTo: 'to',
  oneEnd: 'Type both ends to draw only part of the line.',
  notANumber: 'Each end must be a number, like -2 or 3.5.',
  cannotRange: 'Only a line written as y = … can be drawn on part of its range.'
} as const

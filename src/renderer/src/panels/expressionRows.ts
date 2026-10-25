// The rules behind the Expressions panel (P-GCALC GC4), kept out of the component so a test can
// cross the same boundary the student does. The rows are the scene's graphs and sliders, in scene
// order: the scene store is the one source of truth, so a graph typed in the command bar is a row here,
// and a row deleted here is gone from the Outliner too.

import { fmt } from '../math/format'
import type { Computed, GraphKind, GraphObj, NumberObj, ObjId, SceneObject } from '../core/types'
import { math, namedConstant, preprocess, sceneNames, symbolsOf } from '../math/expr'
import type { MathNode } from 'mathjs'
import { visibleIn } from '../core/visibility'
import { Builder } from '../core/factory'
import { scene, useScene } from '../core/store'
import { runCommand } from '../lang/commands'
import { putBack, replaceGraphEquation, stockOf } from '../lang/graphEdit'
import { bracketBareCalls } from '../lang/bareCalls'
import { bumpAction } from '../core/actionSignals'
import { evaluateScene } from '../core/evaluate'

export interface GraphRow {
  kind: 'graph'
  id: ObjId
  source: string
  color: string
  visible: boolean
  width: number
  /** A y = f(x) line, the only kind "Draw only from … to …" applies to. */
  explicit: boolean
  graphKind?: GraphKind
  exprs?: string[]
  tMin?: number
  tMax?: number
  vMin?: number
  vMax?: number
}

export interface SliderRow {
  kind: 'slider'
  id: ObjId
  name: string
  source: string
  value: number
  color: string
  visible: boolean
  min: number
  max: number
  step: number
  animate?: boolean
}

export interface CalcRow {
  kind: 'calc'
  id: ObjId
  name: string
  source: string
  expr: string
  value: number
  color: string
  visible: boolean
}

export type ExpressionRow = GraphRow | SliderRow | CalcRow

/** The default line width a graph is drawn with when it has none of its own (render/GraphView.tsx). */
export const DEFAULT_WIDTH = 2.4

/** One row per graph or slider in the Graphing drawing, in scene order. */
export function expressionRows(
  objects: Record<ObjId, SceneObject>,
  order: readonly ObjId[],
  ev?: { values?: Map<ObjId, Computed>; scope?: Record<string, unknown> }
): ExpressionRow[] {
  const rows: ExpressionRow[] = []
  for (const id of order) {
    const o = objects[id]
    if (!o) continue
    if (o.type === 'graph' && visibleIn(o, 'graphing')) {
      const g = o as GraphObj
      rows.push({
        kind: 'graph',
        id,
        source: g.source,
        color: g.color,
        visible: g.visible,
        width: g.width ?? DEFAULT_WIDTH,
        explicit: g.kind === 'explicit',
        graphKind: g.kind,
        exprs: g.exprs ?? [],
        tMin: g.tMin,
        tMax: g.tMax,
        vMin: g.vMin,
        vMax: g.vMax
      })
    } else if (o.type === 'number' && visibleIn(o, 'graphing')) {
      const num = o as NumberObj
      const c = ev?.values?.get(o.id)
      const val = c?.type === 'number' ? c.value : ((ev?.scope?.[o.name] as number) ?? (Number(num.expr) || 0))
      if (num.slider) {
        const s = num.slider
        rows.push({
          kind: 'slider',
          id,
          name: o.name,
          source: `${o.name} = ${fmt(val, 4)}`,
          value: val,
          color: o.color,
          visible: o.visible,
          min: s.min,
          max: s.max,
          step: s.step,
          animate: num.animate
        })
      } else {
        rows.push({
          kind: 'calc',
          id,
          name: o.name,
          expr: num.expr,
          source: o.name.startsWith('ans') ? `${num.expr} = ${fmt(val, 6)}` : `${o.name} = ${num.expr}`,
          value: val,
          color: o.color,
          visible: o.visible
        })
      }
    }
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

/** Detects free parameter symbols in an expression that could be offered as sliders. */
export function freeParametersFor(text: string, scope: Record<string, unknown> = {}): string[] {
  let expr = text.trim()
  if (!expr) return []

  // Direct assignments like "a = 1" or "k = 2.5" define a value, not a curve with free parameters
  const assign = expr.match(/^\s*([A-Za-z]\w*)\s*=\s*(.+)$/)
  if (assign) {
    const lhs = assign[1]
    const rhs = assign[2]
    const isCurveLhs = /^(?:y|z|r)$/.test(lhs)
    const hasCurveVar = /\b[xyzt]\b/.test(rhs)
    if (!isCurveLhs && !hasCurveVar) return []
  }

  const rel = expr.match(/^\s*(?:y|[A-Za-z]\w*\s*\(\s*x\s*\)|z|r)\s*=\s*(.+)$/)
  if (rel) expr = rel[1]
  else if (expr.includes('=')) {
    const parts = expr.split('=')
    expr = `(${parts[0]}) - (${parts[1]})`
  }

  let node: MathNode
  try {
    node = math.parse(preprocess(expr, sceneNames()))
  } catch {
    return []
  }

  const vars = new Set(['x', 'y', 'z', 't', 'theta', 'u', 'v', 'deg', 'rad'])
  const found: string[] = []
  for (const name of symbolsOf(node)) {
    if (vars.has(name)) continue
    if (scene().ev.names.has(name) || typeof scope[name] === 'number') continue
    if (namedConstant(name) !== undefined) continue
    if (typeof (math as unknown as Record<string, unknown>)[name] === 'function') continue
    if (!found.includes(name)) found.push(name)
  }
  return found
}

/** Creates a slider in the scene for a given variable name. */
export function createSlider(name: string, value = 1, min = -10, max = 10, step = 0.1): NumberObj {
  const existingId = scene().ev.names.get(name)
  if (existingId) {
    const existing = scene().objects[existingId]
    if (existing && existing.type === 'number') return existing as NumberObj
  }
  const b = new Builder()
  const obj = b.number(String(value), { name, slider: { min, max, step } })
  obj.space = 'graphing'
  b.commit()
  return obj
}

/** What the add box says under a line that drew nothing at all (2 + 3): its answer went to the Console, which students no longer see. */
export const NOT_A_NEW_GRAPH = 'That line does not draw anything. Type an equation such as y = x².'

/**
 * Adds an expression line to the scene, auto-creating sliders for offered parameters if accepted.
 * If the line is rejected or makes nothing, the scene, the undo history and the Console are put back as they were and the
 * reason comes back in a sentence for the panel to show under the box (the Console is hidden). The graph and its
 * auto-created sliders undo together in a single step.
 *
 * Only what this line wrote counts (G2c): the last Console entry used to decide, so an older line's error could undo a
 * good graph, and a line that made nothing (2 + 3) was "accepted" and vanished.
 */
export async function addExpressionLine(
  text: string,
  offers: string[] = []
): Promise<{ ok: boolean; reason?: string }> {
  // sin x, sin 2x, sqrt 3: the calculator-style calls get their brackets (lang/bareCalls).
  const trimmed = bracketBareCalls(text.trim())
  if (!trimmed) return { ok: false, reason: 'empty' }

  const stock = stockOf()
  const seen = stock.log.at(-1)?.id ?? 0
  const beforeCount = Object.values(scene().objects).filter((o) => o.type === 'graph').length

  for (const p of offers) {
    createSlider(p)
  }
  const withSliders = scene().objects

  let thrown: string | undefined
  try {
    await runCommand(trimmed)
  } catch (e) {
    thrown = e instanceof Error ? e.message : String(e)
  }

  const createdGraph = Object.values(scene().objects).filter((o) => o.type === 'graph').length > beforeCount
  const madeSomething = scene().objects !== withSliders
  const error = thrown ?? scene().log.filter((e) => e.id > seen && e.kind === 'error').at(-1)?.text

  if (error === undefined && (createdGraph || madeSomething)) {
    if (createdGraph) bumpAction('typedGraphs')
    const s = scene()
    useScene.setState({
      ev: evaluateScene(s.objects, s.order, s.settings, s.time)
    })
    if (offers.length > 0) {
      useScene.setState({ past: [...stock.past, { objects: stock.objects, order: stock.order }] })
    }
    return { ok: true }
  }

  // Pure arithmetic / scalar line (e.g. 2 + 2, 3 * 5, sqrt(16)): evaluate and create a calculation entry
  if (error === undefined && !createdGraph && !madeSomething) {
    try {
      const val = math.evaluate(preprocess(trimmed), scene().ev.scope)
      if (typeof val === 'number' && Number.isFinite(val)) {
        const b = new Builder()
        const names = scene().ev.names
        let numName = ''
        for (const candidate of ['a', 'b', 'c', 'd', 'k', 'm', 'n', 'p', 'q', 'u', 'v', 'w']) {
          if (!names.has(candidate)) {
            numName = candidate
            break
          }
        }
        if (!numName) {
          let i = 1
          while (names.has(`ans${i}`)) i++
          numName = `ans${i}`
        }
        const obj = b.number(trimmed, { name: numName })
        obj.space = 'graphing'
        b.commit()
        const s = scene()
        useScene.setState({
          ev: evaluateScene(s.objects, s.order, s.settings, s.time)
        })
        return { ok: true }
      }
    } catch {
      // not scalar arithmetic; fall through to putBack
    }
  }

  putBack(stock)
  const reason = error?.trim()
  return { ok: false, reason: reason ? (/[.!?]$/.test(reason) ? reason : `${reason}.`) : NOT_A_NEW_GRAPH }
}

/**
 * Commits a replacement equation for an existing graph, creating any free parameters as sliders.
 * If rejected, leaves no sliders behind and restores the old equation.
 * The edited equation and its new sliders undo together in a single step.
 */
export async function commitGraphEquation(
  id: ObjId,
  text: string
): Promise<{ ok: boolean; reason?: string }> {
  const stock = stockOf()
  const free = freeParametersFor(text, scene().ev.scope)

  for (const p of free) {
    createSlider(p)
  }

  const r = await replaceGraphEquation(id, text)
  if (!r.ok) {
    putBack(stock)
    return { ok: false, reason: r.reason }
  }

  if (free.length > 0) {
    useScene.setState({ past: [...stock.past, { objects: stock.objects, order: stock.order }] })
  }
  return { ok: true }
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
  move: 'Move',
  moveUp: 'Move up',
  moveDown: 'Move down',
  settings: 'Style and range',
  curve2d: '2D Curve',
  curve3d: '3D Curve',
  surface3d: '3D Surface',
  oneEnd: 'Type both ends to draw only part of the line.',
  notANumber: 'Each end must be a number, like -2 or 3.5.',
  cannotRange: 'Only a line written as y = … can be drawn on part of its range.',
  addSlider: 'add slider:',
  allSliders: 'all'
} as const

// Two small decisions behind the Properties panel, kept out of the component so a test can cross
// the same boundary the student does: a typed line in, a scene out.
//
// 1. Changing a graph's equation. The panel used to delete the graph and only then hand the new line
//    to the command bar. The bar refuses a line with nothing to draw, in a sentence and without
//    making anything, so a typo (or any refused line) left the student with no graph at all. Here
//    the new line runs first and the old graph is touched only when the line really drew one.
// 2. How far a point on a line, ray, segment or circle can slide: its slider is as long as the
//    object the point sits on, not always 0 to 1.

import { evaluateScene } from '../core/evaluate'
import { scene, useScene, type LogEntry, type SceneState } from '../core/store'
import type { GraphObj, ObjId, SceneObject } from '../core/types'
import { runCommand } from './commands'

// ---------------------------------------------------------------------------
// The Equation box of a graph
// ---------------------------------------------------------------------------

export type GraphEdit = { ok: true } | { ok: false; reason: string }

const KEPT = 'The graph keeps its old equation.'
const GONE = 'This graph is no longer there, so its equation cannot be changed.'
const EMPTY = `Type the equation to draw, for example y = x^2. ${KEPT}`
const NOT_A_GRAPH = `That line does not draw a graph. Type an equation such as y = x^2 here; other lines belong in the command bar. ${KEPT}`
/** The two lines that wipe the whole file, history and Lab Data included: nothing could be put back after them. */
const WIPES = /^(clear|new)$/i

/** What the line did to the scene, judged from the scene before and after it. */
export type EditOutcome =
  | { kind: 'one-graph'; fresh: ObjId }
  /** Several objects at once, at least one a graph (between(…) is three curves and a label): a picture. */
  | { kind: 'picture' }
  | { kind: 'nothing' }
  /** Made no graph, or changed something that was already there: a point, a slider, a deletion. */
  | { kind: 'other' }

type Shape = Pick<SceneState, 'objects' | 'order'>

/**
 * Pure: tells apart the four things a line typed into a graph's Equation box can do. Objects are
 * compared by identity, which is enough because the store never edits one in place. An object that
 * went away is allowed alongside a new graph: between(…) and tangent(…) clear the picture they
 * drew last time before drawing the new one.
 */
export function classifyEdit(before: Shape, after: Shape): EditOutcome {
  const made = after.order.filter((id) => after.objects[id] && !before.objects[id])
  const gone = before.order.filter((id) => !after.objects[id])
  const changed = before.order.filter((id) => after.objects[id] && after.objects[id] !== before.objects[id])
  if (made.length === 0) return gone.length || changed.length ? { kind: 'other' } : { kind: 'nothing' }
  if (changed.length || !made.some((id) => after.objects[id].type === 'graph')) return { kind: 'other' }
  return made.length === 1 && gone.length === 0 ? { kind: 'one-graph', fresh: made[0] } : { kind: 'picture' }
}

/** What a refused line has to put back: everything a command can touch in the scene store. */
type Stock = Pick<SceneState, 'objects' | 'order' | 'selection' | 'past' | 'future' | 'log' | 'dirty'>

const stockOf = (): Stock => {
  const { objects, order, selection, past, future, log, dirty } = scene()
  return { objects, order, selection, past, future, log, dirty }
}

/**
 * Puts the scene back exactly as it was before the line ran: the objects, what was selected, the
 * Console and the undo history, so a refused line leaves no step to undo and no echo of a thing
 * that was never kept. The store has no action for this (its undo would leave the line's step on
 * the redo side), and its other actions all record history.
 */
function putBack(stock: Stock): void {
  const s = scene()
  useScene.setState({
    ...stock,
    ev: evaluateScene(stock.objects, stock.order, s.settings, s.time),
    hovered: s.hovered && stock.objects[s.hovered] ? s.hovered : null
  })
}

/** The command bar's own refusal for the line just run (its last Console entry), or the plain fallback. */
function refusalFor(log: LogEntry[], seen: number): string {
  const last = log.filter((e) => e.id > seen).at(-1)
  if (last?.kind !== 'error' || !last.text) return NOT_A_GRAPH
  return `${/[.!?]$/.test(last.text.trim()) ? last.text.trim() : `${last.text.trim()}.`} ${KEPT}`
}

/**
 * The fields that say WHAT a graph draws: they come from the new equation. `solvedXs` is the list
 * of solutions the command bar may leave on an equation in x alone (math/graphs.ts carriedSolutions).
 * A field a graph gains that belongs here must be added, or an edited graph keeps the old
 * equation's value of it: tests/graphEdit.test.ts fails for any field of a graph the command bar
 * makes that is in neither list.
 */
export const GRAPH_DEFINES = ['kind', 'source', 'exprs', 'tMin', 'tMax', 'op', 'pieces', 'solvedXs'] as const
/** The fields that are the student's own (who it is, how it looks): they stay. The two marks are handled apart. */
export const GRAPH_KEEPS = ['id', 'type', 'name', 'visible', 'locked', 'color', 'themed', 'showLabel', 'labelMode', 'labelPin', 'auxiliary', 'caption', 'label', 'space', 'width', 'showRoots', 'showExtrema'] as const

/**
 * What a new equation changes in an existing graph: what it draws. The student's own choices — the
 * colour, line width, name, label and (on a y = f(x) curve) the Roots and Max / min ticks — stay,
 * and so does the graph's identity, so a label that belongs to it stays attached.
 */
function takeDefinition(into: GraphObj, from: GraphObj): void {
  const keepsMarks = into.kind === 'explicit' && from.kind === 'explicit'
  const mine = into as unknown as Record<string, unknown>
  const theirs = from as unknown as Record<string, unknown>
  for (const key of GRAPH_DEFINES) {
    if (theirs[key] === undefined) delete mine[key]
    else mine[key] = structuredClone(theirs[key])
  }
  // Another kind of graph starts from that kind's own marks (a circle has no roots to tick).
  into.showRoots = keepsMarks ? (into.showRoots ?? from.showRoots) : from.showRoots
  into.showExtrema = keepsMarks ? (into.showExtrema ?? from.showExtrema) : from.showExtrema
}

/**
 * Changes what graph `id` draws to what the command bar makes of `line`.
 *
 * The line runs first. Exactly one new graph: the old graph takes over its definition in place,
 * keeping its name, colour, width, marks and id, and the new copy goes — the whole edit is one undo
 * step. A small picture (between, tangent): it replaces the old graph. A line that makes nothing,
 * or anything that is not a graph: the old graph stays, nothing else in the scene changes, and the
 * reason comes back in a sentence for the panel to show under the field.
 */
export async function replaceGraphEquation(id: ObjId, line: string): Promise<GraphEdit> {
  const text = line.trim()
  if (scene().objects[id]?.type !== 'graph') return { ok: false, reason: GONE }
  if (!text) return { ok: false, reason: EMPTY }
  if (WIPES.test(text)) return { ok: false, reason: NOT_A_GRAPH }

  const stock = stockOf()
  const seen = stock.log.at(-1)?.id ?? 0
  try {
    await runCommand(text)
  } catch {
    // runCommand reports its own errors in the Console; a throw is a surprise, so nothing is kept.
    putBack(stock)
    return { ok: false, reason: NOT_A_GRAPH }
  }

  const after = scene()
  const outcome = classifyEdit(stock, after)
  if (outcome.kind === 'nothing') return { ok: false, reason: refusalFor(after.log, seen) }
  if (outcome.kind === 'other') {
    putBack(stock)
    return { ok: false, reason: NOT_A_GRAPH }
  }
  if (outcome.kind === 'picture') {
    // The picture's own command may already have cleared the old graph (it was part of the last one).
    if (scene().objects[id]) scene().removeObjects([id], { record: false })
    return { ok: true }
  }
  const fresh = after.objects[outcome.fresh]
  if (fresh?.type !== 'graph') return { ok: true }
  try {
    // runCommand recorded one undo step (the scene before the line); these join it.
    scene().updateObject(id, (d) => void (d.type === 'graph' && takeDefinition(d, fresh)), false)
    scene().removeObjects([fresh.id], { record: false })
    // The line selected the new graph; the one the student is editing is the old one.
    scene().select([id])
  } catch {
    putBack(stock)
    return { ok: false, reason: NOT_A_GRAPH }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// The slider of a point that sits on another object
// ---------------------------------------------------------------------------

export interface SliderRange {
  min: number
  max: number
  step: number
}

/** `floor` while `x` fits in it, otherwise the next power of ten that holds `x`: a range changes size rarely, and by a lot. */
function roomFor(x: number, floor: number): number {
  if (x <= floor) return floor
  let top = 10 ** Math.ceil(Math.log10(x))
  if (top / 10 >= x) top /= 10 // log10 rounded up at an exact power of ten
  return top
}

/** 1000 to 10000 steps across the range: fine enough for the thumb, big enough for the arrow keys. */
const rangeOf = (min: number, max: number): SliderRange => ({ min, max, step: 10 ** (Math.floor(Math.log10(max - min)) - 3) })

/**
 * The range of the slider for a point at `t` on `host`. t is a fraction of the way for a segment
 * (0 is its first end, 1 its second) and of a full turn for a circle, so both are 0 to 1; on a ray
 * it counts in lengths of the first-to-second-point step from the first point, 0 and up; on a line,
 * either way. The range always holds t, whatever the host, so the thumb is never stuck at an end
 * and a small move of it leaves the point close to where it was.
 *
 * A circle and a segment keep 0 to 1; a ray starts at 0 and a line at one length before its first
 * point, and both reach two past the second until t is further out than that, when they grow to
 * the next power of ten that holds it (a line both ways). Dragging the thumb to the far end puts t
 * exactly on that end, which still fits, so the range does not run away from the pointer. A point
 * is never on a graph: evaluate.ts refuses any host but these four.
 */
export function pointOnRange(host: SceneObject | undefined, t: number): SliderRange {
  const at = Number.isFinite(t) ? t : 0
  const type = host?.type
  if (type === 'ray' && at >= 0) return rangeOf(0, roomFor(at, 2))
  if (type === 'line' && at >= -1 && at <= 2) return rangeOf(-1, 2)
  if (type !== 'line' && type !== 'ray' && at >= 0 && at <= 1) return rangeOf(0, 1)
  const reach = roomFor(Math.abs(at), 10)
  return rangeOf(-reach, reach)
}

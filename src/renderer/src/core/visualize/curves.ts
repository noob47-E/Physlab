// Curve, vector, point, and solution scene object creation, camera framing, and tagged drawing tracking.
// Pure moves from core/visualize.ts (CW10f).

import { Builder } from '../factory'
import { scene } from '../store'
import type { V3 } from '../../math/vec'
import { planDrawing, type DrawStyle, type Solution, type VisualVector } from '../../math/vectorSolver'
import { compileScalar, sceneNames } from '../../math/expr'
import { fmtLabel } from '../../math/format'
import { curveBox, slopeAt, type Box } from '../../math/graphs'
import { is3DGraph, type GraphKind, type GraphObj, type SceneObject } from '../types'
import { fitCamera } from '../../render/viewState'
import { mixOklabMany, mixParents } from '../../render/colourMix'
import { seriesColor, themeColor } from '../../app/theme'
import { EXPLICIT_LIMIT } from './roots'

export type { DrawStyle }


/** The answer is drawn in the warning colour and helpers in the faint one, whichever theme is on. */
const roleColor = (role: VisualVector['role']): string | undefined =>
  role === 'result' ? themeColor('--warn', '#ffb84d') : role === 'helper' ? themeColor('--text-faint', '#6c707a') : undefined

// ---------------------------------------------------------------------------
// Drawing the current answer, not every answer ever asked for
// ---------------------------------------------------------------------------
//
// "Draw on graph" used to add a fresh copy every time it was pressed: two presses left A1, B1, R1
// sitting on top of A, B, R, and after a few questions the canvas was unreadable. Each kind of
// drawing now remembers what it put there last time and clears it first, so the viewport shows the
// answer you are looking at.
//
// Graphs are deliberately left out of this. Typing a second equation into the command bar is
// meant to add a second curve — comparing two functions is the whole point of a graph — so
// visualizeGraph keeps stacking.

const drawn = new Map<string, string[]>()

/** Removes what the previous drawing of this kind left behind, if it is still there. */
export function clearTagged(tag: string): void {
  const s = scene()
  const ids = drawn.get(tag) ?? []
  const alive = ids.filter((id) => s.objects[id])
  if (alive.length) s.removeObjects(alive)
  // The answer's parents go with it: the map is not saved, and an id is never reused, but it
  // would otherwise hold every answer ever drawn.
  for (const id of ids) mixParents.delete(id)
  drawn.delete(tag)
}

/** Whether an object is something a drawing here put there: the Vector Calculator leaves those out of its cards. */
export const isDrawnAnswer = (id: string): boolean => [...drawn.values()].some((ids) => ids.includes(id))

/** Records what this drawing created, so the next one of the same kind can replace it. */
export function remember(tag: string, b: Builder): void {
  drawn.set(
    tag,
    b.created.map((o) => o.id)
  )
}

/**
 * Draws a worked answer. `style` is only passed when the student chose a layout; otherwise the
 * solution's own picture is used (a subtraction from a common tail, a sum head-to-tail).
 *
 * The layout itself is planDrawing's, pure and tested: every vector that is not an input is
 * drawn from its own components (the parallelogram layout used to rebuild the result as "A + B"
 * from the title, which drew A + B for a subtraction), and an arrow drawn to a stand-in length
 * is a helper with its true value written at its head, never a measurement.
 */
export function visualizeSolution(sol: Solution, style?: DrawStyle): void {
  const vis = sol.visual
  if (!vis) return
  clearTagged('solution')
  const b = new Builder()
  const plan = planDrawing(vis, style)
  const made = new Map<string, SceneObject>()
  const faint = themeColor('--text-faint', '#6c707a')
  const inputs: SceneObject[] = []
  const results: SceneObject[] = []
  for (const it of plan.items) {
    if (it.kind === 'arrow') {
      const o = b.vector({ kind: 'free', tail: it.tail, comp: it.comp }, { name: it.name, color: roleColor(it.role), auxiliary: it.auxiliary })
      if (it.labelMode) o.labelMode = it.labelMode
      if (it.label) o.label = it.label
      made.set(it.name, o)
      if (it.role === 'input') inputs.push(o)
      else if (it.role === 'result') results.push(o)
    } else if (it.kind === 'ghost') {
      // Dashed opposite sides, linked to the originals so dragging keeps the parallelogram.
      const of = made.get(it.of)
      const at = made.get(it.atHeadOf)
      if (of && at) b.vector({ kind: 'placed', vector: of.id, tail: headPoint(b, at.id) }, { name: it.name, color: faint, auxiliary: true })
    } else {
      b.text(it.at, it.text, { name: it.name, auxiliary: true })
    }
  }
  // An answer with two or more parents is coloured between them (the vector view redoes the mix
  // from the parents' live colours; the stored colour is what a reload falls back to). An answer
  // of one input keeps the warning colour, which is the only thing that tells it from its input.
  if (inputs.length >= 2) {
    for (const o of results) {
      o.color = mixOklabMany(inputs.map((p) => p.color))
      mixParents.set(o.id, inputs.map((p) => p.id))
    }
  }
  b.commit()
  remember('solution', b)
  if (plan.is3D) scene().setViewMode('3d')
  const chosen = plan.select ? made.get(plan.select) : undefined
  scene().select(chosen ? [chosen.id] : [])
  fitCamera()
}

function headPoint(b: Builder, vectorId: string): string {
  return b.point({ kind: 'vectorHead', vector: vectorId }, { auxiliary: true, visible: false }).id
}

export function visualizeVector(v: V3, name?: string, tail: V3 = [0, 0, 0]): void {
  clearTagged('value')
  const b = new Builder()
  b.vector({ kind: 'free', tail, comp: v }, { name })
  b.commit()
  remember('value', b)
  if (Math.abs(v[2]) > 1e-9 || Math.abs(tail[2]) > 1e-9) scene().setViewMode('3d')
}

export function visualizePoint(p: V3, name?: string): void {
  clearTagged('value')
  const b = new Builder()
  b.point(p, { name })
  b.commit()
  remember('value', b)
}

/**
 * Draws a graph. With `reuse` (the Visualize buttons), a line that is already drawn is selected and
 * shown instead: pressing Visualize twice on one line used to stack a second, identical graph and a
 * second Expressions row. Returns whether it drew a new graph. A line typed in the bar never reuses.
 */
export function visualizeGraph(source: string, exprs: string[], kind: GraphKind = 'explicit', extra: { tMin?: number; tMax?: number; vMin?: number; vMax?: number; op?: '<' | '<=' | '>' | '>='; name?: string; color?: string; reuse?: boolean } = {}): boolean {
  if (extra.reuse) {
    const same = Object.values(scene().objects).find(
      (o) => o.type === 'graph' && o.kind === kind && o.op === extra.op && o.tMin === extra.tMin && o.tMax === extra.tMax && o.exprs.length === exprs.length && o.exprs.every((e, i) => e === exprs[i])
    )
    if (same) {
      if (!same.visible) scene().updateObject(same.id, (d) => void (d.visible = true))
      scene().select([same.id])
      scene().setViewMode(is3DGraph(kind) ? '3d' : '2d')
      return false
    }
  }
  const b = new Builder()
  b.graph({ kind, source, exprs, tMin: extra.tMin, tMax: extra.tMax, vMin: extra.vMin, vMax: extra.vMax, op: extra.op, showRoots: kind === 'explicit', showExtrema: kind === 'explicit' }, { name: extra.name, color: extra.color })
  b.commit()
  // A graph in space opens the 3-D view (3D-2: a surface, a curve in space, a plane, a parametric surface).
  if (is3DGraph(kind)) scene().setViewMode('3d')
  else scene().setViewMode('2d')
  return true
}

/** The student's precision for a number written on the drawing. */
export const precision = () => scene().settings

/**
 * A point or label that belongs to a graph goes where the graph goes. Builder stamps a graph with
 * 'graphing' but everything else with the mode the student is in, and a picture is asked for from
 * Vectors (the launch mode) or Practice as often as from Graphing: the curves would switch the app
 * to Graphing while the area label, the point T and the slope stayed behind in a space nobody was
 * looking at.
 */
export const inGraphing = <T extends SceneObject>(o: T): T => {
  o.space = 'graphing'
  return o
}

/** A curve's formula as a function of x that reads the scene's sliders, the way the viewport draws it. */
export const curveOf = (expr: string) => {
  const f = compileScalar(expr, ['x'], () => scene().ev.scope, sceneNames())
  return (x: number) => f({ x })
}

/**
 * f(x) with its tangent line at x = a (derivative visualisation). `hideSlope` leaves the
 * "slope =" label off: a question asking for that slope must not have it written on the drawing
 * before the student has answered.
 */
export function visualizeTangent(expr: string, a: number, fa: number, slope: number, hideSlope = false): void {
  clearTagged('calculus')
  const b = new Builder()
  b.graph({ kind: 'explicit', source: `y = ${expr}`, exprs: [expr], showRoots: false, showExtrema: false })
  const tangent = `${fa} + ${slope} * (x - ${a})`
  const line = b.graph({ kind: 'explicit', source: `tangent at x = ${fmtLabel(a, precision())}`, exprs: [tangent], width: 1.8 }, { color: themeColor('--warn', '#ffb84d'), name: 'tangent' })
  inGraphing(b.point([a, fa, 0], { name: 'T' }))
  // The slope goes with the tangent line when the student deletes it, as the area goes with its region.
  if (!hideSlope) inGraphing(b.text([a, fa, 0], `slope = ${fmtLabel(slope, precision())}`, { name: 'slopeText' })).owner = line.id
  b.commit()
  remember('calculus', b)
  scene().setViewMode('2d')
}

/**
 * The tangent to y = expr at x = a from the formula alone: the height and the slope are worked
 * out here (a question picture names only the curve and the point), and the drawing is
 * visualizeTangent's. Refuses, in a sentence, a point where the curve has no value or no slope.
 */
export function visualizeTangentAt(expr: string, a: number, hideSlope = false): { fa: number; slope: number } {
  const f = curveOf(expr)
  const fa = f(a)
  const slope = slopeAt(f, a)
  const at = fmtLabel(a, precision())
  if (!Number.isFinite(fa)) throw new Error(`y = ${expr} has no value at x = ${at}, so there is no tangent there.`)
  if (!Number.isFinite(slope)) throw new Error(`y = ${expr} has no slope at x = ${at}, so there is no tangent there.`)
  // The viewport leaves out every point of a curve higher than EXPLICIT_LIMIT, the tangent line with
  // them: tangent(x^3, 1000) said "Tangent drawn" while only the point T showed.
  if (Math.abs(fa) > EXPLICIT_LIMIT) throw new Error(`At x = ${at} the curve is at y = ${fmtLabel(fa, precision())}, too far out to draw, so its tangent cannot be shown there.`)
  visualizeTangent(expr, a, fa, slope, hideSlope)
  return { fa, slope }
}

/**
 * One curve made of several formulas, each on its own stretch of x. Drawn as one graph object so
 * it is selected, coloured and deleted as one curve, and stacks like any other graph typed into
 * the bar: a second piecewise curve is a second curve to compare, not a replacement.
 */
export function visualizePiecewise(pieces: NonNullable<GraphObj['pieces']>, name?: string, source?: string): void {
  if (!pieces.length) throw new Error('A piecewise curve needs at least one piece.')
  const b = new Builder()
  // The source is what Properties' Equation field re-runs, so it is the bar's own spelling with the
  // bounds written in full: a rounded bound would quietly move the piece on the first edit.
  const text = source ?? `piecewise(${pieces.map((p) => `${p.expr} from ${String(p.from)} to ${String(p.to)}`).join(', ')})`
  b.graph({ kind: 'piecewise', source: text, exprs: pieces.map((p) => p.expr), pieces, showRoots: false, showExtrema: false }, { name })
  b.commit()
  scene().setViewMode('2d')
}


/**
 * A curve drawn only over its own stretch of x. An explicit graph is drawn across the whole view
 * whatever its tMin and tMax say (they only frame it), so the two trains' speed lines ran on
 * below zero past the moment each stopped; one piece of a piecewise graph stops where it should.
 */
export function stretchOf(expr: string, from?: number, to?: number): Omit<GraphObj, 'id' | 'name' | 'color' | 'visible' | 'locked' | 'showLabel' | 'type'> {
  if (from === undefined || to === undefined || !(to > from)) return { kind: 'explicit', source: `y = ${expr}`, exprs: [expr], tMin: from, tMax: to, showRoots: false, showExtrema: false }
  return { kind: 'piecewise', source: `piecewise(${expr} from ${String(from)} to ${String(to)})`, exprs: [expr], pieces: [{ expr, from, to }], showRoots: false, showExtrema: false }
}


/** A box round some points in the plane with the origin in it, for a drawing that has no graph to frame. */
export function frameAround(points: [number, number][]): void {
  const xs = [0, ...points.map((p) => p[0])]
  const ys = [0, ...points.map((p) => p[1])]
  fitCamera({ min: [Math.min(...xs), Math.min(...ys), 0], max: [Math.max(...xs), Math.max(...ys), 0] })
}


/**
 * Several curves on one drawing, each in its own series colour and carrying its label ("Train
 * A"), each over its own stretch of x. They replace the last set of compared curves, not any
 * graph the student typed.
 */
export function visualizeCurves(items: { expr: string; label: string; from?: number; to?: number }[]): void {
  if (!items.length) throw new Error('This picture has no curves to draw.')
  clearTagged('curves')
  const b = new Builder()
  items.forEach((it, i) => {
    const g = b.graph(stretchOf(it.expr, it.from, it.to), { color: seriesColor(i) })
    g.label = it.label
    // The name is written on the curve as well: a graph's own label shows only on hover by
    // default, and which line is Train A must not depend on a hover.
    const f = curveOf(it.expr)
    const from = it.from ?? -5
    const to = it.to ?? 5
    const x = from + (to - from) * (0.2 + 0.25 * (i % 3))
    const y = f(x)
    if (Number.isFinite(y)) inGraphing(b.text([x, y, 0], it.label, { name: 'curveText', auxiliary: true })).owner = g.id
  })
  b.commit(false)
  remember('curves', b)
  scene().setViewMode('2d')
}


/**
 * The box a graph with ends fills: a piecewise curve, a shaded region, an area, or a curve drawn
 * between two x values. A curve with no ends (y = sin x typed into the bar) runs for ever and has
 * no box, so framing leaves it to the view. `Fit everything in view` reads this too; it used to
 * skip every graph, and a cyclist's x–t plot reaching 87 m stayed off the top of the screen.
 */
export function graphBox(g: GraphObj): Box | null {
  const on = (expr: string, from: number | undefined, to: number | undefined) => ({ f: curveOf(expr), from: from ?? NaN, to: to ?? NaN })
  switch (g.kind) {
    case 'piecewise':
      return curveBox((g.pieces ?? []).map((p) => on(p.expr, p.from, p.to)))
    case 'between':
      return curveBox(g.exprs.slice(0, 2).map((e) => on(e, g.tMin, g.tMax)))
    case 'area':
      return curveBox([on(g.exprs[0], g.tMin, g.tMax), on('0', g.tMin, g.tMax)])
    case 'explicit':
      return curveBox([on(g.exprs[0], g.tMin, g.tMax)])
    default:
      return null
  }
}

/**
 * Frames the camera on the graphs among `ids` (with the origin, so the axes still mean
 * something). A question's picture is drawn where the default zoom is not looking: its region or
 * its motion sat almost entirely off screen. Says whether there was anything to frame.
 */
export function frameGraphs(ids: string[]): boolean {
  const objects = scene().objects
  let box: Box | null = null
  for (const id of ids) {
    const o = objects[id]
    if (o?.type !== 'graph') continue
    const g = graphBox(o)
    if (!g) continue
    box = box ? { min: [Math.min(box.min[0], g.min[0]), Math.min(box.min[1], g.min[1]), 0], max: [Math.max(box.max[0], g.max[0]), Math.max(box.max[1], g.max[1]), 0] } : g
  }
  if (!box) return false
  fitCamera({ min: [Math.min(box.min[0], 0), Math.min(box.min[1], 0), 0], max: [Math.max(box.max[0], 0), Math.max(box.max[1], 0), 0] })
  return true
}

/**
 * Lab readings on the drawing: the measured points, and the fitted line through them as a graph
 * object that lives in the scene like anything else — so it can be measured, zoomed, exported as a
 * picture, or have a tangent taken. A student's own data becomes part of the drawing rather than
 * something trapped in a side panel.
 */
export function visualizeReadings(xs: number[], ys: number[], expr: string | null, title: string): void {
  if (!xs.length) return
  clearTagged('readings')
  const b = new Builder()
  xs.forEach((x, i) => b.point([x, ys[i], 0], { auxiliary: true, showLabel: false }))
  if (expr) b.graph({ kind: 'explicit', source: title, exprs: [expr], showRoots: false, showExtrema: false }, { name: 'fit' })
  b.commit()
  remember('readings', b)
  scene().setViewMode('2d')
  // Readings are rarely near the origin at the scale the grid starts on — free fall runs 0 to 5 m
  // against 0 to 1 s² — so the camera has to come to the data.
  fitCamera()
}


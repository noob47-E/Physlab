// Calculator/solver → scene bridge: turn results into live objects.

import { Builder } from './factory'
import { scene } from './store'
import type { V3 } from '../math/vec'
import { planDrawing, type DrawStyle, type Solution, type VisualVector } from '../math/vectorSolver'
import { compileScalar } from '../math/expr'
import { fmtPrecise } from '../math/format'
import { betweenArea, curveBox, slopeAt, type Box } from '../math/graphs'
import type { GraphKind, GraphObj, SceneObject } from './types'
import { fitCamera } from '../render/viewState'
import { mixOklabMany, mixParents } from '../render/colourMix'
import { themeColor } from '../app/theme'

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
function clearTagged(tag: string): void {
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
function remember(tag: string, b: Builder): void {
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

export function visualizeGraph(source: string, exprs: string[], kind: GraphKind = 'explicit', extra: { tMin?: number; tMax?: number; op?: '<' | '<=' | '>' | '>='; name?: string; color?: string } = {}): void {
  const b = new Builder()
  b.graph({ kind, source, exprs, tMin: extra.tMin, tMax: extra.tMax, op: extra.op, showRoots: kind === 'explicit', showExtrema: kind === 'explicit' }, { name: extra.name, color: extra.color })
  b.commit()
  if (kind === 'surface') scene().setViewMode('3d')
  else scene().setViewMode('2d')
}

/** The student's precision for a number written on the drawing. */
const precision = () => scene().settings

/**
 * A point or label that belongs to a graph goes where the graph goes. Builder stamps a graph with
 * 'graphing' but everything else with the mode the student is in, and a picture is asked for from
 * Vectors (the launch mode) or Practice as often as from Graphing: the curves would switch the app
 * to Graphing while the area label, the point T and the slope stayed behind in a space nobody was
 * looking at.
 */
const inGraphing = <T extends SceneObject>(o: T): T => {
  o.space = 'graphing'
  return o
}

/** A curve's formula as a function of x that reads the scene's sliders, the way the viewport draws it. */
const curveOf = (expr: string) => {
  const f = compileScalar(expr, ['x'], () => scene().ev.scope)
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
  const line = b.graph({ kind: 'explicit', source: `tangent at x = ${fmtPrecise(a, precision())}`, exprs: [tangent], width: 1.8 }, { color: themeColor('--warn', '#ffb84d'), name: 'tangent' })
  inGraphing(b.point([a, fa, 0], { name: 'T' }))
  // The slope goes with the tangent line when the student deletes it, as the area goes with its region.
  if (!hideSlope) inGraphing(b.text([a, fa, 0], `slope = ${fmtPrecise(slope, precision())}`, { name: 'slopeText' })).owner = line.id
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
  const at = fmtPrecise(a, precision())
  if (!Number.isFinite(fa)) throw new Error(`y = ${expr} has no value at x = ${at}, so there is no tangent there.`)
  if (!Number.isFinite(slope)) throw new Error(`y = ${expr} has no slope at x = ${at}, so there is no tangent there.`)
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
 * The region between y = upper and y = lower for x from a to b: both curves in full, the region
 * shaded between them, and its area written in the middle of it in the student's precision.
 * Returns the area so the caller can say it in words too. `hideArea` leaves the "area =" label
 * off, for a question that asks for exactly that area and has not been answered yet.
 */
export function visualizeBetween(upper: string, lower: string, a: number, bnd: number, label?: string, hideArea = false): number {
  const lo = Math.min(a, bnd)
  const hi = Math.max(a, bnd)
  const s = precision()
  if (lo === hi) throw new Error(`The region needs a stretch of x: from and to are the same x, ${fmtPrecise(lo, s)}.`)
  const u = curveOf(upper)
  const l = curveOf(lower)
  const area = betweenArea(u, l, lo, hi)
  if (!Number.isFinite(area)) throw new Error(`A curve runs off to infinity between x = ${fmtPrecise(lo, s)} and ${fmtPrecise(hi, s)}, so the region has no area.`)
  clearTagged('calculus')
  const b = new Builder()
  b.graph({ kind: 'explicit', source: `y = ${upper}`, exprs: [upper], showRoots: false, showExtrema: false })
  b.graph({ kind: 'explicit', source: `y = ${lower}`, exprs: [lower], showRoots: false, showExtrema: false })
  // The source is the bar's own spelling, so editing it in Properties re-runs it; a caption the
  // caller wants (a question's own words) is the label, never the source.
  const region = b.graph(
    { kind: 'between', source: `between(${upper}, ${lower}, ${String(lo)}, ${String(hi)})`, exprs: [upper, lower], tMin: lo, tMax: hi },
    { color: themeColor('--accent', '#4f8cff'), name: 'region' }
  )
  if (label) region.label = label
  // The label sits at the middle of the region's width, halfway between the curves there; where a
  // curve has no value in the middle it sits on the axis rather than nowhere.
  const xm = (lo + hi) / 2
  const um = u(xm)
  const lm = l(xm)
  const ym = Number.isFinite(um) && Number.isFinite(lm) ? (um + lm) / 2 : 0
  if (!hideArea) {
    const areaText = b.text([xm, ym, 0], `area = ${fmtPrecise(area, s)}`, { name: 'areaText' })
    areaText.owner = region.id
    inGraphing(areaText)
  }
  b.commit()
  remember('calculus', b)
  scene().setViewMode('2d')
  return area
}

/** f(x) with the area between the curve and the x-axis from a to b shaded (integral visualisation). */
export function visualizeArea(expr: string, a: number, bnd: number, label: string): void {
  clearTagged('calculus')
  const b = new Builder()
  b.graph({ kind: 'explicit', source: `y = ${expr}`, exprs: [expr], showRoots: false, showExtrema: false })
  b.graph({ kind: 'area', source: label, exprs: [expr], tMin: Math.min(a, bnd), tMax: Math.max(a, bnd) }, { color: themeColor('--accent', '#4f8cff'), name: 'area' })
  b.commit()
  remember('calculus', b)
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

/** Marks points (e.g. equation roots) on the x-axis. */
export function visualizeRoots(roots: number[], expr?: string): void {
  const b = new Builder()
  if (expr) b.graph({ kind: 'explicit', source: `y = ${expr}`, exprs: [expr], showRoots: true, showExtrema: true })
  roots.forEach((r) => b.point([r, 0, 0], {}))
  b.commit()
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

// Calculator/solver → scene bridge: turn results into live objects.

import type { MathNode } from 'mathjs'
import { Builder } from './factory'
import { scene } from './store'
import type { V3 } from '../math/vec'
import { planDrawing, type DrawStyle, type Solution, type VisualVector } from '../math/vectorSolver'
import { compileScalar, math, namedConstant, preprocess, sceneNames, symbolsOf, type ScalarFn } from '../math/expr'
import { fmtLabel, type Precision } from '../math/format'
import { betweenArea, curveBox, implicitSegments, inequalityMesh, slopeAt, surfaceGeometry, verticalLineXs, type Box, type Fx, type Fxy } from '../math/graphs'
import { parseExpr, varsOf, writeTimes } from '../math/pure/mono'
import { pDeg, pDivMod, pGcd, pPrimitive, pTrim, polyFromExpr, type Poly } from '../math/pure/poly'
import { rMul, rNum, rSign, rat } from '../math/pure/rat'
import { discriminant } from '../math/pure/factor'
import { polyRoots } from '../calc/engine'
import type { GraphKind, GraphObj, SceneObject } from './types'
import { fitCamera } from '../render/viewState'
import { POINT_PX } from '../render/viewMath'
import { mixOklabMany, mixParents } from '../render/colourMix'
import { seriesColor, themeColor } from '../app/theme'

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

/**
 * Draws a graph. With `reuse` (the Visualize buttons), a line that is already drawn is selected and
 * shown instead: pressing Visualize twice on one line used to stack a second, identical graph and a
 * second Expressions row. Returns whether it drew a new graph. A line typed in the bar never reuses.
 */
export function visualizeGraph(source: string, exprs: string[], kind: GraphKind = 'explicit', extra: { tMin?: number; tMax?: number; op?: '<' | '<=' | '>' | '>='; name?: string; color?: string; reuse?: boolean } = {}): boolean {
  if (extra.reuse) {
    const same = Object.values(scene().objects).find(
      (o) => o.type === 'graph' && o.kind === kind && o.op === extra.op && o.tMin === extra.tMin && o.tMax === extra.tMax && o.exprs.length === exprs.length && o.exprs.every((e, i) => e === exprs[i])
    )
    if (same) {
      if (!same.visible) scene().updateObject(same.id, (d) => void (d.visible = true))
      scene().select([same.id])
      scene().setViewMode(kind === 'surface' ? '3d' : '2d')
      return false
    }
  }
  const b = new Builder()
  b.graph({ kind, source, exprs, tMin: extra.tMin, tMax: extra.tMax, op: extra.op, showRoots: kind === 'explicit', showExtrema: kind === 'explicit' }, { name: extra.name, color: extra.color })
  b.commit()
  if (kind === 'surface') scene().setViewMode('3d')
  else scene().setViewMode('2d')
  return true
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
 * The region between y = upper and y = lower for x from a to b: both curves in full, the region
 * shaded between them, and its area written in the middle of it in the student's precision.
 * Returns the area so the caller can say it in words too. `hideArea` leaves the "area =" label
 * off, for a question that asks for exactly that area and has not been answered yet.
 */
export function visualizeBetween(upper: string, lower: string, a: number, bnd: number, label?: string, hideArea = false): number {
  const lo = Math.min(a, bnd)
  const hi = Math.max(a, bnd)
  const s = precision()
  if (lo === hi) throw new Error(`The region needs a stretch of x: from and to are the same x, ${fmtLabel(lo, s)}.`)
  const u = curveOf(upper)
  const l = curveOf(lower)
  const area = betweenArea(u, l, lo, hi)
  if (!Number.isFinite(area)) throw new Error(`A curve runs off to infinity between x = ${fmtLabel(lo, s)} and ${fmtLabel(hi, s)}, so the region has no area.`)
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
    const areaText = b.text([xm, ym, 0], `area = ${fmtLabel(area, s)}`, { name: 'areaText' })
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

// ---------------------------------------------------------------------------
// Question pictures of format 2 (Fix 21): a normal curve, dots, several curves, a number line
// ---------------------------------------------------------------------------

/**
 * A curve drawn only over its own stretch of x. An explicit graph is drawn across the whole view
 * whatever its tMin and tMax say (they only frame it), so the two trains' speed lines ran on
 * below zero past the moment each stopped; one piece of a piecewise graph stops where it should.
 */
function stretchOf(expr: string, from?: number, to?: number): Omit<GraphObj, 'id' | 'name' | 'color' | 'visible' | 'locked' | 'showLabel' | 'type'> {
  if (from === undefined || to === undefined || !(to > from)) return { kind: 'explicit', source: `y = ${expr}`, exprs: [expr], tMin: from, tMax: to, showRoots: false, showExtrema: false }
  return { kind: 'piecewise', source: `piecewise(${expr} from ${String(from)} to ${String(to)})`, exprs: [expr], pieces: [{ expr, from, to }], showRoots: false, showExtrema: false }
}

/** The standard normal density: every normal picture is drawn on the z scale, where it is this curve. */
const NORMAL_PDF = 'exp(-x^2 / 2) / sqrt(2 * pi)'

/**
 * How many times taller than the density the bell is drawn. On the z scale the density peaks at
 * 0.4 over a bell 8 wide, and at one zoom for both axes that is a line lying along the axis (it
 * read as a flat blue stripe in the browser check); five times taller it peaks at 2 and has the
 * textbook shape. The probability is still the shaded part as a fraction of the whole bell, and
 * the note and the label say the probability itself.
 */
export const NORMAL_STRETCH = 5

/**
 * How far out an open tail counts, in standard deviations. The area past 6σ is below 10⁻⁹, so
 * P(X < 65) worked out from 6σ below the mean is the probability to every digit a student is shown.
 */
const NORMAL_TAIL = 6

/** The drawn bell runs this far each side; past 4σ it is flat against the axis anyway, and the shading stops there too. */
const NORMAL_SPAN = 4

const standardPdf = (z: number): number => Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI)

/**
 * A normal distribution with mean and sd, with the region from `from` to `to` shaded (an end left
 * out is that whole tail). Drawn on the z scale — z = (x − mean) ÷ sd — because the density of
 * N(50, 10²) peaks at 0.04 beside its own 60-wide axis; on the z scale, drawn NORMAL_STRETCH times
 * taller, it is the textbook bell. The returned area is the probability itself, worked out on the
 * density, never on the stretched drawing. The mean and the ends are labelled under the axis in
 * the question's own numbers. `hideArea` leaves the probability label off for a question that asks
 * for exactly that probability.
 */
export function visualizeNormal(mean: number, sd: number, from?: number, to?: number, hideArea = false): { area: number; zFrom: number; zTo: number } {
  if (!(sd > 0) || !Number.isFinite(mean)) throw new Error('A normal curve needs a mean and a standard deviation above 0.')
  const s = precision()
  const z = (x: number | undefined, tail: number): number => (x === undefined ? tail : Math.max(-NORMAL_TAIL, Math.min(NORMAL_TAIL, (x - mean) / sd)))
  if (from !== undefined && to !== undefined && !(from < to)) throw new Error('The shaded region needs its start below its end.')
  const zFrom = z(from, -NORMAL_TAIL)
  const zTo = z(to, NORMAL_TAIL)
  // Both ends past 6σ on one side (P(X > 120) for N(50, 10²)) leave nothing to shade: the
  // probability is below 10⁻⁹, 0 at any precision shown. The bell is drawn with no region; this
  // used to throw a sentence about the drawing for a question that is perfectly valid.
  const area = zTo > zFrom ? betweenArea(standardPdf, () => 0, zFrom, zTo, 4000) : 0
  const bell = `${NORMAL_STRETCH} * ${NORMAL_PDF}`
  const height = (zz: number): number => NORMAL_STRETCH * standardPdf(zz)
  // The shading is drawn over the bell's own stretch; past 4σ it would be a hairline on the axis
  // that only widens the framing.
  const lo = Math.max(zFrom, -NORMAL_SPAN)
  const hi = Math.min(zTo, NORMAL_SPAN)
  clearTagged('calculus')
  const b = new Builder()
  b.graph(stretchOf(bell, -NORMAL_SPAN, NORMAL_SPAN), { name: 'normal' })
  const region =
    hi > lo
      ? b.graph({ kind: 'between', source: `between(${bell}, 0, ${String(lo)}, ${String(hi)})`, exprs: [bell, '0'], tMin: lo, tMax: hi }, { color: themeColor('--accent', '#4f8cff'), name: 'region' })
      : undefined
  const owned = <T extends SceneObject>(o: T): T => {
    if (region) (o as SceneObject & { owner?: string }).owner = region.id
    return inGraphing(o)
  }
  // Labels sit just under the axis, at the mean and at each end the question names.
  const under = -0.12 * height(0)
  owned(b.text([0, under, 0], `mean ${fmtLabel(mean, s)}`, { name: 'meanText', auxiliary: true }))
  for (const x of [from, to]) {
    if (x === undefined) continue
    const at = z(x, 0)
    if (Math.abs(at) < 1e-9) continue
    // Level with the mean's label unless it would print over it; two rows down fell below the
    // framed drawing in the browser check and was cut off.
    const row = Math.abs(at) < 1 ? under * 2 : under
    owned(b.text([Math.max(-NORMAL_SPAN, Math.min(NORMAL_SPAN, at)), row, 0], fmtLabel(x, s), { name: 'endText', auxiliary: true }))
  }
  if (!hideArea && region) {
    const zm = (lo + hi) / 2
    owned(b.text([zm, height(zm) / 2, 0], `probability = ${fmtLabel(area, s)}`, { name: 'areaText' }))
  }
  b.commit()
  remember('calculus', b)
  scene().setViewMode('2d')
  return { area, zFrom, zTo }
}

/** A box round some points in the plane with the origin in it, for a drawing that has no graph to frame. */
function frameAround(points: [number, number][]): void {
  const xs = [0, ...points.map((p) => p[0])]
  const ys = [0, ...points.map((p) => p[1])]
  fitCamera({ min: [Math.min(...xs), Math.min(...ys), 0], max: [Math.max(...xs), Math.max(...ys), 0] })
}

/**
 * `count` dots in rows of `perRow`, one unit apart, left to right and row by row: something to
 * count, as a first-look question asks. The dots carry no labels — a label would count them.
 * Every dot sits in the middle of a grid square (x and y at 0.5, 1.5, 2.5 …), off both axes and
 * off every grid crossing: a dot on x = 0 or y = 0 would sit on a numbered tick, and a learner
 * reading that tick's label would count the dots one short; a dot on a crossing, over a whole-number
 * tick, lets the axis number be read instead of the dots counted. Each dot is drawn twice the size of
 * an ordinary point, so it cannot pass for a grid intersection.
 */
export function visualizeDots(count: number, perRow: number): void {
  clearTagged('dots')
  const b = new Builder()
  const color = themeColor('--series-1', '#4dabf7')
  const at: [number, number][] = []
  for (let k = 0; k < count; k++) {
    const p: [number, number] = [0.5 + (k % perRow), 0.5 + Math.floor(k / perRow)]
    at.push(p)
    const dot = b.point([p[0], p[1], 0], { name: 'dot', color, showLabel: false })
    dot.size = 2 * POINT_PX.free
    inGraphing(dot)
  }
  b.commit(false)
  remember('dots', b)
  scene().setViewMode('2d')
  if (at.length) frameAround(at)
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
 * The given quantities as marks on one number line that runs through 0 (the axis labels it), each labelled with its name,
 * value and unit. Labels alternate between two heights so two close values do not print over each
 * other. The line is a segment between two hidden points, not a graph, so it stops at the marks.
 */
export function visualizeNumberLine(items: { label: string; value: number }[]): void {
  if (!items.length) throw new Error('This question gives no numbers PhysLab could put on a number line.')
  clearTagged('numberline')
  const values = items.map((it) => it.value)
  const lo = Math.min(0, ...values)
  const hi = Math.max(0, ...values)
  const span = hi - lo || Math.max(1, Math.abs(hi))
  // A label is centred on its mark, so the end marks need room for half a label each side:
  // at 8 % the two end labels ran off the framed drawing in the browser check.
  const pad = span * 0.15
  const b = new Builder()
  const faint = themeColor('--text-faint', '#6c707a')
  const ends = [lo - pad, hi + pad].map((x) => inGraphing(b.point([x, 0, 0], { auxiliary: true, visible: false })).id)
  inGraphing(b.segment(ends[0], ends[1], { name: 'numberLine', color: faint, auxiliary: true }))
  const lift = span * 0.05
  const sorted = items.map((it, i) => ({ ...it, i })).sort((p, q) => p.value - q.value)
  sorted.forEach((it, k) => {
    inGraphing(b.point([it.value, 0, 0], { name: 'mark', color: seriesColor(it.i), showLabel: false }))
    inGraphing(b.text([it.value, lift * (1 + (k % 2)), 0], it.label, { name: 'markText', auxiliary: true }))
  })
  b.commit(false)
  remember('numberline', b)
  scene().setViewMode('2d')
  frameAround([[lo - pad, -lift], [hi + pad, lift * 3]])
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

// ---------------------------------------------------------------------------
// Whether a graph will show anything, asked before it is made
// ---------------------------------------------------------------------------
//
// Every graph route of the command bar stored the formula and announced it ("Surface created",
// "Shaded region created."), and only the viewport compiled it, later: a formula that did not
// parse, named a slider that did not exist or had no real value anywhere drew nothing, without a
// word. This asks first, with the viewport's compiler and its limits, and says in a sentence why
// nothing would show. It judges by the values themselves, not by whether a sampler hands back a
// line: sampleExplicit breaks a line as steep as y = 10000x into single points, and that is the
// sampler's fault, not the formula's.

/** A graph the command bar is about to make, as render/GraphView.tsx will draw it. */
export interface DrawSpec {
  kind: 'explicit' | 'implicit' | 'inequality' | 'surface' | 'polar' | 'parametric' | 'piecewise' | 'between'
  /** The formulas as the graph stores them: θ already spelt theta, an equation as (left) - (right). */
  exprs: string[]
  /** The stretch of t of a parametric or polar curve, or of x of the region between two curves. */
  tMin?: number
  tMax?: number
  op?: '<' | '<=' | '>' | '>='
  pieces?: { expr: string; from: number; to: number }[]
  /** An equation's two sides as typed, so that a square set to 0 can be offered without its square. */
  sides?: [string, string]
  /**
   * How the line the student typed reads with a formula in the curve's place, for a refusal that
   * writes the line out: tangent(sin(x), 1) for tangent(g(x), 1). Without it the line is y = … .
   */
  lineWith?: (formula: string) => string
}

/** Something to draw — perhaps only once a slider moves, which the note says — or why not, in a sentence. */
type Drawability = { ok: true; note?: string } | { ok: false; reason: string }

type DrawKind = DrawSpec['kind']
type Digits = Exclude<Precision, number>

const DRAW_VARS: Record<DrawKind, string[]> = {
  explicit: ['x'],
  piecewise: ['x'],
  between: ['x'],
  implicit: ['x', 'y'],
  inequality: ['x', 'y'],
  surface: ['x', 'y'],
  polar: ['theta', 't'],
  parametric: ['t']
}
const DRAW_NOUN: Record<DrawKind, string> = {
  explicit: 'graph',
  piecewise: 'piecewise curve',
  between: 'region',
  implicit: 'curve',
  inequality: 'inequality',
  surface: 'surface',
  polar: 'polar curve',
  parametric: 'curve'
}
const DRAW_PLACE: Record<DrawKind, string> = {
  explicit: 'function',
  piecewise: 'function',
  between: 'function',
  implicit: 'equation',
  inequality: 'inequality',
  surface: 'formula',
  polar: 'formula',
  parametric: 'formula'
}
/** sampleExplicit leaves out every point higher than this (math/graphs.ts): a curve that is all above it never shows. */
const EXPLICIT_LIMIT = 1e7
/**
 * Half-widths of the windows tried, the usual view first. One window alone misses something: a
 * grid of ±1000 steps right over a circle of radius 0.1, and ±10 never reaches y = √(x − 50).
 */
const SPANS = [10, 100, 1000, 1, 0.1, 1e4, 1e5, 1e6]
/**
 * Windows far past the widest of SPANS, a decade apart, tried only once nothing was found within
 * reach (farOut). A curve that exists only out here is not empty, it is beyond what the view can
 * show, and "no point makes its two sides equal" about it is false. The nearer windows are there to
 * catch what is smaller than one cell of the widest: a circle of radius 6×10⁶ in a window of 10¹².
 */
const FAR_SPANS = [1e7, 1e8, 1e9, 1e10, 1e12]
const FAR_WHY = 'it lies more than a million units from the origin, too far out to draw'
/**
 * Each window sits off centre, x and y by different amounts, and a grid of 211 cells has no
 * point on a whole number or on y = ±x. A curve that only touches zero, such as (x − y)² = 0, is
 * then found by the sign-change plotter only where the screen happens to put a grid line on it,
 * and the check must not find it by the same luck.
 */
const windowOf = (h: number): [number, number, number, number] => [-0.9713 * h, 1.0287 * h, -0.9657 * h, 1.0343 * h]
const CELLS = 211
/** The viewport shades an inequality on a grid a third coarser than its boundary (render/GraphView.tsx). */
const FILL_CELLS = Math.ceil(CELLS / 1.5)
/** Samples along x, and along t as the viewport takes them. */
const SAMPLES_X = 2000
const SAMPLES_T = 3000
/** Where a slider is tried when the formula is empty at its current value, and the windows it is tried in. */
const PROBES = [1, -1, 2, -2, 0.5, 5, -5, 10, 0]
const PROBE_SPANS = SPANS.slice(0, 3)
/**
 * A formula with a function the graph compiler does not compute itself (dot, ×, erf…) goes through
 * mathjs for every value, some 300 times slower: an implicit curve of that kind would take seconds
 * to check over every window. Past this the check stops and the graph is made, as every graph was
 * before there was a check; an ordinary formula is done in a few milliseconds.
 */
const DRAW_BUDGET_MS = 600
/**
 * What an ordinary formula may cost is counted in values, not milliseconds. A formula the compiler
 * computes itself takes well under a microsecond a value, so the time a check takes is only how
 * busy the PC is, and a clock made the answer depend on that: under load x² + y² = −1 − k², which
 * no k helps, ran out of time in the middle of trying the slider and was made with the note that
 * moving k shows it. The dearest ordinary check (a refused formula with three sliders) is some
 * five million values; the clock is kept for the formula that goes through mathjs, whose values
 * each take more than SLOW_VALUE_MS.
 */
const MAX_VALUES = 8_000_000
const SLOW_VALUE_MS = 0.005
class OutOfTime extends Error {}

/** What a check may spend: the clock (for a slow formula only) and the number of values (for any). */
interface DrawLimits {
  ms: number
  values: number
}
const DRAW_LIMITS: DrawLimits = { ms: DRAW_BUDGET_MS, values: MAX_VALUES }

/** Counts one value worked out, and throws OutOfTime past the limits. */
function ticker(limits: DrawLimits): () => void {
  const t0 = performance.now()
  let values = 0
  return () => {
    if ((++values & 1023) !== 0) return
    if (values > limits.values) throw new OutOfTime()
    const spent = performance.now() - t0
    if (spent > limits.ms && spent / values > SLOW_VALUE_MS) throw new OutOfTime()
  }
}
const AROUND: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]

/** The start of the reason for two curves that are one: there is no region for the line to be unable to shade, so it stands as a sentence of its own. */
const SAME_CURVES = 'the two curves are the same'
/**
 * Two curves are one when, over the points looked at, they come apart by no more than this much of
 * their size on average: rounding is a few parts in 10¹⁶ (sin²x + cos²x is 1 to 10⁻¹⁶), and a
 * region 1 thick on curves 10¹² high is 10⁻¹², which is a region and has an area of 1.
 */
const SAME_TO = 1e-14
/** The steps, as a share of the stretch, at which the curves are looked at again away from the grid: the golden ratio, which no regular spacing lines up with. */
const OFF_GRID = 0.6180339887498949

const cannotDraw = (kind: DrawKind, why: string): string => {
  // A whole sentence of its own, for an equation in x alone (whyNoLines, below).
  if (why === NO_REAL_X) return why
  if (kind === 'between') return why.startsWith(SAME_CURVES) ? `${why.charAt(0).toUpperCase()}${why.slice(1)}.` : `That region cannot be shaded: ${why}.`
  return `That ${DRAW_NOUN[kind]} cannot be drawn: ${why}.`
}

/** The parser's complaint ("Parenthesis ) expected (char 7)") as a reason a student can act on. */
export function plainParseError(message: string): string {
  if (/Parenthesis [)\]] expected|End of matrix \] expected/.test(message)) return 'a bracket is not closed — check the brackets'
  // A comma between digits is a thousands separator as often as a decimal comma: told only to
  // "write a decimal with a point", 1,000 typed for a thousand became 1.000, which is one.
  if (/Unexpected operator ,/.test(message)) return 'a comma separates coordinates and inputs — type 1000 for a thousand, or 1.5 for a decimal'
  if (/Value expected|Unexpected end|expected \(char/.test(message)) return 'the formula is incomplete — a number or a letter is missing'
  if (/Unexpected operator/.test(message)) return 'a sign is out of place — check the formula'
  return 'part of it cannot be read — check the formula for a typing slip'
}

/** Whether the graph compiler can call a function of this name: mathjs's own, or one it computes itself (ln, step…). */
function knownFunction(name: string, argc: number): boolean {
  if (typeof (math as unknown as Record<string, unknown>)[name] === 'function') return true
  try {
    return Number.isFinite(compileScalar(`${name}(${Array(argc).fill('0.7').join(', ')})`, [], () => ({}))({}))
  } catch {
    return false
  }
}

/** The scene's graphs by name, each with its formula when it is a plain y = f(x) (otherwise null). */
export type NamedGraphs = Record<string, string | null>

/** A call in a formula, as mathjs parses it. */
type CallNode = MathNode & { fn?: { name?: string }; args: MathNode[] }

/**
 * A formula with its brackets, calls and products as one string whatever its spelling: the brackets
 * mathjs keeps are dropped and every product, implicit or not, is shown with its star. Two formulas
 * with the same shape are the same formula.
 */
function shapeOf(node: MathNode): string {
  const bare = (n: MathNode): MathNode => n.transform((m) => (m.type === 'ParenthesisNode' ? bare((m as MathNode & { content: MathNode }).content) : m))
  return bare(node).toString({ parenthesis: 'all', implicit: 'show' })
}

/**
 * A formula as a student writes it, for a line offered to type: no bracket that is not needed,
 * powers, products and quotients tight, and 2x for 2 times x — (2x)^2, where mathjs's own text is
 * ((2 x) ^ 2). The text is read back and must be the same formula (shapeOf): mathjs writes a symbol
 * and a bracket side by side for a product, "pi (x / 2)", which reads as a call of pi, and then
 * the products are written with their stars. Where it also drops a bracket that matters to the
 * shape (x times (1 / x) comes out "x * 1 / x"), the brackets the formula has are kept.
 */
function asWritten(node: MathNode): string {
  const tight = (text: string): string => text.replace(/ ([*/^]) /g, '$1')
  const nice = tight(node.toString({ parenthesis: 'auto' }))
    .replace(/(\d) (?=[A-DF-Za-df-z](?![\w(])|\()/g, '$1')
    .replace(/\) (?=\()/g, ')')
    // A letter against a bracket is a product since P-PARSE R1 (x(1/x)), so mathjs's "x (1/x)" loses its space;
    // `means` below still checks that the line reads back as this formula.
    .replace(/(?<![A-Za-z])([A-Za-z]) (?=\()/g, '$1')
  const means = (text: string): boolean => {
    try {
      return shapeOf(math.parse(preprocess(text))) === shapeOf(node)
    } catch {
      return false
    }
  }
  if (means(nice)) return nice
  const starred = tight(node.toString({ parenthesis: 'auto', implicit: 'show' }))
  if (means(starred)) return starred
  // Every bracket the formula holds stays, so what is read back is the formula by construction.
  const kept = tight(node.toString({ parenthesis: 'keep', implicit: 'show' }))
  return means(kept) ? kept : node.toString()
}

/** "g", "g and h", "g, h and p". */
const namesAnd = (names: string[]): string => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)

/**
 * What to say of g(x) when g names a graph, which is no function: it cannot use another graph yet.
 * Where every graph the formula calls is a plain y = f(x) the line is written out with each one's
 * formula put in its call's place, the argument where x was: y = g(x - 1)*2 is offered as
 * y = sin(x - 1)*2, and y = g(x) + h(x) with h written out as well as g. The line is the one the
 * student typed (lineWith: tangent(sin(x), 1) for tangent(g(x), 1), y = … for a graph) and is
 * written the way a student writes it (asWritten). Where one cannot be written out, the sentence
 * is about that one (a line offered that still calls a graph is refused in the same words), and
 * says what its formula is when it has one.
 */
function graphCalled(root: MathNode, kind: DrawKind, graphs: NamedGraphs, lineWith: (formula: string) => string): string {
  const isGraphCall = (n: MathNode): n is CallNode => n.type === 'FunctionNode' && typeof (n as CallNode).fn?.name === 'string' && ((n as CallNode).fn?.name as string) in graphs
  const calls = root.filter(isGraphCall) as CallNode[]
  const graphOf = (c: CallNode): string => c.fn?.name as string
  const names = [...new Set(calls.map(graphOf))]
  const leadOf = (of: string[]): string =>
    of.length === 1 ? `${of[0]} is a graph, and a graph cannot use another graph yet — type its formula instead` : `${namesAnd(of)} are graphs, and a graph cannot use another graph yet — type their formulas instead`
  // A graph that is not a plain y = f(x) has no formula to put in its place, and nor has a call
  // with other than one argument: the sentence below says what g(x) is instead.
  const stuck = calls.find((c) => graphs[graphOf(c)] === null || c.args.length !== 1)
  if (kind === 'explicit' && !stuck) {
    try {
      // The argument needs brackets only where it would join its neighbours: not as a name, a
      // number, or inside the brackets of a call or of its own.
      const bodyFor = (formula: string, arg: MathNode): MathNode =>
        math.parse(preprocess(formula)).transform((m, _path, parent) => {
          if (m.type !== 'SymbolNode' || (m as MathNode & { name?: string }).name !== 'x') return m
          return arg.type === 'SymbolNode' || arg.type === 'ConstantNode' || parent?.type === 'FunctionNode' || parent?.type === 'ParenthesisNode' ? arg : new math.ParenthesisNode(arg)
        })
      // Every call to every graph is written out, each with its own argument: y = g(x)*g(x) is
      // offered as y = (sin(x)) * (sin(x)), which draws, where only the first call was replaced and
      // the line offered still had a g(x) in it; and y = g(x) + h(x) with h's formula as well, where
      // only the calls to the graph met first were written out and h(x) stayed.
      // transform does not go inside a node it has replaced, so a call in the argument of another
      // (g(g(x)), g(h(x))) is written out here, before the argument goes into the formula.
      const written = (tree: MathNode): MathNode =>
        tree.transform((m) => {
          if (!isGraphCall(m)) return m
          return new math.ParenthesisNode(bodyFor(graphs[graphOf(m)] as string, written(m.args[0])))
        })
      return `${leadOf(names)}, e.g. ${lineWith(asWritten(written(root)))}.`
    } catch {
      // A formula that will not rewrite is still named below.
    }
  }
  // The first call that cannot be written out; where all can (a graph kind with no y = line to
  // offer, or a formula that would not rewrite) the first graph the formula calls.
  const at = (kind === 'explicit' ? stuck : undefined) ?? calls[0]
  const name = graphOf(at)
  const formula = graphs[name]
  return formula === null ? `${leadOf([name])}.` : `${leadOf([name])}: ${name}(x) is ${formula}.`
}

/**
 * A call the graph compiler cannot make, as the sentence to show. x(x + 1) is a call to a function
 * named x, not a product, and so is k(x) for a slider k: those are told to type the product. A
 * graph is no function and no number either, and a point or a vector is no number: g(x) after
 * g(x) = sin(x) used to be told "for a product, type g*(x)", which multiplies by nothing.
 */
function callProblem(node: MathNode, vars: Set<string>, scope: Record<string, unknown>, kind: DrawKind, graphs: NamedGraphs, lineWith: (formula: string) => string): string | null {
  let said: string | null = null
  node.traverse((n) => {
    if (said || n.type !== 'FunctionNode') return
    const call = n as MathNode & { fn: { name?: string }; args: MathNode[] }
    const name = call.fn.name
    if (!name) return
    const inside = call.args.map((a) => a.toString())
    if (name in graphs) said = graphCalled(node, kind, graphs, lineWith)
    else if (vars.has(name) || (name in scope && typeof scope[name] === 'number')) said = cannotDraw(kind, `${n.toString()} reads as a function called ${name} — for a product, type ${name}*(${inside.join(', ')})`)
    else if (name in scope) said = `"${name}" is not a number, so it cannot be used in the ${DRAW_PLACE[kind]}.`
    // preprocess turns · into dot(…). Between numbers it is their product, as × is (y = 2·x was refused, H32); a
    // vector written out beside it is never a number on a graph. (A vector by name is refused above: not a number.)
    else if (name === 'dot' && call.args.some((a) => a.type === 'FunctionNode' && ['vec', 'pt', 'polarVec'].includes((a as MathNode & { fn: { name?: string } }).fn.name ?? '')))
      said = cannotDraw(kind, `· beside a vector is the dot product of two vectors, which a graph cannot draw — to multiply numbers, type * or ·, e.g. ${inside.join('*')}`)
    else if (!knownFunction(name, call.args.length)) said = cannotDraw(kind, `PhysLab does not know a function called "${name}"`)
  })
  return said
}

/** What is wrong with the formulas themselves, before any sampling: they do not parse, name something that is not a number, or call what is not a function. */
function formulaProblem(spec: DrawSpec, scope: Record<string, unknown>, graphs: NamedGraphs): string | null {
  const vars = new Set(DRAW_VARS[spec.kind])
  const place = DRAW_PLACE[spec.kind]
  for (const expr of spec.exprs) {
    let node: MathNode
    try {
      node = math.parse(preprocess(expr, sceneNames()))
    } catch (e) {
      return cannotDraw(spec.kind, plainParseError(e instanceof Error ? e.message : String(e)))
    }
    for (const name of symbolsOf(node)) {
      // A constant compileScalar reads for itself (math/expr.ts namedConstant: pi, e, tau, phi …) needs no slider.
      if (vars.has(name) || (!(name in scope) && namedConstant(name) !== undefined)) continue
      if (name in scope) {
        // A point, a vector or another graph: the compiler reads it as no value and draws nothing.
        if (typeof scope[name] !== 'number') return `"${name}" is not a number, so it cannot be used in the ${place}.`
        continue
      }
      // sin(30°) reaches the parser as sin(30 deg), and deg is not a slider to make.
      if (name === 'deg' || name === 'rad') return `A graph reads angles in radians, so ° and rad cannot be used in the ${place}: type sin(x), not sin(x°).`
      // x, y and z are left to the graph routes (tryAssignment): x = 1 and y = 1 are lines and z = 1
      // a plane, so "make a slider first, e.g. y = 1" after f(x) = y drew a line instead of a slider.
      if (name === 'x' || name === 'y' || name === 'z') return `Unknown name "${name}" in the ${place}. ${name} is the letter graphs use, so it cannot be a slider — use another letter, e.g. k = 1`
      return `Unknown name "${name}" in the ${place}. Make a slider first, e.g. ${name} = 1`
    }
    const call = callProblem(node, vars, scope, spec.kind, graphs, spec.lineWith ?? ((formula) => `y = ${formula}`))
    if (call) return call
  }
  return null
}

/**
 * What y = f(x) leaves on the drawing from lo to hi: a line (two neighbouring samples the viewport
 * keeps), only separate points, only values too large to keep, or no real value at all.
 */
function alongX(f: (x: number) => number, lo: number, hi: number): 'line' | 'points' | 'large' | 'none' {
  let seen: 'points' | 'large' | 'none' = 'none'
  let before = false
  for (let i = 0; i <= SAMPLES_X; i++) {
    const y = f(lo + ((hi - lo) * i) / SAMPLES_X)
    const kept = Number.isFinite(y) && Math.abs(y) <= EXPLICIT_LIMIT
    if (kept && before) return 'line'
    if (kept) seen = 'points'
    else if (Number.isFinite(y) && seen === 'none') seen = 'large'
    before = kept
  }
  return seen
}

/** The same for a curve in t: a line where two neighbouring values of t both give a point. */
function alongT(fx: (t: number) => number, fy: (t: number) => number, t0: number, t1: number): 'line' | 'points' | 'none' {
  let seen: 'points' | 'none' = 'none'
  let before = false
  for (let i = 0; i <= SAMPLES_T; i++) {
    const t = t0 + ((t1 - t0) * i) / SAMPLES_T
    const real = Number.isFinite(fx(t)) && Number.isFinite(fy(t))
    if (real && before) return 'line'
    if (real) seen = 'points'
    before = real
  }
  return seen
}

/** "the piece …", read the way the student typed it, when one stretch of x shows nothing. */
const SAYS_X: Record<'points' | 'large' | 'none', string> = {
  none: 'has no real value',
  large: 'has only values beyond ten million, too large to draw',
  points: 'has a real value only at separate points, with no line between them'
}

/**
 * Whether F only touches zero near (x, y), the smallest |F| on a window's grid, without crossing
 * it: a square such as (x − y)² is 0 along a line and positive on both sides, so marching squares
 * never sees it. Walks downhill from that point (inside the window) and asks whether |F| falls to
 * nothing beside values that are not nothing; e^x, which only fades towards 0 at the window's edge
 * or runs out of digits there, does not touch.
 */
function touchesAt(F: Fxy, x: number, y: number, cell: number, [x0, x1, y0, y1]: [number, number, number, number]): boolean {
  if (x - x0 < 2 * cell || x1 - x < 2 * cell || y - y0 < 2 * cell || y1 - y < 2 * cell) return false
  const ring = Math.max(0, ...AROUND.map(([dx, dy]) => Math.abs(F(x + dx * cell, y + dy * cell))).filter(Number.isFinite))
  if (!(ring > 1e-100)) return false
  let best = Math.abs(F(x, y))
  let h = cell
  for (let i = 0; i < 400 && best > 0 && h > 1e-15 * (Math.abs(x) + Math.abs(y) + cell); i++) {
    const next = AROUND.map(([dx, dy]): [number, number] => [Math.min(x1, Math.max(x0, x + dx * h)), Math.min(y1, Math.max(y0, y + dy * h))]).find(([px, py]) => Math.abs(F(px, py)) < best)
    if (!next) {
      h /= 2
      continue
    }
    x = next[0]
    y = next[1]
    best = Math.abs(F(x, y))
  }
  // eslint-disable-next-line no-restricted-syntax -- relative already (|F| at the bottom against |F| around it); the number against isNoise's 10⁻¹⁵ is CW9's (P-CW2-REPORT class 1)
  return best <= 1e-12 * ring
}

/** Whether brackets close in order, so "(x - 1)(x + 1)" is not taken for the inside of one square. */
const balanced = (s: string): boolean => {
  let depth = 0
  for (const ch of s) {
    depth += ch === '(' ? 1 : ch === ')' ? -1 : 0
    if (depth < 0) return false
  }
  return depth === 0
}

/** Why a curve that only touches zero is not drawn, offering the square's inside where the student wrote a square set to 0. */
function touchWhy(sides?: [string, string]): string {
  for (const [side, other] of sides ? [sides, [sides[1], sides[0]]] : []) {
    if (other.trim() !== '0') continue
    const sq = /^\s*\((.+)\)\s*(?:\^\s*2|²)\s*$/.exec(side) ?? /^\s*([A-Za-z0-9_.]+)\s*(?:\^\s*2|²)\s*$/.exec(side)
    if (sq && balanced(sq[1])) return `${side.trim()} only touches 0 without crossing it, and PhysLab can draw a curve only where the two sides cross — type it without the square: ${sq[1].trim()} = 0`
  }
  return 'its two sides only touch without crossing, and PhysLab can draw a curve only where they cross. A square set to 0, such as (x - y)^2 = 0, can be typed without its square: x - y = 0'
}

/** Why F(x, y) = 0 has no line for marching squares to draw in any window, or null when it has one. */
function implicitWhy(F: Fxy, spans: number[], sides?: [string, string]): string | null {
  let real = false
  let allZero = true
  let touches = false
  for (const h of spans) {
    const box = windowOf(h)
    let low = Infinity
    let lx = 0
    let ly = 0
    const seen: Fxy = (x, y) => {
      const v = F(x, y)
      if (Number.isFinite(v)) {
        real = true
        if (v !== 0) allZero = false
        if (Math.abs(v) < low) {
          low = Math.abs(v)
          lx = x
          ly = y
        }
      }
      return v
    }
    if (implicitSegments(seen, box[0], box[1], box[2], box[3], CELLS, CELLS).length) return null
    if (!touches && low < Infinity) touches = touchesAt(F, lx, ly, (box[1] - box[0]) / CELLS, box)
  }
  if (!real) return 'it has no real value for any x and y'
  if (allZero) return 'its two sides are equal at every point, so there is no curve to draw'
  if (touches) return touchWhy(sides)
  return 'no point (x, y) makes its two sides equal'
}

// ---------------------------------------------------------------------------
// An equation in x alone: x² = 4, (x − 1)² = 0, sin(x) = 0.5
// ---------------------------------------------------------------------------
//
// Nothing in it ties y to x, so it draws a vertical line at each x that makes it true
// (render/GraphView.tsx, from the roots of left − right) and nothing at all when no real x does.
// Sent to the sign-change plotter as a curve in x and y, x² + 4x + 13 = 0 had no sign change
// anywhere and was announced "Implicit curve created." with nothing drawn, and (x − 1)² = 0, which
// touches zero without crossing it, was drawn only where a grid column fell on 1. A polynomial is
// solved from its exact coefficients, read the way Pure Math reads them, with the PhysLab
// Calculator's own polyRoots; any other formula is scanned over the windows drawability tries.

/** No real x makes an equation in x alone true: a whole sentence of its own (cannotDraw). */
export const NO_REAL_X = 'No real x makes this true — it has no points on the graph.'
const EVERY_X = 'its two sides are equal for every x, so there is no line to draw'
const STRETCH_X = 'its two sides are equal along a whole stretch of x, not at separate values, so there are no lines to draw'

/** One of a pair of complex solutions, a + bi with b > 0; a − bi is the other. */
export interface XComplex {
  re: number
  im: number
}

/**
 * What an equation in x alone comes to. `more` says there are further solutions than `xs` lists:
 * ones that go on repeating every `period`, or simply others further out.
 */
export type XSolved =
  | { kind: 'real'; xs: number[]; more?: 'further' | { period: number } }
  | { kind: 'none'; complex: XComplex[] }
  | { kind: 'every' }
  | { kind: 'stretch' }

/** Whether a formula has no y in it. One that does not read is not (the route that reads it has the words). */
export function inXAlone(expr: string): boolean {
  try {
    return !symbolsOf(math.parse(preprocess(expr, sceneNames()))).includes('y')
  } catch {
    return false
  }
}

/**
 * The highest power multiplied out and solved exactly. A formula with a power past it, however the
 * exponent is written, is never multiplied out: when x^N is the only x it is solved from the power
 * (highPowerSolutions), and anything else is scanned.
 */
const MAX_EXACT_DEGREE = 12
/** The solutions named when there are more than this many: the ones nearest 0. */
const MAX_LISTED = 6
/** Where the two sides are compared and a repeat is looked for: off every whole number. */
const AGREE_AT = Array.from({ length: 61 }, (_, i) => -23.7 + 0.7919 * i)

/**
 * Ascending, with solutions closer than `tol` of their size taken for one. With `relative` the size is the
 * solutions' own, never less than 1: x² = 10⁻²⁰ is ±10⁻¹⁰, two solutions 2 × 10⁻¹⁰ apart, which an
 * absolute 10⁻⁹ below 1 took for one (H30). The numeric scans keep the floor of 1 their own noise needs.
 */
function distinct(xs: number[], tol: number, relative = false): number[] {
  const out: number[] = []
  for (const x of [...xs].sort((a, b) => a - b)) {
    const last = out[out.length - 1]
    const size = relative ? Math.max(Math.abs(x), Math.abs(last ?? x)) : Math.max(1, Math.abs(x))
    if (!out.length || x - last > tol * size) out.push(x)
  }
  return out
}

/** What an exponent may be made of and still be worked out here: numbers, brackets, signs and arithmetic. */
const PLAIN_NODES = new Set(['ConstantNode', 'ParenthesisNode', 'OperatorNode', 'SymbolNode'])

/** What the exponent of a power comes to, or null where it is not a number (a letter in it, a call). 1e9, (1e9), 10^9 and 5e8 + 5e8 all come to a billion. */
function exponentValue(exponent: MathNode): number | null {
  if (exponent.filter((n) => !PLAIN_NODES.has(n.type)).length) return null
  try {
    const value: unknown = exponent.evaluate()
    return typeof value === 'number' ? value : null
  } catch {
    // x^k: k is a letter with no number behind it here.
    return null
  }
}

/** The base and exponent of a power the tree writes with an exponent that is a number: x^2, (x + 1)^1e9, 2^(10^9). */
function numberedPower(node: MathNode): { base: MathNode; exponent: number } | null {
  const v = node as unknown as { type: string; op?: string; args?: MathNode[] }
  if (v.type !== 'OperatorNode' || v.op !== '^' || v.args?.length !== 2) return null
  const exponent = exponentValue(v.args[1])
  return exponent === null ? null : { base: v.args[0], exponent }
}

/** The tree without the brackets round it. */
function unbracketed(node: MathNode): MathNode {
  let n = node as unknown as { type: string; content?: MathNode }
  while (n.type === 'ParenthesisNode' && n.content) n = n.content as unknown as typeof n
  return n as unknown as MathNode
}

/** The name the one high power of x is given while the rest of the formula is worked out; nothing a student types. */
const HIGH_POWER = 'xToTheN'

/** What a formula with no letter in it comes to, or null where it has no value here (a name that is no number, a division by 0). */
function constantValue(node: MathNode): number | null {
  try {
    const v = compileScalar(node.toString(), [], () => ({}))({})
    return Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

/** a·u + b, with the size of what was added up to make each: a sum that cancels (0.1u + 0.2u − 0.3u) is told from a small coefficient. */
interface Straight {
  a: number
  b: number
  sizeA: number
  sizeB: number
}

/**
 * The formula as a straight line in the one name `u`, read off its shape: sums and differences,
 * brackets, a number times it or over it, and numbers (2^3, pi, sqrt(4)). Never from its values at
 * a few u: u(u − 1)(u − 2)(u + 3) is 0 at 0, 1, 2 and −3, and floor(u) and round(u) at 0 and 1, so
 * each of them passed for the line 0 there. Null for anything else, and for a formula that holds
 * another letter (a slider, or an x that is not in the power).
 */
function straightLineIn(node: MathNode, u: string): Straight | null {
  if (!symbolsOf(node).includes(u)) {
    const b = constantValue(node)
    return b === null ? null : { a: 0, b, sizeA: 0, sizeB: Math.abs(b) }
  }
  const n = node as unknown as { type: string; name?: string; content?: MathNode; op?: string; args?: MathNode[] }
  if (n.type === 'SymbolNode') return n.name === u ? { a: 1, b: 0, sizeA: 1, sizeB: 0 } : null
  if (n.type === 'ParenthesisNode' && n.content) return straightLineIn(n.content, u)
  if (n.type !== 'OperatorNode' || !n.args) return null
  const parts = n.args.map((arg) => straightLineIn(arg, u))
  if (parts.some((p) => p === null)) return null
  const [p, q] = parts as Straight[]
  if (n.args.length === 1) {
    if (n.op === '-') return { a: -p.a, b: -p.b, sizeA: p.sizeA, sizeB: p.sizeB }
    return n.op === '+' ? p : null
  }
  if (n.args.length !== 2) return null
  switch (n.op) {
    case '+':
      return { a: p.a + q.a, b: p.b + q.b, sizeA: p.sizeA + q.sizeA, sizeB: p.sizeB + q.sizeB }
    case '-':
      return { a: p.a - q.a, b: p.b - q.b, sizeA: p.sizeA + q.sizeA, sizeB: p.sizeB + q.sizeB }
    case '*':
      // A line times a line is a curve: one of the two must be a number.
      if (p.sizeA !== 0 && q.sizeA !== 0) return null
      return { a: p.a * q.b + q.a * p.b, b: p.b * q.b, sizeA: p.sizeA * Math.abs(q.b) + q.sizeA * Math.abs(p.b), sizeB: p.sizeB * q.sizeB }
    case '/':
      // Over u, or over 0, it is no line either.
      return q.sizeA === 0 && q.b !== 0 ? { a: p.a / q.b, b: p.b / q.b, sizeA: p.sizeA / Math.abs(q.b), sizeB: p.sizeB / Math.abs(q.b) } : null
    default:
      return null
  }
}

/** Adding up decimals can leave a hair where the sum is 0 (0.1 + 0.2 − 0.3): a hair of the size of the terms added is 0. */
const CANCELS = 1e-14
const settled = (v: number, size: number): number => (Math.abs(v) <= CANCELS * size ? 0 : v)

/**
 * An equation whose only x is a power too high to multiply out (x^1000000 + 1 = 0, 3x^100 = 6,
 * x^1e9 = 0) comes to a·u + b = 0 for u = x^N: u is found first and x from it, without building a
 * polynomial of a million places. Null for anything else with such a power, which is scanned.
 */
function highPowerSolutions(tree: MathNode, high: number[]): { real: number[]; complex: XComplex[] } | 'every' | null {
  const N = high[0]
  if (!Number.isInteger(N) || N <= MAX_EXACT_DEGREE || high.some((e) => e !== N)) return null
  if (symbolsOf(tree).includes(HIGH_POWER)) return null
  const swapped = tree.transform((n) => {
    const p = numberedPower(n)
    const base = p && unbracketed(p.base)
    return p && p.exponent === N && base?.type === 'SymbolNode' && (base as unknown as { name: string }).name === 'x' ? math.parse(HIGH_POWER) : n
  })
  // Only a straight line in u is this: sin(x^1e6), (x^1e6)² and floor(x^20) are not, and neither is
  // another x, or any other letter, which has no value here: the scan takes those.
  const line = straightLineIn(swapped, HIGH_POWER)
  if (!line) return null
  const a = settled(line.a, line.sizeA)
  const b = settled(line.b, line.sizeB)
  if (a === 0) return b === 0 ? 'every' : { real: [], complex: [] }
  const u = -b / a
  if (u === 0) return { real: [0], complex: [] }
  // An even power is never below 0; an odd one has a real root of either sign.
  const even = N % 2 === 0
  if (even && u < 0) return { real: [], complex: [] }
  const r = Math.pow(Math.abs(u), 1 / N)
  if (!Number.isFinite(r) || r === 0) return null
  return { real: even ? [-r, r] : [u < 0 ? -r : r], complex: [] }
}

/**
 * The solutions of left − right when it is a polynomial in x with numbers for coefficients, 'every'
 * when it comes to 0 = 0, or null when it is anything else (a slider, a function, a root...).
 */
function exactSolutions(expr: string): { real: number[]; complex: XComplex[] } | 'every' | null {
  let tree: MathNode
  try {
    tree = math.parse(writeTimes(preprocess(expr)))
  } catch {
    return null
  }
  // Pure Math multiplies a power out term by term: x^1000000 would never come back. The cap reads
  // what each exponent comes to, as the pattern here once did not: it stopped at the first digit,
  // took 1e9 for a power of 1, and x^1e9 ran for minutes and then asked for an array of a billion.
  const high: number[] = []
  const look = (n: MathNode): void => {
    const p = numberedPower(n)
    if (!p) return n.forEach(look)
    if (!(Math.abs(p.exponent) <= MAX_EXACT_DEGREE)) high.push(p.exponent)
    // What is inside a number-valued exponent (the 10^13 of x^(10^13)) is not a power of x.
    look(p.base)
  }
  look(tree)
  if (high.length) return highPowerSolutions(tree, high)
  let poly: Poly
  try {
    const e = parseExpr(expr)
    if (varsOf(e).some((v) => v !== 'x')) return null
    poly = pTrim(polyFromExpr(e, 'x').poly)
  } catch {
    return null
  }
  if (poly.length === 0) return 'every'
  if (poly.length > MAX_EXACT_DEGREE + 1) return null
  if (poly.length === 1) return { real: [], complex: [] }
  // Its square-free part: (x − 1)³ has the one solution 1, and that is found as exactly as a
  // simple one is. polyRoots, on the polynomial itself, reaches a solution it finds three times
  // over only to about a millionth.
  const common = pGcd(poly, poly.slice(1).map((c, i) => rMul(c, rat(i + 1))))
  const bare = pDeg(common) > 0 ? pDivMod(poly, common).q : poly
  const prim = pPrimitive(bare).prim
  const coeffs = prim.map((c) => rNum(c)).reverse()
  if (!coeffs.every(Number.isFinite)) return null
  const roots = polyRoots(coeffs)
  // polyRoots is good to only about 10⁻⁸ beside a double root: it read two real solutions as a complex pair, and
  // (x − 1)² = 10⁻²⁰ as 0.999999995 and 1.000000003 (H29). A quadratic's discriminant is settled on its exact
  // coefficients, and when it is positive the pair is worked out from it. Two solutions closer than 10⁻¹² of
  // their size are taken as one (H26): (x − 1)(x − 1.0000000000001) = 0 is the one solution 1, 1 ± 10⁻¹⁰ are two.
  const pair = realPairOfQuadratic(prim)
  // eslint-disable-next-line no-restricted-syntax -- parked for the owner (OWNER-APPROVALS CW3b-6): the pair is accurate, and the sentence's extra digits (MAX_EXTRA_DIGITS) could write 1 and 1.0000000000001 apart
  if (pair) return { real: distinct(pair, 1e-12, true), complex: [] }
  return { real: distinct(roots.filter((r) => r.im === 0).map((r) => r.re), 1e-9, true), complex: roots.filter((r) => r.im > 0).map(({ re, im }) => ({ re, im })) }
}

/**
 * The two real solutions of a quadratic whose discriminant is positive, or null where it is not
 * (or where the numbers do not fit a double: polyRoots is left to those). The discriminant is
 * worked out exactly, from the whole-number coefficients, so it is never lost in the rounding of
 * b² and 4ac: (x − 1)(x − 1.0000000000001) = 0 has the real solution 1, where polyRoots said
 * 1 ± 3.57×10⁻⁹i. The solutions are then found without taking away two nearly equal numbers:
 * q is −b with √Δ added in the direction of −b's own sign, one solution is q/a and the other is c/q.
 */
function realPairOfQuadratic(p: Poly): number[] | null {
  if (p.length !== 3) return null
  const [c, b, a] = p
  const disc = discriminant(a, b, c)
  if (rSign(disc) <= 0) return null
  const root = Math.sqrt(rNum(disc))
  const [an, bn, cn] = [rNum(a), rNum(b), rNum(c)]
  if (![root, an, bn, cn].every(Number.isFinite) || root === 0) return null
  const q = -(bn + (bn < 0 ? -root : root)) / 2
  return [q / an, cn / q]
}

/** Whether the two sides agree at x, to rounding (sin²x + cos²x differs from 1 by a hair, and is still 1); null where either has no value. */
function agreeAt(sides: [Fx, Fx], x: number): boolean | null {
  const a = sides[0](x)
  const b = sides[1](x)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  // eslint-disable-next-line no-restricted-syntax -- relative already (10⁻¹² of the larger side); the number against sameNumber's 10⁻¹⁵ is CW9's (P-CW2-REPORT class 1)
  return Math.abs(a - b) <= 1e-12 * Math.max(Math.abs(a), Math.abs(b))
}

/**
 * Whether the two sides agree on a spread of x: at every one that has a value, or along a stretch
 * (at one of them and a hair either side of it). Agreeing at one x of the spread alone is not a
 * stretch: √(x + 23.7) = 0 has the one solution −23.7, which is the first x of the spread.
 */
function agreement(sides: [Fx, Fx]): { everywhere: boolean; somewhere: boolean } {
  let finite = 0
  let agree = 0
  let along = false
  for (const x of AGREE_AT) {
    const here = agreeAt(sides, x)
    if (here === null) continue
    finite++
    if (!here) continue
    agree++
    if (!along && (agreeAt(sides, x - 0.01) === true || agreeAt(sides, x + 0.01) === true)) along = true
  }
  return { everywhere: finite >= 10 && agree === finite, somewhere: along }
}

/** The shortest gap between the solutions given that g goes on repeating over, or null when it does not repeat. */
function periodOf(g: Fx, near: number[]): number | null {
  const gaps: number[] = []
  for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) gaps.push(Math.abs(near[j] - near[i]))
  for (const period of gaps.sort((a, b) => a - b)) {
    if (period < 1e-6) continue
    let compared = 0
    const repeats = AGREE_AT.every((x) => {
      const a = g(x)
      const b = g(x + period)
      if (Number.isNaN(a) && Number.isNaN(b)) return true
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false
      compared++
      return Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a), Math.abs(b))
    })
    if (repeats && compared >= 10) return period
  }
  return null
}

/** The roots of g in every window of `spans`, merged; with `quick`, the first window that has any. */
function scanRoots(g: Fx, spans: number[], quick: boolean): number[] {
  const found: number[] = []
  // The windows already scanned, with their sample step: a finer one is the better judge of what lies inside it.
  const scanned: { x0: number; x1: number; step: number; roots: number[] }[] = []
  for (const h of spans) {
    const [x0, x1] = windowOf(h)
    // Past ±1000 the samples are more than a unit apart whatever their number, so all that is asked
    // out there is whether anything is (every root a bisection finds is a true one): a quarter of the
    // samples is enough, at a quarter of the cost. That matters for an equation with no root at all,
    // sin(x) = 2, which tries all eight windows.
    const n = h > 1000 ? 300 : 1200
    const roots = verticalLineXs(g, x0, x1, n)
    const step = (x1 - x0) / n
    // A root a coarse window reports where a finer one already looked and found none is the coarse window's
    // misreading of a domain edge: 10⁶√x + 0.01 = 0 was "x = 0" from the windows 10⁴ wide and more, whose step
    // is too long to see that the curve ends at 0.01 (H27).
    const seen = (r: number): boolean => r >= x0 && r <= x1
    const tolerance = (r: number): number => 1e-6 * Math.max(1, Math.abs(r))
    found.push(...roots.filter((r) => !scanned.some((w) => w.step < step && r >= w.x0 && r <= w.x1 && !w.roots.some((q) => Math.abs(q - r) <= tolerance(r)))))
    scanned.push({ x0, x1, step, roots: roots.filter(seen) })
    if (quick && found.length) break
  }
  return distinct(found, 1e-6)
}

/** A formula that is not a polynomial: its roots by scanning, and a sentence's worth of them when there are many. */
function solveByScan(g: Fx, sides: [Fx, Fx] | null, spans: number[], quick: boolean): XSolved {
  const same = sides ? agreement(sides) : null
  // sin²x + cos²x = 1 is 1 − 1 = 0 up to rounding at every x, which the scan would take for
  // hundreds of roots.
  if (same?.everywhere) return { kind: 'every' }
  // |x| = x is true for every x from 0 on, and floor(x) = 2 on [2, 3): the two sides agree to the
  // last digit at some x of the spread, which an isolated solution never lands on. There are no
  // separate lines to draw, and the scan would name the stretch's ends (x = 2 and x = 2.03).
  if (same?.somewhere) return { kind: 'stretch' }
  const found = scanRoots(g, spans, quick)
  if (!found.length) return { kind: 'none', complex: [] }
  if (quick) return { kind: 'real', xs: found }
  // x − sin x is exactly 0 for every |x| below 4×10⁻⁸ (the x³/6 it really is gets lost in rounding),
  // and the sign change the scan finds there lands on an edge of that stretch: sin x = x has the
  // solution x = 0, not x = −2×10⁻⁸. A root that close to 0, where 0 is as good a solution to the
  // last digit, is 0.
  const g0 = Math.abs(g(0))
  const flat = 1e-9 * Math.max(Math.abs(g(1e-3)), Math.abs(g(-1e-3)))
  const all = distinct(found.map((r) => (Math.abs(r) < 1e-6 && g0 <= flat ? 0 : r)), 1e-6)
  if (all.length <= MAX_LISTED) return { kind: 'real', xs: all }
  const byDistance = [...all].sort((a, b) => Math.abs(a) - Math.abs(b))
  let count = MAX_LISTED
  // A pair either side of 0 is listed whole or not at all: −7.85 and 7.85 are as near as each other.
  while (count < byDistance.length && Math.abs(Math.abs(byDistance[count]) - Math.abs(byDistance[count - 1])) <= 1e-6 * Math.max(1, Math.abs(byDistance[count]))) count++
  const nearest = byDistance.slice(0, count).sort((a, b) => a - b)
  if (count === all.length) return { kind: 'real', xs: nearest }
  const period = periodOf(g, nearest)
  return { kind: 'real', xs: nearest, more: period === null ? 'further' : { period } }
}

function solveX(expr: string, g: Fx, sides: [Fx, Fx] | null, spans: number[], quick: boolean): XSolved {
  const exact = exactSolutions(expr)
  if (exact === 'every') return { kind: 'every' }
  if (exact) return exact.real.length ? { kind: 'real', xs: exact.real } : { kind: 'none', complex: exact.complex }
  return solveByScan(g, sides, spans, quick)
}

/**
 * One step of withoutZeroPower: a whole-number power past the degree that is multiplied out, set
 * equal to 0 (on either side), comes to its base set equal to 0. A bare x is left alone — x^1e9 = 0
 * is the closed form's (highPowerSolutions), and exact.
 */
function baseOfZeroPower(sides: [string, string]): [string, string] | null {
  const orders: [string, string][] = [sides, [sides[1], sides[0]]]
  for (const [power, zero] of orders) {
    try {
      if (constantValue(math.parse(preprocess(zero))) !== 0) continue
      const p = numberedPower(unbracketed(math.parse(preprocess(power))))
      if (!p || !Number.isInteger(p.exponent) || p.exponent <= MAX_EXACT_DEGREE) continue
      if (unbracketed(p.base).type === 'SymbolNode') continue
      return [p.base.toString(), '0']
    } catch {
      // Not a formula that reads: the other way round, or not this at all.
    }
  }
  return null
}

/**
 * P^N = 0, for a whole number N past the degree that is multiplied out, is P = 0: the power is
 * never worked out. (x − 1)^100 is under 10^−308, which is 0 to the last digit, for every x within
 * 0.0069 of 1, so the scan took the end of that stretch for a second solution (1.000367) and
 * (x − 1)^1000 for a whole stretch of them. A power of a power goes down to its base in as many
 * steps. The two sides to solve in its place, or null where the equation is not this.
 */
function withoutZeroPower(sides: [string, string] | undefined): [string, string] | null {
  let less: [string, string] | null = null
  // Each step goes to a part of the formula, so this ends.
  for (let step = sides ? baseOfZeroPower(sides) : null; step; step = baseOfZeroPower(step)) less = step
  return less
}

/** The two sides of an equation as functions of x, reading the scene's sliders live, or null when they will not compile. */
function sideFns(sides: [string, string] | undefined, live: Record<string, unknown>): [Fx, Fx] | null {
  if (!sides) return null
  try {
    const [left, right] = sides.map((side) => compileScalar(side, ['x'], () => live, sceneNames()))
    return [(x) => left({ x }), (x) => right({ x })]
  } catch {
    return null
  }
}

/** Why an equation in x alone draws no line in the windows tried, or null when it draws one. */
function whyNoLines(sol: XSolved, spans: number[]): string | null {
  switch (sol.kind) {
    case 'real': {
      // The view reaches only as far as the widest window; a solution beyond it is told apart in drawability (farOut).
      const [lo, hi] = windowOf(Math.max(...spans))
      return sol.xs.some((x) => x >= lo && x <= hi) ? null : NO_REAL_X
    }
    case 'none':
      return NO_REAL_X
    case 'every':
      return EVERY_X
    case 'stretch':
      return STRETCH_X
  }
}

/**
 * The solutions of the equation `expr` (left − right, `sides` as typed) in x alone, for the command
 * bar to name; null when a formula the graph compiler hands to mathjs takes more than DRAW_BUDGET_MS.
 */
export function solutionsInX(expr: string, sides: [string, string] | undefined, scope: Record<string, unknown>): XSolved | null {
  const live: Record<string, unknown> = { ...scope }
  const tick = ticker(DRAW_LIMITS)
  try {
    // A high power set to 0 is solved from the thing that is raised (withoutZeroPower).
    const less = withoutZeroPower(sides)
    const solving = less ? `(${less[0]}) - (${less[1]})` : expr
    const f = compileScalar(solving, ['x', 'y'], () => live, sceneNames())
    const g: Fx = (x) => {
      tick()
      return f({ x, y: 0 })
    }
    return solveX(solving, g, sideFns(less ?? sides, live), SPANS, false)
  } catch {
    // Out of time, or a formula the compiler would not take: the graph is made all the same, unnamed.
    return null
  }
}

/** For each piece of a piecewise curve, in order: why it shows nothing ("the piece x from 1 to 1 has no stretch of x"), or null when it draws a line. */
function pieceWhys(spec: DrawSpec, fns: ScalarFn[], digits: Digits): (string | null)[] {
  return (spec.pieces ?? []).map((p, i) => {
    const named = `the piece ${p.expr} from ${fmtLabel(p.from, digits)} to ${fmtLabel(p.to, digits)}`
    // samplePiecewise drops a piece whose ends are the same x (math/graphs.ts).
    if (p.from === p.to) return `${named} has no stretch of x`
    const r = alongX((x) => fns[i]({ x }), Math.min(p.from, p.to), Math.max(p.from, p.to))
    return r === 'line' ? null : `${named} ${SAYS_X[r]}`
  })
}

/** An implicit graph whose formula has no y (inXAlone): the two sides as functions of x, when they compile. */
interface XOnly {
  sides: [Fx, Fx] | null
  /** What is solved in place of the equation as typed, when that is a high power set to 0 (withoutZeroPower): its formula and its function of x. */
  solving?: { expr: string; g: Fx }
}

/** The way an equation in x alone is judged: by its two sides, and by the equation it comes to when that is a high power set to 0. */
function xOnlyOf(spec: DrawSpec, live: Record<string, unknown>, timed: (f: ScalarFn) => ScalarFn): XOnly {
  const less = withoutZeroPower(spec.sides)
  if (!less) return { sides: sideFns(spec.sides, live) }
  const expr = `(${less[0]}) - (${less[1]})`
  try {
    const f = timed(compileScalar(expr, ['x', 'y'], () => live, sceneNames()))
    return { sides: sideFns(less, live), solving: { expr, g: (x) => f({ x, y: 0 }) } }
  } catch {
    return { sides: sideFns(spec.sides, live) }
  }
}

/** Why the graph shows nothing with the sliders where they are now, or null when it shows something. */
function emptyWhy(spec: DrawSpec, fns: ScalarFn[], digits: Digits, spans: number[], only?: XOnly): string | null {
  const fmt = (v: number) => fmtLabel(v, digits)
  switch (spec.kind) {
    case 'explicit': {
      const f = (x: number) => fns[0]({ x })
      const RANK = { none: 0, large: 1, points: 2 }
      let seen: 'points' | 'large' | 'none' = 'none'
      for (const h of spans) {
        const r = alongX(f, -0.9713 * h, 1.0287 * h)
        if (r === 'line') return null
        if (RANK[r] > RANK[seen]) seen = r
      }
      return seen === 'none' ? 'it has no real value for any x' : `it ${SAYS_X[seen]}`
    }
    case 'piecewise': {
      // The curve shows something while any one piece does; the pieces that show nothing are
      // named in a note (drawability), and only a curve with none that shows is empty.
      const whys = pieceWhys(spec, fns, digits)
      return whys.length > 0 && whys.every((w) => w !== null) ? whys[0] : null
    }
    case 'between': {
      const lo = spec.tMin ?? 0
      const hi = spec.tMax ?? 0
      // visualizeBetween refuses a region with no width in its own words.
      if (!(hi > lo)) return null
      let upper = false
      let lower = false
      let before = false
      let filled = false
      // Two curves written differently can still be one (sin²x + cos²x and 1): they agree to
      // rounding. How far apart they are is summed over the points looked at, with the size of the
      // curves there, so that a rounding slip at one point does not make them two.
      let gap = 0
      let size = 0
      const compare = (uy: number, ly: number) => {
        gap += Math.abs(uy - ly)
        size += Math.max(1, Math.abs(uy), Math.abs(ly))
      }
      // The viewport fills a column only where both curves have a value at both of its sides.
      for (let i = 0; i <= 400; i++) {
        const x = lo + ((hi - lo) * i) / 400
        const uy = fns[0]({ x })
        const ly = fns[1]({ x })
        const u = Number.isFinite(uy)
        const l = Number.isFinite(ly)
        if (u && l && before) filled = true
        if (u && l) compare(uy, ly)
        upper ||= u
        lower ||= l
        before = u && l
      }
      if (filled && gap > SAME_TO * size) return null
      // The same at all 401 points is not the same: sin(100πx) is 0 at every x = 0.01k, and sin x at
      // every multiple of π, so both lined up with the grid and were taken for the line y = 0. Another
      // 400 points, spread by the golden ratio so that none of them keeps step with the grid, decide.
      if (filled) {
        for (let j = 1; j <= 400; j++) {
          const x = lo + (hi - lo) * ((j * OFF_GRID) % 1)
          const uy = fns[0]({ x })
          const ly = fns[1]({ x })
          if (Number.isFinite(uy) && Number.isFinite(ly)) compare(uy, ly)
        }
        if (gap > SAME_TO * size) return null
      }
      const span = `between x = ${fmt(lo)} and ${fmt(hi)}`
      // Shaded between them the area is 0, and the line used to say "Region shaded … 0".
      if (filled) return `${SAME_CURVES} ${span}, so there is no region between them`
      if (!upper) return `y = ${spec.exprs[0]} has no real value ${span}`
      if (!lower) return `y = ${spec.exprs[1]} has no real value ${span}`
      return `the two curves never both have a value at the same x ${span}`
    }
    case 'polar': {
      const r = (t: number) => fns[0]({ theta: t, t })
      const seen = alongT((t) => r(t) * Math.cos(t), (t) => r(t) * Math.sin(t), spec.tMin ?? 0, spec.tMax ?? 2 * Math.PI)
      return seen === 'line' ? null : seen === 'none' ? 'r has no real value for any θ' : 'r has a real value only at separate values of θ, with no line between them'
    }
    case 'parametric': {
      const t0 = spec.tMin ?? 0
      const t1 = spec.tMax ?? 2 * Math.PI
      if (t0 === t1) return `t runs from ${fmt(t0)} to ${fmt(t1)}, so the curve is a single point`
      const seen = alongT((t) => fns[0]({ t }), (t) => fns[1]({ t }), t0, t1)
      const span = `for t from ${fmt(t0)} to ${fmt(t1)}`
      return seen === 'line' ? null : seen === 'none' ? `it has no real point ${span}` : `it has a real point only at separate values of t ${span}, with no line between them`
    }
    case 'surface': {
      let real = false
      // The 3D view always draws the square from −6 to 6 on a 140 × 140 grid (render/GraphView.tsx).
      const { indices } = surfaceGeometry((x, y) => {
        const z = fns[0]({ x, y })
        real ||= Number.isFinite(z)
        return z
      }, 6, 140)
      if (indices.length) return null
      return real ? 'it has a real value only at separate points of the 3D view, with no surface between them' : `it has no real value for any x and y from ${fmt(-6)} to ${fmt(6)}, the square the 3D view shows`
    }
    case 'inequality': {
      let real = false
      const F: Fxy = (x, y) => {
        const v = fns[0]({ x, y })
        real ||= Number.isFinite(v)
        return v
      }
      for (const h of spans) {
        const [x0, x1, y0, y1] = windowOf(h)
        if (inequalityMesh(F, spec.op ?? '<', x0, x1, y0, y1, FILL_CELLS, FILL_CELLS).length || implicitSegments(F, x0, x1, y0, y1, CELLS, CELLS).length) return null
      }
      return real ? 'it is true for no area of the plane, so there is nothing to shade' : 'it has no real value for any x and y'
    }
    case 'implicit':
      // x² = 4 is two vertical lines whatever y is, and (x − 1)² = 0 one that marching squares cannot see.
      if (only) return whyNoLines(solveX(only.solving?.expr ?? spec.exprs[0], only.solving?.g ?? ((x) => fns[0]({ x, y: 0 })), only.sides, spans, true), spans)
      return implicitWhy((x, y) => fns[0]({ x, y }), spans, spec.sides)
  }
}

/**
 * Whether the formula shows something in windows far past those the view can reach (FAR_SPANS),
 * which decides how a graph that is empty within reach is described: it has nothing to draw, or it
 * lies too far out to. Coarse on purpose; only explicit curves, implicit curves and inequalities
 * have unbounded windows, the rest run over a stretch the student typed.
 */
function farOut(spec: DrawSpec, fns: ScalarFn[]): boolean {
  switch (spec.kind) {
    case 'explicit':
      return FAR_SPANS.some((h) => alongX((x) => fns[0]({ x }), -0.9713 * h, 1.0287 * h) === 'line')
    case 'implicit':
    case 'inequality': {
      const F: Fxy = (x, y) => fns[0]({ x, y })
      return FAR_SPANS.some((h) => {
        const [x0, x1, y0, y1] = windowOf(h)
        return implicitSegments(F, x0, x1, y0, y1, CELLS, CELLS).length > 0 || (spec.kind === 'inequality' && inequalityMesh(F, spec.op ?? '<', x0, x1, y0, y1, FILL_CELLS, FILL_CELLS).length > 0)
      })
    }
    default:
      return false
  }
}

/**
 * Whether a graph will show something, worked out before it is made. Pure but for a limit on what
 * it may spend (DrawLimits; `limits` is for the tests to make it tiny): `scope` holds only the
 * scene's own names (a slider's value, a point's coordinates), not the evaluator's clock t or its
 * unit vectors, so no formula is read as using a slider it does not have. A formula that is empty
 * only at a slider's current value — k = −1 under x² + y² = k — is still drawable, with a note,
 * because the student may be about to move k; one that no slider value tried helps is refused. A
 * check that runs out of what it may spend says nothing it has not found: the graph is made, with
 * no note and no reason, as every graph was before there was a check.
 */
export function drawability(spec: DrawSpec, scope: Record<string, unknown>, digits: Digits, graphs: NamedGraphs = {}, limits: DrawLimits = DRAW_LIMITS): Drawability {
  const problem = formulaProblem(spec, scope, graphs)
  if (problem) return { ok: false, reason: problem }
  const vars = DRAW_VARS[spec.kind]
  const live: Record<string, unknown> = { ...scope }
  const tick = ticker(limits)
  const timed = (f: ScalarFn): ScalarFn => (v) => {
    tick()
    return f(v)
  }
  const fns: ScalarFn[] = spec.exprs.map((e) => timed(compileScalar(e, vars, () => live, sceneNames())))
  // An equation in x alone is judged by its solutions, not by a curve in x and y.
  const only: XOnly | undefined = spec.kind === 'implicit' && inXAlone(spec.exprs[0]) ? xOnlyOf(spec, live, timed) : undefined
  let why: string | null
  let bare: string[] = []
  try {
    why = emptyWhy(spec, fns, digits, SPANS, only)
    // A curve in pieces is made while one piece shows something, and the pieces that show nothing are named.
    if (why === null && spec.kind === 'piecewise') bare = pieceWhys(spec, fns, digits).filter((w): w is string => w !== null)
  } catch (e) {
    if (e instanceof OutOfTime) return { ok: true }
    throw e
  }
  if (why === null) return bare.length ? { ok: true, note: bare.map((w) => `${w}, so it shows nothing`).join('; ') } : { ok: true }
  const reason: string = why
  // Nothing within reach: before saying it has no points, a coarse look far out (farOut) decides
  // whether it has some beyond what the view can show. It looks at the sliders' own values, which
  // the probes below leave moved.
  const refused = (): Drawability => {
    Object.assign(live, scope)
    let said = reason
    try {
      // Equal everywhere, or along a stretch, is not a curve past the view: rounding in
      // sin²x + cos²x − 1 would make marching squares find one.
      if (reason !== EVERY_X && reason !== STRETCH_X && farOut(spec, fns)) said = FAR_WHY
    } catch (e) {
      // Out of time for the look that tells "no point at all" from "too far out": which of the two
      // it is stays unknown, and neither is said.
      if (e instanceof OutOfTime) return { ok: true }
      throw e
    }
    return { ok: false, reason: cannotDraw(spec.kind, said) }
  }
  const used = new Set(spec.exprs.flatMap((e) => symbolsOf(math.parse(preprocess(e, sceneNames())))))
  const sliders = [...used].filter((n) => typeof scope[n] === 'number' && !vars.includes(n))
  if (!sliders.length) return refused()
  const at = sliders.map((n) => `${n} = ${fmtLabel(scope[n] as number, digits)}`).join(' and ')
  const noted = (moving: string[]): Drawability => ({ ok: true, note: `at ${at} there is nothing to draw; move ${moving.join(' or ')} to see it` })
  const showsWith = (values: Record<string, number>): boolean => {
    Object.assign(live, scope, values)
    return emptyWhy(spec, fns, digits, PROBE_SPANS, only) === null
  }
  // The sliders a probe has found a value for, as far as the check got.
  const moving: string[] = []
  try {
    for (const n of sliders) if (PROBES.some((v) => showsWith({ [n]: v }))) moving.push(n)
    if (moving.length) return noted(moving)
    if (sliders.length > 1 && PROBES.some((v) => showsWith(Object.fromEntries(sliders.map((n) => [n, v]))))) return noted(sliders)
    return refused()
  } catch (e) {
    // Empty where the sliders are, and out of what it may spend before all were tried: made. The
    // note that moving a slider shows it is said only of a slider a probe found a value for. It was
    // said of all of them, and x² + y² = −1 − k², which no k can ever draw, was made with it.
    if (e instanceof OutOfTime) return moving.length ? noted(moving) : { ok: true }
    throw e
  }
}

// Calculator/solver → scene bridge: turn results into live objects.

import { Builder } from './factory'
import { scene } from './store'
import type { V3 } from '../math/vec'
import { planDrawing, type DrawStyle, type Solution, type VisualVector } from '../math/vectorSolver'
import type { GraphKind, SceneObject } from './types'
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

/** f(x) with its tangent line at x = a (derivative visualisation). */
export function visualizeTangent(expr: string, a: number, fa: number, slope: number): void {
  clearTagged('calculus')
  const b = new Builder()
  b.graph({ kind: 'explicit', source: `y = ${expr}`, exprs: [expr], showRoots: false, showExtrema: false })
  const tangent = `${fa} + ${slope} * (x - ${a})`
  b.graph({ kind: 'explicit', source: `tangent at x = ${a}`, exprs: [tangent], width: 1.8 }, { color: themeColor('--warn', '#ffb84d'), name: 'tangent' })
  b.point([a, fa, 0], { name: 'T' })
  b.text([a, fa, 0], `slope = ${Number(slope.toPrecision(6))}`, { name: 'slopeText' })
  b.commit()
  remember('calculus', b)
  scene().setViewMode('2d')
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

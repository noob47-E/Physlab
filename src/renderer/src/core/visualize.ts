// Calculator/solver → scene bridge: turn results into live objects.

import { Builder } from './factory'
import { scene } from './store'
import { add, type V3 } from '../math/vec'
import { sceneName, type Solution, type VisualVector } from '../math/vectorSolver'
import type { GraphKind, VectorObj } from './types'
import { fitCamera } from '../render/viewState'
import { themeColor } from '../app/theme'

export type DrawStyle = 'head-to-tail' | 'parallelogram' | 'common-tail'

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
  const alive = (drawn.get(tag) ?? []).filter((id) => s.objects[id])
  if (alive.length) s.removeObjects(alive)
  drawn.delete(tag)
}

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
 * Every vector that is not an input is drawn from its own components. The parallelogram layout
 * used to rebuild the result as "A + B" from the title, which drew A + B for a subtraction, a
 * projection and a relative velocity — the answer card said (1, 5) and the drawing showed (5, 3).
 */
export function visualizeSolution(sol: Solution, style?: DrawStyle): void {
  const vis = sol.visual
  if (!vis) return
  clearTagged('solution')
  const b = new Builder()
  const inputs = vis.vectors.filter((v) => v.role === 'input')
  const others = vis.vectors.filter((v) => v.role !== 'input')
  let mode = style ?? vis.mode ?? 'common-tail'
  if (mode === 'parallelogram' && inputs.length !== 2) mode = 'head-to-tail'

  /** One arrow, named so the scene can read it back, helpers kept auxiliary whatever the layout. */
  const draw = (v: VisualVector, tail: V3): VectorObj => {
    const obj = b.vector({ kind: 'free', tail, comp: v.drawn ?? v.v }, { name: sceneName(v.name), color: roleColor(v.role), auxiliary: v.role === 'helper' })
    if (v.note) obj.caption = v.note
    return obj
  }

  if (mode === 'head-to-tail') {
    let cursor: V3 = [0, 0, 0]
    for (const v of inputs) {
      draw(v, cursor)
      cursor = add(cursor, v.v)
    }
    for (const v of others) draw(v, v.tail ?? [0, 0, 0])
  } else if (mode === 'parallelogram') {
    const [p, q] = inputs
    const A = draw(p, [0, 0, 0])
    const B = draw(q, [0, 0, 0])
    // Dashed opposite sides, linked to the originals so dragging keeps the parallelogram.
    const faint = themeColor('--text-faint', '#6c707a')
    b.vector({ kind: 'placed', vector: B.id, tail: headPoint(b, A.id) }, { name: `${B.name}_`, color: faint, auxiliary: true })
    b.vector({ kind: 'placed', vector: A.id, tail: headPoint(b, B.id) }, { name: `${A.name}_`, color: faint, auxiliary: true })
    for (const v of others) draw(v, v.tail ?? [0, 0, 0])
  } else {
    for (const v of vis.vectors) draw(v, v.tail ?? [0, 0, 0])
  }
  b.commit()
  remember('solution', b)
  if (vis.vectors.some((v) => Math.abs((v.drawn ?? v.v)[2]) > 1e-9)) scene().setViewMode('3d')
  scene().select(b.created.filter((o) => o.type === 'vector' && !o.auxiliary).map((o) => o.id).slice(-1))
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

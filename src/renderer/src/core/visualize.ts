// Calculator/solver → scene bridge: turn results into live objects.

import { Builder } from './factory'
import { scene } from './store'
import { add, type V3 } from '../math/vec'
import type { Solution } from '../math/vectorSolver'
import type { GraphKind } from './types'
import { fitCamera } from '../render/viewState'

export type DrawStyle = 'head-to-tail' | 'parallelogram' | 'common-tail'

export function visualizeSolution(sol: Solution, style?: DrawStyle): void {
  const vis = sol.visual
  if (!vis) return
  const b = new Builder()
  const inputsCount = vis.vectors.filter((v) => v.role === 'input').length
  let mode = style ?? vis.mode ?? 'common-tail'
  if (mode === 'parallelogram' && inputsCount !== 2) mode = 'head-to-tail'
  const inputs = vis.vectors.filter((v) => v.role === 'input')
  const others = vis.vectors.filter((v) => v.role !== 'input')

  if (mode === 'head-to-tail') {
    let cursor: V3 = [0, 0, 0]
    for (const v of inputs) {
      b.vector({ kind: 'free', tail: cursor, comp: v.v }, { name: v.name, color: v.color })
      cursor = add(cursor, v.v)
    }
    for (const v of others) b.vector({ kind: 'free', tail: v.tail ?? [0, 0, 0], comp: v.v }, { name: v.name, color: v.color })
  } else if (mode === 'parallelogram' && inputs.length === 2) {
    const [p, q] = inputs
    const A = b.vector({ kind: 'free', tail: [0, 0, 0], comp: p.v }, { name: p.name, color: p.color })
    const B = b.vector({ kind: 'free', tail: [0, 0, 0], comp: q.v }, { name: q.name, color: q.color })
    // Dashed opposite sides, linked to the originals so dragging keeps the parallelogram.
    b.vector({ kind: 'placed', vector: B.id, tail: headPoint(b, A.id) }, { name: `${q.name}′`, color: '#868e96', auxiliary: true })
    b.vector({ kind: 'placed', vector: A.id, tail: headPoint(b, B.id) }, { name: `${p.name}′`, color: '#868e96', auxiliary: true })
    for (const v of others) {
      if (v.role === 'result' && sol.title.includes('×')) {
        b.vector({ kind: 'expr', expr: `cross(${A.name}, ${B.name})` }, { name: v.name, color: v.color })
      } else if (v.role === 'result') {
        b.vector({ kind: 'expr', expr: `${A.name} + ${B.name}` }, { name: v.name, color: v.color })
      } else {
        b.vector({ kind: 'free', tail: v.tail ?? [0, 0, 0], comp: v.v }, { name: v.name, color: v.color })
      }
    }
  } else {
    for (const v of vis.vectors) {
      b.vector({ kind: 'free', tail: v.tail ?? [0, 0, 0], comp: v.v }, { name: v.name, color: v.color, auxiliary: v.role === 'helper' })
    }
  }
  b.commit()
  if (vis.vectors.some((v) => Math.abs(v.v[2]) > 1e-9)) scene().setViewMode('3d')
  scene().select(b.created.filter((o) => o.type === 'vector' && !o.auxiliary).map((o) => o.id).slice(-1))
  fitCamera()
}

function headPoint(b: Builder, vectorId: string): string {
  return b.point({ kind: 'vectorHead', vector: vectorId }, { auxiliary: true, visible: false }).id
}

export function visualizeVector(v: V3, name?: string, tail: V3 = [0, 0, 0]): void {
  const b = new Builder()
  b.vector({ kind: 'free', tail, comp: v }, { name })
  b.commit()
  if (Math.abs(v[2]) > 1e-9 || Math.abs(tail[2]) > 1e-9) scene().setViewMode('3d')
}

export function visualizePoint(p: V3, name?: string): void {
  const b = new Builder()
  b.point(p, { name })
  b.commit()
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
  const b = new Builder()
  b.graph({ kind: 'explicit', source: `y = ${expr}`, exprs: [expr], showRoots: false, showExtrema: false })
  const tangent = `${fa} + ${slope} * (x - ${a})`
  b.graph({ kind: 'explicit', source: `tangent at x = ${a}`, exprs: [tangent], width: 1.8 }, { color: '#ffa94d', name: 'tangent' })
  b.point([a, fa, 0], { name: 'T' })
  b.text([a, fa, 0], `slope = ${Number(slope.toPrecision(6))}`, { name: 'slopeText' })
  b.commit()
  scene().setViewMode('2d')
}

/** f(x) with the area between the curve and the x-axis from a to b shaded (integral visualisation). */
export function visualizeArea(expr: string, a: number, bnd: number, label: string): void {
  const b = new Builder()
  b.graph({ kind: 'explicit', source: `y = ${expr}`, exprs: [expr], showRoots: false, showExtrema: false })
  b.graph({ kind: 'area', source: label, exprs: [expr], tMin: Math.min(a, bnd), tMax: Math.max(a, bnd) }, { color: '#4dabf7', name: 'area' })
  b.commit()
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
  const b = new Builder()
  xs.forEach((x, i) => b.point([x, ys[i], 0], { auxiliary: true, showLabel: false }))
  if (expr) b.graph({ kind: 'explicit', source: title, exprs: [expr], showRoots: false, showExtrema: false }, { name: 'fit' })
  b.commit()
  scene().setViewMode('2d')
  // Readings are rarely near the origin at the scale the grid starts on — free fall runs 0 to 5 m
  // against 0 to 1 s² — so the camera has to come to the data.
  fitCamera()
}

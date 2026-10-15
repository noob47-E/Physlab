// 3D-3B: what the 3-D Measure card is given - each selected object as math/measure3d.ts reads it (a point, a line along its
// direction, a plane as ax + by + cz = d, a solid with its sizes), and the short list of the drawing's 3-D objects with the
// number a student wants from each.

import type { Computed, EvalResult, ObjId, SceneObject, SceneSettings } from '../core/types'
import { displayName } from '../core/naming'
import { compileScalar, sceneNames } from '../math/expr'
import { planeOf } from '../math/graph3d'
import { formatMeasure, fmtPoint } from '../math/format'
import { planeEquationTex, type Item3D } from '../math/measure3d'
import { add, cross, len, sub, type V3 } from '../math/vec'

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

/** A normal of whole numbers divided by their greatest common divisor, the first one not 0 made positive; any other as it is. */
export function wholeNormal(n: V3): V3 {
  if (!n.every(Number.isInteger)) return n
  const g = n.reduce((m, x) => gcd(m, Math.abs(x)), 0)
  if (g === 0) return n
  const first = n.find((x) => x !== 0) ?? 1
  const s = first < 0 ? -g : g
  // + 0 turns a −0 into 0.
  return n.map((x) => x / s + 0) as V3
}

/** A typed plane's coefficients (3D-2 keeps F(x, y, z) = left − right). */
function typedPlane(o: Extract<SceneObject, { type: 'graph' }>, ev: EvalResult): { a: number; b: number; c: number; d: number } | null {
  try {
    const F = compileScalar(o.exprs[0], ['x', 'y', 'z'], () => ({ ...ev.scope }), sceneNames())
    return planeOf((x, y, z) => F({ x, y, z }))
  } catch {
    return null
  }
}

/** One object as an item to measure, or null when it is nothing Measure reads in 3-D (a circle, a number). */
export function itemOf(o: SceneObject, c: Computed | undefined, objects: Record<ObjId, SceneObject>, ev: EvalResult): Item3D | null {
  const name = displayName(o, objects, c)
  if (o.type === 'graph' && o.kind === 'plane') {
    const p = typedPlane(o, ev)
    return p ? { type: 'plane', name: o.name, ...p } : null
  }
  if (!c) return null
  switch (c.type) {
    case 'point':
      return { type: 'point', name, p: c.p }
    case 'segment':
      return { type: 'line', name, p: c.line.p, d: c.line.d, ends: [c.line.p, add(c.line.p, c.line.d)] }
    case 'line':
    case 'ray':
      return { type: 'line', name, p: c.line.p, d: c.line.d }
    case 'plane': {
      // Written with the three points' own cross product, in lowest whole numbers when they are whole: (0, −1, 4), not
      // the unit normal (0, −0.24, 0.97).
      const n = wholeNormal(cross(sub(c.pts[1], c.pts[0]), sub(c.pts[2], c.pts[0])))
      return { type: 'plane', name, a: n[0], b: n[1], c: n[2], d: n[0] * c.pts[0][0] + n[1] * c.pts[0][1] + n[2] * c.pts[0][2] }
    }
    case 'solid':
      return o.type === 'solid' ? { type: 'solid', name, kind: o.kind, size: c.size, volume: c.shape.volume, area: c.shape.area, poly: c.shape.poly ? { ...c.shape.poly, vertices: c.shape.vertices } : undefined } : null
    default:
      return null
  }
}

interface ListRow {
  id: ObjId
  name: string
  /** The number a student wants from it, as text: V and A of a solid, a plane's equation, a point's place. */
  text: string
}

/** The drawing's 3-D objects in order: solids, planes, points, lines. */
export function objectList(order: ObjId[], objects: Record<ObjId, SceneObject>, ev: EvalResult, s: SceneSettings): ListRow[] {
  const rows: ListRow[] = []
  for (const id of order) {
    const o = objects[id]
    const c = ev.values.get(id)
    if (!o || !o.visible || o.auxiliary) continue
    const name = displayName(o, objects, c)
    if (c?.type === 'solid') rows.push({ id, name, text: `V = ${formatMeasure(c.shape.volume, 'volume', s)}, total surface ${formatMeasure(c.shape.area, 'area', s)}` })
    else if (c?.type === 'plane' || (o.type === 'graph' && o.kind === 'plane')) {
      const it = itemOf(o, c, objects, ev)
      if (it?.type === 'plane') rows.push({ id, name, text: planeEquationTex(it.a, it.b, it.c, it.d, s) })
    } else if (c?.type === 'point') rows.push({ id, name, text: fmtPoint(c.p) })
    // Review: a segment with its length, a line or ray with its direction, so it can be picked from here too.
    else if (c?.type === 'segment') rows.push({ id, name, text: `length ${formatMeasure(len(c.line.d), 'length', s)}` })
    else if (c?.type === 'line' || c?.type === 'ray') rows.push({ id, name, text: `along ${fmtPoint(c.line.d)}` })
  }
  return rows
}

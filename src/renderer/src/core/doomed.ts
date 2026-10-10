// What a delete takes with it: a shape's own sides (`sidesOf`) and everything built on what is
// deleted (`doomedBy`). Out of core/store.ts (CLEANUP-PLAN.md CW8b) so the Lego helpers in
// core/legoScene.ts can share them without a cycle; the store re-exports both.

import { dependentsOf } from './evaluate'
import type { ObjId, PolygonObj, SceneObject } from './types'

/**
 * A shape's own sides: the segments the tool laid down with it. `Builder.polygon` pushes the
 * polygon and then one segment per side, so they are the segments that follow the polygon in
 * `order`, each joining two consecutive corners, up to one per side. A segment the student drew
 * before the shape existed (a loop `closeLoopIfAny` recognised) comes earlier in `order` and is
 * theirs to keep; a side a neighbouring shape laid over the same two corners follows *that*
 * shape and is not this one's. A quadrilateral's diagonal joins corners that are not consecutive
 * and is never a side.
 */
export function sidesOf(poly: PolygonObj, objects: Record<ObjId, SceneObject>, order: ObjId[]): ObjId[] {
  const n = poly.points.length
  const pairs = new Set<string>()
  for (let i = 0; i < n; i++) {
    const a = poly.points[i]
    const b = poly.points[(i + 1) % n]
    pairs.add(`${a}|${b}`)
    pairs.add(`${b}|${a}`)
  }
  const start = order.indexOf(poly.id)
  if (start < 0) return []
  const sides: ObjId[] = []
  for (let i = start + 1; i < order.length && sides.length < n; i++) {
    const o = objects[order[i]]
    if (o?.type !== 'segment' || !pairs.has(`${o.a}|${o.b}`)) break
    sides.push(o.id)
  }
  return sides
}

/**
 * Everything a delete takes: the objects named, whatever was built on them, and a shape's sides.
 * The Triangle and Polygon tools draw a shape as a polygon plus one segment per side, and the
 * sides depend on the corner points, not on the polygon — so deleting the triangle used to leave
 * its three sides on screen, indistinguishable from the triangle just deleted. The corners stay:
 * they are the student's points, and other objects may be built on them.
 */
export function doomedBy(ids: ObjId[], objects: Record<ObjId, SceneObject>, order: ObjId[]): Set<ObjId> {
  const doomed = new Set<ObjId>()
  const take = (id: ObjId) => {
    if (doomed.has(id)) return
    doomed.add(id)
    for (const d of dependentsOf(id, objects)) doomed.add(d)
  }
  for (const id of ids) take(id)
  // A side's dependents can doom a second shape (a point placed on side BC is a corner of PQR),
  // so the walk must reach shapes doomed along the way; a snapshot taken before the loop left
  // PQR's far side on screen — the same stray outline one level down.
  for (const id of doomed) {
    const o = objects[id]
    if (o?.type === 'polygon') for (const side of sidesOf(o, objects, order)) take(side)
  }
  // A caption goes with what it describes; it is not a dependency, since nothing in it is computed from its owner.
  for (const o of Object.values(objects)) if (o.type === 'text' && o.owner && doomed.has(o.owner)) doomed.add(o.id)
  return doomed
}

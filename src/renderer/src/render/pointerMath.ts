// The Move tool's pointer decisions, kept out of Interaction.tsx so they can be tested without a
// canvas: whether a press may start a drag, where the drag starts, what a click does to the
// selection, and how the pointer tips write their numbers.

import * as THREE from 'three/webgpu'
import { isFree, parentRefs } from '../core/evaluate'
import type { ObjId, SceneObject, ViewMode } from '../core/types'
import { fmtPrecise, formatMeasure, measureValue, superscriptPowers, type MeasureSettings } from '../math/format'
import type { V3 } from '../math/vec'
import { screenToPlane, XY_PLANE, type ViewSize } from './cameraUtils'

/** The free points (and free arrow tails) a drag of `o` moves, with where they are now. */
export function collectFreePoints(o: SceneObject, objects: Record<ObjId, SceneObject>, out: Map<ObjId, V3>, seen = new Set<ObjId>()): void {
  if (seen.has(o.id)) return
  seen.add(o.id)
  if (o.type === 'point' && o.def.kind === 'free') {
    out.set(o.id, o.def.p)
    return
  }
  if (o.type === 'vector' && o.def.kind === 'free') {
    out.set(o.id, o.def.tail)
    return
  }
  if (o.type === 'point') return // dependent points do not move their parents
  for (const pid of parentRefs(o)) {
    const p = objects[pid]
    if (p) collectFreePoints(p, objects, out, seen)
  }
}

/**
 * Whether a Move-tool press on `o` starts a drag. Not on a locked object, nor on one with nothing
 * a drag could move — a crossing, a midpoint, a point on an arrow head. The press used to switch
 * the camera controls off before finding that out, and the release that turns them back on only
 * came after a drag, so they stayed off (W3); a dependent point showed "move (…)" and left an
 * empty undo step (W22).
 */
export function canDrag(o: SceneObject, objects: Record<ObjId, SceneObject>): boolean {
  if (o.locked) return false
  if (isFree(o)) return true
  // Points that live on a side slide along it.
  if (o.type === 'point' && o.def.kind === 'onObject') return true
  const m = new Map<ObjId, V3>()
  collectFreePoints(o, objects, m)
  return m.size > 0
}

/**
 * The plane a drag runs on and the grabbed spot on it. In 3-D the plane is level at the anchor's
 * height, or upright facing the camera when the view is nearly level. The start used to be where
 * the pointer met the floor (z = 0) while every later position was taken on this plane, so an
 * arrow with its tail at z = 2 leapt on the first move (W4). Both are now on the same plane.
 */
export function dragFrom(camera: THREE.Camera, size: ViewSize, x: number, y: number, viewMode: ViewMode, anchor: V3): { plane: THREE.Plane; startWorld: V3 } {
  let plane: THREE.Plane
  if (viewMode === '2d') plane = XY_PLANE
  else {
    plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -anchor[2])
    const view = new THREE.Vector3()
    camera.getWorldDirection(view)
    if (Math.abs(view.z) < 0.15) plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(view.x, view.y, 0).normalize(), new THREE.Vector3(...anchor))
  }
  return { plane, startWorld: screenToPlane(camera, size, x, y, plane) ?? anchor }
}

/**
 * The selection after a Move-tool press on `hitId` is let go. A plain click that did not move
 * selects only what was clicked, as a click on an unselected object does; the press kept a
 * multi-selection whole, so Delete next took all of it (W5). A drag or a Shift-click keeps what the
 * press made. Null: leave the selection as it is.
 */
export function selectionAfterClick(selection: readonly ObjId[], hitId: ObjId, shift: boolean, moved: boolean): ObjId[] | null {
  if (shift || moved) return null
  return selection.length === 1 && selection[0] === hitId ? null : [hitId]
}

// The pointer tips write a power of ten raised ("1.5 × 10¹⁰ u"), as labels do: the formatters'
// "×10^10" is programming syntax (W20).

/** A length with its unit, for a tip. */
export const tipLength = (v: number, s: MeasureSettings): string => superscriptPowers(formatMeasure(v, 'length', s))
/** An angle with its unit, for a tip. */
export const tipAngle = (r: number, s: MeasureSettings): string => superscriptPowers(formatMeasure(r, 'angle', s))
/** A coordinate: a length without its unit. */
export const tipNumber = (v: number, s: MeasureSettings): string => superscriptPowers(fmtPrecise(measureValue(v, 'length', s), s))

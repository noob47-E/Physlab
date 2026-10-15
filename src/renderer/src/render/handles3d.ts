// 3D-3B: the handles of Geometry's 3-D view and the arithmetic behind them. A selected free point has a lift handle (an arrow
// straight up) that drags it up or down; a selected solid has an orange size handle on its base and a cyan height handle on
// top. Measure and Angle pick objects into the selection. Pure: render/Interaction.tsx drags, render/Solid3DViews.tsx draws.

import type { Computed, ObjId, SceneObject } from '../core/types'
import { isFromShape, sizesOf, type SolidShape } from '../math/solidShape'
import type { V3 } from '../math/vec'

export type HandlePart = 'lift' | 'size' | 'height'

interface Handle {
  part: HandlePart
  /** Where the handle is grabbed. */
  at: V3
  /** Where its arrow starts (the lift handle's point), for the drawing. */
  from?: V3
}

/** How far above its point the lift handle sits, on screen. */
const LIFT_PX = 36

const r3 = (v: number) => Math.round(v * 1e9) / 1e9

/** The handles an object shows when it is selected in the 3-D view; `wpp` is the world size of a pixel at the object. */
export function handlesOf(o: SceneObject, c: Computed, wpp: number): Handle[] {
  if (o.locked) return []
  if (o.type === 'point' && o.def.kind === 'free' && c.type === 'point') {
    return [{ part: 'lift', at: [c.p[0], c.p[1], r3(c.p[2] + LIFT_PX * wpp)], from: c.p }]
  }
  if (o.type === 'solid' && c.type === 'solid') {
    const out: Handle[] = isFromShape(o.kind) ? [] : [{ part: 'size', at: c.shape.sizeHandle }]
    if (sizesOf(o.kind).some((s) => s.height)) out.push({ part: 'height', at: c.shape.top })
    return out
  }
  return []
}

/** A size to one decimal, never below 0.1: what a handle writes. */
const tenth = (v: number) => Math.max(0.1, Math.round(v * 10) / 10)

/** The first size after the size handle, `startReach` from the base's centre, is pulled to `reach`: scaled with it. */
export function sizeFromHandle(first: number, startReach: number, reach: number): number {
  if (!(startReach > 0)) return first
  return tenth((first * reach) / startReach)
}

/** The height after the height handle is pulled to `z`, over a base at `baseZ`. */
export function heightFromHandle(baseZ: number, z: number): number {
  return tenth(z - baseZ)
}

/**
 * Measure's and Angle's click: the object joins the selection (two at most, the older one going); one already in it comes
 * out; a click on nothing clears it.
 */
export function measurePicks(selection: readonly ObjId[], hit: ObjId | null): ObjId[] {
  if (hit === null) return []
  if (selection.includes(hit)) return selection.filter((id) => id !== hit)
  const kept = selection.length >= 2 ? selection.slice(-1) : [...selection]
  return [...kept, hit]
}

/** Where a new solid stands: at the origin on an empty floor, else a step to the right of the solids already there. */
export function nextSolidSpot(shapes: readonly SolidShape[], halfWidth = 3): V3 {
  if (!shapes.length) return [0, 0, 0]
  const right = Math.max(...shapes.flatMap((s) => s.vertices.map((v) => v[0])))
  return [Math.ceil(right + 1 + halfWidth), 0, 0]
}

/**
 * The maths behind drawing many 2-D arrows as one batch (S-Q track QA).
 *
 * The 0.6.1 path draws every arrow as its own shaft mesh + head mesh + material + useFrame. The
 * arrow spike (PhysLab-research/parts/spike-arrows.md) measured that at 3.2–4.5 ms of JavaScript
 * per frame and 1005 draw calls for 500 vectors, two to three times over the 1.6 ms bar, while one
 * InstancedMesh of shafts and one of heads drew the same 500 in 0.6–0.8 ms and 7 draw calls. From
 * ARROW_BATCH_MIN arrows on, the 2-D drawing therefore joins them into one batch per render order.
 *
 * Everything that decides where a batched arrow lands lives here, headless, so a test can hold it
 * against `placeArrow` (render/ObjectViews.tsx) matrix for matrix: a batched arrow that sat a
 * pixel away from the one it replaced would jump when a picture crossed the threshold.
 */
import * as THREE from 'three/webgpu'
import { len, type V3 } from '../math/vec'
import { arrowHead, HEAD_PX } from './viewMath'

/**
 * From this many 2-D arrows on screen, they are drawn as one batch. The spike's verdict: below it
 * the per-arrow path costs about 0.4 ms and keeps nothing to gain; above it the per-arrow cost
 * (about 6 µs each) grows past the bar.
 */
export const ARROW_BATCH_MIN = 64

/**
 * Whether an arrow joins the batch. Only 2-D arrows do: the spike measured the flat head only, and
 * the 3-D cone is lit by a standard material whose emissive tint is per material, not per
 * instance. Nothing joins while no batch is mounted to draw it (the Sandbox has none).
 */
export function joinsBatch(arrows2D: number, is3D: boolean, hosted: boolean): boolean {
  return hosted && !is3D && arrows2D >= ARROW_BATCH_MIN
}

/**
 * What an `<Arrow>` draws on this render: `true` a batch entry, `false` its own two meshes, and
 * `null` nothing yet. A 2-D arrow is counted in a layout effect and the counts reach the store
 * together in one flush; `ticket` is the flush that carries this arrow's count (null before it
 * has been counted) and `flushes` how many have landed. Until its own flush lands the arrow cannot
 * know which side of ARROW_BATCH_MIN the picture is on, so it draws nothing rather than build
 * meshes and a material it may throw away a microtask later: a picture of 500 vectors opened,
 * redone or loaded would otherwise build and drop 1000 meshes and 500 materials every time.
 * A 3-D arrow is never batched and never waits.
 */
export function batchDecision(ticket: number | null, flushes: number, arrows2D: number, is3D: boolean, hosted: boolean): boolean | null {
  if (is3D) return false
  if (ticket === null || flushes < ticket) return null
  return joinsBatch(arrows2D, false, hosted)
}

const UP = new THREE.Vector3(0, 1, 0)
// Scratch objects: the batch writes 500 arrows a frame and must not allocate for each.
const tmpDir = new THREE.Vector3()
const tmpQ = new THREE.Quaternion()
const tmpP = new THREE.Vector3()
const tmpS = new THREE.Vector3()
const flat: V3 = [0, 0, 0]

/**
 * `placeArrow`'s 2-D branch, written into two matrices instead of two meshes: the shaft (a unit
 * cylinder along +y) and the flat head (base on its origin, apex at +y). Returns false for an
 * arrow too short to draw, which `placeArrow` hides.
 */
export function arrowMatrices(
  tail: V3,
  comp: V3,
  wpp: number,
  thick: number,
  shaftOut: THREE.Matrix4,
  headOut: THREE.Matrix4,
  headPx = HEAD_PX,
  tipPx = 0
): boolean {
  // The 2-D camera looks straight down z, so the arrow is laid out from its projection, as
  // placeArrow does; `len` rather than Math.hypot so the two paths agree to the last bit.
  flat[0] = comp[0]
  flat[1] = comp[1]
  flat[2] = 0
  const L0 = len(flat)
  if (!(L0 > 1e-9)) return false
  const L = L0 + tipPx * wpp
  tmpDir.set(flat[0] / L0, flat[1] / L0, flat[2] / L0)
  tmpQ.setFromUnitVectors(UP, tmpDir)
  const { headLen, halfWidth, shaftLen } = arrowHead(L, wpp, headPx)
  tmpP.set(tail[0] + tmpDir.x * shaftLen * 0.5, tail[1] + tmpDir.y * shaftLen * 0.5, tail[2] + tmpDir.z * shaftLen * 0.5)
  tmpS.set(thick * wpp, shaftLen, thick * wpp)
  shaftOut.compose(tmpP, tmpQ, tmpS)
  tmpP.set(tail[0] + tmpDir.x * shaftLen, tail[1] + tmpDir.y * shaftLen, tail[2] + tmpDir.z * shaftLen)
  tmpS.set(halfWidth, headLen, 1)
  headOut.compose(tmpP, tmpQ, tmpS)
  return true
}

/** One arrow waiting in the batch: what an `<Arrow>` was given, with its colour already read. */
export interface BatchEntry {
  tail: V3
  comp: V3
  thick: number
  renderOrder: number
  headPx?: number
  tipPx?: number
  /** The colour as the component was given it, so an unchanged colour is not parsed again. */
  css: string
  /** The colour in three.js's working (linear) space, as a material's `color` would hold it. */
  rgb: readonly [number, number, number]
}

/** A colour string read the way `new MeshBasicMaterial({ color })` reads it. */
export function arrowRGB(css: string): [number, number, number] {
  const c = new THREE.Color(css)
  return [c.r, c.g, c.b]
}

/**
 * The instance buffers of one render order's pair of instanced meshes: 16 floats a matrix, 3 a
 * colour. `count` is how many were written this frame; the rest of the capacity is not drawn.
 */
export interface ArrowSlab {
  shaft: Float32Array
  head: Float32Array
  color: Float32Array
  capacity: number
  count: number
}

export function newSlab(capacity: number): ArrowSlab {
  return { shaft: new Float32Array(capacity * 16), head: new Float32Array(capacity * 16), color: new Float32Array(capacity * 3), capacity, count: 0 }
}

/**
 * Room for `need` arrows, in powers of two from ARROW_BATCH_MIN, so a picture that gains arrows
 * one at a time rebuilds its instanced meshes a handful of times, not once per arrow.
 */
export function slabCapacity(need: number): number {
  let cap = ARROW_BATCH_MIN
  while (cap < need) cap *= 2
  return cap
}

/**
 * How many arrows each render order holds. The batch keeps one pair of meshes per render order,
 * so the order the separate meshes were drawn in (component arrows 8, a selection halo 11, the
 * arrows 12, a rubber band 30) is kept exactly: the arrows draw with depth testing off, and
 * the render order is the only thing that says which lies on top.
 */
export function countByOrder(entries: Iterable<BatchEntry>, out: Map<number, number>): Map<number, number> {
  out.clear()
  for (const e of entries) out.set(e.renderOrder, (out.get(e.renderOrder) ?? 0) + 1)
  return out
}

const shaftM = new THREE.Matrix4()
const headM = new THREE.Matrix4()
const mid: V3 = [0, 0, 0]

/**
 * Writes every arrow's two matrices and colour into its render order's slab, in the order given,
 * skipping arrows too short to draw (as placeArrow hides them). `wppAt` is the world size of a
 * pixel at a point, taken at the arrow's midpoint as `<Arrow>` takes it. The caller has made
 * each slab big enough (`countByOrder` + `slabCapacity`); an arrow with no room is left out
 * rather than written past the end. Returns how many arrows were written.
 */
export function writeBatch(entries: Iterable<BatchEntry>, wppAt: (p: V3) => number, slabs: Map<number, ArrowSlab>): number {
  for (const s of slabs.values()) s.count = 0
  let written = 0
  for (const e of entries) {
    const s = slabs.get(e.renderOrder)
    if (!s || s.count >= s.capacity) continue
    mid[0] = e.tail[0] + e.comp[0] * 0.5
    mid[1] = e.tail[1] + e.comp[1] * 0.5
    mid[2] = e.tail[2] + e.comp[2] * 0.5
    if (!arrowMatrices(e.tail, e.comp, wppAt(mid), e.thick, shaftM, headM, e.headPx, e.tipPx)) continue
    const i = s.count
    shaftM.toArray(s.shaft, i * 16)
    headM.toArray(s.head, i * 16)
    s.color[i * 3] = e.rgb[0]
    s.color[i * 3 + 1] = e.rgb[1]
    s.color[i * 3 + 2] = e.rgb[2]
    s.count = i + 1
    written++
  }
  return written
}

/** Draw calls for the arrows: two per arrow drawn separately, two per render order in a batch. */
export function arrowDrawCalls(arrows: number, orders: number, batched: boolean): number {
  return batched ? 2 * Math.min(orders, arrows) : 2 * arrows
}

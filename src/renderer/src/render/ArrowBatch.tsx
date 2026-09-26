/**
 * Many 2-D arrows drawn as one batch (S-Q track QA, the arrow spike's verdict).
 *
 * Each `<Arrow>` used to be two meshes, a material and a useFrame of its own: 500 vectors cost
 * 1005 draw calls and 3.2–4.5 ms of JavaScript a frame on the spike's RTX 3060, and roughly ten
 * times that on a weak laptop. From ARROW_BATCH_MIN 2-D arrows on, an `<Arrow>` instead hands its
 * props to the registry here, and one `<ArrowBatch>` draws them all: one InstancedMesh per render
 * order holding each arrow's shaft and head as two instances (so arrows still paint over each
 * other in the order they would have alone), one shared material with a colour per instance, and
 * ONE useFrame that writes every matrix with `placeArrow`'s own maths (render/arrowBatchMath.ts).
 *
 * Colours stay whatever the caller resolved (VEC's theme tokens); the batch never reads a colour
 * of its own, so a theme switch reaches it as new props like any other arrow. Picking is
 * geometric (render/picking.ts) and never sees these meshes; they still refuse a raycast, so a
 * group that picks by raycasting (the Sandbox's, see AGENTS) could not be misled by them either.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { create } from 'zustand'
import { worldPerPixel } from './cameraUtils'
import { abs, attribute, float, instanceColor, instanceIndex, positionLocal } from 'three/tsl'
import { arrowRGB, batchDecision, countByOrder, newSlab, slabCapacity, writeBatch, type ArrowSlab, type BatchEntry } from './arrowBatchMath'
import type { V3 } from '../math/vec'

interface BatchState {
  /** How many `<ArrowBatch>` hosts are mounted; with none, nothing may join a batch. */
  hosts: number
  /** How many 2-D `<Arrow>`s are mounted, batched or not. */
  arrows2D: number
  /** How many gathered counts have landed; a new arrow waits for the one that carries its own. */
  flushes: number
}

/** Exported for tests; the app reads it only through `useArrowBatched`. */
export const useBatchState = create<BatchState>(() => ({ hosts: 0, arrows2D: 0, flushes: 0 }))
// Dev only: lets a browser check force the per-arrow path (hosts: 0) to time it against the batch.
if (import.meta.env?.DEV && typeof window !== 'undefined') (window as unknown as { __useArrowBatch?: typeof useBatchState }).__useArrowBatch = useBatchState

/** Every batched arrow on screen, in the order its `<Arrow>` first joined. */
const registry = new Map<string, BatchEntry>()

// A picture of 500 vectors mounts 500 arrows in one commit. Counting each with its own setState
// would run every arrow's selector 500 times over; the counts are gathered and applied once, in a
// microtask, which runs after the commit's layout effects and before any frame can be drawn.
let pending = 0
let queued = false
/**
 * Adds `delta` to the 2-D arrow count and returns the number of the flush that will carry it.
 * Exported for tests.
 */
export function count2D(delta: number): number {
  pending += delta
  const ticket = useBatchState.getState().flushes + 1
  if (queued) return ticket
  queued = true
  queueMicrotask(() => {
    queued = false
    const d = pending
    pending = 0
    // Always a new flush, even when the counts cancel out (a StrictMode remount): some arrow is
    // waiting for this ticket.
    useBatchState.setState((s) => ({ arrows2D: s.arrows2D + d, flushes: s.flushes + 1 }))
  })
  return ticket
}

/**
 * Counts this arrow among the 2-D arrows on screen and says whether it should join the batch:
 * `true` batched, `false` its own meshes, `null` not known yet, so draw nothing (see
 * `batchDecision`). A newly mounted 2-D arrow starts at `null` for one microtask, so a big
 * picture goes straight to the batch and never builds mesh arrows first. After that the answer
 * flips for every arrow at once when the count crosses the threshold, and only then: the selector
 * returns the decision, so an arrow added below or above it re-renders nothing else.
 */
export function useArrowBatched(is3D: boolean): boolean | null {
  const ticket = useRef<number | null>(null)
  // A layout effect, not a passive one: the count must be in before the commit ends, so its flush
  // lands before a frame; a passive effect can run after one, leaving the arrow missing from it.
  useLayoutEffect(() => {
    if (is3D) return
    ticket.current = count2D(1)
    return () => {
      ticket.current = null
      count2D(-1)
    }
  }, [is3D])
  return useBatchState((s) => batchDecision(ticket.current, s.flushes, s.arrows2D, is3D, s.hosts > 0))
}

export interface BatchedArrowProps {
  tail: V3
  comp: V3
  color: string
  thick?: number
  renderOrder?: number
  headPx?: number
  tipPx?: number
}

/** An arrow drawn by the batch: it only keeps its entry in the registry up to date. */
export function BatchedArrow({ tail, comp, color, thick = 1.7, renderOrder = 12, headPx, tipPx }: BatchedArrowProps) {
  const id = useId()
  const invalidate = useThree((s) => s.invalidate)
  // Layout effects, so the entry is in place before the frame this commit asked for is drawn.
  useLayoutEffect(() => {
    const was = registry.get(id)
    registry.set(id, { tail, comp, thick, renderOrder, headPx, tipPx, css: color, rgb: was && was.css === color ? was.rgb : arrowRGB(color) })
    invalidate()
  }, [id, tail, comp, color, thick, renderOrder, headPx, tipPx, invalidate])
  useLayoutEffect(
    () => () => {
      registry.delete(id)
      invalidate()
    },
    [id, invalidate]
  )
  return null
}

// The same geometry the per-arrow path draws (render/ObjectViews.tsx) — a unit 14-sided cylinder
// along +y for the shaft, and a flat triangle with its base on the origin and apex at +y — merged
// into one, each vertex marked with its part: 0 the shaft, 1 the head.
//
// Each arrow is two instances of it, its shaft at 2i and its head at 2i + 1, and the material
// folds away the part an instance does not draw (arrowBatchMaterial). One mesh per render order
// therefore paints arrow after arrow, each shaft then its head, exactly as the per-arrow meshes
// did. A mesh of all the shafts and another of all the heads painted every shaft first, so where
// two arrows crossed the earlier arrow's head lay over the later one's shaft, the other way round
// from the per-arrow picture a 64th arrow switches away from.
function arrowPartsGeometry(): THREE.BufferGeometry {
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 14)
  const shaft = cyl.getAttribute('position').array
  const n = shaft.length / 3
  const position = new Float32Array((n + 3) * 3)
  position.set(shaft)
  position.set([-1, 0, 0, 1, 0, 0, 0, 1, 0], n * 3)
  const part = new Float32Array(n + 3).fill(1, n)
  const index = [...(cyl.getIndex()?.array ?? []), n, n + 1, n + 2]
  cyl.dispose()
  return new THREE.BufferGeometry()
    .setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
    .setAttribute('arrowPart', new THREE.Float32BufferAttribute(part, 1))
    .setIndex(index)
}
const partsGeo = arrowPartsGeometry()

/**
 * The batch's one material: white, so each instance's colour comes through unchanged; double-sided
 * for the same reason as the per-arrow material (the quaternion that turns a flat head can flip it
 * over). An instance keeps the vertices of its own part (shaft on even instances, head on odd) and
 * sends the other part's to one point, where its triangles have no area and draw nothing.
 */
export function arrowBatchMaterial(): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({ depthTest: false, depthWrite: false, side: THREE.DoubleSide })
  const drawn = float(instanceIndex).mod(2)
  mat.positionNode = positionLocal.mul(float(1).sub(abs(attribute('arrowPart', 'float').sub(drawn))))
  // A NodeMaterial, unlike MeshBasicMaterial, does not multiply by instanceColor on its own:
  // without this the whole batch would draw in the material's flat (white) colour.
  mat.colorNode = instanceColor
  return mat
}

interface OrderMeshes {
  mesh: THREE.InstancedMesh
  /** Where writeBatch puts each arrow's two matrices and colour, before they are interleaved. */
  slab: ArrowSlab
}

function noRaycast(): void {
  // Deliberately empty: a batch of arrows is never a pick target (see the file comment).
}

function buildOrder(order: number, capacity: number, mat: THREE.Material): OrderMeshes {
  const mesh = new THREE.InstancedMesh(partsGeo, mat, capacity * 2)
  // The colour attribute must exist before the first draw: the WebGPU backend builds a
  // material's program once, and one built without instance colours never gains them.
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2 * 3), 3)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
  mesh.renderOrder = order
  // Instances move every frame; a bounding sphere computed once would cull arrows still on screen.
  mesh.frustumCulled = false
  mesh.raycast = noRaycast
  mesh.userData.arrowBatch = true
  mesh.count = 0
  mesh.visible = false
  return { mesh, slab: newSlab(capacity) }
}

function dropOrder(group: THREE.Group, m: OrderMeshes): void {
  group.remove(m.mesh)
  // The geometry is shared module-wide; only the instance buffers go.
  m.mesh.dispose()
}

/** Copies each arrow's shaft and head into instances 2i and 2i + 1, both in the arrow's colour. */
function interleave(slab: ArrowSlab, mesh: THREE.InstancedMesh): void {
  const matrices = mesh.instanceMatrix.array as Float32Array
  const colours = mesh.instanceColor?.array as Float32Array
  for (let i = 0; i < slab.count; i++) {
    matrices.set(slab.shaft.subarray(i * 16, i * 16 + 16), i * 32)
    matrices.set(slab.head.subarray(i * 16, i * 16 + 16), i * 32 + 16)
    const rgb = slab.color.subarray(i * 3, i * 3 + 3)
    colours.set(rgb, i * 6)
    colours.set(rgb, i * 6 + 3)
  }
}

/** The batch's meshes, rebuilt inside frames and never during render. */
export interface BatchLive {
  orders: Map<number, OrderMeshes>
  slabs: Map<number, ArrowSlab>
  need: Map<number, number>
}

/**
 * One frame of the batch: grows the mesh of each render order to fit, writes every arrow's
 * matrices and colour, and shows only what is in use. Exported for tests, which read back the
 * order the arrows paint in.
 */
export function syncBatch(g: THREE.Group, live: BatchLive, entries: ReadonlyMap<string, BatchEntry>, wppAt: (p: V3) => number, mat: THREE.Material): void {
  const { orders, slabs, need } = live
  countByOrder(entries.values(), need)
  for (const [order, n] of need) {
    const have = orders.get(order)
    if (have && have.slab.capacity >= n) continue
    if (have) dropOrder(g, have)
    const built = buildOrder(order, slabCapacity(n), mat)
    orders.set(order, built)
    slabs.set(order, built.slab)
    g.add(built.mesh)
  }
  writeBatch(entries.values(), wppAt, slabs)
  for (const { mesh, slab } of orders.values()) {
    const n = slab.count
    mesh.count = 2 * n
    mesh.visible = n > 0
    if (n === 0) continue
    interleave(slab, mesh)
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }
}

/** Draws every batched arrow. Mounted once beside the scene's objects (render/Viewport.tsx). */
export function ArrowBatch() {
  const group = useRef<THREE.Group>(null)
  const mat = useMemo(arrowBatchMaterial, [])
  // Rebuilt inside frames, never during render, so they live in a ref.
  const live = useRef<BatchLive>({ orders: new Map(), slabs: new Map(), need: new Map() })

  useEffect(() => {
    useBatchState.setState((s) => ({ hosts: s.hosts + 1 }))
    const g = group.current
    const { orders, slabs } = live.current
    return () => {
      useBatchState.setState((s) => ({ hosts: s.hosts - 1 }))
      for (const m of orders.values()) if (g) dropOrder(g, m)
      orders.clear()
      slabs.clear()
      mat.dispose()
    }
  }, [mat])

  useFrame(({ camera, size }) => {
    const g = group.current
    if (!g) return
    syncBatch(g, live.current, registry, (p) => worldPerPixel(camera, size, p), mat)
  })

  return <group ref={group} />
}

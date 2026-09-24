/**
 * Many 2-D arrows drawn as one batch (S-Q track QA, the arrow spike's verdict).
 *
 * Each `<Arrow>` used to be two meshes, a material and a useFrame of its own: 500 vectors cost
 * 1005 draw calls and 3.2–4.5 ms of JavaScript a frame on the spike's RTX 3060, and roughly ten
 * times that on a weak laptop. From ARROW_BATCH_MIN 2-D arrows on, an `<Arrow>` instead hands its
 * props to the registry here, and one `<ArrowBatch>` draws them all: one InstancedMesh of shafts
 * and one of heads per render order, one shared material with a colour per instance, and ONE
 * useFrame that writes every matrix with `placeArrow`'s own maths (render/arrowBatchMath.ts).
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
import { arrowRGB, batchDecision, countByOrder, slabCapacity, writeBatch, type ArrowSlab, type BatchEntry } from './arrowBatchMath'
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

// The same geometry the per-arrow path draws (render/ObjectViews.tsx): a unit 14-sided cylinder
// along +y for the shaft, and a flat triangle with its base on the origin and apex at +y.
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 14)
const flatHeadGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 0, 1, 0], 3))

interface OrderMeshes {
  shaft: THREE.InstancedMesh
  head: THREE.InstancedMesh
  slab: ArrowSlab
}

function noRaycast(): void {
  // Deliberately empty: a batch of arrows is never a pick target (see the file comment).
}

function buildOrder(order: number, capacity: number, mat: THREE.Material): OrderMeshes {
  const shaft = new THREE.InstancedMesh(cylGeo, mat, capacity)
  const head = new THREE.InstancedMesh(flatHeadGeo, mat, capacity)
  const color = new Float32Array(capacity * 3)
  for (const m of [shaft, head]) {
    // The colour attribute must exist before the first draw: the WebGPU backend builds a
    // material's program once, and one built without instance colours never gains them.
    m.instanceColor = new THREE.InstancedBufferAttribute(color, 3)
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    m.instanceColor.setUsage(THREE.DynamicDrawUsage)
    m.renderOrder = order
    // Instances move every frame; a bounding sphere computed once would cull arrows still on screen.
    m.frustumCulled = false
    m.raycast = noRaycast
    m.userData.arrowBatch = true
    m.count = 0
    m.visible = false
  }
  return { shaft, head, slab: { shaft: shaft.instanceMatrix.array as Float32Array, head: head.instanceMatrix.array as Float32Array, color, capacity, count: 0 } }
}

function dropOrder(group: THREE.Group, m: OrderMeshes): void {
  group.remove(m.shaft, m.head)
  // The geometries are shared module-wide; only the instance buffers go.
  m.shaft.dispose()
  m.head.dispose()
}

/** Draws every batched arrow. Mounted once beside the scene's objects (render/Viewport.tsx). */
export function ArrowBatch() {
  const group = useRef<THREE.Group>(null)
  // White, so each instance's colour comes through unchanged; double-sided for the same reason as
  // the per-arrow material: the quaternion that turns a flat head can flip it over.
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false, side: THREE.DoubleSide }), [])
  // Rebuilt inside frames, never during render, so they live in a ref.
  const live = useRef({ orders: new Map<number, OrderMeshes>(), slabs: new Map<number, ArrowSlab>(), need: new Map<number, number>() })

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
    const { orders, slabs, need } = live.current
    countByOrder(registry.values(), need)
    for (const [order, n] of need) {
      const have = orders.get(order)
      if (have && have.slab.capacity >= n) continue
      if (have) dropOrder(g, have)
      const built = buildOrder(order, slabCapacity(n), mat)
      orders.set(order, built)
      slabs.set(order, built.slab)
      g.add(built.shaft, built.head)
    }
    writeBatch(registry.values(), (p) => worldPerPixel(camera, size, p), slabs)
    for (const m of orders.values()) {
      const n = m.slab.count
      m.shaft.count = m.head.count = n
      m.shaft.visible = m.head.visible = n > 0
      if (n === 0) continue
      m.shaft.instanceMatrix.needsUpdate = true
      m.head.instanceMatrix.needsUpdate = true
      // Both meshes share one colour array, but each attribute uploads its own copy.
      if (m.shaft.instanceColor) m.shaft.instanceColor.needsUpdate = true
      if (m.head.instanceColor) m.head.instanceColor.needsUpdate = true
    }
  })

  return <group ref={group} />
}

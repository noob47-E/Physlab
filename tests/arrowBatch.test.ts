/**
 * The batched arrow path (render/arrowBatchMath.ts) against the per-arrow path it replaces from
 * 64 arrows on (render/ObjectViews.tsx `placeArrow`): the same matrices for the same arrow, so a
 * picture that crosses the threshold does not move by a pixel, and the head keeps its 12 px at
 * every zoom. S-Q track QA; the threshold and the paths are the arrow spike's verdict.
 */
import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Arrow, placeArrow } from '../src/renderer/src/render/ObjectViews'
import { count2D, useBatchState } from '../src/renderer/src/render/ArrowBatch'
import {
  ARROW_BATCH_MIN,
  arrowMatrices,
  arrowRGB,
  batchDecision,
  countByOrder,
  joinsBatch,
  newSlab,
  slabCapacity,
  writeBatch,
  type ArrowSlab,
  type BatchEntry
} from '../src/renderer/src/render/arrowBatchMath'
import { toScreen, worldPerPixel } from '../src/renderer/src/render/cameraUtils'
import { HALO_TIP_PX, HEAD_HALF_ANGLE_DEG, HEAD_PX } from '../src/renderer/src/render/viewMath'
import { RESULT_HEAD_GAP_PX } from '../src/renderer/src/render/colourMix'
import type { V3 } from '../src/renderer/src/math/vec'

const SIZE = { width: 1280, height: 800 }

/** The 2-D view's camera: orthographic, looking straight down z, at a given zoom. */
function camera2D(zoom: number, cx = 0, cy = 0): THREE.OrthographicCamera {
  const c = new THREE.OrthographicCamera(-SIZE.width / 2, SIZE.width / 2, SIZE.height / 2, -SIZE.height / 2, 0.1, 1000)
  c.zoom = zoom
  c.position.set(cx, cy, 100)
  c.lookAt(cx, cy, 0)
  c.updateProjectionMatrix()
  c.updateMatrixWorld(true)
  return c
}

/** A seeded generator, so a failure names the same arrow on every run. */
function rng(seed: number): () => number {
  let s = seed
  return () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
}

interface Case {
  tail: V3
  comp: V3
  thick: number
  headPx?: number
  tipPx: number
}

/** 50 random arrows in the variants the app draws: arrow, halo, component arrows, second head. */
function randomArrows(n: number): Case[] {
  const r = rng(20260924)
  const thicks = [1.2, 1.4, 1.7, 2.1, 2.4, 3.9, 4.6]
  const heads = [undefined, 10, HEAD_PX, 15]
  const tips = [0, 0, HALO_TIP_PX, -RESULT_HEAD_GAP_PX]
  return Array.from({ length: n }, () => {
    const ang = r() * Math.PI * 2
    const L = 0.05 + r() * 40
    return {
      tail: [(r() - 0.5) * 60, (r() - 0.5) * 60, r() < 0.2 ? (r() - 0.5) * 4 : 0] as V3,
      // Some carry a z part: the 2-D path lays them out from their projection.
      comp: [L * Math.cos(ang), L * Math.sin(ang), r() < 0.2 ? (r() - 0.5) * 10 : 0] as V3,
      thick: thicks[Math.floor(r() * thicks.length)],
      headPx: heads[Math.floor(r() * heads.length)],
      tipPx: tips[Math.floor(r() * tips.length)]
    }
  })
}

const midOf = (a: Case): V3 => [a.tail[0] + a.comp[0] * 0.5, a.tail[1] + a.comp[1] * 0.5, a.tail[2] + a.comp[2] * 0.5]

/** What the per-arrow path makes of an arrow: its two meshes' matrices after placeArrow. */
function meshPath(a: Case, wpp: number): { shaft: THREE.Matrix4; head: THREE.Matrix4; visible: boolean } {
  const geo = new THREE.BufferGeometry()
  const shaft = new THREE.Mesh(geo)
  const head = new THREE.Mesh(geo)
  placeArrow(shaft, head, a.tail, a.comp, wpp, a.thick, false, a.headPx, undefined, a.tipPx)
  shaft.updateMatrix()
  head.updateMatrix()
  return { shaft: shaft.matrix, head: head.matrix, visible: shaft.visible && head.visible }
}

const ZOOMS = [0.1, 1, 37.5, 400, 5000]

describe('batched arrows are placed exactly where placeArrow puts them', () => {
  it('gives the same shaft and head matrices for 50 random arrows at five zooms', () => {
    const arrows = randomArrows(50)
    let compared = 0
    for (const zoom of ZOOMS) {
      const cam = camera2D(zoom)
      for (const a of arrows) {
        const wpp = worldPerPixel(cam, SIZE, midOf(a))
        const want = meshPath(a, wpp)
        const shaft = new THREE.Matrix4()
        const head = new THREE.Matrix4()
        const drawn = arrowMatrices(a.tail, a.comp, wpp, a.thick, shaft, head, a.headPx ?? HEAD_PX, a.tipPx)
        expect(drawn).toBe(want.visible)
        // The same operations in the same order: equal to the last bit, not merely close.
        expect(shaft.elements).toEqual(want.shaft.elements)
        expect(head.elements).toEqual(want.head.elements)
        compared++
      }
    }
    expect(compared).toBe(250)
  })

  it('writes those matrices and each arrow its colour into the instance buffers, in order', () => {
    const arrows = randomArrows(50)
    const cam = camera2D(37.5)
    const colours = ['#2f6fdf', '#d9480f', 'rgb(43, 138, 62)']
    const entries: BatchEntry[] = arrows.map((a, i) => ({ ...a, renderOrder: 12, css: colours[i % 3], rgb: arrowRGB(colours[i % 3]) }))
    const slab = newSlab(slabCapacity(entries.length))
    const written = writeBatch(entries, (p) => worldPerPixel(cam, SIZE, p), new Map([[12, slab]]))
    expect(written).toBe(50)
    expect(slab.count).toBe(50)
    arrows.forEach((a, i) => {
      const want = meshPath(a, worldPerPixel(cam, SIZE, midOf(a)))
      // The GPU buffer holds 32-bit floats; the mesh's matrix rounds to the same ones on upload.
      expect(Array.from(slab.shaft.subarray(i * 16, i * 16 + 16))).toEqual(want.shaft.elements.map(Math.fround))
      expect(Array.from(slab.head.subarray(i * 16, i * 16 + 16))).toEqual(want.head.elements.map(Math.fround))
      // The colour a MeshBasicMaterial given the same string would hold.
      const m = new THREE.MeshBasicMaterial({ color: colours[i % 3] })
      expect(Array.from(slab.color.subarray(i * 3, i * 3 + 3))).toEqual([m.color.r, m.color.g, m.color.b].map(Math.fround))
    })
  })

  it('leaves out an arrow too short to draw, as placeArrow hides it, and keeps the rest in order', () => {
    const cam = camera2D(1)
    const e = (x: number, len: number): BatchEntry => ({ tail: [x, 0, 0], comp: [len, 0, 0], thick: 1.7, renderOrder: 12, css: '#000000', rgb: [0, 0, 0] })
    // A vector straight into the screen has no 2-D length at all.
    const into: BatchEntry = { ...e(5, 0), comp: [0, 0, 3] }
    expect(meshPath({ tail: into.tail, comp: into.comp, thick: 1.7, tipPx: 0 }, 1).visible).toBe(false)
    const slab = newSlab(64)
    const written = writeBatch([e(0, 10), e(1, 0), into, e(2, 20)], (p) => worldPerPixel(cam, SIZE, p), new Map([[12, slab]]))
    expect(written).toBe(2)
    // The second written arrow is the one with its tail at x = 2 (translation lives in 12..14).
    const shaftX = slab.shaft[16 + 12]
    expect(shaftX).toBeCloseTo(2 + (20 - arrowHeadLen(20, worldPerPixel(cam, SIZE, [12, 0, 0]))) / 2, 4)
  })
})

function arrowHeadLen(L: number, wpp: number): number {
  return Math.min(HEAD_PX * wpp, L * 0.45)
}

describe('the head keeps its size on screen', () => {
  // Pixel positions of the head's base centre, apex and base corners after its matrix.
  function headOnScreen(cam: THREE.OrthographicCamera, head: THREE.Matrix4) {
    const at = (x: number, y: number) => {
      const p = new THREE.Vector3(x, y, 0).applyMatrix4(head)
      return toScreen(cam, SIZE, [p.x, p.y, p.z])
    }
    return { base: at(0, 0), apex: at(0, 1), left: at(-1, 0), right: at(1, 0) }
  }

  it('is 12 px long and 2·12·tan 25° px wide at five zooms, batched or not', () => {
    for (const zoom of ZOOMS) {
      const cam = camera2D(zoom, 3, -2)
      const wpp = worldPerPixel(cam, SIZE, [3, -2, 0])
      // 200 px long and at 30°, so the head is never cut short by a short arrow.
      const L = 200 * wpp
      const a: Case = { tail: [3 - L / 4, -2, 0], comp: [L * Math.cos(Math.PI / 6), L * Math.sin(Math.PI / 6), 0], thick: 1.7, tipPx: 0 }
      const shaft = new THREE.Matrix4()
      const head = new THREE.Matrix4()
      expect(arrowMatrices(a.tail, a.comp, worldPerPixel(cam, SIZE, midOf(a)), a.thick, shaft, head)).toBe(true)
      for (const m of [head, meshPath(a, worldPerPixel(cam, SIZE, midOf(a))).head]) {
        const h = headOnScreen(cam, m)
        const long = Math.hypot(h.apex.x - h.base.x, h.apex.y - h.base.y)
        const wide = Math.hypot(h.right.x - h.left.x, h.right.y - h.left.y)
        expect(long).toBeCloseTo(12, 6)
        expect(wide).toBeCloseTo(2 * 12 * Math.tan((HEAD_HALF_ANGLE_DEG * Math.PI) / 180), 6)
      }
      // And the whole arrow is still the 200 px it was given: shaft + head reach the tip.
      const h = headOnScreen(cam, head)
      const tail = toScreen(cam, SIZE, a.tail)
      expect(Math.hypot(h.apex.x - tail.x, h.apex.y - tail.y)).toBeCloseTo(200, 6)
    }
  })

  it('gives way on a short arrow the same as the per-arrow path (0.45 of its length)', () => {
    const cam = camera2D(1)
    const wpp = worldPerPixel(cam, SIZE, [0, 0, 0])
    const a: Case = { tail: [0, 0, 0], comp: [10 * wpp, 0, 0], thick: 1.7, tipPx: 0 }
    const shaft = new THREE.Matrix4()
    const head = new THREE.Matrix4()
    arrowMatrices(a.tail, a.comp, wpp, a.thick, shaft, head)
    const h = headOnScreen(cam, head)
    expect(Math.hypot(h.apex.x - h.base.x, h.apex.y - h.base.y)).toBeCloseTo(4.5, 6)
    expect(head.elements).toEqual(meshPath(a, wpp).head.elements)
  })
})

describe('when arrows join the batch', () => {
  it('joins from 64 two-dimensional arrows on, never in 3-D, never with nothing to draw them', () => {
    expect(ARROW_BATCH_MIN).toBe(64)
    expect(joinsBatch(63, false, true)).toBe(false)
    expect(joinsBatch(64, false, true)).toBe(true)
    expect(joinsBatch(500, false, true)).toBe(true)
    expect(joinsBatch(500, true, true)).toBe(false)
    expect(joinsBatch(500, false, false)).toBe(false)
  })

  it('keeps one buffer pair per render order, so halo, components and arrows stack as before', () => {
    const cam = camera2D(1)
    const e = (order: number): BatchEntry => ({ tail: [0, 0, 0], comp: [50, 0, 0], thick: 1.7, renderOrder: order, css: '#000000', rgb: [0, 0, 0] })
    const entries = [e(12), e(11), e(12), e(8), e(8), e(12)]
    expect([...countByOrder(entries, new Map())]).toEqual([
      [12, 3],
      [11, 1],
      [8, 2]
    ])
    const slabs = new Map<number, ArrowSlab>([
      [8, newSlab(64)],
      [11, newSlab(64)],
      [12, newSlab(64)]
    ])
    writeBatch(entries, (p) => worldPerPixel(cam, SIZE, p), slabs)
    expect([slabs.get(8)?.count, slabs.get(11)?.count, slabs.get(12)?.count]).toEqual([2, 1, 3])
    // A second frame with fewer arrows starts each slab again from nothing.
    writeBatch([e(12)], (p) => worldPerPixel(cam, SIZE, p), slabs)
    expect([slabs.get(8)?.count, slabs.get(11)?.count, slabs.get(12)?.count]).toEqual([0, 0, 1])
  })

  it('grows its buffers in powers of two and never writes past their end', () => {
    expect(slabCapacity(1)).toBe(64)
    expect(slabCapacity(64)).toBe(64)
    expect(slabCapacity(65)).toBe(128)
    expect(slabCapacity(500)).toBe(512)
    expect(slabCapacity(2000)).toBe(2048)
    const cam = camera2D(1)
    const entries = Array.from({ length: 70 }, (_, i): BatchEntry => ({ tail: [i, 0, 0], comp: [0, 5, 0], thick: 1.7, renderOrder: 12, css: '#000000', rgb: [0, 0, 0] }))
    const slab = newSlab(64)
    expect(writeBatch(entries, (p) => worldPerPixel(cam, SIZE, p), new Map([[12, slab]]))).toBe(64)
    expect(slab.shaft.length).toBe(64 * 16)
  })
})

describe('a big picture goes straight to the batch', () => {
  const V = (i: number): V3 => [i * 0.1, 0, 0]

  it('decides nothing for a 2-D arrow until the flush carrying its count lands; a 3-D arrow never waits', () => {
    expect(batchDecision(null, 0, 500, false, true)).toBeNull()
    expect(batchDecision(3, 2, 500, false, true)).toBeNull()
    expect(batchDecision(3, 3, 500, false, true)).toBe(true)
    expect(batchDecision(3, 4, 63, false, true)).toBe(false)
    expect(batchDecision(3, 3, 500, false, false)).toBe(false)
    expect(batchDecision(null, 0, 500, true, true)).toBe(false)
  })

  it('mounts 500 new 2-D arrows without building a single mesh arrow or batch entry on the first render', () => {
    // Outside a Canvas, both MeshArrow (useFrame) and BatchedArrow (useThree) throw; so a first
    // render that picked either for any of the 500 would fail here. The 3-D arrow shows it would.
    const arrows = Array.from({ length: 500 }, (_, i) => createElement(Arrow, { key: i, tail: V(i), comp: [1, 1, 0], color: '#2f6fdf', is3D: false }))
    expect(renderToStaticMarkup(createElement('group', null, arrows))).toBe('<group></group>')
    expect(() => renderToStaticMarkup(createElement(Arrow, { tail: V(0), comp: [1, 1, 0], color: '#2f6fdf', is3D: true }))).toThrow()
  })

  it('sends all 500 to the batch as soon as their counts land, and a picture of 3 to its own meshes', async () => {
    useBatchState.setState({ hosts: 1, arrows2D: 0 })
    try {
      const decide = (t: number) => {
        const s = useBatchState.getState()
        return batchDecision(t, s.flushes, s.arrows2D, false, s.hosts > 0)
      }
      // Every arrow's layout effect in one commit, then the one flush.
      const tickets = Array.from({ length: 500 }, () => count2D(1))
      expect(new Set(tickets).size).toBe(1)
      expect(tickets.map(decide).every((d) => d === null)).toBe(true)
      await Promise.resolve()
      expect(useBatchState.getState().arrows2D).toBe(500)
      const after = tickets.map(decide)
      expect(after.filter((d) => d === false)).toHaveLength(0)
      expect(after.every((d) => d === true)).toBe(true)
      // The picture closes; a small one opens.
      for (let i = 0; i < 500; i++) count2D(-1)
      const small = [count2D(1), count2D(1), count2D(1)]
      await Promise.resolve()
      expect(useBatchState.getState().arrows2D).toBe(3)
      expect(small.map(decide)).toEqual([false, false, false])
      // A StrictMode remount counts, uncounts and counts again in one tick: still one arrow, and
      // its flush still lands although the counts in it cancel.
      const t = count2D(1)
      count2D(-1)
      const t2 = count2D(1)
      expect(t2).toBe(t)
      await Promise.resolve()
      expect(useBatchState.getState().arrows2D).toBe(4)
      expect(decide(t2)).toBe(false)
      for (let i = 0; i < 4; i++) count2D(-1)
      await Promise.resolve()
      expect(useBatchState.getState().arrows2D).toBe(0)
    } finally {
      useBatchState.setState({ hosts: 0, arrows2D: 0 })
    }
  })
})

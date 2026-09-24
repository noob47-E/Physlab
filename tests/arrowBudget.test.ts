/**
 * Speed budget for 500 arrows, pinned from the arrow spike (PhysLab-research/parts/spike-arrows.md,
 * 09/spikes/arrows/results.json) for Wave 8's speed-budget pass. The spike measured, on the owner's
 * RTX 3060 in the web build, the JavaScript time of a whole frame with 500 vectors: the per-arrow
 * path 3.21–4.48 ms and 1005 draw calls, the instanced batch 0.60–0.79 ms and 7 draw calls, against a
 * bar of 1.6 ms. The renderer cannot run here, so this file pins what can be measured headless: the
 * batch's own per-frame work for 500 arrows, and the draw calls it leaves the renderer.
 */
import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import { ARROW_BATCH_MIN, arrowDrawCalls, arrowRGB, countByOrder, newSlab, slabCapacity, writeBatch, type ArrowSlab, type BatchEntry } from '../src/renderer/src/render/arrowBatchMath'
import { worldPerPixel } from '../src/renderer/src/render/cameraUtils'
import type { V3 } from '../src/renderer/src/math/vec'

/** The spike's numbers (median JS ms per frame, draw calls) at 500 vectors. */
const SPIKE_500 = {
  bar: 1.6,
  mesh: { bestMs: 3.21, calls: 1005 },
  instanced: { worstMs: 0.79, calls: 7 },
  baselineCalls: 5
}

const SIZE = { width: 1280, height: 800 }

function camera(): THREE.OrthographicCamera {
  const c = new THREE.OrthographicCamera(-640, 640, 400, -400, 0.1, 1000)
  c.zoom = 37.5
  c.position.set(0, 0, 100)
  c.updateProjectionMatrix()
  return c
}

/** The spike's scene: 500 seeded random vectors spread over the view, six colours. */
function scene500(): BatchEntry[] {
  let s = 12345
  const r = () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
  const colours = ['#2f6fdf', '#d9480f', '#2b8a3e', '#9c36b5', '#c2255c', '#0b7285'].map((c) => ({ css: c, rgb: arrowRGB(c) }))
  return Array.from({ length: 500 }, (_, i) => {
    const ang = r() * Math.PI * 2
    const L = 21 * (0.03 + r() * 0.12)
    const tail: V3 = [(r() - 0.5) * 30, (r() - 0.5) * 18, 0]
    return { tail, comp: [L * Math.cos(ang), L * Math.sin(ang), 0], thick: 1.7, renderOrder: 12, ...colours[i % 6] }
  })
}

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

describe('500 arrows stay inside the spike budget', () => {
  it('are batched: 500 is past the threshold, and the whole picture is one render order', () => {
    const entries = scene500()
    expect(entries.length).toBeGreaterThanOrEqual(ARROW_BATCH_MIN)
    expect([...countByOrder(entries, new Map())]).toEqual([[12, 500]])
    expect(slabCapacity(500)).toBe(512)
  })

  it('leave the renderer 2 draw calls instead of 1000 (the spike: 7 in all against 1005)', () => {
    const batched = arrowDrawCalls(500, 1, true)
    const separate = arrowDrawCalls(500, 1, false)
    expect(batched).toBe(2)
    expect(separate).toBe(1000)
    // The spike's counts are these plus the 5 calls of the drawing with no arrows at all.
    expect(batched + SPIKE_500.baselineCalls).toBe(SPIKE_500.instanced.calls)
    expect(separate + SPIKE_500.baselineCalls).toBe(SPIKE_500.mesh.calls)
  })

  it('cost the batch well under the spike’s whole-frame time to place, headless', () => {
    const entries = scene500()
    const cam = camera()
    const slabs = new Map<number, ArrowSlab>([[12, newSlab(slabCapacity(500))]])
    const wppAt = (p: V3) => worldPerPixel(cam, SIZE, p)
    for (let i = 0; i < 30; i++) writeBatch(entries, wppAt, slabs)
    const times: number[] = []
    for (let i = 0; i < 60; i++) {
      const t = performance.now()
      writeBatch(entries, wppAt, slabs)
      times.push(performance.now() - t)
    }
    expect(slabs.get(12)?.count).toBe(500)
    // The spike's worst instanced frame (0.79 ms) included drawing the grid and axes and the
    // render call itself; placing the 500 arrows is only part of it. Half of it is the budget
    // here, which still holds on a PC shared with other test runs; a regression back to
    // per-arrow allocation or per-arrow parsing would blow through it.
    const ms = median(times)
    expect(ms).toBeLessThan(SPIKE_500.instanced.worstMs / 2)
    expect(ms).toBeLessThan(SPIKE_500.bar)
  })
})

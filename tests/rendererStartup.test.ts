import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// react-three-fiber configures again on every render of its Canvas, and it asks for the renderer
// each time, so a canvas that re-renders while the WebGPU adapter is still being awaited used to
// get several whole renderers on one canvas. The one that finished last made R3F put a fresh
// stand-in perspective camera (zoom 1) over the 2-D view's orthographic one: about half of the
// first launches on a discrete GPU showed no grid, no axes and no numbers until 2-D -> 3-D -> 2-D.
// Only the pure part is testable without a GPU, so the three.js renderer is a stand-in that counts
// how many were built.

const built = vi.hoisted(() => ({ renderers: 0, initMs: [] as number[] }))

vi.mock('three/webgpu', () => {
  class WebGPURenderer {
    backend = { isWebGPUBackend: true }
    constructor() {
      built.renderers++
    }
    init(): Promise<void> {
      // The real init takes a few hundred milliseconds; later calls finish later.
      return new Promise((done) => setTimeout(done, built.initMs.shift() ?? 5))
    }
  }
  return { WebGPURenderer }
})
vi.mock('@react-three/fiber', () => ({ extend: () => undefined }))

async function load(): Promise<typeof import('../src/renderer/src/render/renderer')> {
  return import('../src/renderer/src/render/renderer')
}

const props = (canvas: object) => ({ canvas }) as never

beforeEach(() => {
  built.renderers = 0
  built.initMs = []
  vi.stubGlobal('location', { search: '' })
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('createRenderer: one renderer per canvas', () => {
  it('builds one renderer when configure() asks again while the first is still starting', async () => {
    const { createRenderer } = await load()
    const canvas = {}
    // A (dock settles the canvas size), B (the quality tier arrives and re-renders the viewport) and
    // C all ask before any of them has finished.
    built.initMs = [30, 5, 5]
    const asked = [createRenderer(props(canvas)), createRenderer(props(canvas)), createRenderer(props(canvas))]
    const got = await Promise.all(asked)
    expect(built.renderers).toBe(1)
    expect(got[1]).toBe(got[0])
    expect(got[2]).toBe(got[0])
  })

  it('hands the same renderer back to a later ask on the same canvas', async () => {
    const { createRenderer } = await load()
    const canvas = {}
    const first = await createRenderer(props(canvas))
    const later = await createRenderer(props(canvas))
    expect(later).toBe(first)
    expect(built.renderers).toBe(1)
  })

  it('still gives a different canvas its own renderer', async () => {
    const { createRenderer } = await load()
    const a = await createRenderer(props({}))
    const b = await createRenderer(props({}))
    expect(b).not.toBe(a)
    expect(built.renderers).toBe(2)
  })

  it('reports the quality tier once, not once per ask', async () => {
    const { createRenderer, useGpuInfo } = await load()
    let changes = 0
    const stop = useGpuInfo.subscribe(() => changes++)
    const canvas = {}
    await Promise.all([createRenderer(props(canvas)), createRenderer(props(canvas)), createRenderer(props(canvas))])
    stop()
    expect(changes).toBe(1)
    expect(useGpuInfo.getState().backend).toBe('WebGPU')
  })
})

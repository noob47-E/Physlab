// W12: exporting at scale 2 drew the frame at the screen's own size and stretched it, so lines
// came out soft. W13: with another tab (the Maths screen) in front, the canvas has no size and
// the export saved an empty file without a word. The renderer, the page and the canvases are
// stand-ins: vitest has no DOM, and what matters is what exportPng asks of them.

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

type Mod = typeof import('../src/renderer/src/render/exportImage')
let mod: Mod

/** The 2-D canvas the export paints into; it remembers the size of every image drawn onto it. */
function fakeOut() {
  const drawn: { srcWidth: number; srcHeight: number; w: number; h: number }[] = []
  const out = {
    width: 0,
    height: 0,
    drawn,
    getContext: () => ({
      fillRect() {},
      drawImage(src: { width: number; height: number }, _x: number, _y: number, w: number, h: number) {
        drawn.push({ srcWidth: src.width, srcHeight: src.height, w, h })
      }
    }),
    toDataURL: () => (out.width && out.height ? 'data:image/png;base64,AAAA' : 'data:,')
  }
  return out
}

let outs: ReturnType<typeof fakeOut>[] = []
const alerts: string[] = []

beforeAll(async () => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('alert', (m: string) => alerts.push(m))
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }))
  vi.stubGlobal('document', {
    documentElement: { dataset: {}, style: {} },
    createElement: () => {
      const o = fakeOut()
      outs.push(o)
      return o
    }
  })
  mod = await import('../src/renderer/src/render/exportImage')
})

beforeEach(() => {
  outs = []
  alerts.length = 0
})

/** A renderer whose canvas is shown at `cssW` × `cssH` with device pixel ratio `dpr`, as React Three Fiber sizes it. */
function fakeRenderer(cssW: number, cssH: number, dpr: number) {
  const canvas = { clientWidth: cssW, clientHeight: cssH, width: Math.floor(cssW * dpr), height: Math.floor(cssH * dpr) }
  let ratio = dpr
  const frames: { width: number; height: number }[] = []
  const gl = {
    domElement: canvas,
    getPixelRatio: () => ratio,
    setPixelRatio(r: number) {
      ratio = r
      canvas.width = Math.floor(cssW * r)
      canvas.height = Math.floor(cssH * r)
    },
    renderAsync: async () => {
      frames.push({ width: canvas.width, height: canvas.height })
    }
  }
  mod.setExportContext({ gl, scene: {}, camera: {} } as unknown as Parameters<Mod['setExportContext']>[0])
  return { canvas, frames, ratio: () => ratio }
}

describe('export at scale 2 is drawn at twice the size, not stretched (W12)', () => {
  it('at device pixel ratio 1 the renderer draws a frame twice the client size before it is copied', async () => {
    const r = fakeRenderer(600, 400, 1)
    const url = await mod.exportPng(2)
    expect(url).toMatch(/^data:image\/png;base64,/)
    const out = outs[0]
    expect([out.width, out.height]).toEqual([1200, 800])
    // The copied image is exactly as big as it is drawn: no stretch.
    expect(out.drawn[0]).toEqual({ srcWidth: 1200, srcHeight: 800, w: 1200, h: 800 })
    expect(r.frames.some((f) => f.width === 1200 && f.height === 800)).toBe(true)
    // The screen goes back to its own pixel ratio afterwards.
    expect(r.ratio()).toBe(1)
  })

  it('the target size comes from the CSS size and the scale, never from the backing size', () => {
    expect(mod.exportPlan(600, 400, 2)).toMatchObject({ width: 1200, height: 800 })
    expect(mod.exportPlan(601, 333, 1.5)).toMatchObject({ width: 902, height: 500 })
  })
})

describe('export with the drawing hidden says so instead of saving an empty file (W13)', () => {
  it('a canvas with no size gives a plain-English refusal, not a size', () => {
    const plan = mod.exportPlan(0, 0, 2)
    expect(plan).toHaveProperty('refusal')
    expect((plan as { refusal: string }).refusal).toMatch(/Viewport tab/)
  })

  it('exportPng with a 0 × 0 canvas returns null, never "data:,"', async () => {
    fakeRenderer(0, 0, 1)
    expect(await mod.exportPng(2)).toBeNull()
  })

  it('saveViewportImage tells the student why and saves nothing', async () => {
    fakeRenderer(0, 0, 1)
    const saved: string[] = []
    ;(window as unknown as { physlab: unknown }).physlab = { saveImage: async (u: string) => (saved.push(u), 'saved') }
    expect(await mod.saveViewportImage(2)).toBeNull()
    expect(saved).toEqual([])
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatch(/Viewport tab/)
  })

  it('says the same when the Viewport has never been shown since the app started (no renderer yet)', async () => {
    // The drawing's renderer is only made once its tab has a size; starting in a mode with the
    // Maths screen in front, export used to do nothing and say nothing.
    mod.setExportContext(null)
    const saved: string[] = []
    ;(window as unknown as { physlab: unknown }).physlab = { saveImage: async (u: string) => (saved.push(u), 'saved') }
    expect(await mod.saveViewportImage(2)).toBeNull()
    expect(saved).toEqual([])
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatch(/Viewport tab/)
  })
})

// Save the drawing as a PNG: the 3D canvas plus the HTML labels drawn on top.

import type * as THREE from 'three/webgpu'
import { overlay } from './overlay'
import { themeColor } from '../app/theme'
import { PANEL_TITLES } from '../app/panels'

interface Ctx {
  gl: THREE.WebGPURenderer
  scene: THREE.Scene
  camera: THREE.Camera
}

let ctx: Ctx | null = null

/** The viewport registers its renderer here (see ExportHook in Viewport). */
export function setExportContext(c: Ctx | null): void {
  ctx = c
  if (import.meta.env?.DEV) (window as unknown as { __physlabCtx?: Ctx | null }).__physlabCtx = c
}
export const canExport = () => !!ctx

/** Position of one overlay element inside the viewport, read from its transform. */
function elementBox(el: HTMLElement): { x: number; y: number } | null {
  const host = overlay.canvasHost
  if (!host) return null
  const r = el.getBoundingClientRect()
  const h = host.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return null
  return { x: r.left - h.left, y: r.top - h.top }
}

function drawLabels(c: CanvasRenderingContext2D, scale: number) {
  const nodes: HTMLElement[] = []
  for (const host of [overlay.labels, overlay.ticks]) {
    if (host) nodes.push(...(Array.from(host.querySelectorAll<HTMLElement>('span,div')) as HTMLElement[]))
  }
  for (const el of nodes) {
    if (el.children.length && el.querySelector('span')) continue // chips are drawn through their parts below
    const style = getComputedStyle(el)
    if (style.display === 'none' || Number(style.opacity) < 0.5) continue
    const text = el.textContent?.trim()
    if (!text) continue
    const box = elementBox(el)
    if (!box) continue
    const size = parseFloat(style.fontSize) || 12
    c.font = `${style.fontStyle} ${style.fontWeight} ${size * scale}px ${style.fontFamily}`
    c.textBaseline = 'top'
    const pad = 3 * scale
    const w = c.measureText(text).width
    const bg = style.backgroundColor
    if (bg && bg !== 'rgba(0, 0, 0, 0)') {
      c.fillStyle = bg
      c.beginPath()
      c.roundRect(box.x * scale - pad, box.y * scale - pad, w + pad * 2, size * scale + pad * 2, 4 * scale)
      c.fill()
    }
    c.fillStyle = style.color
    c.fillText(text, box.x * scale, box.y * scale)
  }
}

/** What an export at `scale` makes from a canvas shown at `cssWidth` × `cssHeight` CSS pixels. */
export type ExportPlan = { width: number; height: number; ratio: number } | { refusal: string }

/** The sentence shown when the drawing is not on screen to be exported. */
export const EXPORT_HIDDEN = `The drawing is behind another tab. Click the ${PANEL_TITLES.viewport} tab to bring it to the front, then export again.`

/** The largest side, in pixels, the export asks the renderer for: a common GPU texture limit. */
export const EXPORT_MAX_SIDE = 8192

/**
 * The size of the exported picture and the pixel ratio the frame is drawn at. Both come from the
 * canvas's CSS size and `scale`, never from its backing size: at 100 % Windows scaling the backing
 * is 1× whatever the quality, and stretching that to 2× is what made the lines soft. A hidden
 * canvas (another tab in front, so dockview has taken the drawing out of the page) has no size,
 * and a picture of it would be an empty file, so it gets a sentence instead.
 */
export function exportPlan(cssWidth: number, cssHeight: number, scale: number): ExportPlan {
  if (!(cssWidth >= 1 && cssHeight >= 1)) return { refusal: EXPORT_HIDDEN }
  const ratio = Math.min(scale, EXPORT_MAX_SIDE / Math.max(cssWidth, cssHeight))
  return { width: Math.round(cssWidth * ratio), height: Math.round(cssHeight * ratio), ratio }
}

type Drawer = {
  getPixelRatio: () => number
  setPixelRatio: (r: number) => void
  renderAsync?: (s: THREE.Scene, c: THREE.Camera) => Promise<void>
  render: (s: THREE.Scene, c: THREE.Camera) => void
}

/**
 * Renders one frame at `scale` times the canvas's CSS size and returns it as a PNG data URL, with
 * the labels painted on. `scale` 2 gives a sharper image for printing. Null when the drawing is
 * hidden (see exportPlan).
 */
export async function exportPng(scale = 2): Promise<string | null> {
  if (!ctx) return null
  const { gl, scene, camera } = ctx
  const source = gl.domElement as HTMLCanvasElement
  const plan = exportPlan(source.clientWidth, source.clientHeight, scale)
  if ('refusal' in plan) return null
  const renderer = gl as unknown as Drawer
  const draw = async () => {
    if (renderer.renderAsync) await renderer.renderAsync(scene, camera)
    else renderer.render(scene, camera)
  }
  const screenRatio = renderer.getPixelRatio()
  try {
    // Draw a fresh frame at the export's own pixel ratio (the canvas buffer is not kept between
    // frames anyway), so it is copied one to one rather than stretched.
    renderer.setPixelRatio(plan.ratio)
    await draw()
    const out = document.createElement('canvas')
    // The renderer rounds the backing size its own way; the picture is exactly what it drew.
    out.width = source.width
    out.height = source.height
    const c = out.getContext('2d')
    if (!c) return null
    c.fillStyle = themeColor('--canvas-bg', '#17181b')
    c.fillRect(0, 0, out.width, out.height)
    c.drawImage(source, 0, 0, out.width, out.height)
    drawLabels(c, out.width / source.clientWidth)
    return out.toDataURL('image/png')
  } finally {
    // Back to the screen's pixel ratio, and draw again: resizing the canvas cleared it.
    if (renderer.getPixelRatio() !== screenRatio) {
      renderer.setPixelRatio(screenRatio)
      await draw()
    }
  }
}

// Handy while developing: lets the browser console grab a frame.
if (import.meta.env?.DEV) (window as unknown as { __physlabExport?: typeof exportPng }).__physlabExport = exportPng

type Bridge = { saveImage?: (dataUrl: string) => Promise<string | null> }

/** Exports and saves; falls back to a normal browser download on the web build. */
export async function saveViewportImage(scale = 2): Promise<string | null> {
  // Say why nothing is saved, rather than write an empty picture or do nothing at all. With no
  // renderer yet the Viewport has never had a size since the app started (it is made only then),
  // which is the same "behind another tab" case as a canvas of 0 × 0.
  const shown = ctx?.gl.domElement as HTMLCanvasElement | undefined
  const plan = shown ? exportPlan(shown.clientWidth, shown.clientHeight, scale) : exportPlan(0, 0, scale)
  if ('refusal' in plan) {
    alert(plan.refusal)
    return null
  }
  const url = await exportPng(scale)
  if (!url) return null
  const bridge = (window as unknown as { physlab?: Bridge }).physlab
  if (bridge?.saveImage) return bridge.saveImage(url)
  const a = document.createElement('a')
  a.href = url
  a.download = 'physlab.png'
  a.click()
  return 'download'
}

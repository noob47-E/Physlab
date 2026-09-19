// Save the drawing as a PNG: the 3D canvas plus the HTML labels drawn on top.

import type * as THREE from 'three/webgpu'
import { overlay } from './overlay'
import { themeColor } from '../app/theme'

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

/**
 * Renders one frame and returns it as a PNG data URL, with the labels painted on.
 * `scale` 2 gives a sharper image for printing.
 */
export async function exportPng(scale = 2): Promise<string | null> {
  if (!ctx) return null
  const { gl, scene, camera } = ctx
  const source = gl.domElement as HTMLCanvasElement
  // Draw a fresh frame: the canvas buffer is not kept between frames.
  const renderer = gl as unknown as { renderAsync?: (s: THREE.Scene, c: THREE.Camera) => Promise<void>; render: (s: THREE.Scene, c: THREE.Camera) => void }
  if (renderer.renderAsync) await renderer.renderAsync(scene, camera)
  else renderer.render(scene, camera)

  const width = source.clientWidth
  const height = source.clientHeight
  const out = document.createElement('canvas')
  out.width = Math.round(width * scale)
  out.height = Math.round(height * scale)
  const c = out.getContext('2d')
  if (!c) return null
  c.fillStyle = themeColor('--canvas-bg', '#17181b')
  c.fillRect(0, 0, out.width, out.height)
  c.drawImage(source, 0, 0, out.width, out.height)
  drawLabels(c, scale)
  return out.toDataURL('image/png')
}

// Handy while developing: lets the browser console grab a frame.
if (import.meta.env?.DEV) (window as unknown as { __physlabExport?: typeof exportPng }).__physlabExport = exportPng

type Bridge = { saveImage?: (dataUrl: string) => Promise<string | null> }

/** Exports and saves; falls back to a normal browser download on the web build. */
export async function saveViewportImage(scale = 2): Promise<string | null> {
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

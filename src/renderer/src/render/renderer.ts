import * as THREE from 'three/webgpu'
import { extend } from '@react-three/fiber'
import { create } from 'zustand'

// Make every three/webgpu class available as a JSX element (<mesh>, <lineSegments>…).
extend(THREE as unknown as Record<string, new (...args: unknown[]) => unknown>)

type Quality = 'low' | 'medium' | 'high'

export const useGpuInfo = create<{
  backend: 'WebGPU' | 'WebGL2' | 'starting'
  adapter: string
  /** Detected quality tier. */
  detected: Quality
  /** User override ('auto' follows detection). */
  choice: 'auto' | Quality
}>(() => ({
  backend: 'starting',
  adapter: '',
  detected: 'medium',
  choice: 'auto'
}))

export const qualityNow = (): Quality => {
  const g = useGpuInfo.getState()
  return g.choice === 'auto' ? g.detected : g.choice
}

/** Scales sampling density / particle counts by quality. */
export const QUALITY = {
  low: { dpr: 1, samples: 0.45, particles: 60_000 },
  medium: { dpr: 1.5, samples: 0.75, particles: 250_000 },
  high: { dpr: 2, samples: 1, particles: 500_000 }
} as const

type DefaultProps = { canvas: HTMLCanvasElement | OffscreenCanvas } & Record<string, unknown>

const rendererOf = new WeakMap<object, Promise<THREE.WebGPURenderer>>()

/**
 * One renderer per canvas, however often it is asked for. React Three Fiber calls this from every
 * `configure()`, and its Canvas configures again on every render: the dock settling the canvas's
 * size, and the quality tier arriving (`buildRenderer` writes `useGpuInfo`, which re-renders the
 * viewport), both land while the WebGPU adapter is still being awaited. Each ask used to build a
 * whole extra renderer on the same canvas, and the one that finished last made R3F put a fresh
 * stand-in perspective camera (zoom 1) over the 2-D view's orthographic one: about half of the first
 * launches on a discrete GPU showed no grid, no axes and no numbers, and Home did not help, until
 * the student went 2-D, 3-D and 2-D again.
 */
export function createRenderer(props: DefaultProps): Promise<THREE.WebGPURenderer> {
  let renderer = rendererOf.get(props.canvas)
  if (!renderer) {
    renderer = buildRenderer(props)
    rendererOf.set(props.canvas, renderer)
    // A renderer that failed to start must not be handed back for ever.
    renderer.catch(() => rendererOf.delete(props.canvas))
  }
  return renderer
}

/** WebGPU renderer (GPU-accelerated) that falls back to WebGL2 automatically; ?webgl=1 forces WebGL2. */
async function buildRenderer(props: DefaultProps): Promise<THREE.WebGPURenderer> {
  const forceWebGL = new URLSearchParams(location.search).get('webgl') === '1'
  const renderer = new THREE.WebGPURenderer({
    canvas: props.canvas as HTMLCanvasElement,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    forceWebGL
  })
  await renderer.init()
  const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2'
  let adapter = ''
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<{ info?: { description?: string; vendor?: string; architecture?: string } } | null> } }).gpu
    const a = gpu && !forceWebGL ? await gpu.requestAdapter() : null
    adapter = a?.info?.description || [a?.info?.vendor, a?.info?.architecture].filter(Boolean).join(' ') || ''
  } catch {
    /* adapter info is optional */
  }
  if (!adapter) {
    // WebGL fallback: ask the GL context for the renderer string.
    try {
      const gl = (renderer.backend as { gl?: WebGL2RenderingContext }).gl
      const ext = gl?.getExtension('WEBGL_debug_renderer_info')
      if (gl && ext) adapter = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
    } catch {
      /* optional */
    }
  }
  const a = adapter.toLowerCase()
  const software = /swiftshader|llvmpipe|basic render|software|microsoft/.test(a)
  const discrete = /nvidia|geforce|rtx|gtx|radeon|amd|arc a/.test(a)
  const detected: Quality = software ? 'low' : backend === 'WebGL2' ? (discrete ? 'medium' : 'low') : discrete ? 'high' : 'medium'
  useGpuInfo.setState({ backend, adapter, detected })
  console.info(`PHYSLAB_CHECK renderer=${backend} adapter=${adapter || 'unknown'} quality=${detected}`)
  return renderer
}

import * as THREE from 'three/webgpu'
import { extend } from '@react-three/fiber'
import { create } from 'zustand'

// Make every three/webgpu class available as a JSX element (<mesh>, <lineSegments>…).
extend(THREE as unknown as Record<string, new (...args: unknown[]) => unknown>)

export type Quality = 'low' | 'medium' | 'high'

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

/** WebGPU renderer (GPU-accelerated) that falls back to WebGL2 automatically; ?webgl=1 forces WebGL2. */
export async function createRenderer(props: DefaultProps): Promise<THREE.WebGPURenderer> {
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

export { THREE }

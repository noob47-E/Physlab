import { useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Highlights, useHighlight } from './Highlights'
import { useApp } from '../app/modes'
import { Box, Check, Grid3x3, Home, Magnet, Square, Undo2, X } from 'lucide-react'
import * as THREE from 'three/webgpu'
import './renderer'
import { createRenderer, QUALITY, useGpuInfo } from './renderer'
import { CameraRig } from './CameraRig'
import { Grid2D, Grid3D } from './Grid'
import { SceneObjects } from './SceneObjects'
import { LabelLayer, LabelProjector } from './Labels'
import { Interaction } from './Interaction'
import { overlay } from './overlay'
import { resetCamera } from './viewState'
import { GpuParticles, useParticleLab } from './GpuParticles'
import { cancelTool, finishTool, TOOLS, undoLastPick, useTool } from './tools'
import { useScene } from '../core/store'
import { SliderDock } from '../panels/SliderDock'
import { LabelShowSwitch } from '../ui/LabelControls'

let fpsEl: HTMLSpanElement | null = null
const sizeProbe = new THREE.Vector2()

/**
 * The canvas only renders when something changes (saves CPU/GPU and battery on weak laptops).
 * Any scene, tool or highlight change requests a new frame; animations keep requesting frames.
 */
function Invalidator() {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const kick = () => {
      invalidate()
      requestAnimationFrame(() => invalidate())
    }
    const unsubs = [useScene.subscribe(kick), useTool.subscribe(kick), useHighlight.subscribe(kick), useParticleLab.subscribe(kick)]
    window.addEventListener('resize', kick)
    kick()
    return () => {
      unsubs.forEach((u) => u())
      window.removeEventListener('resize', kick)
    }
  }, [invalidate])
  useFrame((state) => {
    const s = useScene.getState()
    if (s.playing || useParticleLab.getState().enabled) state.invalidate()
  })
  return null
}

function FrameStats() {
  const acc = useRef({ frames: 0, t: performance.now() })
  const tick = useScene((s) => s.tick)
  useFrame(({ gl, size, viewport }, dt) => {
    // The async WebGPU renderer can miss R3F's initial resize; keep it in sync.
    gl.getSize(sizeProbe)
    if (sizeProbe.x !== size.width || sizeProbe.y !== size.height || gl.getPixelRatio() !== viewport.dpr) {
      gl.setPixelRatio(viewport.dpr)
      gl.setSize(size.width, size.height, false)
    }
    tick(dt)
    const a = acc.current
    a.frames++
    const now = performance.now()
    if (now - a.t > 500) {
      const fps = Math.round((a.frames * 1000) / (now - a.t))
      const busy = useScene.getState().playing || useParticleLab.getState().enabled
      if (fpsEl) fpsEl.textContent = busy || fps > 20 ? `${fps} fps` : 'idle'
      if (location.hash.includes('bench') && Math.floor(now / 5000) !== Math.floor(a.t / 5000)) {
        const lab = useParticleLab.getState()
        console.info(`PHYSLAB_CHECK fps=${fps} particles=${lab.enabled ? lab.count : 0}`)
      }
      a.frames = 0
      a.t = now
    }
  })
  return null
}

export function Viewport() {
  const hostRef = useRef<HTMLDivElement>(null)
  const ticksRef = useRef<HTMLDivElement>(null)
  const viewMode = useScene((s) => s.viewMode)
  const setViewMode = useScene((s) => s.setViewMode)
  const settings = useScene((s) => s.settings)
  const setSettings = useScene((s) => s.setSettings)
  const tool = useScene((s) => s.tool)
  const picks = useTool((s) => s.picks.length)
  const gpu = useGpuInfo()
  const particles = useParticleLab((s) => s.enabled)
  const layoutReady = useApp((s) => s.layoutReady)
  const quality = useGpuInfo((g) => (g.choice === 'auto' ? g.detected : g.choice))

  useEffect(() => {
    overlay.canvasHost = hostRef.current
    overlay.ticks = ticksRef.current
  }, [])

  const info = TOOLS.find((t) => t.id === tool)
  const hint = info ? info.hint[Math.min(picks, info.hint.length - 1)] : ''

  return (
    <div ref={hostRef} className="viewport relative h-full w-full select-none overflow-hidden" onContextMenu={(e) => e.preventDefault()}>
      {layoutReady && <Canvas gl={createRenderer as never} flat dpr={[1, QUALITY[quality].dpr]} frameloop="demand" style={{ background: '#17181b' }}>
        <color attach="background" args={['#17181b']} />
        <CameraRig />
        {viewMode === '2d' ? <Grid2D /> : <Grid3D />}
        <SceneObjects />
        <Highlights />
        {particles && <GpuParticles />}
        <Interaction />
        <LabelProjector />
        <FrameStats />
        <Invalidator />
      </Canvas>}
      <div ref={ticksRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
      <LabelLayer />
      <div
        className="cursor-tip"
        style={{ display: 'none' }}
        ref={(el) => {
          overlay.tip = el
        }}
      />

      <div className="absolute left-3 top-3 flex items-center gap-1">
        <div className="seg">
          <button className={viewMode === '2d' ? 'on' : ''} onClick={() => setViewMode('2d')} title="2D view (Tab)">
            <Square size={13} /> 2D
          </button>
          <button className={viewMode === '3d' ? 'on' : ''} onClick={() => setViewMode('3d')} title="3D view (Tab)">
            <Box size={13} /> 3D
          </button>
        </div>
        <button className="icon-btn" onClick={resetCamera} title="Reset view (Home)">
          <Home size={14} />
        </button>
        <button className={`icon-btn ${settings.showGrid ? 'on' : ''}`} onClick={() => setSettings({ showGrid: !settings.showGrid })} title="Grid">
          <Grid3x3 size={14} />
        </button>
        <button className={`icon-btn ${settings.snap ? 'on' : ''}`} onClick={() => setSettings({ snap: !settings.snap })} title="Snap to grid">
          <Magnet size={14} />
        </button>
      </div>
      <div className="absolute left-3 top-11 flex items-center gap-1.5">
        <span className="text-[11px] text-zinc-500">Labels</span>
        <LabelShowSwitch />
      </div>

      <div className="absolute right-3 top-3 flex items-center gap-2 text-[11px] text-zinc-400">
        <span className="badge" title={gpu.adapter || undefined}>
          {gpu.backend === 'WebGPU' ? '● WebGPU' : gpu.backend === 'WebGL2' ? '● WebGL2' : '○ starting'}
        </span>
        <select
          className="badge pointer-events-auto cursor-pointer outline-none"
          title="Graphics quality (Auto picks a level for this computer)"
          value={gpu.choice}
          onChange={(e) => useGpuInfo.setState({ choice: e.target.value as 'auto' })}
        >
          <option value="auto">Auto ({gpu.detected})</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <span
          className="badge"
          ref={(el) => {
            fpsEl = el
          }}
        >
          – fps
        </span>
      </div>

      {hint && tool !== 'select' && (
        <div className="tool-hint">
          <span>{hint}</span>
          {picks > 0 && (
            <span className="pointer-events-auto ml-3 inline-flex items-center gap-1 border-l border-[#3a3c43] pl-3">
              <button className="btn h-6 primary" onClick={() => finishTool()} title="Finish this shape (right-click, Enter or double-click)">
                <Check size={12} /> Finish
              </button>
              <button className="btn h-6" onClick={() => undoLastPick()} title="Remove the last point (Backspace)">
                <Undo2 size={12} /> Undo point
              </button>
              <button className="btn h-6" onClick={() => cancelTool()} title="Throw this drawing away (Esc)">
                <X size={12} /> Cancel
              </button>
            </span>
          )}
        </div>
      )}
      <SliderDock />
    </div>
  )
}

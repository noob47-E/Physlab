import { useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Highlights, useHighlight } from './Highlights'
import { useApp } from '../app/modes'
import { Box, Camera, Check, Grid3x3, Home, Magnet, Pause, Play, RotateCcw, Square, Undo2, X } from 'lucide-react'
import * as THREE from 'three/webgpu'
import './renderer'
import { createRenderer, QUALITY, useGpuInfo } from './renderer'
import { CameraRig } from './CameraRig'
import { Grid2D, Grid3D } from './Grid'
import { SceneObjects } from './SceneObjects'
import { LabelLayer, LabelProjector } from './Labels'
import { Interaction } from './Interaction'
import { overlay } from './overlay'
import { resetCamera, useView } from './viewState'
import { GpuParticles, useParticleLab } from './GpuParticles'
import { cancelTool, finishTool, TOOLS, undoLastPick, useTool } from './tools'
import { useScene } from '../core/store'
import { SliderDock } from '../panels/SliderDock'
import { SandboxView } from './SandboxView'
import { MarksView } from './Marks'
import { useSandbox } from '../sim/store'
import { formatMeasure } from '../math/format'
import { LabelShowSwitch } from '../ui/LabelControls'
import { themeColor, useTheme } from '../app/theme'
import { saveViewportImage, setExportContext } from './exportImage'

let fpsEl: HTMLSpanElement | null = null
const sizeProbe = new THREE.Vector2()

/**
 * The canvas only renders when something changes (saves CPU/GPU and battery on weak laptops).
 * Any scene, tool or highlight change requests a new frame; animations keep requesting frames.
 */
/**
 * The canvas background, set on the scene itself rather than through `<color attach="background">`.
 * That element detaches when its args change and does not come back: after a theme switch the
 * scene's background was left null, so the viewport painted pure black while the rest of the app
 * turned light. Setting it here also guarantees the frame that paints it.
 */
function Background({ color }: { color: string }) {
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    scene.background = new THREE.Color(color)
    invalidate()
    requestAnimationFrame(() => invalidate())
  }, [color, scene, invalidate])
  return null
}

function Invalidator() {
  const invalidate = useThree((s) => s.invalidate)
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    const kick = () => {
      invalidate()
      requestAnimationFrame(() => invalidate())
    }
    const unsubs = [
      useScene.subscribe(kick),
      useTool.subscribe(kick),
      useHighlight.subscribe(kick),
      useParticleLab.subscribe(kick),
      // The renderer starts asynchronously; the frames drawn before it reports its backend can be
      // too early to show anything.
      useGpuInfo.subscribe(kick),
      // The camera moving, zooming or simply arriving changes what the grid has to cover.
      useView.subscribe(kick),
      // Switching the theme changes the canvas background and every line colour, but with
      // frameloop="demand" nothing asks for the frame that would paint them: the viewport stayed
      // on its last dark frame while the rest of the app turned light.
      useTheme.subscribe(kick)
    ]
    window.addEventListener('resize', kick)
    kick()
    return () => {
      unsubs.forEach((u) => u())
      window.removeEventListener('resize', kick)
    }
  }, [invalidate])
  // Three moments that change what should be on screen without a frame being due: a dock panel
  // settling into place or a splitter being dragged (neither resizes the window), and the real
  // camera replacing the stand-in one that the very first frame is drawn with.
  useEffect(() => {
    invalidate()
    const id = requestAnimationFrame(() => invalidate())
    return () => cancelAnimationFrame(id)
  }, [invalidate, size.width, size.height, camera])
  useFrame((state) => {
    const s = useScene.getState()
    if (s.playing || useParticleLab.getState().enabled) state.invalidate()
  })
  return null
}

/** Lets the export code render one frame on demand. */
function ExportHook() {
  const gl = useThree((st) => st.gl)
  const sc = useThree((st) => st.scene)
  const cam = useThree((st) => st.camera)
  useEffect(() => {
    setExportContext({ gl: gl as never, scene: sc as never, camera: cam as never })
    return () => setExportContext(null)
  }, [gl, sc, cam])
  return null
}

function FrameStats() {
  const acc = useRef({ frames: 0, t: performance.now() })
  const tick = useScene((s) => s.tick)
  useFrame(({ gl, size, viewport, camera }, dt) => {
    // The async WebGPU renderer can miss R3F's initial resize; keep it in sync.
    gl.getSize(sizeProbe)
    if (sizeProbe.x !== size.width || sizeProbe.y !== size.height || gl.getPixelRatio() !== viewport.dpr) {
      gl.setPixelRatio(viewport.dpr)
      gl.setSize(size.width, size.height, false)
    }
    // A canvas that mounted before the window had a size leaves the camera with a
    // nonsense aspect ratio (0/0), which projects everything to NaN.
    const cam = camera as THREE.PerspectiveCamera
    if (cam.isPerspectiveCamera && size.width > 0 && size.height > 0) {
      const aspect = size.width / size.height
      if (!Number.isFinite(cam.aspect) || Math.abs(cam.aspect - aspect) > 1e-6) {
        cam.aspect = aspect
        cam.updateProjectionMatrix()
      }
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
  const mode = useApp((s) => s.mode)
  const quality = useGpuInfo((g) => (g.choice === 'auto' ? g.detected : g.choice))
  const theme = useTheme((t) => t.theme)
  const canvasBg = themeColor('--canvas-bg', '#17181b')
  void theme // re-reads the colour whenever the theme changes

  useEffect(() => {
    overlay.canvasHost = hostRef.current
    overlay.ticks = ticksRef.current
  }, [])

  const info = TOOLS.find((t) => t.id === tool)
  const hint = info ? info.hint[Math.min(picks, info.hint.length - 1)] : ''

  return (
    <div ref={hostRef} data-tour="viewport" className="viewport relative h-full w-full select-none overflow-hidden" onContextMenu={(e) => e.preventDefault()}>
      {layoutReady && <Canvas gl={createRenderer as never} flat dpr={[1, QUALITY[quality].dpr]} frameloop="demand" style={{ background: canvasBg }}>
        <Background color={canvasBg} />
        <CameraRig />
        {/* The sandbox is its own world: the maths grid used to stand through it as a vertical
            wall, and a stray tool click dropped maths points over the physics. */}
        {mode !== 'sandbox' && (viewMode === '2d' ? <Grid2D /> : <Grid3D />)}
        {mode !== 'sandbox' && <SceneObjects />}
        {mode === 'sandbox' && <SandboxView />}
        {mode !== 'sandbox' && <Highlights />}
        {mode !== 'sandbox' && <MarksView />}
        {particles && <GpuParticles />}
        {mode !== 'sandbox' && <Interaction />}
        {mode !== 'sandbox' && <LabelProjector />}
        <FrameStats />
        <ExportHook />
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

      {mode === 'sandbox' && <SandboxStrip />}
      {mode !== 'sandbox' && (
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
        <button className="icon-btn" onClick={() => void saveViewportImage(2)} title="Save the drawing as an image (PNG)">
          <Camera size={14} />
        </button>
      </div>
      )}
      {mode !== 'sandbox' && (
      <div data-tour="labels" className="absolute left-3 top-11 flex items-center gap-1.5">
        <span className="text-[11px] text-zinc-500">Labels</span>
        <LabelShowSwitch />
      </div>
      )}

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

      {mode === 'sandbox' && (
        <div className="tool-hint">
          <span>Drag an object to place it. Press Play, then drag to push or lift it and let go to throw. Right-drag turns the view, scroll zooms.</span>
        </div>
      )}
      {mode !== 'sandbox' && hint && tool !== 'select' && (
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

/** Play, Reset, the clock and a way to find the objects again, on the drawing itself. */
function SandboxStrip() {
  const playing = useScene((s) => s.playing)
  const setPlaying = useScene((s) => s.setPlaying)
  const settings = useScene((s) => s.settings)
  const time = useSandbox((s) => s.engineTime)
  const resetRun = useSandbox((s) => s.resetRun)
  return (
    <div className="absolute left-3 top-3 flex items-center gap-1">
      <button className="btn primary" onClick={() => setPlaying(!playing)} title="Play / pause (Space)">
        {playing ? <Pause size={13} /> : <Play size={13} />} {playing ? 'Pause' : 'Play'}
      </button>
      <button
        className="btn"
        onClick={() => {
          setPlaying(false)
          resetRun()
        }}
        title="Everything back to the start, t = 0"
      >
        <RotateCcw size={13} /> Reset
      </button>
      <button className="icon-btn" onClick={resetCamera} title="Find the objects (Home)">
        <Home size={14} />
      </button>
      <span className="badge tabular-nums">t = {formatMeasure(time, 'number', settings)} s</span>
    </div>
  )
}

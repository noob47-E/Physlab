import { useEffect, useRef, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Highlights, useHighlight } from './Highlights'
import { isDrawingMode, useApp } from '../app/modes'
import { Box, Camera, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Grid3x3, Home, Magnet, Rotate3d, Square, Undo2, X } from 'lucide-react'
import * as THREE from 'three/webgpu'
import './renderer'
import { createRenderer, QUALITY, useGpuInfo } from './renderer'
import { CameraRig } from './CameraRig'
import { Grid2D, Grid3D } from './Grid'
import { SceneObjects } from './SceneObjects'
import { LabelLayer, LabelProjector } from './Labels'
import { Interaction } from './Interaction'
import { overlay } from './overlay'
import { resetCamera, turnView, useTurnMode, useView } from './viewState'
import type { TurnDirection } from './viewMath'
import { GpuParticles, useParticleLab } from './GpuParticles'
import { cancelTool, finishTool, TOOLS, undoLastPick, useTool } from './tools'
import { GRID_STYLES, normaliseGridStyle } from './gridMath'
import { normalizeRect } from './selectMath'
import { useScene } from '../core/store'
import { SliderDock } from '../panels/SliderDock'
import { SandboxView } from './SandboxView'
import { MarksView } from './Marks'
import { useSandbox } from '../sim/store'
import { formatMeasure } from '../math/format'
import { AngleMarksSwitch, LabelShowSwitch } from '../ui/LabelControls'
import { themeColor, useTheme } from '../app/theme'
import { saveViewportImage, setExportContext } from './exportImage'
import type { GridStyle } from '../core/types'

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
  const graphicsInfo = useApp((s) => s.graphicsInfo)
  // The 2D/3D, grid, snap and label controls belong to the maths drawing. The Sandbox and the
  // GPU Lab are 3D worlds of their own where those switches did nothing but confuse.
  const drawing = isDrawingMode(mode)
  const quality = useGpuInfo((g) => (g.choice === 'auto' ? g.detected : g.choice))
  const theme = useTheme((t) => t.theme)
  // The "paper" grid is a tinted page under the lines; the tint is the canvas colour itself.
  const paper = drawing && settings.showGrid && settings.gridStyle === 'paper'
  const canvasBg = themeColor(paper ? '--grid-paper' : '--canvas-bg')
  void theme // re-reads the colour whenever the theme changes

  useEffect(() => {
    overlay.canvasHost = hostRef.current
    overlay.ticks = ticksRef.current
  }, [])

  const info = TOOLS.find((t) => t.id === tool)
  const turnOn = useTurnMode((t) => t.on)
  const turning3D = drawing && viewMode === '3d'
  // In 3-D the tool's hint also says how to turn, which nothing on screen used to (Fix 3); with
  // the Turn switch on, the left button is not the tool's at all and the hint says so.
  const toolHint = info ? info.hint[Math.min(picks, info.hint.length - 1)] : ''
  const hint =
    turning3D && turnOn
      ? 'Turn is on: drag (or use one finger) to turn the view. Click Turn again, or choose a tool, to draw.'
      : turning3D && toolHint
        ? `${toolHint} Right-drag or the arrow keys turn the view.`
        : toolHint

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
        {drawing && (
          <div className="seg">
            <button className={viewMode === '2d' ? 'on' : ''} onClick={() => setViewMode('2d')} title="2D view (3)">
              <Square size={13} /> 2D
            </button>
            <button className={viewMode === '3d' ? 'on' : ''} onClick={() => setViewMode('3d')} title="3D view (3)">
              <Box size={13} /> 3D
            </button>
          </div>
        )}
        <button className="icon-btn" onClick={resetCamera} title="Reset view (Home)">
          <Home size={14} />
        </button>
        {drawing && (
          <>
            <button className={`icon-btn ${settings.showGrid ? 'on' : ''}`} onClick={() => setSettings({ showGrid: !settings.showGrid })} title="Grid">
              <Grid3x3 size={14} />
            </button>
            <GridStylePicker />
            <button className={`icon-btn ${settings.snap ? 'on' : ''}`} onClick={() => setSettings({ snap: !settings.snap })} title="Snap to grid">
              <Magnet size={14} />
            </button>
          </>
        )}
        <button className="icon-btn" onClick={() => void saveViewportImage(2)} title="Save the drawing as an image (PNG)">
          <Camera size={14} />
        </button>
      </div>
      )}
      {drawing && (
      <div data-tour="labels" className="absolute left-3 top-11 flex items-center gap-1.5">
        <span className="text-fine text-[var(--text-faint)]">Labels</span>
        <LabelShowSwitch />
        <AngleMarksSwitch />
      </div>
      )}
      {mode !== 'sandbox' && <MarqueeBox />}
      {drawing && viewMode === '3d' && <TurnPad />}

      {/* Which backend, which quality, how many frames: for whoever is diagnosing graphics, not
          for a student doing homework. The setting is in the units-and-precision popover. */}
      <div className={`absolute right-3 top-3 items-center gap-2 text-fine text-[var(--text-dim)] ${graphicsInfo ? 'flex' : 'hidden'}`}>
        <span className="badge" title={gpu.adapter || undefined}>
          {gpu.backend === 'WebGPU' ? '● WebGPU' : gpu.backend === 'WebGL2' ? '● WebGL2' : '○ starting'}
        </span>
        <select
          className="badge pointer-events-auto cursor-pointer outline-none"
          title="Graphics quality (Auto picks a level for this computer)"
          value={gpu.choice}
          onChange={(e) => {
            useGpuInfo.setState({ choice: e.target.value as 'auto' })
            // A focused <select> counts as typing, so every viewport shortcut would stay dead
            // until the canvas was clicked; the choice is made, give the keys back.
            e.currentTarget.blur()
          }}
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
      {mode !== 'sandbox' && hint && (tool !== 'select' || (turning3D && turnOn)) && (
        // The hint is centred at the bottom; in 3-D the turn pad stands at the bottom right, so
        // the hint keeps clear of it on both sides.
        <div className="tool-hint" style={turning3D ? { maxWidth: 'max(180px, calc(100% - 340px))' } : undefined}>
          <span>{hint}</span>
          {picks > 0 && (
            <span className="pointer-events-auto ml-3 inline-flex shrink-0 items-center gap-1 border-l border-[var(--line-2)] pl-3">
              <button className="btn primary min-h-[44px]" onClick={() => finishTool()} title="Finish this shape (right-click, Enter or double-click)">
                <Check size={12} /> Finish
              </button>
              <button className="btn min-h-[44px]" onClick={() => undoLastPick()} title="Remove the last point (Backspace)">
                <Undo2 size={12} /> Undo point
              </button>
              <button className="btn min-h-[44px]" onClick={() => cancelTool()} title="Throw this drawing away (Esc)">
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

/**
 * Lines / Dots / Fine / Paper / Off: the style is saved with the drawing, "Off" is the grid switch.
 * The axes have their own tick beside it: they are not a grid style (the grid can be off with the
 * axes on, and the other way round), and until 0.6.1 the only way to hide them was a View menu row
 * a student looking at the grid picker never found.
 */
function GridStylePicker() {
  const showGrid = useScene((s) => s.settings.showGrid)
  // Normalised, so a file naming a style this build lacks shows the lines it draws, not a blank picker.
  const gridStyle = useScene((s) => normaliseGridStyle(s.settings.gridStyle))
  const showAxes = useScene((s) => s.settings.showAxes)
  const setSettings = useScene((s) => s.setSettings)
  return (
    <>
      <select
        className="badge pointer-events-auto cursor-pointer outline-none"
        title="How the grid is drawn"
        value={showGrid ? gridStyle : 'off'}
        onChange={(e) => {
          const v = e.target.value
          if (v === 'off') setSettings({ showGrid: false })
          else setSettings({ showGrid: true, gridStyle: v as GridStyle })
          // Once chosen, hand the keys back: a focused <select> swallows V, P, Esc, Delete, Space
          // and Ctrl+Z (isTyping treats it as a text field) until the canvas is clicked.
          e.currentTarget.blur()
        }}
      >
        {GRID_STYLES.map((g) => (
          <option key={g.id} value={g.id}>
            {g.label}
          </option>
        ))}
        <option value="off">Off</option>
      </select>
      <button
        type="button"
        className="badge pointer-events-auto cursor-pointer outline-none"
        title={showAxes ? 'Hide the axes and their numbers' : 'Show the axes and their numbers'}
        aria-pressed={showAxes}
        onClick={(e) => {
          setSettings({ showAxes: !showAxes })
          e.currentTarget.blur()
        }}
      >
        {showAxes ? '✓ Axes' : 'Axes'}
      </button>
    </>
  )
}

/** The selection box while it is being dragged, over the canvas in the same pixels the pointer uses. */
function MarqueeBox() {
  const m = useTool((s) => s.marquee)
  if (!m) return null
  const r = normalizeRect(m)
  return <div className="marquee" style={{ left: r.left, top: r.top, width: r.right - r.left, height: r.bottom - r.top }} />
}

/**
 * The clock and a way to find the objects again, on the drawing itself. Play, Step and Reset
 * live in the Sandbox panel's bar: this strip used to carry its own Play and Reset, so a student
 * saw two of each with different tooltips. Space still plays and pauses with the panel closed.
 */
function SandboxStrip() {
  const settings = useScene((s) => s.settings)
  const time = useSandbox((s) => s.engineTime)
  return (
    <div className="absolute left-3 top-3 flex items-center gap-1">
      <button className="icon-btn" onClick={resetCamera} title="Find the objects (Home)">
        <Home size={14} />
      </button>
      <span className="badge tabular-nums">t = {formatMeasure(time, 'number', settings)} s</span>
    </div>
  )
}

/**
 * Fix 3: the 3-D view had no visible way to turn. Four turn buttons round Home, and the Turn switch
 * that hands the left button (and one finger) to turning whatever tool is out. 44 px each, for a
 * finger. A button held down keeps turning; Enter or Space on a focused one turns one step.
 */
function TurnPad() {
  const turnOn = useTurnMode((t) => t.on)
  const tool = useScene((s) => s.tool)
  // Choosing a tool means the student wants to draw with it: the left button goes back to the tool.
  useEffect(() => {
    useTurnMode.setState({ on: false })
  }, [tool])
  return (
    <div className="pointer-events-auto absolute bottom-[56px] right-3 grid grid-cols-3 gap-0.5 rounded-lg border border-line-2 bg-label p-1" role="group" aria-label="Turn the 3-D view">
      <span />
      <TurnButton dir="up" label="Tip the drawing up (↑ key; hold Shift for a small step)">
        <ChevronUp size={18} />
      </TurnButton>
      <button
        type="button"
        className={`icon-btn min-h-[44px] min-w-[44px] ${turnOn ? 'on' : ''}`}
        aria-pressed={turnOn}
        title={turnOn ? 'Turn is on: a left drag or one finger turns the view. Click to hand the left button back to the tool' : 'Turn: a left drag or one finger turns the view, whatever tool is out (a right drag always turns)'}
        onClick={() => useTurnMode.setState({ on: !turnOn })}
      >
        <Rotate3d size={18} />
      </button>
      <TurnButton dir="left" label="Turn the drawing left (← key; hold Shift for a small step)">
        <ChevronLeft size={18} />
      </TurnButton>
      <button type="button" className="icon-btn min-h-[44px] min-w-[44px]" onClick={resetCamera} title="Back to the starting view (Home)">
        <Home size={16} />
      </button>
      <TurnButton dir="right" label="Turn the drawing right (→ key; hold Shift for a small step)">
        <ChevronRight size={18} />
      </TurnButton>
      <span />
      <TurnButton dir="down" label="Tip the drawing down (↓ key; hold Shift for a small step)">
        <ChevronDown size={18} />
      </TurnButton>
      <span />
    </div>
  )
}

function TurnButton({ dir, label, children }: { dir: TurnDirection; label: string; children: ReactNode }) {
  const hold = useRef<{ wait: number; every: number } | null>(null)
  const stop = () => {
    if (!hold.current) return
    clearTimeout(hold.current.wait)
    clearInterval(hold.current.every)
    hold.current = null
  }
  useEffect(() => stop, [])
  return (
    <button
      type="button"
      className="icon-btn min-h-[44px] min-w-[44px]"
      title={label}
      aria-label={label}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        stop()
        turnView(dir, e.shiftKey)
        // Held down, it keeps turning: a small step every tenth of a second after a short pause,
        // so one click is still exactly one step.
        const wait = window.setTimeout(() => {
          if (hold.current) hold.current.every = window.setInterval(() => turnView(dir, true), 100)
        }, 400)
        hold.current = { wait, every: 0 }
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      // A click from the keyboard (Enter or Space on the focused button) has no pointer press.
      onClick={(e) => {
        if (e.detail === 0) turnView(dir, e.shiftKey)
      }}
    >
      {children}
    </button>
  )
}

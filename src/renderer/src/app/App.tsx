import { lazy, Suspense, useEffect, useRef } from 'react'
import { DockviewReact, themeDark, type DockviewApi, type DockviewReadyEvent, type IDockviewPanelProps } from 'dockview-react'
import { CommandBar } from './CommandBar'
import { TopBar, ToolShelf } from './TopBar'
import { LAYOUT_KEY, buildLayout, enterMode, restoreLayout, savedMode, watchLayout } from './layout'
import './shell.css'
import { SearchPalette } from './SearchPalette'
import { useShortcuts } from './shortcuts'
import { Viewport } from '../render/Viewport'
import { Outliner } from '../panels/Outliner'
import { Properties } from '../panels/Properties'
import { Measurements } from '../panels/Measurements'
import { Console } from '../panels/Console'
import { Timeline } from '../panels/Timeline'
import { Examples } from '../panels/Examples'
import { useParticleLab } from '../render/GpuParticles'
import { useScene } from '../core/store'
import { useApp } from './modes'
import { startAutosave } from './autosave'
import { RecoveryBar } from './RecoveryBar'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { ContextMenuHost } from '../ui/ContextMenu'
import { Tour } from './tour/Tour'
import { PANEL_TITLES, refreshOpenPanels, setDockApi, showPanel } from './panels'

// Heavier panels load on first use so the app starts faster on slow computers.
const Solver = lazy(() => import('../panels/Solver').then((m) => ({ default: m.Solver })))
// The Vector Calculator was the one eager import of MathLive, so every start-up paid for the
// whole maths-field library before the first frame; lazy, it loads with the panel that needs it.
const VectorCalc = lazy(() => import('../panels/VectorCalc').then((m) => ({ default: m.VectorCalc })))
const Maths = lazy(() => import('../panels/Maths').then((m) => ({ default: m.Maths })))
const Graphs = lazy(() => import('../panels/Graphs').then((m) => ({ default: m.Graphs })))
const GpuLab = lazy(() => import('../panels/GpuLab').then((m) => ({ default: m.GpuLab })))
const SandboxPanel = lazy(() => import('../panels/Sandbox').then((m) => ({ default: m.Sandbox })))
const Practice = lazy(() => import('../panels/Practice').then((m) => ({ default: m.Practice })))
const Author = lazy(() => import('../panels/Author').then((m) => ({ default: m.Author })))
const LabData = lazy(() => import('../panels/LabData').then((m) => ({ default: m.LabData })))
const ClassResults = lazy(() => import('../panels/ClassResults').then((m) => ({ default: m.ClassResults })))

const PANEL_VIEWS: Record<string, React.ComponentType> = {
  viewport: Viewport,
  outliner: Outliner,
  examples: Examples,
  properties: Properties,
  measure: Measurements,
  vectorcalc: VectorCalc,
  solver: Solver,
  practice: Practice,
  author: Author,
  labdata: LabData,
  maths: Maths,
  console: Console,
  timeline: Timeline,
  graphs: Graphs,
  gpulab: GpuLab,
  sandbox: SandboxPanel,
  classresults: ClassResults
}

const components: Record<string, React.FunctionComponent<IDockviewPanelProps>> = Object.fromEntries(
  Object.entries(PANEL_VIEWS).map(([id, Panel]) => [
    id,
    () => (
      <ErrorBoundary name={PANEL_TITLES[id]}>
        <Suspense fallback={<div className="panel p-4 text-[var(--text-faint)]">Loading…</div>}>
          <Panel />
        </Suspense>
      </ErrorBoundary>
    )
  ])
)

export function App() {
  const api = useRef<DockviewApi | null>(null)
  const unwatch = useRef<(() => void) | null>(null)
  const focus = useScene((s) => s.focusPanel)
  useShortcuts()

  useEffect(() => () => unwatch.current?.(), [])

  useEffect(() => {
    // A mode asking for its panel reopens it when the user has closed it.
    if (focus) showPanel(focus.id)
  }, [focus])

  useEffect(() => startAutosave(), [])

  useEffect(() => {
    // #bench=1000000 starts the GPU particle benchmark (used for performance checks).
    const bench = location.hash.match(/bench=(\d+)/)
    if (bench) {
      enterMode('gpu')
      useParticleLab.setState({ enabled: true, count: Number(bench[1]) })
    }
    // #sandbox=1 opens the physics sandbox and starts it running (used to check a real build).
    if (location.hash.includes('sandbox')) {
      enterMode('sandbox')
      setTimeout(() => useScene.getState().setPlaying(true), 1500)
    }
  }, [])

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <RecoveryBar />
      <ToolShelf />
      <CommandBar />
      <div className="min-h-0 flex-1">
        <DockviewReact
          theme={themeDark}
          components={components}
          onReady={(e: DockviewReadyEvent) => {
            api.current = e.api
            setDockApi(e.api)
            try {
              const bench = location.hash.includes('bench')
              const mode = bench ? 'gpu' : (savedMode() ?? 'vectors')
              const restored = !bench && restoreLayout(e.api)
              if (!restored) buildLayout(e.api, mode)
              // enterMode, not setMode: the mode needs its view, tool shelf and drawing too, and
              // a restored Sandbox used to come back in 2D with the wrong shelf.
              enterMode(mode)
              unwatch.current?.()
              unwatch.current = watchLayout(e.api)
              refreshOpenPanels()
            } catch (err) {
              // A layout we cannot restore must never stop the app from starting.
              console.error('PhysLab layout', err)
              localStorage.removeItem(LAYOUT_KEY)
            }
            // Both paths are harmless if they both run; the timer covers a window that is
            // hidden or minimised, where animation frames never arrive and the canvas
            // would otherwise never appear.
            const ready = () => useApp.setState({ layoutReady: true })
            requestAnimationFrame(ready)
            setTimeout(ready, 150)
          }}
        />
      </div>
      <SearchPalette />
      <ContextMenuHost />
      <Tour />
    </div>
  )
}

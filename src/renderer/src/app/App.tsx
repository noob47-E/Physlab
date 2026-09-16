import { lazy, Suspense, useEffect, useRef } from 'react'
import { DockviewReact, themeDark, type DockviewApi, type DockviewReadyEvent, type IDockviewPanelProps } from 'dockview-react'
import { CommandBar } from './CommandBar'
import { enterMode, TopBar, ToolShelf } from './TopBar'
import { SearchPalette } from './SearchPalette'
import { useShortcuts } from './shortcuts'
import { Viewport } from '../render/Viewport'
import { Outliner } from '../panels/Outliner'
import { Properties } from '../panels/Properties'
import { Measurements } from '../panels/Measurements'
import { Console } from '../panels/Console'
import { Timeline } from '../panels/Timeline'
import { Examples } from '../panels/Examples'
import { VectorCalc } from '../panels/VectorCalc'
import { useParticleLab } from '../render/GpuParticles'
import { useScene } from '../core/store'
import { useApp, type ModeId } from './modes'
import { startAutosave } from './autosave'
import { RecoveryBar } from './RecoveryBar'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { ContextMenuHost } from '../ui/ContextMenu'
import { Tour } from './tour/Tour'

// Heavier panels load on first use so the app starts faster on slow computers.
const Solver = lazy(() => import('../panels/Solver').then((m) => ({ default: m.Solver })))
const Calculator = lazy(() => import('../panels/Calculator').then((m) => ({ default: m.Calculator })))
const Graphs = lazy(() => import('../panels/Graphs').then((m) => ({ default: m.Graphs })))
const GpuLab = lazy(() => import('../panels/GpuLab').then((m) => ({ default: m.GpuLab })))
const SandboxPanel = lazy(() => import('../panels/Sandbox').then((m) => ({ default: m.Sandbox })))
const Practice = lazy(() => import('../panels/Practice').then((m) => ({ default: m.Practice })))

const PANELS: Record<string, [string, React.ComponentType]> = {
  viewport: ['Viewport', Viewport],
  outliner: ['Outliner', Outliner],
  examples: ['Examples', Examples],
  properties: ['Properties', Properties],
  measure: ['Measure', Measurements],
  vectorcalc: ['Vector Calculator', VectorCalc],
  solver: ['Solver', Solver],
  practice: ['Practice', Practice],
  calculator: ['Calculator', Calculator],
  console: ['Console', Console],
  timeline: ['Timeline', Timeline],
  graphs: ['Graphs', Graphs],
  gpulab: ['GPU Lab', GpuLab],
  sandbox: ['Sandbox', SandboxPanel]
}

const components: Record<string, React.FunctionComponent<IDockviewPanelProps>> = Object.fromEntries(
  Object.entries(PANELS).map(([id, [name, Panel]]) => [
    id,
    () => (
      <ErrorBoundary name={name}>
        <Suspense fallback={<div className="panel p-4 text-zinc-500">Loading…</div>}>
          <Panel />
        </Suspense>
      </ErrorBoundary>
    )
  ])
)

const LAYOUT_KEY = 'physlab.layout'

/** Put the panels back where the user left them (and the mode they were in). */
function restoreLayout(api: DockviewApi): boolean {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY)
    if (!saved) return false
    const { layout, mode } = JSON.parse(saved) as { layout: object; mode?: ModeId }
    api.fromJSON(layout as never)
    if (mode) useApp.getState().setMode(mode)
    return true
  } catch {
    localStorage.removeItem(LAYOUT_KEY)
    return false
  }
}

function watchLayout(api: DockviewApi) {
  const save = () => {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify({ layout: api.toJSON(), mode: useApp.getState().mode }))
    } catch {
      // Storage blocked: the layout just will not be remembered.
    }
  }
  let timer: ReturnType<typeof setTimeout> | null = null
  const queue = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(save, 800)
  }
  api.onDidLayoutChange(queue)
  window.addEventListener('beforeunload', save)
}

/** Forget the saved arrangement and start from the standard one. */
export function resetLayout(): void {
  localStorage.removeItem(LAYOUT_KEY)
  location.reload()
}

function buildLayout(api: DockviewApi) {
  api.addPanel({ id: 'viewport', component: 'viewport', title: 'Viewport' })
  api.addPanel({ id: 'outliner', component: 'outliner', title: 'Outliner', position: { referencePanel: 'viewport', direction: 'left' }, initialWidth: 260 })
  api.addPanel({ id: 'examples', component: 'examples', title: 'Examples', position: { referencePanel: 'outliner', direction: 'within' } })
  api.addPanel({ id: 'vectorcalc', component: 'vectorcalc', title: 'Vector Calc', position: { referencePanel: 'viewport', direction: 'right' }, initialWidth: 430 })
  api.addPanel({ id: 'measure', component: 'measure', title: 'Measure', position: { referencePanel: 'vectorcalc', direction: 'within' } })
  api.addPanel({ id: 'calculator', component: 'calculator', title: 'Calculator', position: { referencePanel: 'vectorcalc', direction: 'within' } })
  api.addPanel({ id: 'properties', component: 'properties', title: 'Properties', position: { referencePanel: 'vectorcalc', direction: 'within' } })
  api.addPanel({ id: 'solver', component: 'solver', title: 'Solver', position: { referencePanel: 'vectorcalc', direction: 'within' } })
  api.addPanel({ id: 'sandbox', component: 'sandbox', title: 'Sandbox', position: { referencePanel: 'vectorcalc', direction: 'within' } })
  api.addPanel({ id: 'practice', component: 'practice', title: 'Practice', position: { referencePanel: 'vectorcalc', direction: 'within' } })
  api.addPanel({ id: 'console', component: 'console', title: 'Console', position: { referencePanel: 'viewport', direction: 'below' }, initialHeight: 200 })
  api.addPanel({ id: 'timeline', component: 'timeline', title: 'Timeline', position: { referencePanel: 'console', direction: 'within' } })
  api.addPanel({ id: 'graphs', component: 'graphs', title: 'Graphs', position: { referencePanel: 'console', direction: 'within' } })
  api.addPanel({ id: 'gpulab', component: 'gpulab', title: 'GPU Lab', position: { referencePanel: 'console', direction: 'within' } })
  api.getPanel('vectorcalc')?.api.setActive()
  api.getPanel('examples')?.api.setActive()
  api.getPanel('console')?.api.setActive()
}

export function App() {
  const api = useRef<DockviewApi | null>(null)
  const focus = useScene((s) => s.focusPanel)
  useShortcuts()

  useEffect(() => {
    if (focus) api.current?.getPanel(focus.id)?.api.setActive()
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
            try {
              const restored = !location.hash.includes('bench') && restoreLayout(e.api)
              if (!restored) {
                buildLayout(e.api)
                if (!location.hash.includes('bench')) useApp.getState().setMode('vectors')
              }
              watchLayout(e.api)
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

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
import { useApp } from './modes'
import { ErrorBoundary } from '../ui/ErrorBoundary'

// Heavier panels load on first use so the app starts faster on slow computers.
const Solver = lazy(() => import('../panels/Solver').then((m) => ({ default: m.Solver })))
const Calculator = lazy(() => import('../panels/Calculator').then((m) => ({ default: m.Calculator })))
const Graphs = lazy(() => import('../panels/Graphs').then((m) => ({ default: m.Graphs })))
const GpuLab = lazy(() => import('../panels/GpuLab').then((m) => ({ default: m.GpuLab })))

const PANELS: Record<string, [string, React.ComponentType]> = {
  viewport: ['Viewport', Viewport],
  outliner: ['Outliner', Outliner],
  examples: ['Examples', Examples],
  properties: ['Properties', Properties],
  measure: ['Measure', Measurements],
  vectorcalc: ['Vector Calculator', VectorCalc],
  solver: ['Solver', Solver],
  calculator: ['Calculator', Calculator],
  console: ['Console', Console],
  timeline: ['Timeline', Timeline],
  graphs: ['Graphs', Graphs],
  gpulab: ['GPU Lab', GpuLab]
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

function buildLayout(api: DockviewApi) {
  api.addPanel({ id: 'viewport', component: 'viewport', title: 'Viewport' })
  api.addPanel({ id: 'outliner', component: 'outliner', title: 'Outliner', position: { referencePanel: 'viewport', direction: 'left' }, initialWidth: 260 })
  api.addPanel({ id: 'examples', component: 'examples', title: 'Examples', position: { referencePanel: 'outliner', direction: 'within' } })
  api.addPanel({ id: 'vectorcalc', component: 'vectorcalc', title: 'Vector Calc', position: { referencePanel: 'viewport', direction: 'right' }, initialWidth: 430 })
  api.addPanel({ id: 'measure', component: 'measure', title: 'Measure', position: { referencePanel: 'vectorcalc', direction: 'within' } })
  api.addPanel({ id: 'calculator', component: 'calculator', title: 'Calculator', position: { referencePanel: 'vectorcalc', direction: 'within' } })
  api.addPanel({ id: 'properties', component: 'properties', title: 'Properties', position: { referencePanel: 'vectorcalc', direction: 'within' } })
  api.addPanel({ id: 'solver', component: 'solver', title: 'Solver', position: { referencePanel: 'vectorcalc', direction: 'within' } })
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

  useEffect(() => {
    // #bench=1000000 starts the GPU particle benchmark (used for performance checks).
    const bench = location.hash.match(/bench=(\d+)/)
    if (bench) {
      enterMode('gpu')
      useParticleLab.setState({ enabled: true, count: Number(bench[1]) })
    }
  }, [])

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <ToolShelf />
      <CommandBar />
      <div className="min-h-0 flex-1">
        <DockviewReact
          theme={themeDark}
          components={components}
          onReady={(e: DockviewReadyEvent) => {
            api.current = e.api
            buildLayout(e.api)
            if (!location.hash.includes('bench')) useApp.getState().setMode('vectors')
            requestAnimationFrame(() => useApp.setState({ layoutReady: true }))
          }}
        />
      </div>
      <SearchPalette />
    </div>
  )
}

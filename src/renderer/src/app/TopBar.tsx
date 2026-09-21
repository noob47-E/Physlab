import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  ChevronDown,
  Circle,
  Crosshair,
  Divide,
  Dot,
  Eraser,
  GitCommitHorizontal,
  Minus,
  MousePointer2,
  MoveUpRight,
  PenLine,
  Pentagon,
  Ruler,
  Scissors,
  Search,
  Settings2,
  Slash,
  SquareDashedBottom,
  Triangle,
  Type,
  Waypoints
} from 'lucide-react'
import { newProject, openProject, saveProject } from './files'
import { MODES, modeById, useApp } from './modes'
import { scene, useScene } from '../core/store'
import type { LengthUnit, ToolId } from '../core/types'
import { TOOLS } from '../render/tools'
import { saveViewportImage } from '../render/exportImage'
import { useTheme } from './theme'
import { useTour } from './tour/Tour'
import { enterMode, resetLayout } from './layout'
import { PANEL_LIST, togglePanel, useOpenPanels } from './panels'
import { LABEL_SHOW_HELP, LabelShowSwitch } from '../ui/LabelControls'
import { resetCamera } from '../render/viewState'
import { useSandbox } from '../sim/store'
import { UNIT_NAMES } from '../math/format'
import { visibleOrder } from '../core/visibility'
import { barDensity, clampZoom, shelfMode, zoomPercent, ZOOM_MAX, ZOOM_MIN, type BarDensity } from './layoutMath'

// The panels still import enterMode from here; it now lives with the rest of the layout code.
export { enterMode } from './layout'

const ICONS: Record<ToolId, React.ReactNode> = {
  select: <MousePointer2 size={16} />,
  sketch: <PenLine size={16} />,
  point: <Dot size={20} />,
  vector: <MoveUpRight size={16} />,
  segment: <Minus size={16} />,
  line: <Slash size={16} />,
  ray: <ArrowRight size={16} />,
  circle: <Circle size={16} />,
  triangle: <Triangle size={16} />,
  polygon: <Pentagon size={16} />,
  angle: <SquareDashedBottom size={16} />,
  distance: <Ruler size={16} />,
  midpoint: <GitCommitHorizontal size={16} />,
  perpendicular: <Crosshair size={16} />,
  parallel: <Divide size={16} />,
  perpBisector: <Scissors size={16} />,
  angleBisector: <Waypoints size={16} />,
  intersect: <Crosshair size={16} />,
  text: <Type size={16} />,
  delete: <Eraser size={16} />
}

// ---------------------------------------------------------------------------
// Window zoom (Electron only; the browser preview has its own Ctrl+= already)
// ---------------------------------------------------------------------------

type ZoomBridge = {
  getZoom?: () => Promise<number>
  setZoom?: (level: number) => Promise<number>
  onZoom?: (cb: (level: number) => void) => () => void
}
const zoomBridge = (): ZoomBridge | undefined => (window as unknown as { physlab?: ZoomBridge }).physlab

// The zoom is remembered by Chromium itself, per host, whichever way it was set: the popover, or
// Ctrl+= / Ctrl+- / Ctrl+0 in the application menu. The renderer used to keep its own copy in
// localStorage and replay it at start-up, but only the popover wrote that copy, so a Ctrl+0 was
// silently undone at the next launch. One owner, none here.

function useZoom(): [number, (level: number) => void, boolean] {
  const [level, setLevel] = useState(0)
  const b = zoomBridge()
  const available = !!b?.setZoom
  useEffect(() => {
    if (!b?.getZoom || !b.onZoom) return
    void b.getZoom().then(setLevel)
    return b.onZoom(setLevel)
    // The bridge is fixed for the life of the window, so this runs once.
  }, [b])
  const set = useCallback((next: number) => {
    const z = clampZoom(next)
    setLevel(z)
    void zoomBridge()?.setZoom?.(z)
  }, [])
  return [level, set, available]
}

// ---------------------------------------------------------------------------
// Measuring the bar, so it can fold itself up on a narrow window
// ---------------------------------------------------------------------------

/**
 * The width of an element, followed as it changes. 0 until it has been measured. A callback ref,
 * not a ref object: the tool shelf swaps its root element when a mode hides it, and an observer
 * left on the old node would report nothing for the new one.
 */
export function useContainerWidth(): [(el: HTMLElement | null) => void, number] {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    if (!el) return
    setWidth(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [setEl, width]
}

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    // Escape closes the menu and nothing else. Without the capture phase and stopPropagation the
    // global handler saw the same key and threw away the student's tool and selection.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.stopImmediatePropagation()
      close()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open, close])
  return ref
}

export type MenuItem = { label: string; sc?: string; run: () => void; disabled?: boolean; on?: boolean } | '-'

function Menu({ label, items, title, className = '' }: { label: React.ReactNode; items: MenuItem[]; title?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useOutsideClose(open, close)
  return (
    <div ref={ref} className="relative">
      <button className={`menu-btn ${open ? 'open' : ''} ${className}`} title={title} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {label}
      </button>
      {open && (
        <div className="menu" role="menu">
          {items.map((it, i) =>
            it === '-' ? (
              <hr key={i} />
            ) : (
              <button
                key={it.label}
                role="menuitem"
                // A real disabled attribute: the row cannot be clicked or tabbed to, and the
                // "coming soon" modes stop opening an empty mode.
                disabled={it.disabled}
                className={`${it.disabled ? 'opacity-45' : ''} ${it.on ? 'on' : ''}`}
                onClick={() => {
                  setOpen(false)
                  it.run()
                }}
              >
                <span>{it.label}</span>
                <span className="sc">{it.sc}</span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}

const UNITS: LengthUnit[] = ['unit', 'mm', 'cm', 'm', 'km', 'in', 'ft']

const Heading = ({ children }: { children: React.ReactNode }) => <div className="mb-1 text-fine uppercase tracking-wide text-[var(--text-faint)]">{children}</div>

/** Units, precision, what every object shows on the drawing, and the size of the whole window. */
function MeasureSettingsMenu({ density }: { density: BarDensity }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useOutsideClose(open, close)
  const settings = useScene((s) => s.settings)
  const set = useScene((s) => s.setSettings)
  const graphicsInfo = useApp((a) => a.graphicsInfo)
  const setGraphicsInfo = useApp((a) => a.setGraphicsInfo)
  const [zoom, setZoom, zoomable] = useZoom()
  const summary = `1 □ = ${settings.unitPerSquare} ${settings.unit === 'unit' ? 'unit' : settings.unit} · ${settings.decimals} ${settings.precisionMode === 'dp' ? 'd.p.' : 's.f.'}`
  return (
    <div ref={ref} className="relative">
      <button className={`menu-btn flex items-center gap-1.5 ${open ? 'open' : ''}`} onClick={() => setOpen(!open)} title={`Units, precision and labels (${summary})`} aria-expanded={open}>
        <Settings2 size={14} />
        {density !== 'tight' && <span className="text-[var(--text)]">{summary}</span>}
      </button>
      {open && (
        <div className="menu right-0 left-auto w-[22rem] p-3" onKeyDown={(e) => e.stopPropagation()}>
          <Heading>Scale</Heading>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[var(--text)]">1 grid square =</span>
            <input className="field num w-16" type="number" min={0} step="any" value={settings.unitPerSquare} onChange={(e) => set({ unitPerSquare: Math.max(1e-9, Number(e.target.value) || 1) })} />
            <select className="field w-28" value={settings.unit} onChange={(e) => set({ unit: e.target.value as LengthUnit })}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {UNIT_NAMES[u]}
                </option>
              ))}
            </select>
          </div>
          <Heading>Precision</Heading>
          <div className="mb-3 flex items-center gap-2">
            <input className="field num w-14" type="number" min={0} max={12} value={settings.decimals} onChange={(e) => set({ decimals: Math.max(0, Math.min(12, Math.round(Number(e.target.value)))) })} />
            <div className="seg whitespace-nowrap">
              <button className={settings.precisionMode === 'dp' ? 'on' : ''} onClick={() => set({ precisionMode: 'dp' })}>
                decimal places
              </button>
              <button className={settings.precisionMode === 'sf' ? 'on' : ''} onClick={() => set({ precisionMode: 'sf', decimals: Math.max(1, settings.decimals) })}>
                sig. figures
              </button>
            </div>
          </div>
          <Heading>Angles</Heading>
          <div className="seg mb-3">
            <button className={settings.angleUnit === 'deg' ? 'on' : ''} onClick={() => set({ angleUnit: 'deg' })}>
              Degrees
            </button>
            <button className={settings.angleUnit === 'rad' ? 'on' : ''} onClick={() => set({ angleUnit: 'rad' })}>
              Radians
            </button>
          </div>
          <Heading>Show labels on the drawing</Heading>
          <LabelShowSwitch className="mb-1" />
          <div className="mb-2 text-fine leading-snug text-[var(--text-faint)]">
            {LABEL_SHOW_HELP[settings.labelShow]} Pin a label to keep it on (Properties, Outliner or Measure panel).
          </div>
          <label className="mb-3 flex cursor-pointer items-center gap-2 text-[var(--text)]">
            <input type="checkbox" checked={settings.pointLetters} onChange={(e) => set({ pointLetters: e.target.checked })} />
            Always show point letters (A, B, C…)
          </label>
          <Heading>Labels contain</Heading>
          <div className="seg mb-3">
            {(
              [
                ['name', 'Letters'],
                ['measure', 'Letters + values'],
                ['full', 'Everything']
              ] as const
            ).map(([k, l]) => (
              <button key={k} className={`whitespace-nowrap ${settings.measureLabels === k ? 'on' : ''}`} onClick={() => set({ measureLabels: k })}>
                {l}
              </button>
            ))}
          </div>
          <Heading>Vector notation</Heading>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="seg">
              {(
                [
                  ['arrow', 'A⃗'],
                  ['bold', 'A bold'],
                  ['underline', 'A̲']
                ] as const
              ).map(([k, l]) => (
                <button key={k} className={`whitespace-nowrap ${settings.vectorNotation === k ? 'on' : ''}`} onClick={() => set({ vectorNotation: k })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="seg">
              {(
                [
                  ['ijk', '3î + 4ĵ'],
                  ['pair', '(3, 4)'],
                  ['column', 'column'],
                  ['polar', '5 ∠ 53°']
                ] as const
              ).map(([k, l]) => (
                <button key={k} className={`whitespace-nowrap ${settings.componentForm === k ? 'on' : ''}`} onClick={() => set({ componentForm: k })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[var(--text-dim)]">Directions</span>
            <div className="seg">
              <button className={`whitespace-nowrap ${settings.directionStyle === 'standard' ? 'on' : ''}`} onClick={() => set({ directionStyle: 'standard' })}>
                From +x axis
              </button>
              <button className={`whitespace-nowrap ${settings.directionStyle === 'bearing' ? 'on' : ''}`} onClick={() => set({ directionStyle: 'bearing' })} title="Compass style, e.g. N 30° E">
                Compass bearing
              </button>
            </div>
          </div>
          <Heading>Window</Heading>
          {zoomable && (
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[var(--text)]">Text size</span>
              <div className="seg">
                <button onClick={() => setZoom(zoom - 0.5)} disabled={zoom <= ZOOM_MIN} title="Smaller (Ctrl and −)">
                  −
                </button>
                <button onClick={() => setZoom(0)} title="Normal size (Ctrl and 0)">
                  {zoomPercent(zoom)} %
                </button>
                <button onClick={() => setZoom(zoom + 0.5)} disabled={zoom >= ZOOM_MAX} title="Bigger (Ctrl and +)">
                  +
                </button>
              </div>
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-[var(--text)]">
            <input type="checkbox" checked={graphicsInfo} onChange={(e) => setGraphicsInfo(e.target.checked)} />
            Show graphics info on the drawing (WebGPU, quality, fps)
          </label>
        </div>
      )}
    </div>
  )
}

export function TopBar() {
  // Selectors, not the whole store: the bar used to re-render on every drag of every point.
  const filePath = useScene((s) => s.filePath)
  const dirty = useScene((s) => s.dirty)
  const showGrid = useScene((s) => s.settings.showGrid)
  const showAxes = useScene((s) => s.settings.showAxes)
  const snap = useScene((s) => s.settings.snap)
  const theme = useTheme((t) => t.theme)
  const openPanels = useOpenPanels((s) => s.open)
  const mode = useApp((a) => a.mode)
  const setSearchOpen = useApp((a) => a.setSearchOpen)
  const [barRef, width] = useContainerWidth()
  const density = barDensity(width)
  const title = filePath ? filePath.split(/[\\/]/).pop() : 'untitled'
  const ready = MODES.filter((m) => m.ready)
  const later = MODES.filter((m) => !m.ready)
  const current = modeById(mode)
  const s = scene
  return (
    <div ref={barRef} className={`topbar ${density}`}>
      <div className="mr-2 flex items-center gap-2 pl-1 font-semibold tracking-wide text-[var(--text-strong)]">
        {/* The logo sweeps between two series colours, so it deepens in the light theme the way the charts do. */}
        <span className="inline-block h-4 w-4 rounded-sm" style={{ background: 'linear-gradient(135deg, var(--series-1), var(--series-5))' }} />
        {density !== 'tight' && 'PhysLab'}
      </div>
      <Menu
        label="File"
        items={[
          { label: 'New', sc: 'Ctrl+N', run: newProject },
          { label: 'Open…', sc: 'Ctrl+O', run: openProject },
          '-',
          { label: 'Save', sc: 'Ctrl+S', run: () => saveProject(false) },
          { label: 'Save As…', sc: 'Ctrl+Shift+S', run: () => saveProject(true) },
          '-',
          { label: 'Export the drawing as an image…', run: () => void saveViewportImage(2) }
        ]}
      />
      <Menu
        label="Edit"
        items={[
          { label: 'Undo', sc: 'Ctrl+Z', run: () => (mode === 'sandbox' ? useSandbox.getState().undo() : s().undo()) },
          { label: 'Redo', sc: 'Ctrl+Y', run: () => (mode === 'sandbox' ? useSandbox.getState().redo() : s().redo()) },
          '-',
          {
            label: 'Delete selected',
            sc: 'Del',
            run: () => {
              if (mode !== 'sandbox') return s().removeObjects(s().selection)
              const sb = useSandbox.getState()
              if (sb.selection) sb.removeBody(sb.selection)
            }
          },
          { label: 'Select all', sc: 'Ctrl+A', run: () => s().select(visibleOrder(s().order, s().objects, s().activeSpace)) }
        ]}
      />
      <Menu
        label="View"
        items={[
          { label: '2D view', sc: '3', run: () => s().setViewMode('2d') },
          { label: '3D view', sc: '3', run: () => s().setViewMode('3d') },
          { label: 'Reset camera', sc: 'Home', run: resetCamera },
          '-',
          { label: `Grid: ${showGrid ? 'on' : 'off'}`, run: () => s().setSettings({ showGrid: !showGrid }) },
          { label: `Axes: ${showAxes ? 'on' : 'off'}`, run: () => s().setSettings({ showAxes: !showAxes }) },
          { label: `Snapping: ${snap ? 'on' : 'off'}`, sc: 'hold Alt', run: () => s().setSettings({ snap: !snap }) },
          '-',
          { label: theme === 'dark' ? 'Light theme (for projectors)' : 'Dark theme', run: () => useTheme.getState().toggle() },
          '-',
          // A panel row opens a closed panel and closes an open one. Closing used to be a
          // one-way door, then opening was: now the row does both.
          ...PANEL_LIST.map((p) => {
            const isOpen = openPanels.includes(p.id)
            return { label: p.title, sc: isOpen ? '✓ open' : 'closed', on: isOpen, run: () => togglePanel(p.id) }
          }),
          '-',
          { label: 'Reset the panel layout (reloads the window)', run: resetLayout }
        ]}
      />

      <Menu
        label="Help"
        items={[
          { label: 'Take the tour', run: () => useTour.getState().start() },
          { label: 'Practice tasks', run: () => useTour.getState().setMissions(true) },
          { label: 'Keyboard and mouse', run: () => useTour.getState().setShortcuts(true) },
          '-',
          // Which build is this? Handy after installing an update over an older one.
          { label: `PhysLab ${__APP_VERSION__}`, run: () => {}, disabled: true }
        ]}
      />

      <div className="mx-2 h-5 w-px bg-[var(--line-2)]" />
      {/* A real box, not display: contents, so the tour can draw a ring around it. */}
      <div data-tour="modes" className="flex min-w-0 items-center gap-1">
        {density === 'full' ? (
          <>
            {ready.map((m) => (
              <button key={m.id} className={`mode-tab ${mode === m.id ? 'on' : ''}`} title={m.description} onClick={() => enterMode(m.id)}>
                {m.label}
              </button>
            ))}
            <Menu
              label={
                <span className="flex items-center gap-1 text-[var(--text-dim)]">
                  More modes <ChevronDown size={13} />
                </span>
              }
              items={later.map((m) => ({ label: `${m.label}  (coming soon)`, run: () => {}, disabled: true }))}
            />
          </>
        ) : (
          // Narrow window: one menu holds every mode, with the current one named on the button.
          <Menu
            className="mode-tab on"
            title={current.description}
            label={
              <span className="flex items-center gap-1">
                <span className="text-[var(--text-faint)]">Mode</span> {current.label} <ChevronDown size={13} />
              </span>
            }
            items={[
              ...ready.map((m) => ({ label: m.label, sc: mode === m.id ? '●' : '', on: mode === m.id, run: () => enterMode(m.id) })),
              '-' as const,
              ...later.map((m) => ({ label: `${m.label}  (coming soon)`, run: () => {}, disabled: true }))
            ]}
          />
        )}
      </div>

      <div className="flex-1" />
      <button data-tour="search" className="menu-btn flex items-center gap-2 text-[var(--text-dim)]" onClick={() => setSearchOpen(true)} title="Search everything (Ctrl+K)">
        <Search size={14} />
        {density !== 'tight' && (
          <>
            Search <kbd className="rounded border border-[var(--line)] bg-[var(--bg-3)] px-1 text-fine text-[var(--text-dim)]">Ctrl K</kbd>
          </>
        )}
      </button>
      <MeasureSettingsMenu density={density} />
      {density !== 'tight' && (
        <span className="ml-2 max-w-[14rem] truncate text-small text-[var(--text-dim)]" title={filePath ?? undefined}>
          {title}
          {dirty ? ' •' : ''}
        </span>
      )}
    </div>
  )
}

const toolLabel = (id: string): string | undefined => TOOLS.find((t) => t.id === id)?.label

export function ToolShelf() {
  const mode = useApp((a) => a.mode)
  const tool = useScene((s) => s.tool)
  const setTool = useScene((s) => s.setTool)
  const [ref, width] = useContainerWidth()
  const def = modeById(mode)
  const shelf = shelfMode(width, def.tools, toolLabel)
  // A mode whose only tool is Move (Sandbox, GPU Lab, Lab Data) has nothing to offer here, and
  // the empty strip was 40 px taken from the drawing on a small screen.
  if (shelf === 'hidden') return null
  return (
    <div ref={ref} data-tour="tools" className={`toolshelf ${shelf === 'icons' ? 'icons' : ''}`}>
      {def.tools.map((id, i) => {
        if (id === '|') return <div key={i} className="tool-sep" />
        const info = TOOLS.find((t) => t.id === id)!
        return (
          <button key={id} className={`tool ${tool === id ? 'on' : ''}`} onClick={() => setTool(id)} title={`${info.label}${info.key ? ` (${info.key})` : ''}\n${info.hint[0]}`}>
            {ICONS[id]}
            {shelf === 'full' && <span>{info.label}</span>}
          </button>
        )
      })}
      <div className="flex-1" />
      {shelf === 'full' && <span className="hidden truncate pr-2 text-fine text-[var(--text-faint)] xl:inline">{def.description}</span>}
    </div>
  )
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
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
import { MODES, isDrawingMode, modeById, useApp } from './modes'
import { scene, useScene } from '../core/store'
import type { LengthUnit, ToolId } from '../core/types'
import { shelfFitLabel, TOOLS } from '../render/tools'
import { saveViewportImage } from '../render/exportImage'
import { THEMES, THEME_LABELS, useTheme } from './theme'
import { useTour } from './tour/Tour'
import { enterMode, resetLayout } from './layout'
import { PANEL_LIST, togglePanel, useOpenPanels } from './panels'
import { LABEL_SHOW_HELP, LabelShowSwitch } from '../ui/LabelControls'
import { ToolCardHost } from '../ui/ToolCard'
import { useToolCard } from '../ui/useToolCard'
import { resetCamera } from '../render/viewState'
import { useSandbox } from '../sim/store'
import { UNIT_NAMES } from '../math/format'
import { spaceOf, visibleOrder } from '../core/visibility'
import { GRID_STYLES, normaliseGridStyle } from '../render/gridMath'
import { confirmClearDrawing } from './contextActions'
import { modeTabs, type MeasuredModeWidths } from './modeSwitch'
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

/**
 * The mode tabs and the More modes button as the bar draws them, measured in a hidden row that
 * carries their classes (Fix 13). The estimate in modeSwitch.ts is 25–30 % wide at 1440 px and
 * below, so it folded Problem Sets into More modes at 1366 px with room to spare. Measured again
 * whenever `key` changes (the room, the density, the labels) and once the fonts have loaded.
 */
function useModeWidths(key: string): [RefObject<HTMLDivElement | null>, MeasuredModeWidths] {
  const ref = useRef<HTMLDivElement>(null)
  const [widths, setWidths] = useState<MeasuredModeWidths>({})
  useLayoutEffect(() => {
    let live = true
    const measure = () => {
      const row = ref.current?.firstElementChild
      if (!live || !row) return
      // Rounded up, so a tab is never taken as narrower than it draws.
      const ws = Array.from(row.children, (k) => Math.ceil(k.getBoundingClientRect().width))
      const next = { tabs: ws.slice(0, -1), more: ws[ws.length - 1] ?? 0 }
      setWidths((old) => (old.more === next.more && old.tabs?.join() === next.tabs.join() ? old : next))
    }
    measure()
    // A label measured in the fallback font is narrower or wider than in Segoe UI.
    void document.fonts?.ready.then(measure)
    return () => {
      live = false
    }
  }, [key])
  return [ref, widths]
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
  const theme = useTheme((t) => t.theme)
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
          {/* Four theme names are wider than the popover, and a wrapped segment would put each name on
              its own line (.menu button is full width), so the segment is a two-by-two grid under its label. */}
          <div className="mb-2 flex flex-col items-start gap-1">
            <span className="text-[var(--text)]">Theme</span>
            <div className="seg grid grid-cols-2">
              {THEMES.map((id) => (
                <button key={id} className={`justify-center ${theme === id ? 'on' : ''}`} onClick={() => useTheme.getState().set(id)} title={id === 'light' ? 'For bright rooms and projectors' : undefined}>
                  {THEME_LABELS[id]}
                </button>
              ))}
            </div>
          </div>
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
  const gridStyle = useScene((s) => normaliseGridStyle(s.settings.gridStyle))
  const showAxes = useScene((s) => s.settings.showAxes)
  const snap = useScene((s) => s.settings.snap)
  const angleMarks = useScene((s) => s.settings.showAngleMarks)
  const theme = useTheme((t) => t.theme)
  const openPanels = useOpenPanels((s) => s.open)
  const mode = useApp((a) => a.mode)
  const setSearchOpen = useApp((a) => a.setSearchOpen)
  const [barRef, width] = useContainerWidth()
  const density = barDensity(width)
  const title = filePath ? filePath.split(/[\\/]/).pop() : 'untitled'
  const ready = MODES.filter((m) => m.ready)
  const later = MODES.filter((m) => !m.ready)
  const [modesRef, modesWidth] = useContainerWidth()
  const [measureRef, measured] = useModeWidths(`${modesWidth}|${density}|${ready.map((m) => m.label).join()}`)
  const split = modeTabs(modesWidth, ready.map((m) => m.label), ready.findIndex((m) => m.id === mode), measured)
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
          { label: 'Select all', sc: 'Ctrl+A', run: () => s().select(visibleOrder(s().order, s().objects, s().activeSpace)) },
          '-',
          // One undo step, and only this drawing: the other modes keep what they have. Greyed
          // where no drawing is open, the same rule as the 2D/3D rows below.
          { label: 'Delete everything on this drawing…', disabled: spaceOf(mode) === null, run: () => confirmClearDrawing() }
        ]}
      />
      <Menu
        label="View"
        items={[
          // Greyed where the drawing is not shown (Sandbox, GPU Lab), the same rule as the key.
          { label: '2D view', sc: '3', disabled: !isDrawingMode(mode), run: () => s().setViewMode('2d') },
          { label: '3D view', sc: '3', disabled: !isDrawingMode(mode), run: () => s().setViewMode('3d') },
          { label: 'Reset camera', sc: 'Home', run: resetCamera },
          '-',
          // One row per grid style plus Off, ticked on the current one, like the themes below. The
          // tick is the `sc` text: `on` alone has no menu style, and a View menu with five Grid
          // rows and no mark on any of them could not say which grid was showing. A label with a
          // description after a dash ("Polar — circles and angles") keeps only its name here:
          // the menu is narrow and the long form wrapped onto two lines.
          ...GRID_STYLES.map((g) => {
            const current = showGrid && gridStyle === g.id
            return { label: `Grid: ${g.label.split(' — ')[0].toLowerCase()}`, sc: current ? '✓' : undefined, on: current, run: () => s().setSettings({ showGrid: true, gridStyle: g.id }) }
          }),
          { label: 'Grid: off', sc: showGrid ? undefined : '✓', on: !showGrid, run: () => s().setSettings({ showGrid: false }) },
          // Ticked like the grid rows above: the same word in the grid picker and the right-click menu.
          { label: 'Axes', sc: showAxes ? '✓' : undefined, on: showAxes, run: () => s().setSettings({ showAxes: !showAxes }) },
          { label: `Snapping: ${snap ? 'on' : 'off'}`, sc: 'hold Alt', run: () => s().setSettings({ snap: !snap }) },
          { label: `Angle marks: ${angleMarks ? 'shown' : 'hidden'}`, run: () => s().setSettings({ showAngleMarks: !angleMarks }) },
          '-',
          // One row per theme, ticked on the current one, so a third theme is a choice and not a
          // guess at what the next press of a toggle would do.
          ...THEMES.map((id) => ({ label: `${THEME_LABELS[id]} theme${id === 'light' ? ' (for projectors)' : ''}`, sc: theme === id ? '✓' : undefined, on: theme === id, run: () => useTheme.getState().set(id) })),
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
      {/* A real box, not display: contents, so the tour can draw a ring around it. It takes the
          room the bar has left, and modeTabs (modeSwitch.ts) decides from that how many modes are
          tabs; the rest sit in More modes. One design at every width — the bar used to swap its
          tabs for a "Mode" dropdown below 1500 px (Fix 13). */}
      <div ref={modesRef} data-tour="modes" className="relative flex min-w-0 flex-1 items-center gap-1">
        <div ref={measureRef} className="mode-measure" aria-hidden="true">
          <div>
            {ready.map((m) => (
              <button key={m.id} type="button" tabIndex={-1} className="mode-tab">
                {m.label}
              </button>
            ))}
            <button type="button" tabIndex={-1} className="menu-btn">
              <span className="flex items-center gap-1 whitespace-nowrap">
                More modes <ChevronDown size={13} />
              </span>
            </button>
          </div>
        </div>
        {split.tabs.map((i) => {
          const m = ready[i]
          return (
            <button key={m.id} className={`mode-tab shrink-0 ${mode === m.id ? 'on' : ''}`} title={m.description} aria-current={mode === m.id ? 'page' : undefined} onClick={() => enterMode(m.id)}>
              {m.label}
            </button>
          )
        })}
        <Menu
          label={
            <span className="flex items-center gap-1 whitespace-nowrap text-[var(--text-dim)]">
              More modes <ChevronDown size={13} />
            </span>
          }
          items={[
            ...split.more.map((i) => ({ label: ready[i].label, run: () => enterMode(ready[i].id) })),
            ...(split.more.length ? ['-' as const] : []),
            ...later.map((m) => ({ label: `${m.label}  (coming soon)`, run: () => {}, disabled: true }))
          ]}
        />
      </div>

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

export function ToolShelf() {
  const mode = useApp((a) => a.mode)
  const tool = useScene((s) => s.tool)
  const setTool = useScene((s) => s.setTool)
  const [ref, width] = useContainerWidth()
  const def = modeById(mode)
  const shelf = shelfMode(width, def.tools, shelfFitLabel)
  // A mode whose only tool is Move (Sandbox, GPU Lab, Lab Data) has nothing to offer here, and
  // the empty strip was 40 px taken from the drawing on a small screen. The card host stays: it
  // draws through a portal, takes no room, and the Sandbox's own buttons will ask it for cards.
  if (shelf === 'hidden') return <ToolCardHost />
  return (
    <>
      <ToolCardHost />
      <div ref={ref} data-tour="tools" className={`toolshelf ${shelf === 'icons' ? 'icons' : ''}`}>
        {def.tools.map((id, i) => {
          if (id === '|') return <div key={i} className="tool-sep" />
          return <ToolButton key={id} id={id} on={tool === id} label={shelf === 'full'} onClick={() => setTool(id)} />
        })}
        <div className="flex-1" />
        {shelf === 'full' && <span className="hidden truncate pr-2 text-fine text-[var(--text-faint)] xl:inline">{def.description}</span>}
      </div>
    </>
  )
}

/** One shelf button. Resting on it opens its card (ui/ToolCard.tsx), which replaced the old title tooltip. */
function ToolButton({ id, on, label, onClick }: { id: ToolId; on: boolean; label: boolean; onClick: () => void }) {
  const info = TOOLS.find((t) => t.id === id)!
  const card = useToolCard(`tool:${id}`)
  return (
    <button className={`tool ${on ? 'on' : ''}`} onClick={onClick} aria-label={label ? undefined : info.label} {...card}>
      {ICONS[id]}
      {label && <span>{info.label}</span>}
    </button>
  )
}

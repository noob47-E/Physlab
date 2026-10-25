import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Box,
  ChevronDown,
  Circle,
  Crosshair,
  Divide,
  Dot,
  Eraser,
  GitCommitHorizontal,
  Layers,
  Minus,
  MousePointer2,
  MoveUpRight,
  PenLine,
  Pentagon,
  Ruler,
  Scissors,
  Settings2,
  Slash,
  Sparkles,
  SquareDashedBottom,
  Triangle,
  Type,
  Waypoints
} from 'lucide-react'
import { newProject, openProject, saveProject } from './files'
import { clampPrecision, scaleFromText, toggleTopMenu, setActiveMenuCloser } from './topBarInputs'
import { useModeWheel } from './modeWheelStore'
import { isDrawingMode, modeById, toolsFor, useApp } from './modes'
import { scene, useScene } from '../core/store'
import type { LengthUnit, ToolId } from '../core/types'
import { shelfFitLabel, TOOLS } from '../render/tools'
import { saveViewportImage } from '../render/exportImage'
import { THEMES, THEME_LABELS, useTheme } from './theme'
import { StartHereChip, useTour } from './tour/Tour'
import { resetLayout } from './layout'
import { PANEL_LIST, togglePanel, useOpenPanels } from './panels'
import { LABEL_SHOW_HELP, LabelShowSwitch } from '../ui/LabelControls'
import { ToolCardHost } from '../ui/ToolCard'
import { SolidsRow } from '../panels/SolidsRow'
import { useToolCard } from '../ui/useToolCard'
import { resetCamera } from '../render/viewState'
import { useSandbox } from '../sim/store'
import { UNIT_NAMES } from '../math/format'
import { spaceOf, visibleOrder } from '../core/visibility'
import { GRID_STYLES, normaliseGridStyle } from '../render/gridMath'
import { confirmClearDrawing } from './contextActions'
import { runHistory } from './undoRoute'
import { barDensity, clampZoom, shelfMode, zoomPercent, ZOOM_MAX, ZOOM_MIN, type BarDensity } from './layoutMath'


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
  delete: <Eraser size={16} />,
  plane: <Layers size={16} />,
  shape: <Pentagon size={16} />,
  solids: <Box size={16} />,
  measure3d: <Ruler size={16} />,
  angle3d: <SquareDashedBottom size={16} />
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
function useContainerWidth(): [(el: HTMLElement | null) => void, number] {
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

type MenuItem = { label: string; sc?: string; run: () => void; disabled?: boolean; on?: boolean } | '-'

function Menu({
  label,
  items,
  title,
  className = '',
  open,
  onToggle,
  onClose
}: {
  label: React.ReactNode
  items: MenuItem[]
  title?: string
  className?: string
  open: boolean
  onToggle: () => void
  onClose: () => void
}) {
  const ref = useOutsideClose(open, onClose)
  return (
    <div ref={ref} className="relative">
      <button className={`menu-btn ${open ? 'open' : ''} ${className}`} title={title} aria-haspopup="menu" aria-expanded={open} onClick={onToggle}>
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
                  onClose()
                  it.run()
                }}
              >
                <span className="whitespace-nowrap">{it.label}</span>
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
function MeasureSettingsMenu({
  density,
  open,
  onToggle,
  onClose
}: {
  density: BarDensity
  open: boolean
  onToggle: () => void
  onClose: () => void
}) {
  const ref = useOutsideClose(open, onClose)
  const settings = useScene((s) => s.settings)
  const set = useScene((s) => s.setSettings)
  const graphicsInfo = useApp((a) => a.graphicsInfo)
  const setGraphicsInfo = useApp((a) => a.setGraphicsInfo)
  const [zoom, setZoom, zoomable] = useZoom()
  const theme = useTheme((t) => t.theme)
  // The box shows what was typed; the stored scale only follows a positive number (see scaleFromText).
  const [scaleText, setScaleText] = useState(String(settings.unitPerSquare))
  const [shownScale, setShownScale] = useState(settings.unitPerSquare)
  if (shownScale !== settings.unitPerSquare) {
    // The scale changed from elsewhere (a Units row in Ctrl+K, a file): show it, unless the box already says it.
    // Adjusted while rendering rather than in an effect, so the box never paints the old number first.
    setShownScale(settings.unitPerSquare)
    if (scaleFromText(scaleText) !== settings.unitPerSquare) setScaleText(String(settings.unitPerSquare))
  }
  const summary = `1 □ = ${settings.unitPerSquare} ${settings.unit === 'unit' ? 'unit' : settings.unit} · ${settings.decimals} ${settings.precisionMode === 'dp' ? 'd.p.' : 's.f.'}`
  return (
    <div ref={ref} className="relative">
      <button className={`menu-btn flex items-center gap-1.5 ${open ? 'open' : ''}`} onClick={onToggle} title={`Units, precision and labels (${summary})`} aria-expanded={open} aria-haspopup="dialog">
        <Settings2 size={14} />
        {density !== 'tight' && <span className="text-[var(--text)]">{summary}</span>}
      </button>
      {open && (
        <div className="menu right-0 left-auto w-[22rem] p-3 pb-5" onKeyDown={(e) => e.stopPropagation()}>
          <Heading>Scale</Heading>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[var(--text)]">1 grid square =</span>
            <input
              className="field num w-16"
              type="text"
              inputMode="decimal"
              aria-label="Length of one grid square"
              value={scaleText}
              onChange={(e) => {
                setScaleText(e.target.value)
                const n = scaleFromText(e.target.value)
                if (n !== null) set({ unitPerSquare: Math.max(1e-9, n) })
              }}
              onBlur={() => setScaleText(String(settings.unitPerSquare))}
            />
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
            <input className="field num w-14" type="number" min={settings.precisionMode === 'sf' ? 1 : 0} max={12} value={settings.decimals} onChange={(e) => set({ decimals: clampPrecision(Number(e.target.value), settings.precisionMode) })} />
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
                  // The arrow is drawn, not typed: a letter plus the combining arrow (U+20D7) has no glyph
                  // in Segoe UI and showed as A and a box. An SVG in currentColor takes the button's on and
                  // off colours in every theme, and em sizes follow the text size. A .seg button is 24 px
                  // high and clips what leaves it, so the arrow sits in the span's own padding, inside the
                  // button, and not above the letter the way a graph label's CSS arrow does. The padding is
                  // the same below, so the letter keeps the baseline of the options beside it.
                  [
                    'arrow',
                    <span className="relative inline-block py-[0.22em] leading-none">
                      A
                      <svg
                        viewBox="0 0 12 5"
                        aria-hidden="true"
                        focusable="false"
                        className="absolute left-1/2 top-0 h-[0.36em] w-[0.9em] -translate-x-1/2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M0.8 2.5H11M8.4 0.7 11 2.5 8.4 4.3" />
                      </svg>
                    </span>
                  ],
                  ['bold', 'A bold'],
                  ['underline', 'A̲']
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  className={`whitespace-nowrap ${settings.vectorNotation === k ? 'on' : ''}`}
                  // Without a name a screen reader would read the arrow button as just "A".
                  aria-label={k === 'arrow' ? 'Arrow over the letter' : undefined}
                  onClick={() => set({ vectorNotation: k })}
                >
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
          <label className="mb-1 flex cursor-pointer items-center gap-2 text-[var(--text)]">
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
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const toggleMenu = useCallback((id: string) => setOpenMenu((cur) => toggleTopMenu(cur, id)), [])
  const closeMenu = useCallback(() => setOpenMenu(null), [])

  useEffect(() => {
    setActiveMenuCloser(() => {
      if (openMenu !== null) {
        setOpenMenu(null)
        return true
      }
      return false
    })
    return () => setActiveMenuCloser(null)
  }, [openMenu])

  const [barRef, width] = useContainerWidth()
  const density = barDensity(width)
  const title = filePath ? filePath.split(/[\\/]/).pop() : 'untitled'
  const s = scene
  return (
    <div ref={barRef} className={`topbar ${density}`}>
      <div className="mr-2 flex items-center gap-2 pl-1 font-semibold tracking-wide text-[var(--text-strong)]">
        {/* The logo sweeps between two series colours, so it deepens in the light theme the way the charts do. */}
        <span className="inline-block h-4 w-4 rounded-sm" style={{ background: 'linear-gradient(135deg, var(--series-1), var(--series-5))' }} />
        {density !== 'tight' && 'PhysLab'}
      </div>
      <button
        type="button"
        className="menu-btn mode-current-pill mr-2 flex items-center gap-1.5 px-2 py-0.5 rounded font-medium text-[var(--text-strong)] hover:bg-[var(--bg-3)] cursor-pointer"
        onClick={() => {
          closeMenu()
          useModeWheel.getState().openWheel()
        }}
        title="Modes (Esc)"
        aria-label="Modes (Esc)"
      >
        <span
          className="w-2.5 h-2.5 rounded-full inline-block"
          style={{ backgroundColor: `var(--mode-${mode === 'shapes' ? 'geometry' : mode})` }}
        />
        <span>{modeById(mode).label}</span>
        <ChevronDown size={13} className="text-[var(--text-dim)]" />
      </button>
      <Menu
        open={openMenu === 'file'}
        onToggle={() => toggleMenu('file')}
        onClose={closeMenu}
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
        open={openMenu === 'edit'}
        onToggle={() => toggleMenu('edit')}
        onClose={closeMenu}
        label="Edit"
        items={[
          // The same history the keys reach: Lab Data used to run the drawing's.
          { label: 'Undo', sc: 'Ctrl+Z', run: () => void runHistory(mode, { menu: 'undo' }) },
          { label: 'Redo', sc: 'Ctrl+Y', run: () => void runHistory(mode, { menu: 'redo' }) },
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
        open={openMenu === 'view'}
        onToggle={() => toggleMenu('view')}
        onClose={closeMenu}
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
        open={openMenu === 'help'}
        onToggle={() => toggleMenu('help')}
        onClose={closeMenu}
        label="Help"
        items={[
          { label: 'Take the tour', run: () => useTour.getState().start() },
          {
            label: 'Start here',
            run: () => {
              useTour.getState().setChipHidden(false)
              useTour.getState().setMissions(true)
            }
          },
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
      <div data-tour="modes" className="flex-1" />

      <button
        type="button"
        onClick={() => togglePanel('ai_copilot')}
        className={`mr-2 flex items-center gap-1.5 px-2.5 py-0.5 rounded font-medium text-small cursor-pointer transition-colors ${
          openPanels.includes('ai_copilot')
            ? 'bg-surface-3 text-accent border border-line'
            : 'bg-surface-1 text-ink-dim hover:text-ink hover:bg-surface-2 border border-line'
        }`}
        title="PhysLab AI Copilot & Cognitive Tutor"
      >
        <Sparkles size={13} className="text-accent" />
        <span>AI Tutor</span>
      </button>

      <StartHereChip />

      <MeasureSettingsMenu
        density={density}
        open={openMenu === 'settings'}
        onToggle={() => toggleMenu('settings')}
        onClose={closeMenu}
      />
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
  const view = useScene((s) => s.viewMode)
  const tools = toolsFor(def, view)
  const shelf = shelfMode(width, tools, shelfFitLabel)
  // 3D-3B: a tool the shelf no longer shows (Plane, after switching to 2-D) gives way to Move.
  useEffect(() => {
    if (!tools.includes(tool)) setTool('select')
  }, [tools, tool, setTool])
  // A mode whose only tool is Move (Sandbox, GPU Lab, Lab Data) has nothing to offer here, and
  // the empty strip was 40 px taken from the drawing on a small screen. The card host stays: it
  // draws through a portal, takes no room, and the Sandbox's own buttons will ask it for cards.
  if (shelf === 'hidden') return <ToolCardHost />
  return (
    <>
      <ToolCardHost />
      <div ref={ref} data-tour="tools" className={`toolshelf ${shelf === 'icons' ? 'icons' : ''}`}>
        {tools.map((id, i) => {
          if (id === '|') return <div key={i} className="tool-sep" />
          return <ToolButton key={id} id={id} on={tool === id} label={shelf === 'full'} onClick={() => setTool(id)} />
        })}
        <div className="flex-1" />
        {shelf === 'full' && <span className="hidden truncate pr-2 text-fine text-[var(--text-faint)] xl:inline">{def.description}</span>}
      </div>
      {/* 3D-3B: the 3D shapes tool's row of solids, under the shelf while the tool is on. */}
      {tool === 'solids' && view === '3d' && <SolidsRow />}
    </>
  )
}

/** One shelf button. Resting on it opens its card (ui/ToolCard.tsx), which replaced the old title tooltip. */
function ToolButton({ id, on, label, onClick }: { id: ToolId; on: boolean; label: boolean; onClick: () => void }) {
  const info = TOOLS.find((t) => t.id === id)!
  const card = useToolCard(`tool:${id}`)
  return (
    <button data-tour={`tool-${id}`} className={`tool ${on ? 'on' : ''}`} onClick={onClick} aria-label={label ? undefined : info.label} {...card}>
      {ICONS[id]}
      {label && <span>{info.label}</span>}
    </button>
  )
}

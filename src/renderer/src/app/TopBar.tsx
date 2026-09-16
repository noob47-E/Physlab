import { useEffect, useRef, useState } from 'react'
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
import { MODES, modeById, useApp, type ModeId } from './modes'
import { scene, useScene } from '../core/store'
import type { LengthUnit, ToolId } from '../core/types'
import { TOOLS } from '../render/tools'
import { saveViewportImage } from '../render/exportImage'
import { useTheme } from './theme'
import { resetLayout } from './App'
import { LABEL_SHOW_HELP, LabelShowSwitch } from '../ui/LabelControls'
import { resetCamera } from '../render/viewState'
import { useParticleLab } from '../render/GpuParticles'
import { QUALITY, qualityNow } from '../render/renderer'
import { UNIT_NAMES } from '../math/format'

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

/** Switch mode: tool shelf, view and the panel that belongs to the mode. */
export function enterMode(id: ModeId) {
  const m = modeById(id)
  useApp.getState().setMode(id)
  const s = scene()
  useParticleLab.setState(id === 'gpu' ? { enabled: true, count: QUALITY[qualityNow()].particles } : { enabled: false })
  if (m.view) s.setViewMode(m.view)
  if (!m.tools.includes(s.tool)) s.setTool('select')
  if (m.panel) s.requestFocus(m.panel)
  if (!m.ready) s.pushLog({ input: m.label, kind: 'info', text: `${m.label} is coming in the next build stages: ${m.description}` })
}

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open, close])
  return ref
}

function Menu({ label, items }: { label: React.ReactNode; items: ({ label: string; sc?: string; run: () => void; disabled?: boolean } | '-')[] }) {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClose(open, () => setOpen(false))
  return (
    <div ref={ref} className="relative">
      <button className={`menu-btn ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}>
        {label}
      </button>
      {open && (
        <div className="menu">
          {items.map((it, i) =>
            it === '-' ? (
              <hr key={i} />
            ) : (
              <button
                key={it.label}
                className={it.disabled ? 'opacity-45' : ''}
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

/** Units, precision and what every object shows on the drawing. */
function MeasureSettingsMenu() {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClose(open, () => setOpen(false))
  const settings = useScene((s) => s.settings)
  const set = useScene((s) => s.setSettings)
  return (
    <div ref={ref} className="relative">
      <button className={`menu-btn flex items-center gap-1.5 ${open ? 'open' : ''}`} onClick={() => setOpen(!open)} title="Units, precision and labels">
        <Settings2 size={14} />
        <span className="text-zinc-300">
          1 □ = {settings.unitPerSquare} {settings.unit === 'unit' ? 'unit' : settings.unit} · {settings.decimals} {settings.precisionMode === 'dp' ? 'd.p.' : 's.f.'}
        </span>
      </button>
      {open && (
        <div className="menu right-0 left-auto w-[22rem] p-3" onKeyDown={(e) => e.stopPropagation()}>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">Scale</div>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-zinc-300">1 grid square =</span>
            <input className="field num w-16" type="number" min={0} step="any" value={settings.unitPerSquare} onChange={(e) => set({ unitPerSquare: Math.max(1e-9, Number(e.target.value) || 1) })} />
            <select className="field w-28" value={settings.unit} onChange={(e) => set({ unit: e.target.value as LengthUnit })}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {UNIT_NAMES[u]}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">Precision</div>
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
          <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">Show labels on the drawing</div>
          <LabelShowSwitch className="mb-1" />
          <div className="mb-2 text-[11px] leading-snug text-zinc-500">
            {LABEL_SHOW_HELP[settings.labelShow]} Pin a label to keep it on (Properties, Outliner or Measure panel).
          </div>
          <label className="mb-3 flex cursor-pointer items-center gap-2 text-zinc-300">
            <input type="checkbox" checked={settings.pointLetters} onChange={(e) => set({ pointLetters: e.target.checked })} />
            Always show point letters (A, B, C…)
          </label>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">Labels contain</div>
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
          <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">Vector notation</div>
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
            <span className="text-zinc-400">Directions</span>
            <div className="seg">
              <button className={`whitespace-nowrap ${settings.directionStyle === 'standard' ? 'on' : ''}`} onClick={() => set({ directionStyle: 'standard' })}>
                From +x axis
              </button>
              <button className={`whitespace-nowrap ${settings.directionStyle === 'bearing' ? 'on' : ''}`} onClick={() => set({ directionStyle: 'bearing' })} title="Compass style, e.g. N 30° E">
                Compass bearing
              </button>
            </div>
          </div>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">Angles</div>
          <div className="seg">
            <button className={settings.angleUnit === 'deg' ? 'on' : ''} onClick={() => set({ angleUnit: 'deg' })}>
              Degrees
            </button>
            <button className={settings.angleUnit === 'rad' ? 'on' : ''} onClick={() => set({ angleUnit: 'rad' })}>
              Radians
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function TopBar() {
  const s = useScene()
  const theme = useTheme((t) => t.theme)
  const mode = useApp((a) => a.mode)
  const setSearchOpen = useApp((a) => a.setSearchOpen)
  const title = s.filePath ? s.filePath.split(/[\\/]/).pop() : 'untitled'
  const ready = MODES.filter((m) => m.ready)
  const later = MODES.filter((m) => !m.ready)
  return (
    <div className="topbar">
      <div className="mr-2 flex items-center gap-2 pl-1 font-semibold tracking-wide text-white">
        <span className="inline-block h-4 w-4 rounded-sm bg-gradient-to-br from-sky-400 to-fuchsia-500" />
        PhysLab
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
          { label: 'Undo', sc: 'Ctrl+Z', run: s.undo },
          { label: 'Redo', sc: 'Ctrl+Y', run: s.redo },
          '-',
          { label: 'Delete selected', sc: 'Del', run: () => s.removeObjects(s.selection) },
          { label: 'Select all', sc: 'Ctrl+A', run: () => s.select(s.order) }
        ]}
      />
      <Menu
        label="View"
        items={[
          { label: '2D view', sc: 'Tab', run: () => s.setViewMode('2d') },
          { label: '3D view', sc: 'Tab', run: () => s.setViewMode('3d') },
          { label: 'Reset camera', sc: 'Home', run: resetCamera },
          '-',
          { label: `Grid: ${s.settings.showGrid ? 'on' : 'off'}`, run: () => s.setSettings({ showGrid: !s.settings.showGrid }) },
          { label: `Axes: ${s.settings.showAxes ? 'on' : 'off'}`, run: () => s.setSettings({ showAxes: !s.settings.showAxes }) },
          { label: `Snapping: ${s.settings.snap ? 'on' : 'off'}`, sc: 'hold Alt', run: () => s.setSettings({ snap: !s.settings.snap }) },
          '-',
          { label: theme === 'dark' ? 'Light theme (for projectors)' : 'Dark theme', run: () => useTheme.getState().toggle() },
          { label: 'Reset the panel layout', run: resetLayout }
        ]}
      />

      <div className="mx-2 h-5 w-px bg-zinc-700" />
      {ready.map((m) => (
        <button key={m.id} className={`mode-tab ${mode === m.id ? 'on' : ''}`} title={m.description} onClick={() => enterMode(m.id)}>
          {m.label}
        </button>
      ))}
      <Menu
        label={
          <span className="flex items-center gap-1 text-zinc-400">
            More modes <ChevronDown size={13} />
          </span>
        }
        items={later.map((m) => ({ label: `${m.label}  (coming soon)`, run: () => enterMode(m.id), disabled: true }))}
      />

      <div className="flex-1" />
      <button className="menu-btn flex items-center gap-2 text-zinc-400" onClick={() => setSearchOpen(true)} title="Search everything (Ctrl+K)">
        <Search size={14} /> Search <kbd className="rounded border border-[var(--line)] bg-[var(--bg-3)] px-1 text-[10px] text-[var(--text-dim)]">Ctrl K</kbd>
      </button>
      <MeasureSettingsMenu />
      <span className="ml-2 text-[12px] text-zinc-400">
        {title}
        {s.dirty ? ' •' : ''}
      </span>
      <div className="seg ml-3">
        <button className={s.settings.angleUnit === 'deg' ? 'on' : ''} onClick={() => s.setSettings({ angleUnit: 'deg' })}>
          DEG
        </button>
        <button className={s.settings.angleUnit === 'rad' ? 'on' : ''} onClick={() => s.setSettings({ angleUnit: 'rad' })}>
          RAD
        </button>
      </div>
    </div>
  )
}

export function ToolShelf() {
  const mode = useApp((a) => a.mode)
  const tool = useScene((s) => s.tool)
  const setTool = useScene((s) => s.setTool)
  return (
    <div className="toolshelf">
      {modeById(mode).tools.map((id, i) => {
        if (id === '|') return <div key={i} className="tool-sep" />
        const info = TOOLS.find((t) => t.id === id)!
        return (
          <button key={id} className={`tool ${tool === id ? 'on' : ''}`} onClick={() => setTool(id)} title={`${info.label}${info.key ? ` (${info.key})` : ''}\n${info.hint[0]}`}>
            {ICONS[id]}
            <span>{info.label}</span>
          </button>
        )
      })}
      <div className="flex-1" />
      <span className="pr-2 text-[11px] text-zinc-500">{modeById(mode).description}</span>
    </div>
  )
}

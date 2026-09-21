import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { MODES, readyModes, useApp } from './modes'
import { enterMode } from './layout'
import { PANEL_LIST, showPanel } from './panels'
import { CATALOG } from './CommandBar'
import { scene } from '../core/store'
import { useTour } from './tour/Tour'
import type { LengthUnit } from '../core/types'
import { TOOLS } from '../render/tools'
import { EXAMPLES, runExample } from '../panels/Examples'
import { useCalc, type CalcMode } from '../calc/calcStore'
import { UNIT_NAMES } from '../math/format'
import { GRID_STYLES } from '../render/gridMath'
import { confirmClearDrawing } from './contextActions'
import { ANGLE_MARKS_HELP } from '../ui/LabelControls'

interface Item {
  group: string
  title: string
  hint: string
  run: () => void
}

/** Put text into the command bar and focus it. */
export function fillCommandBar(text: string) {
  window.dispatchEvent(new CustomEvent('physlab:command', { detail: text }))
}

const CALC_MODES: CalcMode[] = ['COMP', 'CMPLX', 'BASE-N', 'MATRIX', 'VECTOR', 'STAT', 'DIST', 'TABLE', 'EQUATION', 'INEQUALITY', 'RATIO', 'SHEET', 'UNITS', 'CONST', 'MEASURE']

function buildItems(): Item[] {
  const items: Item[] = []
  // Only the modes that exist: a "coming soon" row that opened an empty mode was a dead end.
  for (const m of readyModes()) items.push({ group: 'Modes', title: m.label, hint: m.description, run: () => enterMode(m.id) })
  for (const t of TOOLS) {
    items.push({
      group: 'Tools',
      title: t.label,
      hint: t.hint[0],
      run: () => {
        const mode = MODES.find((m) => m.ready && m.tools.includes(t.id))
        if (mode && !MODES.find((m) => m.id === useApp.getState().mode)?.tools.includes(t.id)) enterMode(mode.id)
        scene().setTool(t.id)
      }
    })
  }
  for (const p of PANEL_LIST) items.push({ group: 'Panels', title: p.title, hint: 'Show this panel (and reopen it if it was closed)', run: () => showPanel(p.id) })
  for (const ex of EXAMPLES) items.push({ group: 'Examples', title: ex.title, hint: ex.what, run: () => void runExample(ex) })
  for (const c of CATALOG) items.push({ group: 'Commands', title: c.insert, hint: `${c.desc} · ${c.group}`, run: () => fillCommandBar(c.insert) })
  for (const cm of CALC_MODES) {
    items.push({
      group: 'Calculator',
      title: `Calculator ${cm}`,
      hint: 'Open this calculator mode',
      run: () => {
        enterMode('calculator')
        useCalc.setState({ mode: cm })
      }
    })
  }
  for (const u of ['unit', 'mm', 'cm', 'm', 'km', 'in', 'ft'] as LengthUnit[]) {
    items.push({ group: 'Settings', title: `Units: ${UNIT_NAMES[u]}`, hint: 'Measurements use this unit (1 grid square = 1 of it)', run: () => scene().setSettings({ unit: u, unitPerSquare: 1 }) })
  }
  items.push(
    { group: 'Help', title: 'Take the tour', hint: 'A two-minute look around PhysLab', run: () => useTour.getState().start() },
    { group: 'Help', title: 'Practice tasks', hint: 'Small tasks that tick themselves off', run: () => useTour.getState().setMissions(true) },
    { group: 'Help', title: 'Keyboard and mouse', hint: 'Every shortcut in one list', run: () => useTour.getState().setShortcuts(true) },
    { group: 'Settings', title: 'Labels: always show', hint: 'Every label stays on the drawing', run: () => scene().setSettings({ labelShow: 'always' }) },
    { group: 'Settings', title: 'Labels: show on hover', hint: 'Appear when you point at an object, hide when the cursor moves away', run: () => scene().setSettings({ labelShow: 'hover' }) },
    { group: 'Settings', title: 'Labels: hide (side panel only)', hint: 'Values stay in the Measure panel; pinned labels still show', run: () => scene().setSettings({ labelShow: 'never' }) },
    { group: 'Settings', title: 'Labels: letters + values', hint: 'Labels show the letter and measurement', run: () => scene().setSettings({ measureLabels: 'measure' }) },
    { group: 'Settings', title: 'Labels: everything', hint: 'Also components and coordinates', run: () => scene().setSettings({ measureLabels: 'full' }) },
    { group: 'Settings', title: 'Labels: letters only', hint: 'Cleaner drawing', run: () => scene().setSettings({ measureLabels: 'name' }) },
    { group: 'Settings', title: 'Precision: 2 decimal places', hint: '', run: () => scene().setSettings({ precisionMode: 'dp', decimals: 2 }) },
    { group: 'Settings', title: 'Precision: 3 significant figures', hint: '', run: () => scene().setSettings({ precisionMode: 'sf', decimals: 3 }) },
    { group: 'Settings', title: 'Toggle grid', hint: '', run: () => scene().setSettings({ showGrid: !scene().settings.showGrid }) },
    ...GRID_STYLES.map((g) => ({ group: 'Settings', title: `Grid: ${g.label.toLowerCase()}`, hint: g.hint, run: () => scene().setSettings({ showGrid: true, gridStyle: g.id }) })),
    { group: 'Settings', title: 'Grid: off', hint: 'No grid; the axes stay', run: () => scene().setSettings({ showGrid: false }) },
    { group: 'Settings', title: 'Angle marks: show', hint: ANGLE_MARKS_HELP, run: () => scene().setSettings({ showAngleMarks: true }) },
    { group: 'Settings', title: 'Angle marks: hide', hint: ANGLE_MARKS_HELP, run: () => scene().setSettings({ showAngleMarks: false }) },
    { group: 'Edit', title: 'Delete everything on this drawing…', hint: 'Asks first; Undo brings it all back', run: () => confirmClearDrawing() },
    { group: 'Settings', title: 'Toggle snapping', hint: 'Hold Alt while drawing to skip snapping once', run: () => scene().setSettings({ snap: !scene().settings.snap }) },
    { group: 'Settings', title: 'Angles in degrees', hint: '', run: () => scene().setSettings({ angleUnit: 'deg' }) },
    { group: 'Settings', title: 'Angles in radians', hint: '', run: () => scene().setSettings({ angleUnit: 'rad' }) }
  )
  return items
}

function score(item: Item, q: string): number {
  const t = item.title.toLowerCase()
  const h = item.hint.toLowerCase()
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  let s = 0
  for (const w of words) {
    if (t.startsWith(w)) s += 5
    else if (t.includes(w)) s += 3
    else if (h.includes(w)) s += 1
    else return 0
  }
  return s + (item.group === 'Modes' ? 0.5 : 0)
}

export function SearchPalette() {
  const open = useApp((a) => a.searchOpen)
  const setOpen = useApp((a) => a.setSearchOpen)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const items = useMemo(buildItems, [])

  const results = useMemo(() => {
    if (!q.trim()) return items.filter((i) => i.group === 'Modes' || i.group === 'Examples').slice(0, 14)
    return items
      .map((i) => ({ i, s: score(i, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 30)
      .map((x) => x.i)
  }, [q, items])

  useEffect(() => {
    if (open) {
      setQ('')
      setActive(0)
      setTimeout(() => input.current?.focus(), 0)
    }
  }, [open])

  if (!open) return null
  const choose = (it: Item | undefined) => {
    if (!it) return
    setOpen(false)
    it.run()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-[var(--shadow)] pt-[12vh]" onMouseDown={() => setOpen(false)}>
      <div className="w-[640px] max-w-[92vw] overflow-hidden rounded-xl border border-[var(--line-2)] bg-[var(--menu-bg)] text-[var(--text)] shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-[var(--line)] px-3">
          <Search size={16} className="text-[var(--text-faint)]" />
          <input
            ref={input}
            className="h-11 flex-1 bg-transparent text-lead outline-none"
            placeholder="Search modes, tools, examples, commands, settings…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Escape') setOpen(false)
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(a + 1, results.length - 1))
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(a - 1, 0))
              }
              if (e.key === 'Enter') choose(results[active])
            }}
          />
        </div>
        <div className="max-h-[55vh] overflow-auto py-1">
          {results.length === 0 && <div className="px-4 py-6 text-center text-[var(--text-faint)]">Nothing found.</div>}
          {results.map((r, i) => (
            <button key={`${r.group}-${r.title}`} className={`flex w-full items-baseline gap-3 px-4 py-1.5 text-left ${i === active ? 'bg-[var(--sel-row)]' : 'hover:bg-[var(--bg-3)]'}`} onMouseEnter={() => setActive(i)} onClick={() => choose(r)}>
              <span className="w-20 shrink-0 text-fine uppercase tracking-wide text-[var(--text-faint)]">{r.group}</span>
              <span className="shrink-0 text-[var(--text-strong)]">{r.title}</span>
              <span className="truncate text-small text-[var(--text-faint)]">{r.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

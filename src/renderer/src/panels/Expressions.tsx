// Graphing's own panel: a list of the lines and sliders on the drawing, each one typed and changed in place.
// Every row is a graph or slider in the scene store, so the command bar, the Outliner and Undo all see the
// same thing (P-GCALC GC4; the rules are in expressionRows.ts).

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeOff, Keyboard, Pause, Play, Plus, X } from 'lucide-react'
import { scene, useScene } from '../core/store'
import { replaceGraphEquation } from '../lang/graphEdit'
import { runCommand } from '../lang/commands'
import { NumField, TextField } from '../ui/fields'
import { cssColor } from '../app/theme'
import {
  EXPRESSION_WORDS as W,
  createSlider,
  expressionRows,
  freeParametersFor,
  moveRow,
  rangeEdit,
  rangeOf,
  type ExpressionRow,
  type GraphRow,
  type SliderRow
} from './expressionRows'
import { fmt } from '../math/format'
import { bumpAction } from '../core/actionSignals'
import { Tex } from '../ui/Tex'
import { graphLineToTeX } from './expressionTex'
import { TryOne3D } from './TryOne3D'
import { GraphKeypad } from './GraphKeys'
import { readKeypadOn, writeKeypadOn } from './graphKeypad'
import { sliderPlayClick } from './shellLogic'
import type { NumberObj } from '../core/types'

const graphCount = (): number => Object.values(scene().objects).filter((o) => o.type === 'graph').length

const ICON = 'icon-btn pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]'

export function Expressions() {
  // The store fields, then the rows from them: a selector that built new row objects would hand
  // React a new snapshot on every read and never settle.
  const objects = useScene((s) => s.objects)
  const order = useScene((s) => s.order)
  const ev = useScene((s) => s.ev)
  const rows: ExpressionRow[] = useMemo(() => expressionRows(objects, order, ev), [objects, order, ev])
  // 3D-2: the 'Try one' tiles are for the 3-D view.
  const is3D = useScene((s) => s.viewMode === '3d')
  const [problem, setProblem] = useState<{ id: string; text: string } | null>(null)
  const [draft, setDraft] = useState('')
  const [keypad, setKeypad] = useState(readKeypadOn)

  const offers = useMemo(() => freeParametersFor(draft, ev.scope), [draft, ev.scope])

  const move = (id: string, dir: -1 | 1) => {
    scene().setOrder(moveRow(scene().order, rows.map((r) => r.id), id, dir))
  }

  const addLine = async () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    for (const p of offers) {
      createSlider(p)
    }
    const before = graphCount()
    await runCommand(text)
    // A line the student typed here is a typed graph too: the Start here mission 2 counts it.
    if (graphCount() > before) bumpAction('typedGraphs')
  }

  return (
    <div className="panel flex flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-1">
        <span className="font-semibold text-[var(--text-strong)]">{W.heading}</span>
        <span className="flex-1" />
        <button
          className={`${ICON} ${keypad ? 'text-[var(--accent)]' : ''}`}
          title="Keypad"
          aria-label="Keypad"
          aria-pressed={keypad}
          data-keypad-toggle
          onClick={() => {
            writeKeypadOn(!keypad)
            setKeypad(!keypad)
          }}
        >
          <Keyboard size={14} />
        </button>
        <button className={ICON} title={W.add} aria-label={W.add} onClick={() => document.getElementById('expressions-new')?.focus()}>
          <Plus size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {/* 3D-2: the gallery of graphs in space, in the 3-D view. */}
        {is3D && <TryOne3D />}
        {rows.length === 0 && <div className="px-3 py-2 text-[var(--text-dim)]">{W.empty}</div>}
        {rows.map((r, i) =>
          r.kind === 'slider' ? (
            <SliderRowView
              key={r.id}
              row={r}
              first={i === 0}
              last={i === rows.length - 1}
              onMove={(dir) => move(r.id, dir)}
            />
          ) : (
            <Row
              key={r.id}
              row={r}
              first={i === 0}
              last={i === rows.length - 1}
              problem={problem?.id === r.id ? problem.text : null}
              onProblem={(text) => setProblem(text ? { id: r.id, text } : null)}
              onMove={(dir) => move(r.id, dir)}
            />
          )
        )}
        <div className="px-3 py-2" data-graph-line>
          <input
            id="expressions-new"
            className="field w-full"
            value={draft}
            spellCheck={false}
            placeholder={W.placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') void addLine()
            }}
          />
          {offers.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-small text-[var(--text-dim)]">
              <span>{W.addSlider}</span>
              {offers.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="rounded border border-[var(--line-2)] px-2 py-0.5 font-math font-semibold italic text-[var(--accent)] hover:bg-[var(--bg-3)]"
                  onClick={() => createSlider(name)}
                >
                  {name}
                </button>
              ))}
              {offers.length > 1 && (
                <button
                  type="button"
                  className="rounded border border-[var(--line-2)] px-2 py-0.5 text-fine text-[var(--text-dim)] hover:bg-[var(--bg-3)]"
                  onClick={() => offers.forEach((name) => createSlider(name))}
                >
                  {W.allSliders}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {keypad && <GraphKeypad />}
    </div>
  )
}

function SliderRowView({
  row,
  first,
  last,
  onMove
}: {
  row: SliderRow
  first: boolean
  last: boolean
  onMove: (dir: -1 | 1) => void
}) {
  const obj = useScene((s) => s.objects[row.id]) as NumberObj | undefined
  const update = useScene((s) => s.updateObject)
  const remove = useScene((s) => s.removeObjects)
  const beginGesture = useScene((s) => s.beginGesture)
  const endGesture = useScene((s) => s.endGesture)
  const playing = useScene((s) => s.playing)
  const setPlaying = useScene((s) => s.setPlaying)
  const selected = useScene((s) => s.selection.includes(row.id))

  if (!obj || !obj.slider) return null
  const s = obj.slider
  const value = row.value

  return (
    <div
      className={`border-b border-[var(--line)] px-3 py-1.5 ${selected ? 'bg-[var(--bg-3)] shadow-[inset_3px_0_0_var(--accent)]' : ''}`}
      onKeyDownCapture={(e) => {
        if (!e.altKey) return
        if (e.key === 'ArrowUp' && !first) onMove(-1)
        if (e.key === 'ArrowDown' && !last) onMove(1)
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-3 w-3 shrink-0 rounded-full border border-[var(--line-2)]"
          style={{ background: cssColor(obj), opacity: obj.visible ? 1 : 0.3 }}
        />
        <div className="flex flex-1 items-center gap-1.5 font-math">
          <span className="font-semibold italic text-[var(--text-strong)]">{obj.name}</span>
          <span className="text-[var(--text-dim)]">=</span>
          <span className="font-mono text-small text-[var(--text-strong)]">{fmt(value, 4)}</span>
        </div>
        <button
          className={`${ICON} ${obj.animate ? 'text-[var(--accent)]' : ''}`}
          title="Animate"
          aria-label="Animate"
          onClick={() => {
            const next = sliderPlayClick(!!obj.animate, playing)
            if (next.animate !== !!obj.animate) {
              update(row.id, (d) => {
                if (d.type === 'number') d.animate = next.animate
              })
            }
            if (next.playing !== playing) setPlaying(next.playing)
          }}
        >
          {obj.animate && playing ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <button
          className={ICON}
          title={W.showHide}
          aria-label={W.showHide}
          onClick={() =>
            update(row.id, (d) => {
              d.visible = !d.visible
            })
          }
        >
          {obj.visible ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <button
          className={`${ICON} hover:text-[var(--bad)]`}
          title={W.remove}
          aria-label={W.remove}
          onClick={() => remove([row.id])}
        >
          <X size={13} />
        </button>
      </div>

      <div className="mt-1 flex items-center gap-2">
        <input
          type="range"
          min={s.min}
          max={s.max}
          step={s.step}
          value={value}
          className="min-w-[4rem] flex-1"
          onPointerDown={beginGesture}
          onPointerUp={endGesture}
          onChange={(e) => {
            const v = Number(e.target.value)
            update(row.id, (d) => {
              if (d.type === 'number') {
                d.expr = String(v)
                d.animate = false
              }
            }, false)
          }}
        />
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-fine text-[var(--text-dim)]">
        <span className="flex items-center gap-1">
          <span>min</span>
          <NumField
            className="w-12"
            value={s.min}
            onChange={(v) =>
              update(row.id, (d) => {
                if (d.type === 'number' && d.slider) {
                  d.slider.min = Math.min(v, d.slider.max - (d.slider.step || 0.1))
                  const cur = Number(d.expr)
                  if (cur < d.slider.min) d.expr = String(d.slider.min)
                }
              })
            }
          />
          <span>max</span>
          <NumField
            className="w-12"
            value={s.max}
            onChange={(v) =>
              update(row.id, (d) => {
                if (d.type === 'number' && d.slider) {
                  d.slider.max = Math.max(v, d.slider.min + (d.slider.step || 0.1))
                  const cur = Number(d.expr)
                  if (cur > d.slider.max) d.expr = String(d.slider.max)
                }
              })
            }
          />
          <span>step</span>
          <NumField
            className="w-12"
            value={s.step}
            decimals={2}
            onChange={(v) =>
              update(row.id, (d) => {
                if (d.type === 'number' && d.slider) {
                  d.slider.step = Math.max(0.01, v)
                }
              })
            }
          />
        </span>
        <span className="flex items-center gap-0.5">
          <button className={ICON} title="Move up" aria-label="Move up" disabled={first} onClick={() => onMove(-1)}>
            <ArrowUp size={12} />
          </button>
          <button className={ICON} title="Move down" aria-label="Move down" disabled={last} onClick={() => onMove(1)}>
            <ArrowDown size={12} />
          </button>
        </span>
      </div>
    </div>
  )
}

function Row({
  row,
  first,
  last,
  problem,
  onProblem,
  onMove
}: {
  row: GraphRow
  first: boolean
  last: boolean
  problem: string | null
  onProblem: (text: string | null) => void
  onMove: (dir: -1 | 1) => void
}) {
  const obj = useScene((s) => s.objects[row.id])
  const update = useScene((s) => s.updateObject)
  const remove = useScene((s) => s.removeObjects)
  // Marked when the graph is selected — on the drawing, or by Visualize on a line already drawn.
  const selected = useScene((s) => s.selection.includes(row.id))
  const range = rangeOf(obj)
  const [from, setFrom] = useState(range ? fmt(range.from, 10) : '')
  const [to, setTo] = useState(range ? fmt(range.to, 10) : '')
  // A line not being edited is shown typeset; clicking it opens the text box with a live preview.
  const [editing, setEditing] = useState(false)
  const [live, setLive] = useState(row.source)
  // The boxes follow the line: a range typed into the equation, an edit that drops it, Undo or Redo
  // must not leave old ends that a blur would quietly apply again (or quietly clear).
  useEffect(() => {
    setFrom(range ? fmt(range.from, 10) : '')
    setTo(range ? fmt(range.to, 10) : '')
    setRangeNote(null)
  }, [range?.from, range?.to, row.source])
  const [rangeNote, setRangeNote] = useState<string | null>(null)

  const commit = async (text: string) => {
    const free = freeParametersFor(text, scene().ev.scope)
    for (const p of free) {
      createSlider(p)
    }
    const r = await replaceGraphEquation(row.id, text)
    onProblem(r.ok ? null : r.reason)
  }

  const applyRange = (a: string, b: string) => {
    const r = rangeEdit(row.source, range, a, b)
    setRangeNote(r.note)
    if (r.line !== null) void commit(r.line)
  }

  return (
    <div
      className={`border-b border-[var(--line)] px-3 py-1.5 ${selected ? 'bg-[var(--bg-3)] shadow-[inset_3px_0_0_var(--accent)]' : ''}`}
      // Capture: the equation and Width fields stop their own key events from bubbling.
      onKeyDownCapture={(e) => {
        if (!e.altKey) return
        if (e.key === 'ArrowUp' && !first) onMove(-1)
        if (e.key === 'ArrowDown' && !last) onMove(1)
      }}
    >
      <div className="flex items-center gap-2">
        {/* The theme-matched colour, so the dot reads on Light as well as on the dark themes. */}
        <span className="h-3 w-3 shrink-0 rounded-full border border-[var(--line-2)]" style={{ background: obj ? cssColor(obj) : row.color, opacity: row.visible ? 1 : 0.3 }} />
        <div className="min-w-0 flex-1" data-graph-line>
          {editing ? (
            <>
              <TextField mono autoFocus value={row.source} onCommit={(v) => void commit(v)} onText={setLive} onLeave={() => setEditing(false)} />
              <LineTex text={live} />
            </>
          ) : (
            <button
              type="button"
              className="field min-h-[44px] w-full overflow-x-auto text-left"
              aria-label={`Edit ${row.source}`}
              onClick={() => {
                setLive(row.source)
                setEditing(true)
              }}
            >
              {problem ? <span className="font-mono">{row.source}</span> : <LineTex text={row.source} plain />}
            </button>
          )}
        </div>
        <button
          className={ICON}
          title={W.showHide}
          aria-label={W.showHide}
          onClick={() =>
            update(row.id, (d) => {
              d.visible = !d.visible
            })
          }
        >
          {row.visible ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <button className={`${ICON} hover:text-[var(--bad)]`} title={W.remove} aria-label={W.remove} onClick={() => remove([row.id])}>
          <X size={13} />
        </button>
      </div>
      {problem && (
        <div role="status" className="mt-0.5 text-small text-[var(--bad)]">
          {problem}
        </div>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-fine text-[var(--text-dim)]">
        <span className="flex items-center gap-1">
          {W.width}
          <NumField
            className="w-14"
            value={row.width}
            decimals={1}
            onChange={(v) =>
              update(row.id, (d) => {
                if (d.type === 'graph') d.width = Math.max(0.5, v)
              })
            }
          />
        </span>
        {(row.explicit || range) && (
          <span className="flex items-center gap-1">
            {W.range}
            {/* Enter applies as leaving the box does (it did nothing, and "Type both ends…" stayed); applying the
                same ends again changes nothing, so Enter and then a blur do not count twice. */}
            <input className="field w-14" value={from} inputMode="decimal" onChange={(e) => setFrom(e.target.value)} onBlur={() => applyRange(from, to)} onKeyDown={(e) => e.key === 'Enter' && applyRange(from, to)} />
            {W.rangeTo}
            <input className="field w-14" value={to} inputMode="decimal" onChange={(e) => setTo(e.target.value)} onBlur={() => applyRange(from, to)} onKeyDown={(e) => e.key === 'Enter' && applyRange(from, to)} />
          </span>
        )}
        {/* Touch has no Alt key: the arrows move the row too. */}
        <span className="flex items-center gap-0.5">
          <button className={ICON} title="Move up" aria-label="Move up" disabled={first} onClick={() => onMove(-1)}>
            <ArrowUp size={12} />
          </button>
          <button className={ICON} title="Move down" aria-label="Move down" disabled={last} onClick={() => onMove(1)}>
            <ArrowDown size={12} />
          </button>
        </span>
      </div>
      {rangeNote && <div className="mt-0.5 text-fine text-[var(--text-faint)]">{rangeNote}</div>}
    </div>
  )
}

/** A graph line typeset; one that does not read shows its plain text (the row's own problem line carries the error words). */
function LineTex({ text, plain = false }: { text: string; plain?: boolean }) {
  const r = useMemo(() => graphLineToTeX(text), [text])
  if (!r.ok) return plain || text.trim() ? <span className="font-mono">{text}</span> : null
  return <Tex tex={r.tex} className={plain ? '' : 'mt-0.5 block text-small text-[var(--text-dim)]'} />
}

// Graphing's own panel: a list of the lines on the drawing, each one typed and changed in place.
// Every row is a graph in the scene store, so the command bar, the Outliner and Undo all see the
// same thing (P-GCALC GC4; the rules are in expressionRows.ts).

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, X } from 'lucide-react'
import { scene, useScene } from '../core/store'
import { replaceGraphEquation } from '../lang/graphEdit'
import { runCommand } from '../lang/commands'
import { NumField, TextField } from '../ui/fields'
import { cssColor } from '../app/theme'
import { EXPRESSION_WORDS as W, expressionRows, moveRow, rangeEdit, rangeOf, type ExpressionRow } from './expressionRows'
import { fmt } from '../math/format'
import { bumpAction } from '../core/actionSignals'

const graphCount = (): number => Object.values(scene().objects).filter((o) => o.type === 'graph').length

const ICON ='icon-btn pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]'

export function Expressions() {
  // The two store fields, then the rows from them: a selector that built new row objects would hand
  // React a new snapshot on every read and never settle.
  const objects = useScene((s) => s.objects)
  const order = useScene((s) => s.order)
  const rows = useMemo(() => expressionRows(objects, order), [objects, order])
  const [problem, setProblem] = useState<{ id: string; text: string } | null>(null)
  const [draft, setDraft] = useState('')

  const move = (id: string, dir: -1 | 1) => {
    scene().setOrder(moveRow(scene().order, rows.map((r) => r.id), id, dir))
  }

  const addLine = async () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
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
        <button className={ICON} title={W.add} aria-label={W.add} onClick={() => document.getElementById('expressions-new')?.focus()}>
          <Plus size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {rows.length === 0 && <div className="px-3 py-2 text-[var(--text-dim)]">{W.empty}</div>}
        {rows.map((r, i) => (
          <Row
            key={r.id}
            row={r}
            first={i === 0}
            last={i === rows.length - 1}
            problem={problem?.id === r.id ? problem.text : null}
            onProblem={(text) => setProblem(text ? { id: r.id, text } : null)}
            onMove={(dir) => move(r.id, dir)}
          />
        ))}
        <div className="px-3 py-2">
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
        </div>
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
  row: ExpressionRow
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
  // The boxes follow the line: a range typed into the equation, an edit that drops it, Undo or Redo
  // must not leave old ends that a blur would quietly apply again (or quietly clear).
  useEffect(() => {
    setFrom(range ? fmt(range.from, 10) : '')
    setTo(range ? fmt(range.to, 10) : '')
    setRangeNote(null)
  }, [range?.from, range?.to, row.source])
  const [rangeNote, setRangeNote] = useState<string | null>(null)

  const commit = async (text: string) => {
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
        <div className="min-w-0 flex-1">
          <TextField mono value={row.source} onCommit={(v) => void commit(v)} />
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

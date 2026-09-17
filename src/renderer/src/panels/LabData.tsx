import { useEffect, useMemo, useState } from 'react'
import { Plus, Sigma, Trash2, X } from 'lucide-react'
import { math, preprocess } from '../math/expr'
import { fmt } from '../math/format'
import { addColumn, addRow, currentTable, removeColumn, removeRow, setCell, setColumn, useLab } from '../lab/labStore'
import { isUsableName, resolveValues } from '../lab/values'
import type { LabColumn } from '../lab/types'

/** A cell that may be empty. Accepts a typed expression ("9.8/2") the way the rest of PhysLab does. */
function Cell({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value === null ? '' : String(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(value === null ? '' : String(value))
  }, [value, focused])
  const commit = () => {
    const raw = text.trim()
    if (!raw) return onChange(null)
    try {
      const v = Number(math.evaluate(preprocess(raw.replace(/−/g, '-'))))
      onChange(Number.isFinite(v) ? v : null)
    } catch {
      setText(value === null ? '' : String(value))
    }
  }
  return (
    <input
      className="field num"
      value={text}
      inputMode="decimal"
      onFocus={(e) => {
        setFocused(true)
        e.target.select()
      }}
      onBlur={() => {
        setFocused(false)
        commit()
      }}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        e.stopPropagation()
      }}
    />
  )
}

function HeaderCell({ col, onPatch, onRemove, canRemove }: { col: LabColumn; onPatch: (p: Partial<LabColumn>) => void; onRemove: () => void; canRemove: boolean }) {
  const [showFormula, setShowFormula] = useState(!!col.formula)
  const badName = !isUsableName(col.name)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <input
          className={`field w-12 px-1 text-center font-semibold italic ${badName ? 'text-amber-300' : ''}`}
          value={col.name}
          title={badName ? 'Use a letter and then letters or numbers, so formulas can refer to it' : 'Name used in formulas and on the graph'}
          onChange={(e) => onPatch({ name: e.target.value })}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <span className="text-zinc-500">/</span>
        <input
          className="field w-12 px-1 text-center"
          value={col.unit}
          placeholder="unit"
          title="Unit, e.g. s or m"
          onChange={(e) => onPatch({ unit: e.target.value })}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <button
          className={`icon-btn ${col.formula ? 'on' : ''}`}
          title="Work this column out from the ones before it"
          onClick={() => {
            setShowFormula((s) => !s)
            if (col.formula) onPatch({ formula: undefined })
          }}
        >
          <Sigma size={13} />
        </button>
        {canRemove && (
          <button className="icon-btn" title="Remove this column" onClick={onRemove}>
            <X size={13} />
          </button>
        )}
      </div>
      {showFormula && (
        <input
          className="field"
          value={col.formula ?? ''}
          placeholder="= t^2"
          title="Use the names of the columns to the left"
          onChange={(e) => onPatch({ formula: e.target.value })}
          onKeyDown={(e) => e.stopPropagation()}
        />
      )}
    </div>
  )
}

export function LabData() {
  const tables = useLab((s) => s.tables)
  const currentId = useLab((s) => s.currentId)
  const update = useLab((s) => s.update)
  const table = useMemo(() => tables.find((t) => t.id === currentId) ?? tables[0], [tables, currentId])
  const resolved = useMemo(() => resolveValues(table), [table])
  const patch = (fn: Parameters<typeof update>[1]) => update(table.id, fn)

  return (
    <div className="panel pb-8">
      <div className="section-title">Lab data</div>
      <div className="px-3 text-zinc-400">
        Type the readings you measured. A column can also be worked out from the others — press{' '}
        <Sigma size={11} className="inline" /> and write something like <code>t^2</code>.
      </div>

      <div className="mt-2 px-3">
        <input
          className="field font-semibold"
          value={table.title}
          placeholder="What was the experiment?"
          onChange={(e) => patch((t) => ({ ...t, title: e.target.value }))}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>

      <div className="mt-3 overflow-x-auto px-3">
        <div
          className="grid min-w-min gap-1"
          style={{ gridTemplateColumns: `28px repeat(${table.columns.length}, minmax(104px, 1fr)) 26px` }}
        >
          <div />
          {table.columns.map((col) => (
            <HeaderCell
              key={col.id}
              col={col}
              canRemove={table.columns.length > 1}
              onPatch={(p) => patch((t) => setColumn(t, col.id, p))}
              onRemove={() => patch((t) => removeColumn(t, col.id))}
            />
          ))}
          <div />

          {table.rows.map((row, r) => (
            <FlatRow key={r}>
              <div className="flex items-center justify-center text-[11px] text-zinc-500">{r + 1}</div>
              {table.columns.map((col, c) =>
                col.formula ? (
                  <div key={col.id} className="field num flex items-center justify-end text-zinc-400" title="Worked out from the other columns">
                    {resolved.values[r]?.[c] === null || resolved.values[r]?.[c] === undefined ? '' : fmt(resolved.values[r][c] as number, 4)}
                  </div>
                ) : (
                  <Cell key={col.id} value={row[c] ?? null} onChange={(v) => patch((t) => setCell(t, r, c, v))} />
                )
              )}
              <button className="icon-btn" title="Remove this row" onClick={() => patch((t) => removeRow(t, r))}>
                <Trash2 size={12} />
              </button>
            </FlatRow>
          ))}
        </div>
      </div>

      {Object.entries(resolved.errors).map(([id, message]) => (
        <div key={id} className="mt-2 px-3 text-red-300">
          {table.columns.find((c) => c.id === id)?.name}: {message}
        </div>
      ))}

      <div className="mt-3 flex flex-wrap gap-2 px-3">
        <button className="btn" onClick={() => patch(addRow)}>
          <Plus size={13} /> Row
        </button>
        <button className="btn" onClick={() => patch((t) => addColumn(t))}>
          <Plus size={13} /> Column
        </button>
      </div>
    </div>
  )
}

/** Keeps the CSS grid flat: a row is just its cells, not a wrapper. */
const FlatRow = ({ children }: { children: React.ReactNode }) => <>{children}</>

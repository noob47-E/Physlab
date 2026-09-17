import { useEffect, useMemo, useState } from 'react'
import { Lightbulb, Plus, Sigma, Trash2, X } from 'lucide-react'
import { math, preprocess } from '../math/expr'
import { fmt } from '../math/format'
import { addColumn, addRow, addUncertainty, removeColumn, removeRow, setCell, setColumn, setPlot, useLab } from '../lab/labStore'
import { columnHeader, headerOf, isUsableName, plotSeries, ratioUnit, resolveValues, uncertaintyIndex } from '../lab/values'
import { betterFit, fitOf, gradientMeaning, gradientRange, MIN_POINTS, pmText, rankFits, type Fit } from '../lab/fit'
import { FIT_LABELS, type FitShape, type LabColumn, type LabTable } from '../lab/types'
import { LabChart, ResidualStrip } from './LabChart'

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

interface HeaderProps {
  table: LabTable
  col: LabColumn
  onPatch: (p: Partial<LabColumn>) => void
  onRemove: () => void
  onUncertainty: () => void
  canRemove: boolean
}

function HeaderCell({ table, col, onPatch, onRemove, onUncertainty, canRemove }: HeaderProps) {
  const [showFormula, setShowFormula] = useState(!!col.formula)
  const badName = !isUsableName(col.name)
  // A ± column is named, measured and removed with the column it belongs to, so it is shown as a
  // caption rather than two more boxes to fill in.
  const isError = !!col.uncertaintyFor
  const hasError = uncertaintyIndex(table, col.id) >= 0

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {isError ? (
          <span className="flex-1 truncate px-1 text-center font-semibold italic text-zinc-400" title="How uncertain each reading of that column is">
            {columnHeader(table, col)}
          </span>
        ) : (
          <>
            <input
              className={`field w-12 px-1 text-center font-semibold italic ${badName ? 'text-amber-300' : ''}`}
              value={col.name}
              title={badName ? 'Use a letter, then letters or numbers, so formulas can refer to it' : 'Name used in formulas and on the graph'}
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
          </>
        )}
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
        {!isError && !hasError && (
          <button className="icon-btn" title="Add a ± column: how uncertain each reading is" onClick={onUncertainty}>
            <span className="text-[13px] leading-none">±</span>
          </button>
        )}
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
          placeholder={isError ? '= 0.005 * t' : '= t^2'}
          title="Use the names of the columns to the left"
          onChange={(e) => onPatch({ formula: e.target.value })}
          onKeyDown={(e) => e.stopPropagation()}
        />
      )}
    </div>
  )
}

/** The fitted shape written out with the student's own column names and numbers. */
function equationText(fit: Fit, y: string, x: string): string {
  const n = (v: number) => fmt(v, 4)
  const { coef: c } = fit
  switch (fit.shape) {
    case 'linear':
      return `${y} = ${n(c.b)} ${x} ${c.a < 0 ? '−' : '+'} ${n(Math.abs(c.a))}`
    case 'quadratic':
      return `${y} = ${n(c.c)} ${x}² ${c.b < 0 ? '−' : '+'} ${n(Math.abs(c.b))} ${x} ${c.a < 0 ? '−' : '+'} ${n(Math.abs(c.a))}`
    case 'log':
      return `${y} = ${n(c.a)} ${c.b < 0 ? '−' : '+'} ${n(Math.abs(c.b))} ln ${x}`
    case 'exp':
      return `${y} = ${n(c.a)} e^(${n(c.b)} ${x})`
    case 'power':
      return `${y} = ${n(c.a)} ${x}^${n(c.b)}`
    case 'inverse':
      return `${y} = ${n(c.a)} ${c.b < 0 ? '−' : '+'} ${n(Math.abs(c.b))}/${x}`
  }
}

export function LabData() {
  const tables = useLab((s) => s.tables)
  const currentId = useLab((s) => s.currentId)
  const update = useLab((s) => s.update)
  const table = useMemo(() => tables.find((t) => t.id === currentId) ?? tables[0], [tables, currentId])
  const resolved = useMemo(() => resolveValues(table), [table])
  const patch = (fn: Parameters<typeof update>[1]) => update(table.id, fn)
  const [showResiduals, setShowResiduals] = useState(false)

  const series = useMemo(() => plotSeries(table, resolved), [table, resolved])
  const { xs, ys } = series
  const fit = useMemo(() => fitOf(xs, ys, table.plot.fit), [xs, ys, table.plot.fit])
  const ranked = useMemo(() => rankFits(xs, ys), [xs, ys])
  const better = useMemo(() => betterFit(fit, ranked), [fit, ranked])
  // Once there are error bars, the gradient's ± comes from them rather than from the scatter: that
  // is the steepest-and-shallowest-line method a practical is marked with.
  const bars = useMemo(() => gradientRange(xs, ys, series.xErr, series.yErr), [xs, ys, series])

  const xCol = table.columns.find((c) => c.id === table.plot.x)
  const yCol = table.columns.find((c) => c.id === table.plot.y)
  const slopeUnit = xCol && yCol ? ratioUnit(yCol.unit, xCol.unit) : ''
  const meaning = xCol && yCol ? gradientMeaning(yCol.name, xCol.name) : null
  // A ± column is not a quantity in its own right, so it is not offered as something to plot.
  const plottable = table.columns.filter((c) => !c.uncertaintyFor)

  return (
    <div className="panel pb-8">
      <div className="section-title">Lab data</div>
      <div className="px-3 text-zinc-400">
        Type the readings you measured. A column can also be worked out from the others — press{' '}
        <Sigma size={11} className="inline" /> and write something like <code>t^2</code>. Press ± to say how uncertain a
        reading is.
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
        <div className="grid min-w-min gap-1" style={{ gridTemplateColumns: `28px repeat(${table.columns.length}, minmax(104px, 1fr)) 26px` }}>
          <div />
          {table.columns.map((col) => (
            <HeaderCell
              key={col.id}
              table={table}
              col={col}
              canRemove={table.columns.length > 1}
              onPatch={(p) => patch((t) => setColumn(t, col.id, p))}
              onRemove={() => patch((t) => removeColumn(t, col.id))}
              onUncertainty={() => patch((t) => addUncertainty(t, col.id))}
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

      {/* ---------------------------------------------------------------- graph */}
      <div className="section-title mt-4">Graph</div>
      <div className="flex flex-wrap items-center gap-2 px-3">
        <span className="text-zinc-500">Plot</span>
        <select className="field w-auto" value={table.plot.y} onChange={(e) => patch((t) => setPlot(t, { y: e.target.value }))}>
          {plottable.map((c) => (
            <option key={c.id} value={c.id}>
              {headerOf(c)}
            </option>
          ))}
        </select>
        <span className="text-zinc-500">against</span>
        <select className="field w-auto" value={table.plot.x} onChange={(e) => patch((t) => setPlot(t, { x: e.target.value }))}>
          {plottable.map((c) => (
            <option key={c.id} value={c.id}>
              {headerOf(c)}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-2 px-3">
        <select className="field" value={table.plot.fit} onChange={(e) => patch((t) => setPlot(t, { fit: e.target.value as FitShape }))}>
          {Object.entries(FIT_LABELS).map(([shape, label]) => (
            <option key={shape} value={shape}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-2 px-1">
        <LabChart
          xs={xs}
          ys={ys}
          fit={fit}
          xErr={series.xErr}
          yErr={series.yErr}
          xLabel={xCol ? headerOf(xCol) : 'x'}
          yLabel={yCol ? headerOf(yCol) : 'y'}
        />
      </div>

      {xs.length < MIN_POINTS ? (
        <div className="px-3 text-zinc-500">Fill in at least {MIN_POINTS} rows to draw a line through the readings.</div>
      ) : fit ? (
        <div className="card mx-3 mt-2 border-amber-400/40 bg-amber-400/5 p-3">
          <div className="text-[15px] text-white">{equationText(fit, yCol?.name ?? 'y', xCol?.name ?? 'x')}</div>
          <div className="mt-1 text-zinc-400">
            r² = {fmt(fit.r2, 4)}
            {fit.r2 > 0.98 ? ' — the readings sit very close to this line.' : fit.r2 < 0.9 ? ' — the readings are scattered; check for a mistake, or try another shape.' : ''}
          </div>
          {fit.slope !== undefined && (
            <div className="mt-2">
              <span className="text-zinc-400">gradient = </span>
              <span className="text-[15px] font-semibold text-white">
                {pmText(fit.slope, bars ? bars.half : fit.slopeError)} {slopeUnit}
              </span>
              {bars ? (
                <div className="mt-1 text-zinc-500">
                  From your error bars: the steepest line through them gives {fmt(bars.max, 4)}, the shallowest {fmt(bars.min, 4)}, and half
                  the difference is the ±.
                </div>
              ) : (
                fit.slopeError !== undefined &&
                fit.slopeError > Math.abs(fit.slope) * 1e-9 && (
                  <div className="mt-1 text-zinc-500">The ± is how far the line could tilt and still pass through readings this scattered.</div>
                )
              )}
              {meaning && <div className="mt-1 text-emerald-300">{meaning}</div>}
            </div>
          )}
        </div>
      ) : (
        <div className="px-3 text-amber-300">This shape cannot be fitted to these readings — a logarithm or a power needs positive values.</div>
      )}

      {better && (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded-md border border-[var(--line-2)] bg-black/10 px-3 py-2">
          <Lightbulb size={14} className="shrink-0 text-amber-300" />
          <span className="min-w-0 flex-1 text-zinc-300">
            {FIT_LABELS[better.shape].split('   ')[0].toLowerCase()} fits your readings better — r² {fmt(better.r2, 3)} against {fmt(fit?.r2 ?? 0, 3)}.
          </span>
          <button className="btn" onClick={() => patch((t) => setPlot(t, { fit: better.shape }))}>
            Use it
          </button>
        </div>
      )}

      {fit && (
        <div className="mt-3 px-3">
          <label className="flex items-center gap-2 text-zinc-400">
            <input type="checkbox" checked={showResiduals} onChange={(e) => setShowResiduals(e.target.checked)} />
            Residuals — how far each reading is from the line
          </label>
        </div>
      )}
      {fit && showResiduals && (
        <div className="mt-1 px-1">
          <ResidualStrip xs={xs} fit={fit} xLabel={xCol ? headerOf(xCol) : 'x'} />
        </div>
      )}
    </div>
  )
}

/** Keeps the CSS grid flat: a row is just its cells, not a wrapper. */
const FlatRow = ({ children }: { children: React.ReactNode }) => <>{children}</>

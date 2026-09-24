// Question Author, Variables tab: one row per variable — its name, how it is chosen (a range, a
// list or a formula of the others), its unit and what it stands for — and the ten-variant preview
// underneath, played the way the Practice panel plays it, with a failing row in red and the fix
// PhysLab can see. The formula field and the unit list are shared with the other two tabs.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Wrench, X } from 'lucide-react'
import { useScene } from '../core/store'
import { MathInput, type MathInputHandle } from '../ui/MathInput'
import { NumField } from '../ui/fields'
import { Tex } from '../ui/Tex'
import {
  defaultDef,
  formulaLatex,
  nameLatex,
  nameProblem,
  nextVariableName,
  numberListText,
  parseNumberList,
  previewRows,
  readFormula,
  renameVariable,
  UNIT_GROUPS,
  variableInUse
} from '../questions/authoring'
import { useAuthor } from '../questions/authorStore'
import { formatQuantity } from '../questions/units'
import type { PQQuestion, PQVariable, UnitId, VariableDef } from '../questions/pqjson'

// ---------------------------------------------------------------------------
// Shared fields
// ---------------------------------------------------------------------------

/**
 * A row of chips, one per variable: pressing one puts that variable where the caret is. The
 * button never takes the focus (mouse-down is cancelled), so the caret stays where it was.
 */
export function ChipBar({ names, onChip, label = 'Insert' }: { names: readonly string[]; onChip: (name: string) => void; label?: string }) {
  if (names.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 text-small text-ink-faint">
      <span>{label}:</span>
      {names.map((n) => (
        <button
          key={n}
          type="button"
          className="min-h-[44px] min-w-[44px] rounded-full border border-accent/50 bg-accent/10 px-2 font-math text-accent"
          aria-label={`Insert the variable ${n}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChip(n)}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

/**
 * A formula built in the maths field, stored as the question's formula text. The LaTeX is read
 * in the change handler (rule: latexToMath never during render); a formula that cannot be read
 * yet stays in the field with a sentence under it and the question keeps its last good formula.
 */
export function FormulaField({
  expr,
  names,
  free = [],
  onCommit,
  label,
  placeholder,
  chips = true
}: {
  expr: string
  names: readonly string[]
  free?: readonly string[]
  onCommit: (expr: string) => void
  label?: string
  placeholder?: string
  chips?: boolean
}) {
  const ref = useRef<MathInputHandle>(null)
  const [latex, setLatex] = useState(() => formulaLatex(expr, names))
  const [problem, setProblem] = useState<string | null>(null)
  const committed = useRef(expr)
  // A change from outside — a rename, the preview's fix — is shown; the teacher's own typing
  // already is, and setting it again would move the caret.
  useEffect(() => {
    if (expr === committed.current) return
    committed.current = expr
    setLatex(formulaLatex(expr, names))
    setProblem(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- names only matter when the formula itself changed from outside
  }, [expr])
  const change = (next: string) => {
    setLatex(next)
    const r = readFormula(next, names, free)
    if (r.problem !== undefined) {
      setProblem(r.problem)
      return
    }
    setProblem(null)
    if (r.expr !== committed.current) {
      committed.current = r.expr
      onCommit(r.expr)
    }
  }
  return (
    <div className="min-w-0">
      {label && <div className="text-small text-ink-dim">{label}</div>}
      <MathInput ref={ref} value={latex} onChange={change} placeholder={placeholder} size="sm" className="w-full" />
      {chips && <ChipBar names={names} onChip={(n) => ref.current?.insert(nameLatex(n))} />}
      {problem && <div className="mt-0.5 text-small text-bad">{problem}</div>}
    </div>
  )
}

const unitWords = (u: UnitId): string => (u === 'none' ? 'no unit' : u)

/** Every unit PhysLab knows, grouped by what it measures. */
export function UnitSelect({ value, onChange, label = 'Unit', id }: { value: UnitId; onChange: (u: UnitId) => void; label?: string; id: string }) {
  return (
    <label className="flex min-w-0 items-center gap-2" htmlFor={id}>
      <span className="text-small text-ink-dim">{label}</span>
      <select id={id} className="field min-h-[44px] min-w-0" value={value} onChange={(e) => onChange(e.target.value as UnitId)}>
        {UNIT_GROUPS.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.units.map((u) => (
              <option key={u} value={u}>
                {unitWords(u)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

// ---------------------------------------------------------------------------
// One variable
// ---------------------------------------------------------------------------

const KINDS: { kind: VariableDef['kind']; label: string }[] = [
  { kind: 'range', label: 'Range' },
  { kind: 'list', label: 'List' },
  { kind: 'expr', label: 'Formula' }
]

function NameBox({ q, v }: { q: PQQuestion; v: PQVariable }) {
  const [text, setText] = useState(v.name)
  const [problem, setProblem] = useState<string | null>(null)
  // A rename remounts the row (its key carries the name), so the box never needs resetting here.
  const commit = () => {
    const next = text.trim()
    if (next === v.name) {
      setProblem(null)
      return
    }
    const why = nameProblem(
      next,
      q.variables.filter((x) => x !== v).map((x) => x.name)
    )
    if (why) {
      setProblem(why)
      return
    }
    setProblem(null)
    // Its chips and its letter in every formula follow it.
    useAuthor.getState().update((cur) => renameVariable(cur, v.name, next))
  }
  return (
    <div>
      <input
        className="field min-h-[44px] w-24 font-math"
        aria-label="Variable name"
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            setText(v.name)
            setProblem(null)
          }
          e.stopPropagation()
        }}
      />
      {problem && <div className="mt-0.5 max-w-48 text-small text-bad">{problem}</div>}
    </div>
  )
}

function ListBox({ items, onCommit }: { items: number[]; onCommit: (items: number[]) => void }) {
  const shown = numberListText(items)
  const [text, setText] = useState(shown)
  const [problem, setProblem] = useState<string | null>(null)
  const commit = () => {
    const r = parseNumberList(text)
    if (r.problem !== undefined) {
      setProblem(r.problem)
      return
    }
    setProblem(null)
    onCommit(r.items)
  }
  return (
    <div>
      <input
        className="field num min-h-[44px]"
        aria-label="The numbers to choose from, separated by commas"
        value={text}
        placeholder="2, 4, 6"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          e.stopPropagation()
        }}
      />
      {problem && <div className="mt-0.5 text-small text-bad">{problem}</div>}
    </div>
  )
}

function VariableRow({ q, v, i }: { q: PQQuestion; v: PQVariable; i: number }) {
  const { edit } = useAuthor.getState()
  const [confirm, setConfirm] = useState(false)
  const others = q.variables.filter((x) => x !== v).map((x) => x.name)
  const setDef = (def: VariableDef) =>
    edit((d) => {
      d.variables[i].def = def
    })
  const def = v.def
  const n = (x: number): string => formatQuantity(x, 'none', { decimals: 4, precisionMode: 'dp' })
  const removeIt = () =>
    edit((d) => {
      d.variables.splice(i, 1)
    })

  return (
    <div className="card p-2">
      <div className="flex flex-wrap items-start gap-2">
        <NameBox q={q} v={v} />
        <div className="seg" role="radiogroup" aria-label={`How ${v.name} is chosen`}>
          {KINDS.map((k) => (
            <button
              key={k.kind}
              role="radio"
              aria-checked={def.kind === k.kind}
              className={`min-h-[44px] ${def.kind === k.kind ? 'on' : ''}`}
              onClick={() => def.kind !== k.kind && setDef(defaultDef(k.kind))}
            >
              {k.label}
            </button>
          ))}
        </div>
        <UnitSelect
          id={`unit-${v.name}`}
          value={v.unit ?? 'none'}
          onChange={(u) =>
            edit((d) => {
              if (u === 'none') delete d.variables[i].unit
              else d.variables[i].unit = u
            })
          }
        />
        <button
          className="icon-btn ml-auto min-h-[44px] min-w-[44px]"
          aria-label={`Remove ${v.name}`}
          title="Remove"
          onClick={() => (variableInUse(q, v.name) ? setConfirm(true) : removeIt())}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {confirm && (
        <div role="alertdialog" className="mt-2 rounded-md border border-warn/40 bg-warn/5 px-2 py-1 text-ink">
          {v.name} is used in this question; everything that uses it will show as a problem until you change it. Remove it anyway?
          <div className="mt-1 flex gap-2">
            <button className="btn min-h-[44px]" onClick={removeIt}>
              Remove {v.name}
            </button>
            <button className="btn ghost min-h-[44px]" onClick={() => setConfirm(false)}>
              Keep it
            </button>
          </div>
        </div>
      )}

      <div className="mt-2">
        {def.kind === 'range' && (
          <div className="grid grid-cols-3 gap-2">
            {(['from', 'to', 'step'] as const).map((key) => (
              <label key={key} className="block">
                <span className="text-small text-ink-dim">{key === 'from' ? 'From' : key === 'to' ? 'To' : 'In steps of'}</span>
                <NumField
                  className="min-h-[44px]"
                  value={def[key]}
                  onChange={(x) =>
                    edit((d) => {
                      const dd = d.variables[i].def
                      if (dd.kind === 'range') dd[key] = x
                    })
                  }
                />
              </label>
            ))}
            {(def.exclude ?? []).length > 0 && (
              <div className="col-span-3 flex flex-wrap items-center gap-1 text-small text-ink-dim">
                Never drawn:
                {(def.exclude ?? []).map((x, k) => (
                  <button
                    key={k}
                    className="btn ghost min-h-[44px]"
                    aria-label={`Allow ${n(x)} again`}
                    onClick={() =>
                      edit((d) => {
                        const dd = d.variables[i].def
                        if (dd.kind !== 'range' || !dd.exclude) return
                        dd.exclude.splice(k, 1)
                        if (dd.exclude.length === 0) delete dd.exclude
                      })
                    }
                  >
                    {n(x)} <X size={12} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {def.kind === 'list' && <ListBox key={numberListText(def.items)} items={def.items} onCommit={(items) => setDef({ kind: 'list', items })} />}
        {def.kind === 'expr' && <FormulaField expr={def.expr} names={others} placeholder="worked out from the others" onCommit={(expr) => setDef({ kind: 'expr', expr })} />}
      </div>

      <input
        // Keyed on the text so an undo or redo shows the description it brings back; the box
        // commits on blur, so the remount never happens while the teacher is typing.
        key={v.description ?? ''}
        className="field mt-2 min-h-[44px]"
        aria-label={`What ${v.name} stands for`}
        placeholder="What it stands for — only you see this"
        defaultValue={v.description ?? ''}
        onBlur={(e) => {
          const text = e.target.value.trim()
          edit((d) => {
            if (text) d.variables[i].description = text
            else delete d.variables[i].description
          })
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          e.stopPropagation()
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------

export function AuthorVariables({ q }: { q: PQQuestion }) {
  const settings = useScene((s) => s.settings)
  // Played once per change of the question, never per keystroke of an unrelated field.
  const rows = useMemo(() => previewRows(q, settings), [q, settings])
  const bad = rows.filter((r) => r.problems.length > 0).length
  const columns = 1 + q.variables.length + q.parts.length

  return (
    <div className="pb-4">
      <div className="px-3 text-ink-dim">
        Every student gets their own numbers. Give each variable a range or a list to choose from, or a formula that works it out from the others.
      </div>
      <div className="mt-2 space-y-2 px-1">
        {q.variables.map((v, i) => (
          <VariableRow key={`${i}-${v.name}`} q={q} v={v} i={i} />
        ))}
      </div>
      <div className="mt-2 px-3">
        <button
          className="btn min-h-[44px]"
          onClick={() =>
            useAuthor.getState().edit((d) => {
              d.variables.push({ name: nextVariableName(d.variables.map((x) => x.name)), def: defaultDef('range') })
            })
          }
        >
          <Plus size={14} /> Add a variable
        </button>
      </div>

      <div className="section-title mt-3">Ten students’ numbers</div>
      <div className={`px-3 text-small ${bad === 0 ? 'text-ink-dim' : 'text-bad'}`}>
        {bad === 0
          ? 'Every row works out. These are the same ten every time, so a change shows here at once.'
          : `${bad} of the ten ${bad === 1 ? 'row does' : 'rows do'} not work out — see the red ${bad === 1 ? 'row' : 'rows'}.`}
      </div>
      <div className="mt-1 overflow-x-auto px-3">
        <table className="w-full border-collapse text-small tabular-nums" aria-label="Ten students’ numbers">
          <thead>
            <tr className="text-ink-faint">
              <th className="px-1 py-1 text-left font-normal">Row</th>
              {q.variables.map((v) => (
                <th key={v.name} className="px-1 py-1 text-right font-math font-normal">
                  {v.name}
                </th>
              ))}
              {q.parts.map((_, k) => (
                <th key={k} className="px-1 py-1 text-right font-normal">
                  {q.parts.length > 1 ? `Answer ${k + 1}` : 'Answer'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.flatMap((r) => {
              const wrong = r.problems.length > 0
              const cells = [
                <tr key={r.seed} data-problem={wrong || undefined} className={`border-t border-line ${wrong ? 'bg-bad/10 text-bad' : 'text-ink'}`}>
                  <td className="px-1 py-1">{r.seed}</td>
                  {r.values.map((v) => (
                    <td key={v.name} className="whitespace-nowrap px-1 py-1 text-right">
                      {v.text}
                    </td>
                  ))}
                  {q.parts.map((_, k) => (
                    <td key={k} className="whitespace-nowrap px-1 py-1 text-right">
                      {r.answers[k] ? (r.answers[k].text ?? <Tex tex={r.answers[k].tex} />) : <span className="text-ink-faint">not written yet</span>}
                    </td>
                  ))}
                </tr>
              ]
              if (wrong) {
                cells.push(
                  <tr key={`${r.seed}-why`} className="bg-bad/10 text-bad">
                    <td colSpan={columns} className="px-1 pb-2">
                      {r.problems.map((p, k) => (
                        <div key={k}>{p}</div>
                      ))}
                      {r.fix && (
                        <button className="btn mt-1 min-h-[44px]" onClick={() => useAuthor.getState().update(r.fix!.apply)}>
                          <Wrench size={14} /> {r.fix.text}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              }
              return cells
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

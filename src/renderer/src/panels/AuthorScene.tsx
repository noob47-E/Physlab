// Question Author, Question & Scene tab: the statement (sentences with variable chips, and
// formula lines), and what the student can look at — a picture in Graphing, a motion drawn as
// graphs, or an experiment in the Sandbox with the question's push on it. "Show it" runs the
// player's own calls with one preview row's numbers, so the teacher sees what a student will.
// The sentence editor with chips and the maths field with chips are shared with the Solution tab.

import { useEffect, useMemo, useRef, useState } from 'react'
import katex from 'katex'
import { ArrowDown, ArrowUp, Eye, FlaskConical, LineChart, Plus, Trash2 } from 'lucide-react'
import { scene, useScene } from '../core/store'
import { enterMode } from '../app/layout'
import { showPanel } from '../app/panels'
import { MathInput, type MathInputHandle } from '../ui/MathInput'
import { blocksStatement, chipKatex, chipTex, statementBlocks, textPieces, texForEditor, texFromEditor, type StatementBlock } from '../questions/authoring'
import { useAuthor, useAuthorView } from '../questions/authorStore'
import { picturePlan, playQuestion, sandboxPlan, showMotion, showPicture, showSandbox } from '../questions/player'
import { groupedPresets, presetById } from '../sim/presets'
import type { MotionSegment, PQMotion, PQPicture, PQQuestion, PQSandbox } from '../questions/pqjson'
import { ChipBar, FormulaField } from './AuthorVariables'

// ---------------------------------------------------------------------------
// Sentences with chips
// ---------------------------------------------------------------------------

const CHIP_CLASS = 'mx-0.5 inline-block rounded-full border px-1.5 font-math leading-snug'
const chipLook = (known: boolean): string => `${CHIP_CLASS} ${known ? 'border-accent/50 bg-accent/10 text-accent' : 'border-bad/60 bg-bad/10 text-bad'}`

function chipNode(name: string, known: boolean): HTMLElement {
  const span = document.createElement('span')
  span.contentEditable = 'false'
  span.dataset.var = name
  span.className = chipLook(known)
  span.textContent = name
  span.title = known ? `The number ${name} goes here` : `There is no variable called ${name}`
  return span
}

/** Inline maths a Numbas file brought: shown set, kept whole, never edited as text. */
function texNode(tex: string, names: readonly string[]): HTMLElement {
  const span = document.createElement('span')
  span.contentEditable = 'false'
  span.dataset.tex = tex
  span.className = 'mx-0.5 inline-block'
  span.innerHTML = katex.renderToString(texForEditor(tex, names, chipKatex), { throwOnError: false, strict: 'ignore', output: 'html' })
  return span
}

function fill(div: HTMLElement, text: string, names: readonly string[]): void {
  div.replaceChildren()
  text.split('\n').forEach((line, k) => {
    if (k > 0) div.appendChild(document.createElement('br'))
    for (const p of textPieces(line)) {
      if ('chip' in p) div.appendChild(chipNode(p.chip, names.includes(p.chip)))
      else if ('tex' in p) div.appendChild(texNode(p.tex, names))
      else div.appendChild(document.createTextNode(p.text))
    }
  })
}

// A no-break space (what the browser types for a run of spaces) and a zero-width space.
const NBSP = new RegExp(String.fromCharCode(0xa0), 'g')
const ZWSP = new RegExp(String.fromCharCode(0x200b), 'g')

/** The editor's DOM back into the file's text: chips as `{v}`, lines as newlines. */
function readNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(NBSP, ' ').replace(ZWSP, '')
  if (!(node instanceof HTMLElement)) return ''
  if (node.tagName === 'BR') return '\n'
  if (node.dataset.var) return `{${node.dataset.var}}`
  if (node.dataset.tex !== undefined) return `\\(${node.dataset.tex}\\)`
  const inner = [...node.childNodes].map(readNode).join('')
  // Chromium wraps a new line in a <div> when something bypasses the Enter handler (a paste).
  return node.tagName === 'DIV' || node.tagName === 'P' ? `\n${inner}` : inner
}

const readText = (div: HTMLElement): string =>
  [...div.childNodes]
    .map(readNode)
    .join('')
    .replace(/^\n/, '')
    .replace(/\n+$/, '')

/**
 * A sentence the teacher types, with variables as chips: a chip is a word they cannot split or
 * mistype, inserted with the buttons underneath, and shown red when no variable has its name.
 * The DOM is the editor's own (a `contentEditable`); it is rebuilt from the text only when the
 * text changes from outside, so typing never loses the caret.
 */
export function ChipText({
  value,
  names,
  onCommit,
  label,
  placeholder,
  multiline = false,
  chips = true
}: {
  value: string
  names: readonly string[]
  onCommit: (text: string) => void
  label: string
  placeholder?: string
  multiline?: boolean
  chips?: boolean
}) {
  const el = useRef<HTMLDivElement>(null)
  const emitted = useRef<string | null>(null)

  useEffect(() => {
    const div = el.current
    if (!div || value === emitted.current) return
    emitted.current = value
    fill(div, value, names)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- names are applied by the effect below without a rebuild
  }, [value])

  // A variable added or renamed turns its chips from red to ordinary and back, caret untouched.
  useEffect(() => {
    el.current?.querySelectorAll<HTMLElement>('[data-var]').forEach((s) => {
      const known = names.includes(s.dataset.var!)
      s.className = chipLook(known)
      s.title = known ? `The number ${s.dataset.var} goes here` : `There is no variable called ${s.dataset.var}`
    })
  }, [names])

  const read = () => {
    const div = el.current
    if (!div) return
    const text = readText(div)
    if (text === emitted.current) return
    emitted.current = text
    onCommit(text)
  }

  const insertChip = (name: string) => {
    const div = el.current
    if (!div) return
    div.focus()
    const sel = window.getSelection()
    let range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null
    if (!range || !div.contains(range.commonAncestorContainer)) {
      range = document.createRange()
      range.selectNodeContents(div)
      range.collapse(false)
    }
    range.deleteContents()
    const chip = chipNode(name, names.includes(name))
    range.insertNode(chip)
    range.setStartAfter(chip)
    range.collapse(true)
    sel?.removeAllRanges()
    sel?.addRange(range)
    read()
  }

  return (
    <div className="min-w-0">
      <div className="relative">
        <div
          ref={el}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label={label}
          aria-multiline={multiline}
          className="field h-auto min-h-[44px] whitespace-pre-wrap break-words py-2 leading-relaxed text-ink"
          onInput={read}
          onBlur={() => {
            // Braces typed or pasted by hand become chips once the teacher moves on.
            const div = el.current
            if (div && emitted.current !== null && /\{[A-Za-z]/.test(emitted.current)) fill(div, emitted.current, names)
          }}
          onPaste={(e) => {
            e.preventDefault()
            const text = e.clipboardData.getData('text/plain')
            document.execCommand('insertText', false, multiline ? text : text.replace(/\s*\n\s*/g, ' '))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (multiline && !e.ctrlKey) document.execCommand('insertLineBreak')
              else (e.target as HTMLElement).blur()
            }
            e.stopPropagation()
          }}
        />
        {value === '' && placeholder && <div className="pointer-events-none absolute left-2 top-2 text-ink-faint">{placeholder}</div>}
      </div>
      {chips && <ChipBar names={names} onChip={insertChip} />}
    </div>
  )
}

/**
 * Display maths with chips, built in the maths field: a chip is drawn framed, which reads as
 * "the number goes here" and is what the chip buttons insert; a letter typed is a letter.
 */
export function TexField({ tex, names, onCommit, label, placeholder }: { tex: string; names: readonly string[]; onCommit: (tex: string) => void; label?: string; placeholder?: string }) {
  const ref = useRef<MathInputHandle>(null)
  const [latex, setLatex] = useState(() => texForEditor(tex, names))
  const committed = useRef(tex)
  useEffect(() => {
    if (tex === committed.current) return
    committed.current = tex
    setLatex(texForEditor(tex, names))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- names only matter when the maths itself changed from outside
  }, [tex])
  const change = (next: string) => {
    setLatex(next)
    const back = texFromEditor(next, names)
    if (back === committed.current) return
    committed.current = back
    onCommit(back)
  }
  return (
    <div className="min-w-0">
      {label && <div className="text-small text-ink-dim">{label}</div>}
      <MathInput ref={ref} value={latex} onChange={change} placeholder={placeholder} size="sm" className="w-full" />
      <ChipBar names={names} onChip={(n) => ref.current?.insert(chipTex(n))} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// The statement
// ---------------------------------------------------------------------------

function StatementEditor({ q, names }: { q: PQQuestion; names: readonly string[] }) {
  const edit = useAuthor((s) => s.edit)
  // The blocks are the editor's own, so an empty sentence just added survives until it is
  // written in; the file's text would drop it at once.
  const [blocks, setBlocks] = useState<StatementBlock[]>(() => statementBlocks(q.statement))
  const committed = useRef(q.statement)
  useEffect(() => {
    if (q.statement === committed.current) return
    committed.current = q.statement
    setBlocks(statementBlocks(q.statement))
  }, [q.statement])

  const put = (next: StatementBlock[]) => {
    setBlocks(next)
    const text = blocksStatement(next)
    committed.current = text
    edit((d) => {
      d.statement = text
    })
  }

  return (
    <div className="space-y-2">
      {blocks.map((b, k) => (
        <div key={k} className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            {b.kind === 'text' ? (
              <ChipText
                value={b.text}
                names={names}
                multiline
                label={k === 0 ? 'The question' : 'More of the question'}
                placeholder={k === 0 ? 'A train moving at … stops … later.' : 'More words…'}
                onCommit={(text) => put(blocks.map((x, j) => (j === k ? { kind: 'text', text } : x)))}
              />
            ) : (
              <TexField tex={b.tex} names={names} label="A line of maths, shown on its own" onCommit={(tex) => put(blocks.map((x, j) => (j === k ? { kind: 'formula', tex } : x)))} />
            )}
          </div>
          {blocks.length > 1 && (
            <button className="icon-btn min-h-[44px] min-w-[44px]" aria-label="Remove this line" title="Remove" onClick={() => put(blocks.filter((_, j) => j !== k))}>
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button className="btn min-h-[44px]" onClick={() => put([...blocks, { kind: 'formula', tex: '' }])}>
          <Plus size={14} /> Add a line of maths
        </button>
        <button className="btn min-h-[44px]" onClick={() => put([...blocks, { kind: 'text', text: '' }])}>
          <Plus size={14} /> Add more words
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The picture
// ---------------------------------------------------------------------------

const PICTURES: { kind: PQPicture['kind'] | 'none'; label: string }[] = [
  { kind: 'none', label: 'None' },
  { kind: 'curve', label: 'A curve' },
  { kind: 'piecewise', label: 'In pieces' },
  { kind: 'between', label: 'Area between' },
  { kind: 'tangent', label: 'A tangent' }
]

const startPicture = (kind: PQPicture['kind']): PQPicture => {
  switch (kind) {
    case 'curve':
      return { kind, expr: 'x^2' }
    case 'piecewise':
      return { kind, pieces: [{ expr: 'x', from: '0', to: '2' }] }
    case 'between':
      return { kind, upper: 'x', lower: 'x^2', from: '0', to: '1' }
    case 'tangent':
      return { kind, expr: 'x^2', at: '1' }
  }
}

function PictureEditor({ q, names }: { q: PQQuestion; names: readonly string[] }) {
  const edit = useAuthor((s) => s.edit)
  const pic = q.picture
  const set = (next: PQPicture | undefined) =>
    edit((d) => {
      if (next) d.picture = next
      else delete d.picture
    })
  const change = (recipe: (p: PQPicture) => void) =>
    edit((d) => {
      if (d.picture) recipe(d.picture as PQPicture)
    })
  const optional = (value: string): string | undefined => (value.trim() === '' ? undefined : value)
  const x = ['x']

  return (
    <div className="space-y-2">
      <div className="seg flex w-full flex-wrap" role="radiogroup" aria-label="The picture">
        {PICTURES.map((p) => {
          const on = (pic?.kind ?? 'none') === p.kind
          return (
            <button key={p.kind} role="radio" aria-checked={on} className={`min-h-[44px] flex-1 ${on ? 'on' : ''}`} onClick={() => !on && set(p.kind === 'none' ? undefined : startPicture(p.kind))}>
              {p.label}
            </button>
          )
        })}
      </div>
      {pic?.kind === 'curve' && (
        <>
          <FormulaField label="y =" expr={pic.expr} names={names} free={x} onCommit={(e) => change((p) => p.kind === 'curve' && (p.expr = e))} />
          <div className="grid grid-cols-2 gap-2">
            <FormulaField label="From x = (optional)" expr={pic.xMin ?? ''} names={names} chips={false} onCommit={(e) => change((p) => p.kind === 'curve' && ((p.xMin = optional(e)), true))} />
            <FormulaField label="To x = (optional)" expr={pic.xMax ?? ''} names={names} chips={false} onCommit={(e) => change((p) => p.kind === 'curve' && ((p.xMax = optional(e)), true))} />
          </div>
        </>
      )}
      {pic?.kind === 'piecewise' && (
        <>
          {pic.pieces.map((piece, k) => (
            <div key={k} className="card p-2">
              <div className="flex items-start gap-1">
                <div className="min-w-0 flex-1">
                  <FormulaField label={`Piece ${k + 1}: y =`} expr={piece.expr} names={names} free={x} onCommit={(e) => change((p) => p.kind === 'piecewise' && (p.pieces[k].expr = e))} />
                </div>
                {pic.pieces.length > 1 && (
                  <button className="icon-btn min-h-[44px] min-w-[44px]" aria-label={`Remove piece ${k + 1}`} onClick={() => change((p) => p.kind === 'piecewise' && p.pieces.splice(k, 1))}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <FormulaField label="from x =" expr={piece.from} names={names} chips={false} onCommit={(e) => change((p) => p.kind === 'piecewise' && (p.pieces[k].from = e))} />
                <FormulaField label="to x =" expr={piece.to} names={names} chips={false} onCommit={(e) => change((p) => p.kind === 'piecewise' && (p.pieces[k].to = e))} />
              </div>
            </div>
          ))}
          <button
            className="btn min-h-[44px]"
            onClick={() =>
              change((p) => {
                if (p.kind !== 'piecewise') return
                const last = p.pieces[p.pieces.length - 1]
                p.pieces.push({ expr: last?.expr ?? 'x', from: last?.to ?? '0', to: last ? `${last.to} + 1` : '1' })
              })
            }
          >
            <Plus size={14} /> Add a piece
          </button>
        </>
      )}
      {pic?.kind === 'between' && (
        <>
          <FormulaField label="Upper curve: y =" expr={pic.upper} names={names} free={x} onCommit={(e) => change((p) => p.kind === 'between' && (p.upper = e))} />
          <FormulaField label="Lower curve: y =" expr={pic.lower} names={names} free={x} onCommit={(e) => change((p) => p.kind === 'between' && (p.lower = e))} />
          <div className="grid grid-cols-2 gap-2">
            <FormulaField label="From x =" expr={pic.from} names={names} chips={false} onCommit={(e) => change((p) => p.kind === 'between' && (p.from = e))} />
            <FormulaField label="To x =" expr={pic.to} names={names} chips={false} onCommit={(e) => change((p) => p.kind === 'between' && (p.to = e))} />
          </div>
          <ChipText
            label="Name on the shaded region (optional)"
            placeholder="Name on the shaded region (optional)"
            value={pic.label ?? ''}
            names={names}
            chips={false}
            onCommit={(t) => change((p) => p.kind === 'between' && ((p.label = t.trim() === '' ? undefined : t), true))}
          />
        </>
      )}
      {pic?.kind === 'tangent' && (
        <>
          <FormulaField label="y =" expr={pic.expr} names={names} free={x} onCommit={(e) => change((p) => p.kind === 'tangent' && (p.expr = e))} />
          <FormulaField label="Touching at x =" expr={pic.at} names={names} onCommit={(e) => change((p) => p.kind === 'tangent' && (p.at = e))} />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The motion
// ---------------------------------------------------------------------------

const SEGMENT_WORDS: Record<MotionSegment['kind'], string> = {
  rest: 'Standing still',
  uniform: 'At a steady speed',
  accelerate: 'Speeding up or slowing down'
}

const startSegment = (kind: MotionSegment['kind']): MotionSegment =>
  kind === 'rest' ? { kind, duration: '2' } : kind === 'uniform' ? { kind, duration: '4', v: '2' } : { kind, duration: '4', a: '1' }

const PLOTS: { id: PQMotion['plots'][number]; label: string }[] = [
  { id: 'x-t', label: 'Position–time' },
  { id: 'v-t', label: 'Speed–time' },
  { id: 'a-t', label: 'Acceleration–time' }
]

function MotionEditor({ q, names }: { q: PQQuestion; names: readonly string[] }) {
  const edit = useAuthor((s) => s.edit)
  const m = q.motion
  const change = (recipe: (m: PQMotion) => void) =>
    edit((d) => {
      if (d.motion) recipe(d.motion)
    })
  const optional = (e: string): string | undefined => (e.trim() === '' ? undefined : e)

  return (
    <div className="space-y-2">
      <label className="flex min-h-[44px] items-center gap-2 text-ink">
        <input
          type="checkbox"
          checked={!!m}
          onChange={(e) => {
            const on = e.target.checked
            edit((d) => {
              if (on) d.motion = { segments: [startSegment('accelerate')], plots: ['x-t', 'v-t'] }
              else delete d.motion
            })
          }}
        />
        Draw a motion as graphs
      </label>
      {m && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <FormulaField label="Starts at x = (m)" placeholder="0" expr={m.x0 ?? ''} names={names} onCommit={(e) => change((d) => void (d.x0 = optional(e)))} />
            <FormulaField label="Starting speed (m/s)" placeholder="0" expr={m.v0 ?? ''} names={names} onCommit={(e) => change((d) => void (d.v0 = optional(e)))} />
          </div>
          {m.segments.map((s, k) => (
            <div key={k} className="card p-2">
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-small text-ink-dim">Stretch {k + 1}</span>
                <select
                  className="field min-h-[44px] w-auto flex-1"
                  aria-label={`What happens in stretch ${k + 1}`}
                  value={s.kind}
                  onChange={(e) => {
                    const kind = e.target.value as MotionSegment['kind']
                    change((d) => {
                      d.segments[k] = { ...startSegment(kind), duration: d.segments[k].duration }
                    })
                  }}
                >
                  {(Object.keys(SEGMENT_WORDS) as MotionSegment['kind'][]).map((kind) => (
                    <option key={kind} value={kind}>
                      {SEGMENT_WORDS[kind]}
                    </option>
                  ))}
                </select>
                <button className="icon-btn min-h-[44px] min-w-[44px]" aria-label={`Move stretch ${k + 1} earlier`} disabled={k === 0} onClick={() => change((d) => void d.segments.splice(k - 1, 0, d.segments.splice(k, 1)[0]))}>
                  <ArrowUp size={14} />
                </button>
                <button
                  className="icon-btn min-h-[44px] min-w-[44px]"
                  aria-label={`Move stretch ${k + 1} later`}
                  disabled={k === m.segments.length - 1}
                  onClick={() => change((d) => void d.segments.splice(k + 1, 0, d.segments.splice(k, 1)[0]))}
                >
                  <ArrowDown size={14} />
                </button>
                {m.segments.length > 1 && (
                  <button className="icon-btn min-h-[44px] min-w-[44px]" aria-label={`Remove stretch ${k + 1}`} onClick={() => change((d) => void d.segments.splice(k, 1))}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <FormulaField label="For how long (s)" expr={s.duration} names={names} onCommit={(e) => change((d) => void (d.segments[k].duration = e))} />
                {s.kind === 'uniform' && (
                  <FormulaField label="Speed (m/s)" expr={s.v} names={names} onCommit={(e) => change((d) => void ((d.segments[k] as { v: string }).v = e))} />
                )}
                {s.kind === 'accelerate' && (
                  <FormulaField label="Acceleration (m/s²)" expr={s.a} names={names} onCommit={(e) => change((d) => void ((d.segments[k] as { a: string }).a = e))} />
                )}
              </div>
            </div>
          ))}
          <button className="btn min-h-[44px]" onClick={() => change((d) => void d.segments.push(startSegment('uniform')))}>
            <Plus size={14} /> Add a stretch
          </button>
          <fieldset className="flex flex-wrap gap-3">
            <legend className="text-small text-ink-dim">Graphs to draw</legend>
            {PLOTS.map((p) => (
              <label key={p.id} className="flex min-h-[44px] items-center gap-2 text-ink">
                <input
                  type="checkbox"
                  checked={m.plots.includes(p.id)}
                  onChange={(e) => {
                    const on = e.target.checked
                    change((d) => {
                      d.plots = on ? PLOTS.map((x) => x.id).filter((id) => id === p.id || d.plots.includes(id)) : d.plots.filter((id) => id !== p.id)
                    })
                  }}
                />
                {p.label}
              </label>
            ))}
          </fieldset>
          <FormulaField
            label="Send readings to Lab Data every … s (optional)"
            expr={m.sampleEvery ?? ''}
            names={names}
            chips={false}
            onCommit={(e) => change((d) => void (d.sampleEvery = optional(e)))}
          />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The experiment
// ---------------------------------------------------------------------------

function SandboxEditor({ q, names }: { q: PQQuestion; names: readonly string[] }) {
  const edit = useAuthor((s) => s.edit)
  const sb = q.sandbox
  const groups = useMemo(() => groupedPresets(), [])
  const bodies = useMemo(() => {
    const p = sb ? presetById(sb.preset) : undefined
    return p ? p.build().bodies.map((b) => b.name) : []
  }, [sb])
  const change = (recipe: (s: PQSandbox) => void) =>
    edit((d) => {
      if (d.sandbox) recipe(d.sandbox)
    })
  const optional = (e: string): string | undefined => (e.trim() === '' ? undefined : e)
  const t = ['t']

  return (
    <div className="space-y-2">
      <label className="flex min-h-[44px] items-center gap-2 text-ink">
        <input
          type="checkbox"
          checked={!!sb}
          onChange={(e) => {
            const on = e.target.checked
            edit((d) => {
              if (on) d.sandbox = { preset: groups[0]?.presets[0]?.id ?? 'fall', actuators: [] }
              else delete d.sandbox
            })
          }}
        />
        Set up an experiment in the Sandbox
      </label>
      {sb && (
        <>
          <label className="block">
            <span className="text-small text-ink-dim">Experiment</span>
            <select className="field mt-1 min-h-[44px]" value={sb.preset} onChange={(e) => change((d) => void (d.preset = e.target.value))}>
              {groups.map((g) => (
                <optgroup key={g.topic} label={g.topic}>
                  {g.presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          {sb.actuators.map((a, k) => (
            <div key={k} className="card p-2">
              <div className="flex items-center gap-1">
                <span className="text-small text-ink-dim">Push {k + 1} on</span>
                <select className="field min-h-[44px] w-auto flex-1" aria-label={`The body push ${k + 1} acts on`} value={a.body} onChange={(e) => change((d) => void (d.actuators[k].body = e.target.value))}>
                  {!bodies.includes(a.body) && <option value={a.body}>{a.body} (not in this experiment)</option>}
                  {bodies.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
                <button className="icon-btn min-h-[44px] min-w-[44px]" aria-label={`Remove push ${k + 1}`} onClick={() => change((d) => void d.actuators.splice(k, 1))}>
                  <Trash2 size={14} />
                </button>
              </div>
              {!bodies.includes(a.body) && <div className="mt-1 text-small text-bad">This experiment has no body called {a.body}.</div>}
              <div className="mt-1 text-small text-ink-dim">Force in newtons; it may change with the time t.</div>
              <div className="grid grid-cols-3 gap-2">
                {(['across (x)', 'up (y)', 'towards you (z)'] as const).map((axis, c) => (
                  <FormulaField key={axis} label={axis} expr={a.force[c]} names={names} free={t} chips={c === 0} onCommit={(e) => change((d) => void (d.actuators[k].force[c] = e === '' ? '0' : e))} />
                ))}
              </div>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <FormulaField label="Starts at (s, optional)" placeholder="0" expr={a.from ?? ''} names={names} chips={false} onCommit={(e) => change((d) => void (d.actuators[k].from = optional(e)))} />
                <FormulaField label="Stops at (s, optional)" placeholder="never" expr={a.until ?? ''} names={names} chips={false} onCommit={(e) => change((d) => void (d.actuators[k].until = optional(e)))} />
              </div>
            </div>
          ))}
          <button
            className="btn min-h-[44px]"
            disabled={bodies.length === 0}
            onClick={() => change((d) => void d.actuators.push({ body: bodies[0], force: ['0', '0', '0'] }))}
          >
            <Plus size={14} /> Add a push
          </button>
          <label className="block">
            <span className="text-small text-ink-dim">Send one body’s readings to Lab Data</span>
            <select className="field mt-1 min-h-[44px]" value={sb.record ?? ''} onChange={(e) => change((d) => void (d.record = e.target.value === '' ? undefined : e.target.value))}>
              <option value="">No readings</option>
              {bodies.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Show it
// ---------------------------------------------------------------------------

function ShowIt({ q }: { q: PQQuestion }) {
  const settings = useScene((s) => s.settings)
  const seed = useAuthorView((s) => s.seed)
  const setSeed = useAuthorView((s) => s.setSeed)
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null)

  /** The player's own calls with one preview row's numbers: what a student would see. */
  const run = (what: 'picture' | 'motion' | 'sandbox') => {
    try {
      const played = playQuestion(q, seed, settings)
      if (what === 'picture') {
        // Question Author looks at the Graphing drawing, so the picture appears beside the question.
        setNote({ text: showPicture(picturePlan(q.picture!, played, settings), settings).note, error: false })
      } else if (what === 'motion') {
        setNote({ text: showMotion(q.motion!, played, settings).note, error: false })
      } else {
        const text = showSandbox(sandboxPlan(q.sandbox!, played))
        enterMode('sandbox')
        showPanel('sandbox')
        scene().pushLog({ input: 'Question Author', kind: 'info', text })
        setNote({ text: `${text} Switched to the Sandbox; choose Question Author in the mode list to come back.`, error: false })
      }
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : String(e), error: true })
    }
  }

  if (!q.picture && !q.motion && !q.sandbox) {
    return <div className="text-small text-ink-faint">Choose a picture, a motion or an experiment above, and it can be shown here with a student’s numbers.</div>
  }
  return (
    <div>
      <label className="flex items-center gap-2">
        <span className="text-small text-ink-dim">With the numbers of row</span>
        <select className="field min-h-[44px] w-20" value={seed} onChange={(e) => setSeed(Number(e.target.value))}>
          {Array.from({ length: 10 }, (_, k) => k + 1).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        {q.picture && (
          <button className="btn primary min-h-[44px]" onClick={() => run('picture')}>
            <Eye size={14} /> Show the picture
          </button>
        )}
        {q.motion && (
          <button className="btn primary min-h-[44px]" onClick={() => run('motion')}>
            <LineChart size={14} /> Draw the motion
          </button>
        )}
        {q.sandbox && (
          <button className="btn primary min-h-[44px]" onClick={() => run('sandbox')}>
            <FlaskConical size={14} /> Set up the experiment
          </button>
        )}
      </div>
      {note && (
        <div role="status" className={`mt-2 ${note.error ? 'text-bad' : 'text-ink-dim'}`}>
          {note.text}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------

export function AuthorScene({ q }: { q: PQQuestion }) {
  const names = useMemo(() => q.variables.map((v) => v.name), [q.variables])
  return (
    <div className="space-y-1 pb-4">
      <div className="section-title">The question</div>
      <div className="px-3">
        <StatementEditor q={q} names={names} />
      </div>
      <div className="section-title mt-2">A picture in Graphing</div>
      <div className="px-3">
        <PictureEditor q={q} names={names} />
      </div>
      <div className="section-title mt-2">A motion</div>
      <div className="px-3">
        <MotionEditor q={q} names={names} />
      </div>
      <div className="section-title mt-2">An experiment</div>
      <div className="px-3">
        <SandboxEditor q={q} names={names} />
      </div>
      <div className="section-title mt-2">Show it</div>
      <div className="px-3">
        <ShowIt q={q} />
      </div>
    </div>
  )
}

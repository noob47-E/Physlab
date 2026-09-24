// One answer row per part of a question from the bank: a number with its unit, a formula, a
// choice, and format 2's kinds — a vector, a matrix typed entry by entry, a set of roots, a
// function that must solve its equation, a number with its own stated uncertainty, and a proof
// shown with its model and a self-check list. The marking lives in questions/player.ts; these only
// draw the box, the verdict and the reveal, in the same words and colours the vector problems'
// boxes use. Every control is a 44 px target and nothing needs a hover.

import { useState, type ReactNode } from 'react'
import { Check, Eye, X } from 'lucide-react'
import { isCorrect, type Check as AnswerCheck } from '../math/checkAnswer'
import { fmt } from '../math/format'
import type { CellVerdict } from '../questions/answerKinds'
import { blankAnswer, countedParts, type PartAnswer, type Played, type PlayedPart, type Segment } from '../questions/player'
import { partLetter } from '../questions/variables'
import { UNITS } from '../questions/units'
import { Tex } from '../ui/Tex'

export type { PartAnswer }

/** A mark as the rows read it: the plain check, plus what error carried forward and a matrix add. */
export type RowCheck = AnswerCheck & {
  /** "Marked using your answer to part (a): −4 m/s²" — the student's own numbers decided this mark. */
  ecfNote?: string
  marks?: number
  outOf?: number
  /** A matrix's verdict entry by entry, to colour each box. */
  cells?: CellVerdict[][]
}

interface RowProps {
  p: PlayedPart
  /**
   * The part's letter in the author's list, "(a)", "(c)": the letter error carried forward's note
   * names. Numbered by position on screen, a part hidden by its showIf moved every later row's
   * number off its letter, and "part (c)" in a note pointed at the box numbered 2.
   */
  label: string
  many: boolean
  value: PartAnswer | undefined
  check: RowCheck | undefined
  revealed: boolean
  onChange: (v: PartAnswer) => void
  /** Enter in a box marks the whole question, as it does for a vector problem. */
  onEnter: () => void
  /** The student opened a proof's model proof: for a question with nothing marked, that is its answer. */
  onModelShown?: () => void
}

/** The tick or cross beside a box once it has been marked. */
function Mark({ c }: { c: AnswerCheck | undefined }) {
  if (!c || c.verdict === 'empty') return null
  return isCorrect(c) ? <Check size={16} className="shrink-0 text-good" aria-label="right" /> : <X size={16} className="shrink-0 text-bad" aria-label="not right" />
}

/**
 * What the marking said, under the box: why it is wrong, or a note on a right answer; whose numbers
 * it was marked with when error carried forward decided it; and the marks when only some were earned.
 */
function Verdict({ c, revealed, answer }: { c: RowCheck | undefined; revealed: boolean; answer: ReactNode }) {
  const some = c && c.outOf !== undefined && c.marks !== undefined && c.marks > 0 && c.marks < c.outOf
  return (
    <>
      {c?.message && <div className={`mt-1 ${isCorrect(c) ? 'text-warn/80' : 'text-bad'}`}>{c.message}</div>}
      {c?.ecfNote && <div className="mt-1 text-ink-dim">{c.ecfNote}.</div>}
      {some && (
        <div className="mt-1 text-ink-dim">
          {fmt(c.marks!, 2)} of {fmt(c.outOf!, 2)} marks.
        </div>
      )}
      {c?.verdict === 'empty' && <div className="mt-1 text-ink-dim">Fill this one in too.</div>}
      {revealed && <div className="mt-1 text-good">Answer: {answer}</div>}
    </>
  )
}

/** One line of words and inline maths; a display equation stands on its own. */
export function SegmentLine({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((s, i) =>
        'text' in s ? <span key={i}>{s.text}</span> : <Tex key={i} tex={s.tex} display={s.display} />
      )}
    </>
  )
}

/**
 * Lines of an author's text: a display line through KaTeX on its own, any other line as a
 * paragraph with its inline maths set in place. `\(…\)` from a Numbas file used to reach the
 * student as backslashes.
 */
export function SegmentLines({ lines, className }: { lines: Segment[][]; className?: string }) {
  return (
    <>
      {lines.map((line, i) =>
        line.length === 1 && 'tex' in line[0] && line[0].display ? (
          <Tex key={i} tex={line[0].tex} display />
        ) : (
          <p key={i} className={className}>
            <SegmentLine segments={line} />
          </p>
        )
      )}
    </>
  )
}

function Prompt({ p, label, many }: { p: PlayedPart; label: string; many: boolean }) {
  const [first, ...rest] = p.promptLines
  return (
    <div className="mb-1 text-ink">
      {many && <span className="mr-1 font-semibold text-ink-dim">{label}</span>}
      {first && <SegmentLine segments={first} />}
      {rest.length > 0 && <SegmentLines lines={rest} />}
    </div>
  )
}

/** What a typed box asks for, in the words of the kind of answer it takes. */
function hintFor(p: PlayedPart): string {
  const part = p.part
  switch (part.type) {
    case 'number':
      return part.tolerance.kind === 'stated' ? 'your value ± its uncertainty, like 0.5591 ± 0.0001' : 'type what you got'
    case 'expression':
      return `a formula in ${part.symbols.join(', ')}`
    case 'vector':
      return part.answer.length === 3 ? 'like 3i + 4j − 2k' : 'like 3i + 4j, or 5∠53°'
    case 'roots':
      return 'every root, like 2, −3'
    case 'function':
      return `${part.y} as a formula in ${part.x}, like 2 sin(${part.x})`
    default:
      return 'type your answer'
  }
}

/** The unit written after a typed box: a number's own, or a vector's or a set of roots'. */
function unitOf(p: PlayedPart): string | undefined {
  if (p.field?.unit) return p.field.unit
  const part = p.part
  if ((part.type === 'vector' || part.type === 'roots') && part.unit !== 'none') return UNITS[part.unit].label
  return undefined
}

/** A box for a typed answer: a number (a unit typed after it is read), a formula, a vector, roots or a function. */
function TypedRow({ p, label, many, value, check, revealed, onChange, onEnter }: RowProps) {
  const unit = unitOf(p)
  // The reveal writes a number as the rest of the app does; every other kind as its LaTeX.
  const plainNumber = p.part.type === 'number' && p.part.tolerance.kind !== 'stated'
  return (
    <div className="mb-3">
      <Prompt p={p} label={label} many={many} />
      <div className="flex items-center gap-2">
        {p.part.type === 'function' && <span className="shrink-0 font-math italic text-ink">{p.part.y} =</span>}
        <input
          className="field num min-h-[44px] min-w-0 flex-1"
          value={typeof value === 'string' ? value : ''}
          placeholder={hintFor(p)}
          spellCheck={false}
          aria-label={p.prompt}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEnter()
            e.stopPropagation()
          }}
        />
        {unit && <span className="shrink-0 text-ink-faint">{unit}</span>}
        <Mark c={check} />
      </div>
      <Verdict c={check} revealed={revealed} answer={plainNumber ? p.answerText : <Tex tex={p.answerTex} />} />
    </div>
  )
}

/** The ring round one entry once the matrix is marked: which entries are right and which are not. */
function cellRing(v: CellVerdict | undefined): string {
  if (v === 'right') return 'ring-1 ring-good'
  if (v === 'wrong' || v === 'unreadable') return 'ring-1 ring-bad'
  return ''
}

/** A matrix typed entry by entry: one 44 px box per entry, in rows, between brackets. */
function MatrixRow({ p, label, many, value, check, revealed, onChange, onEnter }: RowProps) {
  const size = p.matrix ?? { rows: 0, cols: 0 }
  const grid: string[][] = Array.isArray(value) && value.every((r) => Array.isArray(r)) && value.length === size.rows ? (value as string[][]) : blankAnswer(p) as string[][]
  const set = (i: number, j: number, text: string) => onChange(grid.map((row, r) => row.map((cell, c) => (r === i && c === j ? text : cell))))
  return (
    <div className="mb-3">
      <Prompt p={p} label={label} many={many} />
      <div className="flex items-center gap-2">
        <div role="group" aria-label={p.prompt} className="flex flex-col gap-1 rounded-md border-x-2 border-ink-dim px-1.5 py-1">
          {grid.map((row, i) => (
            <div key={i} className="flex gap-1">
              {row.map((cell, j) => (
                <input
                  key={j}
                  className={`field num min-h-[44px] w-20 min-w-[44px] text-center ${cellRing(check?.cells?.[i]?.[j])}`}
                  value={cell}
                  spellCheck={false}
                  aria-label={`${p.prompt}: row ${i + 1}, column ${j + 1}`}
                  onChange={(e) => set(i, j, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onEnter()
                    e.stopPropagation()
                  }}
                />
              ))}
            </div>
          ))}
        </div>
        <Mark c={check} />
      </div>
      {p.part.type === 'matrix' && p.part.allowFractions && <div className="mt-1 text-fine text-ink-dim">An entry may be a fraction, like 3/5.</div>}
      <Verdict c={check} revealed={revealed} answer={<Tex tex={p.answerTex} />} />
    </div>
  )
}

/**
 * A proof: never marked on this computer (that would need a proof language, which rule 2 rules
 * out). The student writes theirs if they like, then opens the model proof and ticks off the
 * self-check list against their own.
 */
function ProofRow({ p, label, many, value, revealed, onChange, onModelShown }: RowProps) {
  const [open, setOpen] = useState(false)
  const [ticked, setTicked] = useState<number[]>([])
  const shown = open || revealed
  const list = p.selfCheck ?? []
  return (
    <div className="mb-3">
      <Prompt p={p} label={label} many={many} />
      <div className="mb-1 text-fine text-ink-dim">Not marked on this computer: write your proof, then compare it with the model proof and its checklist.</div>
      <textarea
        className="field min-h-[88px] w-full"
        value={typeof value === 'string' ? value : ''}
        placeholder="your proof, line by line (not marked)"
        spellCheck={false}
        aria-label={`${p.prompt} (your proof, not marked)`}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      {!shown && (
        <button
          className="btn ghost mt-1 min-h-[44px]"
          onClick={() => {
            setOpen(true)
            onModelShown?.()
          }}
        >
          <Eye size={13} /> Show the model proof
        </button>
      )}
      {shown && (
        <div className="mt-2 rounded-md bg-surface-0 px-3 py-2">
          <div className="mb-1 text-fine uppercase tracking-wide text-ink-faint">Model proof</div>
          <SegmentLines lines={p.model ?? []} className="text-ink" />
          {list.length > 0 && (
            <>
              <div className="mb-1 mt-2 text-fine uppercase tracking-wide text-ink-faint">Check your proof</div>
              <div className="flex flex-col gap-1" role="group" aria-label="Check your proof">
                {list.map((line, i) => {
                  const on = ticked.includes(i)
                  return (
                    <button
                      key={i}
                      role="checkbox"
                      aria-checked={on}
                      className={`btn min-h-[44px] w-full justify-start text-left ${on ? 'primary' : ''}`}
                      onClick={() => setTicked(on ? ticked.filter((x) => x !== i) : [...ticked, i])}
                    >
                      {on ? <Check size={14} className="shrink-0" /> : <span className="inline-block w-3.5 shrink-0" />}
                      <span className="min-w-0 flex-1">
                        <SegmentLine segments={line} />
                      </span>
                    </button>
                  )
                })}
              </div>
              {ticked.length === list.length && <div className="mt-1 text-good">Your proof covers every point on the list.</div>}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** A Lego part is answered in Geometry by filling the shape; here it shows its prompt and says so. */
function LegoRow({ p, label, many, check }: RowProps) {
  return (
    <div className="mb-3">
      <Prompt p={p} label={label} many={many} />
      <div className="text-ink-dim">This part is answered by filling the shape with Lego pieces in Geometry.</div>
      <Verdict c={check} revealed={false} answer={null} />
    </div>
  )
}

/** The options of a choice part as buttons; several right answers means tick every one that applies. */
function ChoiceRow({ p, label, many, value, check, revealed, onChange }: RowProps) {
  const picked = Array.isArray(value) && value.every((x) => typeof x === 'number') ? (value as number[]) : []
  const choices = p.choices ?? []
  const toggle = (i: number) => {
    if (p.multi) onChange(picked.includes(i) ? picked.filter((x) => x !== i) : [...picked, i])
    else onChange([i])
  }
  return (
    <div className="mb-3">
      <Prompt p={p} label={label} many={many} />
      {p.multi && <div className="mb-1 text-fine text-ink-dim">Pick every one that is right.</div>}
      <div className="flex flex-col gap-1.5" role={p.multi ? 'group' : 'radiogroup'} aria-label={p.prompt}>
        {choices.map((c, i) => {
          const on = picked.includes(i)
          const shownRight = revealed && c.correct
          return (
            <button
              key={i}
              role={p.multi ? 'checkbox' : 'radio'}
              aria-checked={on}
              aria-label={c.text}
              className={`btn min-h-[44px] w-full justify-start text-left ${on ? 'primary' : ''} ${shownRight ? 'ring-1 ring-good' : ''}`}
              onClick={() => toggle(i)}
            >
              <span className="min-w-0 flex-1">
                <SegmentLine segments={c.segments} />
              </span>
              {shownRight && <Check size={14} className="shrink-0 text-good" />}
            </button>
          )
        })}
        {choices.length === 0 && <div className="text-warn">This part has no options to pick from.</div>}
      </div>
      <div className="flex items-center gap-2">
        <Mark c={check} />
      </div>
      <Verdict c={check} revealed={revealed} answer={p.answerText} />
    </div>
  )
}

/** The right row for the part's kind. */
export function QuestionPartRow(props: RowProps) {
  switch (props.p.part.type) {
    case 'choice':
      return <ChoiceRow {...props} />
    case 'matrix':
      return <MatrixRow {...props} />
    case 'proof':
      return <ProofRow {...props} />
    case 'lego':
      return <LegoRow {...props} />
    default:
      return <TypedRow {...props} />
  }
}

/**
 * Every shown part of a played question, one row each. Each row carries its author's letter, the
 * one an error-carried-forward note names: numbered 1, 2, 3 by position, a part hidden by its
 * showIf left "part (c)" in a note pointing at the box numbered 2.
 */
export function PartRows({
  played,
  typed,
  checks,
  revealed,
  onChange,
  onEnter,
  onModelShown
}: {
  played: Played
  typed: Readonly<Record<string, PartAnswer>>
  checks: Readonly<Record<string, RowCheck>>
  revealed: boolean
  onChange: (key: string, v: PartAnswer) => void
  onEnter: () => void
  onModelShown?: () => void
}) {
  return (
    <>
      {played.parts.map((p) => (
        <QuestionPartRow
          key={`${played.problem.id}:${p.key}`}
          p={p}
          label={partLetter(p.index)}
          many={played.parts.length > 1}
          value={typed[p.key]}
          check={checks[p.key]}
          revealed={revealed}
          onChange={(v) => onChange(p.key, v)}
          onEnter={onEnter}
          onModelShown={onModelShown}
        />
      ))}
    </>
  )
}

/**
 * Whether a question from a set counts in the student's score, and if so whether it was right. A
 * question whose parts are all proofs or Lego parts has nothing marked on this computer: it is
 * null, "not marked", and neither right nor wrong. Such a question (typical of the deepest rung)
 * used to finish as a miss, "0 / 3 right" with the proof among the wrong ones, and its miss
 * brought the steps' fading back a level.
 */
export function questionVerdict(played: Played, checks: Readonly<Record<string, AnswerCheck | undefined>>, revealed: boolean): boolean | null {
  const graded = countedParts(played)
  if (graded.length === 0) return null
  return !revealed && graded.every((p) => isCorrect(checks[p.key]))
}

/** A set's results as the finished screen reads them: right out of the questions marked, and how many were not marked. */
export function tally(results: readonly { right: boolean | null }[]): { right: number; marked: number; unmarked: number } {
  const marked = results.filter((r) => r.right !== null)
  return { right: marked.filter((r) => r.right).length, marked: marked.length, unmarked: results.length - marked.length }
}

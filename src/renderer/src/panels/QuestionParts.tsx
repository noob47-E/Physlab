// One answer row per part of a question from the bank: a number with its unit, a formula, or a
// choice. The marking lives in questions/player.ts; these only draw the box, the verdict and the
// reveal, in the same words and colours the vector problems' boxes use.

import type { ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import { isCorrect, type Check as AnswerCheck } from '../math/checkAnswer'
import type { PlayedPart, Segment } from '../questions/player'
import { Tex } from '../ui/Tex'

export type PartAnswer = string | number[]

interface RowProps {
  p: PlayedPart
  /** 1-based, for "Part 2" when a question has more than one. */
  n: number
  many: boolean
  value: PartAnswer | undefined
  check: AnswerCheck | undefined
  revealed: boolean
  onChange: (v: PartAnswer) => void
  /** Enter in a box marks the whole question, as it does for a vector problem. */
  onEnter: () => void
}

/** The tick or cross beside a box once it has been marked. */
function Mark({ c }: { c: AnswerCheck | undefined }) {
  if (!c || c.verdict === 'empty') return null
  return isCorrect(c) ? <Check size={16} className="shrink-0 text-good" aria-label="right" /> : <X size={16} className="shrink-0 text-bad" aria-label="not right" />
}

/** What the marking said, under the box: why it is wrong, or a note on a right answer. */
function Verdict({ c, revealed, answer }: { c: AnswerCheck | undefined; revealed: boolean; answer: ReactNode }) {
  return (
    <>
      {c?.message && <div className={`mt-1 ${isCorrect(c) ? 'text-warn/80' : 'text-bad'}`}>{c.message}</div>}
      {c?.verdict === 'empty' && <div className="mt-1 text-ink-faint">Fill this one in too.</div>}
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

function Prompt({ p, n, many }: { p: PlayedPart; n: number; many: boolean }) {
  const [first, ...rest] = p.promptLines
  return (
    <div className="mb-1 text-ink">
      {many && <span className="mr-1 font-semibold text-ink-dim">{n}.</span>}
      {first && <SegmentLine segments={first} />}
      {rest.length > 0 && <SegmentLines lines={rest} />}
    </div>
  )
}

/** A box for a typed answer: a number (a unit typed after it is read) or a formula. */
function TypedRow({ p, n, many, value, check, revealed, onChange, onEnter }: RowProps) {
  const isNumber = p.part.type === 'number'
  const unit = p.field?.unit
  return (
    <div className="mb-3">
      <Prompt p={p} n={n} many={many} />
      <div className="flex items-center gap-2">
        <input
          className="field num min-h-[44px] min-w-0 flex-1"
          value={typeof value === 'string' ? value : ''}
          placeholder={isNumber ? 'type what you got' : `a formula in ${p.part.type === 'expression' ? p.part.symbols.join(', ') : 'x'}`}
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
      <Verdict c={check} revealed={revealed} answer={isNumber ? p.answerText : <Tex tex={p.answerTex} />} />
    </div>
  )
}

/** The options of a choice part as buttons; several right answers means tick every one that applies. */
function ChoiceRow({ p, n, many, value, check, revealed, onChange }: RowProps) {
  const picked = Array.isArray(value) ? value : []
  const choices = p.choices ?? []
  const toggle = (i: number) => {
    if (p.multi) onChange(picked.includes(i) ? picked.filter((x) => x !== i) : [...picked, i])
    else onChange([i])
  }
  return (
    <div className="mb-3">
      <Prompt p={p} n={n} many={many} />
      {p.multi && <div className="mb-1 text-fine text-ink-faint">Pick every one that is right.</div>}
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
  return props.p.part.type === 'choice' ? <ChoiceRow {...props} /> : <TypedRow {...props} />
}

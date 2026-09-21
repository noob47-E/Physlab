// The step-by-step working, as it appears under the answer on the Maths screen.
//
// Lifted whole from the old Working panel: the answer pinned above the steps, the steps hidden
// until asked for, "Let me try first" taking the focus only when the answer was asked for from
// the field. The Maths screen owns the field and the store; this only draws one piece of working.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { BookOpen, Check, Copy, Lightbulb, Pencil, TriangleAlert } from 'lucide-react'
import { Tex } from '../ui/Tex'
import { JOBS, type JobId } from '../math/pure/run'
import { texToPlain, type Working as WorkingDoc } from '../math/pure/work'
import { STEP_PREF_KEY, checkTone, initialShown, invitesTry, offeredJob, stepPrefFrom, type StepPref } from '../math/pure/reveal'

const JOB_IDS: readonly JobId[] = JOBS.map((j) => j.id)

export const readStepPref = (): StepPref => {
  try {
    return stepPrefFrom(localStorage.getItem(STEP_PREF_KEY))
  } catch {
    return 'try'
  }
}

export const writeStepPref = (p: StepPref): void => {
  try {
    localStorage.setItem(STEP_PREF_KEY, p)
  } catch {
    // Not remembered; the buttons still work.
  }
}

/**
 * One step of the working: what happened, the rule that allowed it, and the maths.
 *
 * The heading is a spoken sentence, so any LaTeX a generator put in it — a step naturally says
 * "divide x^{3} by x" — is turned into ordinary characters first. Doing it here rather than in
 * each generator means a new tool cannot reintroduce the problem.
 */
export function MoveRow({ n, head, rule, tex, note }: { n: number; head: string; rule?: string; tex?: string; note?: string }) {
  return (
    <li className="pure-move">
      <span className="pure-num">{n}</span>
      <div className="min-w-0 flex-1">
        <div className="pure-head">{texToPlain(head)}</div>
        {tex && <Tex tex={tex} display />}
        {note && <div className="pure-note">{texToPlain(note)}</div>}
      </div>
      {rule && (
        <div className="pure-rule" title="The formula this step uses">
          <Tex tex={rule} />
        </div>
      )}
    </li>
  )
}

/** Keys that mean "I am editing": any of them on the invitation button hands the keyboard back to the field. */
const isEditingKey = (e: KeyboardEvent): boolean => !e.ctrlKey && !e.metaKey && !e.altKey && !['Enter', ' ', 'Tab', 'Escape'].includes(e.key) && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete')

export function WorkingView({
  doc,
  pref,
  invited,
  settled,
  onPref,
  onOffer,
  onTry
}: {
  doc: WorkingDoc
  pref: StepPref
  /** Whether the student asked for this answer from the field, and so may have the focus moved. */
  invited: () => boolean
  /** The answer has decided about the focus; the container forgets the request. */
  settled: () => void
  onPref: (p: StepPref) => void
  onOffer: (job: JobId) => void
  onTry: () => void
}) {
  const [shown, setShown] = useState(() => initialShown(doc.moves.length, pref))
  const [copied, setCopied] = useState(false)
  // "Let me try first" has been pressed for this piece of working: the invitation goes, the
  // step buttons stay.
  const [trying, setTrying] = useState(false)
  const tryBtn = useRef<HTMLButtonElement>(null)
  // A new piece of working starts the way the student prefers: hidden, so they can try first,
  // or all at once. The preference is read when the document changes, not on every render, so
  // pressing "Show all" is not undone by the next keystroke.
  useEffect(() => {
    setShown(initialShown(doc.moves.length, pref))
    setTrying(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `pref` is read, not followed: see above
  }, [doc])

  const hidden = doc.moves.length - shown
  const finished = hidden === 0
  const offer = offeredJob(doc, JOB_IDS)
  // A new answer with its steps hidden asks the student to try: that button is the primary
  // one, so Enter after "Work it out" chooses trying rather than a reveal.
  const inviting = invitesTry(doc.moves.length, shown, trying)
  // It takes the focus only when the answer was asked for from the field. Focusing whenever the
  // invitation appeared pulled the keyboard away on every remount (switching back to Calculator
  // mode re-mounts this view with the old answer) and off the "Treat as" select mid-arrow-key,
  // because each arrow re-runs the working. The flag is cleared on the answer that consumes it,
  // or on one that cannot invite (every step showing, or a refusal), so it never outlives its
  // own answer. The reset effect above lands a render later than the new doc, which is why this
  // waits for `inviting` rather than deciding from the stale `shown`.
  useEffect(() => {
    if (!invited()) return
    if (!invitesTry(doc.moves.length, initialShown(doc.moves.length, pref), false)) {
      settled()
      return
    }
    if (inviting) {
      settled()
      tryBtn.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs for a new answer or a change of invitation only; `invited`/`settled` are the container's stable readers and `pref` is read the way the reset effect reads it
  }, [doc, inviting])

  const copyAll = (): void => {
    const lines = [
      `${doc.title}:  ${doc.input}`,
      ...doc.moves.map((m, i) => `${i + 1}. ${m.head}${m.rule ? `   [${m.rule}]` : ''}${m.tex ? `\n   ${m.tex}` : ''}`),
      ...doc.answers.map((a) => `${a.label} ${a.tex}`),
      doc.check ? texToPlain(doc.check) : ''
    ]
    navigator.clipboard?.writeText(lines.filter(Boolean).join('\n')).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1400)
      },
      () => undefined
    )
  }

  if (doc.error) {
    return (
      <div className="card m-3 border-[color:var(--warn)]/40 p-3">
        <div className="mb-1 flex items-center gap-2 text-[color:var(--warn)]">
          <TriangleAlert size={15} /> I cannot do that one
        </div>
        <div className="text-[color:var(--text-dim)]">{doc.error}</div>
      </div>
    )
  }

  return (
    <div className="pure-doc">
      <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
        <BookOpen size={15} className="text-[color:var(--accent)]" />
        <div className="text-lead font-semibold text-[color:var(--text-strong)]">{doc.title}</div>
        <Tex tex={doc.input} className="text-[color:var(--text-dim)]" />
        {doc.method && <span className="pure-method">{doc.method}</span>}
        <div className="flex-1" />
        <button className="btn ghost" onClick={copyAll} title="Copy the whole working">
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* The answer is never hidden: it is pinned here, above the steps, whatever is shown below. */}
      {doc.answers.length > 0 && <AnswerCard doc={doc} />}

      {offer && doc.offer && (
        <div className="flex flex-wrap items-center gap-2 px-3 pt-2">
          <button className="btn" onClick={() => onOffer(offer)} title={doc.offer.hint}>
            {doc.offer.label}
          </button>
          <span className="text-[color:var(--text-faint)]">{doc.offer.hint}</span>
        </div>
      )}

      {doc.moves.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
          {shown === 0 && <span className="text-ink-dim">{trying ? 'Whenever you are ready, check a step.' : 'Try it yourself first, then check a step at a time.'}</span>}
          {inviting && (
            <button
              ref={tryBtn}
              className="btn primary"
              title="Keep the steps hidden and go back to the field"
              onClick={() => {
                setTrying(true)
                onTry()
              }}
              onKeyDown={(e) => {
                // A student who presses Enter, sees the answer and starts correcting a typo is
                // typing at this button. Those keys go back to the field, and never on to the
                // window, where Backspace deletes the selection and a letter switches tools.
                if (!isEditingKey(e)) return
                e.stopPropagation()
                setTrying(true)
                onTry()
              }}
            >
              <Pencil size={13} /> Let me try first
            </button>
          )}
          {hidden > 0 && (
            <>
              <button className="btn" onClick={() => setShown((n) => n + 1)}>
                <Lightbulb size={13} /> {shown === 0 ? 'Show a step' : 'Next step'}
              </button>
              <button className="btn ghost" onClick={() => setShown(doc.moves.length)}>
                Show all {doc.moves.length} steps
              </button>
              {shown > 0 && <span className="text-[color:var(--text-faint)]">{hidden} to go</span>}
            </>
          )}
          {finished && (
            <button
              className="btn ghost"
              title="Hide the working so you can try it yourself"
              onClick={() => {
                setShown(0)
                setTrying(true)
                onTry()
              }}
            >
              <Lightbulb size={13} /> Let me try first
            </button>
          )}
          <div className="flex-1" />
          <label className="flex items-center gap-1 text-[color:var(--text-faint)]" title="Whether new working starts with every step showing">
            <input type="checkbox" checked={pref === 'all'} onChange={(e) => onPref(e.target.checked ? 'all' : 'try')} />
            Always show all steps
          </label>
        </div>
      )}

      <ol className="mt-2 space-y-1 px-3">
        {doc.moves.slice(0, shown).map((m, i) => (
          <MoveRow key={i} n={i + 1} {...m} />
        ))}
      </ol>
      <div className="h-3" />
    </div>
  )
}

export function AnswerCard({ doc }: { doc: WorkingDoc }) {
  const tone = checkTone(doc)
  return (
    <div className="pure-answer mx-3 mt-3">
      <div className="mb-1 text-fine uppercase tracking-wide text-[color:var(--warn)]">Answer</div>
      {doc.answers.map((a, i) => (
        <div key={`${a.label}-${i}`} className="flex items-baseline gap-3 py-0.5">
          <span className="w-24 shrink-0 text-[color:var(--text-dim)]">{a.label}</span>
          <Tex tex={a.tex} className="text-lead text-ink-strong" />
        </div>
      ))}
      {doc.noWorking && (
        <div className="mt-2 text-[color:var(--text-dim)]">
          That answer is right, but this one is past the methods I can write out by hand, so there are no steps for it.
          {doc.reason && <div className="mt-1 text-[color:var(--text-faint)]">Why: {texToPlain(doc.reason)}</div>}
        </div>
      )}
      {doc.check && !doc.noWorking && (
        <div className={`mt-2 ${tone === 'failed' ? 'text-[color:var(--bad)]' : tone === 'ok' ? 'text-[color:var(--good)]' : 'text-[color:var(--text-dim)]'}`}>
          {tone === 'ok' ? '✓ ' : ''}
          {texToPlain(doc.check)}
        </div>
      )}
    </div>
  )
}

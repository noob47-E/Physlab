import { useEffect, useRef, useState } from 'react'
import { BookOpen, Check, ChevronDown, ChevronUp, Copy, Eye, History, Lightbulb, Play, Trash2, TriangleAlert, X } from 'lucide-react'
import { Tex } from '../ui/Tex'
import { MathInput, type MathInputHandle } from '../ui/MathInput'
import { parseExpr, varsOf } from '../math/pure/mono'
import { usePure, type PureEntry } from '../math/pure/store'
import { JOBS, jobById, type JobId } from '../math/pure/run'
import { texToPlain, type Working as WorkingDoc } from '../math/pure/work'
import { STEP_PREF_KEY, checkTone, fieldHasText, initialShown, offeredJob, stepPrefFrom, type StepPref, type TreatAs } from '../math/pure/reveal'
import { visualizeGraph } from '../core/visualize'
import { showPanel } from '../app/panels'
import { useCasStatus } from '../math/cas'

const JOB_IDS: readonly JobId[] = JOBS.map((j) => j.id)

const readStepPref = (): StepPref => {
  try {
    return stepPrefFrom(localStorage.getItem(STEP_PREF_KEY))
  } catch {
    return 'try'
  }
}

const writeStepPref = (p: StepPref): void => {
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
function MoveRow({ n, head, rule, tex, note }: { n: number; head: string; rule?: string; tex?: string; note?: string }) {
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

function WorkingView({ doc, pref, onPref, onOffer }: { doc: WorkingDoc; pref: StepPref; onPref: (p: StepPref) => void; onOffer: (job: JobId) => void }) {
  const [shown, setShown] = useState(() => initialShown(doc.moves.length, pref))
  const [copied, setCopied] = useState(false)
  // A new piece of working starts the way the student prefers: hidden, so they can try first,
  // or all at once. The preference is read when the document changes, not on every render, so
  // pressing "Show all" is not undone by the next keystroke.
  useEffect(() => setShown(initialShown(doc.moves.length, pref)), [doc]) // eslint-disable-line react-hooks/exhaustive-deps

  const hidden = doc.moves.length - shown
  const finished = hidden === 0
  const offer = offeredJob(doc, JOB_IDS)

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
        <div className="text-[14px] font-semibold text-[color:var(--text-strong)]">{doc.title}</div>
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
          {shown === 0 && <span className="text-[color:var(--text-dim)]">Try it yourself first, then check a step at a time.</span>}
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
            <button className="btn ghost" onClick={() => setShown(0)} title="Hide the working so you can try it yourself">
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

function AnswerCard({ doc }: { doc: WorkingDoc }) {
  const tone = checkTone(doc)
  return (
    <div className="pure-answer mx-3 mt-3">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-[color:var(--warn)]">Answer</div>
      {doc.answers.map((a, i) => (
        <div key={`${a.label}-${i}`} className="flex items-baseline gap-3 py-0.5">
          <span className="w-24 shrink-0 text-[color:var(--text-dim)]">{a.label}</span>
          <Tex tex={a.tex} className="text-[16px] text-[color:var(--text-strong)]" />
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

function HistoryList({ items, onPick, onDrop, onClear, onClose }: { items: PureEntry[]; onPick: (id: string) => void; onDrop: (id: string) => void; onClear: () => void; onClose: () => void }) {
  return (
    <div className="pure-history">
      <div className="flex items-center gap-2 border-b border-[color:var(--line)] px-2 py-1.5">
        <History size={13} className="text-[color:var(--text-dim)]" />
        <span className="flex-1 text-[color:var(--text-dim)]">History</span>
        {items.length > 0 && (
          <button className="icon-btn" title="Clear the history" onClick={onClear}>
            <Trash2 size={13} />
          </button>
        )}
        <button className="icon-btn" title="Close the history" onClick={onClose}>
          <X size={13} />
        </button>
      </div>
      {items.length === 0 && <div className="p-2 text-[color:var(--text-faint)]">Nothing worked out yet.</div>}
      <div className="min-h-0 flex-1 overflow-auto">
        {items.map((h) => (
          <div key={h.id} className="pure-hist-row" onClick={() => onPick(h.id)} title={`${h.title}: ${h.input}`}>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[color:var(--text-faint)]">{jobById(h.job).label}</div>
              <div className="truncate text-[color:var(--text)]">{h.input}</div>
              {h.answer && (
                <div className="truncate text-[color:var(--text-dim)]">
                  <Tex tex={h.answer} />
                </div>
              )}
            </div>
            <button
              className="icon-btn"
              title="Remove"
              onClick={(e) => {
                e.stopPropagation()
                onDrop(h.id)
              }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * True when "y = this" is something the grapher can draw: one letter, and that letter is x.
 * Offering the button for 27a³ + 8b³ would only produce an error in the console.
 */
function graphable(src: string): boolean {
  if (!src.trim()) return false
  try {
    const vars = varsOf(parseExpr(src.split('=')[0]))
    return vars.length === 1 && vars[0] === 'x'
  } catch {
    return false
  }
}

export function Working() {
  const { job, input, inputLatex, working, asking, history, run, runLatex, setJob, recall, remove, clearHistory } = usePure()
  const casStatus = useCasStatus((s) => s.status)
  const [latex, setLatex] = useState(inputLatex)
  // The history rail starts closed: the working needs the room more than the list does.
  const [showHistory, setShowHistory] = useState(false)
  const [treatAs, setTreatAs] = useState<TreatAs>('auto')
  const [pref, setPref] = useState<StepPref>(readStepPref)
  const [showExamples, setShowExamples] = useState(false)
  const field = useRef<MathInputHandle>(null)

  // A recalled entry has to appear in the input box, not just in the working below. This must
  // follow inputLatex and never input: input is the linear form, and MathLive reads whatever it is
  // handed as LaTeX, so x^(2) would come back as a stray bracket in the student's expression.
  useEffect(() => setLatex(inputLatex), [inputLatex])

  const go = (which?: JobId): void => {
    if (!fieldHasText(latex)) return
    // Auto: the job is guessed from what was typed, and the title above the working says which.
    // The store converts the LaTeX itself, so a converter refusal reaches the student as a sentence.
    runLatex(latex, which ?? treatAs)
  }

  const setPreference = (p: StepPref): void => {
    setPref(p)
    writeStepPref(p)
  }

  // The example belongs to the chosen job, or to the last job run when the choice is automatic.
  const def = jobById(treatAs === 'auto' ? job : treatAs)

  return (
    <div className="panel flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-[color:var(--line)] p-2">
        <div className="mb-2 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <MathInput
              ref={field}
              value={latex}
              onChange={setLatex}
              placeholder={treatAs === 'auto' ? 'Type an expression, an equation, or a list of numbers' : def.placeholder}
              onEnter={() => go()}
              className="w-full"
            />
          </div>
          <button className="btn primary" onClick={() => go()} title="Work it out">
            <Play size={13} /> Work it out
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-[color:var(--text-dim)]">
            Treat as
            <select
              className="field w-auto"
              value={treatAs}
              title="What to do with what you typed. Auto guesses from the shape of it."
              onChange={(e) => {
                const v = e.target.value as TreatAs
                setTreatAs(v)
                if (v !== 'auto') {
                  setJob(v)
                  if (fieldHasText(latex)) go(v)
                }
              }}
            >
              <option value="auto">Auto (guess from what I typed)</option>
              {JOBS.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn ghost"
            title={`Load an example: ${def.example}`}
            onClick={() => {
              setLatex(def.exampleLatex)
              run(def.id, def.example, def.exampleLatex)
            }}
          >
            Example
          </button>
          <div className="flex-1" />
          <button className={`icon-btn ${showHistory ? 'on' : ''}`} title="History" onClick={() => setShowHistory(!showHistory)}>
            <History size={14} />
          </button>
        </div>
        {treatAs !== 'auto' && <div className="mt-1 text-[color:var(--text-faint)]">{def.about}</div>}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto">
          {!working && (
            <div className="p-4 text-[color:var(--text-dim)]">
              <div className="mb-2 text-[color:var(--text)]">Type something above and press Work it out.</div>
              <div>
                Every answer here is worked out exactly — in fractions, never in rounded decimals — and checked by putting it
                back together before it is shown to you. The steps stay hidden until you ask, so you can try first.
              </div>
              <button className="btn ghost mt-3" onClick={() => setShowExamples(!showExamples)}>
                {showExamples ? <ChevronUp size={13} /> : <ChevronDown size={13} />} What can it do?
              </button>
              {showExamples && (
                <ul className="mt-2 space-y-1">
                  {JOBS.map((j) => (
                    <li key={j.id}>
                      <button
                        className="btn ghost"
                        onClick={() => {
                          setJob(j.id)
                          setLatex(j.exampleLatex)
                          run(j.id, j.example, j.exampleLatex)
                        }}
                      >
                        {j.label}
                      </button>
                      <span className="ml-2 text-[color:var(--text-faint)]">{j.example}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {working && <WorkingView doc={working} pref={pref} onPref={setPreference} onOffer={(j) => run(j, input, inputLatex)} />}
          {asking && (
            <div className="px-3 pb-3 text-[color:var(--text-dim)]">
              Checking that one a different way{casStatus === 'loading' ? ' (starting the algebra engine, this takes a moment the first time)' : ''}…
            </div>
          )}
          {working && !working.error && graphable(input) && (
            <div className="px-3 pb-4">
              <button
                className="btn ghost"
                title="Draw y = this expression in the viewport, so you can see where the roots are"
                onClick={() => {
                  // visualizeGraph wants the expression itself, not "y = …", and an equation is
                  // graphed as its left-hand side so the roots land where the curve crosses y = 0.
                  visualizeGraph(input, [input.split('=')[0].trim()], 'explicit')
                  showPanel('viewport')
                }}
              >
                <Eye size={13} /> Show on the graph
              </button>
            </div>
          )}
        </div>
        {showHistory && <HistoryList items={history} onPick={recall} onDrop={remove} onClear={clearHistory} onClose={() => setShowHistory(false)} />}
      </div>
    </div>
  )
}

// Question Author, Solution tab: a card per part (what is asked, the answer built from chips, its
// unit and how close is close enough, the common mistakes), a card per step of the working, how
// much of the working a student sees at first, and steps PhysLab's own engine writes — the Pure
// Math working or a vector solver's — worked out afresh for every student's numbers.

import { useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Cpu, Plus, Trash2 } from 'lucide-react'
import { useScene } from '../core/store'
import { MathInput, type MathInputHandle } from '../ui/MathInput'
import { NumField } from '../ui/fields'
import { Tex } from '../ui/Tex'
import { texToPlain } from '../math/pure/work'
import { JOBS, type JobId } from '../math/pure/run'
import { blankPart, changePartType, chipKatex, chipTex, parseLetters, partCheck, previewAutoStep, pureInputFromLatex, pureInputLatex, SOLVERS, suggestAutoStep } from '../questions/authoring'
import { useAuthor, useAuthorView } from '../questions/authorStore'
import { substitute, drawVariables } from '../questions/variables'
import type { DistractorRule, FadingLevel, PQPart, PQQuestion, PQStep } from '../questions/pqjson'
import { ChipBar, FormulaField, UnitSelect } from './AuthorVariables'
import { ChipText, TexField } from './AuthorScene'

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

const PART_TYPES: { type: PQPart['type']; label: string }[] = [
  { type: 'number', label: 'A number' },
  { type: 'expression', label: 'A formula' },
  { type: 'choice', label: 'A choice' }
]

/** Each wrong-option rule as the mistake a student makes. */
const RULE_WORDS: Record<DistractorRule, string> = {
  sign: 'The sign turned round',
  reciprocal: 'Upside down (1 ÷ the answer)',
  'slope-for-value': 'Read the height where the slope was asked',
  'value-for-slope': 'Read the slope where the height was asked',
  'area-for-value': 'Took the area instead of the value',
  'ignore-initial': 'Left out the starting value',
  'g-10': 'Used g = 10',
  'half-double': 'Lost or doubled a half',
  'power-of-ten': 'Out by a power of ten'
}

const KIND_WORDS: { kind: 'number' | 'angle' | 'direction'; label: string }[] = [
  { kind: 'number', label: 'A number' },
  { kind: 'angle', label: 'An angle' },
  { kind: 'direction', label: 'A direction (checked round the circle)' }
]

function LettersBox({ symbols, variables, onCommit }: { symbols: string[]; variables: readonly string[]; onCommit: (letters: string[]) => void }) {
  const [text, setText] = useState(symbols.join(', '))
  const [problem, setProblem] = useState<string | null>(null)
  return (
    <label className="block">
      <span className="text-small text-ink-dim">Letters the student may use</span>
      <input
        className="field mt-1 min-h-[44px] font-math"
        value={text}
        placeholder="x"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const r = parseLetters(text, variables)
          if (r.problem !== undefined) {
            setProblem(r.problem)
            return
          }
          setProblem(null)
          onCommit(r.letters)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          e.stopPropagation()
        }}
      />
      {problem && <div className="mt-0.5 text-small text-bad">{problem}</div>}
    </label>
  )
}

/** One part's answer for the numbers of the preview row "Show it" uses: the teacher checks it at a glance. */
function AnswerCheck({ q, k }: { q: PQQuestion; k: number }) {
  const settings = useScene((s) => s.settings)
  const seed = useAuthorView((s) => s.seed)
  const shown = useMemo(() => partCheck(q, k, seed, settings), [q, seed, settings, k])
  if (!shown) return null
  return (
    <div className={`mt-1 text-small ${shown.kind === 'problem' ? 'text-bad' : 'text-ink-dim'}`}>
      {shown.kind === 'answer' ? (
        <>
          With row {seed}’s numbers the answer is {shown.text ?? <Tex tex={shown.tex} />}.
        </>
      ) : (
        shown.text
      )}
    </div>
  )
}

function PartCard({ q, p, k, names }: { q: PQQuestion; p: PQPart; k: number; names: readonly string[] }) {
  const edit = useAuthor((s) => s.edit)
  const change = (recipe: (d: PQPart) => void) =>
    edit((d) => {
      recipe(d.parts[k] as PQPart)
    })
  const many = q.parts.length > 1

  return (
    <div className="card p-2">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-ink-strong">Part {k + 1}</span>
        <div className="seg ml-1" role="radiogroup" aria-label={`What part ${k + 1} asks for`}>
          {PART_TYPES.map((t) => (
            <button
              key={t.type}
              role="radio"
              aria-checked={p.type === t.type}
              className={`min-h-[44px] ${p.type === t.type ? 'on' : ''}`}
              onClick={() =>
                edit((d) => {
                  d.parts[k] = changePartType(d.parts[k] as PQPart, t.type)
                })
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        {many && (
          <>
            <button
              className="icon-btn ml-auto min-h-[44px] min-w-[44px]"
              aria-label={`Move part ${k + 1} up`}
              disabled={k === 0}
              onClick={() => edit((d) => void d.parts.splice(k - 1, 0, d.parts.splice(k, 1)[0]))}
            >
              <ArrowUp size={14} />
            </button>
            <button
              className="icon-btn min-h-[44px] min-w-[44px]"
              aria-label={`Move part ${k + 1} down`}
              disabled={k === q.parts.length - 1}
              onClick={() => edit((d) => void d.parts.splice(k + 1, 0, d.parts.splice(k, 1)[0]))}
            >
              <ArrowDown size={14} />
            </button>
            <button className="icon-btn min-h-[44px] min-w-[44px]" aria-label={`Remove part ${k + 1}`} onClick={() => edit((d) => void d.parts.splice(k, 1))}>
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>

      <div className="mt-2">
        <ChipText label={`What part ${k + 1} asks`} placeholder="How far does it go while braking?" value={p.prompt} names={names} onCommit={(t) => change((d) => void (d.prompt = t))} />
      </div>

      {p.type === 'number' && (
        <div className="mt-2 space-y-2">
          <FormulaField label="The answer" placeholder="built from the variables" expr={p.answer} names={names} onCommit={(e) => change((d) => d.type === 'number' && void (d.answer = e))} />
          <AnswerCheck q={q} k={k} />
          <div className="flex flex-wrap items-center gap-2">
            <UnitSelect id={`part-unit-${k}`} label="Its unit" value={p.unit} onChange={(u) => change((d) => d.type === 'number' && void (d.unit = u))} />
            <label className="flex items-center gap-2">
              <span className="text-small text-ink-dim">It is</span>
              <select
                className="field min-h-[44px] w-auto"
                value={p.kind ?? 'number'}
                onChange={(e) => {
                  const kind = e.target.value as 'number' | 'angle' | 'direction'
                  change((d) => {
                    if (d.type !== 'number') return
                    if (kind === 'number') delete d.kind
                    else d.kind = kind
                  })
                }}
              >
                {KIND_WORDS.map((w) => (
                  <option key={w.kind} value={w.kind}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-small text-ink-dim">Marked right within</span>
            <div className="w-20">
              <NumField
                className="min-h-[44px]"
                value={p.tolerance.kind === 'relative' ? p.tolerance.value * 100 : p.tolerance.value}
                onChange={(x) => change((d) => d.type === 'number' && void (d.tolerance.value = Math.abs(d.tolerance.kind === 'relative' ? x / 100 : x)))}
              />
            </div>
            <div className="seg" role="radiogroup" aria-label="How close is close enough">
              {(['relative', 'absolute'] as const).map((kind) => (
                <button
                  key={kind}
                  role="radio"
                  aria-checked={p.tolerance.kind === kind}
                  className={`min-h-[44px] ${p.tolerance.kind === kind ? 'on' : ''}`}
                  onClick={() =>
                    change((d) => {
                      if (d.type !== 'number' || d.tolerance.kind === kind) return
                      // The same number of the new kind: 2 % becomes ± 2 of the unit, not ± 0.02.
                      d.tolerance = { kind, value: kind === 'relative' ? d.tolerance.value / 100 : d.tolerance.value * 100 }
                    })
                  }
                >
                  {kind === 'relative' ? '%' : p.unit === 'none' ? 'either way' : `${p.unit} either way`}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-small text-ink-dim">Common mistakes — a student who gives one of these is told why</div>
            {(p.traps ?? []).map((t, j) => (
              <div key={j} className="mt-1 rounded-md border border-line p-2">
                <div className="flex items-start gap-1">
                  <div className="min-w-0 flex-1">
                    <FormulaField label="The wrong answer" expr={t.value} names={names} onCommit={(e) => change((d) => d.type === 'number' && d.traps && void (d.traps[j].value = e))} />
                  </div>
                  <button
                    className="icon-btn min-h-[44px] min-w-[44px]"
                    aria-label={`Remove mistake ${j + 1}`}
                    onClick={() =>
                      change((d) => {
                        if (d.type !== 'number' || !d.traps) return
                        d.traps.splice(j, 1)
                        if (d.traps.length === 0) delete d.traps
                      })
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <ChipText label="What to tell the student" placeholder="What went wrong, in a sentence" value={t.why} names={names} chips={false} onCommit={(w) => change((d) => d.type === 'number' && d.traps && void (d.traps[j].why = w))} />
              </div>
            ))}
            <button className="btn mt-1 min-h-[44px]" onClick={() => change((d) => d.type === 'number' && void (d.traps = [...(d.traps ?? []), { value: '', why: '' }]))}>
              <Plus size={14} /> Add a common mistake
            </button>
          </div>
        </div>
      )}

      {p.type === 'expression' && (
        <div className="mt-2 space-y-2">
          <FormulaField label="The answer" expr={p.answer} names={names} free={p.symbols} onCommit={(e) => change((d) => d.type === 'expression' && void (d.answer = e))} />
          {/* Keyed by its letters: the card is keyed by position, so after a part moves or goes this
              box would keep the other part's letters and commit them to this one on blur. */}
          <LettersBox key={p.symbols.join(',')} symbols={p.symbols} variables={names} onCommit={(letters) => change((d) => d.type === 'expression' && void (d.symbols = letters))} />
          <AnswerCheck q={q} k={k} />
        </div>
      )}

      {p.type === 'choice' && (
        <div className="mt-2 space-y-2">
          <div className="seg flex w-full" role="radiogroup" aria-label="Where the options come from">
            <button role="radio" aria-checked={!p.distractors} className={`min-h-[44px] flex-1 ${!p.distractors ? 'on' : ''}`} onClick={() => change((d) => d.type === 'choice' && void delete d.distractors)}>
              I write the options
            </button>
            <button
              role="radio"
              aria-checked={!!p.distractors}
              className={`min-h-[44px] flex-1 ${p.distractors ? 'on' : ''}`}
              onClick={() => change((d) => d.type === 'choice' && !d.distractors && void (d.distractors = { correct: '', unit: 'none', rules: ['sign', 'half-double', 'power-of-ten'] }))}
            >
              Made from common mistakes
            </button>
          </div>
          {p.distractors ? (
            <>
              <FormulaField label="The right answer" expr={p.distractors.correct} names={names} onCommit={(e) => change((d) => d.type === 'choice' && d.distractors && void (d.distractors.correct = e))} />
              <UnitSelect id={`choice-unit-${k}`} value={p.distractors.unit} onChange={(u) => change((d) => d.type === 'choice' && d.distractors && void (d.distractors.unit = u))} />
              <fieldset>
                <legend className="text-small text-ink-dim">Wrong options from these mistakes</legend>
                {(Object.keys(RULE_WORDS) as DistractorRule[]).map((rule) => (
                  <label key={rule} className="flex min-h-[44px] items-center gap-2 text-ink">
                    <input
                      type="checkbox"
                      checked={p.distractors!.rules.includes(rule)}
                      onChange={(e) => {
                        const on = e.target.checked
                        change((d) => {
                          if (d.type !== 'choice' || !d.distractors) return
                          d.distractors.rules = on ? [...d.distractors.rules, rule] : d.distractors.rules.filter((r) => r !== rule)
                        })
                      }}
                    />
                    {RULE_WORDS[rule]}
                  </label>
                ))}
              </fieldset>
              <AnswerCheck q={q} k={k} />
            </>
          ) : (
            <>
              {p.choices.map((c, j) => (
                <div key={j} className="rounded-md border border-line p-2">
                  <div className="flex items-start gap-2">
                    <label className="flex min-h-[44px] items-center gap-1 text-small text-ink-dim">
                      <input type="checkbox" checked={c.correct} onChange={(e) => change((d) => d.type === 'choice' && void (d.choices[j].correct = e.target.checked))} />
                      Right
                    </label>
                    <div className="min-w-0 flex-1">
                      <ChipText label={`Option ${j + 1}`} placeholder={`Option ${j + 1}`} value={c.text} names={names} chips={false} onCommit={(t) => change((d) => d.type === 'choice' && void (d.choices[j].text = t))} />
                    </div>
                    {p.choices.length > 2 && (
                      <button className="icon-btn min-h-[44px] min-w-[44px]" aria-label={`Remove option ${j + 1}`} onClick={() => change((d) => d.type === 'choice' && void d.choices.splice(j, 1))}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <ChipText
                    label={`Why option ${j + 1} is ${c.correct ? 'right' : 'wrong'} (optional)`}
                    placeholder={c.correct ? 'Why it is right (optional)' : 'Why it is wrong (optional)'}
                    value={c.why ?? ''}
                    names={names}
                    chips={false}
                    onCommit={(w) => change((d) => d.type === 'choice' && void (d.choices[j].why = w.trim() === '' ? undefined : w))}
                  />
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-3">
                <button className="btn min-h-[44px]" onClick={() => change((d) => d.type === 'choice' && void d.choices.push({ text: '', correct: false }))}>
                  <Plus size={14} /> Add an option
                </button>
                <label className="flex min-h-[44px] items-center gap-2 text-ink">
                  <input type="checkbox" checked={p.shuffle} onChange={(e) => change((d) => d.type === 'choice' && void (d.shuffle = e.target.checked))} />
                  Shuffle the options for each student
                </label>
              </div>
            </>
          )}
        </div>
      )}

      <label className="mt-2 flex items-center gap-2">
        <span className="text-small text-ink-dim">Marks</span>
        <div className="w-16">
          <NumField className="min-h-[44px]" decimals={0} value={p.marks} onChange={(x) => change((d) => void (d.marks = Math.max(1, Math.round(x))))} />
        </div>
      </label>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

const LEVELS: { level: FadingLevel; label: string; about: string }[] = [
  { level: 'worked', label: 'Every line', about: 'The student sees the whole working.' },
  { level: 'half', label: 'Some lines hidden', about: 'Lines you mark are left for the student to fill in, then reveal.' },
  { level: 'solo', label: 'Headings only', about: 'Only what each line does; the student writes the maths.' }
]

function MovesPreview({ moves }: { moves: { head: string; tex?: string }[] }) {
  return (
    <ol className="mt-1 space-y-1 border-l-2 border-line pl-2 text-small">
      {moves.map((m, i) => (
        <li key={i}>
          {m.head && <div className="text-ink-dim">{texToPlain(m.head)}</div>}
          {m.tex && <Tex tex={m.tex} />}
        </li>
      ))}
    </ol>
  )
}

function StepCard({ q, st, k, names }: { q: PQQuestion; st: PQStep; k: number; names: readonly string[] }) {
  const edit = useAuthor((s) => s.edit)
  const settings = useScene((s) => s.settings)
  const count = q.steps?.items.length ?? 0
  const change = (recipe: (d: PQStep) => void) =>
    edit((d) => {
      if (d.steps) recipe(d.steps.items[k] as PQStep)
    })
  const auto = st.auto
  const preview = useMemo(() => (auto ? previewAutoStep(q, st, settings) : []), [auto, q, st, settings])

  return (
    <div className="card p-2">
      <div className="flex items-center gap-1">
        <span className="text-ink-strong">{auto ? `Step ${k + 1} — worked out by PhysLab` : `Step ${k + 1}`}</span>
        <button className="icon-btn ml-auto min-h-[44px] min-w-[44px]" aria-label={`Move step ${k + 1} up`} disabled={k === 0} onClick={() => edit((d) => d.steps && void d.steps.items.splice(k - 1, 0, d.steps.items.splice(k, 1)[0]))}>
          <ArrowUp size={14} />
        </button>
        <button
          className="icon-btn min-h-[44px] min-w-[44px]"
          aria-label={`Move step ${k + 1} down`}
          disabled={k === count - 1}
          onClick={() => edit((d) => d.steps && void d.steps.items.splice(k + 1, 0, d.steps.items.splice(k, 1)[0]))}
        >
          <ArrowDown size={14} />
        </button>
        <button
          className="icon-btn min-h-[44px] min-w-[44px]"
          aria-label={`Remove step ${k + 1}`}
          onClick={() =>
            edit((d) => {
              if (!d.steps) return
              d.steps.items.splice(k, 1)
              if (d.steps.items.length === 0) delete d.steps
            })
          }
        >
          <Trash2 size={14} />
        </button>
      </div>
      {auto ? (
        <div className="mt-1">
          <div className="text-small text-ink-dim">
            {auto.engine === 'pure'
              ? <>{JOBS.find((j) => j.id === auto.job)?.label ?? auto.job} <Tex tex={pureInputLatex(auto.input, names, chipKatex)} />, with each student’s numbers. For row 1:</>
              : `${SOLVERS.find((s) => s.name === auto.solver)?.label ?? auto.solver}, with each student’s numbers. For row 1:`}
          </div>
          <MovesPreview moves={preview} />
        </div>
      ) : (
        <div className="mt-1 space-y-2">
          <ChipText label={`What step ${k + 1} does`} placeholder="Distance is the average speed times the time." value={st.head} names={names} onCommit={(t) => change((d) => void (d.head = t))} />
          <TexField label="The maths" tex={st.tex ?? ''} names={names} onCommit={(t) => change((d) => void (d.tex = t.trim() === '' ? undefined : t))} />
          <TexField label="The rule it uses (optional)" tex={st.rule ?? ''} names={names} onCommit={(t) => change((d) => void (d.rule = t.trim() === '' ? undefined : t))} />
          <ChipText label="A note (optional)" placeholder="A note (optional)" value={st.note ?? ''} names={names} chips={false} onCommit={(t) => change((d) => void (d.note = t.trim() === '' ? undefined : t))} />
          <label className="flex min-h-[44px] items-center gap-2 text-ink">
            <input type="checkbox" checked={st.blank === true} onChange={(e) => change((d) => void (e.target.checked ? (d.blank = true) : delete d.blank))} />
            Leave this line for the student when some lines are hidden
          </label>
        </div>
      )}
    </div>
  )
}

/** "Auto-generate steps from the engine": the working PhysLab writes itself, for every student's numbers. */
function EngineSteps({ q, names }: { q: PQQuestion; names: readonly string[] }) {
  const settings = useScene((s) => s.settings)
  const edit = useAuthor((s) => s.edit)
  const [engine, setEngine] = useState<'pure' | 'vectors'>('pure')
  const ref = useRef<MathInputHandle>(null)
  const [latex, setLatex] = useState('')
  const [input, setInput] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [job, setJob] = useState<JobId | null>(null)
  const [solver, setSolver] = useState(SOLVERS[0]?.name ?? '')
  const [args, setArgs] = useState<string[]>([''])

  const values = useMemo(() => drawVariables(q, 1).values, [q])
  const suggested = useMemo(() => (input ? suggestAutoStep(substitute(input, values, {}, settings)) : null), [input, values, settings])
  const chosenJob: JobId = job ?? suggested?.job ?? 'factor'
  const step = useMemo(
    (): PQStep | null =>
      engine === 'pure' ? (input ? { head: '', auto: { engine: 'pure', job: chosenJob, input } } : null) : { head: '', auto: { engine: 'vectors', solver, args: args.filter((a) => a.trim() !== '') } },
    [engine, input, chosenJob, solver, args]
  )
  const preview = useMemo(() => (step ? previewAutoStep(q, step, settings) : []), [q, step, settings])
  const failed = preview.length === 1 && preview[0].head === 'PhysLab could not work this step out.'

  const onField = (next: string) => {
    setLatex(next)
    const r = pureInputFromLatex(next, names)
    if (r.problem !== undefined) {
      setProblem(r.problem)
      return
    }
    setProblem(null)
    setInput(r.input)
  }

  const add = () => {
    if (!step || failed) return
    edit((d) => {
      d.steps ??= { level: 'worked', items: [] }
      d.steps.items.push(step)
    })
    setLatex('')
    setInput('')
    setJob(null)
    setArgs([''])
  }

  return (
    <div className="card p-2">
      <div className="flex items-center gap-2 text-ink-strong">
        <Cpu size={14} /> Auto-generate steps from the engine
      </div>
      <div className="mt-1 text-small text-ink-dim">PhysLab works these lines out again for every student’s numbers, so they always match the answer.</div>
      <div className="seg mt-2 flex w-full" role="radiogroup" aria-label="Which engine">
        <button role="radio" aria-checked={engine === 'pure'} className={`min-h-[44px] flex-1 ${engine === 'pure' ? 'on' : ''}`} onClick={() => setEngine('pure')}>
          Algebra (the Maths screen)
        </button>
        <button role="radio" aria-checked={engine === 'vectors'} className={`min-h-[44px] flex-1 ${engine === 'vectors' ? 'on' : ''}`} onClick={() => setEngine('vectors')}>
          A vector solver
        </button>
      </div>
      {engine === 'pure' ? (
        <div className="mt-2 space-y-2">
          <div className="text-small text-ink-dim">What to work on</div>
          <MathInput ref={ref} value={latex} onChange={onField} placeholder="such as x² − 5x + k" size="sm" className="w-full" />
          <ChipBar names={names} onChip={(n) => ref.current?.insert(chipTex(n))} />
          {problem && <div className="text-small text-bad">{problem}</div>}
          {input && (
            <label className="flex flex-wrap items-center gap-2">
              <span className="text-small text-ink-dim">PhysLab would {suggested ? suggested.label.toLowerCase() : 'work on'} this. Do</span>
              <select className="field min-h-[44px] w-auto" value={chosenJob} onChange={(e) => setJob(e.target.value as JobId)}>
                {JOBS.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <label className="block">
            <span className="text-small text-ink-dim">Solver</span>
            <select className="field mt-1 min-h-[44px]" value={solver} onChange={(e) => setSolver(e.target.value)}>
              {SOLVERS.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {/* Each input is a line with chips: a variable goes in as its chip, which the solver
              reads as the student's number. A word typed bare stays a word on purpose — a
              solver is also given the vector's own name (F) and its unit (N) in words, and a
              bundled question passes both F and the chip for F to the same solver. */}
          {args.map((a, j) => (
            <div key={j} className="flex items-start gap-1">
              <div className="min-w-0 flex-1 font-math">
                <ChipText
                  label={`What the solver is given, ${j + 1}`}
                  placeholder={j === 0 ? 'A = <3, 4>' : 'the next thing it is given'}
                  value={a}
                  names={names}
                  onCommit={(t) => setArgs((now) => now.map((x, i) => (i === j ? t : x)))}
                />
              </div>
              {args.length > 1 && (
                <button className="icon-btn min-h-[44px] min-w-[44px]" aria-label={`Remove input ${j + 1}`} onClick={() => setArgs(args.filter((_, i) => i !== j))}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          <div className="text-small text-ink-faint">A number, a variable (press its chip), a vector such as A = &lt;3, 4&gt;, or a name or unit in words.</div>
          <button className="btn min-h-[44px]" onClick={() => setArgs([...args, ''])}>
            <Plus size={14} /> Give it something more
          </button>
        </div>
      )}
      {step && preview.length > 0 && (
        <div className="mt-2">
          <div className="text-small text-ink-dim">For row 1’s numbers it writes:</div>
          <MovesPreview moves={preview} />
        </div>
      )}
      <button className="btn primary mt-2 min-h-[44px]" disabled={!step || failed || preview.length === 0} onClick={add}>
        <Plus size={14} /> Add these steps
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------

export function AuthorSolution({ q }: { q: PQQuestion }) {
  const names = useMemo(() => q.variables.map((v) => v.name), [q.variables])
  const edit = useAuthor((s) => s.edit)
  const level = q.steps?.level ?? 'worked'
  const steps = q.steps?.items ?? []

  return (
    <div className="space-y-1 pb-4">
      <div className="section-title">What the student answers</div>
      <div className="space-y-2 px-1">
        {q.parts.map((p, k) => (
          <PartCard key={k} q={q} p={p} k={k} names={names} />
        ))}
      </div>
      <div className="px-3">
        <button className="btn min-h-[44px]" onClick={() => edit((d) => void d.parts.push(blankPart()))}>
          <Plus size={14} /> Add a part
        </button>
      </div>

      <div className="section-title mt-3">The working</div>
      <div className="px-3">
        <div className="text-small text-ink-dim">How much a student sees at first. It moves on by itself: two right in a row shows less, a slip shows more again.</div>
        <div className="seg mt-1 flex w-full" role="radiogroup" aria-label="How much of the working a student sees at first">
          {LEVELS.map((l) => (
            <button
              key={l.level}
              role="radio"
              aria-checked={level === l.level}
              className={`min-h-[44px] flex-1 ${level === l.level ? 'on' : ''}`}
              onClick={() =>
                edit((d) => {
                  d.steps ??= { level: 'worked', items: [] }
                  d.steps.level = l.level
                })
              }
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="mt-1 text-small text-ink-faint">{LEVELS.find((l) => l.level === level)!.about}</div>
      </div>
      <div className="space-y-2 px-1">
        {/* By position: every field takes a new value from outside and shows it, so a moved step
            is shown right, and a key made from the text would remount the card at each keystroke. */}
        {steps.map((st, k) => (
          <StepCard key={k} q={q} st={st} k={k} names={names} />
        ))}
      </div>
      <div className="px-3">
        <button
          className="btn min-h-[44px]"
          onClick={() =>
            edit((d) => {
              d.steps ??= { level: 'worked', items: [] }
              d.steps.items.push({ head: '' })
            })
          }
        >
          <Plus size={14} /> Add a step
        </button>
      </div>
      <div className="px-1">
        <EngineSteps q={q} names={names} />
      </div>
    </div>
  )
}

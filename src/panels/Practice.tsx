import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronRight, Eye, Lightbulb, RotateCcw, Sparkles, Timer, X } from 'lucide-react'
import { visualizeSolution } from '../core/visualize'
import { checkAnswer, expectedText, isCorrect, type Check as AnswerCheck } from '../math/checkAnswer'
import { generateSet, TOPICS, type Level, type Problem, type TopicId } from '../math/problems'
import { Tex } from '../ui/Tex'

const SETTINGS_KEY = 'physlab.practice'
const LEVELS: Level[] = ['Basic', 'Intermediate', 'Advanced']

interface Result {
  id: string
  title: string
  right: boolean
  hints: number
  seconds: number
}

function loadSettings(): { chosen: TopicId[]; count: number } {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const s = JSON.parse(raw) as { chosen?: TopicId[]; count?: number }
      const chosen = (s.chosen ?? []).filter((id) => TOPICS.some((t) => t.id === id))
      if (chosen.length) return { chosen, count: s.count ?? 5 }
    }
  } catch {
    // Storage blocked: start from the defaults instead.
  }
  return { chosen: ['components', 'magdir', 'add'], count: 5 }
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** The steps of the worked solution, revealed one at a time. */
function Steps({ steps, shown }: { steps: { text?: string; tex?: string }[]; shown: number }) {
  if (shown <= 0) return null
  return (
    <ol className="mt-2 space-y-1.5">
      {steps.slice(0, shown).map((s, i) => (
        <li key={i} className="rounded-md bg-black/20 px-3 py-2">
          <div className="flex gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2f4a7a] text-[11px] text-white">{i + 1}</span>
            <div className="min-w-0 flex-1">
              {s.text && <div className="text-zinc-300">{s.text}</div>}
              {s.tex && <Tex tex={s.tex} display />}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

export function Practice() {
  const saved = useMemo(loadSettings, [])
  const [chosen, setChosen] = useState<TopicId[]>(saved.chosen)
  const [count, setCount] = useState(saved.count)
  const [set, setSet] = useState<Problem[]>([])
  const [index, setIndex] = useState(0)
  const [typed, setTyped] = useState<Record<string, string>>({})
  const [checks, setChecks] = useState<Record<string, AnswerCheck>>({})
  const [hints, setHints] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [results, setResults] = useState<Result[]>([])
  const [startedAt, setStartedAt] = useState(Date.now())
  const [now, setNow] = useState(Date.now())

  const problem: Problem | undefined = set[index]
  const finished = set.length > 0 && index >= set.length

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ chosen, count }))
    } catch {
      // Not remembering the choice is not worth an error.
    }
  }, [chosen, count])

  // A clock for the question timer; one tick a second is enough.
  useEffect(() => {
    if (!problem) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [problem])

  const startSet = () => {
    setSet(generateSet(chosen, count))
    setIndex(0)
    setResults([])
    resetQuestion()
  }

  const resetQuestion = () => {
    setTyped({})
    setChecks({})
    setHints(0)
    setRevealed(false)
    setStartedAt(Date.now())
    setNow(Date.now())
  }

  const graded = problem ? problem.fields.map((f) => checks[f.key]) : []
  const allRight = graded.length > 0 && graded.every(isCorrect)
  const anyChecked = graded.some((c) => c && c.verdict !== 'empty')

  const check = () => {
    if (!problem) return
    const next: Record<string, AnswerCheck> = {}
    for (const f of problem.fields) next[f.key] = checkAnswer(typed[f.key] ?? '', f)
    setChecks(next)
  }

  const nextQuestion = () => {
    if (!problem) return
    setResults((r) => [
      ...r,
      {
        id: problem.id,
        title: problem.title,
        right: problem.fields.every((f) => isCorrect(checks[f.key])) && !revealed,
        hints,
        seconds: Math.round((Date.now() - startedAt) / 1000)
      }
    ])
    setIndex((i) => i + 1)
    resetQuestion()
  }

  // ---------------------------------------------------------------- setup
  if (set.length === 0) {
    return (
      <div className="panel pb-8">
        <div className="section-title">Practice</div>
        <div className="px-3 text-zinc-400">
          Pick what you want to practise. PhysLab makes fresh numbers every time, gives you a hint whenever you are stuck, and checks the answer you worked out yourself.
        </div>
        {LEVELS.map((level) => (
          <div key={level} className="mt-3 px-3">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">{level}</div>
            <div className="space-y-1">
              {TOPICS.filter((t) => t.level === level).map((t) => (
                <label key={t.id} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-white/5">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={chosen.includes(t.id)}
                    onChange={(e) => setChosen((c) => (e.target.checked ? [...c, t.id] : c.filter((x) => x !== t.id)))}
                  />
                  <span className="min-w-0">
                    <span className="text-zinc-200">{t.label}</span>
                    <span className="block text-[11px] text-zinc-500">{t.about}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
        <div className="mt-3 px-3">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">How many questions</div>
          <div className="seg">
            {[3, 5, 10].map((n) => (
              <button key={n} className={count === n ? 'on' : ''} onClick={() => setCount(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 px-3">
          <button className="btn primary" disabled={chosen.length === 0} onClick={startSet}>
            <Sparkles size={13} /> Start practice
          </button>
          {chosen.length === 0 && <div className="mt-1 text-amber-300">Choose at least one topic.</div>}
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------- results
  if (finished) {
    const right = results.filter((r) => r.right).length
    const total = results.length
    const time = results.reduce((a, r) => a + r.seconds, 0)
    const slowest = [...results].sort((a, b) => b.seconds - a.seconds)[0]
    return (
      <div className="panel pb-8">
        <div className="section-title">Practice finished</div>
        <div className="card mx-3 border-amber-400/40 bg-amber-400/5 p-3">
          <div className="text-[22px] font-semibold text-white">
            {right} / {total} right
          </div>
          <div className="text-zinc-400">
            {mmss(time)} altogether, about {mmss(Math.round(time / Math.max(1, total)))} a question.
          </div>
          {slowest && slowest.seconds > 120 && (
            <div className="mt-1 text-amber-300">
              {slowest.title} took {mmss(slowest.seconds)} — that is slow for an exam. Practise that one again.
            </div>
          )}
        </div>
        <div className="mt-3 px-3">
          {results.map((r, i) => (
            <div key={r.id} className="flex items-baseline gap-2 border-b border-[#2a2b30] py-1.5">
              {r.right ? <Check size={14} className="text-emerald-400" /> : <X size={14} className="text-red-400" />}
              <span className="w-5 text-zinc-500">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-zinc-300">{r.title}</span>
              <span className="text-zinc-500">{mmss(r.seconds)}</span>
              {r.hints > 0 && <span className="text-amber-300/70">{r.hints} hint{r.hints > 1 ? 's' : ''}</span>}
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2 px-3">
          <button className="btn primary" onClick={startSet}>
            <RotateCcw size={13} /> Another set
          </button>
          <button className="btn ghost" onClick={() => setSet([])}>
            Change topics
          </button>
        </div>
      </div>
    )
  }

  if (!problem) return null

  // ---------------------------------------------------------------- question
  const steps = problem.solution.steps
  const shown = revealed ? steps.length : hints
  const elapsed = Math.round((now - startedAt) / 1000)

  return (
    <div className="panel pb-8">
      <div className="section-title flex items-center gap-2">
        <span>
          Question {index + 1} of {set.length}
        </span>
        <span className="flex-1" />
        <Timer size={12} className="text-zinc-500" />
        <span className="font-normal text-zinc-500">{mmss(elapsed)}</span>
      </div>

      <div className="card mx-3 p-3">
        <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">{problem.title}</div>
        <div className="text-[14px] leading-relaxed text-zinc-100">{problem.prompt}</div>
      </div>

      <div className="mt-3 px-3">
        <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">Your answer</div>
        {problem.fields.map((f) => {
          const c = checks[f.key]
          return (
            <div key={f.key} className="mb-2">
              <div className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-right font-semibold italic text-zinc-300">{f.label}</span>
                <span className="text-zinc-500">=</span>
                <input
                  className="field num flex-1"
                  value={typed[f.key] ?? ''}
                  placeholder="type what you got"
                  spellCheck={false}
                  onChange={(e) => setTyped({ ...typed, [f.key]: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') check()
                    e.stopPropagation()
                  }}
                />
                {f.unit && <span className="w-8 text-zinc-500">{f.unit}</span>}
                {c && isCorrect(c) && <Check size={16} className="text-emerald-400" />}
                {c && !isCorrect(c) && c.verdict !== 'empty' && <X size={16} className="text-red-400" />}
              </div>
              {c?.message && (
                <div className={`mt-1 pl-[72px] ${isCorrect(c) ? 'text-amber-300/80' : 'text-red-300'}`}>{c.message}</div>
              )}
              {c?.verdict === 'empty' && <div className="mt-1 pl-[72px] text-zinc-500">Fill this one in too.</div>}
              {revealed && <div className="mt-1 pl-[72px] text-emerald-300">Answer: {expectedText(f)}</div>}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-3 pt-1">
        <button className="btn primary" onClick={check}>
          <Check size={13} /> Check my answer
        </button>
        <button className="btn" onClick={() => setHints((h) => Math.min(h + 1, steps.length))} disabled={!revealed && hints >= steps.length}>
          <Lightbulb size={13} /> {hints === 0 ? 'Hint' : 'Next hint'}
        </button>
        {(anyChecked || hints > 0) && !revealed && (
          <button className="btn ghost" onClick={() => setRevealed(true)}>
            Show the full solution
          </button>
        )}
        {problem.solution.visual && (
          <button className="btn ghost" onClick={() => visualizeSolution(problem.solution)}>
            <Eye size={13} /> Show in scene
          </button>
        )}
        <span className="flex-1" />
        <button className="btn" onClick={nextQuestion}>
          {index + 1 === set.length ? 'Finish' : 'Next'} <ChevronRight size={13} />
        </button>
      </div>

      {allRight && !revealed && (
        <div className="mx-3 mt-3 rounded-md border border-emerald-400/40 bg-emerald-400/5 px-3 py-2 text-emerald-300">
          All right. {hints > 0 ? 'Try the next one without a hint.' : 'No hints used — well done.'}
        </div>
      )}

      {shown > 0 && (
        <div className="mt-3 px-3">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">
            {revealed ? 'Full solution' : `Hint ${shown} of ${steps.length}`}
          </div>
          <Steps steps={steps} shown={shown} />
          {!revealed && hints < steps.length && (
            <button className="btn ghost mt-2" onClick={() => setHints((h) => h + 1)}>
              <Lightbulb size={13} /> One more step
            </button>
          )}
          {revealed && (
            <div className="card mt-3 border-amber-400/40 bg-amber-400/5 p-3">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-amber-300">Answer</div>
              {problem.solution.answers.map((a) => (
                <div key={a.label} className="flex items-baseline gap-3 py-0.5">
                  <span className="w-24 text-zinc-400">{a.label}</span>
                  <Tex tex={a.tex} className="text-[15px] text-white" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

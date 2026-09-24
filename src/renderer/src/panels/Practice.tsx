import { Fragment, useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { BookOpen, Check, ChevronRight, ChevronsDown, Eye, FolderOpen, Lightbulb, Minus, Play, RotateCcw, Sparkles, TableProperties, Timer, X } from 'lucide-react'
import { visualizeSolution } from '../core/visualize'
import { useScene } from '../core/store'
import { enterMode } from '../app/layout'
import { showPanel } from '../app/panels'
import { openQuestionFile } from '../app/files'
import { checkAnswer, expectedText, isCorrect } from '../math/checkAnswer'
import { generateSet, rngFor, TOPICS, type Level, type Problem, type TopicId } from '../math/problems'
import type { FadingLevel, PQQuestion } from '../questions/pqjson'
import { bundledSets, loadTeacherFile, type QuestionSet } from '../questions/bank'
import {
  countedParts,
  markPlayed,
  picturePlan,
  playQuestion,
  questionsAtDepth,
  resolveDeeper,
  rungLabel,
  rungsIn,
  sandboxPlan,
  sendSandboxReadings,
  showMotion,
  showPicture,
  showSandbox,
  type Played
} from '../questions/player'
import { nextLevel, resolveAutoSteps } from '../questions/steps'
import { workSteps } from '../math/pure/store'
import { Tex } from '../ui/Tex'
import { MoveRow } from './WorkingView'
import { PartRows, questionVerdict, SegmentLines, tally, type PartAnswer, type RowCheck } from './QuestionParts'

const SETTINGS_KEY = 'physlab.practice'
const LEVELS: Level[] = ['Basic', 'Intermediate', 'Advanced']

type Source = 'topics' | 'sets'

interface Result {
  id: string
  title: string
  /** Null for a question with nothing marked on this computer (only proofs or Lego parts): neither right nor wrong. */
  right: boolean | null
  hints: number
  seconds: number
}

/** One question of a running set: a generated vector problem, or a question from a question set with its seed. */
type Item = { kind: 'topic'; problem: Problem } | { kind: 'question'; question: PQQuestion; seed: number }

/** How much of the working a question's steps show, in the words a student reads. */
const LEVEL_WORDS: Record<FadingLevel, string> = {
  worked: 'every line worked',
  half: 'some lines left for you to fill in',
  solo: 'headings only — you write the lines'
}

/**
 * The running set lives outside the panel. "Show it" moves the student to Graphing or the Sandbox,
 * which takes this panel off the screen; kept in component state, the set, the answers typed so
 * far and the fading level were all gone when the student came back to Problem Sets.
 */
interface Session {
  items: Item[]
  index: number
  typed: Record<string, PartAnswer>
  /** Each box's mark; a question's carries its error-carried-forward note and marks. */
  checks: Record<string, RowCheck>
  hints: number
  /**
   * Faded lines the student has uncovered one at a time. The fading's note says "fill this line
   * in yourself, then reveal it"; the only reveal there was "Show the full solution", which marks
   * the question wrong and brings the fading back a level. One line shown counts as one hint.
   */
  lines: number[]
  revealed: boolean
  /**
   * The student opened a proof's model proof. For a question with nothing marked on this computer,
   * that is its answer: "Show the full solution" and "Go deeper" follow it as they follow a Check.
   */
  modelShown: boolean
  results: Result[]
  startedAt: number
  /**
   * Where the fading has got to across the set, and the right answers in a row that move it. Null
   * until the student has answered a question from a set: each question then plays at its
   * author's own steps.level, which used to be overridden by a starting "worked" every time.
   */
  level: FadingLevel | null
  streak: number
  /** The level this question was started at: the steps do not change under the student mid-question. */
  questionLevel: FadingLevel | null
  /** What the last "Show it" did, or why it could not. */
  note: { text: string; error: boolean } | null
  /**
   * Every question of the set the student started, whatever depth was picked: "Go deeper" looks
   * its question up here, so a set filtered to one depth still reaches the next one down.
   */
  setQuestions: PQQuestion[]
}

const blankQuestionState = (): Pick<Session, 'typed' | 'checks' | 'hints' | 'lines' | 'revealed' | 'modelShown' | 'startedAt' | 'note'> => ({
  typed: {},
  checks: {},
  hints: 0,
  lines: [],
  revealed: false,
  modelShown: false,
  startedAt: Date.now(),
  note: null
})

const useSession = create<Session>(() => ({
  items: [],
  index: 0,
  results: [],
  level: null,
  streak: 0,
  questionLevel: null,
  setQuestions: [],
  ...blankQuestionState()
}))
const put = (patch: Partial<Session>) => useSession.setState(patch)

/** Question files a teacher opened this session; kept beside the session for the same reason. */
const useTeacherSets = create<{ sets: QuestionSet[]; report: string[]; error: string | null }>(() => ({ sets: [], report: [], error: null }))

function loadSettings(): { chosen: TopicId[]; count: number; source: Source; setId: string } {
  const fallback = { chosen: ['components', 'magdir', 'add'] as TopicId[], count: 5, source: 'topics' as Source, setId: 'bundled:all' }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const s = JSON.parse(raw) as { chosen?: TopicId[]; count?: number; source?: Source; setId?: string }
      const chosen = (s.chosen ?? []).filter((id) => TOPICS.some((t) => t.id === id))
      return {
        chosen: chosen.length ? chosen : fallback.chosen,
        count: s.count ?? 5,
        source: s.source === 'sets' ? 'sets' : 'topics',
        setId: typeof s.setId === 'string' ? s.setId : fallback.setId
      }
    }
  } catch {
    // Storage blocked: start from the defaults instead.
  }
  return fallback
}

/** A fresh seed for a question reached by Go deeper: new numbers, as every question in a set gets. */
const deeperSeed = (): number => Math.floor(Math.random() * 1e9) + 1

/** Whether two items play the same question of a set (whatever their seeds). */
const sameQuestion = (a: Item, b: Item): boolean => a.kind === 'question' && b.kind === 'question' && a.question.id === b.question.id

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** The steps of the worked solution, revealed one at a time. */
function Steps({ steps, shown }: { steps: { text?: string; tex?: string }[]; shown: number }) {
  if (shown <= 0) return null
  return (
    <ol className="mt-2 space-y-1.5">
      {steps.slice(0, shown).map((s, i) => (
        <li key={i} className="rounded-md bg-surface-0 px-3 py-2">
          <div className="flex gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sel text-fine text-ink-strong">{i + 1}</span>
            <div className="min-w-0 flex-1">
              {s.text && <div className="text-ink">{s.text}</div>}
              {s.tex && <Tex tex={s.tex} display />}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

export function Practice() {
  const saved = useMemo(() => loadSettings(), [])
  const [chosen, setChosen] = useState<TopicId[]>(saved.chosen)
  const [count, setCount] = useState(saved.count)
  const [source, setSource] = useState<Source>(saved.source)
  const [setId, setSetId] = useState(saved.setId)
  const [now, setNow] = useState(() => Date.now())
  const session = useSession()
  const teacher = useTeacherSets()
  const { items, index, typed, checks, hints, lines, revealed, results, startedAt, note } = session
  // The revealed answer is written the way the rest of the app writes numbers: at the precision
  // the student chose, not a fixed four places.
  const settings = useScene((s) => s.settings)

  const bundled = useMemo(() => {
    try {
      return bundledSets()
    } catch {
      return []
    }
  }, [])
  const allSets = [...bundled, ...teacher.sets]
  const pickedSet = allSets.find((s) => s.id === setId) ?? allSets[0]
  // The depth filter: a label to choose by, never a lock — "Every depth" is always there, and a
  // depth the picked set does not have falls back to it.
  const [depth, setDepth] = useState<number | null>(null)
  const rungs = pickedSet ? rungsIn(pickedSet.questions) : []
  const atDepth = depth !== null && (rungs as number[]).includes(depth) ? depth : null
  const toPlay = pickedSet ? questionsAtDepth(pickedSet.questions, atDepth) : []

  const item: Item | undefined = items[index]
  const finished = items.length > 0 && index >= items.length

  // A question from a set is played from its seed at the level the question started at; the
  // memo keeps typing in a box from drawing a fresh copy of the question on every keystroke.
  const playedNow: Played | null = useMemo(
    () => (item?.kind === 'question' ? playQuestion(item.question, item.seed, settings, session.questionLevel ?? undefined) : null),
    [item, settings, session.questionLevel]
  )
  // An Integrate or Differentiate step is worked by SymPy, which answers after the question is
  // drawn: its step shows "Working it out…" until then, then the working swaps in. Nothing asked
  // for it, so the step said "Working it out…" for good. A reply for an earlier question or other
  // settings is kept only with the copy it was worked for, so it never lands on the next question.
  const [worked, setWorked] = useState<{ from: Played; played: Played } | null>(null)
  useEffect(() => {
    if (!playedNow) return
    let live = true
    void resolveAutoSteps(playedNow, settings, workSteps).then((next) => {
      if (live && next !== playedNow) setWorked({ from: playedNow, played: next })
    })
    return () => {
      live = false
    }
  }, [playedNow, settings])
  const played = worked?.from === playedNow ? worked.played : playedNow
  const problem = item?.kind === 'topic' ? item.problem : played?.problem

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ chosen, count, source, setId }))
    } catch {
      // Not remembering the choice is not worth an error.
    }
  }, [chosen, count, source, setId])

  // A clock for the question timer; one tick a second is enough.
  useEffect(() => {
    if (!item) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [item])

  const begin = (next: Item[], setQuestions: PQQuestion[] = []) => {
    put({ items: next, index: 0, results: [], questionLevel: useSession.getState().level, setQuestions, ...blankQuestionState() })
    setNow(Date.now())
  }

  const startSet = () => {
    if (source === 'topics') {
      begin(generateSet(chosen, count).map((problem) => ({ kind: 'topic', problem })))
      return
    }
    if (!pickedSet || toPlay.length === 0) return
    // One seed for the set, one per question drawn from it: the same way generateSet seeds the
    // vector problems, so every question's numbers come from rngFor, never Math.random itself.
    const r = rngFor(Math.floor(Math.random() * 1e9))
    begin(
      toPlay.map((question) => ({ kind: 'question', question, seed: Math.floor(r() * 1e9) + 1 })),
      pickedSet.questions
    )
  }

  const openFile = async () => {
    const f = await openQuestionFile()
    if (!f) return
    try {
      const set = loadTeacherFile(f.content, f.name)
      useTeacherSets.setState((s) => ({ sets: [...s.sets.filter((x) => x.id !== set.id), set], report: set.report, error: null }))
      setSetId(set.id)
      setSource('sets')
    } catch (e) {
      useTeacherSets.setState({ error: e instanceof Error ? e.message : String(e), report: [] })
    }
  }

  // A proof part is never marked, so it is left out of "all right"; a part hidden by its showIf
  // is not in played.parts at all.
  const graded =
    item?.kind === 'topic' ? item.problem.fields.map((f) => checks[f.key]) : played ? countedParts(played).map((p) => checks[p.key]) : []
  const allRight = graded.length > 0 && graded.every(isCorrect)
  // A question of only proofs or Lego parts has nothing to Check: opening the model proof is its answer.
  const unmarked = item?.kind === 'question' && played !== null && graded.length === 0
  const anyChecked = graded.some((c) => c && c.verdict !== 'empty') || (unmarked && session.modelShown)

  const check = () => {
    if (!item) return
    let next: Record<string, RowCheck> = {}
    if (item.kind === 'topic') {
      for (const f of item.problem.fields) next[f.key] = checkAnswer(String(typed[f.key] ?? ''), f, settings)
    } else if (played) {
      // Every part in the author's order, each later one also marked with the student's own
      // earlier answers where it carries them forward.
      next = markPlayed(played, typed, settings)
    }
    put({ checks: next })
  }

  /** Records this question and moves on; `insert` (Go deeper) is played next, before the rest of the set. */
  const nextQuestion = (insert?: Item) => {
    if (!problem) return
    const right = played ? questionVerdict(played, checks, revealed) : graded.every(isCorrect) && graded.length > 0 && !revealed
    const s = useSession.getState()
    // The fading moves between questions, never under the student in the middle of one: two
    // right in a row shows less next time, a slip shows more again. A question with nothing marked
    // (right is null) moves neither.
    const counts = item?.kind === 'question' && right !== null
    const streak = counts ? (right ? s.streak + 1 : 0) : s.streak
    // From the level this question was played at: the author's own, until the student has answered one.
    const level = counts ? nextLevel(played?.level ?? s.level ?? 'worked', streak) : s.level
    put({
      results: [...s.results, { id: problem.id, title: problem.title, right, hints: hints + lines.length, seconds: Math.round((Date.now() - startedAt) / 1000) }],
      // The deeper question may be further down the set already: it is played now, not twice.
      items: insert ? [...s.items.slice(0, s.index + 1), insert, ...s.items.slice(s.index + 1).filter((it) => !sameQuestion(it, insert))] : s.items,
      index: s.index + 1,
      streak,
      level,
      questionLevel: level,
      ...blankQuestionState()
    })
    setNow(Date.now())
  }

  /** Runs one "Show it", switching to where it can be seen and saying what happened. */
  const show = (run: () => string, mode: 'graphing' | 'sandbox' | 'lab') => {
    try {
      const text = run()
      enterMode(mode)
      // Practice and the Sandbox share a dock group, and the button just pressed is in Practice:
      // left there, the Sandbox tab stayed behind it while the note said to press its Play.
      if (mode === 'sandbox') showPanel('sandbox')
      const where = mode === 'graphing' ? 'Graphing' : mode === 'sandbox' ? 'the Sandbox' : 'Lab Data'
      put({ note: { text: `${text} Switched to ${where} to show it; your place in the set is kept.`, error: false } })
    } catch (e) {
      put({ note: { text: e instanceof Error ? e.message : String(e), error: true } })
    }
  }

  // ---------------------------------------------------------------- setup
  if (items.length === 0) {
    return (
      <div className="panel pb-8">
        <div className="section-title">Practice</div>
        <div className="px-3 text-ink-dim">
          Pick what you want to practise. PhysLab makes fresh numbers every time, gives you a hint whenever you are stuck, and checks the answer you worked out yourself.
        </div>
        <div className="mt-3 px-3">
          <div className="seg w-full" role="tablist" aria-label="What to practise">
            <button role="tab" aria-selected={source === 'topics'} className={`min-h-[44px] flex-1 ${source === 'topics' ? 'on' : ''}`} onClick={() => setSource('topics')}>
              Vector topics
            </button>
            <button role="tab" aria-selected={source === 'sets'} className={`min-h-[44px] flex-1 ${source === 'sets' ? 'on' : ''}`} onClick={() => setSource('sets')}>
              Question sets
            </button>
          </div>
        </div>

        {source === 'topics' ? (
          <>
            {LEVELS.map((level) => (
              <div key={level} className="mt-3 px-3">
                <div className="mb-1 text-fine uppercase tracking-wide text-ink-faint">{level}</div>
                <div className="space-y-1">
                  {TOPICS.filter((t) => t.level === level).map((t) => (
                    <label key={t.id} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-surface-3">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={chosen.includes(t.id)}
                        onChange={(e) => setChosen((c) => (e.target.checked ? [...c, t.id] : c.filter((x) => x !== t.id)))}
                      />
                      <span className="min-w-0">
                        <span className="text-ink-strong">{t.label}</span>
                        <span className="block text-fine text-ink-faint">{t.about}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div className="mt-3 px-3">
              <div className="mb-1 text-fine uppercase tracking-wide text-ink-faint">How many questions</div>
              <div className="seg">
                {[3, 5, 10].map((n) => (
                  <button key={n} className={`min-h-[44px] ${count === n ? 'on' : ''}`} onClick={() => setCount(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 px-3">
              <button className="btn primary min-h-[44px]" disabled={chosen.length === 0} onClick={startSet}>
                <Sparkles size={13} /> Start practice
              </button>
              {chosen.length === 0 && <div className="mt-1 text-warn">Choose at least one topic.</div>}
            </div>
          </>
        ) : (
          <>
            <div className="mt-3 px-3">
              <div className="mb-1 text-fine uppercase tracking-wide text-ink-faint">Sets that come with PhysLab</div>
              <SetList sets={bundled} picked={pickedSet?.id} onPick={setSetId} />
              {teacher.sets.length > 0 && (
                <>
                  <div className="mb-1 mt-3 text-fine uppercase tracking-wide text-ink-faint">Opened from a file</div>
                  <SetList sets={teacher.sets} picked={pickedSet?.id} onPick={setSetId} />
                </>
              )}
              <button
                className="btn mt-2 min-h-[44px]"
                onClick={() => void openFile()}
                aria-label="Open a question file…"
                title="A PhysLab question file (.pqjson) or a Numbas exam (.exam)"
              >
                <FolderOpen size={13} /> Open a question file…
              </button>
              {teacher.error && <div className="mt-1 text-bad">{teacher.error}</div>}
              {teacher.report.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-warn">
                  {teacher.report.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
            {rungs.length > 0 && (
              <div className="mt-3 px-3">
                <div className="mb-1 text-fine uppercase tracking-wide text-ink-faint">Depth</div>
                {/* A filter to choose by, never a lock: every depth stays one tap away. */}
                <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Depth">
                  {[null, ...rungs].map((r) => (
                    <button
                      key={r ?? 'all'}
                      role="radio"
                      aria-checked={atDepth === r}
                      className={`btn min-h-[44px] ${atDepth === r ? 'primary' : ''}`}
                      onClick={() => setDepth(r)}
                    >
                      {r === null ? 'Every depth' : rungLabel(r)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-3 px-3">
              <button className="btn primary min-h-[44px]" disabled={toPlay.length === 0} onClick={startSet}>
                <Sparkles size={13} /> Start {pickedSet ? `“${pickedSet.title}”` : 'practice'}
                {atDepth !== null && ` — ${toPlay.length} question${toPlay.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  // ---------------------------------------------------------------- results
  if (finished) {
    // A question with nothing marked on this computer is neither right nor wrong: it is left out of the score.
    const { right, marked, unmarked: notMarked } = tally(results)
    const total = results.length
    const time = results.reduce((a, r) => a + r.seconds, 0)
    const slowest = [...results].sort((a, b) => b.seconds - a.seconds)[0]
    return (
      <div className="panel pb-8">
        <div className="section-title">Practice finished</div>
        <div className="card mx-3 border-warn/40 bg-warn/5 p-3">
          <div className="text-display font-semibold text-ink-strong">{marked > 0 ? `${right} / ${marked} right` : 'Set finished'}</div>
          {notMarked > 0 && (
            <div className="text-ink-dim">
              {notMarked === 1 ? '1 question was' : `${notMarked} questions were`} not marked on this computer, so{' '}
              {notMarked === 1 ? 'it is' : 'they are'} not in the score.
            </div>
          )}
          <div className="text-ink-dim">
            {mmss(time)} altogether, about {mmss(Math.round(time / Math.max(1, total)))} a question.
          </div>
          {slowest && slowest.seconds > 120 && (
            <div className="mt-1 text-warn">
              {slowest.title} took {mmss(slowest.seconds)} — that is slow for an exam. Practise that one again.
            </div>
          )}
        </div>
        <div className="mt-3 px-3">
          {results.map((r, i) => (
            <div key={`${r.id}-${i}`} className="flex items-baseline gap-2 border-b border-line py-1.5">
              {r.right === null ? (
                <Minus size={14} className="text-ink-faint" aria-label="not marked" />
              ) : r.right ? (
                <Check size={14} className="text-good" />
              ) : (
                <X size={14} className="text-bad" />
              )}
              <span className="w-5 text-ink-faint">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-ink">{r.title}</span>
              <span className="text-ink-faint">{mmss(r.seconds)}</span>
              {r.hints > 0 && <span className="text-warn/70">{r.hints} hint{r.hints > 1 ? 's' : ''}</span>}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 px-3">
          <button className="btn primary min-h-[44px]" onClick={startSet}>
            <RotateCcw size={13} /> Another set
          </button>
          <button className="btn ghost min-h-[44px]" onClick={() => put({ items: [] })}>
            Change what to practise
          </button>
        </div>
      </div>
    )
  }

  if (!item || !problem) return null

  // ---------------------------------------------------------------- question
  const elapsed = Math.round((now - startedAt) / 1000)
  const header = (
    <div className="section-title flex items-center gap-2">
      <span>
        Question {index + 1} of {items.length}
      </span>
      {item.kind === 'question' && item.question.rung !== undefined && (
        <span className="rounded-md bg-surface-0 px-1.5 font-normal normal-case tracking-normal text-ink-dim">{rungLabel(item.question.rung)}</span>
      )}
      <span className="flex-1" />
      <Timer size={12} className="text-ink-faint" />
      <span className="font-normal text-ink-faint">{mmss(elapsed)}</span>
    </div>
  )
  const nextButton = (
    <button className="btn min-h-[44px]" onClick={() => nextQuestion()}>
      {index + 1 === items.length ? 'Finish' : 'Next'} <ChevronRight size={13} />
    </button>
  )
  const allRightNote = allRight && !revealed && (
    <div className="mx-3 mt-3 rounded-md border border-good/40 bg-good/5 px-3 py-2 text-good">
      All right. {hints > 0 ? 'Try the next one without a hint.' : 'No hints used — well done.'}
    </div>
  )

  if (item.kind === 'question' && played) {
    const q = played.question
    // Revealed, the lines the fading left for the student come back, so there is something to check against.
    const moves = revealed ? played.full.moves : played.working.moves
    const shown = revealed ? moves.length : Math.min(hints, moves.length)
    // "Go deeper", once the question has been answered or its solution shown: the author's next
    // layer of the same idea, played next from the set's own questions, or a sentence if the set
    // does not have it.
    const deeper = anyChecked || revealed ? resolveDeeper(q, session.setQuestions) : null
    const deeperRow = deeper && (
      <div className="mt-2 flex flex-wrap items-center gap-2 px-3">
        {'question' in deeper ? (
          <button
            className="btn min-h-[44px]"
            onClick={() => nextQuestion({ kind: 'question', question: deeper.question, seed: deeperSeed() })}
          >
            <ChevronsDown size={13} /> Go deeper{deeper.question.rung !== undefined ? ` — ${rungLabel(deeper.question.rung)}` : ''}
          </button>
        ) : (
          <span className="text-ink-dim">{deeper.missing}</span>
        )}
      </div>
    )
    return (
      <div className="panel pb-8">
        {header}
        <div className="card mx-3 p-3">
          <div className="mb-1 text-fine uppercase tracking-wide text-ink-faint">{problem.title}</div>
          <SegmentLines lines={played.statement} className="text-lead leading-relaxed text-ink-strong" />
          {played.problems.map((line, i) => (
            <div key={i} className="mt-1 text-warn">
              {line}
            </div>
          ))}
        </div>

        <div className="mt-3 px-3">
          <div className="mb-1 text-fine uppercase tracking-wide text-ink-faint">Your answer</div>
          <PartRows
            played={played}
            typed={typed}
            checks={checks}
            revealed={revealed}
            onChange={(key, v) => put({ typed: { ...useSession.getState().typed, [key]: v } })}
            onEnter={check}
            onModelShown={() => put({ modelShown: true })}
          />
        </div>

        {unmarked && (
          <div className="mx-3 mb-1 text-ink-dim">
            Nothing in this question is marked on this computer, so it is not in your score: compare your work with the model, then go on.
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 px-3 pt-1">
          {!unmarked && (
            <button className="btn primary min-h-[44px]" onClick={check}>
              <Check size={13} /> Check my answer
            </button>
          )}
          <button className="btn min-h-[44px]" onClick={() => put({ hints: Math.min(hints + 1, moves.length) })} disabled={revealed || hints >= moves.length}>
            <Lightbulb size={13} /> {hints === 0 ? 'Hint' : 'Next hint'}
          </button>
          {/* With nothing marked there is no answer to give away: the solution is there from the start. */}
          {(anyChecked || hints > 0 || unmarked) && !revealed && (
            <button className="btn ghost min-h-[44px]" onClick={() => put({ revealed: true })}>
              Show the full solution
            </button>
          )}
          <span className="flex-1" />
          {nextButton}
        </div>
        {deeperRow}

        {/* The picture's area or slope is held back until the question is answered right or the
            solution shown: it is usually exactly what the question asks for. */}
        {(q.picture || q.motion || q.sandbox) && (
          <div className="mt-2 flex flex-wrap items-center gap-2 px-3">
            {q.picture && (
              <button className="btn ghost min-h-[44px]" onClick={() => show(() => showPicture(picturePlan(q.picture!, played, settings), settings, !(revealed || allRight)).note, 'graphing')}>
                <Eye size={13} /> Show the picture
              </button>
            )}
            {q.motion && (
              <button className="btn ghost min-h-[44px]" onClick={() => show(() => showMotion(q.motion!, played, settings).note, 'graphing')}>
                <Eye size={13} /> Draw the motion
              </button>
            )}
            {q.sandbox && (
              <button className="btn ghost min-h-[44px]" onClick={() => show(() => showSandbox(sandboxPlan(q.sandbox!, played)), 'sandbox')}>
                <Play size={13} /> Open the experiment
              </button>
            )}
            {q.sandbox?.record && (
              <button className="btn ghost min-h-[44px]" onClick={() => show(() => sendSandboxReadings(q.sandbox!, played).note, 'lab')}>
                <TableProperties size={13} /> Send the readings to Lab Data
              </button>
            )}
          </div>
        )}
        {note && <div className={`mx-3 mt-2 ${note.error ? 'text-bad' : 'text-ink-dim'}`}>{note.text}</div>}

        {allRightNote}

        {moves.length > 0 && (shown > 0 || hints > 0) && (
          <div className="mt-3">
            <div className="flex items-center gap-2 px-3 text-fine uppercase tracking-wide text-ink-faint">
              <BookOpen size={12} />
              <span>{revealed ? 'Full solution' : `Hint ${shown} of ${moves.length}`}</span>
            </div>
            <div className="px-3 text-fine text-ink-faint">Steps: {LEVEL_WORDS[played.level]}.</div>
            <ol className="mt-2 space-y-1 px-3">
              {moves.slice(0, shown).map((m, i) => {
                const whole = played.full.moves[i]
                // A line the fading blanked: its maths is in the full working, not here.
                const faded = !revealed && m.tex === undefined && whole?.tex !== undefined
                if (faded && lines.includes(i)) return <MoveRow key={i} n={i + 1} {...whole} />
                return (
                  <Fragment key={i}>
                    <MoveRow n={i + 1} {...m} />
                    {faded && (
                      <li className="list-none">
                        <button className="btn ghost min-h-[44px]" onClick={() => put({ lines: [...useSession.getState().lines, i] })}>
                          <Eye size={13} /> Show this line
                        </button>
                      </li>
                    )}
                  </Fragment>
                )
              })}
            </ol>
            {!revealed && hints < moves.length && (
              <button className="btn ghost mx-3 mt-2 min-h-[44px]" onClick={() => put({ hints: hints + 1 })}>
                <Lightbulb size={13} /> One more step
              </button>
            )}
          </div>
        )}
        {revealed && (
          <div className="card mx-3 mt-3 border-warn/40 bg-warn/5 p-3">
            <div className="mb-1 text-fine uppercase tracking-wide text-warn">Answer</div>
            {/* By each shown part's own place in the author's list: a part hidden by its showIf has
                an answer in the working but no box, and a proof's answer is its model proof above. */}
            {countedParts(played).map((p) => {
              const a = played.working.answers[p.index]
              if (!a) return null
              return (
                <div key={p.key} className="py-0.5">
                  {/* The spoken prompt, as the box above has it: a Numbas prompt's \(…\) is never shown raw. */}
                  <div className="text-ink-dim">{p.prompt}</div>
                  <Tex tex={a.tex} className="text-lead text-ink-strong" />
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  if (item.kind !== 'topic') return null
  const vp = item.problem
  const steps = vp.solution.steps
  const shown = revealed ? steps.length : hints

  return (
    <div className="panel pb-8">
      {header}

      <div className="card mx-3 p-3">
        <div className="mb-1 text-fine uppercase tracking-wide text-ink-faint">{vp.title}</div>
        <div className="text-lead leading-relaxed text-ink-strong">{vp.prompt}</div>
      </div>

      <div className="mt-3 px-3">
        <div className="mb-1 text-fine uppercase tracking-wide text-ink-faint">Your answer</div>
        {vp.fields.map((f) => {
          const c = checks[f.key]
          const value = typed[f.key]
          return (
            <div key={f.key} className="mb-2">
              <div className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-right font-semibold italic text-ink">{f.label}</span>
                <span className="text-ink-faint">=</span>
                <input
                  className="field num flex-1"
                  value={typeof value === 'string' ? value : ''}
                  placeholder="type what you got"
                  spellCheck={false}
                  onChange={(e) => put({ typed: { ...useSession.getState().typed, [f.key]: e.target.value } })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') check()
                    e.stopPropagation()
                  }}
                />
                {f.unit && <span className="w-8 text-ink-faint">{f.unit}</span>}
                {c && isCorrect(c) && <Check size={16} className="text-good" />}
                {c && !isCorrect(c) && c.verdict !== 'empty' && <X size={16} className="text-bad" />}
              </div>
              {c?.message && (
                <div className={`mt-1 pl-[72px] ${isCorrect(c) ? 'text-warn/80' : 'text-bad'}`}>{c.message}</div>
              )}
              {c?.verdict === 'empty' && <div className="mt-1 pl-[72px] text-ink-faint">Fill this one in too.</div>}
              {revealed && <div className="mt-1 pl-[72px] text-good">Answer: {expectedText(f, settings)}</div>}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-3 pt-1">
        <button className="btn primary" onClick={check}>
          <Check size={13} /> Check my answer
        </button>
        <button className="btn" onClick={() => put({ hints: Math.min(hints + 1, steps.length) })} disabled={!revealed && hints >= steps.length}>
          <Lightbulb size={13} /> {hints === 0 ? 'Hint' : 'Next hint'}
        </button>
        {(anyChecked || hints > 0) && !revealed && (
          <button className="btn ghost" onClick={() => put({ revealed: true })}>
            Show the full solution
          </button>
        )}
        {vp.solution.visual && (
          <button className="btn ghost" onClick={() => visualizeSolution(vp.solution)}>
            <Eye size={13} /> Show in scene
          </button>
        )}
        <span className="flex-1" />
        {nextButton}
      </div>

      {allRightNote}

      {shown > 0 && (
        <div className="mt-3 px-3">
          <div className="mb-1 text-fine uppercase tracking-wide text-ink-faint">
            {revealed ? 'Full solution' : `Hint ${shown} of ${steps.length}`}
          </div>
          <Steps steps={steps} shown={shown} />
          {!revealed && hints < steps.length && (
            <button className="btn ghost mt-2" onClick={() => put({ hints: hints + 1 })}>
              <Lightbulb size={13} /> One more step
            </button>
          )}
          {revealed && (
            <div className="card mt-3 border-warn/40 bg-warn/5 p-3">
              <div className="mb-1 text-fine uppercase tracking-wide text-warn">Answer</div>
              {vp.solution.answers.map((a) => (
                <div key={a.label} className="flex items-baseline gap-3 py-0.5">
                  <span className="w-24 text-ink-dim">{a.label}</span>
                  <Tex tex={a.tex} className="text-lead text-ink-strong" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** A list of question sets to pick one from, each a 44 px row with its size. */
function SetList({ sets, picked, onPick }: { sets: QuestionSet[]; picked: string | undefined; onPick: (id: string) => void }) {
  if (sets.length === 0) return <div className="text-ink-faint">No sets here yet.</div>
  return (
    <div className="flex flex-col gap-1" role="radiogroup" aria-label="Question sets">
      {sets.map((s) => (
        <button
          key={s.id}
          role="radio"
          aria-checked={picked === s.id}
          aria-label={`${s.title}, ${s.questions.length} question${s.questions.length === 1 ? '' : 's'}`}
          className={`btn min-h-[44px] w-full justify-start text-left ${picked === s.id ? 'primary' : ''}`}
          onClick={() => onPick(s.id)}
        >
          {/* The count sits under the title: beside it, a narrow panel cut "Every sample question" to "Every sample qu…". */}
          <span className="min-w-0 flex-1 py-1">
            <span className="block">{s.title}</span>
            <span className="block text-fine opacity-80">
              {s.questions.length} question{s.questions.length === 1 ? '' : 's'}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}

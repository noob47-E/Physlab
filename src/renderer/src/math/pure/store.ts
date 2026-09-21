// What the Working panel is showing, and everything it has been asked before.
//
// Only the job and the typed text are remembered. The working itself is recomputed on recall,
// which keeps the saved history tiny and means an improvement to a step generator improves every
// old entry too, instead of leaving stale working lying around.
//
// Two forms of the question are kept, and they are not interchangeable. `input` is the linear
// source the engine runs. `inputLatex` is what the student actually typed, and it is the only
// thing that may ever be written back into a maths field: feeding the linear form back turns
// x^(2) into a stray bracket on screen, because MathLive reads everything it is given as LaTeX.

import { create } from 'zustand'
import { cas, type CasOp } from '../cas'
import { latexToMath } from '../latexToMath'
import { jobById, runPure, suggestJob, type JobId } from './run'
import { failed, type Working } from './work'

export interface PureEntry {
  id: string
  job: JobId
  /** The linear source the engine ran. */
  input: string
  /** The LaTeX the student typed, so recalling an entry restores the field as it was. */
  latex: string
  /** Kept only so the list can be drawn without rerunning every entry. */
  title: string
  answer: string
  at: number
}

// v2: entries gained `latex`. Older ones have none, and backfilling it from `input` would put
// linear syntax back into the field — the exact bug this fixes — so the old list is simply dropped.
const KEY = 'physlab.pure.history.v2'
const CAP = 60

function load(): PureEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed.slice(0, CAP) as PureEntry[]) : []
  } catch {
    return []
  }
}

function save(items: PureEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, CAP)))
  } catch {
    // Storage blocked: history just will not survive a restart.
  }
}

interface PureState {
  job: JobId
  /** Linear source, for runPure. */
  input: string
  /** LaTeX, for the maths field. Never pass `input` where this is wanted. */
  inputLatex: string
  working: Working | null
  /** True while SymPy is being asked for an answer this engine could not work out itself. */
  asking: boolean
  /**
   * Counts every run. A SymPy answer carries the number of the run that asked for it, and is
   * dropped unless that is still the latest run. Comparing the input text instead let a slow
   * answer for an earlier problem land after the student had moved on to a later one with the
   * same text, or after a newer run had already answered.
   */
  runSeq: number
  history: PureEntry[]
  setInput: (s: string) => void
  setJob: (j: JobId) => void
  run: (job?: JobId, input?: string, latex?: string) => void
  /**
   * Run straight from a maths field. The LaTeX is converted here, inside the same guard as the
   * generators, so a refusal thrown by the converter (a ± the engine cannot use, say) is shown to
   * the student as a sentence. Converting in the panel first put that throw in the middle of a
   * render, where nothing catches it. 'auto' guesses the job from the shape of the text.
   */
  runLatex: (latex: string, job: JobId | 'auto') => void
  recall: (id: string) => void
  remove: (id: string) => void
  clearHistory: () => void
}

export const usePure = create<PureState>((set, get) => ({
  job: 'factor',
  input: '',
  inputLatex: '',
  working: null,
  asking: false,
  runSeq: 0,
  history: load(),

  setInput: (input) => set({ input }),
  setJob: (job) => set({ job }),

  run: (job, input, latex) => {
    const j = job ?? get().job
    const src = (input ?? get().input).trim()
    if (!src) return
    // Every generator is meant to return a readable refusal rather than throw, but a throw from
    // deep inside one used to leave the panel showing the previous problem with no explanation.
    // Whatever escapes becomes a refusal the student can read.
    let working: Working
    try {
      working = runPure(j, src)
    } catch (err) {
      working = failed(jobById(j).label, latex ?? src, err instanceof Error && err.message ? err.message : 'Something went wrong while working that out.')
    }
    // With no LaTeX given, the source doubles as the display form. That is only safe because the
    // callers that have real LaTeX always pass it; see the contract test.
    const shown = latex ?? src
    const runSeq = get().runSeq + 1
    set({ job: j, input: src, inputLatex: shown, working, asking: false, runSeq })

    if (!working.error) {
      remember(j, src, shown, working, set, get)
      return
    }

    // The answer is not optional. When this engine cannot show working, SymPy is asked for the
    // result alone, and the panel says plainly that the steps are missing.
    void askCas(j, src, shown, runSeq, set, get)
  },

  runLatex: (latex, job) => {
    let text: string
    try {
      text = latexToMath(latex).trim()
    } catch (err) {
      const label = jobById(job === 'auto' ? get().job : job).label
      const working = failed(label, latex, err instanceof Error && err.message ? err.message : 'I could not read that.')
      set({ inputLatex: latex, working, asking: false, runSeq: get().runSeq + 1 })
      return
    }
    if (!text) return
    get().run(job === 'auto' ? suggestJob(text) : job, text, latex)
  },

  recall: (id) => {
    const hit = get().history.find((h) => h.id === id)
    if (hit) get().run(hit.job, hit.input, hit.latex)
  },

  remove: (id) => {
    const next = get().history.filter((h) => h.id !== id)
    save(next)
    set({ history: next })
  },

  clearHistory: () => {
    save([])
    set({ history: [] })
  }
}))

/**
 * Which Pure Math jobs have a sensible SymPy equivalent to fall back on.
 *
 * `partial` and `divide` map to `apart`, not `simplify`. SymPy's simplify on a fraction returns
 * the fraction, so the panel would print the question back as though it were the answer — worse
 * than showing nothing.
 */
const CAS_OP: Partial<Record<JobId, CasOp>> = {
  factor: 'factor',
  // Not plain `factor`: SymPy's default factors over the rationals, so the fallback for
  // "Factorise with i" used to hand back x² + 4 untouched and call it the answer.
  factorComplex: 'factor_complex',
  expand: 'expand',
  solve: 'solve',
  partial: 'apart',
  divide: 'apart'
}

/** Put a finished answer into the history, moving a repeat of the same question to the top. */
function remember(job: JobId, src: string, latex: string, working: Working, set: (p: Partial<PureState>) => void, get: () => PureState): void {
  const entry: PureEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    job,
    input: src,
    latex,
    title: working.title,
    answer: working.answers[0]?.tex ?? '',
    at: Date.now()
  }
  const rest = get().history.filter((h) => !(h.job === job && h.input === src))
  const next = [entry, ...rest].slice(0, CAP)
  save(next)
  set({ history: next })
}

/**
 * The request for a job, as one pure function.
 *
 * This exists because the payload key is a contract with Python in another file, and it was wrong:
 * `solve` was sent `equations` while the worker reads `eqs`, so every fallback failed silently.
 * Stated once, it can be pinned by a test.
 */
export function casRequestFor(job: JobId, src: string): { op: CasOp; payload: Record<string, unknown> } | null {
  const op = CAS_OP[job]
  if (!op) return null
  return op === 'solve' ? { op, payload: { eqs: [src] } } : { op, payload: { expr: src } }
}

/** True when a SymPy answer that was asked for by run `asked` may still be shown. */
export const casAnswerIsCurrent = (asked: number, latest: number): boolean => asked === latest

async function askCas(
  job: JobId,
  src: string,
  latex: string,
  asked: number,
  set: (p: Partial<PureState>) => void,
  get: () => PureState
): Promise<void> {
  const req = casRequestFor(job, src)
  if (!req) return
  set({ asking: true })
  try {
    const res = await cas(req.op, req.payload)
    // The question may have moved on while Pyodide was waking up.
    if (!casAnswerIsCurrent(asked, get().runSeq)) return
    const current = get().working
    if (!current?.error) return
    // "x = 2" reads as an answer; a bare "2" does not say what it is the value of.
    const answer = res.solutions
      ? res.solutions
          .map((sol) =>
            Object.entries(sol)
              .map(([name, v]) => `${name} = ${v.latex}`)
              .join(',\\; ')
          )
          .filter(Boolean)
          .join(',\\quad ')
      : res.latex
    if (res.error || !answer) {
      set({ asking: false })
      return
    }
    const working: Working = {
      ...current,
      error: undefined,
      noWorking: true,
      answers: [{ label: 'Answer', tex: answer }],
      // The student is told why the steps are missing, not just that they are.
      reason: current.error,
      check: undefined
    }
    set({ asking: false, working })
    // An answer is an answer: it goes into the history like any other, and recalling it asks again.
    remember(job, src, latex, working, set, get)
  } catch {
    set({ asking: false })
  }
}

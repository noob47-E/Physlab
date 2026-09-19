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
import { runPure, suggestJob, type JobId } from './run'
import type { Working } from './work'

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
  history: PureEntry[]
  setInput: (s: string) => void
  setJob: (j: JobId) => void
  run: (job?: JobId, input?: string, latex?: string) => void
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
  history: load(),

  setInput: (input) => set({ input }),
  setJob: (job) => set({ job }),

  run: (job, input, latex) => {
    const j = job ?? get().job
    const src = (input ?? get().input).trim()
    if (!src) return
    const working = runPure(j, src)
    // With no LaTeX given, the source doubles as the display form. That is only safe because the
    // callers that have real LaTeX always pass it; see the contract test.
    const shown = latex ?? src
    set({ job: j, input: src, inputLatex: shown, working, asking: false })

    if (!working.error) {
      const entry: PureEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        job: j,
        input: src,
        latex: shown,
        title: working.title,
        answer: working.answers[0]?.tex ?? '',
        at: Date.now()
      }
      // The same question asked twice should move up the list, not appear twice.
      const rest = get().history.filter((h) => !(h.job === j && h.input === src))
      const next = [entry, ...rest].slice(0, CAP)
      save(next)
      set({ history: next })
      return
    }

    // The answer is not optional. When this engine cannot show working, SymPy is asked for the
    // result alone, and the panel says plainly that the steps are missing.
    void askCas(j, src, set, get)
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
  factorComplex: 'factor',
  expand: 'expand',
  solve: 'solve',
  partial: 'apart',
  divide: 'apart'
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

async function askCas(
  job: JobId,
  src: string,
  set: (p: Partial<PureState>) => void,
  get: () => PureState
): Promise<void> {
  const req = casRequestFor(job, src)
  if (!req) return
  set({ asking: true })
  try {
    const res = await cas(req.op, req.payload)
    // The question may have moved on while Pyodide was waking up.
    if (get().input !== src) return
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
    set({
      asking: false,
      working: {
        ...current,
        error: undefined,
        noWorking: true,
        answers: [{ label: 'Answer', tex: answer }],
        check: current.error
      }
    })
  } catch {
    set({ asking: false })
  }
}

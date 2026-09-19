// What the Working panel is showing, and everything it has been asked before.
//
// Only the job and the typed text are remembered. The working itself is recomputed on recall,
// which keeps the saved history tiny and means an improvement to a step generator improves every
// old entry too, instead of leaving stale working lying around.

import { create } from 'zustand'
import { cas } from '../cas'
import { runPure, suggestJob, type JobId } from './run'
import type { Working } from './work'

export interface PureEntry {
  id: string
  job: JobId
  input: string
  /** Kept only so the list can be drawn without rerunning every entry. */
  title: string
  answer: string
  at: number
}

const KEY = 'physlab.pure.history'
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
  input: string
  working: Working | null
  /** True while SymPy is being asked for an answer this engine could not work out itself. */
  asking: boolean
  history: PureEntry[]
  setInput: (s: string) => void
  setJob: (j: JobId) => void
  run: (job?: JobId, input?: string) => void
  recall: (id: string) => void
  remove: (id: string) => void
  clearHistory: () => void
}

export const usePure = create<PureState>((set, get) => ({
  job: 'factor',
  input: '',
  working: null,
  asking: false,
  history: load(),

  setInput: (input) => set({ input }),
  setJob: (job) => set({ job }),

  run: (job, input) => {
    const j = job ?? get().job
    const src = (input ?? get().input).trim()
    if (!src) return
    const working = runPure(j, src)
    set({ job: j, input: src, working, asking: false })

    if (!working.error) {
      const entry: PureEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        job: j,
        input: src,
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
    if (hit) get().run(hit.job, hit.input)
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

/** Which Pure Math jobs have a sensible SymPy equivalent to fall back on. */
const CAS_OP: Partial<Record<JobId, string>> = {
  factor: 'factor',
  factorComplex: 'factor',
  expand: 'expand',
  solve: 'solve',
  partial: 'simplify',
  divide: 'simplify'
}

async function askCas(
  job: JobId,
  src: string,
  set: (p: Partial<PureState>) => void,
  get: () => PureState
): Promise<void> {
  const op = CAS_OP[job]
  if (!op) return
  set({ asking: true })
  try {
    const res = await cas(op, op === 'solve' ? { equations: [src] } : { expr: src })
    // The question may have moved on while Pyodide was waking up.
    if (get().input !== src) return
    const current = get().working
    if (!current?.error) return
    const answer = res.solutions
      ? res.solutions.map((s) => Object.values(s)[0]?.latex).filter(Boolean).join(',\\quad ')
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

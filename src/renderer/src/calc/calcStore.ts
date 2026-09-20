import { create } from 'zustand'

/** History outlives the session: a student closing the app mid-homework should not lose it. */
const HISTORY_KEY = 'physlab.calc.history'
const HISTORY_CAP = 100

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? (parsed.slice(0, HISTORY_CAP) as HistoryItem[]) : []
  } catch {
    return []
  }
}

export type CalcMode =
  | 'COMP'
  | 'CMPLX'
  | 'BASE-N'
  | 'MATRIX'
  | 'VECTOR'
  | 'STAT'
  | 'DIST'
  | 'TABLE'
  | 'EQUATION'
  | 'INEQUALITY'
  | 'RATIO'
  | 'SHEET'
  | 'UNITS'
  | 'CONST'
  | 'MEASURE'

export interface HistoryItem {
  input: string
  result: string
  mode: CalcMode
}

export interface CalcStore {
  mode: CalcMode
  input: string
  /**
   * LaTeX waiting to go into the maths field at its caret — a constant picked from the CONST
   * list while that list, not the field, was on screen. The field takes it when it mounts.
   * Splicing the text into `input` here by a stored cursor index put every constant at
   * character 0, because nothing ever updated that index.
   */
  pending: string | null
  shift: boolean
  alpha: boolean
  sto: boolean
  vars: Record<string, unknown>
  ans: unknown
  history: HistoryItem[]
  matrices: Record<string, number[][]>
  vectors: Record<string, number[]>
  setMode: (m: CalcMode) => void
  /** Queue LaTeX for the scientific keypad's field and switch to it. */
  insert: (latex: string) => void
  /** The field's own way of collecting what was queued; returns null when nothing is waiting. */
  takePending: () => string | null
}

const mat = (r: number, c: number) => Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => (i === j ? 1 : 0)))

export const useCalc = create<CalcStore>((set, get) => ({
  mode: 'COMP',
  input: '',
  pending: null,
  shift: false,
  alpha: false,
  sto: false,
  vars: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, M: 0, x: 0, y: 0 },
  ans: 0,
  history: loadHistory(),
  matrices: { MatA: mat(2, 2), MatB: [[2, 1], [1, 3]], MatC: mat(3, 3), MatD: mat(3, 3) },
  vectors: { VctA: [3, 4], VctB: [2, -1], VctC: [1, 2, 3], VctD: [0, 0, 1] },
  setMode: (mode) => set({ mode }),
  insert: (latex) => {
    const { mode } = get()
    set({ pending: latex, mode: mode === 'CMPLX' ? mode : 'COMP', shift: false, alpha: false })
  },
  takePending: () => {
    const { pending } = get()
    if (pending !== null) set({ pending: null })
    return pending
  }
}))

// Written straight from the store rather than from the panel, so every place that pushes a
// calculation is remembered without having to know about storage.
let lastSaved: HistoryItem[] = useCalc.getState().history
useCalc.subscribe((s) => {
  if (s.history === lastSaved) return
  lastSaved = s.history
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(s.history.slice(0, HISTORY_CAP)))
  } catch {
    // Storage blocked: history just will not survive a restart.
  }
})

export const clearCalcHistory = (): void => useCalc.setState({ history: [] })

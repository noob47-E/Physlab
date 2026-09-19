import { create } from 'zustand'

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
  cursor: number
  shift: boolean
  alpha: boolean
  sto: boolean
  vars: Record<string, unknown>
  ans: unknown
  history: HistoryItem[]
  matrices: Record<string, number[][]>
  vectors: Record<string, number[]>
  setMode: (m: CalcMode) => void
  insert: (text: string) => void
  setInput: (text: string, cursor?: number) => void
}

const mat = (r: number, c: number) => Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => (i === j ? 1 : 0)))

export const useCalc = create<CalcStore>((set, get) => ({
  mode: 'COMP',
  input: '',
  cursor: 0,
  shift: false,
  alpha: false,
  sto: false,
  vars: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, M: 0, x: 0, y: 0 },
  ans: 0,
  history: [],
  matrices: { MatA: mat(2, 2), MatB: [[2, 1], [1, 3]], MatC: mat(3, 3), MatD: mat(3, 3) },
  vectors: { VctA: [3, 4], VctB: [2, -1], VctC: [1, 2, 3], VctD: [0, 0, 1] },
  setMode: (mode) => set({ mode }),
  insert: (text) => {
    const { input, cursor } = get()
    const c = Math.min(cursor, input.length)
    set({ input: input.slice(0, c) + text + input.slice(c), cursor: c + text.length, shift: false, alpha: false })
  },
  setInput: (input, cursor) => set({ input, cursor: cursor ?? input.length })
}))

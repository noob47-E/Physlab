import { create } from 'zustand'
import { usePure } from '../math/pure/store'
import { storedList } from '../core/schema'

/** History outlives the session: a student closing the app mid-homework should not lose it. */
const HISTORY_KEY = 'physlab.calc.history'
const HISTORY_CAP = 100

function loadHistory(): HistoryItem[] {
  try {
    return storedList(localStorage.getItem(HISTORY_KEY), HISTORY_CAP) as HistoryItem[]
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

/**
 * What each mode is called on screen. The ids above are the calculator's own and stay as they
 * are — stored history and tests name them — but a student reads "Complex numbers", never
 * "CMPLX": those abbreviations were a handheld's, and the screen has room for words.
 */
export const MODE_LABELS: Record<CalcMode, string> = {
  COMP: 'Numbers',
  CMPLX: 'Complex',
  'BASE-N': 'Bases',
  MATRIX: 'Matrices',
  VECTOR: 'Vectors',
  STAT: 'Statistics',
  DIST: 'Distributions',
  TABLE: 'Table',
  EQUATION: 'Equations',
  INEQUALITY: 'Inequalities',
  RATIO: 'Ratio',
  SHEET: 'Sheet',
  UNITS: 'Units',
  CONST: 'Constants',
  MEASURE: 'Measure'
}

/** One line under each mode's name, for the picker. */
export const MODE_HINTS: Record<CalcMode, string> = {
  COMP: 'Everyday calculating: fractions, roots, powers, trigonometry, calculus, complex numbers',
  CMPLX: 'Modulus, argument and conjugate of a complex number',
  'BASE-N': 'Binary, octal and hexadecimal',
  MATRIX: 'Add, multiply and invert tables of numbers',
  VECTOR: 'Dot and cross products of arrows',
  STAT: 'Mean, spread and the line of best fit',
  DIST: 'Normal, binomial and Poisson probabilities',
  TABLE: 'Values of a function, one row per x',
  EQUATION: 'Simultaneous and polynomial equations',
  INEQUALITY: 'Where a polynomial is above or below zero',
  RATIO: 'Proportions, a : b = c : d',
  SHEET: 'A small spreadsheet',
  UNITS: 'Change one unit into another',
  CONST: 'Physical constants',
  MEASURE: 'Significant figures and uncertainty'
}

/** The three modes that share the maths field; the rest have a screen of their own. */
export const FIELD_MODES = ['COMP', 'CMPLX', 'BASE-N'] as const satisfies readonly CalcMode[]

/**
 * What the Calculator offers a student. Complex numbers are Numbers' own (their modulus, argument, conjugate and polar form are
 * on its answer card), so Complex has no chip; Matrices, Vectors, Statistics, Table, Sheet, Units and Measure wait to come back
 * redesigned. Their code and tests are kept: this is the one list the chips, the More menu and the search palette read.
 */
export const CHIP_MODES = ['COMP', 'BASE-N'] as const satisfies readonly CalcMode[]
export const MORE_MODES = ['DIST', 'EQUATION', 'INEQUALITY', 'RATIO', 'CONST'] as const satisfies readonly CalcMode[]
export const LISTED_MODES: readonly CalcMode[] = [...CHIP_MODES, ...MORE_MODES]
export type FieldMode = (typeof FIELD_MODES)[number]
export const isFieldMode = (m: CalcMode): m is FieldMode => (FIELD_MODES as readonly CalcMode[]).includes(m)

/**
 * The letters the Variables drawer offers to keep a number under. A letter is in the store's `vars` only
 * once the student has given it a value; it starts out with none.
 */
export const STORED_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'M', 'x', 'y'] as const

export interface HistoryItem {
  input: string
  result: string
  mode: CalcMode
}

interface CalcStore {
  mode: CalcMode
  input: string
  /**
   * LaTeX waiting to go into the maths field at its caret — a constant picked from the CONST
   * list while that list, not the field, was on screen. The field takes it when it mounts.
   * Splicing the text into `input` here by a stored cursor index put every constant at
   * character 0, because nothing ever updated that index.
   */
  pending: string | null
  /**
   * The keypad the student was using before a list mode (CONST, UNITS…) took the screen, so a
   * picked constant goes back to it. The old `mode === 'CMPLX' ? mode : 'COMP'` inside insert()
   * could never see CMPLX, because insert only runs while the CONST list is showing.
   */
  keypad: 'COMP' | 'CMPLX'
  /**
   * The stored letters, and ONLY the ones the student has given a value. A letter with no entry is not 0: it
   * was, once (every letter started at 0), and that was two wrong answers. C, A and F are also the coulomb,
   * ampere and farad, and a stored C = 0 stood in front of the unit, so 1.6×10⁻¹⁹ C read as 0; and x² − 1 was
   * worked out at a hidden x = 0 and answered −1. With no entry the line reaches the engine as it was typed —
   * C after a number is the unit, x stays x — and a letter given a value is a variable from then on.
   */
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
  keypad: 'COMP',
  vars: {},
  ans: 0,
  history: loadHistory(),
  matrices: { MatA: mat(2, 2), MatB: [[2, 1], [1, 3]], MatC: mat(3, 3), MatD: mat(3, 3) },
  vectors: { VctA: [3, 4], VctB: [2, -1], VctC: [1, 2, 3], VctD: [0, 0, 1] },
  setMode: (mode) => set({ mode }),
  insert: (latex) => {
    set({ pending: latex, mode: get().keypad })
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

// Whichever way the mode changes (the chips, the palette, a menu), the last keypad is what a
// picked constant returns to.
useCalc.subscribe((s) => {
  if ((s.mode === 'COMP' || s.mode === 'CMPLX') && s.keypad !== s.mode) useCalc.setState({ keypad: s.mode })
})

export const clearCalcHistory = (): void => useCalc.setState({ history: [] })

/**
 * What the maths field should hold once a working has arrived: the LaTeX the working was made
 * from, in a mode that has the field on screen. Null when the field already shows it — a run
 * started from the field itself — or when the working has no LaTeX of its own.
 *
 * The Working panel used to keep its own field and copy `inputLatex` into it; with one field
 * for everything, a factorisation asked for in the command bar, a "Worked out" entry recalled
 * from the history or the tour's example otherwise showed its steps under a field and an
 * answer that still belonged to the previous line, and Enter then worked on the wrong one.
 */
export function fieldAfterWorking(calc: Pick<CalcStore, 'mode' | 'input'>, latex: string): Partial<CalcStore> | null {
  if (!latex || latex === calc.input) return null
  // The Bases field is plain text, and a list mode (matrices, statistics…) has no field at all.
  const mode: CalcMode = calc.mode === 'COMP' || calc.mode === 'CMPLX' ? calc.mode : 'COMP'
  return mode === calc.mode ? { input: latex } : { input: latex, mode }
}

// Joined here, at module level, rather than in the Maths screen: the command bar can ask for a
// working before that screen has ever been loaded, and the field must still show the line when
// it opens.
let followedSeq = usePure.getState().runSeq
usePure.subscribe((s) => {
  if (s.runSeq === followedSeq) return
  followedSeq = s.runSeq
  const patch = fieldAfterWorking(useCalc.getState(), s.inputLatex)
  if (patch) useCalc.setState(patch)
})

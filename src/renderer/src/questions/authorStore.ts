// The question set a teacher is writing in Question Author. It lives beside the scene, not in the
// panel, for the reason the Practice session does: "Show it" moves to Graphing or the Sandbox, and
// a set kept in component state was gone when the teacher came back. `core/store.ts` saves it in
// the .phys file (format 5), loads it, clears it on File ▸ New and marks the project dirty when it
// changes, so Ctrl+S and the crash-recovery copy both see a question. Headless: no React.

import { create } from 'zustand'
import { produce, type Draft } from 'immer'
import { blankQuestion, type PQQuestion } from './pqjson'

export interface AuthorState {
  questions: PQQuestion[]
  /** The question open in the editor, as an index into `questions`; 0 when the set is empty. */
  current: number
  /** Replaces the whole set: loading a file, File ▸ New. */
  setQuestions: (questions: PQQuestion[]) => void
  /** Adds a question (a fresh one unless given) after the last and opens it. */
  add: (q?: PQQuestion) => void
  /** Adds several, as an import does, and opens the first of them. */
  addMany: (qs: PQQuestion[]) => void
  /** A copy of question `i` with a new id, straight after it, opened. */
  duplicate: (i: number) => void
  remove: (i: number) => void
  select: (i: number) => void
  /** Changes the open question in place. Nothing happens when the set is empty. */
  edit: (recipe: (q: Draft<PQQuestion>) => void) => void
  /** Replaces the open question with a new one made from it (a rename touches every field at once). */
  update: (fn: (q: PQQuestion) => PQQuestion) => void
  /**
   * Earlier sets, newest last, and the ones undone. One press removes a part, a step or a picture
   * piece with no way back otherwise, and Ctrl+Z in this mode reached the drawing's history instead.
   */
  past: Snapshot[]
  future: Snapshot[]
  undo: () => void
  redo: () => void
}

/** The set as it was, with the question that was open, so undo goes back to where the change was. */
export interface Snapshot {
  questions: PQQuestion[]
  current: number
}

/** As many steps back as Lab Data keeps. */
const HISTORY = 50
/** The last typing edit: when, and which field of which question it changed. */
let lastEdit: { at: number; field: string } | null = null

/**
 * The one text field an edit changed, as a path, or null when it changed anything else: a part
 * or step added or removed, a number or a choice set, or more than one field at once. Immer
 * shares every untouched branch, so only the changed path is walked.
 */
export function typedField(before: unknown, after: unknown, path = ''): string | null {
  const found: { path: string; text: boolean }[] = []
  const walk = (a: unknown, b: unknown, at: string): void => {
    if (a === b || found.length > 1) return
    if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b) && (!Array.isArray(a) || a.length === (b as unknown[]).length)) {
      const x = a as Record<string, unknown>
      const y = b as Record<string, unknown>
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], `${at}/${k}`)
      return
    }
    found.push({ path: at, text: typeof a === 'string' && typeof b === 'string' })
  }
  walk(before, after, path)
  return found.length === 1 && found[0].text ? found[0].path : null
}

/**
 * The history before a change. Keystrokes into one field arrive as a burst of edits and fold into
 * one step, as Lab Data folds typing into a cell. Only typing into the same field folds: a button
 * pressed, or another field typed into, straight after is a step of its own, and so is adding,
 * copying or removing a question.
 */
function remembered(s: AuthorState, field: string | null): Pick<AuthorState, 'past' | 'future'> {
  const now = Date.now()
  const fold = field !== null && lastEdit !== null && lastEdit.field === field && now - lastEdit.at < 700 && s.past.length > 0
  lastEdit = field === null ? null : { at: now, field }
  if (fold) return { past: s.past, future: [] }
  return { past: [...s.past, { questions: s.questions, current: s.current }].slice(-HISTORY), future: [] }
}

const NAME_KEY = 'physlab.author.name'

/**
 * The teacher's own name, the default licence holder of every question they start (CC BY 4.0 with
 * their name, PROGRAM §5). Remembered on this computer only; it is theirs, not the project's.
 */
export function readAuthorName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function rememberAuthorName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {
    // Not remembered: the next new question just starts with an empty holder.
  }
}

const WRITTEN_KEY = 'physlab.author.written'
/** Enough for years of sets; the oldest ids go first. */
const WRITTEN_MAX = 5000

/**
 * The ids of the questions this computer has exported as the teacher's own. Opening one of those
 * files again gives the teacher back their licence to change; anything else keeps its author's.
 * It is a record kept here, not a name a teacher can type, so it cannot be set to someone else's.
 */
export function readWrittenHere(): Set<string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(WRITTEN_KEY) ?? '[]')
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

export function rememberWrittenHere(ids: readonly string[]): void {
  if (ids.length === 0) return
  const all = [...readWrittenHere()].filter((id) => !ids.includes(id))
  try {
    localStorage.setItem(WRITTEN_KEY, JSON.stringify([...all, ...ids].slice(-WRITTEN_MAX)))
  } catch {
    // Not remembered: the file opened again shows its licence read-only, credit still theirs.
  }
}

/** A fresh question, CC BY 4.0 with the teacher's name as holder. */
export function newQuestion(holder = readAuthorName()): PQQuestion {
  const q = blankQuestion()
  return { ...q, license: { id: 'CC BY 4.0', holder } }
}

/** A fresh id for a copy: the same generator a blank question uses. */
const freshId = (): string => blankQuestion().id

export const useAuthor = create<AuthorState>((set, get) => ({
  questions: [],
  current: 0,
  past: [],
  future: [],
  // A new set (a file opened, File > New) starts a new history: the old one was another project's.
  setQuestions: (questions) => set({ questions, current: 0, past: [], future: [] }),
  add: (q) => set((s) => ({ ...remembered(s, null), questions: [...s.questions, q ?? newQuestion()], current: s.questions.length })),
  addMany: (qs) => {
    if (qs.length === 0) return
    set((s) => ({ ...remembered(s, null), questions: [...s.questions, ...qs], current: s.questions.length }))
  },
  duplicate: (i) => {
    const q = get().questions[i]
    if (!q) return
    const copy: PQQuestion = { ...structuredClone(q), id: freshId(), title: q.title ? `${q.title} (copy)` : '' }
    set((s) => ({ ...remembered(s, null), questions: [...s.questions.slice(0, i + 1), copy, ...s.questions.slice(i + 1)], current: i + 1 }))
  },
  remove: (i) =>
    set((s) => {
      if (!s.questions[i]) return s
      const questions = s.questions.filter((_, k) => k !== i)
      return { ...remembered(s, null), questions, current: Math.max(0, Math.min(s.current > i ? s.current - 1 : s.current, questions.length - 1)) }
    }),
  select: (i) => set((s) => ({ current: Math.max(0, Math.min(i, s.questions.length - 1)) })),
  edit: (recipe) =>
    set((s) => {
      const q = s.questions[s.current]
      if (!q) return s
      const next = produce(q, recipe)
      if (next === q) return s
      const questions = s.questions.slice()
      questions[s.current] = next
      return { ...remembered(s, typedField(q, next, q.id)), questions }
    }),
  update: (fn) =>
    set((s) => {
      const q = s.questions[s.current]
      if (!q) return s
      const next = fn(q)
      if (next === q) return s
      const questions = s.questions.slice()
      questions[s.current] = next
      return { ...remembered(s, null), questions }
    }),
  undo: () =>
    set((s) => {
      const back = s.past[s.past.length - 1]
      if (!back) return s
      lastEdit = null
      return { questions: back.questions, current: back.current, past: s.past.slice(0, -1), future: [...s.future, { questions: s.questions, current: s.current }] }
    }),
  redo: () =>
    set((s) => {
      const on = s.future[s.future.length - 1]
      if (!on) return s
      lastEdit = null
      return { questions: on.questions, current: on.current, future: s.future.slice(0, -1), past: [...s.past, { questions: s.questions, current: s.current }].slice(-HISTORY) }
    })
}))

export type AuthorTab = 'variables' | 'scene' | 'solution'

/**
 * Where the teacher is in the editor: the tab, and which preview row's numbers "Show it" uses.
 * Kept out of the question set so looking around never marks the project unsaved, and out of the
 * panel so it survives a trip to the Sandbox and back.
 */
export const useAuthorView = create<{ tab: AuthorTab; seed: number; setTab: (t: AuthorTab) => void; setSeed: (s: number) => void }>((set) => ({
  tab: 'variables',
  seed: 1,
  setTab: (tab) => set({ tab }),
  setSeed: (seed) => set({ seed })
}))

/** The open question, or undefined when the set is empty. */
export const currentQuestion = (s: Pick<AuthorState, 'questions' | 'current'>): PQQuestion | undefined => s.questions[s.current]

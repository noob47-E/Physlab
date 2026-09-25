// The question bank: the sets PhysLab ships with, and a teacher's own file opened from disk. The
// bundled `.pqjson` files are read into the build as text and go through the same `parsePQFile`
// a teacher's file does, so a bundled question can never skip the licence gate or a check the
// importer makes. A Numbas `.exam` goes through the Numbas reader, which says what it had to
// leave out. Headless: no React, no DOM.

import { fromExam } from './numbas'
import { parsePQFile, type PQFile, type PQQuestion } from './pqjson'
import { isShippable } from './license'

/** A list of questions the Practice panel offers as one set. */
export interface QuestionSet {
  id: string
  title: string
  /** 'bundled' ships with PhysLab; 'teacher' was opened from a file. */
  source: 'bundled' | 'teacher'
  questions: PQQuestion[]
  /** Sentences for the teacher about anything left out on the way in; empty when all came in. */
  report: string[]
}

/**
 * Every bundled file's text, keyed by its path. Read at build time (`?raw`), so the bank works
 * offline and in the packaged app with no file access at all — every byte is in the build
 * regardless of size (there is no network to defer to in a packaged Electron app).
 */
const BUNDLED: Record<string, string> = import.meta.glob<string>('./bank/*.pqjson', { eager: true, query: '?raw', import: 'default' })

/**
 * Each bundled file's questions, parsed and licence-checked once (S-Q §5 risk 5): `loadBundled()`
 * used to redo `parsePQFile` and the licence gate over every file on every call, and Practice
 * calls it on every mount through `bundledSets()`'s default argument. Every file is cached, not
 * only a large one — a size threshold that no bundled file reached cached nothing. A file that
 * fails either check is never cached, so it throws on every call.
 */
const parsedCache = new Map<string, PQQuestion[]>()

function bundledQuestions(path: string, text: string): PQQuestion[] {
  let questions = parsedCache.get(path)
  if (!questions) {
    questions = parsePQFile(text).questions
    for (const q of questions) {
      if (!isShippable(q.license)) throw new Error(`Question '${q.title}' in ${path} has no licence PhysLab may ship under.`)
    }
    parsedCache.set(path, questions)
  }
  // A copy for every caller: the cache is shared by every mount and every test, and a question
  // changed in place by one (an author's working copy, a shuffled part) must not reach the next.
  return structuredClone(questions)
}

/**
 * The bundled questions as one file. A bundled file that fails to parse, or a question in it
 * without a licence PhysLab may ship under, is a mistake in PhysLab itself, so it throws rather
 * than quietly dropping questions a student was promised; `tests/questionPlayer.test.ts` loads
 * this, so the mistake never reaches a build.
 */
export function loadBundled(): PQFile {
  const questions: PQQuestion[] = []
  for (const path of Object.keys(BUNDLED).sort()) questions.push(...bundledQuestions(path, BUNDLED[path]))
  return { app: 'PhysLab', format: 'pqjson', version: 1, questions }
}

/** "Motion", not "motion": a tag is a word in the file and a heading in the list. */
const heading = (tag: string): string => tag.charAt(0).toUpperCase() + tag.slice(1)

/**
 * The bundled questions as sets: every question together first, then one set per tag that at
 * least two questions share, in alphabetical order. A question with two tags is in both — a
 * cyclist's journey is motion and graphs — and `level` is never a set: sets are what a question
 * is about, not who it is for. A tag only one question carries is no set to practise: six sample
 * questions made nine rows, four of them "1 question".
 */
export function bundledSets(file: PQFile = loadBundled()): QuestionSet[] {
  const all: QuestionSet = { id: 'bundled:all', title: 'Every sample question', source: 'bundled', questions: file.questions, report: [] }
  const count = new Map<string, number>()
  for (const q of file.questions) for (const t of new Set(q.tags ?? [])) count.set(t, (count.get(t) ?? 0) + 1)
  const tags = [...count.keys()].filter((t) => count.get(t)! >= 2).sort()
  return [
    all,
    ...tags.map((tag) => ({
      id: `bundled:${tag}`,
      title: heading(tag),
      source: 'bundled' as const,
      questions: file.questions.filter((q) => (q.tags ?? []).includes(tag)),
      report: []
    }))
  ]
}

/** The name without its folder: "C:\\Class 11\\forces.pqjson" → "forces.pqjson". */
const baseName = (path: string): string => path.split(/[\\/]/).pop() ?? path

/**
 * A teacher's file as a set. A name ending `.exam` is read as Numbas, with a sentence for every
 * question it could not bring in; anything else is read as a PhysLab question file. A file that
 * cannot be read at all throws one plain sentence, and so does one with no question left in it.
 */
export function loadTeacherFile(text: string, name: string): QuestionSet {
  const file = baseName(name)
  const title = file.replace(/\.(pqjson|exam|json)$/i, '')
  let questions: PQQuestion[]
  let report: string[] = []
  if (/\.exam$/i.test(file)) {
    const imported = fromExam(text)
    questions = imported.file.questions
    report = imported.report
  } else {
    questions = parsePQFile(text).questions
  }
  if (questions.length === 0) {
    throw new Error(report.length > 0 ? `No question in ${file} could come into PhysLab. ${report[0]}` : `${file} has no questions in it.`)
  }
  return { id: `teacher:${file}`, title, source: 'teacher', questions, report }
}

// CW6b, one number reader: every reader of a typed number, pinned over one shared corpus
// (tests/numberCorpus.ts) — the answer box, the "worked out" and "as written" readers behind the
// vector, set, matrix and stated answers, a typed Lab Data cell, and a pasted cell with and without
// a decimal comma. tests/fixtures/numberReaders.txt holds what each read on phase-0.9 9557b01,
// before the readers were joined; the join must leave every line of it as it is. A change that is
// meant is approved by the owner first (OWNER-APPROVALS.md, CW6b-…) and rewritten in a commit of
// its own that names it: PHYSLAB_GOLDEN_UPDATE=1 npx vitest run tests/numberReader.test.ts

import fs from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/math/engine/sympy/worker', () => ({ tryCas: () => null, runCas: () => null }))

import { checkAnswer, parseAnswer } from '../src/renderer/src/math/checkAnswer'
import type { AnswerField } from '../src/renderer/src/math/problems'
import { readMatrixCell, readNumber, readSet, readStated, readVector } from '../src/renderer/src/questions/answerText'
import { readTyped, readingText } from '../src/renderer/src/lab/values'
import { cellNumber } from '../src/renderer/src/lab/csv'
import { resetGlobals } from './helpers/globals'
import { REPO_ROOT } from './helpers/repo'
import { CORPUS } from './numberCorpus'

beforeEach(resetGlobals)

const PINNED = join(REPO_ROOT, 'tests', 'fixtures', 'numberReaders.txt')

/** A number exactly: String() is the shortest text that reads back as the same double; −0 keeps its sign. */
const show = (v: number | null): string => (v === null ? 'null' : Object.is(v, -0) ? '-0' : String(v))
const json = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) => (typeof x === 'number' && Object.is(x, -0) ? '-0' : x))

/** Each reader by the name its line carries, so a changed line says which box reads differently. */
const READERS: [string, (t: string) => string][] = [
  ['answer', (t) => show(parseAnswer(t))],
  ['worked', (t) => show(readNumber(t))],
  ['written', (t) => show(readMatrixCell(t, false))],
  ['matrix cell', (t) => show(readMatrixCell(t, true))],
  ['lab typed', (t) => json(readTyped(t))],
  ['lab pasted', (t) => show(cellNumber(t, false))],
  ['lab pasted, comma file', (t) => show(cellNumber(t, true))],
  ['lab text', (t) => json(readingText(t, false))],
  ['lab text, comma file', (t) => json(readingText(t, true))],
  ['set', (t) => json(readSet(t))],
  ['vector', (t) => json(readVector(t))],
  ['stated', (t) => json(readStated(t))]
]

function readings(): string[] {
  return CORPUS.flatMap((t) => READERS.map(([name, read]) => `${json(t)}  ${name}  =>  ${read(t)}`))
}

describe('CW6b: every number reader over one corpus', () => {
  it('reads every corpus line exactly as phase-0.9 9557b01 did (tests/fixtures/numberReaders.txt)', () => {
    const lines = readings()
    if (process.env.PHYSLAB_GOLDEN_UPDATE === '1') fs.writeFileSync(PINNED, lines.join('\n') + '\n')
    const old = fs.readFileSync(PINNED, 'utf8').replace(/\r\n/g, '\n').split('\n')
    if (old.at(-1) === '') old.pop()
    const changed: string[] = []
    for (let i = 0; i < Math.max(old.length, lines.length); i++) {
      if (old[i] !== lines[i]) changed.push(`line ${i + 1}:\n  - ${old[i] ?? '(none)'}\n  + ${lines[i] ?? '(none)'}`)
    }
    expect(changed.slice(0, 40).join('\n'), `${changed.length} line(s) changed`).toBe('')
  })

  it('the corpus has no line twice, so a changed line names one input', () => {
    expect(new Set(CORPUS).size).toBe(CORPUS.length)
  })

  it("readNumber's 'first' rule is the vector boxes' old readPlainNumber ?? evalNumber, on every corpus line as 9557b01 read it", () => {
    const pinned = new Map(
      fs
        .readFileSync(PINNED, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .map((l) => {
          const at = l.lastIndexOf('  =>  ')
          return [l.slice(0, at), l.slice(at + 6)] as const
        })
    )
    for (const t of CORPUS) {
      const written = pinned.get(`${json(t)}  written`)
      const worked = pinned.get(`${json(t)}  worked`)
      expect.soft(show(readNumber(t, { asWritten: 'first' })), t).toBe(written === 'null' ? worked : written)
      expect.soft(show(readNumber(t, { asWritten: 'only' })), t).toBe(written)
    }
  })
})

// [answer may change] items, proved here and NOT applied: each it.fails passes while the app still
// reads as it does today, and fails (so the line must move to an ordinary `it`) once the owner's
// approved change lands. OWNER-APPROVALS.md has one row per item.
describe('CW6b, parked for the owner', () => {
  const field = (over: Partial<AnswerField> = {}): AnswerField => ({ key: 'a', label: 'A', value: 0, tol: 0.01, ...over })

  // CW6b-1: the answer box keeps whatever Number() makes of mathjs's result, so a word or a
  // comparison that is no number at all is read as one. The other answer kinds already refuse them.
  for (const [typed, today] of [['null', 0], ['true', 1], ['"5"', 5], ['1==1', 1], ['5 > 3', 1]] as const) {
    it.fails(`CW6b-1: the answer box refuses "${typed}" (read as ${today} today)`, () => {
      expect(parseAnswer(typed)).toBeNull()
    })
  }
  it('CW6b-1 evidence: today "null" typed for an answer of 0 is marked right, and "true" for an answer of 1', () => {
    expect(checkAnswer('null', field()).verdict).toBe('right')
    expect(checkAnswer('true', field({ value: 1 })).verdict).toBe('right')
  })
  it.fails('CW6b-1: "null" typed for an answer of 0 is unreadable, not right', () => {
    expect(checkAnswer('null', field()).verdict).toBe('unreadable')
  })

  // CW6b-2: the answer box reads a number as it is written first, as a vector component and a matrix
  // cell do. The set and stated boxes turn every dash into a minus before they read, so they take
  // "—5" today, but they work "1.6*10^-19" out as the answer box does. Only the em dash changes a
  // verdict; "1.6*10^-19" is already marked right (the last bit it is off by is inside the noise
  // floor), it would only be read as exactly 1.6e-19.
  it.fails('CW6b-2: the answer box reads "—5" (an em dash for the minus) as −5, as the set and stated boxes already do', () => {
    expect(parseAnswer('—5')).toBe(-5)
  })
  it.fails('CW6b-2: the answer box reads "1.6*10^-19" as exactly 1.6e-19, as a vector component already does', () => {
    expect(parseAnswer('1.6*10^-19')).toBe(1.6e-19)
  })
  it('CW6b-2 evidence: the set box reads "—5" today, and "1.6*10^-19" is already marked right at tolerance 0', () => {
    expect(readSet('—5')).toEqual([-5])
    expect(checkAnswer('—5', field({ value: -5 })).verdict).toBe('unreadable')
    expect(checkAnswer('1.6*10^-19', field({ value: 1.6e-19, tol: 0 })).verdict).toBe('right')
  })

  // CW6b-3: one decimal-comma rule for every Lab Data cell, typed or pasted. A comma is the point
  // when the cell is one number with that comma in its place (any sign or dash, digits on at least
  // one side, an e-power after); the thousands shape (1 to 3 digits not starting with 0, the comma,
  // exactly 3 digits) is read in neither, because reading an English spreadsheet's 1,000 as 1 is
  // silently wrong. These are every cell of the corpus that would change.
  for (const [cell, after] of [['−0,5', -0.5], ['+0,5', 0.5], ['0,500', 0.5], ['1,2e3', 1200], [',5', 0.5], ['5,', 5]] as const) {
    it.fails(`CW6b-3: a typed cell "${cell}" reads ${after}, as a pasted one does (unread today)`, () => {
      expect(readTyped(cell)?.value).toBe(after)
    })
  }
  for (const [cell, today] of [['1,000', 1], ['1,234', 1.234], ['-1,000', -1], ['−1,000', -1], ['12,000', 12], ['1, 2', 1.2]] as const) {
    it.fails(`CW6b-3: a cell "${cell}" pasted from a tab or semicolon file is unread, as a typed one is (read as ${today} today)`, () => {
      expect(cellNumber(cell, true)).toBeNull()
    })
  }
})

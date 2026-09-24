// Result files (.pqresult) and item statistics — QR1. A teacher's PC is the only place these
// numbers are ever worked out: every test here builds ordinary PQResultFile objects, the way
// Practice's "Save my results for my teacher" writes them, and reads them back the way a teacher
// opening several students' files would.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildResultFile,
  d27,
  itemStats,
  parseResultFile,
  pointBiserial,
  recordFirstTries,
  resultParts,
  serializeResultFile,
  type PQResultFile,
  type ResultCheck,
  type PQResultItem
} from '../src/renderer/src/questions/results'

/** One student's file: one item worth `itemMarks` (right iff `itemMarks > 0`) plus a filler item
 *  whose marks are whatever is needed to reach the student's own overall total, so `fileTotal`
 *  (marks summed across every part of every item) comes out exactly as asked. */
function studentFile(itemMarks: number, fillerMarks: number, opts: { setId?: string } = {}): PQResultFile {
  const items: PQResultItem[] = [
    { questionId: 'Q', seed: 1, hints: 0, seconds: 30, parts: [{ index: 0, answered: true, firstTry: itemMarks > 0, right: itemMarks > 0, marks: itemMarks, outOf: 1 }] },
    { questionId: 'FILLER', seed: 2, hints: 0, seconds: 30, parts: [{ index: 0, answered: true, firstTry: false, right: false, marks: fillerMarks, outOf: fillerMarks || 1 }] }
  ]
  return buildResultFile({ setId: opts.setId ?? 'bundled:all', setTitle: 'Every sample question', items })
}

describe('serialising and reading a result file', () => {
  it('round-trips through JSON text unchanged in substance', () => {
    const file = buildResultFile({
      setId: 'bundled:all',
      setTitle: 'Every sample question',
      student: '  Aisha  ',
      items: [{ questionId: 'braking', seed: 42, hints: 1, seconds: 90, parts: [{ index: 0, answered: true, firstTry: true, right: true, marks: 1, outOf: 1, ecf: true }] }]
    })
    const back = parseResultFile(serializeResultFile(file))
    expect(back.app).toBe('PhysLab')
    expect(back.format).toBe('pqresult')
    expect(back.version).toBe(1)
    expect(back.student).toBe('Aisha') // trimmed, not left with the box's own padding
    expect(back.setId).toBe('bundled:all')
    expect(back.items).toEqual(file.items)
  })

  it('leaves out student when the box was left blank', () => {
    const file = buildResultFile({ setId: 's', setTitle: 'S', student: '   ', items: [] })
    expect(file.student).toBeUndefined()
    expect(parseResultFile(serializeResultFile(file)).student).toBeUndefined()
  })

  it('refuses text that is not JSON, in one sentence', () => {
    expect(() => parseResultFile('not json at all')).toThrow('That is not a PhysLab result file.')
  })

  it('refuses a file of the wrong kind', () => {
    expect(() => parseResultFile(JSON.stringify({ app: 'PhysLab', format: 'pqjson', version: 1 }))).toThrow(
      'That is not a PhysLab result file.'
    )
  })

  it('refuses a future format in one sentence, and a version that is no format at all as not a result file', () => {
    const withVersion = (version: unknown) =>
      JSON.stringify({ app: 'PhysLab', format: 'pqresult', version, setId: 's', setTitle: 'S', when: '2026', items: [] })
    expect(() => parseResultFile(withVersion(2))).toThrow('This result file was saved by a newer PhysLab — update PhysLab to open it.')
    for (const v of [0, -1, 1.5, '1']) expect(() => parseResultFile(withVersion(v))).toThrow('That is not a PhysLab result file.')
  })

  it('refuses a result file for another set, in one sentence, when the open set is named', () => {
    const file = studentFile(1, 3, { setId: 'bundled:all' })
    const text = serializeResultFile(file)
    expect(() => parseResultFile(text, 'teacher:other.pqjson')).toThrow('a result file for a different question set')
    // The same text opens fine once the right set is the one asked for.
    expect(parseResultFile(text, 'bundled:all').setId).toBe('bundled:all')
  })

  it('refuses a part whose marks are not possible — a hand-edited or damaged file', () => {
    const withPart = (marks: number, outOf: number) =>
      JSON.stringify({
        app: 'PhysLab',
        format: 'pqresult',
        version: 1,
        setId: 's',
        setTitle: 'S',
        when: '2026',
        items: [{ questionId: 'q', seed: 1, hints: 0, seconds: 1, parts: [{ index: 0, answered: true, firstTry: true, right: true, marks, outOf }] }]
      })
    expect(() => parseResultFile(withPart(-5, 1))).toThrow('marks that are not possible')
    expect(() => parseResultFile(withPart(2, 1))).toThrow('marks that are not possible') // more than outOf
    expect(() => parseResultFile(withPart(0, 0))).toThrow('marks that are not possible') // outOf must be positive
    expect(parseResultFile(withPart(1, 1)).items[0].parts[0].marks).toBe(1) // full marks is fine
  })

  it('refuses a part that does not say whether it was answered, or has a mark it was never answered for', () => {
    const withPart = (part: Record<string, unknown>) =>
      JSON.stringify({
        app: 'PhysLab',
        format: 'pqresult',
        version: 1,
        setId: 's',
        setTitle: 'S',
        when: '2026',
        items: [{ questionId: 'q', seed: 1, hints: 0, seconds: 1, parts: [{ index: 0, firstTry: false, right: false, marks: 0, outOf: 1, ...part }] }]
      })
    expect(() => parseResultFile(withPart({}))).toThrow('does not say whether it was answered')
    expect(() => parseResultFile(withPart({ answered: 'yes' }))).toThrow('does not say whether it was answered')
    expect(() => parseResultFile(withPart({ answered: false, right: true, marks: 1 }))).toThrow('never answered but has a mark')
    expect(() => parseResultFile(withPart({ answered: false, firstTry: true }))).toThrow('never answered but has a mark')
    expect(parseResultFile(withPart({ answered: false })).items[0].parts[0].answered).toBe(false)
  })

  it('refuses a negative part number, hint count or time — a hand-edited or damaged file', () => {
    const withItem = (item: Record<string, unknown>, index = 0) =>
      JSON.stringify({
        app: 'PhysLab',
        format: 'pqresult',
        version: 1,
        setId: 's',
        setTitle: 'S',
        when: '2026',
        items: [{ questionId: 'q', seed: 1, hints: 0, seconds: 1, parts: [{ index, answered: true, firstTry: true, right: true, marks: 1, outOf: 1 }], ...item }]
      })
    expect(() => parseResultFile(withItem({}, -1))).toThrow('does not say which part it is')
    expect(() => parseResultFile(withItem({ hints: -1 }))).toThrow('has no hints or time on it')
    expect(() => parseResultFile(withItem({ hints: 1.5 }))).toThrow('has no hints or time on it')
    expect(() => parseResultFile(withItem({ seconds: -3 }))).toThrow('has no hints or time on it')
    expect(parseResultFile(withItem({ hints: 2, seconds: 0 })).items[0].hints).toBe(2)
  })
})

describe('pointBiserial and d27 — the formulas the spec quotes', () => {
  // Four students, totals [4, 3, 1, 0], this item right for the first two: the design's own
  // worked example (S-Q.md, QR1). Facility 0.5, uncorrected r_pb = 0.9487.
  const right = [true, true, false, false]
  const totals = [4, 3, 1, 0]

  it('uncorrected point-biserial matches the design’s own number', () => {
    expect(pointBiserial(right, totals)).toBeCloseTo(0.9487, 4)
  })

  it('corrected (item removed: [3, 2, 1, 0]) matches the design’s own number', () => {
    expect(pointBiserial(right, [3, 2, 1, 0])).toBeCloseTo(0.8944, 4)
  })

  it('is null with nobody, or everybody, right first time (no spread on the item)', () => {
    expect(pointBiserial([true, true, true], [1, 2, 3])).toBeNull()
    expect(pointBiserial([false, false, false], [1, 2, 3])).toBeNull()
  })

  it('is null when every student scored the same (no spread on the total)', () => {
    expect(pointBiserial([true, false], [5, 5])).toBeNull()
  })

  it('D27 on 11 students, worked by hand', () => {
    // Corrected totals 10..0 (distinct, so the ranking is unambiguous); right first time for the
    // top two and the very bottom one only. k = round(11 * 0.27) = 3, so the upper group is the
    // three highest totals (10, 9, 8 — 2 of 3 right) and the lower group the three lowest (2, 1, 0
    // — 1 of 3 right): D27 = 2/3 − 1/3 = 1/3.
    const totals11 = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
    const right11 = [true, true, false, false, false, false, false, false, false, false, true]
    expect(d27(right11, totals11)).toBeCloseTo(1 / 3, 6)
  })

  it('is null once the class is too small for two non-overlapping 27 % groups', () => {
    // round(3 * 0.27) = 1, and 3 − 1 = 2 > 1, so 3 students still make two disjoint groups; below
    // that (n = 2, k = 1, n − k = 1 = k) the groups would touch — refused rather than misleading.
    expect(d27([true, false], [2, 1])).toBeNull()
  })

  it('shares a tie straddling the 27 % cut out evenly — never depending on file order', () => {
    // Corrected totals 10, 0, 0, 0, 0: k = round(5 * 0.27) = 1. Four students tie for the one
    // bottom place, so each is a quarter of the lower group: its rate is (1/4)·(right among them).
    // Either way round, one of the four is right: D = 1 − 1/4 = 0.75.
    const totals = [10, 0, 0, 0, 0]
    const rightA = [true, true, false, false, false]
    const rightB = [true, false, false, false, true]
    expect(d27(rightA, totals)).toBeCloseTo(0.75, 12)
    expect(d27(rightB, totals)).toBeCloseTo(0.75, 12)
  })

  it('gives the same D for any order of the files when ties sit at both cuts', () => {
    // 11 students, k = 3. Totals 9, 7, 7, 7, 5, 5, 5, 3, 3, 3, 1: two places left above among
    // three 7s, two places left below among three 3s. Upper = (1 + (2/3)·2) / 3 = 7/9 with the 9
    // and two of the 7s right; lower = (0 + (2/3)·1) / 3 = 2/9 with one 3 right: D = 5/9.
    const totals = [9, 7, 7, 7, 5, 5, 5, 3, 3, 3, 1]
    const right = [true, true, true, false, true, false, true, false, false, true, false]
    expect(d27(right, totals)).toBeCloseTo(5 / 9, 12)
    const perm = [10, 3, 7, 0, 5, 9, 1, 8, 2, 6, 4]
    expect(d27(perm.map((i) => right[i]), perm.map((i) => totals[i]))).toBeCloseTo(5 / 9, 12)
  })

  it('is null when every total is the same — no strong or weak end to compare', () => {
    expect(d27([true, false, true, false, true], [3, 3, 3, 3, 3])).toBeNull()
  })
})

describe('itemStats — the full pipeline, files in, statistics out', () => {
  it('reproduces the design’s own 4-student example end to end', () => {
    const files = [studentFile(1, 3), studentFile(1, 2), studentFile(0, 1), studentFile(0, 0)]
    const [q] = itemStats(files).filter((s) => s.questionId === 'Q')
    expect(q.attempted).toBe(4)
    expect(q.facility).toBeCloseTo(0.5, 6)
    expect(q.rpb).toBeCloseTo(0.8944, 4) // the corrected number: item removed from each total first
    expect(q.d27).not.toBeNull()
  })

  it('reproduces the by-hand 11-student D27 through real files', () => {
    // Same numbers as the pointBiserial/d27 test above, built as files: item marks 1 for a right
    // first-try, 0 for wrong, filler marks make each file's total come out at the intended
    // corrected value once the item's own mark is taken back out.
    const rightFirstTry = [true, true, false, false, false, false, false, false, false, false, true]
    const correctedWant = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
    const files = rightFirstTry.map((r, i) => studentFile(r ? 1 : 0, correctedWant[i]))
    const [q] = itemStats(files).filter((s) => s.questionId === 'Q')
    expect(q.facility).toBeCloseTo(3 / 11, 6)
    expect(q.rpb).toBeCloseTo(0.2582, 3)
    expect(q.d27).toBeCloseTo(1 / 3, 6)
  })

  it('keeps two parts of the same question as two different items', () => {
    const withParts = (p0: number, p1: number): PQResultFile =>
      buildResultFile({
        setId: 's',
        setTitle: 'S',
        items: [
          {
            questionId: 'Q',
            seed: 1,
            hints: 0,
            seconds: 1,
            parts: [
              { index: 0, answered: true, firstTry: p0 > 0, right: p0 > 0, marks: p0, outOf: 1 },
              { index: 1, answered: true, firstTry: p1 > 0, right: p1 > 0, marks: p1, outOf: 1 }
            ]
          }
        ]
      })
    const files = [withParts(1, 0), withParts(0, 1), withParts(1, 1)]
    const stats = itemStats(files)
    const p0 = stats.find((s) => s.questionId === 'Q' && s.partIndex === 0)!
    const p1 = stats.find((s) => s.questionId === 'Q' && s.partIndex === 1)!
    expect(p0.facility).toBeCloseTo(2 / 3, 6)
    expect(p1.facility).toBeCloseTo(2 / 3, 6)
  })

  it('counts one student once even when "Go deeper" replays the same part inside her own file', () => {
    // A file holding the same (questionId, part index) twice — the way "Go deeper" can reach a
    // question already met earlier in the set. This one student must still count as ONE attempt
    // (attempted 2, not 3), her very first meeting decides firstTry, and every mark she earned on
    // the part across both plays comes back out of her total together, or "item removed" would
    // still hold part of this very item.
    const replayed = buildResultFile({
      setId: 's',
      setTitle: 'S',
      items: [
        { questionId: 'Q', seed: 1, hints: 0, seconds: 1, parts: [{ index: 0, answered: true, firstTry: false, right: false, marks: 0, outOf: 1 }] },
        { questionId: 'FILLER', seed: 9, hints: 0, seconds: 1, parts: [{ index: 0, answered: true, firstTry: false, right: false, marks: 5, outOf: 5 }] },
        { questionId: 'Q', seed: 2, hints: 0, seconds: 1, parts: [{ index: 0, answered: true, firstTry: true, right: true, marks: 1, outOf: 1 }] }
      ]
    })
    const single = studentFile(1, 5) // another student, right first time, same total (6) for a clean comparison
    const stats = itemStats([replayed, single]).find((s) => s.questionId === 'Q')!
    expect(stats.attempted).toBe(2) // not 3 — the replay is one student, not two
    expect(stats.facility).toBeCloseTo(0.5, 6) // wrong on her first meeting, right on the single student's only one
    // Her file's total is 0 + 5 + 1 = 6; corrected must remove BOTH of her marks on this part (1),
    // leaving 5 — the same as the other student's corrected total, so this pair has no spread to
    // report rather than a number that is really "the item correlated with a slice of itself".
    expect(stats.rpb).toBeNull()
  })

  it('flags a part almost everyone got wrong first time', () => {
    const files = [studentFile(0, 5), studentFile(0, 4), studentFile(0, 3), studentFile(0, 2), studentFile(1, 1)]
    const [q] = itemStats(files).filter((s) => s.questionId === 'Q')
    expect(q.facility).toBeCloseTo(0.2, 6)
    expect(q.flag).toBe('Most got it wrong first time.')
  })

  it('flags a part that does not separate strong and weak answers', () => {
    // Right for a middling student, wrong for the strongest and weakest alike: no real spread by
    // ability, so its D27 sits near zero although its facility is unremarkable.
    const files = [studentFile(0, 10), studentFile(1, 5), studentFile(0, 0)]
    const [q] = itemStats(files).filter((s) => s.questionId === 'Q')
    expect(q.d27).toBeCloseTo(0, 6)
    expect(q.flag).toBe('Does not separate strong and weak answers.')
  })

  it('an item only one file answers has no correlation to report', () => {
    const [q] = itemStats([studentFile(1, 0)]).filter((s) => s.questionId === 'Q')
    expect(q.attempted).toBe(1)
    expect(q.rpb).toBeNull()
    expect(q.d27).toBeNull()
  })
})

/** Three parts of one question, (a) (b) (c), one mark each — the author's indices 0, 1, 2. */
const PARTS = [
  { key: 'a', index: 0, marks: 1 },
  { key: 'b', index: 1, marks: 1 },
  { key: 'c', index: 2, marks: 1 }
]
const RIGHT: ResultCheck = { verdict: 'right', marks: 1, outOf: 1 }
const WRONG: ResultCheck = { verdict: 'wrong', marks: 0, outOf: 1 }
const EMPTY: ResultCheck = { verdict: 'empty' }

describe('recordFirstTries and resultParts — from a played question to its result parts', () => {
  it('records each part at its own first real Check: (a) checked alone first, (b) right at its own first Check', () => {
    // Enter in (a)'s box checks the whole question while (b) and (c) are still blank.
    let first = recordFirstTries(null, { a: WRONG, b: EMPTY, c: EMPTY }, false)
    expect(first).toEqual({ a: false })
    // Then (a) fixed and (b) filled in, right, and Check again.
    const checks = { a: RIGHT, b: RIGHT, c: EMPTY }
    first = recordFirstTries(first, checks, false)
    expect(first).toEqual({ a: false, b: true }) // (a) keeps its wrong first try; (b) is right first time
    const parts = resultParts(PARTS, checks, first, false)
    expect(parts[0]).toEqual({ index: 0, answered: true, firstTry: false, right: true, marks: 1, outOf: 1 })
    expect(parts[1]).toEqual({ index: 1, answered: true, firstTry: true, right: true, marks: 1, outOf: 1 })
    expect(parts[2]).toEqual({ index: 2, answered: false, firstTry: false, right: false, marks: 0, outOf: 1 })
  })

  it('does not count an unreadable box as a try', () => {
    const first = recordFirstTries(null, { a: { verdict: 'unreadable' }, b: RIGHT, c: EMPTY }, false)
    expect(first).toEqual({ b: true })
    expect(recordFirstTries(first, { a: RIGHT, b: WRONG, c: EMPTY }, false)).toEqual({ a: true, b: true })
  })

  it('writes a question moved on from without any Check as not answered, with no marks', () => {
    const parts = resultParts(PARTS, {}, null, false)
    expect(parts.every((p) => !p.answered && !p.firstTry && !p.right && p.marks === 0)).toBe(true)
    expect(parts.map((p) => p.outOf)).toEqual([1, 1, 1]) // out of the author's own marks
  })

  it('reveal, then a right Check, is not right first time — and, as the finished screen says, not right in the end', () => {
    const first = recordFirstTries(null, { a: RIGHT, b: RIGHT, c: RIGHT }, true)
    expect(first).toEqual({ a: false, b: false, c: false })
    const parts = resultParts(PARTS, { a: RIGHT, b: RIGHT, c: RIGHT }, first, true)
    expect(parts.every((p) => p.answered && !p.firstTry && !p.right && p.marks === 0)).toBe(true)
  })

  it('a part right before the solution was opened keeps its first try and its marks; the rest are given up on', () => {
    const atReveal = { a: RIGHT, b: EMPTY, c: EMPTY }
    const first = recordFirstTries(null, atReveal, false)
    const parts = resultParts(PARTS, atReveal, first, true, atReveal)
    expect(parts.map((p) => [p.answered, p.firstTry, p.right, p.marks])).toEqual([
      [true, true, true, 1],
      [true, false, false, 0],
      [true, false, false, 0]
    ])
  })

  it('a Check after the solution was opened cannot change the marks a part had at the reveal', () => {
    // (a) wrong, then (a) fixed and right, (b) wrong; the student opens the solution …
    let first = recordFirstTries(null, { a: WRONG, b: EMPTY, c: EMPTY }, false)
    const atReveal = { a: RIGHT, b: WRONG, c: EMPTY }
    first = recordFirstTries(first, atReveal, false)
    // … then copies it: everything right, and (a) cleared to blank.
    const after = { a: EMPTY, b: RIGHT, c: RIGHT }
    first = recordFirstTries(first, after, true)
    const parts = resultParts(PARTS, after, first, true, atReveal)
    expect(parts.map((p) => [p.answered, p.firstTry, p.right, p.marks])).toEqual([
      [true, false, true, 1], // right at the reveal, though not first time: its mark stands
      [true, false, false, 0], // wrong at the reveal: the copied answer earns nothing
      [true, false, false, 0] // first tried with the solution in view
    ])
  })

  it('marks an error-carried-forward part, but not once the solution was shown', () => {
    const ecf: ResultCheck = { verdict: 'right', marks: 1, outOf: 1, ecfNote: 'Marked using your answer to part (a)' }
    const first = recordFirstTries(null, { a: WRONG, b: ecf }, false)
    expect(resultParts(PARTS.slice(0, 2), { a: WRONG, b: ecf }, first, false)[1].ecf).toBe(true)
    expect(resultParts(PARTS.slice(0, 2), { a: WRONG, b: ecf }, first, true)[1].ecf).toBeUndefined()
    // Carried forward before the solution was opened, it is still carried forward.
    expect(resultParts(PARTS.slice(0, 2), { a: WRONG, b: ecf }, first, true, { a: WRONG, b: ecf })[1].ecf).toBe(true)
  })
})

describe('itemStats — parts that were never answered', () => {
  /** One part of question Q, and a filler part carrying the rest of the student's total. */
  const file = (q: { answered: boolean; right: boolean }, filler: number): PQResultFile =>
    buildResultFile({
      setId: 's',
      setTitle: 'S',
      items: [
        { questionId: 'Q', seed: 1, hints: 0, seconds: 1, parts: [{ index: 0, answered: q.answered, firstTry: q.right, right: q.right, marks: q.right ? 1 : 0, outOf: 1 }] },
        { questionId: 'F', seed: 2, hints: 0, seconds: 1, parts: [{ index: 0, answered: true, firstTry: false, right: false, marks: filler, outOf: 10 }] }
      ]
    })

  it('leaves an unanswered part out of attempted, and facility is right ÷ answered (2 of 3, one skipped)', () => {
    const files = [
      file({ answered: true, right: true }, 8),
      file({ answered: true, right: true }, 6),
      file({ answered: true, right: false }, 2),
      file({ answered: false, right: false }, 0)
    ]
    const [q] = itemStats(files).filter((s) => s.questionId === 'Q')
    expect(q.attempted).toBe(3)
    expect(q.facility).toBeCloseTo(2 / 3, 12)
    // r_pb over the three who answered only: corrected totals [8, 6, 2], right [T, T, F].
    expect(q.rpb).toBeCloseTo(pointBiserial([true, true, false], [8, 6, 2])!, 12)
  })

  it('a file with one more unanswered part leaves attempted unchanged', () => {
    const base = [file({ answered: true, right: true }, 8), file({ answered: true, right: false }, 2)]
    const before = itemStats(base).find((s) => s.questionId === 'Q')!
    const after = itemStats([...base, file({ answered: false, right: false }, 5)]).find((s) => s.questionId === 'Q')!
    expect(after.attempted).toBe(before.attempted)
    expect(after.facility).toBe(before.facility)
  })

  it('a part no one answered has no statistics at all', () => {
    const stats = itemStats([file({ answered: false, right: false }, 3), file({ answered: false, right: false }, 4)])
    expect(stats.find((s) => s.questionId === 'Q')).toBeUndefined()
  })
})

describe('the "does not separate" flag', () => {
  it('falls back to r_pb when the class is too small for D27', () => {
    // Two students: no D27 (k = 1 would make the groups touch). The stronger one (by the rest of
    // the set) got the part wrong, so r_pb is −1 — a part that works against the rest of the set.
    const files = [studentFile(0, 10), studentFile(1, 0)]
    const [q] = itemStats(files).filter((s) => s.questionId === 'Q')
    expect(q.d27).toBeNull()
    expect(q.rpb).toBeCloseTo(-1, 12)
    expect(q.flag).toBe('Does not separate strong and weak answers.')
  })
})

describe('nothing is written without the button', () => {
  // The repo has no DOM test tooling, so this reads the source: the only file write in Problem
  // Sets is the one inside saveForTeacher, and saveForTeacher runs only from the Save button.
  const src = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
  const practice = src('src/renderer/src/panels/Practice.tsx')

  it('Practice writes a file in one place only, inside saveForTeacher', () => {
    expect(practice.match(/saveTextFile\(/g)).toHaveLength(1)
    const start = practice.indexOf('const saveForTeacher')
    expect(start).toBeGreaterThan(-1)
    const call = practice.indexOf('saveTextFile(')
    // The call sits in saveForTeacher's own body, before the next top-level function of the panel.
    const nextFn = practice.slice(start + 1).search(/\n {2}(const|function) \w+/)
    expect(nextFn).toBeGreaterThan(-1)
    expect(call).toBeGreaterThan(start)
    expect(call).toBeLessThan(start + 1 + nextFn)
  })

  it('saveForTeacher runs only from the Save button', () => {
    const uses = [...practice.matchAll(/saveForTeacher/g)].map((m) => m.index!)
    expect(uses).toHaveLength(2) // its declaration and one onClick
    expect(practice.slice(uses[1] - 'onClick={'.length, uses[1])).toBe('onClick={')
    const button = practice.slice(practice.lastIndexOf('<button', uses[1]), practice.indexOf('</button>', uses[1]))
    expect(button).toContain('Save my results for my teacher')
  })

  it('results.ts imports nothing: no file, network or IPC access', () => {
    const results = src('src/renderer/src/questions/results.ts')
    expect(results).not.toMatch(/^\s*import\b/m)
    expect(results).not.toMatch(/\brequire\(|\bfetch\(|window\.|ipcRenderer|electron/)
  })
})

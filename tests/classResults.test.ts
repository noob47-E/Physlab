// Class Results (QR2) — the panel's own pure logic: which files it accepts, which row goes where,
// and what the CSV export looks like. itemStats itself (facility, r_pb, D27, the flag) is QR1's
// job and is proved in results.test.ts; these tests only check what ClassResults.tsx does with
// that output — accepting or refusing a file, sorting, formatting through math/format.ts, and the
// CSV a spreadsheet reads — plus, like results.test.ts's own "nothing is written without the
// button" tests, that the panel only opens or writes a file from its buttons.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { addResultFile, CSV_HEADER, questionTitles, sortedStats, statsToCsv, type OpenedFile } from '../src/renderer/src/panels/ClassResults'
import { loadBundled } from '../src/renderer/src/questions/bank'
import { buildResultFile, serializeResultFile, type PQResultFile, type PQResultItem } from '../src/renderer/src/questions/results'

/** One student's file: one item worth `itemMarks` (right iff `itemMarks > 0`) plus a filler item
 *  whose marks make the file's total come out as asked — the same shape results.test.ts uses. */
function studentFile(questionId: string, itemMarks: number, fillerMarks: number, setId = 'bundled:all', student?: string): PQResultFile {
  const items: PQResultItem[] = [
    { questionId, seed: 1, hints: 0, seconds: 30, parts: [{ index: 0, answered: true, firstTry: itemMarks > 0, right: itemMarks > 0, marks: itemMarks, outOf: 1 }] },
    { questionId: 'FILLER', seed: 2, hints: 0, seconds: 30, parts: [{ index: 0, answered: true, firstTry: false, right: false, marks: fillerMarks, outOf: fillerMarks || 1 }] }
  ]
  return buildResultFile({ setId, setTitle: setId === 'bundled:all' ? 'A set' : `Set ${setId}`, student, items })
}

/** The CSV without its byte-order mark, split into rows. */
const csvLines = (csv: string): string[] => csv.replace(/^\uFEFF/, '').split('\r\n')
const HEADER = CSV_HEADER.join(',')

describe('sortedStats — worst facility first, author order breaking a tie', () => {
  it('puts the part almost everyone got wrong first time above one everyone got right', () => {
    // Q1: 1 of 5 right first time (facility 0.2). Q2: 1 of 1 right first time (facility 1). Every
    // studentFile also answers a shared FILLER part, always wrong first time (facility 0), which
    // is why this checks Q1 and Q2's own positions rather than assuming the very first row.
    const files = [studentFile('Q1', 1, 0), studentFile('Q1', 0, 1), studentFile('Q1', 0, 1), studentFile('Q1', 0, 1), studentFile('Q1', 0, 1), studentFile('Q2', 1, 0)]
    const rows = sortedStats(files)
    const q1 = rows.findIndex((r) => r.questionId === 'Q1')
    const q2 = rows.findIndex((r) => r.questionId === 'Q2')
    expect(rows[q1].facility).toBeCloseTo(0.2, 6)
    expect(rows[q2].facility).toBeCloseTo(1, 6)
    expect(q1).toBeLessThan(q2) // the harder part sorts above the one everyone got right
  })

  it('reproduces the design’s own 4-student example (S-Q.md, QR1) — facility 0.5, corrected r_pb 0.8944', () => {
    const files = [studentFile('Q', 1, 3), studentFile('Q', 1, 2), studentFile('Q', 0, 1), studentFile('Q', 0, 0)]
    // Every studentFile also answers a shared FILLER part (always wrong first time, facility 0),
    // which sorts ahead of Q's own 0.5 — find Q by id rather than assuming the first row.
    const q = sortedStats(files).find((r) => r.questionId === 'Q')!
    expect(q.facility).toBeCloseTo(0.5, 6)
    expect(q.rpb).toBeCloseTo(0.8944, 4)
  })

  it('breaks a facility tie by question id, then by part index', () => {
    // One file, both questions right first time on every part — every row ties at facility 1, so
    // the order comes entirely from the tie-break: question id, then part index.
    const file = buildResultFile({
      setId: 's',
      setTitle: 'S',
      items: [
        {
          questionId: 'B',
          seed: 1,
          hints: 0,
          seconds: 1,
          parts: [
            { index: 0, answered: true, firstTry: true, right: true, marks: 1, outOf: 1 },
            { index: 1, answered: true, firstTry: true, right: true, marks: 1, outOf: 1 }
          ]
        },
        { questionId: 'A', seed: 2, hints: 0, seconds: 1, parts: [{ index: 0, answered: true, firstTry: true, right: true, marks: 1, outOf: 1 }] }
      ]
    })
    const rows = sortedStats([file])
    expect(rows.map((r) => `${r.questionId}${r.partIndex}`)).toEqual(['A0', 'B0', 'B1'])
  })
})

describe('addResultFile — a file is known by what it holds, not where it came from', () => {
  const add = (opened: readonly OpenedFile[], name: string, f: PQResultFile) => addResultFile(opened, name, serializeResultFile(f))
  const filesOf = (r: ReturnType<typeof addResultFile>): OpenedFile[] => {
    if ('error' in r) throw new Error(r.error)
    return r.files
  }
  const attemptedQ = (opened: readonly OpenedFile[]): number => sortedStats(opened.map((o) => o.file)).find((r) => r.questionId === 'Q')!.attempted

  it('refuses the same file opened again from another path, so a copy is not counted as a second student', () => {
    const f = studentFile('Q', 1, 2, 'bundled:all', 'Asha')
    const once = filesOf(add([], 'C:/Downloads/Class 9 kinematics.pqresult', f))
    // The same content laid out differently (a copy some other tool re-saved) is still the same file.
    const again = addResultFile(once, 'C:/Downloads/Class 9 kinematics (1).pqresult', JSON.stringify(f))
    expect(again).toEqual({ error: 'This result file is already open.' })
    expect(attemptedQ(once)).toBe(1)
  })

  it('keeps two different students’ files that share one name — Practice names every file after the set', () => {
    const a = filesOf(add([], 'Class 9 kinematics.pqresult', studentFile('Q', 1, 2, 'bundled:all', 'Asha')))
    const both = filesOf(add(a, 'Class 9 kinematics.pqresult', studentFile('Q', 0, 1, 'bundled:all', 'Bilal')))
    expect(both).toHaveLength(2)
    expect(attemptedQ(both)).toBe(2)
  })

  it('refuses a file from a different question set in one sentence', () => {
    const a = filesOf(add([], 'a.pqresult', studentFile('Q', 1, 2)))
    expect(add(a, 'b.pqresult', studentFile('Q', 1, 2, 'teacher:forces'))).toEqual({
      error: '"Set teacher:forces" is from a different question set from the files already open — close them to look at that set.'
    })
  })

  it('refuses text that is not a result file in one sentence, and leaves the open files alone', () => {
    const a = filesOf(add([], 'a.pqresult', studentFile('Q', 1, 2)))
    expect(addResultFile(a, 'notes.txt', 'hello')).toEqual({ error: 'That is not a PhysLab result file.' })
    expect(a).toHaveLength(1)
  })
})

describe('statsToCsv — the table as shown, as a spreadsheet reads it', () => {
  it('formats facility as a percentage and r_pb/D27 to 2 dp, through math/format.ts', () => {
    const files = [studentFile('Q', 1, 3), studentFile('Q', 1, 2), studentFile('Q', 0, 1), studentFile('Q', 0, 0)]
    // Filtered to the 'Q' row: every studentFile also answers a shared FILLER part (facility 0),
    // which would otherwise be the row this test is checking.
    const lines = csvLines(statsToCsv(sortedStats(files).filter((r) => r.questionId === 'Q')))
    expect(lines[0]).toBe(HEADER)
    // n = 4, k = round(4·0.27) = 1: upper group is just the top total (right), lower just the
    // bottom (wrong) — D27 = 1 − 0 = 1, and fmt trims the trailing zeros of "1.00" to "1".
    expect(lines[1]).toBe('Q,Q,1,4,50%,0.89,1,') // no title known for 'Q': its id in both columns
  })

  it('leaves a null r_pb or D27 empty — one file, nothing to correlate — so the column stays numeric', () => {
    const csv = statsToCsv(sortedStats([studentFile('Q', 1, 0)]))
    // Both rows (FILLER and Q): an empty r_pb and D27, never "—" in a numeric column.
    for (const line of csvLines(csv).slice(1)) {
      const cells = line.split(',')
      expect(cells[5]).toBe('') // r_pb
      expect(cells[6]).toBe('') // D27
    }
  })

  it('writes a negative r_pb and D27 with an ASCII minus a spreadsheet reads as a number', () => {
    // Q right only for the two students weakest on the rest of the test (0, 0) and wrong for the
    // two strongest (3, 2): the part runs against the test — the value a teacher most needs.
    const files = [studentFile('Q', 1, 0), studentFile('Q', 1, 0), studentFile('Q', 0, 3), studentFile('Q', 0, 2)]
    const row = sortedStats(files).find((r) => r.questionId === 'Q')!
    expect(row.rpb).toBeLessThan(0)
    const csv = statsToCsv([row])
    expect(csv).not.toContain('\u2212')
    const cells = csvLines(csv)[1].split(',')
    expect(cells[5]).toMatch(/^-0\.\d{1,2}$/)
    expect(Number(cells[5])).toBeCloseTo(row.rpb!, 2)
    expect(cells[6]).toBe('-1') // the top 27 % (one student) wrong, the bottom 27 % right
  })

  it('starts with a byte-order mark, so Excel on Windows keeps the flag’s em dash', () => {
    const files = Array.from({ length: 5 }, (_, i) => studentFile('Q', 1, i)) // everyone right: the "too easy" flag
    const csv = statsToCsv(sortedStats(files))
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('too easy to tell strong and weak students apart')
  })

  it('writes its headings out in words, with no underscore', () => {
    expect(HEADER).not.toContain('_')
    expect(HEADER).toContain('Point-biserial correlation')
    expect(HEADER).toContain('Discrimination D27')
  })

  it('quotes a flag that contains a comma-free sentence safely, and escapes one that would need it', () => {
    // The two real flags ("Most got it wrong first time.", "Does not separate strong and weak
    // answers.") hold no comma or quote, so this only has to prove the escaper itself is correct.
    const files = [studentFile('Q', 0, 5), studentFile('Q', 0, 4), studentFile('Q', 0, 3), studentFile('Q', 0, 2), studentFile('Q', 1, 1)]
    const csv = statsToCsv(sortedStats(files))
    expect(csv).toContain('Most got it wrong first time.')
    expect(csvLines(csv)[1].split(',').length).toBe(8) // the flag's own full stop is not mistaken for a new field
  })

  it('has just the header row for an empty table', () => {
    expect(statsToCsv([])).toBe('\uFEFF' + HEADER)
  })
})

describe('questions are named by their titles, not their internal ids', () => {
  // A real Rotation.pqresult named its rows "physlab-fields-centripetal-acceleration" and
  // "physlab-fields-torque", each wrapping over two or three lines of the 370 px dock.
  const ROTATION = ['physlab-fields-centripetal-acceleration', 'physlab-fields-torque']
  const files = [
    buildResultFile({
      setId: 'bundled:rotation',
      setTitle: 'Rotation',
      items: ROTATION.map((questionId, i) => ({ questionId, seed: i + 1, hints: 0, seconds: 20, parts: [{ index: 0, answered: true, firstTry: true, right: true, marks: 1, outOf: 1 }] }))
    })
  ]

  it('looks each id up in the bundled banks and the Question Author\u2019s set; an unknown id stays itself', () => {
    const bundled = loadBundled().questions
    const mine = [{ ...bundled[0], id: 'teacher-own', title: 'My own pulley question' }]
    const titles = questionTitles([...ROTATION, 'teacher-own', 'from-another-computer'], [bundled, mine])
    for (const id of ROTATION) expect(titles.get(id)).toBe(bundled.find((q) => q.id === id)!.title)
    expect(titles.get('physlab-fields-torque')).not.toMatch(/physlab|-/)
    expect(titles.get('teacher-own')).toBe('My own pulley question')
    expect(titles.get('from-another-computer')).toBe('from-another-computer')
  })

  it('writes the title in the CSV, with the id in a column of its own', () => {
    const rows = sortedStats(files)
    const titles = questionTitles(rows.map((r) => r.questionId), [loadBundled().questions])
    const lines = csvLines(statsToCsv(rows, titles))
    expect(lines[0].split(',').slice(0, 2)).toEqual(['Question', 'Question id'])
    for (const line of lines.slice(1)) {
      const [title, id] = line.split(',')
      expect(ROTATION).toContain(id)
      expect(title).toBe(titles.get(id))
      expect(title).not.toBe(id)
    }
  })
})

describe('nothing is opened or written except from the panel’s own buttons', () => {
  const src = readFileSync(join(__dirname, '..', 'src/renderer/src/panels/ClassResults.tsx'), 'utf8')

  it('reads a file in one place only, inside pickResultFiles, and parses it in one place only, inside addResultFile', () => {
    expect(src.match(/\.openFile\(/g)).toHaveLength(1)
    expect(src.indexOf('.openFile(')).toBeGreaterThan(src.indexOf('async function pickResultFiles'))
    expect(src.match(/parseResultFile\(/g)).toHaveLength(1)
    const addStart = src.indexOf('export function addResultFile')
    expect(addStart).toBeGreaterThan(-1)
    expect(src.indexOf('parseResultFile(')).toBeGreaterThan(addStart)
    // …and addResultFile is called from one place, the Open button's handler, after a pick.
    expect(src.match(/addResultFile\(/g)).toHaveLength(2) // its definition and that one call
    expect(src.indexOf('addResultFile(next')).toBeGreaterThan(src.indexOf('const open = async'))
  })

  it('lets a browser pick a whole class’s files at once', () => {
    expect(src).toContain('input.multiple = true')
  })

  it('writes a file in one place only, inside exportCsv, wired to the Save button', () => {
    expect(src.match(/saveTextFile\(/g)).toHaveLength(1)
    const exportAt = src.indexOf('const exportCsv')
    const callAt = src.indexOf('saveTextFile(')
    expect(exportAt).toBeGreaterThan(-1)
    expect(callAt).toBeGreaterThan(exportAt)
    expect(src).toContain('onClick={exportCsv}')
  })

  it('says on screen that nothing here is sent anywhere', () => {
    expect(src).toMatch(/never sends? a result file/)
  })

  it('shows r_pb as r with a subscript and explains every column in a visible key', () => {
    expect(src).toContain('r<sub>pb</sub>')
    expect(src).not.toMatch(/>\s*r_pb\s*</) // never the identifier itself as screen text
    expect(src).toContain('Facility — the share of the class who got the part right first time.')
    expect(src).toMatch(/D27 — the top 27 %/)
  })
})

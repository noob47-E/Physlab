// Numbas and format 2: a Numbas matrix part, adaptive marking (error carried forward) and the
// variables' condition come into PhysLab and go back out unchanged, and PhysLab's new answer
// kinds go out to Numbas as the nearest thing Numbas has. Every import here is played the way
// Practice plays it — the file read back by parsePQFile, the parts marked by the player — so a
// test passing means a teacher's .exam really marks the same in PhysLab.

import { beforeEach, describe, expect, it } from 'vitest'
import { resetGlobals } from './helpers/globals'
import { inDegrees, math } from '../src/renderer/src/math/expr'
import type { MeasureSettings } from '../src/renderer/src/math/format'
import { checkMatrixPart } from '../src/renderer/src/questions/answerKinds'
import { answerValue, markWithECF, type ECFCheck } from '../src/renderer/src/questions/ecf'
import { fromExam, jmeToMath, toExam } from '../src/renderer/src/questions/numbas'
import { checkPlayedPart, playQuestion, type Played } from '../src/renderer/src/questions/player'
import { parsePQFile, serializePQFile, type PQFile, type PQPart, type PQQuestion } from '../src/renderer/src/questions/pqjson'
import { drawVariables } from '../src/renderer/src/questions/variables'

beforeEach(resetGlobals)

const S: MeasureSettings = { decimals: 2, precisionMode: 'dp', unit: 'm', unitPerSquare: 1, angleUnit: 'deg' }
const CC_BY = 'Creative Commons Attribution 4.0 International'

type Raw = Record<string, unknown>
type MatrixPart = Extract<PQPart, { type: 'matrix' }>

/** A Numbas variable entry as the editor writes it. */
const v = (name: string, definition: string): Raw => ({ name, group: 'Ungrouped variables', definition, description: '', templateType: 'anything', can_override: false })

/** A question in the editor's shape. */
function question(over: Raw): Raw {
  return {
    name: 'Q',
    statement: '<p>Work it out.</p>',
    advice: '',
    rulesets: {},
    extensions: [],
    variables: {},
    ungrouped_variables: [],
    variable_groups: [],
    functions: {},
    preamble: { js: '', css: '' },
    parts: [],
    tags: [],
    metadata: { description: '', licence: CC_BY },
    contributors: [{ name: 'Ada Lovelace', profile_url: '' }],
    type: 'question',
    ...over
  }
}

function exam(questions: Raw[]): string {
  const body = { name: 'Test exam', metadata: { description: '', licence: '' }, question_groups: [{ name: 'Group', pickingStrategy: 'all-ordered', questions }] }
  return `// Numbas version: finer_feedback_settings\n${JSON.stringify(body)}`
}

/** A Numbas matrix part as the editor writes it. */
const matrixPart = (correctAnswer: string, over: Raw = {}): Raw => ({
  type: 'matrix',
  marks: 4,
  prompt: '<p>Find the matrix.</p>',
  correctAnswer,
  correctAnswerFractions: false,
  numRows: 2,
  numColumns: 2,
  allowResize: false,
  tolerance: 0,
  markPerCell: false,
  allowFractions: false,
  precisionType: 'none',
  precision: 0,
  variableReplacements: [],
  variableReplacementStrategy: 'originalfirst',
  adaptiveMarkingPenalty: 0,
  ...over
})

/** What Practice gets: the imported file written out and read back. */
function imported(text: string): { file: PQFile; report: string[] } {
  const { file, report } = fromExam(text)
  return { file: parsePQFile(serializePQFile(file)), report }
}

/** Plays a question and marks every part as Practice does: each with the student's own earlier answers. */
function sit(q: PQQuestion, answers: string[], seed = 1): ECFCheck[] {
  const played: Played = playQuestion(q, seed, S)
  const earlier = new Map<number, number>()
  return played.parts.map((p, i) => {
    const answer = answers[i] ?? ''
    const c = markWithECF(p, answer, played, earlier, S, (values) => checkPlayedPart(p, answer, { ...played, variant: { ...played.variant, values } }, S))
    const x = answerValue(p.part, answer)
    if (x !== null) earlier.set(i, x)
    return c
  })
}

const examQuestions = (text: string): Raw[] => (JSON.parse(text.replace(/^[^\n]*\n/, '')) as { question_groups: { questions: Raw[] }[] }).question_groups[0].questions
const examParts = (text: string, q = 0): Raw[] => examQuestions(text)[q].parts as Raw[]

// ---------------------------------------------------------------------------
// Importing a matrix part
// ---------------------------------------------------------------------------

describe('a Numbas matrix part', () => {
  it('with the literal matrix([1,2],[3,4]) imports as a matrix part and marks', () => {
    const { file, report } = imported(exam([question({ name: 'Literal', parts: [matrixPart('matrix([1,2],[3,4])')] })]))
    expect(report).toEqual([])
    expect(file.version).toBe(2)
    const part = file.questions[0].parts[0] as MatrixPart
    expect(part).toMatchObject({ type: 'matrix', answer: [['1', '2'], ['3', '4']], marks: 4 })
    const values = drawVariables(file.questions[0], 1).values
    expect(checkMatrixPart([['1', '2'], ['3', '4']], part, values, S)).toMatchObject({ verdict: 'right', marks: 4 })
    expect(checkMatrixPart([['1', '2'], ['3', '5']], part, values, S)).toMatchObject({ verdict: 'wrong', message: '3 of the 4 entries are right.', marks: 0 })
  })

  it('reads the list-of-rows spelling, entries in the variables, a fixed gap, fractions and marks per entry', () => {
    const q = question({
      name: 'Inverse',
      variables: { a: v('a', 'random(2..2)'), m: v('m', 'matrix([[3/(5*a/2), -1/5], [-1/5, 2/5]])') },
      ungrouped_variables: ['a', 'm'],
      parts: [matrixPart('m', { tolerance: 0.001, allowFractions: true, markPerCell: true })]
    })
    const { file, report } = imported(exam([q]))
    expect(report).toEqual([])
    const qq = file.questions[0]
    // The matrix variable is an answer, not one of PhysLab's number variables.
    expect(qq.variables.map((x) => x.name)).toEqual(['a'])
    const part = qq.parts[0] as MatrixPart
    expect(part).toMatchObject({ tolerance: { kind: 'absolute', value: 0.001 }, allowFractions: true, markPerCell: true })
    // The inverse of [[2, 1], [1, 3]] is [[0.6, −0.2], [−0.2, 0.4]]; 3/5 is taken, one wrong entry keeps 3 of the 4 marks.
    const values = drawVariables(qq, 1).values
    expect(checkMatrixPart([['3/5', '-0.2'], ['-0.2', '0.4']], part, values, S)).toMatchObject({ verdict: 'right', marks: 4 })
    expect(checkMatrixPart([['0.6', '-0.2'], ['-0.2', '0.5']], part, values, S)).toMatchObject({ verdict: 'wrong', marks: 3 })
  })

  it('with id(3) is skipped with its sentence', () => {
    const { file, report } = fromExam(exam([question({ name: 'Identity', parts: [matrixPart('id(3)')] })]))
    expect(file.questions).toEqual([])
    expect(report).toEqual([
      "Question 'Identity' was skipped: it gives the answer to part 1 as id(3), which PhysLab can read only as a matrix written out entry by entry."
    ])
  })

  it('whose matrix is used in another formula is skipped, not drawn with a number that is not there', () => {
    const q = question({
      name: 'Twice',
      variables: { m: v('m', 'matrix([1,2],[3,4])'), n: v('n', '2*m') },
      ungrouped_variables: ['m', 'n'],
      parts: [matrixPart('m')]
    })
    expect(fromExam(exam([q])).report).toEqual(["Question 'Twice' was skipped: it works with the matrix m in a formula, which PhysLab can only take as an answer."])
  })

  it('with no answer, or one that is not JME, is skipped in a sentence', () => {
    expect(fromExam(exam([question({ name: 'Blank', parts: [matrixPart('')] })])).report).toEqual(["Question 'Blank' was skipped: it gives no answer for part 1."])
    expect(fromExam(exam([question({ name: 'Garbled', parts: [matrixPart('matrix([1,2]')] })])).report).toEqual([
      "Question 'Garbled' was skipped: it gives the answer to part 1 as matrix([1,2], which PhysLab can read only as a matrix written out entry by entry."
    ])
    // An empty matrix skips its own question only; the file's other questions still come in.
    const { file, report } = fromExam(exam([question({ name: 'Empty', parts: [matrixPart('matrix([])')] }), question({ name: 'Fine', parts: [matrixPart('matrix([1,2],[3,4])')] })]))
    expect(report).toEqual(["Question 'Empty' was skipped: it gives the answer to part 1 as matrix([]), which PhysLab can read only as a matrix written out entry by entry."])
    expect(file.questions.map((q) => q.title)).toEqual(['Fine'])
  })

  it('whose matrix is used in a formula shown in the advice is skipped the same way', () => {
    const q = question({
      name: 'Advice',
      advice: '<p>Twice it is {2*m}.</p>',
      variables: { m: v('m', 'matrix([1,2],[3,4])') },
      ungrouped_variables: ['m'],
      parts: [matrixPart('m')]
    })
    expect(fromExam(exam([q])).report).toEqual(["Question 'Advice' was skipped: it works with the matrix m in a formula, which PhysLab can only take as an answer."])
  })

  it('whose matrix is shown in the text is skipped with the true reason, not "no variable"', () => {
    const q = question({
      name: 'Inverse',
      statement: '<p>Find the inverse of \\(\\var{A}\\).</p>',
      variables: { A: v('A', 'matrix([1,2],[3,4])') },
      ungrouped_variables: ['A'],
      parts: [matrixPart('matrix([-2,1],[1.5,-0.5])')]
    })
    expect(fromExam(exam([q])).report).toEqual(["Question 'Inverse' was skipped: it shows the matrix A in its text, which PhysLab can only take as an answer."])
    expect(fromExam(exam([{ ...q, statement: '<p>Find the inverse of {A}.</p>' }])).report).toEqual([
      "Question 'Inverse' was skipped: it shows the matrix A in its text, which PhysLab can only take as an answer."
    ])
  })

  it('with ragged rows is skipped too', () => {
    expect(fromExam(exam([question({ name: 'Ragged', parts: [matrixPart('matrix([1,2],[3])')] })])).report).toEqual([
      "Question 'Ragged' was skipped: it gives the answer to part 1 as matrix([1,2],[3]), which PhysLab can read only as a matrix written out entry by entry."
    ])
  })

  it('takes its precision, is exact when neither precision nor a gap is set, or falls back to the app’s 2 % only when the tolerance field is missing outright; a resizable one says the boxes are shown', () => {
    const tol = (over: Raw): unknown => (fromExam(exam([question({ parts: [matrixPart('matrix([1,2],[3,4])', over)] })])).file.questions[0].parts[0] as MatrixPart).tolerance
    // Numbas writes tolerance: 0, precisionType: 'none' for an untouched matrix part exactly as
    // it does for one an author deliberately set to require an exact match — the two are the same
    // JSON, and Numbas marks both exactly — so PhysLab now reads a plain 0 as exact rather than
    // loosening it to the app's own 2 % default (the bug this test used to encode).
    expect(tol({})).toEqual({ kind: 'absolute', value: 0 })
    expect(tol({ precisionType: 'dp', precision: 2 })).toEqual({ kind: 'absolute', value: 0.005 })
    expect(tol({ precisionType: 'sigfig', precision: 3 })).toEqual({ kind: 'relative', value: 0.005 })
    // A hand-edited or pre-schema file that leaves the tolerance key out entirely — never a shape
    // the Numbas editor itself writes — still gets the app's one lenient default, not an exact
    // match nobody asked for.
    const noTolerance = matrixPart('matrix([1,2],[3,4])')
    delete noTolerance.tolerance
    expect((fromExam(exam([question({ parts: [noTolerance] })])).file.questions[0].parts[0] as MatrixPart).tolerance).toEqual({ kind: 'relative', value: 0.02 })
    expect(fromExam(exam([question({ parts: [matrixPart('matrix([1,2],[3,4])', { allowResize: true })] })])).report).toEqual([
      "Question 'Q', part 1 lets the student choose the size of the matrix in Numbas; PhysLab shows a box for each entry."
    ])
  })

  it('an entry wrong by 1 % is marked wrong against an author’s exact-match part, but right when the file omits the tolerance and PhysLab falls back to its own 2 %', () => {
    const exact = matrixPart('matrix([100,0],[0,100])')
    const noTolerance = matrixPart('matrix([100,0],[0,100])')
    delete noTolerance.tolerance
    const q = question({ parts: [exact] })
    const withFallback = question({ parts: [noTolerance] })
    const part = imported(exam([q])).file.questions[0].parts[0] as MatrixPart
    const fallbackPart = imported(exam([withFallback])).file.questions[0].parts[0] as MatrixPart
    const values = drawVariables(imported(exam([q])).file.questions[0], 1).values
    // 1 % off (101 for 100) fails the author's exact match…
    expect(checkMatrixPart([['101', '0'], ['0', '100']], part, values, S)).toMatchObject({ verdict: 'wrong' })
    // …but is within the app's own 2 % default when the file never gave a tolerance at all.
    expect(checkMatrixPart([['101', '0'], ['0', '100']], fallbackPart, values, S)).toMatchObject({ verdict: 'right' })
  })

  it('a relative tolerance survives a PhysLab -> .exam -> PhysLab round trip, though a plain Numbas install would mark it exactly', () => {
    const q: PQQuestion = {
      id: 'm', title: 'M', statement: 'Find the matrix.', variables: [],
      parts: [{ type: 'matrix', prompt: 'M', answer: [['4', '0'], ['0', '4']], tolerance: { kind: 'relative', value: 0.05 }, marks: 1 }],
      license: { id: 'CC BY 4.0', holder: 'PhysLab' }
    }
    const out = toExam(file(q))
    const part = examParts(out)[0]
    // What a plain Numbas install sees: an exact match (no relative form exists in its schema).
    expect(part).toMatchObject({ type: 'matrix', tolerance: 0, precisionType: 'none' })
    expect(part.precisionMessage).toBe('[physlab:tolerance=relative:0.05]')
    // What PhysLab itself reads back: the true 5 % band, not the 0 -> "exact" a bare re-import of
    // the tolerance field alone would now (correctly, per the fix above) produce.
    const back = imported(out).file.questions[0].parts[0] as MatrixPart
    expect(back.tolerance).toEqual({ kind: 'relative', value: 0.05 })
    // 4 % off (4.16 for 4) is inside the 5 % band the author actually chose.
    expect(checkMatrixPart([['4.16', '0'], ['0', '4']], back, {}, S)).toMatchObject({ verdict: 'right' })
  })

  it('a teacher’s own edit to the exported file wins over a stale round-trip marker left from an earlier band', () => {
    const q: PQQuestion = {
      id: 'm', title: 'M', statement: 'Find the matrix.', variables: [],
      parts: [{ type: 'matrix', prompt: 'M', answer: [['4', '0'], ['0', '4']], tolerance: { kind: 'relative', value: 0.05 }, marks: 1 }],
      license: { id: 'CC BY 4.0', holder: 'PhysLab' }
    }
    const out = toExam(file(q))
    // A teacher opens the .exam and widens the gap themselves; the file still carries PhysLab's
    // "relative:0.05" marker from before the edit.
    const edited = out.replace('"tolerance":0', '"tolerance":0.2')
    expect((imported(edited).file.questions[0].parts[0] as MatrixPart).tolerance).toEqual({ kind: 'absolute', value: 0.2 })
    // The same for a teacher who switches on a precision restriction instead.
    const toPrecision = out.replace('"precisionType":"none"', '"precisionType":"dp"').replace('"precision":0', '"precision":1')
    expect((imported(toPrecision).file.questions[0].parts[0] as MatrixPart).tolerance).toEqual({ kind: 'absolute', value: 0.05 })
  })
})

// ---------------------------------------------------------------------------
// Adaptive marking and the variables' condition
// ---------------------------------------------------------------------------

/**
 * The braking train as Numbas writes it: v = 24 m/s, t = 8 s; part 1 a = −v/t = −3 m/s², part 2
 * s = vt + ½at² = 96 m with the student's part 1 put in place of a.
 */
function numbasTrain(adaptive: Raw = {}, variablesTest: Raw = { condition: '', maxRuns: 100 }): Raw {
  return question({
    name: 'Braking train',
    statement: '<p>A train moving at {v} m/s brakes evenly for {t} s.</p>',
    variables: { v: v('v', 'random(24..24)'), t: v('t', 'random(8..8)'), a: v('a', '-v/t') },
    ungrouped_variables: ['v', 't', 'a'],
    variablesTest,
    parts: [
      { type: 'numberentry', marks: 1, prompt: '<p>Its acceleration.</p><p>Give your answer in m/s².</p>', minValue: '(a) * (1 - 0.02)', maxValue: '(a) * (1 + 0.02)', variableReplacements: [], variableReplacementStrategy: 'originalfirst', adaptiveMarkingPenalty: 0 },
      {
        type: 'numberentry',
        marks: 2,
        prompt: '<p>How far it goes.</p><p>Give your answer in m.</p>',
        minValue: '(v * t + a * t ^ 2 / 2) * (1 - 0.02)',
        maxValue: '(v * t + a * t ^ 2 / 2) * (1 + 0.02)',
        variableReplacements: [{ variable: 'a', part: 'p0', must_go_first: false }],
        variableReplacementStrategy: 'originalfirst',
        adaptiveMarkingPenalty: 0,
        ...adaptive
      }
    ]
  })
}

describe('adaptive marking comes in as error carried forward', () => {
  it('the braking train: (a) −4 is wrong, then (b) 64 is right by error carried forward, with the note', () => {
    const { file, report } = imported(exam([numbasTrain()]))
    expect(report).toEqual([])
    expect(file.version).toBe(2)
    const q = file.questions[0]
    expect(q.parts[1].ecf).toEqual({ uses: [{ part: 0, variable: 'a' }], strategy: 'originalfirst', penalty: 0 })
    const [a, b] = sit(q, ['-4', '64'])
    expect(a.verdict).toBe('wrong')
    expect(b).toMatchObject({ verdict: 'right', marks: 2, ecfNote: 'Marked using your answer to part (a): −4 m/s²' })
    expect(sit(q, ['-4', '96'])[1]).toMatchObject({ verdict: 'right', marks: 2 })
    expect(sit(q, ['-4', '50'])[1]).toMatchObject({ verdict: 'wrong', marks: 0 })
  })

  it('keeps the penalty and the strategy', () => {
    const q = imported(exam([numbasTrain({ adaptiveMarkingPenalty: 1 })])).file.questions[0]
    expect(sit(q, ['-4', '64'])[1]).toMatchObject({ verdict: 'right', marks: 1, outOf: 2 })
    const always = imported(exam([numbasTrain({ variableReplacementStrategy: 'alwaysreplace' })])).file.questions[0]
    expect(always.parts[1].ecf?.strategy).toBe('alwaysreplace')
    expect(sit(always, ['-4', '96'])[1]).toMatchObject({ verdict: 'wrong', marks: 0 })
  })

  it('a penalty larger than the part is capped, and said', () => {
    const { file, report } = fromExam(exam([numbasTrain({ adaptiveMarkingPenalty: 5 })]))
    expect(file.questions[0].parts[1].ecf?.penalty).toBe(2)
    expect(report).toEqual([
      "Question 'Braking train', part 2 takes 5 marks off an answer marked with an earlier one, more than it is worth; PhysLab takes 2."
    ])
  })

  it('a part that must wait for the earlier one says PhysLab does not wait', () => {
    const { report } = fromExam(exam([numbasTrain({ variableReplacements: [{ variable: 'a', part: 'p0', must_go_first: true }] })]))
    expect(report).toEqual(["Question 'Braking train', part 2 waits in Numbas until part 1 is answered; PhysLab marks it with whatever that part holds."])
  })

  it('reaches the gaps of a gap-fill, from the gap-fill or from a gap, and never marks a gap with its own answer', () => {
    const gap = (answer: string, marks: number): Raw => ({ type: 'numberentry', marks, prompt: '', minValue: `(${answer}) * (1 - 0.02)`, maxValue: `(${answer}) * (1 + 0.02)` })
    const q = numbasTrain()
    const parts = (q.parts as Raw[]).map((p) => ({ ...p, variableReplacements: [] }))
    const gapfill: Raw = {
      type: 'gapfill',
      marks: 0,
      prompt: '<p>a = [[0]] m/s², s = [[1]] m</p>',
      gaps: [gap('a', 1), gap('v * t + a * t ^ 2 / 2', 2)],
      variableReplacements: [{ variable: 'a', part: 'p0g0', must_go_first: false }],
      variableReplacementStrategy: 'originalfirst',
      adaptiveMarkingPenalty: 0
    }
    const { file, report } = imported(exam([{ ...q, parts: [gapfill, parts[1]] }]))
    expect(report).toEqual([])
    const [first, second, third] = file.questions[0].parts
    expect(first.ecf).toBeUndefined()
    expect(second.ecf).toEqual({ uses: [{ part: 0, variable: 'a' }], strategy: 'originalfirst', penalty: 0 })
    expect(third.ecf).toBeUndefined()
    expect(sit(file.questions[0], ['-4', '64'])[1]).toMatchObject({ verdict: 'right', marks: 2 })
    // A later part may name the gap by its Numbas name.
    const named = { ...parts[1], variableReplacements: [{ variable: 'a', part: 'p0g0', must_go_first: false }] }
    const again = fromExam(exam([{ ...q, parts: [{ ...gapfill, variableReplacements: [] }, named] }]))
    expect(again.file.questions[0].parts[2].ecf?.uses).toEqual([{ part: 0, variable: 'a' }])
  })

  it('skips, in a sentence, a question whose adaptive marking PhysLab cannot follow', () => {
    const skip = (reps: Raw[]): string[] => fromExam(exam([numbasTrain({ variableReplacements: reps })])).report
    expect(skip([{ variable: 'q', part: 'p0', must_go_first: false }])).toEqual([
      "Question 'Braking train' was skipped: it marks part 2 with an earlier answer put in place of q, but there is no variable called that."
    ])
    expect(skip([{ variable: 'a', part: 'p5', must_go_first: false }])).toEqual([
      "Question 'Braking train' was skipped: it marks part 2 with the answer to part 6, which PhysLab does not ask as one number."
    ])
    expect(skip([{ variable: 'a', part: 'p1', must_go_first: false }])).toEqual([
      "Question 'Braking train' was skipped: it marks part 2 with the answer to part 2, which does not come before it."
    ])
    // No JSON path and no Numbas part name in any sentence.
    for (const s of [...skip([{ variable: 'a', part: 'p5', must_go_first: false }]), ...skip([{ variable: 'a', part: 'p0s1', must_go_first: false }])]) {
      expect(s).not.toMatch(/\bp\d|variableReplacements/)
    }
  })

  it('an earlier answer put in place of a matrix is skipped with the true reason', () => {
    const q = numbasTrain({ variableReplacements: [{ variable: 'm', part: 'p0', must_go_first: false }] })
    const withMatrix = { ...q, variables: { ...(q.variables as Raw), m: v('m', 'matrix([1,2],[3,4])') }, ungrouped_variables: ['v', 't', 'a', 'm'] }
    expect(fromExam(exam([withMatrix])).report).toEqual([
      "Question 'Braking train' was skipped: it marks part 2 with an earlier answer put in place of the matrix m, which PhysLab can only take as an answer."
    ])
  })

  it('an earlier part that is not a number cannot stand in for a variable', () => {
    const q = numbasTrain()
    const parts = q.parts as Raw[]
    const jme = { type: 'jme', marks: 1, prompt: '<p>a as a formula</p>', answer: '-v/t' }
    expect(fromExam(exam([{ ...q, parts: [jme, parts[1]] }])).report).toEqual([
      "Question 'Braking train' was skipped: it marks part 2 with the answer to part 1, which is not a number."
    ])
  })
})

/** ax² + bx + c kept only when it has real roots, as Numbas writes it. */
const quadratic = (condition: string, maxRuns: unknown = 50): Raw =>
  question({
    name: 'Real roots',
    variables: { a: v('a', 'random(-9..9 except 0)'), b: v('b', 'random(-9..9)'), c: v('c', 'random(-9..9)') },
    ungrouped_variables: ['a', 'b', 'c'],
    variablesTest: { condition, maxRuns },
    parts: [{ type: 'numberentry', marks: 1, prompt: '<p>The discriminant</p>', minValue: 'b^2-4*a*c', maxValue: 'b^2-4*a*c', precisionType: 'dp', precision: 0 }]
  })

describe('the variables’ condition', () => {
  it('comes in as the question’s condition, and every variant meets it', () => {
    const { file, report } = imported(exam([quadratic('b^2-4*a*c >= 0')]))
    expect(report).toEqual([])
    expect(file.version).toBe(2)
    const q = file.questions[0]
    expect(q.condition).toEqual({ when: 'b ^ 2 - 4 * a * c >= 0', maxRuns: 50 })
    for (let seed = 1; seed <= 500; seed++) {
      const { values, problems } = drawVariables(q, seed)
      expect(problems).toEqual([])
      expect(values.b ** 2 - 4 * values.a * values.c).toBeGreaterThanOrEqual(0)
    }
  })

  it('reads Numbas’s = and radians, takes 100 tries when none is given, and is nothing when empty', () => {
    const cond = (c: string, runs?: unknown): unknown => fromExam(exam([quadratic(c, runs)])).file.questions[0].condition
    expect(cond('a = 1 or sin(b) > 0', 'lots')).toEqual({ when: 'a == 1 or sin(b * 180 / pi) > 0', maxRuns: 100 })
    expect(cond('')).toBeUndefined()
    expect(cond('  ')).toBeUndefined()
  })

  it('that PhysLab cannot read skips the question in a sentence', () => {
    expect(fromExam(exam([quadratic('isprime(a)')])).report).toEqual([
      "Question 'Real roots' was skipped: it keeps only the variants that meet a condition using the function isprime, which PhysLab does not know."
    ])
  })

  it('a plain import still says format 1', () => {
    expect(fromExam(exam([quadratic('')])).file.version).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Going out and coming back
// ---------------------------------------------------------------------------

/** The adaptive-marking and condition fields of an exam, question by question and part by part. */
function carriedFields(text: string): unknown {
  return examQuestions(text).map((q) => ({
    variablesTest: q.variablesTest,
    parts: (q.parts as Raw[]).map((p) => ({
      variableReplacements: p.variableReplacements,
      variableReplacementStrategy: p.variableReplacementStrategy,
      adaptiveMarkingPenalty: p.adaptiveMarkingPenalty
    }))
  }))
}

describe('.exam → PhysLab → .exam', () => {
  it('keeps adaptive marking, its penalty and strategy, and the condition unchanged', () => {
    const source = exam([
      numbasTrain({ variableReplacementStrategy: 'alwaysreplace', adaptiveMarkingPenalty: 1 }, { condition: 'v * t >= 100', maxRuns: 20 })
    ])
    const { file, report } = fromExam(source)
    expect(report).toEqual([])
    expect(file.questions[0].condition).toEqual({ when: 'v * t >= 100', maxRuns: 20 })
    const out = toExam(file)
    expect(carriedFields(out)).toEqual(carriedFields(source))
    // …and a second trip changes nothing at all.
    expect(toExam(fromExam(out).file)).toBe(out)
  })

  it('keeps a matrix part, its gap, fractions and marks per entry', () => {
    const source = exam([question({ name: 'M', parts: [matrixPart('matrix([1, 2], [3, 4])', { tolerance: 0.01, allowFractions: true, markPerCell: true })] })])
    const out = toExam(fromExam(source).file)
    expect(examParts(out)[0]).toMatchObject({
      type: 'matrix',
      marks: 4,
      correctAnswer: 'matrix([1, 2], [3, 4])',
      numRows: 2,
      numColumns: 2,
      allowResize: false,
      tolerance: 0.01,
      allowFractions: true,
      markPerCell: true
    })
    expect(fromExam(out).file.questions[0].parts).toEqual(fromExam(source).file.questions[0].parts)
  })
})

/** The braking train as PhysLab writes it (tests/ecf.test.ts's): (b) carries (a) forward through a. */
function train(): PQQuestion {
  const band = { kind: 'relative' as const, value: 0.02 }
  return {
    id: 'train',
    title: 'A braking train',
    statement: 'A train moving at {v} brakes evenly for {t}.',
    variables: [
      { name: 'v', def: { kind: 'list', items: [24] }, unit: 'm/s' },
      { name: 't', def: { kind: 'list', items: [8] }, unit: 's' },
      { name: 'a', def: { kind: 'expr', expr: '-v/t' }, unit: 'm/s²' }
    ],
    parts: [
      { type: 'number', prompt: 'Its acceleration', answer: 'a', unit: 'm/s²', tolerance: band, marks: 1 },
      { type: 'number', prompt: 'How far it goes', answer: 'v*t + a*t^2/2', unit: 'm', tolerance: band, marks: 2, ecf: { uses: [{ part: 0, variable: 'a' }], strategy: 'originalfirst', penalty: 1 } }
    ],
    condition: { when: 'v * t > 0', maxRuns: 10 },
    license: { id: 'CC BY 4.0', holder: 'PhysLab' }
  }
}

const file = (...questions: PQQuestion[]): PQFile => ({ app: 'PhysLab', format: 'pqjson', version: 2, questions })
const LEGO: PQPart = { type: 'lego', prompt: 'Fill it.', target: [['0', '0'], ['2', '0'], ['0', '2']], pieces: 2, marks: 1 }

describe('PhysLab → .exam → PhysLab', () => {
  it('the braking train with error carried forward goes out as adaptive marking and comes back marking 64 by it', () => {
    const out = toExam(file(train()))
    expect(examParts(out)[1]).toMatchObject({
      variableReplacements: [{ variable: 'a', part: 'p0', must_go_first: false }],
      variableReplacementStrategy: 'originalfirst',
      adaptiveMarkingPenalty: 1
    })
    expect(examQuestions(out)[0].variablesTest).toEqual({ condition: 'v * t > 0', maxRuns: 10 })
    const { file: back, report } = imported(out)
    expect(report).toEqual([])
    const q = back.questions[0]
    expect(q.parts[1].ecf).toEqual(train().parts[1].ecf)
    expect(q.condition).toEqual(train().condition)
    const [a, b] = sit(q, ['-4', '64'])
    expect(a.verdict).toBe('wrong')
    expect(b).toMatchObject({ verdict: 'right', marks: 1, outOf: 2, ecfNote: 'Marked using your answer to part (a): −4 m/s²' })
    expect(sit(q, ['-3', '96']).map((c) => c.marks)).toEqual([1, 2])
  })

  it('points adaptive marking at the Numbas part a PhysLab part became, past a part left out', () => {
    const t = train()
    const out = toExam(file({ ...t, parts: [LEGO, t.parts[0], { ...t.parts[1], ecf: { uses: [{ part: 1, variable: 'a' }], strategy: 'originalfirst', penalty: 0 } }] }))
    expect(examParts(out).map((p) => p.type)).toEqual(['numberentry', 'numberentry'])
    expect(examParts(out)[1].variableReplacements).toEqual([{ variable: 'a', part: 'p0', must_go_first: false }])
    // A use of the part that was left out is said, not written.
    const dropped = toExam(file({ ...t, parts: [LEGO, { ...t.parts[1], ecf: { uses: [{ part: 0, variable: 'a' }], strategy: 'originalfirst', penalty: 0 } }] }))
    expect(examParts(dropped)[0].variableReplacements).toEqual([])
    expect((examQuestions(dropped)[0].metadata as Raw).description).toContain(
      'PhysLab marks part 2 with the answer to part 1, which this Numbas file leaves out, so Numbas marks it without.'
    )
  })

  it('a question with no condition keeps every variant in Numbas', () => {
    expect(examQuestions(toExam(file({ ...train(), condition: undefined })))[0].variablesTest).toEqual({ condition: '', maxRuns: 100 })
  })
})

describe('the new kinds go out as the nearest thing Numbas has', () => {
  const F = { name: 'F', def: { kind: 'list' as const, items: [10] }, unit: 'N' as const }
  const base = (parts: PQPart[], variables: PQQuestion['variables'] = [F]): PQQuestion => ({
    id: 'kinds',
    title: 'Kinds',
    statement: 'A question.',
    variables,
    parts,
    license: { id: 'CC BY 4.0', holder: 'PhysLab' }
  })
  const description = (text: string): string => (examQuestions(text)[0].metadata as Raw).description as string
  /** A JME bound read by the calculator, in degrees as every formula of the variables is. */
  const bound = (jme: unknown, values: Record<string, number> = {}): number => Number(inDegrees(() => math.evaluate(jmeToMath(jme as string), values)))

  it('a vector as a gap-fill of one number box per component, each within the band of the vector’s size', () => {
    const out = toExam(file(base([{ type: 'vector', prompt: 'The push', answer: ['F*cos(30)', 'F*sin(30)'], unit: 'N', tolerance: { kind: 'relative', value: 0.02 }, marks: 2 }])))
    const [part] = examParts(out)
    expect(part).toMatchObject({ type: 'gapfill', prompt: '<p>The push</p><p>[[0]] i + [[1]] j</p><p>Give your answer in N.</p>', sortAnswers: false })
    const gaps = part.gaps as Raw[]
    expect(gaps.map((g) => [g.type, g.marks])).toEqual([['numberentry', 1], ['numberentry', 1]])
    // F = 10 N at 30°: 8.66i + 5j, and each box is the component ± 2 % of 10 = 0.2.
    expect(bound(gaps[0].minValue, { F: 10 })).toBeCloseTo(8.660254 - 0.2, 6)
    expect(bound(gaps[0].maxValue, { F: 10 })).toBeCloseTo(8.660254 + 0.2, 6)
    expect(bound(gaps[1].minValue, { F: 10 })).toBeCloseTo(4.8, 9)
    expect(description(out)).toContain("PhysLab's part 1 is a vector; Numbas asks for its components one box each.")
  })

  it('roots as a gap-fill that sorts the student’s answers, the boxes smallest first', () => {
    const roots: PQPart = { type: 'roots', prompt: 'Solve x² + x − 6 = 0.', answer: ['2', '-3'], unit: 'none', tolerance: { kind: 'absolute', value: 0.01 }, marks: 2 }
    const [part] = examParts(toExam(file(base([roots], []))))
    expect(part).toMatchObject({ type: 'gapfill', sortAnswers: true, prompt: '<p>Solve x² + x − 6 = 0.</p><p>[[0]], [[1]]</p>' })
    expect((part.gaps as Raw[]).map((g) => [bound(g.minValue), bound(g.maxValue)])).toEqual([
      [-3.01, -2.99],
      [1.99, 2.01]
    ])
    // Three roots add the middle one.
    const three = examParts(toExam(file(base([{ ...roots, answer: ['1', '3', '2'] }], []))))[0]
    expect((three.gaps as Raw[]).map((g) => bound(g.minValue))).toEqual([0.99, 1.99, 2.99])
    // None cannot go into a number box, and is said.
    const none = toExam(file(base([{ ...roots, answer: [] }, roots], [])))
    expect(examParts(none)).toHaveLength(1)
    expect(description(none)).toContain("PhysLab's part 1 has no real roots as its answer, which a Numbas number box cannot take, so it is left out.")
  })

  it('a matrix as a Numbas matrix part', () => {
    const out = toExam(file(base([{ type: 'matrix', prompt: 'The inverse', answer: [['0.6', '-0.2'], ['-0.2', '0.4']], tolerance: { kind: 'absolute', value: 0.001 }, marks: 4, markPerCell: true }], [])))
    expect(examParts(out)[0]).toMatchObject({ type: 'matrix', correctAnswer: 'matrix([0.6, -0.2], [-0.2, 0.4])', numRows: 2, numColumns: 2, tolerance: 0.001, markPerCell: true, allowFractions: false })
    const back = fromExam(out).file.questions[0].parts[0] as MatrixPart
    expect(checkMatrixPart([['3/5', '-0.2'], ['-0.2', '0.4']], { ...back, allowFractions: true }, {}, S)).toMatchObject({ verdict: 'right' })
    expect(checkMatrixPart([['0.6', '-0.2'], ['-0.2', '0.5']], back, {}, S)).toMatchObject({ verdict: 'wrong', marks: 3 })
  })

  it('a function as a formula checked against its model, with PhysLab’s own check said', () => {
    const out = toExam(file(base([{ type: 'function', prompt: 'Solve it.', x: 'x', y: 'y', ode: "y'' + y = 0", initial: [{ at: '0', order: 0, value: '0' }, { at: '0', order: 1, value: '1' }], model: 'sin(x)', marks: 2 }], [])))
    expect(examParts(out)[0]).toMatchObject({ type: 'jme', answer: 'sin(x)', vsetRange: [0.1, 1], marks: 2 })
    expect(description(out)).toContain("Numbas checks part 1 against the model answer y = sin(x) alone; PhysLab accepts any y that solves y'' + y = 0 with y(0) = 0 and y'(0) = 1.")
  })

  it('a proof as information, its model and self-check list in the advice; a Lego part left out with a sentence', () => {
    const out = toExam(file(base([
      { type: 'proof', prompt: 'Prove that the angles of a triangle add up to 180°.', model: 'Draw a line through one corner parallel to the far side.', selfCheck: ['I named the parallel line.'], marks: 0 },
      LEGO
    ], [])))
    expect(examParts(out)).toEqual([expect.objectContaining({ type: 'information', marks: 0, prompt: '<p>Prove that the angles of a triangle add up to 180°.</p>' })])
    expect(examQuestions(out)[0].advice).toBe('<p>A model proof for part 1:</p><p>Draw a line through one corner parallel to the far side.</p><ul><li>I named the parallel line.</li></ul>')
    expect(description(out)).toContain("PhysLab's part 2 fills a shape with Lego pieces, which Numbas cannot ask, so it is left out.")
  })

  it('a stated (Eₙ) number as a number box at 2 %, a relative matrix band and a shown-if condition said in words', () => {
    const out = toExam(file(base([
      { type: 'number', prompt: 'E₀', answer: '0.559146', unit: 'none', tolerance: { kind: 'stated', uref: '0.000001' }, marks: 1 },
      { type: 'matrix', prompt: 'M', answer: [['F', '0'], ['0', 'F']], tolerance: { kind: 'relative', value: 0.05 }, marks: 1, showIf: 'F > 5' }
    ])))
    const [stated, matrix] = examParts(out)
    expect(stated).toMatchObject({ type: 'numberentry', minValue: '(0.559146) - abs(0.559146) * (0.02)', maxValue: '(0.559146) + abs(0.559146) * (0.02)' })
    expect(matrix).toMatchObject({ type: 'matrix', correctAnswer: 'matrix([F, 0], [0, F])', tolerance: 0 })
    const d = description(out)
    expect(d).toContain("PhysLab marks part 1 against the student's own stated uncertainty (the Eₙ test); Numbas checks it within 2 %.")
    expect(d).toContain('PhysLab accepts each entry of part 2 within 5 % of its own value; Numbas checks each entry exactly.')
    expect(d).toContain('PhysLab shows part 2 only when F > 5; Numbas always shows it.')
  })
})

// Playing the new kinds in Practice (QE4): a format-2 question read from its own file and played the
// way the panel plays it — every kind marked through checkPlayedPart and markPlayed, a part hidden
// by its showIf neither shown nor counted, a proof shown but never counted, a Lego part counted, error
// carried forward from the student's own earlier answers, and the depth ladder's label, filter and
// "Go deeper" link. Every question here goes through serializePQFile and parsePQFile first, so what
// is tested is what a teacher's file actually plays.

import { beforeEach, describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { resetGlobals } from './helpers/globals'
import { isCorrect } from '../src/renderer/src/math/checkAnswer'
import type { MeasureSettings } from '../src/renderer/src/math/format'
import {
  blankAnswer,
  checkPlayedPart,
  countedParts,
  markPlayed,
  playQuestion,
  questionsAtDepth,
  resolveDeeper,
  rungLabel,
  rungsIn,
  type PartAnswer,
  type Played
} from '../src/renderer/src/questions/player'
import { parsePQFile, serializePQFile, type ECF, type PQPart, type PQQuestion } from '../src/renderer/src/questions/pqjson'
import { PartRows, questionVerdict, tally, type RowCheck } from '../src/renderer/src/panels/QuestionParts'

beforeEach(() => resetGlobals())

const S: MeasureSettings = { decimals: 2, precisionMode: 'dp', unit: 'm', unitPerSquare: 1, angleUnit: 'deg' }
const band = { kind: 'relative' as const, value: 0.02 }
const LICENSE = { id: 'CC BY 4.0' as const, holder: 'PhysLab' }

/** Writes the questions into one .pqjson file and reads them back, the way Practice gets them. */
function throughFile(...qs: PQQuestion[]): PQQuestion[] {
  const text = serializePQFile({ app: 'PhysLab', format: 'pqjson', version: 1, questions: qs })
  const file = parsePQFile(text)
  expect(file.version).toBe(2)
  return file.questions
}

// ---------------------------------------------------------------------------
// One question holding every kind
// ---------------------------------------------------------------------------

/**
 * F = 10 N at θ = 30°: the vector (8.66i + 5j) N; x² + x − 6 = 0 has roots 2 and −3; the inverse of
 * [[2, 1], [1, 3]] is [[0.6, −0.2], [−0.2, 0.4]]; E₀ = 0.559146 ± 0.000001 (Eₙ); y″ + y = 0 with
 * y(0) = 0, y′(0) = 1 is solved by sin x; F cos θ = 8.66 N; and a listed choice, a proof and a
 * Lego part filled by the triangle itself; the proof is shown but never counted.
 */
const EVERY: PQQuestion = {
  id: 'every-kind',
  title: 'Every kind',
  statement: 'A force of {F} acts at {theta} to the x axis.',
  variables: [
    { name: 'F', def: { kind: 'list', items: [10] }, unit: 'N' },
    { name: 'theta', def: { kind: 'list', items: [30] }, unit: '°' }
  ],
  parts: [
    { type: 'vector', prompt: 'F in components', answer: ['F*cos(theta)', 'F*sin(theta)'], unit: 'N', tolerance: band, marks: 2 },
    { type: 'roots', prompt: 'Solve x² + x − 6 = 0', answer: ['2', '-3'], unit: 'none', tolerance: { kind: 'absolute', value: 0.01 }, marks: 2 },
    {
      type: 'matrix',
      prompt: 'Invert [[2, 1], [1, 3]]',
      answer: [
        ['0.6', '-0.2'],
        ['-0.2', '0.4']
      ],
      tolerance: { kind: 'absolute', value: 0.005 },
      allowFractions: true,
      markPerCell: true,
      marks: 4
    },
    { type: 'number', prompt: 'E₀', answer: '0.559146', unit: 'none', tolerance: { kind: 'stated', uref: '0.000001' }, marks: 3 },
    {
      type: 'function',
      prompt: 'Find y(x).',
      x: 'x',
      y: 'y',
      ode: "y'' + y = 0",
      initial: [
        { at: '0', order: 0, value: '0' },
        { at: '0', order: 1, value: '1' }
      ],
      model: 'sin(x)',
      marks: 2
    },
    { type: 'number', prompt: 'The x component of F', answer: 'F*cos(theta)', unit: 'N', tolerance: band, marks: 1 },
    {
      type: 'choice',
      prompt: 'Which way does F point?',
      choices: [
        { text: 'Up and to the right', correct: true },
        { text: 'Down and to the left', correct: false, why: 'Both of its components are positive.' }
      ],
      shuffle: false,
      marks: 1
    },
    { type: 'proof', prompt: 'Prove that sin²θ + cos²θ = 1.', model: 'Divide x² + y² = r² by r².', selfCheck: ['You started from Pythagoras.', 'You divided by r².'], marks: 0 },
    {
      type: 'lego',
      prompt: 'Fill the triangle with Lego pieces.',
      target: [
        ['0', '0'],
        ['4', '0'],
        ['0', '3']
      ],
      pieces: 3,
      marks: 1
    },
    { type: 'expression', prompt: 'The work F does along a distance d in its own direction', answer: 'F*d', symbols: ['d'], marks: 1 }
  ],
  license: LICENSE,
  rung: 4
}

const RIGHT: Record<string, PartAnswer> = {
  p0: '10∠30°',
  p1: 'x = −3 or x = 2',
  p2: [
    ['3/5', '-1/5'],
    ['-1/5', '2/5']
  ],
  p3: '0.55915 ± 0.00001',
  p4: 'y = sin(x)',
  p5: '8.66 N',
  p6: [0],
  // What Check my shape hands in: one row per shape on the drawing, its corners' x and y in turn —
  // here the pieces put back into the triangle and fused.
  p8: [['0', '0', '4', '0', '0', '3']],
  p9: '10d'
}

describe('a played format-2 question marks every kind through checkPlayedPart', () => {
  const [q] = throughFile(EVERY)
  const played = playQuestion(q, 1, S)
  const part = (key: string) => played.parts.find((p) => p.key === key)!

  it('plays with no problems, one row per part, keyed by the author’s index', () => {
    expect(played.problems).toEqual([])
    expect(played.parts.map((p) => [p.key, p.index, p.part.type])).toEqual([
      ['p0', 0, 'vector'],
      ['p1', 1, 'roots'],
      ['p2', 2, 'matrix'],
      ['p3', 3, 'number'],
      ['p4', 4, 'function'],
      ['p5', 5, 'number'],
      ['p6', 6, 'choice'],
      ['p7', 7, 'proof'],
      ['p8', 8, 'lego'],
      ['p9', 9, 'expression']
    ])
  })

  it('a matrix part is one box per entry, 2 × 2, and starts as a grid of empty boxes', () => {
    expect(part('p2').matrix).toEqual({ rows: 2, cols: 2 })
    expect(blankAnswer(part('p2'))).toEqual([
      ['', ''],
      ['', '']
    ])
    expect(blankAnswer(part('p6'))).toEqual([])
    expect(blankAnswer(part('p0'))).toBe('')
  })

  it('a proof part carries its model proof and self-check list, with its maths set', () => {
    const proof = part('p7')
    expect(proof.model?.flat().length).toBeGreaterThan(0)
    expect(proof.selfCheck).toHaveLength(2)
  })

  it('each right answer is right', () => {
    for (const key of Object.keys(RIGHT)) expect(isCorrect(checkPlayedPart(part(key), RIGHT[key], played, S)), key).toBe(true)
  })

  it('each wrong answer is wrong, with its own sentence', () => {
    expect(checkPlayedPart(part('p0'), '5i + 8.66j', played, S).message).toBe(
      'The right numbers, but the components are swapped round: the first number goes with i, the second with j.'
    )
    expect(checkPlayedPart(part('p1'), '2', played, S).message).toBe('You have 1 of the 2 roots.')
    expect(
      checkPlayedPart(
        part('p2'),
        [
          ['0.6', '-0.2'],
          ['-0.2', '0.5']
        ],
        played,
        S
      ).message
    ).toBe('3 of the 4 entries are right.')
    expect(checkPlayedPart(part('p3'), '0.6 ± 0.1', played, S).verdict).toBe('wrong')
    expect(checkPlayedPart(part('p3'), '0.5591', played, S)).toEqual({ verdict: 'unreadable', message: 'Give your uncertainty too, like 0.5591 ± 0.0001.' })
    expect(checkPlayedPart(part('p4'), '2 sin(x)', played, S)).toEqual({
      verdict: 'wrong',
      message: 'That solves the equation but does not start where the question says: y′(0) should be 1.'
    })
    expect(checkPlayedPart(part('p5'), '5', played, S).verdict).toBe('wrong')
    expect(checkPlayedPart(part('p6'), [1], played, S).verdict).toBe('wrong')
    expect(checkPlayedPart(part('p9'), '10 + d', played, S).verdict).toBe('wrong')
  })

  it('a matrix typed as one line, or nothing typed yet, is never marked wrong', () => {
    expect(checkPlayedPart(part('p2'), '0.6, -0.2, -0.2, 0.4', played, S).verdict).toBe('empty')
    expect(checkPlayedPart(part('p2'), blankAnswer(part('p2')), played, S).verdict).toBe('empty')
  })

  it('a proof is never marked: it says so in a sentence', () => {
    expect(checkPlayedPart(part('p7'), 'By Pythagoras.', played, S)).toEqual({
      verdict: 'unreadable',
      message: 'A proof is not marked on this computer: compare yours with the model proof and its checklist.'
    })
  })

  it('the proof is shown but not counted; the Lego part is counted, so the question is all right only with the shape filled', () => {
    expect(countedParts(played).map((p) => p.key)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p8', 'p9'])
    const marks = markPlayed(played, RIGHT, S)
    expect(Object.keys(marks)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p8', 'p9'])
    expect(Object.values(marks).every(isCorrect)).toBe(true)
    expect(questionVerdict(played, marks, false)).toBe(true)
    // Every counted part earns its full marks: 2 + 2 + 4 + 3 + 2 + 1 + 1 + 1 + 1.
    expect(Object.values(marks).map((c) => [c.marks, c.outOf])).toEqual([
      [2, 2],
      [2, 2],
      [4, 4],
      [3, 3],
      [2, 2],
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 1]
    ])
    // Every other part right, but the pieces make a different triangle of the same area 6: that
    // part is wrong, earns nothing, and the question is not all right.
    const other = markPlayed(played, { ...RIGHT, p8: [['0', '0', '6', '0', '0', '2']] }, S)
    expect(other.p8).toMatchObject({ verdict: 'wrong', marks: 0, outOf: 1 })
    expect(other.p8.message).toMatch(/^Same area, different outline: the pieces make /)
    expect(questionVerdict(played, other, false)).toBe(false)
    // Never laid out and never checked, it holds the question back like any empty box.
    const { p8: _unfilled, ...rest } = RIGHT
    expect(markPlayed(played, rest, S).p8).toMatchObject({ verdict: 'empty', marks: 0 })
    expect(questionVerdict(played, markPlayed(played, rest, S), false)).toBe(false)
  })

  it('markPlayed with nothing typed leaves every box empty, the matrix included, and earns nothing', () => {
    const marks = markPlayed(played, {}, S)
    for (const [key, c] of Object.entries(marks)) {
      expect(c.verdict, key).toBe('empty')
      expect(c.marks, key).toBe(0)
    }
  })

  it('markPlayed shares a matrix’s marks out entry by entry', () => {
    const marks = markPlayed(
      played,
      {
        p2: [
          ['0.6', '-0.2'],
          ['-0.2', '0.5']
        ]
      },
      S
    )
    expect(marks.p2).toMatchObject({ verdict: 'wrong', marks: 3, outOf: 4, message: '3 of the 4 entries are right.' })
  })
})

// ---------------------------------------------------------------------------
// showIf: a hidden part is neither shown nor counted
// ---------------------------------------------------------------------------

describe('showIf in Practice: a block on a slope at θ = 30° (tan θ = 0.577)', () => {
  const slope = (mu: number, ecf?: ECF): PQQuestion =>
    throughFile({
      id: 'slope',
      title: 'A block on a slope',
      statement: 'A block rests on a slope at {theta}; the coefficient of friction is {mu}.',
      variables: [
        { name: 'mu', def: { kind: 'list', items: [mu] } },
        { name: 'theta', def: { kind: 'list', items: [30] }, unit: '°' },
        { name: 'a', def: { kind: 'expr', expr: '9.8 * (sin(theta) - mu * cos(theta))' }, unit: 'm/s²' }
      ],
      parts: [
        { type: 'number', prompt: 'tan θ', answer: 'tan(theta)', unit: 'none', tolerance: band, marks: 1 },
        { type: 'number', prompt: 'Its acceleration down the slope', answer: 'a', unit: 'm/s²', tolerance: band, marks: 2, showIf: 'mu < tan(theta)' },
        { type: 'number', prompt: 'The friction on it, per kilogram', answer: '9.8 * sin(theta)', unit: 'N', tolerance: band, marks: 2, showIf: 'mu >= tan(theta)' },
        { type: 'number', prompt: 'Its speed after 2 s', answer: 'max(a, 0) * 2', unit: 'm/s', tolerance: band, marks: 1, ...(ecf ? { ecf } : {}) }
      ],
      license: LICENSE
    })[0]

  it('μ = 0.8 ≥ tan 30°: the sliding part is not a row, keeps no key, and the others keep the author’s keys', () => {
    const played = playQuestion(slope(0.8), 1, S)
    expect(played.parts.map((p) => [p.key, p.index])).toEqual([
      ['p0', 0],
      ['p2', 2],
      ['p3', 3]
    ])
    expect(played.problem.fields.map((f) => f.key)).toEqual(['p0', 'p2', 'p3'])
  })

  it('…and it is not counted: the three shown parts right is all right, and no mark is kept for the hidden one', () => {
    const played = playQuestion(slope(0.8), 1, S)
    // tan 30° = 0.577; 9.8 sin 30° = 4.9 N; it does not slide, so its speed after 2 s is 0.
    const marks = markPlayed(played, { p0: '0.577', p1: '1.2', p2: '4.9', p3: '0' }, S)
    expect(Object.keys(marks)).toEqual(['p0', 'p2', 'p3'])
    expect(Object.values(marks).every(isCorrect)).toBe(true)
  })

  it('the revealed answers go by the author’s index: the friction box shows 4.9 N, not the hidden part’s answer', () => {
    const played = playQuestion(slope(0.8), 1, S)
    const friction = played.parts.find((p) => p.key === 'p2')!
    expect(played.full.answers[friction.index].tex).toBe(played.full.answers[2].tex)
    expect(played.full.answers[friction.index].tex).toMatch(/^4\.9/)
    expect(friction.answerText).toMatch(/^4\.9/)
  })

  it('μ = 0.3 < tan 30°: the sliding part shows (a = 9.8(sin 30° − 0.3 cos 30°) = 2.35 m/s²) and the staying part does not', () => {
    const played = playQuestion(slope(0.3), 1, S)
    expect(played.parts.map((p) => p.key)).toEqual(['p0', 'p1', 'p3'])
    const marks = markPlayed(played, { p0: '0.577', p1: '2.35', p3: '4.70' }, S)
    expect(Object.keys(marks)).toEqual(['p0', 'p1', 'p3'])
    expect(Object.values(marks).every(isCorrect)).toBe(true)
  })

  it('a later part carrying forward a hidden part’s answer is marked plainly: the hidden box was never typed in', () => {
    const played = playQuestion(slope(0.8, { uses: [{ part: 1, variable: 'a' }], strategy: 'alwaysreplace', penalty: 0 }), 1, S)
    // A stale answer left in the hidden part's box (a different variant, say) must not be carried forward.
    const marks = markPlayed(played, { p1: '5', p3: '0' }, S)
    expect(marks.p3).toMatchObject({ verdict: 'right', marks: 1 })
    expect(marks.p3.ecfNote).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Error carried forward through markPlayed
// ---------------------------------------------------------------------------

describe('error carried forward through markPlayed: the braking train (v = 24 m/s, t = 8 s)', () => {
  // (a) a = −v/t = −3 m/s²; (b) s = vt + ½at² = 96 m, from (a); (c) s/t = 12 m/s, from (b).
  const carry = (part: number, variable: string, over: Partial<ECF> = {}): ECF => ({ uses: [{ part, variable }], strategy: 'originalfirst', penalty: 0, ...over })
  const train = (over: Partial<ECF> = {}, extra: PQPart[] = []): PQQuestion =>
    throughFile({
      id: 'train',
      title: 'A braking train',
      statement: 'A train moving at {v} brakes evenly for {t}.',
      variables: [
        { name: 'v', def: { kind: 'list', items: [24] }, unit: 'm/s' },
        { name: 't', def: { kind: 'list', items: [8] }, unit: 's' },
        { name: 'a', def: { kind: 'expr', expr: '-v/t' }, unit: 'm/s²' },
        { name: 's', def: { kind: 'expr', expr: 'v*t + a*t^2/2' }, unit: 'm' }
      ],
      parts: [
        { type: 'number', prompt: 'Its acceleration', answer: 'a', unit: 'm/s²', tolerance: band, marks: 1 },
        { type: 'number', prompt: 'How far it goes', answer: 'v*t + a*t^2/2', unit: 'm', tolerance: band, marks: 2, ecf: carry(0, 'a', over) },
        { type: 'number', prompt: 'Its average speed', answer: 's/t', unit: 'm/s', tolerance: band, marks: 1, ecf: carry(1, 's') },
        ...extra
      ],
      license: LICENSE
    })[0]
  const mark = (q: PQQuestion, typed: Record<string, PartAnswer>) => markPlayed(playQuestion(q, 1, S), typed, S)

  it('the true answers −3 m/s², 96 m and 12 m/s are right, with no note', () => {
    const m = mark(train(), { p0: '-3', p1: '96', p2: '12' })
    expect([m.p0, m.p1, m.p2].map((c) => [c.verdict, c.marks, c.ecfNote])).toEqual([
      ['right', 1, undefined],
      ['right', 2, undefined],
      ['right', 1, undefined]
    ])
  })

  it('(a) −4 is wrong; (b) 64 = 24·8 + ½(−4)·8² is right with the note; (c) 8 = 64/8 is right from (b)', () => {
    const m = mark(train(), { p0: '-4', p1: '64', p2: '8' })
    expect(m.p0.verdict).toBe('wrong')
    expect(m.p1).toMatchObject({ verdict: 'right', marks: 2, outOf: 2, ecfNote: 'Marked using your answer to part (a): −4 m/s²' })
    expect(m.p2).toMatchObject({ verdict: 'right', marks: 1, ecfNote: 'Marked using your answer to part (b): 64 m' })
  })

  it('a penalty of 1 leaves 1 of the 2 marks for the carried-forward answer, and nothing off the true one', () => {
    expect(mark(train({ penalty: 1 }), { p0: '-4', p1: '64' }).p1).toMatchObject({ verdict: 'right', marks: 1, outOf: 2 })
    expect(mark(train({ penalty: 1 }), { p0: '-4', p1: '96' }).p1).toMatchObject({ verdict: 'right', marks: 2 })
  })

  it('an earlier answer right within its tolerance (−3.02 for −3 at 2 %) is not carried forward', () => {
    const m = mark(train({ strategy: 'alwaysreplace' }), { p0: '-3.02', p1: '96' })
    expect(m.p1).toMatchObject({ verdict: 'right', marks: 2 })
    expect(m.p1.ecfNote).toBeUndefined()
  })

  it('a choice part that says it carries (a) forward is never re-marked with the student’s numbers', () => {
    const choice: PQPart = {
      type: 'choice',
      prompt: 'Is it slowing down?',
      choices: [
        { text: 'Yes', correct: true },
        { text: 'No', correct: false }
      ],
      shuffle: false,
      marks: 1,
      ecf: carry(0, 'a', { strategy: 'alwaysreplace' })
    }
    const m = mark(train({}, [choice]), { p0: '-4', p3: [0] })
    expect(m.p3).toMatchObject({ verdict: 'right', marks: 1 })
    expect(m.p3.ecfNote).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// The depth ladder: a label, a filter and a link — never a lock
// ---------------------------------------------------------------------------

describe('the depth ladder in Practice', () => {
  const q = (id: string, rung?: 1 | 2 | 3 | 4 | 5, deeper?: string): PQQuestion => ({
    id,
    title: id,
    statement: 'A ball falls for {t}.',
    variables: [{ name: 't', def: { kind: 'list', items: [2] }, unit: 's' }],
    parts: [{ type: 'number', prompt: 'How far it falls', answer: '4.9*t^2', unit: 'm', tolerance: band, marks: 1 }],
    license: LICENSE,
    ...(rung !== undefined ? { rung } : {}),
    ...(deeper !== undefined ? { deeper } : {})
  })
  const set = throughFile(q('fall-2', 2, 'fall-3'), q('plain'), q('fall-3', 3, 'fall-4'), q('fall-2b', 2), q('self', 5, 'self'), q('spaced', 1, '  fall-2  '))

  it('labels a rung by its number and its name', () => {
    expect(rungLabel(1)).toBe('Depth 1 · First look')
    expect(rungLabel(2)).toBe('Depth 2 · School')
    expect(rungLabel(3)).toBe('Depth 3 · Pre-university')
    expect(rungLabel(4)).toBe('Depth 4 · University')
    expect(rungLabel(5)).toBe('Depth 5 · Research')
  })

  it('offers each rung the set has once, lowest first', () => {
    expect(rungsIn(set)).toEqual([1, 2, 3, 5])
    expect(rungsIn([])).toEqual([])
  })

  it('filters to one depth in the set’s order; every depth is the whole set, unrung questions included', () => {
    expect(questionsAtDepth(set, 2).map((x) => x.id)).toEqual(['fall-2', 'fall-2b'])
    expect(questionsAtDepth(set, 4)).toEqual([])
    expect(questionsAtDepth(set, null).map((x) => x.id)).toEqual(['fall-2', 'plain', 'fall-3', 'fall-2b', 'self', 'spaced'])
  })

  it('"Go deeper" resolves inside the set', () => {
    const r = resolveDeeper(set[0], set)
    expect(r && 'question' in r && r.question.id).toBe('fall-3')
  })

  it('…and says so in a sentence when the deeper question is not in the set', () => {
    expect(resolveDeeper(set[2], set)).toEqual({ missing: 'This question leads on to a deeper one ("fall-4"), but it is not in this set.' })
  })

  it('a question with no deeper link has none; one that points at itself is not a way deeper', () => {
    expect(resolveDeeper(set[1], set)).toBeNull()
    expect(resolveDeeper(set[4], set)).toEqual({ missing: 'This question leads on to a deeper one ("self"), but it is not in this set.' })
  })

  it('an id with spaces round it still finds its question', () => {
    const r = resolveDeeper(set[5], set)
    expect(r && 'question' in r && r.question.id).toBe('fall-2')
  })

  it('a deeper question that was filtered out by depth is still found in the whole set', () => {
    // Practice passes the set's own questions, not the depth-filtered list, so rung 2 leads to rung 3.
    const played: Played = playQuestion(questionsAtDepth(set, 2)[0], 1, S)
    const r = resolveDeeper(played.question, set)
    expect(r && 'question' in r && r.question.rung).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// The rows Practice draws carry the author's letters, the ones an ECF note names
// ---------------------------------------------------------------------------

/** Practice's answer rows for a played question, as markup: each row's letter and its words. */
function rowsOf(played: Played, checks: Record<string, RowCheck> = {}): { label: string; text: string }[] {
  const html = renderToStaticMarkup(createElement(PartRows, { played, typed: {}, checks, revealed: false, onChange: () => {}, onEnter: () => {} }))
  return html
    .split('<div class="mb-3">')
    .slice(1)
    .map((row) => ({ label: /<span class="mr-1 font-semibold text-ink-dim">([^<]*)<\/span>/.exec(row)?.[1] ?? '', text: row.replace(/<[^>]+>/g, ' ') }))
}

describe('Practice labels each row by the author’s part letter', () => {
  /** (a) x; (b) shown only when x > 100, so never here; (c) y; (d) 2y, carrying (c) forward. */
  const drift = (): PQQuestion =>
    throughFile({
      id: 'drift',
      title: 'Letters past a hidden part',
      statement: 'x is {x} and y is {y}.',
      variables: [
        { name: 'x', def: { kind: 'list', items: [3] } },
        { name: 'y', def: { kind: 'list', items: [5] } }
      ],
      parts: [
        { type: 'number', prompt: 'What is x?', answer: 'x', unit: 'none', tolerance: band, marks: 1 },
        { type: 'number', prompt: 'What is x − 100?', answer: 'x - 100', unit: 'none', tolerance: band, marks: 1, showIf: 'x > 100' },
        { type: 'number', prompt: 'What is y?', answer: 'y', unit: 'none', tolerance: band, marks: 1 },
        {
          type: 'number',
          prompt: 'What is 2y?',
          answer: '2*y',
          unit: 'none',
          tolerance: band,
          marks: 1,
          ecf: { uses: [{ part: 2, variable: 'y' }], strategy: 'originalfirst', penalty: 0 }
        }
      ],
      license: LICENSE
    })[0]

  it('with a part hidden by its showIf, the shown rows read (a), (c), (d) — never 1., 2., 3.', () => {
    const played = playQuestion(drift(), 1, S)
    expect(rowsOf(played).map((r) => r.label)).toEqual(['(a)', '(c)', '(d)'])
  })

  it('the ECF note names the row the student sees with that letter, past the hidden part', () => {
    const played = playQuestion(drift(), 1, S)
    // (c) 6 is wrong for y = 5; (d) 12 = 2 × 6 is right from the student's own (c).
    const checks = markPlayed(played, { p0: '3', p2: '6', p3: '12' }, S)
    expect(checks.p3).toMatchObject({ verdict: 'right', ecfNote: 'Marked using your answer to part (c): 6' })
    const rows = rowsOf(played, checks)
    expect(rows.find((r) => r.label === '(c)')!.text).toContain('What is y?')
    expect(rows.find((r) => r.label === '(d)')!.text).toContain('Marked using your answer to part (c): 6')
  })

  it('the braking train: the rows read (a), (b), (c) and the note under (b) names row (a)', () => {
    const [train] = throughFile({
      id: 'train-rows',
      title: 'A braking train',
      statement: 'A train moving at {v} brakes evenly for {t}.',
      variables: [
        { name: 'v', def: { kind: 'list', items: [24] }, unit: 'm/s' },
        { name: 't', def: { kind: 'list', items: [8] }, unit: 's' },
        { name: 'a', def: { kind: 'expr', expr: '-v/t' }, unit: 'm/s²' }
      ],
      parts: [
        { type: 'number', prompt: 'Its acceleration', answer: 'a', unit: 'm/s²', tolerance: band, marks: 1 },
        {
          type: 'number',
          prompt: 'How far it goes',
          answer: 'v*t + a*t^2/2',
          unit: 'm',
          tolerance: band,
          marks: 2,
          ecf: { uses: [{ part: 0, variable: 'a' }], strategy: 'originalfirst', penalty: 0 }
        },
        { type: 'number', prompt: 'How long it brakes for', answer: 't', unit: 's', tolerance: band, marks: 1 }
      ],
      license: LICENSE
    })
    const played = playQuestion(train, 1, S)
    const rows = rowsOf(played, markPlayed(played, { p0: '-4', p1: '64', p2: '8' }, S))
    expect(rows.map((r) => r.label)).toEqual(['(a)', '(b)', '(c)'])
    expect(rows[0].text).toContain('Its acceleration')
    expect(rows[1].text).toContain('Marked using your answer to part (a)')
  })

  it('a question with one part shows no letter at all', () => {
    // A format-1 question: throughFile's version check is for format 2, so it is read back directly.
    const one: PQQuestion = {
      id: 'one',
      title: 'One part',
      statement: 'x is {x}.',
      variables: [{ name: 'x', def: { kind: 'list', items: [3] } }],
      parts: [{ type: 'number', prompt: 'What is x?', answer: 'x', unit: 'none', tolerance: band, marks: 1 }],
      license: LICENSE
    }
    const [read] = parsePQFile(serializePQFile({ app: 'PhysLab', format: 'pqjson', version: 1, questions: [one] })).questions
    expect(rowsOf(playQuestion(read, 1, S)).map((r) => r.label)).toEqual([''])
  })
})

// ---------------------------------------------------------------------------
// A question with nothing marked on this computer is never scored as a miss
// ---------------------------------------------------------------------------

describe('a proof-only question is not counted against the student', () => {
  const proofOnly: PQQuestion = {
    id: 'pythagoras',
    title: 'Why sin² + cos² = 1',
    statement: 'A point on a circle of radius r makes an angle θ with the x axis.',
    variables: [],
    parts: [
      { type: 'proof', prompt: 'Prove that sin²θ + cos²θ = 1.', model: 'Divide x² + y² = r² by r².', selfCheck: ['You started from Pythagoras.', 'You divided by r².'], marks: 0 }
    ],
    rung: 5,
    license: LICENSE
  }
  const withNumber: PQQuestion = {
    ...proofOnly,
    id: 'pythagoras-and-number',
    variables: [{ name: 'x', def: { kind: 'list', items: [3] } }],
    parts: [...proofOnly.parts, { type: 'number', prompt: 'What is x?', answer: 'x', unit: 'none', tolerance: band, marks: 1 }]
  }

  it('has nothing to mark: markPlayed gives no box a mark, and the question is neither right nor wrong', () => {
    const [q] = throughFile(proofOnly)
    const played = playQuestion(q, 1, S)
    expect(countedParts(played)).toEqual([])
    const checks = markPlayed(played, { p0: 'x² + y² = r², so divide by r².' }, S)
    expect(checks).toEqual({})
    expect(questionVerdict(played, checks, false)).toBeNull()
    // Opening the full solution does not turn it into a miss either.
    expect(questionVerdict(played, checks, true)).toBeNull()
  })

  it('a set of a right question, a wrong one and a proof finishes 1 / 2 right, with the proof not marked', () => {
    const [q, mixed] = throughFile(proofOnly, withNumber)
    const proof = playQuestion(q, 1, S)
    const good = playQuestion(mixed, 1, S)
    const results = [
      { right: questionVerdict(good, markPlayed(good, { p1: '3' }, S), false) },
      { right: questionVerdict(good, markPlayed(good, { p1: '4' }, S), false) },
      { right: questionVerdict(proof, {}, false) }
    ]
    expect(results.map((r) => r.right)).toEqual([true, false, null])
    expect(tally(results)).toEqual({ right: 1, marked: 2, unmarked: 1 })
  })

  it('a proof beside a marked part still leaves the question marked by that part', () => {
    const [mixed] = throughFile(withNumber)
    const played = playQuestion(mixed, 1, S)
    expect(questionVerdict(played, markPlayed(played, { p1: '3' }, S), false)).toBe(true)
    expect(questionVerdict(played, markPlayed(played, { p1: '3' }, S), true)).toBe(false)
    expect(questionVerdict(played, {}, false)).toBe(false)
  })
})

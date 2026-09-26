// The answer kinds of format 2 — a vector, a matrix, a set of roots and a number with its own
// uncertainty (Eₙ) — marked from what a student types. Every known answer of S-Q's QE1 section is
// here, and the tests cross a boundary: a typed line into a verdict, and a .pqjson file through
// the parser and the player into the same verdict.

import { beforeEach, describe, expect, it, vi } from 'vitest'

// The stylesheet is not loaded here, so the player's drawing colours fall back.
vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import katex from 'katex'
import { resetGlobals } from './helpers/globals'
import { math } from '../src/renderer/src/math/expr'
import type { MeasureSettings } from '../src/renderer/src/math/format'
import { isCorrect, type Check } from '../src/renderer/src/math/checkAnswer'
import {
  checkFormat2Part,
  checkMatrixPart,
  checkRootsPart,
  checkStated,
  checkVectorPart,
  enTest,
  format2AnswerTex,
  statedAnswerTex
} from '../src/renderer/src/questions/answerKinds'
import { evalNumber, isReadError, readMatrixCell, readSet, readStated, readVector } from '../src/renderer/src/questions/answerText'
import { checkNumberPart } from '../src/renderer/src/questions/parts'
import { parsePQFile, serializePQFile, type PQPart, type PQQuestion } from '../src/renderer/src/questions/pqjson'
import { checkPlayedPart, playQuestion } from '../src/renderer/src/questions/player'
import { stepsToWorking } from '../src/renderer/src/questions/steps'

beforeEach(() => resetGlobals())

const S: MeasureSettings = { decimals: 2, precisionMode: 'dp', unit: 'm', unitPerSquare: 1, angleUnit: 'deg' }

type VectorPart = Extract<PQPart, { type: 'vector' }>
type MatrixPart = Extract<PQPart, { type: 'matrix' }>
type RootsPart = Extract<PQPart, { type: 'roots' }>
type NumberPart = Extract<PQPart, { type: 'number' }>

const verdict = (c: Check): string => c.verdict

// ---------------------------------------------------------------------------
// Reading what was typed
// ---------------------------------------------------------------------------

describe('readVector', () => {
  const close = (r: ReturnType<typeof readVector>, v: number[], unit: string | null = null): void => {
    if (isReadError(r)) throw new Error(r.error)
    expect(r.v.length).toBe(v.length)
    r.v.forEach((c, i) => expect(c).toBeCloseTo(v[i], 9))
    expect(r.unit).toBe(unit)
  }

  it('reads i j k, brackets and size-and-angle forms', () => {
    close(readVector('3i + 4j'), [3, 4])
    close(readVector('3i + 4j + 2k'), [3, 4, 2])
    close(readVector('4j − 3i'), [-3, 4])
    close(readVector('i - j'), [1, -1])
    close(readVector('(3/2)i + 2.5j'), [1.5, 2.5])
    close(readVector('3î + 4ĵ'), [3, 4])
    close(readVector('<3, 4>'), [3, 4])
    close(readVector('⟨3, 4, 5⟩'), [3, 4, 5])
    close(readVector('(3, 4)'), [3, 4])
    close(readVector('(sqrt(2), -1)'), [Math.SQRT2, -1])
    close(readVector('5∠53.13°'), [5 * Math.cos((53.13 * Math.PI) / 180), 5 * Math.sin((53.13 * Math.PI) / 180)])
    close(readVector('5 at 53.13°'), [5 * Math.cos((53.13 * Math.PI) / 180), 5 * Math.sin((53.13 * Math.PI) / 180)])
    close(readVector('2∠90'), [0, 2])
    close(readVector('1∠3.14159265358979 rad'), [-1, 0])
  })

  it('takes a unit after the vector, and never reads its k as one', () => {
    close(readVector('3i + 4j N'), [3, 4], 'N')
    close(readVector('<3, 4> m/s'), [3, 4], 'm/s')
    close(readVector('10 N ∠ 30°'), [10 * Math.cos(Math.PI / 6), 5], 'N')
    close(readVector('10∠30° N'), [10 * Math.cos(Math.PI / 6), 5], 'N')
    close(readVector('3i + 4j + 2k kg·m/s'), [3, 4, 2], 'kg·m/s')
    close(readVector('2k'), [0, 0, 2])
  })

  it('says what it could not read in one sentence', () => {
    for (const bad of ['', 'hello', '3i + 4q', '<3, x>', '<1, 2, 3, 4>', '5∠north']) {
      const r = readVector(bad)
      expect(isReadError(r), bad).toBe(true)
      if (isReadError(r)) expect(r.error).toMatch(/^[A-Z].*\.$/)
    }
  })
})

describe('readSet', () => {
  it('reads commas, semicolons, "or", "x =" and ±', () => {
    expect(readSet('2, -3')).toEqual([2, -3])
    expect(readSet('x = −3 or x = 2')).toEqual([-3, 2])
    expect(readSet('−3; 2')).toEqual([-3, 2])
    expect(readSet('2 and −3')).toEqual([2, -3])
    expect(readSet('{2, -3}')).toEqual([2, -3])
    expect(readSet('x = ±2')).toEqual([2, -2])
    expect(readSet('sqrt(2), -sqrt(2)')).toEqual([Math.SQRT2, -Math.SQRT2])
    expect(readSet('none')).toEqual([])
    expect(readSet('no real roots')).toEqual([])
  })

  it('converts a unit after a value to the part unit, and refuses another kind of unit', () => {
    expect(readSet('1.5 s, 2000 ms', 's')).toEqual([1.5, 2])
    const r = readSet('2 kg, 3 s', 's')
    expect(isReadError(r) && r.error).toBe('"2 kg" is not in a unit this answer can be given in.')
  })

  it('refuses a value it cannot read, quoting it', () => {
    const r = readSet('2, banana')
    expect(isReadError(r) && r.error).toBe('PhysLab could not read "banana" as a number. Type the values with commas between them, like 2, −3.')
    expect(isReadError(readSet(''))).toBe(true)
  })
})

describe('readMatrixCell', () => {
  it('reads numbers, and fractions only when they are allowed', () => {
    expect(readMatrixCell('0.6', false)).toBe(0.6)
    expect(readMatrixCell('−0.2', false)).toBe(-0.2)
    expect(readMatrixCell('1.5e-3', false)).toBe(0.0015)
    expect(readMatrixCell('3/5', true)).toBe(0.6)
    expect(readMatrixCell('-1/5', true)).toBe(-0.2)
    expect(readMatrixCell('3/5', false)).toBeNull()
    expect(readMatrixCell('1/0', true)).toBeNull()
    expect(readMatrixCell('sqrt(2)', true)).toBeNull()
    expect(readMatrixCell('', true)).toBeNull()
  })
})

describe('readStated', () => {
  it('reads ±, +-, +/- and the concise bracket form', () => {
    expect(readStated('0.5591 ± 0.0001')).toEqual({ x: 0.5591, u: 0.0001, unit: null })
    expect(readStated('0.5591 +- 0.0001')).toEqual({ x: 0.5591, u: 0.0001, unit: null })
    expect(readStated('0.5591 +/- 0.0001')).toEqual({ x: 0.5591, u: 0.0001, unit: null })
    const c = readStated('0.5591(1)')
    if (isReadError(c)) throw new Error(c.error)
    expect(c.x).toBe(0.5591)
    expect(c.u).toBeCloseTo(0.0001, 15)
    const d = readStated('1.23(45)')
    if (isReadError(d)) throw new Error(d.error)
    expect(d.u).toBeCloseTo(0.45, 15)
    const e = readStated('12.3(1.2)')
    if (isReadError(e)) throw new Error(e.error)
    expect(e.u).toBeCloseTo(1.2, 15)
    expect(readStated('(9.81 ± 0.02) m/s²')).toEqual({ x: 9.81, u: 0.02, unit: 'm/s²' })
  })

  it('asks for the uncertainty in the student own digits when there is none', () => {
    expect(readStated('0.5591')).toEqual({ error: 'Give your uncertainty too, like 0.5591 ± 0.0001.' })
    expect(readStated('12')).toEqual({ error: 'Give your uncertainty too, like 12 ± 1.' })
    expect(readStated('0.5 ± -0.1')).toEqual({ error: 'An uncertainty is never negative: the ± already gives both sides.' })
  })
})

describe('evalNumber', () => {
  it('gives a real number only — never a complex number or a quantity', () => {
    expect(evalNumber('5*sqrt(2)')).toBeCloseTo(7.0711, 4)
    expect(evalNumber('sin(30)')).toBeCloseTo(0.5, 12)
    expect(evalNumber('3i')).toBeNull()
    expect(evalNumber('2 m')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Vectors: F = 10∠30° N
// ---------------------------------------------------------------------------

describe('checkVectorPart — F = 10∠30°', () => {
  const F: VectorPart = {
    type: 'vector',
    prompt: 'Write F in components.',
    answer: ['F*cos(theta)', 'F*sin(theta)'],
    unit: 'N',
    tolerance: { kind: 'relative', value: 0.02 },
    marks: 2
  }
  const values = { F: 10, theta: 30 }
  const mark = (text: string): Check => checkVectorPart(text, F, values, S)

  it('marks 8.66i + 5j, <8.66, 5> and 10∠30° right at 2 %', () => {
    expect(verdict(mark('8.66i + 5j'))).toBe('right')
    expect(verdict(mark('<8.66, 5>'))).toBe('right')
    expect(verdict(mark('10∠30°'))).toBe('right')
    expect(verdict(mark('8.66i + 5j N'))).toBe('right')
    expect(verdict(mark('10 N at 30°'))).toBe('right')
  })

  it('names the swapped components', () => {
    const c = mark('5i + 8.66j')
    expect(c.verdict).toBe('wrong')
    expect(c.message).toBe('The right numbers, but the components are swapped round: the first number goes with i, the second with j.')
  })

  it('names the one sign that is wrong', () => {
    const c = mark('−8.66i + 5j')
    expect(c.verdict).toBe('wrong')
    expect(c.message).toBe('Right size, but the i component has the wrong sign. Check which way it points.')
    expect(mark('8.66i − 5j').message).toBe('Right size, but the j component has the wrong sign. Check which way it points.')
  })

  it('names a reversed vector, the right size the wrong way, and the right way the wrong size', () => {
    expect(mark('−8.66i − 5j').message).toMatch(/^Right size, but pointing the opposite way\./)
    expect(mark('10∠75°').message).toBe('Right size, wrong direction.')
    expect(mark('20∠30°').message).toBe('Right direction, wrong size.')
    expect(mark('3i + 4j').message).toBe('Not quite. Press Hint to see the next step.')
  })

  it('refuses a unit of another kind in words, and wants no unit where the answer has none', () => {
    expect(mark('8.66i + 5j kg').message).toBe('That is in kilograms; this box wants newtons.')
    const bare: VectorPart = { ...F, unit: 'none' }
    expect(checkVectorPart('<8.66, 5> N', bare, values, S)).toEqual({ verdict: 'unreadable', message: 'This box wants just the numbers, with no unit.' })
  })

  it('treats a missing zero k as the same vector, and a missing non-zero k as wrong', () => {
    const three: VectorPart = { ...F, answer: ['3', '4', '0'] }
    expect(verdict(checkVectorPart('3i + 4j', three, {}, S))).toBe('right')
    expect(verdict(checkVectorPart('3i + 4j + 0k', { ...F, answer: ['3', '4'] }, {}, S))).toBe('right')
    const up: VectorPart = { ...F, answer: ['3', '4', '12'] }
    expect(checkVectorPart('3i + 4j', up, {}, S).message).toBe('This vector has three components, i, j and k; yours has two.')
    expect(checkVectorPart('3i + 4j + 1k', { ...F, answer: ['3', '4'] }, {}, S).message).toBe(
      'This vector has only i and j components; yours has a k component too.'
    )
  })

  it('is empty on nothing typed', () => {
    expect(mark('  ')).toEqual({ verdict: 'empty' })
  })
})

// ---------------------------------------------------------------------------
// Matrices: the inverse of [[2, 1], [1, 3]]
// ---------------------------------------------------------------------------

describe('checkMatrixPart — the inverse of [[2, 1], [1, 3]]', () => {
  // The answer is a formula in the entries, so the test also checks the formula against mathjs's own inverse.
  const inv: MatrixPart = {
    type: 'matrix',
    prompt: 'Find the inverse of A.',
    answer: [
      ['d/(a*d - b*c)', '-b/(a*d - b*c)'],
      ['-c/(a*d - b*c)', 'a/(a*d - b*c)']
    ],
    tolerance: { kind: 'absolute', value: 0.005 },
    marks: 4
  }
  const values = { a: 2, b: 1, c: 1, d: 3 }

  it('has the known inverse [[0.6, −0.2], [−0.2, 0.4]]', () => {
    const exact = math.inv([
      [2, 1],
      [1, 3]
    ]) as number[][]
    expect(exact.flat().map((x) => Number(x.toFixed(12)))).toEqual([0.6, -0.2, -0.2, 0.4])
    const right = checkMatrixPart([['0.6', '-0.2'], ['−0.2', '0.4']], inv, values, S)
    expect(right.verdict).toBe('right')
    expect(right.marks).toBe(4)
  })

  it('accepts 3/5 only when fractions are allowed', () => {
    const typed = [['3/5', '-1/5'], ['-1/5', '2/5']]
    expect(checkMatrixPart(typed, { ...inv, allowFractions: true }, values, S).verdict).toBe('right')
    const refused = checkMatrixPart(typed, inv, values, S)
    expect(refused.verdict).toBe('unreadable')
    expect(refused.message).toBe('Type each entry as a decimal: the entry in row 1, column 1 is a fraction, and this answer does not take fractions.')
  })

  it('shares the marks out entry by entry: one wrong entry of four gives 3 of 4', () => {
    const typed = [['0.6', '-0.2'], ['0.2', '0.4']]
    const perCell = checkMatrixPart(typed, { ...inv, markPerCell: true }, values, S)
    expect(perCell.verdict).toBe('wrong')
    expect(perCell.marks).toBe(3)
    expect(perCell.message).toBe('3 of the 4 entries are right.')
    expect(perCell.cells).toEqual([['right', 'right'], ['wrong', 'right']])
    // Without markPerCell it is all or nothing.
    expect(checkMatrixPart(typed, inv, values, S).marks).toBe(0)
  })

  it('says so when the size is wrong, a box is empty, or an entry cannot be read', () => {
    expect(checkMatrixPart([['0.6', '-0.2']], inv, values, S).message).toBe('This answer is a 2 × 2 matrix; yours is 1 × 2.')
    expect(checkMatrixPart([['', ''], ['', '']], inv, values, S).verdict).toBe('empty')
    expect(checkMatrixPart([['0.6', ''], ['-0.2', '0.4']], inv, values, S).message).toBe('Fill in every entry before checking.')
    expect(checkMatrixPart([['0.6', 'x'], ['-0.2', '0.4']], inv, values, S).message).toBe(
      'PhysLab could not read the entry in row 1, column 2. Type a number like 0.6 or −2.'
    )
  })
})

// ---------------------------------------------------------------------------
// Roots
// ---------------------------------------------------------------------------

describe('checkRootsPart', () => {
  // The quadratic formula in the coefficients, so the roots are worked out, not typed in.
  const quad: RootsPart = {
    type: 'roots',
    prompt: 'Solve the equation.',
    answer: ['(-b + sqrt(b^2 - 4*a*c)) / (2*a)', '(-b - sqrt(b^2 - 4*a*c)) / (2*a)'],
    unit: 'none',
    tolerance: { kind: 'relative', value: 0.02 },
    marks: 2
  }
  const sixes = { a: 1, b: 1, c: -6 } // x² + x − 6 = (x − 2)(x + 3)
  const square = { a: 1, b: -4, c: 4 } // x² − 4x + 4 = (x − 2)²

  it('marks the roots of x² + x − 6 right in any order and form', () => {
    for (const t of ['2, -3', 'x = −3 or x = 2', '−3; 2', '-3, 2', 'x = 2, x = -3']) {
      expect(verdict(checkRootsPart(t, quad, sixes, S)), t).toBe('right')
    }
  })

  it('counts a partial answer: "2" has 1 of the 2 roots', () => {
    expect(checkRootsPart('2', quad, sixes, S)).toEqual({ verdict: 'wrong', message: 'You have 1 of the 2 roots.' })
    expect(checkRootsPart('2, 5', quad, sixes, S).message).toBe('You have 1 of the 2 roots, but 1 of your values is not a root.')
    expect(checkRootsPart('7, 9', quad, sixes, S).message).toBe('None of those is a root. Put each value back into the equation to check.')
    expect(checkRootsPart('-2, 3', quad, sixes, S).message).toBe('Right sizes, wrong signs. If (x − a) is a factor, the root is +a.')
  })

  it('counts the repeated root of x² − 4x + 4 once unless multiplicity is asked for', () => {
    expect(verdict(checkRootsPart('2', quad, square, S))).toBe('right')
    expect(verdict(checkRootsPart('2, 2', quad, square, S))).toBe('right')
    const counted: RootsPart = { ...quad, multiplicity: true }
    expect(verdict(checkRootsPart('2, 2', counted, square, S))).toBe('right')
    expect(checkRootsPart('2', counted, square, S).message).toBe('You have 1 of the 2 roots. A repeated root is typed once for each time it repeats.')
  })

  it('knows "no real roots"', () => {
    const none: RootsPart = { ...quad, answer: [] }
    expect(verdict(checkRootsPart('no real roots', none, {}, S))).toBe('right')
    expect(verdict(checkRootsPart('1', none, {}, S))).toBe('wrong')
    expect(checkRootsPart('none', quad, sixes, S).message).toBe('This equation does have real roots. Look again.')
  })

  it('marks an exact 0 right even when the root is worked out as a hair off 0', () => {
    const zero: RootsPart = { ...quad, answer: ['0.1 + 0.2 - 0.3', '4'] }
    expect(verdict(checkRootsPart('0, 4', zero, {}, S))).toBe('right')
  })
})

// ---------------------------------------------------------------------------
// Eₙ: the anharmonic ground state E₀ = 0.559146 at λ = 0.1
// ---------------------------------------------------------------------------

describe('Eₙ — E₀ = 0.559146 with uref = 0.000001', () => {
  const E0: NumberPart = {
    type: 'number',
    prompt: 'The ground-state energy E₀',
    answer: '0.559146',
    unit: 'none',
    tolerance: { kind: 'stated', uref: '0.000001' },
    marks: 3
  }
  const mark = (text: string): Check => checkNumberPart(text, E0, {}, S)

  it('enTest is |x − xref| ≤ √(u² + uref²)', () => {
    expect(enTest(0.55915, 0.00001, 0.559146, 0.000001).ok).toBe(true)
    expect(enTest(0.3, 0.1, 0.2, 0).ok).toBe(true) // exactly on the edge agrees
    expect(enTest(3, 3, 7, 4)).toEqual({ en: 0.8, ok: true })
    expect(enTest(0, 0, 0, 0)).toEqual({ en: 0, ok: true })
    expect(enTest(1, 0, 0, 0).ok).toBe(false)
  })

  it('marks 0.55915 ± 0.00001 right, and says its Eₙ', () => {
    const c = mark('0.55915 ± 0.00001')
    expect(c.verdict).toBe('right')
    expect(c.message).toBe('Agrees with the reference value within the two uncertainties: Eₙ = 0.4, and 1 or less agrees.')
  })

  it('marks the four perturbation-series sums 0.575, 0.549, 0.570, 0.545 (± 0.002) wrong without giving the gap away', () => {
    for (const x of ['0.575', '0.549', '0.570', '0.545']) {
      const c = mark(`${x} ± 0.002`)
      expect(c.verdict, x).toBe('wrong')
      expect(c.message).not.toMatch(/E/)
    }
  })

  it('asks for the uncertainty when there is none', () => {
    expect(mark('0.5591')).toEqual({ verdict: 'unreadable', message: 'Give your uncertainty too, like 0.5591 ± 0.0001.' })
  })

  it('refuses 0.6 ± 0.1: 16.7 % is above the 10 % it accepts', () => {
    const c = mark('0.6 ± 0.1')
    expect(c.verdict).toBe('wrong')
    expect(c.message).toBe('Your uncertainty is 16.7 % of your value; this answer accepts at most 10 %.')
    // An author may accept more — and then the same wide answer agrees, which is exactly what the cap is for.
    const loose: NumberPart = { ...E0, tolerance: { kind: 'stated', uref: '0.000001', maxRelU: 0.2 } }
    expect(checkNumberPart('0.6 ± 0.1', loose, {}, S).verdict).toBe('right')
    expect(checkNumberPart('0.7 ± 0.1', loose, {}, S).verdict).toBe('wrong')
  })

  it('reads a unit and converts both the value and the uncertainty', () => {
    const g: NumberPart = { ...E0, answer: '9.81', unit: 'm/s²', tolerance: { kind: 'stated', uref: '0.01' } }
    expect(verdict(checkStated('981 ± 2 cm/s^2', { x: 9.81, u: 0.01, unit: 'm/s²' }, S))).toBe('unreadable')
    expect(verdict(checkNumberPart('9.80 ± 0.02 m/s²', g, {}, S))).toBe('right')
    expect(checkNumberPart('9.80 ± 0.02 kg', g, {}, S).message).toBe('That is in kilograms; this box wants metres per second squared.')
  })
})

// ---------------------------------------------------------------------------
// Across the boundary: a .pqjson file, the player, the revealed answer
// ---------------------------------------------------------------------------

describe('a format-2 question played from its file', () => {
  const q: PQQuestion = {
    id: 'qe1-kinds',
    title: 'Four new kinds',
    statement: 'A force of {F} N acts at {theta}° to the x axis.',
    variables: [
      { name: 'F', def: { kind: 'list', items: [10] }, unit: 'N' },
      { name: 'theta', def: { kind: 'list', items: [30] }, unit: '°' }
    ],
    parts: [
      { type: 'vector', prompt: 'F in components', answer: ['F*cos(theta)', 'F*sin(theta)'], unit: 'N', tolerance: { kind: 'relative', value: 0.02 }, marks: 2 },
      { type: 'roots', prompt: 'Solve x² + x − 6 = 0', answer: ['2', '-3'], unit: 'none', tolerance: { kind: 'absolute', value: 0.01 }, marks: 2 },
      { type: 'matrix', prompt: 'Invert [[2, 1], [1, 3]]', answer: [['0.6', '-0.2'], ['-0.2', '0.4']], tolerance: { kind: 'absolute', value: 0.005 }, allowFractions: true, markPerCell: true, marks: 4 },
      { type: 'number', prompt: 'E₀', answer: '0.559146', unit: 'none', tolerance: { kind: 'stated', uref: '0.000001' }, marks: 3 }
    ],
    license: { id: 'CC BY 4.0', holder: 'PhysLab' },
    rung: 4
  }

  it('reads back from its own file and marks every kind through checkPlayedPart', () => {
    const file = parsePQFile(serializePQFile({ app: 'PhysLab', format: 'pqjson', version: 1, questions: [q] }))
    expect(file.version).toBe(2)
    const played = playQuestion(file.questions[0], 1, S)
    expect(played.problems).toEqual([])
    const [vec, roots, , en] = played.parts
    expect(isCorrect(checkPlayedPart(vec, '10∠30°', played, S))).toBe(true)
    expect(checkPlayedPart(vec, '5i + 8.66j', played, S).verdict).toBe('wrong')
    expect(isCorrect(checkPlayedPart(roots, 'x = −3 or x = 2', played, S))).toBe(true)
    expect(checkPlayedPart(roots, '2', played, S).message).toBe('You have 1 of the 2 roots.')
    expect(isCorrect(checkPlayedPart(en, '0.55915 ± 0.00001', played, S))).toBe(true)
    expect(checkPlayedPart(en, '0.6 ± 0.1', played, S).verdict).toBe('wrong')
  })

  it('marks a matrix from its boxes through checkFormat2Part, and refuses one typed as a line', () => {
    const m = q.parts[2] as MatrixPart
    expect(checkFormat2Part([['3/5', '-1/5'], ['-1/5', '2/5']], m, {}, S).verdict).toBe('right')
    expect(checkFormat2Part('0.6, -0.2, -0.2, 0.4', m, {}, S)).toEqual({ verdict: 'unreadable', message: 'Type each entry in its own box.' })
  })

  it('reveals every answer as LaTeX that KaTeX renders', () => {
    const played = playQuestion(q, 1, S)
    const answers = stepsToWorking(q, played.variant, S, 'worked').answers
    expect(answers.map((a) => a.tex)).toEqual([
      '\\left(8.66\\,\\mathbf{i} + 5\\,\\mathbf{j}\\right)\\,\\mathrm{N}',
      '2,\\ -3',
      '\\begin{pmatrix} 0.6 & -0.2 \\\\ -0.2 & 0.4 \\end{pmatrix}',
      // A stated part is revealed in the form it asks for, value ± uncertainty (review round 1).
      '0.5591460 \\pm 0.0000010'
    ])
    for (const a of answers) expect(() => katex.renderToString(a.tex, { throwOnError: true, strict: 'ignore' }), a.tex).not.toThrow()
    const neg = format2AnswerTex({ ...(q.parts[0] as VectorPart), answer: ['-3', '0', '4'], unit: 'none' }, {}, S)
    expect(neg).toBe('-3\\,\\mathbf{i} + 4\\,\\mathbf{k}')
    expect(format2AnswerTex({ ...(q.parts[1] as RootsPart), answer: [] }, {}, S)).toBe('\\text{no real roots}')
  })
})

// ---------------------------------------------------------------------------
// Review round 1: forms students type, and sentences that must not blame or leak
// ---------------------------------------------------------------------------

describe('review round 1', () => {
  const F: VectorPart = {
    type: 'vector',
    prompt: 'Write F in components.',
    answer: ['F*cos(theta)', 'F*sin(theta)'],
    unit: 'N',
    tolerance: { kind: 'relative', value: 0.02 },
    marks: 2
  }
  const E0: NumberPart = {
    type: 'number',
    prompt: 'The ground-state energy E₀',
    answer: '0.559146',
    unit: 'none',
    tolerance: { kind: 'stated', uref: '0.000001' },
    marks: 3
  }

  it('reads a vector in brackets before its unit, the form the revealed answer shows', () => {
    const values = { F: 10, theta: 30 }
    for (const t of ['(8.66i + 5j) N', '(8.66i + 5j)', '(8.66 i + 5 j) N', '(3/2*0 + 8.66)i + 5j']) {
      expect(verdict(checkVectorPart(t, F, values, S)), t).toBe('right')
    }
    expect(readVector('(3i + 4j) m/s')).toEqual({ v: [3, 4], unit: 'm/s' })
    // Two bracket pairs are coefficients, not a wrapper, and still read as before.
    expect(readVector('(3/2)i + (1)j')).toEqual({ v: [1.5, 1], unit: null })
    // The revealed answer, typed back as it reads, is right.
    expect(format2AnswerTex(F, values, S)).toBe('\\left(8.66\\,\\mathbf{i} + 5\\,\\mathbf{j}\\right)\\,\\mathrm{N}')
  })

  it('reads roots typed as a ± b, the quadratic formula\'s form', () => {
    // x² + 2x − 1 = 0 has the roots −1 ± √2.
    const quad: RootsPart = {
      type: 'roots',
      prompt: 'Solve x² + 2x − 1 = 0.',
      answer: ['-1 + sqrt(2)', '-1 - sqrt(2)'],
      unit: 'none',
      tolerance: { kind: 'relative', value: 0.02 },
      marks: 2
    }
    for (const t of ['x = −1 ± √2', 'x = -1 ± sqrt(2)', '-1 +- sqrt(2)', '−1 +/- √2', '-1 ± 1.414']) {
      expect(verdict(checkRootsPart(t, quad, {}, S)), t).toBe('right')
    }
    expect(readSet('x = 3 ± 0')).toEqual([3])
    expect(readSet('x = ±2')).toEqual([2, -2])
    expect(readSet('1 ± 2 ± 3')).toHaveProperty('error')
  })

  it('says nothing worked out from the reference to "0 ± 0.1"', () => {
    const c = checkNumberPart('0 ± 0.1', E0, {}, S)
    expect(c.verdict).toBe('wrong')
    expect(c.message).toBe('Your value is 0, so your uncertainty cannot be judged against it. Check your value.')
    expect(c.message).not.toMatch(/\d*[1-9]/)
  })

  it('cannot mark a stated part whose reference or uncertainty is not a real number, instead of blaming the student', () => {
    const cannot = 'PhysLab could not work out the answer to this part, so it cannot mark it.'
    expect(checkNumberPart('0.5 ± 0.01', { ...E0, answer: 'sqrt(-1)' }, {}, S)).toEqual({ verdict: 'wrong', message: cannot })
    expect(checkNumberPart('0.5 ± 0.01', { ...E0, tolerance: { kind: 'stated', uref: 'sqrt(a - b)' } }, { a: 1, b: 2 }, S)).toEqual({ verdict: 'wrong', message: cannot })
  })

  it('reveals a stated part as value ± uncertainty by the one ± rule, and that text is marked right', () => {
    const q: PQQuestion = {
      id: 'e0',
      title: 'The anharmonic ground state',
      statement: 'Give E₀ with its uncertainty.',
      variables: [],
      parts: [E0],
      license: { id: 'CC BY 4.0', holder: 'PhysLab' }
    }
    const answer = stepsToWorking(q, playQuestion(q, 1, S).variant, S).answers[0].tex
    // uref 0.000001 starts with a 1, so it keeps 2 significant figures, and the value that decimal place.
    expect(answer).toBe('0.5591460 \\pm 0.0000010')
    expect(() => katex.renderToString(answer, { throwOnError: true, strict: 'ignore' })).not.toThrow()
    expect(verdict(checkNumberPart('0.5591460 ± 0.0000010', E0, {}, S))).toBe('right')
  })

  it('rounds the ± by the rule at other sizes, with the unit after it', () => {
    expect(statedAnswerTex(9.8123, 0.034, 'm/s²', S)).toMatch(/^\\left\(9\.81 \\pm 0\.03\\right\)\\,/)
    expect(statedAnswerTex(9.8123, 0.14, 'none', S)).toBe('9.81 \\pm 0.14')
    // 0.96 rounds up into the next decade, and the value follows it to the same place.
    expect(statedAnswerTex(9.8123, 0.96, 'none', S)).toBe('10 \\pm 1')
    expect(statedAnswerTex(6.62607e-34, 1.2e-37, 'none', S)).toBe('\\left(6.6261 \\pm 0.0012\\right)\\times 10^{-34}')
    expect(statedAnswerTex(NaN, 0.1, 'none', S)).toBe('\\text{?}')
    for (const t of [statedAnswerTex(9.8123, 0.034, 'm/s²', S), statedAnswerTex(6.62607e-34, 1.2e-37, 'J', S)]) {
      expect(() => katex.renderToString(t, { throwOnError: true, strict: 'ignore' }), t).not.toThrow()
    }
  })
})

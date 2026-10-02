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
import { readSource } from './helpers/repo'
import { math } from '../src/renderer/src/math/expr'
import { shownValue, type MeasureSettings } from '../src/renderer/src/math/format'
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
import { checkPlayedPart, countedParts, playQuestion } from '../src/renderer/src/questions/player'
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

// ---------------------------------------------------------------------------
// P21b: a vector, roots or matrix answer revealed so that, typed back, it marks right
// ---------------------------------------------------------------------------

// format2AnswerTex wrote every vector component, root and matrix entry at the student's own
// precision and never through revealPrecision, so the answer PhysLab revealed could be marked wrong
// typed back under it. The four Numbas matrix questions are marked exactly: at 1 s.f. an entry of
// 74 read "70", at 2 s.f. −127 read "−130". "The inverse of a 2 × 2 matrix" (±0.005) read 1/7 as
// "0" at 0 d.p. A force of 3×10⁻¹⁴ N was revealed as the zero vector: the vector branch drops every
// component fmtPrecise writes as 0, and fmtPrecise writes anything under 10⁻¹² as 0. Wanted (the
// part head's design): each number at revealPrecision(number, its half-width, s), the half-width
// being the part's STATED band for that number (absolute, or relative × |number|) with no noise
// floor, so a part marked exactly goes through revealPrecision's exact mode — the student's
// precision when it already shows the number exactly, else the fewest significant figures that do.

/** A revealed matrix, \begin{pmatrix} a & b \\ c & d \end{pmatrix}, as a student fills its boxes: each entry typed as the number it reads. */
function typedMatrix(tex: string): string[][] {
  const body = /^\\begin\{pmatrix\}(.*)\\end\{pmatrix\}$/.exec(tex.trim())?.[1] ?? ''
  return body.split('\\\\').map((row) => row.split('&').map((cell) => String(shownValue(cell.trim()))))
}

/**
 * A revealed vector or set of roots as a student types it: "12.5i - 7.25j", "(8.66i + 5j) N",
 * "2.5, -1.25". A power of ten goes in as e-notation, which the vector and the roots reader both
 * take as it is; the ×10 form the reveal shows, typed back, is P21c's (below).
 */
const typedLine = (tex: string): string =>
  tex
    .replace(/\\left\(/g, '(')
    .replace(/\\right\)/g, ')')
    .replace(/\\times\s*10\^\{(-?\d+)\}/g, 'e$1')
    .replace(/\\,\\mathbf\{([ijk])\}/g, '$1')
    .replace(/\\,\\mathrm\{([^}]*)\}/g, ' $1')
    .replace(/,\\ /g, ', ')

describe('P21b: a vector, roots or matrix answer is revealed at a precision that, typed back, marks right', () => {
  const at = (decimals: number, precisionMode: 'dp' | 'sf'): MeasureSettings => ({ ...S, decimals, precisionMode })
  /** questionReveal.test.ts's P21 precisions: a fresh install's 2 d.p., then those that round a whole or a 2-s.f. answer. */
  const PRECISIONS = [at(2, 'dp'), at(0, 'dp'), at(1, 'dp'), at(1, 'sf'), at(2, 'sf'), at(3, 'sf')]
  /** The seeds the reveal suites play (questionReveal.test.ts SEEDS). */
  const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1)
  const named = (s: MeasureSettings): string => `${s.decimals} ${s.precisionMode}`
  const EXACTLY = { kind: 'absolute', value: 0 } as const
  const TWO_PERCENT = { kind: 'relative', value: 0.02 } as const
  const F: VectorPart = { type: 'vector', prompt: 'F', answer: ['10*cos(30)', '10*sin(30)'], unit: 'N', tolerance: { ...TWO_PERCENT }, marks: 1 }
  const SQRT2: RootsPart = { type: 'roots', prompt: 'Solve x² = 2.', answer: ['sqrt(2)', '-sqrt(2)'], unit: 'none', tolerance: { ...TWO_PERCENT }, marks: 1 }
  const ROOT2_GRID: MatrixPart = { type: 'matrix', prompt: 'M', answer: [['sqrt(2)', '1'], ['0', '-sqrt(2)']], tolerance: { ...TWO_PERCENT }, marks: 1 }

  const bundle = (): PQQuestion[] => [
    ...parsePQFile(readSource('src/renderer/src/questions/bank/numbas-school-maths.pqjson')).questions,
    ...parsePQFile(readSource('src/renderer/src/questions/bank/university.pqjson')).questions
  ]
  const titled = (questions: PQQuestion[], title: string): PQQuestion => {
    const q = questions.find((x) => x.title === title)
    expect(q, `the bundled question "${title}"`).toBeDefined()
    return q!
  }

  /**
   * Every revealed answer of `q`'s matrix part — under its boxes (QuestionParts.tsx MatrixRow shows
   * PlayedPart.answerTex) and on the full solution's Answer card, both steps.ts answerFor →
   * format2AnswerTex — typed back box by box through the player's own marker, for every seed and
   * precision. Returns how many were shown and the ones not marked right.
   */
  function matrixRevealsMarkedWrong(q: PQQuestion): { shown: number; wrong: string[] } {
    const wrong: string[] = []
    let shown = 0
    for (const seed of SEEDS) {
      for (const s of PRECISIONS) {
        const played = playQuestion(q, seed, s)
        for (const p of countedParts(played)) {
          if (p.part.type !== 'matrix') continue
          for (const tex of new Set([p.answerTex, played.full.answers[p.index].tex])) {
            shown++
            const typed = typedMatrix(tex)
            const c = checkPlayedPart(p, typed, played, s)
            if (c.verdict === 'right') continue
            const entries = p.part.answer.map((row) => row.map((e) => Number(math.evaluate(e, { ...played.variant.values }))))
            wrong.push(`${q.title} seed ${seed} (answer ${JSON.stringify(entries)}) at ${named(s)}: ${tex} typed back as ${JSON.stringify(typed)} is ${c.verdict}`)
          }
        }
      }
    }
    return { shown, wrong }
  }

  it('the four Numbas matrix questions are marked exactly, and every revealed matrix — 40 variants, 2 d.p. to 3 s.f. — typed back box by box marks right', () => {
    const questions = bundle()
    const wrong: string[] = []
    for (const title of ['Matrix addition', 'Matrix subtraction', 'Matrix multiplication AB', 'Matrix multiplication BA']) {
      const q = titled(questions, title)
      expect(q.parts.map((p) => (p.type === 'matrix' ? p.tolerance : p.type)), `${title}: one matrix part, marked exactly`).toEqual([EXACTLY])
      const r = matrixRevealsMarkedWrong(q)
      expect(r.shown, title).toBeGreaterThanOrEqual(SEEDS.length * PRECISIONS.length)
      wrong.push(...r.wrong)
    }
    expect(wrong.slice(0, 8), `${wrong.length} revealed matrices marked wrong typed back`).toEqual([])
  }, 120_000)

  it('"The inverse of a 2 × 2 matrix" (±0.005) reveals every entry inside its band: each revealed matrix — 40 variants, 2 d.p. to 3 s.f. — typed back box by box marks right', () => {
    const q = titled(bundle(), 'The inverse of a 2 × 2 matrix')
    expect(q.parts.map((p) => (p.type === 'matrix' ? p.tolerance : p.type)), 'one matrix part, ±0.005').toEqual([{ kind: 'absolute', value: 0.005 }])
    const { shown, wrong } = matrixRevealsMarkedWrong(q)
    expect(shown).toBeGreaterThanOrEqual(SEEDS.length * PRECISIONS.length)
    expect(wrong.slice(0, 8), `${wrong.length} of ${shown} revealed matrices marked wrong typed back`).toEqual([])
  }, 60_000)

  it('a matrix marked exactly shows 74 as "74" at 1 s.f. (not "70", not "74.0"), −127 as "-127" at 2 s.f. (not "-130"), and an entry of 1.6×10⁻¹⁹ as itself, not "0"', () => {
    const m: MatrixPart = { type: 'matrix', prompt: 'A + B', answer: [['74', '-127'], ['12', '0']], tolerance: { ...EXACTLY }, marks: 1 }
    for (const s of [at(1, 'sf'), at(2, 'sf')]) {
      const tex = format2AnswerTex(m, {}, s)
      expect.soft(tex, named(s)).toBe('\\begin{pmatrix} 74 & -127 \\\\ 12 & 0 \\end{pmatrix}')
      expect.soft(checkMatrixPart(typedMatrix(tex), m, {}, s).verdict, `${tex} typed back at ${named(s)}`).toBe('right')
    }
    // fmtPrecise writes anything under 10⁻¹² as 0, which is right for a dragged point's noise and
    // wrong for a known entry (math/checkAnswer.ts expectedText already writes those in powers of ten).
    // The entries are all of one scale: P21d writes a number under 10⁻¹⁵ of the answer's largest as
    // 0, so a 1.6×10⁻¹⁹ beside a 2 (which the marker takes "0" for) is the zero it counts as.
    const charges: MatrixPart = { ...m, answer: [['1.6e-19', '3.2e-19']] }
    for (const s of [at(2, 'dp'), at(3, 'sf')]) {
      const tex = format2AnswerTex(charges, {}, s)
      expect.soft(typedMatrix(tex)[0]?.map(Number), `${tex} at ${named(s)}`).toEqual([1.6e-19, 3.2e-19])
    }
  })

  it('a vector shows each component at a precision that marks right: marked exactly, (12.5, −7.25) at 1 s.f. reads 12.5 and −7.25 with no trailing zeros, (0.004, 5) at 2 d.p. keeps its i part, and a 3×10⁻¹⁴ N force is not the zero vector', () => {
    const vector = (answer: string[], tolerance: VectorPart['tolerance'] = { ...EXACTLY }, unit: VectorPart['unit'] = 'none'): VectorPart => ({ type: 'vector', prompt: 'v', answer, unit, tolerance, marks: 1 })
    const v = vector(['12.5', '-7.25'])
    expect.soft(format2AnswerTex(v, {}, at(1, 'sf'))).toBe('12.5\\,\\mathbf{i} - 7.25\\,\\mathbf{j}')
    const cases: [VectorPart, MeasureSettings][] = [
      [v, at(1, 'sf')],
      [v, at(0, 'dp')],
      [v, at(2, 'sf')],
      // At 2 d.p. the i component reads 0, and the reveal left it out: "5j" for (0.004, 5).
      [vector(['0.004', '5']), at(2, 'dp')],
      // Both components are under 10⁻¹², so both were left out and the force was revealed as 0.
      [vector(['2e-14', '2.2e-14'], { ...TWO_PERCENT }, 'N'), at(2, 'dp')],
      [vector(['2e-14', '2.2e-14'], { ...TWO_PERCENT }, 'N'), at(3, 'sf')]
    ]
    for (const [part, s] of cases) {
      const tex = format2AnswerTex(part, {}, s)
      const typed = typedLine(tex)
      expect.soft(checkVectorPart(typed, part, {}, s).verdict, `(${part.answer.join(', ')}) at ${named(s)}: ${tex} typed back as "${typed}"`).toBe('right')
    }
  })

  it('roots marked exactly, 2.5 and −1.25, show "2.5, -1.25" at 1 s.f., and at 1 s.f., 0 d.p. and 2 s.f. typed back mark right', () => {
    const r: RootsPart = { type: 'roots', prompt: 'Solve.', answer: ['2.5', '-1.25'], unit: 'none', tolerance: { ...EXACTLY }, marks: 1 }
    expect.soft(format2AnswerTex(r, {}, at(1, 'sf'))).toBe('2.5,\\ -1.25')
    for (const s of [at(1, 'sf'), at(0, 'dp'), at(2, 'sf')]) {
      const tex = format2AnswerTex(r, {}, s)
      expect.soft(checkRootsPart(typedLine(tex), r, {}, s).verdict, `at ${named(s)}: ${tex} typed back as "${typedLine(tex)}"`).toBe('right')
    }
  })

  it('a stated band too narrow for the student’s rounding gets more figures as well: F = 10∠30° N at 2 % is not revealed as 9i + 5j at 0 d.p. or 1 s.f., nor the roots ±√2 at 2 % as "1, -1"', () => {
    for (const s of [at(0, 'dp'), at(1, 'sf')]) {
      const vec = format2AnswerTex(F, {}, s)
      expect.soft(checkVectorPart(typedLine(vec), F, {}, s).verdict, `F at ${named(s)}: ${vec} typed back as "${typedLine(vec)}"`).toBe('right')
      const roots = format2AnswerTex(SQRT2, {}, s)
      expect.soft(checkRootsPart(typedLine(roots), SQRT2, {}, s).verdict, `±√2 at ${named(s)}: ${roots} typed back as "${typedLine(roots)}"`).toBe('right')
    }
  })

  it('GUARD: a stated band that already holds the student’s rounding reveals at the student’s own precision, unchanged — at 2 d.p. 8.66i + 5j N, the roots 1.41 and −1.41, and [[1.41, 1], [0, −1.41]]', () => {
    const s = at(2, 'dp')
    const shown = [format2AnswerTex(F, {}, s), format2AnswerTex(SQRT2, {}, s), format2AnswerTex(ROOT2_GRID, {}, s)]
    expect(shown).toEqual([
      '\\left(8.66\\,\\mathbf{i} + 5\\,\\mathbf{j}\\right)\\,\\mathrm{N}',
      '1.41,\\ -1.41',
      '\\begin{pmatrix} 1.41 & 1 \\\\ 0 & -1.41 \\end{pmatrix}'
    ])
    expect(checkVectorPart(typedLine(shown[0]), F, {}, s).verdict).toBe('right')
    expect(checkRootsPart(typedLine(shown[1]), SQRT2, {}, s).verdict).toBe('right')
    expect(checkMatrixPart(typedMatrix(shown[2]), ROOT2_GRID, {}, s).verdict).toBe('right')
  })
})

// ---------------------------------------------------------------------------
// P21b: the noise floor under a vector, roots or matrix band
// ---------------------------------------------------------------------------

// The floor added to a vector's, a root's or a matrix entry's band was 10⁻⁹ × max(1, size): an
// absolute 10⁻⁹ for anything smaller than 1, which swamps a physics answer in SI units — a force of
// 3×10⁻¹⁴ N took "0i + 0j", a matrix of electron charges four zeros, the roots ±1.6×10⁻¹⁹ "0". The
// rule (wave head): an entry's floor is 10⁻⁹ × max(|its own value|, 10⁻⁶ × the largest |value| in
// that answer), so a zero worked out as 10⁻¹⁷ among numbers of size 1 is still a zero. The roots
// guard for #9 (2 and 10⁹: "3, 1000000000" stays wrong) is in tests/glmfixQuestions.test.ts.
describe('P21b: the noise floor of a vector, roots or matrix answer is relative to the answer’s own size, never an absolute 10⁻⁹', () => {
  const BANDS = [
    { kind: 'relative', value: 0.02 },
    { kind: 'absolute', value: 0 }
  ] as const
  const how = (t: (typeof BANDS)[number]): string => (t.kind === 'relative' ? 'at 2 %' : 'marked exactly')

  it('a force of about 3×10⁻¹⁴ N, (2×10⁻¹⁴, 2.2×10⁻¹⁴) N: "0i + 0j" is wrong at its 2 % band and marked exactly, and the force itself is right', () => {
    for (const tolerance of BANDS) {
      const F: VectorPart = { type: 'vector', prompt: 'F', answer: ['2e-14', '2.2e-14'], unit: 'N', tolerance: { ...tolerance }, marks: 1 }
      for (const zero of ['0i + 0j', '<0, 0>']) expect.soft(checkVectorPart(zero, F, {}, S).verdict, `"${zero}" ${how(tolerance)}`).toBe('wrong')
      for (const force of ['2e-14i + 2.2e-14j', '<2e-14, 2.2e-14> N']) expect.soft(checkVectorPart(force, F, {}, S).verdict, `"${force}" ${how(tolerance)}`).toBe('right')
    }
  })

  it('GUARD: a zero worked out as a hair off 0 among numbers of size 1 is still a zero — (0.1 + 0.2 − 0.3, 4) marked exactly takes "0i + 4j" and "4j"', () => {
    expect(math.evaluate('0.1 + 0.2 - 0.3'), 'the premise: the zero is worked out as 5.6×10⁻¹⁷').not.toBe(0)
    const v: VectorPart = { type: 'vector', prompt: 'v', answer: ['0.1 + 0.2 - 0.3', '4'], unit: 'none', tolerance: { kind: 'absolute', value: 0 }, marks: 1 }
    expect(checkVectorPart('0i + 4j', v, {}, S).verdict).toBe('right')
    expect(checkVectorPart('4j', v, {}, S).verdict).toBe('right')
  })

  it('the roots ±1.6×10⁻¹⁹: "0" is wrong at 2 % and marked exactly, and "1.6e-19, -1.6e-19" is right', () => {
    for (const tolerance of BANDS) {
      const r: RootsPart = { type: 'roots', prompt: 'Solve.', answer: ['1.6e-19', '-1.6e-19'], unit: 'none', tolerance: { ...tolerance }, marks: 1 }
      expect.soft(checkRootsPart('0', r, {}, S).verdict, `"0" ${how(tolerance)}`).toBe('wrong')
      expect.soft(checkRootsPart('1.6e-19, -1.6e-19', r, {}, S).verdict, `the roots ${how(tolerance)}`).toBe('right')
    }
  })

  it('GUARD: roots {0.3 − 0.1 − 0.2, 2}, the first worked out as −2.8×10⁻¹⁷: "0, 2" is right at 2 % and marked exactly', () => {
    expect(math.evaluate('0.3 - 0.1 - 0.2'), 'the premise: a hair off 0, not 0').not.toBe(0)
    for (const tolerance of BANDS) {
      const r: RootsPart = { type: 'roots', prompt: 'Solve.', answer: ['0.3 - 0.1 - 0.2', '2'], unit: 'none', tolerance: { ...tolerance }, marks: 1 }
      expect.soft(checkRootsPart('0, 2', r, {}, S).verdict, how(tolerance)).toBe('right')
    }
  })

  it('a matrix of charges, [[1.6×10⁻¹⁹, 0], [0, 1.6×10⁻¹⁹]]: four "0"s are wrong at 2 % and marked exactly (the two true zeros right), and the entries themselves are right', () => {
    for (const tolerance of BANDS) {
      const m: MatrixPart = { type: 'matrix', prompt: 'Q', answer: [['1.6e-19', '0'], ['0', '1.6e-19']], tolerance: { ...tolerance }, marks: 4 }
      const zeros = checkMatrixPart([['0', '0'], ['0', '0']], m, {}, S)
      expect.soft([zeros.verdict, zeros.cells], `four zeros ${how(tolerance)}`).toEqual(['wrong', [['wrong', 'right'], ['right', 'wrong']]])
      expect.soft(checkMatrixPart([['1.6e-19', '0'], ['0', '1.6e-19']], m, {}, S).verdict, `the entries ${how(tolerance)}`).toBe('right')
    }
  })

  it('GUARD: a zero worked out as a hair off 0 among entries of size 1 is still a zero — [[0.1 + 0.2 − 0.3, 1], [2, 3]] marked exactly takes 0', () => {
    const m: MatrixPart = { type: 'matrix', prompt: 'M', answer: [['0.1 + 0.2 - 0.3', '1'], ['2', '3']], tolerance: { kind: 'absolute', value: 0 }, marks: 1 }
    expect(checkMatrixPart([['0', '1'], ['2', '3']], m, {}, S).verdict).toBe('right')
  })
})

// ---------------------------------------------------------------------------
// P21c: a vector or matrix answer typed in the ×10 form PhysLab writes
// ---------------------------------------------------------------------------

// PhysLab writes a very large or very small number as "1.6×10^-19" in plain text (format.ts fmtSci)
// and as 1.6 × 10⁻¹⁹ in LaTeX and its labels, and a student types it back as it reads, or as a
// scientific calculator shows it. readVector refused it in i, j, k form: readIJK's term splitter cut "4×10^-3 i"
// at the exponent's minus, leaving "4×10^", because the only sign it skipped was e-notation's (1e-3).
// readMatrixCell took only a plain or e-notation number, so every ×10 entry was "could not read".
// In brackets and as a size and an angle a component went to mathjs, which reads the caret form but
// not the superscript one or "x", works 1.6*10^-19 out as 1.6000000000000002e-19, and silently
// misreads "2.5×10^+3" as 15625, "12.5×10^3" as 2500 and "1.6×10⁻¹²" as 0.0256 (math/expr.ts
// preprocess). Wanted (the wave head's grant): one shared narrow number reader, not mathjs, that
// takes every ×10 form exactly — the double Number("1.6e-19") gives — so a matrix entry still
// refuses an expression.
describe('P21c: a vector or matrix answer typed in the ×10 form the reveal writes is read, and marks right', () => {
  const at = (decimals: number, precisionMode: 'dp' | 'sf'): MeasureSettings => ({ ...S, decimals, precisionMode })
  /** A force the size of an electron's charge at the usual 2 % band, and a matrix of charges marked exactly. */
  const FORCE: VectorPart = { type: 'vector', prompt: 'F', answer: ['1.6e-19', '-2e-19'], unit: 'N', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }
  const CHARGES: MatrixPart = { type: 'matrix', prompt: 'Q', answer: [['1.6e-19', '0'], ['0', '3.2e-19']], tolerance: { kind: 'absolute', value: 0 }, marks: 1 }
  type Vector = { v: number[]; unit: string | null }

  /** An exponent in superscript digits, as LaTeX and PhysLab's labels show it: "-19" → "⁻¹⁹". */
  const superscript = (e: string): string => e.replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)])
  type Form = 'caret' | 'superscript'
  /** Each \times 10^{e} of a revealed answer as a student types it: "×10^-19" as the calculator writes it, or " × 10⁻¹⁹" as the screen shows it. */
  const timesTen = (tex: string, form: Form): string =>
    tex.replace(/\s*\\times\s*10\^\{(-?\d+)\}/g, (_: string, e: string) => (form === 'caret' ? `×10^${e}` : ` × 10${superscript(e)}`))
  /** A revealed vector as it reads: \left(1.6\times 10^{-19}\,\mathbf{i} - 2\times 10^{-19}\,\mathbf{j}\right)\,\mathrm{N} → "(1.6×10^-19 i - 2×10^-19 j) N". */
  const typedVector = (tex: string, form: Form): string =>
    timesTen(tex, form)
      .replace(/\\left\(/g, '(')
      .replace(/\\right\)/g, ')')
      .replace(/\\,\\mathbf\{([ijk])\}/g, ' $1')
      .replace(/\\,\\mathrm\{([^}]*)\}/g, ' $1')
  /** A revealed matrix box by box, each entry as it reads. */
  const typedCells = (tex: string, form: Form): string[][] => {
    const body = /^\\begin\{pmatrix\}(.*)\\end\{pmatrix\}$/.exec(tex.trim())?.[1] ?? ''
    return body.split('\\\\').map((row) => row.split('&').map((cell) => timesTen(cell.trim(), form)))
  }

  it('a matrix entry typed as the reveal writes a power of ten — 1.6×10^-19 or 1.6 × 10⁻¹⁹, with ×, x or *, either minus, a sign on the exponent — reads as exactly that number (today every one is "could not read")', () => {
    const FORMS: [string, number][] = [
      ['1.6×10^-19', 1.6e-19],
      ['1.6 × 10^-19', 1.6e-19],
      ['1.6x10^-19', 1.6e-19],
      ['1.6 x 10^-19', 1.6e-19],
      ['1.6*10^-19', 1.6e-19],
      ['1.6×10⁻¹⁹', 1.6e-19],
      ['1.6 × 10⁻¹⁹', 1.6e-19],
      // At 3 s.f. the reveal keeps the zero; a paste brings a real minus into the exponent.
      ['1.60×10^-19', 1.6e-19],
      ['1.6×10^−19', 1.6e-19],
      ['−1.6×10^-19', -1.6e-19],
      ['-1.6 × 10⁻¹⁹', -1.6e-19],
      ['-2.5×10^3', -2500],
      ['2.5×10^+3', 2500],
      ['2.5×10³', 2500],
      ['1.6×10¹⁹', 1.6e19],
      ['3×10^8', 3e8],
      ['6.02×10^23', 6.02e23],
      // A scientific calculator's ENG mode shows 12.5×10³: the number in front need not be under 10.
      ['12.5×10^3', 12500]
    ]
    // toBe, not toBeCloseTo: working the power out is not exact, and the reader must be.
    expect(1.6 * 10 ** -19, 'the premise: 1.6 × 10⁻¹⁹ worked out is not the number 1.6e-19 names').not.toBe(1.6e-19)
    for (const [typed, value] of FORMS) expect.soft(readMatrixCell(typed, false), `"${typed}"`).toBe(value)
  })

  it('GUARD: a matrix entry still refuses an expression, a broken ×10 form and a bare power of ten — 5*sqrt(2), 2*3, 10*10, 1.6×10, ×10^3, 1.6×10^-, 1.6×10^1.5, 10^3, 10⁻³', () => {
    // "1.6×10" is a product, 16, not a power-of-ten form: refused like "2*3". A bare power of ten is
    // not a form the reveal writes (1000 is written 1×10^3) and is an expression, which a matrix
    // entry never takes.
    const REFUSED = ['5*sqrt(2)', '2*3', '10*10', '1.6×10', '×10^3', '1.6×10^-', '1.6×10^1.5', '10^3', '10⁻³', '1.6×10⁻', '1.6×10^-19 + 1', '1.6×10^-19×10^2']
    for (const typed of REFUSED) {
      expect.soft(readMatrixCell(typed, false), `"${typed}"`).toBeNull()
      expect.soft(readMatrixCell(typed, true), `"${typed}" where fractions are allowed`).toBeNull()
    }
  })

  it('a vector in i, j, k with ×10 coefficients reads, exactly: the minus or plus after "10^" is the exponent’s sign, not a new term (today "4×10^-3 i + 5 j" is refused as "4×10^")', () => {
    const IJK: [string, Vector][] = [
      ['4×10^-3 i + 5 j', { v: [0.004, 5], unit: null }],
      ['4×10^-3i + 5j', { v: [0.004, 5], unit: null }],
      ['4 x 10^-3 i + 5 j', { v: [0.004, 5], unit: null }],
      ['4*10^-3 i + 5 j', { v: [0.004, 5], unit: null }],
      ['4 × 10⁻³ i + 5 j', { v: [0.004, 5], unit: null }],
      // The revealed answer puts its unit after the brackets.
      ['(4 × 10⁻³ i − 5 j) N', { v: [0.004, -5], unit: 'N' }],
      ['(4×10^-3 i - 5 j) N', { v: [0.004, -5], unit: 'N' }],
      ['−1.6×10^-19 i + 2×10^-19 j', { v: [-1.6e-19, 2e-19], unit: null }],
      ['1.6*10^-19 i - 2*10^-19 j', { v: [1.6e-19, -2e-19], unit: null }],
      ['2.5×10^+3 i − 4x10^-3 j + 6.02 × 10²³ k', { v: [2500, -0.004, 6.02e23], unit: null }]
    ]
    for (const [typed, read] of IJK) expect.soft(readVector(typed), `"${typed}"`).toEqual(read)
  })

  it('a vector in brackets or as a size and an angle reads every ×10 form at its value (today the superscript and x forms are refused, and "<2.5×10^+3, 5>" reads (15625, 5), "<12.5×10^3, 5>" (2500, 5), "<1.6×10⁻¹², 5>" (0.0256, 5))', () => {
    const BRACKETED: [string, Vector][] = [
      ['<4×10^-3, 5>', { v: [0.004, 5], unit: null }],
      ['<4 × 10⁻³, 5>', { v: [0.004, 5], unit: null }],
      ['<4x10^-3, 5>', { v: [0.004, 5], unit: null }],
      ['(1.6 × 10⁻¹⁹, −2 × 10⁻¹⁹) N', { v: [1.6e-19, -2e-19], unit: 'N' }],
      // Exact, as a matrix entry is: mathjs works 1.6*10^-19 out as 1.6000000000000002e-19.
      ['<1.6*10^-19, 2*10^-19>', { v: [1.6e-19, 2e-19], unit: null }],
      ['<2.5×10^+3, 5>', { v: [2500, 5], unit: null }],
      ['<12.5×10^3, 5>', { v: [12500, 5], unit: null }],
      ['<1.6×10⁻¹², 5>', { v: [1.6e-12, 5], unit: null }]
    ]
    for (const [typed, read] of BRACKETED) expect.soft(readVector(typed), `"${typed}"`).toEqual(read)
    // A size and an angle goes through cos and sin, so it is held to 12 figures, relatively.
    const POLAR: [string, string | null][] = [
      ['5×10^-3∠30°', null],
      ['5x10^-3∠30°', null],
      ['5 × 10⁻³ N ∠ 30°', 'N']
    ]
    for (const [typed, unit] of POLAR) {
      const r = readVector(typed)
      if (isReadError(r)) {
        expect.soft(r, `"${typed}"`).not.toHaveProperty('error')
        continue
      }
      expect.soft(r.unit, `"${typed}": its unit`).toBe(unit)
      expect.soft(r.v[0] / (5e-3 * Math.cos(Math.PI / 6)), `"${typed}": i over 5×10⁻³ cos 30°`).toBeCloseTo(1, 12)
      expect.soft(r.v[1] / (5e-3 * Math.sin(Math.PI / 6)), `"${typed}": j over 5×10⁻³ sin 30°`).toBeCloseTo(1, 12)
    }
  })

  it('the force (1.6×10⁻¹⁹ i − 2×10⁻¹⁹ j) N at 2 % and the charges [[1.6×10⁻¹⁹, 0], [0, 3.2×10⁻¹⁹]] marked exactly, typed in the caret and the superscript ×10 form, mark right through checkFormat2Part, the marker the player uses', () => {
    const FORCES = [
      '(1.6×10^-19 i − 2×10^-19 j) N',
      '1.6×10^-19 i - 2×10^-19 j',
      '<1.6×10^-19, −2×10^-19> N',
      '(1.6 × 10⁻¹⁹ i − 2 × 10⁻¹⁹ j) N',
      '1.6×10⁻¹⁹ i − 2×10⁻¹⁹ j',
      '<1.6 × 10⁻¹⁹, −2 × 10⁻¹⁹> N'
    ]
    for (const typed of FORCES) expect.soft(checkFormat2Part(typed, FORCE, {}, S), `"${typed}"`).toEqual({ verdict: 'right' })
    const GRIDS = [
      [['1.6×10^-19', '0'], ['0', '3.2×10^-19']],
      [['1.6 × 10⁻¹⁹', '0'], ['0', '3.2 × 10⁻¹⁹']],
      [['1.6x10^-19', '0'], ['0', '3.2 x 10^-19']],
      [['1.6*10^-19', '0'], ['0', '3.2*10^-19']]
    ]
    for (const typed of GRIDS) {
      const c = checkFormat2Part(typed, CHARGES, {}, S)
      expect.soft([c.verdict, c.message], JSON.stringify(typed)).toEqual(['right', undefined])
    }
  })

  it('after the reveal fix: those two answers typed back as format2AnswerTex reveals them — each \\times 10^{-19} typed as ×10^-19 or as × 10⁻¹⁹ — at 2 d.p. and 3 s.f. read as the answer and mark right (today the reveal shows each charge as 0 and the force as the zero vector)', () => {
    for (const s of [at(2, 'dp'), at(3, 'sf')]) {
      const force = format2AnswerTex(FORCE, {}, s)
      const charges = format2AnswerTex(CHARGES, {}, s)
      for (const form of ['caret', 'superscript'] as const) {
        const typed = typedVector(force, form)
        const where = `${force} at ${s.decimals} ${s.precisionMode} typed back as "${typed}"`
        expect.soft(checkFormat2Part(typed, FORCE, {}, s), where).toEqual({ verdict: 'right' })
        // While the floor under a vector is still an absolute 10⁻⁹ (P21b), even "0i + 0j" is marked
        // right here, so the force read back must also lie inside its own 2 % band.
        const r = readVector(typed)
        const inside = !isReadError(r) && Math.hypot(r.v[0] - 1.6e-19, r.v[1] + 2e-19) <= 0.02 * Math.hypot(1.6e-19, 2e-19)
        expect.soft(inside ? 'inside its 2 % band' : r, `${where}, read back`).toBe('inside its 2 % band')
        const cells = typedCells(charges, form)
        const grid = `${charges} at ${s.decimals} ${s.precisionMode} typed back as ${JSON.stringify(cells)}`
        expect.soft(cells.map((row) => row.map((t) => readMatrixCell(t, false))), grid).toEqual([[1.6e-19, 0], [0, 3.2e-19]])
        expect.soft(checkFormat2Part(cells, CHARGES, {}, s).verdict, grid).toBe('right')
      }
    }
  })

  it('GUARD: e-notation and plain numbers read as before in both readers — 1.6e-19, 1.6E-19, −0.2, .5, 1.5e+3 — and a fraction in a matrix entry still follows allowFractions', () => {
    const CELLS: [string, number][] = [
      ['1.6e-19', 1.6e-19],
      ['1.6E-19', 1.6e-19],
      ['-2.5e3', -2500],
      ['1.5e+3', 1500],
      ['−0.2', -0.2],
      ['0.6', 0.6],
      ['.5', 0.5],
      ['7', 7]
    ]
    for (const [typed, value] of CELLS) {
      expect(readMatrixCell(typed, false), `"${typed}"`).toBe(value)
      expect(readMatrixCell(typed, true), `"${typed}" where fractions are allowed`).toBe(value)
    }
    expect(readMatrixCell('3/5', true)).toBe(0.6)
    expect(readMatrixCell('−1/5', true)).toBe(-0.2)
    expect(readMatrixCell('3/5', false)).toBeNull()
    expect(readMatrixCell('1/0', true)).toBeNull()
    expect(readVector('4e-3 i + 5 j')).toEqual({ v: [0.004, 5], unit: null })
    expect(readVector('1.6e-19i - 2e-19j')).toEqual({ v: [1.6e-19, -2e-19], unit: null })
    expect(readVector('1e-3i + 2e+3j')).toEqual({ v: [0.001, 2000], unit: null })
    expect(readVector('(1.6e-19 i - 2e-19 j) N')).toEqual({ v: [1.6e-19, -2e-19], unit: 'N' })
    expect(readVector('<1.6e-19, -2e-19> N')).toEqual({ v: [1.6e-19, -2e-19], unit: 'N' })
    expect(readVector('8.66i - 5j')).toEqual({ v: [8.66, -5], unit: null })
    expect(readVector('<0.004, 5>')).toEqual({ v: [0.004, 5], unit: null })
    expect(checkFormat2Part('1.6e-19 i - 2e-19 j', FORCE, {}, S).verdict).toBe('right')
    expect(checkFormat2Part([['1.6e-19', '0'], ['0', '3.2e-19']], CHARGES, {}, S).verdict).toBe('right')
  })
})

// ---------------------------------------------------------------------------
// P21d: binary noise beside the answer's largest value, as the reveal writes it
// ---------------------------------------------------------------------------

// The vector branch of format2AnswerTex leaves out a component that is binary noise beside the
// vector's size (|c| ≤ noiseFloor(0, size), format.ts), so cos 90° worked out as 6×10⁻¹⁷ is no
// "6.12×10⁻¹⁷ i". A matrix entry and a root had no such rule: a matrix marked exactly whose entries
// work out to 0.3 − 0.1 − 0.2 = −2.8×10⁻¹⁷ and 0.1 + 0.2 − 0.3 = 5.6×10⁻¹⁷ was revealed as
// "-2.77555756156289×10⁻¹⁷" in the box, and a root 0.1 + 0.2 − 0.3 beside 2 likewise, although the
// marker takes "0" for both. Wanted (the wave head): the same rule in all three — a number within
// noiseFloor(0, the largest |value| in that answer) of 0 is written 0. The marker's floor for an
// entry is never smaller than that (noiseFloor(x, largest) ≥ noiseFloor(0, largest)), so the "0"
// the reveal shows always marks right typed back.
describe('P21d: binary noise beside the answer’s largest value is revealed as 0', () => {
  const at = (decimals: number, precisionMode: 'dp' | 'sf'): MeasureSettings => ({ ...S, decimals, precisionMode })
  /** A fresh install's 2 d.p., then the precisions that round a whole answer or a 2-s.f. one. */
  const PRECISIONS = [at(2, 'dp'), at(0, 'dp'), at(1, 'sf'), at(3, 'sf')]
  const named = (s: MeasureSettings): string => `${s.decimals} ${s.precisionMode}`
  const BANDS = [
    { kind: 'absolute', value: 0 },
    { kind: 'relative', value: 0.02 }
  ] as const
  type Band = (typeof BANDS)[number]
  const how = (t: Band): string => (t.kind === 'relative' ? 'at 2 %' : 'marked exactly')
  const matrix = (answer: string[][], t: Band): MatrixPart => ({ type: 'matrix', prompt: 'M', answer, tolerance: { ...t }, marks: 1 })
  const roots = (answer: string[], t: Band): RootsPart => ({ type: 'roots', prompt: 'Solve.', answer, unit: 'none', tolerance: { ...t }, marks: 1 })
  const NOISE = ['0.3 - 0.1 - 0.2', '0.1 + 0.2 - 0.3']

  it('the premise: both noise formulas work out a hair off 0, not 0', () => {
    for (const e of NOISE) expect(math.evaluate(e), e).not.toBe(0)
  })

  it('a matrix [[0.3 − 0.1 − 0.2, 1], [−1, 0.1 + 0.2 − 0.3]] reveals both noise entries as 0 and the others as 1 and −1, marked exactly or at 2 %, at every precision (today "-2.77555756156289×10^{-17}" and "5.55111512312578×10^{-17}")', () => {
    for (const band of BANDS) {
      const m = matrix([[NOISE[0], '1'], ['-1', NOISE[1]]], band)
      // The true zeros: the noise is written exactly as the zero it stands for, at 3 s.f. beside "1.00" too.
      const zeros = matrix([['0', '1'], ['-1', '0']], band)
      for (const s of PRECISIONS) {
        expect.soft(format2AnswerTex(m, {}, s), `${how(band)} at ${named(s)}`).toBe(format2AnswerTex(zeros, {}, s))
      }
      for (const s of [at(2, 'dp'), at(0, 'dp'), at(1, 'sf')]) {
        expect.soft(format2AnswerTex(m, {}, s), `${how(band)} at ${named(s)}`).toBe('\\begin{pmatrix} 0 & 1 \\\\ -1 & 0 \\end{pmatrix}')
      }
    }
  })

  it('roots 0.1 + 0.2 − 0.3 and 2 reveal as "0, 2", and so do 0.3 − 0.1 − 0.2 and 2, whichever is listed first (today "5.55111512312578×10^{-17}" for the first)', () => {
    for (const band of BANDS) {
      for (const noise of NOISE) {
        for (const s of PRECISIONS) {
          // The true zero: the noise root is written exactly as the zero it stands for ("2.00" at 3 s.f.).
          expect.soft(format2AnswerTex(roots([noise, '2'], band), {}, s), `${noise} and 2 ${how(band)} at ${named(s)}`).toBe(format2AnswerTex(roots(['0', '2'], band), {}, s))
          expect.soft(format2AnswerTex(roots(['2', noise], band), {}, s), `2 and ${noise} ${how(band)} at ${named(s)}`).toBe(format2AnswerTex(roots(['2', '0'], band), {}, s))
        }
        for (const s of [at(2, 'dp'), at(0, 'dp'), at(1, 'sf')]) {
          expect.soft(format2AnswerTex(roots([noise, '2'], band), {}, s), `${noise} and 2 ${how(band)} at ${named(s)}`).toBe('0,\\ 2')
          expect.soft(format2AnswerTex(roots(['2', noise], band), {}, s), `2 and ${noise} ${how(band)} at ${named(s)}`).toBe('2,\\ 0')
        }
      }
    }
  })

  it('typed back, the revealed matrix and roots still mark right — "0" for each noise entry and noise root', () => {
    for (const band of BANDS) {
      const m = matrix([[NOISE[0], '1'], ['-1', NOISE[1]]], band)
      const r = roots([NOISE[1], '2'], band)
      for (const s of PRECISIONS) {
        const grid = format2AnswerTex(m, {}, s)
        const cells = typedMatrix(grid)
        expect.soft(cells, `${grid} ${how(band)} at ${named(s)}, box by box`).toEqual([['0', '1'], ['-1', '0']])
        expect.soft(checkMatrixPart(cells, m, {}, s).verdict, `${grid} ${how(band)} at ${named(s)} typed back`).toBe('right')
        const set = format2AnswerTex(r, {}, s)
        expect.soft(checkRootsPart(typedLine(set), r, {}, s).verdict, `${set} ${how(band)} at ${named(s)} typed back as "${typedLine(set)}"`).toBe('right')
      }
    }
  })

  it('GUARD: a genuine tiny number is still shown as itself — entries and roots all about 10⁻¹⁹, and 10⁻¹² beside 1', () => {
    for (const band of BANDS) {
      for (const s of [at(2, 'dp'), at(3, 'sf')]) {
        const where = `${how(band)} at ${named(s)}`
        // Every number is about 10⁻¹⁹, so the largest is too and its floor is about 10⁻³⁴: none of them is noise.
        const tiny = matrix([['1.6e-19', '3.2e-19'], ['-4.8e-19', '6.4e-19']], band)
        const tex = format2AnswerTex(tiny, {}, s)
        expect.soft(typedMatrix(tex).flat().map(Number), `${tex} ${where}`).toEqual([1.6e-19, 3.2e-19, -4.8e-19, 6.4e-19])
        expect.soft(checkMatrixPart(typedMatrix(tex), tiny, {}, s).verdict, `${tex} ${where} typed back`).toBe('right')
        const set = roots(['1.6e-19', '-3.2e-19'], band)
        const line = format2AnswerTex(set, {}, s)
        expect.soft(typedLine(line).split(', ').map(Number), `${line} ${where}`).toEqual([1.6e-19, -3.2e-19])
        expect.soft(checkRootsPart(typedLine(line), set, {}, s).verdict, `${line} ${where} typed back as "${typedLine(line)}"`).toBe('right')
        // 10⁻¹² beside 1 is above the floor (10⁻¹⁵): a real small entry, which "0" would not mark right.
        const small = matrix([['1e-12', '1']], band)
        const smallTex = format2AnswerTex(small, {}, s)
        expect.soft(typedMatrix(smallTex)[0].map(Number), `${smallTex} ${where}`).toEqual([1e-12, 1])
        expect.soft(checkMatrixPart([['0', '1']], small, {}, s).verdict, `"0" for 10⁻¹² beside 1 ${where}`).toBe('wrong')
      }
    }
  })

  it('the rule is relative to the answer, at any scale: 10⁻¹⁹ × (0.1 + 0.2 − 0.3), 5.6×10⁻³⁶, beside entries of about 10⁻¹⁹ is revealed as 0, and the 10⁻¹⁹ entries as themselves', () => {
    for (const band of BANDS) {
      for (const s of [at(2, 'dp'), at(3, 'sf')]) {
        const mixed = matrix([['1.6e-19', `1e-19 * (${NOISE[1]})`], ['-4.8e-19', '6.4e-19']], band)
        const tex = format2AnswerTex(mixed, {}, s)
        expect.soft(typedMatrix(tex).flat().map(Number), `${tex} ${how(band)} at ${named(s)}`).toEqual([1.6e-19, 0, -4.8e-19, 6.4e-19])
        expect.soft(checkMatrixPart(typedMatrix(tex), mixed, {}, s).verdict, `${tex} ${how(band)} at ${named(s)} typed back`).toBe('right')
      }
    }
  })

  it('a number under 10⁻¹⁵ of the answer’s largest is a zero whatever made it: 1.6×10⁻¹⁹ beside a 2 — which the marker already takes "0" for — is revealed as 0, and "0" typed back marks right', () => {
    for (const band of BANDS) {
      const m = matrix([['1.6e-19', '2']], band)
      const tex = format2AnswerTex(m, {}, S)
      expect.soft(typedMatrix(tex), `${tex} ${how(band)}`).toEqual([['0', '2']])
      expect.soft(checkMatrixPart([['0', '2']], m, {}, S).verdict, `"0" for 1.6×10⁻¹⁹ beside 2 ${how(band)}`).toBe('right')
    }
  })

  it('GUARD: the vector branch is as before — (0.1 + 0.2 − 0.3, 4) reveals as "4j", the noise component left out', () => {
    const v: VectorPart = { type: 'vector', prompt: 'v', answer: [NOISE[1], '4'], unit: 'none', tolerance: { kind: 'absolute', value: 0 }, marks: 1 }
    expect(format2AnswerTex(v, {}, S)).toBe('4\\,\\mathbf{j}')
  })
})

// ---------------------------------------------------------------------------
// M3: a root or a matrix entry that is not a real number is revealed as "?"
// ---------------------------------------------------------------------------

// The vector branch of format2AnswerTex returns \text{?} for a component with no real value (an
// author's sqrt of a negative, 1/0); the roots and matrix branches did not, so the reveal told the
// student the answer was "undefined" or "∞" — an author's mistake read as a result.
describe('M3: a root or a matrix entry with no real value is revealed as ?, as a vector component is', () => {
  const NO_VALUE = { kind: 'absolute', value: 0.01 } as const
  const roots = (answer: string[]): RootsPart => ({ type: 'roots', prompt: 'Solve.', answer, unit: 'none', tolerance: { ...NO_VALUE }, marks: 1 })
  const matrix = (answer: string[][]): MatrixPart => ({ type: 'matrix', prompt: 'M', answer, tolerance: { ...NO_VALUE }, marks: 1 })
  const vector = (answer: string[]): VectorPart => ({ type: 'vector', prompt: 'v', answer, unit: 'none', tolerance: { ...NO_VALUE }, marks: 1 })

  it('a set of roots with an ∞, a −∞ or a not-a-number in it is "?": 1/0; sqrt(-1) and 2; 1 and log(-1); 2 and −1/0 (today ∞, undefined, undefined, −∞)', () => {
    for (const answer of [['1/0'], ['sqrt(-1)', '2'], ['1', 'log(-1)'], ['2', '-1/0']]) {
      expect.soft(format2AnswerTex(roots(answer), {}, S), answer.join(', ')).toBe('\\text{?}')
    }
  })

  it('a matrix with an ∞, a −∞ or a not-a-number in an entry is "?": [[1, 1/0]], [[sqrt(-1)]], [[1, 2], [log(-1), 4]] and [[2, −1/0]] (today ∞, undefined, undefined, −∞)', () => {
    for (const answer of [[['1', '1/0']], [['sqrt(-1)']], [['1', '2'], ['log(-1)', '4']], [['2', '-1/0']]]) {
      expect.soft(format2AnswerTex(matrix(answer), {}, S), JSON.stringify(answer)).toBe('\\text{?}')
    }
  })

  it('GUARD: a vector component with no real value is still "?"', () => {
    for (const answer of [['1/0', '2'], ['sqrt(-1)', '2'], ['1', 'log(-1)']]) {
      expect.soft(format2AnswerTex(vector(answer), {}, S), answer.join(', ')).toBe('\\text{?}')
    }
  })

  it('GUARD: a finite answer is revealed as before — roots 2 and −3, the matrix [[0.6, −0.2], [−0.2, 0.4]], and no real roots', () => {
    expect(format2AnswerTex(roots(['2', '-3']), {}, S)).toBe('2,\\ -3')
    expect(format2AnswerTex(matrix([['0.6', '-0.2'], ['-0.2', '0.4']]), {}, S)).toBe('\\begin{pmatrix} 0.6 & -0.2 \\\\ -0.2 & 0.4 \\end{pmatrix}')
    expect(format2AnswerTex(roots([]), {}, S)).toBe('\\text{no real roots}')
  })

  it('the question variables are used before the check: roots 1/(a − b) show "?" at a = b and 1 at a = 3, b = 2', () => {
    expect(format2AnswerTex(roots(['1/(a - b)']), { a: 2, b: 2 }, S)).toBe('\\text{?}')
    expect(format2AnswerTex(roots(['1/(a - b)']), { a: 3, b: 2 }, S)).toBe('1')
  })
})

// ---------------------------------------------------------------------------
// M4: a stated (Eₙ) answer revealed with a shared power of ten, typed back
// ---------------------------------------------------------------------------

// statedAnswerTex writes a very large or very small value with one power of ten shared by the value
// and its uncertainty: \left(6.6261 \pm 0.0012\right)\times 10^{-34}. readStated split what was
// typed at the ± and read each half alone, so "(6.6261 ± 0.0012)×10^-34" was refused as 'could not
// read the value "(6.6261"' — the app's own reveal was a sentence it could not read. Wanted: the
// ×10 form in both of its spellings (caret, superscript), with × · ⋅ x or * as the sign, read
// exactly (the doubles Number("6.6261e-34") and Number("0.0012e-34") name — the power is put on
// each half as e-notation, never multiplied in).
describe('M4: a stated answer with a shared power of ten, (x ± u)×10^n, is read when typed back', () => {
  type Read = { x: number; u: number; unit: string | null }
  const PLANCK: Read = { x: 6.6261e-34, u: 1.2e-37, unit: null }

  it('reads every spelling of the ×10 and the ± — caret or superscript, × · ⋅ x or *, spaces or none, ± or +-, a bracketed or minus-sign exponent — as exactly 6.6261e-34 ± 1.2e-37', () => {
    const SPELLINGS = [
      '(6.6261 ± 0.0012)×10^-34',
      '(6.6261 ± 0.0012) × 10^-34',
      '(6.6261 ± 0.0012) × 10⁻³⁴',
      '(6.6261 ± 0.0012)×10⁻³⁴',
      '(6.6261±0.0012)*10^-34',
      '(6.6261 ± 0.0012) * 10^-34',
      '(6.6261 +- 0.0012) x 10^-34',
      '(6.6261 +/- 0.0012)x10^-34',
      '(6.6261 ± 0.0012)·10^-34',
      '(6.6261 ± 0.0012)⋅10^-34',
      '(6.6261 ± 0.0012)×10^(-34)',
      '(6.6261 ± 0.0012)×10^−34',
      '( 6.6261 ± 0.0012 ) × 10 ^ -34'
    ]
    for (const typed of SPELLINGS) expect.soft(readStated(typed), `"${typed}"`).toEqual(PLANCK)
  })

  it('reads a positive power, a plus sign on it, a unit after it, and a value with no decimal point', () => {
    const CASES: [string, Read][] = [
      ['(1.5 ± 0.2)×10^3 kg', { x: 1500, u: 200, unit: 'kg' }],
      ['(2.99792 ± 0.00003) × 10⁸ m/s', { x: 2.99792e8, u: 3000, unit: 'm/s' }],
      ['(2.99792 ± 0.00003)×10^+8', { x: 2.99792e8, u: 3000, unit: null }],
      ['(6.6261 ± 0.0012)×10^-34 J', { ...PLANCK, unit: 'J' }],
      ['(15 ± 2)×10^5', { x: 1.5e6, u: 2e5, unit: null }],
      ['(1.5 ± 0.2)×10⁵', { x: 1.5e5, u: 2e4, unit: null }]
    ]
    for (const [typed, want] of CASES) expect.soft(readStated(typed), `"${typed}"`).toEqual(want)
  })

  it('says why in a sentence when the bracket is not a value and an uncertainty: two ±, a negative uncertainty, an expression', () => {
    expect(readStated('(6.6261 ± 0.0012 ± 3)×10^-34')).toEqual({ error: 'Type one ± between your value and its uncertainty.' })
    expect(readStated('(6.6261 ± -0.0012)×10^-34')).toEqual({ error: 'An uncertainty is never negative: the ± already gives both sides.' })
    for (const typed of ['(sqrt(2) ± 0.1)×10^3', '(6.6261 ± x)×10^-34']) {
      const r = readStated(typed)
      expect.soft(isReadError(r), `"${typed}" is refused`).toBe(true)
      if (isReadError(r)) expect.soft(r.error, `"${typed}"`).toMatch(/^PhysLab could not read the (value|uncertainty) ".+"\.$/)
    }
  })

  it('GUARD: every way to write it that was read before is read as before — no power, a power on each half, e-notation, the concise bracket, a unit in brackets', () => {
    expect(readStated('6.6261e-34 ± 1.2e-37')).toEqual(PLANCK)
    expect(readStated('6.6261×10^-34 ± 1.2×10^-37')).toEqual(PLANCK)
    expect(readStated('(6.6261×10^-34 ± 0.0012×10^-34)')).toEqual(PLANCK)
    expect(readStated('0.5591 ± 0.0001')).toEqual({ x: 0.5591, u: 0.0001, unit: null })
    expect(readStated('(9.81 ± 0.02) m/s²')).toEqual({ x: 9.81, u: 0.02, unit: 'm/s²' })
    // A bracket with a power but no ± is still a value without an uncertainty: asked for, not guessed.
    expect(readStated('(6.6261)×10^-34')).toHaveProperty('error')
  })

  /** One stated part: a measured value and the reference uncertainty it is marked against. */
  const stated = (answer: string, uref: string, unit: NumberPart['unit'], prompt: string): NumberPart => ({ type: 'number', prompt, answer, unit, tolerance: { kind: 'stated', uref }, marks: 1 })
  const PARTS: NumberPart[] = [
    stated('6.62607015e-34', '1.2e-37', 'none', 'Planck’s constant'),
    stated('6.62607015e-34', '1.2e-37', 'J', 'Planck’s constant with its unit'),
    stated('2.99792458e8', '3e3', 'm/s', 'The speed of light'),
    stated('1.602176634e-19', '3e-22', 'C', 'The charge of an electron'),
    stated('1.23e7', '4e5', 'none', 'A large count'),
    stated('0.559146', '0.000001', 'none', 'No shared power'),
    stated('9.8123', '0.034', 'm/s²', 'No shared power, with a unit')
  ]
  const SHARED = PARTS.slice(0, 5)
  const PLAIN = PARTS.slice(5)
  const q: PQQuestion = { id: 'stated-power', title: 'Stated answers', statement: 'Give each with its uncertainty.', variables: [], parts: PARTS, license: { id: 'CC BY 4.0', holder: 'PhysLab' } }

  /** A revealed answer as a student types it: \left( \right) → ( ), \pm → ± or +-, the ×10 in either spelling with any sign, a unit's \mathrm{…} as its label. */
  const typedBack = (tex: string, pm: string, times: string, form: 'caret' | 'superscript'): string => {
    const raised = (e: string): string => e.replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)])
    return tex
      .replace(/\s*\\times\s*10\^\{(-?\d+)\}/g, (_: string, e: string) => (form === 'caret' ? `${times}10^${e}` : ` ${times} 10${raised(e)}`))
      .replace(/\\left\(/g, '(')
      .replace(/\\right\)/g, ')')
      .replace(/\\pm/g, pm)
      .replace(/\^\{2\}/g, '²')
      .replace(/\\,\\mathrm\{([^}]*)\}/g, ' $1')
  }
  const revealed = (): string[] => stepsToWorking(q, playQuestion(q, 1, S).variant, S).answers.map((a) => a.tex)

  it('the premise: the first five reveals share a power of ten and the last two do not', () => {
    const tex = revealed()
    SHARED.forEach((_, i) => expect(tex[i], PARTS[i].prompt).toMatch(/\\times 10\^\{-?\d+\}/))
    PLAIN.forEach((_, i) => expect(tex[SHARED.length + i], PLAIN[i].prompt).not.toContain('\\times'))
    expect(tex[0]).toBe('\\left(6.6261 \\pm 0.0012\\right)\\times 10^{-34}')
    expect(tex[2]).toBe('\\left(2.99792 \\pm 0.00003\\right)\\times 10^{8}\\,\\mathrm{m/s}')
  })

  it('each reveal with a shared power, typed back — ×10^n or × 10ⁿ, with × x * or · for the sign, with ± or +- — is marked right by the number-part marker (today "could not read the value")', () => {
    const tex = revealed()
    for (const [i, part] of SHARED.entries()) {
      for (const form of ['caret', 'superscript'] as const) {
        for (const times of ['×', 'x', '*', '·']) {
          for (const pm of ['±', '+-']) {
            const typed = typedBack(tex[i], pm, times, form)
            const c = checkNumberPart(typed, part, {}, S)
            expect.soft([c.verdict, c.message], `${part.prompt}: ${tex[i]} typed back as "${typed}"`).toEqual(['right', expect.stringMatching(/^Agrees with the reference value/)])
          }
        }
      }
    }
  })

  it('GUARD: the reveals with no shared power, typed back, are marked right as before', () => {
    const tex = revealed()
    for (const [i, part] of PLAIN.entries()) {
      for (const pm of ['±', '+-']) {
        const typed = typedBack(tex[SHARED.length + i], pm, '×', 'caret')
        expect.soft(checkNumberPart(typed, part, {}, S).verdict, `${part.prompt}: ${tex[SHARED.length + i]} typed back as "${typed}"`).toBe('right')
      }
    }
  })

  it('a shared-power answer is still judged: the right power with a wrong value, and the right value with the power left off, are wrong', () => {
    const planck = PARTS[0]
    expect(checkNumberPart('(6.7 ± 0.0012)×10^-34', planck, {}, S).verdict).toBe('wrong')
    expect(checkNumberPart('(6.6261 ± 0.0012)×10^-33', planck, {}, S).verdict).toBe('wrong')
    expect(checkNumberPart('(6.6261 ± 0.0012)', planck, {}, S).verdict).toBe('wrong')
  })
})

// Rung 3 and rung 4 of the question engine: variable conditions ("only variants with real
// roots"), error carried forward (Numbas adaptive marking) and parts shown only when a condition
// holds. Every question here goes through the file first — an object written as .pqjson text and
// read back by parsePQFile — so what is tested is what a teacher's file actually plays.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetGlobals } from './helpers/globals'
import type { MeasureSettings } from '../src/renderer/src/math/format'
import { answerValue, markWithECF, partLetter, partShown, rederive, shownParts, type ECFCheck } from '../src/renderer/src/questions/ecf'
import { checkPlayedPart, playQuestion, type Played } from '../src/renderer/src/questions/player'
import { parsePQFile, serializePQFile, type ECF, type PQPart, type PQQuestion } from '../src/renderer/src/questions/pqjson'
import { conditionHolds, drawVariables, previewVariants } from '../src/renderer/src/questions/variables'

beforeEach(() => resetGlobals())

const S: MeasureSettings = { decimals: 2, precisionMode: 'dp', unit: 'm', unitPerSquare: 1, angleUnit: 'deg' }

/** Writes the question into a .pqjson file and reads it back, the way Practice gets it. */
function throughFile(q: PQQuestion): PQQuestion {
  const text = serializePQFile({ app: 'PhysLab', format: 'pqjson', version: 1, questions: [q] })
  return parsePQFile(text).questions[0]
}

/** ax² + bx + c with whole a, b, c from −9 to 9 (a never 0), kept only when it has real roots. */
function quadratic(when = 'b^2 - 4*a*c >= 0', maxRuns = 100): PQQuestion {
  return throughFile({
    id: 'quadratic',
    title: 'Roots of a quadratic',
    statement: 'Solve {a}x² + {b}x + {c} = 0.',
    variables: [
      { name: 'a', def: { kind: 'range', from: -9, to: 9, step: 1, exclude: [0] } },
      { name: 'b', def: { kind: 'range', from: -9, to: 9, step: 1 } },
      { name: 'c', def: { kind: 'range', from: -9, to: 9, step: 1 } }
    ],
    parts: [{ type: 'number', prompt: 'The discriminant', answer: 'b^2 - 4*a*c', unit: 'none', tolerance: { kind: 'absolute', value: 0 }, marks: 1 }],
    condition: { when, maxRuns },
    license: { id: 'CC BY 4.0', holder: 'PhysLab' }
  })
}

describe('variable conditions: only the variants the author wants', () => {
  it('b² − 4ac ≥ 0 holds for every one of 10 000 seeds, and each seed always gives the same variant', () => {
    const q = quadratic()
    let retried = 0
    for (let seed = 1; seed <= 10_000; seed++) {
      const v = drawVariables(q, seed)
      const { a, b, c } = v.values
      expect(v.problems).toEqual([])
      expect(b * b - 4 * a * c).toBeGreaterThanOrEqual(0)
      expect(v.seed).toBe(seed)
      // Without the condition this seed would have drawn something else about half the time.
      const raw = drawVariables({ ...q, condition: undefined }, seed).values
      if (raw.b ** 2 - 4 * raw.a * raw.c < 0) retried++
      if (seed % 50 === 0) expect(drawVariables(q, seed)).toEqual(v)
    }
    // The condition really did turn variants away — this test is not passing on luck.
    expect(retried).toBeGreaterThan(1000)
  })

  it('a condition no variant can meet says so in one sentence after its 100 tries, and keeps the first draw', () => {
    const q = quadratic('a > 10')
    const v = drawVariables(q, 7)
    expect(v.problems).toEqual(['No variant met the condition a > 10 in 100 tries; widen the ranges or loosen the condition.'])
    expect(v.values).toEqual(drawVariables({ ...q, condition: undefined }, 7).values)
  })

  it('the sentence writes the condition as a student would, and counts the author’s own number of tries', () => {
    const v = drawVariables(quadratic('b^2 - 4*a*c < -1000', 5), 1)
    expect(v.problems).toEqual(['No variant met the condition b² − 4a × c < −1000 in 5 tries; widen the ranges or loosen the condition.'])
  })

  it('a condition PhysLab cannot read is named at once, not after a hundred draws blaming the ranges', () => {
    const v = drawVariables(quadratic('b^2 - 4*a*q >= 0'), 1)
    expect(v.problems).toEqual(['PhysLab could not read the condition b² − 4a × q ≥ 0, so it cannot choose the variants that meet it.'])
  })

  it('a misspelt function (sqr for sqrt) is unreadable, named at once, never a hundred false draws', () => {
    expect(conditionHolds('sqr(b) > 2', { b: 9 })).toBeNull()
    expect(conditionHolds('sqr(b) > 2', { b: 1 })).toBeNull()
    // A variable written as if it were a function, b(a + 1) for b × (a + 1), is no function either.
    expect(conditionHolds('b(a + 1) > 2', { a: 1, b: 3 })).toBeNull()
    // Known functions still read: ln, abs and tan are PhysLab's own.
    expect(conditionHolds('ln(b) > 1 and abs(b) < 10', { b: 9 })).toBe(true)
    const v = drawVariables(quadratic('sqr(b) > 2'), 1)
    expect(v.problems).toEqual(['PhysLab could not read the condition sqr(b) > 2, so it cannot choose the variants that meet it.'])
    expect(v.values).toEqual(drawVariables({ ...quadratic(), condition: undefined }, 1).values)
    // The preview calls it unreadable on every row instead of leaving each row out.
    const rows = previewVariants(quadratic('sqr(b) > 2'))
    expect(rows.every((r) => r.rejected === undefined)).toBe(true)
    expect(rows.every((r) => r.problems.includes('PhysLab could not read the condition sqr(b) > 2, so it cannot choose the variants that meet it.'))).toBe(true)
  })

  it('reads ≥, ² and the proper minus the way the calculator does', () => {
    expect(conditionHolds('b² − 4*a*c ≥ 0', { a: 1, b: 5, c: 6 })).toBe(true)
    expect(conditionHolds('b² − 4*a*c ≥ 0', { a: 1, b: 1, c: 6 })).toBe(false)
    // In degrees, like every formula of the variables: tan 30° = 0.577.
    expect(conditionHolds('mu >= tan(theta)', { mu: 0.6, theta: 30 })).toBe(true)
    expect(conditionHolds('mu >= tan(theta)', { mu: 0.5, theta: 30 })).toBe(false)
    // A value that could not be drawn never passes a comparison.
    expect(conditionHolds('a > 0', { a: NaN })).toBe(false)
    expect(conditionHolds('a + ', { a: 1 })).toBeNull()
    // A name that is neither a variable nor a built-in cannot be read; pi is a built-in.
    expect(conditionHolds('a > q', { a: 1 })).toBeNull()
    expect(conditionHolds('a > pi', { a: 4 })).toBe(true)
  })

  it('a readable condition that has no real value for some draws is false for those draws, not unreadable', () => {
    // sqrt(−4) is complex, and mathjs throws when it is compared: that draw fails, the search goes on.
    expect(conditionHolds('sqrt(b) > 2', { b: -4 })).toBe(false)
    expect(conditionHolds('sqrt(b)', { b: -4 })).toBe(false)
    expect(conditionHolds('sqrt(b) > 2', { b: 9 })).toBe(true)
    const q = quadratic('sqrt(b) > 2')
    for (let seed = 1; seed <= 1000; seed++) {
      const v = drawVariables(q, seed)
      expect(v.problems).toEqual([])
      expect(Math.sqrt(v.values.b)).toBeGreaterThan(2)
    }
    // The preview flags the rows it leaves out instead of calling the condition unreadable.
    const rows = previewVariants(q)
    expect(rows.every((r) => r.problems.length === 0)).toBe(true)
    expect(rows.some((r) => r.rejected !== undefined)).toBe(true)
  })

  it('the ten preview rows are the raw draws, and every row failing the condition is flagged', () => {
    const q = quadratic()
    const rows = previewVariants(q)
    expect(rows.map((r) => r.seed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    let flagged = 0
    for (const r of rows) {
      const { a, b, c } = r.values
      expect(r.values).toEqual(drawVariables({ ...q, condition: undefined }, r.seed).values)
      if (b * b - 4 * a * c < 0) {
        flagged++
        expect(r.rejected).toBe('Left out: b² − 4a × c ≥ 0 does not hold here, so a student gets the next variant that meets it.')
      } else {
        expect(r.rejected).toBeUndefined()
      }
    }
    expect(flagged).toBeGreaterThan(0)
    expect(flagged).toBeLessThan(10)
    // A question with no condition flags nothing.
    expect(previewVariants({ ...q, condition: undefined }).every((r) => r.rejected === undefined)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Error carried forward
// ---------------------------------------------------------------------------

const band = { kind: 'relative' as const, value: 0.02 }

/**
 * The braking train as the design works it: v = 24 m/s, t = 8 s. (a) a = −v/t = −3 m/s²;
 * (b) s = vt + ½at² = 96 m, carrying (a) forward through the variable a; (c) the average speed
 * s/t = 12 m/s, carrying (b) forward through s.
 */
function train(ecf: Partial<ECF> = {}, ecfC: Partial<ECF> = {}): PQQuestion {
  const carry = (part: number, variable: string, over: Partial<ECF>): ECF => ({ uses: [{ part, variable }], strategy: 'originalfirst', penalty: 0, ...over })
  return throughFile({
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
      { type: 'number', prompt: 'How far it goes', answer: 'v*t + a*t^2/2', unit: 'm', tolerance: band, marks: 2, ecf: carry(0, 'a', ecf) },
      { type: 'number', prompt: 'Its average speed', answer: 's/t', unit: 'm/s', tolerance: band, marks: 1, ecf: carry(1, 's', ecfC) }
    ],
    license: { id: 'CC BY 4.0', holder: 'PhysLab' }
  })
}

/** Plays the question and marks every part the way Practice will: each part with the student's own earlier answers. */
function sit(q: PQQuestion, answers: string[]): ECFCheck[] {
  const played: Played = playQuestion(q, 1, S)
  const earlier = new Map<number, number>()
  return played.parts.map((p, i) => {
    const answer = answers[i] ?? ''
    // Practice's plain marker: the player's own checkPlayedPart, with the values swapped in.
    const c = markWithECF(p, answer, played, earlier, S, (values) => checkPlayedPart(p, answer, { ...played, variant: { ...played.variant, values } }, S))
    const x = answerValue(p.part, answers[i] ?? '')
    if (x !== null) earlier.set(i, x)
    return c
  })
}

describe('error carried forward: the braking train (v = 24 m/s, t = 8 s)', () => {
  const NOTE = 'Marked using your answer to part (a): −4 m/s²'

  it('the true answers are −3 m/s², 96 m and 12 m/s', () => {
    const [a, b, c] = sit(train(), ['-3', '96', '12'])
    expect([a.verdict, b.verdict, c.verdict]).toEqual(['right', 'right', 'right'])
    expect([a.marks, b.marks, c.marks]).toEqual([1, 2, 1])
    expect([a.ecfNote, b.ecfNote, c.ecfNote]).toEqual([undefined, undefined, undefined])
  })

  it('(a) −4 is wrong; then (b) 64 is right by error carried forward, with the note', () => {
    const [a, b] = sit(train(), ['-4', '64'])
    expect(a.verdict).toBe('wrong')
    expect(b).toMatchObject({ verdict: 'right', ecfNote: NOTE, marks: 2, outOf: 2 })
  })

  it('(a) −4, then the true (b) 96 is still right, with no note', () => {
    const [, b] = sit(train(), ['-4', '96'])
    expect(b).toMatchObject({ verdict: 'right', marks: 2 })
    expect(b.ecfNote).toBeUndefined()
  })

  it('(a) −4, then (b) 50 is wrong either way', () => {
    const [, b] = sit(train(), ['-4', '50'])
    expect(b).toMatchObject({ verdict: 'wrong', marks: 0 })
    expect(b.ecfNote).toBeUndefined()
  })

  it('a penalty of 1 of the 2 marks leaves 1 mark for the carried-forward answer', () => {
    const [, b] = sit(train({ penalty: 1 }), ['-4', '64'])
    expect(b).toMatchObject({ verdict: 'right', ecfNote: NOTE, marks: 1, outOf: 2 })
    // …and nothing off a part right on the true values.
    expect(sit(train({ penalty: 1 }), ['-4', '96'])[1].marks).toBe(2)
  })

  it('alwaysreplace marks only against the student’s own (a): after −4, 96 is wrong and 64 right', () => {
    const [, wrong] = sit(train({ strategy: 'alwaysreplace' }), ['-4', '96'])
    expect(wrong).toMatchObject({ verdict: 'wrong', marks: 0, ecfNote: NOTE })
    const [, right] = sit(train({ strategy: 'alwaysreplace' }), ['-4', '64'])
    expect(right).toMatchObject({ verdict: 'right', marks: 2, ecfNote: NOTE })
  })

  it('an empty or unreadable answer gets no note, even under alwaysreplace after a wrong (a)', () => {
    const [, blank] = sit(train({ strategy: 'alwaysreplace' }), ['-4', ''])
    expect(blank).toMatchObject({ verdict: 'empty', marks: 0 })
    expect(blank.ecfNote).toBeUndefined()
    const [, garbled] = sit(train({ strategy: 'alwaysreplace' }), ['-4', 'sixty four'])
    expect(garbled).toMatchObject({ verdict: 'unreadable', marks: 0 })
    expect(garbled.ecfNote).toBeUndefined()
  })

  it('reads the carried answer with its unit, and names it in the note in the part’s own unit', () => {
    expect(answerValue(train().parts[0], '−4 m/s²')).toBe(-4)
    expect(answerValue(train().parts[1], '6400 cm')).toBe(64)
    expect(answerValue(train().parts[0], '')).toBeNull()
    expect(answerValue(train().parts[0], 'minus four')).toBeNull()
    expect(sit(train(), ['−4 m/s²', '64 m'])[1]).toMatchObject({ verdict: 'right', ecfNote: NOTE })
  })

  it('rederive works everything downstream of the replaced variable out again and keeps the drawn ones', () => {
    const q = train()
    const variant = drawVariables(q, 1)
    expect(variant.values).toEqual({ v: 24, t: 8, a: -3, s: 96 })
    expect(rederive(q, variant, { a: -4 })).toEqual({ v: 24, t: 8, a: -4, s: 64 })
    expect(rederive(q, variant, {})).toEqual(variant.values)
    // Replacing a drawn variable changes what follows from it, and the replacement is never re-drawn.
    expect(rederive(q, variant, { v: 20 })).toEqual({ v: 20, t: 8, a: -2.5, s: 80 })
  })

  it('names the parts (a), (b), (c)', () => {
    expect([0, 1, 2].map(partLetter)).toEqual(['(a)', '(b)', '(c)'])
  })
})

describe('ten mark-scheme cases worked by hand (v = 24 m/s, t = 8 s: a = −3, s = 96, s/t = 12)', () => {
  type Case = { answers: string[]; ecf?: Partial<ECF>; b: [string, number, string?]; c: [string, number, string?]; why: string }
  const A4 = 'Marked using your answer to part (a): −4 m/s²'
  const B64 = 'Marked using your answer to part (b): 64 m'
  const cases: Case[] = [
    { why: 'all true', answers: ['-3', '96', '12'], b: ['right', 2], c: ['right', 1] },
    { why: 'a wrong, then b and c follow from it', answers: ['-4', '64', '8'], b: ['right', 2, A4], c: ['right', 1, B64] },
    { why: 'a wrong, then b and c true anyway', answers: ['-4', '96', '12'], b: ['right', 2], c: ['right', 1] },
    { why: 'a wrong, b carried, c true: originalfirst takes the true values first', answers: ['-4', '64', '12'], b: ['right', 2, A4], c: ['right', 1] },
    // −3.02 is inside (a)'s 2 % band, so it IS −3: (b) and (c) are marked against the true values.
    { why: 'a rounded within its band is not an error', answers: ['-3.02', '95.36', '11.92'], b: ['right', 2], c: ['right', 1] },
    { why: 'a left blank: nothing to carry, b marked plainly', answers: ['', '64', '8'], b: ['wrong', 0], c: ['right', 1, B64] },
    { why: 'a with the sign flipped, used consistently', answers: ['3', '288', '36'], b: ['right', 2, 'Marked using your answer to part (a): 3 m/s²'], c: ['right', 1, 'Marked using your answer to part (b): 288 m'] },
    { why: 'a penalty of 1 on every carried part', answers: ['-4', '64', '8'], ecf: { penalty: 1 }, b: ['right', 1, A4], c: ['right', 0, B64] },
    { why: 'alwaysreplace after right earlier answers changes nothing', answers: ['-3', '96', '12'], ecf: { strategy: 'alwaysreplace' }, b: ['right', 2], c: ['right', 1] },
    { why: 'alwaysreplace: c must follow the student own b', answers: ['-4', '64', '12'], ecf: { strategy: 'alwaysreplace' }, b: ['right', 2, A4], c: ['wrong', 0, B64] }
  ]

  it.each(cases)('$why: $answers', ({ answers, ecf, b, c }) => {
    const [, gotB, gotC] = sit(train(ecf, ecf), answers)
    expect([gotB.verdict, gotB.marks, gotB.ecfNote]).toEqual([b[0], b[1], b[2]])
    expect([gotC.verdict, gotC.marks, gotC.ecfNote]).toEqual([c[0], c[1], c[2]])
  })
})

describe('error carried forward into a function answer', () => {
  /** A spring: ω = √(k/m) = 2 rad/s, then y″ + ω²y = 0 from rest at 0 moving at ω — the answer is sin(ωt). */
  const spring = (ecf?: ECF): PQQuestion =>
    throughFile({
      id: 'spring',
      title: 'A spring',
      statement: 'A mass of {m} kg hangs on a spring of stiffness {k} N/m.',
      variables: [
        { name: 'k', def: { kind: 'list', items: [4] } },
        { name: 'm', def: { kind: 'list', items: [1] } },
        { name: 'w', def: { kind: 'expr', expr: 'sqrt(k/m)' } }
      ],
      parts: [
        { type: 'number', prompt: 'Find ω.', answer: 'w', unit: 'none', tolerance: band, marks: 1 },
        {
          type: 'function',
          prompt: 'Find y(t).',
          x: 't',
          y: 'y',
          ode: "y'' + w^2 y = 0",
          initial: [
            { at: '0', order: 0, value: '0' },
            { at: '0', order: 1, value: 'w' }
          ],
          model: 'sin(w t)',
          marks: 2,
          ...(ecf ? { ecf } : {})
        }
      ],
      license: { id: 'CC BY 4.0', holder: 'PhysLab' }
    })

  it('a function part is marked in its own equation through markWithECF', () => {
    const [, right] = sit(spring(), ['2', 'sin(2t)'])
    expect(right).toMatchObject({ verdict: 'right', marks: 2, outOf: 2 })
    const [, wrong] = sit(spring(), ['2', 'sin(3t)'])
    expect(wrong).toMatchObject({ verdict: 'wrong', marks: 0, message: 'That formula does not solve the equation: put it into both sides and they do not come out equal.' })
  })

  it('ω = 3 in part (a) makes sin(3t) right in part (b), with the note', () => {
    const q = spring({ uses: [{ part: 0, variable: 'w' }], strategy: 'originalfirst', penalty: 0 })
    expect(sit(q, ['3', 'sin(3t)'])[1]).toMatchObject({ verdict: 'right', marks: 2, ecfNote: 'Marked using your answer to part (a): 3' })
    expect(sit(q, ['3', 'sin(2t)'])[1]).toMatchObject({ verdict: 'right', marks: 2 })
    expect(sit(q, ['3', 'sin(2t)'])[1].ecfNote).toBeUndefined()
    // Without error carried forward the same answer is wrong: the part never said it may be.
    expect(sit(spring(), ['3', 'sin(3t)'])[1].verdict).toBe('wrong')
  })
})

describe('showIf: a part shown only when a condition in the variables holds', () => {
  /** A block on a slope at θ = 30° (tan θ = 0.577): it slides when μ < tan θ and stays put when μ ≥ tan θ. */
  const slope = (mu: number, showIf = 'mu < tan(theta)'): PQQuestion =>
    throughFile({
      id: 'slope',
      title: 'A block on a slope',
      statement: 'A block rests on a slope at {theta}; the coefficient of friction is {mu}.',
      variables: [
        { name: 'mu', def: { kind: 'list', items: [mu] } },
        { name: 'theta', def: { kind: 'list', items: [30] }, unit: '°' }
      ],
      parts: [
        { type: 'number', prompt: 'tan θ', answer: 'tan(theta)', unit: 'none', tolerance: band, marks: 1 },
        { type: 'number', prompt: 'Its acceleration down the slope', answer: '9.8 * (sin(theta) - mu * cos(theta))', unit: 'm/s²', tolerance: band, marks: 2, showIf },
        { type: 'number', prompt: 'The friction on it, per kilogram', answer: '9.8 * sin(theta)', unit: 'N', tolerance: band, marks: 2, showIf: 'mu >= tan(theta)' }
      ],
      license: { id: 'CC BY 4.0', holder: 'PhysLab' }
    })

  it('μ = 0.3 < tan 30°: the sliding part shows, the staying part does not', () => {
    const q = slope(0.3)
    const values = playQuestion(q, 1, S).variant.values
    expect(shownParts(q, values)).toEqual([0, 1])
    expect(partShown(q.parts[2], values)).toBe(false)
  })

  it('μ = 0.8 ≥ tan 30°: the staying part shows instead', () => {
    const q = slope(0.8)
    expect(shownParts(q, playQuestion(q, 1, S).variant.values)).toEqual([0, 2])
  })

  it('a part with no condition always shows, and one PhysLab cannot read shows too — and the preview says why', () => {
    const q = slope(0.3, 'mu < tan(')
    expect(shownParts(q, drawVariables(q, 1).values)).toEqual([0, 1])
    expect(previewVariants(q)[0].problems).toEqual(['PhysLab could not read the condition for showing part (b), mu < tan(, so that part is always shown.'])
    const plain: PQPart = { ...q.parts[0] }
    expect(partShown(plain, {})).toBe(true)
  })

  it('a showIf with a misspelt function (sqr for sqrt) is shown to every student, and the preview names part (b)', () => {
    const q = slope(0.3, 'sqr(mu) > 2')
    const values = drawVariables(q, 1).values
    expect(partShown(q.parts[1], values)).toBe(true)
    expect(shownParts(q, values)).toEqual([0, 1])
    expect(previewVariants(q)[0].problems).toEqual(['PhysLab could not read the condition for showing part (b), sqr(mu) > 2, so that part is always shown.'])
  })
})

describe('markWithECF takes the plain marking from its caller', () => {
  it('marks through the marker it is given, against the true values and then the student’s own', () => {
    const q = train({ strategy: 'originalfirst' })
    const played = playQuestion(q, 1, S)
    const seen: number[] = []
    const c = markWithECF(played.parts[1], '64', played, new Map([[0, -4]]), S, (values) => {
      seen.push(values.a)
      return { verdict: values.a === -4 ? 'right' : 'wrong' }
    })
    expect(seen).toEqual([-3, -4])
    expect(c).toMatchObject({ verdict: 'right', ecfNote: 'Marked using your answer to part (a): −4 m/s²' })
  })

  it('imports the player for its types only, so checkPlayedPart can call markWithECF without a cycle', () => {
    const src = readFileSync(resolve(__dirname, '../src/renderer/src/questions/ecf.ts'), 'utf-8')
    expect(src).toMatch(/^import type \{[^}]*\} from '\.\/player'$/m)
    expect(src).not.toMatch(/^import \{[^}]*\} from '\.\/player'$/m)
  })
})

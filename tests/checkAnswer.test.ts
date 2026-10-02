// The answer checker: a student must never be marked wrong for a right answer, and when they are
// wrong the sentence under the box must name the mistake they actually made.

import { readdirSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkAnswer, expectedText, isCorrect, parseAnswer, UNIT_TAIL } from '../src/renderer/src/math/checkAnswer'
import { getAngleMode, setAngleMode } from '../src/renderer/src/math/expr'
import { generate, type AnswerField } from '../src/renderer/src/math/problems'
import { checkNumberPart, evaluateInVariables } from '../src/renderer/src/questions/parts'
import { parsePQFile, type BandTolerance, type PQPart, type UnitId } from '../src/renderer/src/questions/pqjson'
import { UNITS } from '../src/renderer/src/questions/units'
import { readSource, repoPath } from './helpers/repo'

const field = (over: Partial<AnswerField> = {}): AnswerField => ({ key: 'a', label: 'A', value: 12.5, tol: 0.125, ...over })
/** A direction from +x, as the magnitude-and-direction question asks for. */
const angle = (value: number, over: Partial<AnswerField> = {}): AnswerField => field({ value, tol: 0.6, kind: 'direction', unit: '°', ...over })
/** An amount of turning, as the angle between two vectors. */
const between = (value: number, over: Partial<AnswerField> = {}): AnswerField => field({ value, tol: 0.6, kind: 'angle', unit: '°', ...over })

// The angle mode is a mutable global: put it back so no other file inherits a stray setting.
beforeEach(() => setAngleMode('deg'))
afterEach(() => setAngleMode('deg'))

describe('parseAnswer', () => {
  it('reads plain numbers, signs and expressions', () => {
    expect(parseAnswer('12.5')).toBe(12.5)
    expect(parseAnswer('  -3 ')).toBe(-3)
    expect(parseAnswer('−3.4')).toBeCloseTo(-3.4, 12)
    expect(parseAnswer('5*sqrt(2)')).toBeCloseTo(7.0710678, 6)
    expect(parseAnswer('3/4')).toBe(0.75)
    expect(parseAnswer('2^10')).toBe(1024)
    expect(parseAnswer('0')).toBe(0)
  })

  it('strips a unit typed after the number but not a letter that is part of the maths', () => {
    expect(parseAnswer('12.5 N')).toBe(12.5)
    expect(parseAnswer('37°')).toBe(37)
    expect(parseAnswer('37 deg')).toBe(37)
    expect(parseAnswer('37 degrees')).toBe(37)
    expect(parseAnswer('2 m/s')).toBe(2)
    expect(parseAnswer('9.8 m/s^2')).toBe(9.8)
    expect(parseAnswer('9.8 m/s2')).toBe(9.8)
    expect(parseAnswer('4 N·m')).toBe(4)
    expect(parseAnswer('4 Nm')).toBe(4)
    expect(parseAnswer('100 J')).toBe(100)
    expect(parseAnswer('3 kg')).toBe(3)
    expect(parseAnswer('1.5 rad')).toBe(1.5)
    expect(parseAnswer('7 units')).toBe(7)
    expect(parseAnswer('(1+2)m')).toBe(3)
  })

  it('takes a comma only as a thousands separator between digit groups', () => {
    expect(parseAnswer('1,234')).toBe(1234)
    expect(parseAnswer('1,234.5')).toBe(1234.5)
    expect(parseAnswer('12,345,678')).toBe(12345678)
    expect(parseAnswer('-1,000 N')).toBe(-1000)
    // A comma anywhere else is not silently dropped into a different number.
    expect(parseAnswer('1,5')).toBeNull()
    expect(parseAnswer('1,23')).toBeNull()
    expect(parseAnswer('1,2345')).toBeNull()
    // No number is grouped as 0,500: that is a decimal comma, and used to be read as 500.
    expect(parseAnswer('0,500')).toBeNull()
    expect(parseAnswer('0,5')).toBeNull()
    expect(parseAnswer('1,234,5')).toBeNull()
  })

  it('grades in degrees whatever mode the calculator was left in, and puts the mode back', () => {
    expect(parseAnswer('sin(30)')).toBeCloseTo(0.5, 12)
    expect(parseAnswer('cos(60)')).toBeCloseTo(0.5, 12)
    setAngleMode('rad')
    expect(parseAnswer('sin(30)')).toBeCloseTo(0.5, 12)
    expect(parseAnswer('tan(45)')).toBeCloseTo(1, 12)
    expect(getAngleMode()).toBe('rad')
    expect(parseAnswer('cos(60)')).toBeCloseTo(0.5, 12)
    expect(getAngleMode()).toBe('rad')
    // Even when what was typed cannot be read, the mode comes back.
    setAngleMode('rad')
    expect(parseAnswer('sin(')).toBeNull()
    expect(getAngleMode()).toBe('rad')
  })

  it('says null for nothing, nonsense and numbers that are not numbers', () => {
    expect(parseAnswer('')).toBeNull()
    expect(parseAnswer('   ')).toBeNull()
    expect(parseAnswer('N')).toBeNull()
    expect(parseAnswer('no idea')).toBeNull()
    expect(parseAnswer('1/0')).toBeNull()
    expect(parseAnswer('sqrt(-1)')).toBeNull()
    expect(parseAnswer('[1, 2]')).toBeNull()
  })

  it('reads back everything the reveal button prints', () => {
    for (const v of [0, 12.5, -0.05, 1234.5678, 1e-7, 3.2e12, -4.5e10]) {
      expect(parseAnswer(expectedText(field({ value: v })))).toBeCloseTo(v, 3)
      expect(parseAnswer(expectedText(field({ value: v }), { decimals: 3, precisionMode: 'sf' }))).toBeCloseTo(v, -Math.floor(Math.log10(Math.abs(v) || 1)) + 2)
      expect(parseAnswer(expectedText(field({ value: v, unit: 'N' })))).toBeCloseTo(v, 3)
    }
  })
})

describe('checkAnswer', () => {
  it('is empty for nothing and unreadable for nonsense', () => {
    expect(checkAnswer('', field()).verdict).toBe('empty')
    expect(checkAnswer('   ', field()).verdict).toBe('empty')
    const c = checkAnswer('twelve', field())
    expect(c.verdict).toBe('unreadable')
    expect(c.message).toMatch(/could not read/)
    expect(isCorrect(c)).toBe(false)
  })

  it('accepts the answer within tolerance, in any form', () => {
    const forms: [string, number][] = [
      ['12.5', 12.5],
      ['12.55', 12.55],
      ['12.4', 12.4],
      ['25/2', 12.5],
      ['12.5 N', 12.5]
    ]
    for (const [text, parsed] of forms) {
      const c = checkAnswer(text, field())
      expect(c.verdict, text).toBe('right')
      expect(c.parsed).toBeCloseTo(parsed, 12)
      expect(isCorrect(c)).toBe(true)
    }
    expect(checkAnswer('0', field({ value: 0, tol: 0.05 })).verdict).toBe('right')
    expect(checkAnswer('-0.04', field({ value: 0, tol: 0.05 })).verdict).toBe('right')
  })

  it('takes an angle a full turn away as the same direction and quotes it between 0° and 360°', () => {
    const c = checkAnswer('-30', angle(330))
    expect(c.verdict).toBe('right')
    expect(c.message).toBe('Same direction. Written between 0° and 360° it is 330°.')
    expect(checkAnswer('390', angle(30)).verdict).toBe('right')
    expect(checkAnswer('0.2', angle(359.9)).verdict).toBe('right')
    // A field set below zero still keeps the promise in the sentence.
    const neg = checkAnswer('300', angle(-60))
    expect(neg.verdict).toBe('right')
    expect(neg.message).toBe('Same direction. Written between 0° and 360° it is 300°.')
    // The number in the message is written in the student's precision, not with raw digits.
    expect(checkAnswer('-323.13', angle(36.8698976)).message).toBe('Same direction. Written between 0° and 360° it is 36.87°.')
    expect(checkAnswer('-323.13', angle(36.8698976), { decimals: 3, precisionMode: 'sf' }).message).toBe('Same direction. Written between 0° and 360° it is 36.9°.')
    expect(checkAnswer('-323.13', angle(36.8698976), { decimals: 1, precisionMode: 'dp' }).message).toBe('Same direction. Written between 0° and 360° it is 36.9°.')
  })

  it('does not go round in a circle for the angle between two vectors', () => {
    // 60° between A and B is an amount of turning: a full turn more is not the same answer, and
    // 240° is not "the wrong quadrant" — there are no quadrants in an angle between two vectors.
    // Both used to be graded as directions: 420 was accepted and 240 blamed on the quadrant.
    const f = between(60)
    expect(checkAnswer('60', f).verdict).toBe('right')
    expect(checkAnswer('420', f)).toEqual({ verdict: 'wrong', parsed: 420, message: 'Not quite. Press Hint to see the next step.' })
    expect(checkAnswer('240', f)).toEqual({ verdict: 'wrong', parsed: 240, message: 'Not quite. Press Hint to see the next step.' })
    expect(checkAnswer('120', f)).toEqual({ verdict: 'wrong', parsed: 120, message: 'Not quite. Press Hint to see the next step.' })
    expect(checkAnswer('300', f)).toEqual({ verdict: 'wrong', parsed: 300, message: 'Not quite. Press Hint to see the next step.' })
    expect(checkAnswer('-60', f).message).toMatch(/^Right size, wrong sign/)
    // It is still an angle: radians handed in for degrees, and degrees converted twice, are named.
    expect(checkAnswer('1.0472', f).message).toMatch(/in radians/)
    expect(checkAnswer('3437.7', f).message).toMatch(/converted a second time/)
    // A field with no kind is a plain number and gets none of the angle rules.
    expect(checkAnswer('420', field({ value: 60, tol: 0.6 })).message).toMatch(/^Not quite/)
  })

  it('the problem bank marks its one direction as a direction and its angles between vectors as angles', () => {
    for (const seed of [1, 2, 3, 17, 4242]) {
      const dir = generate('magdir', seed).fields.find((f) => f.key === 'theta')!
      expect(dir.kind).toBe('direction')
      expect(checkAnswer(String(dir.value + 360), dir).verdict).toBe('right')
      for (const [topic, key] of [['twoforces', 'alpha'], ['dot', 'theta']] as const) {
        const f = generate(topic, seed).fields.find((x) => x.key === key)!
        expect(f.kind, `${topic} ${key}`).toBe('angle')
        expect(checkAnswer(String(f.value + 360), f).verdict, `${topic} ${key} + 360`).toBe('wrong')
        expect(checkAnswer(String(f.value), f).verdict).toBe('right')
      }
    }
  })

  it('names sin instead of cos, and cos instead of sin, from the question’s own traps', () => {
    const Fx = field({ value: 8.66, tol: 0.09, traps: [{ value: 5, why: 'That is F sin θ. The x-component uses cos, the y-component uses sin.' }] })
    const c = checkAnswer('5', Fx)
    expect(c.verdict).toBe('wrong')
    expect(c.message).toBe('That is F sin θ. The x-component uses cos, the y-component uses sin.')
    const Fy = field({ value: 5, tol: 0.05, traps: [{ value: 8.66, why: 'That is F cos θ. The y-component uses sin.' }] })
    expect(checkAnswer('8.66', Fy).message).toBe('That is F cos θ. The y-component uses sin.')
    // The trap is only for that value: a right answer is never overridden by a trap.
    expect(checkAnswer('8.66', Fx).verdict).toBe('right')
  })

  it('matches a named trap at its own size, not with the answer’s absolute band', () => {
    // Braking car, 20 m/s for 12 s: 120 m at 2 % is ±2.4 m, and the trap v ÷ t is 1.67 m/s².
    // With the answer's band every number from −0.7 to 4.1 was called "the deceleration".
    const s = field({ value: 120, tol: 2.4, traps: [{ value: 20 / 12, why: 'That is the size of the deceleration, in m/s², not a distance.' }] })
    expect(checkAnswer('1', s).message).toBe('Not quite. Press Hint to see the next step.')
    expect(checkAnswer('3', s).message).toBe('Not quite. Press Hint to see the next step.')
    expect(checkAnswer('1.67', s).message).toBe('That is the size of the deceleration, in m/s², not a distance.')
    expect(checkAnswer('1.66', s).message).toBe('That is the size of the deceleration, in m/s², not a distance.')
    expect(checkAnswer('120', s).verdict).toBe('right')
  })

  it('a named trap comes before the general sign and quadrant rules', () => {
    const f = angle(30, { traps: [{ value: -30, why: 'You dropped the minus on Ay.' }] })
    expect(checkAnswer('-30', f).message).toBe('You dropped the minus on Ay.')
  })

  it('spots the wrong sign', () => {
    const c = checkAnswer('-12.5', field())
    expect(c.verdict).toBe('wrong')
    expect(c.message).toMatch(/^Right size, wrong sign/)
    expect(checkAnswer('12.5', field({ value: -12.5 })).message).toMatch(/wrong sign/)
  })

  it('spots the right reference angle in the wrong quadrant', () => {
    const wrongQuadrant = /^Right reference angle, wrong quadrant/
    // 36.87° is in the first quadrant: the other three quadrants share its reference angle.
    const th = 36.8698976
    expect(checkAnswer('143.13', angle(th)).message).toMatch(wrongQuadrant)
    expect(checkAnswer('216.87', angle(th)).message).toMatch(wrongQuadrant)
    expect(checkAnswer('323.13', angle(th)).message).toMatch(wrongQuadrant)
    // From the second quadrant, every other quadrant.
    expect(checkAnswer('36.87', angle(143.13)).message).toMatch(wrongQuadrant)
    expect(checkAnswer('216.87', angle(143.13)).message).toMatch(wrongQuadrant)
    expect(checkAnswer('323.13', angle(143.13)).message).toMatch(wrongQuadrant)
    // Practice fields are written between 0° and 360°, so a third- or fourth-quadrant field is
    // the case the old plain-number comparison (216.87 against −143.13) missed.
    expect(checkAnswer('36.87', angle(216.87)).message).toMatch(wrongQuadrant)
    expect(checkAnswer('143.13', angle(216.87)).message).toMatch(wrongQuadrant)
    expect(checkAnswer('323.13', angle(216.87)).message).toMatch(wrongQuadrant)
    expect(checkAnswer('36.87', angle(323.13)).message).toMatch(wrongQuadrant)
    expect(checkAnswer('143.13', angle(323.13)).message).toMatch(wrongQuadrant)
    expect(checkAnswer('216.87', angle(323.13)).message).toMatch(wrongQuadrant)
    // And the same answers written below zero.
    expect(checkAnswer('-143.13', angle(323.13)).message).toMatch(wrongQuadrant)
    expect(checkAnswer('-36.87', angle(216.87)).message).toMatch(wrongQuadrant)
    // The quadrant rule is only for angles: a length that is 180 − v is just wrong.
    expect(checkAnswer('167.5', field()).message).toMatch(/^Not quite/)
  })

  it('spots radians handed in for degrees, and degrees converted twice', () => {
    const rad = checkAnswer('0.5236', angle(30))
    expect(rad.verdict).toBe('wrong')
    expect(rad.message).toMatch(/in radians/)
    const twice = checkAnswer('1718.9', angle(30))
    expect(twice.message).toMatch(/converted a second time/)
    // A plain number is never read as an angle mistake.
    expect(checkAnswer('0.218', field()).message).not.toMatch(/radians/)
  })

  it('spots a power of ten', () => {
    for (const text of ['125', '1250', '12500', '1.25', '0.125', '0.0125', '12500000', '0.0000125']) {
      const c = checkAnswer(text, field())
      expect(c.verdict, text).toBe('wrong')
      expect(c.message, text).toMatch(/wrong power of ten/)
    }
    // Not when the answer is zero: every multiple of zero is zero.
    expect(checkAnswer('7', field({ value: 0, tol: 0.05 })).message).toMatch(/^Not quite/)
  })

  it('calls a near miss "close", says why, and does not count it (docs/ACCURACY.md)', () => {
    const c = checkAnswer('12.9', field())
    expect(c.verdict).toBe('close')
    expect(c.message).toMatch(/rounded a little early/)
    expect(isCorrect(c)).toBe(false)
    expect(checkAnswer('13.1', field()).verdict).toBe('wrong')
  })

  it('falls back to a plain "not quite" that points at the hint', () => {
    const c = checkAnswer('99', field())
    expect(c.verdict).toBe('wrong')
    expect(c.parsed).toBe(99)
    expect(c.message).toBe('Not quite. Press Hint to see the next step.')
    expect(isCorrect(c)).toBe(false)
    expect(isCorrect(undefined)).toBe(false)
  })

  it('grades a trig expression in degrees even after a session in radians', () => {
    setAngleMode('rad')
    expect(checkAnswer('10*cos(60)', field({ value: 5, tol: 0.05 })).verdict).toBe('right')
    expect(checkAnswer('10*sin(30)', field({ value: 5, tol: 0.05 })).verdict).toBe('right')
    expect(getAngleMode()).toBe('rad')
  })

  it('copes with huge and tiny answers', () => {
    expect(checkAnswer('3.2e12', field({ value: 3.2e12, tol: 3.2e10 })).verdict).toBe('right')
    expect(checkAnswer('3.2×10^12', field({ value: 3.2e12, tol: 3.2e10 })).verdict).toBe('right')
    expect(checkAnswer('1.6×10^-19', field({ value: 1.6e-19, tol: 1.6e-21 })).verdict).toBe('right')
    expect(checkAnswer('1.6×10^-18', field({ value: 1.6e-19, tol: 1.6e-21 })).message).toMatch(/power of ten/)
  })
})

describe('expectedText', () => {
  it('writes the answer through the student’s own precision, with its unit', () => {
    expect(expectedText(field({ value: 12.3456789, unit: 'N' }))).toBe('12.3457 N')
    expect(expectedText(field({ value: 12.3456789, unit: 'N' }), { decimals: 2, precisionMode: 'dp' })).toBe('12.35 N')
    expect(expectedText(field({ value: 12.3456789 }), { decimals: 3, precisionMode: 'sf' })).toBe('12.3')
    expect(expectedText(field({ value: 2.5, unit: 'm' }), { decimals: 3, precisionMode: 'sf' })).toBe('2.50 m')
    expect(expectedText(field({ value: 0 }))).toBe('0')
    // A degree sign sits against its number, the way formatMeasure writes it.
    expect(expectedText(field({ value: -7.25, unit: '°' }), { decimals: 1, precisionMode: 'dp' })).toBe('−7.3°')
    expect(expectedText(angle(36.8698976), { decimals: 2, precisionMode: 'dp' })).toBe('36.87°')
    expect(expectedText(field({ value: 6.674e-11, unit: 'N' }), { decimals: 3, precisionMode: 'sf' })).toBe('6.67×10^-11 N')
    expect(expectedText(field({ value: 2.5e-7, unit: 'm' }), { decimals: 3, precisionMode: 'sf' })).toBe('2.50×10^-7 m')
  })

  it('reveals an answer smaller than the display noise floor instead of calling it 0', () => {
    // fmt writes anything under 1e-12 as 0 for a dragged point; a known answer is not noise.
    expect(expectedText(field({ value: 1.6e-19, unit: 'N' }), { decimals: 2, precisionMode: 'sf' })).toBe('1.6×10^-19 N')
    expect(expectedText(field({ value: -1.6e-19, unit: 'N' }), { decimals: 3, precisionMode: 'sf' })).toBe('−1.60×10^-19 N')
    expect(expectedText(field({ value: 1.6e-19, unit: 'N' }))).toBe('1.6×10^-19 N')
    expect(parseAnswer(expectedText(field({ value: 1.6e-19 })))).toBeCloseTo(1.6e-19, 25)
    expect(checkAnswer(expectedText(field({ value: 1.6e-19 }), { decimals: 2, precisionMode: 'sf' }), field({ value: 1.6e-19, tol: 1.6e-21 })).verdict).toBe('right')
    // An answer of exactly zero is still 0.
    expect(expectedText(field({ value: 0, unit: 'N' }))).toBe('0 N')
  })
})

// P21: a field marked exactly (tol 0) gives revealPrecision no band to fit inside, and it handed
// back the student's own precision: 2.675 m at 2 d.p. was revealed as "2.67 m", and typed back
// that was marked wrong under the answer PhysLab had just shown.
describe('P21: expectedText for an answer marked exactly (tolerance 0)', () => {
  const dp = (decimals: number) => ({ decimals, precisionMode: 'dp' }) as const
  const sf = (decimals: number) => ({ decimals, precisionMode: 'sf' }) as const

  it('reveals the answer exactly, not rounded to the student’s precision, and typed back it is right: 2.675 m at 2 d.p., 12.345 N at 3 s.f.', () => {
    for (const [f, s, want] of [
      [field({ value: 2.675, tol: 0, unit: 'm' }), dp(2), '2.675 m'],
      [field({ value: 12.345, tol: 0, unit: 'N' }), sf(3), '12.345 N']
    ] as const) {
      const shown = expectedText(f, s)
      expect.soft(shown, `${f.value} at ${s.decimals} ${s.precisionMode}`).toBe(want)
      expect.soft(checkAnswer(shown, f, s).verdict, `"${shown}" typed back`).toBe('right')
    }
  })

  it('never reveals binary noise, and the clean answer typed back is right: 0.1 + 0.2 reads "0.3", 0.35 × 3 reads "1.05"', () => {
    for (const [value, s, want] of [
      [0.1 + 0.2, dp(2), '0.3'],
      [0.35 * 3, dp(2), '1.05'],
      [0.35 * 3, dp(1), '1.05']
    ] as const) {
      const f = field({ value, tol: 0 })
      const shown = expectedText(f, s)
      expect.soft(shown, `${value} at ${s.decimals} ${s.precisionMode}`).toBe(want)
      // 0.30000000000000004 typed as "0.3": at tol 0 `near` is |a − v| ≤ 0, exact equality on doubles
      // with no floor, so even a perfect reveal is marked wrong until the marker compares at 15 figures.
      expect.soft(checkAnswer(shown, f, s).verdict, `"${shown}" typed back for ${value}`).toBe('right')
    }
  })

  it('guard: marked exactly stays exact — the answer itself is right, anything a digit away is wrong', () => {
    expect(checkAnswer('2.675', field({ value: 2.675, tol: 0 })).verdict).toBe('right')
    expect(checkAnswer('2.6749', field({ value: 2.675, tol: 0 })).verdict).toBe('wrong')
    expect(checkAnswer('2.6751', field({ value: 2.675, tol: 0 })).verdict).toBe('wrong')
    expect(checkAnswer('0.30000001', field({ value: 0.1 + 0.2, tol: 0 })).verdict).toBe('wrong')
    expect(checkAnswer('12', field({ value: 12, tol: 0 })).verdict).toBe('right')
    expect(checkAnswer('10', field({ value: 12, tol: 0 })).verdict).toBe('wrong')
  })
})

// P21b: at tolerance 0 `near` (math/checkAnswer.ts) was |a − v| ≤ 0 — exact equality on doubles,
// with no floor — so the arithmetic's own last-bit noise marked a clean answer wrong: "0.3" for
// 0.1 + 0.2, and "70 cm" for a 0.7 m part (70 × 0.01 is 0.7000000000000001). The rule (wave head):
// the main comparison adds a floor of 10⁻⁹ × |value| to the stated half-width. It is relative to the
// answer's own size, never an absolute amount: physics answers are tiny in SI units, and an
// absolute 10⁻⁹ would swamp a 2 % band on 1.6×10⁻¹⁹ C and mark "0" right.
describe('P21b: a one-number answer is compared with a binary-noise floor of 10⁻⁹ × |value|, added to its stated band', () => {
  type NumberPart = Extract<PQPart, { type: 'number' }>
  const exactly = (value: number): AnswerField => field({ value, tol: 0 })
  const EXACTLY = { kind: 'absolute', value: 0 } as const
  const TWO_PERCENT = { kind: 'relative', value: 0.02 } as const
  /** A question's number part, as a teacher's file holds it — marked by questions/parts.ts checkNumberPart, as the player marks it. */
  const numberPart = (answer: string, unit: UnitId, tolerance: BandTolerance): NumberPart => ({ type: 'number', prompt: 'The answer', answer, unit, tolerance: { ...tolerance }, marks: 1 })
  const markPart = (typed: string, part: NumberPart): string => checkNumberPart(typed, part, {}, { decimals: 2, precisionMode: 'dp' }).verdict

  it('marked exactly, an answer just inside the floor is right: 1234.5 ± 0.5×10⁻⁹ × 1234.5 and 0.3 ± 0.5×10⁻⁹ × 0.3', () => {
    // Plain decimals, which parseAnswer reads to the nearest double: each offset arrives to within
    // about 10⁻¹³ of itself, far from the floor's edge at half or twice the floor.
    for (const [value, typed] of [
      [1234.5, '1234.50000061725'], // + 6.1725×10⁻⁷
      [1234.5, '1234.49999938275'], // − 6.1725×10⁻⁷
      [0.3, '0.30000000015'], // + 1.5×10⁻¹⁰
      [0.3, '0.29999999985'] // − 1.5×10⁻¹⁰
    ] as const) {
      expect.soft(checkAnswer(typed, exactly(value)).verdict, `"${typed}" for ${value}`).toBe('right')
    }
  })

  it('GUARD: marked exactly, an answer just outside the floor is not right: 1234.5 ± 2×10⁻⁹ × 1234.5 and 0.3 ± 2×10⁻⁹ × 0.3', () => {
    for (const [value, typed] of [
      [1234.5, '1234.500002469'], // + 2.469×10⁻⁶
      [1234.5, '1234.499997531'], // − 2.469×10⁻⁶
      // An absolute floor of 10⁻⁹ — or 10⁻⁹ × max(1, |v|) — would take these two.
      [0.3, '0.3000000006'], // + 6×10⁻¹⁰
      [0.3, '0.2999999994'] // − 6×10⁻¹⁰
    ] as const) {
      expect.soft(checkAnswer(typed, exactly(value)).verdict, `"${typed}" for ${value}`).not.toBe('right')
    }
  })

  it('GUARD: a stated band wider than the floor is unchanged — 5 ± 0.01 takes 5.009 and 4.991, not 5.011 or 4.989', () => {
    const f = field({ value: 5, tol: 0.01 })
    expect(['5.009', '4.991', '5.011', '4.989'].map((t) => `${t}: ${checkAnswer(t, f).verdict === 'right'}`)).toEqual(['5.009: true', '4.991: true', '5.011: false', '4.989: false'])
  })

  it('marked exactly, the arithmetic’s last-bit noise never marks a clean answer wrong: "0.3" for 0.1 + 0.2 and "1.05" for 0.35 × 3 — through checkAnswer and the number-part marker', () => {
    for (const [answer, value, typed] of [
      ['0.1 + 0.2', 0.1 + 0.2, '0.3'],
      ['0.35 * 3', 0.35 * 3, '1.05']
    ] as const) {
      // The premise: the worked-out value carries the noise (0.30000000000000004, 1.0499999999999998).
      expect(value, answer).not.toBe(Number(typed))
      expect.soft(checkAnswer(typed, exactly(value)).verdict, `"${typed}" for ${answer}, checkAnswer`).toBe('right')
      expect.soft(markPart(typed, numberPart(answer, 'none', EXACTLY)), `"${typed}" for ${answer}, number part`).toBe('right')
    }
  })

  it('"70 cm" typed for a 0.7 m number part marked exactly is right — the unit conversion, 70 × 0.01, gives 0.7000000000000001', () => {
    const part = numberPart('0.7', 'm', EXACTLY)
    expect(['0.7', '0.7 m', '70 cm'].map((t) => `${t}: ${markPart(t, part)}`).join('; ')).toBe('0.7: right; 0.7 m: right; 70 cm: right')
  })

  it('GUARD: a charge of 1.6×10⁻¹⁹ C is not swamped by the floor — "0" and "5e-19" are not right, marked exactly or at 2 %, through checkAnswer and the number-part marker', () => {
    const e = 1.6e-19
    for (const typed of ['0', '5e-19']) {
      for (const [tolerance, share] of [[EXACTLY, 0], [TWO_PERCENT, 0.02]] as const) {
        const how = `"${typed}" for 1.6e-19 C ${share === 0 ? 'marked exactly' : 'at 2 %'}`
        expect.soft(checkAnswer(typed, field({ value: e, tol: share * e })).verdict, `${how}, checkAnswer`).not.toBe('right')
        expect.soft(markPart(typed, numberPart('1.6e-19', 'C', tolerance)), `${how}, number part`).not.toBe('right')
      }
    }
  })

  it('a charge worked out as 1.6 × 10^-19 (1.6000000000000002×10⁻¹⁹) is right typed as "1.6e-19" or "1.6×10^-19", marked exactly or at 2 % — through checkAnswer and the number-part marker', () => {
    // The premise: the author's product lands a last bit off the literal, so marked exactly the
    // student's exact "1.6e-19" was about 2×10⁻³⁵ C away, and wrong.
    const worked = parseAnswer('1.6 * 1e-19')!
    expect(worked).not.toBe(1.6e-19)
    for (const typed of ['1.6e-19', '1.6×10^-19']) {
      for (const [tolerance, share] of [[EXACTLY, 0], [TWO_PERCENT, 0.02]] as const) {
        for (const [answer, value] of [['1.6e-19', 1.6e-19], ['1.6 * 10^-19', worked]] as const) {
          const how = `"${typed}" for ${answer} C ${share === 0 ? 'marked exactly' : 'at 2 %'}`
          expect.soft(checkAnswer(typed, field({ value, tol: share * value })).verdict, `${how}, checkAnswer`).toBe('right')
          expect.soft(markPart(typed, numberPart(answer, 'C', tolerance)), `${how}, number part`).toBe('right')
        }
      }
    }
  })

  it('GUARD: 5×10⁻¹⁰ marked exactly — "1.4e-9" is not right (an absolute floor of 10⁻⁹ would take it)', () => {
    expect(checkAnswer('1.4e-9', exactly(5e-10)).verdict).not.toBe('right')
    expect(markPart('1.4e-9', numberPart('5e-10', 'none', EXACTLY))).not.toBe('right')
  })
})

// EXPR (polish part P-NUM): an answer box reads the typed line through math/expr.ts preprocess. Its
// ×10 rule took one digit of the mantissa, so "12.5×10^3" read as 1 × 2.5×10³ = 2500, and its ×
// stopped at the sign of an e-number, so "2×1.6e-19" read as 2 × 1.6 × e − 19 = −10.30.
// tests/exprPrecedence.test.ts pins the reading itself.
describe('EXPR: a typed ×10 answer is read whole', () => {
  const x = (value: number, tol: number): AnswerField => ({ key: 'x', label: 'x', value, tol })

  it('"12.5×10^3" is right for 12500 at 2 %', () => {
    expect(checkAnswer('12.5×10^3', x(12500, 250)).verdict).toBe('right')
  })

  it('"12.5×10^3" is wrong for 2500 at 2 %', () => {
    expect(checkAnswer('12.5×10^3', x(2500, 50)).verdict).toBe('wrong')
  })

  it('"2×1.6e-19" is right for 3.2×10⁻¹⁹ at 2 %', () => {
    expect(checkAnswer('2×1.6e-19', x(3.2e-19, 0.02 * 3.2e-19)).verdict).toBe('right')
  })
})

// P21d: an author's answer that works out to infinity (1/(a − b) at a = b) is flagged "cannot mark"
// by the player, but nothing pinned that the marker itself never takes a typed number for it. At a
// stated width of 0.01 or 0 it never did (|5 − ∞| = ∞ is over the width, and format.ts noiseFloor
// adds nothing to an infinite answer). At 2 % the width was ∞ × 0.02 = ∞ (questions/parts.ts
// toAbsoluteTol), and |5 − ∞| ≤ ∞ + 0 marked every number typed right. Nothing typed can be "near"
// an answer that is not a number, so `near` (math/checkAnswer.ts) refuses one whatever the width.
describe('P21d: an answer that works out to infinity marks nothing right', () => {
  type NumberPart = Extract<PQPart, { type: 'number' }>
  const BANDS: [string, BandTolerance][] = [
    ['a band of 0.01', { kind: 'absolute', value: 0.01 }],
    ['a band of 0', { kind: 'absolute', value: 0 }],
    ['a band of 2 %', { kind: 'relative', value: 0.02 }]
  ]
  /** A question's number part whose answer is a formula of the question's variables, as a teacher's file holds it. */
  const numberPart = (answer: string, tolerance: BandTolerance): NumberPart => ({ type: 'number', prompt: 'The answer', answer, unit: 'none', tolerance: { ...tolerance }, marks: 1 })
  const markPart = (typed: string, part: NumberPart, values: Record<string, number>): string => checkNumberPart(typed, part, values, { decimals: 2, precisionMode: 'dp' }).verdict

  it('the premise: 1/(a − b) is ∞ at a = b = 2 and −∞ for −1/(a − b), and a real number once a is 3 — which "1" and "-1" mark right at every band', () => {
    expect(evaluateInVariables('1/(a - b)', { a: 2, b: 2 })).toBe(Infinity)
    expect(evaluateInVariables('-1/(a - b)', { a: 2, b: 2 })).toBe(-Infinity)
    for (const [how, band] of BANDS) {
      expect.soft(markPart('1', numberPart('1/(a - b)', band), { a: 3, b: 2 }), `"1" for 1/(3 − 2), ${how}`).toBe('right')
      expect.soft(markPart('-1', numberPart('-1/(a - b)', band), { a: 3, b: 2 }), `"-1" for −1/(3 − 2), ${how}`).toBe('right')
    }
  })

  it('"5" is not right for 1/(a − b) at a = b = 2 — a band of 0.01, a band of 0 and a band of 2 % — nor is "0", "-5" or "1e300", and the same for −1/(a − b)', () => {
    for (const answer of ['1/(a - b)', '-1/(a - b)']) {
      for (const [how, band] of BANDS) {
        for (const typed of ['5', '0', '-5', '1e300']) {
          expect.soft(markPart(typed, numberPart(answer, band), { a: 2, b: 2 }), `"${typed}" for ${answer} at a = b = 2, ${how}`).not.toBe('right')
        }
      }
    }
  })

  it('the same through checkAnswer: a reference of ∞ or −∞ is never near a number, with a width of 0.01, of 0, of ∞ (2 % of ∞) or of NaN', () => {
    for (const value of [Infinity, -Infinity]) {
      for (const tol of [0.01, 0, Infinity, NaN]) {
        expect.soft(checkAnswer('5', field({ value, tol })).verdict, `"5" for ${value} ± ${tol}`).not.toBe('right')
      }
    }
  })
})

// M5: checkAnswer's UNIT_TAIL, the units a student may type after a number, was a list written by
// hand (N, J, W, kg, m, s, rad, N·m, m/s and m/s^2), so a number in any other unit PhysLab knows
// was read by mathjs as a quantity and came back "unreadable": the electron's charge as
// "1.6×10^-19 C", and 50 Hz, 100 Pa, 5 V, 3 A, 20 K, 12 mol, 100 °C, 2 cm and 5 m/s². The tail is
// now made from every label in questions/units.ts. A letter that is no unit must still be left
// alone — "2x", "3 x" and "5e" (5 × Euler's number) are maths, not a unit.
describe('M5: every unit label PhysLab knows can be typed after a number', () => {
  const LABELS = Object.values(UNITS)
    .map((u) => u.label)
    .filter((label) => label !== '')
  /** The unit of every number part of every bundled question file (src/renderer/src/questions/bank/*.pqjson). */
  const bundledUnits = (): UnitId[] => {
    const dir = ['src', 'renderer', 'src', 'questions', 'bank']
    const units = new Set<UnitId>()
    for (const file of readdirSync(repoPath(...dir)).filter((f) => f.endsWith('.pqjson'))) {
      for (const q of parsePQFile(readSource([...dir, file].join('/'))).questions) {
        for (const p of q.parts) if (p.type === 'number' && p.unit !== 'none') units.add(p.unit)
      }
    }
    return [...units]
  }

  it('the premise: the bundles use units beyond the old hand list — Ω, Pa, Hz, V, A, mol, m³, rad/s, m/s² and kg·m/s among them', () => {
    const units = bundledUnits()
    expect(units.length).toBeGreaterThanOrEqual(15)
    for (const u of ['Ω', 'Pa', 'Hz', 'V', 'A', 'mol', 'm³', 'rad/s', 'm/s²', 'kg·m/s'] as UnitId[]) expect(units, u).toContain(u)
  })

  it('every unit label of every number part in the bundled question files, typed after a number, is read through checkAnswer — spaced and unspaced', () => {
    for (const unit of bundledUnits()) {
      const label = UNITS[unit].label
      for (const typed of [`50 ${label}`, `50${label}`]) {
        expect.soft(checkAnswer(typed, field({ value: 50, tol: 0.5, unit: label })).verdict, `"${typed}" for a box in ${label}`).toBe('right')
      }
    }
  })

  it('every label in UNITS, typed after a number, is stripped by parseAnswer — spaced and unspaced', () => {
    for (const label of LABELS) {
      for (const typed of [`50 ${label}`, `50${label}`]) expect.soft(parseAnswer(typed), `"${typed}"`).toBe(50)
    }
  })

  it('a unit written the way a plain keyboard writes it is stripped too — m^2, m2, m^3, m/s^2, m / s, km / h, rad / s, N · m, kg m/s, kg·m/s', () => {
    for (const unit of ['m^2', 'm2', 'm^3', 'm3', 'm/s^2', 'm/s2', 'm / s', 'km / h', 'rad / s', 'N · m', 'N m', 'Nm', 'kg m/s', 'kg·m/s', 'deg', 'degrees']) {
      expect.soft(parseAnswer(`7 ${unit}`), `"7 ${unit}"`).toBe(7)
    }
  })

  it('the electron charge as the reveal writes it, "1.6×10^-19 C", and as it is typed, "1.6e-19 C", is read as 1.6e-19 and marks right', () => {
    const charge = field({ value: 1.6e-19, tol: 0.02 * 1.6e-19, unit: 'C' })
    for (const typed of ['1.6×10^-19 C', '1.6e-19 C', '1.6E-19 C', '1.6 × 10⁻¹⁹ C', '1.6e-19C']) {
      expect.soft(parseAnswer(typed), `"${typed}" read`).toBe(1.6e-19)
      expect.soft(checkAnswer(typed, charge).verdict, `"${typed}" marked`).toBe('right')
    }
    // What the "show me" button prints for it, typed back.
    const shown = expectedText(charge, { decimals: 2, precisionMode: 'dp' })
    expect(shown).toBe('1.6×10^-19 C')
    expect(checkAnswer(shown, charge).verdict).toBe('right')
  })

  it('a degree sign sits against its number and °C reads as one unit — "100°C", "100 °C", "37°"', () => {
    expect(parseAnswer('100°C')).toBe(100)
    expect(parseAnswer('100 °C')).toBe(100)
    expect(parseAnswer('37°')).toBe(37)
    expect(checkAnswer('100 °C', field({ value: 100, tol: 1, unit: '°C' })).verdict).toBe('right')
  })

  it('GUARD: a letter that is no unit is maths, not a unit — 2x, 3 x and 5 a are unreadable and 5e is five times Euler’s number', () => {
    for (const typed of ['2x', '3 x', '5 a', '5a']) expect.soft(parseAnswer(typed), `"${typed}"`).toBeNull()
    expect(parseAnswer('5e')).toBeCloseTo(5 * Math.E, 12)
    expect(parseAnswer('2 pi')).toBeCloseTo(2 * Math.PI, 12)
    expect(parseAnswer('1.5e')).toBeCloseTo(1.5 * Math.E, 12)
  })

  it('GUARD: a lower-case v, c or k after a number is a variable, not a volt, a coulomb or a kelvin — "5 v", "5 c", "5 k" are unreadable (the labels are V, C and K)', () => {
    for (const typed of ['5 v', '5 c', '5 k', '5v', '5c', '5k']) expect.soft(parseAnswer(typed), `"${typed}"`).toBeNull()
  })

  it('GUARD: a unit alone, with no number before it, is not a number — N, C, V, A, Hz, °C, m/s²', () => {
    for (const typed of ['N', 'C', 'V', 'A', 'Hz', '°C', 'm/s²']) expect.soft(parseAnswer(typed), `"${typed}"`).toBeNull()
  })

  it('UNIT_TAIL gives the unit as it was typed in its first group, whatever its label — what questions/parts.ts quotes when it cannot read one', () => {
    expect(UNIT_TAIL.exec('50 Hz')?.[1]).toBe('Hz')
    expect(UNIT_TAIL.exec('50 km / h')?.[1]).toBe('km / h')
    expect(UNIT_TAIL.exec('3 Ω')?.[1]).toBe('Ω')
  })

  it('GUARD: UNIT_TAIL still reads the units it always read in either case, as typed, and nothing else — the sentence for "5 KG" and "5 S" quotes them (questions/parts.ts)', () => {
    expect(UNIT_TAIL.exec('50 KG')?.[1]).toBe('KG')
    expect(UNIT_TAIL.exec('50 S')?.[1]).toBe('S')
    expect(UNIT_TAIL.exec('50 units')?.[1]).toBe('units')
    expect(UNIT_TAIL.exec('7 UNITS')?.[1]).toBe('UNITS')
    expect(UNIT_TAIL.exec('37 DEGREES')?.[1]).toBe('DEGREES')
    expect(parseAnswer('37 Degrees')).toBe(37)
    expect(UNIT_TAIL.exec('5 m/s^2')?.[1]).toBe('m/s^2')
    expect(UNIT_TAIL.exec('50 x')).toBeNull()
    // exec and replace are used on it without lastIndex bookkeeping, so it must not be global or sticky.
    expect(UNIT_TAIL.global).toBe(false)
    expect(UNIT_TAIL.sticky).toBe(false)
  })
})

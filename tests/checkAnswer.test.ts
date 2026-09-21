// The answer checker: a student must never be marked wrong for a right answer, and when they are
// wrong the sentence under the box must name the mistake they actually made.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkAnswer, expectedText, isCorrect, parseAnswer } from '../src/renderer/src/math/checkAnswer'
import { getAngleMode, setAngleMode } from '../src/renderer/src/math/expr'
import { generate, type AnswerField } from '../src/renderer/src/math/problems'

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

  it('calls a near miss "close" and counts it', () => {
    const c = checkAnswer('12.9', field())
    expect(c.verdict).toBe('close')
    expect(c.message).toMatch(/rounded a little early/)
    expect(isCorrect(c)).toBe(true)
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

// G3b: the scoreboard's judge, on G2's checkers. The engine answers here are real ones (SymPy's and Giac's, recorded
// on the gating corpus); each class also gets planted wrong answers, which must be WRONG, and an answer no checker can
// prove, which must be 'unverified' — never 'right'.

import { describe, expect, it } from 'vitest'
import { exactDigits, judgeAnswer, type Mark } from './judge'
import type { EngineResult } from '../../../src/renderer/src/math/engine/types'

const text = (t: string): EngineResult => ({ latex: '', text: t, numeric: null })
const roots = (...vs: string[]): EngineResult => ({ latex: '', text: '', numeric: null, solutions: vs.map((v) => ({ x: { latex: '', text: v, numeric: null } })) })
const system = (...sols: Record<string, string>[]): EngineResult => ({
  latex: '',
  text: '',
  numeric: null,
  solutions: sols.map((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { latex: '', text: v, numeric: null }])))
})
const mark = (cls: string, question: string, answer: string, result: EngineResult): Mark => judgeAnswer({ class: cls, question, answer }, result).mark

describe('exactDigits: a long whole number is spelt as an exact sum the reader can keep', () => {
  it('splits into 15-digit pieces and leaves short numbers alone', () => {
    expect(exactDigits('2999999999999999999999960*x - 8')).toBe('(2999999999*10^15 + 999999999999960)*x - 8')
    expect(exactDigits('15000000000000000000000000*x')).toBe('(15000000000*10^15 + 0)*x')
    expect(exactDigits('123456789012345*x + 1.5')).toBe('123456789012345*x + 1.5')
  })
  it('never touches digits after a decimal point or inside a long decimal (review case)', () => {
    expect(exactDigits('1.5000000000000000000000000*x')).toBe('1.5000000000000000000000000*x')
    expect(exactDigits('0.12345678901234567890 + 1e20')).toBe('0.12345678901234567890 + 1e20')
  })
})

describe('expand', () => {
  const q = '(-(3*10^24)*x - 8) * (-5*x + 1)'
  const key = '(15*10^24)*x^2 - 2999999999999999999999960*x - 8'
  it('right: both engines’ 25-digit answer', () => {
    expect(mark('expand', q, key, text('15000000000000000000000000*x^2 - 2999999999999999999999960*x - 8'))).toBe('right')
  })
  it('wrong: one coefficient off by one in the 25th digit', () => {
    expect(mark('expand', q, key, text('15000000000000000000000000*x^2 - 2999999999999999999999961*x - 8'))).toBe('wrong')
  })
  it('wrong: like terms not combined (review case)', () => {
    expect(mark('expand', '(x + 1)^2', 'x^2 + 2*x + 1', text('x^2 + x + x + 1'))).toBe('wrong')
  })
  it('wrong: equal but not expanded', () => {
    expect(mark('expand', '(5*x - 1)^3', '125*x^3 - 75*x^2 + 15*x - 1', text('(5*x - 1)^3'))).toBe('wrong')
  })
  it('right: fractions written either way', () => {
    const fq = '(-(1/5)*x - (7/5)) * ((4/3)*x + (5/3))'
    const fk = '-(4/15)*x^2 - (11/5)*x - (7/3)'
    expect(mark('expand', fq, fk, text('-4*x^2/15 - 11*x/5 - 7/3'))).toBe('right')
    expect(mark('expand', fq, fk, text('-4/15*x^2 - 11/5*x - 7/3'))).toBe('right')
  })
})

describe('factor over Q', () => {
  it('right, with content and a repeated factor', () => {
    expect(mark('factor over Q', '48*x^3 + 232*x^2 + 371*x + 196', '(3*x + 4) * (4*x + 7)^2', text('(3*x + 4)*(4*x + 7)^2'))).toBe('right')
    expect(mark('factor over Q', '(24*10^24)*x^2 + (96*10^24)*x + (42*10^24)', '', text('6000000000000000000000000*(2*x + 1)*(2*x + 7)'))).toBe('right')
  })
  it('right: a content written as a division or with a minus in front (the first run marked these WRONG)', () => {
    // −(2x + 3)(3x − 1)/(5·10¹⁸), as both engines write it; the question is the key multiplied out.
    expect(mark('factor over Q', '(-1/(5*10^18)) * (2*x + 3) * (3*x - 1)', '(-1/(5*10^18)) * (2*x + 3) * (3*x - 1)', text('-(2*x + 3)*(3*x - 1)/5000000000000000000'))).toBe('right')
    expect(mark('factor over Q', '(-3*10^24) * (2*x - 5) * (x - 9)', '(-3*10^24) * (2*x - 5) * (x - 9)', text('-3000000000000000000000000*(x - 9)*(2*x - 5)'))).toBe('right')
    expect(mark('factor over Q', '(1*10^(-19)) * (x) * (x + 5)', '(1*10^(-19)) * (x) * (x + 5)', text('x*(x + 5)/10000000000000000000'))).toBe('right')
  })
  it('a bracket with a letter is never taken for a content: −(x + 1)/(x − 1) is not a factorisation (review case)', () => {
    expect(mark('factor over Q', '-(x+1)/(x-1)', '', text('-(x+1)/(x-1)'))).not.toBe('right')
    expect(mark('factor over Q', 'x^2 - 1', '', text('-(x+1)/(x-1)'))).not.toBe('right')
  })
  it('wrong: the same forms with a wrong content or a wrong factor', () => {
    expect(mark('factor over Q', '(-1/(5*10^18)) * (2*x + 3) * (3*x - 1)', '', text('-(2*x + 3)*(3*x - 1)/500000000000000000'))).toBe('wrong')
    expect(mark('factor over Q', '(-3*10^24) * (2*x - 5) * (x - 9)', '', text('3000000000000000000000000*(x - 9)*(2*x - 5)'))).toBe('wrong')
    expect(mark('factor over Q', '(1*10^(-19)) * (x) * (x + 5)', '', text('x*(x + 6)/10000000000000000000'))).toBe('wrong')
  })
  it('wrong: factors not primitive with a positive lead, though they multiply back (review cases)', () => {
    expect(mark('factor over Q', '2*x + 2', '2 * (x + 1)', text('-2*(-x - 1)'))).toBe('wrong')
    expect(mark('factor over Q', '6*x + 6', '6 * (x + 1)', text('2/3*(9*x + 9)'))).toBe('wrong')
    expect(mark('factor over Q', 'x^2 - 1', '', text('(x - 1)*(x + 1)'))).toBe('right')
  })
  it('right: a content and ONE bracket (the second run marked these WRONG: a lone bracket was read as a sum)', () => {
    expect(mark('factor over Q', '24*x + 42', '6 * (4*x + 7)', text('6*(4*x + 7)'))).toBe('right')
    expect(mark('factor over Q', '-18*x - 30', '-6 * (3*x + 5)', text('-6*(3*x + 5)'))).toBe('right')
    expect(mark('factor over Q', '2*x - 8', '2 * (x - 4)', text('2*(x - 4)'))).toBe('right')
  })
  it('a factor in several letters has no leading term to judge: SymPy’s −(a − b²)(x + 6) is not WRONG (G4b)', () => {
    expect(mark('factor over Q', 'x((b)^(2)-a)+6((b)^(2)-a)', '', text('-(a - b^2)*(x + 6)'))).not.toBe('wrong')
    expect(mark('factor over Q', 'x((b)^(2)-a)+6((b)^(2)-a)', '', text('-(a - b^2)*(x + 7)'))).toBe('wrong')
  })
  it('wrong: a factor that factorises further, and a wrong factor', () => {
    expect(mark('factor over Q', 'x^3 - x', '', text('x*(x^2 - 1)'))).toBe('wrong')
    expect(mark('factor over Q', 'x^2 + 9*x + 20', '', text('(x + 4)*(x + 6)'))).toBe('wrong')
  })
})

describe('polynomial equations, judged on every root (owner, G3b-1: every root is the right answer)', () => {
  const big = 'x^6 + 37*x^4 - 36*x^3 - 3557*x^2 - 2916*x + 567 = 0'
  it('right: the full list, real and complex roots, in any order', () => {
    expect(mark('polynomial equations', big, '', roots('-1', '7', '-9*i', '9*i', '-3 + sqrt(10)', '-sqrt(10) - 3'))).toBe('right')
    expect(mark('polynomial equations', 'x^3 = 1', '', roots('1', '-1/2 + sqrt(3)/2*i', '-1/2 - sqrt(3)/2*i'))).toBe('right')
  })
  it('right: a double root listed once; complex roots when there is no real one', () => {
    expect(mark('polynomial equations', '9*x^2 + 42*x + 49 = 0', '', roots('-7/3'))).toBe('right')
    expect(mark('polynomial equations', 'x^2 + 6*x + 18 = 0', '', roots('-3 + 3*i', '-3 - 3*i'))).toBe('right')
  })
  it('wrong: the real roots alone (what Giac answered before), when there are complex ones too', () => {
    expect(mark('polynomial equations', big, '', roots('-sqrt(10) - 3', '-1', 'sqrt(10) - 3', '7'))).toBe('wrong')
    expect(mark('polynomial equations', 'x^3 = 1', '', roots('1'))).toBe('wrong')
  })
  it('wrong: a real root missing, a complex root missing, a wrong complex root, a wrong surd', () => {
    expect(mark('polynomial equations', big, '', roots('-1', '7'))).toBe('wrong')
    expect(mark('polynomial equations', big, '', roots('-1', '7', '-9*i', '-3 + sqrt(10)', '-sqrt(10) - 3'))).toBe('wrong')
    expect(mark('polynomial equations', big, '', roots('-1', '7', '-9*i', '8*i', '-3 + sqrt(10)', '-sqrt(10) - 3'))).toBe('wrong')
    expect(mark('polynomial equations', 'x^2 + 24*x + 136 = 0', '', roots('-12 - 2*sqrt(3)', '-12 + 2*sqrt(3)'))).toBe('wrong')
  })
})

describe('linear systems', () => {
  const dep = '-7*x + 6*y + 4*z = -12, -5*x - 2*y - 2*z = -10, 2*x - 8*y - 6*z = 2'
  it('right: unique, a family (both spellings), none', () => {
    expect(mark('linear systems', '-6*x - 2*y = -66, -2*x - 6*y = -54', 'x = 9, y = 6', system({ x: '9', y: '6' }))).toBe('right')
    expect(mark('linear systems', dep, 'infinitely many', system({ x: '21/11 - z/11', y: '5/22 - 17*z/22' }))).toBe('right')
    expect(mark('linear systems', dep, 'infinitely many', system({ x: '-1/11*z + 21/11', y: '-17/22*z + 5/22' }))).toBe('right')
    expect(mark('linear systems', '2*x - y - 7*z = 33, x + 6*y + 3*z = -16, -5*x + 9*y + 24*z = -110', 'none', system())).toBe('right')
  })
  it('a value in e-notation is a number, and a parameter named _1 is a parameter (review cases)', () => {
    expect(mark('linear systems', 'x + y = 1000, x - y = 1000', '', system({ x: '1e3', y: '0' }))).toBe('right')
    expect(mark('linear systems', dep, '', system({ x: '21/11 - _1/11', y: '5/22 - 17*_1/22', z: '_1' }))).toBe('right')
  })
  it('a capital I is i: x² + 1 = 0 with roots I and −I', () => {
    expect(mark('polynomial equations', 'x^2 + 1 = 0', '', roots('I', '-I'))).toBe('right')
  })
  it('wrong: a value off, a family off, none for a solvable system', () => {
    expect(mark('linear systems', '-6*x - 2*y = -66, -2*x - 6*y = -54', '', system({ x: '9', y: '7' }))).toBe('wrong')
    expect(mark('linear systems', dep, '', system({ x: '21/11 - z/11', y: '5/22 - 17*z/23' }))).toBe('wrong')
    expect(mark('linear systems', '-6*x - 2*y = -66, -2*x - 6*y = -54', '', system())).toBe('wrong')
  })
})

describe('rational simplification', () => {
  const q = '(-32*x^2 - 44*x + 63)/(16*x^2 + 64*x + 63)'
  it('right, either spelling', () => {
    expect(mark('rational simplification', q, '(-8*x + 7)/(4*x + 7) ; excluded: x = -9/4', text('(7 - 8*x)/(4*x + 7)'))).toBe('right')
    expect(mark('rational simplification', q, '', text('(-8*x + 7)/(4*x + 7)'))).toBe('right')
  })
  it('wrong: not cancelled, or not equal', () => {
    expect(mark('rational simplification', q, '', text(q))).toBe('wrong')
    expect(mark('rational simplification', q, '', text('(-8*x + 7)/(4*x + 9)'))).toBe('wrong')
  })
})

describe('derivatives', () => {
  it('right: polynomial and quotient answers are proved', () => {
    expect(mark('derivatives', '(3*x^2 + 5)^3', '', text('18*x*(3*x^2 + 5)^2'))).toBe('right')
    expect(mark('derivatives', '(3*x^2 + 5)^3', '', text('162*x^5 + 540*x^3 + 450*x'))).toBe('right')
    expect(mark('derivatives', '(-3*x - 5) / (x^2 + 2*x + 5)', '', text('(3*x^2 + 10*x - 5)/(x^4 + 4*x^3 + 14*x^2 + 20*x + 25)'))).toBe('right')
  })
  it('right: a trigonometric answer is proved exactly since G2B (sin and cos as atoms)', () => {
    expect(mark('derivatives', '(-x) * cos(-x + 4)', '', text('x*sin(x - 4) - cos(x - 4)'))).toBe('right')
  })
  it('unverified: an answer that needs an identity between functions (Giac’s tan half-angle form) proves nothing', () => {
    expect(mark('derivatives', '(-x) * cos(-x + 4)', '', text('(4*x/2*tan(1/2*x - 2) + tan(1/2*x - 2)^2 - 1)/(tan(1/2*x - 2)^2 + 1)'))).toBe('unverified')
  })
  it('wrong: a sign slip, polynomial or trigonometric', () => {
    expect(mark('derivatives', '(3*x^2 + 5)^3', '', text('18*x*(3*x^2 - 5)^2'))).toBe('wrong')
    expect(mark('derivatives', '(-x) * cos(-x + 4)', '', text('x*sin(x - 4) + cos(x - 4)'))).toBe('wrong')
  })
})

describe('partial fractions', () => {
  const q = '(-270*x^4 + 285*x^3 + 1478*x^2 + 1319*x + 389)/(54*x^5 - 180*x^4 - 285*x^3 + 329*x^2 + 552*x + 180)'
  it('right: both engines’ spellings', () => {
    expect(mark('partial fractions', q, '', text('-(4*x + 1)/(2*x^2 - 6*x - 9) + (3*x + 2)^(-2) - 9/(3*x - 5)'))).toBe('right')
    expect(mark('partial fractions', q, '', text('-3/(x - 5/3) + 1/(3*x + 2)^2 + (-4*x - 1)/2/(x^2 - 3*x - 9/2)'))).toBe('right')
  })
  it('wrong: a changed numerator, and a term that is not split', () => {
    expect(mark('partial fractions', q, '', text('-(4*x + 1)/(2*x^2 - 6*x - 9) + (3*x + 2)^(-2) - 8/(3*x - 5)'))).toBe('wrong')
    expect(mark('partial fractions', '1/(x*(x+1))', '', text('1/(x^2 + x)'))).toBe('wrong')
  })
})

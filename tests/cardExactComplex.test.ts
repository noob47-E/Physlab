// The "=" card names a quadratic's complex pair the way a textbook writes it, when its coefficients are
// whole numbers or simple fractions: x² − 2x + 8 = 0 is "x = 1 ± √7 i", where the card used to say
// "x = 1 ± 2.65i". Every example goes through evaluateInput, the function the Calculator screen calls on "=".
//
// The decimal form stays where the exact form is not one a student would recognise: a rounded decimal such as
// 0.3333, pi, a stored letter, and every equation that is not a quadratic (x⁴ + 1 = 0). A quadratic with real
// roots is unchanged, and so is the decimal beside a real root (calcPass4 pins it).

import { beforeEach, describe, expect, it } from 'vitest'
import { evaluateInput } from '../src/renderer/src/calc/evaluateInput'
import { exactPairFor, exactPairText, exactQuadratic, exactQuadraticOf } from '../src/renderer/src/calc/exactComplex'
import { beyondTheReals } from '../src/renderer/src/calc/roots'
import { calcNum } from '../src/renderer/src/calc/format'
import { rat } from '../src/renderer/src/math/pure/rat'
import { resetGlobals } from './helpers/globals'

const opts = { vars: {}, ans: 0, angle: 'deg' as const }
const NONE = 'No real solution. In complex numbers: x = '

/** What the = card says for a typed line, with no refusal allowed. */
function card(line: string): string {
  const r = evaluateInput('COMP', line, opts)
  expect(r, line).not.toBeNull()
  expect(r?.error, line).toBeUndefined()
  return r?.main ?? ''
}

beforeEach(resetGlobals)

describe('the = card writes a quadratic’s complex pair exactly', () => {
  const cases: [string, string][] = [
    ['x^2-2x+8=0', `${NONE}1 ± √7 i`],
    // The owner's own example, with the leading minus: the same roots.
    ['-x^2 +2x -8 = 0', `${NONE}1 ± √7 i`],
    ['x^2+x+1=0', `${NONE}−1/2 ± (√3/2)i`],
    ['x^2+4=0', `${NONE}±2i`],
    ['x^2+1=0', `${NONE}±i`],
    ['x^2=-1', `${NONE}±i`],
    ['x^2+2=0', `${NONE}±√2 i`],
    ['2x^2+3=0', `${NONE}±(√6/2)i`],
    ['x^2+2.5x+7=0', `${NONE}−5/4 ± (√87/4)i`],
    // Whole-number pairs were already written exactly; they must stay so.
    ['x^2+4x+13=0', `${NONE}−2 ± 3i`],
    ['(x+1)^2=-4', `${NONE}−1 ± 2i`],
    // Simple decimals and fractions are exact too.
    ['0.5x^2+x+1=0', `${NONE}−1 ± i`],
    ['0.25x^2+0.5x+1=0', `${NONE}−1 ± √3 i`],
    ['x^2/2+x+1=0', `${NONE}−1 ± i`],
    // Cases the independent break-it probe checked by putting the printed roots back into the line: a negative
    // coefficient on x, a negative leading coefficient, a fraction leading coefficient, a denominator larger than the
    // whole-number part, an x on both sides, and coefficients too big to read off by eye.
    ['x^2-2.5x+7=0', `${NONE}5/4 ± (√87/4)i`],
    ['x^2/3+x+1=0', `${NONE}−3/2 ± (√3/2)i`],
    ['-0.5x^2+x-1=0', `${NONE}1 ± i`],
    ['x^2=-2x-8', `${NONE}−1 ± √7 i`],
    ['2x^2+3=x^2+1', `${NONE}±√2 i`],
    ['x^2+12=0', `${NONE}±2√3 i`],
    ['x^2-2x/7+5=0', `${NONE}1/7 ± (2√61/7)i`],
    ['0.01x^2+x+26=0', `${NONE}−50 ± 10i`],
    ['x^2+0.1x+0.1=0', `${NONE}−1/20 ± (√39/20)i`],
    ['x^2-2x+4=0', `${NONE}1 ± √3 i`],
    ['4x^2-4x+5=0', `${NONE}1/2 ± i`],
    ['1000000x^2+1000000x+1000000=0', `${NONE}−1/2 ± (√3/2)i`]
  ]
  for (const [line, want] of cases) {
    it(`${line} says ${want.slice(NONE.length)}`, () => {
      expect(card(line)).toBe(want)
    })
  }
})

describe('the decimal form stays where the exact form is not a simple one', () => {
  it('a rounded decimal coefficient (0.3333 is not a simple fraction) keeps the decimal pair', () => {
    const said = card('0.3333x^2+x+1=0')
    expect(said).toMatch(/^No real solution\. In complex numbers: x = −1\.5\d* ± \d+\.\d+i$/)
    expect(said).not.toContain('√')
  })

  it('a rounded decimal such as 1.4142 keeps the decimal pair', () => {
    const said = card('1.4142x^2+1=0')
    expect(said).toMatch(/^No real solution\. In complex numbers: x = ±0\.84\d+i$/)
    expect(said).not.toContain('√')
  })

  it('pi keeps the decimal pair', () => {
    const said = card('x^2+pi=0')
    expect(said).toMatch(/^No real solution\. In complex numbers: x = ±1\.77245\d*i$/)
    expect(said).not.toContain('√')
  })

  it('a quartic with no real root keeps its decimal pairs (only quadratics are written exactly)', () => {
    const said = card('x^4+1=0')
    expect(said.startsWith(NONE)).toBe(true)
    expect(said).toContain('.')
    expect(said).not.toContain('√')
  })
})

describe('a quadratic with real roots is unchanged', () => {
  it('x^2=4 is x₁ = 2, x₂ = −2, as the golden sweep has it', () => {
    expect(card('x^2=4')).toBe('x₁ = 2, x₂ = −2')
  })
})

describe('the exact pair is the same number as the decimal pair', () => {
  it('beyondTheReals with the exact coefficients says the exact pair; without them, the decimal pair', () => {
    const coeffs = [1, -2, 8]
    const exact = exactQuadratic('x^2-2x+8', '0')
    expect(exact).not.toBeNull()
    expect(beyondTheReals(coeffs, 0, exact)).toEqual({ sentence: `${NONE}1 ± √7 i` })
    // The decimal the Calculator showed before, still the answer for every caller that gives no exact form.
    expect(beyondTheReals(coeffs, 0)).toEqual({ sentence: `${NONE}1 ± ${calcNum(Math.sqrt(7))}i` })
  })

  it('refuses an exact pair whose coefficients are not the ones the search solved', () => {
    const exact = exactQuadratic('x^2+4', '0')
    expect(exact).not.toBeNull()
    // x² + 5 has roots ±√5 i, so the exact ±2i for x² + 4 must not be said beside it.
    expect(exactPairText(exact!, [1, 0, 5], { re: 0, im: Math.sqrt(5) })).toBeNull()
  })

  it('refuses an exact pair whose root is not the numeric one, even with the same coefficients', () => {
    const exact = exactQuadratic('x^2+4', '0')
    expect(exact).not.toBeNull()
    expect(exactPairText(exact!, [1, 0, 4], { re: 0, im: 3 })).toBeNull()
    expect(exactPairText(exact!, [1, 0, 4], { re: 0, im: 2 })).toBe('±2i')
  })

  it('reads only quadratics in x: a third power, a second letter, or a non-simple decimal gives no exact coefficients', () => {
    expect(exactQuadratic('x^3+1', '0')).toBeNull()
    expect(exactQuadratic('x^2+A', '0')).toBeNull()
    expect(exactQuadratic('x^2+0.3333', '0')).toBeNull()
    expect(exactQuadratic('x^2+1', '0')).toEqual([rat(1n), rat(0n), rat(1n)])
  })
})

describe('the bar and the Numbers screen write the same exact pair as the = card', () => {
  it('the Numbers screen reads its typed boxes exactly: whole numbers and simple decimals, but not a rounded decimal', () => {
    expect(exactQuadraticOf([1, -2, 8])).toEqual([rat(1n), rat(-2n), rat(8n)])
    expect(exactQuadraticOf([1, 2.5, 7])).toEqual([rat(1n), rat(5n, 2n), rat(7n)])
    expect(exactQuadraticOf([0.3333, 1, 1])).toBeNull()
    expect(exactQuadraticOf([1, 1])).toBeNull()
    expect(exactQuadraticOf([NaN, 1, 1])).toBeNull()
  })

  it('the Numbers screen call says the exact pair for x² − 2x + 8 = 0, as the = card does', () => {
    const c = [1, -2, 8]
    expect(beyondTheReals(c, 0, exactQuadraticOf(c))).toEqual({ sentence: `${NONE}1 ± √7 i` })
  })

  it('the Numbers screen boxes give the same exact pair for other simple coefficients', () => {
    // Checked by the break-it probe against the roots worked out independently with plain arithmetic.
    expect(beyondTheReals([1, 0, 3], 0, exactQuadraticOf([1, 0, 3]))).toEqual({ sentence: `${NONE}±√3 i` })
    expect(beyondTheReals([2, -2, 5], 0, exactQuadraticOf([2, -2, 5]))).toEqual({ sentence: `${NONE}1/2 ± (3/2)i` })
    expect(beyondTheReals([1000000, 1000000, 1000000], 0, exactQuadraticOf([1000000, 1000000, 1000000]))).toEqual({
      sentence: `${NONE}−1/2 ± (√3/2)i`
    })
  })

  it('exactPairFor writes the search’s pair exactly, and refuses one that is not the search’s', () => {
    const exact = exactQuadratic('x^2+4', '0')
    expect(exact).not.toBeNull()
    expect(exactPairFor(exact!, { re: 0, im: 2 })).toBe('±2i')
    expect(exactPairFor(exact!, { re: 0, im: 2.5 })).toBeNull()
  })
})

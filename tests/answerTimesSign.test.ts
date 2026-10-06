// How a student writes "times ten to the": an x typed for × (Q23), and the no-break spaces PhysLab
// itself writes round × (H3, math/format.ts superscriptPowers), so a shown answer pasted back reads.
import { beforeEach, describe, expect, it } from 'vitest'
import { resetGlobals } from './helpers/globals'
import { parseAnswer } from '../src/renderer/src/math/checkAnswer'
import { isReadError, readSet, readVector } from '../src/renderer/src/questions/answerText'
import { unitFromTail } from '../src/renderer/src/questions/units'

beforeEach(() => resetGlobals())

const ratio = (x: number | null, want: number): number => (x === null ? NaN : x / want)
const setOf = (text: string): number[] => {
  const r = readSet(text)
  return isReadError(r) ? [] : r
}

describe('Q23: an x typed as a times sign in a power of ten', () => {
  it('reads 3x10^8, 1.6 x 10^-19, -1.6x10^-19, 6.63x10⁻³⁴ and 2X10^3 in a number answer', () => {
    expect(ratio(parseAnswer('3x10^8'), 3e8)).toBeCloseTo(1, 12)
    expect(ratio(parseAnswer('1.6 x 10^-19'), 1.6e-19)).toBeCloseTo(1, 12)
    expect(ratio(parseAnswer('-1.6x10^-19'), -1.6e-19)).toBeCloseTo(1, 12)
    expect(ratio(parseAnswer('6.63x10⁻³⁴'), 6.63e-34)).toBeCloseTo(1, 12)
    expect(ratio(parseAnswer('2X10^3'), 2000)).toBeCloseTo(1, 12)
  })

  it('reads it in a roots answer, and still reads "x = 3"', () => {
    const got = setOf('1.6x10^-19, 2 x 10^3')
    expect(got).toHaveLength(2)
    expect(ratio(got[0], 1.6e-19)).toBeCloseTo(1, 12)
    expect(got[1]).toBeCloseTo(2000, 9)
    expect(setOf('x = 3')).toEqual([3])
  })

  it('never takes a lone x, 3x or "3 x 10" with no power for a times sign', () => {
    expect(parseAnswer('3x')).toBeNull()
    expect(parseAnswer('3 x 10')).toBeNull()
  })
})

describe('H3: the no-break spaces PhysLab writes round × read as spaces', () => {
  for (const [name, space] of [['U+00A0', ' '], ['U+202F', ' ']] as const) {
    it(`a number answer with ${name}`, () => {
      expect(ratio(parseAnswer(`6.63${space}×${space}10⁻³⁴`), 6.63e-34)).toBeCloseTo(1, 12)
      expect(ratio(parseAnswer(`6.63${space}×${space}10^-34`), 6.63e-34)).toBeCloseTo(1, 12)
    })

    it(`a roots answer and a vector answer with ${name}`, () => {
      const roots = setOf(`1.5${space}×${space}10⁻³, 2`)
      expect(roots).toHaveLength(2)
      expect(ratio(roots[0], 1.5e-3)).toBeCloseTo(1, 12)
      const v = readVector(`(3${space}×${space}10⁻³ i + 4 j)${space}N`)
      expect(isReadError(v) ? null : v.v[0]).toBeCloseTo(3e-3, 15)
      expect(isReadError(v) ? null : v.unit).toBe('N')
    })

    it(`the unit tail after ${name}`, () => {
      expect(unitFromTail(`6.63${space}×${space}10⁻³⁴${space}J`).unit).toBe('J')
    })
  }
})

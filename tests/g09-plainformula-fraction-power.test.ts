// T7 proof for audit bug 9 [C3]: "Fractional powers leak raw caret into student display
// (questions/plainFormula.ts:44)".
//
// Verdict REAL, with the detail corrected: whole-number powers are raised for any number of digits
// ("x^12" → "x¹²"), so the claim "only single-digit integer exponents" is wrong. What is not
// raised is a fractional power: the fallback at line 44 writes `${base}^${exp}` and a picture note
// or condition sentence a student reads shows "x^(1 / 2)".
import { describe, expect, it } from 'vitest'
import { plainFormula } from '../src/renderer/src/questions/plainFormula'

describe('G9: a fractional power leaks a caret into a sentence a student reads', () => {
  it('x^(1/2) is written without a caret', () => {
    expect(plainFormula('x^(1/2)')).not.toContain('^')
  })

  it('x^(2/3) is written without a caret', () => {
    expect(plainFormula('x^(2/3)')).not.toContain('^')
  })

  it('whole-number powers already read well, of any length', () => {
    expect(plainFormula('x^2')).toBe('x²')
    expect(plainFormula('x^12')).toBe('x¹²')
    expect(plainFormula('x^-2')).toContain('⁻²')
  })
})

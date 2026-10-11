// T7 proof for audit bug 12 [C3]: "Disproportionate uncertainty examples in error hints
// (questions/answerText.ts:442)".
//
// Verdict REAL, with the repro corrected: `lastDigit` reads the digits after the decimal point of
// the text, so a value written in e-notation gets an uncertainty from the mantissa's last place.
// Measured today:
//   readStated('1.5e3')  → "Give your uncertainty too, like 1.5e3 ± 0.1."   (the place is 100)
//   readStated('1.6e-19')→ "…± 0.1."                                        (the place is 10⁻²⁰)
// A student's hint hands them an uncertainty a million million times too large.
import { describe, expect, it } from 'vitest'
import { readStated } from '../src/renderer/src/questions/answerText'

const errorOf = (t: string): string => (readStated(t) as { error?: string }).error ?? ''

describe('G12: the "give your uncertainty" hint is wrong in e-notation', () => {
  it('1.5e3 is shown a last place of 100, not 0.1', () => {
    expect(errorOf('1.5e3')).not.toContain('± 0.1')
  })

  it('1.6e-19 is shown a last place of 10⁻²⁰, not 0.1', () => {
    expect(errorOf('1.6e-19')).not.toContain('± 0.1')
  })

  it('plain decimals keep the hint they had', () => {
    expect(errorOf('12')).toContain('± 1')
    expect(errorOf('0.5591')).toContain('± 0.0001')
  })
})

// T7 proof for audit bug 11 [C3]: "Normalized error (Eₙ) slack allows invalid answer acceptance
// (questions/answerKinds.ts:134)".
//
// Verdict REAL, and worse than the audit's own repro (Eₙ = 1.05). `enTest` (line 74) adds a slack
// of 4·EPSILON·max(|x|, |xref|) — an ABSOLUTE term in the value's size, not in `both` — so when the
// two uncertainties are far smaller than the values, the slack can be hundreds of times the whole
// allowance: the check marks Eₙ ≫ 1 right and the sentence at line 134 then says "1 or less agrees".
import { describe, expect, it } from 'vitest'
import { enTest } from '../src/renderer/src/questions/answerKinds'

describe('G11: the Eₙ slack is absolute, so Eₙ ≫ 1 can be called "1 or less"', () => {
  it('a gap 354 allowance-widths wide is not agreement', () => {
    // x = 10⁶ with 10⁻¹² uncertainties: both = 1.41×10⁻¹², gap = 5×10⁻¹⁰, Eₙ = 354.
    const r = enTest(1e6, 1e-12, 1e6 + 5e-10, 1e-12)
    expect(r.en).toBeGreaterThan(1)
    expect(r.ok).toBe(false)
  })

  it('an ordinary 1.05-standard-uncertainty gap is still wrong (the audit’s repro)', () => {
    expect(enTest(100, 1, 101.05, 0).ok).toBe(false)
  })

  it('a gap inside the two uncertainties still agrees (nothing is tightened)', () => {
    expect(enTest(100, 1, 100.5, 1)).toEqual({ en: 0.35355339059327373, ok: true })
  })
})

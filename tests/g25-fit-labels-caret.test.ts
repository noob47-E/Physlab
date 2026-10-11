// T7 proof for audit bug 25 [C8]: "Fit labels leak raw caret in regression models (lab/fit.ts:245)".
//
// Verdict REAL (the cited line is a comment; the labels are lab/types.ts:21-28 and the calculator's
// own <option> texts in panels/calcModes.tsx:333, 335). A student choosing an exponential or power
// fit reads "y = a e^(bx)" and "y = a x^b" — the caret rule 2 keeps off the screen — while the
// quadratic label in the same list uses a raised ².
import { describe, expect, it } from 'vitest'
import { FIT_LABELS } from '../src/renderer/src/lab/types'

describe('G25: two fit labels carry a programming caret', () => {
  it('the exponential label is not written with a caret', () => {
    expect(FIT_LABELS.exp).not.toContain('^')
  })

  it('the power label is not written with a caret', () => {
    expect(FIT_LABELS.power).not.toContain('^')
  })

  it('the raised form is what the other labels already use', () => {
    expect(FIT_LABELS.quadratic).toContain('²')
    expect(FIT_LABELS.linear).not.toContain('^')
    expect(FIT_LABELS.inverse).not.toContain('^')
  })
})

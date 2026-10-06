import { describe, expect, it } from 'vitest'
import { readVector } from '../src/renderer/src/questions/answerText'
import { unitFromTail } from '../src/renderer/src/questions/units'

describe('Q4: a vector term after a plus can be negative', () => {
  it('reads plus followed by a minus as a negative component', () => {
    expect(readVector('3i + -4j')).toEqual({ v: [3, -4], unit: null })
    expect(readVector('3i+-4j')).toEqual({ v: [3, -4], unit: null })
    expect(readVector('3i + −4j')).toEqual({ v: [3, -4], unit: null })
  })

  it('reads minus minus as a positive component', () => {
    expect(readVector('3i - -4j')).toEqual({ v: [3, 4], unit: null })
  })
})

describe('Q5: vector unit and superscript power tails', () => {
  it('reads a vector unit immediately after angle or square brackets', () => {
    expect(readVector('<3, 4>N')).toEqual({ v: [3, 4], unit: 'N' })
    expect(readVector('[3, 4]N')).toEqual({ v: [3, 4], unit: 'N' })
    expect(readVector('⟨3, 4⟩N')).toEqual({ v: [3, 4], unit: 'N' })
  })

  it('reads a unit after a superscript power of ten with no space', () => {
    expect(unitFromTail('(6.6261 ± 0.0012)×10⁻³⁴J')).toEqual({
      value: '(6.6261 ± 0.0012)×10⁻³⁴',
      unit: 'J'
    })
  })
})

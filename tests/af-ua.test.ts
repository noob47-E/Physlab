import { describe, expect, it } from 'vitest'
import { hcfWorking, lcmWorking } from '../src/renderer/src/math/pure/integers'
import { rFromNumber, rStr } from '../src/renderer/src/math/pure/rat'
import { runPure } from '../src/renderer/src/math/pure/run'

describe('U1 HCF/LCM refuse a number too big to split completely', () => {
  it('refuses a HCF instead of claiming a composite is prime', { timeout: 4000 }, () => {
    const w = hcfWorking([100000980001501n, 10000019n])
    expect(w.error).toMatch(/too large for me to split all the way down|Some of these numbers are too large/)
    expect(w.answers).toEqual([])
  })

  it('refuses a LCM instead of giving a guessed table answer', { timeout: 4000 }, () => {
    const w = lcmWorking([100000980001501n, 10000019n])
    expect(w.error).toMatch(/too large for me to split all the way down|Some of these numbers are too large/)
    expect(w.answers).toEqual([])
  })
})

describe('U2 rFromNumber reads large written integers exactly', () => {
  it('reads exponent-integer notation as the decimal it was written as', () => {
    expect(rStr(rFromNumber(6.02e23))).toBe('602000000000000000000000')
    expect(rStr(rFromNumber(1e23))).toBe('100000000000000000000000')
  })

  it('still reads ordinary decimals exactly', () => {
    expect(rStr(rFromNumber(0.15))).toBe('3/20')
    expect(rStr(rFromNumber(2.5))).toBe('5/2')
  })
})

describe('U2 follow-up: a typed number longer than a double holds is refused, never rounded', () => {
  it('Factorise 12345678901234567890x + 12345678901234567890 refuses in words instead of a wrong tick', () => {
    const w = runPure('factor', '12345678901234567890x + 12345678901234567890')
    expect(w.error).toMatch(/15 significant figures/)
    expect(w.answers).toEqual([])
  })

  it('15 digits, and long runs of zeros, still work exactly', () => {
    expect(runPure('factor', '123456789012345x + 123456789012345').answers[0].tex).toContain('123456789012345')
    expect(runPure('expand', '100000000000000000000x').answers[0].tex).toBe('100000000000000000000x')
    expect(runPure('expand', '0.000000000000000001x').error).toBeUndefined()
  })
})

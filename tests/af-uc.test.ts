import { describe, it, expect } from 'vitest'
import { divideWorking } from '../src/renderer/src/math/pure/divide'

describe('P-FIX-PURE U4: long division step limit', () => {
  it('finishes (x^66 - 1)/(x - 1) correctly without early truncation', () => {
    const result = divideWorking('(x^66 - 1)/(x - 1)')
    expect(result.answers).toBeDefined()
    expect(result.answers).toHaveLength(2) // quotient and remainder, no "Altogether"
    expect(result.answers[0].label).toBe('Quotient')
    expect(result.answers[1].label).toBe('Remainder')
    expect(result.answers[1].tex).toBe('0')
    expect(result.answers[0].tex).toContain('+ x + 1')
    expect(result.answers[0].tex).toMatch(/^x\^/)
    expect(result.checked).toBe('ok')
  })

  it('a division that finishes on the last allowed step is answered, not refused', () => {
    const result = divideWorking('(x^201 - 1)/(x - 1)')
    expect(result.error).toBeUndefined()
    expect(result.answers[1].tex).toBe('0')
    expect(result.checked).toBe('ok')
  })

  it('refuses a division that would need more than 200 steps', () => {
    const result = divideWorking('(x^250 - 1)/(x - 1)')
    expect(result.error).toBeTruthy()
    expect(result.error).toContain('too many steps')
  })
})

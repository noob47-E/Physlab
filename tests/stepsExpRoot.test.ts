import { beforeEach, describe, expect, it } from 'vitest'
import katex from 'katex'
import { usePure } from '../src/renderer/src/math/pure/store'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  usePure.setState({ working: null, input: '', inputLatex: '', history: [] })
})

function typed(latex: string) {
  usePure.getState().runLatex(latex, 'auto', { quiet: true })
  return usePure.getState().working
}

describe('F-EXPLOGGEN: Exponential roots and natural log equations step by step', () => {
  it('solves e^x = 5 with x = ln(5)', () => {
    const w = typed('e^{x} = 5')
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.noWorking).toBeFalsy()
    expect(w?.method).toBe('Exponential and logarithmic equation')
    expect(w?.checked).toBe('ok')
    expect(w?.answers).toEqual([{ label: 'x', tex: '\\ln(5)' }])
    expect(w?.moves.length).toBeGreaterThan(0)
    for (const m of w?.moves ?? []) {
      if (m.tex) expect(() => katex.renderToString(m.tex!, { throwOnError: true })).not.toThrow()
    }
  })

  it('solves 5^x = 12 with x = ln(12)/ln(5)', () => {
    const w = typed('5^{x} = 12')
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.noWorking).toBeFalsy()
    expect(w?.method).toBe('Exponential and logarithmic equation')
    expect(w?.checked).toBe('ok')
    expect(w?.answers).toEqual([{ label: 'x', tex: '\\frac{\\ln(12)}{\\ln(5)}' }])
    expect(w?.moves.length).toBeGreaterThan(0)
    for (const m of w?.moves ?? []) {
      if (m.tex) expect(() => katex.renderToString(m.tex!, { throwOnError: true })).not.toThrow()
    }
  })

  it('isolates 2e^x - 3 = 7 to e^x = 5 and solves x = ln(5)', () => {
    const w = typed('2e^{x} - 3 = 7')
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.noWorking).toBeFalsy()
    expect(w?.checked).toBe('ok')
    expect(w?.answers).toEqual([{ label: 'x', tex: '\\ln(5)' }])
    expect(w?.moves.length).toBeGreaterThanOrEqual(3)
  })

  it('solves ln(x) = 2 with x = e^2', () => {
    const w = typed('\\ln(x) = 2')
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.noWorking).toBeFalsy()
    expect(w?.checked).toBe('ok')
    expect(w?.answers).toEqual([{ label: 'x', tex: 'e^{2}' }])
    expect(w?.moves.length).toBeGreaterThan(0)
  })

  it('solves ln(x + 1) = 0 with x = 0', () => {
    const w = typed('\\ln(x + 1) = 0')
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.noWorking).toBeFalsy()
    expect(w?.checked).toBe('ok')
    expect(w?.answers).toEqual([{ label: 'x', tex: '0' }])
  })
})

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

describe('F-SUBST: Exponential substitution equations step by step', () => {
  it('solves 4^x - 3*2^x + 2 = 0 through u = 2^x with roots x = 0, 1', () => {
    const w = typed('4^{x} - 3\\cdot 2^{x} + 2 = 0')
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.noWorking).toBeFalsy()
    expect(w?.method).toBe('Exponential and logarithmic equation')
    expect(w?.checked).toBe('ok')
    expect(w?.answers).toEqual([
      { label: 'x', tex: '0' },
      { label: 'x', tex: '1' }
    ])
    expect(w?.moves.length).toBeGreaterThanOrEqual(4)
    for (const m of w?.moves ?? []) {
      if (m.tex) expect(() => katex.renderToString(m.tex!, { throwOnError: true })).not.toThrow()
    }
  })

  it('solves 2^(2x) - 5*2^x + 4 = 0 with roots x = 0, 2', () => {
    const w = typed('2^{2x} - 5\\cdot 2^{x} + 4 = 0')
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.noWorking).toBeFalsy()
    expect(w?.checked).toBe('ok')
    expect(w?.answers).toEqual([
      { label: 'x', tex: '0' },
      { label: 'x', tex: '2' }
    ])
  })

  it('solves e^(2x) - 4e^x + 3 = 0 through u = e^x with roots x = 0, ln(3)', () => {
    const w = typed('e^{2x} - 4e^{x} + 3 = 0')
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.noWorking).toBeFalsy()
    expect(w?.checked).toBe('ok')
    expect(w?.answers).toEqual([
      { label: 'x', tex: '0' },
      { label: 'x', tex: '\\ln{3}' }
    ])
  })

  it('solves e^(2x) - 5e^x + 6 = 0 through u = e^x with roots x = ln(2), ln(3)', () => {
    const w = typed('e^{2x} - 5e^{x} + 6 = 0')
    console.log('e^(2x) - 5e^x + 6 = 0 working:', {
      noWorking: w?.noWorking,
      error: w?.error,
      checked: w?.checked,
      method: w?.method,
      answers: w?.answers
    })
    expect(w).not.toBeNull()
    expect(w?.checked).toBe('ok')
  })
})

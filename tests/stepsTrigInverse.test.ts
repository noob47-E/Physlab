import { beforeEach, describe, expect, it } from 'vitest'
import katex from 'katex'
import { usePure } from '../src/renderer/src/math/pure/store'
import { scene } from '../src/renderer/src/core/store'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  usePure.setState({ working: null, input: '', inputLatex: '', history: [] })
  scene().setSettings({ angleUnit: 'deg' })
})

function typed(latex: string) {
  usePure.getState().runLatex(latex, 'auto', { quiet: true })
  return usePure.getState().working
}

describe('F-TRIGGEN: Inverse trigonometric equations step by step', () => {
  it('solves 3sin(x) = 2 in DEG with 41.81 and 138.19', () => {
    scene().setSettings({ angleUnit: 'deg' })
    const w = typed('3\\sin(x) = 2')
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.noWorking).toBeFalsy()
    expect(w?.checked).toBe('ok')
    expect(w?.answers.map((a) => a.tex)).toEqual(['41.81', '138.19'])
    for (const m of w?.moves ?? []) {
      if (m.tex) expect(() => katex.renderToString(m.tex!, { throwOnError: true })).not.toThrow()
    }
  })

  it('solves 3sin(x) = 2 in RAD with 0.7297 and 2.4119', () => {
    scene().setSettings({ angleUnit: 'rad' })
    const w = typed('3\\sin(x) = 2')
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.noWorking).toBeFalsy()
    expect(w?.checked).toBe('ok')
    expect(w?.answers.map((a) => a.tex)).toEqual(['0.7297', '2.4119'])
  })

  it('solves 5cos(x) = 2 in DEG with 66.42 and 293.58', () => {
    scene().setSettings({ angleUnit: 'deg' })
    const w = typed('5\\cos(x) = 2')
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.noWorking).toBeFalsy()
    expect(w?.checked).toBe('ok')
    expect(w?.answers.map((a) => a.tex)).toEqual(['66.42', '293.58'])
  })

  it('solves tan(x) = 3 in DEG with 71.57 and 251.57', () => {
    scene().setSettings({ angleUnit: 'deg' })
    const w = typed('\\tan(x) = 3')
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.noWorking).toBeFalsy()
    expect(w?.checked).toBe('ok')
    expect(w?.answers.map((a) => a.tex)).toEqual(['71.57', '251.57'])
  })

  it('solves 4sin(x) + 1 = 0 in DEG with 194.48 and 345.52', () => {
    scene().setSettings({ angleUnit: 'deg' })
    const w = typed('4\\sin(x) + 1 = 0')
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.noWorking).toBeFalsy()
    expect(w?.checked).toBe('ok')
    expect(w?.answers.map((a) => a.tex)).toEqual(['194.48', '345.52'])
  })

  it('solves sin(x) = 0.3 in DEG with 17.46 and 162.54', () => {
    scene().setSettings({ angleUnit: 'deg' })
    const w = typed('\\sin(x) = 0.3')
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.noWorking).toBeFalsy()
    expect(w?.checked).toBe('ok')
    expect(w?.answers.map((a) => a.tex)).toEqual(['17.46', '162.54'])
  })
})

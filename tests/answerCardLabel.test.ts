// The Calculator's answer card when "=" cannot answer a line and the step working does (calc/working.ts reconcile).
//
// Fix 1: a single answer keeps its label on the card, so 2t + 4 = 10 reads "t = 3", not a bare "3" that a student
// cannot tell from a number they typed. Several answers already carried their labels.
// Fix 2: a zero term written against a letter (0x) is 0, not the start of a hex number, so the working reads
// x² + 0x − 4 = 0 and 0x + 3 = 3 instead of refusing them with "I could not read that".

import { beforeEach, describe, expect, it } from 'vitest'
import { usePure } from '../src/renderer/src/math/pure/store'
import { reconcile } from '../src/renderer/src/calc/working'
import { evaluateInput } from '../src/renderer/src/calc/evaluateInput'
import { resetGlobals } from './helpers/globals'

const COMP = { vars: {}, ans: 0, angle: 'deg' } as const

beforeEach(() => {
  resetGlobals()
  usePure.setState({ working: null, input: '', inputLatex: '', history: [] })
})

describe('Fix 1: a single answer keeps its label on the answer card', () => {
  it('2t + 4 = 10 reads "t = 3" on the card when "=" refuses the line', () => {
    usePure.getState().runLatex('2t+4=10', 'auto', { quiet: true })
    const w = usePure.getState().working
    expect(w?.error).toBeUndefined()
    expect(w?.answers.map((a) => a.tex)).toEqual(['3'])
    expect(w?.checked).toBe('ok')

    // "=" refuses this line (it wants Numbers mode), so the card is the working's answer.
    const card = evaluateInput('COMP', '2t+4=10', COMP)!
    expect(card.error).toBeDefined()
    const r = reconcile(card, w)
    expect(r.verdict).toBe('unchecked')
    expect(r.result.main).toContain('t = 3')
    expect(r.result.main).not.toBe('3')
  })

  it('a single answer with a word for its label stays a bare answer', () => {
    // A word label ("Answer") is not a symbol, so there is nothing to show before the value.
    const working = {
      title: 'Simplify',
      input: '2t+4=10',
      moves: [],
      answers: [{ label: 'Answer', tex: '3' }],
      checked: 'ok' as const
    }
    const card = evaluateInput('COMP', '2t+4=10', COMP)!
    const r = reconcile(card, working)
    expect(r.result.main).toBe('3')
  })

  it('x + y = 3, 2x - y = 0 still reads "x = 1" and "y = 2" on the card', () => {
    usePure.getState().runLatex('x + y = 3, 2x - y = 0', 'auto', { quiet: true })
    const w = usePure.getState().working
    const card = evaluateInput('COMP', 'x + y = 3, 2x - y = 0', COMP)!
    const r = reconcile(card, w)
    expect(r.result.main).toContain('x = 1')
    expect(r.result.main).toContain('y = 2')
  })
})

describe('Fix 2: a zero term written with a letter reads as 0', () => {
  it('x^2 + 0x - 4 = 0 gives the answers -2 and 2, checked', () => {
    usePure.getState().runLatex('x^2+0x-4=0', 'auto', { quiet: true })
    const w = usePure.getState().working
    expect(w?.error).toBeUndefined()
    expect(w?.answers.map((a) => a.tex)).toEqual(['-2', '2'])
    expect(w?.checked).toBe('ok')
  })

  it('x^2 + 0x - 4 = 0 puts -2 and 2 on the card', () => {
    usePure.getState().runLatex('x^2+0x-4=0', 'auto', { quiet: true })
    const w = usePure.getState().working
    const card = evaluateInput('COMP', 'x^2+0x-4=0', COMP)!
    const r = reconcile(card, w)
    expect(r.result.main).toContain('x = -2')
    expect(r.result.main).toContain('x = 2')
  })

  it('0x + 3 = 3 says every value of x works, as x - x + 3 = 3 does', () => {
    usePure.getState().runLatex('0x+3=3', 'auto', { quiet: true })
    const w = usePure.getState().working
    expect(w).not.toBeNull()
    expect(w?.error).toMatch(/every value of x works/)

    usePure.getState().runLatex('x-x+3=3', 'auto', { quiet: true })
    expect(usePure.getState().working?.error).toMatch(/every value of x works/)
  })

  it('0x + 3 = 5 says no value of x works', () => {
    usePure.getState().runLatex('0x+3=5', 'auto', { quiet: true })
    expect(usePure.getState().working?.error).toMatch(/no value of x works/)
  })

  it('a line with no letter at all is still refused for want of one', () => {
    usePure.getState().runLatex('3=3', 'auto', { quiet: true })
    expect(usePure.getState().working?.error).toMatch(/found none/)
  })
})

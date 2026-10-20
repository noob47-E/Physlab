// The "=" card and the working under it must agree on the roots of an exponential or logarithmic equation.
//
// The numeric search finds one root, so a card built from it alone said "x = −10" beside a checked working that listed x = −10 and
// x = 10 (calc/working.ts). A card the working confirms now shows every real root the working lists, each exact where it is one.

import { beforeEach, describe, expect, it } from 'vitest'
import { usePure } from '../src/renderer/src/math/pure/store'
import { reconcile } from '../src/renderer/src/calc/working'
import { evaluateInput, type EvalResult } from '../src/renderer/src/calc/evaluateInput'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  usePure.setState({ working: null, input: '', inputLatex: '', history: [] })
})

/** The working the panel shows for a typed line, and the "=" card the calculator gives the same line. */
function workingAndCard(latex: string) {
  usePure.getState().runLatex(latex, 'auto', { quiet: true })
  const working = usePure.getState().working
  const card = evaluateInput('COMP', latex, { vars: {}, ans: 0, angle: 'deg' })
  if (!card) throw new Error(`no card for ${latex}`)
  return { working, card }
}

describe('S3 fix: the "=" card lists every root the checked working lists', () => {
  it('log(x^2) = 2 shows both x = −10 and x = 10, not only the one root the search found', () => {
    const { working, card } = workingAndCard('\\log(x^{2})=2')
    expect(working?.checked).toBe('ok')
    expect(working?.answers.map((a) => a.tex)).toEqual(['-10', '10'])
    const r = reconcile(card, working)
    expect(r.verdict).toBe('agree')
    expect(r.result.roots).toEqual([-10, 10])
    // The working's own answers as plain text (texToPlain writes a hyphen); the card's tex is what the screen typesets.
    expect(r.result.main).toBe('x = -10, x = 10')
    expect(r.result.unconfirmed).toBeFalsy()
  })

  it('log_{2}(x^4 - 5x^2 + 5) = 0 shows all four roots the working checks', () => {
    const { working, card } = workingAndCard('\\log_{2}(x^{4}-5x^{2}+5)=0')
    expect(working?.checked).toBe('ok')
    const r = reconcile(card, working)
    expect(r.verdict).toBe('agree')
    expect(r.result.roots?.slice().sort((a, b) => a - b)).toEqual([-2, -1, 1, 2])
    expect(r.result.main).toBe('x = -2, x = -1, x = 1, x = 2')
  })

  it('log_{2}(x^2 - 4) = 0 shows its two roots exactly, as the working writes them, not as decimals only', () => {
    const { working, card } = workingAndCard('\\log_{2}(x^{2}-4)=0')
    expect(working?.checked).toBe('ok')
    const r = reconcile(card, working)
    expect(r.verdict).toBe('agree')
    expect(r.result.roots).toHaveLength(2)
    expect(r.result.tex).toContain('\\sqrt{5}')
  })

  it('a double root shows as x = −1, the working exact answer, not the search number −0.9999999987, and is not called approximate', () => {
    const { working, card } = workingAndCard('\\log(x^{2}+2x+2)=0')
    // The search alone flags its number as approximate; the working checks the exact root, so the card drops the flag.
    expect(card.approximate).toBe(true)
    expect(working?.checked).toBe('ok')
    const r = reconcile(card, working)
    expect(r.verdict).toBe('agree')
    expect(r.result.main).toBe('x = -1')
    expect(r.result.approximate).toBeFalsy()
  })

  it('a single root the card and working agree on is shown as before: log(x) = 2 gives x = 100', () => {
    const { working, card } = workingAndCard('\\log(x)=2')
    const r = reconcile(card, working)
    expect(r.verdict).toBe('agree')
    expect(r.result.main).toBe('x = 100')
  })

  it('a card root the working does not list still differs, and the working is not put on the card as final', () => {
    const { working } = workingAndCard('\\log(x^{2})=2')
    const card: EvalResult = { main: 'x = 5', src: 'log(x^(2))=2', roots: [5], rootsComplete: false, exact: null, solved: true }
    const r = reconcile(card, working)
    expect(r.verdict).toBe('differ')
    expect(r.result.unconfirmed).toBe(true)
  })

  it('a working whose check did not pass is not put on the card: the card keeps its own single root', () => {
    const { working, card } = workingAndCard('\\log(x^{2})=2')
    const unchecked = working ? { ...working, checked: 'failed' as const } : null
    const r = reconcile(card, unchecked)
    expect(r.result.roots).toEqual([-10])
    expect(r.result.main).toBe('x = −10')
  })
})

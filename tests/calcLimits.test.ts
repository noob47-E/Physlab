// Limits in the Calculator: \lim_{x\to a} f, read by the Maths field, answered on the "=" card, and worked
// out step by step in Work it out. Every answer is compared with the function's own values next to the point
// before it is shown, so the tests below also check that a wrong claim is refused, not only that the right one
// is accepted.
//
// Not tests/limits.test.ts: that file already tests the Sandbox's sim/limits and must not be overwritten.

import { beforeEach, describe, expect, it } from 'vitest'
import { evaluateInput } from '../src/renderer/src/calc/evaluateInput'
import { reconcile } from '../src/renderer/src/calc/working'
import { latexToMath } from '../src/renderer/src/math/latexToMath'
import { limitCall } from '../src/renderer/src/math/limitCall'
import { checkClaim } from '../src/renderer/src/math/pure/limitWorking'
import { usePure } from '../src/renderer/src/math/pure/store'
import { resetGlobals } from './helpers/globals'

beforeEach(() => resetGlobals())

const OPTS = { vars: {}, ans: 0, angle: 'deg' as const }
const card = (latex: string) => evaluateInput('COMP', latex, OPTS)

/** Work it out for a typed limit, as the Maths screen does it after "=" (quietly, no second opinion). */
function workingFor(latex: string) {
  usePure.getState().runLatex(latex, 'auto', { quiet: true })
  const w = usePure.getState().working
  if (!w) throw new Error(`no working for ${latex}`)
  return w
}

const headsOf = (w: { moves: { head: string }[] }): string => w.moves.map((m) => m.head).join('\n')

describe('the converter reads \\lim as the limit of an expression at a point', () => {
  it('takes the variable and the point, with the expression it applies to', () => {
    const lim = limitCall(latexToMath(String.raw`\lim_{x\to 1}\frac{x^2-1}{x-1}`))
    expect(lim).toMatchObject({ variable: 'x', point: 1, side: 0 })
    expect(lim?.body).toBeTruthy()
  })

  it('reads a one-sided approach from above and from below', () => {
    expect(limitCall(latexToMath(String.raw`\lim_{x\to0^+}\frac{1}{x}`))).toMatchObject({ point: 0, side: 1 })
    expect(limitCall(latexToMath(String.raw`\lim_{x\to0^-}\frac{1}{x}`))).toMatchObject({ point: 0, side: -1 })
    expect(limitCall(latexToMath(String.raw`\lim_{x\to0^{+}}\frac{1}{x}`))).toMatchObject({ point: 0, side: 1 })
  })

  it('reads infinity at either end of the number line', () => {
    expect(limitCall(latexToMath(String.raw`\lim_{x\to\infty}\frac{3x^2+1}{x^2-5}`))).toMatchObject({ point: Infinity })
    expect(limitCall(latexToMath(String.raw`\lim_{x\to-\infty}\frac{1}{x}`))).toMatchObject({ point: -Infinity })
  })

  it('keeps the "= value" after the limit as the claim the line makes', () => {
    expect(limitCall(latexToMath(String.raw`\lim_{x\to2}(3x+1)=7`))).toMatchObject({ point: 2, claimed: '7' })
  })

  it('leaves a \\lim with no subscript as it always was', () => {
    expect(latexToMath('\\lim')).toBe('lim')
    expect(limitCall('lim')).toBeNull()
  })
})

describe('the "=" card gives the limit', () => {
  it('gives an exact whole value', () => {
    const r = card(String.raw`\lim_{x\to 1}\frac{x^2-1}{x-1}`)
    expect(r?.error).toBeUndefined()
    expect(r?.main).toBe('2')
    expect(r?.value).toBe(2)
  })

  it('answers a limit that is only the value of a continuous function', () => {
    expect(card(String.raw`\lim_{x\to2}(3x+1)`)?.main).toBe('7')
  })

  it('says true when the line claims the limit it has', () => {
    const r = card(String.raw`\lim_{x\to2}(3x+1)=7`)
    expect(r?.main).toBe('7')
    expect(r?.extra?.join(' ')).toMatch(/true/)
  })

  it('says false when the line claims a different limit', () => {
    expect(card(String.raw`\lim_{x\to2}(3x+1)=8`)?.extra?.join(' ')).toMatch(/false/)
  })

  it('handles 0/0 by cancelling a common factor', () => {
    expect(card(String.raw`\lim_{x\to3}\frac{x^2-9}{x-3}=6`)?.value).toBe(6)
  })

  it('handles the standard limits sin x / x and sin 3x / x', () => {
    expect(card(String.raw`\lim_{x\to0}\frac{\sin x}{x}=1`)?.value).toBe(1)
    expect(card(String.raw`\lim_{x\to0}\frac{\sin 3x}{x}=3`)?.value).toBe(3)
  })

  it("handles e^x - 1 over x by L'Hopital", () => {
    expect(card(String.raw`\lim_{x\to0}\frac{e^x-1}{x}=1`)?.value).toBe(1)
  })

  it('handles a limit at infinity of a rational function', () => {
    expect(card(String.raw`\lim_{x\to\infty}\frac{3x^2+1}{x^2-5}=3`)?.value).toBe(3)
  })

  it('says in a sentence that a limit which does not exist does not exist', () => {
    const r = card(String.raw`\lim_{x\to0}\frac{1}{x}`)
    expect(r?.error).toBeUndefined()
    expect(r?.main).toMatch(/does not exist/)
  })

  it('gives infinity from one side where the values grow without bound', () => {
    const r = card(String.raw`\lim_{x\to0^+}\frac{1}{x}=\infty`)
    expect(r?.main).toBe('∞')
    expect(r?.extra?.join(' ')).toMatch(/true/)
  })

  it('says a function with a jump has no limit', () => {
    const r = card(String.raw`\lim_{x\to0}\frac{|x|}{x}`)
    expect(r?.error).toBeUndefined()
    expect(r?.main).toMatch(/does not exist/)
  })

  it('gives a decimal for a limit that no rule works out but whose values settle', () => {
    const r = card(String.raw`\lim_{x\to0}\frac{\ln(1+x)}{x}`)
    expect(r?.error).toBeUndefined()
    expect(r?.main).toBe('1')
  })

  it('gives a sentence, not a number, for a limit whose values do not settle', () => {
    const r = card(String.raw`\lim_{x\to0}\sin\frac{1}{x}`)
    expect(r?.value).toBeUndefined()
    expect(r?.error ?? r?.main).toBeTruthy()
    expect(r?.main ?? '').not.toMatch(/^-?\d/)
  })
})

describe('Work it out gives checked working for a limit', () => {
  it('cancels the common factor for 0/0, saying x ≠ 1, then substitutes', () => {
    const w = workingFor(String.raw`\lim_{x\to 1}\frac{x^2-1}{x-1}`)
    expect(w.error).toBeUndefined()
    expect(w.checked).toBe('ok')
    expect(w.answers[0]?.tex).toBe('2')
    expect(headsOf(w)).toMatch(/x ≠ 1/)
  })

  it('reads the limit off substitution when the function is defined at the point', () => {
    const w = workingFor(String.raw`\lim_{x\to2}(3x+1)=7`)
    expect(w.checked).toBe('ok')
    expect(w.answers[0]?.tex).toBe('7')
  })

  it('uses the standard limit sin 3x / x = 3', () => {
    const w = workingFor(String.raw`\lim_{x\to0}\frac{\sin 3x}{x}`)
    expect(w.checked).toBe('ok')
    expect(w.answers[0]?.tex).toBe('3')
    expect(headsOf(w)).toMatch(/standard limit/)
  })

  it("uses L'Hopital for e^x - 1 over x, naming the rule", () => {
    const w = workingFor(String.raw`\lim_{x\to0}\frac{e^x-1}{x}`)
    expect(w.checked).toBe('ok')
    expect(w.answers[0]?.tex).toBe('1')
    expect(headsOf(w)).toMatch(/L'Hôpital/)
  })

  it("uses L'Hopital twice for (cos x - 1)/x^2, giving -1/2", () => {
    const w = workingFor(String.raw`\lim_{x\to0}\frac{\cos x-1}{x^2}`)
    expect(w.checked).toBe('ok')
    expect(w.answers[0]?.tex).toBe('-\\frac{1}{2}')
    expect(w.moves.filter((m) => /L'Hôpital/.test(m.head)).length).toBe(2)
  })

  it('divides by the highest power at infinity', () => {
    const w = workingFor(String.raw`\lim_{x\to\infty}\frac{3x^2+1}{x^2-5}`)
    expect(w.checked).toBe('ok')
    expect(w.answers[0]?.tex).toBe('3')
    expect(headsOf(w)).toMatch(/highest power/)
  })

  it('states that a limit does not exist when the two sides disagree', () => {
    const w = workingFor(String.raw`\lim_{x\to0}\frac{1}{x}`)
    expect(w.checked).toBe('ok')
    expect(w.answers[0]?.tex).toBe('\\text{does not exist}')
  })

  it('gives infinity from one side', () => {
    const w = workingFor(String.raw`\lim_{x\to0^+}\frac{1}{x}`)
    expect(w.checked).toBe('ok')
    expect(w.answers[0]?.tex).toBe('\\infty')
  })

  it('agrees with the card for the same line', () => {
    const latex = String.raw`\lim_{x\to 1}\frac{x^2-1}{x-1}`
    const result = card(latex)
    if (!result) throw new Error('no card')
    expect(reconcile(result, workingFor(latex)).verdict).toBe('agree')
  })

  it('shows no checked working for a limit whose values do not settle', () => {
    const w = workingFor(String.raw`\lim_{x\to0}\sin\frac{1}{x}`)
    expect(w.checked).not.toBe('ok')
    expect(w.answers).toEqual([])
    expect(w.error).toBeTruthy()
  })
})

describe('a wrong claim is never checked', () => {
  const quotient = '((x^(2)-1)/(x-1))'

  it('refuses a wrong finite value and accepts the right one', () => {
    expect(checkClaim(quotient, 'x', 1, 0, { kind: 'value', value: 3, exact: null })).toBe('failed')
    expect(checkClaim(quotient, 'x', 1, 0, { kind: 'value', value: 2, exact: null })).toBe('ok')
  })

  it('refuses a wrong infinite value where the function settles', () => {
    expect(checkClaim(quotient, 'x', 1, 0, { kind: 'infinite', sign: 1 })).toBe('failed')
  })

  it('refuses "no limit" where the function settles', () => {
    expect(checkClaim(quotient, 'x', 1, 0, { kind: 'none', text: 'no limit' })).toBe('failed')
  })

  it('refuses a wrong standard limit: sin x / x is not 0 at 0', () => {
    expect(checkClaim('((sin(x))/(x))', 'x', 0, 0, { kind: 'value', value: 0, exact: null })).toBe('failed')
    expect(checkClaim('((sin(x))/(x))', 'x', 0, 0, { kind: 'value', value: 1, exact: null })).toBe('ok')
  })

  it('refuses a finite value for 1/x at 0, and accepts infinity from the right', () => {
    expect(checkClaim('((1)/(x))', 'x', 0, 0, { kind: 'value', value: 0, exact: null })).toBe('failed')
    expect(checkClaim('((1)/(x))', 'x', 0, 0, { kind: 'infinite', sign: 1 })).toBe('failed')
    expect(checkClaim('((1)/(x))', 'x', 0, 1, { kind: 'infinite', sign: 1 })).toBe('ok')
  })

  it('solves bounded oscillations by the Squeeze Theorem: x*sin(1/x) at 0 and sin(x)/x at infinity', () => {
    const r1 = card(String.raw`\lim_{x\to 0} x\sin(1/x)`)
    expect(r1).not.toBeNull()
    expect(r1?.main).toBe('0')
    expect(r1?.error).toBeUndefined()
    const w1 = workingFor(String.raw`\lim_{x\to 0} x\sin(1/x)`)
    expect(w1.checked).toBe('ok')
    expect(w1.method).toBe('Squeeze Theorem')
    expect(w1.answers[0].tex).toBe('0')

    const r2 = card(String.raw`\lim_{x\to \infty} \frac{\sin x}{x}`)
    expect(r2).not.toBeNull()
    expect(r2?.main).toBe('0')
    expect(r2?.error).toBeUndefined()
    const w2 = workingFor(String.raw`\lim_{x\to \infty} \frac{\sin x}{x}`)
    expect(w2.checked).toBe('ok')
    expect(w2.method).toBe('Squeeze Theorem')
    expect(w2.answers[0].tex).toBe('0')
  })
})

// Soundness cases for the Calculator's limits (phase 09-C-LIMITS, review round 1). Each case here was answered wrongly
// by an earlier pass: a value shown as checked that is not the limit, or a "does not exist" that is not true. The
// rule the tests hold to: a limit is shown correctly or not shown at all. A declined case may be "no working", never
// a wrong figure or a wrong "does not exist".

import { beforeEach, describe, expect, it } from 'vitest'
import { evaluateInput } from '../src/renderer/src/calc/evaluateInput'
import { usePure } from '../src/renderer/src/math/pure/store'
import { resetGlobals } from './helpers/globals'

beforeEach(() => resetGlobals())

const OPTS = { vars: {}, ans: 0, angle: 'deg' as const }
const card = (latex: string) => evaluateInput('COMP', latex, OPTS)

function workingFor(latex: string) {
  usePure.getState().runLatex(latex, 'auto', { quiet: true })
  const w = usePure.getState().working
  if (!w) throw new Error(`no working for ${latex}`)
  return w
}

/** A shown value is within `absolute` of the truth, or no value is shown at all. */
function nearOrNothing(value: unknown, truth: number, absolute: number): void {
  if (typeof value !== 'number') return
  expect(Math.abs(value - truth)).toBeLessThan(absolute)
}

describe('an oscillation under a falling envelope is never shown as its small value', () => {
  it('does not show a value for cos x over x at infinity (the limit is 0, and 4.6e-6 is not it)', () => {
    const r = card(String.raw`\lim_{x\to\infty}\frac{\cos x}{x}`)
    nearOrNothing(r?.value, 0, 1e-9)
    expect(r?.value === 0 || r?.value === undefined).toBe(true)
  })

  it('does not show a value for ln x over x at infinity other than 0', () => {
    const r = card(String.raw`\lim_{x\to\infty}\frac{\ln x}{x}`)
    nearOrNothing(r?.value, 0, 1e-9)
  })

  it('does not show a value for x ln x from above at 0 other than 0', () => {
    const r = card(String.raw`\lim_{x\to0^+}x\ln x`)
    nearOrNothing(r?.value, 0, 1e-9)
  })

  it('does not say x^2 sin(1/x) has no limit: its limit is 0 and both sides go to it', () => {
    const r = card(String.raw`\lim_{x\to0}x^{2}\sin\frac{1}{x}`)
    expect(r?.main ?? '').not.toMatch(/does not exist/)
    nearOrNothing(r?.value, 0, 1e-9)
  })

  it('still answers x ln x and 1-cos x over x when they are simple enough to check', () => {
    expect(card(String.raw`\lim_{x\to0}\frac{1-\cos x}{x}`)?.value).toBe(0)
  })
})

describe('the ordinary limits that are not oscillations are still answered', () => {
  it('gives 0 for e^(-x) at infinity and 0.5^x at infinity', () => {
    expect(card(String.raw`\lim_{x\to\infty}e^{-x}`)?.value).toBe(0)
    expect(card(String.raw`\lim_{x\to\infty}0.5^{x}`)?.value).toBe(0)
  })

  it('gives e for (1 + x)^(1/x) at 0 and 1/2 for sqrt(x^2 + x) - x at infinity', () => {
    nearOrNothing(card(String.raw`\lim_{x\to0}(1+x)^{\frac{1}{x}}`)?.value, Math.E, 1e-3)
    nearOrNothing(card(String.raw`\lim_{x\to\infty}\left(\sqrt{x^{2}+x}-x\right)`)?.value, 0.5, 1e-3)
  })

  it('gives arctan at infinity as pi over 2', () => {
    nearOrNothing(card(String.raw`\lim_{x\to\infty}\arctan x`)?.value, Math.PI / 2, 1e-3)
  })

  it('says tan x has no limit at pi over 2 (it runs to +infinity from the left and -infinity from the right)', () => {
    const r = card(String.raw`\lim_{x\to\frac{\pi}{2}}\tan x`)
    expect(r?.main ?? '').toMatch(/does not exist/)
  })

  it('says sin x over x squared has no limit at 0, and does not tick it (no exact rule here proves it)', () => {
    expect(card(String.raw`\lim_{x\to0}\frac{\sin x}{x^{2}}`)?.main ?? '').toMatch(/does not exist/)
    expect(workingFor(String.raw`\lim_{x\to0}\frac{\sin x}{x^{2}}`).checked).not.toBe('ok')
  })
})

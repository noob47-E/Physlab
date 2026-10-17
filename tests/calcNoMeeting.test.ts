// The Calculator: an equation whose two sides only get closer as x runs off to infinity (eˣ = 0) has no real solution, and "=" says so.
//
// Before, the search followed eˣ down towards −∞, stopped where |eˣ| had fallen under 10⁻¹⁴ and walked on, and the card showed that
// stopping point, x = −113, marked "approximate": a number for an equation that has none (owner's list, 17 Oct). Running off to infinity
// is now told apart from a root the arithmetic cannot place, and before the sentence is given the line is swept for a real crossing or
// touch elsewhere, so (x − 5)eˣ = 0, whose search also runs off, is still x = 5.
//
// Each test crosses a boundary: a typed line into the answer a student reads.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { evaluateInput, type EvalResult } from '../src/renderer/src/calc/evaluateInput'
import { NoMeeting, solveNumericChecked } from '../src/renderer/src/calc/engine'
import { errorSentence } from '../src/renderer/src/calc/errors'
import { useCalc } from '../src/renderer/src/calc/calcStore'
import { resetGlobals } from './helpers/globals'

const START_VARS = useCalc.getState().vars
beforeEach(() => {
  resetGlobals()
  useCalc.setState({ vars: START_VARS })
})

/** "=" on a typed line (the field's LaTeX), with the letters the student has stored. */
const equals = (latex: string, angle: 'deg' | 'rad' = 'rad', vars: Record<string, unknown> = START_VARS): EvalResult => {
  const r = evaluateInput('COMP', latex, { vars, ans: 0, angle })
  if (!r) throw new Error(`no answer for ${latex}`)
  return r
}

describe('two sides that only meet at infinity: no real solution, and no number', () => {
  it('eˣ = 0 says there is no real solution, as x goes to −∞', () => {
    const r = equals(String.raw`e^{x}=0`)
    expect(r.error).toBeUndefined()
    expect(r.main).toBe('No real solution: the two sides get closer and closer as x goes to −∞, but never meet.')
    expect(r.approximate).toBeUndefined()
    expect(r.roots).toBeUndefined()
    expect(r.solved).toBe(false)
  })

  it('…in degrees too (eˣ does not depend on the angle setting)', () => {
    expect(equals(String.raw`e^{x}=0`, 'deg').main).toMatch(/^No real solution/)
  })

  it('e⁻ˣ = 0 runs the other way: as x goes to +∞', () => {
    expect(equals(String.raw`e^{-x}=0`).main).toBe('No real solution: the two sides get closer and closer as x goes to +∞, but never meet.')
  })

  it('a stored x does not change it: e^(−x²) = 0 from x = 1 has no real solution either', () => {
    const r = equals(String.raw`e^{-x^{2}}=0`, 'rad', { ...START_VARS, x: 1 })
    expect(r.main).toMatch(/^No real solution: .* \+∞/)
    expect(r.approximate).toBeUndefined()
  })

  it('2eˣ = −3 + 3 is the same equation written another way', () => {
    expect(equals(String.raw`2e^{x}=-3+3`).main).toMatch(/^No real solution/)
  })
})

describe('a search that runs off still finds a real root elsewhere', () => {
  it('(x − 5)eˣ = 0 is x = 5: its search from 0 runs off to −∞ too, and the sweep finds the crossing', () => {
    const r = equals(String.raw`\left(x-5\right)e^{x}=0`)
    expect(r.error).toBeUndefined()
    expect(r.main).toBe('x = 5')
    expect(r.approximate).toBeUndefined()
  })

  it('eˣ = 10⁻³⁰⁰ is x = ln 10⁻³⁰⁰ = −690.7755279: the root lies further along the run than the search used to walk (Azure, 17 Oct)', () => {
    const r = equals(String.raw`e^{x}=10^{-300}`)
    expect(r.error).toBeUndefined()
    expect(r.main).toBe('x = −690.7755279')
    expect(r.approximate).toBeUndefined()
  })

  it('(x + 500.1)²eˣ = 0 is x = −500.1: a touch along the run that no sweep grid sees under the eˣ (Azure, 17 Oct)', () => {
    const r = equals(String.raw`\left(x+500.1\right)^{2}e^{x}=0`)
    expect(r.error).toBeUndefined()
    expect(r.main).toBe('x = −500.1')
  })

  it('a pole on the way is not a root: eˣ + 1/(x + 500) = 0 is not x = −500', () => {
    const r = equals(String.raw`e^{x}+\frac{1}{x+500}=0`)
    expect(r.main).not.toMatch(/−500(\.0+)?$/)
  })

  it('(x − π)²eˣ = 0 is x = π: a touch, where nothing changes sign, is found as well', () => {
    const r = equals(String.raw`\left(x-\pi\right)^{2}e^{x}=0`)
    expect(r.error).toBeUndefined()
    expect(Number(r.value)).toBeCloseTo(Math.PI, 8)
    expect(r.main).toBe('x = 3.141592654')
  })
})

describe('the search itself', () => {
  it('throws NoMeeting (still "No solution found" to everything that reads the message) and names the direction', () => {
    let caught: unknown
    try {
      solveNumericChecked((x) => Math.exp(x), 0)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(NoMeeting)
    expect((caught as NoMeeting).towards).toBe('−∞')
    expect((caught as Error).message).toBe('No solution found')
    expect(errorSentence(caught).sentence).toMatch(/No solution/)
  })

  it('a root the arithmetic cannot place is still a root, marked unsettled, not "no solution": (cos x − 1)² from 0', () => {
    const s = solveNumericChecked((x) => (Math.cos(x) - 1) ** 2, 0)
    expect(Math.abs(s.root)).toBeLessThan(1e-6)
    expect(s.settled).toBe(false)
  })

  it('an ordinary root is untouched: x³ − 2 from 0', () => {
    const s = solveNumericChecked((x) => x ** 3 - 2, 0)
    expect(s.root).toBeCloseTo(Math.cbrt(2), 12)
    expect(s.settled).toBe(true)
  })
})

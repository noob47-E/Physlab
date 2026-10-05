import { describe, expect, it } from 'vitest'
import { runPure } from '../src/renderer/src/math/pure/run'
import { evalDisplayedSum } from '../src/renderer/src/math/pure/latexCheck'
import { rStr, rat } from '../src/renderer/src/math/pure/rat'
import { texToPlain } from '../src/renderer/src/math/pure/work'

describe('U6: zero numerator in partial fractions', () => {
  it('answers 0 instead of an empty answer and failed check', () => {
    const w = runPure('partial', '0/((x+1)(x+2))')
    expect(w.error).toBeUndefined()
    expect(w.answers).toHaveLength(1)
    expect(w.answers[0].tex).toBe('0')
    expect(w.checked).toBe('ok')
    expect(w.check).toMatch(/0 on top is 0|nothing to split/)
  })
})

describe('U7: repeated linear factor written as a power', () => {
  it('splits x^3(x+1) into one fraction per power', () => {
    const w = runPure('partial', '1/(x^3(x+1))')
    expect(w.error).toBeUndefined()
    expect(w.checked).toBe('ok')
    expect(w.answers[0].tex).toBe(String.raw`\dfrac{1}{x} - \dfrac{1}{x^{2}} + \dfrac{1}{x^{3}} - \dfrac{1}{x + 1}`)
  })

  it('handles a numeric coefficient on the repeated power', () => {
    const w = runPure('partial', '1/(4x^3)')
    expect(w.error).toBeUndefined()
    expect(w.checked).toBe('ok')
    expect(w.answers[0].tex).toBe(String.raw`\dfrac{1}{4x^{3}}`)
  })
})

describe('U8: substitution letter avoids the variable', () => {
  it('uses a different letter when the variable is u', () => {
    const w = runPure('factor', 'u^4 + 5u^2 + 4')
    expect(w.error).toBeUndefined()
    expect(w.answers[0].tex).toBe(String.raw`\left(u^{2} + 1\right)\left(u^{2} + 4\right)`)

    const heads = w.moves.map((m) => texToPlain(m.head))
    expect(heads.some((h) => h.includes('u = u²'))).toBe(false)
    expect(heads[0]).toContain('v = u²')
    expect(texToPlain(w.moves[0].subgoal ?? '')).toBe('Substitute for u²')
  })

  it('never reuses a letter already on screen: u(v⁴ + 5v² + 4) substitutes w, not u', () => {
    const w = runPure('factor', 'u(v^4 + 5v^2 + 4)')
    expect(w.error).toBeUndefined()
    const heads = w.moves.map((m) => texToPlain(m.head))
    expect(heads.some((h) => h.includes('u = v²'))).toBe(false)
    expect(heads.some((h) => h.includes('w = v²'))).toBe(true)
  })
})

describe('U9: leading -1 formats as a minus sign', () => {
  it('shows −, not −1, in the factored denominator', () => {
    const w = runPure('partial', '1/(1 - x^2)')
    const step = w.moves.find((m) => m.subgoal === 'Break the bottom into factors')
    expect(step?.tex).toBe(String.raw`-x^{2} + 1 = -\left(x - 1\right)\left(x + 1\right)`)
  })
})

describe('U10: displayed partial-fraction answers are read back correctly', () => {
  it('reads a whole part that starts with a minus', () => {
    const answer = String.raw`-x + 3 + \dfrac{1}{x + 1} - \dfrac{8}{x + 2}`
    expect(rStr(evalDisplayedSum(answer, 'x', rat(2n))!)).toBe('-2/3')
  })

  it('reads a whole part that has a fraction coefficient', () => {
    const answer = String.raw`\frac{1}{2}x - \frac{3}{2} - \dfrac{1}{2\left(x + 1\right)} + \dfrac{4}{x + 2}`
    expect(rStr(evalDisplayedSum(answer, 'x', rat(2n))!)).toBe('1/3')
  })
})

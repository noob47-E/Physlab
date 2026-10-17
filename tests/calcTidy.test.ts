// The Calculator screen, tidied for the Sunday build (owner, 17 Oct: "neat and clean, not crowded, to the point").
//
// 1. The eng chip sat under every answer — a sentence, true or false, the roots of a quadratic, a 5 — where pressing it changed nothing.
//    It is offered only where it rewrites the number (engChanges).
// 2. Visualize sat beside "=" for every line, and for a plain number it "drew" a dot on the axis with a slider: a button for a picture that
//    shows nothing. It is offered once the line is answered and only when there is a picture (hasPicture).
// 3. Visualize on y = x² drew y = y − (x²), which has no value anywhere on a graph: one side that is y itself is the curve (equationGraph).
//
// Each test crosses a boundary: a typed line into what the screen offers under its answer.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { engChanges, equationGraph, evaluateInput, hasPicture, linearOf, type EvalResult } from '../src/renderer/src/calc/evaluateInput'
import type { FieldMode } from '../src/renderer/src/calc/calcStore'
import { useCalc } from '../src/renderer/src/calc/calcStore'
import { readSource } from './helpers/repo'
import { resetGlobals } from './helpers/globals'

const START_VARS = useCalc.getState().vars
beforeEach(() => {
  resetGlobals()
  useCalc.setState({ vars: START_VARS })
})

/** "=" on a typed line (the field's LaTeX) in a mode, and the line as the screen reads it for Visualize. */
const answer = (latex: string, mode: FieldMode = 'COMP'): { r: EvalResult; src: string } => {
  const r = evaluateInput(mode, latex, { vars: START_VARS, ans: 0, angle: 'rad' })
  if (!r) throw new Error(`no answer for ${latex}`)
  return { r, src: linearOf(mode, latex) }
}

describe('the eng chip is offered only where it changes the answer', () => {
  it('96 320 is 96.32 × 10³ in engineering notation: offered', () => {
    expect(engChanges(answer('96320').r)).toBe(true)
  })

  it('a 5, true or false, the roots of a quadratic and a sentence: not offered', () => {
    for (const latex of ['2+3', String.raw`2=2`, String.raw`x^{2}-5x+6=0`, String.raw`e^{x}=0`]) {
      expect(engChanges(answer(latex).r), latex).toBe(false)
    }
  })

  it('an error is not offered it either', () => {
    expect(engChanges(answer(String.raw`\frac{1}{0}`).r)).toBe(false)
  })
})

describe('Visualize is offered only when the answered line has a picture', () => {
  it('a plain number has none: 2 + 3', () => {
    const { r, src } = answer('2+3')
    expect(hasPicture(src, 'COMP', r)).toBe(false)
  })

  it('an equation, a function of x, a derivative, an area and a sum have one', () => {
    for (const latex of [String.raw`x^{2}=4`, String.raw`e^{x}=0`, String.raw`\sin x`, String.raw`\frac{d}{dx}\left(x^{3}\right)`, String.raw`\int_{0}^{1}x\,dx`, String.raw`\sum_{x=1}^{5}x`]) {
      const { r, src } = answer(latex)
      expect(hasPicture(src, 'COMP', r), `${latex} → ${src}`).toBe(true)
    }
  })

  it('a slope at a point is a tangent to draw: ddx(x², 1)', () => {
    const r = evaluateInput('COMP', 'ddx(x^2, 1)', { vars: START_VARS, ans: 0, angle: 'rad' })
    expect(r && hasPicture('ddx(x^2, 1)', 'COMP', r)).toBe(true)
  })

  it('Pol and Rec draw a vector', () => {
    const { r, src } = answer(String.raw`\operatorname{Pol}\left(1,1\right)`)
    expect(hasPicture(src, 'COMP', r), src).toBe(true)
  })

  it('an answer that is an error, and Bases mode, have none', () => {
    const bad = answer(String.raw`\frac{1}{0}`)
    expect(hasPicture(bad.src, 'COMP', bad.r)).toBe(false)
    const hex = answer('FF', 'BASE-N')
    expect(hasPicture(hex.src, 'BASE-N', hex.r)).toBe(false)
  })

  it('the Maths screen shows the button only for such an answer', () => {
    const maths = readSource('src/renderer/src/panels/Maths.tsx')
    expect(maths).toMatch(/const picture = !!result && hasPicture\(linearOrEmpty\(\), mode, result\)/)
    expect(maths).toMatch(/\{picture && \(\s*<button className="btn" onClick=\{visualize\}/)
    expect(maths).toMatch(/\{drew && picture && \(/)
    expect(maths).toMatch(/const showEng = onEng && !formula && engChanges\(result\)/)
  })
})

describe('the graph Visualize draws for an equation', () => {
  it('y = x² is the curve y = x², and x² = y the same', () => {
    expect(equationGraph('y ', ' x^2')).toEqual({ label: 'y = x^2', expr: 'x^2' })
    expect(equationGraph('x^2', 'y')).toEqual({ label: 'y = x^2', expr: 'x^2' })
  })

  it('any other equation is y = L − R, which crosses the axis at the roots', () => {
    expect(equationGraph('x^2', '4')).toEqual({ label: 'y = x^2 − (4)', expr: '(x^2) - (4)' })
  })

  it('y on both sides is not a curve in x alone: y = y x stays L − R', () => {
    expect(equationGraph('y', 'y x').label).toBe('y = y − (y x)')
  })
})

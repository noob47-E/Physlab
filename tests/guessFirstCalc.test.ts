import { describe, expect, it } from 'vitest'
import { initialShown, stepPrefFrom } from '../src/renderer/src/math/pure/reveal'
import { checkCalculatorGuess } from '../src/renderer/src/calc/guessCalc'
import type { EvalResult } from '../src/renderer/src/calc/evaluateInput'

describe('GF-CALC: StepPref supports guess first', () => {
  it('reads "guess" as a valid step preference', () => {
    expect(stepPrefFrom('guess')).toBe('guess')
    expect(stepPrefFrom('all')).toBe('all')
    expect(stepPrefFrom('try')).toBe('try')
    expect(stepPrefFrom(null)).toBe('try')
    expect(stepPrefFrom(undefined)).toBe('try')
    expect(stepPrefFrom('other')).toBe('try')
  })

  it('keeps steps hidden initially when preference is "guess"', () => {
    expect(initialShown(5, 'guess')).toBe(0)
    expect(initialShown(0, 'guess')).toBe(0)
    expect(initialShown(5, 'try')).toBe(0)
    expect(initialShown(5, 'all')).toBe(5)
  })
})

describe('GF-CALC: checkCalculatorGuess evaluations', () => {
  const resultNum = (value: number, main = String(value)): EvalResult => ({
    value,
    main,
    src: String(value)
  })

  it('marks exact number guess as right', () => {
    const res = checkCalculatorGuess('14', resultNum(14))
    expect(res.verdict).toBe('right')
    expect(res.parsed).toBe(14)
  })

  it('marks exact fraction guess for a fractional value as right', () => {
    const res = checkCalculatorGuess('7/12', resultNum(7 / 12, '7/12'))
    expect(res.verdict).toBe('right')
  })

  it('marks decimal guess matching fractional result within tolerance as right', () => {
    const res = checkCalculatorGuess('0.5833', resultNum(7 / 12, '7/12'))
    expect(res.verdict).toBe('right')
  })

  it('marks guess within 2% as close, and beyond 2% as wrong', () => {
    // 7/12 is 0.583333... 0.575 is within 1.4% (close)
    const resClose = checkCalculatorGuess('0.575', resultNum(7 / 12, '7/12'))
    expect(resClose.verdict).toBe('close')

    // 0.55 is 5.7% away (wrong)
    const resWrong = checkCalculatorGuess('0.55', resultNum(7 / 12, '7/12'))
    expect(resWrong.verdict).toBe('wrong')
  })

  it('detects opposite sign as wrong with helpful message', () => {
    const res = checkCalculatorGuess('-14', resultNum(14))
    expect(res.verdict).toBe('wrong')
    expect(res.message).toContain('sign')
  })

  it('detects power-of-ten slip as wrong with helpful message', () => {
    const res = checkCalculatorGuess('140', resultNum(14))
    expect(res.verdict).toBe('wrong')
    expect(res.message).toContain('power of ten')
  })

  it('handles empty input', () => {
    const res = checkCalculatorGuess('   ', resultNum(14))
    expect(res.verdict).toBe('empty')
  })

  it('handles unreadable input', () => {
    const res = checkCalculatorGuess('abc xyz @@', resultNum(14))
    expect(res.verdict).toBe('unreadable')
  })

  it('marks 14.2 not right for 14, but close within 2%; 98 close for 100', () => {
    const res14 = checkCalculatorGuess('14.2', resultNum(14))
    expect(res14.verdict).toBe('close')
    expect(res14.verdict).not.toBe('right')

    const res100 = checkCalculatorGuess('98', resultNum(100))
    expect(res100.verdict).toBe('close')
    expect(res100.verdict).not.toBe('right')

    const exact14 = checkCalculatorGuess('14', resultNum(14))
    expect(exact14.verdict).toBe('right')
  })

  it('checks polynomial / equation roots with and, commas, expressions, and ±', () => {
    const eqResult: EvalResult = {
      main: 'x1 = 3, x2 = 2',
      src: 'x^2 - 5x + 6 = 0',
      solved: true,
      roots: [3, 2]
    }
    const right = checkCalculatorGuess('3, 2', eqResult)
    expect(right.verdict).toBe('right')

    const reverse = checkCalculatorGuess('2, 3', eqResult)
    expect(reverse.verdict).toBe('right')

    const withAnd = checkCalculatorGuess('2 and 3', eqResult)
    expect(withAnd.verdict).toBe('right')

    const partial = checkCalculatorGuess('3', eqResult)
    expect(partial.verdict).toBe('close')
    expect(partial.message).toContain('another')

    const wrong = checkCalculatorGuess('5, 1', eqResult)
    expect(wrong.verdict).toBe('wrong')
    expect(wrong.message).not.toMatch(/^Not quite/i)

    // Equation x^2 - 2x - 1 = 0 with irrational roots 1 + sqrt(2) and 1 - sqrt(2)
    const sqrtResult: EvalResult = {
      main: 'x1 = 2.4142135624, x2 = -0.4142135624',
      src: 'x^2 - 2x - 1 = 0',
      solved: true,
      roots: [1 + Math.SQRT2, 1 - Math.SQRT2]
    }
    const rightExpr = checkCalculatorGuess('1 + sqrt 2, 1 - sqrt 2', sqrtResult)
    expect(rightExpr.verdict).toBe('right')

    const rightPm = checkCalculatorGuess('1 ± sqrt 2', sqrtResult)
    expect(rightPm.verdict).toBe('right')

    const rightParens = checkCalculatorGuess('1 - sqrt(2) and 1 + sqrt(2)', sqrtResult)
    expect(rightParens.verdict).toBe('right')
  })

  it('checks algebraic expressions with expressionEqual', () => {
    const algResult: EvalResult = {
      main: 'x^2 - 1',
      src: '(x-1)(x+1)',
      formula: 'x^2 - 1',
      tex: 'x^2 - 1'
    }
    const right = checkCalculatorGuess('x^2 - 1', algResult)
    expect(right.verdict).toBe('right')
  })

  it('checks direct matches for Base-N and exact representations', () => {
    const baseNResult: EvalResult = {
      main: '100',
      src: 'FF + 1',
      value: 256
    }
    expect(checkCalculatorGuess('100', baseNResult).verdict).toBe('right')

    const exactResult: EvalResult = {
      main: '0.7071',
      src: 'cos(45)',
      value: 0.70710678,
      exact: '\\frac{\\sqrt{2}}{2}'
    }
    expect(checkCalculatorGuess('\\frac{\\sqrt{2}}{2}', exactResult).verdict).toBe('right')
  })

  it('does not treat a case-changed shown answer as a direct right match', () => {
    const unitResult: EvalResult = {
      main: '1 MW',
      src: 'power',
      value: 1
    }
    expect(checkCalculatorGuess('1 mW', unitResult).verdict).not.toBe('right')
  })

  it('uses shown scientific notation without a decimal point for half-unit tolerance', () => {
    const sciResult: EvalResult = {
      main: '1e-3',
      src: 'value',
      value: 0.0012
    }
    expect(checkCalculatorGuess('0.001', sciResult).verdict).toBe('right')
  })
})


// The reading layer between the steps and G2 (S1b). A step's text reaches G2 only as plain maths: a LaTeX command, a brace
// or a backslash is never read (plainForG2), so a form G2 cannot read is 'unknown', never a guess. The surd and complex
// values the framework gives G2 are its own plain forms (sqrt(d), i, *): 2√3, written \sqrt{3} in LaTeX, reaches G2 as
// 2*sqrt(3) and is the same number as √12. G2 says 'equal' only from exact arithmetic; its numeric path never does, and
// a cancelled denominator is never valid in an expression step.

import { describe, it, expect } from 'vitest'
import { algEq } from '../../../src/renderer/src/math/check/field'
import {
  checkRootSetG2,
  expressionEqualG2,
  plainForG2,
  plainOfAlg,
  readSurd,
  texOfAlg
} from '../../../src/renderer/src/math/steps/check-adapter'

describe('2√3 reaches G2 exactly: the plain form is read, the LaTeX is not', () => {
  it('2*sqrt(3) and sqrt(12) are the same number to G2', () => {
    const a = readSurd('2*sqrt(3)')
    const b = readSurd('sqrt(12)')
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(algEq(a!, b!)).toBe(true)
  })

  it('the framework writes 2√3 as 2*sqrt(3) for G2 and as 2\\sqrt{3} for the page, and both read back exactly', () => {
    const x = readSurd('2*sqrt(3)')!
    expect(plainOfAlg(x)).toBe('2*sqrt(3)')
    expect(texOfAlg(x)).toBe('2\\sqrt{3}')
    expect(algEq(readSurd(plainOfAlg(x))!, x)).toBe(true)
  })

  it('a backslash or a brace is never read: plainForG2 refuses LaTeX, and G2 says unknown', () => {
    expect(plainForG2('2\\sqrt{3}')).toBeNull()
    expect(plainForG2('2*sqrt(3)')).toBe('2*sqrt(3)')
    expect(expressionEqualG2('2\\sqrt{3}', '2*sqrt(3)')).toBe('unknown')
    expect(checkRootSetG2('x^2 - 2*x - 1 = 0', ['1-\\sqrt{2}', '1+\\sqrt{2}'], 'real')).toBe('unknown')
    expect(checkRootSetG2('\\frac{1}{2}x^2 = 0', ['0'], 'real')).toBe('unknown')
  })
})

describe('G2 gives a verdict only where it is exact (no guess from numbers)', () => {
  it('sqrt(12) against 2*sqrt(3) is unknown, never valid: G2 decides by numbers only to show a difference', () => {
    expect(expressionEqualG2('sqrt(12)', '2*sqrt(3)')).toBe('unknown')
  })

  it('sqrt(12) against 3*sqrt(2) is invalid: G2 shows exactly that they differ', () => {
    expect(expressionEqualG2('sqrt(12)', '3*sqrt(2)')).toBe('invalid')
  })

  it('a function G2 cannot decide exactly is unknown even when the texts are identical', () => {
    expect(expressionEqualG2('sin(x)', 'sin(x)')).toBe('unknown')
  })

  it('a wrong expression is invalid, and the right one with the same letters is valid', () => {
    expect(expressionEqualG2('x^2 - 2*x - 1', 'x^2 - 2*x + 1')).toBe('invalid')
    expect(expressionEqualG2('x^2 - 2*x - 1', 'x^2 - 2*x - 1')).toBe('valid')
  })

  it('an implicit product is read as a product: 2x against 2*x is valid', () => {
    expect(expressionEqualG2('2x', '2*x')).toBe('valid')
  })

  it('glued text is not read as a different expression: a letter touching a digit is refused (x2 against 2*x is unknown, not invalid)', () => {
    expect(plainForG2('x2')).toBeNull()
    expect(expressionEqualG2('x2', '2*x')).toBe('unknown')
    expect(expressionEqualG2('x2', 'x^2')).toBe('unknown')
    expect(expressionEqualG2('x*sqrt(2)', 'xsqrt(2)')).toBe('unknown')
    expect(plainForG2('2x2')).toBeNull()
  })

  it('a number in exponent notation is read, not refused: 1e5 is one literal (review round 2)', () => {
    expect(plainForG2('1e5*x')).toBe('1e5*x')
    expect(plainForG2('e5*x')).toBeNull()
    expect(expressionEqualG2('1e5*x', '100000*x')).not.toBe('invalid')
  })

  it('a commuted surd product is unknown (the step is not refused, G2 does not decide it)', () => {
    expect(expressionEqualG2('2*x*sqrt(3)', '2*sqrt(3)*x')).toBe('unknown')
  })

  it('a cancelled denominator is never valid: (x^2 - 1)/(x - 1) against x + 1 is unknown (x = 1 is excluded)', () => {
    expect(expressionEqualG2('(x^2 - 1)/(x - 1)', 'x + 1')).toBe('unknown')
  })

  it('a cancelled denominator that is a different function is invalid: (x^2 - 1)/(x - 1) against x + 2', () => {
    expect(expressionEqualG2('(x^2 - 1)/(x - 1)', 'x + 2')).toBe('invalid')
  })
})

describe('the root set G2 checks: each root exact, every root in the domain, multiplicities counted', () => {
  it('the right surd roots are valid, written as values or as x = value', () => {
    expect(checkRootSetG2('x^2 - 2*x - 1 = 0', ['1-sqrt(2)', '1+sqrt(2)'], 'real')).toBe('valid')
    expect(checkRootSetG2('x^2 - 2*x - 1 = 0', ['x = 1-sqrt(2)', 'x = 1+sqrt(2)'], 'real')).toBe('valid')
  })

  it('a wrong surd is invalid', () => {
    expect(checkRootSetG2('x^2 - 2*x - 1 = 0', ['1-sqrt(3)', '1+sqrt(2)'], 'real')).toBe('invalid')
  })

  it('a missing root is invalid, and a repeated root is invalid', () => {
    expect(checkRootSetG2('x^2 - 2*x - 1 = 0', ['1-sqrt(2)'], 'real')).toBe('invalid')
    expect(checkRootSetG2('x^2 - 2*x - 1 = 0', ['1-sqrt(2)', '1-sqrt(2)'], 'real')).toBe('invalid')
  })

  it('the complex pair is valid in the complex domain and invalid in the real domain', () => {
    expect(checkRootSetG2('x^2 + 2*x + 5 = 0', ['-1-2*i', '-1+2*i'], 'complex')).toBe('valid')
    expect(checkRootSetG2('x^2 + 2*x + 5 = 0', ['-1-2*i', '-1+2*i'], 'real')).toBe('invalid')
  })

  it('a double root is valid with multiplicity 2 and invalid when listed once', () => {
    expect(checkRootSetG2('x^2 - 6*x + 9 = 0', [{ value: '3', multiplicity: 2 }], 'real')).toBe('valid')
    expect(checkRootSetG2('x^2 - 6*x + 9 = 0', ['3'], 'real')).toBe('invalid')
  })
})

import { describe, expect, it } from 'vitest'
import { latexToMath } from '../src/renderer/src/math/latexToMath'

describe('P-PARSE PL: an unbraced sign in a power', () => {
  it('reads 10^-3, 2^-12 and 10^+2 as one power', () => {
    expect(latexToMath('10^-3')).toBe('10^(-3)')
    expect(latexToMath('2^-12')).toBe('2^(-12)')
    expect(latexToMath('10^+2')).toBe('10^(+2)')
  })
})

describe('P-PARSE PL: a bare function takes Greek, degrees and factorial in its argument', () => {
  it('reads \\sin\\mu, \\sin 30° and \\sin x! as complete arguments', () => {
    expect(latexToMath('\\sin\\mu')).toBe('sin(μ)')
    expect(latexToMath('\\sin 30°')).toBe('sin(30°)')
    expect(latexToMath('\\sin x!')).toBe('sin(x!)')
  })
})

describe('P-PARSE PL: d/dx takes the whole body', () => {
  it('reads x^2 after d/dx as the body', () => {
    expect(latexToMath('\\frac{d}{dx} x^2')).toBe('diff(x^(2), x)')
  })
})

describe('P-PARSE PL: d/dθ reads a Greek denominator', () => {
  it('reads d/dθ of a bracketed sine with respect to θ', () => {
    expect(latexToMath('\\frac{d}{d\\theta}\\left(\\sin\\theta\\right)')).toBe('diff(sin(θ), θ)')
  })
})

describe('P-PARSE PL: standalone angle brackets', () => {
  it('reads \\langle and \\rangle as vector brackets', () => {
    expect(latexToMath('\\langle 1, 2 \\rangle')).toBe('<1,2>')
  })
})

describe('P-PARSE PL: sigma/prod stop at a relation and read an uppercase index', () => {
  it('does not swallow the equals sign after a sum, and reads an uppercase limit variable', () => {
    expect(latexToMath('\\sum_{x=1}^{n} f = 5')).toBe('sigma(f, 1, n)=5')
    expect(latexToMath('\\sum_{N=1}^{3} 2')).toBe('sigma(2, 1, 3)')
  })
  it('does not swallow a comparison after a product', () => {
    expect(latexToMath('\\prod_{n=1}^{3} 7 < 10')).toBe('product(7, 1, 3)<10')
  })
})

describe('P-PARSE PL: a non-alphanumeric subscript keeps its brackets', () => {
  it('reads a_{n+1} as one subscript', () => {
    expect(latexToMath('a_{n+1}')).toBe('a_(n+1)')
  })
})

describe('d/dx before a function name (part head check)', () => {
  it('reads the function as the body, not as something after an empty diff', () => {
    expect(latexToMath('\\frac{d}{dx}\\sin x')).toBe('diff(sin(x), x)')
    expect(latexToMath('\\frac{d}{d\\theta}\\cos\\theta')).toBe('diff(cos(θ), θ)')
  })
})

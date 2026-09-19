import { describe, expect, it } from 'vitest'
import { R1, rAdd, rDiv, rFromNumber, rMul, rSqrt, rStr, rSub, rat, rTex } from '../src/renderer/src/math/pure/rat'
import { eMul, exprTex, parseExpr, parseFraction, commonFactor, varsOf } from '../src/renderer/src/math/pure/mono'
import { pAdd, pDivMod, pEq, pGcd, pMul, pTex, polyFromExpr, findRationalRoot } from '../src/renderer/src/math/pure/poly'
import { factorise } from '../src/renderer/src/math/pure/factor'
import { factoriseNumberWorking, hcfWorking, lcmWorking, primeFactorise } from '../src/renderer/src/math/pure/integers'

describe('exact fractions', () => {
  it('stays exact where doubles do not', () => {
    const third = rat(1n, 3n)
    expect(rStr(rMul(third, rat(3n)))).toBe('1')
    expect(rStr(rAdd(rat(1n, 10n), rat(2n, 10n)))).toBe('3/10')
  })

  it('reduces to lowest terms and keeps the sign on top', () => {
    expect(rStr(rat(6n, -8n))).toBe('-3/4')
    expect(rTex(rat(-3n, 4n))).toBe('-\\frac{3}{4}')
    expect(rTex(rat(8n, 4n))).toBe('2')
  })

  it('reads a decimal the way it was written', () => {
    expect(rStr(rFromNumber(0.15))).toBe('3/20')
    expect(rStr(rFromNumber(2.5))).toBe('5/2')
    expect(rStr(rFromNumber(1e-3))).toBe('1/1000')
  })

  it('takes exact square roots only', () => {
    expect(rStr(rSqrt(rat(9n, 25n))!)).toBe('3/5')
    expect(rSqrt(rat(2n))).toBeNull()
    expect(rSqrt(rat(-4n))).toBeNull()
  })

  it('divides back to where it started', () => {
    const a = rat(7n, 12n)
    const b = rat(-5n, 8n)
    expect(rStr(rMul(rDiv(a, b), b))).toBe(rStr(a))
    expect(rStr(rSub(rAdd(a, b), b))).toBe(rStr(a))
  })
})

describe('expressions', () => {
  it('expands a product into ordered terms', () => {
    expect(exprTex(parseExpr('(x+2)(x+3)'))).toBe('x^{2} + 5x + 6')
    expect(exprTex(parseExpr('(a+b)^2'))).toBe('a^{2} + 2ab + b^{2}')
  })

  it('collects like terms and drops zeros', () => {
    expect(exprTex(parseExpr('3x + 4x - 7x + 5'))).toBe('5')
    expect(exprTex(parseExpr('x - x'))).toBe('0')
  })

  it('handles several letters', () => {
    expect(varsOf(parseExpr('x^2*y + x*y^2'))).toEqual(['x', 'y'])
    expect(exprTex(parseExpr('2x*3y'))).toBe('6xy')
  })

  it('finds the common factor of every term', () => {
    const cf = commonFactor(parseExpr('6x^2*y + 9x*y^2'))
    expect(cf.c.n).toBe(3n)
    expect(cf.v).toEqual({ x: 1, y: 1 })
  })

  it('splits a fraction into top and bottom', () => {
    const { num, den } = parseFraction('(3x+5)/((x+1)(x+2))')
    expect(exprTex(num)).toBe('3x + 5')
    expect(exprTex(den)).toBe('x^{2} + 3x + 2')
  })

  it('refuses what it cannot do, in plain words', () => {
    expect(() => parseExpr('sin(x)')).toThrow(/not something I can factorise/)
    expect(() => parseExpr('x^(-2)')).toThrow(/whole numbers/)
  })
})

describe('polynomials', () => {
  it('divides with a remainder that checks out', () => {
    const { poly: a } = polyFromExpr(parseExpr('x^3 - 2x^2 + 3x - 4'))
    const { poly: b } = polyFromExpr(parseExpr('x - 1'))
    const { q, r } = pDivMod(a, b)
    expect(pTex(q, 'x')).toBe('x^{2} - x + 2')
    expect(pTex(r, 'x')).toBe('-2')
    // a = q·b + r, exactly.
    expect(pEq(pAdd(pMul(q, b), r), a)).toBe(true)
  })

  it('finds a highest common factor', () => {
    const { poly: a } = polyFromExpr(parseExpr('x^2 - 1'))
    const { poly: b } = polyFromExpr(parseExpr('x^2 + 2x + 1'))
    expect(pTex(pGcd(a, b), 'x')).toBe('x + 1')
  })

  it('finds a rational root', () => {
    const { poly } = polyFromExpr(parseExpr('2x^3 - 3x^2 - 3x + 2'))
    expect(findRationalRoot(poly)).not.toBeNull()
  })
})

/** Multiply the reported factors back out and insist on the original. */
const remultiplies = (src: string): string => {
  const { factors } = factorise(src)
  expect(factors.length).toBeGreaterThan(0)
  return exprTex(factors.reduce((a, b) => eMul(a, b)))
}

describe('factorising algebra', () => {
  it('takes out a common factor', () => {
    const w = factorise('6x^2 + 9x')
    expect(w.working.answers[0].tex).toBe('3x\\left(2x + 3\\right)')
    expect(remultiplies('6x^2 + 9x')).toBe('6x^{2} + 9x')
  })

  it('splits the middle term', () => {
    const { working } = factorise('6x^2 + 7x - 3')
    expect(working.method).toBe('Splitting the middle term')
    expect(remultiplies('6x^2 + 7x - 3')).toBe('6x^{2} + 7x - 3')
    // The answer is the pair of brackets, in either order.
    expect(working.answers[0].tex).toMatch(/2x \+ 3/)
    expect(working.answers[0].tex).toMatch(/3x - 1/)
  })

  it('does the difference of two squares, twice over', () => {
    const { working } = factorise('x^4 - 16')
    expect(working.answers[0].tex).toMatch(/x - 2/)
    expect(working.answers[0].tex).toMatch(/x \+ 2/)
    expect(working.answers[0].tex).toMatch(/x\^\{2\} \+ 4/)
    expect(remultiplies('x^4 - 16')).toBe('x^{4} - 16')
  })

  it('recognises a perfect square', () => {
    const { working } = factorise('x^2 + 6x + 9')
    expect(working.method).toBe('Perfect square')
    expect(working.answers[0].tex).toBe('\\left(x + 3\\right)^{2}')
  })

  it('does cubes', () => {
    expect(remultiplies('x^3 - 8')).toBe('x^{3} - 8')
    expect(remultiplies('27a^3 + 8b^3')).toBe('27a^{3} + 8b^{3}')
  })

  it('groups four terms', () => {
    const { working } = factorise('x^3 + 3x^2 + 2x + 6')
    expect(remultiplies('x^3 + 3x^2 + 2x + 6')).toBe('x^{3} + 3x^{2} + 2x + 6')
    expect(working.answers[0].tex).toMatch(/x \+ 3/)
  })

  it('uses the factor theorem on a cubic', () => {
    expect(remultiplies('x^3 - 6x^2 + 11x - 6')).toBe('x^{3} - 6x^{2} + 11x - 6')
  })

  it('works with two letters', () => {
    expect(remultiplies('x^2 - y^2')).toBe('x^{2} - y^{2}')
    expect(remultiplies('6x^2*y + 9x*y^2')).toBe('6x^{2}y + 9xy^{2}')
  })

  it('says so when nothing factorises', () => {
    const { working } = factorise('x^2 + x + 1')
    expect(working.check).toMatch(/does not break into simpler factors/)
  })

  it('always checks its own answer', () => {
    for (const src of ['6x^2+7x-3', 'x^4-16', 'x^3-6x^2+11x-6', '2x^2-8', 'x^2+6x+9']) {
      const { working } = factorise(src)
      expect(working.check, src).not.toMatch(/suspicion/)
    }
  })
})

describe('whole numbers', () => {
  it('factorises into primes', () => {
    expect(primeFactorise(360n).factors).toEqual([
      [2n, 3],
      [3n, 2],
      [5n, 1]
    ])
    expect(primeFactorise(97n).factors).toEqual([[97n, 1]])
  })

  it('writes the working for a prime factorisation', () => {
    const w = factoriseNumberWorking(360n)
    expect(w.error).toBeUndefined()
    expect(w.answers[0].tex).toBe('2^{3} \\times 3^{2} \\times 5')
    expect(w.moves.length).toBeGreaterThan(2)
  })

  it('finds HCF and LCM', () => {
    expect(hcfWorking([12n, 18n]).answers[0].tex).toBe('6')
    expect(lcmWorking([12n, 18n]).answers[0].tex).toBe('36')
    expect(hcfWorking([8n, 9n]).answers[0].tex).toBe('1')
    expect(lcmWorking([4n, 6n, 10n]).answers[0].tex).toBe('60')
  })

  it('refuses zero with a reason', () => {
    expect(hcfWorking([0n, 5n]).error).toMatch(/zero/i)
    expect(factoriseNumberWorking(1n).error).toMatch(/neither prime nor composite/)
  })
})

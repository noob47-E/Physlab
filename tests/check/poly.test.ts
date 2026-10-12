// G2: polyEqual, rationalEqual and factorCheck — right answers 'equal', planted wrong ones never 'equal'.

import { describe, expect, it } from 'vitest'
import { factorCheck, polyEqual, rationalEqual } from '../../src/renderer/src/math/check/checkers'
import { bracket, int, mul, seeded, show, type Coeffs } from './gen'

describe('polyEqual: exact equality in ℚ[x, y, …]', () => {
  const equal: [string, string][] = [
    ['(x+1)^2', 'x^2+2x+1'],
    ['(x-1)(x+1)', 'x^2-1'],
    ['(a+b)^3', 'a^3+3a^2b+3ab^2+b^3'],
    ['x(x+1)(x+2)', 'x^3+3x^2+2x'],
    ['(2x-3)^2', '4x^2-12x+9'],
    ['x/2 + x/3', '5x/6'],
    ['0.5x', 'x/2'],
    ['(x+y)(x-y)', 'x^2-y^2'],
    ['1e-19 x', 'x/10^19'],
    ['6e24 x^2', '6000000000000000000000000 x^2'],
    ['(x^2+1)(x^2-1)', 'x^4-1'],
    ['3(x-2)+2(x+1)', '5x-4'],
    ['(x+1)^5', 'x^5+5x^4+10x^3+10x^2+5x+1'],
    ['-(x-1)', '1-x'],
    ['x^0', '1'],
    ['(1/3)x + (2/3)x', 'x'],
    ['2^10', '1024'],
    ['(x - 1/2)^2', 'x^2 - x + 1/4'],
    ['(x*y+1)^2', 'x^2*y^2+2*x*y+1'],
    ['0.1 + 0.2', '0.3'],
    ['(x+1)(x+2)', 'x^2+3x+2']
  ]
  it.each(equal)('%s = %s', (a, b) => expect(polyEqual(a, b)).toBe('equal'))

  const different: [string, string][] = [
    ['(x+1)^2', 'x^2+1'],
    ['(x-1)(x+1)', 'x^2+1'],
    ['x^2-1', 'x^2-1.0000001'],
    ['1e-19 x', '1e-18 x'],
    ['6e24 x', '6.00000000000001e24 x'],
    ['(a+b)^2', 'a^2+b^2'],
    ['x^3', 'x^2'],
    ['x+y', 'y+x+1'],
    ['x/3', '0.333x'],
    ['(x-1)^3', 'x^3-1'],
    ['2(x+1)', '2x+1'],
    ['x*y', 'y*x*x']
  ]
  it.each(different)('%s ≠ %s', (a, b) => expect(polyEqual(a, b)).toBe('different'))

  const unknown: [string, string][] = [
    ['sqrt(2) x', 'x'],
    ['sin(x)', 'x'],
    ['1/x', 'x^-1'],
    ['pi x', 'x'],
    ['12345678901234567 x', 'x'],
    ['x^(1/2)', 'x'],
    ['|x|', 'x']
  ]
  it.each(unknown)('%s vs %s cannot be decided as polynomials', (a, b) => expect(polyEqual(a, b)).toBe('unknown'))

  it('seeded: a product and its expansion are equal; one coefficient changed is different (60 cases)', () => {
    const rand = seeded(7)
    for (let k = 0; k < 60; k++) {
      let p: Coeffs = [BigInt(int(rand, -9, 9) || 1)]
      const factors: string[] = [String(p[0])]
      for (let j = int(rand, 1, 4); j > 0; j--) {
        const r = int(rand, -6, 6)
        p = mul(p, [BigInt(-r), 1n])
        factors.push(bracket(r))
      }
      const product = factors.join('*')
      expect(polyEqual(product, show(p)), product).toBe('equal')
      const wrong = [...p]
      const i = int(rand, 0, wrong.length - 1)
      wrong[i] += BigInt(int(rand, 1, 3))
      expect(polyEqual(product, show(wrong)), `${product} vs ${show(wrong)}`).toBe('different')
    }
  })
})

describe('rationalEqual: cross-multiplied, with the points where either is undefined', () => {
  const values = (r: ReturnType<typeof rationalEqual>) => r.excluded.map((e) => e.value)
  it('x(x − 1)/(x − 1) = x, except at 1', () => {
    const r = rationalEqual('x(x-1)/(x-1)', 'x')
    expect(r.verdict).toBe('equal')
    expect(values(r)).toEqual([1])
    expect(r.excluded[0].exact).toBe('1')
    expect(r.excludedComplete).toBe(true)
  })
  const equal: [string, string, number[]][] = [
    ['(x^2-1)/(x-1)', 'x+1', [1]],
    ['1/x + 1/(x+1)', '(2x+1)/(x(x+1))', [-1, 0]],
    ['(x^2-4)/(x+2)', 'x-2', [-2]],
    ['x/x', '1', [0]],
    ['1/(x^2+1)', '1/(1+x^2)', []],
    ['(x+1)/(x^2-1)', '1/(x-1)', [-1, 1]],
    ['2/(x-1) - 1/(x+1)', '(x+3)/(x^2-1)', [-1, 1]],
    ['(x^3-1)/(x-1)', 'x^2+x+1', [1]],
    ['1/(2x) + 1/(2x)', '1/x', [0]],
    ['(x^2+2x+1)/(x+1)^2', '1', [-1]],
    ['x^-1', '1/x', [0]],
    ['(x/2)/(x/4)', '2', [0]],
    ['(6x^2-x-1)/(3x+1)', '2x-1', [-1 / 3]],
    ['x^2/x^3', '1/x', [0]],
    ['1e-19/x', '1/(1e19 x)', [0]]
  ]
  it.each(equal)('%s = %s', (a, b, ex) => {
    const r = rationalEqual(a, b)
    expect(r.verdict).toBe('equal')
    expect(values(r)).toEqual(ex.map((v) => expect.closeTo(v, 12)))
  })
  it('an irrational zero of a denominator is listed exactly: x(x² − 2)/(x² − 2) = x except at ±√2', () => {
    const r = rationalEqual('x(x^2-2)/(x^2-2)', 'x')
    expect(r.verdict).toBe('equal')
    expect(r.excluded.map((e) => e.exact)).toEqual(['−√2', '√2'])
  })
  it('a denominator in several letters: equal, but its zeros are not listed as points', () => {
    const r = rationalEqual('a/b * b/a', '1')
    expect(r.verdict).toBe('equal')
    expect(r.excludedComplete).toBe(false)
  })
  const different: [string, string][] = [
    ['x(x-1)/(x-1)', 'x-1'],
    ['1/x', '1/(x+1)'],
    ['(x+1)/(x-1)', '(x-1)/(x+1)'],
    ['1/x + 1/x', '1/(2x)'],
    ['(x^2-1)/(x-1)', 'x-1'],
    ['1/(x^2+1)', '1/(x^2-1)'],
    ['x/(x+1)', '1 - 1/x'],
    ['1/(x-1) - 1/(x+1)', '2/(x^2+1)'],
    ['(x^2+1)/x', 'x + 1'],
    ['1e-19/x', '1e-18/x'],
    ['sin(x)/x', '1'],
    ['sqrt(x)^2', 'x']
  ]
  it.each(different)('%s ≠ %s', (a, b) => expect(rationalEqual(a, b).verdict).toBe('different'))
  it('two answers numbers cannot tell apart stay unknown: e^x/e^x vs 1', () => {
    expect(rationalEqual('e^x/e^x', '1').verdict).toBe('unknown')
  })
  it('seeded: a cancelled factor gives equal with its zero excluded; a changed numerator is different (40 cases)', () => {
    const rand = seeded(11)
    for (let k = 0; k < 40; k++) {
      const r = int(rand, -5, 5)
      const s = int(rand, -5, 5)
      const top = mul([BigInt(-r), 1n], [BigInt(-s), 1n])
      const a = `(${show(top)})/${bracket(r)}`
      const res = rationalEqual(a, bracket(s))
      expect(res.verdict, a).toBe('equal')
      expect(res.excluded.map((e) => e.value)).toEqual([r])
      expect(rationalEqual(a, bracket(s + 1)).verdict, a).toBe('different')
    }
  })
})

describe('factorCheck: the factors multiply back, none is a constant, and each says if it is irreducible over ℚ', () => {
  const equal: [string, string, (boolean | 'unknown')[]][] = [
    ['x^2-1', '(x-1)(x+1)', [true, true]],
    ['x^2-2', 'x^2-2', [true]],
    ['x^2+2x+1', '(x+1)^2', [true]],
    ['2x^2-2', '2(x-1)(x+1)', [true, true]],
    ['x^3-x', 'x(x-1)(x+1)', [true, true, true]],
    ['x^4-1', '(x^2+1)(x-1)(x+1)', [true, true, true]],
    ['x^3-2', 'x^3-2', [true]],
    ['x^3-8', '(x-2)(x^2+2x+4)', [true, true]],
    ['x^3-8', 'x^3-8', [false]],
    ['x^4+4', '(x^2+2x+2)(x^2-2x+2)', [true, true]],
    ['x^4-4', 'x^4-4', ['unknown']],
    ['x^2-y^2', '(x-y)(x+y)', ['unknown', 'unknown']],
    ['x^2-4', '(x-2)(x+2)', [true, true]],
    ['x^2-4', 'x^2-4', [false]],
    ['6x^2+x-1', '(3x-1)(2x+1)', [true, true]],
    ['x^2+1', 'x^2+1', [true]],
    ['-x^2+1', '-(x-1)(x+1)', [true, true]],
    ['x^3+3x^2+3x+1', '(x+1)^3', [true]],
    ['4x^2-9', '(2x-3)(2x+3)', [true, true]],
    ['x^2/4 - 1', '(x/2-1)(x/2+1)', [true, true]],
    ['x^5-x', 'x(x-1)(x+1)(x^2+1)', [true, true, true, true]],
    ['1e-19x^2 - 1e-19', '1e-19(x-1)(x+1)', [true, true]]
  ]
  it.each(equal)('%s = %s', (e, f, irr) => {
    const r = factorCheck(e, f)
    expect(r.verdict).toBe('equal')
    expect(r.irreducibleOverQ).toEqual(irr)
  })
  const different: [string, string][] = [
    ['x^2-1', '(x-1)^2'],
    ['x^2-1', '(x-1)(x+2)'],
    ['x^2+2x+1', '(x+1)(x-1)'],
    ['x^3-8', '(x-2)(x^2+4)'],
    ['2x+2', '(1+1)(x+1)'],
    ['x^2-1', '(x^2-1)/1'],
    ['x^4-1', '(x^2-1)(x^2-1)'],
    ['6x^2+x-1', '(3x+1)(2x-1)'],
    ['x^2-4', '(x-4)(x+1)'],
    ['x^3-x', 'x(x-1)^2']
  ]
  it.each(different)('%s ≠ %s', (e, f) => expect(factorCheck(e, f).verdict).toBe('different'))
  it('a factor that is not rational stays unknown: x² − 2 = (x − √2)(x + √2)', () => {
    expect(factorCheck('x^2-2', '(x-sqrt(2))(x+sqrt(2))').verdict).toBe('unknown')
  })
  it('seeded: a product of brackets is a factorisation; a wrong root is not (40 cases)', () => {
    const rand = seeded(13)
    for (let k = 0; k < 40; k++) {
      const rs = [int(rand, -7, 7), int(rand, -7, 7), int(rand, -7, 7)]
      const p = rs.reduce<Coeffs>((acc, r) => mul(acc, [BigInt(-r), 1n]), [1n])
      const f = rs.map((r) => bracket(r)).join('*')
      const r = factorCheck(show(p), f)
      expect(r.verdict, f).toBe('equal')
      expect(r.irreducibleOverQ).toEqual([true, true, true])
      const wrong = [rs[0] + 1, rs[1], rs[2]].map((r) => bracket(r)).join('*')
      expect(factorCheck(show(p), wrong).verdict, wrong).toBe('different')
    }
  })
})

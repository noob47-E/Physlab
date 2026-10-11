// P-FIX-G00FENCE: math/engine/semantics.ts decided zero, a degree and a discriminant's sign with a fixed 1e-12, which is
// wrong at both ends of the scales physics uses. These pin the answers the contract must give; each failed before the fix.

import { describe, expect, it } from 'vitest'
import { findRootsNumeric, formatCancelledFactorRestriction, hasRealRootsNumeric, polyDivModNum, syntheticDivide } from '../../src/renderer/src/math/engine/semantics'

/** Coefficients low degree first. */
const close = (a: number[], b: number[], rel = 1e-9) => {
  expect(a.length, `${a} vs ${b}`).toBe(b.length)
  a.forEach((v, i) => expect(Math.abs(v - b[i]), `${a} vs ${b}`).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(b[i]))))
}

describe('degree trimming: a coefficient is zero only when it is zero', () => {
  it('1e-15·x² + x − 1 is a quadratic: two roots, not one', () => {
    const roots = findRootsNumeric([-1, 1, 1e-15])
    expect(roots).toHaveLength(2)
    expect(roots[1]).toBeCloseTo(1, 9)
  })
  it('a polynomial whose every coefficient is tiny keeps its roots: 10⁻¹³·x − 10⁻¹³ = 0 at x = 1', () => {
    close(findRootsNumeric([-1e-13, 1e-13]), [1])
  })
  it('a tiny cubic still divides: synthetic division of 10⁻¹³(x³ − 1) by x − 1', () => {
    close(syntheticDivide([-1e-13, 0, 0, 1e-13], 1), [1e-13, 1e-13, 1e-13], 1e-6)
  })
  it('long division of 10⁻¹³(x² − 1) by x − 1 gives 10⁻¹³(x + 1), remainder 0', () => {
    const { q, r } = polyDivModNum([-1e-13, 0, 1e-13], [-1, 1])
    close(q, [1e-13, 1e-13], 1e-6)
    expect(r.every((c) => c === 0)).toBe(true)
  })
  it('a degree-1 equation at 10⁻¹⁹ scale has its root, and hasRealRoots says so', () => {
    expect(hasRealRootsNumeric([-2e-19, 1e-19])).toBe(true)
  })
})

describe("the discriminant's sign, decided exactly", () => {
  it('10¹⁴·(x − 1/3)² has the double root 1/3 (float noise made the discriminant negative)', () => {
    const roots = findRootsNumeric([1e14 / 9, (-2e14) / 3, 1e14])
    expect(roots).toHaveLength(1)
    expect(roots[0]).toBeCloseTo(1 / 3, 6)
    expect(hasRealRootsNumeric([1e14 / 9, (-2e14) / 3, 1e14])).toBe(true)
  })
  it('10⁻⁸·(x − 1)² has the double root 1', () => {
    close(findRootsNumeric([1e-8, -2e-8, 1e-8]), [1])
  })
  it('a discriminant that is truly negative at a tiny scale is negative: 10⁻²⁰(x² + 1) has no real root', () => {
    expect(findRootsNumeric([1e-20, 0, 1e-20])).toEqual([])
    expect(hasRealRootsNumeric([1e-20, 0, 1e-20])).toBe(false)
  })
  it('a discriminant of +10⁻¹³ is positive: x² − 10⁻¹³ has two roots', () => {
    expect(findRootsNumeric([-1e-13, 0, 1])).toHaveLength(2)
  })
  it('a discriminant far below the smallest double keeps its sign: 10⁻²⁰⁰(x² + 1) has no root, 10⁻²⁰⁰(x² − 1) has ±1', () => {
    expect(findRootsNumeric([1e-200, 0, 1e-200])).toEqual([])
    expect(hasRealRootsNumeric([1e-200, 0, 1e-200])).toBe(false)
    close(findRootsNumeric([-1e-200, 0, 1e-200]), [-1, 1])
  })
  it('and far above the largest: 10²⁰⁰(x² − 3x + 2) has 1 and 2', () => {
    close(findRootsNumeric([2e200, -3e200, 1e200]), [1, 2])
  })
  it('b² and 4ac that are no doubles still judge the disc: 10⁻²⁰⁰(x² + x + 1) has no root, 10²⁰⁰·(x − 1/3)² one', () => {
    expect(findRootsNumeric([1e-200, 1e-200, 1e-200])).toEqual([])
    expect(hasRealRootsNumeric([1e-200, 1e-200, 1e-200])).toBe(false)
    const roots = findRootsNumeric([1.111111111111111e199, -6.666666666666666e199, 1e200])
    expect(roots).toHaveLength(1)
    expect(roots[0]).toBeCloseTo(1 / 3, 9)
  })
  it('a disc whose rational parts are no doubles is still a number: 5·10⁻³²⁴x² + x + 5·10⁻³²⁴ has roots, not NaN', () => {
    // −5·10⁻³²⁴ and −2·10³²³, past the largest double: −∞ is the honest double for it.
    const roots = findRootsNumeric([5e-324, 1, 5e-324])
    expect(roots).toEqual([-Infinity, -5e-324])
  })
})

describe('a given coefficient is never trimmed as noise; only a worked-out remainder is', () => {
  // (x − 1)(10⁻¹⁶x − 1) = 1 − (1 + 10⁻¹⁶)x + 10⁻¹⁶x²
  const given = [1, -1 - 1e-16, 1e-16]
  it('synthetic division by x − 1 keeps the 10⁻¹⁶x² term', () => {
    expect(syntheticDivide(given, 1)).toHaveLength(2)
  })
  it('long division by x − 1 keeps it too', () => {
    expect(polyDivModNum(given, [-1, 1]).q).toHaveLength(2)
  })
  it('1 − 10⁻¹⁶x² has real roots, ±10⁸', () => {
    expect(hasRealRootsNumeric([1, 0, -1e-16])).toBe(true)
  })
})

describe('complex noise is judged against the number itself', () => {
  it('a purely imaginary excluded point of size 10⁻¹³ is not 0', () => {
    expect(formatCancelledFactorRestriction('x', [{ re: 0, im: 1e-13 }]).text).not.toBe('x ≠ 0')
  })
  it('round-off on the imaginary part of a real point still reads as real', () => {
    expect(formatCancelledFactorRestriction('x', [{ re: 2, im: 1e-16 }]).text).toBe('x ≠ 2')
  })
})

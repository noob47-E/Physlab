// T7 proof for audit bug 24 [C8]: "Imaginary roots truncated to zero by absolute noise floor
// (calc/roots.ts:1065)".
//
// Verdict REAL (the cited file is wrong; the floor is calc/engine.ts:1065, and calc/roots.ts:192
// calls this polyRoots). Durand-Kerner's result is cleaned with `im < 1e-9 ? 0 : im`, an ABSOLUTE
// floor, so x² + 10⁻²⁰ = 0 — whose roots are ±10⁻¹⁰i — comes back as a double root at 0. Measured:
//   polyRoots([1, 0, 1e-20]) = [{re:0,im:0},{re:0,im:0}]
//   polyRoots([1, 0, 1e-12]) = ±10⁻⁶i   (above the floor, kept)
import { describe, expect, it } from 'vitest'
import { polyRoots } from '../src/renderer/src/calc/engine'

describe('G24: an imaginary root under 10⁻⁹ is flattened to zero', () => {
  it('x² + 10⁻²⁰ has the two imaginary roots ±10⁻¹⁰i', () => {
    const roots = polyRoots([1, 0, 1e-20])
    expect(roots.filter((r) => r.im !== 0)).toHaveLength(2)
    const size = Math.abs(roots[0].im)
    expect(size).toBeGreaterThan(9e-11)
    expect(size).toBeLessThan(1.1e-10)
  })

  it('the same polynomial a hundred times larger is already right', () => {
    const roots = polyRoots([1, 0, 1e-12])
    expect(Math.abs(roots[0].im)).toBeGreaterThan(9e-7)
    expect(Math.abs(roots[0].im)).toBeLessThan(1.1e-6)
  })

  it('ordinary roots are unchanged', () => {
    expect(polyRoots([1, 0, 1]).map((r) => r.im)).toEqual([-1, 1])
  })
})

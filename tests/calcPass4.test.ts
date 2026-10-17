// The Calculator, fourth pass: the two rare wrong answers the third pass's helper left (calc/roots.ts, calc/engine.ts).
//
// 1. A repeated root of a polynomial too big to expand ((x − 1)¹³ = 0, degree 13 beyond the 12 the line is expanded to) went to the
//    numeric search, which stops the moment |f| < 10⁻¹⁴ and answered x = 0.9163677215. A product of powers of polynomials is zero where
//    one of the bases is, so the bases are solved instead; and a search that is not a polynomial (sin x − ½)³ = 0 now accelerates past
//    the slow convergence a repeated root causes, or says its number is approximate.
// 2. x³ = 10³⁰ listed x₁ = 1×10^10, x₂ = 1×10^10, x₃ = 1×10^10: the complex pair's imaginary part, 8.66×10⁹, was called round-off
//    because it was judged against the size of the coefficients (10³⁰) and not against the size of the roots (10¹⁰).
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
import { polyRoots, solveNumeric, solveNumericChecked } from '../src/renderer/src/calc/engine'
import { polynomialInX, realAndPairs } from '../src/renderer/src/calc/roots'
import { reconcile } from '../src/renderer/src/calc/working'
import { runPure, suggestJob } from '../src/renderer/src/math/pure/run'
import { useCalc } from '../src/renderer/src/calc/calcStore'
import { resetGlobals } from './helpers/globals'

const START_VARS = useCalc.getState().vars
beforeEach(() => {
  resetGlobals()
  useCalc.setState({ vars: START_VARS })
})

/** "=" on a typed line (the field's LaTeX), with the letters the student has stored. */
const equals = (latex: string, angle: 'deg' | 'rad' = 'deg'): EvalResult => {
  const r = evaluateInput('COMP', latex, { vars: START_VARS, ans: 0, angle })
  if (!r) throw new Error(`no answer for ${latex}`)
  return r
}

/** (x − a)ⁿ = 0 as the field writes it. */
const power = (a: number, n: number): string => String.raw`\left(x${a < 0 ? '+' : '-'}${Math.abs(a)}\right)^{${n}}=0`

describe('a repeated root of a polynomial too big to expand is the root, never the point a search stopped at', () => {
  it('(x − 1)¹³ = 0 is x = 1', () => {
    const r = equals(power(1, 13))
    expect(r.error).toBeUndefined()
    expect(r.main).toBe('x = 1')
    expect(r.roots).toEqual([1])
    expect(r.approximate).toBeUndefined()
    expect(r.extra).toEqual(['L − R = 0'])
  })

  it('(x − 2)¹⁵ = 0 is x = 2 and (x + 1)¹⁴ = 0 is x = −1', () => {
    expect(equals(power(2, 15)).main).toBe('x = 2')
    expect(equals(power(-1, 14)).main).toBe('x = −1')
    expect(equals(power(-1, 14)).approximate).toBeUndefined()
  })

  it('whatever the power: (x − 3)ⁿ = 0 for n = 13 … 40 is x = 3', () => {
    for (let n = 13; n <= 40; n++) expect(equals(power(3, n)).main, `n = ${n}`).toBe('x = 3')
  })

  it('a product of powers lists each base’s roots once, in the order a quadratic is listed: (x − 1)¹³ (x + 2)¹⁵ = 0', () => {
    const r = equals(String.raw`\left(x-1\right)^{13}\left(x+2\right)^{15}=0`)
    expect(r.main).toBe('x₁ = 1, x₂ = −2')
    expect(r.roots).toEqual([1, -2])
    expect(r.approximate).toBeUndefined()
  })

  it('a big power of a quadratic names the base’s complex roots under the real one: (x² − 2x + 1)⁷ (x² + 1)⁶ = 0', () => {
    const r = equals(String.raw`\left(x^{2}-2x+1\right)^{7}\left(x^{2}+1\right)^{6}=0`)
    expect(r.main).toBe('x = 1')
    expect(r.extra).toEqual(['L − R = 0', 'Also, in complex numbers: x = ±i'])
  })

  it('the base on the right of the equals sign is read the same way: 0 = (x − 1)¹³', () => {
    expect(equals(String.raw`0=\left(x-1\right)^{13}`).main).toBe('x = 1')
  })

  it('only a power that equals ZERO is solved through its base: (x − 1)¹³ = 5 is x = 1 + ¹³√5, not x = 1', () => {
    const r = equals(String.raw`\left(x-1\right)^{13}=5`)
    expect(r.main).toBe('x = 2.131792791')
    expect(r.roots?.[0]).toBeCloseTo(2.131792791, 9)
  })

  it('a power plus something is not a product: (x − 1)¹³ + 1 = 0 is x = 0, not x = 1', () => {
    const r = equals(String.raw`\left(x-1\right)^{13}+1=0`)
    expect(r.main).toBe('x = 0')
  })

  it('polynomialInX hands back the base for a power too big to expand, and refuses a sum it cannot expand', () => {
    expect(polynomialInX('(x-1)^13', '0', {})).toEqual([1, -1])
    expect(polynomialInX('(x-1)^13 + 1', '0', {})).toBeNull()
    // Small enough to expand: still the whole polynomial, repeated roots and all.
    expect(polynomialInX('(x-1)^3', '0', {})).toEqual([1, -3, 3, -1])
  })
})

describe('a repeated root of a line that is not a polynomial is reached, or the card says it is approximate', () => {
  it('(sin x − ½)³ = 0 in radians is x = π/6 to ten figures, not 0.5235751287', () => {
    const r = equals(String.raw`\left(\sin x-\frac{1}{2}\right)^{3}=0`, 'rad')
    expect(r.error).toBeUndefined()
    expect(Number(r.value)).toBeCloseTo(Math.PI / 6, 9)
    expect(r.main).toBe('x = 0.5235987756')
    expect(r.approximate).toBeUndefined()
  })

  it('…and in degrees it is x = 30', () => {
    const r = equals(String.raw`\left(\sin x-\frac{1}{2}\right)^{3}=0`, 'deg')
    expect(r.main).toBe('x = 30')
  })

  it('an even-order root that round-off hides, (cos x − 1)² = 0, is near 0 and never an unflagged half-converged value', () => {
    // cos x − 1 is 0 for every |x| under 10⁻⁸, so the arithmetic cannot say where in that stretch the root is: the card says approximate.
    const r = equals(String.raw`\left(\cos x-1\right)^{2}=0`, 'rad')
    expect(Math.abs(Number(r.value))).toBeLessThan(1e-6)
    expect(r.approximate).toBe(true)
  })

  it('a simple root is as exact as it was: sin x = ½ in radians', () => {
    const r = equals(String.raw`\sin x=\frac{1}{2}`, 'rad')
    expect(r.main).toBe('x = 0.5235987756')
    expect(r.approximate).toBeUndefined()
  })

  it('a root the arithmetic cannot place is marked approximate, and the card says so: (x − 1)² + 10⁻¹³ sin(10¹² x) = 0', () => {
    // The function wobbles by 10⁻¹³ within a millionth of x = 1, so no number there is "the" root to ten figures.
    const r = equals(String.raw`\left(x-1\right)^{2}+10^{-13}\sin\left(10^{12}x\right)=0`, 'rad')
    expect(r.error).toBeUndefined()
    expect(r.approximate).toBe(true)
    const shown = reconcile(r, null)
    expect(shown.result.unconfirmed).toBe(true)
    expect(shown.result.extra?.join(' ')).toMatch(/approximate/)
  })

  it('solveNumericChecked says whether it settled: an accurate repeated root does, a wobbling one does not', () => {
    expect(solveNumericChecked((x) => (x - 1) ** 13, 0).settled).toBe(true)
    expect(solveNumericChecked((x) => (Math.sin(x) - 0.5) ** 3, 0).settled).toBe(true)
    expect(solveNumericChecked((x) => (x - 1) ** 2 + 1e-13 * Math.sin(1e12 * x), 0).settled).toBe(false)
  })

  it('solveNumeric converges on the root of a multiplicity-m factor from far away', () => {
    expect(solveNumeric((x) => (x - 1) ** 13, 0)).toBeCloseTo(1, 12)
    expect(solveNumeric((x) => (x + 1) ** 14, 0)).toBeCloseTo(-1, 12)
    expect(solveNumeric((x) => (Math.sin(x) - 0.5) ** 3, 0)).toBeCloseTo(Math.PI / 6, 10)
    // An ordinary simple root keeps its place.
    expect(solveNumeric((x) => x * x - 2, 1)).toBeCloseTo(Math.SQRT2, 12)
  })
})

describe('the card for a repeated root of a big power: "=" and the working agree or the working stays out of it', () => {
  it('(x − 1)¹³ = 0 and (x − 2)¹⁵ = 0 keep their answer on the card, unflagged', () => {
    for (const [a, n, answer] of [[1, 13, 'x = 1'], [2, 15, 'x = 2'], [-1, 14, 'x = −1']] as const) {
      const result = equals(power(a, n))
      const shown = reconcile(result, runPure(suggestJob(result.src), result.src))
      expect(shown.result.main, `(x ${a < 0 ? '+' : '−'} ${Math.abs(a)})^${n}`).toBe(answer)
      expect(shown.result.unconfirmed).toBeUndefined()
      expect(shown.verdict).not.toBe('differ')
    }
  })
})

describe('the imaginary part of a root is round-off only beside the size of the ROOTS, not the size of the coefficients', () => {
  it('x³ = 10³⁰ is x = 1×10^10 once, with the complex pair in the note', () => {
    const r = equals(String.raw`x^{3}=10^{30}`)
    expect(r.main).toBe('x = 1×10^10')
    expect(r.roots).toEqual([1e10])
    expect(r.extra?.join(' ')).toContain('Also, in complex numbers: x = −5×10^9 ± 8.660254038×10^9i')
  })

  it('x³ = 10⁻³⁰ is x = 1×10^-10 once, with its pair', () => {
    const r = equals(String.raw`x^{3}=10^{-30}`)
    expect(r.main).toBe('x = 1×10^-10')
    expect(r.extra?.join(' ')).toContain('8.660254038×10^-11i')
  })

  it('x³ = 8 is x = 2 with −1 ± 1.732050808i, as before', () => {
    const r = equals(String.raw`x^{3}=8`)
    expect(r.main).toBe('x = 2')
    expect(r.extra).toEqual(['L − R = 0', 'Also, in complex numbers: x = −1 ± 1.732050808i'])
  })

  it('x² = 10²⁰ is x₁ = 1×10^10, x₂ = −1×10^10, the order the quadratic formula gives', () => {
    const r = equals(String.raw`x^{2}=10^{20}`)
    expect(r.main).toBe('x₁ = 1×10^10, x₂ = −1×10^10')
    expect(r.roots).toEqual([1e10, -1e10])
  })

  it('x² − 2x + 1 = 0 is x = 1 and x² − 5x + 6 = 0 is x₁ = 3, x₂ = 2', () => {
    expect(equals(String.raw`x^{2}-2x+1=0`).main).toBe('x = 1')
    expect(equals(String.raw`x^{2}-5x+6=0`).main).toBe('x₁ = 3, x₂ = 2')
  })

  it('polyRoots keeps the pair of a big-coefficient cubic: one real root, two complex', () => {
    const roots = polyRoots([1, 0, 0, -1e30])
    expect(roots.filter((z) => z.im === 0)).toHaveLength(1)
    expect(roots.filter((z) => z.im !== 0)).toHaveLength(2)
    const pair = roots.filter((z) => z.im > 0)[0]
    expect(pair.re).toBeCloseTo(-5e9, -3)
    expect(pair.im / 1e9).toBeCloseTo(8.660254038, 8)
  })

  it('realAndPairs lists the one real root and the pair once each', () => {
    const { real, pairs } = realAndPairs([1, 0, 0, -1e30])
    expect(real).toEqual([1e10])
    expect(pairs).toEqual(['−5×10^9 ± 8.660254038×10^9i'])
  })

  it('a genuine round-off imaginary part is still dropped: (x − 1)(x − 2)(x − 3)(x − 4)(x − 5) is five real roots', () => {
    const { real, pairs } = realAndPairs([1, -15, 85, -225, 274, -120])
    expect(pairs).toEqual([])
    expect(real).toHaveLength(5)
  })

  it('a pair whose imaginary part is small beside the biggest root but real survives: (x − 10¹⁰)(x² + 1)', () => {
    const { real, pairs } = realAndPairs([1, -1e10, 1, -1e10])
    expect(real).toEqual([1e10])
    expect(pairs).toEqual(['±i'])
  })
})

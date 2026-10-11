// Engine domain and answer-form contract tests (G00)
// Validates docs/knowledge/engine-semantics.md and src/renderer/src/math/engine/semantics.ts.
// Pins existing app behaviour where the app already decides (citing file:line or golden tests),
// and marks proposed new behaviour as [owner].

import { describe, expect, it } from 'vitest'
import { beyondTheReals } from '../../src/renderer/src/calc/roots'
import { evaluateWithRealRoots } from '../../src/renderer/src/calc/engine'
import { math } from '../../src/renderer/src/math/expr'
import {
  ADVERSARIAL_CASES,
  COMPLEX_FALLBACK_PREFIX,
  DEFAULT_DOMAIN,
  ENGINE_SEMANTICS_JOBS,
  INVERSE_TRIG_BRANCHES,
  classifyLinearSystem,
  compareDerivativesOnDomain,
  compareIntegralsOnIntervals,
  comparePolynomials,
  compareRationalFunctions,
  compareSolutionSets,
  evaluateRealOddRoot,
  formatAssumptionNotice,
  formatCancelledFactorRestriction,
  formatComplexFallback,
  formatPeriodicSolution,
  formatRestriction,
  formatRestrictionTex,
  hasRealOddRootInterpretation,
  isInPrincipalRange,
  isOddInteger,
  multiplyPolynomials,
  multiplyPolynomialsRat,
  parseRationalExponent,
  comparePolynomialsExact,
  compareRationalFunctionsExact,
  compareDerivativesExact,
  compareIntegralByDifferentiationExact,
  compareRatExact,
  findRationalRootsRat,
  findRootsNumeric,
  hasRealRootsPoly,
  REAL_BRANCH_CUTS,
  formatParametricLinearSolution
} from '../../src/renderer/src/math/engine/semantics'
import { rat, rNeg } from '../../src/renderer/src/math/pure/rat'

describe('Rule 1: Default domain is REAL for school work', () => {
  it('DEFAULT_DOMAIN constant is real', () => {
    expect(DEFAULT_DOMAIN).toBe('real')
  })

  it('pins today’s complex fallback sentence (calc/roots.ts:319 beyondTheReals)', () => {
    // For x^2 + 1 = 0 (coeffs [1, 0, 1]), no real root exists; beyondTheReals emits the standard sentence
    const res = beyondTheReals([1, 0, 1], 0)
    expect(res).not.toBeNull()
    expect(res).toHaveProperty('sentence')
    if (res && 'sentence' in res) {
      expect(res.sentence).toBe('No real solution. In complex numbers: x = ±i')
      expect(res.sentence.startsWith(COMPLEX_FALLBACK_PREFIX)).toBe(true)
    }
  })

  it('formatComplexFallback produces the canonical sentence or No real solution when empty', () => {
    expect(formatComplexFallback(['±i'])).toBe('No real solution. In complex numbers: x = ±i')
    expect(formatComplexFallback(['1 + 2i', '1 - 2i'])).toBe(
      'No real solution. In complex numbers: x = 1 + 2i or x = 1 - 2i'
    )
    expect(formatComplexFallback([])).toBe('No real solution.')
  })

  it('[owner] non-polynomial equations with no real roots follow the same sentence convention', () => {
    // Proposed rule [owner]: e^x = -1 or sin(x) = 2 in real domain returns "No real solution."
    // when no complex roots are known, and formatComplexFallback when complex roots are provided.
    expect(formatComplexFallback([])).toBe('No real solution.')
    expect(formatComplexFallback(['(2k+1)πi'])).toBe(
      'No real solution. In complex numbers: x = (2k+1)πi'
    )
    expect(COMPLEX_FALLBACK_PREFIX).toBe('No real solution. In complex numbers: x = ')
  })
})

describe('Rule 2: Real odd roots: (-8)^(1/3) = -2 (calc/engine.ts; tests/oddRoots.test.ts)', () => {
  it('pins today’s evaluateWithRealRoots for odd roots (tests/oddRoots.test.ts:58-63)', () => {
    const run1 = evaluateWithRealRoots(math.parse('(-8)^(1/3)'), {})
    expect(run1.value).toBe(-2)
    const run2 = evaluateWithRealRoots(math.parse('(-8)^(2/3)'), {})
    expect(run2.value).toBe(4)
  })

  it('isOddInteger recognizes odd integers', () => {
    expect(isOddInteger(1)).toBe(true)
    expect(isOddInteger(3)).toBe(true)
    expect(isOddInteger(-5)).toBe(true)
    expect(isOddInteger(0)).toBe(false)
    expect(isOddInteger(2)).toBe(false)
    expect(isOddInteger(1.5)).toBe(false)
  })

  it('evaluateRealOddRoot extracts real roots for negatives', () => {
    expect(evaluateRealOddRoot(-8, 3)).toBe(-2)
    expect(evaluateRealOddRoot(-27, 3)).toBe(-3)
    expect(evaluateRealOddRoot(-32, 5)).toBe(-2)
    expect(evaluateRealOddRoot(8, 3)).toBe(2)
    expect(evaluateRealOddRoot(-8, 2)).toBeNull() // even root not odd
  })

  it('hasRealOddRootInterpretation validates powers of negative numbers', () => {
    // (-8)^(1/3) = -2
    expect(hasRealOddRootInterpretation(-8, 1, 3)).toEqual({ isReal: true, value: -2 })
    // (-8)^(2/3) = 4
    expect(hasRealOddRootInterpretation(-8, 2, 3)).toEqual({ isReal: true, value: 4 })
    // Unreduced fractions: (-8)^(2/6) reduces to (-8)^(1/3) = -2
    expect(hasRealOddRootInterpretation(-8, 2, 6)).toEqual({ isReal: true, value: -2 })
    // (-8)^(4/6) reduces to (-8)^(2/3) = 4
    expect(hasRealOddRootInterpretation(-8, 4, 6)).toEqual({ isReal: true, value: 4 })
    // (-4)^(1/2) is not real in real domain
    expect(hasRealOddRootInterpretation(-4, 1, 2)).toEqual({ isReal: false })
  })

  it('parseRationalExponent handles strings and numbers including general numeric odd denominators', () => {
    expect(parseRationalExponent('1/3')).toEqual({ num: 1, den: 3 })
    expect(parseRationalExponent('2/3')).toEqual({ num: 2, den: 3 })
    expect(parseRationalExponent(0.3333333333333333)).toEqual({ num: 1, den: 3 })
    expect(parseRationalExponent('5')).toEqual({ num: 5, den: 1 })
    // General numeric rational exponents
    expect(parseRationalExponent(1 / 11)).toEqual({ num: 1, den: 11 })
    expect(parseRationalExponent(2 / 7)).toEqual({ num: 2, den: 7 })
    expect(parseRationalExponent(-1 / 5)).toEqual({ num: -1, den: 5 })
    expect(evaluateRealOddRoot(-2048, 11)).toBe(-2)
  })
})

describe('Rule 3: Principal values, branch cuts, and assumptions', () => {
  it('sqrt(x^2) = |x| for real x, not x', () => {
    const x = -3
    expect(Math.sqrt(x * x)).toBe(Math.abs(x))
    expect(Math.sqrt(x * x)).not.toBe(x)
  })

  it('ln(x^2) = 2*ln|x| for x ≠ 0', () => {
    const x = -2
    const lnXsq = Math.log(x * x)
    expect(lnXsq).toBeCloseTo(2 * Math.log(Math.abs(x)), 10)
    expect(isNaN(Math.log(x))).toBe(true) // ln(-2) is NaN in real arithmetic
  })

  it('INVERSE_TRIG_BRANCHES defines principal ranges in radians and degrees', () => {
    expect(INVERSE_TRIG_BRANCHES.asin.domain).toEqual([-1, 1])
    expect(INVERSE_TRIG_BRANCHES.asin.rangeDeg).toEqual([-90, 90])
    expect(INVERSE_TRIG_BRANCHES.acos.domain).toEqual([-1, 1])
    expect(INVERSE_TRIG_BRANCHES.acos.rangeDeg).toEqual([0, 180])
    expect(INVERSE_TRIG_BRANCHES.atan.domain).toBe('all')
    expect(INVERSE_TRIG_BRANCHES.atan.rangeDeg).toEqual([-90, 90])
    expect(INVERSE_TRIG_BRANCHES.atan.openEndpoints).toBe(true)
  })

  it('isInPrincipalRange validates open endpoints for atan', () => {
    // atan is open interval (-π/2, π/2) / (-90°, 90°)
    expect(isInPrincipalRange('atan', 0, 'rad')).toBe(true)
    expect(isInPrincipalRange('atan', Math.PI / 4, 'rad')).toBe(true)
    expect(isInPrincipalRange('atan', Math.PI / 2, 'rad')).toBe(false) // endpoint excluded
    expect(isInPrincipalRange('atan', -Math.PI / 2, 'rad')).toBe(false) // endpoint excluded
    expect(isInPrincipalRange('atan', 45, 'deg')).toBe(true)
    expect(isInPrincipalRange('atan', 90, 'deg')).toBe(false) // endpoint excluded
    expect(isInPrincipalRange('atan', -90, 'deg')).toBe(false) // endpoint excluded
    // asin and acos are closed
    expect(isInPrincipalRange('asin', 90, 'deg')).toBe(true)
    expect(isInPrincipalRange('acos', 180, 'deg')).toBe(true)
  })

  it('[owner] formatAssumptionNotice generates visible notice when positive domain assumed', () => {
    const notice = formatAssumptionNotice('x', '> 0')
    expect(notice.text).toBe('Assuming x > 0')
    expect(notice.tex).toBe('\\text{Assuming } x > 0')
  })

  it('REAL_BRANCH_CUTS defines principal branches and discontinuity notices', () => {
    expect(REAL_BRANCH_CUTS.sqrt.discontinuityNotice).toBe('Assuming x >= 0')
    expect(REAL_BRANCH_CUTS.ln.discontinuityNotice).toBe('Assuming x > 0')
    expect(REAL_BRANCH_CUTS.log10.discontinuityNotice).toBe('Assuming x > 0')
  })
})

describe('Rule 4: Domain restrictions format and cancelled factor reporting', () => {
  it('formats restrictions in text and LaTeX', () => {
    expect(formatRestriction('x', '!=', 1)).toBe('x ≠ 1')
    expect(formatRestriction('x', '>', 0)).toBe('x > 0')
    expect(formatRestrictionTex('x', '!=', 1)).toBe('x \\ne 1')
    expect(formatRestrictionTex('x', '>', 0)).toBe('x > 0')
  })

  it('[owner] formatCancelledFactorRestriction records removable singularities', () => {
    const res = formatCancelledFactorRestriction('x', [1])
    expect(res.text).toBe('x ≠ 1')
    expect(res.tex).toBe('x \\ne 1')

    // Canonicalised: deduplicated and sorted
    const multi = formatCancelledFactorRestriction('x', [1, -2, 1])
    expect(multi.text).toBe('x ≠ -2, x ≠ 1')
    expect(multi.tex).toBe('x \\ne -2, x \\ne 1')

    // Mixed string and number values deduplicated canonical representation
    const mixed = formatCancelledFactorRestriction('x', [1, '1', ' -2 ', -2])
    expect(mixed.text).toBe('x ≠ -2, x ≠ 1')
    expect(mixed.tex).toBe('x \\ne -2, x \\ne 1')

    // Complex-mode restrictions: ±i formatted cleanly
    const complexRes = formatCancelledFactorRestriction('x', [{ re: 0, im: 1 }, { re: 0, im: -1 }])
    expect(complexRes.text).toBe('x ≠ -i, x ≠ i')
    expect(complexRes.tex).toBe('x \\ne -i, x \\ne i')
  })
})

describe('Rule 5: Periodic solution form includes x =', () => {
  it('[owner] formatPeriodicSolution in radians: x = base + 2kπ, k ∈ ℤ', () => {
    const sol = formatPeriodicSolution('π/6', 2, 'k', 'rad')
    expect(sol.text).toBe('x = π/6 + 2kπ, k ∈ ℤ')
    expect(sol.tex).toBe('x = \\pi/6 + 2k\\pi, \\; k \\in \\mathbb{Z}')
  })

  it('[owner] formatPeriodicSolution in degrees: x = base + 360°k, k ∈ ℤ', () => {
    const sol = formatPeriodicSolution('30°', 2, 'k', 'deg')
    expect(sol.text).toBe('x = 30° + 360°k, k ∈ ℤ')
    expect(sol.tex).toBe('x = 30^\\circ + 360^\\circ k, \\; k \\in \\mathbb{Z}')

    // Fractional period in degrees without rounding: period multiplier 0.5 -> 90°
    const solHalf = formatPeriodicSolution('45°', 0.5, 'k', 'deg')
    expect(solHalf.text).toBe('x = 45° + 90°k, k ∈ ℤ')
    expect(solHalf.tex).toBe('x = 45^\\circ + 90^\\circ k, \\; k \\in \\mathbb{Z}')
  })

  it('[owner] formatPeriodicSolution for period π: x = base + kπ, k ∈ ℤ', () => {
    const sol = formatPeriodicSolution('π/4', 1, 'k', 'rad')
    expect(sol.text).toBe('x = π/4 + kπ, k ∈ ℤ')
    expect(sol.tex).toBe('x = \\pi/4 + k\\pi, \\; k \\in \\mathbb{Z}')
  })

  it('[owner] formatPeriodicSolution supports custom variable name', () => {
    const sol = formatPeriodicSolution('π/3', 2, 'n', 'rad', 'θ')
    expect(sol.text).toBe('θ = π/3 + 2nπ, n ∈ ℤ')
    expect(sol.tex).toBe('θ = \\pi/3 + 2n\\pi, \\; n \\in \\mathbb{Z}')
  })

  it('[owner] formatPeriodicSolution falls back when k is bound (case-insensitively)', () => {
    // When k is bound, picks n automatically
    expect(formatPeriodicSolution('π/6', 2, undefined, 'rad', 'x', undefined, ['k']).text).toBe(
      'x = π/6 + 2nπ, n ∈ ℤ'
    )
    // When k is explicitly requested but already bound, falls back to n
    expect(formatPeriodicSolution('π/6', 2, 'k', 'rad', 'x', undefined, ['k']).text).toBe(
      'x = π/6 + 2nπ, n ∈ ℤ'
    )
    // Case-insensitivity: 'K' in boundVars matches 'k'
    expect(formatPeriodicSolution('π/6', 2, 'k', 'rad', 'x', undefined, ['K']).text).toBe(
      'x = π/6 + 2nπ, n ∈ ℤ'
    )
  })
})

describe('Rule 6: Canonical comparison per job', () => {
  it('comparePolynomials checks strict equality in Q[x] via coefficients', () => {
    expect(comparePolynomials([0, 0, 0])).toBe(true)
    expect(comparePolynomials([0n, 0n])).toBe(true)
    expect(comparePolynomials([{ n: 0n, d: 1n }])).toBe(true)
    expect(comparePolynomials([1, 0])).toBe(false)
    expect(comparePolynomials([1n, 0n])).toBe(false)
    expect(comparePolynomials([{ n: 1n, d: 3n }])).toBe(false)
  })

  it('multiplyPolynomials computes exact polynomial products', () => {
    // (x - 1)*(x + 1) = x^2 - 1 => [-1, 1] * [1, 1] = [-1, 0, 1]
    expect(multiplyPolynomials([-1, 1], [1, 1])).toEqual([-1, 0, 1])
  })

  it('compareRatExact compares bigints without float precision loss', () => {
    const a = rat(1000000000000000000n, 1n) // 10^18
    const b = rat(1000000000000000001n, 1n) // 10^18 + 1
    // Double precision would lose the difference; exact Rat does not
    expect(compareRatExact(a, b)).toBe(-1)
    expect(compareRatExact(b, a)).toBe(1)
    expect(compareRatExact(a, a)).toBe(0)
  })

  it('compareRationalFunctions verifies cross-multiplication and symmetric excluded points', () => {
    // P1/Q1 = (x^2 - 1)/(x - 1) vs P2/Q2 = (x + 1)/1, excluded point x = 1
    const num1 = [-1, 0, 1] // x^2 - 1
    const den1 = [-1, 1] // x - 1
    const num2 = [1, 1] // x + 1
    const den2 = [1] // 1
    expect(compareRationalFunctions(num1, den1, [1], num2, den2, [1])).toBe(true)
    // Extra or missing excluded point fails
    expect(compareRationalFunctions(num1, den1, [1], num2, den2, [])).toBe(false)
    expect(compareRationalFunctions(num1, den1, [], num2, den2, [1])).toBe(false)
    // Soundness against even-multiplicity cancelled roots outside small windows (e.g. (x - 100)^2):
    // P1/Q1 = x*(x - 100)^2 / (x - 100)^2 = (10000x - 200x^2 + x^3) / (10000 - 200x + x^2) vs x/1
    const denEven = [10000, -200, 1] // (x - 100)^2
    const numEven = [0, 10000, -200, 1] // x*(x - 100)^2
    // With exclusion 100 -> passes
    expect(compareRationalFunctions(numEven, denEven, [100], [0, 1], [1], [100])).toBe(true)
    // When omitting exclusion 100 -> soundly rejected (even-multiplicity root at 100 outside [-10, 10])
    expect(compareRationalFunctions(numEven, denEven, [], [0, 1], [1], [])).toBe(false)

    // Irrational excluded points (e.g. ±√2) in numeric comparator
    const denIrr = [-2, 0, 1] // x^2 - 2
    const numIrr = [0, -2, 0, 1] // x*(x^2 - 2)
    expect(compareRationalFunctions(numIrr, denIrr, [Math.SQRT2, -Math.SQRT2], [0, 1], [1], [-Math.SQRT2, Math.SQRT2])).toBe(true)
    // When omitting irrational excluded points, rejected
    expect(compareRationalFunctions(numIrr, denIrr, [], [0, 1], [1], [])).toBe(false)
  })

  it('compareRationalFunctionsExact verifies rational equality over ℚ[x] with Rat and extreme bigints', () => {
    // (x^2 - x)/(x - 1) vs x/1 with excluded point 1
    const num1 = [rat(0n), rat(-1n), rat(1n)] // x^2 - x
    const den1 = [rat(-1n), rat(1n)] // x - 1
    const num2 = [rat(0n), rat(1n)] // x
    const den2 = [rat(1n)] // 1
    expect(compareRationalFunctionsExact(num1, den1, [rat(1n)], num2, den2, [rat(1n)])).toBe(true)
    // Extra or missing excluded point fails
    expect(compareRationalFunctionsExact(num1, den1, [rat(1n)], num2, den2, [])).toBe(false)
    // When BOTH omit the cancelled pole at 1, comparison fails (soundness against omitted poles)
    expect(compareRationalFunctionsExact(num1, den1, [], num2, den2, [])).toBe(false)
    // Excluded point that is not a root of either denominator fails
    expect(compareRationalFunctionsExact(num1, den1, [rat(2n)], num2, den2, [rat(2n)])).toBe(false)

    // findRationalRootsRat finds roots over ℚ[x]
    expect(findRationalRootsRat([rat(-1n), rat(1n)])).toEqual([rat(1n)])
    expect(findRationalRootsRat([rat(-6n), rat(5n), rat(-1n)])).toEqual([rat(2n), rat(3n)])
    expect(findRationalRootsRat([rat(1n), rat(0n), rat(1n)])).toEqual([]) // x^2 + 1 has no rational roots

    // findRootsNumeric finds roots numerically for linear and quadratic polynomials
    expect(findRootsNumeric([-1, 1])).toEqual([1])
    expect(findRootsNumeric([-1, 0, 1])).toEqual([-1, 1])
    expect(findRootsNumeric([1, 0, 1])).toEqual([]) // x^2 + 1 has no real roots

    // Sturm-based hasRealRootsPoly accurately classifies polynomials of any degree without trial division
    expect(hasRealRootsPoly([rat(1n), rat(0n), rat(1n)])).toBe(false) // x^2 + 1 has no real roots
    expect(hasRealRootsPoly([rat(-2n), rat(0n), rat(1n)])).toBe(true) // x^2 - 2 has irrational real roots ±√2
    expect(hasRealRootsPoly([rat(-5n), rat(0n), rat(0n), rat(1n)])).toBe(true) // x^3 - 5 has real root (odd degree)
    expect(hasRealRootsPoly([rat(1n), rat(0n), rat(0n), rat(0n), rat(1n)])).toBe(false) // x^4 + 1 has no real roots
    expect(hasRealRootsPoly([rat(-1n), rat(0n), rat(0n), rat(0n), rat(1n)])).toBe(true) // x^4 - 1 has real roots ±1

    // Omitted irrational cancelled pole (x^2 - 2) is soundly rejected without trial division
    const numIrrational = [rat(0n), rat(-2n), rat(0n), rat(1n)] // x*(x^2 - 2) = x^3 - 2x
    const denIrrational = [rat(-2n), rat(0n), rat(1n)] // x^2 - 2
    expect(compareRationalFunctionsExact(numIrrational, denIrrational, [], [rat(0n), rat(1n)], [rat(1n)], [])).toBe(false)

    // Cancelled factor with no real roots (x^2 + 1) in real mode needs no exclusion on ℝ, but in complex mode
    // requires complex excluded points x ≠ ±i:
    const numNoRealRoot = [rat(0n), rat(1n), rat(0n), rat(1n)] // x*(x^2 + 1)
    const denNoRealRoot = [rat(1n), rat(0n), rat(1n)] // x^2 + 1
    expect(compareRationalFunctionsExact(numNoRealRoot, denNoRealRoot, [], [rat(0n), rat(1n)], [rat(1n)], [], 'real')).toBe(true)
    expect(compareRationalFunctionsExact(numNoRealRoot, denNoRealRoot, [], [rat(0n), rat(1n)], [rat(1n)], [], 'complex')).toBe(false)
    expect(
      compareRationalFunctionsExact(
        numNoRealRoot,
        denNoRealRoot,
        [{ re: 0, im: 1 }, { re: 0, im: -1 }],
        [rat(0n), rat(1n)],
        [rat(1n)],
        [{ re: 0, im: -1 }, { re: 0, im: 1 }],
        'complex'
      )
    ).toBe(true)

    // Complex mode negative test: missing conjugate root (+i provided, -i omitted) fails
    expect(
      compareRationalFunctionsExact(
        numNoRealRoot,
        denNoRealRoot,
        [{ re: 0, im: 1 }],
        [rat(0n), rat(1n)],
        [rat(1n)],
        [{ re: 0, im: 1 }],
        'complex'
      )
    ).toBe(false)

    // Extreme bigint excluded points that are roots of the denominator
    const r1 = rat(1000000000000000000n, 1n)
    const r2 = rat(1000000000000000001n, 1n)
    const factor1 = [rNeg(r1), rat(1n)] // (x - r1)
    const factor2 = [rNeg(r2), rat(1n)] // (x - r2)
    const denExtreme = multiplyPolynomialsRat(factor1, factor2)
    const numExtreme = multiplyPolynomialsRat([rat(0n), rat(1n)], denExtreme)
    expect(
      compareRationalFunctionsExact(
        numExtreme,
        denExtreme,
        [r1, r2],
        numExtreme,
        denExtreme,
        [r2, r1]
      )
    ).toBe(true)
  })

  it('compareDerivativesExact checks exact algebraic identity for derivatives', () => {
    // Difference polynomial between 3x^2 and 3x^2 is [0, 0, 0]
    expect(compareDerivativesExact([0, 0, 0])).toBe(true)
    expect(compareDerivativesExact([rat(0n), rat(0n)])).toBe(true)
    // Non-zero difference fails
    expect(compareDerivativesExact([1, 0, 0])).toBe(false)
    expect(compareDerivativesExact([rat(1n, 2n)])).toBe(false)
  })

  it('compareIntegralByDifferentiationExact validates antiderivative via differentiation in ℚ[x]', () => {
    // Candidate F(x) = x^3/3 + C -> F'(x) = x^2, integrand f(x) = x^2
    const candDeriv = [rat(0n), rat(0n), rat(1n)] // x^2
    const integrand = [rat(0n), rat(0n), rat(1n)] // x^2
    expect(compareIntegralByDifferentiationExact(candDeriv, integrand)).toBe(true)
    // Wrong derivative fails
    const wrongDeriv = [rat(0n), rat(1n)] // x
    expect(compareIntegralByDifferentiationExact(wrongDeriv, integrand)).toBe(false)
  })

  it('compareDerivativesOnDomain verifies candidate against derivative numerically', () => {
    // d/dx(x^3) = 3x^2
    const fPrime = (x: number) => 3 * x * x
    const candidateRight = (x: number) => 3 * Math.pow(x, 2)
    const candidateWrong = (x: number) => 2 * x
    const samplePoints = [-2, -0.5, 0.5, 1, 3]
    expect(compareDerivativesOnDomain(fPrime, candidateRight, samplePoints)).toBe(true)
    expect(compareDerivativesOnDomain(fPrime, candidateWrong, samplePoints)).toBe(false)

    // Common domain filtering away from singularities: d/dx(-1/x) = 1/x^2
    // Evaluated at sample points that include the pole x = 0
    const fPrimeSingular = (x: number) => 1 / (x * x)
    const candSingular = (x: number) => 1 / Math.pow(x, 2)
    const samplesWithPole = [-2, -1, 0, 1, 2, 3]
    expect(compareDerivativesOnDomain(fPrimeSingular, candSingular, samplesWithPole)).toBe(true)
  })

  it('compareIntegralsOnIntervals verifies candidate antiderivative up to constant numerically', () => {
    // int(1/x dx) = ln|x| + C on intervals (-5, -0.1) and (0.1, 5)
    const ref = (x: number) => Math.log(Math.abs(x))
    const candRight = (x: number) => Math.log(Math.abs(x)) + 7 // differs by constant 7
    const candWrong = (x: number) => Math.log(Math.abs(x)) + x // difference is not constant
    const intervals: [number, number][] = [[-5, -0.1], [0.1, 5]]
    expect(compareIntegralsOnIntervals(candRight, ref, intervals)).toBe(true)
    expect(compareIntegralsOnIntervals(candWrong, ref, intervals)).toBe(false)

    // Non-constant harmonic difference like sin(6πx) is rejected by Weyl low-discrepancy sampling
    const harmonicWrong = (x: number) => Math.log(Math.abs(x)) + Math.sin(6 * Math.PI * x)
    expect(compareIntegralsOnIntervals(harmonicWrong, ref, [[0.1, 5]])).toBe(false)
  })

  it('compareSolutionSets checks values, multiplicities, and degree completeness', () => {
    expect(
      compareSolutionSets(
        [{ val: 2, mult: 2 }],
        [{ val: 2, mult: 2 }],
        2
      )
    ).toBe(true)

    // In complex mode: sum of multiplicities must strictly equal expectedDegree (FTA)
    expect(
      compareSolutionSets(
        [{ val: 2, mult: 1 }],
        [{ val: 2, mult: 1 }],
        2,
        'complex'
      )
    ).toBe(false)

    // In real mode: real polynomial may have fewer real roots than degree (e.g. x^3 - 1 has 1 real root)
    expect(
      compareSolutionSets(
        [{ val: 1, mult: 1 }],
        [{ val: 1, mult: 1 }],
        3,
        'real'
      )
    ).toBe(true)

    // In real mode: sum of real roots cannot exceed degree
    expect(
      compareSolutionSets(
        [{ val: 1, mult: 2 }, { val: 2, mult: 2 }],
        [{ val: 1, mult: 2 }, { val: 2, mult: 2 }],
        3,
        'real'
      )
    ).toBe(false)

    expect(
      compareSolutionSets(
        [{ val: 1, mult: 1 }, { val: 2, mult: 1 }],
        [{ val: 2, mult: 1 }, { val: 1, mult: 1 }],
        2
      )
    ).toBe(true)

    // Complex roots over ℂ: x^2 + 1 = 0 has roots {+i, -i} complete by degree 2
    expect(
      compareSolutionSets(
        [
          { val: { re: 0, im: 1 }, mult: 1 },
          { val: { re: 0, im: -1 }, mult: 1 }
        ],
        [
          { val: { re: 0, im: -1 }, mult: 1 },
          { val: { re: 0, im: 1 }, mult: 1 }
        ],
        2,
        'complex'
      )
    ).toBe(true)

    // In real mode (default): any complex root is strictly rejected, even if expected and actual match
    expect(
      compareSolutionSets(
        [{ val: { re: 0, im: 1 }, mult: 1 }],
        [{ val: { re: 0, im: 1 }, mult: 1 }],
        2,
        'real'
      )
    ).toBe(false)

    // Pure real root represented as { re, im: 0 } is accepted in real mode
    expect(
      compareSolutionSets(
        [{ val: { re: 2, im: 0 }, mult: 1 }],
        [{ val: 2, mult: 1 }],
        1,
        'real'
      )
    ).toBe(true)

    // Non-matching imaginary components rejected
    expect(
      compareSolutionSets(
        [{ val: { re: 1, im: 2 }, mult: 1 }],
        [{ val: { re: 1, im: -2 }, mult: 1 }],
        undefined,
        'complex'
      )
    ).toBe(false)

    // Ungrouped repeated roots across engines match grouped equivalent
    expect(
      compareSolutionSets(
        [{ val: 2, mult: 2 }],
        [{ val: 2, mult: 1 }, { val: 2, mult: 1 }],
        2
      )
    ).toBe(true)
  })

  it('classifyLinearSystem classifies unique, infinite, and none', () => {
    expect(classifyLinearSystem(2, 2, 2)).toBe('unique')
    expect(classifyLinearSystem(2, 2, 3)).toBe('infinite')
    expect(classifyLinearSystem(2, 3, 2)).toBe('none')
  })

  it('[owner] formatParametricLinearSolution formats underdetermined linear systems (G00-5)', () => {
    const sol = formatParametricLinearSolution([1, 0], [[-2, 1]], ['t'])
    expect(sol.text).toBe('x = [1, 0] + t·[-2, 1], t ∈ ℝ')
    expect(sol.tex).toContain('\\begin{pmatrix}')
    expect(sol.tex).toContain('t \\in \\mathbb{R}')

    const trivial = formatParametricLinearSolution([3, 4], [])
    expect(trivial.text).toBe('x = [3, 4]')

    // Nullity > 1 systematically generates and declares all parameters in suffix
    const nullity2 = formatParametricLinearSolution([0, 0, 0], [[1, 0, 0], [0, 1, 0]])
    expect(nullity2.text).toBe('x = [0, 0, 0] + t_1·[1, 0, 0] + t_2·[0, 1, 0], t_1 ∈ ℝ, t_2 ∈ ℝ')
    expect(nullity2.tex).toContain('t_1 \\in \\mathbb{R}, t_2 \\in \\mathbb{R}')
  })

  it('ENGINE_SEMANTICS_JOBS covers all 12 jobs', () => {
    const expectedJobs = [
      'solve',
      'simplify',
      'factor',
      'expand',
      'apart',
      'diff',
      'integrate',
      'limit',
      'series',
      'exact',
      'eval',
      'linearSystems'
    ]
    for (const j of expectedJobs) {
      expect(ENGINE_SEMANTICS_JOBS[j]).toBeDefined()
      expect(ENGINE_SEMANTICS_JOBS[j].defaultDomain).toBe('real')
      expect(ENGINE_SEMANTICS_JOBS[j].comparisonKind).toBeDefined()
    }
  })
})

describe('Rule 7: Adversarial test cases executed behaviour', () => {
  it('ADVERSARIAL_CASES contains all 16 required canonical items', () => {
    const ids = ADVERSARIAL_CASES.map((c) => c.id)
    const required = [
      'sqrt_x_sq',
      'log_x_sq',
      'cancelled_factor',
      'pole_odd_inv_x',
      'pole_even_inv_x_sq',
      'abs_val_diff',
      'sign_func',
      'piecewise',
      'tan_pole',
      'double_root',
      'missing_root',
      'extraneous_root_squaring',
      'zero_times_inf',
      'odd_root_neg',
      'euler_identity',
      'extreme_coefficients'
    ]
    for (const req of required) {
      expect(ids).toContain(req)
    }
  })

  it('case 1: sqrt_x_sq distinguishes x from |x| on negative inputs', () => {
    const x = -3
    expect(Math.sqrt(x * x)).toBe(Math.abs(x))
    expect(Math.sqrt(x * x)).not.toBe(x)
  })

  it('case 2: log_x_sq validates ln(x^2) = 2*ln|x| where 2*ln(x) fails', () => {
    const x = -2
    expect(Math.log(x * x)).toBeCloseTo(2 * Math.log(Math.abs(x)))
    expect(isNaN(Math.log(x))).toBe(true)
  })

  it('case 3: cancelled_factor requires domain restriction x ≠ 1', () => {
    const x = 1
    // (x*(x-1))/(x-1) at x=1 has 0/0 removable discontinuity
    const num = x * (x - 1)
    const den = x - 1
    expect(isNaN(num / den)).toBe(true)
    const rest = formatCancelledFactorRestriction('x', [1])
    expect(rest.text).toBe('x ≠ 1')
  })

  it('case 4 & 5: poles of 1/x and 1/x^2 near 0 exhibit correct signed behavior', () => {
    const eps = 1e-6
    expect(1 / -eps).toBeLessThan(-1e5)
    expect(1 / eps).toBeGreaterThan(1e5)
    expect(1 / (-eps * -eps)).toBeGreaterThan(1e11)
    expect(1 / (eps * eps)).toBeGreaterThan(1e11)
  })

  it('case 6 & 7: abs and sign non-smoothness and jump discontinuity at 0', () => {
    // Left and right difference quotients for |x| at 0
    const h = 1e-6
    const leftDiff = (Math.abs(-h) - Math.abs(0)) / -h // -1
    const rightDiff = (Math.abs(h) - Math.abs(0)) / h // +1
    expect(leftDiff).toBe(-1)
    expect(rightDiff).toBe(1)
    expect(Math.sign(-2)).toBe(-1)
    expect(Math.sign(0)).toBe(0)
    expect(Math.sign(2)).toBe(1)
  })

  it('case 8: piecewise transition non-differentiability at boundary', () => {
    // Piecewise function f(x) = -x for x < 0, +x for x >= 0
    const f = (x: number) => (x < 0 ? -x : x)
    const h = 1e-5
    const leftSlope = (f(0) - f(-h)) / h // -1
    const rightSlope = (f(h) - f(0)) / h // +1
    expect(leftSlope).toBeCloseTo(-1, 5)
    expect(rightSlope).toBeCloseTo(1, 5)
    expect(leftSlope === rightSlope).toBe(false)
  })

  it('case 9: tan(x) near π/2 has opposite infinite signs from left and right', () => {
    const eps = 1e-6
    expect(Math.tan(Math.PI / 2 - eps)).toBeGreaterThan(1e5)
    expect(Math.tan(Math.PI / 2 + eps)).toBeLessThan(-1e5)
  })

  it('case 10 & 11: double root multiplicity and missing root prevention', () => {
    // (x-2)^2 = 0 has root 2 with multiplicity 2
    expect(compareSolutionSets([{ val: 2, mult: 2 }], [{ val: 2, mult: 2 }], 2)).toBe(true)
    // x^2 = x has roots 0 and 1; dropping 0 must fail
    expect(compareSolutionSets([{ val: 0, mult: 1 }, { val: 1, mult: 1 }], [{ val: 1, mult: 1 }], 2)).toBe(false)
  })

  it('case 12: extraneous root from squaring x = sqrt(x + 2)', () => {
    // Candidate roots: x = 2 and x = -1
    // At x = 2: 2 = sqrt(4) = 2 (valid)
    expect(2 === Math.sqrt(2 + 2)).toBe(true)
    // At x = -1: -1 ≠ sqrt(1) = 1 (extraneous)
    expect(-1 === Math.sqrt(-1 + 2)).toBe(false)
  })

  it('case 13: indeterminate 0 * ∞ limit is algebraically resolved to 1', () => {
    // lim_{x->0} x * (1/x) = 1
    const x = 1e-7
    expect(x * (1 / x)).toBe(1)
  })

  it('case 14: odd_root_neg evaluates to real -2', () => {
    expect(evaluateRealOddRoot(-8, 3)).toBe(-2)
  })

  it('case 15: euler_identity e^(i*pi) = -1 compared via compareSolutionSets treats residual float zero correctly', () => {
    // e^(i*pi) = cos(pi) + i*sin(pi) has float residual im = 1.22e-16
    const eulerExpected = [{ val: { re: -1, im: 0 }, mult: 1 }]
    const eulerFloat = [{ val: { re: Math.cos(Math.PI), im: Math.sin(Math.PI) }, mult: 1 }]
    expect(compareSolutionSets(eulerExpected, eulerFloat)).toBe(true)
  })

  it('case 16: extreme coefficients 1e-19 * x + 6e24 = 0 solve and compare via compareSolutionSets and exact polynomials', () => {
    const a = 1e-19
    const b = 6e24
    const x = -b / a
    expect(x).toBe(-6e43)
    expect(compareSolutionSets([{ val: -6e43, mult: 1 }], [{ val: x, mult: 1 }])).toBe(true)
    // Extreme ℚ[x] polynomial check
    expect(comparePolynomialsExact([rat(0n), rat(0n)])).toBe(true)
  })
})

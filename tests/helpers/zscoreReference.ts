// A high-precision Φ that owes nothing to normal.ts, for the tests to check the product against.
//
// erf is summed from the series erf(x) = (2/√π) e^(−x²) Σ 2ⁿ x^(2n+1) / (2n+1)!!, whose terms are
// all positive, so nothing cancels and a double keeps its full sixteen digits out to x ≈ 4
// (z ≈ 5.7). Beyond that the tail is taken from the erfc continued fraction (modified Lentz),
// which is accurate where the series is not. The two overlap between x = 2 and 4 and the tests
// check they agree there, so neither is trusted on its own word.

const TWO_OVER_SQRT_PI = 2 / Math.sqrt(Math.PI)

/** erf(x) by the all-positive series; good to ~1e-16 relative for |x| ≤ 4. */
export function erfSeries(x: number): number {
  const x2 = x * x
  let term = x
  let sum = x
  for (let n = 0; n < 400; n++) {
    term *= (2 * x2) / (2 * n + 3)
    sum += term
    if (Math.abs(term) < Math.abs(sum) * 1e-17) break
  }
  return TWO_OVER_SQRT_PI * Math.exp(-x2) * sum
}

/** erfc(x) for x > 0 by the continued fraction, evaluated with the modified Lentz method. */
export function erfcFraction(x: number): number {
  // erfc(x) = e^(−x²)/√π · 1/(x + (1/2)/(x + 1/(x + (3/2)/(x + 2/(x + ...)))))
  const tiny = 1e-300
  let f = x
  if (f === 0) f = tiny
  let c = f
  let d = 0
  for (let n = 1; n < 500; n++) {
    const an = n / 2
    const bn = x
    d = bn + an * d
    if (d === 0) d = tiny
    c = bn + an / c
    if (c === 0) c = tiny
    d = 1 / d
    const delta = c * d
    f *= delta
    if (Math.abs(delta - 1) < 1e-16) break
  }
  return (Math.exp(-x * x) / Math.sqrt(Math.PI)) / f
}

/** Φ(z) to full double precision, absolute error well under 1e-15. */
export function phiExact(z: number): number {
  const x = z / Math.SQRT2
  if (Math.abs(x) <= 3) return 0.5 * (1 + erfSeries(x))
  return x > 0 ? 1 - 0.5 * erfcFraction(x) : 0.5 * erfcFraction(-x)
}

/** The upper tail 1 − Φ(z) without cancellation, for the small-p checks. */
export function upperTailExact(z: number): number {
  const x = z / Math.SQRT2
  if (x > 2) return 0.5 * erfcFraction(x)
  return 1 - phiExact(z)
}

/** Φ⁻¹ by bisection on phiExact — slow, plain, and beyond argument. */
export function phiInvExact(p: number): number {
  let lo = -40
  let hi = 40
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (phiExact(mid) < p) lo = mid
    else hi = mid
    if (hi - lo < 1e-15) break
  }
  return (lo + hi) / 2
}

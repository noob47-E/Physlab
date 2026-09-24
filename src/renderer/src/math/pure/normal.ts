// The standard normal distribution: Φ(z), its upper tail, its inverse, and the bell curve itself.
//
// Φ is Abramowitz & Stegun 26.2.17 for |z| ≤ 3, the same rational-times-Gaussian fit that
// generated most printed four-place tables, so a value read here agrees with the table in the
// student's book to every one of its four places (|error| < 7.5×10⁻⁸, checked against a
// high-precision erf in the tests). That absolute error is nothing beside an area of 0.1, but it
// is a quarter of Q(5) = 2.87×10⁻⁷ itself: past |z| = 3 the fit once printed P(Z > 5) as
// 2.87105×10⁻⁷ (true 2.86652×10⁻⁷) and put invnorm(0.999999) at 4.754 (true 4.753). So beyond 3
// the tail Q(z) = P(Z > z) comes from Laplace's continued fraction for the Mills ratio, which is
// accurate to the last digit of a double there, and the small area is used as it is — never as
// 1 minus a number close to 1, which would throw its digits away.
//
// The inverse starts from Acklam's rational approximation (relative error 1.15×10⁻⁹) and takes
// one Newton step against this Φ, the tail taken straight from Q, so Φ(Φ⁻¹(p)) lands back on p to
// better than 10⁻¹¹ and a tail area of 10⁻⁹ is inverted to its full precision. Between |z| = 3
// and 0 the inverse inherits the fit's error, at most 7.5×10⁻⁸ / φ(z) = 1.7×10⁻⁵ in z at z = 3,
// which the tests show never moves the third place a table reading gives.

const SQRT_2PI = Math.sqrt(2 * Math.PI)

/** The bell curve itself, φ(z) = e^(−z²/2) / √(2π). */
export const pdf = (z: number): number => Math.exp(-0.5 * z * z) / SQRT_2PI

// A&S 26.2.17.
const P = 0.2316419
const B1 = 0.31938153
const B2 = -0.356563782
const B3 = 1.781477937
const B4 = -1.821255978
const B5 = 1.330274429

/** Where the fit hands over to the continued fraction. */
const TAIL_FROM = 3

/**
 * Q(z) = P(Z > z) for z > TAIL_FROM: φ(z) / (z + 1/(z + 2/(z + 3/(z + …)))), Laplace's
 * continued fraction for the Mills ratio, evaluated by the modified Lentz method. At z = 3 it
 * settles in about 60 terms, and faster further out.
 */
function farTail(z: number): number {
  // Q(∞) = 0. The Lentz step would meet ∞ × 0 and give NaN, and then P(Z > −∞) read "undefined".
  if (z === Infinity) return 0
  const tiny = 1e-300
  let f = z
  let c = f
  let d = 0
  for (let n = 1; n < 1000; n++) {
    d = z + n * d
    if (d === 0) d = tiny
    c = z + n / c
    if (c === 0) c = tiny
    d = 1 / d
    const delta = c * d
    f *= delta
    if (Math.abs(delta - 1) < 1e-16) break
  }
  return pdf(z) / f
}

/** Φ(z) = P(Z < z), the area under the bell curve to the left of z. */
export function phi(z: number): number {
  if (Number.isNaN(z)) return NaN
  if (z === Infinity) return 1
  if (z === -Infinity) return 0
  // The fit is 5×10⁻¹⁰ off at the very centre, and Φ(0) = 0.5 is the one value every student
  // knows by heart: it must not read 0.5000000005 anywhere, even in a check.
  if (z === 0) return 0.5
  // Far left, Φ(z) is a small tail area in its own right: taken straight from Q, not as 1 − Φ(−z).
  if (z < -TAIL_FROM) return farTail(-z)
  // The fit is for z ≥ 0; the other half comes from the curve's symmetry, exactly as a student
  // does it, so Φ(−z) + Φ(z) is 1 to the last bit rather than to the fit's tolerance.
  if (z < 0) return 1 - phi(-z)
  if (z > TAIL_FROM) return 1 - farTail(z)
  const t = 1 / (1 + P * z)
  const poly = t * (B1 + t * (B2 + t * (B3 + t * (B4 + t * B5))))
  return 1 - pdf(z) * poly
}

/**
 * Q(z) = P(Z > z) = 1 − Φ(z), with a small upper tail kept to its own digits (Q(5) = 2.86652×10⁻⁷,
 * where 1 − Φ(5) would keep only what survives the subtraction from 1).
 */
export function upperTail(z: number): number {
  if (Number.isNaN(z)) return NaN
  if (z > TAIL_FROM) return farTail(z)
  return z < -TAIL_FROM ? 1 - farTail(-z) : 1 - phi(z)
}

// Acklam's coefficients.
const A = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239]
const B = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
const C = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
const D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
const P_LOW = 0.02425

/** Acklam's approximation on its own, before the Newton step. */
function acklam(p: number): number {
  if (p < P_LOW) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1)
  }
  if (p > 1 - P_LOW) {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    return -(((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1)
  }
  const q = p - 0.5
  const r = q * q
  return ((((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q) / (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1)
}

/** Φ⁻¹(p): the z with area p to its left. Outside (0, 1) there is no such z. */
export function phiInv(p: number): number {
  if (Number.isNaN(p) || p < 0 || p > 1) return NaN
  if (p === 0) return -Infinity
  if (p === 1) return Infinity
  // Same reason as Φ(0): the Newton step would otherwise leave −1.3×10⁻⁹ where a student expects
  // 0, and 1.3×10⁻⁹ is above the formatter's noise floor, so it would be printed.
  if (p === 0.5) return 0
  // Solve the lower half and mirror it: Acklam's fit is not perfectly odd about p = 0.5, and a
  // student's Φ⁻¹(0.05) has to be exactly the negative of Φ⁻¹(0.95).
  if (p > 0.5) return -phiInv(1 - p)
  const z0 = acklam(p)
  // One Newton step on Φ(z) − p = 0; the derivative is the bell curve itself. p ≤ 0.5 here, so
  // z0 ≤ 0 and phi(z0) is the lower tail, taken straight from Q beyond −3 (see phi).
  const z = z0 - (phi(z0) - p) / pdf(z0)
  return z === 0 ? 0 : z
}

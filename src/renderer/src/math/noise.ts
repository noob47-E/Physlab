// One rule for rounding noise (CLEANUP-PLAN.md CW2): whether a number that came out of a sum or a
// product is really zero, or two numbers are really the same, judged against the sizes of what it
// was worked out from. Never an absolute floor: physics numbers are tiny in SI units, and a fixed
// 1e-12 would call a charge of 1.6×10⁻¹⁹ C zero.
//
// isNoise is noiseFloor's ZERO rule (math/format.ts, noiseFloor(0, largest)): noise is within 10⁻¹⁵
// of the largest size involved (10⁻⁹ of a millionth). The Vectors rules — the solver's product test
// (math/vectorSolver.ts isNoise) and the panel's withoutNoise (panels/vectorLine.ts) — reach
// 10⁻¹², so they also call noise what lies between the two; tests/noise.test.ts measures that band.
// A product A·B is judged dividing first, isNoise(p / |A|, |B|): |A||B| overflows at 10¹⁵⁵.
//
// sameNumber applies that zero rule to a − b, so it means "the same computed number" (a few
// rounding steps). It is NOT the marking rule: a typed answer is marked equal within
// tol + noiseFloor(answer), 10⁻⁹ of the answer — a million times wider. Do not use it to mark until
// CW9, which moves every caller here, decides both numbers. Callers so far (CW3b): math/expr.ts's sinc
// floor uses isNoise; CW9 moves the rest.

/**
 * Whether `value` is rounding noise beside the inputs it was worked out from: exactly 0, or within
 * 10⁻¹⁵ of the largest of its own size and theirs. NaN, an infinity, or an infinite input is
 * never noise.
 */
export function isNoise(value: number, ...inputs: number[]): boolean {
  if (Number.isNaN(value)) return false
  if (value === 0) return true
  if (!Number.isFinite(value)) return false

  let largest = Math.abs(value)
  for (let i = 0; i < inputs.length; i++) {
    largest = Math.max(largest, Math.abs(inputs[i]))
  }

  if (!Number.isFinite(largest)) return false

  return Math.abs(value) <= 1e-15 * largest
}

/**
 * Whether `a` and `b` are the same computed number up to rounding noise (the zero rule on a − b)
 * beside their own sizes and the inputs. NaN is the same as nothing; an infinity only as itself;
 * 0 as 0. Not for marking a typed answer (see the top of this file).
 */
export function sameNumber(a: number, b: number, ...inputs: number[]): boolean {
  if (Number.isNaN(a) || Number.isNaN(b)) return false
  if (a === b) return true
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false

  return isNoise(a - b, a, b, ...inputs)
}

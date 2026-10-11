// A number as the fraction it is, and the real root of a negative number: shared by the Calculator
// (calc/engine.ts) and a graph's compiled formula (math/expr.ts compileScalar). Out of calc/engine.ts
// (CLEANUP-PLAN.md CW7b), word for word.

/**
 * How far the round-off of a few float operations can move a double from the number it stands for,
 * in units of Number.EPSILON × max(1, |v|) — one unit is one or two steps between doubles at v:
 * 0.1 + 0.2 is one unit from 3/10, 0.35 × 3 one from 21/20, and (5π/27)×10⁹ ÷ π under one from
 * 5×10⁹/27. Four leaves room for a short chain. Below 1 the unit stays Number.EPSILON, because a
 * small answer is often the difference of bigger numbers: 1.1 − 1 is nearly four units from 1/10.
 */
export const ROUND_OFF = 4

/**
 * The most a fraction may owe to luck. Every number has fractions p/q within 1/q² of it (Dirichlet),
 * and the chance that an arbitrary number lies within δ of some fraction with denominator q or less
 * is about q²·δ. The old fixed tolerance of 10⁻¹¹·|v| therefore found a fraction for almost every
 * number above 10³: a hexagon of radius 3 at 1 □ = 10 mm had the area 9968039/4263 mm² (the truth is
 * 1350√3) and x² − 10000x + 1 = 0 the root 99989999/9999. A fraction is taken only when q² × its miss
 * (never less than half a unit, all a double can tell) stays under this — about one arbitrary number
 * in 10 000 gets through. So p/q can be found only while |v| < 2.7×10¹¹/q² (half a unit must stay
 * under LUCK/q²); every true fraction and π form met so far is inside that. It cannot be much smaller:
 * (5π/27)×10⁹ is 5×10⁹/27 of π, a denominator of 27 at 1.9×10⁸ with a miss of one step, and
 * q² × miss = 2.2×10⁻⁵.
 */
const LUCK = 3e-5

/**
 * v as the fraction p/q (q ≤ maxDen) that it is, or null. Only a fraction that v sits on to within
 * round-off (`roundOff` units, see ROUND_OFF) and far too closely to be luck (see LUCK) counts; any
 * other number stays a decimal. The candidates are the convergents of v's continued fraction: any
 * fraction this close to v is one of them.
 */
export function toFraction(v: number, maxDen = 100000, roundOff = ROUND_OFF): [number, number] | null {
  if (!Number.isFinite(v)) return null
  const unit = Number.EPSILON * Math.max(1, Math.abs(v))
  const isV = (p: number, q: number): boolean => {
    const miss = Math.abs(v - p / q)
    return miss <= roundOff * unit && q * q * Math.max(miss, unit / 2) <= LUCK
  }
  let h1 = 1
  let h0 = 0
  let k1 = 0
  let k0 = 1
  let x = v
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(x)
    ;[h1, h0] = [a * h1 + h0, h1]
    ;[k1, k0] = [a * k1 + k0, k1]
    if (k1 > maxDen) return null
    if (isV(h1, k1)) return [h1, k1]
    const frac = x - a
    if (frac < 1e-14) break
    x = 1 / frac
  }
  return isV(h1, k1) ? [h1, k1] : null
}

/**
 * The real n-th root of a number that is not negative. A whole answer comes out whole:
 * Math.pow(64, 1/3) is 3.9999999999999996, and that would have been kept as Ans.
 */
export function rootOf(x: number, n: number): number {
  if (n === 3) return Math.cbrt(x)
  const r = Math.pow(x, 1 / n)
  const k = Math.round(r)
  return Math.pow(k, n) === x ? k : r
}

/** [p, q] when e is the fraction p/q with q odd and above 1: the exponents whose root of a negative number is real. */
export function oddRootExponent(e: number): [number, number] | null {
  const f = toFraction(e, 99)
  return f && f[1] > 1 && f[1] % 2 === 1 ? f : null
}

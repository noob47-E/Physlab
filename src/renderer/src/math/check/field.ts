// G2: exact numbers of the form (a + b√d) + (c + e√d)i, with a, b, c, e rational and one whole number d that is not a
// square. Roots a student meets — 3/2, 1 ± √2, (−1 ± i√3)/2 — are all of this form, so a root checker can multiply
// the claimed factors out exactly instead of trusting decimals (docs/knowledge/check.md).

import { R0, R1, rAdd, rDiv, rEq, rIsZero, rMul, rNeg, rSub, rat, type Rat } from '../pure/rat'

/** Raised when a number is not of this form (two different roots, π, a cube root that is not whole). */
export class NotInField extends Error {}

/** (a + b√d) + (c + e√d)i. d = 1 means no root at all (b = e = 0). */
export interface Alg {
  d: bigint
  a: Rat
  b: Rat
  c: Rat
  e: Rat
}

export const algRat = (q: Rat): Alg => ({ d: 1n, a: q, b: R0, c: R0, e: R0 })
export const ALG_I: Alg = { d: 1n, a: R0, b: R0, c: R1, e: R0 }

const hasRoot = (x: Alg): boolean => !rIsZero(x.b) || !rIsZero(x.e)

/**
 * x written over √d instead of its own √(x.d), when the two roots are rational multiples of each other: x.d·d is then a
 * square s², and √(x.d) = (s/d)·√d. splitSquare keeps a square factor of a prime past 10⁵, so 100003·√(2·100019) and
 * √(2·100003²·100019) arrive with different d; without this they did not unify and a right root was called wrong.
 */
function rebase(x: Alg, d: bigint): Alg | null {
  const s = bigIntRoot(x.d * d, 2)
  if (s * s !== x.d * d) return null
  const k = rat(s, d)
  return { d, a: x.a, b: rMul(x.b, k), c: x.c, e: rMul(x.e, k) }
}

/** The same d for both, or NotInField when each carries a different root. */
function unify(x: Alg, y: Alg): [Alg, Alg] {
  if (x.d === y.d) return [x, y]
  if (!hasRoot(x)) return [{ ...x, d: y.d }, y]
  if (!hasRoot(y)) return [x, { ...y, d: x.d }]
  const r = rebase(x, y.d)
  if (r) return [r, y]
  throw new NotInField('two different square roots')
}

/** Normalised: no root part means d = 1, so equal numbers compare equal. */
const tidy = (x: Alg): Alg => (hasRoot(x) ? x : { ...x, d: 1n })

export function algAdd(x0: Alg, y0: Alg): Alg {
  const [x, y] = unify(x0, y0)
  return tidy({ d: x.d, a: rAdd(x.a, y.a), b: rAdd(x.b, y.b), c: rAdd(x.c, y.c), e: rAdd(x.e, y.e) })
}
export const algNeg = (x: Alg): Alg => ({ d: x.d, a: rNeg(x.a), b: rNeg(x.b), c: rNeg(x.c), e: rNeg(x.e) })
export const algSub = (x: Alg, y: Alg): Alg => algAdd(x, algNeg(y))

/** (p + q√d)(r + s√d) in ℚ(√d). */
function qMul(d: Rat, p: Rat, q: Rat, r: Rat, s: Rat): [Rat, Rat] {
  return [rAdd(rMul(p, r), rMul(d, rMul(q, s))), rAdd(rMul(p, s), rMul(q, r))]
}

export function algMul(x0: Alg, y0: Alg): Alg {
  const [x, y] = unify(x0, y0)
  const d = rat(x.d)
  // (A + Ci)(A' + C'i) = (AA' − CC') + (AC' + CA')i, with A, C in ℚ(√d).
  const [aa1, aa2] = qMul(d, x.a, x.b, y.a, y.b)
  const [cc1, cc2] = qMul(d, x.c, x.e, y.c, y.e)
  const [ac1, ac2] = qMul(d, x.a, x.b, y.c, y.e)
  const [ca1, ca2] = qMul(d, x.c, x.e, y.a, y.b)
  return tidy({ d: x.d, a: rSub(aa1, cc1), b: rSub(aa2, cc2), c: rAdd(ac1, ca1), e: rAdd(ac2, ca2) })
}

export function algInv(x: Alg): Alg {
  const d = rat(x.d)
  // 1/(A + Ci) = (A − Ci)/(A² + C²); A² + C² = p + q√d, and 1/(p + q√d) = (p − q√d)/(p² − dq²).
  const [aa1, aa2] = qMul(d, x.a, x.b, x.a, x.b)
  const [cc1, cc2] = qMul(d, x.c, x.e, x.c, x.e)
  const p = rAdd(aa1, cc1)
  const q = rAdd(aa2, cc2)
  const norm = rSub(rMul(p, p), rMul(d, rMul(q, q)))
  if (rIsZero(norm)) throw new NotInField('division by zero')
  const ip = rDiv(p, norm)
  const iq = rDiv(rNeg(q), norm)
  return algMul({ d: x.d, a: x.a, b: x.b, c: rNeg(x.c), e: rNeg(x.e) }, tidy({ d: x.d, a: ip, b: iq, c: R0, e: R0 }))
}

export const algEq = (x0: Alg, y0: Alg): boolean => {
  const y = tidy(y0)
  let x = tidy(x0)
  if (hasRoot(x) && hasRoot(y) && x.d !== y.d) {
    // √d₁ and √d₂ are independent over ℚ(i) unless d₁d₂ is a square; then x can be written over y's root.
    const r = rebase(x, y.d)
    if (!r) return false
    x = r
  }
  return rEq(x.a, y.a) && rEq(x.b, y.b) && rEq(x.c, y.c) && rEq(x.e, y.e)
}
export const algIsReal = (x: Alg): boolean => rIsZero(x.c) && rIsZero(x.e)
export const algIsRational = (x: Alg): boolean => algIsReal(x) && rIsZero(x.b)

/** √d ↦ −√d. */
const algRootConj = (x: Alg): Alg => ({ ...x, b: rNeg(x.b), e: rNeg(x.e) })
/** i ↦ −i. */
const algComplexConj = (x: Alg): Alg => ({ ...x, c: rNeg(x.c), e: rNeg(x.e) })

/** x and its conjugates (√d ↦ −√d, i ↦ −i), each once: a rational polynomial with x as a root has them all as roots. */
export function algOrbit(x: Alg): Alg[] {
  const out: Alg[] = []
  for (const y of [x, algRootConj(x), algComplexConj(x), algRootConj(algComplexConj(x))]) {
    if (!out.some((z) => algEq(z, y))) out.push(tidy(y))
  }
  return out
}

// ---------------------------------------------------------------- whole-number roots

/** ⌊ⁿ√v⌋ for v ≥ 0. */
function bigIntRoot(v: bigint, n: number): bigint {
  if (v < 2n) return v
  const N = BigInt(n)
  // Newton's method from above: x ← ((n − 1)x + v/xⁿ⁻¹)/n.
  let x = 1n << BigInt(Math.ceil(v.toString(2).length / n) + 1)
  for (;;) {
    const y = ((N - 1n) * x + v / x ** (N - 1n)) / N
    if (y >= x) break
    x = y
  }
  while (x ** N > v) x--
  while ((x + 1n) ** N <= v) x++
  return x
}

/** The exact real n-th root of a rational, or null: real odd roots of negatives ((−8)^(1/3) = −2), none for even. */
export function rationalRoot(q: Rat, n: number): Rat | null {
  if (n === 1) return q
  const neg = q.n < 0n
  if (neg && n % 2 === 0) return null
  const num = neg ? -q.n : q.n
  const rn = bigIntRoot(num, n)
  const rd = bigIntRoot(q.d, n)
  if (rn ** BigInt(n) !== num || rd ** BigInt(n) !== q.d) return null
  return rat(neg ? -rn : rn, rd)
}

/**
 * v = s²·f with f free of square factors found by trial division up to 10⁵. A larger leftover is kept in f whole
 * unless it is itself a square. f is then never a square, so ℚ(√f) arithmetic stays exact; two spellings of one number
 * with a huge square factor get different f, and `rebase` unifies them (it once called a right root wrong).
 */
function splitSquare(v: bigint): { s: bigint; f: bigint } {
  let s = 1n
  let f = 1n
  let rest = v
  for (let p = 2n; p <= 100000n && p * p <= rest; p += p === 2n ? 1n : 2n) {
    let k = 0
    while (rest % p === 0n) {
      rest /= p
      k++
    }
    if (k >= 2) s *= p ** BigInt(Math.floor(k / 2))
    if (k % 2 === 1) f *= p
  }
  if (rest > 1n) {
    const r = bigIntRoot(rest, 2)
    if (r * r === rest) s *= r
    else f *= rest
  }
  return { s, f }
}

/** √q exactly: (s/den)·√f, times i for a negative q. */
export function algSqrtRational(q: Rat): Alg {
  const neg = q.n < 0n
  const num = neg ? -q.n : q.n
  // √(n/m) = √(n·m)/m
  const { s, f } = splitSquare(num * q.d)
  const k = rat(s, q.d)
  const real: Alg = f === 1n ? algRat(k) : { d: f, a: R0, b: k, c: R0, e: R0 }
  return neg ? algMul(real, ALG_I) : real
}

// ---------------------------------------------------------------- polynomials over the field

type AlgPoly = Alg[]

function algPolyMul(p: AlgPoly, q: AlgPoly): AlgPoly {
  const out: AlgPoly = new Array(p.length + q.length - 1).fill(null).map(() => algRat(R0))
  p.forEach((x, i) => q.forEach((y, j) => (out[i + j] = algAdd(out[i + j], algMul(x, y)))))
  return out
}

/** Π (x − r) over the orbit of r: a polynomial with rational coefficients, or NotInField if it is not one. */
export function orbitPolynomial(r: Alg): Rat[] {
  let p: AlgPoly = [algRat(R1)]
  for (const z of algOrbit(r)) p = algPolyMul(p, [algNeg(z), algRat(R1)])
  return p.map((c) => {
    if (!algIsRational(c)) throw new NotInField('orbit product is not rational')
    return c.a
  })
}

// Exact arithmetic for factorising over the complex numbers.
//
// A root of a quadratic with whole-number coefficients is (q + r√n) + (q' + r'√n)i — a surd for
// the real part, a surd for the imaginary part. Everything here is built on that shape, exactly,
// so that the factors PhysLab prints can be multiplied back together and compared with the input
// with no rounding anywhere. That multiply-back is the check; before it existed the "check" line
// for a complex factorisation was a sentence claiming the product was real, with nothing behind it.

import { R0, R1, rAbs, rAdd, rDiv, rEq, rIsNeg, rIsOne, rIsZero, rMul, rNeg, rSub, rTex, rat, type Rat } from './rat'
import { MAX_TRIAL } from './limits'
import { pEq, pTrim, type Poly } from './poly'

// ---------------------------------------------------------------- surds

/**
 * Largest square taken out of a root: 72 becomes 6√2.
 *
 * Gives up after MAX_TRIAL divisors and says so. √n left unsimplified is still the right
 * number, which is what matters — an answer that is correct but untidy beats a frozen window.
 */
export function simplifySurd(n: bigint): { out: bigint; in: bigint; tooBig?: boolean } {
  let out = 1n
  let rest = n < 0n ? -n : n
  let steps = 0
  for (let d = 2n; d * d <= rest; d++) {
    if (steps++ > MAX_TRIAL) return { out: 1n, in: n < 0n ? -n : n, tooBig: true }
    while (rest % (d * d) === 0n) {
      out *= d
      rest /= d * d
    }
  }
  return { out, in: rest }
}

/** q + r√n. When r is zero the number is rational and n is 1. */
export interface Surd {
  q: Rat
  r: Rat
  n: bigint
}

/** Build a surd, tidied: squares pulled out of the root, and a rational written with n = 1. */
export function surd(q: Rat, r: Rat = R0, n: bigint = 1n): Surd {
  if (rIsZero(r) || n === 0n) return { q, r: R0, n: 1n }
  if (n < 0n) throw new Error('a surd holds a real root; use the imaginary part for √(−n)')
  const { out, in: inner } = simplifySurd(n)
  if (inner === 1n) return { q: rAdd(q, rMul(r, rat(out))), r: R0, n: 1n }
  return { q, r: rMul(r, rat(out)), n: inner }
}

export const surdOfRat = (q: Rat): Surd => surd(q)
export const surdIsRational = (s: Surd): boolean => rIsZero(s.r)
export const surdIsZero = (s: Surd): boolean => rIsZero(s.q) && rIsZero(s.r)
export const surdEq = (a: Surd, b: Surd): boolean => rEq(a.q, b.q) && rEq(a.r, b.r) && (rIsZero(a.r) || a.n === b.n)
export const surdNeg = (s: Surd): Surd => ({ q: rNeg(s.q), r: rNeg(s.r), n: s.n })

/** The root both numbers live under, or a plain error when they are different roots. */
function sharedRoot(a: Surd, b: Surd): bigint {
  if (rIsZero(a.r)) return b.n
  if (rIsZero(b.r)) return a.n
  if (a.n !== b.n) throw new Error(`√${a.n} and √${b.n} cannot be combined exactly`)
  return a.n
}

export function surdAdd(a: Surd, b: Surd): Surd {
  const n = sharedRoot(a, b)
  return surd(rAdd(a.q, b.q), rAdd(a.r, b.r), n)
}

export const surdSub = (a: Surd, b: Surd): Surd => surdAdd(a, surdNeg(b))

/** (q + r√n)(q' + r'√n) = qq' + rr'n + (qr' + rq')√n. */
export function surdMul(a: Surd, b: Surd): Surd {
  const n = sharedRoot(a, b)
  const q = rAdd(rMul(a.q, b.q), rMul(rMul(a.r, b.r), rat(n)))
  const r = rAdd(rMul(a.q, b.r), rMul(a.r, b.q))
  return surd(q, r, n)
}

/** 1/(q + r√n) = (q − r√n)/(q² − r²n): the conjugate trick, the same one used for complex division. */
export function surdInv(a: Surd): Surd {
  const norm = rSub(rMul(a.q, a.q), rMul(rMul(a.r, a.r), rat(a.n)))
  if (rIsZero(norm)) throw new Error('divide by zero')
  return surd(rDiv(a.q, norm), rDiv(rNeg(a.r), norm), a.n)
}

export const surdDiv = (a: Surd, b: Surd): Surd => surdMul(a, surdInv(b))

/** √m for a non-negative fraction m, as a surd: √(p/q) = √(pq)/q. */
export function surdSqrt(m: Rat): Surd {
  if (rIsNeg(m)) throw new Error('surdSqrt wants a non-negative number')
  if (rIsZero(m)) return surd(R0)
  return surd(R0, rat(1n, m.d), m.n * m.d)
}

/** The magnitude of a term coefficient, written by not writing it when it is 1: "√3", not "1√3". */
const coefTex = (c: Rat, body: string): string => (rIsOne(rAbs(c)) && body ? '' : rTex(rAbs(c))) + body

/** One signed piece of a written number, so callers can join pieces with the right signs. */
export interface SignedTex {
  neg: boolean
  body: string
}

/** The pieces of a surd: "3" and "2√5" for 3 + 2√5, each with its own sign. */
export function surdPieces(s: Surd, suffix = ''): SignedTex[] {
  const out: SignedTex[] = []
  if (!rIsZero(s.q)) out.push({ neg: rIsNeg(s.q), body: coefTex(s.q, suffix) || '1' })
  if (!rIsZero(s.r)) out.push({ neg: rIsNeg(s.r), body: coefTex(s.r, `\\sqrt{${s.n}}${suffix}`) })
  return out
}

/** Join signed pieces the way they are written: a bare leading minus, then " + " and " − ". */
export function joinPieces(pieces: SignedTex[]): string {
  if (pieces.length === 0) return '0'
  return pieces.map((p, i) => (i === 0 ? `${p.neg ? '-' : ''}${p.body}` : ` ${p.neg ? '-' : '+'} ${p.body}`)).join('')
}

export const surdTex = (s: Surd): string => joinPieces(surdPieces(s))

// ---------------------------------------------------------------- complex numbers over surds

/** A complex number whose two parts are surds. */
export interface CxS {
  re: Surd
  im: Surd
}

export const cxs = (re: Surd, im: Surd = surd(R0)): CxS => ({ re, im })
export const cxsOfRat = (q: Rat): CxS => cxs(surd(q))
export const cxsIsReal = (z: CxS): boolean => surdIsZero(z.im)
export const cxsIsRational = (z: CxS): boolean => cxsIsReal(z) && surdIsRational(z.re)
export const cxsConj = (z: CxS): CxS => cxs(z.re, surdNeg(z.im))
export const cxsNeg = (z: CxS): CxS => cxs(surdNeg(z.re), surdNeg(z.im))
export const cxsAdd = (a: CxS, b: CxS): CxS => cxs(surdAdd(a.re, b.re), surdAdd(a.im, b.im))
export const cxsSub = (a: CxS, b: CxS): CxS => cxs(surdSub(a.re, b.re), surdSub(a.im, b.im))
export const cxsMul = (a: CxS, b: CxS): CxS =>
  cxs(surdSub(surdMul(a.re, b.re), surdMul(a.im, b.im)), surdAdd(surdMul(a.re, b.im), surdMul(a.im, b.re)))
export const cxsEq = (a: CxS, b: CxS): boolean => surdEq(a.re, b.re) && surdEq(a.im, b.im)

/** a + bi written the way a student writes it: 3 − 2i, −½ + ½√3i, never 3 + (−2)i. */
export function cxsTex(z: CxS): string {
  return joinPieces([...surdPieces(z.re), ...surdPieces(z.im, 'i')])
}

/**
 * The bracket (x − root), simplified the way it is written on a board.
 *
 * Subtracting a root means flipping every sign in it, so (x − [−1 + 2i]) is written as
 * (x + 1 − 2i) and (x − [2i]) as (x − 2i). The old printing left the inner brackets in, which was
 * correct and read wrong to everyone.
 */
export function linearFactorTex(name: string, root: CxS): string {
  const pieces = [...surdPieces(root.re), ...surdPieces(root.im, 'i')].map((p) => ({ neg: !p.neg, body: p.body }))
  if (pieces.length === 0) return name
  return `\\left(${name}${pieces.map((p) => ` ${p.neg ? '-' : '+'} ${p.body}`).join('')}\\right)`
}

// ---------------------------------------------------------------- polynomials over CxS

/** Coefficients smallest power first, like Poly, but each one may be complex and involve surds. */
export type SPoly = CxS[]

export const spFromPoly = (p: Poly): SPoly => pTrim(p).map(cxsOfRat)

/** x − root, as a polynomial. */
export const spLinear = (root: CxS): SPoly => [cxsNeg(root), cxsOfRat(R1)]

export const spConst = (c: Rat): SPoly => [cxsOfRat(c)]

export function spMul(a: SPoly, b: SPoly): SPoly {
  if (a.length === 0 || b.length === 0) return []
  const zero = cxsOfRat(R0)
  const out: SPoly = new Array(a.length + b.length - 1).fill(zero)
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) out[i + j] = cxsAdd(out[i + j], cxsMul(a[i], b[j]))
  }
  return out
}

/** Back to ordinary rational coefficients, or null when a surd or an i survived. */
export function spToPoly(p: SPoly): Poly | null {
  const out: Poly = []
  for (const c of p) {
    if (!cxsIsRational(c)) return null
    out.push(c.re.q)
  }
  return pTrim(out)
}

/** The root of a monic linear factor x − p, or null for anything else. */
function rootOfLinear(f: SPoly): CxS | null {
  if (f.length !== 2 || !cxsEq(f[1], cxsOfRat(R1))) return null
  return cxsNeg(f[0])
}

/**
 * (x − p)(x − p̄) as the real quadratic x² − 2·Re(p)·x + |p|², built without ever multiplying the
 * two parts of p together.
 *
 * Multiplying the pair out term by term forms Re(p)·Im(p), and when the real part is under one
 * root and the imaginary part under another (x⁴ + 2x² + 4 has roots ½√2 ± ½√6·i) that product is
 * a surd this arithmetic cannot hold. Those cross terms cancel in the end anyway; going straight
 * to the quadratic only ever squares each part against itself, which stays under its own root.
 */
export function spConjugatePair(p: CxS): SPoly {
  const norm = surdAdd(surdMul(p.re, p.re), surdMul(p.im, p.im))
  return [cxs(norm), cxs(surdNeg(surdAdd(p.re, p.re))), cxsOfRat(R1)]
}

/**
 * Multiply the given factors together, in the order given, and say whether the product is the
 * polynomial that was factorised.
 *
 * A conjugate pair of linear factors is multiplied into its real quadratic first (see
 * spConjugatePair): that is the only way the check can pass for roots whose two parts sit under
 * different roots, and it also mirrors the rule the working quotes. The remaining products then
 * only ever share one root; anything else throws inside surdMul and is reported here as a failed
 * check rather than a crash — the working still appears, but says so.
 */
export function checkProduct(factors: SPoly[], expected: Poly): boolean {
  try {
    const paired: SPoly[] = []
    for (let i = 0; i < factors.length; i++) {
      const p = rootOfLinear(factors[i])
      const q = i + 1 < factors.length ? rootOfLinear(factors[i + 1]) : null
      if (p && q && !cxsIsReal(p) && cxsEq(q, cxsConj(p))) {
        paired.push(spConjugatePair(p))
        i++
      } else {
        paired.push(factors[i])
      }
    }
    const product = paired.reduce((acc, f) => spMul(acc, f), spConst(R1))
    const back = spToPoly(product)
    return back !== null && pEq(back, expected)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------- roots

/** Roots of a·x² + b·x + c with surd coefficients, or null when a surd cannot hold them exactly. */
export function quadraticRoots(a: Surd, b: Surd, c: Surd): [CxS, CxS] | null {
  const disc = surdSub(surdMul(b, b), surdMul(surd(rat(4n)), surdMul(a, c)))
  // √(q + r√n) is a nested root; there is no exact way to write it that a student would recognise.
  if (!surdIsRational(disc)) return null
  const twoA = surdMul(surd(rat(2n)), a)
  const mid = surdDiv(surdNeg(b), twoA)
  const D = disc.q
  if (rIsNeg(D)) {
    const im = surdDiv(surdSqrt(rNeg(D)), twoA)
    return [cxs(mid, im), cxs(mid, surdNeg(im))]
  }
  const half = surdDiv(surdSqrt(D), twoA)
  // ½√7 ± ½√3 is exact, but two different roots in one number is more than a surd can hold, and
  // it would throw inside surdAdd. Null lets the caller refuse with a sentence instead.
  if (!surdIsRational(mid) && !surdIsRational(half) && mid.n !== half.n) return null
  return [cxs(surdAdd(mid, half)), cxs(surdSub(mid, half))]
}

/**
 * x⁴ + b·x² + c written as (x² + s)² − (k·x)², a difference of two squares.
 *
 * This is the textbook way into x⁴ + 4 = (x² − 2x + 2)(x² + 2x + 2). It needs the constant to be
 * a perfect square, s², and 2s − b to be positive; k = √(2s − b) may be a surd, which is how
 * x⁴ + 1 becomes (x² − √2·x + 1)(x² + √2·x + 1). Both signs of s are tried, because
 * x⁴ − 5x² + 4 works with s = −2 as well as s = 2. The leading coefficient may be a square too.
 */
export function splitBiquadratic(p: Poly): { alpha: Rat; k: Surd; s: Rat } | null {
  const t = pTrim(p)
  if (t.length !== 5 || !rIsZero(t[1]) || !rIsZero(t[3])) return null
  const [c, , b, , a] = t
  const alpha = exactSqrt(a)
  const s0 = exactSqrt(c)
  if (!alpha || !s0) return null
  for (const s of [s0, rNeg(s0)]) {
    // (αx² + s)² = αx⁴ + 2αs·x² + s², so what is left over is (2αs − b)·x².
    const m = rSub(rMul(rMul(rat(2n), alpha), s), b)
    if (rIsNeg(m) || rIsZero(m)) continue
    return { alpha, k: surdSqrt(m), s }
  }
  return null
}

/** √a when a is a perfect square of a fraction, else null. */
function exactSqrt(a: Rat): Rat | null {
  if (rIsNeg(a)) return null
  const isq = (v: bigint): bigint | null => {
    if (v < 2n) return v
    let x = v
    let y = (x + 1n) / 2n
    while (y < x) {
      x = y
      y = (x + v / x) / 2n
    }
    return x * x === v ? x : null
  }
  const n = isq(a.n)
  const d = isq(a.d)
  return n !== null && d !== null ? rat(n, d) : null
}

/** A polynomial with surd coefficients written out: x^{2} − √2x + 1. */
export function surdPolyTex(coeffs: Surd[], name: string): string {
  const pieces: SignedTex[] = []
  for (let k = coeffs.length - 1; k >= 0; k--) {
    const c = coeffs[k]
    if (surdIsZero(c)) continue
    const v = k === 0 ? '' : k === 1 ? name : `${name}^{${k}}`
    const parts = surdPieces(c)
    if (parts.length === 1) {
      const only = parts[0]
      const body = v && only.body === '1' ? v : `${only.body}${v}`
      pieces.push({ neg: only.neg, body })
    } else {
      // A two-piece surd in front of a letter needs its own bracket: (1 + √2)x.
      pieces.push({ neg: false, body: v ? `\\left(${joinPieces(parts)}\\right)${v}` : joinPieces(parts) })
    }
  }
  return joinPieces(pieces)
}

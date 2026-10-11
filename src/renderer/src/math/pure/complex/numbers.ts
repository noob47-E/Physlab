// Complex numbers and surds (math/pure/complex.ts says how the jobs work): exact complex numbers and their TeX,
// powers of i, numbers with square roots and i (IPoly, Frac), and the check against a decimal.
// Out of complex.ts as a pure move (CLEANUP-PLAN.md CW10b).

import { R0, R1, rAbs, rAdd, rDiv, rIsNeg, rIsOne, rIsZero, rMul, rNeg, rNum, rSub, rTex, rat, type Rat } from '../rat'
import { NotPolynomial, writeTimes, type Expr } from '../mono'
import { math, preprocess } from '../../expr'
import {
  cxs,
  simplifySurd,
  surd,
  surdAdd,
  surdEq,
  surdIsRational,
  surdIsZero,
  surdMul,
  surdNeg,
  surdSub,
  type CxS,
  type Surd
} from '../cxpoly'
import { Steps } from '../work'

/** An exact complex number: both parts are fractions. */
export interface Cx {
  re: Rat
  im: Rat
}

export const cx = (re: Rat, im: Rat = R0): Cx => ({ re, im })
export const cxIsReal = (z: Cx): boolean => rIsZero(z.im)
const cxAdd = (a: Cx, b: Cx): Cx => cx(rAdd(a.re, b.re), rAdd(a.im, b.im))
export const cxMul = (a: Cx, b: Cx): Cx =>
  cx(rSub(rMul(a.re, b.re), rMul(a.im, b.im)), rAdd(rMul(a.re, b.im), rMul(a.im, b.re)))
export const cxConj = (z: Cx): Cx => cx(z.re, rNeg(z.im))

/** A number squared as written by hand: 2², (−1)², (½)². */
export const squaredTex = (r: Rat): string => (rIsNeg(r) || r.d !== 1n ? `\\left(${rTex(r)}\\right)^2` : `${rTex(r)}^2`)

/** A sum of numbers times suffixes (i, i²), each sign written once: "3 + 6i + 4i − 8i²". */
export function signedTex(parts: { c: Rat; s: string }[]): string {
  const out = parts
    .filter((p) => !rIsZero(p.c))
    .map((p, i) => {
      const neg = rIsNeg(p.c)
      const m = neg ? rNeg(p.c) : p.c
      const body = rIsOne(m) && p.s ? p.s : `${rTex(m)}${p.s}`
      return i === 0 ? `${neg ? '-' : ''}${body}` : `${neg ? '-' : '+'} ${body}`
    })
  return out.length ? out.join(' ') : '0'
}

/** a + bi, written the way a student would: 3 − 2i, not 3 + (−2)i. */
export function cxTex(z: Cx): string {
  if (rIsZero(z.im)) return rTex(z.re)
  const coef = rIsOne(rAbs(z.im)) ? '' : rTex(rAbs(z.im))
  const body = `${coef}i`
  if (rIsZero(z.re)) return rIsNeg(z.im) ? `-${body}` : body
  return `${rTex(z.re)} ${rIsNeg(z.im) ? '-' : '+'} ${body}`
}

/** √n as LaTeX, already simplified: 6\sqrt{2}, or just 6 when it is exact. */
export function rootTex(n: bigint): string {
  const { out, in: inner } = simplifySurd(n)
  if (inner === 1n) return String(out)
  return out === 1n ? `\\sqrt{${inner}}` : `${out}\\sqrt{${inner}}`
}

/**
 * √(p/q) as LaTeX, for a fraction under the root.
 *
 * Uses √(p/q) = √(pq)/q, the same rule the roots themselves are built with a few steps below.
 * The displayed step used to drop the denominator entirely and claim √(15/4) = √15.
 */
export function surdOf(a: Rat): string {
  const { out, in: inner } = simplifySurd(a.n * a.d)
  const coef = rat(out, a.d)
  if (inner === 1n) return rTex(coef)
  return `${rIsOne(coef) ? '' : rTex(coef)}\\sqrt{${inner}}`
}

// ---------------------------------------------------------------- powers of i

/** Reduce an expression in the letter i to a single complex number, using i² = −1. */
export function reduceI(e: Expr): Cx {
  let z = cx(R0, R0)
  for (const t of e) {
    const others = Object.keys(t.v).filter((k) => k !== 'i')
    if (others.length) throw new NotPolynomial(`This still has ${others.join(', ')} in it, so it is not a plain complex number.`)
    const k = (t.v.i ?? 0) % 4
    if (k === 0) z = cxAdd(z, cx(t.c, R0))
    else if (k === 1) z = cxAdd(z, cx(R0, t.c))
    else if (k === 2) z = cxAdd(z, cx(rNeg(t.c), R0))
    else z = cxAdd(z, cx(R0, rNeg(t.c)))
  }
  return z
}

/** An expression in i, written in the order students write it: 8 + 2i − 15i². */
export function iTex(e: Expr): string {
  const ordered = [...e].sort((a, b) => (a.v.i ?? 0) - (b.v.i ?? 0))
  if (ordered.length === 0) return '0'
  let out = ''
  ordered.forEach((t, idx) => {
    const k = t.v.i ?? 0
    const mag = rAbs(t.c)
    const coef = rIsOne(mag) && k > 0 ? '' : rTex(mag)
    const letter = k === 0 ? '' : k === 1 ? 'i' : `i^{${k}}`
    const body = `${coef}${letter}` || '1'
    if (idx === 0) out += rIsNeg(t.c) ? `-${body}` : body
    else out += rIsNeg(t.c) ? ` - ${body}` : ` + ${body}`
  })
  return out
}

const hasHighPowers = (e: Expr): boolean => e.some((t) => (t.v.i ?? 0) >= 2)

export function powersOfIMove(e: Expr, s: Steps): void {
  if (!hasHighPowers(e)) return
  powerRuleMove(Math.max(...e.map((t) => t.v.i ?? 0)), s)
}

/** The rule step for the highest power of i in play, shared by both readers so they say it alike. */
export function powerRuleMove(top: number, s: Steps): void {
  if (top < 2) return
  if (top === 2) {
    s.add('Replace i² with −1. That is the whole definition of i doing its work.', 'i^2 = -1', 'i = \\sqrt{-1} \\;\\Rightarrow\\; i^2 = -1')
  } else {
    s.add(
      `Powers of i go round in fours, so reduce every power down to i⁰, i¹, i² or i³ first.`,
      'i^1 = i,\\quad i^2 = -1,\\quad i^3 = -i,\\quad i^4 = 1',
      'i^{n} = i^{\\,n \\bmod 4}'
    )
  }
}

/**
 * The exact answer against mathjs's own complex arithmetic on the same source: an independent
 * route to the same number, so a tick here is a real comparison and not a restatement. Null when
 * mathjs cannot evaluate the source, in which case the check line carries no verdict.
 */
export function agreesNumerically(src: string, z: Cx): boolean | null {
  return agreesWith(src, rNum(z.re), rNum(z.im))
}

/** The source worked out by mathjs, or null when mathjs cannot work it out. */
export function numericValue(src: string): { re: number; im: number } | null {
  try {
    // The same reading as the exact route: mathjs on its own takes "i(2+3i)" as a call to a
    // function named i and throws, which left the check with no verdict and no tick. |z| arrives
    // as mag(z), whose own version measures vectors and throws on a complex number, so |1 + √3i|
    // had no decimal answer either; here it is the modulus.
    const v = math.evaluate(writeTimes(preprocess(src)), { mag: (z: unknown) => math.abs(z as never) as unknown }) as unknown
    const re = typeof v === 'number' ? v : (v as { re?: number }).re
    const im = typeof v === 'number' ? 0 : (v as { im?: number }).im
    return typeof re === 'number' && typeof im === 'number' ? { re, im } : null
  } catch {
    return null
  }
}

/** agreesNumerically for an answer already turned into decimals (a surd answer has no Cx). */
export function agreesWith(src: string, re: number, im: number): boolean | null {
  const v = numericValue(src)
  if (!v) return null
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))
  return near(v.re, re) && near(v.im, im)
}

export const ZERO: Surd = surd(R0)
export const ONE: Surd = surd(R1)

/** i as a letter: entry k is the surd in front of iᵏ, so [1, 2√3, 3] is 1 + 2√3i + 3i². */
export type IPoly = Surd[]

function ipTrim(p: IPoly): IPoly {
  let n = p.length
  while (n > 1 && surdIsZero(p[n - 1])) n--
  return n === 0 ? [ZERO] : p.slice(0, n)
}

export const ipIsOne = (p: IPoly): boolean => p.length === 1 && surdEq(p[0], ONE)
const ipEq = (a: IPoly, b: IPoly): boolean => a.length === b.length && a.every((c, k) => surdEq(c, b[k]))
const ipNeg = (p: IPoly): IPoly => p.map(surdNeg)
const ipAdd = (a: IPoly, b: IPoly): IPoly => ipTrim(Array.from({ length: Math.max(a.length, b.length) }, (_, k) => surdAdd(a[k] ?? ZERO, b[k] ?? ZERO)))
/** The highest power of i written; 2 or more means i² = −1 has work to do. */
export const topPower = (p: IPoly): number => p.length - 1

/**
 * surdMul, plus the one product it refuses that is still a single root: √2·√3 = √6. Two bare roots
 * multiply under one root sign; (1 + √2)·√3 would need two roots in one number, and surdMul's
 * refusal stands. Without it (√2 + √3i)(√2 − √3i), which is 5, was beyond the working: its cross
 * terms √6i and −√6i cancel only after they have been written.
 */
export function timesSurd(a: Surd, b: Surd): Surd {
  const bare = !surdIsRational(a) && !surdIsRational(b) && rIsZero(a.q) && rIsZero(b.q)
  return bare && a.n !== b.n ? surd(R0, rMul(a.r, b.r), a.n * b.n) : surdMul(a, b)
}

function ipMul(a: IPoly, b: IPoly): IPoly {
  const out: IPoly = new Array<Surd>(a.length + b.length - 1).fill(ZERO)
  a.forEach((x, i) => b.forEach((y, j) => (out[i + j] = surdAdd(out[i + j], timesSurd(x, y)))))
  return ipTrim(out)
}

export function ipPow(p: IPoly, k: number): IPoly {
  let out: IPoly = [ONE]
  for (let n = 0; n < k; n++) out = ipMul(out, p)
  return out
}

/** i² = −1 at work: the powers of i go round in fours. */
export function ipReduce(p: IPoly): CxS {
  let re = ZERO
  let im = ZERO
  p.forEach((c, k) => {
    if (k % 4 === 0) re = surdAdd(re, c)
    else if (k % 4 === 1) im = surdAdd(im, c)
    else if (k % 4 === 2) re = surdSub(re, c)
    else im = surdSub(im, c)
  })
  return cxs(re, im)
}

/** A line read as one fraction, its top and bottom each multiplied out with i as a letter. */
export interface Frac {
  num: IPoly
  den: IPoly
}

export const whole = (num: IPoly): Frac => ({ num, den: [ONE] })
export const fracNeg = (a: Frac): Frac => ({ num: ipNeg(a.num), den: a.den })
export const fracTimes = (a: Frac, b: Frac): Frac => ({ num: ipMul(a.num, b.num), den: ipMul(a.den, b.den) })
export const fracOver = (a: Frac, b: Frac): Frac => ({ num: ipMul(a.num, b.den), den: ipMul(a.den, b.num) })
export function fracPlus(a: Frac, b: Frac): Frac {
  // A shared bottom is kept as it is, rather than squared by cross-multiplying.
  if (ipEq(a.den, b.den)) return { num: ipAdd(a.num, b.num), den: a.den }
  return { num: ipAdd(ipMul(a.num, b.den), ipMul(b.num, a.den)), den: ipMul(a.den, b.den) }
}

/** The fraction's value when it is an ordinary number — no i, no root — or null. */
export function rationalOf(f: Frac): Rat | null {
  const [n] = f.num
  const [d] = f.den
  if (f.num.length !== 1 || f.den.length !== 1 || !surdIsRational(n) || !surdIsRational(d) || rIsZero(d.q)) return null
  return rDiv(n.q, d.q)
}

// One-variable polynomials over exact fractions, stored smallest power first.
//
// The monomial form in mono.ts handles any number of letters; this narrower form is what long
// division, highest-common-factor and root finding need, so anything that reduces to a single
// letter is converted here first.

import {
  R0,
  R1,
  bgcd,
  blcm,
  rAdd,
  rDiv,
  rEq,
  rIsZero,
  rMul,
  rNeg,
  rSub,
  rat,
  type Rat
} from './rat'
import { MAX_TRIAL } from './limits'
import { NotPolynomial, exprTex, normalize, varsOf, type Expr, type Term } from './mono'

/** Coefficients smallest power first: [−3, 7, 6] is 6x² + 7x − 3. */
export type Poly = Rat[]

/** Drop trailing zero coefficients so the degree is honest. */
export function pTrim(p: Poly): Poly {
  let i = p.length - 1
  while (i >= 0 && rIsZero(p[i])) i--
  return p.slice(0, i + 1)
}

export const pDeg = (p: Poly): number => pTrim(p).length - 1
export const pIsZero = (p: Poly): boolean => pTrim(p).length === 0
export const pLead = (p: Poly): Rat => {
  const t = pTrim(p)
  return t.length ? t[t.length - 1] : R0
}
export const pConst = (c: Rat): Poly => pTrim([c])

export function pAdd(a: Poly, b: Poly): Poly {
  const out: Poly = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) out.push(rAdd(a[i] ?? R0, b[i] ?? R0))
  return pTrim(out)
}

export function pSub(a: Poly, b: Poly): Poly {
  const out: Poly = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) out.push(rSub(a[i] ?? R0, b[i] ?? R0))
  return pTrim(out)
}

export const pNeg = (a: Poly): Poly => a.map(rNeg)
export const pScale = (a: Poly, k: Rat): Poly => pTrim(a.map((c) => rMul(c, k)))

export function pMul(a: Poly, b: Poly): Poly {
  if (pIsZero(a) || pIsZero(b)) return []
  const out: Poly = new Array(a.length + b.length - 1).fill(R0)
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) out[i + j] = rAdd(out[i + j], rMul(a[i], b[j]))
  }
  return pTrim(out)
}

/** x^k as a polynomial, optionally scaled. */
export const pMonomial = (k: number, c: Rat = R1): Poly => pTrim([...new Array(k).fill(R0), c])

export function pEval(p: Poly, x: Rat): Rat {
  let acc = R0
  for (let i = p.length - 1; i >= 0; i--) acc = rAdd(rMul(acc, x), p[i])
  return acc
}

/** Long division: a = q·b + r with deg(r) < deg(b). */
export function pDivMod(a: Poly, b: Poly): { q: Poly; r: Poly } {
  const bb = pTrim(b)
  if (pIsZero(bb)) throw new NotPolynomial('Cannot divide by zero.')
  let r = pTrim(a)
  const q: Poly = new Array(Math.max(0, pDeg(r) - pDeg(bb) + 1)).fill(R0)
  const lead = pLead(bb)
  while (!pIsZero(r) && pDeg(r) >= pDeg(bb)) {
    const shift = pDeg(r) - pDeg(bb)
    const factor = rDiv(pLead(r), lead)
    q[shift] = rAdd(q[shift] ?? R0, factor)
    r = pSub(r, pMul(pMonomial(shift, factor), bb))
  }
  return { q: pTrim(q), r: pTrim(r) }
}

export const pEq = (a: Poly, b: Poly): boolean => {
  const x = pTrim(a)
  const y = pTrim(b)
  return x.length === y.length && x.every((c, i) => rEq(c, y[i]))
}

/** Divide through by the leading coefficient. */
export function pMonic(p: Poly): Poly {
  const l = pLead(p)
  return rIsZero(l) ? p : pScale(p, rDiv(R1, l))
}

/** Highest common factor, made monic so it is unique. */
export function pGcd(a: Poly, b: Poly): Poly {
  let x = pTrim(a)
  let y = pTrim(b)
  while (!pIsZero(y)) {
    const { r } = pDivMod(x, y)
    x = y
    y = r
  }
  return pIsZero(x) ? [] : pMonic(x)
}

/**
 * Scale a polynomial to whole-number coefficients with no common factor, and report the number
 * taken out. 2/3·x + 4/3 becomes (2/3)·(x + 2).
 */
export function pPrimitive(p: Poly): { content: Rat; prim: Poly } {
  const t = pTrim(p)
  if (t.length === 0) return { content: R1, prim: [] }
  const den = t.reduce((acc, c) => blcm(acc, c.d), 1n)
  const whole = t.map((c) => (c.n * den) / c.d)
  const num = whole.reduce((acc, n) => bgcd(acc, n), 0n) || 1n
  const sign = pLead(t).n < 0n ? -1n : 1n
  const content = rat(num * sign, den)
  return { content, prim: t.map((c) => rDiv(c, content)) }
}

/**
 * Every fraction that could be a root, by the rational root theorem: ± (factor of the constant)
 * over (factor of the leading coefficient).
 */
export function rationalRootCandidates(p: Poly): Rat[] {
  const { prim } = pPrimitive(p)
  if (prim.length < 2) return []
  let low = 0
  while (low < prim.length && rIsZero(prim[low])) low++
  const c0 = prim[low]
  const cn = prim[prim.length - 1]
  // Bounded: this runs on the window's own thread, and a constant term of 10^16 would otherwise
  // be 10^8 bigint divisions with the app frozen throughout.
  let truncated = false
  const divisors = (v: bigint): bigint[] => {
    const a = v < 0n ? -v : v
    const out: bigint[] = []
    let steps = 0
    for (let d = 1n; d * d <= a; d++) {
      if (steps++ > MAX_TRIAL) {
        truncated = true
        break
      }
      if (a % d === 0n) {
        out.push(d)
        if (d !== a / d) out.push(a / d)
      }
    }
    return out.sort((x, y) => (x < y ? -1 : 1))
  }
  const ps = divisors(c0.n)
  const qs = divisors(cn.n)
  const seen = new Set<string>()
  const out: Rat[] = []
  for (const a of ps) {
    for (const b of qs) {
      for (const s of [1n, -1n]) {
        const r = rat(s * a, b)
        const k = `${r.n}/${r.d}`
        if (!seen.has(k)) {
          seen.add(k)
          out.push(r)
        }
      }
    }
  }
  // Nearest to zero first: small, tidy roots are the ones a student would try.
  out.sort((x, y) => Math.abs(Number(x.n) / Number(x.d)) - Math.abs(Number(y.n) / Number(y.d)))
  if (low > 0) out.unshift(R0)
  lastSearchTruncated = truncated
  return out
}

/**
 * True when the last call to rationalRootCandidates gave up early.
 *
 * A module-level flag rather than a changed return type, so the existing signature — which tests
 * and callers already use — stays as it is.
 */
let lastSearchTruncated = false

/** Find the first rational root, and say whether the search was complete. */
export function findRationalRootDetailed(p: Poly): { root: Rat | null; tooBig: boolean } {
  const candidates = rationalRootCandidates(p)
  const truncated = lastSearchTruncated
  for (const c of candidates) if (rIsZero(pEval(p, c))) return { root: c, tooBig: false }
  return { root: null, tooBig: truncated }
}

/** The first rational root, or null. */
export function findRationalRoot(p: Poly): Rat | null {
  for (const c of rationalRootCandidates(p)) if (rIsZero(pEval(p, c))) return c
  return null
}

// ---------------------------------------------------------------- bridging to Expr

/** Convert a single-letter expression into coefficients. Throws if it has more than one letter. */
export function polyFromExpr(e: Expr, name?: string): { poly: Poly; name: string } {
  const vars = varsOf(e)
  if (vars.length > 1) throw new NotPolynomial(`This has more than one letter (${vars.join(', ')}), so I cannot do this step on it.`)
  const v = name ?? vars[0] ?? 'x'
  const out: Poly = []
  for (const t of e) {
    const k = t.v[v] ?? 0
    out[k] = rAdd(out[k] ?? R0, t.c)
  }
  for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = R0
  return { poly: pTrim(out), name: v }
}

export function exprFromPoly(p: Poly, name: string): Expr {
  const terms: Term[] = []
  p.forEach((c, k) => {
    if (!rIsZero(c)) terms.push({ c, v: k === 0 ? {} : { [name]: k } })
  })
  return normalize(terms)
}

export const pTex = (p: Poly, name: string): string => exprTex(exprFromPoly(p, name))
export const pTexBracketed = (p: Poly, name: string): string => {
  const t = pTrim(p)
  const s = pTex(t, name)
  return t.filter((c) => !rIsZero(c)).length > 1 ? `\\left(${s}\\right)` : s
}

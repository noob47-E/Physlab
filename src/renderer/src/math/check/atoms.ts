// G2B: exact equality for answers with elementary functions. An answer is read into a quotient of polynomials with
// rational coefficients in its letters AND in "atoms": sin u, cos u, e^u, ln u, roots of u and |u|, the inverse trig
// functions and asinh, acosh, atanh, each of an argument read the same way. Two answers whose forms are IDENTICAL are
// equal wherever both are defined: an identity of rational functions in independent symbols holds for every value of
// the symbols. It is sound, not complete — sin²x + cos²x and 1 have different forms, so that stays 'unknown'.
// Every rewrite made while reading is an identity on the whole domain, and every domain condition met (a
// denominator, ln's argument, an even root's argument, …) is recorded beside the form (docs/knowledge/check.md).

import { type MathNode } from 'mathjs'
import { constExpr, eAdd, eEq, eMul, eNeg, isConstant, normalize, NotPolynomial, varExpr, type Expr, type Term } from '../pure/mono'
import { exprFromPoly, findRationalRoot, pDeg, pDivMod, pEval, pMul, pSub, pTrim, polyFromExpr, type Poly } from '../pure/poly'
import { R0, R1, rAbs, rDiv, rFromNumber, rIsZero, rMul, rNeg, rSign, rStr, rat, type Rat } from '../pure/rat'
import { rationalRoot } from './field'
import { fnName, isMathName, perfectPower } from './parse'
import { checkSize, gcdOf, isolateRealRoots, pDeriv, piecePoints, realZeros, squarefree, type ExcludedPoint } from './realroots'
import { NotExact, tick } from './verdict'

type Loose = { type: string; op?: string; name?: string; value?: unknown; args?: MathNode[]; content?: MathNode }

/** num / den, polynomials in the letters and the atom names; den is not 0 wherever the answer is defined. */
interface F {
  num: Expr
  den: Expr
}

type Kind = 'sin' | 'cos' | 'exp' | 'ln' | 'root' | 'abs' | 'asin' | 'acos' | 'atan' | 'asinh' | 'acosh' | 'atanh'
type Sign = 'pos' | 'nonneg' | 'neg' | 'nonpos' | null

interface Atom {
  name: string
  kind: Kind
  /** The root's index (root only). */
  q: number
  /** The argument; a polynomial (den 1) for root and abs, so a power of the atom reduces to a polynomial. */
  arg: F
  /** 1 + the deepest atom in the argument. */
  depth: number
  sign: Sign
}

/** A domain condition: f ≠ 0, f > 0 or f ≥ 0, with f scaled to a leading coefficient of ±1. */
interface Cond {
  kind: 'ne0' | 'gt0' | 'ge0'
  f: F
}

/**
 * Size limits. School answers are far below them; past them the answer is not read here (NotExact), and the numbers
 * decide what they can. Every loop also calls tick(), so a public call stops at its time budget (verdict.ts).
 */
const MAX_ATOMS = 48
const MAX_DEPTH = 6
const MAX_DEGREE = 96
const MAX_POWER = 64
const MAX_ROOT = 64
/** The binary digits of any coefficient: (2^64)^64 is 4096; past this a root's Newton steps would run untimed. */
const MAX_BITS = 20_000
const bitsOf = (v: bigint): number => (v < 0n ? -v : v).toString(16).length * 4

const ATOM = '§'
const isAtom = (n: string): boolean => n.startsWith(ATOM)
const ONE_E: Expr = constExpr(R1)
const ZERO: F = { num: [], den: ONE_E }
const ONE: F = { num: ONE_E, den: ONE_E }
const fConst = (q: Rat): F => ({ num: constExpr(q), den: ONE_E })
const polyF = (e: Expr): F => ({ num: e, den: ONE_E })
const varF = (n: string): F => polyF(varExpr(n))
const isZero = (f: F): boolean => f.num.length === 0
const fNeg = (f: F): F => ({ num: eNeg(f.num), den: f.den })
const scaleE = (e: Expr, k: Rat): Expr => normalize(e.map((t) => ({ c: rMul(t.c, k), v: t.v })))
const namesOf = (e: Expr): string[] => [...new Set(e.flatMap((t) => Object.keys(t.v).filter((k) => t.v[k] !== 0)))].sort()
const termDegree = (t: Term): number => Object.values(t.v).reduce((s, p) => s + p, 0)

/** The rational number f is, or null when it holds a letter or an atom. */
function plainConstant(f: F): Rat | null {
  if (!isConstant(f.num) || !isConstant(f.den)) return null
  const n = f.num.length ? f.num[0].c : R0
  if (!f.den.length) throw new NotExact('division by zero')
  return rDiv(n, f.den[0].c)
}

/** grlex: total degree first, then the higher power of the first name in sorted order. A monomial order. */
function cmpMonomial(a: Record<string, number>, b: Record<string, number>): number {
  const da = Object.values(a).reduce((s, p) => s + p, 0)
  const db = Object.values(b).reduce((s, p) => s + p, 0)
  if (da !== db) return da - db
  for (const n of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    const d = (a[n] ?? 0) - (b[n] ?? 0)
    if (d !== 0) return d
  }
  return 0
}
const leadCoeff = (e: Expr): Rat => e.reduce((best, t) => (cmpMonomial(t.v, best.v) > 0 ? t : best)).c

/** e = m · rest: m the largest monomial dividing every term (coefficient 1), rest the cofactor. */
function splitMonomial(e: Expr): { m: Record<string, number>; rest: Expr } {
  const m: Record<string, number> = {}
  for (const n of namesOf(e)) {
    const p = Math.min(...e.map((t) => t.v[n] ?? 0))
    if (p > 0) m[n] = p
  }
  const rest = normalize(e.map((t) => ({ c: t.c, v: Object.fromEntries(Object.entries(t.v).map(([n, p]) => [n, p - (m[n] ?? 0)])) })))
  return { m, rest }
}

/** The sign of a whole number's q-th power part: m = s^q · t, with t free of q-th powers of primes below 1000. */
function splitPower(m: bigint, q: number): { s: bigint; t: bigint } {
  let s = 1n
  let t = 1n
  let rest = m
  const Q = BigInt(q)
  for (let p = 2n; p < 1000n && p * p <= rest; p += p === 2n ? 1n : 2n) {
    let k = 0n
    while (rest % p === 0n) {
      rest /= p
      k++
    }
    s *= p ** (k / Q)
    t *= p ** (k % Q)
  }
  const r = rationalRoot(rat(rest), q)
  if (r) s *= r.n
  else t *= rest
  return { s, t }
}

/**
 * One comparison: the atoms both answers share, and the list the domain conditions of the answer being read go to.
 * Atoms are matched by kind and by an argument of the same form, so equal atoms have one name.
 */
class Session {
  atoms: Atom[] = []
  sink: Cond[] = []
  private byName = new Map<string, Atom>()
  private memo = new Map<MathNode, F>()
  private dmemo = new Map<string, F>()

  // ------------------------------------------------------------ polynomials with atoms

  /** a·b with every power of an atom reduced (√u² = u, |u|² = u², e^a·e^b = e^(a + b)). */
  mul(a: Expr, b: Expr): Expr {
    tick()
    const p = eMul(a, b)
    for (const t of p) {
      if (termDegree(t) > MAX_DEGREE) throw new NotExact('the degree is too high to work out here')
      if (bitsOf(t.c.n) > MAX_BITS || bitsOf(t.c.d) > MAX_BITS) throw new NotExact('the numbers are too big to work out here')
    }
    return this.reduce(p)
  }

  /** The depth of the deepest atom in t that can be reduced, or 0. */
  private reducible(t: Term): number {
    let top = 0
    let exps = 0
    let expDepth = 0
    let expPower = false
    for (const [n, p] of Object.entries(t.v)) {
      const a = this.byName.get(n)
      if (!a || p === 0) continue
      if (a.kind === 'root' && p >= a.q) top = Math.max(top, a.depth)
      if (a.kind === 'abs' && p >= 2) top = Math.max(top, a.depth)
      if (a.kind === 'exp') {
        exps++
        expDepth = Math.max(expDepth, a.depth)
        if (p >= 2) expPower = true
      }
    }
    return exps >= 2 || expPower ? Math.max(top, expDepth) : top
  }

  /**
   * Every reducible power, deepest first: R^p with R the q-th root of u is u^⌊p/q⌋·R^(p mod q), |u|^p is
   * u^(2⌊p/2⌋)·|u|^(p mod 2), and the exponentials of a term are one exponential of the sum. What a reduction brings in
   * comes from an argument, so it is shallower, and the depth falls every round.
   */
  private reduce(e: Expr): Expr {
    for (let round = 0; ; round++) {
      tick()
      // Two rounds per depth at most (a root's argument may bring an exponential that then merges).
      if (round > 2 * MAX_DEPTH + 4) throw new NotExact('the reduction does not settle')
      let top = 0
      for (const t of e) top = Math.max(top, this.reducible(t))
      if (top === 0) return e
      const out: Term[] = []
      for (const t of e) {
        if (this.reducible(t) !== top) out.push(t)
        else out.push(...this.reduceTerm(t, top))
      }
      e = normalize(out)
    }
  }

  private reduceTerm(t: Term, top: number): Term[] {
    const v: Record<string, number> = { ...t.v }
    let factor: Expr = constExpr(t.c)
    const exps = Object.keys(v).filter((n) => v[n] && this.byName.get(n)?.kind === 'exp')
    if (exps.length >= 2 || exps.some((n) => v[n] >= 2)) {
      if (Math.max(...exps.map((n) => this.byName.get(n)!.depth)) === top) {
        let sum = ZERO
        for (const n of exps) {
          sum = this.fAdd(sum, this.fMul(fConst(rat(v[n])), this.byName.get(n)!.arg))
          delete v[n]
        }
        if (!isZero(sum)) {
          const name = this.atom('exp', sum)
          v[name] = (v[name] ?? 0) + 1
        }
      }
    }
    for (const n of Object.keys(v)) {
      const a = this.byName.get(n)
      if (!a || a.depth !== top) continue
      if (a.kind === 'root' && v[n] >= a.q) {
        factor = eMul(factor, this.powE(a.arg.num, Math.floor(v[n] / a.q), false))
        v[n] %= a.q
      } else if (a.kind === 'abs' && v[n] >= 2) {
        factor = eMul(factor, this.powE(a.arg.num, 2 * Math.floor(v[n] / 2), false))
        v[n] %= 2
      }
    }
    return eMul(factor, normalize([{ c: R1, v }]))
  }

  private powE(e: Expr, k: number, reduce = true): Expr {
    if (k > MAX_POWER) throw new NotExact('the power is too high to work out here')
    let out = ONE_E
    for (let i = 0; i < k; i++) out = reduce ? this.mul(out, e) : eMul(out, e)
    return out
  }

  fAdd(a: F, b: F): F {
    if (eEq(a.den, b.den)) return { num: eAdd(a.num, b.num), den: a.den }
    return { num: eAdd(this.mul(a.num, b.den), this.mul(b.num, a.den)), den: this.mul(a.den, b.den) }
  }
  fSub(a: F, b: F): F {
    return this.fAdd(a, fNeg(b))
  }
  fMul(a: F, b: F): F {
    return { num: this.mul(a.num, b.num), den: eEq(a.den, ONE_E) ? b.den : eEq(b.den, ONE_E) ? a.den : this.mul(a.den, b.den) }
  }
  /** a / b, with no condition recorded: the caller records b ≠ 0 where it is not known already. */
  fDiv(a: F, b: F): F {
    if (isZero(b)) throw new NotExact('division by zero')
    return { num: this.mul(a.num, b.den), den: this.mul(a.den, b.num) }
  }
  fPow(a: F, k: number): F {
    if (k > MAX_POWER) throw new NotExact('the power is too high to work out here')
    return { num: this.powE(a.num, k), den: this.powE(a.den, k) }
  }

  /** a and b are the same form: a.num·b.den − b.num·a.den reduces to 0. */
  same(a: F, b: F): boolean {
    return this.fSub(a, b).num.length === 0
  }

  // ------------------------------------------------------------ atoms

  private atom(kind: Kind, arg: F, q = 0): string {
    tick()
    for (const a of this.atoms) if (a.kind === kind && a.q === q && this.same(a.arg, arg)) return a.name
    let depth = 1
    for (const n of [...namesOf(arg.num), ...namesOf(arg.den)]) depth = Math.max(depth, 1 + (this.byName.get(n)?.depth ?? 0))
    if (depth > MAX_DEPTH) throw new NotExact('functions nested too deeply to work out here')
    if (this.atoms.length >= MAX_ATOMS) throw new NotExact('too many functions to work out here')
    const sign: Sign =
      kind === 'exp'
        ? 'pos'
        : kind === 'abs' || kind === 'acos' || kind === 'acosh'
          ? 'nonneg'
          : kind === 'root'
            ? q % 2 === 0
              ? this.signOfPoly(arg.num) === 'pos'
                ? 'pos'
                : 'nonneg'
              : this.signOfPoly(arg.num)
            : null
    const a: Atom = { name: `${ATOM}${this.atoms.length}`, kind, q, arg, depth, sign }
    this.atoms.push(a)
    this.byName.set(a.name, a)
    return a.name
  }

  /** The scale c = lc(num)/lc(den) of f (an invariant of the form): its sign is the sign used for sin(−u) = −sin u. */
  private ratio(f: F): Rat {
    return rDiv(leadCoeff(f.num), leadCoeff(f.den))
  }

  sinF(u: F): F {
    if (isZero(u)) return ZERO
    return rSign(this.ratio(u)) < 0 ? fNeg(varF(this.atom('sin', fNeg(u)))) : varF(this.atom('sin', u))
  }
  cosF(u: F): F {
    if (isZero(u)) return ONE
    return varF(this.atom('cos', rSign(this.ratio(u)) < 0 ? fNeg(u) : u))
  }
  expF(a: F): F {
    return isZero(a) ? ONE : varF(this.atom('exp', a))
  }
  lnF(u: F): F {
    this.gt0(u)
    const c = plainConstant(u)
    if (c && c.n === 1n && c.d === 1n) return ZERO
    return varF(this.atom('ln', u))
  }
  /** An odd function: f(−u) = −f(u), f(0) = 0. */
  private odd(kind: 'asin' | 'atan' | 'asinh' | 'atanh', u: F): F {
    if (isZero(u)) return ZERO
    return rSign(this.ratio(u)) < 0 ? fNeg(varF(this.atom(kind, fNeg(u)))) : varF(this.atom(kind, u))
  }
  /** 1 − u², written over u's denominator squared. */
  private oneMinusSquare(u: F): Expr {
    return eAdd(this.mul(u.den, u.den), eNeg(this.mul(u.num, u.num)))
  }
  asinF(u: F): F {
    this.ge0(polyF(this.oneMinusSquare(u)))
    return this.odd('asin', u)
  }
  acosF(u: F): F {
    this.ge0(polyF(this.oneMinusSquare(u)))
    const c = plainConstant(u)
    if (c && c.n === 1n && c.d === 1n) return ZERO
    return varF(this.atom('acos', u))
  }
  atanF(u: F): F {
    return this.odd('atan', u)
  }
  asinhF(u: F): F {
    return this.odd('asinh', u)
  }
  acoshF(u: F): F {
    this.ge0(this.fSub(u, ONE))
    const c = plainConstant(u)
    if (c && c.n === 1n && c.d === 1n) return ZERO
    return varF(this.atom('acosh', u))
  }
  atanhF(u: F): F {
    this.gt0(polyF(this.oneMinusSquare(u)))
    return this.odd('atanh', u)
  }

  /** |f| = |num| / |den|. */
  absF(f: F): F {
    return { num: this.absPoly(f.num), den: this.absPoly(f.den) }
  }

  /** |P|: |c·m·rest| = |c|·|m|·|rest|, with |t|^even = t^even, a positive atom its own size, and P ≥ 0 itself. */
  absPoly(P: Expr): Expr {
    if (P.length === 0) return P
    if (isConstant(P)) return constExpr(rAbs(P[0].c))
    const s = this.signOfPoly(P)
    if (s === 'pos' || s === 'nonneg') return P
    if (s === 'neg' || s === 'nonpos') return eNeg(P)
    const c = leadCoeff(P)
    const { m, rest } = splitMonomial(scaleE(P, rDiv(R1, c)))
    let out = constExpr(rAbs(c))
    for (const [n, p] of Object.entries(m)) out = this.mul(out, this.absPower(n, p))
    if (isConstant(rest)) return this.mul(out, constExpr(rAbs(rest[0].c)))
    const rs = this.signOfPoly(rest)
    if (rs === 'pos' || rs === 'nonneg') return this.mul(out, rest)
    if (rs === 'neg' || rs === 'nonpos') return this.mul(out, eNeg(rest))
    return this.mul(out, varExpr(this.atom('abs', polyF(rest))))
  }

  /** |n|^p for one letter or atom n. */
  private absPower(n: string, p: number): Expr {
    const s = this.byName.get(n)?.sign
    if (p % 2 === 0 || s === 'pos' || s === 'nonneg') return varExpr(n, p)
    return this.powE(varExpr(this.atom('abs', varF(n))), p)
  }

  /** The real q-th root of f (odd roots of negatives are real, G00), exactly where it can be, an atom otherwise. */
  root(f: F, q: number): F {
    if (q < 1 || q > MAX_ROOT) throw new NotExact('root index')
    if (q === 1 || isZero(f)) return f
    const c = plainConstant(f)
    if (c) return polyF(this.rootConst(c, q))
    if (isConstant(f.den)) return polyF(this.rootPoly(scaleE(f.num, rDiv(R1, f.den[0].c)), q))
    // ᵠ√(N/D) = ᵠ√N / C when D = C^q; otherwise ᵠ√(N·D^(q−1)) / D (odd q) or / |D| (even q). D ≠ 0 where defined.
    const C = this.perfectPowerOf(f.den, q)
    if (C) return { num: this.rootPoly(f.num, q), den: q % 2 ? C : this.absPoly(C) }
    return { num: this.rootPoly(this.mul(f.num, this.powE(f.den, q - 1)), q), den: q % 2 ? f.den : this.absPoly(f.den) }
  }

  /** ᵠ√c for a rational c: exact when it is, else s·ᵠ√t with t a whole number free of small q-th powers. */
  private rootConst(c: Rat, q: number): Expr {
    if (rIsZero(c)) return []
    const r = rationalRoot(c, q)
    if (r) return constExpr(r)
    if (c.n < 0n && q % 2 === 0) throw new NotExact('an even root of a negative number is not real')
    const neg = c.n < 0n
    const n = neg ? -c.n : c.n
    if (bitsOf(n) + bitsOf(c.d) * (q - 1) > MAX_BITS) throw new NotExact('the numbers are too big to work out here')
    // ᵠ√(n/d) = ᵠ√(n·d^(q−1)) / d
    const { s, t } = splitPower(n * c.d ** BigInt(q - 1), q)
    const k = rat(neg ? -s : s, c.d)
    return t === 1n ? constExpr(k) : [{ c: k, v: { [this.atom('root', fConst(rat(t)), q)]: 1 } }]
  }

  /** C with C^q = D, for a monomial or a polynomial in one letter; null otherwise. */
  private perfectPowerOf(D: Expr, q: number): Expr | null {
    if (D.length === 1) {
      const t = D[0]
      const r = rationalRoot(t.c, q)
      if (!r || Object.values(t.v).some((p) => p % q !== 0)) return null
      return normalize([{ c: r, v: Object.fromEntries(Object.entries(t.v).map(([n, p]) => [n, p / q])) }])
    }
    const ns = namesOf(D)
    if (ns.length === 1 && !isAtom(ns[0])) return perfectPower(D, q)
    return null
  }

  /** ᵠ√P for a non-zero polynomial P: its constant scale taken out first, so ᵠ√(4u) is 2·ᵠ√u. */
  private rootPoly(P: Expr, q: number): Expr {
    if (isConstant(P)) return this.rootConst(P.length ? P[0].c : R0, q)
    const lc = leadCoeff(P)
    const scale = q % 2 ? lc : rAbs(lc)
    return this.mul(this.rootConst(scale, q), this.rootUnit(scaleE(P, rDiv(R1, scale)), q))
  }

  /** ᵠ√U for U with leading coefficient ±1. */
  private rootUnit(U: Expr, q: number): Expr {
    if (U.length === 1) {
      const r = this.rootMonomial(U[0], q)
      if (r) return r
    }
    const ns = namesOf(U)
    if (ns.length === 1 && !isAtom(ns[0])) {
      const S = perfectPower(U, q)
      if (S) return q % 2 ? S : this.absPoly(S)
      // An odd root is multiplicative everywhere: ∛((x² + 1)²) = (∛(x² + 1))². An even root is not split: √(x²(x − 1))
      // is defined at 0, |x|·√(x − 1) is not.
      if (q % 2 === 1) {
        const parts = squarefreeParts(polyFromExpr(U, ns[0]).poly)
        if (parts && parts.length > 2) {
          let out = constExpr(R1)
          parts.forEach((f, i) => {
            if (i === 0 || pDeg(f) < 1) return
            const e = exprFromPoly(f, ns[0])
            out = this.mul(out, this.powE(e, Math.floor(i / q)))
            if (i % q) out = this.mul(out, this.powE(varExpr(this.atom('root', polyF(e), q)), i % q))
          })
          return out
        }
      }
    }
    if (q % 2 === 0) this.ge0(polyF(U))
    return varExpr(this.atom('root', polyF(U), q))
  }

  /**
   * ᵠ√(±monomial): an exponential comes out whole (e^a > 0), a power divisible by q comes out (|…| for even q), and
   * √(±t^p) for one letter or atom t and odd p is (±t)^((p−1)/2)·√(±t), which is the same on its domain (±t ≥ 0).
   */
  private rootMonomial(t: Term, q: number): Expr | null {
    const neg = t.c.n < 0n
    let expSum = ZERO
    const rest: [string, number][] = []
    for (const [n, p] of Object.entries(t.v)) {
      const a = this.byName.get(n)
      if (a?.kind === 'exp') expSum = this.fAdd(expSum, this.fMul(fConst(rat(p)), a.arg))
      else if (p) rest.push([n, p])
    }
    const expPart = isZero(expSum) ? ONE_E : this.expF(this.fMul(fConst(rat(1n, BigInt(q))), expSum)).num
    if (q % 2 === 1) {
      let whole: Expr = constExpr(neg ? rNeg(R1) : R1)
      const frac: Record<string, number> = {}
      for (const [n, p] of rest) {
        whole = this.mul(whole, varExpr(n, Math.floor(p / q)))
        if (p % q) frac[n] = p % q
      }
      const out = this.mul(whole, expPart)
      if (!Object.keys(frac).length) return out
      return this.mul(out, varExpr(this.atom('root', polyF(normalize([{ c: R1, v: frac }])), q)))
    }
    if (!rest.length) {
      if (neg) throw new NotExact('an even root of a negative number is not real')
      return expPart
    }
    if (!neg && rest.every(([, p]) => p % q === 0)) {
      let out = expPart
      for (const [n, p] of rest) out = this.mul(out, this.absPower(n, p / q))
      return out
    }
    if (q === 2 && rest.length === 1 && rest[0][1] % 2 === 1) {
      const [n, p] = rest[0]
      const signed = neg ? eNeg(varExpr(n)) : varExpr(n)
      this.ge0(polyF(signed))
      return this.mul(this.mul(expPart, this.powE(signed, (p - 1) / 2)), varExpr(this.atom('root', polyF(signed), 2)))
    }
    if (isZero(expSum)) return null
    // An exponential beside other letters: √(e^a·m) = e^(a/2)·√m.
    const m = normalize([{ c: neg ? rNeg(R1) : R1, v: Object.fromEntries(rest) }])
    return this.mul(expPart, this.rootUnit(m, q))
  }

  // ------------------------------------------------------------ signs

  private signOfTerm(t: Term): Sign {
    if (rSign(t.c) <= 0) return null
    let s: Sign = 'pos'
    for (const [n, p] of Object.entries(t.v)) {
      if (!p) continue
      const a = this.byName.get(n)?.sign ?? null
      if (a === 'pos') continue
      if (p % 2 === 0 || a === 'nonneg') s = 'nonneg'
      else return null
    }
    return s
  }

  /** pos (> 0 wherever defined), nonneg, neg, nonpos, or null when not known: termwise, or exactly in one letter. */
  signOfPoly(P: Expr): Sign {
    if (P.length === 0) return null
    const termwise = (e: Expr): Sign => {
      let any = false
      for (const t of e) {
        const s = this.signOfTerm(t)
        if (!s) return null
        if (s === 'pos') any = true
      }
      return any ? 'pos' : 'nonneg'
    }
    const up = termwise(P)
    if (up) return up
    const down = termwise(eNeg(P))
    if (down) return down === 'pos' ? 'neg' : 'nonpos'
    const ns = namesOf(P)
    if (ns.length !== 1 || isAtom(ns[0])) return null
    try {
      const p = polyFromExpr(P, ns[0]).poly
      const boxes = isolateRealRoots(squarefree(p))
      const signs = piecePoints(boxes).map((x) => rSign(pEval(p, x)))
      if (signs.every((s) => s > 0)) return boxes.length ? 'nonneg' : 'pos'
      if (signs.every((s) => s < 0)) return boxes.length ? 'nonpos' : 'neg'
    } catch (err) {
      if (!(err instanceof NotExact)) throw err
    }
    return null
  }

  signOfF(f: F): Sign {
    const n = this.signOfPoly(f.num)
    const d = this.signOfPoly(f.den)
    // The denominator is not 0 where f is defined, so ≥ 0 there is > 0.
    const dPos = d === 'pos' || d === 'nonneg'
    const dNeg = d === 'neg' || d === 'nonpos'
    if (!n || !(dPos || dNeg)) return null
    const flip: Record<string, Sign> = { pos: 'neg', nonneg: 'nonpos', neg: 'pos', nonpos: 'nonneg' }
    return dPos ? n : flip[n]
  }

  // ------------------------------------------------------------ domain conditions

  private push(kind: Cond['kind'], f: F): void {
    tick()
    this.sink.push({ kind, f })
  }

  /** f ≠ 0, recorded in its simplest equivalent form(s). */
  ne0(f: F): void {
    if (isZero(f)) throw new NotExact('division by zero')
    this.ne0Poly(f.num)
  }

  private ne0Poly(P: Expr): void {
    if (isConstant(P)) return
    const s = this.signOfPoly(P)
    if (s === 'pos' || s === 'neg') return
    const { m, rest } = splitMonomial(P)
    for (const n of Object.keys(m)) this.ne0Name(n)
    if (isConstant(rest)) return
    const rs = this.signOfPoly(rest)
    if (rs === 'pos' || rs === 'neg') return
    // c·e^a − c·e^b = 0 only where a = b (a constant counts as e^0).
    if (rest.length === 2) {
      const k = rDiv(rest[0].c, rest[1].c)
      const a = this.expArg(rest[0])
      const b = this.expArg(rest[1])
      if (k.n === -1n && k.d === 1n && a && b) return this.ne0(this.fSub(a, b))
    }
    this.push('ne0', polyF(scaleE(rest, rDiv(R1, leadCoeff(rest)))))
  }

  /** The exponent a when t is a coefficient times e^a (or a constant, e^0); null otherwise. */
  private expArg(t: Term): F | null {
    const ns = Object.keys(t.v).filter((n) => t.v[n])
    if (ns.length === 0) return ZERO
    const a = ns.length === 1 && t.v[ns[0]] === 1 ? this.byName.get(ns[0]) : undefined
    return a?.kind === 'exp' ? a.arg : null
  }

  /** n ≠ 0 for one letter or atom. */
  private ne0Name(n: string): void {
    const a = this.byName.get(n)
    if (!a) return this.push('ne0', varF(n))
    switch (a.kind) {
      case 'exp':
        return
      case 'root':
      case 'abs':
        return this.ne0Poly(a.arg.num)
      case 'sin':
      case 'cos':
        // sin c and cos c are not 0 at a rational c ≠ 0 (π is irrational); sin 0 never reaches here.
        if (plainConstant(a.arg)) return
        return this.push('ne0', varF(n))
      case 'ln':
      case 'acos':
      case 'acosh':
        return this.ne0(this.fSub(a.arg, ONE))
      default:
        return this.ne0(a.arg)
    }
  }

  /** f > 0. */
  gt0(f: F): void {
    const c = plainConstant(f)
    if (c) {
      if (rSign(c) > 0) return
      throw new NotExact('not defined anywhere')
    }
    if (isZero(f)) throw new NotExact('not defined anywhere')
    const s = this.signOfF(f)
    if (s === 'pos') return
    if (s === 'nonneg') return this.ne0(f)
    if (s === 'neg' || s === 'nonpos') throw new NotExact('not defined anywhere')
    this.push('gt0', this.unitScale(f))
    // f > 0 says f ≠ 0 as well, in its simplest terms: ln(ln x) needs ln x > 0, so x ≠ 1.
    this.ne0(f)
  }

  /** f ≥ 0. */
  ge0(f: F): void {
    if (isZero(f)) return
    const c = plainConstant(f)
    if (c) {
      if (rSign(c) >= 0) return
      throw new NotExact('not defined anywhere')
    }
    const s = this.signOfF(f)
    if (s === 'pos' || s === 'nonneg') return
    if (s === 'neg') throw new NotExact('not defined anywhere')
    this.push('ge0', this.unitScale(f))
  }

  /** f divided by |lc(num)/lc(den)|: the same sign everywhere, one spelling for 2u and u. */
  private unitScale(f: F): F {
    const k = rAbs(this.ratio(f))
    return { num: scaleE(f.num, rDiv(R1, k)), den: f.den }
  }

  /**
   * Whether condition c holds wherever every condition of `by` holds (a sufficient test). A condition f ≠ 0 in letters
   * only has isolated zeros: `points` allows it outright (an expression's cancelled factor, G00 §4); otherwise its
   * real zeros must be zeros of `by`'s own (a derivative may not have a hole that f′ has not).
   */
  implied(c: Cond, by: Cond[], points: boolean): boolean {
    if (c.kind === 'ne0' && this.atomFree(c.f) && (points || this.zerosShared(c.f.num, by))) return true
    for (const b of by) {
      tick()
      if (c.kind === 'ne0') {
        if (b.kind === 'ge0') continue
        if (this.same(c.f, b.f) || this.same(c.f, fNeg(b.f))) return true
        if (b.kind === 'gt0' && (this.same(c.f, polyF(b.f.num)) || this.same(c.f, polyF(eNeg(b.f.num))))) return true
        if (b.kind === 'ne0' && this.powerOf(c.f.num, b.f.num)) return true
      } else if (c.kind === 'gt0') {
        if (b.kind === 'gt0' && this.same(c.f, b.f)) return true
      } else if (b.kind !== 'ne0' && this.same(c.f, b.f)) return true
    }
    return false
  }

  /**
   * Every real zero of P (in one letter, no atom) is a zero of a condition of `by` that is f ≠ 0 or f > 0 in the same
   * letter: the square-free part of P over its gcd with theirs has no real root (Sturm). Exact; past checkSize, no.
   */
  private zerosShared(P: Expr, by: Cond[]): boolean {
    const ns = namesOf(P)
    if (ns.length !== 1) return false
    try {
      let theirs: Poly = [R1]
      for (const b of by) {
        tick()
        if (b.kind === 'ge0' || !this.atomFree(b.f)) continue
        const bs = namesOf(b.f.num)
        if (bs.length === 1 && bs[0] === ns[0]) theirs = pMul(theirs, squarefree(polyFromExpr(b.f.num, ns[0]).poly))
      }
      const mine = squarefree(polyFromExpr(P, ns[0]).poly)
      let q = pDivMod(mine, gcdOf(mine, theirs)).q
      // A rational zero outside `by`'s own region is no hole either: x + 1 = 0 beside acosh x, which needs x ≥ 1.
      for (let k = 0; k <= MAX_DEGREE; k++) {
        tick()
        if (isolateRealRoots(q).length === 0) return true
        const r = findRationalRoot(q)
        if (!r || !this.outside(r, ns[0], by)) return false
        q = pDivMod(q, [rNeg(r), R1]).q
      }
      return false
    } catch (err) {
      if (!(err instanceof NotExact)) throw err
      return false
    }
  }

  /** r breaks a condition > 0 or ≥ 0 of `by` in the letter v alone (or a denominator there is 0): r is not in the domain. */
  private outside(r: Rat, v: string, by: Cond[]): boolean {
    return by.some((b) => {
      if (b.kind === 'ne0' || !this.atomFree(b.f) || [...namesOf(b.f.num), ...namesOf(b.f.den)].some((n) => n !== v)) return false
      const d = pEval(polyFromExpr(b.f.den, v).poly, r)
      if (rIsZero(d)) return true
      const value = rSign(rDiv(pEval(polyFromExpr(b.f.num, v).poly, r), d))
      return b.kind === 'gt0' ? value <= 0 : value < 0
    })
  }

  /** P = ±Q^k for some k ≥ 2. */
  private powerOf(P: Expr, Q: Expr): boolean {
    const dp = Math.max(...P.map(termDegree))
    const dq = Math.max(...Q.map(termDegree))
    if (dq === 0 || dp % dq !== 0 || dp / dq < 2) return false
    const Qk = this.powE(Q, dp / dq)
    return this.same(polyF(P), polyF(Qk)) || this.same(polyF(P), polyF(eNeg(Qk)))
  }

  atomFree(f: F): boolean {
    return ![...namesOf(f.num), ...namesOf(f.den)].some(isAtom)
  }

  // ------------------------------------------------------------ reading

  read(node: MathNode): F {
    const hit = this.memo.get(node)
    if (hit) return hit
    tick()
    const f = this.readRaw(node)
    this.memo.set(node, f)
    return f
  }

  private readRaw(node: MathNode): F {
    const n = node as unknown as Loose
    switch (n.type) {
      case 'ConstantNode':
        if (typeof n.value !== 'number' || !Number.isFinite(n.value)) throw new NotExact('not a number')
        return fConst(rFromNumber(n.value))
      case 'SymbolNode': {
        const name = String(n.name)
        if (name === 'e') return this.expF(ONE)
        // π, i, E and every other name mathjs gives a meaning: π is not a free symbol (cos(π/2) = 0 would hide a pole).
        if (isMathName(name)) throw new NotExact(`${name} is not read here`)
        return varF(name)
      }
      case 'ParenthesisNode':
        return this.read(n.content as MathNode)
      case 'OperatorNode': {
        const args = n.args ?? []
        switch (n.op) {
          case '+':
            return args.map((a) => this.read(a)).reduce((a, b) => this.fAdd(a, b))
          case '-':
            return args.length === 1 ? fNeg(this.read(args[0])) : this.fSub(this.read(args[0]), this.read(args[1]))
          case '*':
            return args.map((a) => this.read(a)).reduce((a, b) => this.fMul(a, b))
          case '/': {
            const top = this.read(args[0])
            const bottom = this.read(args[1])
            this.nonzero(args[1])
            return this.fDiv(top, bottom)
          }
          case '^':
            return this.power(args[0], args[1])
        }
        throw new NotExact(`operator ${n.op}`)
      }
      case 'FunctionNode':
        return this.call(fnName(n as never), n.args ?? [])
    }
    throw new NotExact(`node ${n.type}`)
  }

  /** node ≠ 0, factor by factor as written: (1 + sin x)² ≠ 0 is 1 + sin x ≠ 0; nothing when it is > 0 by its shape. */
  private nonzero(node: MathNode): void {
    if (shapeSign(node) === 'pos') return
    const n = node as unknown as Loose
    if (n.type === 'ParenthesisNode') return this.nonzero(n.content as MathNode)
    if (n.type === 'OperatorNode' && n.op === '*') return (n.args ?? []).forEach((a) => this.nonzero(a))
    if (n.type === 'OperatorNode' && n.op === '-' && n.args?.length === 1) return this.nonzero(n.args[0])
    if (n.type === 'OperatorNode' && n.op === '^' && n.args?.length === 2 && !isE(n.args[0])) {
      const k = plainConstant(this.read(n.args[1]))
      if (k && k.d === 1n && k.n >= 1n) return this.nonzero(n.args[0])
    }
    this.ne0(this.read(node))
  }

  private power(baseNode: MathNode, expNode: MathNode): F {
    if (isE(baseNode)) return this.expF(this.read(expNode))
    const base = this.read(baseNode)
    const ex = this.read(expNode)
    const k = plainConstant(ex)
    if (!k) {
      // (e^a)^b = e^(ab): e^a > 0. Any other letter in an exponent is not read.
      const a = this.pureExp(base)
      if (a) return this.expF(this.fMul(a, ex))
      throw new NotExact('a letter in the exponent')
    }
    if (k.d > BigInt(MAX_ROOT) || k.n > BigInt(MAX_POWER) || k.n < -BigInt(MAX_POWER)) throw new NotExact('the power is too high')
    const p = Number(k.n)
    const q = Number(k.d)
    if (p < 0) this.nonzeroF(base)
    const b = q === 1 ? base : this.root(base, q)
    return p >= 0 ? this.fPow(b, p) : this.fPow(this.fDiv(ONE, b), -p)
  }

  private nonzeroF(f: F): void {
    const s = this.signOfF(f)
    if (s !== 'pos' && s !== 'neg') this.ne0(f)
  }

  /** a when f is exactly e^a. */
  private pureExp(f: F): F | null {
    if (!eEq(f.den, ONE_E) || f.num.length !== 1) return null
    const t = f.num[0]
    if (t.c.n !== 1n || t.c.d !== 1n) return null
    return this.expArg(t)
  }

  private call(name: string, args: MathNode[]): F {
    const one = (): F => {
      if (args.length !== 1) throw new NotExact(`${name} with ${args.length} arguments`)
      return this.read(args[0])
    }
    switch (name) {
      case 'abs':
      case 'mag':
        return this.absF(one())
      case 'sqrt':
        return this.root(one(), 2)
      case 'cbrt':
        return this.root(one(), 3)
      case 'nthRoot': {
        if (args.length !== 2) throw new NotExact('nthRoot')
        const k = plainConstant(this.read(args[1]))
        if (!k || k.d !== 1n || k.n < 1n || k.n > BigInt(MAX_ROOT)) throw new NotExact('root index')
        return this.root(this.read(args[0]), Number(k.n))
      }
      case 'exp':
        return this.expF(one())
      case 'ln':
        return this.lnF(one())
      // PhysLab's log is base 10. log(a, b) is not read: the shared reader and the numbers take its arguments in
      // different orders (docs/knowledge/check.md).
      case 'log':
      case 'log10':
        return this.fDiv(this.lnF(one()), this.lnF(fConst(rat(10n))))
      case 'log2':
        return this.fDiv(this.lnF(one()), this.lnF(fConst(rat(2n))))
      case 'sin':
        return this.sinF(one())
      case 'cos':
        return this.cosF(one())
      case 'tan':
      case 'sec':
      case 'csc':
      case 'cot': {
        const u = one()
        const s = this.sinF(u)
        const c = this.cosF(u)
        // tan u = sin u / cos u where cos u ≠ 0, the domain of tan u itself; the same for the others.
        const below = name === 'tan' || name === 'sec' ? c : s
        this.ne0(below)
        return this.fDiv(name === 'tan' ? s : name === 'cot' ? c : ONE, below)
      }
      case 'asin':
        return this.asinF(one())
      case 'acos':
        return this.acosF(one())
      case 'atan':
        return this.atanF(one())
      case 'asinh':
        return this.asinhF(one())
      case 'acosh':
        return this.acoshF(one())
      case 'atanh':
        return this.atanhF(one())
      case 'sinh':
      case 'cosh':
      case 'tanh':
      case 'sech':
      case 'csch':
      case 'coth': {
        // Exponentials, an identity everywhere: sinh u = (e^u − e^−u)/2, tanh u = (e^2u − 1)/(e^2u + 1), …
        const u = one()
        const p = this.expF(u)
        const m = this.expF(fNeg(u))
        const p2 = this.expF(this.fAdd(u, u))
        if (name === 'sinh') return this.fDiv(this.fSub(p, m), fConst(rat(2n)))
        if (name === 'cosh') return this.fDiv(this.fAdd(p, m), fConst(rat(2n)))
        if (name === 'tanh') return this.fDiv(this.fSub(p2, ONE), this.fAdd(p2, ONE))
        if (name === 'sech') return this.fDiv(this.fMul(fConst(rat(2n)), p), this.fAdd(p2, ONE))
        const below = this.fSub(p2, ONE)
        this.ne0(below)
        return this.fDiv(name === 'csch' ? this.fMul(fConst(rat(2n)), p) : this.fAdd(p2, ONE), below)
      }
    }
    throw new NotExact(`function ${name}`)
  }

  // ------------------------------------------------------------ derivatives

  /** df/dx, exactly. The conditions it needs beyond f's own (|u| and odd roots at u ≠ 0) go to the sink. */
  d(f: F, x: string): F {
    const dn = this.dPoly(f.num, x)
    if (isConstant(f.den)) return this.fDiv(dn, polyF(f.den))
    const dd = this.dPoly(f.den, x)
    const top = this.fSub(this.fMul(dn, polyF(f.den)), this.fMul(polyF(f.num), dd))
    return this.fDiv(top, polyF(this.mul(f.den, f.den)))
  }

  private dPoly(e: Expr, x: string): F {
    let out = ZERO
    for (const t of e) {
      for (const [n, p] of Object.entries(t.v)) {
        tick()
        if (!p) continue
        const dn = this.dName(n, x)
        if (isZero(dn)) continue
        const rest = normalize([{ c: rMul(t.c, rat(p)), v: { ...t.v, [n]: p - 1 } }])
        out = this.fAdd(out, this.fMul(polyF(rest), dn))
      }
    }
    return out
  }

  private dName(n: string, x: string): F {
    if (!isAtom(n)) return n === x ? ONE : ZERO
    const key = `${n} ${x}`
    const hit = this.dmemo.get(key)
    if (hit) return hit
    const out = this.dAtom(this.byName.get(n)!, x)
    this.dmemo.set(key, out)
    return out
  }

  private dAtom(a: Atom, x: string): F {
    const u = a.arg
    const du = this.d(u, x)
    if (isZero(du)) return ZERO
    const self = varF(a.name)
    switch (a.kind) {
      case 'sin':
        return this.fMul(this.cosF(u), du)
      case 'cos':
        return fNeg(this.fMul(this.sinF(u), du))
      case 'exp':
        return this.fMul(self, du)
      case 'ln':
        return this.fDiv(du, u)
      case 'root':
        // R′ = R·u′/(q·u), where u ≠ 0: a root has no derivative where its argument is 0.
        this.ne0(u)
        return this.fDiv(this.fMul(self, du), this.fMul(fConst(rat(a.q)), u))
      case 'abs':
        this.ne0(u)
        return this.fDiv(this.fMul(u, du), self)
      case 'asin':
      case 'acos': {
        const s = this.root(this.fDiv(polyF(this.oneMinusSquare(u)), polyF(this.mul(u.den, u.den))), 2)
        this.ne0(s)
        const out = this.fDiv(du, s)
        return a.kind === 'asin' ? out : fNeg(out)
      }
      case 'atan':
        return this.fDiv(du, this.fAdd(ONE, this.fMul(u, u)))
      case 'asinh':
        return this.fDiv(du, this.root(this.fAdd(this.fMul(u, u), ONE), 2))
      case 'acosh': {
        const s = this.root(this.fSub(this.fMul(u, u), ONE), 2)
        this.ne0(s)
        return this.fDiv(du, s)
      }
      case 'atanh': {
        const w = this.fSub(ONE, this.fMul(u, u))
        this.ne0(w)
        return this.fDiv(du, w)
      }
    }
  }

  /** A form's derivative is valid only inside its domain: every f ≥ 0 met while reading f becomes f > 0 as well. */
  interior(): void {
    for (const c of [...this.sink]) if (c.kind === 'ge0') this.ne0(c.f)
  }

  // ------------------------------------------------------------ text

  text(f: F): string {
    const top = this.textE(f.num)
    return eEq(f.den, ONE_E) ? top : `(${top})/(${this.textE(f.den)})`
  }

  private textE(e: Expr): string {
    if (!e.length) return '0'
    return e
      .map((t, i) => {
        const factors = Object.entries(t.v)
          .filter(([, p]) => p)
          .map(([n, p]) => (p === 1 ? this.textName(n) : `${this.textName(n)}^${p}`))
        const c = rAbs(t.c)
        const body = [...(factors.length && c.n === 1n && c.d === 1n ? [] : [rStr(c)]), ...factors].join('*')
        const sign = rSign(t.c) < 0 ? (i ? ' - ' : '-') : i ? ' + ' : ''
        return sign + body
      })
      .join('')
  }

  private textName(n: string): string {
    const a = this.byName.get(n)
    if (!a) return n
    const inner = this.text(a.arg)
    if (a.kind === 'abs') return `|${inner}|`
    if (a.kind === 'root') return a.q === 2 ? `sqrt(${inner})` : a.q === 3 ? `cbrt(${inner})` : `nthRoot(${inner}, ${a.q})`
    return `${a.kind}(${inner})`
  }

  condText(c: Cond): string {
    return `${this.text(c.f)} ${c.kind === 'ne0' ? '≠' : c.kind === 'gt0' ? '>' : '≥'} 0`
  }
}

/**
 * Yun's square-free parts of a monic p: p = Π partsᵢ^i (index 0 unused), each part monic and square-free; null when p
 * is past checkSize or is not monic. The product is multiplied back before it is trusted.
 */
function squarefreeParts(p0: Poly): Poly[] | null {
  const p = pTrim(p0)
  const lead = p[p.length - 1]
  if (!lead || lead.n !== 1n || lead.d !== 1n) return null
  try {
    checkSize(p)
  } catch {
    return null
  }
  const monic = (f: Poly): Poly => f.map((c) => rDiv(c, f[f.length - 1]))
  const parts: Poly[] = [[R1]]
  const b = pDeriv(p)
  const g = monic(gcdOf(p, b))
  let c = pDivMod(p, g).q
  let d = pTrim(pSub(pDivMod(b, g).q, pDeriv(c)))
  for (let i = 1; pDeg(c) >= 1; i++) {
    tick()
    if (i > MAX_DEGREE) return null
    const f = monic(gcdOf(c, d))
    parts[i] = f
    c = pDivMod(c, f).q
    d = pTrim(pSub(pDivMod(d, f).q, pDeriv(c)))
  }
  let back: Poly = [R1]
  parts.forEach((f, i) => {
    for (let k = 0; k < i; k++) back = pMul(back, f)
  })
  const diff = pTrim(pSub(back, p))
  return diff.length === 0 ? parts : null
}

/**
 * The sign a written expression has wherever it is defined, from its shape alone: a positive number, e, e^u and
 * cosh u are > 0; an even whole power, √u and |u| are ≥ 0; a sum of terms ≥ 0 with one > 0 is > 0, and so are a
 * product and a quotient of terms > 0. 1 + (x³ + atan x)² is > 0 though, multiplied out, its sign is not seen.
 */
function shapeSign(node: MathNode): 'pos' | 'nonneg' | null {
  const n = node as unknown as Loose
  const args = n.args ?? []
  const all = (): ('pos' | 'nonneg' | null)[] => args.map(shapeSign)
  switch (n.type) {
    case 'ConstantNode':
      return typeof n.value === 'number' ? (n.value > 0 ? 'pos' : n.value === 0 ? 'nonneg' : null) : null
    case 'SymbolNode':
      return n.name === 'e' ? 'pos' : null
    case 'ParenthesisNode':
      return shapeSign(n.content as MathNode)
    case 'FunctionNode': {
      const name = fnName(n as never)
      if (args.length !== 1) return null
      if (name === 'exp' || name === 'cosh') return 'pos'
      if (name === 'sqrt' || name === 'abs' || name === 'mag') return shapeSign(args[0]) === 'pos' ? 'pos' : 'nonneg'
      return null
    }
    case 'OperatorNode': {
      if (n.op === '+' && args.length === 1) return shapeSign(args[0])
      if (n.op === '+') {
        const ss = all()
        if (ss.some((x) => x === null)) return null
        return ss.includes('pos') ? 'pos' : 'nonneg'
      }
      if (n.op === '*' || n.op === '/') {
        const ss = all()
        if (ss.every((x) => x === 'pos')) return 'pos'
        // A quotient's bottom is never 0 where it is defined, but only > 0 makes the whole ≥ 0.
        return n.op === '*' && ss.every((x) => x !== null) ? 'nonneg' : null
      }
      if (n.op === '^' && args.length === 2) {
        if (isE(args[0])) return 'pos'
        const base = shapeSign(args[0])
        if (base === 'pos') return 'pos'
        const e = args[1] as unknown as Loose
        const k = e.type === 'ParenthesisNode' ? (e.content as unknown as Loose) : e
        if (k.type === 'ConstantNode' && typeof k.value === 'number' && Number.isInteger(k.value) && k.value % 2 === 0 && k.value > 0) return 'nonneg'
        return null
      }
      return null
    }
  }
  return null
}

const isE = (node: MathNode): boolean => {
  const n = node as unknown as Loose
  if (n.type === 'ParenthesisNode') return isE(n.content as MathNode)
  return n.type === 'SymbolNode' && n.name === 'e'
}

// ---------------------------------------------------------------- the three comparisons

/** What an atom proof of 'equal' carries: the excluded points, and every other condition, as text. */
interface AtomProof {
  excluded: ExcludedPoint[]
  conditions: string[]
}

/** Runs one comparison; anything not read exactly here is "not proved" (null), never a verdict. */
function attempt<T>(run: () => T | null): T | null {
  try {
    return run()
  } catch (err) {
    if (err instanceof NotExact || err instanceof NotPolynomial) return null
    throw err
  }
}

/**
 * Every condition of `cand` holds wherever `ref`'s do; with `points`, but at the isolated zeros of a letter-only f ≠ 0.
 */
const covers = (s: Session, ref: Cond[], cand: Cond[], points: boolean): boolean => cand.every((c) => s.implied(c, ref, points))

/**
 * The proof's record: the real zeros of every condition f ≠ 0 in one letter, and the rest as text. The zeros are found
 * once, from the product of the square-free parts, as `excludedOf` does in checkers.ts.
 */
function proofOf(s: Session, conds: Cond[]): AtomProof {
  const conditions: string[] = []
  const pointsOf: Expr[] = []
  // A point is a value of the one letter: with several letters, every condition is given as text.
  const letters = new Set(conds.flatMap((c) => [...namesOf(c.f.num), ...namesOf(c.f.den)]).filter((n) => !isAtom(n)))
  // f > 0 also records f ≠ 0; as text the > says it all.
  const said = (c: Cond): boolean => c.kind === 'ne0' && conds.some((b) => b.kind === 'gt0' && (s.same(c.f, b.f) || s.same(c.f, fNeg(b.f))))
  for (const c of conds) {
    const ns = [...namesOf(c.f.num), ...namesOf(c.f.den)]
    if (c.kind === 'ne0' && ns.length === 1 && !isAtom(ns[0]) && letters.size === 1) pointsOf.push(c.f.num)
    else if (!said(c)) {
      const t = s.condText(c)
      if (!conditions.includes(t)) conditions.push(t)
    }
  }
  const excluded: ExcludedPoint[] = []
  for (const name of [...new Set(pointsOf.flatMap(namesOf))]) {
    try {
      for (const z of realZeros(polyFromExpr(pointsOf.filter((e) => namesOf(e)[0] === name).reduce((a, b) => eMul(a, b)), name).poly)) {
        if (!excluded.some((e) => e.value === z.value && e.exact === z.exact)) excluded.push(z)
      }
    } catch (err) {
      // Past checkSize or mono's own size limits: the points are then given as text.
      if (!(err instanceof NotExact) && !(err instanceof NotPolynomial)) throw err
      conditions.push(...pointsOf.filter((e) => namesOf(e)[0] === name).map((e) => s.condText({ kind: 'ne0', f: polyF(e) })))
    }
  }
  return { excluded, conditions }
}

/**
 * a ≡ b with the same domain but at isolated points (G00: a cancelled factor's zeros), or null when that is not
 * proved. Both forms identical, every ln/root/inverse-trig condition of one also a condition of the other, and every
 * condition f ≠ 0 with an atom in it shared: (1 + sin x)/(1 + sin x) is undefined at every x = −π/2 + 2kπ.
 */
export function atomExpressionEqual(a: MathNode, b: MathNode): AtomProof | null {
  return attempt(() => {
    const s = new Session()
    const ca: Cond[] = (s.sink = [])
    const fa = s.read(a)
    const cb: Cond[] = (s.sink = [])
    const fb = s.read(b)
    if (!s.same(fa, fb) || !covers(s, ca, cb, true) || !covers(s, cb, ca, true)) return null
    return proofOf(s, [...ca, ...cb])
  })
}

/** What the atoms show for a derivative or an antiderivative: the same form, and the domain covered. */
export interface CalculusProof {
  same: boolean
  covered: boolean
}

/**
 * What differentiating f′ added: a condition ≥ 0 or > 0 of a root it made (√(1 − u²) for asin u), which holds on f's
 * domain anyway and joins `dom`; and a point where a root of u or |u| has no derivative (u ≠ 0), which is no hole of
 * f′ (x·|x| has a derivative at 0). Such a point is harmless when it is isolated in x, whatever the other letters are
 * (a condition in x alone): there the form holds on both sides, so a claim defined there is right there (by the mean
 * value theorem). Any other (a ≠ 0 from |a·x|, sin x ≠ 0 from |sin x|) may fail for every x, or on an interval, so it
 * must already follow from `dom`.
 */
function extrasHold(s: Session, dom: Cond[], extras: Cond[], x: string): boolean {
  for (const c of extras) if (c.kind !== 'ne0') dom.push(c)
  const inXAlone = (c: Cond): boolean => s.atomFree(c.f) && [...namesOf(c.f.num), ...namesOf(c.f.den)].every((n) => n === x)
  return extras.every((c) => c.kind !== 'ne0' || inXAlone(c) || s.implied(c, dom, false))
}

/**
 * claimed against d/dx of f, exactly: `same` when claimed ≡ f′; `covered` when claimed is defined wherever f′ can be:
 * on the inside of f's domain (`interior` makes every ≥ there a > as well). claimed may be defined on more (1/x is
 * d/dx ln x), never on less, not even at a point: 2x(x − 1)/(x − 1) is not d/dx x² at 1, nor x²/|x| d/dx (x|x|/2) at 0.
 * null when either is not read here.
 */
export function atomDerivative(f: MathNode, x: string, claimed: MathNode): CalculusProof | null {
  // d/de, d/dπ: a name mathjs gives a meaning is never the variable here.
  if (isMathName(x)) return null
  return attempt(() => {
    const s = new Session()
    const dom: Cond[] = (s.sink = [])
    const ff = s.read(f)
    s.interior()
    const extras: Cond[] = (s.sink = [])
    const df = s.d(ff, x)
    const cand: Cond[] = (s.sink = [])
    const g = s.read(claimed)
    return { same: s.same(df, g), covered: extrasHold(s, dom, extras, x) && covers(s, dom, cand, false) }
  })
}

/**
 * F against an antiderivative of f, exactly: `same` when F′ ≡ f; `covered` when F is defined wherever f is, on the
 * inside of f's domain (at an end of it, √x at 0, only one side counts), not even a point less. A constant of
 * integration differentiates away; so does a different constant on each piece of the domain, which the contract
 * allows (engine-semantics.md §6.6).
 */
export function atomAntiderivative(f: MathNode, x: string, F: MathNode): CalculusProof | null {
  if (isMathName(x)) return null
  return attempt(() => {
    const s = new Session()
    const dom: Cond[] = (s.sink = [])
    const ff = s.read(f)
    s.interior()
    const cand: Cond[] = (s.sink = [])
    const fF = s.read(F)
    s.interior()
    const extras: Cond[] = (s.sink = [])
    const dF = s.d(fF, x)
    return { same: s.same(dF, ff), covered: covers(s, dom, cand, false) && extrasHold(s, dom, extras, x) }
  })
}

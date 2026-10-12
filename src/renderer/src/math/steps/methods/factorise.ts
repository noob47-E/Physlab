// Factorising over the rationals (S1c), in school order, each move its own step:
// (a) the highest common factor (numbers and letters); (b) the difference of two squares; (c) a perfect-square trinomial;
// (d) a quadratic trinomial by the ac method (split the middle term, group, take out the common binomial);
// (e) grouping for four terms; (f) the sum or difference of two cubes; then the rational root test for a factor of
// degree 3 or more (the factor theorem, then the quotient). Each factor is repeated until it can be factorised no further.
//
// A factor that cannot be factorised over the rationals is said so in a step, and only with its proof: a quadratic
// whose discriminant is not a perfect square, or a cubic with no rational root. Any other factor declines the method.

import type { ExprOp, Method, Problem, Step, Working } from '../types'
import { CANT_SHOW_STEPS_REASON } from '../router'
import {
  binomialSumText,
  collectTerms,
  coefficientOf,
  expandTerms,
  groupSumText,
  multiplyTermLists,
  irreducibleOver,
  normalizeDisplayed,
  powerBase,
  rationalRootsOf,
  ratCbrt,
  ratSqrt,
  stringifyNodeOrText,
  sumText,
  termText
} from '../check-adapter'
import { exprDegree, normalize, varsOf, type Expr, type Term } from '../../pure/mono'
import { bgcd, rAbs, rat, rAdd, rDiv, rEq, rIsNeg, rIsZero, rMul, rNeg, rStr, rSub, type Rat } from '../../pure/rat'
import { productStep, productWorking } from './productState'

/** The one letter of the input, or null when there is none or more than one. */
function letterOf(input: string): string | null {
  const letters = [...new Set(input.match(/\p{L}/gu) ?? [])]
  return letters.length === 1 ? letters[0] : null
}

// A factor read exactly as a polynomial: expandTerms reads a negative power of ten exactly, tryParsePoly does not.
function readPoly(text: string): Expr | null {
  const t = expandTerms(text)
  return t ? normalize(t) : null
}

const FACTORISE_ID = 'factorise'

/** One planned move on a factor: the factors it becomes, and the op that proves it. */
interface Transition {
  width: number
  repl: string[]
  op: ExprOp
}

function absBig(n: bigint): bigint {
  return n < 0n ? -n : n
}

function lcmBig(a: bigint, b: bigint): bigint {
  return (a / bgcd(a, b)) * b
}

/** The content of a list of terms: the largest rational that divides every coefficient (positive). */
function contentOf(terms: Term[]): Rat {
  let g = 0n
  let l = 1n
  for (const t of terms) {
    g = bgcd(g, absBig(t.c.n))
    l = lcmBig(l, t.c.d)
  }
  return rat(g, l)
}

/** The powers with the given powers taken away (letters left at zero are dropped). */
function minusPowers(v: Record<string, number>, minus: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const n of Object.keys(v)) {
    const p = v[n] - (minus[n] ?? 0)
    if (p !== 0) out[n] = p
  }
  return out
}

/** The highest common factor of a sum: its content (signed like the leading term) and the letters every term has. */
function hcfOf(terms: Term[]): { coef: Rat; minPow: Record<string, number> } {
  const sorted = collectTerms(terms)
  const content = contentOf(sorted)
  const coef = rIsNeg(sorted[0].c) ? rNeg(content) : content
  const minPow: Record<string, number> = {}
  const names = new Set<string>()
  for (const t of sorted) for (const n of Object.keys(t.v)) names.add(n)
  for (const n of names) {
    const p = Math.min(...sorted.map((t) => t.v[n] ?? 0))
    if (p > 0) minPow[n] = p
  }
  return { coef, minPow }
}

/** Take out the highest common factor, when there is one beyond 1. */
function hcfTransition(terms: Term[]): Transition | null {
  const { coef, minPow } = hcfOf(terms)
  if (rEq(coef, rat(1n)) && Object.keys(minPow).length === 0) return null
  const rest = collectTerms(terms.map((t) => ({ c: rDiv(t.c, coef), v: minusPowers(t.v, minPow) })))
  const hcf: Term = { c: coef, v: minPow }
  return {
    width: 1,
    repl: [termText(hcf, true), sumText(rest)],
    op: { kind: 'take-out-hcf' }
  }
}

/** The power of each letter halved, or null when one is odd. */
function halvedPowers(v: Record<string, number>): Record<string, number> | null {
  const out: Record<string, number> = {}
  for (const n of Object.keys(v)) {
    if (v[n] % 2 !== 0) return null
    if (v[n] !== 0) out[n] = v[n] / 2
  }
  return out
}

/** The power of each letter divided by three, or null when one is not a multiple of three. */
function thirdPowers(v: Record<string, number>): Record<string, number> | null {
  const out: Record<string, number> = {}
  for (const n of Object.keys(v)) {
    if (v[n] % 3 !== 0) return null
    if (v[n] !== 0) out[n] = v[n] / 3
  }
  return out
}

/** a² − b², when a sum of two terms is one. */
function differenceOfSquares(terms: Term[]): Transition | null {
  if (terms.length !== 2) return null
  const pos = terms.find((t) => !rIsNeg(t.c))
  const neg = terms.find((t) => rIsNeg(t.c))
  if (!pos || !neg) return null
  const pa = ratSqrt(pos.c)
  const pb = ratSqrt(rAbs(neg.c))
  const ha = halvedPowers(pos.v)
  const hb = halvedPowers(neg.v)
  if (!pa || !pb || !ha || !hb) return null
  const a: Term = { c: pa, v: ha }
  const b: Term = { c: pb, v: hb }
  return {
    width: 1,
    repl: [
      sumText(collectTerms([a, { c: rNeg(b.c), v: b.v }])),
      sumText(collectTerms([a, b]))
    ],
    op: { kind: 'difference-of-squares', a: termText(a, true), b: termText(b, true) }
  }
}

/** a³ ± b³, when a sum of two terms is one. */
function sumOrDifferenceOfCubes(terms: Term[]): Transition | null {
  if (terms.length !== 2) return null
  const sorted = collectTerms(terms)
  const [t1, t2] = sorted
  if (rIsNeg(t1.c)) return null
  const ca = ratCbrt(t1.c)
  const cb = ratCbrt(rAbs(t2.c))
  const ha = thirdPowers(t1.v)
  const hb = thirdPowers(t2.v)
  if (!ca || !cb || !ha || !hb) return null
  const sign: '+' | '-' = rIsNeg(t2.c) ? '-' : '+'
  const a: Term = { c: ca, v: ha }
  const b: Term = { c: cb, v: hb }
  const sb: Term = sign === '+' ? b : { c: rNeg(b.c), v: b.v }
  // a² − s·ab + b², with s = +1 for a sum and −1 for a difference.
  const ab = multiplyTermLists([[a], [b]])
  const aa = multiplyTermLists([[a], [a]])
  const bb = multiplyTermLists([[b], [b]])
  if (!ab || !aa || !bb) return null
  const middle: Term = { c: rNeg(ab[0].c), v: ab[0].v }
  const sMiddle: Term = sign === '+' ? middle : { c: rNeg(middle.c), v: middle.v }
  const f1 = collectTerms([a, sb])
  const f2 = collectTerms([aa[0], sMiddle, bb[0]])
  return {
    width: 1,
    repl: [sumText(f1), sumText(f2)],
    op: { kind: 'cube-factor', a: termText(a, true), b: termText(b, true), sign }
  }
}

/** A perfect-square trinomial a² ± 2ab + b² = (a ± b)². */
function perfectSquareTransition(terms: Term[], v: string): Transition | null {
  if (terms.length !== 3) return null
  const c2 = coefficientOf(terms, v, 2)
  const c1 = coefficientOf(terms, v, 1)
  const c0 = coefficientOf(terms, v, 0)
  if (rIsZero(c2) || rIsZero(c1) || rIsNeg(c2) || rIsNeg(c0)) return null
  const s2 = ratSqrt(c2)
  const s0 = ratSqrt(c0)
  if (!s2 || !s0) return null
  if (!rEq(rAbs(c1), rMul(rat(2n), rMul(s2, s0)))) return null
  const a: Term = { c: s2, v: { [v]: 1 } }
  const b: Term = { c: s0, v: {} }
  const sign: '+' | '-' = rIsNeg(c1) ? '-' : '+'
  const inner = collectTerms([a, sign === '+' ? b : { c: rNeg(b.c), v: b.v }])
  return {
    width: 1,
    repl: [`(${sumText(inner)})^2`],
    op: { kind: 'perfect-square', a: termText(a, true), b: termText(b, true), sign }
  }
}

/**
 * The ac method for a quadratic a x² + b x + c with rational roots: split the middle term (p + q = b, pq = ac), group
 * the first pair and the last pair, and take out the common binomial. Three steps, each its own move.
 * A quadratic with no rational roots is proved irreducible and said so in one step.
 */
function acTransitions(terms: Term[], v: string): Transition[] | null {
  const a2 = coefficientOf(terms, v, 2)
  const a1 = coefficientOf(terms, v, 1)
  const a0 = coefficientOf(terms, v, 0)
  if (rIsZero(a2) || rIsZero(a0)) return null
  const disc = rSub(rMul(a1, a1), rMul(rat(4n), rMul(a2, a0)))
  if (rIsNeg(disc) || ratSqrt(disc) === null) return null
  const s = ratSqrt(disc)
  if (!s) return null
  const p = rDiv(rAdd(a1, s), rat(2n))
  const q = rDiv(rSub(a1, s), rat(2n))
  if (rIsZero(p) || rIsZero(q)) return null
  const split = sumText([
    { c: a2, v: { [v]: 2 } },
    { c: p, v: { [v]: 1 } },
    { c: q, v: { [v]: 1 } },
    { c: a0, v: {} }
  ])
  // The first pair: a2 x² + p x = m1 · B; the second: q x + a0 = m2 · B, with the same binomial B.
  const g1 = rMul(contentOf([{ c: a2, v: {} }, { c: p, v: {} }]), rIsNeg(a2) ? rat(-1n) : rat(1n))
  const m1: Term = { c: g1, v: { [v]: 1 } }
  const common = collectTerms([
    { c: rDiv(a2, g1), v: { [v]: 1 } },
    { c: rDiv(p, g1), v: {} }
  ])
  const m2c = rDiv(rMul(q, g1), a2)
  const sign: '+' | '-' = rIsNeg(m2c) ? '-' : '+'
  const m2: Term = { c: rAbs(m2c), v: {} }
  const m1Text = termText(m1, true)
  const m2Text = termText(m2, true)
  const commonText = sumText(common)
  return [
    { width: 1, repl: [split], op: { kind: 'split-middle', p: rStr(p), q: rStr(q) } },
    {
      width: 1,
      repl: [groupSumText(m1Text, commonText, m2Text, sign)],
      op: { kind: 'group-pairs', m1: m1Text, m2: m2Text, common: commonText, sign }
    },
    {
      width: 1,
      repl: [binomialSumText(m1Text, m2Text, sign), commonText],
      op: { kind: 'common-binomial', m1: m1Text, m2: m2Text, common: commonText, sign }
    }
  ]
}

/** The two terms of a pair with their common monomial taken out, and the binomial left (both collected). */
function pairCommon(pair: Term[]): { mono: Term; rest: Term[] } | null {
  const content = contentOf(pair)
  const sign = rIsNeg(pair[0].c) ? rat(-1n) : rat(1n)
  const c = rMul(content, sign)
  const minPow: Record<string, number> = {}
  const names = new Set<string>()
  for (const t of pair) for (const n of Object.keys(t.v)) names.add(n)
  for (const n of names) {
    const p = Math.min(...pair.map((t) => t.v[n] ?? 0))
    if (p > 0) minPow[n] = p
  }
  const rest = collectTerms(pair.map((t) => ({ c: rDiv(t.c, c), v: minusPowers(t.v, minPow) })))
  if (rest.length !== 2 || rest.every((t) => Object.keys(t.v).length === 0)) return null
  return { mono: { c, v: minPow }, rest }
}

/**
 * Grouping for four terms, taken in the order written: the first pair and the last pair must each have a common
 * monomial, and their binomials must be the same up to a number. Two steps: the grouped sum, then the common binomial.
 */
function groupingTransitions(factor: string): Transition[] | null {
  const terms = expandTerms(factor)
  if (!terms || terms.length !== 4) return null
  const first = pairCommon([terms[0], terms[1]])
  const second = pairCommon([terms[2], terms[3]])
  if (!first || !second) return null
  const B1 = first.rest
  const B2 = second.rest
  // B2 = λ B1: the same powers, with one ratio for both terms.
  const match = (t: Term): Term | undefined => B2.find((u) => powersMatch(u.v, t.v))
  const u0 = match(B1[0])
  if (!u0 || rIsZero(B1[0].c)) return null
  const lambda = rDiv(u0.c, B1[0].c)
  for (const t of B1) {
    const u = match(t)
    if (!u || !rEq(u.c, rMul(lambda, t.c))) return null
  }
  const m1 = first.mono
  const m2c = rMul(second.mono.c, lambda)
  const m2: Term = { c: rAbs(m2c), v: second.mono.v }
  const sign: '+' | '-' = rIsNeg(m2c) ? '-' : '+'
  const m1Text = termText(m1, true)
  const m2Text = termText(m2, true)
  const commonText = sumText(B1)
  return [
    {
      width: 1,
      repl: [groupSumText(m1Text, commonText, m2Text, sign)],
      op: { kind: 'group-pairs', m1: m1Text, m2: m2Text, common: commonText, sign }
    },
    {
      width: 1,
      repl: [binomialSumText(m1Text, m2Text, sign), commonText],
      op: { kind: 'common-binomial', m1: m1Text, m2: m2Text, common: commonText, sign }
    }
  ]
}

/** True when two letter powers are the same (zero powers ignored). */
function powersMatch(a: Record<string, number>, b: Record<string, number>): boolean {
  const names = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const n of names) if ((a[n] ?? 0) !== (b[n] ?? 0)) return false
  return true
}

/**
 * The factor theorem: a rational root r = n/d gives the linear factor d x − n, and the quotient is the rest of the factor.
 * Null when the root search cannot run; a result with no root is 'none'.
 */
function rootTransition(P: Expr, v: string): Transition | 'none' | null {
  const roots = rationalRootsOf(P, v)
  if (roots === null) return null
  if (roots.length === 0) return 'none'
  const r = roots[0]
  const d = r.d
  const n = r.n
  const deg = exprDegree(P)
  // Synthetic division by (x − r): the quotient's coefficients from the top down.
  const a: Rat[] = []
  for (let k = 0; k <= deg; k++) a.push(coefficientOf(P, v, k))
  const q: Rat[] = new Array<Rat>(deg).fill(rat(0n))
  q[deg - 1] = a[deg]
  for (let k = deg - 1; k >= 1; k--) q[k - 1] = rAdd(a[k], rMul(r, q[k]))
  const quotient: Term[] = []
  for (let k = 0; k < deg; k++) {
    const c = rDiv(q[k], rat(d))
    if (!rIsZero(c)) quotient.push({ c, v: k === 0 ? {} : { [v]: k } })
  }
  const linear = collectTerms([
    { c: rat(d), v: { [v]: 1 } },
    { c: rat(-n), v: {} }
  ])
  return {
    width: 1,
    repl: [sumText(linear), sumText(collectTerms(quotient))],
    op: { kind: 'linear-factor', root: rStr(r) }
  }
}

/** Whether a factor is finished: a monomial, a linear factor, a power of a linear factor, or one proved irreducible. */
function isDone(f: string, declared: Set<string>): boolean {
  if (declared.has(normalizeDisplayed(f))) return true
  const P = readPoly(f)
  if (!P) return false
  if (P.length <= 1) return true
  // A linear factor (or the base of a power) is finished only when no common factor is left to take out: 2x + 4 is not.
  const base = powerBase(f)
  const linear = base ? readPoly(base.base) : P
  return !!linear && exprDegree(linear) === 1 && hcfTransition(collectTerms(linear)) === null
}

/** The moves on one factor, in school order; null when the factor is outside what this method can prove. */
function transitionsFor(f: string, v: string): Transition[] | null {
  const P = readPoly(f)
  if (!P || varsOf(P).some((n) => n !== v)) return null
  const terms = collectTerms(P)
  const deg = exprDegree(P)
  const hcf = hcfTransition(terms)
  if (hcf) return [hcf]
  const squares = differenceOfSquares(terms)
  if (squares) return [squares]
  const cubes = sumOrDifferenceOfCubes(terms)
  if (cubes) return [cubes]
  if (terms.length === 3 && deg === 2) {
    const square = perfectSquareTransition(terms, v)
    if (square) return [square]
    const ac = acTransitions(terms, v)
    if (ac) return ac
    return irreducibleIf(f, P, v)
  }
  if (terms.length === 4) {
    const grouped = groupingTransitions(f)
    if (grouped) return grouped
  }
  if (deg >= 3) {
    const root = rootTransition(P, v)
    if (root === null) return null
    if (root === 'none') return deg === 3 ? irreducibleIf(f, P, v) : null
    return [root]
  }
  return irreducibleIf(f, P, v)
}

/** The factor said to be irreducible over the rationals, when its proof holds; null otherwise. */
function irreducibleIf(f: string, P: Expr, v: string): Transition[] | null {
  return irreducibleOver(P, v) === true ? [{ width: 1, repl: [f], op: { kind: 'irreducible' } }] : null
}

/** The factorising working of a typed polynomial in one letter, or the can't-show fallback. */
function factoriseWorking(problem: Problem): Working {
  const declined: Working = { steps: [], noWorking: true, reason: CANT_SHOW_STEPS_REASON }
  const input = stringifyNodeOrText(problem.input)
  const v = letterOf(input)
  if (v === null) return declined
  const P = readPoly(input)
  if (!P || varsOf(P).some((n) => n !== v)) return declined
  let state: string[] = [input]
  const steps: Step[] = []
  const declared = new Set<string>()
  for (let guard = 0; guard < 60; guard++) {
    const i = state.findIndex((f) => !isDone(f, declared))
    if (i < 0) break
    const moves = transitionsFor(state[i], v)
    if (!moves) return declined
    for (const move of moves) {
      const after = [...state.slice(0, i), ...move.repl, ...state.slice(i + move.width)]
      steps.push(productStep(state, after, i, move.width, move.op, v))
      if (move.op.kind === 'irreducible') declared.add(normalizeDisplayed(state[i]))
      state = after
    }
  }
  if (steps.length === 0) return declined
  return productWorking(`Factorise ${input}`, input, 'Factorise', steps, v)
}

export const factoriseMethod: Method = {
  id: FACTORISE_ID,
  name: 'Factorise',
  order: 10,
  isAlternative: false,

  appliesTo(problem: Problem) {
    if (problem.job !== 'factor') return { applies: false, why: `Job '${problem.job}' is not factor` }
    const input = stringifyNodeOrText(problem.input)
    const P = readPoly(input)
    if (!P) return { applies: false, why: 'the expression is not read exactly' }
    if (varsOf(P).length !== 1) return { applies: false, why: 'not a polynomial in one letter' }
    return { applies: true }
  },

  solve(problem: Problem): Working {
    return factoriseWorking(problem)
  }
}

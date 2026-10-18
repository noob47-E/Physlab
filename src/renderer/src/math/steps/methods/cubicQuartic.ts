// Cubic and quartic equations in one variable (Part S3):
// rational root test -> divide by (d·x - n) -> the quadratic (solved through the router's
// existing quadratic methods!) -> real or complex roots; every step validated (validate.ts),
// and final roots checked against the ORIGINAL equation.

import type { Domain, EquationOp, Method, Problem, RouterOptions, Step, StepAnswer, Working } from '../types'
import { eSub, exprDegree, normalize, varsOf, type Expr, type Term } from '../../pure/mono'
import { bgcd, rat, rAdd, rCmp, rDiv, rIsZero, rMul, type Rat } from '../../pure/rat'
import {
  algEq,
  algRat,
  coefficientOf,
  compareAlgRoots,
  plainOfAlg,
  polyRootsHold,
  quadraticRootsOf,
  rationalRootsOf,
  sameState,
  texOfAlg,
  type G2Alg
} from '../check-adapter'
import { clearDenominators, equationStep, expandAndCollect, readEquation, sidesOf, type Sides } from './equation'
import { factorTex, joinTex, monosOf } from './stepText'
import { finishStep } from '../sentences'
import { noWorking } from './quadratic'

const CUBIC_QUARTIC_ID = 'polynomial.cubicQuartic'
const METHOD_NAME = 'Factorising'

interface CubicQuartic {
  v: string
  /** Original equation difference (LHS - RHS) as typed, for checking final roots against the original equation. */
  origDiff: Expr
  /** Normalised primitive polynomial (degree 3 or 4) with whole-number coefficients and positive leading coefficient. */
  expr: Expr
  /** Equation text after normalising steps, e.g. "x^3 - 6x^2 + 11x - 6 = 0". */
  text: string
  /** Normalising steps before factoring. */
  steps: Step[]
  /** Equation as typed, after stringify. */
  start: string
  domain: Domain
  /** Rational roots peeled off to reduce the polynomial to a quadratic (1 for cubic, 2 for quartic). */
  linearRoots: Rat[]
  /** The remaining primitive quadratic with positive leading coefficient. */
  quadExpr: Expr
  a: bigint
  b: bigint
  c: bigint
}

function absBig(n: bigint): bigint {
  return n < 0n ? -n : n
}

/** The coefficient of power p of v as a whole number, or null when it is not an integer. */
function wholeCoeff(e: Expr, v: string, p: number): bigint | null {
  const c = coefficientOf(e, v, p)
  return c.d === 1n ? c.n : null
}

/** Divide every term of an expression by a non-zero whole number. */
function divideExpr(e: Expr, k: bigint): Expr {
  return normalize(e.map((t) => ({ c: rDiv(t.c, rat(k)), v: { ...t.v } })))
}

/**
 * The move that divides out the common factor d of every coefficient (d may be negative).
 * Note: 'leading-positive' purpose in check-adapter is specific to quadratics (degree 2),
 * so for degree 3 and 4 we use plain multiply-both / divide-both when negative, and
 * 'common-factor' when dividing by a positive common factor >= 2.
 */
function polyFactorOp(divisor: bigint): EquationOp {
  if (divisor === -1n) return { kind: 'multiply-both', k: '-1' }
  if (divisor < 0n) return { kind: 'divide-both', k: String(divisor) }
  return { kind: 'divide-both', k: String(divisor), purpose: 'common-factor' }
}

/**
 * All rational roots of a polynomial P in v, sorted ascending.
 * Handles a zero constant term by factoring out the lowest power of v before calling rationalRootsOf.
 */
function allRationalRoots(P: Expr, v: string): Rat[] | null {
  if (varsOf(P).some((name) => name !== v)) return null
  const deg = exprDegree(P)
  if (deg < 1) return []
  const hasZero = rIsZero(coefficientOf(P, v, 0))
  let shifted = P
  if (hasZero) {
    let minP = deg
    for (const t of P) {
      if (!rIsZero(t.c)) {
        const p = t.v[v] ?? 0
        if (p < minP) minP = p
      }
    }
    shifted = normalize(
      P.map((t) => {
        const p = (t.v[v] ?? 0) - minP
        return { c: t.c, v: p === 0 ? {} : { [v]: p } }
      })
    )
  }
  const nonZero = exprDegree(shifted) >= 1 ? rationalRootsOf(shifted, v) : []
  if (nonZero === null) return null
  const all = hasZero ? [rat(0n), ...nonZero] : [...nonZero]
  return all.sort(rCmp)
}

/**
 * Synthetic division of a primitive integer-coefficient polynomial P(v) by the primitive linear factor
 * (d·v - n) corresponding to rational root r = n/d. Returns the integer-coefficient quotient Q(v), or null.
 */
function divideByLinearFactor(P: Expr, v: string, r: Rat): Expr | null {
  const deg = exprDegree(P)
  if (deg < 1) return null
  const a: Rat[] = []
  for (let k = 0; k <= deg; k++) a.push(coefficientOf(P, v, k))
  const q: Rat[] = new Array<Rat>(deg).fill(rat(0n))
  q[deg - 1] = a[deg]
  for (let k = deg - 1; k >= 1; k--) {
    q[k - 1] = rAdd(a[k], rMul(r, q[k]))
  }
  const rem = rAdd(a[0], rMul(r, q[0]))
  if (!rIsZero(rem)) return null
  const terms: Term[] = []
  for (let k = deg - 1; k >= 0; k--) {
    const c = rDiv(q[k], rat(r.d))
    if (c.d !== 1n) return null
    if (!rIsZero(c)) terms.push({ c, v: k === 0 ? {} : { [v]: k } })
  }
  return normalize(terms)
}

let lastCacheKey = ''
let lastCacheVal: CubicQuartic | null = null

/** Read and normalise a degree-3 or degree-4 equation and peel off rational roots down to a quadratic. */
function cubicQuarticOf(problem: Problem): CubicQuartic | null {
  if (problem.job !== 'solve' && problem.job !== 'equation') return null
  const key = `${problem.job}|${String(problem.input)}|${problem.variable ?? ''}|${problem.domain ?? 'real'}`
  if (key === lastCacheKey) return lastCacheVal

  const r = readEquation(problem)
  if (!r) {
    lastCacheKey = key
    lastCacheVal = null
    return null
  }
  const v = r.v
  const origDiff = eSub(r.left.collected, r.right.collected)
  const initDeg = exprDegree(origDiff)
  if (initDeg !== 3 && initDeg !== 4) {
    lastCacheKey = key
    lastCacheVal = null
    return null
  }

  const steps: Step[] = []
  let cur: Sides = expandAndCollect(r, steps)

  if (cur.rhs.length > 0) {
    const next = sidesOf(eSub(cur.lhs, cur.rhs), [], v)
    steps.push(equationStep(cur.text, next.text, { kind: 'move-to-left' }, v))
    cur = next
  }

  cur = clearDenominators(cur, v, steps)

  const expr = cur.lhs
  const deg = exprDegree(expr)
  if (deg !== 3 && deg !== 4) {
    lastCacheKey = key
    lastCacheVal = null
    return null
  }
  if (expr.some((t) => Object.keys(t.v).some((name) => name !== v))) {
    lastCacheKey = key
    lastCacheVal = null
    return null
  }

  const rawCoeffs: bigint[] = []
  for (let k = deg; k >= 0; k--) {
    const c = wholeCoeff(expr, v, k)
    if (c === null) {
      lastCacheKey = key
      lastCacheVal = null
      return null
    }
    rawCoeffs.push(c)
  }
  const lead0 = rawCoeffs[0]
  if (lead0 === 0n) {
    lastCacheKey = key
    lastCacheVal = null
    return null
  }

  const g = rawCoeffs.reduce((acc, c) => bgcd(acc, absBig(c)), 0n)
  const divisor = lead0 < 0n ? -g : g
  let finalExpr = expr
  if (divisor !== 1n) {
    const next = sidesOf(divideExpr(expr, divisor), [], v)
    steps.push(equationStep(cur.text, next.text, polyFactorOp(divisor), v))
    cur = next
    finalExpr = next.lhs
  }

  // Peel off 1 rational root (if cubic) or 2 rational roots (if quartic) to reach a quadratic.
  const linearRoots: Rat[] = []
  let remPoly = finalExpr
  const needed = deg - 2
  for (let stepIdx = 0; stepIdx < needed; stepIdx++) {
    const roots = allRationalRoots(remPoly, v)
    if (!roots || roots.length === 0) {
      lastCacheKey = key
      lastCacheVal = null
      return null
    }
    const chosen = roots[0]
    const nextPoly = divideByLinearFactor(remPoly, v, chosen)
    if (!nextPoly) {
      lastCacheKey = key
      lastCacheVal = null
      return null
    }
    linearRoots.push(chosen)
    remPoly = nextPoly
  }

  if (exprDegree(remPoly) !== 2) {
    lastCacheKey = key
    lastCacheVal = null
    return null
  }
  const a = wholeCoeff(remPoly, v, 2)
  const b = wholeCoeff(remPoly, v, 1)
  const c = wholeCoeff(remPoly, v, 0)
  if (a === null || b === null || c === null || a <= 0n) {
    lastCacheKey = key
    lastCacheVal = null
    return null
  }

  const result: CubicQuartic = {
    v,
    origDiff,
    expr: finalExpr,
    text: cur.text,
    steps,
    start: r.start,
    domain: problem.domain ?? 'real',
    linearRoots,
    quadExpr: remPoly,
    a,
    b,
    c
  }
  lastCacheKey = key
  lastCacheVal = result
  return result
}

function solveCubicQuartic(
  problem: Problem,
  router: { solve: (p: Problem, options?: RouterOptions) => Working }
): Working {
  const cq = cubicQuarticOf(problem)
  if (!cq) return noWorking()
  const { v, linearRoots, quadExpr, a, b, c, domain } = cq

  const linearFactorTexts = linearRoots.map((r) => factorTex(r.d, r.n, v))
  const qTex = joinTex(monosOf(quadExpr, v), v)

  let factoredTex: string
  if (linearFactorTexts.length === 1) {
    factoredTex = `(${linearFactorTexts[0]})(${qTex})`
  } else if (linearFactorTexts[0] === linearFactorTexts[1]) {
    factoredTex = `(${linearFactorTexts[0]})^2(${qTex})`
  } else {
    factoredTex = `(${linearFactorTexts[0]})(${linearFactorTexts[1]})(${qTex})`
  }

  const steps: Step[] = [...cq.steps]
  steps.push(equationStep(cq.text, `${factoredTex} = 0`, { kind: 'factorise' }, v))

  // Collect all roots in the problem's domain with their exact multiplicities.
  const rawRoots: Array<{ root: G2Alg; mult: number }> = []
  for (const r of linearRoots) {
    rawRoots.push({ root: algRat(r), mult: 1 })
  }

  const disc = b * b - 4n * a * c
  if (disc >= 0n || domain === 'complex') {
    const qRoots = quadraticRootsOf(a, b, c)
    if (!qRoots) return noWorking()
    if (disc === 0n) {
      rawRoots.push({ root: qRoots[0], mult: 2 })
    } else {
      rawRoots.push({ root: qRoots[0], mult: 1 })
      rawRoots.push({ root: qRoots[1], mult: 1 })
    }
  }

  // Merge repeated roots and sort ascending (real roots first, then complex).
  const merged: Array<{ root: G2Alg; mult: number }> = []
  for (const item of rawRoots) {
    const existing = merged.find((m) => algEq(m.root, item.root))
    if (existing) existing.mult += item.mult
    else merged.push({ ...item })
  }
  merged.sort((x, y) => compareAlgRoots(x.root, y.root))

  const cases = [...linearFactorTexts.map((f) => `${f} = 0`), `${qTex} = 0`]
  const splitAfter = merged.map((m) => `${v} = ${texOfAlg(m.root)}`).join(' \\text{ or } ')
  const solutions = merged.map((m) => ({ value: plainOfAlg(m.root), multiplicity: m.mult }))

  steps.push(
    finishStep({
      kind: 'CaseSplitComplete',
      before: `${factoredTex} = 0`,
      after: splitAfter,
      sentence: '',
      data: {
        form: 'zero-product',
        c: '1',
        cases,
        variable: v,
        solutions,
        domain
      }
    })
  )

  // Solve each distinct factor equation through the router (chaining linear and quadratic methods).
  const distinctCases = cases.filter((text, i) => cases.findIndex((other) => sameState(other, text)) === i)
  const subWorkings: Working[] = []
  for (const caseInput of distinctCases) {
    const sub = router.solve(
      {
        job: 'solve',
        input: caseInput,
        variable: v,
        domain
      },
      { includeAlternatives: false }
    )
    if (sub.noWorking || sub.steps.length === 0) return noWorking()
    subWorkings.push(sub)
  }

  // Final check: verify every root satisfies the ORIGINAL equation as typed.
  const distinctRoots = merged.map((m) => m.root)
  const checked =
    polyRootsHold(cq.origDiff, v, distinctRoots) && polyRootsHold(cq.expr, v, distinctRoots) ? 'ok' : 'failed'
  const answers: StepAnswer[] = distinctRoots.map((r) => ({
    label: v,
    tex: texOfAlg(r),
    value: plainOfAlg(r)
  }))

  return {
    title: `Solve ${cq.start}`,
    input: cq.start,
    method: METHOD_NAME,
    steps,
    subWorkings,
    answer: answers,
    checked,
    domain
  }
}

export const cubicQuarticMethod: Method = {
  id: CUBIC_QUARTIC_ID,
  name: METHOD_NAME,
  order: 25,
  isAlternative: false,

  appliesTo(problem: Problem) {
    try {
      const cq = cubicQuarticOf(problem)
      if (!cq) return { applies: false, why: 'Not a cubic or quartic equation reducible by rational roots' }
      return { applies: true }
    } catch {
      return { applies: false, why: 'Could not read the equation' }
    }
  },

  solve(problem: Problem, router): Working {
    return solveCubicQuartic(problem, router)
  }
}

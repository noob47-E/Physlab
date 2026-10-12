// G2: the sound answer checkers. Every answer an algebra engine gives passes one of these before a student sees it.
// Each returns 'equal' only with a proof (exact arithmetic over ℚ, ℚ(√d) and ℚ(i); Sturm's theorem for real roots),
// 'different' with a proof or a clear numeric witness, and 'unknown' otherwise (docs/knowledge/check.md). The domain is
// the real line unless Complex mode says otherwise (docs/knowledge/engine-semantics.md).

import { derivative, type MathNode } from 'mathjs'
import { math } from '../expr'
import type { DomainMode } from '../engine/semantics'
import { findRationalRootDetailed, pDeg, pDivMod, pEq, pEval, pIsZero, pLead, pMul, pTrim, polyFromExpr, type Poly } from '../pure/poly'
import { R0, R1, rDiv, rMul, rNeg, rSign, rSqrt, rSub, rat, type Rat } from '../pure/rat'
import { varExpr, type Expr } from '../pure/mono'
import { algEq, algIsReal, algOrbit, NotInField, orbitPolynomial, type Alg } from './field'
import { fnName, isAtomName, lettersOf, plainVars, readAlg, readExact, readMaths, rfAdd, rfConst, rfDiv, rfMul, rfPow, rfSame, rfValue, rootText, type Atom, type Exact, type RF } from './parse'
import { numericEqual, residualClearlyNonzero } from './numeric'
import { gcdOf, isolateRealRoots, piecePoints, realZeros, squarefree, type ExcludedPoint } from './realroots'
import { NotExact, safely, tick, type Verdict } from './verdict'

export type { Verdict } from './verdict'
export type { ExcludedPoint } from './realroots'

// ---------------------------------------------------------------- exact comparison

/** e with each atom |A| replaced by s·A, the sign it has on the piece being checked. */
function substitute(e: Expr, repl: Map<string, RF>): RF {
  let total = rfConst(R0)
  for (const t of e) {
    let term = rfConst(t.c)
    for (const [name, p] of Object.entries(t.v)) {
      if (p === 0) continue
      const base = repl.get(name) ?? { num: varExpr(name), den: rfConst(R1).den }
      term = rfMul(term, rfPow(base, p))
    }
    total = rfAdd(total, term)
  }
  return total
}
/** rf on a piece, or null when its denominator is 0 all along the piece (|x| − x for x > 0): undefined there. */
function onPiece(rf: RF, repl: Map<string, RF>): RF | null {
  const bottom = substitute(rf.den, repl)
  if (bottom.num.length === 0) return null
  return rfDiv(substitute(rf.num, repl), bottom)
}

/** The one variable of an atom-free univariate expression list, or null when there are more. */
function soleVariable(es: Expr[]): string | null {
  const vs = [...new Set(es.flatMap(plainVars))]
  return vs.length <= 1 ? (vs[0] ?? 'x') : null
}

/**
 * a = b where both are defined, proved exactly. Without atoms it is cross-multiplication in ℚ[x, y, …]. With |…| in one
 * variable, the line is cut at the real zeros of every |…|'s argument (Sturm); on each piece each |A| is ±A, and the
 * two quotients are compared there. Equal on every piece, and continuous where defined, means equal everywhere both are
 * defined. null when atoms come with more than one variable.
 */
function compareExact(a: Exact, b: Exact, atoms: Atom[]): 'equal' | 'different' | null {
  if (atoms.length === 0) return rfSame(a.rf, b.rf) ? 'equal' : 'different'
  const x = soleVariable([a.rf.num, a.rf.den, b.rf.num, b.rf.den, ...atoms.flatMap((t) => [t.arg.num, t.arg.den])])
  if (x === null) return null
  let cuts: Poly = [R1]
  for (const t of atoms) for (const e of [t.arg.num, t.arg.den]) cuts = pMul(cuts, polyFromExpr(e, x).poly)
  for (const point of piecePoints(isolateRealRoots(squarefree(cuts)))) {
    tick()
    const repl = new Map<string, RF>()
    for (const t of atoms) {
      const at = valueAt(t.arg, x, point)
      repl.set(t.name, rSign(at) < 0 ? { num: t.arg.num.map((m) => ({ c: rNeg(m.c), v: m.v })), den: t.arg.den } : t.arg)
    }
    const pa = onPiece(a.rf, repl)
    const pb = onPiece(b.rf, repl)
    if (pa === null && pb === null) continue
    // Defined on a whole interval against undefined there, or two different quotients: different functions.
    if (pa === null || pb === null || !rfSame(pa, pb)) return 'different'
  }
  return 'equal'
}

const valueAt = (rf: RF, x: string, at: Rat): Rat => rDiv(pEval(polyFromExpr(rf.num, x).poly, at), pEval(polyFromExpr(rf.den, x).poly, at))

/**
 * Where either answer is undefined: the real zeros of every denominator met, when each is in one variable. They are
 * found at once, as the zeros of one polynomial (the least common multiple of the denominators' square-free parts), so
 * two zeros are one point only when they are one number: comparing their values as doubles merged two zeros 2⁻⁴⁶² apart.
 */
function excludedOf(es: Exact[]): { excluded: ExcludedPoint[]; complete: boolean } {
  let complete = true
  // A point is a value of the one variable; with several, a zero of b in a/b is not a point.
  if (new Set(es.flatMap((e) => [e.rf.num, e.rf.den, ...e.dens].flatMap(plainVars))).size > 1) return { excluded: [], complete: false }
  let all: Poly = [R1]
  for (const e of es) {
    for (const den of e.dens) {
      tick()
      const vs = [...new Set(den.flatMap((t) => Object.keys(t.v).filter((k) => t.v[k] !== 0)))]
      if (vs.length === 0) continue
      if (vs.length > 1 || isAtomName(vs[0])) {
        complete = false
        continue
      }
      try {
        const s = squarefree(polyFromExpr(den, vs[0]).poly)
        all = pTrim(pMul(all, pDivMod(s, gcdOf(all, s)).q))
      } catch (err) {
        // Too big to find its zeros here (checkSize): the list is then not complete, which the caller is told.
        if (!(err instanceof NotExact)) throw err
        complete = false
      }
    }
  }
  if (pDeg(all) < 1) return { excluded: [], complete }
  try {
    return { excluded: realZeros(all), complete }
  } catch (err) {
    if (!(err instanceof NotExact)) throw err
    return { excluded: [], complete: false }
  }
}

/** The numbers' verdict, which is never 'equal'. */
function byNumbers(a: string | MathNode, b: string | MathNode): Verdict {
  try {
    const na = typeof a === 'string' ? readMaths(a) : a
    const nb = typeof b === 'string' ? readMaths(b) : b
    return numericEqual(na, nb, lettersOf(na, nb)).verdict
  } catch {
    return 'unknown'
  }
}

// ---------------------------------------------------------------- 7. any two expressions

/**
 * Any two answers on the real line: exactly when both are quotients of polynomials (|…| and √(…²) included), otherwise
 * by numbers, which may only show them 'different'.
 */
function expressionEqualRaw(a: string, b: string): Verdict {
  try {
    const atoms: Atom[] = []
    const ea = readExact(a, atoms)
    const eb = readExact(b, atoms)
    const v = compareExact(ea, eb, atoms)
    if (v) return v
  } catch (err) {
    if (!(err instanceof NotExact)) throw err
  }
  return byNumbers(a, b)
}

// ---------------------------------------------------------------- 1. polynomials

/** Equal as polynomials over ℚ in any letters. 'unknown' when either is not a polynomial with rational coefficients. */
function polyEqualRaw(a: string, b: string): Verdict {
  try {
    const ea = readExact(a)
    const eb = readExact(b)
    // A letter in any denominator written, even one that cancels: 1/(1/(x − 1)) is not the polynomial x − 1 (it is
    // undefined at 1).
    for (const e of [ea, eb]) if (e.atoms.length || e.dens.some((d) => plainVars(d).length)) return 'unknown'
    return rfSame(ea.rf, eb.rf) ? 'equal' : 'different'
  } catch (err) {
    if (err instanceof NotExact) return 'unknown'
    throw err
  }
}

// ---------------------------------------------------------------- 2. rational functions

export interface RationalResult {
  verdict: Verdict
  /** The real points where either answer is undefined (x(x − 1)/(x − 1) vs x: {1}). */
  excluded: ExcludedPoint[]
  /** False when some denominator has several letters or a |…|, so its zeros are not listed. */
  excludedComplete: boolean
}

/** Equal as functions wherever both are defined, by cross-multiplying; and where they are not defined. */
function rationalEqualRaw(a: string, b: string): RationalResult {
  try {
    const atoms: Atom[] = []
    const ea = readExact(a, atoms)
    const eb = readExact(b, atoms)
    const verdict = compareExact(ea, eb, atoms)
    const { excluded, complete } = excludedOf([ea, eb])
    if (verdict) return { verdict, excluded, excludedComplete: complete }
    return { verdict: byNumbers(a, b), excluded, excludedComplete: complete }
  } catch (err) {
    if (!(err instanceof NotExact)) throw err
    return { verdict: byNumbers(a, b), excluded: [], excludedComplete: false }
  }
}

// ---------------------------------------------------------------- 3. factorisation

export type Irreducible = boolean | 'unknown'

/** Whether a polynomial in one letter is irreducible over ℚ, where that can be decided cheaply and exactly. */
function irreducibleOverQ(p0: Poly): Irreducible {
  const p = pTrim(p0)
  const deg = pDeg(p)
  if (deg <= 0) return false
  if (deg === 1) return true
  if (deg === 2) {
    const [c, b, a] = p
    const disc = rSub(rMul(b, b), rMul(rat(4n), rMul(a, c)))
    return rSign(disc) < 0 || !rSqrt(disc)
  }
  if (deg === 3) {
    const r = findRationalRootDetailed(p)
    if (r.root) return false
    return r.tooBig ? 'unknown' : true
  }
  return 'unknown'
}

/** The exact rational a written number is ((2), 1/1, 2^3), or null when it holds a letter or is not exact. */
function constantOf(node: MathNode): Rat | null {
  try {
    return rfValue(readExact(node).rf)
  } catch (err) {
    if (err instanceof NotExact) return null
    throw err
  }
}

/**
 * The factors of a product as typed, with a whole-number power counted once ((x + 1)^(2) and 2^3 included); numbers
 * are the content. A sum is one factor; a division is not a factorisation.
 */
function factorsOf(node: MathNode): { factors: MathNode[]; ok: boolean } {
  const factors: MathNode[] = []
  let ok = true
  const walk = (m: MathNode): void => {
    const v = m as unknown as { type: string; op?: string; args?: MathNode[]; content?: MathNode; value?: unknown }
    if (v.type === 'ParenthesisNode') return walk(v.content as MathNode)
    if (v.type === 'OperatorNode' && v.op === '*') return v.args!.forEach(walk)
    if (v.type === 'OperatorNode' && v.op === '-' && v.args?.length === 1) return walk(v.args[0])
    if (v.type === 'ConstantNode') return
    if (v.type === 'OperatorNode' && v.op === '^' && v.args?.length === 2) {
      const k = constantOf(v.args[1])
      if (k && k.d === 1n && k.n >= 1n) return walk(v.args[0])
      ok = false
    }
    if (v.type === 'OperatorNode' && v.op === '/') ok = false
    factors.push(m)
  }
  walk(node)
  return { factors, ok }
}

export interface FactorResult {
  verdict: Verdict
  /** Per factor, in the order written: irreducible over ℚ (true), not (false), or not decided. */
  irreducibleOverQ: Irreducible[]
}

/** factored multiplies out to expr, and every factor is a non-constant polynomial over ℚ. */
function factorCheckRaw(expr: string, factored: string): FactorResult {
  try {
    const same = polyEqual(expr, factored)
    if (same !== 'equal') return { verdict: same, irreducibleOverQ: [] }
    const { factors, ok } = factorsOf(readMaths(factored))
    if (!ok) return { verdict: 'different', irreducibleOverQ: [] }
    const irreducible: Irreducible[] = []
    for (const f of factors) {
      const e = readExact(f)
      if (e.atoms.length || plainVars(e.rf.den).length) return { verdict: 'different', irreducibleOverQ: [] }
      const vs = plainVars(e.rf.num)
      if (vs.length === 0) return { verdict: 'different', irreducibleOverQ: [] }
      if (vs.length > 1) {
        irreducible.push('unknown')
        continue
      }
      const den = e.rf.den[0].c
      irreducible.push(irreducibleOverQ(polyFromExpr(e.rf.num, vs[0]).poly.map((c) => rDiv(c, den))))
    }
    if (!factors.length) return { verdict: 'different', irreducibleOverQ: [] }
    return { verdict: 'equal', irreducibleOverQ: irreducible }
  } catch (err) {
    if (err instanceof NotExact) return { verdict: 'unknown', irreducibleOverQ: [] }
    throw err
  }
}

// ---------------------------------------------------------------- 4. roots of a polynomial

export interface ClaimedRoot {
  value: string
  multiplicity: number
}

/**
 * roots are all the roots of poly (or of the equation lhs = rhs), with the right multiplicities. Real mode: exactly
 * the real roots; Complex mode: all n of them. Exact roots (rational, a + b√d, complex with such parts) are multiplied
 * out exactly, each with its conjugates; the rest of the polynomial must then have no real root (Sturm) or be a
 * constant. A root that is not exact can only be shown wrong, by its residual; then the verdict is 'unknown'.
 */
function polyRootsCheckRaw(poly: string, roots: ClaimedRoot[], domain: DomainMode = 'real'): Verdict {
  let node: MathNode
  try {
    node = readMaths(poly, true)
  } catch {
    return 'unknown'
  }
  if (roots.some((r) => !Number.isInteger(r.multiplicity) || r.multiplicity < 1)) return 'different'
  let p: Poly
  let x: string
  try {
    const e = readExact(node)
    const vs = [...new Set([e.rf.num, e.rf.den, ...e.dens].flatMap(plainVars))]
    if (e.atoms.length || vs.length > 1) return refuteOnly(node, roots)
    x = vs[0] ?? 'x'
    p = solutionPolynomial(e, x)
  } catch (err) {
    if (err instanceof NotExact) return refuteOnly(node, roots)
    throw err
  }
  const n = pDeg(p)
  // 0 = 0 holds wherever it is defined: no list of roots is the answer.
  if (n < 0) return 'unknown'
  // A non-zero constant: no solution at all (1/(1/(x − 1)) = 0, x²/x = 0).
  if (n === 0) return roots.length ? 'different' : 'equal'
  const total = roots.reduce((s, r) => s + r.multiplicity, 0)
  if (total > n) return 'different'
  if (domain === 'complex' && total < n) return 'different'

  // Exact roots, equal ones merged (an engine may list a repeated root twice).
  const exact: { r: Alg; m: number }[] = []
  const inexact: { node: MathNode; m: number }[] = []
  for (const root of roots) {
    tick()
    const text = rootText(root.value, x)
    let r: Alg
    try {
      r = readAlg(text)
    } catch (err) {
      if (!(err instanceof NotInField) && !(err instanceof NotExact)) throw err
      try {
        inexact.push({ node: readMaths(text), m: root.multiplicity })
      } catch {
        return 'unknown'
      }
      continue
    }
    const same = exact.find((x) => algEq(x.r, r))
    if (same) same.m += root.multiplicity
    else exact.push({ r, m: root.multiplicity })
  }
  if (domain === 'real' && exact.some((x) => !algIsReal(x.r))) return 'different'

  // Each root with its conjugates, the same number of times: p has rational coefficients. A conjugate missing is wrong,
  // unless a root that is not exact may be it (√(3 + 2√2) is 1 + √2, beside 1 − √2): then the root must still be a
  // root, its orbit is left out of the product, and the verdict can be no better than 'unknown'.
  let product: Poly = [R1]
  const done: Alg[] = []
  try {
    for (const x of exact) {
      tick()
      if (done.some((d) => algEq(d, x.r))) continue
      const orbit = algOrbit(x.r)
      done.push(...orbit)
      const f = orbitPolynomial(x.r)
      if (orbit.some((z) => exact.find((y) => algEq(y.r, z))?.m !== x.m)) {
        if (!inexact.length || !pIsZero(pDivMod(p, f).r)) return 'different'
        continue
      }
      for (let k = 0; k < x.m; k++) product = pMul(product, f)
    }
  } catch (err) {
    if (err instanceof NotInField) return 'unknown'
    throw err
  }
  const { q: rest, r } = pDivMod(p, product)
  if (!pIsZero(r)) return 'different'

  for (const x of inexact) {
    const s = residualClearlyNonzero(p, x.node)
    if (s === 'yes') return 'different'
    if (s === 'undefined' && domain === 'real') return 'different'
  }
  if (inexact.length) return 'unknown'
  if (domain === 'complex') return pDeg(rest) === 0 ? 'equal' : 'different'
  return isolateRealRoots(rest).length === 0 ? 'equal' : 'different'
}

/**
 * The polynomial whose roots, with their multiplicities, are the equation's solutions: the numerator, with every factor
 * it shares with a denominator written anywhere taken out. A point where any denominator is 0 is not a solution, even
 * when the denominator cancels: 1/(1/(x − 1)) = 0 reads (x − 1)/1 but has no root, and x/(1/(x − 2)) = 0 has only 0.
 */
function solutionPolynomial(e: Exact, x: string): Poly {
  let N = pTrim(polyFromExpr(e.rf.num, x).poly)
  if (pIsZero(N)) return N
  for (const d of [e.rf.den, ...e.dens]) {
    const q = pTrim(polyFromExpr(d, x).poly)
    if (pDeg(q) < 1) continue
    for (;;) {
      tick()
      const g = gcdOf(N, q)
      if (pDeg(g) < 1) break
      N = pTrim(pDivMod(N, g).q)
    }
  }
  return N
}

/** For an equation that is not a polynomial (x = √(x + 2)): a claimed root can be shown wrong, never all of them right. */
function refuteOnly(node: MathNode, roots: ClaimedRoot[]): Verdict {
  const x = lettersOf(node)
  if (x.length !== 1) return 'unknown'
  for (const root of roots) {
    let at: MathNode
    try {
      at = readMaths(rootText(root.value, x[0]))
    } catch {
      return 'unknown'
    }
    const sub = node.transform((m) => ((m as unknown as { type: string; name?: string }).type === 'SymbolNode' && (m as unknown as { name: string }).name === x[0] ? new math.ParenthesisNode(at) : m))
    const v = numericEqual(sub, '0', [])
    if (v.verdict === 'different') return 'different'
  }
  return 'unknown'
}

// ---------------------------------------------------------------- 5. linear systems

export { linearSystemCheck, type LinearAnswer } from './linear'

// ---------------------------------------------------------------- 6. derivatives and 8. integrals

/** PhysLab's spelling to the one mathjs differentiates in (ln is mathjs's log; PhysLab's log is base 10), and back. */
function toMathjsLogs(node: MathNode): MathNode {
  return node.transform((m) => {
    const v = m as unknown as { type: string; args?: MathNode[] }
    if (v.type !== 'FunctionNode') return m
    const name = fnName(v as never)
    const args = (v.args ?? []).map(toMathjsLogs)
    const ln = (a: MathNode): MathNode => new math.FunctionNode(new math.SymbolNode('log'), [a])
    if (name === 'ln' && args.length === 1) return ln(args[0])
    if (name === 'mag' && args.length === 1) return new math.FunctionNode(new math.SymbolNode('abs'), args)
    if (name === 'log' && args.length === 1) return new math.OperatorNode('/', 'divide', [ln(args[0]), ln(new math.ConstantNode(10))])
    if (name === 'log' && args.length === 2) return new math.OperatorNode('/', 'divide', [ln(args[0]), ln(args[1])])
    if (name === 'log10' && args.length === 1) return new math.OperatorNode('/', 'divide', [ln(args[0]), ln(new math.ConstantNode(10))])
    return m
  })
}
function fromMathjsLogs(node: MathNode): MathNode {
  return node.transform((m) => {
    const v = m as unknown as { type: string; args?: MathNode[] }
    if (v.type !== 'FunctionNode' || fnName(v as never) !== 'log') return m
    const args = (v.args ?? []).map(fromMathjsLogs)
    const ln = (a: MathNode): MathNode => new math.FunctionNode(new math.SymbolNode('ln'), [a])
    return args.length === 1 ? ln(args[0]) : new math.OperatorNode('/', 'divide', [ln(args[0]), ln(args[1])])
  })
}

/** claimed is d/dx of f: mathjs differentiates f on its own, then the two are compared exactly, or by numbers. */
function derivativeCheckRaw(f: string, x: string, claimed: string): Verdict {
  let expected: MathNode
  let given: MathNode
  try {
    expected = fromMathjsLogs(derivative(toMathjsLogs(readMaths(f)), x, { simplify: false }))
    given = readMaths(claimed)
  } catch {
    return 'unknown'
  }
  try {
    const atoms: Atom[] = []
    const v = compareExact(readExact(expected, atoms), readExact(given, atoms), atoms)
    if (v) return v
  } catch (err) {
    if (!(err instanceof NotExact)) throw err
  }
  return byNumbers(expected, given)
}

/** F is an antiderivative of f: F′ = f wherever both are defined (a constant of integration vanishes on its own). */
function integralCheckRaw(f: string, x: string, F: string): Verdict {
  return derivativeCheck(F, x, f)
}

// ---------------------------------------------------------------- 9. partial fractions

/** The summands of a sum as typed, each with the sign it is added with. */
function summands(node: MathNode): { term: MathNode; neg: boolean }[] {
  const out: { term: MathNode; neg: boolean }[] = []
  const walk = (m: MathNode, neg: boolean): void => {
    const v = m as unknown as { type: string; op?: string; args?: MathNode[]; content?: MathNode }
    if (v.type === 'ParenthesisNode') return walk(v.content as MathNode, neg)
    if (v.type === 'OperatorNode' && (v.op === '+' || v.op === '-') && v.args?.length === 2) {
      walk(v.args[0], neg)
      return walk(v.args[1], v.op === '-' ? !neg : neg)
    }
    if (v.type === 'OperatorNode' && (v.op === '-' || v.op === '+') && v.args?.length === 1) return walk(v.args[0], v.op === '-' ? !neg : neg)
    out.push({ term: m, neg })
  }
  walk(node, false)
  return out
}

/**
 * decomposition adds up to original, and every term is a polynomial or N/g^k with g irreducible over ℚ and
 * deg N < deg g (the standard form), with one term for each g^k and none of them 0: 1/(x + 1) + 1/(x + 1) adds up to
 * 2/(x + 1) but is not its decomposition.
 */
function partialFractionsCheckRaw(original: string, decomposition: string): Verdict {
  const sum = rationalEqual(original, decomposition)
  if (sum.verdict !== 'equal') return sum.verdict
  try {
    const seen: { g: Poly; k: number; x: string }[] = []
    let polyPart = rfConst(R0)
    let polyTerms = 0
    for (const { term, neg } of summands(readMaths(decomposition))) {
      tick()
      const e = readExact(term)
      if (e.atoms.length) return 'unknown'
      const x = soleVariable([e.rf.num, e.rf.den])
      if (x === null) return 'unknown'
      const num = polyFromExpr(e.rf.num, x).poly
      const den = polyFromExpr(e.rf.den, x).poly
      // A term is written N/(c·gᵏ) once: a fraction inside it (x/(1/(x + 1)), 1/(x + 1)/(x + 1)) hides a point where it
      // is undefined, or is the standard form only after it is worked out.
      const written = e.dens.filter((d) => plainVars(d).length).length
      if (written > 1 || (written === 1 && pDeg(den) < 1)) return 'unknown'
      if (pDeg(den) < 1) {
        polyPart = rfAdd(polyPart, neg ? { num: e.rf.num.map((t) => ({ c: rNeg(t.c), v: t.v })), den: e.rf.den } : e.rf)
        if (e.rf.num.length) polyTerms++
        continue
      }
      if (pIsZero(num)) return 'different'
      const g = squarefree(den)
      const lead = pLead(g)
      const monic = g.map((c) => rDiv(c, lead))
      // den = c·g^k exactly
      let power: Poly = [R1]
      let k = 0
      while (pDeg(power) < pDeg(den)) {
        power = pMul(power, monic)
        k++
      }
      const c = rDiv(pLead(den), pLead(power))
      if (!pEq(den, power.map((v) => rMul(v, c))) || k < 1) return 'different'
      if (pDeg(num) >= pDeg(monic)) return 'different'
      if (seen.some((s) => s.x === x && s.k === k && pEq(s.g, monic))) return 'different'
      seen.push({ g: monic, k, x })
      const irr = irreducibleOverQ(monic)
      if (irr === 'unknown') return 'unknown'
      if (!irr) return 'different'
    }
    // Polynomial terms that are not 0 but add up to 0 (… + x − x) are no part of the standard form; a "+ 0" is harmless.
    if (polyTerms && polyPart.num.length === 0) return 'different'
    return 'equal'
  } catch (err) {
    if (err instanceof NotExact) return 'unknown'
    throw err
  }
}

export { numericEqual } from './numeric'

// Every checker, guarded: an exception is 'unknown', never a crash at the caller.
export const expressionEqual = safely(expressionEqualRaw, (): Verdict => 'unknown')
export const polyEqual = safely(polyEqualRaw, (): Verdict => 'unknown')
export const rationalEqual = safely(rationalEqualRaw, (): RationalResult => ({ verdict: 'unknown', excluded: [], excludedComplete: false }))
export const factorCheck = safely(factorCheckRaw, (): FactorResult => ({ verdict: 'unknown', irreducibleOverQ: [] }))
export const polyRootsCheck = safely(polyRootsCheckRaw, (): Verdict => 'unknown')
export const derivativeCheck = safely(derivativeCheckRaw, (): Verdict => 'unknown')
export const integralCheck = safely(integralCheckRaw, (): Verdict => 'unknown')
export const partialFractionsCheck = safely(partialFractionsCheckRaw, (): Verdict => 'unknown')

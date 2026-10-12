// Exact checks for the external holdout corpus (OpenStax, CC BY 4.0). Each check re-derives the
// answer with exact arithmetic, and a check it cannot make exactly rejects the item with a reason
// rather than passing it. The only tolerance is in the derivative check, and it is a 40-digit
// relative BigNumber comparison, never a float.
import { create, all, isConstantNode, isSymbolNode, isOperatorNode, isParenthesisNode, isFunctionNode } from 'mathjs'
import type { BigNumber, MathNode } from 'mathjs'
import {
  constExpr, varExpr, varsOf, exprDegree, normalize, eAdd, eSub, eMul, eEq, eNeg, ePow,
  type Expr, type Term,
} from '../../../../../src/renderer/src/math/pure/mono'
import { type Rat, R0, R1, rat, rAdd, rSub, rMul, rDiv, rNeg, rEq } from '../../../../../src/renderer/src/math/pure/rat'

export interface ExternalItem {
  id: string
  class: string
  question: string
  answer: string
  source: {
    book: string
    edition: string
    chapter: string
    section: string
    'exercise number': string
    url: string
  }
}

// Parsing: exact reads numbers as plain JS numbers, so a literal is read as the text it was written
// as. numeric reads them as 100-digit BigNumbers for the derivative check only.
const exact = create(all)
const numeric = create(all, { number: 'BigNumber', precision: 100 })

const TEST_POINTS = ['0.37', '1.61', '2.29', '3.13', '4.07'].map((s) => numeric.bignumber(s))
const DERIVATIVE_TOLERANCE = numeric.bignumber('1e-40')

// A name that mathjs itself defines (sqrt, sin, e, pi, i, ...) is never a variable of an item.
function isMathName(name: string): boolean {
  return (exact as unknown as Record<string, unknown>)[name] !== undefined
}

// Rewrites the book's typed form into something mathjs reads: 2(x) and x(...) get an explicit
// product sign, but a function name stays a call.
function clean(s: string): string {
  let q = s.replace(/−/g, '-').replace(/×/g, '*')
  q = q.replace(/([A-Za-z_][A-Za-z0-9_]*|[0-9)])\s*\(/g, (m: string, tok: string) => (isMathName(tok) ? m : `${tok}*(`))
  q = q.replace(/\)\s*([A-Za-z0-9_(])/g, ')*$1')
  q = q.replace(/([0-9])\s*([A-Za-z_])/g, '$1*$2')
  return q
}

function parseClean(s: string): MathNode {
  return exact.parse(clean(s))
}

// A literal must be an exact decimal; an exponent or a rounded double is refused, not guessed.
function constRat(value: unknown): Rat {
  const s = String(value)
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s)
  if (!m) throw new Error(`the number ${s} is not an exact decimal`)
  const frac = m[3] ?? ''
  const n = BigInt(m[2] + frac)
  return rat(m[1] === '-' ? -n : n, 10n ** BigInt(frac.length))
}

function fnName(node: { fn: unknown }): string {
  const f = node.fn as { name?: unknown }
  return typeof f.name === 'string' ? f.name : ''
}

function intExponent(node: MathNode): number {
  let n: MathNode = node
  while (isParenthesisNode(n)) n = n.content
  if (!isConstantNode(n)) throw new Error('the exponent must be a whole number')
  const k = Number(String(n.value))
  if (!Number.isInteger(k) || k < 0) throw new Error('the exponent must be a whole number, not negative')
  return k
}

// ---------------------------------------------------------------- rational functions

interface Frac {
  num: Expr
  den: Expr
}

function toFrac(node: MathNode): Frac {
  if (isConstantNode(node)) return { num: constExpr(constRat(node.value)), den: constExpr(R1) }
  if (isSymbolNode(node)) {
    if (isMathName(node.name)) throw new Error(`${node.name} is a function or constant, not a variable`)
    return { num: varExpr(node.name), den: constExpr(R1) }
  }
  if (isParenthesisNode(node)) return toFrac(node.content)
  if (isFunctionNode(node)) {
    const name = fnName(node)
    if (name === 'unaryMinus') {
      const a = toFrac(node.args[0])
      return { num: eNeg(a.num), den: a.den }
    }
    if (name === 'unaryPlus') return toFrac(node.args[0])
    throw new Error(`${name} is not a polynomial or rational operation`)
  }
  if (isOperatorNode(node)) {
    const [l, r] = node.args
    switch (node.op) {
      case '+': {
        if (node.args.length === 1) return toFrac(l)
        const a = toFrac(l)
        const b = toFrac(r)
        return { num: eAdd(eMul(a.num, b.den), eMul(b.num, a.den)), den: eMul(a.den, b.den) }
      }
      case '-': {
        if (node.args.length === 1) {
          const a = toFrac(l)
          return { num: eNeg(a.num), den: a.den }
        }
        const a = toFrac(l)
        const b = toFrac(r)
        return { num: eSub(eMul(a.num, b.den), eMul(b.num, a.den)), den: eMul(a.den, b.den) }
      }
      case '*': {
        const a = toFrac(l)
        const b = toFrac(r)
        return { num: eMul(a.num, b.num), den: eMul(a.den, b.den) }
      }
      case '/': {
        const a = toFrac(l)
        const b = toFrac(r)
        return { num: eMul(a.num, b.den), den: eMul(a.den, b.num) }
      }
      case '^': {
        const base = toFrac(l)
        const k = intExponent(r)
        return { num: ePow(base.num, k), den: ePow(base.den, k) }
      }
      default:
        throw new Error(`the operator ${node.op} is not supported`)
    }
  }
  throw new Error(`cannot read ${node.toString()}`)
}

function sameRational(q: string, a: string): string | null {
  const qf = toFrac(parseClean(q))
  const af = toFrac(parseClean(a))
  if (qf.den.length === 0 || af.den.length === 0) return 'a denominator is zero'
  return eEq(eMul(qf.num, af.den), eMul(af.num, qf.den)) ? null : 'the two sides are not equal as rational expressions'
}

// ---------------------------------------------------------------- numbers of the form A + B*sqrt(d)

// d is squarefree; d = -1 is the imaginary unit. A rational number has B = 0.
interface Quad {
  A: Rat
  B: Rat
  d: bigint
}

const qRat = (r: Rat): Quad => ({ A: r, B: R0, d: 0n })

function qAdd(x: Quad, y: Quad): Quad {
  if (x.B.n !== 0n && y.B.n !== 0n && x.d !== y.d) throw new Error('sums of different square roots are not supported')
  return { A: rAdd(x.A, y.A), B: rAdd(x.B, y.B), d: x.B.n !== 0n ? x.d : y.d }
}

function qMul(x: Quad, y: Quad): Quad {
  if (x.B.n !== 0n && y.B.n !== 0n && x.d !== y.d) throw new Error('products of different square roots are not supported')
  const d = x.B.n !== 0n ? x.d : y.d
  return {
    A: rAdd(rMul(x.A, y.A), rMul(rMul(x.B, y.B), rat(d))),
    B: rAdd(rMul(x.A, y.B), rMul(x.B, y.A)),
    d,
  }
}

const qNeg = (x: Quad): Quad => ({ A: rNeg(x.A), B: rNeg(x.B), d: x.d })

function qDivRat(x: Quad, y: Quad): Quad {
  if (y.B.n !== 0n) throw new Error('division by a square root is not supported')
  if (y.A.n === 0n) throw new Error('division by zero')
  const inv = rDiv(R1, y.A)
  return { A: rMul(x.A, inv), B: rMul(x.B, inv), d: x.d }
}

function qPow(x: Quad, k: number): Quad {
  let res = qRat(R1)
  for (let i = 0; i < k; i++) res = qMul(res, x)
  return res
}

// Splits m into s*s*t with t squarefree.
function squarefree(m: bigint): [bigint, bigint] {
  let s = 1n
  let t = m
  for (let p = 2n; p * p <= t; p++) {
    while (t % (p * p) === 0n) {
      t /= p * p
      s *= p
    }
  }
  return [s, t]
}

function qSqrt(x: Quad): Quad {
  if (x.B.n !== 0n) throw new Error('a square root of a square root is not supported')
  if (x.A.n === 0n) return qRat(R0)
  const negative = x.A.n < 0n
  const num = negative ? -x.A.n : x.A.n
  const den = x.A.d
  const [s, t] = squarefree(num * den)
  if (negative) {
    if (t !== 1n) throw new Error('the square root of a negative non-square is not supported')
    return { A: R0, B: rat(s, den), d: -1n }
  }
  if (t === 1n) return qRat(rat(s, den))
  return { A: R0, B: rat(s, den), d: t }
}

function evalRoot(n: MathNode): Quad {
  if (isConstantNode(n)) return qRat(constRat(n.value))
  if (isSymbolNode(n)) {
    if (n.name === 'i') return { A: R0, B: R1, d: -1n }
    throw new Error(`${n.name} is not a number`)
  }
  if (isParenthesisNode(n)) return evalRoot(n.content)
  if (isFunctionNode(n)) {
    const name = fnName(n)
    if (name === 'unaryMinus') return qNeg(evalRoot(n.args[0]))
    if (name === 'unaryPlus') return evalRoot(n.args[0])
    if (name === 'sqrt') return qSqrt(evalRoot(n.args[0]))
    throw new Error(`${name} is not supported in an answer`)
  }
  if (isOperatorNode(n)) {
    const [l, r] = n.args
    if (n.op === '+') return n.args.length === 1 ? evalRoot(l) : qAdd(evalRoot(l), evalRoot(r))
    if (n.op === '-') return n.args.length === 1 ? qNeg(evalRoot(l)) : qAdd(evalRoot(l), qNeg(evalRoot(r)))
    if (n.op === '*') return qMul(evalRoot(l), evalRoot(r))
    if (n.op === '/') return qDivRat(evalRoot(l), evalRoot(r))
    if (n.op === '^') return qPow(evalRoot(l), intExponent(r))
  }
  throw new Error(`cannot read ${n.toString()} in an answer`)
}

function evalAnswerPiece(s: string): Quad {
  return evalRoot(exact.parse(clean(s)))
}

// ---------------------------------------------------------------- polynomial equations

// Turns "x = 1 +- sqrt(2)" into its roots, one per listed value. Nothing is skipped: a piece that
// cannot be read throws, so the item is rejected rather than checked on fewer roots.
function answerRoots(a: string, v: string): Quad[] {
  const body = a.replace(/[{}]/g, '').trim()
  const pieces = body.split(',').map((p) => p.trim()).filter((p) => p.length > 0)
  if (pieces.length === 0) throw new Error('the answer lists no roots')
  const out: Quad[] = []
  for (const piece of pieces) {
    const m = /^([A-Za-z])\s*=\s*(.+)$/.exec(piece)
    let expr = piece
    if (m) {
      if (m[1] !== v) throw new Error(`the answer names ${m[1]}, not ${v}`)
      expr = m[2]
    } else if (piece.includes('=')) {
      throw new Error(`cannot read the answer piece "${piece}"`)
    }
    const pm = expr.split('±').length - 1
    if (pm > 1) throw new Error('more than one +- in one root')
    if (pm === 1) {
      out.push(evalAnswerPiece(expr.replace('±', '+')))
      out.push(evalAnswerPiece(expr.replace('±', '-')))
    } else {
      out.push(evalAnswerPiece(expr))
    }
  }
  return out
}

function linearFactor(v: string, root: Rat): Expr {
  return normalize([
    { c: R1, v: { [v]: 1 } },
    { c: rNeg(root), v: {} },
  ])
}

function quadraticFactor(v: string, b1: Rat, c0: Rat): Expr {
  return normalize([
    { c: R1, v: { [v]: 2 } },
    { c: b1, v: { [v]: 1 } },
    { c: c0, v: {} },
  ])
}

// The monic polynomial whose roots are the listed ones, counted with repeats. A surd root must
// bring its conjugate, so every coefficient comes out rational.
function monicFromRoots(roots: Quad[], v: string): Expr {
  const pool = roots.slice()
  let product = constExpr(R1)
  for (;;) {
    const r = pool.pop()
    if (!r) break
    if (r.B.n === 0n) {
      product = eMul(product, linearFactor(v, r.A))
      continue
    }
    const j = pool.findIndex((s) => s.B.n !== 0n && s.d === r.d && rEq(s.A, r.A) && rEq(s.B, rNeg(r.B)))
    if (j < 0) throw new Error('a root with a square root has no conjugate in the answer')
    pool.splice(j, 1)
    const c0 = rSub(rMul(r.A, r.A), rMul(rMul(r.B, r.B), rat(r.d)))
    product = eMul(product, quadraticFactor(v, rMul(rat(-2n), r.A), c0))
  }
  return product
}

function equationRoots(q: string, a: string): string | null {
  const sides = q.split('=')
  if (sides.length > 2) throw new Error('more than one "=" in the equation')
  const lf = toFrac(parseClean(sides[0]))
  const rf = toFrac(parseClean(sides.length === 2 ? sides[1] : '0'))
  if (lf.den.length === 0 || rf.den.length === 0) return 'a denominator is zero'
  const poly = eSub(eMul(lf.num, rf.den), eMul(rf.num, lf.den))
  const vars = varsOf(poly)
  if (vars.length !== 1) return `the equation has ${vars.length} variables, expected one`
  const v = vars[0]
  const deg = exprDegree(poly)
  if (deg < 1) return 'the equation has no variable part'
  const roots = answerRoots(a, v)
  if (roots.length !== deg) return `the answer lists ${roots.length} roots (counted with repeats), but the equation has degree ${deg}`
  const monic = monicFromRoots(roots, v)
  const lead = poly.find((t) => t.v[v] === deg)
  if (!lead) throw new Error('no leading term')
  const scaled = normalize(monic.map((t) => ({ c: rMul(t.c, lead.c), v: { ...t.v } })))
  return eEq(poly, scaled) ? null : 'the listed roots do not reproduce the equation (a wrong root or a wrong multiplicity)'
}

// ---------------------------------------------------------------- linear systems

// Exact determinant by Gaussian elimination over the rationals.
function det(M: Rat[][]): Rat {
  const A = M.map((row) => row.slice())
  const n = A.length
  let d = R1
  for (let c = 0; c < n; c++) {
    let p = c
    while (p < n && A[p][c].n === 0n) p++
    if (p === n) return R0
    if (p !== c) {
      const tmp = A[p]
      A[p] = A[c]
      A[c] = tmp
      d = rNeg(d)
    }
    d = rMul(d, A[c][c])
    for (let r = c + 1; r < n; r++) {
      const f = rDiv(A[r][c], A[c][c])
      for (let k = c; k < n; k++) A[r][k] = rSub(A[r][k], rMul(f, A[c][k]))
    }
  }
  return d
}

function evalQuadPoly(poly: Expr, vals: Map<string, Quad>): Quad {
  let res = qRat(R0)
  for (const t of poly) {
    let term = qRat(t.c)
    for (const name of Object.keys(t.v)) {
      const val = vals.get(name)
      if (!val) throw new Error(`no value for ${name}`)
      term = qMul(term, qPow(val, t.v[name]))
    }
    res = qAdd(res, term)
  }
  return res
}

function linearSystem(q: string, a: string): string | null {
  const eqs = q.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
  if (eqs.length < 2) return 'fewer than two equations'
  const polys = eqs.map((eq) => {
    const sides = eq.split('=')
    if (sides.length !== 2) throw new Error(`the equation "${eq}" needs exactly one "="`)
    const lf = toFrac(parseClean(sides[0]))
    const rf = toFrac(parseClean(sides[1]))
    if (lf.den.length === 0 || rf.den.length === 0) throw new Error('a denominator is zero')
    return eSub(eMul(lf.num, rf.den), eMul(rf.num, lf.den))
  })
  if (polys.some((p) => exprDegree(p) > 1)) return 'a system with a term that is not linear'
  const names = [...new Set(polys.flatMap((p) => varsOf(p)))].sort()
  if (names.length !== eqs.length) return `${eqs.length} equations in ${names.length} unknowns: not a square system`
  const M: Rat[][] = polys.map(() => names.map(() => R0))
  const k: Rat[] = polys.map(() => R0)
  polys.forEach((p, i) => {
    for (const t of p) {
      const used = Object.keys(t.v).filter((key) => t.v[key] !== 0)
      if (used.length === 0) k[i] = rAdd(k[i], t.c)
      else {
        const j = names.indexOf(used[0])
        M[i][j] = rAdd(M[i][j], t.c)
      }
    }
  })
  if (det(M).n === 0n) return 'the system does not have a unique solution (determinant zero)'

  const body = a.trim().replace(/^\((.*)\)$/, '$1')
  const parts = body.split(',').map((s) => s.trim())
  const labelled = parts.map((p) => /^[A-Za-z]\s*=/.test(p))
  const vals = new Map<string, Quad>()
  if (labelled.every((x) => x)) {
    for (const part of parts) {
      const m = /^([A-Za-z])\s*=\s*(.+)$/.exec(part)
      if (!m) throw new Error(`cannot read "${part}"`)
      if (!names.includes(m[1])) throw new Error(`the answer names ${m[1]}, which is not an unknown`)
      vals.set(m[1], evalAnswerPiece(m[2]))
    }
  } else {
    if (parts.length !== names.length) throw new Error('the answer does not give one value per unknown')
    names.forEach((name, i) => {
      const part = parts[i].replace(/^[A-Za-z]\s*=\s*/, '')
      vals.set(name, evalAnswerPiece(part))
    })
  }
  if (vals.size !== names.length) return 'the answer does not give a value for every unknown'
  for (const poly of polys) {
    const res = evalQuadPoly(poly, vals)
    if (res.A.n !== 0n || res.B.n !== 0n) return 'the answer does not satisfy every equation'
  }
  return null
}

// ---------------------------------------------------------------- derivatives

function namesOf(node: MathNode): string[] {
  const s = new Set<string>()
  node.traverse((n: MathNode) => {
    if (isSymbolNode(n) && !isMathName(n.name)) s.add(n.name)
  })
  return [...s].sort()
}

// The derivative of a term, exactly: c x^p -> c p x^(p-1).
function dExpr(e: Expr, v: string): Expr {
  const out: Term[] = []
  for (const t of e) {
    const p = t.v[v] ?? 0
    if (p === 0) continue
    out.push({ c: rMul(t.c, rat(p)), v: { ...t.v, [v]: p - 1 } })
  }
  return normalize(out)
}

// A rational function's derivative is exact: (N/D)' = (N'D - N D') / D^2, compared as rational
// functions. Returns undefined when either side is not rational, so the point check applies.
// Once the question is rational the exact path decides: a derivative of a rational function is itself
// rational, so an answer that is not rational is refused, not sampled.
function exactRationalDerivative(q: string, a: string, v: string): string | null | undefined {
  let qf: Frac
  try {
    qf = toFrac(parseClean(q))
  } catch {
    return undefined
  }
  if (qf.den.length === 0) return 'a denominator is zero'
  let af: Frac
  try {
    af = toFrac(parseClean(a))
  } catch (e) {
    return `not verified exactly: the question is rational, so its derivative is rational, and the answer is not (${(e as Error).message})`
  }
  if (af.den.length === 0) return 'a denominator is zero'
  const dNum = eSub(eMul(dExpr(qf.num, v), qf.den), eMul(qf.num, dExpr(qf.den, v)))
  const dDen = eMul(qf.den, qf.den)
  return eEq(eMul(dNum, af.den), eMul(af.num, dDen)) ? null : 'the answer is not the exact derivative of the question'
}

// A symbolic certificate for a non-rational question: the derivative minus the answer must simplify to
// exactly 0. An answer that cannot be shown equal this way is refused, even if it matches the points.
function provenSymbolically(q: string, a: string, v: string): boolean {
  const d = exact.derivative(exact.parse(clean(q)), v)
  const diff = exact.simplify(`(${d.toString()}) - (${clean(a)})`)
  return isConstantNode(diff) && Number(String(diff.value)) === 0
}

// Rational questions are checked exactly (above). Any other function must pass the five fixed points (a
// central difference at 100-digit precision, h = 1e-30) and a symbolic certificate: the derivative minus
// the answer must simplify to exactly 0. The points alone are not enough, since a crafted answer can
// match them. A prime or an "=" in either side is refused, so "s(0)" against "x=0" cannot pass as a
// constant zero.
function derivativeCheck(q: string, a: string): string | null {
  if (/[=']/.test(q) || /[=']/.test(a)) return 'a derivative item may not contain "=" or a prime'
  const qNode = numeric.parse(clean(q))
  const aNode = numeric.parse(clean(a))
  const vars = namesOf(qNode)
  if (vars.length !== 1) return `the function must have exactly one variable, found ${vars.length}`
  const v = vars[0]
  const stray = namesOf(aNode).filter((name) => name !== v)
  if (stray.length > 0) return `the derivative uses ${stray.join(', ')}, not ${v}`
  const exactResult = exactRationalDerivative(q, a, v)
  if (exactResult !== undefined) return exactResult
  const h = numeric.bignumber('1e-30')
  const two = numeric.bignumber(2)
  const at = (node: MathNode, x: BigNumber): BigNumber => numeric.bignumber(node.evaluate({ [v]: x }))
  for (const pt of TEST_POINTS) {
    const central = at(qNode, pt.plus(h)).minus(at(qNode, pt.minus(h))).div(two.times(h))
    const analytic = at(aNode, pt)
    if (!central.isFinite() || !analytic.isFinite()) return `not defined at the test point ${pt.toString()}`
    const scale = analytic.abs().lt(1) ? numeric.bignumber(1) : analytic.abs()
    if (central.minus(analytic).abs().gt(DERIVATIVE_TOLERANCE.times(scale))) {
      return `derivative mismatch at ${pt.toString()}: central difference ${central.toString()}, answer ${analytic.toString()}`
    }
  }
  if (!provenSymbolically(q, a, v)) return 'not verified exactly: the symbolic difference does not simplify to 0'
  return null
}

// ---------------------------------------------------------------- dispatch

// Returns null when the item is verified, otherwise the reason it is rejected. A check that cannot
// be made exactly throws, and the reason says so.
export function verifyItem(item: ExternalItem): string | null {
  if (!item.question || !item.answer) return 'empty question or answer'
  try {
    switch (item.class) {
      case 'expand':
      case 'factor over ℚ':
      case 'rational-expression simplification':
      case 'partial fractions':
        return sameRational(item.question, item.answer)
      case 'polynomial equations':
        return equationRoots(item.question, item.answer)
      case '2x2 and 3x3 linear systems':
        return linearSystem(item.question, item.answer)
      case 'derivatives':
        return derivativeCheck(item.question, item.answer)
      default:
        return `unknown class: ${item.class}`
    }
  } catch (e) {
    return `not verified exactly: ${(e as Error).message}`
  }
}

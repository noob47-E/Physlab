// Factorising an algebraic expression, step by step.
//
// The methods are tried in the order a student is taught to try them, and the working names the
// method it used, because "which method do I reach for" is the actual skill being learnt. Anything
// that comes out is multiplied back together and checked against the original before it is shown.

import {
  R0,
  R1,
  rAbs,
  rAdd,
  rDiv,
  rIsNeg,
  rIsOne,
  rIsZero,
  rMul,
  rNeg,
  rSqrt,
  rSub,
  rat,
  rTex,
  type Rat
} from './rat'
import {
  NotPolynomial,
  commonFactor,
  constExpr,
  divideByTerm,
  eAdd,
  eMul,
  eNeg,
  eSub,
  exprDegree,
  exprTex,
  exprTexBracketed,
  isConstant,
  parseExpr,
  termExpr,
  termTex,
  varsOf,
  type Expr,
  type Term
} from './mono'
import {
  exprFromPoly,
  findRationalRootDetailed,
  pDeg,
  pDivMod,
  pMul,
  pPrimitive,
  pTex,
  pTexBracketed,
  pTrim,
  polyFromExpr,
  type Poly
} from './poly'
import { MAX_TRIAL, TOO_BIG_TO_SEARCH } from './limits'
import { splitBiquadratic } from './cxpoly'
import { Steps, failed, type Working } from './work'

/** The exact k-th root of a fraction, or null. */
function rRoot(a: Rat, k: number): Rat | null {
  if (k === 2) return rSqrt(a)
  const iroot = (v: bigint): bigint | null => {
    const neg = v < 0n
    const abs = neg ? -v : v
    if (abs < 2n) return neg ? -abs : abs
    let lo = 1n
    let hi = abs
    while (lo <= hi) {
      const mid = (lo + hi) / 2n
      const p = mid ** BigInt(k)
      if (p === abs) return neg ? -mid : mid
      if (p < abs) lo = mid + 1n
      else hi = mid - 1n
    }
    return null
  }
  if (k % 2 === 0 && a.n < 0n) return null
  const n = iroot(a.n)
  const d = iroot(a.d)
  return n !== null && d !== null ? rat(n, d) : null
}

/** The exact k-th root of a single term, or null when it is not a perfect k-th power. */
function termRoot(t: Term, k: number): Term | null {
  const c = rRoot(t.c, k)
  if (!c) return null
  const v: Record<string, number> = {}
  for (const name of Object.keys(t.v)) {
    if (t.v[name] % k !== 0) return null
    v[name] = t.v[name] / k
  }
  return { c, v }
}

const isOneTerm = (e: Expr): boolean => e.length === 1

// ---------------------------------------------------------------- the methods
//
// Each returns the pieces it split the expression into, or null when it does not apply. None of
// them recurse: factorAll drives that, so the working stays in a sensible order.

/** a² − b²  =  (a − b)(a + b) */
function diffOfSquares(e: Expr): { parts: Expr[]; a: Term; b: Term } | null {
  if (e.length !== 2) return null
  const [t1, t2] = e
  if (rIsNeg(t1.c) === rIsNeg(t2.c)) return null
  const pos = rIsNeg(t1.c) ? t2 : t1
  const neg = rIsNeg(t1.c) ? t1 : t2
  const a = termRoot(pos, 2)
  const b = termRoot({ c: rAbs(neg.c), v: neg.v }, 2)
  if (!a || !b) return null
  const A = termExpr(a)
  const B = termExpr(b)
  return { parts: [[...A, ...eNeg(B)].filter((t) => !rIsZero(t.c)), [...A, ...B].filter((t) => !rIsZero(t.c))], a, b }
}

/** a³ ± b³  =  (a ± b)(a² ∓ ab + b²) */
function sumOrDiffOfCubes(e: Expr): { parts: Expr[]; a: Term; b: Term; sign: 1 | -1 } | null {
  if (e.length !== 2) return null
  const [t1, t2] = e
  const a = termRoot(t1, 3)
  if (!a) return null
  const sign: 1 | -1 = rIsNeg(t2.c) ? -1 : 1
  const b = termRoot({ c: rAbs(t2.c), v: t2.v }, 3)
  if (!b) return null
  const A = termExpr(a)
  const B = termExpr(b)
  const linear = sign === 1 ? [...A, ...B] : [...A, ...eNeg(B)]
  const aSq = eMul(A, A)
  const ab = eMul(A, B)
  const bSq = eMul(B, B)
  const quad = sign === 1 ? [...aSq, ...eNeg(ab), ...bSq] : [...aSq, ...ab, ...bSq]
  return { parts: [linear.filter((t) => !rIsZero(t.c)), quad.filter((t) => !rIsZero(t.c))], a, b, sign }
}

/** a² ± 2ab + b²  =  (a ± b)² */
function perfectSquare(e: Expr): { part: Expr; a: Term; b: Term; sign: 1 | -1 } | null {
  if (e.length !== 3) return null
  const [t1, tm, t3] = e
  const a = termRoot(t1, 2)
  const b = termRoot({ c: rAbs(t3.c), v: t3.v }, 2)
  if (!a || !b || rIsNeg(t3.c)) return null
  const twoAB = eMul(constExpr(rat(2n)), eMul(termExpr(a), termExpr(b)))
  if (twoAB.length !== 1) return null
  const sign: 1 | -1 = rIsNeg(tm.c) ? -1 : 1
  const want = sign === 1 ? twoAB[0] : { c: rNeg(twoAB[0].c), v: twoAB[0].v }
  if (termTex(want) !== termTex(tm)) return null
  const A = termExpr(a)
  const B = termExpr(b)
  const part = (sign === 1 ? [...A, ...B] : [...A, ...eNeg(B)]).filter((t) => !rIsZero(t.c))
  return { part, a, b, sign }
}

/** Four terms that split into two pairs sharing a bracket. */
function byGrouping(e: Expr): { parts: Expr[]; pairs: [Expr, Expr]; taken: [Term, Term] } | null {
  if (e.length !== 4) return null
  const orders: [number, number, number, number][] = [
    [0, 1, 2, 3],
    [0, 2, 1, 3],
    [0, 3, 1, 2]
  ]
  for (const [i, j, k, l] of orders) {
    const p1 = [e[i], e[j]]
    const p2 = [e[k], e[l]]
    const f1 = commonFactor(p1)
    const f2 = commonFactor(p2)
    if (rIsZero(f1.c) || rIsZero(f2.c)) continue
    const r1 = divideByTerm(p1, f1)
    const r2 = divideByTerm(p2, f2)
    if (!r1 || !r2) continue
    const same = exprTex(r1) === exprTex(r2)
    // Flipping the sign of the second pair is the standard rescue when the brackets differ by −1.
    const flipped = !same && exprTex(r1) === exprTex(eNeg(r2))
    if (!same && !flipped) continue
    if (r1.length < 2) continue
    const g2 = flipped ? { c: rNeg(f2.c), v: f2.v } : f2
    const outer = [...termExpr(f1), ...termExpr(g2)].filter((t) => !rIsZero(t.c))
    return { parts: [r1, outer], pairs: [p1, p2], taken: [f1, g2] }
  }
  return null
}

/**
 * A quadratic in disguise: x⁴ + 5x² + 4 is u² + 5u + 4 once u = x².
 *
 * Three terms whose powers are 2k, k and 0. The quadratic in u has to have rational roots for
 * this to give whole-number brackets; when it does not, completing the square (below) or "Allow
 * i" are the next moves. This used to be missing altogether, so x⁴ + 5x² + 4 was reported as not
 * factorisable — which is the kind of wrong answer that costs a student marks.
 */
function bySubstitution(e: Expr, ctx: Ctx, pending: Expr[]): { parts: Expr[]; name: string; k: number } | null {
  if (e.length !== 3 || varsOf(e).length !== 1) return null
  const { poly, name } = polyFromExpr(e)
  const deg = pDeg(poly)
  if (deg < 4 || deg % 2 !== 0) return null
  const k = deg / 2
  for (let i = 1; i < deg; i++) if (i !== k && !rIsZero(poly[i] ?? rat(0n))) return null
  const [c, b, a] = [poly[0] ?? rat(0n), poly[k] ?? rat(0n), poly[deg]]
  if (rIsZero(b) || rIsZero(c)) return null
  if (a.d !== 1n || b.d !== 1n || c.d !== 1n) return null
  const disc = rSub(rMul(b, b), rMul(rat(4n), rMul(a, c)))
  const root = rSqrt(disc)
  if (!root) return null
  const twoA = rMul(rat(2n), a)
  const roots = [rDiv(rAdd(rNeg(b), root), twoA), rDiv(rSub(rNeg(b), root), twoA)]
  // A root p/q means (q·u − p) is a factor, which keeps every coefficient whole.
  const uFactors: Poly[] = roots.map((r) => pTrim([rNeg(rat(r.n)), rat(r.d)]))
  const content = rDiv(a, rat(roots[0].d * roots[1].d))
  const inU = pTrim([c, b, a])

  ctx.s.add(
    `This is a quadratic in disguise: the powers are ${deg}, ${k} and 0. Write u = ${name}^${k} and it becomes a quadratic in u.`,
    `u = ${name}^{${k}} \\;\\Rightarrow\\; ${pTex(inU, 'u')}`,
    `\\text{substitute } u = ${name}^{${k}}`
  )
  const uBrackets = `${rIsOne(content) ? '' : rTex(content)}${uFactors.map((f) => pTexBracketed(f, 'u')).join('')}`
  ctx.s.add(
    `Factorise the quadratic in u. Its roots are u = ${rTex(roots[0])} and u = ${rTex(roots[1])}.`,
    `${pTex(inU, 'u')} = ${uBrackets}`,
    'a u^2 + b u + c = a(u - u_1)(u - u_2)'
  )
  const parts = uFactors.map((f) => exprFromPoly([f[0], ...new Array(k - 1).fill(rat(0n)), f[1]], name))
  if (!rIsOne(content)) parts.unshift(constExpr(content))
  ctx.s.add(`Put ${name}^${k} back in place of u.`, snapshot(ctx, [...pending, ...parts]))
  return { parts, name, k }
}

/**
 * x⁴ + 4 has no rational roots and is not a difference of squares as it stands — but
 * x⁴ + 4 = (x² + 2)² − (2x)², which is. Adding and taking away the middle term is the move, and
 * it is the one students are shown for exactly this expression.
 */
function byCompletingSquare(e: Expr, ctx: Ctx, pending: Expr[]): Expr[] | null {
  if (varsOf(e).length !== 1 || e.length < 2 || e.length > 3) return null
  const { poly, name } = polyFromExpr(e)
  if (pDeg(poly) !== 4) return null
  const split = splitBiquadratic(poly)
  // A surd in the middle term (x⁴ + 1 needs √2·x) is a job for "Allow i", not for whole numbers.
  if (!split || !rIsZero(split.k.r)) return null
  const { alpha, s } = split
  const kx: Term = { c: split.k.q, v: { [name]: 1 } }
  const inner = exprFromPoly([s, rat(0n), alpha], name)
  const taken: Term = { c: rMul(kx.c, kx.c), v: { [name]: 2 } }
  ctx.s.add(
    `Complete the square: ${exprTex(inner)} squared is ${exprTex(eMul(inner, inner))}, which is this expression with ${termTex(taken)} added on. So take ${termTex(taken)} away again.`,
    `${exprTex(e)} = \\left(${exprTex(inner)}\\right)^2 - \\left(${termTex(kx)}\\right)^2`,
    '\\text{add and take away the middle term}'
  )
  const parts = [eSub(inner, termExpr(kx)), eAdd(inner, termExpr(kx))]
  ctx.s.add('Now it is a difference of two squares, so it splits into the difference and the sum.', snapshot(ctx, [...pending, ...parts]), 'a^2 - b^2 = (a-b)(a+b)')
  return parts
}

// ---------------------------------------------------------------- driver

interface Ctx {
  s: Steps
  /** Every factor found so far, so each step can redraw the whole expression. */
  done: Expr[]
  /** Set when a search gave up early, so "no factors" is never claimed on incomplete evidence. */
  tooBig?: boolean
}

/** A lone factor of exactly -1 is written as the minus sign it is, not as "-1(...)". */
const isMinusOne = (e: Expr): boolean => e.length === 1 && isConstant(e) && rIsNeg(e[0].c) && rIsOne(rAbs(e[0].c))

const factorTex = (p: Expr): string => (isOneTerm(p) && isConstant(p) ? exprTex(p) : exprTexBracketed(p))

const productTex = (parts: Expr[]): string => {
  // One piece on its own is just the expression; brackets only mean something beside another factor.
  if (parts.length === 1) return exprTex(parts[0])
  const lead = isMinusOne(parts[0]) ? '-' : ''
  const rest = (lead ? parts.slice(1) : parts).map(factorTex).join('')
  return `${lead}${rest}`
}

/** Show the expression as it now stands: the finished factors plus whatever is still being worked on. */
function snapshot(ctx: Ctx, pending: Expr[]): string {
  return productTex([...ctx.done, ...pending])
}

function splitMiddleTerm(e: Expr, ctx: Ctx, pending: Expr[]): Expr[] | null {
  const vars = varsOf(e)
  if (vars.length !== 1 || e.length < 2) return null
  const { poly, name } = polyFromExpr(e)
  if (pDeg(poly) !== 2) return null
  const { content, prim } = pPrimitive(poly)
  if (!rIsOne(content)) return null // the numeric part is taken out earlier, by common factor
  const [c, b, a] = [prim[0] ?? rat(0n), prim[1] ?? rat(0n), prim[2]]
  if (c.d !== 1n || b.d !== 1n || a.d !== 1n) return null
  const ac = a.n * c.n
  const bb = b.n

  // Two numbers that multiply to a·c and add to b. Bounded, because this runs on the window's
  // own thread and a huge a·c would otherwise hang the app rather than merely take a while.
  let found: [bigint, bigint] | null = null
  const abs = ac < 0n ? -ac : ac
  let steps = 0
  for (let d = 1n; d * d <= abs && !found; d++) {
    if (steps++ > MAX_TRIAL) {
      ctx.tooBig = true
      break
    }
    if (abs % d !== 0n) continue
    for (const p of [d, -d]) {
      const q = ac / p
      if (p * q === ac && p + q === bb) {
        found = [p, q]
        break
      }
    }
  }
  if (!found) return null
  // The smaller one first reads more naturally in the split.
  const [p, q] = found[0] <= found[1] ? found : [found[1], found[0]]

  const sign = (v: bigint): string => (v < 0n ? '-' : '+')
  const mag = (v: bigint): string => String(v < 0n ? -v : v)
  // A coefficient of one is written by not writing it: "x + 4x", never "1x + 4x".
  const coef = (v: bigint): string => (v === 1n || v === -1n ? '' : mag(v))
  const signedTerm = (v: bigint): string => `${v < 0n ? '-' : ''}${coef(v)}${name}`

  ctx.s.add(
    `Multiply the first and last coefficients: ${a.n} × ${c.n} = ${ac}. Now find two numbers that multiply to ${ac} and add to ${bb}.`,
    `${p} \\times ${q} = ${ac} \\quad\\text{and}\\quad ${p} ${sign(q)} ${mag(q)} = ${bb}`,
    'ax^2+bx+c:\\ \\text{split } b \\text{ using } ac'
  )
  const split: Expr = pTrim([c, rat(0n), a]).length
    ? [
        { c: a, v: { [name]: 2 } },
        { c: rat(p), v: { [name]: 1 } },
        { c: rat(q), v: { [name]: 1 } },
        { c, v: {} }
      ]
    : []
  ctx.s.add(
    `Write the middle term as ${signedTerm(p)} ${sign(q)} ${coef(q)}${name}.`,
    `${snapshot(ctx, [...pending, split as Expr])}`,
    undefined,
    'Nothing has changed in value — the middle term has only been written as two pieces.'
  )

  const pair1: Expr = [split[0], split[1]]
  const pair2: Expr = [split[2], split[3]]
  const f1 = commonFactor(pair1)
  const f2 = commonFactor(pair2)
  const r1 = divideByTerm(pair1, f1)
  const r2raw = divideByTerm(pair2, f2)
  if (!r1 || !r2raw) return null
  let g2 = f2
  let r2 = r2raw
  if (exprTex(r1) !== exprTex(r2)) {
    g2 = { c: rNeg(f2.c), v: f2.v }
    const flipped = divideByTerm(pair2, g2)
    if (!flipped || exprTex(r1) !== exprTex(flipped)) return null
    r2 = flipped
  }
  ctx.s.add(
    'Group the four terms in pairs and take the common factor out of each pair.',
    `${termTex(f1)}${exprTexBracketed(r1)} ${rIsNeg(g2.c) ? '-' : '+'} ${termTex({ c: rAbs(g2.c), v: g2.v })}${exprTexBracketed(r2)}`,
    '\\text{grouping}'
  )
  const outer = [...termExpr(f1), ...termExpr(g2)].filter((t) => !rIsZero(t.c))
  ctx.s.add(
    `Both pieces now share ${exprTexBracketed(r1).replace(/\\left|\\right/g, '')}, so take that out as well.`,
    `${exprTexBracketed(r1)}${exprTexBracketed(outer)}`,
    '\\text{common bracket}'
  )
  return [r1, outer]
}

/** Peel one rational root off a polynomial of degree 3 or more. */
function peelRoot(e: Expr, ctx: Ctx): Expr[] | null {
  const vars = varsOf(e)
  if (vars.length !== 1) return null
  const { poly, name } = polyFromExpr(e)
  if (pDeg(poly) < 3) return null
  // The content has to be carried, not dropped: pPrimitive takes any numeric factor (including a
  // sign) out of the polynomial, and a quotient built from the primitive alone multiplies back to
  // the wrong thing. In practice commonFactor has already removed it, so this is belt and braces.
  const { content, prim } = pPrimitive(poly)
  const { root, tooBig } = findRationalRootDetailed(prim)
  if (tooBig) ctx.tooBig = true
  if (!root) return null
  // A root p/q means (qx − p) is a factor; that keeps the coefficients whole.
  const divisor: Poly = pTrim([rNeg(rat(root.n)), rat(root.d)])
  const { q, r } = pDivMod(prim, divisor)
  if (!pTrim(r).length) {
    const dExpr = exprFromPoly(divisor, name)
    const qExpr = exprFromPoly(q, name)
    ctx.s.add(
      `Try small values: ${name} = ${rTex(root)} makes the expression zero, so ${exprTexBracketed(dExpr)} is a factor.`,
      `f\\left(${rTex(root)}\\right) = 0 \\;\\Rightarrow\\; ${exprTexBracketed(dExpr)} \\text{ divides it}`,
      '\\text{factor theorem: } f(a)=0 \\Leftrightarrow (x-a)\\mid f'
    )
    ctx.s.add(
      'Divide to find what is left.',
      `${exprTexBracketed(exprFromPoly(prim, name))} \\div ${exprTexBracketed(dExpr)} = ${exprTexBracketed(qExpr)}`,
      '\\text{long division}'
    )
    return [dExpr, rIsOne(content) ? qExpr : eMul(constExpr(content), qExpr)]
  }
  return null
}

/** Factor one expression as far as it goes, pushing the working as it does. */
function factorAll(e: Expr, ctx: Ctx, pending: Expr[], depth = 0): Expr[] {
  if (depth > 12 || e.length === 0) return [e]
  if (isConstant(e) || exprDegree(e) === 0) return [e]

  // 1. Always take the common factor out first — including a bare −1.
  //
  // A bare minus used to be skipped here as "not worth a step". That quietly broke every
  // expression with a negative highest power: the minus stayed in, pPrimitive then reported a
  // content of −1, and both splitMiddleTerm and peelRoot bailed out, so −x² + 5x − 6 was reported
  // as not factorisable at all when it is plainly −(x − 2)(x − 3).
  const cf = commonFactor(e)
  const trivial = rIsOne(cf.c) && Object.keys(cf.v).length === 0
  if (!trivial) {
    const rest = divideByTerm(e, cf)
    if (rest && rest.length > 0) {
      const bareMinus = rIsNeg(cf.c) && rIsOne(rAbs(cf.c)) && Object.keys(cf.v).length === 0
      ctx.s.add(
        bareMinus
          ? 'The highest power is negative, so take −1 out at the front and factorise what is left.'
          : `Every term has ${termTex(cf)} in it, so take it out at the front.`,
        `${snapshot(ctx, [...pending, termExpr(cf), rest])}`,
        bareMinus ? '-1 \\text{ is a common factor too}' : '\\text{HCF of the terms}'
      )
      ctx.done.push(termExpr(cf))
      return [termExpr(cf), ...factorAll(rest, ctx, pending, depth + 1)]
    }
  }

  if (isOneTerm(e)) return [e]

  // 2. Two terms: squares, then cubes.
  const dos = diffOfSquares(e)
  if (dos) {
    ctx.s.add(
      `Two terms, and it is one square take away another: ${termTex(dos.a)} squared minus ${termTex(dos.b)} squared.`,
      `${exprTex(e)} = \\left(${termTex(dos.a)}\\right)^2 - \\left(${termTex(dos.b)}\\right)^2`,
      'a^2 - b^2 = (a-b)(a+b)'
    )
    ctx.s.add('So it splits into the difference and the sum.', snapshot(ctx, [...pending, ...dos.parts]))
    return dos.parts.flatMap((p) => factorAll(p, ctx, pending, depth + 1))
  }

  const cubes = sumOrDiffOfCubes(e)
  if (cubes) {
    const op = cubes.sign === 1 ? '+' : '-'
    const inner = cubes.sign === 1 ? '-' : '+'
    ctx.s.add(
      `Two terms, and both are perfect cubes: ${termTex(cubes.a)} cubed ${cubes.sign === 1 ? 'plus' : 'minus'} ${termTex(cubes.b)} cubed.`,
      `${exprTex(e)} = \\left(${termTex(cubes.a)}\\right)^3 ${op} \\left(${termTex(cubes.b)}\\right)^3`,
      `a^3 ${op} b^3 = (a ${op} b)(a^2 ${inner} ab + b^2)`
    )
    ctx.s.add('Apply the formula.', snapshot(ctx, [...pending, ...cubes.parts]))
    return cubes.parts.flatMap((p) => factorAll(p, ctx, pending, depth + 1))
  }

  // 3. Three terms: perfect square, then splitting the middle term.
  const sq = perfectSquare(e)
  if (sq) {
    ctx.s.add(
      `The first and last terms are squares and the middle term is exactly twice ${termTex(sq.a)} × ${termTex(sq.b)}, so this is a perfect square.`,
      `${exprTex(e)} = \\left(${exprTex(sq.part)}\\right)^2`,
      `a^2 ${sq.sign === 1 ? '+' : '-'} 2ab + b^2 = (a ${sq.sign === 1 ? '+' : '-'} b)^2`
    )
    const inner = factorAll(sq.part, ctx, pending, depth + 1)
    return [...inner, ...inner]
  }

  const split = splitMiddleTerm(e, ctx, pending)
  if (split) return split.flatMap((p) => factorAll(p, ctx, pending, depth + 1))

  // 3b. Even powers only: a quadratic in u = x^k, or a square with the middle term completed.
  const sub = bySubstitution(e, ctx, pending)
  if (sub) return sub.parts.flatMap((p) => factorAll(p, ctx, pending, depth + 1))

  const completed = byCompletingSquare(e, ctx, pending)
  if (completed) return completed.flatMap((p) => factorAll(p, ctx, pending, depth + 1))

  // 4. Four terms: grouping.
  const grp = byGrouping(e)
  if (grp) {
    ctx.s.add(
      'Four terms, so group them in pairs and take the common factor out of each pair.',
      `${termTex(grp.taken[0])}${exprTexBracketed(grp.parts[0])} ${rIsNeg(grp.taken[1].c) ? '-' : '+'} ${termTex({ c: rAbs(grp.taken[1].c), v: grp.taken[1].v })}${exprTexBracketed(grp.parts[0])}`,
      '\\text{grouping}'
    )
    ctx.s.add('Both pairs left the same bracket, so take it out.', snapshot(ctx, [...pending, ...grp.parts]))
    return grp.parts.flatMap((p) => factorAll(p, ctx, pending, depth + 1))
  }

  // 5. Degree 3 and up in one letter: find a root and divide.
  const peeled = peelRoot(e, ctx)
  if (peeled) return peeled.flatMap((p) => factorAll(p, ctx, pending, depth + 1))

  return [e]
}

// ---------------------------------------------------------------- entry point

export interface FactorOutcome {
  working: Working
  factors: Expr[]
}

export function factorise(src: string): FactorOutcome {
  const title = 'Factorise'
  let e: Expr
  try {
    e = parseExpr(src)
  } catch (err) {
    const msg = err instanceof NotPolynomial ? err.message : 'I could not read that.'
    return { working: failed(title, src, msg), factors: [] }
  }
  const input = exprTex(e)

  if (e.length === 0) return { working: failed(title, input, 'That comes to zero, so there is nothing to factorise.'), factors: [] }
  if (isConstant(e)) {
    return {
      working: failed(title, input, 'That is just a number. Use "Factorise number" to break it into primes.'),
      factors: []
    }
  }

  const ctx: Ctx = { s: new Steps(), done: [] }
  const expanded = exprTex(e)
  // Only worth a step when there really was a bracket to multiply out. Otherwise it just restates
  // the question back at the student, which reads like the working has already gone wrong.
  if (src.includes('(') && expanded !== src.trim()) {
    ctx.s.add('Multiply everything out first, so the terms can be compared.', expanded, '\\text{expand, then collect like terms}')
  }

  const parts = factorAll(e, ctx, []).filter((p) => p.length > 0)
  const nonTrivial = parts.filter((p) => !(isConstant(p) && p.length === 1 && rIsOne(p[0].c)))

  if (ctx.s.moves.length === 0 || nonTrivial.length < 2) {
    return {
      working: {
        title,
        input,
        moves: ctx.s.moves,
        answers: [{ label: 'Answer', tex: expanded }],
        check: ctx.tooBig
          ? TOO_BIG_TO_SEARCH
          : 'This one does not break into simpler factors with whole numbers.',
        error: undefined,
        offer: leavesIrreducibleQuadratic([e]) ? ALLOW_I : undefined
      },
      factors: [e]
    }
  }

  // Multiply back out. Nothing is shown to a student until it has been checked.
  const remade = nonTrivial.reduce((acc, p) => eMul(acc, p), constExpr(R1))
  const ok = exprTex(remade) === expanded
  const answerTex = groupPowers(nonTrivial)
  // Taking a minus out of something irreducible is the textbook answer, but calling it "factorised"
  // would overclaim: nothing was actually broken down.
  const onlyASign = nonTrivial.length === 2 && nonTrivial.some(isMinusOne)
  const stillWhole = onlyASign ? nonTrivial.find((p) => !isMinusOne(p)) : undefined

  return {
    working: {
      title,
      input,
      method: methodName(ctx.s.moves.map((m) => m.rule ?? '')),
      moves: ctx.s.moves,
      answers: [{ label: 'Answer', tex: answerTex }],
      check: !ok
        ? 'Careful: multiplying back out did not match. Treat this answer with suspicion.'
        : stillWhole
          ? `The most that can be taken out is the minus sign; ${exprTex(stillWhole)} does not break down further.`
          : `Multiplying back out gives ${expanded} — the original.`,
      checked: ok ? 'ok' : 'failed',
      offer: leavesIrreducibleQuadratic(nonTrivial) ? ALLOW_I : undefined
    },
    factors: nonTrivial
  }
}

const ALLOW_I = { job: 'factorComplex', label: 'Allow i', hint: 'Carry on by allowing complex numbers: every quadratic factorises then.' }

/** True when some factor is a quadratic with no real roots — the point where "Allow i" helps. */
function leavesIrreducibleQuadratic(parts: Expr[]): boolean {
  return parts.some((p) => {
    if (varsOf(p).length !== 1) return false
    const { poly } = polyFromExpr(p)
    if (pDeg(poly) !== 2) return false
    const [c, b, a] = [poly[0] ?? R0, poly[1] ?? R0, poly[2]]
    return rIsNeg(rSub(rMul(b, b), rMul(rat(4n), rMul(a, c))))
  })
}

/** Collapse repeated factors into powers: (x+2)(x+2) becomes (x+2)². */
function groupPowers(parts: Expr[]): string {
  const seen: { tex: string; expr: Expr; n: number }[] = []
  for (const p of parts) {
    const t = exprTex(p)
    const hit = seen.find((s) => s.tex === t)
    if (hit) hit.n++
    else seen.push({ tex: t, expr: p, n: 1 })
  }
  // Numbers go in front, brackets after.
  seen.sort((a, b) => Number(isConstant(b.expr)) - Number(isConstant(a.expr)))
  const lead = seen.length > 1 && seen[0].n === 1 && isMinusOne(seen[0].expr) ? '-' : ''
  return (
    lead +
    (lead ? seen.slice(1) : seen)
      .map(({ expr, n }) => {
        const body = isConstant(expr) && expr.length === 1 ? exprTex(expr) : exprTexBracketed(expr)
        return n === 1 ? body : `${body}^{${n}}`
      })
      .join('')
  )
}

function methodName(rules: string[]): string | undefined {
  if (rules.some((r) => r.includes('a^2 - b^2'))) return 'Difference of two squares'
  if (rules.some((r) => r.includes('a^3'))) return 'Sum or difference of cubes'
  if (rules.some((r) => r.includes('2ab'))) return 'Perfect square'
  if (rules.some((r) => r.includes('split } b'))) return 'Splitting the middle term'
  if (rules.some((r) => r.includes('factor theorem'))) return 'Factor theorem and division'
  if (rules.some((r) => r.includes('grouping'))) return 'Grouping'
  if (rules.some((r) => r.includes('HCF'))) return 'Taking out the common factor'
  return undefined
}

export function factoriseWorking(src: string): Working {
  return factorise(src).working
}

/** Factors of an expression without the working — used by HCF/LCM and partial fractions. */
export function factorsOf(e: Expr): Expr[] {
  const ctx: Ctx = { s: new Steps(), done: [] }
  return factorAll(e, ctx, []).filter((p) => p.length > 0)
}

export { pMul }

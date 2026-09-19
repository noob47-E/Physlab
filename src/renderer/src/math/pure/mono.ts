// Algebraic expressions as a sum of monomials: 6x²y − 3xy + 2.
//
// This is the shape every Pure Math step generator works on. Parsing expands everything first, so
// (x+2)(x+3) arrives as x² + 5x + 6 and the working can start from a tidy, ordered expression the
// same way a student would write it out.

import { type MathNode } from 'mathjs'
import { math, preprocess } from '../expr'
import { R0, R1, rAdd, rEq, rFromNumber, rGcd, rIsNeg, rIsOne, rMul, rNeg, rPow, rat, rTex, rAbs, type Rat } from './rat'

/** One term: a coefficient and the powers of each variable. Absent variable = power 0. */
export interface Term {
  c: Rat
  v: Record<string, number>
}

/** A sum of terms, always tidy: like terms combined, zeros dropped, ordered for display. */
export type Expr = Term[]

/** Raised when the input is not something Pure Math can work on, with a sentence for the student. */
export class NotPolynomial extends Error {}

const varKey = (v: Record<string, number>): string =>
  Object.keys(v)
    .filter((k) => v[k] !== 0)
    .sort()
    .map((k) => `${k}^${v[k]}`)
    .join('*')

export const varsOf = (e: Expr): string[] => {
  const s = new Set<string>()
  for (const t of e) for (const k of Object.keys(t.v)) if (t.v[k] !== 0) s.add(k)
  return [...s].sort()
}

export const totalDegree = (t: Term): number => Object.values(t.v).reduce((a, b) => a + b, 0)
export const degreeIn = (e: Expr, name: string): number => e.reduce((m, t) => Math.max(m, t.v[name] ?? 0), 0)
export const exprDegree = (e: Expr): number => e.reduce((m, t) => Math.max(m, totalDegree(t)), 0)
export const isConstant = (e: Expr): boolean => e.every((t) => totalDegree(t) === 0)
export const exprIsZero = (e: Expr): boolean => e.length === 0

/** Combine like terms, drop zeros, and order: highest degree first, then alphabetically. */
export function normalize(terms: Term[]): Expr {
  const byKey = new Map<string, Term>()
  for (const t of terms) {
    const clean: Record<string, number> = {}
    for (const k of Object.keys(t.v)) if (t.v[k] !== 0) clean[k] = t.v[k]
    const key = varKey(clean)
    const hit = byKey.get(key)
    if (hit) hit.c = rAdd(hit.c, t.c)
    else byKey.set(key, { c: t.c, v: clean })
  }
  const out = [...byKey.values()].filter((t) => t.c.n !== 0n)
  out.sort((a, b) => {
    const d = totalDegree(b) - totalDegree(a)
    if (d !== 0) return d
    const av = Object.keys(a.v).sort()
    const bv = Object.keys(b.v).sort()
    for (let i = 0; i < Math.max(av.length, bv.length); i++) {
      const x = av[i] ?? ''
      const y = bv[i] ?? ''
      if (x !== y) return x < y ? -1 : 1
      const pa = a.v[x] ?? 0
      const pb = b.v[y] ?? 0
      if (pa !== pb) return pb - pa
    }
    return 0
  })
  return out
}

export const constExpr = (c: Rat): Expr => normalize([{ c, v: {} }])
export const varExpr = (name: string, power = 1): Expr => normalize([{ c: R1, v: { [name]: power } }])

export const eAdd = (a: Expr, b: Expr): Expr => normalize([...a, ...b])
export const eNeg = (a: Expr): Expr => a.map((t) => ({ c: rNeg(t.c), v: { ...t.v } }))
export const eSub = (a: Expr, b: Expr): Expr => eAdd(a, eNeg(b))
export const eScale = (a: Expr, k: Rat): Expr => normalize(a.map((t) => ({ c: rMul(t.c, k), v: { ...t.v } })))

export function mulTerm(a: Term, b: Term): Term {
  const v: Record<string, number> = { ...a.v }
  for (const k of Object.keys(b.v)) v[k] = (v[k] ?? 0) + b.v[k]
  return { c: rMul(a.c, b.c), v }
}

export function eMul(a: Expr, b: Expr): Expr {
  const out: Term[] = []
  for (const x of a) for (const y of b) out.push(mulTerm(x, y))
  return normalize(out)
}

export function ePow(a: Expr, k: number): Expr {
  if (k < 0) throw new NotPolynomial('A negative power turns this into a fraction, which is not something I can factorise.')
  let out = constExpr(R1)
  for (let i = 0; i < k; i++) out = eMul(out, a)
  return out
}

export const eEq = (a: Expr, b: Expr): boolean => {
  if (a.length !== b.length) return false
  return a.every((t, i) => rEq(t.c, b[i].c) && varKey(t.v) === varKey(b[i].v))
}

/** Divide by a single term. Returns null when it would need a negative power. */
export function divideByTerm(e: Expr, by: Term): Expr | null {
  const out: Term[] = []
  for (const t of e) {
    const v: Record<string, number> = { ...t.v }
    for (const k of Object.keys(by.v)) {
      v[k] = (v[k] ?? 0) - by.v[k]
      if (v[k] < 0) return null
    }
    out.push({ c: rMul(t.c, rPow(by.c, -1)), v })
  }
  return normalize(out)
}

// ---------------------------------------------------------------- display

/** The variable part of a term: x^{2}y. */
export function varTex(v: Record<string, number>): string {
  const keys = Object.keys(v)
    .filter((k) => v[k] !== 0)
    .sort()
  return keys
    .map((k) => {
      const name = k.length > 1 ? `\\${k}` : k
      return v[k] === 1 ? name : `${name}^{${v[k]}}`
    })
    .join('')
}

/** One term on its own, sign included: -3x^{2}. */
export function termTex(t: Term): string {
  const vt = varTex(t.v)
  if (!vt) return rTex(t.c)
  if (rIsOne(t.c)) return vt
  if (rIsOne(rAbs(t.c)) && rIsNeg(t.c)) return `-${vt}`
  // A fraction coefficient reads better as one fraction than as a fraction times a letter.
  if (t.c.d !== 1n) return `${rTex(t.c)}${vt}`
  return `${rTex(t.c)}${vt}`
}

/** A whole expression with the signs joined up: 6x^{2} + 7x - 3. */
export function exprTex(e: Expr): string {
  if (e.length === 0) return '0'
  let out = ''
  e.forEach((t, i) => {
    const neg = rIsNeg(t.c)
    const body = termTex({ c: rAbs(t.c), v: t.v })
    if (i === 0) out += neg ? `-${body}` : body
    else out += neg ? ` - ${body}` : ` + ${body}`
  })
  return out
}

/** Wrapped in brackets when it is a sum, so products read correctly: (x + 2)(x + 3). */
export function exprTexBracketed(e: Expr): string {
  const s = exprTex(e)
  return e.length > 1 ? `\\left(${s}\\right)` : s
}

// ---------------------------------------------------------------- parsing

function fromNode(node: MathNode): Expr {
  const n = node as unknown as { type: string; [k: string]: unknown }
  switch (n.type) {
    case 'ConstantNode': {
      const raw = n.value
      if (typeof raw !== 'number') throw new NotPolynomial('I can only work with ordinary numbers here.')
      return constExpr(rFromNumber(raw))
    }
    case 'SymbolNode': {
      const name = String(n.name)
      // Real constants would make the working inexact, so they are refused rather than approximated.
      // `i` is deliberately allowed through as an ordinary letter: the complex tools expand first
      // and only then replace i² with −1, which is exactly how the working should read.
      if (name === 'pi' || name === 'e') {
        throw new NotPolynomial(`${name} is a number that never ends, so it cannot appear in exact working like this.`)
      }
      return varExpr(name)
    }
    case 'ParenthesisNode':
      return fromNode(n.content as MathNode)
    case 'OperatorNode': {
      const args = (n.args as MathNode[]).map((a) => a)
      const op = String(n.op)
      if (op === '+') return args.map(fromNode).reduce(eAdd)
      if (op === '-') {
        if (args.length === 1) return eNeg(fromNode(args[0]))
        return eSub(fromNode(args[0]), fromNode(args[1]))
      }
      if (op === '*') return args.map(fromNode).reduce(eMul)
      if (op === '^') {
        const base = fromNode(args[0])
        const powNode = args[1] as unknown as { type: string; value?: unknown }
        if (powNode.type !== 'ConstantNode' || typeof powNode.value !== 'number' || !Number.isInteger(powNode.value)) {
          throw new NotPolynomial('Powers have to be whole numbers for this.')
        }
        return ePow(base, powNode.value)
      }
      if (op === '/') {
        const top = fromNode(args[0])
        const bot = fromNode(args[1])
        if (bot.length !== 1) throw new NotPolynomial('Dividing by a bracket makes a fraction — use Partial Fractions or Divide for that.')
        const done = divideByTerm(top, bot[0])
        if (!done) throw new NotPolynomial('That division leaves letters on the bottom, so it is not a polynomial.')
        return done
      }
      throw new NotPolynomial(`I do not know how to handle "${op}" here.`)
    }
    case 'FunctionNode':
      throw new NotPolynomial(`"${String((n.fn as { name?: string })?.name ?? 'that function')}" is not something I can factorise.`)
    default:
      throw new NotPolynomial('I could not read that as an algebraic expression.')
  }
}

/** Read typed maths into an expanded expression. Throws NotPolynomial with a readable reason. */
export function parseExpr(src: string): Expr {
  const text = src.trim()
  if (!text) throw new NotPolynomial('Nothing to work on yet — type an expression first.')
  let node: MathNode
  try {
    node = math.parse(preprocess(text))
  } catch {
    throw new NotPolynomial('I could not read that. Check the brackets and signs.')
  }
  return fromNode(node)
}

/**
 * Read a fraction of two expressions. `x` on its own comes back as x/1, so callers can treat
 * everything uniformly.
 */
export function parseFraction(src: string): { num: Expr; den: Expr } {
  const text = src.trim().replace(/^=+|=+$/g, '')
  if (!text) throw new NotPolynomial('Nothing to work on yet — type an expression first.')
  let node: MathNode
  try {
    node = math.parse(preprocess(text))
  } catch {
    throw new NotPolynomial('I could not read that. Check the brackets and signs.')
  }
  let top = node as unknown as { type: string; op?: string; args?: MathNode[]; content?: MathNode }
  while (top.type === 'ParenthesisNode' && top.content) top = top.content as unknown as typeof top
  if (top.type === 'OperatorNode' && top.op === '/' && top.args?.length === 2) {
    return { num: fromNode(top.args[0]), den: fromNode(top.args[1]) }
  }
  return { num: fromNode(node), den: constExpr(R1) }
}

/** The highest common factor of every term: the bit that comes out at the front. */
export function commonFactor(e: Expr): Term {
  if (e.length === 0) return { c: R0, v: {} }
  const c = rGcd(e.map((t) => t.c))
  const v: Record<string, number> = {}
  const first = e[0]
  for (const k of Object.keys(first.v)) {
    const lowest = e.reduce((m, t) => Math.min(m, t.v[k] ?? 0), first.v[k])
    if (lowest > 0) v[k] = lowest
  }
  // Pulling out a minus is only tidy when the whole thing starts negative.
  return { c: rIsNeg(e[0].c) ? rNeg(c) : c, v }
}

/** A single term as an Expr, for feeding back into the algebra. */
export const termExpr = (t: Term): Expr => normalize([{ c: t.c, v: { ...t.v } }])

/** Substitute a number for a letter — used to check working and to solve by picking values. */
export function evalAt(e: Expr, at: Record<string, Rat>): Rat {
  let sum = R0
  for (const t of e) {
    let p = t.c
    for (const k of Object.keys(t.v)) {
      const val = at[k]
      if (!val) throw new NotPolynomial(`No value given for ${k}.`)
      p = rMul(p, rPow(val, t.v[k]))
    }
    sum = rAdd(sum, p)
  }
  return sum
}

export { rat }

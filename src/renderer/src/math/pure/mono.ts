// Algebraic expressions as a sum of monomials: 6x²y − 3xy + 2.
//
// This is the shape every Pure Math step generator works on. Parsing expands everything first, so
// (x+2)(x+3) arrives as x² + 5x + 6 and the working can start from a tidy, ordered expression the
// same way a student would write it out.

import { type MathNode } from 'mathjs'
import { math, preprocess } from '../expr'
import { CONSTANT_NAMES, GREEK_NAMES } from '../names'
import { R0, R1, rAdd, rEq, rFromNumber, rGcd, rIsNeg, rIsOne, rMul, rNeg, rPow, rTex, rAbs, type Rat } from './rat'

/** One term: a coefficient and the powers of each variable. Absent variable = power 0. */
export interface Term {
  c: Rat
  v: Record<string, number>
}

/** A sum of terms, always tidy: like terms combined, zeros dropped, ordered for display. */
export type Expr = Term[]

/** Raised when the input is not something Pure Math can work on, with a sentence for the student. */
export class NotPolynomial extends Error {}

/**
 * A division by a bracket, such as (x²−4)/(x−2). parseExpr refuses it, but an equation with one can still be
 * read side by side (bracketSides), so the solver tells this refusal apart from the others.
 */
class BracketDivision extends NotPolynomial {}

/** The sentence for a division by a bracket (or by 0), as the reader has always written it. */
const BRACKET_SENTENCE = 'Dividing by a bracket makes a fraction — use Partial Fractions or Divide for that.'

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

const totalDegree = (t: Term): number => Object.values(t.v).reduce((a, b) => a + b, 0)
export const exprDegree = (e: Expr): number => e.reduce((m, t) => Math.max(m, totalDegree(t)), 0)
export const isConstant = (e: Expr): boolean => e.every((t) => totalDegree(t) === 0)

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

export function mulTerm(a: Term, b: Term): Term {
  const v: Record<string, number> = { ...a.v }
  for (const k of Object.keys(b.v)) v[k] = (v[k] ?? 0) + b.v[k]
  return { c: rMul(a.c, b.c), v }
}

/**
 * The size limits of exact working, which runs on the renderer's own thread. A power is built one
 * multiplication at a time, so x^1000000000 froze the window and Factorise on x^300000 + x never
 * came back: with one letter every tool answers a power of 1000 well inside a second, and no
 * school question comes near it. With several letters the size is the number of terms, not the
 * power — (x + y + z)^300 has 45 451 terms and took 24 s, and (x + y + z)^30 times (a + b + c)^30
 * never came back — so every product stops past MAX_TERMS. A product whose term count could reach
 * MAX_PAIRS is refused before it is worked out, since working it out is the slow part.
 */
const MAX_POWER = 1000
const MAX_TERMS = 2000
const MAX_PAIRS = 100_000
const TOO_MANY_TERMS = `Multiplied out, this has more than ${MAX_TERMS} terms — too many to show. Try smaller powers.`

export function eMul(a: Expr, b: Expr): Expr {
  // Said as "too big to work out", not "too many terms": (x + 1)^320 (x − 1)^320 trips this with
  // only 321 terms in its answer.
  if (a.length * b.length > MAX_PAIRS) throw new NotPolynomial('That is too big to multiply out exactly here. Try smaller powers.')
  const out: Term[] = []
  for (const x of a) for (const y of b) out.push(mulTerm(x, y))
  const product = normalize(out)
  if (product.length > MAX_TERMS) throw new NotPolynomial(TOO_MANY_TERMS)
  return product
}

export function ePow(a: Expr, k: number): Expr {
  if (k < 0) throw new NotPolynomial('A negative power turns this into a fraction, which I cannot work with in exact working.')
  if (k > MAX_POWER) throw new NotPolynomial(`That power is too big to work out exactly here. Powers up to ${MAX_POWER} work.`)
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

/**
 * The whole number an exponent comes to, or null.
 *
 * Brackets and a leading minus have to be seen through. MathLive's natural input becomes `x^(2)`
 * once converted to linear form, and a bare ConstantNode check rejected that outright — so typing
 * any power into the maths field made the whole expression unreadable.
 */
function wholeNumberIn(node: MathNode): number | null {
  const n = node as unknown as { type: string; value?: unknown; content?: MathNode; op?: string; args?: MathNode[] }
  if (n.type === 'ParenthesisNode' && n.content) return wholeNumberIn(n.content)
  if (n.type === 'ConstantNode') {
    return typeof n.value === 'number' && Number.isInteger(n.value) ? n.value : null
  }
  if (n.type === 'OperatorNode' && n.args?.length === 1 && (n.op === '-' || n.op === '+')) {
    const inner = wholeNumberIn(n.args[0])
    return inner === null ? null : n.op === '-' ? -inner : inner
  }
  return null
}

/** What a reader says when a division leaves a letter on the bottom (golden sweep "errors" pins this sentence for 1/x = 0). */
const LETTERS_ON_BOTTOM = 'That division leaves letters on the bottom, so it is not a polynomial.'

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
        const k = wholeNumberIn(args[1])
        if (k === null) throw new NotPolynomial('Powers have to be whole numbers for this.')
        return ePow(base, k)
      }
      if (op === '/') {
        const top = fromNode(args[0])
        const bot = fromNode(args[1])
        // A bottom of 0 gets the same sentence as a bracket: the reader has always said it this way, and the golden sweeps pin it.
        if (bot.length !== 1) throw new BracketDivision(BRACKET_SENTENCE)
        // Cancelling a letter out of the bottom gives a line with no sign of the value that makes the bottom 0, where the
        // original has no value at all (x²/x is undefined at 0). So a letter on the bottom is refused, not cancelled, and
        // no working can report that value as its answer.
        const done = varsOf(bot).length === 0 ? divideByTerm(top, bot[0]) : null
        if (!done) throw new NotPolynomial(LETTERS_ON_BOTTOM)
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

/**
 * "x(x + 1)" means x times the bracket. mathjs reads a letter followed by a bracket as a call to a
 * function named x, which is the first expand exercise a student meets being refused with
 * '"x" is not something I can factorise'. A single letter (with or without a power) directly in
 * front of a bracket gets its × written in; a letter inside a longer name (the n of sin) does not.
 */
const IMPLICIT_CALL = /(?<![A-Za-z_])([A-Za-z](?:\^\d+)?)\s*\(/g
/**
 * "i√3" is i times √3, written that way as often as √3 i. The Maths field's converter glues the i
 * to the root's name ("isqrt(3)", latexToMath.ts), which mathjs reads as a call to a function
 * nobody defined, and the stand-alone i that picks the Complex job is never seen (P22). It glues
 * i and π the same way: e^{iπ} arrives as e^(ipi), a letter called "ipi". An i on its own in front
 * of one of the function names the converter writes, or of π, and a π in front of an i, are split
 * off with a space — mathjs reads that as a product, as typed — and no real name is spelt like
 * that, so nothing else is read differently.
 */
const GLUED_I = /(?<![A-Za-z_])i(?=(?:sqrt|nthRoot|a?(?:sin|cos|tan)h?|sec|csc|cot|exp|ln|log)\s*\(|pi(?![A-Za-z_]))/g
const GLUED_PI = /(?<![A-Za-z_])pi(?=i(?![A-Za-z_]))/g

/**
 * mathjs reads a run of adjacent letters like `ab` as one symbol named "ab". Pure Math variables
 * are single letters, so `ab` must be split into `a*b` before parsing. Known mathjs names (sin,
 * sqrt, pi, e, Infinity, …) are left alone so `sin(x)` still reaches the FunctionNode refusal and
 * `pi` is still refused instead of becoming p·i. A Greek letter's name is one letter too: preprocess
 * turns θ into `theta` and varTex prints it back as \theta, so it must never become t·h·e·t·a —
 * not even inside a longer run, where 2aθ arrives as `2atheta` and means 2·a·θ. Every Greek name
 * counts, from the one list (math/names.ts).
 */
const knownMathName = (name: string): boolean =>
  CONSTANT_NAMES.has(name) || GREEK_NAMES.has(name) || (math as unknown as Record<string, unknown>)[name] !== undefined

export const writeTimes = (text: string): string => {
  // The glued i and π are split off first: as one run "isqrt" or "ipi" would become i·s·q·r·t or i·p·i.
  const unglued = text.replace(GLUED_I, 'i ').replace(GLUED_PI, 'pi ')
  const splitLetters = unglued.replace(/[A-Za-z]+/g, (run: string, offset: number, whole: string) => {
    // 0x1F and 0xFF are ONE hexadecimal number (0b11, 0o7 likewise), not 0·x·1·F: a letter run right after a lone 0 in
    // x, b or o starts a number of its own base, so it is left whole. A 0 inside a longer number (10x_1) or a decimal
    // (0.5x_1) starts no number, and is split as any other run is.
    if (run.length > 1 && /^[xbo]/.test(run) && whole[offset - 1] === '0' && !/[\w.]/.test(whole[offset - 2] ?? '')) return run
    if (run.length === 1 || knownMathName(run)) return run
    return run
      .split(/(theta)/)
      .flatMap((part) => (part === 'theta' ? [part] : part.split('')))
      .join('*')
  })
  return splitLetters.replace(IMPLICIT_CALL, '$1*(')
}

/**
 * True when a typed number has more significant digits than a double holds (15 always survive).
 * mathjs reads every number as a double before fromNode sees it, so 12345678901234567890 had
 * already become …567168 and was factorised with a confident tick. Leading and trailing zeros
 * do not count: 10^20 written out in full is exact.
 */
export const tooManyDigits = (text: string): boolean =>
  (text.match(/\d+(?:\.\d+)?|\.\d+/g) ?? []).some((n) => n.replace('.', '').replace(/^0+/, '').replace(/0+$/, '').length > 15)

/**
 * A 0 typed straight against a letter, as in 0x + 3 or x² + 0x − 4, means 0 times that letter. mathjs reads "0x" as the
 * start of a hex number (and 0b, 0o as binary and octal) and refuses the whole line, so before the line is read a × is
 * put between the 0 and the letter. A 0 inside a longer number (10x, 0.5x) does not start a number of its own, and a 0
 * that begins an exponent (0e+3) is left to mathjs, which already reads it as 0. A 0x, 0b or 0o that is followed by a digit
 * of its own base (0x1F, 0b11, 0o7) is a number and is left as it is: the "=" engine reads it as one, so the working must
 * too, or the two would disagree about the same line (0x1F + 2 is 33, not 2). Only this reader does this: the checker
 * still reads 0x as hex on purpose (tests/check/adversarial.test.ts), so writeTimes itself is not changed.
 */
const ZERO_BEFORE_LETTER = /(?<![\w.])0(?=[A-Za-z])(?![eE][+-]?\d)(?!x[0-9A-Fa-f]|b[01]|o[0-7])/g

/** The typed text as a mathjs tree, or a NotPolynomial that says what could not be read. */
function readNode(src: string): MathNode {
  const text = src.trim()
  if (!text) throw new NotPolynomial('Nothing to work on yet — type an expression first.')
  if (tooManyDigits(preprocess(text))) {
    throw new NotPolynomial('A number here has more digits than I can keep exactly. Use at most 15 significant figures in each number.')
  }
  try {
    return math.parse(writeTimes(preprocess(text).replace(ZERO_BEFORE_LETTER, '0*')))
  } catch {
    throw new NotPolynomial('I could not read that. Check the brackets and signs.')
  }
}

/** Read typed maths into an expanded expression. Throws NotPolynomial with a readable reason. */
export function parseExpr(src: string): Expr {
  return fromNode(readNode(src))
}

/**
 * The bottom of every typed division, read as a polynomial in the same tree parseExpr reads. A bottom
 * this reader cannot make into a polynomial is null, and the caller must treat it as possibly holding
 * the letter. Call it only on text parseExpr has already read.
 */
export function divisionBottoms(src: string): (Expr | null)[] {
  const found: (Expr | null)[] = []
  const walk = (node: MathNode): void => {
    const n = node as unknown as Loose
    if (n.type === 'OperatorNode' && n.op === '/' && n.args && n.args.length === 2) {
      let bottom: Expr | null
      try {
        bottom = fromNode(n.args[1])
      } catch {
        bottom = null
      }
      found.push(bottom)
    }
    for (const kid of [...(n.args ?? []), ...(n.content ? [n.content] : [])]) walk(kid)
  }
  walk(readNode(src))
  return found
}

/**
 * A typed side read as top over bottom. A side that is not a division has the bottom 1. The bottom of 0
 * is refused here, because multiplying out by it would make every equation true.
 */
function sideParts(src: string): { top: Expr; bottom: Expr } {
  const root = readNode(src)
  let bare = root as unknown as Loose
  while (bare.type === 'ParenthesisNode' && bare.content) bare = bare.content as unknown as Loose
  if (bare.type === 'OperatorNode' && bare.op === '/' && bare.args?.length === 2) {
    const top = fromNode(bare.args[0])
    const bottom = fromNode(bare.args[1])
    if (bottom.length === 0) throw new BracketDivision(BRACKET_SENTENCE)
    return { top, bottom }
  }
  return { top: fromNode(root), bottom: constExpr(R1) }
}

/** One side of an equation read as top over bottom. A side that is not a division has the bottom 1. */
export interface SideParts {
  top: Expr
  bottom: Expr
}

/**
 * The two sides of an equation with a division by a bracket on one side, such as (x²−4)/(x−2) = 4. Here
 * the solver clears the bottoms itself (solve.ts), so it needs each side as top over bottom. parseExpr refuses
 * such a division (it can only divide by one term). Returns null when parseExpr reads both sides, so the caller
 * reads them exactly as it always did.
 */
export function bracketSides(lhsSrc: string, rhsSrc: string): { lhs: SideParts; rhs: SideParts } | null {
  try {
    parseExpr(lhsSrc)
    parseExpr(rhsSrc)
    return null
  } catch (err) {
    if (!(err instanceof BracketDivision)) throw err
  }
  return { lhs: sideParts(lhsSrc), rhs: sideParts(rhsSrc) }
}

/**
 * A letter, or a bracket with one in it, raised to the power 0. That is 1 for every value of the letter except 0, and 0 to
 * the power 0 has no value, so a line with one cannot be said to hold for "every value of x".
 */
function letterToZeroPower(node: MathNode): boolean {
  let found = false
  node.traverse((n) => {
    if (n.type !== 'OperatorNode') return
    const o = n as unknown as { op?: string; args?: MathNode[] }
    const args = o.args
    if (o.op !== '^' || !args || args.length !== 2 || wholeNumberIn(args[1]) !== 0) return
    args[0].traverse((m) => {
      if (m.type === 'SymbolNode') found = true
    })
  })
  return found
}

/**
 * The letters a typed equation names, in the order they first appear, both sides together. A letter whose terms cancel
 * is still named: "x - x + 3 = 3" has no letter left once worked out, yet the student typed an x, and the working can say
 * which letter it means. A side that cannot be read is skipped; the solver has already refused it with its own sentence.
 * A letter raised to the power 0 names nothing, since the line may have no value at 0 (see letterToZeroPower).
 */
export function typedLetters(src: string): string[] {
  const names: string[] = []
  for (const side of src.split('=')) {
    let node: MathNode
    try {
      node = readNode(side)
    } catch {
      continue
    }
    if (letterToZeroPower(node)) return []
    node.traverse((n) => {
      const name = (n as unknown as { name?: unknown }).name
      if (n.type === 'SymbolNode' && typeof name === 'string' && !names.includes(name)) names.push(name)
    })
  }
  return names
}

type Loose = { type: string; op?: string; args?: MathNode[]; content?: MathNode }

/** How many times a bracket is written out for Expand: (x + 1)⁸ is eight columns, not one lump. */
const MAX_UNROLLED_POWER = 8

/** One product, taken apart: its factors, its sign, and how it was typed. */
interface Product {
  neg: boolean
  factors: Expr[]
  shown: string
}

/**
 * The factors of one product node.
 *
 * A leading minus inside the product is peeled off as the sign: mathjs reads −(x + 1)(x − 1) as
 * (−(x + 1))·(x − 1), and folding the minus into the bracket showed the student a grid for
 * (−x − 1), which is not what they wrote.
 */
function productOfNode(node: MathNode): Product {
  const out: { e: Expr; tex?: string }[] = []
  let neg = false
  const walk = (n: MathNode): void => {
    const v = n as unknown as Loose
    if (v.type === 'ParenthesisNode' && v.content) return walk(v.content)
    if (v.type === 'OperatorNode' && v.op === '*' && v.args) return v.args.forEach(walk)
    if (v.type === 'OperatorNode' && v.op === '-' && v.args?.length === 1) {
      neg = !neg
      return walk(v.args[0])
    }
    if (v.type === 'OperatorNode' && v.op === '^' && v.args?.length === 2) {
      const k = wholeNumberIn(v.args[1])
      const base = fromNode(v.args[0])
      // A power of a bracket is that bracket written k times; a power of a single term stays whole.
      if (k !== null && k >= 2 && base.length > 1) {
        if (k <= MAX_UNROLLED_POWER) {
          for (let i = 0; i < k; i++) out.push({ e: base })
          return
        }
        // Too high to unroll: the factor is stored expanded, but the heading must still show the
        // power that was typed, not the answer.
        out.push({ e: fromNode(n), tex: `\\left(${exprTex(base)}\\right)^{${k}}` })
        return
      }
    }
    out.push({ e: fromNode(n) })
  }
  walk(node)
  // 2x is one term, not "2 times x": every single-term factor is gathered into one monomial, in
  // the place of the first, so 2x(x + 1) distributes 2x over the bracket instead of starting with
  // a grid for 2 × x.
  const singles = out.filter((f) => f.e.length === 1)
  let merged = out
  if (singles.length >= 2) {
    const mono = singles.reduce((a, b) => eMul(a, b.e), constExpr(R1))
    let placed = false
    merged = out.flatMap((f) => {
      if (f.e.length !== 1) return [f]
      if (placed) return []
      placed = true
      return [{ e: mono }]
    })
  }
  return { neg, factors: merged.map((f) => f.e), shown: merged.map((f) => f.tex ?? exprTexBracketed(f.e)).join('') }
}

/** One piece of a sum: its sign, the factors of the product it is, and the product as typed. */
export interface Summand {
  neg: boolean
  factors: Expr[]
  /** LaTeX of the factors as written: (x + 1)^{9} is stored as one expanded factor and must not be shown as one. */
  shown: string
}

/**
 * The top-level sum, each piece kept as a product of factors: (x + 2)² − (x − 2)² comes back as
 * two summands of two factors each, so Expand can multiply each one out and then add the pieces,
 * instead of saying there was nothing to multiply.
 */
export function parseSummands(src: string): Summand[] {
  const out: Summand[] = []
  const walk = (n: MathNode, neg: boolean): void => {
    const v = n as unknown as Loose
    if (v.type === 'ParenthesisNode' && v.content) return walk(v.content, neg)
    if (v.type === 'OperatorNode' && v.args) {
      if (v.op === '+' && v.args.length === 2) {
        walk(v.args[0], neg)
        return walk(v.args[1], neg)
      }
      if (v.op === '-' && v.args.length === 2) {
        walk(v.args[0], neg)
        return walk(v.args[1], !neg)
      }
      if (v.op === '-' && v.args.length === 1) return walk(v.args[0], !neg)
      if (v.op === '+' && v.args.length === 1) return walk(v.args[0], neg)
    }
    const product = productOfNode(n)
    out.push({ neg: neg !== product.neg, factors: product.factors, shown: product.shown })
  }
  walk(readNode(src), false)
  return out
}

/**
 * Read a fraction of two expressions. `x` on its own comes back as x/1, so callers can treat
 * everything uniformly.
 */
export function parseFraction(src: string): { num: Expr; den: Expr } {
  const node = readNode(src.trim().replace(/^=+|=+$/g, ''))
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


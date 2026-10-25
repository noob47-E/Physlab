// Exponential equations that are a quadratic in a power (S3, substitution): 4^x - 3*2^x + 2 = 0 is u^2 - 3u + 2 = 0 with u = 2^x.
//
// The shape read here is a sum of terms c*b^(k*x) and whole-number constants, equal to a whole number. Every base must be a
// power of one common base a (the smallest base, or the base e), so each term is u^p for u = a^x, with p the power of a in its
// base times k. The result is a quadratic in u, whose roots are exact rationals. A root u > 0 is a^x = u, which is x = n when u
// is a whole power of a (2^x = 8 has x = 3), or x = ln u for the base e; a root u <= 0 gives no x, because a^x is always
// positive. The working is checked exactly: each step's move, the roots of the quadratic, the reading of each root back into
// x, and the put-back of every x into the typed equation (with rational values). Anything else is refused and gets no working,
// so the Calculator's own answer stays: a base that is not a power of a, a power of u other than 1 or 2, a root that is not
// rational, or a value of u that is not an exact power of a.

import type { MathNode } from 'mathjs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = MathNode & Record<string, any>
import { math, preprocess } from '../expr'
import { rat, rAdd, rCmp, rDiv, rEq, rIsNeg, rMul, rNeg, rSqrt, rStr, rSub, type Rat } from '../pure/rat'
import { eEq, eSub, normalize, parseExpr, varsOf, type Expr } from '../pure/mono'
import type { Step, ValidationVerdict } from './types'

/** The letter the substitution introduces. */
const U = 'u'
/** The largest whole power a value of u may be written as: the same bound the logarithm checks use. */
const MAX_WHOLE_POWER = 300
/** The largest base a term may have: a bigger one is a number no student can read off a working. */
const MAX_BASE = 1000n
/** The letters a power's exponent may not be: they are constants or the base e. */
const NOT_A_LETTER = new Set(['e', 'E', 'i', 'I'])

/** The base of the substitution: the base e, or a whole number from 2 up. */
type SubBase = 'e' | bigint

/** One term of the typed left side: c·base^(k·v), or the whole number c when base is null. */
interface ExpTerm {
  c: bigint
  base: SubBase | null
  k: bigint
  v: string | null
}

/** A typed equation with its terms on the left and a whole number on the right, in the one letter v. */
export interface ExpEquation {
  v: string
  terms: ExpTerm[]
  rhs: bigint
}

/**
 * The substitution of a typed equation: its base a, the power of u each term takes (0 for a constant), and the quadratic
 * a2·u² + a1·u + a0 = 0 it becomes. a0 already has the right side taken off, so rhs is kept to put the left side back.
 */
export interface SubstPlan {
  v: string
  a: SubBase
  powers: number[]
  a2: bigint
  a1: bigint
  a0: bigint
  rhs: bigint
}

/** The data a substitution's final step carries (SolutionSetEq with expSubst), read back by the checker and the sentences. */
export interface ExpSolutionData {
  expSubst: true
  variable: string
  domain: 'real'
  base: string
  u: string
  original: string
  /** Every real root of the quadratic in u, ascending, as rationals. */
  roots: string[]
  /** The roots above zero: each one is a^x for one x. */
  accepted: string[]
  /** The roots at or below zero: no x gives them. */
  rejected: string[]
  /** The x of each accepted root, in the same order. */
  solutions: string[]
  /** Each accepted root put back into the typed equation: the left side's value, and the right side. */
  checks: Array<{ value: string; ok: boolean; left: string; right: string }>
}

/** The result of solutionOf: the roots sorted into accepted and rejected, the x of each accepted root, and the put-back. */
interface ExpSolution {
  accepted: string[]
  rejected: string[]
  xs: string[]
  checks: Array<{ value: string; ok: boolean; left: string; right: string }>
}

/** A text with its spaces removed: two texts that differ only in layout compare equal. */
function squeeze(text: string): string {
  return text.replace(/\s+/g, '')
}

function sameStrings(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

/** The base as the data and the moves write it: "e" or the digits. */
export function baseText(a: SubBase): string {
  return a === 'e' ? 'e' : a.toString()
}

/** A parse of a text by the app's own maths reader, or null when it does not read. */
function parseText(text: string): AnyNode | null {
  try {
    return math.parse(preprocess(text)) as AnyNode
  } catch {
    return null
  }
}

/** A whole number written as a node (2, -3, (4)), or null. Decimals and fractions are not read: the checks are exact integers. */
function intOf(node: AnyNode): bigint | null {
  if (node.type === 'ParenthesisNode') return intOf(node.content)
  if (node.type === 'ConstantNode') {
    const x = node.value
    return typeof x === 'number' && Number.isSafeInteger(x) ? BigInt(x) : null
  }
  if (node.type === 'OperatorNode' && node.fn === 'unaryMinus' && node.args.length === 1) {
    const a = intOf(node.args[0])
    return a === null ? null : -a
  }
  return null
}

/** A single letter a node is (x, or (x)), or null. The base e and the imaginary unit are constants, not letters. */
function letterOf(node: AnyNode): string | null {
  if (node.type === 'ParenthesisNode') return letterOf(node.content)
  if (node.type === 'SymbolNode' && /^[A-Za-z]$/.test(node.name) && !NOT_A_LETTER.has(node.name)) return node.name
  return null
}

/** An exponent that is a letter times a whole number: x, 2x, (2x), (2*x). Null for any other exponent. */
function exponentOf(node: AnyNode): { k: bigint; v: string } | null {
  if (node.type === 'ParenthesisNode') return exponentOf(node.content)
  const bare = letterOf(node)
  if (bare !== null) return { k: 1n, v: bare }
  if (node.type === 'OperatorNode' && node.fn === 'multiply' && node.args.length === 2) {
    const [p, q] = node.args
    const k = intOf(p)
    const l = letterOf(q)
    if (k !== null && l !== null && k >= 1n) return { k, v: l }
    const k2 = intOf(q)
    const l2 = letterOf(p)
    if (k2 !== null && l2 !== null && k2 >= 1n) return { k: k2, v: l2 }
  }
  return null
}

/** A power b^e with b the base e or a whole number from 2 up, and e a letter times a whole number. */
function powerOf(node: AnyNode): { base: SubBase; k: bigint; v: string } | null {
  if (node.type === 'ParenthesisNode') return powerOf(node.content)
  if (node.type !== 'OperatorNode' || node.fn !== 'pow' || node.args.length !== 2) return null
  const [b, e] = node.args
  let base: SubBase | null = null
  if (b.type === 'SymbolNode' && b.name === 'e') base = 'e'
  else {
    const n = intOf(b)
    if (n !== null && n >= 2n && n <= MAX_BASE) base = n
  }
  if (base === null) return null
  const ex = exponentOf(e)
  if (ex === null) return null
  return { base, k: ex.k, v: ex.v }
}

/** One term as read (its sign is applied by the caller): a whole number, a power, or a whole number times a power. */
function termOf(node: AnyNode): ExpTerm | null {
  if (node.type === 'ParenthesisNode') return termOf(node.content)
  const whole = intOf(node)
  if (whole !== null) return { c: whole, base: null, k: 0n, v: null }
  const p = powerOf(node)
  if (p !== null) return { c: 1n, base: p.base, k: p.k, v: p.v }
  if (node.type === 'OperatorNode' && node.fn === 'multiply' && node.args.length === 2) {
    const [x, y] = node.args
    const cx = intOf(x)
    if (cx !== null) {
      const t = termOf(y)
      return t === null ? null : { ...t, c: t.c * cx }
    }
    const cy = intOf(y)
    if (cy !== null) {
      const t = termOf(x)
      return t === null ? null : { ...t, c: t.c * cy }
    }
  }
  return null
}

interface Piece {
  sign: 1 | -1
  node: AnyNode
}

/** The pieces of a sum, each with its sign. False when a part is not a sum of pieces this reads. */
function piecesOf(node: AnyNode, sign: 1 | -1, out: Piece[]): boolean {
  if (node.type === 'ParenthesisNode') return piecesOf(node.content, sign, out)
  if (node.type === 'OperatorNode' && node.args.length === 2 && node.fn === 'add') {
    return piecesOf(node.args[0], sign, out) && piecesOf(node.args[1], sign, out)
  }
  if (node.type === 'OperatorNode' && node.args.length === 2 && node.fn === 'subtract') {
    return piecesOf(node.args[0], sign, out) && piecesOf(node.args[1], sign === 1 ? -1 : 1, out)
  }
  if (node.type === 'OperatorNode' && node.args.length === 1 && node.fn === 'unaryMinus') {
    return piecesOf(node.args[0], sign === 1 ? -1 : 1, out)
  }
  out.push({ sign, node })
  return true
}

/**
 * The typed equation read as terms in one letter, or null. Exactly one "=", a whole number on the right, and every term a
 * whole number or c·b^(k·v) with the same letter v in every exponent. Inequalities and anything else are refused.
 */
export function readExpEquation(text: string): ExpEquation | null {
  if (/[<>!]/.test(text)) return null
  const sides = text.split('=')
  if (sides.length !== 2 || sides[0].trim() === '' || sides[1].trim() === '') return null
  const left = parseText(sides[0])
  const right = parseText(sides[1])
  if (left === null || right === null) return null
  const rhs = intOf(right)
  if (rhs === null) return null
  const pieces: Piece[] = []
  if (!piecesOf(left, 1, pieces)) return null
  const terms: ExpTerm[] = []
  for (const p of pieces) {
    const t = termOf(p.node)
    if (t === null) return null
    terms.push({ ...t, c: t.c * BigInt(p.sign) })
  }
  let v: string | null = null
  for (const t of terms) {
    if (t.base === null) continue
    if (t.v === null || (v !== null && v !== t.v)) return null
    v = t.v
  }
  if (v === null || v === U) return null
  return { v, terms, rhs }
}

/**
 * The substitution of a typed equation, or null when it is not one this reads. The base a is the smallest base (or e), and
 * every other base must be a power of it, so each term is a power of u = a^x exactly. The result must be a quadratic in u.
 */
export function substPlanOf(eq: ExpEquation): SubstPlan | null {
  const bases = eq.terms.filter((t) => t.base !== null).map((t) => t.base as SubBase)
  if (bases.length === 0) return null
  const numeric = bases.filter((b): b is bigint => typeof b === 'bigint')
  let a: SubBase
  if (numeric.length === bases.length) a = numeric.reduce((m, b) => (b < m ? b : m))
  else if (numeric.length === 0) a = 'e'
  else return null

  const powers: number[] = []
  for (const t of eq.terms) {
    if (t.base === null) {
      powers.push(0)
      continue
    }
    if (t.k < 1n || t.k > 2n) return null
    let j: bigint
    if (a === 'e') {
      if (t.base !== 'e') return null
      j = 1n
    } else {
      if (t.base === 'e') return null
      let b = t.base
      let n = 0n
      while (b > 1n && b % a === 0n) {
        b /= a
        n += 1n
      }
      if (b !== 1n || n === 0n) return null
      j = n
    }
    const p = j * t.k
    if (p > 2n) return null
    powers.push(Number(p))
  }

  let a2 = 0n
  let a1 = 0n
  let a0 = -eq.rhs
  eq.terms.forEach((t, i) => {
    const p = powers[i]
    if (p === 2) a2 += t.c
    else if (p === 1) a1 += t.c
    else a0 += t.c
  })
  if (a2 === 0n) return null
  return { v: eq.v, a, powers, a2, a1, a0, rhs: eq.rhs }
}

/** The quadratic in u as the working writes it: "u^2 - 3u + 2 = 0". */
export function quadraticText(p: SubstPlan): string {
  const parts: Array<[bigint, number]> = [
    [p.a2, 2],
    [p.a1, 1],
    [p.a0, 0]
  ]
  let out = ''
  for (const [c, pow] of parts) {
    if (c === 0n) continue
    const mag = c < 0n ? -c : c
    const body = pow === 0 ? '' : pow === 1 ? U : `${U}^${pow}`
    const coef = body !== '' && mag === 1n ? '' : mag.toString()
    const term = `${coef}${body}`
    if (out === '') out = c < 0n ? `-${term}` : term
    else out = `${out} ${c < 0n ? '-' : '+'} ${term}`
  }
  return `${out} = 0`
}

/** The quadratic in u as a polynomial, for the exact comparison with a written line. */
function planExpr(p: SubstPlan): Expr {
  return normalize([
    { c: rat(p.a2), v: { [U]: 2 } },
    { c: rat(p.a1), v: { [U]: 1 } },
    { c: rat(p.a0), v: {} }
  ])
}

/**
 * The real roots of the quadratic in u, ascending and distinct, as exact rationals: [] when it has none, and null when its roots
 * are not rational (a root that is a surd is not written here, so the working is refused rather than shown).
 */
export function rootsOfPlan(p: SubstPlan): Rat[] | null {
  const a2 = rat(p.a2)
  const a1 = rat(p.a1)
  const a0 = rat(p.a0)
  const D = rSub(rMul(a1, a1), rMul(rat(4n), rMul(a2, a0)))
  if (rIsNeg(D)) return []
  const s = rSqrt(D)
  if (s === null) return null
  const twoA = rMul(rat(2n), a2)
  const r1 = rDiv(rSub(rNeg(a1), s), twoA)
  const r2 = rDiv(rAdd(rNeg(a1), s), twoA)
  const pair = rCmp(r1, r2) <= 0 ? [r1, r2] : [r2, r1]
  return rEq(pair[0], pair[1]) ? [pair[0]] : pair
}

/** The whole number n with c = base^n, for c >= 1, or null. */
function wholePower(base: bigint, c: bigint): number | null {
  let rest = c
  let n = 0
  while (rest > 1n) {
    if (rest % base !== 0n) return null
    rest /= base
    n += 1
    if (n > MAX_WHOLE_POWER) return null
  }
  return rest === 1n ? n : null
}

/**
 * The x with a^x = r, written as the answer writes it: "2", "-1", "0", or "\ln{3}" for the base e. Null when r is not a
 * positive value this writes exactly (a value that is not a whole power of a, or a fraction for the base e).
 */
function xTextOf(a: SubBase, r: Rat): string | null {
  if (r.n <= 0n) return null
  if (a === 'e') {
    if (r.d !== 1n) return null
    return r.n === 1n ? '0' : `\\ln{${r.n}}`
  }
  if (r.d === 1n) {
    const n = wholePower(a, r.n)
    return n === null ? null : String(n)
  }
  if (r.n === 1n) {
    const n = wholePower(a, r.d)
    return n === null || n === 0 ? null : `-${n}`
  }
  return null
}

/** The left side (the typed left, with u put in) and the right side at a rational value of u. */
function sidesAt(p: SubstPlan, r: Rat): { left: Rat; right: Rat } {
  const right = rat(p.rhs)
  const left = rAdd(rAdd(rMul(rat(p.a2), rMul(r, r)), rMul(rat(p.a1), r)), rAdd(rat(p.a0), right))
  return { left, right }
}

/**
 * The solution of the substitution from the roots of the quadratic: each root above zero is an x (exactly), each root at or below
 * zero is rejected, and each accepted root is put back into the typed equation. Null when an accepted root has no exact x.
 */
export function solutionOf(p: SubstPlan, roots: Rat[]): ExpSolution | null {
  const accepted = roots.filter((r) => r.n > 0n)
  const rejected = roots.filter((r) => r.n <= 0n)
  const xs: string[] = []
  for (const r of accepted) {
    const x = xTextOf(p.a, r)
    if (x === null) return null
    xs.push(x)
  }
  const checks = accepted.map((r, i) => {
    const { left, right } = sidesAt(p, r)
    return { value: xs[i], ok: rEq(left, right), left: rStr(left), right: rStr(right) }
  })
  return { accepted: accepted.map(rStr), rejected: rejected.map(rStr), xs, checks }
}

/** The data a substitution's final step carries, read back from a step; null when it does not have the right shape. */
export function readExpData(data: unknown): ExpSolutionData | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (d.expSubst !== true || d.domain !== 'real') return null
  if (typeof d.variable !== 'string' || typeof d.base !== 'string' || typeof d.u !== 'string' || typeof d.original !== 'string') return null
  const list = (x: unknown): string[] | null => (Array.isArray(x) && x.every((s) => typeof s === 'string') ? (x as string[]) : null)
  const roots = list(d.roots)
  const accepted = list(d.accepted)
  const rejected = list(d.rejected)
  const solutions = list(d.solutions)
  if (roots === null || accepted === null || rejected === null || solutions === null) return null
  if (!Array.isArray(d.checks)) return null
  const checks: ExpSolutionData['checks'] = []
  for (const c of d.checks as unknown[]) {
    if (!c || typeof c !== 'object') return null
    const o = c as Record<string, unknown>
    if (typeof o.value !== 'string' || typeof o.ok !== 'boolean' || typeof o.left !== 'string' || typeof o.right !== 'string') return null
    checks.push({ value: o.value, ok: o.ok, left: o.left, right: o.right })
  }
  return {
    expSubst: true,
    variable: d.variable,
    domain: 'real',
    base: d.base,
    u: d.u,
    original: d.original,
    roots,
    accepted,
    rejected,
    solutions,
    checks
  }
}

/**
 * The move of a substitution step: the typed equation (before) becomes the quadratic in u (after), with u = a^x. Both are read
 * exactly: after's left side minus its right side must be the quadratic the typed equation becomes under u = a^x.
 */
export function checkExpSubstituteOp(before: string, after: string, op: { base: string; u: string }): ValidationVerdict {
  const eq = readExpEquation(before)
  if (eq === null) return 'unknown'
  const plan = substPlanOf(eq)
  if (plan === null) return 'unknown'
  if (op.base !== baseText(plan.a) || op.u !== U) return 'invalid'
  const sides = after.split('=')
  if (sides.length !== 2) return 'invalid'
  let L: Expr
  let R: Expr
  try {
    L = parseExpr(sides[0])
    R = parseExpr(sides[1])
  } catch {
    return 'unknown'
  }
  const D = eSub(L, R)
  if (varsOf(D).some((name) => name !== U)) return 'invalid'
  return eEq(D, planExpr(plan)) ? 'valid' : 'invalid'
}

/**
 * The final solution set of a substitution, checked exactly: the quadratic it starts from is the one the typed equation becomes,
 * its roots are the exact roots, each root above zero gives its x, each root at or below zero is rejected, the put-back of each
 * x into the typed equation holds, and the displayed line lists exactly those x.
 */
export function checkExpSolutionSet(step: Step): ValidationVerdict {
  const d = readExpData(step.data)
  if (d === null || typeof step.before !== 'string' || typeof step.after !== 'string') return 'invalid'
  const eq = readExpEquation(d.original)
  if (eq === null || eq.v !== d.variable) return 'invalid'
  const plan = substPlanOf(eq)
  if (plan === null || baseText(plan.a) !== d.base || d.u !== U) return 'invalid'
  if (squeeze(step.before) !== squeeze(quadraticText(plan))) return 'invalid'
  const roots = rootsOfPlan(plan)
  if (roots === null) return 'unknown'
  if (!sameStrings(d.roots, roots.map(rStr))) return 'invalid'
  const solution = solutionOf(plan, roots)
  if (solution === null) return 'unknown'
  if (!sameStrings(d.accepted, solution.accepted) || !sameStrings(d.rejected, solution.rejected)) return 'invalid'
  if (!sameStrings(d.solutions, solution.xs)) return 'invalid'
  if (d.checks.length !== solution.checks.length) return 'invalid'
  for (let i = 0; i < solution.checks.length; i++) {
    const c = d.checks[i]
    const want = solution.checks[i]
    if (c.value !== want.value || c.ok !== want.ok || c.left !== want.left || c.right !== want.right || !want.ok) return 'invalid'
  }
  const said =
    solution.xs.length === 0
      ? '\\text{No real solution}'
      : solution.xs.map((x) => `${d.variable} = ${x}`).join(' \\text{ or } ')
  return squeeze(step.after) === squeeze(said) ? 'valid' : 'invalid'
}

/** A value written in words for a sentence: a minus sign, and ln for a logarithm. */
function plainValue(text: string): string {
  if (text.startsWith('\\ln{')) return `ln ${text.slice(4, -1)}`
  return text.replace('-', '−')
}

/** The superscript of a power of u: u, u². */
function uPower(p: number): string {
  return p === 1 ? U : `${U}²`
}

/**
 * The words of a substitution move: "Put u = 2^x, so 4^x = u² and 2^x = u." Each non-constant term is named with its power of u.
 * Null when the typed equation does not read as one.
 */
export function substitutionSentence(before: string, op: { base: string; u: string }): string | null {
  const eq = readExpEquation(before)
  if (eq === null) return null
  const plan = substPlanOf(eq)
  if (plan === null) return null
  const pairs: string[] = []
  eq.terms.forEach((t, i) => {
    if (t.base === null) return
    const exponent = t.k === 1n ? eq.v : `(${t.k}${eq.v})`
    const pair = `${baseText(t.base)}^${exponent} = ${uPower(plan.powers[i])}`
    if (!pairs.includes(pair)) pairs.push(pair)
  })
  const joined = pairs.length <= 1 ? pairs.join('') : `${pairs.slice(0, -1).join(', ')} and ${pairs[pairs.length - 1]}`
  return `Put ${op.u} = ${baseText(plan.a)}^${eq.v}, so ${joined}.`
}

/**
 * The words of the final solution set: each root above zero, with the x it gives, and each root at or below zero, rejected.
 * Null when the data does not have the shape the checker reads.
 */
export function expSolutionSentence(data: unknown): string | null {
  const d = readExpData(data)
  if (d === null) return null
  if (d.roots.length === 0) return `The quadratic in ${d.u} has no real root, so the equation has no real solution.`
  const parts: string[] = []
  d.accepted.forEach((r, i) => {
    parts.push(`${d.u} = ${plainValue(r)} gives ${d.base}^${d.variable} = ${plainValue(r)}, so ${d.variable} = ${plainValue(d.solutions[i])}.`)
  })
  for (const r of d.rejected) {
    parts.push(`${d.u} = ${plainValue(r)} gives no value of ${d.variable}, because ${d.base}^${d.variable} is always positive.`)
  }
  return parts.join(' ')
}

/** The rule chip of the final solution set. */
export function expSolutionRule(data: unknown): string | null {
  const d = readExpData(data)
  if (d === null) return null
  return d.solutions.length > 0 ? 'Solutions' : 'No real solution'
}


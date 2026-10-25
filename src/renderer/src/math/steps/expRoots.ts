// Exponential and logarithmic equations whose answer is not a whole number (09-F EXPLOGGEN).
//
// The methods in methods/expRoot.ts and methods/logSum.ts write these moves and endings:
//   - e^(x) = 5 or 5^(x) = 12, with an optional multiplier and constant around the power: the power is isolated, then
//     the logarithm is taken, giving x = ln 5 or x = ln 12 / ln 5 (exp-to-log);
//   - ln(A) = c for a whole number c: A = e^c (log-to-exp), then e^0 = 1 (work-out-exp) when c is 0;
//   - log(A) + log(B) = c in base 10: the two logarithms are joined into log(AB) (join-logs), with a step that names the
//     domain of the typed equation first (log-domain), and the roots are kept only where every logarithm takes a positive
//     number. A root that fails is rejected in words (logSumEnding).
//
// Every check here is exact. Numbers are rationals (ratOf), polynomials are exact (mono.ts), and a logarithm or power that
// is not a rational is never evaluated: a move is valid only when the text it writes is the text the exact rule gives.
// A text this reader does not take is 'unknown', never 'valid'. Nothing here reads a decimal.
//
// This module does not import check-adapter.ts (check-adapter imports it), so it reads its own small set of forms.

import { constExpr, eEq, eMul, eSub, evalAt, exprDegree, parseExpr, varsOf, type Expr } from '../pure/mono'
import { rat, rAdd, rCmp, rDiv, rEq, rIsNeg, rIsZero, rMul, rNeg, rSign, rSqrt, rStr, rSub, rTex, R0, type Rat } from '../pure/rat'
import { latexToMath } from '../latexToMath'
import type { ValidationVerdict } from './types'

/** The largest whole-number exponent a check writes or raises a base to: the bound the other exponential checks use. */
const MAX_EXP_POWER = 300

/** The text as the checks read it: LaTeX is converted, spaces are dropped. Null when the converter refuses the text. */
function readableText(text: string): string | null {
  try {
    const s = text.includes('\\') ? latexToMath(text) : text
    return s.replace(/\s+/g, '')
  } catch {
    return null
  }
}

/** The two sides of one equation, read; null when the text is not exactly one equation. */
function sidesOf(text: string): { left: string; right: string } | null {
  const s = readableText(text)
  if (s === null) return null
  const i = s.indexOf('=')
  if (i < 0 || s.indexOf('=', i + 1) !== -1) return null
  return { left: s.slice(0, i), right: s.slice(i + 1) }
}

/** Two texts read the same way (the same maths, whatever the spacing or LaTeX spelling); false when either is unreadable. */
function sameMaths(a: string, b: string): boolean {
  const x = readableText(a)
  const y = readableText(b)
  return x !== null && y !== null && x === y
}

/** A polynomial in the one letter v, or null (another letter, a function, or text that is not a polynomial). */
function polyIn(text: string, v: string): Expr | null {
  let p: Expr
  try {
    p = parseExpr(text)
  } catch {
    return null
  }
  return varsOf(p).every((name) => name === v) ? p : null
}

/** An exact rational written as text ("5", "-2", "3/2", "0.25"), or null for anything else. */
export function ratOf(text: string): Rat | null {
  const m = /^([+-]?)(\d+)(?:\.(\d+))?(?:\/(\d+))?$/.exec(text.replace(/\s+/g, ''))
  if (!m) return null
  const den = m[4] === undefined ? 1n : BigInt(m[4])
  if (den === 0n) return null
  const frac = m[3] ?? ''
  const num = BigInt(m[2] + frac) * (m[1] === '-' ? -1n : 1n)
  return rat(num, den * 10n ** BigInt(frac.length))
}

/** A whole number as text, or null. */
function wholeOf(text: string): bigint | null {
  const r = ratOf(text)
  return r !== null && r.d === 1n ? r.n : null
}

/** A base an exponential may have: Euler's e, or a whole number from 2 to 1000 written in digits. */
function baseOf(text: string): string | null {
  if (text === 'e') return 'e'
  if (!/^\d+$/.test(text)) return null
  const b = BigInt(text)
  return b >= 2n && b <= 1000n ? text : null
}

/** The text inside the one bracket group that covers the whole text, or null when the brackets do not close at its end. */
function wholeGroup(text: string): string | null {
  if (text.length < 2 || text[0] !== '(' || text[text.length - 1] !== ')') return null
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')') {
      depth--
      if (depth === 0 && i < text.length - 1) return null
    }
    if (depth < 0) return null
  }
  return depth === 0 ? text.slice(1, -1) : null
}

/** The argument of a natural logarithm written ln(A) (readable form), or null. */
function lnArgOf(text: string): string | null {
  if (!text.startsWith('ln')) return null
  return wholeGroup(text.slice(2))
}

/** The argument of a base-10 logarithm written log(A) (readable form), or null. */
function log10ArgOf(text: string): string | null {
  if (!text.startsWith('log')) return null
  return wholeGroup(text.slice(3))
}

/**
 * The terms of one side, each with its sign: "2e^(x)-3" gives "2e^(x)" and "-3". Null when the brackets do not balance.
 * Only a plus or minus outside every bracket starts a new term, so the sign inside e^(-x) is never split.
 */
function termsOf(side: string): string[] | null {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < side.length; i++) {
    const ch = side[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (depth < 0) return null
    if ((ch === '+' || ch === '-') && depth === 0 && i > start) {
      out.push(side.slice(start, i))
      start = i
    }
  }
  if (depth !== 0) return null
  out.push(side.slice(start))
  return out
}

/**
 * One exponential term k·base^(v): "e^(x)", "2e^(x)", "3/2e^(x)" (base e), or "2^(x)", "3*2^(x)" (a whole base written in digits,
 * its multiplier with a star so "22^(x)" stays base 22). The exponent must be the letter v. Null for any other term.
 */
function atomTerm(term: string, v: string): { base: string; k: Rat } | null {
  const m =
    /^([+-]?)(?:(\d+(?:\/\d+)?)\*?)?(e)\^(?:\(([A-Za-z])\)|([A-Za-z]))$/.exec(term) ??
    /^([+-]?)(?:(\d+(?:\/\d+)?)\*)?(\d+)\^(?:\(([A-Za-z])\)|([A-Za-z]))$/.exec(term)
  if (!m) return null
  if ((m[4] ?? m[5]) !== v) return null
  const base = baseOf(m[3])
  if (base === null) return null
  const coef = m[2] === undefined ? rat(1n) : ratOf(m[2])
  if (coef === null || rIsZero(coef)) return null
  return { base, k: m[1] === '-' ? rNeg(coef) : coef }
}

/** The key a sum uses for the constant part. An exponential atom is keyed "base^v", so e^(x) is "e^x". */
const CONSTANT = ''

function addTo(map: Map<string, Rat>, key: string, value: Rat): void {
  map.set(key, rAdd(map.get(key) ?? R0, value))
}

/**
 * One side as a sum over its constant and each exponential atom. Null when a term is neither a rational nor one atom in v:
 * a side of any other shape is not read, so no move on it is claimed.
 */
function sumOf(side: string, v: string): Map<string, Rat> | null {
  const terms = termsOf(side)
  if (terms === null) return null
  const out = new Map<string, Rat>()
  for (const raw of terms) {
    const term = raw.startsWith('+') ? raw.slice(1) : raw
    const c = ratOf(term)
    if (c !== null) {
      addTo(out, CONSTANT, c)
      continue
    }
    const atom = atomTerm(term, v)
    if (atom === null) return null
    addTo(out, `${atom.base}^${v}`, atom.k)
  }
  return out
}

/** The sum without its zero entries, so two sums are equal exactly when they hold the same non-zero parts. */
function cleaned(map: Map<string, Rat>): Map<string, Rat> {
  const out = new Map<string, Rat>()
  for (const [key, value] of map) if (!rIsZero(value)) out.set(key, value)
  return out
}

function sameSum(a: Map<string, Rat>, b: Map<string, Rat>): boolean {
  const x = cleaned(a)
  const y = cleaned(b)
  if (x.size !== y.size) return false
  for (const [key, value] of x) {
    const other = y.get(key)
    if (other === undefined || !rEq(value, other)) return false
  }
  return true
}

function scaledSum(map: Map<string, Rat>, k: Rat): Map<string, Rat> {
  const out = new Map<string, Rat>()
  for (const [key, value] of map) out.set(key, rMul(value, k))
  return out
}

function plusSum(map: Map<string, Rat>, value: Rat): Map<string, Rat> {
  const out = new Map<string, Rat>(map)
  addTo(out, CONSTANT, value)
  return out
}

/** The text of an exponential atom in v: "e^(x)" or "2^(x)". */
function atomText(base: string, v: string): string {
  return `${base}^(${v})`
}

/** The text of a coefficient times an atom: "e^(x)", "2e^(x)", "3/2e^(x)", "2^(x)", "3*2^(x)", "-2^(x)". */
export function atomWithCoefficient(base: string, k: Rat, v: string): string {
  if (rEq(k, rat(1n))) return atomText(base, v)
  if (rEq(k, rat(-1n))) return `-${atomText(base, v)}`
  if (base === 'e') return `${rStr(k)}e^(${v})`
  return `${rStr(k)}*${atomText(base, v)}`
}

/** A power equation read as k·base^(v) + d = c: the one atom, its multiplier, the constant beside it and the right side. */
export interface AffineExp {
  base: string
  k: Rat
  d: Rat
  c: Rat
  v: string
}

/**
 * Reads an equation of the shape k·base^(x) + d = c, where base is e or a whole number and the exponent is the letter x
 * alone. Null for anything else (two atoms, another exponent, a non-rational constant, a letter outside the power).
 */
export function affineExpOf(text: string, v: string): AffineExp | null {
  const sd = sidesOf(text)
  if (!sd) return null
  const L = sumOf(sd.left, v)
  const c = ratOf(sd.right)
  if (L === null || c === null) return null
  const cleanL = cleaned(L)
  const atoms = [...cleanL.keys()].filter((key) => key !== CONSTANT)
  if (atoms.length !== 1) return null
  const key = atoms[0]
  const base = key.slice(0, key.lastIndexOf('^'))
  return { base, k: cleanL.get(key) ?? R0, d: cleanL.get(CONSTANT) ?? R0, c, v }
}

/** Whether a text holds an exponential atom in v, such as e^(x) or 2^(x). Used to route a move to the exact checks below. */
export function hasExpAtom(text: string, v: string): boolean {
  const s = readableText(text)
  return s !== null && new RegExp(`(?:^|[^A-Za-z])(?:\\d+\\*?)?(e|\\d+)\\^\\(?${v}\\)?`).test(s)
}

/** The LaTeX of a logarithm answer: \ln(c) for base e, or \frac{\ln(c)}{\ln(b)} for a whole base b. */
export function rootTex(base: string, c: Rat): string {
  return base === 'e' ? `\\ln(${rStr(c)})` : `\\frac{\\ln(${rStr(c)})}{\\ln(${base})}`
}

/** The whole equation a log root is written as: x = ln 5, or x = ln 12 / ln 5. */
function rootLine(v: string, base: string, c: Rat): string {
  return `${v}=${rootTex(base, c)}`
}

/** e raised to a whole number, as the text the moves write: e^{2}, e^{-1}. */
export function expTex(c: bigint): string {
  return `e^{${c.toString()}}`
}

// ---------------------------------------------------------------------------------------------------------
// Moves on an exponential equation
// ---------------------------------------------------------------------------------------------------------

/**
 * A move that adds, subtracts, multiplies or divides both sides by a rational, where a side may hold an exponential atom.
 * Each side after is compared with the exact result of the move (sums of atoms and constants), so the atom is never read as a
 * number. Other ops are not claimed here.
 */
function checkAtomMove(before: string, after: string, op: { kind: string; term?: string; k?: string }, v: string): ValidationVerdict {
  const b = sidesOf(before)
  const a = sidesOf(after)
  if (!b || !a) return 'unknown'
  const Lb = sumOf(b.left, v)
  const Rb = sumOf(b.right, v)
  const La = sumOf(a.left, v)
  const Ra = sumOf(a.right, v)
  if (!Lb || !Rb || !La || !Ra) return 'unknown'
  const verdict = (ok: boolean): ValidationVerdict => (ok ? 'valid' : 'invalid')
  switch (op.kind) {
    case 'add-both':
    case 'subtract-both': {
      const t = ratOf(op.term ?? '')
      if (t === null) return 'unknown'
      const s = op.kind === 'add-both' ? t : rNeg(t)
      return verdict(sameSum(La, plusSum(Lb, s)) && sameSum(Ra, plusSum(Rb, s)))
    }
    case 'multiply-both': {
      const k = ratOf(op.k ?? '')
      if (k === null || rIsZero(k)) return 'unknown'
      return verdict(sameSum(La, scaledSum(Lb, k)) && sameSum(Ra, scaledSum(Rb, k)))
    }
    case 'divide-both': {
      const k = ratOf(op.k ?? '')
      if (k === null || rIsZero(k)) return 'unknown'
      return verdict(sameSum(Lb, scaledSum(La, k)) && sameSum(Rb, scaledSum(Ra, k)))
    }
    default:
      return 'unknown'
  }
}

/**
 * exp-to-log: base^(x) = c becomes x = ln c (base e) or x = ln c / ln b (a whole base b), for c above 0. The two are equivalent
 * because the power of a positive base is positive and its logarithm undoes it: b^x = c exactly when x = log_b c.
 */
function checkExpToLog(before: string, after: string, op: { base: string }, v: string): ValidationVerdict {
  const b = sidesOf(before)
  const a = sidesOf(after)
  if (!b || !a) return 'unknown'
  const L = sumOf(b.left, v)
  const c = ratOf(b.right)
  if (L === null || c === null) return 'unknown'
  const cleanL = cleaned(L)
  const keys = [...cleanL.keys()]
  if (keys.length !== 1 || keys[0] === CONSTANT || !rEq(cleanL.get(keys[0]) ?? R0, rat(1n))) return 'invalid'
  const base = keys[0].slice(0, keys[0].lastIndexOf('^'))
  if (base !== op.base || rIsNeg(c) || rIsZero(c)) return 'invalid'
  return sameMaths(after, rootLine(v, base, c)) ? 'valid' : 'invalid'
}

/**
 * log-to-exp: ln(A) = c becomes A = e^(c), for a whole number c. Exact: ln A = c exactly when A = e^c, since e^c is positive
 * and the natural logarithm is its inverse on the positive numbers.
 */
function checkLogToExp(before: string, after: string, v: string): ValidationVerdict {
  const b = sidesOf(before)
  const a = sidesOf(after)
  if (!b || !a) return 'unknown'
  const arg = lnArgOf(b.left)
  const c = wholeOf(b.right)
  if (arg === null || c === null || c > BigInt(MAX_EXP_POWER) || c < -BigInt(MAX_EXP_POWER)) return 'unknown'
  const A = polyIn(arg, v)
  const P = polyIn(a.left, v)
  if (!A || !P) return 'unknown'
  if (!eEq(A, P)) return 'invalid'
  return sameMaths(a.right, expTex(c)) ? 'valid' : 'invalid'
}

/** work-out-exp: the left side is kept and e^(0) becomes 1. */
function checkWorkOutExp(before: string, after: string): ValidationVerdict {
  const b = sidesOf(before)
  const a = sidesOf(after)
  if (!b || !a) return 'unknown'
  if (b.left !== a.left) return 'invalid'
  return sameMaths(b.right, expTex(0n)) && sameMaths(a.right, '1') ? 'valid' : 'invalid'
}

/** The exact check of an exponential or logarithmic move this module writes (see the EquationOp kinds in types.ts). */
export function checkExpRootOp(
  before: string,
  after: string,
  op: { kind: string; base?: string; term?: string; k?: string },
  v: string
): ValidationVerdict {
  switch (op.kind) {
    case 'exp-to-log':
      return op.base === undefined ? 'unknown' : checkExpToLog(before, after, { base: op.base }, v)
    case 'log-to-exp':
      return checkLogToExp(before, after, v)
    case 'work-out-exp':
      return checkWorkOutExp(before, after)
    case 'add-both':
    case 'subtract-both':
    case 'multiply-both':
    case 'divide-both':
      return checkAtomMove(before, after, op, v)
    default:
      return 'unknown'
  }
}

// ---------------------------------------------------------------------------------------------------------
// Sums of two base-10 logarithms
// ---------------------------------------------------------------------------------------------------------

/** log(A) + log(B) = c, base 10, with c a whole number from 0 to MAX_EXP_POWER. */
interface LogSum {
  args: string[]
  c: bigint
}

/** The two terms of a sum, split on a plus outside every bracket. Null when the sum has a minus or a bracket that does not close. */
function plusTermsOf(side: string): string[] | null {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < side.length; i++) {
    const ch = side[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (depth < 0) return null
    if (ch === '+' && depth === 0) {
      out.push(side.slice(start, i))
      start = i + 1
    }
  }
  if (depth !== 0) return null
  out.push(side.slice(start))
  return out
}

/** The two base-10 logarithms of an equation log(A) + log(B) = c, or null for any other shape. */
export function logSumOf(text: string): LogSum | null {
  const sd = sidesOf(text)
  if (!sd) return null
  const terms = plusTermsOf(sd.left)
  if (terms === null || terms.length !== 2) return null
  const args: string[] = []
  for (const t of terms) {
    const arg = log10ArgOf(t)
    if (arg === null) return null
    args.push(arg)
  }
  const c = wholeOf(sd.right)
  if (c === null || c < 0n || c > BigInt(MAX_EXP_POWER)) return null
  return { args, c }
}

/** The one base-10 logarithm of log(P) = c, or null. */
function singleLogOf(text: string): { arg: string; c: bigint } | null {
  const sd = sidesOf(text)
  if (!sd) return null
  const arg = log10ArgOf(sd.left)
  const c = wholeOf(sd.right)
  if (arg === null || c === null) return null
  return { arg, c }
}

/** The one letter the logarithm sum is written in, or null when it uses none or more than one. */
function logSumLetter(sum: LogSum): string | null {
  const letters = [...new Set(sum.args.join('').match(/[A-Za-z]/g) ?? [])]
  return letters.length === 1 ? letters[0] : null
}

/**
 * The one letter an exponential or logarithmic equation is written in, or null when it has none or more than one. The base e
 * and the ln of a logarithm are not letters of the unknown, so they are taken out first.
 */
export function unknownLetter(text: string): string | null {
  const s = readableText(text)
  if (s === null) return null
  const letters = [...new Set(s.replace(/ln/g, '').replace(/e(?=\^)/g, '').match(/[A-Za-z]/g) ?? [])]
  return letters.length === 1 ? letters[0] : null
}

/** A natural logarithm equation ln(A) = c for a whole number c, where A is a polynomial in v that is not a constant; or null. */
export function lnEquationOf(text: string, v: string): { arg: string; c: bigint } | null {
  const sd = sidesOf(text)
  if (!sd) return null
  const arg = lnArgOf(sd.left)
  const c = wholeOf(sd.right)
  if (arg === null || c === null || c > BigInt(MAX_EXP_POWER) || c < -BigInt(MAX_EXP_POWER)) return null
  const A = polyIn(arg, v)
  if (A === null || exprDegree(A) < 1) return null
  return { arg, c }
}

/** Whether a positive rational is an exact whole power of a whole base, from b^1 up to b^MAX_EXP_POWER. */
export function isExactPowerOf(base: bigint, c: Rat): boolean {
  if (c.d !== 1n || c.n < 1n) return false
  let rest = c.n
  let n = 0
  while (rest % base === 0n) {
    rest /= base
    n++
    if (n > MAX_EXP_POWER) return false
  }
  return rest === 1n && n >= 1
}

/** The value of a polynomial text at a rational, or null when the text is not a polynomial in v. */
export function valueAt(text: string, v: string, r: Rat): Rat | null {
  const p = polyIn(text, v)
  return p === null ? null : evalAt(p, { [v]: r })
}

/** The declared arguments of a domain step equal the typed logarithms' arguments, as polynomials. */
function sameArg(declared: string, typed: string, v: string): boolean {
  const x = polyIn(declared, v)
  const y = polyIn(typed, v)
  return x !== null && y !== null && eEq(x, y)
}

/**
 * log-domain: the step states the typed arguments, and the equation is unchanged (an implication that adds nothing).
 * The arguments it names must be the arguments of the typed logarithms, in order.
 */
function checkLogDomain(before: string, after: string, args: string[], v: string): ValidationVerdict {
  const sum = logSumOf(before)
  if (!sum) return 'unknown'
  if (args.length !== sum.args.length || !args.every((d, i) => sameArg(d, sum.args[i], v))) return 'invalid'
  return sameMaths(before, after) ? 'valid' : 'invalid'
}

/**
 * join-logs: log(A) + log(B) = c becomes log(P) = c, where P is exactly A times B. This is a forward step (every solution of
 * the first equation solves the second); the domain step has already named A > 0 and B > 0, and the ending checks each root.
 */
function checkJoinLogs(before: string, after: string, args: string[], v: string): ValidationVerdict {
  const sum = logSumOf(before)
  const single = singleLogOf(after)
  if (!sum || !single) return 'unknown'
  if (args.length !== sum.args.length || !args.every((d, i) => sameArg(d, sum.args[i], v))) return 'invalid'
  if (single.c !== sum.c) return 'invalid'
  const A = polyIn(sum.args[0], v)
  const B = polyIn(sum.args[1], v)
  const P = polyIn(single.arg, v)
  if (!A || !B || !P) return 'unknown'
  return eEq(P, eMul(A, B)) ? 'valid' : 'invalid'
}

/** The two implication steps of a logarithm sum: log-domain and join-logs (see checkLogDomain and checkJoinLogs). */
export function checkLogImplication(before: string, after: string, payload: Record<string, unknown>): ValidationVerdict | null {
  const v = typeof payload.variable === 'string' ? payload.variable : null
  if (v === null) return 'invalid'
  const args = Array.isArray(payload.args) ? payload.args.map((x) => String(x)) : null
  if (args === null) return 'invalid'
  if (payload.action === 'log-domain') return checkLogDomain(before, after, args, v)
  if (payload.action === 'join-logs') return checkJoinLogs(before, after, args, v)
  return null
}

/** The real roots of a polynomial of degree 1 or 2 with rational roots, or null when a root is not rational (not proved here). */
function rationalRootsOf(Q: Expr, v: string): Rat[] | null {
  if (Q.some((t) => Object.keys(t.v).some((name) => name !== v))) return null
  if (exprDegree(Q) > 2) return null
  const coef: Rat[] = [R0, R0, R0]
  for (const t of Q) {
    const p = t.v[v] ?? 0
    coef[p] = rAdd(coef[p], t.c)
  }
  const [c0, c1, c2] = coef
  if (rIsZero(c2)) {
    if (!rIsZero(c1)) return [rDiv(rNeg(c0), c1)]
    return rIsZero(c0) ? null : []
  }
  const disc = rSub(rMul(c1, c1), rMul(rat(4n), rMul(c2, c0)))
  if (rIsNeg(disc)) return []
  const s = rSqrt(disc)
  if (s === null) return null
  const twoA = rMul(rat(2n), c2)
  const r1 = rDiv(rAdd(rNeg(c1), s), twoA)
  const r2 = rDiv(rSub(rNeg(c1), s), twoA)
  return rEq(r1, r2) ? [r1] : [r1, r2].sort(rCmp)
}

/**
 * The ending of a logarithm sum (logSum.ts). The state is the polynomial equation the working solved, which must be exactly
 * A·B = 10^c (so it came from the typed equation). Its real roots are all listed: each kept root is one where every
 * logarithm takes a positive number and the sum is c, and each rejected root has a logarithm of a number not above 0.
 * The displayed ending is the kept roots, or "no value of x works" when none is kept.
 */
export function checkLogSumEnding(
  original: string,
  state: string,
  kept: string[],
  rejected: string[],
  v: string,
  after: string
): ValidationVerdict {
  const sum = logSumOf(original)
  if (!sum || sum.args.length !== 2) return 'unknown'
  const A = polyIn(sum.args[0], v)
  const B = polyIn(sum.args[1], v)
  if (!A || !B) return 'unknown'
  const Q = eSub(eMul(A, B), constExpr(rat(10n ** sum.c)))
  const st = sidesOf(state)
  if (!st) return 'invalid'
  const L = polyIn(st.left, v)
  const R = polyIn(st.right, v)
  if (!L || !R) return 'unknown'
  if (!eEq(eSub(L, R), Q)) return 'invalid'
  const roots = rationalRootsOf(Q, v)
  if (roots === null) return 'unknown'

  const keptValues: Rat[] = []
  for (const t of kept) {
    const r = ratOf(t)
    if (r === null) return 'unknown'
    if (keptValues.some((x) => rEq(x, r))) return 'invalid'
    keptValues.push(r)
  }
  const rejectedValues: Rat[] = []
  for (const t of rejected) {
    const r = ratOf(t)
    if (r === null) return 'unknown'
    if (keptValues.some((x) => rEq(x, r)) || rejectedValues.some((x) => rEq(x, r))) return 'invalid'
    rejectedValues.push(r)
  }
  const listed = [...keptValues, ...rejectedValues].sort(rCmp)
  if (listed.length !== roots.length || !listed.every((r, i) => rEq(r, roots[i]))) return 'invalid'

  for (const r of keptValues) {
    if (rSign(evalAt(A, { [v]: r })) <= 0 || rSign(evalAt(B, { [v]: r })) <= 0) return 'invalid'
  }
  for (const r of rejectedValues) {
    if (rSign(evalAt(A, { [v]: r })) > 0 && rSign(evalAt(B, { [v]: r })) > 0) return 'invalid'
  }
  if (keptValues.some((x, i) => i > 0 && rCmp(keptValues[i - 1], x) >= 0)) return 'invalid'

  const expected =
    keptValues.length === 0
      ? `\\text{no value of ${v} works}`
      : keptValues.map((r) => `${v} = ${rTex(r)}`).join(' \\text{ or } ')
  return after.replace(/\s+/g, '') === expected.replace(/\s+/g, '') ? 'valid' : 'invalid'
}

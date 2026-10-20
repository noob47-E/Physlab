// Equations with a square root (Part R): the exact reading, checks and wording of a root of a polynomial in the one letter.
//
// Inside these checks each root is a placeholder letter standing for sqrt(P), with P a polynomial in the letter. Two roots
// are the same root when their radicands are the same polynomial, so sqrt(x + 1) written two ways is one root. A root may
// only appear to the first power, with coefficient kept as written, and at most one per side of a product, so every
// reading is an exact polynomial in the letter and the roots. Every decision is exact: rational polynomial arithmetic, and
// G2's exact square roots of rationals. Whatever cannot be decided exactly is 'unknown', and an unknown step is never shown.
//
// Only the radical steps reach this file: check-adapter.ts, validate.ts and sentences.ts call it when a step's text holds a
// square root of the letter, so a polynomial step keeps its own checks.

import type { Step, StepAnswer, EquationOp, ValidationVerdict } from './types'
import { eAdd, eEq, eMul, eSub, evalAt, exprDegree, normalize, parseExpr, varsOf, type Expr, type Term } from '../pure/mono'
import { R0, R1, rAbs, rAdd, rCmp, rDiv, rEq, rIsNeg, rIsZero, rMul, rPow, rat, type Rat } from '../pure/rat'
import { algAdd, algEq, algIsReal, algMul, algRat, algSqrtRational, type Alg } from '../check/field'
import { polyRootsCheck } from '../check/checkers'
import { latexToMath } from '../latexToMath'

/** The letters a root may stand for: none is a number or a constant that mathjs reads (e, E, i, pi). */
const ROOT_LETTERS = 'ABCDFGHJKLMNOPQRSTUVWXYZ'

/** The text a reading refuses: a root or a shape this file does not decide. Caught by each entry point, which says unknown. */
class Refused extends Error {}

/** The text of a step or an input as plain mathjs-style maths: a LaTeX line is read through the shared converter. */
function plainOf(input: string): string {
  const text = input.trim()
  return text.includes('\\') ? latexToMath(text).trim() : text
}

/** A canonical key for a polynomial, so that the same radicand always gets the same placeholder letter. */
function keyOf(e: Expr): string {
  return normalize(e)
    .map((t) => `${t.c.n}/${t.c.d}:${Object.keys(t.v).filter((k) => t.v[k] !== 0).sort().map((k) => `${k}^${t.v[k]}`).join(',')}`)
    .sort()
    .join(' ')
}

/** The radicands of one equation, each with the placeholder letter that stands for its root. */
export class RadicalRegistry {
  /** The variable the radicands are polynomials in. */
  readonly v: string
  /** The radicand of each root, in the order the roots were met. */
  readonly radicands: Expr[] = []
  /** The placeholder letter of each root (the same order as radicands). */
  readonly letters: string[] = []

  constructor(v: string) {
    this.v = v
  }

  /** The placeholder letter of the root sqrt(p): an existing one for the same radicand, else a new letter. */
  letterFor(p: Expr): string {
    const key = keyOf(p)
    const found = this.radicands.findIndex((q) => keyOf(q) === key)
    if (found >= 0) return this.letters[found]
    const letter = [...ROOT_LETTERS].find((l) => l !== this.v && !this.letters.includes(l))
    if (letter === undefined) throw new Refused('too many roots in one equation')
    this.radicands.push(p)
    this.letters.push(letter)
    return letter
  }

  /** The index of the root a placeholder letter stands for, or -1 when it is no root of this registry. */
  indexOf(name: string): number {
    return this.letters.indexOf(name)
  }
}

/** The index of the root in a term, or null when the term has no root. */
export function rootIndexOf(t: Term, reg: RadicalRegistry | undefined): number | null {
  if (!reg) return null
  for (const name of Object.keys(t.v)) {
    if (name !== reg.v && t.v[name] !== 0) {
      const idx = reg.indexOf(name)
      if (idx >= 0) return idx
    }
  }
  return null
}

/** The same lookup under the name this file uses inside itself. */
const rootOf = rootIndexOf

/** How many terms of a side hold a root. */
function rootTermCount(e: Expr, reg: RadicalRegistry): number {
  return e.filter((t) => rootOf(t, reg) !== null).length
}

/** A polynomial in v alone, read by the shared reader. Any other letter, or a root, is refused. */
function readPoly(text: string, v: string): Expr {
  const e = parseExpr(text)
  if (varsOf(e).some((name) => name !== v)) throw new Refused('another letter')
  return e
}

/** The text with each square root of a polynomial in v replaced by its placeholder letter in brackets. */
function rootsOut(text: string, v: string, reg: RadicalRegistry): string {
  let out = ''
  let i = 0
  for (;;) {
    const at = text.indexOf('sqrt(', i)
    if (at < 0) return out + text.slice(i)
    out += text.slice(i, at)
    const open = at + 4
    let depth = 0
    let close = -1
    for (let k = open; k < text.length; k++) {
      if (text[k] === '(') depth++
      else if (text[k] === ')') {
        depth--
        if (depth === 0) {
          close = k
          break
        }
      }
    }
    if (close < 0) throw new Refused('a root is not closed')
    const inside = text.slice(open + 1, close)
    if (inside.includes('sqrt')) throw new Refused('a root inside a root')
    const radicand = readPoly(inside, v)
    if (!varsOf(radicand).includes(v)) throw new Refused('a root of a number')
    out += `(${reg.letterFor(radicand)})`
    i = close + 1
  }
}

/** One side of an equation with its roots: each root to the first power, at most one in a product. */
function readSide(text: string, v: string, reg: RadicalRegistry): Expr {
  const e = parseExpr(rootsOut(text, v, reg))
  for (const t of e) {
    let roots = 0
    for (const name of Object.keys(t.v)) {
      const p = t.v[name]
      if (p === 0 || name === v) continue
      if (reg.indexOf(name) < 0 || p !== 1) throw new Refused('a root used in a way this does not check')
      roots++
    }
    if (roots > 1) throw new Refused('two roots multiplied')
  }
  if (varsOf(e).some((name) => name !== v && reg.indexOf(name) < 0)) throw new Refused('another letter')
  return e
}

/** An equation with a root: both sides read in one registry. */
export interface RadicalEquation {
  v: string
  reg: RadicalRegistry
  L: Expr
  R: Expr
}

/** The equation "L = R" of a text, both sides read with their roots, or null when this file does not read it. */
export function readRadicalEquation(input: string, v: string, reg: RadicalRegistry): RadicalEquation | null {
  try {
    const parts = plainOf(input).split('=')
    if (parts.length !== 2 || parts[0].trim() === '' || parts[1].trim() === '') return null
    const L = readSide(parts[0], v, reg)
    const R = readSide(parts[1], v, reg)
    return { v, reg, L, R }
  } catch {
    return null
  }
}

/**
 * The one letter of an equation that holds a square root of it, or null. An equation with no root, a root of a number,
 * or more than one letter is not a radical equation of this file.
 */
export function radicalVarOf(input: string): string | null {
  try {
    const text = plainOf(input)
    if (!text.includes('sqrt(')) return null
    const letters = new Set(text.replace(/sqrt/g, '').match(/[A-Za-z]/g) ?? [])
    if (letters.size !== 1) return null
    const v = [...letters][0]
    const reg = new RadicalRegistry(v)
    const eq = readRadicalEquation(text, v, reg)
    return eq !== null && reg.radicands.length > 0 ? v : null
  } catch {
    return null
  }
}

/** A rational as the checks and the answers write it: "3", "-1/2" (ASCII minus). */
export function ratValue(r: Rat): string {
  return r.d === 1n ? String(r.n) : `${r.n}/${r.d}`
}

/** A rational for a student: "3", "−1/2" (typographic minus). */
function ratPretty(r: Rat): string {
  return ratValue(r).replace('-', '−')
}

/** A rational written as the checks read it, or null: "3", "-1/2", "\frac{-1}{2}". */
function parseRatText(text: string): Rat | null {
  const t = text.replace(/−/g, '-').replace(/\\frac\{(-?\d+)\}\{(\d+)\}/g, '$1/$2').replace(/\s+/g, '')
  const m = /^(-?)(\d+)(?:\/(\d+))?$/.exec(t)
  if (!m) return null
  const den = m[3] === undefined ? 1n : BigInt(m[3])
  if (den === 0n) return null
  const num = BigInt(m[2]) * (m[1] === '-' ? -1n : 1n)
  return rat(num, den)
}

/** A real number of the form a + b√d for a student: "3", "−1/2", "√11", "1 + √2". Null for a complex number. */
function prettyReal(x: Alg): string | null {
  if (!algIsReal(x)) return null
  if (rIsZero(x.b)) return ratPretty(x.a)
  const coef = rAbs(x.b)
  const root = `${coef.n === 1n && coef.d === 1n ? '' : coef.d === 1n ? `${coef.n}` : `(${coef.n}/${coef.d})`}√${x.d}`
  if (rIsZero(x.a)) return `${rIsNeg(x.b) ? '−' : ''}${root}`
  return `${ratPretty(x.a)} ${rIsNeg(x.b) ? '−' : '+'} ${root}`
}

/** A non-negative coefficient as written inside a term: "2", "(1/2)". */
function coefText(c: Rat): string {
  return c.d === 1n ? c.n.toString() : `(${c.n}/${c.d})`
}

/** The body of one term, with its sign taken off: "2x^2", "x", "3", "2\sqrt{x + 1}". */
function termBody(t: Term, v: string, reg: RadicalRegistry | undefined): string {
  const c = rAbs(t.c)
  const idx = rootOf(t, reg)
  if (idx !== null && reg) {
    const rad = `\\sqrt{${writeSide(reg.radicands[idx], v)}}`
    return c.n === 1n && c.d === 1n ? rad : `${coefText(c)}${rad}`
  }
  const p = t.v[v] ?? 0
  const body = p === 0 ? '' : p === 1 ? v : `${v}^${p}`
  if (body === '') return coefText(c)
  return c.n === 1n && c.d === 1n ? body : `${coefText(c)}${body}`
}

/**
 * One side as text in the form the checks read back: roots first (as \sqrt{...}), then the powers of the letter from the
 * highest down, each term signed. "x - 2", "\sqrt{x}", "2x^2 - 3x + 1", "-x + 3".
 */
export function writeSide(e: Expr, v: string, reg?: RadicalRegistry): string {
  const terms = normalize(e).filter((t) => !rIsZero(t.c))
  if (terms.length === 0) return '0'
  const rank = (t: Term): number => (rootOf(t, reg) !== null ? 1000 : 0) + (t.v[v] ?? 0)
  const sorted = [...terms].sort((a, b) => rank(b) - rank(a))
  let out = ''
  sorted.forEach((t, i) => {
    const neg = t.c.n < 0n
    const body = termBody(t, v, reg)
    if (i === 0) out += `${neg ? '-' : ''}${body}`
    else out += `${neg ? ' - ' : ' + '}${body}`
  })
  return out
}

/** The value of a side at a rational point: a real value, or the radicand that is negative there. */
type SideValue ={ kind: 'value'; value: Alg } | { kind: 'negative'; radicand: Rat }

/**
 * A side at a rational point, exactly. A root of a negative number is not a real number, so it is reported as the
 * negative radicand instead of a value. Null when the exact arithmetic does not hold.
 */
function sideValueAt(e: Expr, reg: RadicalRegistry, r: Rat): SideValue | null {
  try {
    let total: Alg = algRat(R0)
    for (const t of e) {
      let coef = t.c
      const p = t.v[reg.v] ?? 0
      if (p !== 0) coef = rMul(coef, rPow(r, p))
      let part: Alg = algRat(R1)
      const idx = rootOf(t, reg)
      if (idx !== null) {
        const q = evalAt(reg.radicands[idx], { [reg.v]: r })
        if (rIsNeg(q)) return { kind: 'negative', radicand: q }
        part = rIsZero(q) ? algRat(R0) : algMul(part, algSqrtRational(q))
      }
      total = algAdd(total, algMul(algRat(coef), part))
    }
    return { kind: 'value', value: total }
  } catch {
    return null
  }
}

/** One candidate root put back into the original equation: holds, does not, or has a root of a negative number. */
interface CandidateCheck {
  ok: boolean
  left?: string
  right?: string
  under?: string
}

/** The candidate r put back into the equation, exactly; null when the arithmetic does not decide it. */
export function checkCandidate(eq: RadicalEquation, r: Rat): CandidateCheck | null {
  try {
    const l = sideValueAt(eq.L, eq.reg, r)
    const rr = sideValueAt(eq.R, eq.reg, r)
    if (l === null || rr === null) return null
    if (l.kind === 'negative') return { ok: false, under: ratPretty(l.radicand) }
    if (rr.kind === 'negative') return { ok: false, under: ratPretty(rr.radicand) }
    const left = prettyReal(l.value)
    const right = prettyReal(rr.value)
    if (left === null || right === null) return null
    return { ok: algEq(l.value, rr.value), left, right }
  } catch {
    return null
  }
}

/** The square of a side, as a polynomial: a root squares to its radicand, a root-free side to its product with itself. */
function squareOf(e: Expr, reg: RadicalRegistry): Expr | null {
  const roots = e.filter((t) => rootOf(t, reg) !== null)
  if (roots.length === 0) return eMul(e, e)
  if (e.length === 1 && roots.length === 1 && rEq(e[0].c, R1) && Object.keys(e[0].v).filter((k) => e[0].v[k] !== 0).length === 1) {
    const idx = rootOf(e[0], reg)
    return idx === null ? null : reg.radicands[idx]
  }
  return null
}

/** The move of an EquationEquiv step, checked on the two equations with their roots. */
export function radicalCheckOp(before: string, after: string, op: EquationOp, v: string): ValidationVerdict {
  try {
    const reg = new RadicalRegistry(v)
    const b = readRadicalEquation(before, v, reg)
    const a = readRadicalEquation(after, v, reg)
    if (b === null || a === null) return 'unknown'
    if (op.kind === 'swap') return eEq(a.L, b.R) && eEq(a.R, b.L) ? 'valid' : 'invalid'
    if (op.kind !== 'add-both' && op.kind !== 'subtract-both') return 'unknown'
    const term = parseExpr(op.term)
    if (varsOf(term).some((name) => name !== v)) return 'unknown'
    const shift = (e: Expr): Expr => (op.kind === 'add-both' ? eAdd(e, term) : eSub(e, term))
    return eEq(a.L, shift(b.L)) && eEq(a.R, shift(b.R)) ? 'valid' : 'invalid'
  } catch {
    return 'unknown'
  }
}

/**
 * The squaring move: the before's sides, squared, are the after's sides. A root squares to its radicand (the one rule the
 * move uses: sqrt(P) squared is P, for P not negative, which holds wherever the root is real), and a root-free side squares
 * to its own square. The after may hold no root.
 */
export function radicalCheckSquare(before: string, after: string, v: string): ValidationVerdict {
  try {
    const reg = new RadicalRegistry(v)
    const b = readRadicalEquation(before, v, reg)
    const a = readRadicalEquation(after, v, reg)
    if (b === null || a === null) return 'unknown'
    if (rootTermCount(a.L, reg) + rootTermCount(a.R, reg) > 0) return 'invalid'
    const L = squareOf(b.L, reg)
    const R = squareOf(b.R, reg)
    if (L === null || R === null) return 'unknown'
    return eEq(a.L, L) && eEq(a.R, R) ? 'valid' : 'invalid'
  } catch {
    return 'unknown'
  }
}

/** The data a radical roots step carries (the SolutionSetEq of a radical working). */
export interface RadicalRootCheck {
  value: string
  ok: boolean
  left?: string
  right?: string
  under?: string
}

interface RadicalRootsData {
  radical: true
  variable: string
  /** The equation as typed, with its roots (LaTeX). The working's input must be this same equation. */
  original: string
  /** The roots that hold in the original equation, in order, as the displayed answer lists them. */
  solutions: string[]
  /** Every root of the squared equation, each put back into the original. */
  checks: RadicalRootCheck[]
  /** True for an equation whose root is set equal to a negative number: no solution, and nothing is squared. */
  negative?: boolean
}

/** The roots data of a step, or null when the step carries none of the right shape. */
export function readRootsData(step: Step | { data?: unknown }): RadicalRootsData | null {
  const d = step.data as Record<string, unknown> | undefined
  if (!d || typeof d !== 'object' || d.radical !== true) return null
  if (typeof d.variable !== 'string' || typeof d.original !== 'string') return null
  if (!Array.isArray(d.solutions) || !d.solutions.every((s) => typeof s === 'string')) return null
  if (!Array.isArray(d.checks)) return null
  const checks: RadicalRootCheck[] = []
  for (const c of d.checks as unknown[]) {
    if (!c || typeof c !== 'object') return null
    const o = c as Record<string, unknown>
    if (typeof o.value !== 'string' || typeof o.ok !== 'boolean') return null
    for (const key of ['left', 'right', 'under']) {
      if (o[key] !== undefined && typeof o[key] !== 'string') return null
    }
    checks.push({
      value: o.value,
      ok: o.ok,
      ...(typeof o.left === 'string' ? { left: o.left } : {}),
      ...(typeof o.right === 'string' ? { right: o.right } : {}),
      ...(typeof o.under === 'string' ? { under: o.under } : {})
    })
  }
  if (d.negative !== undefined && typeof d.negative !== 'boolean') return null
  return {
    radical: true,
    variable: d.variable,
    original: d.original,
    solutions: d.solutions as string[],
    checks,
    negative: d.negative === true
  }
}

/** Whitespace removed, so a displayed line and its expected text compare as one. */
function squeeze(text: string): string {
  return text.replace(/\s+/g, '')
}

/**
 * The check of a radical roots step, exact. The squared equation (the step's before, a polynomial) must have exactly the roots
 * the step lists (G2 decides completeness in the real numbers); each root must be put back into the original equation with the
 * verdict and the words the step gives; the answer must be the roots that hold. A negative root is "no solution" with no
 * squaring: the before is a root alone equal to a negative number.
 */
export function radicalRootsCheck(step: Step): ValidationVerdict {
  try {
    const data = readRootsData(step)
    if (data === null) return 'invalid'
    const v = data.variable
    if (!/^[A-Za-z]$/.test(v) || typeof step.before !== 'string' || typeof step.after !== 'string') return 'invalid'
    if (data.negative) return negativeCheck(step, data, v)
    return rootsCheck(step, data, v)
  } catch {
    return 'unknown'
  }
}

/** sqrt(P) = c with c below zero: no solution, since a square root is never negative. */
function negativeCheck(step: Step, data: RadicalRootsData, v: string): ValidationVerdict {
  if (data.checks.length !== 0 || data.solutions.length !== 0) return 'invalid'
  const reg = new RadicalRegistry(v)
  const eq = readRadicalEquation(String(step.before), v, reg)
  if (eq === null) return 'invalid'
  const L = eq.L
  const isRootAlone = L.length === 1 && rEq(L[0].c, R1) && rootOf(L[0], reg) !== null
  const constant = eq.R.every((t) => Object.keys(t.v).filter((k) => t.v[k] !== 0).length === 0)
  if (!isRootAlone || !constant || eq.R.length > 1) return 'invalid'
  const c = eq.R.length === 0 ? R0 : eq.R[0].c
  if (!rIsNeg(c)) return 'invalid'
  return squeeze(String(step.after)) === squeeze('\\text{No real solution}') ? 'valid' : 'invalid'
}

/** The squared equation's roots, each put back into the original equation, and the answer. */
function rootsCheck(step: Step, data: RadicalRootsData, v: string): ValidationVerdict {
  const sqReg = new RadicalRegistry(v)
  const sq = readRadicalEquation(String(step.before), v, sqReg)
  if (sq === null || sqReg.radicands.length > 0) return 'invalid'
  const D = eSub(sq.L, sq.R)
  const deg = exprDegree(D)
  if (deg < 1) return 'invalid'
  const roots: Rat[] = []
  for (const c of data.checks) {
    const r = parseRatText(c.value)
    if (r === null) return 'unknown'
    roots.push(r)
  }
  if (deg === 1) {
    // One linear equation has one root, and it is -a0/a1.
    const a1 = D.filter((t) => (t.v[v] ?? 0) === 1).reduce((s, t) => rAdd(s, t.c), R0)
    const a0 = D.filter((t) => (t.v[v] ?? 0) === 0).reduce((s, t) => rAdd(s, t.c), R0)
    if (rIsZero(a1)) return 'invalid'
    const root = rDiv(rMul(a0, rat(-1n)), a1)
    if (roots.length !== 1 || !rEq(roots[0], root)) return 'invalid'
  } else {
    const verdict = polyRootsCheck(
      plainOf(String(step.before)),
      data.checks.map((c) => ({ value: c.value, multiplicity: 1 })),
      'real'
    )
    if (verdict === 'different') return 'invalid'
    if (verdict !== 'equal') return 'unknown'
  }
  const origReg = new RadicalRegistry(v)
  const orig = readRadicalEquation(data.original, v, origReg)
  if (orig === null || origReg.radicands.length === 0) return 'invalid'
  for (let i = 0; i < data.checks.length; i++) {
    const c = data.checks[i]
    const res = checkCandidate(orig, roots[i])
    if (res === null) return 'unknown'
    if (res.ok !== c.ok) return 'invalid'
    if (res.under !== undefined) {
      if (c.under !== res.under || c.left !== undefined || c.right !== undefined) return 'invalid'
    } else if (c.under !== undefined || c.left !== res.left || c.right !== res.right) {
      return 'invalid'
    }
  }
  const accepted = data.checks.filter((c) => c.ok).map((c) => c.value)
  if (accepted.length !== data.solutions.length || accepted.some((s, i) => s !== data.solutions[i])) return 'invalid'
  const said = accepted.length === 0 ? '\\text{No real solution}' : accepted.map((x) => `${v} = ${x}`).join(' \\text{ or } ')
  return squeeze(String(step.after)) === squeeze(said) ? 'valid' : 'invalid'
}

/** The superscript digits a power is written with on screen, so no caret reaches a sentence. */
const RAISED_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹'

/** A plain equation for a sentence: "√(x² − 3) = −2". The powers are raised after the minus signs are set, so "x^(2) - 3" keeps its spacing. */
function plainEquation(text: string): string {
  return plainOf(text)
    .replace(/sqrt\(/g, '√(')
    .replace(/\s*=\s*/, ' = ')
    .replace(/([A-Za-z0-9)])\s*-\s*/g, '$1 − ')
    .replace(/-/g, '−')
    .replace(/\s*\+\s*/g, ' + ')
    .replace(/\*/g, '')
    .replace(/\^\(?(\d+)\)?/g, (_m, d: string) => [...d].map((c) => RAISED_DIGITS[Number(c)]).join(''))
    .replace(/\s+/g, ' ')
    .trim()
}

/** The roots of the squared equation as a student reads them: "4", "0 and 3", "1, 2 and 5". */
function rootsListText(values: string[]): string {
  const shown = values.map((x) => {
    const r = parseRatText(x)
    return r === null ? x : ratPretty(r)
  })
  if (shown.length <= 1) return shown.join('')
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
}

/** The sentence of one candidate: what it gives, and whether it is a solution. Null when the value is not a rational. */
function candidateSentence(v: string, c: RadicalRootCheck): string | null {
  const r = parseRatText(c.value)
  if (r === null) return null
  const x = `${v} = ${ratPretty(r)}`
  if (c.under !== undefined) return `${x} makes the number under the root ${c.under}, and a square root of a negative number is not real, so it is not a solution.`
  if (c.left === undefined || c.right === undefined) return null
  if (c.ok) return `${x} gives ${c.left} on both sides, so it is a solution.`
  return `${x} gives ${c.left} on the left but ${c.right} on the right, so it is not a solution.`
}

/** The sentence of a radical roots step, built from its data (sentences.ts asks for it). Null when the data does not give one. */
export function radicalRootsSentence(step: Step): string | null {
  const data = readRootsData(step)
  if (data === null) return null
  if (data.negative) return `A square root is never negative, so ${plainEquation(String(step.before))} has no solution.`
  if (data.checks.length === 0) return 'The squared equation has no real solution, so the equation has none.'
  const parts: string[] = []
  for (const c of data.checks) {
    const s = candidateSentence(data.variable, c)
    if (s === null) return null
    parts.push(s)
  }
  // The roots are worked out in the working that follows this step, so the sentence says so.
  const lead = `The squared equation has the roots ${rootsListText(data.checks.map((c) => c.value))}, worked out below. Put each back into the original equation.`
  return `${lead} ${parts.join(' ')}`
}

/** The rule chip of a radical roots step. */
export function radicalRootsRule(step: Step): string | null {
  const data = readRootsData(step)
  if (data === null) return null
  return data.negative || data.checks.length === 0 ? 'No solution' : 'Check each root'
}

/**
 * The check line of a radical working: each answer put back into the typed equation, exactly. Null when the working's answer
 * is not a list of rationals (a "No real solution" answer has no line), or the input is not a radical equation of the answer's letter.
 */
export function radicalSubstitution(input: string, answers: StepAnswer[]): { ok: boolean; text?: string; reason?: string } | null {
  try {
    if (answers.length === 0) return null
    const v = answers[0].label
    if (answers.some((a) => a.label !== v)) return null
    const reg = new RadicalRegistry(v)
    const eq = readRadicalEquation(input, v, reg)
    if (eq === null || reg.radicands.length === 0) return null
    const sentences: string[] = []
    for (const a of answers) {
      const r = parseRatText(a.value ?? a.tex)
      if (r === null) return null
      const res = checkCandidate(eq, r)
      if (res === null) return null
      if (res.under !== undefined) {
        return { ok: false, reason: `${v} = ${ratPretty(r)} makes the number under a root negative, so it does not satisfy the problem` }
      }
      if (!res.ok) {
        return { ok: false, reason: `${v} = ${ratPretty(r)} does not satisfy the problem: the two sides give ${res.left} and ${res.right}` }
      }
      sentences.push(`Put ${v} = ${ratPretty(r)} back: both sides give ${res.left}.`)
    }
    return { ok: true, text: sentences.join(' ') }
  } catch {
    return null
  }
}

/** True for the answer "No real solution" that a squared equation gives when no real number solves it. */
export function isNoRealSolution(answers: StepAnswer[]): boolean {
  return answers.length === 1 && answers[0].tex.replace(/\s+/g, '') === '\\text{Norealsolution}'
}

/** The root values of a working's sub-working answer, as rationals (sorted), or null when one is not a rational. */
export function rationalsOf(answers: StepAnswer[]): Rat[] | null {
  const out: Rat[] = []
  for (const a of answers) {
    const r = parseRatText(a.value ?? a.tex)
    if (r === null) return null
    out.push(r)
  }
  return out.sort(rCmp)
}

/** Two sorted lists of rationals, element by element. */
export function sameRationals(a: Rat[], b: Rat[]): boolean {
  return a.length === b.length && a.every((x, i) => rEq(x, b[i]))
}


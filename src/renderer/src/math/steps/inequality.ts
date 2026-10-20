// Inequalities in one letter (S1e). A line with one of < <= > >= is read as one relation between two sides:
// a polynomial, a fraction of polynomials, or |linear| against a number. Every claim about it is checked
// exactly on rational numbers, never on floats.
//
// The rule behind every solution set (checked by validateIneqWorking: recomputed from the TYPED inequality, then tested
// again by agreesWithTypedSides, which reads the typed sides' own values and never the critical points or signs):
// - the critical points are the real roots of the related equation (the two sides are equal) and the points
//   where a denominator is 0. A root that is not rational makes the inequality unsupported, so no steps are shown;
// - one point strictly inside each part between neighbouring critical points gives the sign of the expression
//   there, and the sign is the same everywhere in that part (the expression cannot change sign without a zero or a
//   denominator 0 in between);
// - a part is in the set when its sign satisfies the relation. A critical point is in the set only when it is not
//   a denominator 0 (the expression is undefined there, so it is left out) and the relation allows equality.
// The set is written as intervals with their endpoints; the claimed intervals must be exactly those.

import type { Expr } from '../pure/mono'
import { constExpr, eAdd, eEq, eMul, eNeg, eSub, evalAt, exprDegree, normalize, varsOf } from '../pure/mono'
import { rAbs, rAdd, rCmp, rDiv, rEq, rIsNeg, rIsZero, rMul, rNeg, rSign, rSqrt, rStr, rSub, rTex, rat, type Rat } from '../pure/rat'
import { coefficientOf, parseExactRat, tryParsePoly } from './check-adapter'
import { displaySafe, drawnTex } from './displaySafe'
import type { Step, ValidationVerdict, Working, WorkingValidationResult } from './types'
import { tooLongToRead } from './limits'

/** The relation between the two sides, as written. */
export type IneqRel = '<' | '<=' | '>' | '>='

/** The function whose sign decides the inequality: num/den op 0, or |g| − c op 0. */
type IneqFn = { kind: 'ratio'; num: Expr; den: Expr } | { kind: 'abs'; g: Expr; c: Rat }

/** An inequality as read: its variable, its relation and its function. `sides` is set when both sides are polynomials. */
interface IneqRead {
  v: string
  rel: IneqRel
  fn: IneqFn
  sides: { L: Expr; R: Expr } | null
}

/** One part of the solution set: an interval, or a single point when lo and hi are the same closed point. */
export interface IneqPart {
  lo: Rat | null
  loClosed: boolean
  hi: Rat | null
  hiClosed: boolean
}

/** What the inequality is, worked out exactly from the typed input. */
export interface IneqAnalysis {
  /** Points where the two sides are equal (the expression is 0 and defined there), in order. */
  zeros: Rat[]
  /** Points where a denominator is 0, in order. The expression is undefined there. */
  poles: Rat[]
  /** zeros and poles together, in order: the ends of the parts. */
  points: Rat[]
  /** The sign (+1 or -1) of the expression in each part, from the left: parts.length = points.length + 1. */
  signs: number[]
  /** The solution set, in order. */
  set: IneqPart[]
}

/** A move that keeps the inequality true. Each one is checked exactly on both sides. */
export type IneqMoveOp =
  | { kind: 'ineq-add'; term: string }
  | { kind: 'ineq-subtract'; term: string }
  | { kind: 'ineq-divide'; k: string }
  | { kind: 'ineq-factorise'; lead: string; roots: string[] }

interface IntervalData {
  lo: string | null
  loClosed: boolean
  hi: string | null
  hiClosed: boolean
}

const MINUS = '−'
const LE_TEX = '\\le'
const GE_TEX = '\\ge'
const LE = '≤'
const GE = '≥'

/** The name a Signs step gives its expression when it is left side minus right side (the fraction and polynomial cases). */
const LEFT_MINUS_RIGHT = 'left-minus-right'

const RELATION_TEX: Record<IneqRel, string> = { '<': '<', '<=': LE_TEX, '>': '>', '>=': GE_TEX }

function dataOf(step: Step): Record<string, unknown> {
  return step.data && typeof step.data === 'object' ? (step.data as Record<string, unknown>) : {}
}

function variableOfStep(step: Step): string {
  const v = dataOf(step).variable
  return typeof v === 'string' ? v : 'x'
}

// ---------------------------------------------------------------------------
// Reading the typed inequality
// ---------------------------------------------------------------------------

/** One relation in a line: left, the relation, right. Null when there is not exactly one relation. */
export function splitRelation(text: string): { left: string; rel: IneqRel; right: string } | null {
  const t = text.trim().replace(/≤/g, '<=').replace(/≥/g, '>=')
  const m = /^(.*?)(<=|>=|<|>)(.*)$/.exec(t)
  if (!m) return null
  const left = m[1].trim()
  const right = m[3].trim()
  if (left === '' || right === '') return null
  // A second relation, or an equals sign beside the one relation, is not an inequality this step engine reads.
  if (/[<>=]/.test(left) || /[<>=]/.test(right)) return null
  return { left, rel: m[2] as IneqRel, right }
}

/** The relation as it reads when both sides are swapped: "c < |x|" is "|x| > c". */
export function flipRel(rel: IneqRel): IneqRel {
  switch (rel) {
    case '<':
      return '>'
    case '<=':
      return '>='
    case '>':
      return '<'
    case '>=':
      return '<='
  }
}

/** The top-level positions (outside every bracket) of a character. */
function topLevel(text: string, ch: string): number[] {
  const out: number[] = []
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ch && depth === 0) out.push(i)
  }
  return out
}

/** True when a top-level + or − stands after the first character, so the text is a sum. */
function hasTopLevelSum(text: string): boolean {
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (depth === 0 && i > 0 && (c === '+' || c === '-')) return true
  }
  return false
}

/** True when the whole text is one bracket pair: (x + 2). */
function isOneBracket(text: string): boolean {
  if (text[0] !== '(' || text[text.length - 1] !== ')') return false
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')') depth--
    if (depth === 0 && i < text.length - 1) return false
  }
  return depth === 0
}

type SideRead = { kind: 'ratio'; num: Expr; den: Expr } | { kind: 'abs'; g: Expr }

const ONE: Expr = normalize([{ c: rat(1n), v: {} }])

/** A divisor that is a plain number: 2, 0.5 or (2), (-3). The number must end there, not run on into a letter or a power. */
const PLAIN_DIVISOR = /^\s*(?:\d+(?:\.\d+)?|\(\s*-?\d+(?:\.\d+)?\s*\))(?!\s*[\w.^(])/

/**
 * True when a division in the text has a bottom that is not a plain number, at any depth of brackets: x/x, or x^2 over x
 * inside a sum, as the LaTeX converter writes \frac{x^2}{x} (((x^(2))/(x))). The parser cancels a monomial divided by a
 * monomial, so that fraction would read as x and the point x = 0, where it is undefined, would be left in the set. A division
 * by a number is exact, so it is still read.
 */
function dividesByNonNumber(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '/' && !PLAIN_DIVISOR.test(text.slice(i + 1))) return true
  }
  return false
}

/** A text read as a polynomial, or null. A division by anything but a plain number is refused first (dividesByNonNumber). */
function readPoly(text: string): Expr | null {
  return dividesByNonNumber(text) ? null : tryParsePoly(text)
}

/**
 * One side read as a fraction of polynomials (a plain polynomial has den 1), or as |g|. A fraction is written
 * (numerator)/(denominator) with nothing else at the top level: the denominator a bracket, a number or one letter power.
 */
function readSide(raw: string): SideRead | null {
  // A whole side in one bracket pair is the same side: the LaTeX converter writes ((x-1)/(x+2)) for \frac. The pairs come off in
  // a loop, not by calling readSide again: 6000 nested pairs overflowed the stack before any limit could refuse the line.
  let text = raw
  while (isOneBracket(text)) text = text.slice(1, -1).trim()
  if (text.length >= 2 && text[0] === '|' && text[text.length - 1] === '|' && text.indexOf('|', 1) === text.length - 1) {
    const g = readPoly(text.slice(1, -1))
    return g ? { kind: 'abs', g } : null
  }
  const slashes = topLevel(text, '/')
  if (slashes.length === 0) {
    const p = readPoly(text)
    return p ? { kind: 'ratio', num: p, den: ONE } : null
  }
  if (slashes.length > 1) return null
  const i = slashes[0]
  const numText = text.slice(0, i).trim()
  const denText = text.slice(i + 1).trim()
  if (numText === '' || denText === '') return null
  if (hasTopLevelSum(numText) || topLevel(numText, '/').length > 0) return null
  if (!(isOneBracket(denText) || /^\d+$/.test(denText) || /^[A-Za-z](\^\d+)?$/.test(denText))) return null
  const num = readPoly(numText)
  const den = readPoly(denText)
  if (!num || !den) return null
  return { kind: 'ratio', num, den }
}

/** The constant value of a side that is a plain number (no letter), or null. */
function constantOf(side: SideRead): Rat | null {
  if (side.kind !== 'ratio') return null
  if (exprDegree(side.num) !== 0 || exprDegree(side.den) !== 0) return null
  if (side.den.length === 0) return null
  const n = side.num.length === 0 ? rat(0n) : side.num[0].c
  return rDiv(n, side.den[0].c)
}

/**
 * Read a line as one inequality in one letter. Null when the line is not one, when it has no single letter, or when a
 * side is not a polynomial, a single fraction, or |linear| against a number.
 */
export function readInequality(text: string): IneqRead | null {
  // A line past the router's limits is refused by the router, so it is not read as an inequality here either.
  if (tooLongToRead(text)) return null
  const rel = splitRelation(text)
  if (!rel) return null
  const left = readSide(rel.left)
  const right = readSide(rel.right)
  if (!left || !right) return null
  let relation = rel.rel
  let fn: IneqFn
  let sides: { L: Expr; R: Expr } | null = null
  if (left.kind === 'abs' || right.kind === 'abs') {
    if (left.kind === 'abs' && right.kind === 'abs') return null
    const absSide = left.kind === 'abs' ? left : right
    const other = left.kind === 'abs' ? right : left
    const c = constantOf(other)
    if (absSide.kind !== 'abs' || c === null) return null
    // "c < |g|" is the same as "|g| > c": the absolute value always goes on the left.
    if (left.kind !== 'abs') relation = flipRel(relation)
    fn = { kind: 'abs', g: absSide.g, c }
  } else {
    // Both sides as fractions: L − R = (nL·dR − nR·dL) / (dL·dR), which has the same sign as L − R wherever it is defined.
    const numL = left.num
    const numR = right.num
    const denL = left.den
    const denR = right.den
    const num = eSub(eMul(numL, denR), eMul(numR, denL))
    const den = eMul(denL, denR)
    fn = { kind: 'ratio', num, den }
    if (denL === ONE && denR === ONE) sides = { L: numL, R: numR }
  }
  // Exactly one letter, and it must be there (a line with no letter is a plain comparison, not an inequality).
  const names = new Set<string>()
  const add = (e: Expr): void => {
    for (const n of varsOf(e)) names.add(n)
  }
  if (fn.kind === 'ratio') {
    add(fn.num)
    add(fn.den)
  } else {
    add(fn.g)
  }
  if (sides) {
    add(sides.L)
    add(sides.R)
  }
  if (names.size !== 1) return null
  const v = [...names][0]
  // i is the imaginary unit everywhere in PhysLab. Complex numbers have no order, so "3 + 2i < 5" is not an inequality
  // in one letter, and the working for it would be a checked answer about nothing: its line belongs to Complex.
  if (v === 'i') return null
  return { v, rel: relation, fn, sides }
}

/**
 * Whether the step engine can work a line as an inequality: it reads as one (readInequality) and every critical point is
 * rational (analyseInequality). Auto asks this before it sends a line to Solve, so a line with irrational roots keeps the
 * job it had instead of being refused by Solve.
 */
export function canWorkInequality(text: string): boolean {
  const read = readInequality(text)
  return read !== null && analyseInequality(read) !== null
}

/**
 * The expression whose sign a Signs step gives, as its data names it: left side minus right side for a fraction or a
 * polynomial, or |g| − c for an absolute value. A sign is only ever about the expression named here.
 */
export function signedExpression(read: IneqRead): string {
  const fn = read.fn
  if (fn.kind === 'ratio') return LEFT_MINUS_RIGHT
  const abs = `|${polyText(fn.g, read.v)}|`
  // The number is written the way the expression reads: |g| - 2, |g| (c is 0), or |g| + 1 (c is negative). "|g| - -1"
  // would be a double sign a student cannot read.
  if (rIsZero(fn.c)) return abs
  return rIsNeg(fn.c) ? `${abs} + ${rStr(rAbs(fn.c))}` : `${abs} - ${rStr(fn.c)}`
}

/**
 * One side as LaTeX. A side is a fraction only when readSide reads it as one: a single top-level slash, a numerator with no
 * top-level sum, and a denominator that is a bracket, a number or one letter power. So "x^2 - 1/2" keeps its 1/2 as a
 * rational term and is never drawn as (x^2 - 1)/2.
 */
function sideTex(side: string): string {
  const s = unbracket(side.trim())
  const slashes = topLevel(s, '/')
  if (slashes.length === 1) {
    const numText = s.slice(0, slashes[0]).trim()
    const denText = s.slice(slashes[0] + 1).trim()
    const denOk = isOneBracket(denText) || /^\d+$/.test(denText) || /^[A-Za-z](\^\d+)?$/.test(denText)
    if (numText !== '' && denOk && !hasTopLevelSum(numText) && !numText.includes('/')) {
      return `\\frac{${unbracket(numText)}}{${unbracket(denText)}}`
    }
  }
  return fractionCoefficientsTex(s)
}

/** A text with its outer brackets removed while they wrap the whole text: "((x-1))" is "x-1". */
function unbracket(text: string): string {
  let s = text.trim()
  while (isOneBracket(s)) s = s.slice(1, -1).trim()
  return s
}

/**
 * A rational number written (1/2), (-1/2) or 1/2 is drawn as \frac{1}{2}, with the brackets that only held it dropped. A
 * minus sign outside the brackets is a subtraction or a sign in front, so it stays outside: x^2-1/2 is x^2-\frac{1}{2}.
 */
function fractionCoefficientsTex(text: string): string {
  return text.replace(/\((-?\d+)\/(\d+)\)/g, '\\frac{$1}{$2}').replace(/(\d+)\/(\d+)/g, '\\frac{$1}{$2}')
}

/**
 * The TeX an inequality step draws under its sentence: \le and \ge for the closed relations, a fraction (n)/(d) as
 * \frac{n}{d}, a fraction coefficient (1/2) as \frac{1}{2} and a power written x^{(2)} as x^2. The ASCII line is still what
 * the chain checks; only the drawing changes.
 */
export function ineqDrawnTex(text: string): string {
  const tidy = text.replace(/\^\{\((-?\d+)\)\}/g, '^{$1}').replace(/\^\((-?\d+)\)/g, '^{$1}')
  const rel = splitRelation(tidy)
  if (rel === null) return drawnTex(fractionCoefficientsTex(tidy))
  return drawnTex(`${sideTex(rel.left)} ${RELATION_TEX[rel.rel]} ${sideTex(rel.right)}`)
}

// ---------------------------------------------------------------------------
// Exact arithmetic on the critical points
// ---------------------------------------------------------------------------

function sortedDistinct(values: Rat[]): Rat[] {
  const sorted = [...values].sort(rCmp)
  return sorted.filter((r, i) => i === 0 || !rEq(r, sorted[i - 1]))
}

/**
 * Every real root of a polynomial of degree 0, 1 or 2, exact. Null when a root is not rational (its square root is not
 * exact), or when the polynomial is zero or of a higher degree: such an inequality is not worked.
 */
function realRoots(p: Expr, v: string): Rat[] | null {
  if (p.length === 0) return null
  const deg = exprDegree(p)
  if (deg === 0) return []
  if (deg === 1) {
    const a = coefficientOf(p, v, 1)
    const b = coefficientOf(p, v, 0)
    return [rDiv(rNeg(b), a)]
  }
  if (deg !== 2) return null
  const a = coefficientOf(p, v, 2)
  const b = coefficientOf(p, v, 1)
  const c = coefficientOf(p, v, 0)
  const disc = rSub(rMul(b, b), rMul(rat(4n), rMul(a, c)))
  if (rIsNeg(disc)) return []
  const root = rSqrt(disc)
  if (root === null) return null
  const twoA = rMul(rat(2n), a)
  return sortedDistinct([rDiv(rAdd(rNeg(b), root), twoA), rDiv(rSub(rNeg(b), root), twoA)])
}

/** A point strictly inside part j of the parts cut by the points (part 0 is left of the first point). */
function testPoint(points: Rat[], j: number): Rat {
  const n = points.length
  if (n === 0) return rat(0n)
  if (j === 0) return rSub(points[0], rat(1n))
  if (j === n) return rAdd(points[n - 1], rat(1n))
  return rDiv(rAdd(points[j - 1], points[j]), rat(2n))
}

/** The solution set from the critical points and the signs, the same way for every inequality. */
function finish(zeros: Rat[], poles: Rat[], rel: IneqRel, signAt: (t: Rat) => number): IneqAnalysis | null {
  const points = sortedDistinct([...zeros, ...poles])
  const n = points.length
  const signs: number[] = []
  for (let j = 0; j <= n; j++) {
    const s = signAt(testPoint(points, j))
    if (s === 0) return null
    signs.push(s)
  }
  const strict = rel === '<' || rel === '>'
  const wantNegative = rel === '<' || rel === '<='
  // Segments in order: part 0, point 0, part 1, point 1, … part n. A part is in when its sign fits; a point is in when
  // it is a zero (not a denominator 0) and the relation allows equality.
  const inside: boolean[] = []
  for (let j = 0; j <= n; j++) {
    inside.push(wantNegative ? signs[j] < 0 : signs[j] > 0)
    if (j < n) inside.push(!strict && !poles.some((p) => rEq(p, points[j])))
  }
  const set: IneqPart[] = []
  let s = 0
  while (s < inside.length) {
    if (!inside[s]) {
      s++
      continue
    }
    let e = s
    while (e + 1 < inside.length && inside[e + 1]) e++
    const lo = s % 2 === 0 ? (s / 2 === 0 ? null : points[s / 2 - 1]) : points[(s - 1) / 2]
    const hi = e % 2 === 0 ? (e / 2 === n ? null : points[e / 2]) : points[(e - 1) / 2]
    set.push({ lo, loClosed: s % 2 === 1, hi, hiClosed: e % 2 === 1 })
    s = e + 1
  }
  return { zeros, poles, points, signs, set }
}

/**
 * Everything about an inequality that the checks compare: its critical points, the sign of each part and the solution set.
 * Null when a critical point is not rational, or the function is degenerate (a zero numerator or denominator).
 */
export function analyseInequality(read: IneqRead): IneqAnalysis | null {
  const v = read.v
  if (read.fn.kind === 'ratio') {
    const { num, den } = read.fn
    const numRoots = realRoots(num, v)
    const denRoots = realRoots(den, v)
    if (numRoots === null || denRoots === null) return null
    const poles = sortedDistinct(denRoots)
    // A root of both the numerator and the denominator is a denominator 0: the expression is undefined there, not 0.
    const zeros = sortedDistinct(numRoots.filter((r) => !poles.some((p) => rEq(p, r))))
    const signAt = (t: Rat): number => rSign(evalAt(num, { [v]: t })) * rSign(evalAt(den, { [v]: t }))
    return finish(zeros, poles, read.rel, signAt)
  }
  // |g| − c with g linear. Above 0 the related equation |g| = c has the two roots g = c and g = −c. At 0 it has the one
  // root where g is 0, and |g| is never negative there; below 0 it has none, and |g| − c is positive everywhere. (A student
  // meets both: |x| ≤ 0 is the single value 0, and |x| < 0 is no value.) A zero sign is still refused below, so a
  // constant a line reads as one number is not given a chart.
  const { g, c } = read.fn
  if (exprDegree(g) !== 1) return null
  const signAt = (t: Rat): number => rSign(rSub(rAbs(evalAt(g, { [v]: t })), c))
  if (rSign(c) < 0) return finish([], [], read.rel, signAt)
  const a = coefficientOf(g, v, 1)
  const b = coefficientOf(g, v, 0)
  const zeros = sortedDistinct([rDiv(rSub(c, b), a), rDiv(rSub(rNeg(c), b), a)])
  return finish(zeros, [], read.rel, signAt)
}

// ---------------------------------------------------------------------------
// Writing states, factors and sets
// ---------------------------------------------------------------------------

/** A polynomial as student text: "x^2 - 5x + 6", "-2x + 1", "(1/2)x", "4/3", "0". */
export function polyText(e: Expr, v: string): string {
  const terms = e
    .filter((t) => !rIsZero(t.c))
    .sort((p, q) => (q.v[v] ?? 0) - (p.v[v] ?? 0))
  if (terms.length === 0) return '0'
  return terms
    .map((t, i) => {
      const deg = t.v[v] ?? 0
      const neg = rIsNeg(t.c)
      const abs = rAbs(t.c)
      let body: string
      if (deg === 0) {
        body = rStr(abs)
      } else {
        const coef = abs.n === 1n && abs.d === 1n ? '' : abs.d === 1n ? abs.n.toString() : `(${rStr(abs)})`
        body = `${coef}${v}${deg > 1 ? `^${deg}` : ''}`
      }
      if (i === 0) return neg ? `-${body}` : body
      return neg ? ` - ${body}` : ` + ${body}`
    })
    .join('')
}

/** One state of the inequality as text: "L rel R". */
export function stateText(L: Expr, R: Expr, rel: IneqRel, v: string): string {
  return `${polyText(L, v)} ${rel} ${polyText(R, v)}`
}

/** The product lead·(x − r1)(x − r2) as text: "(x - 2)(x - 3)", "-(x - 2)(x - 3)", "2x(x + 1)". */
export function factorText(lead: Rat, roots: Rat[], v: string): string {
  let prefix: string
  if (lead.n === 1n && lead.d === 1n) prefix = ''
  else if (lead.n === -1n && lead.d === 1n) prefix = '-'
  else if (lead.d === 1n) prefix = `${lead.n}`
  else prefix = `(${rStr(lead)})`
  // A repeated root is one factor with a power: x² and (x − 2)², not xx or (x − 2)(x − 2).
  const factors: string[] = []
  for (let i = 0; i < roots.length; ) {
    let j = i
    while (j + 1 < roots.length && rEq(roots[j + 1], roots[i])) j++
    const r = roots[i]
    const base = rIsZero(r) ? v : `(${v} ${rIsNeg(r) ? '+' : '-'} ${rStr(rAbs(r))})`
    const count = j - i + 1
    factors.push(count > 1 ? `${base}^${count}` : base)
    i = j + 1
  }
  return `${prefix}${factors.join('')}`
}

/** The product lead·(x − r1)(x − r2) as an exact polynomial. */
function factorExpr(lead: Rat, roots: Rat[], v: string): Expr {
  let e = constExpr(lead)
  for (const r of roots) {
    e = eMul(e, normalize([{ c: rat(1n), v: { [v]: 1 } }, { c: rNeg(r), v: {} }]))
  }
  return e
}

/** Every term of an expression multiplied by k. */
export function scaleBy(e: Expr, k: Rat): Expr {
  return normalize(e.map((t) => ({ c: rMul(t.c, k), v: { ...t.v } })))
}

function numberTex(r: Rat): string {
  return rTex(r)
}

function numberPlain(r: Rat): string {
  return rStr(r).replace(/-/g, MINUS)
}

/**
 * The solution set in words or in LaTeX: "x < 2 or x > 3", "1 ≤ x ≤ 3", "every real number", "no value of x works".
 * LaTeX is what the answer shows; the plain words are what a sentence says.
 */
export function setForm(set: IneqPart[], v: string, latex: boolean): string {
  if (set.length === 0) return latex ? `\\text{no value of ${v} works}` : `no value of ${v} works`
  if (set.length === 1 && set[0].lo === null && set[0].hi === null) {
    return latex ? '\\text{every real number}' : 'every real number'
  }
  const num = (r: Rat): string => (latex ? numberTex(r) : numberPlain(r))
  const le = latex ? LE_TEX : LE
  const ge = latex ? GE_TEX : GE
  const pieces = set.map((p) => {
    if (p.lo !== null && p.hi !== null && rEq(p.lo, p.hi)) return `${v} = ${num(p.lo)}`
    if (p.lo === null && p.hi !== null) return `${v} ${p.hiClosed ? le : '<'} ${num(p.hi)}`
    if (p.hi === null && p.lo !== null) return `${v} ${p.loClosed ? ge : '>'} ${num(p.lo)}`
    if (p.lo !== null && p.hi !== null) {
      return `${num(p.lo)} ${p.loClosed ? le : '<'} ${v} ${p.hiClosed ? le : '<'} ${num(p.hi)}`
    }
    return ''
  })
  return latex ? pieces.join(' \\text{ or } ') : pieces.join(' or ')
}

/** The solution set in interval form, in LaTeX: "(-\infty, 2) \cup (3, \infty)", "[1, 3]", "\{2\}", "\varnothing". */
export function intervalForm(set: IneqPart[]): string {
  if (set.length === 0) return '\\varnothing'
  if (set.length === 1 && set[0].lo === null && set[0].hi === null) return '(-\\infty, \\infty)'
  return set
    .map((p) => {
      if (p.lo !== null && p.hi !== null && rEq(p.lo, p.hi)) return `\\{${numberTex(p.lo)}\\}`
      const open = p.lo === null ? '(' : p.loClosed ? '[' : '('
      const close = p.hi === null ? ')' : p.hiClosed ? ']' : ')'
      const lo = p.lo === null ? '-\\infty' : numberTex(p.lo)
      const hi = p.hi === null ? '\\infty' : numberTex(p.hi)
      return `${open}${lo}, ${hi}${close}`
    })
    .join(' \\cup ')
}

/** A solution set as its data: the endpoints as exact text, the ends open or closed. */
export function setData(set: IneqPart[]): IntervalData[] {
  return set.map((p) => ({
    lo: p.lo === null ? null : rStr(p.lo),
    loClosed: p.loClosed,
    hi: p.hi === null ? null : rStr(p.hi),
    hiClosed: p.hiClosed
  }))
}

// ---------------------------------------------------------------------------
// Step data, sentences and rules
// ---------------------------------------------------------------------------

/** The move an IneqMove step claims, from its data. */
function moveOf(step: Step): IneqMoveOp | null {
  const m = dataOf(step).move
  if (!m || typeof m !== 'object') return null
  const kind = (m as { kind?: unknown }).kind
  if (kind === 'ineq-add' || kind === 'ineq-subtract') {
    const term = (m as { term?: unknown }).term
    return typeof term === 'string' ? { kind, term } : null
  }
  if (kind === 'ineq-divide') {
    const k = (m as { k?: unknown }).k
    return typeof k === 'string' ? { kind, k } : null
  }
  if (kind === 'ineq-factorise') {
    const lead = (m as { lead?: unknown }).lead
    const roots = (m as { roots?: unknown }).roots
    return typeof lead === 'string' && Array.isArray(roots) && roots.every((r) => typeof r === 'string')
      ? { kind, lead, roots: roots as string[] }
      : null
  }
  return null
}

function plainPoly(text: string): string {
  return text.replace(/\^2/g, '²').replace(/\^3/g, '³').replace(/-/g, MINUS)
}

function parsedRats(list: unknown): Rat[] | null {
  if (!Array.isArray(list)) return null
  const out: Rat[] = []
  for (const x of list) {
    if (typeof x !== 'string') return null
    const r = parseExactRat(x)
    if (r === null) return null
    out.push(r)
  }
  return out
}

function partWord(sign: string): string {
  return sign === '+' ? 'positive' : 'negative'
}

/**
 * The expression a Signs sentence starts with, as its data names it: "Left side minus right side", or the absolute value
 * "|2x − 1| − 3". Null when the data names neither, so the sentence is not written.
 */
function signedSubject(expression: unknown): string | null {
  if (expression === LEFT_MINUS_RIGHT) return 'Left side minus right side'
  if (typeof expression === 'string' && expression.startsWith('|')) return plainPoly(expression)
  return null
}

/** Clauses in a list, as a sentence reads them: "a", "a and b", "a, b and c". */
function joinClauses(items: string[]): string {
  if (items.length < 2) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** The sentence a step must carry, built from its typed data. Null when the data does not determine one. */
export function ineqSentence(step: Step): string | null {
  const v = variableOfStep(step)
  switch (step.kind) {
    case 'IneqMove': {
      const move = moveOf(step)
      if (!move) return null
      if (move.kind === 'ineq-add') return `Add ${plainPoly(move.term)} to both sides`
      if (move.kind === 'ineq-subtract') return `Subtract ${plainPoly(move.term)} from both sides`
      if (move.kind === 'ineq-divide') {
        const k = parseExactRat(move.k)
        if (k === null || rIsZero(k)) return null
        if (rIsNeg(k)) return `Divide both sides by ${numberPlain(k)}: dividing by a negative number flips the sign`
        return `Divide both sides by ${numberPlain(k)}`
      }
      const lead = parseExactRat(move.lead)
      const roots = parsedRats(move.roots)
      if (lead === null || roots === null || rIsZero(lead) || roots.length < 1 || roots.length > 2) return null
      return `Factorise the left side as ${plainPoly(factorText(lead, roots, v))}`
    }
    case 'IneqCritical': {
      const zeros = parsedRats(dataOf(step).zeros)
      const poles = parsedRats(dataOf(step).poles)
      if (zeros === null || poles === null) return null
      const parts: string[] = []
      if (zeros.length === 0) parts.push('The sides are never equal.')
      else parts.push(`The sides are equal when ${zeros.map((r) => `${v} = ${numberPlain(r)}`).join(' or ')}.`)
      // The poles are the points where a denominator on either side is 0, so no side is named: a side could be the wrong one.
      if (poles.length > 0) {
        parts.push(
          `A denominator is 0 when ${poles.map((r) => `${v} = ${numberPlain(r)}`).join(' or ')}, so ${poles.length === 1 ? 'that point is' : 'those points are'} left out.`
        )
      }
      return parts.join(' ')
    }
    case 'IneqSigns': {
      const points = parsedRats(dataOf(step).points)
      const signs = dataOf(step).signs
      const subject = signedSubject(dataOf(step).expression)
      if (points === null || subject === null || !Array.isArray(signs) || !signs.every((s) => s === '+' || s === '-')) return null
      if (signs.length !== points.length + 1) return null
      if (points.length === 0) return `${subject} is ${partWord(String(signs[0]))} for every ${v}.`
      const labels = signs.map((_s, j) => {
        const n = points.length
        if (j === 0) return `${v} < ${numberPlain(points[0])}`
        if (j === n) return `${v} > ${numberPlain(points[n - 1])}`
        return `${numberPlain(points[j - 1])} < ${v} < ${numberPlain(points[j])}`
      })
      return `${subject} is ${joinClauses(signs.map((s, j) => `${partWord(String(s))} for ${labels[j]}`))}.`
    }
    case 'IneqSolutionSet': {
      const set = intervalsOf(dataOf(step).intervals)
      if (set === null) return null
      if (set.length === 0) return `No value of ${v} works.`
      if (set.length === 1 && set[0].lo === null && set[0].hi === null) return 'Every real number is a solution.'
      return `The solutions are ${setForm(set, v, false)}.`
    }
    default:
      return null
  }
}

/** The rule chip a step must carry, built from its typed data. Null when the data does not determine one. */
export function ineqRule(step: Step): string | null {
  switch (step.kind) {
    case 'IneqMove': {
      const move = moveOf(step)
      if (!move) return null
      if (move.kind === 'ineq-add') return 'Add to both sides'
      if (move.kind === 'ineq-subtract') return 'Subtract from both sides'
      if (move.kind === 'ineq-divide') {
        const k = parseExactRat(move.k)
        if (k === null || rIsZero(k)) return null
        return rIsNeg(k) ? 'Divide by a negative: flip the sign' : 'Divide both sides'
      }
      return 'Factorise'
    }
    case 'IneqCritical':
      return 'Critical points'
    case 'IneqSigns':
      return 'Signs of the parts'
    case 'IneqSolutionSet':
      return 'Solution set'
    default:
      return null
  }
}

/** The intervals a step's data claims, or null when they are not well formed. */
function intervalsOf(list: unknown): IneqPart[] | null {
  if (!Array.isArray(list)) return null
  const out: IneqPart[] = []
  for (const item of list) {
    const d = intervalDataOf(item)
    if (d === null) return null
    const lo = d.lo === null ? null : parseExactRat(d.lo)
    const hi = d.hi === null ? null : parseExactRat(d.hi)
    if ((d.lo !== null && lo === null) || (d.hi !== null && hi === null)) return null
    out.push({ lo, loClosed: d.loClosed, hi, hiClosed: d.hiClosed })
  }
  return out
}

function intervalDataOf(item: unknown): IntervalData | null {
  if (!item || typeof item !== 'object') return null
  const o = item as Record<string, unknown>
  const lo = o.lo === null ? null : typeof o.lo === 'string' ? o.lo : undefined
  const hi = o.hi === null ? null : typeof o.hi === 'string' ? o.hi : undefined
  if (lo === undefined || hi === undefined || typeof o.loClosed !== 'boolean' || typeof o.hiClosed !== 'boolean') return null
  return { lo, loClosed: o.loClosed, hi, hiClosed: o.hiClosed }
}

// ---------------------------------------------------------------------------
// Checking a working
// ---------------------------------------------------------------------------

/** One state read back from its text: both sides polynomials in v, and the relation. */
interface StateRead {
  L: Expr
  R: Expr
  rel: IneqRel
}

function readState(text: unknown, v: string): StateRead | null {
  if (typeof text !== 'string') return null
  const rel = splitRelation(text)
  if (!rel) return null
  const L = readPoly(rel.left)
  const R = readPoly(rel.right)
  if (!L || !R) return null
  if (varsOf(eAdd(L, R)).some((n) => n !== v)) return null
  return { L, R, rel: rel.rel as IneqRel }
}

/** The polynomial a move's term text stands for, in v only; null when it is not one. */
function termOf(text: string, v: string): Expr | null {
  const t = readPoly(text)
  if (!t || varsOf(t).some((n) => n !== v)) return null
  return t
}

/** One IneqMove step checked exactly: each side moves as its declared move says, and the relation flips only as it should. */
function checkMove(step: Step, v: string): ValidationVerdict {
  const move = moveOf(step)
  const before = readState(step.before, v)
  const after = readState(step.after, v)
  if (!move || !before || !after) return 'invalid'
  if (move.kind === 'ineq-add' || move.kind === 'ineq-subtract') {
    const t = termOf(move.term, v)
    if (!t) return 'invalid'
    const shift = move.kind === 'ineq-add' ? t : eNeg(t)
    const sameSides = eEq(after.L, eAdd(before.L, shift)) && eEq(after.R, eAdd(before.R, shift))
    return sameSides && after.rel === before.rel ? 'valid' : 'invalid'
  }
  if (move.kind === 'ineq-divide') {
    const k = parseExactRat(move.k)
    if (k === null || rIsZero(k)) return 'invalid'
    const sameSides = eEq(scaleBy(after.L, k), before.L) && eEq(scaleBy(after.R, k), before.R)
    const rel = rIsNeg(k) ? flipRel(before.rel) : before.rel
    return sameSides && after.rel === rel ? 'valid' : 'invalid'
  }
  // A factorisation keeps the right side at 0 and writes the left side as lead·(x − r1)(x − r2).
  const lead = parseExactRat(move.lead)
  const roots = parsedRats(move.roots)
  if (lead === null || roots === null || rIsZero(lead) || roots.length < 1 || roots.length > 2) return 'invalid'
  if (before.R.length !== 0 || after.R.length !== 0 || before.rel !== after.rel) return 'invalid'
  const product = factorExpr(lead, roots, v)
  return eEq(product, before.L) && eEq(product, after.L) ? 'valid' : 'invalid'
}

/** Same list of rational texts, in order. */
function sameTexts(data: unknown, values: Rat[]): boolean {
  if (!Array.isArray(data) || data.length !== values.length) return false
  return values.every((r, i) => data[i] === rStr(r))
}

/** Same intervals, endpoint by endpoint and end by end. */
function sameIntervals(data: unknown, set: IneqPart[]): boolean {
  const claimed = Array.isArray(data) ? data.map(intervalDataOf) : null
  if (!claimed || claimed.length !== set.length || claimed.some((c) => c === null)) return false
  const want = setData(set)
  return want.every((w, i) => {
    const c = claimed[i]
    return c !== null && c.lo === w.lo && c.hi === w.hi && c.loClosed === w.loClosed && c.hiClosed === w.hiClosed
  })
}

/**
 * Points that sample a claimed set: every finite endpoint, a quarter, a half and three quarters of the way across each gap
 * between neighbouring endpoints, one point beyond each end, and quarter steps from -10 to 10. Membership of the claimed set
 * can only change at an endpoint, so the endpoints and the points beyond the ends reach every claimed interval; the points
 * inside each gap catch a wrong stretch that a missed root would leave between two claimed ends.
 */
function setTestPoints(set: IneqPart[]): Rat[] {
  const ends: Rat[] = []
  for (const p of set) {
    if (p.lo !== null) ends.push(p.lo)
    if (p.hi !== null) ends.push(p.hi)
  }
  const sorted = sortedDistinct(ends)
  const points: Rat[] = [...sorted]
  for (let j = 0; j + 1 < sorted.length; j++) {
    const a = sorted[j]
    const width = rSub(sorted[j + 1], a)
    points.push(rAdd(a, rDiv(width, rat(4n))), rAdd(a, rDiv(width, rat(2n))), rAdd(a, rDiv(rMul(width, rat(3n)), rat(4n))))
  }
  if (sorted.length > 0) points.push(rSub(sorted[0], rat(1n)), rAdd(sorted[sorted.length - 1], rat(1n)))
  points.push(rat(0n))
  for (let k = -40n; k <= 40n; k += 1n) points.push(rat(k, 4n))
  return points
}

/** Whether a point lies in one of the parts, each end counted open or closed as the part says. */
function inParts(t: Rat, set: IneqPart[]): boolean {
  return set.some((p) => {
    if (p.lo !== null) {
      const c = rCmp(t, p.lo)
      if (c < 0 || (c === 0 && !p.loClosed)) return false
    }
    if (p.hi !== null) {
      const c = rCmp(t, p.hi)
      if (c > 0 || (c === 0 && !p.hiClosed)) return false
    }
    return true
  })
}

/**
 * The second opinion on a claimed solution set (a review fix). The other checks rebuild the set with analyseInequality, so
 * a bug there would be copied into the claim and pass. This one never reads the critical points or the signs: it evaluates
 * each side of the TYPED inequality exactly, applies the relation as typed (no flipping, no subtracting), and asks whether
 * the claimed set holds at the same points. A point is in the true set when the relation holds and no denominator is 0.
 */
export function agreesWithTypedSides(input: string, set: IneqPart[]): boolean {
  if (tooLongToRead(input)) return false
  const rel = splitRelation(input)
  if (!rel) return false
  const left = readSide(rel.left)
  const right = readSide(rel.right)
  if (!left || !right) return false
  const names = new Set<string>()
  for (const side of [left, right]) {
    for (const e of side.kind === 'abs' ? [side.g] : [side.num, side.den]) {
      for (const n of varsOf(e)) names.add(n)
    }
  }
  if (names.size !== 1) return false
  const v = [...names][0]
  // One typed side at t. A fraction has no value where its denominator is 0; |g| always has one.
  const valueAt = (side: SideRead, t: Rat): Rat | null => {
    const at = { [v]: t }
    if (side.kind === 'abs') return rAbs(evalAt(side.g, at))
    const d = evalAt(side.den, at)
    return rIsZero(d) ? null : rDiv(evalAt(side.num, at), d)
  }
  const holds = (t: Rat): boolean => {
    const a = valueAt(left, t)
    const b = valueAt(right, t)
    if (a === null || b === null) return false
    const c = rCmp(a, b)
    switch (rel.rel) {
      case '<':
        return c < 0
      case '<=':
        return c <= 0
      case '>':
        return c > 0
      case '>=':
        return c >= 0
    }
  }
  return setTestPoints(set).every((t) => inParts(t, set) === holds(t))
}

function checkStep(step: Step, read: IneqRead, analysis: IneqAnalysis): ValidationVerdict {
  const d = dataOf(step)
  if (typeof d.variable !== 'string' || d.variable !== read.v) return 'invalid'
  switch (step.kind) {
    case 'IneqMove':
      return checkMove(step, read.v)
    case 'IneqCritical':
      if (step.before !== step.after) return 'invalid'
      return sameTexts(d.zeros, analysis.zeros) && sameTexts(d.poles, analysis.poles) ? 'valid' : 'invalid'
    case 'IneqSigns': {
      if (step.before !== step.after) return 'invalid'
      const want = analysis.signs.map((s) => (s > 0 ? '+' : '-'))
      const claimed: unknown = d.signs
      const signsOk = Array.isArray(claimed) && claimed.length === want.length && want.every((s, i) => claimed[i] === s)
      // The signs are of the expression the typed line gives, and the sentence must name that expression, not another.
      const namesOk = d.expression === signedExpression(read)
      return sameTexts(d.points, analysis.points) && signsOk && namesOk ? 'valid' : 'invalid'
    }
    case 'IneqSolutionSet':
      return sameIntervals(d.intervals, analysis.set) && step.after === intervalForm(analysis.set) ? 'valid' : 'invalid'
    default:
      return 'invalid'
  }
}

/**
 * A whole inequality working, checked from the inequality as typed: the chain of states (each step starts where the one
 * before ends, the first from the input), every step's own check, the solution set last, and the answers the set gives:
 * the inequality form, then the interval form.
 */
export function validateIneqWorking(working: Working): WorkingValidationResult {
  const reject = (reason: string, index?: number): WorkingValidationResult => ({
    valid: false,
    verdict: 'invalid',
    failedStepIndex: index,
    failedStep: index === undefined ? undefined : working.steps[index],
    reason
  })
  if (working.checked === 'failed') return reject("The answer's check failed")
  if ((working.subWorkings ?? []).length > 0 || working.anotherWay !== undefined || working.check !== undefined) {
    return reject('An inequality has no sub-working, Another way or check line to check')
  }
  const input = working.input
  if (typeof input !== 'string') return reject('The working has no input to check')
  const read = readInequality(input)
  if (!read) return { valid: false, verdict: 'unknown', reason: 'The inequality as typed is not read exactly' }
  const analysis = analyseInequality(read)
  if (!analysis) return { valid: false, verdict: 'unknown', reason: 'The critical points of the inequality are not all rational' }
  const steps = working.steps
  if (steps.length === 0) return reject('The working has no steps to check')
  let prev: string = input
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    if (step.before !== prev) {
      return reject(i === 0 ? 'The first step does not start from the inequality as typed' : `Step ${i + 1} does not start where step ${i} ends`, i)
    }
    if (step.kind === 'IneqSolutionSet' && i !== steps.length - 1) return reject('The solution set must be the last step', i)
    const verdict = checkStep(step, read, analysis)
    if (verdict !== 'valid') {
      return { valid: false, failedStepIndex: i, failedStep: step, verdict, reason: `Step ${i + 1} is not valid (${verdict})` }
    }
    if (typeof step.after !== 'string') return reject('A step does not end in text', i)
    // The line the page draws (ineqDrawnTex) must also be one KaTeX draws as the chain reads it, so the drawing is checked too.
    if (step.kind !== 'IneqSolutionSet' && !displaySafe(ineqDrawnTex(step.after))) {
      return reject('A line would be drawn differently from how it is read', i)
    }
    prev = step.after
  }
  if (steps[steps.length - 1].kind !== 'IneqSolutionSet') return reject('An inequality must end with its solution set')
  // The claimed set (already equal to analysis.set) must also hold at the typed sides' own values. When the two checks
  // disagree, neither is trusted, so the working is unknown rather than valid.
  if (!agreesWithTypedSides(input, analysis.set)) {
    return { valid: false, verdict: 'unknown', reason: 'The solution set does not agree with the inequality as typed' }
  }
  const answers = Array.isArray(working.answer) ? working.answer : working.answer === undefined ? [] : [working.answer]
  const want = [setForm(analysis.set, read.v, true), intervalForm(analysis.set)]
  const answersOk = answers.length === 2 && answers.every((a, i) => a.label === '' && a.tex === want[i] && a.value === undefined)
  if (!answersOk) return reject('The answer is not the solution set the last step gives')
  return { valid: true }
}

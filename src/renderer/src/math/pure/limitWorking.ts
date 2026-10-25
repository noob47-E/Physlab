// Limits, step by step, for the calculator's "=" card and for Work it out (math/pure/run.ts).
//
// A limit is answered by the first EXACT method below whose answer the function's own values agree with
// (math/limitSamples.ts), and every method is tried in this order:
//   1. a rational function (a fraction of polynomials in x), read exactly: substitute when the bottom is not 0;
//      when both top and bottom are 0 at the point, cancel the factor (x − a) that they share (factor theorem),
//      then substitute; at ±∞, divide every term by the highest power of x; when the bottom is 0 and the top is
//      not, each side's sign comes from the factor (x − a)^m, exactly.
//   2. |g(x)| with g a line that is 0 at the point: on each side |g| is ±g, exactly, and the sides are read as in 1.
//   3. the standard limits sin(kx)/(mx) → k/m and (1 − cos kx)/(mx) → 0 at 0.
//   4. substitution, when the function is built only from continuous pieces (polynomials, sin, cos, tan, exp,
//      ln, sqrt, abs, + − × ÷ and powers), gives a number at the point, and the values next to it agree.
//   5. L'Hôpital's rule for 0/0 or ∞/∞, at most twice, with derivatives from mathjs checked against the slope.
//
// Only an answer from those rules is ever shown as checked. When no rule answers, the values near the point
// give an ESTIMATE (lookupAttempt): the card shows it as an estimate and the working says so; it is never ticked.
//
// Nothing is shown as checked unless the answer it gives agrees with the function at points on both sides of
// the point: a claim that fails the check is dropped, and if nothing passes there is no working, only a sentence.

import type { MathNode } from 'mathjs'
import { math, preprocess } from '../expr'
import { toPrecisionHalfAway } from '../format'
import { limitCall, type LimitCall } from '../limitCall'
import {
  behaviourOf,
  compileLimitBody,
  derivativeMatches,
  holdsGrows,
  holdsValue,
  readingOf,
  settledValue,
  sidesAgree,
  tendsToZero,
  type Behaviour,
  type Fn,
  type Reading,
  type Side
} from '../limitSamples'
import { parseExpr, parseFraction, varsOf } from './mono'
import { pDeg, pDivMod, pEval, pIsZero, pLead, pTex, polyFromExpr, type Poly } from './poly'
import { R0, R1, rAbs, rDiv, rFromNumber, rIsNeg, rIsZero, rNeg, rNum, rTex, type Rat } from './rat'
import { Steps, failed, texToPlain, type Move, type Working } from './work'

/** A limit to work out: the expression, its letter, the point (a number, or ±Infinity) and the side (0 for both). */
interface LimitSpec {
  body: string
  variable: string
  point: number
  /** The point as typed, when it was typed as an expression: shown as written, since its digits are not the point. */
  pointAsTyped?: string
  side: 0 | 1 | -1
}

/** What the limit is. `check` is the unrounded number a decimal answer was judged by; `value` is the number shown. */
type LimitAnswer =
  | { kind: 'value'; value: number; exact: Rat | null; check?: number }
  | { kind: 'infinite'; sign: Side }
  | { kind: 'none'; text: string }
  | { kind: 'unknown'; reason: string }

interface LimitOutcome {
  working: Working
  answer: LimitAnswer
  /** True only when an exact rule gave the answer and the values next to the point agree with it. False for an estimate. */
  checked: boolean
}

interface Attempt {
  method: string
  moves: Move[]
  answer: LimitAnswer
  answerTex: string
  check: string
  /** True only when the answer agrees with the function's own values at points on both sides of the point. */
  checked: boolean
}

/** What the panel says when no method gives an answer that can be checked: no working, and no answer either. */
const NOT_CHECKED = 'I could not work this limit out in a way I can check, so I will not show a working for it.'

const MINUS = '−'

/** A number as a student reads it: plain digits, at most `figures` significant figures, no trailing zeros. */
export function shownNumber(v: number, figures = 6): string {
  if (Number.isNaN(v)) return 'undefined'
  if (!Number.isFinite(v)) return v > 0 ? '∞' : `${MINUS}∞`
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v).replace('-', MINUS)
  const text = toPrecisionHalfAway(v, figures)
  const trimmed = text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text
  return trimmed.replace('-', MINUS)
}

/** A number for LaTeX: the same digits, with the ordinary minus that LaTeX reads. */
const texNumber = (v: number, figures = 10): string => shownNumber(v, figures).replace(new RegExp(MINUS, 'g'), '-')

const pointText = (p: number): string => (Number.isFinite(p) ? shownNumber(p, 10) : p > 0 ? '∞' : `${MINUS}∞`)
// A point is shown as written when it is a short fraction; a double such as 1/3 is shown as its digits, never as the
// long fraction its 16 digits would make.
const pointTex = (p: number): string => {
  if (!Number.isFinite(p)) return p > 0 ? '\\infty' : '-\\infty'
  const r = shortFraction(p)
  return r ? rTex(r) : texNumber(p, 10)
}

const RAISED = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹']

/** Raised digits for a whole power: 2 is ², 10 is ¹⁰. */
const raise = (n: number): string => [...String(n)].map((c) => RAISED[Number(c)] ?? c).join('')

/** x for the first power, x² for the second, and so on, as a student reads a power. */
const xPowText = (n: number, v = 'x'): string => (n === 1 ? v : n === 0 ? '1' : `${v}${raise(n)}`)

/** The same power as LaTeX: x, x^{2}. */
const xPowTex = (n: number, v = 'x'): string => (n === 1 ? v : n === 0 ? '1' : `${v}^{${n}}`)

/**
 * The LaTeX mathjs writes, tidied for the field: no spaces inside braces ({ x} is x), a lone letter's braces
 * dropped, the |x| that the calculator writes as mag(x) drawn with its bars, and no run of spaces.
 */
function tidyTex(s: string): string {
  return s
    .replace(/\{\s+/g, '{')
    .replace(/(?<![A-Za-z\\}])\{([a-zA-Z])\}/g, '$1')
    .replace(/\\mathrm\{mag\}\\left\(([^]*?)\\right\)/g, '\\left|$1\\right|')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s+/g, ' ')
    .trim()
}

/** LaTeX for a node, as mathjs writes it, tidied: no tildes round implicit products and no stray spaces. */
function texOf(node: MathNode): string {
  return tidyTex(node.toTex({ parenthesis: 'auto', implicit: 'hide' }).replace(/~/g, ''))
}

/**
 * A node as a student reads it in a sentence: the function names kept (cos(x) − 1, −sin(x)), a power raised
 * (x²), a product with a dot. The LaTeX form drops function names in the plain text, so a sentence uses this.
 */
function plainOf(node: MathNode): string {
  return node
    .toString()
    .replace(/ \^ \(?(\d+)\)?/g, (_all, d: string) => raise(Number(d)))
    .replace(/\^\(([A-Za-z]+)\)/g, '^$1')
    .replace(/ \^ /g, '^')
    .replace(/ \* /g, '·')
    .replace(/ - /g, ' − ')
    .replace(/^-/, '−')
    .replace(/\bsqrt\(/g, '√(')
}

/** A rational as a student reads it in a sentence: 3, −4, 1/2 (the minus is the typographic one). */
const plainRat = (r: Rat): string => texToPlain(rTex(r)).replace(/-/g, '−')

/** A polynomial in v as a student reads it: x² − 1, x + 1. */
const plainPoly = (p: Poly, v: string): string => texToPlain(pTex(p, v)).replace(/ - /g, ' − ').replace(/^-/, '−')

/** Brackets round a phrase that has a space or a sign in it, so "(x + 1)" reads as one factor. */
const bracket = (s: string): string => (/[\s+−-]/.test(s) ? `(${s})` : s)

/**
 * The point for the input line. A point that is a short fraction is written as one; any other point is shown as the
 * student typed it (1/3 as \frac{1}{3}, pi as \pi), because its decimal digits are not the point the student asked for.
 */
function pointLatexOf(spec: LimitSpec): string {
  if (!Number.isFinite(spec.point) || shortFraction(spec.point) || !spec.pointAsTyped) return pointTex(spec.point)
  const node = parseNode(spec.pointAsTyped)
  return node ? texOf(stripParens(node)) : pointTex(spec.point)
}

/** The limit as LaTeX, the way the working shows what it was asked: \lim_{x\to1} then the expression. */
function limitTexOf(spec: LimitSpec): string {
  const sup = spec.side > 0 ? '^{+}' : spec.side < 0 ? '^{-}' : ''
  const sub = Number.isFinite(spec.point) ? `${spec.variable}\\to ${pointLatexOf(spec)}${sup}` : `${spec.variable}\\to ${pointTex(spec.point)}`
  let body = spec.body
  try {
    const node = stripParens(math.parse(preprocess(spec.body)))
    body = texOf(node)
    // A sum is one expression under the limit: \lim_{x\to2}\left(3x+1\right), not \lim_{x\to2}3x+1.
    if (math.isOperatorNode(node) && (node.fn === 'add' || node.fn === 'subtract')) body = `\\left(${body}\\right)`
  } catch {
    // Shown as it was typed, which is still readable.
  }
  return `\\lim_{${sub}}\\,${body}`
}

/** A node with its brackets taken off: a bracket changes how a text reads, never what it means. */
function stripParens(node: MathNode): MathNode {
  let n = node
  while (math.isParenthesisNode(n)) n = n.content
  return n
}

function parseNode(body: string): MathNode | null {
  try {
    return math.parse(preprocess(body))
  } catch {
    return null
  }
}

/** The approach that counts: both sides for a point, one side when asked for it, and the one way out for ±∞. */
function approachDirs(point: number, side: 0 | 1 | -1): Side[] {
  if (!Number.isFinite(point)) return [point > 0 ? 1 : -1]
  return side === 0 ? [-1, 1] : [side]
}

/** Refusals in the student's words, or null when the limit can be asked. */
function refusal(spec: LimitSpec): string | null {
  if (!/^[A-Za-z]$/.test(spec.variable)) return 'A limit has to be taken in one letter, like x.'
  if (Number.isNaN(spec.point)) return 'The point the limit approaches has to be a number, ∞ or −∞.'
  if (!compileLimitBody(spec.body, spec.variable)) return `I can take a limit of an expression in ${spec.variable} alone. Give any other letter a value first.`
  return null
}

// ---------------------------------------------------------------------------------------------------------
// Rational functions
// ---------------------------------------------------------------------------------------------------------

/** The top and bottom of a fraction of polynomials in one letter, or null when the body is anything else. */
function ratFunction(body: string, v: string): { num: Poly; den: Poly } | null {
  try {
    const { num, den } = parseFraction(body)
    if ([...varsOf(num), ...varsOf(den)].some((name) => name !== v)) return null
    return { num: polyFromExpr(num, v).poly, den: polyFromExpr(den, v).poly }
  } catch {
    return null
  }
}

/** The factor (x − a) as LaTeX, with the sign written out; just x when a is 0. */
function factorTex(v: string, a: Rat): string {
  if (rIsZero(a)) return v
  return `(${v}${rIsNeg(a) ? '+' : '-'}${rTex(rAbs(a))})`
}

/** The factor (x − a) as a student reads it. */
const factorText = (v: string, point: number): string => (point === 0 ? v : `(${v} ${point < 0 ? '+' : '−'} ${shownNumber(Math.abs(point), 10)})`)

/**
 * A polynomial with each term divided by x^m: 3 + x^{-2} for 3x²+1 over x² (m = 2). The negative power keeps the
 * fraction from sitting inside another one; `plain` writes the same terms as a student does: 3 + 1/x².
 */
function dividedForm(p: Poly, m: number, v: string, plain: boolean): string {
  let out = ''
  for (let k = m; k >= 0; k--) {
    const c = p[k] ?? R0
    if (rIsZero(c)) continue
    const mag = rAbs(c)
    const power = m - k
    let term: string
    if (power === 0) term = plain ? ratText(mag) : rTex(mag)
    else if (plain) term = `${ratText(mag)}/${xPowText(power, v)}`
    else term = `${mag.n === 1n && mag.d === 1n ? '' : rTex(mag)}${v}^{-${power}}`
    out += out === '' ? (rIsNeg(c) ? (plain ? '−' : '-') : '') : rIsNeg(c) ? (plain ? ' − ' : ' - ') : ' + '
    out += term
  }
  return out === '' ? '0' : out
}

/** The same form as LaTeX, for the working's line. */
const dividedTex = (p: Poly, m: number, v: string): string => dividedForm(p, m, v, false)

/** The coefficient k of a bare k·x (one term, the letter to the first power), or null when it is anything else. */
function linearCoefficient(node: MathNode, v: string): Rat | null {
  try {
    const e = parseExpr(node.toString())
    if (e.length !== 1) return null
    const keys = Object.keys(e[0].v)
    return keys.length === 1 && keys[0] === v && e[0].v[v] === 1 ? e[0].c : null
  } catch {
    return null
  }
}

/** What the function does on each side, as the samples read it, for a finite point or for ±∞. */
function sideReadings(f: Fn, point: number, dirs: Side[]): { dir: Side; reading: Reading; b: Behaviour }[] {
  return dirs.map((dir) => {
    const reading = readingOf(f, point, dir)
    return { dir, reading, b: behaviourOf(reading) }
  })
}

/** The answer the two sides give together, or null when a side cannot be read. */
function answerFromSides(sides: { dir: Side; b: Behaviour }[]): LimitAnswer | null {
  if (sides.some((s) => s.b.kind === 'unclear')) return null
  if (sides.length === 1) {
    const b = sides[0].b
    return b.kind === 'value' ? estimate(b.value) : b.kind === 'grows' ? { kind: 'infinite', sign: b.sign } : null
  }
  const left = sides.find((s) => s.dir < 0)?.b
  const right = sides.find((s) => s.dir > 0)?.b
  if (!left || !right) return null
  if (sidesAgree(left, right)) {
    if (left.kind === 'value' && right.kind === 'value') return estimate((left.value + right.value) / 2)
    if (left.kind === 'grows' && right.kind === 'grows') return { kind: 'infinite', sign: left.sign }
    return null
  }
  return { kind: 'none', text: noLimitText(left, right) }
}

/** A value found from the samples: four figures, with the unrounded number kept for the claim check. */
function estimate(c: number): LimitAnswer {
  return { kind: 'value', value: settledValue(c), exact: null, check: c }
}

/** How one side goes, in words: it settles on a number, or grows without bound towards a sign of ∞. */
function sideFate(b: Behaviour): string {
  if (b.kind === 'value') return `settle on ${shownNumber(b.value, 6)}`
  if (b.kind === 'grows') return `grow without bound towards ${b.sign > 0 ? '+∞' : `${MINUS}∞`}`
  return 'do not settle'
}

const noLimitText = (left: Behaviour, right: Behaviour): string =>
  `The limit does not exist: from the left the values ${sideFate(left)}, and from the right they ${sideFate(right)}.`

/** The answer as LaTeX, for the working's answer line. */
function texOfAnswer(answer: LimitAnswer): string {
  if (answer.kind === 'value') return answer.exact ? rTex(answer.exact) : texNumber(answer.value)
  if (answer.kind === 'infinite') return answer.sign > 0 ? '\\infty' : '-\\infty'
  if (answer.kind === 'none') return '\\text{does not exist}'
  return ''
}

/** Whether a claimed answer agrees with the function's values at points on each side (every sample and probe). */
function verifies(f: Fn, point: number, dirs: Side[], answer: LimitAnswer): boolean {
  switch (answer.kind) {
    case 'value': {
      const target = answer.check ?? answer.value
      return dirs.every((dir) => holdsValue(readingOf(f, point, dir), target))
    }
    case 'infinite':
      return dirs.every((dir) => holdsGrows(readingOf(f, point, dir), answer.sign))
    case 'none': {
      if (dirs.length < 2) return false
      const bs = dirs.map((dir) => behaviourOf(readingOf(f, point, dir)))
      return bs.every((b) => b.kind !== 'unclear') && !sidesAgree(bs[0], bs[1])
    }
    default:
      return false
  }
}

/** The check line: the values nearest the point on each side, and the answer they support. */
function checkLine(spec: LimitSpec, f: Fn, dirs: Side[], answer: LimitAnswer): string {
  const nearest = dirs.map((dir) => {
    const samples = readingOf(f, spec.point, dir).samples
    const last = samples[samples.length - 1]
    return `f(${shownNumber(last.x, 6)}) = ${shownNumber(last.v, 6)}`
  })
  const conclusion =
    answer.kind === 'value'
      ? `so the limit is ${answer.check !== undefined && answer.exact === null ? 'about ' : ''}${shownNumber(answer.value, 10)}`
      : answer.kind === 'infinite'
        ? `so the limit is ${answer.sign > 0 ? '∞' : `${MINUS}∞`}`
        : 'so the limit does not exist'
  return `Checked against the values nearest the point: ${nearest.join(' and ')}, ${conclusion}.`
}

function attemptOf(spec: LimitSpec, f: Fn, dirs: Side[], steps: Steps, answer: LimitAnswer, method: string, answerTex?: string): Attempt {
  return {
    method,
    moves: [...steps.moves],
    answer,
    answerTex: answerTex ?? texOfAnswer(answer),
    check: checkLine(spec, f, dirs, answer),
    checked: verifies(f, spec.point, dirs, answer)
  }
}

/** The point is put in: "Put x = 1 into the top and the bottom". */
const putIn = (point: number): string => `Put x = ${pointText(point)} into the top and the bottom`

/** The method for a rational function: exact steps, then a numeric answer when the bottom stays 0. */
/**
 * The line where the point goes in, as LaTeX: \frac{top}{bottom}=value. A value already written as that same fraction is not
 * written twice, because a line that repeats itself is a step that changes nothing.
 */
function substitutedTex(top: Rat, bottom: Rat, value: Rat): string {
  const mid = `\\frac{${rTex(top)}}{${rTex(bottom)}}`
  return rTex(value) === mid ? mid : `${mid}=${rTex(value)}`
}

/**
 * A polynomial over its own leading power, at x: the sum of c_k x^(k − deg), which has no term larger than the leading
 * one. The quotient of two polynomials is this quotient times x^(deg top − deg bottom), so a power such as x^100 far out
 * along ∞ never has to be formed as a number that overflows.
 */
function scaledAt(p: Poly, x: number): number {
  const deg = pDeg(p)
  let sum = 0
  for (let k = 0; k < p.length; k++) {
    const c = p[k]
    if (c && !rIsZero(c)) sum += rNum(c) * x ** (k - deg)
  }
  return sum
}

/**
 * The function read in doubles, and where a double overflows (x^100 far out along ∞ is ∞/∞ although the quotient of
 * two such powers is small), read from the two polynomials instead, each over its own leading power. A point that is a
 * double is only read as the rounding of that double, and the result is good to the rounding of a double.
 */
function quotientFn(f: Fn, num: Poly, den: Poly): Fn {
  return (x: number): number => {
    const v = f(x)
    if (Number.isFinite(v) || !Number.isFinite(x)) return v
    const bottom = scaledAt(den, x)
    if (bottom === 0) return NaN
    return (scaledAt(num, x) / bottom) * x ** (pDeg(num) - pDeg(den))
  }
}

/** The pieces that are continuous wherever they are defined, so a point of their domain can be put in. */
const CONTINUOUS_FUNCTIONS: ReadonlySet<string> = new Set(['sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'abs', 'mag'])
const CONTINUOUS_OPERATORS: ReadonlySet<string> = new Set(['add', 'subtract', 'multiply', 'divide', 'pow', 'unaryMinus', 'unaryPlus'])

/** True when the body is built only from the continuous pieces above, the variable, π and e (and nothing else). */
function continuousBody(body: string, v: string): boolean {
  const node = parseNode(body)
  if (!node) return false
  let ok = true
  node.traverse((n, path) => {
    if (path === 'fn' || math.isConstantNode(n) || math.isParenthesisNode(n)) return
    if (math.isSymbolNode(n)) {
      if (n.name !== v && n.name !== 'pi' && n.name !== 'e' && n.name !== 'tau') ok = false
      return
    }
    if (math.isOperatorNode(n)) {
      if (!CONTINUOUS_OPERATORS.has(n.fn)) ok = false
      return
    }
    if (math.isFunctionNode(n)) {
      if (!CONTINUOUS_FUNCTIONS.has((n.fn as { name?: string }).name ?? '')) ok = false
      return
    }
    ok = false
  })
  return ok
}

/** The absolute value |x| as the Maths field writes it: mag(x) (math/expr.ts), or abs(x) as mathjs names it. */
const isAbsNode = (n: MathNode): boolean => math.isFunctionNode(n) && ['abs', 'mag'].includes((n.fn as { name?: string }).name ?? '')

/**
 * True when every quotient and power in the body is a finite number at the point. A bottom that is 0 there makes the
 * double read Infinity, and the value the whole body then gives is no evidence of its limit (e^(−1/x²) at 0).
 */
function singularitiesAvoided(body: string, v: string, point: number): boolean {
  const node = parseNode(body)
  if (!node) return false
  let ok = true
  node.traverse((n) => {
    if (!ok || !math.isOperatorNode(n) || (n.fn !== 'divide' && n.fn !== 'pow')) return
    const g = compileLimitBody(n.toString(), v)
    if (!g || !Number.isFinite(g(point))) ok = false
  })
  return ok
}

/** True when the node holds an absolute value, |…|, anywhere in it. */
function hasAbs(node: MathNode): boolean {
  let found = false
  node.traverse((n) => {
    if (isAbsNode(n)) found = true
  })
  return found
}

/**
 * The body with each |g(x)| put as ±g on the side d. g is a line that is 0 at the point a, with slope s, so on that side
 * g has the sign of s·d and |g| = (s·d)·g exactly. Null when an |…| is anything but such a line.
 */
function absRewrite(spec: LimitSpec, a: Rat, d: Side): { text: string; lines: string[] } | null {
  const node = parseNode(spec.body)
  if (!node) return null
  const lines: string[] = []
  let ok = true
  const out = node.transform((n) => {
    if (!isAbsNode(n) || !math.isFunctionNode(n) || n.args.length !== 1) return n
    const inner = stripParens(n.args[0])
    let poly: Poly
    try {
      poly = polyFromExpr(parseExpr(inner.toString()), spec.variable).poly
    } catch {
      ok = false
      return n
    }
    if (pDeg(poly) !== 1 || !rIsZero(pEval(poly, a))) {
      ok = false
      return n
    }
    const sign = (rIsNeg(poly[1]) ? -1 : 1) * d
    const shown = plainOf(inner)
    lines.push(
      `On the ${d > 0 ? 'right' : 'left'}, ${shown} is ${sign > 0 ? 'positive' : 'negative'} (${spec.variable} is ${d > 0 ? 'above' : 'below'} ${pointText(spec.point)}), so |${shown}| = ${sign > 0 ? shown : `−(${shown})`}.`
    )
    return math.parse(`(${sign}) * (${inner.toString()})`)
  })
  if (!ok || hasAbs(out)) return null
  return { text: out.toString(), lines }
}

/**
 * The answer for a fraction whose top is not 0 at the point a but whose bottom is: near a the bottom is (x − a)^m times a
 * second part Q that is not 0 at a, and (x − a) has the sign of its side, so each side's sign is that of top × Q × (x − a)^m.
 * Each side is written as a line of the working. Null when the reading does not apply.
 */
function infiniteAnswer(num: Poly, den: Poly, a: Rat, spec: LimitSpec, v: string, dirs: Side[], steps: Steps): LimitAnswer | null {
  const point = spec.point
  const na = pEval(num, a)
  if (rIsZero(na) || pIsZero(den)) return null
  let m = 0
  let q = den
  while (rIsZero(pEval(q, a))) {
    if (m >= 50) return null
    const cut = pDivMod(q, [rNeg(a), R1])
    if (!pIsZero(cut.r)) return null
    q = cut.q
    m++
  }
  if (m === 0 || pIsZero(q)) return null
  const qa = pEval(q, a)
  const topTex = pTex(num, v)
  const botTex = pTex(den, v)
  const power = m === 1 ? factorText(v, point) : `${factorText(v, point)}${raise(m)}`
  const powerTex = m === 1 ? factorTex(v, a) : `${factorTex(v, a)}^{${m}}`
  const base = (rIsNeg(na) ? -1 : 1) * (rIsNeg(qa) ? -1 : 1)
  steps.goal('Look at each side')
  steps.add(
    `The bottom is ${power} times ${bracket(plainPoly(q, v))}, and that second part is ${plainRat(qa)} at ${v} = ${pointText(point)}, not 0.`,
    `${botTex}=${powerTex}\\left(${pTex(q, v)}\\right)`
  )
  const sides = dirs.map((d) => ({ dir: d, sign: (base * (m % 2 === 1 ? d : 1)) as Side }))
  for (const s of sides) {
    const where = s.dir > 0 ? `From the right (${v} above ${pointText(point)})` : `From the left (${v} below ${pointText(point)})`
    const powerSign = m % 2 === 1 && s.dir < 0 ? 'negative' : 'positive'
    steps.add(
      `${where}: ${power} is ${powerSign}, the top is ${plainRat(na)} and the second part is ${plainRat(qa)}, so the fraction is ${s.sign > 0 ? 'positive' : 'negative'} and grows without bound towards ${s.sign > 0 ? '+∞' : `${MINUS}∞`}.`,
      `\\lim_{${v}\\to ${pointTex(point)}^{${s.dir > 0 ? '+' : '-'}}}\\frac{${topTex}}{${botTex}}=${s.sign > 0 ? '+\\infty' : '-\\infty'}`
    )
  }
  if (sides.length === 1) return { kind: 'infinite', sign: sides[0].sign }
  const [left, right] = sides
  if (left.sign === right.sign) {
    const word = left.sign > 0 ? '+∞' : `${MINUS}∞`
    steps.add(`Both sides grow without bound towards ${word}, so the limit is ${word}.`, left.sign > 0 ? '\\infty' : '-\\infty')
    return { kind: 'infinite', sign: left.sign }
  }
  steps.add('The two sides go to different infinities, so the limit does not exist.', '\\text{does not exist}')
  const leftWord = left.sign > 0 ? '+∞' : `${MINUS}∞`
  const rightWord = right.sign > 0 ? '+∞' : `${MINUS}∞`
  return { kind: 'none', text: `The limit does not exist: from the left the values grow without bound towards ${leftWord}, and from the right towards ${rightWord}.` }
}

/** What one side of a limit does, in words, for the sentence that joins the two sides. */
const sideWord = (answer: LimitAnswer): string =>
  answer.kind === 'value'
    ? `settle on ${shownNumber(answer.value, 6)}`
    : answer.kind === 'infinite'
      ? `grow without bound towards ${answer.sign > 0 ? '+∞' : `${MINUS}∞`}`
      : 'do not settle'

/**
 * The two one-sided answers as one limit: the same exact value or the same infinity from both sides, or else no limit.
 * Null when a side is not known.
 */
function joinSides(left: LimitAnswer, right: LimitAnswer): LimitAnswer | null {
  if (left.kind === 'unknown' || right.kind === 'unknown') return null
  if (left.kind === 'value' && right.kind === 'value' && left.exact && right.exact && left.exact.n * right.exact.d === right.exact.n * left.exact.d) {
    return { kind: 'value', value: left.value, exact: left.exact }
  }
  if (left.kind === 'infinite' && right.kind === 'infinite' && left.sign === right.sign) return { kind: 'infinite', sign: left.sign }
  return { kind: 'none', text: `The limit does not exist: from the left the values ${sideWord(left)}, and from the right they ${sideWord(right)}.` }
}

/**
 * A function with |g(x)| in it at a point: each side is the fraction with |g| put as ±g on that side, read exactly by the
 * rational rules, and the sides are joined. Null when an |…| is not a line through the point or a side is not rational.
 */
function absAttempt(spec: LimitSpec, f: Fn, dirs: Side[]): Attempt | null {
  const node = parseNode(spec.body)
  if (!node || !hasAbs(node) || !Number.isFinite(spec.point)) return null
  const a = shortFraction(spec.point)
  if (!a) return null
  const moves: Move[] = []
  const sides: LimitAnswer[] = []
  for (const d of dirs) {
    const rewritten = absRewrite(spec, a, d)
    if (!rewritten) return null
    const part = rationalAttempt({ ...spec, body: rewritten.text, side: d }, f, [d])
    if (!part) return null
    const head = new Steps()
    head.goal(d > 0 ? 'From the right' : 'From the left')
    for (const line of rewritten.lines) head.add(line)
    moves.push(...head.moves, ...part.moves)
    sides.push(part.answer)
  }
  const answer = sides.length === 1 ? sides[0] : joinSides(sides[0], sides[1])
  if (!answer || answer.kind === 'unknown') return null
  return { ...attemptOf(spec, f, dirs, new Steps(), answer, 'Looking at each side of the point'), moves }
}

function rationalAttempt(spec: LimitSpec, f: Fn, dirs: Side[]): Attempt | null {
  const parts = ratFunction(spec.body, spec.variable)
  if (!parts || pIsZero(parts.den)) return null
  const v = spec.variable
  const topTex = pTex(parts.num, v)
  const botTex = pTex(parts.den, v)
  const steps = new Steps()

  if (!Number.isFinite(spec.point)) {
    const m = Math.max(pDeg(parts.num), pDeg(parts.den), 0)
    const dn = pDeg(parts.num)
    const dd = pDeg(parts.den)
    // The values the answer is checked against are read in doubles, and exactly where a double overflows: a power such
    // as x^100 far out along ∞ overflows, and the exact quotient of the two powers is still small (see quotientFn).
    const ratioFn = quotientFn(f, parts.num, parts.den)
    steps.goal('Divide by the highest power')
    steps.add(
      `Divide every term of the top and the bottom by ${m === 0 ? '1' : xPowText(m, v)}, the highest power of ${v} in either: the top becomes ${dividedForm(parts.num, m, v, true)} and the bottom ${dividedForm(parts.den, m, v, true)}.`,
      `\\frac{${dividedTex(parts.num, m, v)}}{${dividedTex(parts.den, m, v)}}`
    )
    steps.add(
      `As ${v} goes to ${pointText(spec.point)}, every term with ${v} in the bottom goes to 0, and only the leading terms are left.`,
      `\\frac{1}{${xPowTex(1, v)}}\\to 0`
    )
    if (dn < dd) {
      steps.add(`Every term with ${v} in the top goes to 0 and the bottom stays a number other than 0, so the limit is 0.`, '0')
      return attemptOf(spec, ratioFn, dirs, steps, { kind: 'value', value: 0, exact: R0 }, 'Dividing by the highest power')
    }
    if (dn === dd) {
      const ratio = rDiv(pLead(parts.num), pLead(parts.den))
      steps.add(`The top goes to ${plainRat(pLead(parts.num))} and the bottom to ${plainRat(pLead(parts.den))}, so the limit is ${plainRat(ratio)}.`, rTex(ratio))
      return attemptOf(spec, ratioFn, dirs, steps, { kind: 'value', value: rNum(ratio), exact: ratio }, 'Dividing by the highest power')
    }
    // The top grows faster than the bottom: the sign is the ratio's, turned round by an odd power on the left.
    const ratio = rDiv(pLead(parts.num), pLead(parts.den))
    const flip = spec.point < 0 && (dn - dd) % 2 === 1 ? -1 : 1
    const sign: Side = (rIsNeg(ratio) ? -1 : 1) * flip === 1 ? 1 : -1
    steps.add(`The top grows without bound and the bottom settles, so the limit is ${sign > 0 ? '∞' : `${MINUS}∞`}.`, sign > 0 ? '\\infty' : '-\\infty')
    return attemptOf(spec, ratioFn, dirs, steps, { kind: 'infinite', sign }, 'Dividing by the highest power')
  }

  // The exact route needs an exact point. A decimal double such as 1/3 is not one, so the exact steps are skipped and
  // the values near the point decide, as they do for any point that is not a short fraction.
  const a = shortFraction(spec.point)
  if (!a) return null
  const at = pointTex(spec.point)
  const na = pEval(parts.num, a)
  const da = pEval(parts.den, a)
  if (!rIsZero(da)) {
    const value = rDiv(na, da)
    steps.goal('Put the point in')
    const denIsOne = parts.den.length === 1 && parts.den[0].n === 1n && parts.den[0].d === 1n
    if (pDeg(parts.den) === 0) {
      // Nothing is divided here: the expression is read off at the point, as a textbook does for 3x + 1 at 2.
      const over = denIsOne ? '' : ` over ${bracket(plainPoly(parts.den, v))}`
      steps.add(
        `Put ${v} = ${pointText(spec.point)} into ${bracket(plainPoly(parts.num, v))}${over}: it gives ${plainRat(value)}, so the limit is ${plainRat(value)}.`,
        denIsOne ? `\\lim_{${v}\\to ${at}}${/[+-]/.test(topTex) ? `\\left(${topTex}\\right)` : topTex}=${rTex(value)}` : `\\lim_{${v}\\to ${at}}\\frac{${topTex}}{${botTex}}=${rTex(value)}`
      )
    } else {
      steps.add(
        `${putIn(spec.point)}. The bottom is not 0 there, so the limit is the value of the fraction: ${plainRat(na)} over ${plainRat(da)}, which is ${plainRat(value)}.`,
        `\\lim_{${v}\\to ${at}}\\frac{${topTex}}{${botTex}}=${substitutedTex(na, da, value)}`
      )
    }
    return attemptOf(spec, f, dirs, steps, { kind: 'value', value: rNum(value), exact: value }, 'Putting the point in')
  }

  if (rIsZero(na)) {
    // Both are 0 at the point: each has the factor (x − a). Cancelling it changes the function only at x = a.
    steps.goal('Put the point in')
    steps.add(`${putIn(spec.point)}. Both are 0, so this is 0/0, which does not settle the limit yet.`, '\\frac{0}{0}')
    let num = parts.num
    let den = parts.den
    for (let guard = 0; guard < 10 && !pIsZero(num) && !pIsZero(den) && rIsZero(pEval(num, a)) && rIsZero(pEval(den, a)); guard++) {
      const cutTop = pDivMod(num, [rNeg(a), R1])
      const cutBottom = pDivMod(den, [rNeg(a), R1])
      if (!pIsZero(cutTop.r) || !pIsZero(cutBottom.r)) return null
      const factor = factorText(v, spec.point)
      const factorLatex = factorTex(v, a)
      steps.goal('Cancel the common factor')
      steps.add(
        `The top is 0 at ${v} = ${pointText(spec.point)}, so ${factor} is a factor of it: ${bracket(plainPoly(num, v))} = ${factor} × ${bracket(plainPoly(cutTop.q, v))}.`,
        `${pTex(num, v)}=${factorLatex}\\left(${pTex(cutTop.q, v)}\\right)`
      )
      steps.add(
        `The bottom is 0 there too, so ${factor} is a factor of it as well: ${bracket(plainPoly(den, v))} = ${factor} × ${bracket(plainPoly(cutBottom.q, v))}.`,
        `${pTex(den, v)}=${factorLatex}\\left(${pTex(cutBottom.q, v)}\\right)`
      )
      steps.add(
        `Cancel the common ${factor}. This is allowed where ${v} ≠ ${pointText(spec.point)}: a limit looks at ${v} near ${pointText(spec.point)}, never at ${v} = ${pointText(spec.point)} itself. For every ${v} except ${pointText(spec.point)} the fraction is ${bracket(plainPoly(cutTop.q, v))} over ${bracket(plainPoly(cutBottom.q, v))}.`,
        `\\frac{${pTex(num, v)}}{${pTex(den, v)}}=\\frac{${pTex(cutTop.q, v)}}{${pTex(cutBottom.q, v)}}\\quad(${v}\\neq ${pointTex(spec.point)})`
      )
      num = cutTop.q
      den = cutBottom.q
    }
    const na2 = pEval(num, a)
    const da2 = pEval(den, a)
    if (!rIsZero(da2)) {
      const value = rDiv(na2, da2)
      steps.goal('Substitute what is left')
      steps.add(
        `Put ${v} = ${pointText(spec.point)} into what is left: the top is ${plainRat(na2)} and the bottom is ${plainRat(da2)}, so the limit is ${plainRat(value)}.`,
        substitutedTex(na2, da2, value)
      )
      return attemptOf(spec, f, dirs, steps, { kind: 'value', value: rNum(value), exact: value }, 'Cancelling a common factor')
    }
    // The bottom is still 0 after the cancelling and the top is not: each side goes to an infinity, by its sign.
    const cancelled = infiniteAnswer(num, den, a, spec, v, dirs, steps)
    return cancelled ? attemptOf(spec, f, dirs, steps, cancelled, 'Looking at each side of the point') : null
  }

  // The top is not 0 at the point and the bottom is: the fraction has no value there, and each side goes to an infinity.
  steps.goal('Look at each side')
  steps.add(
    `${putIn(spec.point)}: the top is ${plainRat(na)}, not 0, and the bottom is 0, so it is ${plainRat(na)} over 0, which is not a number.`,
    `\\frac{${rTex(na)}}{0}`
  )
  const infinite = infiniteAnswer(parts.num, parts.den, a, spec, v, dirs, steps)
  return infinite ? attemptOf(spec, f, dirs, steps, infinite, 'Looking at each side of the point') : null
}

// ---------------------------------------------------------------------------------------------------------
// Standard limits
// ---------------------------------------------------------------------------------------------------------

/** sin(kx)/(mx) or (1 − cos(kx))/(mx): the k and m, when the body has exactly that shape. */
function standardParts(body: string, v: string): { kind: 'sin' | 'cos'; k: Rat; m: Rat } | null {
  const node = parseNode(body)
  if (!node) return null
  const whole = stripParens(node)
  if (!math.isOperatorNode(whole) || whole.fn !== 'divide') return null
  const top = stripParens(whole.args[0])
  let kind: 'sin' | 'cos'
  let inner: MathNode
  if (math.isFunctionNode(top) && top.args.length === 1 && (top.fn as { name?: string }).name === 'sin') {
    kind = 'sin'
    inner = top.args[0]
  } else if (math.isOperatorNode(top) && top.fn === 'subtract') {
    const one = stripParens(top.args[0])
    const cos = stripParens(top.args[1])
    if (!math.isConstantNode(one) || Number(one.value) !== 1 || !math.isFunctionNode(cos) || (cos.fn as { name?: string }).name !== 'cos') return null
    kind = 'cos'
    inner = cos.args[0]
  } else {
    return null
  }
  const k = linearCoefficient(inner, v)
  const m = linearCoefficient(whole.args[1], v)
  if (!k || !m || rIsZero(k) || rIsZero(m)) return null
  return { kind, k, m }
}

/** kx as LaTeX: x, −x, 2x, \frac{1}{2}x. */
function termTex(c: Rat, v: string): string {
  if (c.n === 1n && c.d === 1n) return v
  if (c.n === -1n && c.d === 1n) return `-${v}`
  return `${rTex(c)}${v}`
}

/** A rational as a student reads it: 3, −2, (1/2). */
function ratText(c: Rat): string {
  const sign = c.n < 0n ? '−' : ''
  const top = (c.n < 0n ? -c.n : c.n).toString()
  return c.d === 1n ? `${sign}${top}` : `${sign}(${top}/${c.d})`
}

/** kx as a student reads it: x, −x, 2x, (1/2)x. */
function plainTermOf(c: Rat, v: string): string {
  if (c.n === 1n && c.d === 1n) return v
  if (c.n === -1n && c.d === 1n) return `−${v}`
  return `${ratText(c)}${v}`
}

function standardAttempt(spec: LimitSpec, f: Fn, dirs: Side[]): Attempt | null {
  if (spec.point !== 0) return null
  const parts = standardParts(spec.body, spec.variable)
  if (!parts) return null
  const v = spec.variable
  const kx = termTex(parts.k, v)
  const mx = termTex(parts.m, v)
  const ratio = rDiv(parts.k, parts.m)
  // With u = kx the bottom mx is (m/k)·u, so the fraction is (k/m) times a fraction of the standard form in u.
  const bottomInU = ratText(rDiv(parts.m, parts.k))
  const steps = new Steps()
  steps.goal('Use a standard limit')
  steps.add('Put x = 0 in: the top is 0 and the bottom is 0, so this is 0/0, which does not settle the limit.', '\\frac{0}{0}')
  if (parts.kind === 'sin') {
    steps.add(
      `This is the standard limit sin u / u → 1 as u → 0. Take u = ${plainTermOf(parts.k, v)}. The bottom ${plainTermOf(parts.m, v)} is ${bottomInU}·u, so the fraction equals ${ratText(ratio)} × sin u / u.`,
      `\\frac{\\sin(${kx})}{${mx}}=${rTex(ratio)}\\cdot\\frac{\\sin(${kx})}{${kx}}`,
      '\\lim_{u\\to 0}\\frac{\\sin u}{u}=1'
    )
    steps.add(`As ${v} goes to 0 the second fraction goes to 1, so the limit is ${ratText(ratio)}.`, `${rTex(ratio)}\\cdot 1=${rTex(ratio)}`)
    return attemptOf(spec, f, dirs, steps, { kind: 'value', value: rNum(ratio), exact: ratio }, 'Standard limit')
  }
  steps.add(
    `This is the standard limit (1 − cos u)/u → 0 as u → 0. Take u = ${plainTermOf(parts.k, v)}. The bottom ${plainTermOf(parts.m, v)} is ${bottomInU}·u, so the fraction goes to 0.`,
    `\\frac{1-\\cos(${kx})}{${mx}}\\to 0`,
    '\\lim_{u\\to 0}\\frac{1-\\cos u}{u}=0'
  )
  return attemptOf(spec, f, dirs, steps, { kind: 'value', value: 0, exact: R0 }, 'Standard limit')
}

// ---------------------------------------------------------------------------------------------------------
// Substitution, the numbers near the point, and L'Hopital's rule
// ---------------------------------------------------------------------------------------------------------

/**
 * The number as a fraction when it is a short one as written (−0.5 is −1/2, 0.75 is 3/4), or null for a decimal that
 * is not: a value such as 0.3333333333333333 is left a decimal rather than given a fraction with a long denominator.
 */
function shortFraction(v: number): Rat | null {
  const r = rFromNumber(v)
  return r.d <= 10000n ? r : null
}

/**
 * Whether a substituted value is a residue of the point's rounding rather than a value. The point is a double, so the
 * function is read a rounding of the point away from where it was asked, and that moves the value by its slope times
 * the rounding (cos(π/2) comes out as 6·10⁻¹⁷ because π is a double). The slope is measured, so the test is relative to
 * the function and has no fixed floor: a constant 10⁻¹⁶ is kept, as it is not moved by a rounding of the point.
 */
function isPointRounding(f: Fn, point: number, value: number): boolean {
  if (value === 0) return true
  const h = 1e-5 * Math.max(1, Math.abs(point))
  const slope = (f(point + h) - f(point - h)) / (2 * h)
  if (!Number.isFinite(slope)) return false
  return Math.abs(value) <= 4 * Number.EPSILON * Math.abs(point) * Math.abs(slope)
}

function isTrigBounded(n: MathNode): boolean {
  if (math.isFunctionNode(n) && (n.fn as { name?: string }).name) {
    const name = (n.fn as { name?: string }).name
    return name === 'sin' || name === 'cos'
  }
  return false
}

/** Squeeze theorem for functions with bounded oscillations (such as x·sin(1/x) as x→0, or sin(x)/x as x→∞). */
function squeezeAttempt(spec: LimitSpec, f: Fn, dirs: Side[]): Attempt | null {
  const v = spec.variable
  const whole = parseNode(spec.body)
  if (!whole) return null
  const node = stripParens(whole)

  let boundedNode: MathNode | null = null
  let envelopeNode: MathNode | null = null

  if (math.isOperatorNode(node) && node.fn === 'multiply' && node.args.length === 2) {
    const a = stripParens(node.args[0])
    const b = stripParens(node.args[1])
    if (isTrigBounded(a)) {
      boundedNode = a
      envelopeNode = b
    } else if (isTrigBounded(b)) {
      boundedNode = b
      envelopeNode = a
    }
  } else if (math.isOperatorNode(node) && node.fn === 'divide' && node.args.length === 2) {
    const num = stripParens(node.args[0])
    const den = stripParens(node.args[1])
    if (isTrigBounded(num)) {
      boundedNode = num
      envelopeNode = math.parse(`1 / (${den.toString()})`)
    }
  }

  if (!boundedNode || !envelopeNode) return null

  // Check if envelope goes to 0 as x -> spec.point
  const gFn = compileLimitBody(envelopeNode.toString(), v)
  if (!gFn) return null
  const gReading = dirs.map((dir) => readingOf(gFn, spec.point, dir))
  if (!gReading.every((r) => holdsValue(r, 0))) return null

  // Verify that f itself holds 0
  const fReading = dirs.map((dir) => readingOf(f, spec.point, dir))
  if (!fReading.every((r) => holdsValue(r, 0))) return null

  const steps = new Steps()
  const trigName = ((boundedNode as unknown as { fn?: { name?: string } }).fn?.name) ?? 'trig'
  const boundedTex = boundedNode.toTex()
  const pTex = pointText(spec.point)

  steps.goal('Apply the Squeeze Theorem')
  steps.add(
    `The ${trigName} factor is bounded between -1 and 1: -1 \\le ${boundedTex} \\le 1 for all ${v} in the domain.`,
    `-1 \\le ${boundedTex} \\le 1`
  )
  steps.add(
    `As ${v} \\to ${pTex}, the bounding factor tends to 0.`,
    `\\lim_{${v}\\to ${pTex}} ${envelopeNode.toTex()} = 0`
  )
  steps.add(
    `By the Squeeze Theorem, the limit is 0.`,
    `\\lim_{${v}\\to ${pTex}} ${spec.body} = 0`
  )

  const ans: LimitAnswer = { kind: 'value', value: 0, exact: R0 }
  return attemptOf(spec, f, dirs, steps, ans, 'Squeeze Theorem', '0')
}

/** The function's value at the point, when it is a number and the values next to the point agree with it. */
function substitutionAttempt(spec: LimitSpec, f: Fn, dirs: Side[]): Attempt | null {
  if (!Number.isFinite(spec.point)) return null
  // Putting the point in is exact only where the function is continuous: a floor, a sign or a condition may jump
  // at the point and still give a number there, so only the continuous pieces are read this way.
  if (!continuousBody(spec.body, spec.variable) || !singularitiesAvoided(spec.body, spec.variable, spec.point)) return null
  const raw = f(spec.point)
  if (!Number.isFinite(raw)) return null
  // cos(π/2) comes out as 6·10⁻¹⁷; a student is shown 0, not a 17-digit decimal.
  const value = isPointRounding(f, spec.point, raw) ? 0 : raw
  const exact = shortFraction(value)
  const steps = new Steps()
  steps.goal('Put the point in')
  steps.add(
    `Put x = ${pointText(spec.point)} into the function. It gives ${shownNumber(value, 10)}, and the values next to ${pointText(spec.point)} agree with that number.`,
    `f(${pointTex(spec.point)})=${exact ? rTex(exact) : texNumber(value)}`
  )
  return attemptOf(spec, f, dirs, steps, { kind: 'value', value, exact }, 'Putting the point in')
}

/**
 * The values near the point on each side, and what they settle on. This is the working of last resort: each
 * line is one of the samples the check uses, so the answer it gives is the one those values support. The probes
 * that the answer must also meet are not listed; they only refuse an answer the samples alone would give.
 */
function lookupAttempt(spec: LimitSpec, f: Fn, dirs: Side[], prefix?: Steps): Attempt | null {
  const sides = sideReadings(f, spec.point, dirs)
  const answer = answerFromSides(sides)
  if (!answer) return null
  const steps = prefix ?? new Steps()
  steps.goal('Check values near the point')
  for (const side of sides) {
    const where = Number.isFinite(spec.point)
      ? side.dir > 0
        ? `From the right (x above ${pointText(spec.point)})`
        : `From the left (x below ${pointText(spec.point)})`
      : side.dir > 0
        ? 'As x goes to +∞'
        : `As x goes to ${MINUS}∞`
    const list = side.reading.samples.map((s) => `f(${shownNumber(s.x, 6)}) = ${shownNumber(s.v, 6)}`).join(', ')
    steps.add(`${where}: ${list}.`)
  }
  const conclusion =
    answer.kind === 'value'
      ? `The values settle on ${shownNumber(answer.value, 10)}, so the limit is ${shownNumber(answer.value, 10)}${answer.check !== undefined && answer.exact === null ? ' (to these figures)' : ''}.`
      : answer.kind === 'infinite'
        ? `The values grow without bound, so the limit is ${answer.sign > 0 ? '∞' : `${MINUS}∞`}.`
        : answer.kind === 'none'
          ? answer.text
          : ''
  steps.add(conclusion, texOfAnswer(answer))
  return attemptOf(spec, f, dirs, steps, answer, 'Looking at the values near the point')
}

/** Whether top and bottom both go to 0 on every side (or both grow without bound), so L'Hopital's rule applies. */
function indeterminate(fTop: Fn, fBottom: Fn, point: number, dirs: Side[]): 'zero' | 'infinite' | null {
  const tops = dirs.map((dir) => readingOf(fTop, point, dir))
  const bottoms = dirs.map((dir) => readingOf(fBottom, point, dir))
  if (tops.every((t, i) => tendsToZero(t) && tendsToZero(bottoms[i]))) return 'zero'
  const grows = (r: Reading): boolean => behaviourOf(r).kind === 'grows'
  if (tops.every(grows) && bottoms.every(grows)) return 'infinite'
  return null
}

/** L'Hopital's rule for a fraction whose top and bottom are both 0 (or both infinite) at the point, at most twice. */
function lhopitalAttempt(spec: LimitSpec, f: Fn, dirs: Side[], depth: number): Attempt | null {
  if (depth >= 2) return null
  const v = spec.variable
  const whole = parseNode(spec.body)
  const node = whole ? stripParens(whole) : null
  if (!node || !math.isOperatorNode(node) || node.fn !== 'divide') return null
  const top = stripParens(node.args[0])
  const bottom = stripParens(node.args[1])
  const fTop = compileLimitBody(top.toString(), v)
  const fBottom = compileLimitBody(bottom.toString(), v)
  if (!fTop || !fBottom) return null
  const kind = indeterminate(fTop, fBottom, spec.point, dirs)
  if (!kind) return null
  let dTop: MathNode
  let dBottom: MathNode
  try {
    dTop = math.derivative(top, v)
    dBottom = math.derivative(bottom, v)
  } catch {
    return null
  }
  const dTopText = dTop.toString()
  const dBottomText = dBottom.toString()
  const dfTop = compileLimitBody(dTopText, v)
  const dfBottom = compileLimitBody(dBottomText, v)
  if (!dfTop || !dfBottom) return null
  if (!derivativeMatches(fTop, dfTop) || !derivativeMatches(fBottom, dfBottom)) return null
  const sub = solve({ ...spec, body: `((${dTopText})/(${dBottomText}))` }, depth + 1)
  if (!sub) return null

  const steps = new Steps()
  const form = kind === 'zero' ? '0/0' : '∞/∞'
  const formTex = kind === 'zero' ? '\\frac{0}{0}' : '\\frac{\\infty}{\\infty}'
  steps.goal("Use L'Hôpital's rule")
  steps.add(
    `${putIn(spec.point)}: both ${kind === 'zero' ? 'go to 0' : 'grow without bound'}, so this is ${form}, which does not settle the limit.`,
    formTex
  )
  steps.add(
    "L'Hôpital's rule: for 0/0 or ∞/∞, the limit of the ratio is the limit of the ratio of the derivatives, when that one has a limit.",
    `\\lim\\frac{f(${v})}{g(${v})}=\\lim\\frac{f'(${v})}{g'(${v})}`
  )
  steps.add(
    `Differentiate the top: the derivative of ${plainOf(top)} is ${plainOf(dTop)}.`,
    `\\frac{d}{d${v}}\\left(${texOf(top)}\\right)=${texOf(dTop)}`
  )
  steps.add(
    `Differentiate the bottom: the derivative of ${plainOf(bottom)} is ${plainOf(dBottom)}.`,
    `\\frac{d}{d${v}}\\left(${texOf(bottom)}\\right)=${texOf(dBottom)}`
  )
  return {
    method: "L'Hôpital's rule",
    moves: [...steps.moves, ...sub.moves],
    answer: sub.answer,
    answerTex: sub.answerTex,
    // The check line is the original function's values, not the derivative ratio's: the numbers printed are the ones the
    // student asked about. The verdict itself is the same test the answer passed.
    check: checkLine(spec, f, dirs, sub.answer),
    checked: verifies(f, spec.point, dirs, sub.answer)
  }
}

// ---------------------------------------------------------------------------------------------------------
// The one search
// ---------------------------------------------------------------------------------------------------------

/**
 * The first method that gives an answer the function agrees with, or null. A method's answer is only ever the
 * one it checked: the caller never sees an unchecked one.
 */
function solve(spec: LimitSpec, depth: number): Attempt | null {
  const f = compileLimitBody(spec.body, spec.variable)
  if (!f) return null
  const dirs = approachDirs(spec.point, spec.side)
  // Only exact rules here: the values near the point are never a checked answer (see workOutLimit).
  const methods: (() => Attempt | null)[] = [
    () => rationalAttempt(spec, f, dirs),
    () => absAttempt(spec, f, dirs),
    () => standardAttempt(spec, f, dirs),
    () => squeezeAttempt(spec, f, dirs),
    () => substitutionAttempt(spec, f, dirs),
    () => lhopitalAttempt(spec, f, dirs, depth)
  ]
  for (const method of methods) {
    const attempt = method()
    if (attempt?.checked) return attempt
  }
  return null
}

/** Said instead of a working when only the values near the point are left: an estimate, never a checked answer. */
const NOT_EXACT = 'I could not work this limit out by a rule I can check, so this value is only an estimate from the values near the point. I will not show a working for it.'

/**
 * Work a limit out: the answer, and the working that shows it, every line checked. An answer from an exact rule is
 * checked when the function's values agree with it. When no rule answers, the values near the point may give an
 * estimate: that is shown as an estimate (checked is false, and there is no working), never as a checked answer.
 */
export function workOutLimit(lim: LimitCall | LimitSpec): LimitOutcome {
  const spec: LimitSpec = {
    body: lim.body,
    variable: lim.variable,
    point: lim.point,
    side: lim.side,
    ...(lim.pointAsTyped === undefined ? {} : { pointAsTyped: lim.pointAsTyped })
  }
  const refused = refusal(spec)
  if (refused) return { working: failed('Limit', limitTexOf(spec), refused), answer: { kind: 'unknown', reason: refused }, checked: false }
  const found = solve(spec, 0)
  if (found) {
    const working: Working = {
      title: 'Limit',
      input: limitTexOf(spec),
      method: found.method,
      moves: found.moves,
      answers: [{ label: 'Answer', tex: found.answerTex }],
      check: found.check,
      checked: 'ok'
    }
    return { working, answer: found.answer, checked: true }
  }
  const f = compileLimitBody(spec.body, spec.variable)
  const estimate = f ? lookupAttempt(spec, f, approachDirs(spec.point, spec.side)) : null
  if (estimate && estimate.checked && estimate.answer.kind !== 'unknown') {
    return { working: failed('Limit', limitTexOf(spec), NOT_EXACT), answer: estimate.answer, checked: false }
  }
  return { working: failed('Limit', limitTexOf(spec), NOT_CHECKED), answer: { kind: 'unknown', reason: NOT_CHECKED }, checked: false }
}

/**
 * What a line that claims a limit ("= 7") says about the claim, in a sentence, or null when there is nothing to
 * compare with. The claim is read by the same arithmetic as the rest of the line (a bare number, Infinity or −Infinity).
 */
export function claimSentence(answer: LimitAnswer, claimed: string): { holds: boolean; text: string } | null {
  if (answer.kind === 'unknown') return null
  let target: number
  try {
    target = Number(math.evaluate(preprocess(claimed)))
  } catch {
    return null
  }
  if (Number.isNaN(target)) return null
  const claimText = shownNumber(target, 10)
  if (answer.kind === 'none') return { holds: false, text: 'The limit does not exist, so the statement is false.' }
  if (answer.kind === 'infinite') {
    // A finite claim is never ∞, and ∞ is never a finite limit: the test is exact, not a tolerance.
    const holds = target === answer.sign * Infinity
    const limitText = answer.sign > 0 ? '∞' : `${MINUS}∞`
    return { holds, text: holds ? `The limit is ${limitText}, so the statement is true.` : `The limit is ${limitText}, not ${claimText}, so the statement is false.` }
  }
  if (!Number.isFinite(target)) return { holds: false, text: `The limit is ${shownNumber(answer.value, 10)}, not ${claimText}, so the statement is false.` }
  if (answer.exact) {
    // An exact value is compared with the claim to the rounding of the figures typed, relative to the sizes compared.
    const holds = Math.abs(answer.value - target) <= 1e-9 * Math.max(Math.abs(answer.value), Math.abs(target))
    const limitText = shownNumber(answer.value, 10)
    return { holds, text: holds ? `The limit is ${limitText}, so the statement is true.` : `The limit is ${limitText}, not ${claimText}, so the statement is false.` }
  }
  // A value found from the samples is only as close as the samples are, so it is never called "true": it is compared with
  // the claim at the figures it is shown to (four for a sampled value, ten for a substituted decimal), and it agrees
  // when both read the same at those figures. No absolute slack is used, so a value of 10⁻¹⁰ is not 0.
  const sampled = answer.check !== undefined
  const figures = sampled ? 4 : 10
  const holds = Number(toPrecisionHalfAway(target, figures)) === Number(toPrecisionHalfAway(answer.value, figures))
  const limitText = shownNumber(answer.value, 10)
  const about = sampled ? 'about ' : ''
  return {
    holds,
    text: holds
      ? `The limit is ${about}${limitText}, which agrees with ${claimText} to the figures shown.`
      : `The limit is ${about}${limitText}, not ${claimText}, so the statement is false.`
  }
}

/** Work it out for a line of linear text (lim(f, x, a[, side]), with an optional "= claim"): the job's own entry. */
export function limitWorking(src: string): Working {
  const lim = limitCall(src)
  if (!lim) return failed('Limit', src, 'Type a limit, like \\lim_{x\\to 1}\\frac{x^2-1}{x-1}.')
  const out = workOutLimit(lim)
  if (out.working.error || lim.claimed === undefined) return out.working
  const claim = claimSentence(out.answer, lim.claimed)
  if (!claim) return out.working
  return { ...out.working, check: [out.working.check, claim.text].filter(Boolean).join(' ') }
}

/**
 * Whether a claimed answer to a limit is refused by the function's own values: 'failed' when they do not agree,
 * 'ok' when they do. The working uses the same test on each answer it gives; this exposes it for a claim made by hand.
 */
export function checkClaim(body: string, variable: string, point: number, side: 0 | 1 | -1, answer: LimitAnswer): 'ok' | 'failed' {
  const f = compileLimitBody(body, variable)
  if (!f) return 'failed'
  return verifies(f, point, approachDirs(point, side), answer) ? 'ok' : 'failed'
}

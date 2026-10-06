// Numeric engine behind the calculator panel (fx-991EX feature set and more).

import type { MathNode } from 'mathjs'
import { fromRadians, getAngleMode, math, preprocess, setAngleMode, splitArgs } from '../math/expr'
import { fmtPrecise, fmtSci, superscriptPowers, texSci, type DigitSettings } from '../math/format'
import { constantScope } from './constants'
import { OWN_LETTERS } from './errors'
import { calcNum, mathFormatOptions } from './format'

// ---------------------------------------------------------------------------
// Input normalisation: calculator key symbols → mathjs
// ---------------------------------------------------------------------------

export function casioToMath(src: string): string {
  let s = src
    // A plain × is a multiplication, always. This used to turn every "×10" into "*10^" whether or
    // not a power followed it, so 2×100 came out as 2, 3×10+1 as 30 and 2×10 was a syntax error — on
    // every route that hands a literal × here (matrix lines, spreadsheet cells, the with-values boxes).
    // 1.6×10^-19 still reads 1.6e-19: as a product, ^ binds first.
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, '-')
    // ᴇ is the standard-form mark, and what it makes is ONE number: 2ᴇ3 is the literal 2e3 and
    // 1.6ᴇ−19 is 1.6e-19, so 1 ÷ 2ᴇ3 divides by 2000. Turning ᴇ into "*10^" read it as 1 ÷ 2 × 10³ =
    // 500, a thousand times too big, with no error to warn anyone. (The ×10ˣ key's own mark in the
    // field is turned into the same e-number by latexToMath.) The mantissa must start its own number
    // (no letter or dot before it, so x2ᴇ3 is not the literal x2e3) and the exponent must be a whole
    // number (2ᴇ3.5 is not a literal).
    .replace(/(^|[^\p{L}\p{N}_.])(\d+(?:\.\d*)?|\.\d+)ᴇ\s*([+-]?\d+)(?![\d.])/gu, '$1$2e$3')
    // Any other ᴇ has no number to join — it follows a bracket, a letter or Ans, as in (1+2)ᴇ3 — so it
    // stays "times ten to the", as it always was.
    .replace(/ᴇ/g, '*10^')
    .replace(/ˣ√\(/g, 'nthRootC(')
    // A percent takes the whole number in front of it, an e-number included: 3e2% is 300%, not "3e" and 2%.
    // "Whole" is the number the ᴇ rule above reads — a leading or a trailing dot is part of it — so .5e2% and
    // 2.e3% are not cut at their dot: a digit first and digits after the dot took only "5e2" out of ".5e2%"
    // (".(5e2/100)" is no line) and only the 3 of "2.e3%" ("2.e(3/100)": "no function called e"). A number
    // with a digit or a dot right before it is only the tail of a longer one (the 2.5 of 1.2.5%) and is left
    // alone, so the line is refused: it used to become "1.(2.5/100)", which reads as 1. × 0.025 and answered 0.025.
    .replace(/(?<![\d.])(\d+(?:\.\d*)?|\.\d+)(e[-+]?\d+)?%/g, '($1$2/100)')
    .replace(/\bAns\b/g, 'Ans')
  // Degrees-minutes-seconds: 30°15'20"
  s = s.replace(/(\d+(?:\.\d+)?)°(\d+(?:\.\d+)?)'(?:(\d+(?:\.\d+)?)")?/g, (_m, d, m, sec) => `(${d}+${m}/60+${sec ?? 0}/3600)`)
  return preprocess(s)
}

// ---------------------------------------------------------------------------
// Calculus helpers
// ---------------------------------------------------------------------------

export function derivativeAt(f: (x: number) => number, x: number): number {
  const h = 1e-3 * Math.max(1, Math.abs(x))
  return (-f(x + 2 * h) + 8 * f(x + h) - 8 * f(x - h) + f(x - 2 * h)) / (12 * h)
}

// What the Maths screen says when an integral cannot be worked out (H9). They start alike, and none
// uses the words "function", "expected", "infinity", "bracket" or "must be": calc/errors.ts hides the
// small print of a message that has "function" or "expected:" in it, turns "infinity" into "That
// divides by zero." and "must be" into "Those numbers do not fit this function."
const NO_VALUE = 'The area cannot be worked out: the expression has no value at some points between the limits — perhaps a root of a negative number, or 0 ÷ 0.'
const GROWS_WITHOUT_LIMIT = 'The area cannot be worked out: the expression grows without limit at some point between the limits — like 1 ÷ 0 or ln 0 does.'
const BAD_LIMITS = 'The area cannot be worked out: the limits have to be ordinary numbers.'
const TOO_MUCH = 'The area cannot be worked out: there is too much going on between the limits. Try limits closer together, or split it into parts.'

// The same for a Σ or a Π (H13). They start "That sum" or "That product", which calc/errors.ts passes
// through as the headline, and use none of the words above either. A product has factors where a sum
// has terms. Each says what is wrong — too long, too much work inside it, or a limit that is no number —
// so the advice under it is the right one.
type SeriesKind = 'sum' | 'product'
const WORDS: Record<SeriesKind, { each: string; verb: string }> = {
  sum: { each: 'terms', verb: 'add' },
  product: { each: 'factors', verb: 'multiply' }
}
/** This sum or product alone has more terms than a line may have (the budget below is a million). */
function tooLong(kind: SeriesKind): string {
  const { each, verb } = WORDS[kind]
  return `That ${kind} has too many ${each} to ${verb} one by one — use a million ${each} or fewer.`
}
/** Each is affordable but everything inside the line together is not: sums in sums, an integral for every term. */
function tooMuchWork(kind: SeriesKind): string {
  const { each, verb } = WORDS[kind]
  return `That ${kind} is too much work to ${verb} one by one — everything inside it counts, and it comes to more than a million calculations. Use fewer ${each}.`
}
const badLimits = (kind: SeriesKind): string => `That ${kind} needs ordinary numbers for its limits — not ∞, and nothing too big to count up to.`

/**
 * What one line built on an integral may spend, in evaluations of the integrand. A smooth integrand
 * takes a few hundred, a cusp or a few hundred ripples some tens of thousands. The recursion halves its
 * tolerance at every split, so a wild integrand (sin 1/x down to 10⁻⁹) asks for up to 2⁴⁸ of them
 * whatever the depth cap says — a frozen app. Counted in evaluations, not seconds, so one line gives
 * the same answer, or the same sentence, on every machine. A Σ or Π typed inside spends its terms from
 * this same budget (H13), or its integrand would be asked for a million terms eighty times over.
 */
const INTEGRAL_BUDGET = 300_000
/**
 * What one line built on a Σ or a Π may spend, in terms: a million (the sentences say so, in words).
 * A sum typed by hand is a hundred terms, a thousand, or a hundred thousand to watch a series settle;
 * a million of them take about half a second here, so no real sum meets the limit, while 10¹² or ∞
 * went round for ever (H13). Counted in terms, not seconds, for the same reason as above.
 */
const SERIES_BUDGET = 1_000_000
/**
 * The largest limit a Σ or Π counts from or up to: 9×10¹⁵, under 2⁵³. From 2⁵³ on, k + 1 is k again, so a
 * loop counting up from a limit like 10¹⁷ stood still and never ended, although it was one term.
 */
const COUNTABLE = 9e15
/** What the line in progress has spent: the integrand evaluations of every integral in it, the terms of every Σ and Π in it. */
let workSpent = 0
/** What that line may spend, and whose words say so when it has run out: the calculus function the line starts with sets both. */
let workLimit = INTEGRAL_BUDGET
let workOwner: 'area' | SeriesKind = 'area'
/** Integrals, Σ and Π in progress, one inside another: 1 is the one typed. The budget starts again at 0 when none is. */
let workNesting = 0

/** A calculus function starts work: the outermost one sets the budget, one inside it spends from that. */
function beginWork(owner: 'area' | SeriesKind): void {
  if (workNesting === 0) {
    workSpent = 0
    workOwner = owner
    workLimit = owner === 'area' ? INTEGRAL_BUDGET : SERIES_BUDGET
  }
  workNesting++
}

/** The sentence for a line that has spent its whole budget, in the words of what the line is built on. */
const outOfWork = (): Error => new Error(workOwner === 'area' ? TOO_MUCH : tooMuchWork(workOwner))

/**
 * Whose budget an equation's search spends (H14): the first ∫, Σ or Π typed in it, which is the outermost, as
 * in a plain line. An equation with none of them spends nothing, so the answer for it is never read.
 */
function workOwnerOf(src: string): 'area' | SeriesKind {
  const first = /\b(integral|sigma|product)\s*\(/.exec(src)?.[1]
  return first === 'sigma' ? 'sum' : first === 'product' ? 'product' : 'area'
}

/** Runs `run` as ONE line of work: everything it spends, however many times it asks, comes out of a single budget. */
function withOneBudget<T>(owner: 'area' | SeriesKind, run: () => T): T {
  beginWork(owner)
  try {
    return run()
  } finally {
    workNesting--
  }
}

export function integrate(f: (x: number) => number, a: number, b: number, tol = 1e-10): number {
  // Limits that are not numbers (∞, 1 ÷ 0, a unit) or so far apart that the distance overflows never
  // reach the integrand: the grid below would be NaN, and the recursion never meets a NaN tolerance.
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(b - a)) throw new Error(BAD_LIMITS)
  if (a === b) return 0
  beginWork('area')
  try {
    // Every value is checked before Simpson's rule sees it. A NaN makes "close enough?" false at every
    // level, so the recursion split forever (H9: ∫ of x^(1/3) from −8 to 8 froze the app).
    let peak = 0
    const sample = (x: number): number => {
      if (++workSpent > workLimit) throw outOfWork()
      const y = f(x)
      if (!Number.isFinite(y)) throw new Error(Number.isNaN(y) ? NO_VALUE : GROWS_WITHOUT_LIMIT)
      if (Math.abs(y) > peak) peak = Math.abs(y)
      return y
    }
    const simpson = (fa: number, fm: number, fb: number, a0: number, b0: number) => ((b0 - a0) / 6) * (fa + 4 * fm + fb)
    const rec = (a0: number, b0: number, fa: number, fm: number, fb: number, whole: number, eps: number, depth: number): number => {
      const m = (a0 + b0) / 2
      const lm = (a0 + m) / 2
      const rm = (m + b0) / 2
      const flm = sample(lm)
      const frm = sample(rm)
      const left = simpson(fa, flm, fm, a0, m)
      const right = simpson(fm, frm, fb, m, b0)
      if (depth > 48 || Math.abs(left + right - whole) <= 15 * eps) return left + right + (left + right - whole) / 15
      return rec(a0, m, fa, flm, fm, left, eps / 2, depth + 1) + rec(m, b0, fm, frm, fb, right, eps / 2, depth + 1)
    }
    // Split into pieces so narrow features are not missed.
    const pieces = 16
    let total = 0
    for (let i = 0; i < pieces; i++) {
      const a0 = a + ((b - a) * i) / pieces
      const b0 = a + ((b - a) * (i + 1)) / pieces
      const fa = sample(a0)
      const fb = sample(b0)
      const fm = sample((a0 + b0) / 2)
      total += rec(a0, b0, fa, fm, fb, simpson(fa, fm, fb, a0, b0), tol / pieces, 0)
    }
    // Round-off is not an area: the odd curve x^(1/3) from −8 to 8 summed to −8.9×10⁻¹⁶, and sin x over a
    // whole period to −1.4×10⁻¹⁶, where the answers are 0. A total under 10⁻¹³ of the integrand's own
    // size (its largest value × the width) is 0. The floor is relative to that size, never absolute:
    // an integral of 1.6×10⁻¹⁹ on its own survives.
    const size = peak * Math.abs(b - a)
    return Number.isFinite(size) && Math.abs(total) <= 1e-13 * size ? 0 : total
  } finally {
    workNesting--
  }
}

/** Numeric root of f near `guess` (Newton, then bracketing scan + bisection). */
export function solveNumeric(f: (x: number) => number, guess = 0): number {
  let x = guess
  for (let i = 0; i < 60; i++) {
    const y = f(x)
    if (!Number.isFinite(y)) break
    if (Math.abs(y) < 1e-14) return x
    const d = derivativeAt(f, x)
    if (!Number.isFinite(d) || Math.abs(d) < 1e-14) break
    const nx = x - y / d
    if (Math.abs(nx - x) < 1e-13 * Math.max(1, Math.abs(x))) return nx
    x = nx
  }
  if (Number.isFinite(f(x)) && Math.abs(f(x)) < 1e-9) return x
  const scan = (lo: number, hi: number, n: number) => {
    let px = lo
    let py = f(px)
    for (let i = 1; i <= n; i++) {
      const cx = lo + ((hi - lo) * i) / n
      const cy = f(cx)
      if (Number.isFinite(py) && Number.isFinite(cy) && Math.sign(py) !== Math.sign(cy)) {
        let a = px
        let b = cx
        // 60 halvings take a 2 000 000-wide bracket below 10⁻¹²; the 200 it used to do were
        // 140 evaluations of f for nothing, on every bracket, on the main thread.
        for (let k = 0; k < 60; k++) {
          const m = (a + b) / 2
          if (Math.sign(f(m)) === Math.sign(f(a))) a = m
          else b = m
        }
        const r = (a + b) / 2
        if (Math.abs(f(r)) < 1e-6 * Math.max(1, Math.abs(py), Math.abs(cy))) return r
      }
      px = cx
      py = cy
    }
    return NaN
  }
  // 1 000 points per sweep, not 4 000: an equation with no root used to cost 16 000 evaluations
  // of f (each a mathjs evaluate) before "No solution", a visible freeze after Enter.
  for (const R of [10, 100, 1e4, 1e6]) {
    const r = scan(guess - R, guess + R, 1000)
    if (Number.isFinite(r)) return r
  }
  throw new Error('No solution found')
}

// ---------------------------------------------------------------------------
// mathjs extensions for calculator syntax
// ---------------------------------------------------------------------------

type Raw = ((args: MathNode[], m: typeof math, scope: Map<string, unknown>) => unknown) & { rawArgs?: boolean }

/** The two methods of a Map that reading a scope needs: a Map has them, and so has the PartitionedMap mathjs builds. */
type MapLike = Pick<Map<string, unknown>, 'has' | 'get'>

/** The names an expression mentions, worked out once per node: a body is met again for every term of the sum around it. */
const mentionedNames = new WeakMap<MathNode, string[]>()
function namesIn(node: MathNode): string[] {
  let names = mentionedNames.get(node)
  if (!names) {
    const found = new Set<string>()
    node.traverse((n) => {
      if (math.isSymbolNode(n)) found.add(n.name)
    })
    names = [...found]
    mentionedNames.set(node, names)
  }
  return names
}

/**
 * What a ∫, d/dx, Σ or Π body, limit or point can reach of the line's scope (H8): the entries these expressions
 * name, as a plain object the caller can copy and put its own variable on.
 *
 * mathjs hands a function like these (rawArgs) the scope wrapped in a PartitionedMap, which is not a Map.
 * Spreading it, as this once did, copied the wrapper's own fields (a, b and bKeys) and none of the entries, so
 * Ans, every stored letter and every constant was out of sight inside, and a limit that was the outer index of
 * a nested Σ was an "Undefined symbol x". The entries are read with has and get, which the scope mathjs passes
 * has, whether the line was evaluated with an object or a Map (both arrive as a PartitionedMap).
 *
 * Only the names the expressions mention are read, never the whole scope: it holds a hundred constants, and a Σ
 * typed inside a Σ asks again for every term of the outer one. Copying all of it made a one-term Σ inside a
 * 20 000-term Σ over ten times slower (about 2 s for 0.1 s, measured here), which the budget of a million terms
 * (H13) cannot see, as it counts terms.
 * (The Raw type above says Map; what arrives is a PartitionedMap.)
 */
function scopeToObject(scope: MapLike, ...expressions: Array<MathNode | undefined>): Record<string, unknown> {
  const reach: Record<string, unknown> = {}
  for (const expression of expressions) {
    // A call with an argument missing, sigma(x, 1), has no node to read names from. The caller fails on it where it
    // always did, with the same words; this must not be the place that fails first.
    if (!expression) continue
    for (const name of namesIn(expression)) {
      if (scope.has(name)) reach[name] = scope.get(name)
    }
  }
  return reach
}

function lambdaOf(node: MathNode, scope: MapLike, variable = 'x') {
  const code = node.compile()
  const base = scopeToObject(scope, node)
  // Calculus follows the angle mode, the way the real calculator does. Forcing radians here
  // answered a different question from the one that was typed: in DEG mode, sin(30) means 30
  // degrees, so ddx(sin(x), 30) has to mean the slope at 30 degrees too — otherwise the same
  // number means two things on one screen, and the answer disagrees with the calculator in the
  // student's hand. (The fx-991EX manual advises the user to switch to Rad for trig calculus;
  // it does not switch for them.)
  return (v: number) => {
    const here = { ...base, [variable]: v }
    const y = Number(code.evaluate(here))
    if (!Number.isNaN(y)) return y
    // Not a number. For x^(1/3) at a negative x mathjs answers with the principal value 1 + 1.732i,
    // which Number() makes NaN, while the main line reads the REAL root, (−8)^(1/3) = −2. So that one
    // body is one number inside ∫, ddx, Σ and Π as it is outside them, this point is read the main
    // line's way. Only a point with no value pays for it (about ten plain evaluations); a body that
    // has a number everywhere never comes here.
    try {
      return Number(evaluateWithRealRoots(node, here).value)
    } catch {
      return NaN
    }
  }
}

const raw = (fn: Raw): Raw => {
  fn.rawArgs = true
  return fn
}

/**
 * Σ(f(x), a, b) and Π(f(x), a, b): f at a, a + 1, … b, added or multiplied in that order (H13). Limits
 * that are not whole numbers are rounded, as they always were. The terms are spent from the budget
 * before the first is worked out, so a sum that cannot be afforded costs nothing to refuse; anything
 * typed inside it (a sum, a product, an integral) spends from the same budget, as it does inside an integral.
 */
function series(kind: SeriesKind, args: MathNode[], scope: Map<string, unknown>): number {
  const s = scopeToObject(scope, args[1], args[2])
  const f = lambdaOf(args[0], scope)
  const lo = Math.round(Number(args[1].compile().evaluate(s)))
  const hi = Math.round(Number(args[2].compile().evaluate(s)))
  // ∞, 1 ÷ 0, a unit, a root of −1: no number to count with. A NaN limit ran the loop no times, so the sum
  // of NaN to 5 was 0, and ∞ ran it for ever.
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error(badLimits(kind))
  const terms = hi - lo + 1
  beginWork(kind)
  try {
    // Over a million all by itself the sum says so; one that fits alone but not beside what else the
    // line has spent (inside an integral, inside another sum) is "too much work", in the line's words.
    if (terms > workLimit - workSpent) throw terms > SERIES_BUDGET && workOwner !== 'area' ? new Error(tooLong(kind)) : outOfWork()
    if (Math.abs(lo) > COUNTABLE || Math.abs(hi) > COUNTABLE) throw new Error(badLimits(kind))
    if (terms > 0) workSpent += terms
    // i bounds the loop and k is the number the summand gets, so k + 1 never has to move a number past 2⁵³.
    let t = kind === 'sum' ? 0 : 1
    if (kind === 'sum') for (let i = 0, k = lo; i < terms; i++, k++) t += f(k)
    else for (let i = 0, k = lo; i < terms; i++, k++) t *= f(k)
    return t
  } finally {
    workNesting--
  }
}

math.import(
  {
    // d/dx(f(x), a)
    ddx: raw((args, _m, scope) => {
      const at = Number(args[1].compile().evaluate(scopeToObject(scope, args[1])))
      return derivativeAt(lambdaOf(args[0], scope), at)
    }),
    // ∫(f(x), a, b)
    integral: raw((args, _m, scope) => {
      const s = scopeToObject(scope, args[1], args[2])
      return integrate(lambdaOf(args[0], scope), Number(args[1].compile().evaluate(s)), Number(args[2].compile().evaluate(s)))
    }),
    // Σ(f(x), a, b)
    sigma: raw((args, _m, scope) => series('sum', args, scope)),
    // Π(f(x), a, b)
    product: raw((args, _m, scope) => series('product', args, scope)),
    nPr: (n: number, r: number) => math.permutations(n, r),
    nCr: (n: number, r: number) => math.combinations(n, r),
    nthRootC: (n: number, x: number) => (x < 0 && n % 2 === 1 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n)),
    Int: (x: number) => Math.trunc(x),
    Intg: (x: number) => Math.floor(x),
    RanInt: (a: number, b: number) => Math.floor(a + Math.random() * (b - a + 1)),
    Ran: () => Math.round(Math.random() * 1000) / 1000,
    GCD: (...a: number[]) => math.gcd(...(a as [number, number])),
    LCM: (...a: number[]) => math.lcm(...(a as [number, number])),
    Abs: (x: number) => math.abs(x),
    // Capitalised because the constants list defines r_e (the classical electron radius) under
    // the spelling `re` as well, and that number shadowed mathjs's own re() in every scope.
    Re: (z: unknown) => math.re(z as never),
    Im: (z: unknown) => math.im(z as never)
  },
  { override: true }
)

/**
 * The argument of a complex number in the angle unit the screen shows, the way atan2 and the
 * inverse trig functions already do. mathjs's own arg answers in radians whatever the switch
 * says, so in degrees arg(1 + i) read 0.79 under a card that called the same angle 45°.
 */
export const argOf = (z: unknown): number => {
  const c = math.complex(z as never) as unknown as { re: number; im: number }
  return fromRadians(Math.atan2(c.im, c.re))
}

/**
 * A part that is only round-off beside the other is written as 0: the polar key gives 2∠90° a
 * real part of cos(90°) × 2 = 1.2×10⁻¹⁶, and every handheld shows 2i. The floor is relative to
 * the number's own size, never absolute — an answer of 1.6×10⁻¹⁹ on its own must survive.
 */
export function tidyComplex(c: { re: number; im: number }): { re: number; im: number } {
  const eps = 1e-12 * Math.max(Math.abs(c.re), Math.abs(c.im))
  return { re: Math.abs(c.re) < eps ? 0 : c.re, im: Math.abs(c.im) < eps ? 0 : c.im }
}

// ---------------------------------------------------------------------------
// Odd roots of negative numbers, and the notes that go beside them
// ---------------------------------------------------------------------------

export type ExprNode = MathNode & Record<string, unknown>

/**
 * The real n-th root of a number that is not negative. A whole answer comes out whole:
 * Math.pow(64, 1/3) is 3.9999999999999996, and that would have been kept as Ans.
 */
function rootOf(x: number, n: number): number {
  if (n === 3) return Math.cbrt(x)
  const r = Math.pow(x, 1 / n)
  const k = Math.round(r)
  return Math.pow(k, n) === x ? k : r
}

/** [p, q] when e is the fraction p/q with q odd and above 1: the exponents whose root of a negative number is real. */
function oddRootExponent(e: number): [number, number] | null {
  const f = toFraction(e, 99)
  return f && f[1] > 1 && f[1] % 2 === 1 ? f : null
}

const superscript = (n: number): string => String(n).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)])

/**
 * What a part of a line comes to when it has no x in it: a number, or undefined when it depends on
 * x (calculus and sums run their own x through the line) or is not a number.
 */
export function constantOf(n: ExprNode, scope: Record<string, unknown>): number | undefined {
  if (n.type === 'ConstantNode') return typeof n.value === 'number' ? n.value : undefined
  let usesX = false
  n.traverse((c, path, parent) => {
    const sym = c as ExprNode
    if (sym.type === 'SymbolNode' && sym.name === 'x' && !(parent?.type === 'FunctionNode' && path === 'fn')) usesX = true
  })
  if (usesX) return undefined
  try {
    const v = n.compile().evaluate(scope)
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined
  } catch {
    return undefined
  }
}

/** An answer worked out beside its other value: the real root a student means, and mathjs's principal one. */
interface RealRoot {
  /** The power or root as written, for a line that has more in it than this one root. */
  what: string
  value: number
  principal: unknown
}

export interface RootRun {
  value: unknown
  /** Notes naming each real root taken, with the principal (complex) value beside it. */
  roots: string[]
  /** The negative numbers a square root was taken of, in the order met. */
  squareRoots: number[]
}

const ROOT_HELPERS = new Set(['realPowOf', 'realRootOf', 'realCbrtOf'])
const CALCULUS = new Set(['ddx', 'integral', 'sigma', 'product'])

/**
 * Evaluate a parsed line the way the handheld does: an odd root of a negative number is the REAL root,
 * (−8)^(1/3) = −2 and (−8)^(2/3) = 4, where mathjs answers with the principal value 1 + 1.732i (and
 * the ∛ key already said −2, so the same cube root gave two answers). The principal value is worked
 * out beside it and returned in a note, so nothing is hidden.
 *
 * Only a power or root whose exponent is a fixed fraction with an odd denominator is touched, and
 * only when its base turns out negative at run time; every other power, root and unit goes through
 * mathjs as before. The shared mathjs instance is left alone: `predictable: true` would make sqrt(−4)
 * not-a-number on every screen. With `nameSquareRoots` the square roots of negative numbers are listed
 * too, for the imaginary note of Numbers mode.
 */
export function evaluateWithRealRoots(node: MathNode, scope: Record<string, unknown>, nameSquareRoots = false): RootRun {
  const found: RealRoot[] = []
  const squareRoots: number[] = []
  const note = (r: RealRoot): void => {
    // The same power can stand twice in a line ((−8)^(1/3) × (−8)^(1/3)): one note for it, and a few at most.
    if (found.length < 4 && !found.some((f) => f.what === r.what)) found.push(r)
  }
  const helpers: Record<string, (...a: unknown[]) => unknown> = {
    realPowOf: (a, b) => {
      if (typeof a === 'number' && a < 0 && typeof b === 'number') {
        const f = oddRootExponent(b)
        if (f) {
          const value = Math.pow(-rootOf(-a, f[1]), f[0])
          note({ what: `(${calcNum(a)})^(${calcNum(f[0])}/${f[1]})`, value, principal: math.pow(a, b) })
          return value
        }
      }
      return math.pow(a as never, b as never)
    },
    realRootOf: (a, n) => {
      if (typeof a === 'number' && a < 0 && typeof n === 'number' && Number.isInteger(n) && n >= 3 && n % 2 === 1) {
        const value = -rootOf(-a, n)
        note({ what: `${n === 3 ? '∛' : `${superscript(n)}√`}(${calcNum(a)})`, value, principal: math.pow(a, 1 / n) })
        return value
      }
      return math.nthRoot(a as never, n as never)
    },
    realCbrtOf: (a) => {
      if (typeof a === 'number' && a < 0) {
        const value = -Math.cbrt(-a)
        note({ what: `∛(${calcNum(a)})`, value, principal: math.pow(a, 1 / 3) })
        return value
      }
      return math.cbrt(a as never)
    },
    sqrtOf: (a) => {
      if (typeof a === 'number' && a < 0 && !squareRoots.includes(a)) squareRoots.push(a)
      return math.sqrt(a as never)
    }
  }
  // The arguments are rewritten too: ((−8)^(1/3))^(1/3).
  const call = (name: string, args: ExprNode[]): MathNode =>
    new math.FunctionNode(new math.SymbolNode(name), args.map((a) => rewrite(a))) as unknown as MathNode
  function rewrite(m: MathNode): MathNode {
    const n = m as ExprNode
    if (n.type === 'OperatorNode' && n.op === '^' && (n.args as ExprNode[]).length === 2) {
      const args = n.args as ExprNode[]
      const e = args[1].type === 'ConstantNode' && Number.isInteger(args[1].value) ? undefined : constantOf(args[1], scope)
      if (e !== undefined && oddRootExponent(e)) return call('realPowOf', args)
    }
    if (n.type === 'FunctionNode') {
      const name = (n.fn as { name?: string }).name ?? ''
      const args = n.args as ExprNode[]
      // ddx, ∫, Σ and Π run their first argument with a scope of their own, which does not carry
      // the helpers: what is inside them is left as mathjs reads it, as it always was.
      if (CALCULUS.has(name)) return m
      if (name === 'cbrt' && args.length === 1) return call('realCbrtOf', args)
      if (name === 'nthRoot' && args.length === 2) {
        const k = constantOf(args[1], scope)
        if (k !== undefined && Number.isInteger(k) && k >= 3 && k % 2 === 1) return call('realRootOf', args)
      }
      if (nameSquareRoots && name === 'sqrt' && args.length === 1) return call('sqrtOf', args)
    }
    return m.map((child) => rewrite(child))
  }
  const rewritten = rewrite(node)
  const value = rewritten.compile().evaluate({ ...scope, ...helpers })
  // The one root a line is made of needs no description; one root inside more maths says which.
  let top = rewritten as ExprNode
  while (top.type === 'ParenthesisNode') top = top.content as ExprNode
  const whole = found.length === 1 && top.type === 'FunctionNode' && ROOT_HELPERS.has((top.fn as { name?: string }).name ?? '')
  const roots = found.map((r) => (whole ? `real root — principal value ${formatValue(r.principal)}` : `real root of ${r.what} is ${calcNum(r.value)} — principal value ${formatValue(r.principal)}`))
  return { value, roots, squareRoots }
}

/**
 * The note beside an imaginary answer in Numbers mode: which square root of a negative number made
 * it, or a short word when it came some other way (ln(−1), asin(2), (−8)^(1/2)).
 */
function imaginaryNotes(value: unknown, squareRoots: number[]): string[] {
  if (!math.isComplex(value)) return []
  const c = tidyComplex(value as { re: number; im: number })
  if (c.im === 0) return []
  if (!squareRoots.length) return ['imaginary — the answer has an i part, so it is a complex number']
  return squareRoots.map((a) => `imaginary — √(${calcNum(a)}) = ${formatValue(math.sqrt(a))}`)
}

/** An equation with x in it: x = ? solves it. */
export const isEquationInX = (src: string): boolean => /^[^=]+=[^=]+$/.test(src) && /(^|[^A-Za-z])x([^A-Za-z]|$)/.test(src)

export interface CalcOutput {
  value: unknown
  /** Main display string. */
  text: string
  /** Secondary lines (e.g. Pol → r and θ). */
  extra?: string[]
  latexInput?: string
}

export interface CalcContext {
  vars: Record<string, unknown>
  ans: unknown
  angle: 'deg' | 'rad'
}

/** The names a Numbers-mode line can use: the constants, the stored letters, Ans and arg(). */
export const calcScope = (ctx: CalcContext): Record<string, unknown> => ({ ...constantScope(), ...ctx.vars, Ans: ctx.ans ?? 0, arg: argOf })

/**
 * A line that is `name = value` and not an equation in x — A = 5, M = 2 + 3 — used to reach mathjs, which "assigns"
 * into the throwaway copy of the stored letters the line was handed. The screen answered 5, A kept its value, and
 * because the line had an = it filed the 5 under x (H7): an answer that did nothing, and a letter overwritten.
 * Nothing in a line can store a letter — the store is the screen's, and the line only has a copy — so the line is
 * refused, in words, with where a value is kept. Only the line as typed counts (inside brackets too): the equals
 * sign the converter writes into a sum's summand is not something the student typed, and keeps its own sentence.
 */
export function refuseStoring(node: MathNode): void {
  let top = node as ExprNode
  while (top.type === 'ParenthesisNode') top = top.content as ExprNode
  if (top.type !== 'AssignmentNode' && top.type !== 'FunctionAssignmentNode') return
  const name = top.type === 'AssignmentNode' ? String((top.object as { name?: string }).name ?? '') : `${String(top.name)}(${(top.params as string[]).join(', ')})`
  const advice = OWN_LETTERS.test(name) ? `type the value beside ${name}` : 'type the value beside one of the letters A to F, M, x or y'
  throw new Error(`Typing ${name || 'a name'} = … does not store a value. Under Variables, ${advice}, or work the number out and press Store.`)
}

/**
 * Runs `run` in the angle mode `angle` and puts the mode that was there back however it ends. The mode is one global
 * the whole maths shares: left set, the next bare evaluation (the Table, a tangent drawn from the Maths screen)
 * worked in the last line's angle without a word (H3). Anything that reads a line's numbers after evaluateComp has
 * returned — a constant like sin(30) in a coefficient — has to run in that line's angle the same way.
 */
export function withAngle<T>(angle: 'deg' | 'rad', run: () => T): T {
  const before = getAngleMode()
  setAngleMode(angle)
  try {
    return run()
  } finally {
    setAngleMode(before)
  }
}

/** Evaluate a COMP-mode line. Handles Pol(), Rec(), SOLVE (with "=") and variables. */
export function evaluateComp(input: string, ctx: CalcContext): CalcOutput {
  return withAngle(ctx.angle, () => evaluateCompLine(input, ctx))
}

function evaluateCompLine(input: string, ctx: CalcContext): CalcOutput {
  const src = input.trim()
  if (!src) throw new Error('Empty')
  const scope = calcScope(ctx)

  // splitArgs, not a regex: Pol(max(1,3), 4) must split on the right comma.
  const pol = src.match(/^Pol\((.*)\)$/i)
  const polArgs = pol ? splitArgs(pol[1]) : null
  if (polArgs?.length === 2) {
    const x = Number(math.evaluate(casioToMath(polArgs[0]), scope))
    const y = Number(math.evaluate(casioToMath(polArgs[1]), scope))
    const r = Math.hypot(x, y)
    const theta = Math.atan2(y, x)
    const th = ctx.angle === 'deg' ? (theta * 180) / Math.PI : theta
    return { value: r, text: `r = ${calcNum(r)}`, extra: [`θ = ${calcNum(th)}${ctx.angle === 'deg' ? '°' : ' rad'}`] }
  }
  const rec = src.match(/^Rec\((.*)\)$/i)
  const recArgs = rec ? splitArgs(rec[1]) : null
  if (recArgs?.length === 2) {
    const r = Number(math.evaluate(casioToMath(recArgs[0]), scope))
    const t = Number(math.evaluate(casioToMath(recArgs[1]), scope))
    const tr = ctx.angle === 'deg' ? (t * Math.PI) / 180 : t
    return { value: r * Math.cos(tr), text: `x = ${calcNum(r * Math.cos(tr))}`, extra: [`y = ${calcNum(r * Math.sin(tr))}`] }
  }
  // SOLVE: an equation in x
  if (isEquationInX(src)) {
    const [l, r] = src.split('=')
    const fl = math.compile(casioToMath(l))
    const fr = math.compile(casioToMath(r))
    const f = (x: number) => Number(fl.evaluate({ ...scope, x })) - Number(fr.evaluate({ ...scope, x }))
    const guess = typeof ctx.vars.x === 'number' ? (ctx.vars.x as number) : 0
    // The search works the equation out thousands of times. Every try opened a budget of its own, so a Σ of 100 000
    // terms was 4 × 10⁸ terms before "No solution" — minutes, with the screen frozen (H14). The whole search spends
    // one now, and a line it cannot afford says so in the words of what it is built on. The residual below is one
    // more try worked out on its own, as it always was: a root that was found is not refused for the cost of showing it.
    const root = withOneBudget(workOwnerOf(src), () => solveNumeric(f, guess))
    return { value: root, text: `x = ${calcNum(root)}`, extra: [`L − R = ${calcNum(f(root))}`] }
  }
  const node = math.parse(casioToMath(src))
  refuseStoring(node)
  // Odd roots of negative numbers are real here, with the principal value beside them; a square
  // root of a negative number is named when it is why the answer has an i in it.
  const run = evaluateWithRealRoots(node, scope, true)
  const value = run.value
  let latexInput: string | undefined
  try {
    latexInput = node.toTex({ parenthesis: 'auto', implicit: 'hide' })
  } catch {
    latexInput = undefined
  }
  const extra = [...run.roots, ...imaginaryNotes(value, run.squareRoots)]
  return { value, text: formatValue(value), latexInput, ...(extra.length ? { extra } : {}) }
}

/**
 * The imaginary part of a number without its sign, as a student writes it: i, 2i, 1.5i. A part that
 * is 1 once written (1, or 0.99999999999 at ten figures) is just i, never 1i.
 */
export function formatImaginary(im: number, num: (n: number) => string = calcNum): string {
  const magnitude = num(Math.abs(im))
  return magnitude === '1' ? 'i' : `${magnitude}i`
}

/**
 * ONE complex number as a student writes it — 2i, −i, −2 + 3i — and the only place that decides how.
 * Numbers and Complex mode (formatValue), Equations mode's rows, the "no real solution" sentence of
 * x = ? and the command bar's decimal beside an exact root all come through here, so one root never
 * reads "0 + 2i" on one screen and "2i" on the next (polish item P7).
 *
 * `num` writes one number the way its screen does (calcNum on the Maths screen, texAt in the bar)
 * and writes the sign of a negative real part itself. The minus between the parts and in front of
 * the i is the typographic − in text and the plain - in TeX.
 */
export function formatComplex(re: number, im: number, num: (n: number) => string = calcNum, style: 'text' | 'tex' = 'text'): string {
  const minus = style === 'tex' ? '-' : '−'
  if (im === 0) return num(re)
  if (re === 0) return `${im < 0 ? minus : ''}${formatImaginary(im, num)}`
  return `${num(re)} ${im < 0 ? minus : '+'} ${formatImaginary(im, num)}`
}

export function formatValue(v: unknown): string {
  if (typeof v === 'number') return calcNum(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  // A complex number's two parts are numbers, and they follow the same never-pad rule as any
  // other: mathjs's fixed notation wrote 2.00i on the same screen as a trimmed 5.
  if (math.isComplex(v)) {
    const c = tidyComplex(v as { re: number; im: number })
    return formatComplex(c.re, c.im)
  }
  try {
    return math.format(v as never, mathFormatOptions())
  } catch {
    return String(v)
  }
}

// ---------------------------------------------------------------------------
// Exact forms (the "exact / decimal" chip): fractions, surds, π multiples — offline recognition
// ---------------------------------------------------------------------------

/**
 * How far the round-off of a few float operations can move a double from the number it stands for,
 * in units of Number.EPSILON × max(1, |v|) — one unit is one or two steps between doubles at v:
 * 0.1 + 0.2 is one unit from 3/10, 0.35 × 3 one from 21/20, and (5π/27)×10⁹ ÷ π under one from
 * 5×10⁹/27. Four leaves room for a short chain. Below 1 the unit stays Number.EPSILON, because a
 * small answer is often the difference of bigger numbers: 1.1 − 1 is nearly four units from 1/10.
 */
const ROUND_OFF = 4

/**
 * The most a fraction may owe to luck. Every number has fractions p/q within 1/q² of it (Dirichlet),
 * and the chance that an arbitrary number lies within δ of some fraction with denominator q or less
 * is about q²·δ. The old fixed tolerance of 10⁻¹¹·|v| therefore found a fraction for almost every
 * number above 10³: a hexagon of radius 3 at 1 □ = 10 mm had the area 9968039/4263 mm² (the truth is
 * 1350√3) and x² − 10000x + 1 = 0 the root 99989999/9999. A fraction is taken only when q² × its miss
 * (never less than half a unit, all a double can tell) stays under this — about one arbitrary number
 * in 10 000 gets through. So p/q can be found only while |v| < 2.7×10¹¹/q² (half a unit must stay
 * under LUCK/q²); every true fraction and π form met so far is inside that. It cannot be much smaller:
 * (5π/27)×10⁹ is 5×10⁹/27 of π, a denominator of 27 at 1.9×10⁸ with a miss of one step, and
 * q² × miss = 2.2×10⁻⁵.
 */
const LUCK = 3e-5

/**
 * v as the fraction p/q (q ≤ maxDen) that it is, or null. Only a fraction that v sits on to within
 * round-off (`roundOff` units, see ROUND_OFF) and far too closely to be luck (see LUCK) counts; any
 * other number stays a decimal. The candidates are the convergents of v's continued fraction: any
 * fraction this close to v is one of them.
 */
export function toFraction(v: number, maxDen = 100000, roundOff = ROUND_OFF): [number, number] | null {
  if (!Number.isFinite(v)) return null
  const unit = Number.EPSILON * Math.max(1, Math.abs(v))
  const isV = (p: number, q: number): boolean => {
    const miss = Math.abs(v - p / q)
    return miss <= roundOff * unit && q * q * Math.max(miss, unit / 2) <= LUCK
  }
  let h1 = 1
  let h0 = 0
  let k1 = 0
  let k0 = 1
  let x = v
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(x)
    ;[h1, h0] = [a * h1 + h0, h1]
    ;[k1, k0] = [a * k1 + k0, k1]
    if (k1 > maxDen) return null
    if (isV(h1, k1)) return [h1, k1]
    const frac = x - a
    if (frac < 1e-14) break
    x = 1 / frac
  }
  return isV(h1, k1) ? [h1, k1] : null
}

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b))

function fracTex(n: number, d: number, suffix = ''): string {
  const sign = n < 0 ? '-' : ''
  n = Math.abs(n)
  if (d === 1) return `${sign}${n === 1 && suffix ? '' : n}${suffix}`
  return `${sign}\\frac{${n === 1 && suffix ? '' : n}${suffix}}{${d}}`
}

/** Recognises v as p/q, p√r/q or pπ/q. Returns LaTeX or null. */
export function exactForm(v: number): string | null {
  if (!Number.isFinite(v)) return null
  // From 10²¹ on String() writes e-notation ("1e+22"), which is programming syntax: such a whole
  // number is written in the scientific form of math/format.ts, to the 15 figures a calculator holds.
  if (Number.isInteger(v)) return Math.abs(v) < 1e21 ? String(v) : texSci(v, { decimals: 14, precisionMode: 'dp' })
  // A physical constant is not "exactly 0": below 1 the fraction search allows an absolute
  // round-off of a few 10⁻¹⁶, so anything nearer a whole number than that reads as it, and 7 ÷ 3h
  // used to come out as the exact answer 0.
  if (Math.abs(v) < 1e-9) return null
  const f = toFraction(v, 10000)
  if (f) return fracTex(f[0], f[1])
  const piF = toFraction(v / Math.PI, 360)
  if (piF) return fracTex(piF[0], piF[1], '\\pi')
  // Squaring doubles v's relative round-off, so v² gets twice the room. Judged through v², a surd is
  // found only below about 5×10⁵ (v² < 2.7×10¹¹, see LUCK): 4000000√3 km² keeps its decimal alone.
  const sq = toFraction(v * v, 100000, 2 * ROUND_OFF)
  // v² within round-off of zero is read as the fraction 0/1 (1 ÷ 10⁸ squared is 10⁻¹⁶), and such an
  // answer used to be √0 (1 ÷ 500000 was, under the old tolerance).
  if (sq && sq[0] !== 0) {
    // v = ±√(n/d) = ±√(n·d)/d, pull out square factors.
    const [n, d] = sq
    const sign = v < 0 ? -1 : 1
    let inside = n * d
    let outside = 1
    for (let k = 2; k * k <= inside; k++) {
      while (inside % (k * k) === 0) {
        inside /= k * k
        outside *= k
      }
    }
    const g = gcd(outside, d)
    const num = outside / g
    const den = d / g
    if (inside !== 1 && inside < 1e6) return fracTex(sign * num, den, `\\sqrt{${inside}}`)
  }
  return null
}

// ---------------------------------------------------------------------------
// BASE-N
// ---------------------------------------------------------------------------

export type Base = 2 | 8 | 10 | 16

export function toInt32(x: number): number {
  return x | 0
}

export function formatBase(v: number, base: Base): string {
  const n = toInt32(v)
  if (base === 10) return String(n)
  const u = n >>> 0
  const digits = base === 2 ? 32 : base === 8 ? 11 : 8
  const s = u.toString(base).toUpperCase()
  return base === 2 ? s.padStart(Math.min(digits, Math.ceil(s.length / 4) * 4), '0') : s
}

type BaseTok = { kind: 'num'; value: number } | { kind: 'op'; value: string }

/**
 * Whole-number arithmetic and logic in the chosen base, the way a BASE-N calculator does it.
 *
 * Every division is a whole-number division on its own: 7 ÷ 2 × 2 is 6, because 7 ÷ 2 is 3 on
 * the calculator's screen before it is multiplied. The old version worked in decimals and only
 * threw the fraction away at the very end, giving 7 — and did so by handing the string to
 * Function(), which is not something a calculator should do with what a student typed.
 */
export function evaluateBaseN(input: string, base: Base): number {
  const digits = base === 16 ? /^[0-9A-Fa-f]+/ : base === 8 ? /^[0-7]+/ : base === 2 ? /^[01]+/ : /^\d+/
  const words: Record<string, string> = { and: '&', or: '|', xor: '^', xnor: 'xnor', not: '~', neg: 'neg' }
  const toks: BaseTok[] = []
  let s = input.trim()
  while (s.length) {
    if (/^\s/.test(s)) {
      s = s.replace(/^\s+/, '')
      continue
    }
    const word = s.match(/^[a-zA-Z]+/)
    const digit = s.match(digits)
    // In hex "and" would also read as digits, so words are tried first — but only whole words.
    if (word && words[word[0].toLowerCase()] && !(digit && digit[0].length > word[0].length)) {
      toks.push({ kind: 'op', value: words[word[0].toLowerCase()] })
      s = s.slice(word[0].length)
      continue
    }
    if (digit) {
      toks.push({ kind: 'num', value: parseInt(digit[0], base) })
      s = s.slice(digit[0].length)
      continue
    }
    if ('+-*/()&|^~'.includes(s[0])) {
      toks.push({ kind: 'op', value: s[0] })
      s = s.slice(1)
      continue
    }
    throw new Error('Syntax ERROR')
  }

  let pos = 0
  const peek = (): BaseTok | undefined => toks[pos]
  const isOp = (v: string): boolean => {
    const t = peek()
    return t?.kind === 'op' && t.value === v
  }
  const take = (): BaseTok => {
    const t = toks[pos++]
    if (!t) throw new Error('Syntax ERROR')
    return t
  }
  // Precedence, lowest first: or, xor/xnor, and, add/subtract, multiply/divide, unary, brackets.
  const primary = (): number => {
    const t = take()
    if (t.kind === 'num') return toInt32(t.value)
    if (t.value === '(') {
      const v = or()
      if (!isOp(')')) throw new Error('Syntax ERROR')
      pos++
      return v
    }
    throw new Error('Syntax ERROR')
  }
  const unary = (): number => {
    if (isOp('-') || isOp('neg')) {
      pos++
      return toInt32(-unary())
    }
    if (isOp('~')) {
      pos++
      return toInt32(~unary())
    }
    return primary()
  }
  const mul = (): number => {
    let v = unary()
    while (isOp('*') || isOp('/')) {
      const op = take().value
      const r = unary()
      // Math.imul is the exact 32-bit wrap-around; a double product of two 31-bit numbers loses
      // its low bits, and 7FFFFFFF × 7FFFFFFF came out as 0.
      if (op === '*') v = Math.imul(v, r)
      else {
        if (r === 0) throw new Error('Math ERROR')
        v = toInt32(Math.trunc(v / r))
      }
    }
    return v
  }
  const add = (): number => {
    let v = mul()
    while (isOp('+') || isOp('-')) {
      const op = take().value
      const r = mul()
      v = toInt32(op === '+' ? v + r : v - r)
    }
    return v
  }
  const and = (): number => {
    let v = add()
    while (isOp('&')) {
      pos++
      v = toInt32(v & add())
    }
    return v
  }
  const xor = (): number => {
    let v = and()
    while (isOp('^') || isOp('xnor')) {
      const op = take().value
      const r = and()
      v = toInt32(op === '^' ? v ^ r : ~(v ^ r))
    }
    return v
  }
  const or = (): number => {
    let v = xor()
    while (isOp('|')) {
      pos++
      v = toInt32(v | xor())
    }
    return v
  }
  if (!toks.length) throw new Error('Syntax ERROR')
  const out = or()
  if (pos !== toks.length) throw new Error('Syntax ERROR')
  return out
}

// ---------------------------------------------------------------------------
// Polynomials, linear systems, inequalities
// ---------------------------------------------------------------------------

export interface Cx {
  re: number
  im: number
}

/** All roots of a polynomial with coefficients [aₙ … a₀] (Durand–Kerner + polishing). */
export function polyRoots(coeffs: number[]): Cx[] {
  let c = [...coeffs]
  while (c.length > 1 && Math.abs(c[0]) < 1e-15) c.shift()
  const n = c.length - 1
  if (n < 1) return []
  const lead = c[0]
  c = c.map((v) => v / lead)
  const mul = (a: Cx, b: Cx): Cx => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re })
  const subC = (a: Cx, b: Cx): Cx => ({ re: a.re - b.re, im: a.im - b.im })
  const div = (a: Cx, b: Cx): Cx => {
    const d = b.re * b.re + b.im * b.im
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }
  }
  const evalP = (z: Cx): Cx => c.reduce<Cx>((acc, coef) => ({ re: mul(acc, z).re + coef, im: mul(acc, z).im }), { re: 0, im: 0 })
  const bound = 1 + Math.max(...c.slice(1).map(Math.abs))
  let roots: Cx[] = Array.from({ length: n }, (_, k) => ({ re: bound * 0.9 * Math.cos((2 * Math.PI * k) / n + 0.4), im: bound * 0.9 * Math.sin((2 * Math.PI * k) / n + 0.4) }))
  for (let iter = 0; iter < 2000; iter++) {
    let maxStep = 0
    roots = roots.map((z, i) => {
      let den: Cx = { re: 1, im: 0 }
      roots.forEach((w, j) => {
        if (i !== j) den = mul(den, subC(z, w))
      })
      const step = div(evalP(z), den)
      maxStep = Math.max(maxStep, Math.hypot(step.re, step.im))
      return subC(z, step)
    })
    if (maxStep < 1e-15) break
  }
  return roots
    .map((z) => ({ re: Math.abs(z.re) < 1e-12 ? 0 : z.re, im: Math.abs(z.im) < 1e-9 ? 0 : z.im }))
    .sort((a, b) => a.re - b.re || a.im - b.im)
}

export function solveLinearSystem(A: number[][], b: number[]): number[] {
  const det = Number(math.det(A))
  if (Math.abs(det) < 1e-14) throw new Error('No unique solution (determinant is 0)')
  const x = math.lusolve(A, b) as number[][]
  return x.map((row) => row[0])
}

/** Solution set of p(x) op 0 as intervals. */
export function polyInequality(coeffs: number[], op: '<' | '<=' | '>' | '>='): { from: number; to: number; closedFrom: boolean; closedTo: boolean }[] {
  const real = polyRoots(coeffs)
    .filter((r) => r.im === 0)
    .map((r) => r.re)
    .filter((v, i, arr) => arr.findIndex((w) => Math.abs(w - v) < 1e-9) === i)
    .sort((a, b) => a - b)
  const p = (x: number) => coeffs.reduce((acc, c) => acc * x + c, 0)
  const ok = (v: number) => (op === '<' ? v < 0 : op === '<=' ? v <= 1e-12 : op === '>' ? v > 0 : v >= -1e-12)
  const edges = [-Infinity, ...real, Infinity]
  const out: { from: number; to: number; closedFrom: boolean; closedTo: boolean }[] = []
  const inclusive = op === '<=' || op === '>='
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i]
    const b = edges[i + 1]
    const mid = !Number.isFinite(a) ? b - 1 : !Number.isFinite(b) ? a + 1 : (a + b) / 2
    if (ok(p(mid))) {
      const last = out[out.length - 1]
      if (last && last.to === a && inclusive) {
        last.to = b
        // Nothing is ever closed at infinity.
        last.closedTo = Number.isFinite(b)
      }
      else out.push({ from: a, to: b, closedFrom: inclusive && Number.isFinite(a), closedTo: inclusive && Number.isFinite(b) })
    } else if (inclusive && Number.isFinite(b) && i < edges.length - 2) {
      // isolated touching root
      if (!out.length || out[out.length - 1].to !== b) out.push({ from: b, to: b, closedFrom: true, closedTo: true })
    }
  }
  return out.filter((iv, i, arr) => !(iv.from === iv.to && arr.some((o, j) => j !== i && o.from <= iv.from && o.to >= iv.to && o.from !== o.to)))
}

export function polyToExpr(coeffs: number[]): string {
  const n = coeffs.length - 1
  return coeffs
    .map((c, i) => {
      const p = n - i
      if (c === 0) return ''
      const term = p === 0 ? `${c}` : p === 1 ? `${c}*x` : `${c}*x^${p}`
      return term
    })
    .filter(Boolean)
    .join(' + ')
    .replace(/\+ -/g, '- ') || '0'
}

// ---------------------------------------------------------------------------
// Statistics & regression
// ---------------------------------------------------------------------------

export type RegressionType = 'single' | 'linear' | 'quadratic' | 'log' | 'exp' | 'abExp' | 'power' | 'inverse'

export interface StatResult {
  n: number
  mean: number
  sx: number
  sigmaX: number
  sum: number
  sumSq: number
  min: number
  q1: number
  median: number
  q3: number
  max: number
  meanY?: number
  sigmaY?: number
  sy?: number
  coef?: Record<string, number>
  r?: number
  expr?: string
  label?: string
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

function linFit(xs: number[], ys: number[]) {
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  const b = sxy / sxx
  return { a: my - b * mx, b, r: sxy / Math.sqrt(sxx * syy) }
}

export function statistics(xsIn: number[], ysIn: number[] | null, freq: number[] | null, type: RegressionType): StatResult {
  const xs: number[] = []
  const ys: number[] = []
  xsIn.forEach((x, i) => {
    const f = Math.max(0, Math.round(freq?.[i] ?? 1))
    for (let k = 0; k < f; k++) {
      xs.push(x)
      if (ysIn) ys.push(ysIn[i])
    }
  })
  const n = xs.length
  if (n === 0) throw new Error('Enter some data first')
  const sum = xs.reduce((a, b) => a + b, 0)
  const mean = sum / n
  const sumSq = xs.reduce((a, b) => a + b * b, 0)
  const varP = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n
  const sorted = [...xs].sort((a, b) => a - b)
  const res: StatResult = {
    n,
    mean,
    sigmaX: Math.sqrt(varP),
    sx: n > 1 ? Math.sqrt((varP * n) / (n - 1)) : NaN,
    sum,
    sumSq,
    min: sorted[0],
    q1: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    q3: quantile(sorted, 0.75),
    max: sorted[n - 1]
  }
  if (type === 'single' || !ysIn) return res
  const my = ys.reduce((a, b) => a + b, 0) / n
  res.meanY = my
  res.sigmaY = Math.sqrt(ys.reduce((a, b) => a + (b - my) ** 2, 0) / n)
  res.sy = n > 1 ? Math.sqrt((ys.reduce((a, b) => a + (b - my) ** 2, 0)) / (n - 1)) : NaN
  switch (type) {
    case 'linear': {
      const { a, b, r } = linFit(xs, ys)
      Object.assign(res, { coef: { a, b }, r, expr: `${a} + ${b}*x`, label: 'y = a + bx' })
      break
    }
    case 'quadratic': {
      const S = (p: number) => xs.reduce((acc, x) => acc + x ** p, 0)
      const T = (p: number) => xs.reduce((acc, x, i) => acc + x ** p * ys[i], 0)
      const [a, b, c] = solveLinearSystem(
        [
          [n, S(1), S(2)],
          [S(1), S(2), S(3)],
          [S(2), S(3), S(4)]
        ],
        [T(0), T(1), T(2)]
      )
      Object.assign(res, { coef: { a, b, c }, expr: `${a} + ${b}*x + ${c}*x^2`, label: 'y = a + bx + cx²' })
      break
    }
    case 'log': {
      const { a, b, r } = linFit(xs.map(Math.log), ys)
      Object.assign(res, { coef: { a, b }, r, expr: `${a} + ${b}*log(x, e)`, label: 'y = a + b·ln x' })
      res.expr = `${a} + ${b}*ln(x)`
      break
    }
    case 'exp': {
      const { a, b, r } = linFit(xs, ys.map(Math.log))
      Object.assign(res, { coef: { a: Math.exp(a), b }, r, expr: `${Math.exp(a)}*exp(${b}*x)`, label: 'y = a·e^(bx)' })
      break
    }
    case 'abExp': {
      const { a, b, r } = linFit(xs, ys.map(Math.log))
      Object.assign(res, { coef: { a: Math.exp(a), b: Math.exp(b) }, r, expr: `${Math.exp(a)}*${Math.exp(b)}^x`, label: 'y = a·b^x' })
      break
    }
    case 'power': {
      const { a, b, r } = linFit(xs.map(Math.log), ys.map(Math.log))
      Object.assign(res, { coef: { a: Math.exp(a), b }, r, expr: `${Math.exp(a)}*x^${b}`, label: 'y = a·x^b' })
      break
    }
    case 'inverse': {
      const { a, b, r } = linFit(xs.map((x) => 1 / x), ys)
      Object.assign(res, { coef: { a, b }, r, expr: `${a} + ${b}/x`, label: 'y = a + b/x' })
      break
    }
  }
  return res
}

// ---------------------------------------------------------------------------
// Distributions
// ---------------------------------------------------------------------------

export const normalPdf = (x: number, mu = 0, sigma = 1) => Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI))
export const normalCdf = (lo: number, hi: number, mu = 0, sigma = 1) => {
  const phi = (z: number) => 0.5 * (1 + (math.erf(z / Math.SQRT2) as number))
  return phi((hi - mu) / sigma) - phi((lo - mu) / sigma)
}

/** Inverse standard normal (Acklam's algorithm). */
export function inverseNormal(p: number, mu = 0, sigma = 1, tail: 'left' | 'right' | 'center' = 'left'): number {
  if (tail === 'right') p = 1 - p
  if (tail === 'center') p = 0.5 + p / 2
  if (p <= 0 || p >= 1) throw new Error('Area must be between 0 and 1')
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239]
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
  const pl = 0.02425
  let q: number
  let z: number
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p))
    z = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  } else if (p <= 1 - pl) {
    q = p - 0.5
    const r = q * q
    z = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p))
    z = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  return mu + sigma * z
}

const lnFact = (n: number) => Number(math.lgamma(n + 1))

// The factorial form takes log p and log (1 − p), and 0 × log 0 is not a number (H2): a coin that always lands tails
// has 0 heads with probability 1, and the formula answered NaN for exactly that — and for every sum that passes it.
// At the two ends all of the mass sits on one value, so that value is 1 and the rest 0; in between nothing changes.
export const binomialPd = (x: number, N: number, p: number) => {
  if (x < 0 || x > N || !Number.isInteger(x)) return 0
  if (p === 0) return x === 0 ? 1 : 0
  if (p === 1) return x === N ? 1 : 0
  return Math.exp(lnFact(N) - lnFact(x) - lnFact(N - x) + x * Math.log(p) + (N - x) * Math.log(1 - p))
}
export const binomialCd = (x: number, N: number, p: number) => {
  let s = 0
  for (let k = 0; k <= Math.min(N, Math.floor(x)); k++) s += binomialPd(k, N, p)
  return Math.min(1, s)
}
// λ = 0 is the same trouble: x log λ is 0 × −∞ at x = 0, and nothing ever happens, so P(X = 0) = 1.
export const poissonPd = (x: number, lambda: number) => {
  if (x < 0 || !Number.isInteger(x)) return 0
  if (lambda === 0) return x === 0 ? 1 : 0
  return Math.exp(x * Math.log(lambda) - lambda - lnFact(x))
}
export const poissonCd = (x: number, lambda: number) => {
  let s = 0
  for (let k = 0; k <= Math.floor(x); k++) s += poissonPd(k, lambda)
  return Math.min(1, s)
}

// ---------------------------------------------------------------------------
// Measurements: significant figures & uncertainties
// ---------------------------------------------------------------------------

export function countSigFigs(raw: string): { count: number; explanation: string } {
  const s = raw.trim().replace(/[×x]\s*10\^?\s*[-+]?\d+$/i, '').replace(/e[-+]?\d+$/i, '').replace(/^[-+]/, '')
  if (!/^\d*\.?\d*$/.test(s) || !/\d/.test(s)) throw new Error('Enter a number like 0.00450 or 3.20×10^4')
  const hasPoint = s.includes('.')
  const digits = s.replace('.', '')
  const firstNonZero = digits.search(/[1-9]/)
  if (firstNonZero < 0) return { count: hasPoint ? Math.max(1, digits.length - 1) : 1, explanation: 'Zero: only the zeros after the decimal point count.' }
  let sig = digits.slice(firstNonZero)
  let note = 'Leading zeros never count.'
  if (!hasPoint) {
    const trimmed = sig.replace(/0+$/, '')
    if (trimmed.length !== sig.length) note += ' Trailing zeros without a decimal point are not significant (write it in scientific notation to show they are).'
    sig = trimmed
  } else if (/0$/.test(sig)) note += ' Trailing zeros after the decimal point ARE significant.'
  return { count: sig.length, explanation: note }
}

/**
 * `v` rounded to `n` significant figures and written as the rest of PhysLab writes it: the
 * digits the student sees, half away from zero (25.37 ÷ 20 = 1.2685 is 1.269 at 4 figures, 2.675
 * is 2.68 at 3), the zeros that are figures kept (1.2 at 4 is 1.200), the app's own minus, and a
 * real power of ten — never "1.23e+5" — once a number is too big or small for plain digits. This
 * used to be Number(v.toPrecision(n)).toPrecision(n), which rounds the binary double behind the
 * number: 1.2685 is stored just under the half and read 1.268.
 */
export function roundSig(v: number, n: number): string {
  const s: DigitSettings = { decimals: n, precisionMode: 'sf' }
  // fmtPrecise calls anything under 10⁻¹² zero, right for a length dragged onto the axis and wrong
  // for the charge on an electron (calcNum splits it off for the same reason): fmtSci has no floor.
  return superscriptPowers(Math.abs(v) < 1e-12 ? fmtSci(v, s) : fmtPrecise(v, s))
}

/**
 * A number in scientific notation as the Measure card writes it, "4.560 × 10⁻³": `figures` digits
 * (the typed number's own count, so 0.004560 keeps its last zero), rounded as roundSig rounds, with a
 * real raised power — the card used to write "4.560 × 10^-3" and "3.20 × 10^+4", a caret and a plus
 * no student writes. A double holds 15 figures: a longer typed number has no more real digits to
 * show, and toExponential printed its binary noise instead.
 */
export function sciNotation(v: number, figures: number): string {
  return superscriptPowers(fmtSci(v, { decimals: Math.min(15, figures), precisionMode: 'sf' }))
}

export interface Measured {
  value: number
  unc: number
}

export function propagate(op: '+' | '-' | '×' | '÷' | '^', a: Measured, b: Measured | number): { value: number; unc: number; rule: string } {
  if (op === '^') {
    const p = b as number
    const value = a.value ** p
    // |Δy| = |p x^(p−1)| |Δx| — the same rule, but it survives a measurement of zero.
    const unc = Math.abs(p) * Math.abs(a.value ** (p - 1)) * a.unc
    return { value, unc: Number.isFinite(unc) ? unc : 0, rule: `Power rule: % uncertainty is multiplied by the power (${p}).` }
  }
  const bb = b as Measured
  if (op === '+' || op === '-') {
    return { value: op === '+' ? a.value + bb.value : a.value - bb.value, unc: a.unc + bb.unc, rule: 'Adding or subtracting: add the absolute uncertainties.' }
  }
  const value = op === '×' ? a.value * bb.value : a.value / bb.value
  // Adding the percentage uncertainties, written so that a reading of zero (whose percentage
  // uncertainty is undefined) gives an answer instead of NaN.
  const unc =
    op === '×'
      ? Math.abs(a.value) * bb.unc + Math.abs(bb.value) * a.unc
      : (a.unc * Math.abs(bb.value) + Math.abs(a.value) * bb.unc) / (bb.value * bb.value)
  return { value, unc: Number.isFinite(unc) ? unc : 0, rule: 'Multiplying or dividing: add the percentage (fractional) uncertainties.' }
}

/** Dimensions [M L T I Θ N J] of an expression with units, e.g. "kg*m/s^2". */
export function dimensionsOf(unitExpr: string): string {
  const u = math.unit(unitExpr.includes(' ') || /^\d/.test(unitExpr) ? unitExpr : `1 ${unitExpr}`) as unknown as { dimensions: number[] }
  const names = ['M', 'L', 'T', 'I', 'Θ', 'N', 'J']
  // mathjs order: MASS, LENGTH, TIME, CURRENT, TEMPERATURE, LUMINOUS_INTENSITY, AMOUNT_OF_SUBSTANCE, ANGLE, BIT
  const order = [0, 1, 2, 3, 4, 6, 5]
  const parts = order
    .map((idx, k) => ({ p: u.dimensions[idx], n: names[k] }))
    .filter((x) => x.p)
    .map((x) => (x.p === 1 ? x.n : `${x.n}^${x.p}`))
  return parts.length ? `[${parts.join(' ')}]` : '[dimensionless]'
}

export { setAngleMode }

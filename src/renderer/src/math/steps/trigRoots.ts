// Trigonometric equations: the numbers behind their checks (Part S5c).
//
// A step that claims something about a trigonometric equation is checked here, never taken on trust:
// - an equivalent rewrite (divide by cos x, substitute u = sin x, the roots of a quadratic in u) must hold at
//   sample angles;
// - a general solution must satisfy the equation at its members, and every root of the equation in one period
//   must be one of its members;
// - a solution list must be exactly the members of the general solution that lie in the range the problem asks for.
//
// Angles are exact rationals in degrees. An angle in radians is the same number times 180/π, so the answers are
// exact in both modes: 30° is π/6, and an answer is only ever written as a fraction of π that is exactly right.
// The numeric checks sample finely and refine each sign change or touch of zero by bisection or a golden-section
// search. A sign change that is a pole (tan at 90°) is refused by the size of the value there, never accepted.

import { compileScalar, type ScalarFn } from '../expr'
import { isNoise, sameNumber } from '../noise'
import type { ValidationVerdict } from './types'
import { blcm, bgcd, rat, rAdd, rCmp, rDiv, rEq, rIsZero, rMul, rNeg, rNum, R0, type Rat } from '../pure/rat'

export type TrigFn = 'sin' | 'cos' | 'tan'
export type AngleUnit = 'deg' | 'rad'
/** A general solution x = a + p·k, k any integer; a and p are exact angles in degrees. */
export interface Family {
  a: Rat
  p: Rat
}
/** The range the problem asks for, in degrees (whole numbers); the top end is open unless inclusive. */
export interface TrigRange {
  min: number
  max: number
  inclusive: boolean
}

/** How close two numbers must be to count as the same, for an equation's own residual. */
const TOL = 1e-8
/**
 * How close a found root and a listed angle must be (degrees). A double root (cos x = ±1 touches zero) is located only to
 * about 1e-6 degrees by the search, so two hits on it can differ that much; no two distinct roots of these equations are closer.
 */
const ROOT_TOL_DEG = 1e-4
/** Samples per period when searching for roots: fine enough that two roots of these equations never share one. */
const SAMPLES = 7200
/** Angles that are never a multiple of 90 degrees, so that cos and tan are defined at every one of them. */
const SAMPLE_DEG = [7, 19.5, 33, 58, 101, 147, 212, 263, 290, 331]

const toRad = (deg: number): number => (deg * Math.PI) / 180
const fnValue = (fn: TrigFn, x: number): number => (fn === 'sin' ? Math.sin(x) : fn === 'cos' ? Math.cos(x) : Math.tan(x))

// ---------------------------------------------------------------------------------------------------------
// Evaluating an equation
// ---------------------------------------------------------------------------------------------------------

const compiled = new Map<string, ScalarFn | null>()

/** The compiled function of an expression in the given letters (trig in radians), or null when it does not read. */
function scalarOf(expr: string, vars: string[]): ScalarFn | null {
  const key = `${vars.join(',')}|${expr}`
  const hit = compiled.get(key)
  if (hit !== undefined) return hit
  let f: ScalarFn | null
  try {
    f = compileScalar(expr, vars, () => ({}))
  } catch {
    f = null
  }
  // A long session may read many texts; the cache is bounded so it cannot grow without limit.
  if (compiled.size > 5000) compiled.clear()
  compiled.set(key, f)
  return f
}

/**
 * One side of an equation as a mathjs text: the forms the trig steps write (\sin, \frac, \sqrt, \pi, ^{2}) made plain.
 * Done here rather than by latexToMath, which writes a power such as ^(2) as ^(()2).
 */
function mathOf(latex: string): string {
  let s = latex.trim().replace(/\\left|\\right/g, '')
  let prev = ''
  while (prev !== s) {
    prev = s
    s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))').replace(/\\sqrt\{([^{}]*)\}/g, 'sqrt($1)')
  }
  return s
    .replace(/\\(sin|cos|tan)\b/g, '$1')
    .replace(/\\pi\b/g, 'pi')
    .replace(/\\(cdot|times)\b/g, '*')
    .replace(/\^\{([^{}]*)\}/g, '^($1)')
}

/**
 * The difference L − R of an equation as a function of the raw value of its letter (radians for an angle).
 * Null when the equation is not exactly one "=" with both sides readable.
 */
function residualRaw(eq: string, name: string): ((x: number) => number) | null {
  const parts = eq.split('=')
  if (parts.length !== 2) return null
  const f = scalarOf(`(${mathOf(parts[0])}) - (${mathOf(parts[1])})`, [name])
  if (!f) return null
  return (x: number) => f({ [name]: x })
}

/** The difference L − R of an equation in the angle letter v, with the angle v given in degrees. */
function residualOf(eq: string, v: string): ((deg: number) => number) | null {
  const raw = residualRaw(eq, v)
  return raw === null ? null : (deg: number) => raw(toRad(deg))
}

/** A whole number-valued expression with no letters, or NaN when it does not read. */
function constantOf(latex: string): number {
  const f = scalarOf(`(${mathOf(latex)})`, [])
  if (!f) return Number.NaN
  try {
    return f({})
  } catch {
    return Number.NaN
  }
}

/**
 * Every real root of f in [lo, hi), found by sampling. A sign change is refined by bisection, and a grid minimum of |f|
 * by a golden-section search; a candidate counts only when |f| at it is below TOL, so a pole or a near miss is dropped.
 * Null when f cannot be read at the samples.
 */
function rootsOf(f: (x: number) => number, lo: number, hi: number): number[] | null {
  const xs: number[] = []
  const fs: number[] = []
  for (let i = 0; i <= SAMPLES; i++) {
    const x = lo + ((hi - lo) * i) / SAMPLES
    xs.push(x)
    fs.push(f(x))
  }
  if (!fs.some((y) => Number.isFinite(y))) return null
  const found: number[] = []
  const bisect = (a0: number, b0: number): number => {
    let a = a0
    let b = b0
    let fa = f(a)
    for (let it = 0; it < 90; it++) {
      const m = (a + b) / 2
      const fm = f(m)
      if (fm === 0) return m
      if ((fm < 0) === (fa < 0)) {
        a = m
        fa = fm
      } else {
        b = m
      }
    }
    return (a + b) / 2
  }
  for (let i = 0; i < SAMPLES; i++) {
    const a = fs[i]
    const b = fs[i + 1]
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    if (a === 0) found.push(xs[i])
    if ((a < 0 && b > 0) || (a > 0 && b < 0)) {
      const r = bisect(xs[i], xs[i + 1])
      if (Number.isFinite(f(r)) && Math.abs(f(r)) <= TOL) found.push(r)
    }
  }
  const absF = (x: number): number => Math.abs(f(x))
  for (let i = 1; i < SAMPLES; i++) {
    const a = Math.abs(fs[i - 1])
    const b = Math.abs(fs[i])
    const c = Math.abs(fs[i + 1])
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) continue
    if (b > a || b > c || b > 1e-2) continue
    // Golden-section search for the least |f| between the two neighbours of this sample.
    let l = xs[i - 1]
    let h = xs[i + 1]
    const phi = (Math.sqrt(5) - 1) / 2
    let x1 = h - phi * (h - l)
    let x2 = l + phi * (h - l)
    let g1 = absF(x1)
    let g2 = absF(x2)
    for (let it = 0; it < 90; it++) {
      if (g1 < g2) {
        h = x2
        x2 = x1
        g2 = g1
        x1 = h - phi * (h - l)
        g1 = absF(x1)
      } else {
        l = x1
        x1 = x2
        g1 = g2
        x2 = l + phi * (h - l)
        g2 = absF(x2)
      }
    }
    const r = (l + h) / 2
    if (Math.abs(f(r)) <= TOL) found.push(r)
  }
  found.sort((p, q) => p - q)
  const out: number[] = []
  for (const r of found) {
    if (r < lo - 1e-9 || r >= hi - 1e-9) continue
    if (out.length === 0 || r - out[out.length - 1] > ROOT_TOL_DEG) out.push(r)
  }
  return out
}

/** The distance from x to the nearest multiple of m, measured on the circle: a number in [0, m/2]. */
function circleGap(x: number, m: number): number {
  const d = (((x % m) + m) % m)
  return Math.min(d, m - d)
}

/**
 * Whether every value in the listed roots is a root of f in [0, 360) and every root in [0, 360) is listed (each once).
 * Null when f cannot be read.
 */
function listedRootsHold(f: (deg: number) => number, listed: number[]): boolean | null {
  for (const t of listed) {
    if (!(Math.abs(f(t)) <= TOL)) return false
  }
  for (let i = 0; i < listed.length; i++) {
    for (let j = i + 1; j < listed.length; j++) {
      if (circleGap(listed[i] - listed[j], 360) < ROOT_TOL_DEG) return false
    }
  }
  const found = rootsOf(f, 0, 360)
  if (found === null) return null
  return found.every((r) => listed.some((t) => circleGap(r - t, 360) < ROOT_TOL_DEG))
}

// ---------------------------------------------------------------------------------------------------------
// Exact angles: reading and writing them
// ---------------------------------------------------------------------------------------------------------

const DEG180 = rat(180n)

/** A plain decimal ("22.5", "-3") as an exact rational. */
function decimalRat(text: string): Rat {
  const parts = text.split('.')
  const frac = parts[1] ?? ''
  return rat(BigInt(parts[0] + frac), 10n ** BigInt(frac.length))
}

/** A rational as a plain decimal, or null when it has no finite decimal form. */
function decimalOf(r: Rat): string | null {
  const neg = r.n < 0n
  const n = neg ? -r.n : r.n
  const scaled = n * 1000000n
  if (scaled % r.d !== 0n) return null
  const digits = (scaled / r.d).toString().padStart(7, '0')
  const whole = digits.slice(0, -6)
  const frac = digits.slice(-6).replace(/0+$/, '')
  return (neg && n !== 0n ? '-' : '') + whole + (frac ? `.${frac}` : '')
}

/** An angle in units of π, as LaTeX: 0, π, −\frac{5π}{6}, 2π. */
function radTex(pi: Rat): string {
  if (rIsZero(pi)) return '0'
  const neg = pi.n < 0n
  const n = neg ? -pi.n : pi.n
  const sign = neg ? '-' : ''
  if (pi.d === 1n) return n === 1n ? `${sign}\\pi` : `${sign}${n}\\pi`
  return `${sign}\\frac{${n === 1n ? '' : n}\\pi}{${pi.d}}`
}

/** An angle in degrees written as the value of an answer in the given unit: 22.5, or \frac{\pi}{8}. Null when it has no decimal form. */
export function angleValueTex(deg: Rat, unit: AngleUnit): string | null {
  return unit === 'deg' ? decimalOf(deg) : radTex(rDiv(deg, DEG180))
}

/** An angle written as a literal in the given unit, with its degree sign in degrees: 30^{\circ}, or \frac{\pi}{6}. */
export function angleLitTex(deg: Rat, unit: AngleUnit): string | null {
  if (unit === 'rad') return radTex(rDiv(deg, DEG180))
  const d = decimalOf(deg)
  return d === null ? null : `${d}^{\\circ}`
}

/**
 * An angle literal read as an exact number of degrees: 0, 30^{\circ}, -22.5^{\circ}, \frac{\pi}{6}, 2\pi, -\frac{5\pi}{6}.
 * A bare number other than 0 is refused: in a family it could be degrees or radians, and only the written unit says which.
 */
function parseAngleLit(text: string): Rat | null {
  const s = text.replace(/\s+/g, '')
  if (s === '0') return R0
  let m = /^(-?)(\d+(?:\.\d+)?)\^\{\\circ\}$/.exec(s)
  if (m) {
    const v = decimalRat(m[2])
    return m[1] === '-' ? rNeg(v) : v
  }
  m = /^(-?)(\d*)\\pi$/.exec(s)
  if (m) {
    const v = rat(BigInt(m[2] || '1') * 180n)
    return m[1] === '-' ? rNeg(v) : v
  }
  m = /^(-?)\\frac\{(\d*)\\pi\}\{(\d+)\}$/.exec(s)
  if (m) {
    const den = BigInt(m[3])
    if (den === 0n) return null
    const v = rat(BigInt(m[2] || '1') * 180n, den)
    return m[1] === '-' ? rNeg(v) : v
  }
  return null
}

/** The unit a family or an answer is written in: radians when π appears, otherwise degrees. */
function unitOf(text: string): AngleUnit {
  return /\\pi/.test(text) ? 'rad' : 'deg'
}

/** The general solution in the letter v, one family per "or": "x = 30^{\circ} + 360^{\circ}k \text{ or } x = 150^{\circ} + 360^{\circ}k". */
export function familyText(v: string, families: Family[], unit: AngleUnit): string | null {
  const parts: string[] = []
  for (const { a, p } of families) {
    const aTex = angleLitTex(a, unit)
    const pTex = angleLitTex(p, unit)
    if (aTex === null || pTex === null) return null
    // A π at the end of the period ends in a letter, so a space keeps "\pi k" from reading as the one command "\pik".
    const gap = /[A-Za-z]$/.test(pTex) ? ' ' : ''
    parts.push(`${v} = ${aTex} + ${pTex}${gap}k`)
  }
  return parts.join(' \\text{ or } ')
}

/** Read a general solution: every "or" part is "v = a + p k" in one unit, with p > 0. Null when it is not one. */
function parseFamilies(text: string, v: string): { families: Family[]; unit: AngleUnit } | null {
  const parts = text.replace(/\\text\{\s*or\s*\}/g, ' or ').split(/\s+or\s+/)
  const re = new RegExp(`^${v}\\s*=\\s*(.+?)\\s*\\+\\s*(.+?)\\s*k$`)
  const families: Family[] = []
  let unit: AngleUnit | null = null
  for (const part of parts) {
    const m = re.exec(part.trim())
    if (!m) return null
    const a = parseAngleLit(m[1])
    const p = parseAngleLit(m[2])
    if (a === null || p === null || p.n <= 0n) return null
    const u = unitOf(part)
    if (unit !== null && unit !== u) return null
    unit = u
    families.push({ a, p })
  }
  return families.length > 0 && unit !== null ? { families, unit } : null
}

/** The members of the general solution that lie in the range, once each, in order. */
export function membersIn(families: Family[], range: TrigRange): Rat[] {
  const lo = rat(BigInt(range.min))
  const hi = rat(BigInt(range.max))
  const out: Rat[] = []
  for (const { a, p } of families) {
    const pn = rNum(p)
    const an = rNum(a)
    const kLo = Math.floor((range.min - an) / pn) - 1
    const kHi = Math.ceil((range.max - an) / pn) + 1
    for (let k = kLo; k <= kHi; k++) {
      const t = rAdd(a, rMul(p, rat(BigInt(k))))
      const aboveLo = rCmp(t, lo) >= 0
      const belowHi = range.inclusive ? rCmp(t, hi) <= 0 : rCmp(t, hi) < 0
      if (aboveLo && belowHi) out.push(t)
    }
  }
  out.sort(rCmp)
  return out.filter((t, i) => i === 0 || !rEq(t, out[i - 1]))
}

// ---------------------------------------------------------------------------------------------------------
// The equation's trig terms, its period, and the table of principal angles
// ---------------------------------------------------------------------------------------------------------

/** Every sine, cosine or tangent of an argument with no brackets in it, as the function and its argument text. */
function trigTerms(text: string): Array<{ fn: TrigFn; arg: string }> {
  const out: Array<{ fn: TrigFn; arg: string }> = []
  for (const m of text.matchAll(/\\?(sin|cos|tan)\s*\(\s*([^()]*?)\s*\)/g)) {
    out.push({ fn: m[1] as TrigFn, arg: m[2] })
  }
  return out
}

/** The one trig function an equation uses, or null when it uses none or more than one. */
function trigFnOf(text: string): TrigFn | null {
  const fns = new Set(trigTerms(text).map((t) => t.fn))
  return fns.size === 1 ? [...fns][0] : null
}

/** The whole-number multiple c when an argument reads c·v (v alone is c = 1), or null otherwise. */
export function multipleOf(arg: string, v: string): number | null {
  const s = arg.replace(/[\s*]+/g, '')
  const m = new RegExp(`^(\\d*)${v}$`).exec(s)
  if (!m) return null
  const c = m[1] === '' ? 1 : Number(m[1])
  return c > 0 ? c : null
}

/** The least common period of the equation's trig terms in the letter v, in degrees; null when a term is not c·v. */
function equationPeriod(eq: string, v: string): Rat | null {
  const terms = trigTerms(eq)
  if (terms.length === 0) return null
  let period: Rat | null = null
  for (const { fn, arg } of terms) {
    const c = multipleOf(arg, v)
    if (c === null) return null
    const own = rat(fn === 'tan' ? 180n : 360n, BigInt(c))
    period = period === null ? own : rat(blcm(period.n, own.n), bgcd(period.d, own.d))
  }
  return period
}

interface Principal {
  value: number
  tex: string
  /** The angles in [0, 360) with this value (in [0, 180) for tan). */
  angles: number[]
}

const S2 = Math.SQRT1_2
const S3 = Math.sqrt(3)

/** The standard values, and the angles that give them (degrees). */
const PRINCIPAL: Record<TrigFn, Principal[]> = {
  sin: [
    { value: 0, tex: '0', angles: [0, 180] },
    { value: 0.5, tex: '\\frac{1}{2}', angles: [30, 150] },
    { value: -0.5, tex: '-\\frac{1}{2}', angles: [210, 330] },
    { value: 1, tex: '1', angles: [90] },
    { value: -1, tex: '-1', angles: [270] },
    { value: S2, tex: '\\frac{\\sqrt{2}}{2}', angles: [45, 135] },
    { value: -S2, tex: '-\\frac{\\sqrt{2}}{2}', angles: [225, 315] },
    { value: S3 / 2, tex: '\\frac{\\sqrt{3}}{2}', angles: [60, 120] },
    { value: -S3 / 2, tex: '-\\frac{\\sqrt{3}}{2}', angles: [240, 300] }
  ],
  cos: [
    { value: 1, tex: '1', angles: [0] },
    { value: -1, tex: '-1', angles: [180] },
    { value: 0, tex: '0', angles: [90, 270] },
    { value: 0.5, tex: '\\frac{1}{2}', angles: [60, 300] },
    { value: -0.5, tex: '-\\frac{1}{2}', angles: [120, 240] },
    { value: S2, tex: '\\frac{\\sqrt{2}}{2}', angles: [45, 315] },
    { value: -S2, tex: '-\\frac{\\sqrt{2}}{2}', angles: [135, 225] },
    { value: S3 / 2, tex: '\\frac{\\sqrt{3}}{2}', angles: [30, 330] },
    { value: -S3 / 2, tex: '-\\frac{\\sqrt{3}}{2}', angles: [150, 210] }
  ],
  tan: [
    { value: 0, tex: '0', angles: [0] },
    { value: 1, tex: '1', angles: [45] },
    { value: -1, tex: '-1', angles: [135] },
    { value: S3, tex: '\\sqrt{3}', angles: [60] },
    { value: -S3, tex: '-\\sqrt{3}', angles: [120] },
    { value: S3 / 3, tex: '\\frac{\\sqrt{3}}{3}', angles: [30] },
    { value: -S3 / 3, tex: '-\\frac{\\sqrt{3}}{3}', angles: [150] }
  ]
}

/** The standard entry for a value of the function, or null when the value is not one of the standard ones. */
export function principalOf(fn: TrigFn, value: number): Principal | null {
  // The same number up to rounding (the repo's noise rule, math/noise.ts): a root computed by a square root is a few ulps off.
  return PRINCIPAL[fn].find((p) => sameNumber(p.value, value)) ?? null
}

/**
 * The general solution of fn(c·v) = value, in the letter v (degrees): one family for each standard angle θ, namely
 * x = θ/c + (period/c)·k. Null when the value is not a standard one.
 */
export function familiesOf(fn: TrigFn, c: number, value: number): Family[] | null {
  const entry = principalOf(fn, value)
  if (!entry) return null
  const period = rat(fn === 'tan' ? 180n : 360n, BigInt(c))
  const out: Family[] = []
  for (const theta of entry.angles) {
    const a = rDiv(rat(BigInt(theta)), rat(BigInt(c)))
    if (!out.some((f) => rEq(f.a, a))) out.push({ a, p: period })
  }
  return out
}

/** The acute reference angle of a value: the least standard angle for its absolute value, in degrees. */
export function referenceAngleOf(fn: TrigFn, value: number): Rat | null {
  const entry = principalOf(fn, Math.abs(value))
  if (!entry) return null
  return rat(BigInt(Math.min(...entry.angles)))
}

/** What a reference angle's quadrant line says for a function and the sign of its value. */
export function quadrantText(fn: TrigFn, negative: boolean): string {
  if (fn === 'sin') return negative ? 'sine is negative in quadrants III and IV' : 'sine is positive in quadrants I and II'
  if (fn === 'cos') return negative ? 'cosine is negative in quadrants II and III' : 'cosine is positive in quadrants I and IV'
  return negative ? 'tangent is negative in quadrants II and IV' : 'tangent is positive in quadrants I and III'
}

/** The line that gives a tangent's period in a unit. */
export function periodQuad(unit: AngleUnit): string {
  return unit === 'deg' ? 'period 180^{\\circ}' : 'period \\pi'
}

// ---------------------------------------------------------------------------------------------------------
// The checks: one for each trig move, and the solution set
// ---------------------------------------------------------------------------------------------------------

/** Two equal-valued functions at every sample they both read at, with at least five samples read. */
function sameOnSamples(f: (deg: number) => number, g: (deg: number) => number): ValidationVerdict {
  let read = 0
  for (const t of SAMPLE_DEG) {
    const a = f(t)
    const b = g(t)
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    read++
    if (!(Math.abs(a - b) <= TOL * Math.max(1, Math.abs(a)))) return 'invalid'
  }
  return read >= 5 ? 'valid' : 'unknown'
}

/** The text of a letter-only check: every word of the text other than the letter is refused. */
function onlyLetter(text: string, letter: string): boolean {
  const words = text.replace(/\\[A-Za-z]+/g, ' ').match(/[A-Za-z]+/g) ?? []
  return words.every((w) => w === letter)
}

/** The clauses of a disjunction: "\sin x = a \text{ or } \sin x = b" gives the two equations. */
function clausesOf(text: string): string[] {
  return text
    .replace(/\\text\{\s*or\s*\}/g, ' or ')
    .split(/\s+or\s+/)
    .map((c) => c.trim())
    .filter((c) => c !== '')
}

/** The move a trig step claims, checked in the angle letter v. */
export function checkTrigMove(
  before: string,
  after: string,
  op: { kind: string; angle?: string; quad?: string; rejected?: string[] },
  v: string
): ValidationVerdict {
  switch (op.kind) {
    case 'divide-cos': {
      // sin x = cos x divided by cos x is tan x = 1: the rewrite holds wherever cos x is not 0 (every sample avoids 90°).
      const fb = residualOf(before, v)
      const fa = residualOf(after, v)
      if (!fb || !fa) return 'unknown'
      return sameOnSamples(fb, (t) => Math.cos(toRad(t)) * fa(t))
    }
    case 'trig-ref-angle': {
      // The same equation, and a reference angle that is acute and whose function has the size of the right side.
      const fb = residualOf(before, v)
      const fa = residualOf(after, v)
      if (!fb || !fa) return 'unknown'
      const same = sameOnSamples(fb, fa)
      if (same !== 'valid') return same
      const fn = trigFnOf(before)
      const theta = op.angle === undefined ? null : parseAngleLit(op.angle)
      if (fn === null || theta === null) return 'unknown'
      const th = rNum(theta)
      if (th < 0 || th > 90) return 'invalid'
      const right = after.split('=')[1] ?? ''
      const value = constantOf(right)
      if (!Number.isFinite(value)) return 'unknown'
      if (Math.abs(Math.abs(fnValue(fn, toRad(th))) - Math.abs(value)) > TOL) return 'invalid'
      if (op.quad === undefined) return 'valid'
      const tanPeriod = fn === 'tan' && (op.quad === periodQuad('deg') || op.quad === periodQuad('rad'))
      return op.quad === quadrantText(fn, value < 0) || tanPeriod ? 'valid' : 'invalid'
    }
    case 'trig-general': {
      // Every member solves the equation (at its own value and its next two periods), and every root of the
      // equation in one period is a member. The members' period must be a whole multiple of the equation's period.
      const parsed = parseFamilies(after, v)
      if (!parsed) return 'invalid'
      const { families } = parsed
      const p = families[0].p
      if (families.some((f) => !rEq(f.p, p))) return 'invalid'
      const period = equationPeriod(before, v)
      if (period === null) return 'unknown'
      const whole = rDiv(p, period)
      if (whole.d !== 1n || whole.n <= 0n) return 'invalid'
      const clauses = clausesOf(before).map((c) => residualOf(c, v))
      if (clauses.length === 0 || clauses.some((f) => f === null)) return 'unknown'
      const fs = clauses as Array<(deg: number) => number>
      for (const { a } of families) {
        for (const k of [0, 1, -1]) {
          const t = rNum(rAdd(a, rMul(p, rat(BigInt(k)))))
          if (!fs.some((f) => Math.abs(f(t)) <= TOL)) return 'invalid'
        }
      }
      const pn = rNum(p)
      for (const f of fs) {
        const roots = rootsOf(f, 0, pn)
        if (roots === null) return 'unknown'
        for (const r of roots) {
          if (!families.some((fam) => circleGap(r - rNum(fam.a), pn) < ROOT_TOL_DEG)) return 'invalid'
        }
      }
      return 'valid'
    }
    case 'trig-substitute': {
      // The equation in the trig function equals the one in u at u = that function of the angle, at every sample.
      // The argument is c·v (v, or 2v for sin 2x): the function is read of c times the sample angle.
      const terms = trigTerms(before)
      if (terms.length === 0 || new Set(terms.map((t) => t.fn)).size !== 1) return 'unknown'
      const { fn, arg } = terms[0]
      if (terms.some((t) => t.arg.replace(/\s/g, '') !== arg.replace(/\s/g, ''))) return 'unknown'
      const c = multipleOf(arg, v)
      if (c === null) return 'unknown'
      if (!onlyLetter(after, 'u')) return 'invalid'
      const fb = residualOf(before, v)
      const fa = residualRaw(after, 'u')
      if (!fb || !fa) return 'unknown'
      return sameOnSamples(fb, (t) => fa(fnValue(fn, toRad(c * t))))
    }
    case 'trig-back-substitute': {
      // The roots of the equation in u are the values the clauses give the function. For a sine or a cosine a root
      // outside -1..1 has no angle: the clauses leave it out, and op.rejected names it (the working says so in words).
      if (!onlyLetter(before, 'u')) return 'invalid'
      const f = residualRaw(before, 'u')
      if (!f) return 'unknown'
      const c0 = f(0)
      const s1 = (f(1) + f(-1)) / 2
      const diff = (f(1) - f(-1)) / 2
      const a = s1 - c0
      const b = diff
      // The method only writes a quadratic in u, so the form is fitted from three values and checked at more points: a
      // higher power would not match all of them.
      const scale = 1 + Math.abs(c0) + Math.abs(a) + Math.abs(b)
      const fits = (u: number, q: number): boolean => Math.abs(f(u) - q) <= 1e-9 * scale
      if (!fits(2, 4 * a + 2 * b + c0) || !fits(-2, 4 * a - 2 * b + c0)) return 'unknown'
      if (!fits(3, 9 * a + 3 * b + c0) || !fits(-3, 9 * a - 3 * b + c0)) return 'unknown'
      if (!fits(0.5, a / 4 + b / 2 + c0) || !fits(-0.5, a / 4 - b / 2 + c0)) return 'unknown'
      let roots: number[]
      // A coefficient that is rounding noise beside the others is zero (math/noise.ts), so the equation is then linear or has no root.
      if (isNoise(a, b, c0)) {
        if (isNoise(b, a, c0)) return 'unknown'
        roots = [-c0 / b]
      } else {
        const disc = b * b - 4 * a * c0
        if (disc < 0 && !isNoise(disc, b * b, Math.abs(4 * a * c0))) roots = []
        else {
          const s = Math.sqrt(Math.max(0, disc))
          roots = [(-b + s) / (2 * a), (-b - s) / (2 * a)]
        }
      }
      const clauses = clausesOf(after)
      if (clauses.length === 0) return 'invalid'
      const values: number[] = []
      let clauseFn: TrigFn | null = null
      for (const c of clauses) {
        const m = /^\\?(sin|cos|tan)\s*\(\s*[^()]+\)\s*=\s*(.+)$/.exec(c)
        if (!m) return 'invalid'
        if (clauseFn !== null && clauseFn !== m[1]) return 'invalid'
        clauseFn = m[1] as TrigFn
        const value = constantOf(m[2])
        if (!Number.isFinite(value)) return 'unknown'
        values.push(value)
      }
      const distinct = (xs: number[]): number[] => {
        const sorted = [...xs].sort((p, q) => p - q)
        return sorted.filter((x, i) => i === 0 || Math.abs(x - sorted[i - 1]) > 1e-9)
      }
      const sameList = (xs: number[], ys: number[]): boolean => xs.length === ys.length && xs.every((x, i) => Math.abs(x - ys[i]) <= 1e-9)
      // A sine or cosine is never bigger than 1 in size, so a root beyond 1 in size has no angle; for tan every root has one.
      const limit = clauseFn === 'tan' ? Number.POSITIVE_INFINITY : 1 + 1e-9
      const inRange = distinct(roots.filter((x) => Math.abs(x) <= limit))
      const outside = distinct(roots.filter((x) => Math.abs(x) > limit))
      if (!sameList(inRange, distinct(values))) return 'invalid'
      // Each root left out must be named by the move, and only those: a root that is left out unnamed is refused.
      const named = distinct((op.rejected ?? []).map((t) => constantOf(t)))
      if (named.some((x) => !Number.isFinite(x))) return 'unknown'
      return sameList(outside, named) ? 'valid' : 'invalid'
    }
    default:
      return 'unknown'
  }
}

/** A value a solution list gives, as text. */
function solutionTextOf(s: unknown): string {
  if (typeof s === 'string') return s.trim()
  if (s && typeof s === 'object' && 'value' in s) return String((s as { value: unknown }).value).trim()
  if (s && typeof s === 'object' && 'tex' in s) return String((s as { tex: unknown }).tex).trim()
  return String(s).trim()
}

/**
 * A solution set of a trig equation, shown as the general solution it came from (the before) and the in-range
 * values (the solutions, and the displayed after): the list must be exactly the members of the general solution
 * that lie in the range, written in the same unit. The general solution itself is checked by its own step.
 */
export function checkTrigSolutionSet(
  before: string,
  solutions: unknown[],
  after: string,
  v: string,
  range: TrigRange | undefined
): ValidationVerdict {
  if (range === undefined || !Number.isInteger(range.min) || !Number.isInteger(range.max) || solutions.length === 0) return 'invalid'
  const parsed = parseFamilies(before, v)
  if (!parsed) return 'invalid'
  const members = membersIn(parsed.families, range)
  if (members.length !== solutions.length) return 'invalid'
  const texts: string[] = []
  for (const m of members) {
    const t = angleValueTex(m, parsed.unit)
    if (t === null) return 'unknown'
    texts.push(t)
  }
  for (let i = 0; i < texts.length; i++) {
    if (solutionTextOf(solutions[i]).replace(/\s+/g, '') !== texts[i]) return 'invalid'
  }
  const shown = after.replace(/\\text\{\s*or\s*\}/g, ' or ').split(/\s+or\s+/)
  if (shown.length !== texts.length) return 'invalid'
  for (let i = 0; i < shown.length; i++) {
    const m = new RegExp(`^${v}\\s*=\\s*(\\S+)$`).exec(shown[i].trim())
    if (!m || m[1] !== texts[i]) return 'invalid'
  }
  return 'valid'
}

/**
 * A listed solution set for an equation that is not a trig solution-set step: each listed value is an angle that solves
 * the equation, and the equation has no other root in [0, 360). Null when a listed value is not an angle written in
 * degrees or as a multiple of π (plain numbers are not read here, so the caller's checks decide them as before).
 */
export function checkListedRoots(before: string, solutions: unknown[], v: string): ValidationVerdict | null {
  const listed: number[] = []
  for (const s of solutions) {
    const lit = parseAngleLit(solutionTextOf(s))
    if (lit === null) return null
    listed.push(rNum(lit))
  }
  const f = residualOf(before, v)
  if (!f) return 'unknown'
  const holds = listedRootsHold(f, listed)
  if (holds === null) return 'unknown'
  return holds ? 'valid' : 'invalid'
}

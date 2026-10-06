// Expression layer shared by the command bar, dependent objects and graphs.
// - preprocess(): friendly syntax (×, ·, |A|, <3,4>, (3,4), 10∠30°, π, √) → mathjs syntax
// - math: a mathjs instance with vector/geometry helpers and angle-mode-aware trig
// - inferKind(): is an expression a number, point or vector?
// - compileScalar(): mathjs AST → fast native JS function for graph sampling

import { all, create, type MathNode } from 'mathjs'
import { angleBetween, cross as vcross, dot as vdot, len, normalize, project, type V3 } from './vec'

export const math = create(all, { number: 'number', precision: 64 })
// Points after Z are named A′, A″ (core/naming.ts); a prime straight after a letter or another prime is part of the name.
{ const p = math.parse as unknown as { isAlpha: (c: string, prev: string, next: string) => boolean }; const alpha = p.isAlpha; p.isAlpha = (c, prev, next) => alpha(c, prev, next) || ('′″‴⁗'.includes(c) && !!prev && (alpha(prev, '', '') || '′″‴⁗'.includes(prev))) }

/**
 * The units the Maths screen's Units lists offer that mathjs 15.2.0 does not have, and the ones
 * it has with stale digits. `override` makes a second run harmless (createUnit throws on a name
 * that already exists), so a hot reload that runs this again cannot break it.
 *
 * mathjs reads a name as a unit whenever nothing in scope has that name, on every route that
 * shares this instance, so a short symbol defined here would swallow a letter a student types:
 * - au: the IAU 2012 astronomical unit, exactly. Not AU — the calculator's constant is AU_len.
 * - lightyear: c × one Julian year. Not ly — a two-letter symbol is caught the same way as pc.
 * - parsec: 648 000/π au. Not pc — E = 2pc (momentum × c) on the command bar would answer "E = 2".
 * - knot: 1852 m an hour, exactly. mathjs's own example, 0.514444444 m/s, is 8.6×10⁻¹⁰ m/s out.
 * - dalton: the atomic mass unit (CODATA 2022); the Mass list shows it as u. Not u itself —
 *   preprocess() turns μ into u, so f = 0.3μ would answer "f = 0.3", and u is SUVAT's initial speed.
 * - cal: the thermochemical calorie, with the short prefixes, so kcal is 4184 J.
 * - eV and electronvolt, torr, mmHg and acre replace mathjs's own: its electronvolt is CODATA
 *   2010's, it gave both pressures 133.322 Pa (1 atm read 760.0021 torr) and the acre 4046.86 m².
 *   Each keeps its prefixes and its plural or lower-case alias.
 *
 * None of them changes what a worked-out answer is written in: 2 m * 2 m stays 4 m^2 and
 * 10 N * 2 m stays 20 J, as on a bare mathjs, where only a unit the student types moves the
 * answers for its own quantity.
 */
export function defineUnits(): void {
  // mathjs writes an answer in the unit its "auto" unit system holds for that quantity, and
  // Unit.parse moves that entry to every unit it reads. createUnit reads each name it makes and
  // each definition, so on a bare 15.2.0 instance this block alone left auto with MASS as dalton,
  // TIME as hour, ENERGY as electronvolt and PRESSURE as mmHg, and added entries for SURFACE (acre)
  // and the knot's speed: 2 m * 2 m read "9.9e-4 acre", 10 N * 2 m "124.8 exaelectronvolt",
  // 10 N / (1 m^2) "0.075 mmHg", 10 N / (2 m/s^2) "3.0e+27 dalton", 1 / (2 Hz) "1.4e-4 hour" and
  // 100 m / 9.58 s "20.29 knot". si, cgs and us were not touched, but a new base is written into
  // whichever system is current, so every system is put back as found: in place, because mathjs
  // keeps hold of the system object itself, and with no entry the block added.
  const systems = Object.values(math.Unit.UNIT_SYSTEMS)
  const found = systems.map((system) => Object.fromEntries(Object.entries(system).map(([quantity, entry]) => [quantity, { ...entry }])))
  math.createUnit(
    {
      au: '149597870700 m',
      lightyear: '9460730472580800 m',
      // After au, which it is defined from: createUnit makes the units in this order.
      parsec: `${648000 / Math.PI} au`,
      knot: '1852 m/hour',
      dalton: '1.66053906892e-27 kg',
      cal: { definition: '4.184 J', prefixes: 'short' },
      eV: { definition: '1.602176634e-19 J', prefixes: 'short' },
      electronvolt: { definition: '1.602176634e-19 J', prefixes: 'long', aliases: ['electronvolts'] },
      // A torr is 1/760 of a standard atmosphere by definition.
      torr: `${101325 / 760} Pa`,
      mmHg: { definition: '133.322387415 Pa', aliases: ['mmhg'] },
      acre: { definition: '4046.8564224 m^2', aliases: ['acres'] }
    },
    { override: true }
  )
  systems.forEach((system, i) => {
    for (const quantity of Object.keys(system)) delete system[quantity]
    Object.assign(system, found[i])
  })
  // mathjs has no base unit for a speed, so createUnit made one for the knot. The restore above
  // took its entry out of the unit systems, but while the knot keeps that base Unit.parse writes
  // it back whenever a student types a knot, and every speed worked out afterwards comes out in
  // knots. Without the base the knot still converts, by its dimensions, and an answer in m/s
  // stays in m/s.
  const knot = math.Unit.UNITS.knot as unknown as { base?: { key: string } }
  const key = knot.base?.key
  delete knot.base
  if (key) delete math.Unit.BASE_UNITS[key]
}
defineUnits()

let angleMode: 'deg' | 'rad' = 'deg'
export const setAngleMode = (m: 'deg' | 'rad') => {
  angleMode = m
}
export const getAngleMode = () => angleMode

/**
 * Runs `fn` with the calculator in degrees and puts the mode back after. A vector card's 10∠30°
 * and a practice question's "sin(30)" are always degrees, but a student working in radians in
 * the Calculator must not find it silently switched.
 */
export function inDegrees<T>(fn: () => T): T {
  const prev = angleMode
  angleMode = 'deg'
  try {
    return fn()
  } finally {
    angleMode = prev
  }
}

type AnyVal = unknown

export const isUnit = (x: AnyVal): x is { toNumber: (u: string) => number; formatUnits: () => string } =>
  typeof x === 'object' && x !== null && typeof (x as { toNumber?: unknown }).toNumber === 'function' && typeof (x as { formatUnits?: unknown }).formatUnits === 'function'

/** Angle argument → radians (numbers follow the angle mode, units convert). */
export function toRadians(x: AnyVal): number {
  if (isUnit(x)) return x.toNumber('rad')
  const n = Number(x)
  return angleMode === 'deg' ? (n * Math.PI) / 180 : n
}

/** Radians → the current angle mode. */
export const fromRadians = (r: number): number => (angleMode === 'deg' ? (r * 180) / Math.PI : r)

/** Strip a physical unit to its numeric value (in its own unit). */
export function plainNumber(x: AnyVal): number {
  if (isUnit(x)) return x.toNumber(x.formatUnits())
  return Number(x)
}

export function toV3(x: AnyVal): V3 {
  let arr: unknown = x
  if (arr && typeof arr === 'object' && typeof (arr as { toArray?: unknown }).toArray === 'function') {
    arr = (arr as { toArray: () => unknown }).toArray()
  }
  if (!Array.isArray(arr)) throw new Error('Expected a vector or point')
  const flat = (arr as unknown[]).flat(2).map((v) => plainNumber(v))
  if (flat.length < 2 || flat.length > 3) throw new Error('Vectors need 2 or 3 components')
  return [flat[0], flat[1], flat[2] ?? 0]
}

// Keep the original mathjs trig for complex numbers and matrices.
const origTrig: Record<string, (v: AnyVal) => AnyVal> = {}
for (const name of ['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'asin', 'acos', 'atan', 'atan2']) {
  origTrig[name] = (math as unknown as Record<string, (v: AnyVal) => AnyVal>)[name]
}
const origLog = (math as unknown as Record<string, (v: AnyVal) => AnyVal>).log

math.import(
  {
    sin: (x: AnyVal) => (typeof x === 'number' || isUnit(x) ? Math.sin(toRadians(x)) : origTrig.sin(x)),
    cos: (x: AnyVal) => (typeof x === 'number' || isUnit(x) ? Math.cos(toRadians(x)) : origTrig.cos(x)),
    tan: (x: AnyVal) => (typeof x === 'number' || isUnit(x) ? Math.tan(toRadians(x)) : origTrig.tan(x)),
    sec: (x: AnyVal) => 1 / Math.cos(toRadians(x)),
    csc: (x: AnyVal) => 1 / Math.sin(toRadians(x)),
    cot: (x: AnyVal) => 1 / Math.tan(toRadians(x)),
    asin: (x: AnyVal) => (typeof x === 'number' && Math.abs(x) <= 1 ? fromRadians(Math.asin(x)) : origTrig.asin(x)),
    acos: (x: AnyVal) => (typeof x === 'number' && Math.abs(x) <= 1 ? fromRadians(Math.acos(x)) : origTrig.acos(x)),
    atan: (x: AnyVal) => (typeof x === 'number' ? fromRadians(Math.atan(x)) : origTrig.atan(x)),
    atan2: (y: AnyVal, x: AnyVal) => fromRadians(Math.atan2(Number(y), Number(x))),
    // Casio convention: log(x) is base 10, log(a, b) is log base a of b, ln is natural.
    ln: (x: AnyVal) => (typeof x === 'number' && x > 0 ? Math.log(x) : origLog(x)),
    log: (a: AnyVal, b?: AnyVal) => {
      if (b === undefined) return typeof a === 'number' && a > 0 ? Math.log10(a) : math.divide(origLog(a) as never, Math.LN10)
      return Math.log(Number(b)) / Math.log(Number(a))
    },
    // vector & geometry helpers
    pt: (...c: AnyVal[]) => [plainNumber(c[0]), plainNumber(c[1]), c.length > 2 ? plainNumber(c[2]) : 0],
    vec: (...c: AnyVal[]) => [plainNumber(c[0]), plainNumber(c[1]), c.length > 2 ? plainNumber(c[2]) : 0],
    polarVec: (r: AnyVal, theta: AnyVal) => {
      const m = plainNumber(r)
      const t = toRadians(theta)
      return [m * Math.cos(t), m * Math.sin(t), 0]
    },
    cross: (a: AnyVal, b: AnyVal) => vcross(toV3(a), toV3(b)),
    // What the × key means depends on what is on either side of it: a cross product between
    // vectors, ordinary multiplication otherwise — two numbers, a number scaling a vector, or two
    // complex numbers.
    // Rewriting every × to cross() made "2 × 3" unreadable — and worse, PhysLab prints small
    // numbers as "1.234×10^-5", so it could not read back what it had just written. The number
    // × vector case is what lets a definition be kept exactly as typed: `C = 2 × A` used to be
    // stored as `2 * A` because this function refused it, and the same line typed into the
    // Properties panel's formula field failed with "Expected a vector or point".
    // A complex number is a scalar as well: sqrt(-4)×sqrt(-9) fell through to the cross product and
    // was refused, where sqrt(-4)*sqrt(-9) is −6. Beside a vector it is still refused in the same
    // words, as before: a drawing has no complex arrows.
    timesOrCross: (a: AnyVal, b: AnyVal) => {
      const scalar = (v: AnyVal) => typeof v === 'number' || isUnit(v)
      if (scalar(a) || scalar(b) || (math.isComplex(a) && math.isComplex(b))) return math.multiply(a as never, b as never)
      return vcross(toV3(a), toV3(b))
    },
    // The · key means what its operands make it, as × does: the dot product of two vectors, and
    // ordinary multiplication otherwise. A textbook writes 2·3 and 5·√2 for products and 2·A for a
    // scaled vector; all three were refused with "Expected a vector or point".
    dot: (a: AnyVal, b: AnyVal) => {
      const scalar = (v: AnyVal) => typeof v === 'number' || isUnit(v)
      const list = (v: AnyVal) => Array.isArray(v) || (typeof v === 'object' && v !== null && typeof (v as { toArray?: unknown }).toArray === 'function')
      if (scalar(a) && scalar(b)) return math.multiply(a as never, b as never)
      if ((scalar(a) && list(b)) || (list(a) && scalar(b))) {
        toV3(scalar(a) ? b : a) // a list that is not a 2- or 3-part vector is refused in its own words
        return math.multiply(a as never, b as never)
      }
      if (list(a) && list(b)) return vdot(toV3(a), toV3(b))
      throw new Error('Expected a number or a vector on each side of ·')
    },
    mag: (a: AnyVal) => (typeof a === 'number' ? Math.abs(a) : isUnit(a) ? math.abs(a as never) : len(toV3(a))),
    unitVec: (a: AnyVal) => normalize(toV3(a)),
    angleBetween: (a: AnyVal, b: AnyVal) => fromRadians(angleBetween(toV3(a), toV3(b))),
    proj: (b: AnyVal, a: AnyVal) => project(toV3(b), toV3(a)),
    comps: (a: AnyVal) => toV3(a),
    xcomp: (a: AnyVal) => toV3(a)[0],
    ycomp: (a: AnyVal) => toV3(a)[1],
    zcomp: (a: AnyVal) => toV3(a)[2],
    direction: (a: AnyVal) => {
      const v = toV3(a)
      let t = Math.atan2(v[1], v[0])
      if (t < 0) t += 2 * Math.PI
      return fromRadians(t)
    },
    distance: (a: AnyVal, b: AnyVal) => len(vsub(toV3(a), toV3(b))),
    midpoint: (a: AnyVal, b: AnyVal) => {
      const p = toV3(a)
      const q = toV3(b)
      return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]
    }
  },
  { override: true }
)

function vsub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

// ---------------------------------------------------------------------------
// Friendly syntax → mathjs syntax
// ---------------------------------------------------------------------------

// The primes are part of a name (A′ is the point after Z, and a copy of A): without them `2 × A′`
// took A alone as the right operand and left the prime outside the call, a syntax error.
const IDENT = /[A-Za-z0-9_Ͱ-Ͽ'′″‴⁗]/

/** Finds the index of the bracket matching the one at `open`. */
function matchForward(s: string, open: number): number {
  const o = s[open]
  const c = o === '(' ? ')' : o === '[' ? ']' : '}'
  let depth = 0
  for (let i = open; i < s.length; i++) {
    if (s[i] === o) depth++
    else if (s[i] === c && --depth === 0) return i
  }
  return -1
}

function matchBackward(s: string, close: number): number {
  const c = s[close]
  const o = c === ')' ? '(' : c === ']' ? '[' : '{'
  let depth = 0
  for (let i = close; i >= 0; i--) {
    if (s[i] === c) depth++
    else if (s[i] === o && --depth === 0) return i
  }
  return -1
}

function hasTopLevelComma(s: string): boolean {
  let depth = 0
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (ch === ',' && depth === 0) return true
  }
  return false
}

/** `(3, 4)` → `pt(3, 4)` when the parentheses are not a function call. */
function tuplesToPoints(s: string): string {
  let out = ''
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (ch === '(') {
      let j = out.length - 1
      while (j >= 0 && out[j] === ' ') j--
      const prev = j >= 0 ? out[j] : ''
      const close = matchForward(s, i)
      if (close < 0) {
        out += s.slice(i)
        break
      }
      const inner = tuplesToPoints(s.slice(i + 1, close))
      const isCall = prev !== '' && (IDENT.test(prev) || prev === ')' || prev === ']')
      out += !isCall && hasTopLevelComma(inner) ? `pt(${inner})` : `(${inner})`
      i = close + 1
    } else {
      out += ch
      i++
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// The operands of × and ·
// ---------------------------------------------------------------------------
// mathjs has no × or ·, so preprocess rewrites `a × b` into timesOrCross(a, b) and `a · b` into
// dot(a, b). The call's brackets then decide what the sign binds to, so the text taken for a and b
// must be exactly what an ordinary * would take there, or the line quietly means something else:
// 2×3^2 was (2×3)² = 36, and 2×1.6e-19 was 2 × 1.6 × e − 19.
// - Operands are made of factors. A factor is a name, a number or a bracket — with any call or
//   index brackets written against it (sqrt(4), 2(3+1)) and any postfix ! after it — raised by
//   a power chain whose exponents may be signed, bracketed or calls (3^2^2, 2^-1, e^-x, 2^sqrt(4)),
//   with the signs written before it (−3^2). Powers and factorials are worked out before ×, so they
//   belong to the factor on either side of it. A % is no part of any of this: percentToDivision has
//   turned it into a bracket (50% is (50/100)) before the scanners run.
// - A number is read whole, 1.6e-19 included: its e and sign are not Euler's e and a minus. Only a
//   real number literal counts, so rate-2×3 is rate − 6 and e-2×3 is e − 6.
// - The right operand is one factor, and stops at / as * does (3×1/2 is (3×1)/2). The left operand
//   runs back over the factors joined to it by / or *, to the nearest + − , ( = or start:
//   × is worked out left to right with / and *, so 1/2×3 is (1/2)×3 = 1.5 and ½mv² typed as
//   1/2×4×3^2 is 18 — not 1/6 and 1/72, as when × took the 2 alone.
// × and · still group left to right among themselves, as each call is made at the leftmost sign
// (A×B×C is (A×B)×C), and every × is made before any ·, so A·B×C is still A·(B×C).

/** A character of a name or a number. */
const isWordChar = (c: string | undefined): boolean => c !== undefined && (IDENT.test(c) || c === '.')
/** A character an operand can end with: a − after one subtracts instead of negating. */
const ENDS_OPERAND = /[A-Za-z0-9_Ͱ-Ͽ'′″‴⁗.)\]}!"]/
/** A number literal, its e-exponent included. */
const NUMBER = /(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y

// Skip what mathjs skips between tokens: a newline ends a statement, so it is not skipped.
const SPACE = /[ \t\xa0]/
const back = (s: string, i: number): number => {
  while (i >= 0 && SPACE.test(s[i])) i--
  return i
}
const ahead = (s: string, i: number): number => {
  while (i < s.length && SPACE.test(s[i])) i++
  return i
}

/** Start of the name or number ending at `i`, a number such as 1.6e-19 whole. */
function wordStart(s: string, i: number): number {
  let j = i
  while (j >= 0 && isWordChar(s[j])) j--
  // The 19 of 1.6e-19: the sign is part of the number when the e before it follows a number
  // literal of its own — not when the e ends a name (rate-2) or is Euler's e (e-2).
  if ((s[j] === '-' || s[j] === '+') && /[eE]/.test(s[j - 1] ?? '') && /\d/.test(s[j + 1] ?? '')) {
    const mantissa = /(?:\d+\.?\d*|\.\d+)$/.exec(s.slice(0, j - 1))
    if (mantissa && !isWordChar(s[mantissa.index - 1])) return mantissa.index
  }
  return j + 1
}

/** Start of the atom ending at `i` — a name, a number, or brackets with the name or number written against them — or -1. */
function atomStart(s: string, i: number): number {
  if (i < 0) return -1
  if (s[i] === ')' || s[i] === ']' || s[i] === '}') {
    while (s[i] === ')' || s[i] === ']' || s[i] === '}') {
      const open = matchBackward(s, i)
      if (open < 0) return -1
      i = open - 1
    }
    return isWordChar(s[i]) ? wordStart(s, i) : i + 1
  }
  return isWordChar(s[i]) ? wordStart(s, i) : -1
}

/** Start of the atom ending at `i` with the ! written after it (3!). */
function postfixedStart(s: string, i: number): number {
  while (s[i] === '!') i = back(s, i - 1)
  return atomStart(s, i)
}

/** Start of the factor ending at `i`: the postfixed atom, the power chain it ends and the signs before it — or -1. */
function factorStart(s: string, i: number): number {
  let start = postfixedStart(s, i)
  while (start >= 0) {
    // 3^2 — and 2^-1 or e^-x, whose signs belong to the exponent
    let j = back(s, start - 1)
    while (s[j] === '-' || s[j] === '+') j = back(s, j - 1)
    if (s[j] !== '^') break
    start = postfixedStart(s, back(s, j - 1))
  }
  if (start < 0) return -1
  // A sign is the factor's own (−2×3, 1/−2×3) unless an operand stands before it to subtract from.
  for (let j = back(s, start - 1); (s[j] === '-' || s[j] === '+') && !ENDS_OPERAND.test(s[back(s, j - 1)] ?? ''); j = back(s, j - 1)) start = j
  return start
}

/** Start of the left operand of the sign just after `end`: its factor and the factors joined to it by / or *. */
function leftOperandStart(s: string, end: number): number {
  let start = factorStart(s, back(s, end))
  while (start >= 0) {
    const j = back(s, start - 1)
    if (s[j] !== '/' && s[j] !== '*') break
    const prev = factorStart(s, back(s, j - 1))
    if (prev < 0) break
    start = prev
  }
  return start
}

/** End of the name or number starting at `i`, a number such as 1.6e-19 whole, with a name written against it (3x). */
function wordEnd(s: string, i: number): number {
  NUMBER.lastIndex = i
  let j = NUMBER.exec(s) ? NUMBER.lastIndex : i
  while (isWordChar(s[j])) j++
  return j - 1
}

/** End of the atom starting at `i` — a name, a number or brackets, with any call or index brackets written against it — or -1. */
function atomEnd(s: string, i: number): number {
  let j = s[i] === '(' || s[i] === '[' || s[i] === '{' ? matchForward(s, i) : isWordChar(s[i]) ? wordEnd(s, i) : -1
  while (j >= 0 && (s[j + 1] === '(' || s[j + 1] === '[')) j = matchForward(s, j + 1)
  return j
}

/** End of the atom starting at `i` with the ! written after it — never the ! of !=. */
function postfixedEnd(s: string, i: number): number {
  let j = atomEnd(s, i)
  while (j >= 0) {
    const n = ahead(s, j + 1)
    if (s[n] === '!' && s[n + 1] !== '=') j = n
    else break
  }
  return j
}

/** End of the right operand of a sign, starting at `start`: one factor — its signs, the postfixed atom and its power chain — or -1. */
function rightOperandEnd(s: string, start: number): number {
  let i = ahead(s, start)
  while (s[i] === '-' || s[i] === '+') i = ahead(s, i + 1)
  let end = postfixedEnd(s, i)
  while (end >= 0) {
    let e = ahead(s, end + 1)
    if (s[e] !== '^') break
    e = ahead(s, e + 1)
    while (s[e] === '-' || s[e] === '+') e = ahead(s, e + 1)
    const exponent = postfixedEnd(s, e)
    if (exponent < 0) break
    end = exponent
  }
  return end
}

/** Rewrites infix `a × b` into `fn(a, b)`, one sign at a time from the left. */
function infixToCall(s: string, op: string, fn: string): string {
  let guard = 0
  let idx = s.indexOf(op)
  while (idx >= 0 && guard++ < 100) {
    let ls = leftOperandStart(s, idx - 1)
    let re = rightOperandEnd(s, idx + op.length)
    // A missing operand (A ·, A × / B) is left empty, so mathjs answers "Value expected" and the
    // student reads that the sign is waiting for something. A sign at the start of the line or
    // against an unmatched bracket is left as it is, as before.
    const prev = back(s, idx - 1)
    const next = s[ahead(s, idx + op.length)]
    if (ls < 0 && prev >= 0 && !')]}'.includes(s[prev])) ls = idx
    if (re < 0 && next !== '(' && next !== '[' && next !== '{') re = idx + op.length - 1
    if (ls < 0 || re < idx) break
    const left = s.slice(ls, idx).trim()
    const right = s.slice(idx + op.length, re + 1).trim()
    s = `${s.slice(0, ls)}${fn}(${left}, ${right})${s.slice(re + 1)}`
    idx = s.indexOf(op)
  }
  return s
}

/**
 * A postfix % is a percent, always: its operand over 100, as the % key of a scientific calculator.
 * mathjs reads a % as a modulo whenever something follows it, so "50% + 2" was 50 mod 2 = 0 and
 * "7%3" was 1, and it works "100 + 10%" out as 100 plus 10 % of itself, 110. The modulo is written
 * mod ("7 mod 3"), which mathjs reads as it stands and this leaves alone.
 * The operand is the name, number, bracket or call the % follows, with any ! before it, as for a
 * ! — so 3!% is 6/100, (20+30)% is (20+30)/100 and 50%% is 50/100/100 — and the division is put in
 * brackets, so that mathjs and the × and · rewrites after this one take it as a single operand.
 * A % with no operand before it (% 5, 5 + %) is left for mathjs to refuse in its own words.
 */
function percentToDivision(s: string): string {
  let from = 0
  for (let at = s.indexOf('%', from); at >= 0; at = s.indexOf('%', from)) {
    const end = back(s, at - 1)
    const start = postfixedStart(s, end)
    if (start < 0) {
      from = at + 1
      continue
    }
    s = `${s.slice(0, start)}(${s.slice(start, end + 1)}/100)${s.slice(at + 1)}`
    from = end + 7 // just after the bracket made here, which is 6 characters longer than the operand it holds
  }
  return s
}

const SUPERSCRIPT: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+' }
const plainDigits = (t: string): string => [...t].map((c) => SUPERSCRIPT[c] ?? c).join('')

/** A mantissa, ×10 with ×, · or ⋅ (the forms PhysLab prints; never a plain *), and an exponent that is signed, bracketed or in superscript. */
const X10 = /(\d+(?:\.\d*)?|\.\d+)\s*[×·⋅]\s*10\s*(?:\^\s*(?:([-+]?)\s*(\d+)|\(\s*([-+]?)\s*(\d+)\s*\))|([⁻⁺]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+))/g

/**
 * One X10 match as the literal mantissa e exponent — unless the mantissa is the tail of a name
 * (a2×10^3), a power's exponent (3^2×10^3 is 9 × 1000) or an e-number's exponent (1.6e-19×10^3),
 * or the exponent runs on into a power or a factorial (10^3^2, 10^3!). Those are left for × to read.
 */
function x10Literal(whole: string, mantissa: string, sign: string | undefined, exp: string | undefined, bracketSign: string | undefined, bracketExp: string | undefined, sup: string | undefined, at: number, s: string): string {
  const before = s.slice(0, at)
  const eNumber = /(?:\d+\.?\d*|\.\d+)[eE][-+]$/.exec(before)
  if (isWordChar(before[before.length - 1]) || /\^\s*[-+]?\s*$/.test(before) || (eNumber && !isWordChar(before[eNumber.index - 1]))) return whole
  if (/^(?:[\d.⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]|\s*\^|\s*!(?!=))/.test(s.slice(at + whole.length))) return whole
  const m = mantissa.startsWith('.') ? `0${mantissa}` : mantissa.replace(/\.$/, '')
  return `${m}e${sup !== undefined ? plainDigits(sup) : `${sign ?? bracketSign}${exp ?? bracketExp}`}`
}

export function preprocess(src: string): string {
  let s = src
    .replace(/[−–]/g, '-')
    .replace(/÷/g, '/')
    .replace(/π/g, 'pi')
    .replace(/θ/g, 'theta')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/√\s*([A-Za-z0-9_.]+)/g, 'sqrt($1)')
    .replace(/∛\s*\(/g, 'cbrt(')
    .replace(/µ|μ/g, 'u')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/≠/g, '!=')
    .replace(/\*\*/g, '^')
  // "1.234×10^-5" is one number, not a multiplication. It is how fmt() prints anything very large or
  // very small and how a scientific calculator's ×10ˣ (standard form) key enters one, so it comes
  // back in on every copy and paste, and it stays one number wherever it stands: 1/2×10^3 is
  // 1/(2×10³) = 0.0005, as on the calculator. It becomes the literal 1.234e-5 before any ×, ² or ⁻
  // is read: as a product mathjs works 1.6×10^-19 out a last bit off 1.6e-19, and read piece by
  // piece 12.5×10^3 was 1 × 2.5×10³ and 1.6×10⁻¹² was (1.6×10⁻¹)². Left bare, the literal also
  // reaches the 10 N ∠ 30° rule below. Only the signs PhysLab prints (× · ⋅) make one: a plain * is
  // an ordinary product, as in mathjs and in a Numbas answer, so 1/2*10^3 is (1/2) × 1000 = 500.
  s = s.replace(X10, x10Literal)
  // A superscript exponent, as PhysLab and a phone keyboard write one: the whole run is the
  // exponent, so 2⁴ is 2^4, 10⁻³ is 10^(-3) and 2³² is 2^32 (not 2^3^2); m/s² and x⁻¹ read as
  // before. Bracketed when a digit follows, so x²3 is refused rather than read as x^23.
  s = s.replace(/([⁻⁺]?)([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (run: string, sign: string, digits: string, at: number, str: string) =>
    sign || /[\d.]/.test(str[at + run.length] ?? '') ? `^(${plainDigits(run)})` : `^${plainDigits(digits)}`
  )
  // magnitude/angle notation: 10 ∠ 30°, 10 N at 30°. The size may be in e-notation, with a capital E
  // as often as not (1E3 ∠ 30°): with only a lowercase e matched, the rule took the 3 alone and
  // left "1E" in front of polarVec(3, 30 deg), which mathjs cannot read.
  s = s.replace(
    /(\d+(?:\.\d+)?(?:[eE][-+]?\d+)?(?:\s*[A-Za-z]+(?:\/[A-Za-z]+)?(?:\^-?\d+)?)?)\s*(?:∠|\bat\b)\s*(-?\d+(?:\.\d+)?\s*°?|-?[A-Za-z_][\w′″‴⁗]*\s*°?|\([^()]*\)\s*°?)/g,
    'polarVec($1, $2)'
  )
  s = s.replace(/°/g, ' deg')
  s = s.replace(/[⟨<]([^<>=⟨⟩]*,[^<>=⟨⟩]*)[⟩>]/g, 'vec($1)')
  s = s.replace(/\|([^|]+)\|/g, 'mag($1)')
  s = tuplesToPoints(s)
  s = percentToDivision(s)
  s = infixToCall(s, '×', 'timesOrCross')
  // · and ⋅ are one sign. Made in two passes, every · was rewritten before any ⋅, so a ⋅ left of a ·
  // grouped right to left (A⋅B·C was dot(A, dot(B, C)), where A·B⋅C was dot(dot(A, B), C)). One pass
  // takes the leftmost sign of either glyph, as it does for × and for a run of one glyph.
  s = s.replace(/⋅/g, '·')
  s = infixToCall(s, '·', 'dot')
  return s
}

// ---------------------------------------------------------------------------
// Kind inference
// ---------------------------------------------------------------------------

export type ValueKind = 'number' | 'point' | 'vector' | 'unknown'

const POINT_FNS = new Set(['pt', 'midpoint', 'Point', 'Midpoint'])
const VECTOR_FNS = new Set(['vec', 'cross', 'unitVec', 'polarVec', 'proj', 'comps', 'Vector', 'UnitVector'])

export function inferKind(node: MathNode, kindOf: (name: string) => ValueKind | undefined): ValueKind {
  const n = node as MathNode & Record<string, unknown>
  const geo = (k: ValueKind) => k === 'point' || k === 'vector'
  // The kind of a product: two vectors (or points) make a dot product, which is a number, and a
  // number scales whichever is geometric. `*` and · are the same product (preprocess writes · as
  // dot(a, b), which multiplies numbers and scales a vector), so both take their kind from here.
  const productKind = (ka: ValueKind, kb: ValueKind): ValueKind => {
    if (geo(ka) && geo(kb)) return 'number' // dot product
    if (geo(ka)) return ka
    if (geo(kb)) return kb
    return 'number'
  }
  switch (node.type) {
    case 'ConstantNode':
      return 'number'
    case 'SymbolNode': {
      const name = n.name as string
      if (name === 'i' || name === 'j' || name === 'k') return kindOf(name) ?? 'vector'
      return kindOf(name) ?? 'number'
    }
    case 'ParenthesisNode':
      return inferKind(n.content as MathNode, kindOf)
    case 'ArrayNode':
      return 'vector'
    case 'FunctionNode': {
      const fname = ((n.fn as { name?: string })?.name ?? '') as string
      if (POINT_FNS.has(fname)) return 'point'
      if (VECTOR_FNS.has(fname)) return 'vector'
      // 2·A is dot(2, A): a scaled vector, so a vector — it was a number, and "C = 2·A" was refused.
      if (fname === 'dot') {
        const args = n.args as MathNode[]
        if (args.length === 2) return productKind(inferKind(args[0], kindOf), inferKind(args[1], kindOf))
      }
      return 'number'
    }
    case 'OperatorNode': {
      const args = n.args as MathNode[]
      const fn = n.fn as string
      if (args.length === 1) return inferKind(args[0], kindOf)
      const [ka, kb] = [inferKind(args[0], kindOf), inferKind(args[1], kindOf)]
      if (fn === 'add') {
        if (ka === 'point' || kb === 'point') return 'point'
        if (ka === 'vector' || kb === 'vector') return 'vector'
        return 'number'
      }
      if (fn === 'subtract') {
        if (ka === 'point' && kb === 'point') return 'vector'
        if (ka === 'point') return 'point'
        if (geo(ka) || geo(kb)) return 'vector'
        return 'number'
      }
      if (fn === 'multiply') return productKind(ka, kb)
      if (fn === 'divide') return geo(ka) ? ka : 'number'
      return 'number'
    }
    default:
      return 'unknown'
  }
}

/** Free symbol names used in an expression (not function names). */
export function symbolsOf(node: MathNode): string[] {
  const names = new Set<string>()
  node.traverse((child, path, parent) => {
    if (child.type === 'SymbolNode') {
      const isFnName = parent?.type === 'FunctionNode' && path === 'fn'
      if (!isFnName) names.add((child as unknown as { name: string }).name)
    }
  })
  return [...names]
}

// ---------------------------------------------------------------------------
// Fast scalar compilation for graphs
// ---------------------------------------------------------------------------

const JS_FUNCS: Record<string, string> = {
  sin: 'Math.sin', cos: 'Math.cos', tan: 'Math.tan', asin: 'Math.asin', acos: 'Math.acos', atan: 'Math.atan',
  atan2: 'Math.atan2', sinh: 'Math.sinh', cosh: 'Math.cosh', tanh: 'Math.tanh', asinh: 'Math.asinh', acosh: 'Math.acosh',
  atanh: 'Math.atanh', sqrt: 'Math.sqrt', cbrt: 'Math.cbrt', abs: 'Math.abs', exp: 'Math.exp', log: 'F.log',
  ln: 'Math.log', log10: 'Math.log10', log2: 'Math.log2', floor: 'Math.floor', ceil: 'Math.ceil', round: 'Math.round',
  sign: 'Math.sign', min: 'Math.min', max: 'Math.max', pow: 'Math.pow', hypot: 'Math.hypot', mag: 'Math.abs',
  sec: 'F.sec', csc: 'F.csc', cot: 'F.cot', nthRoot: 'F.nthRoot', mod: 'F.mod', fix: 'Math.trunc', factorial: 'F.fact',
  gamma: 'F.gamma', sinc: 'F.sinc', heaviside: 'F.step', step: 'F.step', random: 'Math.random', mean: 'F.mean'
}

const F = {
  log: (a: number, b?: number) => (b === undefined ? Math.log10(a) : Math.log(b) / Math.log(a)),
  sec: (x: number) => 1 / Math.cos(x),
  csc: (x: number) => 1 / Math.sin(x),
  cot: (x: number) => 1 / Math.tan(x),
  // n % 2 is −1 for a negative odd n in JavaScript, so compare the size.
  nthRoot: (x: number, n: number) => (x < 0 && Math.abs(n % 2) === 1 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n)),
  mod: (a: number, b: number) => ((a % b) + b) % b,
  fact: (n: number) => math.gamma(n + 1),
  gamma: (n: number) => math.gamma(n),
  sinc: (x: number) => (Math.abs(x) < 1e-12 ? 1 : Math.sin(x) / x),
  step: (x: number) => (x < 0 ? 0 : 1),
  mean: (...a: number[]) => a.reduce((s, v) => s + v, 0) / a.length
}

const OPS: Record<string, string> = {
  add: '+', subtract: '-', multiply: '*', divide: '/', mod: '%', smaller: '<', larger: '>',
  smallerEq: '<=', largerEq: '>=', equal: '===', unequal: '!==', and: '&&', or: '||'
}

export type ScalarFn = (vars: Record<string, number>) => number

/**
 * Compiles an expression over variables (e.g. x, y, t) into a native JS function.
 * Other symbols are read from `scope` at call time so sliders update live.
 * Trig uses radians (graph convention).
 */
export function compileScalar(expr: string, varNames: string[], scope: () => Record<string, unknown>): ScalarFn {
  const node = math.parse(preprocess(expr))
  const vars = new Set(varNames)
  const gen = (nd: MathNode): string => {
    const n = nd as MathNode & Record<string, unknown>
    switch (nd.type) {
      case 'ConstantNode':
        return `(${Number(n.value)})`
      case 'SymbolNode': {
        const name = n.name as string
        if (vars.has(name)) return `v[${JSON.stringify(name)}]`
        if (name === 'pi') return '(Math.PI)'
        if (name === 'e') return '(Math.E)'
        if (name === 'tau') return '(2*Math.PI)'
        if (name === 'Infinity') return 'Infinity'
        return `N(s(), ${JSON.stringify(name)})`
      }
      case 'ParenthesisNode':
        return `(${gen(n.content as MathNode)})`
      case 'OperatorNode': {
        const args = n.args as MathNode[]
        const fn = n.fn as string
        if (fn === 'unaryMinus') return `(-${gen(args[0])})`
        if (fn === 'unaryPlus') return gen(args[0])
        if (fn === 'pow') return `Math.pow(${gen(args[0])}, ${gen(args[1])})`
        if (fn === 'factorial') return `F.fact(${gen(args[0])})`
        if (fn === 'not') return `(!${gen(args[0])} ? 1 : 0)`
        const op = OPS[fn]
        if (!op) throw new Error(`unsupported operator ${fn}`)
        return `(${gen(args[0])} ${op} ${gen(args[1])})`
      }
      case 'FunctionNode': {
        const fname = (n.fn as { name: string }).name
        const js = JS_FUNCS[fname]
        if (!js) throw new Error(`unsupported function ${fname}`)
        return `${js}(${(n.args as MathNode[]).map(gen).join(', ')})`
      }
      case 'ConditionalNode':
        return `(${gen(n.condition as MathNode)} ? ${gen(n.trueExpr as MathNode)} : ${gen(n.falseExpr as MathNode)})`
      default:
        throw new Error(`unsupported syntax ${nd.type}`)
    }
  }
  const N = (sc: Record<string, unknown>, name: string): number => {
    const val = sc[name]
    if (typeof val === 'number') return val
    return NaN
  }
  try {
    const body = `return (${gen(node)});`
    const f = new Function('v', 's', 'N', 'F', body) as (v: Record<string, number>, s: () => Record<string, unknown>, N: unknown, F: unknown) => number
    return (v) => Number(f(v, scope, N, F))
  } catch {
    // Fallback: slower mathjs evaluation with radians forced.
    const compiled = node.compile()
    return (v) => {
      const prev = angleMode
      angleMode = 'rad'
      try {
        return Number(compiled.evaluate({ ...scope(), ...v }))
      } catch {
        return NaN
      } finally {
        angleMode = prev
      }
    }
  }
}

/**
 * Splits `a, b, f(c, d)` into its arguments, ignoring commas inside brackets.
 * The command bar and the calculator share it so both read arguments the same way.
 */
export function splitArgs(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++
    if (ch === ')' || ch === ']') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

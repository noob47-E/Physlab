// Trigonometric equations whose value is not a table value (TRIGGEN).
//
// trigRoots.ts writes roots exactly, in degrees or as multiples of π, for the standard values only (0, ±1/2, ±√2/2, ±√3/2, ±1,
// and the tangents of those). Any other value, such as 2/3 in 3 sin x = 2, has its roots written with the inverse function:
// x = sin⁻¹(2/3) and its mirror image 180° − sin⁻¹(2/3). That is exact, and beside it the decimal the student can use, the
// value rounded to the displayed place (2 places in degrees, 4 in radians).
//
// The proof, each part checked here and never taken from the method:
// - The principal angle θ0 = fn⁻¹(c) solves the equation: fn(θ0) = c to RESIDUAL (floating-point error is about 1e-16).
// - The families are every root. For |c| < 1 a sine (and a cosine) takes the value c exactly twice in a turn: sine is strictly
//   increasing on [−90°, 90°] and strictly decreasing on [90°, 270°], and each piece runs from −1 to 1 (or back), so it crosses
//   c exactly once. The two families are those two crossings. Cosine is the same on [0°, 180°] and [180°, 360°]. Tangent is
//   strictly increasing on (−90°, 90°) and so takes c once in each 180° turn. So |c| < 1 is tested exactly for sine and cosine.
// - Each displayed decimal is the rounding of its member, and the list is exactly the members in the range (degrees, as
//   trigRoots.ts keeps every angle internally). A member that sits within EDGE of a range end, or whose last digit is not
//   decided by the number (a tie), is not shown: the answer is declined, never guessed.
//
// Only sin x, cos x or tan x with a coefficient of 1 on x is read here. Anything else is declined by the method.

import { rat, rNum, rTex, type Rat } from '../pure/rat'
import type { EquationOp, TrigInverseSpec, ValidationVerdict } from './types'
import type { AngleUnit, TrigFn, TrigRange } from './trigRoots'

/** How close sin, cos or tan of the principal angle must come to the value. Floating-point error is about 1e-16. */
const RESIDUAL = 1e-9
/** Two angles closer than this (in the scale of the number) are one angle, and an angle this close to a range end is not decided. */
const EDGE = 1e-7
/** Decimal places of a displayed angle: hundredths of a degree, and ten-thousandths of a radian. */
const PLACES: Record<AngleUnit, number> = { deg: 2, rad: 4 }
/** A full turn and a half turn, in degrees. Every angle in this file is in degrees; only the written text and decimals change unit. */
const TURN = 360
const HALF = 180

/** One family x = a + p·k of the general solution, in degrees, with the text it is written with in the unit. */
interface InverseFamily {
  a: number
  p: number
  aTex: string
  pTex: string
}

/** One root in the range: its value in degrees, and the decimal it is shown as. */
interface InverseMember {
  value: number
  text: string
}

/** The move kinds this file checks (the two EquationOp kinds of a trig equation whose value is not a table value). */
type InverseMove = Extract<EquationOp, { kind: 'trig-inverse' | 'trig-inverse-general' }>

const compact = (text: string): string => text.replace(/\s+/g, '')

/**
 * The exact rational a value text reads, when it is written the way rTex writes one: 2, -2, \frac{2}{3}, -\frac{2}{3}. Any other
 * spelling (an unreduced fraction, a decimal) is refused, so a value is never read in two different ways.
 */
function exactValueOf(text: string): Rat | null {
  const s = compact(text)
  const m = /^(-?)(?:(\d+)|\\frac\{(\d+)\}\{(\d+)\})$/.exec(s)
  if (!m) return null
  const whole = m[2] !== undefined
  const n = BigInt(whole ? m[2] : m[3])
  const d = whole ? 1n : BigInt(m[4])
  if (d === 0n) return null
  const r = rat(m[1] === '-' ? -n : n, d)
  return rTex(r) === s ? r : null
}

/** Whether −1 < c < 1 exactly: the one range where a sine or a cosine takes the value c (a tangent takes every value). */
export function inOpenUnit(c: Rat): boolean {
  const size = c.n < 0n ? -c.n : c.n
  return size < c.d
}

/** The principal angle fn⁻¹(c) in degrees: within (−90°, 90°) for sine and tangent, within [0°, 180°] for cosine. Null when c has none. */
export function principalDeg(fn: TrigFn, c: Rat): number | null {
  if (fn !== 'tan' && !inOpenUnit(c)) return null
  const x = rNum(c)
  const radians = fn === 'sin' ? Math.asin(x) : fn === 'cos' ? Math.acos(x) : Math.atan(x)
  return (radians * 180) / Math.PI
}

/** The inverse function written exactly, as a student writes it: \sin^{-1}\left(\frac{2}{3}\right). */
export function inverseTex(fn: TrigFn, c: Rat): string {
  return `\\${fn}^{-1}\\left(${rTex(c)}\\right)`
}

/** The constants of the general solution in the unit: a full turn and a half turn. */
function constantsOf(unit: AngleUnit): { turn: string; half: string } {
  return unit === 'deg' ? { turn: '360^{\\circ}', half: '180^{\\circ}' } : { turn: '2\\pi', half: '\\pi' }
}

/**
 * The families of the general solution of fn(x) = c: sine and cosine have two (the principal angle, and its mirror image in the
 * same turn), tangent has one. Null when c has no principal angle.
 */
function inverseFamilies(fn: TrigFn, c: Rat, unit: AngleUnit): InverseFamily[] | null {
  const theta = principalDeg(fn, c)
  if (theta === null) return null
  const inv = inverseTex(fn, c)
  const k = constantsOf(unit)
  if (fn === 'tan') return [{ a: theta, p: HALF, aTex: inv, pTex: k.half }]
  // A sine's mirror image is 180° − θ0; a cosine's is 360° − θ0. Both lie in the other half of the turn, so the two are never equal.
  const mirror = fn === 'sin' ? HALF : TURN
  const mirrorTex = fn === 'sin' ? k.half : k.turn
  return [
    { a: theta, p: TURN, aTex: inv, pTex: k.turn },
    { a: mirror - theta, p: TURN, aTex: `${mirrorTex} - ${inv}`, pTex: k.turn }
  ]
}

/**
 * The general solution as the working writes it: "x = \sin^{-1}\left(\frac{2}{3}\right) + 360^{\circ}k or x = 180^{\circ} - ...".
 * A π at the end of the period ends in a letter, so a space keeps "\pi k" from reading as one command.
 */
export function generalTextOf(fn: TrigFn, c: Rat, unit: AngleUnit, v: string): string | null {
  const fams = inverseFamilies(fn, c, unit)
  if (!fams) return null
  return fams.map((f) => `${v} = ${f.aTex} + ${f.pTex}${/[A-Za-z]$/.test(f.pTex) ? ' ' : ''}k`).join(' \\text{ or } ')
}

/**
 * An angle in degrees written to the displayed places in the unit. Null when the number does not decide its last digit (it sits
 * half-way between two displayed values), so no decimal is shown that a different reading of the same number would not give.
 */
export function decimalOf(deg: number, unit: AngleUnit): string | null {
  const x = unit === 'deg' ? deg : (deg * Math.PI) / 180
  const dp = PLACES[unit]
  const scaled = Math.abs(x) * 10 ** dp
  const frac = scaled - Math.floor(scaled)
  if (Math.abs(frac - 0.5) < EDGE) return null
  const n = Math.round(scaled)
  const digits = String(n).padStart(dp + 1, '0')
  const body = `${digits.slice(0, -dp)}.${digits.slice(-dp)}`
  return x < 0 && n !== 0 ? `-${body}` : body
}

/**
 * How a displayed decimal relates to its exact root: the exact root is within tol of it (half a unit of its last place), and the
 * same root comes back every period (360° or 180° for a tangent, in the unit). The working carries this with each answer, so the
 * card can match its own roots to these decimals and no others.
 */
export function roundingOf(fn: TrigFn, unit: AngleUnit): { tol: number; period: number } {
  const periodDeg = fn === 'tan' ? HALF : TURN
  return unit === 'deg'
    ? { tol: 0.5 * 10 ** -PLACES.deg, period: periodDeg }
    : { tol: 0.5 * 10 ** -PLACES.rad, period: (periodDeg * Math.PI) / 180 }
}

/**
 * The roots in the range, each shown as its decimal, in ascending order. Null when a root sits within EDGE of a range end, two
 * roots are not apart, or a decimal is not decided; the caller then declines the working.
 */
export function inverseMembers(fn: TrigFn, c: Rat, unit: AngleUnit, range: TrigRange): InverseMember[] | null {
  const fams = inverseFamilies(fn, c, unit)
  if (!fams) return null
  const values: number[] = []
  for (const f of fams) {
    const kLo = Math.floor((range.min - f.a) / f.p) - 1
    const kHi = Math.ceil((range.max - f.a) / f.p) + 1
    for (let k = kLo; k <= kHi; k++) {
      const t = f.a + f.p * k
      if (Math.abs(t - range.min) < EDGE || Math.abs(t - range.max) < EDGE) return null
      const inside = t >= range.min && (range.inclusive ? t <= range.max : t < range.max)
      if (inside) values.push(t)
    }
  }
  values.sort((x, y) => x - y)
  for (let i = 1; i < values.length; i++) if (values[i] - values[i - 1] < EDGE) return null
  const members: InverseMember[] = []
  for (const t of values) {
    const text = decimalOf(t, unit)
    if (text === null) return null
    members.push({ value: t, text })
  }
  return members
}

/** sin, cos or tan of an angle in degrees, minus the value: zero at a root. */
function residualOf(fn: TrigFn, c: Rat, deg: number): number {
  const r = (deg * Math.PI) / 180
  const f = fn === 'sin' ? Math.sin(r) : fn === 'cos' ? Math.cos(r) : Math.tan(r)
  return f - rNum(c)
}

/** The canonical equation of a value: \sin(x) = \frac{2}{3}, the form the working writes it in. */
function equationOf(fn: TrigFn, c: Rat, v: string): string {
  return `\\${fn}(${v}) = ${rTex(c)}`
}

/**
 * Whether an equation is fn(v) = c: its left side is fn(v), and its right side has the value c by the exact polynomial checker
 * (sameValue). The right side may be written another way for the same value (2/3 for \frac{2}{3}, ((2)/(3)) as the typed line
 * gives it), so the equation before a move is judged by its value and not by its spelling.
 */
function statesValue(text: string, fn: TrigFn, v: string, c: Rat, sameValue: (typed: string, canonical: string) => boolean): boolean {
  const parts = text.split('=')
  if (parts.length !== 2 || compact(parts[0]) !== compact(`\\${fn}(${v})`)) return false
  return sameValue(parts[1], rTex(c))
}

/**
 * The checked move of a trig equation whose value is not a table value. 'trig-inverse' names the principal angle: its exact text
 * and its decimal are rebuilt from the equation, and fn(θ0) = c is verified. 'trig-inverse-general' writes the general solution:
 * its text is rebuilt, and every family member solves the equation at k = 0 and k = ±1. Anything not exact is refused.
 */
export function checkTrigInverseMove(
  before: string,
  after: string,
  op: InverseMove,
  v: string,
  sameValue: (typed: string, canonical: string) => boolean
): ValidationVerdict {
  const c = exactValueOf(op.c)
  if (c === null || (op.fn !== 'tan' && !inOpenUnit(c))) return 'invalid'
  if (op.kind === 'trig-inverse') {
    // The equation before may be written another way for the same value; the after is the canonical form the working shows.
    if (!statesValue(before, op.fn, v, c, sameValue)) return 'invalid'
    if (compact(after) !== compact(equationOf(op.fn, c, v))) return 'invalid'
    if (compact(op.angle) !== compact(inverseTex(op.fn, c))) return 'invalid'
    const theta = principalDeg(op.fn, c)
    if (theta === null || !(Math.abs(residualOf(op.fn, c, theta)) <= RESIDUAL)) return 'invalid'
    const shown = decimalOf(theta, op.unit)
    if (shown === null) return 'unknown'
    return shown === op.value ? 'valid' : 'invalid'
  }
  if (compact(before) !== compact(equationOf(op.fn, c, v))) return 'invalid'
  const general = generalTextOf(op.fn, c, op.unit, v)
  if (general === null || compact(after) !== compact(general)) return 'invalid'
  const fams = inverseFamilies(op.fn, c, op.unit)
  if (!fams) return 'invalid'
  // Every family member solves the equation at its own value and its neighbours, so the families are roots. That they are every root
  // is the monotone count in the header; the families are exactly the two crossings (or one for a tangent).
  for (const f of fams) {
    for (const k of [0, 1, -1]) {
      if (!(Math.abs(residualOf(op.fn, c, f.a + f.p * k)) <= RESIDUAL)) return 'invalid'
    }
  }
  return 'valid'
}

/** A value a solution list gives, as text (a string, or {value} or {tex}). */
function textOf(s: unknown): string {
  if (typeof s === 'string') return s.trim()
  if (s && typeof s === 'object' && 'value' in s) return String((s as { value: unknown }).value).trim()
  if (s && typeof s === 'object' && 'tex' in s) return String((s as { tex: unknown }).tex).trim()
  return String(s).trim()
}

/**
 * The solution set of a trig equation whose value is not a table value: the general solution (the before) must be the one rebuilt
 * from the spec, the list must be exactly the members in the range as their decimals, and the displayed after must be those in order.
 */
export function checkTrigInverseSolutionSet(
  before: string,
  solutions: unknown[],
  after: string,
  v: string,
  range: TrigRange | undefined,
  spec: TrigInverseSpec
): ValidationVerdict {
  if (range === undefined || !Number.isInteger(range.min) || !Number.isInteger(range.max) || solutions.length === 0) return 'invalid'
  const c = exactValueOf(spec.c)
  if (c === null || (spec.fn !== 'tan' && !inOpenUnit(c))) return 'invalid'
  const general = generalTextOf(spec.fn, c, spec.unit, v)
  if (general === null || compact(before) !== compact(general)) return 'invalid'
  const members = inverseMembers(spec.fn, c, spec.unit, range)
  if (members === null) return 'unknown'
  if (members.length !== solutions.length) return 'invalid'
  for (let i = 0; i < members.length; i++) {
    if (textOf(solutions[i]) !== members[i].text) return 'invalid'
  }
  const shown = members.map((m) => `${v} = ${m.text}`).join(' \\text{ or } ')
  return compact(after) === compact(shown) ? 'valid' : 'invalid'
}

/** A trig spec read from a step's data, or null when it is not one. */
export function specOf(value: unknown): TrigInverseSpec | null {
  if (!value || typeof value !== 'object') return null
  const o = value as Record<string, unknown>
  if (o.fn !== 'sin' && o.fn !== 'cos' && o.fn !== 'tan') return null
  if (typeof o.c !== 'string') return null
  if (o.unit !== 'deg' && o.unit !== 'rad') return null
  return { fn: o.fn, c: o.c, unit: o.unit }
}

// Reading what a student typed for the answer kinds of format 2: a vector, a set of roots, one
// matrix entry, a number with its stated uncertainty. Each reader either gives the numbers or
// ONE plain sentence saying what it could not read — never a throw, never programming syntax.
// Headless: no React, no store, no DOM.

import { inDegrees, math, preprocess } from '../math/expr'
import type { UnitId } from './pqjson'
import { convertQuantity, unitFromTail } from './units'

export type Read<T> = T | { error: string }

export const isReadError = (r: unknown): r is { error: string } =>
  typeof r === 'object' && r !== null && !Array.isArray(r) && typeof (r as { error?: unknown }).error === 'string'

/**
 * One number from a short typed expression ("8.66", "5*sqrt(2)", "3/5", "−0.2"), in degrees like
 * every practice answer, or null. Only a real number counts: mathjs reads "3i" as a complex
 * number and "2 m" as a quantity, neither of which is what a student typing a vector component or
 * a root means, and both fail the `typeof` test below.
 */
export function evalNumber(text: string): number | null {
  const t = text.trim()
  if (t === '') return null
  try {
    const v = inDegrees(() => math.evaluate(preprocess(t)))
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

/** Unicode minus and the other dashes a keyboard or a paste gives, as the hyphen the reader works with. */
const dashes = (s: string): string => s.replace(/[−–—]/g, '-')

/**
 * Splits at `seps` only outside brackets, so the comma in "sqrt(2), 3" separates and the one in
 * "max(1, 2)" does not.
 */
function splitTop(s: string, seps: RegExp): string[] {
  const out: string[] = []
  let depth = 0
  let from = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (depth === 0) {
      seps.lastIndex = i
      const m = seps.exec(s)
      if (m && m.index === i) {
        out.push(s.slice(from, i))
        from = i + m[0].length
        i = from - 1
      }
    }
  }
  out.push(s.slice(from))
  return out
}

// ---------------------------------------------------------------------------
// A vector
// ---------------------------------------------------------------------------

const VECTOR_HELP = 'Type the vector as 3i + 4j, as <3, 4>, or as a size and an angle like 5∠53.13°.'

/**
 * Reads a vector: `3i + 4j (+ 2k)`, `<3, 4>`, `(3, 4)`, `5∠53.13°` or `5 at 53.13°`, with a unit
 * after it if the student gives one ("<3, 4> N", "10 N ∠ 30°"). An angle is from the positive x
 * axis, anticlockwise, in degrees unless "rad" follows it.
 */
export function readVector(text: string): Read<{ v: number[]; unit: UnitId | null }> {
  // Hatted unit vectors as a paste brings them: î and ĵ are single letters, k̂ is k + a combining hat.
  const t = dashes(text.trim())
    .replace(/[⟨〈]/g, '<')
    .replace(/[⟩〉]/g, '>')
    .replace(/î/g, 'i')
    .replace(/ĵ/g, 'j')
    .replace(/([ijk])̂/g, '$1')
  if (t === '') return { error: VECTOR_HELP }
  return readPolar(t) ?? readBracketed(t) ?? readIJK(t) ?? { error: VECTOR_HELP }
}

/** "5∠53.13°", "5 at 53.13", "10 N ∠ 30°", "5∠0.93 rad", or null when the text is not in this form. */
function readPolar(t: string): Read<{ v: number[]; unit: UnitId | null }> | null {
  const parts = t.split(/∠|\bat\b/)
  if (parts.length !== 2) return null
  let [left, right] = parts.map((s) => s.trim())
  // The vector's unit may sit after the size ("10 N ∠ 30°") or after the angle ("10∠30° N").
  let unit: UnitId | null = null
  const l = unitFromTail(left)
  if (l.unit !== null) {
    unit = l.unit
    left = l.value
  }
  let radians = false
  const r = unitFromTail(right)
  if (r.unit !== null && r.unit !== '°' && r.unit !== 'rad') {
    if (unit !== null) return { error: 'Give the unit once, after the size.' }
    unit = r.unit
    right = r.value
  }
  const a = unitFromTail(right)
  if (a.unit === '°' || a.unit === 'rad') {
    radians = a.unit === 'rad'
    right = a.value
  }
  right = right.replace(/°\s*$/, '').trim()
  const size = evalNumber(left)
  const angle = evalNumber(right)
  if (size === null) return { error: `PhysLab could not read the size "${left}". ${VECTOR_HELP}` }
  if (angle === null) return { error: `PhysLab could not read the angle "${right}". ${VECTOR_HELP}` }
  const th = radians ? angle : (angle * Math.PI) / 180
  return { v: [size * Math.cos(th), size * Math.sin(th)], unit }
}

/** "<3, 4>", "(3, 4, 2)", "[3, 4]" or a bare "3, 4", each with an optional unit after it. */
function readBracketed(t: string): Read<{ v: number[]; unit: UnitId | null }> | null {
  const tail = unitFromTail(t)
  const body = tail.value
  const m = /^[<([]\s*(.*?)\s*[>)\]]$/.exec(body)
  const inner = m ? m[1] : body
  if (!m && !inner.includes(',')) return null
  const items = splitTop(inner, /,/y)
  // One item is not this form at all ("(3/2)i + (1)j" starts and ends with brackets too).
  if (items.length < 2) return null
  if (items.length > 3) return { error: 'A vector has two or three components.' }
  const v: number[] = []
  for (const s of items) {
    const x = evalNumber(s)
    if (x === null) return { error: `PhysLab could not read the component "${s.trim()}". ${VECTOR_HELP}` }
    v.push(x)
  }
  return { v, unit: tail.unit }
}

/**
 * What is inside one pair of round brackets round the whole of `s` when that holds an i, j or k
 * term — "(8.66i + 5j)" → "8.66i + 5j" — else null. "(3/2)i + (1)j" starts and ends with a bracket
 * too, but those are two pairs, so it is left alone.
 */
function unwrapIJK(s: string): string | null {
  const t = s.trim()
  if (!t.startsWith('(') || !t.endsWith(')')) return null
  let depth = 0
  for (let i = 0; i < t.length - 1; i++) {
    if (t[i] === '(') depth++
    else if (t[i] === ')') depth--
    if (depth === 0) return null
  }
  const inner = t.slice(1, -1).trim()
  return /[ijk]$/.test(inner) ? inner : null
}

/**
 * "3i + 4j", "4j − 3i", "i − 2k", "(3/2)i + 2.5j + 0k" with an optional unit after it — and in
 * brackets before the unit, "(8.66i + 5j) N", as textbooks and the revealed answer write it.
 */
function readIJK(t: string): Read<{ v: number[]; unit: UnitId | null }> | null {
  if (!/[ijk]/.test(t)) return null
  // A unit counts only when what is left still ends in i, j or k (or is such a sum in brackets):
  // "3i + 4j kg·m/s" has one, and the k of "2k" is never mistaken for the start of one.
  const tail = unitFromTail(t)
  const withUnit = tail.unit !== null && (/[ijk]$/.test(tail.value) || unwrapIJK(tail.value) !== null)
  const unit: UnitId | null = withUnit ? tail.unit : null
  const whole = withUnit ? tail.value : t
  const body = unwrapIJK(whole) ?? whole
  // Split before every + or − that is not inside brackets and not an exponent's sign (1e-3).
  const terms: string[] = []
  let depth = 0
  let cur = ''
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (c === '(') depth++
    if (c === ')') depth--
    if ((c === '+' || c === '-') && depth === 0 && cur.trim() !== '' && !/\de$/i.test(cur.trim())) {
      terms.push(cur)
      cur = ''
    }
    cur += c
  }
  terms.push(cur)
  const v = [0, 0, 0]
  const seen = [false, false, false]
  for (const raw of terms) {
    const term = raw.replace(/\s+/g, '')
    const m = /^([+-]?)(.*?)\*?([ijk])$/.exec(term)
    if (!m) return { error: `PhysLab could not read "${raw.trim()}". Each part needs its i, j or k, like 3i or −4j.` }
    const [, sign, coef, axis] = m
    const size = coef === '' ? 1 : evalNumber(coef)
    if (size === null) return { error: `PhysLab could not read "${raw.trim()}". ${VECTOR_HELP}` }
    const k = 'ijk'.indexOf(axis)
    v[k] += sign === '-' ? -size : size
    seen[k] = true
  }
  return { v: seen[2] ? v : v.slice(0, 2), unit }
}

// ---------------------------------------------------------------------------
// A set of numbers (roots)
// ---------------------------------------------------------------------------

const SET_HELP = 'Type the values with commas between them, like 2, −3.'
const NO_ROOTS = /^(none|no(\s+real)?\s+(roots?|solutions?)|∅|\{\s*\})$/i

/**
 * Reads a set of values: "2, -3", "x = 2 or x = −3", "−3; 2", "x = ±2", "x = −1 ± √2", "2 and −3", or "none"
 * for no real roots. With `unit` given, a unit after a value ("1.5 s, 2 s") is converted to it
 * and a value in some other kind of unit is refused in words.
 */
export function readSet(text: string, unit?: UnitId): Read<number[]> {
  const t = dashes(text.trim())
  if (t === '') return { error: SET_HELP }
  if (NO_ROOTS.test(t)) return []
  const body = t.replace(/^\{\s*(.*?)\s*\}$/, '$1')
  const items = splitTop(body, /\s*(?:,|;|\bor\b|\band\b)\s*/iy).map((s) => s.trim())
  const out: number[] = []
  for (const item of items) {
    if (item === '') continue
    // "x = 2": the name in front is the student's, not part of the value.
    let s = item.replace(/^[A-Za-z][A-Za-z0-9_]*\s*=\s*/, '').trim()
    let both = false
    const pm = /^(±|\+\s*\/?\s*-)\s*/.exec(s)
    if (pm) {
      both = true
      s = s.slice(pm[0].length)
    }
    // "x = −1 ± √2", the quadratic formula's form: two roots, a + b and a − b.
    const halves = both ? [s] : splitTop(s.replace(/\+\/?-/g, '±'), /±/y)
    if (halves.length > 2) return { error: `Type one ± in each value: "${item}" has more. ${SET_HELP}` }
    const read: number[] = []
    for (const half of halves) {
      const r = readSetValue(half, item, unit)
      if (typeof r !== 'number') return r
      read.push(r)
    }
    if (read.length === 2) {
      out.push(read[0] + read[1])
      if (read[1] !== 0) out.push(read[0] - read[1])
      continue
    }
    const value = read[0]
    out.push(value)
    if (both && value !== 0) out.push(-value)
  }
  if (out.length === 0) return { error: SET_HELP }
  return out
}

/** One value of a set, with a unit after it converted to the part's `unit`; `item` is what the student typed, for the sentence. */
function readSetValue(s: string, item: string, unit: UnitId | undefined): number | { error: string } {
  let value: number | null
  const tail = unitFromTail(s)
  if (tail.unit !== null && unit !== undefined && unit !== 'none') {
    const raw = evalNumber(tail.value)
    value = raw === null ? null : tail.unit === unit ? raw : convertQuantity(raw, tail.unit, unit)
    if (raw !== null && value === null) return { error: `"${item}" is not in a unit this answer can be given in.` }
  } else {
    value = evalNumber(s)
  }
  return value === null ? { error: `PhysLab could not read "${item}" as a number. ${SET_HELP}` } : value
}

// ---------------------------------------------------------------------------
// One matrix entry
// ---------------------------------------------------------------------------

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i
const FRACTION = /^([+-]?\d+)\s*\/\s*([+-]?\d+)$/

/**
 * One entry of a matrix answer: a plain number ("0.6", "−0.2", "1.5e-3"), or with
 * `allowFractions` a fraction of whole numbers ("3/5", "−1/5"). Anything else — an expression, a
 * fraction where decimals are asked for, a division by zero — is null.
 */
export function readMatrixCell(text: string, allowFractions: boolean): number | null {
  const t = dashes(text.trim()).replace(/\s+/g, ' ')
  if (NUMBER.test(t)) return Number(t)
  const f = FRACTION.exec(t)
  if (f && allowFractions) {
    const d = Number(f[2])
    return d === 0 ? null : Number(f[1]) / d
  }
  return null
}

// ---------------------------------------------------------------------------
// A number with its stated uncertainty
// ---------------------------------------------------------------------------

/**
 * Reads a measured value with its standard uncertainty: "0.5591 ± 0.0001", "0.5591 +- 0.0001",
 * "0.5591 +/- 0.0001", "(0.5591 ± 0.0001) J", or the concise form "0.5591(1)", where the digits in
 * brackets are the uncertainty in the last digits shown (1.23(45) is 1.23 ± 0.45). A plain number
 * with no uncertainty is an error whose sentence asks for one, in the student's own digits.
 */
export function readStated(text: string): Read<{ x: number; u: number; unit: UnitId | null }> {
  let t = dashes(text.trim()).replace(/\\pm/g, '±').replace(/\+\s*\/?\s*-/g, '±')
  if (t === '') return { error: 'Type your value and its uncertainty, like 2.50 ± 0.05.' }
  const tail = unitFromTail(t)
  const unit = tail.unit
  t = tail.value.replace(/^\((.*)\)$/, '$1').trim()

  const concise = /^([+-]?)(\d*)(?:\.(\d+))?\((\d+(?:\.\d+)?)\)(?:e([+-]?\d+))?$/i.exec(t.replace(/\s+/g, ''))
  if (concise) {
    const [, sign, whole, frac = '', unc, exp] = concise
    const x = Number(`${sign}${whole || '0'}.${frac || '0'}${exp ? `e${exp}` : ''}`)
    // The bracket counts in units of the value's last digit: 0.5591(1) is ± 0.0001; a bracket with
    // its own point (12.3(1.2)) is already in the value's units.
    const scale = 10 ** (-frac.length + (exp ? Number(exp) : 0))
    const u = unc.includes('.') ? Number(unc) * 10 ** (exp ? Number(exp) : 0) : Number(unc) * scale
    return { x, u, unit }
  }

  const halves = t.split('±')
  if (halves.length === 1) {
    const x = evalNumber(t)
    if (x === null) return { error: 'PhysLab could not read that. Type your value and its uncertainty, like 2.50 ± 0.05.' }
    return { error: `Give your uncertainty too, like ${t} ± ${lastDigit(t)}.` }
  }
  if (halves.length !== 2) return { error: 'Type one ± between your value and its uncertainty.' }
  const x = evalNumber(halves[0])
  const u = evalNumber(halves[1])
  if (x === null) return { error: `PhysLab could not read the value "${halves[0].trim()}".` }
  if (u === null) return { error: `PhysLab could not read the uncertainty "${halves[1].trim()}".` }
  if (u < 0) return { error: 'An uncertainty is never negative: the ± already gives both sides.' }
  return { x, u, unit }
}

/** "1" in the last decimal place the student wrote: 0.5591 → 0.0001, 12 → 1. For the example in a sentence only. */
function lastDigit(t: string): string {
  const m = /\.(\d+)/.exec(t)
  return m ? `0.${'0'.repeat(m[1].length - 1)}1` : '1'
}

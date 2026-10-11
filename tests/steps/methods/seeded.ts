// Seeded items for the S1a method tests. Every item is built backwards from a known answer, so the
// test checks the method's answer against the item, not against the method itself.
//
// Built with exact rationals (rat.ts). Text is written the way a student types it: 3x, -x, 3x/4,
// 0.5x, 2(x + 3), x^2. Decimals only appear where the denominator divides 100, so the text is exact.

import {
  rAbs,
  rAdd,
  rIsNeg,
  rIsZero,
  rMul,
  rSqrt,
  rSub,
  rat,
  type Rat
} from '../../../src/renderer/src/math/pure/rat'

/** Deterministic pseudo-random numbers (Mulberry32), the same generator the S0 tests use. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Rng = () => number

function intIn(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1))
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]
}

/** The decimal text of a positive rational whose denominator divides 100, or null. */
function decimalText(r: Rat): string | null {
  const abs = rAbs(r)
  const scale = [1n, 10n, 100n].find((k) => k % abs.d === 0n)
  if (scale === undefined) return null
  const places = scale === 1n ? 0 : scale === 10n ? 1 : 2
  const digits = (abs.n * (scale / abs.d)).toString().padStart(places + 1, '0')
  if (places === 0) return digits
  return `${digits.slice(0, digits.length - places)}.${digits.slice(digits.length - places)}`
}

/** A constant's magnitude as typed: 3, 5/2 or 1.25. */
function constAbsText(r: Rat, rng: Rng): string {
  const abs = rAbs(r)
  if (abs.d === 1n) return abs.n.toString()
  const dec = decimalText(abs)
  if (dec !== null && rng() < 0.5) return dec
  return `${abs.n}/${abs.d}`
}

/** A coefficient's magnitude with a letter after it: x, 3x, 3x/4, 0.5x, 3x^2/2 (pass 'x^2' as the letter). */
function coefAbsText(r: Rat, letter: string, rng: Rng): string {
  const abs = rAbs(r)
  if (abs.d === 1n) return abs.n === 1n ? letter : `${abs.n}${letter}`
  const dec = decimalText(abs)
  if (dec !== null && rng() < 0.5) return `${dec}${letter}`
  return abs.n === 1n ? `${letter}/${abs.d}` : `${abs.n}${letter}/${abs.d}`
}

/** Join signed parts into one sum: "3x - 2", "-x + 1/2". */
function joinSigned(parts: { neg: boolean; text: string }[]): string {
  return parts
    .map((p, i) => (i === 0 ? (p.neg ? `-${p.text}` : p.text) : p.neg ? ` - ${p.text}` : ` + ${p.text}`))
    .join('')
}

/** A non-zero coefficient for x: integers, fractions and decimals. */
function coefficient(rng: Rng): Rat {
  return pick(rng, [
    rat(1n), rat(-1n), rat(2n), rat(3n), rat(-2n), rat(-3n), rat(4n), rat(5n), rat(-5n), rat(6n),
    rat(1n, 2n), rat(-3n, 2n), rat(2n, 3n), rat(-1n, 4n), rat(5n, 4n), rat(1n, 5n), rat(-7n, 10n), rat(3n, 10n)
  ])
}

/** A constant term: an integer, a fraction or a decimal. */
function constant(rng: Rng): Rat {
  if (rng() < 0.5) return rat(intIn(rng, -12, 12))
  return pick(rng, [rat(-7n, 2n), rat(5n, 4n), rat(-3n, 4n), rat(9n, 2n), rat(-2n, 5n), rat(7n, 3n), rat(1n, 10n)])
}

interface LinearItem {
  input: string
  v: string
  /** The one solution, built in: the equation is p·x + q = p'·x + q' with q' = q + (p − p')·x0. */
  x0: Rat
  /** True when the text has a bracket that must be expanded. */
  brackets: boolean
  /** True when some coefficient is a fraction or a decimal, so a clearing step is needed. */
  fractions: boolean
}

/** One side of an equation: p·x + q, written plainly or with the coefficient outside a bracket. */
function side(rng: Rng, v: string, p: Rat, q: Rat): { text: string; brackets: boolean } {
  if (rng() < 0.35 && !rIsZero(p)) {
    // p·x + q = k(p'·x + q') + e with p' = p/k and e = q − k·q', so the sum is exactly p·x + q.
    const k = pick(rng, [2n, 3n, -2n])
    const pInside = rMul(p, rat(1n, k))
    const qInside = constant(rng)
    const e = rSub(q, rMul(rat(k), qInside))
    const inner = joinSigned([
      { neg: rIsNeg(pInside), text: coefAbsText(rAbs(pInside), v, rng) },
      { neg: rIsNeg(qInside), text: constAbsText(rAbs(qInside), rng) }
    ])
    const tail = rIsZero(e) ? '' : ` ${rIsNeg(e) ? '-' : '+'} ${constAbsText(rAbs(e), rng)}`
    return { text: `${k < 0n ? '-' : ''}${abs(k)}(${inner})${tail}`, brackets: true }
  }
  const parts: { neg: boolean; text: string }[] = []
  if (!rIsZero(p)) parts.push({ neg: rIsNeg(p), text: coefAbsText(rAbs(p), v, rng) })
  if (!rIsZero(q)) parts.push({ neg: rIsNeg(q), text: constAbsText(rAbs(q), rng) })
  return { text: parts.length > 0 ? joinSigned(parts) : '0', brackets: false }
}

function abs(k: bigint): string {
  return (k < 0n ? -k : k).toString()
}

/** A linear equation with a known answer, built backwards from both sides. */
export function linearItem(rng: Rng): LinearItem {
  const v = pick(rng, ['x', 'y', 't'])
  const x0 = rat(intIn(rng, -9, 9), pick(rng, [1, 1, 2, 3, 4, 5]))
  const pL = coefficient(rng)
  let pR = rng() < 0.2 ? rat(0n) : coefficient(rng)
  if (pR.n === pL.n && pR.d === pL.d) pR = rat(0n)
  const qL = constant(rng)
  const qR = rAdd(qL, rMul(rSub(pL, pR), x0))
  const left = side(rng, v, pL, qL)
  const right = side(rng, v, pR, qR)
  return {
    input: `${left.text} = ${right.text}`,
    v,
    x0,
    brackets: left.brackets || right.brackets,
    fractions: [pL, qL, pR, qR].some((r) => r.d !== 1n)
  }
}

export interface QuadItem {
  input: string
  /** The distinct rational roots, smallest first. */
  roots: Rat[]
  double: boolean
  /** The factors as built: (A x + B)(C x + D). */
  factors: [bigint, bigint, bigint, bigint]
  style: 'std' | 'rearrange' | 'scaled' | 'halved'
}

/** A sum a·x² + b·x + c written with signs; zero terms are left out. */
function quadText(a: Rat, b: Rat, c: Rat, v: string, rng: Rng): string {
  const parts: { neg: boolean; text: string }[] = []
  if (!rIsZero(a)) parts.push({ neg: rIsNeg(a), text: coefAbsText(rAbs(a), `${v}^2`, rng) })
  if (!rIsZero(b)) parts.push({ neg: rIsNeg(b), text: coefAbsText(rAbs(b), v, rng) })
  if (!rIsZero(c)) parts.push({ neg: rIsNeg(c), text: constAbsText(rAbs(c), rng) })
  return parts.length > 0 ? joinSigned(parts) : '0'
}

/** A quadratic with rational roots, built from (Ax + B)(Cx + D), written in one of four layouts. */
export function rationalQuadItem(rng: Rng): QuadItem {
  const A = pick(rng, [1n, 2n, 3n, -1n, -2n, -3n])
  const C = pick(rng, [1n, 2n, 3n, 4n, -1n, -2n, -3n, -4n])
  const B = BigInt(intIn(rng, -6, 6))
  const D = BigInt(intIn(rng, -6, 6))
  const a = A * C
  const b = A * D + B * C
  const c = B * D
  const style = pick(rng, ['std', 'rearrange', 'scaled', 'halved'] as const)
  const v = 'x'
  let input: string
  if (style === 'rearrange') {
    // x² = −bx − c: the method has to bring the terms to one side.
    input = `${quadText(rat(a), rat(0n), rat(0n), v, rng)} = ${quadText(rat(0n), rat(-b), rat(-c), v, rng)}`
  } else if (style === 'scaled') {
    const k = pick(rng, [2n, 3n, -1n, -2n])
    input = `${quadText(rat(a * k), rat(b * k), rat(c * k), v, rng)} = 0`
  } else if (style === 'halved') {
    input = `${quadText(rat(a, 2n), rat(b, 2n), rat(c, 2n), v, rng)} = 0`
  } else {
    input = `${quadText(rat(a), rat(b), rat(c), v, rng)} = 0`
  }
  const r1 = rat(-B, A)
  const r2 = rat(-D, C)
  const lo = r1.n * r2.d <= r2.n * r1.d ? r1 : r2
  const hi = lo === r1 ? r2 : r1
  const double = lo.n === hi.n && lo.d === hi.d
  return { input, roots: double ? [lo] : [lo, hi], double, factors: [A, B, C, D], style }
}

/** A quadratic with a negative discriminant (no real roots). */
export function negativeDiscItem(rng: Rng): { input: string; a: bigint; b: bigint; c: bigint } {
  const a = BigInt(intIn(rng, 1, 3))
  const b = BigInt(intIn(rng, -6, 6))
  const c = (b * b) / (4n * a) + BigInt(intIn(rng, 1, 6))
  return { input: `${quadText(rat(a), rat(b), rat(c), 'x', rng)} = 0`, a, b, c }
}

/** A quadratic whose discriminant is positive but not a perfect square (irrational roots). */
export function irrationalItem(rng: Rng): { input: string; a: bigint; b: bigint; c: bigint } {
  for (;;) {
    const a = BigInt(intIn(rng, 1, 3))
    const b = BigInt(intIn(rng, -6, 6))
    const c = BigInt(intIn(rng, -8, 8))
    const disc = b * b - 4n * a * c
    if (disc > 0n && rSqrt(rat(disc)) === null) {
      return { input: `${quadText(rat(a), rat(b), rat(c), 'x', rng)} = 0`, a, b, c }
    }
  }
}

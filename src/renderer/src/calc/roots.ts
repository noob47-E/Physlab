// The roots of a polynomial as the calculator lists them, whichever screen lists them.
//
// The same equation used to come back four ways (polish item P7). For x² + 4 = 0 the x = ? key said
// "No solution I can find near 0", Equations mode listed "0 − 2i, 0 + 2i" (−2i first), the Solve job
// "2i, −2i", and the command bar's SymPy line "≈ 0 + 2i" in SymPy's own order. What every screen
// follows now, decided here and in calc/engine.ts:
//
//   ORDER  A quadratic is listed in the PhysLab Calculator's order, as the formula reads: x₁ = (−b + √Δ)/2a, then
//          x₂ = (−b − √Δ)/2a, real or complex, taken literally — so with a < 0 the "+√" root can be
//          the smaller real root, or the −bi root (−x² − 4 = 0 lists −2i, then 2i). The Solve job
//          (math/pure/complex.ts) already reads its pair off the formula this way. A cubic or
//          higher has no ± formula: the real roots smallest first, then each conjugate pair — the
//          pairs by real part, then by the size of the imaginary part — with the +i root first.
//          A repeated root is listed once, on every screen.
//   FORM   One root is written by formatComplex (engine.ts): 2i, −i, −2 + 3i.
//
// Pure functions of numbers and text, so each route can be compared with the others in a test.

import { math } from '../math/expr'
import { casioToMath, constantOf, exactForm, formatComplex, formatImaginary, polyRoots, type Cx, type ExprNode } from './engine'
import { calcNum } from './format'
import { labelText } from './labels'

export interface RootRow {
  /** What the row is called on screen: "x₁ =", "x₂ =", … or "x =" when there is one root. */
  label: string
  /** The root's exact form as TeX — real roots only (a whole number, a fraction, a surd) — or null. */
  tex: string | null
  /** The root as the calculator writes it; shown when there is no exact form. */
  text: string
}

/**
 * "x₁ =" … "x₁₀ =", every digit of the number a subscript; "x =" when there is only one root to name.
 * Written by labelText, the function that writes the Working panel's labels for Copy, so the two
 * screens spell a subscript one way.
 */
function rowLabel(i: number, count: number): string {
  return count === 1 ? 'x =' : labelText(`x_${i + 1} =`)
}

/** −0 is written 0: a root of 0 must not read "−0", and 0 === −0 would hide it from a test. */
const clean = (z: Cx): Cx => ({ re: z.re === 0 ? 0 : z.re, im: z.im === 0 ? 0 : z.im })

// ---------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------

const nearly = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))

/**
 * Items that stand for roots, in the order of a cubic or higher: real roots smallest first, then
 * each conjugate pair — the pairs by real part, then by the size of the imaginary part — with the
 * +i root first. Round-off decides nothing: two real parts that agree to nine figures are the same
 * real part, so a pair that numerics left a hair apart still sits together. Items whose value is
 * unknown (null) are returned as they came, because there is nothing to order them by.
 */
export function orderRoots<T>(items: T[], at: (item: T) => Cx | null): T[] {
  const zs = items.map(at)
  if (zs.some((z) => z === null)) return items
  return items
    .map((item, i) => ({ item, z: zs[i] as Cx }))
    .sort((p, q) => {
      const pReal = p.z.im === 0
      const qReal = q.z.im === 0
      if (pReal !== qReal) return pReal ? -1 : 1
      if (pReal || !nearly(p.z.re, q.z.re)) return p.z.re - q.z.re
      const pSize = Math.abs(p.z.im)
      const qSize = Math.abs(q.z.im)
      if (!nearly(pSize, qSize)) return pSize - qSize
      return q.z.im - p.z.im
    })
    .map((k) => k.item)
}

// ---------------------------------------------------------------------------
// Roots
// ---------------------------------------------------------------------------

/**
 * The roots of ax² + bx + c in the PhysLab Calculator's order: x₁ = (−b + √Δ)/2a first, x₂ = (−b − √Δ)/2a
 * second, taken literally. A repeated root comes back once.
 *
 * The roots are worked out from the form that never subtracts two nearly equal numbers (the root of
 * larger size from −(b ± √Δ)/2, the other as c ÷ that root), not from the formula as printed:
 * x² − 10000x + 1 would lose the last digits of its small root to cancellation, and the screen
 * shows ten figures.
 */
export function quadraticRoots(a: number, b: number, c: number): Cx[] {
  const disc = b * b - 4 * a * c
  // Round-off in b² − 4ac (0.6² against 4 × 0.1 × 0.9, off by 5×10⁻¹⁷ in 0.36) is not two roots a hair
  // apart; the floor is a few dozen times the round-off of the three products, no more, so roots
  // 10⁻⁷ apart still come out as two.
  if (Math.abs(disc) <= 1e-14 * Math.max(b * b, Math.abs(4 * a * c))) return [clean({ re: -b / (2 * a), im: 0 })]
  if (disc < 0) {
    const re = -b / (2 * a)
    const im = Math.sqrt(-disc) / (2 * a)
    return [clean({ re, im }), clean({ re, im: -im })]
  }
  const s = Math.sqrt(disc)
  // u is a·x₂ when b ≥ 0 and a·x₁ when b < 0, with no cancellation in it; the other root is c ÷ u.
  const u = b >= 0 ? -(b + s) / 2 : (-b + s) / 2
  const plus = clean({ re: b >= 0 ? c / u : u / a, im: 0 })
  const minus = clean({ re: b >= 0 ? u / a : c / u, im: 0 })
  return [plus, minus]
}

/**
 * The remainder of a ÷ b, coefficients highest power first. A coefficient that cancelled down to
 * round-off — under a billionth of the numbers it was made from — is zero, whatever the scale of the
 * polynomial: x³ − 10⁻¹² has a constant a million times smaller than its other terms and is not a
 * repeated root, while 10⁻¹⁷ left over from 0.3 − 3 × 0.1 is nothing.
 */
function remainder(a: number[], b: number[]): number[] {
  const r = [...a]
  const made = a.map(Math.abs)
  const dropZeros = (): void => {
    while (r.length && Math.abs(r[0]) <= 1e-10 * made[0]) {
      r.shift()
      made.shift()
    }
  }
  dropZeros()
  while (r.length >= b.length) {
    const f = r[0] / b[0]
    for (let k = 0; k < b.length; k++) {
      made[k] = Math.max(made[k], Math.abs(r[k]), Math.abs(f * b[k]))
      r[k] -= f * b[k]
    }
    // The leading term was the one cancelled.
    r.shift()
    made.shift()
    dropZeros()
  }
  return r
}

/** The whole-number part of a ÷ b (b divides a), highest power first. */
function quotient(a: number[], b: number[]): number[] {
  const r = [...a]
  const q: number[] = []
  while (r.length >= b.length) {
    const f = r[0] / b[0]
    q.push(f)
    for (let k = 0; k < b.length; k++) r[k] -= f * b[k]
    r.shift()
  }
  return q
}

/**
 * The polynomial with each of its roots once: p ÷ gcd(p, p′), by Euclid's algorithm. Durand–Kerner,
 * which polyRoots uses, finds a repeated root only to about the square root of round-off —
 * (x − 1)² came out as 0.9999999955 and 1.0000000031 — where this is exact for the small
 * coefficients a textbook uses. Each polynomial is scaled to a largest coefficient of 1 first, only
 * to keep the numbers in range: what counts as round-off is decided inside `remainder`.
 */
function squareFree(c: number[]): number[] {
  const unit = (p: number[]): number[] => {
    const big = Math.max(...p.map(Math.abs))
    return p.map((v) => v / big)
  }
  const n = c.length - 1
  let a = unit(c)
  let b = unit(c.slice(0, n).map((v, i) => v * (n - i)))
  for (;;) {
    const r = remainder(a, b)
    if (r.length === 0) break
    // A constant left over: nothing is shared, so no root is repeated.
    if (r.length === 1) return c
    a = b
    b = unit(r)
  }
  // b is the common factor, one degree short of each repeated root's multiplicity.
  return b.length > 1 ? quotient(c, b.map((v) => v / b[0])) : c
}

/**
 * The roots of aₙxⁿ + … + a₀, coefficients [aₙ … a₀], in the order a student reads them: see the
 * top of this file. A quadratic is worked out from its formula, a cubic or higher by Durand–Kerner
 * after the repeated roots are taken out, so every root is found to full accuracy and shown once.
 */
export function polynomialRoots(coeffs: number[]): Cx[] {
  const c = [...coeffs]
  while (c.length > 1 && Math.abs(c[0]) < 1e-15) c.shift()
  const n = c.length - 1
  if (n < 1) return []
  if (n === 1) return [clean({ re: -c[1] / c[0], im: 0 })]
  if (n === 2) return quadraticRoots(c[0], c[1], c[2])
  const q = squareFree(c)
  const m = q.length - 1
  const roots = m === 1 ? [{ re: -q[1] / q[0], im: 0 }] : m === 2 ? quadraticRoots(q[0], q[1], q[2]) : polyRoots(q)
  return orderRoots(roots.map(clean), (z) => z)
}

/** The Equations mode's rows for aₙxⁿ + … + a₀ = 0, coefficients [aₙ … a₀]. */
export function polynomialRootRows(coeffs: number[]): RootRow[] {
  const roots = polynomialRoots(coeffs)
  return roots.map((r, i) => ({
    label: rowLabel(i, roots.length),
    tex: r.im === 0 ? exactForm(r.re) : null,
    text: formatComplex(r.re, r.im)
  }))
}

// ---------------------------------------------------------------------------
// x = ? on an equation that is a polynomial in x
// ---------------------------------------------------------------------------

/** A polynomial, lowest power first: p[k] is the coefficient of xᵏ. */
type Poly = number[]

/** Beyond this the product or power is not worth expanding: the line is not a school polynomial. */
const MAX_DEGREE = 12

const polyScale = (p: Poly, f: number): Poly => p.map((v) => v * f)
const polyAdd = (p: Poly, q: Poly): Poly => Array.from({ length: Math.max(p.length, q.length) }, (_, k) => (p[k] ?? 0) + (q[k] ?? 0))
function polyMul(p: Poly, q: Poly): Poly | null {
  if (p.length + q.length - 2 > MAX_DEGREE) return null
  const out = new Array<number>(p.length + q.length - 1).fill(0)
  p.forEach((a, i) => q.forEach((b, j) => (out[i + j] += a * b)))
  return out
}
function polyPow(p: Poly, k: number): Poly | null {
  let out: Poly | null = [1]
  for (let i = 0; i < k && out; i++) out = polyMul(out, p)
  return out
}

/**
 * One side of an equation as a polynomial in x, or null when it is not one. The other letters, Ans
 * and the constants count as the numbers they stand for: x² + A = 0 with A = 3 is x² + 3 = 0. Only
 * sums, differences, products, a division by a number and a whole-number power of a polynomial are
 * read, and anything else — sin(x), √x, 2ˣ, 1/x — is not a polynomial. Read from the tree rather
 * than by asking mathjs to rationalize: that expands (x + 1)²⁰ for as long as it takes, and takes
 * 1/x + 1 for x + 1.
 */
function readPolynomial(n: ExprNode, scope: Record<string, unknown>): Poly | null {
  const k = constantOf(n, scope)
  if (k !== undefined) return [k]
  if (n.type === 'SymbolNode') return n.name === 'x' ? [0, 1] : null
  if (n.type === 'ParenthesisNode') return readPolynomial(n.content as ExprNode, scope)
  if (n.type !== 'OperatorNode') return null
  const parts = (n.args as ExprNode[]).map((a) => readPolynomial(a, scope))
  if (parts.some((p) => p === null)) return null
  const [a, b] = parts as Poly[]
  switch (n.fn) {
    case 'unaryMinus':
      return polyScale(a, -1)
    case 'unaryPlus':
      return a
    case 'add':
      return polyAdd(a, b)
    case 'subtract':
      return polyAdd(a, polyScale(b, -1))
    case 'multiply':
      return polyMul(a, b)
    case 'divide':
      return b.length === 1 && b[0] !== 0 ? polyScale(a, 1 / b[0]) : null
    case 'pow':
      return b.length === 1 && Number.isInteger(b[0]) && b[0] >= 0 ? polyPow(a, b[0]) : null
    default:
      return null
  }
}

/**
 * left = right as the polynomial left − right, coefficients [aₙ … a₀] highest power first, or null
 * when the equation is not a polynomial in x. A top coefficient that is round-off beside the largest
 * (x² + 4 = x² + 1) is no coefficient at all.
 */
export function polynomialInX(left: string, right: string, scope: Record<string, unknown>): number[] | null {
  let l: Poly | null
  let r: Poly | null
  try {
    l = readPolynomial(math.parse(casioToMath(left)) as ExprNode, scope)
    r = readPolynomial(math.parse(casioToMath(right)) as ExprNode, scope)
  } catch {
    return null
  }
  if (!l || !r) return null
  const d = polyAdd(l, polyScale(r, -1))
  const big = Math.max(...d.map(Math.abs))
  if (!(big > 0)) return null
  while (d.length > 1 && Math.abs(d[d.length - 1]) <= 1e-12 * big) d.pop()
  return d.reverse()
}

/**
 * The polynomial's own value for a root the numeric search stopped just short of. Newton's method
 * creeps up on a repeated root and stops about eight digits away (x² + 6x + 9 = 0 gave −2.999999917),
 * where the root itself is −3. Only a root within a millionth of the one found replaces it, so the
 * search still decides WHICH root x = ? answers with, as on the handheld.
 */
export function polishedRoot(coeffs: number[], root: number): number {
  let best: number | undefined
  for (const z of polynomialRoots(coeffs)) {
    if (z.im === 0 && (best === undefined || Math.abs(z.re - root) < Math.abs(best - root))) best = z.re
  }
  return best !== undefined && Math.abs(best - root) <= 1e-6 * Math.max(1, Math.abs(root)) ? best : root
}

/** One conjugate pair on one line: −2 ± 3i, ±2i, ±i. */
const pairText = (z: Cx): string => (z.re === 0 ? `±${formatImaginary(z.im)}` : `${calcNum(z.re)} ± ${formatImaginary(z.im)}`)

/**
 * What x = ? answers when the numeric search finds no real root of a polynomial: a real root it
 * missed, to try again from, or the sentence naming the complex roots, each pair once and in the
 * order of the rule (x = ±i or x = ±2i). The sentence is an answer, not an error: nothing is
 * wrong with the question, and no x is stored from it.
 */
export function beyondTheReals(coeffs: number[], guess: number): { root: number } | { sentence: string } | null {
  const roots = polynomialRoots(coeffs)
  if (!roots.length) return null
  const real = roots.filter((z) => z.im === 0)
  if (real.length) return { root: real.reduce((best, z) => (Math.abs(z.re - guess) < Math.abs(best.re - guess) ? z : best)).re }
  const pairs = roots.filter((z) => z.im > 0).map(pairText)
  return { sentence: `No real solution. In complex numbers: x = ${pairs.join(' or x = ')}` }
}

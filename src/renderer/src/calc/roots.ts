// The roots of a polynomial as the calculator lists them, whichever screen lists them.
//
// The same equation used to come back four ways (polish item P7). For x² + 4 = 0 the x = ? key said
// "No solution I can find near 0", Equations mode listed "0 − 2i, 0 + 2i" (−2i first), the Solve job
// "2i, −2i", and the command bar's algebra-engine line "≈ 0 + 2i" in the engine's own order. What every screen
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
import { toFraction } from '../math/fraction'
import { findRationalRoot, pDeg, pDivMod, pGcd, pPrimitive, pTrim, type Poly as ExactPoly } from '../math/pure/poly'
import { R1, rFromNumber, rMul, rNeg, rat } from '../math/pure/rat'
import { keypadToMath, constantOf, exactForm, polyRoots, type Cx, type ExprNode } from './engine'
import { calcNum, formatComplex, formatImaginary } from './format'
import { labelText } from './labels'

interface RootRow {
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
export function rowLabel(i: number, count: number): string {
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
function polynomialRoots(coeffs: number[]): Cx[] {
  return rootsOf(coeffs).roots
}

/** |p(z)| against the size of the terms that made it, Σ|aₖ||z|ᵏ: how far from a root z is, in the unit of the arithmetic done to find out. */
function residual(c: number[], z: Cx): number {
  const size = Math.hypot(z.re, z.im)
  let re = 0
  let im = 0
  let terms = 0
  for (const a of c) {
    const nr = re * z.re - im * z.im + a
    im = re * z.im + im * z.re
    re = nr
    terms = terms * size + Math.abs(a)
  }
  return Math.hypot(re, im) / (terms || 1)
}

/** How far from a root of the equation a root may be and still be shown: a billionth of the size of the terms (see residual). */
const VERIFIED = 1e-9

/**
 * The roots that check: each is put back into the polynomial it is a root of, and one that does not come out zero to within VERIFIED of the
 * terms that made it is not shown as an answer. `complete` is false when any was left out, so a list that claims all the roots does not.
 */
export function keepVerified(coeffs: number[], roots: Cx[]): { roots: Cx[]; complete: boolean } {
  const kept = roots.filter((z) => residual(coeffs, z) <= VERIFIED)
  return { roots: kept, complete: kept.length === roots.length }
}

/** How many significant figures a number was typed with: 0.25 is two, 1200 is two, 1e-16 is one (the shortest text that reads back as the same number). */
const figuresOf = (v: number): number =>
  String(Math.abs(v))
    .replace(/e.*$/i, '')
    .replace('.', '')
    .replace(/^0+/, '')
    .replace(/0+$/, '').length

/** Beyond this degree a polynomial is not a school polynomial, and the exact route does not try. */
const EXACT_DEGREE = 12

/** The number a rational coefficient is, as a double. */
const asNumber = (r: { n: bigint; d: bigint }): number => Number(r.n) / Number(r.d)

/** Whether the rational root search is cheap for this polynomial: it factors the constant and leading terms by trial, so ten figures is as far as it goes. */
function searchable(p: ExactPoly): boolean {
  const { prim } = pPrimitive(p)
  let low = 0
  while (low < prim.length && prim[low].n === 0n) low++
  const big = (v: bigint): boolean => (v < 0n ? -v : v) > 1_000_000_000n
  return !(big(prim[low].n) || big(prim[prim.length - 1].n))
}

/** The derivative of an exact polynomial, smallest power first. */
const derivative = (p: ExactPoly): ExactPoly => pTrim(p.slice(1).map((c, k) => rMul(c, rat(BigInt(k + 1)))))

/**
 * Every root of a polynomial with exact coefficients, each once, found without any rounding where the roots are rational, square roots of rational
 * numbers or the roots of a quadratic: the repeated roots are taken out by dividing by the greatest common divisor of p and p′ (so (x − 1)³ is the root
 * 1 and not three near-copies of it), the rational roots are peeled off one at a time, a polynomial in x² is solved for x² first, and a quadratic is solved by
 * its formula. What is left, when it is a polynomial of degree three or more with no rational root, is solved numerically (Durand–Kerner, then Newton on the
 * polynomial itself, then snapped to the whole number or simple fraction it sits on when that checks).
 */
function solveExact(p: ExactPoly, out: Cx[]): void {
  let q = pTrim(p)
  // Rational roots: the search is bounded (poly.ts), and a degree-one or degree-two polynomial does not need it.
  for (let guard = 0; pDeg(q) >= 3 && searchable(q) && guard < EXACT_DEGREE; guard++) {
    const r = findRationalRoot(q)
    if (!r) break
    out.push({ re: asNumber(r), im: 0 })
    q = pDivMod(q, [rNeg(r), R1]).q
  }
  const d = pDeg(q)
  if (d < 1) return
  const c = [...q].reverse().map(asNumber)
  if (d === 1) out.push({ re: -c[1] / c[0], im: 0 })
  else if (d === 2) out.push(...quadraticRoots(c[0], c[1], c[2]))
  else if (q.every((k, i) => i % 2 === 0 || k.n === 0n)) {
    // A polynomial in x²: solve for y = x², then x = ±√y (a negative y gives the pair ±i√|y|).
    const y: Cx[] = []
    solveExact(q.filter((_, i) => i % 2 === 0), y)
    for (const z of y) {
      const size = Math.hypot(z.re, z.im)
      const root = { re: Math.sqrt((size + z.re) / 2), im: (z.im < 0 ? -1 : 1) * Math.sqrt((size - z.re) / 2) }
      out.push(root, { re: -root.re, im: -root.im })
    }
  } else out.push(...polished(c, polyRoots(c)))
}

/** Newton's method on the polynomial itself, from each root; the whole number or simple fraction a root sits on, when it checks. */
function polished(c: number[], roots: Cx[]): Cx[] {
  const deriv = c.slice(0, -1).map((a, i) => a * (c.length - 1 - i))
  const at = (poly: number[], z: Cx): Cx => poly.reduce<Cx>((acc, a) => ({ re: acc.re * z.re - acc.im * z.im + a, im: acc.re * z.im + acc.im * z.re }), { re: 0, im: 0 })
  return roots.map((z0) => {
    let z = z0
    for (let i = 0; i < 6; i++) {
      const f = at(c, z)
      const g = at(deriv, z)
      const den = g.re * g.re + g.im * g.im
      if (den === 0) break
      const next = { re: z.re - (f.re * g.re + f.im * g.im) / den, im: z.im - (f.im * g.re - f.re * g.im) / den }
      if (!(residual(c, next) <= residual(c, z))) break
      z = next
    }
    // A part that is a whole number or a fraction of a few parts (−2, 0.5, 3/7) is that number when putting it back still checks.
    const snap = (v: number): number => {
      const f = toFraction(v, 100, 200)
      return f ? f[0] / f[1] : v
    }
    const snapped = { re: snap(z.re), im: snap(z.im) }
    return residual(c, snapped) <= Math.max(residual(c, z), Number.EPSILON) ? snapped : z
  })
}

/** The roots as the screens list them, and whether every one of them checked. */
function rootsOf(coeffs: number[]): { roots: Cx[]; complete: boolean } {
  const c = [...coeffs]
  // A leading zero is no term; a small leading coefficient is one the student typed (Equations mode takes the numbers as typed), and is kept: the
  // equation 1×10⁻¹⁶x² + x = 0 has a second root, −10¹⁶, that a floor of 10⁻¹⁵ on the coefficient lost.
  while (c.length > 1 && c[0] === 0) c.shift()
  const n = c.length - 1
  if (n < 1) return { roots: [], complete: true }
  if (n === 1) return { roots: [clean({ re: -c[1] / c[0], im: 0 })], complete: true }
  if (n === 2) return keepVerified(c, quadraticRoots(c[0], c[1], c[2]))
  // Whole numbers and decimals as typed (twelve figures or fewer) are exact, and their roots are found exactly; anything else — a coefficient with
  // a stray digit of round-off in it, a root of 2 — is a number, and its roots are numbers: the repeated roots taken out, then Durand–Kerner.
  let roots: Cx[] | null = null
  if (n <= EXACT_DEGREE && c.every((v) => Number.isFinite(v) && figuresOf(v) <= 12)) {
    try {
      const exact: Cx[] = []
      const p = pTrim([...c].reverse().map(rFromNumber))
      const root = pGcd(p, derivative(p))
      solveExact(pDeg(root) >= 1 ? pDivMod(p, root).q : p, exact)
      roots = exact
    } catch {
      roots = null
    }
  }
  if (roots === null) {
    const q = squareFree(c)
    const m = q.length - 1
    roots = m === 1 ? [{ re: -q[1] / q[0], im: 0 }] : m === 2 ? quadraticRoots(q[0], q[1], q[2]) : polished(q, polyRoots(q))
  }
  const checked = keepVerified(c, roots.map(clean))
  return { roots: orderRoots(checked.roots, (z) => z), complete: checked.complete }
}

/**
 * Every real root of aₙxⁿ + … + a₀ (coefficients [aₙ … a₀]) once, in the order the screens list them, and each complex
 * pair once as text (−2 ± 3i). The same roots Equations mode and the Solve job list, so x = ? on a polynomial gives the
 * whole answer: it used to give the one root nearest the stored x.
 */
export function realAndPairs(coeffs: number[]): { real: number[]; pairs: string[]; complete: boolean } {
  const { roots, complete } = rootsOf(coeffs)
  return { real: roots.filter((z) => z.im === 0).map((z) => z.re), pairs: roots.filter((z) => z.im > 0).map(pairText), complete }
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
    l = readPolynomial(math.parse(keypadToMath(left)) as ExprNode, scope)
    r = readPolynomial(math.parse(keypadToMath(right)) as ExprNode, scope)
  } catch {
    return null
  }
  if (!l || !r) return null
  const d = polyAdd(l, polyScale(r, -1))
  const big = Math.max(...d.map(Math.abs))
  if (!(big > 0)) return null
  // A top term goes only when it is round-off of the arithmetic done on the line: what is left of two numbers that cancelled, measured against the
  // two numbers (x² + 4 = x² + 1 leaves 0 of 1 and 1; 0.1x² + 0.2x² = 0.3x² − x leaves 5.5×10⁻¹⁷ of 0.3 and 0.3). Measured against the largest
  // coefficient of the whole polynomial it threw away a term the student typed: 1×10⁻¹⁶x² + x = 0 lost the root −10¹⁶ and answered x = 0.
  // eslint-disable-next-line no-restricted-syntax -- relative already (10⁻¹² of the sizes it was made from); math/noise.ts says 10⁻¹⁵, and which number is the owner's (OWNER-APPROVALS CW9-N2-1, with CW9-N3-1)
  while (d.length > 1 && Math.abs(d[d.length - 1]) <= 1e-12 * Math.max(Math.abs(l[d.length - 1] ?? 0), Math.abs(r[d.length - 1] ?? 0))) d.pop()
  return d.reverse()
}

/**
 * Whether a real number is a root of the polynomial (coefficients [aₙ … a₀]) once it is put back: zero to within VERIFIED of the terms that made it, the
 * check every root passes before it is shown. A point a numeric search stopped at is an answer only if it passes. It is the weakest check for a repeated
 * root — (x − 1)⁸ is 4×10⁻¹⁵ at 0.984, and the search stops there — so a polynomial answers with the exact roots whenever they were found (realAndPairs),
 * and this is the check on a number that has nothing else behind it.
 */
export function rootChecks(coeffs: number[], root: number): boolean {
  return Number.isFinite(root) && residual(coeffs, { re: root, im: 0 }) <= VERIFIED
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

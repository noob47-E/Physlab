// G2: the real roots of a polynomial with rational coefficients, found exactly. Sturm's theorem counts the roots in an
// interval with no rounding at all, so bisecting with it puts each real root in its own box with rational ends. The
// checkers use the boxes twice: as the points a function is undefined at (a denominator's zeros), and to split the line
// into pieces on which every |…| has one sign (docs/knowledge/check.md).

import { pDeg, pDivMod, pEval, pIsZero, pLead, pPrimitive, pTrim, type Poly } from '../pure/poly'
import { R0, R1, rAbs, rAdd, rCmp, rDiv, rIsZero, rMul, rNeg, rSign, rSqrt, rStr, rSub, rat, type Rat } from '../pure/rat'
import { NotExact, tick } from './verdict'

/**
 * How much is worked out exactly (a square-free part, Sturm's real roots, a perfect power): the degree, and the degree
 * times the binary digits of the largest whole coefficient. The work grows with both: a dense polynomial of degree 60
 * took 0.3 s, of 120 nine seconds and of 200 three minutes; (123456789x + 987654321)⁶⁴ + x (degree 64, 1900-bit
 * coefficients) seven seconds, and the Chebyshev polynomial T₆₄(8192x) (900-bit coefficients, 57 600 by this measure)
 * up to two minutes, on the window's own thread. School polynomials are far below both; above them the answer is
 * 'unknown', and the time budget (verdict.ts) stops whatever is left.
 */
const MAX_EXACT_DEGREE = 64
const MAX_EXACT_SIZE = 20_000

/** NotExact when p is past what is worked out exactly here (MAX_EXACT_DEGREE). */
export function checkSize(p: Poly): void {
  const deg = pDeg(p)
  if (deg > MAX_EXACT_DEGREE) throw new NotExact(`degree ${deg} is too high to work out exactly here`)
  const bits = Math.max(...positivePrimitive(p).map((c) => (c.n < 0n ? -c.n : c.n).toString(2).length))
  if (deg * bits > MAX_EXACT_SIZE) throw new NotExact('the numbers are too big to work out exactly here')
}

export const pDeriv = (p: Poly): Poly => pTrim(p.slice(1).map((c, i) => rMul(c, rat(BigInt(i + 1)))))

/**
 * q times a positive number that makes its coefficients whole with no common factor: the same sign at every point,
 * so the same Sturm count, but the numbers stay small. Remainders taken over ℚ as they come grow so fast that one
 * Sturm chain for a polynomial of degree 40 took eleven seconds.
 */
function positivePrimitive(q: Poly): Poly {
  const { content, prim } = pPrimitive(q)
  return rSign(content) < 0 ? prim.map(rNeg) : prim
}

/** A greatest common divisor (up to a constant), with every remainder kept primitive for the same reason. */
export function gcdOf(a: Poly, b: Poly): Poly {
  let x = positivePrimitive(a)
  let y = positivePrimitive(b)
  while (!pIsZero(y)) {
    tick()
    const r = pTrim(pDivMod(x, y).r)
    x = y
    y = positivePrimitive(r)
  }
  return x
}

/** p without repeated factors: p / gcd(p, p′), up to a constant. Same real roots, each simple. */
export function squarefree(p0: Poly): Poly {
  const p = pTrim(p0)
  if (pDeg(p) < 1) return p
  checkSize(p)
  const g = gcdOf(p, pDeriv(p))
  return pDeg(g) < 1 ? p : pTrim(pDivMod(p, g).q)
}

function sturmChain(p: Poly): Poly[] {
  const chain = [positivePrimitive(p), positivePrimitive(pDeriv(p))]
  for (;;) {
    tick()
    const last = chain[chain.length - 1]
    if (pDeg(last) < 1) break
    const r = pTrim(pDivMod(chain[chain.length - 2], last).r)
    if (pIsZero(r)) break
    chain.push(positivePrimitive(r.map(rNeg)))
  }
  return chain
}

/**
 * The sign of q(n/d). For whole coefficients it is the sign of Σ cᵢ nⁱ d^(k−i) (d > 0), in whole numbers: a fraction
 * reduced at every step of Horner's rule was most of the time a Sturm count took.
 */
function signAt(q: Poly, x: Rat): number {
  if (q.some((c) => c.d !== 1n)) return rSign(pEval(q, x))
  const k = q.length - 1
  if (k < 0) return 0
  let s = q[k].n
  let dk = 1n
  for (let i = k - 1; i >= 0; i--) {
    dk *= x.d
    s = s * x.n + q[i].n * dk
  }
  return s > 0n ? 1 : s < 0n ? -1 : 0
}

function variations(chain: Poly[], x: Rat): number {
  tick()
  let v = 0
  let last = 0
  for (const q of chain) {
    const s = signAt(q, x)
    if (s !== 0) {
      if (last !== 0 && s !== last) v++
      last = s
    }
  }
  return v
}

const half = (x: Rat): Rat => rDiv(x, rat(2n))

/** One real root alone in lo < root < hi, with p(lo) and p(hi) not 0; `exact` when it was met exactly, as a midpoint. */
interface RootBox {
  lo: Rat
  hi: Rat
  exact: Rat | null
}

/** Every real root of p, each in its own box, in increasing order. The boxes do not overlap. */
export function isolateRealRoots(p0: Poly): RootBox[] {
  const p = positivePrimitive(squarefree(p0))
  if (pDeg(p) < 1) return []
  const chain = sturmChain(p)
  const count = (a: Rat, b: Rat): number => variations(chain, a) - variations(chain, b)
  const isRoot = (x: Rat): boolean => signAt(p, x) === 0
  // Cauchy's bound: every root is below 1 + max |cᵢ/cₙ|.
  const lead = pLead(p)
  let bound = R1
  for (const c of p.slice(0, -1)) {
    const r = rAbs(rDiv(c, lead))
    if (rCmp(r, bound) > 0) bound = r
  }
  bound = rAdd(bound, R1)
  const out: RootBox[] = []
  const stack: [Rat, Rat][] = [[rNeg(bound), bound]]
  while (stack.length) {
    tick()
    const [a, b] = stack.pop()!
    const n = count(a, b)
    if (n === 0) continue
    if (n === 1) {
      out.push({ lo: a, hi: b, exact: null })
      continue
    }
    const m = half(rAdd(a, b))
    if (!isRoot(m)) {
      stack.push([a, m], [m, b])
      continue
    }
    // A rational root at the midpoint: a small box around it holding nothing else.
    let d = half(half(rSub(b, a)))
    while (isRoot(rSub(m, d)) || isRoot(rAdd(m, d)) || count(rSub(m, d), rAdd(m, d)) !== 1) d = half(d)
    out.push({ lo: rSub(m, d), hi: rAdd(m, d), exact: m })
    stack.push([a, rSub(m, d)], [rAdd(m, d), b])
  }
  return out.sort((x, y) => rCmp(x.lo, y.lo))
}

/**
 * The box's root when it is rational, or null. p is whole-numbered and primitive, so a rational root is k/L for L its
 * leading coefficient (the rational-root theorem): a box narrower than 1/L holds one such number at most, and one sign
 * test settles it. Listing the theorem's candidates instead took three minutes for (123456789x + 987654321)²⁰ + x.
 */
function rationalIn(p: Poly, box: RootBox): Rat | null {
  if (box.exact) return box.exact
  const L = rAbs(pLead(p)).n
  // Each binary digit of L is one more halving of the box: a root is named only while that stays proportional to the
  // work that found it. Past that it is given by its value, which is all an excluded point needs.
  if (L.toString(2).length > 256) return null
  const r = refine(p, box, rat(1n, 2n * L))
  if (r.exact) return r.exact
  // The least k with k/L > lo: ⌊lo·L⌋ + 1.
  const n = r.lo.n * L
  const d = r.lo.d
  const k = n / d - (n % d < 0n ? 1n : 0n) + 1n
  const c = rat(k, L)
  return rCmp(c, r.hi) < 0 && signAt(p, c) === 0 ? c : null
}

/** The box shrunk by bisection until it is narrower than `width` (p squarefree, one simple root inside). */
function refine(p: Poly, box: RootBox, width: Rat): RootBox {
  if (box.exact) return box
  let { lo, hi } = box
  const sLo = signAt(p, lo)
  while (rCmp(rSub(hi, lo), width) > 0) {
    tick()
    const m = half(rAdd(lo, hi))
    const s = signAt(p, m)
    if (s === 0) return { lo: rSub(m, rDiv(width, rat(4n))), hi: rAdd(m, rDiv(width, rat(4n))), exact: m }
    if (s === sLo) lo = m
    else hi = m
  }
  return { lo, hi, exact: null }
}

/**
 * A rational point inside each open piece the roots cut the line into: before the first root, between each pair, after
 * the last. On each piece p has one sign.
 */
export function piecePoints(boxes: RootBox[]): Rat[] {
  if (boxes.length === 0) return [R0]
  return [boxes[0].lo, ...boxes.map((b) => b.hi)]
}

/** A real zero of a denominator: its value, and its exact spelling when it is rational or a quadratic surd. */
export interface ExcludedPoint {
  value: number
  exact: string | null
}

/** The real zeros of p, exactly spelt where they can be: rational, or (−b ± √D)/2a for a quadratic factor. */
export function realZeros(p0: Poly): ExcludedPoint[] {
  const p = positivePrimitive(squarefree(p0))
  const boxes = isolateRealRoots(p).map((b) => ({ ...b, exact: rationalIn(p, b) }))
  // What is left after the rational roots: a quadratic's roots get their surd form.
  let rest = p
  for (const b of boxes) if (b.exact) rest = pTrim(pDivMod(rest, [rNeg(b.exact), R1]).q)
  const surds = pDeg(rest) === 2 ? quadraticSurds(rest) : null
  return boxes.map((b) => {
    if (b.exact) return { value: Number(b.exact.n) / Number(b.exact.d), exact: rStr(b.exact) }
    const r = refine(p, b, rat(1n, 10n ** 18n))
    const value = Number(r.lo.n) / Number(r.lo.d)
    const surd = surds?.find((s) => Math.abs(s.value - value) <= 1e-9 * Math.max(1, Math.abs(value)))
    return { value, exact: surd ? surd.text : null }
  })
}

function quadraticSurds(q: Poly): { value: number; text: string }[] | null {
  const [c, b, a] = q
  const disc = rSub(rMul(b, b), rMul(rat(4n), rMul(a, c)))
  if (rSign(disc) <= 0 || rSqrt(disc)) return null
  // (−b ± √D)/(2a) = m ± k√f
  const m = rDiv(rNeg(b), rMul(rat(2n), a))
  const twoA = rAbs(rMul(rat(2n), a))
  // √D/|2a| = √(D/(4a²))
  const inner = rDiv(disc, rMul(twoA, twoA))
  const num = inner.n * inner.d
  let s = 1n
  let f = num
  for (let k = 2n; k * k <= f && k < 100000n; k++) {
    while (f % (k * k) === 0n) {
      f /= k * k
      s *= k
    }
  }
  const kk = rat(s, inner.d)
  const sq = Math.sqrt(Number(f)) * (Number(kk.n) / Number(kk.d))
  const mv = Number(m.n) / Number(m.d)
  const kText = rStr(kk) === '1' ? '' : rStr(kk)
  const root = `${kText}√${f}`
  const mText = rIsZero(m) ? '' : rStr(m)
  return [
    { value: mv - sq, text: mText ? `${mText} − ${root}` : `−${root}` },
    { value: mv + sq, text: mText ? `${mText} + ${root}` : root }
  ]
}

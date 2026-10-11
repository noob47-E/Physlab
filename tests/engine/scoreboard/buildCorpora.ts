// The scoreboard's corpora (ENGINE-STAGE-PLAN.md G3a): questions built BACKWARDS, so each answer is known by
// construction and comes from neither engine. Seeded and deterministic; exact (tests/engine/scoreboard/exact.ts).
// Run `npx tsx tests/engine/scoreboard/buildCorpora.ts` to write generator.json and gating.json.
//
// Answer forms (docs/knowledge/scoreboard.md):
//   expand, partial fractions — one expression;
//   factor over Q — content * (primitive integer factors)^multiplicity, leading coefficients positive;
//   polynomial equations — "x = r, x = s (multiplicity 2)", every root, sorted by real part then imaginary part;
//   linear systems — "x = 1, y = -2", or "infinitely many", or "none";
//   rational simplification — "(num)/(den) ; excluded: x = a, x = b" (the cancelled factor's zeros);
//   derivatives — d/dx of the question.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as mathjs from 'mathjs'
import { EXTREME, Poly, Q, Rng } from './exact'

export interface CorpusItem {
  id: string
  class: string
  stratum: string
  question: string
  answer: string
  notes: string
}

export const CLASSES = ['expand', 'factor over Q', 'polynomial equations', 'linear systems', 'rational simplification', 'derivatives', 'partial fractions'] as const
type Class = (typeof CLASSES)[number]
type Made = { question: string; answer: string; notes: string }
type Make = (rng: Rng) => Made | null

/** A primitive integer linear factor q·x − p (q > 0, gcd 1): its root is p/q. */
function rootFactor(rng: Rng, maxNum = 9, maxDen = 4): { f: Poly; root: Q } {
  for (;;) {
    const q = rng.int(1, maxDen)
    const p = rng.int(-maxNum, maxNum)
    const root = new Q(p, q)
    if (root.d !== BigInt(q)) continue // keep q·x − p primitive
    return { f: Poly.linear(q, -p), root }
  }
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a))
/** An integer quadratic a·x² + b·x + c, primitive, a > 0, irreducible over Q (its discriminant is not a square). */
function irreducibleQuadratic(rng: Rng): Poly {
  for (;;) {
    const a = rng.int(1, 4)
    const b = rng.int(-9, 9)
    const c = rng.nonzero(9)
    const disc = b * b - 4 * a * c
    if (disc >= 0 && Number.isInteger(Math.sqrt(disc))) continue
    if (gcd(gcd(a, b), c) !== 1) continue
    return new Poly([
      [2, a],
      [1, b],
      [0, c]
    ])
  }
}

const randomPoly = (rng: Rng, degree: number, max = 9): Poly => {
  const terms: [number, number][] = [[degree, rng.nonzero(max)]]
  for (let e = 0; e < degree; e++) if (rng.next() < 0.75) terms.push([e, rng.int(-max, max)])
  return new Poly(terms)
}
const bracket = (p: Poly): string => `(${p.toString()})`
const powered = (p: Poly, m: number): string => (m === 1 ? bracket(p) : `${bracket(p)}^${m}`)

// ---------------------------------------------------------------------------------------------------------------
// expand

const expand: Record<string, Make> = {
  'small-degree': (rng) => {
    const a = randomPoly(rng, 1)
    const b = randomPoly(rng, 2)
    return { question: `${bracket(a)} * ${bracket(b)}`, answer: a.mul(b).toString(), notes: 'linear times quadratic' }
  },
  'big-degree': (rng) => {
    const a = randomPoly(rng, rng.int(2, 3))
    const b = randomPoly(rng, rng.int(2, 3))
    return { question: `${bracket(a)} * ${bracket(b)}`, answer: a.mul(b).toString(), notes: 'degree up to 6' }
  },
  'three-factors': (rng) => {
    const fs3 = [randomPoly(rng, 1), randomPoly(rng, 1), randomPoly(rng, rng.int(1, 2))]
    return { question: fs3.map(bracket).join(' * '), answer: fs3.reduce((p, f) => p.mul(f)).toString(), notes: 'three factors' }
  },
  power: (rng) => {
    const a = randomPoly(rng, 1, 5)
    const m = rng.int(2, 5)
    return { question: powered(a, m), answer: a.pow(m).toString(), notes: `a binomial to the power ${m}` }
  },
  'fractional-coef': (rng) => {
    const a = Poly.linear(new Q(rng.nonzero(5), rng.int(2, 5)), new Q(rng.nonzero(7), rng.int(2, 6)))
    const b = Poly.linear(new Q(rng.nonzero(5), rng.int(2, 5)), new Q(rng.int(-7, 7), rng.int(1, 6)))
    return { question: `${bracket(a)} * ${bracket(b)}`, answer: a.mul(b).toString(), notes: 'fraction coefficients' }
  },
  'extreme-coef': (rng) => {
    const big = rng.pick(EXTREME)
    const a = Poly.linear(big, rng.nonzero())
    const b = randomPoly(rng, rng.int(1, 2))
    return { question: `${bracket(a)} * ${bracket(b)}`, answer: a.mul(b).toString(), notes: `a coefficient of ${big}` }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// factor over Q: the question is the product, the answer the factors

type Part = { f: Poly; m: number }
/** content * f1^m1 * f2^m2 … with the factors primitive, leading coefficient positive, in a fixed order. */
function factored(content: Q, parts: Part[]): string {
  const sorted = [...parts].sort((a, b) => a.f.degree() - b.f.degree() || a.f.toString().localeCompare(b.f.toString()))
  const body = sorted.map((p) => powered(p.f, p.m)).join(' * ')
  return content.eq(new Q(1)) ? body : `${content.factorForm()} * ${body}`
}
const product = (content: Q, parts: Part[]): Poly => parts.reduce((p, x) => p.mul(x.f.pow(x.m)), Poly.constant(content))
/** Distinct primitive linear factors. */
function distinctLinears(rng: Rng, n: number): Poly[] {
  const out: Poly[] = []
  while (out.length < n) {
    const f = rootFactor(rng).f
    if (!out.some((g) => g.toString() === f.toString())) out.push(f)
  }
  return out
}
const factorItem = (content: Q, parts: Part[], notes: string): Made => ({ question: product(content, parts).toString(), answer: factored(content, parts), notes })

const factor: Record<string, Make> = {
  linear: (rng) =>
    factorItem(
      new Q(1),
      distinctLinears(rng, 2).map((f) => ({ f, m: 1 })),
      'two distinct linear factors'
    ),
  repeated: (rng) => {
    const [f, g] = distinctLinears(rng, 2)
    return factorItem(
      new Q(1),
      [
        { f, m: rng.int(2, 3) },
        { f: g, m: 1 }
      ],
      'a repeated linear factor'
    )
  },
  'irreducible-quad': (rng) =>
    factorItem(
      new Q(1),
      [
        { f: irreducibleQuadratic(rng), m: 1 },
        { f: rootFactor(rng).f, m: 1 }
      ],
      'an irreducible quadratic (no rational roots)'
    ),
  content: (rng) =>
    factorItem(
      new Q(rng.pick([2, 3, 4, 5, 6, -2, -3, -6])),
      distinctLinears(rng, rng.int(1, 2)).map((f) => ({ f, m: 1 })),
      'a whole-number content, as in 6x² − 6'
    ),
  'big-degree': (rng) => factorItem(new Q(1), [...distinctLinears(rng, rng.int(2, 3)).map((f) => ({ f, m: 1 })), { f: irreducibleQuadratic(rng), m: 1 }], 'degree 4 or 5'),
  'extreme-content': (rng) => {
    const k = rng.pick(EXTREME)
    return factorItem(
      k,
      distinctLinears(rng, 2).map((f) => ({ f, m: 1 })),
      `a content of ${k}`
    )
  }
}

// ---------------------------------------------------------------------------------------------------------------
// polynomial equations: choose the roots and their multiplicities, build the polynomial

type Root = { text: string; key: [number, number] }
const rationalRoot = (r: Q): Root => ({ text: r.toString(), key: [r.toNumber(), 0] })
function rootsAnswer(roots: { r: Root; m: number }[]): string {
  return [...roots]
    .sort((x, y) => x.r.key[0] - y.r.key[0] || x.r.key[1] - y.r.key[1])
    .map(({ r, m }) => `x = ${r.text}${m > 1 ? ` (multiplicity ${m})` : ''}`)
    .join(', ')
}
/** The pair a ± √b (b not a square): x² − 2a·x + a² − b. */
function surdPair(rng: Rng): { f: Poly; roots: Root[] } {
  const a = rng.int(-12, 12)
  const b = rng.pick([2, 3, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20])
  const f = new Poly([
    [2, 1],
    [1, -2 * a],
    [0, a * a - b]
  ])
  const text = (s: 1 | -1) => (a === 0 ? `${s < 0 ? '-' : ''}sqrt(${b})` : `${a} ${s < 0 ? '-' : '+'} sqrt(${b})`)
  const mk = (s: 1 | -1): Root => ({ text: text(s), key: [a + s * Math.sqrt(b), 0] })
  return { f, roots: [mk(-1), mk(1)] }
}
/** The pair a ± b·i (b ≠ 0): x² − 2a·x + a² + b². */
function complexPair(rng: Rng): { f: Poly; roots: Root[] } {
  const a = rng.int(-12, 12)
  const b = rng.int(1, 12)
  const f = new Poly([
    [2, 1],
    [1, -2 * a],
    [0, a * a + b * b]
  ])
  const im = b === 1 ? 'i' : `${b}*i`
  const text = (s: 1 | -1) => (a === 0 ? `${s < 0 ? '-' : ''}${im}` : `${a} ${s < 0 ? '-' : '+'} ${im}`)
  const mk = (s: 1 | -1): Root => ({ text: text(s), key: [a, s * b] })
  return { f, roots: [mk(-1), mk(1)] }
}
function equation(scale: Q, factors: Poly[], roots: { r: Root; m: number }[], notes: string): Made {
  const p = factors.reduce((x, f) => x.mul(f), Poly.constant(scale))
  return { question: `${p.toString()} = 0`, answer: rootsAnswer(roots), notes }
}
function distinctRationalRoots(rng: Rng, n: number): { f: Poly; root: Q }[] {
  const out: { f: Poly; root: Q }[] = []
  while (out.length < n) {
    const r = rootFactor(rng)
    if (!out.some((o) => o.root.eq(r.root))) out.push(r)
  }
  return out
}
const simple = (rs: { root: Q }[]) => rs.map((r) => ({ r: rationalRoot(r.root), m: 1 }))

const polyEq: Record<string, Make> = {
  rational: (rng) => {
    const rs = distinctRationalRoots(rng, rng.int(2, 3))
    return equation(
      new Q(1),
      rs.map((r) => r.f),
      simple(rs),
      'rational roots'
    )
  },
  surds: (rng) => {
    const { f, roots } = surdPair(rng)
    return equation(
      new Q(1),
      [f],
      roots.map((r) => ({ r, m: 1 })),
      'a conjugate surd pair'
    )
  },
  complex: (rng) => {
    const { f, roots } = complexPair(rng)
    return equation(
      new Q(1),
      [f],
      roots.map((r) => ({ r, m: 1 })),
      'a complex conjugate pair'
    )
  },
  double: (rng) => {
    const [d, s] = distinctRationalRoots(rng, 2)
    if (rng.next() < 0.5) return equation(new Q(1), [d.f, d.f], [{ r: rationalRoot(d.root), m: 2 }], 'a double root')
    return equation(
      new Q(1),
      [d.f, d.f, s.f],
      [
        { r: rationalRoot(d.root), m: 2 },
        { r: rationalRoot(s.root), m: 1 }
      ],
      'a double root and a simple one'
    )
  },
  'big-degree': (rng) => {
    // degree 4, 5 or 6: two or three rational roots and one pair, or two rational roots and two pairs
    const rs = distinctRationalRoots(rng, rng.int(2, 3))
    const pairs = rs.length === 2 && rng.next() < 0.5 ? [surdPair(rng), complexPair(rng)] : [rng.next() < 0.5 ? surdPair(rng) : complexPair(rng)]
    return equation(
      new Q(1),
      [...rs.map((r) => r.f), ...pairs.map((p) => p.f)],
      [...simple(rs), ...pairs.flatMap((p) => p.roots.map((r) => ({ r, m: 1 })))],
      'degree 4 to 6, mixed roots'
    )
  },
  'extreme-coef': (rng) => {
    const k = rng.pick(EXTREME)
    const rs = distinctRationalRoots(rng, 2)
    return equation(
      k,
      rs.map((r) => r.f),
      simple(rs),
      `every coefficient times ${k}`
    )
  }
}

// ---------------------------------------------------------------------------------------------------------------
// linear systems: choose the solution (or a dependent / inconsistent shape), build the equations

const VARS = ['x', 'y', 'z']
function linearLhs(coefs: Q[]): string {
  return coefs
    .map((c, i) => ({ c, v: VARS[i] }))
    .filter((t) => !t.c.isZero())
    .map(({ c, v }, i) => {
      const neg = c.sign() < 0
      const m = neg ? c.neg() : c
      const body = (m.eq(new Q(1)) ? '' : `${m.factorForm()}*`) + v
      return i === 0 ? (neg ? '-' : '') + body : (neg ? ' - ' : ' + ') + body
    })
    .join('')
}
const det2 = (m: number[][]): number => m[0][0] * m[1][1] - m[0][1] * m[1][0]
const det3 = (m: number[][]): number =>
  m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
function matrix(rng: Rng, n: number, max = 7): number[][] {
  for (;;) {
    const m = Array.from({ length: n }, () => Array.from({ length: n }, () => rng.int(-max, max)))
    if ((n === 2 ? det2(m) : det3(m)) !== 0 && m.every((row) => row.some((v) => v !== 0))) return m
  }
}
const system = (rows: Q[][], rhs: Q[]): string => rows.map((r, i) => `${linearLhs(r)} = ${rhs[i].toString()}`).join(', ')
const rhsOf = (rows: Q[][], sol: Q[]): Q[] => rows.map((r) => r.reduce((s, c, j) => s.add(c.mul(sol[j])), new Q(0)))
function unique(rng: Rng, n: number, sol: Q[], scale = new Q(1)): { question: string; answer: string } {
  const m = matrix(rng, n).map((row) => row.map((v) => new Q(v).mul(scale)))
  return { question: system(m, rhsOf(m, sol)), answer: sol.map((v, j) => `${VARS[j]} = ${v.toString()}`).join(', ') }
}
/** n equations in n unknowns, the last a combination of the others; `shift` moves its right side off (no solution). */
function degenerate(rng: Rng, shift: boolean): { question: string; n: number } {
  const n = rng.int(2, 3)
  // Every unknown must appear: a column of zeros would leave it out of the question, and the system as written would
  // then have a unique solution in the others.
  let base = matrix(rng, n).slice(0, n - 1)
  while (base[0].some((_, j) => base.every((row) => row[j] === 0))) base = matrix(rng, n).slice(0, n - 1)
  const sol = Array.from({ length: n }, () => new Q(rng.int(-5, 5)))
  const k = new Q(rng.nonzero(3))
  const extra = n === 2 ? base[0].map((v) => k.mul(new Q(v))) : base[0].map((v, j) => new Q(v).mul(k).add(new Q(base[1][j])))
  const rows = [...base.map((r) => r.map((v) => new Q(v))), extra]
  const rhs = rhsOf(rows, sol)
  if (shift) rhs[n - 1] = rhs[n - 1].add(new Q(rng.nonzero(5)))
  return { question: system(rows, rhs), n }
}

const linSys: Record<string, Make> = {
  '2x2-unique': (rng) => ({ ...unique(rng, 2, [new Q(rng.int(-9, 9)), new Q(rng.int(-9, 9))]), notes: 'two equations, one solution' }),
  '3x3-unique': (rng) => ({ ...unique(rng, 3, [new Q(rng.int(-6, 6)), new Q(rng.int(-6, 6)), new Q(rng.int(-6, 6))]), notes: 'three equations, one solution' }),
  'fraction-solution': (rng) => ({ ...unique(rng, 2, [new Q(rng.nonzero(9), rng.int(2, 7)), new Q(rng.nonzero(9), rng.int(2, 7))]), notes: 'a solution in fractions' }),
  dependent: (rng) => {
    const d = degenerate(rng, false)
    return { question: d.question, answer: 'infinitely many', notes: `${d.n} equations, one a combination of the others` }
  },
  inconsistent: (rng) => {
    const d = degenerate(rng, true)
    return { question: d.question, answer: 'none', notes: `${d.n} equations that contradict each other` }
  },
  'extreme-coef': (rng) => {
    const k = rng.pick(EXTREME)
    return { ...unique(rng, 2, [new Q(rng.int(-9, 9)), new Q(rng.int(-9, 9))], k), notes: `every coefficient times ${k}` }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// rational simplification: choose the cancelled factor, record where it was zero

/** Whether two polynomials share a rational root (the only common factors these generators can make). */
function shareRoot(a: Poly, b: Poly): boolean {
  for (let p = -40; p <= 40; p++) for (let q = 1; q <= 8; q++) if (a.eval(new Q(p, q)).isZero() && b.eval(new Q(p, q)).isZero()) return true
  return false
}
function rational(rng: Rng, cancel: Poly[], excluded: Q[], notes: string, scale = new Q(1)): Made | null {
  const num = randomPoly(rng, rng.int(1, 2)).scale(scale)
  const den = rootFactor(rng).f.mul(rng.next() < 0.4 ? rootFactor(rng).f : Poly.constant(1))
  // The kept fraction must not cancel further, or the "simplified" key would not be simplest.
  if (shareRoot(num, den)) return null
  if (cancel.some((c) => den.divmod(c)[1].isZero() || num.divmod(c)[1].isZero())) return null
  const c = cancel.reduce((p, f) => p.mul(f), Poly.constant(1))
  const ex = [...new Map(excluded.map((e) => [e.toString(), e])).values()].sort((a, b) => a.toNumber() - b.toNumber())
  return {
    question: `${bracket(num.mul(c))}/${bracket(den.mul(c))}`,
    answer: `${bracket(num)}/${bracket(den)} ; excluded: ${ex.map((e) => `x = ${e.toString()}`).join(', ')}`,
    notes
  }
}

const ratSimp: Record<string, Make> = {
  'linear-cancel': (rng) => {
    const c = rootFactor(rng)
    return rational(rng, [c.f], [c.root], 'one linear factor cancels')
  },
  'quad-cancel': (rng) => {
    const [a, b] = distinctRationalRoots(rng, 2)
    return rational(rng, [a.f, b.f], [a.root, b.root], 'a quadratic with two rational zeros cancels')
  },
  'repeated-cancel': (rng) => {
    const c = rootFactor(rng)
    return rational(rng, [c.f, c.f], [c.root], 'a squared factor cancels')
  },
  'big-degree': (rng) => {
    const rs = distinctRationalRoots(rng, 3)
    return rational(
      rng,
      rs.map((r) => r.f),
      rs.map((r) => r.root),
      'a cubic cancels'
    )
  },
  'extreme-coef': (rng) => {
    const c = rootFactor(rng)
    return rational(rng, [c.f], [c.root], 'a huge or tiny scale on the top', rng.pick(EXTREME))
  }
}

// ---------------------------------------------------------------------------------------------------------------
// derivatives: f from a grammar; the answer from mathjs's derivative (a third party to both engines), re-checked
// numerically by the corpus test

const OUTER = ['sin', 'cos', 'exp', 'ln', 'sqrt']
/** a·x² + b·x + c with a > 0 and no real zero: positive for every real x, so ln, √ and a quotient have no domain trap. */
function positiveQuadratic(rng: Rng): Poly {
  for (;;) {
    const a = rng.int(1, 4)
    const b = rng.int(-6, 6)
    const c = rng.int(1, 12)
    if (b * b - 4 * a * c < 0) return new Poly([
      [2, a],
      [1, b],
      [0, c]
    ])
  }
}
const pick = (rng: Rng, outer: string): string => {
  const inner = outer === 'ln' || outer === 'sqrt' ? positiveQuadratic(rng) : randomPoly(rng, rng.int(1, 2), 6)
  return `${outer}(${inner.toString()})`
}
const deriv = (question: string, notes: string): Made => ({ question, answer: '', notes })
const derivatives: Record<string, Make> = {
  polynomial: (rng) => deriv(randomPoly(rng, rng.int(2, 6)).toString(), 'a polynomial up to degree 6'),
  product: (rng) => deriv(`(${randomPoly(rng, rng.int(1, 3), 6).toString()}) * ${pick(rng, rng.pick(OUTER))}`, 'a product'),
  quotient: (rng) => deriv(`(${randomPoly(rng, rng.int(1, 3), 6).toString()}) / (${positiveQuadratic(rng).toString()})`, 'a quotient'),
  composition: (rng) => {
    const outer = rng.pick(['sin', 'cos', 'exp'])
    // Half are nested: sin(cos(…)), exp(sin(…)) — the chain rule twice.
    return deriv(rng.next() < 0.5 ? pick(rng, rng.pick(OUTER)) : `${outer}(${pick(rng, rng.pick(['sin', 'cos']))})`, 'a composition')
  },
  power: (rng) => deriv(`(${positiveQuadratic(rng).toString()})^${rng.pick(['2', '3', '4', '(-1)', '(-2)', '(1/2)', '(3/2)'])}`, 'a power of an inner function'),
  'extreme-coef': (rng) => deriv(`${rng.pick(EXTREME).factorForm()} * ${pick(rng, rng.pick(OUTER))}`, 'a huge or tiny constant multiple')
}
/**
 * mathjs's derivative, NOT simplified: simplifying folds the constants into doubles (6×10²⁴ · 3 can lose its last
 * digits, 5×10⁻¹⁹ · 3 is not 1.5×10⁻¹⁸ exactly), and a key must be exact. mathjs writes ln as log; the corpus writes ln.
 */
function derivativeOf(f: string): string {
  const d = mathjs.derivative(f.replace(/\bln\(/g, 'log('), 'x', { simplify: false })
  return d.toString().replace(/\blog\(/g, 'ln(')
}

// ---------------------------------------------------------------------------------------------------------------
// partial fractions: choose the decomposition, combine it into one fraction

type PF = { num: Poly; den: Poly; text: string }
/** The monic gcd of two polynomials (Euclid over Q). */
function pgcd(a: Poly, b: Poly): Poly {
  let x = a
  let y = b
  while (!y.isZero()) [x, y] = [y, x.divmod(y)[1]]
  return x.scale(new Q(1).div(x.lead()))
}
const plcm = (a: Poly, b: Poly): Poly => a.mul(b).divmod(pgcd(a, b))[0]
function pfTerm(c: Q | Poly, block: Poly, m: number): PF {
  const num = c instanceof Poly ? c : Poly.constant(c)
  const top = c instanceof Poly ? bracket(c) : c.factorForm()
  return { num, den: block.pow(m), text: `${top}/${powered(block, m)}` }
}
function pf(parts: PF[], notes: string): Made {
  const den = parts.reduce((d, p) => plcm(d, p.den), Poly.constant(1))
  const num = parts.reduce((s, p) => s.add(p.num.mul(den.divmod(p.den)[0])), new Poly())
  return { question: `${bracket(num)}/${bracket(den)}`, answer: parts.map((p) => p.text).join(' + '), notes }
}
const nz = (rng: Rng) => new Q(rng.nonzero(9))
const partial: Record<string, Make> = {
  'distinct-linear': (rng) =>
    pf(
      distinctRationalRoots(rng, rng.int(2, 3)).map((r) => pfTerm(nz(rng), r.f, 1)),
      'distinct linear factors'
    ),
  'repeated-linear': (rng) => {
    const [a, b] = distinctRationalRoots(rng, 2)
    return pf([pfTerm(nz(rng), a.f, 1), pfTerm(nz(rng), a.f, 2), pfTerm(nz(rng), b.f, 1)], 'a repeated linear factor')
  },
  'irreducible-quad': (rng) => pf([pfTerm(nz(rng), rootFactor(rng).f, 1), pfTerm(Poly.linear(rng.nonzero(5), rng.int(-7, 7)), irreducibleQuadratic(rng), 1)], 'an irreducible quadratic factor'),
  mixed: (rng) => {
    const [a, b] = distinctRationalRoots(rng, 2)
    return pf([pfTerm(nz(rng), a.f, 2), pfTerm(nz(rng), b.f, 1), pfTerm(Poly.linear(rng.nonzero(5), rng.nonzero(7)), irreducibleQuadratic(rng), 1)], 'repeated linear, linear and quadratic')
  },
  'fraction-coef': (rng) =>
    pf(
      distinctRationalRoots(rng, 2).map((r) => pfTerm(new Q(rng.nonzero(9), rng.int(2, 7)), r.f, 1)),
      'fraction numerators'
    ),
  'extreme-coef': (rng) => {
    const k = rng.pick(EXTREME)
    return pf(
      distinctRationalRoots(rng, 2).map((r) => pfTerm(k.mul(nz(rng)), r.f, 1)),
      `numerators of size ${k}`
    )
  }
}

// ---------------------------------------------------------------------------------------------------------------

const MAKERS: Record<Class, Record<string, Make>> = {
  expand,
  'factor over Q': factor,
  'polynomial equations': polyEq,
  'linear systems': linSys,
  'rational simplification': ratSimp,
  derivatives,
  'partial fractions': partial
}
const SLUG: Record<Class, string> = {
  expand: 'expand',
  'factor over Q': 'factor',
  'polynomial equations': 'polyeq',
  'linear systems': 'linsys',
  'rational simplification': 'ratsimp',
  derivatives: 'deriv',
  'partial fractions': 'partfrac'
}

/** One corpus: `perClass` items per class, spread evenly over its strata, no question twice. */
function buildCorpus(seed: number, perClass: number, prefix: string, avoid: ReadonlySet<string> = new Set()): CorpusItem[] {
  const rng = new Rng(seed)
  const out: CorpusItem[] = []
  for (const cls of CLASSES) {
    const strata = Object.entries(MAKERS[cls])
    const seen = new Set<string>()
    let n = 0
    for (let tries = 0; n < perClass; tries++) {
      if (tries > perClass * 50) throw new Error(`${cls}: could not make ${perClass} distinct items`)
      const [stratum, make] = strata[n % strata.length]
      const made = make(rng)
      // The gating corpus holds no question of the generator corpus.
      if (!made || seen.has(made.question) || avoid.has(`${cls}|${made.question}`)) continue
      seen.add(made.question)
      const answer = cls === 'derivatives' ? derivativeOf(made.question) : made.answer
      out.push({ id: `${prefix}-${SLUG[cls]}-${++n}`, class: cls, stratum, question: made.question, answer, notes: made.notes })
    }
  }
  return out
}

/** The generator corpus (built and tuned against) and the gating corpus (switch decisions only): different seeds. */
const GENERATOR = { seed: 20261011, perClass: 300 }
const GATING = { seed: 99991357, perClass: 200 }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  const generator = buildCorpus(GENERATOR.seed, GENERATOR.perClass, 'gen')
  const gating = buildCorpus(GATING.seed, GATING.perClass, 'gate', new Set(generator.map((i) => `${i.class}|${i.question}`)))
  for (const [name, items] of [
    ['generator', generator],
    ['gating', gating]
  ] as const) {
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(items, null, 1) + '\n')
    console.log(`${name}: ${items.length} items`)
  }
}

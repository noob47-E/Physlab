// G2B tests: random elementary expressions as trees, their derivatives by the textbook rules written out as text (no
// code shared with the checkers' own differentiator, math/check/atoms.ts), double-precision values for the ground
// truth, and the perturbations a student makes: a dropped chain factor, a sign flip, cos for sin, a coefficient ± 1,
// a missing term, and u/u′ for u′/u.

import { expect, it } from 'vitest'
import { derivativeCheck } from '../../src/renderer/src/math/check/checkers'
import { int, seeded } from './gen'

type Fn = 'sin' | 'cos' | 'tan' | 'exp' | 'ln' | 'sqrt' | 'atan' | 'asin'
type T =
  | { k: 'x' }
  | { k: 'n'; v: number }
  | { k: '+' | '-' | '*' | '/'; a: T; b: T }
  | { k: 'neg'; a: T }
  | { k: 'pow'; a: T; n: number }
  | { k: 'fn'; f: Fn; a: T }

const X: T = { k: 'x' }
export const num = (v: number): T => ({ k: 'n', v })
const isNum = (t: T, v?: number): boolean => t.k === 'n' && (v === undefined || t.v === v)

// Light simplification, so a derivative stays small: 0 and 1 are dropped where they change nothing.
export const add = (a: T, b: T): T => (isNum(a, 0) ? b : isNum(b, 0) ? a : { k: '+', a, b })
const sub = (a: T, b: T): T => (isNum(b, 0) ? a : isNum(a, 0) ? neg(b) : { k: '-', a, b })
const mul = (a: T, b: T): T => (isNum(a, 0) || isNum(b, 0) ? num(0) : isNum(a, 1) ? b : isNum(b, 1) ? a : { k: '*', a, b })
const div = (a: T, b: T): T => (isNum(a, 0) ? num(0) : isNum(b, 1) ? a : { k: '/', a, b })
const neg = (a: T): T => (isNum(a, 0) ? a : a.k === 'neg' ? a.a : { k: 'neg', a })
const pow = (a: T, n: number): T => (n === 1 ? a : n === 0 ? num(1) : { k: 'pow', a, n })
const fn = (f: Fn, a: T): T => ({ k: 'fn', f, a })

/** d/dx by the textbook rules, as a tree. */
export function deriv(t: T): T {
  switch (t.k) {
    case 'x':
      return num(1)
    case 'n':
      return num(0)
    case '+':
      return add(deriv(t.a), deriv(t.b))
    case '-':
      return sub(deriv(t.a), deriv(t.b))
    case '*':
      return add(mul(deriv(t.a), t.b), mul(t.a, deriv(t.b)))
    case '/':
      return div(sub(mul(deriv(t.a), t.b), mul(t.a, deriv(t.b))), pow(t.b, 2))
    case 'neg':
      return neg(deriv(t.a))
    case 'pow':
      return mul(mul(num(t.n), pow(t.a, t.n - 1)), deriv(t.a))
    case 'fn': {
      const du = deriv(t.a)
      const u = t.a
      switch (t.f) {
        case 'sin':
          return mul(fn('cos', u), du)
        case 'cos':
          return neg(mul(fn('sin', u), du))
        case 'tan':
          return mul(add(num(1), pow(fn('tan', u), 2)), du)
        case 'exp':
          return mul(fn('exp', u), du)
        case 'ln':
          return div(du, u)
        case 'sqrt':
          return div(du, mul(num(2), fn('sqrt', u)))
        case 'atan':
          return div(du, add(num(1), pow(u, 2)))
        case 'asin':
          return div(du, fn('sqrt', sub(num(1), pow(u, 2))))
      }
    }
  }
}

/** PhysLab's spelling: brackets on every function, * and ^ written, e^(u) for exp(u) at random when `style` asks. */
export function text(t: T, style = 0): string {
  // A function written as a power (e^(u), (u)^(1/2)) is bracketed too: ^ groups to the right, so e^(x)^2 is e^(x²).
  const w = (s: T): string => {
    const inner = text(s, style)
    return s.k === 'x' || (s.k === 'n' && s.v >= 0) || (s.k === 'fn' && inner.startsWith(`${s.f}(`)) ? inner : `(${inner})`
  }
  switch (t.k) {
    case 'x':
      return 'x'
    case 'n':
      return t.v < 0 ? `(${t.v})` : String(t.v)
    case '+':
      return `${text(t.a, style)} + ${text(t.b, style)}`
    case '-':
      return `${text(t.a, style)} - ${w(t.b)}`
    case '*':
      return `${w(t.a)}*${w(t.b)}`
    case '/':
      return `${w(t.a)}/${w(t.b)}`
    case 'neg':
      return `-${w(t.a)}`
    case 'pow':
      return t.n < 0 ? `${w(t.a)}^(${t.n})` : `${w(t.a)}^${t.n}`
    case 'fn':
      if (t.f === 'exp' && style % 2 === 1) return `e^(${text(t.a, style)})`
      if (t.f === 'sqrt' && style % 3 === 2) return `(${text(t.a, style)})^(1/2)`
      return `${t.f}(${text(t.a, style)})`
  }
}

/** The value at x in doubles; NaN where it is not a real number. */
function value(t: T, x: number): number {
  switch (t.k) {
    case 'x':
      return x
    case 'n':
      return t.v
    case '+':
      return value(t.a, x) + value(t.b, x)
    case '-':
      return value(t.a, x) - value(t.b, x)
    case '*':
      return value(t.a, x) * value(t.b, x)
    case '/': {
      const b = value(t.b, x)
      return b === 0 ? NaN : value(t.a, x) / b
    }
    case 'neg':
      return -value(t.a, x)
    case 'pow':
      return value(t.a, x) ** t.n
    case 'fn': {
      const u = value(t.a, x)
      switch (t.f) {
        case 'sin':
          return Math.sin(u)
        case 'cos':
          return Math.cos(u)
        case 'tan':
          return Math.tan(u)
        case 'exp':
          return Math.exp(u)
        case 'ln':
          return u > 0 ? Math.log(u) : NaN
        case 'sqrt':
          return u >= 0 ? Math.sqrt(u) : NaN
        case 'atan':
          return Math.atan(u)
        case 'asin':
          return Math.abs(u) <= 1 ? Math.asin(u) : NaN
      }
    }
  }
}

/**
 * Clearly different from `right` somewhere both are defined, f too, and well away from overflow: a relative gap past
 * 10⁻⁶ at one of 60 points. A perturbation that is not clearly wrong there is not used as a wrong answer (u′/u is
 * defined where u < 0 too, but ln u is not, and only f's domain counts).
 */
export function clearlyDifferent(wrong: T, right: T, f: T, rand: () => number): boolean {
  for (let i = 0; i < 60; i++) {
    const x = i < 20 ? -3 + (6 * i) / 19 + 0.0137 : (rand() * 2 - 1) * (i < 40 ? 3 : 0.9)
    const a = value(wrong, x)
    const b = value(right, x)
    if (!Number.isFinite(value(f, x)) || !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(b) > 1e8) continue
    if (Math.abs(a - b) > 1e-6 * (1 + Math.abs(b))) return true
  }
  return false
}

/**
 * A random expression of depth ≤ `depth`: sums, products, quotients and powers of x, small integers and functions.
 * ln and √ mostly take an inside that is positive for every x (u² + k, eᵘ + k), as a school question does, and
 * sometimes a raw one (ln x, √(sin x)), so domains are met too. asin takes u/(u² + 2), which stays inside (−1, 1).
 */
export function randomExpr(rand: () => number, depth: number): T {
  const leaf = (): T => (rand() < 0.75 ? (rand() < 0.5 ? X : mul(num(int(rand, 2, 5)), X)) : num(int(rand, -4, 5) || 1))
  if (depth <= 0) return leaf()
  const r = rand()
  const sub1 = (): T => randomExpr(rand, depth - 1)
  if (r < 0.12) return add(sub1(), sub1())
  if (r < 0.2) return sub(sub1(), sub1())
  if (r < 0.34) return mul(sub1(), sub1())
  if (r < 0.42) return div(sub1(), add(pow(sub1(), 2), num(int(rand, 1, 3))))
  if (r < 0.48) return pow(sub1(), int(rand, 2, 3))
  const u = sub1()
  const positive = (): T => (rand() < 0.5 ? add(pow(u, 2), num(int(rand, 1, 4))) : add(fn('exp', u), num(int(rand, 1, 3))))
  const f: Fn = (['sin', 'cos', 'exp', 'ln', 'sqrt', 'atan', 'tan', 'asin', 'sin', 'cos', 'exp'] as Fn[])[Math.floor(rand() * 11)]
  if (f === 'ln' || f === 'sqrt') return fn(f, rand() < 0.8 ? positive() : u)
  if (f === 'asin') return fn('asin', div(u, add(pow(u, 2), num(2))))
  return fn(f, u)
}

type Path = number[]
/** Every node with its path (0 = a, 1 = b). */
function nodes(t: T, at: Path = []): { node: T; at: Path }[] {
  const out = [{ node: t, at }]
  if ('a' in t) out.push(...nodes(t.a, [...at, 0]))
  if ('b' in t) out.push(...nodes(t.b, [...at, 1]))
  return out
}
function replace(t: T, at: Path, by: T): T {
  if (!at.length) return by
  const [h, ...rest] = at
  if (h === 0 && 'a' in t) return { ...t, a: replace(t.a, rest, by) } as T
  if (h === 1 && 'b' in t) return { ...t, b: replace(t.b, rest, by) } as T
  return t
}
const pick = <A>(rand: () => number, xs: A[]): A | undefined => xs[Math.floor(rand() * xs.length)]

type Perturbation = 'chain' | 'sign' | 'sincos' | 'coefficient' | 'term' | 'lnFlip'
export const PERTURBATIONS: Perturbation[] = ['chain', 'sign', 'sincos', 'coefficient', 'term', 'lnFlip']

/** One perturbation of the derivative d, or null when d has no place for it. */
export function perturb(d: T, kind: Perturbation, rand: () => number): T | null {
  const all = nodes(d)
  switch (kind) {
    case 'chain': {
      // A product dropped to one of its factors: the chain factor left out.
      const p = pick(rand, all.filter((n) => n.node.k === '*'))
      if (!p || p.node.k !== '*') return null
      return replace(d, p.at, rand() < 0.5 ? p.node.a : p.node.b)
    }
    case 'sign': {
      const p = pick(rand, all.filter((n) => n.node.k === '+' || n.node.k === '-' || n.node.k === 'fn'))
      if (!p) return null
      const n = p.node
      if (n.k === '+') return replace(d, p.at, { k: '-', a: n.a, b: n.b })
      if (n.k === '-') return replace(d, p.at, { k: '+', a: n.a, b: n.b })
      return replace(d, p.at, neg(n))
    }
    case 'sincos': {
      const p = pick(rand, all.filter((n) => n.node.k === 'fn' && (n.node.f === 'sin' || n.node.f === 'cos')))
      if (!p || p.node.k !== 'fn') return null
      return replace(d, p.at, fn(p.node.f === 'sin' ? 'cos' : 'sin', p.node.a))
    }
    case 'coefficient': {
      const p = pick(rand, all.filter((n) => n.node.k === 'n' || n.node.k === 'x'))
      if (!p) return null
      const n = p.node
      return replace(d, p.at, n.k === 'n' ? num(n.v + (rand() < 0.5 ? 1 : -1)) : mul(num(2), X))
    }
    case 'term': {
      const p = pick(rand, all.filter((n) => n.node.k === '+' || n.node.k === '-'))
      if (!p || (p.node.k !== '+' && p.node.k !== '-')) return null
      return replace(d, p.at, rand() < 0.5 ? p.node.a : p.node.b)
    }
    case 'lnFlip': {
      const p = pick(rand, all.filter((n) => n.node.k === '/'))
      if (!p || p.node.k !== '/') return null
      return replace(d, p.at, div(p.node.b, p.node.a))
    }
  }
}

/** One seeded block of the differential; the 2,000 are four blocks, so they run side by side. */
export function differentialBlock(seed: number, n: number): void {
  it(`${n} random expressions (seed ${seed}): right never different, wrong never equal`, () => {
    const rand = seeded(seed)
    let rightEqual = 0
    let wrongTried = 0
    const wrongVerdicts: Record<string, number> = { different: 0, unknown: 0 }
    const byKind: Record<string, number> = {}
    const falseEqual: string[] = []
    const falseDifferent: string[] = []
    let slowest = 0
    for (let i = 0; i < n; i++) {
      const f = randomExpr(rand, int(rand, 1, 3))
      const d = deriv(f)
      const style = int(rand, 0, 5)
      const ft = text(f, style)
      const start = Date.now()
      const v = derivativeCheck(ft, 'x', text(d, style + 1))
      slowest = Math.max(slowest, Date.now() - start)
      if (v === 'equal') rightEqual++
      if (v === 'different') falseDifferent.push(`d/dx ${ft} = ${text(d, style + 1)}`)
      const kind = PERTURBATIONS[i % PERTURBATIONS.length]
      const w = perturb(d, kind, rand)
      if (!w || !clearlyDifferent(w, d, f, rand)) continue
      wrongTried++
      byKind[kind] = (byKind[kind] ?? 0) + 1
      const vw = derivativeCheck(ft, 'x', text(w, style))
      wrongVerdicts[vw === 'equal' ? 'equal' : vw] = (wrongVerdicts[vw] ?? 0) + 1
      if (vw === 'equal') falseEqual.push(`${kind}: d/dx ${ft} ≠ ${text(w, style)}`)
    }
    console.log(`seed ${seed}: right equal ${rightEqual}/${n}; wrong ${wrongTried} (${JSON.stringify(byKind)}) → ${JSON.stringify(wrongVerdicts)}; slowest ${slowest} ms`)
    expect(falseEqual).toEqual([])
    expect(falseDifferent).toEqual([])
    expect(wrongTried).toBeGreaterThan(n * 0.5)
    expect(rightEqual).toBeGreaterThan(n * 0.85)
  }, 600_000)
}

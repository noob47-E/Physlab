// Trig-identity proofs (math/pure/trigIdentity.ts says how they work): the canonical form (a sum of terms, each a coefficient times powers of the six functions of a linear angle, or of bracketed sums), its arithmetic, values and expansion.
// Out of trigIdentity.ts as a pure move (CLEANUP-PLAN.md CW10d).

import { ratio } from './write'

// ---------------------------------------------------------------------------------------------
// The canonical form
// ---------------------------------------------------------------------------------------------

export type Fn = 'sin' | 'cos' | 'tan' | 'cot' | 'sec' | 'csc'
const FN_ORDER: Record<Fn, number> = { sin: 0, cos: 1, tan: 2, cot: 3, sec: 4, csc: 5 }

/** A linear angle: [variable, coefficient] pairs, sorted by variable, no zero coefficients. */
export type Lin = readonly (readonly [string, number])[]

export interface FnBase {
  readonly k: 'f'
  readonly f: Fn
  readonly a: Lin
  readonly key: string
  readonly sort: string
}
export interface SumBase {
  readonly k: 's'
  readonly s: Sum
  readonly key: string
  readonly sort: string
}
type Base = FnBase | SumBase
export interface Factor {
  readonly b: Base
  readonly e: number
}
/** c × Π bᵉ. `key` names the product without its coefficient, so like terms share it. */
export interface Mono {
  readonly c: number
  readonly fs: readonly Factor[]
  readonly key: string
}
/** A sum of terms. Every expression is one of these; a number is a sum of one bare term. */
export interface Sum {
  readonly t: readonly Mono[]
  readonly key: string
}

/**
 * A coefficient tidied of floating-point dust: rounded to 12 significant figures (not to a fixed
 * number of decimal places — 1/65536 rounded to 9 places is 0.000015259, and 65536 times that is
 * 1.000013824, which made a correct step look wrong), and a leftover below 1e-12 is 0.
 */
const clean = (v: number): number => {
  // eslint-disable-next-line no-restricted-syntax -- parked for the owner (OWNER-APPROVALS CW3b-3): an absolute floor, so 10⁻¹³ sin x = 0 is "Proved" (tests/noiseFloors.test.ts)
  if (Math.abs(v) < 1e-12) return 0
  // eslint-disable-next-line no-restricted-syntax -- parked for the owner (OWNER-APPROVALS CW3b-3): 12 figures read 1 + 10⁻¹³ as 1, so that identity is "Proved", and a step writes a typed 0.1234567890123 as 0.123456789012
  return Number(v.toPrecision(12))
}
export const linKey = (a: Lin): string => a.map(([v, c]) => `${c}${v}`).join('+')

export function makeLin(pairs: Iterable<readonly [string, number]>): Lin {
  const m = new Map<string, number>()
  for (const [v, c] of pairs) m.set(v, clean((m.get(v) ?? 0) + c))
  return [...m.entries()].filter(([, c]) => c !== 0).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}
export const linScale = (a: Lin, k: number): Lin => makeLin(a.map(([v, c]) => [v, c * k] as const))
export const linAdd = (a: Lin, b: Lin): Lin => makeLin([...a, ...b])
export const linSub = (a: Lin, b: Lin): Lin => linAdd(a, linScale(b, -1))

const negs = (a: Lin): number => a.filter(([, c]) => c < 0).length
// eslint-disable-next-line no-restricted-syntax -- not shown: `sort` is a key that puts the factors in order
export const fnBase = (f: Fn, a: Lin): FnBase => ({ k: 'f', f, a, key: `${f}(${linKey(a)})`, sort: `0|${negs(a)}|${a.map(([v, c]) => `${v}:${(1000 - c).toFixed(3)}`).join(',')}|${FN_ORDER[f]}` })
export const sumBase = (s: Sum): SumBase => ({ k: 's', s, key: `[${s.key}]`, sort: `1|${s.key}` })
const factorKey = (x: Factor): string => `${x.b.key}^${x.e}`

export function gcd(a: number, b: number): number {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b > 1e-9) [a, b] = [b, a % b]
  return a
}

const ZERO: Sum = { t: [], key: '0' }

/**
 * Factors that cancelled (top against bottom) while the current rewrite was being built, so the
 * step can say so: "Expanded the brackets, then cancelled (1 + cos x)." Read and cleared by
 * `rewrites` at each step.
 */
export const CANCELLED = new Map<string, Base>()

/** Build a canonical term; returns a Sum because a term can vanish (0) but never splits. */
export function mono(c: number, factors: readonly Factor[]): Mono | null {
  c = clean(c)
  if (c === 0) return null
  const acc = new Map<string, { b: Base; e: number }>()
  const queue: Factor[] = [...factors]
  while (queue.length) {
    const x = queue.pop()!
    if (x.e === 0) continue
    if (x.b.k === 's') {
      const s = x.b.s
      if (s.t.length === 0) {
        if (x.e < 0) throw new Error('division by zero')
        return null
      }
      if (s.t.length === 1) {
        // (c·F)ᵉ = cᵉ·Fᵉ: a bracket around a single term is no bracket at all.
        const m = s.t[0]
        c = clean(c * m.c ** x.e)
        for (const y of m.fs) queue.push({ b: y.b, e: y.e * x.e })
        continue
      }
      // A bracketed sum is kept with a positive leading term and no common whole-number
      // factor: 2 − 2 sin x inside a product is written 2(1 − sin x), sin x − 1 is −(1 − sin x).
      let k = s.t[0].c < 0 ? -1 : 1
      if (s.t.every((m) => Number.isInteger(m.c))) k *= s.t.reduce((g, m) => gcd(g, m.c), 0)
      if (k !== 1) {
        const inner = sumOf(s.t.map((m) => ({ ...m, c: m.c / k })))
        c = clean(c * k ** x.e)
        queue.push({ b: sumBase(inner), e: x.e })
        continue
      }
    }
    const key = x.b.key
    const prev = acc.get(key)
    if (prev && Math.sign(prev.e) !== Math.sign(x.e)) CANCELLED.set(key, x.b)
    acc.set(key, { b: x.b, e: (prev?.e ?? 0) + x.e })
  }
  const fs = [...acc.values()].filter((x) => x.e !== 0).sort((p, q) => (p.b.sort < q.b.sort ? -1 : p.b.sort > q.b.sort ? 1 : 0))
  return { c, fs, key: fs.map(factorKey).join('*') }
}

export function sumOf(terms: readonly (Mono | null)[]): Sum {
  const acc = new Map<string, Mono>()
  const flat: (Mono | null)[] = []
  for (const m of terms) {
    if (m && Math.abs(m.c) === 1 && m.fs.length === 1 && m.fs[0].b.k === 's' && m.fs[0].e === 1) {
      for (const t of m.fs[0].b.s.t) flat.push({ ...t, c: t.c * m.c })
    } else flat.push(m)
  }
  for (const m of flat) {
    if (!m) continue
    const prev = acc.get(m.key)
    acc.set(m.key, prev ? { ...m, c: clean(prev.c + m.c) } : m)
  }
  const t = [...acc.values()].filter((m) => m.c !== 0).sort((p, q) => (p.key < q.key ? -1 : p.key > q.key ? 1 : 0))
  return { t, key: t.length === 0 ? '0' : t.map((m) => `${m.c}·${m.key}`).join(' + ') }
}

export const num = (v: number): Sum => sumOf([mono(v, [])])
const asMono = (s: Sum): Mono | null =>
  s.t.length === 0 ? null : s.t.length === 1 ? s.t[0] : mono(1, [{ b: sumBase(s), e: 1 }])
const monoMul = (p: Mono | null, q: Mono | null): Mono | null => (p && q ? mono(p.c * q.c, [...p.fs, ...q.fs]) : null)
export const add = (...xs: Sum[]): Sum => sumOf(xs.flatMap((x) => x.t))
export const mul = (...xs: Sum[]): Sum => sumOf([xs.map(asMono).reduce((p, q) => monoMul(p, q), mono(1, []))])
export const neg = (x: Sum): Sum => mul(num(-1), x)
export const sub = (x: Sum, y: Sum): Sum => add(x, neg(y))
export function pow(x: Sum, n: number): Sum {
  if (n === 0) return num(1)
  const m = asMono(x)
  if (!m) {
    if (n < 0) throw new Error('division by zero')
    return ZERO
  }
  return sumOf([mono(m.c ** n, m.fs.map((y) => ({ b: y.b, e: y.e * n })))])
}
export const div = (x: Sum, y: Sum): Sum => mul(x, pow(y, -1))
export const monoSum = (m: Mono | null): Sum => sumOf([m])

/**
 * f(u) as an expression, with the odd/even rules applied silently so an angle never starts with
 * a minus sign: sin(−u) = −sin u, cos(−u) = cos u. A student does this without calling it a step.
 */
export function fn(f: Fn, a: Lin): Sum {
  if (a.length === 0) {
    const v = evalFn(f, 0)
    if (!Number.isFinite(v)) throw new Error(`${f} 0 is undefined`)
    return num(v)
  }
  // An angle of π alone, cos(π/2) or sin π, is a number when its value is a simple fraction.
  if (a.every(([v]) => v === 'π')) {
    const v = evalFn(f, a[0][1] * Math.PI)
    if (!Number.isFinite(v) || Math.abs(v) > 1e6) throw new Error('division by zero')
    const [p, q] = ratio(v)
    if (Number.isInteger(p) && Math.abs(p / q - v) < 1e-9) return num(p / q)
  }
  if (a[0][1] < 0) {
    const s = f === 'cos' || f === 'sec' ? 1 : -1
    return mul(num(s), fn(f, linScale(a, -1)))
  }
  return sumOf([mono(1, [{ b: fnBase(f, a), e: 1 }])])
}

function evalFn(f: Fn, v: number): number {
  switch (f) {
    case 'sin':
      return Math.sin(v)
    case 'cos':
      return Math.cos(v)
    case 'tan':
      return Math.tan(v)
    case 'cot':
      return 1 / Math.tan(v)
    case 'sec':
      return 1 / Math.cos(v)
    case 'csc':
      return 1 / Math.sin(v)
  }
}

/**
 * The value a check point gives a letter it does not name. Every letter must get a value of its
 * own that moves from point to point: read as 0, the letter y made sin 2y = 2 sin y agree at
 * every point (both sides 0), so a false identity was called true and no rule on y was checked.
 */
function letterValue(name: string, at: Record<string, number>): number {
  const c = name.codePointAt(0) ?? 0
  return 0.15 + ((c * 0.6180339887 + (at.x ?? 0) * 1.4142135623) % 1) * 2.7
}

export function evaluate(s: Sum, at: Record<string, number>): number {
  let total = 0
  for (const m of s.t) {
    let v = m.c
    for (const x of m.fs) {
      const b = x.b.k === 'f' ? evalFn(x.b.f, x.b.a.reduce((acc, [name, c]) => acc + c * (name === 'π' ? Math.PI : (at[name] ?? letterValue(name, at))), 0)) : evaluate(x.b.s, at)
      v *= b ** x.e
    }
    total += v
  }
  return total
}

/** Fully multiply out every bracket on the top (bottoms are left alone). */
export function expand(s: Sum): Sum {
  const out: Sum[] = []
  for (const m of s.t) {
    let acc: Sum = monoSum(mono(m.c, m.fs.filter((x) => !(x.b.k === 's' && x.e > 0))))
    for (const x of m.fs) {
      if (x.b.k !== 's' || x.e <= 0) continue
      const inner = expand(x.b.s)
      for (let i = 0; i < x.e; i++) acc = distribute(acc, inner)
    }
    out.push(acc)
  }
  return add(...out)
}
function distribute(a: Sum, b: Sum): Sum {
  const t: (Mono | null)[] = []
  for (const p of a.t) for (const q of b.t) t.push(monoMul(p, q))
  return sumOf(t)
}

/** A rough size, used to keep the search from wandering into huge expressions. */
export function size(s: Sum): number {
  let n = 0
  for (const m of s.t) {
    n += 1
    for (const x of m.fs) n += x.b.k === 's' ? 1 + size(x.b.s) : 1
  }
  return n
}

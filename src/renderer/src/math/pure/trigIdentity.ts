// Trig-identity proofs, set out the way a textbook sets them out: start from the left-hand side,
// change it one named step at a time, and arrive at the right-hand side.
//
//   LHS = … = RHS, each line with the rule that licensed it, in plain words.
//
// How: both sides are read into a small canonical form (a sum of terms, each a coefficient times
// powers of sin/cos/tan/cot/sec/cosec of a linear angle, or of bracketed sums), and a
// bidirectional breadth-first search looks for a chain of rewrites that joins them — from the
// left forwards and from the right backwards until the two frontiers meet, to a combined depth
// of 6. The rewrites are the ones a student is allowed: tan/cot/sec/cosec ↔ sin/cos, the three
// Pythagorean pairs both ways, double, half and compound angles both ways, sum ↔ product, and
// the algebra — common denominator, split a fraction, take out a common factor, expand brackets,
// multiply top and bottom by the conjugate. The canonical form does the "obvious" tidying a
// student does without calling it a step: collecting like terms, cancelling a factor that is
// on the top and the bottom, sin(−u) = −sin u.
//
// Every rewrite is checked numerically at three points before the search may use it: a rule
// that is wrong throws, loudly, instead of producing a "proof" of something false.
//
// Headless and dependency-free (no mathjs: a tree of our own is quicker to keep honest here).

import { failed, Steps, type Working } from './work'
import { fmtPrecise } from '../format'

// ---------------------------------------------------------------------------------------------
// The canonical form
// ---------------------------------------------------------------------------------------------

export type Fn = 'sin' | 'cos' | 'tan' | 'cot' | 'sec' | 'csc'
const FN_ORDER: Record<Fn, number> = { sin: 0, cos: 1, tan: 2, cot: 3, sec: 4, csc: 5 }

/** A linear angle: [variable, coefficient] pairs, sorted by variable, no zero coefficients. */
export type Lin = readonly (readonly [string, number])[]

interface FnBase {
  readonly k: 'f'
  readonly f: Fn
  readonly a: Lin
  readonly key: string
  readonly sort: string
}
interface SumBase {
  readonly k: 's'
  readonly s: Sum
  readonly key: string
  readonly sort: string
}
type Base = FnBase | SumBase
interface Factor {
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
  if (Math.abs(v) < 1e-12) return 0
  return Number(v.toPrecision(12))
}
const linKey = (a: Lin): string => a.map(([v, c]) => `${c}${v}`).join('+')

function makeLin(pairs: Iterable<readonly [string, number]>): Lin {
  const m = new Map<string, number>()
  for (const [v, c] of pairs) m.set(v, clean((m.get(v) ?? 0) + c))
  return [...m.entries()].filter(([, c]) => c !== 0).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}
const linScale = (a: Lin, k: number): Lin => makeLin(a.map(([v, c]) => [v, c * k] as const))
const linAdd = (a: Lin, b: Lin): Lin => makeLin([...a, ...b])
const linSub = (a: Lin, b: Lin): Lin => linAdd(a, linScale(b, -1))

const negs = (a: Lin): number => a.filter(([, c]) => c < 0).length
const fnBase = (f: Fn, a: Lin): FnBase => ({ k: 'f', f, a, key: `${f}(${linKey(a)})`, sort: `0|${negs(a)}|${a.map(([v, c]) => `${v}:${(1000 - c).toFixed(3)}`).join(',')}|${FN_ORDER[f]}` })
const sumBase = (s: Sum): SumBase => ({ k: 's', s, key: `[${s.key}]`, sort: `1|${s.key}` })
const factorKey = (x: Factor): string => `${x.b.key}^${x.e}`

function gcd(a: number, b: number): number {
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
const CANCELLED = new Map<string, Base>()

/** Build a canonical term; returns a Sum because a term can vanish (0) but never splits. */
function mono(c: number, factors: readonly Factor[]): Mono | null {
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

function sumOf(terms: readonly (Mono | null)[]): Sum {
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
const monoSum = (m: Mono | null): Sum => sumOf([m])

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
function size(s: Sum): number {
  let n = 0
  for (const m of s.t) {
    n += 1
    for (const x of m.fs) n += x.b.k === 's' ? 1 + size(x.b.s) : 1
  }
  return n
}

// ---------------------------------------------------------------------------------------------
// Printing, in a student's notation: sin²x, sin 2x, sin(A + B), cosec x, (1 − sin x)/cos x
// ---------------------------------------------------------------------------------------------

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }
const sup = (n: number): string => String(n).split('').map((d) => SUP[d] ?? d).join('')
const MINUS = '−'

/** A rational p/q for a coefficient that came from halving and doubling (q ≤ 12). */
function ratio(v: number): [number, number] {
  for (let q = 1; q <= 12; q++) {
    const p = Math.round(v * q)
    if (Math.abs(p / q - v) < 1e-9) return [p, q]
  }
  return [v, 1]
}

function linParts(a: Lin): { top: string; topTex: string; den: number; single: boolean } {
  // With π in it, each term is written on its own, in the order given (a positive one first):
  // π/2 − x, x − π/2, 3π/2 + x, cos π.
  if (a.some(([v]) => v === 'π')) {
    const terms = a[0][1] > 0 ? a : [...a.filter(([, c]) => c > 0), ...a.filter(([, c]) => c < 0)]
    let top = ''
    let topTex = ''
    terms.forEach(([v, c], i) => {
      const [p, q] = ratio(Math.abs(c))
      const mag = p === 1 ? '' : String(p)
      const den = q === 1 ? '' : `/${q}`
      const sign = i === 0 ? (c < 0 ? MINUS : '') : c < 0 ? ` ${MINUS} ` : ' + '
      top += `${sign}${mag}${v}${den}`
      topTex += `${sign.replace(MINUS, '-')}${mag}${v === 'π' ? '\\pi' : v === 'θ' ? '\\theta' : v}${den}`
    })
    return { top, topTex, den: 1, single: terms.length === 1 && !top.includes('/') }
  }
  const den = a.reduce((d, [, c]) => {
    const q = ratio(c)[1]
    return (d * q) / gcd(d, q)
  }, 1)
  let top = ''
  let topTex = ''
  a.forEach(([v, c], i) => {
    const k = ratio(c * den)[0]
    const mag = Math.abs(k) === 1 ? '' : String(Math.abs(k))
    const sign = i === 0 ? (k < 0 ? MINUS : '') : k < 0 ? ` ${MINUS} ` : ' + '
    top += `${sign}${mag}${v}`
    topTex += `${i === 0 ? (k < 0 ? '-' : '') : k < 0 ? ' - ' : ' + '}${mag}${v === 'θ' ? '\\theta' : v}`
  })
  return { top, topTex, den, single: a.length === 1 }
}

function fnText(f: Fn, a: Lin, e: number): string {
  const name = f === 'csc' ? 'cosec' : f
  const p = e === 1 ? '' : sup(e)
  const { top, den, single } = linParts(a)
  // sin²x, but sin² 2x: a power runs straight into a letter, not into a number.
  // (An angle typed with a leading minus, sin(−x), keeps its brackets.)
  if (den === 1 && single && !top.startsWith(MINUS)) return p && /^[A-Za-zθ]/.test(top) ? `${name}${p}${top}` : `${name}${p} ${top}`
  const argText = den === 1 ? top : single ? `${top}/${den}` : `(${top})/${den}`
  return `${name}${p}(${argText})`
}
/**
 * An angle with a denominator is set as a fraction, sin(x/2) as a small x over 2 — except above or
 * below a fraction bar, where a second bar would be a fraction inside a fraction
 * (tests/stepTruth.test.ts flags it); there the angle is written on one line, sin(x/2).
 */
function fnTex(f: Fn, a: Lin, e: number, inBar = false): string {
  const name = f === 'csc' ? '\\operatorname{cosec}' : `\\${f}`
  const p = e === 1 ? '' : `^{${e}}`
  const { topTex, den, single } = linParts(a)
  if (den === 1 && single && !topTex.startsWith('-')) return `${name}${p} ${topTex}`
  if (den === 1) return `${name}${p}\\left(${topTex}\\right)`
  if (inBar) return `${name}${p}\\left(${single ? topTex : `(${topTex})`}/${den}\\right)`
  return `${name}${p}\\left(\\frac{${topTex}}{${den}}\\right)`
}

export interface Printed {
  text: string
  tex: string
  /**
   * A bracketed sum to the first power, as TeX without its brackets. A fraction bar already
   * groups what stands above and below it, so a whole denominator in brackets is rough writing
   * (tests/stepTruth.test.ts flags it); alone over a bar the sum goes bare.
   */
  bare?: string
}

function monoParts(m: Mono, inBar: boolean): { num: Printed[]; den: Printed[]; p: number; q: number } {
  const [p, q] = ratio(Math.abs(m.c))
  const numP: Printed[] = []
  const denP: Printed[] = []
  for (const x of m.fs) {
    const e = Math.abs(x.e)
    const into = x.e > 0 ? numP : denP
    if (x.b.k === 'f') into.push({ text: fnText(x.b.f, x.b.a, e), tex: fnTex(x.b.f, x.b.a, e, inBar) })
    else {
      const inner = sumPrint(x.b.s, inBar)
      into.push({
        text: `(${inner.text})${e === 1 ? '' : sup(e)}`,
        tex: `\\left(${inner.tex}\\right)${e === 1 ? '' : `^{${e}}`}`,
        bare: e === 1 ? inner.tex : undefined
      })
    }
  }
  return { num: numP, den: denP, p, q }
}

/** A term without its sign. */
function monoPrint(m: Mono, inBar = false): Printed {
  const bar = inBar || ratio(Math.abs(m.c))[1] !== 1 || m.fs.some((x) => x.e < 0)
  const { num: n, den: d, p, q } = monoParts(m, bar)
  const numText = [p === 1 && n.length ? '' : String(p), ...n.map((x) => x.text)].filter(Boolean)
  const numTex = [p === 1 && n.length ? '' : String(p), ...n.map((x) => x.tex)].filter(Boolean)
  const denText = [q === 1 ? '' : String(q), ...d.map((x) => x.text)].filter(Boolean)
  const denTex = [q === 1 ? '' : String(q), ...d.map((x) => x.tex)].filter(Boolean)
  // Textbook spacing: "2 sin x cos x", but "2(1 + sin x)" and "sin x (1 + cos x)".
  const join = (parts: string[]): string => parts.reduce((acc, s, i) => (i === 0 ? s : /^\d+$/.test(parts[i - 1]) && s.startsWith('(') ? acc + s : `${acc} ${s}`), '')
  const numS = join(numText)
  if (denText.length === 0) return { text: numS, tex: numTex.join(' ') }
  const wrap = (s: string, parts: number): string => (parts > 1 ? `(${s})` : s)
  // Over a bar, a lone bracketed sum loses its brackets: (1 − sin x)/cos x is set as a plain fraction.
  const overBar = (tex: string[], parts: Printed[]): string =>
    tex.length === 1 && parts.length === 1 && parts[0].bare !== undefined ? parts[0].bare : tex.join(' ')
  return {
    text: `${wrap(numS, numText.length)}/${wrap(join(denText), denText.length)}`,
    tex: `\\dfrac{${overBar(numTex, n)}}{${overBar(denTex, d)}}`
  }
}

/** A sum with its positive terms first, so "1 − sin²x" never prints as "−sin²x + 1". */
export function sumPrint(s: Sum, inBar = false): Printed {
  if (s.t.length === 0) return { text: '0', tex: '0' }
  const pk = (m: Mono): string => m.fs.map((x) => `${x.b.sort}^${9 - x.e}`).join(',')
  const byPk = (p: Mono, q: Mono): number => (pk(p) < pk(q) ? -1 : pk(p) > pk(q) ? 1 : 0)
  // A line of only negative terms turns one of them round, the one with the smallest number in
  // front: "−2 cos x (1 − cos²x) − cos x (1 − 2 cos²x)" reads as a textbook writes it,
  // "cos x (2 cos²x − 1) − 2 cos x (1 − cos²x)". A lone term, −(1 − sin x), always turns.
  const oddBracket = (m: Mono): number => m.fs.findIndex((x) => x.b.k === 's' && x.e % 2 !== 0)
  const turnable = s.t.filter((m) => m.c < 0 && oddBracket(m) >= 0)
  const turn = s.t.every((m) => m.c < 0) && turnable.length ? turnable.reduce((a, b) => (Math.abs(b.c) < Math.abs(a.c) ? b : a)) : null
  const shown = s.t.map((m): Mono => {
    const j = oddBracket(m)
    if (m.c >= 0 || j < 0 || (s.t.length > 1 && m !== turn)) return m
    const x = m.fs[j] as { b: SumBase; e: number }
    const flipped = sumOf(x.b.s.t.map((t) => ({ ...t, c: -t.c })))
    return { ...m, c: -m.c, fs: m.fs.map((y, k) => (k === j ? { b: sumBase(flipped), e: y.e } : y)) }
  })
  const ordered = [...shown.filter((m) => m.c > 0).sort(byPk), ...shown.filter((m) => m.c < 0).sort(byPk)]
  let text = ''
  let tex = ''
  ordered.forEach((m, i) => {
    const pm = monoPrint(m, inBar)
    if (i === 0) {
      text = (m.c < 0 ? MINUS : '') + pm.text
      tex = (m.c < 0 ? '-' : '') + pm.tex
    } else {
      text += m.c < 0 ? ` ${MINUS} ${pm.text}` : ` + ${pm.text}`
      tex += m.c < 0 ? ` - ${pm.tex}` : ` + ${pm.tex}`
    }
  })
  return { text, tex }
}

// ---------------------------------------------------------------------------------------------
// Reading the student's text
// ---------------------------------------------------------------------------------------------

type Raw =
  | { k: 'num'; v: number }
  | { k: 'var'; n: string }
  | { k: 'fn'; f: Fn; p: number; a: Raw }
  | { k: 'add'; a: Raw; b: Raw }
  | { k: 'sub'; a: Raw; b: Raw }
  | { k: 'mul'; a: Raw; b: Raw }
  | { k: 'div'; a: Raw; b: Raw }
  | { k: 'neg'; a: Raw }
  | { k: 'pow'; a: Raw; n: number }

const FN_NAMES: [string, Fn][] = [
  ['cosec', 'csc'],
  ['sin', 'sin'],
  ['cos', 'cos'],
  ['tan', 'tan'],
  ['cot', 'cot'],
  ['sec', 'sec'],
  ['csc', 'csc']
]

type Tok = { t: 'num'; v: number } | { t: 'fn'; f: Fn } | { t: 'var'; n: string } | { t: 'op'; o: string }

function tokenize(src: string): Tok[] {
  const s = src
    .replace(/[−–]/g, '-')
    .replace(/[·×]/g, '*')
    .replace(/[²³⁴]/g, (c) => `^${'²³⁴'.indexOf(c) + 2}`)
    // The expression parser spells θ out as "theta", and a student typing in the bar may too.
    .replace(/theta/gi, 'θ')
    // π in an angle, sin(π/2 − x): typed as pi or π, or sent as π by latexToMath.
    .replace(/pi/gi, 'π')
  const out: Tok[] = []
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    const numM = /^\d+(\.\d+)?/.exec(s.slice(i))
    if (numM) {
      out.push({ t: 'num', v: Number(numM[0]) })
      i += numM[0].length
      continue
    }
    const named = FN_NAMES.find(([w]) => s.slice(i, i + w.length).toLowerCase() === w)
    if (named) {
      out.push({ t: 'fn', f: named[1] })
      i += named[0].length
      continue
    }
    if (/[A-Za-zθπ]/.test(ch)) {
      out.push({ t: 'var', n: ch })
      i++
      continue
    }
    if ('+-*/^()'.includes(ch)) {
      out.push({ t: 'op', o: ch })
      i++
      continue
    }
    throw new Error(`PhysLab cannot read “${ch}” in an identity.`)
  }
  return out
}

class Parser {
  i = 0
  constructor(readonly toks: Tok[]) {}
  peek(): Tok | undefined {
    return this.toks[this.i]
  }
  isOp(o: string): boolean {
    const t = this.peek()
    return !!t && t.t === 'op' && t.o === o
  }
  eat(o: string): void {
    if (!this.isOp(o)) throw new Error(`Expected “${o}”.`)
    this.i++
  }
  sum(): Raw {
    let a = this.term()
    while (this.isOp('+') || this.isOp('-')) {
      const o = (this.peek() as { o: string }).o
      this.i++
      const b = this.term()
      a = o === '+' ? { k: 'add', a, b } : { k: 'sub', a, b }
    }
    return a
  }
  startsPrimary(): boolean {
    const t = this.peek()
    return !!t && (t.t === 'num' || t.t === 'fn' || t.t === 'var' || (t.t === 'op' && t.o === '('))
  }
  term(): Raw {
    let a = this.unary()
    for (;;) {
      if (this.isOp('*')) {
        this.i++
        a = { k: 'mul', a, b: this.unary() }
      } else if (this.isOp('/')) {
        this.i++
        a = { k: 'div', a, b: this.unary() }
      } else if (this.startsPrimary()) a = { k: 'mul', a, b: this.power() }
      else return a
    }
  }
  unary(): Raw {
    if (this.isOp('-')) {
      this.i++
      return { k: 'neg', a: this.unary() }
    }
    if (this.isOp('+')) {
      this.i++
      return this.unary()
    }
    return this.power()
  }
  exponent(): number {
    // The Working field's LaTeX reaches here through latexToMath as sin(x)^(2): a bracketed power.
    if (this.isOp('(')) {
      this.i++
      const n = this.exponent()
      this.eat(')')
      return n
    }
    let sign = 1
    if (this.isOp('-')) {
      sign = -1
      this.i++
    }
    const t = this.peek()
    if (!t || t.t !== 'num' || !Number.isInteger(t.v)) throw new Error('A power in an identity must be a whole number.')
    this.i++
    return sign * t.v
  }
  power(): Raw {
    const a = this.primary()
    if (this.isOp('^')) {
      this.i++
      return { k: 'pow', a, n: this.exponent() }
    }
    return a
  }
  primary(): Raw {
    const t = this.peek()
    if (!t) throw new Error('The identity ends too early.')
    if (t.t === 'num') {
      this.i++
      return { k: 'num', v: t.v }
    }
    if (t.t === 'var') {
      this.i++
      return { k: 'var', n: t.n }
    }
    if (t.t === 'op' && t.o === '(') {
      this.i++
      const e = this.sum()
      this.eat(')')
      return e
    }
    if (t.t === 'fn') {
      this.i++
      let p = 1
      if (this.isOp('^')) {
        this.i++
        p = this.exponent()
      }
      let a: Raw
      if (this.isOp('(')) {
        this.i++
        a = this.sum()
        this.eat(')')
      } else {
        // "sin 2x", "sin x", "sin θ": a number and/or one letter, nothing more.
        const n = this.peek()
        let coef: Raw | null = null
        if (n && n.t === 'num') {
          this.i++
          coef = { k: 'num', v: n.v }
        }
        const v = this.peek()
        if (!v || v.t !== 'var') throw new Error('A trig function needs an angle, like sin x or sin(2x).')
        this.i++
        a = coef ? { k: 'mul', a: coef, b: { k: 'var', n: v.n } } : { k: 'var', n: v.n }
      }
      return { k: 'fn', f: t.f, p, a }
    }
    throw new Error(`PhysLab did not expect “${t.t === 'op' ? t.o : '?'}” there.`)
  }
}

function toLin(r: Raw): Lin {
  switch (r.k) {
    case 'num':
      if (r.v !== 0) throw new Error('PhysLab cannot yet work with a plain number inside an angle, such as 90 in sin(90 − x): write the angle with π, like sin(π/2 − x).')
      return []
    case 'var':
      return makeLin([[r.n, 1]])
    case 'add':
      return linAdd(toLin(r.a), toLin(r.b))
    case 'sub':
      return linSub(toLin(r.a), toLin(r.b))
    case 'neg':
      return linScale(toLin(r.a), -1)
    case 'mul': {
      const k = constOf(r.a) ?? constOf(r.b)
      const other = constOf(r.a) !== null ? r.b : r.a
      if (k === null) throw new Error('An angle must be a simple multiple, like 2x or (A + B)/2.')
      return linScale(toLin(other), k)
    }
    case 'div': {
      const k = constOf(r.b)
      if (k === null || k === 0) throw new Error('An angle can only be divided by a number, like x/2.')
      return linScale(toLin(r.a), 1 / k)
    }
    default:
      throw new Error('An angle must be a simple multiple, like 2x or (A + B)/2.')
  }
}
function constOf(r: Raw): number | null {
  if (r.k === 'num') return r.v
  if (r.k === 'neg') {
    const v = constOf(r.a)
    return v === null ? null : -v
  }
  return null
}

function toSum(r: Raw): Sum {
  switch (r.k) {
    case 'num':
      return num(r.v)
    case 'var':
      throw new Error(`${r.n} on its own is not a trig expression — PhysLab proves identities in sin, cos, tan, cot, sec and cosec.`)
    case 'fn':
      return pow(fn(r.f, toLin(r.a)), r.p)
    case 'add':
      return add(toSum(r.a), toSum(r.b))
    case 'sub':
      return sub(toSum(r.a), toSum(r.b))
    case 'mul':
      return mul(toSum(r.a), toSum(r.b))
    case 'div':
      return div(toSum(r.a), toSum(r.b))
    case 'neg':
      return neg(toSum(r.a))
    case 'pow':
      return pow(toSum(r.a), r.n)
  }
}

/**
 * A side printed the way the student typed it: their order of terms and factors, their brackets
 * with their signs. The canonical Sum sorts terms and turns a bracket's leading term positive, so
 * (sin 5x − sin x)(cos 4x − cos 6x) would come back as (cos 6x − cos 4x) (sin x − sin 5x); the
 * title, the field and the first and last lines of a proof show the student's own writing instead.
 */
type Shown = Printed & { k: 'atom' | 'pow' | 'mul' | 'div' | 'sum' | 'neg' }
const supSigned = (n: number): string => (n < 0 ? '⁻' : '') + sup(Math.abs(n))

/** An angle's terms in the order they were typed: sin(π/2 − x), sin(B + A). */
function typedLin(r: Raw): Lin {
  const parts: (readonly [string, number])[] = []
  const walk = (x: Raw, s: number): void => {
    if (x.k === 'add' || x.k === 'sub') {
      walk(x.a, s)
      walk(x.b, x.k === 'sub' ? -s : s)
    } else parts.push(...linScale(toLin(x), s))
  }
  walk(r, 1)
  // A letter typed twice (x + x) is collected, in the usual order.
  return new Set(parts.map(([v]) => v)).size === parts.length && parts.length > 0 ? parts : toLin(r)
}

function rawPrint(r: Raw, inBar = false): Shown {
  switch (r.k) {
    case 'num':
      return { text: String(r.v), tex: String(r.v), k: 'atom' }
    case 'var':
      return { text: r.n, tex: r.n === 'θ' ? '\\theta' : r.n === 'π' ? '\\pi' : r.n, k: 'atom' }
    case 'fn': {
      const a = typedLin(r.a)
      if (r.p < 0) return rawPrint({ k: 'pow', a: { ...r, p: 1 }, n: r.p }, inBar)
      return { text: fnText(r.f, a, r.p), tex: fnTex(r.f, a, r.p, inBar), k: 'atom' }
    }
    case 'pow': {
      // (sin x)² is sin²x; a negative power stays on a bracket, never sin⁻¹x (which reads as arcsin).
      if (r.a.k === 'fn' && r.a.p > 0 && r.n > 0) return rawPrint({ ...r.a, p: r.a.p * r.n }, inBar)
      const a = rawPrint(r.a, inBar)
      if (r.a.k === 'num') return { text: `${a.text}${supSigned(r.n)}`, tex: `${a.tex}^{${r.n}}`, k: 'pow' }
      return { text: `(${a.text})${supSigned(r.n)}`, tex: `\\left(${a.tex}\\right)^{${r.n}}`, k: 'pow' }
    }
    case 'neg': {
      const a = rawPrint(r.a, inBar)
      const w = a.k === 'sum' || a.k === 'neg'
      return { text: w ? `${MINUS}(${a.text})` : `${MINUS}${a.text}`, tex: w ? `-\\left(${a.tex}\\right)` : `-${a.tex}`, k: 'neg' }
    }
    case 'add':
    case 'sub': {
      const a = rawPrint(r.a, inBar)
      const b = rawPrint(r.b, inBar)
      const w = b.k === 'neg' || (r.k === 'sub' && b.k === 'sum')
      const bt = w ? `(${b.text})` : b.text
      const bx = w ? `\\left(${b.tex}\\right)` : b.tex
      return r.k === 'add'
        ? { text: `${a.text} + ${bt}`, tex: `${a.tex} + ${bx}`, k: 'sum' }
        : { text: `${a.text} ${MINUS} ${bt}`, tex: `${a.tex} - ${bx}`, k: 'sum' }
    }
    case 'mul': {
      const a = rawPrint(r.a, inBar)
      const b = rawPrint(r.b, inBar)
      const at = a.k === 'sum' || a.k === 'div' ? `(${a.text})` : a.text
      const ax = a.k === 'sum' ? `\\left(${a.tex}\\right)` : a.tex
      const bw = b.k === 'sum' || b.k === 'neg' || b.k === 'div'
      const bt = bw ? `(${b.text})` : b.text
      const bx = b.k === 'sum' || b.k === 'neg' ? `\\left(${b.tex}\\right)` : b.tex
      // Textbook spacing: "2 sin x", "2(1 + sin x)", "sin x (1 + cos x)"; two numbers take a ×.
      if (/^\d/.test(bt)) return { text: `${at} × ${bt}`, tex: `${ax} \\times ${bx}`, k: 'mul' }
      return { text: /\d$/.test(at) && bt.startsWith('(') ? `${at}${bt}` : `${at} ${bt}`, tex: `${ax} ${bx}`, k: 'mul' }
    }
    case 'div': {
      const a = rawPrint(r.a, true)
      const b = rawPrint(r.b, true)
      const wrap = (x: Shown): string => (x.k === 'atom' || x.k === 'pow' ? x.text : `(${x.text})`)
      return { text: `${wrap(a)}/${wrap(b)}`, tex: `\\dfrac{${a.tex}}{${b.tex}}`, k: 'div' }
    }
  }
}

function readSide(text: string): { sum: Sum; shown: Printed } {
  const p = new Parser(tokenize(text))
  const r = p.sum()
  if (p.i < p.toks.length) throw new Error('PhysLab could not read the whole of that side.')
  const sum = toSum(r)
  const { text: t, tex } = rawPrint(r)
  return { sum, shown: { text: t, tex } }
}

/** Read one side of an identity ("(1 − cos 2x)/sin 2x", "sec²x − tan²x"). Throws a sentence. */
export function parseSide(text: string): Sum {
  return readSide(text).sum
}

/** Read "LHS = RHS"; `lhsShown` and `rhsShown` are the two sides as the student wrote them. */
export function parseIdentity(text: string): { lhs: Sum; rhs: Sum; lhsText: string; rhsText: string; lhsShown: Printed; rhsShown: Printed } {
  const parts = text.split('=')
  if (parts.length !== 2) throw new Error('Type an identity with one “=”, like sin 2x = 2 sin x cos x.')
  const l = readSide(parts[0])
  const r = readSide(parts[1])
  return { lhs: l.sum, rhs: r.sum, lhsText: parts[0].trim(), rhsText: parts[1].trim(), lhsShown: l.shown, rhsShown: r.shown }
}

// ---------------------------------------------------------------------------------------------
// The rewrites
// ---------------------------------------------------------------------------------------------

/** One step: the new expression, what was done in words (forwards and read backwards), a chip. */
export interface Rewrite {
  s: Sum
  /** Past tense, what the step did going left to right. */
  fwd: string
  /** The same step read the other way (the backward search's steps are printed reversed). */
  rev: string
  /** The formula used, in LaTeX, for the chip beside the step. */
  chip: string
  /** A short rule id, for tests and statistics. */
  id: string
}

const T = (a: Lin): string => {
  const { top, den, single } = linParts(a)
  if (den === 1 && single) return top
  return den === 1 ? `(${top})` : single ? `(${top}/${den})` : `((${top})/${den})`
}
const fnS = (f: Fn, a: Lin, e = 1): string => (e === 1 ? fnText(f, a, 1) : fnText(f, a, e))

type Emit = (s: Sum, fwd: string, rev: string, chip: string, id: string) => void

// --- whole-expression substitutions: every f(u)ᵉ that matches is replaced at once -------------

function mapFactors(s: Sum, rep: (b: FnBase, e: number) => Sum | null): { s: Sum; changed: boolean } {
  let changed = false
  const terms: Sum[] = []
  for (const m of s.t) {
    let acc = num(m.c)
    for (const x of m.fs) {
      if (x.b.k === 'f') {
        const r = rep(x.b, x.e)
        if (r) {
          changed = true
          acc = mul(acc, r)
          continue
        }
        acc = mul(acc, pow(sumOf([mono(1, [{ b: x.b, e: 1 }])]), x.e))
      } else {
        const inner = mapFactors(x.b.s, rep)
        if (inner.changed) changed = true
        acc = mul(acc, pow(inner.s, x.e))
      }
    }
    terms.push(acc)
  }
  return { s: add(...terms), changed }
}

/** Every distinct f(u) that occurs, with its highest positive and lowest negative power. */
function fnSites(s: Sum, out = new Map<string, { f: Fn; a: Lin; maxE: number; minE: number }>()) {
  for (const m of s.t)
    for (const x of m.fs) {
      if (x.b.k === 'f') {
        const prev = out.get(x.b.key)
        out.set(x.b.key, { f: x.b.f, a: x.b.a, maxE: Math.max(prev?.maxE ?? 0, x.e), minE: Math.min(prev?.minE ?? 0, x.e) })
      } else fnSites(x.b.s, out)
    }
  return out
}

const RECIP: Partial<Record<Fn, (a: Lin) => Sum>> = {
  tan: (a) => div(fn('sin', a), fn('cos', a)),
  cot: (a) => div(fn('cos', a), fn('sin', a)),
  sec: (a) => div(num(1), fn('cos', a)),
  csc: (a) => div(num(1), fn('sin', a))
}
const RECIP_WORDS: Partial<Record<Fn, (a: Lin) => string>> = {
  tan: (a) => `sin ${T(a)}/cos ${T(a)}`,
  cot: (a) => `cos ${T(a)}/sin ${T(a)}`,
  sec: (a) => `1/cos ${T(a)}`,
  csc: (a) => `1/sin ${T(a)}`
}
const RECIP_CHIP: Partial<Record<Fn, string>> = {
  tan: '\\tan\\theta = \\dfrac{\\sin\\theta}{\\cos\\theta}',
  cot: '\\cot\\theta = \\dfrac{\\cos\\theta}{\\sin\\theta}',
  sec: '\\sec\\theta = \\dfrac{1}{\\cos\\theta}',
  csc: '\\operatorname{cosec}\\theta = \\dfrac{1}{\\sin\\theta}'
}

/** The three forms of cos 2θ, in the order the double-angle rule tries them. */
const DOUBLE_COS_CHIP = ['\\cos 2\\theta = \\cos^2\\theta - \\sin^2\\theta', '\\cos 2\\theta = 2\\cos^2\\theta - 1', '\\cos 2\\theta = 1 - 2\\sin^2\\theta']

/** The chip for "Wrote the sines and cosines as cosec x and sec x.": every function it made. */
function madeChip(names: string[]): string {
  const fns: Fn[] = (['tan', 'cot', 'sec', 'csc'] as Fn[]).filter((f) => names.some((n) => n.startsWith(f === 'csc' ? 'cosec' : f)))
  return fns.map((f) => RECIP_CHIP[f]!).join(',\\ ')
}

function globalRules(s: Sum, targets: Set<string>, emit: Emit): void {
  const sites = [...fnSites(s).values()]

  // tan/cot/sec/cosec → sin, cos: each one on its own, and all of them at once.
  const recip = sites.filter((x) => RECIP[x.f])
  for (const x of recip) {
    const r = mapFactors(s, (b, e) => (b.f === x.f && linKey(b.a) === linKey(x.a) ? pow(RECIP[b.f]!(b.a), e) : null))
    emit(r.s, `Wrote ${fnS(x.f, x.a)} as ${RECIP_WORDS[x.f]!(x.a)}.`, `Wrote ${RECIP_WORDS[x.f]!(x.a)} as ${fnS(x.f, x.a)}.`, RECIP_CHIP[x.f]!, 'to-sincos')
  }
  if (recip.length > 1) {
    const r = mapFactors(s, (b, e) => (RECIP[b.f] ? pow(RECIP[b.f]!(b.a), e) : null))
    emit(r.s, 'Wrote everything in terms of sin and cos.', `Wrote the sines and cosines as ${recip.map((x) => fnS(x.f, x.a)).join(' and ')}.`, madeChip(recip.map((x) => fnS(x.f, x.a))), 'to-sincos')
  }

  // sin, cos → tan, cot, sec, cosec, term by term (sin²x/cos x → sin x tan x).
  {
    let made: string[] = []
    const terms = s.t.map((m) => {
      const r = fromSinCos(m)
      if (r.made.length) made = [...made, ...r.made]
      return r.s
    })
    if (made.length) {
      const names = [...new Set(made)]
      emit(add(...terms), `Wrote the sines and cosines as ${names.join(' and ')}.`, `Wrote ${names.join(' and ')} in terms of sin and cos.`, madeChip(names), 'from-sincos')
    }
  }

  for (const x of sites) {
    const u = x.a
    // Pythagorean replacements of a square: sin²u = 1 − cos²u and the like.
    const PY: [Fn, Fn, number, string, string][] = [
      ['sin', 'cos', -1, `sin²${T(u)} = 1 − cos²${T(u)}`, '\\sin^2\\theta = 1 - \\cos^2\\theta'],
      ['cos', 'sin', -1, `cos²${T(u)} = 1 − sin²${T(u)}`, '\\cos^2\\theta = 1 - \\sin^2\\theta'],
      ['sec', 'tan', 1, `sec²${T(u)} = 1 + tan²${T(u)}`, '\\sec^2\\theta = 1 + \\tan^2\\theta'],
      ['csc', 'cot', 1, `cosec²${T(u)} = 1 + cot²${T(u)}`, '\\operatorname{cosec}^2\\theta = 1 + \\cot^2\\theta'],
      ['tan', 'sec', 1, `tan²${T(u)} = sec²${T(u)} − 1`, '\\tan^2\\theta = \\sec^2\\theta - 1'],
      ['cot', 'csc', 1, `cot²${T(u)} = cosec²${T(u)} − 1`, '\\cot^2\\theta = \\operatorname{cosec}^2\\theta - 1']
    ]
    for (const [f, g, sign, words, chip] of PY) {
      if (x.f !== f || (x.maxE < 2 && x.minE > -2)) continue
      const other = pow(fn(g, u), 2)
      const repl = f === 'tan' || f === 'cot' ? sub(other, num(1)) : sign < 0 ? sub(num(1), other) : add(num(1), other)
      const r = mapFactors(s, (b, e) =>
        b.f === f && linKey(b.a) === linKey(u) && Math.abs(e) >= 2 ? mul(pow(fn(f, u), e - 2 * Math.sign(e)), pow(repl, Math.sign(e))) : null
      )
      if (r.changed) emit(r.s, `Used ${words}.`, `Used ${words.split(' = ').reverse().join(' = ')}.`, chip, 'pythag-sub')
    }

    // Double angle, forwards: f(2u) in terms of u. Allowed when u is a whole multiple, or when
    // u itself appears on the other side (the half-angle case: cos x in terms of x/2).
    if (x.f === 'sin' || x.f === 'cos' || x.f === 'tan') {
      const half = linScale(u, 0.5)
      const whole = half.every(([, c]) => Number.isInteger(c))
      if (whole || targets.has(linKey(half))) {
        const h = T(half)
        const forms: [Sum, string, string][] =
          x.f === 'sin'
            ? [[mul(num(2), fn('sin', half), fn('cos', half)), `sin ${T(u)} = 2 sin ${h} cos ${h}`, '\\sin 2\\theta = 2\\sin\\theta\\cos\\theta']]
            : x.f === 'cos'
              ? [
                  [sub(pow(fn('cos', half), 2), pow(fn('sin', half), 2)), `cos ${T(u)} = cos²${h} − sin²${h}`, '\\cos 2\\theta = \\cos^2\\theta - \\sin^2\\theta'],
                  [sub(mul(num(2), pow(fn('cos', half), 2)), num(1)), `cos ${T(u)} = 2 cos²${h} − 1`, '\\cos 2\\theta = 2\\cos^2\\theta - 1'],
                  [sub(num(1), mul(num(2), pow(fn('sin', half), 2))), `cos ${T(u)} = 1 − 2 sin²${h}`, '\\cos 2\\theta = 1 - 2\\sin^2\\theta']
                ]
              : [[div(mul(num(2), fn('tan', half)), sub(num(1), pow(fn('tan', half), 2))), `tan ${T(u)} = 2 tan ${h}/(1 − tan²${h})`, '\\tan 2\\theta = \\dfrac{2\\tan\\theta}{1 - \\tan^2\\theta}']]
        for (const [rep, words, chip] of forms) {
          const r = mapFactors(s, (b, e) => (b.f === x.f && linKey(b.a) === linKey(u) ? pow(rep, e) : null))
          const kind = whole ? 'double angle' : 'half angle'
          emit(r.s, `Used the ${kind} formula ${words}.`, `Used the ${kind} formula ${words.split(' = ').reverse().join(' = ')}.`, chip, whole ? 'double-expand' : 'half-expand')
        }
      }
    }

    // Compound angle, forwards: sin(A + B), cos(A − B), tan(A + B); and cos 3x as cos(2x + x).
    if (x.f === 'sin' || x.f === 'cos' || x.f === 'tan') {
      let P: Lin | null = null
      let Q: Lin | null = null
      if (u.length >= 2) {
        P = [u[0]]
        Q = u.slice(1)
      } else if (u.length === 1 && Number.isInteger(u[0][1]) && Math.abs(u[0][1]) >= 3) {
        const [v, c] = u[0]
        P = makeLin([[v, c - Math.sign(c)]])
        Q = makeLin([[v, Math.sign(c)]])
      }
      if (P && Q) {
        const rep =
          x.f === 'sin'
            ? add(mul(fn('sin', P), fn('cos', Q)), mul(fn('cos', P), fn('sin', Q)))
            : x.f === 'cos'
              ? sub(mul(fn('cos', P), fn('cos', Q)), mul(fn('sin', P), fn('sin', Q)))
              : div(add(fn('tan', P), fn('tan', Q)), sub(num(1), mul(fn('tan', P), fn('tan', Q))))
        const r = mapFactors(s, (b, e) => (b.f === x.f && linKey(b.a) === linKey(u) ? pow(rep, e) : null))
        const shown = u.length >= 2 ? fnS(x.f, u) : `${x.f}(${T(P)} + ${T(Q)})`
        const neg = Q[0][1] < 0
        const q = neg ? linScale(Q, -1) : Q
        const F = (g: Fn, a: Lin): string => fnText(g, a, 1)
        const pm = (plus: boolean): string => (plus ? '+' : '−')
        const book =
          x.f === 'sin'
            ? `${F('sin', P)} ${F('cos', q)} ${pm(!neg)} ${F('cos', P)} ${F('sin', q)}`
            : x.f === 'cos'
              ? `${F('cos', P)} ${F('cos', q)} ${pm(neg)} ${F('sin', P)} ${F('sin', q)}`
              : `(${F('tan', P)} ${pm(!neg)} ${F('tan', q)})/(1 ${pm(neg)} ${F('tan', P)} ${F('tan', q)})`
        const words = `${shown} = ${book}`
        // cos(A − B) is shown its own formula, with the plus sign, not the one for cos(A + B).
        const chip = neg
          ? x.f === 'sin'
            ? '\\sin(A - B) = \\sin A\\cos B - \\cos A\\sin B'
            : x.f === 'cos'
              ? '\\cos(A - B) = \\cos A\\cos B + \\sin A\\sin B'
              : '\\tan(A - B) = \\dfrac{\\tan A - \\tan B}{1 + \\tan A\\tan B}'
          : x.f === 'sin'
            ? '\\sin(A + B) = \\sin A\\cos B + \\cos A\\sin B'
            : x.f === 'cos'
              ? '\\cos(A + B) = \\cos A\\cos B - \\sin A\\sin B'
              : '\\tan(A + B) = \\dfrac{\\tan A + \\tan B}{1 - \\tan A\\tan B}'
        emit(r.s, `Used the compound angle formula ${words}.`, `Used the compound angle formula ${words.split(' = ').reverse().join(' = ')}.`, chip, 'compound-expand')
      }
    }
  }

  // All double angles at once (cos 2x cos x − sin 2x sin x has two), one variant per cos form.
  const doubles = sites.filter((x) => (x.f === 'sin' || x.f === 'cos') && linScale(x.a, 0.5).every(([, c]) => Number.isInteger(c)))
  if (doubles.length > 1)
    for (const form of [0, 1, 2]) {
      const used = new Set<string>()
      const r = mapFactors(s, (b, e) => {
        if (!(b.f === 'sin' || b.f === 'cos')) return null
        const h = linScale(b.a, 0.5)
        if (!h.every(([, c]) => Number.isInteger(c))) return null
        const H = T(h)
        used.add(
          b.f === 'sin'
            ? `sin ${T(b.a)} = 2 sin ${H} cos ${H}`
            : form === 0
              ? `cos ${T(b.a)} = cos²${H} − sin²${H}`
              : form === 1
                ? `cos ${T(b.a)} = 2 cos²${H} − 1`
                : `cos ${T(b.a)} = 1 − 2 sin²${H}`
        )
        const rep =
          b.f === 'sin'
            ? mul(num(2), fn('sin', h), fn('cos', h))
            : form === 0
              ? sub(pow(fn('cos', h), 2), pow(fn('sin', h), 2))
              : form === 1
                ? sub(mul(num(2), pow(fn('cos', h), 2)), num(1))
                : sub(num(1), mul(num(2), pow(fn('sin', h), 2)))
        return pow(rep, e)
      })
      const list = [...used]
      // The chip shows each formula used, in the form used: sin²A − sin²B = (cos 2B − cos 2A)/2
      // went through cos 2θ = 1 − 2 sin²θ, and used to be shown sin 2θ = 2 sin θ cos θ.
      const chips = [
        list.some((w) => w.startsWith('sin')) ? '\\sin 2\\theta = 2\\sin\\theta\\cos\\theta' : '',
        list.some((w) => w.startsWith('cos')) ? DOUBLE_COS_CHIP[form] : ''
      ].filter(Boolean)
      emit(r.s, `Used the double angle formulas ${list.join(' and ')}.`, `Used the double angle formulas ${list.map(reverseWords).join(' and ')}.`, chips.join(',\\ '), 'double-expand')
    }
}

/** One term's sines and cosines of the same angle turned into tan, cot, sec, cosec. */
function fromSinCos(m: Mono): { s: Sum; made: string[] } {
  const made: string[] = []
  const byArg = new Map<string, { a: Lin; sin: number; cos: number }>()
  const rest: Factor[] = []
  for (const x of m.fs) {
    if (x.b.k === 'f' && (x.b.f === 'sin' || x.b.f === 'cos')) {
      const k = linKey(x.b.a)
      const g = byArg.get(k) ?? { a: x.b.a, sin: 0, cos: 0 }
      g[x.b.f] += x.e
      byArg.set(k, g)
    } else rest.push(x)
  }
  let acc = monoSum(mono(m.c, rest))
  for (const g of byArg.values()) {
    let { sin, cos } = g
    if (sin > 0 && cos < 0) {
      const k = Math.min(sin, -cos)
      acc = mul(acc, pow(fn('tan', g.a), k))
      made.push(`tan ${T(g.a)}`)
      sin -= k
      cos += k
    } else if (cos > 0 && sin < 0) {
      const k = Math.min(cos, -sin)
      acc = mul(acc, pow(fn('cot', g.a), k))
      made.push(`cot ${T(g.a)}`)
      sin += k
      cos -= k
    }
    if (sin < 0) {
      acc = mul(acc, pow(fn('csc', g.a), -sin))
      made.push(`cosec ${T(g.a)}`)
      sin = 0
    }
    if (cos < 0) {
      acc = mul(acc, pow(fn('sec', g.a), -cos))
      made.push(`sec ${T(g.a)}`)
      cos = 0
    }
    acc = mul(acc, pow(fn('sin', g.a), sin), pow(fn('cos', g.a), cos))
  }
  return { s: acc, made }
}

// --- rules inside one sum: pairs of terms, common denominator, factor, expand -----------------

interface Decomp {
  /** The pattern: '1', or fn names with their angles. */
  pat: string
  fns: { f: Fn; a: Lin }[]
  rest: Mono
}

function withoutPowers(m: Mono, take: { key: string; e: number }[]): Mono | null {
  const fs: Factor[] = []
  const need = new Map(take.map((t) => [t.key, t.e]))
  for (const x of m.fs) {
    const n = need.get(x.b.key)
    if (n !== undefined) {
      if (x.e < n) return null
      if (x.e - n !== 0) fs.push({ b: x.b, e: x.e - n })
      need.delete(x.b.key)
    } else fs.push(x)
  }
  if (need.size) return null
  return mono(m.c, fs)
}

function squares(m: Mono): Decomp[] {
  const out: Decomp[] = [{ pat: '1', fns: [], rest: m }]
  for (const x of m.fs)
    if (x.b.k === 'f' && x.e >= 2) {
      const rest = withoutPowers(m, [{ key: x.b.key, e: 2 }])
      if (rest) out.push({ pat: `${x.b.f}²`, fns: [{ f: x.b.f, a: x.b.a }], rest })
    }
  return out
}
function singles(m: Mono): Decomp[] {
  const out: Decomp[] = []
  for (const x of m.fs)
    if (x.b.k === 'f' && (x.b.f === 'sin' || x.b.f === 'cos') && x.e >= 1) {
      const rest = withoutPowers(m, [{ key: x.b.key, e: 1 }])
      if (rest) out.push({ pat: x.b.f, fns: [{ f: x.b.f, a: x.b.a }], rest })
    }
  return out
}
function pairs(m: Mono): Decomp[] {
  const out: Decomp[] = []
  const trig = m.fs.filter((x) => x.b.k === 'f' && (x.b.f === 'sin' || x.b.f === 'cos') && x.e >= 1) as (Factor & { b: FnBase })[]
  for (const p of trig)
    for (const q of trig) {
      if (p === q || linKey(p.b.a) === linKey(q.b.a)) continue
      const rest = withoutPowers(m, [
        { key: p.b.key, e: 1 },
        { key: q.b.key, e: 1 }
      ])
      if (rest) out.push({ pat: `${p.b.f}·${q.b.f}`, fns: [{ f: p.b.f, a: p.b.a }, { f: q.b.f, a: q.b.a }], rest })
    }
  return out
}

/** Pythagorean and double-angle pairs, read as (pattern i, pattern j, ratio cⱼ/cᵢ) → result. */
const SQUARE_PAIRS: { i: string; j: string; r: number; out: (u: Lin) => Sum; k: number; words: (u: Lin) => string; chip: string; id: string }[] = [
  { i: 'sin²', j: 'cos²', r: 1, out: () => num(1), k: 1, words: (u) => `sin²${T(u)} + cos²${T(u)} = 1`, chip: '\\sin^2\\theta + \\cos^2\\theta = 1', id: 'pythag' },
  { i: '1', j: 'sin²', r: -1, out: (u) => pow(fn('cos', u), 2), k: 1, words: (u) => `1 − sin²${T(u)} = cos²${T(u)}`, chip: '\\sin^2\\theta + \\cos^2\\theta = 1', id: 'pythag' },
  { i: '1', j: 'cos²', r: -1, out: (u) => pow(fn('sin', u), 2), k: 1, words: (u) => `1 − cos²${T(u)} = sin²${T(u)}`, chip: '\\sin^2\\theta + \\cos^2\\theta = 1', id: 'pythag' },
  { i: '1', j: 'tan²', r: 1, out: (u) => pow(fn('sec', u), 2), k: 1, words: (u) => `1 + tan²${T(u)} = sec²${T(u)}`, chip: '1 + \\tan^2\\theta = \\sec^2\\theta', id: 'pythag' },
  { i: 'sec²', j: 'tan²', r: -1, out: () => num(1), k: 1, words: (u) => `sec²${T(u)} − tan²${T(u)} = 1`, chip: '1 + \\tan^2\\theta = \\sec^2\\theta', id: 'pythag' },
  { i: 'sec²', j: '1', r: -1, out: (u) => pow(fn('tan', u), 2), k: 1, words: (u) => `sec²${T(u)} − 1 = tan²${T(u)}`, chip: '1 + \\tan^2\\theta = \\sec^2\\theta', id: 'pythag' },
  { i: '1', j: 'cot²', r: 1, out: (u) => pow(fn('csc', u), 2), k: 1, words: (u) => `1 + cot²${T(u)} = cosec²${T(u)}`, chip: '1 + \\cot^2\\theta = \\operatorname{cosec}^2\\theta', id: 'pythag' },
  { i: 'csc²', j: 'cot²', r: -1, out: () => num(1), k: 1, words: (u) => `cosec²${T(u)} − cot²${T(u)} = 1`, chip: '1 + \\cot^2\\theta = \\operatorname{cosec}^2\\theta', id: 'pythag' },
  { i: 'csc²', j: '1', r: -1, out: (u) => pow(fn('cot', u), 2), k: 1, words: (u) => `cosec²${T(u)} − 1 = cot²${T(u)}`, chip: '1 + \\cot^2\\theta = \\operatorname{cosec}^2\\theta', id: 'pythag' },
  { i: 'cos²', j: 'sin²', r: -1, out: (u) => fn('cos', linScale(u, 2)), k: 1, words: (u) => `cos²${T(u)} − sin²${T(u)} = cos ${T(linScale(u, 2))}`, chip: '\\cos 2\\theta = \\cos^2\\theta - \\sin^2\\theta', id: 'double-contract' },
  { i: 'cos²', j: '1', r: -0.5, out: (u) => fn('cos', linScale(u, 2)), k: 0.5, words: (u) => `2 cos²${T(u)} − 1 = cos ${T(linScale(u, 2))}`, chip: '\\cos 2\\theta = 2\\cos^2\\theta - 1', id: 'double-contract' },
  { i: '1', j: 'sin²', r: -2, out: (u) => fn('cos', linScale(u, 2)), k: 1, words: (u) => `1 − 2 sin²${T(u)} = cos ${T(linScale(u, 2))}`, chip: '\\cos 2\\theta = 1 - 2\\sin^2\\theta', id: 'double-contract' }
]

function reverseWords(w: string): string {
  return w.split(' = ').reverse().join(' = ')
}

function sumRules(S: Sum, emit: (s: Sum, fwd: string, rev: string, chip: string, id: string) => void): void {
  const n = S.t.length
  if (n >= 2) {
    const sq = S.t.map(squares)
    const sg = S.t.map(singles)
    const pr = S.t.map(pairs)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if (i === j) continue
        const others = S.t.filter((_, k) => k !== i && k !== j)
        // Squares: Pythagorean pairs and the cos 2θ forms.
        for (const di of sq[i])
          for (const dj of sq[j]) {
            if (di.rest.key !== dj.rest.key) continue
            const r = dj.rest.c / di.rest.c
            for (const p of SQUARE_PAIRS) {
              if (p.i !== di.pat || p.j !== dj.pat || Math.abs(r - p.r) > 1e-9) continue
              const u = (di.fns[0] ?? dj.fns[0]).a
              if (di.fns[0] && dj.fns[0] && linKey(di.fns[0].a) !== linKey(dj.fns[0].a)) continue
              const got = mul(monoSum(di.rest), num(p.k), p.out(u))
              const kind = p.id === 'double-contract' ? 'the double angle formula ' : ''
              emit(add(sumOf(others), got), `Used ${kind}${p.words(u)}.`, `Used ${kind}${reverseWords(p.words(u))}.`, p.chip, p.id)
            }
          }
        // Compound angle, backwards: sin P cos Q + cos P sin Q = sin(P + Q), and the others.
        if (i < j)
          for (const di of pr[i])
            for (const dj of pr[j]) {
              if (di.rest.key !== dj.rest.key) continue
              const r = dj.rest.c / di.rest.c
              const [p1, q1] = di.fns
              const [p2, q2] = dj.fns
              if (linKey(p1.a) !== linKey(p2.a) || linKey(q1.a) !== linKey(q2.a)) continue
              const P = p1.a
              const Q = q1.a
              let out: Sum | null = null
              let words = ''
              let chip = ''
              if (di.pat === 'sin·cos' && dj.pat === 'cos·sin' && Math.abs(r - 1) < 1e-9) {
                out = fn('sin', linAdd(P, Q))
                words = `sin ${T(P)} cos ${T(Q)} + cos ${T(P)} sin ${T(Q)} = ${fnS('sin', linAdd(P, Q))}`
                chip = '\\sin(A + B) = \\sin A\\cos B + \\cos A\\sin B'
              } else if (di.pat === 'sin·cos' && dj.pat === 'cos·sin' && Math.abs(r + 1) < 1e-9) {
                out = fn('sin', linSub(P, Q))
                words = `sin ${T(P)} cos ${T(Q)} − cos ${T(P)} sin ${T(Q)} = ${sumPrint(fn('sin', linSub(P, Q))).text}`
                chip = '\\sin(A - B) = \\sin A\\cos B - \\cos A\\sin B'
              } else if (di.pat === 'cos·cos' && dj.pat === 'sin·sin' && Math.abs(r + 1) < 1e-9) {
                out = fn('cos', linAdd(P, Q))
                words = `cos ${T(P)} cos ${T(Q)} − sin ${T(P)} sin ${T(Q)} = ${fnS('cos', linAdd(P, Q))}`
                chip = '\\cos(A + B) = \\cos A\\cos B - \\sin A\\sin B'
              } else if (di.pat === 'cos·cos' && dj.pat === 'sin·sin' && Math.abs(r - 1) < 1e-9) {
                out = fn('cos', linSub(P, Q))
                words = `cos ${T(P)} cos ${T(Q)} + sin ${T(P)} sin ${T(Q)} = ${sumPrint(fn('cos', linSub(P, Q))).text}`
                chip = '\\cos(A - B) = \\cos A\\cos B + \\sin A\\sin B'
              }
              if (out) emit(add(sumOf(others), mul(monoSum(di.rest), out)), `Used the compound angle formula ${words}.`, `Used the compound angle formula ${reverseWords(words)}.`, chip, 'compound-contract')
            }
        // Sum to product: sin A ± sin B, cos A ± cos B.
        if (i < j)
          for (const di of sg[i])
            for (const dj of sg[j]) {
              if (di.pat !== dj.pat || di.rest.key !== dj.rest.key) continue
              const r = dj.rest.c / di.rest.c
              if (Math.abs(Math.abs(r) - 1) > 1e-9) continue
              let A = di.fns[0].a
              let B = dj.fns[0].a
              if (linKey(A) === linKey(B)) continue
              let c = 1
              // Order so that A − B starts with a plus sign; a difference swaps its sign with it.
              if (linSub(A, B)[0][1] < 0) {
                ;[A, B] = [B, A]
                if (r < 0) c = -1
              }
              const half = (x: Lin) => linScale(x, 0.5)
              const S2 = half(linAdd(A, B))
              const D2 = half(linSub(A, B))
              let out: Sum
              let words: string
              let chip: string
              const f = di.pat as Fn
              if (f === 'sin' && r > 0) {
                out = mul(num(2), fn('sin', S2), fn('cos', D2))
                words = `sin ${T(A)} + sin ${T(B)} = 2 sin ${T(S2)} cos ${T(D2)}`
                chip = '\\sin A + \\sin B = 2\\sin\\frac{A+B}{2}\\cos\\frac{A-B}{2}'
              } else if (f === 'sin') {
                out = mul(num(2 * c), fn('cos', S2), fn('sin', D2))
                words = `sin ${T(A)} − sin ${T(B)} = 2 cos ${T(S2)} sin ${T(D2)}`
                chip = '\\sin A - \\sin B = 2\\cos\\frac{A+B}{2}\\sin\\frac{A-B}{2}'
              } else if (r > 0) {
                out = mul(num(2), fn('cos', S2), fn('cos', D2))
                words = `cos ${T(A)} + cos ${T(B)} = 2 cos ${T(S2)} cos ${T(D2)}`
                chip = '\\cos A + \\cos B = 2\\cos\\frac{A+B}{2}\\cos\\frac{A-B}{2}'
              } else {
                out = mul(num(-2 * c), fn('sin', S2), fn('sin', D2))
                words = `cos ${T(A)} − cos ${T(B)} = −2 sin ${T(S2)} sin ${T(D2)}`
                chip = '\\cos A - \\cos B = -2\\sin\\frac{A+B}{2}\\sin\\frac{A-B}{2}'
              }
              emit(add(sumOf(others), mul(monoSum(di.rest), out)), `Used the sum-to-product formula ${words}.`, `Used the product-to-sum formula ${reverseWords(words)}.`, chip, 'sum-to-product')
            }
      }

    // Common denominator.
    const den = new Map<string, Factor>()
    for (const m of S.t)
      for (const x of m.fs)
        if (x.e < 0) {
          const prev = den.get(x.b.key)
          if (!prev || x.e < prev.e) den.set(x.b.key, x)
        }
    if (den.size) {
      const D = sumOf([mono(1, [...den.values()].map((x) => ({ b: x.b, e: -x.e })))])
      const top = add(...S.t.map((m) => mul(monoSum(m), D)))
      emit(div(top, D), 'Put the fractions over a common denominator.', 'Split into separate fractions.', '\\dfrac{a}{b} + \\dfrac{c}{d} = \\dfrac{ad + bc}{bd}', 'common-denominator')
    }

    // Take out a common factor.
    const first = S.t[0]
    const common: Factor[] = []
    for (const x of first.fs) {
      if (x.e <= 0) continue
      let e = x.e
      for (const m of S.t.slice(1)) {
        const y = m.fs.find((z) => z.b.key === x.b.key)
        e = y && y.e > 0 ? Math.min(e, y.e) : 0
      }
      if (e > 0) common.push({ b: x.b, e })
    }
    const g = S.t.every((m) => Number.isInteger(m.c)) ? S.t.reduce((a, m) => gcd(a, m.c), 0) : 1
    if (common.length || g > 1) {
      const cm = mono(g, common)!
      const inner = sumOf(S.t.map((m) => mono(m.c / g, [...m.fs, ...common.map((x) => ({ b: x.b, e: -x.e }))])))
      const cmText = monoPrint(cm).text
      emit(mul(monoSum(cm), inner), `Took out the common factor ${cmText}.`, `Multiplied ${cmText} into the bracket.`, 'ab + ac = a(b + c)', 'factor')
    }
  }

  // Expand every bracket on the top.
  // The chip names the law actually used: cos x (2 cos²x − 1) is multiplied in, not squared out.
  const ex = expand(S)
  const top = Math.max(0, ...S.t.flatMap((m) => m.fs.filter((x) => x.b.k === 's').map((x) => x.e)))
  if (ex.key !== S.key) emit(ex, 'Expanded the brackets.', 'Factorised.', EXPAND_CHIP[top] ?? EXPAND_CHIP[1], 'expand')
}

/** The law used to expand, by the highest power of a bracket: a square, a cube, or a product. */
const EXPAND_CHIP: Record<number, string> = {
  1: 'a(b + c) = ab + ac',
  2: '(a + b)^2 = a^2 + 2ab + b^2',
  3: '(a + b)^3 = a^3 + 3a^2b + 3ab^2 + b^3'
}

/** Rules on one term: double angle backwards, product to sum, split, conjugate, the bottom. */
function monoRules(m: Mono, emit: (s: Sum, fwd: string, rev: string, chip: string, id: string) => void): void {
  // 2 sin u cos u = sin 2u.
  for (const x of m.fs) {
    if (x.b.k !== 'f' || x.b.f !== 'sin' || x.e < 1) continue
    const cosKey = fnBase('cos', x.b.a).key
    const y = m.fs.find((z) => z.b.key === cosKey && z.e >= 1)
    if (!y) continue
    const rest = withoutPowers(m, [
      { key: x.b.key, e: 1 },
      { key: cosKey, e: 1 }
    ])!
    const u = x.b.a
    const w = `2 sin ${T(u)} cos ${T(u)} = sin ${T(linScale(u, 2))}`
    emit(mul(monoSum(rest), num(0.5), fn('sin', linScale(u, 2))), `Used the double angle formula ${w}.`, `Used the double angle formula ${reverseWords(w)}.`, '\\sin 2\\theta = 2\\sin\\theta\\cos\\theta', 'double-contract')
  }
  // Product to sum.
  for (const d of pairs(m)) {
    const [p, q] = d.fns
    if (!(p.f === 'sin' && q.f === 'cos') && !(p.f === 'cos' && q.f === 'cos' && linKey(p.a) < linKey(q.a)) && !(p.f === 'sin' && q.f === 'sin' && linKey(p.a) < linKey(q.a))) continue
    let A = p.a
    let B = q.a
    const flip = linSub(A, B)[0][1] < 0
    if (flip && p.f === q.f) [A, B] = [B, A]
    let out: Sum
    let words: string
    // The chip is the formula for this pair: 2 sin A sin B used to be shown the sin–cos one.
    let chip: string
    if (p.f === 'sin' && q.f === 'cos') {
      out = mul(num(0.5), add(fn('sin', linAdd(A, B)), fn('sin', linSub(A, B))))
      words = flip
        ? `2 sin ${T(A)} cos ${T(B)} = sin ${T(linAdd(A, B))} − sin ${T(linSub(B, A))}`
        : `2 sin ${T(A)} cos ${T(B)} = sin ${T(linAdd(A, B))} + sin ${T(linSub(A, B))}`
      chip = '2\\sin A\\cos B = \\sin(A + B) + \\sin(A - B)'
    } else if (p.f === 'cos') {
      out = mul(num(0.5), add(fn('cos', linSub(A, B)), fn('cos', linAdd(A, B))))
      words = `2 cos ${T(A)} cos ${T(B)} = cos ${T(linSub(A, B))} + cos ${T(linAdd(A, B))}`
      chip = '2\\cos A\\cos B = \\cos(A - B) + \\cos(A + B)'
    } else {
      out = mul(num(0.5), sub(fn('cos', linSub(A, B)), fn('cos', linAdd(A, B))))
      words = `2 sin ${T(A)} sin ${T(B)} = cos ${T(linSub(A, B))} − cos ${T(linAdd(A, B))}`
      chip = '2\\sin A\\sin B = \\cos(A - B) - \\cos(A + B)'
    }
    emit(mul(monoSum(d.rest), out), `Used the product-to-sum formula ${words}.`, `Used the sum-to-product formula ${reverseWords(words)}.`, chip, 'product-to-sum')
  }

  const tops = m.fs.filter((x) => x.b.k === 's' && x.e > 0)
  const bottoms = m.fs.filter((x) => x.e < 0)
  // Split a fraction whose top is one bracket.
  if (tops.length === 1 && tops[0].e === 1 && bottoms.length) {
    const rest = withoutPowers(m, [{ key: tops[0].b.key, e: 1 }])!
    const parts = (tops[0].b as SumBase).s.t.map((t) => mul(monoSum(t), monoSum(rest)))
    emit(add(...parts), 'Split the fraction.', 'Put the fractions over a common denominator.', '\\dfrac{a + b}{c} = \\dfrac{a}{c} + \\dfrac{b}{c}', 'split')
  }
  // Multiply out a bottom made of several brackets.
  const bb = bottoms.filter((x) => x.b.k === 's')
  if (bb.length >= 2 || bb.some((x) => x.e <= -2)) {
    const D = expand(sumOf([mono(1, bb.map((x) => ({ b: x.b, e: -x.e })))]))
    const rest = mono(m.c, m.fs.filter((x) => !(x.b.k === 's' && x.e < 0)))
    emit(div(monoSum(rest), D), 'Multiplied out the bottom.', 'Factorised the bottom.', '(a + b)(a - b) = a^2 - b^2', 'expand-bottom')
  }
  // Multiply top and bottom by the conjugate of a two-term bottom.
  for (const x of bottoms) {
    if (x.b.k !== 's' || x.e !== -1 || x.b.s.t.length !== 2) continue
    const [a, b] = x.b.s.t
    const conj = sumOf([a, { ...b, c: -b.c }])
    const bottom = expand(mul(sumOf([a, b]), conj))
    const rest = withoutPowers(m, [{ key: x.b.key, e: -1 }])!
    const cj = sumPrint(conj).text
    emit(
      div(mul(monoSum(rest), conj), bottom),
      `Multiplied top and bottom by (${cj}), so the bottom became a difference of two squares.`,
      `Cancelled (${cj}) from the top and the bottom.`,
      '(a + b)(a - b) = a^2 - b^2',
      'conjugate'
    )
  }
}

/** Every sum inside s, with a way to put a changed copy back in its place. */
function sumSites(s: Sum, rebuild: (x: Sum) => Sum, out: [Sum, (x: Sum) => Sum][] = []): [Sum, (x: Sum) => Sum][] {
  out.push([s, rebuild])
  s.t.forEach((m, i) => {
    m.fs.forEach((x, j) => {
      if (x.b.k !== 's') return
      const without = mono(m.c, m.fs.filter((_, k) => k !== j))
      const e = x.e
      sumSites(x.b.s, (inner) => rebuild(add(sumOf(s.t.filter((_, k) => k !== i)), mul(monoSum(without), pow(inner, e)))), out)
    })
  })
  return out
}

// Three points for the numeric check of every rewrite (radians, away from the usual poles).
const CHECK_POINTS: Record<string, number>[] = [
  { x: 0.4137, A: 0.7213, B: 0.2861, θ: 0.5309, t: 0.6113 },
  { x: 1.1071, A: 1.3033, B: 0.5159, θ: 0.9127, t: 1.2291 },
  { x: 2.3789, A: 0.2917, B: 1.9043, θ: 2.0411, t: 2.6931 }
]

function agrees(a: Sum, b: Sum, points = CHECK_POINTS): boolean {
  let used = 0
  for (const p of points) {
    const va = evaluate(a, p)
    const vb = evaluate(b, p)
    if (!Number.isFinite(va) || !Number.isFinite(vb) || Math.abs(va) > 1e8 || Math.abs(vb) > 1e8) continue
    used++
    if (Math.abs(va - vb) > 1e-9 * Math.max(1, Math.abs(va))) return false
  }
  return used >= 2
}

/**
 * Every rewrite of s one step away, each checked at three points. A rewrite that changes the
 * value is a bug in a rule: strict (the tests) throws, otherwise the rewrite is dropped — either
 * way it never reaches a student as a "step".
 */
const tidyWords = (w: string): string =>
  w.replace(/\b(sin|cos|tan|cot|sec|cosec)([²³⁴]?) \(/g, '$1$2(').replace(/\b(sin|cos|tan|cot|sec|cosec)([²³⁴])(\d)/g, '$1$2 $3')

const QUIET_CANCEL = new Set(['common-denominator', 'split', 'conjugate', 'expand-bottom', 'to-sincos', 'from-sincos', 'factor'])

export function rewrites(s: Sum, targets: Set<string>, strict = true): Rewrite[] {
  const out: Rewrite[] = []
  const seen = new Set<string>([s.key])
  const push = (n: Sum, fwd: string, rev: string, chip: string, id: string) => {
    const cancelled = [...CANCELLED.values()]
    CANCELLED.clear()
    if (seen.has(n.key)) return
    fwd = tidyWords(fwd)
    rev = tidyWords(rev)
    // Say what cancelled, except where cancelling is the rule itself (common denominator, split).
    if (cancelled.length && !QUIET_CANCEL.has(id)) {
      const names = cancelled.map((b) => (b.k === 'f' ? fnText(b.f, b.a, 1) : `(${sumPrint(b.s).text})`))
      fwd = `${fwd.replace(/\.$/, '')}, then cancelled ${names.join(' and ')}.`
    }
    if (!agrees(s, n)) {
      // Strict (the tests): a rule that changes the value is a bug and must be seen. Otherwise
      // the step is simply not offered — a numeric false alarm must never end a student's proof.
      if (strict) throw new Error(`Rule "${id}" (${fwd}) changed the value of ${sumPrint(s).text}: it gave ${sumPrint(n).text}.`)
      return
    }
    seen.add(n.key)
    out.push({ s: n, fwd, rev, chip, id })
  }
  const tryN = (fn: () => void) => {
    try {
      fn()
    } catch (e) {
      // Only a real division by zero (a rule meeting 0 in a bottom) is skipped; a wrong rule is not.
      if (!(e instanceof Error) || e.message !== 'division by zero') throw e
    }
  }
  CANCELLED.clear()
  for (const [site, rebuild] of sumSites(s, (x) => x)) {
    tryN(() => sumRules(site, (n, f, r, c, id) => push(rebuild(n), f, r, c, id)))
    site.t.forEach((m, i) => {
      const others = sumOf(site.t.filter((_, k) => k !== i))
      tryN(() => monoRules(m, (n, f, r, c, id) => push(rebuild(add(others, n)), f, r, c, id)))
    })
  }
  tryN(() => globalRules(s, targets, push))
  return out
}

// ---------------------------------------------------------------------------------------------
// The search
// ---------------------------------------------------------------------------------------------

export interface TrigLine {
  /** The expression on this line, in a student's notation. */
  text: string
  tex: string
  /** What was done to reach this line, past tense; empty on the first line. */
  rule: string
  /** The formula used, as LaTeX. */
  chip: string
  id: string
}

export interface ProveOptions {
  /** Combined depth of the two searches. */
  maxDepth?: number
  /** Stop after this many expressions have been looked at. */
  nodeCap?: number
  /** Search only from the left (for comparison; the default meets in the middle). */
  forwardOnly?: boolean
  /**
   * Stop looking after this many milliseconds (default 1500): the search runs on the main
   * thread as the student presses Enter, so it must hand back the "True" answer promptly.
   */
  budgetMs?: number
  /** A rule that changes a value throws instead of being skipped (the tests turn this on). */
  strict?: boolean
}

interface Node {
  s: Sum
  parent: string | null
  step: Rewrite | null
  depth: number
  /** Sum of the rule costs from this side's start. */
  cost: number
}

function allArgs(s: Sum, out = new Set<string>()): Set<string> {
  for (const x of fnSites(s).values()) out.add(linKey(x.a))
  return out
}

export interface Proof {
  lines: TrigLine[]
  rules: string[]
  /** Expressions looked at, for the spike's statistics. */
  nodes: number
}

/**
 * What a step costs the reader. Every step costs 1; the ones a textbook reaches for only when the
 * question is about them cost more, so between two chains of the same length — or one step
 * longer — the search prints the one a teacher would write: cos 3x = cos(2x + x) = …, not
 * cos 3x = cos x − 2 sin x sin 2x = ….
 */
const RULE_COST: Record<string, number> = {
  'product-to-sum': 2.5,
  'sum-to-product': 1.5,
  'pythag-sub': 1.1,
  'half-expand': 1.2
}
const stepCost = (r: Rewrite, backward: boolean): number =>
  // Read forwards, a backward "expand" is a factorisation of a full expansion: harder to follow.
  (RULE_COST[r.id] ?? 1) + (backward && r.id === 'expand' ? 0.5 : 0)

/**
 * The chip for a rule read backwards, where the law runs the other way: a common denominator read
 * backwards is a split, and the chip beside "Split into separate fractions." used to show a/b + c/d
 * being combined. Rules whose chip is an equation true both ways (the double angle) are not here.
 */
const REVERSE_CHIP: Record<string, string> = {
  'common-denominator': '\\dfrac{a + b}{c} = \\dfrac{a}{c} + \\dfrac{b}{c}',
  split: '\\dfrac{a}{b} + \\dfrac{c}{d} = \\dfrac{ad + bc}{bd}',
  factor: 'a(b + c) = ab + ac'
}
/** The chip beside a backward step: an expansion read backwards is its own law turned round. */
const reverseChip = (r: Rewrite): string => REVERSE_CHIP[r.id] ?? (r.id === 'expand' ? r.chip.split(' = ').reverse().join(' = ') : r.chip)

/** The three check points and two more: whether the two sides agree at all. */
const FIVE_POINTS = [...CHECK_POINTS, { x: 1, A: 1, B: 0.3, θ: 1, t: 1 }, { x: 0.2, A: 0.9, B: 0.1, θ: 0.2, t: 0.2 }]

/** Prove lhs = rhs, or say why not. */
export function proveIdentity(lhs: Sum, rhs: Sum, opts: ProveOptions = {}): Proof | { refused: string; nodes?: number } {
  const maxDepth = opts.maxDepth ?? 6
  const nodeCap = opts.nodeCap ?? 60000
  const deadline = performance.now() + (opts.budgetMs ?? 1500)
  let outOfTime = false
  if (!agrees(lhs, rhs, FIVE_POINTS)) return { refused: 'not-equal' }

  const targetsFwd = allArgs(rhs)
  const targetsBwd = allArgs(lhs)
  const limit = Math.max(size(lhs), size(rhs)) * 2 + 8
  const fwd = new Map<string, Node>([[lhs.key, { s: lhs, parent: null, step: null, depth: 0, cost: 0 }]])
  const bwd = new Map<string, Node>([[rhs.key, { s: rhs, parent: null, step: null, depth: 0, cost: 0 }]])
  let best: { key: string; cost: number; ahead: number } | null = lhs.key === rhs.key ? { key: lhs.key, cost: 0, ahead: 0 } : null
  let fFront = [lhs.key]
  let bFront = [rhs.key]
  let fDepth = 0
  let bDepth = 0
  let nodes = 2
  const consider = (key: string) => {
    const a = fwd.get(key)
    const b = bwd.get(key)
    // A chain may be at most maxDepth steps long, however the two sides split it.
    if (!a || !b || a.depth + b.depth > maxDepth) return
    const cost = a.cost + b.cost
    // Cheaper wins; at equal cost, the chain with more steps done from the left (a textbook
    // works forwards from the side it starts on).
    if (!best || cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) < 1e-9 && a.depth > best.ahead)) best = { key, cost, ahead: a.depth }
  }
  // The levels grown may run two past maxDepth in total: a side that cannot meet the other (the
  // backward side of cos 3x = 4 cos³x − 3 cos x) must not use up the depth the other side needs.
  while (fDepth + bDepth < maxDepth + 2 && Math.max(fDepth, bDepth) < maxDepth && nodes < nodeCap && !outOfTime) {
    // A chain not found yet needs a new level on one side, so it has at least min(depths) + 1
    // steps, and every step costs at least 1: nothing cheaper than that bound can turn up.
    if (best && best.cost <= Math.min(fDepth, bDepth) + 1) break
    if (fFront.length === 0 && bFront.length === 0) break
    // Grow the side whose frontier is smaller (the two meet in the middle at the least cost),
    // but never let one side run more than two levels ahead of the other: a narrow side that
    // never meets would otherwise spend the whole depth budget on its own.
    let growF = fFront.length > 0 && (bFront.length === 0 || fFront.length <= bFront.length)
    if (growF && fDepth >= bDepth + 2 && bFront.length) growF = false
    else if (!growF && bDepth >= fDepth + 2 && fFront.length) growF = true
    // Once a chain is known, only the shallower side can still find a cheaper one soon.
    if (best && fFront.length && bFront.length) growF = fDepth <= bDepth
    if (opts.forwardOnly) {
      if (fFront.length === 0) break
      growF = true
    }
    const [mine, front, targets] = growF ? [fwd, fFront, targetsFwd] : [bwd, bFront, targetsBwd]
    const next: string[] = []
    for (const key of front) {
      const node = mine.get(key)!
      for (const r of rewrites(node.s, targets, opts.strict ?? false)) {
        if (size(r.s) > limit) continue
        const cost = node.cost + stepCost(r, !growF)
        const old = mine.get(r.s.key)
        if (old) {
          // Reached again on this same level by a cheaper step: keep the cheaper way.
          if (old.depth === node.depth + 1 && cost < old.cost - 1e-9) mine.set(r.s.key, { ...old, parent: key, step: r, cost })
          else continue
        } else {
          mine.set(r.s.key, { s: r.s, parent: key, step: r, depth: node.depth + 1, cost })
          nodes++
          next.push(r.s.key)
        }
        consider(r.s.key)
        if (nodes >= nodeCap) break
      }
      if (nodes >= nodeCap) break
      // Out of time: keep the chain found so far, if any, or give the "True" answer without one.
      if (performance.now() > deadline) {
        outOfTime = true
        break
      }
    }
    if (growF) {
      fFront = next
      fDepth++
    } else {
      bFront = next
      bDepth++
    }
  }
  if (!best) return { refused: 'not-found', nodes }

  // Forward half: LHS … meet. Backward half: meet … RHS, each backward step read in reverse.
  const meet: string = (best as { key: string }).key
  const left: Node[] = []
  for (let k: string | null = meet; k; k = fwd.get(k)!.parent) left.unshift(fwd.get(k)!)
  const lines: TrigLine[] = left.map((n, i) => ({
    ...sumPrint(n.s),
    rule: i === 0 ? '' : n.step!.fwd,
    chip: i === 0 ? '' : n.step!.chip,
    id: i === 0 ? '' : n.step!.id
  }))
  for (let k: string | null = meet; k; ) {
    const n: Node = bwd.get(k)!
    if (!n.parent) break
    const p = bwd.get(n.parent)!
    lines.push({ ...sumPrint(p.s), rule: n.step!.rev, chip: reverseChip(n.step!), id: n.step!.id })
    k = n.parent
  }
  return { lines, rules: lines.slice(1).map((l) => l.id), nodes }
}

/**
 * The sentence for an identity that is not one: both sides at x = 1 (or A = 1, B = 0.3), in
 * radians. Every letter shown is the value used, and a point where the two sides happen to read
 * the same to three places is passed over for the next, so the sentence always shows a difference.
 */
export function notEqualSentence(lhsText: string, rhsText: string, lhs: Sum, rhs: Sum, fmt: (v: number) => string): string {
  const names = [...new Set([...allArgs(lhs), ...allArgs(rhs)].flatMap((k) => k.match(/[A-Za-zθ]/g) ?? []))]
  const known: Record<string, number> = { x: 1, A: 1, B: 0.3, θ: 1, t: 1 }
  const spare = [0.3, 0.6, 0.8, 1.2, 1.5]
  const first: Record<string, number> = {}
  let k = 0
  for (const n of names) first[n] = known[n] ?? (k++ === 0 ? 1 : spare[(k - 2) % spare.length])
  const candidates = [first, ...[0.5, 0.7, 1.3].map((f) => Object.fromEntries(names.map((n) => [n, Math.round(first[n] * f * 100) / 100])))]
  const differs = (at: Record<string, number>): boolean => {
    const a = evaluate(lhs, at)
    const b = evaluate(rhs, at)
    return Number.isFinite(a) && Number.isFinite(b) && fmt(a) !== fmt(b)
  }
  const at = candidates.find(differs) ?? first
  const where = names.map((n) => `${n} = ${fmt(at[n])} rad`).join(', ')
  return `Those two sides are not equal, so there is nothing to prove: at ${where}, ${lhsText} = ${fmt(evaluate(lhs, at))} but ${rhsText} = ${fmt(evaluate(rhs, at))}.`
}

// ---------------------------------------------------------------------------------------------
// The Working, for the Working panel (job "trigidentity")
// ---------------------------------------------------------------------------------------------


const three = (v: number): string => fmtPrecise(v, { decimals: 3, precisionMode: 'dp' })

/**
 * True when the text is a trig identity: it reads as one and its two sides agree. Auto uses this
 * to pick the proof over Solve; an equation such as sin x = 0.5 fails the agreement and stays with
 * Solve, whose SymPy fallback still answers it.
 */
export function isTrigIdentity(text: string): boolean {
  if (!/=/.test(text) || !/\b(sin|cos|tan|cot|sec|csc|cosec)\b/i.test(text.replace(/[^A-Za-z]+/g, ' '))) return false
  try {
    const { lhs, rhs } = parseIdentity(text)
    return agrees(lhs, rhs)
  } catch {
    return false
  }
}

/** "Prove sin 2x = 2 sin x cos x", worked from the left-hand side to the right-hand side. */
export function trigWorking(text: string, opts: ProveOptions = {}): Working {
  let id: ReturnType<typeof parseIdentity>
  try {
    id = parseIdentity(text)
  } catch (e) {
    return failed('Prove an identity', text, e instanceof Error ? e.message : String(e))
  }
  // The two sides as the student wrote them (their order, their brackets), not the sorted form.
  const lhs = id.lhsShown
  const rhs = id.rhsShown
  const title = `Prove ${lhs.text} = ${rhs.text}`
  const input = `${lhs.tex} = ${rhs.tex}`
  let proof: ReturnType<typeof proveIdentity>
  try {
    proof = proveIdentity(id.lhs, id.rhs, opts)
  } catch {
    // Nothing inside the search may cost the student the answer: whatever went wrong there, the
    // two sides are still compared, and "True" or "not equal" is said.
    proof = { refused: agrees(id.lhs, id.rhs, FIVE_POINTS) ? 'not-found' : 'not-equal' }
  }
  if ('refused' in proof) {
    if (proof.refused === 'not-equal') return failed(title, input, notEqualSentence(lhs.text, rhs.text, id.lhs, id.rhs, three))
    // The two sides are equal (checked at five points) but no chain of at most six school steps
    // was found: the answer still comes first — it is true — and the reason is given.
    return {
      title,
      input,
      moves: [],
      answers: [{ label: 'True', tex: input }],
      noWorking: true,
      reason: 'The two sides agree at every point PhysLab tried, but it found no short chain of textbook steps from one to the other in the time it had.',
      check: 'Both sides agree at five points, so the identity is true.',
      checked: 'ok'
    }
  }
  const s = new Steps()
  s.goal('Start from the left-hand side')
  // The first and last lines are the same expressions as the two sides, so they are shown as typed.
  const lines = proof.lines.map((l, i, all) => (i === 0 ? { ...l, ...lhs } : i === all.length - 1 ? { ...l, ...rhs } : l))
  s.add('Started from the left-hand side.', lines[0].tex)
  s.goal('Work towards the right-hand side')
  for (const l of lines.slice(1)) s.add(l.rule, `= ${l.tex}`, l.chip || undefined)
  // Sides that differ only in the order of their terms or factors need that said in one line.
  if (lines.length === 1 && lhs.text !== rhs.text) s.add('Wrote the terms and factors in the order of the right-hand side.', `= ${rhs.tex}`)
  return {
    title,
    input,
    method: 'Changed the left-hand side one step at a time',
    moves: s.moves,
    answers: [{ label: 'Proved', tex: input }],
    check: 'Each line was checked against the one before it at three angles, and the two sides agree at five.',
    checked: 'ok'
  }
}

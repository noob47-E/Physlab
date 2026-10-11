// The scoreboard's corpora checked by a SECOND, independent path (G3a): every key is re-derived from its question
// with exact arithmetic written here, not with the builder's (tests/engine/scoreboard/exact.ts), so a broken generator
// cannot hand the scoreboard a false key. Exact everywhere except derivatives, which are checked numerically at points
// inside their domain (the corpus keeps ln and √ on insides that are positive for every real x).

import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import * as mathjs from 'mathjs'
import type { MathNode } from 'mathjs'
import { CLASSES, type CorpusItem } from './buildCorpora'

// ---- exact rationals, written again here on purpose -------------------------------------------------------------
type R = { n: bigint; d: bigint }
const babs = (a: bigint) => (a < 0n ? -a : a)
const bgcd = (a: bigint, b: bigint): bigint => {
  a = babs(a)
  b = babs(b)
  while (b) [a, b] = [b, a % b]
  return a
}
const r = (n: bigint, d = 1n): R => {
  if (d === 0n) throw new Error('pole')
  if (d < 0n) [n, d] = [-n, -d]
  const g = bgcd(n, d) || 1n
  return { n: n / g, d: d / g }
}
const add = (a: R, b: R) => r(a.n * b.d + b.n * a.d, a.d * b.d)
const sub = (a: R, b: R) => r(a.n * b.d - b.n * a.d, a.d * b.d)
const mul = (a: R, b: R) => r(a.n * b.n, a.d * b.d)
const div = (a: R, b: R) => r(a.n * b.d, a.d * b.n)
const isZero = (a: R) => a.n === 0n
const same = (a: R, b: R) => a.n === b.n && a.d === b.d
const ZERO = r(0n)
const ONE = r(1n)

/** Evaluates a parsed expression exactly: integers, + − × ÷, whole-number powers, x y z. */
function exact(node: MathNode, at: Record<string, R>): R {
  const n = node as MathNode & { value?: unknown; name?: string; op?: string; fn?: string; args?: MathNode[]; content?: MathNode }
  switch (node.type) {
    case 'ConstantNode': {
      const v = n.value as number
      if (!Number.isSafeInteger(v)) throw new Error(`not an exact integer literal: ${v}`)
      return r(BigInt(v))
    }
    case 'SymbolNode':
      if (BIG.has(n.name!)) return r(BIG.get(n.name!)!)
      if (!(n.name! in at)) throw new Error(`unknown symbol ${n.name}`)
      return at[n.name!]
    case 'ParenthesisNode':
      return exact(n.content!, at)
    case 'OperatorNode': {
      const a = n.args!.map((x) => exact(x, at))
      switch (n.fn) {
        case 'unaryMinus':
          return r(-a[0].n, a[0].d)
        case 'unaryPlus':
          return a[0]
        case 'add':
          return add(a[0], a[1])
        case 'subtract':
          return sub(a[0], a[1])
        case 'multiply':
          return mul(a[0], a[1])
        case 'divide':
          return div(a[0], a[1])
        case 'pow': {
          if (a[1].d !== 1n) throw new Error('fractional power')
          let k = a[1].n
          let base = a[0]
          if (k < 0n) {
            base = div(ONE, base)
            k = -k
          }
          let out = ONE
          for (let i = 0n; i < k; i++) out = mul(out, base)
          return out
        }
      }
    }
  }
  throw new Error(`cannot evaluate ${node.type} ${n.fn ?? ''} exactly`)
}
/** Integer literals too long for a double are read as BigInt: each becomes a name bound to its exact value. */
const BIG = new Map<string, bigint>()
const parse = (s: string) =>
  mathjs.parse(
    s.replace(/\d{16,}/g, (digits) => {
      const name = `big_${digits}`
      BIG.set(name, BigInt(digits))
      return name
    })
  )
const POINTS = [-11n, -7n, -5n, -3n, -2n, -1n, 0n, 1n, 2n, 3n, 4n, 6n, 9n, 11n, 17n]
  .map((v) => r(v))
  .concat([r(1n, 3n), r(-5n, 7n), r(13n, 4n), r(-9n, 5n), r(23n, 6n)])

/**
 * Whether two expressions in x are the same rational function: equal at 20 points where both are defined, at least
 * 15 used. Cross-multiplied, the corpus's largest case (a degree-5 denominator) is a degree-9 identity: 10 points
 * decide it; 15 leave margin.
 */
function identical(a: MathNode, b: MathNode): boolean {
  let used = 0
  for (const x of POINTS) {
    let va: R
    let vb: R
    try {
      va = exact(a, { x })
      vb = exact(b, { x })
    } catch (e) {
      if ((e as Error).message === 'pole') continue
      throw e
    }
    if (!same(va, vb)) return false
    used++
  }
  return used >= 15
}

/** A polynomial's coefficients from its values (Newton's divided differences at 0..deg+1, exact). */
function coefficients(p: MathNode, maxDegree = 8): R[] {
  const xs = Array.from({ length: maxDegree + 1 }, (_, i) => r(BigInt(i)))
  const ys = xs.map((x) => exact(p, { x }))
  // divided differences
  const dd = [...ys]
  const newton: R[] = [dd[0]]
  for (let level = 1; level < xs.length; level++) {
    for (let i = xs.length - 1; i >= level; i--) dd[i] = div(sub(dd[i], dd[i - 1]), sub(xs[i], xs[i - level]))
    newton.push(dd[level])
  }
  // expand the Newton form into monomial coefficients
  let coef: R[] = [ZERO]
  for (let k = newton.length - 1; k >= 0; k--) {
    // coef = coef * (x - xs[k]) + newton[k]
    const next: R[] = Array.from({ length: coef.length + 1 }, () => ZERO)
    coef.forEach((c, i) => {
      next[i + 1] = add(next[i + 1], c)
      next[i] = sub(next[i], mul(c, xs[k]))
    })
    next[0] = add(next[0], newton[k])
    coef = next
  }
  while (coef.length > 1 && isZero(coef[coef.length - 1])) coef.pop()
  return coef
}
const degreeOf = (c: R[]) => (c.length === 1 && isZero(c[0]) ? -1 : c.length - 1)
/** Exact division of polynomials (coefficient lists, low degree first): the remainder must be zero. */
function divides(p: R[], f: R[]): R[] | null {
  const rem = [...p]
  const q: R[] = Array.from({ length: Math.max(1, p.length - f.length + 1) }, () => ZERO)
  for (let i = rem.length - f.length; i >= 0; i--) {
    const k = div(rem[i + f.length - 1], f[f.length - 1])
    q[i] = k
    for (let j = 0; j < f.length; j++) rem[i + j] = sub(rem[i + j], mul(k, f[j]))
  }
  return rem.every(isZero) ? q : null
}

// ---- the checks per class -----------------------------------------------------------------------------------------

/** Splits at a separator that is outside every bracket. */
function topSplit(s: string, sep: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (depth === 0 && s.startsWith(sep, i)) {
      out.push(s.slice(start, i))
      start = i + sep.length
      i += sep.length - 1
    }
  }
  out.push(s.slice(start))
  return out.map((t) => t.trim())
}

function checkFactor(item: CorpusItem): string | null {
  if (!identical(parse(item.question), parse(item.answer))) return 'the factors do not multiply back to the question'
  for (const [index, part] of topSplit(item.answer, ' * ').entries()) {
    const m = /^\((.*)\)(\^\d+)?$/.exec(part)
    if (!m) {
      // Only the content may be written bare: first, and a number (an unfactored polynomial must not pass as it).
      if (index !== 0 || /x/.test(part)) return `not written as factors: ${part}`
      continue
    }
    if (m[2] === '^1') return `a multiplicity of 1 written out: ${part}`
    const c = coefficients(parse(m[1]), 4)
    const deg = degreeOf(c)
    // A constant only as the content, first, a number that is neither 0 nor 1 (a content of 1 is no content).
    if (deg === 0 && index === 0 && !m[2] && !(c[0].d === 1n && (c[0].n === 0n || c[0].n === 1n))) continue
    if (deg === 0) return `a constant that is not a content: ${part}`
    if (deg > 2 || deg < 1) return `a factor of degree ${deg}: ${part}`
    // canonical: integer coefficients with no common factor, the leading one positive
    if (c.some((v) => v.d !== 1n)) return `a factor with a fraction in it: ${part}`
    if (c.reduce((g, v) => bgcd(g, v.n), 0n) !== 1n) return `a factor that is not primitive: ${part}`
    if (c[c.length - 1].n < 0n) return `a factor whose leading coefficient is negative: ${part}`
    if (deg === 2) {
      // irreducible over Q: the discriminant is not the square of a rational
      const disc = sub(mul(c[1], c[1]), mul(r(4n), mul(c[2], c[0])))
      if (disc.n >= 0n) {
        const rootN = sqrtBig(disc.n)
        const rootD = sqrtBig(disc.d)
        if (rootN * rootN === disc.n && rootD * rootD === disc.d) return `a quadratic factor that splits: ${part}`
      }
    }
  }
  return null
}
function sqrtBig(v: bigint): bigint {
  if (v < 2n) return v
  let x = BigInt(Math.floor(Math.sqrt(Number(v))))
  while (x * x > v) x--
  while ((x + 1n) * (x + 1n) <= v) x++
  return x
}

/** The answer's roots as factors (linear for a rational root, quadratic for a conjugate pair) with multiplicities. */
function rootFactors(answer: string): { f: R[]; m: number }[] | string {
  const roots = answer.split(/,\s*(?=x = )/).map((t) => {
    const m = /^x = (.+?)(?: \(multiplicity (\d+)\))?$/.exec(t.trim())
    if (!m) throw new Error(`cannot read the root "${t}"`)
    return { text: m[1], m: m[2] ? Number(m[2]) : 1 }
  })
  const out: { f: R[]; m: number }[] = []
  const pairs = new Map<string, { count: number; m: number; f: R[] }>()
  for (const { text, m } of roots) {
    const surd = /^(?:(-?\d+) ([+-]) )?(-)?sqrt\((\d+)\)$/.exec(text)
    const cplx = /^(?:(-?\d+) ([+-]) )?(-)?(?:(\d+)\*)?i$/.exec(text)
    if (surd || cplx) {
      const g = (surd ?? cplx)!
      const a = r(BigInt(g[1] ?? '0'))
      const b = r(BigInt(surd ? g[4] : (g[4] ?? '1')))
      // x² − 2a·x + a² ∓ (b for a surd, b² for i)
      const c0 = surd ? sub(mul(a, a), b) : add(mul(a, a), mul(b, b))
      const key = `${surd ? 's' : 'c'}${a.n}/${a.d}|${b.n}`
      const e = pairs.get(key) ?? { count: 0, m, f: [c0, mul(r(-2n), a), ONE] }
      e.count++
      pairs.set(key, e)
      continue
    }
    const rat = parse(text)
    const v = exact(rat, {})
    out.push({ f: [r(-v.n, v.d), ONE], m })
  }
  for (const [key, e] of pairs) {
    if (e.count !== 2) return `the conjugate of ${key} is missing`
    out.push({ f: e.f, m: e.m })
  }
  return out
}
/** The answer's canonical form: rational roots in lowest terms with the sign in front, every root sorted by real then imaginary part. */
function rootsCanonical(answer: string): string | null {
  const keys: [number, number][] = []
  const seenRoots = new Set<string>()
  for (const t of answer.split(/,\s*(?=x = )/)) {
    const written = /^x = (.+?)(?: \(multiplicity (\d+)\))?$/.exec(t.trim())!
    if (written[2] === '1') return `a multiplicity of 1 written out: ${t}`
    if (seenRoots.has(written[1])) return `the root ${written[1]} is listed twice: give it a multiplicity`
    seenRoots.add(written[1])
    const text = written[1]
    const surd = /^(?:(-?\d+) ([+-]) )?(-)?sqrt\((\d+)\)$/.exec(text)
    const cplx = /^(?:(-?\d+) ([+-]) )?(-)?(?:(\d+)\*)?i$/.exec(text)
    if (surd) {
      // a surd only of a non-square: sqrt(4) is the rational 2 written in the wrong form
      const radicand = BigInt(surd[4])
      if (sqrtBig(radicand) ** 2n === radicand) return `sqrt(${surd[4]}) is a whole number, not a surd`
      const s = surd[2] === '-' || surd[3] ? -1 : 1
      keys.push([Number(surd[1] ?? 0) + s * Math.sqrt(Number(surd[4])), 0])
    } else if (cplx) {
      const s = cplx[2] === '-' || cplx[3] ? -1 : 1
      keys.push([Number(cplx[1] ?? 0), s * Number(cplx[4] ?? 1)])
    } else {
      const v = exact(parse(text), {})
      const canonical = v.d === 1n ? `${v.n}` : `${v.n}/${v.d}`
      if (text !== canonical) return `the root ${text} is not written in lowest terms as ${canonical}`
      keys.push([Number(v.n) / Number(v.d), 0])
    }
  }
  for (let i = 1; i < keys.length; i++) if (keys[i][0] < keys[i - 1][0] || (keys[i][0] === keys[i - 1][0] && keys[i][1] < keys[i - 1][1])) return 'the roots are not sorted'
  return null
}
function checkEquation(item: CorpusItem): string | null {
  const form = rootsCanonical(item.answer)
  if (form) return form
  const [lhs, rhs] = item.question.split(' = ')
  if (rhs !== '0') return 'the equation is not written "… = 0"'
  let p = coefficients(parse(lhs))
  const factors = rootFactors(item.answer)
  if (typeof factors === 'string') return factors
  let degree = 0
  for (const { f, m } of factors) {
    for (let k = 0; k < m; k++) {
      const q = divides(p, f)
      if (!q) return `a listed root (or its multiplicity) is not a root: factor of degree ${f.length - 1}`
      p = q
    }
    degree += (f.length - 1) * m
  }
  // every root is listed: what is left is a nonzero constant
  if (degreeOf(p) !== 0) return `roots are missing: ${degreeOf(p)} degree(s) left`
  return degree > 0 ? null : 'no roots'
}

/** A linear equation's coefficients and right side, exactly, from evaluating its left side at 0 and at unit vectors. */
function linearRow(eq: string, vars: string[]): { a: R[]; b: R } {
  const [lhs, rhs] = eq.split(' = ')
  const node = parse(lhs)
  const zeroAt = Object.fromEntries(vars.map((v) => [v, ZERO]))
  const c0 = exact(node, zeroAt)
  const a = vars.map((v) => sub(exact(node, { ...zeroAt, [v]: ONE }), c0))
  return { a, b: sub(exact(parse(rhs), {}), c0) }
}
function rank(rows: R[][]): number {
  const m = rows.map((row) => [...row])
  let rk = 0
  for (let col = 0; col < (m[0]?.length ?? 0) && rk < m.length; col++) {
    const piv = m.findIndex((row, i) => i >= rk && !isZero(row[col]))
    if (piv < 0) continue
    ;[m[rk], m[piv]] = [m[piv], m[rk]]
    for (let i = 0; i < m.length; i++) {
      if (i === rk || isZero(m[i][col])) continue
      const k = div(m[i][col], m[rk][col])
      m[i] = m[i].map((v, j) => sub(v, mul(k, m[rk][j])))
    }
    rk++
  }
  return rk
}
function checkSystem(item: CorpusItem): string | null {
  const eqs = item.question.split(/,\s*(?=[^,]*=)/)
  const vars = ['x', 'y', 'z'].filter((v) => new RegExp(`\\b${v}\\b`).test(item.question))
  const rows = eqs.map((e) => linearRow(e, vars))
  const rA = rank(rows.map((x) => x.a))
  const rAb = rank(rows.map((x) => [...x.a, x.b]))
  if (item.answer === 'none') return rA < rAb ? null : 'the system has a solution'
  if (item.answer === 'infinitely many') return rA === rAb && rA < vars.length ? null : 'the system is not dependent'
  if (rA !== vars.length) return 'the system has no unique solution'
  const pairs = item.answer.split(', ').map((t) => t.split(' = '))
  // exactly the system's unknowns, each once, in the order x, y, z
  if (pairs.map(([v]) => v).join(',') !== vars.join(',')) return `the answer names ${pairs.map(([v]) => v).join(',')}, not ${vars.join(',')}`
  const sol = Object.fromEntries(pairs.map(([v, val]) => [v, exact(parse(val), {})]))
  for (const row of rows) {
    const lhs = row.a.reduce((s, c, j) => add(s, mul(c, sol[vars[j]])), ZERO)
    if (!same(lhs, row.b)) return 'the solution does not satisfy an equation'
  }
  return null
}

/** The monic gcd of two polynomials (coefficient lists, low degree first), by Euclid over Q. */
function polyGcd(a: R[], b: R[]): R[] {
  const trim = (p: R[]) => {
    const q = [...p]
    while (q.length > 1 && isZero(q[q.length - 1])) q.pop()
    return q
  }
  let x = trim(a)
  let y = trim(b)
  while (!(y.length === 1 && isZero(y[0]))) {
    // remainder of x by y
    const rem = [...x]
    for (let i = rem.length - y.length; i >= 0; i--) {
      const k = div(rem[i + y.length - 1], y[y.length - 1])
      for (let j = 0; j < y.length; j++) rem[i + j] = sub(rem[i + j], mul(k, y[j]))
    }
    ;[x, y] = [y, trim(rem.slice(0, Math.max(1, y.length - 1)))]
  }
  return x.map((c) => div(c, x[x.length - 1]))
}
function checkRational(item: CorpusItem): string | null {
  const [simplified, excl] = item.answer.split(' ; excluded: ')
  if (!identical(parse(item.question), parse(simplified))) return 'the simplified form is not the same function'
  const [, qDen] = topSplit(item.question, '/')
  const [aNum, aDen] = topSplit(simplified, '/')
  const excluded = excl.split(', ').map((t) => exact(parse(t.replace(/^x = /, '')), {}))
  for (const x of excluded) {
    if (!isZero(exact(parse(qDen), { x }))) return `x = ${x.n}/${x.d} is not excluded by the question`
    if (isZero(exact(parse(aDen), { x }))) return `x = ${x.n}/${x.d} is still a pole of the simplified form`
  }
  // Simplest: the kept top and bottom share no factor — no polynomial one, and no whole-number content ((2x+2)/(2x+4)).
  const top = coefficients(parse(aNum))
  const bottom = coefficients(parse(aDen))
  if (degreeOf(polyGcd(top, bottom)) > 0) return 'the simplified form can still cancel'
  if ([...top, ...bottom].every((c) => c.d === 1n) && [...top, ...bottom].reduce((g, c) => bgcd(g, c.n), 0n) > 1n) return 'the top and bottom share a whole-number factor'
  // and the bottom is normalised — integer coefficients, no common factor, leading one positive — so no scalar of any
  // kind (2, or 1/2 as in (x/2 + 1/2)/(x/2 + 1)) is left for top and bottom to share
  if (bottom.some((c) => c.d !== 1n) || bottom.reduce((g, c) => bgcd(g, c.n), 0n) !== 1n || bottom[bottom.length - 1].n < 0n) return 'the bottom is not a primitive integer polynomial with a positive leading coefficient'
  // Every cancelled zero is listed: what the question's bottom has beyond the answer's is exactly the listed points,
  // each to its multiplicity, and nothing else.
  const cancelled = divides(coefficients(parse(qDen)), coefficients(parse(aDen)))
  if (!cancelled) return "the answer's bottom does not divide the question's"
  let rest = cancelled
  for (const x of excluded) {
    let q = divides(rest, [r(-x.n, x.d), ONE])
    if (!q) return `x = ${x.n}/${x.d} is not a zero of the cancelled factor`
    while (q) {
      rest = q
      q = divides(rest, [r(-x.n, x.d), ONE])
    }
  }
  if (degreeOf(rest) > 0) return 'the cancelled factor has a zero that is not listed'
  return null
}

/** 60-digit arithmetic: a function of size 6×10²⁴ makes a double's difference quotient pure noise. */
const big = mathjs.create(mathjs.all, { number: 'BigNumber', precision: 60 })
function checkDerivative(item: CorpusItem): string | null {
  // the promised FORM: mathjs's derivative, unsimplified (simplifying folds big constants into doubles)
  const written = mathjs.derivative(item.question.replace(/\bln\(/g, 'log('), 'x', { simplify: false }).toString().replace(/\blog\(/g, 'ln(')
  if (written !== item.answer) return `the key is not the unsimplified derivative: ${item.answer}`
  const f = big.compile(item.question.replace(/\bln\(/g, 'log('))
  const d = big.compile(item.answer.replace(/\bln\(/g, 'log('))
  const h = big.bignumber('1e-25')
  // 15 points, most of them generic (no small rational a false formula could be tuned to), at 60 digits: two
  // different elementary formulas of this size cannot agree at all of them to 20 digits.
  // plus 10 points drawn from the item's own id (a hash), so no key can be tuned to a known set of points
  let seed = [...item.id].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 2166136261)
  const drawn = Array.from({ length: 10 }, () => {
    seed = (Math.imul(seed ^ (seed >>> 15), 2246822519) + 0x9e3779b9) >>> 0
    return (((seed / 4294967296) * 5 - 2.5) as number).toFixed(12)
  })
  for (const at of ['-1.7', '-0.6', '0.35', '0.9', '1.4', '-1.2345678901', '0.7182818284', '1.4142135623', '-0.3183098861', '2.2360679774', '-2.6457513110', '0.5772156649', '1.6180339887', '-0.8660254037', '0.1234567891', ...drawn]) {
    const x = big.bignumber(at)
    const up = f.evaluate({ x: big.add(x, h) }) as mathjs.BigNumber
    const down = f.evaluate({ x: big.subtract(x, h) }) as mathjs.BigNumber
    const num = big.divide(big.subtract(up, down), big.multiply(2, h)) as mathjs.BigNumber
    const sym = d.evaluate({ x }) as mathjs.BigNumber
    const scale = big.max(1, big.abs(sym), big.abs(up)) as mathjs.BigNumber
    // central difference error ~ h²·f‴ and rounding ~ 10⁻⁶⁰·|f|/h: far below 10⁻²⁰ of the scale here
    // decimal.js's own comparison: mathjs's `smaller` calls numbers within its tolerance equal (0 < 10⁻²⁰ is false there)
    const miss = big.abs(big.subtract(num, sym)) as mathjs.BigNumber
    if (!miss.lte(big.multiply(scale, big.bignumber('1e-20')) as mathjs.BigNumber)) return `the derivative misses at x = ${at}: ${sym} vs ${num}`
  }
  return null
}

/** Every bracketed group of a string. */
function groups(s: string): string[] {
  const out: string[] = []
  const open: number[] = []
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') open.push(i)
    else if (s[i] === ')') out.push(s.slice(open.pop()! + 1, i))
  }
  return out
}
/** Expanded: a sum of c·x^k with no bracket around anything holding x, and each power once. */
function checkExpanded(item: CorpusItem): string | null {
  if (!identical(parse(item.question), parse(item.answer))) return 'the answer is not the same expression'
  if (groups(item.answer).some((g) => /x/.test(g))) return 'the answer still has a bracket around x: not expanded'
  const powers = [...item.answer.matchAll(/x(?:\^(\d+))?/g)].map((m) => m[1] ?? '1')
  if (new Set(powers).size !== powers.length) return 'a power of x appears twice: not collected'
  // and one constant term at most (x + 1 + 1 is not collected either)
  const terms = topSplit(item.answer.replace(/ - /g, ' + -'), ' + ')
  if (terms.filter((t) => !/x/.test(t)).length > 1) return 'two constant terms: not collected'
  return null
}
/** One fraction per term: top/(block)^m, the block linear or an irreducible quadratic, the top of lower degree. */
function checkPartialFractions(item: CorpusItem): string | null {
  if (!identical(parse(item.question), parse(item.answer))) return 'the answer is not the same expression'
  const seen = new Set<string>()
  const terms = topSplit(item.answer, ' + ')
  if (terms.length < 2) return 'not decomposed: one term'
  for (const t of terms) {
    const m = /^(.+)\/\(([^()]+)\)(?:\^(\d+))?$/.exec(t)
    if (!m) return `not one fraction over a bracketed block: ${t}`
    const block = coefficients(parse(m[2]), 4)
    const top = coefficients(parse(m[1].replace(/^\((.*)\)$/, '$1')), 3)
    const db = degreeOf(block)
    if (db < 1 || db > 2) return `a block of degree ${db}: ${t}`
    if (degreeOf(top) >= db) return `a top of degree ${degreeOf(top)} over a block of degree ${db}: ${t}`
    if (db === 2) {
      const disc = sub(mul(block[1], block[1]), mul(r(4n), mul(block[2], block[0])))
      if (disc.n >= 0n && sqrtBig(disc.n) ** 2n === disc.n && sqrtBig(disc.d) ** 2n === disc.d) return `a quadratic block that splits: ${t}`
    }
    const key = `${m[2]}^${m[3] ?? 1}`
    if (seen.has(key)) return `the term over ${key} appears twice`
    seen.add(key)
  }
  return null
}

function checkItem(item: CorpusItem): string | null {
  switch (item.class) {
    case 'expand':
      return checkExpanded(item)
    case 'partial fractions':
      return checkPartialFractions(item)
    case 'factor over Q':
      return checkFactor(item)
    case 'polynomial equations':
      return checkEquation(item)
    case 'linear systems':
      return checkSystem(item)
    case 'rational simplification':
      return checkRational(item)
    case 'derivatives':
      return checkDerivative(item)
  }
  return `unknown class ${item.class}`
}

// ---- the tests ---------------------------------------------------------------------------------------------------

const load = (f: string): CorpusItem[] => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'))
const corpora = { generator: load('generator.json'), gating: load('gating.json') }

describe('the scoreboard corpora', () => {
  it.each(Object.entries(corpora))('%s: every class has its share, and no id or question twice', (name, items) => {
    const min = name === 'generator' ? 300 : 200
    for (const cls of CLASSES) expect(items.filter((i) => i.class === cls).length, cls).toBeGreaterThanOrEqual(min)
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
    for (const cls of CLASSES) {
      const qs = items.filter((i) => i.class === cls).map((i) => i.question)
      expect(new Set(qs).size, cls).toBe(qs.length)
    }
  })

  it('the gating corpus shares no question with the generator corpus', () => {
    const gen = new Set(corpora.generator.map((i) => `${i.class}|${i.question}`))
    expect(corpora.gating.filter((i) => gen.has(`${i.class}|${i.question}`)).map((i) => i.id)).toEqual([])
  })

  it.each(Object.entries(corpora))('%s: every key re-checks by a second, exact path', (_name, items) => {
    const bad = items.map((i) => ({ id: i.id, why: checkItem(i) })).filter((x) => x.why)
    expect(bad.slice(0, 5)).toEqual([])
  }, 300_000)

  it('a wrong key in any class is caught (one planted per class)', () => {
    const plant = (i: CorpusItem): CorpusItem => {
      switch (i.class) {
        case 'linear systems':
          return { ...i, answer: i.answer === 'none' ? 'infinitely many' : i.answer === 'infinitely many' ? 'none' : i.answer.replace(/= (-?\d+)/, (_, v) => `= ${Number(v) + 1}`) }
        case 'rational simplification':
          return { ...i, answer: i.answer.replace(/excluded: x = (-?\d+)/, (_, v) => `excluded: x = ${Number(v) + 1}`) }
        case 'polynomial equations':
          return { ...i, answer: i.answer.replace(/x = (-?\d+)(?![/\d])/, (_, v) => `x = ${Number(v) + 1}`) }
        case 'derivatives':
          return { ...i, answer: `(${i.answer}) + 1` }
        default:
          return { ...i, answer: `(${i.answer}) + x` }
      }
    }
    for (const cls of CLASSES) {
      const item = corpora.generator.find((i) => i.class === cls && plant(i).answer !== i.answer)!
      expect(checkItem(plant(item)), `${cls}: ${item.id}`).not.toBeNull()
    }
  })

  it('a right answer in the wrong form is caught too (the forms the doc promises)', () => {
    const first = (cls: string, stratum?: string) => corpora.generator.find((i) => i.class === cls && (!stratum || i.stratum === stratum))!
    const ex = first('expand')
    expect(checkItem({ ...ex, answer: ex.question }), 'expand: the unexpanded question').not.toBeNull()
    const fa = first('factor over Q')
    expect(checkItem({ ...fa, answer: fa.question }), 'factor: the unfactored polynomial').not.toBeNull()
    const pf = first('partial fractions')
    expect(checkItem({ ...pf, answer: pf.question }), 'partial fractions: one fraction').not.toBeNull()
    const rs = first('rational simplification', 'quad-cancel')
    expect(checkItem({ ...rs, answer: rs.answer.replace(/, x = [^,]+$/, '') }), 'rational: a cancelled zero left out').not.toBeNull()
    const pe = first('polynomial equations', 'rational')
    const reversed = pe.answer.split(', ').reverse().join(', ')
    expect(checkItem({ ...pe, answer: reversed }), 'equation: the roots out of order').not.toBeNull()
    // a whole number spelled as a surd pair: x² − 2x − 3 = 0 has x = −1 and 3, i.e. 1 ∓ sqrt(4)
    expect(checkItem({ ...pe, question: 'x^2 - 2*x - 3 = 0', answer: 'x = 1 - sqrt(4), x = 1 + sqrt(4)' }), 'equation: sqrt(4) as a surd').not.toBeNull()
    expect(checkItem({ ...fa, question: 'x^2 - 1', answer: '(x - 1)^1 * (x + 1)' }), 'factor: an explicit ^1').not.toBeNull()
    expect(checkItem({ ...ex, question: '(x + 1) * (x + 1)', answer: 'x^2 + 2*x + 1 + 0' }), 'expand: two constant terms').not.toBeNull()
    expect(checkItem({ ...rs, question: '((2*x + 2)*(x - 1))/((2*x + 4)*(x - 1))', answer: '(2*x + 2)/(2*x + 4) ; excluded: x = 1' }), 'rational: a common 2').not.toBeNull()
    expect(checkItem({ ...rs, question: '((x + 1)*(x - 1))/((x + 2)*(x - 1))', answer: '(x/2 + 1/2)/(x/2 + 1) ; excluded: x = 1' }), 'rational: a common 1/2').not.toBeNull()
    // the final review's points
    expect(checkItem({ ...fa, question: 'x^2 - 1', answer: '(1) * (x - 1) * (x + 1)' }), 'factor: a bracketed constant').not.toBeNull()
    expect(checkItem({ ...pe, question: 'x^2 - 1 = 0', answer: 'x = -1 (multiplicity 1), x = 1' }), 'equation: multiplicity 1 written out').not.toBeNull()
    expect(checkItem({ ...pe, question: 'x^2 - 2*x + 1 = 0', answer: 'x = 1, x = 1' }), 'equation: a root listed twice').not.toBeNull()
    const de = first('derivatives')
    expect(checkItem({ ...de, question: 'x^3', answer: '3*x^2' }), 'derivative: simplified, not the unsimplified form').not.toBeNull()
  })

  it('the gating corpus shares no raw question with the generator, whatever the class', () => {
    const gen = new Set(corpora.generator.map((i) => i.question))
    expect(corpora.gating.filter((i) => gen.has(i.question)).map((i) => i.id)).toEqual([])
    // the comparison is proved able to fire on a planted copy
    const copy = { ...corpora.gating[0], question: corpora.generator[0].question }
    expect([copy].filter((i) => gen.has(i.question))).toHaveLength(1)
  })
})

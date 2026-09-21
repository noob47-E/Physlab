// Numeric engine behind the calculator panel (fx-991EX feature set and more).

import type { MathNode } from 'mathjs'
import { math, preprocess, setAngleMode, splitArgs } from '../math/expr'
import { constantScope } from './constants'
import { calcNum, mathFormatOptions } from './format'

// ---------------------------------------------------------------------------
// Input normalisation: calculator key symbols → mathjs
// ---------------------------------------------------------------------------

export function casioToMath(src: string): string {
  let s = src
    .replace(/×10\^?/g, '*10^')
    .replace(/ᴇ/g, '*10^')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/ˣ√\(/g, 'nthRootC(')
    .replace(/(\d+(?:\.\d+)?)%/g, '($1/100)')
    .replace(/\bAns\b/g, 'Ans')
  // Degrees-minutes-seconds: 30°15'20"
  s = s.replace(/(\d+(?:\.\d+)?)°(\d+(?:\.\d+)?)'(?:(\d+(?:\.\d+)?)")?/g, (_m, d, m, sec) => `(${d}+${m}/60+${sec ?? 0}/3600)`)
  return preprocess(s)
}

// ---------------------------------------------------------------------------
// Calculus helpers
// ---------------------------------------------------------------------------

export function derivativeAt(f: (x: number) => number, x: number): number {
  const h = 1e-3 * Math.max(1, Math.abs(x))
  return (-f(x + 2 * h) + 8 * f(x + h) - 8 * f(x - h) + f(x - 2 * h)) / (12 * h)
}

export function integrate(f: (x: number) => number, a: number, b: number, tol = 1e-10): number {
  if (a === b) return 0
  const simpson = (fa: number, fm: number, fb: number, a0: number, b0: number) => ((b0 - a0) / 6) * (fa + 4 * fm + fb)
  const rec = (a0: number, b0: number, fa: number, fm: number, fb: number, whole: number, eps: number, depth: number): number => {
    const m = (a0 + b0) / 2
    const lm = (a0 + m) / 2
    const rm = (m + b0) / 2
    const flm = f(lm)
    const frm = f(rm)
    const left = simpson(fa, flm, fm, a0, m)
    const right = simpson(fm, frm, fb, m, b0)
    if (depth > 48 || Math.abs(left + right - whole) <= 15 * eps) return left + right + (left + right - whole) / 15
    return rec(a0, m, fa, flm, fm, left, eps / 2, depth + 1) + rec(m, b0, fm, frm, fb, right, eps / 2, depth + 1)
  }
  // Split into pieces so narrow features are not missed.
  const pieces = 16
  let total = 0
  for (let i = 0; i < pieces; i++) {
    const a0 = a + ((b - a) * i) / pieces
    const b0 = a + ((b - a) * (i + 1)) / pieces
    const fa = f(a0)
    const fb = f(b0)
    const fm = f((a0 + b0) / 2)
    total += rec(a0, b0, fa, fm, fb, simpson(fa, fm, fb, a0, b0), tol / pieces, 0)
  }
  return total
}

/** Numeric root of f near `guess` (Newton, then bracketing scan + bisection). */
export function solveNumeric(f: (x: number) => number, guess = 0): number {
  let x = guess
  for (let i = 0; i < 60; i++) {
    const y = f(x)
    if (!Number.isFinite(y)) break
    if (Math.abs(y) < 1e-14) return x
    const d = derivativeAt(f, x)
    if (!Number.isFinite(d) || Math.abs(d) < 1e-14) break
    const nx = x - y / d
    if (Math.abs(nx - x) < 1e-13 * Math.max(1, Math.abs(x))) return nx
    x = nx
  }
  if (Number.isFinite(f(x)) && Math.abs(f(x)) < 1e-9) return x
  const scan = (lo: number, hi: number, n: number) => {
    let px = lo
    let py = f(px)
    for (let i = 1; i <= n; i++) {
      const cx = lo + ((hi - lo) * i) / n
      const cy = f(cx)
      if (Number.isFinite(py) && Number.isFinite(cy) && Math.sign(py) !== Math.sign(cy)) {
        let a = px
        let b = cx
        // 60 halvings take a 2 000 000-wide bracket below 10⁻¹²; the 200 it used to do were
        // 140 evaluations of f for nothing, on every bracket, on the main thread.
        for (let k = 0; k < 60; k++) {
          const m = (a + b) / 2
          if (Math.sign(f(m)) === Math.sign(f(a))) a = m
          else b = m
        }
        const r = (a + b) / 2
        if (Math.abs(f(r)) < 1e-6 * Math.max(1, Math.abs(py), Math.abs(cy))) return r
      }
      px = cx
      py = cy
    }
    return NaN
  }
  // 1 000 points per sweep, not 4 000: an equation with no root used to cost 16 000 evaluations
  // of f (each a mathjs evaluate) before "No solution", a visible freeze after Enter.
  for (const R of [10, 100, 1e4, 1e6]) {
    const r = scan(guess - R, guess + R, 1000)
    if (Number.isFinite(r)) return r
  }
  throw new Error('No solution found')
}

// ---------------------------------------------------------------------------
// mathjs extensions for calculator syntax
// ---------------------------------------------------------------------------

type Raw = ((args: MathNode[], m: typeof math, scope: Map<string, unknown>) => unknown) & { rawArgs?: boolean }

const scopeToObject = (scope: Map<string, unknown> | Record<string, unknown>): Record<string, unknown> =>
  scope instanceof Map ? Object.fromEntries(scope) : { ...scope }

function lambdaOf(node: MathNode, scope: Map<string, unknown>, variable = 'x') {
  const code = node.compile()
  const base = scopeToObject(scope)
  // Calculus follows the angle mode, the way the real calculator does. Forcing radians here
  // answered a different question from the one that was typed: in DEG mode, sin(30) means 30
  // degrees, so ddx(sin(x), 30) has to mean the slope at 30 degrees too — otherwise the same
  // number means two things on one screen, and the answer disagrees with the calculator in the
  // student's hand. (The fx-991EX manual advises the user to switch to Rad for trig calculus;
  // it does not switch for them.)
  return (v: number) => Number(code.evaluate({ ...base, [variable]: v }))
}

const raw = (fn: Raw): Raw => {
  fn.rawArgs = true
  return fn
}

math.import(
  {
    // d/dx(f(x), a)
    ddx: raw((args, _m, scope) => {
      const at = Number(args[1].compile().evaluate(scopeToObject(scope)))
      return derivativeAt(lambdaOf(args[0], scope), at)
    }),
    // ∫(f(x), a, b)
    integral: raw((args, _m, scope) => {
      const s = scopeToObject(scope)
      return integrate(lambdaOf(args[0], scope), Number(args[1].compile().evaluate(s)), Number(args[2].compile().evaluate(s)))
    }),
    // Σ(f(x), a, b)
    sigma: raw((args, _m, scope) => {
      const s = scopeToObject(scope)
      const f = lambdaOf(args[0], scope)
      const a = Math.round(Number(args[1].compile().evaluate(s)))
      const b = Math.round(Number(args[2].compile().evaluate(s)))
      let t = 0
      for (let k = a; k <= b; k++) t += f(k)
      return t
    }),
    // Π(f(x), a, b)
    product: raw((args, _m, scope) => {
      const s = scopeToObject(scope)
      const f = lambdaOf(args[0], scope)
      const a = Math.round(Number(args[1].compile().evaluate(s)))
      const b = Math.round(Number(args[2].compile().evaluate(s)))
      let t = 1
      for (let k = a; k <= b; k++) t *= f(k)
      return t
    }),
    nPr: (n: number, r: number) => math.permutations(n, r),
    nCr: (n: number, r: number) => math.combinations(n, r),
    nthRootC: (n: number, x: number) => (x < 0 && n % 2 === 1 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n)),
    Int: (x: number) => Math.trunc(x),
    Intg: (x: number) => Math.floor(x),
    RanInt: (a: number, b: number) => Math.floor(a + Math.random() * (b - a + 1)),
    Ran: () => Math.round(Math.random() * 1000) / 1000,
    GCD: (...a: number[]) => math.gcd(...(a as [number, number])),
    LCM: (...a: number[]) => math.lcm(...(a as [number, number])),
    Abs: (x: number) => math.abs(x),
    // Capitalised because the constants list defines r_e (the classical electron radius) under
    // the spelling `re` as well, and that number shadowed mathjs's own re() in every scope.
    Re: (z: unknown) => math.re(z as never),
    Im: (z: unknown) => math.im(z as never)
  },
  { override: true }
)

export interface CalcOutput {
  value: unknown
  /** Main display string. */
  text: string
  /** Secondary lines (e.g. Pol → r and θ). */
  extra?: string[]
  latexInput?: string
}

export interface CalcContext {
  vars: Record<string, unknown>
  ans: unknown
  angle: 'deg' | 'rad'
}

/** Evaluate a COMP-mode line. Handles Pol(), Rec(), SOLVE (with "=") and variables. */
export function evaluateComp(input: string, ctx: CalcContext): CalcOutput {
  setAngleMode(ctx.angle)
  const src = input.trim()
  if (!src) throw new Error('Empty')
  const scope: Record<string, unknown> = { ...constantScope(), ...ctx.vars, Ans: ctx.ans ?? 0 }

  // splitArgs, not a regex: Pol(max(1,3), 4) must split on the right comma.
  const pol = src.match(/^Pol\((.*)\)$/i)
  const polArgs = pol ? splitArgs(pol[1]) : null
  if (polArgs?.length === 2) {
    const x = Number(math.evaluate(casioToMath(polArgs[0]), scope))
    const y = Number(math.evaluate(casioToMath(polArgs[1]), scope))
    const r = Math.hypot(x, y)
    const theta = Math.atan2(y, x)
    const th = ctx.angle === 'deg' ? (theta * 180) / Math.PI : theta
    return { value: r, text: `r = ${calcNum(r)}`, extra: [`θ = ${calcNum(th)}${ctx.angle === 'deg' ? '°' : ' rad'}`] }
  }
  const rec = src.match(/^Rec\((.*)\)$/i)
  const recArgs = rec ? splitArgs(rec[1]) : null
  if (recArgs?.length === 2) {
    const r = Number(math.evaluate(casioToMath(recArgs[0]), scope))
    const t = Number(math.evaluate(casioToMath(recArgs[1]), scope))
    const tr = ctx.angle === 'deg' ? (t * Math.PI) / 180 : t
    return { value: r * Math.cos(tr), text: `x = ${calcNum(r * Math.cos(tr))}`, extra: [`y = ${calcNum(r * Math.sin(tr))}`] }
  }
  // SOLVE: an equation in x
  if (/^[^=]+=[^=]+$/.test(src) && /(^|[^A-Za-z])x([^A-Za-z]|$)/.test(src)) {
    const [l, r] = src.split('=')
    const fl = math.compile(casioToMath(l))
    const fr = math.compile(casioToMath(r))
    const f = (x: number) => Number(fl.evaluate({ ...scope, x })) - Number(fr.evaluate({ ...scope, x }))
    const guess = typeof ctx.vars.x === 'number' ? (ctx.vars.x as number) : 0
    const root = solveNumeric(f, guess)
    return { value: root, text: `x = ${calcNum(root)}`, extra: [`L − R = ${calcNum(f(root))}`] }
  }
  const node = math.parse(casioToMath(src))
  const value = node.compile().evaluate(scope)
  let latexInput: string | undefined
  try {
    latexInput = node.toTex({ parenthesis: 'auto', implicit: 'hide' })
  } catch {
    latexInput = undefined
  }
  return { value, text: formatValue(value), latexInput }
}

export function formatValue(v: unknown): string {
  if (typeof v === 'number') return calcNum(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  // A complex number's two parts are numbers, and they follow the same never-pad rule as any
  // other: mathjs's fixed notation wrote 2.00i on the same screen as a trimmed 5.
  if (math.isComplex(v)) {
    const c = v as { re: number; im: number }
    if (c.im === 0) return calcNum(c.re)
    const im = Math.abs(c.im) === 1 ? 'i' : `${calcNum(Math.abs(c.im))}i`
    return c.re === 0 ? `${c.im < 0 ? '−' : ''}${im}` : `${calcNum(c.re)} ${c.im < 0 ? '−' : '+'} ${im}`
  }
  try {
    return math.format(v as never, mathFormatOptions())
  } catch {
    return String(v)
  }
}

// ---------------------------------------------------------------------------
// Exact forms (the "exact / decimal" chip): fractions, surds, π multiples — offline recognition
// ---------------------------------------------------------------------------

export function toFraction(v: number, maxDen = 100000): [number, number] | null {
  if (!Number.isFinite(v)) return null
  let h1 = 1
  let h0 = 0
  let k1 = 0
  let k0 = 1
  let x = v
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(x)
    ;[h1, h0] = [a * h1 + h0, h1]
    ;[k1, k0] = [a * k1 + k0, k1]
    if (k1 > maxDen) return null
    if (Math.abs(v - h1 / k1) < 1e-11 * Math.max(1, Math.abs(v))) return [h1, k1]
    const frac = x - a
    if (frac < 1e-14) break
    x = 1 / frac
  }
  return Math.abs(v - h1 / k1) < 1e-11 * Math.max(1, Math.abs(v)) ? [h1, k1] : null
}

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b))

function fracTex(n: number, d: number, suffix = ''): string {
  const sign = n < 0 ? '-' : ''
  n = Math.abs(n)
  if (d === 1) return `${sign}${n === 1 && suffix ? '' : n}${suffix}`
  return `${sign}\\frac{${n === 1 && suffix ? '' : n}${suffix}}{${d}}`
}

/** Recognises v as p/q, p√r/q or pπ/q. Returns LaTeX or null. */
export function exactForm(v: number): string | null {
  if (!Number.isFinite(v)) return null
  if (Number.isInteger(v)) return String(v)
  // A physical constant is not "exactly 0": the fraction search below accepts anything within
  // 10⁻¹¹ of a whole number, which used to turn 7 ÷ 3h into the exact answer 0.
  if (Math.abs(v) < 1e-9) return null
  const f = toFraction(v, 10000)
  if (f) return fracTex(f[0], f[1])
  const piF = toFraction(v / Math.PI, 360)
  if (piF) return fracTex(piF[0], piF[1], '\\pi')
  const sq = toFraction(v * v, 100000)
  // v² within 10⁻¹¹ of zero is read as the fraction 0/1, and the answer for 1 ÷ 500000 was √0.
  if (sq && sq[0] !== 0) {
    // v = ±√(n/d) = ±√(n·d)/d, pull out square factors.
    const [n, d] = sq
    const sign = v < 0 ? -1 : 1
    let inside = n * d
    let outside = 1
    for (let k = 2; k * k <= inside; k++) {
      while (inside % (k * k) === 0) {
        inside /= k * k
        outside *= k
      }
    }
    const g = gcd(outside, d)
    const num = outside / g
    const den = d / g
    if (inside !== 1 && inside < 1e6) return fracTex(sign * num, den, `\\sqrt{${inside}}`)
  }
  return null
}

// ---------------------------------------------------------------------------
// BASE-N
// ---------------------------------------------------------------------------

export type Base = 2 | 8 | 10 | 16

export function toInt32(x: number): number {
  return x | 0
}

export function formatBase(v: number, base: Base): string {
  const n = toInt32(v)
  if (base === 10) return String(n)
  const u = n >>> 0
  const digits = base === 2 ? 32 : base === 8 ? 11 : 8
  const s = u.toString(base).toUpperCase()
  return base === 2 ? s.padStart(Math.min(digits, Math.ceil(s.length / 4) * 4), '0') : s
}

type BaseTok = { kind: 'num'; value: number } | { kind: 'op'; value: string }

/**
 * Whole-number arithmetic and logic in the chosen base, the way a BASE-N calculator does it.
 *
 * Every division is a whole-number division on its own: 7 ÷ 2 × 2 is 6, because 7 ÷ 2 is 3 on
 * the calculator's screen before it is multiplied. The old version worked in decimals and only
 * threw the fraction away at the very end, giving 7 — and did so by handing the string to
 * Function(), which is not something a calculator should do with what a student typed.
 */
export function evaluateBaseN(input: string, base: Base): number {
  const digits = base === 16 ? /^[0-9A-Fa-f]+/ : base === 8 ? /^[0-7]+/ : base === 2 ? /^[01]+/ : /^\d+/
  const words: Record<string, string> = { and: '&', or: '|', xor: '^', xnor: 'xnor', not: '~', neg: 'neg' }
  const toks: BaseTok[] = []
  let s = input.trim()
  while (s.length) {
    if (/^\s/.test(s)) {
      s = s.replace(/^\s+/, '')
      continue
    }
    const word = s.match(/^[a-zA-Z]+/)
    const digit = s.match(digits)
    // In hex "and" would also read as digits, so words are tried first — but only whole words.
    if (word && words[word[0].toLowerCase()] && !(digit && digit[0].length > word[0].length)) {
      toks.push({ kind: 'op', value: words[word[0].toLowerCase()] })
      s = s.slice(word[0].length)
      continue
    }
    if (digit) {
      toks.push({ kind: 'num', value: parseInt(digit[0], base) })
      s = s.slice(digit[0].length)
      continue
    }
    if ('+-*/()&|^~'.includes(s[0])) {
      toks.push({ kind: 'op', value: s[0] })
      s = s.slice(1)
      continue
    }
    throw new Error('Syntax ERROR')
  }

  let pos = 0
  const peek = (): BaseTok | undefined => toks[pos]
  const isOp = (v: string): boolean => {
    const t = peek()
    return t?.kind === 'op' && t.value === v
  }
  const take = (): BaseTok => {
    const t = toks[pos++]
    if (!t) throw new Error('Syntax ERROR')
    return t
  }
  // Precedence, lowest first: or, xor/xnor, and, add/subtract, multiply/divide, unary, brackets.
  const primary = (): number => {
    const t = take()
    if (t.kind === 'num') return toInt32(t.value)
    if (t.value === '(') {
      const v = or()
      if (!isOp(')')) throw new Error('Syntax ERROR')
      pos++
      return v
    }
    throw new Error('Syntax ERROR')
  }
  const unary = (): number => {
    if (isOp('-') || isOp('neg')) {
      pos++
      return toInt32(-unary())
    }
    if (isOp('~')) {
      pos++
      return toInt32(~unary())
    }
    return primary()
  }
  const mul = (): number => {
    let v = unary()
    while (isOp('*') || isOp('/')) {
      const op = take().value
      const r = unary()
      // Math.imul is the exact 32-bit wrap-around; a double product of two 31-bit numbers loses
      // its low bits, and 7FFFFFFF × 7FFFFFFF came out as 0.
      if (op === '*') v = Math.imul(v, r)
      else {
        if (r === 0) throw new Error('Math ERROR')
        v = toInt32(Math.trunc(v / r))
      }
    }
    return v
  }
  const add = (): number => {
    let v = mul()
    while (isOp('+') || isOp('-')) {
      const op = take().value
      const r = mul()
      v = toInt32(op === '+' ? v + r : v - r)
    }
    return v
  }
  const and = (): number => {
    let v = add()
    while (isOp('&')) {
      pos++
      v = toInt32(v & add())
    }
    return v
  }
  const xor = (): number => {
    let v = and()
    while (isOp('^') || isOp('xnor')) {
      const op = take().value
      const r = and()
      v = toInt32(op === '^' ? v ^ r : ~(v ^ r))
    }
    return v
  }
  const or = (): number => {
    let v = xor()
    while (isOp('|')) {
      pos++
      v = toInt32(v | xor())
    }
    return v
  }
  if (!toks.length) throw new Error('Syntax ERROR')
  const out = or()
  if (pos !== toks.length) throw new Error('Syntax ERROR')
  return out
}

// ---------------------------------------------------------------------------
// Polynomials, linear systems, inequalities
// ---------------------------------------------------------------------------

export interface Cx {
  re: number
  im: number
}

/** All roots of a polynomial with coefficients [aₙ … a₀] (Durand–Kerner + polishing). */
export function polyRoots(coeffs: number[]): Cx[] {
  let c = [...coeffs]
  while (c.length > 1 && Math.abs(c[0]) < 1e-15) c.shift()
  const n = c.length - 1
  if (n < 1) return []
  const lead = c[0]
  c = c.map((v) => v / lead)
  const mul = (a: Cx, b: Cx): Cx => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re })
  const subC = (a: Cx, b: Cx): Cx => ({ re: a.re - b.re, im: a.im - b.im })
  const div = (a: Cx, b: Cx): Cx => {
    const d = b.re * b.re + b.im * b.im
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }
  }
  const evalP = (z: Cx): Cx => c.reduce<Cx>((acc, coef) => ({ re: mul(acc, z).re + coef, im: mul(acc, z).im }), { re: 0, im: 0 })
  const bound = 1 + Math.max(...c.slice(1).map(Math.abs))
  let roots: Cx[] = Array.from({ length: n }, (_, k) => ({ re: bound * 0.9 * Math.cos((2 * Math.PI * k) / n + 0.4), im: bound * 0.9 * Math.sin((2 * Math.PI * k) / n + 0.4) }))
  for (let iter = 0; iter < 2000; iter++) {
    let maxStep = 0
    roots = roots.map((z, i) => {
      let den: Cx = { re: 1, im: 0 }
      roots.forEach((w, j) => {
        if (i !== j) den = mul(den, subC(z, w))
      })
      const step = div(evalP(z), den)
      maxStep = Math.max(maxStep, Math.hypot(step.re, step.im))
      return subC(z, step)
    })
    if (maxStep < 1e-15) break
  }
  return roots
    .map((z) => ({ re: Math.abs(z.re) < 1e-12 ? 0 : z.re, im: Math.abs(z.im) < 1e-9 ? 0 : z.im }))
    .sort((a, b) => a.re - b.re || a.im - b.im)
}

export function solveLinearSystem(A: number[][], b: number[]): number[] {
  const det = Number(math.det(A))
  if (Math.abs(det) < 1e-14) throw new Error('No unique solution (determinant is 0)')
  const x = math.lusolve(A, b) as number[][]
  return x.map((row) => row[0])
}

/** Solution set of p(x) op 0 as intervals. */
export function polyInequality(coeffs: number[], op: '<' | '<=' | '>' | '>='): { from: number; to: number; closedFrom: boolean; closedTo: boolean }[] {
  const real = polyRoots(coeffs)
    .filter((r) => r.im === 0)
    .map((r) => r.re)
    .filter((v, i, arr) => arr.findIndex((w) => Math.abs(w - v) < 1e-9) === i)
    .sort((a, b) => a - b)
  const p = (x: number) => coeffs.reduce((acc, c) => acc * x + c, 0)
  const ok = (v: number) => (op === '<' ? v < 0 : op === '<=' ? v <= 1e-12 : op === '>' ? v > 0 : v >= -1e-12)
  const edges = [-Infinity, ...real, Infinity]
  const out: { from: number; to: number; closedFrom: boolean; closedTo: boolean }[] = []
  const inclusive = op === '<=' || op === '>='
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i]
    const b = edges[i + 1]
    const mid = !Number.isFinite(a) ? b - 1 : !Number.isFinite(b) ? a + 1 : (a + b) / 2
    if (ok(p(mid))) {
      const last = out[out.length - 1]
      if (last && last.to === a && inclusive) {
        last.to = b
        // Nothing is ever closed at infinity.
        last.closedTo = Number.isFinite(b)
      }
      else out.push({ from: a, to: b, closedFrom: inclusive && Number.isFinite(a), closedTo: inclusive && Number.isFinite(b) })
    } else if (inclusive && Number.isFinite(b) && i < edges.length - 2) {
      // isolated touching root
      if (!out.length || out[out.length - 1].to !== b) out.push({ from: b, to: b, closedFrom: true, closedTo: true })
    }
  }
  return out.filter((iv, i, arr) => !(iv.from === iv.to && arr.some((o, j) => j !== i && o.from <= iv.from && o.to >= iv.to && o.from !== o.to)))
}

export function polyToExpr(coeffs: number[]): string {
  const n = coeffs.length - 1
  return coeffs
    .map((c, i) => {
      const p = n - i
      if (c === 0) return ''
      const term = p === 0 ? `${c}` : p === 1 ? `${c}*x` : `${c}*x^${p}`
      return term
    })
    .filter(Boolean)
    .join(' + ')
    .replace(/\+ -/g, '- ') || '0'
}

// ---------------------------------------------------------------------------
// Statistics & regression
// ---------------------------------------------------------------------------

export type RegressionType = 'single' | 'linear' | 'quadratic' | 'log' | 'exp' | 'abExp' | 'power' | 'inverse'

export interface StatResult {
  n: number
  mean: number
  sx: number
  sigmaX: number
  sum: number
  sumSq: number
  min: number
  q1: number
  median: number
  q3: number
  max: number
  meanY?: number
  sigmaY?: number
  sy?: number
  coef?: Record<string, number>
  r?: number
  expr?: string
  label?: string
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

function linFit(xs: number[], ys: number[]) {
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  const b = sxy / sxx
  return { a: my - b * mx, b, r: sxy / Math.sqrt(sxx * syy) }
}

export function statistics(xsIn: number[], ysIn: number[] | null, freq: number[] | null, type: RegressionType): StatResult {
  const xs: number[] = []
  const ys: number[] = []
  xsIn.forEach((x, i) => {
    const f = Math.max(0, Math.round(freq?.[i] ?? 1))
    for (let k = 0; k < f; k++) {
      xs.push(x)
      if (ysIn) ys.push(ysIn[i])
    }
  })
  const n = xs.length
  if (n === 0) throw new Error('Enter some data first')
  const sum = xs.reduce((a, b) => a + b, 0)
  const mean = sum / n
  const sumSq = xs.reduce((a, b) => a + b * b, 0)
  const varP = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n
  const sorted = [...xs].sort((a, b) => a - b)
  const res: StatResult = {
    n,
    mean,
    sigmaX: Math.sqrt(varP),
    sx: n > 1 ? Math.sqrt((varP * n) / (n - 1)) : NaN,
    sum,
    sumSq,
    min: sorted[0],
    q1: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    q3: quantile(sorted, 0.75),
    max: sorted[n - 1]
  }
  if (type === 'single' || !ysIn) return res
  const my = ys.reduce((a, b) => a + b, 0) / n
  res.meanY = my
  res.sigmaY = Math.sqrt(ys.reduce((a, b) => a + (b - my) ** 2, 0) / n)
  res.sy = n > 1 ? Math.sqrt((ys.reduce((a, b) => a + (b - my) ** 2, 0)) / (n - 1)) : NaN
  switch (type) {
    case 'linear': {
      const { a, b, r } = linFit(xs, ys)
      Object.assign(res, { coef: { a, b }, r, expr: `${a} + ${b}*x`, label: 'y = a + bx' })
      break
    }
    case 'quadratic': {
      const S = (p: number) => xs.reduce((acc, x) => acc + x ** p, 0)
      const T = (p: number) => xs.reduce((acc, x, i) => acc + x ** p * ys[i], 0)
      const [a, b, c] = solveLinearSystem(
        [
          [n, S(1), S(2)],
          [S(1), S(2), S(3)],
          [S(2), S(3), S(4)]
        ],
        [T(0), T(1), T(2)]
      )
      Object.assign(res, { coef: { a, b, c }, expr: `${a} + ${b}*x + ${c}*x^2`, label: 'y = a + bx + cx²' })
      break
    }
    case 'log': {
      const { a, b, r } = linFit(xs.map(Math.log), ys)
      Object.assign(res, { coef: { a, b }, r, expr: `${a} + ${b}*log(x, e)`, label: 'y = a + b·ln x' })
      res.expr = `${a} + ${b}*ln(x)`
      break
    }
    case 'exp': {
      const { a, b, r } = linFit(xs, ys.map(Math.log))
      Object.assign(res, { coef: { a: Math.exp(a), b }, r, expr: `${Math.exp(a)}*exp(${b}*x)`, label: 'y = a·e^(bx)' })
      break
    }
    case 'abExp': {
      const { a, b, r } = linFit(xs, ys.map(Math.log))
      Object.assign(res, { coef: { a: Math.exp(a), b: Math.exp(b) }, r, expr: `${Math.exp(a)}*${Math.exp(b)}^x`, label: 'y = a·b^x' })
      break
    }
    case 'power': {
      const { a, b, r } = linFit(xs.map(Math.log), ys.map(Math.log))
      Object.assign(res, { coef: { a: Math.exp(a), b }, r, expr: `${Math.exp(a)}*x^${b}`, label: 'y = a·x^b' })
      break
    }
    case 'inverse': {
      const { a, b, r } = linFit(xs.map((x) => 1 / x), ys)
      Object.assign(res, { coef: { a, b }, r, expr: `${a} + ${b}/x`, label: 'y = a + b/x' })
      break
    }
  }
  return res
}

// ---------------------------------------------------------------------------
// Distributions
// ---------------------------------------------------------------------------

export const normalPdf = (x: number, mu = 0, sigma = 1) => Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI))
export const normalCdf = (lo: number, hi: number, mu = 0, sigma = 1) => {
  const phi = (z: number) => 0.5 * (1 + (math.erf(z / Math.SQRT2) as number))
  return phi((hi - mu) / sigma) - phi((lo - mu) / sigma)
}

/** Inverse standard normal (Acklam's algorithm). */
export function inverseNormal(p: number, mu = 0, sigma = 1, tail: 'left' | 'right' | 'center' = 'left'): number {
  if (tail === 'right') p = 1 - p
  if (tail === 'center') p = 0.5 + p / 2
  if (p <= 0 || p >= 1) throw new Error('Area must be between 0 and 1')
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239]
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
  const pl = 0.02425
  let q: number
  let z: number
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p))
    z = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  } else if (p <= 1 - pl) {
    q = p - 0.5
    const r = q * q
    z = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p))
    z = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  return mu + sigma * z
}

const lnFact = (n: number) => Number(math.lgamma(n + 1))

export const binomialPd = (x: number, N: number, p: number) =>
  x < 0 || x > N || !Number.isInteger(x) ? 0 : Math.exp(lnFact(N) - lnFact(x) - lnFact(N - x) + x * Math.log(p) + (N - x) * Math.log(1 - p))
export const binomialCd = (x: number, N: number, p: number) => {
  let s = 0
  for (let k = 0; k <= Math.min(N, Math.floor(x)); k++) s += binomialPd(k, N, p)
  return Math.min(1, s)
}
export const poissonPd = (x: number, lambda: number) => (x < 0 || !Number.isInteger(x) ? 0 : Math.exp(x * Math.log(lambda) - lambda - lnFact(x)))
export const poissonCd = (x: number, lambda: number) => {
  let s = 0
  for (let k = 0; k <= Math.floor(x); k++) s += poissonPd(k, lambda)
  return Math.min(1, s)
}

// ---------------------------------------------------------------------------
// Measurements: significant figures & uncertainties
// ---------------------------------------------------------------------------

export function countSigFigs(raw: string): { count: number; explanation: string } {
  const s = raw.trim().replace(/[×x]\s*10\^?\s*[-+]?\d+$/i, '').replace(/e[-+]?\d+$/i, '').replace(/^[-+]/, '')
  if (!/^\d*\.?\d*$/.test(s) || !/\d/.test(s)) throw new Error('Enter a number like 0.00450 or 3.20×10^4')
  const hasPoint = s.includes('.')
  const digits = s.replace('.', '')
  const firstNonZero = digits.search(/[1-9]/)
  if (firstNonZero < 0) return { count: hasPoint ? Math.max(1, digits.length - 1) : 1, explanation: 'Zero: only the zeros after the decimal point count.' }
  let sig = digits.slice(firstNonZero)
  let note = 'Leading zeros never count.'
  if (!hasPoint) {
    const trimmed = sig.replace(/0+$/, '')
    if (trimmed.length !== sig.length) note += ' Trailing zeros without a decimal point are not significant (write it in scientific notation to show they are).'
    sig = trimmed
  } else if (/0$/.test(sig)) note += ' Trailing zeros after the decimal point ARE significant.'
  return { count: sig.length, explanation: note }
}

export function roundSig(v: number, n: number): string {
  if (v === 0) return '0'
  return Number(v.toPrecision(n)).toPrecision(n)
}

export interface Measured {
  value: number
  unc: number
}

export function propagate(op: '+' | '-' | '×' | '÷' | '^', a: Measured, b: Measured | number): { value: number; unc: number; rule: string } {
  if (op === '^') {
    const p = b as number
    const value = a.value ** p
    // |Δy| = |p x^(p−1)| |Δx| — the same rule, but it survives a measurement of zero.
    const unc = Math.abs(p) * Math.abs(a.value ** (p - 1)) * a.unc
    return { value, unc: Number.isFinite(unc) ? unc : 0, rule: `Power rule: % uncertainty is multiplied by the power (${p}).` }
  }
  const bb = b as Measured
  if (op === '+' || op === '-') {
    return { value: op === '+' ? a.value + bb.value : a.value - bb.value, unc: a.unc + bb.unc, rule: 'Adding or subtracting: add the absolute uncertainties.' }
  }
  const value = op === '×' ? a.value * bb.value : a.value / bb.value
  // Adding the percentage uncertainties, written so that a reading of zero (whose percentage
  // uncertainty is undefined) gives an answer instead of NaN.
  const unc =
    op === '×'
      ? Math.abs(a.value) * bb.unc + Math.abs(bb.value) * a.unc
      : (a.unc * Math.abs(bb.value) + Math.abs(a.value) * bb.unc) / (bb.value * bb.value)
  return { value, unc: Number.isFinite(unc) ? unc : 0, rule: 'Multiplying or dividing: add the percentage (fractional) uncertainties.' }
}

/** Dimensions [M L T I Θ N J] of an expression with units, e.g. "kg*m/s^2". */
export function dimensionsOf(unitExpr: string): string {
  const u = math.unit(unitExpr.includes(' ') || /^\d/.test(unitExpr) ? unitExpr : `1 ${unitExpr}`) as unknown as { dimensions: number[] }
  const names = ['M', 'L', 'T', 'I', 'Θ', 'N', 'J']
  // mathjs order: MASS, LENGTH, TIME, CURRENT, TEMPERATURE, LUMINOUS_INTENSITY, AMOUNT_OF_SUBSTANCE, ANGLE, BIT
  const order = [0, 1, 2, 3, 4, 6, 5]
  const parts = order
    .map((idx, k) => ({ p: u.dimensions[idx], n: names[k] }))
    .filter((x) => x.p)
    .map((x) => (x.p === 1 ? x.n : `${x.n}^${x.p}`))
  return parts.length ? `[${parts.join(' ')}]` : '[dimensionless]'
}

export { setAngleMode }

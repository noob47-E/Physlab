// PhysLab's spelling to Giac's, and Giac's answers back to PhysLab's (part G1). Both ways go through
// a tree, never through text replacement: the first draft's regexes rewrote "zoom" to
// "z+infinitym", made sin(x)^(1/3) into sinsurd((x), 3), sent π as a letter and let any name Giac
// printed (LambertW, order_size, list[…]) through to the screen. Only what this file knows is spelt;
// anything else is refused in a sentence.
//
// - A request is read the way the algebra engine has always read one (the bar's preprocess() or the
//   Working panel's spelledOut() has run first): implicit products (2x, x y, x(x + 1)); a run of
//   letters is a product of single letters (te^t is t·e^t) unless it is a function, a constant or a
//   Greek letter's name; ln is natural and log is base 10; log(a, b) is log base a of b; E is e;
//   ∞, Infinity and oo are infinity; a decimal is the number as written (0.1 is 1/10, exactly).
// - Every letter goes to Giac as v_<name>, so no letter can meet one of Giac's own names (Giac reads
//   epsilon as a number, Pi as π, Gamma and Psi as functions). An answer's letters come back only
//   through that prefix; any other name Giac prints is a form PhysLab cannot show.
// - An odd root is the real root (G00, docs/knowledge/engine-semantics.md §2): a power whose exponent
//   is a fraction with an odd bottom goes to Giac as surd(), Giac's real root, because Giac's own
//   (−8)^(1/3) is the complex principal value. An odd root in an answer comes back as cbrt/nthRoot,
//   which every reader of PhysLab's text takes as the real root.
// - In degrees each trig argument is turned into radians in the request (sin x → sin(π/180·x)) and
//   each inverse trig answer into degrees, as the other engine does, so an answer's text is always in
//   radians. Giac itself stays in radians (worker.ts GIAC_SETUP).

import { GREEK_LETTERS, GREEK_NAMES } from '../../names'

/** The request could not be read: the sentence the other engine gives for a syntax error. */
export const CANT_READ = 'I could not read that. Check the brackets and signs.'

/** An answer in a form PhysLab cannot show: a Giac name, a root-of form, a special function. */
export const CANT_SHOW = "PhysLab can't show that form yet."

/** A tree both readers build and every writer prints. Numbers are exact; a float only comes from Giac. */
export type Tree =
  | { k: 'int'; v: string }
  | { k: 'float'; v: string }
  | { k: 'sym'; name: string }
  | { k: 'const'; c: 'pi' | 'e' | 'i' | 'inf' | 'uinf' | 'undef' }
  | { k: 'neg'; a: Tree }
  | { k: 'op'; op: '+' | '-' | '*' | '/' | '^'; a: Tree; b: Tree }
  | { k: 'call'; fn: string; args: Tree[] }
  | { k: 'fact'; a: Tree }
  | { k: 'deg'; a: Tree }
  | { k: 'list'; items: Tree[] }

/** Why a text could not be read or shown; `sentence` is what a student is told. */
export class SpellingError extends Error {
  constructor(readonly sentence: string) {
    super(sentence)
  }
}

export interface SpellingContext {
  /** The trig functions take degrees (EngineRequest.deg). */
  deg: boolean
}

// ---------------------------------------------------------------------------------------------
// The names
// ---------------------------------------------------------------------------------------------

/**
 * The functions a request may call, by every name the readers before this one write, with the one
 * name the tree uses and how many arguments each takes. arcsin is asin, mag (|x| after preprocess)
 * and Abs are abs, sgn is sign, cbrt and nthRoot are the real root.
 */
const REQUEST_FUNCS: Record<string, { fn: string; arity: number[] }> = {
  sin: { fn: 'sin', arity: [1] },
  cos: { fn: 'cos', arity: [1] },
  tan: { fn: 'tan', arity: [1] },
  sec: { fn: 'sec', arity: [1] },
  csc: { fn: 'csc', arity: [1] },
  cot: { fn: 'cot', arity: [1] },
  asin: { fn: 'asin', arity: [1] },
  acos: { fn: 'acos', arity: [1] },
  atan: { fn: 'atan', arity: [1] },
  acot: { fn: 'acot', arity: [1] },
  asec: { fn: 'asec', arity: [1] },
  acsc: { fn: 'acsc', arity: [1] },
  arcsin: { fn: 'asin', arity: [1] },
  arccos: { fn: 'acos', arity: [1] },
  arctan: { fn: 'atan', arity: [1] },
  sinh: { fn: 'sinh', arity: [1] },
  cosh: { fn: 'cosh', arity: [1] },
  tanh: { fn: 'tanh', arity: [1] },
  asinh: { fn: 'asinh', arity: [1] },
  acosh: { fn: 'acosh', arity: [1] },
  atanh: { fn: 'atanh', arity: [1] },
  exp: { fn: 'exp', arity: [1] },
  ln: { fn: 'ln', arity: [1] },
  log: { fn: 'log', arity: [1, 2] },
  log10: { fn: 'log10', arity: [1] },
  sqrt: { fn: 'sqrt', arity: [1] },
  cbrt: { fn: 'cbrt', arity: [1] },
  nthRoot: { fn: 'root', arity: [2] },
  abs: { fn: 'abs', arity: [1] },
  Abs: { fn: 'abs', arity: [1] },
  mag: { fn: 'abs', arity: [1] },
  sign: { fn: 'sign', arity: [1] },
  sgn: { fn: 'sign', arity: [1] },
  factorial: { fn: 'factorial', arity: [1] },
  nCr: { fn: 'comb', arity: [2] },
  nPr: { fn: 'perm', arity: [2] },
  floor: { fn: 'floor', arity: [1] },
  ceil: { fn: 'ceil', arity: [1] }
}

/** Longest first, so a glued "xsin(" is x·sin, never xs·in. */
const FUNC_NAMES = Object.keys(REQUEST_FUNCS).sort((a, b) => b.length - a.length)

/** The constants a request may name: e and E (math/names.ts CONSTANT_NAMES), pi, i, and infinity's spellings. */
const REQUEST_CONSTS: Record<string, Tree> = {
  pi: { k: 'const', c: 'pi' },
  e: { k: 'const', c: 'e' },
  E: { k: 'const', c: 'e' },
  i: { k: 'const', c: 'i' },
  Infinity: { k: 'const', c: 'inf' },
  inf: { k: 'const', c: 'inf' },
  oo: { k: 'const', c: 'inf' }
}

const TRIG = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot'])
const INVERSE_TRIG = new Set(['asin', 'acos', 'atan', 'acot', 'asec', 'acsc'])

/** What a letter is called in Giac: its own name behind a prefix no Giac name has. */
export const giacName = (name: string): string => `v_${name}`

/**
 * The functions an answer may hold, by Giac's name, with the tree's name. Anything else Giac
 * prints (rootof, LambertW, Si, Ei, Gamma, Zeta, piecewise, bounded_function, order_size, an
 * unevaluated integrate …) is a form PhysLab cannot show.
 */
const ANSWER_FUNCS: Record<string, { fn: string; arity: number }> = {
  sin: { fn: 'sin', arity: 1 },
  cos: { fn: 'cos', arity: 1 },
  tan: { fn: 'tan', arity: 1 },
  sec: { fn: 'sec', arity: 1 },
  csc: { fn: 'csc', arity: 1 },
  cot: { fn: 'cot', arity: 1 },
  asin: { fn: 'asin', arity: 1 },
  acos: { fn: 'acos', arity: 1 },
  atan: { fn: 'atan', arity: 1 },
  acot: { fn: 'acot', arity: 1 },
  asec: { fn: 'asec', arity: 1 },
  acsc: { fn: 'acsc', arity: 1 },
  sinh: { fn: 'sinh', arity: 1 },
  cosh: { fn: 'cosh', arity: 1 },
  tanh: { fn: 'tanh', arity: 1 },
  asinh: { fn: 'asinh', arity: 1 },
  acosh: { fn: 'acosh', arity: 1 },
  atanh: { fn: 'atanh', arity: 1 },
  exp: { fn: 'exp', arity: 1 },
  ln: { fn: 'ln', arity: 1 },
  log10: { fn: 'log10', arity: 1 },
  logb: { fn: 'logb', arity: 2 },
  sqrt: { fn: 'sqrt', arity: 1 },
  surd: { fn: 'root', arity: 2 },
  abs: { fn: 'abs', arity: 1 },
  sign: { fn: 'sign', arity: 1 },
  factorial: { fn: 'factorial', arity: 1 },
  comb: { fn: 'comb', arity: 2 },
  perm: { fn: 'perm', arity: 2 },
  floor: { fn: 'floor', arity: 1 },
  ceil: { fn: 'ceil', arity: 1 },
  erf: { fn: 'erf', arity: 1 }
}

// ---------------------------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------------------------

type Tok = { t: 'num'; v: string } | { t: 'name'; v: string } | { t: 'op'; v: string } | { t: 'fn'; v: string } | { t: 'leaf'; tree: Tree }

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const GREEK_BY_LETTER = new Map(GREEK_LETTERS.map((g) => [g.letter, g.name]))
/** Characters written for an operator, as the readers before this one accept them. */
const OP_CHAR: Record<string, string> = { '−': '-', '–': '-', '×': '*', '·': '*', '⋅': '*', '÷': '/', '°': '°', '|': '|', '√': '√', '∛': '∛' }

/** Text as tokens. `request` allows the student's own signs (√, °, ², |, π, θ); Giac's answers use none of them. */
function tokenize(s: string, request: boolean): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    const num = /^(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(s.slice(i))
    if (num) {
      out.push({ t: 'num', v: num[0] })
      i += num[0].length
      continue
    }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i))
    if (name) {
      out.push({ t: 'name', v: name[0] })
      i += name[0].length
      continue
    }
    if (s.startsWith('**', i)) {
      out.push({ t: 'op', v: '^' })
      i += 2
      continue
    }
    if ('+-*/^(),!'.includes(c) || (!request && '[]'.includes(c))) {
      out.push({ t: 'op', v: c })
      i++
      continue
    }
    if (request) {
      if (c in OP_CHAR) {
        out.push({ t: 'op', v: OP_CHAR[c] })
        i++
        continue
      }
      const spelt = c === '∞' ? 'Infinity' : c === 'π' ? 'pi' : GREEK_BY_LETTER.get(c)
      if (spelt) {
        out.push({ t: 'name', v: spelt })
        i++
        continue
      }
      // A raised power as PhysLab and a phone keyboard write one: x², x⁻¹.
      if (SUPERSCRIPT.includes(c) || c === '⁻') {
        let j = i
        const negative = s[j] === '⁻'
        if (negative) j++
        let digits = ''
        while (j < s.length && SUPERSCRIPT.includes(s[j])) digits += String(SUPERSCRIPT.indexOf(s[j++]))
        if (!digits) throw new SpellingError(CANT_READ)
        out.push({ t: 'op', v: '^' })
        if (negative) out.push({ t: 'op', v: '-' })
        out.push({ t: 'num', v: digits })
        i = j
        continue
      }
    }
    throw new SpellingError(request ? CANT_READ : CANT_SHOW)
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// The request reader
// ---------------------------------------------------------------------------------------------

/** A decimal as written, exactly: 0.15 is 15/100 and 1e-19 is 1/10¹⁹, never the double nearest them. */
function exactNumber(text: string): Tree {
  const m = /^(\d*)(?:\.(\d*))?(?:[eE]([-+]?\d+))?$/.exec(text)
  if (!m) throw new SpellingError(CANT_READ)
  const frac = m[2] ?? ''
  const exp = Number(m[3] ?? '0') - frac.length
  const digits = (m[1] + frac).replace(/^0+(?=\d)/, '') || '0'
  // Giac would build the number; a power of ten this size is a typing slip, not a question.
  if (Math.abs(exp) > 400) throw new SpellingError(CANT_READ)
  if (exp === 0) return { k: 'int', v: digits }
  const ten: Tree = { k: 'op', op: '^', a: { k: 'int', v: '10' }, b: { k: 'int', v: String(Math.abs(exp)) } }
  return { k: 'op', op: exp > 0 ? '*' : '/', a: { k: 'int', v: digits }, b: ten }
}

/**
 * A name token as the tokens it stands for: a function, a constant, a letter, or a run of single
 * letters multiplied (xy is x·y, te is t·e). A run glued to a function before a bracket keeps the
 * function whole, with a whole Greek name in front kept whole too (thetasin( is theta·sin, as the
 * Working panel's gluedFunctionsApart reads it). A run with a function's name inside it and no
 * bracket ("sinx", "cost") is refused: read letter by letter it would be s·i·n·x, with i the square
 * root of −1, and an answer to that is an answer to a question nobody asked.
 */
function nameTokens(name: string, beforeBracket: boolean): Tok[] {
  if (REQUEST_FUNCS[name]) return [{ t: 'fn', v: name }]
  if (name === 'deg') return [{ t: 'op', v: '°' }]
  const constant = REQUEST_CONSTS[name]
  if (constant) return [{ t: 'leaf', tree: constant }]
  if (GREEK_NAMES.has(name) || /^[A-Za-z]$/.test(name)) return [{ t: 'leaf', tree: { k: 'sym', name } }]
  // A letter with digits or an underscore (x1, v0, x_1) is one name, as a physics formula writes it.
  if (!/^[A-Za-z]+$/.test(name)) return [{ t: 'leaf', tree: { k: 'sym', name } }]
  const letters = (run: string): Tok[] => {
    if (FUNC_NAMES.some((f) => f.length >= 3 && run.includes(f))) throw new SpellingError(CANT_READ)
    return [...run].map((c): Tok => ({ t: 'leaf', tree: REQUEST_CONSTS[c] ?? { k: 'sym', name: c } }))
  }
  if (beforeBracket) {
    const fits = FUNC_NAMES.filter((f) => name.endsWith(f) && f.length < name.length)
    const fn = fits.find((f) => GREEK_NAMES.has(name.slice(0, -f.length))) ?? fits[0]
    if (fn) {
      const front = name.slice(0, -fn.length)
      const whole = GREEK_NAMES.has(front) || REQUEST_CONSTS[front] !== undefined
      return [...(whole ? nameTokens(front, false) : letters(front)), { t: 'fn', v: fn }]
    }
  }
  return letters(name)
}

class RequestReader {
  private readonly toks: Tok[] = []
  private at = 0
  /** How many |…| bars are open: while one is, the next bar closes it. */
  private bars = 0

  constructor(src: string) {
    const raw = tokenize(src, true)
    for (let k = 0; k < raw.length; k++) {
      const tok = raw[k]
      const next = raw[k + 1]
      if (tok.t === 'name') this.toks.push(...nameTokens(tok.v, next?.t === 'op' && next.v === '('))
      else this.toks.push(tok)
    }
  }

  private isOp(v: string): boolean {
    const t = this.toks[this.at]
    return t?.t === 'op' && t.v === v
  }

  private take(v: string): void {
    if (!this.isOp(v)) throw new SpellingError(CANT_READ)
    this.at++
  }

  readWhole(): Tree {
    const t = this.sum()
    if (this.at !== this.toks.length) throw new SpellingError(CANT_READ)
    return t
  }

  private sum(): Tree {
    let left = this.term()
    while (this.isOp('+') || this.isOp('-')) {
      const op = this.isOp('+') ? '+' : '-'
      this.at++
      left = { k: 'op', op, a: left, b: this.term() }
    }
    return left
  }

  /** Whether the next token starts an operand, so two operands side by side multiply (2x, x(x + 1)). */
  private startsOperand(): boolean {
    const t = this.toks[this.at]
    if (!t) return false
    if (t.t !== 'op') return true
    if (t.v === '(' || t.v === '√' || t.v === '∛') return true
    // A bar opens a new |…| only when none is open to close.
    return t.v === '|' && this.bars === 0
  }

  private term(): Tree {
    let left = this.unary()
    for (;;) {
      if (this.isOp('*') || this.isOp('/')) {
        const op = this.isOp('*') ? '*' : '/'
        this.at++
        left = { k: 'op', op, a: left, b: this.unary() }
      } else if (this.startsOperand()) {
        // A * goes where two operands meet, as the other engine's reader puts it: 1/2x is (1/2)·x.
        left = { k: 'op', op: '*', a: left, b: this.unary() }
      } else return left
    }
  }

  private unary(): Tree {
    if (this.isOp('-')) {
      this.at++
      return { k: 'neg', a: this.unary() }
    }
    if (this.isOp('+')) {
      this.at++
      return this.unary()
    }
    const base = this.postfix()
    if (this.isOp('^')) {
      this.at++
      return { k: 'op', op: '^', a: base, b: this.unary() }
    }
    return base
  }

  private postfix(): Tree {
    let t = this.atom()
    for (;;) {
      if (this.isOp('!')) {
        this.at++
        t = { k: 'fact', a: t }
      } else if (this.isOp('°')) {
        this.at++
        t = { k: 'deg', a: t }
      } else return t
    }
  }

  private args(): Tree[] {
    this.take('(')
    const out = [this.sum()]
    while (this.isOp(',')) {
      this.at++
      out.push(this.sum())
    }
    this.take(')')
    return out
  }

  private atom(): Tree {
    const t = this.toks[this.at++]
    if (!t) throw new SpellingError(CANT_READ)
    switch (t.t) {
      case 'num':
        return exactNumber(t.v)
      case 'leaf':
        return t.tree
      case 'name':
        throw new SpellingError(CANT_READ)
      case 'fn': {
        // sin^2(x) is (sin x)², as a textbook writes it.
        let power: Tree | null = null
        if (this.isOp('^')) {
          this.at++
          power = this.postfix()
        }
        if (!this.isOp('(')) throw new SpellingError(CANT_READ)
        const call = callOf(t.v, this.args())
        return power ? { k: 'op', op: '^', a: call, b: power } : call
      }
    }
    switch (t.v) {
      case '(': {
        const inner = this.sum()
        this.take(')')
        return inner
      }
      case '|': {
        this.bars++
        const inner = this.sum()
        this.bars--
        this.take('|')
        return { k: 'call', fn: 'abs', args: [inner] }
      }
      case '√':
      case '∛': {
        // A number under the sign may carry its own minus: ∛-8 is the cube root of −8, as preprocess reads it.
        const negative = this.isOp('-')
        if (negative) this.at++
        const under = this.postfix()
        const arg: Tree = negative ? { k: 'neg', a: under } : under
        return t.v === '√' ? { k: 'call', fn: 'sqrt', args: [arg] } : { k: 'call', fn: 'root', args: [arg, { k: 'int', v: '3' }] }
      }
      default:
        throw new SpellingError(CANT_READ)
    }
  }
}

/** A call by the name a request used, as the tree writes it: log is base 10, log(a, b) is log base a of b, cbrt is the real cube root. */
function callOf(name: string, args: Tree[]): Tree {
  const f = REQUEST_FUNCS[name]
  if (!f.arity.includes(args.length)) throw new SpellingError(CANT_READ)
  if (f.fn === 'log') return args.length === 1 ? { k: 'call', fn: 'log10', args } : { k: 'call', fn: 'logb', args: [args[1], args[0]] }
  if (f.fn === 'cbrt') return { k: 'call', fn: 'root', args: [args[0], { k: 'int', v: '3' }] }
  return { k: 'call', fn: f.fn, args }
}

/** A request's expression (or one side of an equation) as a tree; a SpellingError when it cannot be read. */
export function readPhysLab(text: string): Tree {
  if (!text.trim()) throw new SpellingError(CANT_READ)
  return new RequestReader(text).readWhole()
}

/** An equation "lhs = rhs" (or an expression, which equals 0) as its two sides. ≠, ≤ and the like are refused. */
export function readEquation(text: string): { lhs: Tree; rhs: Tree } {
  if (/[!<>]=|==/.test(text)) throw new SpellingError(CANT_READ)
  const parts = text.split('=')
  if (parts.length > 2) throw new SpellingError(CANT_READ)
  return { lhs: readPhysLab(parts[0]), rhs: parts.length === 2 ? readPhysLab(parts[1]) : { k: 'int', v: '0' } }
}

/** The letters trees use, by PhysLab name, in alphabetical order. */
export function lettersOf(...trees: Tree[]): string[] {
  const out = new Set<string>()
  const walk = (t: Tree): void => {
    if (t.k === 'sym') out.add(t.name)
    else if (t.k === 'neg' || t.k === 'fact' || t.k === 'deg') walk(t.a)
    else if (t.k === 'op') {
      walk(t.a)
      walk(t.b)
    } else if (t.k === 'call') t.args.forEach(walk)
    else if (t.k === 'list') t.items.forEach(walk)
  }
  trees.forEach(walk)
  return [...out].sort()
}

// ---------------------------------------------------------------------------------------------
// Writing Giac
// ---------------------------------------------------------------------------------------------

/** An exact rational's value when the tree is one (3, −2, 1/3, −(2/5), 15/10²), else null. */
function rationalOf(t: Tree): { n: bigint; d: bigint } | null {
  if (t.k === 'int') return { n: BigInt(t.v), d: 1n }
  if (t.k === 'neg') {
    const r = rationalOf(t.a)
    return r && { n: -r.n, d: r.d }
  }
  if (t.k === 'op' && (t.op === '/' || t.op === '*' || t.op === '^')) {
    const a = rationalOf(t.a)
    const b = rationalOf(t.b)
    if (!a || !b) return null
    if (t.op === '*') return { n: a.n * b.n, d: a.d * b.d }
    if (t.op === '/') {
      if (b.n === 0n) return null
      const sign = b.n < 0n ? -1n : 1n
      return { n: sign * a.n * b.d, d: sign * a.d * b.n }
    }
    // A whole, modest power: the 10¹⁹ inside a decimal written exactly.
    if (b.d !== 1n || b.n < 0n || b.n > 400n) return null
    return { n: a.n ** b.n, d: a.d ** b.n }
  }
  return null
}

const gcd = (a: bigint, b: bigint): bigint => {
  a = a < 0n ? -a : a
  b = b < 0n ? -b : b
  while (b) [a, b] = [b, a % b]
  return a
}

/** An exponent p/q in lowest terms, q > 1, or null when it is not a fraction. */
function fractionOf(t: Tree): { n: bigint; d: bigint } | null {
  const r = rationalOf(t)
  if (!r || r.d === 1n) return null
  const k = gcd(r.n, r.d)
  return k === r.d ? null : { n: r.n / k, d: r.d / k }
}

/** The tree in Giac's input language, every operand in brackets so Giac's own precedence never matters. */
export function giacOf(t: Tree, ctx: SpellingContext): string {
  const g = (u: Tree): string => giacOf(u, ctx)
  switch (t.k) {
    case 'int':
    case 'float':
      return t.v
    case 'sym':
      return giacName(t.name)
    case 'const':
      return { pi: 'pi', e: 'exp(1)', i: 'i', inf: '(+infinity)', uinf: 'infinity', undef: 'undef' }[t.c]
    case 'neg':
      return `(-(${g(t.a)}))`
    case 'fact':
      return `factorial(${g(t.a)})`
    case 'deg':
      // In degrees an angle is already a number of degrees; in radians 30° is π/6.
      return ctx.deg ? `(${g(t.a)})` : `((${g(t.a)})*pi/180)`
    case 'list':
      return `[${t.items.map(g).join(',')}]`
    case 'op': {
      const f = t.op === '^' ? fractionOf(t.b) : null
      // The real root for an odd bottom (G00 §2): Giac's own power is the complex principal value.
      if (f && f.d % 2n === 1n) {
        const root = `surd(${g(t.a)},${f.d})`
        // A negative power as one over the root: Giac integrates 1/surd(x, 3) across 0 correctly, but
        // gave a list with an imaginary part for surd(x, 3)^(−1) over [−1, 0].
        if (f.n < 0n) return f.n === -1n ? `(1/(${root}))` : `(1/((${root})^(${-f.n})))`
        return f.n === 1n ? root : `((${root})^(${f.n}))`
      }
      return `((${g(t.a)})${t.op}(${g(t.b)}))`
    }
    case 'call': {
      const args = t.args.map(g)
      if (TRIG.has(t.fn) && ctx.deg) return `${t.fn}((pi/180)*(${args[0]}))`
      if (INVERSE_TRIG.has(t.fn) && ctx.deg) return `((180/pi)*${t.fn}(${args[0]}))`
      if (t.fn === 'root') {
        const n = rationalOf(t.args[1])
        if (!n || n.d !== 1n || n.n < 2n || n.n > 1000n) throw new SpellingError(CANT_READ)
        return n.n % 2n === 1n ? `surd(${args[0]},${n.n})` : `((${args[0]})^(1/${n.n}))`
      }
      return `${t.fn}(${args.join(',')})`
    }
  }
}

/** A PhysLab request's text as Giac input: read, then written. A SpellingError when it cannot be read. */
export const toGiac = (text: string, ctx: SpellingContext): string => giacOf(readPhysLab(text), ctx)

// ---------------------------------------------------------------------------------------------
// Reading Giac's answers
// ---------------------------------------------------------------------------------------------

/** Giac's printed answer as a tree, every name checked; a SpellingError(CANT_SHOW) for anything else. */
class AnswerReader {
  private readonly toks: Tok[]
  private at = 0

  constructor(src: string) {
    this.toks = tokenize(src, false)
  }

  private isOp(v: string): boolean {
    const t = this.toks[this.at]
    return t?.t === 'op' && t.v === v
  }

  private isName(v: string, ahead = 0): boolean {
    const t = this.toks[this.at + ahead]
    return t?.t === 'name' && t.v === v
  }

  private take(v: string): void {
    if (!this.isOp(v)) throw new SpellingError(CANT_SHOW)
    this.at++
  }

  readWhole(): Tree {
    const t = this.sum()
    if (this.at !== this.toks.length) throw new SpellingError(CANT_SHOW)
    return t
  }

  private sum(): Tree {
    let left = this.term()
    while (this.isOp('+') || this.isOp('-')) {
      const op = this.isOp('+') ? '+' : '-'
      this.at++
      left = { k: 'op', op, a: left, b: this.term() }
    }
    return left
  }

  private term(): Tree {
    let left = this.unary()
    while (this.isOp('*') || this.isOp('/')) {
      const op = this.isOp('*') ? '*' : '/'
      this.at++
      left = { k: 'op', op, a: left, b: this.unary() }
    }
    return left
  }

  private unary(): Tree {
    // +infinity and -infinity are Giac's signed infinities; a bare infinity has no sign at all.
    if ((this.isOp('+') || this.isOp('-')) && this.isName('infinity', 1)) {
      const negative = this.isOp('-')
      this.at += 2
      const inf: Tree = { k: 'const', c: 'inf' }
      return negative ? { k: 'neg', a: inf } : inf
    }
    if (this.isOp('-')) {
      this.at++
      return { k: 'neg', a: this.unary() }
    }
    if (this.isOp('+')) {
      this.at++
      return this.unary()
    }
    const base = this.atom()
    // Giac writes x^-2 and (x^(1/3))^-2: an exponent may carry its own sign.
    if (this.isOp('^')) {
      this.at++
      return { k: 'op', op: '^', a: base, b: this.unary() }
    }
    return base
  }

  private list(): Tree {
    this.take('[')
    const items: Tree[] = []
    if (!this.isOp(']')) {
      items.push(this.sum())
      while (this.isOp(',')) {
        this.at++
        items.push(this.sum())
      }
    }
    this.take(']')
    return { k: 'list', items }
  }

  private atom(): Tree {
    const t = this.toks[this.at]
    if (!t) throw new SpellingError(CANT_SHOW)
    if (t.t === 'op') {
      if (t.v === '[') return this.list()
      if (t.v !== '(') throw new SpellingError(CANT_SHOW)
      this.at++
      const inner = this.sum()
      this.take(')')
      return inner
    }
    this.at++
    if (t.t === 'num') return /^\d+$/.test(t.v) ? { k: 'int', v: t.v } : { k: 'float', v: t.v }
    if (t.t !== 'name') throw new SpellingError(CANT_SHOW)
    const name = t.v
    // Giac prints a solve's answers as list[…]; seq[…] and set[…] are kinds of answer PhysLab never asks for.
    if (name === 'list' && this.isOp('[')) return this.list()
    if (/^v_[A-Za-z][A-Za-z0-9_]*$/.test(name)) return { k: 'sym', name: name.slice(2) }
    if (name === 'pi' || name === 'i' || name === 'e' || name === 'undef') return { k: 'const', c: name }
    if (name === 'infinity') return { k: 'const', c: 'uinf' }
    const f = ANSWER_FUNCS[name]
    if (!f || !this.isOp('(')) throw new SpellingError(CANT_SHOW)
    this.take('(')
    const args = [this.sum()]
    while (this.isOp(',')) {
      this.at++
      args.push(this.sum())
    }
    this.take(')')
    if (args.length !== f.arity) throw new SpellingError(CANT_SHOW)
    return { k: 'call', fn: f.fn, args }
  }
}

/**
 * Giac's answer tidied into PhysLab's forms: exp(1) is e, x^1 is x, and a power whose exponent is a
 * fraction with an odd bottom is the real root. Giac's −8^(1/3) is −(8^(1/3)) = −2, and its x^(1/3)
 * for a letter can only stand for a real root here: every root in a request goes to Giac as surd.
 * A negative number under an odd root would be Giac's complex principal value, which PhysLab never
 * means, so it is refused.
 */
function tidy(t: Tree): Tree {
  switch (t.k) {
    case 'neg':
      return { k: 'neg', a: tidy(t.a) }
    case 'fact':
    case 'deg':
      return { k: t.k, a: tidy(t.a) }
    case 'list':
      return { k: 'list', items: t.items.map(tidy) }
    case 'call': {
      const args = t.args.map(tidy)
      if (t.fn === 'exp' && args[0].k === 'int' && args[0].v === '1') return { k: 'const', c: 'e' }
      if (t.fn === 'root') {
        const n = rationalOf(args[1])
        if (!n || n.d !== 1n || n.n < 2n) throw new SpellingError(CANT_SHOW)
        args[1] = { k: 'int', v: String(n.n) }
      }
      return { k: 'call', fn: t.fn, args }
    }
    case 'op': {
      const a = tidy(t.a)
      const b = tidy(t.b)
      if (t.op === '^') {
        if (b.k === 'int' && b.v === '1') return a
        const f = fractionOf(b)
        if (f && f.d % 2n === 1n) {
          const base = rationalOf(a)
          if (base && base.n < 0n) throw new SpellingError(CANT_SHOW)
          const root: Tree = { k: 'call', fn: 'root', args: [a, { k: 'int', v: String(f.d) }] }
          if (f.n === 1n) return root
          const exp: Tree = f.n < 0n ? { k: 'neg', a: { k: 'int', v: String(-f.n) } } : { k: 'int', v: String(f.n) }
          return { k: 'op', op: '^', a: root, b: exp }
        }
      }
      return { k: 'op', op: t.op, a, b }
    }
    default:
      return t
  }
}

/** Giac's answer as a tree; a SpellingError(CANT_SHOW) for a name or form PhysLab cannot show. */
export function readGiac(text: string): Tree {
  return tidy(new AnswerReader(text.trim()).readWhole())
}

/** Whether any part of the tree passes `test`. */
function anywhere(t: Tree, test: (u: Tree) => boolean): boolean {
  if (test(t)) return true
  switch (t.k) {
    case 'neg':
    case 'fact':
    case 'deg':
      return anywhere(t.a, test)
    case 'op':
      return anywhere(t.a, test) || anywhere(t.b, test)
    case 'call':
      return t.args.some((u) => anywhere(u, test))
    case 'list':
      return t.items.some((u) => anywhere(u, test))
    default:
      return false
  }
}

/** True when the tree holds a decimal Giac worked out instead of an exact number. */
export const isApproximate = (t: Tree): boolean => anywhere(t, (u) => u.k === 'float')

/** True when the tree holds Giac's undef or its unsigned infinity anywhere: it has no value. */
export const hasNoValue = (t: Tree): boolean => anywhere(t, (u) => u.k === 'const' && (u.c === 'undef' || u.c === 'uinf'))

/** True when the tree holds a signed infinity anywhere. */
export const hasInfinity = (t: Tree): boolean => anywhere(t, (u) => u.k === 'const' && u.c === 'inf')

/** True when the tree calls one of `fns` anywhere. */
export const calls = (t: Tree, fns: readonly string[]): boolean => anywhere(t, (u) => u.k === 'call' && fns.includes(u.fn))

// ---------------------------------------------------------------------------------------------
// Writing PhysLab's text (read back by math/expr.ts, and by mathjs alone)
// ---------------------------------------------------------------------------------------------

/** How tightly each kind of tree binds, for the brackets a writer needs. */
function rank(t: Tree): number {
  if (t.k === 'op') return t.op === '+' || t.op === '-' ? 1 : t.op === '^' ? 4 : 2
  if (t.k === 'neg') return 2
  return 6
}

const TEXT_FN: Record<string, string> = { log10: 'log', comb: 'combinations', perm: 'permutations' }

/** The tree as PhysLab's plain text: ln natural, log base 10, cbrt/nthRoot real roots, e, pi, i, Infinity. */
export function physlabText(t: Tree): string {
  const w = physlabText
  const wrap = (u: Tree, min: number): string => (rank(u) < min || u.k === 'neg' ? `(${w(u)})` : w(u))
  switch (t.k) {
    case 'int':
    case 'float':
      return t.v
    case 'sym':
      return t.name
    case 'const':
      return { pi: 'pi', e: 'e', i: 'i', inf: 'Infinity', uinf: 'NaN', undef: 'NaN' }[t.c]
    case 'neg':
      return `-${wrap(t.a, 2)}`
    case 'fact':
      return `factorial(${w(t.a)})`
    case 'deg':
      return `(${w(t.a)})`
    case 'list':
      return `[${t.items.map(w).join(', ')}]`
    case 'call': {
      if (t.fn === 'root') {
        const n = (t.args[1] as { v: string }).v
        return n === '3' ? `cbrt(${w(t.args[0])})` : n === '2' ? `sqrt(${w(t.args[0])})` : `nthRoot(${w(t.args[0])}, ${n})`
      }
      // log(base, value), as PhysLab's reader takes it.
      if (t.fn === 'logb') return `log(${w(t.args[1])}, ${w(t.args[0])})`
      return `${TEXT_FN[t.fn] ?? t.fn}(${t.args.map(w).join(', ')})`
    }
    case 'op':
      switch (t.op) {
        case '+':
          return t.b.k === 'neg' ? `${w(t.a)} - ${wrap(t.b.a, 2)}` : `${w(t.a)} + ${w(t.b)}`
        case '-':
          return t.b.k === 'neg' ? `${w(t.a)} + ${wrap(t.b.a, 2)}` : `${w(t.a)} - ${wrap(t.b, 2)}`
        case '*':
          return `${t.a.k === 'neg' ? w(t.a) : wrap(t.a, 2)}*${wrap(t.b, 3)}`
        case '/':
          return `${t.a.k === 'neg' ? w(t.a) : wrap(t.a, 2)}/${wrap(t.b, 3)}`
        case '^':
          return `${wrap(t.a, 5)}^${wrap(t.b, 5)}`
      }
  }
}

// ---------------------------------------------------------------------------------------------
// Writing LaTeX for the screen
// ---------------------------------------------------------------------------------------------

const TEX_FN: Record<string, string> = {
  sin: '\\sin',
  cos: '\\cos',
  tan: '\\tan',
  sec: '\\sec',
  csc: '\\csc',
  cot: '\\cot',
  asin: '\\sin^{-1}',
  acos: '\\cos^{-1}',
  atan: '\\tan^{-1}',
  acot: '\\cot^{-1}',
  asec: '\\sec^{-1}',
  acsc: '\\csc^{-1}',
  sinh: '\\sinh',
  cosh: '\\cosh',
  tanh: '\\tanh',
  asinh: '\\sinh^{-1}',
  acosh: '\\cosh^{-1}',
  atanh: '\\tanh^{-1}',
  ln: '\\ln',
  log10: '\\log',
  sign: '\\operatorname{sgn}',
  erf: '\\operatorname{erf}'
}

/** A letter's LaTeX: x, \theta, x_{1}. KaTeX has no \omicron: it is drawn as the Latin o it looks like. */
function texName(name: string): string {
  if (GREEK_NAMES.has(name)) return name === 'omicron' ? 'o' : `\\${name}`
  const sub = /^([A-Za-z]+?)_?(\d+)$/.exec(name) ?? /^([A-Za-z]+)_([A-Za-z0-9]+)$/.exec(name)
  if (sub) return `${texName(sub[1])}_{${sub[2]}}`
  return name.length === 1 ? name : `\\mathit{${name}}`
}

/** The factors of a product, flattened, so 2·x·y writes as 2xy and not 2 \cdot x \cdot y. */
function factors(t: Tree): Tree[] {
  return t.k === 'op' && t.op === '*' ? [...factors(t.a), ...factors(t.b)] : [t]
}

/** A base under a power: anything that is not a single symbol, number or bracketed call gets brackets (e^{x} and 30° already carry a superscript). */
function texBase(u: Tree): string {
  if (u.k === 'call' && (u.fn === 'sqrt' || u.fn === 'root' || u.fn === 'abs' || u.fn === 'floor' || u.fn === 'ceil')) return physlabTex(u)
  const plain = u.k === 'int' || u.k === 'sym' || (u.k === 'const' && u.c !== 'inf') || (u.k === 'call' && u.fn !== 'exp' && u.fn !== 'factorial')
  return plain ? physlabTex(u) : `\\left(${physlabTex(u)}\\right)`
}

/** The tree as LaTeX for KaTeX, written the way a textbook writes it. */
function physlabTex(t: Tree): string {
  const x = physlabTex
  const br = (s: string): string => `\\left(${s}\\right)`
  switch (t.k) {
    case 'int':
    case 'float':
      return t.v
    case 'sym':
      return texName(t.name)
    case 'const':
      return { pi: '\\pi', e: 'e', i: 'i', inf: '\\infty', uinf: '\\tilde{\\infty}', undef: '\\text{undefined}' }[t.c]
    case 'neg':
      return `-${rank(t.a) < 2 || t.a.k === 'neg' ? br(x(t.a)) : x(t.a)}`
    case 'fact':
      return `${texBase(t.a)}!`
    case 'deg':
      return `${texBase(t.a)}^{\\circ}`
    case 'list':
      return t.items.map(x).join(',\\ ')
    case 'call': {
      const [u, v] = t.args
      switch (t.fn) {
        case 'sqrt':
          return `\\sqrt{${x(u)}}`
        case 'root': {
          const n = (v as { v: string }).v
          return n === '2' ? `\\sqrt{${x(u)}}` : `\\sqrt[${n}]{${x(u)}}`
        }
        case 'abs':
          return `\\left|${x(u)}\\right|`
        case 'exp':
          return `e^{${x(u)}}`
        case 'logb':
          return `\\log_{${x(v)}}${br(x(u))}`
        case 'factorial':
          return `${texBase(u)}!`
        case 'comb':
          return `\\binom{${x(u)}}{${x(v)}}`
        case 'perm':
          return `{}^{${x(u)}}P_{${x(v)}}`
        case 'floor':
          return `\\left\\lfloor ${x(u)}\\right\\rfloor`
        case 'ceil':
          return `\\left\\lceil ${x(u)}\\right\\rceil`
        default:
          return `${TEX_FN[t.fn] ?? `\\operatorname{${t.fn}}`}${br(t.args.map(x).join(', '))}`
      }
    }
    case 'op':
      switch (t.op) {
        case '+':
          return t.b.k === 'neg' ? `${x(t.a)} - ${rank(t.b.a) < 2 ? br(x(t.b.a)) : x(t.b.a)}` : `${x(t.a)} + ${x(t.b)}`
        case '-':
          return `${x(t.a)} - ${rank(t.b) < 2 || t.b.k === 'neg' ? br(x(t.b)) : x(t.b)}`
        case '*': {
          const fs = factors(t)
          let out = rank(fs[0]) < 2 ? br(x(fs[0])) : x(fs[0])
          let numberBefore = fs[0].k === 'int'
          for (const f of fs.slice(1)) {
            const s = rank(f) < 2 || f.k === 'neg' ? br(x(f)) : x(f)
            // A number after another factor needs a sign (2 \cdot 3, x \cdot 2), and so does a fraction
            // after a number (2 \cdot ½, never the mixed number 2½). Letters and brackets sit side by side.
            out += /^[\d.]/.test(s) || (numberBefore && s.startsWith('\\frac')) ? ` \\cdot ${s}` : ` ${s}`
            numberBefore = f.k === 'int'
          }
          return out
        }
        case '/': {
          // Giac writes 1/2/(x − 1): one fraction, 1 over 2(x − 1), not a fraction over a fraction.
          if (t.a.k === 'op' && t.a.op === '/') return x({ k: 'op', op: '/', a: t.a.a, b: { k: 'op', op: '*', a: t.a.b, b: t.b } })
          if (t.a.k === 'neg') return `-${x({ k: 'op', op: '/', a: t.a.a, b: t.b })}`
          return `\\frac{${x(t.a)}}{${x(t.b)}}`
        }
        case '^': {
          // sin²x as a book writes it: \sin^{2}\left(x\right).
          if (t.a.k === 'call' && TEX_FN[t.a.fn] && !TEX_FN[t.a.fn].includes('^') && t.b.k === 'int') {
            return `${TEX_FN[t.a.fn]}^{${t.b.v}}${br(t.a.args.map(x).join(', '))}`
          }
          return `${texBase(t.a)}^{${x(t.b)}}`
        }
      }
  }
}

/** Giac's answer in PhysLab's two spellings, or why it cannot be shown. */
type FromGiac = { ok: true; tree: Tree; text: string; latex: string; approximate: boolean } | { ok: false; sentence: string }

/** A tree read from Giac as PhysLab's text and LaTeX. */
export function fromTree(tree: Tree): FromGiac {
  return { ok: true, tree, text: physlabText(tree), latex: physlabTex(tree), approximate: isApproximate(tree) }
}

/**
 * Giac's printed answer as PhysLab's text and LaTeX. Never a raw Giac name: anything this file does
 * not know is the CANT_SHOW sentence. `approximate` says Giac gave up on an exact answer and printed
 * a decimal, which an exact job refuses.
 */
export function fromGiac(text: string): FromGiac {
  try {
    return fromTree(readGiac(text))
  } catch (e) {
    return { ok: false, sentence: e instanceof SpellingError ? e.sentence : CANT_SHOW }
  }
}

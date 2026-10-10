// Trig-identity proofs (math/pure/trigIdentity.ts says how they work): reading the student's text into the canonical form.
// Out of trigIdentity.ts as a pure move (CLEANUP-PLAN.md CW10d).

import { add, div, fn, type Fn, type Lin, linAdd, linScale, linSub, makeLin, mul, neg, num, pow, sub, type Sum } from './canonical'
import { fnTex, fnText, MINUS, type Printed, sup } from './write'

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

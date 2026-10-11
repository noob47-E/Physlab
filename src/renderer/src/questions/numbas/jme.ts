// Mathematical expression translation between Numbas's JME syntax and mathjs ASTs in both directions.
// Pure moves from questions/numbas.ts (CW10a). Headless: no React, no store, no DOM.

import type { ConditionalNode, ConstantNode, FunctionNode, MathNode, OperatorNode, ParenthesisNode, SymbolNode } from 'mathjs'
import { inferKind, math, preprocess } from '../../math/expr'
import { printMathAst } from '../plainFormula'
import { RANDOM_RANGE } from '../variables'
import type { VariableDef } from '../pqjson'

// ===========================================================================
// JME → mathjs
// ===========================================================================

/**
 * Thrown while translating when the JME uses something outside the accepted subset. `what` is
 * a phrase in words ("the function map", "a list", "a string"), because the sentence built from
 * it is read by a teacher: "variable a uses the function map, which PhysLab does not know."
 */
export class JmeRefusal extends Error {
  constructor(readonly what: string) {
    super(what)
  }
}

type Tok =
  | { k: 'num'; v: string }
  | { k: 'name'; v: string }
  | { k: 'str' }
  | { k: 'op'; v: string }
  | { k: 'p'; v: string }
  | { k: 'end' }

const KEYWORDS = new Set(['and', 'or', 'not', 'xor', 'except', 'isa', 'true', 'false'])

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (/[0-9]/.test(c)) {
      const m = /^\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/.exec(src.slice(i))!
      out.push({ k: 'num', v: m[0] })
      i += m[0].length
      continue
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*'*/.exec(src.slice(i))!
      out.push({ k: 'name', v: m[0] })
      i += m[0].length
      continue
    }
    if (c === '"' || c === "'") {
      const close = src.indexOf(c, i + 1)
      out.push({ k: 'str' })
      i = close === -1 ? src.length : close + 1
      continue
    }
    const two = src.slice(i, i + 2)
    if (two === '<=' || two === '>=' || two === '<>' || two === '..') {
      out.push({ k: 'op', v: two })
      i += 2
      continue
    }
    if ('+-*/^=<>#!|;:'.includes(c)) {
      out.push({ k: 'op', v: c })
      i++
      continue
    }
    if ('(),[]{}'.includes(c)) {
      out.push({ k: 'p', v: c })
      i++
      continue
    }
    throw new JmeRefusal(`the symbol ${c}`)
  }
  out.push({ k: 'end' })
  return out
}

export type JmeNode =
  | { t: 'num'; raw: string }
  | { t: 'name'; v: string }
  | { t: 'un'; op: '-' | '+' | 'not'; a: JmeNode }
  | { t: 'bin'; op: string; a: JmeNode; b: JmeNode }
  | { t: 'call'; f: string; args: JmeNode[] }
  | { t: 'list'; items: JmeNode[] }
  | { t: 'range'; from: JmeNode; to: JmeNode; step?: JmeNode }

/** A recursive-descent parser for the JME subset; anything it does not know throws a JmeRefusal. */
class JmeParser {
  private at = 0
  constructor(private readonly toks: Tok[]) {}

  parse(): JmeNode {
    const n = this.or()
    if (this.peek().k !== 'end') throw new JmeRefusal(this.describe(this.peek()))
    return n
  }

  private peek(): Tok {
    return this.toks[this.at]
  }
  private next(): Tok {
    return this.toks[this.at++]
  }
  private isOp(v: string): boolean {
    const t = this.peek()
    return t.k === 'op' && t.v === v
  }
  private isP(v: string): boolean {
    const t = this.peek()
    return t.k === 'p' && t.v === v
  }
  private isWord(v: string): boolean {
    const t = this.peek()
    return t.k === 'name' && t.v === v
  }
  private expectP(v: string): void {
    if (!this.isP(v)) throw new JmeRefusal(`a missing ${v}`)
    this.at++
  }
  private describe(t: Tok): string {
    if (t.k === 'str') return 'a string'
    if (t.k === 'end') return 'an unfinished formula'
    if (t.k === 'op' || t.k === 'p') return `the symbol ${t.v}`
    return `the word ${t.v}`
  }

  private or(): JmeNode {
    let a = this.and()
    while (this.isWord('or') || this.isWord('xor')) {
      const op = (this.next() as { v: string }).v
      a = { t: 'bin', op, a, b: this.and() }
    }
    return a
  }
  private and(): JmeNode {
    let a = this.not()
    while (this.isWord('and')) {
      this.next()
      a = { t: 'bin', op: 'and', a, b: this.not() }
    }
    return a
  }
  private not(): JmeNode {
    if (this.isWord('not')) {
      this.next()
      return { t: 'un', op: 'not', a: this.not() }
    }
    return this.cmp()
  }
  private cmp(): JmeNode {
    let a = this.except()
    for (;;) {
      const t = this.peek()
      if (t.k === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(t.v)) {
        this.next()
        a = { t: 'bin', op: t.v, a, b: this.except() }
      } else if (t.k === 'name' && t.v === 'isa') {
        throw new JmeRefusal('the word isa')
      } else return a
    }
  }
  private except(): JmeNode {
    let a = this.range()
    while (this.isWord('except')) {
      this.next()
      a = { t: 'bin', op: 'except', a, b: this.range() }
    }
    return a
  }
  private range(): JmeNode {
    const from = this.add()
    if (!this.isOp('..')) return from
    this.next()
    const to = this.add()
    if (this.isOp('#')) {
      this.next()
      return { t: 'range', from, to, step: this.add() }
    }
    return { t: 'range', from, to }
  }
  private add(): JmeNode {
    let a = this.mul()
    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.next() as { v: string }).v
      a = { t: 'bin', op, a, b: this.mul() }
    }
    return a
  }
  private mul(): JmeNode {
    let a = this.unary()
    for (;;) {
      if (this.isOp('*') || this.isOp('/')) {
        const op = (this.next() as { v: string }).v
        a = { t: 'bin', op, a, b: this.unary() }
        continue
      }
      // Implicit multiplication: 2x, 2(x+1), (a)(b), 2pi. A name after a number is a product,
      // never a call, and a bracket after a bracket too.
      const t = this.peek()
      const implicit = (t.k === 'name' && !KEYWORDS.has(t.v)) || (t.k === 'p' && t.v === '(') || (t.k === 'num' && a.t !== 'num')
      if (implicit) {
        a = { t: 'bin', op: '*', a, b: this.unary() }
        continue
      }
      return a
    }
  }
  private unary(): JmeNode {
    if (this.isOp('-') || this.isOp('+')) {
      const op = (this.next() as { v: '-' | '+' }).v
      return { t: 'un', op, a: this.unary() }
    }
    return this.pow()
  }
  private pow(): JmeNode {
    const a = this.postfix()
    if (this.isOp('^')) {
      this.next()
      return { t: 'bin', op: '^', a, b: this.unary() }
    }
    return a
  }
  private postfix(): JmeNode {
    const a = this.primary()
    if (this.isOp('!')) throw new JmeRefusal('a factorial')
    if (this.isP('[')) throw new JmeRefusal('an index into a list')
    return a
  }
  private primary(): JmeNode {
    const t = this.next()
    if (t.k === 'num') return { t: 'num', raw: t.v }
    if (t.k === 'str') throw new JmeRefusal('a string')
    if (t.k === 'p' && t.v === '(') {
      const inner = this.or()
      this.expectP(')')
      return inner
    }
    if (t.k === 'p' && t.v === '[') {
      const items: JmeNode[] = []
      if (!this.isP(']')) {
        items.push(this.or())
        while (this.isP(',')) {
          this.next()
          items.push(this.or())
        }
      }
      this.expectP(']')
      return { t: 'list', items }
    }
    if (t.k === 'name') {
      if (KEYWORDS.has(t.v) && t.v !== 'true' && t.v !== 'false') throw new JmeRefusal(`the word ${t.v}`)
      if (this.isP('(')) {
        this.next()
        const args: JmeNode[] = []
        if (!this.isP(')')) {
          args.push(this.or())
          while (this.isP(',')) {
            this.next()
            args.push(this.or())
          }
        }
        this.expectP(')')
        // Numbas folds a name to lower case when it looks it up (jme.normaliseName), so Random(1..5)
        // and Sin(x) run there. Only a call is folded here: a variable keeps its case, as in PhysLab.
        return { t: 'call', f: t.v.toLowerCase(), args }
      }
      return { t: 'name', v: t.v }
    }
    throw new JmeRefusal(this.describe(t))
  }
}

export function parseJme(src: string): JmeNode {
  return new JmeParser(tokenize(src)).parse()
}

// --- emitting mathjs -------------------------------------------------------

/**
 * How trig is read. JME's sin takes radians; PhysLab draws a question's variables with the
 * calculator in degrees (questions/variables.ts), so a variable or a numeric answer keeps its
 * meaning only if the argument is turned into degrees (`sin(x * 180 / pi)`) and an inverse is
 * turned back into radians (`asin(x) * pi / 180`). Plain arithmetic, not mathjs's `x rad` unit:
 * `dependenciesOf` reads every free name in a formula as a variable, and `rad` is no variable,
 * so a tagged formula draws nothing. `sin(radians(e))` and `degrees(arcsin(e))` are what
 * `mathToJme` writes for PhysLab's own degree-convention `sin(e)` and `asin(e)`, so they come
 * home as those. An expression part is different: the student types `sin(x)` in the same
 * convention the answer is checked in, so there the names stay as they are.
 */
type TrigMode = 'radians' | 'same'

/** mathjs precedence, used only to decide where a bracket is needed. */
const P = { cond: 0, or: 1, and: 2, cmp: 3, add: 4, mul: 5, un: 6, pow: 7, atom: 9 }
type Emitted = { s: string; p: number }

const SAME_FUNCTIONS = new Set(['sqrt', 'abs', 'sinh', 'cosh', 'tanh', 'floor', 'ceil', 'mod', 'max', 'min', 'round', 'exp'])
const INVERSE_TRIG: Record<string, string> = { arcsin: 'asin', arccos: 'acos', arctan: 'atan' }

/** A number as JME wrote it; `1.50` stays `1.50` and `1e3` stays `1e3`, both of which mathjs reads. */
const wrap = (e: Emitted, min: number): string => (e.p < min ? `(${e.s})` : e.s)

export function emit(n: JmeNode, trig: TrigMode): Emitted {
  switch (n.t) {
    case 'num':
      return { s: n.raw, p: P.atom }
    case 'name':
      if (n.v === 'infinity') throw new JmeRefusal('infinity')
      return { s: n.v, p: P.atom }
    case 'list':
      throw new JmeRefusal('a list')
    case 'range':
      throw new JmeRefusal('a range outside random')
    case 'un': {
      const a = emit(n.a, trig)
      if (n.op === 'not') return { s: `not ${wrap(a, P.un)}`, p: P.un }
      if (n.op === '+') return a
      return { s: `-${wrap(a, P.un)}`, p: P.un }
    }
    case 'bin':
      return emitBinary(n, trig)
    case 'call':
      return emitCall(n, trig)
  }
}

function emitBinary(n: Extract<JmeNode, { t: 'bin' }>, trig: TrigMode): Emitted {
  const { op } = n
  if (op === 'xor') throw new JmeRefusal('the word xor')
  if (op === 'except') throw new JmeRefusal('except outside random')
  if (op === '^') {
    // e^x is how JME writes the exponential; mathjs has e too, but exp(x) is what the design
    // table names and what a formula field reads best.
    if (n.a.t === 'name' && n.a.v === 'e') return { s: `exp(${emit(n.b, trig).s})`, p: P.atom }
    const a = emit(n.a, trig)
    const b = emit(n.b, trig)
    // Right-associative: the left side needs a bracket at the same level, the right does not.
    return { s: `${wrap(a, P.pow + 1)} ^ ${wrap(b, P.pow)}`, p: P.pow }
  }
  const table: Record<string, { s: string; p: number }> = {
    '+': { s: '+', p: P.add },
    '-': { s: '-', p: P.add },
    '*': { s: '*', p: P.mul },
    '/': { s: '/', p: P.mul },
    '=': { s: '==', p: P.cmp },
    '<>': { s: '!=', p: P.cmp },
    '<': { s: '<', p: P.cmp },
    '>': { s: '>', p: P.cmp },
    '<=': { s: '<=', p: P.cmp },
    '>=': { s: '>=', p: P.cmp },
    and: { s: 'and', p: P.and },
    or: { s: 'or', p: P.or }
  }
  const t = table[op]
  if (!t) throw new JmeRefusal(`the symbol ${op}`)
  const a = emit(n.a, trig)
  const b = emit(n.b, trig)
  // Left-associative: a − (b − c) keeps its bracket, (a − b) − c does not need one.
  return { s: `${wrap(a, t.p)} ${t.s} ${wrap(b, t.p + 1)}`, p: t.p }
}

function emitCall(n: Extract<JmeNode, { t: 'call' }>, trig: TrigMode): Emitted {
  const f = n.f
  const args = (): string[] => n.args.map((a) => emit(a, trig).s)
  const one = (): string => {
    if (n.args.length !== 1) throw new JmeRefusal(`${f} with ${n.args.length} inputs`)
    return emit(n.args[0], trig).s
  }
  const atom = (s: string): Emitted => ({ s, p: P.atom })

  if (f === 'random') throw new JmeRefusal('random inside a formula')
  if (SAME_FUNCTIONS.has(f)) return atom(`${f}(${args().join(', ')})`)
  if (f === 'precround') {
    if (n.args.length !== 2) throw new JmeRefusal('precround without two inputs')
    return atom(`round(${args().join(', ')})`)
  }
  if (f === 'siground') {
    // Significant figures are not a mathjs function, and round() refuses a negative number of
    // decimals, so the number is written out to that many figures and read back: a saved
    // question then needs nothing registered on the calculator to draw its numbers.
    if (n.args.length !== 2) throw new JmeRefusal('siground without two inputs')
    return atom(`number(format(${args().join(', ')}))`)
  }
  // The app's calculator (math/expr.ts) follows the scientific-calculator convention JME also uses: log(x) is
  // base 10 and ln(x) natural, so both keep their names. Only the two-input form differs:
  // JME's log(x, b) is the log of x to base b; the calculator's log(a, b) is the log base a
  // of b, so the inputs swap.
  if (f === 'ln') return atom(`ln(${one()})`)
  if (f === 'log') {
    if (n.args.length === 1) return atom(`log(${one()})`)
    if (n.args.length === 2) {
      const [x, b] = args()
      return atom(`log(${b}, ${x})`)
    }
    throw new JmeRefusal(`log with ${n.args.length} inputs`)
  }
  if (f === 'trunc') return atom(`fix(${one()})`)
  if (f === 'dec') {
    if (n.args.length !== 1) throw new JmeRefusal(`dec with ${n.args.length} inputs`)
    // Numbas's dec(x) is the signed fractional part, x − trunc(x): dec(3.5) = 0.5, dec(−3.5) =
    // −0.5. Emitting the bare argument (the bug this replaces) silently dropped the whole part of
    // every number dec() touched, wrong in every variant and in the marked answer alike.
    const a = emit(n.args[0], trig)
    return { s: `${wrap(a, P.add)} - fix(${a.s})`, p: P.add }
  }
  const innerCall = (names: readonly string[]): JmeNode | null => {
    const a = n.args[0]
    return a.t === 'call' && names.includes(a.f) && a.args.length === 1 ? a.args[0] : null
  }
  if (f === 'sin' || f === 'cos' || f === 'tan') {
    if (n.args.length !== 1) throw new JmeRefusal(`${f} with ${n.args.length} inputs`)
    // sin(radians(e)) is how toExam writes PhysLab's own sin(e); it means the same in degrees.
    const own = trig === 'radians' ? innerCall(['radians']) : null
    if (own) return atom(`${f}(${emit(own, trig).s})`)
    const a = emit(n.args[0], trig)
    return atom(trig === 'radians' ? `${f}(${wrap(a, P.mul + 1)} * 180 / pi)` : `${f}(${a.s})`)
  }
  if (f in INVERSE_TRIG) {
    const g = INVERSE_TRIG[f]
    const a = one()
    return trig === 'radians' ? { s: `${g}(${a}) * pi / 180`, p: P.mul } : atom(`${g}(${a})`)
  }
  if (f === 'radians' || f === 'degrees') {
    if (n.args.length !== 1) throw new JmeRefusal(`${f} with ${n.args.length} inputs`)
    // degrees(arcsin(e)) is how toExam writes PhysLab's own asin(e), which gives degrees already.
    const own = f === 'degrees' && trig === 'radians' ? innerCall(Object.keys(INVERSE_TRIG)) : null
    if (own) return atom(`${INVERSE_TRIG[(n.args[0] as Extract<JmeNode, { t: 'call' }>).f]}(${emit(own, trig).s})`)
    const a = wrap(emit(n.args[0], trig), P.mul + 1)
    return { s: f === 'radians' ? `${a} * pi / 180` : `${a} * 180 / pi`, p: P.mul }
  }
  if (f === 'if') {
    if (n.args.length !== 3) throw new JmeRefusal('if without three inputs')
    const [p, a, b] = args()
    return { s: `${p} ? ${a} : ${b}`, p: P.cond }
  }
  throw new JmeRefusal(`the function ${f}`)
}

/** JME text → a mathjs expression string, or a JmeRefusal naming what could not be read. */
export function jmeToMath(src: string, trig: TrigMode = 'radians'): string {
  return emit(parseJme(src), trig).s
}

/** A plain number in the tree: `3`, `-3`, `0.5`; null for anything else. */
function plainNumber(n: JmeNode): number | null {
  if (n.t === 'num') return Number(n.raw)
  if (n.t === 'un' && n.op === '-') {
    const v = plainNumber(n.a)
    return v === null ? null : -v
  }
  if (n.t === 'un' && n.op === '+') return plainNumber(n.a)
  return null
}

/**
 * A variable's JME definition → how PhysLab draws it. `random(a..b)`, `random(a..b#s)` and
 * `random(a..b except 0)` with plain numbers become a range; `random(1, 2, 3)` and
 * `random([1, 2, 3])` a list; everything else is a formula in the other variables. A range whose
 * ends are other variables becomes the formula `randomRange(a, b, step)`; a random draw buried
 * inside a larger formula is refused.
 */
export function jmeToVariableDef(src: string): VariableDef {
  const node = parseJme(src)
  if (node.t === 'call' && node.f === 'random') {
    if (node.args.length === 1) {
      let arg = node.args[0]
      let exclude: number[] | undefined
      if (arg.t === 'bin' && arg.op === 'except') {
        const ex = arg.b.t === 'list' ? arg.b.items : [arg.b]
        const nums = ex.map(plainNumber)
        if (nums.some((v) => v === null)) throw new JmeRefusal('except with something that is not a number')
        exclude = nums as number[]
        arg = arg.a
      }
      if (arg.t === 'range') {
        const from = plainNumber(arg.from)
        const to = plainNumber(arg.to)
        const step = arg.step === undefined ? 1 : plainNumber(arg.step)
        if (from !== null && to !== null && step !== null) {
          return exclude === undefined ? { kind: 'range', from, to, step } : { kind: 'range', from, to, step, exclude }
        }
        // Ends that are other variables (a second speed that must beat the first) are worked out
        // first and drawn by randomRange, which variables.ts has for exactly this; only the
        // "except" form has no formula to go in.
        if (exclude !== undefined) throw new JmeRefusal('a random range whose ends are not plain numbers, with except')
        const ends = [arg.from, arg.to, ...(arg.step === undefined ? [] : [arg.step])].map((e) => emit(e, 'radians').s)
        return { kind: 'expr', expr: `${RANDOM_RANGE}(${ends.join(', ')})` }
      }
      if (arg.t === 'list') {
        const items = arg.items.map(plainNumber)
        if (items.some((v) => v === null)) throw new JmeRefusal('a random choice from things that are not numbers')
        // `list except x` takes the element (or each element of a list) out of the list; dropping
        // it drew values the author had excluded.
        const kept = (items as number[]).filter((v) => !(exclude ?? []).includes(v))
        if (exclude !== undefined && kept.length === 0) throw new JmeRefusal('a random choice with every value taken out by except')
        return { kind: 'list', items: kept }
      }
      // random(30) is a choice from one value, which an author writes to pin a number for now.
      const only = plainNumber(arg)
      if (only !== null && exclude === undefined) return { kind: 'list', items: [only] }
      throw new JmeRefusal('a random choice from something that is not a range or a list')
    }
    const items = node.args.map(plainNumber)
    if (items.length === 0 || items.some((v) => v === null)) throw new JmeRefusal('a random choice from things that are not numbers')
    return { kind: 'list', items: items as number[] }
  }
  return { kind: 'expr', expr: emit(node, 'radians').s }
}

// ===========================================================================
// mathjs → JME
// ===========================================================================

const ARC: Record<string, string> = { asin: 'arcsin', acos: 'arccos', atan: 'arctan' }

type Node = MathNode

const isSymbol = (n: Node, name: string): boolean => n.type === 'SymbolNode' && (n as SymbolNode).name === name
const isConst = (n: Node, value: number): boolean => n.type === 'ConstantNode' && (n as ConstantNode).value === value
const isFn = (n: Node, names: string[]): n is FunctionNode => n.type === 'FunctionNode' && names.includes((n as FunctionNode).fn.name)
const isOp = (n: Node, op: string): n is OperatorNode => n.type === 'OperatorNode' && (n as OperatorNode).op === op
/** The node inside any brackets: mathjs keeps `(a * b)` as a node of its own, which a pattern must see through. */
const unparen = (n: Node): Node => (n.type === 'ParenthesisNode' ? unparen((n as ParenthesisNode).content) : n)
/** `x * 180 / pi`, the importer's spelling of a radian argument → x; null for anything else. */
function radianArgument(n: Node): Node | null {
  const a = unparen(n)
  if (!isOp(a, '/') || a.args.length !== 2 || !isSymbol(a.args[1], 'pi')) return null
  const times = unparen(a.args[0])
  return isOp(times, '*') && times.args.length === 2 && isConst(times.args[1], 180) ? times.args[0] : null
}
/** `x rad` or `x deg` (the calculator's `x°`), mathjs's own unit tag → x; null for anything else. */
function unitTagged(n: Node, unit: string): Node | null {
  const a = unparen(n)
  return isOp(a, '*') && a.implicit && a.args.length === 2 && isSymbol(a.args[1], unit) ? a.args[0] : null
}

/**
 * `a · b` is dot(a, b) once preprocess has read it, and PhysLab's dot multiplies two numbers and
 * scales a vector by a number; only two vectors make a dot product. JME's dot() is that last case
 * alone — its reference lists "vector, vector", "matrix, vector", "vector, matrix" and "matrix,
 * matrix" → number, never a plain number — so a file carrying dot(2, A) cannot run in Numbas and
 * PhysLab's own importer refuses to read it back. Every name in a question is a number
 * (variables.ts draws each one with Number(…)), so a · is a product, JME's `*` ("number, vector →
 * vector" and "vector, number → vector" included), unless both sides are written as vectors
 * (vec(…), [a, b]): there JME's own dot() stays. Spelling those vector literals the JME way is not
 * done anywhere in this exporter, and the importer refuses vectors, so that case keeps only the name.
 *
 * The product is made as a node, not as text, so mathjs brackets it by where it stands: a dot()
 * typed as a call in x/dot(y, z) is x/(y * z), where the bare text x / y * z would be (x/y)·z.
 */
function dotsToProducts(tree: Node): Node {
  const isVector = (n: Node): boolean => {
    const kind = inferKind(n, () => 'number')
    return kind === 'vector' || kind === 'point'
  }
  const swap = (n: Node): Node => {
    if (!isFn(n, ['dot']) || n.args.length !== 2) return n
    const [a, b] = n.args
    if (isVector(a) && isVector(b)) return n
    return new math.OperatorNode('*', 'multiply', [a.transform(swap), b.transform(swap)])
  }
  return tree.transform(swap)
}

/**
 * mathjs → JME, undoing what `jmeToMath` did: round → precround, the calculator's log(a, b) →
 * JME's log(x, b), `sin(x * 180 / pi)` → sin(x), `asin(x) * pi / 180` → arcsin(x), a ? b : c →
 * if, and a · between numbers → a * b (dotsToProducts). A bare `sin(e)` is a PhysLab author's own,
 * in degrees, and JME's sin takes radians, so it is written `sin(radians(e))` and a bare `asin(e)`
 * as `degrees(arcsin(e))` — except for an expression part (`trig === 'same'`), where the student
 * types in the convention the answer is checked in and the names stay. Everything else mathjs
 * prints is JME already (`+ - * / ^`, `and or not`, the function names).
 */
export function mathToJme(expr: string, trig: TrigMode = 'radians'): string {
  const root = dotsToProducts(math.parse(preprocess(expr)))
  return printMathAst(root, (node, s) => {
    if (node.type === 'ConditionalNode') {
      const c = node as ConditionalNode
      return `if(${s(c.condition)}, ${s(c.trueExpr)}, ${s(c.falseExpr)})`
    }
    if (node.type === 'FunctionNode') {
      const f = node as FunctionNode
      const name = f.fn.name
      const args = f.args
      if (name === 'round' && args.length === 2) return `precround(${s(args[0])}, ${s(args[1])})`
      if (name === 'fix' && args.length === 1) return `trunc(${s(args[0])})`
      if (name === 'log' && args.length === 2) return `log(${s(args[1])}, ${s(args[0])})`
      if (name === 'number' && args.length === 1 && isFn(args[0], ['format']) && args[0].args.length === 2) {
        return `siground(${s(args[0].args[0])}, ${s(args[0].args[1])})`
      }
      // A range with worked-out ends goes back to JME's own random(a..b#step); an end that is
      // more than a name or a number is bracketed, so `..` cannot take part of it.
      if (name === RANDOM_RANGE && (args.length === 2 || args.length === 3)) {
        const end = (n: Node): string => {
          const u = unparen(n)
          return u.type === 'SymbolNode' || u.type === 'ConstantNode' ? s(u) : `(${s(u)})`
        }
        const step = args.length === 3 && !isConst(unparen(args[2]), 1) ? `#${end(args[2])}` : ''
        return `random(${end(args[0])}..${end(args[1])}${step})`
      }
      // `2 × 3` is the calculator's own spelling; JME has only *.
      if (name === 'timesOrCross' && args.length === 2) return s(new math.OperatorNode('*', 'multiply', [args[0], args[1]]))
      if ((name === 'sin' || name === 'cos' || name === 'tan') && args.length === 1) {
        // `* 180 / pi` is the importer's own conversion in a number or a variable (trig 'radians'),
        // so only there is it taken off. An expression part (trig 'same') is marked in radians
        // and jmeToMath adds no factor to it: one met there is the author's, and sin(x * 180 / pi)
        // is not sin(x). An explicit `x rad` is a unit the author wrote, in either mode.
        const rad = (trig === 'radians' ? radianArgument(args[0]) : null) ?? unitTagged(args[0], 'rad')
        if (rad) return `${name}(${s(unparen(rad))})`
        const deg = unitTagged(args[0], 'deg')
        if (deg) return `${name}(radians(${s(unparen(deg))}))`
        return trig === 'radians' ? `${name}(radians(${s(unparen(args[0]))}))` : undefined
      }
      if (name in ARC && args.length === 1) {
        const inner = `${ARC[name]}(${s(unparen(args[0]))})`
        return trig === 'radians' ? `degrees(${inner})` : inner
      }
      return undefined
    }
    if (node.type === 'OperatorNode') {
      const op = node as OperatorNode
      if (op.op === '==') return `${s(op.args[0])} = ${s(op.args[1])}`
      if (op.op === '!=') return `${s(op.args[0])} <> ${s(op.args[1])}`
      // asin(x) * pi / 180 → arcsin(x) (number or variable only); x * pi / 180 → radians(x);
      // x * 180 / pi → degrees(x).
      if (op.op === '/' && op.args.length === 2 && isOp(op.args[0], '*') && op.args[0].args.length === 2) {
        const [left, right] = op.args[0].args
        if (isSymbol(right, 'pi') && isConst(op.args[1], 180)) {
          // Like the sin case above: in an expression part (trig 'same') the `* pi / 180` after
          // an asin is the author's own, so it is written radians(arcsin(x)), not arcsin(x).
          if (trig === 'radians' && isFn(left, Object.keys(ARC)) && left.args.length === 1) return `${ARC[left.fn.name]}(${s(left.args[0])})`
          return `radians(${s(left)})`
        }
        if (isConst(right, 180) && isSymbol(op.args[1], 'pi')) return `degrees(${s(left)})`
      }
      if (op.op === '*' && op.implicit) {
        // x° reaches here as `x deg`, a unit Numbas does not have; radians(x) is the same angle.
        if (op.args.length === 2 && isSymbol(op.args[1], 'deg')) return `radians(${s(unparen(op.args[0]))})`
        return `${s(op.args[0])} * ${s(op.args[1])}`
      }
      return undefined
    }
    return undefined
  })
}

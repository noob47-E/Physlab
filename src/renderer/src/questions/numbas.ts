// Numbas `.exam` files in and out. Numbas (numbas.org.uk) is the open question bank most of the
// bundled questions come from; its file is one line `// Numbas version: …` and then JSON in the
// shape of exam_schema 10.0. This module reads the subset PhysLab can play (§2.2 of the 0.7
// design) and writes a PhysLab set back in that shape, and it translates Numbas's own formula
// language, JME, into the mathjs syntax every PQJSON expression is written in (§2.3). A question
// PhysLab cannot use is skipped with one plain sentence in the report, never with a JSON path
// or a function name a teacher has to look up. Headless: no React, no store, no DOM.

import type { ConditionalNode, ConstantNode, FunctionNode, MathNode, OperatorNode, ParenthesisNode, SymbolNode } from 'mathjs'
import { math, preprocess, symbolsOf } from '../math/expr'
import { fmtPrecise } from '../math/format'
import { texToPlain } from '../math/pure/work'
import { licenseFromNumbas, refusalSentence } from './license'
import {
  DEFAULT_BAND,
  bandOf,
  formatVersionOf,
  RESERVED_NAMES,
  UNIT_IDS,
  isCommandArgument,
  VARIABLE_NAME,
  type BandTolerance,
  type License,
  type LicenseId,
  type PQFile,
  type PQPart,
  type PQQuestion,
  type PQStep,
  type PQSteps,
  type PQVariable,
  type Tolerance,
  type UnitId,
  type VariableDef
} from './pqjson'
import { unitInPrompt } from './units'
import { RANDOM_RANGE } from './variables'

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

type JmeNode =
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
        return { t: 'call', f: t.v, args }
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
export type TrigMode = 'radians' | 'same'

/** mathjs precedence, used only to decide where a bracket is needed. */
const P = { cond: 0, or: 1, and: 2, cmp: 3, add: 4, mul: 5, un: 6, pow: 7, atom: 9 }
type Emitted = { s: string; p: number }

const SAME_FUNCTIONS = new Set(['sqrt', 'abs', 'sinh', 'cosh', 'tanh', 'floor', 'ceil', 'mod', 'max', 'min', 'round', 'exp'])
const INVERSE_TRIG: Record<string, string> = { arcsin: 'asin', arccos: 'acos', arctan: 'atan' }

/** A number as JME wrote it; `1.50` stays `1.50` and `1e3` stays `1e3`, both of which mathjs reads. */
const wrap = (e: Emitted, min: number): string => (e.p < min ? `(${e.s})` : e.s)

function emit(n: JmeNode, trig: TrigMode): Emitted {
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
  // The app's calculator (math/expr.ts) follows the Casio convention JME also uses: log(x) is
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
  if (f === 'dec') return emit(n.args[0], trig)
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
        return { kind: 'list', items: items as number[] }
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
// Reading an .exam
// ===========================================================================

export interface ExamImport {
  file: PQFile
  /** One plain sentence per skipped question or per thing worth telling the teacher. */
  report: string[]
}

/** Raised inside one question to skip it; `reason` completes "Question 'T' was skipped: it …". */
class Skip extends Error {
  constructor(readonly reason: string) {
    super(reason)
  }
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Exact case first, then all-lowercase: Numbas's own rule for reading a part, because files
 * from older editors wrote `minvalue` and `checkingtype` where the schema now says `minValue`.
 */
export function tryGet(o: Obj, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(o, key)) return o[key]
  const lower = key.toLowerCase()
  return Object.prototype.hasOwnProperty.call(o, lower) ? o[lower] : undefined
}

const asString = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')

/** Numbers quoted in a report sentence are not measurements, so the plain default precision does. */
const SENTENCE_PRECISION = { decimals: 4, precisionMode: 'dp' as const }
const num = (v: number): string => fmtPrecise(v, SENTENCE_PRECISION)

// --- HTML → lines ------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', times: '×', divide: '÷', deg: '°',
  minus: '−', middot: '·', ndash: '–', mdash: '—', hellip: '…', pi: 'π', theta: 'θ', alpha: 'α',
  beta: 'β', gamma: 'γ', mu: 'μ', omega: 'ω', lambda: 'λ', rho: 'ρ', Omega: 'Ω', plusmn: '±', le: '≤', ge: '≥'
}

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z]+);/g, (m, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m
    }
    return ENTITIES[body] ?? m
  })
}

/** What one question's text is read against: its variables, and any it adds for a `{a*b}` in the text. */
interface TextContext {
  vars: PQVariable[]
  names: Set<string>
  /** Counts the variables made for expressions in the text, so their names stay distinct. */
  made: number
  /**
   * Variables defined as a matrix written out entry by entry (`matrix([1, 2], [3, 4])`). PhysLab's
   * variables are numbers, so these are not variables at all: a matrix part that names one reads
   * its entries from here, and nothing else may use it.
   */
  matrices: Map<string, JmeNode>
}

/**
 * A `{…}` or `\var{…}` in Numbas text shows a value. A plain variable name becomes the same
 * chip in PhysLab; an expression (`{a*b}`) becomes a chip on a new formula variable, because
 * PhysLab's chips name variables and nothing else — the author then sees where the number
 * comes from in the Variables tab.
 */
function chipFor(inner: string, ctx: TextContext): string {
  const src = inner.trim()
  if (VARIABLE_NAME.test(src)) {
    if (ctx.names.has(src)) return `{${src}}`
    // A matrix variable is a variable, just not one PhysLab can show — say so, not "no variable".
    if (ctx.matrices.has(src)) throw new Skip(`shows the matrix ${src} in its text, which PhysLab can only take as an answer`)
    throw new Skip(`shows {${src}} in its text, but there is no variable called ${src}`)
  }
  let expr: string
  try {
    expr = jmeToMath(src, 'radians')
  } catch (e) {
    if (e instanceof JmeRefusal) throw new Skip(`uses ${e.what} in its text, which PhysLab does not know`)
    throw e
  }
  let name: string
  do {
    ctx.made++
    name = `shown${ctx.made}`
  } while (ctx.names.has(name))
  ctx.names.add(name)
  ctx.vars.push({ name, def: { kind: 'expr', expr }, description: `Shown in the text: ${src}` })
  return `{${name}}`
}

/**
 * The inside of a `\(…\)` or `\[…\]`. Numbas substitutes only `\var{…}` in LaTeX; a bare group
 * such as the `{a}` of `\frac{a}{b}` is LaTeX, and it must not become a chip when `a` is also a
 * variable's name — a space inside the group keeps `substitute` off it and KaTeX does not mind.
 */
function chipLatex(tex: string, ctx: TextContext): string {
  if (/\\simplify\b/.test(tex)) throw new Skip('uses \\simplify, which PhysLab cannot show')
  return tex
    .replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (m, name: string) => (ctx.names.has(name) ? `{ ${name}}` : m))
    .replace(/\\var\{([^{}]*)\}/g, (_m, inner: string) => chipFor(inner, ctx))
}

/** Plain text between the maths: `{…}` and `\var{…}` both show a value. */
function chipText(text: string, ctx: TextContext): string {
  // One pass, so the variables made for expressions are numbered in reading order.
  return text.replace(/\\var\{([^{}]*)\}|\{([^{}]*)\}/g, (_m, a: string | undefined, b: string | undefined) => chipFor(a ?? b ?? '', ctx))
}

const MATHS = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g
/** Where a lifted maths span sat in the text while the tags were stripped (a private-use character no page holds). */
const MARK = '\uE000'
const MARKED = /\uE000(\d+)\uE000/g
const ONLY_MARK = /^\uE000\d+\uE000$/

/**
 * Numbas HTML → the lines of a PhysLab statement: plain text with chips, display maths on a
 * line of its own starting `$$`, inline maths kept as `\(…\)`. Maths is lifted out before the
 * tags go, so an `x < 3` inside it is not mistaken for a tag. A picture, table or frame is
 * something PhysLab has nowhere to show, so the question is skipped rather than shown short.
 */
function htmlToLines(html: string, ctx: TextContext): string[] {
  if (/<\s*(img|table|iframe)\b/i.test(html)) throw new Skip('has a picture or table PhysLab cannot show')
  const spans: { tex: string; display: boolean }[] = []
  const lifted = html.replace(MATHS, (_m, inline: string | undefined, display: string | undefined) => {
    const i = spans.length
    if (display !== undefined) {
      spans.push({ tex: decodeEntities(display).trim(), display: true })
      return `\n${MARK}${i}${MARK}\n`
    }
    spans.push({ tex: decodeEntities(inline ?? ''), display: false })
    return `${MARK}${i}${MARK}`
  })
  const text = decodeEntities(
    lifted
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\s*\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
      .replace(/<\s*(li|tr)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
  // Chips are read in the order they appear, text and maths alike, so the variables made for
  // expressions in the text are numbered the way a reader meets them.
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
    .map((line) => {
      if (ONLY_MARK.test(line)) {
        const span = spans[Number(line.slice(1, -1))]
        return span.display ? `$$${chipLatex(span.tex, ctx)}$$` : `\\(${chipLatex(span.tex, ctx)}\\)`
      }
      return line
        .split(MARKED)
        .map((piece, k) => (k % 2 === 1 ? `\\(${chipLatex(spans[Number(piece)].tex, ctx)}\\)` : chipText(piece, ctx)))
        .join('')
    })
}

/** A chip kept whole through texToPlain, which would otherwise strip its braces. */
const KEEP = '\uE001'

/** A plain sentence from a line: inline maths spoken (texToPlain), chips kept whole. */
function spoken(line: string): string {
  return line.replace(/\\\(([\s\S]*?)\\\)/g, (_m, tex: string) => {
    const kept = tex.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, `${KEEP}$1${KEEP}`)
    return texToPlain(kept).replace(/\uE001([A-Za-z][A-Za-z0-9_]*)\uE001/g, '{$1}')
  })
}

/**
 * Lines → steps. A line of text is a step's head; a display-maths line becomes the `tex` of
 * the step before it when that step has none, and otherwise a step of its own whose head is
 * the maths spoken, so a student reading only the heads still follows.
 */
function linesToSteps(lines: string[]): PQStep[] {
  const out: PQStep[] = []
  for (const line of lines) {
    if (line.startsWith('$$')) {
      const tex = line.slice(2, -2)
      const last = out[out.length - 1]
      if (last && last.tex === undefined) last.tex = tex
      else out.push({ head: spoken(`\\(${tex}\\)`), tex, blank: false })
    } else out.push({ head: spoken(line), blank: false })
  }
  return out
}

/** The closing line `toExam` writes for a number part's unit, read back so a set round-trips. */
const UNIT_LINE = /^Give your answer in (.+)\.$/

// --- the tolerance of a number part ------------------------------------------

/** The one number an expression comes to when it mentions no variable, else null. */
function constantValue(expr: string): number | null {
  try {
    const node = math.simplify(expr)
    if (symbolsOf(node).length > 0) return null
    const v = Number(node.evaluate({}))
    return Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

/** The canonical forms `toExam` writes: `(X) * (1 - t)` / `(X) * (1 + t)` and `(X) - t` / `(X) + t`. */
const REL_MIN = /^\((.*)\) \* \(1 - ([0-9.eE+-]+)\)$/
const REL_MAX = /^\((.*)\) \* \(1 \+ ([0-9.eE+-]+)\)$/
const ABS_MIN = /^\((.*)\) - ([0-9.eE+-]+)$/
const ABS_MAX = /^\((.*)\) \+ ([0-9.eE+-]+)$/

interface NumberAnswer {
  answer: string
  tolerance: Tolerance
  /** Set when the tolerance had to be assumed. */
  note?: string
}

/**
 * Numbas marks a number part right when it lies between two JME expressions; PhysLab wants one
 * answer and one tolerance that holds for every variant. Equal bounds are the answer itself
 * (checked to the part's precision, or 2 % when it names none). Otherwise the answer is the
 * midpoint and the tolerance is recovered when the gap, or the gap as a fraction of the sum,
 * simplifies to a number; when neither does, 2 % is assumed and the report says so.
 */
function readNumberAnswer(minText: string, maxText: string, precisionType: string, precision: number | null): NumberAnswer {
  const rel = [REL_MIN.exec(minText), REL_MAX.exec(maxText)]
  if (rel[0] && rel[1] && rel[0][1] === rel[1][1] && rel[0][2] === rel[1][2]) {
    return { answer: jmeToMath(rel[0][1]), tolerance: { kind: 'relative', value: Number(rel[0][2]) } }
  }
  const abs = [ABS_MIN.exec(minText), ABS_MAX.exec(maxText)]
  if (abs[0] && abs[1] && abs[0][1] === abs[1][1] && abs[0][2] === abs[1][2]) {
    return { answer: jmeToMath(abs[0][1]), tolerance: { kind: 'absolute', value: Number(abs[0][2]) } }
  }
  const min = jmeToMath(minText)
  const max = jmeToMath(maxText)
  if (min === max) {
    if (precisionType === 'dp' && precision !== null) return { answer: min, tolerance: { kind: 'absolute', value: 0.5 * 10 ** -precision } }
    if (precisionType === 'sigfig' && precision !== null) return { answer: min, tolerance: { kind: 'relative', value: 0.5 * 10 ** (1 - precision) } }
    return { answer: min, tolerance: { kind: 'relative', value: 0.02 } }
  }
  const midpoint = `((${min}) + (${max})) / 2`
  let answer = midpoint
  try {
    answer = math.simplify(midpoint).toString()
  } catch {
    // Keep the long form: the midpoint is still right, only longer than it need be.
  }
  const gap = constantValue(`((${max}) - (${min})) / 2`)
  if (gap !== null) return { answer, tolerance: { kind: 'absolute', value: Math.abs(gap) } }
  const fraction = constantValue(`((${max}) - (${min})) / ((${max}) + (${min}))`)
  if (fraction !== null) return { answer, tolerance: { kind: 'relative', value: Math.abs(fraction) } }
  return {
    answer,
    tolerance: { kind: 'relative', value: 0.02 },
    note: `PhysLab could not read how close an answer must be, so it accepts ${num(2)} %`
  }
}

// --- one question ------------------------------------------------------------

/** Free names in a mathjs expression that are neither the question's variables nor the calculator's own. */
function freeSymbols(expr: string, names: Set<string>): string[] {
  const found = symbolsOf(math.parse(expr))
  return [...new Set(found)].filter((n) => {
    if (names.has(n) || RESERVED_NAMES.has(n)) return false
    const t = math.typeOf((math as unknown as Record<string, unknown>)[n])
    return t !== 'number' && t !== 'Complex' && t !== 'boolean'
  })
}

function refuse(e: unknown, where: string): never {
  if (e instanceof JmeRefusal) throw new Skip(`${where} uses ${e.what}, which PhysLab does not know`)
  throw e
}

/** A stable id from the question's own text, so importing the same file twice gives the same ids. */
function stableId(raw: unknown): string {
  const text = JSON.stringify(raw)
  let h = 5381
  for (let i = 0; i < text.length; i++) h = (h * 33) ^ text.charCodeAt(i)
  return `numbas-${(h >>> 0).toString(16).padStart(8, '0')}`
}

const nonEmpty = (v: unknown): boolean =>
  (isObj(v) && Object.keys(v).length > 0) || (Array.isArray(v) && v.length > 0) || (typeof v === 'string' && v.trim() !== '')

interface QuestionRead {
  parts: PQPart[]
  steps: PQStep[]
  statementLines: string[]
  notes: string[]
  /** Numbas's name for a part (`p0`, `p1g0`) → the index of the PhysLab part it became. */
  paths: Map<string, number>
  /** Adaptive marking to turn into `ecf` once every part is read and every name above is known. */
  carried: { index: number; label: string; source: Obj; inherited: boolean }[]
}

/** The rows of a matrix written out entry by entry — `matrix([1, 2], [3, 4])` or `matrix([[1, 2], [3, 4]])` — or null. */
function matrixRows(n: JmeNode): JmeNode[][] | null {
  if (n.t !== 'call' || n.f !== 'matrix' || n.args.length === 0) return null
  const lists = n.args.length === 1 && n.args[0].t === 'list' && n.args[0].items.every((r) => r.t === 'list') ? n.args[0].items : n.args
  if (!lists.every((r) => r.t === 'list')) return null
  const rows = (lists as Extract<JmeNode, { t: 'list' }>[]).map((r) => r.items)
  // No rows (`matrix([])`), a row that is itself a list of lists, or rows of different lengths, is no matrix to type box by box.
  if (rows.length === 0 || rows[0].length === 0 || rows.some((r) => r.length !== rows[0].length || r.some((e) => e.t === 'list'))) return null
  return rows
}

function readVariables(raw: unknown, ordered: string[], matrices: Map<string, JmeNode> = new Map()): PQVariable[] {
  if (!isObj(raw)) return []
  const keys = [...ordered.filter((k) => k in raw), ...Object.keys(raw).filter((k) => !ordered.includes(k))]
  const out: PQVariable[] = []
  const seen = new Set<string>()
  for (const key of keys) {
    const v = raw[key]
    if (!isObj(v)) continue
    const name = asString(v.name) || key
    if (!VARIABLE_NAME.test(name)) throw new Skip(`has a variable named '${name}', which is not a name PhysLab can use`)
    if (RESERVED_NAMES.has(name)) throw new Skip(`uses '${name}' as a variable name, but that already means something in maths`)
    if (seen.has(name)) continue
    seen.add(name)
    // A matrix written out entry by entry is kept for the matrix part that names it (format 2).
    try {
      const node = parseJme(asString(v.definition))
      if (matrixRows(node)) {
        matrices.set(name, node)
        continue
      }
    } catch {
      // Not readable as JME: jmeToVariableDef below says why in its own sentence.
    }
    let def: VariableDef
    try {
      def = jmeToVariableDef(asString(v.definition))
    } catch (e) {
      refuse(e, `variable ${name}`)
    }
    const pv: PQVariable = { name, def }
    const about = decodeEntities(asString(v.description).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
    if (about) pv.description = about
    out.push(pv)
  }
  return out
}

/** One part's steps, in the file's order: each step's prompt is a head, its display maths the tex. */
function readSteps(steps: unknown, ctx: TextContext, into: PQStep[]): void {
  if (!Array.isArray(steps)) return
  for (const s of steps) {
    if (!isObj(s)) continue
    const lines = htmlToLines(asString(tryGet(s, 'prompt')), ctx)
    const heads = lines.filter((l) => !l.startsWith('$$'))
    const maths = lines.find((l) => l.startsWith('$$'))
    if (heads.length === 0 && maths === undefined) continue
    const tex = maths?.slice(2, -2)
    const step: PQStep = { head: heads.length > 0 ? spoken(heads.join(' ')) : spoken(`\\(${tex}\\)`), blank: false }
    if (tex !== undefined) step.tex = tex
    into.push(step)
  }
}

function readChoicePart(p: Obj, label: string, promptLines: string[], ctx: TextContext, read: QuestionRead, marks: number): void {
  const rawChoices = tryGet(p, 'choices')
  if (!Array.isArray(rawChoices)) throw new Skip(`${label} makes its choices with Numbas scripting`)
  const matrix = tryGet(p, 'matrix')
  if (!Array.isArray(matrix)) throw new Skip(`${label} marks its choices with Numbas scripting`)
  const scores = matrix.map((row) => {
    const cell = Array.isArray(row) ? row[0] : row
    if (typeof cell === 'boolean') return cell ? 1 : 0
    const v = Number(cell)
    if (!Number.isFinite(v) || (typeof cell === 'string' && cell.trim() === '')) throw new Skip(`${label} marks its choices with Numbas scripting`)
    return v
  })
  const whys = tryGet(p, 'distractors')
  const choices = rawChoices.map((c, k) => {
    const text = htmlToLines(asString(c), ctx).map(spoken).join(' ')
    const why = Array.isArray(whys) ? htmlToLines(asString(whys[k]), ctx).map(spoken).join(' ') : ''
    const choice: { text: string; correct: boolean; why?: string } = { text, correct: (scores[k] ?? 0) > 0 }
    if (why) choice.why = why
    return choice
  })
  if (!choices.some((c) => c.correct)) throw new Skip(`${label} has no right answer among its choices`)
  const maxMarks = Number(tryGet(p, 'maxMarks'))
  let worth = Math.max(marks > 0 ? marks : 0, maxMarks > 0 ? maxMarks : 0, ...scores)
  if (!(worth > 0)) {
    read.notes.push(`${label} was worth 0 marks in Numbas; PhysLab counts it as 1`)
    worth = 1
  }
  read.parts.push({ type: 'choice', prompt: promptLines.join('\n'), choices, shuffle: tryGet(p, 'shuffleChoices') === true, marks: worth })
}

/** Whether a Numbas part carries adaptive marking of its own: a non-empty list of replacements. */
const replaces = (p: Obj): boolean => {
  const r = tryGet(p, 'variableReplacements')
  return Array.isArray(r) && r.length > 0
}

/**
 * A Numbas matrix part. Only a matrix written out entry by entry becomes a PhysLab matrix part —
 * in the part itself or in a variable it names — because PhysLab's variables are numbers and its
 * boxes need each entry as a formula; `id(3)` or a matrix worked out by a function is skipped with
 * a sentence. Numbas's tolerance is a fixed gap on every entry; with none, the part's precision
 * decides as it does for a number, and failing that the app's one tolerance, 2 %.
 */
function readMatrixPart(p: Obj, label: string, promptLines: string[], ctx: TextContext, read: QuestionRead, marks: number): void {
  const src = asString(tryGet(p, 'correctAnswer')).trim()
  if (src === '') throw new Skip(`gives no answer for ${label}`)
  const unreadable = new Skip(`gives the answer to ${label} as ${src}, which PhysLab can read only as a matrix written out entry by entry`)
  let node: JmeNode
  try {
    node = parseJme(src)
  } catch (e) {
    if (e instanceof JmeRefusal) throw unreadable
    throw e
  }
  if (node.t === 'name' && ctx.matrices.has(node.v)) node = ctx.matrices.get(node.v)!
  const rows = matrixRows(node)
  if (!rows) throw unreadable
  let answer: string[][]
  try {
    answer = rows.map((r) => r.map((e) => emit(e, 'radians').s))
  } catch (e) {
    refuse(e, label)
  }
  const gap = Number(tryGet(p, 'tolerance'))
  const precision = Number(tryGet(p, 'precision'))
  const precisionType = asString(tryGet(p, 'precisionType'))
  let tolerance: Tolerance
  if (gap > 0) tolerance = { kind: 'absolute', value: gap }
  else if (precisionType === 'dp' && Number.isFinite(precision)) tolerance = { kind: 'absolute', value: 0.5 * 10 ** -precision }
  else if (precisionType === 'sigfig' && Number.isFinite(precision)) tolerance = { kind: 'relative', value: 0.5 * 10 ** (1 - precision) }
  else tolerance = { ...DEFAULT_BAND }
  if (tryGet(p, 'allowResize') === true) read.notes.push(`${label} lets the student choose the size of the matrix in Numbas; PhysLab shows a box for each entry`)
  const part: PQPart = { type: 'matrix', prompt: promptLines.join('\n'), answer, tolerance, marks }
  if (tryGet(p, 'allowFractions') === true) part.allowFractions = true
  if (tryGet(p, 'markPerCell') === true) part.markPerCell = true
  read.parts.push(part)
}

/**
 * The parts of a question, or the gaps of a gap-fill, in order. `prefix` is how Numbas names
 * them (`p` for parts, `p0g` for the gaps of the first), so that adaptive marking, which names
 * the part whose answer it uses, can be matched to the PhysLab part it became. A gap-fill's own
 * adaptive marking is Numbas's way of setting it for its gaps, so it is handed down to them.
 */
function readParts(rawParts: unknown, ctx: TextContext, read: QuestionRead, where: string, prefix = 'p', parent?: Obj): void {
  if (!Array.isArray(rawParts)) return
  rawParts.forEach((p, i) => {
    if (!isObj(p)) return
    const label = `${where}part ${num(i + 1)}`
    const path = `${prefix}${i}`
    const type = asString(tryGet(p, 'type'))
    const at = read.parts.length
    readSteps(tryGet(p, 'steps'), ctx, read.steps)
    if (type === 'information') {
      read.statementLines.push(...htmlToLines(asString(tryGet(p, 'prompt')), ctx))
      return
    }
    if (type === 'gapfill') {
      const gaps = tryGet(p, 'gaps')
      const lead = htmlToLines(asString(tryGet(p, 'prompt')).replace(/\[\[\d+\]\]/g, '___'), ctx)
      if (!Array.isArray(gaps) || gaps.length === 0) {
        read.statementLines.push(...lead)
        return
      }
      readParts(gaps, ctx, read, `${label}, `, `${path}g`, replaces(p) ? p : parent)
      const first = read.parts[at]
      if (first && lead.length > 0) first.prompt = [...lead, first.prompt].filter((l) => l !== '').join('\n')
      // A gap-fill of one gap answers with that gap's number, so a later part may name either.
      if (read.parts.length === at + 1) read.paths.set(path, at)
      return
    }
    readOnePart(p, type, label, ctx, read)
    if (read.parts.length !== at + 1) return
    read.paths.set(path, at)
    if (replaces(p)) read.carried.push({ index: at, label, source: p, inherited: false })
    else if (parent) read.carried.push({ index: at, label, source: parent, inherited: true })
  })
}

/** One part that is not a gap-fill or information: it becomes exactly one PhysLab part, or the question is skipped. */
function readOnePart(p: Obj, type: string, label: string, ctx: TextContext, read: QuestionRead): void {
  const promptLines = htmlToLines(asString(tryGet(p, 'prompt')), ctx)
  let marks = Number(tryGet(p, 'marks'))
  if (type === '1_n_2' || type === 'm_n_2') {
    readChoicePart(p, label, promptLines, ctx, read, marks)
    return
  }
  if (type !== 'numberentry' && type !== 'jme' && type !== 'matrix') throw new Skip(`uses a ${type || 'nameless'} part PhysLab does not read`)
  if (!(marks > 0)) {
    read.notes.push(`${label} was worth 0 marks in Numbas; PhysLab counts it as 1`)
    marks = 1
  }
  if (type === 'matrix') {
    readMatrixPart(p, label, promptLines, ctx, read, marks)
    return
  }
  if (type === 'numberentry') {
    let unit: UnitId
    const last = promptLines[promptLines.length - 1]
    const written = last === undefined ? null : UNIT_LINE.exec(last)
    if (written && (UNIT_IDS as readonly string[]).includes(written[1])) {
      unit = written[1] as UnitId
      promptLines.pop()
    } else unit = unitInPrompt(promptLines.join(' '))
    const precision = Number(tryGet(p, 'precision'))
    let got: NumberAnswer
    try {
      got = readNumberAnswer(
        asString(tryGet(p, 'minValue')),
        asString(tryGet(p, 'maxValue')),
        asString(tryGet(p, 'precisionType')),
        Number.isFinite(precision) ? precision : null
      )
    } catch (e) {
      refuse(e, label)
    }
    if (got.note) read.notes.push(`${label}: ${got.note}`)
    read.parts.push({ type: 'number', prompt: promptLines.join('\n'), answer: got.answer, unit, tolerance: got.tolerance, marks })
    return
  }
  // jme. Read and set aside: which notation the student may type in and which functions are
  // on offer are Numbas's business; PhysLab's field reads what the calculator reads.
  void tryGet(p, 'notation')
  void tryGet(p, 'enabledFunctions')
  void tryGet(p, 'disabledFunctions')
  void tryGet(p, 'functionSets')
  let answer: string
  try {
    answer = jmeToMath(asString(tryGet(p, 'answer')), 'same')
  } catch (e) {
    refuse(e, label)
  }
  const checking = asString(tryGet(p, 'checkingType'))
  if (checking === 'dp' || checking === 'sigfig') {
    read.notes.push(
      `${label} is checked to a number of ${checking === 'dp' ? 'decimal places' : 'significant figures'} in Numbas; PhysLab checks it as an expression`
    )
  }
  const range = tryGet(p, 'vsetRange')
  const part: PQPart = { type: 'expression', prompt: promptLines.join('\n'), answer, symbols: freeSymbols(answer, ctx.names), marks }
  if (Array.isArray(range) && range.length === 2 && range.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    part.sampleRange = [range[0], range[1]]
  }
  read.parts.push(part)
}

/** Numbas's name for a part in words, the way the report names parts: `p1g0` → "part 2, part 1". */
function pathWords(path: string): string {
  const m = /^p(\d+)(?:g(\d+))?$/.exec(path)
  if (!m) return 'a step inside another part'
  return m[2] === undefined ? `part ${num(Number(m[1]) + 1)}` : `part ${num(Number(m[1]) + 1)}, part ${num(Number(m[2]) + 1)}`
}

/**
 * Numbas's adaptive marking → PhysLab's error carried forward, once every part is read. Each
 * replacement names a variable and the part whose answer stands in for it; that part must have
 * come in as an earlier number part, or the question is skipped — marking the later part without
 * the student's own numbers would take marks Numbas gives. A gap-fill's replacements are handed to
 * its gaps, and a gap is never marked with its own answer or a later gap's, so those are passed by.
 */
function readCarried(read: QuestionRead, ctx: TextContext): void {
  for (const c of read.carried) {
    const part = read.parts[c.index]
    const reps = tryGet(c.source, 'variableReplacements') as unknown[]
    const uses: { part: number; variable: string }[] = []
    for (const r of reps) {
      if (!isObj(r)) continue
      const variable = asString(r.variable)
      const path = asString(r.part)
      if (ctx.matrices.has(variable)) throw new Skip(`marks ${c.label} with an earlier answer put in place of the matrix ${variable}, which PhysLab can only take as an answer`)
      if (!ctx.names.has(variable)) throw new Skip(`marks ${c.label} with an earlier answer put in place of ${variable || 'a nameless variable'}, but there is no variable called that`)
      const k = read.paths.get(path)
      if (k === undefined) throw new Skip(`marks ${c.label} with the answer to ${pathWords(path)}, which PhysLab does not ask as one number`)
      if (k >= c.index) {
        if (c.inherited) continue
        throw new Skip(`marks ${c.label} with the answer to ${pathWords(path)}, which does not come before it`)
      }
      if (read.parts[k].type !== 'number') throw new Skip(`marks ${c.label} with the answer to ${pathWords(path)}, which is not a number`)
      if (r.must_go_first === true) read.notes.push(`${c.label} waits in Numbas until ${pathWords(path)} is answered; PhysLab marks it with whatever that part holds`)
      if (!uses.some((u) => u.part === k && u.variable === variable)) uses.push({ part: k, variable })
    }
    if (uses.length === 0) continue
    const strategy = asString(tryGet(c.source, 'variableReplacementStrategy')) === 'alwaysreplace' ? 'alwaysreplace' : 'originalfirst'
    const asked = Number(tryGet(c.source, 'adaptiveMarkingPenalty'))
    let penalty = Number.isFinite(asked) && asked > 0 ? asked : 0
    if (penalty > part.marks) {
      read.notes.push(`${c.label} takes ${num(penalty)} marks off an answer marked with an earlier one, more than it is worth; PhysLab takes ${num(part.marks)}`)
      penalty = part.marks
    }
    part.ecf = { uses, strategy, penalty }
  }
}

function contributors(raw: Obj, exam: Obj): string[] {
  const list = Array.isArray(raw.contributors) && raw.contributors.length > 0 ? raw.contributors : exam.contributors
  if (!Array.isArray(list)) return []
  return list.map((c) => (isObj(c) ? asString(c.name).trim() : '')).filter((n) => n !== '')
}

/** The licence string of a question, or of the exam when the question says nothing. */
function licenceText(raw: Obj, exam: Obj): string | null {
  const own = isObj(raw.metadata) ? asString(raw.metadata.licence).trim() : ''
  if (own !== '') return own
  const whole = isObj(exam.metadata) ? asString(exam.metadata.licence).trim() : ''
  return whole === '' ? null : whole
}

/** Thrown for a licence refusal; the sentence is license.ts's own, so the wording stays in one place. */
class Refused extends Error {}

function readLicense(raw: Obj, exam: Obj, title: string): License {
  const found = licenceText(raw, exam)
  const id = licenseFromNumbas(found)
  if (id === null) throw new Refused(refusalSentence(title, found))
  const holder = contributors(raw, exam).join(', ')
  if (holder === '') throw new Refused(`Question '${title}' names no author to credit, which PhysLab may not bundle.`)
  return { id, holder, found: found! }
}

/** Numbas draws variants until `variablesTest.condition` holds, at most `maxRuns` times (100 by default). */
const NUMBAS_MAX_RUNS = 100

/**
 * Numbas's `variablesTest` → PhysLab's `condition`: the same JME condition in the calculator's
 * words (in degrees, like every formula of the variables), the same number of tries. An empty
 * condition is Numbas's "keep every variant", so there is nothing to carry.
 */
function readCondition(test: unknown): PQQuestion['condition'] | undefined {
  if (!isObj(test)) return undefined
  const src = asString(test.condition).trim()
  if (src === '') return undefined
  let when: string
  try {
    when = jmeToMath(src, 'radians')
  } catch (e) {
    if (e instanceof JmeRefusal) throw new Skip(`keeps only the variants that meet a condition using ${e.what}, which PhysLab does not know`)
    throw e
  }
  const runs = Number(test.maxRuns)
  return { when, maxRuns: Number.isInteger(runs) && runs >= 1 ? runs : NUMBAS_MAX_RUNS }
}

/**
 * A matrix variable is only ever an answer here: any other formula that names it (`2*m`, a
 * condition on it) would be worked out by a calculator that has no such variable, so the question
 * is skipped rather than drawn with numbers that are not there.
 */
function noMatrixArithmetic(ctx: TextContext, parts: PQPart[], condition: PQQuestion['condition'] | undefined): void {
  if (ctx.matrices.size === 0) return
  const formulas = [
    ...ctx.vars.flatMap((v) => (v.def.kind === 'expr' ? [v.def.expr] : [])),
    ...parts.flatMap((p) => (p.type === 'number' || p.type === 'expression' ? [p.answer] : p.type === 'matrix' ? p.answer.flat() : [])),
    ...(condition ? [condition.when] : [])
  ]
  for (const f of formulas) {
    const used = symbolsOf(math.parse(f)).find((s) => ctx.matrices.has(s))
    if (used) throw new Skip(`works with the matrix ${used} in a formula, which PhysLab can only take as an answer`)
  }
}

/** `title` is the name the report calls the question by, which for a nameless one is its number. */
function readQuestion(raw: Obj, exam: Obj, title: string): { question: PQQuestion; notes: string[] } {
  // The licence comes first: a question PhysLab may not bundle is refused whatever else it holds.
  const license = readLicense(raw, exam, title)
  for (const key of ['rulesets', 'functions', 'extensions'] as const) {
    if (nonEmpty(raw[key])) throw new Skip('uses Numbas scripting')
  }
  const preamble = raw.preamble
  if (isObj(preamble) && (nonEmpty(preamble.js) || nonEmpty(preamble.css))) throw new Skip('uses Numbas scripting')

  const ordered = Array.isArray(raw.ungrouped_variables) ? raw.ungrouped_variables.map(asString) : []
  if (Array.isArray(raw.variable_groups)) {
    for (const g of raw.variable_groups) if (isObj(g) && Array.isArray(g.variables)) ordered.push(...g.variables.map(asString))
  }
  const matrices = new Map<string, JmeNode>()
  const vars = readVariables(raw.variables, ordered, matrices)
  const ctx: TextContext = { vars, names: new Set(vars.map((v) => v.name)), made: 0, matrices }

  const read: QuestionRead = { parts: [], steps: [], statementLines: htmlToLines(asString(raw.statement), ctx), notes: [], paths: new Map(), carried: [] }
  readParts(raw.parts, ctx, read, '')
  if (read.parts.length === 0) throw new Skip('has no part PhysLab can ask')
  readCarried(read, ctx)
  const condition = readCondition(raw.variablesTest)
  // The advice is read first: a chip in it (`{2*m}`) makes a shown variable the matrix check must see too.
  const steps = [...linesToSteps(htmlToLines(asString(raw.advice), ctx)), ...read.steps]
  noMatrixArithmetic(ctx, read.parts, condition)

  const question: PQQuestion = {
    id: stableId(raw),
    title: asString(raw.name),
    statement: read.statementLines.join('\n'),
    variables: ctx.vars,
    parts: read.parts,
    license,
    imported: { format: 'numbas', contributors: contributors(raw, exam) }
  }
  if (steps.length > 0) question.steps = { level: 'worked', items: steps }
  if (condition) question.condition = condition
  if (Array.isArray(raw.tags) && raw.tags.length > 0) question.tags = raw.tags.map(asString).filter((t) => t !== '')
  return { question, notes: read.notes }
}

/** Every question in the exam, from `question_groups` and from a flat `questions` list, in file order. */
function examQuestions(exam: Obj): unknown[] {
  const out: unknown[] = []
  if (Array.isArray(exam.question_groups)) {
    for (const g of exam.question_groups) if (isObj(g) && Array.isArray(g.questions)) out.push(...g.questions)
  }
  if (Array.isArray(exam.questions)) out.push(...exam.questions)
  return out
}

const NOT_AN_EXAM = 'This is not a Numbas exam file.'

/**
 * A `.exam` text → a PhysLab question file plus a report: one sentence per skipped question,
 * one per assumption made. The first line `// Numbas version: …` is dropped; the rest is JSON.
 * A question that fails the licence gate, uses a part or a function PhysLab does not read, or
 * shows something PhysLab has nowhere to show is skipped — never half-imported.
 */
export function fromExam(text: string): ExamImport {
  const body = text.replace(/^\uFEFF/, '').replace(/^\s*\/\/[^\n]*\n?/, '')
  let exam: unknown
  try {
    exam = JSON.parse(body)
  } catch {
    throw new Error(NOT_AN_EXAM)
  }
  if (!isObj(exam)) throw new Error(NOT_AN_EXAM)

  const questions: PQQuestion[] = []
  const report: string[] = []
  // The id is a hash of the question's text, so the same question twice in one exam (in two
  // groups, say) would collide; the second copy gets -2, the third -3, and the same file still
  // gives the same ids every time.
  const ids = new Set<string>()
  examQuestions(exam).forEach((raw, i) => {
    if (!isObj(raw)) {
      report.push(`Question ${num(i + 1)} was skipped: it is not a question PhysLab can read.`)
      return
    }
    const title = asString(raw.name) || `Question ${num(i + 1)}`
    try {
      const { question, notes } = readQuestion(raw, exam, title)
      for (const n of notes) report.push(`Question '${title}', ${n}.`)
      const base = question.id
      for (let k = 2; ids.has(question.id); k++) question.id = `${base}-${k}`
      ids.add(question.id)
      questions.push(question)
    } catch (e) {
      if (e instanceof Skip) report.push(`Question '${title}' was skipped: it ${e.reason}.`)
      else if (e instanceof Refused) report.push(e.message)
      else throw e
    }
  })
  // Format 2 only when an import needs it (a matrix, error carried forward, a condition), so a plain
  // import still opens in 0.7.0.
  return { file: { app: 'PhysLab', format: 'pqjson', version: formatVersionOf({ questions }), questions }, report }
}

// ===========================================================================
// Writing an .exam
// ===========================================================================

/** The `metadata.licence` string Numbas writes for each pool licence, used when `found` is not kept. */
const CANONICAL_LICENCE: Record<LicenseId, string> = {
  'CC BY 4.0': 'Creative Commons Attribution 4.0 International',
  'CC BY-SA 4.0': 'Creative Commons Attribution-ShareAlike 4.0 International',
  'CC0 1.0': 'Creative Commons CC0 1.0 Universal'
}

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
 * mathjs → JME, undoing what `jmeToMath` did: round → precround, the calculator's log(a, b) →
 * JME's log(x, b), `sin(x * 180 / pi)` → sin(x), `asin(x) * pi / 180` → arcsin(x), a ? b : c →
 * if. A bare `sin(e)` is a PhysLab author's own, in degrees, and JME's sin takes radians, so it
 * is written `sin(radians(e))` and a bare `asin(e)` as `degrees(arcsin(e))` — except for an
 * expression part (`trig === 'same'`), where the student types in the convention the answer is
 * checked in and the names stay. Everything else mathjs prints is JME already (`+ - * / ^`,
 * `and or not`, the function names).
 */
export function mathToJme(expr: string, trig: TrigMode = 'radians'): string {
  const options = {
    handler: (node: Node, o: unknown): string | undefined => {
      const s = (n: Node): string => n.toString(o as Record<string, unknown>)
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
          const rad = radianArgument(args[0]) ?? unitTagged(args[0], 'rad')
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
        // asin(x) * pi / 180 → arcsin(x); x * pi / 180 → radians(x); x * 180 / pi → degrees(x).
        if (op.op === '/' && op.args.length === 2 && isOp(op.args[0], '*') && op.args[0].args.length === 2) {
          const [left, right] = op.args[0].args
          if (isSymbol(right, 'pi') && isConst(op.args[1], 180)) {
            if (isFn(left, Object.keys(ARC)) && left.args.length === 1) return `${ARC[left.fn.name]}(${s(left.args[0])})`
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
    }
  }
  return math.parse(preprocess(expr)).toString(options)
}

// --- text ----------------------------------------------------------------------

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * LaTeX for Numbas: a chip becomes `\var{v}`, a protected group `{ v}` its plain self, and a
 * command's argument (`\mathrm{avg}`) stays LaTeX — written as `\mathrm\var{avg}` it named a
 * variable that does not exist and the question could not come back in.
 */
const latexOut = (tex: string): string =>
  escapeHtml(
    tex
      .replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (m, name: string, at: number) => (isCommandArgument(tex, at) ? m : `\\var{${name}}`))
      .replace(/\{ ([A-Za-z][A-Za-z0-9_]*)\}/g, '{$1}')
  )

/** A line of PhysLab text as one HTML paragraph; chips stay `{v}`, which is Numbas's own syntax. */
function lineToHtml(line: string): string {
  if (line.startsWith('$$') && line.endsWith('$$')) return `<p>\\[${latexOut(line.slice(2, -2))}\\]</p>`
  const html = line
    .split(/(\\\([\s\S]*?\\\))/)
    .map((piece, k) => (k % 2 === 1 ? `\\(${latexOut(piece.slice(2, -2))}\\)` : escapeHtml(piece)))
    .join('')
  return `<p>${html}</p>`
}

const textToHtml = (text: string): string =>
  text
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map(lineToHtml)
    .join('')

// --- variables and parts -----------------------------------------------------

/** A number as JME reads it: the plain JavaScript form, with no proper minus and no ×10^. */
const jmeNumber = (v: number): string => String(v)

function variableToJme(v: PQVariable): string {
  const d = v.def
  if (d.kind === 'range') {
    const range = d.step === 1 ? `${jmeNumber(d.from)}..${jmeNumber(d.to)}` : `${jmeNumber(d.from)}..${jmeNumber(d.to)}#${jmeNumber(d.step)}`
    const except = d.exclude && d.exclude.length > 0 ? ` except [${d.exclude.map(jmeNumber).join(', ')}]` : ''
    return `random(${range}${except})`
  }
  // The list form: random(30) with one value would read as a choice from nothing, not from 30.
  if (d.kind === 'list') return `random([${d.items.map(jmeNumber).join(', ')}])`
  return mathToJme(d.expr)
}

/** The keys every Numbas part carries, at the values a fresh part in the editor has. */
const PART_DEFAULTS = {
  useCustomName: false,
  customName: '',
  showCorrectAnswer: true,
  showFeedbackIcon: true,
  scripts: {},
  variableReplacements: [],
  variableReplacementStrategy: 'originalfirst',
  adaptiveMarkingPenalty: 0,
  customMarkingAlgorithm: '',
  extendBaseMarkingAlgorithm: true,
  steps: []
}

/** A percentage in a sentence: 2, 0.5. */
const pct = (fraction: number): string => num(fraction * 100)

/** "y(0) = 0 and y'(0) = 1": a function part's starting conditions, as the author wrote them. */
function startsText(p: Extract<PQPart, { type: 'function' }>): string {
  return p.initial.map((c) => `${p.y}${c.order === 1 ? "'" : ''}(${c.at}) = ${c.value}`).join(' and ')
}

/** What a PQ part holds that Numbas cannot: written into the question's description instead. */
function partNotes(p: PQPart, index: number): string[] {
  const label = `part ${num(index + 1)}`
  const out: string[] = []
  switch (p.type) {
    case 'number':
      if (p.tolerance.kind === 'stated') {
        out.push(`PhysLab marks ${label} against the student's own stated uncertainty (the Eₙ test); Numbas checks it within ${pct(DEFAULT_BAND.value)} %.`)
      }
      if (p.kind === 'direction') out.push(`PhysLab checks ${label} as a direction, round the circle.`)
      if (p.kind === 'angle') out.push(`PhysLab checks ${label} as an angle.`)
      for (const t of p.traps ?? []) out.push(`PhysLab knows a wrong answer for ${label}: ${t.value} — ${t.why}`)
      break
    case 'choice':
      if (p.distractors) out.push(`PhysLab makes the choices for ${label} from the right answer ${p.distractors.correct} with the rules ${p.distractors.rules.join(', ')}.`)
      break
    case 'vector':
      out.push(`PhysLab's ${label} is a vector; Numbas asks for its components one box each.`)
      break
    case 'matrix':
      if (p.tolerance.kind === 'relative') out.push(`PhysLab accepts each entry of ${label} within ${pct(p.tolerance.value)} % of its own value; Numbas checks each entry exactly.`)
      break
    case 'roots':
      if (p.answer.length === 0) out.push(`PhysLab's ${label} has no real roots as its answer, which a Numbas number box cannot take, so it is left out.`)
      else out.push(`PhysLab's ${label} is a set of roots; Numbas asks for them one box each${p.answer.length > 3 ? ', in the order PhysLab lists them' : ', in any order'}.`)
      break
    case 'function':
      out.push(`Numbas checks ${label} against the model answer ${p.y} = ${p.model} alone; PhysLab accepts any ${p.y} that solves ${p.ode}${p.initial.length > 0 ? ` with ${startsText(p)}` : ''}.`)
      break
    case 'proof':
      out.push(`PhysLab's ${label} is a proof, shown with a model proof and a self-check list and never marked; both are in the advice.`)
      break
    case 'lego':
      out.push(`PhysLab's ${label} fills a shape with Lego pieces, which Numbas cannot ask, so it is left out.`)
      break
  }
  if (p.showIf !== undefined) out.push(`PhysLab shows ${label} only when ${p.showIf}; Numbas always shows it.`)
  return out
}

/** The unit line a number box's prompt closes with, which the importer reads back as the part's unit. */
const unitLine = (unit: UnitId): string => (unit === 'none' ? '' : `<p>Give your answer in ${escapeHtml(unit)}.</p>`)

/**
 * A Numbas number box for an answer already in JME: the band written into `minValue`/`maxValue`
 * round the answer, so Numbas
 * checks each variant it shows. `spread`, when given, is a JME half-width that replaces the band
 * (a vector's components share one, a fraction of the vector's size).
 */
function numberEntry(answerJme: string, band: BandTolerance, marks: number, prompt: string, spread?: string): Obj {
  const a = `(${answerJme})`
  const t = jmeNumber(band.value)
  const [minValue, maxValue] =
    spread !== undefined ? [`${a} - ${spread}`, `${a} + ${spread}`] : band.kind === 'relative' ? [`${a} * (1 - ${t})`, `${a} * (1 + ${t})`] : [`${a} - ${t}`, `${a} + ${t}`]
  return {
    type: 'numberentry',
    ...PART_DEFAULTS,
    marks,
    prompt,
    minValue,
    maxValue,
    correctAnswerFraction: false,
    allowFractions: false,
    mustBeReduced: false,
    precisionType: 'none',
    showPrecisionHint: false
  }
}

/** A gap-fill of number boxes: the prompt, then a line holding the boxes. */
function gapfill(p: { prompt: string; marks: number; unit: UnitId }, boxes: string, gaps: Obj[], sortAnswers: boolean): Obj {
  return { type: 'gapfill', ...PART_DEFAULTS, marks: 0, prompt: textToHtml(p.prompt) + `<p>${boxes}</p>` + unitLine(p.unit), gaps, sortAnswers }
}

/**
 * The roots in ascending order as JME, for a gap-fill that sorts the student's answers before
 * marking them: two roots are min and max, three add the middle one; more than three stay in the
 * author's order (and the gap-fill does not sort).
 */
function ascending(roots: string[]): string[] | null {
  const r = roots.map((x) => `(${mathToJme(x)})`)
  if (r.length === 1) return r
  const lo = `min(${r.join(', ')})`
  const hi = `max(${r.join(', ')})`
  if (r.length === 2) return [lo, hi]
  if (r.length === 3) return [lo, `${r.join(' + ')} - ${lo} - ${hi}`, hi]
  return null
}

function partToNumbas(p: PQPart): Obj | null {
  const base = { ...PART_DEFAULTS, marks: p.marks }
  switch (p.type) {
    case 'number':
      // A stated (Eₙ) answer has no band of its own; Numbas gets the app's one tolerance (bandOf).
      return numberEntry(mathToJme(p.answer), bandOf(p.tolerance), p.marks, textToHtml(p.prompt) + unitLine(p.unit))
    case 'expression':
      return {
        type: 'jme',
        ...base,
        prompt: textToHtml(p.prompt),
        answer: mathToJme(p.answer, 'same'),
        answerSimplification: 'all',
        showPreview: true,
        checkingType: 'absdiff',
        checkingAccuracy: 0.001,
        failureRate: 1,
        vsetRangePoints: 5,
        vsetRange: p.sampleRange ?? [1, 2],
        checkVariableNames: false,
        singleLetterVariables: false,
        allowUnknownFunctions: true,
        implicitFunctionComposition: false,
        caseSensitive: false,
        valueGenerators: []
      }
    case 'choice': {
      // A choice part whose choices are made by rules has nothing Numbas can list.
      if (p.choices.length === 0) return null
      const correct = p.choices.filter((c) => c.correct).length
      const single = correct === 1
      return {
        type: single ? '1_n_2' : 'm_n_2',
        ...base,
        prompt: textToHtml(p.prompt),
        minMarks: 0,
        maxMarks: p.marks,
        shuffleChoices: p.shuffle,
        displayType: single ? 'radiogroup' : 'checkbox',
        displayColumns: 0,
        warningType: 'none',
        showCellAnswerState: true,
        markingMethod: 'sum ticked cells',
        choices: p.choices.map((c) => lineToHtml(c.text)),
        matrix: p.choices.map((c) => [c.correct ? (single ? p.marks : 1) : 0]),
        distractors: p.choices.map((c) => (c.why ? lineToHtml(c.why) : ''))
      }
    }
    case 'vector': {
      // One box per component. PhysLab's band is a distance from the answer; a component can be
      // off by at most that much, so each box gets the same half-width: the band itself, or its
      // fraction of the vector's size.
      const band = bandOf(p.tolerance)
      const size = `sqrt(${p.answer.map((c) => `(${mathToJme(c)}) ^ 2`).join(' + ')})`
      const spread = band.kind === 'relative' ? `${jmeNumber(band.value)} * ${size}` : jmeNumber(band.value)
      const gaps = p.answer.map((c) => numberEntry(mathToJme(c), band, p.marks / p.answer.length, '', spread))
      return gapfill(p, p.answer.map((_c, k) => `[[${k}]] ${['i', 'j', 'k'][k]}`).join(' + '), gaps, false)
    }
    case 'roots': {
      if (p.answer.length === 0) return null
      const band = bandOf(p.tolerance)
      const sorted = ascending(p.answer)
      const answers = sorted ?? p.answer.map((x) => mathToJme(x))
      const gaps = answers.map((a) => numberEntry(a, band, p.marks / answers.length, ''))
      return gapfill(p, answers.map((_a, k) => `[[${k}]]`).join(', '), gaps, sorted !== null)
    }
    case 'matrix': {
      const cols = p.answer[0].length
      return {
        type: 'matrix',
        ...base,
        prompt: textToHtml(p.prompt),
        correctAnswer: `matrix(${p.answer.map((row) => `[${row.map((e) => mathToJme(e)).join(', ')}]`).join(', ')})`,
        correctAnswerFractions: false,
        numRows: p.answer.length,
        numColumns: cols,
        allowResize: false,
        minColumns: 0,
        maxColumns: 0,
        minRows: 0,
        maxRows: 0,
        prefilledCells: '',
        // Numbas's tolerance is a fixed gap on every entry; a relative band has no such gap, so
        // Numbas checks exactly (the description says so) and reads back as the app's 2 %.
        tolerance: p.tolerance.kind === 'absolute' ? p.tolerance.value : 0,
        markPerCell: p.markPerCell === true,
        allowFractions: p.allowFractions === true,
        precisionType: 'none',
        precision: 0,
        precisionPartialCredit: 0,
        precisionMessage: '',
        strictPrecision: false
      }
    }
    case 'function':
      // Numbas compares the student's formula with the model at points in the range; PhysLab's
      // own check (does it solve the equation and start right) is said in the description.
      return {
        type: 'jme',
        ...base,
        prompt: textToHtml(p.prompt),
        answer: mathToJme(p.model, 'same'),
        answerSimplification: 'all',
        showPreview: true,
        checkingType: 'absdiff',
        checkingAccuracy: 0.001,
        failureRate: 1,
        vsetRangePoints: 5,
        vsetRange: p.sampleRange ?? [0.1, 1],
        checkVariableNames: false,
        singleLetterVariables: false,
        allowUnknownFunctions: true,
        implicitFunctionComposition: false,
        caseSensitive: false,
        valueGenerators: []
      }
    case 'proof':
      return { type: 'information', ...base, marks: 0, prompt: textToHtml(p.prompt) }
    case 'lego':
      return null
  }
}

/** A proof part's model and self-check list, for the advice Numbas shows once the question is done. */
function proofAdvice(q: PQQuestion): string {
  return q.parts
    .map((p, i) => {
      if (p.type !== 'proof') return ''
      const checks = p.selfCheck.length > 0 ? `<ul>${p.selfCheck.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>` : ''
      return `<p>A model proof for part ${num(i + 1)}:</p>${textToHtml(p.model)}${checks}`
    })
    .join('')
}

/**
 * PhysLab's error carried forward → Numbas's adaptive marking on the part (or on the gap-fill
 * holding a vector's or roots' boxes, which is where Numbas sets it for gaps). A use of a part this
 * file leaves out cannot be written, and the description says the part is marked without it.
 * Nor can a use of a part that is not one number: Numbas would put a vector's list where the
 * part's number goes, and `readCarried` refuses it, so the round trip dropped the whole
 * question without a word.
 */
function writeCarried(q: PQQuestion, written: { index: number; part: Obj }[]): string[] {
  const paths = new Map(written.map((w, j) => [w.index, `p${j}`]))
  const notes: string[] = []
  for (const { index, part } of written) {
    const ecf = q.parts[index].ecf
    if (!ecf) continue
    const kept = ecf.uses.filter((u) => paths.has(u.part) && q.parts[u.part].type === 'number')
    for (const u of ecf.uses) {
      const said = `PhysLab marks part ${num(index + 1)} with the answer to part ${num(u.part + 1)}`
      if (!paths.has(u.part)) notes.push(`${said}, which this Numbas file leaves out, so Numbas marks it without.`)
      else if (q.parts[u.part].type !== 'number') notes.push(`${said}, which is not a single number Numbas can carry forward, so Numbas marks it without.`)
    }
    if (kept.length === 0) continue
    part.variableReplacements = kept.map((u) => ({ variable: u.variable, part: paths.get(u.part), must_go_first: false }))
    part.variableReplacementStrategy = ecf.strategy
    part.adaptiveMarkingPenalty = ecf.penalty
  }
  return notes
}

/** The picture, motion and sandbox bindings, as sentences, so nothing Numbas cannot read is invented. */
function bindingNotes(q: PQQuestion): string[] {
  const out: string[] = []
  const pic = q.picture
  if (pic?.kind === 'curve') out.push(`PhysLab draws the curve y = ${pic.expr}${pic.xMin !== undefined && pic.xMax !== undefined ? ` from ${pic.xMin} to ${pic.xMax}` : ''}.`)
  if (pic?.kind === 'piecewise') out.push(`PhysLab draws a graph in pieces: ${pic.pieces.map((s) => `${s.expr} from ${s.from} to ${s.to}`).join('; ')}.`)
  if (pic?.kind === 'between') out.push(`PhysLab shades between ${pic.upper} and ${pic.lower} from ${pic.from} to ${pic.to}.`)
  if (pic?.kind === 'tangent') out.push(`PhysLab draws the tangent to ${pic.expr} at ${pic.at}.`)
  if (q.motion) {
    const legs = q.motion.segments.map((s) =>
      s.kind === 'rest' ? `rest for ${s.duration}` : s.kind === 'uniform' ? `move at ${s.v} for ${s.duration}` : `accelerate at ${s.a} for ${s.duration}`
    )
    out.push(`PhysLab animates a motion (${legs.join(', ')}) and plots ${q.motion.plots.join(', ')}.`)
  }
  if (q.sandbox) {
    out.push(`PhysLab runs the '${q.sandbox.preset}' experiment${q.sandbox.actuators.length > 0 ? ` with forces on ${q.sandbox.actuators.map((a) => a.body).join(', ')}` : ''}.`)
  }
  return out
}

function stepsToAdvice(steps: PQSteps | undefined): string {
  if (!steps) return ''
  return steps.items
    .map((s) => {
      const head = s.auto && s.head.trim() === '' ? 'PhysLab works this step out.' : s.head
      return lineToHtml(head) + (s.tex !== undefined ? `<p>\\[${latexOut(s.tex)}\\]</p>` : '')
    })
    .join('')
}

function questionToNumbas(q: PQQuestion): Obj {
  const written: { index: number; part: Obj }[] = []
  const notes = [...bindingNotes(q)]
  q.parts.forEach((p, i) => {
    const part = partToNumbas(p)
    if (part) written.push({ index: i, part })
    notes.push(...partNotes(p, i))
  })
  notes.push(...writeCarried(q, written))
  const parts = written.map((w) => w.part)
  const variables: Obj = {}
  for (const v of q.variables) {
    variables[v.name] = {
      name: v.name,
      group: 'Ungrouped variables',
      definition: variableToJme(v),
      description: v.description ?? '',
      templateType: 'anything',
      can_override: false
    }
  }
  // A CC0 question may name nobody; Numbas must not then be handed a contributor called ''.
  const people = (q.imported?.contributors && q.imported.contributors.length > 0 ? q.imported.contributors : [q.license.holder]).filter((n) => n.trim() !== '')
  return {
    name: q.title,
    statement: textToHtml(q.statement),
    advice: stepsToAdvice(q.steps) + proofAdvice(q),
    rulesets: {},
    extensions: [],
    builtin_constants: { e: true, pi: true, i: true },
    constants: [],
    variables,
    // The variants' condition in Numbas's own words; Numbas keeps every variant when it is empty.
    variablesTest: q.condition ? { condition: mathToJme(q.condition.when), maxRuns: q.condition.maxRuns } : { condition: '', maxRuns: NUMBAS_MAX_RUNS },
    ungrouped_variables: q.variables.map((v) => v.name),
    variable_groups: [],
    functions: {},
    preamble: { js: '', css: '' },
    parts,
    partsMode: 'all',
    maxMarks: 0,
    objectives: [],
    penalties: [],
    objectiveVisibility: 'always',
    penaltyVisibility: 'always',
    tags: q.tags ?? [],
    metadata: { description: notes.join(' '), licence: q.license.found ?? CANONICAL_LICENCE[q.license.id] },
    contributors: people.map((name) => ({ name, profile_url: '' })),
    type: 'question'
  }
}

/**
 * A PhysLab set → the text of a Numbas `.exam`: the version line, then the exam JSON in the
 * schema-10.0 shape with camelCase keys. Number parts become `numberentry` with the tolerance
 * written into `minValue`/`maxValue` as JME on the answer, so Numbas checks each variant it
 * shows; expression parts become `jme`; choice parts `1_n_2`/`m_n_2`; variables go back to JME.
 * Format 2 goes out as the nearest thing Numbas has: a matrix as a matrix part, a vector or a set
 * of roots as a gap-fill of number boxes, a function as a formula checked against its model, a
 * proof as information; error carried forward as adaptive marking, the condition as variablesTest.
 * What Numbas has no place for — pictures, motion, experiments, known wrong answers — is
 * written into the question's description in words, never invented into a part.
 */
export function toExam(file: PQFile, name = 'PhysLab questions'): string {
  const licences = new Set(file.questions.map((q) => q.license.found ?? CANONICAL_LICENCE[q.license.id]))
  const exam = {
    name,
    metadata: { description: '', licence: licences.size === 1 ? [...licences][0] : '' },
    duration: 0,
    percentPass: 0,
    showQuestionGroupNames: false,
    shuffleQuestionGroups: false,
    showstudentname: true,
    question_groups: [
      {
        name: 'Group',
        pickingStrategy: 'all-ordered',
        pickQuestions: 1,
        questionNames: [],
        variable_overrides: [],
        questions: file.questions.map(questionToNumbas)
      }
    ],
    navigation: {
      allowregen: true,
      reverse: true,
      browse: true,
      allowsteps: true,
      showfrontpage: true,
      navigatemode: 'sequence',
      onleave: { action: 'none', message: '' },
      preventleave: true,
      typeendtoleave: false,
      startpassword: '',
      allowAttemptDownload: false,
      downloadEncryptionKey: ''
    },
    timing: { allowPause: true, timeout: { action: 'none', message: '' }, timedwarning: { action: 'none', message: '' } },
    feedback: {
      showactualmark: true,
      showtotalmark: true,
      showanswerstate: true,
      allowrevealanswer: true,
      advicethreshold: 0,
      intro: '',
      end_message: '',
      reviewshowscore: true,
      reviewshowfeedback: true,
      reviewshowexpectedanswer: true,
      reviewshowadvice: true,
      feedbackmessages: []
    },
    contributors: [],
    extensions: [],
    custom_part_types: [],
    resources: []
  }
  return `// Numbas version: finer_feedback_settings\n${JSON.stringify(exam)}`
}

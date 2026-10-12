// G2: the numeric fallback. Both answers are evaluated on the real line at 40 significant digits, each value carrying
// an estimate of its own rounding error, at adversarial points (0, ±1, ±10⁶, both sides of every zero of a denominator
// or of a root's or a logarithm's argument) and 12 seeded random points. Numbers can prove two answers DIFFERENT — a
// point where they disagree far beyond rounding, or where one is defined and the other is not — but never equal:
// agreement at finitely many points is evidence, not proof (docs/knowledge/engine-semantics.md §6). So this returns
// 'different' or 'unknown', and how many points agreed.

import { type BigNumber, type MathNode } from 'mathjs'
import { math } from '../expr'
import { polyFromExpr } from '../pure/poly'
import { type Rat } from '../pure/rat'
import { fnName, plainVars, readExact, readMaths } from './parse'
import { realZeros } from './realroots'
import { NotExact, safely, tick } from './verdict'

type DecimalCtor = {
  new (v: string | number | BigNumber): BigNumber
  clone(config: { precision: number }): DecimalCtor
}
const Big = (math.bignumber(0) as unknown as { constructor: DecimalCtor }).constructor.clone({ precision: 40 })
const big = (x: number | string): BigNumber => new Big(x)
const ZERO = big(0)
const ONE = big(1)
const PI = big(-1).acos()
const E = ONE.exp()
const LN10 = big(10).ln()
/** One unit in the 40th digit, with room: every operation adds this much relative error. */
const ULP = 1e-38
/** How far beyond the estimated rounding a value must be before a sign or a difference counts. */
const MARGIN = 1000
/** A point whose rounding estimate reaches this share of the values decides nothing. */
const ILL_CONDITIONED = 1e-10
/**
 * The largest |argument| of exp, sinh and cosh worked out, and of a power's exponent times ln|base|: e^2300 is about
 * 10^1000. Past it decimal.js's series runs for minutes (sinh(10⁶) took 106 s), and the point is skipped instead.
 */
const MAX_EXPONENT = 2300
/** Past this |argument| a sine or cosine at 40 digits is all rounding (and decimal.js may run out of π): skipped. */
const MAX_ANGLE = 1e15

/** Raised for a function the evaluator does not know: the checker then says 'unknown'. */
class Unsupported extends Error {}

/** A real value and an estimate of its absolute rounding error. */
interface Val {
  v: BigNumber
  err: number
}
/** Not a real number here. `marginal`: only because of rounding (an argument within its error of the boundary). */
interface Undef {
  undef: true
  marginal: boolean
}
type Res = Val | Undef

const isUndef = (r: Res): r is Undef => 'undef' in r
const mag = (x: BigNumber): number => Math.abs(x.toNumber())
const val = (v: BigNumber, err: number): Val => ({ v, err: err + ULP * mag(v) })
const sure: Undef = { undef: true, marginal: false }
const unsure: Undef = { undef: true, marginal: true }
/** Undefined because x is at or past a boundary b: certain only when x is past it by more than its error. */
const pastBoundary = (x: Val, distance: BigNumber): Undef => (mag(distance) > MARGIN * x.err ? sure : unsure)

function combine(args: Res[]): Undef | null {
  const bad = args.filter(isUndef)
  if (!bad.length) return null
  return bad.some((b) => !b.marginal) ? sure : unsure
}

type Point = Record<string, BigNumber>

/** f at a point on the real line, PhysLab's reading: ln natural, log base 10, real odd roots. */
function evalReal(node: MathNode, at: Point): Res {
  tick()
  const n = node as unknown as { type: string; op?: string; name?: string; value?: unknown; args?: MathNode[]; content?: MathNode }
  switch (n.type) {
    case 'ConstantNode':
      if (typeof n.value !== 'number') throw new Unsupported('constant')
      return { v: big(String(n.value)), err: 0 }
    case 'SymbolNode': {
      const name = String(n.name)
      if (name in at) return { v: at[name], err: 0 }
      if (name === 'pi') return val(PI, 0)
      if (name === 'e') return val(E, 0)
      // i is not on the real line, but e^(iπ) is −1: an answer with i is for Complex mode, which numbers here do not decide.
      if (name === 'i') throw new Unsupported('i')
      throw new Unsupported(`symbol ${name}`)
    }
    case 'ParenthesisNode':
      return evalReal(n.content as MathNode, at)
    case 'OperatorNode': {
      const args = n.args ?? []
      if (n.op === '^') return powerOf(args[0], args[1], at)
      const vs = args.map((a) => evalReal(a, at))
      const bad = combine(vs)
      if (bad) return bad
      const [x, y] = vs as Val[]
      switch (n.op) {
        case '+':
          return args.length === 1 ? x : (vs as Val[]).reduce((p, q) => add(p, q))
        case '-':
          return args.length === 1 ? { v: x.v.neg(), err: x.err } : add(x, { v: y.v.neg(), err: y.err })
        case '*':
          return (vs as Val[]).reduce((p, q) => mul(p, q))
        case '/':
          return div(x, y)
      }
      throw new Unsupported(`operator ${n.op}`)
    }
    case 'FunctionNode':
      return callFn(fnName(n as never), n.args ?? [], at)
  }
  throw new Unsupported(n.type)
}

const add = (x: Val, y: Val): Val => val(x.v.plus(y.v), x.err + y.err)
const mul = (x: Val, y: Val): Val => val(x.v.times(y.v), mag(x.v) * y.err + mag(y.v) * x.err + x.err * y.err)
function div(x: Val, y: Val): Res {
  if (y.v.isZero()) return y.err === 0 ? sure : unsure
  if (mag(y.v) <= MARGIN * y.err) return unsure
  const v = x.v.div(y.v)
  return val(v, (x.err + mag(v) * y.err) / mag(y.v))
}

function powerOf(baseNode: MathNode, expNode: MathNode, at: Point): Res {
  const b = evalReal(baseNode, at)
  const e = evalReal(expNode, at)
  const bad = combine([b, e])
  if (bad) return bad
  const x = b as Val
  const y = e as Val
  if (y.err === 0 && y.v.isInteger()) {
    const k = y.v.toNumber()
    if (x.v.isZero()) return k > 0 ? { v: ZERO, err: x.err ** k } : k === 0 ? val(ONE, 0) : x.err === 0 ? sure : unsure
    const v = x.v.pow(y.v)
    return val(v, Math.abs(k) * mag(v.div(x.v)) * x.err)
  }
  // A fractional power of a negative base is real only for an odd denominator: (−8)^(1/3) = −2.
  if (x.v.isNeg() && !x.v.isZero()) {
    const q = exactFraction(expNode)
    if (!q || q.d % 2n === 0n) return pastBoundary(x, x.v)
    if (tooBigPower(x, y)) return unsure
    const v = x.v.neg().pow(y.v)
    const signed = q.n % 2n === 0n ? v : v.neg()
    return val(signed, mag(signed) * Math.abs(y.v.toNumber()) * x.err / mag(x.v))
  }
  if (x.v.isZero()) return y.v.gt(0) ? { v: ZERO, err: x.err ** y.v.toNumber() } : x.err === 0 ? sure : unsure
  if (tooBigPower(x, y)) return unsure
  const v = x.v.pow(y.v)
  return val(v, mag(v) * (Math.abs(y.v.toNumber()) * x.err / mag(x.v) + Math.abs(x.v.ln().toNumber()) * y.err))
}

/** A fractional power decimal.js would work out as exp(y·ln|x|) with y·ln|x| past MAX_EXPONENT. */
const tooBigPower = (x: Val, y: Val): boolean => mag(y.v) * Math.abs(x.v.abs().ln().toNumber()) > MAX_EXPONENT

/** The exponent as an exact fraction, when it is written as one (1/3, 2/5, 0.5). */
function exactFraction(node: MathNode): { n: bigint; d: bigint } | null {
  try {
    const rf = readExact(node).rf
    if (rf.num.length > 1 || rf.den.length !== 1 || plainVars(rf.num).length || plainVars(rf.den).length) return null
    const num = rf.num.length ? rf.num[0].c : null
    if (!num) return { n: 0n, d: 1n }
    const q = { n: num.n * rf.den[0].c.d, d: num.d * rf.den[0].c.n }
    const g = gcd(q.n < 0n ? -q.n : q.n, q.d < 0n ? -q.d : q.d)
    const sign = q.d < 0n ? -1n : 1n
    return { n: (sign * q.n) / g, d: (sign * q.d) / g }
  } catch (err) {
    // Only "not a fraction": running out of time must not read as "undefined", which would show a false difference.
    if (!(err instanceof NotExact)) throw err
    return null
  }
}
const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b))

function callFn(name: string, argNodes: MathNode[], at: Point): Res {
  const args = argNodes.map((a) => evalReal(a, at))
  const bad = combine(args)
  if (bad) return bad
  const [x, y] = args as Val[]
  const ax = x ? mag(x.v) : 0
  switch (name) {
    case 'sqrt':
      if (x.v.isNeg() && !x.v.isZero()) return pastBoundary(x, x.v)
      return sqrtOf(x)
    case 'cbrt':
      return realRoot(x, 3)
    case 'nthRoot': {
      if (y.err !== 0 || !y.v.isInteger() || y.v.lt(1)) throw new Unsupported('root index')
      const k = y.v.toNumber()
      if (k % 2 === 0 && x.v.isNeg() && !x.v.isZero()) return pastBoundary(x, x.v)
      return realRoot(x, k)
    }
    case 'abs':
    case 'mag':
      return { v: x.v.abs(), err: x.err }
    case 'sign':
      if (x.v.isZero() && x.err === 0) return { v: ZERO, err: 0 }
      if (ax <= MARGIN * x.err) return unsure
      return { v: x.v.isNeg() ? ONE.neg() : ONE, err: 0 }
    case 'exp': {
      if (ax > MAX_EXPONENT) return unsure
      const v = x.v.exp()
      return val(v, mag(v) * x.err)
    }
    case 'ln':
      return lnOf(x)
    case 'log': {
      const l = lnOf(x)
      if (isUndef(l)) return l
      if (y) {
        const lb = lnOf(y)
        if (isUndef(lb)) return lb
        return div(l, lb)
      }
      return div(l, val(LN10, 0))
    }
    case 'log10': {
      const l = lnOf(x)
      return isUndef(l) ? l : div(l, val(LN10, 0))
    }
    case 'log2': {
      const l = lnOf(x)
      return isUndef(l) ? l : div(l, val(big(2).ln(), 0))
    }
    case 'sin':
      if (ax > MAX_ANGLE) return unsure
      return val(x.v.sin(), x.err)
    case 'cos':
      if (ax > MAX_ANGLE) return unsure
      return val(x.v.cos(), x.err)
    case 'tan': {
      if (ax > MAX_ANGLE) return unsure
      const c = val(x.v.cos(), x.err)
      return div(val(x.v.sin(), x.err), c)
    }
    case 'sec':
      if (ax > MAX_ANGLE) return unsure
      return div(val(ONE, 0), val(x.v.cos(), x.err))
    case 'csc':
      if (ax > MAX_ANGLE) return unsure
      return div(val(ONE, 0), val(x.v.sin(), x.err))
    case 'cot':
      if (ax > MAX_ANGLE) return unsure
      return div(val(x.v.cos(), x.err), val(x.v.sin(), x.err))
    case 'asin':
    case 'acos': {
      const over = x.v.abs().minus(ONE)
      if (over.gt(0)) return pastBoundary(x, over)
      const room = ONE.minus(x.v.times(x.v))
      const v = name === 'asin' ? x.v.asin() : x.v.acos()
      return val(v, room.isZero() ? Math.sqrt(x.err) : x.err / Math.sqrt(room.toNumber()))
    }
    case 'atan':
      return val(x.v.atan(), x.err / (1 + ax * ax))
    case 'sinh':
      if (ax > MAX_EXPONENT) return unsure
      return val(x.v.sinh(), mag(x.v.cosh()) * x.err)
    case 'cosh':
      if (ax > MAX_EXPONENT) return unsure
      return val(x.v.cosh(), mag(x.v.sinh()) * x.err)
    case 'tanh': {
      // Past 50, tanh is ±1 in all 40 digits; decimal.js would still work out e^(2x) to get there.
      if (ax > 50) return { v: x.v.isNeg() ? ONE.neg() : ONE, err: 1e-40 }
      const v = x.v.tanh()
      return val(v, (1 - mag(v) ** 2) * x.err)
    }
  }
  throw new Unsupported(`function ${name}`)
}

function sqrtOf(x: Val): Val {
  const v = x.v.sqrt()
  return val(v, v.isZero() ? Math.sqrt(x.err) : x.err / (2 * mag(v)))
}
function lnOf(x: Val): Res {
  if (x.v.isZero()) return x.err === 0 ? sure : unsure
  if (x.v.isNeg()) return pastBoundary(x, x.v)
  return val(x.v.ln(), x.err / mag(x.v))
}
function realRoot(x: Val, k: number): Val {
  const r = x.v.abs().pow(big(1).div(k))
  const v = x.v.isNeg() ? r.neg() : r
  return val(v, v.isZero() ? x.err ** (1 / k) : x.err / (k * mag(v) ** (k - 1)))
}

// ---------------------------------------------------------------- sampling

/** A small seeded generator (mulberry32), so every run samples the same points. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ADVERSARIAL = ['0', '1', '-1', '0.5', '-0.5', '2', '-2', '10', '-10', '1e-6', '-1e-6', '1e6', '-1e6']

/** Every argument where the expression can stop being real: denominators, roots, logarithms, fractional powers. */
function criticalArgs(node: MathNode): MathNode[] {
  const out: MathNode[] = []
  node.traverse((m) => {
    const v = m as unknown as { type: string; op?: string; args?: MathNode[] }
    if (v.type === 'OperatorNode' && v.op === '/' && v.args) out.push(v.args[1])
    if (v.type === 'OperatorNode' && v.op === '^' && v.args) out.push(v.args[0])
    if (v.type === 'FunctionNode' && v.args?.length) {
      const name = fnName(v as never)
      if (['sqrt', 'nthRoot', 'ln', 'log', 'log10', 'log2', 'cbrt', 'sec', 'csc', 'tan', 'cot'].includes(name)) out.push(v.args[0])
    }
  })
  return out
}

/** The real zeros of an argument, when it is a polynomial or quotient in the one variable. */
function zerosOf(arg: MathNode, x: string): number[] {
  try {
    const { rf, atoms } = readExact(arg)
    if (atoms.length) return []
    const out: number[] = []
    for (const e of [rf.num, rf.den]) {
      const vs = plainVars(e)
      if (vs.length === 1 && vs[0] === x) out.push(...realZeros(polyFromExpr(e, x).poly).map((z) => z.value))
    }
    return out
  } catch {
    return []
  }
}

/** What the numbers showed: never 'equal'. */
export interface NumericResult {
  verdict: 'different' | 'unknown'
  /** Points where both are defined and agree to 25 digits. */
  agreed: number
  /** Where they were seen to differ, for the record. */
  witness?: string
  /** Points where one is undefined and the other not, at a zero of a denominator: a removable point, not a difference. */
  excludedAt: number[]
}

/** The fallback comparison of two answers in the variables `vars`, on the real line (docs/knowledge/check.md). */
function numericEqualRaw(a: string | MathNode, b: string | MathNode, vars: string[] = ['x']): NumericResult {
  let na: MathNode
  let nb: MathNode
  try {
    na = typeof a === 'string' ? readMaths(a) : a
    nb = typeof b === 'string' ? readMaths(b) : b
  } catch {
    return { verdict: 'unknown', agreed: 0, excludedAt: [] }
  }
  const points: { at: Point; critical: boolean }[] = []
  const rand = seeded(20261012)
  // 12 significant figures, so a point is the same decimal on every machine.
  const randomValue = (): BigNumber => {
    const r = rand()
    if (r < 0.6) return big((rand() * 2 - 1) * 10).toSignificantDigits(12)
    const sign = rand() < 0.5 ? -1 : 1
    return big(sign * 10 ** (rand() * 6 - 3)).toSignificantDigits(12)
  }
  ADVERSARIAL.forEach((_, i) => {
    const at: Point = {}
    vars.forEach((v, j) => (at[v] = big(ADVERSARIAL[(i + 5 * j) % ADVERSARIAL.length])))
    points.push({ at, critical: false })
  })
  const criticalValues: number[] = []
  if (vars.length === 1) {
    const x = vars[0]
    for (const z of [...criticalArgs(na), ...criticalArgs(nb)].flatMap((arg) => zerosOf(arg, x))) {
      if (criticalValues.includes(z)) continue
      criticalValues.push(z)
      const step = Math.max(1, Math.abs(z))
      points.push({ at: { [x]: big(z) }, critical: true })
      for (const d of [1e-6, -1e-6, 1e-3, -1e-3]) points.push({ at: { [x]: big(z).plus(big(d * step)) }, critical: false })
    }
  }
  const result: NumericResult = { verdict: 'unknown', agreed: 0, excludedAt: [] }
  let randomOk = 0
  const judge = (at: Point, critical: boolean): 'ok' | 'skip' | 'different' => {
    const ra = evalReal(na, at)
    const rb = evalReal(nb, at)
    const where = Object.entries(at)
      .map(([k, v]) => `${k} = ${v.toString()}`)
      .join(', ')
    if (isUndef(ra) && isUndef(rb)) return 'skip'
    if (isUndef(ra) || isUndef(rb)) {
      const u = (isUndef(ra) ? ra : rb) as Undef
      if (u.marginal) return 'skip'
      const x = vars.length === 1 ? at[vars[0]].toNumber() : NaN
      if (critical || criticalValues.includes(x)) {
        if (!result.excludedAt.includes(x)) result.excludedAt.push(x)
        return 'skip'
      }
      result.witness = `${where}: ${isUndef(ra) ? 'the first is not defined' : 'the second is not defined'}`
      return 'different'
    }
    const size = Math.max(mag(ra.v), mag(rb.v))
    // Too ill-conditioned to judge (near a pole of tan, say): the point says nothing either way.
    if (ra.err + rb.err > ILL_CONDITIONED * Math.max(size, 1e-300)) return 'skip'
    const diff = mag(ra.v.minus(rb.v))
    if (diff > Math.max(1e-25 * size, MARGIN * (ra.err + rb.err))) {
      result.witness = `${where}: ${ra.v.toSignificantDigits(12).toString()} vs ${rb.v.toSignificantDigits(12).toString()}`
      return 'different'
    }
    return 'ok'
  }
  try {
    for (const p of points) {
      const j = judge(p.at, p.critical)
      if (j === 'different') return { ...result, verdict: 'different' }
      if (j === 'ok') result.agreed++
    }
    for (let tries = 0; tries < 400 && randomOk < 12; tries++) {
      const at: Point = {}
      for (const v of vars) at[v] = randomValue()
      const j = judge(at, false)
      if (j === 'different') return { ...result, verdict: 'different' }
      if (j === 'ok') {
        result.agreed++
        randomOk++
      }
    }
  } catch (err) {
    if (err instanceof Unsupported) return { verdict: 'unknown', agreed: 0, excludedAt: [] }
    throw err
  }
  return result
}

/**
 * Whether p(r) is clearly not 0 for a root r that is not exact (∛2, a decimal from a root finder): 'yes' beyond 25
 * digits and its rounding, 'no' when it may be 0, 'undefined' when r is not a real number. Never a proof that r is a
 * root, only that it is not.
 */
export function residualClearlyNonzero(p: Rat[], root: MathNode): 'yes' | 'no' | 'undefined' {
  let r: Res
  try {
    r = evalReal(root, {})
  } catch {
    return 'no'
  }
  if (isUndef(r)) return r.marginal ? 'no' : 'undefined'
  let value = ZERO
  let slope = ZERO
  let size = 0
  for (let i = p.length - 1; i >= 0; i--) {
    slope = slope.times(r.v).plus(value)
    value = value.times(r.v).plus(big(p[i].n.toString()).div(big(p[i].d.toString())))
    size = size * mag(r.v) + Math.abs(Number(p[i].n) / Number(p[i].d))
  }
  const bound = Math.max(1e-25 * size, MARGIN * (mag(slope) * r.err + ULP * size))
  return mag(value) > bound ? 'yes' : 'no'
}

/** Guarded: an exception is 'unknown', never a crash at the caller. */
export const numericEqual = safely(numericEqualRaw, (): NumericResult => ({ verdict: 'unknown', agreed: 0, excludedAt: [] }))

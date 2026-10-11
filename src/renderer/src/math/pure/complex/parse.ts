// Complex numbers and surds (math/pure/complex.ts says how the jobs work): reading a typed line exactly, and the
// sentences for what cannot be read.
// Out of complex.ts as a pure move (CLEANUP-PLAN.md CW10b).

import { type MathNode } from 'mathjs'
import { rAbs, rEq, rFromNumber, rIsNeg, rIsOne, rIsZero, rNeg, rat, type Rat } from '../rat'
import { writeTimes } from '../mono'
import { preprocess } from '../../expr'
import { simplifySurd, surd, surdSqrt } from '../cxpoly'
import {
  ZERO,
  ONE,
  type IPoly,
  ipIsOne,
  ipPow,
  type Frac,
  whole,
  fracNeg,
  fracTimes,
  fracOver,
  fracPlus,
  rationalOf
} from './numbers'
import { ipTex, typedTex } from './write'

// ---------------------------------------------------------------- with square roots
//
// The reader above holds fractions only, so 1/(√2 − √5i) was refused with a sentence about
// factorising, and the student got no answer at all: Complex has no algebra engine to fall back on (P22).
// Every line that reader refuses comes here. i is still a letter until the i² step, but each power
// of i carries a surd from cxpoly.ts (q + r√n), so √2, √8 = 2√2 and √−3 = √3·i stay exact. What
// one surd per part cannot hold — two different roots in one part, π, a sine — still gets its
// answer, as a decimal with the reason: an error would hide the whole answer card.

/** A line that has a value exact working here cannot hold; the message is the reason given. */
export class CannotHold extends Error {}

/** The highest power multiplied out by hand; (1 + √3i)⁶ is the textbook one. */
export const MAX_POWER = 12

const WORKS_WITH = 'The Complex job works exactly with numbers, i and square roots'
// "Working this line out", not "the answer": (√2 + √3)(√2 − √3) + i is −1 + i, but its first bracket
// already holds two roots in one part.
const TWO_ROOTS = 'The Complex job keeps each part of a number to one kind of square root, and working this line out needs two different roots in the same part, like √2 + √3.'
export const SOMETHING_ELSE = `${WORKS_WITH}, using +, −, ×, ÷ and whole-number powers, and this line has something else in it.`
const ROOT_OF_WHAT = 'The Complex job takes square roots of ordinary numbers, like √5 or √−3, and this line has the square root of something else.'
export const NOT_WHOLE_POWER = 'The Complex job multiplies out whole-number powers, and this line has a power that is not a whole number.'
export const TOO_HIGH = `The Complex job multiplies powers out by hand up to the ${MAX_POWER}th, and this one is higher.`
export const SIZE_BARS = 'The Complex job gives |z| as the Modulus of every answer, so to see it exactly, work out the number inside the bars on its own.'
export const HELD_ROUNDED = 'The Complex job works exactly with numbers it can hold to the last figure, and this line has one too long to hold exactly.'
export const NO_I = 'There is no i here, so this is an ordinary sum — the calculator will do it.'

/** The functions the Maths field writes, named the way a student says them. */
const FUNCTION_WORDS: Record<string, string> = {
  sin: 'a sine',
  cos: 'a cosine',
  tan: 'a tangent',
  sec: 'a secant',
  csc: 'a cosecant',
  cot: 'a cotangent',
  asin: 'an inverse sine',
  acos: 'an inverse cosine',
  atan: 'an inverse tangent',
  sinh: 'a hyperbolic function',
  cosh: 'a hyperbolic function',
  tanh: 'a hyperbolic function',
  ln: 'a logarithm',
  log: 'a logarithm',
  exp: 'a power of e',
  nthRoot: 'a root other than a square root',
  cbrt: 'a cube root',
  factorial: 'a factorial'
}

export const usesSentence = (name: string): string =>
  `${WORKS_WITH}, and this line also has ${FUNCTION_WORDS[name] ?? 'a function'} in it, so it cannot be worked out exactly here.`

/**
 * Why a one-argument operator other than a sign cannot be worked exactly. The factorial, 3!, is the
 * one the Maths field writes, and it is named: the surd working once read it as nothing at all, so
 * 3!√2 came out as 3√2 (P22b round 2).
 */
export const oneArgument = (op: string | undefined): string => (op === '!' ? usesSentence('factorial') : SOMETHING_ELSE)

export const neverEnds = (name: string): string =>
  `${WORKS_WITH}, and ${name === 'pi' ? 'π' : name} is a number that never ends, so it cannot be written exactly here.`

/** What the reader met on the way, for the first steps of the working. */
export interface Seen {
  /**
   * Each square root as typed → its simplest form, kept only where the two differ. `named` is the
   * square the root gave up, √(25 × 2) for √50, which the working with no i writes between the two.
   */
  roots: Map<string, { tex: string; negative: boolean; fraction: boolean; named?: string }>
  /** An i, typed or brought in by the root of a negative number. */
  i: boolean
}

export type Loose = { type: string; op?: string; args?: MathNode[]; content?: MathNode; value?: unknown; name?: string; fn?: { name?: string }; implicit?: boolean }

function readFrac(node: MathNode, seen: Seen): Frac {
  const n = node as unknown as Loose
  const args = n.args ?? []
  switch (n.type) {
    case 'ParenthesisNode':
      return readFrac(n.content as MathNode, seen)
    case 'ConstantNode':
      if (typeof n.value !== 'number' || !Number.isFinite(n.value)) throw new CannotHold(SOMETHING_ELSE)
      // As written, like every other Pure Math reader: 0.15 is 3/20.
      return whole([surd(rFromNumber(n.value))])
    case 'SymbolNode':
      if (n.name === 'i') {
        seen.i = true
        return whole([ZERO, ONE])
      }
      // Letters were refused before reading began, so this is π or e.
      throw new CannotHold(neverEnds(String(n.name)))
    case 'OperatorNode': {
      if (args.length === 1 && (n.op === '-' || n.op === '+')) {
        const a = readFrac(args[0], seen)
        return n.op === '-' ? fracNeg(a) : a
      }
      if (args.length !== 2) throw new CannotHold(args.length === 1 ? oneArgument(n.op) : SOMETHING_ELSE)
      const a = readFrac(args[0], seen)
      const b = readFrac(args[1], seen)
      if (n.op === '+') return fracPlus(a, b)
      if (n.op === '-') return fracPlus(a, fracNeg(b))
      if (n.op === '*') return fracTimes(a, b)
      if (n.op === '/') return fracOver(a, b)
      if (n.op === '^') return powerOf(a, b)
      throw new CannotHold(SOMETHING_ELSE)
    }
    case 'FunctionNode': {
      const name = n.fn?.name ?? ''
      if (name === 'sqrt' && args.length === 1) return whole(rootOf(node, args[0], seen))
      if (name === 'mag' || name === 'abs') throw new CannotHold(SIZE_BARS)
      throw new CannotHold(usesSentence(name))
    }
    default:
      throw new CannotHold(SOMETHING_ELSE)
  }
}

/** A whole-number power multiplied out; a negative one turns the fraction over. */
function powerOf(base: Frac, power: Frac): Frac {
  const k = rationalOf(power)
  if (k === null || k.d !== 1n) throw new CannotHold(NOT_WHOLE_POWER)
  const p = Number(k.n)
  if (Math.abs(p) > MAX_POWER) throw new CannotHold(TOO_HIGH)
  const up: Frac = { num: ipPow(base.num, Math.abs(p)), den: ipPow(base.den, Math.abs(p)) }
  return p >= 0 ? up : { num: up.den, den: up.num }
}

/** √ of an ordinary number: a surd, or for a negative number a surd times i (√−3 = √3·i). */
export function rootOf(node: MathNode, inside: MathNode, seen: Seen): IPoly {
  const m = rationalOf(readFrac(inside, seen))
  if (m === null) throw new CannotHold(ROOT_OF_WHAT)
  const negative = rIsNeg(m)
  const value: IPoly = negative ? [ZERO, surdSqrt(rNeg(m))] : [surdSqrt(m)]
  if (negative) seen.i = true
  const typed = typedTex(node)
  const simplest = ipTex(value)
  if (typed !== simplest) seen.roots.set(typed, { tex: simplest, negative, fraction: m.d !== 1n, named: squareNamed(m) })
  return value
}

/** √50 as √(25 × 2) and √36 as √(6²): the square taken out of a whole number, named. Nothing for any other root. */
function squareNamed(m: Rat): string | undefined {
  if (m.d !== 1n || m.n < 1n) return undefined
  const { out, in: rest, tooBig } = simplifySurd(m.n)
  if (tooBig || out === 1n) return undefined
  return rest === 1n ? `\\sqrt{${out}^{2}}` : `\\sqrt{${out * out} \\times ${rest}}`
}

/** The whole line as one fraction, and whether it was typed as one plain fraction. */
export function readLine(node: MathNode, seen: Seen): { frac: Frac; plain: boolean } {
  let top = node as unknown as Loose
  while (top.type === 'ParenthesisNode' && top.content) top = top.content as unknown as Loose
  if (top.type === 'OperatorNode' && top.op === '/' && top.args?.length === 2) {
    const a = readFrac(top.args[0], seen)
    const b = readFrac(top.args[1], seen)
    return { frac: fracOver(a, b), plain: ipIsOne(a.den) && ipIsOne(b.den) }
  }
  const frac = readFrac(node, seen)
  return { frac, plain: ipIsOne(frac.den) }
}

/** Letters other than i — π and e are numbers to a student, not letters. */
export function straysOf(node: MathNode): string[] {
  const fns = new Set<MathNode>()
  node.traverse((n) => {
    if (n.type === 'FunctionNode') fns.add((n as unknown as { fn: MathNode }).fn)
  })
  const names = node.filter((n) => n.type === 'SymbolNode' && !fns.has(n)).map((n) => String((n as unknown as { name: string }).name))
  return [...new Set(names)].filter((v) => v !== 'i' && v !== 'pi' && v !== 'e').sort()
}

/** Every number literal in a line, in the order a left-to-right walk of mathjs's tree meets them. */
const LITERAL = /(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi

/** The line the way both readers hand it to mathjs. */
export const readable = (src: string): string => writeTimes(preprocess(src.trim().replace(/^=+|=+$/g, '')))

/**
 * Whether the exact working would start from some other number than the one typed. Both readers
 * take a number from the double mathjs stores, which holds about 16 figures: 12345678901234567 is
 * stored as …568, and 0.1000000000000000055 as 0.1.
 */
function heldRounded(text: string): boolean {
  const v = Number(text)
  if (!Number.isFinite(v)) return true
  const [mant, exp = '0'] = text.toLowerCase().split('e')
  const [whole, frac = ''] = mant.split('.')
  const k = Number(exp) - frac.length
  // Past 10^±400 a double holds nothing exactly anyway, and building the power would only be slow.
  if (Math.abs(k) > 400) return true
  const digits = BigInt(`${whole}${frac}` || '0')
  const typed = k >= 0 ? rat(digits * 10n ** BigInt(k)) : rat(digits, 10n ** BigInt(-k))
  return !rEq(typed, rFromNumber(v))
}

export const typedPastExact = (line: string): boolean => [...line.matchAll(LITERAL)].some((m) => heldRounded(m[0]))

/** The digits as typed of each number mathjs could not hold, by its node, for the line shown back. */
export function roundedLiterals(line: string, node: MathNode): Map<MathNode, string> | undefined {
  const texts = [...line.matchAll(LITERAL)].map((m) => m[0])
  const numbers = node.filter((n) => n.type === 'ConstantNode')
  // Typed order and tree order agree; when the counts do not, nothing is guessed.
  if (texts.length !== numbers.length) return undefined
  const out = new Map<MathNode, string>()
  numbers.forEach((n, k) => {
    if (heldRounded(texts[k])) out.set(n, texts[k])
  })
  return out
}

/**
 * What a piece of a typed line multiplies together. Two roots, two i's or two numbers in one
 * product is work to show; a root that simplifies with a number in front (√8 = 2√2, √4 = 2) is a
 * number too, so 2√8 is 2 × 2√2.
 */
interface Scan {
  roots: number
  is: number
  nums: number
  expand: boolean
}

/**
 * Whether a typed line holds anything to multiply out: a power, a bracket that is multiplied or
 * subtracted, two roots, two i's or two numbers in one product (√2·√3, √−3·i, 2√8), or a division
 * by more than a plain number. A line with none of these — i√5, √−4 + i, √3/2 + ½i — only needs
 * writing in the form a + bi, and a heading that says "multiply out" there describes work nobody
 * did. A line typed as one fraction is asked about its top and its bottom.
 */
export function needsExpanding(node: MathNode, plainFraction: boolean): boolean {
  let top = node as unknown as Loose
  while (top.type === 'ParenthesisNode' && top.content) top = top.content as unknown as Loose
  if (plainFraction && top.type === 'OperatorNode' && top.op === '/' && top.args?.length === 2) {
    return scan(top.args[0], true).expand || scan(top.args[1], true).expand
  }
  return scan(node, true).expand
}

function scan(node: MathNode, whole: boolean): Scan {
  const n = node as unknown as Loose
  const args = n.args ?? []
  const nothing: Scan = { roots: 0, is: 0, nums: 0, expand: false }
  switch (n.type) {
    case 'ConstantNode':
      return { ...nothing, nums: 1 }
    case 'SymbolNode':
      return n.name === 'i' ? { ...nothing, is: 1 } : nothing
    case 'FunctionNode': {
      // √−3 brings an i of its own, so √−3·i is i times i; √8 brings the 2 of 2√2.
      const shape = args.length === 1 ? rootShape(args[0]) : { negative: false, scaled: false }
      return { roots: 1, is: shape.negative ? 1 : 0, nums: shape.scaled ? 1 : 0, expand: false }
    }
    case 'ParenthesisNode': {
      const inner = scan(n.content as MathNode, whole)
      const c = n.content as unknown as Loose
      const sum = c.type === 'OperatorNode' && (c.op === '+' || c.op === '-') && c.args?.length === 2
      return sum && !whole ? { ...inner, expand: true } : inner
    }
    case 'OperatorNode': {
      if (args.length === 1) return scan(args[0], false)
      if (args.length !== 2 || n.op === '^') return { ...nothing, expand: true }
      const a = scan(args[0], false)
      if (n.op === '/') return args[1].filter((m) => m.type === 'SymbolNode' || m.type === 'FunctionNode').length ? { ...a, expand: true } : a
      const b = scan(args[1], false)
      if (n.op === '*') {
        const roots = a.roots + b.roots
        const is = a.is + b.is
        const nums = a.nums + b.nums
        return { roots, is, nums, expand: a.expand || b.expand || roots > 1 || is > 1 || nums > 1 }
      }
      // A sum is not a factor: what is multiplied inside each term stays inside it.
      return { ...nothing, expand: a.expand || b.expand }
    }
    default:
      return nothing
  }
}

/** Whether a square root's number is negative, and whether its simplest form has a number in front. */
function rootShape(inside: MathNode): { negative: boolean; scaled: boolean } {
  try {
    const m = rationalOf(readFrac(inside, { roots: new Map(), i: false }))
    if (m === null) return { negative: false, scaled: false }
    const root = surdSqrt(rAbs(m))
    return { negative: rIsNeg(m), scaled: !(rIsZero(root.q) && rIsOne(rAbs(root.r))) }
  } catch {
    return { negative: false, scaled: false }
  }
}

/** The reason a line gets its answer as a decimal, in words for this job. */
export function reasonFor(err: unknown): string {
  if (err instanceof CannotHold) return err.message
  // cxpoly's own refusal: surdAdd and surdMul share one root or throw.
  if (err instanceof Error && /cannot be combined exactly/.test(err.message)) return TWO_ROOTS
  return 'The Complex job could not write this one exactly.'
}

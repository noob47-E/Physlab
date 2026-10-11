// Complex numbers and surds (math/pure/complex.ts says how the jobs work): Simplify surds for a line with no i, the
// Pencil that works it out step by step.
// Out of complex.ts as a pure move (CLEANUP-PLAN.md CW10b).

import { type MathNode } from 'mathjs'
import { R0, R1, rAbs, rAdd, rFromNumber, rInv, rIsNeg, rIsOne, rIsZero, rNeg, rNum, rPow, rTex, rat } from '../rat'
import { type DigitSettings } from '../../format'
import {
  joinPieces,
  surd,
  surdAdd,
  surdEq,
  surdIsRational,
  surdIsZero,
  surdNeg,
  surdSub,
  type SignedTex,
  type Surd
} from '../cxpoly'
import { Steps, type Answer, type Working } from '../work'
import { agreesWith, ZERO, ONE, timesSurd } from './numbers'
import {
  CannotHold,
  MAX_POWER,
  SOMETHING_ELSE,
  NOT_WHOLE_POWER,
  TOO_HIGH,
  SIZE_BARS,
  usesSentence,
  oneArgument,
  neverEnds,
  type Seen,
  type Loose,
  rootOf
} from './parse'
import {
  decimalRow,
  besides,
  typedTex,
  chain,
  isWhole,
  sameLine,
  type Part,
  partsOf,
  pieceOf,
  plusFirst,
  realTex,
  realPlain,
  typedPlain,
  type Typed,
  operand,
  partProduct,
  conjugatePair,
  partSquared,
  powSurd,
  realRootsMove
} from './write'

/** A bottom that comes to zero: said as the Complex job says it. */
export class ZeroBottom extends Error {}

/** A line with an i in it, typed or brought by the root of a negative number: not this working's line. */
export class ComplexLine extends Error {}

/**
 * A sum that ends with two roots that cannot be one number, √2 + √3: it is its own answer. The
 * working carries it out of the walk as written, with its value, and `lone` says that no step came
 * before it, so the answer is the line itself and has nothing to be checked against.
 */
class UnlikeRoots extends Error {
  constructor(
    readonly tex: string,
    readonly value: number,
    readonly lone: boolean
  ) {
    super('different roots')
  }
}

/**
 * A pencil that works a line out one operation at a time, from the inside out, and writes a step
 * for each one that changes how the line is written: a product of two roots is a step, 3 × √2 is not.
 */
class Pencil {
  readonly s = new Steps()
  /** What the last step ended on, so a working that stops short of its answer can be finished. */
  last = ''

  /** The part of the line that is the whole line, once its brackets are off: a sum that ends there may end with two roots. */
  top?: MathNode

  /** `seen` collects the line's roots as they are met, each with its simplest form, for the step that sets them down. */
  constructor(private readonly seen: Seen) {}

  private write(goal: string | undefined, head: string, tex: string, rule: string | undefined, end: string): void {
    if (goal) this.s.goal(goal)
    this.s.add(head, tex, rule)
    this.last = end
  }

  /**
   * A part of the line worked out, with how it was written if no step was needed to work it out. A
   * first step that multiplies or divides starts from what was typed (√3 + 1), where the number it
   * came to would be written the textbook way round (1 + √3); once a step has changed the part, the
   * number is what the next step starts from.
   */
  private operandOf(node: MathNode): { v: Surd; typed?: Typed } {
    const before = this.s.moves.length
    const v = this.walk(node)
    if (this.s.moves.length !== before) return { v }
    const x = unwrapped(node) as unknown as Loose
    const signed = x.type === 'OperatorNode' && (x.op === '+' || x.op === '-')
    return { v, typed: { tex: typedTex(node, this.seen.roots), kind: signed ? (x.args?.length === 2 ? 'sum' : 'negative') : 'other' } }
  }

  /**
   * The number a part of the line comes to, with a step for each operation that changes how it is
   * written. This is the reader for a line with no i, and it refuses what readFrac above refuses,
   * in the same words: the reader above cannot hold √2 + √3 − √3 or a sum of different roots at
   * all, and this one holds both.
   */
  walk(node: MathNode): Surd {
    const n = node as unknown as Loose
    const args = n.args ?? []
    switch (n.type) {
      case 'ParenthesisNode':
        return this.walk(n.content as MathNode)
      case 'ConstantNode':
        if (typeof n.value !== 'number' || !Number.isFinite(n.value)) throw new CannotHold(SOMETHING_ELSE)
        // As written, like every other Pure Math reader: 0.15 is 3/20.
        return surd(rFromNumber(n.value))
      case 'SymbolNode':
        if (n.name === 'i') throw new ComplexLine()
        // Letters were refused before reading began, so this is π or e.
        throw new CannotHold(neverEnds(String(n.name)))
      case 'FunctionNode': {
        const name = n.fn?.name ?? ''
        if (name === 'mag' || name === 'abs') throw new CannotHold(SIZE_BARS)
        if (name !== 'sqrt' || args.length !== 1) throw new CannotHold(usesSentence(name))
        const root = rootOf(node, args[0], this.seen)
        // The root of a negative number brings its own i: the line is a complex number.
        if (this.seen.i) throw new ComplexLine()
        return root[0]
      }
      case 'OperatorNode': {
        // Only a sign is read through. Any other one-argument operator was too, as if it were not
        // there: 3!√2 was worked as 3√2, "already as simple as it gets", beside a calculator line of
        // 8.49 (P22b round 2). A factorial has no exact surd value here, so the line gets its decimal.
        if (args.length === 1 && (n.op === '-' || n.op === '+')) return n.op === '-' ? surdNeg(this.walk(args[0])) : this.walk(args[0])
        if (args.length !== 2) throw new CannotHold(args.length === 1 ? oneArgument(n.op) : SOMETHING_ELSE)
        if (n.op === '+' || n.op === '-') return this.run(node)
        if (n.op === '*' || n.op === '/') {
          const [a, b] = [this.operandOf(args[0]), this.operandOf(args[1])]
          return n.op === '*'
            ? this.multiply(a.v, b.v, { as: a.typed, bs: b.typed })
            : this.divide(a.v, b.v, a.typed, b.typed, b.typed === undefined ? undefined : this.turned(args[1]))
        }
        if (n.op === '^') {
          const base = this.operandOf(args[0])
          // The power is read on a pencil of its own: what is worked out inside it is not a step of this line.
          const power = new Pencil(this.seen).walk(args[1])
          if (!surdIsRational(power) || power.q.d !== 1n) throw new CannotHold(NOT_WHOLE_POWER)
          if (Math.abs(Number(power.q.n)) > MAX_POWER) throw new CannotHold(TOO_HIGH)
          return this.raise(base.v, Number(power.q.n), base.typed)
        }
        throw new CannotHold(SOMETHING_ELSE)
      }
      default:
        throw new CannotHold(SOMETHING_ELSE)
    }
  }

  /** A run of + and −, gathered once: each term is worked out first, in the order typed. */
  private run(node: MathNode): Surd {
    const terms: { neg: boolean; node: MathNode }[] = []
    const flatten = (m: MathNode, neg: boolean): void => {
      const x = m as unknown as Loose
      if (x.type === 'OperatorNode' && (x.op === '+' || x.op === '-') && x.args?.length === 2) {
        flatten(x.args[0], neg)
        terms.push({ neg: x.op === '-', node: x.args[1] })
      } else terms.push({ neg, node: m })
    }
    flatten(node, false)
    return this.gather(
      terms.map((t) => ({ neg: t.neg, v: this.walk(t.node) })),
      node === this.top
    )
  }

  /**
   * Like surds added: 2√3 + 3√3 = (2 + 3)√3, a step only where something is collected. The parts are
   * added up under the root each belongs to, so √2 + √3 − √3 is √2. Two roots that are left cannot be
   * one number (surdAdd refuses them the same way): at the top of the line they are the answer as
   * they stand, √2 + √3, and anywhere else the line is beyond this working.
   */
  private gather(terms: { neg: boolean; v: Surd }[], top = false): Surd {
    // Every part of every term, with the sign of its term folded in, in groups by the root it belongs to.
    const parts = terms.flatMap(({ neg, v }) => partsOf(v).map((p): Part => ({ c: neg ? rNeg(p.c) : p.c, n: p.n })))
    const groups = new Map<bigint | null, Part[]>()
    for (const p of parts) groups.set(p.n, [...(groups.get(p.n) ?? []), p])
    const sums = [...groups]
      .map(([n, ps]): Part => ({ n, c: ps.reduce((t, p) => rAdd(t, p.c), R0) }))
      .filter((p) => !rIsZero(p.c))
      .sort((x, y) => (x.n === y.n ? 0 : x.n === null ? -1 : y.n === null ? 1 : x.n < y.n ? -1 : 1))
    const roots = sums.filter((p) => p.n !== null)
    const unlike = roots.length > 1
    // Worded as cxpoly words it, so one reason covers a sum that cannot be put together and a product that cannot.
    if (unlike && !top) throw new Error(`√${roots[0].n} and √${roots[1].n} cannot be combined exactly`)
    const total = unlike ? ZERO : surd(sums.find((p) => p.n === null)?.c ?? R0, roots[0]?.c ?? R0, roots[0]?.n ?? 1n)
    const sumTex = unlike ? joinPieces(plusFirst(sums.map(pieceOf))) : realTex(total)
    const alike = [...groups].filter(([n, ps]) => n !== null && ps.length >= 2)
    const wholes = groups.get(null)?.length ?? 0
    if (alike.length || (wholes >= 2 && parts.some((p) => p.n !== null))) {
      const numbers = (ps: Part[]): string => joinPieces(ps.map((p) => ({ neg: rIsNeg(p.c), body: rTex(rAbs(p.c)) })))
      const grouped = [...groups]
        .sort(([x], [y]) => (x === y ? 0 : x === null ? -1 : y === null ? 1 : x < y ? -1 : 1))
        .flatMap(([n, ps]): SignedTex[] => (ps.length < 2 ? ps.map(pieceOf) : [{ neg: false, body: `\\left(${numbers(ps)}\\right)${n === null ? '' : `\\sqrt{${n}}`}` }]))
      const named = alike.length === 1 ? `√${alike[0][0]}` : 'each root'
      this.write(
        alike.length ? 'Collect like surds' : 'Add the whole numbers',
        alike.length && wholes >= 2
          ? `Collect like terms: add the whole numbers, and add the numbers in front of ${named}, since like surds have the same root.`
          : alike.length
            ? `Like surds have the same root, so add the numbers in front of ${named}.`
            : 'Add the whole numbers together.',
        chain([joinPieces(parts.map(pieceOf)), joinPieces(grouped), sumTex]),
        alike.length ? 'a\\sqrt{n} + b\\sqrt{n} = (a+b)\\sqrt{n}' : undefined,
        sumTex
      )
    }
    if (unlike) {
      const names = roots.map((p) => `√${p.n}`)
      const lone = this.s.moves.length === 0
      this.write(
        'Different roots',
        `${names.length === 2 ? `${names[0]} and ${names[1]} are different roots` : 'These roots are all different'}, so they cannot be added into one root: the answer is the sum as it stands.`,
        sumTex,
        undefined,
        sumTex
      )
      throw new UnlikeRoots(sumTex, sums.reduce((t, p) => t + (p.n === null ? rNum(p.c) : surdNumber(surd(R0, p.c, p.n))), 0), lone)
    }
    return total
  }

  /**
   * a × b, term by term: every part of one times every part of the other, then the roots squared away.
   * `head` words the step, `lead` starts its line (a power, (1 + √2)², for the bracket times itself),
   * and `as` and `bs` are how the line wrote the two numbers, when a first step keeps them.
   */
  private multiply(a: Surd, b: Surd, o: { head?: string; lead?: string; as?: Typed; bs?: Typed } = {}): Surd {
    const { head, lead } = o
    const p = timesSurd(a, b)
    const pa = partsOf(a)
    const pb = partsOf(b)
    // Whole numbers times whole numbers is arithmetic, and times 1 changes nothing.
    if (!pa.length || !pb.length || (surdIsRational(a) && surdIsRational(b)) || surdEq(a, ONE) || surdEq(b, ONE)) return p
    const result = realTex(p)
    const prods = pa.flatMap((x) => pb.map((y) => partProduct(x, y)))
    const squared = prods.find((q) => q.squared !== null)?.squared ?? null
    // 3 × √2 is already written 3√2: nothing is worked out.
    if (!lead && prods.length === 1 && squared === null && besides(operand(a, true), operand(b), true) === result) return p
    const [left, right] = [operand(a, true, o.as), operand(b, false, o.bs)]
    // Two brackets side by side are a product; anything else gets its ×, so 2 and 3 never read as 23.
    const operands = lead ?? (left.startsWith('\\left(') && right.startsWith('\\left(') ? `${left}${right}` : `${left} \\times ${right}`)
    const many = pa.length > 1 || pb.length > 1
    const pair = conjugatePair(a, b)
    if (pair) {
      const [one, two] = [partSquared(pair.first), partSquared(pair.second)]
      this.write(
        'Multiply out',
        head ?? 'Multiply the brackets. They differ only in the sign between their terms, so the middle terms cancel: (a + b)(a − b) = a² − b².',
        chain([operands, `${one.tex} - ${two.tex}`, `${one.value} - ${two.value}`, result]),
        '(a+b)(a-b) = a^2 - b^2',
        result
      )
      return p
    }
    const joined = !surdIsRational(a) && !surdIsRational(b) && a.n !== b.n
    this.write(
      'Multiply out',
      head ??
        (joined
          ? 'Multiply the numbers together and put the two roots under one root, then take out any square.'
          : squared !== null
            ? `Multiply ${many ? 'every term of the first by every term of the second' : 'the numbers together and the roots together'}, and use (√${squared})² = ${squared}.`
            : many
              ? 'Multiply every term of the first by every term of the second.'
              : 'Multiply the numbers together, keeping the root.'),
      chain([operands, joinPieces(prods.map((q) => q.before)), joinPieces(prods.map((q) => q.after)), result]),
      squared !== null ? '\\left(\\sqrt{a}\\right)^2 = a' : joined ? '\\sqrt{a} \\times \\sqrt{b} = \\sqrt{ab}' : undefined,
      result
    )
    return p
  }

  /** x to a whole power: a root and a number are raised separately, a bracket is multiplied by itself. */
  private raise(x: Surd, k: number, typed?: Typed): Surd {
    if (k < 0) {
      if (!surdIsRational(x)) {
        const [shown, base] = [typed?.tex ?? realTex(x), `\\left(${typed?.tex ?? realTex(x)}\\right)`]
        this.write(
          'Work out the power',
          'A negative power turns the number upside down: it is one over the same power without the minus.',
          `${base}^{${k}} = \\dfrac{1}{${k === -1 ? shown : `${base}^{${-k}}`}}`,
          'a^{-n} = \\dfrac{1}{a^{n}}',
          this.last
        )
      }
      return this.divide(ONE, this.raise(x, -k))
    }
    if (k === 0) return ONE
    if (k === 1 || surdIsRational(x) || surdIsZero(x)) return powSurd(x, k)
    if (!rIsZero(x.q)) {
      let acc = x
      for (let j = 2; j <= k; j++) {
        acc = this.multiply(acc, x, {
          head: j > 2 ? 'Multiply by the bracket once more.' : k > 2 ? `The bracket is multiplied by itself ${k} times, two at a time. Start with the first two.` : undefined,
          lead: j === 2 && k === 2 ? `\\left(${typed?.tex ?? realTex(x)}\\right)^{2}` : undefined,
          as: j === 2 ? typed : undefined,
          bs: typed
        })
      }
      return acc
    }
    // A number times a root: (c√n)^k = c^k (√n)^k, and (√n)^k is n for every pair of roots, times √n if one is left.
    const p = powSurd(x, k)
    const c = x.r
    const odd = k % 2 === 1
    const rooted = `\\left(\\sqrt{${x.n}}\\right)^{${k}}`
    const number = rIsNeg(c) || c.d !== 1n ? `\\left(${rTex(c)}\\right)^{${k}}` : `${rTex(c)}^{${k}}`
    this.write(
      'Work out the power',
      rIsOne(c) && k === 2 ? `Squaring undoes the square root: (√${x.n})² = ${x.n}.` : `Take the power of the number and of the root separately${k >= 2 ? `, and use (√${x.n})² = ${x.n}` : ''}.`,
      chain([
        `\\left(${typed?.tex ?? realTex(x)}\\right)^{${k}}`,
        rIsOne(c) ? rooted : `${number}${rooted}`,
        `${rIsOne(c) ? '' : `${rTex(rPow(c, k))} \\times `}${x.n ** BigInt(Math.floor(k / 2))}${odd ? `\\sqrt{${x.n}}` : ''}`,
        realTex(p)
      ]),
      '\\left(\\sqrt{a}\\right)^2 = a',
      realTex(p)
    )
    return p
  }

  /**
   * The conjugate of a bottom the line wrote as two terms, found the way a textbook finds it: the
   * sign between them turned round, √3 + 1 → √3 − 1 and 1 − √2 → 1 + √2. Nothing when the bottom is
   * not two plain terms (a sum inside a term would need brackets once its sign is turned).
   */
  private turned(bottom: MathNode): { v: Surd; tex: string; plain: string } | undefined {
    const sum = (m: MathNode): boolean => {
      const x = unwrapped(m) as unknown as Loose
      return x.type === 'OperatorNode' && (x.op === '+' || x.op === '-')
    }
    const two = unwrapped(bottom) as unknown as Loose
    if (!sum(bottom) || two.args?.length !== 2) return undefined
    const [left, right] = two.args
    if (sum(left) || sum(right)) return undefined
    try {
      const [l, r] = [new Pencil(this.seen).walk(left), new Pencil(this.seen).walk(right)]
      const sign = two.op === '+' ? '-' : '+'
      const [lt, rt] = [typedTex(left, this.seen.roots), typedTex(right, this.seen.roots)]
      // The sentence names the conjugate in the same terms, in the same order, as the step's maths.
      return { v: two.op === '+' ? surdSub(l, r) : surdAdd(l, r), tex: `${lt} ${sign} ${rt}`, plain: `${typedPlain(lt)} ${sign === '-' ? '−' : '+'} ${typedPlain(rt)}` }
    } catch {
      return undefined
    }
  }

  /**
   * a ÷ b, and a bottom with a root in it multiplied by √n or by its conjugate until it is a whole
   * number. `ta` and `tb` are how the line wrote the top and the bottom, and `turned` is the bottom's
   * conjugate as the line's own two terms give it, when the first step keeps what was typed.
   */
  private divide(a: Surd, b: Surd, ta?: Typed, tb?: Typed, turned?: { v: Surd; tex: string; plain: string }): Surd {
    if (surdIsZero(b)) throw new ZeroBottom()
    if (surdIsRational(b)) {
      const value = timesSurd(a, surd(rInv(b.q)))
      const written = `\\dfrac{${realTex(a)}}{${realTex(b)}}`
      if (!surdIsRational(a) && !sameLine(written, realTex(value))) {
        this.write(
          'Divide',
          rIsNeg(b.q)
            ? 'A minus sign on the bottom goes in front of the whole fraction.'
            : partsOf(a).length > 1
              ? 'Divide each term on the top by the bottom.'
              : 'Divide the top and the bottom by their common factor.',
          `${written} = ${realTex(value)}`,
          undefined,
          realTex(value)
        )
      }
      return value
    }
    const alone = rIsZero(b.q)
    // A root on its own is cleared by itself. Two terms are cleared by the conjugate, with the sign
    // between them turned round as they were written (1 + √3 by 1 − √3, a bottom that comes to −2:
    // the minus is carried to the top at the end, as a textbook does); a bottom worked out on the
    // way has no typed order, so its root's sign is turned.
    const typed = alone ? undefined : turned && surdIsRational(timesSurd(b, turned.v)) ? turned : undefined
    const by = alone ? surd(R0, R1, b.n) : typed ? typed.v : surd(b.q, rNeg(b.r), b.n)
    const [byTex, byPlain] = typed ? [typed.tex, typed.plain] : [realTex(by), realPlain(by)]
    this.write(
      'Clear the root from the bottom',
      alone
        ? `The bottom has a root in it, so multiply top and bottom by ${byPlain} to clear it.`
        : `The bottom has a root in it, so multiply top and bottom by its conjugate, ${byPlain}, to clear it.`,
      `\\dfrac{${ta?.tex ?? realTex(a)}}{${tb?.tex ?? realTex(b)}} \\times \\dfrac{${byTex}}{${byTex}}`,
      alone ? '\\sqrt{n} \\times \\sqrt{n} = n' : '(a + b\\sqrt{n})(a - b\\sqrt{n}) = a^2 - b^2 n',
      ''
    )
    const written: Typed | undefined = typed && { tex: typed.tex, kind: 'sum' }
    const bottom = this.multiply(b, by, {
      head: `The bottom becomes a whole number${alone ? `, since √${b.n} × √${b.n} = ${b.n}` : ', because the middle terms cancel'}.`,
      as: tb,
      bs: written
    })
    if (!surdIsRational(bottom) || surdIsZero(bottom)) throw new Error('the bottom did not come out as a whole number')
    const top = this.multiply(a, by, { head: 'Multiply out the top the same way.', as: ta, bs: written })
    const value = timesSurd(top, surd(rInv(bottom.q)))
    const over = rIsOne(bottom.q) ? realTex(top) : `\\dfrac{${realTex(top)}}{${realTex(bottom)}}`
    if (over !== this.last) {
      this.write(
        undefined,
        rIsNeg(bottom.q) ? 'Put the new top over the new bottom. A minus on the bottom turns every sign on the top round.' : 'Put the new top over the new bottom.',
        sameLine(over, realTex(value)) ? over : `${over} = ${realTex(value)}`,
        undefined,
        realTex(value)
      )
    }
    return value
  }
}

/** floor(√v) for a big whole number, by Newton's method. */
function isqrt(v: bigint): bigint {
  if (v < 2n) return v
  let x = v
  let y = (x + 1n) / 2n
  while (y < x) {
    x = y
    y = (x + v / x) / 2n
  }
  return x
}

/**
 * q + r√n as a double, with the root taken to 60 digits first. A high power of 4 − 2√3 is the
 * difference of two numbers near 10²³, and surdValue's doubles lose all of it: the decimal row read
 * 0 and the check called a right answer suspicious.
 */
function surdNumber(s: Surd): number {
  if (surdIsRational(s)) return rNum(s.q)
  const scale = 10n ** 60n
  const root = isqrt(s.n * scale * scale)
  return rNum(rat(s.q.n * s.r.d * scale + s.r.n * s.q.d * root, s.q.d * s.r.d * scale))
}

/** The steps for a line with no i, and the exact answer they come to. */
export function realSteps(title: string, input: string, node: MathNode, src: string, digits: DigitSettings): Working {
  const seen: Seen = { roots: new Map(), i: false }
  const w = new Pencil(seen)
  w.top = unwrapped(node)
  let answer: string
  let value: number
  let whole = false
  let unlike: UnlikeRoots | undefined
  try {
    const z = w.walk(node)
    answer = realTex(z)
    value = surdNumber(z)
    whole = isWhole(z)
  } catch (err) {
    // A sum that ends with two different roots is its own answer, and its last step is already written.
    if (!(err instanceof UnlikeRoots)) throw err
    unlike = err
    answer = err.tex
    value = err.value
  }
  const start = typedTex(node, seen.roots)
  // √2 + 1 and 1 + √2 are the same terms: a line whose answer only turns it round has nothing in it to simplify.
  const asTyped = termsOf(start).join('|') === termsOf(answer).join('|')
  const untouched = asTyped && seen.roots.size === 0 && (unlike ? unlike.lone : w.s.moves.length === 0)
  if (untouched && !unlike) {
    w.s.add('This is already as simple as it gets: no root has a square factor to take out, and no two parts can be put together.', answer)
  } else if (!unlike && w.last !== answer && !asTyped) {
    // The last operation was whole-number arithmetic (2 + 3, 0 × √2), which is not a step of its own: the line ends on the answer.
    w.s.goal('Put it together').add('Work out what is left.', `${start} = ${answer}`)
  }
  // The roots are simplified first on the page, but are met in the order the line is worked: the step is written once all are known.
  if (seen.roots.size) {
    const first = new Steps()
    realRootsMove(seen.roots, first)
    w.s.moves.unshift(...first.moves)
  }
  const answers: Answer[] = [{ label: 'Answer', tex: answer }]
  if (!whole) answers.push(decimalRow(value, 0, digits))
  const agrees = agreesWith(src, value, 0)
  return {
    title,
    input,
    moves: w.s.moves,
    answers,
    // An answer that is the line itself has nothing to put back together, so no tick is given for it.
    // A numeric route that disagrees is said all the same: "nothing to check" once hid 3!√2's 8.49
    // behind an exact 3√2 (P22b round 2), and it is the one sign that an exact answer is wrong.
    check:
      agrees === false
        ? 'Careful: working it out numerically gives a different number. Treat this answer with suspicion.'
        : untouched
          ? 'The line was already in its simplest form, so there is nothing to check.'
          : agrees
            ? 'Working the line out numerically gives the same number as this exact answer.'
            : undefined,
    checked: agrees === false ? 'failed' : untouched || agrees === null ? undefined : 'ok'
  }
}

/** The part of the line a typed part comes to once its brackets are off. */
function unwrapped(m: MathNode): MathNode {
  let x = m
  while ((x as unknown as Loose).type === 'ParenthesisNode' && (x as unknown as Loose).content) x = (x as unknown as Loose).content as MathNode
  return x
}

/** The terms of a line with their signs, in no order: √2 + 1 and 1 + √2 hold the same terms. */
function termsOf(tex: string): string[] {
  const text = tex.replace(/\\dfrac/g, '\\frac').replace(/\\left|\\right|\s+/g, '')
  const terms: string[] = []
  let depth = 0
  let from = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '{' || c === '(') depth++
    else if (c === '}' || c === ')') depth--
    else if ((c === '+' || c === '-') && depth === 0 && i > from) {
      terms.push(text.slice(from, i))
      from = i
    }
  }
  terms.push(text.slice(from))
  return terms.map((t) => (t.startsWith('-') || t.startsWith('+') ? t : `+${t}`)).sort()
}

// One way in to every Pure Math tool.
//
// The panel renders its buttons straight from JOBS, so adding a tool means adding an entry here
// and nothing else. Everything below is pure: given the same text it always produces the same
// working, which is what makes it all testable without a browser.

import { math, preprocess, splitArgs } from '../expr'
import { R0, R1, rAbs, rAdd, rEq, rIsNeg, rMul, rSub, rTex, rat, type Rat } from './rat'
import {
  NotPolynomial,
  eAdd,
  eNeg,
  evalAt,
  exprTex,
  exprTexBracketed,
  isConstant,
  mulTerm,
  normalize,
  parseExpr,
  parseFraction,
  parseSummands,
  termTex,
  varTex,
  varsOf,
  type Expr,
  type Summand,
  type Term
} from './mono'
import { pDeg, polyFromExpr } from './poly'
import { factoriseNumberWorking, hcfWorking, lcmWorking } from './integers'
import { hcfAlgebraWorking, lcmAlgebraWorking } from './algebraHcf'
import { factoriseWorking, factorsOf } from './factor'
import { divideWorking } from './divide'
import { partialFractionsWorking } from './partial'
import { complexWorking, factoriseComplexWorking, solveQuadraticWorking } from './complex'
import { Steps, failed, type Working } from './work'

export type JobId =
  | 'factor'
  | 'expand'
  | 'divide'
  | 'partial'
  | 'hcf'
  | 'lcm'
  | 'primes'
  | 'complex'
  | 'solve'
  | 'factorComplex'

export interface JobDef {
  id: JobId
  label: string
  /** One line under the button, in plain words. */
  about: string
  /** Shown in the input box before anything is typed. */
  placeholder: string
  /** A worked example the student can load with one tap, in linear syntax for the engine. */
  example: string
  /**
   * The same example as LaTeX, for the maths field.
   *
   * The two are not interchangeable: writing `example` into the field would render its powers and
   * slashes as literal characters, which is the bracket corruption this pair exists to avoid.
   */
  exampleLatex: string
  /** True when this job takes a list: "12, 18". */
  list?: boolean
}

export const JOBS: JobDef[] = [
  {
    id: 'factor',
    label: 'Factorise',
    about: 'Break an expression into brackets, or a number into primes.',
    placeholder: '6x^2 + 7x - 3',
    example: '6x^2 + 7x - 3',
    exampleLatex: '6x^2+7x-3'
  },
  {
    id: 'expand',
    label: 'Expand',
    about: 'Multiply the brackets out and collect like terms.',
    placeholder: '(2x + 3)(3x - 1)',
    example: '(2x + 3)(3x - 1)',
    exampleLatex: '\\left(2x+3\\right)\\left(3x-1\\right)'
  },
  {
    id: 'divide',
    label: 'Divide',
    about: 'Long division of one expression by another.',
    placeholder: '(x^3 - 6x^2 + 11x - 6)/(x - 1)',
    example: '(x^3 - 6x^2 + 11x - 6)/(x - 1)',
    exampleLatex: '\\frac{x^3-6x^2+11x-6}{x-1}'
  },
  {
    id: 'partial',
    label: 'Partial fractions',
    about: 'Split one fraction into the A/(x−1) + B/(x+2) pieces.',
    placeholder: '(3x + 5)/((x + 1)(x + 2))',
    example: '(3x + 5)/((x + 1)(x + 2))',
    exampleLatex: '\\frac{3x+5}{\\left(x+1\\right)\\left(x+2\\right)}'
  },
  {
    id: 'hcf',
    label: 'HCF',
    about: 'Highest common factor of numbers or expressions.',
    placeholder: '12, 18',
    example: '12, 18, 30',
    exampleLatex: '12,\\ 18,\\ 30',
    list: true
  },
  {
    id: 'lcm',
    label: 'LCM',
    about: 'Lowest common multiple of numbers or expressions.',
    placeholder: '12, 18',
    example: '12, 18, 30',
    exampleLatex: '12,\\ 18,\\ 30',
    list: true
  },
  {
    id: 'primes',
    label: 'Prime factors',
    about: 'Split a whole number into its primes, with the division ladder.',
    placeholder: '360',
    example: '360',
    exampleLatex: '360'
  },
  {
    id: 'complex',
    label: 'Complex',
    about: 'Add, multiply or divide complex numbers, using i² = −1.',
    placeholder: '(2 + 3i)/(1 - i)',
    example: '(2 + 3i)/(1 - i)',
    exampleLatex: '\\frac{2+3i}{1-i}'
  },
  {
    id: 'solve',
    label: 'Solve',
    about: 'Solve a quadratic, real roots or complex ones.',
    placeholder: 'x^2 + 4x + 13 = 0',
    example: 'x^2 + 4x + 13 = 0',
    exampleLatex: 'x^2+4x+13=0'
  },
  {
    id: 'factorComplex',
    label: 'Factorise with i',
    about: 'Factorise all the way down by allowing complex numbers.',
    placeholder: 'x^2 + 4',
    example: 'x^4 - 16',
    exampleLatex: 'x^4-16'
  }
]

export const jobById = (id: JobId): JobDef => JOBS.find((j) => j.id === id) ?? JOBS[0]

/**
 * LaTeX for a linear-syntax source, so it can be written into a maths field.
 *
 * The command bar hands Pure Math linear syntax ("6x^2+7x-3"). MathLive reads whatever it is
 * given as LaTeX, so that has to be converted first or a power turns into a stray bracket on
 * screen. A list ("12, 18") is not one expression; it is passed through as it is.
 */
export function linearToLatex(src: string): string {
  const parts = splitArgs(src)
  const one = (s: string): string => {
    try {
      // mathjs writes a symbol as "{ x}" and implicit products with "~"; both render, neither reads.
      // A command's braces have to stay: stripping them from a lone letter turned \frac{ x}{2}
      // into \fracx{2}, which MathLive shows as an unknown command. Only a brace that follows
      // nothing, an operator or another brace is needless ({x}^{2}), and only the space after a
      // brace goes, along with every space that does not end a command (2\cdot x keeps its one).
      return math
        .parse(preprocess(s.trim()))
        .toTex({ parenthesis: 'auto', implicit: 'hide' })
        .replace(/~/g, '')
        .replace(/\{\s+/g, '{')
        .replace(/(?<![A-Za-z\\}])\{([a-zA-Z])\}/g, '$1')
        .replace(/(?<!\\[a-zA-Z]*)\s+/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    } catch {
      return s.trim()
    }
  }
  // An equation is two expressions; mathjs would read "a = b" as an assignment or refuse it.
  const sides = (s: string): string => s.split('=').map(one).join('=')
  return parts.map(sides).join(',\\ ')
}

const WHOLE = /^-?\d+$/

/** Split "12, 18" into parts, respecting brackets so (x+1)(x+2) stays whole. */
const asList = (src: string): string[] =>
  splitArgs(src)
    .map((p) => p.trim())
    .filter(Boolean)

const signedTerm = (t: Term, first: boolean): string => {
  const body = termTex({ c: rAbs(t.c), v: t.v })
  if (first) return rIsNeg(t.c) ? `-${body}` : body
  return rIsNeg(t.c) ? ` - ${body}` : ` + ${body}`
}

/** Terms written out in the order given, signs joined up, nothing collected. */
const rawSumTex = (terms: Term[]): string => (terms.length ? terms.map((t, i) => signedTerm(t, i === 0)).join('') : '0')

/** The "each times each" grid: a row for every term on the left, a column for every term on the right. */
function distributionTable(left: Expr, right: Expr): string {
  const cols = `c|${'c'.repeat(right.length)}`
  const header = `\\times & ${right.map((t) => termTex(t)).join(' & ')} \\\\ \\hline`
  const rows = left.map((a) => `${termTex(a)} & ${right.map((b) => termTex(mulTerm(a, b))).join(' & ')}`).join(' \\\\ ')
  return `\\begin{array}{${cols}} ${header} ${rows} \\end{array}`
}

/** Like terms gathered into brackets, in the order the collected answer will have them. */
function groupedTex(products: Term[]): string {
  // Ordered like the answer will be, but with every coefficient set to 1 first so that a pair
  // which cancels to nothing (−2x² + 2x²) still keeps its place instead of dropping out.
  const order = normalize(products.map((p) => ({ c: R1, v: p.v })))
  const groups = order.map((o) => products.filter((p) => varTex(p.v) === varTex(o.v)))
  return groups
    .map((g, i) => (g.length === 1 ? signedTerm(g[0], i === 0) : `${i === 0 ? '' : ' + '}\\left(${rawSumTex(g)}\\right)`))
    .join('')
}

const factorTex = (f: Expr): string => (f.length > 1 ? exprTexBracketed(f) : exprTex(f))

/**
 * Expand, with the distribution shown.
 *
 * The old version's two steps both displayed the finished answer, which taught nothing. Now the
 * parsed factors are kept apart, each pair is multiplied through a grid, the products are written
 * out in a line, and only then are the like terms collected — the way it is set out on a board.
 */
function expandWorking(src: string): Working {
  const title = 'Expand'
  let summands: Summand[]
  try {
    summands = parseSummands(src)
  } catch (err) {
    return failed(title, src, err instanceof NotPolynomial ? err.message : 'I could not read that.')
  }
  const s = new Steps()
  const shownOf = (sm: Summand): string => sm.factors.map(factorTex).join('')
  const input = summands.map((sm, i) => `${i === 0 ? (sm.neg ? '-' : '') : sm.neg ? ' - ' : ' + '}${shownOf(sm)}`).join('')
  const several = summands.length > 1

  // Each summand multiplied out on its own; a lone factor is already a sum and passes straight through.
  const pieces: Expr[] = []
  for (const sm of summands) {
    const { factors } = sm
    if (factors.length < 2) {
      pieces.push(sm.neg ? eNeg(factors[0]) : factors[0])
      continue
    }
    const where = several ? `In ${shownOf(sm)}, m` : 'M'
    let acc = factors[0]
    for (let i = 1; i < factors.length; i++) {
      const f = factors[i]
      const products: Term[] = []
      for (const a of acc) for (const b of f) products.push(mulTerm(a, b))
      s.add(
        `${i === 1 ? where : 'Then m'}ultiply every term of ${factorTex(acc)} by every term of ${factorTex(f)}.`,
        distributionTable(acc, f),
        '\\text{each} \\times \\text{each}'
      )
      s.add('Write all the products out in a line.', rawSumTex(products))
      const collected = normalize(products)
      if (collected.length < products.length) {
        s.add('Collect the like terms, and write the highest power first.', `${groupedTex(products)} = ${exprTex(collected)}`, '\\text{like terms: same letters, same powers}')
      } else {
        s.add('No two terms are alike, so just write the highest power first.', exprTex(collected))
      }
      acc = collected
    }
    pieces.push(sm.neg ? eNeg(acc) : acc)
  }
  const whole = pieces.reduce((a, b) => eAdd(a, b), [] as Expr)
  const out = exprTex(whole)

  if (!summands.some((sm) => sm.factors.length >= 2)) {
    // Nothing was distributed: either there are no brackets to multiply, or one bracket is raised
    // to a power too high to write out column by column and its expansion is simply stated.
    const highPower = /\)\s*(\^|²|³)/.test(src)
    s.add(
      highPower
        ? 'A bracket raised to a power that high is written out directly rather than multiplied column by column.'
        : 'There is nothing to multiply out here, so collect the like terms and write the highest power first.',
      out
    )
    return { title, input, moves: s.moves, answers: [{ label: 'Answer', tex: out }], check: 'No brackets were multiplied step by step, so there is nothing to check.' }
  }

  if (several) {
    const joined = pieces.map((p, i) => `${i === 0 ? '' : ' + '}\\left(${exprTex(p)}\\right)`).join('')
    s.add('Add the pieces together, and collect the like terms once more.', `${joined} = ${out}`, '\\text{like terms: same letters, same powers}')
  }

  // Check by substituting a value: the brackets and the answer must give the same number.
  const vars = varsOf(whole)
  const at: Record<string, Rat> = {}
  vars.forEach((v, i) => (at[v] = rat(2 + i)))
  let ok = true
  let viaBrackets = R0
  let viaAnswer = R0
  try {
    for (const sm of summands) {
      const product = sm.factors.reduce((p, f) => rMul(p, evalAt(f, at)), R1)
      viaBrackets = sm.neg ? rSub(viaBrackets, product) : rAdd(viaBrackets, product)
    }
    viaAnswer = evalAt(whole, at)
    ok = rEq(viaBrackets, viaAnswer)
  } catch {
    ok = false
  }
  const atText = vars.map((v) => `${v} = ${rTex(at[v])}`).join(', ')
  return {
    title,
    input,
    moves: s.moves,
    answers: [{ label: 'Answer', tex: out }],
    check: ok
      ? vars.length
        ? `With ${atText}, the brackets come to ${rTex(viaBrackets)} and the answer also comes to ${rTex(viaAnswer)}.`
        : `Both the brackets and the answer come to ${rTex(viaAnswer)}.`
      : 'Careful: the brackets and the answer give different numbers. Treat this answer with suspicion.',
    checked: ok ? 'ok' : 'failed'
  }
}

export function runPure(job: JobId, input: string): Working {
  const src = input.trim()
  if (!src) return failed(jobById(job).label, '', 'Type something to work on first.')

  switch (job) {
    case 'primes':
      return WHOLE.test(src)
        ? factoriseNumberWorking(BigInt(src))
        : failed('Prime factors', src, 'Prime factors need a whole number, like 360.')

    case 'factor': {
      // A bare number means primes; anything with a letter means brackets.
      if (WHOLE.test(src)) return factoriseNumberWorking(BigInt(src))
      try {
        const e = parseExpr(src)
        if (isConstant(e)) {
          const v = e[0]?.c
          if (v && v.d === 1n) return factoriseNumberWorking(v.n)
        }
        if (varsOf(e).includes('i')) return factoriseComplexWorking(src)
      } catch {
        // Fall through: factoriseWorking reports the reason properly.
      }
      return factoriseWorking(src)
    }

    case 'expand':
      return expandWorking(src)

    case 'divide':
      return divideWorking(src)

    case 'partial':
      return partialFractionsWorking(src)

    case 'hcf': {
      const parts = asList(src)
      if (parts.length >= 2 && parts.every((p) => WHOLE.test(p))) return hcfWorking(parts.map((p) => BigInt(p)))
      return hcfAlgebraWorking(parts)
    }

    case 'lcm': {
      const parts = asList(src)
      if (parts.length >= 2 && parts.every((p) => WHOLE.test(p))) return lcmWorking(parts.map((p) => BigInt(p)))
      return lcmAlgebraWorking(parts)
    }

    case 'complex':
      return complexWorking(src)

    case 'solve':
      return solveQuadraticWorking(src)

    case 'factorComplex':
      return factoriseComplexWorking(src)

    default:
      return failed('Pure Math', src, 'I do not know that job.')
  }
}

/**
 * The job that best fits what has been typed, so one button can do the obvious thing.
 * Deliberately simple and predictable — a student should be able to guess what it will pick.
 */
export function suggestJob(src: string): JobId {
  const s = src.trim()
  if (!s) return 'factor'
  if (WHOLE.test(s)) return 'primes'
  if (s.includes(',')) return 'hcf'
  if (/(^|[^a-zA-Z])i([^a-zA-Z]|$)/.test(s)) return 'complex'
  if (s.includes('=')) return 'solve'
  if (s.includes('/')) return fractionJob(s)
  // A quadratic with no real roots is exactly what "Factorise with i" is for; sending it to the
  // real factoriser would only produce "does not break into simpler factors".
  return isIrreducibleQuadratic(s) ? 'factorComplex' : 'factor'
}

/**
 * Partial fractions when the bottom breaks into more than one factor, otherwise long division.
 *
 * The bottom is actually factorised to decide: 1/(x² − 4) has no visible bracket pair, but its
 * bottom is (x − 2)(x + 2), and a student typing it wants it split. Anything that cannot be read
 * falls back to looking for a bracket pair or a square, as before.
 */
function fractionJob(s: string): JobId {
  try {
    const { den } = parseFraction(s)
    if (isConstant(den)) return 'factor'
    const pieces = factorsOf(den).filter((p) => !isConstant(p))
    return pieces.length >= 2 ? 'partial' : 'divide'
  } catch {
    const bottom = s.slice(s.indexOf('/') + 1)
    return /\)\s*\(/.test(bottom) || /\^\s*2/.test(bottom) ? 'partial' : 'divide'
  }
}

function isIrreducibleQuadratic(s: string): boolean {
  try {
    const e = parseExpr(s)
    if (varsOf(e).length !== 1) return false
    const { poly } = polyFromExpr(e)
    if (pDeg(poly) !== 2) return false
    const [c, b, a] = [poly[0] ?? R0, poly[1] ?? R0, poly[2]]
    return rIsNeg(rSub(rMul(b, b), rMul(rat(4n), rMul(a, c))))
  } catch {
    return false
  }
}

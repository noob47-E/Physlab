// G3b: the scoreboard's judge. An engine's answer is marked against the QUESTION by G2's sound checkers
// (src/renderer/src/math/check), never by comparing text with the key: 'right' is a proof, 'wrong' is a proof (or a
// clear numeric witness), and anything the checkers cannot decide is 'unverified' — counted apart, never as right.
// A right answer must also be in the form the job asks for (expanded, fully factorised over ℚ, in lowest terms).
// The key is used once more after a 'right': if the answer disagrees with it, the checker and the key cannot both be
// right, and the item is marked wrong for a person to look at (docs/knowledge/scoreboard.md).

import {
  derivativeCheck,
  expressionEqual,
  factorCheck,
  linearSystemCheck,
  partialFractionsCheck,
  polyEqual,
  polyRootsCheck,
  rationalEqual,
  type LinearAnswer,
  type Verdict
} from '../../../src/renderer/src/math/check/checkers'
import { plainVars, readExact } from '../../../src/renderer/src/math/check/parse'
import { squarefree } from '../../../src/renderer/src/math/check/realroots'
import { parseFraction, parseSummands } from '../../../src/renderer/src/math/pure/mono'
import { pDeg, pGcd, polyFromExpr } from '../../../src/renderer/src/math/pure/poly'
import { rStr } from '../../../src/renderer/src/math/pure/rat'
import type { EngineResult } from '../../../src/renderer/src/math/engine/types'

export type Mark = 'right' | 'wrong' | 'unverified'
export interface Judgement {
  mark: Mark
  /** Why, in a few words: the checker's verdict, or the form that was missing. */
  why: string
}
interface JudgeItem {
  class: string
  question: string
  answer: string
}

/**
 * A whole number of more than 15 digits as an exact sum of 15-digit pieces: 2999999999999999999999960 becomes
 * (2999999999*10^15 + 999999999999960). It is the same number; the shared reader refuses the long spelling, because
 * a double would change it.
 */
export function exactDigits(text: string): string {
  return text.replace(/(?<![\d.])\d{16,}(?![\d.])/g, (digits) => {
    const pieces: string[] = []
    for (let end = digits.length; end > 0; end -= 15) pieces.unshift(digits.slice(Math.max(0, end - 15), end))
    const terms = pieces.map((p, i) => {
      const value = p.replace(/^0+(?=\d)/, '')
      const power = 15 * (pieces.length - 1 - i)
      return power ? `${value}*10^${power}` : value
    })
    return `(${terms.join(' + ')})`
  })
}

const fromVerdict = (v: Verdict, what: string): Judgement =>
  v === 'equal' ? { mark: 'right', why: what } : v === 'different' ? { mark: 'wrong', why: `${what}: different` } : { mark: 'unverified', why: `${what}: unknown` }

/** Written out: no bracket of a sum left in any summand, and each power once (like terms combined). */
function isExpanded(answer: string): boolean {
  try {
    const seen = new Set<string>()
    for (const s of parseSummands(answer)) {
      if (!s.factors.every((f) => f.length <= 1)) return false
      const powers: Record<string, number> = {}
      for (const f of s.factors) for (const t of f) for (const [v, k] of Object.entries(t.v)) powers[v] = (powers[v] ?? 0) + k
      const key = Object.keys(powers)
        .filter((v) => powers[v])
        .sort()
        .map((v) => `${v}^${powers[v]}`)
        .join('*')
      if (seen.has(key)) return false
      seen.add(key)
    }
    return true
  } catch {
    return false
  }
}

/**
 * The factors as the key writes them, once the content is off: primitive, with whole-number coefficients and a
 * positive leading coefficient. So −2·(−x − 1) or 2/3·(9x + 9) is not a factorisation of 2x + 2 in that form.
 */
function primitiveFactors(factors: string): boolean {
  try {
    // Behind a 1·, so a lone bracket stays one factor: parseSummands sees through an outer bracket to its sum.
    const summands = parseSummands(`1*${factors}`)
    if (summands.length !== 1 || summands[0].neg) return false
    return summands[0].factors.every((f) => {
      if (f.some((t) => t.c.d !== 1n)) return false
      const g = f.reduce((acc, t) => gcd(acc, t.c.n < 0n ? -t.c.n : t.c.n), 0n)
      const degree = (t: (typeof f)[number]): number => Object.values(t.v).reduce((a, b) => a + b, 0)
      const lead = f.reduce((best, t) => (degree(t) > degree(best) ? t : best), f[0])
      return g === 1n && lead.c.n > 0n
    })
  } catch {
    return false
  }
}
const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b))

/** The key's expression, without "; excluded: …". */
const keyExpression = (key: string): string => key.split(';')[0].trim()

/** After a 'right', the key must agree; if it does not, the checker or the key is wrong and a person must look. */
function againstKey(j: Judgement, answer: string, key: string): Judgement {
  if (j.mark !== 'right' || !key) return j
  if (expressionEqual(answer, exactDigits(keyExpression(key))) === 'different') return { mark: 'wrong', why: `${j.why}, but the key differs: checker or key is wrong` }
  return j
}

/** p(x) from "p(x) = 0", as plain text with its repeated factors taken out, so each root counts once. */
function squarefreeText(equation: string): string | null {
  try {
    const { rf, atoms } = readExact(equation.replace(/=\s*0\s*$/, ''))
    if (atoms.length || rf.den.some((t) => Object.keys(t.v).length)) return null
    const p = squarefree(polyFromExpr(rf.num, 'x').poly)
    return p.map((c, i) => `(${rStr(c)})*x^${i}`).join(' + ')
  } catch {
    return null
  }
}

const hasI = (t: string): boolean => /(?<![A-Za-z_\d])i(?![A-Za-z_\d])/.test(t)
/** i however an engine writes it: a capital I alone is i. */
const lowerI = (t: string): string => t.replace(/(?<![A-Za-z_\d])I(?![A-Za-z_\d])/g, 'i')

function judgeRoots(item: JudgeItem, result: EngineResult): Judgement {
  const p = squarefreeText(exactDigits(item.question))
  if (!p) return { mark: 'unverified', why: 'the equation is not a polynomial with rational coefficients' }
  const given = (result.solutions ?? []).map((s) => s.x?.text).filter((t): t is string => typeof t === 'string').map((t) => exactDigits(lowerI(t)))
  if (given.length !== (result.solutions ?? []).length) return { mark: 'unverified', why: 'a solution has no x' }
  // The real roots, judged on the real line (G00 §6.3): exactly the distinct real roots.
  const real = fromVerdict(polyRootsCheck(p, given.filter((g) => !hasI(g)).map((value) => ({ value, multiplicity: 1 })), 'real'), 'real roots')
  if (real.mark !== 'right') return real
  // Complex roots, where given (SymPy lists them; Giac only when there is no real root), must all be right too.
  if (given.some(hasI)) return fromVerdict(polyRootsCheck(p, given.map((value) => ({ value, multiplicity: 1 })), 'complex'), 'real and complex roots')
  return real
}

function judgeSystem(item: JudgeItem, result: EngineResult): Judgement {
  const eqs = item.question.split(',').map((s) => exactDigits(s.trim()))
  const sols = result.solutions ?? []
  let answer: LinearAnswer
  if (sols.length === 0) answer = { kind: 'none' }
  else if (sols.length > 1) return { mark: 'unverified', why: 'more than one solution listed' }
  else {
    const values = Object.fromEntries(Object.entries(sols[0]).map(([k, v]) => [k, exactDigits(v.text)]))
    // A family when a value holds a letter of its own, read exactly: 1e3 is a number, _1 is a parameter.
    const free = Object.values(values).some((t) => {
      try {
        const { rf } = readExact(t)
        return plainVars(rf.num).length + plainVars(rf.den).length > 0
      } catch {
        return /[A-Za-z_]/.test(t)
      }
    })
    answer = { kind: free ? 'infinite' : 'unique', values }
  }
  return fromVerdict(linearSystemCheck(eqs, answer), `linear system (${answer.kind})`)
}

/** A number alone: digits, a fraction, or an exactDigits bracket — no letter. */
const NUMBER = String.raw`(?:\([^A-Za-z]*\)|[\d.]+(?:/[\d.]+)?)`

/**
 * A factorisation's numeric content taken off both sides, so the factors can be checked as factors: −(2x + 3)(3x − 1)/N
 * factorises q exactly when (2x + 3)(3x − 1) factorises −N·q. The content may be a leading minus, a number in front,
 * or a number the whole product is divided by, as the engines write a content of 1/(5·10¹⁸). Each step is exact.
 */
function withoutContent(q: string, a: string): { question: string; factors: string } {
  let question = q
  let factors = a.trim()
  const divided = factors.match(new RegExp(String.raw`^(.*\S)\s*/\s*(${NUMBER})$`))
  if (divided) {
    question = `(${question})*(${divided[2]})`
    factors = divided[1].trim()
  }
  if (factors.startsWith('-')) {
    question = `-(${question})`
    factors = factors.slice(1).trim()
  }
  const front = factors.match(new RegExp(String.raw`^(${NUMBER})\s*\*\s*(.+)$`))
  if (front) {
    question = `(${question})/(${front[1]})`
    factors = front[2]
  }
  return { question, factors }
}

/** Lowest terms: the top and bottom of the answer share no factor in x. */
function inLowestTerms(answer: string): boolean | null {
  try {
    const { num, den } = parseFraction(answer)
    return pDeg(pGcd(polyFromExpr(num, 'x').poly, polyFromExpr(den, 'x').poly)) === 0
  } catch {
    return null
  }
}

export function judgeAnswer(item: JudgeItem, result: EngineResult): Judgement {
  const q = exactDigits(item.question)
  const a = exactDigits(result.text ?? '')
  switch (item.class) {
    case 'expand': {
      const j = fromVerdict(polyEqual(q, a), 'expand')
      if (j.mark === 'right' && !isExpanded(a)) return { mark: 'wrong', why: 'equal, but not expanded' }
      return againstKey(j, a, item.answer)
    }
    case 'factor over Q': {
      const { question, factors } = withoutContent(q, a)
      const f = factorCheck(question, factors)
      const j = fromVerdict(f.verdict, 'factor')
      if (j.mark !== 'right') return j
      if (f.irreducibleOverQ.some((x) => x === false)) return { mark: 'wrong', why: 'a factor factorises further over ℚ' }
      if (!primitiveFactors(factors)) return { mark: 'wrong', why: 'factors not primitive with a positive leading coefficient' }
      if (f.irreducibleOverQ.some((x) => x === 'unknown')) return { mark: 'unverified', why: 'a factor’s irreducibility is not decided' }
      return againstKey(j, a, item.answer)
    }
    case 'polynomial equations':
      return judgeRoots(item, result)
    case 'linear systems':
      return judgeSystem(item, result)
    case 'rational simplification': {
      const j = fromVerdict(rationalEqual(q, a).verdict, 'simplify')
      if (j.mark !== 'right') return j
      const lowest = inLowestTerms(a)
      if (lowest === false) return { mark: 'wrong', why: 'equal, but not in lowest terms' }
      if (lowest === null) return { mark: 'unverified', why: 'equal, but its lowest terms cannot be read' }
      return againstKey(j, a, item.answer)
    }
    case 'derivatives':
      return againstKey(fromVerdict(derivativeCheck(q, 'x', a), 'derivative'), a, item.answer)
    case 'partial fractions':
      return againstKey(fromVerdict(partialFractionsCheck(q, a), 'partial fractions'), a, item.answer)
  }
  return { mark: 'unverified', why: `no judge for the class ${item.class}` }
}

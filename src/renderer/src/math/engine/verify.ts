// G4: the one place an engine's answer is proved before a student sees it (and the scoreboard's judge marks it,
// tests/engine/scoreboard/judge.ts). Each scoreboard class has its G2 checker (math/check) and its form: written out
// for expand, factors irreducible over ℚ and primitive for factor, one fraction in lowest terms for simplify, standard
// partial fractions. 'right' is a proof; 'wrong' a proof or a clear numeric witness; 'unverified' everything else.
// docs/knowledge/scoreboard.md.

import {
  derivativeCheck,
  factorCheck,
  linearSystemCheck,
  partialFractionsCheck,
  polyEqual,
  polyRootsCheck,
  rationalEqual,
  type LinearAnswer,
  type Verdict
} from '../check/checkers'
import { plainVars, readExact } from '../check/parse'
import { squarefree } from '../check/realroots'
import { parseFraction, parseSummands } from '../pure/mono'
import { pDeg, pGcd, polyFromExpr } from '../pure/poly'
import { rStr } from '../pure/rat'
import { POLYNOMIAL_EQUATION_ROOTS } from './semantics'
import type { EngineRequest, EngineResult } from './types'

/** The scoreboard's seven classes (tests/engine/scoreboard). */
export const ENGINE_CLASSES = ['expand', 'factor over Q', 'polynomial equations', 'linear systems', 'rational simplification', 'derivatives', 'partial fractions'] as const
export type EngineClass = (typeof ENGINE_CLASSES)[number]

export type Mark = 'right' | 'wrong' | 'unverified'
export interface Judgement {
  mark: Mark
  /** Why, in a few words: the checker's verdict, or the form that was missing. */
  why: string
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

const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b))

/**
 * The factors in the usual form, once the content is off: primitive, with whole-number coefficients and a positive
 * leading coefficient. So −2·(−x − 1) or 2/3·(9x + 9) is not that form of 2x + 2.
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
      // A factor in several letters has no one leading term (−(a − b²) or (b² − a)?): only its content is judged there.
      const letters = new Set(f.flatMap((t) => Object.keys(t.v).filter((n) => t.v[n] !== 0)))
      return g === 1n && (letters.size > 1 || lead.c.n > 0n)
    })
  } catch {
    return false
  }
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

/** p(x) from "p(x) = 0", as plain text with its repeated factors taken out, so each root counts once. */
function squarefreeText(equation: string, x: string): string | null {
  try {
    const { rf, atoms } = readExact(equation.replace(/=\s*0\s*$/, ''))
    if (atoms.length || rf.den.some((t) => Object.keys(t.v).length)) return null
    const p = squarefree(polyFromExpr(rf.num, x).poly)
    return p.map((c, i) => `(${rStr(c)})*${x}^${i}`).join(' + ')
  } catch {
    return null
  }
}

const hasI = (t: string): boolean => /(?<![A-Za-z_\d])i(?![A-Za-z_\d])/.test(t)
/** i however an engine writes it: a capital I alone is i. */
const lowerI = (t: string): string => t.replace(/(?<![A-Za-z_\d])I(?![A-Za-z_\d])/g, 'i')

/** The one equation's polynomial, moved to one side: "x^3 = x" is x^3 − (x) = 0. */
const oneSide = (eq: string): string => {
  const [l, r] = eq.split(/(?<![<>=!])=(?!=)/)
  return r === undefined ? l : `${l} - (${r})`
}

function verifyRoots(req: EngineRequest, result: EngineResult): Judgement {
  const x = req.vars?.[0] ?? 'x'
  const p = squarefreeText(exactDigits(oneSide(req.eqs?.[0] ?? '')), x)
  if (!p) return { mark: 'unverified', why: 'the equation is not a polynomial with rational coefficients' }
  const sols = result.solutions ?? []
  const given = sols.map((s) => s[x]?.text).filter((t): t is string => typeof t === 'string').map((t) => exactDigits(lowerI(t)))
  if (given.length !== sols.length) return { mark: 'unverified', why: `a solution has no ${x}` }
  // Every root (G00 §6.3, the owner's G3b-1): exactly the distinct roots over ℂ of the squarefree polynomial, so the
  // real roots alone, when there are complex ones too, are wrong. Each root counts once, as both engines list it.
  return fromVerdict(polyRootsCheck(p, given.map((value) => ({ value, multiplicity: 1 })), POLYNOMIAL_EQUATION_ROOTS), given.some(hasI) ? 'real and complex roots' : 'roots')
}

function verifySystem(req: EngineRequest, result: EngineResult): Judgement {
  const eqs = (req.eqs ?? []).map(exactDigits)
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

/** Lowest terms: the top and bottom of the answer share no factor in x. */
function inLowestTerms(answer: string, x: string): boolean | null {
  try {
    const { num, den } = parseFraction(answer)
    return pDeg(pGcd(polyFromExpr(num, x).poly, polyFromExpr(den, x).poly)) === 0
  } catch {
    return null
  }
}

/** The one variable of a one-variable expression, or x. */
function variableOf(expr: string): string {
  try {
    const { rf } = readExact(expr)
    return [...plainVars(rf.num), ...plainVars(rf.den)][0] ?? 'x'
  } catch {
    return 'x'
  }
}

/** Whether the engine's answer to `req` is proved right for its class (see the top of this file). */
export function verifyAnswer(cls: EngineClass, req: EngineRequest, result: EngineResult): Judgement {
  // An answer that came with an error is not an answer, whatever text it carries.
  if (result.error) return { mark: 'unverified', why: `the engine said: ${result.error}` }
  const q = exactDigits(req.expr ?? '')
  const a = exactDigits(result.text ?? '')
  switch (cls) {
    case 'expand': {
      const j = fromVerdict(polyEqual(q, a), 'expand')
      return j.mark === 'right' && !isExpanded(a) ? { mark: 'wrong', why: 'equal, but not expanded' } : j
    }
    case 'factor over Q': {
      const { question, factors } = withoutContent(q, a)
      const f = factorCheck(question, factors)
      const j = fromVerdict(f.verdict, 'factor')
      if (j.mark !== 'right') return j
      if (f.irreducibleOverQ.some((x) => x === false)) return { mark: 'wrong', why: 'a factor factorises further over ℚ' }
      if (!primitiveFactors(factors)) return { mark: 'wrong', why: 'factors not primitive with a positive leading coefficient' }
      if (f.irreducibleOverQ.some((x) => x === 'unknown')) return { mark: 'unverified', why: 'a factor’s irreducibility is not decided' }
      return j
    }
    case 'polynomial equations':
      return verifyRoots(req, result)
    case 'linear systems':
      return verifySystem(req, result)
    case 'rational simplification': {
      const j = fromVerdict(rationalEqual(q, a).verdict, 'simplify')
      if (j.mark !== 'right') return j
      const lowest = inLowestTerms(a, variableOf(q))
      if (lowest === false) return { mark: 'wrong', why: 'equal, but not in lowest terms' }
      if (lowest === null) return { mark: 'unverified', why: 'equal, but its lowest terms cannot be read' }
      return j
    }
    case 'derivatives':
      return fromVerdict(derivativeCheck(q, req.var ?? 'x', a), 'derivative')
    case 'partial fractions':
      return fromVerdict(partialFractionsCheck(q, a), 'partial fractions')
  }
}

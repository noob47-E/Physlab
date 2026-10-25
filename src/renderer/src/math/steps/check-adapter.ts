// The check adapter: all step validators call answer checkers through this ONE file.
//
// Part of the PhysLab step engine (S0), tightened by P-FIX-S0SOUND, the review of a982a6a4 and the review of
// 1aa6b998 (delta2 and final2). Checkers (part G2, math/check/) are being built by Jules and the Pro. Until
// G2 merges, this adapter uses a minimal exact path over BigInt rationals for polynomial equality.
// Everything else returns 'unknown' so nothing unproved is ever shown on screen.

import type { MathNode } from 'mathjs'
import { create, all } from 'mathjs'
import {
  parseExpr,
  eEq,
  eAdd,
  eSub,
  eMul,
  ePow,
  exprDegree,
  varsOf,
  normalize,
  constExpr,
  writeTimes,
  eNeg,
  evalAt,
  type Expr,
  type Term
} from '../pure/mono'
import { rat, rCmp, rEq, rMul, rIsZero, rDiv, rAdd, rSub, rNeg, rIsNeg, rAbs, rSqrt, rPow, bgcd, blcm, rStr, R0, R1, rTex, type Rat } from '../pure/rat'
import {
  findRationalRootDetailed,
  pDeg,
  pDivMod,
  pIsZero,
  pLead,
  pMul,
  pTrim,
  polyFromExpr,
  type Poly
} from '../pure/poly'
import { latexToMath } from '../latexToMath'
import { preprocess } from '../expr'
import type { EquationOp, ExprOp, ScalePurpose, SystemOp, ValidationVerdict } from './types'
// S5c: trig equations are checked by numbers at sample angles (trigRoots.ts), never taken from the method.
import { checkListedRoots, checkTrigMove } from './trigRoots'
// TRIGGEN: a trig value that is not a table value is checked by its own exact rules (trigInverse.ts).
import { checkTrigInverseMove } from './trigInverse'
// S1b: the sound checkers of G2 (math/check) decide what the exact fallback above cannot: surds, complex roots, and
// expressions outside the polynomial ring. Each is reached only through the functions below, never directly by a step.
import { plainVars, readAlg, readExact, rfMul, rfSame, type RF } from '../check/parse'
import { algAdd, algEq, algIsRational, algMul, algRat, algSub, type Alg as G2Alg } from '../check/field'
import {
  derivativeCheck,
  expressionEqual,
  integralCheck,
  partialFractionsCheck,
  polyRootsCheck,
  rationalEqual,
  type Verdict as G2Verdict
} from '../check/checkers'
// Part R: a square root of the letter is read and checked by radicalForm.ts (the polynomial reader above refuses a root).
import { radicalCheckOp, radicalCheckSquare, radicalVarOf } from './radicalForm'
import { checkExpRootOp, checkLogImplication, hasExpAtom } from './expRoots'
// S3 (substitution): an exponential equation that is a quadratic in a power, u = a^x, is checked by expSubst.ts.
import { checkExpSubstituteOp } from './expSubst'

// ============================================================================
// G2 CHECKER SWAP POINT
//
// When math/check/ (part G2) merges:
// 1. Import the sound checkers from math/check/ (polynomials, rationals,
//    derivatives, integrals, linear systems, etc.).
// 2. Delegate to the sound G2 checkers inside the adapter functions below.
// 3. Keep the exact fallback returning 'unknown' for unsupported classes.
// ============================================================================

export interface CheckAdapter {
  checkExprEq: (before: string | MathNode, after: string | MathNode) => ValidationVerdict
  checkEquationEquiv: (before: string | MathNode, after: string | MathNode, variable?: string) => ValidationVerdict
  checkImplication: (before: string | MathNode, after: string | MathNode, rule?: string, data?: unknown) => ValidationVerdict
  checkCaseSplitComplete: (domainOrCondition: unknown, cases: unknown[]) => ValidationVerdict
  checkSolutionSetEq: (
    equationOrSet: unknown,
    proposedSolutions: unknown[],
    variable?: string,
    domain?: 'real' | 'complex'
  ) => ValidationVerdict
}

/** Convert a string or MathNode into a clean plain text formula string. */
export function stringifyNodeOrText(input: string | MathNode): string {
  let text = typeof input === 'string'
    ? input.trim()
    : (() => {
        try {
          return input.toString().trim()
        } catch {
          return ''
        }
      })()

  // Handle LaTeX fractions or tokens like \frac{a}{b}
  if (text.includes('\\')) {
    try {
      text = latexToMath(text)
    } catch {
      // Keep original text on failure
    }
  }

  return text
}

/** Try to parse an expression into a polynomial Expr over BigInt rationals. Returns null on failure. */
export function tryParsePoly(input: string | MathNode): Expr | null {
  const text = stringifyNodeOrText(input)
  if (!text) return null
  if (!literalsWithinLimit(text)) return null
  try {
    return parseExpr(text)
  } catch {
    return null
  }
}

/** Parse an equation into left and right expressions: "L = R". Returns null if not an equation. */
export function splitEquation(input: string | MathNode): { left: string; right: string } | null {
  const text = stringifyNodeOrText(input)
  const eqIdx = text.indexOf('=')
  if (eqIdx === -1) return null
  return {
    left: text.slice(0, eqIdx).trim(),
    right: text.slice(eqIdx + 1).trim()
  }
}

/** Get the difference polynomial D = L - R for an equation L = R. */
export function tryEquationPoly(input: string | MathNode): Expr | null {
  const split = splitEquation(input)
  if (!split) return null
  const left = tryParsePoly(split.left)
  const right = tryParsePoly(split.right)
  if (!left || !right) return null
  return eSub(left, right)
}

/** Check if two polynomials are proportional by a non-zero rational scalar: B = k * A with k != 0. */
export function arePolysProportional(a: Expr, b: Expr): boolean {
  if (a.length === 0 && b.length === 0) return true
  if (a.length === 0 || b.length === 0) return false
  if (a.length !== b.length) return false

  // Ratio of leading terms
  const k = rDiv(b[0].c, a[0].c)
  if (rIsZero(k)) return false

  for (let i = 0; i < a.length; i++) {
    // Variable powers must match exactly
    const av = a[i].v
    const bv = b[i].v
    const aKeys = Object.keys(av).filter((key) => av[key] !== 0).sort()
    const bKeys = Object.keys(bv).filter((key) => bv[key] !== 0).sort()
    if (aKeys.length !== bKeys.length) return false
    for (let j = 0; j < aKeys.length; j++) {
      if (aKeys[j] !== bKeys[j] || av[aKeys[j]] !== bv[bKeys[j]]) return false
    }
    // Coefficient must match scaled by k
    if (!rEq(b[i].c, rMul(a[i].c, k))) return false
  }

  return true
}

interface ParsedIneq {
  v: string
  op: '>=' | '<=' | '>' | '<' | '='
  cut: string
  cutPoly: Expr | null
}

function parseIneq(s: string): ParsedIneq | null {
  const norm = s.trim()
  const m = norm.match(/^([a-zA-Z_\\][a-zA-Z0-9_\\]*|\w+)\s*(>=|<=|≥|≤|>|<|==|=)\s*(.+)$/)
  if (!m) return null
  const v = m[1].trim()
  let rawOp = m[2].trim()
  if (rawOp === '≥') rawOp = '>='
  if (rawOp === '≤') rawOp = '<='
  if (rawOp === '==') rawOp = '='
  const op = rawOp as '>=' | '<=' | '>' | '<' | '='
  const cut = m[3].trim()
  const cutPoly = tryParsePoly(cut)
  return { v, op, cut, cutPoly }
}

function cutsEqual(a: ParsedIneq, b: ParsedIneq): boolean {
  if (a.cutPoly && b.cutPoly) {
    return eEq(a.cutPoly, b.cutPoly)
  }
  return a.cut === b.cut
}

function checkCalculusExprEq(before: string, after: string): ValidationVerdict | null {
  const normBefore = before.trim()
  const normAfter = after.trim()

  const diffMatch = /^diff\((.+),\s*([a-zA-Z])\)$/.exec(normBefore)
  if (diffMatch) {
    const f = diffMatch[1].trim()
    const x = diffMatch[2].trim()
    const verdict = derivativeCheck(f, x, normAfter)
    if (verdict === 'equal') return 'valid'
    if (verdict === 'different') return 'invalid'
  }

  const intMatch = /^(?:integrate|integral)\((.+),\s*([a-zA-Z])\)$/.exec(normBefore)
  if (intMatch) {
    const f = intMatch[1].trim()
    const x = intMatch[2].trim()
    const verdict = integralCheck(f, x, normAfter)
    if (verdict === 'equal') return 'valid'
    if (verdict === 'different') return 'invalid'
  }

  const partMatch = /^partial\((.+)\)$/.exec(normBefore)
  if (partMatch) {
    const f = partMatch[1].trim()
    const verdict = partialFractionsCheck(f, normAfter)
    if (verdict === 'equal') return 'valid'
    if (verdict === 'different') return 'invalid'
  }

  return null
}

/**
 * Default check adapter implementation using exact polynomial arithmetic.
 */
export const defaultCheckAdapter: CheckAdapter = {

  /**
   * ExprEq: verifies that 'after' equals 'before' as expressions.
   * Compares UNSIMPLIFIED ASTs through exact polynomial representation over BigInt rationals.
   */
  checkExprEq(before: string | MathNode, after: string | MathNode): ValidationVerdict {
    const sBefore = stringifyNodeOrText(before)
    const sAfter = stringifyNodeOrText(after)
    if (sBefore === sAfter) return 'valid'

    const pBefore = tryParsePoly(before)
    const pAfter = tryParsePoly(after)

    if (pBefore && pAfter) {
      return eEq(pBefore, pAfter) ? 'valid' : 'invalid'
    }

    const calc = checkCalculusExprEq(sBefore, sAfter)
    if (calc !== null) return calc

    // Outside the polynomial ring: G2 decides it when both sides are plain text it reads exactly (S1b).
    const g2 = expressionEqualG2(sBefore, sAfter)
    if (g2 === 'valid') return 'valid'

    if (normalizeDisplayed(sBefore) === normalizeDisplayed(sAfter)) return 'valid'
    return g2
  },

  /**
   * EquationEquiv (the generic check, used by checkImplication): verifies that two equations have the exact
   * same solution set. The declared moves are checked by checkEquationOp below.
   */
  checkEquationEquiv(before: string | MathNode, after: string | MathNode): ValidationVerdict {
    const sBefore = stringifyNodeOrText(before)
    const sAfter = stringifyNodeOrText(after)
    if (sBefore === sAfter) return 'valid'

    const pBefore = tryEquationPoly(before)
    const pAfter = tryEquationPoly(after)

    if (pBefore && pAfter) {
      if (arePolysProportional(pBefore, pAfter)) {
        return 'valid'
      }

      const vBefore = varsOf(pBefore)
      const vAfter = varsOf(pAfter)
      const degBefore = exprDegree(pBefore)
      const degAfter = exprDegree(pAfter)

      // Strictly linear equations in the same single variable:
      // a1*x + b1 = 0 and a2*x + b2 = 0 are equivalent iff proportional.
      // If not proportional, their single roots strictly differ.
      if (
        degBefore === 1 &&
        degAfter === 1 &&
        vBefore.length === 1 &&
        vAfter.length === 1 &&
        vBefore[0] === vAfter[0]
      ) {
        return 'invalid'
      }

      // If one is constant nonzero (no solutions) and the other is linear (1 solution):
      if (
        (degBefore === 0 && degAfter === 1 && vAfter.length === 1) ||
        (degAfter === 0 && degBefore === 1 && vBefore.length === 1)
      ) {
        return 'invalid'
      }

      // For degree > 1 or multiple variables, polynomials can share the same solution set
      // without being proportional (e.g. root multiplicity (x-1)^2 = 0 vs x-1 = 0, or x^2+1 = 0 vs x^4+1 = 0).
      // Returning 'unknown' for anything unproved is required per Rule 0.2.
      return 'unknown'
    }

    return 'unknown'
  },

  /**
   * Implication: verifies that before => after (forward deduction only).
   * For squaring both sides, multiplying by a factor that may be 0, etc.
   */
  checkImplication(
    before: string | MathNode,
    after: string | MathNode,
    _rule?: string,
    data?: unknown
  ): ValidationVerdict {
    // The move the step declares (data.action) is the move checked, and the only one: the words "Square both sides"
    // are shown only when the after is the before squared, however equivalent the two equations are (P-FIX-S1SOUND2
    // MUST 4). An action this cannot check is unknown.
    // The quadratic formula with its numbers put in is checked by its own exact rule: the polynomial path below cannot
    // read the ± of the formula line.
    if (data && typeof data === 'object' && (data as Record<string, unknown>).action === 'quadratic-formula') {
      return checkQuadraticFormulaStep(before, after)
    }
    const payload = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
    // The exclusions of a rational equation say what the letter cannot be; the equation itself does not move (before = after).
    if (payload.action === 'exclude') return checkRationalExclusion(before, after, payload)
    // A logarithm sum: its domain step and its join step (expRoots.ts). Each is exact, or unknown.
    if (payload.action === 'log-domain' || payload.action === 'join-logs') {
      return checkLogImplication(stringifyNodeOrText(before), stringifyNodeOrText(after), payload) ?? 'unknown'
    }
    const eq1 = splitEquation(stringifyNodeOrText(before))
    const eq2 = splitEquation(stringifyNodeOrText(after))
    if (!eq1 || !eq2) return 'unknown'
    // Part R: squaring an equation with a square root of the letter is checked by radicalForm.ts (sqrt(P) squared is P).
    if (payload.action === 'square') {
      const rootVar = radicalVarOf(stringifyNodeOrText(before))
      if (rootVar !== null) return radicalCheckSquare(stringifyNodeOrText(before), stringifyNodeOrText(after), rootVar)
    }
    const l1 = tryParsePoly(eq1.left)
    const r1 = tryParsePoly(eq1.right)
    const l2 = tryParsePoly(eq2.left)
    const r2 = tryParsePoly(eq2.right)
    // A rational equation (a letter in a denominator) is checked as rational functions, side by side (R1 below).
    if (!l1 || !r1 || !l2 || !r2) {
      return payload.action === 'multiply' ? checkRationalMultiply(eq1, eq2, payload.multiplier) : 'unknown'
    }
    if (payload.action === 'square') return eEq(l2, ePow(l1, 2)) && eEq(r2, ePow(r1, 2)) ? 'valid' : 'invalid'
    if (payload.action === 'multiply') {
      const m = typeof payload.multiplier === 'string' ? tryParsePoly(payload.multiplier) : null
      if (!m) return 'unknown'
      // Times 0 every equation becomes 0 = 0, and "every real number" would follow (MUST 2).
      if (m.length === 0) return 'invalid'
      return eEq(l2, eMul(l1, m)) && eEq(r2, eMul(r1, m)) ? 'valid' : 'invalid'
    }
    // No move is declared, so no words are claimed: a deduction that is an equivalence is still a true one.
    if (payload.action === undefined) return defaultCheckAdapter.checkEquationEquiv(before, after)
    return 'unknown'
  },

  /**
   * CaseSplitComplete: verifies that the case split completely covers the domain.
   */
  checkCaseSplitComplete(_domainOrCondition: unknown, cases: unknown[]): ValidationVerdict {
    if (!Array.isArray(cases) || cases.length === 0) return 'invalid'

    // A case that is not text is no case: JSON.stringify threw on a BigInt (P-FIX-S1SOUND2 MUST 13).
    if (cases.some((c) => typeof c !== 'string')) return 'invalid'
    const strCases = cases.map((c) => (c as string).trim())
    if (strCases.length < 2) return 'invalid'

    const ineqs = strCases.map(parseIneq)
    const allIneqs = ineqs.every((iq): iq is ParsedIneq => iq !== null)

    if (allIneqs) {
      const targetVar = ineqs[0].v
      const sameVar = ineqs.every((iq) => iq.v === targetVar)
      if (!sameVar) return 'invalid'

      const firstIneq = ineqs[0]
      const sameCut = ineqs.every((iq) => cutsEqual(firstIneq, iq))
      if (!sameCut) return 'invalid'

      if (ineqs.length === 2) {
        const [i0, i1] = ineqs
        if ((i0.op === '>=' && i1.op === '<') || (i0.op === '<' && i1.op === '>=')) return 'valid'
        if ((i0.op === '>' && i1.op === '<=') || (i0.op === '<=' && i1.op === '>')) return 'valid'
        return 'invalid'
      }

      if (ineqs.length === 3) {
        const ops = ineqs.map((iq) => iq.op).sort()
        if (ops[0] === '<' && ops[1] === '=' && ops[2] === '>') return 'valid'
        return 'invalid'
      }

      return 'invalid'
    }

    // Parity: even and odd
    const hasEven = strCases.some((s) => s.toLowerCase().includes('even'))
    const hasOdd = strCases.some((s) => s.toLowerCase().includes('odd'))
    if (hasEven || hasOdd) {
      if (strCases.length === 2 && hasEven && hasOdd) {
        const sub0 = strCases[0].replace(/\b(?:is\s+)?(?:even|odd)\b/gi, '').trim()
        const sub1 = strCases[1].replace(/\b(?:is\s+)?(?:even|odd)\b/gi, '').trim()
        if (sub0 !== sub1) return 'invalid'
        return 'valid'
      }
      return 'invalid'
    }

    // Unrecognized planted patterns e.g. ['positive', 'negative'] missing zero
    const hasPos = strCases.some((s) => s.toLowerCase().includes('positive'))
    const hasNeg = strCases.some((s) => s.toLowerCase().includes('negative'))
    if (hasPos && hasNeg && !strCases.some((s) => s.toLowerCase().includes('zero'))) {
      return 'invalid'
    }

    return 'unknown'
  },

  /**
   * SolutionSetEq for a NON-EMPTY set of proposed solutions: a linear equation's one root is checked exactly.
   * An empty set is never judged here: it needs the proof from the displayed before (solutionProof, below),
   * which the validator applies.
   */
  checkSolutionSetEq(
    equationOrSet: unknown,
    proposedSolutions: unknown[],
    variable = 'x',
    domain: 'real' | 'complex' = 'real'
  ): ValidationVerdict {
    if (!Array.isArray(proposedSolutions) || proposedSolutions.length === 0) return 'unknown'

    const eqStr = typeof equationOrSet === 'string' ? equationOrSet : ''
    const pDiff = tryEquationPoly(eqStr)
    if (!pDiff) return 'unknown'

    const vars = varsOf(pDiff)
    if (vars.some((name) => name !== variable)) return 'invalid'
    // A polynomial's roots of degree 2 or higher (surds, complex pairs, repeated roots) are checked by G2 in the domain (S1b / S3).
    if (exprDegree(pDiff) >= 2) return checkRootSetG2(eqStr, proposedSolutions, domain)
    if (exprDegree(pDiff) !== 1) return 'unknown'

    // Linear equation: must have exactly 1 root
    if (proposedSolutions.length !== 1) return 'invalid'

    // Read the proposed root
    const cand = proposedSolutions[0]
    let candVal = ''
    if (typeof cand === 'string') {
      candVal = cand.includes('=') ? cand.split('=')[1].trim() : cand.trim()
    } else if (cand && typeof cand === 'object' && 'tex' in cand) {
      candVal = (cand as { tex: string }).tex
    } else if (cand && typeof cand === 'object' && 'value' in cand) {
      candVal = String((cand as { value: unknown }).value)
    }

    const candPoly = tryParsePoly(candVal)
    if (!candPoly) return 'invalid'

    if (candPoly.length !== 0 && exprDegree(candPoly) !== 0) {
      return 'invalid'
    }
    const rootRat = candPoly.length === 0 ? rat(0n) : candPoly[0].c

    // Evaluate pDiff at rootRat: a·v + b, accumulated exactly
    let a = rat(0n)
    let b = rat(0n)
    for (const term of pDiff) {
      const p = term.v[variable] ?? 0
      if (p === 1) {
        a = rAdd(a, term.c)
      } else if (p === 0) {
        b = rAdd(b, term.c)
      } else {
        return 'unknown'
      }
    }

    if (rIsZero(a)) return 'invalid'
    const val = rAdd(rMul(a, rootRat), b)
    return rIsZero(val) ? 'valid' : 'invalid'
  }
}

// ============================================================================
// P-FIX-S0SOUND and the reviews after it: exact checks of the declared operations, chains and displayed
// results. Every decision here is exact rational polynomial arithmetic (no floats, no root finding).
// ============================================================================

/** Both sides of "L = R" read as polynomials, or null when either side is not one. */
export function equationSides(text: string | MathNode): { L: Expr; R: Expr } | null {
  const split = splitEquation(text)
  if (!split) return null
  const L = tryParsePoly(split.left)
  const R = tryParsePoly(split.right)
  return L && R ? { L, R } : null
}

/** The difference D = L − R of an equation, or null when it is not one polynomial equation. */
export function equationDiff(text: string | MathNode): Expr | null {
  const sides = equationSides(text)
  return sides ? eSub(sides.L, sides.R) : null
}

/** The digits and the power of ten an exact literal may carry: beyond these it is refused, never approximated. */
const MAX_DIGITS = 300
const MAX_POWER = 300

/**
 * An exact rational written as text: "3", "-1/2", "0.25", "2.5/5". Null for anything else, including a zero
 * denominator, an empty string and an exponent. Digits are read as written, never as a double.
 */
export function parseExactRat(text: string): Rat | null {
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:\/(\d+))?$/.exec(text.trim().replace(/\s+/g, ''))
  if (!m) return null
  const frac = m[3] ?? ''
  if (m[2].length + frac.length > MAX_DIGITS) return null
  let num = BigInt(m[2] + frac)
  let den = 10n ** BigInt(frac.length)
  if (m[4] !== undefined) {
    const d = BigInt(m[4])
    if (d === 0n) return null
    den *= d
  }
  if (m[1] === '-') num = -num
  return rat(num, den)
}

/** k·E, term by term. */
function scalePoly(e: Expr, k: Rat): Expr {
  return normalize(e.map((t) => ({ c: rMul(t.c, k), v: { ...t.v } })))
}

/** The rational polynomial a·v + b. */
function linearIn(v: string, a: Rat, b: Rat): Expr {
  return normalize([
    { c: a, v: { [v]: 1 } },
    { c: b, v: {} }
  ])
}

/**
 * The purpose a scaling move states, proved on the two equations (P-FIX-S1SOUND2 MUST 5). The x² term is the v²
 * coefficient of L − R:
 * - leading-positive: a quadratic whose v² term was negative and is now positive;
 * - leading-one: a quadratic whose v² term is now 1;
 * - common-factor: k a whole number (not ±1) dividing every coefficient of both sides, all whole.
 */
function purposeHolds(purpose: ScalePurpose, b: { L: Expr; R: Expr }, a: { L: Expr; R: Expr }, kText: string, v: string): boolean {
  const before = eSub(b.L, b.R)
  const after = eSub(a.L, a.R)
  const lead = (P: Expr): Rat => coefficientOf(P, v, 2)
  switch (purpose) {
    case 'leading-positive':
      return exprDegree(before) === 2 && exprDegree(after) === 2 && rIsNeg(lead(before)) && !rIsNeg(lead(after)) && !rIsZero(lead(after))
    case 'leading-one':
      return exprDegree(after) === 2 && rEq(lead(after), R1)
    case 'common-factor': {
      const k = parseExactRat(kText)
      if (!k || k.d !== 1n || absBig(k.n) < 2n) return false
      return [...b.L, ...b.R].every((t) => t.c.d === 1n && t.c.n % k.n === 0n)
    }
  }
}

/** The before of a square root with ±: (v − s)² + k = 0 written as a completed square, or v² + k = 0 when s is 0. */
function isSquareRootForm(before: string | MathNode, v: string, s: Rat): boolean {
  const fs = formSides(before)
  if (!fs) return false
  const right = tryParsePoly(fs.right)
  if (!right || right.length !== 0) return false
  if (isCompletedSquare(fs.left, v)) return true
  if (!rIsZero(s)) return false
  const left = tryParsePoly(fs.left)
  if (!left) return false
  const degreeOf = (t: Term): number => Object.values(t.v).reduce((x, y) => x + y, 0)
  return left.some((t) => degreeOf(t) === 2) && left.every((t) => degreeOf(t) === 0 || (t.v[v] === 2 && rEq(t.c, R1)))
}

/**
 * The exact check of a declared EquationEquiv move, side by side (see EquationOp in types.ts). Every
 * polynomial in the move must use only the problem's variable v; a move that uses another letter is unknown.
 */
/** The rewrite ops: each changes the text, so an after that reads the same as its before is a no-op (review delta4, MUST 3). */
const REWRITE_OPS: ReadonlySet<string> = new Set([
  'expand-sides',
  'collect-like-terms',
  'work-out-right',
  'factorise',
  'complete-square',
  'square-root-pm',
  'remove-brackets'
])

function checkNonPolyEquationOp(
  before: string | MathNode,
  after: string | MathNode,
  op: EquationOp,
  v: string
): ValidationVerdict {
  // The raw texts: a latex angle such as \pi or 30^{\circ} must reach the checker as written.
  const rawBefore = typeof before === 'string' ? before : before.toString()
  const rawAfter = typeof after === 'string' ? after : after.toString()
  if (op.kind === 'trig-inverse' || op.kind === 'trig-inverse-general') {
    // The right side of an equation is judged by the exact polynomial checker, so 2/3 and \frac{2}{3} are one value.
    return checkTrigInverseMove(rawBefore, rawAfter, op, v, (typed, canonical) => defaultCheckAdapter.checkExprEq(typed, canonical) === 'valid')
  }
  if (
    op.kind === 'divide-cos' ||
    op.kind === 'trig-ref-angle' ||
    op.kind === 'trig-general' ||
    op.kind === 'trig-substitute' ||
    op.kind === 'trig-back-substitute'
  ) {
    return checkTrigMove(rawBefore, rawAfter, op, v)
  }

  const sBefore = stringifyNodeOrText(before)
  const sAfter = stringifyNodeOrText(after)
  const sb = splitEquation(sBefore)
  const sa = splitEquation(sAfter)
  if (!sb || !sa) return 'unknown'

  switch (op.kind) {
    case 'already-solved': {
      if (formText(sBefore) !== formText(sAfter)) return 'invalid'
      if (sa.left.trim() !== v) return 'invalid'
      // Only a number on the right is "solved": x = sin x shows the letter alone on the left and proves nothing.
      return parseExactRat(sa.right.replace(/\s+/g, '')) !== null ? 'valid' : 'unknown'
    }
    case 'work-out-right': {
      if (canonicalState(sb.left) !== canonicalState(sa.left)) return 'invalid'
      const check = defaultCheckAdapter.checkExprEq(sb.right, sa.right)
      return check === 'valid' ? 'valid' : 'unknown'
    }
    case 'swap':
      return canonicalState(sb.left) === canonicalState(sa.right) && canonicalState(sb.right) === canonicalState(sa.left)
        ? 'valid'
        : 'invalid'
    case 'remove-brackets':
    case 'expand-sides':
    case 'collect-like-terms':
    case 'factorise': {
      const leftEq = defaultCheckAdapter.checkExprEq(sb.left, sa.left)
      const rightEq = defaultCheckAdapter.checkExprEq(sb.right, sa.right)
      return leftEq === 'valid' && rightEq === 'valid' ? 'valid' : 'unknown'
    }
    case 'add-both': {
      const leftEq = defaultCheckAdapter.checkExprEq(sa.left, `(${sb.left}) + (${op.term})`)
      const rightEq = defaultCheckAdapter.checkExprEq(sa.right, `(${sb.right}) + (${op.term})`)
      return leftEq === 'valid' && rightEq === 'valid' ? 'valid' : 'unknown'
    }
    case 'subtract-both': {
      const leftEq = defaultCheckAdapter.checkExprEq(sa.left, `(${sb.left}) - (${op.term})`)
      const rightEq = defaultCheckAdapter.checkExprEq(sa.right, `(${sb.right}) - (${op.term})`)
      return leftEq === 'valid' && rightEq === 'valid' ? 'valid' : 'unknown'
    }
    case 'multiply-both': {
      // The multiplier must be a nonzero exact number, as on the polynomial path: a zero, a letter or a function could add
      // roots or lose them (multiplying by sin x adds the roots where sin x is 0). A purpose claim is judged there only.
      const k = parseExactRat(op.k)
      if (op.purpose !== undefined || !k || rIsZero(k)) return 'unknown'
      const leftEq = defaultCheckAdapter.checkExprEq(sa.left, `(${sb.left}) * (${op.k})`)
      const rightEq = defaultCheckAdapter.checkExprEq(sa.right, `(${sb.right}) * (${op.k})`)
      return leftEq === 'valid' && rightEq === 'valid' ? 'valid' : 'unknown'
    }
    case 'divide-both': {
      // Dividing by a nonzero exact number loses nothing; dividing by a letter or a function can (x sin x = x loses x = 0).
      const k = parseExactRat(op.k)
      if (op.purpose !== undefined || !k || rIsZero(k)) return 'unknown'
      const leftEq = defaultCheckAdapter.checkExprEq(sb.left, `(${sa.left}) * (${op.k})`)
      const rightEq = defaultCheckAdapter.checkExprEq(sb.right, `(${sa.right}) * (${op.k})`)
      return leftEq === 'valid' && rightEq === 'valid' ? 'valid' : 'unknown'
    }
    case 'clear-fractions': {
      // The multiplier is the LCD of the denominators written in the before, as on the polynomial path.
      const dens = fractionDenominators(rawText(before))
      if (dens === null || dens.length === 0) return 'unknown'
      const lcd = lcmOf(dens)
      const k = parseExactRat(op.k)
      if (lcd < 2n || !k || k.d !== 1n || k.n !== lcd) return 'unknown'
      const leftEq = defaultCheckAdapter.checkExprEq(sa.left, `(${sb.left}) * (${op.k})`)
      const rightEq = defaultCheckAdapter.checkExprEq(sa.right, `(${sb.right}) * (${op.k})`)
      return leftEq === 'valid' && rightEq === 'valid' ? 'valid' : 'unknown'
    }
    case 'move-to-left': {
      if (sa.right.trim() !== '0') return 'invalid'
      const leftEq = defaultCheckAdapter.checkExprEq(sa.left, `(${sb.left}) - (${sb.right})`)
      return leftEq === 'valid' ? 'valid' : 'unknown'
    }
    default:
      return 'unknown'
  }
}

/** The exponential and logarithmic root moves that expRoots.ts checks (types.ts, EquationOp). */
const EXP_ROOT_OP_KINDS: ReadonlySet<string> = new Set(['exp-to-log', 'log-to-exp', 'work-out-exp'])

export function checkEquationOp(
  before: string | MathNode,
  after: string | MathNode,
  op: EquationOp,
  v: string
): ValidationVerdict {
  // The exponential and logarithmic root moves, and the add/subtract/multiply/divide moves on a side that holds an exponential
  // atom, are checked exactly by expRoots.ts. They read the atom as a power, never as a number or a polynomial letter.
  const atomMove = ['add-both', 'subtract-both', 'multiply-both', 'divide-both'].includes(op.kind)
  if (EXP_ROOT_OP_KINDS.has(op.kind) || (atomMove && (hasExpAtom(stringifyNodeOrText(before), v) || hasExpAtom(stringifyNodeOrText(after), v)))) {
    return checkExpRootOp(stringifyNodeOrText(before), stringifyNodeOrText(after), op, v)
  }
  // S1b: a square-root step with a surd root is checked by its own exact rule first (sqrt is a name, not a letter).
  if (isSurdRootOp(op)) return checkSurdSquareRootPm(before, after, op as Extract<EquationOp, { kind: 'square-root-pm' }>, v)
  // S3 (substitution): the typed power equation and the quadratic in u are read and compared exactly by expSubst.ts.
  if (op.kind === 'exp-substitute') return checkExpSubstituteOp(stringifyNodeOrText(before), stringifyNodeOrText(after), op)
  if (
    op.kind === 'divide-cos' ||
    op.kind === 'trig-ref-angle' ||
    op.kind === 'trig-general' ||
    op.kind === 'trig-substitute' ||
    op.kind === 'trig-back-substitute' ||
    op.kind === 'trig-inverse' ||
    op.kind === 'trig-inverse-general'
  ) {
    return checkNonPolyEquationOp(before, after, op, v)
  }
  // Part R: an equation with a square root of the letter is moved by radicalForm.ts, which reads the root exactly.
  if (radicalVarOf(stringifyNodeOrText(before)) !== null || radicalVarOf(stringifyNodeOrText(after)) !== null) {
    return radicalCheckOp(stringifyNodeOrText(before), stringifyNodeOrText(after), op, v)
  }
  // An exponential or logarithmic move reads its own exponent or argument: the polynomial path below cannot hold those.
  if (isExpLogOp(op)) return checkExpLogOp(before, after, op, v)
  // A letter other than v anywhere in the states, even one that cancels, means no proof (review delta3, SHOULD 1).
  if (lettersOutside(before, v) || lettersOutside(after, v)) return 'unknown'
  const b = equationSides(before)
  const a = equationSides(after)
  if (!b || !a) return checkNonPolyEquationOp(before, after, op, v)
  const sides = [b.L, b.R, a.L, a.R]
  if (sides.some((e) => varsOf(e).some((name) => name !== v))) return 'unknown'
  if (REWRITE_OPS.has(op.kind) && formText(before) === formText(after)) return 'invalid'
  const same = (x: Expr, y: Expr): boolean => eEq(x, y)
  const verdict = (ok: boolean): ValidationVerdict => (ok ? 'valid' : 'invalid')
  const withTerm = (text: string, f: (t: Expr) => boolean): ValidationVerdict => {
    const t = tryParsePoly(text)
    if (!t || t.some((term) => Object.keys(term.v).some((name) => name !== v))) return 'invalid'
    return verdict(f(t))
  }
  const withNumber = (text: string, f: (k: Rat) => boolean): ValidationVerdict => {
    const k = parseExactRat(text)
    if (!k || rIsZero(k)) return 'invalid'
    return verdict(f(k))
  }
  const bs = formSides(before)
  const as = formSides(after)
  const equal = same(a.L, b.L) && same(a.R, b.R)

  switch (op.kind) {
    case 'add-both':
      return withTerm(op.term, (t) => same(a.L, eAdd(b.L, t)) && same(a.R, eAdd(b.R, t)))
    case 'subtract-both':
      return withTerm(op.term, (t) => same(a.L, eSub(b.L, t)) && same(a.R, eSub(b.R, t)))
    case 'multiply-both':
      if (op.purpose && !purposeHolds(op.purpose, b, a, op.k, v)) return 'invalid'
      return withNumber(op.k, (k) => same(a.L, scalePoly(b.L, k)) && same(a.R, scalePoly(b.R, k)))
    case 'divide-both':
      if (op.purpose && !purposeHolds(op.purpose, b, a, op.k, v)) return 'invalid'
      return withNumber(op.k, (k) => same(scalePoly(a.L, k), b.L) && same(scalePoly(a.R, k), b.R))
    case 'clear-decimals': {
      // The multiplier is a power of ten (at least 10), the before really has a decimal to clear, and the after has
      // none left: "to clear the decimals" is then true (MUST 5).
      if (!hasDecimalLiteral(rawText(before)) || hasDecimalLiteral(rawText(after))) return 'invalid'
      const k = parseExactRat(op.k)
      if (!k || k.d !== 1n || !/^10+$/.test(k.n.toString())) return 'invalid'
      return verdict(same(a.L, scalePoly(b.L, k)) && same(a.R, scalePoly(b.R, k)))
    }
    case 'clear-fractions': {
      // The multiplier is the LCD of the reduced denominators that appear in the before (absolute values).
      const dens = fractionDenominators(rawText(before))
      if (dens === null || dens.length === 0) return 'invalid'
      const lcd = lcmOf(dens)
      if (lcd < 2n) return 'invalid'
      const k = parseExactRat(op.k)
      if (!k || k.d !== 1n || k.n !== lcd) return 'invalid'
      return verdict(same(a.L, scalePoly(b.L, k)) && same(a.R, scalePoly(b.R, k)))
    }
    case 'move-to-left':
      return verdict(same(a.L, eSub(b.L, b.R)) && a.R.length === 0)
    case 'already-solved': {
      // The same text, and of the form v = number: nothing was changed, and that is the claim.
      if (formText(before) !== formText(after) || !as) return 'invalid'
      return verdict(equal && as.left === v && parseExactRat(as.right) !== null)
    }
    case 'expand-sides': {
      // A bracket must be on the before, and every side of the after is the term-by-term expansion of the before's side:
      // the same monomials, each one as written, with NOTHING collected (review delta4, MUST 1).
      if (!bs || !as) return 'invalid'
      if (!hasRealProduct(bs.left) && !hasRealProduct(bs.right)) return 'invalid'
      return verdict(equal && expansionHolds(bs.left, as.left, v) && expansionHolds(bs.right, as.right, v))
    }
    case 'remove-brackets': {
      // The before has brackets and none of them is a real product: removing them multiplies nothing out. Each side of the
      // after is the same monomials as before (review delta5, MUST 2).
      if (!bs || !as) return 'invalid'
      if (!/[()]/.test(bs.left + bs.right)) return 'invalid'
      if (hasRealProduct(bs.left) || hasRealProduct(bs.right)) return 'invalid'
      return verdict(equal && expansionHolds(bs.left, as.left, v) && expansionHolds(bs.right, as.right, v))
    }
    case 'collect-like-terms': {
      // The before has no brackets and some side has like terms; the after has each monomial once per side.
      if (!bs || !as) return 'invalid'
      if (/[()]/.test(bs.left + bs.right)) return 'invalid'
      const like = hasLikeTerms(bs.left) || hasLikeTerms(bs.right)
      return verdict(equal && like && isCollected(as.left) && isCollected(as.right))
    }
    case 'work-out-right': {
      // The right side of the before has no variable and is not already one number; the after's right side is that
      // number; the left side is unchanged text.
      if (!bs || !as) return 'invalid'
      const bRight = tryParsePoly(bs.right)
      if (!bRight || varsOf(bRight).length > 0 || parseExactRat(bs.right) !== null) return 'invalid'
      const value = bRight.length === 0 ? rat(0n) : bRight[0].c
      const shown = parseExactRat(as.right)
      return verdict(equal && shown !== null && rEq(shown, value) && bs.left === as.left)
    }
    case 'factorise': {
      // Only a side that changed is judged: it must be a product of factors now, and must not already be one (a no-op
      // on a product is no factorisation). An unchanged side keeps its text. At least one side changed.
      if (!bs || !as) return 'invalid'
      const leftChanged = bs.left !== as.left
      const rightChanged = bs.right !== as.right
      // The sentence says "Factorise <left> as <left>": the left side is the one factorised, and the right side keeps its
      // text ("Factorise 0 as 0" when only the right changed, MUST 5).
      if (!leftChanged || rightChanged) return 'invalid'
      const factorised = (now: string, was: string): boolean => isFactorProduct(now, v) && !isFactorProduct(was, v)
      if (leftChanged && !factorised(as.left, bs.left)) return 'invalid'
      if (rightChanged && !factorised(as.right, bs.right)) return 'invalid'
      return verdict(equal)
    }
    case 'complete-square': {
      // The after's left side has the form a(v + p)^2 + q with exact a, p, q, and a written bracket (review delta4, MUST 3).
      if (!as) return 'invalid'
      return verdict(equal && isCompletedSquare(as.left, v))
    }
    case 'square-root-pm': {
      const s = parseExactRat(op.shift)
      const r = parseExactRat(op.root)
      if (!s || !r) return 'invalid'
      // "Take the square root of both sides" needs a square to take the root of (MUST 5).
      if (!isSquareRootForm(before, v, s)) return 'invalid'
      const product = eMul(linearIn(v, R1, rNeg(rAdd(s, r))), linearIn(v, R1, rSub(rNeg(s), rNeg(r))))
      return verdict(equal && same(a.L, product))
    }
    case 'swap':
      return verdict(same(a.L, b.R) && same(a.R, b.L))
    default:
      return 'unknown'
  }
}

/**
 * The zero-product split: the product of the case expressions F₁·F₂·… must equal c·(L − R) of the whole
 * equation exactly, for a declared exact non-zero rational c, and the product must have degree at least 1
 * (a constant "product" proves nothing about the roots). Every polynomial uses only the variable v.
 */
export function checkZeroProduct(before: string | MathNode, cases: string[], c: string, v: string): ValidationVerdict {
  if (lettersOutside(before, v) || cases.some((text) => lettersOutside(text, v))) return 'unknown'
  const whole = equationSides(before)
  if (!whole) return 'unknown'
  const k = parseExactRat(c)
  if (!k || rIsZero(k)) return 'invalid'
  if (cases.length === 0) return 'invalid'
  const wholeDiff = eSub(whole.L, whole.R)
  if (varsOf(wholeDiff).some((name) => name !== v)) return 'unknown'
  let product: Expr = constExpr(R1)
  for (const text of cases) {
    const side = equationSides(text)
    if (!side) return 'unknown'
    product = eMul(product, eSub(side.L, side.R))
  }
  if (varsOf(product).some((name) => name !== v)) return 'unknown'
  if (exprDegree(product) < 1) return 'invalid'
  return eEq(product, scalePoly(wholeDiff, k)) ? 'valid' : 'invalid'
}

/** The root of a linear equation in v ("2x - 3 = 0" gives 3/2), or null when it is not linear in v. */
export function linearRootOf(text: string, v: string): Rat | null {
  if (lettersOutside(text, v)) return null
  const d = equationDiff(text)
  if (!d) return null
  if (varsOf(d).some((name) => name !== v)) return null
  let a = rat(0n)
  let b = rat(0n)
  for (const t of d) {
    const p = t.v[v] ?? 0
    if (p === 1) a = rAdd(a, t.c)
    else if (p === 0) b = rAdd(b, t.c)
    else return null
  }
  if (rIsZero(a)) return null
  return rDiv(rNeg(b), a)
}

/** What the solutions of an equation in one letter are, read exactly from its difference D. */
export type SetProof = { kind: 'none'; deg: 0 | 2 } | { kind: 'all' } | { kind: 'roots' }

/**
 * The exact proof of a solution set from the difference D of the displayed before. 'all': D is the zero
 * polynomial. 'none': a non-zero constant (linear, deg 0) or a real quadratic with a negative discriminant
 * b² − 4ac, computed exactly here and never taken from a method. 'roots': anything with a root. Null when
 * D uses another letter or has degree above 2, so nothing is proved.
 */
export function solutionProof(D: Expr, v: string): SetProof | null {
  if (varsOf(D).some((name) => name !== v)) return null
  if (D.length === 0) return { kind: 'all' }
  const deg = exprDegree(D)
  if (deg === 0) return { kind: 'none', deg: 0 }
  if (deg === 1) return { kind: 'roots' }
  if (deg !== 2) return null
  let a = rat(0n)
  let b = rat(0n)
  let c = rat(0n)
  for (const t of D) {
    const p = t.v[v] ?? 0
    if (p === 2) a = rAdd(a, t.c)
    else if (p === 1) b = rAdd(b, t.c)
    else c = rAdd(c, t.c)
  }
  if (rIsZero(a)) return null
  const disc = rSub(rMul(b, b), rMul(rat(4n), rMul(a, c)))
  return rIsNeg(disc) ? { kind: 'none', deg: 2 } : { kind: 'roots' }
}

/**
 * The values a displayed result lists, in order: "x = 2 \text{ or } x = 3", "x = -\frac{1}{2} or x = 2/3",
 * or the set form "x in {2, -3}" or "x \in \{2, -3\}". Null when the text is not such a list in the variable v.
 */
export function displayedValues(text: string, v: string): string[] | null {
  const t = text
    .replace(/\\frac\{(-?\d+)\}\{(\d+)\}/g, '$1/$2')
    .replace(/\\in\b/g, ' in ')
    .replace(/\\([{}])/g, '$1')
    .trim()
  const name = escapeRegExp(v)
  const set = new RegExp(`^${name}\\s*in\\s*\\{(.*)\\}$`).exec(t)
  if (set) {
    const inner = set[1].trim()
    return inner === '' ? [] : inner.split(',').map((s) => s.replace(/\s+/g, ''))
  }
  // Split only on the separator token (\text{or}, or the word with spaces around it), never on the
  // letters o and r inside a variable's name.
  const values: string[] = []
  for (const part of t.split(/\s*\\text\{\s*or\s*\}\s*|\s+or\s+/)) {
    const m = new RegExp(`^${name}\\s*=\\s*(\\S+)$`).exec(part.trim())
    if (!m) return null
    values.push(m[1])
  }
  return values
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** A displayed value or answer, with LaTeX fractions as a/b and no spaces: the form both sides are compared in. */
export function normalizeDisplayed(text: string): string {
  return text.replace(/\\frac\{(-?\d+)\}\{(\d+)\}/g, '$1/$2').replace(/\s+/g, '')
}

/**
 * The variable of an input equation (or expression): the one letter both sides are written in. Null when the
 * input is not a polynomial, or uses no letter or more than one.
 */
export function variableOfInput(input: string): string | null {
  // Part R: a radical equation's letter is read by radicalForm.ts, because the polynomial reader below refuses a root.
  const rootVar = radicalVarOf(input)
  if (rootVar !== null) return rootVar
  const split = splitEquation(input)
  const sides = split ? [split.left, split.right] : [input]
  const names = new Set<string>()
  let allPoly = true
  for (const side of sides) {
    const poly = tryParsePoly(side)
    if (!poly) {
      // A power or a logarithm of the unknown (2^(x), log(x)) is a side too: its letters are read from its exponent or argument.
      const letters = expLogLetters(side)
      if (letters === null) {
        allPoly = false
        break
      }
      for (const n of letters) names.add(n)
      continue
    }
    for (const n of varsOf(poly)) names.add(n)
  }
  if (allPoly && names.size === 1) return [...names][0]
  // A side with a letter in a denominator is not a polynomial: its one letter is read as a rational equation (R1 below).
  const rational = readRationalEquation(input)
  if (rational) return rational.v
  const bare = input
    .replace(/\\[A-Za-z]+/g, ' ')
    .replace(/\b(sin|cos|tan|log|ln|sqrt|exp|diff|det|inv|normal|stats)\b/gi, ' ')
  const letters = [...new Set(bare.match(/\p{L}/gu) ?? [])].filter((l) => !['e', 'i'].includes(l.toLowerCase()))
  return letters.length === 1 ? letters[0] : null
}

// ---- S3: exponential and logarithmic equations ----
// The moves of an exponential or logarithmic equation are checked here, by exact arithmetic on a whole-number base
// and a polynomial exponent or argument. The polynomial path cannot hold a letter in an exponent, so these moves never
// reach it. A text this reader cannot take is 'unknown'; a text it reads that is the wrong maths is 'invalid'.

/** The largest power a check raises a base to; a larger one is refused rather than computed. */
const MAX_LOG_POWER = 300
/** The largest base an exponential or logarithmic move may have (a bigger base makes a number nobody can read). */
const MAX_LOG_BASE = 1000n

/** A power as read: whole-number base digits, then the exponent (2^(x) is base "2", exponent "x"). */
interface ExpPower {
  base: string
  exp: string
}

/** A logarithm as read: base "10" for log(A), otherwise the base digits (see readLogTerm for each form it takes). */
interface LogTerm {
  base: string
  arg: string
}

/** The text inside one bracket group that covers the whole text, or null when the brackets do not close at its end. */
function wholeGroup(text: string): string | null {
  if (text.length < 2 || text[0] !== '(' || text[text.length - 1] !== ')') return null
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')') {
      depth--
      if (depth === 0 && i < text.length - 1) return null
    }
    if (depth < 0) return null
  }
  return depth === 0 ? text.slice(1, -1) : null
}

/** A power of a whole-number base, written 2^(x), 2^(2x-1) or 2^x (spaces ignored). Null for any other text. */
export function readExpPower(text: string): ExpPower | null {
  const s = text.replace(/\s+/g, '')
  const m = /^(\d+)\^(.+)$/.exec(s)
  if (!m) return null
  const rest = m[2]
  const grouped = wholeGroup(rest)
  if (grouped !== null) return { base: m[1], exp: grouped }
  if (/^[A-Za-z]$/.test(rest)) return { base: m[1], exp: rest }
  return null
}

/**
 * A logarithm, read in the forms it takes: log(A) (base 10), log2(A) and \log_{2}(A) (base digits, the subscript the student
 * types), and log(2, A), which latexToMath writes for \log_{2}(A) with the base first, as expr.ts reads log(a, b). A leading
 * backslash is allowed (\log(A)). A base that is not whole digits, or a base after the argument, is not read.
 */
export function readLogTerm(text: string): LogTerm | null {
  // The subscript form \log_{2}(A) reads as log2(A), so the one rule below covers both.
  const s = text.replace(/\s+/g, '').replace(/^\\/, '').replace(/^log_\{(\d+)\}/, 'log$1')
  const m = /^log(\d*)(.+)$/.exec(s)
  if (!m) return null
  const grouped = wholeGroup(m[2])
  if (grouped === null) return null
  if (m[1] !== '') return grouped.includes(',') ? null : { base: m[1], arg: grouped }
  const withBase = /^(\d+),(.+)$/.exec(grouped)
  if (withBase) return { base: withBase[1], arg: withBase[2] }
  // A comma that is not after whole-number digits makes it a two-part call, not a base-10 logarithm: it is not read.
  if (grouped.includes(',')) return null
  return { base: '10', arg: grouped }
}

/** The letters an exponential or logarithmic side uses, or null when the side is not one of those forms. */
function expLogLetters(side: string): string[] | null {
  const p = readExpPower(side)
  if (p) {
    const e = tryParsePoly(p.exp)
    return e ? varsOf(e) : null
  }
  const l = readLogTerm(side)
  if (!l) return null
  const a = tryParsePoly(l.arg)
  return a ? varsOf(a) : null
}

/** A whole number written as text ("8", "-2"), or null when the text is not one. */
function wholeOf(text: string): bigint | null {
  const r = parseExactRat(text)
  return r !== null && r.d === 1n ? r.n : null
}

/** A base the exponential and logarithmic checks accept: a whole number from 2 to MAX_LOG_BASE. */
function baseOk(text: string): bigint | null {
  if (!/^\d+$/.test(text)) return null
  const b = BigInt(text)
  return b >= 2n && b <= MAX_LOG_BASE ? b : null
}

/** base^n as a whole number, or null when n is outside 0 to MAX_LOG_POWER. */
function powerOf(b: bigint, n: bigint): bigint | null {
  if (n < 0n || n > BigInt(MAX_LOG_POWER)) return null
  return b ** n
}

const EXP_LOG_OP_KINDS: ReadonlySet<string> = new Set(['write-as-power', 'cancel-base', 'log-to-power', 'work-out-power'])

/** The four moves of an exponential or logarithmic equation (types.ts, EquationOp). */
type ExpLogOp = Extract<EquationOp, { kind: 'write-as-power' | 'cancel-base' | 'log-to-power' | 'work-out-power' }>

function isExpLogOp(op: unknown): op is ExpLogOp {
  return typeof op === 'object' && op !== null && EXP_LOG_OP_KINDS.has((op as { kind: string }).kind)
}

/**
 * Check one exponential or logarithmic move exactly (see the four kinds in types.ts). The left side of a move that does not
 * touch it must read the same; each side that changes is read again and compared with the maths it claims.
 */
function checkExpLogOp(before: string | MathNode, after: string | MathNode, op: ExpLogOp, v: string): ValidationVerdict {
  const b = splitEquation(before)
  const a = splitEquation(after)
  if (!b || !a) return 'unknown'
  const same = (x: string, y: string): boolean => x.replace(/\s+/g, '') === y.replace(/\s+/g, '')
  const verdict = (ok: boolean): ValidationVerdict => (ok ? 'valid' : 'invalid')
  const onlyV = (e: Expr | null): e is Expr => e !== null && varsOf(e).every((name) => name === v)

  switch (op.kind) {
    case 'write-as-power': {
      // The left side is untouched. The right side, a whole number c, becomes base^power, and base^power must equal c.
      const bs = baseOk(op.base)
      if (bs === null) return 'invalid'
      const c = wholeOf(b.right)
      const p = readExpPower(a.right)
      if (c === null || !p) return 'unknown'
      if (!same(b.left, a.left) || p.base !== op.base) return 'invalid'
      const n = wholeOf(p.exp)
      if (n === null || n.toString() !== op.power) return 'invalid'
      const value = powerOf(bs, n)
      return verdict(value !== null && value === c)
    }
    case 'cancel-base': {
      // base^E1 = base^n becomes E1 = n. Powers of one base above 1 are equal only when their exponents are, so this is exact.
      const bs = baseOk(op.base)
      if (bs === null) return 'invalid'
      const l = readExpPower(b.left)
      const r = readExpPower(b.right)
      if (!l || !r) return 'unknown'
      if (l.base !== op.base || r.base !== op.base) return 'invalid'
      const e1 = tryParsePoly(l.exp)
      const n = wholeOf(r.exp)
      const e2 = tryParsePoly(a.left)
      const shown = wholeOf(a.right)
      if (!e1 || !e2 || n === null || shown === null) return 'unknown'
      if (!onlyV(e1) || !onlyV(e2)) return 'invalid'
      return verdict(eEq(e1, e2) && shown === n)
    }
    case 'log-to-power': {
      // log_base(A) = c becomes A = base^c. Both forms hold on A > 0, and base^c is positive, so no root is lost or gained.
      const bs = baseOk(op.base)
      if (bs === null) return 'invalid'
      const l = readLogTerm(b.left)
      const c = wholeOf(b.right)
      if (!l || c === null) return 'unknown'
      if (l.base !== op.base || c < 0n) return 'invalid'
      const p = readExpPower(a.right)
      if (!p) return 'unknown'
      if (p.base !== op.base) return 'invalid'
      const k = wholeOf(p.exp)
      if (k === null) return 'unknown'
      const A = tryParsePoly(l.arg)
      const A2 = tryParsePoly(a.left)
      if (!A || !A2) return 'unknown'
      return verdict(k === c && onlyV(A) && eEq(A, A2))
    }
    case 'work-out-power': {
      // L = base^c becomes L = its whole-number value, with the left side unchanged.
      if (!same(b.left, a.left)) return 'invalid'
      const p = readExpPower(b.right)
      if (!p) return 'unknown'
      const bs = baseOk(p.base)
      const n = wholeOf(p.exp)
      if (bs === null || n === null) return 'invalid'
      const value = powerOf(bs, n)
      const shown = wholeOf(a.right)
      if (value === null || shown === null) return 'unknown'
      return verdict(shown === value)
    }
    default:
      return 'unknown'
  }
}

// The state comparison reads numbers exactly: a BigNumber instance of mathjs at 400 digits, so a literal of
// up to 300 digits is kept in full (a double keeps 15). It is a separate instance from the app's own math.
const exactMath = create(all, { number: 'BigNumber', precision: 400 })

function canonicalExpr(text: string): string {
  try {
    // implicit: 'show' writes 2x and 2*x alike ("2 * x"), so the same tree compares equal
    return exactMath.parse(writeTimes(preprocess(text))).toString({ implicit: 'show' })
  } catch {
    return text
  }
}

/**
 * A state as the chain compares it: the same parsed expression on each side, with whitespace and
 * typography ignored. Two states that differ only in layout (2x+3=11 and 2x + 3 = 11) are the same;
 * two that differ in the order of terms are not.
 */
export function canonicalState(input: string | MathNode): string {
  const text = stringifyNodeOrText(input).replace(/\s+/g, '')
  const eq = text.indexOf('=')
  const sides = eq === -1 ? [text] : [text.slice(0, eq), text.slice(eq + 1)]
  return sides.map(canonicalExpr).join('=')
}

/**
 * A numeric literal the exact comparison refuses: more than 300 digits (every digit written, leading zeros included), or a power of ten beyond
 * ±300 (counting the decimal places). Refused literals are never the same as anything, so no working that
 * depends on one is shown.
 */
function hasUnsafeNumber(text: string): boolean {
  return !literalsWithinLimit(text)
}

/**
 * True when two states are the same parsed expression (see canonicalState), with every number read exactly.
 * A state with a literal the exact path refuses is never the same as anything.
 */
export function sameState(a: string | MathNode, b: string | MathNode): boolean {
  const ta = stringifyNodeOrText(a)
  const tb = stringifyNodeOrText(b)
  if (hasUnsafeNumber(ta) || hasUnsafeNumber(tb)) return false
  return canonicalState(ta) === canonicalState(tb)
}

// ============================================================================
// Round 5 (gpt-5.4 delta3): the clearing ops, the structural checks of the rewrite labels, the letters guard.
// ============================================================================

/** Every letter run in a state (LaTeX commands aside) other than the variable v, even one that cancels. */
export function lettersOutside(text: string | MathNode, v: string): boolean {
  const bare = rawText(text)
    .replace(/\\text\{[^}]*\}/g, ' ')
    .replace(/\\[A-Za-z]+/g, ' ')
    .replace(/\b(sin|cos|tan|log|ln|sqrt|exp|diff|det|inv|normal|stats)\b/gi, ' ')
  // Only the names of functions are skipped: a letter such as k, u, pi, or or and is a letter of the equation and is
  // compared with v like any other (k + 3 = 7 with root 5 is not a solution of k + 3 = 7 in x, S5c).
  for (const m of bare.matchAll(/\p{L}+/gu)) {
    if (m[0] !== v) return true
  }
  return false
}

/** A state as it is written (typed or displayed), as a string. */
function rawText(text: string | MathNode): string {
  return typeof text === 'string' ? text : text.toString()
}

function gcdOf(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a
  let y = b < 0n ? -b : b
  while (y !== 0n) {
    ;[x, y] = [y, x % y]
  }
  return x
}

/** The lowest common multiple of positive whole numbers (1 for none). */
export function lcmOf(values: bigint[]): bigint {
  let out = 1n
  for (const value of values) out = (out / gcdOf(out, value)) * value
  return out
}

/** The denominator of a fraction in lowest terms: den / gcd(numerator, den), or den when the numerator is not a number. */
function reducedDenominator(numerator: string, den: bigint): bigint {
  if (!/^-?\d+$/.test(numerator)) return den
  return den / gcdOf(BigInt(numerator.replace('-', '')), den)
}

/**
 * The reduced denominators of the fractions written in a state (\frac{p}{q} and p/q). Null when a denominator
 * is not a plain number (a bracket or a letter after the slash), so nothing can be checked.
 */
export function fractionDenominators(text: string): bigint[] | null {
  // Every written denominator must be a plain integer literal, optionally bracketed and signed (review delta5, MUST 1):
  // a power (x/(-2)^2), a letter (x/2y) or a LaTeX power (\frac{x}{2^2}) is not plain, so no LCD is taken for it.
  const out: bigint[] = []
  for (const m of text.matchAll(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g)) {
    const d = plainDenominator(m[2])
    if (d === null) return null
    out.push(reducedDenominator(m[1].trim(), d))
  }
  const rest = text.replace(/\\frac\{[^{}]*\}\{[^{}]*\}/g, ' ')
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] !== '/') continue
    const tail = rest.slice(i + 1)
    const token = /^\s*(\(\s*-?\d+\s*\)|-?\d+)/.exec(tail)
    if (!token) return null
    // What follows the number must not join the denominator: a letter, a bracket, a power, a digit or a point.
    const after = tail.slice(token[0].length).trimStart()
    if (after.length > 0 && /[\p{L}\d(^.]/u.test(after[0])) return null
    const d = plainDenominator(token[1])
    if (d === null) return null
    const numerator = /(?:^|[+\-=(\s*])(\d+)\s*$/.exec(rest.slice(0, i))
    out.push(reducedDenominator(numerator ? numerator[1] : '', d))
  }
  return out
}

/** A written denominator that is a plain integer literal, optionally bracketed and signed. Null for anything else, and for zero. */
function plainDenominator(text: string): bigint | null {
  const m = /^\(\s*(-?\d+)\s*\)$|^(-?\d+)$/.exec(text.trim())
  if (!m) return null
  const d = BigInt((m[1] ?? m[2]).replace('-', ''))
  return d === 0n ? null : d
}

/** The most digits written after a decimal point in a state (0 when there is no decimal point). */
export function decimalPlaces(text: string): number {
  let most = 0
  for (const m of text.matchAll(/(?<![A-Za-z0-9_])\d*\.(\d+)/g)) most = Math.max(most, m[1].length)
  return most
}

/** True when a state has a decimal literal such as 0.2 or .5. */
export function hasDecimalLiteral(text: string): boolean {
  return decimalPlaces(text) > 0
}

/** A state as the structural checks read it: LaTeX fractions as a/b, \left, \right and \cdot dropped, no spaces. */
function formText(text: string | MathNode): string {
  return normalizeDisplayed(rawText(text).replace(/\\left|\\right/g, '').replace(/\\cdot/g, '*'))
}

/** The two sides of a state as text, split at its first "=". Null when there is no "=". */
function formSides(text: string | MathNode): { left: string; right: string } | null {
  const f = formText(text)
  const i = f.indexOf('=')
  if (i === -1) return null
  return { left: f.slice(0, i), right: f.slice(i + 1) }
}

/** The top-level summands of a side ("x-3" gives "x" and "-3"); a bracket stays whole. */
function summandsOf(side: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < side.length; i++) {
    const ch = side[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if ((ch === '+' || ch === '-') && depth === 0 && i > start) {
      out.push(side.slice(start, i))
      start = i
    }
  }
  if (side.length > start) out.push(side.slice(start))
  return out.map((s) => s.replace(/^\+/, '')).filter((s) => s !== '')
}

/** One summand as a monomial: its key (the power of each letter) and whether it is zero. Null when it is not a polynomial. */
function monomialOf(summand: string): { key: string; zero: boolean } | null {
  const poly = tryParsePoly(summand)
  if (!poly) return null
  if (poly.length === 0) return { key: '', zero: true }
  if (poly.length > 1) return { key: `sum:${summand}`, zero: false }
  const term = poly[0]
  const key = Object.keys(term.v)
    .filter((n) => term.v[n] !== 0)
    .sort()
    .map((n) => `${n}^${term.v[n]}`)
    .join('*')
  return { key, zero: false }
}

/** A side has like terms when two summands share a monomial, or a summand is zero (it collects away). */
function hasLikeTerms(side: string): boolean {
  const parts = summandsOf(side)
  const items = parts.map(monomialOf)
  if (items.some((m) => m === null)) return false
  const seen = new Set<string>()
  for (const m of items as { key: string; zero: boolean }[]) {
    // A zero summand collects away only beside other summands: a side that is just 0 has nothing to collect.
    if (m.zero) {
      if (parts.length > 1) return true
      continue
    }
    if (seen.has(m.key)) return true
    seen.add(m.key)
  }
  return false
}

/** A side is collected: each monomial once, and no zero summand unless the side is exactly 0. */
function isCollected(side: string): boolean {
  const parts = summandsOf(side)
  if (parts.length === 1 && parts[0] === '0') return true
  const items = parts.map(monomialOf)
  if (items.some((m) => m === null)) return false
  const seen = new Set<string>()
  for (const m of items as { key: string; zero: boolean }[]) {
    if (m.zero || seen.has(m.key)) return false
    seen.add(m.key)
  }
  return true
}

/**
 * The exact proof of a solution set from a displayed equation. Null when a letter other than v appears anywhere
 * in it (even one that cancels), or when the difference has degree above two (see solutionProof).
 */
export function solutionProofOf(text: string | MathNode, v: string): SetProof | null {
  if (lettersOutside(text, v)) return null
  const s = rawText(text)
  if (/sin|cos|tan|\\sin|\\cos|\\tan/.test(s)) {
    const sb = splitEquation(s)
    if (sb) {
      // a·sin(c·v) = k (or cos) with a non-zero a: no solution exactly when |k/a| > 1. 3 sin x = 2 has solutions (|2/3| < 1),
      // so the size of the coefficient decides it, not the size of the right side alone (S5c). The multiple inside the
      // argument does not change the range of a sine or cosine: 2 sin 2x = 4 has none, as sin x = 2 has none.
      // A tangent takes every value, so its equation always has solutions. Any other shape is not read here: unknown.
      const m = new RegExp(`^(-?)(\\d*)\\*?\\\\?(sin|cos|tan)\\(\\s*\\d*${v}\\s*\\)$`).exec(sb.left.replace(/\s+/g, ''))
      if (!m) return null
      if (m[3] === 'tan') return { kind: 'roots' }
      const c = parseExactRat(sb.right.replace(/\\frac\{(-?\d+)\}\{(\d+)\}/g, '$1/$2').trim())
      if (c === null) return null
      if (!rIsZero(c)) {
        const a = rat(BigInt(m[2] === '' ? 1 : m[2]))
        if (rCmp(rAbs(c), rAbs(a)) > 0) return { kind: 'none', deg: 0 }
      }
      return { kind: 'roots' }
    }
  }
  const d = equationDiff(text)
  return d ? solutionProof(d, v) : null
}

// ============================================================================
// Round 6 (gpt-5.4 delta4): the exact limits before any parse, the term-by-term expansion, the shape checks.
// ============================================================================

/**
 * True when every numeric literal in a state is within the exact limits: 300 digits in all, leading zeros included,
 * and no power of ten beyond ±300 (decimal places counted). A literal beyond them is refused before anything reads it:
 * no parse, and no BigInt power of ten (review delta4, crash).
 */
export function literalsWithinLimit(text: string | MathNode): boolean {
  for (const m of rawText(text).matchAll(/(?<![A-Za-z_\d.])(\d+(?:\.\d+)?|\.\d+)(?:[eE]([+-]?\d+))?/g)) {
    const body = m[1]
    const exponent = m[2] === undefined ? 0 : Number(m[2])
    const [whole, frac = ''] = body.split('.')
    const digits = whole.length + frac.length
    const powerOfTen = exponent - frac.length
    if (digits > MAX_DIGITS || Math.abs(exponent) > MAX_POWER || Math.abs(powerOfTen) > MAX_POWER) return false
  }
  return true
}

/** A monomial in one letter: its power and its exact coefficient. */
export interface PowerTerm {
  p: number
  c: Rat
}

/** The most terms an expansion may build (a product of many brackets is refused, not multiplied out). */
const MAX_EXPANDED_TERMS = 2000

/** The largest power a bracket is raised to in an expansion (a longer one is refused, not unrolled). */
const MAX_UNROLLED_POWER = 8

/** The largest power of a plain number worked out exactly in an expansion (10^24 and the like). */
const MAX_CONSTANT_POWER = 60

/**
 * The term-by-term expansion of one side, with NOTHING collected: each bracket is multiplied out factor by factor, so
 * 2(x + x) gives 2x and 2x, and (x + 1)(x + 2) gives x², 2x, x, 2. Zero terms are dropped. Null when the side is not a
 * polynomial in v this reads (another letter, a division by something other than a number, a power above the limit,
 * an unmatched bracket). The caller refuses a literal beyond the limits before this is called.
 */
export function distributeTerms(side: string, v: string): PowerTerm[] | null {
  const s = rawText(side).replace(/²/g, '^2').replace(/³/g, '^3').replace(/\\cdot/g, '*')
  let i = 0
  const need = (ok: boolean): void => {
    if (!ok) throw new NotExpandable()
  }
  const at = (ch: string): boolean => s[i] === ch
  const skipSpaces = (): void => {
    while (i < s.length && /\s/.test(s[i])) i++
  }
  const matchAt = (pattern: RegExp): string | null => {
    const sticky = new RegExp(pattern.source, 'y')
    sticky.lastIndex = i
    const m = sticky.exec(s)
    if (!m) return null
    i += m[0].length
    return m[0]
  }
  const exactNumber = (text: string): Rat => {
    const r = parseExactRat(text.startsWith('.') ? `0${text}` : text)
    need(r !== null)
    return r as Rat
  }
  const variableHere = (): boolean => {
    if (!s.startsWith(v, i)) return false
    const next = s[i + v.length] ?? ''
    return !/[\p{L}\d]/u.test(next)
  }
  const product = (a: PowerTerm[], b: PowerTerm[]): PowerTerm[] => {
    const out: PowerTerm[] = []
    for (const x of a) {
      for (const y of b) out.push({ p: x.p + y.p, c: rMul(x.c, y.c) })
    }
    need(out.length <= MAX_EXPANDED_TERMS)
    return out
  }
  const denominatorHere = (): Rat => {
    const paren = at('(')
    if (paren) i++
    skipSpaces()
    const negative = at('-')
    if (negative) i++
    const digits = matchAt(/\d*\.\d+|\d+/)
    need(digits !== null)
    skipSpaces()
    if (paren) {
      need(at(')'))
      i++
    }
    const d = exactNumber(digits as string)
    need(!rIsZero(d))
    return negative ? rNeg(d) : d
  }
  const powerTail = (base: PowerTerm[]): PowerTerm[] => {
    if (!at('^')) return base
    i++
    let digits: string | null
    if (at('(')) {
      i++
      digits = matchAt(/\d+/)
      need(digits !== null)
      need(at(')'))
      i++
    } else {
      digits = matchAt(/\d+/)
      need(digits !== null)
    }
    const n = Number(digits)
    need(n >= 1 && n <= MAX_UNROLLED_POWER)
    let out = base
    for (let k = 1; k < n; k++) out = product(out, base)
    return out
  }
  const factor = (): PowerTerm[] => {
    skipSpaces()
    if (at('(')) {
      i++
      const inner = sum()
      skipSpaces()
      need(at(')'))
      i++
      return powerTail(inner)
    }
    if (/[\d.]/.test(s[i] ?? '')) {
      const digits = matchAt(/\d*\.\d+|\d+/)
      need(digits !== null)
      return powerTail([{ p: 0, c: exactNumber(digits as string) }])
    }
    if (variableHere()) {
      i += v.length
      return powerTail([{ p: 1, c: rat(1n) }])
    }
    throw new NotExpandable()
  }
  const term = (): PowerTerm[] => {
    let acc = factor()
    for (;;) {
      skipSpaces()
      if (at('*')) {
        i++
        acc = product(acc, factor())
      } else if (at('/')) {
        i++
        skipSpaces()
        const d = denominatorHere()
        acc = acc.map((t) => ({ p: t.p, c: rDiv(t.c, d) }))
      } else if (/[\d.(]/.test(s[i] ?? '') || variableHere()) {
        acc = product(acc, factor())
      } else {
        break
      }
    }
    return acc
  }
  function sum(): PowerTerm[] {
    const out: PowerTerm[] = []
    let negative = false
    skipSpaces()
    if (at('+')) i++
    else if (at('-')) {
      negative = true
      i++
    }
    for (;;) {
      for (const t of term()) out.push(negative ? { p: t.p, c: rNeg(t.c) } : t)
      skipSpaces()
      if (at('+')) {
        negative = false
        i++
      } else if (at('-')) {
        negative = true
        i++
      } else {
        break
      }
    }
    return out
  }
  try {
    const terms = sum()
    skipSpaces()
    need(i === s.length)
    return terms.filter((t) => !rIsZero(t.c))
  } catch {
    return null
  }
}

/** Raised inside the expansion when the text is not one it expands term by term. */
class NotExpandable extends Error {}

/** The exact key of a monomial: its power and its coefficient, so two monomials match only when they are the same term. */
export function monomialKey(p: number, c: Rat): string {
  return `${p}|${c.n}/${c.d}`
}

/** True when two lists of monomials are the same multiset: the same terms, each as often, in any order. */
export function sameMonomials(a: PowerTerm[], b: PowerTerm[]): boolean {
  if (a.length !== b.length) return false
  const count = new Map<string, number>()
  for (const t of a) count.set(monomialKey(t.p, t.c), (count.get(monomialKey(t.p, t.c)) ?? 0) + 1)
  for (const t of b) {
    const key = monomialKey(t.p, t.c)
    const n = count.get(key) ?? 0
    if (n === 0) return false
    count.set(key, n - 1)
  }
  return true
}

/** The monomials of one side as written: each summand exactly one term in v. "0" is no monomials; null otherwise. */
function writtenMonomials(side: string, v: string): PowerTerm[] | null {
  if (side === '0') return []
  const out: PowerTerm[] = []
  for (const part of summandsOf(side)) {
    const poly = tryParsePoly(part)
    if (!poly || poly.length !== 1) return null
    const t = poly[0]
    if (Object.keys(t.v).some((name) => name !== v && t.v[name] !== 0)) return null
    out.push({ p: t.v[v] ?? 0, c: t.c })
  }
  return out
}

/**
 * The after side is exactly the term-by-term expansion of the before side: the same monomials, as many times each, with
 * nothing combined. A side that collects (2x + 2x written as 4x) is not an expansion.
 */
function expansionHolds(beforeSide: string, afterSide: string, v: string): boolean {
  const expected = distributeTerms(beforeSide, v)
  const written = writtenMonomials(afterSide, v)
  return expected !== null && written !== null && sameMonomials(expected, written)
}

/**
 * A side that is a product of factors in v: a constant times one factor (the constant not ±1), or two or more
 * non-constant factors (a power counts each). A trivial product such as 1(x² + 1) is not one (review delta4, MUST 2).
 */
function isFactorProduct(side: string, v: string): boolean {
  const m = /^(?:(-?\d+(?:\/\d+)?)\*?)?((?:\([^()]*\)(?:\^\d+)?)+)$/.exec(side)
  if (!m) return false
  let count = 0
  for (const g of m[2].matchAll(/\(([^()]*)\)(?:\^(\d+))?/g)) {
    if (!g[1].includes(v)) return false
    count += g[2] === undefined ? 1 : Number(g[2])
  }
  if (count >= 2) return true
  if (m[1] === undefined || count !== 1) return false
  const k = parseExactRat(m[1])
  return k !== null && !rIsZero(k) && !(k.d === 1n && (k.n === 1n || k.n === -1n))
}

/**
 * A side written as a(v + p)^2 + q, with exact a, p and q, and the bracket written. A bare v^2 + q is not a completed
 * square (review delta4, MUST 3).
 */
function isCompletedSquare(side: string, v: string): boolean {
  const name = escapeRegExp(v)
  const num = String.raw`\d+(?:\/\d+)?`
  const withSquare = new RegExp(`^(?:(-?${num})\\*?)?\\(${name}(?:[+-]${num})?\\)\\^2(?:[+-]${num})?$`)
  return withSquare.test(side)
}

// ============================================================================
// Round 7 (gpt-5.4 delta5): a real product, for expand-sides and remove-brackets.
// ============================================================================

/**
 * A side with a real product: a bracket that is multiplied by something (a digit, a letter, a bracket, a *, a / or
 * a minus sign, which is −1), or raised to a power of 2 or more. A bracket that is only added (after a + or at the
 * start) is redundant: removing it multiplies nothing out, so it is remove-brackets, not an expansion (review delta5, MUST 2).
 */
export function hasRealProduct(side: string): boolean {
  const s = formText(side)
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '(' || s[i - 1] === '^') continue
    const prev = i > 0 ? s[i - 1] : ''
    if (/[\p{L}\d)*]/u.test(prev) || prev === '-') return true
    let depth = 0
    let j = i
    for (; j < s.length; j++) {
      if (s[j] === '(') depth += 1
      else if (s[j] === ')') {
        depth -= 1
        if (depth === 0) break
      }
    }
    if (j >= s.length) return false
    const after = s.slice(j + 1)
    const power = /^\^\(?(\d+)\)?/.exec(after)
    if (power && Number(power[1]) >= 2) return true
    if (after !== '' && /[\p{L}\d(*/]/u.test(after[0])) return true
  }
  return false
}

// ============================================================================
// S1c (expanding and factorising): a product is a list of factor texts. A step replaces the factors
// [index, index + width) of its before by the factors of its after. Each replacement is checked exactly here.
// ============================================================================

/** The data of a product step, as the validators read it from step.data. */
export interface ProductData {
  variable: string
  factorsBefore: string[]
  factorsAfter: string[]
  index: number
  width: number
}

/** True for the ops of this section (the ExprEq ops of ExprOp in types.ts). */
export function isExprOp(op: unknown): op is ExprOp {
  if (!op || typeof op !== 'object') return false
  return EXPR_OP_KINDS.has((op as { kind: string }).kind)
}

const EXPR_OP_KINDS: ReadonlySet<string> = new Set([
  'expand-factors',
  'collect-factor',
  'take-out-hcf',
  'difference-of-squares',
  'perfect-square',
  'split-middle',
  'group-pairs',
  'common-binomial',
  'cube-factor',
  'linear-factor',
  'irreducible'
])

/** Multiplies out lists of terms one after another, the first list outermost, term by term (nothing collected). */
export function multiplyTermLists(lists: Term[][]): Term[] | null {
  let acc: Term[] = [{ c: rat(1n), v: {} }]
  for (const list of lists) {
    const out: Term[] = []
    for (const x of acc) {
      for (const y of list) {
        const v: Record<string, number> = { ...x.v }
        for (const k of Object.keys(y.v)) v[k] = (v[k] ?? 0) + y.v[k]
        out.push({ c: rMul(x.c, y.c), v })
      }
    }
    if (out.length > MAX_EXPANDED_TERMS) return null
    acc = out
  }
  return acc
}

/** The letters and powers of a term, as a key (zero powers left out). */
export function powersKey(v: Record<string, number>): string {
  return Object.keys(v)
    .filter((n) => v[n] !== 0)
    .sort()
    .map((n) => `${n}^${v[n]}`)
    .join('*')
}

/** A term as a key: its powers and its exact coefficient. */
export function termKey(t: Term): string {
  return `${powersKey(t.v)}|${t.c.n}/${t.c.d}`
}

/** True when two lists of terms are the same multiset (zero terms ignored, order ignored). */
export function sameTerms(a: Term[], b: Term[]): boolean {
  const left = a.filter((t) => !rIsZero(t.c))
  const right = b.filter((t) => !rIsZero(t.c))
  if (left.length !== right.length) return false
  const count = new Map<string, number>()
  for (const t of left) count.set(termKey(t), (count.get(termKey(t)) ?? 0) + 1)
  for (const t of right) {
    const n = count.get(termKey(t)) ?? 0
    if (n === 0) return false
    count.set(termKey(t), n - 1)
  }
  return true
}

function degreeOfTerm(t: Term): number {
  return Object.keys(t.v).reduce((s, n) => s + (t.v[n] ?? 0), 0)
}

function compareTerms(a: Term, b: Term): number {
  const d = degreeOfTerm(b) - degreeOfTerm(a)
  if (d !== 0) return d
  const ka = powersKey(a.v)
  const kb = powersKey(b.v)
  return ka < kb ? -1 : ka > kb ? 1 : 0
}

/** The collected form: like terms added, zeros dropped, highest degree first, then by letters. */
export function collectTerms(terms: Term[]): Term[] {
  const byPowers = new Map<string, Term>()
  for (const t of terms) {
    const key = powersKey(t.v)
    const cur = byPowers.get(key)
    const v: Record<string, number> = {}
    for (const n of Object.keys(t.v)) if (t.v[n] !== 0) v[n] = t.v[n]
    byPowers.set(key, { c: cur ? rAdd(cur.c, t.c) : t.c, v: cur ? cur.v : v })
  }
  return [...byPowers.values()].filter((t) => !rIsZero(t.c)).sort(compareTerms)
}

/** One term as text: 3x^2y, x, -x, 7, (1/2)x. The first term carries its sign; the others are joined with + or -. */
export function termText(t: Term, first: boolean): string {
  const names = Object.keys(t.v)
    .filter((n) => t.v[n] !== 0)
    .sort()
  const neg = rIsNeg(t.c)
  const abs = rAbs(t.c)
  const unit = abs.n === 1n && abs.d === 1n
  const coef = unit && names.length > 0 ? '' : abs.d === 1n ? abs.n.toString() : `(${abs.n}/${abs.d})`
  const body = coef + names.map((n) => (t.v[n] === 1 ? n : `${n}^${t.v[n]}`)).join('')
  if (first) return neg ? `-${body}` : body
  return neg ? ` - ${body}` : ` + ${body}`
}

/** A list of terms as one sum, in the order given. "0" for no terms. */
export function sumText(terms: Term[]): string {
  const live = terms.filter((t) => !rIsZero(t.c))
  if (live.length === 0) return '0'
  return live.map((t, i) => termText(t, i === 0)).join('')
}

/** The coefficient in front of a grouped bracket: nothing for 1. */
function coefText(m: string): string {
  return m === '1' ? '' : m
}

/** The grouped form m1(common) ± m2(common): the first part's monomial in front, the second with its sign. */
export function groupSumText(m1: string, common: string, m2: string, sign: '+' | '-'): string {
  return `${coefText(m1)}(${common}) ${sign} ${coefText(m2)}(${common})`
}

/** The common binomial's first factor: m1 ± m2. */
export function binomialSumText(m1: string, m2: string, sign: '+' | '-'): string {
  return `${m1} ${sign} ${m2}`
}

/** Splits a factor written as (inner)^n into inner and n; null for any other text. */
export function powerBase(f: string): { base: string; n: number } | null {
  if (!f.startsWith('(')) return null
  let depth = 0
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '(') depth++
    else if (f[i] === ')') {
      depth--
      if (depth === 0) {
        const rest = /^\^(\d+)$/.exec(f.slice(i + 1))
        return rest ? { base: f.slice(1, i), n: Number(rest[1]) } : null
      }
    }
  }
  return null
}

/** True when a factor has a top-level + or − (a sum), so it needs brackets inside a product. */
function isMultiTerm(f: string): boolean {
  let depth = 0
  for (let i = 0; i < f.length; i++) {
    const ch = f[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if ((ch === '+' || ch === '-') && depth === 0 && i > 0) return true
  }
  return false
}

/** The separator between two factors: nothing before a bracket, or between a number and a letter; * otherwise. */
function joinSeparator(prev: string, next: string): string {
  if (next.startsWith('(') || prev.endsWith(')')) return ''
  if (/\d$/.test(prev) && /^[A-Za-z]/.test(next)) return ''
  return '*'
}

/**
 * The text of a product state: its factors in order, sums in brackets, a single factor as it stands. This is the
 * text the step's before and after are, and the validators compare it with the typed factor lists.
 */
export function productText(factors: string[]): string {
  if (factors.length === 0) return '1'
  if (factors.length === 1) return factors[0]
  let out = ''
  factors.forEach((f, i) => {
    const shown = powerBase(f) !== null ? f : isMultiTerm(f) ? `(${f})` : f
    if (i > 0) out += joinSeparator(factors[i - 1], shown)
    out += shown
  })
  return out
}

/** The product of the factor texts as a polynomial, exactly; null when a factor is not read. */
export function productPoly(factors: string[]): Expr | null {
  // Each factor is read by expandTerms, the exact reader (tryParsePoly takes a negative power of ten as a float).
  const lists = factors.map((f) => expandTerms(f))
  if (lists.some((l) => l === null)) return null
  const product = multiplyTermLists(lists as Term[][])
  return product ? normalize(product) : null
}

/**
 * The first step of a product working starts from the problem as typed when its factors multiply out to the typed product.
 * The text may be bracketed differently ("5x(2x - 3)" for "(5x)(2x - 3)"), which sameState reads as another tree.
 */
export function startsFromTypedProduct(factors: string[] | undefined, input: string): boolean {
  if (!factors || factors.length === 0) return false
  // The factors are the typed product's own factors (same texts, same order) and they multiply out to its value
  // (exactly: expandTerms reads the typed text, tryParsePoly takes a negative power of ten as a float).
  const typed = productFactorsOf(input)
  if (!typed || typed.length !== factors.length) return false
  if (!typed.every((f, i) => f.trim() === factors[i].trim())) return false
  const product = productPoly(factors)
  const value = expandTerms(input)
  return !!product && !!value && eEq(product, normalize(value))
}

/** The value of a constant text read exactly (such as 2*10^18), or null when it has a letter or does not read. */
function constantOf(text: string): Rat | null {
  const p = tryParsePoly(text)
  if (!p || p.some((t) => Object.keys(t.v).length > 0)) return null
  return p.reduce<Rat>((acc, t) => rAdd(acc, t.c), rat(0n))
}

/** The uncollected term-by-term expansion of a text with brackets, products and integer powers; several letters. Null otherwise. */
export function expandTerms(text: string): Term[] | null {
  const s = rawText(text).replace(/²/g, '^2').replace(/³/g, '^3').replace(/\\cdot/g, '*').replace(/\\left|\\right/g, '')
  let i = 0
  const need = (ok: boolean): void => {
    if (!ok) throw new NotExpandable()
  }
  const skip = (): void => {
    while (i < s.length && /\s/.test(s[i])) i++
  }
  const at = (ch: string): boolean => s[i] === ch
  const matchAt = (pattern: RegExp): string | null => {
    const sticky = new RegExp(pattern.source, 'y')
    sticky.lastIndex = i
    const m = sticky.exec(s)
    if (!m) return null
    i += m[0].length
    return m[0]
  }
  const exact = (digits: string): Rat => {
    const r = parseExactRat(digits.startsWith('.') ? `0${digits}` : digits)
    need(r !== null)
    return r as Rat
  }
  const letterHere = (): string | null => {
    const ch = s[i]
    if (ch === undefined || !/\p{L}/u.test(ch)) return null
    if (/[\p{L}\d]/u.test(s[i + 1] ?? '')) return null
    i += 1
    return ch
  }
  const letterAhead = (): boolean => {
    const ch = s[i]
    return ch !== undefined && /\p{L}/u.test(ch) && !/[\p{L}\d]/u.test(s[i + 1] ?? '')
  }
  const mul = (a: Term[], b: Term[]): Term[] => {
    const out = multiplyTermLists([a, b])
    need(out !== null)
    return out as Term[]
  }
  const powTail = (base: Term[]): Term[] => {
    if (!at('^')) return base
    i++
    let negativeExponent = false
    let digits: string | null
    if (at('(')) {
      i++
      if (at('-')) {
        negativeExponent = true
        i++
      }
      digits = matchAt(/\d+/)
      need(digits !== null)
      need(at(')'))
      i++
    } else {
      digits = matchAt(/\d+/)
      need(digits !== null)
    }
    const n = Number(digits)
    need(n >= 1)
    if (base.length === 1 && Object.keys(base[0].v).length === 0) {
      // A number to a power is worked out exactly (10^24, 10^(-19)), as one number, not unrolled as a product of brackets.
      need(n <= MAX_CONSTANT_POWER && !rIsZero(base[0].c))
      const p = rPow(base[0].c, n)
      return [{ c: negativeExponent ? rDiv(R1, p) : p, v: {} }]
    }
    need(!negativeExponent && n <= MAX_UNROLLED_POWER)
    let out = base
    for (let k = 1; k < n; k++) out = mul(out, base)
    return out
  }
  function factor(): Term[] {
    skip()
    if (at('(')) {
      i++
      const inner = sum()
      skip()
      need(at(')'))
      i++
      return powTail(inner)
    }
    if (/[\d.]/.test(s[i] ?? '')) {
      const digits = matchAt(/\d*\.\d+|\d+/)
      need(digits !== null)
      return powTail([{ c: exact(digits as string), v: {} }])
    }
    const letter = letterHere()
    if (letter !== null) return powTail([{ c: rat(1n), v: { [letter]: 1 } }])
    throw new NotExpandable()
  }
  function denominatorHere(): Rat {
    skip()
    if (at('(')) {
      // A bracketed denominator is any exact constant, such as (2*10^18): read up to its closing bracket.
      let depth = 0
      let close = -1
      for (let j = i; j < s.length && close < 0; j++) {
        if (s[j] === '(') depth++
        else if (s[j] === ')' && --depth === 0) close = j
      }
      need(close > i)
      const c = constantOf(s.slice(i + 1, close))
      need(c !== null && !rIsZero(c))
      i = close + 1
      return c as Rat
    }
    const negative = at('-')
    if (negative) i++
    const digits = matchAt(/\d*\.\d+|\d+/)
    need(digits !== null)
    const d = exact(digits as string)
    need(!rIsZero(d))
    return negative ? rNeg(d) : d
  }
  function term(): Term[] {
    let acc = factor()
    for (;;) {
      skip()
      if (at('*')) {
        i++
        acc = mul(acc, factor())
      } else if (at('/')) {
        i++
        skip()
        const d = denominatorHere()
        acc = acc.map((t) => ({ c: rDiv(t.c, d), v: t.v }))
      } else if (at('.')) {
        // A full stop with no operator before it is a second decimal point ("0.5.5", "2 .5", "1..5"), never the start
        // of a new factor. Read as one it multiplied the two numbers together and a wrong answer came out checked,
        // so a malformed number is refused and the working is not shown.
        throw new NotExpandable()
      } else if (/[\d(]/.test(s[i] ?? '') || letterAhead()) {
        acc = mul(acc, factor())
      } else {
        break
      }
    }
    return acc
  }
  function sum(): Term[] {
    const out: Term[] = []
    let negative = false
    skip()
    if (at('+')) i++
    else if (at('-')) {
      negative = true
      i++
    }
    for (;;) {
      for (const t of term()) out.push(negative ? { c: rNeg(t.c), v: t.v } : t)
      skip()
      if (at('+')) {
        negative = false
        i++
      } else if (at('-')) {
        negative = true
        i++
      } else {
        break
      }
    }
    return out
  }
  try {
    const terms = sum()
    skip()
    need(i === s.length)
    return terms.filter((t) => !rIsZero(t.c))
  } catch {
    return null
  }
}

/** The coefficient of the power k of the letter v in a collected polynomial (zero when absent). */
export function coefficientOf(P: Expr, v: string, k: number): Rat {
  let out = rat(0n)
  for (const t of P) if ((t.v[v] ?? 0) === k) out = rAdd(out, t.c)
  return out
}

function absBig(n: bigint): bigint {
  return n < 0n ? -n : n
}

/** The largest coefficient the rational root test looks at, and the most candidates p/q it tries (P-FIX-S1SOUND2 MUST 12). */
const MAX_ROOT_COEFFICIENT = 1000000000n
const MAX_ROOT_CANDIDATES = 2000

/** The positive divisors of |n| (n up to 10^9; null beyond, so no search runs away). */
function divisorsOf(n: bigint): bigint[] | null {
  const a = absBig(n)
  if (a > MAX_ROOT_COEFFICIENT) return null
  const m = Number(a)
  const out: bigint[] = []
  for (let d = 1; d * d <= m; d++) {
    if (m % d === 0) {
      out.push(BigInt(d))
      if (d * d !== m) out.push(BigInt(m / d))
    }
  }
  return out.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0))
}

/**
 * The rational roots of a polynomial in one letter v, found by the rational root test (candidates p/q with p dividing the
 * constant term and q dividing the leading coefficient, after clearing denominators). Null when it cannot search (a
 * constant term of 0 or a coefficient beyond 10^12, or another letter).
 */
export function rationalRootsOf(P: Expr, v: string): Rat[] | null {
  if (varsOf(P).some((name) => name !== v)) return null
  const deg = exprDegree(P)
  if (deg < 1) return []
  let den = 1n
  for (const t of P) den = (den / bgcd(den, t.c.d)) * t.c.d
  const coef = new Map<number, bigint>()
  for (const t of P) {
    const p = t.v[v] ?? 0
    coef.set(p, (coef.get(p) ?? 0n) + t.c.n * (den / t.c.d))
  }
  const a0 = coef.get(0) ?? 0n
  const an = coef.get(deg) ?? 0n
  if (a0 === 0n) return null
  const ps = divisorsOf(a0)
  const qs = divisorsOf(an)
  if (ps === null || qs === null) return null
  // A number with very many divisors at both ends (735134400 has 1,344) would mean millions of exact evaluations: the
  // search refuses, and the method says it cannot show the steps, rather than freeze the window.
  if (ps.length * qs.length > MAX_ROOT_CANDIDATES) return null
  const roots: Rat[] = []
  for (const q of qs) {
    for (const p of ps) {
      for (const sgn of [1n, -1n]) {
        const r = rat(sgn * p, q)
        if (roots.some((x) => rEq(x, r))) continue
        if (rIsZero(evalAt(P, { [v]: r }))) roots.push(r)
      }
    }
  }
  return roots
}

/**
 * Whether a polynomial in one letter v cannot be factorised over the rationals, with its proof: true when it is
 * (a quadratic with a non-square discriminant, or a cubic with no rational root), false when it can be, and null
 * when this cannot decide (a higher degree, or another letter).
 */
export function irreducibleOver(P: Expr, v: string): boolean | null {
  if (varsOf(P).some((name) => name !== v)) return null
  const deg = exprDegree(P)
  if (deg === 2) {
    const a = coefficientOf(P, v, 2)
    const b = coefficientOf(P, v, 1)
    const c = coefficientOf(P, v, 0)
    const disc = rSub(rMul(b, b), rMul(rat(4n), rMul(a, c)))
    if (rIsNeg(disc)) return true
    return rSqrt(disc) === null
  }
  if (deg === 3) {
    const roots = rationalRootsOf(P, v)
    if (roots === null) return null
    return roots.length === 0
  }
  if (deg <= 1) return false
  return null
}

/** The primitive test: integer coefficients with no common factor and no letter common to every term. */
function isPrimitiveOver(P: Expr): boolean {
  if (P.some((t) => t.c.d !== 1n)) return false
  let g = 0n
  for (const t of P) g = bgcd(g, absBig(t.c.n))
  if (g !== 1n) return false
  const names = new Set<string>()
  for (const t of P) for (const n of Object.keys(t.v)) if (t.v[n] !== 0) names.add(n)
  for (const n of names) if (P.every((t) => (t.v[n] ?? 0) >= 1)) return false
  return true
}

function isOneTerm(t: Term): boolean {
  return t.c.n === 1n && t.c.d === 1n && Object.keys(t.v).every((n) => t.v[n] === 0)
}

/** True when the text holds a bracket that is more than a coefficient such as (1/2): a bracketed sum or factor. */
function hasBrackets(text: string): boolean {
  return text.replace(/\((-?\d+\/\d+)\)/g, '').includes('(')
}

/**
 * The exact check of a product step: the replaced factors and their replacement have the same product, the factor lists
 * are the texts of the before and after, and the op's own structure holds (checkProductOp).
 */
export function checkProductStep(
  before: string | MathNode,
  after: string | MathNode,
  op: ExprOp,
  data: ProductData
): ValidationVerdict {
  const B = data.factorsBefore
  const A = data.factorsAfter
  if (!Array.isArray(B) || !Array.isArray(A)) return 'invalid'
  const i = data.index
  const w = data.width
  if (!Number.isInteger(i) || !Number.isInteger(w) || i < 0 || w < 1 || i + w > B.length) return 'invalid'
  const suffix = B.length - i - w
  const replLen = A.length - i - suffix
  if (replLen < 1 || i > A.length) return 'invalid'
  for (let k = 0; k < i; k++) if (normalizeDisplayed(B[k]) !== normalizeDisplayed(A[k])) return 'invalid'
  for (let k = 0; k < suffix; k++) {
    if (normalizeDisplayed(B[i + w + k]) !== normalizeDisplayed(A[i + replLen + k])) return 'invalid'
  }
  if (!sameState(before, productText(B)) || !sameState(after, productText(A))) return 'invalid'
  const target = B.slice(i, i + w)
  const repl = A.slice(i, i + replLen)
  const tp = productPoly(target)
  const rp = productPoly(repl)
  if (!tp || !rp) return 'unknown'
  if (!eEq(tp, rp)) return 'invalid'
  return checkProductOp(op, target, repl, data.variable)
}

function checkProductOp(op: ExprOp, target: string[], repl: string[], v: string): ValidationVerdict {
  const verdictOf = (ok: boolean): ValidationVerdict => (ok ? 'valid' : 'invalid')
  const nt = (s: string): string => normalizeDisplayed(s)
  switch (op.kind) {
    case 'expand-factors': {
      const expandable = target.length >= 2 || (target.length === 1 && (powerBase(target[0])?.n ?? 0) >= 2)
      if (!expandable || repl.length !== 1 || hasBrackets(repl[0])) return 'invalid'
      const lists: Term[][] = []
      for (const f of target) {
        const t = expandTerms(f)
        if (!t) return 'unknown'
        lists.push(t)
      }
      const expected = multiplyTermLists(lists)
      const got = expandTerms(repl[0])
      if (!expected || !got) return 'unknown'
      return verdictOf(sameTerms(expected, got))
    }
    case 'collect-factor': {
      // A collect step combines like terms or puts them in order. A bracket input (a product or a power) is expanded, not collected.
      if (target.length !== 1 || repl.length !== 1 || hasBrackets(repl[0]) || hasBrackets(target[0])) return 'invalid'
      const t = expandTerms(target[0])
      if (!t) return 'unknown'
      const collected = sumText(collectTerms(t))
      if (nt(repl[0]) !== nt(collected)) return 'invalid'
      // Nothing to combine or reorder: the raw sum already reads as the collected one (x*x + 1 is a rewrite, not a collection).
      return verdictOf(nt(sumText(t)) !== nt(collected))
    }
    case 'take-out-hcf': {
      if (target.length !== 1 || repl.length !== 2) return 'invalid'
      const h = tryParsePoly(repl[0])
      const rest = tryParsePoly(repl[1])
      if (!h || !rest || h.length !== 1 || isOneTerm(h[0])) return 'invalid'
      if (rest.length < 2 || !isPrimitiveOver(rest)) return 'invalid'
      const canonical = collectTerms(rest)
      if (rIsNeg(canonical[0].c)) return 'invalid'
      if (nt(repl[0]) !== nt(termText(h[0], true))) return 'invalid'
      return verdictOf(nt(repl[1]) === nt(sumText(canonical)))
    }
    case 'difference-of-squares': {
      if (target.length !== 1 || repl.length !== 2) return 'invalid'
      const a = tryParsePoly(op.a)
      const b = tryParsePoly(op.b)
      const T = tryParsePoly(target[0])
      if (!a || !b || !T) return 'unknown'
      if (a.length !== 1 || b.length !== 1) return 'invalid'
      if (!eEq(T, eSub(eMul(a, a), eMul(b, b)))) return 'invalid'
      const r0 = tryParsePoly(repl[0])
      const r1 = tryParsePoly(repl[1])
      if (!r0 || !r1) return 'unknown'
      const minus = eSub(a, b)
      const plus = eAdd(a, b)
      return verdictOf((eEq(r0, minus) && eEq(r1, plus)) || (eEq(r0, plus) && eEq(r1, minus)))
    }
    case 'perfect-square': {
      if (target.length !== 1 || repl.length !== 1) return 'invalid'
      const a = tryParsePoly(op.a)
      const b = tryParsePoly(op.b)
      const T = tryParsePoly(target[0])
      if (!a || !b || !T) return 'unknown'
      if (a.length !== 1 || b.length !== 1) return 'invalid'
      const inner = op.sign === '-' ? eSub(a, b) : eAdd(a, b)
      if (!eEq(eMul(inner, inner), T)) return 'invalid'
      const base = powerBase(repl[0])
      if (!base || base.n !== 2) return 'invalid'
      const bp = tryParsePoly(base.base)
      return verdictOf(!!bp && eEq(bp, inner))
    }
    case 'split-middle': {
      if (target.length !== 1 || repl.length !== 1) return 'invalid'
      const P = tryParsePoly(target[0])
      if (!P) return 'unknown'
      if (P.length !== 3 || P.some((t) => ![0, 1, 2].includes(t.v[v] ?? 0) || Object.keys(t.v).some((n) => n !== v && t.v[n] !== 0))) {
        return 'invalid'
      }
      const a2 = coefficientOf(P, v, 2)
      const a1 = coefficientOf(P, v, 1)
      const a0 = coefficientOf(P, v, 0)
      if (rIsZero(a2) || rIsZero(a1) || rIsZero(a0)) return 'invalid'
      const p = parseExactRat(op.p)
      const q = parseExactRat(op.q)
      if (!p || !q || rIsZero(p) || rIsZero(q)) return 'invalid'
      if (!rEq(rAdd(p, q), a1) || !rEq(rMul(p, q), rMul(a2, a0))) return 'invalid'
      const expected: Term[] = [
        { c: a2, v: { [v]: 2 } },
        { c: p, v: { [v]: 1 } },
        { c: q, v: { [v]: 1 } },
        { c: a0, v: {} }
      ]
      return verdictOf(nt(repl[0]) === nt(sumText(expected)))
    }
    case 'group-pairs': {
      if (target.length !== 1 || repl.length !== 1) return 'invalid'
      // Grouping takes the four terms of a sum as it stands: a three-term trinomial or a product is not grouped.
      const four = expandTerms(target[0])
      if (!four || four.length !== 4 || hasBrackets(target[0])) return 'invalid'
      const B = tryParsePoly(op.common)
      const m1 = expandTerms(op.m1)
      const m2 = expandTerms(op.m2)
      if (!B || !m1 || !m2 || m1.length !== 1 || m2.length !== 1) return 'invalid'
      if (B.length < 2 || varsOf(B).length === 0) return 'invalid'
      return verdictOf(nt(repl[0]) === nt(groupSumText(op.m1, op.common, op.m2, op.sign)))
    }
    case 'common-binomial': {
      if (target.length !== 1 || repl.length !== 2) return 'invalid'
      if (nt(target[0]) !== nt(groupSumText(op.m1, op.common, op.m2, op.sign))) return 'invalid'
      if (nt(repl[0]) !== nt(binomialSumText(op.m1, op.m2, op.sign))) return 'invalid'
      return verdictOf(nt(repl[1]) === nt(op.common))
    }
    case 'cube-factor': {
      if (target.length !== 1 || repl.length !== 2) return 'invalid'
      const a = tryParsePoly(op.a)
      const b = tryParsePoly(op.b)
      const T = tryParsePoly(target[0])
      const r0 = tryParsePoly(repl[0])
      const r1 = tryParsePoly(repl[1])
      if (!a || !b || !T || !r0 || !r1) return 'unknown'
      if (a.length !== 1 || b.length !== 1) return 'invalid'
      const sb = op.sign === '-' ? eNeg(b) : b
      const cube = (p: Expr): Expr => eMul(eMul(p, p), p)
      const sum3 = op.sign === '-' ? eSub(cube(a), cube(b)) : eAdd(cube(a), cube(b))
      if (!eEq(T, sum3)) return 'invalid'
      const f1 = eAdd(a, sb)
      const f2 = eAdd(eSub(eMul(a, a), eMul(sb, a)), eMul(b, b))
      return verdictOf(eEq(r0, f1) && eEq(r1, f2))
    }
    case 'linear-factor': {
      if (target.length !== 1 || repl.length !== 2) return 'invalid'
      const root = parseExactRat(op.root)
      const T = tryParsePoly(target[0])
      const r0 = tryParsePoly(repl[0])
      if (!root || !T || !r0) return 'unknown'
      if (varsOf(T).some((n) => n !== v) || varsOf(r0).some((n) => n !== v)) return 'invalid'
      if (!rIsZero(evalAt(T, { [v]: root }))) return 'invalid'
      if (exprDegree(r0) !== 1) return 'invalid'
      const a = coefficientOf(r0, v, 1)
      const b = coefficientOf(r0, v, 0)
      return verdictOf(!rIsZero(a) && rEq(rDiv(rNeg(b), a), root))
    }
    case 'irreducible': {
      if (target.length !== 1 || repl.length !== 1 || nt(repl[0]) !== nt(target[0])) return 'invalid'
      const P = tryParsePoly(target[0])
      if (!P) return 'unknown'
      // "cannot be factorised using rational numbers" is false of 2x² + 4 = 2(x² + 2): only a primitive factor is irreducible.
      if (!isPrimitiveOver(P)) return 'invalid'
      const proof = irreducibleOver(P, v)
      if (proof === null) return 'unknown'
      return verdictOf(proof)
    }
    default:
      return 'unknown'
  }
}

/** The square root of a rational, exact, or null. */
export function ratSqrt(r: Rat): Rat | null {
  if (rIsNeg(r)) return null
  return rSqrt(r)
}

/** The exact cube root of a rational, or null when it has none. */
export function ratCbrt(r: Rat): Rat | null {
  const root = (n: bigint): bigint | null => {
    if (n < 0n) return null
    const guess = BigInt(Math.round(Math.cbrt(Number(n))))
    for (const g of [guess - 1n, guess, guess + 1n]) {
      if (g >= 0n && g * g * g === n) return g
    }
    return null
  }
  const num = root(absBig(r.n))
  const den = root(r.d)
  if (num === null || den === null) return null
  return rat(r.n < 0n ? -num : num, den)
}

/** A typed product as its factors: "(4*x - 4) * (x^2 - x + 4)" gives "4x - 4" and "x^2 - x + 4"; a power keeps its power:
 * "(x + 2)^3" gives "(x + 2)^3". A monomial between brackets is a factor of its own ("2(x + 1)" gives "2" and "x + 1").
 * A sum with no brackets is one factor. Null when the text is not read this way (a sum outside the brackets, or a letter
 * this does not expand). */
export function productFactorsOf(input: string): string[] | null {
  const s = stringifyNodeOrText(input).trim()
  if (!s.includes('(')) return [s]
  const out: string[] = []
  let pos = 0
  let sign = ''
  const canonical = (text: string): string | null => {
    const terms = expandTerms(text)
    return terms ? sumText(terms) : null
  }
  while (pos < s.length) {
    while (pos < s.length && (/\s/.test(s[pos]) || s[pos] === '*')) pos++
    if (pos >= s.length) break
    if (s[pos] === '(') {
      let depth = 0
      let close = -1
      for (let j = pos; j < s.length; j++) {
        if (s[j] === '(') depth++
        else if (s[j] === ')') {
          depth--
          if (depth === 0) {
            close = j
            break
          }
        }
      }
      if (close < 0) return null
      const inner = canonical(s.slice(pos + 1, close))
      if (inner === null) return null
      const after = s.slice(close + 1)
      const power = /^\^\(?(\d+)\)?/.exec(after)
      if (sign === '-') out.push('-1')
      sign = ''
      if (power && Number(power[1]) >= 2) {
        out.push(`(${inner})^${power[1]}`)
        pos = close + 1 + power[0].length
      } else {
        out.push(inner)
        pos = close + 1
      }
      continue
    }
    // A run of text up to the next bracket or product sign: a monomial, a number, or a bare sign.
    let end = pos
    while (end < s.length && s[end] !== '(' && s[end] !== '*') end++
    const piece = s.slice(pos, end).replace(/\s+/g, '')
    pos = end
    if (piece === '') continue
    // A sign after a factor is a sum outside the brackets ("(x + 1) - 2"), not a product: this does not read as factors.
    if (out.length > 0 && /^[+-]/.test(piece)) return null
    if (piece === '-' || piece === '+') {
      sign = piece === '-' ? '-' : ''
      continue
    }
    if (/[+-]/.test(piece.slice(1))) return null
    const term = canonical(piece)
    if (term === null) return null
    if (sign === '-') out.push(`-${term}`)
    else out.push(term)
    sign = ''
  }
  return out.length > 0 ? out : null
}

// ============================================================================
// S1d: simultaneous linear equations. A system is a list of equations; each side is a linear form in the letters
// with exact rational coefficients. Each op is checked exactly here (checkSystemOp): the sides side by side, or the
// declared substitution, and the two endings by an exact rank proof from the displayed rows.
// ============================================================================

/** A linear form: the coefficient of each letter, and the number term. Exact rationals; zero entries are left out. */
export interface LinForm {
  v: Record<string, Rat>
  c: Rat
}

/** One equation of a system: its left and right sides, as they stand (side by side). */
export interface LinEq {
  L: LinForm
  R: LinForm
}

const ZERO = (): Rat => rat(0n)

function cleanForm(v: Record<string, Rat>, c: Rat): LinForm {
  const out: Record<string, Rat> = {}
  for (const n of Object.keys(v)) if (!rIsZero(v[n])) out[n] = v[n]
  return { v: out, c }
}

/** Splits at the commas that are not inside brackets. */
function splitTopCommas(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of text) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(cur)
      cur = ''
    } else cur += ch
  }
  parts.push(cur)
  return parts
}

function formOfTerms(terms: Term[]): LinForm | null {
  const v: Record<string, Rat> = {}
  let c = ZERO()
  for (const t of terms) {
    const names = Object.keys(t.v).filter((n) => t.v[n] !== 0)
    if (names.length === 0) {
      c = rAdd(c, t.c)
      continue
    }
    if (names.length !== 1 || t.v[names[0]] !== 1) return null
    const n = names[0]
    v[n] = rAdd(v[n] ?? ZERO(), t.c)
  }
  return cleanForm(v, c)
}

/**
 * A system as typed or as a step states it: one equation per comma-separated part. Null when a part is not one
 * equation, or a side is not a linear form read exactly (expandTerms reads brackets, fractions and tiny powers of ten).
 */
/** Names that mean a number in the maths (π, e, i and their spellings): a system with one of them is not read as unknowns. */
const CONSTANT_NAMES = new Set(['π', 'pi', 'PI', 'e', 'E', 'i', 'Infinity', 'tau', 'phi'])

/** The substitution a discriminant b² − 4ac is written as: the one template the formula method and the checks share. */
export function substitutedDiscriminantText(a: string, b: string, c: string): string {
  return `(${b})^2 - 4 \\cdot ${a} \\cdot (${c})`
}

export function readSystem(text: string | MathNode): LinEq[] | null {
  const s = stringifyNodeOrText(text).trim()
  if (s === '') return null
  const eqs: LinEq[] = []
  for (const part of splitTopCommas(s)) {
    const sides = part.split('=')
    if (sides.length !== 2) return null
    const L = expandTerms(sides[0])
    const R = expandTerms(sides[1])
    if (!L || !R) return null
    const lf = formOfTerms(L)
    const rf = formOfTerms(R)
    if (!lf || !rf) return null
    eqs.push({ L: lf, R: rf })
  }
  // Every letter the text names is an unknown with a non-zero coefficient somewhere (P-FIX-S1SOUND2 MUST 10 and SHOULD 3):
  // a constant (π, e) is never solved for, and a letter that cancels out of every equation is not silently dropped.
  // Any alphabet counts (Greek too, as the maths keypad types it), or a cancelled α would be dropped without a word.
  const named = s.match(/\p{L}+/gu) ?? []
  if (named.some((n) => CONSTANT_NAMES.has(n))) return null
  const used = new Set(lettersOfSystem(eqs))
  if (named.some((n) => !used.has(n))) return null
  return eqs
}

/** The letters a system uses (with a non-zero coefficient somewhere), sorted. */
export function lettersOfSystem(eqs: LinEq[]): string[] {
  const names = new Set<string>()
  for (const e of eqs) for (const f of [e.L, e.R]) for (const n of Object.keys(f.v)) names.add(n)
  return [...names].sort()
}

/** A non-negative rational as student text: "3", or "(3/4)" for a fraction (the brackets keep it one number). */
function ratMagText(r: Rat): string {
  return r.d === 1n ? r.n.toString() : `(${r.n}/${r.d})`
}

/** A rational as plain text, for an answer or a step: "3", "-5", "3/4", "-3/4". */
export function ratText(r: Rat): string {
  return r.d === 1n ? r.n.toString() : `${r.n}/${r.d}`
}

/** The exact rational of a plain text ("-3", "3/4"), or null. */
export function ratOfText(text: string): Rat | null {
  const m = /^(-?)(\d+)(?:\/(\d+))?$/.exec(text.trim())
  if (!m) return null
  const d = m[3] === undefined ? 1n : BigInt(m[3])
  if (d === 0n) return null
  const n = BigInt(m[2]) * (m[1] === '-' ? -1n : 1n)
  return rat(n, d)
}

/** A linear form as student text in the given letter order: "-6x - 5y + 2", "x", "(-3/2)" and so on. */
export function linFormText(f: LinForm, vars: string[]): string {
  const parts: Array<{ neg: boolean; body: string }> = []
  for (const n of vars) {
    const c = f.v[n]
    if (!c || rIsZero(c)) continue
    const neg = rIsNeg(c)
    const mag = neg ? rNeg(c) : c
    parts.push({ neg, body: (rEq(mag, rat(1n)) ? '' : ratMagText(mag)) + n })
  }
  if (!rIsZero(f.c) || parts.length === 0) {
    const neg = rIsNeg(f.c)
    const mag = neg ? rNeg(f.c) : f.c
    parts.push({ neg, body: mag.d === 1n ? mag.n.toString() : `${mag.n}/${mag.d}` })
  }
  return parts.map((p, i) => (i === 0 ? (p.neg ? '-' : '') + p.body : (p.neg ? ' - ' : ' + ') + p.body)).join('')
}

/** One equation as student text: "-6x - 5y = 41". */
export function eqText(e: LinEq, vars: string[]): string {
  return `${linFormText(e.L, vars)} = ${linFormText(e.R, vars)}`
}

/** A whole system as student text, one equation per comma-separated part. */
export function systemText(eqs: LinEq[], vars: string[]): string {
  return eqs.map((e) => eqText(e, vars)).join(', ')
}

/** True when two forms are the same linear form (letters and number alike). */
export function sameForm(a: LinForm, b: LinForm): boolean {
  const names = new Set([...Object.keys(a.v), ...Object.keys(b.v)])
  for (const n of names) if (!rEq(a.v[n] ?? ZERO(), b.v[n] ?? ZERO())) return false
  return rEq(a.c, b.c)
}

/** True when two equations are the same, side by side. */
export function sameEq(a: LinEq, b: LinEq): boolean {
  return sameForm(a.L, b.L) && sameForm(a.R, b.R)
}

/** True when two systems are the same, equation by equation and side by side. */
export function sameSystem(a: LinEq[], b: LinEq[]): boolean {
  return a.length === b.length && a.every((e, i) => sameEq(e, b[i]))
}

function fScale(f: LinForm, k: Rat): LinForm {
  const v: Record<string, Rat> = {}
  for (const n of Object.keys(f.v)) v[n] = rMul(f.v[n], k)
  return cleanForm(v, rMul(f.c, k))
}

/** a + b, or a − b when sign is −1, letter by letter and in the number term. */
function fAdd(a: LinForm, b: LinForm, sign: 1 | -1): LinForm {
  const names = new Set([...Object.keys(a.v), ...Object.keys(b.v)])
  const v: Record<string, Rat> = {}
  for (const n of names) {
    const x = a.v[n] ?? ZERO()
    const y = b.v[n] ?? ZERO()
    v[n] = sign === 1 ? rAdd(x, y) : rSub(x, y)
  }
  return cleanForm(v, sign === 1 ? rAdd(a.c, b.c) : rSub(a.c, b.c))
}

/** The left side minus the right side of an equation. */
function diffOf(e: LinEq): LinForm {
  return fAdd(e.L, e.R, -1)
}

function coefOf(f: LinForm, v: string): Rat {
  return f.v[v] ?? ZERO()
}

function isZeroRow(e: LinEq): boolean {
  const d = diffOf(e)
  return Object.keys(d.v).length === 0 && rIsZero(d.c)
}

/** The rank of a matrix of rationals, by exact elimination. */
function rankOf(rows: Rat[][]): number {
  const m = rows.map((r) => r.slice())
  const cols = m.length === 0 ? 0 : m[0].length
  let rank = 0
  for (let c = 0; c < cols && rank < m.length; c++) {
    let piv = -1
    for (let r = rank; r < m.length; r++) {
      if (!rIsZero(m[r][c])) {
        piv = r
        break
      }
    }
    if (piv < 0) continue
    ;[m[rank], m[piv]] = [m[piv], m[rank]]
    for (let r = 0; r < m.length; r++) {
      if (r === rank || rIsZero(m[r][c])) continue
      const f = rDiv(m[r][c], m[rank][c])
      for (let k = c; k < cols; k++) m[r][k] = rSub(m[r][k], rMul(f, m[rank][k]))
    }
    rank++
  }
  return rank
}

/** The text of one equation's row, as the sentences of the endings name it. */
export function rowText(e: LinEq, vars: string[]): string {
  return eqText(e, vars)
}

/**
 * The value of each letter when the system states every letter alone as "letter = number" (in its own equation).
 * Null when some letter is not stated so.
 */
export function solvedValues(eqs: LinEq[], vars: string[]): Record<string, Rat> | null {
  const out: Record<string, Rat> = {}
  for (const n of vars) {
    const row = eqs.find(
      (e) =>
        Object.keys(e.L.v).length === 1 &&
        rEq(coefOf(e.L, n), rat(1n)) &&
        rIsZero(e.L.c) &&
        Object.keys(e.R.v).length === 0
    )
    if (!row) return null
    out[n] = row.R.c
  }
  return out
}

/** A form at the given values, or null when a letter has no value. */
export function evalForm(f: LinForm, vals: Record<string, Rat>): Rat | null {
  let acc = f.c
  for (const n of Object.keys(f.v)) {
    const x = vals[n]
    if (x === undefined) return null
    acc = rAdd(acc, rMul(f.v[n], x))
  }
  return acc
}

/**
 * The verdict of one SystemEq op. `before` is the system the step starts from; `after` the system it ends with (null for
 * the two endings, whose text is a sentence); `vars` the letters of the typed system. Every op is refused when it changes
 * nothing. Exact rationals throughout.
 */
export function checkSystemOp(op: SystemOp, before: LinEq[], after: LinEq[] | null, vars: string[]): ValidationVerdict {
  const ok = (b: boolean): ValidationVerdict => (b ? 'valid' : 'invalid')
  const inRange = (i: number): boolean => Number.isInteger(i) && i >= 0 && i < before.length
  // Every equation except the listed ones is the same as before.
  const sameExcept = (skip: number[]): boolean => {
    if (!after || after.length !== before.length) return false
    return before.every((e, k) => skip.includes(k) || sameEq(e, after[k]))
  }
  switch (op.kind) {
    case 'scale-equation': {
      const k = ratOfText(op.k)
      if (!after || !k || rIsZero(k) || rEq(k, rat(1n)) || !inRange(op.i)) return 'invalid'
      if (!sameExcept([op.i]) || sameEq(before[op.i], after[op.i])) return 'invalid'
      return ok(sameEq(after[op.i], { L: fScale(before[op.i].L, k), R: fScale(before[op.i].R, k) }))
    }
    case 'add-equations':
    case 'subtract-equations': {
      if (!after || !inRange(op.i) || !inRange(op.j) || op.i === op.j) return 'invalid'
      const sign: 1 | -1 = op.kind === 'add-equations' ? 1 : -1
      const want: LinEq = {
        L: fAdd(before[op.i].L, before[op.j].L, sign),
        R: fAdd(before[op.i].R, before[op.j].R, sign)
      }
      if (!sameExcept([op.i]) || sameEq(before[op.i], after[op.i])) return 'invalid'
      return ok(sameEq(after[op.i], want))
    }
    case 'make-subject': {
      if (!after || !inRange(op.i) || !vars.includes(op.v) || sameEq(before[op.i], after[op.i])) return 'invalid'
      const D = diffOf(before[op.i])
      const a = coefOf(D, op.v)
      if (rIsZero(a)) return 'invalid'
      // v = P with P free of v: then v − P is D/a, the same equation divided by a.
      const scaled = fScale(D, rNeg(rDiv(rat(1n), a)))
      const pv: Record<string, Rat> = { ...scaled.v }
      delete pv[op.v]
      const want: LinEq = { L: cleanForm({ [op.v]: rat(1n) }, ZERO()), R: cleanForm(pv, scaled.c) }
      return ok(sameExcept([op.i]) && sameEq(after[op.i], want))
    }
    case 'substitute':
    case 'back-substitute': {
      if (!after || !inRange(op.i) || !inRange(op.j) || op.i === op.j) return 'invalid'
      const subject = before[op.i]
      const isSubject =
        Object.keys(subject.L.v).length === 1 &&
        rEq(coefOf(subject.L, op.v), rat(1n)) &&
        rIsZero(subject.L.c) &&
        rIsZero(coefOf(subject.R, op.v))
      if (!isSubject) return 'invalid'
      if (op.kind === 'back-substitute' && Object.keys(subject.R.v).length > 0) return 'invalid'
      const P = subject.R
      if (linFormText(P, vars) !== op.expr) return 'invalid'
      const target = before[op.j]
      if (rIsZero(coefOf(diffOf(target), op.v))) return 'invalid'
      // Put v = P into one side: v goes out, the letters of P come in with the same coefficient.
      const putIn = (f: LinForm): LinForm => {
        const rest: Record<string, Rat> = { ...f.v }
        delete rest[op.v]
        return fAdd(cleanForm(rest, f.c), fScale(P, coefOf(f, op.v)), 1)
      }
      const D = fAdd(putIn(target.L), putIn(target.R), -1)
      // The result: letters on the left, a number on the right.
      const want: LinEq = { L: cleanForm(D.v, ZERO()), R: cleanForm({}, rNeg(D.c)) }
      if (!sameExcept([op.j]) || !sameEq(before[op.i], after[op.i])) return 'invalid'
      return ok(sameEq(after[op.j], want))
    }
    case 'no-common-solution': {
      if (!inRange(op.i) || after) return 'invalid'
      const D = diffOf(before[op.i])
      if (Object.keys(D.v).length > 0 || rIsZero(D.c)) return 'invalid'
      return ok(op.row === rowText(before[op.i], vars))
    }
    case 'infinitely-many': {
      if (after) return 'invalid'
      const rows = op.rows
      if (rows.length < 1 || rows.length >= vars.length) return 'invalid'
      if (new Set(rows).size !== rows.length || !rows.every(inRange)) return 'invalid'
      if (rows.some((r) => Object.keys(diffOf(before[r]).v).length === 0)) return 'invalid'
      const matrix = rows.map((r) => vars.map((n) => coefOf(diffOf(before[r]), n)))
      if (rankOf(matrix) !== rows.length) return 'invalid'
      if (before.some((e, k) => !rows.includes(k) && !isZeroRow(e))) return 'invalid'
      if (op.texts.length !== rows.length || rows.some((r, idx) => op.texts[idx] !== rowText(before[r], vars))) {
        return 'invalid'
      }
      return 'valid'
    }
    default:
      return 'invalid'
  }
}

const SYSTEM_OP_KINDS = new Set([
  'scale-equation',
  'add-equations',
  'subtract-equations',
  'make-subject',
  'substitute',
  'back-substitute',
  'no-common-solution',
  'infinitely-many'
])

/** True for a SystemEq op (S1d), by its kind. */
export function isSystemOp(op: unknown): op is SystemOp {
  return typeof op === 'object' && op !== null && SYSTEM_OP_KINDS.has(String((op as { kind?: unknown }).kind))
}

/** The equation times k on both sides. */
export function scaleEq(e: LinEq, k: Rat): LinEq {
  return { L: fScale(e.L, k), R: fScale(e.R, k) }
}

/** Eᵢ + Eⱼ (sign 1) or Eᵢ − Eⱼ (sign −1), side by side. */
export function addEq(a: LinEq, b: LinEq, sign: 1 | -1): LinEq {
  return { L: fAdd(a.L, b.L, sign), R: fAdd(a.R, b.R, sign) }
}

/** The letter's coefficient in the left side minus the right side. */
export function systemCoefficient(e: LinEq, v: string): Rat {
  return coefOf(diffOf(e), v)
}

/** True when the equation is "v = P" with P free of v (the subject form of v). */
export function isSubjectOf(e: LinEq, v: string): boolean {
  return (
    Object.keys(e.L.v).length === 1 &&
    rEq(coefOf(e.L, v), rat(1n)) &&
    rIsZero(e.L.c) &&
    rIsZero(coefOf(e.R, v))
  )
}

/** True when the equation has letters on its left only, and a number on its right. */
export function isNormalEq(e: LinEq): boolean {
  return Object.keys(e.R.v).length === 0 && rIsZero(e.L.c)
}

/** The equation rearranged to v = P (P free of v), or null when v has no coefficient in it. */
export function makeSubjectEq(e: LinEq, v: string): LinEq | null {
  const D = diffOf(e)
  const a = coefOf(D, v)
  if (rIsZero(a)) return null
  const scaled = fScale(D, rNeg(rDiv(rat(1n), a)))
  const pv: Record<string, Rat> = { ...scaled.v }
  delete pv[v]
  return { L: cleanForm({ [v]: rat(1n) }, ZERO()), R: cleanForm(pv, scaled.c) }
}

/**
 * The equation with v put as P (the subject's right side) on both sides: v goes out, P comes in with the same
 * coefficient. The result has letters on the left and a number on the right. Null when the subject is not "v = P".
 */
export function substituteEq(target: LinEq, subject: LinEq, v: string): LinEq | null {
  if (!isSubjectOf(subject, v)) return null
  const P = subject.R
  const putIn = (f: LinForm): LinForm => {
    const rest: Record<string, Rat> = { ...f.v }
    delete rest[v]
    return fAdd(cleanForm(rest, f.c), fScale(P, coefOf(f, v)), 1)
  }
  const D = fAdd(putIn(target.L), putIn(target.R), -1)
  return { L: cleanForm(D.v, ZERO()), R: cleanForm({}, rNeg(D.c)) }
}

// ============================================================================
// S1b: surds and complex numbers. G2 (math/check) reads them exactly in ℚ(√d, i) and checks them; the steps show each
// number in one canonical form, and a check that needs the number compares it through that form.
// ============================================================================

/** A number of ℚ(√d, i) read from a step's plain text by G2, or null when G2 does not read it exactly. */
export function readSurd(text: string): G2Alg | null {
  try {
    return readAlg(text)
  } catch {
    return null
  }
}

/** True for a surd or a complex number (not a rational). */
export function isSurdText(text: string): boolean {
  const x = readSurd(text)
  return x !== null && !algIsRational(x)
}

/** The integer square root of n ≥ 0. */
function isqrt(n: bigint): bigint {
  if (n < 2n) return n
  let x = BigInt(Math.floor(Math.sqrt(Number(n))))
  while (x * x > n) x -= 1n
  while ((x + 1n) * (x + 1n) <= n) x += 1n
  return x
}

/**
 * n = s²·d with d squarefree, for n ≥ 1. Null when the splitting would take more than a fixed number of divisions
 * (a discriminant that large is declined, never guessed).
 */
export function squareFreeSplit(n: bigint): { s: bigint; d: bigint } | null {
  let s = 1n
  let d = n
  let steps = 0
  for (let p = 2n; p * p <= d; p++) {
    if (++steps > 200000) return null
    while (d % (p * p) === 0n) {
      d /= p * p
      s *= p
    }
  }
  const r = isqrt(d)
  if (r * r === d) {
    s *= r
    d = 1n
  }
  return { s, d }
}

function absN(n: bigint): bigint {
  return n < 0n ? -n : n
}

function gcdN(a: bigint, b: bigint): bigint {
  let x = absN(a)
  let y = absN(b)
  while (y !== 0n) [x, y] = [y, x % y]
  return x
}

/**
 * The shape of a number of ℚ(√d, i) that the steps show: value = p + q·Ω, where Ω is i (imaginary), √root (a surd) or
 * nothing (a rational, root 1). Null for a shape the steps do not show (a real and an imaginary surd together).
 */
export function shapeOf(x: G2Alg): { p: Rat; q: Rat; root: bigint; imag: boolean } | null {
  if (x.d === 1n) {
    const re = rAdd(x.a, x.b)
    const im = rAdd(x.c, x.e)
    return rIsZero(im) ? { p: re, q: rat(0n), root: 1n, imag: false } : { p: re, q: im, root: 1n, imag: true }
  }
  if (rIsZero(x.c) && rIsZero(x.e)) return { p: x.a, q: x.b, root: x.d, imag: false }
  if (rIsZero(x.a) && rIsZero(x.b) && rIsZero(x.c)) return { p: rat(0n), q: x.e, root: x.d, imag: true }
  if (rIsZero(x.b) && rIsZero(x.c)) return { p: x.a, q: x.e, root: x.d, imag: true }
  return null
}

/** The value as whole numbers over one denominator: P + Q·Ω over C, reduced, with C above zero. */
function canonicalParts(x: G2Alg): { P: bigint; Q: bigint; C: bigint; root: bigint; imag: boolean } {
  const sh = shapeOf(x)
  if (!sh) throw new Error('number shape not shown')
  let C = 1n
  for (const r of [sh.p, sh.q]) C = (C / gcdN(C, r.d)) * r.d
  const P = sh.p.n * (C / sh.p.d)
  const Q = sh.q.n * (C / sh.q.d)
  const g = gcdN(gcdN(P, Q), C) || 1n
  return { P: P / g, Q: Q / g, C: C / g, root: sh.root, imag: sh.imag }
}

/** Ω in LaTeX: "\sqrt{2}", "i\sqrt{2}", "i". */
function omegaTex(root: bigint, imag: boolean): string {
  const sq = root === 1n ? '' : `\\sqrt{${root}}`
  return imag ? `i${sq}` : sq
}

/** Ω in plain text, for G2: "sqrt(2)", "i*sqrt(2)", "i". */
function omegaPlain(root: bigint, imag: boolean): string {
  const sq = root === 1n ? '' : `sqrt(${root})`
  return imag ? (sq === '' ? 'i' : `i*${sq}`) : sq
}

/** Ω for a sentence: "√2", "i√2", "i". */
function omegaPretty(root: bigint, imag: boolean): string {
  const sq = root === 1n ? '' : `√${root}`
  return imag ? `i${sq}` : sq
}

/** The LaTeX of a number, as the answers and the steps write it, with no spaces: "3", "-\frac{3}{2}", "\frac{-3+3\sqrt{7}}{4}". */
export function texOfAlg(x: G2Alg): string {
  const { P, Q, C, root, imag } = canonicalParts(x)
  if (root === 1n && !imag) return rTex(rat(P, C))
  const term = `${Q === 1n || Q === -1n ? '' : absN(Q)}${omegaTex(root, imag)}`
  const numer = P === 0n ? `${Q < 0n ? '-' : ''}${term}` : `${P}${Q < 0n ? '-' : '+'}${term}`
  return C === 1n ? numer : `\\frac{${numer}}{${C}}`
}

/** The plain text G2 reads exactly: "(-3 + 3*sqrt(7))/4", "1 + sqrt(2)", "(1 + i)/3", "(5 + 2*i*sqrt(2))/2", "-3/4". */
export function plainOfAlg(x: G2Alg): string {
  const { P, Q, C, root, imag } = canonicalParts(x)
  if (root === 1n && !imag) return C === 1n ? String(P) : `${P}/${C}`
  const term = `${Q === 1n || Q === -1n ? '' : `${absN(Q)}*`}${omegaPlain(root, imag)}`
  const numer = P === 0n ? `${Q < 0n ? '-' : ''}${term}` : `${P} ${Q < 0n ? '-' : '+'} ${term}`
  return C === 1n ? numer : `(${numer})/${C}`
}

/** The same number for a sentence: minus signs and spaces, "(−3 + 3√7)/4", "1 + √2", "(5 + 2i√2)/2". */
export function prettyOfAlg(x: G2Alg): string {
  const { P, Q, C, root, imag } = canonicalParts(x)
  if (root === 1n && !imag) {
    const v = C === 1n ? String(P) : `${P}/${C}`
    return v.replace(/^-/, '−')
  }
  const term = `${Q === 1n || Q === -1n ? '' : absN(Q)}${omegaPretty(root, imag)}`
  const numer =
    P === 0n
      ? `${Q < 0n ? '−' : ''}${term}`
      : `${P < 0n ? '−' : ''}${absN(P)} ${Q < 0n ? '−' : '+'} ${term}`
  return C === 1n ? numer : `(${numer})/${C}`
}

/**
 * The roots of a·x² + b·x + c (a > 0), exact and in simplest form: one root (rational) when the discriminant is zero,
 * two real roots when it is above zero, a conjugate pair when it is below zero (the caller decides whether a complex
 * domain shows them). Null when the discriminant is too large to split.
 */
export function quadraticRootsOf(a: bigint, b: bigint, c: bigint): G2Alg[] | null {
  const D = b * b - 4n * a * c
  const two = 2n * a
  if (D === 0n) return [algRat(rat(-b, two))]
  const split = squareFreeSplit(absN(D))
  if (!split) return null
  const { s, d } = split
  const center = rat(-b, two)
  const half = rat(s, two)
  if (D > 0n) {
    if (d === 1n) {
      const lo = rat(-b - s, two)
      const hi = rat(-b + s, two)
      return [algRat(lo), algRat(hi)]
    }
    return [
      { d, a: center, b: rNeg(half), c: R0, e: R0 },
      { d, a: center, b: half, c: R0, e: R0 }
    ]
  }
  if (d === 1n) {
    return [
      { d: 1n, a: center, b: R0, c: rNeg(half), e: R0 },
      { d: 1n, a: center, b: R0, c: half, e: R0 }
    ]
  }
  return [
    { d, a: center, b: R0, c: R0, e: rNeg(half) },
    { d, a: center, b: R0, c: R0, e: half }
  ]
}

/**
 * The factored form of (x − s)² − r² = 0 with r positive: "\left(x - 1 - \sqrt{2}\right)\left(x - 1 + \sqrt{2}\right) = 0".
 * One function writes it for the square-root step and for the check that compares its text.
 */
export function surdFactoredTex(v: string, s: Rat, r: G2Alg): string {
  const sTail = (x: Rat): string => (rIsZero(x) ? '' : rIsNeg(x) ? ` + ${rTex(rAbs(x))}` : ` - ${rTex(x)}`)
  const rTexPos = texOfAlg(r)
  return `\\left(${v}${sTail(s)} - ${rTexPos}\\right)\\left(${v}${sTail(s)} + ${rTexPos}\\right) = 0`
}

// ---- S1b: the G2 swap point. Each call takes the step's plain text; LaTeX or anything else is 'unknown' (never read). ----

/** G2's verdict as a step's verdict: 'equal' is valid, 'different' is invalid, 'unknown' stays unknown. */
function fromG2(v: G2Verdict): ValidationVerdict {
  return v === 'equal' ? 'valid' : v === 'different' ? 'invalid' : 'unknown'
}

/**
 * A text G2 may read: plain maths only. A LaTeX command, a brace or a backslash is not read (the reading layer's rule).
 * A letter touching a digit (x2, e5) is refused too: G2 reads it as one name, a different expression from 2x or x^2
 * (probe, S1b review round 1), so such a text is 'unknown' rather than 'invalid'.
 */
export function plainForG2(text: string): string | null {
  // A number in exponent notation (1e5) is one literal, so its e is not a glued letter: it is taken out before the test.
  const bare = text.replace(/(\d)[eE][+-]?\d+/g, '$1')
  return /[\\{}]|[A-Za-z]\d/.test(bare) ? null : text
}

/** The text of a proposed solution: a plain value, "x = value", or a { value } object. */
function solutionValueText(s: unknown): string {
  if (typeof s === 'string') return (s.includes('=') ? s.split('=')[1] : s).trim()
  if (s && typeof s === 'object' && 'value' in s) return String((s as { value: unknown }).value).trim()
  return String(s).trim()
}

/**
 * The roots of a polynomial equation, checked by G2 (polyRootsCheck): the proposed solutions must be every root in the
 * domain, each with its multiplicity. A root that G2 cannot read exactly is 'unknown'. A root is listed once: a double
 * root is one entry with multiplicity 2, so two entries with the same exact value are invalid (S1b review round 1).
 */
export function checkRootSetG2(eq: string, solutions: unknown[], domain: 'real' | 'complex'): ValidationVerdict {
  const text = plainForG2(eq)
  if (text === null) return 'unknown'
  const roots: { value: string; multiplicity: number }[] = []
  const exact: G2Alg[] = []
  for (const s of solutions) {
    const value = solutionValueText(s)
    const x = plainForG2(value) === null ? null : readSurd(value)
    if (x === null) return 'unknown'
    if (exact.some((y) => algEq(x, y))) return 'invalid'
    exact.push(x)
    const m = s && typeof s === 'object' && 'multiplicity' in s ? Number((s as { multiplicity: unknown }).multiplicity) : 1
    roots.push({ value, multiplicity: m })
  }
  return fromG2(polyRootsCheck(text, roots, domain))
}

/**
 * Two expressions equal, decided by G2 when both are plain text it reads: 'equal' only from exact arithmetic (its numbers
 * never give it). rationalEqual is asked first, because expressionEqual says 'equal' for a cancelled denominator without
 * its excluded points (x(x − 1)/(x − 1) against x). A cancelled denominator, or a list of excluded points that G2 cannot
 * complete, is 'unknown' here: an expression step has nowhere to show the excluded points, so only an exact equality
 * with none is valid.
 */
export function expressionEqualG2(before: string, after: string): ValidationVerdict {
  const a = plainForG2(before)
  const b = plainForG2(after)
  if (a === null || b === null) return 'unknown'
  const quotient = rationalEqual(a, b)
  if (quotient.verdict === 'equal') return quotient.excluded.length === 0 && quotient.excludedComplete ? 'valid' : 'unknown'
  return fromG2(expressionEqual(a, b))
}

/**
 * The square-root step with a surd root r (S1b): the before is the rational form (x − s)² − r² = 0, with r² a rational;
 * the after is the factored form that surdFactoredTex writes for s and r. Exact: no float, no guess.
 */
function checkSurdSquareRootPm(before: string | MathNode, after: string | MathNode, op: { shift: string; root: string }, v: string): ValidationVerdict {
  const s = parseExactRat(op.shift)
  const r = readSurd(op.root)
  if (!s || !r) return 'invalid'
  if (!isSquareRootForm(before, v, s)) return 'invalid'
  const r2 = algMul(r, r)
  if (!algIsRational(r2)) return 'invalid'
  const b = equationSides(before)
  if (!b || !eEq(b.R, constExpr(R0))) return 'invalid'
  const value = shapeOf(r2)?.p
  if (!value) return 'invalid'
  const shift = linearIn(v, R1, rNeg(s))
  const expected = eSub(eMul(shift, shift), constExpr(value))
  if (!eEq(b.L, expected)) return 'invalid'
  return normalizeDisplayed(String(after)) === normalizeDisplayed(surdFactoredTex(v, s, r)) ? 'valid' : 'invalid'
}

/** True when a square-root step's root is a surd (or i), not a rational: its own exact rule decides it. */
export function isSurdRootOp(op: EquationOp): boolean {
  return op.kind === 'square-root-pm' && isSurdText(op.root)
}

/** A display compared as one key: spaces out, a fraction with whole parts written a/b, so "\frac{3}{2}" and "3/2" agree. */
export function displayKey(text: string): string {
  return normalizeDisplayed(text)
    .replace(/\\frac\{(-?\d+)\}\{(\d+)\}/g, '$1/$2')
    .replace(/^-\\frac\{(\d+)\}\{(\d+)\}$/, '-$1/$2')
}

/** The exact square root of a positive rational, in simplest form: s√d with d squarefree (a rational when d is 1). */
export function surdSqrtOfRational(t: Rat): G2Alg | null {
  if (t.n <= 0n) return null
  const split = squareFreeSplit(t.n * t.d)
  if (!split) return null
  return { d: split.d, a: R0, b: rat(split.s, t.d), c: R0, e: R0 }
}

/**
 * A quadratic's solution set (S1b): G2 checks that the proposed roots are all the roots of the equation in the domain
 * (each with its multiplicity), and the displayed line names them in their exact display. Null when the equation is not a
 * quadratic (the caller keeps its own rule for linear equations).
 */
export function checkQuadraticSolutionSet(
  before: string,
  solutions: unknown[],
  after: string,
  v: string,
  domain: 'real' | 'complex'
): ValidationVerdict | null {
  const eq = tryEquationPoly(before)
  if (!eq || exprDegree(eq) !== 2) return null
  const verdict = checkRootSetG2(before, solutions, domain)
  if (verdict !== 'valid') return verdict
  const shown = displayedValues(after, v)
  if (shown === null || shown.length !== solutions.length) return 'invalid'
  for (let i = 0; i < solutions.length; i++) {
    const x = readSurd(solutionValueText(solutions[i]))
    if (!x) return 'unknown'
    if (displayKey(shown[i]) !== displayKey(texOfAlg(x))) return 'invalid'
  }
  return 'valid'
}

/**
 * The zero-product solution set of a surd square root (S1b): the before is the factored form that surdFactoredTex writes
 * for the step's shift and root, and the two solutions are shift − root and shift + root, in that order.
 */
export function checkSurdZeroProduct(
  before: string,
  zp: { shift: string; root: string },
  after: string,
  v: string,
  solutions: unknown[]
): ValidationVerdict {
  const s = parseExactRat(zp.shift)
  const r = readSurd(zp.root)
  if (!s || !r) return 'invalid'
  if (normalizeDisplayed(before) !== normalizeDisplayed(surdFactoredTex(v, s, r))) return 'invalid'
  const lo = algSub(algRat(s), r)
  const hi = algAdd(algRat(s), r)
  // The step's own solution data must be the same two roots (S1b review round 2): the sentence is built from it.
  const given = solutions.map((x) => {
    const t = solutionValueText(x)
    return plainForG2(t) === null ? null : readSurd(t)
  })
  if (given.length !== 2 || given[0] === null || given[1] === null) return 'invalid'
  const sameSet =
    (algEq(given[0], lo) && algEq(given[1], hi)) || (algEq(given[0], hi) && algEq(given[1], lo))
  if (!sameSet) return 'invalid'
  const shown = displayedValues(after, v)
  if (shown === null || shown.length !== 2) return 'invalid'
  return displayKey(shown[0]) === displayKey(texOfAlg(lo)) && displayKey(shown[1]) === displayKey(texOfAlg(hi))
    ? 'valid'
    : 'invalid'
}

/** The value of a proposed solution's plain text, for the sentences and the methods (S1b). */
export function solutionTextOf(s: unknown): string {
  return solutionValueText(s)
}

export { algRat, algEq, type G2Alg }

/** Sign (-1, 0, 1) of p + q·√d in ℚ(√d) with d ≥ 1, computed with exact rational arithmetic (no floats). */
function signOfSurd(p: Rat, q: Rat, d: bigint): number {
  const sp = p.n < 0n ? -1 : p.n > 0n ? 1 : 0
  const sq = q.n < 0n ? -1 : q.n > 0n ? 1 : 0
  if (sq === 0) return sp
  if (sp === 0) return sq
  if (sp === sq) return sp
  const p2 = rMul(p, p)
  const dq2 = rMul(rat(d), rMul(q, q))
  const diff = sp > 0 ? rSub(p2, dq2) : rSub(dq2, p2)
  return diff.n < 0n ? -1 : diff.n > 0n ? 1 : 0
}

/** Exact comparison of two real or complex algebraic numbers in ℚ(√d, i): real roots ascending, then complex by (re, im). */
export function compareAlgRoots(x: G2Alg, y: G2Alg): number {
  if (algEq(x, y)) return 0
  const xReal = rIsZero(x.c) && rIsZero(x.e)
  const yReal = rIsZero(y.c) && rIsZero(y.e)
  if (xReal !== yReal) return xReal ? -1 : 1
  if (x.d === y.d || rIsZero(x.b) || rIsZero(y.b)) {
    const d = !rIsZero(x.b) ? x.d : y.d
    const reSign = signOfSurd(rSub(x.a, y.a), rSub(x.b, y.b), d)
    if (reSign !== 0) return reSign
  }
  if (x.d === y.d || rIsZero(x.e) || rIsZero(y.e)) {
    const d = !rIsZero(x.e) ? x.d : y.d
    const imSign = signOfSurd(rSub(x.c, y.c), rSub(x.e, y.e), d)
    if (imSign !== 0) return imSign
  }
  const reX = Number(x.a.n) / Number(x.a.d) + (Number(x.b.n) / Number(x.b.d)) * Math.sqrt(Number(x.d))
  const reY = Number(y.a.n) / Number(y.a.d) + (Number(y.b.n) / Number(y.b.d)) * Math.sqrt(Number(y.d))
  if (reX !== reY) return reX < reY ? -1 : 1
  const imX = Number(x.c.n) / Number(x.c.d) + (Number(x.e.n) / Number(x.e.d)) * Math.sqrt(Number(x.d))
  const imY = Number(y.c.n) / Number(y.c.d) + (Number(y.e.n) / Number(y.e.d)) * Math.sqrt(Number(y.d))
  return imX < imY ? -1 : imX > imY ? 1 : 0
}

/**
 * A polynomial equation's solution set (degree 2 or higher, S1b / S3): G2 checks that the proposed roots are all the
 * roots of the equation in the domain (each with its multiplicity), and the displayed line names them in their exact
 * display. Null when the equation is not a polynomial of degree at least 2.
 */
export function checkPolySolutionSet(
  before: string,
  solutions: unknown[],
  after: string,
  v: string,
  domain: 'real' | 'complex'
): ValidationVerdict | null {
  const eq = tryEquationPoly(before)
  if (!eq || exprDegree(eq) < 2) return null
  if (domain === 'complex' && solutions.length === 0) return 'invalid'
  const verdict = checkRootSetG2(before, solutions, domain)
  if (verdict !== 'valid') return verdict
  if (solutions.length === 0) {
    return normalizeDisplayed(after) === normalizeDisplayed('\\text{No real solution}') ? 'valid' : 'invalid'
  }
  const shown = displayedValues(after, v)
  if (shown === null || shown.length !== solutions.length) return 'invalid'
  for (let i = 0; i < solutions.length; i++) {
    const x = readSurd(solutionValueText(solutions[i]))
    if (!x) return 'unknown'
    if (displayKey(shown[i]) !== displayKey(texOfAlg(x))) return 'invalid'
  }
  return 'valid'
}

/** True when every root (exact, in ℚ(√d, i)) makes the polynomial expr equal to zero in v: the working's own check (S3). */
export function polyRootsHold(expr: Expr, v: string, roots: G2Alg[]): boolean {
  const deg = exprDegree(expr)
  return roots.every((r) => {
    let acc = algRat(R0)
    for (let k = deg; k >= 0; k--) {
      const c = coefficientOf(expr, v, k)
      acc = algAdd(algMul(acc, r), algRat(c))
    }
    return algEq(acc, algRat(R0))
  })
}

/** True when every root (exact, in ℚ(√d, i)) makes a·x² + b·x + c equal to zero: the working's own check (S1b). */
export function quadraticRootsHold(a: bigint, b: bigint, c: bigint, roots: G2Alg[]): boolean {
  return roots.every((r) => {
    const value = algAdd(algAdd(algMul(algRat(rat(a)), algMul(r, r)), algMul(algRat(rat(b)), r)), algRat(rat(c)))
    return algEq(value, algRat(R0))
  })
}

// ============================================================================
// R1: rational equations, one letter in a denominator (rational.ts, validate.ts). Each side is read exactly by G2's reader
// as a numerator over a denominator. The excluded values are the zeros of the denominators; the multiplier is their least
// common multiple; the final roots are decided by G2 against the ORIGINAL equation, which already leaves the excluded values
// out. Every decision here is exact rational arithmetic or G2's exact field: no floats, no sampling.
// ============================================================================

/** A rational equation in one letter, read exactly: both sides as numerator over denominator, and every denominator met. */
export interface RationalRead {
  v: string
  left: RF
  right: RF
  /** Every denominator the reader met on either side, each a polynomial in v (the products are kept as they are). */
  dens: Expr[]
}

/** One side read exactly by G2's reader: null when it cannot, or when it holds |…| (not a plain rational function). */
function readRationalSide(text: string): { rf: RF; dens: Expr[] } | null {
  try {
    const e = readExact(text)
    if (e.atoms.length > 0) return null
    return { rf: e.rf, dens: e.dens }
  } catch {
    return null
  }
}

/**
 * A rational equation in one letter, read exactly. Null for anything else: not one equation, two letters, a function the
 * reader does not hold, or no letter at all.
 */
export function readRationalEquation(text: string | MathNode): RationalRead | null {
  const split = splitEquation(text)
  if (!split || split.right.includes('=')) return null
  const left = readRationalSide(split.left)
  const right = readRationalSide(split.right)
  if (!left || !right) return null
  const letters = new Set<string>()
  for (const e of [left.rf.num, left.rf.den, right.rf.num, right.rf.den, ...left.dens, ...right.dens]) {
    for (const name of plainVars(e)) letters.add(name)
  }
  if (letters.size !== 1) return null
  return {
    v: [...letters][0],
    left: left.rf,
    right: right.rf,
    dens: [left.rf.den, right.rf.den, ...left.dens, ...right.dens]
  }
}

/**
 * The rational linear factors of a polynomial over ℚ: its leading coefficient, and each distinct rational root with the power
 * it has. Null when some factor is not a rational linear one (x² + 1, say), or the polynomial is zero.
 */
export function linearFactorsOf(p0: Poly): { lead: Rat; roots: Array<{ r: Rat; m: number }> } | null {
  let cur = pTrim(p0)
  if (pIsZero(cur)) return null
  const lead = pLead(cur)
  cur = cur.map((c) => rDiv(c, lead))
  const roots: Array<{ r: Rat; m: number }> = []
  // Each root found is divided out at once, so the degree falls on every pass (or the search gives up and says null).
  while (pDeg(cur) > 0) {
    const r = findRationalRootDetailed(cur).root
    if (r === null) return null
    const linear: Poly = [rNeg(r), R1]
    let m = 0
    for (;;) {
      const { q, r: rest } = pDivMod(cur, linear)
      if (!pIsZero(rest)) break
      cur = q
      m++
    }
    if (m === 0) return null
    roots.push({ r, m })
  }
  return { lead, roots }
}

/** The exclusions and the multiplier of a rational equation. */
export interface RationalShape {
  v: string
  /** The least common multiple of the denominators' leading whole numbers (1 when they are monic). */
  k: bigint
  /**
   * The excluded values: the distinct zeros of the denominators, ascending, each with the highest power it has in any one
   * denominator (the multiplier takes that power, so it is the least common multiple of the denominators).
   */
  roots: Array<{ r: Rat; m: number }>
}

/**
 * The shape of a rational equation from its denominators. Null when one of them is not a product of rational linear factors
 * with a whole-number leading coefficient: such an equation is not worked here, and its answer stays as it was.
 */
export function rationalShapeOf(read: RationalRead): RationalShape | null {
  let k = 1n
  const best = new Map<string, { r: Rat; m: number }>()
  for (const d of read.dens) {
    let p: Poly
    try {
      p = polyFromExpr(d, read.v).poly
    } catch {
      return null
    }
    const f = linearFactorsOf(p)
    if (!f || f.lead.d !== 1n || f.lead.n === 0n) return null
    k = blcm(k, f.lead.n < 0n ? -f.lead.n : f.lead.n)
    for (const { r, m } of f.roots) {
      const key = rStr(r)
      best.set(key, { r, m: Math.max(m, best.get(key)?.m ?? 0) })
    }
  }
  const roots = [...best.values()].sort((a, b) => rCmp(a.r, b.r))
  return { v: read.v, k, roots }
}

/** The multiplier as a polynomial: the whole number k, times (x − r) to the power m for each excluded value r. */
export function multiplierPoly(shape: RationalShape): Poly {
  let p: Poly = [rat(shape.k)]
  for (const { r, m } of shape.roots) for (let i = 0; i < m; i++) p = pMul(p, [rNeg(r), R1])
  return pTrim(p)
}

/** The multiplier as the text a working shows and the checker reads back: "x(x - 1)", "2(x + 3)^2". */
export function multiplierText(shape: RationalShape): string {
  let out = shape.k === 1n ? '' : String(shape.k)
  for (const { r, m } of shape.roots) {
    const factor = rIsZero(r) ? shape.v : rIsNeg(r) ? `(${shape.v} + ${rStr(rNeg(r))})` : `(${shape.v} - ${rStr(r)})`
    out += m === 1 ? factor : `${factor}^${m}`
  }
  return out
}

/**
 * Both sides multiplied by the multiplier, each as a polynomial: its numerator times the multiplier, divided exactly by its
 * denominator. Null when the division leaves a remainder (the multiplier then does not clear that side).
 */
export function clearedSides(read: RationalRead, multiplier: Poly): { lhs: Poly; rhs: Poly } | null {
  const clear = (rf: RF): Poly | null => {
    try {
      const num = polyFromExpr(rf.num, read.v).poly
      const den = polyFromExpr(rf.den, read.v).poly
      if (pIsZero(den)) return null
      const { q, r } = pDivMod(pMul(num, multiplier), den)
      return pIsZero(r) ? q : null
    } catch {
      return null
    }
  }
  const lhs = clear(read.left)
  const rhs = clear(read.right)
  return lhs && rhs ? { lhs, rhs } : null
}

/** The excluded values of a rational equation as exact numbers, or null when they cannot be read exactly. */
export function rationalExcludedOf(text: string | MathNode): Rat[] | null {
  const read = readRationalEquation(text)
  const shape = read ? rationalShapeOf(read) : null
  return shape ? shape.roots.map((x) => x.r) : null
}

/**
 * The exclusions step: the equation is unchanged (before = after), and the values it names are exactly the zeros of its
 * denominators. Each value is named once, and the list is complete.
 */
function checkRationalExclusion(before: string | MathNode, after: string | MathNode, payload: Record<string, unknown>): ValidationVerdict {
  if (!sameState(before, after)) return 'invalid'
  const excluded = rationalExcludedOf(before)
  if (excluded === null) return 'unknown'
  if (excluded.length === 0 || !Array.isArray(payload.excluded)) return 'invalid'
  const named: Rat[] = []
  for (const t of payload.excluded) {
    const r = typeof t === 'string' ? parseExactRat(t) : null
    if (!r || named.some((x) => rEq(x, r))) return 'invalid'
    named.push(r)
  }
  if (named.length !== excluded.length) return 'invalid'
  return excluded.every((e) => named.some((x) => rEq(x, e))) ? 'valid' : 'invalid'
}

/**
 * The multiplying step of a rational equation: each side after is the side before times the multiplier, as rational functions.
 * The identity N·m = P·D is exact polynomial arithmetic, so it holds wherever the sides before are defined, which is all an
 * implication claims (the excluded values are handled by the ending, not here).
 */
function checkRationalMultiply(
  eq1: { left: string; right: string },
  eq2: { left: string; right: string },
  multiplier: unknown
): ValidationVerdict {
  if (typeof multiplier !== 'string') return 'unknown'
  const m = tryParsePoly(multiplier)
  if (!m) return 'unknown'
  if (m.length === 0) return 'invalid'
  const l1 = readRationalSide(eq1.left)
  const r1 = readRationalSide(eq1.right)
  const l2 = tryParsePoly(eq2.left)
  const r2 = tryParsePoly(eq2.right)
  if (!l1 || !r1 || !l2 || !r2) return 'unknown'
  const times = (side: RF, target: Expr): boolean =>
    rfSame(rfMul(side, { num: m, den: constExpr(R1) }), { num: target, den: constExpr(R1) })
  return times(l1.rf, l2) && times(r1.rf, r2) ? 'valid' : 'invalid'
}

/**
 * The roots a rational equation's polynomial sub-working found, split by the excluded values: a rational root that is an
 * excluded value is rejected (it makes a denominator 0); every other root is kept. Each root is listed once; the kept ones
 * ascend.
 */
export function splitExcludedRoots(candidates: G2Alg[], excluded: Rat[]): { kept: G2Alg[]; rejected: Rat[] } {
  const kept: G2Alg[] = []
  const rejected: Rat[] = []
  for (const x of candidates) {
    if (kept.some((y) => algEq(x, y)) || (algIsRational(x) && rejected.some((y) => rEq(y, x.a)))) continue
    if (algIsRational(x) && excluded.some((e) => rEq(e, x.a))) rejected.push(x.a)
    else kept.push(x)
  }
  kept.sort(compareAlgRoots)
  rejected.sort(rCmp)
  return { kept, rejected }
}

/**
 * The ending of a rational equation (rational.ts). The kept values must be every root of the ORIGINAL equation in the real
 * line: G2 cancels the excluded values, so an excluded value is never a root there and never kept. Each rejected value must be
 * an excluded value that is a root of the polynomial the working solved, and the displayed line names exactly the kept values
 * (or says no value works). The text of the original is what the working was given; the validator binds it to the input.
 */
export function checkRationalEnding(
  original: string,
  polyState: string,
  kept: string[],
  rejected: string[],
  v: string,
  after: string
): ValidationVerdict {
  const read = readRationalEquation(original)
  const shape = read ? rationalShapeOf(read) : null
  if (!read || !shape) return 'unknown'
  const excluded = shape.roots.map((x) => x.r)
  const state = tryEquationPoly(polyState)
  if (!state) return 'invalid'
  const rejectedValues: Rat[] = []
  for (const t of rejected) {
    const r = parseExactRat(t)
    if (!r || !excluded.some((e) => rEq(e, r)) || rejectedValues.some((x) => rEq(x, r))) return 'invalid'
    rejectedValues.push(r)
  }
  if (!polyRootsHold(state, v, rejectedValues.map(algRat))) return 'invalid'
  const roots: G2Alg[] = []
  for (const t of kept) {
    const x = plainForG2(t) === null ? null : readSurd(t)
    if (!x) return 'unknown'
    if (roots.some((y) => algEq(x, y))) return 'invalid'
    roots.push(x)
  }
  for (let i = 1; i < roots.length; i++) if (compareAlgRoots(roots[i - 1], roots[i]) >= 0) return 'invalid'
  const plainOriginal = plainForG2(original)
  if (plainOriginal === null) return 'unknown'
  const verdict = polyRootsCheck(
    plainOriginal,
    kept.map((value) => ({ value, multiplicity: 1 })),
    'real'
  )
  if (verdict !== 'equal') return verdict === 'different' ? 'invalid' : 'unknown'
  if (kept.length === 0) {
    return normalizeDisplayed(after) === normalizeDisplayed(`\\text{no value of ${v} works}`) ? 'valid' : 'invalid'
  }
  const shown = displayedValues(after, v)
  if (shown === null || shown.length !== roots.length) return 'invalid'
  return roots.every((x, i) => displayKey(shown[i]) === displayKey(texOfAlg(x))) ? 'valid' : 'invalid'
}

/**
 * A higher equation's solution set (non-polynomial, S3b): verified against displayed solutions.
 * Null when the input is not an equation or solutions is empty.
 */
export function checkHigherSolutionSet(
  before: string,
  solutions: unknown[],
  after: string,
  v: string,
  _domain: 'real' | 'complex' = 'real'
): ValidationVerdict | null {
  // Only an equation with a trig function is read here. A letter such as k is not a sign of one (S5c: k + 3 = 7 was valid).
  if (!/sin|cos|tan|\\sin|\\cos|\\tan|\\circ/i.test(before)) return null
  const sb = splitEquation(before)
  if (!sb) return null
  if (lettersOutside(before, v)) return null
  if (solutions.length === 0) {
    const proof = solutionProofOf(before, v)
    if (!proof || proof.kind !== 'none') return 'invalid'
    return normalizeDisplayed(after) === normalizeDisplayed('\\text{no value of ' + v + ' works}') ||
      normalizeDisplayed(after) === normalizeDisplayed('\\text{No real solution}')
      ? 'valid'
      : 'invalid'
  }
  // A listed root must solve the equation itself, and no root in [0, 360) may be left out: the displayed list alone proves nothing.
  const rootsCheck = checkListedRoots(before, solutions, v)
  // A list of plain numbers (x = -9.42 for x sin x = 0) is not an angle this reads, so it is never proved here, and the display
  // comparison below proves nothing about a root: the answer is unknown, not valid.
  if (rootsCheck === null) return 'unknown'
  if (rootsCheck !== 'valid') return rootsCheck
  const shown = displayedValues(after, v)
  if (shown === null || shown.length !== solutions.length) return 'invalid'
  for (let i = 0; i < solutions.length; i++) {
    const valText = solutionValueText(solutions[i])
    if (displayKey(shown[i]) !== displayKey(valText)) {
      const s = readSurd(valText)
      if (!s || displayKey(shown[i]) !== displayKey(texOfAlg(s))) return 'invalid'
    }
  }
  return 'valid'
}

// ---- The quadratic formula with its numbers put in (Phase 0.9 K). One template is written by the method and read by the
// checks, so the line the student reads is the line that was checked. The line is x = (P ± √D)/Q with P = −b, Q = 2a and
// D = b² − 4ac, all whole numbers. ----

/** The formula line with its numbers put in: "x = \frac{5 \pm \sqrt{1}}{2}". */
export function formulaStateTex(v: string, P: bigint, Q: bigint, D: bigint): string {
  return `${v} = \\frac{${P} \\pm \\sqrt{${D}}}{${Q}}`
}

/** The numbers of a formula line, read back from its text: the letter, P, Q and D. */
export interface FormulaState {
  v: string
  P: bigint
  Q: bigint
  D: bigint
}

/** A formula line, spaces removed; the only shape the template writes. */
const FORMULA_LINE = /^(\p{L})=\\frac\{(-?\d+)\\pm\\sqrt\{(-?\d+)\}\}\{(-?\d+)\}$/u

/** The numbers of a formula line, or null when the text is not one. Not run through latexToMath: that would unwrite it. */
export function readFormulaState(text: string | MathNode): FormulaState | null {
  const m = FORMULA_LINE.exec(normalizeDisplayed(String(text)))
  if (!m) return null
  return { v: m[1], P: BigInt(m[2]), D: BigInt(m[3]), Q: BigInt(m[4]) }
}

/** True when the text is a formula line (the state a quadratic is in after its formula step). */
export function isFormulaState(text: string | MathNode): boolean {
  return readFormulaState(text) !== null
}

/** The two values (P ± √D)/Q read exactly by G2 (a pair in ℚ(√d, i) for a negative D); null when G2 does not read them. */
function formulaRootsOf(st: FormulaState): G2Alg[] | null {
  const { P, Q, D } = st
  if (Q === 0n) return null
  if (D === 0n) {
    const x = readSurd(`${P}/${Q}`)
    return x ? [x] : null
  }
  // A negative discriminant gives i·√(−D), which G2 reads as "i*sqrt(...)" just as the answers are written.
  const root = D > 0n ? `sqrt(${D})` : `i*sqrt(${-D})`
  const plus = readSurd(`(${P} + ${root})/${Q}`)
  const minus = readSurd(`(${P} - ${root})/${Q}`)
  return plus && minus ? [plus, minus] : null
}

/** True when two lists of exact numbers hold the same values, each once (order does not matter). */
function sameExactValues(xs: G2Alg[], ys: G2Alg[]): boolean {
  if (xs.length !== ys.length) return false
  return xs.every((x) => ys.some((y) => algEq(x, y))) && ys.every((y) => xs.some((x) => algEq(x, y)))
}

/**
 * The quadratic's a, b, c as whole numbers, read from the equation's own polynomial (left side less right side) by the
 * one letter in it. Null when the text is not a quadratic in one letter with whole coefficients and a above zero.
 */
function wholeQuadratic(text: string | MathNode): { v: string; a: bigint; b: bigint; c: bigint } | null {
  const eq = tryEquationPoly(text)
  if (!eq || exprDegree(eq) !== 2) return null
  const names = varsOf(eq)
  if (names.length !== 1) return null
  const v = names[0]
  const whole = (k: number): bigint | null => {
    const r = coefficientOf(eq, v, k)
    return r.d === 1n ? r.n : null
  }
  const a = whole(2)
  const b = whole(1)
  const c = whole(0)
  if (a === null || b === null || c === null || a <= 0n) return null
  return { v, a, b, c }
}

/**
 * The quadratic formula step (an Implication with action 'quadratic-formula'): the before is the quadratic, the after is
 * the formula with its numbers put in. The numbers are read from the before exactly (P = −b, Q = 2a, D = b² − 4ac); the
 * after's ± roots are then compared with the true roots of the before, exactly. A line that is not a formula line of the
 * same letter is unknown; a formula line with a wrong number, or roots that are not the true ones, is invalid.
 */
function checkQuadraticFormulaStep(before: string | MathNode, after: string | MathNode): ValidationVerdict {
  const q = wholeQuadratic(before)
  if (!q) return 'unknown'
  const st = readFormulaState(after)
  if (!st || st.v !== q.v) return 'unknown'
  const { a, b, c } = q
  if (st.P !== -b || st.Q !== 2n * a || st.D !== b * b - 4n * a * c) return 'invalid'
  const shown = formulaRootsOf(st)
  const truth = quadraticRootsOf(a, b, c)
  if (!shown || !truth) return 'unknown'
  return sameExactValues(shown, truth) ? 'valid' : 'invalid'
}

/**
 * The roots step after a formula line (a SolutionSetEq whose before is the formula line): the line's own numbers give the
 * equation a·x² + b·x + c = 0 (a = Q/2, b = −P, and c from D = b² − 4ac, which must come out whole), and the proposed
 * solutions must be exactly that equation's roots in the domain, displayed as they are. Anything else is invalid.
 */
export function checkFormulaSolutionSet(
  before: string,
  solutions: unknown[],
  after: string,
  v: string,
  domain: 'real' | 'complex'
): ValidationVerdict {
  const st = readFormulaState(before)
  if (!st || st.v !== v) return 'invalid'
  if (st.Q <= 0n || st.Q % 2n !== 0n) return 'invalid'
  const a = st.Q / 2n
  const b = -st.P
  const num = b * b - st.D
  if (num % (4n * a) !== 0n) return 'invalid'
  const c = num / (4n * a)
  const equation = `(${a})*${v}^2 + (${b})*${v} + (${c}) = 0`
  return checkQuadraticSolutionSet(equation, solutions, after, v, domain) ?? 'invalid'
}

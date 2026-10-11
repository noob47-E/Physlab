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
  type Expr
} from '../pure/mono'
import { rat, rEq, rMul, rIsZero, rDiv, rAdd, rSub, rNeg, rIsNeg, R1, type Rat } from '../pure/rat'
import { latexToMath } from '../latexToMath'
import { preprocess } from '../expr'
import type { EquationOp, ValidationVerdict } from './types'

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
  checkSolutionSetEq: (equationOrSet: unknown, proposedSolutions: unknown[], variable?: string) => ValidationVerdict
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

    // Outside polynomial exact ring before G2 merges: return 'unknown'
    return 'unknown'
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
    rule?: string,
    data?: unknown
  ): ValidationVerdict {
    // If they are actually equivalent, the implication trivially holds
    const equiv = defaultCheckAdapter.checkEquationEquiv(before, after)
    if (equiv === 'valid') return 'valid'

    const sBefore = stringifyNodeOrText(before)
    const sAfter = stringifyNodeOrText(after)
    const eq1 = splitEquation(sBefore)
    const eq2 = splitEquation(sAfter)

    const payload = (data && typeof data === 'object') ? (data as Record<string, unknown>) : {}
    const action = (typeof payload.action === 'string' ? payload.action : rule ?? '').toLowerCase()

    if (eq1 && eq2) {
      // Squaring both sides: L1^2 = R1^2
      if (action.includes('square') || action.includes('squaring')) {
        const l1 = tryParsePoly(eq1.left)
        const r1 = tryParsePoly(eq1.right)
        const l2 = tryParsePoly(eq2.left)
        const r2 = tryParsePoly(eq2.right)

        if (l1 && r1 && l2 && r2) {
          const l1Sq = ePow(l1, 2)
          const r1Sq = ePow(r1, 2)
          if (eEq(l2, l1Sq) && eEq(r2, r1Sq)) {
            return 'valid'
          }
          return 'invalid'
        }
      }

      // Multiplying both sides by factor M
      if (action.includes('multiply') || payload.multiplier) {
        const mText = typeof payload.multiplier === 'string' ? payload.multiplier : ''
        const mPoly = mText ? tryParsePoly(mText) : null
        if (mPoly) {
          const l1 = tryParsePoly(eq1.left)
          const r1 = tryParsePoly(eq1.right)
          const l2 = tryParsePoly(eq2.left)
          const r2 = tryParsePoly(eq2.right)
          if (l1 && r1 && l2 && r2) {
            const expL2 = eMul(l1, mPoly)
            const expR2 = eMul(r1, mPoly)
            if (eEq(l2, expL2) && eEq(r2, expR2)) {
              return 'valid'
            }
            return 'invalid'
          }
        }
      }
    }

    // If an invalid claim was made where counterexamples exist (e.g. invalid arithmetic)
    if (action.includes('square') && eq1 && eq2) {
      return 'invalid'
    }

    return 'unknown'
  },

  /**
   * CaseSplitComplete: verifies that the case split completely covers the domain.
   */
  checkCaseSplitComplete(_domainOrCondition: unknown, cases: unknown[]): ValidationVerdict {
    if (!Array.isArray(cases) || cases.length === 0) return 'invalid'

    const strCases = cases.map((c) => (typeof c === 'string' ? c.trim() : JSON.stringify(c)))
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
    variable = 'x'
  ): ValidationVerdict {
    if (!Array.isArray(proposedSolutions) || proposedSolutions.length === 0) return 'unknown'

    const eqStr = typeof equationOrSet === 'string' ? equationOrSet : ''
    const pDiff = tryEquationPoly(eqStr)
    if (!pDiff) return 'unknown'

    const vars = varsOf(pDiff)
    if (vars.some((name) => name !== variable)) return 'invalid'
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

export function checkEquationOp(
  before: string | MathNode,
  after: string | MathNode,
  op: EquationOp,
  v: string
): ValidationVerdict {
  // A letter other than v anywhere in the states, even one that cancels, means no proof (review delta3, SHOULD 1).
  if (lettersOutside(before, v) || lettersOutside(after, v)) return 'unknown'
  const b = equationSides(before)
  const a = equationSides(after)
  if (!b || !a) return 'unknown'
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
      return withNumber(op.k, (k) => same(a.L, scalePoly(b.L, k)) && same(a.R, scalePoly(b.R, k)))
    case 'divide-both':
      return withNumber(op.k, (k) => same(scalePoly(a.L, k), b.L) && same(scalePoly(a.R, k), b.R))
    case 'clear-decimals': {
      // The multiplier is a power of ten (at least 10), and the before really has a decimal to clear.
      if (!hasDecimalLiteral(rawText(before))) return 'invalid'
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
      if (!leftChanged && !rightChanged) return 'invalid'
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
  const split = splitEquation(input)
  const sides = split ? [split.left, split.right] : [input]
  const names = new Set<string>()
  for (const side of sides) {
    const poly = tryParsePoly(side)
    if (!poly) return null
    for (const n of varsOf(poly)) names.add(n)
  }
  return names.size === 1 ? [...names][0] : null
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
  const bare = rawText(text).replace(/\\[A-Za-z]+/g, ' ')
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

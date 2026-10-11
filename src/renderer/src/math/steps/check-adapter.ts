// The check adapter: all step validators call answer checkers through this ONE file.
//
// Part of the PhysLab step engine (S0).
// Checkers (part G2, math/check/) are being built by Jules and the Pro.
// Until G2 merges, this adapter uses a minimal exact path over BigInt rationals
// for polynomial equality. Everything else returns 'unknown' so nothing unproved
// is ever shown on screen.

import type { MathNode } from 'mathjs'
import {
  parseExpr,
  eEq,
  eAdd,
  eSub,
  eMul,
  ePow,
  exprDegree,
  varsOf,
  type Expr
} from '../pure/mono'
import { rat, rEq, rMul, rIsZero, rDiv, rAdd } from '../pure/rat'
import { latexToMath } from '../latexToMath'
import type { ValidationVerdict } from './types'

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
  checkSubproblemReduction: (
    parent: unknown,
    subProblems: unknown[],
    parentAnswer: unknown,
    subAnswers: unknown[]
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
   * EquationEquiv: verifies that two equations have the exact same solution set.
   * Compares the polynomial differences L1 - R1 and L2 - R2.
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
   * SolutionSetEq: verifies that the proposed solution set matches the equation's roots exactly.
   */
  checkSolutionSetEq(
    equationOrSet: unknown,
    proposedSolutions: unknown[],
    variable = 'x'
  ): ValidationVerdict {
    if (!Array.isArray(proposedSolutions)) return 'invalid'

    const eqStr = typeof equationOrSet === 'string' ? equationOrSet : ''
    const pDiff = tryEquationPoly(eqStr)

    if (pDiff) {
      const vars = varsOf(pDiff)
      if (vars.length > 1 || (vars.length === 1 && vars[0] !== variable)) {
        return 'invalid'
      }

      const deg = exprDegree(pDiff)
      if (deg === 1) {
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

        // Evaluate pDiff at rootRat
        // Accumulate a and b with rAdd
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
        // Check a * rootRat + b == 0
        const val = rAdd(rMul(a, rootRat), b)
        return rIsZero(val) ? 'valid' : 'invalid'
      }

      if (deg === 0) {
        // 0 = 0 (infinite) or 1 = 0 (no solution)
        const isIdent = pDiff.length === 0
        if (isIdent && proposedSolutions.length === 0) return 'invalid'
        if (!isIdent && proposedSolutions.length === 0) return 'valid'
        return 'invalid'
      }
    }

    return 'unknown'
  },

  /**
   * SubproblemReduction: verifies that the parent answer follows soundly from the sub-answers.
   */
  checkSubproblemReduction(
    _parent: unknown,
    _subProblems: unknown[],
    parentAnswer: unknown,
    subAnswers: unknown[]
  ): ValidationVerdict {
    if (!Array.isArray(subAnswers) || subAnswers.length === 0) return 'invalid'

    // Case 1: Union of solution sets from split cases / factors
    if (typeof parentAnswer === 'object' && parentAnswer !== null && 'solutions' in parentAnswer) {
      const pSols = (parentAnswer as { solutions: unknown[] }).solutions
      if (!Array.isArray(pSols)) return 'invalid'
      const allSubSols = subAnswers.flatMap((sa) =>
        typeof sa === 'object' && sa !== null && 'solutions' in sa
          ? (sa as { solutions: unknown[] }).solutions
          : [sa]
      )
      const setP = new Set(pSols.map((x) => String(x).trim()))
      const setSub = new Set(allSubSols.map((x) => String(x).trim()))
      if (setP.size !== setSub.size) return 'invalid'
      for (const item of setSub) {
        if (!setP.has(item)) return 'invalid'
      }
      return 'valid'
    }

    // Case 2: Sum / combination of derivative rules: (u + v)' = u' + v'
    const parentStr = typeof parentAnswer === 'string' ? parentAnswer : JSON.stringify(parentAnswer)
    const subStrs = subAnswers.map((s) => (typeof s === 'string' ? s : JSON.stringify(s)))

    const pPoly = tryParsePoly(parentStr)
    const subPolys = subStrs.map(tryParsePoly)
    if (pPoly && subPolys.every((sp) => sp !== null)) {
      let total: Expr = []
      for (const sp of subPolys) {
        if (!sp) return 'unknown'
        total = eAdd(total, sp)
      }
      return eEq(pPoly, total) ? 'valid' : 'invalid'
    }

    return 'unknown'
  }
}

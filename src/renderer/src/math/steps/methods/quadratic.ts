// The shared front of the three quadratic methods (S1a): bring the equation to a·x² + b·x + c = 0 with
// whole numbers, a > 0 and no common factor, and work out the discriminant and the rational roots.
//
// The normalising steps are the same for every method. Each one is an EquationEquiv with a declared op,
// checked side by side: moving every term to the left, clearing fractions and dividing out a factor.

import type { EquationOp, Problem, Step, StepAnswer, Working } from '../types'
import { CANT_SHOW_STEPS_REASON } from '../router'
import { eSub, evalAt, exprDegree, normalize, type Expr } from '../../pure/mono'
import { bgcd, rat, rDiv, rSqrt, rStr, rTex, type Rat } from '../../pure/rat'
import { clearDenominators, equationStep, expandAndCollect, readEquation, sidesOf, type Sides } from './equation'
import type { Domain } from '../types'

export interface Quadratic {
  v: string
  /** The leading coefficient, always above zero after the normalising steps. */
  a: bigint
  b: bigint
  c: bigint
  /** a·v² + b·v + c as an expression. */
  expr: Expr
  /** The equation after the normalising steps, as the validators read it: "x^2 - 5x + 6 = 0". */
  text: string
  /** The normalising steps (possibly none). */
  steps: Step[]
  /** The equation as typed, after stringify. */
  start: string
  domain: Domain
}

/** The coefficient of the power p of a collected expression, as a whole number, or null when it is not one. */
function wholeCoeff(e: Expr, v: string, p: number): bigint | null {
  const t = e.find((term) => (term.v[v] ?? 0) === p)
  if (!t) return 0n
  return t.c.d === 1n ? t.c.n : null
}

function absBig(n: bigint): bigint {
  return n < 0n ? -n : n
}

/** Divide every term of an expression by a non-zero whole number. */
function divideExpr(e: Expr, k: bigint): Expr {
  return normalize(e.map((t) => ({ c: rDiv(t.c, rat(k)), v: { ...t.v } })))
}

/** The move that divides out the common factor d of every coefficient (d may be negative). */
function factorOp(divisor: bigint): EquationOp {
  if (divisor === -1n) return { kind: 'multiply-both', k: '-1', purpose: 'leading-positive' }
  if (divisor < 0n) return { kind: 'divide-both', k: String(divisor), purpose: 'leading-positive' }
  return { kind: 'divide-both', k: String(divisor), purpose: 'common-factor' }
}

/** The normalised quadratic of a problem, or null when the input is not a quadratic in one letter. */
export function quadraticOf(problem: Problem): Quadratic | null {
  const r = readEquation(problem)
  if (!r) return null
  const v = r.v
  const steps: Step[] = []
  let cur: Sides = expandAndCollect(r, steps)

  // Bring every term to the left: "x^2 = 5x - 6" becomes "x^2 - 5x + 6 = 0".
  if (cur.rhs.length > 0) {
    const next = sidesOf(eSub(cur.lhs, cur.rhs), [], v)
    steps.push(equationStep(cur.text, next.text, { kind: 'move-to-left' }, v))
    cur = next
  }

  // Clear any fractions or decimals so that every coefficient is a whole number.
  cur = clearDenominators(cur, v, steps)

  const expr = cur.lhs
  if (exprDegree(expr) !== 2) return null
  const a0 = wholeCoeff(expr, v, 2)
  const b0 = wholeCoeff(expr, v, 1)
  const c0 = wholeCoeff(expr, v, 0)
  if (a0 === null || b0 === null || c0 === null || a0 === 0n) return null
  if (expr.some((t) => Object.keys(t.v).some((name) => name !== v))) return null

  // Divide out the common factor, and make the x² term positive.
  const g = bgcd(bgcd(absBig(a0), absBig(b0)), absBig(c0))
  const divisor = a0 < 0n ? -g : g
  let finalExpr = expr
  if (divisor !== 1n) {
    const next = sidesOf(divideExpr(expr, divisor), [], v)
    steps.push(equationStep(cur.text, next.text, factorOp(divisor), v))
    cur = next
    finalExpr = next.lhs
  }

  const a = wholeCoeff(finalExpr, v, 2)
  const b = wholeCoeff(finalExpr, v, 1)
  const c = wholeCoeff(finalExpr, v, 0)
  if (a === null || b === null || c === null || a <= 0n) return null
  return {
    v,
    a,
    b,
    c,
    expr: finalExpr,
    text: cur.text,
    steps,
    start: r.start,
    domain: problem.domain ?? 'real'
  }
}

/** b² − 4ac. */
export function discriminantOf(q: Quadratic): bigint {
  return q.b * q.b - 4n * q.a * q.c
}

/** The two roots, smaller first, when they are rational; null otherwise. */
export function rationalRoots(q: Quadratic): { lo: Rat; hi: Rat } | null {
  const disc = discriminantOf(q)
  if (disc < 0n) return null
  const s = rSqrt(rat(disc))
  if (!s) return null
  return { lo: rat(-q.b - s.n, 2n * q.a), hi: rat(-q.b + s.n, 2n * q.a) }
}

/** The answers for a list of distinct roots, smallest first. */
export function rootAnswers(v: string, roots: Rat[]): StepAnswer[] {
  return roots.map((r) => ({ label: v, tex: rTex(r), value: rStr(r) }))
}

/** A working that carries no steps: the router turns it into "I can't show the steps". */
export function noWorking(): Working {
  return { steps: [], noWorking: true, reason: CANT_SHOW_STEPS_REASON }
}

/** Check that the working's answers really are roots of the quadratic (exact arithmetic). */
export function rootsCheck(q: Quadratic, roots: Rat[]): 'ok' | 'failed' {
  return roots.every((r) => evalAt(q.expr, { [q.v]: r }).n === 0n) ? 'ok' : 'failed'
}

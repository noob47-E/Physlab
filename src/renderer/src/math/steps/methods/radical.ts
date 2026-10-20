// Equations with a square root (Part R): sqrt(P) = Q, or sqrt(P) = sqrt(B), solved the way a student does it.
// The root is isolated (a checked move), both sides are squared (the Implication "Squaring"), the squared equation is solved
// through the router, and every root is put back into the ORIGINAL equation. A root that does not hold is extraneous and is
// rejected in words. A square root is never negative, so sqrt(P) = c with c below zero has no solution, and nothing is squared.
//
// A root may carry a coefficient on its own side (2·sqrt(x) = x − 3): the squaring then squares the coefficient with the root,
// so 2·sqrt(x) squares to 4x. Two roots on one side, a coefficient on the root of the other side, or a squared equation with
// no rational root give no working, so the Calculator's old answer stays. Nothing here is shown unless the checks pass.

import type { Method, Problem, Step, StepAnswer, StepRouter, Working } from '../types'
import { finishStep } from '../sentences'
import { eNeg, eSub, eMul, exprDegree, normalize, type Expr, type Term } from '../../pure/mono'
import { R1, rEq, rIsNeg, rIsZero, rMul, type Rat } from '../../pure/rat'
import {
  RadicalRegistry,
  checkCandidate,
  isNoRealSolution,
  radicalVarOf,
  ratValue,
  readRadicalEquation,
  rationalsOf,
  rootIndexOf,
  scaleExpr,
  writeSide,
  type RadicalEquation,
  type RadicalRootCheck
} from '../radicalForm'
import { noWorking } from './quadratic'

const RADICAL_ID = 'radical.equation'
const METHOD_NAME = 'Equation with square roots'

/** The shape of a radical equation this method solves, read once and used for the appliesTo test and for the working. */
interface Plan {
  v: string
  reg: RadicalRegistry
  eq: RadicalEquation
  /** The root is on the right: the sides are swapped first. */
  swap: boolean
  /** The root of the side with the root, alone (with its coefficient, if it has one). */
  rootL: Expr
  /** The coefficient the root carries on its side: 1 for sqrt(P), 2 for 2 sqrt(P). */
  coef: Rat
  /** The polynomial part of that side, which isolating the root moves across. Empty when the root is alone. */
  moved: Expr
  /** The other side once `moved` has crossed (or the second root, alone, when both sides hold one). */
  rightAfter: Expr
  /** The second root, alone, when the other side holds one too. */
  rightRoot: Expr | null
  /** The squared root side: coef² times the radicand (what the squaring turns the root side into). */
  squaredL: Expr
  /** "negative": sqrt(P) = c with c below zero, no solution. "square": the squared equation is solved next. */
  kind: 'negative' | 'square'
}

/** A term that is exactly one root, with coefficient one and no letter beside it. */
function isLoneRoot(t: Term, reg: RadicalRegistry): boolean {
  return rEq(t.c, R1) && rootIndexOf(t, reg) !== null && Object.keys(t.v).filter((k) => t.v[k] !== 0).length === 1
}

/** A term that is exactly one root with any non-zero coefficient and no letter beside it: 2·sqrt(x), -sqrt(x). */
function isRootAlone(t: Term, reg: RadicalRegistry): boolean {
  return !rIsZero(t.c) && rootIndexOf(t, reg) !== null && Object.keys(t.v).filter((k) => t.v[k] !== 0).length === 1
}

/** The plan of a radical equation this method solves, or null when its shape is not one it decides. */
function planOf(problem: Problem): Plan | null {
  if (problem.job !== 'solve' && problem.job !== 'equation') return null
  if (typeof problem.input !== 'string' || (problem.domain ?? 'real') !== 'real') return null
  const v = radicalVarOf(problem.input)
  if (v === null || (problem.variable !== undefined && problem.variable !== v)) return null
  const reg = new RadicalRegistry(v)
  const eq = readRadicalEquation(problem.input, v, reg)
  if (eq === null) return null

  const rootsL = eq.L.filter((t) => rootIndexOf(t, reg) !== null)
  const rootsR = eq.R.filter((t) => rootIndexOf(t, reg) !== null)
  if (rootsL.length + rootsR.length === 0 || rootsL.length > 1 || rootsR.length > 1) return null
  const swap = rootsL.length === 0
  const left = swap ? eq.R : eq.L
  const right = swap ? eq.L : eq.R
  const rootTerms = swap ? rootsR : rootsL
  const rightRootTerms = swap ? rootsL : rootsR
  if (rootTerms.length !== 1 || !isRootAlone(rootTerms[0], reg)) return null
  const rootL = normalize([rootTerms[0]])
  const coef = rootTerms[0].c
  const moved = normalize(left.filter((t) => rootIndexOf(t, reg) === null))
  const radicandL = reg.radicands[rootIndexOf(rootTerms[0], reg) as number]
  // The root side squares to coef² times its radicand: 2·sqrt(x) squares to 4x.
  const squaredL = scaleExpr(radicandL, rMul(coef, coef))

  let rightRoot: Expr | null = null
  let rightAfter: Expr
  if (rightRootTerms.length === 1) {
    // Two roots: both must stand alone with coefficient one, so a squaring of the two radicands is the whole equation.
    if (!isLoneRoot(rightRootTerms[0], reg) || moved.length > 0 || right.some((t) => rootIndexOf(t, reg) === null)) return null
    rightRoot = normalize([rightRootTerms[0]])
    rightAfter = rightRoot
  } else {
    rightAfter = eSub(normalize(right), moved)
  }

  let kind: 'negative' | 'square'
  let D: Expr
  if (rightRoot !== null) {
    const radicandR = reg.radicands[rootIndexOf(rightRootTerms[0], reg) as number]
    kind = 'square'
    D = eSub(squaredL, radicandR)
  } else {
    // A root with a coefficient other than one is not decided as "no solution" here: it is squared, and the roots it gives are
    // put back into the original equation, which refuses any that does not hold.
    const constantNegative =
      rEq(coef, R1) && rightAfter.length === 1 && Object.keys(rightAfter[0].v).length === 0 && rIsNeg(rightAfter[0].c)
    if (constantNegative) {
      kind = 'negative'
      D = radicandL
    } else {
      kind = 'square'
      D = eSub(squaredL, eMul(rightAfter, rightAfter))
    }
  }
  // A squared equation with no letter left (or the identity 0 = 0) decides nothing about the roots: not solved here.
  if (kind === 'square' && exprDegree(D) < 1) return null
  return { v, reg, eq, swap, rootL, coef, moved, rightAfter, rightRoot, squaredL, kind }
}

/** The working of a radical equation, or no working when this method does not decide it. */
function solveRadical(problem: Problem, router: StepRouter): Working {
  const plan = planOf(problem)
  if (plan === null) return noWorking()
  const { v, reg, eq } = plan
  const typed = `${writeSide(eq.L, v, reg)} = ${writeSide(eq.R, v, reg)}`
  const steps: Step[] = []
  let cur = typed
  let R = eq.R

  if (plan.swap) {
    const after = `${writeSide(eq.R, v, reg)} = ${writeSide(eq.L, v, reg)}`
    steps.push(finishStep({ kind: 'EquationEquiv', op: { kind: 'swap' }, before: cur, after, sentence: '', data: { variable: v } }))
    cur = after
    R = eq.L
  }

  // Isolate the root: move the polynomial part of its side across, so the side is the root alone.
  if (plan.moved.length > 0) {
    const movedText = writeSide(plan.moved, v)
    const op = movedText.startsWith('-')
      ? { kind: 'add-both' as const, term: writeSide(eNeg(plan.moved), v) }
      : { kind: 'subtract-both' as const, term: movedText }
    const newL = plan.rootL
    const newR = plan.rightAfter
    const after = `${writeSide(newL, v, reg)} = ${writeSide(newR, v, reg)}`
    steps.push(finishStep({ kind: 'EquationEquiv', op, before: cur, after, sentence: '', data: { variable: v } }))
    cur = after
    R = newR
  }

  if (plan.kind === 'negative') {
    // sqrt(P) = c with c below zero: a root is never negative, so there is nothing to square and nothing to solve.
    steps.push(
      finishStep({
        kind: 'SolutionSetEq',
        before: cur,
        after: '\\text{No real solution}',
        sentence: '',
        data: { radical: true, variable: v, original: typed, solutions: [], checks: [], negative: true }
      })
    )
    return {
      title: `Solve ${typed}`,
      input: typed,
      method: METHOD_NAME,
      steps,
      answer: [{ label: v, tex: '\\text{No real solution}' }],
      checked: 'ok',
      domain: 'real'
    }
  }

  // Square both sides: the root side squares to coef² times its radicand, the other side to its square (or, with a second root,
  // to its radicand).
  const squaredL = plan.squaredL
  const rightRadicand =
    plan.rightRoot !== null ? reg.radicands[rootIndexOf(R.filter((t) => rootIndexOf(t, reg) !== null)[0], reg) as number] : null
  const rightSquared = rightRadicand === null ? eMul(R, R) : rightRadicand
  const sqText =
    rightRadicand === null
      ? `${writeSide(squaredL, v)} = (${writeSide(R, v)})^2`
      : `${writeSide(squaredL, v)} = ${writeSide(rightRadicand, v)}`
  steps.push(
    finishStep({
      kind: 'Implication',
      before: cur,
      after: sqText,
      sentence: '',
      data: { action: 'square', radical: true, variable: v }
    })
  )

  // The squared equation is solved through the router, exactly like any other equation in one letter. The router's
  // equation methods work on "polynomial = 0", and a square that leaves x^2 on both sides (x^2 - 4 = (x - 1)^2) is
  // declined by them: then every term is moved to the left first, as its own checked step, and that form is solved.
  let solvedText = sqText
  let sub = router.solve({ job: 'solve', input: solvedText, variable: v, domain: 'real' }, { includeAlternatives: false })
  if (sub.noWorking || sub.steps.length === 0 || sub.answer === undefined) {
    const diff = eSub(squaredL, rightSquared)
    if (exprDegree(diff) >= 1) {
      solvedText = `${writeSide(diff, v)} = 0`
      steps.push(
        finishStep({
          kind: 'EquationEquiv',
          op: { kind: 'move-to-left' },
          before: sqText,
          after: solvedText,
          sentence: '',
          data: { variable: v }
        })
      )
      sub = router.solve({ job: 'solve', input: solvedText, variable: v, domain: 'real' }, { includeAlternatives: false })
    }
  }
  if (sub.noWorking || sub.steps.length === 0 || sub.answer === undefined) return noWorking()
  const subAnswers: StepAnswer[] = Array.isArray(sub.answer) ? sub.answer : [sub.answer]
  // A squared equation with no real root (a quadratic with a negative discriminant) leaves nothing to check: no solution.
  const noRealRoots = isNoRealSolution(subAnswers)
  const roots = noRealRoots ? [] : rationalsOf(subAnswers)
  if (roots === null || (roots.length === 0 && !noRealRoots)) return noWorking()
  if (roots.some((r, i) => i > 0 && rEq(r, roots[i - 1]))) return noWorking()

  // Every root of the squared equation is put back into the ORIGINAL equation. Only the ones that hold are answers.
  const checks: RadicalRootCheck[] = []
  for (const r of roots) {
    const res = checkCandidate(eq, r)
    if (res === null) return noWorking()
    const value = ratValue(r)
    if (res.under !== undefined) checks.push({ value, ok: false, under: res.under })
    else checks.push({ value, ok: res.ok, left: res.left, right: res.right })
  }
  const accepted = checks.filter((c) => c.ok)
  const afterText =
    accepted.length === 0 ? '\\text{No real solution}' : accepted.map((c) => `${v} = ${c.value}`).join(' \\text{ or } ')
  steps.push(
    finishStep({
      kind: 'SolutionSetEq',
      before: solvedText,
      after: afterText,
      sentence: '',
      data: {
        radical: true,
        variable: v,
        original: typed,
        solutions: accepted.map((c) => c.value),
        checks
      }
    })
  )
  const answer: StepAnswer[] =
    accepted.length === 0
      ? [{ label: v, tex: '\\text{No real solution}' }]
      : accepted.map((c) => ({ label: v, tex: c.value, value: c.value }))
  return {
    title: `Solve ${typed}`,
    input: typed,
    method: METHOD_NAME,
    steps,
    subWorkings: [sub],
    answer,
    checked: 'ok',
    domain: 'real'
  }
}

export const radicalMethod: Method = {
  id: RADICAL_ID,
  name: METHOD_NAME,
  order: 26,
  isAlternative: false,

  appliesTo(problem: Problem) {
    try {
      return planOf(problem) !== null ? { applies: true } : { applies: false, why: 'Not an equation with a square root of one letter' }
    } catch {
      return { applies: false, why: 'Could not read the equation' }
    }
  },

  solve(problem: Problem, router: StepRouter): Working {
    return solveRadical(problem, router)
  }
}

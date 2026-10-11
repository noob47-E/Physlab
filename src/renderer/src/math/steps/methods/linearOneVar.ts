// Linear equations in one variable (S1a): brackets, fractions and decimals, x on both sides, collect,
// divide. The two endings: no value of x works (0 = K with K ≠ 0, a SolutionSetEq step) and every real
// number is a solution (0 = 0: the last state is 0 = 0, with no ending step).
//
// Every move is an EquationEquiv with a declared op, checked side by side (types.ts, EquationOp). When the
// x-terms have cancelled, the constants are worked out in two checked steps: 0 = 8 − 3 (a subtraction on both
// sides) and then 0 = 5 (the right side worked out), so a wrong sum (0 = 6) is rejected.

import type { Method, Problem, StepAnswer, Step, Working } from '../types'
import { CANT_SHOW_STEPS_REASON } from '../router'
import { eSub, evalAt, exprDegree, type Expr } from '../../pure/mono'
import { rDiv, rIsNeg, rIsZero, rNeg, rStr, rSub, rTex, rat, type Rat } from '../../pure/rat'
import { clearDenominators, equationStep, exprOf, expandAndCollect, readEquation, sidesOf, type Sides } from './equation'
import { joinTex } from './stepText'
import { finishStep } from '../sentences'
import type { EquationOp } from '../types'

const LINEAR_ONE_VAR_ID = 'linear.oneVar'

const METHOD_NAME = 'Linear equation in one variable'

/** The coefficient of the power p of the letter in a collected expression (0 when absent). */
function coeff(e: Expr, v: string, p: number): Rat {
  const t = e.find((term) => (term.v[v] ?? 0) === p)
  return t ? t.c : rat(0n)
}

/** a·v + b as an expression. */
function linear(a: Rat, b: Rat, v: string): Expr {
  return exprOf([{ c: a, p: 1 }, { c: b, p: 0 }], v)
}

function constant(k: Rat, v: string): Expr {
  return exprOf([{ c: k, p: 0 }], v)
}

/**
 * The move that takes `amount` off both sides: subtract it when it is positive, add its size when it is
 * negative. The term is written as an exact polynomial in v (3x, x) or as a number, with its size only.
 */
function moveOp(amount: Rat, v: string | null): EquationOp {
  const size = rIsNeg(amount) ? rNeg(amount) : amount
  const term = v === null ? rStr(size) : size.n === 1n && size.d === 1n ? v : `${rStr(size)}${v}`
  return rIsNeg(amount) ? { kind: 'add-both', term } : { kind: 'subtract-both', term }
}

function linearApplies(problem: Problem): { applies: boolean; why?: string } {
  if (problem.job !== 'solve' && problem.job !== 'equation') {
    return { applies: false, why: `Job '${problem.job}' is not an equation solving job` }
  }
  const r = readEquation(problem)
  if (!r) return { applies: false, why: 'Input is not one equation in one letter with polynomial sides' }
  const d = eSub(r.left.collected, r.right.collected)
  if (exprDegree(d) > 1) return { applies: false, why: 'Degree is greater than 1 (not a linear equation)' }
  return { applies: true }
}

function solveLinear(problem: Problem): Working {
  const r = readEquation(problem)
  if (!r) {
    return { steps: [], noWorking: true, reason: CANT_SHOW_STEPS_REASON }
  }
  const { v, start } = r
  const steps: Step[] = []
  const original: Sides = sidesOf(r.left.collected, r.right.collected, v)

  // Expand the brackets, collect like terms, then clear fractions or decimals.
  let cur = expandAndCollect(r, steps)
  cur = clearDenominators(cur, v, steps)

  // Collect the x-terms on the left.
  let aL = coeff(cur.lhs, v, 1)
  const bL = coeff(cur.lhs, v, 0)
  const aR = coeff(cur.rhs, v, 1)
  const bR = coeff(cur.rhs, v, 0)
  if (!rIsZero(aR)) {
    const next = sidesOf(linear(rSub(aL, aR), bL, v), linear(rat(0n), bR, v), v)
    steps.push(equationStep(cur.text, next.text, moveOp(aR, v), v))
    cur = next
    aL = rSub(aL, aR)
  }

  // Move the constants to the right. With no x left, the subtraction is written unevaluated and then
  // worked out, as two checked steps, so the sum is checked exactly.
  if (!rIsZero(bL)) {
    const k = moveOp(bL, null)
    if (rIsZero(aL)) {
      const unevaluated = joinTex([{ c: bR, p: 0 }, { c: rNeg(bL), p: 0 }], v)
      const value = rSub(bR, bL)
      const shownValue = joinTex([{ c: value, p: 0 }], v)
      const writtenUnevaluated = `0 = ${unevaluated}`
      steps.push(equationStep(cur.text, writtenUnevaluated, k, v))
      steps.push(equationStep(writtenUnevaluated, `0 = ${shownValue}`, { kind: 'work-out-right' }, v))
      cur = sidesOf(constant(rat(0n), v), constant(value, v), v)
    } else {
      const next = sidesOf(linear(aL, rat(0n), v), linear(rat(0n), rSub(bR, bL), v), v)
      steps.push(equationStep(cur.text, next.text, k, v))
      cur = next
    }
  }

  // Now the state is A·v = K. Divide by A unless it is already 1.
  const A = aL
  const K = coeff(cur.rhs, v, 0)
  if (rIsZero(A)) {
    if (rIsZero(K)) {
      // 0 = 0: every real number is a solution. The ending is a SolutionSetEq that checks 0 = 0 exactly.
      const shown = '\\text{every real number}'
      steps.push(
        finishStep({
          kind: 'SolutionSetEq',
          before: cur.text,
          after: shown,
          sentence: '',
          data: { variable: v, solutions: [], allReals: true }
        })
      )
      return {
        title: `Solve ${start}`,
        input: start,
        method: METHOD_NAME,
        steps,
        answer: { label: v, tex: shown }
      }
    }
    // 0 = K with K ≠ 0: the empty solution set, proved by SolutionSetEq from the displayed before.
    const shown = `\\text{no value of ${v} works}`
    steps.push(
      finishStep({
        kind: 'SolutionSetEq',
        before: cur.text,
        after: shown,
        sentence: '',
        data: { variable: v, solutions: [] }
      })
    )
    return {
      title: `Solve ${start}`,
      input: start,
      method: METHOD_NAME,
      steps,
      answer: { label: v, tex: shown }
    }
  }

  const sol = rDiv(K, A)
  if (A.n !== 1n || A.d !== 1n) {
    const next = sidesOf(linear(rat(1n), rat(0n), v), constant(sol, v), v)
    steps.push(equationStep(cur.text, next.text, { kind: 'divide-both', k: rStr(A) }, v))
  }

  // Already in the form v = K: one line says so, so the working is never empty.
  if (steps.length === 0) {
    steps.push(equationStep(cur.text, cur.text, { kind: 'already-solved' }, v))
  }

  const value = evalAt(original.lhs, { [v]: sol })
  const other = evalAt(original.rhs, { [v]: sol })
  const answer: StepAnswer = { label: v, tex: rTex(sol), value: rStr(sol) }
  const checked = value.n === other.n && value.d === other.d
  return {
    title: `Solve ${start}`,
    input: start,
    method: METHOD_NAME,
    steps,
    answer,
    checked: checked ? 'ok' : 'failed'
  }
}

export const linearOneVarMethod: Method = {
  id: LINEAR_ONE_VAR_ID,
  name: METHOD_NAME,
  order: 10,
  isAlternative: false,

  appliesTo(problem: Problem) {
    try {
      return linearApplies(problem)
    } catch {
      return { applies: false, why: 'Could not read the equation' }
    }
  },

  solve(problem: Problem): Working {
    return solveLinear(problem)
  }
}

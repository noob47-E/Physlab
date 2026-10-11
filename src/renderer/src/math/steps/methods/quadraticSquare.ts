// Quadratics by completing the square (S1a): always offered as "Another way".
//
// x² + (b/a)x + c/a = (x − s)² + k with s = −b/(2a) and k = c/a − s². The completed square is one
// complete-square step to the zero form (x − s)² + k = 0 (both sides rewritten exactly). Taking the square
// root with ± is written as the difference of two squares, (x − s − r)(x − s + r) = 0 with r² = −k (op
// square-root-pm, checked against the same polynomial). The two cases are a CaseSplitComplete in zero-product
// form. A negative constant ends with "no real solutions", a SolutionSetEq proved from the displayed zero form.

import type { Method, Problem, Step, Working } from '../types'
import { normalize, type Expr } from '../../pure/mono'
import {
  rAbs,
  rAdd,
  rDiv,
  rIsNeg,
  rIsZero,
  rMul,
  rNeg,
  rSqrt,
  rStr,
  rSub,
  rTex,
  rat,
  type Rat
} from '../../pure/rat'
import { equationStep, sidesOf } from './equation'
import { shiftAscii, shiftTex } from './stepText'
import { finishStep } from '../sentences'
import { noWorking, quadraticOf, rootAnswers, rootsCheck, type Quadratic } from './quadratic'
import { CANT_SHOW_STEPS_REASON } from '../router'

const SQUARE_ID = 'quadratic.completeSquare'
const METHOD_NAME = 'Completing the square'

/** " - x" or " + x" for a LaTeX sum (the factor tails), nothing for zero. */
function signedTail(x: Rat): string {
  if (rIsZero(x)) return ''
  return rIsNeg(x) ? ` + ${rTex(rAbs(x))}` : ` - ${rTex(x)}`
}

/** The constant k of (x − s)² + k, LaTeX: " + \frac{1}{4}" or " - 6", nothing for zero. */
function constTex(k: Rat): string {
  if (rIsZero(k)) return ''
  return rIsNeg(k) ? ` - ${rTex(rAbs(k))}` : ` + ${rTex(k)}`
}

function divideExpr(e: Expr, k: bigint): Expr {
  return normalize(e.map((t) => ({ c: rDiv(t.c, rat(k)), v: { ...t.v } })))
}

/** The completed-square working, or a hidden one when a case does not show its steps. */
function solveSquare(problem: Problem, router: { solve: (p: Problem) => Working }): Working {
  const q: Quadratic | null = quadraticOf(problem)
  if (!q) return noWorking()
  const { v, a } = q
  const steps: Step[] = [...q.steps]
  let text = q.text

  if (a !== 1n) {
    const next = sidesOf(divideExpr(q.expr, a), [], v)
    steps.push(equationStep(text, next.text, { kind: 'divide-both', k: String(a), purpose: 'leading-one' }, v))
    text = next.text
  }

  // (x − s)² + k, with s = −b/(2a): the root of the square is half of the x-coefficient, sign reversed.
  const s = rat(-q.b, 2n * a)
  const k = rSub(rat(q.c, a), rMul(s, s))
  const square = rIsZero(s) ? `${v}^2` : `\\left(${shiftTex(v, s)}\\right)^2`
  const zeroForm = `${square}${constTex(k)} = 0`
  // With no x-term the square is already (x)^2 + k: there is nothing to complete, so no step is written (review delta4).
  if (!rIsZero(s)) {
    steps.push(equationStep(text, zeroForm, { kind: 'complete-square' }, v))
    text = zeroForm
  }

  if (rIsZero(k)) {
    // (x − s)² = 0: one root, said once.
    const caseText = `${shiftAscii(v, s)} = 0`
    const sub = router.solve({ job: 'solve', input: caseText, variable: v })
    const answer = Array.isArray(sub.answer) ? sub.answer[0] : sub.answer
    if (sub.noWorking || !answer || answer.tex !== rTex(s)) {
      return { steps: [], noWorking: true, reason: CANT_SHOW_STEPS_REASON }
    }
    steps.push(
      finishStep({
        kind: 'CaseSplitComplete',
        before: text,
        after: `${v} = ${rTex(s)}`,
        sentence: '',
        data: { form: 'zero-product', c: '1', cases: [caseText, caseText], variable: v }
      })
    )
    return {
      title: `Solve ${q.start}`,
      input: q.start,
      method: METHOD_NAME,
      steps,
      subWorkings: [sub],
      answer: rootAnswers(v, [s]),
      checked: rootsCheck(q, [s])
    }
  }

  // The square must equal target = −k.
  const target = rNeg(k)
  if (rIsNeg(target)) {
    // A real square is never negative.
    if (q.domain !== 'real') return noWorking()
    steps.push(
      finishStep({
        kind: 'SolutionSetEq',
        before: text,
        after: '\\text{No real solution}',
        sentence: '',
        data: { variable: v, solutions: [] }
      })
    )
    return {
      title: `Solve ${q.start}`,
      input: q.start,
      method: METHOD_NAME,
      steps,
      answer: { label: v, tex: '\\text{No real solution}' }
    }
  }

  // Take the square root with ±. A surd root is not checkable yet, so the working stays hidden.
  const r = rSqrt(target)
  if (!r) return noWorking()

  // (x − s − r)(x − s + r) = 0 is the same polynomial as (x − s)² − r², and r² = target = −k.
  const f1 = `${v}${signedTail(s)}${signedTail(r)}`
  const f2 = `${v}${signedTail(s)}${signedTail(rNeg(r))}`
  const factored = `\\left(${f1}\\right)\\left(${f2}\\right) = 0`
  steps.push(equationStep(text, factored, { kind: 'square-root-pm', shift: rStr(s), root: rStr(r) }, v))

  // The two cases, smaller root first: x − lo = 0 and x − hi = 0 (r > 0).
  const lo = rSub(s, r)
  const hi = rAdd(s, r)
  const caseLo = `${shiftAscii(v, lo)} = 0`
  const caseHi = `${shiftAscii(v, hi)} = 0`
  steps.push(
    finishStep({
      kind: 'CaseSplitComplete',
      before: factored,
      after: `${v} = ${rTex(lo)} \\text{ or } ${v} = ${rTex(hi)}`,
      sentence: '',
      data: { form: 'zero-product', c: '1', cases: [caseLo, caseHi], variable: v }
    })
  )

  const subWorkings: Working[] = []
  for (const [caseText, root] of [
    [caseLo, lo],
    [caseHi, hi]
  ] as [string, Rat][]) {
    const sub = router.solve({ job: 'solve', input: caseText, variable: v })
    const answer = Array.isArray(sub.answer) ? sub.answer[0] : sub.answer
    if (sub.noWorking || !answer || answer.tex !== rTex(root)) {
      return { steps: [], noWorking: true, reason: CANT_SHOW_STEPS_REASON }
    }
    subWorkings.push(sub)
  }

  return {
    title: `Solve ${q.start}`,
    input: q.start,
    method: METHOD_NAME,
    steps,
    subWorkings,
    answer: rootAnswers(v, [lo, hi]),
    checked: rootsCheck(q, [lo, hi])
  }
}

export const quadraticSquareMethod: Method = {
  id: SQUARE_ID,
  name: METHOD_NAME,
  order: 40,
  isAlternative: true,

  appliesTo(problem: Problem) {
    try {
      const q = quadraticOf(problem)
      if (!q) return { applies: false, why: 'Not a quadratic in one letter' }
      return { applies: true }
    } catch {
      return { applies: false, why: 'Could not read the equation' }
    }
  },

  solve(problem: Problem, router): Working {
    return solveSquare(problem, router)
  }
}


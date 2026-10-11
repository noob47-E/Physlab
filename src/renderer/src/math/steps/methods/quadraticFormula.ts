// Quadratics by the quadratic formula (S1a): primary when the roots are not rational; "Another way"
// when factorising was primary.
//
// The discriminant b² − 4ac is its own sub-working (an expression, so its chain starts from the
// expression, not from the equation). With a negative discriminant in the real domain the ending is a
// SolutionSetEq: the quadratic has no real root, which the validator proves exactly from the displayed
// equation. Every other case needs a square root of a number that is not a perfect square; that
// square-root step is an Implication that no checker in this build proves yet, so the router hides it
// (Rule 0.2), which is the safe result.

import type { Method, Problem, Step, StepAnswer, Working } from '../types'
import { rCmp, rStr, rTex, type Rat } from '../../pure/rat'
import { finishStep } from '../sentences'
import { discriminantOf, noWorking, quadraticOf, rationalRoots, rootsCheck, type Quadratic } from './quadratic'

const FORMULA_ID = 'quadratic.formula'
const METHOD_NAME = 'Quadratic formula'

/** The discriminant with a, b and c put in, written for the validator: (-5)^2 - 4 \cdot 1 \cdot (6). */
function substitutedDiscriminant(q: Quadratic): string {
  return `(${q.b})^2 - 4 \\cdot ${q.a} \\cdot (${q.c})`
}

/** The discriminant as its own working: one ExprEq from the substituted expression to its value. */
function discriminantWorking(q: Quadratic, disc: bigint): Working {
  const expr = substitutedDiscriminant(q)
  return {
    title: 'Discriminant',
    input: expr,
    method: 'Discriminant',
    steps: [
      finishStep({
        kind: 'ExprEq',
        before: expr,
        after: String(disc),
        sentence: '',
        data: { role: 'discriminant', a: String(q.a), b: String(q.b), c: String(q.c) }
      })
    ]
  }
}

function solveFormula(problem: Problem): Working {
  const q = quadraticOf(problem)
  if (!q) return noWorking()
  const { v } = q
  const disc = discriminantOf(q)
  const steps: Step[] = [...q.steps]
  const subWorkings: Working[] = [discriminantWorking(q, disc)]

  if (disc < 0n && q.domain === 'real') {
    steps.push(
      finishStep({
        kind: 'SolutionSetEq',
        before: q.text,
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
      subWorkings,
      answer: { label: v, tex: '\\text{No real solution}' } satisfies StepAnswer
    }
  }

  // The roots need √(discriminant): an Implication that no checker proves yet, so the router hides it.
  steps.push(
    finishStep({
      kind: 'Implication',
      before: q.text,
      after: `${v} = \\frac{${String(-q.b)} \\pm \\sqrt{${disc}}}{${2n * q.a}}`,
      sentence: '',
      data: { action: 'quadratic-formula' }
    })
  )

  // Only exact rational roots are given as an answer, and they are checked by substitution. A surd or
  // complex answer would be unchecked text, so it is left out with the hidden working.
  const roots = rationalRoots(q)
  if (!roots) return noWorking()
  const distinct: Rat[] = rCmp(roots.lo, roots.hi) === 0 ? [roots.lo] : [roots.lo, roots.hi]
  return {
    title: `Solve ${q.start}`,
    input: q.start,
    method: METHOD_NAME,
    steps,
    subWorkings,
    answer: distinct.map((r) => ({ label: v, tex: rTex(r), value: rStr(r) })),
    checked: rootsCheck(q, distinct)
  }
}

export const quadraticFormulaMethod: Method = {
  id: FORMULA_ID,
  name: METHOD_NAME,
  order: 30,
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

  solve(problem: Problem): Working {
    return solveFormula(problem)
  }
}

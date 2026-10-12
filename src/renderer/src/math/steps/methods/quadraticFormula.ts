// Quadratics by the quadratic formula (S1a, with the surds and complex roots of S1b): primary when the roots are not
// rational; "Another way" when factorising was primary.
//
// The discriminant b² − 4ac is its own sub-working (an expression, so its chain starts from the expression, not from
// the equation). With a negative discriminant in the real domain the ending is a SolutionSetEq: the quadratic has no
// real root, which the validator proves exactly from the displayed equation. Otherwise the roots are the solution set
// itself, in simplest form (−b ± s√d)/(2a): one step (a SolutionSetEq) that the validator checks with G2's
// polyRootsCheck in the domain, and whose displayed line is the exact display of each root. A complex pair is shown in
// the complex domain only. The working's answer is each root, and its check substitutes each root exactly.

import type { Method, Problem, Step, StepAnswer, Working } from '../types'
import { finishStep } from '../sentences'
import { plainOfAlg, quadraticRootsHold, quadraticRootsOf, texOfAlg } from '../check-adapter'
import { discriminantOf, noWorking, quadraticOf, type Quadratic } from './quadratic'

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
      answer: { label: v, tex: '\\text{No real solution}' } satisfies StepAnswer,
      domain: q.domain
    }
  }

  const roots = quadraticRootsOf(q.a, q.b, q.c)
  if (!roots) return noWorking()
  // A double root is said once; the solution set then has the root with multiplicity two.
  const distinct = disc === 0n ? [roots[0]] : roots
  const shownAfter = distinct.map((r) => `${v} = ${texOfAlg(r)}`).join(' \\text{ or } ')
  steps.push(
    finishStep({
      kind: 'SolutionSetEq',
      before: q.text,
      after: shownAfter,
      sentence: '',
      data: {
        variable: v,
        solutions: distinct.map((r) => ({ value: plainOfAlg(r), multiplicity: disc === 0n ? 2 : 1 })),
        domain: q.domain
      }
    })
  )
  // The roots are checked exactly: each one makes the quadratic zero in ℚ(√d, i).
  const checked = quadraticRootsHold(q.a, q.b, q.c, distinct) ? 'ok' : 'failed'
  return {
    title: `Solve ${q.start}`,
    input: q.start,
    method: METHOD_NAME,
    steps,
    subWorkings,
    answer: distinct.map((r) => ({ label: v, tex: texOfAlg(r), value: plainOfAlg(r) })),
    checked,
    domain: q.domain
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

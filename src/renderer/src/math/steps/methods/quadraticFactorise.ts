// Quadratics by factorising (S1a): primary when the roots are rational.
//
// a·x² + b·x + c = (d₁x − n₁)(d₂x − n₂) where n₁/d₁ and n₂/d₂ are the roots in lowest terms. For a
// primitive quadratic with rational roots this always holds with d₁·d₂ = a (Gauss's lemma). The factor
// step is an EquationEquiv (op factorise: each side is rewritten exactly). The zero product is a
// CaseSplitComplete in zero-product form: the product of the case factors must equal the whole, and the
// displayed roots must be the roots of the cases. Each case is then solved as a linear sub-problem through
// the router, and its own steps are validated there.

import type { Method, Problem, Step, Working } from '../types'
import { rCmp, rTex, type Rat } from '../../pure/rat'
import { equationStep } from './equation'
import { factorTex } from './stepText'
import { finishStep } from '../sentences'
import { noWorking, quadraticOf, rationalRoots, rootAnswers, rootsCheck, type Quadratic } from './quadratic'
import { CANT_SHOW_STEPS_REASON } from '../router'

const FACTORISE_ID = 'quadratic.factorise'
const METHOD_NAME = 'Factorising'

/** Both roots, when they are rational and their denominators multiply to the leading coefficient. */
function factorsOf(q: Quadratic): { lo: Rat; hi: Rat } | null {
  const roots = rationalRoots(q)
  if (!roots) return null
  if (roots.lo.d * roots.hi.d !== q.a) return null
  return roots
}

/** The factorising working, or a hidden one when a case does not show its steps. */
function solveFactorise(problem: Problem, router: { solve: (p: Problem) => Working }): Working {
  const q = quadraticOf(problem)
  if (!q) return noWorking()
  const roots = factorsOf(q)
  if (!roots) return noWorking()
  const { v } = q
  const { lo, hi } = roots
  const double = rCmp(lo, hi) === 0
  const f1 = factorTex(lo.d, lo.n, v)
  const f2 = factorTex(hi.d, hi.n, v)
  const factoredTex = double ? `(${f1})^2` : `(${f1})(${f2})`

  const steps: Step[] = [...q.steps]
  steps.push(equationStep(q.text, `${factoredTex} = 0`, { kind: 'factorise' }, v))

  const distinct = double ? [lo] : [lo, hi]
  const cases = double ? [`${f1} = 0`, `${f1} = 0`] : [`${f1} = 0`, `${f2} = 0`]
  const splitAfter = double
    ? `${v} = ${rTex(lo)}`
    : `${v} = ${rTex(lo)} \\text{ or } ${v} = ${rTex(hi)}`
  steps.push(
    finishStep({
      kind: 'CaseSplitComplete',
      before: `${factoredTex} = 0`,
      after: splitAfter,
      sentence: '',
      data: { form: 'zero-product', c: '1', cases, variable: v }
    })
  )

  const subWorkings: Working[] = []
  for (const r of distinct) {
    const factor = r === lo ? lo : hi
    const sub = router.solve({
      job: 'solve',
      input: `${factorTex(factor.d, factor.n, v)} = 0`,
      variable: v
    })
    const answer = Array.isArray(sub.answer) ? sub.answer[0] : sub.answer
    if (sub.noWorking || !answer || answer.tex !== rTex(r)) {
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
    answer: rootAnswers(v, distinct),
    checked: rootsCheck(q, distinct)
  }
}

export const quadraticFactoriseMethod: Method = {
  id: FACTORISE_ID,
  name: METHOD_NAME,
  order: 20,
  isAlternative: false,

  appliesTo(problem: Problem) {
    try {
      const q = quadraticOf(problem)
      if (!q) return { applies: false, why: 'Not a quadratic in one letter' }
      if (!factorsOf(q)) return { applies: false, why: 'The roots are not rational' }
      return { applies: true }
    } catch {
      return { applies: false, why: 'Could not read the equation' }
    }
  },

  solve(problem: Problem, router): Working {
    return solveFactorise(problem, router)
  }
}

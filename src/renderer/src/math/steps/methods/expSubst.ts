// An exponential equation that is a quadratic in a power (S3, substitution): 4^x - 3*2^x + 2 = 0 is solved by u = 2^x.
//
// The working has two steps and one sub-working. The first step is the substitution (exp-substitute): the typed equation becomes
// the quadratic in u, checked exactly. The quadratic is solved through the router, as its own working (the sub-working). The
// last step is the solution set in x: each root above zero is put back as x (2^x = 1 gives x = 0, and ln u for the base e), each
// root at or below zero is rejected (a power of a is always positive), and every x is put back into the typed equation. Shapes
// expSubst.ts does not read, and roots that are not rational, get no working, so the Calculator's own answer stays.

import type { Method, Problem, Step, StepAnswer, StepRouter, Working } from '../types'
import { finishStep } from '../sentences'
import { equationStep } from './equation'
import { noWorking } from './quadratic'
import { isNoRealSolution, rationalsOf, sameRationals } from '../radicalForm'
import {
  baseText,
  quadraticText,
  readExpEquation,
  rootsOfPlan,
  solutionOf,
  substPlanOf,
  type ExpEquation,
  type ExpSolutionData,
  type SubstPlan
} from '../expSubst'
import { rStr, type Rat } from '../../pure/rat'

const EXPSUB_ID = 'exp.substitute'
/** The name the page shows for this method (the same name the logarithm method uses: render.ts lists it). */
const METHOD_NAME = 'Exponential and logarithmic equation'
/** The letter the substitution introduces (expSubst.ts writes the quadratic in it). */
const U = 'u'

/** The typed equation and its substitution, when the problem is one this method reads (real, one letter in the powers). */
function readOf(problem: Problem): { eq: ExpEquation; plan: SubstPlan } | null {
  if (problem.job !== 'solve' && problem.job !== 'equation') return null
  if (typeof problem.input !== 'string' || (problem.domain ?? 'real') !== 'real') return null
  const eq = readExpEquation(problem.input)
  if (eq === null || (problem.variable !== undefined && problem.variable !== eq.v)) return null
  const plan = substPlanOf(eq)
  return plan === null ? null : { eq, plan }
}

/** The working of the substitution, or no working when this method does not decide the equation. */
function solveSubstitution(problem: Problem, router: StepRouter): Working {
  const read = readOf(problem)
  if (read === null) return noWorking()
  const { plan } = read
  const input = String(problem.input)
  const v = plan.v
  const quad = quadraticText(plan)
  const roots = rootsOfPlan(plan)
  if (roots === null) return noWorking()

  // The quadratic in u is solved through the router, as its own working: its roots must be exactly the ones found above.
  const sub = router.solve({ job: 'solve', input: quad, variable: U, domain: 'real' }, { includeAlternatives: false })
  if (sub.noWorking || sub.steps.length === 0 || sub.answer === undefined) return noWorking()
  const subAnswers: StepAnswer[] = Array.isArray(sub.answer) ? sub.answer : [sub.answer]
  const subRoots: Rat[] | null = roots.length === 0 ? (isNoRealSolution(subAnswers) ? [] : null) : rationalsOf(subAnswers)
  if (subRoots === null || !sameRationals(subRoots, roots)) return noWorking()

  const sol = solutionOf(plan, roots)
  if (sol === null) return noWorking()
  const data: ExpSolutionData = {
    expSubst: true,
    variable: v,
    domain: 'real',
    base: baseText(plan.a),
    u: U,
    original: input,
    roots: roots.map(rStr),
    accepted: sol.accepted,
    rejected: sol.rejected,
    solutions: sol.xs,
    checks: sol.checks
  }
  const afterText = sol.xs.length === 0 ? '\\text{No real solution}' : sol.xs.map((x) => `${v} = ${x}`).join(' \\text{ or } ')

  const steps: Step[] = [
    equationStep(input, quad, { kind: 'exp-substitute', base: baseText(plan.a), u: U }, v),
    finishStep({ kind: 'SolutionSetEq', before: quad, after: afterText, sentence: '', data })
  ]
  const answers: StepAnswer[] =
    sol.xs.length === 0 ? [{ label: v, tex: '\\text{No real solution}' }] : sol.xs.map((x) => ({ label: v, tex: x, value: x }))
  return {
    title: `Solve ${input}`,
    input,
    method: METHOD_NAME,
    steps,
    subWorkings: [sub],
    answer: answers,
    checked: 'ok',
    domain: 'real'
  }
}

export const expSubstMethod: Method = {
  id: EXPSUB_ID,
  name: METHOD_NAME,
  order: 27,
  isAlternative: false,

  appliesTo(problem: Problem) {
    try {
      return readOf(problem) !== null ? { applies: true } : { applies: false, why: 'Not an exponential equation in a quadratic of one power' }
    } catch {
      return { applies: false, why: 'Could not read the equation' }
    }
  },

  solve(problem: Problem, router: StepRouter): Working {
    return solveSubstitution(problem, router)
  }
}

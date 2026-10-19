// Rational equations in one letter (S3b): a letter in a denominator, such as 1/x + 1/(x - 1) = 2 or 3/x = x - 2.
//
// The working is three checked steps and one sub-working, in this order:
//   1. the excluded values: the zeros of the denominators, named in words. An Implication that leaves the equation as it is
//      (before = after), checked against the denominators themselves (check-adapter.ts, checkRationalExclusion);
//   2. both sides multiplied by the least common multiple of the denominators: an Implication, checked as rational functions
//      (check-adapter.ts, checkRationalMultiply);
//   3. the polynomial that step gives is solved through the router, as the sub-working. Its roots that are excluded values
//      are rejected in words; the rest are the solutions, and the ending is decided by G2 against the equation as typed
//      (check-adapter.ts, checkRationalEnding), which leaves the excluded values out by itself.
// A case this cannot do soundly (a denominator that is not a product of rational linear factors, or a whole line of
// solutions) gives no working, and the answer the Calculator already has stays as it was.

import type { Method, Problem, Step, StepAnswer, StepRouter, Working } from '../types'
import {
  checkRationalEnding,
  clearedSides,
  multiplierPoly,
  multiplierText,
  plainOfAlg,
  readRationalEquation,
  readSurd,
  rationalShapeOf,
  splitExcludedRoots,
  stringifyNodeOrText,
  texOfAlg,
  type G2Alg
} from '../check-adapter'
import { rStr } from '../../pure/rat'
import { exprFromPoly } from '../../pure/poly'
import { finishStep } from '../sentences'
import { sidesOf } from './equation'
import { noWorking } from './quadratic'

const RATIONAL_ID = 'rational.equation'
const METHOD_NAME = 'Rational equation'

/**
 * The candidate roots the sub-working found, read exactly. Empty when the sub-working says no value works (or no real
 * solution); null when its answer cannot be read exactly, so the method gives up rather than guess.
 */
function candidatesOf(sub: Working): G2Alg[] | null {
  const answers: StepAnswer[] = Array.isArray(sub.answer) ? sub.answer : sub.answer ? [sub.answer] : []
  if (answers.length === 0) return null
  if (answers.length === 1 && answers[0].value === undefined) {
    return /^\\text\{(no value of [a-zA-Z] works|No real solution)\}$/.test(answers[0].tex) ? [] : null
  }
  const out: G2Alg[] = []
  for (const a of answers) {
    const x = a.value === undefined ? null : readSurd(a.value)
    if (!x) return null
    out.push(x)
  }
  return out
}

function solveRational(problem: Problem, router: StepRouter): Working {
  if (problem.job !== 'solve' && problem.job !== 'equation') return noWorking()
  if (problem.domain === 'complex') return noWorking()
  const start = stringifyNodeOrText(problem.input)
  const read = readRationalEquation(start)
  const shape = read ? rationalShapeOf(read) : null
  if (!read || !shape || shape.roots.length === 0) return noWorking()
  const v = read.v

  // The polynomial the equation becomes when both sides are multiplied by the multiplier (a polynomial on each side).
  const cleared = clearedSides(read, multiplierPoly(shape))
  if (!cleared) return noWorking()
  const state = sidesOf(exprFromPoly(cleared.lhs, v), exprFromPoly(cleared.rhs, v), v)

  const excluded = shape.roots.map((x) => rStr(x.r))
  const steps: Step[] = [
    finishStep({
      kind: 'Implication',
      before: start,
      after: start,
      sentence: '',
      data: { action: 'exclude', variable: v, excluded }
    }),
    finishStep({
      kind: 'Implication',
      before: start,
      after: state.text,
      sentence: '',
      data: { action: 'multiply', variable: v, multiplier: multiplierText(shape) }
    })
  ]

  // The polynomial is solved by the router's own methods; its answers are candidates, and the ending decides them.
  const sub = router.solve({ job: 'solve', input: state.text, variable: v, domain: 'real' }, { includeAlternatives: false })
  if (sub.noWorking || sub.steps.length === 0) return noWorking()
  const candidates = candidatesOf(sub)
  if (candidates === null) return noWorking()
  const { kept, rejected } = splitExcludedRoots(
    candidates,
    shape.roots.map((x) => x.r)
  )

  const keptText = kept.map((x) => plainOfAlg(x))
  const rejectedText = rejected.map((r) => rStr(r))
  const ending =
    kept.length > 0 ? kept.map((x) => `${v} = ${texOfAlg(x)}`).join(' \\text{ or } ') : `\\text{no value of ${v} works}`
  // The ending is only shown when the checker agrees with it against the equation as typed; otherwise nothing is shown.
  if (checkRationalEnding(start, state.text, keptText, rejectedText, v, ending) !== 'valid') return noWorking()
  steps.push(
    finishStep({
      kind: 'SolutionSetEq',
      before: state.text,
      after: ending,
      sentence: '',
      data: { variable: v, domain: 'real', rational: true, original: start, solutions: keptText, rejected: rejectedText }
    })
  )

  const answer: StepAnswer[] | StepAnswer =
    kept.length > 0
      ? kept.map((x) => ({ label: v, tex: texOfAlg(x), value: plainOfAlg(x) }))
      : { label: v, tex: `\\text{no value of ${v} works}` }
  return {
    title: `Solve ${start}`,
    input: start,
    method: METHOD_NAME,
    steps,
    subWorkings: [sub],
    answer,
    checked: 'ok',
    domain: 'real'
  }
}

export const rationalEquationMethod: Method = {
  id: RATIONAL_ID,
  name: METHOD_NAME,
  order: 26,
  isAlternative: false,

  appliesTo(problem: Problem) {
    try {
      if (problem.job !== 'solve' && problem.job !== 'equation') {
        return { applies: false, why: `Job '${problem.job}' is not an equation solving job` }
      }
      if (problem.domain === 'complex') return { applies: false, why: 'The complex domain is not worked here' }
      const read = readRationalEquation(stringifyNodeOrText(problem.input))
      const shape = read ? rationalShapeOf(read) : null
      if (!shape || shape.roots.length === 0) {
        return { applies: false, why: 'Not one equation in one letter with a letter in a denominator' }
      }
      return { applies: true }
    } catch {
      return { applies: false, why: 'Could not read the equation' }
    }
  },

  solve(problem: Problem, router): Working {
    return solveRational(problem, router)
  }
}

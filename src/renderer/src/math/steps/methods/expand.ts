// Expanding (S1c): a product of brackets, or a bracket to a power, multiplied out.
//
// Two brackets: each term times each term, written out with nothing collected (one ExprEq, expand-factors), then the
// like terms collected and put in order (one ExprEq, collect-factor). Three brackets: the first two, then the third.
// A bracket to a power: the same, with the bracket repeated. Every step is checked exactly by check-adapter.ts.

import type { Method, Problem, Step, Working } from '../types'
import { CANT_SHOW_STEPS_REASON } from '../router'
import {
  collectTerms,
  expandTerms,
  multiplyTermLists,
  normalizeDisplayed,
  stringifyNodeOrText,
  sumText
} from '../check-adapter'
import { isPowerFactor, productFactorsOf, productStep, productWorking } from './productState'

const EXPAND_ID = 'expand'

/** True for a product this method expands: two or more factors, or a factor raised to a power of 2 or more. */
function isExpandable(factors: string[]): boolean {
  return factors.length >= 2 || (factors.length === 1 && isPowerFactor(factors[0]))
}

/** The one letter of the input, or null when there is none or more than one (these methods work in one letter). */
function letterOf(input: string): string | null {
  const letters = [...new Set(input.match(/\p{L}/gu) ?? [])]
  return letters.length === 1 ? letters[0] : null
}

/** The expanding working of a typed product, or the can't-show fallback when a step is not read. */
function expandWorking(problem: Problem): Working {
  const declined: Working = { steps: [], noWorking: true, reason: CANT_SHOW_STEPS_REASON }
  const input = stringifyNodeOrText(problem.input)
  const v = letterOf(input)
  if (v === null) return declined
  const start = productFactorsOf(input)
  if (!start || !isExpandable(start)) return declined
  let state = start
  const steps: Step[] = []
  for (let guard = 0; guard < 20 && isExpandable(state); guard++) {
    const width = state.length >= 2 ? 2 : 1
    const target = state.slice(0, width)
    const lists = []
    for (const f of target) {
      const t = expandTerms(f)
      if (!t) return declined
      lists.push(t)
    }
    const terms = multiplyTermLists(lists)
    if (!terms) return declined
    const uncollected = sumText(terms)
    const expanded = [uncollected, ...state.slice(width)]
    steps.push(productStep(state, expanded, 0, width, { kind: 'expand-factors' }, v))
    state = expanded
    const canonical = sumText(collectTerms(terms))
    if (normalizeDisplayed(canonical) !== normalizeDisplayed(uncollected)) {
      const collected = [canonical, ...state.slice(1)]
      steps.push(productStep(state, collected, 0, 1, { kind: 'collect-factor' }, v))
      state = collected
    }
  }
  if (steps.length === 0 || state.length !== 1 || !expandTerms(state[0])) return declined
  return productWorking(`Expand ${input}`, input, 'Expand', steps, v)
}

export const expandMethod: Method = {
  id: EXPAND_ID,
  name: 'Expand',
  order: 10,
  isAlternative: false,

  appliesTo(problem: Problem) {
    if (problem.job !== 'expand') return { applies: false, why: `Job '${problem.job}' is not expand` }
    const input = stringifyNodeOrText(problem.input)
    // Read exactly: every bracket and monomial must expand with exact numbers (productFactorsOf reads them that way).
    const factors = productFactorsOf(input)
    if (!factors) return { applies: false, why: 'the expression is not read exactly' }
    if (!isExpandable(factors)) return { applies: false, why: 'not a product to expand' }
    return { applies: true }
  },

  solve(problem: Problem): Working {
    return expandWorking(problem)
  }
}

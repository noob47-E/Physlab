// Worked example method: linear equations in one variable (a·x + b = c·x + d).
//
// Part of the PhysLab step engine (S0).
// NOTE: THIS IS AN EXAMPLE METHOD ONLY to prove the framework end to end.
// It is NOT the real S1 library (which is built in part S1).

import type { Method, Problem, Working, Step } from '../types'
import {
  tryParsePoly,
  splitEquation,
  stringifyNodeOrText
} from '../check-adapter'
import {
  rat,
  rSub,
  rDiv,
  rIsZero,
  rIsOne,
  rIsNeg,
  rTex,
  rAbs,
  type Rat
} from '../../pure/rat'
import { varsOf, exprDegree, type Expr } from '../../pure/mono'

export const LINEAR_ONE_VAR_ID = 'example.linearOneVar'

/** Extract linear coefficients a and b from an Expr for a given variable: a*x + b. */
function linearCoeffs(p: Expr, v: string): { a: Rat; b: Rat } {
  let a = rat(0n)
  let b = rat(0n)
  for (const term of p) {
    const pow = term.v[v] ?? 0
    if (pow === 1) a = term.c
    else if (pow === 0) b = term.c
  }
  return { a, b }
}

/** Format a single side: a*x + b into standard string. */
function formatLinearSide(a: Rat, b: Rat, v: string): string {
  const hasA = !rIsZero(a)
  const hasB = !rIsZero(b)
  if (!hasA && !hasB) return '0'

  let partA = ''
  if (hasA) {
    if (rIsOne(a)) partA = v
    else if (rIsOne(rAbs(a)) && rIsNeg(a)) partA = `-${v}`
    else partA = `${rTex(a)}${v}`
  }

  if (!hasB) return partA
  if (!hasA) return rTex(b)

  if (rIsNeg(b)) {
    return `${partA} - ${rTex(rAbs(b))}`
  }
  return `${partA} + ${rTex(b)}`
}

/** Format a linear equation: "a*x + b = c*x + d". */
function formatEq(a: Rat, b: Rat, c: Rat, d: Rat, v: string): string {
  return `${formatLinearSide(a, b, v)} = ${formatLinearSide(c, d, v)}`
}

export const linearOneVarMethod: Method = {
  id: LINEAR_ONE_VAR_ID,
  name: 'Linear equation in one variable',
  order: 10,
  isAlternative: false,

  appliesTo(problem: Problem) {
    if (problem.job !== 'solve' && problem.job !== 'equation') {
      return { applies: false, why: `Job '${problem.job}' is not an equation solving job` }
    }

    const split = splitEquation(problem.input)
    if (!split) {
      return { applies: false, why: 'Input does not contain an equals sign (=)' }
    }

    const left = tryParsePoly(split.left)
    const right = tryParsePoly(split.right)
    if (!left || !right) {
      return { applies: false, why: 'Could not parse left and right sides as polynomials' }
    }

    const vars = new Set([...varsOf(left), ...varsOf(right)])
    if (vars.size !== 1) {
      return { applies: false, why: `Expected 1 variable, found ${vars.size}` }
    }

    const v = [...vars][0]
    if (problem.variable && problem.variable !== v) {
      return { applies: false, why: `Problem variable '${problem.variable}' does not match equation variable '${v}'` }
    }

    if (exprDegree(left) > 1 || exprDegree(right) > 1) {
      return { applies: false, why: 'Degree is greater than 1 (not a linear equation)' }
    }

    const { a: a1 } = linearCoeffs(left, v)
    const { a: a2 } = linearCoeffs(right, v)
    if (rIsZero(rSub(a1, a2))) {
      return { applies: false, why: 'Net coefficient of variable is 0 (degenerate equation)' }
    }

    return { applies: true }
  },

  solve(problem: Problem): Working {
    const split = splitEquation(problem.input)!
    const left = tryParsePoly(split.left)!
    const right = tryParsePoly(split.right)!
    const v = [...new Set([...varsOf(left), ...varsOf(right)])][0]

    let { a: aL, b: bL } = linearCoeffs(left, v)
    let { a: aR, b: bR } = linearCoeffs(right, v)

    const steps: Step[] = []
    let currentEq = stringifyNodeOrText(problem.input)

    // Step 1: Collect variable terms on left side (if variable is on right side)
    if (!rIsZero(aR)) {
      const moveTerm = aR
      const nextL_a = rSub(aL, aR)
      const nextR_a = rat(0n)

      const nextEq = formatEq(nextL_a, bL, nextR_a, bR, v)
      const isSubtract = !rIsNeg(moveTerm)
      const termStr = rIsOne(rAbs(moveTerm)) ? v : `${rTex(rAbs(moveTerm))}${v}`
      const sentence = isSubtract
        ? `Subtract ${termStr} from both sides`
        : `Add ${termStr} to both sides`

      steps.push({
        kind: 'EquationEquiv',
        before: currentEq,
        after: nextEq,
        sentence,
        rule: isSubtract ? 'Subtract from both sides' : 'Add to both sides',
        data: { variable: v }
      })

      aL = nextL_a
      aR = nextR_a
      currentEq = nextEq
    }

    // Step 2: Collect constant terms on right side (if constant is on left side)
    if (!rIsZero(bL)) {
      const moveConst = bL
      const nextL_b = rat(0n)
      const nextR_b = rSub(bR, bL)

      const nextEq = formatEq(aL, nextL_b, aR, nextR_b, v)
      const isSubtract = !rIsNeg(moveConst)
      const constStr = rTex(rAbs(moveConst))
      const sentence = isSubtract
        ? `Subtract ${constStr} from both sides`
        : `Add ${constStr} to both sides`

      steps.push({
        kind: 'EquationEquiv',
        before: currentEq,
        after: nextEq,
        sentence,
        rule: isSubtract ? 'Subtract from both sides' : 'Add to both sides',
        data: { variable: v }
      })

      bL = nextL_b
      bR = nextR_b
      currentEq = nextEq
    }

    // Step 3: Divide by coefficient of x (if coefficient is not 1)
    if (!rIsOne(aL)) {
      const coeff = aL
      const finalVal = rDiv(bR, aL)
      const nextEq = `${v} = ${rTex(finalVal)}`
      const coeffStr = rTex(coeff)

      steps.push({
        kind: 'EquationEquiv',
        before: currentEq,
        after: nextEq,
        sentence: `Divide both sides by ${coeffStr}`,
        rule: 'Divide both sides',
        data: { variable: v }
      })
    }

    const solutionRat = rDiv(rSub(bR, bL), aL)
    const solTex = rTex(solutionRat)

    return {
      title: `Solve ${stringifyNodeOrText(problem.input)}`,
      input: stringifyNodeOrText(problem.input),
      method: 'Linear equation in one variable',
      steps,
      answer: {
        label: v,
        tex: solTex,
        value: solTex
      },
      check: `Substitute ${v} = ${solTex} into ${stringifyNodeOrText(problem.input)}`,
      checked: 'ok'
    }
  }
}

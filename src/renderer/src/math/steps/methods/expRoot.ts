// Exponential and logarithmic equations whose answer is a logarithm or a power of e (09-F EXPLOGGEN).
//
// Two shapes, and nothing else:
//   - k·b^(x) + d = c, where b is e or a whole number and the exponent is x alone, with c, d and k rational and the power
//     alone equal to a positive number that is not a whole power of b (e^(x) = 5, 2e^(x) - 3 = 7, 5^(x) = 12). The constant
//     is moved (subtract-both or add-both), the power is isolated (divide-both), and the logarithm is taken (exp-to-log):
//     x = ln 5, 2e^(x) - 3 = 7 gives x = ln 5, and 5^(x) = 12 gives x = ln 12 / ln 5.
//   - ln(A) = c, where c is a whole number: A = e^(c) (log-to-exp). When A is x alone the answer is e^(c), or 1 when c is 0.
//     When c is 0 and A is not x alone (ln(x + 1) = 0) the equation A = 1 is solved by the router and its steps are the
//     working's own.
// A whole-number answer of a whole base (2^(x) = 8) is left to expLog.ts, and so is every other shape: those give no working
// here and the older path answers them. Every move is checked exactly by expRoots.ts.

import type { Method, Problem, Step, StepRouter, Working } from '../types'
import { rAbs, rDiv, rEq, rIsNeg, rIsZero, rat, rSign, rStr, rSub, type Rat } from '../../pure/rat'
import { affineExpOf, atomWithCoefficient, expTex, isExactPowerOf, lnEquationOf, rootTex, unknownLetter, type AffineExp } from '../expRoots'
import { equationStep } from './equation'
import { noWorking } from './quadratic'
import { solveRest, startLine } from './expLog'

const EXPROOT_ID = 'exp.root'
const METHOD_NAME = 'Exponential and logarithmic equation'

/** A power equation the shape reads: the power alone equals target (positive, not a whole power), with the typed pieces. */
interface PowerShape extends AffineExp {
  /** The value the power alone must equal: (c - d) / k. */
  target: Rat
}

function powerShapeOf(input: string): PowerShape | null {
  const v = unknownLetter(input)
  if (v === null) return null
  const shape = affineExpOf(input, v)
  if (shape === null || rIsZero(shape.k)) return null
  const target = rDiv(rSub(shape.c, shape.d), shape.k)
  if (rSign(target) <= 0) return null
  // A value that is a whole power of a whole base is worked by expLog.ts (or is 1, which has no logarithm worth showing).
  if (rEq(target, rat(1n))) return null
  if (shape.base !== 'e' && isExactPowerOf(BigInt(shape.base), target)) return null
  return { ...shape, target }
}

/** A logarithm equation the shape reads: ln(A) = c, where A is x alone or c is 0. */
interface LnShape {
  v: string
  arg: string
  c: bigint
  bare: boolean
}

function lnShapeOf(input: string): LnShape | null {
  const v = unknownLetter(input)
  if (v === null) return null
  const eq = lnEquationOf(input, v)
  if (eq === null) return null
  const bare = eq.arg === v
  if (!bare && eq.c !== 0n) return null
  return { v, arg: eq.arg, c: eq.c, bare }
}

function solvePower(input: string, shape: PowerShape): Working {
  const { v, base, k, d, target } = shape
  const steps: Step[] = []
  let cur = input
  if (!rIsZero(d)) {
    // The constant moves to the other side: subtract it when it is positive, add its size when it is negative.
    const size = rAbs(d)
    const op = rIsNeg(d) ? { kind: 'add-both' as const, term: rStr(size) } : { kind: 'subtract-both' as const, term: rStr(size) }
    const next = `${atomWithCoefficient(base, k, v)}=${rStr(rSub(shape.c, d))}`
    steps.push(equationStep(cur, next, op, v))
    cur = next
  }
  if (!rEq(k, rat(1n))) {
    const next = `${atomWithCoefficient(base, rat(1n), v)}=${rStr(target)}`
    steps.push(equationStep(cur, next, { kind: 'divide-both', k: rStr(k) }, v))
    cur = next
  }
  const line = `${v}=${rootTex(base, target)}`
  steps.push(equationStep(cur, line, { kind: 'exp-to-log', base }, v))
  return {
    title: `Solve ${input}`,
    input,
    method: METHOD_NAME,
    steps,
    answer: { label: v, tex: rootTex(base, target) }
  }
}

function solveLn(input: string, rawInput: string | undefined, shape: LnShape, router: StepRouter): Working {
  const { v, arg, c, bare } = shape
  const start = startLine(input, rawInput)
  const powered = `${arg}=${expTex(c)}`
  const steps: Step[] = [equationStep(start, powered, { kind: 'log-to-exp' }, v)]
  if (c === 0n) {
    const worked = bare ? `${v}=1` : `${arg}=1`
    steps.push(equationStep(powered, worked, { kind: 'work-out-exp' }, v))
    if (bare) {
      return { title: `Solve ${start}`, input: start, method: METHOD_NAME, steps, answer: { label: v, tex: '1' } }
    }
    return solveRest(start, steps, worked, v, router)
  }
  // Only x alone reaches here with c not 0 (lnShapeOf), so the answer is e^(c) exactly.
  return {
    title: `Solve ${start}`,
    input: start,
    method: METHOD_NAME,
    steps,
    answer: { label: v, tex: expTex(c) }
  }
}

export const expRootMethod: Method = {
  id: EXPROOT_ID,
  name: METHOD_NAME,
  order: 31,
  isAlternative: false,

  appliesTo(problem: Problem) {
    if (problem.job !== 'solve' && problem.job !== 'equation') return { applies: false, why: 'Job is not solve' }
    if ((problem.domain ?? 'real') !== 'real') return { applies: false, why: 'Only real equations are worked by this method' }
    const input = String(problem.input)
    if (powerShapeOf(input) !== null || lnShapeOf(input) !== null) return { applies: true }
    return { applies: false, why: 'Not an exponential with base e or a whole base, or a natural logarithm, equal to a number' }
  },

  solve(problem: Problem, router: StepRouter): Working {
    if ((problem.domain ?? 'real') !== 'real') return noWorking()
    const input = String(problem.input)
    const power = powerShapeOf(input)
    if (power !== null) return solvePower(input, power)
    const ln = lnShapeOf(input)
    if (ln !== null) return solveLn(input, problem.rawInput, ln, router)
    return noWorking()
  }
}

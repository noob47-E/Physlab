// Inequalities in one letter (S1e): the working for a line with one of < <= > >=.
//
// The steps, in order, depend on the shape of the inequality:
// - a linear inequality with whole-number sides: the x-terms and then the numbers are moved (each move keeps the
//   relation; dividing by a negative number flips it), then the critical point, then the solution set;
// - a quadratic: the right side moved to 0, the left side factorised (when it has real roots), the critical points,
//   the sign of each part, then the solution set;
// - a fraction, |linear| against a number, or a linear with fractions: the critical points, the sign of each part,
//   then the solution set. The sign step names its expression (left side minus right side, or |g| − c).
// Every step is checked (inequality.ts, validateIneqWorking), and the sentences are built from the typed data
// (sentences.ts, finishStep), so a method never writes its own words.

import type { Expr } from '../../pure/mono'
import { constExpr, eSub, exprDegree, normalize } from '../../pure/mono'
import { rDiv, rIsNeg, rIsZero, rStr, rat, type Rat } from '../../pure/rat'
import { coefficientOf } from '../check-adapter'
import {
  analyseInequality,
  factorText,
  flipRel,
  intervalForm,
  polyText,
  readInequality,
  scaleBy,
  setData,
  setForm,
  signedExpression,
  splitRelation,
  stateText,
  type IneqAnalysis,
  type IneqMoveOp,
  type IneqRel
} from '../inequality'
import { finishStep } from '../sentences'
import type { Method, Problem, Step, StepKind, Working } from '../types'
import { noWorking } from './quadratic'

const METHOD_NAME = 'Inequalities'

/** The steps of one working, each starting where the one before it ends (the first from the input as typed). */
interface Builder {
  readonly steps: Step[]
  /** A step that changes the inequality: it ends in `after`. */
  move(after: string, data: Record<string, unknown>): void
  /** A step that only states what the inequality is: it starts and ends where the state is. */
  claim(kind: StepKind, data: Record<string, unknown>): void
  /** The end of the working: the solution set, which starts where the state is. */
  ending(after: string, data: Record<string, unknown>): void
}

function builderFor(input: string, v: string): Builder {
  const steps: Step[] = []
  let current = input
  const add = (kind: StepKind, after: string, data: Record<string, unknown>): void => {
    steps.push(finishStep({ kind, before: current, after, sentence: '', data: { variable: v, ...data } }))
    current = after
  }
  return {
    steps,
    move: (after, data) => add('IneqMove', after, data),
    claim: (kind, data) => add(kind, current, data),
    ending: (after, data) => add('IneqSolutionSet', after, data)
  }
}

/** The text of the typed problem. */
function inputOf(problem: Problem): string {
  const raw = typeof problem.input === 'string' ? problem.input : problem.rawInput ?? ''
  return raw.trim()
}

/** The move that takes a term off both sides: subtract it when its coefficient is positive, add its size when negative. */
function moveFor(term: Expr, v: string, coefficient: Rat): IneqMoveOp {
  if (rIsNeg(coefficient)) return { kind: 'ineq-add', term: polyText(scaleBy(term, rat(-1n)), v) }
  return { kind: 'ineq-subtract', term: polyText(term, v) }
}

/** Every term has denominator 1: the sides are whole-number polynomials. */
function wholeSides(L: Expr, R: Expr): boolean {
  return [...L, ...R].every((t) => t.c.d === 1n)
}

/** The working of one inequality: its steps, its answer (the inequality form, then the interval form), checked ok. */
function solveInequality(input: string): Working {
  const read = readInequality(input)
  if (!read) return noWorking()
  const analysis = analyseInequality(read)
  if (!analysis) return noWorking()
  const v = read.v
  const b = builderFor(input, v)
  const sides = read.sides
  const degree = sides ? exprDegree(eSub(sides.L, sides.R)) : -1
  // A linear line with whole-number sides is solved by its moves alone, so it gets no sign step: a sign chart would only
  // repeat what the moves have already said, and it would have to name a quantity the shown line does not hold.
  const linear = sides !== null && degree === 1 && wholeSides(sides.L, sides.R)

  if (sides && linear) {
    linearMoves(sides.L, sides.R, read.rel, v, b)
  } else if (sides && degree === 2) {
    quadraticMoves(sides.L, sides.R, read.rel, v, analysis, b)
  }
  claimCritical(analysis, b)
  if (!linear) claimSigns(analysis, b, signedExpression(read))
  const set = analysis.set
  b.ending(intervalForm(set), { intervals: setData(set) })

  return {
    title: `Solve ${input}`,
    input,
    method: METHOD_NAME,
    steps: b.steps,
    answer: [
      { label: '', tex: setForm(set, v, true) },
      { label: '', tex: intervalForm(set) }
    ],
    checked: 'ok'
  }
}

/** Linear with whole-number sides: x-terms to the left, numbers to the right, then divide by the coefficient of x. */
function linearMoves(L: Expr, R: Expr, rel: IneqRel, v: string, b: Builder): void {
  let curL = L
  let curR = R
  let relNow = rel
  const xTerm = (c: Rat): Expr => normalize([{ c, v: { [v]: 1 } }])

  const aR = coefficientOf(curR, v, 1)
  if (!rIsZero(aR)) {
    const term = xTerm(aR)
    curL = eSub(curL, term)
    curR = eSub(curR, term)
    b.move(stateText(curL, curR, relNow, v), { move: moveFor(term, v, aR) })
  }

  const bL = coefficientOf(curL, v, 0)
  if (!rIsZero(bL)) {
    const term = constExpr(bL)
    curL = eSub(curL, term)
    curR = eSub(curR, term)
    b.move(stateText(curL, curR, relNow, v), { move: moveFor(term, v, bL) })
  }

  const A = coefficientOf(curL, v, 1)
  if (!(A.n === 1n && A.d === 1n)) {
    const inverse = rDiv(rat(1n), A)
    curL = scaleBy(curL, inverse)
    curR = scaleBy(curR, inverse)
    if (rIsNeg(A)) relNow = flipRel(relNow)
    b.move(stateText(curL, curR, relNow, v), { move: { kind: 'ineq-divide', k: rStr(A) } })
  }
}

/** Quadratic: the right side moved to 0, then the left side factorised over the rationals when it has real roots. */
function quadraticMoves(L: Expr, R: Expr, rel: IneqRel, v: string, analysis: IneqAnalysis, b: Builder): void {
  let curL = L
  if (R.length > 0) {
    const move: IneqMoveOp =
      exprDegree(R) === 0 ? moveFor(R, v, coefficientOf(R, v, 0)) : { kind: 'ineq-subtract', term: polyText(R, v) }
    curL = eSub(curL, R)
    b.move(stateText(curL, [], rel, v), { move })
  }
  const zeros = analysis.zeros
  if (zeros.length > 0) {
    // A double root is written twice, (x − r)(x − r), so the product has the quadratic's two factors.
    const roots = zeros.length === 1 ? [zeros[0], zeros[0]] : [zeros[0], zeros[1]]
    const lead = coefficientOf(curL, v, 2)
    b.move(`${factorText(lead, roots, v)} ${rel} 0`, {
      move: { kind: 'ineq-factorise', lead: rStr(lead), roots: roots.map((r) => rStr(r)) }
    })
  }
}

/** The critical points: where the two sides are equal, and where a denominator is 0 (the expression is undefined there). */
function claimCritical(analysis: IneqAnalysis, b: Builder): void {
  b.claim('IneqCritical', {
    zeros: analysis.zeros.map((r) => rStr(r)),
    poles: analysis.poles.map((r) => rStr(r))
  })
}

/** The sign of the named expression in each part between the critical points. */
function claimSigns(analysis: IneqAnalysis, b: Builder, expression: string): void {
  b.claim('IneqSigns', {
    points: analysis.points.map((r) => rStr(r)),
    signs: analysis.signs.map((s) => (s > 0 ? '+' : '-')),
    expression
  })
}

export const inequalityMethod: Method = {
  id: 'inequality.solve',
  name: METHOD_NAME,
  order: 5,

  appliesTo(problem: Problem) {
    if (problem.job !== 'solve') return { applies: false, why: 'Not a solving job' }
    return splitRelation(inputOf(problem)) !== null ? { applies: true } : { applies: false, why: 'Not an inequality' }
  },

  solve(problem: Problem): Working {
    return solveInequality(inputOf(problem))
  }
}

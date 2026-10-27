// Sum of two base-10 logarithms: log(A) + log(B) = c (e.g. log(x) + log(x - 3) = 1)

import type { Method, Problem, Step, StepAnswer, StepRouter, Working } from '../types'
import { logSumOf, rationalRootsOf, valueAt } from '../expRoots'
import { noWorking } from './quadratic'
import { finishStep } from '../sentences'
import { constExpr, eMul, eSub, exprTex, parseExpr, varsOf, type Expr } from '../../pure/mono'
import { rat, rStr, type Rat } from '../../pure/rat'
import { latexToMath } from '../../latexToMath'

const LOGSUM_ID = 'log.sum'
const METHOD_NAME = 'Exponential and logarithmic equation'

export function logSumMethodSolver(problem: Problem, router: StepRouter): Working {
  if (problem.job !== 'solve' && problem.job !== 'equation') return noWorking()
  if (typeof problem.input !== 'string' || (problem.domain ?? 'real') !== 'real') return noWorking()

  let input = problem.input
  let sum = logSumOf(input)
  if (!sum && problem.rawInput) {
    try {
      sum = logSumOf(problem.rawInput)
      if (sum) input = problem.rawInput
    } catch {
      // ignore
    }
  }
  if (!sum) {
    try {
      const converted = latexToMath(input)
      sum = logSumOf(converted)
    } catch {
      // ignore
    }
  }
  if (!sum || sum.args.length !== 2) return noWorking()

  let v = problem.variable
  let A: Expr
  let B: Expr
  try {
    A = parseExpr(sum.args[0])
    B = parseExpr(sum.args[1])
  } catch {
    return noWorking()
  }

  if (!v) {
    const letters = new Set<string>()
    for (const l of varsOf(A)) letters.add(l)
    for (const l of varsOf(B)) letters.add(l)
    if (letters.size !== 1) return noWorking()
    v = [...letters][0]
  }

  const P = eMul(A, B)
  const powerVal = 10n ** sum.c
  const Q = eSub(P, constExpr(rat(powerVal)))
  const roots = rationalRootsOf(Q, v)
  if (roots === null) return noWorking()

  const kept: Rat[] = []
  const rejected: Rat[] = []
  for (const r of roots) {
    const valA = valueAt(sum.args[0], v, r)
    const valB = valueAt(sum.args[1], v, r)
    if (valA !== null && valA.n > 0n && valB !== null && valB.n > 0n) {
      kept.push(r)
    } else {
      rejected.push(r)
    }
  }

  const pTex = exprTex(P)
  const pPlain = pTex.replace(/\^\{(\d+)\}/g, '^$1')
  const powerStepAfter = `${pPlain} = 10^(${sum.c})`
  const workedOutAfter = `${pPlain} = ${powerVal}`
  const plainSubInput = workedOutAfter

  // Sub-working solves plainSubInput
  const sub = router.solve({ job: 'solve', input: plainSubInput, variable: v, domain: 'real' }, { includeAlternatives: false })
  if (sub.noWorking || sub.steps.length === 0 || sub.answer === undefined) return noWorking()

  let orig = problem.rawInput && problem.rawInput.includes('\\log') ? problem.rawInput.trim() : input.trim()
  if (!orig.includes('\\log')) {
    orig = orig.replace(/\blog\b/g, '\\log')
  }
  const s0After = orig

  const step0: Step = finishStep({
    kind: 'Implication',
    before: orig,
    after: s0After,
    sentence: '',
    data: { action: 'log-domain', args: sum.args, variable: v }
  })

  const step1: Step = finishStep({
    kind: 'Implication',
    before: s0After,
    after: `\\log(${pPlain}) = ${sum.c}`,
    sentence: '',
    data: { action: 'join-logs', args: sum.args, variable: v }
  })

  const step2: Step = finishStep({
    kind: 'EquationEquiv',
    before: `\\log(${pPlain}) = ${sum.c}`,
    after: powerStepAfter,
    sentence: '',
    op: { kind: 'log-to-power', base: '10' }
  })

  const step3: Step = finishStep({
    kind: 'EquationEquiv',
    before: powerStepAfter,
    after: workedOutAfter,
    sentence: '',
    op: { kind: 'work-out-power' }
  })

  const endingAfter = kept.length === 0
    ? `\\text{No value of ${v} works}`
    : kept.map((r) => `${v} = ${rStr(r)}`).join(' \\text{ or } ')

  const step4: Step = finishStep({
    kind: 'SolutionSetEq',
    before: workedOutAfter,
    after: endingAfter,
    sentence: '',
    data: {
      logSum: true,
      domain: 'real',
      original: orig,
      variable: v,
      solutions: kept.map((r) => ({ label: v, value: rStr(r), tex: rStr(r) })),
      rejected: rejected.map((r) => rStr(r))
    }
  })

  const answers: StepAnswer[] = kept.length === 0
    ? [{ label: v, tex: '\\text{No solution}' }]
    : kept.map((r) => ({ label: v, tex: rStr(r), value: rStr(r) }))

  return {
    title: `Solve ${orig}`,
    input: orig,
    method: METHOD_NAME,
    steps: [step0, step1, step2, step3, step4],
    subWorkings: [sub],
    answer: answers,
    checked: 'ok',
    domain: 'real'
  }
}

export const logSumMethod: Method = {
  id: LOGSUM_ID,
  name: METHOD_NAME,
  order: 28,
  isAlternative: false,
  appliesTo: (problem) => {
    if (problem.job !== 'solve' && problem.job !== 'equation') return false
    const str = typeof problem.input === 'string' ? problem.input : (typeof problem.rawInput === 'string' ? problem.rawInput : '')
    return /log/i.test(str) && str.includes('+')
  },
  solve: logSumMethodSolver
}

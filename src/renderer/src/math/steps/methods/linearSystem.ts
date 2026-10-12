// Simultaneous linear equations (S1d): two or three equations in two or three letters, solved by elimination (the
// first method) and by substitution (Another way). A system is a list of equations, each side a linear form with exact
// rational coefficients (check-adapter.ts). Every move is one SystemEq step; the words come from sentences.ts.
//
// Elimination: clear the fractions, then for each letter in turn make the other remaining equations free of it (scale,
// then add or subtract), read off the rows with no letters left (0 = c is no solution; 0 = 0 is no condition), and
// solve back: each pivot row, with the letters solved after it put in, is scaled to "letter = number".
// Substitution: for each letter in turn make one remaining equation its subject and substitute it into the others, then
// solve back the same way. Both end with the same two endings: no common solution, or infinitely many (the lines).

import type { Method, Problem, Step, StepAnswer, SystemOp, Working } from '../types'
import { CANT_SHOW_STEPS_REASON } from '../types'
import {
  addEq,
  systemCoefficient,
  isNormalEq,
  isSubjectOf,
  lettersOfSystem,
  linFormText,
  makeSubjectEq,
  ratText,
  readSystem,
  rowText,
  scaleEq,
  stringifyNodeOrText,
  substituteEq,
  systemText,
  type LinEq
} from '../check-adapter'
import { finishStep, systemEndingAnswer } from '../sentences'
import { bgcd, rat, rDiv, rEq, rIsZero, rNeg, rSub, type Rat } from '../../pure/rat'

const ELIMINATION_ID = 'linearSystem.elimination'
const SUBSTITUTION_ID = 'linearSystem.substitution'

const ELIMINATION_NAME = 'Solve by elimination'
const SUBSTITUTION_NAME = 'Solve by substitution'

const declined = (): Working => ({ steps: [], noWorking: true, reason: CANT_SHOW_STEPS_REASON })

const abs = (n: bigint): bigint => (n < 0n ? -n : n)
const lcm = (a: bigint, b: bigint): bigint => (a / bgcd(a, b)) * b

/** One SystemEq step: the system before and after the move, the op, and the letters of the typed system. */
function stepFor(before: LinEq[], after: LinEq[], op: SystemOp, vars: string[]): Step {
  return finishStep({
    kind: 'SystemEq',
    op,
    before: systemText(before, vars),
    after: systemText(after, vars),
    sentence: '',
    data: { vars }
  })
}

/** Scale equation i by k: one step (k is not zero, and not one). */
function scaleStep(state: LinEq[], i: number, k: Rat, vars: string[], steps: Step[]): LinEq[] {
  const next = state.slice()
  next[i] = scaleEq(state[i], k)
  steps.push(stepFor(state, next, { kind: 'scale-equation', i, k: ratText(k) }, vars))
  return next
}

/** Clear the fractions: each equation scaled by the least common multiple of its denominators, when that is above one. */
function clearFractions(state: LinEq[], vars: string[], steps: Step[]): LinEq[] {
  let cur = state.slice()
  for (let i = 0; i < cur.length; i++) {
    let k = 1n
    for (const f of [cur[i].L, cur[i].R]) {
      for (const n of Object.keys(f.v)) k = lcm(k, f.v[n].d)
      k = lcm(k, f.c.d)
    }
    if (k > 1n) cur = scaleStep(cur, i, rat(k), vars, steps)
  }
  return cur
}

/**
 * Make row q free of v, using the pivot row p (which keeps v). The two coefficients are made equal in size: the opposite
 * ones are added, the equal ones subtracted. Each scale is one step, and so is the add or subtract. Whole coefficients
 * only (the fractions are cleared first).
 */
function eliminate(state: LinEq[], q: number, p: number, v: string, vars: string[], steps: Step[]): LinEq[] {
  let cur = state.slice()
  const cp = systemCoefficient(cur[p], v)
  const cq = systemCoefficient(cur[q], v)
  if (rEq(cp, rNeg(cq))) {
    const next = cur.slice()
    next[q] = addEq(cur[q], cur[p], 1)
    steps.push(stepFor(cur, next, { kind: 'add-equations', i: q, j: p }, vars))
    return next
  }
  // The pivot times a and row q times b give the same coefficient: a = |cq|/g, and b = (cp/g) with the sign of cq.
  const g = bgcd(abs(cp.n), abs(cq.n))
  const a = rat(abs(cq.n) / g)
  const b = rat((cp.n / g) * (cq.n < 0n ? -1n : 1n))
  if (!rEq(a, rat(1n))) cur = scaleStep(cur, p, a, vars, steps)
  if (!rEq(b, rat(1n))) cur = scaleStep(cur, q, b, vars, steps)
  const next = cur.slice()
  next[q] = addEq(cur[q], cur[p], -1)
  steps.push(stepFor(cur, next, { kind: 'subtract-equations', i: q, j: p }, vars))
  return next
}

/** Put the subject's letter into equation target: one substitute, or a back-substitute when the subject is a number. */
function substituteStep(
  state: LinEq[],
  subject: number,
  target: number,
  v: string,
  vars: string[],
  steps: Step[]
): LinEq[] | null {
  const e = substituteEq(state[target], state[subject], v)
  if (!e) return null
  const next = state.slice()
  next[target] = e
  const numeric = Object.keys(state[subject].R.v).length === 0
  const op: SystemOp = {
    kind: numeric ? 'back-substitute' : 'substitute',
    i: subject,
    j: target,
    v,
    expr: linFormText(state[subject].R, vars)
  }
  steps.push(stepFor(state, next, op, vars))
  return next
}

/** The first row with no letters left and a constant that does not balance: 0 = c with c not zero. */
function contradictionRow(state: LinEq[], rows: number[], vars: string[]): number | undefined {
  return rows.find(
    (i) => vars.every((n) => rIsZero(systemCoefficient(state[i], n))) && !rIsZero(rSub(state[i].L.c, state[i].R.c))
  )
}

/** The working that ends in one of the two endings: the ending is its last step, and its answer is the sentence's words. */
function endedWorking(input: string, method: string, steps: Step[], state: LinEq[], vars: string[], op: SystemOp): Working {
  if (steps.length === 0) return declined()
  const words = systemEndingAnswer(op, vars.length) ?? ''
  // The words are drawn as text, never as maths: \text{...} (P-FIX-S1SOUND2 SHOULD 2).
  const drawn = `\\text{${words}}`
  steps.push(
    finishStep({
      kind: 'SystemEq',
      op,
      before: systemText(state, vars),
      after: drawn,
      sentence: '',
      data: { vars }
    })
  )
  return { title: `Solve ${input}`, input, method, steps, answer: { label: '', tex: drawn } }
}

/** The working that ends in a solution: the answer is each letter's value from its solved row. */
function solvedWorking(input: string, method: string, steps: Step[], state: LinEq[], vars: string[], solved: Map<string, number>): Working {
  if (steps.length === 0) return declined()
  const answer: StepAnswer[] = []
  for (const v of vars) {
    const row = solved.get(v)
    if (row === undefined) return declined()
    answer.push({ label: v, tex: ratText(state[row].R.c) })
  }
  return { title: `Solve ${input}`, input, method, steps, answer }
}

/** The system a problem asks for: two or three equations (or more), each with its constants on the right, read exactly. */
function systemOf(problem: Problem): { input: string; typed: LinEq[]; vars: string[] } | null {
  const input = stringifyNodeOrText(problem.input)
  const typed = readSystem(input)
  if (!typed || typed.length < 2 || !typed.every(isNormalEq)) return null
  const vars = lettersOfSystem(typed)
  if (vars.length === 0) return null
  return { input, typed, vars }
}

/** A coefficient is a whole number (the fractions are cleared before any elimination). */
function wholeSystem(state: LinEq[], vars: string[]): boolean {
  return state.every((e) => vars.every((n) => systemCoefficient(e, n).d === 1n))
}

function eliminationWorking(problem: Problem): Working {
  const sys = systemOf(problem)
  if (!sys) return declined()
  const { input, typed, vars } = sys
  const steps: Step[] = []
  let state = clearFractions(typed, vars, steps)
  if (!wholeSystem(state, vars)) return declined()
  const remaining: number[] = state.map((_, i) => i)
  const pivots: Array<{ row: number; v: string }> = []
  for (const v of vars) {
    const p = remaining.find((i) => !rIsZero(systemCoefficient(state[i], v)))
    if (p === undefined) continue
    for (const q of remaining.slice()) {
      if (q === p || rIsZero(systemCoefficient(state[q], v))) continue
      state = eliminate(state, q, p, v, vars, steps)
    }
    remaining.splice(remaining.indexOf(p), 1)
    pivots.push({ row: p, v })
  }
  const bad = contradictionRow(state, remaining, vars)
  if (bad !== undefined) {
    return endedWorking(input, ELIMINATION_NAME, steps, state, vars, {
      kind: 'no-common-solution',
      i: bad,
      row: rowText(state[bad], vars)
    })
  }
  if (pivots.length < vars.length) {
    const rows = pivots.map((p) => p.row)
    return endedWorking(input, ELIMINATION_NAME, steps, state, vars, {
      kind: 'infinitely-many',
      rows,
      texts: rows.map((r) => rowText(state[r], vars))
    })
  }
  // Solve back: the last pivot first, each row with the later letters put in, then scaled to "letter = number".
  const solved = new Map<string, number>()
  for (let k = pivots.length - 1; k >= 0; k--) {
    const { row: p, v } = pivots[k]
    for (const u of vars) {
      if (u === v || rIsZero(systemCoefficient(state[p], u))) continue
      const j = solved.get(u)
      if (j === undefined) return declined()
      const next = substituteStep(state, j, p, u, vars, steps)
      if (!next) return declined()
      state = next
    }
    const c = systemCoefficient(state[p], v)
    if (rIsZero(c)) return declined()
    if (!rEq(c, rat(1n))) state = scaleStep(state, p, rDiv(rat(1n), c), vars, steps)
    solved.set(v, p)
  }
  return solvedWorking(input, ELIMINATION_NAME, steps, state, vars, solved)
}

/**
 * True when row a is a better subject for v than row b: a unit coefficient (1 or −1) beats any other, and between two
 * others the smaller magnitude wins. Exact: magnitudes are compared by cross-multiplying, never by floating point.
 */
function betterSubject(a: LinEq, b: LinEq, v: string): boolean {
  const ca = systemCoefficient(a, v)
  const cb = systemCoefficient(b, v)
  const unitA = abs(ca.n) === ca.d
  const unitB = abs(cb.n) === cb.d
  if (unitA !== unitB) return unitA
  return abs(ca.n) * cb.d < abs(cb.n) * ca.d
}

function substitutionWorking(problem: Problem): Working {
  const sys = systemOf(problem)
  if (!sys) return declined()
  const { input, typed, vars } = sys
  const steps: Step[] = []
  let state = clearFractions(typed, vars, steps)
  const remaining: number[] = state.map((_, i) => i)
  const subjects: Array<{ row: number; v: string }> = []
  for (const v of vars) {
    const candidates = remaining.filter((i) => !rIsZero(systemCoefficient(state[i], v)))
    if (candidates.length === 0) continue
    const e = candidates.reduce((best, i) => (betterSubject(state[i], state[best], v) ? i : best))
    if (!isSubjectOf(state[e], v)) {
      const made = makeSubjectEq(state[e], v)
      if (!made) return declined()
      const next = state.slice()
      next[e] = made
      steps.push(stepFor(state, next, { kind: 'make-subject', i: e, v }, vars))
      state = next
    }
    for (const j of remaining.slice()) {
      if (j === e || rIsZero(systemCoefficient(state[j], v))) continue
      const next = substituteStep(state, e, j, v, vars, steps)
      if (!next) return declined()
      state = next
    }
    remaining.splice(remaining.indexOf(e), 1)
    subjects.push({ row: e, v })
  }
  const bad = contradictionRow(state, remaining, vars)
  if (bad !== undefined) {
    return endedWorking(input, SUBSTITUTION_NAME, steps, state, vars, {
      kind: 'no-common-solution',
      i: bad,
      row: rowText(state[bad], vars)
    })
  }
  if (subjects.length < vars.length) {
    const rows = subjects.map((s) => s.row)
    return endedWorking(input, SUBSTITUTION_NAME, steps, state, vars, {
      kind: 'infinitely-many',
      rows,
      texts: rows.map((r) => rowText(state[r], vars))
    })
  }
  // Solve back: the last subject first; each subject row has its later letters put in, and then reads v = number.
  const solved = new Map<string, number>()
  for (let k = subjects.length - 1; k >= 0; k--) {
    const { row: e, v } = subjects[k]
    for (const u of vars) {
      if (u === v || rIsZero(systemCoefficient(state[e], u))) continue
      const j = solved.get(u)
      if (j === undefined) return declined()
      const next = substituteStep(state, j, e, u, vars, steps)
      if (!next) return declined()
      state = next
    }
    solved.set(v, e)
  }
  return solvedWorking(input, SUBSTITUTION_NAME, steps, state, vars, solved)
}

/** Applies to a problem that is a system of two or more linear equations (job 'solve', as the one-letter methods). */
function appliesSystem(problem: Problem): { applies: boolean; why?: string } {
  if (problem.job !== 'solve') return { applies: false, why: `Job '${problem.job}' is not an equation solving job` }
  return systemOf(problem) ? { applies: true } : { applies: false, why: 'not a system of linear equations read exactly' }
}

/** The primary method: elimination. */
export const linearSystemEliminationMethod: Method = {
  id: ELIMINATION_ID,
  name: ELIMINATION_NAME,
  order: 10,
  isAlternative: false,
  appliesTo: appliesSystem,
  solve(problem: Problem): Working {
    return eliminationWorking(problem)
  }
}

/** Another way: substitution. */
export const linearSystemSubstitutionMethod: Method = {
  id: SUBSTITUTION_ID,
  name: SUBSTITUTION_NAME,
  order: 20,
  isAlternative: true,
  appliesTo: appliesSystem,
  solve(problem: Problem): Working {
    return substitutionWorking(problem)
  }
}

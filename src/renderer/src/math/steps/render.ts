// The bridge to the Working panel: converts a Working into the WorkingDoc format.
//
// Part of the PhysLab step engine (S0).
// Read-only bridge: does not modify math/pure/work.ts or panels/WorkingView.tsx.
// Nested sub-workings fold as the panel's existing groups do via subgoal headings.

import type { Move, Answer, Working as PureWorkingDoc } from '../pure/work'
import type { Working, Step, Problem, StepAnswer } from './types'
import { validateWorking } from './validate'
import type { CheckAdapter } from './check-adapter'

/** Helper to convert an expression or equation AST/string into LaTeX display math. */
export function formatTex(val: unknown): string {
  if (typeof val === 'string') {
    // If it is already LaTeX (contains backslashes) or an equation, return it cleaned
    return val.trim()
  }
  if (val && typeof val === 'object' && 'toTex' in val && typeof (val as { toTex: () => string }).toTex === 'function') {
    return (val as { toTex: () => string }).toTex()
  }
  return String(val ?? '')
}

/** Convert a Step to a Pure Math Move. */
export function stepToMove(step: Step): Move {
  const tex = step.after ? formatTex(step.after) : undefined
  return {
    head: step.sentence,
    rule: step.rule,
    tex,
    note: step.note,
    subgoal: step.subgoal
  }
}

/**
 * Collect moves from a Working and its nested subWorkings.
 * Sub-workings are flattened into moves where the first move of each sub-working
 * is tagged with a `subgoal` representing the sub-problem heading.
 */
export function collectMoves(working: Working): Move[] {
  const moves: Move[] = working.steps.map(stepToMove)

  if (working.subWorkings && working.subWorkings.length > 0) {
    for (const sub of working.subWorkings) {
      const subMoves = collectMoves(sub)
      if (subMoves.length > 0) {
        // Tag the first move of the sub-working with a subgoal heading if not already tagged
        const groupTitle = sub.title || sub.method || 'Sub-problem'
        if (!subMoves[0].subgoal) {
          subMoves[0] = { ...subMoves[0], subgoal: groupTitle }
        }
        moves.push(...subMoves)
      }
    }
  }

  return moves
}

/** Format answers into Pure Math Answer records. */
export function formatAnswers(answer?: StepAnswer | StepAnswer[]): Answer[] {
  if (!answer) return []
  const list = Array.isArray(answer) ? answer : [answer]
  return list.map((a) => ({
    label: a.label,
    tex: a.tex || a.value || ''
  }))
}

/**
 * Bridge a step engine Working into the existing Working document format
 * consumed by WorkingView.tsx.
 */
export function renderWorkingToDoc(
  working: Working,
  problem?: Problem,
  adapter?: CheckAdapter
): PureWorkingDoc {
  const title = working.title ?? (problem ? `${problem.job} ${typeof problem.input === 'string' ? problem.input : ''}`.trim() : 'Worked solution')
  const input = working.input ?? (problem ? (typeof problem.input === 'string' ? problem.input : '') : '')

  if (working.error) {
    return {
      title,
      input,
      moves: [],
      answers: [],
      error: working.error
    }
  }

  const answers = formatAnswers(working.answer)

  if (working.noWorking) {
    return {
      title,
      input,
      method: working.method,
      moves: [],
      answers,
      noWorking: true,
      reason: working.reason,
      check: working.check,
      checked: working.checked
    }
  }

  // Framework invariant (Rule 0.2): Only 'valid' steps are ever shown.
  // Validate the steps before rendering moves. If any step is not 'valid',
  // moves are stripped and noWorking is set with the standard fallback reason.
  const validation = validateWorking(working, adapter)
  if (!validation.valid) {
    return {
      title,
      input,
      method: working.method,
      moves: [],
      answers,
      noWorking: true,
      reason: "I can't show the steps for this one yet",
      check: working.check,
      checked: working.checked
    }
  }

  const moves = collectMoves(working)

  return {
    title,
    input,
    method: working.method,
    moves,
    answers,
    check: working.check,
    checked: working.checked,
    noWorking: working.noWorking,
    reason: working.reason
  }
}

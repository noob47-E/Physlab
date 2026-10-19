// The bridge to the Working panel: converts a Working into the WorkingDoc format.
//
// Part of the PhysLab step engine (S0).
// Read-only bridge: does not modify math/pure/work.ts or panels/WorkingView.tsx.
// Nested sub-workings fold as the panel's existing groups do via subgoal headings.

import type { Move, Answer, Working as PureWorkingDoc } from '../pure/work'
import type { Working, Step, Problem, StepAnswer } from './types'
import { validateWorking } from './validate'
import { substitutionOf } from './sentences'
import type { CheckAdapter } from './check-adapter'

import { displaySafe, drawnTex } from './displaySafe'

export { displaySafe, drawnTex } from './displaySafe'

/** Superscript and subscript digits for display. */
const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻'
}

/** Convert LaTeX-like notation to readable display text with superscripts and proper formatting. */
export function toDisplayTex(text: string): string {
  return text
    .replace(/\\left|\\right/g, '')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\frac\{(-?\d+)\}\{(\d+)\}/g, '$1/$2')
    .replace(/\^\{(\((-?\d+)\))\}/g, '^$2')
    .replace(/\^\{(-?\d+)\}/g, '^$1')
    .replace(/\^(\d+)/g, (_all: string, ds: string) => [...ds].map((d) => SUPERSCRIPT[d]).join(''))
    .replace(/\^(-\d)/g, (_all: string, d: string) => SUPERSCRIPT[d] || d)
    .replace(/\*(?!\w)/g, '')
    .replace(/ - /g, ' − ')
    .replace(/^-/, '−')
    .replace(/\s+/g, ' ')
    .trim()
}

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

/**
 * The method names the page shows. A working's method name is text it carries, so only these fixed names are drawn
 * (P-FIX-S1SOUND2 MUST 8: no free text reaches the page).
 */
const SHOWN_METHOD_NAMES = new Set([
  'Linear equation in one variable',
  'Solve by elimination',
  'Solve by substitution',
  'Factorising',
  'Factorise',
  'Expand',
  'Quadratic formula',
  'Discriminant',
  'Completing the square',
  'Inequalities'
])

/**
 * The heading of a sub-working, built from its own data and never its free title: "Discriminant" for the discriminant, or
 * "Solve <case>" for the case it solves (its typed input, which the validator has tied to the parent's case). A sub-working
 * with no input to name is "Case n".
 */
export function subHeading(sub: Working, index: number): string {
  const first = sub.steps[0]
  const role = first && first.data && typeof first.data === 'object' ? (first.data as { role?: unknown }).role : undefined
  if (role === 'discriminant') return 'Discriminant'
  if (typeof sub.input === 'string' && sub.input !== '') return `Solve ${toDisplayTex(drawnTex(sub.input))}`
  return `Case ${index + 1}`
}

/** Convert a Step to a Pure Math Move. The note and the subgoal are free text, so they are not drawn. */
export function stepToMove(step: Step): Move {
  const tex = step.after ? drawnTex(formatTex(step.after)) : undefined
  return {
    head: step.sentence,
    rule: step.rule,
    tex
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
    working.subWorkings.forEach((sub, index) => {
      const subMoves = collectMoves(sub)
      if (subMoves.length > 0) {
        // The first move of the sub-working carries its heading, built from its own data.
        subMoves[0] = { ...subMoves[0], subgoal: subHeading(sub, index) }
        moves.push(...subMoves)
      }
    })
  }

  return moves
}

/** Format answers into Pure Math Answer records. */
export function formatAnswers(answer?: StepAnswer | StepAnswer[]): Answer[] {
  if (!answer) return []
  const list = Array.isArray(answer) ? answer : [answer]
  return list.map((a) => ({
    label: a.label,
    tex: drawnTex(a.tex || a.value || '')
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
  // P-FIX-S1SOUND2 MUST 13: nothing thrown while rendering reaches the page; a working that cannot be rendered says so.
  try {
    return renderChecked(working, problem, adapter)
  } catch {
    return cantShow(working, problem)
  }
}

const CANT_SHOW_TEXT = "I can't show the steps for this one yet"

/**
 * The title is the job and the typed input, built here, never the free title a working carries (MUST 8): "Solve 2x + 4 = 10".
 */
function titleOf(working: Working, problem: Problem | undefined): string {
  if (!problem) return 'Worked solution'
  const job = typeof problem.job === 'string' && problem.job !== '' ? problem.job.charAt(0).toUpperCase() + problem.job.slice(1) : 'Worked'
  return `${job} ${inputOf(working, problem)}`.trim()
}

function inputOf(working: Working, problem: Problem | undefined): string {
  const raw = typeof working.input === 'string' ? working.input : problem && typeof problem.input === 'string' ? problem.input : ''
  // The typed problem is drawn only when it is safe to draw as it is read: a can't-show page can carry an unsafe input (x_1 = 2),
  // and then it is not drawn (review of P-FIX-S1SOUND2, MUST A2).
  const drawn = drawnTex(raw)
  return displaySafe(drawn) ? toDisplayTex(drawn) : ''
}

function shownMethod(name: unknown): string | undefined {
  return typeof name === 'string' && SHOWN_METHOD_NAMES.has(name) ? name : undefined
}

/**
 * The can't-show page: no steps and no answer. An answer is drawn only with the steps that check it, so a working that is
 * not shown has none (P-FIX-S1SOUND2 MUST 9): the answer a working carries with no steps is never drawn.
 */
function cantShow(working: Working, problem: Problem | undefined): PureWorkingDoc {
  return {
    title: titleOf(working, problem),
    input: inputOf(working, problem),
    method: shownMethod(working.method),
    moves: [],
    answers: [],
    noWorking: true,
    reason: CANT_SHOW_TEXT,
    checked: working.checked
  }
}

function renderChecked(working: Working, problem: Problem | undefined, adapter: CheckAdapter | undefined): PureWorkingDoc {
  if (working.error !== undefined || working.noWorking) return cantShow(working, problem)
  // Framework invariant (Rule 0.2): Only 'valid' steps are ever shown. The working is validated against the problem's
  // own domain; if anything is not valid, nothing reaches the page: no moves, and no answer either.
  const validation = validateWorking(working, adapter, problem?.domain)
  if (!validation.valid) return cantShow(working, problem)

  const doc: PureWorkingDoc = {
    title: titleOf(working, problem),
    input: inputOf(working, problem),
    method: shownMethod(working.method),
    moves: collectMoves(working),
    answers: formatAnswers(working.answer),
    check: checkDrawn(working),
    checked: working.checked ?? (validation.valid ? 'ok' : undefined)
  }

  if (working.anotherWay) {
    const alt = renderChecked(working.anotherWay, problem, adapter)
    if (!alt.noWorking && alt.moves.length > 0) {
      doc.anotherWay = alt
    }
  }

  return doc
}

/** The check line as the page draws it: the builder's text, with powers braced as the validator checked them. */
function checkDrawn(working: Working): string | undefined {
  const text = substitutionOf(working)?.text
  return text === undefined ? undefined : drawnTex(text)
}

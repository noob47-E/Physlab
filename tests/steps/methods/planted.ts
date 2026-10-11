// Planted wrong steps for the S1a method tests. Each mutant is a real working with one thing made wrong:
// a displayed line, a declared op, a chain link, the sentence or rule of a step, the check line, or the data
// of a split. For every mutant the test asks two things, and both must hold:
//   1. the validators reject it (validateWorking is not valid), and
//   2. the Working panel bridge shows nothing for the broken part: renderWorkingToDoc of the node that
//      holds the broken step has no moves and says noWorking. Judged by what is rendered, never by the
//      validator's verdict alone, so a broken Another way cannot pass by being "not valid".
// A mutant that breaks only the arithmetic is restamped (its sentence and rule rebuilt from its op), so the
// arithmetic is what is tested. A sentence, rule, check or op-label mutant keeps its wrong words or label.

import type { Step, StepAnswer, Working } from '../../../src/renderer/src/math/steps/types'
import { validateWorking } from '../../../src/renderer/src/math/steps/validate'
import { renderWorkingToDoc } from '../../../src/renderer/src/math/steps/render'
import { finishStep } from '../../../src/renderer/src/math/steps/sentences'

type MutationKind =
  | 'bump'
  | 'sign'
  | 'divideByZero'
  | 'dropCase'
  | 'wrongCase'
  | 'chainBreak'
  | 'scaleZero'
  | 'scaleOther'
  | 'noOp'
  | 'mislabel'
  | 'sentence'
  | 'rule'
  | 'check'
  | 'answerValue'
  | 'answerLabel'

interface Mutant {
  kind: MutationKind
  /** The step that was made wrong, in the mutant's own copy of the working (absent for a check mutant). */
  step?: Step
  /** The working (in the mutant's copy) that holds the broken step: the top, a sub-working, or the Another way. */
  node: Working
  /** The whole working (the mutant's copy). */
  working: Working
}

function clone(w: Working): Working {
  return JSON.parse(JSON.stringify(w)) as Working
}

/** Every working in the tree: the top one, its sub-workings, and its Another way. */
function nodes(w: Working): Working[] {
  const out: Working[] = [w]
  for (const sub of w.subWorkings ?? []) out.push(...nodes(sub))
  if (w.anotherWay) out.push(...nodes(w.anotherWay))
  return out
}

/** The text with its first whole number (not an exponent or inside a name) gone up by one. */
function bumpText(text: string): string | null {
  const m = /(?<![\^A-Za-z\d.])\d+/.exec(text)
  if (!m) return null
  return text.slice(0, m.index) + String(Number(m[0]) + 1) + text.slice(m.index + m[0].length)
}

/** The text with its first + and - swapped. */
function signText(text: string): string | null {
  if (text.includes(' + ')) return text.replace(' + ', ' - ')
  if (text.includes(' - ')) return text.replace(' - ', ' + ')
  return null
}

/** Kinds whose mutant keeps the step's own sentence and rule: the words are the thing under test. */
const KEEPS_WORDS: ReadonlySet<MutationKind> = new Set(['sentence', 'rule', 'noOp', 'check', 'answerValue', 'answerLabel'])

/** Every planted mutant of a working: one wrong thing per mutant. */
export function plantMutants(w: Working): Mutant[] {
  const out: Mutant[] = []
  const count = nodes(w).length
  for (let nodeIndex = 0; nodeIndex < count; nodeIndex++) {
    // The answer of this working, wrong in its value or its label (the review of a982a6a4, MUST 2),
    // and the check line, wrong in its words (the review of 1aa6b998, MUST C).
    if (nodes(w)[nodeIndex].answer !== undefined && nodes(w)[nodeIndex].steps.length > 0) {
      for (const kind of ['answerValue', 'answerLabel', 'check'] as const) {
        const copy = clone(w)
        const node = nodes(copy)[nodeIndex]
        if (kind === 'check') {
          node.check = 'Put x = 9 back: both sides give 9.'
          out.push({ kind, node, working: copy })
          continue
        }
        const answers = Array.isArray(node.answer) ? node.answer : [node.answer as StepAnswer]
        if (kind === 'answerValue') answers[0] = { ...answers[0], tex: `${answers[0].tex}9` }
        else answers[0] = { ...answers[0], label: 'zz' }
        node.answer = Array.isArray(node.answer) ? answers : answers[0]
        out.push({ kind, step: node.steps[node.steps.length - 1], node, working: copy })
      }
    }
    const stepCount = nodes(w)[nodeIndex].steps.length
    for (let stepIndex = 0; stepIndex < stepCount; stepIndex++) {
      const original = nodes(w)[nodeIndex].steps[stepIndex]
      const kinds: MutationKind[] = []
      if (typeof original.after === 'string') kinds.push('bump', 'sign')
      if (typeof original.after === 'string' && /^[a-z]\s*=/.test(original.after)) kinds.push('divideByZero')
      if (original.kind === 'CaseSplitComplete' && original.data && (original.data as { form?: string }).form === 'zero-product') {
        const cases = (original.data as { cases: unknown[] }).cases
        if (cases.length > 1) kinds.push('dropCase')
        kinds.push('wrongCase')
      }
      kinds.push('chainBreak', 'sentence', 'rule')
      if (
        original.kind === 'EquationEquiv' &&
        (original.op?.kind === 'multiply-both' ||
          original.op?.kind === 'divide-both' ||
          original.op?.kind === 'clear-decimals' ||
          original.op?.kind === 'clear-fractions')
      ) {
        kinds.push('scaleZero', 'scaleOther')
      }
      if (original.kind === 'EquationEquiv') kinds.push('noOp', 'mislabel')
      for (const kind of kinds) {
        const copy = clone(w)
        const node = nodes(copy)[nodeIndex]
        const step = node.steps[stepIndex]
        let changed = false
        if (kind === 'bump' && typeof step.after === 'string') {
          const t = bumpText(step.after)
          if (t !== null && t !== step.after) {
            step.after = t
            changed = true
          }
        } else if (kind === 'sign' && typeof step.after === 'string') {
          const t = signText(step.after)
          if (t !== null) {
            step.after = t
            changed = true
          }
        } else if (kind === 'divideByZero' && typeof step.after === 'string') {
          const m = /^([a-z])\s*=\s*(.+)$/.exec(step.after)
          if (m) {
            step.after = `${m[1]} = \\frac{${m[2]}}{0}`
            changed = true
          }
        } else if (kind === 'dropCase') {
          const data = step.data as { cases: unknown[] }
          data.cases = data.cases.slice(1)
          changed = true
        } else if (kind === 'wrongCase') {
          // A case whose right side is 1 instead of 0: the case is a different linear factor.
          const data = step.data as { cases: string[] }
          if (data.cases[0].includes(' = 0')) {
            data.cases[0] = data.cases[0].replace(' = 0', ' = 1')
            changed = true
          }
        } else if (kind === 'chainBreak') {
          // The link into this step no longer matches the step before it (or the input for the first).
          const t = typeof step.before === 'string' ? bumpText(step.before) : null
          if (t !== null && t !== step.before) {
            step.before = t
            changed = true
          }
        } else if (kind === 'scaleZero') {
          step.op = { kind: 'multiply-both', k: '0' }
          changed = true
        } else if (kind === 'scaleOther') {
          const k =
            step.op?.kind === 'multiply-both' ||
            step.op?.kind === 'divide-both' ||
            step.op?.kind === 'clear-decimals' ||
            step.op?.kind === 'clear-fractions'
              ? step.op.k
              : '1'
          step.op = { kind: 'multiply-both', k: k === '2' ? '3' : '2' }
          changed = true
        } else if (kind === 'noOp') {
          delete step.op
          changed = true
        } else if (kind === 'mislabel') {
          // The move named as a swap: a swap is the sides exchanged, which only the true swap checks.
          step.op = { kind: 'swap' }
          changed = true
        } else if (kind === 'sentence') {
          step.sentence = 'Multiply both sides by 7'
          changed = true
        } else if (kind === 'rule') {
          step.rule = 'Multiply both sides'
          changed = true
        }
        if (changed) {
          if (!KEEPS_WORDS.has(kind)) finishStep(step)
          out.push({ kind, step, node, working: copy })
        }
      }
    }
  }
  return out
}

/**
 * The verdicts for one mutant, both judged from the rendering as well as from the validators:
 * - accepted: the validators pass the whole working (must never happen);
 * - hidden: the node holding the broken step renders no moves and reports noWorking, and the whole
 *   working renders no moves either. Its validity is not used for this: only what the bridge shows.
 */
export function judge(m: Mutant): { accepted: boolean; hidden: boolean } {
  const accepted = validateWorking(m.working).valid
  const node = renderWorkingToDoc(m.node)
  const whole = renderWorkingToDoc(m.working)
  // Hidden means: no move, no answer and no check reaches the page, for the broken node and for the whole working.
  const hidden =
    node.noWorking === true &&
    node.moves.length === 0 &&
    node.answers.length === 0 &&
    node.check === undefined &&
    whole.noWorking === true &&
    whole.moves.length === 0 &&
    whole.answers.length === 0 &&
    whole.check === undefined
  return { accepted, hidden }
}

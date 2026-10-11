// The sentence, the rule and the check of every step and working (review of 1aa6b998: gpt MUST B and C).
//
// Part of the PhysLab step engine (S0). The words a student reads are never typed by a method: they are built
// here from the step's typed data (its EquationOp, its cases, its discriminant data, the proved solution set).
// validate.ts requires a step's sentence and rule to equal these, and the page shows the check this module
// builds from the validated answer substituted into the problem as typed.

import type { EquationOp, Step, StepAnswer, Working } from './types'
import { equationSides, normalizeDisplayed, parseExactRat, solutionProofOf, type SetProof } from './check-adapter'
import { MINUS, ratPlain, shiftPlain } from './methods/stepText'
import { evalAt, varsOf } from '../pure/mono'
import { rEq, type Rat } from '../pure/rat'


function dataOf(step: Step): Record<string, unknown> {
  return step.data && typeof step.data === 'object' ? (step.data as Record<string, unknown>) : {}
}

function variableOf(step: Step): string {
  const v = dataOf(step).variable
  return typeof v === 'string' ? v : 'x'
}

/** A state, a term or a number written for the student: the typographic minus, x², fractions as a/b. */
function plainTex(text: string): string {
  return text
    .replace(/\\left|\\right/g, '')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\frac\{(-?\d+)\}\{(\d+)\}/g, '$1/$2')
    .replace(/\^2/g, '²')
    .replace(/ - /g, ` ${MINUS} `)
    .replace(/^-/, MINUS)
    .replace(/\s+/g, ' ')
    .trim()
}

/** A signed whole number for the student: −2, 3. */
function plainNumber(text: string): string {
  return text.replace(/^-/, MINUS)
}

function leftOf(text: string): string {
  const i = text.indexOf('=')
  return (i === -1 ? text : text.slice(0, i)).trim()
}

function rightOf(text: string): string {
  const i = text.indexOf('=')
  return i === -1 ? '' : text.slice(i + 1).trim()
}

function equationSentence(op: EquationOp, step: Step, v: string): string | null {
  const before = String(step.before)
  const after = String(step.after)
  switch (op.kind) {
    case 'add-both':
      return `Add ${plainTex(op.term)} to both sides`
    case 'subtract-both':
      return `Subtract ${plainTex(op.term)} from both sides`
    case 'multiply-both':
      if (op.purpose === 'leading-positive') {
        return `Multiply both sides by ${plainNumber(op.k)} so that the ${v}² term is positive`
      }
      return `Multiply both sides by ${plainNumber(op.k)}`
    case 'divide-both':
      if (op.purpose === 'leading-positive') {
        return `Divide both sides by ${plainNumber(op.k)} so that the ${v}² term is positive`
      }
      if (op.purpose === 'leading-one') return `Divide both sides by ${plainNumber(op.k)} so that the ${v}² term is 1`
      if (op.purpose === 'common-factor') return `Divide every term on both sides by the common factor ${plainNumber(op.k)}`
      return `Divide both sides by ${plainNumber(op.k)}`
    case 'clear-decimals':
      return `Multiply both sides by ${op.k} to clear the decimals`
    case 'clear-fractions':
      return `Multiply both sides by ${op.k} to clear the fractions`
    case 'move-to-left':
      return 'Move every term to the left side'
    case 'expand-sides':
      return 'Expand the brackets on each side'
    case 'remove-brackets':
      return 'Remove the brackets on each side'
    case 'collect-like-terms':
      return 'Collect like terms on each side'
    case 'work-out-right':
      return `Work out the right side: ${plainTex(rightOf(before))} = ${plainTex(rightOf(after))}`
    case 'factorise':
      return `Factorise ${plainTex(leftOf(before))} as ${plainTex(leftOf(after))}`
    case 'complete-square':
      return `Complete the square: ${plainTex(leftOf(before))} can be written as ${plainTex(leftOf(after))}`
    case 'square-root-pm': {
      const s = parseExactRat(op.shift)
      const r = parseExactRat(op.root)
      if (!s || !r) return null
      return `Take the square root of both sides, with ±: ${shiftPlain(v, s)} = ±${ratPlain(r)}`
    }
    case 'swap':
      return 'Swap the two sides'
    case 'already-solved':
      return 'The equation is already solved'
    default:
      return null
  }
}

function equationRule(op: EquationOp): string {
  switch (op.kind) {
    case 'add-both':
      return 'Add to both sides'
    case 'subtract-both':
      return 'Subtract from both sides'
    case 'multiply-both':
      if (op.purpose === 'leading-positive') return 'Make the leading term positive'
      return 'Multiply both sides'
    case 'divide-both':
      if (op.purpose === 'leading-positive') return 'Make the leading term positive'
      if (op.purpose === 'leading-one') return 'Make the leading term 1'
      if (op.purpose === 'common-factor') return 'Divide out the common factor'
      return 'Divide both sides'
    case 'clear-decimals':
      return 'Clear the decimals'
    case 'clear-fractions':
      return 'Clear the fractions'
    case 'move-to-left':
      return 'Move terms to one side'
    case 'expand-sides':
      return 'Expand brackets'
    case 'remove-brackets':
      return 'Remove brackets'
    case 'collect-like-terms':
      return 'Collect like terms'
    case 'work-out-right':
      return 'Work out the right side'
    case 'factorise':
      return 'Factorise'
    case 'complete-square':
      return 'Complete the square'
    case 'square-root-pm':
      return 'Square root with ±'
    case 'swap':
      return 'Swap sides'
    case 'already-solved':
      return 'Already solved'
  }
}

function caseSentence(step: Step): string | null {
  const d = dataOf(step)
  if (!Array.isArray(d.cases) || d.cases.length === 0) return null
  const cases = d.cases.map((c) => String(c))
  if (d.form === 'zero-product') {
    if (cases.length === 1) return `The factor can be 0 only when ${plainTex(cases[0])}.`
    if (cases.length === 2 && cases[0] === cases[1]) {
      return `Both factors are the same, so there is one case: ${plainTex(cases[0])}.`
    }
    return `Each factor can be 0, so either ${cases.map(plainTex).join(' or ')}.`
  }
  return `Split into cases: ${cases.map(plainTex).join('; ')}.`
}

function isZeroProductSquare(step: Step): boolean {
  const cases = dataOf(step).cases
  return Array.isArray(cases) && cases.length === 2 && String(cases[0]) === String(cases[1])
}

/** The proof of the solution set of a SolutionSetEq, read from its displayed before. Null when nothing is proved. */
function setProofOf(step: Step): { proof: SetProof; v: string } | null {
  const v = variableOf(step)
  const proof = solutionProofOf(String(step.before), v)
  return proof ? { proof, v } : null
}

function solutionSentence(step: Step): string | null {
  const p = setProofOf(step)
  if (!p) return null
  if (p.proof.kind === 'all') return 'Both sides are 0 for every value, so every real number is a solution.'
  if (p.proof.kind === 'none') {
    return p.proof.deg === 0
      ? `${plainTex(String(step.before))} is never true, so no value of ${p.v} works.`
      : 'The discriminant is below zero, so there are no real solutions: a real number squared is never negative.'
  }
  return `The solutions are ${plainTex(String(step.after))}.`
}

function solutionRule(step: Step): string | null {
  const p = setProofOf(step)
  if (!p) return null
  if (p.proof.kind === 'all') return 'Every real number is a solution'
  if (p.proof.kind === 'none') return p.proof.deg === 0 ? 'No solution' : 'No real solutions'
  return 'Solutions'
}

function exprSentence(step: Step): string | null {
  const d = dataOf(step)
  if (d.role === 'discriminant') {
    const a = typeof d.a === 'string' ? d.a : ''
    const b = typeof d.b === 'string' ? d.b : ''
    const c = typeof d.c === 'string' ? d.c : ''
    if (!a || !b || !c) return null
    return `With a = ${plainNumber(a)}, b = ${plainNumber(b)} and c = ${plainNumber(c)}, the discriminant b² − 4ac is ${plainNumber(String(step.after))}.`
  }
  return 'Write the expression another way.'
}

function implicationSentence(step: Step): string | null {
  const d = dataOf(step)
  if (d.action === 'quadratic-formula') return 'Put a, b and c into the quadratic formula'
  if (d.action === 'square') return 'Square both sides'
  if (d.action === 'multiply' && typeof d.multiplier === 'string') return `Multiply both sides by ${plainTex(d.multiplier)}`
  return null
}

function implicationRule(step: Step): string | null {
  const action = dataOf(step).action
  if (action === 'quadratic-formula') return 'Quadratic formula'
  if (action === 'square') return 'Squaring'
  if (action === 'multiply') return 'Multiply both sides'
  return null
}

/** The sentence a step must carry, built from its typed data. Null when the data does not determine one. */
export function sentenceFor(step: Step): string | null {
  switch (step.kind) {
    case 'EquationEquiv':
      return step.op ? equationSentence(step.op, step, variableOf(step)) : null
    case 'CaseSplitComplete':
      return caseSentence(step)
    case 'Implication':
      return implicationSentence(step)
    case 'SolutionSetEq':
      return solutionSentence(step)
    case 'SubproblemReduction':
      return 'Put the answers of the cases together.'
    case 'ExprEq':
      return exprSentence(step)
    default:
      return null
  }
}

/** The rule chip a step must carry, built from its typed data. Null when the data does not determine one. */
export function ruleFor(step: Step): string | null {
  switch (step.kind) {
    case 'EquationEquiv':
      return step.op ? equationRule(step.op) : null
    case 'CaseSplitComplete':
      if (dataOf(step).form !== 'zero-product') return 'Cases'
      return isZeroProductSquare(step) ? 'Zero square' : 'Zero product'
    case 'Implication':
      return implicationRule(step)
    case 'SolutionSetEq':
      return solutionRule(step)
    case 'SubproblemReduction':
      return 'Combine the cases'
    case 'ExprEq':
      return dataOf(step).role === 'discriminant' ? 'Discriminant' : 'Same value'
    default:
      return null
  }
}

/**
 * Write a step's sentence and rule from its typed data. Methods build every step this way and never type
 * the words themselves.
 */
export function finishStep(step: Step): Step {
  step.sentence = sentenceFor(step) ?? ''
  step.rule = ruleFor(step) ?? undefined
  return step
}

/** The substitution of a working's answers into its input: the check text, or the reason an answer fails. */
interface Substitution {
  ok: boolean
  text?: string
  reason?: string
}

/**
 * The answers of a working substituted into its problem, exactly. Null when there is nothing to substitute:
 * no answer, no equation, an answer that is not an exact number, or more than one letter in the problem.
 * The check text is built here, never taken from a method.
 */
export function substitutionOf(working: Working): Substitution | null {
  if (typeof working.input !== 'string' || working.answer === undefined) return null
  const answers: StepAnswer[] = Array.isArray(working.answer) ? working.answer : [working.answer]
  if (answers.length === 0) return null
  const sides = equationSides(working.input)
  if (!sides) return null
  const v = answers[0].label
  if (answers.some((a) => a.label !== v)) return null
  if ([sides.L, sides.R].some((e) => varsOf(e).some((name) => name !== v))) return null
  const values: Rat[] = []
  for (const a of answers) {
    const r = parseExactRat(a.value ?? normalizeDisplayed(a.tex))
    if (!r) return null
    values.push(r)
  }
  const sentences: string[] = []
  for (const r of values) {
    const left = evalAt(sides.L, { [v]: r })
    const right = evalAt(sides.R, { [v]: r })
    if (!rEq(left, right)) {
      return {
        ok: false,
        reason: `${v} = ${ratPlain(r)} does not satisfy the problem: the two sides give ${ratPlain(left)} and ${ratPlain(right)}`
      }
    }
    sentences.push(`Put ${v} = ${ratPlain(r)} back: both sides give ${ratPlain(left)}.`)
  }
  return { ok: true, text: sentences.join(' ') }
}

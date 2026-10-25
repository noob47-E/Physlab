// The sentence, the rule and the check of every step and working (review of 1aa6b998: gpt MUST B and C).
//
// Part of the PhysLab step engine (S0). The words a student reads are never typed by a method: they are built
// here from the step's typed data (its EquationOp, its cases, its discriminant data, the proved solution set).
// validate.ts requires a step's sentence and rule to equal these, and the page shows the check this module
// builds from the validated answer substituted into the problem as typed.

import type { EquationOp, ExprOp, Step, StepAnswer, SystemOp, Working } from './types'
import {
  equationSides,
  expandTerms,
  groupSumText,
  isExprOp,
  isSystemOp,
  normalizeDisplayed,
  parseExactRat,
  isFormulaState,
  isSurdText,
  prettyOfAlg,
  productText,
  ratOfText,
  ratText,
  readSurd,
  solutionProofOf,
  solutionTextOf,
  sumText,
  type SetProof
} from './check-adapter'
import { MINUS, ratPlain, shiftPlain } from './methods/stepText'
import { ineqRule, ineqSentence } from './inequality'
import { evalAt, varsOf, type Expr } from '../pure/mono'
import { rEq, rStr, type Rat } from '../pure/rat'
import { logSumOf, ratOf, valueAt } from './expRoots'
import { radicalRootsRule, radicalRootsSentence, radicalSubstitution } from './radicalForm'


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
    .replace(/\^\{\\circ\}|\\circ/g, '°')
    .replace(/\\pi\b/g, 'π')
    .replace(/\\theta\b/g, 'θ')
    .replace(/\\(sin|cos|tan|sec|csc|cot)\b/g, '$1')
    .replace(/\\quad\b/g, ' ')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2')
    .replace(/\\ln\b/g, 'ln')
    .replace(/\^\{(\((-?\d+)\))\}/g, '^$2')
    .replace(/\^\{(-?\d+)\}/g, '^$1')
    .replace(/\^\((-?\d+)\)/g, '^$1')
    .replace(/\^(\d+)/g, (_all: string, ds: string) => [...ds].map((d) => SUPERSCRIPT[d]).join(''))
    .replace(/\^(-\d)/g, (_all: string, d: string) => SUPERSCRIPT[d])
    .replace(/\*/g, '')
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

/** The first trig term an equation's text uses, in words: sin(x), or sin(2x) when its argument is a multiple of x. Null when it writes none. */
function trigTermIn(text: string): string | null {
  const m = /\\?(sin|cos|tan)\s*\(\s*([^()]*?)\s*\)/.exec(text)
  return m ? `${m[1]}(${plainTex(m[2])})` : null
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
      // A surd root is written in its simplest form (S1b); a rational one as before.
      const r = readSurd(op.root)
      if (!s || !r) return null
      return `Take the square root of both sides, with ±: ${shiftPlain(v, s)} = ±${prettyOfAlg(r)}`
    }
    case 'swap':
      return 'Swap the two sides'
    case 'already-solved':
      return 'The equation is already solved'
    case 'divide-cos':
      return `Divide both sides by cos(${plainTex(v)}), noting that cos(${plainTex(v)}) = 0 is not a solution`
    case 'trig-ref-angle':
      return op.angle
        ? `Find reference angle ${plainTex(op.angle)} from the unit circle${op.quad ? ` (${plainTex(op.quad)})` : ''}`
        : 'Find the reference angle from the unit circle'
    case 'trig-general':
      return 'Write the general solution with integer k'
    case 'trig-inverse': {
      // The exact value is written in words as a student reads it: 2/3 and −1/4, with the minus sign as a minus.
      const word = op.fn === 'sin' ? 'sine' : op.fn === 'cos' ? 'cosine' : 'tangent'
      const c = op.c.replace(/\\frac\{(\d+)\}\{(\d+)\}/, '$1/$2').replace(/^-/, '−')
      return `Take the inverse ${word}: ${op.fn}⁻¹(${c}) = ${op.value.replace(/^-/, '−')}${op.unit === 'deg' ? '°' : ''}`
    }
    case 'trig-inverse-general':
      return 'Write the general solution with integer k, from the principal angle'
    case 'trig-substitute':
      return `Substitute u = ${trigTermIn(before) ?? `sin(${plainTex(v)})`} to form a quadratic equation`
    case 'trig-back-substitute': {
      const term = trigTermIn(after) ?? trigTermIn(before) ?? `sin(${plainTex(v)})`
      const base = `Substitute ${term} back for u and solve each equation`
      const rejected = op.rejected ?? []
      if (rejected.length === 0) return base
      // A sine or cosine is never bigger than 1 in size: a root outside -1 to 1 is named and left out, in words.
      const many = rejected.length > 1
      const roots = rejected.map((r) => `u = ${plainTex(r)}`).join(' and ')
      const equations = rejected.map((r) => `${term} = ${plainTex(r)}`).join(' and ')
      return `${base}. ${roots} ${many ? 'are' : 'is'} outside -1 to 1, so ${equations} ${many ? 'have' : 'has'} no solution and ${many ? 'are' : 'is'} left out`
    }
    case 'write-as-power':
      return `Write ${plainTex(rightOf(before))} as ${plainTex(op.base)} to the power ${plainTex(op.power)}`
    case 'cancel-base':
      return `Equal powers of ${plainTex(op.base)} have equal exponents: ${plainTex(after)}`
    case 'log-to-power':
      return `Write the logarithm as a power: ${plainTex(after)}`
    case 'work-out-power':
      return `Work out ${plainTex(rightOf(before))} = ${plainTex(rightOf(after))}`
    case 'exp-to-log':
      return op.base === 'e'
        ? `Take the natural logarithm of both sides: ${plainTex(after)}`
        : `Take logarithms of both sides: ${plainTex(after)}`
    case 'log-to-exp':
      return `Write the natural logarithm as a power of e: ${plainTex(after)}`
    case 'work-out-exp':
      return `Anything to the power 0 is 1: ${plainTex(after)}`
    default:
      return null
  }
}

function equationRule(op: EquationOp): string {
  switch (op.kind) {
    case 'write-as-power':
      return 'Write as a power'
    case 'cancel-base':
      return 'Equal bases'
    case 'log-to-power':
      return 'Logarithm to power'
    case 'work-out-power':
      return 'Work out the power'
    case 'exp-to-log':
      return 'Logarithm of both sides'
    case 'log-to-exp':
      return 'Natural logarithm to power'
    case 'work-out-exp':
      return 'Power of zero'
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
    case 'divide-cos':
      return 'Divide by cosine'
    case 'trig-ref-angle':
      return 'Reference angle'
    case 'trig-general':
      return 'General solution'
    case 'trig-inverse':
      return 'Principal angle'
    case 'trig-inverse-general':
      return 'General solution'
    case 'trig-substitute':
      return 'Substitution'
    case 'trig-back-substitute':
      return 'Back substitution'
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

/**
 * The sentence of a solution set that is surds or complex numbers (S1b): each root in its simplest form, named by the
 * letter. Undefined when the step is not one of those (the rational and the empty sets keep their own sentences).
 */
function surdSolutionsSentence(step: Step): string | null | undefined {
  const d = dataOf(step)
  if (!Array.isArray(d.solutions) || d.solutions.length === 0) return undefined
  const texts = d.solutions.map((s) => solutionTextOf(s))
  const surdy = d.zeroProduct !== undefined || d.domain === 'complex' || texts.some((t) => isSurdText(t))
  if (!surdy) return undefined
  const v = variableOf(step)
  const parts: string[] = []
  for (const t of texts) {
    const x = readSurd(t)
    if (!x) return null
    parts.push(`${v} = ${prettyOfAlg(x)}`)
  }
  return `The solutions are ${parts.join(' or ')}.`
}

function solutionSentence(step: Step): string | null {
  if (dataOf(step).rational === true) return rationalEndingSentence(step)
  if (dataOf(step).logSum === true) return logSumEndingSentence(step)
  // Part R: a radical working's check of its roots says its own words (radicalForm.ts), from the step's data.
  if (dataOf(step).radical === true) return radicalRootsSentence(step)
  const d = dataOf(step)
  if (d.role === 'trig' || d.role === 'trig-inverse' || d.trig !== undefined) {
    return `The solutions are ${plainTex(String(step.after))}.`
  }
  const surd = surdSolutionsSentence(step)
  if (surd !== undefined) return surd
  // The roots after a quadratic formula line: the line's own numbers are the proof, so the sentence names the roots as they stand.
  if (isFormulaState(String(step.before))) return `The solutions are ${plainTex(String(step.after))}.`
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
  if (dataOf(step).rational === true) return rationalEndingRule(step)
  if (dataOf(step).logSum === true) return rationalEndingRule(step)
  if (dataOf(step).radical === true) return radicalRootsRule(step)
  const d = dataOf(step)
  if (d.role === 'trig' || d.role === 'trig-inverse' || d.trig !== undefined) return 'Solutions'
  if (surdSolutionsSentence(step) !== undefined) return 'Solutions'
  if (isFormulaState(String(step.before))) return 'Solutions'
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

/** "2", "2 or 3", "1, 2 or 3": a list of values in words. */
function listOr(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`
}

/** "x = 1", "x = 1 and x = 3": a list of statements in words. */
function listAnd(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** "x cannot be 0 or 1, because a denominator would be 0.": the values the letter may not take, read from the denominators. */
function excludedSentence(d: Record<string, unknown>): string | null {
  if (!Array.isArray(d.excluded) || d.excluded.length === 0) return null
  const v = typeof d.variable === 'string' ? d.variable : 'x'
  return `${v} cannot be ${listOr(d.excluded.map((t) => plainNumber(String(t))))}, because a denominator would be 0.`
}

function implicationSentence(step: Step): string | null {
  const d = dataOf(step)
  if (d.action === 'quadratic-formula') return 'Put a, b and c into the quadratic formula'
  if (d.action === 'square') return 'Square both sides'
  if (d.action === 'multiply' && typeof d.multiplier === 'string') return `Multiply both sides by ${plainTex(d.multiplier)}`
  if (d.action === 'exclude') return excludedSentence(d)
  if (d.action === 'log-domain') return logDomainSentence(d)
  if (d.action === 'join-logs') return `Add the two logarithms into one: ${plainTex(String(step.after))}`
  return null
}

/** The domain of a logarithm sum, named in words: each logarithm needs its number above 0. */
function logDomainSentence(d: Record<string, unknown>): string | null {
  if (!Array.isArray(d.args) || d.args.length === 0) return null
  return `A logarithm needs a number above 0: ${d.args.map((a) => `${plainTex(String(a))} > 0`).join(' and ')}`
}

function implicationRule(step: Step): string | null {
  const action = dataOf(step).action
  if (action === 'quadratic-formula') return 'Quadratic formula'
  if (action === 'square') return 'Squaring'
  if (action === 'multiply') return 'Multiply both sides'
  if (action === 'exclude') return 'Excluded values'
  if (action === 'log-domain') return 'Domain of the logarithms'
  if (action === 'join-logs') return 'Sum of logarithms'
  return null
}

/**
 * The words of a rational equation's ending (rational.ts): the values a denominator rules out, named in words, then the
 * solutions, or that no value works. Null when a kept value cannot be read exactly.
 */
function rationalEndingSentence(step: Step): string | null {
  const d = dataOf(step)
  const v = variableOf(step)
  const kept = Array.isArray(d.solutions) ? d.solutions.map((s) => solutionTextOf(s)) : []
  const rejected = Array.isArray(d.rejected) ? d.rejected.map((r) => `${v} = ${plainNumber(String(r))}`) : []
  const one = rejected.length === 1
  const ruled = `${listAnd(rejected)} ${one ? 'makes' : 'make'} a denominator 0`
  if (kept.length === 0) {
    return rejected.length === 0 ? `No value of ${v} works.` : `${ruled}, so no value of ${v} works.`
  }
  const parts: string[] = []
  for (const t of kept) {
    const x = readSurd(t)
    if (!x) return null
    parts.push(`${v} = ${prettyOfAlg(x)}`)
  }
  const solutions = `The solutions are ${listOr(parts)}.`
  return rejected.length === 0 ? solutions : `${ruled}, so ${one ? 'it is' : 'they are'} not ${one ? 'a solution' : 'solutions'}. ${solutions}`
}

/**
 * The words of a logarithm sum's ending (logSum.ts): each rejected value is named with the logarithm that fails, then the
 * solutions, or that no value works. Null when the typed equation or a kept value cannot be read.
 */
function logSumEndingSentence(step: Step): string | null {
  const d = dataOf(step)
  const v = variableOf(step)
  const sum = typeof d.original === 'string' ? logSumOf(d.original) : null
  if (sum === null || !Array.isArray(d.solutions) || !Array.isArray(d.rejected)) return null
  const rejected: string[] = []
  for (const r of d.rejected) {
    const value = ratOf(String(r))
    if (value === null) return null
    const failing = sum.args.find((arg) => {
      const x = valueAt(arg, v, value)
      return x !== null && x.n <= 0n
    })
    if (failing === undefined) return null
    const at = valueAt(failing, v, value)
    if (at === null) return null
    rejected.push(`${v} = ${plainNumber(String(r))} is rejected: log(${plainTex(failing)}) would be log(${plainNumber(rStr(at))}), and a logarithm needs a positive number.`)
  }
  const kept = d.solutions.map((s) => solutionTextOf(s))
  if (kept.length === 0) return rejected.length === 0 ? `No value of ${v} works.` : `${rejected.join(' ')} So no value of ${v} works.`
  const parts: string[] = []
  for (const t of kept) {
    const x = readSurd(t)
    if (!x) return null
    parts.push(`${v} = ${prettyOfAlg(x)}`)
  }
  const solutions = kept.length === 1 ? `The solution is ${parts[0]}.` : `The solutions are ${listOr(parts)}.`
  return rejected.length === 0 ? solutions : `${rejected.join(' ')} ${solutions}`
}

function rationalEndingRule(step: Step): string {
  const solutions = dataOf(step).solutions
  return Array.isArray(solutions) && solutions.length > 0 ? 'Solutions' : 'No solution'
}

/** The sentence a step must carry, built from its typed data. Null when the data does not determine one. */
export function sentenceFor(step: Step): string | null {
  switch (step.kind) {
    case 'EquationEquiv':
      return step.op && !isExprOp(step.op) && !isSystemOp(step.op) ? equationSentence(step.op, step, variableOf(step)) : null
    case 'CaseSplitComplete':
      return caseSentence(step)
    case 'Implication':
      return implicationSentence(step)
    case 'SolutionSetEq':
      return solutionSentence(step)
    case 'SubproblemReduction':
      return 'Put the answers of the cases together.'
    case 'ExprEq':
      return step.op && isExprOp(step.op) ? productSentence(step, step.op) : exprSentence(step)
    case 'SystemEq':
      return systemSentence(step)
    case 'IneqMove':
    case 'IneqCritical':
    case 'IneqSigns':
    case 'IneqSolutionSet':
      return ineqSentence(step)
    default:
      return null
  }
}

/** The rule chip a step must carry, built from its typed data. Null when the data does not determine one. */
export function ruleFor(step: Step): string | null {
  switch (step.kind) {
    case 'EquationEquiv':
      return step.op && !isExprOp(step.op) && !isSystemOp(step.op) ? equationRule(step.op) : null
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
      if (step.op && isExprOp(step.op)) return productRule(step.op)
      return dataOf(step).role === 'discriminant' ? 'Discriminant' : 'Same value'
    case 'SystemEq':
      return systemRule(step)
    case 'IneqMove':
    case 'IneqCritical':
    case 'IneqSigns':
    case 'IneqSolutionSet':
      return ineqRule(step)
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

  // Part R: an equation with a square root is put back into the typed equation by radicalForm.ts (exact, root by root).
  const radical = radicalSubstitution(working.input, answers)
  if (radical !== null) return radical

  // Check if this is a system (multiple equations separated by comma)
  if (working.input.includes(',')) {
    return systemSubstitutionOf(working, answers)
  }

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

/** Helper: check a system of equations by substituting the answers. */
function systemSubstitutionOf(working: Working, answers: StepAnswer[]): Substitution | null {
  if (typeof working.input !== 'string') return null

  // Split system into individual equations
  const equations = working.input.split(',').map((e) => e.trim())
  if (equations.length < 2) return null

  // Try to parse all equations
  const eqSides: Array<{ L: Expr; R: Expr } | null> = []
  for (const eq of equations) {
    const sides = equationSides(eq)
    eqSides.push(sides)
  }
  if (eqSides.some((s) => !s)) return null

  // Build substitution check text
  const answerMap: Record<string, Rat> = {}
  for (const a of answers) {
    const r = parseExactRat(a.value ?? normalizeDisplayed(a.tex))
    if (!r) return null
    answerMap[a.label] = r
  }

  // Check each equation with all variables substituted
  for (const sides of eqSides) {
    if (!sides) return null
    const left = evalAt(sides.L, answerMap)
    const right = evalAt(sides.R, answerMap)
    if (!rEq(left, right)) {
      return {
        ok: false,
        reason: `The answers do not satisfy all equations`
      }
    }
  }

  // Build the check text showing all substitutions
  const parts: string[] = []
  parts.push(`Put ${answers.map((a) => `${a.label} = ${ratPlain(answerMap[a.label])}`).join(', ')} back`)
  parts.push('both equations hold')
  return { ok: true, text: `${parts.join(': ')}.` }
}

// ---- S1c: the sentences and rules of the product steps (expanding and factorising) ----

/** The superscript digits: x², x³. */
const SUPERSCRIPT: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }

/** The factor lists of a product step, and the variable (read from the typed data). */
function productParts(step: Step): { target: string[]; repl: string[]; v: string } | null {
  const d = dataOf(step)
  const B = d.factorsBefore
  const A = d.factorsAfter
  if (!Array.isArray(B) || !Array.isArray(A) || typeof d.index !== 'number' || typeof d.width !== 'number') return null
  const replLen = A.length - B.length + d.width
  const target = B.slice(d.index, d.index + d.width).map((f) => String(f))
  const repl = A.slice(d.index, d.index + replLen).map((f) => String(f))
  return { target, repl, v: variableOf(step) }
}

/** A letter, a number or a bracket as it stands; any other term in brackets. */
function wrapTerm(t: string): string {
  return /^[A-Za-z]$/.test(t) || /^\d+$/.test(t) ? t : `(${t})`
}

/** A signed number as a student reads it: −3 for -3. */
function signedPlain(text: string): string {
  return text.replace(/^-/, MINUS)
}

/** The words for one product step, from its op and its typed factor lists. */
function productSentence(step: Step, op: ExprOp): string | null {
  const p = productParts(step)
  if (!p) return null
  const { target, repl, v } = p
  switch (op.kind) {
    case 'expand-factors':
      return `Multiply out ${plainTex(productText(target))}, term by term`
    case 'collect-factor':
      return 'Collect like terms and put the terms in order'
    case 'take-out-hcf':
      return `Take out the highest common factor ${plainTex(repl[0])}`
    case 'difference-of-squares':
      return `Use the difference of two squares: ${plainTex(wrapTerm(op.a))}² − ${plainTex(wrapTerm(op.b))}² = (${plainTex(op.a)} − ${plainTex(op.b)})(${plainTex(op.a)} + ${plainTex(op.b)})`
    case 'perfect-square':
      return `Recognise a perfect square: (${plainTex(op.a)} ${op.sign === '-' ? MINUS : '+'} ${plainTex(op.b)})²`
    case 'split-middle':
      return `Split the middle term into ${signedPlain(op.p)}${v} and ${signedPlain(op.q)}${v}`
    case 'group-pairs':
      return `Group the terms in pairs: ${plainTex(groupSumText(op.m1, op.common, op.m2, op.sign))}`
    case 'common-binomial':
      return `Take out the common binomial factor ${plainTex(op.common)}`
    case 'cube-factor': {
      const sumSign = op.sign === '-' ? MINUS : '+'
      const midSign = op.sign === '-' ? '+' : MINUS
      const kind = op.sign === '-' ? 'difference' : 'sum'
      // The middle term is the product a·b as one term (2x and 3 give 6x), never the two factors written side by side.
      const ab = plainTex(sumText(expandTerms(`(${op.a})(${op.b})`) ?? []) || `${op.a}·${op.b}`)
      return `Use the ${kind} of two cubes: ${plainTex(wrapTerm(op.a))}³ ${sumSign} ${plainTex(wrapTerm(op.b))}³ = (${plainTex(op.a)} ${sumSign} ${plainTex(op.b)})(${plainTex(wrapTerm(op.a))}² ${midSign} ${ab} + ${plainTex(wrapTerm(op.b))}²)`
    }
    case 'linear-factor':
      return `${v} = ${signedPlain(op.root)} is a root, so ${plainTex(repl[0])} is a factor`
    case 'irreducible':
      return `${plainTex(target[0])} cannot be factorised using rational numbers`
    default:
      return null
  }
}

/** The rule chip of one product step. */
function productRule(op: ExprOp): string {
  switch (op.kind) {
    case 'expand-factors':
      return 'Multiply out'
    case 'collect-factor':
      return 'Collect like terms'
    case 'take-out-hcf':
      return 'Common factor'
    case 'difference-of-squares':
      return 'Difference of two squares'
    case 'perfect-square':
      return 'Perfect square'
    case 'split-middle':
      return 'Split the middle term'
    case 'group-pairs':
      return 'Grouping'
    case 'common-binomial':
      return 'Common binomial factor'
    case 'cube-factor':
      return 'Sum or difference of cubes'
    case 'linear-factor':
      return 'Factor theorem'
    case 'irreducible':
      return 'Cannot be factorised'
  }
}

// ---- S1d: the sentences and rules of the system steps (simultaneous linear equations) ----

/** How many letters a system has, from the step's typed data (its letter list). */
function systemLetterCount(step: Step): number {
  const vars = (step.data as { vars?: unknown } | undefined)?.vars
  return Array.isArray(vars) ? vars.length : 0
}

/** The word for the solutions of a system in n letters: a pair for two, a triple for three. */
function solutionWord(n: number): string {
  return n === 2 ? 'pair' : n === 3 ? 'triple' : 'set'
}

/**
 * The words of an ending, the same wherever they are shown: none ("the equations have no common solution"), or every
 * solution on the line (or lines) given. Null for an op that is not an ending.
 */
export function systemEndingAnswer(op: SystemOp, nVars: number): string | null {
  if (op.kind === 'no-common-solution') return 'the equations have no common solution'
  if (op.kind === 'infinitely-many') {
    // One equation in two letters is a line; in three letters it is a plane (P-FIX-S1SOUND2 MUST 11). Other counts have
    // no word for their solution set, so no ending is given.
    const shape = nVars === 2 ? 'line' : nVars === 3 ? 'plane' : null
    if (shape === null) return null
    const clause = op.texts.length === 1 ? `on the ${shape} ${op.texts[0]}` : `that satisfies ${op.texts.join(' and ')}`
    return `every ${solutionWord(nVars)} of values ${clause} works`
  }
  return null
}

/** A rational of a scale step, as the sentence says it: "by 3", "by 2/3", "by -1". */
function scaleByText(k: Rat): string {
  return ratText(k).replace(/^-/, MINUS)
}

/** True when a scale step divides (k is 1/d or −1/d, d above one). */
function isDivideStep(k: Rat): boolean {
  return k.d !== 1n && (k.n === 1n || k.n === -1n)
}

function systemSentence(step: Step): string | null {
  const op = step.op
  if (!isSystemOp(op)) return null
  const eqn = (i: number): string => String(i + 1)
  const n = systemLetterCount(step)
  switch (op.kind) {
    case 'scale-equation': {
      const k = ratOfText(op.k)
      if (!k) return null
      if (k.d !== 1n && k.n === 1n) return `Divide equation ${eqn(op.i)} by ${k.d}`
      if (k.d !== 1n && k.n === -1n) return `Divide equation ${eqn(op.i)} by -${k.d}`
      return `Multiply equation ${eqn(op.i)} by ${scaleByText(k)}`
    }
    case 'add-equations':
      return `Add equation ${eqn(op.j)} to equation ${eqn(op.i)}`
    case 'subtract-equations':
      return `Subtract equation ${eqn(op.j)} from equation ${eqn(op.i)}`
    case 'make-subject':
      return `Make ${op.v} the subject of equation ${eqn(op.i)}`
    case 'substitute':
    case 'back-substitute':
      return `Put ${op.v} = ${op.expr} from equation ${eqn(op.i)} into equation ${eqn(op.j)}`
    case 'no-common-solution': {
      const answer = systemEndingAnswer(op, n)
      return answer === null ? null : `Equation ${eqn(op.i)} reads ${op.row}, which cannot be true, so ${answer}.`
    }
    case 'infinitely-many': {
      const answer = systemEndingAnswer(op, n)
      return answer === null ? null : `${answer.charAt(0).toUpperCase()}${answer.slice(1)}, so the equations have infinitely many solutions.`
    }
    default:
      return null
  }
}

function systemRule(step: Step): string | null {
  const op = step.op
  if (!isSystemOp(op)) return null
  switch (op.kind) {
    case 'scale-equation': {
      const k = ratOfText(op.k)
      if (!k) return null
      return isDivideStep(k) ? 'Divide both sides' : 'Multiply both sides'
    }
    case 'add-equations':
      return 'Add the equations'
    case 'subtract-equations':
      return 'Subtract the equations'
    case 'make-subject':
      return 'Make the subject'
    case 'substitute':
    case 'back-substitute':
      return 'Substitute'
    case 'no-common-solution':
      return 'Contradiction'
    case 'infinitely-many':
      return 'Infinitely many solutions'
    default:
      return null
  }
}

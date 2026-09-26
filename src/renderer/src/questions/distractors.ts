// Choice parts and their generated distractors — the wrong options offered beside the right one,
// each standing for a known misconception rather than a random number. Headless: no React, no
// store, no DOM.

import { inDegrees, math, preprocess } from '../math/expr'
import type { Check } from '../math/checkAnswer'
import { rngFor } from '../math/problems'
import type { PQPart, DistractorRule } from './pqjson'
import { evaluateInVariables, WRONG_MESSAGE } from './parts'
import { formatQuantity, type Precision } from './units'

type ChoicePart = Extract<PQPart, { type: 'choice' }>

export interface Choice {
  text: string
  correct: boolean
  why?: string
}

/** The misconception a rule stands for, spoken in words for the box under a wrong pick. */
const RULE_WHY: Record<DistractorRule, string> = {
  sign: 'Right size, wrong sign. Check the direction you took as positive.',
  reciprocal: 'That is one over the answer — check which quantity the question actually asks for.',
  'slope-for-value': 'That is the slope of the graph, not the value asked for.',
  'value-for-slope': 'That is the height of the graph, not its slope.',
  'area-for-value': 'That is the area under the graph, not the value asked for.',
  'ignore-initial': 'That drops the starting value the question gave you — check the initial condition.',
  'g-10': 'You used g = 10; this question uses a different value of g.',
  'half-double': 'Check for a missing or extra factor of two — a lost half, maybe.',
  'power-of-ten': 'Right digits, wrong power of ten. Check the decimal point.',
  'z-sign': 'That reads the table at +z. For a negative z, use the symmetry of the curve: Φ(−z) = 1 − Φ(z).',
  'z-one-minus': 'That is the area on the other side. The table gives the area to the left of z; the area to the right is 1 minus it.',
  'z-no-standardise': 'That looks x up in the table as if it were z. Change x into z first: z = (x − μ)/σ.',
  'z-variance-for-sd': 'That divides by the variance. N(μ, σ²) gives σ², so divide by its square root σ.'
}

/** Re-evaluates `expr` with a modified scope, or null when it does not come out to a finite number. */
function recompute(expr: string, values: Record<string, number>): number | null {
  try {
    const v = Number(inDegrees(() => math.evaluate(preprocess(expr), { ...values })))
    return Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

/**
 * The wrong values one rule can produce for this variant, in the order to try them, or none when
 * the rule does not apply here (no `g` in the question's variables for `g-10`, say) — that rule
 * is then skipped. A factor rule offers both directions (a lost half and a doubled one) so a
 * duplicate of the first still leaves the rule its other candidate.
 */
function ruleValues(rule: DistractorRule, expr: string, values: Record<string, number>, correct: number): (number | null)[] {
  switch (rule) {
    case 'sign':
      return [-correct]
    case 'reciprocal':
      return [correct === 0 ? null : 1 / correct]
    case 'slope-for-value':
      return [typeof values.slope === 'number' ? values.slope : null]
    case 'value-for-slope':
      return [typeof values.value === 'number' ? values.value : null]
    case 'area-for-value':
      return [typeof values.area === 'number' ? values.area : null]
    case 'ignore-initial': {
      const key = 'v0' in values ? 'v0' : 'x0' in values ? 'x0' : null
      return [key === null ? null : recompute(expr, { ...values, [key]: 0 })]
    }
    case 'g-10':
      return ['g' in values ? recompute(expr, { ...values, g: 10 }) : null]
    case 'half-double':
      return [correct * 2, correct / 2]
    case 'power-of-ten':
      return [correct * 10, correct / 10]
    // The four rules below stand for the normal-distribution table-reading slips
    // (math/pure/zscoreDistractors.ts has the full set, used for the standard-normal Working
    // panel); here they generalise the same slip to whatever expr/values a normal-distribution
    // choice part is authored with, re-evaluating the part's own expression with one variable
    // changed the wrong way, exactly as every other rule in this switch does.
    case 'z-sign':
      return ['z' in values ? recompute(expr, { ...values, z: -values.z }) : 'x' in values && 'mean' in values ? recompute(expr, { ...values, x: 2 * values.mean - values.x }) : null]
    case 'z-one-minus':
      return correct >= 0 && correct <= 1 ? [1 - correct] : [null]
    case 'z-no-standardise':
      return 'mean' in values && 'sd' in values ? [recompute(expr, { ...values, mean: 0, sd: 1 })] : [null]
    case 'z-variance-for-sd':
      return 'sd' in values ? [recompute(expr, { ...values, sd: values.sd * values.sd })] : [null]
  }
}

/** A stable seed from the drawn values, so the same variant always shuffles its choices the same way. */
function seedFromValues(values: Record<string, number>): number {
  let s = 0
  for (const k of Object.keys(values).sort()) s = (Math.imul(s, 31) + Math.floor(values[k] * 1000)) >>> 0
  return s || 1
}

function shuffled<T>(items: T[], seed: number): T[] {
  const r = rngFor(seed)
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * The choices a choice part shows for one variant: the listed choices as written when the part
 * has no `distractors` rule set, or the correct value followed by one distractor per rule when it
 * does. Every generated distractor is checked distinct from the answer and from every distractor
 * already accepted, beyond 2% and as the text the student will read — a rule that would repeat a
 * value already offered, or print the same digits at the student's precision, is skipped rather
 * than shown twice.
 */
export function generateChoices(part: ChoicePart, values: Record<string, number>, settings: Precision): Choice[] {
  if (!part.distractors) {
    const choices = part.choices.map((c) => ({ text: c.text, correct: c.correct, why: c.why }))
    return part.shuffle ? shuffled(choices, seedFromValues(values)) : choices
  }

  const { correct: expr, unit, rules } = part.distractors
  const correctValue = evaluateInVariables(expr, values)
  const accepted = [correctValue]
  const out: Choice[] = [{ text: formatQuantity(correctValue, unit, settings), correct: true }]
  const distinctTol = Math.max(Math.abs(correctValue), 1e-9) * 0.02

  for (const rule of rules) {
    for (const value of ruleValues(rule, expr, values, correctValue)) {
      if (value === null || !Number.isFinite(value)) continue
      if (accepted.some((a) => Math.abs(a - value) <= distinctTol)) continue
      // Distinct numbers can still round to one text (0.006 m and 0.012 m are both "0.01 m" at
      // 2 dp), and two identical options, one right and one wrong, is not a question.
      const text = formatQuantity(value, unit, settings)
      if (out.some((c) => c.text === text)) continue
      accepted.push(value)
      out.push({ text, correct: false, why: RULE_WHY[rule] })
      break
    }
  }

  return part.shuffle ? shuffled(out, seedFromValues(values)) : out
}

/** Marks a choice part: right when the picked set equals the correct set, else wrong with the first picked choice's `why`. */
export function checkChoicePart(picked: number[], choices: Choice[]): Check {
  if (picked.length === 0) return { verdict: 'empty' }
  const correctIndices = new Set(choices.map((c, i) => (c.correct ? i : -1)).filter((i) => i >= 0))
  const pickedIndices = new Set(picked)
  const same = correctIndices.size === pickedIndices.size && [...correctIndices].every((i) => pickedIndices.has(i))
  if (same) return { verdict: 'right' }
  const firstWrong = picked.find((i) => !choices[i]?.correct)
  const why = firstWrong !== undefined ? choices[firstWrong]?.why : undefined
  return { verdict: 'wrong', message: why ?? WRONG_MESSAGE }
}

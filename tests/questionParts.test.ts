// Marking a question's parts: number parts (through `checkAnswer`, unchanged, plus units),
// expression parts (exact algebra, then numeric sampling) and choice parts with generated
// distractors that stand for named misconceptions.

import { describe, expect, it } from 'vitest'
import { checkExpressionPart, checkNumberPart } from '../src/renderer/src/questions/parts'
import { checkChoicePart, generateChoices } from '../src/renderer/src/questions/distractors'
import { UNIT_IDS, type PQPart } from '../src/renderer/src/questions/pqjson'
import { UNITS } from '../src/renderer/src/questions/units'
import { toRad } from '../src/renderer/src/math/vec'

const PRECISION = { decimals: 4, precisionMode: 'dp' as const }

type NumberPart = Extract<PQPart, { type: 'number' }>
type ExpressionPart = Extract<PQPart, { type: 'expression' }>
type ChoicePart = Extract<PQPart, { type: 'choice' }>

function numberPart(over: Partial<NumberPart> = {}): NumberPart {
  return {
    type: 'number',
    prompt: 'How fast?',
    answer: '50',
    unit: 'none',
    tolerance: { kind: 'relative', value: 0.02 },
    marks: 1,
    ...over
  }
}

function expressionPart(over: Partial<ExpressionPart> = {}): ExpressionPart {
  return { type: 'expression', prompt: 'Simplify.', answer: 'x^2-1', symbols: ['x'], marks: 1, ...over }
}

// ---------------------------------------------------------------------------
// checkNumberPart
// ---------------------------------------------------------------------------

describe('checkNumberPart — tolerance', () => {
  it('accepts the boundary of a 2% relative tolerance and rejects just outside it', () => {
    const p = numberPart({ answer: '50', tolerance: { kind: 'relative', value: 0.02 } })
    expect(checkNumberPart('49', p, {}, PRECISION).verdict).toBe('right')
    expect(checkNumberPart('51', p, {}, PRECISION).verdict).toBe('right')
    // Inherited from checkAnswer: within four tolerances is "close", and `isCorrect` there counts
    // close as accepted. Whether a close number part earns its marks is the player's call (WAVE 3).
    expect(checkNumberPart('48.99', p, {}, PRECISION).verdict).toBe('close')
    expect(checkNumberPart('45', p, {}, PRECISION).verdict).toBe('wrong')
  })

  it('uses an absolute tolerance in the part\'s unit when asked for one', () => {
    const p = numberPart({ answer: '10', unit: 'm', tolerance: { kind: 'absolute', value: 0.5 } })
    expect(checkNumberPart('10.5', p, {}, PRECISION).verdict).toBe('right')
    expect(checkNumberPart('9.5', p, {}, PRECISION).verdict).toBe('right')
    expect(checkNumberPart('11', p, {}, PRECISION).verdict).not.toBe('right')
  })
})

describe('checkNumberPart — units', () => {
  it('converts a unit the student typed to the part\'s unit before marking', () => {
    const p = numberPart({ answer: '10', unit: 'm/s', tolerance: { kind: 'relative', value: 0.02 } })
    expect(checkNumberPart('36 km/h', p, {}, PRECISION).verdict).toBe('right')
    expect(checkNumberPart('10 m/s', p, {}, PRECISION).verdict).toBe('right')
  })

  it('reads the part\'s own unit typed after the number, for every unit PhysLab knows', () => {
    // checkAnswer's own UNIT_TAIL knows only a dozen labels; "50 km/h" for a km/h box used to
    // reach it whole and come back "unreadable" although number and unit were both right.
    for (const u of UNIT_IDS) {
      if (u === 'none') continue
      const p = numberPart({ answer: '50', unit: u, tolerance: { kind: 'relative', value: 0.02 } })
      expect(checkNumberPart(`50 ${UNITS[u].label}`, p, {}, PRECISION).verdict, u).toBe('right')
    }
  })

  it('refuses a different dimension outright, naming both units in words', () => {
    const p = numberPart({ answer: '20', unit: 'N', tolerance: { kind: 'relative', value: 0.02 } })
    const c = checkNumberPart('20 kg', p, {}, PRECISION)
    expect(c.verdict).toBe('wrong')
    expect(c.message).toBe('That is in kilograms; this box wants newtons.')
  })
})

describe('checkNumberPart — reuses checkAnswer\'s own diagnoses', () => {
  it('recognises a direction answer given in radians', () => {
    const p = numberPart({ answer: '36.87', unit: '°', kind: 'direction', tolerance: { kind: 'absolute', value: 0.5 } })
    const c = checkNumberPart(String(toRad(36.87)), p, {}, PRECISION)
    expect(c.verdict).toBe('wrong')
    expect(c.message).toMatch(/radians/i)
  })

  it('recognises the right reference angle in the wrong quadrant', () => {
    const p = numberPart({ answer: '36.87', unit: '°', kind: 'direction', tolerance: { kind: 'absolute', value: 0.5 } })
    const c = checkNumberPart(String(180 - 36.87), p, {}, PRECISION)
    expect(c.verdict).toBe('wrong')
    expect(c.message).toMatch(/quadrant/i)
  })
})

// ---------------------------------------------------------------------------
// checkExpressionPart
// ---------------------------------------------------------------------------

describe('checkExpressionPart', () => {
  it('accepts a polynomial identity by algebra: x²−1 ≡ (x−1)(x+1)', () => {
    const p = expressionPart({ answer: 'x^2-1', symbols: ['x'] })
    expect(checkExpressionPart('(x-1)*(x+1)', p, {}).verdict).toBe('right')
  })

  it('accepts a trig identity by numeric sampling: sin²x+cos²x ≡ 1', () => {
    const p = expressionPart({ answer: '1', symbols: ['x'] })
    expect(checkExpressionPart('sin(x)^2+cos(x)^2', p, {}).verdict).toBe('right')
  })

  it('rejects a near-miss that is not the same expression: 2x ≢ 2x+1', () => {
    const p = expressionPart({ answer: '2*x', symbols: ['x'] })
    expect(checkExpressionPart('2*x+1', p, {}).verdict).toBe('wrong')
  })

  it('checks a physics-sized constant relatively, so a factor of two off is wrong however small the answer', () => {
    // max(1, |a|) as the denominator made the check absolute below 1: 2e-7·x passed for 1e-7·x.
    const p = expressionPart({ answer: '1e-7*x', symbols: ['x'] })
    expect(checkExpressionPart('2e-7*x', p, {}).verdict).toBe('wrong')
    expect(checkExpressionPart('1e-7*x', p, {}).verdict).toBe('right')
    const q = expressionPart({ answer: 'e*E', symbols: ['E'] })
    expect(checkExpressionPart('2*e*E', q, { e: 1.6e-19 }).verdict).toBe('wrong')
    expect(checkExpressionPart('1.6e-19*E', q, { e: 1.6e-19 }).verdict).toBe('right')
  })

  it('still accepts an identity whose two sides cancel to floating noise around zero', () => {
    const p = expressionPart({ answer: '0', symbols: ['x'] })
    expect(checkExpressionPart('sin(x)^2+cos(x)^2-1', p, {}).verdict).toBe('right')
    expect(checkExpressionPart('sin(x)^2+cos(x)^2', p, {}).verdict).toBe('wrong')
  })

  it('rejects a symbol the part does not allow', () => {
    const p = expressionPart({ answer: '2*x', symbols: ['x'] })
    const c = checkExpressionPart('2*t', p, {})
    expect(c.verdict).toBe('wrong')
    expect(c.message).toBe('The answer should only use x.')
  })

  it('substitutes the question\'s own variables before comparing', () => {
    const p = expressionPart({ answer: 'm*x', symbols: ['x'] })
    expect(checkExpressionPart('3*x', p, { m: 3 }).verdict).toBe('right')
    expect(checkExpressionPart('4*x', p, { m: 3 }).verdict).toBe('wrong')
  })
})

// ---------------------------------------------------------------------------
// generateChoices / checkChoicePart
// ---------------------------------------------------------------------------

function choicePart(over: Partial<ChoicePart> = {}): ChoicePart {
  return { type: 'choice', prompt: 'Pick the speed.', choices: [], shuffle: false, marks: 1, ...over }
}

describe('generateChoices', () => {
  it('generates one distinct, wrong distractor per rule, each marked wrong under checkNumberPart', () => {
    const part = choicePart({
      distractors: { correct: 'v0', unit: 'm/s', rules: ['sign', 'reciprocal', 'half-double', 'power-of-ten'] }
    })
    const values = { v0: 10 }
    const choices = generateChoices(part, values, PRECISION)

    expect(choices[0].correct).toBe(true)
    expect(choices.filter((c) => c.correct)).toHaveLength(1)
    expect(choices.length).toBeGreaterThan(1)

    const texts = choices.map((c) => c.text)
    expect(new Set(texts).size).toBe(texts.length)

    const answerPart = numberPart({ answer: 'v0', unit: 'm/s', tolerance: { kind: 'relative', value: 0.02 } })
    for (const c of choices.filter((c) => !c.correct)) {
      expect(c.why).toBeTruthy()
      // Strip the unit label back off so checkNumberPart marks the bare number.
      const numeric = c.text.replace(/\s*m\/s$/, '')
      expect(checkNumberPart(numeric, answerPart, values, PRECISION).verdict).not.toBe('right')
    }
  })

  it('skips a rule that has nothing to work with (no g in the variables) or would repeat a value', () => {
    const part = choicePart({ distractors: { correct: 'v0', unit: 'm/s', rules: ['g-10', 'sign', 'sign'] } })
    const choices = generateChoices(part, { v0: 10 }, PRECISION)
    // g-10 is skipped (no g), the second 'sign' is skipped (a duplicate of the first) — one distractor only.
    expect(choices).toHaveLength(2)
  })

  it('never offers two choices with the same text at the student\'s precision', () => {
    const coarse = { decimals: 2, precisionMode: 'dp' as const }
    // 0.0012 m and its half-double 0.0024 m both printed as "0 m" at 2 dp; 0.006 m and 0.012 m
    // both round to "0.01 m" — the value-level check saw them apart, the student would not have.
    for (const v0 of [0.0012, 0.006]) {
      const part = choicePart({ distractors: { correct: 'v0', unit: 'm', rules: ['half-double', 'power-of-ten', 'sign'] } })
      const choices = generateChoices(part, { v0 }, coarse)
      const texts = choices.map((c) => c.text)
      expect(new Set(texts).size, texts.join(' | ')).toBe(texts.length)
      expect(texts).not.toContain('0 m')
    }
  })

  it('tries the other direction of a factor rule when the first repeats a value already offered', () => {
    // A factor rule used to offer ×2 (or ×10) only, so a clash skipped the rule outright; now
    // the lost-half direction is offered instead. Listing the rule twice forces the clash.
    const twice = choicePart({ distractors: { correct: 'v0', unit: 'none', rules: ['half-double', 'half-double'] } })
    expect(generateChoices(twice, { v0: 2 }, PRECISION).map((c) => c.text)).toEqual(['2', '4', '1'])
    const tens = choicePart({ distractors: { correct: 'v0', unit: 'none', rules: ['power-of-ten', 'power-of-ten'] } })
    expect(generateChoices(tens, { v0: 2 }, PRECISION).map((c) => c.text)).toEqual(['2', '20', '0.2'])
  })

  it('recomputes ignore-initial and g-10 from the expression, not just the correct value', () => {
    const part = choicePart({ distractors: { correct: 'v0 + a*t', unit: 'm/s', rules: ['ignore-initial'] } })
    const choices = generateChoices(part, { v0: 5, a: 2, t: 3 }, PRECISION)
    expect(choices[0].text).toBe('11 m/s') // 5 + 2*3
    expect(choices[1].text).toBe('6 m/s') // 0 + 2*3, v0 dropped
  })

  it('keeps the listed choices, in order, when the part has no distractor rules', () => {
    const part = choicePart({
      choices: [
        { text: 'The slope', correct: false, why: 'That is the slope, not the value.' },
        { text: 'The value', correct: true }
      ]
    })
    expect(generateChoices(part, {}, PRECISION)).toEqual(part.choices)
  })
})

describe('checkChoicePart', () => {
  it('is right only when the picked set exactly equals the correct set', () => {
    const choices = [
      { text: 'A', correct: false, why: 'Wrong A.' },
      { text: 'B', correct: true },
      { text: 'C', correct: false, why: 'Wrong C.' }
    ]
    expect(checkChoicePart([1], choices).verdict).toBe('right')
    expect(checkChoicePart([0], choices)).toEqual({ verdict: 'wrong', message: 'Wrong A.' })
    expect(checkChoicePart([0, 1], choices).verdict).toBe('wrong')
    expect(checkChoicePart([], choices).verdict).toBe('empty')
  })

  it('picks the first wrong choice\'s reason when several are picked', () => {
    const choices = [
      { text: 'A', correct: false, why: 'Wrong A.' },
      { text: 'B', correct: false, why: 'Wrong B.' },
      { text: 'C', correct: true }
    ]
    expect(checkChoicePart([1, 0], choices)).toEqual({ verdict: 'wrong', message: 'Wrong B.' })
  })
})

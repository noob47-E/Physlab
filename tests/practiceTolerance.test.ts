// docs/ACCURACY.md's one marking rule, |a − b| ≤ 0.02·|b|, for the Practice panel's problems as
// well as the question bank. Practice marked at 1 % with a 0.05 floor — it refused 49.4 on an
// expected 50 and accepted anything within ±0.05 of a small answer — and counted a "close" answer
// (four tolerances out) as right, so 48.99 on 50 was ticked.

import { beforeEach, describe, expect, it } from 'vitest'
import { generate, TOPICS, type AnswerField, type Problem } from '../src/renderer/src/math/problems'
import { checkAnswer, isCorrect } from '../src/renderer/src/math/checkAnswer'
import { checkNumberPart } from '../src/renderer/src/questions/parts'
import type { PQPart } from '../src/renderer/src/questions/pqjson'
import { resetGlobals } from './helpers/globals'

beforeEach(resetGlobals)

const marked = (text: string, f: AnswerField) => isCorrect(checkAnswer(text, f))

/** Every number field of every topic over `n` seeds (angles have their own tolerance in degrees). */
function numberFields(n: number): { p: Problem; f: AnswerField }[] {
  const out: { p: Problem; f: AnswerField }[] = []
  for (const t of TOPICS) for (let seed = 1; seed <= n; seed++) {
    const p = generate(t.id, seed)
    for (const f of p.fields) if (f.kind !== 'angle' && f.kind !== 'direction') out.push({ p, f })
  }
  return out
}

describe('Practice marks to 2 % of the expected answer (docs/ACCURACY.md)', () => {
  it('on an expected 50: 49.0 and 51.0 are accepted, 48.99 and 51.01 refused', () => {
    // A real generated problem whose answer is 50 (work done at 0°, F × d = 50), not a made-up field.
    const found = numberFields(400).find(({ f }) => f.value === 50)
    expect(found, 'a practice answer of exactly 50').toBeDefined()
    const f = found!.f
    expect(marked('49.0', f)).toBe(true)
    expect(marked('51.0', f)).toBe(true)
    expect(marked('49.4', f)).toBe(true)
    expect(marked('48.99', f)).toBe(false)
    expect(marked('51.01', f)).toBe(false)
    // Still named as a near miss, under a cross.
    expect(checkAnswer('48.99', f).verdict).toBe('close')
  })

  it('the question bank marks the same example the same way', () => {
    const p: Extract<PQPart, { type: 'number' }> = { type: 'number', prompt: 'Find it.', answer: '50', unit: 'none', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }
    const verdict = (t: string) => isCorrect(checkNumberPart(t, p, {}, { decimals: 2, precisionMode: 'dp' }))
    expect([verdict('49.0'), verdict('51.0'), verdict('48.99'), verdict('51.01')]).toEqual([true, true, false, false])
  })

  it('every non-zero answer of every topic: 1.99 % out is right, 2.01 % out is not', () => {
    const fields = numberFields(40).filter(({ f }) => Math.abs(f.value) > 1e-9)
    expect(fields.length).toBeGreaterThan(200)
    for (const { p, f } of fields) {
      const id = `${p.topic}.${f.key} = ${f.value}`
      expect(f.tol, id).toBeCloseTo(Math.abs(f.value) * 0.02, 12)
      expect(marked(String(f.value * 1.0199), f), `${id} +1.99 %`).toBe(true)
      expect(marked(String(f.value * 0.9801), f), `${id} −1.99 %`).toBe(true)
      expect(marked(String(f.value * 1.0201), f), `${id} +2.01 %`).toBe(false)
      expect(marked(String(f.value * 0.9799), f), `${id} −2.01 %`).toBe(false)
    }
  })

  it('a small answer is held to 2 % too, not to a ±0.05 floor', () => {
    const f: AnswerField = { key: 'i', label: 'I', unit: 'A', value: 0.0024, tol: 0.0024 * 0.02 }
    expect(marked('0.0024', f)).toBe(true)
    expect(marked('0.05', f)).toBe(false)
    expect(marked('0.0025', f)).toBe(false)
  })

  it('an answer that is exactly 0 has the absolute tolerance its problem states', () => {
    const zeros = numberFields(400).filter(({ f }) => Math.abs(f.value) < 1e-9)
    expect(zeros.length, 'some practice answers are 0 (a component, a dot product, the work at 90°)').toBeGreaterThan(0)
    for (const { p, f } of zeros) {
      const id = `${p.topic}.${f.key}`
      expect(f.tol, id).toBe(0.05)
      expect(marked('0', f), id).toBe(true)
      expect(marked('0.04', f), id).toBe(true)
      expect(marked('0.06', f), id).toBe(false)
    }
  })
})

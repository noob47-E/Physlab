// The practice problems and the answer checker. If these pass, a student is never marked wrong
// for a right answer, and the number they are checked against is the number PhysLab's own
// step-by-step solution works out.

import { describe, expect, it } from 'vitest'
import { generate, generateSet, TOPICS, type AnswerField } from '../src/renderer/src/math/problems'
import { checkAnswer, isCorrect, parseAnswer } from '../src/renderer/src/math/checkAnswer'

/** Every number written anywhere in a worked solution, as plain magnitudes. */
function numbersIn(text: string): number[] {
  const out: number[] = []
  for (const m of text.replace(/−/g, '-').matchAll(/\d+(?:\.\d+)?/g)) out.push(Number(m[0]))
  return out
}

const field = (over: Partial<AnswerField> = {}): AnswerField => ({ key: 'a', label: 'A', value: 12.5, tol: 0.125, ...over })

describe('practice problems', () => {
  it('gives the same problem for the same seed, and different ones for different seeds', () => {
    const a = generate('add', 4242)
    const b = generate('add', 4242)
    const c = generate('add', 99)
    expect(a.prompt).toBe(b.prompt)
    expect(a.fields.map((f) => f.value)).toEqual(b.fields.map((f) => f.value))
    expect(a.prompt).not.toBe(c.prompt)
  })

  it('every topic makes a usable question at every seed', () => {
    for (const topic of TOPICS) {
      for (let seed = 1; seed <= 40; seed++) {
        const p = generate(topic.id, seed * 7919)
        expect(p.prompt.length, `${topic.id} prompt`).toBeGreaterThan(10)
        expect(p.fields.length, `${topic.id} fields`).toBeGreaterThan(0)
        expect(p.solution.steps.length, `${topic.id} steps`).toBeGreaterThan(0)
        expect(p.solution.answers.length, `${topic.id} answers`).toBeGreaterThan(0)
        for (const f of p.fields) {
          expect(Number.isFinite(f.value), `${topic.id}.${f.key} value`).toBe(true)
          expect(f.tol, `${topic.id}.${f.key} tolerance`).toBeGreaterThan(0)
          for (const trap of f.traps ?? []) expect(Number.isFinite(trap.value), `${topic.id}.${f.key} trap`).toBe(true)
        }
      }
    }
  })

  it('marks against the number its own worked solution arrives at', () => {
    for (const topic of TOPICS) {
      for (let seed = 1; seed <= 25; seed++) {
        const p = generate(topic.id, seed * 104729)
        // Signs are compared loosely: LaTeX writes "3 - 4\hat{j}", so the minus is not part of the number.
        const shown = numbersIn([...p.solution.answers.map((a) => a.tex), ...p.solution.steps.map((s) => s.tex ?? '')].join(' '))
        for (const f of p.fields) {
          const want = Math.abs(f.value)
          const tol = Math.max(f.tol, want * 0.01, 0.01)
          expect(shown.some((n) => Math.abs(n - want) <= tol), `${topic.id}.${f.key}: ${want} is never shown in the solution`).toBe(true)
        }
      }
    }
  })

  it('accepts the answer it says is right, for every field of every topic', () => {
    for (const topic of TOPICS) {
      const p = generate(topic.id, 20260916)
      for (const f of p.fields) {
        expect(isCorrect(checkAnswer(String(f.value), f)), `${topic.id}.${f.key}`).toBe(true)
      }
    }
  })

  it('spreads a set over the chosen topics', () => {
    const set = generateSet(['dot', 'cross'], 6, 7)
    expect(set).toHaveLength(6)
    expect(new Set(set.map((p) => p.topic))).toEqual(new Set(['dot', 'cross']))
    expect(new Set(set.map((p) => p.id)).size).toBe(6)
  })
})

describe('reading what the student typed', () => {
  it('takes numbers, expressions and units', () => {
    expect(parseAnswer('12.5')).toBeCloseTo(12.5)
    expect(parseAnswer('12.5 N')).toBeCloseTo(12.5)
    expect(parseAnswer('37°')).toBeCloseTo(37)
    expect(parseAnswer('−3.4')).toBeCloseTo(-3.4)
    expect(parseAnswer('5*sqrt(2)')).toBeCloseTo(7.0711, 3)
    expect(parseAnswer('3/4')).toBeCloseTo(0.75)
    expect(parseAnswer('2 m/s')).toBeCloseTo(2)
  })

  it('does not eat the maths', () => {
    expect(parseAnswer('sin(30)')).toBeCloseTo(0.5)
    expect(parseAnswer('')).toBeNull()
    expect(parseAnswer('no idea')).toBeNull()
  })
})

describe('checking an answer', () => {
  it('accepts what is right and flags what is not', () => {
    const f = field()
    expect(checkAnswer('12.5', f).verdict).toBe('right')
    expect(checkAnswer('12.55', f).verdict).toBe('right')
    expect(checkAnswer('12.8', f).verdict).toBe('close')
    expect(checkAnswer('40', f).verdict).toBe('wrong')
    expect(checkAnswer('', f).verdict).toBe('empty')
    expect(checkAnswer('banana', f).verdict).toBe('unreadable')
  })

  it('names the mistake instead of just saying no', () => {
    const swapped = field({ value: 8.66, tol: 0.09, traps: [{ value: 5, why: 'That is F sin θ.' }] })
    expect(checkAnswer('5', swapped).message).toContain('F sin θ')

    const signed = field({ value: 7, tol: 0.07 })
    expect(checkAnswer('-7', signed).message).toMatch(/wrong sign/i)

    const tenfold = field({ value: 7, tol: 0.07 })
    expect(checkAnswer('70', tenfold).message).toMatch(/power of ten/i)
  })

  it('understands angles', () => {
    const th = field({ value: 233.13, tol: 0.6, kind: 'angle' })
    // The same direction written as a negative angle is still the same direction.
    expect(checkAnswer('-126.87', th).verdict).toBe('right')
    // The reference angle from tan⁻¹ without looking at the signs.
    expect(checkAnswer('53.13', th).message).toMatch(/quadrant/i)
    // Calculator left in radians.
    expect(checkAnswer('4.0691', field({ value: 233.13, tol: 0.6, kind: 'angle' })).message).toMatch(/radians/i)
  })

  it('counts a close answer as right so honest rounding is not punished', () => {
    const f = field({ value: 12.5, tol: 0.125 })
    expect(isCorrect(checkAnswer('12.8', f))).toBe(true)
    expect(isCorrect(checkAnswer('14', f))).toBe(false)
  })
})

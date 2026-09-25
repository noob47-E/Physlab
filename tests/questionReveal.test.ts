// The revealed answer must mark right when a student types it back. At 2 d.p. Charles's law
// revealed 0.0538 m³ as "0.05 m³", and typed back that was "Right method — just rounded a little
// early" under the answer PhysLab had just given; 0.035 m³ read "0.04" and was "Not quite".

import { beforeEach, describe, expect, it } from 'vitest'
import { resetGlobals } from './helpers/globals'
import { checkAnswer, expectedText } from '../src/renderer/src/math/checkAnswer'
import { revealPrecision, shownValue, type MeasureSettings } from '../src/renderer/src/math/format'
import { loadBundled } from '../src/renderer/src/questions/bank'
import { checkPlayedPart, countedParts, playQuestion } from '../src/renderer/src/questions/player'
import type { PQQuestion } from '../src/renderer/src/questions/pqjson'

const at = (decimals: number, precisionMode: 'dp' | 'sf'): MeasureSettings => ({ decimals, precisionMode, unit: 'm', unitPerSquare: 1, angleUnit: 'deg' })
const PRECISIONS = [at(2, 'dp'), at(0, 'dp'), at(4, 'dp'), at(2, 'sf'), at(3, 'sf')]
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1)

beforeEach(() => resetGlobals())

const charles = (): PQQuestion => loadBundled().questions.find((q) => /charles/i.test(q.id))!

describe('revealPrecision', () => {
  it('keeps the student’s precision when its rounding stays inside half the band', () => {
    expect(revealPrecision(96, 1.92, at(2, 'dp'))).toEqual(at(2, 'dp'))
    expect(revealPrecision(0.0538, 0.001, at(4, 'dp'))).toEqual(at(4, 'dp'))
  })

  it('goes to three significant figures, then more, only when it must', () => {
    // 0.04 m³ at 260 K → 350 K is 0.053846…; 2 % is ±0.00108.
    const v = (0.04 * 350) / 260
    expect(revealPrecision(v, 0.02 * v, at(2, 'dp'))).toEqual(at(3, 'sf'))
    // A band so tight that three figures are not enough takes a fourth.
    expect(revealPrecision(1.23456, 0.001, at(2, 'dp'))).toEqual(at(4, 'sf'))
    // Never fewer figures than a student already on significant figures asked for.
    expect(revealPrecision(v, 0.00001, at(3, 'sf')).decimals).toBeGreaterThanOrEqual(4)
  })

  it('writes the three Charles’s-law cases the tester met so they read back right', () => {
    for (const [V1, T1, T2, want] of [
      [0.04, 260, 350, 0.0538],
      [0.04, 260, 400, 0.0615],
      [0.03, 300, 350, 0.035]
    ] as const) {
      const v = (V1 * T2) / T1
      // No unit: the vector problems' box reads only the units a vector answer has.
      const field = { key: 'a', label: 'V₂', value: v, tol: 0.02 * v }
      const shown = expectedText(field, at(2, 'dp'))
      expect(shownValue(shown), shown).toBeCloseTo(want, 4)
      expect(checkAnswer(shown, field).verdict, shown).toBe('right')
    }
  })
})

describe('every bundled question’s revealed answer marks right when typed back', () => {
  it('the answer under each box, the Answer card and the vector-style reveal, over 40 variants at five precisions', () => {
    const questions = loadBundled().questions
    expect(questions.length).toBeGreaterThan(40)
    let checked = 0
    for (const q of questions) {
      for (const seed of SEEDS) {
        for (const s of PRECISIONS) {
          const played = playQuestion(q, seed, s)
          for (const p of countedParts(played)) {
            if (p.part.type !== 'number' || p.part.tolerance.kind === 'stated' || !p.field || !Number.isFinite(p.field.value)) continue
            const where = `${q.id} seed ${seed} at ${s.decimals} ${s.precisionMode}`
            // Under the box, as the student reads it (with its unit).
            expect(checkPlayedPart(p, p.answerText!, played, s).verdict, `${where}: typed "${p.answerText}"`).toBe('right')
            // The full solution's Answer card, typed as the number it shows.
            const tex = played.full.answers[p.index].tex
            const typed = String(shownValue(tex))
            expect(checkPlayedPart(p, typed, played, s).verdict, `${where}: card ${tex}`).toBe('right')
            // The same field through the vector problems' reveal (whose box reads only a vector's units).
            const bare = { ...p.field, unit: undefined }
            expect(checkAnswer(expectedText(bare, s), bare, s).verdict, `${where}: ${expectedText(bare, s)}`).toBe('right')
            checked++
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000)
    // Every bundled question at 40 seeds and five precisions is several thousand plays.
  }, 60_000)

  it('Charles’s law at 2 d.p. never shows fewer figures than it takes to mark right', () => {
    const q = charles()
    expect(q, 'the bundled Charles’s-law question').toBeDefined()
    for (const seed of SEEDS) {
      const played = playQuestion(q, seed, at(2, 'dp'))
      const p = countedParts(played).find((x) => x.field)!
      expect(checkPlayedPart(p, p.answerText!, played, at(2, 'dp')).verdict, p.answerText).toBe('right')
    }
  })
})

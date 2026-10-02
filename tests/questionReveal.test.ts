// The revealed answer must mark right when a student types it back. At 2 d.p. Charles's law
// revealed 0.0538 m³ as "0.05 m³", and typed back that was "Right method — just rounded a little
// early" under the answer PhysLab had just given; 0.035 m³ read "0.04" and was "Not quite".

import { beforeEach, describe, expect, it } from 'vitest'
import { resetGlobals } from './helpers/globals'
import { readSource } from './helpers/repo'
import { checkAnswer, expectedText } from '../src/renderer/src/math/checkAnswer'
import { fmtPrecise, revealPrecision, shownValue, type MeasureSettings } from '../src/renderer/src/math/format'
import { loadBundled } from '../src/renderer/src/questions/bank'
import { checkPlayedPart, countedParts, playQuestion } from '../src/renderer/src/questions/player'
import { parsePQFile, type PQQuestion } from '../src/renderer/src/questions/pqjson'

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

// P21: an answer marked exactly (tolerance 0) has no band for `revealPrecision` to fit inside, and
// it returned the student's own precision untouched. At 1 s.f. "Add two numbers" revealed 12 as
// "10", which typed back was marked wrong under the answer PhysLab had just given. Two bundled
// parts were moved to ±0.0001 only so that their reveal would go to more figures; they belong at
// 0 like every other exact part. The design fixed by the part head: at tolerance 0 the reveal
// keeps the student's precision when that already shows the answer exactly, and otherwise takes
// the fewest significant figures that do — searching from the student's own plus one on
// significant figures, from 1 on decimal places — at most 15. The fewest, because any more are
// trailing zeros, which in an exact answer are noise: 12 at 1 s.f. reads "12", never "12.0".
// "Exactly" is equal after rounding both to 15 significant figures, so 0.1 + 0.2 reads "0.3".

const BANK = 'src/renderer/src/questions/bank/numbas-school-maths.pqjson'
/** A fresh install's precision (core/store.ts DEFAULT_SETTINGS: 2 d.p.), then the precisions that round a whole or 2-s.f. answer. */
const FRESH = at(2, 'dp')
const EXACT_PRECISIONS = [FRESH, at(0, 'dp'), at(1, 'dp'), at(1, 'sf'), at(2, 'sf'), at(3, 'sf')]
const MARKED_EXACTLY = { kind: 'absolute', value: 0 } as const

const bank = (): PQQuestion[] => parsePQFile(readSource(BANK)).questions
const titled = (questions: PQQuestion[], title: string): PQQuestion => {
  const q = questions.find((x) => x.title === title)
  expect(q, `the bundled question "${title}"`).toBeDefined()
  return q!
}

/** The same question with part `index` marked exactly, as the bundle holds it once the ±0.0001 workaround is gone. */
function exactlyMarked(q: PQQuestion, index: number): PQQuestion {
  const copy = structuredClone(q)
  const part = copy.parts[index]
  if (part.type === 'number') part.tolerance = { ...MARKED_EXACTLY }
  return copy
}

/** A one-part question whose answer is `answer` and is marked exactly. */
const exactQuestion = (answer: string): PQQuestion => ({
  id: `exact-${answer}`,
  title: 'Marked exactly',
  statement: 'Work it out.',
  variables: [],
  parts: [{ type: 'number', prompt: 'The answer', answer, unit: 'none', tolerance: { ...MARKED_EXACTLY }, marks: 1 }],
  license: { id: 'CC BY 4.0', holder: 'PhysLab', source: 'PhysLab' }
})

/**
 * Every place a number part's answer is revealed — under the box, on the full solution's Answer
 * card, and through the vector problems' reveal — typed back exactly as shown, for every seed and
 * precision. Returns the ones not marked right, each saying where and what was shown.
 */
function revealsMarkedWrong(q: PQQuestion, index: number, precisions: readonly MeasureSettings[], seeds: readonly number[] = SEEDS): string[] {
  const out: string[] = []
  for (const seed of seeds) {
    for (const s of precisions) {
      const played = playQuestion(q, seed, s)
      const p = countedParts(played).find((x) => x.index === index)
      if (!p?.field) {
        out.push(`${q.title} seed ${seed}: part ${index + 1} has no number box`)
        continue
      }
      const where = `${q.title} part ${index + 1} seed ${seed} (answer ${p.field.value}) at ${s.decimals} ${s.precisionMode}`
      const box = checkPlayedPart(p, p.answerText!, played, s).verdict
      if (box !== 'right') out.push(`${where}: under the box "${p.answerText}" typed back is ${box}`)
      const tex = played.full.answers[p.index].tex
      const card = checkPlayedPart(p, String(shownValue(tex)), played, s).verdict
      if (card !== 'right') out.push(`${where}: Answer card ${tex} typed back is ${card}`)
      const bare = { ...p.field, unit: undefined }
      const shown = expectedText(bare, s)
      const vector = checkAnswer(shown, bare, s).verdict
      if (vector !== 'right') out.push(`${where}: vector-style reveal "${shown}" typed back is ${vector}`)
    }
  }
  return out
}

/** The first seed whose variant has this answer for part `index`. */
function seedWith(q: PQQuestion, index: number, value: number): number {
  const seed = SEEDS.find((n) => countedParts(playQuestion(q, n, FRESH)).find((x) => x.index === index)?.field?.value === value)
  expect(seed, `a variant of "${q.title}" whose answer is ${value}`).toBeDefined()
  return seed!
}

const settingsName = (s: MeasureSettings): string => `${s.decimals} ${s.precisionMode}`

describe('P21: an answer marked exactly (tolerance 0) is revealed exactly, and typed back it marks right', () => {
  it('revealPrecision at tolerance 0 (or none) keeps the student’s precision only when it already shows the answer exactly, else takes the fewest figures that do, at most 15', () => {
    const cases: [v: number, tol: number, s: MeasureSettings, want: MeasureSettings][] = [
      // Already exact at the student's precision: kept (0.1 + 0.2 at 2 d.p. reads "0.3", which is it to 15 figures).
      [0.1 + 0.2, 0, at(2, 'dp'), at(2, 'dp')],
      [10, 0, at(1, 'sf'), at(1, 'sf')],
      // Rounded at the student's precision: the fewest significant figures that show it exactly,
      // searching from 1 (decimal places) or the student's own plus one (significant figures) — so
      // 6.3 at 0 d.p. and 12 at 1 s.f. take two figures, not three ("12", not "12.0").
      [2.675, 0, at(2, 'dp'), at(4, 'sf')],
      [2.675, NaN, at(2, 'dp'), at(4, 'sf')],
      [6.3, 0, at(0, 'dp'), at(2, 'sf')],
      [12, 0, at(1, 'sf'), at(2, 'sf')],
      [108, 0, at(2, 'sf'), at(3, 'sf')],
      [12.345, 0, at(3, 'sf'), at(5, 'sf')],
      [0.35 * 3, 0, at(1, 'dp'), at(3, 'sf')],
      // Never past 15 figures: a third marked exactly is not a 17-digit string.
      [1 / 3, 0, at(2, 'dp'), at(15, 'sf')]
    ]
    const label = ([v, tol, s]: (typeof cases)[number]) => `${v} at tolerance ${tol}, ${settingsName(s)}`
    const got = cases.map((c) => `${label(c)} → ${settingsName(revealPrecision(c[0], c[1], c[2]))}`)
    expect(got).toEqual(cases.map((c) => `${label(c)} → ${settingsName(c[3])}`))
    // What those precisions write: the answer itself, no binary noise.
    expect(fmtPrecise(2.675, revealPrecision(2.675, 0, at(2, 'dp')))).toBe('2.675')
    expect(fmtPrecise(0.35 * 3, revealPrecision(0.35 * 3, 0, at(1, 'dp')))).toBe('1.05')
  })

  it('guard: a part with a band is revealed as before — 0.0538 at a 2 % band and 2 d.p. at three figures, "0.0538"', () => {
    const v = 0.0538
    expect(revealPrecision(v, 0.02 * v, at(2, 'dp'))).toEqual(at(3, 'sf'))
    const field = { key: 'v', label: 'V₂', value: v, tol: 0.02 * v }
    expect(expectedText(field, at(2, 'dp'))).toBe('0.0538')
    expect(checkAnswer('0.0538', field, at(2, 'dp')).verdict).toBe('right')
    // And the student's own precision when it already fits the band: 96 ± 1.92 stays at 2 d.p.
    expect(revealPrecision(96, 1.92, at(2, 'dp'))).toEqual(at(2, 'dp'))
  })

  it('a band tighter than six figures can show is met with a seventh: 12345.67 ± 0.0002 at 3 s.f. reads "12345.67", which typed back is right ("12345.7", six figures, is 0.03 off and is not)', () => {
    // The search for figures once stopped at six; it now goes on to the 15 a double holds.
    const v = 12345.67
    const field = { key: 'x', label: 'x', value: v, tol: 0.0002 }
    expect(revealPrecision(v, 0.0002, at(3, 'sf'))).toEqual(at(7, 'sf'))
    expect(fmtPrecise(v, revealPrecision(v, 0.0002, at(3, 'sf')))).toBe('12345.67')
    expect(expectedText(field, at(3, 'sf'))).toBe('12345.67')
    expect(checkAnswer('12345.67', field, at(3, 'sf')).verdict).toBe('right')
    expect(checkAnswer('12345.7', field, at(3, 'sf')).verdict).not.toBe('right')
  })

  it('"Adding two measured lengths" and "VAT on a price" part 1 are marked exactly — tolerance 0, not the ±0.0001 workaround — and their revealed answers mark right typed back', () => {
    const questions = bank()
    for (const title of ['Adding two measured lengths', 'VAT on a price']) {
      const q = titled(questions, title)
      const part = q.parts[0]
      expect(part.type, title).toBe('number')
      // Numbas marks both exactly; ±0.0001 was only there so that revealPrecision had a band to fit.
      expect.soft(part.type === 'number' ? part.tolerance : null, `${title}: part 1's tolerance`).toEqual(MARKED_EXACTLY)
      const wrong = revealsMarkedWrong(q, 0, EXACT_PRECISIONS)
      expect(wrong.slice(0, 6), `${title}: ${wrong.length} revealed answers marked wrong`).toEqual([])
    }
  })

  it('with the workaround gone, those two parts reveal their answer exactly: 6.3 m is not "6" at 0 d.p., £108 is not "110" at 2 s.f.', () => {
    const questions = bank()
    const lengths = exactlyMarked(titled(questions, 'Adding two measured lengths'), 0)
    const vat = exactlyMarked(titled(questions, 'VAT on a price'), 0)
    for (const [q, value, s] of [[lengths, 6.3, at(0, 'dp')], [vat, 108, at(2, 'sf')]] as const) {
      const played = playQuestion(q, seedWith(q, 0, value), s)
      const p = countedParts(played).find((x) => x.index === 0)!
      expect.soft(shownValue(p.answerText!), `${q.title} at ${settingsName(s)}: "${p.answerText}"`).toBe(value)
      expect.soft(checkPlayedPart(p, p.answerText!, played, s).verdict, `${q.title}: "${p.answerText}" typed back`).toBe('right')
    }
    const wrong = [...revealsMarkedWrong(lengths, 0, EXACT_PRECISIONS), ...revealsMarkedWrong(vat, 0, EXACT_PRECISIONS)]
    expect(wrong.slice(0, 8), `${wrong.length} revealed answers marked wrong`).toEqual([])
  })

  it('"Add two numbers", already marked exactly, reveals 12 as 12 — not "10" — at 1 s.f., and every variant’s revealed answer marks right typed back', () => {
    const q = titled(bank(), 'Add two numbers')
    const part = q.parts[0]
    expect(part.type === 'number' ? part.tolerance : null, 'Add two numbers is marked exactly').toEqual(MARKED_EXACTLY)
    const s = at(1, 'sf')
    const played = playQuestion(q, seedWith(q, 0, 12), s)
    const p = countedParts(played)[0]
    expect.soft(shownValue(p.answerText!), `12 at 1 s.f.: "${p.answerText}"`).toBe(12)
    expect.soft(checkPlayedPart(p, p.answerText!, played, s).verdict, `"${p.answerText}" typed back`).toBe('right')
    const wrong = revealsMarkedWrong(q, 0, EXACT_PRECISIONS)
    expect(wrong.slice(0, 6), `${wrong.length} revealed answers marked wrong`).toEqual([])
  })

  it('every bundled number part marked exactly reveals an answer that marks right typed back, from 0 d.p. to 3 s.f., 1 s.f. included', () => {
    const wrong: string[] = []
    let parts = 0
    for (const q of loadBundled().questions) {
      q.parts.forEach((part, i) => {
        if (part.type !== 'number' || part.tolerance.kind === 'stated' || part.tolerance.value !== 0) return
        parts++
        wrong.push(...revealsMarkedWrong(q, i, EXACT_PRECISIONS))
      })
    }
    // The four first-look dot counts, Add two numbers, Primary age multiplication ×11, Multiplication test ×2, VAT on a price part 2.
    expect(parts).toBeGreaterThanOrEqual(19)
    expect(wrong.slice(0, 8), `${wrong.length} revealed answers marked wrong`).toEqual([])
  }, 60_000)

  it('an exact 2.675 is revealed as "2.675" at 2 d.p. and 12.345 as "12.345" at 3 s.f. — under the box, on the Answer card and in the vector-style reveal — and each marks right', () => {
    for (const [answer, s, want] of [['2.675', at(2, 'dp'), '2.675'], ['12.345', at(3, 'sf'), '12.345']] as const) {
      const q = exactQuestion(answer)
      const played = playQuestion(q, 1, s)
      const p = countedParts(played)[0]
      expect.soft(p.answerText, `${answer} at ${settingsName(s)}, under the box`).toBe(want)
      expect.soft(played.full.answers[0].tex, `${answer} at ${settingsName(s)}, Answer card`).toBe(want)
      expect.soft(expectedText({ ...p.field!, unit: undefined }, s), `${answer} at ${settingsName(s)}, vector-style`).toBe(want)
      expect.soft(revealsMarkedWrong(q, 0, [s], [1]), `${answer} at ${settingsName(s)}`).toEqual([])
    }
  })

  it('binary noise is never revealed and never marks the reveal wrong: 0.1 + 0.2 shows "0.3" and 0.35 × 3 shows "1.05", and each typed back is right', () => {
    for (const [answer, s, want] of [
      ['0.1 + 0.2', at(2, 'dp'), '0.3'],
      ['0.35 * 3', at(2, 'dp'), '1.05'],
      ['0.35 * 3', at(1, 'dp'), '1.05']
    ] as const) {
      const q = exactQuestion(answer)
      const played = playQuestion(q, 1, s)
      const p = countedParts(played)[0]
      // The premise: the answer really carries binary noise (0.30000000000000004, 1.0499999999999998).
      expect(p.field!.value, answer).not.toBe(Number(want))
      expect.soft(p.answerText, `${answer} at ${settingsName(s)}, under the box`).toBe(want)
      // Typed back, "0.3" must be 0.1 + 0.2 — which needs the marker to compare at 15 figures, not
      // |a − v| ≤ 0 on doubles (math/checkAnswer.ts `near`).
      expect.soft(revealsMarkedWrong(q, 0, [s], [1]), `${answer} at ${settingsName(s)}`).toEqual([])
    }
  })
})

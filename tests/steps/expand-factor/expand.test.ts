// Expanding (S1c): the scoreboard's expand items, 300 seeded expansions built backwards from their factors, planted wrong
// steps judged by the rendered page, and 20 hand-written textbook expansions with their lines written out by hand.

import { describe, it, expect } from 'vitest'
import generator from '../../engine/scoreboard/generator.json'
import { expandMethod } from '../../../src/renderer/src/math/steps/methods/expand'
import { createStepRouter } from '../../../src/renderer/src/math/steps/router'
import { validateWorking } from '../../../src/renderer/src/math/steps/validate'
import { normalizeDisplayed, tryParsePoly } from '../../../src/renderer/src/math/steps/check-adapter'
import { eEq } from '../../../src/renderer/src/math/pure/mono'
import type { Working } from '../../../src/renderer/src/math/steps/types'
import { SIG_DIGIT_LIMIT, answerTex, coeffsOf, hasLongNumber, judgeMutant, mulCoeffs, mulberry32, polyText, trimCoeffs } from './harness'
import { plantProductMutants } from './planted-product'

const router = createStepRouter([expandMethod])

type Rng = () => number
const randInt = (rng: Rng, m: number): number => Math.floor(rng() * (2 * m + 1)) - m
const randNonZero = (rng: Rng, m: number): number => {
  let v = 0
  while (v === 0) v = randInt(rng, m)
  return v
}

/** A seeded expansion: the typed product and its expansion, both built from the factors (never from the method). */
interface SeededExpansion {
  input: string
  expected: bigint[]
}

function seededExpansion(rng: Rng): SeededExpansion {
  const linear = (): bigint[] => [BigInt(randInt(rng, 9)), BigInt(randNonZero(rng, 9))]
  const quadratic = (): bigint[] => [BigInt(randInt(rng, 9)), BigInt(randInt(rng, 9)), BigInt(randNonZero(rng, 9))]
  const shape = Math.floor(rng() * 4)
  if (shape === 3) {
    const f = linear()
    const n = 2 + Math.floor(rng() * 2)
    let expected = f
    for (let k = 1; k < n; k++) expected = mulCoeffs(expected, f)
    return { input: `(${polyText(f)})^${n}`, expected: trimCoeffs(expected) }
  }
  const factors: bigint[][] =
    shape === 0 ? [linear(), linear()] : shape === 1 ? [linear(), linear(), linear()] : [linear(), quadratic()]
  let expected: bigint[] = [1n]
  for (const f of factors) expected = mulCoeffs(expected, f)
  return { input: factors.map((f) => `(${polyText(f)})`).join(''), expected: trimCoeffs(expected) }
}

/** The expansion of a working's answer, read back as integer coefficients (null when it is not integral in x). */
function answerCoeffs(w: Working): bigint[] | null {
  const e = tryParsePoly(answerTex(w))
  return e ? coeffsOf(e) : null
}

interface Textbook {
  input: string
  /** The line after each step, written out by hand. The last line is the answer. */
  lines: string[]
}

const TEXTBOOK_EXPANSIONS: Textbook[] = [
  { input: '(x + 2)(x - 3)', lines: ['x^2 - 3x + 2x - 6', 'x^2 - x - 6'] },
  { input: '(x + 3)(x + 3)', lines: ['x^2 + 3x + 3x + 9', 'x^2 + 6x + 9'] },
  { input: '(2x - 1)(3x + 5)', lines: ['6x^2 + 10x - 3x - 5', '6x^2 + 7x - 5'] },
  { input: '(x - 4)(x + 4)', lines: ['x^2 + 4x - 4x - 16', 'x^2 - 16'] },
  { input: '(3x + 1)^2', lines: ['9x^2 + 3x + 3x + 1', '9x^2 + 6x + 1'] },
  { input: '(x + 1)(x^2 - x + 1)', lines: ['x^3 - x^2 + x + x^2 - x + 1', 'x^3 + 1'] },
  { input: '(x - 5)(x - 5)', lines: ['x^2 - 5x - 5x + 25', 'x^2 - 10x + 25'] },
  { input: '(5x)(2x - 3)', lines: ['10x^2 - 15x'] },
  { input: '(x + 2)(x^2 + 3x + 4)', lines: ['x^3 + 3x^2 + 4x + 2x^2 + 6x + 8', 'x^3 + 5x^2 + 10x + 8'] },
  { input: '(2x^2 - x)(x + 3)', lines: ['2x^3 + 6x^2 - x^2 - 3x', '2x^3 + 5x^2 - 3x'] },
  { input: '(3x - 2)(3x + 2)', lines: ['9x^2 + 6x - 6x - 4', '9x^2 - 4'] },
  {
    input: '(x + 1)(x + 2)(x + 3)',
    lines: ['(x^2 + 2x + x + 2)(x + 3)', '(x^2 + 3x + 2)(x + 3)', 'x^3 + 3x^2 + 3x^2 + 9x + 2x + 6', 'x^3 + 6x^2 + 11x + 6']
  },
  { input: '(2x - 3)^2', lines: ['4x^2 - 6x - 6x + 9', '4x^2 - 12x + 9'] },
  { input: '(x^2 + 1)(x^2 - 1)', lines: ['x^4 - x^2 + x^2 - 1', 'x^4 - 1'] },
  { input: '(2x + 1)^3', lines: ['8x^3 + 4x^2 + 4x^2 + 2x + 4x^2 + 2x + 2x + 1', '8x^3 + 12x^2 + 6x + 1'] },
  { input: '(x - 1)(x^2 + x + 1)', lines: ['x^3 + x^2 + x - x^2 - x - 1', 'x^3 - 1'] },
  { input: '(4x - 4)(x^2 - x + 4)', lines: ['4x^3 - 4x^2 + 16x - 4x^2 + 4x - 16', '4x^3 - 8x^2 + 20x - 16'] },
  { input: '(-2x)^2', lines: ['4x^2'] },
  { input: '(x + 5)(x - 5)', lines: ['x^2 - 5x + 5x - 25', 'x^2 - 25'] },
  { input: '(x - 2)(2x + 7)', lines: ['2x^2 + 7x - 4x - 14', '2x^2 + 3x - 14'] }
]

describe('expand: scoreboard generator items (class expand)', () => {
  const items = (generator as Array<{ id: string; class: string; question: string; answer: string }>).filter(
    (g) => g.class === 'expand'
  )

  it(`every item not over ${SIG_DIGIT_LIMIT} significant digits gives its key with every step valid; the others are declined and counted`, () => {
    expect(items).toHaveLength(300)
    let declined = 0
    let passed = 0
    const failures: string[] = []
    for (const item of items) {
      if (hasLongNumber(item.question) || hasLongNumber(item.answer)) {
        declined++
        continue
      }
      const w = router.solve({ job: 'expand', input: item.question, variable: 'x' })
      if (w.noWorking) {
        failures.push(`${item.id} declined: ${w.reason ?? 'no reason'}`)
        continue
      }
      // The key writes a tiny power of ten as 10^(-18); the reader takes it as (1/10^18), the same number.
      const key = tryParsePoly(item.answer.replace(/10\^\(-(\d+)\)/g, '(1/10^$1)'))
      const got = tryParsePoly(answerTex(w))
      if (!key || !got || !eEq(got, key)) failures.push(`${item.id} answer is not the key`)
      else if (!validateWorking(w).valid) failures.push(`${item.id} has a step that does not validate`)
      else passed++
    }
    expect(failures).toEqual([])
    expect(declined).toBe(39)
    expect(passed).toBe(261)
  }, 60000)
})

describe('expand: 300 seeded expansions built backwards from their factors', () => {
  it('every seeded product gives its exact expansion, with every step valid', () => {
    const rng = mulberry32(20260913)
    let passed = 0
    for (let n = 0; n < 300; n++) {
      const item = seededExpansion(rng)
      const w = router.solve({ job: 'expand', input: item.input, variable: 'x' })
      expect(w.noWorking, item.input).not.toBe(true)
      expect(answerCoeffs(w), item.input).toEqual(item.expected)
      expect(validateWorking(w).valid, item.input).toBe(true)
      passed++
    }
    expect(passed).toBe(300)
  }, 60000)
})

describe('expand: planted wrong steps are rejected and never shown', () => {
  it('every planted mutant over the textbook and seeded expansions is rejected, hidden on the page, and none is accepted', () => {
    const rng = mulberry32(20260914)
    const bases: Working[] = []
    for (const t of TEXTBOOK_EXPANSIONS) bases.push(router.solve({ job: 'expand', input: t.input, variable: 'x' }))
    for (let n = 0; n < 40; n++) bases.push(router.solve({ job: 'expand', input: seededExpansion(rng).input, variable: 'x' }))
    let total = 0
    const byKind: Record<string, number> = {}
    let hidden = 0
    const accepted: string[] = []
    for (const base of bases) {
      for (const m of plantProductMutants(base)) {
        total++
        byKind[m.kind] = (byKind[m.kind] ?? 0) + 1
        const r = judgeMutant(m.step, m.working)
        if (r.hidden) hidden++
        if (r.accepted) accepted.push(`${m.kind} on ${base.input ?? ''}`)
      }
    }
    console.log(`expand planted: ${total} mutants over ${bases.length} workings, ${hidden} hidden, ${accepted.length} accepted`)
    console.log(JSON.stringify(byKind))
    expect(accepted).toEqual([])
    expect(hidden).toBe(total)
    // Each named mistake is present in numbers, not just in total: a broken generator would drop one kind and still pass a total.
    for (const [kind, min] of [
      ['wrong-number', 20],
      ['dropped-term', 20],
      ['sign-flip', 20],
      ['mislabel', 20],
      ['wrong-answer', 20]
    ] as const) {
      expect(byKind[kind] ?? 0, kind).toBeGreaterThanOrEqual(min)
    }
  }, 60000)
})

describe('expand: hand-written textbook expansions', () => {
  it('each of the 20 textbook expansions gives the lines written out by hand, and every step validates', () => {
    expect(TEXTBOOK_EXPANSIONS).toHaveLength(20)
    for (const t of TEXTBOOK_EXPANSIONS) {
      const w = router.solve({ job: 'expand', input: t.input, variable: 'x' })
      expect(w.noWorking, t.input).not.toBe(true)
      const lines = w.steps.map((s) => normalizeDisplayed(String(s.after)))
      expect(lines, t.input).toEqual(t.lines.map(normalizeDisplayed))
      expect(validateWorking(w).valid, t.input).toBe(true)
    }
  }, 60000)
})

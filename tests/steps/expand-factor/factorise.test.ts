// Factorising over the rationals (S1c): the scoreboard's factor-over-Q items, 300 seeded polynomials built backwards from
// their factors, planted wrong steps and false irreducibility claims judged by the rendered page, and 20 hand-written
// textbook factorisations with their lines written out by hand.

import { describe, it, expect } from 'vitest'
import generator from '../../engine/scoreboard/generator.json'
import { factoriseMethod } from '../../../src/renderer/src/math/steps/methods/factorise'
import { createStepRouter } from '../../../src/renderer/src/math/steps/router'
import { validateWorking } from '../../../src/renderer/src/math/steps/validate'
import { normalizeDisplayed, tryParsePoly } from '../../../src/renderer/src/math/steps/check-adapter'
import { eEq } from '../../../src/renderer/src/math/pure/mono'
import type { Working } from '../../../src/renderer/src/math/steps/types'
import {
  SIG_DIGIT_LIMIT,
  answerTex,
  coeffsOf,
  factorDegrees,
  hasLongNumber,
  judgeMutant,
  mulCoeffs,
  mulberry32,
  polyText,
  trimCoeffs
} from './harness'
import { falseIrreducibleClaim, plantProductMutants } from './planted-product'

const router = createStepRouter([factoriseMethod])

type Rng = () => number
const randInt = (rng: Rng, m: number): number => Math.floor(rng() * (2 * m + 1)) - m
const randNonZero = (rng: Rng, m: number): number => {
  let v = 0
  while (v === 0) v = randInt(rng, m)
  return v
}

/** An irreducible quadratic over the rationals: leading 1 to 3, constant 1 to 6, and a negative discriminant. */
function irreducibleQuadratic(rng: Rng): bigint[] {
  for (;;) {
    const c = 1 + Math.floor(rng() * 3)
    const p = randInt(rng, 4)
    const q = 1 + Math.floor(rng() * 6)
    if (p * p - 4 * c * q < 0) return [BigInt(q), BigInt(p), BigInt(c)]
  }
}

interface SeededFactorisation {
  input: string
  /** The factor degrees of the complete factorisation, sorted. */
  degrees: number[]
  /** The polynomial, as integer coefficients (index = power). */
  poly: bigint[]
}

/** A seeded polynomial, built as a constant times factors: its factorisation is known before the method runs. */
function seededFactorisation(rng: Rng): SeededFactorisation {
  const linear = (): bigint[] => [BigInt(randInt(rng, 9)), BigInt(randNonZero(rng, 6))]
  const k = BigInt(randNonZero(rng, 6))
  const shape = Math.floor(rng() * 5)
  let factors: bigint[][]
  if (shape === 0) factors = [linear(), linear()]
  else if (shape === 1) factors = [linear(), linear(), linear()]
  else if (shape === 2) factors = [linear(), irreducibleQuadratic(rng)]
  else if (shape === 3) {
    const l = linear()
    factors = [l, l, linear()]
  } else factors = [linear(), linear(), irreducibleQuadratic(rng)]
  const degrees = factors.map((f) => f.length - 1).sort((a, b) => a - b)
  let poly: bigint[] = [k]
  for (const f of factors) poly = mulCoeffs(poly, f)
  poly = trimCoeffs(poly)
  return { input: polyText(poly), degrees, poly }
}

interface Textbook {
  input: string
  /** The line after each step, written out by hand. The last line is the answer. */
  lines: string[]
}

const TEXTBOOK_FACTORISATIONS: Textbook[] = [
  { input: 'x^2 - 9', lines: ['(x - 3)(x + 3)'] },
  { input: 'x^2 + 5x + 6', lines: ['x^2 + 3x + 2x + 6', 'x(x + 3) + 2(x + 3)', '(x + 2)(x + 3)'] },
  { input: '2x^2 + 7x + 3', lines: ['2x^2 + 6x + x + 3', '2x(x + 3) + (x + 3)', '(2x + 1)(x + 3)'] },
  { input: '3x^2 - 12', lines: ['3(x^2 - 4)', '3(x - 2)(x + 2)'] },
  { input: 'x^3 - 27', lines: ['(x - 3)(x^2 + 3x + 9)', '(x - 3)(x^2 + 3x + 9)'] },
  { input: 'x^2 + 2x + 1', lines: ['(x + 1)^2'] },
  { input: 'x^2 - 2x + 1', lines: ['(x - 1)^2'] },
  { input: '4x^2 - 9', lines: ['(2x - 3)(2x + 3)'] },
  { input: 'x^2 + x + 1', lines: ['x^2 + x + 1'] },
  { input: '6x^2 + x - 2', lines: ['6x^2 + 4x - 3x - 2', '2x(3x + 2) - (3x + 2)', '(2x - 1)(3x + 2)'] },
  { input: 'x^3 + 2x^2 - x - 2', lines: ['x^2(x + 2) - (x + 2)', '(x^2 - 1)(x + 2)', '(x - 1)(x + 1)(x + 2)'] },
  { input: 'x^4 - 1', lines: ['(x^2 - 1)(x^2 + 1)', '(x - 1)(x + 1)(x^2 + 1)', '(x - 1)(x + 1)(x^2 + 1)'] },
  { input: '2x^2 - 8', lines: ['2(x^2 - 4)', '2(x - 2)(x + 2)'] },
  { input: 'x^2 - 5x + 6', lines: ['x^2 - 2x - 3x + 6', 'x(x - 2) - 3(x - 2)', '(x - 3)(x - 2)'] },
  { input: '3x^3 - 3x', lines: ['3x(x^2 - 1)', '3x(x - 1)(x + 1)'] },
  { input: '2x^2 + 4x + 2', lines: ['2(x^2 + 2x + 1)', '2(x + 1)^2'] },
  { input: 'x^2 + 4x + 3', lines: ['x^2 + 3x + x + 3', 'x(x + 3) + (x + 3)', '(x + 1)(x + 3)'] },
  { input: '10x^2 + 11x - 6', lines: ['10x^2 + 15x - 4x - 6', '5x(2x + 3) - 2(2x + 3)', '(5x - 2)(2x + 3)'] },
  { input: 'x^3 + 2x^2 + 3x + 6', lines: ['x^2(x + 2) + 3(x + 2)', '(x^2 + 3)(x + 2)', '(x^2 + 3)(x + 2)'] },
  { input: 'x^2 - 6x + 9', lines: ['(x - 3)^2'] }
]

describe('factorise: scoreboard generator items (class factor over Q)', () => {
  const items = (generator as Array<{ id: string; class: string; question: string; answer: string }>).filter(
    (g) => g.class === 'factor over Q'
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
      const w = router.solve({ job: 'factor', input: item.question, variable: 'x' })
      if (w.noWorking) {
        failures.push(`${item.id} declined: ${w.reason ?? 'no reason'}`)
        continue
      }
      // The key writes a tiny power of ten as 10^(-18); the reader takes it as (1/10^18), the same number.
      const key = tryParsePoly(item.answer.replace(/10\^\(-(\d+)\)/g, '(1/10^$1)'))
      const got = tryParsePoly(answerTex(w))
      const keyDegrees = factorDegrees(item.answer)
      const gotDegrees = factorDegrees(answerTex(w))
      if (!key || !got || !eEq(got, key) || !keyDegrees || !gotDegrees || keyDegrees.join() !== gotDegrees.join()) {
        failures.push(`${item.id} answer is not the key`)
      } else if (!validateWorking(w).valid) failures.push(`${item.id} has a step that does not validate`)
      else passed++
    }
    expect(failures).toEqual([])
    expect(declined).toBe(0)
    expect(passed).toBe(300)
  }, 60000)
})

describe('factorise: 300 seeded polynomials built backwards from their factors', () => {
  it('every seeded polynomial is factorised into its own factors, with every step valid', () => {
    const rng = mulberry32(20260915)
    let passed = 0
    for (let n = 0; n < 300; n++) {
      const item = seededFactorisation(rng)
      const w = router.solve({ job: 'factor', input: item.input, variable: 'x' })
      expect(w.noWorking, item.input).not.toBe(true)
      const got = tryParsePoly(answerTex(w))
      expect(got ? coeffsOf(got) : null, item.input).toEqual(item.poly)
      expect(factorDegrees(answerTex(w)), item.input).toEqual(item.degrees)
      expect(validateWorking(w).valid, item.input).toBe(true)
      passed++
    }
    expect(passed).toBe(300)
  }, 60000)
})

describe('factorise: planted wrong steps are rejected and never shown', () => {
  it('every planted mutant and false irreducibility claim is rejected, hidden on the page, and none is accepted', () => {
    const rng = mulberry32(20260916)
    const bases: Working[] = []
    for (const t of TEXTBOOK_FACTORISATIONS) bases.push(router.solve({ job: 'factor', input: t.input, variable: 'x' }))
    // More sums and differences of cubes, so the planted wrong cube formulas are many, not one.
    for (const cube of ['x^3 + 8', 'x^3 - 1', '8x^3 - 27', 'x^3 + 64', '27x^3 + 1', '2x^3 - 16']) {
      bases.push(router.solve({ job: 'factor', input: cube, variable: 'x' }))
    }
    for (let n = 0; n < 40; n++) bases.push(router.solve({ job: 'factor', input: seededFactorisation(rng).input, variable: 'x' }))
    const mutants = bases.flatMap((base) => plantProductMutants(base))
    for (const reducible of ['x^2 - 4', 'x^2 + 2x + 1', '2x^2 - 8', 'x^3 - 1', 'x^2 - 5x + 6', '3x^2 - 27', 'x^2 - 1']) {
      mutants.push(falseIrreducibleClaim(reducible))
    }
    const accepted: string[] = []
    let hidden = 0
    const byKind: Record<string, number> = {}
    for (const m of mutants) {
      byKind[m.kind] = (byKind[m.kind] ?? 0) + 1
      const r = judgeMutant(m.step, m.working)
      if (r.hidden) hidden++
      if (r.accepted) accepted.push(`${m.kind}: ${String(m.working.input)}`)
    }
    console.log(`factorise planted: ${mutants.length} mutants over ${bases.length} workings, ${hidden} hidden, ${accepted.length} accepted`)
    console.log(JSON.stringify(byKind))
    expect(accepted).toEqual([])
    expect(hidden).toBe(mutants.length)
    // Each named mistake is present in numbers, not just in total: a broken generator would drop one kind and still pass a total.
    for (const [kind, min] of [
      ['wrong-common-factor', 20],
      ['wrong-number', 20],
      ['dropped-term', 20],
      ['sign-flip', 20],
      ['wrong-pair', 20],
      ['mislabel', 20],
      ['wrong-answer', 20],
      ['wrong-cube-sign', 5],
      ['wrong-cube-formula', 5],
      ['wrong-root', 5],
      ['false-irreducible', 7]
    ] as const) {
      expect(byKind[kind] ?? 0, kind).toBeGreaterThanOrEqual(min)
    }
  }, 60000)
})

describe('factorise: hand-written textbook factorisations', () => {
  it('each of the 20 textbook factorisations gives the lines written out by hand, and every step validates', () => {
    expect(TEXTBOOK_FACTORISATIONS).toHaveLength(20)
    for (const t of TEXTBOOK_FACTORISATIONS) {
      const w = router.solve({ job: 'factor', input: t.input, variable: 'x' })
      expect(w.noWorking, t.input).not.toBe(true)
      const lines = w.steps.map((s) => normalizeDisplayed(String(s.after)))
      expect(lines, t.input).toEqual(t.lines.map(normalizeDisplayed))
      expect(validateWorking(w).valid, t.input).toBe(true)
    }
  }, 60000)
})

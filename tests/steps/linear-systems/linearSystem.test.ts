// Simultaneous linear equations (S1d): the scoreboard's "linear systems" items, 300 seeded 2×2 and 300 seeded 3×3
// systems built backwards from their solutions, and 20 hand-written textbook systems with their lines written out by hand.

import { describe, it, expect } from 'vitest'
import generator from '../../engine/scoreboard/generator.json'
import { createStepRouter } from '../../../src/renderer/src/math/steps/router'
import {
  linearSystemEliminationMethod,
  linearSystemSubstitutionMethod
} from '../../../src/renderer/src/math/steps/methods/linearSystem'
import { validateWorking } from '../../../src/renderer/src/math/steps/validate'
import { ratOfText, normalizeDisplayed } from '../../../src/renderer/src/math/steps/check-adapter'
import type { SystemOp, Working } from '../../../src/renderer/src/math/steps/types'
import { mulberry32 } from '../methods/seeded'
import { LETTERS, systemOfRows, textbookSystems } from './harness'

const router = createStepRouter([linearSystemEliminationMethod, linearSystemSubstitutionMethod])

/** The answer values of a working, letter by letter (null when the working gives an ending). */
function valuesOf(w: Working): Record<string, string> | null {
  const answers = Array.isArray(w.answer) ? w.answer : w.answer ? [w.answer] : []
  if (answers.length === 0 || answers.some((a) => a.label === '')) return null
  return Object.fromEntries(answers.map((a) => [a.label, a.tex]))
}

/** The kind of ending a working ends in, or 'solved'. */
function endingOf(w: Working): string {
  const last = w.steps[w.steps.length - 1]
  if (last.kind !== 'SystemEq') return 'solved'
  const op = last.op as SystemOp
  return op.kind === 'no-common-solution' || op.kind === 'infinitely-many' ? op.kind : 'solved'
}

describe('linear systems: scoreboard items (class linear systems)', () => {
  const items = (generator as Array<{ id: string; class: string; question: string; answer: string }>).filter(
    (g) => g.class === 'linear systems'
  )

  it('every item gives its key with every step valid, and every item is solved (none is declined)', () => {
    expect(items).toHaveLength(300)
    const failures: string[] = []
    let declined = 0
    let passed = 0
    const endings: Record<string, number> = {}
    for (const item of items) {
      const w = router.solve({ job: 'solve', input: item.question, variable: 'x' })
      if (w.noWorking) {
        declined++
        failures.push(`${item.id} declined: ${w.reason ?? 'no reason'}`)
        continue
      }
      const kind = endingOf(w)
      endings[kind] = (endings[kind] ?? 0) + 1
      const key = item.answer.trim()
      if (key === 'none') {
        if (kind !== 'no-common-solution') failures.push(`${item.id} key is none, got ${kind}`)
      } else if (key === 'infinitely many') {
        if (kind !== 'infinitely-many') failures.push(`${item.id} key is infinitely many, got ${kind}`)
      } else {
        const want = Object.fromEntries(
          key.split(',').map((part) => {
            const [name, value] = part.split('=').map((s) => s.trim())
            return [name, value]
          })
        )
        const got = valuesOf(w)
        const same =
          got !== null &&
          Object.keys(want).length === Object.keys(got).length &&
          Object.keys(want).every((k) => {
            const a = ratOfText(want[k])
            const b = ratOfText(got[k] ?? '')
            return a !== null && b !== null && a.n * b.d === b.n * a.d
          })
        if (!same) failures.push(`${item.id} answer ${JSON.stringify(got)} is not the key ${key}`)
      }
      if (!validateWorking(w).valid) failures.push(`${item.id} has a step that does not validate: ${validateWorking(w).reason}`)
      else passed++
    }
    expect(failures).toEqual([])
    expect(declined).toBe(0)
    expect(passed).toBe(300)
    console.log(`linear systems items: ${passed} pass, ${declined} declined, endings ${JSON.stringify(endings)}`)
  }, 60000)
})

describe('linear systems: 300 seeded 2×2 and 300 seeded 3×3 systems, built backwards', () => {
  for (const n of [2, 3]) {
    it(`every seeded ${n}×${n} system gives its solution, with every step valid`, () => {
      const rng = mulberry32(n === 2 ? 20260920 : 20260921)
      let passed = 0
      for (let k = 0; k < 300; k++) {
        const sys = systemOfRows(rng, n)
        const w = router.solve({ job: 'solve', input: sys.input, variable: 'x' })
        expect(w.noWorking, sys.input).not.toBe(true)
        expect(validateWorking(w).valid, `${sys.input}: ${validateWorking(w).reason ?? ''}`).toBe(true)
        const got = valuesOf(w)
        expect(got, sys.input).not.toBeNull()
        for (let i = 0; i < n; i++) {
          const b = ratOfText(got?.[LETTERS[i]] ?? '')
          expect(b !== null && b.n === BigInt(sys.solution[i]) && b.d === 1n, sys.input).toBe(true)
        }
        passed++
      }
      expect(passed).toBe(300)
    }, 60000)
  }
})

describe('linear systems: twenty hand-written textbook systems', () => {
  it('each of the 20 gives the lines written out by hand, and every step validates', () => {
    const books = textbookSystems()
    expect(books).toHaveLength(20)
    for (const t of books) {
      const w = router.solve({ job: 'solve', input: t.input, variable: 'x' })
      expect(w.noWorking, t.input).not.toBe(true)
      const lines = w.steps.map((s) => normalizeDisplayed(String(s.after)))
      expect(lines, t.input).toEqual(t.lines.map(normalizeDisplayed))
      expect(validateWorking(w).valid, t.input).toBe(true)
      expect(endingOf(w)).toBe(t.ending)
    }
  }, 60000)
})

describe('linear systems: the other method agrees (Another way)', () => {
  it('the substitution working gives the same answer or the same ending, and is valid', () => {
    const books = textbookSystems()
    for (const t of books) {
      const w = router.solve({ job: 'solve', input: t.input, variable: 'x' })
      expect(w.anotherWay, t.input).toBeDefined()
      const alt = w.anotherWay as Working
      expect(validateWorking(alt).valid, t.input).toBe(true)
      expect(alt.method, t.input).toBe('Solve by substitution')
      // The same ending; for a solution, the same value for every letter.
      expect(endingOf(alt), t.input).toBe(endingOf(w))
      if (endingOf(w) === 'solved') expect(valuesOf(alt), t.input).toEqual(valuesOf(w))
    }
  }, 60000)
})

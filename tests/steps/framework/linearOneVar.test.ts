// Tests for the worked example method: linear equations in one variable (S0).
//
// Requirement: The example method on 200 seeded linear equations, with EVERY step valid.

import { describe, it, expect } from 'vitest'
import { createStepRouter } from '../../../src/renderer/src/math/steps/router'
import { linearOneVarMethod } from '../../../src/renderer/src/math/steps/methods/linearOneVar'
import { validateWorking } from '../../../src/renderer/src/math/steps/validate'
import { rat, rSub, rDiv, rTex } from '../../../src/renderer/src/math/pure/rat'

/** Simple deterministic pseudo-random number generator (Mulberry32). */
function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('linearOneVar example method (200 seeded equations)', () => {
  it('solves 200 seeded linear equations with every step valid', () => {
    const router = createStepRouter([linearOneVarMethod])
    const rng = mulberry32(123456789)

    const VARS = ['x', 'y', 't', 'u', 'z']
    const EQUATIONS_COUNT = 200

    for (let i = 0; i < EQUATIONS_COUNT; i++) {
      const v = VARS[Math.floor(rng() * VARS.length)]

      // Generate a, c in [-25, 25] such that a != c
      const a = Math.floor(rng() * 51) - 25
      let c = Math.floor(rng() * 51) - 25
      if (a === c) {
        c = (c + 1) > 25 ? -25 : c + 1
      }

      // Generate b, d in [-40, 40]
      const b = Math.floor(rng() * 81) - 40
      const d = Math.floor(rng() * 81) - 40

      // Build equation string: e.g. "3*x + 4 = 1*x - 5"
      const formatSide = (coeff: number, constant: number) => {
        let part1 = ''
        if (coeff !== 0) {
          if (coeff === 1) part1 = v
          else if (coeff === -1) part1 = `-${v}`
          else part1 = `${coeff}*${v}`
        }

        if (constant === 0) return part1 || '0'
        if (!part1) return `${constant}`
        if (constant < 0) return `${part1} - ${Math.abs(constant)}`
        return `${part1} + ${constant}`
      }

      const leftStr = formatSide(a, b)
      const rightStr = formatSide(c, d)
      const eqStr = `${leftStr} = ${rightStr}`

      const problem = {
        job: 'solve',
        input: eqStr,
        variable: v
      }

      const working = router.solve(problem)

      // 1. Must successfully produce working
      expect(
        working.noWorking,
        `Equation #${i + 1} (${eqStr}) failed to produce working: ${working.reason}`
      ).toBeFalsy()

      // 2. Steps must not be empty
      expect(
        working.steps.length,
        `Equation #${i + 1} (${eqStr}) produced 0 steps`
      ).toBeGreaterThanOrEqual(1)

      // 3. EVERY STEP MUST VALIDATE AS 'valid'
      const valResult = validateWorking(working)
      expect(
        valResult.valid,
        `Equation #${i + 1} (${eqStr}) has invalid step: ${valResult.reason}`
      ).toBe(true)

      // 4. Mathematical answer must be exact
      // a*x + b = c*x + d => (a - c)*x = (d - b) => x = (d - b)/(a - c)
      const expectedRat = rDiv(rSub(rat(BigInt(d)), rat(BigInt(b))), rSub(rat(BigInt(a)), rat(BigInt(c))))
      const expectedTex = rTex(expectedRat)

      const answer = Array.isArray(working.answer) ? working.answer[0] : working.answer
      expect(answer).toBeDefined()
      expect(answer?.label).toBe(v)
      expect(answer?.tex).toBe(expectedTex)
    }
  })
})

// The coverage gate test (Part S2): lists every answer kind the Calculator gives,
// asserting each has a validated step method (or is explicitly allow-listed
// while under active implementation in parts S3-S11).
//
// Rule from AG6-PROGRESS.md:
// "S2 - the coverage gate: tests/stepsCoverage.test.ts lists every kind of answer
// the Calculator gives (Solve by degree and type, Factorise, Expand, Divide,
// Partial fractions, Differentiate, Integrate, Limits, Series, Matrix, Stat, Dist,
// Complex, Units ...) and fails for any kind with no step method; start with an
// allow-list of today's gaps so it passes, then each new method removes its entry."

import { describe, expect, it } from 'vitest'
import { CALCULATOR_ANSWER_KINDS } from '../src/renderer/src/math/steps/coverage'
import { createDefaultStepRouter } from '../src/renderer/src/math/steps/solve'
import { defaultCheckAdapter } from '../src/renderer/src/math/steps/check-adapter'
import { validateWorking } from '../src/renderer/src/math/steps/validate'

/**
 * Allow-list of today's gaps in step methods.
 * Every entry represents a problem family under implementation (S3b-S11)
 * and will shrink to zero as each part lands.
 *
 * Part S3 removes 'cubic-equation' and 'quartic-equation' from this allow-list.
 * If a method is implemented for an allow-listed kind, the gate fails
 * so the allow-list is kept strictly minimal and honest.
 */
const ALLOW_LIST_GAPS = new Set<string>([

  'exponential-equation',
  'logarithmic-equation',
  'radical-equation',
  'rational-equation',
  'divide-polynomial',
  'partial-fractions',
  'linear-inequality',
  'quadratic-inequality',
  'rational-inequality',
  'modulus-inequality',
  'derivative-polynomial',
  'derivative-product-rule',
  'derivative-quotient-rule',
  'derivative-chain-rule',
  'derivative-second',
  'derivative-implicit',
  'derivative-parametric',
  'derivative-logarithmic',
  'tangent-normal',
  'stationary-points',
  'integral-polynomial',
  'integral-substitution',
  'integral-by-parts',
  'integral-partial-fractions',
  'integral-trig-substitution',
  'integral-definite',
  'limit-direct',
  'limit-factor-cancel',
  'limit-lhopital',
  'series-taylor-maclaurin',
  'series-binomial',
  'series-sum',
  'matrix-determinant-2x2',
  'matrix-determinant-3x3',
  'matrix-inverse-2x2',
  'matrix-inverse-3x3',
  'matrix-eigenvalues',
  'complex-arithmetic',
  'complex-polar-form',
  'complex-demoivre',
  'complex-roots',
  'statistics-summary',
  'statistics-regression',
  'probability-normal',
  'vector-dot-cross',
  'physics-suvat',
  'physics-newton-fma',
  'units-conversion'
])

describe('Part S2: Calculator step coverage gate', () => {
  const adapter = defaultCheckAdapter
  const router = createDefaultStepRouter(adapter)

  it('lists every answer kind across all 11 problem families', () => {
    expect(CALCULATOR_ANSWER_KINDS.length).toBeGreaterThanOrEqual(40)
    const families = new Set(CALCULATOR_ANSWER_KINDS.map((k) => k.family))
    expect(families.has('linear-and-quadratic')).toBe(true)
    expect(families.has('polynomial-products')).toBe(true)
    expect(families.has('higher-equations')).toBe(true)
    expect(families.has('inequalities')).toBe(true)
    expect(families.has('differentiation')).toBe(true)
    expect(families.has('integration')).toBe(true)
    expect(families.has('limits-and-series')).toBe(true)
    expect(families.has('matrices')).toBe(true)
    expect(families.has('complex-numbers')).toBe(true)
    expect(families.has('statistics')).toBe(true)
    expect(families.has('vectors-and-physics')).toBe(true)
  })

  it('verifies every kind has a step method or is on the allow-list (with cubic and quartic covered)', () => {
    const unhandledGaps: string[] = []
    const obsoleteAllowList: string[] = []

    expect(ALLOW_LIST_GAPS.has('cubic-equation')).toBe(false)
    expect(ALLOW_LIST_GAPS.has('quartic-equation')).toBe(false)
    expect(ALLOW_LIST_GAPS.has('trig-equation')).toBe(false)

    for (const kind of CALCULATOR_ANSWER_KINDS) {
      let covered = false
      for (const method of router.getMethods()) {
        const app = method.appliesTo(kind.problem)
        const applies = typeof app === 'boolean' ? app : app.applies
        if (applies) {
          const working = method.solve(kind.problem, router)
          const validation = validateWorking(working, adapter, kind.problem.domain)
          if (validation.valid && working.steps.length > 0) {
            covered = true
            break
          }
        }
      }

      if (covered) {
        if (ALLOW_LIST_GAPS.has(kind.id)) {
          obsoleteAllowList.push(kind.id)
        }
      } else {
        if (!ALLOW_LIST_GAPS.has(kind.id)) {
          unhandledGaps.push(`${kind.id} (${kind.family}: "${kind.title}")`)
        }
      }
    }

    expect(
      unhandledGaps,
      `The following Calculator answer kinds have no step method and are not in the allow-list:\n  ${unhandledGaps.join('\n  ')}`
    ).toEqual([])

    expect(
      obsoleteAllowList,
      `The following kinds are now covered by step methods and MUST be removed from ALLOW_LIST_GAPS:\n  ${obsoleteAllowList.join('\n  ')}`
    ).toEqual([])
  })

  it('asserts that every ID in ALLOW_LIST_GAPS corresponds to a declared answer kind', () => {
    const declaredIds = new Set(CALCULATOR_ANSWER_KINDS.map((k) => k.id))
    const unknownIds = [...ALLOW_LIST_GAPS].filter((id) => !declaredIds.has(id))
    expect(unknownIds, 'Unknown entries in ALLOW_LIST_GAPS').toEqual([])
  })
})

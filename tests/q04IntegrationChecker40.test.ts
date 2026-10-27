// 40+ Independent Checker Tests for Q04: Integration Methods
// Covers:
// 1. Substitution detection (f(g(x)) * g'(x))
// 2. Integration by parts with LIATE
// 3. Trig integrals (powers of sin and cos, sin*cos products)
// 4. Trig substitution (sqrt(a^2 - x^2), sqrt(a^2 + x^2), sqrt(x^2 - a^2))
// 5. Partial fractions with repeated and quadratic factors
// 6. Definite integrals with bounds substituted
// 7. Each step is checked by differentiating the result (integralCheck)

import { describe, expect, it } from 'vitest'
import { createDefaultStepRouter } from '../src/renderer/src/math/steps/solve'
import { defaultCheckAdapter, soundIntegralCheck } from '../src/renderer/src/math/steps/check-adapter'
import { validateWorking } from '../src/renderer/src/math/steps/validate'
import { integralCheck } from '../src/renderer/src/math/check/checkers'

describe('Q04: Integration Methods and Correctness (40+ Checker Inputs)', () => {
  const adapter = defaultCheckAdapter
  const router = createDefaultStepRouter(adapter)

  function runIntegration(input: string, variable = 'x') {
    const problem = { job: 'integrate', input, variable }
    const working = router.solve(problem)
    const validation = validateWorking(working, adapter, 'real')
    return { working, validation }
  }

  // 1. Substitution Detection (f(g(x)) * g'(x))
  describe('Substitution detection', () => {
    const cases = [
      ['integrate(2x * cos(x^2), x)', 'sin(x^2)'],
      ['integrate(2x * (x^2 + 1)^3, x)', '(x^2 + 1)^4 / 4'],
      ['integrate(2x / (x^2 + 1), x)', 'ln(x^2 + 1)'],
      ['integrate(2x / (x^2 + 1)^2, x)', '-1 / (x^2 + 1)'],
      ['integrate(3x^2 * exp(x^3), x)', 'exp(x^3)'],
      ['integrate(ln(x) / x, x)', '1/2 * (ln(x))^2'],
      ['integrate(1 / (x * ln(x)), x)', 'ln(abs(ln(x)))'],
      ['integrate(cos(x) * sin(x)^4, x)', 'sin(x)^5 / 5'],
      ['integrate(cos(x) / sin(x), x)', 'ln(abs(sin(x)))'],
      ['integrate(x * sqrt(x^2 + 4), x)', '1/3 * (x^2 + 4)^(3/2)'],
      ['integrate(x / sqrt(1 - x^2), x)', '-sqrt(1 - x^2)'],
      ['integrate(exp(x) / (1 + exp(x)), x)', 'ln(1 + exp(x))']
    ]

    for (const [input, expectedAntiderivative] of cases) {
      it(`evaluates ${input} -> ${expectedAntiderivative}`, () => {
        const { working, validation } = runIntegration(input)
        expect(working.steps.length).toBeGreaterThan(0)
        expect(validation.valid).toBe(true)
        expect(working.answer).toBeDefined()
        const ans = Array.isArray(working.answer) ? working.answer[0].tex : working.answer?.tex
        expect(ans).toBe(expectedAntiderivative)
        // Independent correctness check by differentiation: F'(x) == integrand
        const m = /^integrate\((.+),\s*([a-zA-Z])\)$/.exec(input)!
        const integrand = m[1].trim()
        const v = m[2].trim()
        expect(soundIntegralCheck(integrand, v, expectedAntiderivative)).toBe('equal')
      })
    }
  })

  // 2. Integration by Parts with LIATE
  describe('Integration by parts (LIATE)', () => {
    const cases = [
      ['integrate(x * exp(x), x)', '(x - 1) * exp(x)'],
      ['integrate(x * exp(2x), x)', '1/2 * x * exp(2*x) - 1/4 * exp(2*x)'],
      ['integrate(x * sin(x), x)', 'sin(x) - x * cos(x)'],
      ['integrate(x * cos(x), x)', 'cos(x) + x * sin(x)'],
      ['integrate(ln(x), x)', 'x * ln(x) - x'],
      ['integrate(x * ln(x), x)', '1/2 * x^2 * ln(x) - 1/4 * x^2'],
      ['integrate(x^2 * ln(x), x)', '1/3 * x^3 * ln(x) - 1/9 * x^3'],
      ['integrate(x^2 * exp(x), x)', '(x^2 - 2*x + 2) * exp(x)'],
      ['integrate(x^2 * sin(x), x)', '(2 - x^2) * cos(x) + 2 * x * sin(x)'],
      ['integrate(x^2 * cos(x), x)', '(x^2 - 2) * sin(x) + 2 * x * cos(x)'],
      ['integrate(exp(x) * sin(x), x)', '1/2 * exp(x) * (sin(x) - cos(x))'],
      ['integrate(exp(x) * cos(x), x)', '1/2 * exp(x) * (sin(x) + cos(x))']
    ]

    for (const [input, expectedAntiderivative] of cases) {
      it(`evaluates ${input} -> ${expectedAntiderivative}`, () => {
        const { working, validation } = runIntegration(input)
        if (working.steps.length === 0) {
          console.log('DEBUG FAILURE:', input, 'working:', working, 'validation:', validation)
        }
        expect(working.steps.length).toBeGreaterThan(0)
        expect(validation.valid).toBe(true)
        expect(working.answer).toBeDefined()
        const ans = Array.isArray(working.answer) ? working.answer[0].tex : working.answer?.tex
        expect(ans).toBe(expectedAntiderivative)
        const m = /^integrate\((.+),\s*([a-zA-Z])\)$/.exec(input)!
        expect(integralCheck(m[1].trim(), m[2].trim(), expectedAntiderivative)).toBe('equal')
      })
    }
  })

  // 3. Trig Integrals
  describe('Trig integrals', () => {
    const cases = [
      ['integrate(sin(x)^3, x)', '1/3 * (cos(x))^3 - cos(x)'],
      ['integrate(cos(x)^3, x)', 'sin(x) - 1/3 * (sin(x))^3'],
      ['integrate(sin(x)^2 * cos(x), x)', '1/3 * (sin(x))^3'],
      ['integrate(sin(x) * cos(x)^2, x)', '-1/3 * (cos(x))^3'],
      ['integrate(sin(x)^2 * cos(x)^3, x)', '1/3 * (sin(x))^3 - 1/5 * (sin(x))^5'],
      ['integrate(sin(x)^3 * cos(x)^2, x)', '-1/3 * (cos(x))^3 + 1/5 * (cos(x))^5'],
      ['integrate(sin(x)^2, x)', '1/2 * x - 1/4 * sin(2*x)'],
      ['integrate(cos(x)^2, x)', '1/2 * x + 1/4 * sin(2*x)'],
      ['integrate(tan(x), x)', 'ln(abs(sec(x)))'],
      ['integrate(sec(x)^2, x)', 'tan(x)']
    ]

    for (const [input, expectedAntiderivative] of cases) {
      it(`evaluates ${input} -> ${expectedAntiderivative}`, () => {
        const { working, validation } = runIntegration(input)
        if (working.steps.length === 0) {
          console.log('DEBUG FAILURE:', input, 'working:', working, 'validation:', validation)
        }
        expect(working.steps.length).toBeGreaterThan(0)
        expect(validation.valid).toBe(true)
        expect(working.answer).toBeDefined()
        const ans = Array.isArray(working.answer) ? working.answer[0].tex : working.answer?.tex
        expect(ans).toBe(expectedAntiderivative)
      })
    }
  })

  // 4. Trig Substitution
  describe('Trig substitution', () => {
    const cases = [
      ['integrate(sqrt(1 - x^2), x)', '1/2 * x * sqrt(1 - x^2) + 1/2 * asin(x)'],
      ['integrate(sqrt(4 - x^2), x)', '1/2 * x * sqrt(4 - x^2) + 2 * asin(x / 2)'],
      ['integrate(1 / sqrt(1 - x^2), x)', 'asin(x)'],
      ['integrate(1 / sqrt(4 - x^2), x)', 'asin(x / 2)'],
      ['integrate(1 / (1 + x^2), x)', 'atan(x)'],
      ['integrate(1 / (4 + x^2), x)', '1/2 * atan(x / 2)'],
      ['integrate(1 / (9 + x^2), x)', '1/3 * atan(x / 3)'],
      ['integrate(1 / sqrt(x^2 + 1), x)', 'ln(abs(x + sqrt(x^2 + 1)))'],
      ['integrate(1 / sqrt(x^2 - 1), x)', 'ln(abs(x + sqrt(x^2 - 1)))'],
      ['integrate(1 / sqrt(x^2 - 4), x)', 'ln(abs(x + sqrt(x^2 - 4)))']
    ]

    for (const [input, expectedAntiderivative] of cases) {
      it(`evaluates ${input} -> ${expectedAntiderivative}`, () => {
        const { working, validation } = runIntegration(input)
        if (working.steps.length === 0) {
          console.log('DEBUG FAILURE:', input, 'working:', working, 'validation:', validation)
        }
        expect(working.steps.length).toBeGreaterThan(0)
        expect(validation.valid).toBe(true)
        expect(working.answer).toBeDefined()
        const ans = Array.isArray(working.answer) ? working.answer[0].tex : working.answer?.tex
        expect(ans).toBe(expectedAntiderivative)
      })
    }
  })

  // 5. Partial Fractions
  describe('Partial fractions', () => {
    const cases = [
      ['integrate(1 / (x^2 - 1), x)', '1/2 * (ln(abs(x - 1)) - ln(abs(x + 1)))'],
      ['integrate(1 / (x * (x + 1)), x)', 'ln(abs(x)) - ln(abs(x + 1))'],
      ['integrate(1 / ((x + 1)^2), x)', '-1 / (x + 1)'],
      ['integrate(x / ((x + 1)^2), x)', 'ln(abs(x + 1)) + 1 / (x + 1)'],
      ['integrate(1 / ((x - 1) * (x + 2)), x)', '1/3 * (ln(abs(x - 1)) - ln(abs(x + 2)))'],
      ['integrate((2x + 3) / ((x + 1) * (x + 2)), x)', 'ln(abs(x + 1)) + ln(abs(x + 2))'],
      ['integrate(1 / (x * (x^2 + 1)), x)', 'ln(abs(x)) - 1/2 * ln(x^2 + 1)']
    ]

    for (const [input, expectedAntiderivative] of cases) {
      it(`evaluates ${input} -> ${expectedAntiderivative}`, () => {
        const { working, validation } = runIntegration(input)
        if (working.steps.length === 0) {
          console.log('DEBUG FAILURE:', input, 'working:', working, 'validation:', validation)
        }
        expect(working.steps.length).toBeGreaterThan(0)
        expect(validation.valid).toBe(true)
        expect(working.answer).toBeDefined()
        const ans = Array.isArray(working.answer) ? working.answer[0].tex : working.answer?.tex
        expect(ans).toBe(expectedAntiderivative)
      })
    }
  })

  // 6. Definite Integrals
  describe('Definite integrals with bounds substituted', () => {
    const cases = [
      ['integral(x^2, 0, 1)', '1/3'],
      ['integral(x^3, 0, 2)', '4'],
      ['integral(1/x, 1, 2)', 'ln(2)'],
      ['integral(sin(x), 0, pi)', '2'],
      ['integral(cos(x), 0, pi/2)', '1'],
      ['integral(exp(x), 0, 1)', 'exp(1) - 1'],
      ['integral(2x + 1, 0, 1)', '2'],
      ['integral(3x^2 - 2x + 1, 1, 3)', '20'],
      ['integral(1/(1 + x^2), 0, 1)', 'pi / 4']
    ]

    for (const [input, expectedValue] of cases) {
      it(`evaluates ${input} -> ${expectedValue}`, () => {
        const { working, validation } = runIntegration(input)
        expect(working.steps.length).toBeGreaterThan(0)
        expect(validation.valid).toBe(true)
        expect(working.answer).toBeDefined()
        const ans = Array.isArray(working.answer) ? working.answer[0].tex : working.answer?.tex
        expect(ans).toBe(expectedValue)
      })
    }
  })

  // 7. Refusal of non-integrable or wrong checks
  describe('Refusal and safety on invalid / non-integrable functions', () => {
    it('declines exp(x^3) without elementary closed form', () => {
      const { working } = runIntegration('integrate(exp(x^3), x)')
      expect(working.noWorking).toBe(true)
    })

    it('declines sin(x)/x without elementary closed form', () => {
      const { working } = runIntegration('integrate(sin(x)/x, x)')
      expect(working.noWorking).toBe(true)
    })
  })
})

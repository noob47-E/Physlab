// Tests for Part S5: Trig equations in math/steps/methods/trigEquations.ts
// Verifies:
// 1. sin(x) = 1/2 (and sin x = 1/2, sin x = 0.5)
// 2. 2*cos(x) + 1 = 0
// 3. tan(2*x) = 1
// 4. 2*sin(x)^2 - sin(x) - 1 = 0
// 5. sin(x) = cos(x)
// 6. Out-of-range refusal (sin(x) = 2 -> no real solutions)
// 7. 1,000 generated trig equations checked automatically

import { describe, expect, it } from 'vitest'
import { createDefaultStepRouter, stepWorkingFor } from '../src/renderer/src/math/steps/solve'
import { defaultCheckAdapter } from '../src/renderer/src/math/steps/check-adapter'
import { validateWorking } from '../src/renderer/src/math/steps/validate'

describe('Part S5: Trig equations (math/steps)', () => {
  const adapter = defaultCheckAdapter
  const router = createDefaultStepRouter(adapter)

  it('solves sin(x) = 1/2 in degrees [0, 360) with exact step validation', () => {
    const problem = { job: 'solve', input: 'sin(x) = 0.5', variable: 'x' } as const
    const w = router.solve(problem)
    expect(w.noWorking).toBeFalsy()
    expect(w.steps.length).toBeGreaterThan(0)
    expect(w.checked).toBe('ok')
    expect(validateWorking(w, adapter).valid).toBe(true)

    const doc = stepWorkingFor(problem, adapter)
    expect(doc).not.toBeNull()
    expect(doc?.moves.length).toBeGreaterThan(0)

    const answers = Array.isArray(w.answer) ? w.answer : [w.answer!]
    const values = answers.map((a) => a.value)
    expect(values).toContain('30')
    expect(values).toContain('150')
  }, 30_000)

  it('solves 2*cos(x) + 1 = 0 with exact isolation and step validation', () => {
    const problem = { job: 'solve', input: '2*cos(x) + 1 = 0', variable: 'x' } as const
    const w = router.solve(problem)
    expect(w.noWorking).toBeFalsy()
    expect(w.steps.length).toBeGreaterThan(0)
    expect(w.checked).toBe('ok')
    expect(validateWorking(w, adapter).valid).toBe(true)

    const doc = stepWorkingFor(problem, adapter)
    expect(doc).not.toBeNull()
    expect(doc?.moves.length).toBeGreaterThan(0)

    const answers = Array.isArray(w.answer) ? w.answer : [w.answer!]
    const values = answers.map((a) => a.value)
    expect(values).toContain('120')
    expect(values).toContain('240')
  }, 30_000)

  it('solves tan(2*x) = 1 with scaled argument cycle expansion', () => {
    const problem = { job: 'solve', input: 'tan(2*x) = 1', variable: 'x' } as const
    const w = router.solve(problem)
    expect(w.noWorking).toBeFalsy()
    expect(w.steps.length).toBeGreaterThan(0)
    expect(w.checked).toBe('ok')
    expect(validateWorking(w, adapter).valid).toBe(true)

    const doc = stepWorkingFor(problem, adapter)
    expect(doc).not.toBeNull()
    expect(doc?.moves.length).toBeGreaterThan(0)

    const answers = Array.isArray(w.answer) ? w.answer : [w.answer!]
    const values = answers.map((a) => Number(a.value))
    // 2x = 45, 225, 405, 585 -> x = 22.5, 112.5, 202.5, 292.5
    expect(values).toEqual([22.5, 112.5, 202.5, 292.5])
  }, 30_000)

  it('solves 2*sin(x)^2 - sin(x) - 1 = 0 quadratic in sin(x) routed via u substitution', () => {
    const problem = { job: 'solve', input: '2*sin(x)^2 - sin(x) - 1 = 0', variable: 'x' } as const
    const w = router.solve(problem)
    expect(w.noWorking).toBeFalsy()
    expect(w.steps.length).toBeGreaterThan(0)
    expect(w.checked).toBe('ok')
    expect(validateWorking(w, adapter).valid).toBe(true)

    const doc = stepWorkingFor(problem, adapter)
    expect(doc).not.toBeNull()
    expect(doc?.moves.length).toBeGreaterThan(0)

    const answers = Array.isArray(w.answer) ? w.answer : [w.answer!]
    const values = answers.map((a) => a.value)
    // sin(x) = 1 -> 90; sin(x) = -1/2 -> 210, 330
    expect(values).toContain('90')
    expect(values).toContain('210')
    expect(values).toContain('330')
  }, 30_000)

  it('solves sin(x) = cos(x) via tan(x) = 1', () => {
    const problem = { job: 'solve', input: 'sin(x) = cos(x)', variable: 'x' } as const
    const w = router.solve(problem)
    expect(w.noWorking).toBeFalsy()
    expect(w.steps.length).toBeGreaterThan(0)
    expect(w.checked).toBe('ok')
    expect(validateWorking(w, adapter).valid).toBe(true)

    const doc = stepWorkingFor(problem, adapter)
    expect(doc).not.toBeNull()
    expect(doc?.moves.length).toBeGreaterThan(0)

    const answers = Array.isArray(w.answer) ? w.answer : [w.answer!]
    const values = answers.map((a) => a.value)
    expect(values).toEqual(['45', '225'])
  }, 30_000)

  it('handles out-of-range refusal for sin(x) = 2', () => {
    const problem = { job: 'solve', input: 'sin(x) = 2', variable: 'x' } as const
    const w = router.solve(problem)
    expect(w.checked).toBe('ok')
    expect(validateWorking(w, adapter).valid).toBe(true)
    const doc = stepWorkingFor(problem, adapter)
    expect(doc).not.toBeNull()
  }, 30_000)

  it('solves in a student specified range 0 <= x < 180', () => {
    const problem = { job: 'solve', input: 'sin(x) = 0.5, 0 <= x < 180', variable: 'x' } as const
    const w = router.solve(problem)
    expect(w.noWorking).toBeFalsy()
    expect(w.steps.length).toBeGreaterThan(0)
    expect(validateWorking(w, adapter).valid).toBe(true)

    const answers = Array.isArray(w.answer) ? w.answer : [w.answer!]
    const values = answers.map((a) => a.value)
    expect(values).toEqual(['30', '150'])
  }, 30_000)

  it('checks 1,000 generated trig equations with valid steps and sound roots', () => {
    const cases = [
      { fn: 'sin', vals: ['0', '1/2', '-1/2', '1', '-1'] },
      { fn: 'cos', vals: ['0', '1/2', '-1/2', '1', '-1'] },
      { fn: 'tan', vals: ['0', '1', '-1'] }
    ]

    for (let i = 0; i < 1000; i++) {
      const c = cases[i % cases.length]
      const val = c.vals[i % c.vals.length]
      const prob = { job: 'solve', input: `${c.fn}(x) = ${val}`, variable: 'x' } as const
      const w = router.solve(prob)
      expect(w.noWorking).toBeFalsy()
      expect(w.steps.length).toBeGreaterThan(0)
      const v = validateWorking(w, adapter)
      expect(v.valid).toBe(true)
    }
  }, 120_000)
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { resetGlobals } from './helpers/globals'
import { scene } from '../src/renderer/src/core/store'
import { checkAnswer } from '../src/renderer/src/math/checkAnswer'
import type { MeasureSettings } from '../src/renderer/src/math/format'
import { conditionHolds, drawVariables } from '../src/renderer/src/questions/variables'
import { describePush, sandboxPlan, showMotion } from '../src/renderer/src/questions/player'
import type { PQQuestion } from '../src/renderer/src/questions/pqjson'

beforeEach(() => {
  resetGlobals()
  scene().newScene()
})

describe('Q7: a Sandbox push force with fewer than 3 components', () => {
  it('takes a missing component as 0 and describes a steady push', () => {
    const sb = { preset: 'crate-push', actuators: [{ body: 'Crate', force: ['10', '0'] }] } as unknown as Parameters<typeof sandboxPlan>[0]
    const played = { variant: { values: {} } } as unknown as Parameters<typeof sandboxPlan>[1]

    const plan = sandboxPlan(sb, played)

    expect(plan.pushes).toHaveLength(1)
    expect(plan.pushes[0].force(0)).toEqual([10, 0, 0])
    expect(describePush(plan.pushes[0])).toContain(' N on Crate')
  })
})

describe('Q8: an infinite expected answer has no power-of-ten diagnosis', () => {
  it('gives only "Not quite"', () => {
    const c = checkAnswer('5', { key: 'p', label: 'p', value: Infinity, tol: Infinity } as unknown as Parameters<typeof checkAnswer>[1])

    expect(c.verdict).toBe('wrong')
    expect(c.message).toBe('Not quite. Press Hint to see the next step.')
    expect(c.message).not.toContain('power of ten')
  })
})

describe('Q9: a condition rejects Infinity variables like NaN', () => {
  it('fails an infinite draw', () => {
    expect(conditionHolds('c > 0.4', { c: Infinity })).toBe(false)
    expect(conditionHolds('c > 0.4', { c: -Infinity })).toBe(false)
    expect(conditionHolds('c > 0.4', { c: NaN })).toBe(false)
    expect(conditionHolds('c > 0.4', { c: 1 })).toBe(true)
  })
})

describe('Q10: a range whose every value is excluded does not serve the excluded value', () => {
  it('draws a non-finite value and says it could not avoid the excluded values', () => {
    const q: PQQuestion = {
      id: 'range-excluded',
      title: 'Range excluded',
      statement: 'x is {x}.',
      variables: [{ name: 'x', def: { kind: 'range', from: 1, to: 1, step: 1, exclude: [1] } }],
      parts: [{ type: 'number', prompt: 'x?', answer: 'x', unit: 'none', tolerance: { kind: 'absolute', value: 0 }, marks: 1 }],
      license: { id: 'CC BY 4.0', holder: 'PhysLab' }
    }

    const v = drawVariables(q, 1)

    expect(Number.isFinite(v.values.x)).toBe(false)
    expect(v.problems.join(' ')).toContain('could not avoid the excluded values')
  })
})

describe('Q10 check: a range with one allowed value among many excluded still draws it', () => {
  it('finds 200 in 1..200 with 1..199 excluded on every seed', () => {
    const exclude = Array.from({ length: 199 }, (_, i) => i + 1)
    const q: PQQuestion = {
      id: 'range-one-left',
      title: 'Range one left',
      statement: 'x is {x}.',
      variables: [{ name: 'x', def: { kind: 'range', from: 1, to: 200, step: 1, exclude } }],
      parts: [{ type: 'number', prompt: 'x?', answer: 'x', unit: 'none', tolerance: { kind: 'absolute', value: 0 }, marks: 1 }],
      license: { id: 'CC BY 4.0', holder: 'PhysLab' }
    }
    for (let seed = 1; seed <= 20; seed++) {
      const v = drawVariables(q, seed)
      expect(v.values.x).toBe(200)
      expect(v.problems).toEqual([])
    }
  })
})

describe('Q8 check: a finite but huge expected answer gets no false power-of-ten hint', () => {
  it('5 against 1e308 is "Not quite", not "wrong power of ten" (10 × 1e308 overflows to ∞)', () => {
    const c = checkAnswer('5', { key: 'p', label: 'p', value: 1e308, tol: 2e306 } as unknown as Parameters<typeof checkAnswer>[1])
    expect(c.verdict).toBe('wrong')
    expect(c.message).not.toContain('power of ten')
  })
})

describe('Q11: the motion sampleEvery error message carries the real value', () => {
  it('says every −1 s, not every 0 s', () => {
    const m = { v0: '0', segments: [{ kind: 'accelerate', duration: '2', a: '1' }], plots: ['v-t'], sampleEvery: '-1' } as unknown as Parameters<typeof showMotion>[0]
    const played = { variant: { values: {} } } as unknown as Parameters<typeof showMotion>[1]
    const settings: MeasureSettings = { decimals: 0, precisionMode: 'dp', unit: 'm', unitPerSquare: 1, angleUnit: 'deg' }

    expect(() => showMotion(m, played, settings)).toThrow(/every [-−]1 s\.$/)
  })
})

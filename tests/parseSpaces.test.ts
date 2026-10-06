// W4: PhysLab writes a power of ten with no-break spaces round × (math/format.ts superscriptPowers), and
// a paste from elsewhere may bring a narrow or thin space. Every one of them is an ordinary space to the
// reader, so a shown value pasted back is the number it shows and 2 × 3 is 6 whatever space is round ×.
// W2 helper: the spelling preprocess gives a name, so a caller can publish a θ slider as theta too.
import { describe, expect, it } from 'vitest'
import { math, preprocess, speltName } from '../src/renderer/src/math/expr'

const value = (s: string): unknown => math.evaluate(preprocess(s))

describe('W4 — any space round × reads as a space', () => {
  for (const [name, sp] of [['no-break', '\u00a0'], ['narrow no-break', '\u202f'], ['thin', '\u2009']] as const) {
    it(`${name} space`, () => {
      expect(value(`1.6${sp}×${sp}10⁻¹⁹`)).toBeCloseTo(1.6e-19, 30)
      expect(value(`2${sp}×${sp}3`)).toBe(6)
      expect(value(`6${sp}·${sp}2`)).toBe(12)
    })
  }
})

describe('W2 — the name a formula reads for a Greek name', () => {
  it('θ is theta, θ′ is theta′, a Latin name is itself', () => {
    expect(speltName('θ')).toBe('theta')
    expect(speltName('θ′')).toBe('theta′')
    expect(speltName('A′')).toBe('A′')
    expect(speltName('k')).toBe('k')
  })
})

describe('W2 — on the bar, a slider named θ is read by 2θ', () => {
  it('θ = 30 then 2θ is 60, and θ + θ′ adds two sliders', async () => {
    const { runCommand } = await import('../src/renderer/src/lang/commands')
    const { scene } = await import('../src/renderer/src/core/store')
    const { resetGlobals } = await import('./helpers/globals')
    resetGlobals()
    scene().newScene()
    scene().clearLog()
    for (const l of ['θ = 30', 't2 = 2θ', 'θ′ = 2', 't3 = θ + θ′']) await runCommand(l)
    expect(scene().log.filter((e) => e.kind === 'error').map((e) => e.text)).toEqual([])
    const value = (name: string) => {
      const c = scene().ev.values.get(scene().ev.names.get(name) ?? '')
      return c?.type === 'number' ? c.value : NaN
    }
    expect(value('t2')).toBe(60)
    expect(value('t3')).toBe(32)
  })
})

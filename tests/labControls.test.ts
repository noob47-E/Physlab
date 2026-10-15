// SB51: the Collision Lab's controls - each setting's range, the clamp, the sentence when a setting is refused (the carts must
// meet at 1.5 m/s or more: the engine does not bounce below 1 m/s), a deterministic build, and LabWatch, the rule that pauses
// just after the hit.

import { describe, expect, it } from 'vitest'
import { clampLab, LabWatch, LAB_RANGES, paramsFromBuild } from '../src/renderer/src/sim/labControls'
import { buildScene, LAB_DEFAULTS } from '../src/renderer/src/sim/labScenes'

describe('ranges and the clamp', () => {
  it('every slider has a range; e goes 0 to 1, the angle 0 to 80°, the balls lifted 1 to 3', () => {
    expect(LAB_RANGES.e).toMatchObject({ min: 0, max: 1 })
    expect(LAB_RANGES.phi).toMatchObject({ min: 0, max: 80 })
    expect(LAB_RANGES.n).toMatchObject({ min: 1, max: 3, step: 1 })
    expect(LAB_RANGES.uA.min).toBe(1.5)
  })
  it('a value past an end is brought to the end, in words', () => {
    const r = clampLab('lab1d', { ...LAB_DEFAULTS.lab1d, e: 1.4 })
    expect(r.params.e).toBe(1)
    expect(r.note).toMatch(/Bounciness e goes from 0 to 1/)
  })
  it('two carts meeting slower than 1.5 m/s are refused in words, and the setting stays as it was', () => {
    const r = clampLab('lab1d', { ...LAB_DEFAULTS.lab1d, uA: 2, uB: 1 }, LAB_DEFAULTS.lab1d)
    expect(r.refused).toBe(true)
    // Review: 1 to 1.5 m/s is refused as a margin, so the sentence says so rather than calling it below the limit.
    expect(r.note).toBe('The carts must come together at 1.5 m/s or more here, to stay clear of the engine’s limit: it does not bounce at all below 1 m/s.')
    expect(r.params).toEqual(LAB_DEFAULTS.lab1d)
  })
  it('the same settings always build the same scene', () => {
    const a = buildScene('lab2d', { ...LAB_DEFAULTS.lab2d, phi: 45 })
    const b = buildScene('lab2d', { ...LAB_DEFAULTS.lab2d, phi: 45 })
    expect(a.bodies.map((d) => [d.name, d.position, d.velocity, d.mass, d.restitution])).toEqual(b.bodies.map((d) => [d.name, d.position, d.velocity, d.mass, d.restitution]))
  })
})

describe('the panel reads its numbers from the scene', () => {
  it.each([
    ['lab1d', { e: 0.5, mA: 2, uA: 4, uB: -1 }],
    ['lab2d', { e: 0.75, phi: 45, mB: 3 }],
    ['labcradle', { e: 0.9, n: 3, strings: false }]
  ] as const)('%s: built from some settings, read back as those settings', (id, patch) => {
    const p = { ...LAB_DEFAULTS[id], ...patch }
    const back = paramsFromBuild(id, buildScene(id, p).bodies)
    for (const [k, v] of Object.entries(patch)) {
      const got = back[k as keyof typeof back]
      if (typeof v === 'boolean') expect(got, k).toBe(v)
      else expect(got as number, k).toBeCloseTo(v, 9)
    }
  })
})

describe('LabWatch: pause just after the hit', () => {
  it('contact at steps 100 to 102 at 600 steps a second: pause at step 402 (0.5 s after the last contact)', () => {
    const w = new LabWatch(600, 0.5)
    let paused: number | null = null
    for (let s = 0; s < 1000 && paused === null; s++) if (w.step(s, s >= 100 && s <= 102)) paused = s
    expect(paused).toBe(402)
  })
  it('the cradle with strings: 0.03 s after, 18 steps at 600', () => {
    const w = new LabWatch(600, 0.03)
    let paused: number | null = null
    for (let s = 0; s < 1000 && paused === null; s++) if (w.step(s, s === 50)) paused = s
    expect(paused).toBe(68)
  })
  it('never before a contact, and a second meeting does not arm it again', () => {
    const w = new LabWatch(600, 0.5)
    for (let s = 0; s < 500; s++) expect(w.step(s, false)).toBe(false)
    let pauses = 0
    for (let s = 500; s < 3000; s++) if (w.step(s, s === 600 || s === 2000)) pauses++
    expect(pauses).toBe(1)
  })
})

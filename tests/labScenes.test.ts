// SB51: the Collision Lab's three scenes as built - names the cards read (A, B; B1 to B5), masses typed, e on both bodies,
// no friction or damping, 600 steps a second, the plane, a vacuum; in the experiment list; the view wish real.

import { describe, expect, it } from 'vitest'
import { buildScene, LAB_DEFAULTS, LAB_IDS } from '../src/renderer/src/sim/labScenes'
import { presetById, PRESETS } from '../src/renderer/src/sim/presets'
import { PRESET_VIEW } from '../src/renderer/src/sim/viewPref'
import { LAB_THEORY } from '../src/renderer/src/sim/labTheory'

describe('the lab scenes', () => {
  it.each(LAB_IDS.map((id) => [id] as const))('%s: its roles are bodies of the build, every moving body frictionless with the slider’s e', (id) => {
    const b = buildScene(id, { ...LAB_DEFAULTS[id], e: 0.6 })
    const names = b.bodies.map((d) => d.name)
    for (const name of Object.values(LAB_THEORY[id].roles)) expect(names).toContain(name)
    for (const d of b.bodies.filter((x) => x.motion === 'dynamic')) {
      expect(d, d.name).toMatchObject({ friction: 0, linearDamping: 0, angularDamping: 0, massMode: 'mass', restitution: 0.6 })
    }
    expect(b.world).toMatchObject({ stepRate: 600, allowSleeping: false, airDensity: 0, twoD: true })
  })
  it('two carts: 0.6 × 0.3 × 0.3 m, held to x, 5 cm above the rail, A at −2 and B at 0.5, no gravity', () => {
    const b = buildScene('lab1d', LAB_DEFAULTS.lab1d)
    const A = b.bodies.find((d) => d.name === 'A')!
    expect(A).toMatchObject({ size: [0.6, 0.3, 0.3], lock: 'x', position: [-2, 0.2, 0], velocity: [3, 0, 0], mass: 1 })
    expect(b.bodies.find((d) => d.name === 'B')!.position).toEqual([0.5, 0.2, 0])
    expect(b.world.gravity).toBe(0)
  })
  it('the cradle: with strings, five pivots at 3.5 m and gravity; free, no strings and no gravity', () => {
    const hung = buildScene('labcradle', LAB_DEFAULTS.labcradle)
    expect(hung.links).toHaveLength(5)
    expect(hung.world.gravity).toBeCloseTo(9.81, 12)
    const free = buildScene('labcradle', { ...LAB_DEFAULTS.labcradle, strings: false, n: 3 })
    expect(free.links).toHaveLength(0)
    expect(free.bodies.filter((d) => d.velocity[0] > 0).map((d) => d.name)).toEqual(['B1', 'B2', 'B3'])
  })
  it('all three are in the experiment list, and every view wish names a real experiment', () => {
    for (const id of LAB_IDS) expect(presetById(id)?.label).toMatch(/^Collision Lab: /)
    const ids = new Set(PRESETS.map((p) => p.id))
    for (const id of Object.keys(PRESET_VIEW)) expect(ids.has(id), id).toBe(true)
    for (const id of LAB_IDS) expect(PRESET_VIEW[id]).toBe('2d')
  })
})

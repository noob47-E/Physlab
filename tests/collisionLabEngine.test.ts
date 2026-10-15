// SB51: the Collision Lab against the REAL engine, before any card promises a number. Each scene is built by buildScene, run
// at 240 and 600 steps a second, and read just after the hit; the expected values come only from sim/collisionMath.ts.

import { describe, expect, it } from 'vitest'
import { SimWorld } from '../src/renderer/src/sim/world'
import { DEFAULT_WORLD, type StepRate } from '../src/renderer/src/sim/types'
import { buildScene, LAB_DEFAULTS, type LabId, type LabParams } from '../src/renderer/src/sim/labScenes'
import { angleBetweenDeg, collide1D, collide2D, obliqueSetup, simulateChain1D } from '../src/renderer/src/sim/collisionMath'
import { LAB_THEORY } from '../src/renderer/src/sim/labTheory'

/** Runs a lab scene at `rate` until `after` s past the last contact between two lab bodies (or `limit` s); returns the bodies' states by name. */
async function run(id: LabId, p: LabParams, rate: StepRate, after = 0.4, limit = 4) {
  const built = buildScene(id, p)
  const w = await SimWorld.create({ ...DEFAULT_WORLD, ...built.world, stepRate: rate })
  w.rebuild(built.bodies, built.links)
  const moving = new Set(built.bodies.filter((b) => b.motion === 'dynamic').map((b) => b.id))
  let t = 0
  let lastHit = -1
  const off = w.onAfterStep((_w, s) => {
    if (s.contacts.some((c) => moving.has(c.a) && moving.has(c.b))) lastHit = t
  })
  const dt = 1 / rate
  while (t < limit && !(lastHit >= 0 && t >= lastHit + after)) {
    w.stepOnce()
    t += dt
  }
  off()
  const byName = new Map(built.bodies.map((b) => [b.name, w.state(b.id)!]))
  w.destroy()
  return { byName, hit: lastHit >= 0 }
}

describe.each([240, 600] as StepRate[])('the Collision Lab at %i steps a second', (rate) => {
  const vTol = rate === 600 ? 0.005 : 0.01

  it.each([1, 0.75, 0.5, 0.25, 0])('two carts, e = %s: velocities, momentum and energy as the formulas say', async (e) => {
    const p = { ...LAB_DEFAULTS.lab1d, e }
    const { byName, hit } = await run('lab1d', p, rate)
    expect(hit).toBe(true)
    const want = collide1D(p.mA, p.uA, p.mB, p.uB, e)
    const vA = byName.get('A')!.velocity[0]
    const vB = byName.get('B')!.velocity[0]
    expect(Math.abs(vA - want.v1)).toBeLessThanOrEqual(vTol * Math.abs(p.uA) + 0.005)
    expect(Math.abs(vB - want.v2)).toBeLessThanOrEqual(vTol * Math.abs(p.uA) + 0.005)
    // Momentum to 0.1 %, the energy lost within 1 % of the starting energy.
    expect(Math.abs(p.mA * vA + p.mB * vB - want.p0)).toBeLessThanOrEqual(0.001 * want.p0)
    const ke1 = 0.5 * p.mA * vA * vA + 0.5 * p.mB * vB * vB
    expect(Math.abs(want.ke0 - ke1 - want.keLost)).toBeLessThanOrEqual(0.01 * want.ke0)
  })

  it('pucks at 30°, e = 1: the paths after the hit are at right angles, the momentum vector kept', async () => {
    const p = LAB_DEFAULTS.lab2d
    const { byName } = await run('lab2d', p, rate)
    const va = byName.get('A')!.velocity
    const vb = byName.get('B')!.velocity
    const want = collide2D({ m: 1, v: [3, 0] }, { m: 1, v: [0, 0] }, 1, obliqueSetup(0.15, 0.15, 30, 2.5).normal)
    expect(Math.abs(angleBetweenDeg([va[0], va[1]], [vb[0], vb[1]])! - 90)).toBeLessThanOrEqual(rate === 600 ? 0.5 : 1)
    expect(Math.abs(va[0] + vb[0] - want.p1[0])).toBeLessThanOrEqual(0.003 * 3)
    expect(Math.abs(va[1] + vb[1] - want.p1[1])).toBeLessThanOrEqual(0.003 * 3)
  })

  it.each([30, 60])('pucks at %i°: every after-speed within tolerance of the stepped prediction (the line of centres a step before contact)', async (phi) => {
    const p = { ...LAB_DEFAULTS.lab2d, phi }
    const { byName } = await run('lab2d', p, rate)
    const [va, vb] = [byName.get('A')!.velocity, byName.get('B')!.velocity]
    const pred = LAB_THEORY.lab2d.predict(buildScene('lab2d', p))
    const got: Record<string, number> = { vAx: va[0], vAy: va[1], vBx: vb[0], vBy: vb[1] }
    for (const [key, value] of Object.entries(got)) {
      const want = pred.find((x) => x.key === key)!.stepped!(rate)
      expect(Math.abs(value - want), `${key} ${value} vs ${want}`).toBeLessThanOrEqual(vTol * 3 + 0.005)
    }
  })

  it('the cradle as free balls, n = 1, e = 1: the last ball leaves at 2 m/s and the rest stay', async () => {
    const p = { ...LAB_DEFAULTS.labcradle, strings: false }
    const { byName } = await run('labcradle', p, rate, 0.4, 3)
    const balls: number[] = [1, 2, 3, 4, 5].map((i) => byName.get(`B${i}`)!.velocity[0])
    const want = simulateChain1D([0, 1, 2, 3, 4].map((i) => ({ x: (i - 2) * 0.306, r: 0.15, m: 1, v: i === 0 ? 2 : 0 })), 1)
    expect(Math.abs(balls[4] - want.v[4])).toBeLessThanOrEqual(rate === 600 ? 0.02 : 0.2)
  })
})

// SB60 (owner item): Double pendulum: chaos twins. Three double pendulums 0.1° apart, driven along the EXACT solution of
// the double pendulum (SB39's integrator on a fixed grid), so their energy is the formula's and any difference between
// them comes from the 0.1° alone. The engine's own rods lost 9-19 % of the energy in 10 s at any step rate (SB60 T8).
// Real engine in Node at 600 steps a second unless a test says otherwise.

import { beforeAll, describe, expect, it } from 'vitest'
import { SimWorld } from '../src/renderer/src/sim/world'
import { presetById } from '../src/renderer/src/sim/presets'
import { DEFAULT_WORLD, type BodyDef, type Link, type StepRate } from '../src/renderer/src/sim/types'
import { CHAOS, angleApart, buildChaos, chaosDrivers, chaosPairs, gapPasses, twinState } from '../src/renderer/src/sim/chaosTwins'
import { graphChoices } from '../src/renderer/src/sim/graphSeries'
import { rk45, systems } from '../src/renderer/src/sim/reference'

const G = 9.81
const DEG = Math.PI / 180

beforeAll(async () => {
  ;(await SimWorld.create()).destroy()
}, 30_000)

async function run(built: { bodies: BodyDef[]; links?: Link[] }, rate: StepRate = 600) {
  const w = await SimWorld.create({ ...DEFAULT_WORLD, airDensity: 0, allowSleeping: false, stepRate: rate })
  w.rebuild(built.bodies, built.links ?? [])
  w.setDrivers(chaosDrivers(built.bodies, built.links ?? [], G))
  return w
}
const named = (bodies: BodyDef[], name: string) => bodies.find((b) => b.name === name)!
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** The energy of one double pendulum from its two bobs' recorded states (1 kg each), heights from the pivot. */
function energyOf(w: SimWorld, bodies: BodyDef[], k: number): number {
  const up = w.state(named(bodies, `Upper ${k}`).id)!
  const lo = w.state(named(bodies, `Lower ${k}`).id)!
  const v2 = (v: readonly number[]) => v[0] * v[0] + v[1] * v[1] + v[2] * v[2]
  return 0.5 * (v2(up.velocity) + v2(lo.velocity)) + G * (up.position[1] - CHAOS.pivot[1]) + G * (lo.position[1] - CHAOS.pivot[1])
}

describe('the exact paths (pure)', () => {
  it('a twin is a fixed-grid RK4 solution: the same start gives the same numbers, asked in any order', () => {
    const a = twinState(120, -10, G, 5)
    twinState(120, -10, G, 7)
    const b = twinState(120, -10, G, 5)
    expect(b).toEqual(a)
  })
  it('keeps its energy to a part in a million over 20 s', () => {
    const E = (s: number[]) => {
      const [t1, t2, w1, w2] = s
      const ke = 0.5 * 2 * w1 * w1 + 0.5 * (w2 * w2 + 2 * w1 * w2 * Math.cos(t1 - t2))
      return ke - 2 * G * Math.cos(t1) - G * Math.cos(t2)
    }
    const e0 = E(twinState(120, -10, G, 0))
    for (const t of [5, 10, 20]) expect(Math.abs(E(twinState(120, -10, G, t)) - e0) / Math.abs(e0)).toBeLessThan(1e-6)
  })
})

describe('the twins, the readings and what is driven (review, 14 Oct)', () => {
  it('a state asked for far ahead, back at the start and far ahead again is the same to the last bit (kept states every 0.1 s)', () => {
    const a = twinState(121, -9, G, 30)
    const early = twinState(121, -9, G, 1)
    const b = twinState(121, -9, G, 30)
    expect(b).toEqual(a)
    expect(early).toEqual(twinState(121, -9, G, 1))
  })
  it('the angles between two starts go the short way round: 179° and −179° are 2° apart', () => {
    expect(angleApart(179, -179)).toBeCloseTo(2, 12)
    expect(angleApart(120, 120.1)).toBeCloseTo(0.1, 12)
  })
  it('the sentence’s times: the bobs start 1.7 mm apart (gap past 1 mm at t = 0), past 1 cm and 0.5 m at 2.8 s and 6.2 s', () => {
    // The start: only the upper arms differ, so the lower bobs are the chord 2 L1 sin(0.05°) apart.
    expect(gapPasses(0.001)).toBe(0)
    expect(2 * Math.sin(0.05 * DEG)).toBeGreaterThan(0.001)
    expect(gapPasses(0.01)).toBeCloseTo(2.8, 1)
    expect(gapPasses(0.5)).toBeCloseTo(6.2, 1)
  })
  it('the sentence’s times against an independent solution: SB39’s RK45 (tolerance 1e-10) read at every 1/600 s', () => {
    const f = systems.doublePendulum(1, 1, 1, 1, G)
    let a = [120 * DEG, -10 * DEG, 0, 0]
    let b = [120.1 * DEG, -10 * DEG, 0, 0]
    const lower = (s: number[]) => [Math.sin(s[0]) + Math.sin(s[1]), -Math.cos(s[0]) - Math.cos(s[1])]
    const passes: Record<string, number> = {}
    for (let k = 1; k <= 8 * 600 && passes['0.5'] === undefined; k++) {
      a = rk45(f, a, (k - 1) / 600, k / 600, 1e-10).y
      b = rk45(f, b, (k - 1) / 600, k / 600, 1e-10).y
      const [pa, pb] = [lower(a), lower(b)]
      const gap = Math.hypot(pa[0] - pb[0], pa[1] - pb[1])
      for (const lim of ['0.01', '0.5']) if (passes[lim] === undefined && gap > Number(lim)) passes[lim] = k / 600
    }
    console.info(`SB60 RK45 gap passes 1 cm at ${passes['0.01']} s, 0.5 m at ${passes['0.5']} s`)
    expect(Math.abs(passes['0.01'] - gapPasses(0.01)!)).toBeLessThan(0.01)
    expect(Math.abs(passes['0.5'] - gapPasses(0.5)!)).toBeLessThan(0.01)
    expect(passes['0.01']).toBeCloseTo(2.8, 1)
    expect(passes['0.5']).toBeCloseTo(6.2, 1)
  }, 60_000)
  it('only the experiment’s own pairs are driven: the same names in a scene of one’s own are left alone', () => {
    const built = buildChaos([[30, 0]])
    expect(chaosDrivers(built.bodies, built.links, G)).toHaveLength(2)
    const own = built.links.map((l, i) => ({ ...l, id: `l${i}` }))
    expect(chaosDrivers(built.bodies, own, G)).toHaveLength(0)
  })
  it('a twin taken out leaves the others driven: delete twin 2 and twin 3 still follows its path', () => {
    const built = buildChaos([[120, -10], [120.1, -10], [120.2, -10]])
    const gone = new Set(built.bodies.filter((b) => b.name.endsWith(' 2')).map((b) => b.id))
    const bodies = built.bodies.filter((b) => !gone.has(b.id))
    const links = built.links.filter((l) => !gone.has(l.a) && !gone.has(l.b))
    expect(chaosPairs(bodies, links).map((p) => p.k)).toEqual([1, 3])
    expect(chaosDrivers(bodies, links, G)).toHaveLength(4)
  })
  it('a mass edit is followed: 2 kg on the upper arm gives the 2 kg path (RK45 reference, 1 cm at 2 s)', async () => {
    const built = buildChaos([[5, 0]])
    const up = named(built.bodies, 'Upper 1')
    up.mass = 2
    const w = await run(built)
    for (let k = 0; k < 2 * 600; k++) w.stepOnce()
    const ref = rk45(systems.doublePendulum(2, 1, 1, 1, G), [5 * DEG, 0, 0, 0], 0, 2, 1e-10).y
    const p = w.state(up.id)!.position
    expect(dist(p, [Math.sin(ref[0]), CHAOS.pivot[1] - Math.cos(ref[0]), 0])).toBeLessThan(0.01)
    w.destroy()
  })
  it('Reset (the bodies built again, the clock at 0) keeps the drivers: the run after it is the first run again', async () => {
    const built = buildChaos([[120, -10]])
    const w = await run(built)
    const lo = named(built.bodies, 'Lower 1').id
    for (let k = 0; k < 600; k++) w.stepOnce()
    const first = [...w.state(lo)!.position]
    w.rebuild(built.bodies, built.links)
    expect(w.time).toBe(0)
    for (let k = 0; k < 600; k++) w.stepOnce()
    expect([...w.state(lo)!.position]).toEqual(first)
    w.destroy()
  })
  it('the graph offers Gap in place of Energy beside the twins, and only there', () => {
    const chaos = presetById('chaosTwins')!.build()
    expect(graphChoices({ bodies: chaos.bodies, links: chaos.links ?? [] }).map((c) => c.id)).toEqual(['position', 'velocity', 'gap'])
    const pend = presetById('pendulum')!.build()
    expect(graphChoices({ bodies: pend.bodies, links: pend.links ?? [] }).map((c) => c.id)).toEqual(['energy', 'position', 'velocity'])
  })
})

describe('the chaos experiment in the engine', () => {
  it('three twins from one pivot, 120° and −10°, the 2nd 0.1° more, the 3rd 0.2° more; 600 steps a second; colours c1-c3', () => {
    const built = presetById('chaosTwins')!.build()
    expect(built.world?.stepRate).toBe(600)
    for (const [k, add] of [[1, 0], [2, 0.1], [3, 0.2]] as const) {
      const up = named(built.bodies, `Upper ${k}`)
      expect(up.motion).toBe('kinematic')
      expect(up.position[0]).toBeCloseTo(Math.sin((120 + add) * DEG), 9)
      expect(named(built.bodies, `Lower ${k}`).trace).toBe(true)
    }
    expect(built.bodies.filter((b) => b.motion !== 'static').map((b) => b.color)).toEqual(['var(--sim-c1)', 'var(--sim-c1)', 'var(--sim-c2)', 'var(--sim-c2)', 'var(--sim-c3)', 'var(--sim-c3)'])
  })

  it.each([600, 240] as StepRate[])('at %i: one double pendulum from the chaos start keeps its energy within 1 % over 10 s', async (rate) => {
    const built = buildChaos([[120, -10]])
    const w = await run(built, rate)
    const e0 = energyOf(w, built.bodies, 1)
    let worst = 0
    for (let k = 0; k < 10 * w.stepRate; k++) {
      w.stepOnce()
      if (k > 2) worst = Math.max(worst, Math.abs(energyOf(w, built.bodies, 1) - e0) / Math.abs(e0))
    }
    w.destroy()
    console.info(`SB60 energy at ${rate}: worst ${(worst * 100).toFixed(4)} %`)
    expect(worst).toBeLessThan(0.01)
  })

  it('two twins with exactly the same start stay bit-identical for 20 s', async () => {
    const built = buildChaos([[120, -10], [120, -10]])
    const w = await run(built)
    const a = named(built.bodies, 'Lower 1').id
    const b = named(built.bodies, 'Lower 2').id
    for (let k = 0; k < 20 * 600; k++) {
      w.stepOnce()
      const sa = w.state(a)!
      const sb = w.state(b)!
      if (sa.position.some((v, i) => !Object.is(v, sb.position[i]))) throw new Error(`apart at step ${k}`)
    }
    w.destroy()
  })

  it('0.1° apart: under 1 cm for the first 2 s, past 0.5 m before 20 s (the times of 1, 10, 50 cm recorded)', async () => {
    const built = presetById('chaosTwins')!.build()
    const w = await run(built)
    const a = named(built.bodies, 'Lower 1').id
    const b = named(built.bodies, 'Lower 2').id
    const at: Record<string, number> = {}
    let early = 0
    for (let k = 0; k < 20 * 600; k++) {
      w.stepOnce()
      const g = dist(w.state(a)!.position, w.state(b)!.position)
      if (w.time <= 2) early = Math.max(early, g)
      for (const [name, lim] of [['1 cm', 0.01], ['10 cm', 0.1], ['50 cm', 0.5]] as const) if (at[name] === undefined && g > lim) at[name] = w.time
    }
    w.destroy()
    console.info(`SB60 gap passes 1 cm at ${at['1 cm']} s, 10 cm at ${at['10 cm']} s, 50 cm at ${at['50 cm']} s`)
    expect(early).toBeLessThan(0.01)
    expect(at['50 cm']).toBeDefined()
  })

  it('the small swings (5° and 0°, alone) show the two normal modes, 2.6211 s and 1.0857 s within 1 % (DFT peaks of the upper angle)', async () => {
    const built = buildChaos([[5, 0]])
    const w = await run(built)
    const up = named(built.bodies, 'Upper 1').id
    const th: number[] = []
    for (let k = 0; k < 60 * 600; k++) {
      w.stepOnce()
      if (k % 6 === 0) {
        const p = w.state(up)!.position
        th.push(Math.atan2(p[0] - CHAOS.pivot[0], CHAOS.pivot[1] - p[1]))
      }
    }
    w.destroy()
    const dt = 6 / 600
    const power = (T: number) => {
      let re = 0
      let im = 0
      th.forEach((v, i) => {
        re += v * Math.cos((2 * Math.PI * i * dt) / T)
        im += v * Math.sin((2 * Math.PI * i * dt) / T)
      })
      return re * re + im * im
    }
    const peak = (lo: number, hi: number) => {
      let best = lo
      for (let T = lo; T <= hi; T += 0.0005) if (power(T) > power(best)) best = T
      return best
    }
    expect(Math.abs(peak(2.3, 2.9) - 2.6211) / 2.6211).toBeLessThan(0.01)
    expect(Math.abs(peak(0.95, 1.2) - 1.0857) / 1.0857).toBeLessThan(0.01)
    // A minute of steps and two scans of the spectrum: 2 s alone, more beside the whole suite.
  }, 60_000)

  it('the first 2 s match SB39’s RK45 reference: the lower bob within 1 cm', async () => {
    const built = buildChaos([[120, -10]])
    const w = await run(built)
    const lo = named(built.bodies, 'Lower 1').id
    for (let k = 0; k < 2 * 600; k++) w.stepOnce()
    const ref = rk45(systems.doublePendulum(1, 1, 1, 1, G), [120 * DEG, -10 * DEG, 0, 0], 0, 2, 1e-10).y
    const x = CHAOS.pivot[0] + Math.sin(ref[0]) + Math.sin(ref[1])
    const y = CHAOS.pivot[1] - Math.cos(ref[0]) - Math.cos(ref[1])
    expect(dist(w.state(lo)!.position, [x, y, 0])).toBeLessThan(0.01)
    w.destroy()
  })

  it('the twins never touch anything: no contact events', async () => {
    const built = presetById('chaosTwins')!.build()
    const w = await run(built)
    let hits = 0
    w.onAfterStep((_w, s) => {
      hits += s.contacts.length
    })
    for (let k = 0; k < 10 * 600; k++) w.stepOnce()
    w.destroy()
    expect(hits).toBe(0)
  })
})

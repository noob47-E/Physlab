// SB0: the clock at every step rate. One step rate (60, 120, 240 or 600 steps a second) replaces
// the old Accuracy row; the clock is an integer step count over the rate, so it reads exact times;
// readings stay on the 0.1 s grid; a change of rate part-way keeps the clock where it was; and the
// after-step hook sees every engine step once, in order, without being able to change anything.

import { beforeAll, describe, expect, it } from 'vitest'
import { SimWorld } from '../src/renderer/src/sim/world'
import { DEFAULT_STEP_RATE, DEFAULT_WORLD, rateOf, STEP_RATES, type BodyDef, type StepRate, type WorldSettings } from '../src/renderer/src/sim/types'
import { stepButtonTitle, stepRateTitle } from '../src/renderer/src/sim/stepping'

let n = 0
function body(over: Partial<BodyDef> = {}): BodyDef {
  return {
    id: `c${++n}`,
    name: `C${n}`,
    shape: 'sphere',
    size: [0.1, 0.1, 0.1],
    position: [0, 10, 0],
    rotation: [0, 0, 0],
    velocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    motion: 'dynamic',
    material: 'steel',
    massMode: 'mass',
    mass: 1,
    restitution: 0,
    friction: 0,
    linearDamping: 0,
    angularDamping: 0,
    color: '#fff',
    ...over
  }
}

async function world(over: Partial<WorldSettings> = {}): Promise<SimWorld> {
  return SimWorld.create({ ...DEFAULT_WORLD, airDensity: 0, allowSleeping: false, ...over })
}

beforeAll(async () => {
  ;(await world()).destroy()
}, 30_000)

describe('rateOf: the step rate a world asks for', () => {
  it('is 240 by default (owner decision D3), and DEFAULT_WORLD asks for it', () => {
    expect(DEFAULT_STEP_RATE).toBe(240)
    expect(DEFAULT_WORLD.stepRate).toBe(240)
    expect(rateOf(DEFAULT_WORLD)).toBe(240)
    expect(rateOf({})).toBe(240)
    expect('collisionSteps' in DEFAULT_WORLD).toBe(false)
  })

  it('takes a valid stepRate as it is', () => {
    for (const r of STEP_RATES) expect(rateOf({ stepRate: r })).toBe(r)
  })

  it('reads an old collisionSteps n as 60·n rounded up to the next rate: 1→60, 2→120, 3–4→240, 5–10→600', () => {
    const want: Record<number, StepRate> = { 1: 60, 2: 120, 3: 240, 4: 240, 5: 600, 6: 600, 8: 600, 10: 600 }
    for (const [steps, rate] of Object.entries(want)) expect(rateOf({ collisionSteps: Number(steps) })).toBe(rate)
  })

  it('falls back to the default for a rate it does not run, and for nonsense', () => {
    expect(rateOf({ stepRate: 100 as StepRate })).toBe(240)
    expect(rateOf({ collisionSteps: 0 })).toBe(240)
    expect(rateOf({ collisionSteps: Number.NaN })).toBe(240)
    expect(rateOf({ stepRate: 100 as StepRate, collisionSteps: 1 })).toBe(60)
  })

  it('a preset that still says collisionSteps 8 over the default world runs at 600 (the cradle, until SB23 rewrites it)', () => {
    expect(rateOf({ ...DEFAULT_WORLD, collisionSteps: 8 })).toBe(600)
  })
})

describe('the clock is the step count over the rate', () => {
  for (const rate of STEP_RATES) {
    it(`at ${rate}: after ${2 * rate} single steps time === 2 and stepIndex === ${2 * rate}; readings land on k/10 exactly`, async () => {
      const w = await world({ stepRate: rate })
      w.addBody(body())
      expect(w.stepRate).toBe(rate)
      expect(w.time).toBe(0)
      expect(w.stepIndex).toBe(0)
      const readings: number[] = []
      for (let i = 0; i < 2 * rate; i++) readings.push(...w.stepOnce().samples.map((s) => s.t))
      expect(w.time).toBe(2)
      expect(w.stepIndex).toBe(2 * rate)
      // The t = 0 reading, then one every rate/10 steps, each === k/10.
      expect(readings).toEqual(Array.from({ length: 21 }, (_, k) => k / 10))
      w.destroy()
    })
  }

  it('a step at time scale 0.1 is still exactly one engine step of 1/rate', async () => {
    for (const rate of STEP_RATES) {
      const w = await world({ stepRate: rate, timeScale: 0.1 })
      w.addBody(body())
      w.stepOnce()
      expect(w.stepIndex).toBe(1)
      expect(w.time).toBe(1 / rate)
      w.stepOnce()
      expect(w.time).toBe(2 / rate)
      w.destroy()
    }
  })

  it('step(realDt) gathers real time × time scale, and takes rate × that many steps', async () => {
    const w = await world({ stepRate: 240 })
    w.addBody(body())
    for (let i = 0; i < 60; i++) w.step(1 / 60)
    expect(w.stepIndex).toBe(240)
    expect(w.time).toBe(1)
    w.setWorldSettings({ timeScale: 0.1 })
    for (let i = 0; i < 60; i++) w.step(1 / 60)
    expect(w.stepIndex).toBe(264)
    w.destroy()
  })

  it('a slow frame is clamped to 0.05 s of simulated time at every rate', async () => {
    for (const rate of STEP_RATES) {
      const w = await world({ stepRate: rate })
      w.addBody(body())
      w.step(2)
      expect(w.stepIndex).toBe(rate / 20)
      w.destroy()
    }
  })

  it('a change of rate part-way keeps the clock where it was, and readings stay on the 0.1 s grid', async () => {
    const w = await world({ stepRate: 60 })
    w.addBody(body())
    const t: number[] = []
    for (let i = 0; i < 30; i++) t.push(...w.stepOnce().samples.map((s) => s.t))
    expect(w.time).toBe(0.5)
    w.setWorldSettings({ stepRate: 600 })
    expect(w.stepRate).toBe(600)
    expect(w.time).toBe(0.5)
    expect(w.stepIndex).toBe(30)
    w.stepOnce()
    expect(w.time).toBeCloseTo(0.5 + 1 / 600, 12)
    for (let i = 1; i < 300; i++) t.push(...w.stepOnce().samples.map((s) => s.t))
    expect(w.time).toBeCloseTo(1, 12)
    expect(t.map((x) => Math.round(x * 1e9) / 1e9)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1])
    w.destroy()
  })

  it('readings stay on the 0.1 s grid after a change of rate off it (one step at 60, then 600)', async () => {
    const w = await world({ stepRate: 60 })
    w.addBody(body())
    const t: number[] = []
    t.push(...w.stepOnce().samples.map((s) => s.t))
    w.setWorldSettings({ stepRate: 600 })
    for (let i = 0; i < 590; i++) t.push(...w.stepOnce().samples.map((s) => s.t))
    expect(w.time).toBe(1)
    expect(t).toEqual(Array.from({ length: 11 }, (_, k) => k / 10))
    // And from a place the new rate cannot land on the grid from (1/240 s, then 60 a second): a
    // reading on the first step past each 0.1 s, still ten a second.
    const v = await world({ stepRate: 240 })
    v.addBody(body())
    const u: number[] = []
    u.push(...v.stepOnce().samples.map((s) => s.t))
    v.setWorldSettings({ stepRate: 60 })
    for (let i = 0; i < 60; i++) u.push(...v.stepOnce().samples.map((s) => s.t))
    expect(u).toHaveLength(11)
    u.slice(1).forEach((x, k) => expect(x - (k + 1) / 10).toBeGreaterThanOrEqual(0))
    u.slice(1).forEach((x, k) => expect(x - (k + 1) / 10).toBeLessThan(1 / 60))
    v.destroy()
    w.destroy()
  })

  it('Reset (clear) puts the clock back to 0 at the current rate', async () => {
    const w = await world({ stepRate: 120 })
    const b = body()
    w.addBody(b)
    for (let i = 0; i < 50; i++) w.stepOnce()
    w.setWorldSettings({ stepRate: 600 })
    for (let i = 0; i < 50; i++) w.stepOnce()
    w.rebuild([b], [])
    expect(w.time).toBe(0)
    expect(w.stepIndex).toBe(0)
    for (let i = 0; i < 600; i++) w.stepOnce()
    expect(w.time).toBe(1)
    w.destroy()
  })

  it('a rebuild that keeps the run (preserve) keeps the clock, its rate change included', async () => {
    const w = await world({ stepRate: 60 })
    const b = body()
    w.addBody(b)
    for (let i = 0; i < 6; i++) w.stepOnce()
    w.setWorldSettings({ stepRate: 240 })
    for (let i = 0; i < 24; i++) w.stepOnce()
    expect(w.time).toBeCloseTo(0.2, 12)
    w.rebuild(undefined, undefined, true)
    expect(w.time).toBeCloseTo(0.2, 12)
    expect(w.stepIndex).toBe(30)
    w.destroy()
  })
})

describe('the after-step hook', () => {
  it('is called once after every engine step, in order, with the step, the time and Δt; unsubscribing stops it', async () => {
    const w = await world({ stepRate: 120 })
    w.addBody(body())
    const seen: { step: number; time: number; dt: number }[] = []
    const off = w.onAfterStep((_w, s) => seen.push({ step: s.step, time: s.time, dt: s.dt }))
    for (let i = 0; i < 30; i++) w.step(1 / 60)
    expect(seen.map((s) => s.step)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1))
    expect(seen.every((s) => s.dt === 1 / 120)).toBe(true)
    expect(seen.every((s) => s.time === s.step / 120)).toBe(true)
    off()
    w.stepOnce()
    expect(seen).toHaveLength(60)
    w.destroy()
  })

  it('collects touches (resting contacts too) only while someone listens', async () => {
    const w = await world({ stepRate: 240 })
    const ground = body({ shape: 'box', size: [20, 1, 20], position: [0, -0.5, 0], motion: 'static' })
    const box = body({ shape: 'box', size: [0.5, 0.5, 0.5], position: [0, 0.25, 0] })
    w.rebuild([ground, box], [])
    let touches = 0
    let added = 0
    const off = w.onAfterStep((_w, s) => {
      touches += s.touches.length
      added += s.touches.filter((t) => t.added).length
      for (const t of s.touches) {
        expect([t.a, t.b].sort()).toEqual([ground.id, box.id].sort())
        expect(Math.abs(t.normal[1])).toBeCloseTo(1, 3)
      }
    })
    for (let i = 0; i < 48; i++) w.stepOnce()
    off()
    // The box rests on the floor: one touch a step, the first of them new.
    expect(touches).toBeGreaterThanOrEqual(47)
    expect(added).toBe(1)
    w.destroy()
  })

  it('cannot change the run: a world listened to steps exactly as one not listened to', async () => {
    const runOnce = async (listen: boolean) => {
      const w = await world({ stepRate: 240 })
      const ground = body({ shape: 'box', size: [20, 1, 20], position: [0, -0.5, 0], motion: 'static', restitution: 0.5 })
      const ball = body({ position: [0, 1, 0], velocity: [1, 0, 0], restitution: 0.5, friction: 0.4 })
      w.rebuild([ground, ball], [])
      const off = listen ? w.onAfterStep(() => undefined) : () => undefined
      for (let i = 0; i < 240; i++) w.stepOnce()
      off()
      const s = w.state(ball.id)!
      w.destroy()
      return [...s.position, ...s.velocity]
    }
    await runOnce(false)
    const a = await runOnce(false)
    const b = await runOnce(true)
    expect(b).toEqual(a)
  })

  it('ownForces: zeros for a body nothing pushes, null for one that does not exist', async () => {
    const w = await world({ stepRate: 240, gravity: 0 })
    const b = body()
    w.addBody(b)
    w.stepOnce()
    expect(w.ownForces(b.id)).toEqual({ drag: [0, 0, 0], push: [0, 0, 0], hand: [0, 0, 0], spring: [0, 0, 0], rollingTorque: [0, 0, 0] })
    expect(w.ownForces('nobody')).toBeNull()
    w.setActuators([{ bodyId: b.id, force: () => [0, 5, 0], from: 0, until: 10 }])
    w.stepOnce()
    expect(w.ownForces(b.id)!.push).toEqual([0, 5, 0])
    w.destroy()
  })
})

describe('what the "Steps a second" row and the Step button say', () => {
  it('each rate says the step’s own error in plain words, with the right numbers, and that it starts the run again', () => {
    const want: Record<StepRate, [string, string]> = { 60: ['0.8 J', '20.2 cm'], 120: ['0.4 J', '10.1 cm'], 240: ['0.2 J', '5.1 cm'], 600: ['0.08 J', '2 cm'] }
    for (const rate of STEP_RATES) {
      const t = stepRateTitle(rate, 9.81)
      expect(t).toContain(`At ${rate} steps a second, a free fall loses ${want[rate][0]} for every kg each second to the step, not to physics`)
      expect(t).toContain(`lands ${want[rate][1]} short`)
      expect(t).toContain('Choosing it pauses the run and starts it again from t = 0.')
      // No programming syntax and no long tails of digits on screen.
      expect(t).not.toMatch(/\^|\de[-+]|\d\.\d{4,}|NaN|undefined/)
    }
  })

  it('in free space (g = 0) a rate says only how long its step is', () => {
    expect(stepRateTitle(600, 0)).toBe('At 600 steps a second, each step is 1/600 s. Choosing it pauses the run and starts it again from t = 0.')
  })

  it('the Step button names one engine step at the rate in force', () => {
    expect(stepButtonTitle('240')).toBe('Step one engine step (1/240 s)')
  })
})

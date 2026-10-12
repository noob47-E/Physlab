// SB0, honest stepping: the numbers Idea #39 §2.3 measured, as the engine must now give them.
//
// Before SB0 the Sandbox stepped Jolt with Step(1/60, collisionSteps): PhysLab's own forces (drag,
// rolling, pushes, the hand) were worked out once per 1/60 s and held over Jolt's sub-steps, and a
// spring was Jolt's soft distance limit, which loses energy like a backward-Euler step (Spring on
// ice lost 41.9 % in 5 s). Now there is one step rate (60, 120, 240 or 600 steps a second), ONE
// engine step per PhysLab step, PhysLab's forces worked out before every one, and PhysLab's own
// Hooke spring wherever it is stable at the rate. Every expected number below is a closed form for
// the semi-implicit (symplectic) Euler step Jolt takes: v ← v + aΔt, then x ← x + vΔt.
//
// The scenes are replicas built here, not the presets (whose rates SB23 rewrites): vacuum unless a
// check says otherwise, no floor unless it says so, linear and angular damping 0.

import { beforeAll, describe, expect, it } from 'vitest'
import { SimWorld } from '../src/renderer/src/sim/world'
import { DEFAULT_WORLD, STEP_RATES, type AfterStep, type BodyDef, type Link, type StepRate, type WorldSettings } from '../src/renderer/src/sim/types'
import type { V3 } from '../src/renderer/src/math/vec'

const G = 9.81
let n = 0

function body(over: Partial<BodyDef> = {}): BodyDef {
  return {
    id: `h${++n}`,
    name: `H${n}`,
    shape: 'sphere',
    size: [0.1, 0.1, 0.1],
    position: [0, 0, 0],
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

const floor = (over: Partial<BodyDef> = {}) => body({ shape: 'box', size: [200, 1, 200], position: [0, -0.5, 0], motion: 'static', ...over })

function link(kind: Link['kind'], a: BodyDef, b: BodyDef, over: Partial<Link> = {}): Link {
  return { id: `l${++n}`, kind, a: a.id, b: b.id, length: 1, stiffness: 0, damping: 0, ...over }
}

async function world(rate: StepRate, over: Partial<WorldSettings> = {}): Promise<SimWorld> {
  return SimWorld.create({ ...DEFAULT_WORLD, airDensity: 0, allowSleeping: false, twoD: true, stepRate: rate, ...over })
}

const sq = (v: V3) => v[0] * v[0] + v[1] * v[1] + v[2] * v[2]
const rel = (got: number, want: number) => Math.abs(got - want) / Math.abs(want)

beforeAll(async () => {
  // The WASM engine loads once; the first world after it is a warm-up (see the determinism check).
  const w = await world(240)
  w.destroy()
}, 30_000)

describe('free fall: the energy a step loses is ½g²Δt per kg each second, and falls with the rate', () => {
  const expected: Record<StepRate, number> = { 60: 0.80197, 120: 0.40098, 240: 0.20049, 600: 0.0802 }
  for (const rate of STEP_RATES) {
    it(`at ${rate} steps a second, 1 kg from rest for 1 s is short by ${expected[rate]} J (± 1 %)`, async () => {
      const w = await world(rate)
      const b = body()
      w.addBody(b)
      for (let i = 0; i < rate; i++) w.stepOnce()
      const s = w.state(b.id)!
      const energy = 0.5 * sq(s.velocity) + G * s.position[1]
      expect(w.time).toBe(1)
      expect(rel(-energy, expected[rate])).toBeLessThan(0.01)
      // And it IS the step: ½g²Δt exactly, the closed form for v ← v − gΔt, y ← y + vΔt.
      expect(rel(-energy, (0.5 * G * G) / rate)).toBeLessThan(0.01)
      w.destroy()
    })
  }
})

describe('a launch lands v₀ₓ·Δt short of the formula: the step, nothing else', () => {
  // 0.5 kg at 14 m/s, 60°, back to its start height: x = v₀ₓ(2v₀ᵧ/g − Δt). The formula is 17.3029 m.
  const expected: Record<StepRate, number> = { 60: 17.1862, 120: 17.2445, 240: 17.2737, 600: 17.2912 }
  for (const rate of STEP_RATES) {
    it(`at ${rate} steps a second it lands at ${expected[rate]} m (± 1 mm)`, async () => {
      const w = await world(rate)
      const angle = (60 * Math.PI) / 180
      const b = body({ mass: 0.5, velocity: [14 * Math.cos(angle), 14 * Math.sin(angle), 0] })
      w.addBody(b)
      let prev = w.state(b.id)!.position
      let landed: number | null = null
      for (let i = 0; i < rate * 4 && landed === null; i++) {
        w.stepOnce()
        const p = w.state(b.id)!.position
        // Coming down through the start height: a straight line between the two steps.
        if (i > 1 && prev[1] >= 0 && p[1] < 0) landed = prev[0] + ((p[0] - prev[0]) * prev[1]) / (prev[1] - p[1])
        prev = p
      }
      expect(landed).not.toBeNull()
      expect(Math.abs(landed! - expected[rate])).toBeLessThan(0.001)
      expect(Math.abs(landed! - 14 * Math.cos(angle) * ((2 * 14 * Math.sin(angle)) / G - 1 / rate))).toBeLessThan(0.001)
      w.destroy()
    })
  }
})

/** The Spring-on-ice replica: a 2 kg block on ice, on a 50 N/m spring from a fixed post, stretched 0.6 m. */
function springIce() {
  const ground = floor({ friction: 0 })
  const post = body({ shape: 'box', size: [0.3, 0.5, 0.5], position: [-3, 0.25, 0], motion: 'static' })
  const block = body({ shape: 'box', size: [0.5, 0.5, 0.5], position: [0.6, 0.25, 0], mass: 2, friction: 0 })
  const spring = link('spring', post, block, { length: 3, stiffness: 50, damping: 0 })
  return { bodies: [ground, post, block], links: [spring], post, block, spring }
}

/** The oscillation's energy, ½kx² + ½mv², at every step for `periods` periods, and the block's x. */
async function runSpringIce(rate: StepRate, periods: number) {
  const scene = springIce()
  const w = await world(rate)
  w.rebuild(scene.bodies, scene.links)
  const energy: number[] = []
  const xs: number[] = []
  const read = () => {
    const p = w.state(scene.block.id)!
    const d = Math.hypot(p.position[0] + 3, p.position[1] - 0.25, p.position[2])
    energy.push(0.5 * 50 * (d - 3) ** 2 + 0.5 * 2 * sq(p.velocity))
    xs.push(p.position[0])
  }
  read()
  const T = (2 * Math.PI) / 5
  const steps = Math.ceil(periods * T * rate)
  for (let i = 0; i < steps; i++) {
    w.stepOnce()
    read()
  }
  const model = w.springModel(scene.spring.id)
  w.destroy()
  return { energy, xs, model, T }
}

describe('PhysLab’s own Hooke spring: bounded energy, no drift, the right period', () => {
  for (const rate of STEP_RATES) {
    const band = (1.1 * (5 / rate)) / 2
    it(`at ${rate} steps a second the energy stays within ±${Math.round(band * 10000) / 100} % of 9.00 J for ten periods and never grows`, async () => {
      const { energy, model, T } = await runSpringIce(rate, 10)
      expect(model).toBe('own')
      // The block's place is a float32 in the engine: 9 J to a millionth.
      expect(energy[0]).toBeCloseTo(9, 5)
      const worst = Math.max(...energy.map((e) => Math.abs(e - 9))) / 9
      expect(worst, `worst ${worst}`).toBeLessThanOrEqual(band)
      // The held-force pump grew it from 9.0 J to 33.1 J in ten swings: the mean over the last
      // period is the mean over the first, to 0.1 %.
      const per = Math.round(T * rate)
      const mean = (list: number[]) => list.reduce((s, v) => s + v, 0) / list.length
      const first = mean(energy.slice(0, per))
      const last = mean(energy.slice(-per))
      expect(rel(last, first)).toBeLessThan(0.001)
    })
  }

  it('at 600 steps a second the period is 2π√(m/k) = 1.2566 s (± 0.1 %), timed by the zero crossings', async () => {
    const { xs } = await runSpringIce(600, 10)
    const ups: number[] = []
    for (let i = 1; i < xs.length; i++) if (xs[i - 1] < 0 && xs[i] >= 0) ups.push((i - 1 + -xs[i - 1] / (xs[i] - xs[i - 1])) / 600)
    expect(ups.length).toBeGreaterThanOrEqual(9)
    const period = (ups[ups.length - 1] - ups[0]) / (ups.length - 1)
    expect(rel(period, 1.2566)).toBeLessThan(0.001)
  })
})

describe('the stability rule: an own spring where it is stable, Jolt’s soft spring where it is not', () => {
  it('1 kg on 10⁶ N/m at 240 is the engine’s; 1 kg on 50 N/m is PhysLab’s own; the decision follows a rate change', async () => {
    const w = await world(240)
    const post = body({ shape: 'box', size: [0.1, 0.1, 0.1], position: [0, 3, 0], motion: 'static' })
    const stiff = body({ position: [0, 2, 0] })
    const soft = body({ position: [2, 2, 0] })
    const post2 = body({ shape: 'box', size: [0.1, 0.1, 0.1], position: [2, 3, 0], motion: 'static' })
    const mid = body({ position: [4, 2, 0] })
    const post3 = body({ shape: 'box', size: [0.1, 0.1, 0.1], position: [4, 3, 0], motion: 'static' })
    const a = link('spring', post, stiff, { stiffness: 1e6 })
    const b = link('spring', post2, soft, { stiffness: 50 })
    // ω = √(10⁵) = 316 rad/s: unstable for an own spring at 240 (ω/rate = 1.3), stable at 600 (0.53).
    const c = link('spring', post3, mid, { stiffness: 1e5 })
    w.rebuild([post, stiff, soft, post2, mid, post3], [a, b, c])
    expect(w.springModel(a.id)).toBe('engine')
    expect(w.springModel(b.id)).toBe('own')
    expect(w.springModel(c.id)).toBe('engine')
    expect(w.springModel('no such link')).toBeNull()
    w.setWorldSettings({ stepRate: 600 })
    expect(w.springModel(c.id)).toBe('own')
    expect(w.springModel(a.id)).toBe('engine')
    w.setWorldSettings({ stepRate: 240 })
    expect(w.springModel(c.id)).toBe('engine')
    w.destroy()
  })

  it('two moving ends use the reduced mass: two 1 kg bodies on 3×10⁴ N/m are the engine’s at 240 and own at 600', async () => {
    const w = await world(240)
    const a = body({ position: [0, 0, 0] })
    const b = body({ position: [1, 0, 0] })
    const s = link('spring', a, b, { stiffness: 3e4 })
    w.rebuild([a, b], [s])
    // μ = ½ kg: ω = √(k/μ) = 245 rad/s, ω/240 = 1.02 → the engine's.
    expect(w.springModel(s.id)).toBe('engine')
    w.setWorldSettings({ stepRate: 600 })
    expect(w.springModel(s.id)).toBe('own')
    w.destroy()
  })
})

describe('a push is worked out before every step', () => {
  for (const rate of STEP_RATES) {
    it(`a 3 N push on 1 kg from 0 to 1 s gives 3.000 m/s at ${rate} steps a second`, async () => {
      const w = await world(rate, { gravity: 0 })
      const b = body()
      w.addBody(b)
      w.setActuators([{ bodyId: b.id, force: () => [3, 0, 0], from: 0, until: 1 }])
      for (let i = 0; i < rate * 1.5; i++) w.stepOnce()
      expect(Math.abs(w.state(b.id)!.velocity[0] - 3)).toBeLessThan(1e-4)
      w.destroy()
    })
  }

  for (const rate of [240, 600] as StepRate[]) {
    it(`a 2 N push for 1 s at ${rate}: the push's work is 2.00 J (± 0.5 %) and equals the kinetic energy`, async () => {
      const w = await world(rate, { gravity: 0 })
      const b = body()
      w.addBody(b)
      w.setActuators([{ bodyId: b.id, force: () => [2, 0, 0], from: 0, until: 1 }])
      let push = 0
      const off = w.onAfterStep((_w, s) => {
        push += s.work.push
      })
      for (let i = 0; i < rate; i++) w.stepOnce()
      off()
      const ke = 0.5 * sq(w.state(b.id)!.velocity)
      expect(rel(push, 2)).toBeLessThan(0.005)
      expect(rel(ke, 2)).toBeLessThan(0.005)
      expect(rel(push, ke)).toBeLessThan(0.005)
      w.destroy()
    })
  }
})

describe('air drag is worked out before every step', () => {
  it('a 1 kg sphere (r 0.1 m, Cd 0.47, ρ 1.225) at 10 m/s with g = 0 slows as v₀/(1 + kv₀t/m), and ΔKE = Σ drag work (1 %)', async () => {
    const w = await world(240, { gravity: 0, airDensity: 1.225 })
    const r = 0.1
    const A = Math.PI * r * r
    const b = body({ size: [r, r, r], velocity: [10, 0, 0], dragCd: 0.47, dragArea: A })
    w.addBody(b)
    let drag = 0
    const off = w.onAfterStep((_w, s) => {
      drag += s.work.drag
      expect(s.work.drag).toBeLessThanOrEqual(0)
    })
    for (let i = 0; i < 240; i++) w.stepOnce()
    off()
    const k = 0.5 * 1.225 * 0.47 * A
    const v = w.state(b.id)!.velocity[0]
    expect(rel(v, 10 / (1 + k * 10))).toBeLessThan(0.005)
    const dKE = 0.5 * v * v - 0.5 * 100
    expect(rel(drag, dKE)).toBeLessThan(0.01)
    // And the force it applied is there to read: against the motion, ½ρC_dAv².
    const f = w.ownForces(b.id)!
    expect(f.drag[0]).toBeLessThan(0)
    expect(rel(-f.drag[0], k * v * v)).toBeLessThan(0.01)
    w.destroy()
  })
})

describe('a rod pendulum loses less energy the finer the step', () => {
  it('1 kg bob, 1 m rod, 30°, no damping: over 20 s it loses > 15 % at 60 and < 4 % at 600, falling with the rate', async () => {
    const lost: number[] = []
    for (const rate of STEP_RATES) {
      const w = await world(rate)
      const th = (30 * Math.PI) / 180
      const anchor = body({ shape: 'box', size: [0.02, 0.02, 0.02], position: [0, 3, 0], motion: 'static' })
      const bob = body({ size: [0.05, 0.05, 0.05], position: [Math.sin(th), 3 - Math.cos(th), 0] })
      w.rebuild([anchor, bob], [link('rod', anchor, bob, { length: 1 })])
      const E = () => {
        const s = w.state(bob.id)!
        return 0.5 * sq(s.velocity) + G * (s.position[1] - 2)
      }
      const E0 = E()
      for (let i = 0; i < rate * 20; i++) w.stepOnce()
      lost.push((E0 - E()) / E0)
      w.destroy()
    }
    expect(lost[0]).toBeGreaterThan(0.15)
    expect(lost[3]).toBeLessThan(0.04)
    for (let i = 1; i < lost.length; i++) expect(lost[i]).toBeLessThan(lost[i - 1])
  }, 60_000)
})

describe('contacts carry the speeds before and after, and the coefficients the engine used', () => {
  it('a rubber ball (r 0.2, e 0.8) dropped with its underside 3 m up on concrete at 600: −7.672 in, +6.138 out, e 0.8, μ 0.894, at 0.7821 s', async () => {
    const w = await world(600)
    const ground = floor({ material: 'concrete', friction: 0.8, restitution: 0.2 })
    const ball = body({ size: [0.2, 0.2, 0.2], position: [0, 3.2, 0], mass: 0.5, material: 'rubber', friction: 1, restitution: 0.8 })
    w.rebuild([ground, ball], [])
    const seen: AfterStep[] = []
    const off = w.onAfterStep((_w, s) => {
      if (s.contacts.length) seen.push(s)
    })
    for (let i = 0; i < 600 && seen.length === 0; i++) w.stepOnce()
    off()
    expect(seen.length).toBe(1)
    const c = seen[0].contacts.find((e) => e.a === ball.id || e.b === ball.id)!
    expect(c).toBeDefined()
    const mine = c.a === ball.id
    const vBefore = mine ? c.vBeforeA : c.vBeforeB
    const vAfter = mine ? c.vAfterA : c.vAfterB
    expect(rel(vBefore[1], -7.672)).toBeLessThan(0.005)
    expect(rel(vAfter[1], 6.138)).toBeLessThan(0.01)
    // The approach speed along Jolt's normal (from a into b) is the speed in, positive: it was always 0
    // (both velocities read off one shared vector) and, under that, of the wrong sign.
    expect(rel(c.approachSpeed, 7.672)).toBeLessThan(0.005)
    expect(c.normal[1]).toBeCloseTo(mine ? -1 : 1, 3)
    expect(c.eUsed).toBe(0.8)
    expect(c.muUsed).toBeCloseTo(Math.sqrt(0.8), 9)
    expect(c.step).toBe(seen[0].step)
    // Its time is its step's: the clock at the end of the step it was found in.
    expect(c.t).toBe(c.step / 600)
    expect(Math.abs(c.step / 600 - 0.7821)).toBeLessThanOrEqual(1 / 600 + 1e-9)
    // The floor's side is the floor's: it does not move.
    expect(sq(mine ? c.vAfterB : c.vAfterA)).toBe(0)
    w.destroy()
  })
})

describe('the same scene twice gives the same floats', () => {
  async function run() {
    const w = await world(240)
    const ground = floor({ friction: 0.5, restitution: 0.5 })
    const ball = body({ size: [0.2, 0.2, 0.2], position: [0, 2, 0], velocity: [1, 0, 0], friction: 0.5, restitution: 0.5 })
    const post = body({ shape: 'box', size: [0.1, 0.1, 0.1], position: [3, 3, 0], motion: 'static' })
    const bob = body({ shape: 'box', size: [0.3, 0.3, 0.3], position: [3.4, 2, 0], mass: 2, friction: 0.5 })
    w.rebuild([ground, ball, post, bob], [link('spring', post, bob, { length: 0.8, stiffness: 40, damping: 0.3 })])
    const out: number[] = []
    for (let i = 0; i < 300; i++) {
      w.stepOnce()
      for (const id of [ball.id, bob.id]) {
        const s = w.state(id)!
        out.push(...s.position, ...s.rotation, ...s.velocity, ...s.angularVelocity)
      }
    }
    w.destroy()
    return out
  }

  it('two fresh worlds after a warm-up step identically for 300 steps', async () => {
    await run()
    const a = await run()
    const b = await run()
    expect(a).toEqual(b)
  })

  it('own springs leak no engine handles: 20 rebuilds end where they started', async () => {
    const w = await world(240)
    const post = body({ shape: 'box', size: [0.1, 0.1, 0.1], position: [0, 3, 0], motion: 'static' })
    const bob = body({ position: [0, 2, 0] })
    const other = body({ position: [1, 2, 0], mass: 3 })
    const links = [link('spring', post, bob, { stiffness: 50, damping: 0.4 }), link('spring', bob, other, { stiffness: 20 })]
    w.rebuild([post, bob, other], links)
    expect(links.map((l) => w.springModel(l.id))).toEqual(['own', 'own'])
    for (let i = 0; i < 10; i++) w.stepOnce()
    const base = w.handleCount
    for (let i = 0; i < 20; i++) {
      w.rebuild([post, bob, other], links)
      for (let k = 0; k < 5; k++) w.stepOnce()
      w.setWorldSettings({ stepRate: i % 2 ? 240 : 600 })
    }
    w.setWorldSettings({ stepRate: 240 })
    w.rebuild([post, bob, other], links)
    for (let i = 0; i < 10; i++) w.stepOnce()
    // An own spring is no Jolt object at all, so nothing is left behind however often it is laid.
    expect(w.handleCount).toBe(base)
    w.destroy()
  })
})

describe('a rope never pumps the load it is tied to', () => {
  // The rope's end link touches its load at the tie, and a slack rope folds onto it; with those
  // contacts solved every step against the pins, a crate on a rope shortened from 2.5 m to 1.5 m kept
  // rising (to 4.1 m in 6 s at 600 steps a second). The rope now never collides with what it ties.
  for (const rate of STEP_RATES) {
    it(`at ${rate} steps a second the Crane's crate hangs at 3.175 m on its shortened rope for 6 s`, async () => {
      const w = await world(rate, { allowSleeping: true })
      const beam = body({ shape: 'box', size: [0.15, 0.15, 0.15], position: [0, 5, 0], motion: 'static' })
      const crate = body({ shape: 'box', size: [0.5, 0.5, 0.5], position: [0, 2.175, 0], mass: 3, friction: 0.5 })
      const rope = link('rope', beam, crate, { length: 2.5, segments: 13 })
      w.rebuild([floor({ position: [0, -0.7, 0] }), beam, crate], [rope])
      for (let i = 0; i < 2 * rate; i++) w.stepOnce()
      expect(w.state(crate.id)!.position[1]).toBeCloseTo(2.175, 1)
      w.setLinks([{ ...rope, length: 1.5 }])
      let highest = -Infinity
      for (let i = 0; i < 6 * rate; i++) {
        w.stepOnce()
        if (i > rate) highest = Math.max(highest, w.state(crate.id)!.position[1])
      }
      // 5 (beam) − 0.075 (its half) − 1.5 (rope) − 0.25 (half the crate).
      expect(w.state(crate.id)!.position[1]).toBeCloseTo(3.175, 2)
      expect(highest).toBeLessThan(3.2)
      w.destroy()
    })
  }
})

describe('the work PhysLab’s own forces do, step by step', () => {
  it('a spring’s damper only ever takes energy out, and what it takes is what the oscillation loses (1 %)', async () => {
    const w = await world(240, { gravity: 0 })
    const post = body({ shape: 'box', size: [0.1, 0.1, 0.1], position: [-3, 0, 0], motion: 'static' })
    const block = body({ shape: 'box', size: [0.5, 0.5, 0.5], position: [0.6, 0, 0], mass: 2 })
    w.rebuild([post, block], [link('spring', post, block, { length: 3, stiffness: 50, damping: 2 })])
    const E = () => {
      const s = w.state(block.id)!
      return 0.5 * 50 * (Math.hypot(s.position[0] + 3, s.position[1], s.position[2]) - 3) ** 2 + 0.5 * 2 * sq(s.velocity)
    }
    const E0 = E()
    let damper = 0
    const steps: number[] = []
    let others = 0
    const off = w.onAfterStep((_w, s) => {
      steps.push(s.work.damper)
      // The Hooke part is ½kx², never work; nothing else pushes.
      others += Math.abs(s.work.push) + Math.abs(s.work.drag) + Math.abs(s.work.hand) + Math.abs(s.work.rolling)
      damper += s.work.damper
    })
    for (let i = 0; i < 240 * 4; i++) w.stepOnce()
    off()
    expect(others).toBe(0)
    // A step at a turning point may read a hair above 0 (the force is set by the speed at the start
    // of the step, the motion by its end); a thousandth of the largest step's work at most.
    const most = Math.max(...steps.map(Math.abs))
    expect(Math.max(...steps)).toBeLessThan(most * 1e-3)
    // Over each tenth of a second it only ever takes energy out.
    for (let i = 0; i + 24 <= steps.length; i += 24) expect(steps.slice(i, i + 24).reduce((a, b) => a + b, 0)).toBeLessThan(0)
    expect(rel(damper, E() - E0)).toBeLessThan(0.01)
    w.destroy()
  })

  it('rolling resistance only ever takes energy out', async () => {
    const w = await world(240)
    const ground = floor({ friction: 0.8, material: 'concrete' })
    const ball = body({ size: [0.2, 0.2, 0.2], position: [0, 0.2, 0], velocity: [3, 0, 0], angularVelocity: [0, 0, -15], friction: 0.8, material: 'rubber', rolling: 0.05 })
    w.rebuild([ground, ball], [])
    let rolling = 0
    const off = w.onAfterStep((_w, s) => {
      expect(s.work.rolling).toBeLessThanOrEqual(0)
      rolling += s.work.rolling
    })
    for (let i = 0; i < 240; i++) w.stepOnce()
    off()
    expect(rolling).toBeLessThan(0)
    expect(w.ownForces(ball.id)!.rollingTorque[2]).toBeGreaterThan(0)
    w.destroy()
  })
})

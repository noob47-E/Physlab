// Checks the engine against the formulas. If these pass, the numbers a student reads are real.

import { beforeAll, describe, expect, it } from 'vitest'
import { SimWorld } from '../src/renderer/src/sim/world'
import type { BodyDef, BodyState, WorldSettings } from '../src/renderer/src/sim/types'
import { energyOf, systemEnergy, systemMomentum } from '../src/renderer/src/sim/energy'
import { launchVelocity, PRESETS } from '../src/renderer/src/sim/presets'
import type { V3 } from '../src/renderer/src/math/vec'

const G = 9.81
let n = 0

function body(over: Partial<BodyDef> = {}): BodyDef {
  return {
    id: `b${++n}`,
    name: `B${n}`,
    shape: 'sphere',
    size: [0.2, 0.2, 0.2],
    position: [0, 1, 0],
    rotation: [0, 0, 0],
    velocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    motion: 'dynamic',
    material: 'steel',
    massMode: 'mass',
    mass: 1,
    restitution: 0.5,
    friction: 0.5,
    linearDamping: 0,
    angularDamping: 0,
    color: '#fff',
    ...over
  }
}

const ground = (over: Partial<BodyDef> = {}) =>
  body({ shape: 'box', size: [50, 1, 50], position: [0, -0.5, 0], motion: 'static', restitution: 0.5, ...over })

/** Runs the world for `seconds` and hands back the world so the caller can read it. */
function run(world: SimWorld, seconds: number) {
  const dt = 1 / 60
  for (let t = 0; t < seconds - 1e-9; t += dt) world.step(dt)
}

async function makeWorld(settings: Partial<WorldSettings> = {}) {
  return SimWorld.create({ airDensity: 0, collisionSteps: 4, allowSleeping: false, twoD: true, ...settings })
}

const speed = (v: V3) => Math.hypot(v[0], v[1], v[2])

describe('the sandbox engine agrees with the formulas', () => {
  beforeAll(async () => {
    // Loading the WASM engine once can take a moment.
    await makeWorld()
  }, 30_000)

  it('free fall covers ½gt² in one second', async () => {
    const world = await makeWorld()
    const b = body({ position: [0, 100, 0] })
    world.addBody(b)
    run(world, 1)
    const s = world.state(b.id)!
    const fallen = 100 - s.position[1]
    expect(fallen).toBeGreaterThan(0.99 * 0.5 * G)
    expect(fallen).toBeLessThan(1.01 * 0.5 * G)
    expect(-s.velocity[1]).toBeCloseTo(G, 0)
    world.destroy()
  })

  it('an elastic head-on hit between equal masses swaps the velocities', async () => {
    const world = await makeWorld({ gravity: 0 })
    const a = body({ position: [-2, 0, 0], velocity: [4, 0, 0], restitution: 1, friction: 0, size: [0.5, 0, 0] })
    const b = body({ position: [2, 0, 0], velocity: [0, 0, 0], restitution: 1, friction: 0, size: [0.5, 0, 0] })
    world.addBody(a)
    world.addBody(b)
    run(world, 3)
    const sa = world.state(a.id)!
    const sb = world.state(b.id)!
    // Momentum is conserved and the moving ball hands its speed over.
    const p = sa.mass * sa.velocity[0] + sb.mass * sb.velocity[0]
    expect(p).toBeCloseTo(4, 1)
    expect(sb.velocity[0]).toBeGreaterThan(3.8)
    expect(Math.abs(sa.velocity[0])).toBeLessThan(0.3)
    const keBefore = 0.5 * 1 * 16
    const keAfter = 0.5 * sa.mass * sa.velocity[0] ** 2 + 0.5 * sb.mass * sb.velocity[0] ** 2
    expect(Math.abs(keAfter - keBefore) / keBefore).toBeLessThan(0.05)
    world.destroy()
  })

  it('a perfectly inelastic hit keeps momentum but loses energy', async () => {
    const world = await makeWorld({ gravity: 0 })
    const a = body({ position: [-2, 0, 0], velocity: [6, 0, 0], restitution: 0, friction: 0, mass: 2, size: [0.5, 0, 0] })
    const b = body({ position: [2, 0, 0], restitution: 0, friction: 0, mass: 4, size: [0.5, 0, 0] })
    world.addBody(a)
    world.addBody(b)
    run(world, 3)
    const sa = world.state(a.id)!
    const sb = world.state(b.id)!
    // m1u1 = (m1+m2)v  ->  v = 12/6 = 2 m/s
    expect(sa.velocity[0]).toBeGreaterThan(1.7)
    expect(sa.velocity[0]).toBeLessThan(2.3)
    expect(sb.velocity[0]).toBeGreaterThan(1.7)
    expect(sb.velocity[0]).toBeLessThan(2.3)
    const keBefore = 0.5 * 2 * 36
    const keAfter = 0.5 * 2 * sa.velocity[0] ** 2 + 0.5 * 4 * sb.velocity[0] ** 2
    expect(keAfter).toBeLessThan(0.6 * keBefore)
    world.destroy()
  })

  it('bounciness e means the ball comes back to e² of its height', async () => {
    const world = await makeWorld()
    world.addBody(ground({ restitution: 0.8, friction: 0.5 }))
    const ball = body({ position: [0, 2, 0], restitution: 0.8, friction: 0.2, size: [0.15, 0, 0] })
    world.addBody(ball)
    let top = 0
    const dt = 1 / 60
    let bounced = false
    for (let t = 0; t < 4; t += dt) {
      world.step(dt)
      const s = world.state(ball.id)!
      if (!bounced && s.velocity[1] > 0.5) bounced = true
      if (bounced && s.velocity[1] > 0) top = Math.max(top, s.position[1])
    }
    // Dropped from 2 m with e = 0.8: back to about 0.64 x 2 = 1.28 m (minus the radius).
    expect(top).toBeGreaterThan(0.9)
    expect(top).toBeLessThan(1.5)
    world.destroy()
  })

  it('a block holds on a gentle slope and slides on a steep one', async () => {
    for (const [angle, shouldSlide] of [
      [10, false],
      [35, true]
    ] as [number, boolean][]) {
      const world = await makeWorld()
      const mu = 0.3
      world.addBody(
        ground({ shape: 'box', size: [20, 1, 20], position: [0, -0.5, 0], rotation: [0, 0, angle], friction: mu, restitution: 0 })
      )
      const block = body({
        shape: 'box',
        size: [0.6, 0.3, 0.6],
        position: [0, 0.25, 0],
        rotation: [0, 0, angle],
        friction: mu,
        restitution: 0,
        mass: 2
      })
      world.addBody(block)
      run(world, 1.5)
      const s = world.state(block.id)!
      const moved = speed(s.velocity)
      if (shouldSlide) expect(moved).toBeGreaterThan(1)
      else expect(moved).toBeLessThan(0.25)
      world.destroy()
    }
  })

  it('air drag brings a falling ball to its terminal speed', async () => {
    const rho = 1.225
    const world = await makeWorld({ airDensity: rho })
    const r = 0.1
    const mass = 0.5
    const cd = 0.47
    const area = Math.PI * r * r
    const terminal = Math.sqrt((2 * mass * G) / (rho * cd * area))
    const ball = body({ position: [0, 500, 0], size: [r, 0, 0], mass, dragCd: cd, dragArea: area })
    world.addBody(ball)
    run(world, 20)
    const v = -world.state(ball.id)!.velocity[1]
    expect(v).toBeGreaterThan(0.97 * terminal)
    expect(v).toBeLessThan(1.03 * terminal)
    world.destroy()
  })

  it('records the collisions it solves', async () => {
    const world = await makeWorld({ gravity: 0 })
    const a = body({ position: [-1, 0, 0], velocity: [5, 0, 0], size: [0.3, 0, 0] })
    const b = body({ position: [1, 0, 0], size: [0.3, 0, 0] })
    world.addBody(a)
    world.addBody(b)
    const seen: string[] = []
    const dt = 1 / 60
    for (let t = 0; t < 2; t += dt) {
      const { contacts } = world.step(dt)
      for (const c of contacts) seen.push(`${c.a}-${c.b}`)
    }
    expect(seen.length).toBeGreaterThan(0)
    expect(seen[0].split('-').sort().join('-')).toBe([a.id, b.id].sort().join('-'))
    world.destroy()
  })

  it('a grabbed object follows the hand and keeps the speed when let go', async () => {
    const world = await makeWorld({ gravity: 0 })
    const b = body({ position: [0, 0, 0], size: [0.3, 0, 0] })
    world.addBody(b)
    // Hold it and move the hand to x = 2.
    world.grab(b.id, [2, 0, 0])
    run(world, 1)
    const held = world.state(b.id)!
    expect(held.position[0]).toBeGreaterThan(1.7)
    expect(held.position[0]).toBeLessThan(2.3)
    // Let go with a throw.
    world.release_()
    world.setVelocity(b.id, [5, 0, 0])
    run(world, 0.5)
    const thrown = world.state(b.id)!
    expect(thrown.velocity[0]).toBeGreaterThan(4.5)
    expect(thrown.position[0]).toBeGreaterThan(held.position[0] + 2)
  })

  it('holds everything in one plane in 2D mode', async () => {
    const world = await makeWorld({ twoD: true })
    const b = body({ position: [0, 3, 0], velocity: [2, 0, 3], angularVelocity: [4, 2, 0], size: [0.3, 0, 0] })
    world.addBody(b)
    run(world, 1)
    const s = world.state(b.id)!
    // The z push and the out-of-plane spin are simply not allowed.
    expect(Math.abs(s.position[2])).toBeLessThan(1e-6)
    expect(Math.abs(s.velocity[2])).toBeLessThan(1e-6)
  })

  it('keeps ramps solid after a rebuild', async () => {
    // A ramp is a convex hull: its shape lives only as long as someone holds a reference.
    // If the settings that built it are freed too early the ball falls straight through.
    const world = await makeWorld()
    const ramp = body({ shape: 'ramp', size: [2, 1, 2], position: [0, 0, 0], motion: 'static' })
    const ball = body({ shape: 'sphere', size: [0.2, 0.2, 0.2], position: [-0.9, 3, 0] })
    world.addBody(ramp)
    world.addBody(ball)
    for (let i = 0; i < 3; i++) world.rebuild()
    const hits: string[] = []
    const dt = 1 / 60
    for (let t = 0; t < 1.5; t += dt) for (const c of world.step(dt).contacts) hits.push(c.a + '-' + c.b)
    // A shape that died with its settings would let the ball fall through without ever touching.
    expect(hits.some((h) => h.includes(ramp.id) && h.includes(ball.id))).toBe(true)
  })

  it('cleans up after itself: no Jolt handles left behind', async () => {
    const world = await makeWorld()
    const base = world.handleCount
    const ids: string[] = []
    for (let i = 0; i < 50; i++) {
      const b = body({ position: [i * 0.5, 5, 0] })
      ids.push(b.id)
      world.addBody(b)
    }
    run(world, 0.5)
    for (const id of ids) world.removeBody(id)
    // Creating and deleting bodies must not grow the handle set.
    expect(world.handleCount).toBeLessThanOrEqual(base + 4)
  })

  it('cleans up after hull shapes too (ramps and cones)', async () => {
    const world = await makeWorld()
    const base = world.handleCount
    for (let i = 0; i < 30; i++) {
      const b = body({ shape: i % 2 ? 'ramp' : 'cone', size: [1, 1, 1], position: [i, 5, 0] })
      world.addBody(b)
      world.removeBody(b.id)
    }
    // The ShapeSettings behind every hull has to be freed once the body holds the shape.
    expect(world.handleCount).toBeLessThanOrEqual(base + 4)
  })
})

describe('heavy things behave as if they are heavy', () => {
  /** How far the cursor drags a body of this mass in half a second, from rest. */
  async function dragged(mass: number): Promise<number> {
    const world = await makeWorld({ gravity: 0 })
    const b = body({ mass, position: [0, 0, 0], shape: 'box', size: [0.4, 0.4, 0.4] })
    world.addBody(b)
    world.grab(b.id, [5, 0, 0])
    run(world, 0.5)
    const moved = world.state(b.id)!.position[0]
    world.release_()
    return moved
  }

  it('a heavy block barely shifts while a light one follows the cursor', async () => {
    const light = await dragged(1)
    const heavy = await dragged(2_000_000)
    // The spring used to scale its stiffness with mass, which cancelled the mass out of a = F/m:
    // two tonnes moved exactly as fast as a marble. With the pull capped, it cannot.
    expect(light).toBeGreaterThan(0.5)
    expect(heavy).toBeLessThan(light / 1000)
  })
})

describe('a rolling ball comes to rest', () => {
  /** Speed left after rolling across a floor of this material for four seconds. */
  async function rolled(floor: string, seconds: number): Promise<number> {
    const world = await makeWorld()
    world.addBody(ground({ material: floor, friction: 0.8 }))
    const ball = body({ shape: 'sphere', size: [0.2, 0.2, 0.2], position: [0, 0.2, 0], velocity: [3, 0, 0], material: 'steel' })
    world.addBody(ball)
    run(world, seconds)
    return speed(world.state(ball.id)!.velocity)
  }

  it('settles into a roll at 5/7 of the speed it was sliding at', async () => {
    // A ball set moving without spin slides until friction spins it up; angular momentum about
    // the contact point is conserved, so it ends up rolling at 5v/7. On ice, where rolling
    // resistance is negligible, that is what should be left a second later.
    expect(await rolled('ice', 1)).toBeCloseTo((5 / 7) * 3, 1)
  })

  it('keeps slowing on concrete and keeps going on ice', async () => {
    const onConcrete = await rolled('concrete', 8)
    const onIce = await rolled('ice', 8)
    expect(onConcrete).toBeLessThan(1.1)
    expect(onIce).toBeGreaterThan(1.9)
  })
})

describe('editing a body does not restart the run', () => {
  it('renaming a falling ball leaves every position alone', async () => {
    const world = await makeWorld()
    const b = body({ position: [0, 50, 0] })
    world.addBody(b)
    run(world, 0.8)
    const fallen = world.state(b.id)!.position[1]
    expect(fallen).toBeLessThan(49)

    const applied = world.updateBody({ ...b, name: 'Renamed', color: '#ff0000' })
    expect(applied).toBe(true)
    // The ball is still where it fell to, not back at the 50 m in its definition.
    expect(world.state(b.id)!.position[1]).toBeCloseTo(fallen, 6)
  })

  it('says no to a change Jolt cannot make in place', async () => {
    const world = await makeWorld()
    const b = body()
    world.addBody(b)
    expect(world.updateBody({ ...b, size: [0.5, 0.5, 0.5] })).toBe(false)
    expect(world.updateBody({ ...b, motion: 'static' })).toBe(false)
    expect(world.updateBody({ ...b, mass: 99 })).toBe(false)
  })
})

describe('what the simulation is worth in joules', () => {
  const state = (over: Partial<BodyState> = {}): BodyState => ({
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    velocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    mass: 1,
    asleep: false,
    ...over
  })

  it('gives ½mv² and mgh', () => {
    const e = energyOf(body({ mass: 2 }), state({ mass: 2, velocity: [3, 0, 0], position: [0, 10, 0] }), 9.81)
    expect(e.linear).toBeCloseTo(9, 9)
    expect(e.potential).toBeCloseTo(2 * 9.81 * 10, 9)
    expect(e.total).toBeCloseTo(9 + 196.2, 6)
  })

  it('counts the spin of a rolling ball as 2/7 of its kinetic energy', () => {
    // A rolling sphere has I = ⅖mr² and v = ωr, so ½Iω² is 1/5 mv² against ½mv² of travel:
    // two sevenths of the total. If this number is wrong, energy will appear not to conserve.
    const r = 0.2
    const v = 3
    const def = body({ shape: 'sphere', size: [r, r, r], mass: 1 })
    const e = energyOf(def, state({ velocity: [v, 0, 0], angularVelocity: [0, 0, v / r] }), 9.81)
    expect(e.rotational / e.kinetic).toBeCloseTo(2 / 7, 9)
  })

  it('gives a fixed body no energy at all, however high it sits', () => {
    const wall = body({ motion: 'static', position: [0, 5, 0] })
    expect(energyOf(wall, state({ position: [0, 5, 0] }), 9.81).total).toBe(0)
  })

  it('measures height from the floor, not from the origin', () => {
    const def = body({ mass: 1 })
    const high = energyOf(def, state({ position: [0, 2, 0] }), 10, 0).potential
    const same = energyOf(def, state({ position: [0, 3, 0] }), 10, 1).potential
    expect(high).toBeCloseTo(same, 9)
  })

  it('adds the scene up, and keeps the total steady through a fall', async () => {
    const world = await makeWorld()
    const def = body({ position: [0, 20, 0], mass: 1 })
    world.addBody(def)
    const at = (t: number) => {
      run(world, t)
      return systemEnergy([energyOf(def, world.state(def.id)!, G, 0)]).total
    }
    // A fixed-step integrator always leaks a little; what matters is that a student reading the
    // total sees it hold. Half a percent over a second is well under the precision anything is
    // displayed to.
    const start = at(0.01)
    const drift = (t: number) => Math.abs(at(t) - start) / start
    expect(drift(0.5)).toBeLessThan(0.005)
    expect(drift(1.0)).toBeLessThan(0.005)
  })

  it('keeps momentum through a head-on collision', async () => {
    const world = await makeWorld({ gravity: 0 })
    const left = body({ position: [-2, 0, 0], velocity: [4, 0, 0], mass: 1, restitution: 1 })
    const right = body({ position: [2, 0, 0], velocity: [-1, 0, 0], mass: 3, restitution: 1 })
    world.addBody(left)
    world.addBody(right)
    const before = systemMomentum([world.state(left.id)!, world.state(right.id)!])
    run(world, 2)
    const after = systemMomentum([world.state(left.id)!, world.state(right.id)!])
    expect(after[0]).toBeCloseTo(before[0], 2)
  })
})

describe('setting up an experiment', () => {
  it('splits a launch into the components a projectile question starts with', () => {
    const [vx, vy] = launchVelocity(20, 30)
    expect(vx).toBeCloseTo(20 * Math.cos(Math.PI / 6), 9)
    expect(vy).toBeCloseTo(10, 9)
    // Straight up has no sideways part, and straight along has no upward part.
    expect(launchVelocity(5, 90)[0]).toBeCloseTo(0, 9)
    expect(launchVelocity(5, 0)[1]).toBeCloseTo(0, 9)
  })

  it('gives every preset a floor, a name and something that moves', () => {
    for (const p of PRESETS) {
      const { bodies } = p.build()
      expect(bodies.some((b) => b.shape === 'ground')).toBe(true)
      expect(bodies.some((b) => b.motion === 'dynamic')).toBe(true)
      expect(new Set(bodies.map((b) => b.id)).size).toBe(bodies.length)
      expect(new Set(bodies.map((b) => b.name)).size).toBe(bodies.length)
    }
  })

  it('builds a fresh scene every time, so one experiment cannot disturb the next', () => {
    const first = PRESETS[0].build().bodies
    const second = PRESETS[0].build().bodies
    expect(first[0].id).not.toBe(second[0].id)
  })

  it('holds a body to one axis', async () => {
    const world = await makeWorld()
    world.addBody(ground())
    const trolley = body({ shape: 'box', size: [0.5, 0.5, 0.5], position: [0, 2, 0], velocity: [3, 0, 0], lock: 'x' })
    world.addBody(trolley)
    run(world, 1)
    const s = world.state(trolley.id)!
    // Gravity pulls, and it does not fall: the track holds it.
    expect(s.position[1]).toBeCloseTo(2, 3)
    expect(s.position[0]).toBeGreaterThan(2)
  })
})

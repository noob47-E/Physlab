// Checks the engine against the formulas. If these pass, the numbers a student reads are real.

import { beforeAll, describe, expect, it } from 'vitest'
import { SimWorld } from '../src/renderer/src/sim/world'
import type { BodyDef, WorldSettings } from '../src/renderer/src/sim/types'
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
})

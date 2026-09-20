// The Sandbox as the student uses it: Reset, grabbing, lifting, arranging, and the store behind
// the panel. Every case here was a reported complaint or a refuted claim in the 0.3.3 audit.

import { beforeAll, describe, expect, it } from 'vitest'
import { grabForceCap, SimWorld } from '../src/renderer/src/sim/world'
import { DEFAULT_SIZE, halfHeight, spawnAt, startingScene, useSandbox } from '../src/renderer/src/sim/store'
import { shapeVolume } from '../src/renderer/src/sim/materials'
import { DEFAULT_WORLD, type BodyDef, type WorldSettings } from '../src/renderer/src/sim/types'

const G = 9.81
let n = 0

function body(over: Partial<BodyDef> = {}): BodyDef {
  return {
    id: `b${++n}`,
    name: `B${n}`,
    shape: 'sphere',
    size: [0.2, 0.2, 0.2],
    position: [0, 0.2, 0],
    rotation: [0, 0, 0],
    velocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    motion: 'dynamic',
    material: 'steel',
    massMode: 'mass',
    mass: 1,
    restitution: 0.3,
    friction: 0.5,
    linearDamping: 0,
    angularDamping: 0,
    color: '#fff',
    ...over
  }
}

const ground = (over: Partial<BodyDef> = {}) => body({ shape: 'ground', size: [50, 1, 50], position: [0, -0.5, 0], motion: 'static', ...over })

function run(world: SimWorld, seconds: number) {
  const dt = 1 / 60
  for (let t = 0; t < seconds - 1e-9; t += dt) world.step(dt)
}

// The app's own defaults: air on, sleeping on, 2D. The old harness switched them all off, so
// the very settings a student runs with were the ones never tested.
const makeWorld = (settings: Partial<WorldSettings> = {}) => SimWorld.create({ ...DEFAULT_WORLD, ...settings })

describe('grabbing and lifting', () => {
  beforeAll(async () => {
    await makeWorld()
  }, 30_000)

  it('the hand can always beat the weight, so heavy things can be lifted', () => {
    expect(grabForceCap(0.5, G)).toBe(800)
    expect(grabForceCap(514, G)).toBeGreaterThan(514 * G)
  })

  it('a 500 kg ball rises when pulled upward', async () => {
    const world = await makeWorld({ airDensity: 0 })
    world.addBody(ground())
    const ball = body({ mass: 500, position: [0, 0.2, 0] })
    world.addBody(ball)
    world.grab(ball.id, [0, 3, 0])
    run(world, 2)
    expect(world.state(ball.id)!.position[1]).toBeGreaterThan(1)
    world.destroy()
  })

  it('a ball that has fallen asleep can still be grabbed', async () => {
    const world = await makeWorld({ airDensity: 0, allowSleeping: true })
    world.addBody(ground())
    const ball = body({ position: [0, 0.2, 0] })
    world.addBody(ball)
    run(world, 2)
    expect(world.state(ball.id)!.asleep).toBe(true)
    world.grab(ball.id, [3, 0.2, 0])
    run(world, 1)
    expect(world.state(ball.id)!.position[0]).toBeGreaterThan(0.5)
    world.destroy()
  })

  it('placing puts any body exactly there, at rest — the floor too', async () => {
    const world = await makeWorld({ airDensity: 0 })
    const floor = ground()
    world.addBody(floor)
    const ball = body({ position: [0, 5, 0], velocity: [4, 0, 0] })
    world.addBody(ball)
    run(world, 0.5)
    world.placeBody(ball.id, [2, 5, 0])
    const s = world.state(ball.id)!
    expect(s.position[0]).toBeCloseTo(2, 5)
    expect(s.position[1]).toBeCloseTo(5, 5)
    expect(Math.hypot(...s.velocity)).toBe(0)
    world.placeBody(floor.id, [3, -0.5, 0])
    expect(world.state(floor.id)!.position[0]).toBeCloseTo(3, 5)
    world.destroy()
  })

  it('typing a rotation or a spin reaches the running body', async () => {
    const world = await makeWorld({ gravity: 0, airDensity: 0 })
    const wall = ground({ shape: 'wall', size: [0.3, 2, 3], position: [0, 1, 0] })
    world.addBody(wall)
    const ball = body({ position: [0, 5, 0] })
    world.addBody(ball)
    expect(world.updateBody({ ...wall, rotation: [0, 0, 30] })).toBe(true)
    expect(Math.abs(world.state(wall.id)!.rotation[2])).toBeGreaterThan(0.2)
    expect(world.updateBody({ ...ball, angularVelocity: [0, 0, 4] })).toBe(true)
    expect(world.state(ball.id)!.angularVelocity[2]).toBeCloseTo(4, 3)
    world.destroy()
  })

  it('a structural edit to one body leaves the others mid-flight', async () => {
    const world = await makeWorld({ gravity: 0, airDensity: 0 })
    const a = body({ position: [0, 5, 0], velocity: [3, 0, 0] })
    const b = body({ position: [0, 8, 0], velocity: [3, 0, 0] })
    world.addBody(a)
    world.addBody(b)
    run(world, 1)
    const before = world.state(a.id)!.position[0]
    const heavier = { ...b, mass: 5 }
    world.rebuild([a, heavier], [], true)
    expect(world.state(a.id)!.position[0]).toBeCloseTo(before, 3)
    expect(world.state(a.id)!.velocity[0]).toBeCloseTo(3, 3)
    expect(world.state(b.id)!.position[0]).toBeCloseTo(0, 3)
    expect(world.time).toBeGreaterThan(0.9)
    world.rebuild([a, heavier], [])
    expect(world.state(a.id)!.position[0]).toBeCloseTo(0, 3)
    expect(world.time).toBe(0)
    world.destroy()
  })

  it("a cone's mass uses its width as a diameter, the way it is drawn", () => {
    expect(shapeVolume('cone', [0.5, 0.8, 0.5])).toBeCloseTo((1 / 3) * Math.PI * 0.25 ** 2 * 0.8, 9)
  })
})

describe('the sandbox store', () => {
  const fresh = () => useSandbox.setState({ bodies: startingScene(), links: [], past: [], future: [], recording: {}, live: {}, contacts: [], runNonce: 0, selection: null })

  it('Reset asks for a rebuild and forgets the old run', () => {
    fresh()
    const s = useSandbox.getState()
    useSandbox.setState({ live: { x: {} as never }, recording: { x: [] }, engineTime: 4 })
    s.resetRun()
    const after = useSandbox.getState()
    expect(after.runNonce).toBe(1)
    expect(after.engineTime).toBe(0)
    expect(after.live).toEqual({})
    expect(after.recording).toEqual({})
  })

  it('a new object lands beside the last one, resting on the floor', () => {
    fresh()
    const bodies = useSandbox.getState().bodies
    const [x, y] = spawnAt('box', bodies)
    const last = bodies[bodies.length - 1]
    expect(x).toBeGreaterThan(last.position[0] + last.size[0] / 2)
    expect(y).toBeCloseTo(0 + halfHeight('box', DEFAULT_SIZE.box) + 0.005, 6)
    expect(halfHeight('sphere', [0.25, 0.25, 0.25])).toBe(0.25)
    expect(halfHeight('capsule', [0.2, 0.6, 0.2])).toBeCloseTo(0.5, 9)
  })

  it('the floor is two hundred metres wide and can be added back', () => {
    fresh()
    expect(DEFAULT_SIZE.ground[0]).toBeGreaterThanOrEqual(200)
    const s = useSandbox.getState()
    const floor = s.bodies.find((b) => b.shape === 'ground')!
    s.removeBody(floor.id)
    expect(useSandbox.getState().bodies.some((b) => b.shape === 'ground')).toBe(false)
    useSandbox.getState().addBody('ground')
    expect(useSandbox.getState().bodies.some((b) => b.shape === 'ground')).toBe(true)
  })

  it('a delete straight after a slider edit can still be undone, and redone', () => {
    fresh()
    const s = useSandbox.getState()
    const ball = s.bodies.find((b) => b.shape === 'sphere')!
    s.updateBody(ball.id, { friction: 0.9 })
    s.removeBody(ball.id)
    expect(useSandbox.getState().bodies.find((b) => b.id === ball.id)).toBeUndefined()
    useSandbox.getState().undo()
    expect(useSandbox.getState().bodies.find((b) => b.id === ball.id)?.friction).toBe(0.9)
    useSandbox.getState().redo()
    expect(useSandbox.getState().bodies.find((b) => b.id === ball.id)).toBeUndefined()
  })

  it('joining refuses the same pair twice and an object to itself', () => {
    fresh()
    const s = useSandbox.getState()
    const [a, b] = s.bodies.filter((x) => x.shape !== 'ground')
    expect(s.addLink(a.id, a.id, 'rod')).toBe(false)
    expect(s.addLink(a.id, b.id, 'string')).toBe(true)
    expect(useSandbox.getState().addLink(b.id, a.id, 'spring')).toBe(false)
    expect(useSandbox.getState().links).toHaveLength(1)
  })

  it('a new scene and a deleted body take their readings with them', () => {
    fresh()
    const s = useSandbox.getState()
    const ball = s.bodies.find((b) => b.shape === 'sphere')!
    useSandbox.setState({ recording: { [ball.id]: [{ t: 1, x: 0, y: 0, v: 0, ke: 0, pe: 0, p: 0 }] } })
    s.removeBody(ball.id)
    expect(useSandbox.getState().recording[ball.id]).toBeUndefined()
    useSandbox.setState({ recording: { z: [] }, engineTime: 3 })
    useSandbox.getState().setScene(startingScene())
    expect(useSandbox.getState().recording).toEqual({})
    expect(useSandbox.getState().engineTime).toBe(0)
    expect(useSandbox.getState().runNonce).toBe(1)
  })
})

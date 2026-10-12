// H25: the Sandbox's "Step one frame" button. It called world.step(1/60) and threw the result away:
// pressed at t = 0 it used up the run's only t = 0 reading, published no live values or contacts,
// and in slow motion (time scale 0.1) 1/60 s of frame time was a tenth of a step, so nothing moved.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { SimWorld } from '../src/renderer/src/sim/world'
import { DEFAULT_STEP_RATE, DEFAULT_WORLD, type BodyDef } from '../src/renderer/src/sim/types'
import { engine, useSandbox } from '../src/renderer/src/sim/store'
import { stepOneFrame } from '../src/renderer/src/sim/stepping'


function body(over: Partial<BodyDef> = {}): BodyDef {
  return {
    id: 'ball',
    name: 'Ball',
    shape: 'sphere',
    size: [0.2, 0.2, 0.2],
    // High enough that a 3 s fall (44 m) never reaches the floor: nothing here but free fall.
    position: [0, 100, 0],
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

const floor = body({ id: 'floor', name: 'Floor', shape: 'box', size: [50, 1, 50], position: [0, -0.5, 0], motion: 'static' })
const ball = body({ id: 'ball', name: 'Ball', position: [0, 5, 0] })

async function ready(timeScale = 1): Promise<SimWorld> {
  const world = await SimWorld.create({ ...DEFAULT_WORLD, airDensity: 0, timeScale })
  world.rebuild([floor, ball], [])
  useSandbox.setState({ bodies: [floor, ball], world: { ...DEFAULT_WORLD, airDensity: 0, timeScale }, recording: {}, live: {}, engineTime: 0 })
  engine.world = world
  return world
}

describe('Step one frame (H25)', () => {
  beforeAll(async () => {
    await SimWorld.create()
  }, 30_000)
  beforeEach(() => {
    engine.world = null
  })

  // SB0: a step is one engine step of 1/rate s (1/240 at the default rate), no longer 1/60 s.
  const STEP = 1 / DEFAULT_STEP_RATE

  it('records the t = 0 reading, moves exactly one engine step, and publishes the live values', async () => {
    const world = await ready()
    stepOneFrame()
    expect(world.time).toBeCloseTo(STEP, 12)
    const rec = useSandbox.getState().recording.ball ?? []
    expect(rec.map((s) => s.t)).toEqual([0])
    expect(useSandbox.getState().engineTime).toBeCloseTo(STEP, 12)
    expect(useSandbox.getState().live.ball?.position[1]).toBeLessThan(5)
    // rate/10 − 1 more steps reach t = 0.1, the next reading on the grid.
    for (let i = 0; i < DEFAULT_STEP_RATE / 10 - 1; i++) stepOneFrame()
    expect((useSandbox.getState().recording.ball ?? []).map((s) => s.t)).toEqual([0, 0.1])
    world.destroy()
  })

  it('moves one step in slow motion too', async () => {
    const world = await ready(0.1)
    stepOneFrame()
    expect(world.time).toBeCloseTo(STEP, 12)
    world.destroy()
  })
})

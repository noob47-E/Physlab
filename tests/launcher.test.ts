// The Launcher (owner, Tue 13 Oct 2026: "the launcher is not working, I am unable to launch the ball"). Before Play its
// speed is the start, like any typed number; part-way through a run a typed number only moves the start (H20), so Set
// used to do nothing a student could see until Reset. Launch is an action: part-way through it throws the object now.

import { afterEach, describe, expect, it } from 'vitest'
import { SimWorld } from '../src/renderer/src/sim/world'
import { DEFAULT_WORLD } from '../src/renderer/src/sim/types'
import { launchVelocity } from '../src/renderer/src/sim/presets'
import { engine, useSandbox } from '../src/renderer/src/sim/store'
import { launch, launchNote } from '../src/renderer/src/sim/launch'

const store = () => useSandbox.getState()

async function dropScene(): Promise<{ world: SimWorld; id: string }> {
  const world = await SimWorld.create({ ...DEFAULT_WORLD, airDensity: 0 })
  engine.world = world
  store().loadPreset('drop')
  world.rebuild(store().bodies, store().links)
  const id = store().bodies.find((b) => b.motion === 'dynamic')!.id
  return { world, id }
}

afterEach(() => {
  engine.world?.destroy()
  engine.world = null
})

describe('the Launcher', () => {
  it('before Play, Set is the start: the store holds the speed and the run starts with it', async () => {
    const { world, id } = await dropScene()
    const v = launchVelocity(12, 45)
    expect(launch(id, v)).toBe('start')
    expect(store().bodies.find((b) => b.id === id)!.velocity).toEqual(v)
    for (const b of store().bodies) world.updateBody(b)
    world.stepOnce()
    // No air: the sideways speed is exactly the launch's v cos 45°.
    expect(world.state(id)!.velocity[0]).toBeCloseTo(v[0], 4)
    expect(launchNote('start')).toBeNull()
  })

  it('part-way through a run, Set throws the object now, from where it is, and leaves the start alone', async () => {
    const { world, id } = await dropScene()
    const start = store().bodies.find((b) => b.id === id)!.velocity
    for (let i = 0; i < 240; i++) world.stepOnce()
    const where = world.state(id)!.position
    const v = launchVelocity(20, 60)
    expect(launch(id, v)).toBe('now')
    world.stepOnce()
    // One step later the sideways speed is the launch's (no air), not the old run's.
    expect(world.state(id)!.velocity[0]).toBeCloseTo(v[0], 4)
    // It left from where it was, not from the start.
    expect(Math.abs(world.state(id)!.position[0] - where[0])).toBeLessThan(v[0] / 200)
    // Reset still goes back to the start: the typed start did not change.
    expect(store().bodies.find((b) => b.id === id)!.velocity).toEqual(start)
    expect(launchNote('now')).toMatch(/Launched from where it is now/)
  })
})

import { beforeAll, beforeEach, describe, it } from 'vitest'
import { SimWorld } from '../../src/renderer/src/sim/world'
import { PRESETS } from '../../src/renderer/src/sim/presets'
import { chaosDrivers } from '../../src/renderer/src/sim/chaosTwins'
import { DEFAULT_WORLD } from '../../src/renderer/src/sim/types'
import { fmt } from '../../src/renderer/src/math/format'
import { resetGlobals } from '../helpers/globals'
import { expectGolden, goldenLine, GOLDEN_FULL } from './harness'

beforeEach(resetGlobals)

async function sweep(): Promise<string[]> {
  const lines: string[] = []
  
  for (const p of PRESETS) {
    const built = p.build()
    const world = await SimWorld.create({ ...DEFAULT_WORLD, ...(built.world ?? {}) })
    world.rebuild(built.bodies, built.links ?? [])
    // SB60: the chaos twins follow their exact path, as the Sandbox view drives them; no other preset has a driver.
    world.setDrivers(chaosDrivers(built.bodies, built.links ?? [], built.world?.gravity ?? DEFAULT_WORLD.gravity))

    const recordAt = (tLabel: string) => {
      // A body by its name and place in the preset: its id is made fresh (random) on every build.
      for (const [n, b] of built.bodies.entries()) {
        const s = world.state(b.id)
        if (s) {
          // As a readout writes them (the app's number writer, 3 decimal places: mm and mm/s). Nine
          // significant figures caught the physics engine's warm-up noise (a seesaw differed in the
          // sixth figure between the first and second run in one process), which no student sees.
          const pos = s.position.map((v) => fmt(v, 3)).join(', ')
          const vel = s.velocity.map((v) => fmt(v, 3)).join(', ')
          lines.push(goldenLine(`Preset ${p.id} body ${n + 1} ${(b as { name?: string }).name ?? b.shape} at t=${tLabel}`, `pos=[${pos}] vel=[${vel}]`))
        }
      }
    }

    recordAt('0s')
    // One engine step is 1/rate s (SB0: 240 by default, a preset may ask for another), no longer
    // 1/60 s: the readings stay at 1, 5 and 10 s of simulated time.
    const rate = world.stepRate
    for (let i = 1; i <= 10 * rate; i++) {
      world.stepOnce()
      if (i === rate) recordAt('1s')
      if (i === 5 * rate) recordAt('5s')
      if (i === 10 * rate) recordAt('10s')
    }
    
    world.destroy()
  }
  
  return lines
}

describe.skipIf(!GOLDEN_FULL)('golden sweep: presets', () => {
  // The physics engine is deterministic from process to process, but not from world to world inside
  // one process: each new world settles a hair differently from the one before (a seesaw by a
  // millimetre at t = 1 s, a ball rolling and sliding). So this sweep, unlike the others, has no
  // "two runs in a row" test: it makes one throwaway run (the engine's first worlds), then exactly one
  // measured run, which is the same in every fresh process (checked three times when it was made).
  // So it needs vitest's own process per test file (the default): with --no-isolate it would fail.
  beforeAll(async () => {
    await sweep()
  }, 120_000)

  it('matches tests/golden/out/presets.txt', async () => {
    expectGolden('presets', await sweep())
  })
})

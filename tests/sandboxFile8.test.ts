// SB0, .phys format 8: the Sandbox world says how many engine steps it takes a second (`stepRate`)
// instead of the old Accuracy figure (`collisionSteps`, sub-steps per 1/60 s). An old file opens at
// the rate its figure amounted to, so it runs exactly as finely as it did; a saved file comes back
// at its rate; a format-8 file asking for a rate PhysLab does not run is refused in one sentence,
// before anything in the app is touched.

import { beforeEach, describe, expect, it } from 'vitest'
import { FILE_VERSION, parseSceneFile } from '../src/renderer/src/core/migrate'
import { useScene } from '../src/renderer/src/core/store'
import { useSandbox } from '../src/renderer/src/sim/store'
import { DEFAULT_WORLD, rateOf } from '../src/renderer/src/sim/types'

const ball = { id: 'b1', name: 'Ball', shape: 'sphere', size: [0.2, 0.2, 0.2], position: [0, 3, 0] }

/** A format-7 project as a 0.9 build before SB0 wrote it, with the world it was given. */
const v7 = (world?: Record<string, unknown>) =>
  JSON.stringify({ app: 'PhysLab', version: 7, objects: [], sandbox: { bodies: [ball], links: [], ...(world === undefined ? {} : { world }), sideView: true } })

beforeEach(() => {
  useScene.getState().loadScene(useScene.getState().serialize())
})

describe('format 8: the step rate replaces the Accuracy figure', () => {
  it('is the format this build writes', () => {
    expect(FILE_VERSION).toBe(8)
    expect(useScene.getState().serialize().version).toBe(8)
  })

  it('an old figure n opens as 60·n steps a second, rounded up to a rate PhysLab runs, and the figure goes', () => {
    const want: Record<number, number> = { 1: 60, 2: 120, 3: 240, 4: 240, 8: 600 }
    for (const [n, rate] of Object.entries(want)) {
      const out = parseSceneFile(v7({ ...DEFAULT_WORLD, stepRate: undefined, collisionSteps: Number(n), gravity: 9.81 }))
      expect(out.version).toBe(8)
      expect(out.sandbox!.world.stepRate).toBe(rate)
      expect('collisionSteps' in out.sandbox!.world).toBe(false)
      expect(out.sandbox!.world.gravity).toBe(9.81)
    }
  })

  it('an old world with no figure ran at the default of 2 sub-steps: 120 steps a second', () => {
    expect(parseSceneFile(v7({ gravity: 1.62 })).sandbox!.world).toEqual({ gravity: 1.62, stepRate: 120 })
  })

  it('an old sandbox with no world block at all opens at 120 too, not at today’s 240', () => {
    const out = parseSceneFile(v7())
    expect(out.sandbox!.world).toEqual({ stepRate: 120 })
    // Opened in the app: the Sandbox runs at 120, whatever the new default is.
    useScene.getState().loadScene(out)
    expect(rateOf(useSandbox.getState().world)).toBe(120)
  })

  it('an old Newton’s cradle (8 sub-steps) opens in the app at 600 steps a second', () => {
    useScene.getState().loadScene(parseSceneFile(v7({ gravity: 9.81, airDensity: 0, collisionSteps: 8 })))
    const world = useSandbox.getState().world
    expect(world.stepRate).toBe(600)
    expect(rateOf(world)).toBe(600)
  })

  it('a project saved at 600 opens at 600: the round trip keeps the rate', () => {
    useSandbox.getState().setWorld({ stepRate: 600 })
    const text = JSON.stringify(useScene.getState().serialize())
    useSandbox.getState().setWorld({ stepRate: 60 })
    useScene.getState().loadScene(parseSceneFile(text))
    expect(useSandbox.getState().world.stepRate).toBe(600)
    expect(rateOf(useSandbox.getState().world)).toBe(600)
  })

  it('a format-8 file asking for a rate PhysLab does not run is refused in one sentence', () => {
    const asked: [unknown, string][] = [
      [100, 'This project asks for 100 steps a second; PhysLab runs 60, 120, 240 or 600.'],
      [0, 'This project asks for 0 steps a second; PhysLab runs 60, 120, 240 or 600.'],
      [-60, 'This project asks for −60 steps a second; PhysLab runs 60, 120, 240 or 600.'],
      // The app's number writer puts a no-break space either side of ×.
      [1e21, 'This project asks for 1 × 10²¹ steps a second; PhysLab runs 60, 120, 240 or 600.'],
      // Not a number at all: no "null" or quotes on screen.
      ['240', 'This project asks for a step rate PhysLab cannot read; PhysLab runs 60, 120, 240 or 600 steps a second.'],
      [null, 'This project asks for a step rate PhysLab cannot read; PhysLab runs 60, 120, 240 or 600 steps a second.']
    ]
    for (const [rate, sentence] of asked) {
      const text = JSON.stringify({ app: 'PhysLab', version: 8, objects: [], sandbox: { bodies: [ball], links: [], world: { stepRate: rate }, sideView: true } })
      let message = ''
      try {
        parseSceneFile(text)
      } catch (e) {
        message = (e as Error).message
      }
      expect(message, String(rate)).toBe(sentence)
    }
  })

  it('a format-8 file with no rate, or one of the four, opens', () => {
    for (const world of [{}, { stepRate: 60 }, { stepRate: 120 }, { stepRate: 240 }, { stepRate: 600 }]) {
      const text = JSON.stringify({ app: 'PhysLab', version: 8, objects: [], sandbox: { bodies: [ball], links: [], world, sideView: true } })
      expect(parseSceneFile(text).sandbox!.world).toEqual(world)
    }
  })

  it('a format-7 file is never refused for a rate: the figure it carries is all it knew', () => {
    expect(() => parseSceneFile(v7({ stepRate: 100, collisionSteps: 2 }))).not.toThrow()
    expect(parseSceneFile(v7({ stepRate: 100, collisionSteps: 2 })).sandbox!.world.stepRate).toBe(120)
  })

  it('a hand-made format-7 world saying both a rate and a figure opens at the finer, as rateOf reads it', () => {
    expect(parseSceneFile(v7({ stepRate: 60, collisionSteps: 8 })).sandbox!.world.stepRate).toBe(600)
    expect(parseSceneFile(v7({ stepRate: 600, collisionSteps: 1 })).sandbox!.world.stepRate).toBe(600)
    expect(parseSceneFile(v7({ stepRate: 240 })).sandbox!.world.stepRate).toBe(240)
  })

  it('a hand-made format-7 world with a rate and no figure keeps its rate (review round 2): 60 stays 60', () => {
    expect(parseSceneFile(v7({ stepRate: 60 })).sandbox!.world.stepRate).toBe(60)
    expect(parseSceneFile(v7({ stepRate: 120 })).sandbox!.world.stepRate).toBe(120)
    // A rate PhysLab does not run, with no figure, is the world that said neither: the old default.
    expect(parseSceneFile(v7({ stepRate: 100 })).sandbox!.world.stepRate).toBe(120)
  })
})

// SB15 (amended): the Sandbox store remembers WHICH experiment is loaded (`presetId`), so the cards, the theory and the
// Collision Lab can key on it. Every other way of replacing the scene forgets it.

import { beforeEach, describe, expect, it } from 'vitest'
import { useSandbox } from '../src/renderer/src/sim/store'
import { presetById } from '../src/renderer/src/sim/presets'

const s = () => useSandbox.getState()

beforeEach(() => {
  s().loadSandbox()
})

describe('presetId', () => {
  it('is null at the start and after opening a project', () => {
    expect(s().presetId).toBeNull()
    s().loadPreset('fall')
    s().loadSandbox()
    expect(s().presetId).toBeNull()
  })

  it('loadPreset sets it, through loadBuilt', () => {
    expect(s().loadPreset('projectile')).toBe(true)
    expect(s().presetId).toBe('projectile')
    expect(s().bodies.map((b) => b.name)).toEqual(presetById('projectile')!.build().bodies.map((b) => b.name))
    expect(s().loadPreset('no-such-preset')).toBe(false)
    expect(s().presetId).toBe('projectile')
  })

  it('loadBuilt loads the build it is given, as loadPreset would, and names it', () => {
    const built = presetById('bounce')!.build()
    s().loadBuilt('bounce', built)
    expect(s().presetId).toBe('bounce')
    expect(s().bodies).toBe(built.bodies)
    expect(s().world.airDensity).toBe(0)
    expect(s().links).toEqual([])
  })

  it('setScene forgets it, but loadBuilt with the same id keeps it (a lab slider rebuilding its scene)', () => {
    s().loadPreset('collision')
    s().loadBuilt('collision', presetById('collision')!.build(), { applyViewHint: false })
    expect(s().presetId).toBe('collision')
    s().setScene(presetById('fall')!.build().bodies)
    expect(s().presetId).toBeNull()
  })

  it('an edit keeps it; an Undo within the experiment keeps it; an Undo back to the scene before forgets it', () => {
    s().loadPreset('fall')
    const ball = s().bodies.find((b) => b.motion === 'dynamic')!
    s().updateBody(ball.id, { mass: 2 })
    expect(s().presetId).toBe('fall')
    s().undo()
    expect(s().presetId).toBe('fall')
    // The Undo before the load goes back to the scene that was there first: not the experiment.
    s().undo()
    expect(s().presetId).toBeNull()
    // And Redo brings the experiment back with its name.
    s().redo()
    expect(s().presetId).toBe('fall')
  })
})

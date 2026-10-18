// CLAB2: Collision Lab frames carts to the right of the panel so both carts are seen at 1366x768.

import { describe, expect, it } from 'vitest'
import { sandboxHomeView } from '../src/renderer/src/render/sandboxCamera'
import { buildScene, LAB_DEFAULTS } from '../src/renderer/src/sim/labScenes'
import { readSource } from './helpers/repo'

describe('CLAB2: Collision Lab carts framing', () => {
  it('frames lab1d carts to the right of the panel when isLab is true', () => {
    const scene = buildScene('lab1d', LAB_DEFAULTS.lab1d)
    const normalView = sandboxHomeView(scene.bodies, (b) => b.position, false, false)
    const labView = sandboxHomeView(scene.bodies, (b) => b.position, false, true)

    // Normal view targets the midpoint of carts cx (-0.75), which puts cart A at x = -2 under the 280px panel
    expect(normalView.target[0]).toBeCloseTo(-0.75, 2)

    // Lab view shifts the target to the left so the carts project to the right of the left panel
    expect(labView.target[0]).toBeLessThan(normalView.target[0])
    expect(labView.target[0]).toBeCloseTo(-1.95, 1)

    // Cart A (-2.0) is near or to the right of camera target in labView, keeping it clear of the left HUD
    const cartA = scene.bodies.find((b) => b.name === 'A')!
    expect(cartA.position[0] - labView.target[0]).toBeGreaterThanOrEqual(-0.1)
  })

  it('CameraRig uses lab framing when a lab experiment is loaded in sandbox', () => {
    const src = readSource('src/renderer/src/render/CameraRig.tsx')
    expect(src).toMatch(/sandboxHomeView\([\s\S]*?isLab\(presetId\)/)
  })
})

// Pulleys, hinges, welds and ropes, checked against the formulas a student would use.

import { beforeAll, describe, expect, it } from 'vitest'
import { SimWorld } from '../src/renderer/src/sim/world'
import { makeLink, pulleyRim, reachOf, ropeSegments } from '../src/renderer/src/sim/links'
import { makeBody } from '../src/renderer/src/sim/store'
import { PRESETS } from '../src/renderer/src/sim/presets'
import { DEFAULT_WORLD, type BodyDef, type WorldSettings } from '../src/renderer/src/sim/types'

const G = 9.81

function run(world: SimWorld, seconds: number) {
  const dt = 1 / 60
  for (let t = 0; t < seconds - 1e-9; t += dt) world.step(dt)
}
const makeWorld = (settings: Partial<WorldSettings> = {}) => SimWorld.create({ ...DEFAULT_WORLD, airDensity: 0, ...settings })
const put = (shape: Parameters<typeof makeBody>[0], name: string, at: [number, number, number], over: Partial<BodyDef> = {}): BodyDef => ({ ...makeBody(shape, name, at), ...over })
const floor = () => put('ground', 'Floor', [0, -0.2, 0])

describe('links', () => {
  beforeAll(async () => {
    await makeWorld()
  }, 30_000)

  it('sizes a rope from surface to surface and a pulley rope from rim to rim', () => {
    const a = put('sphere', 'A', [0, 0, 0], { size: [0.2, 0.2, 0.2] })
    const b = put('sphere', 'B', [0, -3, 0], { size: [0.2, 0.2, 0.2] })
    const rope = makeLink('r', 'rope', a, b)!
    expect(rope.length).toBeCloseTo(2.6, 6)
    expect(rope.segments).toBe(ropeSegments(2.6))
    expect(reachOf(put('box', 'C', [0, 0, 0], { size: [1, 0.4, 2] }))).toBe(0.2)
    const wheel = put('pulley', 'P', [0, 5, 0], { size: [0.3, 0.15, 0.3] })
    const left = put('box', 'L', [-0.3, 2, 0])
    const right = put('box', 'R', [0.3, 2, 0])
    expect(pulleyRim(wheel, left.position, right.position)).toEqual({ p1: [-0.3, 5, 0], p2: [0.3, 5, 0] })
    const pl = makeLink('p', 'pulley', left, right, { over: wheel })!
    expect(pl.length).toBeCloseTo(6, 6)
    expect(makeLink('x', 'pulley', left, right)).toBeNull()
    const hinge = makeLink('h', 'hinge', left, right)!
    expect(hinge.pivotA).toEqual([0.6, 0, 0])
  })

  it('an Atwood machine accelerates at (m₂ − m₁) g / (m₁ + m₂)', async () => {
    const world = await makeWorld()
    const wheel = put('pulley', 'P', [0, 5, 0], { size: [0.3, 0.15, 0.3] })
    const light = put('box', 'A', [-0.3, 2.5, 0], { size: [0.3, 0.3, 0.3], massMode: 'mass', mass: 1 })
    const heavy = put('box', 'B', [0.3, 2.5, 0], { size: [0.3, 0.3, 0.3], massMode: 'mass', mass: 2 })
    world.rebuild([floor(), wheel, light, heavy], [makeLink('p', 'pulley', light, heavy, { over: wheel })!])
    run(world, 0.5)
    const a = (2 - 1) * G / 3
    const expected = 0.5 * a * 0.25
    expect(2.5 - world.state(heavy.id)!.position[1]).toBeGreaterThan(expected * 0.85)
    expect(2.5 - world.state(heavy.id)!.position[1]).toBeLessThan(expected * 1.15)
    expect(world.state(light.id)!.position[1] - 2.5).toBeGreaterThan(expected * 0.85)
    world.destroy()
  })

  it('a rope hangs its load at about its length and does not stretch away', async () => {
    const world = await makeWorld()
    const beam = put('box', 'Beam', [0, 5, 0], { size: [0.15, 0.15, 0.15], motion: 'static' })
    const bob = put('sphere', 'Bob', [0, 2.5, 0], { size: [0.18, 0.18, 0.18], massMode: 'mass', mass: 2 })
    const rope = makeLink('r', 'rope', beam, bob)!
    world.rebuild([floor(), beam, bob], [rope])
    run(world, 2)
    const y = world.state(bob.id)!.position[1]
    // Hangs from the beam: 5 − (rope 2.245 + reach 0.075 + reach 0.18) ≈ 2.5, within a few percent.
    expect(y).toBeGreaterThan(2.2)
    expect(y).toBeLessThan(2.7)
    expect(world.linkPath(rope).length).toBe(rope.segments! + 2)
    world.destroy()
  })

  it('a hinged plank tips when the moments are unequal, and stays on its stand', async () => {
    const world = await makeWorld()
    const stand = put('box', 'Stand', [0, 0.35, 0], { size: [0.2, 0.7, 0.4], motion: 'static' })
    const plank = put('plank', 'Plank', [0, 0.78, 0], { size: [4, 0.1, 0.5], massMode: 'mass', mass: 2 })
    const heavy = put('sphere', 'H', [-1, 1.03, 0], { size: [0.2, 0.2, 0.2], massMode: 'mass', mass: 3 })
    world.rebuild([floor(), stand, plank, heavy], [makeLink('h', 'hinge', plank, stand)!])
    run(world, 1)
    const st = world.state(plank.id)!
    expect(Math.abs(st.rotation[2])).toBeGreaterThan(0.05)
    expect(Math.hypot(st.position[0], st.position[1] - 0.78)).toBeLessThan(0.3)
    world.destroy()
  })

  it('a weld holds a crate on a fixed one against gravity', async () => {
    const world = await makeWorld()
    const post = put('box', 'Post', [0, 2, 0], { size: [0.3, 0.3, 0.3], motion: 'static' })
    const crate = put('box', 'Crate', [0.5, 2, 0], { size: [0.4, 0.4, 0.4], massMode: 'mass', mass: 1 })
    world.rebuild([floor(), post, crate], [makeLink('w', 'weld', crate, post)!])
    run(world, 1)
    expect(world.state(crate.id)!.position[1]).toBeCloseTo(2, 1)
    world.destroy()
  })

  it('every preset builds and runs for a second without anything falling through the floor', async () => {
    const world = await makeWorld()
    for (const p of PRESETS) {
      const built = p.build()
      world.setWorldSettings({ ...DEFAULT_WORLD, airDensity: 0, ...(built.world ?? {}) })
      world.rebuild(built.bodies, built.links ?? [])
      run(world, 1)
      for (const b of built.bodies) {
        const st = world.state(b.id)!
        expect(st.position[1], `${p.id}: ${b.name}`).toBeGreaterThan(-1)
      }
    }
    world.destroy()
  })
})

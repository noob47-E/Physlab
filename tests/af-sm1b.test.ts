import { describe, expect, it } from 'vitest'
import { SimWorld } from '../src/renderer/src/sim/world'
import { makeLink, reachAlong } from '../src/renderer/src/sim/links'
import { makeBody } from '../src/renderer/src/sim/store'
import { DEFAULT_WORLD, type BodyDef } from '../src/renderer/src/sim/types'

const put = (shape: Parameters<typeof makeBody>[0], name: string, at: [number, number, number], over: Partial<BodyDef> = {}): BodyDef => ({ ...makeBody(shape, name, at), ...over })
const floor = () => put('ground', 'Floor', [0, -0.2, 0])

function run(world: SimWorld, seconds: number) {
  const dt = 1 / 60
  for (let t = 0; t < seconds - 1e-9; t += dt) world.step(dt)
}

describe('A17 hinge pivot', () => {
  it('rotates the world pivot into the plank local frame when the plank is turned', () => {
    const post = put('box', 'Post', [0, 2, 0], { size: [0.2, 2, 0.2], motion: 'static' })
    const plank = put('plank', 'Plank', [1, 2, 0], { size: [2, 0.1, 0.5], rotation: [0, 0, 90] })
    const hinge = makeLink('h', 'hinge', plank, post)!
    expect(hinge.pivotA?.[0]).toBeCloseTo(0, 9)
    expect(hinge.pivotA?.[1]).toBeCloseTo(1, 9)
    expect(hinge.pivotA?.[2]).toBeCloseTo(0, 9)
  })
})

describe('A17 rope end points', () => {
  it('applies rope attachment points in the body local frame, not as raw world direction', async () => {
    const world = await SimWorld.create({ ...DEFAULT_WORLD, gravity: 0, airDensity: 0 })
    const beam = put('box', 'Beam', [2, 0, 0], { size: [0.2, 0.2, 0.2], motion: 'static' })
    const bracket = put('box', 'Bracket', [0, 0, 0], { size: [1, 0.4, 2], rotation: [0, 0, 90], motion: 'static' })
    const rope = makeLink('r', 'rope', bracket, beam)!
    world.rebuild([beam, bracket], [rope])
    run(world, 1)
    const first = world.linkPath(rope)[1]
    // Correct local point for the +x world side of a +90°-rotated box maps to world [0.2, 0].
    // The old raw world direction [0.2, 0, 0] maps to [0, 0.2, 0], pulling the rope upward.
    expect(Math.abs(first[1])).toBeLessThan(0.1)
    world.destroy()
  })
})

describe('A17 moving pulley wheel', () => {
  it('rebuilds the pulley constraint after the wheel is placed elsewhere', async () => {
    const world = await SimWorld.create({ ...DEFAULT_WORLD, airDensity: 0 })
    const wheel = put('pulley', 'P', [0, 5, 0], { size: [0.3, 0.15, 0.3], motion: 'static' })
    const a = put('box', 'A', [-0.3, 2.5, 0], { size: [0.3, 0.3, 0.3], massMode: 'mass', mass: 1 })
    const b = put('box', 'B', [0.3, 2.5, 0], { size: [0.3, 0.3, 0.3], massMode: 'mass', mass: 1 })
    world.rebuild([floor(), wheel, a, b], [makeLink('p', 'pulley', a, b, { over: wheel })!])
    world.placeBody(wheel.id, [1, 5, 0])
    run(world, 1)
    expect(world.state(a.id)!.position[0]).toBeGreaterThan(-0.25)
    expect(world.state(b.id)!.position[0]).toBeGreaterThan(0.25)
    world.destroy()
  })
})

describe('A17 reachAlong for cylinder ends', () => {
  it('starts a rope above a tall cylinder, not inside it', async () => {
    const world = await SimWorld.create({ ...DEFAULT_WORLD, gravity: 0, airDensity: 0 })
    const beam = put('box', 'Beam', [0, 3, 0], { size: [0.2, 0.2, 0.2], motion: 'static' })
    const piston = put('cylinder', 'C', [0, 1, 0], { size: [0.2, 2, 0.2], massMode: 'mass', mass: 1 })
    const rope = makeLink('r', 'rope', piston, beam)!
    world.rebuild([beam, piston], [rope])
    const path = world.linkPath(rope)
    // The cylinder's top cap is at y = 2. The first rope link centre must lie above it,
    // not around y ≈ 1.3 (radius up from the centre).
    expect(path[1][1]).toBeGreaterThan(2)
    world.destroy()
  })
})

describe('A17 reachAlong takes the nearer of side and cap (part head check)', () => {
  it('a tall thin cylinder met just off its axis is left through its side', () => {
    const c = put('cylinder', 'C', [0, 0, 0], { size: [0.1, 4, 0.1] })
    // 40° from the axis: the cap is 2/cos 40° = 2.61 away, the side 0.1/sin 40° = 0.156.
    const r = (40 * Math.PI) / 180
    expect(reachAlong(c, [Math.sin(r), Math.cos(r), 0])).toBeCloseTo(0.1 / Math.sin(r), 9)
    expect(reachAlong(c, [0, 1, 0])).toBeCloseTo(2, 9)
    expect(reachAlong(c, [1, 0, 0])).toBeCloseTo(0.1, 9)
  })

  it('a pulley wheel keeps its radius', () => {
    const w = put('pulley', 'P', [0, 0, 0], { size: [0.3, 0.15, 0.3] })
    expect(reachAlong(w, [0, 1, 0])).toBe(0.3)
  })
})

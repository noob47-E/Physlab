// S1: Dragging a body while paused never stretches a rope / string / link (Finding 8.1).
// When placeBody is called on a body constrained by a string, rod or rope, its position
// must respect the link's distance constraints rather than stretching the link arbitrarily.

import { beforeAll, describe, expect, it } from 'vitest'
import { SimWorld } from '../src/renderer/src/sim/world'
import { makeBody } from '../src/renderer/src/sim/store'
import { makeLink } from '../src/renderer/src/sim/links'
import { DEFAULT_WORLD, type BodyDef } from '../src/renderer/src/sim/types'

const put = (shape: Parameters<typeof makeBody>[0], name: string, at: [number, number, number], over: Partial<BodyDef> = {}): BodyDef => ({
  ...makeBody(shape, name, at),
  ...over
})

describe('S1: dragging while paused never stretches links', () => {
  let world: SimWorld

  beforeAll(async () => {
    world = await SimWorld.create({ ...DEFAULT_WORLD, airDensity: 0 })
  }, 30_000)

  it('never stretches a pendulum string when dragged beyond its length', () => {
    const pivot = put('box', 'Pivot', [0, 4, 0], { size: [0.12, 0.12, 0.12], motion: 'static' })
    const bob = put('sphere', 'Bob', [0, 2, 0], { size: [0.15, 0.15, 0.15], massMode: 'mass', mass: 1 })
    const stringLink = makeLink('s1', 'string', pivot, bob, { posA: [0, 4, 0], posB: [0, 2, 0] })!
    expect(stringLink.length).toBeCloseTo(2.0, 3)

    world.rebuild([pivot, bob], [stringLink])

    // Drag bob far horizontally to the right (x = 5, y = 4)
    world.placeBody(bob.id, [5, 4, 0])

    const st = world.state(bob.id)!
    const distToPivot = Math.hypot(st.position[0] - 0, st.position[1] - 4, st.position[2] - 0)

    // The string must not stretch: distance to pivot must be <= 2.0 m
    expect(distToPivot).toBeLessThanOrEqual(2.001)
  })

  it('keeps a rod at exactly its fixed length when dragged', () => {
    const pivot = put('box', 'Pivot', [0, 4, 0], { size: [0.12, 0.12, 0.12], motion: 'static' })
    const bob = put('sphere', 'Bob', [0, 2, 0], { size: [0.15, 0.15, 0.15], massMode: 'mass', mass: 1 })
    const rodLink = makeLink('r1', 'rod', pivot, bob, { posA: [0, 4, 0], posB: [0, 2, 0] })!
    expect(rodLink.length).toBeCloseTo(2.0, 3)

    world.rebuild([pivot, bob], [rodLink])

    // Try to stretch rod to x = 5, y = 4
    world.placeBody(bob.id, [5, 4, 0])
    let st = world.state(bob.id)!
    let distToPivot = Math.hypot(st.position[0] - 0, st.position[1] - 4, st.position[2] - 0)
    expect(distToPivot).toBeCloseTo(2.0, 2)

    // Try to compress rod to x = 0, y = 3.5 (dist = 0.5)
    world.placeBody(bob.id, [0, 3.5, 0])
    st = world.state(bob.id)!
    distToPivot = Math.hypot(st.position[0] - 0, st.position[1] - 4, st.position[2] - 0)
    expect(distToPivot).toBeCloseTo(2.0, 2)
  })

  it('never stretches a rope beyond its maximum span when dragged', () => {
    const beam = put('box', 'Beam', [0, 5, 0], { size: [0.15, 0.15, 0.15], motion: 'static' })
    const load = put('sphere', 'Load', [0, 3, 0], { size: [0.18, 0.18, 0.18], massMode: 'mass', mass: 2 })
    const ropeLink = makeLink('rp1', 'rope', beam, load, { posA: [0, 5, 0], posB: [0, 3, 0] })!

    world.rebuild([beam, load], [ropeLink])

    // Drag load far sideways
    world.placeBody(load.id, [6, 5, 0])

    const st = world.state(load.id)!
    const distToBeam = Math.hypot(st.position[0] - 0, st.position[1] - 5, st.position[2] - 0)
    // Rope length + reaches is 2.0 m
    expect(distToBeam).toBeLessThanOrEqual(2.05)
  })

  it('preserves the 2D plane coordinate (z) when dragged', () => {
    const pivot = put('box', 'Pivot', [0, 4, 0], { size: [0.12, 0.12, 0.12], motion: 'static' })
    const bob = put('sphere', 'Bob', [0, 2, 0], { size: [0.15, 0.15, 0.15], massMode: 'mass', mass: 1 })
    const stringLink = makeLink('s1', 'string', pivot, bob, { posA: [0, 4, 0], posB: [0, 2, 0] })!

    world.rebuild([pivot, bob], [stringLink])

    // Drag with a stray z input
    world.placeBody(bob.id, [5, 4, 3])
    const st = world.state(bob.id)!
    expect(st.position[2]).toBe(0)
    const distToPivot = Math.hypot(st.position[0] - 0, st.position[1] - 4, st.position[2] - 0)
    expect(distToPivot).toBeLessThanOrEqual(2.001)
  })

  it('satisfies multiple distance constraints simultaneously without stretching either', () => {
    // Two anchors at (-1, 0, 0) and (1, 0, 0), bob at (0, 0, 0), each string length 1.0
    const anchorA = put('box', 'A1', [-1, 0, 0], { size: [0.1, 0.1, 0.1], motion: 'static' })
    const anchorB = put('box', 'A2', [1, 0, 0], { size: [0.1, 0.1, 0.1], motion: 'static' })
    const bob = put('sphere', 'Bob', [0, 0, 0], { size: [0.1, 0.1, 0.1], massMode: 'mass', mass: 1 })
    const linkA = makeLink('la', 'string', anchorA, bob, { posA: [-1, 0, 0], posB: [0, 0, 0] })!
    const linkB = makeLink('lb', 'string', anchorB, bob, { posA: [1, 0, 0], posB: [0, 0, 0] })!
    expect(linkA.length).toBeCloseTo(1.0, 3)
    expect(linkB.length).toBeCloseTo(1.0, 3)

    world.rebuild([anchorA, anchorB, bob], [linkA, linkB])

    // Drag bob far up to (0, 3, 0)
    world.placeBody(bob.id, [0, 3, 0])

    const st = world.state(bob.id)!
    const distA = Math.hypot(st.position[0] - (-1), st.position[1] - 0, st.position[2] - 0)
    const distB = Math.hypot(st.position[0] - 1, st.position[1] - 0, st.position[2] - 0)

    // Neither string may stretch beyond 1.0 m (plus tiny numeric epsilon)
    expect(distA).toBeLessThanOrEqual(1.01)
    expect(distB).toBeLessThanOrEqual(1.01)
  })

  it('clamps pulley drag to available rope length and uses live wheel position', () => {
    const wheel = put('pulley', 'Wheel', [0, 5, 0], { size: [0.3, 0.15, 0.3], motion: 'static' })
    const a = put('box', 'A', [-0.3, 2.5, 0], { size: [0.2, 0.2, 0.2], massMode: 'mass', mass: 1 })
    const b = put('box', 'B', [0.3, 2.5, 0], { size: [0.2, 0.2, 0.2], massMode: 'mass', mass: 1 })
    const pLink = makeLink('p1', 'pulley', a, b, { over: wheel })!
    expect(pLink.length).toBeCloseTo(5.0, 1)

    world.rebuild([wheel, a, b], [pLink])

    // Drag A down by 10 metres (far beyond total rope length)
    world.placeBody(a.id, [-0.3, -10, 0])

    const stA = world.state(a.id)!
    const stB = world.state(b.id)!

    // Partner B cannot rise through the wheel rim (at y = 5.0)
    expect(stB.position[1]).toBeLessThanOrEqual(4.96)
    // Run A + Run B cannot exceed total rope length
    const runA = Math.hypot(stA.position[0] - (-0.3), stA.position[1] - 5, stA.position[2] - 0)
    const runB = Math.hypot(stB.position[0] - 0.3, stB.position[1] - 5, stB.position[2] - 0)
    expect(runA + runB).toBeLessThanOrEqual(pLink.length + 0.05)
  })

  it('allows free bodies to be placed anywhere', () => {
    const free = put('sphere', 'Free', [0, 2, 0], { size: [0.2, 0.2, 0.2] })
    world.rebuild([free], [])

    world.placeBody(free.id, [12, -3, 0])
    const st = world.state(free.id)!
    expect(st.position[0]).toBeCloseTo(12, 3)
    expect(st.position[1]).toBeCloseTo(-3, 3)
  })

  it('moves a welded pair of dynamic bodies rigidly when either body is dragged', () => {
    const a = put('box', 'A', [0, 2, 0], { size: [0.5, 0.5, 0.5], massMode: 'mass', mass: 2 })
    const b = put('box', 'B', [2, 2, 0], { size: [0.5, 0.5, 0.5], massMode: 'mass', mass: 2 })
    const weldLink = makeLink('w1', 'weld', a, b, { posA: [0, 2, 0], posB: [2, 2, 0] })!

    world.rebuild([a, b], [weldLink])

    // Drag A by (+1, +3, 0) to [1, 5, 0]
    world.placeBody(a.id, [1, 5, 0])

    const stA = world.state(a.id)!
    const stB = world.state(b.id)!

    // A moves to target, and B follows by the exact same displacement
    expect(stA.position[0]).toBeCloseTo(1.0, 2)
    expect(stA.position[1]).toBeCloseTo(5.0, 2)
    expect(stB.position[0]).toBeCloseTo(3.0, 2)
    expect(stB.position[1]).toBeCloseTo(5.0, 2)
  })

  it('moves a hinged pair of dynamic bodies rigidly when either body is dragged', () => {
    const a = put('box', 'A', [0, 2, 0], { size: [0.5, 0.5, 0.5], massMode: 'mass', mass: 1 })
    const b = put('box', 'B', [2, 2, 0], { size: [0.5, 0.5, 0.5], massMode: 'mass', mass: 1 })
    const hingeLink = makeLink('h1', 'hinge', a, b, { posA: [0, 2, 0], posB: [2, 2, 0] })!

    world.rebuild([a, b], [hingeLink])

    // Drag B by (-2, +2, 0) to [0, 4, 0]
    world.placeBody(b.id, [0, 4, 0])

    const stA = world.state(a.id)!
    const stB = world.state(b.id)!

    // B moves to target, and A translates with B rigidly
    expect(stB.position[0]).toBeCloseTo(0.0, 2)
    expect(stB.position[1]).toBeCloseTo(4.0, 2)
    expect(stA.position[0]).toBeCloseTo(-2.0, 2)
    expect(stA.position[1]).toBeCloseTo(4.0, 2)
  })

  it('moves a chain of dynamic welded and hinged bodies rigidly together', () => {
    const a = put('box', 'A', [0, 2, 0], { size: [0.4, 0.4, 0.4], massMode: 'mass', mass: 1 })
    const b = put('box', 'B', [1, 2, 0], { size: [0.4, 0.4, 0.4], massMode: 'mass', mass: 1 })
    const c = put('box', 'C', [2, 2, 0], { size: [0.4, 0.4, 0.4], massMode: 'mass', mass: 1 })
    const wLink = makeLink('w1', 'weld', a, b, { posA: [0, 2, 0], posB: [1, 2, 0] })!
    const hLink = makeLink('h1', 'hinge', b, c, { posA: [1, 2, 0], posB: [2, 2, 0] })!

    world.rebuild([a, b, c], [wLink, hLink])

    // Drag C to [2, 6, 0] (delta +4 along y)
    world.placeBody(c.id, [2, 6, 0])

    const stA = world.state(a.id)!
    const stB = world.state(b.id)!
    const stC = world.state(c.id)!

    expect(stC.position[1]).toBeCloseTo(6.0, 2)
    expect(stB.position[1]).toBeCloseTo(6.0, 2)
    expect(stA.position[1]).toBeCloseTo(6.0, 2)
  })

  it('keeps a body anchored if welded or hinged to an immovable static body', () => {
    const wall = put('box', 'Wall', [0, 5, 0], { size: [1, 1, 1], motion: 'static' })
    const sign = put('box', 'Sign', [0, 3, 0], { size: [0.5, 0.5, 0.5], massMode: 'mass', mass: 1 })
    const weldLink = makeLink('w1', 'weld', wall, sign, { posA: [0, 5, 0], posB: [0, 3, 0] })!

    world.rebuild([wall, sign], [weldLink])

    // Try to drag sign away to [4, 3, 0]
    world.placeBody(sign.id, [4, 3, 0])

    const stSign = world.state(sign.id)!
    // Because wall is static, sign cannot move away from wall
    expect(stSign.position[0]).toBeCloseTo(0.0, 2)
    expect(stSign.position[1]).toBeCloseTo(3.0, 2)
  })

  it('clamps drag of welded assembly so external string constraint on partner is not stretched', () => {
    const ceiling = put('sphere', 'Ceiling', [0, 5, 0], { size: [0.2, 0.2, 0.2], motion: 'static' })
    const a = put('box', 'A', [0, 3, 0], { size: [0.4, 0.4, 0.4], massMode: 'mass', mass: 1 })
    const b = put('box', 'B', [1, 3, 0], { size: [0.4, 0.4, 0.4], massMode: 'mass', mass: 1 })

    // String from Ceiling [0, 5, 0] to A [0, 3, 0]: length = 2.0 m
    const strLink = makeLink('s1', 'string', ceiling, a, { posA: [0, 5, 0], posB: [0, 3, 0] })!
    // Weld between A and B
    const weldLink = makeLink('w1', 'weld', a, b, { posA: [0, 3, 0], posB: [1, 3, 0] })!

    world.rebuild([ceiling, a, b], [strLink, weldLink])

    // Drag B far to the right: [10, 3, 0]
    world.placeBody(b.id, [10, 3, 0])

    const stA = world.state(a.id)!
    const stB = world.state(b.id)!

    // String between Ceiling [0, 5, 0] and A must not stretch beyond 2.0 m
    const distA = Math.hypot(stA.position[0] - 0, stA.position[1] - 5, stA.position[2] - 0)
    expect(distA).toBeLessThanOrEqual(2.01)

    // And B must remain rigidly attached at offset [1, 0, 0] from A
    expect(stB.position[0] - stA.position[0]).toBeCloseTo(1.0, 2)
    expect(stB.position[1] - stA.position[1]).toBeCloseTo(0.0, 2)
  })
})


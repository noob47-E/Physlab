// Pulleys, hinges, welds and ropes, checked against the formulas a student would use.

import { beforeAll, describe, expect, it } from 'vitest'
import { SimWorld } from '../src/renderer/src/sim/world'
import { makeLink, polylineLength, pulleyPartnerMove, pulleyRim, reachOf, ropeLayout, ropeLinkMass, ropeSegments } from '../src/renderer/src/sim/links'
import { eulerToQuat, rotateByEuler } from '../src/renderer/src/sim/rotate'
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

  it('turns a body-fixed point the way the engine turns the body', () => {
    const close = (v: number[], w: number[]) => v.forEach((x, i) => expect(x).toBeCloseTo(w[i], 9))
    close(rotateByEuler([0, 0, 90], [1, 0, 0]), [0, 1, 0])
    close(rotateByEuler([90, 0, 0], [0, 1, 0]), [0, 0, 1])
    close(rotateByEuler([0, 90, 0], [1, 0, 0]), [0, 0, -1])
    // x first, then y, then z — the order the engine's quaternion is built in.
    close(rotateByEuler([90, 90, 0], [0, 1, 0]), [1, 0, 0])
    close(eulerToQuat([0, 0, 0]), [0, 0, 0, 1])
  })

  it('a pulley turned to face another way still hands the rope its rim, not its face', () => {
    // The default wheel stands with its axis along z; turned 90° about the vertical it faces x,
    // and its rim points lie along z. The old rule put them along world x regardless.
    const wheel = put('pulley', 'P', [0, 5, 0], { size: [0.3, 0.15, 0.3], rotation: [90, 90, 0] })
    const near = put('box', 'N', [0, 2, -0.3])
    const far = put('box', 'F', [0, 2, 0.3])
    const close = (v: number[], w: number[]) => v.forEach((x, i) => expect(x).toBeCloseTo(w[i], 9))
    const { p1, p2 } = pulleyRim(wheel, near.position, far.position)
    close(p1, [0, 5, -0.3])
    close(p2, [0, 5, 0.3])
    // Swapping the bodies swaps the rim points: each gets the side nearer to it.
    close(pulleyRim(wheel, far.position, near.position).p1, [0, 5, 0.3])
    expect(makeLink('p', 'pulley', near, far, { over: wheel })!.length).toBeCloseTo(6, 6)
  })

  it('spinning a pulley about its own axle leaves the rim points where the rope hangs', () => {
    const close = (v: number[], w: number[]) => v.forEach((x, i) => expect(x).toBeCloseTo(w[i], 9))
    const left = put('box', 'L', [-0.3, 2, 0])
    const right = put('box', 'R', [0.3, 2, 0])
    // The default wheel's axle is z; any turn about z is the wheel itself turning. The rule
    // that used the wheel's own x axis sent the rope out of the top and bottom at 90°.
    for (const theta of [30, 90, 135, 270]) {
      const wheel = put('pulley', 'P', [0, 5, 0], { size: [0.3, 0.15, 0.3], rotation: [90, 0, theta] })
      const { p1, p2 } = pulleyRim(wheel, left.position, right.position)
      close(p1, [-0.3, 5, 0])
      close(p2, [0.3, 5, 0])
    }
    // A wheel lying flat has no level direction across its axle: its own x axis stands in.
    const flat = put('pulley', 'F', [0, 5, 0], { size: [0.3, 0.15, 0.3], rotation: [0, 90, 0] })
    const { p1, p2 } = pulleyRim(flat, [0, 2, 0.3], [0, 2, -0.3])
    close(p1, [0, 5, 0.3])
    close(p2, [0, 5, -0.3])
  })

  it('moving the wheel after the join hangs the masses under its new rim', async () => {
    const world = await makeWorld()
    const wheel = put('pulley', 'P', [0, 5, 0], { size: [0.3, 0.15, 0.3] })
    const a = put('box', 'A', [-0.3, 2.5, 0], { size: [0.3, 0.3, 0.3], massMode: 'mass', mass: 1 })
    const b = put('box', 'B', [0.3, 2.5, 0], { size: [0.3, 0.3, 0.3], massMode: 'mass', mass: 1 })
    world.rebuild([floor(), wheel, a, b], [makeLink('p', 'pulley', a, b, { over: wheel })!])
    // Arranged while paused: the masses are placed under where the wheel is about to go, then
    // the wheel is dragged there. The constraint used to keep the rim where the wheel had been.
    world.setPosition(a.id, [0.7, 2.5, 0])
    world.setPosition(b.id, [1.3, 2.5, 0])
    expect(world.updateBody({ ...wheel, position: [1, 5, 0] })).toBe(true)
    run(world, 1)
    expect(world.state(a.id)!.position[0]).toBeCloseTo(0.7, 1)
    expect(world.state(b.id)!.position[0]).toBeCloseTo(1.3, 1)
    expect(world.state(a.id)!.position[1]).toBeCloseTo(2.5, 1)
    world.destroy()
  })

  it('moving one end of a pulley rope sends the other end the same distance the other way, never past the rim', () => {
    const wheel = put('pulley', 'P', [0, 4.5, 0], { size: [0.3, 0.15, 0.3] })
    // A hangs under the left rim, B under the right: a metre down on A is a metre up on B.
    expect(pulleyPartnerMove(wheel, [-0.3, 2, 0], [-0.3, 1, 0], [0.3, 2, 0])).toEqual([0.3, 3, 0])
    expect(pulleyPartnerMove(wheel, [-0.3, 2, 0], [-0.3, 2.5, 0], [0.3, 2, 0])).toEqual([0.3, 1.5, 0])
    // A sideways move lengthens A's run by less than it travelled, and B rises by that.
    const [, y] = pulleyPartnerMove(wheel, [-0.3, 2, 0], [-1.3, 2, 0], [0.3, 2, 0])
    expect(y - 2).toBeCloseTo(Math.hypot(1, 2.5) - 2.5, 9)
    // B cannot be pulled through the wheel: it stops just under its rim.
    const [, top] = pulleyPartnerMove(wheel, [-0.3, 2, 0], [-0.3, -2, 0], [0.3, 2, 0])
    expect(top).toBeCloseTo(4.45, 9)
  })

  it('an Atwood machine over a pulley turned 90° about the vertical still accelerates at (m₂ − m₁) g / (m₁ + m₂)', async () => {
    const world = await makeWorld({ twoD: false })
    const wheel = put('pulley', 'P', [0, 5, 0], { size: [0.3, 0.15, 0.3], rotation: [90, 90, 0] })
    const light = put('box', 'A', [0, 2.5, -0.3], { size: [0.3, 0.3, 0.3], massMode: 'mass', mass: 1 })
    const heavy = put('box', 'B', [0, 2.5, 0.3], { size: [0.3, 0.3, 0.3], massMode: 'mass', mass: 2 })
    world.rebuild([floor(), wheel, light, heavy], [makeLink('p', 'pulley', light, heavy, { over: wheel })!])
    run(world, 0.5)
    const expected = 0.5 * ((2 - 1) * G / 3) * 0.25
    expect(2.5 - world.state(heavy.id)!.position[1]).toBeGreaterThan(expected * 0.85)
    expect(2.5 - world.state(heavy.id)!.position[1]).toBeLessThan(expected * 1.15)
    expect(world.state(light.id)!.position[1] - 2.5).toBeGreaterThan(expected * 0.85)
    world.destroy()
  })

  it('a rope weighs a tenth of its load, and never less than a twentieth', () => {
    const total = (loads: number[], n: number) => ropeLinkMass(loads, n) * n
    expect(total([2], 10)).toBeCloseTo(0.2, 9)
    expect(total([20, 50], 10)).toBeCloseTo(2, 9)
    // The old cap of 5 kg is what let a heavy load stretch its rope; the floor lifts it.
    expect(total([200], 10)).toBeCloseTo(10, 9)
    expect(total([2000], 10)).toBeCloseTo(100, 9)
    // A link is never lighter than 20 g, or the solver cannot hold it at all.
    expect(ropeLinkMass([0.1], 30)).toBe(0.02)
    expect(total([], 10)).toBeCloseTo(0.4, 9)
  })

  it('a two-tonne load on a rope hangs where a two-kilogram one does', async () => {
    const world = await makeWorld()
    const beam = put('box', 'Beam', [0, 5, 0], { size: [0.15, 0.15, 0.15], motion: 'static' })
    const bob = put('sphere', 'Bob', [0, 2.5, 0], { size: [0.18, 0.18, 0.18], massMode: 'mass', mass: 2000 })
    world.rebuild([floor(), beam, bob], [makeLink('r', 'rope', beam, bob)!])
    run(world, 2)
    // Under the old 5 kg cap it sagged to y ≈ 0.9; a 2 kg bob hangs at ≈ 2.47.
    expect(world.state(bob.id)!.position[1]).toBeGreaterThan(2.3)
    world.destroy()
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

  it('cuts a rope into 20 cm links, three at least and sixty at most', () => {
    expect(ropeSegments(0.1)).toBe(3)
    expect(ropeSegments(2)).toBe(10)
    expect(ropeSegments(6)).toBe(30)
    // A 12 m rope used to get the same thirty links as a 6 m one: 40 cm links that hung stiff.
    expect(ropeSegments(12)).toBe(60)
    expect(ropeSegments(100)).toBe(60)
  })

  it('lays a rope no longer than the gap straight along it', () => {
    const pts = ropeLayout([0, 5, 0], [3, 1, 0], 5, 4)
    expect(pts).toHaveLength(5)
    expect(pts[0]).toEqual([0, 5, 0])
    expect(pts[4]).toEqual([3, 1, 0])
    // Evenly spaced, and on the chord: the rope is exactly as long as the gap.
    expect(pts[2]).toEqual([1.5, 3, 0])
    expect(polylineLength(pts)).toBeCloseTo(5, 9)
    // Shorter than the gap it is still laid along the chord; the engine pulls the ends in.
    expect(ropeLayout([0, 5, 0], [3, 1, 0], 2, 4)[2]).toEqual([1.5, 3, 0])
  })

  it('lays a longer rope in a sag below the chord, exactly its own length', () => {
    const close = (v: number[], w: number[]) => v.forEach((x, i) => expect(x).toBeCloseTo(w[i], 6))
    const pts = ropeLayout([0, 5, 0], [3, 5, 0], 4, 20)
    expect(pts).toHaveLength(21)
    close(pts[0], [0, 5, 0])
    close(pts[20], [3, 5, 0])
    expect(polylineLength(pts)).toBeCloseTo(4, 6)
    // The middle hangs below the ends, and every joint is below the chord.
    expect(pts[10][1]).toBeLessThan(4.2)
    for (const p of pts.slice(1, -1)) expect(p[1]).toBeLessThan(5)
    // The links are all the same length, so each capsule fits its piece of the curve.
    const lengths = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1], p[2] - pts[i][2]))
    for (const l of lengths) expect(l).toBeCloseTo(4 / 20, 2)
    // A vertical rope has nowhere to sag but sideways.
    const hang = ropeLayout([0, 5, 0], [0, 2, 0], 4, 20)
    expect(polylineLength(hang)).toBeCloseTo(4, 6)
    expect(Math.abs(hang[10][0])).toBeGreaterThan(0.5)
    expect(hang[10][1]).toBeCloseTo(3.5, 1)
    // A sloping rope sags down, not along itself: its middle is below the chord's middle.
    const slope = ropeLayout([0, 5, 0], [3, 2, 0], 5, 10)
    expect(polylineLength(slope)).toBeCloseTo(5, 6)
    expect(slope[5][1]).toBeLessThan(3.5 - 0.3)
  })

  it('a lengthened rope between two crates on the floor is laid above the floor and falls onto it, never through', async () => {
    // The sag was laid along gravity with no idea where the floor was: 1.5 m of slack between
    // two crates on the ground put the joints at y = −0.87, and after two seconds the chain was
    // still hanging under the floor, drawn through it, because nothing pushes a link back out.
    const world = await makeWorld()
    const a = put('box', 'A', [-1, 0.3, 0], { size: [0.6, 0.6, 0.6], massMode: 'mass', mass: 2 })
    const b = put('box', 'B', [1, 0.3, 0], { size: [0.6, 0.6, 0.6], massMode: 'mass', mass: 2 })
    const rope = makeLink('r', 'rope', a, b)!
    const length = rope.length + 1.5
    const link = { ...rope, length, segments: ropeSegments(length) }
    world.rebuild([floor(), a, b], [link])
    const laid = world.linkPath(link)
    expect(laid.length).toBe(link.segments + 2)
    // Laid as an arch above the chord, its full length.
    for (const p of laid) expect(p[1]).toBeGreaterThanOrEqual(0.3 - 1e-6)
    expect(Math.max(...laid.map((p) => p[1]))).toBeGreaterThan(0.8)
    expect(polylineLength(laid.slice(1, -1))).toBeCloseTo(length - length / link.segments, 1)
    run(world, 2)
    // Every joint rests on the floor or above it: a 2 cm link's centre sits 2 cm up.
    for (const p of world.linkPath(link).slice(1, -1)) expect(p[1]).toBeGreaterThan(0.01)
    // The pure layout says the same, and only when told where the floor is.
    const sag = ropeLayout([-0.7, 0.3, 0], [0.7, 0.3, 0], 2.9, 14)
    expect(Math.min(...sag.map((p) => p[1]))).toBeLessThan(0)
    const arch = ropeLayout([-0.7, 0.3, 0], [0.7, 0.3, 0], 2.9, 14, 0.02)
    expect(Math.min(...arch.map((p) => p[1]))).toBeGreaterThanOrEqual(0.3 - 1e-9)
    expect(polylineLength(arch)).toBeCloseTo(2.9, 6)
    // A sag that fits above the floor is left as a sag.
    const fits = ropeLayout([-0.7, 2, 0], [0.7, 2, 0], 1.7, 9, 0.02)
    expect(fits[4][1]).toBeLessThan(2)
    expect(fits[4][1]).toBeGreaterThan(0.02)
    world.destroy()
  })

  it('a rope is as long as its definition says: longer hangs lower, shorter lifts the load', async () => {
    // The chain used to be laid straight across the gap whatever length was typed, so editing L
    // in the panel did nothing at all.
    const world = await makeWorld()
    const beam = put('box', 'Beam', [0, 5, 0], { size: [0.15, 0.15, 0.15], motion: 'static' })
    const bob = put('sphere', 'Bob', [0, 2.5, 0], { size: [0.18, 0.18, 0.18], massMode: 'mass', mass: 2 })
    const rope = makeLink('r', 'rope', beam, bob)!
    const hangsAt = (length: number) => {
      world.rebuild([floor(), beam, bob], [{ ...rope, length, segments: ropeSegments(length) }])
      run(world, 3)
      return world.state(bob.id)!.position[1]
    }
    // Beam surface at 4.925, bob surface at length below, centre 0.18 further down.
    expect(hangsAt(rope.length)).toBeCloseTo(2.5, 1)
    expect(hangsAt(1.5)).toBeCloseTo(5 - 0.075 - 1.5 - 0.18, 1)
    expect(hangsAt(3.5)).toBeCloseTo(5 - 0.075 - 3.5 - 0.18, 1)
    // A long rope has more links, and the whole chain is drawn.
    expect(world.linkPath({ ...rope, length: 3.5, segments: ropeSegments(3.5) }).length).toBe(ropeSegments(3.5) + 2)
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

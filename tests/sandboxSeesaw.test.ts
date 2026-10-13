// The seesaw stands on a fulcrum (P28 L4). It stood on a plain box, which read as a crate under a
// plank, not as the pivot of a lever. The stand is now a fixed cone: a triangle seen from the side,
// the fulcrum every textbook draws. A cone's collision shape is a hull, whose centre of mass sits a
// quarter of its height above its base, not at its middle — and a hinge is pinned in the frame of
// that centre of mass. Measured from the middle instead, the pivot sat 0.175 m too low and the
// hinge yanked the plank down onto the cone on the first step. So the moments the sentence quotes
// are checked again here, on the new stand, against the old one, step for step.

import { describe, expect, it } from 'vitest'
import { SimWorld } from '../src/renderer/src/sim/world'
import { DEFAULT_WORLD, type BodyDef, type BodyState, type Link } from '../src/renderer/src/sim/types'
import { floor, put, ball } from '../src/renderer/src/sim/presets'
import { comOffset, localToCom } from '../src/renderer/src/sim/links'
import { makeBody } from '../src/renderer/src/sim/store'
import type { V3 } from '../src/renderer/src/math/vec'

/** Roll angle of a body about z, in degrees, from its quaternion (as sim.test.ts reads it). */
const tilt = (st: BodyState) => (2 * Math.asin(st.rotation[2]) * 180) / Math.PI

/** The seesaw as it was on the cone fulcrum, or on the old box stand, with the light ball where asked. */
function seesaw(stand: 'now' | 'old box', lightX?: number): { bodies: BodyDef[]; links: Link[]; world: Partial<typeof DEFAULT_WORLD> } {
  const standBody: BodyDef = stand === 'old box'
    ? put('box', 'Stand', [0, 0.35, 0], { size: [0.2, 0.7, 0.4], motion: 'static', material: 'steel' })
    : put('cone', 'Stand', [0, 0.35, 0], { size: [0.6, 0.7, 0.6], motion: 'static', material: 'steel' })
  const plank = put('plank', 'Plank', [0, 0.78, 0], { size: [7, 0.1, 0.5], massMode: 'mass', mass: 2, material: 'wood' })
  const heavy = ball('Heavy', [-1, 1.03, 0], { mass: 3, material: 'lead' })
  const light = ball('Light', [lightX ?? 1.5, 1.03, 0], { mass: 1, material: 'wood' })
  const pivotB = stand === 'old box'
    ? [0, plank.position[1] - standBody.position[1], 0] as V3
    : localToCom(standBody, plank.position)
  const hinge: Link = {
    id: 'l_hinge',
    kind: 'hinge',
    a: plank.id,
    b: standBody.id,
    length: 0.1,
    stiffness: 0,
    damping: 0,
    pivotA: [0, 0, 0],
    pivotB
  }
  return { bodies: [floor(), standBody, plank, heavy, light], links: [hinge], world: { airDensity: 0 } }
}

/** Runs a seesaw for `steps` sixtieths of a second; the plank's tilt and centre after every step. */
async function run(setup: ReturnType<typeof seesaw>, steps: number): Promise<{ tilt: number; centre: V3 }[]> {
  const world = await SimWorld.create({ ...DEFAULT_WORLD, ...setup.world })
  world.rebuild(setup.bodies, setup.links)
  const plank = setup.bodies.find((b) => b.name === 'Plank')!
  const out: { tilt: number; centre: V3 }[] = []
  for (let i = 0; i < steps; i++) {
    world.step(1 / 60)
    const st = world.state(plank.id)!
    out.push({ tilt: tilt(st), centre: st.position })
  }
  world.destroy()
  return out
}

describe('a hull body’s centre of mass', () => {
  it('is a quarter of a cone’s height above its base, and a third of the way into a ramp’s right angle', () => {
    // Any pyramid's centroid is a quarter of the way up from its base; a right-angled wedge's is
    // its triangle's centroid, a third of each leg in from the right angle at (−a/2, −b/2).
    expect(comOffset({ ...makeBody('cone', 'C'), size: [0.6, 0.7, 0.6] })).toEqual([0, -0.175, 0])
    expect(comOffset({ ...makeBody('cone', 'C'), size: [-0.6, -0.7, 0.6] })).toEqual([0, -0.175, 0])
    const ramp = comOffset({ ...makeBody('ramp', 'R'), size: [3, 1.5, 1.5] })
    expect(ramp[0]).toBeCloseTo(-0.5, 12)
    expect(ramp[1]).toBeCloseTo(-0.25, 12)
    expect(ramp[2]).toBe(0)
    for (const shape of ['box', 'sphere', 'cylinder', 'capsule', 'plank', 'wall', 'ground', 'pulley'] as const) expect(comOffset(makeBody(shape, 'X'))).toEqual([0, 0, 0])
  })

  it('is where a hinge point is measured from, and turns with the body', () => {
    const cone = { ...makeBody('cone', 'C', [0, 0.35, 0]), size: [0.6, 0.7, 0.6] as V3 }
    // The plank's centre, 0.78 m up, is 0.605 m above the cone's centre of mass at 0.175 m.
    const p = localToCom(cone, [0, 0.78, 0])
    expect(p[0]).toBeCloseTo(0, 12)
    expect(p[1]).toBeCloseTo(0.605, 12)
    expect(p[2]).toBeCloseTo(0, 12)
    // A box turned a quarter turn about z: a point 1 m to its right is 1 m down its own y axis.
    const box = { ...makeBody('box', 'B', [2, 1, 0]), rotation: [0, 0, 90] as V3 }
    const q = localToCom(box, [3, 1, 0])
    expect(q[0]).toBeCloseTo(0, 9)
    expect(q[1]).toBeCloseTo(-1, 9)
  })
})

describe('the seesaw on its fulcrum', () => {
  it('stands its plank on a fixed cone whose tip stays clear of the plank, so they never touch', () => {
    const { bodies, links } = seesaw('now')
    const stand = bodies.find((b) => b.name === 'Stand')!
    const plank = bodies.find((b) => b.name === 'Plank')!
    expect(stand.shape).toBe('cone')
    expect(stand.motion).toBe('static')
    // The tip is under the pivot, 3 cm below the plank: beyond the engine's 2 cm contact reach,
    // so the stand holds the plank only through the hinge, exactly as the box did.
    const tip = stand.position[1] + stand.size[1] / 2
    const underside = plank.position[1] - plank.size[1] / 2
    expect(underside - tip).toBeGreaterThanOrEqual(0.025)
    // The hinge pins the plank's own centre, measured in the cone's centre-of-mass frame.
    expect(links[0].kind).toBe('hinge')
    expect(links[0].pivotA).toEqual([0, 0, 0])
    const pivot = links[0].pivotB!
    const want = localToCom(stand, plank.position)
    for (let i = 0; i < 3; i++) expect(pivot[i]).toBeCloseTo(want[i], 12)
  })

  it('holds the plank’s centre on the pin while the heavy side goes down, as on the old box stand', async () => {
    const now = await run(seesaw('now'), 90)
    const old = await run(seesaw('old box'), 90)
    // The heavy side goes down: 3 kg × 1 m against 1 kg × 1.5 m.
    expect(now[59].tilt).toBeGreaterThan(5)
    for (let i = 0; i < now.length; i++) {
      // The pin stays put: a pivot measured from the cone's middle dragged it 0.105 m down. The
      // hinge itself gives about half a millimetre when the plank lands, on the box stand as well.
      expect(Math.hypot(now[i].centre[0], now[i].centre[1] - 0.78, now[i].centre[2]), `step ${i + 1}`).toBeLessThan(2e-3)
      // And the lever turns as it did on the box. Two runs of the same scene differ by about a
      // hundredth of a degree in this engine (its solver order is not repeatable between worlds),
      // so a tenth of a degree is the same motion.
      expect(Math.abs(now[i].tilt - old[i].tilt), `step ${i + 1}`).toBeLessThan(0.1)
    }
  })

  it('balances with the light ball dragged out to 3 m, as its sentence says, exactly as on the box', async () => {
    const now = await run(seesaw('now', 3), 180)
    const old = await run(seesaw('old box', 3), 180)
    for (let i = 0; i < now.length; i++) {
      expect(Math.abs(now[i].tilt), `step ${i + 1}`).toBeLessThan(0.01)
      expect(Math.abs(now[i].tilt - old[i].tilt), `step ${i + 1}`).toBeLessThan(0.001)
    }
  })
})

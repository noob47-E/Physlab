// The Sandbox floor is an exact plane for the engine (SB3fix) and still a floor to the horizon for the eye.
//
// SB3 made the floor 10 km across so the camera never sees an edge. As a physics box that size it
// broke what the Sandbox exists to show: Jolt works its contacts out in 32-bit numbers against the
// box's corners 5 km from the origin, so a ball dropped straight down drifted a centimetre
// sideways, the moon ball 2 mm, the foam ball got 0.012 m/s sideways and a resting ball sat 3 mm
// low. A plane has no corners and its normal is exactly up: nothing is pushed sideways, and the
// top is where the box's top face was. The drawn floor is the body's own size and is unchanged
// (tests/sandboxFloor.test.ts checks that it reaches the horizon).

import { describe, expect, it } from 'vitest'
import { isPlaneFloor, PLANE_FLOOR_FROM, SimWorld } from '../src/renderer/src/sim/world'
import { DEFAULT_WORLD, type BodyDef, type WorldSettings } from '../src/renderer/src/sim/types'
import { DEFAULT_SIZE, makeBody, startingScene } from '../src/renderer/src/sim/store'
import { PRESETS } from '../src/renderer/src/sim/presets'
import type { V3 } from '../src/renderer/src/math/vec'

const G = DEFAULT_WORLD.gravity
const R = 0.25

/** The floor the Sandbox makes: the ground shape at its default size, its top at y = 0. */
const floor = (): BodyDef => makeBody('ground', 'Floor', [0, -0.2, 0])
/** The same floor built as the box SB3 made, which is what these checks must fail on. */
const boxFloor = (size: V3 = DEFAULT_SIZE.ground): BodyDef => ({ ...floor(), shape: 'box', size })
const ball = (at: V3, over: Partial<BodyDef> = {}): BodyDef => ({ ...makeBody('sphere', 'A', at), ...over })

const world = (over: Partial<WorldSettings> = {}) => SimWorld.create({ ...DEFAULT_WORLD, airDensity: 0, allowSleeping: false, ...over })

/** `seconds` of the world's own steps: 1/240 s each at the default rate. */
function run(w: SimWorld, seconds: number): void {
  const steps = Math.round(seconds * w.stepRate)
  for (let i = 0; i < steps; i++) w.stepOnce()
}

/** A ball dropped from 2 m at the given x, with the given floor, for 10 s: where it ends and how fast it moves. */
async function drop(f: BodyDef, x: number, over: Partial<WorldSettings> = {}) {
  const w = await world(over)
  const b = ball([x, 2, 0])
  w.rebuild([f, b], [])
  expect(w.stepRate).toBe(240)
  run(w, 10)
  const s = w.state(b.id)!
  w.destroy()
  return s
}

describe('which floors the engine builds as a plane', () => {
  it('a fixed floor a kilometre wide each way or more is a plane; anything narrower is a slab with edges', () => {
    expect(isPlaneFloor(floor())).toBe(true)
    expect(isPlaneFloor({ ...floor(), size: [PLANE_FLOOR_FROM, 0.4, PLANE_FLOOR_FROM] })).toBe(true)
    // A floor a student made smaller on purpose, or a file saved when the floor was 200 m, opens as a box of that size.
    expect(isPlaneFloor({ ...floor(), size: [PLANE_FLOOR_FROM - 1, 0.4, PLANE_FLOOR_FROM] })).toBe(false)
    expect(isPlaneFloor({ ...floor(), size: [PLANE_FLOOR_FROM, 0.4, PLANE_FLOOR_FROM - 1] })).toBe(false)
    expect(isPlaneFloor({ ...floor(), size: [200, 0.4, 200] })).toBe(false)
    // A plane is for fixed bodies only, and only the ground shape is one.
    expect(isPlaneFloor({ ...floor(), motion: 'kinematic' })).toBe(false)
    expect(isPlaneFloor({ ...floor(), motion: 'dynamic' })).toBe(false)
    expect(isPlaneFloor(boxFloor())).toBe(false)
  })

  it('the floor of the starting scene, of every experiment and of a floor added by hand is a plane', () => {
    expect(isPlaneFloor(makeBody('ground', 'Floor'))).toBe(true)
    for (const [name, bodies] of [['the starting scene', startingScene()], ...PRESETS.map((p): [string, BodyDef[]] => [p.id, p.build().bodies])] as [string, BodyDef[]][]) {
      expect(bodies.filter((b) => b.shape === 'ground').every(isPlaneFloor), name).toBe(true)
    }
  })

  it('what is drawn is still the floor body’s own size, to the horizon: the plane does not shrink it', () => {
    expect(DEFAULT_SIZE.ground).toEqual([10000, 0.4, 10000])
    // The floor is a plane from 1 km up, so the default drawn floor is one. How far the plane reaches
    // (the drawn floor's own half-width, 5 km) is tested below, with balls 4.9 km out each way.
    expect(PLANE_FLOOR_FROM).toBeLessThanOrEqual(DEFAULT_SIZE.ground[0])
  })
})

describe('a ball dropped straight down never moves sideways', () => {
  it('dropped from 2 m at x = -1 for 10 s at 240 steps a second: x and vx unchanged to a micrometre', async () => {
    const s = await drop(floor(), -1)
    expect(Math.abs(s.position[0] + 1)).toBeLessThan(1e-6)
    expect(Math.abs(s.velocity[0])).toBeLessThan(1e-6)
    expect(Math.abs(s.position[2])).toBeLessThan(1e-6)
    expect(Math.abs(s.position[1] - R)).toBeLessThan(5e-4)
  })

  it('the same in a world that is not held to a plane, and far from the origin', async () => {
    for (const twoD of [true, false]) {
      for (const x of [-1, 7.3, -1000, 4000]) {
        const s = await drop(floor(), x, { twoD })
        expect(Math.abs(s.position[0] - x), `x = ${x}, twoD ${twoD}`).toBeLessThan(1e-6)
        expect(Math.abs(s.velocity[0]), `x = ${x}, twoD ${twoD}`).toBeLessThan(1e-6)
        expect(Math.abs(s.position[2]), `x = ${x}, twoD ${twoD}`).toBeLessThan(1e-6)
      }
    }
  })

  it('would have failed on the 10 km box SB3 made: the check can fail', async () => {
    const s = await drop(boxFloor(), -1)
    expect(Math.abs(s.position[0] + 1)).toBeGreaterThan(1e-4)
  })
})

describe('a ball far from the origin moves as it does at the origin', () => {
  /** How far a ball rolling at 1 m/s from x0 has gone in 5 s, and how high it sits. */
  async function roll(f: BodyDef, x0: number) {
    const w = await world()
    const b = ball([x0, R, 0], { velocity: [1, 0, 0], angularVelocity: [0, 0, -1 / R] })
    w.rebuild([f, b], [])
    run(w, 5)
    const s = w.state(b.id)!
    w.destroy()
    return { dx: s.position[0] - x0, y: s.position[1], vx: s.velocity[0] }
  }

  it('100 m out it goes the same distance to 0.1 mm', async () => {
    const home = await roll(floor(), 0)
    const far = await roll(floor(), 100)
    expect(home.dx).toBeGreaterThan(2)
    expect(Math.abs(far.dx - home.dx)).toBeLessThan(1e-4)
  })

  it('a kilometre out it goes the same distance to a millimetre (32-bit positions are 61 µm apart there)', async () => {
    const home = await roll(floor(), 0)
    const far = await roll(floor(), 1000)
    // 1e-4 m cannot be asked at 1 km of any engine that keeps positions in 32 bits: one step of the
    // position is 6.1e-5 m there, and 1200 steps are added up. The box SB3 made was 21 mm off.
    expect(Math.abs(far.dx - home.dx)).toBeLessThan(1e-3)
    expect(Math.abs(far.y - R)).toBeLessThan(2e-4)
  })

  it('would have failed on the 10 km box SB3 made: the check can fail', async () => {
    const home = await roll(boxFloor(), 0)
    const far = await roll(boxFloor(), 1000)
    expect(Math.abs(far.dx - home.dx)).toBeGreaterThan(1e-3)
  })
})

/** The projectile experiment's ball (14 m/s at 30°, bounce 0.3, radius 0.3 m) after 10 s: how high it sits. */
async function projectileHeight(f: BodyDef): Promise<number> {
  const w = await world()
  const b = ball([-8, 0.3, 0], { size: [0.3, 0.3, 0.3], mass: 0.5, restitution: 0.3, velocity: [14 * Math.cos(Math.PI / 6), 14 * Math.sin(Math.PI / 6), 0] })
  w.rebuild([f, b], [])
  run(w, 10)
  const y = w.state(b.id)!.position[1]
  w.destroy()
  return y
}

describe('a ball on the floor sits at its radius', () => {
  it('put on it at rest it stays there to half a millimetre for 10 s', async () => {
    const w = await world()
    const b = ball([0, R, 0])
    w.rebuild([floor(), b], [])
    for (let t = 0; t < 10; t++) {
      run(w, 1)
      expect(Math.abs(w.state(b.id)!.position[1] - R), `t = ${t + 1} s`).toBeLessThan(5e-4)
    }
    w.destroy()
  })

  it('dropped from 2 m it bounces away and ends at its radius to half a millimetre', async () => {
    const s = await drop(floor(), 0)
    expect(Math.abs(s.position[1] - R)).toBeLessThan(5e-4)
    expect(Math.abs(s.velocity[1])).toBeLessThan(1e-3)
  })

  it('a crate and a 40 kg ball rest at their half-heights, as the box floor held them', async () => {
    const w = await world()
    const crate = { ...makeBody('box', 'B', [3, 0.3, 0]) }
    const big = ball([-3, 0.5, 0], { size: [0.5, 0.5, 0.5], mass: 40 })
    w.rebuild([floor(), crate, big], [])
    run(w, 5)
    expect(Math.abs(w.state(crate.id)!.position[1] - 0.3)).toBeLessThan(5e-4)
    expect(Math.abs(w.state(big.id)!.position[1] - 0.5)).toBeLessThan(5e-4)
    w.destroy()
  })

  it('a ball that has landed and rolled on, like the projectile’s, ends at its radius to half a millimetre', async () => {
    // The projectile experiment: landing at 14 m/s and 30°, the ball ended 0.297 on the 10 km box where the plane leaves 0.300.
    expect(Math.abs((await projectileHeight(floor())) - 0.3)).toBeLessThan(5e-4)
  })

  it('would have rested low on the 10 km box SB3 made: the check can fail', async () => {
    expect(Math.abs((await projectileHeight(boxFloor())) - 0.3)).toBeGreaterThan(5e-4)
  })
})

describe('the experiments that drop a ball keep it where it was dropped', () => {
  for (const id of ['fall', 'drop', 'moon']) {
    it(`${id}: no ball moves sideways in 10 s, and each ends resting at its radius`, async () => {
      const built = PRESETS.find((p) => p.id === id)!.build()
      const w = await SimWorld.create({ ...DEFAULT_WORLD, ...(built.world ?? {}) })
      w.rebuild(built.bodies, built.links ?? [])
      run(w, 10)
      const balls = built.bodies.filter((b) => b.shape === 'sphere')
      expect(balls.length).toBeGreaterThan(0)
      for (const b of balls) {
        const s = w.state(b.id)!
        expect(Math.abs(s.position[0] - b.position[0]), `${id} ${b.name} x`).toBeLessThan(1e-6)
        expect(Math.abs(s.velocity[0]), `${id} ${b.name} vx`).toBeLessThan(1e-6)
        expect(Math.abs(s.position[1] - b.size[0]), `${id} ${b.name} y`).toBeLessThan(5e-4)
      }
      w.destroy()
    })
  }
})

describe('the plane is where the box’s top face was', () => {
  it('reaches as far as the drawn floor does: a ball 4.9 km out stands on it', async () => {
    const w = await world()
    const out = ball([4900, 1, 0])
    const back = ball([-4900, 1, 0])
    w.rebuild([floor(), out, back], [])
    run(w, 3)
    expect(Math.abs(w.state(out.id)!.position[1] - R)).toBeLessThan(5e-4)
    expect(Math.abs(w.state(back.id)!.position[1] - R)).toBeLessThan(5e-4)
    w.destroy()
  })

  it('has its top half the thickness above the body, whatever the thickness', async () => {
    for (const [thickness, y] of [[0.4, -0.2], [2, -1], [0.04, -0.02]] as const) {
      const w = await world()
      const b = ball([0, 1, 0])
      w.rebuild([{ ...floor(), size: [10000, thickness, 10000], position: [0, y, 0] }, b], [])
      run(w, 4)
      expect(Math.abs(w.state(b.id)!.position[1] - R), `thickness ${thickness}`).toBeLessThan(5e-4)
      w.destroy()
    }
  })

  it('keeps the friction and the bounce of its material: a ball dropped from 2 m comes back to e² of it', async () => {
    const w = await world()
    const b = ball([0, 2 + R, 0], { restitution: 0.5 })
    const f = { ...floor(), restitution: 0.5 }
    w.rebuild([f, b], [])
    // Combined bounce is the larger of the two (0.5): up at e times the speed it hit with.
    let peak = 0
    let hit = false
    for (let i = 0; i < 4 * w.stepRate; i++) {
      w.stepOnce()
      const s = w.state(b.id)!
      if (s.velocity[1] > 0.1) hit = true
      if (hit) peak = Math.max(peak, s.position[1] - R)
    }
    expect(peak).toBeGreaterThan(2 * 0.25 * 0.9)
    expect(peak).toBeLessThan(2 * 0.25 * 1.1)
    w.destroy()
  })

  it('stays under a ball when its position is typed (updateBody)', async () => {
    const w = await world()
    const f = floor()
    const b = ball([0, R, 0])
    w.rebuild([f, b], [])
    run(w, 1)
    // Typing a new height is a choice, not a structural change: the floor moves, nothing is rebuilt.
    expect(w.updateBody({ ...f, position: [0, -0.7, 0] })).toBe(true)
    run(w, 3)
    expect(Math.abs(w.state(b.id)!.position[1] - (-0.5 + R))).toBeLessThan(5e-4)
    w.destroy()
  })

  it('a ball asleep on it wakes and falls when the floor is typed lower', async () => {
    // With sleeping allowed (the app's default) a resting ball goes to sleep, and a static floor
    // that moves does not wake it by itself: it hung in the air where the floor had been.
    const w = await world({ allowSleeping: true })
    const f = floor()
    const b = ball([0, R, 0])
    w.rebuild([f, b], [])
    run(w, 3)
    expect(Math.abs(w.state(b.id)!.position[1] - R)).toBeLessThan(5e-4)
    expect(w.updateBody({ ...f, position: [0, -0.7, 0] })).toBe(true)
    run(w, 3)
    expect(Math.abs(w.state(b.id)!.position[1] - (-0.5 + R))).toBeLessThan(5e-4)
    w.destroy()
  })

  it('tilted by 10° a frictionless ball slides down it at g sin 10°, as it would down the box', async () => {
    const theta = 10
    const t = (theta * Math.PI) / 180
    const slope = async (viaUpdate: boolean) => {
      const w = await world()
      const f = { ...floor(), friction: 0, rotation: [0, 0, viaUpdate ? 0 : theta] as V3 }
      // On the sloped top, one radius from it along the normal, over the point the body's centre sits under.
      const top: V3 = [-0.2 * Math.sin(t), -0.2 + 0.2 * Math.cos(t), 0]
      const b = ball([top[0] - R * Math.sin(t), top[1] + R * Math.cos(t), 0], { friction: 0 })
      w.rebuild([f, b], [])
      if (viaUpdate) expect(w.updateBody({ ...f, rotation: [0, 0, theta] })).toBe(true)
      run(w, 1)
      const s = w.state(b.id)!
      w.destroy()
      return Math.hypot(s.velocity[0], s.velocity[1])
    }
    // The slope is the plane's own, not a flat floor with a ball sliding off it.
    expect(await slope(false)).toBeCloseTo(G * Math.sin(t), 1)
    expect(Math.abs((await slope(true)) - G * Math.sin(t))).toBeLessThan(0.05)
  })
})

describe('a narrower floor is still a slab with an edge', () => {
  it('a 50 m floor is the box it was: a ball sliding off its end falls for ever', async () => {
    const w = await world()
    const b = ball([0, R, 0], { velocity: [30, 0, 0], friction: 0 })
    w.rebuild([{ ...floor(), size: [50, 0.4, 50], friction: 0 }, b], [])
    run(w, 4)
    expect(w.state(b.id)!.position[1]).toBeLessThan(-5)
    w.destroy()
  })

  it('the same ball on the full floor is still on it', async () => {
    const w = await world()
    const b = ball([0, R, 0], { velocity: [30, 0, 0], friction: 0 })
    w.rebuild([{ ...floor(), friction: 0 }, b], [])
    run(w, 4)
    expect(Math.abs(w.state(b.id)!.position[1] - R)).toBeLessThan(5e-4)
    expect(w.state(b.id)!.position[0]).toBeGreaterThan(100)
    w.destroy()
  })
})

describe('the plane leaks nothing', () => {
  it('rebuilding over and over, and swapping it for a box and back, ends with the tracked handles it started with', async () => {
    const w = await world()
    const b = ball([0, 2, 0])
    const f = floor()
    w.rebuild([f, b], [])
    run(w, 0.1)
    const base = w.handleCount
    for (let i = 0; i < 20; i++) {
      // The floor crossing the plane's threshold builds it again, as a box one time and a plane the next.
      w.rebuild([i % 2 ? f : { ...f, size: [500, 0.4, 500] }, b], [])
      run(w, 0.05)
    }
    w.rebuild([f, b], [])
    run(w, 0.1)
    expect(w.handleCount).toBe(base)
    w.destroy()
  })

  it('costs no more handles than the box floor it replaced', async () => {
    const w = await world()
    w.rebuild([boxFloor(), ball([0, 2, 0])], [])
    const box = w.handleCount
    w.rebuild([floor(), ball([0, 2, 0])], [])
    expect(w.handleCount).toBe(box)
    w.destroy()
  })
})

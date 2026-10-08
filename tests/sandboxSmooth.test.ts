// P13: slow motion is smooth. The engine steps 1/60 s of simulated time at a time; at 0.1× speed a
// step falls due once every ten frames, and each frame drew the last step's pose, so a falling ball
// stood still for nine frames and then jumped. Each frame now draws the pose between the last two
// steps, as far along as the time the frame has gathered towards the next one.

import { beforeAll, describe, expect, it } from 'vitest'
import { SimWorld, STRIDE } from '../src/renderer/src/sim/world'
import { DEFAULT_WORLD, type BodyDef } from '../src/renderer/src/sim/types'

function body(over: Partial<BodyDef> = {}): BodyDef {
  return {
    id: 'ball',
    name: 'Ball',
    shape: 'sphere',
    size: [0.2, 0.2, 0.2],
    // High enough that a 3 s fall (44 m) never reaches the floor: nothing here but free fall.
    position: [0, 100, 0],
    rotation: [0, 0, 0],
    velocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    motion: 'dynamic',
    material: 'steel',
    massMode: 'mass',
    mass: 1,
    restitution: 0.5,
    friction: 0.5,
    linearDamping: 0,
    angularDamping: 0,
    color: '#fff',
    ...over
  }
}

const ball = body({ id: 'ball', name: 'Ball', position: [0, 100, 0] })
const yOf = (w: SimWorld, t: Float32Array) => t[w.bodyOrder.indexOf('ball') * STRIDE + 1]

describe('smooth slow motion (P13)', () => {
  beforeAll(async () => {
    await SimWorld.create()
  }, 30_000)

  it('moves the drawn ball a little on every frame at 0.1x, never nine frames still and then a jump', async () => {
    const w = await SimWorld.create({ ...DEFAULT_WORLD, airDensity: 0, timeScale: 0.1 })
    w.rebuild([ball], [])
    // Get the ball moving first: two steps of the run.
    for (let i = 0; i < 20; i++) w.step(1 / 60)
    const ys: number[] = []
    for (let i = 0; i < 30; i++) ys.push(yOf(w, w.step(1 / 60).transforms))
    for (let i = 1; i < ys.length; i++) expect(ys[i], 'frame ' + i).toBeLessThan(ys[i - 1])
    // And the drawn pose never runs ahead of the engine's own.
    expect(ys[ys.length - 1]).toBeGreaterThanOrEqual(w.state('ball')!.position[1] - 1e-9)
    w.destroy()
  })

  it('draws a body moved while paused where it now is, at once', async () => {
    const w = await SimWorld.create({ ...DEFAULT_WORLD, airDensity: 0, timeScale: 0.1 })
    w.rebuild([ball], [])
    for (let i = 0; i < 25; i++) w.step(1 / 60)
    w.placeBody('ball', [0, 50, 0])
    expect(yOf(w, w.step(0).transforms)).toBeCloseTo(50, 9)
    w.destroy()
  })

  it('draws the engine pose exactly after Step one frame', async () => {
    const w = await SimWorld.create({ ...DEFAULT_WORLD, airDensity: 0, timeScale: 0.1 })
    w.rebuild([ball], [])
    const { transforms } = w.stepOnce()
    expect(yOf(w, transforms)).toBeCloseTo(w.state('ball')!.position[1], 9)
    expect(yOf(w, w.step(0).transforms)).toBeCloseTo(w.state('ball')!.position[1], 9)
    w.destroy()
  })

  it('keeps the time gathered towards the next step through a mid-run edit', async () => {
    const w = await SimWorld.create({ ...DEFAULT_WORLD, airDensity: 0 })
    w.rebuild([ball], [])
    w.step(1 / 120)
    w.rebuild(undefined, undefined, true)
    w.step(1 / 120)
    expect(w.time).toBeCloseTo(1 / 60, 12)
    w.destroy()
  })
})

describe('what is drawn beside a body follows its drawn pose (P13)', () => {
  it('drawn() is the blended pose; state() stays the engine’s', async () => {
    const w = await SimWorld.create({ ...DEFAULT_WORLD, airDensity: 0, timeScale: 0.1 })
    w.rebuild([ball], [])
    for (let i = 0; i < 25; i++) w.step(1 / 60)
    const t = w.step(1 / 60).transforms
    expect(w.drawn('ball')!.position[1]).toBe(yOf(w, t))
    expect(w.drawn('ball')!.velocity).toEqual(w.state('ball')!.velocity)
    w.destroy()
  })
})

describe('a body placed while paused part-way (SM1b check)', () => {
  // SM1b rewrote the world's copy of a placed body's definition, so the next mid-run edit sent the
  // body back to its start; the wheel's rim now reads where the wheel is instead.
  it('a body dragged while paused part-way keeps its place through a later edit to another body', async () => {
    const w = await SimWorld.create({ ...DEFAULT_WORLD, airDensity: 0 })
    const other = { ...ball, id: 'other', name: 'Other', position: [5, 100, 0] as [number, number, number] }
    w.rebuild([ball, other], [])
    for (let i = 0; i < 30; i++) w.step(1 / 60)
    w.placeBody('ball', [3, 40, 0])
    w.rebuild([ball, { ...other, mass: 5 }], [], true)
    expect(w.state('ball')!.position).toEqual([3, 40, 0])
    w.destroy()
  })
})

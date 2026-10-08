// P12 — the Sandbox's recording sits on the simulation's own clock, not on the frame clock.
//
// It used to ride on the 10 Hz live-value publish in SandboxView (`w.time - published > 0.1`).
// `time` was a running sum of 1/60 and six steps of it read 0.09999999999999999, so "past 0.1 s?"
// was false at step 6 and true only at step 7: on a smooth 60 frames a second the readings fell
// 0.1167 s apart (with runs of 0.1 s wherever the sum had drifted), the first at 0.1167 s and none
// at t = 0; on a slow frame (1/20 s, or a 0.25 s frame clamped to 0.1 s the way the view clamps
// it) they fell 0.15 s apart, the first at 0.15 s. Plot y against t, or fit a line to t², and the
// time column was a grid nobody had chosen. The engine now takes the readings itself, on every
// 6th fixed step (t = 0, 0.1, 0.2 …), and counts steps instead of adding up 1/60, so the clock
// reads exactly 2 s after 120 of them.
//
// These tests drive the real world (Jolt loads in node) with the frame times the view uses and
// fast-forward: no frame is waited for.

import { beforeAll, describe, expect, it } from 'vitest'
import { SimWorld, type SimSample } from '../src/renderer/src/sim/world'
import { DEFAULT_WORLD, type BodyDef, type WorldSettings } from '../src/renderer/src/sim/types'

const G = 9.81

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

const floor = body({ id: 'floor', name: 'Floor', shape: 'box', size: [50, 1, 50], position: [0, -0.5, 0], motion: 'static' })

/** A world holding these bodies at t = 0, as the Sandbox leaves it after a Reset. */
async function worldWith(bodies: BodyDef[], settings: Partial<WorldSettings> = {}): Promise<SimWorld> {
  const world = await SimWorld.create({ ...DEFAULT_WORLD, airDensity: 0, ...settings })
  world.rebuild(bodies, [])
  return world
}

/** One frame of the Sandbox's loop: the world gets the frame time, never more than 0.1 s of it (SandboxView, useFrame). */
const frame = (world: SimWorld, seconds: number): SimSample[] => world.step(Math.min(seconds, 0.1)).samples

/** Plays frames until the sim clock reaches `until` and returns every reading taken on the way. */
function play(world: SimWorld, frameSeconds: number, until: number): SimSample[] {
  const taken: SimSample[] = []
  for (let frames = 0; world.time < until && frames < 100_000; frames++) taken.push(...frame(world, frameSeconds))
  return taken
}

/** t = 0, 0.1, 0.2 … `to`, each written as the nearest number to k/10 — what a reading at step 6k must be. */
const grid = (to: number): number[] => Array.from({ length: to * 10 + 1 }, (_, k) => k / 10)

const times = (samples: SimSample[]): number[] => samples.map((s) => s.t)

describe('the recorder takes its readings on the simulation clock, not the frame clock (P12)', () => {
  beforeAll(async () => {
    // Loading the WASM engine once can take a moment.
    await SimWorld.create()
  }, 30_000)

  it.each([
    ['144 frames a second, where some frames hold no step at all', 1 / 144],
    ['60 frames a second', 1 / 60],
    ['20 frames a second', 1 / 20],
    ['a 0.25 s frame, clamped to 0.1 s as the view clamps it', 0.25]
  ])('takes 31 readings in 3 s of sim time, at t = 0, 0.1 … 3 exactly, at %s', async (_name, frameSeconds) => {
    const world = await worldWith([body()])
    const samples = play(world, frameSeconds, 3)
    expect(samples).toHaveLength(31)
    expect(times(samples)).toEqual(grid(3))
  })

  it('takes each reading at the step it belongs to, not at the end of the frame that held it', async () => {
    const world = await worldWith([body()])
    // One frame of a single step, then frames of three: the frames now end on steps 1, 4, 7, 10 …,
    // so steps 6, 12, 18 … fall in the middle of a frame, where a reading taken once the frame is
    // over would be a step out.
    const samples = frame(world, 1 / 60)
    while (world.time < 3) samples.push(...frame(world, 1 / 20))
    expect(times(samples)).toEqual(grid(3))
    for (const s of samples) {
      // Free fall: v = −g t at the instant of the reading. A reading one step out is g/60 = 0.16 m/s away.
      expect(s.states.ball.velocity[1], `speed at t = ${s.t}`).toBeCloseTo(-G * s.t, 1)
    }
  })

  it('keeps the same grid in slow motion: the clock decides where a reading falls, not the speed it is shown at', async () => {
    const world = await worldWith([body()], { timeScale: 0.25 })
    const samples = play(world, 1 / 60, 2)
    expect(times(samples)).toEqual(grid(2))
  })

  it('takes the t = 0 reading from the untouched start, once, and never from a paused frame', async () => {
    const world = await worldWith([body({ velocity: [2, 0, 0] })])
    // Paused: the view calls step(0) every frame. It must neither take the reading nor use it up.
    for (let i = 0; i < 100; i++) expect(world.step(0).samples).toEqual([])
    expect(world.time).toBe(0)

    const first = frame(world, 1 / 60)
    expect(first).toHaveLength(1)
    expect(first[0].t).toBe(0)
    // Before any step has moved it: still at its start height, still at the speed it was given.
    expect(first[0].states.ball.position[1]).toBe(100)
    expect(first[0].states.ball.velocity[0]).toBeCloseTo(2, 5)
    // Once per run.
    expect(frame(world, 1 / 60)).toEqual([])
  })

  it('does not repeat the t = 0 reading when the scene is edited before the first step has fallen', async () => {
    const ball = body()
    const world = await worldWith([ball])
    // A short first frame (a 144 Hz screen): the run has begun and the start has been read, but
    // 0.001 s is less than one step, so the clock still reads 0.
    expect(times(frame(world, 0.001))).toEqual([0])
    expect(world.time).toBe(0)
    // Changing a mass now keeps the run going; the start was already read and is not read again.
    world.rebuild([{ ...ball, mass: 5 }], [], true)
    expect(times(play(world, 1 / 60, 1))).toEqual(grid(1).slice(1))
  })

  it('is not thrown off by pausing: paused frames add no readings and lose none', async () => {
    const world = await worldWith([body()])
    const samples = play(world, 1 / 60, 1)
    for (let i = 0; i < 30; i++) samples.push(...world.step(0).samples)
    samples.push(...play(world, 1 / 60, 3))
    expect(times(samples)).toEqual(grid(3))
  })

  it('starts the grid again at t = 0 after a Reset, and keeps it going through an edit that keeps the clock', async () => {
    const ball = body()
    const world = await worldWith([ball])

    // An edit that leaves the run going (a mass changed mid-run): no second t = 0, no hole.
    const before = play(world, 1 / 60, 1)
    world.rebuild([{ ...ball, mass: 5 }], [], true)
    expect(world.time).toBe(1)
    const after = play(world, 1 / 60, 2)
    expect(times([...before, ...after])).toEqual(grid(2))

    // Reset: every body back to its definition, the clock at zero, and the grid starts over.
    world.rebuild([ball], [])
    expect(world.time).toBe(0)
    expect(times(play(world, 1 / 60, 1))).toEqual(grid(1))
  })

  it('counts steps instead of adding up 1/60, so the clock reads exactly 2 s after 120 of them', async () => {
    const world = await worldWith([body()])
    // One frame of 1/60 s is one fixed step, so after n frames the clock must read n/60 — the
    // nearest number to it, not a sum that has drifted (it used to read 1.9999999999999978 at 2 s).
    const off: { step: number; read: number }[] = []
    for (let n = 1; n <= 3600; n++) {
      world.step(1 / 60)
      if (world.time !== n / 60) off.push({ step: n, read: world.time })
    }
    expect(off.slice(0, 3)).toEqual([])
  })

  it('reads the moving bodies only: a floor or a wall is not a reading', async () => {
    const world = await worldWith([floor, body(), body({ id: 'ball2', name: 'Second', position: [3, 100, 0] })])
    const [first] = frame(world, 1 / 60)
    expect(Object.keys(first.states).sort()).toEqual(['ball', 'ball2'])
  })
})

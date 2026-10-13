// The Sandbox floor (owner, 2026-10-09): it moved when it was grabbed, and it was too small.
//
// A press on any body while paused "arranged" it — the floor included, so a student who dragged
// across the ground to turn the view slid the whole world out from under the experiment. The floor
// is fixed: a press on it is a press on empty space, and the engine refuses to place it.
//
// It was 200 m across. From an experiment's Home view the camera sees much further than that: Drop
// the foam ball from 45 m, press Home, and the floor showed as a grey tile with its corners in
// view. It now runs far enough that, wherever the Home view or the opening view looks down at the
// ground, it finds ground — up to 1° below the horizon, where the far edge sits as the horizon line.
// Its top, its friction and its bounce are what they were, so no number any experiment quotes moves.

import { describe, expect, it } from 'vitest'
import { grabAction } from '../src/renderer/src/sim/inspector'
import { SimWorld } from '../src/renderer/src/sim/world'
import { DEFAULT_WORLD, type BodyDef } from '../src/renderer/src/sim/types'
import { DEFAULT_SIZE, makeBody, startingScene } from '../src/renderer/src/sim/store'
import { materialById } from '../src/renderer/src/sim/materials'
import { PRESETS } from '../src/renderer/src/sim/presets'
import { SANDBOX_FAR, SANDBOX_FOV, SANDBOX_START_VIEW, sandboxHomeView, type CameraView } from '../src/renderer/src/render/sandboxCamera'
import { readSource } from './helpers/repo'
import type { V3 } from '../src/renderer/src/math/vec'

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const unit = (a: V3): V3 => {
  const l = Math.hypot(...a)
  return [a[0] / l, a[1] / l, a[2] / l]
}

const floorOf = (bodies: BodyDef[]): BodyDef => bodies.find((b) => b.shape === 'ground')!
const topOf = (floor: BodyDef): number => floor.position[1] + floor.size[1] / 2

/**
 * Where the camera looks down at the ground but finds none: rays across the whole picture that
 * point at least `belowDeg` below the horizon and meet the floor's plane before the far plane, but
 * outside the floor. Empty when the floor fills everything below the horizon line.
 */
function bareGround(view: CameraView, floor: BodyDef, aspect: number, belowDeg = 1): string[] {
  const f = unit(sub(view.target, view.position))
  const right = unit(cross(f, [0, 1, 0]))
  const up = cross(right, f)
  const tv = Math.tan(((SANDBOX_FOV / 2) * Math.PI) / 180)
  const th = tv * aspect
  const top = topOf(floor)
  const misses: string[] = []
  for (let i = 0; i <= 24; i++) {
    for (let j = 0; j <= 24; j++) {
      const u = -1 + i / 12
      const v = -1 + j / 12
      const dir = unit([f[0] + right[0] * u * th + up[0] * v * tv, f[1] + right[1] * u * th + up[1] * v * tv, f[2] + right[2] * u * th + up[2] * v * tv])
      if (dir[1] > -Math.sin((belowDeg * Math.PI) / 180)) continue
      const t = (top - view.position[1]) / dir[1]
      if (!(t > 0) || t * dot(dir, f) > SANDBOX_FAR) continue
      const x = view.position[0] + dir[0] * t
      const z = view.position[2] + dir[2] * t
      if (Math.abs(x - floor.position[0]) > floor.size[0] / 2 || Math.abs(z - floor.position[2]) > floor.size[2] / 2) misses.push(`(${x.toFixed(0)}, ${z.toFixed(0)})`)
    }
  }
  return misses
}

/** Every view a student is shown an experiment from: Home side-on and turned, and the two opening views. */
const viewsOf = (bodies: BodyDef[]): [string, CameraView][] => [
  ['Home, side-on', sandboxHomeView(bodies, (b) => b.position, true)],
  ['Home, turned', sandboxHomeView(bodies, (b) => b.position, false)],
  ['opening, side-on', SANDBOX_START_VIEW.side],
  ['opening, turned', SANDBOX_START_VIEW.turned]
]

describe('the floor never moves when it is grabbed', () => {
  it('a press on the floor neither places it nor pulls it, paused or playing', () => {
    const floor = makeBody('ground', 'Floor', [0, -0.2, 0])
    for (const playing of [false, true]) expect(grabAction(floor, playing)).toBe('none')
    // Everything else behaves as before: a fixed wall is arranged, a ball is arranged when paused
    // and pulled by the hand when playing.
    const wall = makeBody('wall', 'W')
    expect(grabAction(wall, false)).toBe('place')
    expect(grabAction(wall, true)).toBe('place')
    const ball = makeBody('sphere', 'A')
    expect(grabAction(ball, false)).toBe('place')
    expect(grabAction(ball, true)).toBe('pull')
  })

  it('the engine refuses to put the floor anywhere else, and what stands on it stays put', async () => {
    const world = await SimWorld.create({ ...DEFAULT_WORLD, airDensity: 0, allowSleeping: false })
    const floor = makeBody('ground', 'Floor', [0, -0.2, 0])
    const crate = makeBody('box', 'B', [1, 0.3, 0])
    world.rebuild([floor, crate], [])
    world.placeBody(floor.id, [4, 3, 1])
    const at = world.state(floor.id)!.position
    expect(at[0]).toBeCloseTo(0, 6)
    expect(at[1]).toBeCloseTo(-0.2, 6)
    expect(at[2]).toBeCloseTo(0, 6)
    for (let i = 0; i < 30; i++) world.step(1 / 60)
    expect(world.state(crate.id)!.position[1]).toBeCloseTo(0.3, 3)
    // Any other body is still put where it is asked.
    world.placeBody(crate.id, [2, 0.3, 0])
    expect(world.state(crate.id)!.position[0]).toBeCloseTo(2, 6)
    world.destroy()
  })

  it('the viewport asks grabAction what a press does before it drags anything', () => {
    const view = readSource('src/renderer/src/render/SandboxView.tsx')
    expect(view).toMatch(/grabAction\(/)
    // The old rule, which made every fixed body — the floor too — something to drag about.
    expect(view).not.toMatch(/const place = !useScene\.getState\(\)\.playing \|\| def\.motion !== 'dynamic'/)
  })
})

describe('the floor reaches past everything the camera shows', () => {
  const scenes: [string, BodyDef[]][] = [['the starting scene', startingScene()], ...PRESETS.map((p): [string, BodyDef[]] => [p.id, p.build().bodies])]

  it('keeps its top at 0, 0.4 m thick, with the friction and bounce it had: no quoted number moves', () => {
    expect(DEFAULT_SIZE.ground[1]).toBe(0.4)
    for (const [name, bodies] of scenes) {
      const floor = floorOf(bodies)
      expect(topOf(floor), name).toBeCloseTo(0, 12)
      expect(floor.size[1], name).toBe(0.4)
      expect(floor.motion, name).toBe('static')
      // Sliding to a stop sets its floor's μ to 0.4 itself; every other floor has its material's.
      expect(floor.friction, name).toBe(name === 'friction' ? 0.4 : materialById(floor.material).friction)
      expect(floor.restitution, name).toBe(materialById(floor.material).restitution)
    }
  })

  it('is wider and deeper than the widest experiment, with a kilometre to spare', () => {
    let widest = 0
    for (const [, bodies] of scenes) {
      for (const b of bodies) {
        if (b.shape === 'ground') continue
        const reach = Math.max(...b.size.map(Math.abs))
        widest = Math.max(widest, Math.abs(b.position[0]) + reach, Math.abs(b.position[2]) + reach)
      }
    }
    expect(widest).toBeGreaterThan(5)
    for (const [name, bodies] of scenes) {
      const floor = floorOf(bodies)
      expect(floor.size[0] / 2 - Math.abs(floor.position[0]), name).toBeGreaterThan(widest + 1000)
      expect(floor.size[2] / 2 - Math.abs(floor.position[2]), name).toBeGreaterThan(widest + 1000)
    }
    expect(DEFAULT_SIZE.ground[0]).toBe(DEFAULT_SIZE.ground[2])
  })

  it('fills the ground below the horizon in every view of every experiment, in a wide window or a narrow one', () => {
    for (const [name, bodies] of scenes) {
      const floor = floorOf(bodies)
      for (const [label, view] of viewsOf(bodies)) {
        for (const aspect of [1, 1.6, 2.4]) expect(bareGround(view, floor, aspect), `${name}, ${label}, aspect ${aspect}`).toEqual([])
      }
    }
  })

  it('would have shown the old 200 m floor’s edges: the check above is not one that cannot fail', () => {
    const bodies = PRESETS.find((p) => p.id === 'terminal')!.build().bodies
    const old = { ...floorOf(bodies), size: [200, 0.4, 200] as V3 }
    const view = sandboxHomeView(bodies, (b) => b.position, true)
    expect(bareGround(view, old, 1.6).length).toBeGreaterThan(0)
  })
})

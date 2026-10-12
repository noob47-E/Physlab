// SB9: keyframes, input serials and step records (I-4).
//
// The tape (SB12) records every engine step from `readRecord`, and "Branch from here" and Fine
// replay put the world back to a keyframe. Both are only honest if the engine comes back EXACTLY:
// a keyframe saved at 1 s, a run of 3 s, the keyframe restored and the same 3 s run again must give
// every float of every step the same, bit for bit, in each of the six scenes below. A keyframe from
// another build of the world is refused and changes nothing, and a keyframe leaks no engine object.
//
// The scenes are the presets the Sandbox opens (or, for the push and the grab, set up here the way a
// question or a student's hand does it), at the default 240 steps a second with sleeping allowed.

import { beforeAll, describe, expect, it } from 'vitest'
import { SimWorld } from '../src/renderer/src/sim/world'
import { presetById } from '../src/renderer/src/sim/presets'
import { ropeSegments } from '../src/renderer/src/sim/links'
import { REC_FLOATS, Tape } from '../src/renderer/src/sim/tape'
import { DEFAULT_WORLD, type BodyDef, type Keyframe, type Link, type WorldSettings } from '../src/renderer/src/sim/types'
import type { V3 } from '../src/renderer/src/math/vec'

let n = 0
function body(over: Partial<BodyDef> = {}): BodyDef {
  return {
    id: `k${++n}`,
    name: `K${n}`,
    shape: 'sphere',
    size: [0.1, 0.1, 0.1],
    position: [0, 1, 0],
    rotation: [0, 0, 0],
    velocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    motion: 'dynamic',
    material: 'steel',
    massMode: 'mass',
    mass: 1,
    restitution: 0.3,
    friction: 0.5,
    linearDamping: 0,
    angularDamping: 0,
    color: '#fff',
    ...over
  }
}

const floor = (over: Partial<BodyDef> = {}) =>
  body({ shape: 'ground', size: [40, 0.4, 40], position: [0, -0.2, 0], motion: 'static', material: 'concrete', friction: 0.8, ...over })

function link(kind: Link['kind'], a: BodyDef, b: BodyDef, over: Partial<Link> = {}): Link {
  return { id: `kl${++n}`, kind, a: a.id, b: b.id, length: 1, stiffness: 0, damping: 0, ...over }
}

/** A preset as the Sandbox opens it: its world over the default, its bodies and links. */
async function preset(id: string, over: Partial<WorldSettings> = {}): Promise<{ w: SimWorld; bodies: BodyDef[]; links: Link[] }> {
  const built = presetById(id)!.build()
  const w = await SimWorld.create({ ...DEFAULT_WORLD, ...(built.world ?? {}), ...over })
  w.rebuild(built.bodies, built.links ?? [])
  return { w, bodies: built.bodies, links: built.links ?? [] }
}

async function scene(bodies: BodyDef[], links: Link[] = [], over: Partial<WorldSettings> = {}): Promise<SimWorld> {
  const w = await SimWorld.create({ ...DEFAULT_WORLD, ...over })
  w.rebuild(bodies, links)
  return w
}

const byName = (bodies: BodyDef[], name: string): BodyDef => bodies.find((b) => b.name === name)!

/** Floats in one record: every body of the layout, ropes' links included. */
function recordSize(w: SimWorld): number {
  const l = w.recordLayout()
  return (l.bodies.length + l.ropes.reduce((s, r) => s + r.count, 0)) * REC_FLOATS
}

/** Inputs a run makes, by the step about to be taken (the same steps in a re-run). */
type Script = (w: SimWorld, step: number) => void

/**
 * Runs `steps` single steps and returns everything the run shows: each step's record (every body,
 * every rope link: position, rotation, velocity, spin, float32), and, from the after-step hook, the
 * step, the clock, the work of PhysLab's own forces and every contact's numbers; the readings too.
 */
function run(w: SimWorld, steps: number, script?: Script): { records: Float32Array; hook: number[] } {
  const size = recordSize(w)
  const records = new Float32Array(steps * size)
  const one = new Float32Array(size)
  const hook: number[] = []
  const off = w.onAfterStep((_w, s) => {
    hook.push(s.step, s.time, s.dt, s.work.drag, s.work.rolling, s.work.push, s.work.hand, s.work.damper)
    for (const c of s.contacts) hook.push(c.step, c.t, c.approachSpeed, ...c.normal, ...c.point, ...c.vBeforeA, ...c.vBeforeB, ...c.vAfterA, ...c.vAfterB)
    for (const t of s.touches) hook.push(...t.normal, ...t.point, t.added ? 1 : 0)
  })
  for (let i = 0; i < steps; i++) {
    script?.(w, w.stepIndex)
    const out = w.stepOnce()
    for (const r of out.samples) {
      hook.push(r.t)
      for (const st of Object.values(r.states)) hook.push(...st.position, ...st.velocity, st.asleep ? 1 : 0)
    }
    w.readRecord(one)
    records.set(one, i * size)
  }
  off()
  return { records, hook }
}

/** The first place two runs differ (Object.is: −0 is not 0), or −1 when every number is the same. */
function firstDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) return Math.min(a.length, b.length)
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return i
  return -1
}

/** Save at 1 s (or wherever `saveAt` says), run 3 s, restore, run 3 s again: the two runs, and the keyframe. */
async function twice(w: SimWorld, opts: { saveAt?: number; before?: Script; during?: Script } = {}) {
  const rate = w.stepRate
  const saveAt = opts.saveAt ?? rate
  for (let i = 0; i < saveAt; i++) {
    opts.before?.(w, w.stepIndex)
    w.stepOnce()
  }
  opts.before?.(w, w.stepIndex)
  const k = w.saveKeyframe()
  const first = run(w, 3 * rate, opts.during)
  const restored = w.restoreKeyframe(k)
  const back = { step: w.stepIndex, time: w.time }
  const second = run(w, 3 * rate, opts.during)
  return { k, first, second, restored, back, rate, saveAt }
}

function expectSame(r: Awaited<ReturnType<typeof twice>>): void {
  expect(r.restored).toBe(true)
  expect(r.back).toEqual({ step: r.k.step, time: r.k.time })
  expect(r.first.records.length).toBeGreaterThan(0)
  expect(firstDiff(r.first.records, r.second.records)).toBe(-1)
  expect(firstDiff(r.first.hook, r.second.hook)).toBe(-1)
}

beforeAll(async () => {
  // The WASM engine loads once; the first world after it is a warm-up.
  ;(await SimWorld.create()).destroy()
}, 30_000)

describe('a keyframe brings the run back bit for bit (six scenes, 240 steps a second)', () => {
  it('Bouncing ball: saved at 1 s between the first and second bounce; three runs from it are one run', async () => {
    const { w } = await preset('bounce')
    expect(w.stepRate).toBe(240)
    const r = await twice(w)
    expect(r.k).toMatchObject({ step: 240, time: 1, rebuild: w.rebuildSerial })
    expectSame(r)
    // A second restore of the same keyframe gives the same run again.
    expect(w.restoreKeyframe(r.k)).toBe(true)
    const third = run(w, 3 * r.rate)
    expect(firstDiff(r.first.records, third.records)).toBe(-1)
    expect(firstDiff(r.first.hook, third.hook)).toBe(-1)
    // The run had bounces in it to get right (2.03, 3.03 and 3.83 s).
    expect(r.first.hook.length).toBeGreaterThan(8 * 3 * r.rate)
    w.freeKeyframe(r.k)
    w.destroy()
  })

  it('Spring on ice (PhysLab’s own spring)', async () => {
    const { w, links } = await preset('springice')
    expect(w.springModel(links[0].id)).toBe('own')
    expectSame(await twice(w))
    w.destroy()
  })

  it('Crane (a rope of 13 links), the crate set swinging', async () => {
    const { w, bodies } = await preset('crane')
    expect(w.recordLayout().ropes.map((r) => r.count)).toEqual([ropeSegments(2.5)])
    w.setVelocity(byName(bodies, 'Crate').id, [1.2, 0, 0])
    expectSame(await twice(w))
    w.destroy()
  })

  it('a crate under a 25 N push from 0.5 s to 2 s (saved while it pushes)', async () => {
    const crate = body({ shape: 'box', size: [0.5, 0.5, 0.5], position: [0, 0.25, 0], mass: 2, material: 'wood', friction: 0.4, restitution: 0 })
    const w = await scene([floor(), crate])
    w.setActuators([{ bodyId: crate.id, force: () => [25, 0, 0], from: 0.5, until: 2 }])
    const r = await twice(w)
    expectSame(r)
    // The push acted in both runs (it ends at 2 s, inside them) and friction then stopped the crate.
    expect(w.state(crate.id)!.position[0]).toBeGreaterThan(5)
    w.destroy()
  })

  it('Projectile, with air (drag every step, then the landing and the roll)', async () => {
    const { w } = await preset('projectile', { airDensity: 1.225 })
    expectSame(await twice(w))
    w.destroy()
  })

  it('a hand grabs the ball from 1.2 s to 1.6 s; the keyframe is taken after the grab', async () => {
    const { w, bodies } = await preset('bounce')
    const ball = byName(bodies, 'Ball').id
    const rate = 240
    const r = await twice(w, {
      saveAt: 1.2 * rate,
      before: (x, step) => {
        if (step === 1.2 * rate) x.grab(ball, [0.5, 2, 0])
      },
      during: (x, step) => {
        if (step === 1.4 * rate) x.moveGrab([1, 2.5, 0])
        if (step === 1.6 * rate) x.release_()
      }
    })
    expect(r.k.step).toBe(1.2 * rate)
    expectSame(r)
    expect(w.grabbedId).toBeNull()
    // Restored, the ball is in the hand again, held at the place it was grabbed to.
    expect(w.restoreKeyframe(r.k)).toBe(true)
    expect(w.grabbedId).toBe(ball)
    w.destroy()
  })
})

describe('a keyframe saved from the after-step hook, as the recorder takes them', () => {
  it('the Crane, saved inside the hook at 1 s: restored, the next 3 s are the same', async () => {
    const { w, bodies } = await preset('crane')
    w.setVelocity(byName(bodies, 'Crate').id, [1.2, 0, 0])
    let k: Keyframe | null = null
    const off = w.onAfterStep((x, s) => {
      if (s.step === 240) k = x.saveKeyframe()
    })
    for (let i = 0; i < 240; i++) w.stepOnce()
    off()
    expect(k).not.toBeNull()
    const first = run(w, 720)
    expect(w.restoreKeyframe(k!)).toBe(true)
    const second = run(w, 720)
    expect(firstDiff(first.records, second.records)).toBe(-1)
    expect(firstDiff(first.hook, second.hook)).toBe(-1)
    w.destroy()
  })

  it('a restore from inside the hook is refused (it would move the world under the running step loop)', async () => {
    const { w } = await preset('bounce')
    const k = w.saveKeyframe()
    const said: boolean[] = []
    const off = w.onAfterStep((x) => said.push(x.restoreKeyframe(k)))
    for (let i = 0; i < 3; i++) w.stepOnce()
    off()
    expect(said).toEqual([false, false, false])
    expect(w.stepIndex).toBe(3)
    expect(w.restoreKeyframe(k)).toBe(true)
    expect(w.stepIndex).toBe(0)
    w.destroy()
  })

  it('on the very step a waiting rate can start: restored, it starts before the next step, as it did', async () => {
    const w = await scene([floor(), body({ position: [0, 3, 0], restitution: 0.8 })], [], { stepRate: 600, airDensity: 0, allowSleeping: false })
    w.stepOnce()
    w.setWorldSettings({ stepRate: 240 })
    let k: Keyframe | null = null
    const off = w.onAfterStep((x, s) => {
      // 10/1200 s: the first tick 240's steps go on from; the switch comes after the hook.
      if (s.step === 5) k = x.saveKeyframe()
    })
    for (let i = 0; i < 4; i++) w.stepOnce()
    off()
    expect(w.stepRate).toBe(240)
    const first = run(w, 600)
    expect(w.restoreKeyframe(k!)).toBe(true)
    const second = run(w, 600)
    expect(firstDiff(first.records, second.records)).toBe(-1)
    expect(firstDiff(first.hook, second.hook)).toBe(-1)
    w.destroy()
  })
})

describe('what a restore puts back besides the engine', () => {
  it('nothing blends across the jump: the drawn pose is the restored one, and time gathered before is dropped', async () => {
    const { w, bodies } = await preset('bounce')
    const ball = byName(bodies, 'Ball').id
    for (let i = 0; i < 240; i++) w.stepOnce()
    const k = w.saveKeyframe()
    const at = w.state(ball)!.position
    for (let i = 0; i < 100; i++) w.stepOnce()
    // Six tenths of a step gathered: not yet a step.
    w.step(0.6 / 240)
    expect(w.restoreKeyframe(k)).toBe(true)
    expect(w.drawn(ball)!.position).toEqual(at)
    // Another six tenths: still no step, because the first six tenths went with the jump.
    const out = w.step(0.6 / 240)
    expect(w.stepIndex).toBe(240)
    const o = w.bodyOrder.indexOf(ball) * 7
    expect([out.transforms[o], out.transforms[o + 1], out.transforms[o + 2]]).toEqual(at.map(Math.fround))
    w.freeKeyframe(k)
    w.destroy()
  })

  it('the pushes, the world settings and a body’s bounce are those of the keyframe, not of later edits', async () => {
    const crate = body({ shape: 'box', size: [0.5, 0.5, 0.5], position: [0, 0.25, 0], mass: 2, restitution: 0.2 })
    const w = await scene([floor(), crate], [], { airDensity: 0 })
    w.setActuators([{ bodyId: crate.id, force: () => [10, 0, 0], from: 0, until: 5 }])
    for (let i = 0; i < 120; i++) w.stepOnce()
    const k = w.saveKeyframe()
    const ref = run(w, 240)
    expect(w.restoreKeyframe(k)).toBe(true)
    // Later edits: no push, Moon gravity, air, a bouncier crate.
    w.setActuators([])
    w.setWorldSettings({ gravity: 1.62, airDensity: 1.225 })
    expect(w.updateBody({ ...crate, restitution: 0.9, friction: 0.1 })).toBe(true)
    expect(w.restoreKeyframe(k)).toBe(true)
    expect(w.getWorldSettings()).toMatchObject({ gravity: 9.81, airDensity: 0 })
    const again = run(w, 240)
    expect(firstDiff(ref.records, again.records)).toBe(-1)
    expect(firstDiff(ref.hook, again.hook)).toBe(-1)
    w.destroy()
  })

  it('who touches whom: a ball rolling on concrete, saved while it rolls, slows the same (rolling resistance reads the contact)', async () => {
    const ball = body({ size: [0.2, 0.2, 0.2], position: [0, 0.2, 0], velocity: [3, 0, 0], angularVelocity: [0, 0, -15], material: 'rubber', rolling: 0.05 })
    const w = await scene([floor(), ball], [], { airDensity: 0 })
    for (let i = 0; i < 120; i++) w.stepOnce()
    // The last step's own forces: a rolling torque on the ball, and nothing on anything else.
    const torque = w.ownForces(ball.id)!.rollingTorque
    expect(torque[2]).toBeGreaterThan(0)
    const k = w.saveKeyframe()
    const ref = run(w, 240)
    expect(w.restoreKeyframe(k)).toBe(true)
    expect(w.ownForces(ball.id)!.rollingTorque).toEqual(torque)
    const again = run(w, 240)
    expect(firstDiff(ref.records, again.records)).toBe(-1)
    expect(firstDiff(ref.hook, again.hook)).toBe(-1)
    w.destroy()
  })

  it('the slow-motion setting is the student’s now, not the keyframe’s (it changes no step)', async () => {
    const { w } = await preset('bounce')
    const k = w.saveKeyframe()
    w.setWorldSettings({ timeScale: 0.25 })
    expect(w.restoreKeyframe(k)).toBe(true)
    expect(w.getWorldSettings().timeScale).toBe(0.25)
    w.destroy()
  })
})

describe('a keyframe from another build of the world is refused and changes nothing', () => {
  const snapshot = (w: SimWorld) => {
    const out = new Float32Array(recordSize(w))
    w.readRecord(out)
    return { rec: Array.from(out), step: w.stepIndex, time: w.time, rate: w.stepRate }
  }

  it('after a rebuild that keeps the run, after Reset, after new links, after a body is added', async () => {
    const { w, bodies, links } = await preset('crane')
    for (let i = 0; i < 240; i++) w.stepOnce()
    const k = w.saveKeyframe()
    const serial = w.rebuildSerial
    expect(k.rebuild).toBe(serial)
    for (let i = 0; i < 30; i++) w.stepOnce()

    w.rebuild(undefined, undefined, true)
    expect(w.rebuildSerial).toBeGreaterThan(serial)
    let before = snapshot(w)
    expect(w.restoreKeyframe(k)).toBe(false)
    expect(snapshot(w)).toEqual(before)

    const k2 = w.saveKeyframe()
    w.setLinks([{ ...links[0], length: 2 }])
    before = snapshot(w)
    expect(w.restoreKeyframe(k2)).toBe(false)
    expect(snapshot(w)).toEqual(before)

    const k3 = w.saveKeyframe()
    w.addBody(body({ position: [3, 1, 0] }))
    before = snapshot(w)
    expect(w.restoreKeyframe(k3)).toBe(false)
    expect(snapshot(w)).toEqual(before)

    const k4 = w.saveKeyframe()
    w.rebuild(bodies, links)
    expect(w.stepIndex).toBe(0)
    before = snapshot(w)
    expect(w.restoreKeyframe(k4)).toBe(false)
    expect(snapshot(w)).toEqual(before)
    for (const x of [k, k2, k3, k4]) w.freeKeyframe(x)
    w.destroy()
  })

  it('after a change of sleeping or of 2D (each rebuilds the bodies), and after a stiff spring changes hands at a new rate', async () => {
    const { w } = await preset('bounce')
    for (let i = 0; i < 100; i++) w.stepOnce()
    const k = w.saveKeyframe()
    w.setWorldSettings({ allowSleeping: false })
    expect(w.restoreKeyframe(k)).toBe(false)
    const k2 = w.saveKeyframe()
    w.setWorldSettings({ twoD: false })
    expect(w.restoreKeyframe(k2)).toBe(false)
    w.destroy()
    // ω = √(10⁵) = 316 rad/s: Jolt's spring at 240, PhysLab's at 600 — a joint goes away.
    const post = body({ shape: 'box', size: [0.1, 0.1, 0.1], position: [0, 3, 0], motion: 'static' })
    const bob = body({ position: [0, 2, 0] })
    const s = link('spring', post, bob, { stiffness: 1e5 })
    const v = await scene([post, bob], [s], { airDensity: 0 })
    expect(v.springModel(s.id)).toBe('engine')
    const k3 = v.saveKeyframe()
    const serial = v.rebuildSerial
    v.setWorldSettings({ stepRate: 600 })
    expect(v.springModel(s.id)).toBe('own')
    expect(v.rebuildSerial).toBeGreaterThan(serial)
    expect(v.restoreKeyframe(k3)).toBe(false)
    // A soft spring stays ours at both rates: nothing is rebuilt and the keyframe still comes back.
    const soft = link('spring', post, bob, { stiffness: 50 })
    v.rebuild([post, bob], [soft])
    const k4 = v.saveKeyframe()
    const before = v.rebuildSerial
    v.setWorldSettings({ stepRate: 240 })
    expect(v.rebuildSerial).toBe(before)
    expect(v.restoreKeyframe(k4)).toBe(true)
    expect(v.stepRate).toBe(600)
    v.destroy()
  })

  it('a freed keyframe is refused; freeing twice is harmless', async () => {
    const { w } = await preset('bounce')
    const k = w.saveKeyframe()
    w.freeKeyframe(k)
    w.freeKeyframe(k)
    expect(w.restoreKeyframe(k)).toBe(false)
    w.destroy()
  })
})

describe('keyframes leak no engine objects', () => {
  it('100 keyframes saved and freed: handleCount back to its baseline', async () => {
    const { w } = await preset('crane')
    for (let i = 0; i < 10; i++) w.stepOnce()
    const base = w.handleCount
    const kept: Keyframe[] = []
    for (let i = 0; i < 100; i++) {
      kept.push(w.saveKeyframe())
      w.stepOnce()
    }
    expect(w.handleCount).toBe(base + 100)
    expect(w.restoreKeyframe(kept[37])).toBe(true)
    for (const k of kept) w.freeKeyframe(k)
    expect(w.handleCount).toBe(base)
    w.destroy()
  })

  it('keyframes a rebuild has made useless are freed by it', async () => {
    const { w, bodies, links } = await preset('bounce')
    const base = w.handleCount
    const k = w.saveKeyframe()
    expect(w.handleCount).toBe(base + 1)
    w.rebuild(bodies, links)
    expect(w.handleCount).toBe(base)
    w.freeKeyframe(k)
    expect(w.handleCount).toBe(base)
    w.destroy()
  })

  it('laying the links again leaks nothing: 100 setLinks of a rod, a string, a hinge, a weld, an engine spring, a pulley and a rope', async () => {
    const post = body({ shape: 'box', size: [0.2, 0.2, 0.2], position: [0, 5, 0], motion: 'static' })
    const wheel = body({ shape: 'pulley', size: [0.3, 0.1, 0.3], position: [4, 5, 0], motion: 'static' })
    const a = body({ position: [0, 4, 0] })
    const b = body({ position: [1, 4, 0] })
    const c = body({ position: [2, 4, 0] })
    const d = body({ position: [3, 3, 0] })
    const e = body({ position: [5, 3, 0] })
    const f = body({ position: [0, 2, 0] })
    const links = [
      link('rod', post, a),
      link('string', a, b),
      link('hinge', b, c),
      link('weld', c, f),
      link('spring', post, f, { stiffness: 1e7, length: 3 }),
      link('pulley', d, e, { over: wheel.id, length: 3 }),
      link('rope', post, d, { length: 3, segments: 8 })
    ]
    const w = await scene([floor(), post, wheel, a, b, c, d, e, f], links, { allowSleeping: false })
    expect(w.springModel(links[4].id)).toBe('engine')
    for (let i = 0; i < 5; i++) w.stepOnce()
    const base = w.handleCount
    for (let i = 0; i < 100; i++) {
      w.setLinks(links)
      w.stepOnce()
    }
    expect(w.handleCount).toBe(base)
    w.destroy()
  })
})

describe('the step record (readRecord, I-4)', () => {
  it('the Crane: 3 bodies and a rope of ropeSegments(2.5) links fill (3 + n) × 13 floats; positions are state() to float32', async () => {
    const { w, bodies, links } = await preset('crane')
    const n = ropeSegments(2.5)
    expect(REC_FLOATS).toBe(13)
    expect(w.recordLayout()).toEqual({ bodies: bodies.map((b) => b.id), ropes: [{ linkId: links[0].id, count: n }] })
    w.setVelocity(byName(bodies, 'Crate').id, [0.5, 0, 0])
    for (let i = 0; i < 100; i++) w.stepOnce()
    const out = new Float32Array((3 + n) * REC_FLOATS).fill(Number.NaN)
    w.readRecord(out)
    expect(out.every(Number.isFinite)).toBe(true)
    bodies.forEach((b, i) => {
      const s = w.state(b.id)!
      const o = i * REC_FLOATS
      expect(Array.from(out.subarray(o, o + 13))).toEqual([...s.position, ...s.rotation, ...s.velocity, ...s.angularVelocity].map(Math.fround))
    })
    // The rope's links follow, in the order its path is drawn, each a unit quaternion.
    const path = w.linkPath(links[0]).slice(1, -1)
    expect(path).toHaveLength(n)
    path.forEach((p, j) => {
      const o = (3 + j) * REC_FLOATS
      expect(Array.from(out.subarray(o, o + 3))).toEqual(p.map(Math.fround))
      expect(Math.hypot(...out.subarray(o + 3, o + 7))).toBeCloseTo(1, 5)
    })
    // A record too short for the layout is refused, not half-filled.
    expect(() => w.readRecord(new Float32Array(3 * REC_FLOATS))).toThrow(RangeError)
    w.destroy()
  })

  it('a tape made from recordLayout() takes every readRecord and gives each step back unchanged, at the world’s time', async () => {
    const { w, bodies } = await preset('crane')
    w.setVelocity(byName(bodies, 'Crate').id, [0.8, 0, 0])
    const tape = new Tape(w.recordLayout(), w.stepRate, w.stepIndex, w.time)
    const size = recordSize(w)
    expect(tape.bodyCount * REC_FLOATS).toBe(size)
    const kept: Float32Array[] = []
    const times: number[] = []
    const rec = new Float32Array(size)
    for (let i = 0; i <= 240; i++) {
      if (i > 0) w.stepOnce()
      w.readRecord(rec)
      tape.push(w.stepIndex, rec)
      kept.push(rec.slice())
      times.push(w.time)
    }
    for (let s = 0; s <= 240; s++) {
      expect(firstDiff(tape.record(s)!, kept[s])).toBe(-1)
      expect(tape.timeOf(s)).toBe(times[s])
    }
    w.destroy()
  })

  it('a world with no rope: the bodies in order, nothing more', async () => {
    const { w, bodies } = await preset('bounce')
    expect(w.recordLayout()).toEqual({ bodies: bodies.map((b) => b.id), ropes: [] })
    expect(recordSize(w)).toBe(bodies.length * REC_FLOATS)
    w.destroy()
  })
})

describe('input and rebuild serials', () => {
  it('every outside change raises inputSerial; stepping, reading and restoring do not', async () => {
    const { w, bodies } = await preset('bounce')
    const ball = byName(bodies, 'Ball')
    const changes: [string, () => void][] = [
      ['grab', () => w.grab(ball.id, [0, 2, 0])],
      ['moveGrab', () => w.moveGrab([0, 2.5, 0])],
      ['release_', () => w.release_()],
      ['placeBody', () => w.placeBody(ball.id, [0, 3, 0])],
      ['setVelocity', () => w.setVelocity(ball.id, [1, 0, 0])],
      ['setPosition', () => w.setPosition(ball.id, [0, 3.1, 0])],
      ['setRotation', () => w.setRotation(ball.id, [0, 0, 30])],
      ['setAngularVelocity', () => w.setAngularVelocity(ball.id, [0, 0, 2])],
      ['updateBody', () => w.updateBody({ ...ball, restitution: 0.5 })],
      ['setWorldSettings', () => w.setWorldSettings({ gravity: 9.8 })],
      ['setActuators', () => w.setActuators([{ bodyId: ball.id, force: () => [1, 0, 0], from: 0, until: 1 }])],
      ['setLinks', () => w.setLinks([])],
      ['wakeAll', () => w.wakeAll()]
    ]
    for (const [name, fn] of changes) {
      const before = w.inputSerial
      fn()
      expect({ name, raised: w.inputSerial > before }).toEqual({ name, raised: true })
    }
    const k = w.saveKeyframe()
    const quiet = w.inputSerial
    const rebuilt = w.rebuildSerial
    w.stepOnce()
    w.step(1 / 60)
    w.readRecord(new Float32Array(recordSize(w)))
    w.recordLayout()
    w.state(ball.id)
    expect(w.restoreKeyframe(k)).toBe(true)
    expect(w.inputSerial).toBe(quiet)
    expect(w.rebuildSerial).toBe(rebuilt)
    w.freeKeyframe(k)
    w.destroy()
  })

  it('an edit that changes nothing, and settings handed back unchanged, are not inputs', async () => {
    const { w, bodies } = await preset('bounce')
    const ball = byName(bodies, 'Ball')
    const before = w.inputSerial
    expect(w.updateBody(ball)).toBe(true)
    expect(w.updateBody({ ...ball })).toBe(true)
    w.setWorldSettings(w.getWorldSettings())
    w.setWorldSettings({})
    // Slow motion changes how the run is watched, not the run.
    w.setWorldSettings({ timeScale: 0.1 })
    expect(w.inputSerial).toBe(before)
    w.destroy()
  })

  it('rebuild and Reset raise rebuildSerial; so does anything that builds the engine’s bodies or joints again', async () => {
    const { w, bodies, links } = await preset('crane')
    let s = w.rebuildSerial
    const raised = () => {
      const up = w.rebuildSerial > s
      s = w.rebuildSerial
      return up
    }
    w.rebuild(bodies, links)
    expect(raised()).toBe(true)
    w.rebuild(undefined, undefined, true)
    expect(raised()).toBe(true)
    w.clear()
    expect(raised()).toBe(true)
    w.addBody(bodies[0])
    expect(raised()).toBe(true)
    w.removeBody(bodies[0].id)
    expect(raised()).toBe(true)
    w.rebuild(bodies, [])
    s = w.rebuildSerial
    w.setLinks(links)
    expect(raised()).toBe(true)
    // An edit that is not a rebuild leaves it alone.
    w.setVelocity(bodies[2].id, [1, 0, 0])
    w.setWorldSettings({ gravity: 9.8 })
    w.stepOnce()
    expect(raised()).toBe(false)
    w.destroy()
  })
})

describe('a change of rate part-way lands every reading on the 0.1 s grid (SB0 review, decision a)', () => {
  it('one step at 600, then 240: 600 carries on until the clock is on 240’s grid (1/120 s), so the readings are k/10 exactly', async () => {
    const w = await scene([body({ position: [0, 50, 0] })], [], { stepRate: 600, airDensity: 0, allowSleeping: false })
    const t: number[] = []
    t.push(...w.stepOnce().samples.map((s) => s.t))
    w.setWorldSettings({ stepRate: 240 })
    // 2/1200 s: 240's steps of 5/1200 s would never land on 0.1 s from here.
    expect(w.stepRate).toBe(600)
    for (let i = 0; i < 4; i++) t.push(...w.stepOnce().samples.map((s) => s.t))
    expect(w.time).toBe(1 / 120)
    expect(w.stepRate).toBe(240)
    for (let i = 0; i < 238; i++) t.push(...w.stepOnce().samples.map((s) => s.t))
    expect(w.time).toBe(1)
    expect(t).toEqual(Array.from({ length: 11 }, (_, k) => k / 10))
    w.destroy()
  })

  it('a change made where the new rate already lands on the grid takes effect at once', async () => {
    const w = await scene([body({ position: [0, 50, 0] })], [], { stepRate: 240, airDensity: 0 })
    for (let i = 0; i < 2; i++) w.stepOnce()
    w.setWorldSettings({ stepRate: 600 })
    expect(w.stepRate).toBe(600)
    w.destroy()
  })

  it('a rebuild that keeps the run while a rate waits builds each spring for the rate in force, and switches it with the rate', async () => {
    // ω = √(10⁵) = 316 rad/s on a 1 kg bob: Jolt's spring at 240 (ω/240 = 1.3), PhysLab's at 600.
    const post = body({ shape: 'box', size: [0.1, 0.1, 0.1], position: [0, 3, 0], motion: 'static' })
    const bob = body({ position: [0, 1.9, 0] })
    const s = link('spring', post, bob, { stiffness: 1e5 })
    const w = await scene([post, bob], [s], { stepRate: 240, gravity: 0, airDensity: 0, allowSleeping: false })
    w.stepOnce()
    w.setWorldSettings({ stepRate: 600 })
    // 5/1200 s: 600's steps of 2/1200 s go on from 10/1200 s, one 240 step later.
    expect(w.stepRate).toBe(240)
    w.rebuild(undefined, undefined, true)
    expect(w.stepRate).toBe(240)
    expect(w.springModel(s.id)).toBe('engine')
    w.stepOnce()
    expect(w.time).toBe(1 / 120)
    expect(w.stepRate).toBe(600)
    expect(w.springModel(s.id)).toBe('own')
    w.destroy()
  })

  it('a rate still waiting is part of the keyframe, and Reset takes it up at once', async () => {
    const w = await scene([body({ position: [0, 50, 0] })], [], { stepRate: 600, airDensity: 0, allowSleeping: false })
    w.stepOnce()
    w.setWorldSettings({ stepRate: 240 })
    const k = w.saveKeyframe()
    const ref = run(w, 10)
    expect(w.restoreKeyframe(k)).toBe(true)
    expect(w.stepRate).toBe(600)
    const again = run(w, 10)
    expect(firstDiff(ref.records, again.records)).toBe(-1)
    expect(firstDiff(ref.hook, again.hook)).toBe(-1)
    expect(w.stepRate).toBe(240)
    w.restoreKeyframe(k)
    w.rebuild()
    expect(w.stepRate).toBe(240)
    expect(w.time).toBe(0)
    w.destroy()
  })
})

describe('the engine underneath', () => {
  it('works in single precision: 1 + 10⁻⁹ read back from Jolt is 1 (why twin runs set 10⁻⁵ apart, not 10⁻⁹)', async () => {
    const b = body({ position: [1, 1, 0] })
    const w = await scene([b], [], { gravity: 0 })
    w.setPosition(b.id, [1 + 1e-9, 1, 0])
    w.setVelocity(b.id, [1 + 1e-9, 0, 0])
    expect(w.state(b.id)!.position[0]).toBe(1)
    expect(w.state(b.id)!.velocity[0]).toBe(1)
    // 10⁻⁵ survives (float32 has about 7 significant figures).
    w.setPosition(b.id, [1 + 1e-5, 1, 0])
    expect(w.state(b.id)!.position[0]).not.toBe(1)
    w.destroy()
  })

  it('keeps Jolt’s deterministic simulation on (mDeterministicSimulation)', async () => {
    const w = await scene([body()])
    const physics = (w as unknown as { physics: { GetPhysicsSettings(): { mDeterministicSimulation: boolean } } }).physics
    expect(physics.GetPhysicsSettings().mDeterministicSimulation).toBe(true)
    w.setWorldSettings({ gravity: 1.62, allowSleeping: false })
    expect(physics.GetPhysicsSettings().mDeterministicSimulation).toBe(true)
    w.destroy()
  })
})

describe('what a keyframe costs (20 bodies)', () => {
  it('its size in bytes, and the time to save and to restore one', async () => {
    const bodies: BodyDef[] = [floor()]
    for (let i = 0; i < 19; i++) {
      const at: V3 = [(i % 5) * 0.6 - 1.2, 0.3 + Math.floor(i / 5) * 0.7, 0]
      bodies.push(body({ shape: i % 2 ? 'box' : 'sphere', size: i % 2 ? [0.4, 0.4, 0.4] : [0.2, 0.2, 0.2], position: at, velocity: [(i % 3) - 1, 0, 0] }))
    }
    const w = await scene(bodies)
    for (let i = 0; i < 240; i++) w.stepOnce()
    const J = (w as unknown as { jolt: Record<string, new () => Record<string, unknown>> }).jolt
    const physics = (w as unknown as { physics: { SaveState(r: unknown, s: number): void } }).physics
    // Jolt's own recorder keeps its bytes to itself; one written through JS counts them.
    let bytes = 0
    const counter = new J.StateRecorderJS() as Record<string, unknown>
    counter.WriteBytes = (_data: number, count: number) => {
      bytes += count
    }
    counter.ReadBytes = () => undefined
    counter.IsEOF = () => false
    counter.IsFailed = () => false
    physics.SaveState(counter, (J as unknown as { EStateRecorderState_All: number }).EStateRecorderState_All)
    ;(J as unknown as { destroy(o: unknown): void }).destroy(counter)
    const reps = 50
    let t0 = performance.now()
    const ks: Keyframe[] = []
    for (let i = 0; i < reps; i++) ks.push(w.saveKeyframe())
    const save = (performance.now() - t0) / reps
    t0 = performance.now()
    for (let i = 0; i < reps; i++) expect(w.restoreKeyframe(ks[i])).toBe(true)
    const restore = (performance.now() - t0) / reps
    for (const k of ks) w.freeKeyframe(k)
    console.info(`SB9 keyframe, 20 bodies: ${bytes} bytes; save ${save.toFixed(3)} ms; restore ${restore.toFixed(3)} ms`)
    expect(bytes).toBeGreaterThan(20 * 13 * 4)
    expect(bytes).toBeLessThan(64 * 1024)
    // Loose bounds: a keyframe is taken every second and on every input, so it must stay cheap.
    expect(save).toBeLessThan(5)
    expect(restore).toBeLessThan(5)
    w.destroy()
  })
})

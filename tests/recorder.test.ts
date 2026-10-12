// SB12: the recorder — the tape of a run (I-5), from the real engine in Node.
//
// Every engine step of a run goes on the tape: its record (every body and rope link: position,
// rotation, velocity, spin), the work PhysLab's own forces did, and its contacts and touches. The
// tape keeps keyframes (at the start, every second, and after every outside change) so a moment can
// be worked out again exactly: Branch from here and Fine replay depend on it. The checks below run
// the presets the Sandbox opens, at the default 240 steps a second.

import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { SimWorld } from '../src/renderer/src/sim/world'
import { presetById } from '../src/renderer/src/sim/presets'
import { DEFAULT_WORLD, type AfterStep, type BodyDef, type Link, type WorldSettings } from '../src/renderer/src/sim/types'
import { REC_FLOATS, Tape, WORK_FLOATS, bytesPerSecond } from '../src/renderer/src/sim/tape'
import {
  branchAt,
  clearTapes,
  durationWords,
  fineReplayAt,
  isContact,
  marksOf,
  onTapeChange,
  rerunRecord,
  rerunning,
  startRecorder,
  stepAtOrBefore,
  tapes,
  touchesAt,
  trimNote,
  TOUCH_FLOATS,
  type RunTape,
  type TapeChange,
  type TapeEvent,
  type TouchPack
} from '../src/renderer/src/sim/recorder'
import { useSandbox } from '../src/renderer/src/sim/store'
import type { V3 } from '../src/renderer/src/math/vec'

let n = 0
function body(over: Partial<BodyDef> = {}): BodyDef {
  return {
    id: `r${++n}`,
    name: `R${n}`,
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
  return { id: `rl${++n}`, kind, a: a.id, b: b.id, length: 1, stiffness: 0, damping: 0, ...over }
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

beforeAll(async () => {
  // The WASM engine loads once; the first world after it is a warm-up.
  ;(await SimWorld.create()).destroy()
}, 30_000)

/** The recorder of the test that is running; stopped after it (the app has one engine, so do the tests). */
let stopRec: (() => void) | null = null
afterEach(() => {
  stopRec?.()
  stopRec = null
})

function record(w: SimWorld, opts: { capBytes?: number } = {}): void {
  stopRec = startRecorder(w, opts)
}

const live = (): RunTape => tapes.live!

/** Steps the world one engine step at a time; `script` makes the inputs, by the step about to be taken. */
function steps(w: SimWorld, count: number, script?: (w: SimWorld, step: number) => void): void {
  for (let i = 0; i < count; i++) {
    script?.(w, w.stepIndex)
    w.stepOnce()
  }
}

/** The first float where two records differ (Object.is: −0 is not 0), or −1. */
function firstDiff(a: ArrayLike<number> | null, b: ArrayLike<number> | null): number {
  if (!a || !b) return -2
  if (a.length !== b.length) return Math.min(a.length, b.length)
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return i
  return -1
}

const byName = (bodies: BodyDef[], name: string): BodyDef => bodies.find((b) => b.name === name)!

/** A reproducible list of steps on a tape (a small LCG: the same 20 every run). */
function seededSteps(first: number, last: number, count: number, seed: number): number[] {
  let x = seed
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    x = (x * 1103515245 + 12345) % 2147483648
    out.push(first + (x % (last - first + 1)))
  }
  return out
}

/** The height of a ball's underside above the floor (top at 0) at `step` of a tape, from its record. */
function underside(t: RunTape, step: number, index: number, radius: number): number {
  return t.record(step)![index * REC_FLOATS + 1] - radius
}

describe('the live tape is the run (Bouncing ball, 240 steps a second)', () => {
  it('for 5 s every record equals readRecord at that step, exactly; record 0 is the untouched start, read before the first step', async () => {
    const { w } = await preset('bounce')
    record(w)
    const size = w.recordLayout().bodies.length * REC_FLOATS
    const start = new Float32Array(size)
    w.readRecord(start)
    const seen: Float32Array[] = [start]
    const hooked: AfterStep[] = []
    const off = w.onAfterStep((x, s) => {
      const r = new Float32Array(size)
      x.readRecord(r)
      seen.push(r)
      hooked.push({ ...s, contacts: [...s.contacts], touches: [...s.touches] })
    })
    steps(w, 5 * 240)
    off()
    const t = live()
    expect(t.rate).toBe(240)
    expect(t.first).toBe(0)
    expect(t.last).toBe(1200)
    expect(t.timeOf(1200)).toBe(5)
    for (let s = 0; s <= 1200; s++) expect(firstDiff(t.record(s), seen[s])).toBe(-1)
    // Record 0 has no work and no events; every later step has its work and its contacts and touches.
    expect(Array.from(t.work(0)!)).toEqual([0, 0, 0, 0, 0])
    expect(t.events(0)).toEqual([])
    for (let s = 1; s <= 1200; s++) {
      const h = hooked[s - 1]
      const wk = h.work
      expect(Array.from(t.work(s)!)).toEqual(Array.from(new Float32Array([wk.drag, wk.rolling, wk.push, wk.hand, wk.damper])))
      expect(t.events(s).filter(isContact)).toEqual(h.contacts)
      expect(touchesAt(t, s)).toEqual(h.touches)
    }
    expect(WORK_FLOATS).toBe(5)
    // The bounces are on it as contacts, the rest of the time on the floor as touches.
    const all: { step: number; e: TapeEvent }[] = t.eventsIn(0, 1200)
    expect(all.filter((x) => isContact(x.e)).length).toBeGreaterThanOrEqual(4)
    expect(all.some((x) => !isContact(x.e))).toBe(true)
    // Touches go on as one pack a step, TOUCH_FLOATS numbers each.
    const pack: TouchPack = all.find((x): x is { step: number; e: TouchPack } => !isContact(x.e))!.e
    expect(pack.touches.length % TOUCH_FLOATS).toBe(0)
    w.destroy()
  })

  it('keyframes: one at the start, one every second, and one after the first step that follows an outside change', async () => {
    const { w, bodies } = await preset('bounce')
    record(w)
    const ball = byName(bodies, 'Ball').id
    steps(w, 3 * 240, (x, step) => {
      if (step === 300) x.setVelocity(ball, [0.5, x.state(ball)!.velocity[1], 0])
    })
    expect(live().keyframeSteps()).toEqual([0, 240, 301, 480, 720])
    // A change made at a whole second gets its own keyframe after the next step.
    w.setVelocity(ball, [0, 0, 0])
    steps(w, 1)
    expect(live().keyframeSteps()).toEqual([0, 240, 301, 480, 720, 721])
    steps(w, 240)
    expect(live().keyframeSteps()).toEqual([0, 240, 301, 480, 720, 721, 960])
    // Each keyframe is a live engine object, and nothing else the recorder made is.
    w.destroy()
  })

  it('started twice for the same world, it keeps its tape, and only the newer stop stops it', async () => {
    const { w } = await preset('bounce')
    const older = startRecorder(w)
    steps(w, 10)
    const t = live()
    record(w)
    steps(w, 10)
    expect(tapes.live).toBe(t)
    expect(t.last).toBe(20)
    older()
    steps(w, 10)
    expect(tapes.live).toBe(t)
    expect(t.last).toBe(30)
    stopRec!()
    stopRec = null
    expect(tapes.live).toBeNull()
    steps(w, 1)
    expect(tapes.live).toBeNull()
    w.destroy()
  })

  it('stopping the recorder frees every keyframe it holds (handleCount back to where it was)', async () => {
    const { w } = await preset('bounce')
    const before = w.handleCount
    record(w)
    steps(w, 3 * 240)
    expect(w.handleCount - before).toBe(live().keyframeSteps().length)
    stopRec!()
    stopRec = null
    expect(tapes.live).toBeNull()
    expect(w.handleCount).toBe(before)
    w.destroy()
  })
})

describe('seek by keyframe + re-run equals the tape bit for bit (SB9’s six scenes, 20 seeded steps each)', () => {
  /** Records 3 s of a scene, re-works 20 seeded steps out, and checks the run is left as it was. */
  async function seekCheck(w: SimWorld, script?: (w: SimWorld, step: number) => void, seed = 7): Promise<void> {
    record(w)
    steps(w, 3 * 240, script)
    const t = live()
    const end = new Float32Array(t.record(t.last)!)
    for (const s of seededSteps(t.first, t.last, 20, seed)) expect(firstDiff(rerunRecord(s), t.record(s))).toBe(-1)
    expect(rerunning()).toBe(false)
    // The world is back at the end of the run, exactly, and goes on recording from there.
    expect(w.stepIndex).toBe(t.last)
    const now = new Float32Array(end.length)
    w.readRecord(now)
    expect(firstDiff(now, end)).toBe(-1)
    steps(w, 10)
    expect(tapes.live).toBe(t)
    expect(t.last).toBe(3 * 240 + 10)
    expect(rerunRecord(t.last + 1)).toBeNull()
  }

  it('Bouncing ball', async () => {
    const { w } = await preset('bounce')
    await seekCheck(w)
    w.destroy()
  })

  it('Spring on ice (PhysLab’s own spring)', async () => {
    const { w } = await preset('springice')
    await seekCheck(w, undefined, 11)
    w.destroy()
  })

  it('Crane (a rope of links), the crate set swinging', async () => {
    const { w, bodies } = await preset('crane')
    w.setVelocity(byName(bodies, 'Crate').id, [1.2, 0, 0])
    await seekCheck(w, undefined, 13)
    expect(live().layout.ropes.length).toBe(1)
    w.destroy()
  })

  it('a crate under a 25 N push from 0.5 s to 2 s', async () => {
    const crate = body({ shape: 'box', size: [0.5, 0.5, 0.5], position: [0, 0.25, 0], mass: 2, material: 'wood', friction: 0.4, restitution: 0 })
    const w = await scene([floor(), crate])
    w.setActuators([{ bodyId: crate.id, force: () => [25, 0, 0], from: 0.5, until: 2 }])
    await seekCheck(w, undefined, 17)
    w.destroy()
  })

  it('Projectile, with air', async () => {
    const { w } = await preset('projectile', { airDensity: 1.225 })
    await seekCheck(w, undefined, 19)
    w.destroy()
  })

  it('a hand grabs the ball from 1.2 s to 1.6 s (every change has its keyframe)', async () => {
    const { w, bodies } = await preset('bounce')
    const ball = byName(bodies, 'Ball').id
    await seekCheck(
      w,
      (x, step) => {
        if (step === 288) x.grab(ball, [0.5, 2, 0])
        if (step === 336) x.moveGrab([1, 2.5, 0])
        if (step === 384) x.release_()
      },
      23
    )
    expect(live().keyframeSteps()).toEqual([0, 240, 289, 337, 385, 480, 720])
    w.destroy()
  })
})

describe('Branch from here', () => {
  it('at the first bounce, then on to 3 s with no change: the new run is the old one, bit for bit; the old run is kept as the parent', async () => {
    const { w } = await preset('bounce')
    record(w)
    steps(w, 5 * 240)
    const old = live()
    const kept: Float32Array[] = []
    for (let s = 0; s <= old.last; s++) kept.push(new Float32Array(old.record(s)!))
    const at = marksOf(old)[0]
    expect(Math.abs(old.timeOf(at) - 0.782)).toBeLessThanOrEqual(1 / 240)
    const r = branchAt(at)
    expect(r.ok).toBe(true)
    expect(at).toBe(188)
    expect(r.note).toBe('Branched at t = 0.783 s. The old run is shown as a ghost.')
    expect(w.stepIndex).toBe(at)
    expect(live().last).toBe(at)
    expect(live().keyframeSteps().every((k) => k <= at)).toBe(true)
    const parent = tapes.parent!
    expect(parent.step).toBe(at)
    expect(parent.tape.first).toBe(at)
    expect(parent.tape.last).toBe(1200)
    expect(parent.tape.keyframeSteps()).toEqual([])
    steps(w, 3 * 240 - at)
    for (let s = 0; s <= 720; s++) expect(firstDiff(live().record(s), kept[s])).toBe(-1)
    for (let s = at; s <= 1200; s++) expect(firstDiff(parent.tape.record(s), kept[s])).toBe(-1)
    // The keyframes come back on the new run's whole seconds.
    expect(live().keyframeSteps()).toEqual([0, 240, 480, 720])
    w.destroy()
  })

  /** Bouncing ball at `rate`: branch at 2.0 s, set the ball's bounce to 0.5, run to 5 s; the next top on both runs. */
  async function branchTops(rate: 240 | 600): Promise<{ newTop: number; oldTop: number; at: number; turn: number }> {
    const { w, bodies } = await preset('bounce', { stepRate: rate })
    const ball = byName(bodies, 'Ball')
    const floorDef = bodies.find((b) => b.shape === 'ground')!
    // The engine takes the larger of the two bounces: the floor's must be below 0.5 for the ball's to count.
    expect(floorDef.restitution).toBeLessThanOrEqual(0.5)
    record(w)
    steps(w, 5 * rate)
    const at = 2 * rate
    expect(live().timeOf(at)).toBe(2)
    expect(branchAt(at).ok).toBe(true)
    w.updateBody({ ...ball, restitution: 0.5 })
    steps(w, 3 * rate)
    const t = live()
    const parent = tapes.parent!.tape
    const index = t.layout.bodies.indexOf(ball.id)
    const radius = ball.size[0]
    const marks = marksOf(t).filter((m) => m > at)
    const oldMarks = marksOf(parent).filter((m) => m > at)
    // The second bounce, the same on both runs (2.033 s at 240; 600 meets the floor 3 ms later).
    expect(Math.abs(t.timeOf(marks[0]) - 2.033)).toBeLessThanOrEqual(0.005)
    expect(marks[0]).toBe(oldMarks[0])
    const top = (tape: RunTape, from: number, to: number) => {
      let h = -Infinity
      for (let s = from; s <= to; s++) h = Math.max(h, underside(tape, s, index, radius))
      return h
    }
    // Where the ball turned round: the lowest record at the bounce.
    let turn = Infinity
    for (let s = marks[0] - 2; s <= marks[0] + 2; s++) turn = Math.min(turn, underside(t, s, index, radius))
    const out = { newTop: top(t, marks[0], marks[1]), oldTop: top(parent, oldMarks[0], oldMarks[1]), at, turn }
    // The parent still holds the old run from the branch on.
    expect(tapes.parent!.step).toBe(at)
    expect(parent.last).toBe(5 * rate)
    w.destroy()
    return out
  }

  it('at 2.0 s (just before the second bounce at 2.033 s), with the ball’s bounce set to 0.5: the next top is about 0.48 m instead of 1.229 m', async () => {
    // At 600 steps a second both tops are within 2 % of e² × the drop before (0.25 × 1.92 and 0.64 × 1.92).
    const fine = await branchTops(600)
    expect(Math.abs(fine.newTop - 0.48) / 0.48).toBeLessThan(0.02)
    expect(Math.abs(fine.oldTop - 1.229) / 1.229).toBeLessThan(0.02)
    // At 240 the engine turns the ball round up to one step of its fall above the floor (it meets the
    // floor part-way through a step: 6.1 m/s × 1/240 s = 2.5 cm), so both tops sit about a centimetre
    // high: +0.9 cm on the old run (+0.7 %) and +1.3 cm on the new one (+2.7 % of a smaller height).
    // The step's error, the same on both runs, not the branch's.
    const r = await branchTops(240)
    console.info(`SB12 branch at 2 s, 240/s: next top ${r.newTop} m with e = 0.5, ${r.oldTop} m on the old run; turned round ${r.turn} m up. 600/s: ${fine.newTop} m and ${fine.oldTop} m`)
    expect(r.turn).toBeGreaterThan(0)
    expect(r.turn).toBeLessThan(6.2 / 240)
    expect(Math.abs(r.newTop - 0.48)).toBeLessThan(6.2 / 240)
    expect(Math.abs(r.oldTop - 1.229)).toBeLessThan(6.2 / 240)
    expect(Math.abs(r.oldTop - 1.229) / 1.229).toBeLessThan(0.02)
  })

  it('the Sandbox store takes the moment back from the world: the bodies’ definitions, the pushes, the readings and collisions up to it, the clock', async () => {
    const { w, bodies } = await preset('bounce')
    const ball = byName(bodies, 'Ball')
    // A sideways push of 1 N from 2.5 s on, in the store and the world (a question sets both).
    const push = { bodyId: ball.id, force: (): V3 => [1, 0, 0], from: 2.5, until: 10, label: '1 N on Ball' }
    w.setActuators([push])
    useSandbox.setState({ bodies, world: { ...DEFAULT_WORLD, ...presetById('bounce')!.build().world }, recording: {}, contacts: [], actuators: [push] })
    record(w)
    const off = w.onAfterStep((_x, s) => {
      if (s.contacts.length) useSandbox.getState().pushContacts(s.contacts)
    })
    for (let i = 0; i < 3 * 240; i++) {
      const out = w.stepOnce()
      for (const r of out.samples) {
        const st = r.states[ball.id]
        if (st) useSandbox.getState().record({ [ball.id]: { t: r.t } as never })
      }
    }
    // At 3 s the student makes the ball less bouncy (store and world, as the panel does).
    const softer = { ...ball, restitution: 0.5 }
    useSandbox.setState({ bodies: useSandbox.getState().bodies.map((b) => (b.id === ball.id ? softer : b)) })
    w.updateBody(softer)
    // And takes the push off (the panel's Remove), and turns gravity down to the Moon's.
    useSandbox.setState({ actuators: [], world: { ...useSandbox.getState().world, gravity: 1.62 } })
    w.setActuators([])
    w.setWorldSettings({ gravity: 1.62 })
    steps(w, 240)
    off()
    expect(useSandbox.getState().recording[ball.id].length).toBe(31)
    expect(branchAt(480).ok).toBe(true)
    const st = useSandbox.getState()
    // The definition the run had at 2 s, the very object the world holds again.
    expect(st.bodies.find((b) => b.id === ball.id)).toBe(ball)
    expect(w.definitions().bodies.find((b) => b.id === ball.id)).toBe(ball)
    expect(st.recording[ball.id].map((x) => x.t).at(-1)).toBe(2)
    expect(st.recording[ball.id].length).toBe(21)
    expect(st.contacts.every((c) => c.step <= 480)).toBe(true)
    expect(st.contacts.length).toBe(1)
    expect(st.engineTime).toBe(2)
    expect(st.live[ball.id].position).toEqual(w.state(ball.id)!.position)
    // The push the run had at 2 s is listed again, and acts again from 2.5 s.
    expect(st.actuators).toEqual([push])
    expect(w.definitions().actuators).toEqual([push])
    // Gravity was changed at 3 s (store and world): the branch puts the moment's 9.81 back in both.
    expect(w.getWorldSettings().gravity).toBe(9.81)
    expect(st.world.gravity).toBe(9.81)
    expect(st.world).toEqual(w.getWorldSettings())
    w.destroy()
  })

  it('another after-step listener sees the re-run’s steps with rerunning() true, and the live steps with it false', async () => {
    const { w } = await preset('bounce')
    record(w)
    const seen: [number, boolean][] = []
    const off = w.onAfterStep((_x, s) => seen.push([s.step, rerunning()]))
    steps(w, 300)
    expect(branchAt(250).ok).toBe(true)
    steps(w, 2)
    off()
    // 1 … 300 live; 241 … 250 re-run from the keyframe at 240; then 251 and 252 live again.
    expect(seen.slice(0, 300).every(([s, r], i) => s === i + 1 && !r)).toBe(true)
    expect(seen.slice(300, 310)).toEqual(Array.from({ length: 10 }, (_, i) => [241 + i, true]))
    expect(seen.slice(310)).toEqual([
      [251, false],
      [252, false]
    ])
    w.destroy()
  })

  it('refuses a moment that is not on the tape, and at the end simply carries on', async () => {
    const { w } = await preset('bounce')
    expect(branchAt(10).ok).toBe(false)
    record(w)
    expect(branchAt(0)).toEqual({ ok: false, note: 'There is no recording to branch from yet.' })
    steps(w, 100)
    expect(branchAt(101)).toEqual({ ok: false, note: 'That moment is no longer on the recording.' })
    expect(branchAt(-1).ok).toBe(false)
    const end = branchAt(100)
    expect(end.ok).toBe(true)
    expect(end.note).toMatch(/^Carrying on from the end of the run, t = /)
    expect(tapes.parent).toBeNull()
    expect(live().last).toBe(100)
    w.destroy()
  })
})

describe('Fine replay (600 steps a second)', () => {
  it('of [0.5 s, 1.5 s] of Bouncing ball: 600 records a second, the contact within 1/600 s of 0.7821 s; the live run is put back exactly', async () => {
    const { w } = await preset('bounce')
    record(w)
    steps(w, 5 * 240)
    const k = w.saveKeyframe()
    const r = fineReplayAt(120)
    expect(r).toEqual({ ok: true, note: 'A re-run at 1/600 s. Its difference from the 1/240 s run is the step error.' })
    const fine = tapes.fine!
    expect(fine.rate).toBe(600)
    expect(fine.timeOf(fine.first)).toBe(0.5)
    expect(fine.timeOf(fine.last)).toBe(1.5)
    expect(fine.last - fine.first).toBe(600)
    expect(fine.keyframeSteps()).toEqual([])
    const hits = marksOf(fine)
    expect(hits.length).toBe(1)
    const hit = fine.events(hits[0]).find(isContact)!
    // By hand: the underside falls 3.0 m, t = √(2 × 3.0 / 9.81) = 0.78206 s; the engine finds the contact within a step of it.
    const fall = Math.sqrt((2 * 3.0) / 9.81)
    expect(Math.abs(hit.t - fall)).toBeLessThan(1 / 600)
    // The same moment: compared in the clock's ticks (a tape that starts part-way, 0.5 + 169/600, and the engine's
    // 938/1200 can differ in the last digit of a double).
    expect(Math.round(fine.timeOf(hits[0]) * 1200)).toBe(Math.round(hit.t * 1200))
    // And it is stamped on the step the ball turned round in, by the fine tape's own records: falling at the end of
    // the step before, rising at the end of this one (a stamp a step late or early fails here).
    const vy = (s: number) => fine.record(s)![fine.layout.bodies.indexOf(hit.b === fine.layout.bodies[0] ? hit.a : hit.b) * REC_FLOATS + 8]
    expect(vy(hits[0] - 1)).toBeLessThan(0)
    expect(vy(hits[0])).toBeGreaterThan(0)
    // The live run: same step, rate, record; and it goes on exactly as if nothing had been re-run.
    expect(w.stepIndex).toBe(1200)
    expect(w.stepRate).toBe(240)
    expect(w.getWorldSettings().stepRate).toBe(240)
    steps(w, 240)
    const after = live()
    expect(after.last).toBe(1440)
    // No keyframe is taken for the re-run's own change of rate: nothing outside changed the run.
    expect(after.keyframeSteps()).toEqual([0, 240, 480, 720, 960, 1200, 1440])
    const got = Array.from({ length: 241 }, (_, i) => new Float32Array(after.record(1200 + i)!))
    stopRec!()
    stopRec = null
    expect(w.restoreKeyframe(k)).toBe(true)
    const ref = new Float32Array(got[0].length)
    for (let i = 0; i <= 240; i++) {
      if (i > 0) w.stepOnce()
      w.readRecord(ref)
      expect(firstDiff(ref, got[i])).toBe(-1)
    }
    w.freeKeyframe(k)
    w.destroy()
  })

  it('fits its second before the end of the run, and puts the playhead on the chosen moment', async () => {
    const { w } = await preset('bounce')
    record(w)
    steps(w, 2 * 240)
    const changes: TapeChange[] = []
    const off = onTapeChange((c) => changes.push(c))
    expect(fineReplayAt(2 * 240).ok).toBe(true)
    off()
    const fine = tapes.fine!
    expect(fine.timeOf(fine.first)).toBe(1)
    expect(fine.timeOf(fine.last)).toBe(2)
    const c = changes.find((x) => x.kind === 'fine') as Extract<TapeChange, { kind: 'fine' }>
    expect(c.playhead).toBe(fine.last)
    w.destroy()
  })

  it('stops early, with its sentence, where something was changed', async () => {
    const { w, bodies } = await preset('bounce')
    const ball = byName(bodies, 'Ball').id
    record(w)
    steps(w, 5 * 240, (x, step) => {
      if (step === 240) x.setVelocity(ball, [0.5, x.state(ball)!.velocity[1], 0])
    })
    expect(live().keyframeSteps()).toContain(241)
    const r = fineReplayAt(120)
    expect(r.ok).toBe(true)
    expect(r.note).toBe('A re-run at 1/600 s. Its difference from the 1/240 s run is the step error. Fine replay stops here: something was changed at t = 1 s.')
    const fine = tapes.fine!
    expect(fine.timeOf(fine.first)).toBe(0.5)
    expect(fine.timeOf(fine.last)).toBe(1)
    // From after the change it re-runs from the change's own keyframe and never reaches back past it.
    expect(fineReplayAt(300).ok).toBe(true)
    expect(tapes.fine!.timeOf(tapes.fine!.first)).toBeGreaterThanOrEqual(241 / 240 - 1 / 600)
    expect(tapes.fine!.timeOf(tapes.fine!.first)).toBe(1.25)
    w.destroy()
  })

  it('from a keyframe on an odd tick of the clock (240 steps a second) it takes one more 1/240 s step to reach 600’s grid', async () => {
    // A ball resting on the floor, so every step has its touch.
    const ball = body({ position: [0, 0.1, 0], material: 'rubber' })
    const w = await scene([floor(), ball])
    record(w)
    // Rolled at step 100: a keyframe at step 101 (t = 101/240 s: 505 ticks, odd).
    steps(w, 2 * 240, (x, step) => {
      if (step === 100) x.setVelocity(ball.id, [1, 0, 0])
    })
    expect(live().keyframeSteps()).toContain(101)
    const changes: TapeChange[] = []
    const off = onTapeChange((c) => changes.push(c))
    const r = fineReplayAt(101)
    off()
    expect(r.ok).toBe(true)
    // It cannot start before the change, nor on it: it says where it starts, and the playhead is there.
    expect(r.note).toBe('A re-run at 1/600 s. Its difference from the 1/240 s run is the step error. It starts at t = 0.425 s, the first 1/600 s step after the change made at t = 0.421 s.')
    const c = changes.find((x) => x.kind === 'fine') as Extract<TapeChange, { kind: 'fine' }>
    expect(c.playhead).toBe(tapes.fine!.first)
    const fine = tapes.fine!
    // 505 ticks is not on 600's grid (every 2 ticks): one more 1/240 s step, as the run took it, reaches 510.
    expect(Math.round(fine.timeOf(fine.first) * 1200)).toBe(510)
    expect(Math.round(fine.timeOf(fine.last) * 1200)).toBe(505 + 1200 - 1)
    // Its first record is a state: the 1/240 s step that led to it is not on the 1/600 s tape.
    expect(Array.from(fine.work(fine.first)!)).toEqual([0, 0, 0, 0, 0])
    expect(fine.events(fine.first)).toEqual([])
    expect(touchesAt(live(), 102).length).toBeGreaterThan(0)
    expect(touchesAt(fine, fine.first + 1).length).toBeGreaterThan(0)
    w.destroy()
  })

  it('is refused at 600 steps a second, with a stiff engine spring, and with no recording; refusing changes nothing', async () => {
    expect(fineReplayAt(0)).toEqual({ ok: false, note: 'There is no recording to replay yet.' })
    const fast = await preset('bounce', { stepRate: 600 })
    record(fast.w)
    steps(fast.w, 60)
    expect(fineReplayAt(10)).toEqual({ ok: false, note: 'This run already takes 600 steps a second: every one of them is on the recording.' })
    fast.w.destroy()
    const post = body({ motion: 'static', shape: 'box', size: [0.2, 0.2, 0.2], position: [0, 3, 0] })
    const bob = body({ position: [0, 2, 0] })
    // ω = √(100000 / 1) ≈ 316 rad/s: the engine's at 240 steps a second, PhysLab's own at 600.
    const spring = link('spring', post, bob, { stiffness: 100000, length: 1 })
    const w = await scene([floor(), post, bob], [spring])
    expect(w.springModel(spring.id)).toBe('engine')
    record(w)
    steps(w, 240)
    const handles = w.handleCount
    const r = fineReplayAt(100)
    expect(r.ok).toBe(false)
    expect(r.note).toBe('Fine replay cannot re-run this scene: a spring this stiff is worked out another way at 600 steps a second.')
    expect(w.handleCount).toBe(handles)
    expect(firstDiff(rerunRecord(100), live().record(100))).toBe(-1)
    w.destroy()
  })
})

describe('the cap', () => {
  it('a tiny cap drops the oldest second, frees its keyframes, and the note names what is kept', async () => {
    const { w } = await preset('bounce')
    const before = w.handleCount
    const chunk = 240 * REC_FLOATS * 2 * 4 + 240 * WORK_FLOATS * 4
    record(w, { capBytes: Math.floor(2.5 * chunk) })
    const notes: string[] = []
    const off = onTapeChange((c) => {
      if (c.kind === 'trimmed') notes.push(c.note)
    })
    steps(w, 3 * 240)
    off()
    const t = live()
    expect(t.first).toBe(480)
    expect(t.last).toBe(720)
    expect(t.trimmedSeconds()).toBe(2)
    expect(t.keyframeSteps()).toEqual([480, 720])
    expect(w.handleCount - before).toBe(2)
    expect(notes.at(-1)).toBe('The recording keeps the last 1 s; older parts were dropped.')
    expect(trimNote()).toBe(notes.at(-1))
    // What is kept can still be worked out again; what was dropped cannot.
    expect(firstDiff(rerunRecord(480), t.record(480))).toBe(-1)
    expect(rerunRecord(479)).toBeNull()
    expect(t.bytes).toBeLessThanOrEqual(t.capBytes)
    w.destroy()
  })

  it('bytesPerSecond(20, 240) = 249 600: 64 MiB holds about 4.5 minutes of 20 bodies at 240 steps a second', () => {
    expect(bytesPerSecond(20, 240)).toBe(249_600)
    const minutes = (64 * 2 ** 20) / bytesPerSecond(20, 240) / 60
    expect(minutes).toBeGreaterThan(4.4)
    expect(minutes).toBeLessThan(4.6)
    expect(durationWords(minutes * 60)).toBe('4 min 29 s')
  })

  it('durations in words', () => {
    expect(durationWords(0)).toBe('0 s')
    expect(durationWords(45.4)).toBe('45 s')
    expect(durationWords(100)).toBe('1 min 40 s')
    expect(durationWords(120)).toBe('2 min')
    expect(durationWords(3900)).toBe('1 h 5 min')
  })
})

describe('when a new tape starts', () => {
  it('on Reset: the new tape’s record 0 is the new start (here a higher drop, as a student edits it before Reset)', async () => {
    const { w, bodies, links } = await preset('bounce')
    record(w)
    steps(w, 300)
    const first = live()
    const oldStart = new Float32Array(first.record(0)!)
    const higher = bodies.map((b) => (b.name === 'Ball' ? { ...b, position: [0, 4.2, 0] as V3 } : b))
    w.rebuild(higher, links)
    const start = new Float32Array(first.bodyCount * REC_FLOATS)
    w.readRecord(start)
    steps(w, 1)
    expect(tapes.live).not.toBe(first)
    expect(live().first).toBe(0)
    expect(firstDiff(live().record(0), start)).toBe(-1)
    expect(firstDiff(live().record(0), oldStart)).not.toBe(-1)
    expect(live().record(0)![live().layout.bodies.indexOf(byName(bodies, 'Ball').id) * REC_FLOATS + 1]).toBe(Math.fround(4.2))
    // The old tape gave its memory back (and its keyframes to the engine) when it was dropped.
    expect(first.last).toBe(-1)
    w.destroy()
  })

  it('on a rebuild part-way (a body added, a link made): from the step it happened at, with the new layout', async () => {
    const { w, bodies } = await preset('bounce')
    record(w)
    steps(w, 300)
    const first = live()
    w.addBody(body({ position: [2, 1, 0] }))
    steps(w, 1)
    expect(tapes.live).not.toBe(first)
    expect(live().first).toBe(300)
    expect(live().timeOf(300)).toBe(1.25)
    expect(live().layout.bodies.length).toBe(3)
    const second = live()
    steps(w, 10)
    w.setLinks([link('rod', byName(bodies, 'Ball'), w.definitions().bodies[2])])
    steps(w, 1)
    expect(tapes.live).not.toBe(second)
    expect(live().first).toBe(311)
    w.destroy()
  })

  it('on a change of step rate (at once on 240’s grid; on an odd tick, one step later when 600’s grid is reached)', async () => {
    const { w } = await preset('bounce')
    record(w)
    steps(w, 240)
    const first = live()
    w.setWorldSettings({ stepRate: 600 })
    steps(w, 1)
    expect(tapes.live).not.toBe(first)
    expect(live().rate).toBe(600)
    expect(live().first).toBe(240)
    expect(live().timeOf(241)).toBe(1 + 1 / 600)
    // Back to 240 from a tick 240 cannot step on from (1 + 1/600 s): 600 carries on to 1 + 1/120 s.
    const second = live()
    w.setWorldSettings({ stepRate: 240 })
    steps(w, 4)
    expect(tapes.live).toBe(second)
    steps(w, 1)
    expect(tapes.live).not.toBe(second)
    expect(live().rate).toBe(240)
    expect(Math.round(live().timeOf(live().first) * 1200)).toBe(1210)
    w.destroy()
  })

  it('none on a rename (an edit in place is a change: a keyframe, not a new tape)', async () => {
    const { w, bodies } = await preset('bounce')
    record(w)
    steps(w, 100)
    const first = live()
    w.updateBody({ ...byName(bodies, 'Ball'), name: 'Bob' })
    steps(w, 1)
    expect(tapes.live).toBe(first)
    expect(first.keyframeSteps()).toEqual([0, 101])
    w.destroy()
  })

  it('none while paused, and the world stepped behind the recorder’s back (a restore it did not make) starts a new one', async () => {
    const { w } = await preset('bounce')
    record(w)
    steps(w, 50)
    const k = w.saveKeyframe()
    steps(w, 50)
    const first = live()
    w.step(0)
    expect(tapes.live).toBe(first)
    expect(w.restoreKeyframe(k)).toBe(true)
    steps(w, 1)
    expect(tapes.live).not.toBe(first)
    expect(live().first).toBe(50)
    w.freeKeyframe(k)
    w.destroy()
  })

  it('clearTapes (Reset, a new scene) forgets everything at once; the next step starts again from the world', async () => {
    const { w } = await preset('bounce')
    const handles = w.handleCount
    record(w)
    steps(w, 300)
    clearTapes()
    expect(tapes.live).toBeNull()
    expect(w.handleCount).toBe(handles)
    steps(w, 1)
    expect(live().first).toBe(300)
    w.destroy()
  })
})

describe('marks', () => {
  it('Bouncing ball at 240: within one step of 0.782, 2.033, 3.034 and 3.835 s; kept current as the run records', async () => {
    const { w, bodies } = await preset('bounce')
    record(w)
    let latest: readonly number[] = []
    const off = onTapeChange((c) => {
      if ((c.kind === 'grew' && c.marks) || c.kind === 'trimmed' || c.kind === 'branched') latest = [...(c.marks ?? [])]
    })
    steps(w, 4 * 240)
    off()
    const t = live()
    const m = marksOf(t)
    expect(latest).toEqual(m)
    const want = [0.782, 2.033, 3.034, 3.835]
    expect(m.length).toBe(want.length)
    m.forEach((step, i) => expect(Math.abs(t.timeOf(step) - want[i])).toBeLessThanOrEqual(1 / 240))
    // The first by hand: √(2 × 3.0 / 9.81) = 0.78206 s lies in step 188 (0.77917 to 0.78333 s).
    expect(m[0]).toBe(Math.ceil(Math.sqrt((2 * 3.0) / 9.81) * 240))
    // Each mark is the step the ball turned round in, by the tape's own records (a mark a step late or early fails).
    const ball = t.layout.bodies.indexOf(byName(bodies, 'Ball').id)
    const vy = (s: number) => t.record(s)![ball * REC_FLOATS + 8]
    for (const step of m) {
      expect(vy(step - 1)).toBeLessThan(0)
      expect(vy(step)).toBeGreaterThan(0)
    }
    w.destroy()
  })
})

describe('stepAtOrBefore', () => {
  it('finds a step by the clock’s ticks, never a hair short of a whole step', async () => {
    const { w } = await preset('bounce')
    record(w)
    steps(w, 240)
    const t = live()
    expect(stepAtOrBefore(t, 0.1)).toBe(24)
    expect(stepAtOrBefore(t, 0.7)).toBe(168)
    expect(stepAtOrBefore(t, 0.7 + 1 / 600)).toBe(168)
    expect(stepAtOrBefore(t, 0.7 + 1 / 240)).toBe(169)
    expect(stepAtOrBefore(t, -1)).toBe(0)
    expect(stepAtOrBefore(t, 99)).toBe(240)
    w.destroy()
  })

  it('a moment half a tick before a step is still the step before it, at 60, 120 and 240 (a fine playhead between ticks)', () => {
    for (const rate of [60, 120, 240]) {
      const t: RunTape = new Tape({ bodies: [], ropes: [] }, rate, 0, 0)
      for (let s = 0; s <= 20; s++) t.push(s, new Float32Array(0))
      expect(stepAtOrBefore(t, 11 / rate - 1 / 2400)).toBe(10)
      expect(stepAtOrBefore(t, 11 / rate - 1 / 1200)).toBe(10)
      expect(stepAtOrBefore(t, 11 / rate)).toBe(11)
      // A moment that is step 11 but for the last digit of a double is step 11.
      expect(stepAtOrBefore(t, 11 / rate - Number.EPSILON)).toBe(11)
      expect(stepAtOrBefore(t, 11 / rate + 1 / 2400)).toBe(11)
      // A tape that starts part-way, at a fine moment of a 600 run: 0.5 + 169/600 is 938/1200 s.
      const fine: RunTape = new Tape({ bodies: [], ropes: [] }, 600, 300, 0.5)
      for (let s = 300; s <= 900; s++) fine.push(s, new Float32Array(0))
      expect(stepAtOrBefore(fine, fine.timeOf(469))).toBe(469)
      expect(stepAtOrBefore(fine, fine.timeOf(469.5))).toBe(469)
      expect(stepAtOrBefore(fine, fine.timeOf(469.999))).toBe(469)
    }
  })
})

describe('what the tape costs (20 bodies, 240 steps a second)', () => {
  it('memory a second, the time a step takes to record, and a keyframe', async () => {
    const bodies: BodyDef[] = [floor()]
    for (let i = 0; i < 20; i++) {
      const at: V3 = [(i % 5) * 0.6 - 1.2, 0.3 + Math.floor(i / 5) * 0.7, 0]
      bodies.push(body({ shape: i % 2 ? 'box' : 'sphere', size: i % 2 ? [0.4, 0.4, 0.4] : [0.2, 0.2, 0.2], position: at, velocity: [(i % 3) - 1, 0, 0] }))
    }
    const w = await scene(bodies)
    // Without the recorder, then with it, over the same 2 s.
    let t0 = performance.now()
    steps(w, 480)
    const bare = (performance.now() - t0) / 480
    w.rebuild(bodies, [])
    record(w)
    t0 = performance.now()
    steps(w, 480)
    const recorded = (performance.now() - t0) / 480
    const t = live()
    let packs = 0
    for (const { e } of t.eventsIn(t.first, t.last)) if (!isContact(e)) packs += e.touches.byteLength
    const perSecond = (t.bytes + packs) / ((t.last - t.first + 1) / 240)
    t0 = performance.now()
    expect(firstDiff(rerunRecord(479), t.record(479))).toBe(-1)
    const rerun = performance.now() - t0
    t0 = performance.now()
    expect(fineReplayAt(240).ok).toBe(true)
    const fine = performance.now() - t0
    const ms = (x: number) => Math.round(x * 1000) / 1000
    console.info(
      `SB12 tape, 21 bodies at 240/s: ${Math.round(perSecond)} bytes a second (records alone ${bytesPerSecond(21, 240)}); ` +
        `a step ${ms(bare)} ms bare, ${ms(recorded)} ms recorded; re-run of 239 steps ${ms(rerun)} ms; fine replay of 1 s ${ms(fine)} ms`
    )
    // Loose bounds: the recorder must not make a step slow, nor a branch or a fine replay a wait.
    expect(recorded).toBeLessThan(bare + 1)
    expect(rerun).toBeLessThan(1000)
    expect(fine).toBeLessThan(2000)
    w.destroy()
  })
})

describe('what the recorder needs from the world (world.ts, outside SB12’s own files)', () => {
  it('Reset forgets who touched whom: a ball that rolled at the end of a run gets no rolling torque in the air after Reset (SB9’s lead)', async () => {
    // The ball starts 1 m up, spinning; it lands at about 0.4 s and rolls on concrete.
    const ball = body({ position: [0, 1, 0], angularVelocity: [0, 0, -8], material: 'rubber' })
    const ground = floor()
    const w = await scene([ground, ball])
    for (let i = 0; i < 240; i++) w.stepOnce()
    // It is rolling on the floor now: rolling resistance acted on the last step.
    expect(w.ownForces(ball.id)!.rollingTorque.some((v) => v !== 0)).toBe(true)
    // Reset: the ball is back 1 m up, spinning, touching nothing.
    w.rebuild([ground, ball], [])
    w.stepOnce()
    // In the air there is no surface to resist the spin. Before the fix, `touching` still said
    // "ball on floor" from the last run and the first step took one step of rolling torque.
    expect(w.ownForces(ball.id)!.rollingTorque).toEqual([0, 0, 0])
    // And the spin after that first step is what a fresh world gives (the same build, never run).
    const spin = w.state(ball.id)!.angularVelocity
    const fresh = await scene([ground, ball])
    fresh.stepOnce()
    expect(fresh.state(ball.id)!.angularVelocity).toEqual(spin)
    fresh.destroy()
  })

  it('onBeforeStep is called before every engine step, at the step about to be taken, and stops when asked', async () => {
    const { w } = await preset('bounce')
    const seen: { step: number; time: number }[] = []
    const off = w.onBeforeStep((x) => {
      seen.push({ step: x.stepIndex, time: x.time })
    })
    for (let i = 0; i < 3; i++) w.stepOnce()
    // Four steps of 1/240 s in one frame of 1/60 s: called four times, before each one.
    w.step(1 / 60)
    expect(seen.map((s) => s.step)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(seen[1].time).toBe(1 / 240)
    // A paused frame takes no step and calls nothing.
    w.step(0)
    expect(seen.length).toBe(7)
    off()
    w.stepOnce()
    expect(seen.length).toBe(7)
    w.destroy()
  })

  it('a keyframe may be saved from it, never restored (the world is about to step)', async () => {
    const { w } = await preset('bounce')
    const k0 = w.saveKeyframe()
    let saved: ReturnType<SimWorld['saveKeyframe']> | null = null
    let restored: boolean | null = null
    const off = w.onBeforeStep((x) => {
      if (x.stepIndex === 5) {
        saved = x.saveKeyframe()
        restored = x.restoreKeyframe(k0)
      }
    })
    for (let i = 0; i < 10; i++) w.stepOnce()
    off()
    expect(restored).toBe(false)
    expect(saved!.step).toBe(5)
    expect(w.stepIndex).toBe(10)
    // Saved before step 6, restored outside the hook, it gives step 6 … 10 again bit for bit.
    const want = new Float32Array(26)
    w.readRecord(want)
    expect(w.restoreKeyframe(saved!)).toBe(true)
    for (let i = 0; i < 5; i++) w.stepOnce()
    const got = new Float32Array(26)
    w.readRecord(got)
    expect(Array.from(got)).toEqual(Array.from(want))
    w.freeKeyframe(saved!)
    w.freeKeyframe(k0)
    w.destroy()
  })

  it('a new scene (SimWorld.create) drops the old before-step listeners, as it does the after-step ones', async () => {
    const { w } = await preset('bounce')
    let calls = 0
    w.onBeforeStep(() => {
      calls++
    })
    w.stepOnce()
    const again = await SimWorld.create()
    again.rebuild([floor(), body()], [])
    again.stepOnce()
    expect(calls).toBe(1)
    again.destroy()
  })

  it('definitions() hands back each body’s definition in record order and the links, as the world holds them now', async () => {
    const a = body({ name: 'A', position: [0, 2, 0] })
    const b = body({ name: 'B', position: [1, 2, 0] })
    const rod = link('rod', a, b)
    const w = await scene([floor(), a, b], [rod])
    const d = w.definitions()
    expect(d.bodies.map((x) => x.id)).toEqual(w.recordLayout().bodies)
    expect(d.bodies[1]).toBe(a)
    expect(d.links).toEqual([rod])
    // An edit in place shows at once; the lists are copies, so changing them changes nothing.
    const bouncier = { ...a, restitution: 0.9 }
    expect(w.updateBody(bouncier)).toBe(true)
    expect(w.definitions().bodies[1]).toBe(bouncier)
    d.bodies.length = 0
    d.links.length = 0
    expect(w.definitions().bodies.length).toBe(3)
    expect(w.definitions().links.length).toBe(1)
    w.destroy()
  })
})

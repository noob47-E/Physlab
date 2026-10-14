// SB16: drawing from the tape. In replay and fine replay the Sandbox draws the recording, never the engine: the
// readout at the playhead gives the recorded records exactly (`state`), blends between them for the picture
// (`drawn`, `transforms`, rope and pulley paths), plays backwards with the speeds reversed, plays slow motion
// without a single new engine step, and leaves the world to go on bit for bit at Back to live. Checked with the
// real engine and recorder in Node, on the presets the Sandbox opens, at the default 240 steps a second.

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { SimWorld, STRIDE } from '../src/renderer/src/sim/world'
import { presetById } from '../src/renderer/src/sim/presets'
import { DEFAULT_WORLD, type BodyDef, type BodyState, type Link } from '../src/renderer/src/sim/types'
import { REC_FLOATS, Tape } from '../src/renderer/src/sim/tape'
import { startRecorder, tapes, type RunTape } from '../src/renderer/src/sim/recorder'
import { shownTape, useTape } from '../src/renderer/src/sim/tapeStore'
import { engine, useSandbox } from '../src/renderer/src/sim/store'
import { useScene } from '../src/renderer/src/core/store'
import { stepOneFrame } from '../src/renderer/src/sim/stepping'
import { backToLive, playBackwards, stepBack } from '../src/renderer/src/sim/transportActions'
import {
  TRAIL_SEGMENTS,
  advancePlayhead,
  fillTrail,
  framePlan,
  newReplayView,
  newTrailBuffer,
  panelStates,
  panelsDue,
  replayViewFrame,
  replayFrame,
  tapeReadout,
  trailStart,
  trailStride,
  type PlaybackState
} from '../src/renderer/src/render/sandbox/playback'
import { readSource } from './helpers/repo'

/** A preset as the Sandbox opens it, with the store holding its bodies (the view's masses come from there). */
async function preset(id: string, edit?: (bodies: BodyDef[]) => void): Promise<{ w: SimWorld; bodies: BodyDef[]; links: Link[] }> {
  const built = presetById(id)!.build()
  edit?.(built.bodies)
  const w = await SimWorld.create({ ...DEFAULT_WORLD, ...(built.world ?? {}) })
  w.rebuild(built.bodies, built.links ?? [])
  useSandbox.setState({ bodies: built.bodies, links: built.links ?? [] })
  return { w, bodies: built.bodies, links: built.links ?? [] }
}

const live = (): RunTape => tapes.live!
const st = () => useTape.getState()

let stop: (() => void) | null = null
function record(w: SimWorld): void {
  stop = startRecorder(w)
}

beforeAll(async () => {
  // The WASM engine loads once; the first world after it is a warm-up.
  ;(await SimWorld.create()).destroy()
}, 30_000)

beforeEach(() => {
  useTape.setState({ speed: 1 })
  useScene.getState().setPlaying(false)
})

afterEach(() => {
  stop?.()
  stop = null
})

/** Object.is on every number: −0 is not 0, and a float32 off in its last bit is a failure. */
function sameNumbers(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false
  return true
}

function sameState(a: BodyState | null, b: BodyState | null): boolean {
  if (!a || !b) return false
  return (
    sameNumbers(a.position, b.position) &&
    sameNumbers(a.rotation, b.rotation) &&
    sameNumbers(a.velocity, b.velocity) &&
    sameNumbers(a.angularVelocity, b.angularVelocity) &&
    a.mass === b.mass
  )
}

const base = (over: Partial<PlaybackState> = {}): PlaybackState => ({ playhead: 10, speed: 1, direction: 1, loop: null, first: 0, last: 1000, rate: 240, ...over })

describe('the playhead moves realDt × speed × rate steps, stops at the ends, goes round a loop', () => {
  it('×1 at 240 moves 4 steps a frame of 1/60 s; ×0.1 moves 0.4; backwards the other way', () => {
    expect(advancePlayhead(base(), 1 / 60)).toEqual({ playhead: 14, stopped: false })
    expect(advancePlayhead(base({ speed: 0.1 }), 1 / 60).playhead).toBeCloseTo(10.4, 12)
    expect(advancePlayhead(base({ speed: 0.01, direction: -1 }), 1 / 60).playhead).toBeCloseTo(9.96, 12)
    expect(advancePlayhead(base({ rate: 600, speed: 0.5 }), 1 / 60)).toEqual({ playhead: 15, stopped: false })
    // A frame of no time (or a clock that went back) does not move it.
    expect(advancePlayhead(base(), 0).playhead).toBe(10)
    expect(advancePlayhead(base(), -1).playhead).toBe(10)
  })

  it('playing into an end stops there, forwards and backwards', () => {
    expect(advancePlayhead(base({ playhead: 998 }), 1 / 60)).toEqual({ playhead: 1000, stopped: true })
    expect(advancePlayhead(base({ playhead: 1000 }), 1 / 60)).toEqual({ playhead: 1000, stopped: true })
    expect(advancePlayhead(base({ playhead: 2, direction: -1 }), 1 / 60)).toEqual({ playhead: 0, stopped: true })
    expect(advancePlayhead(base({ playhead: 500, first: 480, direction: -1 }), 1)).toEqual({ playhead: 480, stopped: true })
  })

  it('a loop goes round from B to A (and A to B backwards), never stops, and pulls a playhead outside it in', () => {
    const loop = { a: 20, b: 50 }
    expect(advancePlayhead(base({ playhead: 48, loop }), 1 / 60)).toEqual({ playhead: 22, stopped: false })
    expect(advancePlayhead(base({ playhead: 22, loop, direction: -1 }), 1 / 60)).toEqual({ playhead: 48, stopped: false })
    // Exactly on B is shown; past it wraps. Many times round in one long frame lands where it should.
    expect(advancePlayhead(base({ playhead: 46, loop }), 1 / 60).playhead).toBe(50)
    expect(advancePlayhead(base({ playhead: 20, loop }), 1).playhead).toBe(20 + (240 % 30))
    // Outside the loop: from A forwards, from B backwards.
    expect(advancePlayhead(base({ playhead: 900, loop }), 1 / 60).playhead).toBe(24)
    expect(advancePlayhead(base({ playhead: 5, loop, direction: -1 }), 1 / 60).playhead).toBe(46)
    // A loop to the very end of the tape goes round too (it does not stop at the end).
    expect(advancePlayhead(base({ playhead: 996, loop: { a: 900, b: 1000 } }), 1 / 60)).toEqual({ playhead: 1000, stopped: false })
    expect(advancePlayhead(base({ playhead: 1000, loop: { a: 900, b: 1000 } }), 1 / 60)).toEqual({ playhead: 904, stopped: false })
    // A loop of no length is no loop.
    expect(advancePlayhead(base({ playhead: 998, loop: { a: 30, b: 30 } }), 1 / 60)).toEqual({ playhead: 1000, stopped: true })
  })
})

describe('framePlan: slow motion is as smooth as ×1', () => {
  it('×0.1 and ×0.01 at 240 give 60 different pictures a second at 60 fps (blended), as ×1 does (records skipped, none repeated)', () => {
    expect(framePlan(0.1, 60, 240)).toBe(60)
    expect(framePlan(0.01, 60, 240)).toBe(60)
    expect(framePlan(1, 60, 240)).toBe(60)
    expect(framePlan(0.25, 60, 600)).toBe(60)
    expect(framePlan(0.1, 30, 240)).toBe(30)
    expect(framePlan(0, 60, 240)).toBe(0)
  })

  it('without the blend, ×0.1 would land on a new record in only 24 of the 60 frames, ×0.01 in 2; ×1 never shows a record twice', () => {
    const newRecords = (speed: number): number => {
      const s = base({ playhead: 0, speed, last: 10_000 })
      let shown = 0
      let changes = 0
      for (let f = 0; f < 60; f++) {
        s.playhead = advancePlayhead(s, 1 / 60).playhead
        const record = Math.floor(s.playhead + 1e-9)
        if (record !== shown) changes++
        shown = record
      }
      return changes
    }
    expect(newRecords(0.1)).toBe(24)
    expect(newRecords(0.01)).toBe(2)
    expect(newRecords(1)).toBe(60)
  })
})

describe('tapeReadout: the recording read as the live world was (Bouncing ball, 240 steps a second)', () => {
  it('for 5 s, state(id) at step k is what the live world gave at step k, exactly; time, transforms and every body too', async () => {
    const { w, bodies } = await preset('bounce')
    record(w)
    const ids = w.bodyOrder.slice()
    const seen: BodyState[][] = [ids.map((id) => w.state(id)!)]
    const times = [w.time]
    for (let k = 1; k <= 5 * 240; k++) {
      w.stepOnce()
      seen.push(ids.map((id) => w.state(id)!))
      times.push(w.time)
    }
    const t = live()
    expect(t.first).toBe(0)
    expect(t.last).toBe(1200)
    for (let k = 0; k <= 1200; k++) {
      const r = tapeReadout(t, k, { bodies })
      ids.forEach((id, i) => expect(sameState(r.state(id), seen[k][i])).toBe(true))
      // At a whole step the picture is the record too.
      ids.forEach((id, i) => expect(sameState(r.drawn(id), seen[k][i])).toBe(true))
      // The clock: the same moment in the clock's ticks of 1/1200 s.
      expect(Math.round(r.time * 1200)).toBe(Math.round(times[k] * 1200))
      expect(r.bodyOrder).toEqual(ids)
      seen[k].forEach((s, i) => {
        expect(sameNumbers(r.transforms.subarray(i * STRIDE, i * STRIDE + STRIDE), new Float32Array([...s.position, ...s.rotation]))).toBe(true)
      })
    }
    // The mass is the definition's, as the engine has it.
    const ball = bodies.find((b) => b.name === 'Ball')!
    expect(tapeReadout(t, 600, { bodies }).state(ball.id)!.mass).toBe(0.5)
    expect(tapeReadout(t, 600, { bodies }).state('nobody')).toBeNull()
  })

  it('drawn at k + ½ lies between the two records: positions and speeds halfway, the turn unit length and the short way round', async () => {
    const { w, bodies } = await preset('bounce', (bs) => {
      // A spinning ball, so the turn changes from record to record.
      const ball = bs.find((b) => b.name === 'Ball')!
      ball.angularVelocity = [0, 0, 6]
      ball.velocity = [0.5, 0, 0]
    })
    record(w)
    for (let k = 0; k < 2 * 240; k++) w.stepOnce()
    const t = live()
    const ball = bodies.find((b) => b.name === 'Ball')!
    for (let k = 0; k < 480; k += 7) {
      const a = tapeReadout(t, k, { bodies }).state(ball.id)!
      const b = tapeReadout(t, k + 1, { bodies }).state(ball.id)!
      const h = tapeReadout(t, k + 0.5, { bodies }).drawn(ball.id)!
      for (let c = 0; c < 3; c++) {
        expect(h.position[c]).toBeGreaterThanOrEqual(Math.min(a.position[c], b.position[c]))
        expect(h.position[c]).toBeLessThanOrEqual(Math.max(a.position[c], b.position[c]))
        expect(h.position[c]).toBeCloseTo((a.position[c] + b.position[c]) / 2, 5)
        expect(h.velocity[c]).toBeCloseTo((a.velocity[c] + b.velocity[c]) / 2, 4)
      }
      expect(Math.hypot(...h.rotation)).toBeCloseTo(1, 6)
      // Halfway along the short way: at least as close to each end as the ends are to each other.
      const dot = (x: number[], y: number[]) => Math.abs(x[0] * y[0] + x[1] * y[1] + x[2] * y[2] + x[3] * y[3])
      expect(dot(h.rotation, a.rotation)).toBeGreaterThanOrEqual(dot(a.rotation, b.rotation) - 1e-6)
      expect(dot(h.rotation, b.rotation)).toBeGreaterThanOrEqual(dot(a.rotation, b.rotation) - 1e-6)
      // The panels' numbers stay on the record at ⌊playhead⌋.
      expect(sameState(tapeReadout(t, k + 0.5, { bodies }).state(ball.id), a)).toBe(true)
    }
  })

  it('a turn stored as q then −q (the same turn) blends the short way, not through a half turn', () => {
    const tape = new Tape({ bodies: ['q'], ropes: [] }, 240, 0, 0) as unknown as RunTape
    const s = Math.SQRT1_2
    tape.push(0, new Float32Array([0, 0, 0, 0, 0, s, s, 0, 0, 0, 0, 0, 0]))
    tape.push(1, new Float32Array([0, 0, 0, 0, 0, -s, -s, 0, 0, 0, 0, 0, 0]))
    const h = tapeReadout(tape, 0.5).drawn('q')!.rotation
    expect(Math.abs(h[2])).toBeCloseTo(s, 6)
    expect(Math.abs(h[3])).toBeCloseTo(s, 6)
  })

  it('a rope (the Crane, swinging) lies through its links’ records: at a whole step exactly the live world’s path', async () => {
    const { w, bodies, links } = await preset('crane', (bs) => {
      bs.find((b) => b.name === 'Crate')!.velocity = [1.2, 0, 0]
    })
    record(w)
    const rope = links.find((l) => l.kind === 'rope')!
    const paths: number[][][] = [w.linkPath(rope)]
    for (let k = 1; k <= 240; k++) {
      w.stepOnce()
      paths.push(w.linkPath(rope))
    }
    const t = live()
    expect(t.layout.ropes.map((r) => r.linkId)).toEqual([rope.id])
    expect(paths[0].length).toBe(t.layout.ropes[0].count + 2)
    for (let k = 0; k <= 240; k += 5) {
      const got = tapeReadout(t, k, { bodies }).linkPath(rope)
      expect(got.length).toBe(paths[k].length)
      got.forEach((p, i) => expect(sameNumbers(p, paths[k][i])).toBe(true))
    }
    // Between two steps every point of the rope is between its two records.
    const mid = tapeReadout(t, 100.5, { bodies }).linkPath(rope)
    mid.forEach((p, i) => {
      for (let c = 0; c < 3; c++) {
        expect(p[c]).toBeGreaterThanOrEqual(Math.min(paths[100][i][c], paths[101][i][c]) - 1e-6)
        expect(p[c]).toBeLessThanOrEqual(Math.max(paths[100][i][c], paths[101][i][c]) + 1e-6)
      }
    })
  })

  it('a pulley rope (Atwood) runs over the wheel’s rim at its recorded place, as the live world draws it', async () => {
    const { w, bodies, links } = await preset('atwood')
    record(w)
    const rope = links.find((l) => l.kind === 'pulley')!
    const paths: number[][][] = [w.linkPath(rope)]
    for (let k = 1; k <= 120; k++) {
      w.stepOnce()
      paths.push(w.linkPath(rope))
    }
    const t = live()
    for (let k = 0; k <= 120; k += 10) {
      const got = tapeReadout(t, k, { bodies }).linkPath(rope)
      expect(got.length).toBe(4)
      got.forEach((p, i) => p.forEach((x, c) => expect(x).toBeCloseTo(paths[k][i][c], 6)))
    }
    // The masses have moved (m₂ falls), and the drawing follows them.
    expect(paths[120][3][1]).not.toBeCloseTo(paths[0][3][1], 2)
  })
})

describe('reverse play: a fall played backwards rises at the same speeds (Idea #39 F18)', () => {
  it('reversed, every speed is the recorded one with its sign turned, vᵧ upwards; positions are the recorded ones', async () => {
    const { w, bodies } = await preset('drop')
    record(w)
    for (let k = 0; k < 240; k++) w.stepOnce()
    const t = live()
    const heavy = bodies.find((b) => b.name === 'Heavy')!
    for (const k of [60, 120, 200, 200.25]) {
      const fwd = tapeReadout(t, k, { bodies })
      const back = tapeReadout(t, k, { bodies, reversed: true })
      for (const read of ['state', 'drawn'] as const) {
        const f = fwd[read](heavy.id)!
        const b = back[read](heavy.id)!
        expect(f.velocity[1]).toBeLessThan(0)
        expect(b.velocity[1]).toBeGreaterThan(0)
        expect(b.velocity.map((v) => -v)).toEqual(f.velocity)
        expect(b.angularVelocity.map((v) => -v + 0)).toEqual(f.angularVelocity.map((v) => v + 0))
        expect(Math.hypot(...b.velocity)).toBe(Math.hypot(...f.velocity))
        expect(b.position).toEqual(f.position)
      }
    }
  })

  it('J from the end plays backwards: the readout of each frame is reversed while it plays, and as recorded once paused', async () => {
    const { w, bodies } = await preset('drop')
    record(w)
    for (let k = 0; k < 240; k++) w.stepOnce()
    const heavy = bodies.find((b) => b.name === 'Heavy')!
    playBackwards()
    expect(st().mode).toBe('replay')
    expect(st().direction).toBe(-1)
    expect(st().playing).toBe(true)
    let last = st().playhead
    for (let f = 0; f < 30; f++) {
      const r = replayFrame(1 / 60, bodies)!
      expect(st().playhead).toBeCloseTo(last - 4, 9)
      last = st().playhead
      const rec = live().record(Math.floor(last))!
      const i = live().layout.bodies.indexOf(heavy.id)
      expect(r.state(heavy.id)!.velocity[1]).toBe(-rec[i * REC_FLOATS + 8])
      expect(r.state(heavy.id)!.velocity[1]).toBeGreaterThan(0)
    }
    st().pause()
    const paused = replayFrame(1 / 60, bodies)!
    expect(paused.state(heavy.id)!.velocity[1]).toBeLessThan(0)
    backToLive()
  })
})

describe('slow motion and Back to live: the engine is never stepped while a recording is shown', () => {
  it('×0.1 moves 0.4 of a step a frame and draws between records; ×0.01 0.04; the world does not move', async () => {
    const { w, bodies } = await preset('bounce')
    record(w)
    for (let k = 0; k < 2 * 240; k++) w.stepOnce()
    const ball = bodies.find((b) => b.name === 'Ball')!
    let afterSteps = 0
    const off = w.onAfterStep(() => afterSteps++)
    const before = new Float32Array(live().layout.bodies.length * REC_FLOATS)
    w.readRecord(before)

    stepBack()
    st().scrubTo(100)
    st().setSpeed(0.1)
    st().play()
    const ys = new Set<number>()
    for (let f = 0; f < 60; f++) {
      const r = replayFrame(1 / 60, bodies)!
      ys.add(r.drawn(ball.id)!.position[1])
    }
    // One second of real time at ×0.1 is 24 steps, drawn as 60 different pictures.
    expect(st().playhead).toBeCloseTo(124, 9)
    expect(ys.size).toBe(60)
    st().setSpeed(0.01)
    for (let f = 0; f < 60; f++) replayFrame(1 / 60, bodies)
    expect(st().playhead).toBeCloseTo(126.4, 9)

    off()
    expect(afterSteps).toBe(0)
    expect(w.stepIndex).toBe(480)
    expect(live().last).toBe(480)
    const after = new Float32Array(before.length)
    w.readRecord(after)
    expect(sameNumbers(after, before)).toBe(true)
    backToLive()
  })

  it('stepping back from the end enters replay; Back to live returns to the end and the run goes on bit for bit as if never replayed', async () => {
    const { w, bodies } = await preset('bounce')
    record(w)
    for (let k = 0; k < 2 * 240; k++) w.stepOnce()
    const key = w.saveKeyframe()

    stepBack()
    expect(st().mode).toBe('replay')
    expect(st().playhead).toBe(479)
    // Replay things: scrub, play backwards, slow motion, a loop, step on.
    st().scrubTo(300)
    st().setSpeed(0.25)
    st().setLoop(200, 320)
    st().play()
    for (let f = 0; f < 200; f++) replayFrame(1 / 60, bodies)
    st().setLoop(null)
    st().reverse()
    for (let f = 0; f < 20; f++) replayFrame(1 / 60, bodies)
    stepOneFrame()
    expect(w.stepIndex).toBe(480)

    backToLive()
    expect(st().mode).toBe('live')
    expect(st().playhead).toBe(480)
    expect(replayFrame(1 / 60, bodies)).toBeNull()
    for (let k = 0; k < 240; k++) w.stepOnce()
    const t = live()
    expect(t.last).toBe(720)
    const got = Array.from({ length: 241 }, (_, i) => new Float32Array(t.record(480 + i)!))
    stop!()
    stop = null

    // The same 240 steps from the keyframe, with no replay in between.
    expect(w.restoreKeyframe(key)).toBe(true)
    const ref = new Float32Array(got[0].length)
    for (let i = 0; i <= 240; i++) {
      if (i > 0) w.stepOnce()
      w.readRecord(ref)
      expect(sameNumbers(ref, got[i])).toBe(true)
    }
    w.freeKeyframe(key)
  })

  it('the Step button in replay moves the playhead one step (and stops at the end); in live it steps the engine', async () => {
    const { w } = await preset('bounce')
    record(w)
    engine.world = w
    useSandbox.setState({ live: {}, engineTime: 0 })
    stepOneFrame()
    expect(w.stepIndex).toBe(1)
    for (let k = 0; k < 239; k++) w.stepOnce()
    st().scrubTo(100.5)
    expect(st().mode).toBe('replay')
    stepOneFrame()
    expect(st().playhead).toBe(101)
    expect(st().playing).toBe(false)
    stepOneFrame()
    expect(st().playhead).toBe(102)
    expect(w.stepIndex).toBe(240)
    st().scrubTo(240)
    stepOneFrame()
    expect(st().playhead).toBe(240)
    expect(w.stepIndex).toBe(240)
    backToLive()
    stepOneFrame()
    expect(w.stepIndex).toBe(241)
    engine.world = null
  })

  it('fine replay is drawn from the fine tape: 600 records a second, blended the same way', async () => {
    const { w, bodies } = await preset('bounce')
    record(w)
    for (let k = 0; k < 2 * 240; k++) w.stepOnce()
    stepBack()
    st().scrubTo(150)
    st().fineReplay()
    expect(st().mode).toBe('fine')
    const fine = shownTape()!
    expect(fine).toBe(tapes.fine)
    expect(fine.rate).toBe(600)
    const ball = bodies.find((b) => b.name === 'Ball')!
    const r = replayFrame(1 / 60, bodies)!
    const i = fine.layout.bodies.indexOf(ball.id)
    const p = Math.floor(st().playhead)
    expect(r.state(ball.id)!.position[1]).toBe(fine.record(p)![i * REC_FLOATS + 1])
    expect(Math.round(r.time * 1200)).toBe(Math.round(fine.timeOf(st().playhead) * 1200))
    st().setSpeed(1)
    st().play()
    replayFrame(1 / 60, bodies)
    expect(st().playhead).toBeCloseTo(p + 10, 9)
    expect(w.stepIndex).toBe(480)
    backToLive()
  })
})

describe('the panels follow the playhead', () => {
  it('a new moment at most ten times a second while it plays on; at once when paused, scrubbed, stepped, turned round or on another tape', () => {
    const tape = {}
    const was = { tape, step: 100, reversed: false, at: 1000 }
    expect(panelsDue(null, { tape, step: 100, reversed: false }, true, true, 0)).toBe(true)
    // The same moment is never published twice.
    expect(panelsDue(was, { tape, step: 100, reversed: false }, false, false, 5000)).toBe(false)
    // Playing on by itself: held for 100 ms, then the moment it is on.
    expect(panelsDue(was, { tape, step: 104, reversed: false }, true, true, 1050)).toBe(false)
    expect(panelsDue(was, { tape, step: 124, reversed: false }, true, true, 1100)).toBe(true)
    // Scrubbed or stepped while it plays (the picture jumped): at once.
    expect(panelsDue(was, { tape, step: 200, reversed: false }, true, false, 1001)).toBe(true)
    // Turned round while it plays: the speeds change sign at once.
    expect(panelsDue(was, { tape, step: 96, reversed: true }, true, true, 1016)).toBe(true)
    // Paused, or another tape (fine replay, a new run): at once.
    expect(panelsDue(was, { tape, step: 101, reversed: false }, false, true, 1001)).toBe(true)
    expect(panelsDue(was, { tape: {}, step: 100, reversed: false }, true, true, 1001)).toBe(true)
  })

  it('a recording paused between two steps settles on the nearer one: the picture, the numbers and the clocks are one recorded moment', async () => {
    const { w, bodies } = await preset('bounce')
    record(w)
    for (let k = 0; k < 480; k++) w.stepOnce()
    const ball = bodies.find((b) => b.name === 'Ball')!
    stepBack()
    st().scrubTo(100)
    st().setSpeed(0.1)
    st().play()
    for (let f = 0; f < 4; f++) replayFrame(1 / 60, bodies)
    expect(st().playhead).toBeCloseTo(101.6, 9)
    st().pause()
    const r = replayFrame(1 / 60, bodies, true)!
    expect(st().playhead).toBe(102)
    expect(sameState(r.drawn(ball.id), r.state(ball.id))).toBe(true)
    expect(Math.round(r.time * 1200)).toBe(Math.round(live().timeOf(102) * 1200))
    // Without `settle` (a moment the store put there itself, such as Fine replay's chosen moment) it stays.
    st().scrubTo(150.5)
    replayFrame(1 / 60, bodies)
    expect(st().playhead).toBe(150.5)
    backToLive()
  })

  it('the view’s frames: Play moves no time on its first frame; a scrub or a turn round while it plays is shown first and published at once; a loop’s wrap too', async () => {
    const { w, bodies } = await preset('bounce', (bs) => {
      bs.find((b) => b.name === 'Ball')!.velocity = [1, 0, 0]
    })
    record(w)
    for (let k = 0; k < 480; k++) w.stepOnce()
    const ball = bodies.find((b) => b.name === 'Ball')!
    const t = live()
    const at = (step: number) => tapeReadout(t, step, { bodies }).state(ball.id)!
    const v = newReplayView()
    let now = 0
    const frame = (dt: number) => {
      now += dt * 1000
      return replayViewFrame(v, dt, bodies, now)!
    }
    stepBack()
    st().scrubTo(100)
    let f = frame(1 / 60)
    expect(f.panels!.engineTime).toBe(t.timeOf(100))
    expect(f.more).toBe(false)
    // Play after ten idle seconds: the first frame shows the same moment (no jump), the next moves 4 steps.
    st().play()
    f = frame(10)
    expect(st().playhead).toBe(100)
    expect(f.more).toBe(true)
    frame(1 / 60)
    expect(st().playhead).toBe(104)
    // Played on by itself, the panels wait up to 0.1 s.
    f = frame(1 / 60)
    expect(st().playhead).toBe(108)
    expect(f.panels).toBeNull()
    // Scrubbed while it plays: the scrubbed moment is drawn first and the panels take it at once.
    st().scrubTo(300)
    f = frame(1 / 60)
    expect(st().playhead).toBe(300)
    expect(f.panels!.engineTime).toBe(t.timeOf(300))
    expect(sameState(f.panels!.live[ball.id], at(300))).toBe(true)
    frame(1 / 60)
    expect(st().playhead).toBe(304)
    // Turned round while it plays: the same moment first, its speeds reversed, at once.
    st().reverse()
    f = frame(1 / 60)
    expect(st().playhead).toBe(304)
    expect(f.panels!.live[ball.id].velocity[0]).toBe(-at(304).velocity[0])
    expect(f.panels!.live[ball.id].velocity[0]).toBeLessThan(0)
    frame(1 / 60)
    expect(st().playhead).toBe(300)
    // Round a loop: the jump from B back to A is published at once.
    st().reverse()
    st().setLoop(280, 310)
    frame(1 / 60)
    frame(1 / 60)
    expect(st().playhead).toBe(304)
    frame(1 / 60)
    f = frame(1 / 60)
    expect(st().playhead).toBe(282)
    expect(f.panels!.engineTime).toBe(t.timeOf(282))
    // Paused part-way at ×0.1: the next frame settles on a whole step and publishes it.
    st().setLoop(null)
    st().setSpeed(0.1)
    frame(1 / 60)
    frame(1 / 60)
    expect(Number.isInteger(st().playhead)).toBe(false)
    st().pause()
    f = frame(1 / 60)
    expect(Number.isInteger(st().playhead)).toBe(true)
    expect(f.panels!.engineTime).toBe(t.timeOf(st().playhead))
    expect(sameState(f.readout.drawn(ball.id), f.readout.state(ball.id))).toBe(true)
    expect(w.stepIndex).toBe(480)
    // Live: the view draws the world.
    backToLive()
    expect(replayViewFrame(v, 1 / 60, bodies, now)).toBeNull()
  })

  it('a mass (or size, shape, material) changed part-way rebuilds the body and starts a new tape, so a replayed mass is always its own', async () => {
    const { w, bodies, links } = await preset('drop')
    record(w)
    for (let k = 0; k < 120; k++) w.stepOnce()
    const first = live()
    const heavy = bodies.find((b) => b.name === 'Heavy')!
    const heavier = { ...heavy, mass: 10 }
    expect(w.updateBody(heavier)).toBe(false)
    const next = bodies.map((b) => (b.id === heavy.id ? heavier : b))
    w.rebuild(next, links, true)
    w.stepOnce()
    expect(live()).not.toBe(first)
    expect(live().first).toBe(120)
    expect(tapeReadout(live(), live().last, { bodies: next }).state(heavy.id)!.mass).toBe(10)
  })

  it("panelStates gives every defined body its state at the readout moment", async () => {
    const { w, bodies } = await preset("drop")
    record(w)
    for (let k = 0; k < 120; k++) w.stepOnce()
    const r = tapeReadout(live(), 60.75, { bodies })
    const states = panelStates(r, bodies)
    expect(Object.keys(states).sort()).toEqual(bodies.map((b) => b.id).sort())
    for (const b of bodies) expect(sameState(states[b.id], r.state(b.id))).toBe(true)
  })

  it("engineTime tracks the shown step's time (floored), not the fractional playhead", async () => {
    const { w, bodies } = await preset("bounce")
    record(w)
    for (let k = 0; k < 480; k++) w.stepOnce()
    const t = live()
    const v = newReplayView()
    let now = 0
    const frame = (dt: number) => {
      now += dt * 1000
      return replayViewFrame(v, dt, bodies, now)!
    }
    stepBack()
    st().scrubTo(100)
    st().setSpeed(0.1)
    st().play()
    frame(1 / 60)
    frame(1 / 60)
    const fractionalPlayhead = st().playhead
    expect(Number.isInteger(fractionalPlayhead)).toBe(false)
    // Advance by 0.1s to trigger next publish
    frame(0.15)
    const f = frame(1 / 60)
    if (f.panels) {
      const shownStep = Math.floor(st().playhead)
      const expectedTime = t.timeOf(shownStep)
      expect(f.panels.engineTime).toBe(expectedTime)
    }
    backToLive()
  })

  it("panels publish at most once per 0.1 s of wall time, accounting for fractional playhead advances", async () => {
    const { w, bodies } = await preset("bounce")
    record(w)
    for (let k = 0; k < 480; k++) w.stepOnce()
    const v = newReplayView()
    let now = 0
    const frame = (dt: number) => {
      now += dt * 1000
      return replayViewFrame(v, dt, bodies, now)!
    }
    stepBack()
    st().scrubTo(100)
    st().play()
    const f1 = frame(1 / 60)
    expect(f1.panels).not.toBeNull()
    const publishedTime1 = now
    // Advance less than 0.1s: panels should not update
    frame(0.05)
    const f2 = frame(1 / 60)
    expect(f2.panels).toBeNull()
    // Advance more: after 0.1s total panels should update again
    let f = f2
    for (let i = 0; i < 10 && now - publishedTime1 < 100; i++) {
      f = frame(1 / 60)
    }
    // After 0.1s has passed, panels should be published again
    while (f.panels === null && now - publishedTime1 < 200) {
      f = frame(1 / 60)
    }
    if (now - publishedTime1 >= 100) {
      expect(f.panels).not.toBeNull()
    }
    backToLive()
  })

  it("setting a loop while playing with playhead outside moves it to loop.a at once", async () => {
    const { w, bodies } = await preset("bounce", (bs) => {
      bs.find((b) => b.name === "Ball")!.velocity = [150, 0, 0]
    })
    record(w)
    for (let k = 0; k < 600; k++) w.stepOnce()
    const v = newReplayView()
    let now = 0
    const frame = (dt: number) => {
      now += dt * 1000
      return replayViewFrame(v, dt, bodies, now)!
    }
    stepBack()
    st().scrubTo(400)
    st().play()
    frame(1 / 60)
    frame(1 / 60)
    // Now playing forward from ~408
    const beforeLoopPlayhead = st().playhead
    expect(beforeLoopPlayhead).toBeGreaterThan(400)
    // Set a loop with A=200, B=320, playhead is outside (408 > 320)
    st().setLoop(200, 320)
    // Next frame should show playhead at loop.a = 200 (no advance on first frame after loop change)
    const f = frame(1 / 60)
    expect(st().playhead).toBe(200)
    expect(f.readout.state(bodies[0].id)).not.toBeNull()
    backToLive()
  })
})

describe('trails from the tape', () => {
  it('take a point every power-of-two steps, never more than 600 segments with the piece to the playhead', () => {
    expect(TRAIL_SEGMENTS).toBe(600)
    expect(trailStride(0)).toBe(1)
    expect(trailStride(599)).toBe(1)
    expect(trailStride(600)).toBe(2)
    expect(trailStride(1198)).toBe(2)
    expect(trailStride(1199)).toBe(4)
    for (const steps of [1, 240, 1200, 4800, 57_600, 64_000]) {
      const n = trailStride(steps)
      expect(Math.log2(n) % 1).toBe(0)
      // Points every n steps up to the playhead, plus the last piece: within 600 segments.
      expect(Math.floor(steps / n) + 1).toBeLessThanOrEqual(TRAIL_SEGMENTS)
      // And the next smaller stride would not fit.
      if (n > 1) expect(Math.ceil(steps / (n / 2))).toBeGreaterThan(TRAIL_SEGMENTS - 1)
    }
    // A trail growing past a limit keeps every other point (all its points are on the new stride's grid or between).
    expect(trailStride(1199) % trailStride(1198)).toBe(0)
  })

  it('start at the tape’s first step, or at the first step at or after the moment the trails were cleared', async () => {
    const { w } = await preset('bounce')
    record(w)
    for (let k = 0; k < 480; k++) w.stepOnce()
    const t = live()
    expect(trailStart(t, null)).toBe(0)
    expect(trailStart(t, 1)).toBe(240)
    expect(trailStart(t, 1 + 1e-12)).toBe(240)
    expect(trailStart(t, 1.001)).toBe(241)
    expect(trailStart(t, -3)).toBe(0)
    // On the fine tape (another rate and another first step) the same moment is its own step.
    stepBack()
    st().scrubTo(240)
    st().fineReplay()
    const fine = shownTape()!
    const at = trailStart(fine, 1.2)
    expect(Math.round(fine.timeOf(at) * 1200)).toBe(Math.round(1.2 * 1200))
    expect(trailStart(fine, 0)).toBe(fine.first)
    backToLive()
  })
})

describe('a trail is the tape up to the playhead', () => {
  /** The trail filled from nothing at `head`: what an incremental fill must equal. */
  const fresh = (t: RunTape, id: string, from: number, head: number) => {
    const b = newTrailBuffer()
    const r = fillTrail(b, t, id, from, head, null)
    return { out: b.out.slice(0, r.segments * 6), segments: r.segments }
  }
  const pos = (t: RunTape, id: string, step: number) => {
    const o = t.layout.bodies.indexOf(id) * REC_FLOATS
    const r = t.record(step)!
    return [r[o], r[o + 1], r[o + 2]]
  }

  it('takes its points from the records every stride steps, ends where the body is drawn, and never holds more than 600 segments', async () => {
    const { w, bodies } = await preset('bounce')
    record(w)
    for (let k = 0; k < 1200; k++) w.stepOnce()
    const t = live()
    const ball = bodies.find((b) => b.name === 'Ball')!.id
    const buf = newTrailBuffer()
    expect(fillTrail(buf, t, ball, 0, 0, null).segments).toBe(0)
    // The live end of 5 s: a point every 4 steps, 300 segments, the last one on the end itself.
    const end = fillTrail(buf, t, ball, 0, 1200, null)
    expect(end.segments).toBe(300)
    expect(end.changed).toBe(true)
    for (let j = 0; j < 300; j++) {
      expect(sameNumbers(buf.out.subarray(j * 6, j * 6 + 3), new Float32Array(pos(t, ball, 4 * j)))).toBe(true)
      expect(sameNumbers(buf.out.subarray(j * 6 + 3, j * 6 + 6), new Float32Array(pos(t, ball, 4 * j + 4)))).toBe(true)
    }
    // Paused there, nothing changes and nothing is uploaded again.
    expect(fillTrail(buf, t, ball, 0, 1200, null)).toEqual({ segments: 300, changed: false })
    // Rewound to 300.25: a point every step to 300, and the last piece to the blend a quarter of the way to 301.
    const back = fillTrail(buf, t, ball, 0, 300.25, null)
    expect(back.segments).toBe(301)
    const a = pos(t, ball, 300)
    const b = pos(t, ball, 301)
    const tip = tapeReadout(t, 300.25, { bodies }).drawn(ball)!.position
    for (let c = 0; c < 3; c++) {
      expect(buf.out[300 * 6 + c]).toBe(new Float32Array(a)[c])
      expect(buf.out[300 * 6 + 3 + c]).toBe(new Float32Array([a[c] + (b[c] - a[c]) * 0.25])[0])
      expect(buf.out[300 * 6 + 3 + c]).toBe(tip[c])
    }
    // Given where the body is drawn this frame (the readout's place), the last piece ends there.
    expect(fillTrail(buf, t, ball, 0, 300.25, null, [1, 2, 3])).toEqual({ segments: 301, changed: true })
    expect(Array.from(buf.out.subarray(300 * 6 + 3, 300 * 6 + 6))).toEqual([1, 2, 3])
    for (const head of [0.5, 7, 599, 600, 1199, 1200, 640.75]) expect(fillTrail(newTrailBuffer(), t, ball, 0, head, null).segments).toBeLessThanOrEqual(TRAIL_SEGMENTS)
    // A start after the playhead (the trails were cleared later on) draws nothing.
    expect(fillTrail(newTrailBuffer(), t, ball, 500, 499.5, null).segments).toBe(0)
  })

  it('grown frame by frame, rewound and played again, it is exactly the trail filled from nothing at each moment', async () => {
    const { w, bodies } = await preset('bounce')
    record(w)
    for (let k = 0; k < 1200; k++) w.stepOnce()
    const t = live()
    const ball = bodies.find((b) => b.name === 'Ball')!.id
    const buf = newTrailBuffer()
    const heads: number[] = []
    for (let h = 0; h <= 1200; h += 2.4) heads.push(h)
    for (let h = 1200; h >= 700; h -= 9.6) heads.push(h)
    for (let h = 700; h <= 1000; h += 0.4) heads.push(h)
    for (const h of heads) {
      const r = fillTrail(buf, t, ball, 120, h, null)
      const f = fresh(t, ball, 120, h)
      expect(r.segments).toBe(f.segments)
      expect(sameNumbers(buf.out.subarray(0, r.segments * 6), f.out)).toBe(true)
    }
  })

  it('a branch (a new parent) or a new tape fills it again; in fine replay it is the fine tape’s own path', async () => {
    const { w, bodies } = await preset('bounce')
    record(w)
    for (let k = 0; k < 480; k++) w.stepOnce()
    const ball = bodies.find((b) => b.name === 'Ball')!.id
    const buf = newTrailBuffer()
    fillTrail(buf, live(), ball, 0, 480, null)
    const parent = { tape: live(), step: 240 }
    expect(fillTrail(buf, live(), ball, 0, 480, parent).changed).toBe(true)
    stepBack()
    st().scrubTo(150)
    st().fineReplay()
    const fine = shownTape()!
    expect(fine.rate).toBe(600)
    const from = trailStart(fine, null)
    const head = fine.first + 300.5
    const r = fillTrail(buf, fine, ball, from, head, parent)
    const f = fresh(fine, ball, from, head)
    expect(r.segments).toBe(301)
    expect(r.segments).toBe(f.segments)
    expect(sameNumbers(buf.out.subarray(0, r.segments * 6), f.out)).toBe(true)
    expect(sameNumbers(buf.out.subarray(0, 3), new Float32Array(pos(fine, ball, fine.first)))).toBe(true)
    backToLive()
  })
})

describe('the view never steps or reads the engine while a recording is shown', () => {
  it('the frame loop draws the tape first and returns before any call on the world; Connect reads no live body in replay', () => {
    const src = readSource('src/renderer/src/render/SandboxView.tsx')
    const loop = src.slice(src.indexOf('useFrame((state, dt) => {'))
    const replay = loop.slice(0, loop.indexOf('readoutRef.current = liveOf(w)'))
    expect(replay).toMatch(/replayViewFrame\(/)
    expect(replay).toMatch(/if \(shown\) \{[\s\S]*?return\n/)
    // Before the live branch: nothing on the world but the two null checks.
    const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const rest = code(replay).replace(/const w = sim\.current/, '').replace(/if \(!w \|\| !g\) return/, '')
    expect(rest).not.toMatch(/\bw\b/)
    expect(rest).not.toMatch(/\bsim\b|\bengine\b|\bSimWorld\b/)
    // And what it calls never reaches the engine: playback.ts has no way to it (no store, no engine, no step).
    const pb = code(readSource('src/renderer/src/render/sandbox/playback.ts'))
    expect(pb).not.toMatch(/sim\/store'|\bengine\b|\.step\(|stepOnce\(|readRecord\(|\.state\(id\)/)
    expect(pb.match(/SimWorld\.\w+/g)).toEqual(['SimWorld.massOf'])
    const join = src.slice(src.indexOf('const join = useSandbox.getState().joinMode'))
    expect(join.indexOf('replayRefusal()')).toBeGreaterThan(0)
    expect(join.indexOf('replayRefusal()')).toBeLessThan(join.indexOf('w.state(join.a)'))
  })
})

describe('the view starts the recorder once, with the engine', () => {
  it('SandboxView calls startRecorder only where the engine is made, and never stops it', () => {
    const src = readSource('src/renderer/src/render/SandboxView.tsx')
    expect(src.match(/startRecorder\(/g)?.length).toBe(1)
    const made = src.indexOf('engine.world = w')
    const started = src.indexOf('startRecorder(w)')
    expect(made).toBeGreaterThan(0)
    expect(started).toBeGreaterThan(made)
    // The next statement block after it, not in the remount branch or a cleanup.
    expect(src.slice(made, started)).not.toMatch(/return\s*\(\)\s*=>/)
    expect(src).not.toMatch(/=\s*startRecorder\(/)
  })
})

// SB17: what the transport buttons, the strip and the keys do, in each of the tape's three modes (live, replay, fine).
// The tape store is I-5's `useTape`; the tape is a real `Tape` (sim/tape.ts) with a few hundred zero records, so nothing here
// needs the physics engine. `stepOneFrame` is replaced by a counter that grows the live tape by one step, as the recorder does.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Tape, REC_FLOATS } from '../src/renderer/src/sim/tape'
import { useTape, shownTape } from '../src/renderer/src/sim/tapeStore'
import { clearTapes, startRecorder, tapes } from '../src/renderer/src/sim/recorder'
import { SimWorld } from '../src/renderer/src/sim/world'
import { presetById } from '../src/renderer/src/sim/presets'
import { DEFAULT_WORLD } from '../src/renderer/src/sim/types'
import { barKeyTarget, seekStep, stripModel } from '../src/renderer/src/render/sandbox/TapeStrip'
import { useScene } from '../src/renderer/src/core/store'
import { useSandbox } from '../src/renderer/src/sim/store'
import {
  SPEEDS,
  backToLive,
  bookmarkHere,
  branchFromHere,
  chooseSpeed,
  clearLoop,
  cycleSpeed,
  fineReplay,
  flagsNow,
  isPlaying,
  loopEnd,
  loopStart,
  nextLoop,
  pause,
  play,
  playBackwards,
  scrubTo,
  speedNow,
  stepBack,
  stepForward,
  stepOnTitle,
  toEnd,
  toStart,
  togglePlay,
  transportFlags
} from '../src/renderer/src/sim/transportActions'

const { engineSteps, grow } = vi.hoisted(() => {
  const state = { calls: 0, onStep: () => {} }
  return { engineSteps: state, grow: (fn: () => void) => (state.onStep = fn) }
})

vi.mock('../src/renderer/src/sim/stepping', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  stepOneFrame: () => {
    engineSteps.calls++
    engineSteps.onStep()
  }
}))

const LAYOUT = { bodies: ['ball'], ropes: [] }

/** A tape of `n` steps (0 … n − 1) at `rate`, one body. */
/** The type the recorder's `tapes` holds (a Tape with the recorder's keyframe and event types). */
type RunTape = NonNullable<typeof tapes.live>

function makeTape(n: number, rate = 240): RunTape {
  const t = new Tape(LAYOUT, rate, 0, 0)
  for (let s = 0; s < n; s++) t.push(s, new Float32Array(REC_FLOATS))
  return t as unknown as RunTape
}

// A test puts a spy in the store in place of branchHere or fineReplay; the next test gets the real ones back.
const { branchHere: realBranchHere, fineReplay: realFineReplay } = useTape.getState()

const tape = () => useTape.getState()
const scene = () => useScene.getState()

beforeEach(() => {
  engineSteps.calls = 0
  tapes.live = makeTape(600)
  tapes.fine = null
  tapes.parent = null
  grow(() => {
    const t = tapes.live ?? (tapes.live = makeTape(0))
    t.push(t.last + 1, new Float32Array(REC_FLOATS))
  })
  useTape.setState({ mode: 'live', playhead: 599, playing: false, speed: 1, direction: 1, marks: [], bookmarks: [], loop: null, note: null, branchHere: realBranchHere, fineReplay: realFineReplay })
  scene().setPlaying(false)
  useSandbox.setState({ world: { ...useSandbox.getState().world, timeScale: 1 } })
})

describe('Play and Pause go to whatever is playing now', () => {
  it('in live they play and pause the engine and leave the recording alone', () => {
    togglePlay()
    expect(scene().playing).toBe(true)
    expect(tape().playing).toBe(false)
    expect(isPlaying()).toBe(true)
    togglePlay()
    expect(scene().playing).toBe(false)
    expect(isPlaying()).toBe(false)
  })

  it('in replay they play and pause the recording and leave the engine alone', () => {
    scrubTo(100)
    expect(tape().mode).toBe('replay')
    togglePlay()
    expect(tape().playing).toBe(true)
    expect(tape().direction).toBe(1)
    expect(scene().playing).toBe(false)
    expect(isPlaying()).toBe(true)
    togglePlay()
    expect(tape().playing).toBe(false)
    expect(isPlaying()).toBe(false)
  })

  it('L plays forwards even after J, K pauses either way', () => {
    scrubTo(300)
    playBackwards()
    expect(tape().direction).toBe(-1)
    expect(tape().playing).toBe(true)
    pause()
    expect(tape().playing).toBe(false)
    play()
    expect(tape().direction).toBe(1)
    expect(tape().playing).toBe(true)
    pause()
    expect(tape().playing).toBe(false)
  })

  it('BUGREC: Play at the end of a replay carries on the live run (it used to start the recording again from its start)', () => {
    scrubTo(599)
    expect(tape().mode).toBe('replay')
    togglePlay()
    expect(tape().mode).toBe('live')
    expect(scene().playing).toBe(true)
    scene().setPlaying(false)
  })

  it('Play from earlier in a replay plays the recording, and the engine stays paused until the end hands over', () => {
    scrubTo(300)
    togglePlay()
    expect(tape().mode).toBe('replay')
    expect(tape().playing).toBe(true)
    expect(scene().playing).toBe(false)
  })

  it('K pauses the engine in live', () => {
    play()
    expect(scene().playing).toBe(true)
    pause()
    expect(scene().playing).toBe(false)
  })
})

describe('Step back', () => {
  it('from a live run waiting at its end enters replay one step before the end', () => {
    stepBack()
    expect(tape().mode).toBe('replay')
    expect(Math.floor(tape().playhead)).toBe(598)
    expect(engineSteps.calls).toBe(0)
  })

  it('from a live run that is playing pauses the engine and enters replay', () => {
    scene().setPlaying(true)
    stepBack()
    expect(scene().playing).toBe(false)
    expect(tape().mode).toBe('replay')
  })

  it('in replay goes one step at a time, and stops at the start (nothing happens there)', () => {
    scrubTo(2)
    stepBack()
    expect(tape().playhead).toBe(1)
    stepBack()
    expect(tape().playhead).toBe(0)
    stepBack()
    expect(tape().playhead).toBe(0)
    expect(tape().mode).toBe('replay')
  })

  it('does nothing before anything is recorded: it stays live', () => {
    tapes.live = null
    stepBack()
    expect(tape().mode).toBe('live')
    tapes.live = makeTape(1)
    stepBack()
    expect(tape().mode).toBe('live')
  })

  it('stops a replay that is playing', () => {
    scrubTo(50)
    play()
    stepBack()
    expect(tape().playing).toBe(false)
    expect(tape().playhead).toBe(49)
  })
})

describe('Step on', () => {
  it('in live steps the engine once and pauses it', () => {
    scene().setPlaying(true)
    stepForward()
    expect(engineSteps.calls).toBe(1)
    expect(scene().playing).toBe(false)
    expect(tapes.live!.last).toBe(600)
    expect(tape().mode).toBe('live')
  })

  it('before the first step of a run steps the engine', () => {
    tapes.live = null
    stepForward()
    expect(engineSteps.calls).toBe(1)
  })

  it('in replay moves the playhead one step and does not touch the engine', () => {
    scrubTo(10)
    stepForward()
    expect(tape().playhead).toBe(11)
    expect(engineSteps.calls).toBe(0)
  })

  it('in replay at the end stays there: the engine is not stepped, Back to live is the way on', () => {
    scrubTo(599)
    stepForward()
    expect(tape().mode).toBe('replay')
    expect(tape().playhead).toBe(599)
    expect(engineSteps.calls).toBe(0)
  })

  it('stepping back and on again returns to the same step', () => {
    scrubTo(200)
    stepBack()
    stepForward()
    expect(tape().playhead).toBe(200)
  })
})

describe('To start and to end', () => {
  it('the start button enters replay at the first step', () => {
    toStart()
    expect(tape().mode).toBe('replay')
    expect(tape().playhead).toBe(0)
  })

  it('the start button does nothing when already there', () => {
    scrubTo(0)
    tape().pause()
    const before = { ...tape() }
    toStart()
    expect(tape().playhead).toBe(before.playhead)
  })

  it('the end button does nothing in live, and goes to the last step in replay', () => {
    toEnd()
    expect(tape().mode).toBe('live')
    scrubTo(10)
    toEnd()
    expect(tape().playhead).toBe(599)
  })
})

describe('Play backwards', () => {
  it('from the end of a live run enters replay, reversed and playing, with the engine paused', () => {
    scene().setPlaying(true)
    playBackwards()
    expect(tape().mode).toBe('replay')
    expect(tape().direction).toBe(-1)
    expect(tape().playing).toBe(true)
    expect(scene().playing).toBe(false)
  })

  it('does nothing at the start of the recording', () => {
    scrubTo(0)
    playBackwards()
    expect(tape().direction).toBe(1)
    expect(tape().playing).toBe(false)
  })

  it('pressing J twice does not turn it round again', () => {
    scrubTo(300)
    playBackwards()
    playBackwards()
    expect(tape().direction).toBe(-1)
  })
})

describe('Speeds', () => {
  it('are x1, 1/2, 1/4, 1/10 and 1/100, fastest first', () => {
    expect([...SPEEDS]).toEqual([1, 0.5, 0.25, 0.1, 0.01])
  })

  it('cycle round and come back to x1', () => {
    const seen: number[] = []
    for (let k = 0; k < 6; k++) {
      cycleSpeed()
      seen.push(speedNow())
    }
    expect(seen).toEqual([0.5, 0.25, 0.1, 0.01, 1, 0.5])
  })

  it('in live set the Sandbox slow motion; in replay set the recording speed and leave the slow motion', () => {
    chooseSpeed(0.25)
    expect(useSandbox.getState().world.timeScale).toBe(0.25)
    expect(tape().speed).toBe(0.25)
    scrubTo(100)
    chooseSpeed(0.01)
    expect(tape().speed).toBe(0.01)
    expect(useSandbox.getState().world.timeScale).toBe(0.25)
    expect(speedNow()).toBe(0.01)
    backToLive()
    expect(speedNow()).toBe(0.25)
  })

  it('entering replay from slow motion carries the slow motion over', () => {
    useSandbox.setState({ world: { ...useSandbox.getState().world, timeScale: 0.1 } })
    playBackwards()
    expect(tape().speed).toBe(0.1)
  })

  it('a slow motion that is not one of the five leaves the recording speed alone', () => {
    useSandbox.setState({ world: { ...useSandbox.getState().world, timeScale: 0.3 } })
    tape().setSpeed(0.5)
    stepBack()
    expect(tape().speed).toBe(0.5)
  })
})

describe('Scrub, branch, fine replay, back to live', () => {
  it('scrub keeps the playhead on the recording and enters replay with the engine paused', () => {
    scene().setPlaying(true)
    scrubTo(-50)
    expect(tape().mode).toBe('replay')
    expect(tape().playhead).toBe(0)
    expect(scene().playing).toBe(false)
    scrubTo(10_000)
    expect(tape().playhead).toBe(599)
  })

  it('scrub does nothing before anything is recorded', () => {
    tapes.live = null
    scrubTo(5)
    expect(tape().mode).toBe('live')
  })

  it('Branch from here is refused in live with a reason, and goes through in replay and in fine (a moment of the fast re-run branches the run at that time)', () => {
    const branch = vi.spyOn(tape(), 'branchHere')
    expect(flagsNow().branchWhy).toMatch(/moment/)
    branchFromHere()
    expect(branch).not.toHaveBeenCalled()
    const spy = vi.fn()
    useTape.setState({ mode: 'replay', playhead: 100, branchHere: spy })
    expect(flagsNow().branchWhy).toBeNull()
    branchFromHere()
    expect(spy).toHaveBeenCalledOnce()
    expect(scene().playing).toBe(false)
    tapes.fine = makeTape(600, 600)
    useTape.setState({ mode: 'fine', playhead: 300 })
    expect(flagsNow().branchWhy).toBeNull()
    branchFromHere()
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('Fine replay is refused in live, in fine and on a recording already at 1/600 s, and goes through in replay', () => {
    expect(flagsNow().fineWhy).toMatch(/moment/)
    useTape.setState({ mode: 'fine' })
    tapes.fine = makeTape(600, 600)
    expect(flagsNow().fineWhy).toMatch(/already is the fast re-run/)
    tapes.live = makeTape(700, 600)
    useTape.setState({ mode: 'replay', playhead: 100 })
    expect(flagsNow().fineWhy).toMatch(/1\/600/)
    tapes.live = makeTape(600, 240)
    expect(flagsNow().fineWhy).toBeNull()
    const spy = vi.fn()
    useTape.setState({ fineReplay: spy })
    fineReplay()
    expect(spy).toHaveBeenCalledOnce()
  })

  it('Back to live does nothing in live and returns to the end of the recording from replay and fine', () => {
    backToLive()
    expect(tape().mode).toBe('live')
    scrubTo(10)
    backToLive()
    expect(tape().mode).toBe('live')
    expect(tape().playhead).toBe(599)
    useTape.setState({ mode: 'fine' })
    backToLive()
    expect(tape().mode).toBe('live')
  })

  it('shownTape is the fine tape in fine mode and the live tape otherwise', () => {
    const fine = makeTape(50, 600)
    tapes.fine = fine
    expect(shownTape()).toBe(tapes.live)
    useTape.setState({ mode: 'fine' })
    expect(shownTape()).toBe(fine)
  })
})

describe('transportFlags (what each button may do)', () => {
  const base = { mode: 'live' as const, tape: { first: 0, last: 600, rate: 240 }, playhead: 0, scenePlaying: false, tapePlaying: false }

  it('has no run until a step is recorded', () => {
    expect(transportFlags({ ...base, tape: null }).hasRun).toBe(false)
    expect(transportFlags({ ...base, tape: { first: 0, last: 0, rate: 240 } }).hasRun).toBe(false)
    expect(transportFlags(base).hasRun).toBe(true)
  })

  it('live: head at the end, back and start allowed, end not', () => {
    const f = transportFlags(base)
    expect(f.head).toBe(600)
    expect(f.canBack && f.canStart).toBe(true)
    expect(f.canEnd).toBe(false)
  })

  it('replay at the start: no back, no start; end allowed', () => {
    const f = transportFlags({ ...base, mode: 'replay', playhead: 0 })
    expect(f.canBack || f.canStart).toBe(false)
    expect(f.canEnd).toBe(true)
  })

  it('replay at the end: back allowed, end not', () => {
    const f = transportFlags({ ...base, mode: 'replay', playhead: 600 })
    expect(f.canBack).toBe(true)
    expect(f.canEnd).toBe(false)
  })

  it('0j2: a slow replay between the first two steps may still go to the start or back; one a hair before the end may go to the end', () => {
    // ×1/100 from the start: the playhead sits between steps 0 and 1 for 0.4 s, and To the start was greyed out all that time.
    const near = transportFlags({ ...base, mode: 'replay', playhead: 0.4, tapePlaying: true })
    expect(near.head).toBe(0)
    expect(near.canStart && near.canBack).toBe(true)
    const end = transportFlags({ ...base, mode: 'replay', playhead: 600 - 1e-10 })
    expect(end.canEnd).toBe(true)
  })

  it('playing is the engine in live and the recording otherwise', () => {
    expect(transportFlags({ ...base, scenePlaying: true }).playing).toBe(true)
    expect(transportFlags({ ...base, tapePlaying: true }).playing).toBe(false)
    expect(transportFlags({ ...base, mode: 'replay', tapePlaying: true }).playing).toBe(true)
    expect(transportFlags({ ...base, mode: 'replay', scenePlaying: true }).playing).toBe(false)
  })

  it('a playhead between two steps keeps its fraction in `at` and its whole step in `head`', () => {
    const f = transportFlags({ ...base, mode: 'replay', playhead: 188.9 })
    expect(f.at).toBe(188.9)
    expect(f.head).toBe(188)
    expect(transportFlags({ ...base, mode: 'replay', playhead: 9000 }).at).toBe(600)
    expect(transportFlags({ ...base, mode: 'replay', playhead: -3 }).at).toBe(0)
    expect(transportFlags({ ...base, playhead: 77.5 }).at).toBe(600)
    expect(transportFlags({ ...base, tape: null }).at).toBeNull()
  })

  it('a playhead outside the recording is held on it', () => {
    expect(transportFlags({ ...base, mode: 'replay', playhead: 9000 }).head).toBe(600)
    expect(transportFlags({ ...base, mode: 'replay', playhead: -5 }).head).toBe(0)
  })
})

describe('the Step button title', () => {
  it('names the step and its key', () => {
    expect(stepOnTitle('240')).toBe('Step one engine step (1/240 s) (full stop key)')
  })
})

describe('bookmarks and the loop', () => {
  it('M leaves a bookmark at the moment on screen: the end of the run in live, the playhead in replay; the same moment once', () => {
    bookmarkHere()
    expect(tape().bookmarks.map((b) => b.step)).toEqual([599])
    bookmarkHere()
    expect(tape().bookmarks).toHaveLength(1)
    scrubTo(100)
    bookmarkHere()
    expect(tape().bookmarks.map((b) => b.step)).toEqual([100, 599])
  })

  it('M does nothing before a step is recorded', () => {
    tapes.live = null
    bookmarkHere()
    expect(tape().bookmarks).toEqual([])
  })

  it('[ and ] set the two ends of a loop at the playhead', () => {
    scrubTo(100)
    loopStart()
    expect(tape().loop).toEqual({ a: 100, b: 599 })
    scrubTo(300)
    loopEnd()
    expect(tape().loop).toEqual({ a: 100, b: 300 })
    scrubTo(50)
    loopStart()
    expect(tape().loop).toEqual({ a: 50, b: 300 })
  })

  it('a loop start after the old end, or an end before the old start, moves the other end to the recording’s end', () => {
    scrubTo(100)
    loopStart()
    scrubTo(200)
    loopEnd()
    scrubTo(400)
    loopStart()
    expect(tape().loop).toEqual({ a: 400, b: 599 })
    scrubTo(50)
    loopEnd()
    expect(tape().loop).toEqual({ a: 0, b: 50 })
  })

  it('never makes a loop of one step: [ at the last step and ] at the first do nothing', () => {
    loopStart()
    expect(tape().loop).toBeNull()
    scrubTo(0)
    loopEnd()
    expect(tape().loop).toBeNull()
  })

  it('] in live loops the whole run so far', () => {
    loopEnd()
    expect(tape().loop).toEqual({ a: 0, b: 599 })
  })

  it('does nothing before a step is recorded; Clear loop clears', () => {
    tapes.live = null
    loopStart()
    loopEnd()
    expect(tape().loop).toBeNull()
    tapes.live = makeTape(600)
    scrubTo(100)
    loopStart()
    expect(tape().loop).not.toBeNull()
    clearLoop()
    expect(tape().loop).toBeNull()
  })

  it('[ and ] do nothing in Fine replay: a loop there would be fast-re-run steps, and would come back as unrelated live steps after Back to live', () => {
    scrubTo(100)
    tapes.fine = makeTape(600, 600)
    useTape.setState({ mode: 'fine', playhead: 300 })
    loopStart()
    loopEnd()
    expect(tape().loop).toBeNull()
    backToLive()
    expect(tape().mode).toBe('live')
    expect(tape().loop).toBeNull()
  })

  it('nextLoop: the ends it would give', () => {
    expect(nextLoop('a', 10, null, 0, 100)).toEqual({ a: 10, b: 100 })
    expect(nextLoop('a', 10, { a: 5, b: 50 }, 0, 100)).toEqual({ a: 10, b: 50 })
    expect(nextLoop('a', 60, { a: 5, b: 50 }, 0, 100)).toEqual({ a: 60, b: 100 })
    expect(nextLoop('a', 100, null, 0, 100)).toBeNull()
    expect(nextLoop('b', 90, null, 0, 100)).toEqual({ a: 0, b: 90 })
    expect(nextLoop('b', 90, { a: 20, b: 50 }, 0, 100)).toEqual({ a: 20, b: 90 })
    expect(nextLoop('b', 10, { a: 20, b: 50 }, 0, 100)).toEqual({ a: 0, b: 10 })
    expect(nextLoop('b', 0, null, 0, 100)).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The same actions on a run the real recorder made (SB12), from the real engine in Node: Bouncing ball at 240 steps a second.

describe('with the real recorder and engine (Bouncing ball, 5 s)', () => {
  let w: SimWorld
  let stop: (() => void) | null = null
  const RATE = 240
  const BOUNCES = [0.782, 2.033, 3.034, 3.835]

  beforeAll(async () => {
    // The WASM engine loads once; the first world after it is a warm-up.
    ;(await SimWorld.create()).destroy()
  }, 30_000)

  beforeEach(async () => {
    clearTapes()
    const built = presetById('bounce')!.build()
    w = await SimWorld.create({ ...DEFAULT_WORLD, ...(built.world ?? {}) })
    w.rebuild(built.bodies, built.links ?? [])
    stop = startRecorder(w)
    // The strip's step button steps this engine, and the recorder puts the step on the tape.
    engineSteps.onStep = () => w.stepOnce()
    for (let k = 0; k < 5 * RATE; k++) w.stepOnce()
  })

  afterEach(() => {
    stop?.()
    stop = null
    w.destroy()
    clearTapes()
  })

  it('the first four marks sit within one step of 0.782, 2.033, 3.034 and 3.835 s (the ball bounces twice more before 5 s), and the strip puts a mark there', () => {
    const marks = tape().marks
    expect(marks.length).toBeGreaterThanOrEqual(4)
    BOUNCES.forEach((b, k) => expect(Math.abs(marks[k] - b * RATE)).toBeLessThanOrEqual(1))
    const t = tapes.live!
    const model = stripModel({ tape: t, mode: 'live', playhead: t.last, marks, bookmarks: [], loop: null, branchStep: null, width: 600 })
    expect(model.marks.map((k) => k.step)).toEqual(marks)
  })

  it('stopping on the first mark (a click on it) reads a time within 1/240 s of 0.782 s', () => {
    const t = tapes.live!
    const model = stripModel({ tape: t, mode: 'live', playhead: t.last, marks: tape().marks, bookmarks: [], loop: null, branchStep: null, width: 600 })
    scrubTo(seekStep(model, model.marks[0].x + 2, true))
    expect(tape().mode).toBe('replay')
    expect(tape().playhead).toBe(tape().marks[0])
    expect(Math.abs(t.timeOf(tape().playhead) - 0.782)).toBeLessThanOrEqual(1 / RATE)
    const shown = stripModel({ tape: t, mode: 'replay', playhead: tape().playhead, marks: tape().marks, bookmarks: [], loop: null, branchStep: null, width: 600 })
    expect(shown.text).toMatch(/^t = 0\.78\d? s · step 18[78]$/)
  })

  it('Page Down on the bar goes from mark to mark, the four bounces in order', () => {
    const t = tapes.live!
    scrubTo(0)
    const seen: number[] = []
    for (let k = 0; k < 4; k++) {
      const model = stripModel({ tape: t, mode: 'replay', playhead: tape().playhead, marks: tape().marks, bookmarks: [], loop: null, branchStep: null, width: 600 })
      scrubTo(barKeyTarget('PageDown', false, model)!)
      seen.push(t.timeOf(tape().playhead))
    }
    seen.forEach((s, k) => expect(Math.abs(s - BOUNCES[k])).toBeLessThanOrEqual(1 / RATE))
  })

  it('scrub clamps to the recording; step back from the live end enters replay one step before it; at the start nothing happens', () => {
    const t = tapes.live!
    scrubTo(-100)
    expect(tape().playhead).toBe(t.first)
    scrubTo(99999)
    expect(tape().playhead).toBe(t.last)
    backToLive()
    stepBack()
    expect(tape().mode).toBe('replay')
    expect(tape().playhead).toBe(t.last - 1)
    toStart()
    expect(tape().playhead).toBe(t.first)
    const before = { ...tape() }
    stepBack()
    expect(tape().playhead).toBe(before.playhead)
    expect(tape().mode).toBe('replay')
  })

  it('Back to live returns to the end, and the engine goes on from there as if it had never been replayed', () => {
    const t = tapes.live!
    const last = t.last
    scrubTo(300)
    expect(tape().mode).toBe('replay')
    backToLive()
    expect(tape().mode).toBe('live')
    expect(tape().playhead).toBe(last)
    stepForward()
    expect(tapes.live!.last).toBe(last + 1)
    expect(w.stepIndex).toBe(last + 1)
  })

  it('Branch from here (the moment before the second bounce) sets live, truncates the tape there and keeps the old run as the parent', () => {
    const oldTape = tapes.live!
    const oldLast = oldTape.last
    scrubTo(2 * RATE)
    expect(flagsNow().branchWhy).toBeNull()
    branchFromHere()
    expect(tape().mode).toBe('live')
    expect(scene().playing).toBe(false)
    expect(tapes.live!.last).toBe(2 * RATE)
    expect(tapes.parent?.step).toBe(2 * RATE)
    expect(tapes.parent!.tape.last).toBe(oldLast)
    // the run goes on from the branch
    stepForward()
    expect(tapes.live!.last).toBe(2 * RATE + 1)
  })

  it('Fine replay of the first bounce shows the contact within 1/600 s of 0.7821 s, and Back to live leaves it', () => {
    const first = tape().marks[0]
    scrubTo(first - 60)
    expect(flagsNow().fineWhy).toBeNull()
    fineReplay()
    expect(tape().mode).toBe('fine')
    const fine = shownTape()!
    expect(fine.rate).toBe(600)
    const hit = tape().marks[0]
    expect(Math.abs(fine.timeOf(hit) - 0.7821)).toBeLessThanOrEqual(1 / 600)
    // the strip shows the fast re-run whole, on its own axis
    const model = stripModel({ tape: fine, mode: 'fine', playhead: tape().playhead, marks: tape().marks, bookmarks: [], loop: null, branchStep: null, width: 600 })
    expect(model.view.first).toBe(fine.first)
    expect(model.view.last).toBe(fine.last)
    expect(model.marks.map((k) => k.step)).toContain(hit)
    backToLive()
    expect(tape().mode).toBe('live')
    expect(shownTape()).toBe(tapes.live)
  })

  it('Branch from here is also taken from a moment of the fast re-run (it branches the live run at that time)', () => {
    scrubTo(tape().marks[0] - 60)
    fineReplay()
    expect(tape().mode).toBe('fine')
    expect(flagsNow().branchWhy).toBeNull()
    branchFromHere()
    expect(tape().mode).toBe('live')
    expect(tapes.parent).not.toBeNull()
  })

  it('J, K and L on the real tape: backwards from the end, pause, forwards', () => {
    playBackwards()
    expect(tape().mode).toBe('replay')
    expect(tape().direction).toBe(-1)
    expect(tape().playing).toBe(true)
    pause()
    expect(tape().playing).toBe(false)
    // L from a moment before the end plays the recording forwards (from the end itself it would carry on the live run, BUGREC).
    scrubTo(300)
    play()
    expect(tape().direction).toBe(1)
    expect(tape().playing).toBe(true)
  })

  it('bookmarks and the loop on the real tape: M at a moment, [ and ] round it', () => {
    scrubTo(300)
    bookmarkHere()
    expect(tape().bookmarks.map((b) => b.step)).toEqual([300])
    loopStart()
    scrubTo(500)
    loopEnd()
    expect(tape().loop).toEqual({ a: 300, b: 500 })
  })

  it('the strip draws the whole run: five seconds, a keyframe a second, its marks, the playhead at the end', () => {
    const t = tapes.live!
    const model = stripModel({ tape: t, mode: 'live', playhead: t.last, marks: tape().marks, bookmarks: [], loop: null, branchStep: null, width: 600 })
    expect(model.view.last).toBe(t.last)
    expect(model.keys.map((k) => k.step)).toEqual([0, 240, 480, 720, 960, 1200])
    expect(model.marks.map((k) => k.step)).toEqual(tape().marks)
    expect(model.headX).toBeCloseTo(600, 9)
    expect(model.text).toBe('t = 5 s · step 1200')
  })
})

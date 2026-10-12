// SB12: the tape store (I-5) — what the strip, the views, the graphs and the ledger read, driven by
// the real engine and the real recorder in Node. Live is the engine at the tape's end; stepping
// back, scrubbing, going to the start or reversing enters replay and pauses the engine; play() then
// plays the tape; Back to live returns to the end; Branch from here and Fine replay change what is
// shown; Reset and a new scene start again.

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { SimWorld } from '../src/renderer/src/sim/world'
import { presetById } from '../src/renderer/src/sim/presets'
import { DEFAULT_WORLD, type BodyDef } from '../src/renderer/src/sim/types'
import { marksOf, replayRefusal, startRecorder, tapes, type RunTape } from '../src/renderer/src/sim/recorder'
import { shownTape, useTape, type ReplaySpeed, type TapeMode, type TapeState } from '../src/renderer/src/sim/tapeStore'
import { useSandbox } from '../src/renderer/src/sim/store'
import { useScene } from '../src/renderer/src/core/store'

async function bounce(over: Partial<typeof DEFAULT_WORLD> = {}): Promise<{ w: SimWorld; bodies: BodyDef[] }> {
  const built = presetById('bounce')!.build()
  const w = await SimWorld.create({ ...DEFAULT_WORLD, ...(built.world ?? {}), ...over })
  w.rebuild(built.bodies, built.links ?? [])
  return { w, bodies: built.bodies }
}

function steps(w: SimWorld, count: number): void {
  for (let i = 0; i < count; i++) w.stepOnce()
}

const tape = (): RunTape => tapes.live!
const st = (): TapeState => useTape.getState()

let stop: (() => void) | null = null
function record(w: SimWorld, opts: { capBytes?: number } = {}): void {
  stop = startRecorder(w, opts)
}

beforeAll(async () => {
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

describe('live: the engine at the end of the tape', () => {
  it('the playhead follows the end as the run records; the revision rises; the marks are the live tape’s', async () => {
    const { w } = await bounce()
    record(w)
    const r0 = st().revision
    steps(w, 240)
    expect(st().mode).toBe<TapeMode>('live')
    expect(st().playhead).toBe(240)
    expect(st().revision).toBeGreaterThanOrEqual(r0 + 240)
    expect(st().marks).toEqual(marksOf(tape()))
    expect(st().marks.length).toBe(1)
    expect(shownTape()).toBe(tapes.live)
    expect(replayRefusal()).toBeNull()
    w.destroy()
  })

  it('play() and pause() in live start and stop the engine; stepping forward in live is the engine’s business', async () => {
    const { w } = await bounce()
    record(w)
    steps(w, 10)
    st().play()
    expect(useScene.getState().playing).toBe(true)
    expect(st().playing).toBe(false)
    st().pause()
    expect(useScene.getState().playing).toBe(false)
    st().stepBy(1)
    expect(st().mode).toBe('live')
    expect(st().playhead).toBe(10)
    st().toEnd()
    expect(st().mode).toBe('live')
    w.destroy()
  })
})

describe('replay', () => {
  it('a step back from live enters replay one step before the end and pauses the engine; the engine does not move', async () => {
    const { w } = await bounce()
    record(w)
    steps(w, 120)
    useScene.getState().setPlaying(true)
    st().stepBy(-1)
    expect(st().mode).toBe('replay')
    expect(st().playhead).toBe(119)
    expect(useScene.getState().playing).toBe(false)
    expect(w.stepIndex).toBe(120)
    expect(replayRefusal()).toBe('Replaying t = 0.496 s. Branch from here to change something, or Back to live.')
    st().stepBy(-1000)
    expect(st().playhead).toBe(0)
    st().stepBy(1000)
    expect(st().playhead).toBe(120)
    // Reaching the end in replay stays in replay: going on needs Back to live.
    expect(st().mode).toBe('replay')
    w.destroy()
  })

  it('whole steps from a fractional playhead; scrub clamps to the tape; start and end', async () => {
    const { w } = await bounce()
    record(w)
    steps(w, 240)
    st().scrubTo(100.4)
    expect(st().mode).toBe('replay')
    expect(st().playhead).toBe(100.4)
    st().stepBy(1)
    expect(st().playhead).toBe(101)
    st().scrubTo(100.4)
    st().stepBy(-1)
    expect(st().playhead).toBe(100)
    st().scrubTo(-5)
    expect(st().playhead).toBe(0)
    st().scrubTo(1e9)
    expect(st().playhead).toBe(240)
    st().scrubTo(Number.NaN)
    expect(st().playhead).toBe(240)
    st().toStart()
    expect(st().playhead).toBe(0)
    st().toEnd()
    expect(st().playhead).toBe(240)
    expect(st().mode).toBe('replay')
    w.destroy()
  })

  it('play() plays the tape, not the engine; it starts again from the far end; playing into an end stops there', async () => {
    const { w } = await bounce()
    record(w)
    steps(w, 240)
    st().toStart()
    st().play()
    expect(st().playing).toBe(true)
    expect(useScene.getState().playing).toBe(false)
    // The view's frame loop moves the playhead (SB16); into the end, the tape stops.
    st().scrubTo(200)
    expect(st().playing).toBe(true)
    st().scrubTo(240)
    expect(st().playing).toBe(false)
    expect(st().playhead).toBe(240)
    // Play at the end starts from the beginning again.
    st().play()
    expect(st().playhead).toBe(0)
    expect(st().playing).toBe(true)
    st().pause()
    expect(st().playing).toBe(false)
    w.destroy()
  })

  it('reverse flips the direction (from live it enters replay at the end); backwards, the start is the end it stops at', async () => {
    const { w } = await bounce()
    record(w)
    steps(w, 240)
    st().reverse()
    expect(st().mode).toBe('replay')
    expect(st().direction).toBe(-1)
    expect(st().playhead).toBe(240)
    st().play()
    expect(st().playing).toBe(true)
    st().scrubTo(0)
    expect(st().playing).toBe(false)
    // At the start, backwards play starts again from the end.
    st().play()
    expect(st().playhead).toBe(240)
    st().reverse()
    expect(st().direction).toBe(1)
    w.destroy()
  })

  it('speeds', async () => {
    for (const s of [1, 0.5, 0.25, 0.1, 0.01] as ReplaySpeed[]) {
      st().setSpeed(s)
      expect(st().speed).toBe(s)
    }
  })

  it('Back to live returns to the end, forward, paused, and the run goes on from there', async () => {
    const { w } = await bounce()
    record(w)
    steps(w, 240)
    st().reverse()
    st().scrubTo(30)
    st().backToLive()
    expect(st()).toMatchObject({ mode: 'live', playhead: 240, direction: 1, playing: false })
    steps(w, 5)
    expect(st().playhead).toBe(245)
    expect(replayRefusal()).toBeNull()
    w.destroy()
  })

  it('bookmarks (labelled with the time unless named) and the loop A–B are plain data on the tape’s steps', async () => {
    const { w } = await bounce()
    record(w)
    steps(w, 240)
    st().scrubTo(100)
    st().addBookmark()
    st().addBookmark('again')
    st().scrubTo(50)
    st().addBookmark(' drop ')
    expect(st().bookmarks).toEqual([
      { step: 50, label: 'drop' },
      { step: 100, label: 't = 0.417 s' }
    ])
    st().setLoop(120, 60)
    expect(st().loop).toEqual({ a: 60, b: 120 })
    st().setLoop(30)
    expect(st().loop).toEqual({ a: 30, b: 120 })
    st().setLoop(null)
    expect(st().loop).toBeNull()
    st().setLoop(200)
    expect(st().loop).toEqual({ a: 200, b: 240 })
    w.destroy()
  })
})

describe('Branch from here and Fine replay, through the store', () => {
  it('Branch from here on the first mark: live again at that step, the note, edits allowed; the old run is the parent', async () => {
    const { w } = await bounce()
    record(w)
    steps(w, 480)
    st().scrubTo(400)
    st().addBookmark()
    st().setLoop(300, 400)
    const mark = st().marks[0]
    st().scrubTo(mark)
    st().addBookmark()
    st().branchHere()
    expect(st()).toMatchObject({ mode: 'live', playhead: mark, playing: false, direction: 1 })
    expect(st().note).toBe('Branched at t = 0.783 s. The old run is shown as a ghost.')
    expect(replayRefusal()).toBeNull()
    expect(tape().last).toBe(mark)
    expect(tapes.parent!.step).toBe(mark)
    // A bookmark and a loop on the old run past the branch went with it.
    expect(st().bookmarks.map((b) => b.step)).toEqual([mark])
    expect(st().loop).toBeNull()
    expect(st().marks).toEqual([mark])
    steps(w, 10)
    expect(st().playhead).toBe(mark + 10)
    w.destroy()
  })

  it('a refused branch says why and changes nothing', async () => {
    const { w } = await bounce()
    record(w)
    steps(w, 10)
    st().scrubTo(5)
    tapes.live!.truncateAfter(-1, (k) => w.freeKeyframe(k))
    st().branchHere()
    expect(st().note).toBe('There is no recording to branch from yet.')
    expect(st().mode).toBe('replay')
    w.destroy()
  })

  it('Fine replay shows the fine tape from the chosen moment, with its own marks; replay is read-only there too; Back to live drops it', async () => {
    const { w } = await bounce()
    record(w)
    steps(w, 480)
    st().scrubTo(120)
    st().fineReplay()
    expect(st().mode).toBe('fine')
    const fine = tapes.fine!
    expect(shownTape()).toBe(fine)
    expect(fine.timeOf(st().playhead)).toBe(0.5)
    expect(st().marks).toEqual(marksOf(fine))
    expect(st().marks.length).toBe(1)
    expect(st().note).toBe('A re-run at 1/600 s. Its difference from the 1/240 s run is the step error.')
    expect(replayRefusal()).toBe('Replaying t = 0.5 s. Branch from here to change something, or Back to live.')
    // Steps on the fine tape are 1/600 s.
    st().stepBy(1)
    expect(fine.timeOf(st().playhead)).toBeCloseTo(0.5 + 1 / 600, 12)
    // The engine was put back at the end of the run, and is not moved by any of this.
    expect(w.stepIndex).toBe(480)
    st().backToLive()
    expect(st().mode).toBe('live')
    expect(tapes.fine).toBeNull()
    expect(shownTape()).toBe(tapes.live)
    expect(st().marks).toEqual(marksOf(tape()))
    w.destroy()
  })

  it('from Fine replay, Branch from here goes back to the live step at that time; a bookmark lands on the live tape', async () => {
    const { w } = await bounce()
    record(w)
    steps(w, 480)
    st().scrubTo(120)
    st().fineReplay()
    const fine = tapes.fine!
    // 0.75 s on the fine tape: live step 180 exactly.
    st().scrubTo(fine.first + 150)
    expect(fine.timeOf(st().playhead)).toBe(0.75)
    st().addBookmark()
    expect(st().bookmarks).toEqual([{ step: 180, label: 't = 0.75 s' }])
    st().scrubTo(fine.first + 151)
    st().branchHere()
    expect(st().mode).toBe('live')
    expect(st().playhead).toBe(180)
    expect(tape().last).toBe(180)
    w.destroy()
  })

  it('from a fine replay that had to start after the chosen moment (a change on an odd tick), Branch acts on the moment shown', async () => {
    const built = presetById('bounce')!.build()
    const w = await SimWorld.create({ ...DEFAULT_WORLD, ...(built.world ?? {}) })
    const ball = built.bodies.find((b) => b.name === 'Ball')!
    const resting = { ...ball, position: [0, ball.size[0], 0] as [number, number, number] }
    w.rebuild(built.bodies.map((b) => (b === ball ? resting : b)), [])
    record(w)
    for (let i = 0; i < 480; i++) {
      if (w.stepIndex === 100) w.setVelocity(ball.id, [1, 0, 0])
      w.stepOnce()
    }
    st().scrubTo(101)
    st().fineReplay()
    expect(st().mode).toBe('fine')
    // Shown: 0.425 s (510 ticks), the first 1/600 s step after the change at 101/240 s (505 ticks).
    expect(tapes.fine!.timeOf(st().playhead)).toBe(0.425)
    expect(replayRefusal()).toBe('Replaying t = 0.425 s. Branch from here to change something, or Back to live.')
    st().branchHere()
    expect(st().mode).toBe('live')
    expect(st().playhead).toBe(102)
    expect(tape().timeOf(102)).toBe(0.425)
    w.destroy()
  })

  it('a refused Fine replay says why and leaves the mode alone', async () => {
    const { w } = await bounce({ stepRate: 600 })
    record(w)
    steps(w, 60)
    st().stepBy(-1)
    st().fineReplay()
    expect(st().mode).toBe('replay')
    expect(st().note).toBe('This run already takes 600 steps a second: every one of them is on the recording.')
    w.destroy()
  })
})

describe('the cap’s note, a new tape, Reset', () => {
  it('the cap’s note is shown, and comes back with Back to live after a branch or fine replay note', async () => {
    const { w } = await bounce()
    record(w, { capBytes: 70_000 })
    steps(w, 3 * 240)
    expect(st().note).toBe('The recording keeps the last 1 s; older parts were dropped.')
    st().scrubTo(600)
    st().fineReplay()
    expect(st().note).toMatch(/^A re-run at 1\/600 s/)
    st().backToLive()
    expect(st().note).toBe('The recording keeps the last 1 s; older parts were dropped.')
    w.destroy()
  })

  it('a new tape (a new rate part-way) starts the store again: live at its end, no bookmarks, no loop', async () => {
    const { w } = await bounce()
    record(w)
    steps(w, 240)
    st().scrubTo(100)
    st().addBookmark()
    st().setLoop(10, 20)
    st().backToLive()
    w.setWorldSettings({ stepRate: 600 })
    steps(w, 3)
    expect(st()).toMatchObject({ mode: 'live', playhead: 243, bookmarks: [], loop: null, note: null })
    expect(tape().rate).toBe(600)
    w.destroy()
  })

  it('Reset and a new scene forget the tape at once and start the store again (the speed stays the student’s)', async () => {
    const { w } = await bounce()
    record(w)
    steps(w, 240)
    st().setSpeed(0.25)
    st().scrubTo(100)
    st().addBookmark()
    useSandbox.getState().resetRun()
    expect(tapes.live).toBeNull()
    expect(shownTape()).toBeNull()
    expect(st()).toMatchObject({ mode: 'live', playhead: 0, bookmarks: [], loop: null, note: null, marks: [], speed: 0.25 })
    // Nothing to replay: every move is ignored until the next run records.
    st().stepBy(-1)
    st().toStart()
    st().scrubTo(3)
    st().reverse()
    expect(st().mode).toBe('live')
    // The view rebuilds the world for the new run; its first step starts the new tape at t = 0.
    w.rebuild(presetById('bounce')!.build().bodies, [])
    steps(w, 1)
    expect(tape().first).toBe(0)
    expect(st().playhead).toBe(1)
    useSandbox.getState().loadPreset('bounce')
    expect(tapes.live).toBeNull()
    w.destroy()
  })
})

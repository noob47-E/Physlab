// SB17, the owner's D5: replay is read-only. While a recording is shown (replay or fine replay) Ctrl+Z / Ctrl+Y / Edit > Undo
// in the Sandbox are refused with the recorder's own sentence (replayRefusal), the Sandbox panel's edit controls are locked, and
// the controls that only change what is shown (choosing an object, the camera, a fold's arrow) stay live. Branch from here or
// Back to live gives editing back. Components are rendered with react-dom/server (the suite has no DOM).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { REC_FLOATS, Tape } from '../src/renderer/src/sim/tape'
import { shownTape, useTape } from '../src/renderer/src/sim/tapeStore'
import { replayRefusal, tapes } from '../src/renderer/src/sim/recorder'
import { useSandbox } from '../src/renderer/src/sim/store'
import { useLab } from '../src/renderer/src/lab/labStore'
import { REFUSAL_MS, backToLive, refuseEdit, scrubTo, useEditRefusal } from '../src/renderer/src/sim/transportActions'
import { runHistory } from '../src/renderer/src/app/undoRoute'
import { ReplayBanner, ReplayLock } from '../src/renderer/src/panels/sandbox/ReplayLock'
import { Fold } from '../src/renderer/src/panels/sandbox/common'
import { BodyList } from '../src/renderer/src/panels/sandbox/BodyList'
import { WorldSection } from '../src/renderer/src/panels/sandbox/WorldSection'
import { Selected } from '../src/renderer/src/panels/sandbox/Selected'
import { Sandbox } from '../src/renderer/src/panels/Sandbox'
import { TapeStrip } from '../src/renderer/src/render/sandbox/TapeStrip'

// A server render reads every zustand store's initial state; the test drives the stores and renders again, so the hooks read the current one.
vi.mock('zustand', async (importOriginal) => {
  const z = await importOriginal<typeof import('zustand')>()
  const bind = (init: never) => {
    const api = z.createStore(init)
    const hook = (select: (s: unknown) => unknown = (s) => s) => select(api.getState())
    return Object.assign(hook, api)
  }
  return { ...z, create: (init?: never) => (init ? bind(init) : bind) }
})
vi.mock('../src/renderer/src/sim/jolt', async (importOriginal) => ({ ...(await importOriginal<object>()), useJoltState: () => 'ready' }))

type RunTape = NonNullable<typeof tapes.live>
function makeTape(n: number, rate = 240): RunTape {
  const t = new Tape({ bodies: ['ball'], ropes: [] }, rate, 0, 0)
  for (let s = 0; s < n; s++) t.push(s, new Float32Array(REC_FLOATS))
  return t as unknown as RunTape
}

const { branchHere: realBranchHere, fineReplay: realFineReplay } = useTape.getState()
const { undo: realUndo, redo: realRedo } = useSandbox.getState()
const { undo: realLabUndo, redo: realLabRedo } = useLab.getState()
const undoSpy = vi.fn()
const redoSpy = vi.fn()
const labUndoSpy = vi.fn()
const labRedoSpy = vi.fn()

/** A live tape of 600 steps and a clean store. Loading an experiment starts a new run, which clears the tapes, so it is called again after. */
function freshRun() {
  tapes.live = makeTape(600)
  tapes.fine = null
  tapes.parent = null
  useTape.setState({ mode: 'live', playhead: 599, playing: false, speed: 1, direction: 1, marks: [], bookmarks: [], loop: null, note: null, branchHere: realBranchHere, fineReplay: realFineReplay })
  useEditRefusal.setState({ sentence: null })
}

beforeEach(() => {
  vi.useFakeTimers()
  undoSpy.mockClear()
  redoSpy.mockClear()
  labUndoSpy.mockClear()
  labRedoSpy.mockClear()
  freshRun()
  useSandbox.setState({ undo: undoSpy, redo: redoSpy })
  useLab.setState({ undo: labUndoSpy, redo: labRedoSpy })
})

afterEach(() => {
  vi.useRealTimers()
  useSandbox.setState({ undo: realUndo, redo: realRedo })
  useLab.setState({ undo: realLabUndo, redo: realLabRedo })
})

const SENTENCE = /^Replaying t = [\d.]+ s\. Branch from here to change something, or Back to live\.$/

describe('Ctrl+Z, Ctrl+Y and Edit > Undo while a recording is shown', () => {
  it('live: the Sandbox undoes and redoes as before, and nothing is refused', () => {
    expect(runHistory('sandbox', { key: 'z', shift: false })).toBe(true)
    expect(undoSpy).toHaveBeenCalledTimes(1)
    expect(runHistory('sandbox', { key: 'y', shift: false })).toBe(true)
    expect(redoSpy).toHaveBeenCalledTimes(1)
    expect(runHistory('sandbox', { menu: 'undo' })).toBe(true)
    expect(undoSpy).toHaveBeenCalledTimes(2)
    expect(useEditRefusal.getState().sentence).toBeNull()
    expect(refuseEdit()).toBe(false)
  })

  it('replay: every way to undo or redo is refused with replayRefusal()\'s sentence, and the key is still taken', () => {
    scrubTo(188)
    expect(tapes.live).not.toBeNull()
    expect(useTape.getState().mode).toBe('replay')
    const why = replayRefusal()
    expect(why).toMatch(SENTENCE)
    for (const input of [{ key: 'z', shift: false }, { key: 'z', shift: true }, { key: 'y', shift: false }, { menu: 'undo' as const }, { menu: 'redo' as const }]) {
      useEditRefusal.setState({ sentence: null })
      expect(runHistory('sandbox', input)).toBe(true)
      expect(useEditRefusal.getState().sentence).toBe(why)
    }
    expect(undoSpy).not.toHaveBeenCalled()
    expect(redoSpy).not.toHaveBeenCalled()
  })

  it("the sentence is the recorder's, with the playhead's own time (step 188 of 240 a second = 0.783 s)", () => {
    scrubTo(188)
    expect(shownTape()).toBe(tapes.live)
    expect(refuseEdit()).toBe(true)
    expect(useEditRefusal.getState().sentence).toBe(replayRefusal())
    expect(useEditRefusal.getState().sentence).toContain('t = 0.783 s')
  })

  it('fine replay is refused too', () => {
    scrubTo(188)
    tapes.fine = makeTape(600, 600)
    useTape.setState({ mode: 'fine', playhead: 300 })
    expect(runHistory('sandbox', { key: 'z', shift: false })).toBe(true)
    expect(undoSpy).not.toHaveBeenCalled()
    expect(useEditRefusal.getState().sentence).toMatch(SENTENCE)
  })

  it('the Lab and the drawing keep their own undo while the Sandbox replays', () => {
    scrubTo(188)
    expect(runHistory('lab', { key: 'z', shift: false })).toBe(true)
    expect(labUndoSpy).toHaveBeenCalledTimes(1)
    expect(runHistory('lab', { key: 'y', shift: false })).toBe(true)
    expect(labRedoSpy).toHaveBeenCalledTimes(1)
    expect(useEditRefusal.getState().sentence).toBeNull()
    expect(runHistory('sandbox', { key: 'q', shift: false })).toBe(false)
  })

  it('Back to live gives undo back and takes the sentence off the strip', () => {
    scrubTo(188)
    runHistory('sandbox', { key: 'z', shift: false })
    expect(useEditRefusal.getState().sentence).not.toBeNull()
    backToLive()
    expect(useTape.getState().mode).toBe('live')
    expect(useEditRefusal.getState().sentence).toBeNull()
    expect(runHistory('sandbox', { key: 'z', shift: false })).toBe(true)
    expect(undoSpy).toHaveBeenCalledTimes(1)
  })

  it('the sentence leaves the strip by itself after a few seconds', () => {
    scrubTo(188)
    refuseEdit()
    expect(useEditRefusal.getState().sentence).not.toBeNull()
    vi.advanceTimersByTime(REFUSAL_MS - 1)
    expect(useEditRefusal.getState().sentence).not.toBeNull()
    vi.advanceTimersByTime(2)
    expect(useEditRefusal.getState().sentence).toBeNull()
  })

  it('the strip shows the refusal in its note line instead of the tape\'s note, then the note again', () => {
    useTape.setState({ note: 'A re-run at 1/600 s.' })
    scrubTo(188)
    useTape.setState({ note: 'A re-run at 1/600 s.' })
    expect(renderToStaticMarkup(createElement(TapeStrip))).toContain('A re-run at 1/600 s.')
    refuseEdit()
    const html = renderToStaticMarkup(createElement(TapeStrip))
    expect(html).toContain('Branch from here to change something, or Back to live.')
    expect(html).not.toContain('A re-run at 1/600 s.')
    vi.advanceTimersByTime(REFUSAL_MS + 1)
    expect(renderToStaticMarkup(createElement(TapeStrip))).toContain('A re-run at 1/600 s.')
  })
})

/** Whether `needle`'s first appearance in the markup sits inside a disabled <fieldset>. */
function insideDisabledFieldset(html: string, needle: string): boolean {
  const at = html.indexOf(needle)
  if (at < 0) throw new Error(`"${needle}" is not in the markup`)
  const stack: boolean[] = []
  for (const m of html.matchAll(/<(\/?)fieldset\b([^>]*)>/g)) {
    if (m.index! > at) break
    if (m[1]) stack.pop()
    else stack.push(/\bdisabled\b/.test(m[2]))
  }
  return stack.some(Boolean)
}

const replaying = () => {
  scrubTo(188)
  expect(useTape.getState().mode).toBe('replay')
}

describe('the panel\'s edit controls are locked in replay', () => {
  it('ReplayLock is a plain block live and a disabled fieldset in replay', () => {
    const box = () => renderToStaticMarkup(createElement(ReplayLock, null, createElement('button', null, 'Go')))
    expect(box()).toContain('<fieldset')
    expect(box()).not.toMatch(/<fieldset[^>]* disabled=""/)
    replaying()
    expect(box()).toMatch(/<fieldset[^>]* disabled=""/)
    backToLive()
    expect(box()).not.toMatch(/<fieldset[^>]* disabled=""/)
  })

  it('ReplayBanner says nothing live and replayRefusal()\'s sentence in replay', () => {
    expect(renderToStaticMarkup(createElement(ReplayBanner))).toBe('')
    replaying()
    const html = renderToStaticMarkup(createElement(ReplayBanner))
    expect(html).toContain(replayRefusal()!)
    expect(html).toContain('role="status"')
  })

  it('a fold\'s arrow stays live and what is inside the fold is locked', () => {
    replaying()
    const html = renderToStaticMarkup(createElement(Fold, { id: 'world-more', open: true, children: createElement('input', { type: 'checkbox' }) }))
    expect(insideDisabledFieldset(html, '<button')).toBe(false)
    expect(insideDisabledFieldset(html, '<input')).toBe(true)
    backToLive()
    expect(insideDisabledFieldset(renderToStaticMarkup(createElement(Fold, { id: 'world-more', open: true, children: createElement('input') })), '<input')).toBe(false)
  })

  it('World: Gravity, Air and Slow motion are locked; the View toggle (the camera) is not', () => {
    replaying()
    const html = renderToStaticMarkup(createElement(WorldSection))
    expect(insideDisabledFieldset(html, '<select')).toBe(true)
    expect(insideDisabledFieldset(html, 'Vacuum')).toBe(true)
    expect(insideDisabledFieldset(html, 'normal')).toBe(true)
    expect(insideDisabledFieldset(html, 'Side view')).toBe(false)
    expect(insideDisabledFieldset(html, '3D view')).toBe(false)
    backToLive()
    const live = renderToStaticMarkup(createElement(WorldSection))
    expect(live).not.toMatch(/<fieldset[^>]* disabled=""/)
  })

  it('the object list: a row still chooses the object, its Delete is disabled', () => {
    useSandbox.getState().loadPreset('bounce')
    freshRun()
    expect(useSandbox.getState().bodies.length).toBeGreaterThan(0)
    const live = renderToStaticMarkup(createElement(BodyList))
    expect(live).not.toMatch(/<button[^>]* disabled=""/)
    replaying()
    const html = renderToStaticMarkup(createElement(BodyList))
    expect(html).toMatch(/<button[^>]* disabled=""[^>]*title="Replaying: Branch from here or Back to live to delete"/)
    expect(html).toContain('cursor-pointer')
  })

  it('the selected object\'s rows and Put back are locked in replay', () => {
    useSandbox.getState().loadPreset('bounce')
    freshRun()
    const sel = useSandbox.getState().bodies.find((b) => b.motion === 'dynamic')!
    const draw = () => renderToStaticMarkup(createElement(Selected, { sel, live: null, update: () => {} }))
    const live = draw()
    expect(live).not.toMatch(/<button[^>]* disabled=""/)
    expect(live).not.toMatch(/<fieldset[^>]* disabled=""/)
    replaying()
    const html = draw()
    expect(html).toMatch(/<button[^>]* disabled=""[^>]*title="Put it back/)
    expect(insideDisabledFieldset(html, '<input')).toBe(true)
  })

  it('the whole panel: Add and Connect are locked, an experiment can still be loaded, the camera and the readings stay', () => {
    useSandbox.getState().loadPreset('bounce')
    freshRun()
    const live = renderToStaticMarkup(createElement(Sandbox))
    expect(live).not.toMatch(/<fieldset[^>]* disabled=""/)
    expect(live).not.toContain('role="status"')
    replaying()
    const html = renderToStaticMarkup(createElement(Sandbox))
    expect(html).toContain(replayRefusal()!)
    expect(insideDisabledFieldset(html, 'Connect two objects')).toBe(true)
    expect(insideDisabledFieldset(html, 'Side view')).toBe(false)
    expect(insideDisabledFieldset(html, 'Ready-made experiments')).toBe(false)
  })

  it('Back to live is the way out: the locks come off (Branch from here ends in the same mode, tested with the real engine in transportActions.test.ts)', () => {
    replaying()
    expect(renderToStaticMarkup(createElement(Sandbox))).toMatch(/<fieldset[^>]* disabled=""/)
    backToLive()
    expect(useTape.getState().mode).toBe('live')
    expect(renderToStaticMarkup(createElement(Sandbox))).not.toMatch(/<fieldset[^>]* disabled=""/)
  })
})

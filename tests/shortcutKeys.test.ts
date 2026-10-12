// P-CW8c: the window's keyboard shortcuts, pinned as they behave today. Delete and Backspace act on
// the selection (and Backspace on a drawing's last pick first), Escape cancels a drawing and then
// goes back to Move, Ctrl+A selects what is visible, a letter key picks a tool only on the open
// mode's shelf, and the Sandbox keeps its own Backspace. The handler is driven directly, with the
// real scene and tool stores, as the window listener would drive it. No DOM: the key's target is a
// plain element that is neither a text field nor a button.

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Builder } from '../src/renderer/src/core/factory'
import { scene } from '../src/renderer/src/core/store'
import type { ObjId } from '../src/renderer/src/core/types'
import { advanceTool, resetTool, useTool } from '../src/renderer/src/render/tools'
import { useApp } from '../src/renderer/src/app/modes'
import { useSandbox } from '../src/renderer/src/sim/store'
import type { V3 } from '../src/renderer/src/math/vec'
import { REC_FLOATS, Tape } from '../src/renderer/src/sim/tape'
import { useTape } from '../src/renderer/src/sim/tapeStore'
import { tapes } from '../src/renderer/src/sim/recorder'
import * as transport from '../src/renderer/src/sim/transportActions'

// SB17's rows watch what the keys ask of the transport actions while the real actions still run (a spy that calls through), and
// a step of the engine is a counter that grows the live tape, as the recorder does (there is no engine in these rows).
const { engineSteps } = vi.hoisted(() => ({ engineSteps: { calls: 0, onStep: () => {} } }))
vi.mock('../src/renderer/src/sim/stepping', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  stepOneFrame: () => {
    engineSteps.calls++
    engineSteps.onStep()
  }
}))
vi.mock('../src/renderer/src/sim/transportActions', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/renderer/src/sim/transportActions')>()
  return {
    ...real,
    playBackwards: vi.fn(real.playBackwards),
    pause: vi.fn(real.pause),
    play: vi.fn(real.play),
    stepBack: vi.fn(real.stepBack),
    stepForward: vi.fn(real.stepForward),
    branchFromHere: vi.fn(real.branchFromHere),
    bookmarkHere: vi.fn(real.bookmarkHere),
    loopStart: vi.fn(real.loopStart),
    loopEnd: vi.fn(real.loopEnd)
  }
})

// app/shortcuts.ts pulls in files.ts, which reads the desktop bridge off `window` as it loads. A
// node test has no window, so the import gets globalThis as one, and only for the import itself.
let shortcutKeyDown: (e: KeyboardEvent) => void
let shortcutKeyUp: (e: KeyboardEvent) => void

beforeAll(async () => {
  vi.stubGlobal('window', globalThis)
  try {
    const keys = await import('../src/renderer/src/app/shortcuts')
    shortcutKeyDown = keys.shortcutKeyDown
    shortcutKeyUp = keys.shortcutKeyUp
  } finally {
    vi.unstubAllGlobals()
  }
})

/** A plain element: not a text field, not a button, so no key is handed to it. */
const PLAIN_TARGET = { tagName: 'DIV' }

/** A key press as the window listener sees it. */
function press(key: string, o: { ctrl?: boolean; shift?: boolean; alt?: boolean; repeat?: boolean; target?: object } = {}): void {
  shortcutKeyDown({
    key,
    ctrlKey: !!o.ctrl,
    metaKey: false,
    shiftKey: !!o.shift,
    altKey: !!o.alt,
    repeat: !!o.repeat,
    target: o.target ?? PLAIN_TARGET,
    defaultPrevented: false,
    preventDefault() {}
  } as unknown as KeyboardEvent)
}

/** A key coming up, as the window's keyup listener sees it (only Space is read). */
function release(key: string, o: { target?: object } = {}): void {
  shortcutKeyUp({ key, target: o.target ?? PLAIN_TARGET } as unknown as KeyboardEvent)
}

/** A point placed before the drawing began (its own undo step, as the Point tool makes it), not selected. */
function placeEarlier(p: V3): ObjId {
  const b = new Builder()
  const pt = b.point(p)
  b.commit(false)
  return pt.id
}

/** A click on empty space with a drawing tool: the point is made, remembered as the tool's own, and picked. */
function clickEmpty(p: V3): ObjId {
  const b = new Builder()
  const pt = b.point(p)
  b.commit(false)
  useTool.setState((t) => ({ created: [...t.created, pt.id] }))
  const next = [...useTool.getState().picks, pt.id]
  useTool.setState({ picks: next })
  advanceTool(scene().tool, next)
  return pt.id
}

const has = (id: ObjId) => !!scene().objects[id]

beforeEach(() => {
  scene().newScene()
  resetTool()
  scene().setTool('select')
  scene().select([])
  useApp.setState({ mode: 'vectors' })
  useSandbox.getState().select(null)
})

describe('Delete and Backspace with a selection and no drawing', () => {
  it('(a) Delete removes the selected objects and nothing else', () => {
    const A = placeEarlier([0, 0, 0])
    const B = placeEarlier([1, 0, 0])
    const C = placeEarlier([2, 0, 0])
    scene().select([A, B])
    press('Delete')
    expect(has(A)).toBe(false)
    expect(has(B)).toBe(false)
    expect(has(C)).toBe(true)
  })

  it('Backspace with no drawing in progress also removes the selection', () => {
    const A = placeEarlier([0, 0, 0])
    const B = placeEarlier([1, 0, 0])
    scene().select([A])
    press('Backspace')
    expect(has(A)).toBe(false)
    expect(has(B)).toBe(true)
  })
})

describe('(b) Backspace while a drawing has picks steps back one pick', () => {
  it('removes only the last pick, and an earlier unrelated selection survives that press', () => {
    scene().setTool('triangle')
    const C = placeEarlier([9, 9, 0])
    scene().select([C])
    const P = clickEmpty([0, 0, 0])
    const Q = clickEmpty([1, 0, 0])
    press('Backspace')
    expect(has(Q)).toBe(false)
    expect(has(P)).toBe(true)
    expect(useTool.getState().picks).toEqual([P])
    expect(scene().selection).toEqual([C])
    expect(has(C)).toBe(true)
  })

  it('a one-pick drawing: the first Backspace ends it, removes the pick it made, and keeps the selection', () => {
    scene().setTool('line')
    const A = placeEarlier([0, 0, 0])
    scene().select([A])
    const P = clickEmpty([3, 0, 0])
    press('Backspace')
    expect(useTool.getState().picks).toEqual([])
    expect(has(P)).toBe(false)
    expect(scene().selection).toEqual([A])
    expect(has(A)).toBe(true)
  })
})

describe('(c) Escape cancels a drawing, then goes back to Move', () => {
  it('the first Escape cancels the drawing; the second sets the tool to select and empties the selection', () => {
    scene().setTool('triangle')
    const C = placeEarlier([9, 9, 0])
    scene().select([C])
    const P = clickEmpty([0, 0, 0])
    const Q = clickEmpty([1, 0, 0])
    press('Escape')
    expect(useTool.getState().picks).toEqual([])
    expect(has(P)).toBe(false)
    expect(has(Q)).toBe(false)
    expect(scene().tool).toBe('triangle')
    expect(scene().selection).toEqual([C])
    press('Escape')
    expect(scene().tool).toBe('select')
    expect(scene().selection).toEqual([])
    expect(has(C)).toBe(true)
  })
})

describe('(d) Ctrl+A selects the visible objects', () => {
  it('selects every object of the drawing that is visible', () => {
    const A = placeEarlier([0, 0, 0])
    const B = placeEarlier([1, 0, 0])
    const C = placeEarlier([2, 0, 0])
    press('a', { ctrl: true })
    expect(new Set(scene().selection)).toEqual(new Set([A, B, C]))
  })
})

describe('(e) a tool letter key picks a tool only when the open mode shows it', () => {
  it('W picks Vector in the Vectors mode; L is ignored there and picks Line in the Geometry mode', () => {
    press('w')
    expect(scene().tool).toBe('vector')
    press('l')
    expect(scene().tool).toBe('vector')
    useApp.setState({ mode: 'shapes' })
    press('l')
    expect(scene().tool).toBe('line')
  })
})

describe('(f) the Sandbox keeps its own Backspace', () => {
  it('Backspace with no sandbox selection leaves the scene objects alone', () => {
    useApp.setState({ mode: 'sandbox' })
    const A = placeEarlier([0, 0, 0])
    const B = placeEarlier([1, 0, 0])
    scene().select([A])
    expect(useSandbox.getState().selection).toBeNull()
    press('Backspace')
    expect(has(A)).toBe(true)
    expect(has(B)).toBe(true)
  })
})

describe('CW8c-1: Backspace after a drawing has ended', () => {
  it('setup: the first Backspace ends a one-pick Line drawing and keeps the earlier selection', () => {
    scene().setTool('line')
    const A = placeEarlier([0, 0, 0])
    scene().select([A])
    const P = clickEmpty([3, 0, 0])
    press('Backspace')
    expect(useTool.getState().picks).toEqual([])
    expect(has(P)).toBe(false)
    expect(scene().selection).toEqual([A])
    expect(has(A)).toBe(true)
  })

  // CW8c-1 [answer may change]: proved, NOT fixed — waits for the owner (09\polish\pro-account\OWNER-APPROVALS.md).
  it.fails('CW8c-1: a second Backspace after a drawing has ended must not delete the earlier selection', () => {
    scene().setTool('line')
    const A = placeEarlier([0, 0, 0])
    scene().select([A])
    clickEmpty([3, 0, 0])
    press('Backspace')
    press('Backspace')
    expect(has(A)).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// SB17: the Sandbox transport keys (J K L comma full stop B, Space). Sandbox only, never while typing.

/** A tape of `n` steps at 240 a second (one body), the live tape of the run. */
function recordedRun(n: number): NonNullable<typeof tapes.live> {
  const t = new Tape({ bodies: ['ball'], ropes: [] }, 240, 0, 0)
  for (let k = 0; k < n; k++) t.push(k, new Float32Array(REC_FLOATS))
  return t as unknown as NonNullable<typeof tapes.live>
}

const { branchHere: realBranchHere } = useTape.getState()
const tape = () => useTape.getState()
const playing = () => scene().playing

describe('SB17: the Sandbox transport keys', () => {
  beforeEach(() => {
    useApp.setState({ mode: 'sandbox' })
    tapes.live = recordedRun(600)
    tapes.fine = null
    tapes.parent = null
    engineSteps.calls = 0
    engineSteps.onStep = () => {
      const t = tapes.live!
      t.push(t.last + 1, new Float32Array(REC_FLOATS))
    }
    useTape.setState({ mode: 'live', playhead: 599, playing: false, speed: 1, direction: 1, marks: [], bookmarks: [], loop: null, note: null, branchHere: realBranchHere })
    scene().setPlaying(false)
    vi.mocked(transport.playBackwards).mockClear()
    vi.mocked(transport.pause).mockClear()
    vi.mocked(transport.play).mockClear()
    vi.mocked(transport.stepBack).mockClear()
    vi.mocked(transport.stepForward).mockClear()
    vi.mocked(transport.branchFromHere).mockClear()
    vi.mocked(transport.bookmarkHere).mockClear()
    vi.mocked(transport.loopStart).mockClear()
    vi.mocked(transport.loopEnd).mockClear()
  })

  it('L plays: the engine in live', () => {
    press('l')
    expect(transport.play).toHaveBeenCalledOnce()
    expect(playing()).toBe(true)
  })

  it('K pauses: the engine in live, the recording in replay', () => {
    scene().setPlaying(true)
    press('k')
    expect(transport.pause).toHaveBeenCalledOnce()
    expect(playing()).toBe(false)
    useTape.setState({ mode: 'replay', playhead: 100, playing: true })
    press('k')
    expect(tape().playing).toBe(false)
  })

  it('J plays the recording backwards: replay, reversed, playing, and the engine stays paused', () => {
    scene().setPlaying(true)
    press('j')
    expect(transport.playBackwards).toHaveBeenCalledOnce()
    expect(tape().mode).toBe('replay')
    expect(tape().direction).toBe(-1)
    expect(tape().playing).toBe(true)
    expect(playing()).toBe(false)
  })

  it('L after J plays forwards again', () => {
    press('j')
    press('l')
    expect(tape().direction).toBe(1)
    expect(tape().playing).toBe(true)
  })

  it('comma steps back one step, from a live run into replay, and stops at the start', () => {
    press(',')
    expect(transport.stepBack).toHaveBeenCalledOnce()
    expect(tape().mode).toBe('replay')
    expect(tape().playhead).toBe(598)
    useTape.setState({ playhead: 0 })
    press(',')
    expect(tape().playhead).toBe(0)
  })

  it('full stop steps the engine once in live and the playhead on in replay', () => {
    press('.')
    expect(transport.stepForward).toHaveBeenCalledOnce()
    expect(engineSteps.calls).toBe(1)
    useTape.setState({ mode: 'replay', playhead: 10 })
    press('.')
    expect(tape().playhead).toBe(11)
    expect(engineSteps.calls).toBe(1)
  })

  it('a held comma or full stop repeats; a held J, K, L or B does not', () => {
    press(',', { repeat: true })
    press(',', { repeat: true })
    expect(transport.stepBack).toHaveBeenCalledTimes(2)
    for (const k of ['j', 'k', 'l', 'b']) press(k, { repeat: true })
    expect(transport.playBackwards).not.toHaveBeenCalled()
    expect(transport.pause).not.toHaveBeenCalled()
    expect(transport.play).not.toHaveBeenCalled()
    expect(transport.branchFromHere).not.toHaveBeenCalled()
  })

  it('B asks the tape to branch from the moment on screen: refused in live, taken in replay', () => {
    press('b')
    expect(transport.branchFromHere).toHaveBeenCalledOnce()
    const branch = vi.fn()
    useTape.setState({ mode: 'replay', playhead: 100, branchHere: branch })
    press('b')
    expect(branch).toHaveBeenCalledOnce()
    expect(playing()).toBe(false)
  })

  it('M leaves a bookmark at the moment on screen', () => {
    useTape.setState({ mode: 'replay', playhead: 120 })
    press('m')
    expect(transport.bookmarkHere).toHaveBeenCalledOnce()
    expect(tape().bookmarks.map((b) => b.step)).toEqual([120])
    press('m', { repeat: true })
    expect(transport.bookmarkHere).toHaveBeenCalledOnce()
  })

  it('[ and ] set the loop’s start and end at the playhead', () => {
    useTape.setState({ mode: 'replay', playhead: 100 })
    press('[')
    expect(transport.loopStart).toHaveBeenCalledOnce()
    useTape.setState({ playhead: 300 })
    press(']')
    expect(transport.loopEnd).toHaveBeenCalledOnce()
    expect(tape().loop).toEqual({ a: 100, b: 300 })
  })

  it('a capital letter (Caps Lock or Shift) is the same key', () => {
    press('L', { shift: true })
    expect(transport.play).toHaveBeenCalledOnce()
  })

  it('Space, on the way up, plays and pauses the engine in live', () => {
    press(' ')
    release(' ')
    expect(playing()).toBe(true)
    press(' ')
    release(' ')
    expect(playing()).toBe(false)
  })

  it('Space plays and pauses the recording in replay, and the engine stays where it is', () => {
    useTape.setState({ mode: 'replay', playhead: 100 })
    press(' ')
    release(' ')
    expect(tape().playing).toBe(true)
    expect(playing()).toBe(false)
    press(' ')
    release(' ')
    expect(tape().playing).toBe(false)
  })

  it('Space on a focused button is that button’s click: the key does not also play', () => {
    const button = { tagName: 'BUTTON' }
    press(' ', { target: button })
    release(' ', { target: button })
    expect(playing()).toBe(false)
  })

  it('none of them act while a text box has the focus', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'MATH-FIELD']) {
      const target = { tagName }
      for (const k of ['j', 'k', 'l', ',', '.', 'b', 'm', '[', ']']) press(k, { target })
      press(' ', { target })
      release(' ', { target })
    }
    expect(transport.playBackwards).not.toHaveBeenCalled()
    expect(transport.pause).not.toHaveBeenCalled()
    expect(transport.play).not.toHaveBeenCalled()
    expect(transport.stepBack).not.toHaveBeenCalled()
    expect(transport.stepForward).not.toHaveBeenCalled()
    expect(transport.branchFromHere).not.toHaveBeenCalled()
    expect(transport.bookmarkHere).not.toHaveBeenCalled()
    expect(transport.loopStart).not.toHaveBeenCalled()
    expect(transport.loopEnd).not.toHaveBeenCalled()
    expect(playing()).toBe(false)
    expect(tape().mode).toBe('live')
  })

  it('a key with Ctrl or Alt held is not the transport’s', () => {
    press('l', { ctrl: true })
    press('j', { alt: true })
    expect(transport.play).not.toHaveBeenCalled()
    expect(transport.playBackwards).not.toHaveBeenCalled()
  })

  it('outside the Sandbox they do nothing, and the drawing keys keep their own: L is Line in Geometry', () => {
    useApp.setState({ mode: 'vectors' })
    for (const k of ['j', 'k', 'l', ',', '.', 'b', 'm', '[', ']']) press(k)
    expect(transport.bookmarkHere).not.toHaveBeenCalled()
    expect(transport.loopStart).not.toHaveBeenCalled()
    expect(transport.loopEnd).not.toHaveBeenCalled()
    expect(transport.playBackwards).not.toHaveBeenCalled()
    expect(transport.pause).not.toHaveBeenCalled()
    expect(transport.play).not.toHaveBeenCalled()
    expect(transport.stepBack).not.toHaveBeenCalled()
    expect(transport.stepForward).not.toHaveBeenCalled()
    expect(transport.branchFromHere).not.toHaveBeenCalled()
    expect(tape().mode).toBe('live')
    useApp.setState({ mode: 'shapes' })
    press('l')
    expect(scene().tool).toBe('line')
    expect(transport.play).not.toHaveBeenCalled()
  })

  it('outside the Sandbox, Space still plays and pauses the drawing’s timeline', () => {
    useApp.setState({ mode: 'vectors' })
    press(' ')
    release(' ')
    expect(playing()).toBe(true)
    expect(tape().playing).toBe(false)
  })
})

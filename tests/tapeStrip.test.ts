// SB17: the tape strip. Where things sit on the bar (stripModel), what a click or a key on it asks for, and the strip rendered for real
// (react-dom/server; the suite has no DOM): hidden before the first step, every control with a title and a 44 px target, Back to
// live only in replay, and nothing changing width as the numbers grow (Fix 22). The Bouncing ball's marks are the steps the
// recorder will give (0.782, 2.033, 3.034, 3.835 s at 240 steps a second).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { REC_FLOATS, Tape } from '../src/renderer/src/sim/tape'
import { useTape } from '../src/renderer/src/sim/tapeStore'
import { useSandboxView } from '../src/renderer/src/sim/sandboxView'
import { nextSimpleSpeed, readTapeBarShown, TAPE_BAR_KEY, useTapeBar, writeTapeBarShown } from '../src/renderer/src/sim/tapeBar'
import { refuseEdit, useEditRefusal } from '../src/renderer/src/sim/transportActions'
import { tapes } from '../src/renderer/src/sim/recorder'
import { useScene } from '../src/renderer/src/core/store'
import { useSandbox } from '../src/renderer/src/sim/store'
import {
  MIN_SPAN_SECONDS,
  barSeconds,
  TapeStrip,
  WIDEST_TIME_TEXT,
  barKeyTarget,
  seekStep,
  stripModel,
  stripView,
  type StripInput
} from '../src/renderer/src/render/sandbox/TapeStrip'
import { durationWords, stepToX, ticks, timeText } from '../src/renderer/src/render/sandbox/tapeStripMath'
import { Transport } from '../src/renderer/src/panels/sandbox/Transport'
import { Timeline } from '../src/renderer/src/panels/Timeline'
import { useApp } from '../src/renderer/src/app/modes'

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

const RATE = 240
/** A tape of `n` steps at `rate`, one body, with a keyframe every second as the recorder keeps. */
type RunTape = NonNullable<typeof tapes.live>
function makeTape(n: number, rate = RATE, startStep = 0): RunTape {
  const t = new Tape({ bodies: ['ball'], ropes: [] }, rate, startStep, startStep / rate)
  for (let s = startStep; s < startStep + n; s++) {
    t.push(s, new Float32Array(REC_FLOATS))
    if ((s - startStep) % rate === 0) t.addKeyframe(s, null)
  }
  return t as unknown as RunTape
}

/** Bouncing ball's bounce steps at 240/s: within one step of 0.782, 2.033, 3.034 and 3.835 s. */
const BOUNCE_STEPS = [188, 488, 728, 920]

const input = (over: Partial<StripInput> = {}): StripInput => ({
  tape: makeTape(1200),
  mode: 'live',
  playhead: 0,
  marks: BOUNCE_STEPS,
  bookmarks: [],
  loop: null,
  branchStep: null,
  width: 600,
  ...over
})

describe('stripView', () => {
  it('shows a recording shorter than five seconds on a five-second bar, and a longer one whole', () => {
    expect(MIN_SPAN_SECONDS).toBe(5)
    const short = stripView(makeTape(60), 'live', 600)
    expect(short.first).toBe(0)
    expect(short.last).toBe(5 * RATE)
    // BUGREC (owner: 'while recording, the bar flickers and moves right and left violently'): a longer recording is shown on
    // the next nice length, 10, 20, 30, 60 s …, so the ticks stand still while it grows instead of rescaling every frame.
    const long = stripView(makeTape(10 * RATE), 'live', 600)
    expect(long.last).toBe(10 * RATE)
    expect(stripView(makeTape(6 * RATE), 'live', 600).last).toBe(10 * RATE)
    expect(stripView(makeTape(25 * RATE), 'live', 600).last).toBe(30 * RATE)
    expect(stripView(makeTape(45 * RATE), 'replay', 600).last).toBe(60 * RATE)
  })

  it('BUGREC: the bar lengths are 5, 10, 20, 30 s, 1, 2, 3, 5, 10, 20, 30 min, then whole hours', () => {
    expect([0, 5, 5.01, 10, 19, 29, 59, 61, 150, 200, 400, 700, 1500, 3000, 3601].map(barSeconds)).toEqual([5, 5, 10, 10, 20, 30, 60, 120, 180, 300, 600, 1200, 1800, 3600, 7200])
  })

  it('BUGREC: while a run records, the ticks stand still between two steps of the scale', () => {
    const views = [6, 7, 8, 9, 9.9].map((s) => stripView(makeTape(Math.round(s * RATE)), 'live', 600))
    expect(new Set(views.map((v) => v.last)).size).toBe(1)
    expect(new Set(views.map((v) => JSON.stringify(ticks(v)))).size).toBe(1)
  })

  it('shows the fast re-run whole, however short', () => {
    const fine = makeTape(600, 600, 300)
    const v = stripView(fine, 'fine', 600)
    expect(v.first).toBe(300)
    expect(v.last).toBe(899)
    expect(v.startTime).toBeCloseTo(0.5, 12)
  })

  it('follows a recording whose start was trimmed by the cap', () => {
    const t = makeTape(3000, RATE, 1000)
    const v = stripView(t, 'live', 600)
    expect(v.first).toBe(1000)
    expect(v.startTime).toBeCloseTo(1000 / RATE, 12)
  })
})

describe('time in words', () => {
  it('writes a length of time as a person says it', () => {
    expect(durationWords(0)).toBe('0 s')
    expect(durationWords(45)).toBe('45 s')
    expect(durationWords(0.5)).toBe('0.5 s')
    expect(durationWords(100)).toBe('1 min 40 s')
    expect(durationWords(7500)).toBe('2 h 5 min')
    expect(durationWords(3600)).toBe('1 h')
  })

  it('timeText writes the step through the number writer too', () => {
    expect(timeText(0.78333, 188)).toBe('t = 0.783 s · step 188')
    expect(timeText(5.1, 1234)).toBe('t = 5.1 s · step 1234')
  })
})

describe('stripModel', () => {
  it('puts the marks where the bounces are, and the playhead at the end in live', () => {
    const m = stripModel(input())
    expect(m.marks.map((k) => k.step)).toEqual(BOUNCE_STEPS)
    for (const k of m.marks) expect(k.x).toBeCloseTo(stepToX(m.view, k.step), 9)
    // the bar is five seconds (1200 steps) across 600 px: 188 steps in is 94 px
    expect(m.view.last).toBe(1200)
    expect(m.marks[0].x).toBeCloseTo(94, 9)
    expect(m.head).toBe(1199)
    expect(m.headX).toBeCloseTo((1199 / 1200) * 600, 9)
    expect(m.fillX).toBeCloseTo(m.headX, 9)
  })

  it('a short recording fills only its own part of the bar', () => {
    const m = stripModel(input({ tape: makeTape(240), marks: [] }))
    expect(m.fillX).toBeCloseTo((239 / (5 * RATE)) * 600, 9)
    expect(m.fillX).toBeLessThan(600)
  })

  it('puts the playhead of a replay where it is, kept on the recording', () => {
    const m = stripModel(input({ mode: 'replay', playhead: 188.4 }))
    expect(m.head).toBe(188.4)
    expect(stripModel(input({ mode: 'replay', playhead: -9 })).head).toBe(0)
    expect(stripModel(input({ mode: 'replay', playhead: 99999 })).head).toBe(1199)
  })

  it('reads the time and step of the head through the number writer: stopping on the first mark reads 0.783 s, within 1/240 s of 0.782 s', () => {
    const m = stripModel(input({ mode: 'replay', playhead: 188 }))
    expect(m.text).toBe('t = 0.783 s · step 188')
    expect(Math.abs(188 / RATE - 0.782)).toBeLessThanOrEqual(1 / RATE)
    // a fractional playhead shows the step it is on
    expect(stripModel(input({ mode: 'replay', playhead: 188.9 })).text).toBe('t = 0.783 s · step 188')
  })

  it('keyframes sit on the bar once a second, bookmarks and the loop where they were set, and the branch point where it was made', () => {
    const m = stripModel(input({ bookmarks: [{ step: 300, label: '' }], loop: { a: 100, b: 400 }, branchStep: 488 }))
    expect(m.keys.map((k) => k.step)).toEqual([0, 240, 480, 720, 960])
    expect(m.bookmarks.map((b) => b.step)).toEqual([300])
    expect(m.loop!.x0).toBeCloseTo(50, 9)
    expect(m.loop!.x1).toBeCloseTo(200, 9)
    expect(m.branchX).toBeCloseTo(244, 9)
  })

  it('leaves out marks, bookmarks and a branch point that are not on this tape', () => {
    const m = stripModel(input({ marks: [-3, 188, 99999], bookmarks: [{ step: 5000, label: '' }], branchStep: 5000 }))
    expect(m.marks.map((k) => k.step)).toEqual([188])
    expect(m.bookmarks).toEqual([])
    expect(m.branchX).toBeNull()
  })

  it('has ticks on a 1-2-5 series at least 60 px apart', () => {
    const m = stripModel(input())
    expect(m.ticks.length).toBeGreaterThan(3)
    for (let k = 1; k < m.ticks.length; k++) expect(m.ticks[k].x - m.ticks[k - 1].x).toBeGreaterThanOrEqual(60 - 1e-6)
    // five seconds over 600 px: a tick every 0.5 s (60 px), the first 1-2-5 step that keeps 60 px
    expect(m.ticks.slice(0, 3).map((t) => t.label)).toEqual(['0 s', '0.5 s', '1 s'])
  })

  it('writes no tick or time label with an exponent or a caret', () => {
    const m = stripModel(input({ tape: makeTape(60 * RATE * 5) }))
    for (const t of m.ticks) expect(t.label).not.toMatch(/e-|\^/)
    expect(m.ticks.some((t) => /min/.test(t.label))).toBe(true)
  })
})

describe('a click and the keys on the bar', () => {
  const m = stripModel(input({ mode: 'replay', playhead: 600 }))

  it('a click near a mark lands exactly on the mark; away from it, on the nearest step', () => {
    const mark = m.marks[0]
    expect(seekStep(m, mark.x + 3, true)).toBe(188)
    expect(seekStep(m, mark.x + 40, true)).toBe(Math.round(((mark.x + 40) / 600) * 1199))
    // dragging never snaps
    expect(seekStep(m, mark.x + 3, false)).not.toBe(188)
  })

  it('never goes past the recording: a click in the empty part of a short bar lands on its last step, and the first step is the lowest', () => {
    const s = stripModel(input({ tape: makeTape(240), marks: [] }))
    expect(seekStep(s, 599, true)).toBe(239)
    expect(seekStep(s, -50, true)).toBe(0)
  })

  it('arrow keys step, Shift jumps a second, Home and End go to the ends, and they stay on the recording', () => {
    expect(barKeyTarget('ArrowLeft', false, m)).toBe(599)
    expect(barKeyTarget('ArrowRight', false, m)).toBe(601)
    expect(barKeyTarget('ArrowRight', true, m)).toBe(600 + RATE)
    expect(barKeyTarget('ArrowLeft', true, m)).toBe(600 - RATE)
    expect(barKeyTarget('Home', false, m)).toBe(0)
    expect(barKeyTarget('End', false, m)).toBe(1199)
    const atEnd = stripModel(input({ mode: 'replay', playhead: 1199 }))
    expect(barKeyTarget('ArrowRight', true, atEnd)).toBe(1199)
    const atStart = stripModel(input({ mode: 'replay', playhead: 0 }))
    expect(barKeyTarget('ArrowLeft', false, atStart)).toBe(0)
  })

  it('Page Up and Page Down go to the previous and next bounce', () => {
    expect(barKeyTarget('PageUp', false, m)).toBe(488)
    expect(barKeyTarget('PageDown', false, m)).toBe(728)
    const first = stripModel(input({ mode: 'replay', playhead: 100 }))
    expect(barKeyTarget('PageDown', false, first)).toBe(188)
    expect(barKeyTarget('PageUp', false, first)).toBe(0)
    const last = stripModel(input({ mode: 'replay', playhead: 1000 }))
    expect(barKeyTarget('PageDown', false, last)).toBe(1199)
  })

  it('Page Up and Page Down walk the bounces and the bookmarks together, in time order, whichever was added last', () => {
    const bookmarks = [
      { step: 1000, label: 'late' },
      { step: 300, label: 'early' }
    ]
    const at = (playhead: number) => stripModel(input({ mode: 'replay', playhead, bookmarks }))
    const down: number[] = []
    for (let head = 0; down.length < 8; ) {
      const to = barKeyTarget('PageDown', false, at(head))!
      down.push(to)
      head = to
      if (to === 1199) break
    }
    expect(down).toEqual([188, 300, 488, 728, 920, 1000, 1199])
    const up: number[] = []
    for (let head = 1199; up.length < 8; ) {
      const to = barKeyTarget('PageUp', false, at(head))!
      up.push(to)
      head = to
      if (to === 0) break
    }
    expect(up).toEqual([1000, 920, 728, 488, 300, 188, 0])
  })

  it("the bar's title says the Page keys also stop at bookmarks", () => {
    tapes.live = makeTape(1200)
    useTape.setState({ mode: 'live', playhead: 1199, marks: BOUNCE_STEPS, bookmarks: [] })
    expect(renderToStaticMarkup(createElement(TapeStrip))).toContain('Page Up and Page Down go to the previous or next bounce or bookmark')
  })

  it('any other key is not the bar’s', () => {
    for (const k of ['j', 'k', 'l', ',', '.', ' ', 'Enter', 'a']) expect(barKeyTarget(k, false, m)).toBeNull()
  })

  it('walking the bounces with Page Down from the start reaches every mark within one step of its time, in order', () => {
    let head = 0
    const seen: number[] = []
    for (let k = 0; k < 4; k++) {
      const to = barKeyTarget('PageDown', false, stripModel(input({ mode: 'replay', playhead: head })))!
      seen.push(to)
      head = to
    }
    expect(seen).toEqual(BOUNCE_STEPS)
    const want = [0.782, 2.033, 3.034, 3.835]
    seen.forEach((s, k) => expect(Math.abs(s / RATE - want[k])).toBeLessThanOrEqual(1 / RATE))
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The strip, rendered

const render = (inline = false) => renderToStaticMarkup(createElement(TapeStrip, { inline }))
const buttons = (html: string) => [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0])

function setLive(steps: number, over: Partial<ReturnType<typeof useTape.getState>> = {}): void {
  tapes.live = makeTape(steps)
  tapes.fine = null
  tapes.parent = null
  useTape.setState({ mode: 'live', playhead: steps - 1, playing: false, speed: 1, direction: 1, marks: [], bookmarks: [], loop: null, note: null, ...over })
}

beforeEach(() => {
  setLive(1200)
  useScene.getState().setPlaying(false)
  useSandbox.setState({ world: { ...useSandbox.getState().world, timeScale: 1 } })
  useSandboxView.setState({ view: 'all' })
  // These tests are about the bar itself: shown (SB66 hides it by default; its own tests below).
  useTapeBar.setState({ shown: true })
})

describe('the strip is hidden until the first step of a run, then always there', () => {
  it('renders nothing with no tape, and nothing with the start record alone', () => {
    tapes.live = null
    expect(render()).toBe('')
    tapes.live = makeTape(1)
    expect(render()).toBe('')
  })

  it('shows from the first step on (two records)', () => {
    tapes.live = makeTape(2)
    expect(render()).toContain('data-tape-strip')
  })

  it('shows in live, replay and fine alike', () => {
    expect(render()).toContain('data-tape-strip')
    useTape.setState({ mode: 'replay', playhead: 300 })
    expect(render()).toContain('data-tape-strip')
    tapes.fine = makeTape(600, 600, 300)
    useTape.setState({ mode: 'fine', playhead: 400 })
    expect(render()).toContain('data-tape-strip')
  })

  it('in the Timeline panel (inline) says so instead of vanishing', () => {
    tapes.live = null
    expect(render(true)).toContain('Press Play')
  })
})

describe('every control: a name, a title, a 44 px target', () => {
  beforeEach(() => {
    useTapeBar.setState({ shown: true, more: true })
  })

  it('has the transport buttons, speeds, Bookmark and the two loop ends, Fine replay and Branch from here in live; no Back to live', () => {
    const html = render()
    const bs = buttons(html)
    // S5: 7 in main row + 13 in More panel = 20 buttons total.
    expect(bs).toHaveLength(7 + 13)
    for (const tag of bs) {
      expect(tag, tag).toMatch(/min-h-\[44px\]/)
      expect(tag, tag).toMatch(/ title="[^"]+"/)
    }
    expect(html).not.toContain('Back to live')
    expect(html).toContain('Fine replay 1/600 s')
    expect(html).toContain('Branch from here')
  })

  it('every icon button has a name read aloud and a 44 px square', () => {
    const icons = buttons(render()).filter((t) => /icon-btn/.test(t))
    // 5 in main row + 6 in More panel = 11 icon buttons
    expect(icons).toHaveLength(5 + 6)
    for (const tag of icons) {
      expect(tag).toMatch(/aria-label="[^"]+"/)
      expect(tag).toMatch(/min-w-\[44px\]/)
    }
  })

  it('titles say what a button does and its key', () => {
    const html = render()
    expect(html).toContain('title="Play backwards (J)"')
    expect(html).toContain('title="Step back one step (comma key)"')
    expect(html).toContain('title="Play (Space or L)"')
    expect(html).toContain('title="Play forwards (L)"')
    expect(html).toContain('title="Leave a bookmark at this moment (M)"')
    expect(html).toContain('title="The loop starts here ([ key)"')
    expect(html).toContain('title="The loop ends here (] key)"')
    expect(html).toMatch(/title="Step one engine step \(1\/240 s\) \(full stop key\)"/)
    useScene.getState().setPlaying(true)
    expect(render()).toContain('title="Pause (Space or K)"')
  })

  it('the speeds are x1, 1/2, 1/4, 1/10 and 1/100 and the one in force is marked', () => {
    const html = render()
    for (const label of ['×1<', '×½<', '×¼<', '×1/10<', '×1/100<']) expect(html).toContain(label)
    expect(html).toMatch(/class="[^"]*\bon\b[^"]*"[^>]*aria-pressed="true"[^>]*>×1</)
    useSandbox.setState({ world: { ...useSandbox.getState().world, timeScale: 0.1 } })
    expect(render()).toMatch(/aria-pressed="true"[^>]*>×1\/10</)
    // in replay it is the recording's own speed
    useTape.setState({ mode: 'replay', playhead: 100, speed: 0.01 })
    expect(render()).toMatch(/aria-pressed="true"[^>]*>×1\/100</)
  })

  it('Back to live shows only in replay and fine', () => {
    useTape.setState({ mode: 'replay', playhead: 100 })
    const replay = render()
    expect(replay).toContain('Back to live')
    expect(buttons(replay)).toHaveLength(7 + 13 + 1)
    tapes.fine = makeTape(600, 600, 300)
    useTape.setState({ mode: 'fine', playhead: 400 })
    expect(render()).toContain('Back to live')
  })

  it('Fine replay and Branch from here are greyed in live with the reason in their title, and live in replay', () => {
    const live = buttons(render()).filter((t) => /Run the second|Step back or click/.test(t) || /Fine replay|Branch/.test(t))
    const liveHtml = render()
    expect(liveHtml).toMatch(/<button[^>]*title="Step back or click the bar to a moment first, then re-run it finely\."[^>]*disabled=""/)
    expect(liveHtml).toMatch(/<button[^>]*title="Step back or click the bar to a moment first, then branch from it\."[^>]*disabled=""/)
    expect(live.length).toBeGreaterThan(0)
    useTape.setState({ mode: 'replay', playhead: 300 })
    const replay = render()
    expect(replay).toMatch(/<button[^>]*title="Run the second around this moment again at 1\/600 s[^"]*"(?![^>]*disabled)/)
    expect(replay).toMatch(/<button[^>]*title="Continue the run from this moment[^"]*\(B\)"(?![^>]*disabled)/)
  })

  it('the transport buttons that cannot act are greyed: nothing before the start, no end in live', () => {
    const live = render()
    expect(live).toMatch(/aria-label="To the end"[^>]*disabled=""/)
    useTape.setState({ mode: 'replay', playhead: 0 })
    const atStart = render()
    expect(atStart).toMatch(/aria-label="To the start"[^>]*disabled=""/)
    expect(atStart).toMatch(/aria-label="Step back"[^>]*disabled=""/)
    expect(atStart).toMatch(/aria-label="Play backwards"[^>]*disabled=""/)
    expect(atStart).not.toMatch(/aria-label="To the end"[^>]*disabled=""/)
  })
})

describe('bookmarks and the loop', () => {
  beforeEach(() => {
    useTapeBar.setState({ shown: true, more: true })
  })

  it('a loop shows a Clear loop button in live and replay, not in fine; it is not there without a loop', () => {
    expect(render()).not.toContain('Clear loop')
    useTape.setState({ loop: { a: 100, b: 300 } })
    expect(render()).toContain('Clear loop')
    useTape.setState({ mode: 'replay', playhead: 150 })
    expect(render()).toContain('Clear loop')
    tapes.fine = makeTape(600, 600, 300)
    useTape.setState({ mode: 'fine', playhead: 400, loop: null })
    expect(render()).not.toContain('Clear loop')
  })

  it('the fast re-run hides the live recording’s bookmarks, loop and branch point, and greys the buttons that set them', () => {
    const fine = makeTape(600, 600, 300)
    const m = stripModel(input({ tape: fine, mode: 'fine', playhead: 400, bookmarks: [{ step: 400, label: '' }], loop: { a: 350, b: 450 }, branchStep: 500, marks: [] }))
    expect(m.bookmarks).toEqual([])
    expect(m.loop).toBeNull()
    expect(m.branchX).toBeNull()
    tapes.fine = fine
    useTape.setState({ mode: 'fine', playhead: 400 })
    const html = render()
    expect(html).toMatch(/aria-label="Bookmark"[^>]*disabled=""/)
    expect(html).toMatch(/aria-label="Loop start"[^>]*disabled=""/)
  })

  it('a bookmark can be landed on: a click near its flag seeks to it, and the snap points are in time order', () => {
    const m = stripModel(input({ bookmarks: [{ step: 300, label: '' }] }))
    const flag = m.bookmarks[0]
    expect(seekStep(m, flag.x + 2, true)).toBe(300)
    expect(m.snaps.map((k) => k.step)).toEqual([188, 300, 488, 728, 920])
  })
})

describe('the bar', () => {
  it('is a slider over the recording with the step and time as its value', () => {
    useTape.setState({ mode: 'replay', playhead: 188 })
    const html = render()
    expect(html).toMatch(/role="slider"[^>]*tabindex="0"/)
    expect(html).toContain('aria-valuemin="0"')
    expect(html).toContain('aria-valuemax="1199"')
    expect(html).toContain('aria-valuenow="188"')
    expect(html).toContain('aria-valuetext="t = 0.783 s · step 188"')
  })

  it('draws with the tape colour tokens only', () => {
    useTape.setState({ marks: BOUNCE_STEPS, bookmarks: [{ step: 100, label: '' }], loop: { a: 50, b: 300 }, mode: 'replay', playhead: 200 })
    tapes.parent = { tape: makeTape(10), step: 488 }
    const html = render()
    for (const token of ['--tape-track', '--tape-fill', '--tape-head', '--tape-key', '--tape-mark', '--tape-branch']) expect(html, token).toContain(`var(${token})`)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('writes the time of the playhead and the tape’s note on one line', () => {
    useTape.setState({ mode: 'replay', playhead: 188, note: 'The recording keeps the last 4 min.' })
    const html = render()
    expect(html).toContain('t = 0.783 s · step 188')
    expect(html).toContain('The recording keeps the last 4 min.')
  })
})

describe('nothing changes width as the numbers grow (Fix 22)', () => {
  it('the time keeps room for the widest time below 1000 s, at every rate', () => {
    for (const [seconds, rate] of [[0.0042, 240], [9.9958, 240], [99.9958, 240], [999.9958, 240], [999.998, 600], [999.9833, 60]] as const) {
      const step = Math.round(seconds * rate)
      expect(timeText(step / rate, step).length, `${seconds} s at ${rate}`).toBeLessThanOrEqual(WIDEST_TIME_TEXT.length)
    }
  })

  it('the controls row is the same elements and classes at 0.1 s and at 123 s; only the numbers differ', () => {
    const shape = (html: string) =>
      html
        .replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>')
        .replace(/>[^<]*</g, '><')
        .replace(/ (title|style|aria-[a-z]+)="[^"]*"/g, '')
    setLive(25)
    const early = shape(render())
    setLive(123 * RATE)
    const late = shape(render())
    expect(late).toBe(early)
  })

  it('a note arriving does not add a line: in inline view the note line is reserved; on canvas the note floats above the bar', () => {
    const without = render(true)
    useTape.setState({ note: 'Branched at t = 0.782 s. The old run is shown as a ghost.' })
    const withNote = render(true)
    expect(without).toContain('min-h-[18px]')
    expect(withNote).toContain('min-h-[18px]')
    expect(without.replace(/ title="[^"]*"/g, '').replace(/>[^<]*</g, '><')).toBe(withNote.replace(/ title="[^"]*"/g, '').replace(/>[^<]*</g, '><'))

    // On canvas, the note floats above the bar without expanding the bar's height
    useTape.setState({ note: null })
    expect(render()).not.toContain('min-h-[18px]')
    useTape.setState({ note: 'Branched at t = 0.782 s. The old run is shown as a ghost.' })
    expect(render()).toContain('absolute -top-6')
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The panel's Transport row and the Timeline panel follow the same tape

describe('the panel’s Transport row in replay', () => {
  const row = () => renderToStaticMarkup(createElement(Transport))

  it('live: the engine’s clock, no word “replay”, Play and Step titled with their keys', () => {
    const html = row()
    expect(html).not.toMatch(/replay/)
    expect(html).toContain('title="Play (Space or L)"')
    expect(html).toContain('title="Step one engine step (1/240 s) (full stop key)"')
  })

  it('replay: the clock is the playhead’s time and says replay; fine says fine replay', () => {
    useTape.setState({ mode: 'replay', playhead: 188 })
    expect(row()).toContain('t = 0.78 s · replay')
    tapes.fine = makeTape(600, 600, 300)
    useTape.setState({ mode: 'fine', playhead: 400 })
    expect(row()).toContain('· fine replay')
  })

  it('replay: the clock is the playhead’s own time, not its whole step’s (188.9 steps is 0.787 s, 0.79 to two places)', () => {
    useTape.setState({ mode: 'replay', playhead: 188.9 })
    expect(row()).toContain('t = 0.79 s · replay')
    useTape.setState({ playhead: 188 })
    expect(row()).toContain('t = 0.78 s · replay')
  })

  it('replay: Play shows Pause while the recording plays, not the engine', () => {
    useTape.setState({ mode: 'replay', playhead: 188, playing: true })
    expect(row()).toContain('title="Pause (Space or K)"')
    useTape.setState({ playing: false })
    useScene.getState().setPlaying(true)
    expect(row()).toContain('title="Play (Space or L)"')
  })

  it('replay: Undo and Redo are greyed and say why', () => {
    const { bodies, links, world } = useSandbox.getState()
    const snap = { bodies, links, world, actuators: [] }
    useSandbox.setState({ past: [snap], future: [snap] })
    const live = row()
    expect(live).toContain('title="Undo the last change to the objects (Ctrl+Z)"')
    expect(live).not.toMatch(/title="Undo[^"]*"[^>]*disabled/)
    useTape.setState({ mode: 'replay', playhead: 188 })
    const html = row()
    const sentence = 'Replaying t = 0.783 s. Branch from here to change something, or Back to live.'
    expect(html.split(`title="${sentence}"`).length - 1).toBe(2)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="Replaying t = 0\.783 s/)
    useSandbox.setState({ past: [], future: [] })
  })

  it('keeps its shape between live and replay: the same elements and classes, only text differs', () => {
    const shape = (html: string) =>
      html
        .replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>')
        .replace(/>[^<]*</g, '><')
        .replace(/ (title|style|aria-[a-z]+|disabled)="[^"]*"/g, '')
        .replace(/ disabled=""/g, '')
        .replace(/ ?invisible/g, '')
    const live = shape(row())
    useTape.setState({ mode: 'replay', playhead: 188 })
    expect(shape(row())).toBe(live)
  })
})

describe('the Timeline panel in the Sandbox follows the same tape', () => {
  const panel = () => {
    useApp.setState({ mode: 'sandbox' })
    return renderToStaticMarkup(createElement(Timeline))
  }

  it('shows the strip itself, and says paused or running for the engine in live', () => {
    const html = panel()
    expect(html).toContain('data-tape-strip')
    expect(html).toContain('paused')
    useScene.getState().setPlaying(true)
    expect(panel()).toContain('running')
  })

  it("in replay shows the playhead time and says replay, and the recording speed rather than the live slow motion", () => {
    useSandbox.setState({ world: { ...useSandbox.getState().world, timeScale: 0.5 } })
    expect(panel()).toContain("slow motion")
    useTape.setState({ mode: "replay", playhead: 188.9, speed: 0.1 })
    const html = panel()
    expect(html).toContain("t = 0.79 s")
    expect(html).toContain(">replay<")
    expect(html).toContain("replay speed ×0.1")
    useTape.setState({ speed: 1, playing: true })
    const full = panel()
    expect(full).toContain("replay, playing")
    expect(full).not.toContain("replay speed")
  })
})

describe("Simple view shows only the essential controls (SB65)", () => {
  const ariaLabels = (html: string): string[] => {
    const matches = [...html.matchAll(/aria-label="([^"]*)"/g)]
    return matches.map((m) => m[1])
  }

  it("All tools non-simple renders all controls", () => {
    useSandboxView.setState({ view: "all" })
    useTapeBar.setState({ more: true })
    const html = render()
    const labels = ariaLabels(html)
    expect(labels).toContain("To the start")
    expect(labels).toContain("Play backwards")
    expect(labels).toContain("Step back")
    expect(labels).toContain("Play")
    expect(labels).toContain("Step on")
    expect(labels).toContain("Play forwards")
    expect(labels).toContain("To the end")
    expect(labels).toContain("Bookmark")
    expect(labels).toContain("Loop start")
    expect(labels).toContain("Loop end")
    expect(html).toContain("×1<")
    expect(html).toContain("×½<")
    expect(html).toContain("×¼<")
    expect(html).toContain("×1/10<")
    expect(html).toContain("×1/100<")
    expect(html).toContain("Fine replay 1/600 s")
    expect(html).toContain("Branch from here")
  })

  it("Simple view shows only essential controls", () => {
    useSandboxView.setState({ view: "simple" })
    const html = render()
    const labels = ariaLabels(html)
    expect(labels).toContain("To the start")
    expect(labels).toContain("Step back")
    expect(labels).toContain("Play")
    expect(labels).toContain("Step on")
    // SB66: one slim row, no To the end, one speed button.
    expect(labels).not.toContain("To the end")
    expect(labels).not.toContain("Play backwards")
    expect(labels).not.toContain("Play forwards")
    expect(labels).not.toContain("Bookmark")
    expect(labels).not.toContain("Loop start")
    expect(labels).not.toContain("Loop end")
    expect(html).toContain("×1<")
    expect(html).not.toContain("×½<")
    expect(html).not.toContain("×¼<")
    expect(html).not.toContain("×1/10<")
    expect(html).not.toContain("×1/100<")
    expect(html).not.toContain("Fine replay 1/600 s")
    expect(html).not.toContain("Branch from here")
  })

  it("Simple view shows time without step number", () => {
    useSandboxView.setState({ view: "simple" })
    useTape.setState({ mode: "replay", playhead: 188 })
    const html = render()
    // SB66: two decimals, the app's number writer.
    expect(html).toContain(">t = 0.78 s<")
    expect(html).not.toContain("t = 0.783 s · step 188")
  })

  it("All tools view shows time with step number", () => {
    useSandboxView.setState({ view: "all" })
    useTape.setState({ mode: "replay", playhead: 188 })
    const html = render()
    expect(html).toContain("t = 0.783 s · step 188")
  })
})

// ---------------------------------------------------------------- SB66: the friendly replay bar (owner, Wed 14 Oct)
describe('SB66: the replay bar is hidden by default, a Replay pill opens it, Hide folds it, remembered', () => {
  const store = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
  }
  it('hidden unless the word shown is remembered; a broken storage means hidden', () => {
    const s = store()
    expect(readTapeBarShown(null)).toBe(false)
    expect(readTapeBarShown(s)).toBe(false)
    writeTapeBarShown(true, s)
    expect(s.m.get(TAPE_BAR_KEY)).toBe('shown')
    expect(readTapeBarShown(s)).toBe(true)
    writeTapeBarShown(false, s)
    expect(readTapeBarShown(s)).toBe(false)
    s.m.set(TAPE_BAR_KEY, 'garbled')
    expect(readTapeBarShown(s)).toBe(false)
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(readTapeBarShown(broken)).toBe(false)
    expect(() => writeTapeBarShown(true, broken)).not.toThrow()
  })

  it.each(['simple', 'all'] as const)('in %s view, hidden: only the pill, with its title; no bar', (view) => {
    useSandboxView.setState({ view })
    useTapeBar.setState({ shown: false })
    const html = render()
    expect(html).not.toContain('data-tape-strip')
    expect(html).toContain('data-tape-pill')
    expect(html).toContain('title="Show the replay bar"')
    expect(html).toContain('>Replay<')
  })

  it('hidden, a refused edit (a drag in a replay) still says why, beside the pill', () => {
    useTapeBar.setState({ shown: false })
    useTape.setState({ mode: 'replay', playhead: 100 })
    refuseEdit()
    const html = render()
    expect(html).toContain('data-tape-pill')
    expect(html).toContain('Branch from here to change something')
    useEditRefusal.setState({ sentence: null })
  })

  it('no pill and no bar before the first step of a run (nothing to replay yet)', () => {
    useTapeBar.setState({ shown: false })
    tapes.live = makeTape(1)
    expect(render()).toBe('')
  })

  it.each(['simple', 'all'] as const)('in %s view, shown: the bar has a Hide button', (view) => {
    useSandboxView.setState({ view })
    const html = render()
    expect(html).toContain('data-tape-strip')
    expect(html).toContain('aria-label="Hide the replay bar"')
    expect(html).not.toContain('data-tape-pill')
  })

  it('the simple bar is one slim row: start, step back, play, step on, the timeline, the time, one speed, Hide', () => {
    useSandboxView.setState({ view: 'simple' })
    const html = render()
    expect(html).toContain('data-tape-row="slim"')
    const order = ['To the start', 'Step back', 'Play', 'Step on', 'Position in the recording', 'Speed', 'Hide the replay bar']
    const at = order.map((name) => html.indexOf(`aria-label="${name}"`))
    expect(at.every((i) => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    // No note line and no second row in the slim bar.
    expect(html).not.toContain('min-h-[18px]')
  })

  it('BUGREC: the slim bar keeps its time in a box as wide as the widest time, so the timeline never changes width', () => {
    useSandboxView.setState({ view: 'simple' })
    const html = render()
    expect(html).toContain('data-tape-row="slim"')
    expect(html).toMatch(/class="invisible[^"]*"[^>]*aria-hidden="true">t = 888.89 s</)
  })

  it('the one speed button cycles ×1 → ×½ → ×¼ → ×1, and says the next', () => {
    expect(nextSimpleSpeed(1)).toBe(0.5)
    expect(nextSimpleSpeed(0.5)).toBe(0.25)
    expect(nextSimpleSpeed(0.25)).toBe(1)
    expect(nextSimpleSpeed(0.1)).toBe(1)
    useSandboxView.setState({ view: 'simple' })
    useTape.setState({ mode: 'replay', playhead: 100, speed: 0.5 })
    const html = render()
    expect(html).toContain('>×½<')
    expect(html).toMatch(/title="Half speed: press for a quarter of the speed"/)
  })

  it('All tools keeps every control as before when More is open', () => {
    useSandboxView.setState({ view: 'all' })
    useTapeBar.setState({ more: true })
    const html = render()
    for (const label of ['Play backwards', 'Play forwards', 'To the end', 'Bookmark', 'Loop start']) expect(html).toContain(`aria-label="${label}"`)
    expect(html).toContain('Fine replay 1/600 s')
  })
})

// ---------------------------------------------------------------- S5: All tools replay bar as one slim row (report 8.5)
describe('S5: All tools replay bar is a single row with extra tools behind More (report 8.5)', () => {
  it('All tools view defaults to a single slim row, avoiding the 2-row 12-button crowding', () => {
    useSandboxView.setState({ view: 'all' })
    useTapeBar.setState({ shown: true, more: false })
    const html = render()
    expect(html).toContain('data-tape-row="slim"')
    expect(html).toContain('aria-label="More replay tools"')
    expect(html).toContain('aria-expanded="false"')
    // When More is closed, the extra controls are not polluting the main bar
    expect(html).not.toContain('aria-label="Play backwards"')
    expect(html).not.toContain('aria-label="Bookmark"')
    expect(html).not.toContain('Fine replay 1/600 s')
  })

  it('Opening More reveals all extra controls behind the More button', () => {
    useSandboxView.setState({ view: 'all' })
    useTapeBar.setState({ shown: true, more: true })
    const html = render()
    expect(html).toContain('aria-label="More replay tools"')
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('aria-label="More replay controls"')
    for (const label of ['Play backwards', 'Play forwards', 'To the end', 'Bookmark', 'Loop start', 'Loop end']) {
      expect(html).toContain(`aria-label="${label}"`)
    }
    expect(html).toContain('Fine replay 1/600 s')
    expect(html).toContain('Branch from here')
    for (const s of ['×1<', '×½<', '×¼<', '×1/10<', '×1/100<']) {
      expect(html).toContain(s)
    }
  })

  it('Back to live and Clear loop appear in the More panel when applicable', () => {
    useSandboxView.setState({ view: 'all' })
    useTapeBar.setState({ shown: true, more: true })
    useTape.setState({ mode: 'replay', playhead: 100, loop: { a: 50, b: 200 } })
    const html = render()
    expect(html).toContain('Back to live')
    expect(html).toContain('Clear loop')
  })

  it('Hiding the replay bar resets more to false', () => {
    useTapeBar.setState({ shown: true, more: true })
    expect(useTapeBar.getState().more).toBe(true)
    useTapeBar.getState().setShown(false)
    expect(useTapeBar.getState().shown).toBe(false)
    expect(useTapeBar.getState().more).toBe(false)
  })

  it('Simple view never exposes the More button or More controls even if more state was true', () => {
    useSandboxView.setState({ view: 'simple' })
    useTapeBar.setState({ shown: true, more: true })
    const html = render()
    expect(html).not.toContain('aria-label="More replay tools"')
    expect(html).not.toContain('aria-label="More replay controls"')
  })
})


// The tape store (SB12, I-5): what the strip, the views, the graphs and the ledger read to show a
// recorded run — live, replayed, or fine-replayed — and the actions that move through it.
//
// 'live' is the engine running, or paused at the tape's end; the playhead is the end. Stepping back,
// scrubbing, going to the start or reversing enters 'replay' and pauses the engine; then play()
// plays the TAPE (the view's frame loop moves the playhead), and reaching an end stops there.
// backToLive() returns to the end. Fine replay shows the re-run at 600 steps a second ('fine').
// Replay is read-only: an edit is refused with `replayRefusal()` (sim/recorder.ts) until Branch
// from here or Back to live. Reset and a new scene start everything again (`useSandbox.runNonce`).

import { create } from 'zustand'
import { bindReplayView, branchAt, clearTapes, fineReplayAt, marksOf, onTapeChange, stepAtOrBefore, tapes, trimNote, type RunTape, type TapeChange } from './recorder'
import { useSandbox } from './store'
import { useScene } from '../core/store'
import { fmtLabel } from '../math/format'

export type TapeMode = 'live' | 'replay' | 'fine'
export type ReplaySpeed = 1 | 0.5 | 0.25 | 0.1 | 0.01

export interface TapeState {
  mode: TapeMode
  /** A fractional step on the shown tape (`shownTape()`): live, the end of the live tape. */
  playhead: number
  /** The TAPE is playing (replay or fine). Live, the engine's own Play is `useScene.playing`. */
  playing: boolean
  speed: ReplaySpeed
  direction: 1 | -1
  /** The shown tape's hits (`marksOf`), kept current as the run records. */
  marks: number[]
  /** Steps of the live tape, with the student's label. */
  bookmarks: { step: number; label: string }[]
  /** A stretch of the shown tape to play round and round, in steps (a ≤ b). */
  loop: { a: number; b: number } | null
  /** One sentence about the tape: the cap, a branch, a fine replay, a refusal. */
  note: string | null
  /** +1 whenever the shown tape changes (a step recorded, a new tape, a branch, a fine replay, the cap). */
  revision: number
  /** Replay or fine: plays the tape (from the far end again when it is at the end it plays towards). Live: plays the engine. */
  play(): void
  pause(): void
  /** Whole steps on the shown tape (−1 from live enters replay one step before the end; +1 live is the engine's job). */
  stepBy(n: number): void
  toStart(): void
  toEnd(): void
  scrubTo(step: number): void
  setSpeed(s: ReplaySpeed): void
  /** Flips the direction of play; from live it enters replay at the end first. */
  reverse(): void
  backToLive(): void
  branchHere(): void
  fineReplay(): void
  addBookmark(label?: string): void
  /** setLoop(null) clears; setLoop(a) keeps the loop's end (or the tape's); setLoop(a, b) sets both. */
  setLoop(a: number | null, b?: number): void
}

/** The tape on screen: the fine tape in 'fine' mode, else the live tape. */
export function shownTape(): RunTape | null {
  return useTape.getState().mode === 'fine' ? tapes.fine : tapes.live
}

const clampTo = (t: RunTape, p: number): number => Math.min(t.last, Math.max(t.first, p))

/** The live step at or before a moment of the fine tape (the same time), for a branch or a bookmark. */
function liveStepAt(fine: RunTape, p: number): number | null {
  const live = tapes.live
  if (!live || live.last < live.first) return null
  return stepAtOrBefore(live, fine.timeOf(p))
}

/** The live tape's marks as the recorder last reported them (kept for Back to live). */
let liveMarks: number[] = []

/** What a new run starts with (fresh lists each time: a list in the store is never shared with the next run). */
const fresh = () => ({
  mode: 'live' as TapeMode,
  playhead: 0,
  playing: false,
  direction: 1 as const,
  marks: [] as number[],
  bookmarks: [] as { step: number; label: string }[],
  loop: null,
  note: null
})

export const useTape = create<TapeState>((set, get) => {
  /** From live, replay starts at the end of the run and the engine stops. */
  const replayFrom = (): { mode: TapeMode; playhead: number } => {
    const s = get()
    if (s.mode !== 'live') return { mode: s.mode, playhead: s.playhead }
    useScene.getState().setPlaying(false)
    return { mode: 'replay', playhead: tapes.live?.last ?? 0 }
  }
  const bump = () => get().revision + 1

  return {
    ...fresh(),
    speed: 1,
    revision: 0,

    play: () => {
      const s = get()
      if (s.mode === 'live') {
        useScene.getState().setPlaying(true)
        return
      }
      const t = shownTape()
      if (!t) return
      let p = s.playhead
      if (s.direction === 1 && p >= t.last) p = t.first
      if (s.direction === -1 && p <= t.first) p = t.last
      set({ playing: true, playhead: p })
    },
    pause: () => {
      if (get().mode === 'live') useScene.getState().setPlaying(false)
      set({ playing: false })
    },
    stepBy: (n) => {
      const t = shownTape()
      if (!t || n === 0 || !Number.isFinite(n)) return
      if (get().mode === 'live' && n > 0) return
      const { mode, playhead } = replayFrom()
      const to = n > 0 ? Math.floor(playhead) + Math.trunc(n) : Math.ceil(playhead) + Math.trunc(n)
      set({ mode, playhead: clampTo(t, to), playing: false })
    },
    toStart: () => {
      const t = shownTape()
      if (!t) return
      const { mode } = replayFrom()
      set({ mode, playhead: t.first, playing: false })
    },
    toEnd: () => {
      const t = shownTape()
      if (!t || get().mode === 'live') return
      set({ playhead: t.last, playing: false })
    },
    scrubTo: (step) => {
      const t = shownTape()
      if (!t || !Number.isFinite(step)) return
      const { mode } = replayFrom()
      const p = clampTo(t, step)
      const s = get()
      // Playing into an end stops there (I-5: reaching the end in replay stops).
      const stop = (s.direction === 1 && p >= t.last) || (s.direction === -1 && p <= t.first)
      set({ mode, playhead: p, playing: s.playing && !stop })
    },
    setSpeed: (speed) => set({ speed }),
    reverse: () => {
      if (!shownTape()) return
      const { mode, playhead } = replayFrom()
      set({ mode, playhead, direction: get().direction === 1 ? -1 : 1 })
    },
    backToLive: () => {
      tapes.fine = null
      set({
        mode: 'live',
        playhead: tapes.live?.last ?? 0,
        playing: false,
        direction: 1,
        marks: liveMarks,
        note: trimNote(),
        revision: bump()
      })
    },
    branchHere: () => {
      const s = get()
      const at = s.mode === 'fine' && tapes.fine ? liveStepAt(tapes.fine, s.playhead) : Math.floor(s.playhead)
      if (at === null) return
      // On success the recorder's 'branched' change sets the mode, the playhead and the note.
      const r = branchAt(at)
      if (!r.ok) set({ note: r.note })
    },
    fineReplay: () => {
      const s = get()
      const at = s.mode === 'fine' && tapes.fine ? liveStepAt(tapes.fine, s.playhead) : Math.floor(s.playhead)
      if (at === null) return
      if (s.mode === 'live') useScene.getState().setPlaying(false)
      const r = fineReplayAt(at)
      if (!r.ok) set({ note: r.note })
    },
    addBookmark: (label) => {
      const s = get()
      const live = tapes.live
      if (!live || live.last < live.first) return
      const step = s.mode === 'fine' && tapes.fine ? liveStepAt(tapes.fine, s.playhead) : Math.min(live.last, Math.max(live.first, Math.floor(s.playhead)))
      if (step === null || s.bookmarks.some((b) => b.step === step)) return
      const text = label?.trim() || `t = ${fmtLabel(live.timeOf(step), 3)} s`
      set({ bookmarks: [...s.bookmarks, { step, label: text }].sort((x, y) => x.step - y.step) })
    },
    setLoop: (a, b) => {
      if (a === null || !Number.isFinite(a)) {
        set({ loop: null })
        return
      }
      const t = shownTape()
      const end = b ?? get().loop?.b ?? t?.last ?? a
      if (!Number.isFinite(end)) return
      set({ loop: { a: Math.min(a, end), b: Math.max(a, end) } })
    }
  }
})

/** What the recorder's changes do to what is shown. */
function heard(c: TapeChange): void {
  const s = useTape.getState()
  const live = tapes.live
  switch (c.kind) {
    case 'grew': {
      if (c.marks) liveMarks = [...c.marks]
      const marks = c.marks && s.mode !== 'fine' ? liveMarks : s.marks
      if (s.mode === 'live') useTape.setState({ playhead: live?.last ?? 0, marks, revision: s.revision + 1 })
      else if (s.mode === 'replay') useTape.setState({ marks, revision: s.revision + 1 })
      return
    }
    case 'new':
      liveMarks = []
      tapes.fine = null
      useTape.setState({ ...fresh(), playhead: live?.last ?? 0, revision: s.revision + 1 })
      return
    case 'trimmed': {
      liveMarks = [...c.marks]
      const first = live?.first ?? 0
      const loop = s.loop && s.mode !== 'fine' && s.loop.a < first ? null : s.loop
      const playhead = s.mode === 'replay' && live ? Math.max(first, s.playhead) : s.playhead
      useTape.setState({
        note: c.note,
        marks: s.mode === 'fine' ? s.marks : liveMarks,
        bookmarks: s.bookmarks.filter((b) => b.step >= first),
        loop,
        playhead,
        revision: s.revision + 1
      })
      return
    }
    case 'cleared':
      liveMarks = []
      useTape.setState({ ...fresh(), revision: s.revision + 1 })
      return
    case 'branched':
      liveMarks = [...c.marks]
      useTape.setState({
        mode: 'live',
        playhead: c.step,
        playing: false,
        direction: 1,
        marks: liveMarks,
        // A bookmark or a loop on the old run past the branch is about a run that no longer happens.
        bookmarks: s.bookmarks.filter((b) => b.step <= c.step),
        loop: s.loop && s.loop.b > c.step ? null : s.loop,
        note: c.note,
        revision: s.revision + 1
      })
      return
    case 'fine':
      useTape.setState({
        mode: 'fine',
        playhead: c.playhead,
        playing: false,
        direction: 1,
        marks: tapes.fine ? marksOf(tapes.fine) : [],
        loop: null,
        note: c.note,
        revision: s.revision + 1
      })
  }
}

onTapeChange(heard)

bindReplayView(() => {
  const s = useTape.getState()
  const t = shownTape()
  return { replaying: s.mode !== 'live', time: t ? t.timeOf(s.playhead) : 0 }
})

// Reset and a new scene are a new run: the old tape describes objects and a clock that are gone.
useSandbox.subscribe((now, before) => {
  if (now.runNonce !== before.runNonce) clearTapes()
})

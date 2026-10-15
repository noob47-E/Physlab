// What the transport buttons, the tape strip and the keys do, in one place (SB17). The Sandbox is in one of three modes (the
// tape store, I-5): LIVE (the engine runs, or waits at the end of the recording), REPLAY (the recording is shown and the
// engine waits) and FINE (a 1/600 s re-run of one second is shown). The same button means one thing in each: Play plays the
// engine in live and the recording in replay; Step on steps the engine in live and moves the playhead one step in replay.
// A panel button, a strip button and a key all call the functions here, so they cannot disagree.

import { create } from 'zustand'
import { useScene } from '../core/store'
import { useSandbox } from './store'
import { presetById, type Preset } from './presets'
import { stepOneFrame, stepButtonTitle } from './stepping'
import { replayRefusal } from './recorder'
import { shownTape, useTape, type ReplaySpeed, type TapeMode } from './tapeStore'

/** The speeds the strip offers, fastest first. In live they are the Sandbox's slow motion; in replay, the recording's speed. */
export const SPEEDS: readonly ReplaySpeed[] = [1, 0.5, 0.25, 0.1, 0.01]

const isSpeed = (v: number): v is ReplaySpeed => (SPEEDS as readonly number[]).includes(v)

/** Where the playhead is on the recording and what the buttons may do from there. Plain numbers, so it can be tested. */
interface TransportInput {
  mode: TapeMode
  /** The shown tape's first and last step; null before the first step of a run. */
  tape: { first: number; last: number; rate: number } | null
  /** The playhead in replay (fractional); in live the head is the tape's last step. */
  playhead: number
  scenePlaying: boolean
  tapePlaying: boolean
}

export interface TransportFlags {
  mode: TapeMode
  /** At least one step recorded: the strip shows. */
  hasRun: boolean
  /** The step the head is on (a whole step), or null with no run. */
  head: number | null
  /** Where the playhead is, to the fraction of a step (a replay playing slowly sits between two steps), kept on the recording; null with no run. */
  at: number | null
  playing: boolean
  canStart: boolean
  canBack: boolean
  canEnd: boolean
  /** A reason, or null when Fine replay may be pressed. */
  fineWhy: string | null
  /** A reason, or null when Branch from here may be pressed. */
  branchWhy: string | null
}

/** The fast re-run runs at this many steps a second (the recorder's own constant). */
const FINE_RATE = 600

export function transportFlags(i: TransportInput): TransportFlags {
  const t = i.tape && i.tape.last > i.tape.first ? i.tape : null
  const at = t ? (i.mode === 'live' ? t.last : Math.min(t.last, Math.max(t.first, i.playhead))) : null
  const head = t && at !== null ? Math.min(t.last, Math.max(t.first, Math.floor(at + 1e-9))) : null
  const playing = i.mode === 'live' ? i.scenePlaying : i.tapePlaying
  const here = head !== null && t !== null
  let fineWhy: string | null = null
  if (!here) fineWhy = 'Nothing is recorded yet. Press Play first.'
  else if (i.mode === 'fine') fineWhy = 'This already is the fast re-run. Back to live to leave it.'
  else if (i.mode === 'live') fineWhy = 'Step back or click the bar to a moment first, then re-run it finely.'
  else if (t!.rate >= FINE_RATE) fineWhy = 'This recording already has a step every 1/600 s.'
  let branchWhy: string | null = null
  if (!here) branchWhy = 'Nothing is recorded yet. Press Play first.'
  else if (i.mode === 'live') branchWhy = 'Step back or click the bar to a moment first, then branch from it.'
  return {
    mode: i.mode,
    hasRun: here,
    head,
    at,
    playing,
    // By the playhead itself, not its whole step (0j2): a slow replay sits between steps 0 and 1 for a while, and To the
    // start was greyed out all that time.
    canStart: here && at! > t!.first,
    canBack: here && at! > t!.first,
    canEnd: here && i.mode !== 'live' && at! < t!.last,
    fineWhy,
    branchWhy
  }
}

/** Reads the stores into a TransportInput. */
function transportInput(): TransportInput {
  const s = useTape.getState()
  const t = shownTape()
  return {
    mode: s.mode,
    tape: t && t.last >= t.first ? { first: t.first, last: t.last, rate: t.rate } : null,
    playhead: s.playhead,
    scenePlaying: useScene.getState().playing,
    tapePlaying: s.playing
  }
}

export const flagsNow = (): TransportFlags => transportFlags(transportInput())

/** The flags as a hook, so a panel or the strip draws again when the mode, the playhead, a play state or the recording's length changes. */
export function useTransportFlags(): TransportFlags {
  // The recording grows without the store's own fields changing: its revision says so.
  useTape((s) => s.revision)
  const mode = useTape((s) => s.mode)
  const playhead = useTape((s) => s.playhead)
  const tapePlaying = useTape((s) => s.playing)
  const scenePlaying = useScene((s) => s.playing)
  const t = shownTape()
  return transportFlags({ mode, tape: t && t.last >= t.first ? { first: t.first, last: t.last, rate: t.rate } : null, playhead, scenePlaying, tapePlaying })
}

/** True while something is playing: the engine in live, the recording in replay and fine. */
export const isPlaying = (): boolean => flagsNow().playing

/** Entering replay from live carries the Sandbox's slow motion over, so J at ×0.1 runs backwards at ×0.1. */
function carrySlowMotion(): void {
  if (useTape.getState().mode !== 'live') return
  const ts = useSandbox.getState().world.timeScale
  if (isSpeed(ts) && ts !== useTape.getState().speed) useTape.getState().setSpeed(ts)
}

/**
 * Opens a ready-made experiment the one way every door takes (a tile, a list row, Start here; a question's "Show it" makes
 * the same two calls): the run is paused first, or a running simulation carried its speed into the new scene before the
 * student pressed the Play the experiment asks for. An unknown id changes nothing and says so with false.
 */
export function loadExperiment(id: Preset['id']): boolean {
  if (useTape.getState().mode !== 'live') return false
  if (!presetById(id)) return false
  useScene.getState().setPlaying(false)
  return useSandbox.getState().loadPreset(id)
}

/** Space, and the play button: pause what is playing, else play forwards. */
export function togglePlay(): void {
  if (isPlaying()) pause()
  else play()
}

/** L, and the forward play button: play forwards (the engine in live; the recording in replay, which starts again from the start when it is at the end). */
export function play(): void {
  const s = useTape.getState()
  if (s.mode === 'live') {
    useScene.getState().setPlaying(true)
    return
  }
  if (s.direction === -1) s.reverse()
  useTape.getState().play()
}

/** K, and the pause half of the play button. */
export function pause(): void {
  if (useTape.getState().mode === 'live') useScene.getState().setPlaying(false)
  else useTape.getState().pause()
}

/** J: play the recording backwards from here. Nothing happens at its start, or before anything is recorded. */
export function playBackwards(): void {
  const f = flagsNow()
  if (!f.canBack) return
  carrySlowMotion()
  useScene.getState().setPlaying(false)
  if (useTape.getState().direction !== -1) useTape.getState().reverse()
  useTape.getState().play()
}

/** Comma: one step back. From a live run (playing or waiting at its end) this enters replay; at the start nothing happens. */
export function stepBack(): void {
  if (!flagsNow().canBack) return
  carrySlowMotion()
  useScene.getState().setPlaying(false)
  useTape.getState().pause()
  useTape.getState().stepBy(-1)
}

/** Full stop and the Step button: one step on. Live steps the engine (the run goes on); replay moves the playhead one step and stops at the end. */
export function stepForward(): void {
  const s = useTape.getState()
  if (s.mode === 'live' || !flagsNow().hasRun) {
    useScene.getState().setPlaying(false)
    stepOneFrame()
    return
  }
  s.pause()
  useTape.getState().stepBy(1)
}

/** The start button. */
export function toStart(): void {
  if (!flagsNow().canStart) return
  carrySlowMotion()
  useScene.getState().setPlaying(false)
  useTape.getState().pause()
  useTape.getState().toStart()
}

/** The end button: the playhead goes to the end of the recording. Live is already there. */
export function toEnd(): void {
  if (!flagsNow().canEnd) return
  useTape.getState().pause()
  useTape.getState().toEnd()
}

/** Click or drag on the bar: the playhead goes to this step (the tape store keeps it on the recording). */
export function scrubTo(step: number): void {
  if (!flagsNow().hasRun) return
  carrySlowMotion()
  useScene.getState().setPlaying(false)
  useTape.getState().pause()
  useTape.getState().scrubTo(step)
}

/** The speed now in force: the Sandbox's slow motion in live, the recording's speed in replay. */
export function speedNow(): number {
  return useTape.getState().mode === 'live' ? useSandbox.getState().world.timeScale : useTape.getState().speed
}

/** A speed button. */
export function chooseSpeed(speed: ReplaySpeed): void {
  if (useTape.getState().mode === 'live') useSandbox.getState().setWorld({ timeScale: speed })
  useTape.getState().setSpeed(speed)
}

/** The next speed along ×1, ½, ¼, 1/10, 1/100, and back to ×1. */
export function cycleSpeed(): void {
  const at = SPEEDS.findIndex((v) => v === speedNow())
  chooseSpeed(SPEEDS[(at + 1) % SPEEDS.length])
}

/** B: the run continues from this moment, so something can be changed. Only from a replayed moment (a moment of the fast re-run too: it branches the run at that time). */
export function branchFromHere(): void {
  if (flagsNow().branchWhy !== null) return
  useScene.getState().setPlaying(false)
  useTape.getState().pause()
  useTape.getState().branchHere()
}

/** The fast re-run of the second around this moment. */
export function fineReplay(): void {
  if (flagsNow().fineWhy !== null) return
  useTape.getState().pause()
  useTape.getState().fineReplay()
}

/** Back to the end of the recording, with the engine running from there again. */
export function backToLive(): void {
  if (useTape.getState().mode === 'live') return
  useTape.getState().backToLive()
}

/** The Step button's tooltip: the engine step, in the rate in force, and its key. */
export const stepOnTitle = (rateText: string): string => `${stepButtonTitle(rateText)} (full stop key)`

/**
 * Where a loop's two ends go when the student sets one at the head: "[" sets the start (the end stays, else the recording's end),
 * "]" sets the end (the start stays, else the recording's start). A loop needs room: null when the head is already at the far
 * end it would have to reach (nothing to loop), so a loop is never a single step.
 */
export function nextLoop(which: 'a' | 'b', head: number, loop: { a: number; b: number } | null, first: number, last: number): { a: number; b: number } | null {
  if (which === 'a') {
    const b = loop && loop.b > head ? loop.b : last
    return head < b ? { a: head, b } : null
  }
  const a = loop && loop.a < head ? loop.a : first
  return a < head ? { a, b: head } : null
}

function loopAt(which: 'a' | 'b'): void {
  // A loop belongs to the live recording; the fast re-run has other step numbers (the A and B buttons are greyed there too).
  if (useTape.getState().mode === 'fine') return
  const f = flagsNow()
  const t = shownTape()
  if (!f.hasRun || f.head === null || !t) return
  const next = nextLoop(which, f.head, useTape.getState().loop, t.first, t.last)
  if (next) useTape.getState().setLoop(next.a, next.b)
}

/** "[": the loop starts here. */
export const loopStart = (): void => loopAt('a')

/** "]": the loop ends here. */
export const loopEnd = (): void => loopAt('b')

/** Stops looping. */
export const clearLoop = (): void => useTape.getState().setLoop(null)

/** M: a bookmark at the moment on screen. */
export function bookmarkHere(): void {
  if (flagsNow().hasRun) useTape.getState().addBookmark()
}

// ---------------------------------------------------------------------------------------------------------------------------
// D5: replay is read-only. An edit asked for while a recording is shown (Ctrl+Z, Ctrl+Y, Edit > Undo) is refused with the
// recorder's sentence; the panel's edit controls are locked (panels/sandbox/ReplayLock.tsx). Branch from here or Back to live
// gives editing back.

/** How long (ms) a refused edit's sentence stays in the strip's note line. */
export const REFUSAL_MS = 4000

/** The sentence of the last refused edit, for the strip's note line; null when none is showing. */
export const useEditRefusal = create<{ sentence: string | null }>(() => ({ sentence: null }))

let clearTimer: ReturnType<typeof setTimeout> | null = null

function forgetRefusal(): void {
  if (clearTimer !== null) clearTimeout(clearTimer)
  clearTimer = null
  useEditRefusal.setState({ sentence: null })
}

// Leaving replay (Back to live, Branch from here) gives editing back, so the sentence goes with it.
useTape.subscribe((now, before) => {
  if (now.mode !== before.mode && now.mode === 'live') forgetRefusal()
})

/**
 * True when the edit must not happen: a recording is on screen. The sentence (`replayRefusal()`) is shown in the strip's note for
 * a few seconds, so a key press that does nothing says why. False (and nothing shown) when live.
 */
export function refuseEdit(): boolean {
  const why = replayRefusal()
  if (why === null) return false
  if (clearTimer !== null) clearTimeout(clearTimer)
  useEditRefusal.setState({ sentence: why })
  clearTimer = setTimeout(forgetRefusal, REFUSAL_MS)
  return true
}

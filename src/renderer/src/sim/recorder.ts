// The recorder (SB12, I-5): every engine step of a run goes on the tape, so the run can be replayed
// like a video, re-run finer, and branched.
//
// What a tape holds (sim/tape.ts): one record per engine step (every body and rope link: position,
// rotation, velocity, spin, float32), the work PhysLab's own forces did in it, and its contacts and
// touches. Its first record is the run's untouched start, read just before the first step. Its
// keyframes (SB9) let any moment be worked out again exactly: one at the start, one every second,
// and one after the first step that follows any outside change (a grab, an edit, a push), so a
// re-run from a keyframe never crosses a change it cannot repeat. A tape belongs to one build of the
// world at one rate: a rebuild (Reset, a body or a link added or removed) or a new rate starts a new
// one. docs/knowledge/sandbox-tape.md has the rules and the traps.

import type { SimWorld } from './world'
import { REC_FLOATS, Tape, WORK_FLOATS } from './tape'
import type { AfterStep, BodyDef, ContactEvent, Keyframe, Touch, WorldSettings } from './types'
import { useSandbox } from './store'
import { fmtLabel } from '../math/format'

/**
 * Floats per touch in a step's pack: the two bodies' places in the tape's `layout.bodies`, the
 * engine's normal (from the first to the second), the first contact point, and 1 for a contact
 * found that step (0 for one carried on). Twenty bodies at rest on a floor and on each other touch
 * about thirty times a step; as objects that was some 7000 a second for the heap to keep (and the
 * collector to walk) on a 4-minute tape, packed it is one small array a step.
 */
export const TOUCH_FLOATS = 9

/** A step's touches, packed (TOUCH_FLOATS each); `touchesAt` reads them back. */
export interface TouchPack {
  touches: Float32Array
}

/** What a tape keeps for each step besides its record: the collisions the engine found, and the step's touches. */
export type TapeEvent = ContactEvent | TouchPack

export type RunTape = Tape<Keyframe, TapeEvent>

/** A collision (with its speeds and normal), as opposed to the pack of touches. */
export const isContact = (e: TapeEvent): e is ContactEvent => 'approachSpeed' in e

/**
 * Every touch of a step on a tape, as the engine handed them (I-1 `Touch`): for a free-body diagram
 * or the heat kit while replaying. The numbers are the engine's own float32 values, unchanged.
 */
export function touchesAt(tape: RunTape, step: number): Touch[] {
  const out: Touch[] = []
  const ids = tape.layout.bodies
  for (const e of tape.events(step)) {
    if (isContact(e)) continue
    const f = e.touches
    for (let i = 0; i + TOUCH_FLOATS <= f.length; i += TOUCH_FLOATS) {
      const a = ids[f[i]]
      const b = ids[f[i + 1]]
      if (a === undefined || b === undefined) continue
      out.push({ a, b, normal: [f[i + 2], f[i + 3], f[i + 4]], point: [f[i + 5], f[i + 6], f[i + 7]], added: f[i + 8] === 1 })
    }
  }
  return out
}

/**
 * The tapes (I-5). `live`: the run as it happened, keyframes and all. `fine`: Fine replay's re-run
 * at 600 steps a second (no keyframes). `parent`: after "Branch from here", the old run from the
 * branch step on (no keyframes; before that step it is the live tape), for the ghost.
 */
export const tapes: { live: RunTape | null; fine: RunTape | null; parent: { tape: RunTape; step: number } | null } = {
  live: null,
  fine: null,
  parent: null
}

/** What the tape store hears from the recorder (sim/tapeStore.ts is the one listener). */
export type TapeChange =
  /** A step went on the live tape; `marks` is the live tape's marks when they changed, else null. */
  | { kind: 'grew'; marks: readonly number[] | null }
  /** A new live tape (a rebuild, a new rate, a run the tape lost track of). */
  | { kind: 'new' }
  /** The cap dropped the oldest second(s); the note says how much is kept. */
  | { kind: 'trimmed'; note: string; marks: readonly number[] }
  /** No tape at all (Reset, a new scene, the recorder stopped). */
  | { kind: 'cleared' }
  | { kind: 'branched'; step: number; note: string; marks: readonly number[] }
  /** Fine replay made `tapes.fine`; `playhead` is the chosen moment on it. */
  | { kind: 'fine'; playhead: number; note: string }

/** 64 MiB (owner decision D6): about 4.5 minutes of 20 bodies at 240 steps a second. */
const DEFAULT_CAP = 64 * 2 ** 20
/** A contact closing faster than this (m/s) is a hit worth a mark on the strip; slower is a body settling. */
const MARK_SPEED = 0.05
/** Fine replay's step rate and how far it re-runs (s). */
const FINE_RATE = 600
const FINE_SECONDS = 1
/** The engine's clock counts ticks of 1/1200 s (world.ts): every rate's steps are whole ticks. */
const TICKS = 1200
const tickOf = (t: number): number => Math.round(t * TICKS)

let world: SimWorld | null = null
let unhook: (() => void) | null = null
/** How many times the recorder was started: its stop handles go stale when a newer start takes over. */
let starts = 0
let cap = DEFAULT_CAP
/** The live tape's first step: its keyframes and chunks fall every `rate` steps from here. */
let tapeStart = 0
/** The build of the world (rebuildSerial) the live tape belongs to. */
let build = -1
/** The world's inputSerial already covered by a keyframe; a different one means "keyframe after the next step". */
let lastInput = 0
/** Steps of the live tape's keyframes taken after an outside change: a re-run must stop before each one. */
const inputSteps = new Set<number>()
let marks: number[] = []
let trimmedNote: string | null = null
/** Set while the recorder itself re-runs the world (a branch, Fine replay): those steps are not the live run. */
let busy: { capture: ((s: AfterStep) => void) | null } | null = null
const listeners = new Set<(c: TapeChange) => void>()
let record = new Float32Array(0)
const work = new Float32Array(WORK_FLOATS)
const scratch: TapeEvent[] = []
/** Each body's place in the live tape's layout, for packing touches. */
let places = new Map<string, number>()
/** The live tape's touch packs, in bytes: the tape counts every event as 64 bytes, and a pack holds more. */
let packBytes = 0
/** The bytes of the touch pack `eventsOf` made last (0 when the step had no touch). */
let lastPack = 0

const emit = (c: TapeChange): void => {
  for (const fn of listeners) fn(c)
}

/** The tape store listens here (one-way: this module never imports the store that shows it). */
export function onTapeChange(fn: (c: TapeChange) => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/**
 * Starts recording `w`: from its next step on, every step goes on `tapes.live`. One recorder at a
 * time; starting it again for the same world keeps its tape (a view mounted twice), for another
 * world it moves there. `opts.capBytes` replaces the 64 MiB cap (the tests use a tiny one). Hands
 * back the way to stop, which frees every keyframe the tape holds — so start it once, with the
 * engine (which outlives the view), not with each mount of the view.
 */
export function startRecorder(w: SimWorld, opts: { capBytes?: number } = {}): () => void {
  // Only the latest start's stop stops it: an older handle (a view mounted twice) must not clear
  // the tape the newer one is keeping.
  const mine = ++starts
  const stop = (): void => {
    if (world === w && starts === mine) stopRecorder()
  }
  if (world !== w) {
    stopRecorder()
    world = w
  }
  // Listened to afresh every time: `SimWorld.create` (a new scene) drops every listener, and the
  // world is the one engine the app has, so the same world can come back without them.
  unhook?.()
  cap = opts.capBytes ?? DEFAULT_CAP
  const offBefore = w.onBeforeStep(beforeStep)
  const offAfter = w.onAfterStep(afterStep)
  unhook = () => {
    offBefore()
    offAfter()
  }
  return stop
}

function stopRecorder(): void {
  unhook?.()
  unhook = null
  clearTapes()
  world = null
}

/**
 * Forgets every tape and frees the live tape's keyframes (Reset and a new scene, through the tape
 * store). The next step of the world starts a new tape from where it then is.
 */
export function clearTapes(): void {
  dropLive()
  emit({ kind: 'cleared' })
}

function dropLive(): void {
  const t = tapes.live
  if (t && t.last >= t.first) t.truncateAfter(t.first - 1, free)
  tapes.live = null
  tapes.fine = null
  tapes.parent = null
  inputSteps.clear()
  marks = []
  trimmedNote = null
  packBytes = 0
}

const free = (k: Keyframe): void => world?.freeKeyframe(k)

/** True while the recorder re-runs the world for a branch or Fine replay: an after-step listener elsewhere can ignore those steps. */
export function rerunning(): boolean {
  return busy !== null
}

/** Just before an engine step: a tape that no longer matches the world gives way to a new one from here. */
function beforeStep(w: SimWorld): void {
  if (busy) return
  const t = tapes.live
  if (t && build === w.rebuildSerial && t.rate === w.stepRate && t.last === w.stepIndex) return
  newTape(w)
}

/** A new live tape whose first record and keyframe are the world as it is now, before the step. */
function newTape(w: SimWorld): void {
  dropLive()
  const t: RunTape = new Tape(w.recordLayout(), w.stepRate, w.stepIndex, w.time, cap)
  record = new Float32Array(t.bodyCount * REC_FLOATS)
  places = new Map(t.layout.bodies.map((id, i) => [id, i]))
  w.readRecord(record)
  // Nothing has happened yet: no work, no events.
  t.push(w.stepIndex, record)
  t.addKeyframe(w.stepIndex, w.saveKeyframe())
  tapes.live = t
  tapeStart = w.stepIndex
  build = w.rebuildSerial
  lastInput = w.inputSerial
  emit({ kind: 'new' })
}

/** After an engine step: its record, work and events, the keyframes due, the marks, the cap. */
function afterStep(w: SimWorld, s: AfterStep): void {
  if (busy) {
    busy.capture?.(s)
    return
  }
  const t = tapes.live
  // The step before this one primed the tape (beforeStep); anything else waits for the next step.
  if (!t || s.step !== t.last + 1 || build !== w.rebuildSerial) return
  w.readRecord(record)
  t.push(s.step, record, workOf(s), eventsOf(s))
  packBytes += lastPack
  const second = (s.step - tapeStart) % t.rate === 0
  if (w.inputSerial !== lastInput) {
    // The change happened before this step: from the keyframe here on, a re-run meets no change.
    t.addKeyframe(s.step, w.saveKeyframe())
    inputSteps.add(s.step)
    lastInput = w.inputSerial
  } else if (second) t.addKeyframe(s.step, w.saveKeyframe())
  let marked = false
  for (const c of s.contacts) {
    if (isMark(c) && marks[marks.length - 1] !== s.step) {
      marks.push(s.step)
      marked = true
    }
  }
  // Once a second, when a new one-second chunk has just begun: `bytes` walks the whole tape.
  if (second && sizeOf(t) > t.capBytes) trim(t, s.step)
  emit({ kind: 'grew', marks: marked ? marks : null })
}

function workOf(s: AfterStep): Float32Array {
  work[0] = s.work.drag
  work[1] = s.work.rolling
  work[2] = s.work.push
  work[3] = s.work.hand
  work[4] = s.work.damper
  return work
}

/** The step's contacts and then its touches in one pack, in a reused list (the tape copies it), or nothing. */
function eventsOf(s: AfterStep): TapeEvent[] | undefined {
  lastPack = 0
  if (s.contacts.length === 0 && s.touches.length === 0) return undefined
  scratch.length = 0
  for (const c of s.contacts) scratch.push(c)
  const kept = s.touches.filter((x) => places.has(x.a) && places.has(x.b))
  if (kept.length > 0) {
    const f = new Float32Array(kept.length * TOUCH_FLOATS)
    kept.forEach((x, i) => {
      const o = i * TOUCH_FLOATS
      f[o] = places.get(x.a)!
      f[o + 1] = places.get(x.b)!
      f.set(x.normal, o + 2)
      f.set(x.point, o + 5)
      f[o + 8] = x.added ? 1 : 0
    })
    scratch.push({ touches: f })
    lastPack = f.byteLength
  }
  return scratch.length > 0 ? scratch : undefined
}

/** The touch packs' own bytes between two steps of a tape. */
function packBytesIn(t: RunTape, from: number, to: number): number {
  let b = 0
  for (const { e } of t.eventsIn(from, to)) if (!isContact(e)) b += e.touches.byteLength
  return b
}

/** The live tape's size as the cap judges it: the tape's own count and the touch packs' numbers. */
const sizeOf = (t: RunTape): number => t.bytes + packBytes

const speed = (v: readonly number[]): number => Math.hypot(v[0], v[1], v[2])

/** A hit: two bodies closing faster than MARK_SPEED, one of them moving. */
const isMark = (c: ContactEvent): boolean => c.approachSpeed > MARK_SPEED && (speed(c.vBeforeA) > 0 || speed(c.vBeforeB) > 0)

/**
 * The steps of a tape's hits (I-5): contacts closing faster than 0.05 m/s on a moving body, one
 * mark per step, in order. The strip draws them; stopping on one shows the bounce.
 */
export function marksOf(tape: RunTape): number[] {
  const out: number[] = []
  if (tape.last < tape.first) return out
  for (const { step, e } of tape.eventsIn(tape.first, tape.last)) {
    if (isContact(e) && isMark(e) && out[out.length - 1] !== step) out.push(step)
  }
  return out
}

/** Drops whole seconds from the front until the tape fits its cap again (never the chunk just begun). */
function trim(t: RunTape, newest: number): void {
  while (sizeOf(t) > t.capBytes && t.first < newest) {
    packBytes -= packBytesIn(t, t.first, t.first + t.rate - 1)
    t.dropOldestChunk(free)
  }
  for (const step of inputSteps) if (step < t.first) inputSteps.delete(step)
  marks = marks.filter((m) => m >= t.first)
  trimmedNote = `The recording keeps the last ${durationWords((t.last - t.first) / t.rate)}; older parts were dropped.`
  emit({ kind: 'trimmed', note: trimmedNote, marks })
}

/** The cap's note, while the live tape has lost its start to the cap; else null. */
export function trimNote(): string | null {
  return trimmedNote
}

/** "45 s", "4 min 28 s", "1 h 5 min": whole seconds, each number through the app's writer. */
export function durationWords(seconds: number): string {
  const all = Math.max(0, Math.round(seconds))
  const h = Math.floor(all / 3600)
  const m = Math.floor((all % 3600) / 60)
  const s = all % 60
  const parts: string[] = []
  if (h > 0) parts.push(`${fmtLabel(h, 0)} h`)
  if (m > 0) parts.push(`${fmtLabel(m, 0)} min`)
  if (s > 0 || parts.length === 0) parts.push(`${fmtLabel(s, 0)} s`)
  return parts.join(' ')
}

const timeText = (t: number): string => fmtLabel(t, 3)

/**
 * A tape's step at or before a moment of the clock, on the tape. Worked out in the clock's own
 * ticks (whole numbers), because (t − t₀) × rate in doubles can land a hair under a whole step and
 * floor to the step before (another tape at another rate, the ghost at the same time).
 */
export function stepAtOrBefore(tape: RunTape, time: number): number {
  const steps = Math.floor((ticksAtOrBefore(time) - tickOf(tape.timeOf(tape.first))) / (TICKS / tape.rate))
  return Math.min(tape.last, Math.max(tape.first, tape.first + steps))
}

/**
 * The clock's whole ticks at or before a time: a time that is a tick but for the doubles' last
 * digits counts as that tick, anything else is floored. Rounding instead put a fine-replay moment
 * half a tick before a 1/240 s step onto that step, one step after the moment shown.
 */
function ticksAtOrBefore(time: number): number {
  const ticks = time * TICKS
  const near = Math.round(ticks)
  // Relative: a time worked out from steps and ticks is off its tick by a few parts in 10¹⁶, while a
  // moment between ticks (a fractional playhead) is off by a part in 10⁶ at least, even after hours.
  return Math.abs(ticks - near) <= 1e-9 * Math.max(1, Math.abs(near)) ? near : Math.floor(ticks)
}

/**
 * Runs the world from the keyframe at or before `step` up to `step`, with the recorder standing
 * aside. There is no outside change in between (a keyframe follows every one), so the world comes
 * back exactly as the tape has it.
 */
function rerunTo(w: SimWorld, t: RunTape, step: number): boolean {
  const k = t.keyframeAtOrBefore(step)
  if (!k || !w.restoreKeyframe(k.key)) return false
  busy = { capture: null }
  try {
    while (w.stepIndex < step) w.stepOnce()
  } finally {
    busy = null
  }
  return w.stepIndex === step
}

/** Whether the world's record now is the tape's at `step`, every float. */
function matchesTape(w: SimWorld, t: RunTape, step: number): boolean {
  const want = t.record(step)
  if (!want) return false
  const now = new Float32Array(want.length)
  w.readRecord(now)
  return now.every((v, i) => Object.is(v, want[i]))
}

/**
 * The record at `step` worked out again from its keyframe, with the world put back where it was
 * afterwards (the proof "Branch from here" rests on: it must equal `tapes.live.record(step)` bit for
 * bit). Null when there is no such step on the tape.
 */
export function rerunRecord(step: number): Float32Array | null {
  const w = world
  const t = tapes.live
  if (!w || !t || busy || !Number.isInteger(step) || step < t.first || step > t.last) return null
  const was = lastInput
  const pending = w.inputSerial !== lastInput
  const now = w.saveKeyframe()
  let out: Float32Array | null = null
  if (rerunTo(w, t, step)) {
    out = new Float32Array(t.bodyCount * REC_FLOATS)
    w.readRecord(out)
  }
  w.restoreKeyframe(now)
  w.freeKeyframe(now)
  // A change made at the end of the run before this re-run still needs its keyframe on the next step.
  lastInput = pending ? was : w.inputSerial
  return out
}

/**
 * "Branch from here" (I-5): the run goes on from `step` instead of from its end. The world is put
 * back to that step exactly (keyframe + re-run), the old run from there on is kept as
 * `tapes.parent` (for the ghost), the live tape loses everything after `step`, and the Sandbox's
 * store takes the bodies, settings and readings of that moment, so edits are allowed again and act
 * from here.
 */
export function branchAt(step: number): { ok: boolean; note: string } {
  const w = world
  const t = tapes.live
  if (!w || !t || t.last < t.first) return { ok: false, note: 'There is no recording to branch from yet.' }
  if (busy) return { ok: false, note: 'The recording is busy; try again.' }
  const at = Math.floor(step)
  if (!Number.isFinite(at) || at < t.first || at > t.last) return { ok: false, note: 'That moment is no longer on the recording.' }
  const when = `t = ${timeText(t.timeOf(at))} s`
  if (at === t.last) {
    // The end of the run is where it already is: nothing to put back and nothing to keep as a ghost.
    emit({ kind: 'branched', step: at, note: `Carrying on from the end of the run, ${when}.`, marks })
    return { ok: true, note: `Carrying on from the end of the run, ${when}.` }
  }
  if (!rerunTo(w, t, at)) {
    // No keyframe, or the world refused it: nothing moved.
    return { ok: false, note: `The run could not be put back to ${when}.` }
  }
  const exact = matchesTape(w, t, at)
  tapes.parent = { tape: copyFrom(t, at), step: at }
  tapes.fine = null
  packBytes -= packBytesIn(t, at + 1, t.last)
  t.truncateAfter(at, free)
  for (const s of inputSteps) if (s > at) inputSteps.delete(s)
  marks = marks.filter((m) => m <= at)
  // Whatever was changed at the old end of the run is gone with it.
  lastInput = w.inputSerial
  syncStore(w, at)
  const note = exact
    ? `Branched at ${when}. The old run is shown as a ghost.`
    : `Branched at ${when}: a fresh run from this moment (not bit-identical to the recording). The old run is shown as a ghost.`
  emit({ kind: 'branched', step: at, note, marks })
  return { ok: true, note }
}

/** A keyframe-free copy of a tape from `from` to its end (the ghost's tape). */
function copyFrom(t: RunTape, from: number): RunTape {
  const c: RunTape = new Tape(t.layout, t.rate, from, t.timeOf(from), t.capBytes)
  for (let s = from; s <= t.last; s++) c.push(s, t.record(s)!, t.work(s)!, t.events(s))
  return c
}

const sameSettings = (a: WorldSettings, b: WorldSettings): boolean =>
  (Object.keys(a) as (keyof WorldSettings)[]).every((k) => {
    const x = a[k]
    const y = b[k]
    return Array.isArray(x) && Array.isArray(y) ? x.length === y.length && x.every((v, i) => v === y[i]) : x === y
  })

/**
 * After a branch the world holds the moment's definitions (a keyframe restores bounce, friction and
 * damping), settings and clock. The store follows, so the panel shows what the run now has, the
 * view's next sync changes nothing, and the readings and collision list end at the branch.
 */
function syncStore(w: SimWorld, at: number): void {
  const st = useSandbox.getState()
  const defs = w.definitions()
  const held = new Map<string, BodyDef>(defs.bodies.map((d) => [d.id, d]))
  const bodies = st.bodies.map((b) => held.get(b.id) ?? b)
  // A push taken off (or put on) after the moment is back as it was then: the panel lists what acts.
  const samePushes = defs.actuators.length === st.actuators.length && defs.actuators.every((a) => st.actuators.includes(a))
  const settings = w.getWorldSettings()
  const time = w.time
  const live: typeof st.live = {}
  for (const d of bodies) {
    const s = w.state(d.id)
    if (s) live[d.id] = s
  }
  const recording: typeof st.recording = {}
  for (const [id, list] of Object.entries(st.recording)) recording[id] = list.filter((x) => x.t <= time)
  useSandbox.setState({
    ...(bodies.some((b, i) => b !== st.bodies[i]) ? { bodies } : {}),
    ...(sameSettings(settings, st.world) ? {} : { world: settings }),
    ...(samePushes ? {} : { actuators: defs.actuators }),
    recording,
    contacts: st.contacts.filter((c) => c.step <= at),
    live,
    engineTime: time
  })
}

/**
 * Fine replay (I-5): the stretch of the run around `step` worked out again at 600 steps a second
 * into `tapes.fine`, then the live run put back exactly as it was (state and rate). The window is
 * a second long, from the chosen moment (or earlier, so that it fits before the end of the run); a
 * re-run cannot cross an outside change, so it stops early at the next one, and says so.
 */
export function fineReplayAt(step: number): { ok: boolean; note: string } {
  const w = world
  const t = tapes.live
  if (!w || !t || t.last < t.first) return { ok: false, note: 'There is no recording to replay yet.' }
  if (busy) return { ok: false, note: 'The recording is busy; try again.' }
  if (t.rate >= FINE_RATE) return { ok: false, note: `This run already takes ${fmtLabel(FINE_RATE, 0)} steps a second: every one of them is on the recording.` }
  // A spring too stiff for the run's rate is the engine's; at 600 it may become PhysLab's own, which
  // rebuilds a joint and loses every keyframe (the live run with them). Refused rather than risked.
  const stiff = w.definitions().links.some((l) => l.kind === 'spring' && w.springModel(l.id) === 'engine')
  if (stiff) return { ok: false, note: 'Fine replay cannot re-run this scene: a spring this stiff is worked out another way at 600 steps a second.' }
  const chosen = Math.min(t.last, Math.max(t.first, Math.floor(step)))
  if (!Number.isFinite(chosen)) return { ok: false, note: 'That moment is not on the recording.' }

  // The window, in ticks of the clock. It may not reach back past the last change before the chosen
  // moment, nor on past the next one or the end of the run.
  let back = t.first
  let next: number | null = null
  for (const s of inputSteps) {
    if (s <= chosen && s > back) back = s
    if (s > chosen && (next === null || s < next)) next = s
  }
  const chosenT = tickOf(t.timeOf(chosen))
  const endOfRunT = tickOf(t.timeOf(t.last))
  const changeT = next === null ? Infinity : tickOf(t.timeOf(next - 1))
  // Near the end of the run the second is moved back to fit (the chosen moment is still in it); a
  // change ahead cuts it short instead, and the note says where.
  const startT = Math.max(tickOf(t.timeOf(back)), Math.min(chosenT, endOfRunT - FINE_SECONDS * TICKS))
  const endT = Math.min(startT + FINE_SECONDS * TICKS, endOfRunT, changeT)
  const fineTicks = TICKS / FINE_RATE
  if (endT - startT < fineTicks) return { ok: false, note: 'There is too little of the run here to re-run: step back a little first.' }
  const k = t.keyframeAtOrBefore(stepAtOrBefore(t, startT / TICKS))
  if (!k) return { ok: false, note: 'That moment is no longer on the recording.' }

  const was = lastInput
  const pending = w.inputSerial !== lastInput
  const runRate = w.stepRate
  const now = w.saveKeyframe()
  if (!w.restoreKeyframe(k.key)) {
    // Refused, the world did not move.
    w.freeKeyframe(now)
    return { ok: false, note: 'That moment could not be worked out again.' }
  }
  const layout = t.layout
  const buf = new Float32Array(t.bodyCount * REC_FLOATS)
  let fine: RunTape | null = null
  let last: AfterStep | null = null
  let putBack: boolean
  const take = (): void => {
    const T = tickOf(w.time)
    if (w.stepRate !== FINE_RATE || T % fineTicks !== 0 || T < startT - 1 || T > endT) return
    // A tape's first record is a state with nothing done yet (as record 0 of a run): the step that
    // led to it may be a 1/240 s one from an odd tick, outside the window.
    const step = fine ? last : null
    if (!fine) fine = new Tape(layout, FINE_RATE, w.stepIndex, w.time)
    w.readRecord(buf)
    fine.push(w.stepIndex, buf, step ? workOf(step) : undefined, step ? eventsOf(step) : undefined)
  }
  const before = w.rebuildSerial
  busy = {
    capture: (s) => {
      last = s
    }
  }
  try {
    w.setWorldSettings({ stepRate: FINE_RATE })
    if (w.rebuildSerial === before) {
      take()
      // At most a second before the window plus the window, at 600; one step at the old rate first.
      for (let guard = 0; tickOf(w.time) + fineTicks <= endT && guard < 3 * FINE_RATE; guard++) {
        last = null
        w.stepOnce()
        take()
      }
    }
  } finally {
    busy = null
    putBack = w.restoreKeyframe(now)
  }
  w.freeKeyframe(now)
  lastInput = pending ? was : w.inputSerial
  if (!putBack) {
    // Only a rebuild in between could do this (the spring check above is there to prevent it): it
    // freed every keyframe, the end of the run with them. The rate goes back to the run's, and the
    // tape starts again from wherever the world is at its next step.
    w.setWorldSettings({ stepRate: runRate })
    dropLive()
    emit({ kind: 'cleared' })
    return { ok: false, note: 'The run could not be put back after the fine replay; press Reset to start it again.' }
  }
  const made = fine as RunTape | null
  if (!made || made.last < made.first) return { ok: false, note: 'There is too little of the run here to re-run: step back a little first.' }
  tapes.fine = made
  const playhead = Math.min(made.last, Math.max(made.first, made.first + (chosenT - tickOf(made.timeOf(made.first))) / fineTicks))
  const stopped = next !== null && endT === changeT && endT < startT + FINE_SECONDS * TICKS
  // Only a change's own keyframe on an odd tick (240 a second) is a moment 1/600 s steps never reach:
  // the re-run cannot start before the change, so it shows the first moment after it, and says so.
  const late = tickOf(made.timeOf(made.first)) > chosenT
  const note =
    `A re-run at 1/${fmtLabel(FINE_RATE, 0)} s. Its difference from the 1/${fmtLabel(t.rate, 0)} s run is the step error.` +
    (late ? ` It starts at t = ${timeText(made.timeOf(made.first))} s, the first 1/${fmtLabel(FINE_RATE, 0)} s step after the change made at t = ${timeText(t.timeOf(chosen))} s.` : '') +
    (stopped ? ` Fine replay stops here: something was changed at t = ${timeText(t.timeOf(next! - 1))} s.` : '')
  emit({ kind: 'fine', playhead, note })
  return { ok: true, note }
}

/**
 * How the tape store says what is shown (bound once by sim/tapeStore.ts, which imports this module;
 * the reverse import would be a cycle). Until it is bound everything is live.
 */
let view: () => { replaying: boolean; time: number } = () => ({ replaying: false, time: 0 })

export function bindReplayView(fn: () => { replaying: boolean; time: number }): void {
  view = fn
}

/**
 * Replay is read-only (D5): while a recording is being replayed (or fine-replayed) an edit is
 * refused with this sentence, for the panel and the viewport to show; null when live.
 */
export function replayRefusal(): string | null {
  const v = view()
  return v.replaying ? `Replaying t = ${timeText(v.time)} s. Branch from here to change something, or Back to live.` : null
}

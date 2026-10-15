// Drawing from the tape (SB16): what the Sandbox's drawing reads while a recording is shown, and how the playhead
// moves through it. In 'replay' and 'fine' the engine is neither stepped nor read: SandboxView's frame loop puts
// `replayFrame()`'s readout in `readoutRef`, so the bodies, ropes, springs, arrows, labels and trails all show the
// moment the playhead is on, and the world goes on from where it was, bit for bit, at Back to live.
//
// A playhead is a fractional step on the shown tape. What is DRAWN there is blended between the two records either
// side (`blendRecord`: positions and speeds in a straight line, turns the short way round), so ×0.1 and ×0.01 give a
// new picture every frame instead of holding each record for several; what is READ there (`state`, the panels'
// numbers) is the record at ⌊playhead⌋ exactly, as the engine gave it.

import type { BodyDef, BodyId, BodyState, Link } from '../../sim/types'
import type { V3 } from '../../math/vec'
import type { SimReadout } from './readout'
import type { RunTape } from '../../sim/recorder'
import { blendRecord, REC_FLOATS } from '../../sim/tape'
import { SimWorld, STRIDE } from '../../sim/world'
import { pulleyRim } from '../../sim/links'
import { handOverAtEnd, shownTape, useTape } from '../../sim/tapeStore'

/** What moves the playhead: where it is, how fast and which way the recording plays, the loop, and the tape's span. */
export interface PlaybackState {
  playhead: number
  /** The recording's speed (×1, ½, ¼, 1/10, 1/100). */
  speed: number
  direction: 1 | -1
  loop: { a: number; b: number } | null
  first: number
  last: number
  /** The tape's steps a second. */
  rate: number
}

/**
 * The playhead after `realDt` seconds of real time: it moves realDt × speed × rate steps, forwards or backwards.
 * Playing into an end stops there (`stopped`); with a loop it goes round and round between A and B instead (a
 * playhead outside the loop starts at A, or at B playing backwards).
 */
export function advancePlayhead(s: PlaybackState, realDt: number): { playhead: number; stopped: boolean } {
  const delta = Math.max(0, realDt) * s.speed * s.rate * s.direction
  const a = s.loop ? Math.max(s.first, s.loop.a) : 0
  const b = s.loop ? Math.min(s.last, s.loop.b) : 0
  if (s.loop && b > a) {
    const span = b - a
    let p = s.playhead
    if (p < a || p > b) p = s.direction === 1 ? a : b
    let next = p + delta
    if (next > b) next = a + ((next - a) % span)
    else if (next < a) next = b - ((b - next) % span)
    return { playhead: next, stopped: false }
  }
  const next = s.playhead + delta
  if (s.direction === 1 && next >= s.last) return { playhead: s.last, stopped: true }
  if (s.direction === -1 && next <= s.first) return { playhead: s.first, stopped: true }
  return { playhead: Math.min(s.last, Math.max(s.first, next)), stopped: false }
}

/**
 * How many different pictures one second of replay at `speed` shows at `fps` frames a second, on a tape of `rate`
 * steps a second: every frame's playhead is a picture of its own (blended between records), so slow motion is as
 * smooth as ×1. At ×1 and 240 a frame moves four steps (records are skipped, never shown twice); at ×0.1 it moves
 * 0.4 of a step, and only 24 of the 60 frames would land on a new record if records were shown whole.
 */
export function framePlan(speed: number, fps: number, rate: number): number {
  if (!(speed > 0) || !(fps > 0) || !(rate > 0)) return 0
  const frames = Math.round(fps)
  const state: PlaybackState = { playhead: 0, speed, direction: 1, loop: null, first: 0, last: Math.ceil(speed * rate) + 1, rate }
  const pictures = new Set<number>()
  for (let f = 0; f < frames; f++) {
    state.playhead = advancePlayhead(state, 1 / fps).playhead
    pictures.add(state.playhead)
  }
  return pictures.size
}

interface TapeReadoutOptions {
  /**
   * The recording is playing backwards: what is seen moves the other way, so velocities and spins are given reversed
   * (a fall played backwards rises at the same speeds). Paused, a moment is shown as it was recorded.
   */
  reversed?: boolean
  /** The scene's definitions: each body's mass, and a pulley wheel's size and turn. */
  bodies?: readonly BodyDef[]
}

const EMPTY = new Float32Array(0)

/**
 * The moment `playhead` of a tape, read the way the drawing reads the live world (I-6): `state(id)` is the record at
 * ⌊playhead⌋ exactly (what the engine gave at that step); `drawn(id)` and `transforms` are blended between ⌊playhead⌋
 * and ⌈playhead⌉; `linkPath` lays a rope through its links' blended records and a pulley rope over its wheel's rim
 * (`pulleyRim`, at the wheel's recorded place); `time` is the playhead's own (fractional) time.
 */
export function tapeReadout(tape: RunTape, playhead: number, opts: TapeReadoutOptions = {}): SimReadout {
  const order = tape.layout.bodies
  const index = new Map<BodyId, number>(order.map((id, i) => [id, i]))
  const defs = new Map<BodyId, BodyDef>((opts.bodies ?? []).map((d) => [d.id, d]))
  const sign = opts.reversed ? -1 : 1
  const empty = tape.last < tape.first
  const p = empty ? tape.first : Math.min(tape.last, Math.max(tape.first, playhead))
  const s0 = Math.floor(p)
  const alpha = p - s0
  const rec0 = empty ? EMPTY : (tape.record(s0) ?? EMPTY)
  const rec1 = alpha > 0 ? (tape.record(s0 + 1) ?? rec0) : rec0
  const blended = new Float32Array(rec0.length)
  if (rec0.length) blendRecord(rec0, rec1, alpha, blended)

  const transforms = new Float32Array(rec0.length ? order.length * STRIDE : 0)
  for (let i = 0; i < order.length && rec0.length; i++) {
    for (let k = 0; k < STRIDE; k++) transforms[i * STRIDE + k] = blended[i * REC_FLOATS + k]
  }

  const read = (rec: Float32Array, id: BodyId): BodyState | null => {
    const i = index.get(id)
    if (i === undefined || !rec.length) return null
    const o = i * REC_FLOATS
    const def = defs.get(id)
    return {
      position: [rec[o], rec[o + 1], rec[o + 2]],
      rotation: [rec[o + 3], rec[o + 4], rec[o + 5], rec[o + 6]],
      velocity: [sign * rec[o + 7], sign * rec[o + 8], sign * rec[o + 9]],
      angularVelocity: [sign * rec[o + 10], sign * rec[o + 11], sign * rec[o + 12]],
      mass: def ? SimWorld.massOf(def) : 0,
      // The tape does not record sleep; nothing on a shown recording asks for it.
      asleep: false
    }
  }
  const at = (slot: number): V3 => [blended[slot * REC_FLOATS], blended[slot * REC_FLOATS + 1], blended[slot * REC_FLOATS + 2]]

  const linkPath = (link: Link): V3[] => {
    const ia = index.get(link.a)
    const ib = index.get(link.b)
    if (ia === undefined || ib === undefined || !rec0.length) return []
    const pa = at(ia)
    const pb = at(ib)
    if (link.kind === 'pulley') {
      const wheel = link.over ? defs.get(link.over) : undefined
      if (!wheel) return [pa, pb]
      const iw = index.get(wheel.id)
      const { p1, p2 } = pulleyRim(iw === undefined ? wheel : { ...wheel, position: at(iw) }, pa, pb)
      return [pa, p1, p2, pb]
    }
    // A rope's links follow the bodies in the record, rope by rope in the layout's order (I-3).
    let slot = order.length
    for (const rope of tape.layout.ropes) {
      if (rope.linkId === link.id) {
        const pts: V3[] = [pa]
        for (let k = 0; k < rope.count; k++) pts.push(at(slot + k))
        pts.push(pb)
        return pts
      }
      slot += rope.count
    }
    return [pa, pb]
  }

  return {
    time: tape.timeOf(p),
    bodyOrder: order,
    transforms,
    state: (id) => read(rec0, id),
    drawn: (id) => read(blended, id),
    linkPath
  }
}

/**
 * One frame of a shown recording ('replay' or 'fine'): while the tape plays, the playhead moves on by the frame's
 * real time (`advancePlayhead`: it stops at an end, or goes round the loop); the readout is the moment it is then on.
 * `settle` (the recording played last frame and is paused now) puts a playhead left between two steps on the nearer
 * one, so a paused picture is a recorded moment and the panels, the clocks and the picture all show that one moment.
 * The engine is not touched. Null in 'live', or when nothing is recorded.
 */
export function replayFrame(realDt: number, bodies: readonly BodyDef[], settle = false): SimReadout | null {
  const s = useTape.getState()
  if (s.mode === 'live') return null
  const tape = shownTape()
  if (!tape || tape.last < tape.first) return null
  if (s.playing) {
    const next = advancePlayhead({ playhead: s.playhead, speed: s.speed, direction: s.direction, loop: s.loop, first: tape.first, last: tape.last, rate: tape.rate }, realDt)
    // Straight into the store, not through scrubTo: its "an end stops" would also stop a loop whose B is the end.
    useTape.setState({ playhead: next.playhead, playing: !next.stopped })
    // Played into the end of the recording: the live run carries on from there (BUGREC), and the view is live again.
    if (next.stopped && handOverAtEnd()) return null
  } else if (settle && !Number.isInteger(s.playhead)) {
    useTape.setState({ playhead: Math.min(tape.last, Math.max(tape.first, Math.round(s.playhead))) })
  }
  const now = useTape.getState()
  return tapeReadout(tape, now.playhead, { reversed: now.playing && now.direction === -1, bodies })
}

/** The recorded moment the panels show: a tape, the step its numbers are from, and whether it played backwards. */
interface PanelMoment {
  tape: object
  step: number
  reversed: boolean
}

/** A playing recording gives the panels a new moment at most this often (ms), as a live run does (about ten a second). */
const PANEL_MS = 100

/**
 * Whether the panels take a new moment now (`was` is the one they show, published at `was.at` ms). Never the same
 * moment twice. While the recording plays on by itself (`playedOn`: nothing scrubbed or stepped it since the last
 * frame), at most ten times a second; at once when it is paused, scrubbed, stepped, turned round or on another tape,
 * so the numbers never stay on a moment the picture has left.
 */
export function panelsDue(was: (PanelMoment & { at: number }) | null, next: PanelMoment, playing: boolean, playedOn: boolean, now: number): boolean {
  if (!was) return true
  if (was.tape !== next.tape || was.reversed !== next.reversed) return true
  if (!playing) return was.step !== next.step
  if (!playedOn) return true
  return now - was.at >= PANEL_MS
}

/** What the panels show for a readout: each body's state (the record at ⌊playhead⌋ on a shown recording). */
export function panelStates(readout: SimReadout, bodies: readonly BodyDef[]): Record<string, BodyState> {
  const live: Record<string, BodyState> = {}
  for (const d of bodies) {
    const s = readout.state(d.id)
    if (s) live[d.id] = s
  }
  return live
}

/** What the view keeps from one frame of a shown recording to the next. */
interface ReplayView {
  /** The recording played last frame. */
  wasPlaying: boolean
  /** Where the last frame left the playhead (null before the first): anything else that moved it was a scrub or a step. */
  head: number | null
  /** Which way it played last frame: a change is a turn round (Reverse while it plays). */
  direction: 1 | -1
  /** The recorded moment the panels show, and when it was published (ms); null while they show the live world. */
  panels: (PanelMoment & { at: number }) | null
  /** The loop from the last frame: a change means don't advance on this frame. */
  loop: { a: number; b: number } | null
}

export const newReplayView = (): ReplayView => ({ wasPlaying: false, head: null, direction: 1, panels: null, loop: null })

/**
 * One frame of the Sandbox view (SandboxView's frame loop) while a recording is shown: null in 'live' (the view draws
 * the world). Otherwise the readout to draw; the panels' numbers and clock when `panelsDue` says so (`live` from the
 * record at ⌊playhead⌋, `engineTime` that record's time); and `more` while the recording plays (ask for the next frame).
 * A frame that starts it playing, or follows a scrub, a step or a turn round, moves it no time: that moment is shown
 * first (Play never jumps: a demand-drawn canvas's first `dt` is the time since it last drew). The frame after a pause
 * settles it on a whole step. The panels take the moment at once unless it only played on by itself (a jump round a
 * loop is not playing on). `dt` is clamped to 0.1 s; `now` is in ms.
 */
export function replayViewFrame(v: ReplayView, dt: number, bodies: readonly BodyDef[], now: number): { readout: SimReadout; panels: { live: Record<string, BodyState>; engineTime: number } | null; more: boolean } | null {
  const before = useTape.getState()
  const loopChanged = v.loop !== before.loop
  const moved = loopChanged || v.head !== before.playhead || v.direction !== before.direction
  const readout = replayFrame(before.playing && v.wasPlaying && !moved ? Math.min(Math.max(0, dt), 0.1) : 0, bodies, v.wasPlaying && !before.playing)
  const after = useTape.getState()
  const wrapped = (after.playhead - before.playhead) * after.direction < 0
  const playedOn = !moved && !wrapped
  const justPaused = v.wasPlaying && !after.playing
  v.wasPlaying = after.playing
  v.head = after.playhead
  v.direction = after.direction
  v.loop = after.loop
  const tape = shownTape()
  if (!readout || !tape) return null
  const next: PanelMoment = { tape, step: Math.min(tape.last, Math.max(tape.first, Math.floor(after.playhead))), reversed: after.playing && after.direction === -1 }
  let panels: { live: Record<string, BodyState>; engineTime: number } | null = null
  if (panelsDue(v.panels, next, after.playing, playedOn, now) || justPaused) {
    v.panels = { ...next, at: now }
    panels = { live: panelStates(readout, bodies), engineTime: tape.timeOf(next.step) }
  }
  return { readout, panels, more: after.playing }
}

/** At most this many segments in a trail (about twenty seconds of flight drawn every 1/30 s). */
export const TRAIL_SEGMENTS = 600

/**
 * Every how many steps a trail takes a point, for `steps` steps from its start to the playhead: the smallest power
 * of two that keeps it within `maxSegments` segments, one of them kept for the piece from the last point to the
 * playhead itself. A power of two, so a trail that grows past a limit keeps every other point it had and the line
 * does not shimmer as the run goes on.
 */
export function trailStride(steps: number, maxSegments = TRAIL_SEGMENTS): number {
  let n = 1
  while (Math.ceil(Math.max(0, steps) / n) > Math.max(1, maxSegments - 1)) n *= 2
  return n
}

/** A trail's buffer (TRAIL_SEGMENTS segments of two points each) and what was put in it. */
interface TrailBuffer {
  out: Float32Array
  /**
   * The tape, start and stride its points were taken with, the branch they were taken before (`tapes.parent`: a branch
   * replaces the run after its step), how many points it holds, and whether its last segment is the piece to the head.
   */
  built: { tape: RunTape; from: number; stride: number; parent: unknown; points: number; tail: boolean } | null
}

export const newTrailBuffer = (): TrailBuffer => ({ out: new Float32Array(TRAIL_SEGMENTS * 6), built: null })

/**
 * One body's trail on a tape, from step `from` to the playhead `head`: a point every `trailStride` steps, joined by
 * segments, and a last piece from the last point to where the body is drawn at the head (`tip`, the readout's drawn
 * place; else the records blended there, as `blendRecord` draws it). Points are read from the tape only as the trail
 * grows past them (a few a frame at most); rewinding just draws fewer, and the buffer is filled again only when the
 * tape, the start or the stride changes, or `parent` does (a branch). Gives how many segments to draw and whether the
 * buffer changed (to upload it only then).
 */
export function fillTrail(buf: TrailBuffer, tape: RunTape, id: BodyId, from: number, head: number, parent: unknown, tip?: V3 | null): { segments: number; changed: boolean } {
  const at = tape.layout.bodies.indexOf(id)
  const h = Math.min(tape.last, Math.max(tape.first, head))
  const whole = Math.floor(h)
  if (at < 0 || tape.last < tape.first || whole < from) return { segments: 0, changed: false }
  const stride = trailStride(whole - from)
  const last = Math.floor((whole - from) / stride)
  let b = buf.built
  if (!b || b.tape !== tape || b.from !== from || b.stride !== stride || b.parent !== parent) {
    b = buf.built = { tape, from, stride, parent, points: 1, tail: false }
  }
  const out = buf.out
  const o = at * REC_FLOATS
  let changed = false
  // Segment j − 1 joins point j − 1 to point j.
  let prev = b.points <= last ? tape.record(from + (b.points - 1) * stride) : null
  for (let j = b.points; j <= last; j++) {
    const next = tape.record(from + j * stride)
    if (!prev || !next) {
      buf.built = null
      return { segments: 0, changed: false }
    }
    for (let c = 0; c < 3; c++) {
      out[(j - 1) * 6 + c] = prev[o + c]
      out[(j - 1) * 6 + 3 + c] = next[o + c]
    }
    prev = next
    changed = true
  }
  b.points = last + 1
  const lastStep = from + last * stride
  const r0 = h > lastStep ? tape.record(lastStep) : null
  const ra = r0 ? tape.record(whole) : null
  const rb = ra && h > whole ? (tape.record(whole + 1) ?? ra) : ra
  const tail = !!(r0 && ra && rb)
  if (r0 && ra && rb) {
    const f = h - whole
    for (let c = 0; c < 3; c++) {
      out[last * 6 + c] = r0[o + c]
      out[last * 6 + 3 + c] = tip ? tip[c] : ra[o + c] + (rb[o + c] - ra[o + c]) * f
    }
    changed = true
  }
  if (tail !== b.tail) changed = true
  b.tail = tail
  return { segments: last + (tail ? 1 : 0), changed }
}

/** The first step of a tape a trail is drawn from: its first, or the first at or after the moment the trails were cleared. */
export function trailStart(tape: Pick<RunTape, 'first' | 'rate' | 'timeOf'>, clearedAt: number | null): number {
  if (clearedAt === null) return tape.first
  // Within a millionth of a step of a step is that step (the tape's times and the clock's can differ in the last digit).
  const k = Math.ceil((clearedAt - tape.timeOf(tape.first)) * tape.rate - 1e-6)
  return tape.first + Math.max(0, k)
}

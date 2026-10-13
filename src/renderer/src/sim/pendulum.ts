// The pendulum angle (SB58, an owner item): where a body hanging from a pivot is, as angles, and the
// place it goes to when a student pulls it back to an angle they typed. Pure, so the fold, the
// tests and the tape all read the same arithmetic.
//
// The maths. With the pivot at P and the bob at B, r = B − P and L = |r|. The y axis is up, so a
// bob hanging straight down has r = (0, −L, 0).
//
//   θ     = atan2(√(rₓ² + r_z²), −r_y)   the angle from the vertical, 0° hanging down to 180° standing up
//   θ_xy  = atan2(rₓ, −r_y)              the swing seen from the front (x–y), + toward +x
//   θ_zy  = atan2(r_z, −r_y)             the swing seen from the side (z–y), + toward +z
//   φ     = atan2(r_z, rₓ)               which way it leans, in the floor's plane, from +x toward +z
//
// Pulled back to θ in the side plane the bob goes to B = P + L·(sin θ, −cos θ, 0); in the depth plane
// to B = P + L·(0, −cos θ, sin θ). Either way |B − P| = L, so the string, rod or rope is exactly as
// long as it was.

import { pendulumExact, pendulumSmall } from './predict'
import { dragSetsStart } from './inspector'
import { reachAlong } from './links'
import { REC_FLOATS } from './tape'
import type { BodyDef, BodyId, Link } from './types'
import type { V3 } from '../math/vec'

/** The two planes a swing is read and set in: seen from the front (x–y) or from the side (z–y). */
export type Plane = 'side' | 'depth'

export const PLANES: readonly Plane[] = ['side', 'depth']

/** The words the fold uses for each plane. */
export const PLANE_LABELS: Record<Plane, string> = { side: 'Side (x–y)', depth: 'Depth (z–y)' }

/** The biggest swing the fold sets: 180° would stand the bob on top of its pivot. */
export const MAX_ANGLE = 179

/** The three connections a bob can hang from. */
export type HangKind = 'string' | 'rod' | 'rope'

const HANG_KINDS: readonly string[] = ['string', 'rod', 'rope']

const DEG = 180 / Math.PI
const RAD = Math.PI / 180

/**
 * Positions reach us as 32-bit floats (the engine's, and the tape's), good to about 6×10⁻⁸ of the
 * largest coordinate. A sideways offset smaller than this fraction of the sizes it was worked out
 * from is the float's grain, not a lean: without it a bob hanging at rest read 6×10⁻⁷ degrees in the
 * depth plane. It is judged against the sizes involved, never a fixed number of metres.
 */
const POSITION_GRAIN = 1e-6

/**
 * A string or a rope is called slack when the bob is this much closer than the connection's length.
 * Measured on the engine: a taut string holds 1.0000 of its length, so a fiftieth short is slack; a rope
 * swinging at 60° bows to 0.97 of it and at 85° to 0.95 while still pulling, and one that goes slack
 * at the top of a big swing (120°) reaches 0.83, so a tenth short is where a rope has let go.
 */
export const SLACK_FRACTION: Record<'string' | 'rope', number> = { string: 0.02, rope: 0.1 }

/** What a bob hangs from. */
export interface Pivot {
  /** Where the pivot is now (the centre of the body the bob hangs from). */
  point: V3
  /** The arm, centre to centre, when the connection is straight, for the direction the bob lies in now. */
  length: number
  /** The arm for another direction: only a rope changes (it ties to the surface of each body). */
  armAt: (direction: V3) => number
  linkId: string
  kind: HangKind
  /** The body the bob hangs from. */
  bodyId: BodyId
  /** That body can move: a bob hanging from a bob. Setting an angle then moves only the bob. */
  moving: boolean
}

/** Where a body is now; undefined falls back to the position its definition gives. */
export type Where = (id: BodyId) => V3 | undefined

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const unit = (v: V3): V3 => {
  const n = Math.hypot(...v)
  // Exactly nowhere has no direction: hang it straight down.
  return n > 0 ? [v[0] / n, v[1] / n, v[2] / n] : [0, -1, 0]
}

/**
 * What the body hangs from, or null when it hangs from nothing a pendulum has.
 *
 * It needs a dynamic body joined by a string, a rod or a rope. A bob on two fixed pivots (a V of
 * strings) is not a simple pendulum, so it has none. A body joined to a fixed pivot hangs from it
 * even when another body also hangs from the bob (a double pendulum's upper bob). A body joined
 * only to another moving body hangs from that one when it starts below it: two crates on a level
 * rod are not a pendulum. The floor is never a pivot.
 */
export function pivotOf(bodyId: BodyId, links: readonly Link[], bodies: readonly BodyDef[], where?: Where): Pivot | null {
  const bob = bodies.find((b) => b.id === bodyId)
  if (!bob || bob.motion !== 'dynamic') return null
  const found: { link: Link; other: BodyDef }[] = []
  for (const link of links) {
    if (!HANG_KINDS.includes(link.kind)) continue
    if (link.a !== bodyId && link.b !== bodyId) continue
    const other = bodies.find((b) => b.id === (link.a === bodyId ? link.b : link.a))
    if (!other || other.id === bodyId || other.shape === 'ground') continue
    found.push({ link, other })
  }
  const fixed = found.filter((f) => f.other.motion !== 'dynamic')
  let pick: { link: Link; other: BodyDef } | undefined
  if (fixed.length === 1) pick = fixed[0]
  else if (fixed.length === 0 && found.length === 1 && bob.position[1] < found[0].other.position[1]) pick = found[0]
  if (!pick) return null
  const { link, other } = pick
  const point = where?.(other.id) ?? other.position
  const armAt = (direction: V3): number => {
    if (link.kind !== 'rope') return link.length
    // A rope ties to the surface of each body, so its straight length is the rope plus the two reaches.
    const toward = unit(direction)
    return link.length + reachAlong(other, toward) + reachAlong(bob, [-toward[0], -toward[1], -toward[2]])
  }
  const bobAt = where?.(bodyId) ?? bob.position
  return { point, length: armAt(sub(bobAt, point)), armAt, linkId: link.id, kind: link.kind as HangKind, bodyId: other.id, moving: other.motion === 'dynamic' }
}

/** The angles of a bob from its pivot, in degrees. */
export interface Angles {
  /** From the vertical: 0 hanging straight down, 180 standing straight up. */
  theta: number
  /** Seen from the front (x–y): + toward +x, from −180 to 180. */
  side: number
  /** Seen from the side (z–y): + toward +z, from −180 to 180. */
  depth: number
  /** Which way it leans in the floor's plane, from +x toward +z; null while it hangs straight (nothing leans). */
  lean: number | null
  /** The distance from the pivot to the bob. */
  distance: number
}

/** Angles of `bob` from `pivot`, or null when they are the same point (no arm, no angle). */
export function anglesOf(bob: V3, pivot: V3): Angles | null {
  const [rx, ry, rz] = sub(bob, pivot)
  const distance = Math.hypot(rx, ry, rz)
  if (!(distance > 0)) return null
  const grain = POSITION_GRAIN * (distance + Math.max(...bob.map(Math.abs), ...pivot.map(Math.abs)))
  // A 0 that really is +0: atan2(−0, …) would read −180 for a bob standing straight up.
  const kill = (v: number): number => (Math.abs(v) <= grain ? 0 : v)
  const x = kill(rx)
  const z = kill(rz)
  const up = kill(-ry)
  const off = Math.hypot(x, z)
  // Level with the pivot, a plane that sees no part of the arm (a bob in the side plane, seen from the side) reads 0, not 0 or 180 by the toss of a grain.
  if (off === 0 && up === 0) return null
  const clean = (deg: number): number => (deg === 0 ? 0 : deg)
  return {
    theta: clean(Math.atan2(off, up) * DEG),
    side: clean(Math.atan2(x, up) * DEG),
    depth: clean(Math.atan2(z, up) * DEG),
    lean: off === 0 ? null : clean(Math.atan2(z, x) * DEG),
    distance
  }
}

/** The unit vector from the pivot to a bob pulled back θ degrees in a plane (negative: the other way). */
export function directionAt(thetaDeg: number, plane: Plane): V3 {
  const t = thetaDeg * RAD
  const s = Math.sin(t)
  const c = Math.cos(t)
  return plane === 'side' ? [s, -c, 0] : [0, -c, s]
}

/** Where the bob goes when it is pulled back θ degrees in a plane, its distance L from the pivot kept exactly. */
export function placeAtAngle(pivot: V3, L: number, thetaDeg: number, plane: Plane): V3 {
  const d = directionAt(thetaDeg, plane)
  return [pivot[0] + L * d[0], pivot[1] + L * d[1], pivot[2] + L * d[2]]
}

/** The rows the fold reads out: a flat world has one angle; a 3-D one has the swing, both planes and the lean. */
export type Row = 'theta' | 'side' | 'depth' | 'lean'
export const rowsFor = (twoD: boolean): readonly Row[] => (twoD ? ['side'] : ['theta', 'side', 'depth', 'lean'])

/** The planes a swing can be set in. */
export const planesFor = (twoD: boolean): readonly Plane[] => (twoD ? ['side'] : PLANES)

/** Slack: a string or a rope with the bob nearer than its length. A rod cannot be. */
export function isSlack(kind: HangKind, distance: number, length: number): boolean {
  return kind !== 'rod' && distance < length * (1 - SLACK_FRACTION[kind])
}

/** The sentence for a slack connection (the angles are not shown while it lasts). */
export function slackSentence(kind: HangKind): string {
  return `The ${kind} is slack: the bob is nearer the pivot than the ${kind} is long, so it is not swinging on a circle just now. Set an angle to pull it taut.`
}

/** The bob's height above the lowest point of its swing: h = L(1 − cos θ). */
export const heightAbove = (L: number, thetaDeg: number): number => L * (1 - Math.cos(thetaDeg * RAD))

/** The periods for an arm L at g: the small-swing formula, and (where there is one) the exact period for a swing starting at θ. */
export function periodsOf(L: number, g: number, thetaDeg: number, kind: HangKind): { small: number; exact: number | null; note: string | null } | null {
  if (!(L > 0) || !(g > 0)) return null
  const small = pendulumSmall(L, g)
  const theta = Math.abs(thetaDeg)
  // A string or a rope goes slack once the bob is above the pivot's level: it is no pendulum there.
  if (kind !== 'rod' && theta > 90) return { small, exact: null, note: `A ${kind} goes slack past 90°, so a swing that starts there is not a pendulum.` }
  const exact = pendulumExact(L, g, theta)
  const note = kind === 'rope' ? 'A rope weighs a little, so it swings a few per cent quicker.' : null
  return { small, exact: Number.isFinite(exact) ? exact : null, note }
}

/** A formatter that writes a number with its unit through the student's precision (panels/sandbox/common.tsx `useNum`). */
export type Num = (v: number, unit?: string) => string

/** The three short lines under the controls: the height, the small-swing period, the period at this angle. */
export function meaningLines(a: { L: number; g: number; theta: number; kind: HangKind }, num: Num): string[] {
  const lines = [`Height above its lowest point: h = L(1 − cos θ) = ${num(heightAbove(a.L, a.theta), 'm')}`]
  const p = periodsOf(a.L, a.g, a.theta, a.kind)
  if (!p) return [...lines, 'With no gravity there is nothing to swing it back, so there is no period.']
  lines.push(`Period for small swings: T = 2π√(L/g) = ${num(p.small, 's')}`)
  if (p.exact !== null) lines.push(`Period for a swing that starts at this angle (θ = ${num(Math.abs(a.theta), '°')}): T = ${num(p.exact, 's')}`)
  if (p.note) lines.push(p.note)
  return lines
}

/** Why an angle cannot be set, in a sentence (its numbers through the student's number writer); null when it can. */
export function angleRefusal(thetaDeg: number, plane: Plane, twoD: boolean, num: Num): string | null {
  if (!Number.isFinite(thetaDeg)) return 'Type the angle as a number of degrees.'
  if (Math.abs(thetaDeg) > MAX_ANGLE) return `A swing of ${num(MAX_ANGLE + 1, '°')} or more would put the bob on top of its pivot or past it. Choose an angle from ${num(-MAX_ANGLE, '°')} to ${num(MAX_ANGLE, '°')}.`
  if (twoD && plane === 'depth') return 'This world is held flat (2D mode), so the bob can only swing in the side plane (x–y). Turn 2D mode off in the World section to swing it toward or away from you.'
  return null
}

/** What pulling back needs to know, so the plan is the same in the fold and in a test. */
export interface PullBackInput {
  bobId: BodyId
  bodies: readonly BodyDef[]
  links: readonly Link[]
  /** Where each body is now (the engine's, when a run has started). */
  where: Where
  twoD: boolean
  /** The engine's clock: 0 before the run starts. */
  engineTime: number
  /** `replayRefusal()` while a recording is on screen, else null. */
  refusal: string | null
  /** The student's number writer, for the numbers in a refusal. */
  num: Num
}

export type PullBackPlan = { ok: false; sentence: string } | { ok: true; position: V3; setsStart: boolean; length: number }

/**
 * Where the bob goes, and whether the definition's start moves with it: before the run a pulled-back
 * bob starts there (Reset returns to it); paused part-way it is only put there and the run goes on
 * from it (the same rule as dragging, `dragSetsStart`). The bob is left at rest either way.
 */
export function planPullBack(input: PullBackInput, thetaDeg: number, plane: Plane): PullBackPlan {
  if (input.refusal) return { ok: false, sentence: input.refusal }
  const bob = input.bodies.find((b) => b.id === input.bobId)
  const pivot = pivotOf(input.bobId, input.links, input.bodies, input.where)
  if (!bob || !pivot) return { ok: false, sentence: 'This object does not hang from anything, so there is no angle to set.' }
  const why = angleRefusal(thetaDeg, plane, input.twoD, input.num)
  if (why) return { ok: false, sentence: why }
  const length = pivot.armAt(directionAt(thetaDeg, plane))
  const position = placeAtAngle(pivot.point, length, thetaDeg, plane)
  return { ok: true, position, setsStart: dragSetsStart(input.engineTime, bob), length }
}

/** What a tape needs to show for the fold to read it: the shape of `Tape` (sim/tape.ts), no more. */
export interface TapeView {
  first: number
  last: number
  layout: { bodies: readonly string[] }
  record(step: number): Float32Array | null
}

/**
 * Where a body was at the playhead of a recording (a fractional step is the blend of the two steps
 * around it), or null when the tape does not hold the body or the step.
 */
export function tapePositionOf(tape: TapeView | null, playhead: number, id: BodyId): V3 | null {
  if (!tape || tape.last < tape.first) return null
  const index = tape.layout.bodies.indexOf(id)
  if (index < 0) return null
  const at = Math.min(tape.last, Math.max(tape.first, playhead))
  const lo = Math.floor(at)
  const hi = Math.min(tape.last, lo + 1)
  const a = tape.record(lo)
  const b = tape.record(hi)
  if (!a || !b) return null
  const o = index * REC_FLOATS
  const f = at - lo
  return [a[o] + (b[o] - a[o]) * f, a[o + 1] + (b[o + 1] - a[o + 1]) * f, a[o + 2] + (b[o + 2] - a[o + 2]) * f]
}

/**
 * Where each body is for the readout: the shown step of a recording while one is on screen (the engine has moved on, or
 * stopped, and the tape is what the student is looking at); else the engine's reading as the viewport last published it,
 * which is nothing before a run starts (the definition's position is used then).
 */
export function whereFor(src: { replaying: boolean; tape: TapeView | null; playhead: number; live: Readonly<Record<BodyId, { position: V3 }>> }): Where {
  if (src.replaying) return (id) => tapePositionOf(src.tape, src.playhead, id) ?? undefined
  return (id) => src.live[id]?.position
}

/** The drawing of the angle: a dial with the vertical, the arm at θ and the arc between them, in a 140 × 124 box. */
export interface Protractor {
  box: { width: number; height: number }
  pivot: [number, number]
  /** The vertical, dashed. */
  vertical: [number, number]
  /** The end of the arm (the bob). */
  arm: [number, number]
  /** The arc from the vertical to the arm, as an SVG path. */
  arc: string
  /** The dial's tick marks every 30°: each a short line [x1, y1, x2, y2]. */
  ticks: [number, number, number, number][]
  radius: number
}

const DIAL = { width: 140, height: 124, cx: 70, cy: 62, reach: 50, arc: 24 }

/** The point at `thetaDeg` from the downward vertical, `r` from the pivot; positive leans to the right. */
const dialPoint = (thetaDeg: number, r: number): [number, number] => [DIAL.cx + r * Math.sin(thetaDeg * RAD), DIAL.cy + r * Math.cos(thetaDeg * RAD)]

/**
 * The dial for a swing of θ degrees. `lean` is +1 when the bob is on the +x side (to the right) and −1 on the
 * other; at rest straight down it does not matter. The arc takes the short way round from the vertical.
 */
export function protractorOf(thetaDeg: number, lean: 1 | -1): Protractor {
  const theta = Math.min(180, Math.max(0, Math.abs(thetaDeg)))
  const signed = lean * theta
  const [ax, ay] = dialPoint(signed, DIAL.arc)
  const [sx, sy] = dialPoint(0, DIAL.arc)
  // On screen (y down) the way from the vertical to the right is anticlockwise, which is sweep-flag 0.
  const sweep = lean === 1 ? 0 : 1
  const ticks: [number, number, number, number][] = []
  for (let deg = 0; deg < 360; deg += 30) {
    const [x1, y1] = dialPoint(deg, DIAL.reach + 2)
    const [x2, y2] = dialPoint(deg, DIAL.reach + 8)
    ticks.push([x1, y1, x2, y2])
  }
  return {
    box: { width: DIAL.width, height: DIAL.height },
    pivot: [DIAL.cx, DIAL.cy],
    vertical: dialPoint(0, DIAL.reach),
    arm: dialPoint(signed, DIAL.reach),
    arc: theta < 0.05 ? '' : `M ${sx} ${sy} A ${DIAL.arc} ${DIAL.arc} 0 0 ${sweep} ${ax} ${ay}`,
    ticks,
    radius: DIAL.reach
  }
}

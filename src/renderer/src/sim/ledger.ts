// The energy ledger (SB10, I-9): where every joule of a run is at one step of its tape.
//
// In motion (kinetic, spin included), in height above the floor, in a spring (½kx²), put in by a push or the hand,
// taken out by PhysLab's own forces (the air, rolling, a spring's damper: the tape keeps their work step by step),
// or turned into heat inside the engine where surfaces rub or hit, or by the engine's damping. Heat is what the
// rest leaves over: E₀ + W − E. When the scene has nothing the engine loses energy to, the same leftover is not
// heat but the step's own numerical drift, and it is named so. docs/knowledge/sandbox-ledger.md has the rules.

import type { BodyDef, BodyState, ContactEvent, Link, WorldSettings } from './types'
import type { V3 } from '../math/vec'
import { energyOf, groundTopOf, springEnergyOf } from './energy'
import { REC_FLOATS } from './tape'
import { isContact, touchesAt, type RunTape } from './recorder'
import { temperatureRise } from './thermal'

/** I-9. Every figure in joules except `deltaT` (kelvin, per moving body, by id). */
export interface LedgerReading {
  /** ½mv² + ½Iω² of every moving body. */
  kinetic: number
  /** mgh above the top of the floor. */
  height: number
  /** ½kx² of every spring, PhysLab's own and the engine's. */
  spring: number
  /** Work done by pushes since the tape began (energy in). */
  pushedIn: number
  /** Energy put in by hand since the tape began: the hand's work while dragging in play, and any edit part-way (a body placed or typed). */
  hand: number
  /** Energy taken out by air resistance since the tape began (positive when the air took it). */
  drag: number
  /** Energy taken out by rolling resistance. */
  rolling: number
  /** Energy taken out by springs' dampers. */
  damper: number
  /** Heat made inside the engine (friction, bounces, damping): 0 when the scene has none of those. */
  heat: number
  /** With nothing to lose energy to: E − E₀ − W, the step's own error. Null when there is heat instead. */
  drift: number | null
  /** What the run has lost energy to so far, in plain words, in a fixed order. */
  sources: string[]
  /** Each moving body's temperature rise from the heat it was given (K). */
  deltaT: Record<string, number>
}

/** What the ledger needs to know about the scene the tape was recorded from. */
export interface LedgerScene {
  bodies: BodyDef[]
  links: Link[]
  world: Pick<WorldSettings, 'gravity' | 'airDensity'>
  massOf: (b: BodyDef) => number
}

/** The sources, in the order a reading lists them. `engine` ones make heat; the others are PhysLab's own work. */
const SOURCES = [
  { text: 'air resistance', engine: false },
  { text: 'friction where surfaces slide', engine: true },
  { text: 'bounces that are not perfectly elastic', engine: true },
  { text: 'damping set on a body', engine: true },
  { text: 'the engine’s spin damping', engine: true },
  { text: 'a stiff spring the engine works itself', engine: true },
  { text: 'a rope’s links (their own energy is not counted)', engine: true },
  { text: 'rolling resistance', engine: false },
  { text: 'dampers (a spring’s, or where a body is tied)', engine: false }
] as const
type Source = (typeof SOURCES)[number]['text']

/** Slower than this (m/s, rad/s) is at rest: float32 noise on a body that sits still. */
const MOVING = 0.01
/** A contact closing faster than this (m/s) is a bounce, as the recorder's marks count one. */
const BOUNCE = 0.05

const ZERO: V3 = [0, 0, 0]

/** One body's state at a step, from its place in a record. */
function stateIn(rec: Float32Array, i: number, mass: number): BodyState {
  const o = i * REC_FLOATS
  return {
    position: [rec[o], rec[o + 1], rec[o + 2]],
    rotation: [rec[o + 3], rec[o + 4], rec[o + 5], rec[o + 6]],
    velocity: [rec[o + 7], rec[o + 8], rec[o + 9]],
    angularVelocity: [rec[o + 10], rec[o + 11], rec[o + 12]],
    mass,
    asleep: false
  }
}

const size = (v: readonly number[]) => Math.hypot(v[0], v[1], v[2])

/** What the ledger keeps for one tape and one scene, worked out step by step as far as it was asked. */
interface Book {
  tape: RunTape
  bodies: BodyDef[]
  links: Link[]
  gravity: number
  first: number
  /** The last step worked out. */
  upTo: number
  /** E at each step from `first` (index step − first). */
  energy: number[]
  /** The first step each source showed up at. */
  since: Map<Source, number>
  /** The heat each moving body was given, added up to each step (index step − first). */
  given: Map<string, number[]>
  /** Energy put in by edits (a body placed or typed part-way), added up to each step (index step − first). */
  edits: number[]
}

const books = new WeakMap<RunTape, Book>()

/** The parts of the energy at one step. */
function partsAt(tape: RunTape, rec: Float32Array, scene: LedgerScene): { kinetic: number; height: number; spring: number } {
  const datum = groundTopOf(scene.bodies)
  const at = new Map(tape.layout.bodies.map((id, i) => [id, i]))
  let kinetic = 0
  let height = 0
  for (const def of scene.bodies) {
    if (def.motion !== 'dynamic') continue
    const i = at.get(def.id)
    if (i === undefined) continue
    const e = energyOf(def, stateIn(rec, i, scene.massOf(def)), scene.world.gravity, datum)
    kinetic += e.kinetic
    height += e.potential
  }
  let spring = 0
  const where = (id: string): V3 | null => {
    const i = at.get(id)
    if (i !== undefined) return [rec[i * REC_FLOATS], rec[i * REC_FLOATS + 1], rec[i * REC_FLOATS + 2]]
    return scene.bodies.find((b) => b.id === id)?.position ?? null
  }
  for (const link of scene.links) {
    if (link.kind !== 'spring' || link.a === link.b) continue
    const a = where(link.a)
    const b = where(link.b)
    if (a && b) spring += springEnergyOf(link, a, b).elastic
  }
  return { kinetic, height, spring }
}

/** Whether a spring is too stiff for the step and so built as the engine's own (world.ts `springKindAt`). */
function engineSpring(link: Link, scene: LedgerScene, rate: number): boolean {
  const ends = [link.a, link.b].map((id) => scene.bodies.find((b) => b.id === id))
  if (!ends[0] || !ends[1]) return false
  const moving = ends.filter((d) => d!.motion === 'dynamic') as BodyDef[]
  const masses = moving.map((d) => scene.massOf(d))
  const mu = moving.length === 2 ? (masses[0] * masses[1]) / (masses[0] + masses[1]) : moving.length === 1 ? masses[0] : Infinity
  return Math.sqrt(Math.max(0.01, link.stiffness) / mu) / rate >= 1
}

function newBook(tape: RunTape, scene: LedgerScene): Book {
  const book: Book = { tape, bodies: scene.bodies, links: scene.links, gravity: scene.world.gravity, first: tape.first, upTo: tape.first - 1, energy: [], since: new Map(), given: new Map(), edits: [] }
  const moving = scene.bodies.filter((b) => b.motion === 'dynamic' && tape.layout.bodies.includes(b.id))
  for (const b of moving) book.given.set(b.id, [])
  // Present from the start, whatever the bodies do.
  if (scene.links.some((l) => l.kind === 'spring' && engineSpring(l, scene, tape.rate))) book.since.set('a stiff spring the engine works itself', tape.first)
  if (tape.layout.ropes.length > 0) book.since.set('a rope’s links (their own energy is not counted)', tape.first)
  return book
}

/** The point velocity of a body at a world point: v + ω × (p − x). */
function pointVelocity(s: BodyState, p: V3): V3 {
  const r: V3 = [p[0] - s.position[0], p[1] - s.position[1], p[2] - s.position[2]]
  const w = s.angularVelocity
  return [s.velocity[0] + w[1] * r[2] - w[2] * r[1], s.velocity[1] + w[2] * r[0] - w[0] * r[2], s.velocity[2] + w[0] * r[1] - w[1] * r[0]]
}

/** Works the book out to `step`: each step's energy, the sources that showed up, and who was given that step's heat. */
function extend(book: Book, step: number, scene: LedgerScene): void {
  const tape = book.tape
  const at = new Map(tape.layout.bodies.map((id, i) => [id, i]))
  const defs = new Map(scene.bodies.map((b) => [b.id, b]))
  const seen = (s: Source, k: number) => {
    if (!book.since.has(s)) book.since.set(s, k)
  }
  // The steps of the keyframes the recorder took after an outside change (an edit, a placed body, the hand): every
  // keyframe that is not one of its once-a-second ones, which fall every `rate` steps from the tape's first.
  const edited = new Set(tape.keyframeSteps().filter((k) => (k - tape.first) % tape.rate !== 0))
  for (let k = book.upTo + 1; k <= step; k++) {
    const rec = tape.record(k)
    if (!rec) break
    const parts = partsAt(tape, rec, scene)
    book.energy.push(parts.kinetic + parts.height + parts.spring)
    const state = (id: string): BodyState | null => {
      const i = at.get(id)
      const d = defs.get(id)
      return i === undefined || !d ? null : stateIn(rec, i, d.motion === 'dynamic' ? scene.massOf(d) : 0)
    }
    // Who rubbed or hit this step, and what the engine damped.
    const pairs: [string, string][] = []
    if (k > book.first) {
      const work = tape.work(k)
      if (work && work[0] !== 0) seen('air resistance', k)
      if (work && work[1] !== 0) seen('rolling resistance', k)
      if (work && work[4] !== 0) seen('dampers (a spring’s, or where a body is tied)', k)
      for (const e of tape.events(k)) {
        if (!isContact(e)) continue
        const c = e as ContactEvent
        if (c.approachSpeed > BOUNCE && c.eUsed < 1) {
          seen('bounces that are not perfectly elastic', k)
          pairs.push([c.a, c.b])
        }
      }
      for (const t of touchesAt(tape, k)) {
        const da = defs.get(t.a)
        const db = defs.get(t.b)
        if (!da || !db || (da.motion !== 'dynamic' && db.motion !== 'dynamic')) continue
        if (Math.sqrt(Math.max(0, da.friction) * Math.max(0, db.friction)) <= 0) continue
        const sa = state(t.a)
        const sb = state(t.b)
        if (!sa || !sb) continue
        const va = da.motion === 'dynamic' ? pointVelocity(sa, t.point) : ZERO
        const vb = db.motion === 'dynamic' ? pointVelocity(sb, t.point) : ZERO
        const rel: V3 = [va[0] - vb[0], va[1] - vb[1], va[2] - vb[2]]
        const along = rel[0] * t.normal[0] + rel[1] * t.normal[1] + rel[2] * t.normal[2]
        const slide = size([rel[0] - along * t.normal[0], rel[1] - along * t.normal[1], rel[2] - along * t.normal[2]])
        if (slide > MOVING) {
          seen('friction where surfaces slide', k)
          pairs.push([t.a, t.b])
        }
      }
    }
    const damped: string[] = []
    for (const id of book.given.keys()) {
      const d = defs.get(id)!
      const s = state(id)
      if (!s) continue
      const slides = d.linearDamping > 0 && size(s.velocity) > MOVING
      const spins = d.angularDamping > 0 && size(s.angularVelocity) > MOVING
      if (slides) seen('damping set on a body', k)
      if (spins) seen('the engine’s spin damping', k)
      if (slides || spins) damped.push(id)
    }
    // This step's heat: what the energy lost beyond what PhysLab's own forces did. On a step that follows an edit, the
    // change is the edit's (energy put in by hand), not heat: typing a stretch into a stiff spring read as −50 J of heat.
    const i = k - book.first
    const left = i === 0 ? 0 : book.energy[i - 1] - book.energy[i] + workOf(tape.work(k))
    const byHand = edited.has(k) ? -left : 0
    book.edits.push((book.edits[i - 1] ?? 0) + byHand)
    const dq = edited.has(k) ? 0 : left
    const share = new Map<string, number>()
    const give = (id: string, q: number) => {
      if (book.given.has(id)) share.set(id, (share.get(id) ?? 0) + q)
    }
    if (pairs.length > 0) {
      // Simplified: all the heat stays in the bodies that rubbed or hit; a fixed body takes none.
      for (const [a, b] of pairs) {
        const both = book.given.has(a) && book.given.has(b)
        give(a, both ? dq / pairs.length / 2 : dq / pairs.length)
        give(b, both ? dq / pairs.length / 2 : dq / pairs.length)
      }
    } else {
      const to = damped.length > 0 ? damped : [...book.given.keys()]
      for (const id of to) give(id, dq / to.length)
    }
    for (const [id, list] of book.given) list.push((list[i - 1] ?? 0) + (share.get(id) ?? 0))
    book.upTo = k
  }
}

/**
 * The recorded step a playhead shows: the one at or before it, as the tape strip names it (`Math.floor(head + 1e-9)` in
 * TapeStrip.tsx), on the tape. Readings exist only at steps; between two the card shows the one the strip names.
 */
const stepOf = (tape: RunTape, step: number): number => Math.max(tape.first, Math.min(tape.last, Math.floor(step + 1e-9)))

/** The work PhysLab's own forces did in a step, signed (drag, rolling, push, hand, damper). */
function workOf(w: Float32Array | null): number {
  return w ? w[0] + w[1] + w[2] + w[3] + w[4] : 0
}

/**
 * The ledger at one step of a tape (I-9). Worked out from the tape's first record, so a replay reads exactly what
 * the live run read at that step. The tape's work and events start at its first step: after the cap drops the
 * oldest seconds, "the start" is the first second kept.
 */
export function ledgerAt(tape: RunTape, step: number, scene: LedgerScene): LedgerReading {
  let book = books.get(tape)
  if (!book || book.bodies !== scene.bodies || book.links !== scene.links || book.gravity !== scene.world.gravity || book.first !== tape.first || book.upTo > tape.last) {
    book = newBook(tape, scene)
    books.set(tape, book)
  }
  const s = stepOf(tape, step)
  if (s > book.upTo) extend(book, s, scene)
  const rec = tape.record(s)
  const parts = rec ? partsAt(tape, rec, scene) : { kinetic: 0, height: 0, spring: 0 }
  const w = tape.workSum(tape.first + 1, s)
  const edits = book.edits[s - book.first] ?? 0
  const own = w[0] + w[1] + w[2] + w[3] + w[4] + edits
  const e0 = book.energy[0] ?? 0
  const e = parts.kinetic + parts.height + parts.spring
  const sources = SOURCES.filter((x) => (book.since.get(x.text) ?? Infinity) <= s)
  const engine = sources.some((x) => x.engine)
  const leftover = e0 + own - e
  const heat = engine ? leftover : 0
  const i = s - book.first
  const deltaT: Record<string, number> = {}
  let given = 0
  for (const list of book.given.values()) given += list[i] ?? 0
  const count = book.given.size
  for (const [id, list] of book.given) {
    const def = scene.bodies.find((b) => b.id === id)!
    const part = given > 0 ? Math.max(0, list[i] ?? 0) / given : 1 / count
    deltaT[id] = heat > 0 ? temperatureRise(heat * part, scene.massOf(def), def.material) : 0
  }
  return {
    ...parts,
    pushedIn: w[2],
    hand: w[3] + edits,
    drag: -w[0],
    rolling: -w[1],
    damper: -w[4],
    heat,
    drift: engine ? null : -leftover,
    sources: sources.map((x) => x.text),
    deltaT
  }
}

/**
 * Every moving body's state at a step of a tape, keyed by id, as the panel's live values are: the card's rows read
 * the same moment as its totals while a recording is shown.
 */
export function statesAt(tape: RunTape, step: number, scene: LedgerScene): Record<string, BodyState> {
  const s = stepOf(tape, step)
  const rec = tape.record(s)
  const out: Record<string, BodyState> = {}
  if (!rec) return out
  tape.layout.bodies.forEach((id, i) => {
    const def = scene.bodies.find((b) => b.id === id)
    if (def && def.motion === 'dynamic') out[id] = stateIn(rec, i, scene.massOf(def))
  })
  return out
}

/** The energy at the start of the tape, from any reading: E₀ = E + heat − drift − W. */
export function ledgerStart(r: LedgerReading): number {
  return r.kinetic + r.height + r.spring + r.heat - (r.drift ?? 0) - (r.pushedIn + r.hand - r.drag - r.rolling - r.damper)
}

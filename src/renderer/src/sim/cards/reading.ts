// What a card reads (I-7): a Reading built from the scene by ROLE, and the value of each kind of
// Source in it. A role names a body by its NAME, because loadPreset mints fresh ids on every load
// (AGENTS.md); a name that is not in the scene leaves its role out, and a card that needs that role
// is not shown at all. A value the reading cannot give — an acceleration before the tape has one —
// is null, and the card shows "—" for it rather than a made-up number.

import type { V3 } from '../../math/vec'
import { energyOf, groundTopOf, springStretch, startStateOf } from '../energy'
import { dragCoefficient, frontalAreaTurned } from '../materials'
import { halfHeight, massOf } from '../store'
import { rateOf } from '../types'
import type { BodyDef, BodyState, Link, WorldSettings } from '../types'
import type { BodyGet, BodyReading, LinkGet, LinkReading, Reading, Source } from './types'


/**
 * The engine's steps a second: I-1's rateOf itself (sim/types.ts), so a card reads the rate the
 * engine runs at and the rule is kept once (a valid stepRate, or an old collisionSteps n as 60·n
 * rounded up; with both, the finer wins, as the cradle needs).
 */
export function stepRateOf(w: WorldSettings): number {
  return rateOf(w)
}

const distance = (a: V3, b: V3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** The floors the engine puts under a link's length and stiffness (addDistance in world.ts; energy.ts reads them so too). */
const LINK_FLOOR = 0.01

/** "Pivot – Bob" (an en dash or a hyphen, with spaces) names the link between two bodies. */
const BOTH_ENDS = /\s+[–-]\s+/

export function readingOf(input: {
  bodies: BodyDef[]
  states: Record<string, BodyState>
  starts: Record<string, BodyState>
  links: Link[]
  world: WorldSettings
  t: number
  roles: Record<string, string>
}): Reading {
  const { bodies, states, starts, links, world, t, roles } = input
  const byName = new Map<string, BodyDef>()
  for (const d of bodies) if (!byName.has(d.name)) byName.set(d.name, d)
  const byId = new Map(bodies.map((d) => [d.id, d]))
  // Before the engine reports, a body is where it was typed, moving as it was typed (the Energy readout's rule).
  const startOf = (d: BodyDef): BodyState => starts[d.id] ?? startStateOf(d, massOf(d))
  const nowOf = (d: BodyDef): BodyState => states[d.id] ?? startOf(d)

  const linkFor = (name: string): Link | undefined => {
    const body = byName.get(name)
    const joins = (l: Link) => byId.has(l.a) && byId.has(l.b) && l.a !== l.b
    if (body) return links.find((l) => joins(l) && (l.a === body.id || l.b === body.id))
    const ends = name.split(BOTH_ENDS)
    if (ends.length !== 2) return undefined
    const [p, q] = ends.map((n) => byName.get(n))
    if (!p || !q) return undefined
    return links.find((l) => joins(l) && ((l.a === p.id && l.b === q.id) || (l.a === q.id && l.b === p.id)))
  }

  const out: Reading = { t, g: world.gravity, datum: groundTopOf(bodies), stepRate: stepRateOf(world), bodies: {}, links: {}, rho: world.airDensity }
  for (const [role, name] of Object.entries(roles)) {
    const d = byName.get(name)
    if (d) out.bodies[role] = { def: d, state: nowOf(d), start: startOf(d) } satisfies BodyReading
    const link = linkFor(name)
    if (!link) continue
    const a = byId.get(link.a)!
    const b = byId.get(link.b)!
    // It hangs from its fixed end: a pendulum's angle is the bob's from straight below the pivot,
    // whichever way round the student joined them.
    const [top, end] = a.motion === 'dynamic' && b.motion !== 'dynamic' ? [b, a] : [a, b]
    const ends: [V3, V3] = [nowOf(top).position, nowOf(end).position]
    const startEnds: [V3, V3] = [startOf(top).position, startOf(end).position]
    out.links[role] = { link, stretch: springStretch(link, ends[0], ends[1]), ends, startEnds } satisfies LinkReading
  }
  return out
}

const DEG = 180 / Math.PI

/** A link's angle from straight down, in degrees (0 hanging, 90 level, 180 standing straight up). */
function angleFromDown(ends: [V3, V3]): number {
  const [top, end] = ends
  const dx = end[0] - top[0]
  const dy = end[1] - top[1]
  const dz = end[2] - top[2]
  return Math.atan2(Math.hypot(dx, dz), -dy) * DEG
}

/** The radius of a round body; a cone's first size is its base width, not its radius (energy.ts). */
function radiusOf(def: BodyDef): number | null {
  switch (def.shape) {
    case 'sphere':
    case 'cylinder':
    case 'capsule':
    case 'pulley':
      return def.size[0]
    case 'cone':
      return def.size[0] / 2
    default:
      return null
  }
}

function bodyValue(b: BodyReading, st: BodyState, get: BodyGet, now: boolean, r: Reading): number | null {
  const { def } = b
  const v = st.velocity
  const speed = Math.hypot(v[0], v[1], v[2])
  // The acceleration is the tape's (SB12), and only for now: there is none for the start.
  const acc = now ? b.acc : undefined
  switch (get) {
    case 'mass':
      return st.mass
    case 'speed':
      return speed
    case 'vx':
      return v[0]
    case 'vy':
      return v[1]
    case 'x':
      return st.position[0]
    case 'arm': {
      const beam = r.bodies['Beam'] ?? Object.values(r.bodies).find((b) => b.def.name.toLowerCase().includes('beam'))
      const pivotX = beam ? beam.state.position[0] : 0
      return Math.abs(st.position[0] - pivotX)
    }
    case 'height':
      return st.position[1] - r.datum
    case 'bottom':
      return st.position[1] - halfHeight(def.shape, def.size) - r.datum
    case 'KE':
      return energyOf(def, st, r.g, r.datum).kinetic
    case 'PE':
      return energyOf(def, st, r.g, r.datum).potential
    case 'p':
      return st.mass * speed
    case 'a':
      return acc ? Math.hypot(acc[0], acc[1], acc[2]) : null
    case 'ax':
      return acc ? acc[0] : null
    case 'ay':
      return acc ? acc[1] : null
    case 'radius':
      return radiusOf(def)
    case 'cd':
      return def.dragCd ?? dragCoefficient(def.shape)
    case 'area': {
      if (def.dragArea !== undefined) return def.dragArea
      // As the drag takes it (world.ts beforeStep): the face turned towards the motion. At rest the
      // first motion is a fall, so the face it would meet is the one underneath. (The wind is not in
      // a Reading; in still air the two agree.)
      const dir: V3 = speed > 1e-4 ? [v[0] / speed, v[1] / speed, v[2] / speed] : [0, -1, 0]
      return frontalAreaTurned(def.shape, def.size, st.rotation, dir)
    }
    case 'slopeAngle':
      return def.shape === 'ramp' ? Math.atan2(def.size[1], def.size[0]) * DEG : null
    case 'vAngle':
      // A body at rest has no direction of motion.
      return speed > 0 ? Math.atan2(v[1], v[0]) * DEG : null
  }
}

function linkValue(l: LinkReading, get: LinkGet, now: boolean): number | null | undefined {
  const L0 = Math.max(LINK_FLOOR, l.link.length)
  const ends = now ? l.ends : l.startEnds
  switch (get) {
    case 'k':
      // Only a spring has a k that means anything (a string's stiffness field is unused): a spring
      // card on a pendulum's string is not shown, as if its role were missing.
      return l.link.kind === 'spring' ? Math.max(LINK_FLOOR, l.link.stiffness) : undefined
    case 'L0':
      return L0
    case 'length':
      return ends ? distance(ends[0], ends[1]) : now ? L0 + l.stretch : null
    case 'stretch':
      return now ? l.stretch : ends ? distance(ends[0], ends[1]) - L0 : null
    case 'angle':
      return ends ? angleFromDown(ends) : null
  }
}

/**
 * The value a Source stands for in a Reading: a number; null when the reading cannot give it (the
 * card shows "—"); undefined when its role is not in the reading (the card is not shown).
 */
export function sourceValue(src: Source, r: Reading): number | null | undefined {
  if ('value' in src) return src.value
  if ('world' in src) return src.world === 'g' ? r.g : src.world === 't' ? r.t : (r.rho ?? null)
  if ('pair' in src) {
    const [p, q] = src.pair.map((role) => r.bodies[role])
    if (!p || !q) return undefined
    // Jolt combines a contact this way (AGENTS.md): the bigger restitution, the geometric mean of the frictions.
    return src.get === 'eUsed' ? Math.max(p.def.restitution, q.def.restitution) : Math.sqrt(p.def.friction * q.def.friction)
  }
  if ('link' in src || 'startLink' in src) {
    const role = 'link' in src ? src.link : src.startLink
    const l = r.links[role]
    return l ? linkValue(l, src.get, 'link' in src) : undefined
  }
  const role = 'body' in src ? src.body : src.start
  const b = r.bodies[role]
  if (!b) return undefined
  return 'body' in src ? bodyValue(b, b.state, src.get, true, r) : bodyValue(b, b.start, src.get, false, r)
}

/** Body values that stay the same through a run: a definition's. */
const FIXED_BODY: ReadonlySet<BodyGet> = new Set<BodyGet>(['mass', 'radius', 'cd', 'slopeAngle'])

/**
 * Whether a source stays fixed through a run, so that its value may be a typed given (digits.ts):
 * a definition, the start, g and the air, a plain number. The clock and everything that moves are not.
 */
export function isConstantSource(src: Source): boolean {
  if ('value' in src || 'pair' in src || 'start' in src || 'startLink' in src) return true
  if ('world' in src) return src.world !== 't'
  if ('link' in src) return src.get === 'k' || src.get === 'L0'
  return FIXED_BODY.has(src.get)
}

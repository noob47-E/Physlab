// Double pendulum: chaos twins (SB60, owner item). Three double pendulums from one pivot, 0.1° apart. They are driven
// along the EXACT solution of the double pendulum, not left to the engine: the engine's rods lost 9-19 % of the energy
// in 10 s at any step rate (SB60 T8), which would put the energy's own error in the gap between the twins.
//
// The solution is SB39's RK4 (sim/reference.ts) on a fixed grid: four 1/4800 s substeps for every tick of the engine's
// 1/1200 s clock, so every step rate (60, 120, 240, 600) lands on grid states, and a twin's state at a moment is the
// same however and in whatever order it is asked for (a replay, a branch, a keyframe restore): each tick's state is the
// same function of the tick before, and the walk starts from a kept state of that same walk. Two twins with exactly the
// same start are therefore bit-identical, and the chaos comes from the 0.1° alone.

import type { BodyDef, Driver, Link } from './types'
import type { V3 } from '../math/vec'
import { rk4, systems } from './reference'
import { makeBody } from './store'
import { materialById } from './materials'
import { SimWorld } from './world'

/** The experiment's numbers: 1 m rods, 1 kg bobs, a pivot 4 m up, the twins at 120° and −10°, 0.1° apart. */
export const CHAOS = { L1: 1, L2: 1, mass: 1, upper: 120, lower: -10, apart: 0.1, pivot: [0, 4, 0] as V3, radius: 0.08 }

/** The experiment's own rods are named so: only a pair joined by them is driven (a scene of the student's own that
 *  happens to use the names Pivot, Upper 1 and Lower 1 is left to the engine). */
const CHAOS_ROD = 'chaos-rod-'

const DEG = Math.PI / 180
/** The engine's clock (world.ts): 1200 ticks a second; every step rate is a whole number of ticks. */
const TICKS = 1200
/** RK4 substeps per tick. */
const SUB = 4
/** A state kept every KEEP ticks (0.1 s): a jump back (replay, Reset) walks at most this many ticks again. */
const KEEP = 120
/** Paths kept at once (each start, length and mass set is one); the one asked for longest ago goes first. */
const MAX_PATHS = 16

interface Path {
  f: ReturnType<typeof systems.doublePendulum>
  /** The state at ticks 0, KEEP, 2·KEEP … (four numbers each), grown as the walk passes them. */
  kept: number[]
  /** Where the walk last stood: the next ask is nearly always this tick or the next step's. */
  tick: number
  state: number[]
}
const paths = new Map<string, Path>()

const stepTick = (p: Path, y: number[]) => rk4(p.f, y, 0, 1 / TICKS, 1 / (TICKS * SUB))

/** The grid state at a whole tick: from where the walk stands if that is on the way, else from the kept state before. */
function atTick(p: Path, n: number): number[] {
  if (n < p.tick || n - p.tick > KEEP) {
    const k = Math.min(Math.floor(n / KEEP), p.kept.length / 4 - 1)
    if (k * KEEP > p.tick || n < p.tick) {
      p.tick = k * KEEP
      p.state = p.kept.slice(k * 4, k * 4 + 4)
    }
  }
  while (p.tick < n) {
    p.state = stepTick(p, p.state)
    p.tick += 1
    if (p.tick % KEEP === 0 && p.tick / KEEP === p.kept.length / 4) p.kept.push(...p.state)
  }
  return p.state
}

/**
 * A double pendulum's state (θ1, θ2 in radians from the straight-down vertical, ω1, ω2) at time t, from a start at
 * rest with the arms at `upperDeg` and `lowerDeg`. Lengths and masses are CHAOS's unless given.
 */
export function twinState(upperDeg: number, lowerDeg: number, g: number, t: number, L1 = CHAOS.L1, L2 = CHAOS.L2, m1 = CHAOS.mass, m2 = CHAOS.mass): number[] {
  const key = `${upperDeg}|${lowerDeg}|${g}|${L1}|${L2}|${m1}|${m2}`
  let p = paths.get(key)
  if (p) paths.delete(key)
  else {
    const start = [upperDeg * DEG, lowerDeg * DEG, 0, 0]
    p = { f: systems.doublePendulum(m1, m2, L1, L2, g), kept: [...start], tick: 0, state: start }
    if (paths.size >= MAX_PATHS) paths.delete(paths.keys().next().value!)
  }
  // Put back last in the map's order: the most recently asked for.
  paths.set(key, p)
  const tick = Math.max(0, t * TICKS)
  const whole = Math.floor(tick + 1e-9)
  const y = atTick(p, whole)
  const part = tick - whole
  // Between two ticks (a time no step rate lands on; a millionth of a tick is the clock's own rounding): carried on
  // from the tick before, on the same substep size.
  return part > 1e-6 ? rk4(p.f, y, 0, part / TICKS, 1 / (TICKS * SUB)) : [...y]
}

type Bob = { position: V3; velocity: V3; rotation: [number, number, number, number] }
const turned = (a: number): [number, number, number, number] => [0, 0, Math.sin(a / 2), Math.cos(a / 2)]

/** Where the two bobs are, how they move and how they are turned (each with its arm), from the pivot, the arm lengths and a state. */
function bobs(pivot: V3, L1: number, L2: number, s: number[]): { upper: Bob; lower: Bob } {
  const [t1, t2, w1, w2] = s
  const p1: V3 = [pivot[0] + L1 * Math.sin(t1), pivot[1] - L1 * Math.cos(t1), pivot[2]]
  const v1: V3 = [L1 * w1 * Math.cos(t1), L1 * w1 * Math.sin(t1), 0]
  const p2: V3 = [p1[0] + L2 * Math.sin(t2), p1[1] - L2 * Math.cos(t2), pivot[2]]
  const v2: V3 = [v1[0] + L2 * w2 * Math.cos(t2), v1[1] + L2 * w2 * Math.sin(t2), 0]
  return { upper: { position: p1, velocity: v1, rotation: turned(t1) }, lower: { position: p2, velocity: v2, rotation: turned(t2) } }
}

/**
 * When the lower bobs of the experiment's first two twins (0.1° apart) are first more than `metres` apart, read at
 * every step of `rate` from the start: the numbers the preset's sentence quotes. Undefined if not within `until` s.
 */
export function gapPasses(metres: number, rate = 600, until = 20, g = 9.81): number | undefined {
  for (let k = 0; k <= until * rate; k++) {
    const t = k / rate
    const a = bobs(CHAOS.pivot, CHAOS.L1, CHAOS.L2, twinState(CHAOS.upper, CHAOS.lower, g, t)).lower.position
    const b = bobs(CHAOS.pivot, CHAOS.L1, CHAOS.L2, twinState(CHAOS.upper + CHAOS.apart, CHAOS.lower, g, t)).lower.position
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > metres) return t
  }
  return undefined
}

/**
 * The experiment's bodies and rods for any set of starts ([upper°, lower°] each): one pivot, and for twin k a bob
 * "Upper k" and a bob "Lower k" (the lower one traced), in the theme's k-th colour. The bobs are kinematic: the world
 * moves them along the exact solution (`chaosDrivers`), so they never touch anything and nothing pushes them.
 */
export function buildChaos(starts: [number, number][]): { bodies: BodyDef[]; links: Link[] } {
  const pivot: BodyDef = { ...makeBody('box', 'Pivot', CHAOS.pivot), size: [0.12, 0.12, 0.12], motion: 'static', material: 'steel', color: materialById('steel').color }
  const bodies: BodyDef[] = [pivot]
  const links: Link[] = []
  starts.forEach(([up, low], i) => {
    const k = i + 1
    const s = bobs(CHAOS.pivot, CHAOS.L1, CHAOS.L2, [up * DEG, low * DEG, 0, 0])
    const bob = (name: string, at: V3, turnDeg: number, trace: boolean): BodyDef => ({
      ...makeBody('sphere', name, at),
      size: [CHAOS.radius, CHAOS.radius, CHAOS.radius],
      rotation: [0, 0, turnDeg],
      motion: 'kinematic',
      material: 'steel',
      massMode: 'mass',
      mass: CHAOS.mass,
      color: `var(--sim-c${((i % 8) + 1)})`,
      angularDamping: 0,
      linearDamping: 0,
      trace,
      showArrows: false
    })
    const upper = bob(`Upper ${k}`, s.upper.position, up, false)
    const lower = bob(`Lower ${k}`, s.lower.position, low, true)
    bodies.push(upper, lower)
    links.push({ id: `${CHAOS_ROD}${k}a`, kind: 'rod', a: pivot.id, b: upper.id, length: CHAOS.L1, stiffness: 0, damping: 0 })
    links.push({ id: `${CHAOS_ROD}${k}b`, kind: 'rod', a: upper.id, b: lower.id, length: CHAOS.L2, stiffness: 0, damping: 0 })
  })
  return { bodies, links }
}

interface ChaosPair {
  k: number
  pivot: BodyDef
  upper: BodyDef
  lower: BodyDef
}

/** The twins of a scene: each "Upper k" / "Lower k" pair, both kinematic, hung from "Pivot" by the experiment's own rods. */
export function chaosPairs(bodies: BodyDef[], links: Link[]): ChaosPair[] {
  const pivot = bodies.find((b) => b.name === 'Pivot')
  if (!pivot) return []
  const rod = (a: BodyDef, b: BodyDef) => links.some((l) => l.kind === 'rod' && l.id.startsWith(CHAOS_ROD) && ((l.a === a.id && l.b === b.id) || (l.a === b.id && l.b === a.id)))
  const out: ChaosPair[] = []
  for (const upper of bodies) {
    const m = /^Upper (\d+)$/.exec(upper.name)
    if (!m) continue
    const lower = bodies.find((b) => b.name === `Lower ${m[1]}`)
    if (!lower || upper.motion !== 'kinematic' || lower.motion !== 'kinematic') continue
    if (!rod(pivot, upper) || !rod(upper, lower)) continue
    out.push({ k: Number(m[1]), pivot, upper, lower })
  }
  return out.sort((a, b) => a.k - b.k)
}

/** An arm's angle from the straight-down vertical, in degrees (−180 to 180), from where its two ends are. */
export const armAngle = (from: readonly number[], to: readonly number[]): number => Math.atan2(to[0] - from[0], from[1] - to[1]) / DEG

/** The smaller way round between two angles in degrees: 179° and −179° are 2° apart. */
export const angleApart = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/**
 * What moves the twins: each pair `chaosPairs` finds follows the exact path from where its definition puts it (so an
 * edited start, rod length or mass is followed too), at the world's gravity. Nothing for a scene without them.
 */
export function chaosDrivers(bodies: BodyDef[], links: Link[], g: number): Driver[] {
  const out: Driver[] = []
  for (const { pivot, upper, lower } of chaosPairs(bodies, links)) {
    const L1 = Math.hypot(upper.position[0] - pivot.position[0], upper.position[1] - pivot.position[1])
    const L2 = Math.hypot(lower.position[0] - upper.position[0], lower.position[1] - upper.position[1])
    const a1 = armAngle(pivot.position, upper.position)
    const a2 = armAngle(upper.position, lower.position)
    const m1 = SimWorld.massOf(upper)
    const m2 = SimWorld.massOf(lower)
    const at = (t: number) => bobs(pivot.position, L1, L2, twinState(a1, a2, g, t, L1, L2, m1, m2))
    out.push({ bodyId: upper.id, at: (t) => at(t).upper })
    out.push({ bodyId: lower.id, at: (t) => at(t).lower })
  }
  return out
}

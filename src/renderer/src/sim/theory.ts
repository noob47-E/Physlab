// Theory and the honest gap (SB15, I-8): every demo experiment knows its formula's answer, measures the run against it,
// and says why the two differ.
//
// `predict(built)` works from the BUILT preset (its masses, sizes, speeds, links and g), through sim/predict.ts, never
// from the numbers in its sentence: change a mass in the build and the prediction follows. `measure(tape, built)` reads
// the recorded run (sim/measure.ts and the tape's own contacts). `gapOf` gives the gap in per cent and its reason: the
// engine's limits that apply (sim/limits.ts) when the scene has any, else the step's own error (sim/stepError.ts).
// docs/knowledge/sandbox-cards.md ("Theory") has the table of scenes.

import type { BodyDef, Link, WorldSettings } from './types'
import { DEFAULT_WORLD } from './types'
import { groundTopOf } from './energy'
import { SimWorld } from './world'
import { REC_FLOATS } from './tape'
import { isContact, type RunTape } from './recorder'
import { dragCoefficient, frontalArea } from './materials'
import * as P from './predict'
import { bounces, peaks, periodic, stopDistance } from './measure'
import { flightTimeShortfall, flightTop, gapSentence } from './stepError'
import { LIMITS, limitsFor, type SceneFacts } from './limits'
import { simulateChain1D } from './collisionMath'
import { fmtLabel } from '../math/format'

/** An experiment as its preset builds it. */
export interface Built {
  bodies: BodyDef[]
  world?: Partial<WorldSettings>
  links?: Link[]
}

/** One formula's answer for the experiment, from its start values. */
export interface Prediction {
  /** The preset it belongs to. */
  scene: string
  key: string
  label: string
  value: number
  unit: string
  /** The formula with the start values in it, in plain text. */
  formula: string
  /** What of the engine's limits this quantity meets (sim/limits.ts), worked out from the build. */
  facts: SceneFacts
  /** The step's own error for this quantity when no limit applies (sim/stepError.ts gapSentence). */
  step: { kind: 'flight' | 'fall' | 'spring'; values: number[] } | null
  /** A number to go with the limit's sentence ("a 15° swing is not small: … = 2.849 s"). */
  note?: string
  /** The same formula with the step's own error worked in (sim/stepError.ts): a run that matches it agrees. */
  stepped?: (rate: number) => number
  /** The step's error as a sentence with its number, when gapSentence has no form for this quantity. */
  stepNote?: (rate: number) => string
  /** How far (in the quantity's unit) the step can move the measurement by itself, at most. */
  allowance?: (rate: number) => number
}

/** The same quantity measured off the recorded run. */
export interface Measured {
  key: string
  value: number
}

export interface Theory {
  /** The formula cards the experiment opens with (SB4's ids). */
  cards: string[]
  /** Role → body name in the preset, as the cards read them. */
  roles: Record<string, string>
  predict(built: Built): Prediction[]
  /** Measured off the tape, up to `step` (the tape's end when left out). */
  measure(tape: RunTape, built: Built, step?: number): Measured[]
  /** How far, in per cent, a measurement may stray from the formula at this step rate and still count as agreeing. */
  tolerance(rate: number): number
}

const DEG = Math.PI / 180
const NO_FACTS: SceneFacts = {
  anyBounce: false,
  anySliding: false,
  anySpinDampingAboveZero: false,
  anyRope: false,
  anyEngineSpring: false,
  pendulumAmplitudeDeg: null,
  anyRolling: false,
  airDensity: 0,
  maxSpeed: 0,
  maxDistanceFromOrigin: 0,
  slowestBounceSpeed: null
}
const facts = (over: Partial<SceneFacts> = {}): SceneFacts => ({ ...NO_FACTS, ...over })
const num = (v: number, places = 3) => fmtLabel(v, places)

const worldOf = (b: Built): WorldSettings => ({ ...DEFAULT_WORLD, ...(b.world ?? {}) })
/** An experiment that was edited until a body its theory needs is gone or renamed. */
class MissingBody extends Error {}
const named = (b: Built, name: string): BodyDef => {
  const d = b.bodies.find((x) => x.name === name)
  if (!d) throw new MissingBody(`The experiment has no body called ${name}.`)
  return d
}

/**
 * A theory as written here: with `fits`, the conditions its formula needs (a ball that can roll, a rope that is taut, a
 * head-on hit). The experiment's presetId stays through edits, so an edited scene may no longer fit: then the theory
 * gives nothing rather than a formula that is not about this scene.
 */
type Entry = Theory & { fits?: (b: Built) => boolean }
const same = (a: number, b: number) => Math.abs(a - b) < 1e-6
const massOf = (d: BodyDef): number => SimWorld.massOf(d)
/** How far a body's centre sits above what it rests on: a ball's radius, a box's half height. */
const halfHeight = (d: BodyDef): number => (d.shape === 'sphere' ? d.size[0] : d.size[1] / 2)
const speedOf = (v: readonly number[]) => Math.hypot(v[0], v[1], v[2])

// ------------------------------------------------------------------ the run, read off the tape

interface Track {
  t: number[]
  x: number[]
  y: number[]
  vx: number[]
  vy: number[]
}

function track(tape: RunTape, id: string, upTo: number): Track {
  const i = tape.layout.bodies.indexOf(id)
  const out: Track = { t: [], x: [], y: [], vx: [], vy: [] }
  if (i < 0) return out
  for (let s = tape.first; s <= upTo; s++) {
    const r = tape.record(s)
    if (!r) continue
    const o = i * REC_FLOATS
    out.t.push(tape.timeOf(s))
    out.x.push(r[o])
    out.y.push(r[o + 1])
    out.vx.push(r[o + 7])
    out.vy.push(r[o + 8])
  }
  return out
}

/** The first step at which the engine found a body hitting something (closing faster than 5 cm/s), after `after`. */
function hitStep(tape: RunTape, id: string, after: number, upTo: number): number | null {
  for (const { step, e } of tape.eventsIn(after + 1, upTo)) if (isContact(e) && (e.a === id || e.b === id) && e.approachSpeed > 0.05) return step
  return null
}

/**
 * Where and when a body in free flight reached the height `groundY` (its centre's height when it touches): from the
 * last record before the engine found the hit, carried on under gravity to that height. The stepped path up to there is
 * the run's own, so the step's error stays in the answer; only the contact's own handling is left out.
 */
function landing(tape: RunTape, id: string, groundY: number, g: number, after: number, upTo: number): { t: number; x: number; vy: number } | null {
  const s = hitStep(tape, id, after, upTo)
  if (s === null || s - 1 < tape.first) return null
  const r = tape.record(s - 1)
  const i = tape.layout.bodies.indexOf(id)
  if (!r || i < 0) return null
  const o = i * REC_FLOATS
  const [x, y, vx, vy] = [r[o], r[o + 1], r[o + 7], r[o + 8]]
  const tau = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * g * (y - groundY)))) / g
  return { t: tape.timeOf(s - 1) + tau, x: x + vx * tau, vy: vy - g * tau }
}

/** A value of a track at a time, between the two records around it. */
function at(t: number[], v: number[], time: number): number {
  for (let k = 0; k + 1 < t.length; k++) if (t[k] <= time && time <= t[k + 1]) return v[k] + ((v[k + 1] - v[k]) * (time - t[k])) / (t[k + 1] - t[k])
  return v[v.length - 1]
}

const endOf = (tape: RunTape, step?: number) => Math.min(tape.last, Math.floor(step ?? tape.last))
const idOf = (b: Built, name: string) => named(b, name).id

// ------------------------------------------------------------------ the experiments

/** A drop: the time and the speed it lands with, from rest or thrown straight up or down at its start speed u. */
function dropTheory(scene: string, names: string[]): Entry {
  return {
    cards: ['suvat-v', 'suvat-s', 'energy'],
    roles: { A: names[0] },
    predict: (b) => {
      const g = worldOf(b).gravity
      return names.flatMap((name) => {
        const d = named(b, name)
        const h = d.position[1] - halfHeight(d) - groundTopOf(b.bodies)
        const u = d.velocity[1]
        // From rest it is predict.ts's free fall; thrown, the same suvat solved for the landing: h + ut − ½gt² = 0.
        const f = u === 0 ? P.freeFall(h, g) : { time: (u + Math.sqrt(u * u + 2 * g * h)) / g, speed: Math.sqrt(u * u + 2 * g * h) }
        const tag = names.length > 1 ? ` (${name})` : ''
        const air = facts({ airDensity: worldOf(b).airDensity })
        return [
          {
            scene,
            key: `time:${name}`,
            label: `time to land${tag}`,
            value: f.time,
            unit: 's',
            formula: u === 0 ? `√(2h/g) = √(2 × ${num(h)} / ${num(g)})` : `(u + √(u² + 2gh)) / g, u = ${num(u)} m/s, h = ${num(h)} m`,
            facts: air,
            step: null,
            stepped: (rate: number) => f.time - flightTimeShortfall(u, h, 0, g, rate),
            stepNote: (rate: number) => `the 1/${rate} s step: it lands δ = Δt g T / 2v = ${num(flightTimeShortfall(u, h, 0, g, rate) * 1000, 1)} ms early`
          },
          { scene, key: `speed:${name}`, label: `landing speed${tag}`, value: f.speed, unit: 'm/s', formula: u === 0 ? `√(2gh) = √(2 × ${num(g)} × ${num(h)})` : `√(u² + 2gh)`, facts: air, step: { kind: 'fall' as const, values: [g] } }
        ]
      })
    },
    measure: (tape, b, step) => {
      const g = worldOf(b).gravity
      const end = endOf(tape, step)
      return names.flatMap((name) => {
        const d = named(b, name)
        const land = landing(tape, d.id, groundTopOf(b.bodies) + halfHeight(d), g, tape.first, end)
        return land
          ? [
              { key: `time:${name}`, value: land.t - tape.timeOf(tape.first) },
              { key: `speed:${name}`, value: Math.abs(land.vy) }
            ]
          : []
      })
    },
    tolerance: (rate) => (rate >= 600 ? 0.5 : 1)
  }
}

const THEORIES: Record<string, Entry> = {
  fall: dropTheory('fall', ['A']),
  moon: dropTheory('moon', ['A']),
  drop: dropTheory('drop', ['Heavy', 'Light']),

  projectile: {
    // The range and flight formulas land at the launch height: the ball must start on the floor.
    fits: (b) => same(named(b, 'P').position[1], groundTopOf(b.bodies) + halfHeight(named(b, 'P'))),
    cards: ['projectile-range', 'projectile-top', 'flight-time'],
    roles: { A: 'P' },
    predict: (b) => {
      const d = named(b, 'P')
      const g = worldOf(b).gravity
      const v = Math.hypot(d.velocity[0], d.velocity[1])
      const angle = Math.atan2(d.velocity[1], d.velocity[0]) / DEG
      const p = P.projectile(v, angle, g)
      const step = { kind: 'flight' as const, values: [d.velocity[0], 0, 0, d.velocity[1], g] }
      return [
        { scene: 'projectile', key: 'range', label: 'range', value: p.range, unit: 'm', formula: `v² sin 2θ / g = ${num(v)}² sin ${num(2 * angle, 1)}° / ${num(g)}`, facts: facts(), step, stepped: (rate: number) => p.range - d.velocity[0] * flightTimeShortfall(d.velocity[1], 0, 0, g, rate) },
        {
          scene: 'projectile',
          key: 'top',
          label: 'greatest height above the start',
          value: p.top,
          unit: 'm',
          formula: `v² sin² θ / 2g`,
          facts: facts(),
          step: null,
          stepped: (rate: number) => flightTop(d.velocity[1], g, rate),
          stepNote: (rate: number) => `the 1/${rate} s step: each step starts the climb gΔt/2 slower, so the top is (v_y − gΔt/2)² / 2g = ${num(flightTop(d.velocity[1], g, rate))} m`
        },
        { scene: 'projectile', key: 'flight', label: 'time of flight', value: p.flightTime, unit: 's', formula: `2v sin θ / g`, facts: facts(), step, stepped: (rate: number) => p.flightTime - flightTimeShortfall(d.velocity[1], 0, 0, g, rate) }
      ]
    },
    measure: (tape, b, step) => {
      const d = named(b, 'P')
      const g = worldOf(b).gravity
      const end = endOf(tape, step)
      const tr = track(tape, d.id, end)
      const land = landing(tape, d.id, d.position[1], g, tape.first + 1, end)
      if (!land) return []
      const top = Math.max(...peaks(tr.t, tr.y).map((p) => p.y), ...tr.y.slice(0, 2)) - d.position[1]
      return [
        { key: 'range', value: land.x - d.position[0] },
        { key: 'top', value: top },
        { key: 'flight', value: land.t - tape.timeOf(tape.first) }
      ]
    },
    tolerance: (rate) => (rate >= 600 ? 0.15 : 0.5)
  },

  cliff: {
    // It slides off a ledge: the ball must start on top of one.
    fits: (b) => {
      const [d, ledge] = [named(b, 'P'), named(b, 'Ledge')]
      return Math.abs(d.position[1] - halfHeight(d) - (ledge.position[1] + ledge.size[1] / 2)) < 0.01
    },
    cards: ['suvat-s', 'flight-time'],
    roles: { A: 'P' },
    predict: (b) => {
      const d = named(b, 'P')
      const g = worldOf(b).gravity
      const h = d.position[1] - halfHeight(d) - groundTopOf(b.bodies)
      const p = P.horizontalLaunch(d.velocity[0], h, g)
      const step = { kind: 'flight' as const, values: [d.velocity[0], h, 0, 0, g] }
      return [
        { scene: 'cliff', key: 'time', label: 'time falling', value: p.time, unit: 's', formula: `√(2h/g) = √(2 × ${num(h)} / ${num(g)})`, facts: facts(), step },
        { scene: 'cliff', key: 'distance', label: 'lands out from the edge', value: p.distance, unit: 'm', formula: `v √(2h/g) = ${num(d.velocity[0])} × ${num(p.time)}`, facts: facts(), step }
      ]
    },
    measure: (tape, b, step) => {
      const d = named(b, 'P')
      const ledge = named(b, 'Ledge')
      const edge = ledge.position[0] + ledge.size[0] / 2
      const g = worldOf(b).gravity
      const end = endOf(tape, step)
      const tr = track(tape, d.id, end)
      // The fall begins at the last step it was still level: the engine lets go of the ball a little before its centre
      // passes the edge, so the time and the distance are counted from where it really left, not from the edge.
      const k = tr.vy.findIndex((vy, i) => i > 0 && vy < -1e-3)
      if (k < 1) return []
      const land = landing(tape, d.id, groundTopOf(b.bodies) + halfHeight(d), g, tape.first, end)
      if (!land) return []
      return [
        { key: 'time', value: land.t - tr.t[k - 1] },
        { key: 'distance', value: land.x - tr.x[k - 1] },
        { key: 'leftAt', value: tr.x[k - 1] - edge }
      ]
    },
    tolerance: (rate) => (rate >= 600 ? 1 : 2)
  },

  terminal: {
    cards: ['weight', 'suvat-v'],
    roles: { A: 'Foam' },
    predict: (b) => {
      const d = named(b, 'Foam')
      const w = worldOf(b)
      const m = massOf(d)
      const cd = d.dragCd ?? dragCoefficient(d.shape)
      const area = d.dragArea ?? frontalArea(d.shape, d.size, [0, -1, 0])
      const vt = P.terminalSpeed(m, w.airDensity, cd, area, w.gravity)
      const h = d.position[1] - halfHeight(d) - groundTopOf(b.bodies)
      // Falling from rest under quadratic drag: v(h) = v_t √(1 − e^(−2gh/v_t²)).
      const floor = vt * Math.sqrt(1 - Math.exp((-2 * w.gravity * h) / (vt * vt)))
      const air = facts({ airDensity: w.airDensity })
      return [
        { scene: 'terminal', key: 'vt', label: 'terminal speed', value: vt, unit: 'm/s', formula: `√(2mg / ρ C A) = √(2 × ${num(m)} × ${num(w.gravity)} / (${num(w.airDensity)} × ${num(cd, 2)} × ${num(area, 4)}))`, facts: air, step: null },
        { scene: 'terminal', key: 'floor', label: 'speed at the floor', value: floor, unit: 'm/s', formula: `v_t √(1 − e^(−2gh/v_t²)), h = ${num(h)} m`, facts: air, step: null }
      ]
    },
    measure: (tape, b, step) => {
      const d = named(b, 'Foam')
      const end = endOf(tape, step)
      const s = hitStep(tape, d.id, tape.first, end)
      if (s === null) return []
      const r = tape.record(s - 1)!
      const o = tape.layout.bodies.indexOf(d.id) * REC_FLOATS
      return [{ key: 'floor', value: speedOf([r[o + 7], r[o + 8], r[o + 9]]) }]
    },
    tolerance: () => 1
  },

  ramp: {
    // √(10gh/7) is a solid ball rolling without slipping: a box slides, a cylinder rolls at √(4gh/3).
    fits: (b) => named(b, 'A').shape === 'sphere' && named(b, 'Slope').shape === 'ramp',
    cards: ['energy', 'ke', 'pe'],
    roles: { A: 'A' },
    predict: (b) => {
      const d = named(b, 'A')
      const g = worldOf(b).gravity
      // The centre ends a radius above the floor.
      const h = d.position[1] - halfHeight(d) - groundTopOf(b.bodies)
      const v = P.rollingSpeed(h, g, 0.4)
      return [
        { scene: 'ramp', key: 'bottom', label: 'speed at the bottom', value: v, unit: 'm/s', formula: `√(10gh/7) = √(10 × ${num(g)} × ${num(h)} / 7)`, facts: facts({ anyRolling: true }), step: null }
      ]
    },
    measure: (tape, b, step) => {
      const d = named(b, 'A')
      const slope = named(b, 'Slope')
      const foot = slope.position[0] + slope.size[0] / 2
      const tr = track(tape, d.id, endOf(tape, step))
      const k = tr.x.findIndex((x) => x >= foot)
      if (k < 1) return []
      return [{ key: 'bottom', value: Math.hypot(tr.vx[k], tr.vy[k]) }]
    },
    tolerance: () => 3
  },

  friction: {
    cards: ['suvat-s', 'ke'],
    roles: { A: 'Crate' },
    predict: (b) => {
      const d = named(b, 'Crate')
      const floor = b.bodies.find((x) => x.shape === 'ground')!
      const g = worldOf(b).gravity
      const mu = Math.sqrt(d.friction * floor.friction)
      const v = speedOf(d.velocity)
      return [
        { scene: 'friction', key: 'stop', label: 'stopping distance', value: P.stoppingDistance(v, mu, g), unit: 'm', formula: `v² / 2μg = ${num(v)}² / (2 × ${num(mu, 2)} × ${num(g)})`, facts: facts({ anySliding: true }), step: null }
      ]
    },
    measure: (tape, b, step) => {
      const tr = track(tape, idOf(b, 'Crate'), endOf(tape, step))
      const s = stopDistance(tr.t, tr.x, tr.vx)
      return s ? [{ key: 'stop', value: s.distance }] : []
    },
    tolerance: () => 2
  },

  atwood: pulleyTheory('atwood', 'm₁', 'm₂'),
  lift: pulleyTheory('lift', 'Crate', 'Weight'),

  crane: {
    // mg is the tension only while the crate hangs: off the floor, on a rope as long as the gap, not slack.
    fits: (b) => {
      const crate = named(b, 'Crate')
      const beam = named(b, 'Beam')
      const rope = (b.links ?? []).find((l) => l.kind === 'rope' && [l.a, l.b].includes(crate.id))
      const gap = beam.position[1] - beam.size[1] / 2 - (crate.position[1] + crate.size[1] / 2)
      return !!rope && crate.position[1] - crate.size[1] / 2 > groundTopOf(b.bodies) + 0.01 && rope.length <= gap + 0.02
    },
    cards: ['weight'],
    roles: { A: 'Crate' },
    predict: (b) => {
      const d = named(b, 'Crate')
      const g = worldOf(b).gravity
      return [{ scene: 'crane', key: 'tension', label: 'tension in the rope at rest', value: massOf(d) * g, unit: 'N', formula: `mg = ${num(massOf(d))} × ${num(g)}`, facts: facts({ anyRope: true }), step: null }]
    },
    measure: (tape, b, step) => {
      const d = named(b, 'Crate')
      const tr = track(tape, d.id, endOf(tape, step))
      if (tr.t.length < 2) return []
      // T = m(g + a), with a from how the crate moved over the run (at rest: 0).
      const span = tr.t[tr.t.length - 1] - tr.t[0]
      const a = span > 0 ? (tr.vy[tr.vy.length - 1] - tr.vy[0]) / span : 0
      return [{ key: 'tension', value: massOf(d) * (worldOf(b).gravity + a) }]
    },
    tolerance: () => 1
  },

  bounce: {
    fits: (b) => named(b, 'Ball').velocity.every((v) => v === 0),
    cards: ['pe', 'ke', 'energy'],
    roles: { A: 'Ball' },
    predict: (b) => {
      const d = named(b, 'Ball')
      const floor = b.bodies.find((x) => x.shape === 'ground')!
      const g = worldOf(b).gravity
      const h = d.position[1] - halfHeight(d) - groundTopOf(b.bodies)
      const e = Math.max(d.restitution, floor.restitution)
      const tops = P.bounceTops(h, e, 3)
      const times = P.bounceTimes(h, e, 3, g)
      const f = facts({ anyBounce: true, slowestBounceSpeed: Math.sqrt(2 * g * tops[2]) })
      return [
        ...tops.map((top, k) => {
          // The engine meets the floor part-way through a step and turns the ball round up to one step of its fall above it.
          const vIn = Math.sqrt(2 * g * (k === 0 ? h : tops[k - 1]))
          return {
            scene: 'bounce',
            key: `top${k + 1}`,
            label: `top of bounce ${k + 1}`,
            value: top,
            unit: 'm',
            formula: `e^${2 * (k + 1)} h = ${num(e, 3)}^${2 * (k + 1)} × ${num(h)}`,
            facts: f,
            step: null,
            allowance: (rate: number) => vIn / rate,
            stepNote: (rate: number) => `At 1/${rate} s a step the engine turns the ball round up to v Δt = ${num((vIn / rate) * 100, 1)} cm above the floor, so a top can read that much high.`
          }
        }),
        ...times.map((t, k) => ({ scene: 'bounce', key: `hit${k + 1}`, label: `contact ${k + 1}`, value: t, unit: 's', formula: k === 0 ? `√(2h/g)` : `previous + 2 e^${k} √(2gh) / g`, facts: f, step: null }))
      ]
    },
    measure: (tape, b, step) => {
      const d = named(b, 'Ball')
      const tr = track(tape, d.id, endOf(tape, step))
      const base = groundTopOf(b.bodies) + halfHeight(d)
      const hits = bounces(tr.t, tr.vy).slice(0, 3)
      const tops = peaks(tr.t, tr.y).filter((p) => p.t > (hits[0]?.t ?? Infinity)).slice(0, 3)
      const t0 = tape.timeOf(tape.first)
      return [...tops.map((p, k) => ({ key: `top${k + 1}`, value: p.y - base })), ...hits.map((h, k) => ({ key: `hit${k + 1}`, value: h.t - t0 }))]
    },
    tolerance: () => 1.5
  },

  collision: collisionTheory('collision'),
  sticky: collisionTheory('sticky'),

  recoil: {
    cards: ['momentum', 'momentum-total'],
    roles: { A: 'Gun', B: 'Bullet' },
    predict: (b) =>
      ['Gun', 'Bullet'].map((name) => {
        const d = named(b, name)
        return { scene: 'recoil', key: `p:${name}`, label: `momentum of the ${name.toLowerCase()}`, value: massOf(d) * d.velocity[0], unit: 'kg m/s', formula: `m v = ${num(massOf(d))} × ${num(d.velocity[0])}`, facts: facts(), step: null }
      }),
    measure: (tape, b, step) => {
      const end = Math.min(endOf(tape, step), tape.first + 1)
      return ['Gun', 'Bullet'].map((name) => {
        const d = named(b, name)
        const tr = track(tape, d.id, end)
        return { key: `p:${name}`, value: massOf(d) * tr.vx[tr.vx.length - 1] }
      })
    },
    tolerance: () => 0.5
  },

  cradle: {
    cards: ['momentum', 'ke'],
    roles: { A: 'B1', B: 'B5' },
    predict: (b) => {
      const balls = [1, 2, 3, 4, 5].map((k) => named(b, `B${k}`))
      const u = speedOf(balls[0].velocity)
      const e = Math.max(...balls.map((d) => d.restitution))
      // The first ball swings out and comes back at the speed it left with, then hits the row.
      const chain = simulateChain1D(
        balls.map((d, k) => ({ x: d.position[0], r: d.size[0], m: massOf(d), v: k === 0 ? u : 0 })),
        e
      )
      return [{ scene: 'cradle', key: 'last', label: 'speed the last ball leaves with', value: Math.abs(chain.v[4]), unit: 'm/s', formula: `five equal balls, e = ${num(e, 3)}, one at a time`, facts: facts({ anyBounce: true }), step: null }]
    },
    measure: (tape, b, step) => {
      const tr = track(tape, idOf(b, 'B5'), endOf(tape, step))
      return tr.vx.length ? [{ key: 'last', value: Math.max(...tr.vx.map(Math.abs)) }] : []
    },
    tolerance: () => 2
  },

  pendulum: {
    cards: ['pendulum-T'],
    roles: { A: 'Bob' },
    predict: (b) => {
      const bob = named(b, 'Bob')
      const pivot = named(b, 'Pivot')
      const g = worldOf(b).gravity
      const dx = bob.position[0] - pivot.position[0]
      const dy = pivot.position[1] - bob.position[1]
      const L = Math.hypot(dx, dy)
      const amp = Math.atan2(Math.abs(dx), dy) / DEG
      const small = P.pendulumSmall(L, g)
      const large = P.pendulumExact(L, g, amp)
      const note = `a ${num(amp, 0)}° swing is not small: 2π√(L/g)(1 + θ₀²/16) = ${num(P.pendulumSeries(L, g, amp))} s`
      return [
        { scene: 'pendulum', key: 'Tsmall', label: 'period, small-swing formula', value: small, unit: 's', formula: `2π√(L/g) = 2π√(${num(L)} / ${num(g)})`, facts: facts({ pendulumAmplitudeDeg: amp }), step: null, note },
        { scene: 'pendulum', key: 'T', label: `period for a ${num(amp, 0)}° swing`, value: large, unit: 's', formula: `2π√(L/g) × (the exact series for ${num(amp, 0)}°)`, facts: facts(), step: null }
      ]
    },
    measure: (tape, b, step) => {
      const tr = track(tape, idOf(b, 'Bob'), endOf(tape, step))
      const p = periodic(tr.t, tr.x)
      return p ? [{ key: 'Tsmall', value: p.period }, { key: 'T', value: p.period }] : []
    },
    tolerance: () => 0.5
  },

  spring: springTheory('spring', 'M', 'y'),
  springice: springTheory('springice', 'M', 'x')
}

function pulleyTheory(scene: string, light: string, heavy: string): Entry {
  return {
    fits: (b) => {
      const [l, h] = [named(b, light), named(b, heavy)]
      return (b.links ?? []).some((k) => k.kind === 'pulley' && [k.a, k.b].includes(l.id) && [k.a, k.b].includes(h.id))
    },
    cards: ['weight', 'suvat-s'],
    roles: { A: light, B: heavy },
    predict: (b) => {
      const g = worldOf(b).gravity
      const m1 = massOf(named(b, light))
      const m2 = massOf(named(b, heavy))
      const a = P.atwood(m1, m2, g)
      // Semi-implicit steps cover ½at²(1 + Δt/t) by time t: the acceleration read off the drop is a(1 + Δt/t).
      const more = (rate: number) => 1 + 1 / rate / 0.5
      const stepNote = (rate: number) => `the 1/${rate} s step: by t = 0.5 s the steps have covered ½at²(1 + Δt/t), ${num((more(rate) - 1) * 100, 2)} % more`
      return [
        { scene, key: 'a', label: 'acceleration', value: a.a, unit: 'm/s²', formula: `(m₂ − m₁) g / (m₁ + m₂) = (${num(m2)} − ${num(m1)}) × ${num(g)} / ${num(m1 + m2)}`, facts: facts(), step: null, stepped: (rate: number) => a.a * more(rate), stepNote },
        { scene, key: 'drop', label: `${heavy} falls in 0.5 s`, value: 0.5 * a.a * 0.25, unit: 'm', formula: `½ a t² = ½ × ${num(a.a)} × 0.5²`, facts: facts(), step: null, stepped: (rate: number) => 0.5 * a.a * 0.25 * more(rate), stepNote },
        { scene, key: 'tension', label: 'tension in the rope', value: a.tension, unit: 'N', formula: `2 m₁ m₂ g / (m₁ + m₂)`, facts: facts(), step: null, stepped: (rate: number) => m1 * (g + a.a * more(rate)), stepNote }
      ]
    },
    measure: (tape, b, step) => {
      const g = worldOf(b).gravity
      const tr = track(tape, idOf(b, heavy), endOf(tape, step))
      const t0 = tr.t[0]
      if (tr.t.length < 2 || tr.t[tr.t.length - 1] < t0 + 0.5) return []
      const drop = tr.y[0] - at(tr.t, tr.y, t0 + 0.5)
      const a = (2 * drop) / 0.25
      return [
        { key: 'a', value: a },
        { key: 'drop', value: drop },
        // The rope pulls the light one up: T = m₁ (g + a).
        { key: 'tension', value: massOf(named(b, light)) * (g + a) }
      ]
    },
    tolerance: () => 1
  }
}

function collisionTheory(scene: string): Entry {
  return {
    // Head on: both on one line along x, moving along it.
    fits: (b) => {
      const [A, B] = [named(b, 'A'), named(b, 'B')]
      return same(A.position[1], B.position[1]) && same(A.position[2], B.position[2]) && [A, B].every((d) => same(d.velocity[1], 0) && same(d.velocity[2], 0))
    },
    cards: ['momentum', 'momentum-total'],
    roles: { A: 'A', B: 'B' },
    predict: (b) => {
      const A = named(b, 'A')
      const B = named(b, 'B')
      const e = Math.max(A.restitution, B.restitution)
      const [m1, m2] = [massOf(A), massOf(B)]
      const out = P.collision1D(m1, A.velocity[0], m2, B.velocity[0], e)
      const f = facts({ anyBounce: true })
      return [
        { scene, key: 'vA', label: 'A after', value: out.v1, unit: 'm/s', formula: `momentum kept, e = ${num(e, 3)}`, facts: f, step: null },
        { scene, key: 'vB', label: 'B after', value: out.v2, unit: 'm/s', formula: `momentum kept, e = ${num(e, 3)}`, facts: f, step: null }
      ]
    },
    measure: (tape, b, step) => {
      const end = endOf(tape, step)
      // After the hit: the velocities at the end of what was recorded.
      if (hitStep(tape, idOf(b, 'A'), tape.first, end) === null) return []
      return ['A', 'B'].map((name) => {
        const tr = track(tape, idOf(b, name), end)
        return { key: `v${name}`, value: tr.vx[tr.vx.length - 1] }
      })
    },
    tolerance: () => 1
  }
}

function springTheory(scene: string, name: string, axis: 'x' | 'y'): Entry {
  return {
    fits: (b) => (b.links ?? []).some((l) => l.kind === 'spring' && [l.a, l.b].includes(named(b, name).id)),
    cards: ['spring-T', 'spring-energy'],
    roles: { A: name, S: 'spring' },
    predict: (b) => {
      const d = named(b, name)
      const link = (b.links ?? []).find((l) => l.kind === 'spring' && (l.a === d.id || l.b === d.id))!
      // Two moving ends swing about their centre of mass: the reduced mass m₁m₂/(m₁ + m₂).
      const other = b.bodies.find((x) => x.id === (link.a === d.id ? link.b : link.a))
      const m = other && other.motion === 'dynamic' ? (massOf(d) * massOf(other)) / (massOf(d) + massOf(other)) : massOf(d)
      return [{ scene, key: 'T', label: 'period', value: P.springPeriod(m, link.stiffness), unit: 's', formula: `2π√(m/k) = 2π√(${num(m)} / ${num(link.stiffness)})`, facts: facts(), step: { kind: 'spring' as const, values: [link.stiffness, m] } }]
    },
    measure: (tape, b, step) => {
      const tr = track(tape, idOf(b, name), endOf(tape, step))
      const p = periodic(tr.t, axis === 'x' ? tr.x : tr.y)
      return p ? [{ key: 'T', value: p.period }] : []
    },
    tolerance: () => 0.5
  }
}

/** The theory of a demo experiment, or null for a scene with none. */
export function theoryFor(presetId: string | null | undefined): Theory | null {
  const e = (presetId && THEORIES[presetId]) || null
  if (!e) return null
  const ok = (b: Built): boolean => {
    try {
      const names = new Set(b.bodies.map((d) => d.name))
      return Object.entries(e.roles).every(([role, name]) => role === 'S' || names.has(name)) && (e.fits?.(b) ?? true)
    } catch (err) {
      if (err instanceof MissingBody) return false
      throw err
    }
  }
  return {
    cards: e.cards,
    roles: e.roles,
    predict: (b) => (ok(b) ? e.predict(b) : []),
    measure: (tape, b, step) => (ok(b) ? e.measure(tape, b, step) : []),
    tolerance: e.tolerance
  }
}

/**
 * The gap between a formula's answer and the measured value: in per cent, whether it is within the experiment's
 * tolerance at this rate, and why they differ — the engine's limits that this quantity meets, or, when it meets none,
 * the step's own error.
 */
export function gapOf(p: Prediction, m: Measured, rate: number, _scene: Built): { percent: number; reason: string; within: boolean } {
  // Against a prediction of zero any miss is a whole miss: 100 %, with its sign.
  const percent = p.value === 0 ? (m.value === 0 ? 0 : Math.sign(m.value) * 100) : ((m.value - p.value) / Math.abs(p.value)) * 100
  const keys = limitsFor(p.facts)
  let reason: string
  if (keys.length > 0) reason = [...keys.map((k) => LIMITS[k].sentence), ...(p.note ? [p.note] : []), ...(p.stepNote ? [p.stepNote(rate)] : [])].join(' ')
  else if (p.stepNote) reason = p.stepNote(rate)
  else if (p.step) reason = gapSentence(p.step.kind, p.step.values, rate)
  else reason = `the 1/${rate} s step and the engine's single-precision numbers`
  const tol = theoryFor(p.scene)?.tolerance(rate) ?? 1
  const near = (target: number) => Math.abs(m.value - target) <= (tol / 100) * Math.abs(target)
  // It agrees when it is within the tolerance of the formula, or of the formula with the step's own error worked in,
  // or when the difference is no more than the step itself can make.
  const within = Math.abs(percent) <= tol || (p.stepped !== undefined && near(p.stepped(rate))) || (p.allowance !== undefined && Math.abs(m.value - p.value) <= p.allowance(rate) + (tol / 100) * Math.abs(p.value))
  return { percent, reason, within }
}

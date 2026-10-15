// SB51: the Collision Lab's theory (sim/theory.ts spreads it into its table). The predictions are read from the BUILT scene -
// masses, velocities, the larger of the two bounciness values (as Jolt combines them), positions - so an edited scene is
// predicted as it is; the measurements are read off the tape after the first hit. A hit slower than 1 m/s is predicted as the
// engine does it (no bounce) and the prediction names that limit in a sentence.

import type { BodyDef } from './types'
import type { Built, Measured, Prediction, Theory } from './theory'
import type { SceneFacts } from './limits'
import type { RunTape } from './recorder'
import { isContact } from './recorder'
import { angleBetweenDeg, collide1D, collide2D, contactNormal, simulateChain1D } from './collisionMath'
import { fmtLabel } from '../math/format'
import type { LabId } from './labScenes'

/** The engine does not bounce two bodies that meet slower than this (Jolt's minimum speed for a bounce). */
const MIN_BOUNCE = 1

const num = (v: number) => fmtLabel(v, 3)
const named = (b: Built, name: string): BodyDef => {
  const d = b.bodies.find((x) => x.name === name)
  if (!d) throw new Error(`no body ${name}`)
  return d
}
const massOf = (d: BodyDef) => d.mass

const facts = (approach: number): SceneFacts => ({
  anyBounce: true,
  anySliding: false,
  anySpinDampingAboveZero: false,
  anyRope: false,
  anyEngineSpring: false,
  pendulumAmplitudeDeg: null,
  anyRolling: false,
  airDensity: 0,
  maxSpeed: Math.abs(approach),
  maxDistanceFromOrigin: 0,
  slowestBounceSpeed: Math.abs(approach)
})

/** The sentence a slow hit carries, with its speed. */
const slowNote = (approach: number): string | undefined =>
  Math.abs(approach) < MIN_BOUNCE
    ? `They meet at ${num(Math.abs(approach))} m/s, and the engine does not bounce below 1 m/s: it treats e as 0 here.`
    : undefined

/** A body's velocity at a step of the tape. */
function velocityAt(tape: RunTape, id: string, step: number): [number, number, number] | null {
  const i = tape.layout.bodies.indexOf(id)
  const rec = i < 0 ? null : tape.record(step)
  if (!rec) return null
  const o = i * 13
  return [tidySpeed(rec[o + 7]), tidySpeed(rec[o + 8]), tidySpeed(rec[o + 9])]
}

/**
 * A measured speed as the card writes it: under half a millimetre a second is 0 (the engine leaves a few micrometres a second
 * on a cart that has stopped dead, and against a formula of 0 that read as a gap of 100 %).
 */
export const tidySpeed = (v: number): number => (Math.abs(v) < 0.0005 ? 0 : v)

/** The step of the first contact between two of the bodies, or null before any. */
function firstHit(tape: RunTape, ids: Set<string>, upTo: number): number | null {
  for (const { step, e } of tape.eventsIn(tape.first, upTo)) if (isContact(e) && ids.has(e.a) && ids.has(e.b)) return step
  return null
}

const endOf = (tape: RunTape, step?: number) => Math.min(tape.last, step ?? tape.last)

const pred = (scene: LabId, key: string, label: string, value: number, unit: string, formula: string, approach: number): Prediction => ({
  scene,
  key,
  label,
  value,
  unit,
  formula,
  facts: facts(approach),
  step: null,
  note: slowNote(approach)
})

const lab1d: Theory = {
  // The cards dock opens the first three: momentum before and now, and the energy lost (Argon: the energy cards were folded).
  cards: ['lab-p0', 'lab-p', 'lab-ke-lost', 'lab-ke0', 'lab-ke', 'lab-ke-lost-theory'],
  roles: { A: 'A', B: 'B' },
  predict: (b) => {
    const [A, B] = [named(b, 'A'), named(b, 'B')]
    const e = Math.max(A.restitution, B.restitution)
    const c = collide1D(massOf(A), A.velocity[0], massOf(B), B.velocity[0], e, {
      minBounceSpeed: MIN_BOUNCE
    })
    const f = `momentum kept, e = ${num(c.eUsed)}`
    return [
      pred('lab1d', 'vA', 'A after', c.v1, 'm/s', f, c.approach),
      pred('lab1d', 'vB', 'B after', c.v2, 'm/s', f, c.approach),
      pred('lab1d', 'p', 'momentum after', c.p1, 'kg m/s', `m_A u_A + m_B u_B = ${num(c.p0)}`, c.approach),
      pred('lab1d', 'keAfter', 'kinetic energy after', c.ke1, 'J', f, c.approach),
      pred('lab1d', 'keLost', 'kinetic energy lost', c.keLost, 'J', `½ μ (1 − e²)(u_A − u_B)², e = ${num(c.eUsed)}`, c.approach)
    ]
  },
  measure: (tape, b, step) => {
    const end = endOf(tape, step)
    const [A, B] = [named(b, 'A'), named(b, 'B')]
    if (firstHit(tape, new Set([A.id, B.id]), end) === null) return []
    const vA = velocityAt(tape, A.id, end)
    const vB = velocityAt(tape, B.id, end)
    if (!vA || !vB) return []
    const [mA, mB] = [massOf(A), massOf(B)]
    const ke0 = 0.5 * mA * A.velocity[0] ** 2 + 0.5 * mB * B.velocity[0] ** 2
    const ke1 = 0.5 * mA * vA[0] ** 2 + 0.5 * mB * vB[0] ** 2
    return [
      { key: 'vA', value: vA[0] },
      { key: 'vB', value: vB[0] },
      { key: 'p', value: mA * vA[0] + mB * vB[0] },
      { key: 'keAfter', value: ke1 },
      { key: 'keLost', value: ke0 - ke1 }
    ]
  },
  // Momentum to 0.1 %; the velocities 0.5 % at 600 steps a second, 1 % at 240.
  tolerance: (rate) => (rate >= 600 ? 0.5 : 1)
}

const lab2d: Theory = {
  cards: ['lab2d-px0', 'lab2d-px', 'lab-ke-lost', 'lab2d-py0', 'lab2d-py', 'lab-ke0', 'lab-ke'],
  roles: { A: 'A', B: 'B' },
  predict: (b) => {
    const [A, B] = [named(b, 'A'), named(b, 'B')]
    const e = Math.max(A.restitution, B.restitution)
    // Where they meet: A's path is along its velocity; the normal is the line of centres at contact.
    const r = A.size[0] + B.size[0]
    const dy = B.position[1] - A.position[1]
    const along = Math.sqrt(Math.max(0, r * r - dy * dy))
    const normal = contactNormal([B.position[0] - along, A.position[1]], [B.position[0], B.position[1]]) ?? [1, 0]
    const c = collide2D({ m: massOf(A), v: [A.velocity[0], A.velocity[1]] }, { m: massOf(B), v: [B.velocity[0], B.velocity[1]] }, e, normal, {
      minBounceSpeed: MIN_BOUNCE
    })
    const f = `momentum kept in x and in y, e = ${num(c.eUsed)}`
    // The engine finds the contact on the last step before the pucks touch and pushes along the line of centres there, a
    // little flatter than the line at contact: the same formulas with that line give what it does.
    const contactX = B.position[0] - along
    const lastStep = (rate: number) => {
      const dx = Math.abs(A.velocity[0]) / rate
      const k = Math.ceil((contactX - A.position[0]) / dx) - 1
      const x = A.position[0] + k * dx
      return { gap: contactX - x, n: contactNormal([x, A.position[1]], [B.position[0], B.position[1]]) ?? normal }
    }
    const stepped = (rate: number) => collide2D({ m: massOf(A), v: [A.velocity[0], A.velocity[1]] }, { m: massOf(B), v: [B.velocity[0], B.velocity[1]] }, e, lastStep(rate).n, { minBounceSpeed: MIN_BOUNCE })
    const deg = (n: [number, number]) => (Math.atan2(n[1], n[0]) * 180) / Math.PI
    const stepNote = (rate: number) => {
      const l = lastStep(rate)
      return `The engine pushes along the line of centres a step before they touch, ${fmtLabel(l.gap * 1000, 1)} mm apart: ${num(Math.abs(deg(normal) - deg(l.n)))}° off the line at contact, and the after-speeds follow that line.`
    }
    const two = (p: Prediction, read: (x: ReturnType<typeof stepped>) => number): Prediction => ({ ...p, stepped: (rate) => read(stepped(rate)), stepNote })
    return [
      two(pred('lab2d', 'vAx', 'A after, along x', c.va[0], 'm/s', f, c.normalApproach), (x) => x.va[0]),
      two(pred('lab2d', 'vAy', 'A after, along y', c.va[1], 'm/s', f, c.normalApproach), (x) => x.va[1]),
      two(pred('lab2d', 'vBx', 'B after, along x', c.vb[0], 'm/s', f, c.normalApproach), (x) => x.vb[0]),
      two(pred('lab2d', 'vBy', 'B after, along y', c.vb[1], 'm/s', f, c.normalApproach), (x) => x.vb[1]),
      two(pred('lab2d', 'angle', 'angle between the paths after', c.angleBetweenDeg ?? 0, '°', '90° when the masses are equal and e = 1', c.normalApproach), (x) => x.angleBetweenDeg ?? 0)
    ]
  },
  measure: (tape, b, step) => {
    const end = endOf(tape, step)
    const [A, B] = [named(b, 'A'), named(b, 'B')]
    if (firstHit(tape, new Set([A.id, B.id]), end) === null) return []
    const va = velocityAt(tape, A.id, end)
    const vb = velocityAt(tape, B.id, end)
    if (!va || !vb) return []
    return [
      { key: 'vAx', value: va[0] },
      { key: 'vAy', value: va[1] },
      { key: 'vBx', value: vb[0] },
      { key: 'vBy', value: vb[1] },
      {
        key: 'angle',
        value: angleBetweenDeg([va[0], va[1]], [vb[0], vb[1]]) ?? 0
      }
    ]
  },
  tolerance: (rate) => (rate >= 600 ? 0.5 : 1)
}

const CRADLE = ['B1', 'B2', 'B3', 'B4', 'B5']

const labcradle: Theory = {
  cards: ['lab-cradle-p0', 'lab-cradle-p', 'lab-cradle-ke0', 'lab-cradle-ke'],
  roles: { B1: 'B1', B2: 'B2', B3: 'B3', B4: 'B4', B5: 'B5' },
  predict: (b) => {
    const balls = CRADLE.map((n) => named(b, n))
    const e = Math.max(...balls.map((d) => d.restitution))
    const chain = simulateChain1D(
      balls.map((d) => ({
        x: d.position[0],
        r: d.size[0],
        m: massOf(d),
        v: d.velocity[0]
      })),
      e,
      { minBounceSpeed: MIN_BOUNCE }
    )
    const strings = (b.links ?? []).length > 0
    const approach = Math.max(...balls.map((d) => Math.abs(d.velocity[0])))
    // Only the balls the hits set going: one the formula leaves at rest has no speed to compare (and a few micrometres a
    // second on it would read as a gap of 100 %).
    return chain.v.flatMap((v, i) =>
      Math.abs(v) < 0.0005
        ? []
        : [
            {
              ...pred('labcradle', `v${i + 1}`, `ball ${i + 1} after the hits`, v, 'm/s', `each hit passes the momentum on, e = ${num(e)}`, approach),
              note: strings ? 'The strings pull the swinging balls back, so the speeds are read right after the hits.' : undefined
            }
          ]
    )
  },
  measure: (tape, b, step) => {
    const end = endOf(tape, step)
    const balls = CRADLE.map((n) => named(b, n))
    const hit = firstHit(tape, new Set(balls.map((d) => d.id)), end)
    if (hit === null) return []
    // Free balls: each one's velocity at the end. With strings each swings away and slows, so every ball is read on the step
    // right after the last hit of the chain (contacts between balls in the half second after the first), as the note says;
    // reading a ball at the end gave the string-slowed speed (review).
    const strings = (b.links ?? []).length > 0
    let at = end
    if (strings) {
      const ids = new Set(balls.map((d) => d.id))
      let last = hit
      for (const { step: s, e } of tape.eventsIn(hit, Math.min(end, hit + Math.round(0.5 * tape.rate)))) if (isContact(e) && ids.has(e.a) && ids.has(e.b)) last = Math.max(last, s)
      at = Math.min(end, last + 1)
    }
    return balls.map((d, i): Measured => ({ key: `v${i + 1}`, value: velocityAt(tape, d.id, at)?.[0] ?? 0 }))
  },
  tolerance: () => 1.5
}

export const LAB_THEORY: Record<LabId, Theory> = { lab1d, lab2d, labcradle }

// SB61-fix (owner item): a body joined by a rod, a string, a rope or a spring turns WITH its link and never spins on its
// own. Before, every link held each body at its CENTRE: no torque, so a hanging bob kept facing one way while its string
// swung (it looked as if it turned), and the Rope swing's bob really spun (up to 4.5 rad/s), its tie a ball joint.
// Real engine in Node, at 240 and 600 steps a second.

import { beforeAll, describe, expect, it } from 'vitest'
import { SimWorld } from '../src/renderer/src/sim/world'
import { presetById } from '../src/renderer/src/sim/presets'
import { DEFAULT_WORLD, type BodyDef, type Link, type StepRate, type WorldSettings } from '../src/renderer/src/sim/types'
import { energyOf, groundTopOf, springEnergyOf } from '../src/renderer/src/sim/energy'
import { periodic } from '../src/renderer/src/sim/measure'
import { intoBody } from '../src/renderer/src/sim/energy'
import type { V3 } from '../src/renderer/src/math/vec'
import { readSource } from './helpers/repo'
import { linkDepths, linkEnds, linkTies } from '../src/renderer/src/sim/links'

beforeAll(async () => {
  ;(await SimWorld.create()).destroy()
}, 30_000)

const RATES: StepRate[] = [240, 600]
const DEG = 180 / Math.PI
const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2])
  return [v[0] / l, v[1] / l, v[2] / l]
}
const angle = (a: V3, b: V3) => Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * DEG

async function scene(built: { bodies: BodyDef[]; links?: Link[]; world?: Partial<WorldSettings> }, rate: StepRate) {
  const w = await SimWorld.create({ ...DEFAULT_WORLD, ...(built.world ?? {}), stepRate: rate })
  w.rebuild(built.bodies, built.links ?? [])
  return w
}

/**
 * How a body turns against its link over a run: the direction from the body to the other end, seen in the body's own
 * frame, must stay where it started (a body that turns with its link), and its spin about z must match the link's
 * (ω_link = (r × v_rel)_z / |r|²). `other` is the body at the far end of the link.
 */
function follow(w: SimWorld, bob: string, other: string, seconds: number, every?: (k: number) => void) {
  const dir0 = (() => {
    const a = w.state(bob)!
    const b = w.state(other)!
    return norm(intoBody(norm([b.position[0] - a.position[0], b.position[1] - a.position[1], b.position[2] - a.position[2]]), a.rotation))
  })()
  let drift = 0
  let relSpin = 0
  const n = seconds * w.stepRate
  for (let k = 0; k < n; k++) {
    every?.(k)
    w.stepOnce()
    const a = w.state(bob)!
    const b = w.state(other)!
    const r: V3 = [b.position[0] - a.position[0], b.position[1] - a.position[1], b.position[2] - a.position[2]]
    drift = Math.max(drift, angle(norm(intoBody(norm(r), a.rotation)), dir0))
    const v: V3 = [b.velocity[0] - a.velocity[0], b.velocity[1] - a.velocity[1], b.velocity[2] - a.velocity[2]]
    const omegaLink = (r[0] * v[1] - r[1] * v[0]) / (r[0] * r[0] + r[1] * r[1] + r[2] * r[2])
    if (k > w.stepRate * 0.2) relSpin = Math.max(relSpin, Math.abs(a.angularVelocity[2] - omegaLink))
  }
  return { drift, relSpin }
}

const named = (bodies: BodyDef[], name: string) => bodies.find((b) => b.name === name)!

describe.each(RATES)('at %i steps a second: a joined body turns with its link', (rate) => {
  it('Pendulum (string): the bob keeps its face to the pivot within 1° (it turns with the string); its wobble about the tie stays small', async () => {
    const built = presetById('pendulum')!.build()
    const w = await scene(built, rate)
    const f = follow(w, named(built.bodies, 'Bob').id, named(built.bodies, 'Pivot').id, 10)
    w.destroy()
    expect(f.drift).toBeLessThan(1)
    // A bob hung from a point of its surface is a small second pendulum: it wobbles about the tie (the contract: "a small
    // wobble about the tie is real and allowed"). Measured: under 0.9°, at up to 0.12 rad/s against the string, and it
    // never grows. The rod and the rope, fixed to their bobs, are held to 0.05 rad/s.
    expect(f.relSpin).toBeLessThan(0.05)
  })
  it('Rope swing: the bob turns with its rope (it spun at up to 4.5 rad/s)', async () => {
    const built = presetById('ropeswing')!.build()
    const w = await scene(built, rate)
    const bob = named(built.bodies, 'Bob').id
    const rope = built.links![0]
    // The rope's last bead is what the bob hangs from: follow the bob against the rope's end near it.
    let drift = 0
    let relSpin = 0
    const near = () => {
      const p = w.linkPath(rope)
      return p[p.length - 2] ?? p[0]
    }
    const dirIn = (): V3 => {
      const s = w.state(bob)!
      const q = near()
      return norm(intoBody(norm([q[0] - s.position[0], q[1] - s.position[1], q[2] - s.position[2]]), s.rotation))
    }
    const d0 = dirIn()
    let prev = d0
    for (let k = 0; k < 10 * w.stepRate; k++) {
      w.stepOnce()
      const d = dirIn()
      drift = Math.max(drift, angle(d, d0))
      if (k > w.stepRate * 0.2) relSpin = Math.max(relSpin, (angle(d, prev) / DEG) * w.stepRate)
      prev = d
    }
    w.destroy()
    expect(drift).toBeLessThan(2)
    expect(relSpin).toBeLessThan(0.05)
  })
  it('a ball on a rod is fixed to the rod: it turns exactly with it', async () => {
    const post = { ...presetById('pendulum')!.build().bodies[1], id: 'post', name: 'Post', position: [0, 3, 0] as V3 }
    const ball: BodyDef = { ...named(presetById('pendulum')!.build().bodies, 'Bob'), id: 'ball', name: 'Ball', position: [1.5 * Math.sin(0.5), 3 - 1.5 * Math.cos(0.5), 0] }
    const rod: Link = { id: 'rod', kind: 'rod', a: post.id, b: ball.id, length: 1.5, stiffness: 0, damping: 0 }
    const w = await scene({ bodies: [post, ball], links: [rod], world: { airDensity: 0 } }, rate)
    const f = follow(w, ball.id, post.id, 6)
    w.destroy()
    expect(f.drift).toBeLessThan(0.5)
    expect(f.relSpin).toBeLessThan(0.05)
  })
  it('Mass on a spring, bouncing straight: stays upright within 2°', async () => {
    const built = presetById('spring')!.build()
    const w = await scene(built, rate)
    const m = named(built.bodies, 'M').id
    let tilt = 0
    for (let k = 0; k < 6 * w.stepRate; k++) {
      w.stepOnce()
      const s = w.state(m)!
      tilt = Math.max(tilt, angle(norm(intoBody([0, 1, 0], s.rotation)), [0, 1, 0]))
    }
    w.destroy()
    expect(tilt).toBeLessThan(2)
  })
})

describe('the Pendulum still swings as it did', () => {
  it.each(RATES)('at %i: the period within 0.5 % of today’s 2.8492 s, and the energy (spin included) within DS-2’s band', async (rate) => {
    const built = presetById('pendulum')!.build()
    const w = await scene(built, rate)
    const bob = named(built.bodies, 'Bob')
    const datum = groundTopOf(built.bodies)
    const t: number[] = []
    const x: number[] = []
    let e0 = NaN
    let rise = 0
    for (let k = 0; k <= 12 * w.stepRate; k++) {
      if (k > 0) w.stepOnce()
      const s = w.state(bob.id)!
      t.push(w.time)
      x.push(s.position[0])
      const e = energyOf(bob, s, 9.81, datum).total
      if (k === 0) e0 = e
      rise = Math.max(rise, e - e0)
    }
    w.destroy()
    const p = periodic(t, x)!
    // Within 0.5 % of today's 2.8492 s (the contract), and at the physical pendulum's 2.8526 s it now is: the bob turns
    // with its string, √(1 + 0.4r²/L²) = 0.11 % longer. Held to 0.05 %, so losing the turning would fail it.
    expect(Math.abs(p.period - 2.8492) / 2.8492).toBeLessThan(0.005)
    expect(Math.abs(p.period - 2.8526) / 2.8526).toBeLessThan(0.0005)
    // DS-2 (09\sandbox\reports\DS2-preset-audit.md): the Pendulum's biggest rise is under 0.06 % of its 20.287 J.
    expect(rise / e0).toBeLessThan(0.0006)
  })
})

describe('a drag leaves no spin', () => {
  it('the Rope swing bob, dragged 20 cm sideways and let go, does not spin against its rope', async () => {
    const built = presetById('ropeswing')!.build()
    const w = await scene(built, 240)
    const bob = named(built.bodies, 'Bob')
    for (let k = 0; k < 120; k++) w.stepOnce()
    const p = w.state(bob.id)!.position
    w.grab(bob.id, [p[0] + 0.2, p[1], p[2]])
    for (let k = 0; k < 60; k++) w.stepOnce()
    w.release_()
    // Its spin against the rope after the release: the bob turns only as its rope does.
    const rope = built.links![0]
    const dirIn = (): V3 => {
      const s = w.state(bob.id)!
      const pth = w.linkPath(rope)
      const q = pth[pth.length - 2] ?? pth[0]
      return norm(intoBody(norm([q[0] - s.position[0], q[1] - s.position[1], q[2] - s.position[2]]), s.rotation))
    }
    let prev = dirIn()
    let relSpin = 0
    for (let k = 0; k < 3 * 240; k++) {
      w.stepOnce()
      const d = dirIn()
      if (k > 48) relSpin = Math.max(relSpin, (angle(d, prev) / DEG) * 240)
      prev = d
    }
    w.destroy()
    expect(relSpin).toBeLessThan(0.05)
  })
})

describe('two trolleys and a rod stay two trolleys', () => {
  it('both roll on the floor, upright, the rod keeping their centres 1.5 m apart', async () => {
    const built = presetById('trolleys')!.build()
    const w = await scene(built, 240)
    const [a, b] = ['A', 'B'].map((n) => named(built.bodies, n).id)
    let gap = 0
    let tilt = 0
    for (let k = 0; k < 4 * 240; k++) {
      w.stepOnce()
      const sa = w.state(a)!
      const sb = w.state(b)!
      gap = Math.max(gap, Math.abs(Math.hypot(sb.position[0] - sa.position[0], sb.position[1] - sa.position[1]) - 1.5))
      for (const s of [sa, sb]) tilt = Math.max(tilt, angle(norm(intoBody([0, 1, 0], s.rotation)), [0, 1, 0]))
    }
    w.destroy()
    expect(gap).toBeLessThan(0.01)
    // The ball that hits A tips it about 1.7° today: that is the hit, not the rod.
    expect(tilt).toBeLessThan(3)
  })
})

describe('the links are drawn to their tie points', () => {
  it('Links.tsx draws rods, strings and springs between linkEnds, never from the two centres', () => {
    const src = readSource('src/renderer/src/render/sandbox/Links.tsx')
    expect(src).toMatch(/return linkEnds\(link, a, b, depths, sa, sb\)/)
    // The bar and the coil take their two points from `ends`, and nothing draws a link from w.drawn's two positions.
    expect(src).toMatch(/linkPlacement\(e\[0\], e\[1\], place\)/)
    expect(src).toMatch(/writeCoil\(a, b, look\.coilRadius/)
    expect(src).not.toMatch(/linkPlacement\(a\.position, b\.position/)
    expect(src).not.toMatch(/writeCoil\(a\.position, b\.position/)
  })
  it('linkEnds: the Pendulum’s string runs from the pivot’s centre to the top of the bob, and turns with the bob', () => {
    const built = presetById('pendulum')!.build()
    const pivot = named(built.bodies, 'Pivot')
    const bob = named(built.bodies, 'Bob')
    const link = built.links![0]
    const depths = linkDepths(built.bodies, built.links!)
    const [a, b] = link.a === pivot.id ? [pivot, bob] : [bob, pivot]
    const at = (d: BodyDef, q: number[]) => ({ position: d.position, rotation: q })
    const ends = linkEnds(link, a, b, depths, at(a, [0, 0, 0, 1]), at(b, [0, 0, 0, 1]))
    const bobEnd = link.a === pivot.id ? ends[1] : ends[0]
    const pivotEnd = link.a === pivot.id ? ends[0] : ends[1]
    expect(pivotEnd).toEqual(pivot.position)
    // The bob's end is on its surface, 0.15 m from its centre, on the line to the pivot.
    const toPivot = norm([pivot.position[0] - bob.position[0], pivot.position[1] - bob.position[1], 0])
    for (let k = 0; k < 2; k++) expect(bobEnd[k]).toBeCloseTo(bob.position[k] + 0.15 * toPivot[k], 6)
    // Turned 90° about z, the bob carries its tie round with it.
    const q90 = [0, 0, Math.SQRT1_2, Math.SQRT1_2]
    const turned = linkEnds(link, a, b, depths, at(a, link.a === pivot.id ? [0, 0, 0, 1] : q90), at(b, link.a === pivot.id ? q90 : [0, 0, 0, 1]))
    const tb = link.a === pivot.id ? turned[1] : turned[0]
    expect(tb[0]).toBeCloseTo(bob.position[0] - 0.15 * toPivot[1], 6)
    expect(tb[1]).toBeCloseTo(bob.position[1] + 0.15 * toPivot[0], 6)
  })
})

void springEnergyOf

describe('review fixes (gpt-5.4 high r1)', () => {
  const ball = (id: string, x: number, over: Partial<BodyDef> = {}): BodyDef => ({ ...named(presetById('pendulum')!.build().bodies, 'Bob'), id, name: id, position: [x, 0, 0], size: [0.1, 0.1, 0.1], massMode: 'mass', mass: 1, angularDamping: 0, ...over })
  it('two free balls on a string keep their angular momentum: the knot acts only on a body hung from a parent', async () => {
    const a = ball('fa', -0.5, { angularVelocity: [0, 0, 1] })
    const b = ball('fb', 0.5, { angularVelocity: [0, 0, 1] })
    const s: Link = { id: 'fs', kind: 'string', a: a.id, b: b.id, length: 1, stiffness: 0, damping: 0 }
    const w = await scene({ bodies: [a, b], links: [s], world: { gravity: 0, airDensity: 0 } }, 240)
    const Lz = () => [a.id, b.id].reduce((acc, id) => {
      const st = w.state(id)!
      return acc + 0.4 * st.mass * 0.01 * st.angularVelocity[2] + st.mass * (st.position[0] * st.velocity[1] - st.position[1] * st.velocity[0])
    }, 0)
    const L0 = Lz()
    for (let k = 0; k < 240; k++) w.stepOnce()
    const L1 = Lz()
    w.destroy()
    expect(Math.abs(L1 - L0) / L0).toBeLessThan(0.01)
  })
  it('a spring shorter than its two reaches keeps its centres: no stretch made up at the start', async () => {
    const a = ball('oa', -0.05)
    const b = ball('ob', 0.05)
    const sp: Link = { id: 'os', kind: 'spring', a: a.id, b: b.id, length: 0.1, stiffness: 100, damping: 0 }
    const t = linkTies(sp, a, b, linkDepths([a, b], [sp]))
    expect(t.a).toBeNull()
    expect(t.b).toBeNull()
    expect(t.length).toBeCloseTo(0.1, 9)
  })
  it('the ledger names a knot’s damping with the dampers, in words that fit it', () => {
    expect(readSource('src/renderer/src/sim/ledger.ts')).toContain("'dampers (a spring’s, or where a body is tied)'")
  })
})

describe('a body hung by two strings (the swing bridge)', () => {
  it('keeps its energy as it did (the knot damps only a body hung by ONE link: two ties already hold its turning)', async () => {
    const built = presetById('swingbridge')!.build()
    const w = await scene(built, 240)
    const bob = named(built.bodies, 'Bob')
    const datum = groundTopOf(built.bodies)
    let e0 = NaN
    let worst = 0
    for (let k = 0; k <= 10 * 240; k++) {
      if (k) w.stepOnce()
      const e = energyOf(bob, w.state(bob.id)!, 9.81, datum).total
      if (k === 0) e0 = e
      worst = Math.max(worst, Math.abs(e - e0) / e0)
    }
    w.destroy()
    // Before SB61 it held within 0.05 %; with a knot on each string it lost 0.8 % in 10 s.
    expect(worst).toBeLessThan(0.001)
  })
})

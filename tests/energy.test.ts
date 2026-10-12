// The joules the Sandbox reports, checked against the textbook formulas. These are the numbers
// a student compares with their own working, so they must be the numbers the formulas give.

import { beforeAll, describe, expect, it } from 'vitest'
import {
  EMPTY_ENERGY,
  energyOf,
  floorOf,
  groundTopOf,
  momentOfInertia,
  momentumOf,
  momentumSize,
  sceneEnergy,
  springEnergyOf,
  springReadings,
  springStretch,
  startStateOf,
  systemEnergy,
  systemMomentum
} from '../src/renderer/src/sim/energy'
import { DEFAULT_WORLD, type BodyDef, type BodyState, type Link } from '../src/renderer/src/sim/types'
import { presetById } from '../src/renderer/src/sim/presets'
import { massOf } from '../src/renderer/src/sim/store'
import { SimWorld } from '../src/renderer/src/sim/world'
import type { V3 } from '../src/renderer/src/math/vec'

let n = 0
function body(over: Partial<BodyDef> = {}): BodyDef {
  return {
    id: `b${++n}`,
    name: `B${n}`,
    shape: 'sphere',
    size: [0.5, 0.5, 0.5],
    position: [0, 1, 0],
    rotation: [0, 0, 0],
    velocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    motion: 'dynamic',
    material: 'steel',
    massMode: 'mass',
    mass: 1,
    restitution: 0.5,
    friction: 0.5,
    linearDamping: 0,
    angularDamping: 0,
    color: '#fff',
    ...over
  }
}

function state(over: Partial<BodyState> = {}): BodyState {
  return { position: [0, 0, 0], rotation: [0, 0, 0, 1], velocity: [0, 0, 0], angularVelocity: [0, 0, 0], mass: 1, asleep: false, ...over }
}

const G = 9.81

const named = (bodies: BodyDef[], name: string) => bodies.find((b) => b.name === name)!

describe('energyOf', () => {
  it('a 2 kg ball at 3 m/s has 9 J of kinetic energy', () => {
    const e = energyOf(body({ mass: 2 }), state({ mass: 2, velocity: [3, 0, 0] }), G)
    expect(e.linear).toBeCloseTo(9, 12)
    expect(e.rotational).toBe(0)
    expect(e.kinetic).toBeCloseTo(9, 12)
    expect(e.potential).toBe(0)
    expect(e.total).toBeCloseTo(9, 12)
  })

  it('speed is the size of the velocity, whichever way it points', () => {
    const e = energyOf(body(), state({ mass: 2, velocity: [0, -3, 0] }), G)
    expect(e.linear).toBeCloseTo(9, 12)
    const diagonal = energyOf(body(), state({ mass: 2, velocity: [1, 2, 2] }), G)
    expect(diagonal.linear).toBeCloseTo(9, 12)
  })

  it('a 1 kg mass 2 m up has 19.62 J of potential energy at g = 9.81', () => {
    const e = energyOf(body(), state({ position: [0, 2, 0] }), G)
    expect(e.potential).toBeCloseTo(19.62, 12)
    expect(e.total).toBeCloseTo(19.62, 12)
  })

  it('measures height from the datum, and goes negative below it', () => {
    expect(energyOf(body(), state({ position: [0, 3, 0] }), 10, 1).potential).toBeCloseTo(20, 12)
    expect(energyOf(body(), state({ position: [0, 0.5, 0] }), 10, 1).potential).toBeCloseTo(-5, 12)
    expect(energyOf(body(), state({ position: [0, -4, 0] }), G).potential).toBeCloseTo(-39.24, 12)
  })

  it('a rolling solid ball carries 7/10 mv² all told', () => {
    const r = 0.5
    const m = 2
    const v = 3
    const e = energyOf(body({ size: [r, r, r], mass: m }), state({ mass: m, velocity: [v, 0, 0], angularVelocity: [0, 0, v / r] }), G)
    expect(e.linear).toBeCloseTo(9, 12)
    expect(e.rotational).toBeCloseTo(3.6, 12)
    expect(e.kinetic).toBeCloseTo(0.7 * m * v * v, 12)
  })

  it('uses the right moment of inertia for each shape', () => {
    const m = 2
    expect(momentOfInertia(body({ shape: 'sphere', size: [0.5, 0, 0] }), m)).toBeCloseTo(0.4 * m * 0.25, 12)
    expect(momentOfInertia(body({ shape: 'cylinder', size: [0.5, 2, 0] }), m)).toBeCloseTo(0.5 * m * 0.25, 12)
    expect(momentOfInertia(body({ shape: 'capsule', size: [0.5, 2, 0] }), m)).toBeCloseTo(0.5 * m * 0.25, 12)
    // A pulley is a cylinder, not a box.
    expect(momentOfInertia(body({ shape: 'pulley', size: [0.3, 0.1, 0] }), m)).toBeCloseTo(0.5 * m * 0.09, 12)
    // A cone's first size is its base width: the radius is half of it.
    expect(momentOfInertia(body({ shape: 'cone', size: [1, 2, 1] }), m)).toBeCloseTo(0.3 * m * 0.25, 12)
    // A box about its centre: m(w² + h²)/12.
    expect(momentOfInertia(body({ shape: 'box', size: [1, 2, 3] }), m)).toBeCloseTo((m * 5) / 12, 12)
    expect(momentOfInertia(body({ shape: 'plank', size: [4, 0.1, 0.3] }), m)).toBeCloseTo((m * 16.01) / 12, 12)
  })

  it('gives a fixed floor or wall no energy at all, however high it sits', () => {
    expect(energyOf(body({ motion: 'static' }), state({ position: [0, 5, 0], velocity: [1, 0, 0] }), G)).toEqual(EMPTY_ENERGY)
    expect(energyOf(body({ motion: 'kinematic' }), state({ velocity: [9, 0, 0] }), G)).toEqual(EMPTY_ENERGY)
  })

  it('works without gravity and with an enormous mass', () => {
    expect(energyOf(body(), state({ position: [0, 100, 0] }), 0).potential).toBe(0)
    const e = energyOf(body(), state({ mass: 1e9, velocity: [1e3, 0, 0], position: [0, 1e3, 0] }), G)
    expect(e.linear).toBeCloseTo(5e14, -2)
    expect(e.potential).toBeCloseTo(9.81e12, -3)
    expect(Number.isFinite(e.total)).toBe(true)
  })
})

describe('systemEnergy', () => {
  it('adds every term, and an empty scene has none', () => {
    expect(systemEnergy([])).toEqual(EMPTY_ENERGY)
    const a = energyOf(body({ mass: 2 }), state({ mass: 2, velocity: [3, 0, 0] }), G)
    const b = energyOf(body(), state({ position: [0, 2, 0] }), G)
    const sum = systemEnergy([a, b, EMPTY_ENERGY])
    expect(sum.linear).toBeCloseTo(9, 12)
    expect(sum.potential).toBeCloseTo(19.62, 12)
    expect(sum.kinetic).toBeCloseTo(9, 12)
    expect(sum.total).toBeCloseTo(28.62, 12)
  })

  it('does not change what it was handed', () => {
    const a = energyOf(body({ mass: 2 }), state({ mass: 2, velocity: [3, 0, 0] }), G)
    const before = { ...a }
    systemEnergy([a, a])
    expect(a).toEqual(before)
    expect(EMPTY_ENERGY).toEqual({ linear: 0, rotational: 0, kinetic: 0, potential: 0, elastic: 0, total: 0 })
  })

  it('a ball dropped from 2 m has the same total at the top and at the bottom', () => {
    const top = energyOf(body(), state({ position: [0, 2, 0] }), G)
    const v = Math.sqrt(2 * G * 2)
    const bottom = energyOf(body(), state({ position: [0, 0, 0], velocity: [0, -v, 0] }), G)
    expect(systemEnergy([top]).total).toBeCloseTo(systemEnergy([bottom]).total, 10)
  })
})

describe('momentum and the datum', () => {
  it('p = mv as a vector, and its size', () => {
    const s = state({ mass: 2, velocity: [3, -4, 0] })
    expect(momentumOf(s)).toEqual([6, -8, 0])
    expect(momentumSize(s)).toBeCloseTo(10, 12)
    const total: V3 = systemMomentum([s, state({ mass: 1, velocity: [-6, 8, 0] })])
    expect(total).toEqual([0, 0, 0])
  })

  it('measures height from the top of the floor, and from zero when there is none', () => {
    expect(groundTopOf([])).toBe(0)
    expect(groundTopOf([body({ shape: 'ground', size: [50, 1, 50], position: [0, -0.5, 0], motion: 'static' })])).toBeCloseTo(0, 12)
    // H14: a fixed block that is not the floor is not a floor. It used to stand in for one, so a
    // scene whose floor was deleted measured heights from the top of whatever fixed thing came
    // first in the list, against the comment's own promise of "zero when there is no floor".
    expect(groundTopOf([body({ shape: 'box', size: [4, 2, 4], position: [0, 1, 0], motion: 'static' })])).toBe(0)
    expect(groundTopOf([body()])).toBe(0)
  })

  it('H14: with the floor deleted, a pendulum bob keeps the PE it had, measured from zero', () => {
    const { bodies } = presetById('pendulum')!.build()
    const floor = bodies.find((b) => b.shape === 'ground')!
    const bob = named(bodies, 'Bob')
    const pivot = named(bodies, 'Pivot')
    const withoutFloor = bodies.filter((b) => b !== floor)
    // The floor's top is at 0, so deleting it must leave the datum where it was.
    expect(groundTopOf(bodies)).toBeCloseTo(0, 12)
    // The datum was the top of the Pivot (4.06 m) and the 1 kg bob at 2.068 m read -19.5 J.
    expect(groundTopOf(withoutFloor), `datum fell back to the pivot's top, ${pivot.position[1] + pivot.size[1] / 2} m`).toBe(0)
    const pe = (list: BodyDef[]) => energyOf(bob, startStateOf(bob, 1), G, groundTopOf(list)).potential
    expect(pe(withoutFloor)).toBeCloseTo(pe(bodies), 12)
    expect(pe(withoutFloor)).toBeCloseTo(1 * G * bob.position[1], 12)
    expect(pe(withoutFloor)).toBeGreaterThan(0)
  })

  it('the floor is the ground shape, wherever it is in the list, and nothing else stands in for it', () => {
    const block = body({ shape: 'box', size: [4, 2, 4], position: [0, 1, 0], motion: 'static' })
    const floor = body({ shape: 'ground', size: [50, 1, 50], position: [0, -0.5, 0], motion: 'static' })
    expect(floorOf([])).toBeUndefined()
    expect(floorOf([block])).toBeUndefined()
    expect(floorOf([block, floor])).toBe(floor)
    expect(groundTopOf([block, floor])).toBeCloseTo(0, 12)
    // A raised floor is still the datum: heights are above the floor, wherever the floor is.
    expect(groundTopOf([block, body({ shape: 'ground', size: [50, 1, 50], position: [0, 0.5, 0], motion: 'static' })])).toBeCloseTo(1, 12)
  })
})

// -------------------------------------------------------------------------------------------
// P14: the energy a spring stores. "Spring on ice" starts with the block 0.6 m past the spring's
// natural length on 50 N/m: 9 J that the readout left out, so the total it showed began at 4.9 J
// while the system held 13.9 J, and jumped by nearly 30 % between neighbouring readings.
// -------------------------------------------------------------------------------------------

const spring = (over: Partial<Link> = {}): Link => ({ id: 'l1', kind: 'spring', a: 'a', b: 'b', length: 3, stiffness: 50, damping: 0, ...over })

/** The preset as the Sandbox loads it: a floor of ice, a fixed post, a 2 kg block, one 50 N/m spring. */
function ice() {
  const built = presetById('springice')!.build()
  return { ...built, links: built.links ?? [] }
}
describe('springEnergyOf: what a spring link stores', () => {
  it('½kx²: 50 N/m stretched 0.6 m holds 9 J, the Spring on ice start', () => {
    // The post at x = -3 and the block at x = 0.6 are 3.6 m apart on a 3 m spring.
    const e = springEnergyOf(spring(), [-3, 0.25, 0], [0.6, 0.25, 0])
    expect(e.elastic).toBeCloseTo(9, 12)
    expect(e.total).toBeCloseTo(9, 12)
    // A spring is neither moving nor high up: only the elastic term is filled in.
    expect(e.kinetic).toBe(0)
    expect(e.potential).toBe(0)
    expect(springStretch(spring(), [-3, 0.25, 0], [0.6, 0.25, 0])).toBeCloseTo(0.6, 12)
  })

  it('a squeezed spring stores the same ½kx²: 0.6 m short of its length is 9 J too', () => {
    expect(springEnergyOf(spring(), [-3, 0.25, 0], [-0.6, 0.25, 0]).elastic).toBeCloseTo(9, 12)
    expect(springStretch(spring(), [-3, 0.25, 0], [-0.6, 0.25, 0])).toBeCloseTo(-0.6, 12)
  })

  it('at its natural length it stores nothing, and the line it lies along does not matter', () => {
    expect(springEnergyOf(spring(), [0, 0, 0], [3, 0, 0]).elastic).toBe(0)
    expect(springEnergyOf(spring(), [0, 0, 0], [0, 3, 0]).elastic).toBe(0)
    // 3-4-5: the centres are 5 m apart, 2 m past a 3 m spring: ½ · 50 · 2² = 100 J.
    expect(springEnergyOf(spring(), [1, 1, 1], [4, 5, 1]).elastic).toBeCloseTo(100, 12)
  })

  it('uses the same floors as the engine: a length or stiffness under 0.01 acts as 0.01', () => {
    // world.ts addDistance builds the constraint from max(0.01, length) and max(0.01, stiffness).
    // Length 0 → 0.01 m, so centres 1.01 m apart are 1.00 m past it; stiffness 0 → 0.01 N/m:
    // ½ · 0.01 · 1² = 0.005 J. Typed negative values meet the same floors.
    expect(springEnergyOf(spring({ length: 0, stiffness: 0 }), [0, 0, 0], [1.01, 0, 0]).elastic).toBeCloseTo(0.005, 12)
    expect(springEnergyOf(spring({ length: -2, stiffness: -5 }), [0, 0, 0], [1.01, 0, 0]).elastic).toBeCloseTo(0.005, 12)
    expect(springStretch(spring({ length: 0 }), [0, 0, 0], [1.01, 0, 0])).toBeCloseTo(1, 12)
    // Just above the floors nothing is changed: 0.02 m, 0.02 N/m, centres 0.52 m apart → ½ · 0.02 · 0.5².
    expect(springEnergyOf(spring({ length: 0.02, stiffness: 0.02 }), [0, 0, 0], [0.52, 0, 0]).elastic).toBeCloseTo(0.0025, 12)
  })

  it('damping loses energy, it does not store any', () => {
    const calm = springEnergyOf(spring({ damping: 0 }), [-3, 0, 0], [0.6, 0, 0]).elastic
    expect(springEnergyOf(spring({ damping: 7 }), [-3, 0, 0], [0.6, 0, 0]).elastic).toBe(calm)
  })

  it('only a spring stores energy: a rod, string, rope, pulley, hinge or weld holds none however far apart', () => {
    for (const kind of ['rod', 'string', 'rope', 'pulley', 'hinge', 'weld'] as const) {
      expect(springEnergyOf(spring({ kind }), [0, 0, 0], [9, 0, 0])).toEqual(EMPTY_ENERGY)
    }
  })

  it('systemEnergy adds the spring term, so a scene with a spring has it in its total', () => {
    const ball = energyOf(body(), state({ position: [0, 2, 0] }), G)
    const held = springEnergyOf(spring(), [-3, 0, 0], [0.6, 0, 0])
    const sum = systemEnergy([ball, held, EMPTY_ENERGY])
    expect(sum.elastic).toBeCloseTo(9, 12)
    expect(sum.potential).toBeCloseTo(19.62, 12)
    expect(sum.kinetic).toBe(0)
    expect(sum.total).toBeCloseTo(28.62, 12)
    // A body alone never carries elastic energy: the spring belongs to the link, not to either end.
    expect(ball.elastic).toBe(0)
  })
})

describe('the Energy readout counts the spring (Spring on ice)', () => {
  it('reads both ends before Play, the static post from its definition: 9 J from the typed start', () => {
    const { bodies, links } = ice()
    const rows = springReadings(bodies, links, {})
    expect(rows).toHaveLength(1)
    expect(rows[0].a.name).toBe('Post')
    expect(rows[0].b.name).toBe('M')
    expect(rows[0].stretch).toBeCloseTo(0.6, 12)
    expect(rows[0].energy.elastic).toBeCloseTo(9, 12)
  })

  it('reads the moving block from the engine once it reports, and the post from the engine too', () => {
    const { bodies, links } = ice()
    const block = named(bodies, 'M')
    const post = named(bodies, 'Post')
    // The block has swung back to the spring's natural length: nothing stored.
    const live = { [block.id]: { ...startStateOf(block, 2), position: [0, 0.25, 0] as V3 } }
    expect(springReadings(bodies, links, live)[0].energy.elastic).toBeCloseTo(0, 12)
    // The engine reports static bodies as well, and its word for where they are is final.
    const both = { ...live, [post.id]: { ...startStateOf(post, 1), position: [-3.5, 0.25, 0] as V3 } }
    expect(springReadings(bodies, links, both)[0].energy.elastic).toBeCloseTo(0.5 * 50 * 0.5 ** 2, 12)
  })

  it('the start total is ½mv² + mgh + ½kx² = 0 + 4.905 + 9 J', () => {
    const { bodies, links } = ice()
    const e = sceneEnergy(bodies, links, {}, DEFAULT_WORLD.gravity, massOf)
    expect(e.datum).toBeCloseTo(0, 12)
    expect(e.total.kinetic).toBe(0)
    expect(e.total.potential).toBeCloseTo(2 * 9.81 * 0.25, 12)
    expect(e.total.elastic).toBeCloseTo(9, 12)
    expect(e.total.total).toBeCloseTo(13.905, 12)
    // The same total built by hand from the two primitives the readout is made of.
    const block = named(bodies, 'M')
    const byHand = energyOf(block, startStateOf(block, 2), 9.81, 0).total + springEnergyOf(links[0], [-3, 0.25, 0], [0.6, 0.25, 0]).total
    expect(e.total.total).toBeCloseTo(byHand, 12)
    // One row per moving body, one per spring.
    expect(e.known.map((k) => k.def.name)).toEqual(['M'])
    expect(e.springs).toHaveLength(1)
  })

  it('a scene without a spring reads exactly as before: a string is not a spring', () => {
    const { bodies, links } = presetById('pendulum')!.build()
    expect((links ?? []).map((l) => l.kind)).toEqual(['string'])
    const bob = named(bodies, 'Bob')
    const e = sceneEnergy(bodies, links ?? [], {}, 9.81, massOf)
    expect(e.springs).toEqual([])
    expect(e.total.elastic).toBe(0)
    expect(e.total.potential).toBeCloseTo(massOf(bob) * 9.81 * bob.position[1], 12)
    expect(e.total.total).toBeCloseTo(e.total.kinetic + e.total.potential, 12)
  })

  it('skips a spring whose end was deleted and one that joins a body to itself, as the engine does', () => {
    const { bodies, links } = ice()
    const block = named(bodies, 'M')
    expect(springReadings(bodies, [{ ...links[0], b: 'gone' }], {})).toEqual([])
    expect(springReadings(bodies, [{ ...links[0], a: block.id, b: block.id }], {})).toEqual([])
    // A rope between the same two bodies is not a spring.
    expect(springReadings(bodies, [{ ...links[0], kind: 'rope' }], {})).toEqual([])
  })

  it('the exact motion of the block keeps the readout total flat, so any drift later is the engine, not the readout', () => {
    const { bodies, links } = ice()
    const block = named(bodies, 'M')
    // x(t) = 0.6 cos ωt about the natural length, ω = √(k/m) = 5 rad/s: the energy swaps between
    // the spring and the block's motion but the sum is 9 J all the way round.
    const omega = Math.sqrt(50 / 2)
    const totals: number[] = []
    const movingOnly: number[] = []
    for (let i = 0; i <= 50; i++) {
      const t = i / 10
      const position: V3 = [0.6 * Math.cos(omega * t), 0.25, 0]
      const velocity: V3 = [-0.6 * omega * Math.sin(omega * t), 0, 0]
      const e = sceneEnergy(bodies, links, { [block.id]: { ...startStateOf(block, 2), position, velocity } }, 9.81, massOf)
      totals.push(e.total.total)
      movingOnly.push(systemEnergy(e.known.map((k) => k.energy)).total)
    }
    for (const total of totals) expect(total).toBeCloseTo(13.905, 9)
    // The old readout (the moving block alone) swung by nearly the whole 9 J over the same motion.
    expect(Math.max(...movingOnly) - Math.min(...movingOnly)).toBeGreaterThan(8.5)
  })
})

describe('Spring on ice in the real engine', () => {
  // The readout's total as the Sandbox view feeds it: the engine's state of every body, static ones
  // too, every 0.1 s of simulated time from t = 0 to 5 s, at the preset's own world settings and the
  // default step rate (240 steps a second since SB0; the frames below are 1/60 s of real time each).
  const totals: number[] = []
  const bodiesOnly: number[] = []

  beforeAll(async () => {
    const built = ice()
    const settings = { ...DEFAULT_WORLD, airDensity: 0, ...(built.world ?? {}) }
    const world = await SimWorld.create(settings)
    try {
      world.rebuild(built.bodies, built.links)
      const read = () => {
        const live: Record<string, BodyState> = {}
        for (const d of built.bodies) {
          const s = world.state(d.id)
          if (s) live[d.id] = s
        }
        const e = sceneEnergy(built.bodies, built.links, live, settings.gravity, massOf)
        totals.push(e.total.total)
        bodiesOnly.push(systemEnergy(e.known.map((k) => k.energy)).total)
      }
      read()
      for (let i = 1; i <= 50; i++) {
        for (let s = 0; s < 6; s++) world.step(1 / 60)
        read()
      }
    } finally {
      world.destroy()
    }
  }, 60_000)

  /** The largest change between two neighbouring readings, as a share of the start. */
  const biggestJump = (list: number[]) => Math.max(...list.slice(1).map((v, i) => Math.abs(v - list[i]))) / list[0]

  it('starts at ½mv² + mgh + ½kx² = 13.905 J and moves smoothly: the old readout jumped by 29 % between readings, this one by under 3 %', () => {
    expect(totals).toHaveLength(51)
    expect(totals[0]).toBeCloseTo(13.905, 4)
    // Without the spring the readings run 4.9 J → 13.3 J → 7.8 J …: the block's motion alone.
    expect(biggestJump(bodiesOnly)).toBeGreaterThan(0.2)
    // With it the only movement is the step's own band (below), well under 3 % per 0.1 s.
    expect(biggestJump(totals)).toBeLessThan(0.03)
  })

  // SB0: the spring is PhysLab's own Hooke force now, worked out before every step, and Jolt's step
  // (v first, then x) keeps the swinging energy in a band of ±ωΔt/2 about where it started — above
  // as well as below — with no drift. At 240 steps a second, ω = 5 rad/s: ±1.04 % of the 9 J that
  // swings, ±0.67 % of the 13.905 J total. Anything past that band is counted twice or pumped in.
  const band = ((5 / 240) / 2) * 9

  it('never rises above where it started by more than the step’s own band: a readout that gains more is counting something twice', () => {
    expect(Math.max(...totals)).toBeLessThan(totals[0] + band * 1.05)
  })

  // This was an expected failure until SB0: Jolt's soft distance limit, integrated implicitly
  // (backward Euler) at each collision sub-step, lost 41.9 % of the total in these 5 s with nothing
  // rubbing (ω = 5 rad/s, h = 1/120 s: the amplitude times 1/√(1 + (ωh)²) every step). PhysLab's own
  // spring keeps it inside the band above: the worst reading is about 0.67 % of 13.905 J.
  it('stays within 1 % of the start for the whole 5 s', () => {
    const worst = Math.max(...totals.map((t) => Math.abs(t - totals[0]))) / totals[0]
    expect(worst, `the total wandered ${Math.round(worst * 10000) / 100} % from ${totals[0]} J`).toBeLessThan(0.01)
  })
})

describe('spin energy about the axis it actually spins about (H15)', () => {
  const m = 2
  const st = (angularVelocity: [number, number, number], rotation: [number, number, number, number] = [0, 0, 0, 1]) => ({ position: [0, 0, 0] as [number, number, number], rotation, velocity: [0, 0, 0] as [number, number, number], angularVelocity, mass: m, asleep: false })
  const cyl = body({ shape: 'cylinder', size: [0.5, 2, 0.5] })

  it('a cylinder spinning about its own axis has ½ · ½mr² · ω²', () => {
    expect(energyOf(cyl, st([0, 3, 0]), 9.81).rotational).toBeCloseTo(0.5 * (0.5 * m * 0.25) * 9, 9)
  })

  it('tumbling end over end it has ½ · m(3r² + h²)/12 · ω², not the axial figure', () => {
    const I = (m * (3 * 0.25 + 4)) / 12
    expect(energyOf(cyl, st([3, 0, 0]), 9.81).rotational).toBeCloseTo(0.5 * I * 9, 9)
  })

  it('turned on its side, rolling about the world z axis is spin about its own axis', () => {
    // 90° about x: the cylinder's own y axis now lies along world z.
    const q: [number, number, number, number] = [Math.SQRT1_2, 0, 0, Math.SQRT1_2]
    expect(energyOf(cyl, st([0, 0, 3], q), 9.81).rotational).toBeCloseTo(0.5 * (0.5 * m * 0.25) * 9, 9)
  })

  it('a box spinning about its long axis uses that axis’s moment', () => {
    const plank = body({ shape: 'box', size: [4, 0.1, 0.3] })
    expect(energyOf(plank, st([2, 0, 0]), 9.81).rotational).toBeCloseTo(0.5 * ((m * (0.01 + 0.09)) / 12) * 4, 9)
  })
})

// SB58 (an owner item): the pendulum angle on every axis, and pulling the bob back to an angle like the
// launcher. The arithmetic is checked on hand-made positions, then the real engine (Jolt, Node, 240
// steps a second) swings the Pendulum preset from an angle that was set, and the swing and its period
// are compared with the formulas (sim/predict.ts).

import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { readSource } from './helpers/repo'
import {
  MAX_ANGLE,
  PLANES,
  SLACK_FRACTION,
  angleRefusal,
  anglesOf,
  directionAt,
  heightAbove,
  isSlack,
  meaningLines,
  periodsOf,
  pivotOf,
  placeAtAngle,
  planPullBack,
  planesFor,
  protractorOf,
  rowsFor,
  slackSentence,
  tapePositionOf,
  whereFor,
  type Angles,
  type HangKind,
  type Num,
  type Pivot,
  type Plane,
  type Protractor,
  type PullBackInput,
  type PullBackPlan,
  type TapeView
} from '../src/renderer/src/sim/pendulum'
import { pullBack } from '../src/renderer/src/panels/sandbox/PendulumFold'
import { pendulumExact, pendulumSmall } from '../src/renderer/src/sim/predict'
import { presetById } from '../src/renderer/src/sim/presets'
import { DEFAULT_WORLD, type BodyDef, type Link } from '../src/renderer/src/sim/types'
import { engine, useSandbox } from '../src/renderer/src/sim/store'
import { SimWorld } from '../src/renderer/src/sim/world'
import { replayRefusal, startRecorder, tapes } from '../src/renderer/src/sim/recorder'
import { shownTape, useTape } from '../src/renderer/src/sim/tapeStore'
import { useScene } from '../src/renderer/src/core/store'
import type { V3 } from '../src/renderer/src/math/vec'

/** A number writer for the tests: three decimals, the unit after a space (the shape of the panel's useNum). */
const num: Num = (v, unit = '') => `${Math.round(v * 1000) / 1000}${unit ? ` ${unit}` : ''}`

const DEG = 180 / Math.PI
const RAD = Math.PI / 180
const G = 9.81

const P: V3 = [1, 4, -2]

/** The bob L from P at θ from the vertical, leaning toward φ (degrees from +x toward +z): built the long way round. */
const bobAt = (L: number, theta: number, phi: number): V3 => [
  P[0] + L * Math.sin(theta * RAD) * Math.cos(phi * RAD),
  P[1] - L * Math.cos(theta * RAD),
  P[2] + L * Math.sin(theta * RAD) * Math.sin(phi * RAD)
]

const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

describe('anglesOf: the angle of a bob from its pivot, on hand-made positions', () => {
  it('0°: hanging straight down has no swing and leans nowhere', () => {
    const a: Angles = anglesOf([1, 2, -2], P)!
    expect(a.theta).toBe(0)
    expect(a.side).toBe(0)
    expect(a.depth).toBe(0)
    expect(a.lean).toBeNull()
    expect(a.distance).toBe(2)
  })

  it('30° in the side plane (x–y): θ = θ_xy = 30, nothing in the depth plane, leaning toward +x', () => {
    const a = anglesOf(bobAt(2, 30, 0), P)!
    expect(a.theta).toBeCloseTo(30, 10)
    expect(a.side).toBeCloseTo(30, 10)
    expect(a.depth).toBeCloseTo(0, 10)
    expect(a.lean).toBeCloseTo(0, 10)
  })

  it('30° the other way in the side plane reads −30 there, still 30 from the vertical, leaning toward −x', () => {
    const a = anglesOf(bobAt(2, 30, 180), P)!
    expect(a.theta).toBeCloseTo(30, 10)
    expect(a.side).toBeCloseTo(-30, 10)
    expect(Math.abs(a.lean!)).toBeCloseTo(180, 10)
  })

  it('30° in the depth plane (z–y): θ = θ_zy = 30, nothing in the side plane, leaning toward +z', () => {
    const a = anglesOf(bobAt(2, 30, 90), P)!
    expect(a.theta).toBeCloseTo(30, 10)
    expect(a.depth).toBeCloseTo(30, 10)
    expect(a.side).toBeCloseTo(0, 10)
    expect(a.lean).toBeCloseTo(90, 10)
  })

  it('90°: level with the pivot is 90 from the vertical and 90 in the plane it lies in', () => {
    const a = anglesOf([P[0] + 2, P[1], P[2]], P)!
    expect(a.theta).toBeCloseTo(90, 10)
    expect(a.side).toBeCloseTo(90, 10)
    expect(a.depth).toBe(0)
    const z = anglesOf([P[0], P[1], P[2] + 2], P)!
    expect(z.theta).toBeCloseTo(90, 10)
    expect(z.depth).toBeCloseTo(90, 10)
    expect(z.side).toBe(0)
  })

  it('a diagonal lean: θ = 40 from the vertical toward φ = 60, and each plane sees its own projection', () => {
    const a = anglesOf(bobAt(3, 40, 60), P)!
    expect(a.theta).toBeCloseTo(40, 10)
    expect(a.lean).toBeCloseTo(60, 10)
    // θ_xy = atan2(rₓ, −r_y) with rₓ = sin 40 cos 60 and −r_y = cos 40; θ_zy likewise with sin 60.
    expect(a.side).toBeCloseTo(Math.atan2(Math.sin(40 * RAD) * Math.cos(60 * RAD), Math.cos(40 * RAD)) * DEG, 10)
    expect(a.depth).toBeCloseTo(Math.atan2(Math.sin(40 * RAD) * Math.sin(60 * RAD), Math.cos(40 * RAD)) * DEG, 10)
    // Neither plane sees the whole swing, but the total is never less than either.
    expect(a.theta).toBeGreaterThan(a.side)
    expect(a.theta).toBeGreaterThan(a.depth)
  })

  it('above the pivot: 150° from the vertical, and straight up is exactly 180', () => {
    expect(anglesOf(bobAt(2, 150, 0), P)!.theta).toBeCloseTo(150, 10)
    const up = anglesOf([P[0], P[1] + 2, P[2]], P)!
    expect(up.theta).toBe(180)
    expect(up.side).toBe(180)
    expect(up.depth).toBe(180)
  })

  it('the bob on the pivot has no arm and so no angle', () => {
    expect(anglesOf([...P] as V3, P)).toBeNull()
  })

  it('the engine’s 32-bit grain is not a lean: a bob hanging at rest reads 0, not 6×10⁻⁷ degrees', () => {
    const a = anglesOf([1 + 3e-7, 2, -2 - 2e-7], P)!
    expect(a.theta).toBe(0)
    expect(a.side).toBe(0)
    expect(a.depth).toBe(0)
    expect(a.lean).toBeNull()
    // A real lean of a thousandth of a degree is still seen.
    expect(anglesOf(bobAt(2, 0.001, 0), P)!.theta).toBeCloseTo(0.001, 8)
  })
})

describe('placeAtAngle: the bob goes round the pivot and keeps its distance', () => {
  const swings: Array<[number, Plane]> = []
  for (const theta of [0, 1, 10, 30, 45, 89.9, 90, 120, 150, 179, -30, -90, -179]) for (const plane of PLANES) swings.push([theta, plane])

  it.each(swings)('θ = %s° in the %s plane: |B − P| = L to 1e-12, and the angle asked is the angle read back', (theta, plane) => {
    const L = 2.37
    const b = placeAtAngle(P, L, theta, plane)
    expect(Math.abs(dist(b, P) - L)).toBeLessThan(1e-12)
    const a = anglesOf(b, P)!
    expect(a.theta).toBeCloseTo(Math.abs(theta), 9)
    expect(plane === 'side' ? a.side : a.depth).toBeCloseTo(theta, 9)
    // The other plane sees the arm end-on: nothing while it hangs below the pivot's level, straight up (180°) once it is above it, and 0 when level.
    const other = plane === 'side' ? a.depth : a.side
    const expected = Math.abs(theta) < 89.95 ? 0 : Math.abs(theta) > 90.05 ? 180 : 0
    expect(other).toBeCloseTo(expected, 9)
  })

  it('side plane: B = P + L(sin θ, −cos θ, 0); depth plane: B = P + L(0, −cos θ, sin θ)', () => {
    const s = placeAtAngle(P, 2, 30, 'side')
    expect(s[0]).toBeCloseTo(1 + 2 * 0.5, 12)
    expect(s[1]).toBeCloseTo(4 - 2 * Math.cos(30 * RAD), 12)
    expect(s[2]).toBe(-2)
    const d = placeAtAngle(P, 2, 30, 'depth')
    expect(d[0]).toBe(1)
    expect(d[1]).toBeCloseTo(4 - 2 * Math.cos(30 * RAD), 12)
    expect(d[2]).toBeCloseTo(-2 + 2 * 0.5, 12)
  })

  it('directionAt is a unit vector', () => {
    for (const theta of [0, 33, 90, 171]) for (const plane of PLANES) expect(Math.hypot(...directionAt(theta, plane))).toBeCloseTo(1, 14)
  })
})

describe('what the angle means: h = L(1 − cos θ) and the periods', () => {
  it('the height above the lowest point', () => {
    expect(heightAbove(2, 0)).toBe(0)
    expect(heightAbove(2, 60)).toBeCloseTo(1, 12)
    expect(heightAbove(2, 90)).toBeCloseTo(2, 12)
    expect(heightAbove(2, 180)).toBeCloseTo(4, 12)
  })

  it('the three connections a bob can hang from are all given a period', () => {
    const kinds: HangKind[] = ['string', 'rod', 'rope']
    for (const kind of kinds) expect(periodsOf(2, G, 20, kind)!.small).toBeCloseTo(pendulumSmall(2, G), 12)
  })

  it('a rod gets the small-swing period and the exact one for the angle, from predict.ts', () => {
    const p = periodsOf(2, G, 30, 'rod')!
    expect(p.small).toBe(pendulumSmall(2, G))
    expect(p.exact).toBe(pendulumExact(2, G, 30))
    expect(p.exact!).toBeGreaterThan(p.small)
  })

  it('a string or a rope past 90° goes slack: no exact period, and it says why', () => {
    const p = periodsOf(2, G, 120, 'string')!
    expect(p.exact).toBeNull()
    expect(p.note).toMatch(/string goes slack past 90°/)
    expect(periodsOf(2, G, 120, 'rod')!.exact).not.toBeNull()
  })

  it('no gravity gives no period, and no length gives none either', () => {
    expect(periodsOf(2, 0, 30, 'rod')).toBeNull()
    expect(periodsOf(0, G, 30, 'rod')).toBeNull()
    expect(meaningLines({ L: 2, g: 0, theta: 30, kind: 'rod' }, num).join(' ')).toMatch(/no gravity/)
  })

  it('the lines say which period is which, through the formatter', () => {
    const lines = meaningLines({ L: 2, g: G, theta: 30, kind: 'string' }, num)
    expect(lines[0]).toBe(`Height above its lowest point: h = L(1 − cos θ) = ${num(2 * (1 - Math.cos(30 * RAD)), 'm')}`)
    expect(lines[1]).toBe(`Period for small swings: T = 2π√(L/g) = ${num(pendulumSmall(2, G), 's')}`)
    expect(lines[2]).toBe(`Period for a swing that starts at this angle (θ = ${num(30, '°')}): T = ${num(pendulumExact(2, G, 30), 's')}`)
    expect(lines).toHaveLength(3)
    expect(meaningLines({ L: 2, g: G, theta: 30, kind: 'rope' }, num)).toHaveLength(4)
  })
})

/** A scene: a static pivot, and bobs hung from it or from each other. */
let id = 0
function body(name: string, position: V3, over: Partial<BodyDef> = {}): BodyDef {
  return {
    id: `p${++id}`,
    name,
    shape: 'sphere',
    size: [0.15, 0.15, 0.15],
    position,
    rotation: [0, 0, 0],
    velocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    motion: 'dynamic',
    material: 'lead',
    massMode: 'mass',
    mass: 1,
    restitution: 0,
    friction: 0.5,
    linearDamping: 0,
    angularDamping: 0,
    color: 'x',
    ...over
  }
}
const link = (kind: Link['kind'], a: BodyDef, b: BodyDef, length: number): Link => ({ id: `l${++id}`, kind, a: a.id, b: b.id, length, stiffness: 200, damping: 0.5 })

describe('pivotOf: what a body hangs from', () => {
  it('the Pendulum preset: the bob hangs from the pivot by a 2 m string', () => {
    const { bodies, links } = presetById('pendulum')!.build()
    const bob = bodies.find((b) => b.name === 'Bob')!
    const pivot = bodies.find((b) => b.name === 'Pivot')!
    const hang: Pivot = pivotOf(bob.id, links!, bodies)!
    expect(hang.point).toEqual([0, 4, 0])
    expect(hang.length).toBe(2)
    expect(hang.kind).toBe('string')
    expect(hang.linkId).toBe(links![0].id)
    expect(hang.bodyId).toBe(pivot.id)
    expect(hang.moving).toBe(false)
  })

  it('the pivot point follows where the pivot is now, not where it was drawn', () => {
    const pivot = body('Pivot', [0, 4, 0], { motion: 'static' })
    const bob = body('Bob', [0, 2, 0])
    const hang = pivotOf(bob.id, [link('rod', pivot, bob, 2)], [pivot, bob], (i) => (i === pivot.id ? [3, 5, 1] : undefined))!
    expect(hang.point).toEqual([3, 5, 1])
  })

  it('no pivot, no fold: no links, a fixed body, a spring, a hinge, a pulley and a lone link to nothing', () => {
    const a = body('A', [0, 4, 0], { motion: 'static' })
    const b = body('B', [0, 2, 0])
    expect(pivotOf(b.id, [], [a, b])).toBeNull()
    expect(pivotOf(a.id, [link('rod', a, b, 2)], [a, b])).toBeNull()
    for (const kind of ['spring', 'hinge', 'weld', 'pulley'] as const) expect(pivotOf(b.id, [link(kind, a, b, 2)], [a, b]), kind).toBeNull()
    expect(pivotOf(b.id, [link('rod', a, { ...b, id: 'gone' }, 2)], [a, b])).toBeNull()
    expect(pivotOf('nobody', [link('rod', a, b, 2)], [a, b])).toBeNull()
  })

  it('a bob on two fixed pivots (a V of strings) is not a simple pendulum', () => {
    const { bodies, links } = presetById('swingbridge')!.build()
    const bob = bodies.find((b) => b.name === 'Bob')!
    expect(pivotOf(bob.id, links!, bodies)).toBeNull()
  })

  it('the floor is never a pivot', () => {
    const floor = body('Floor', [0, 0, 0], { motion: 'static', shape: 'ground', size: [50, 1, 50] })
    const b = body('B', [0, -1, 0])
    expect(pivotOf(b.id, [link('rod', floor, b, 1)], [floor, b])).toBeNull()
  })

  it('two crates on a level rod, and the tug on a slack rope, are not pendulums; a bob hung from a bob is', () => {
    const trolleys = presetById('trolleys')!.build()
    const crate = trolleys.bodies.find((b) => b.name === 'A')!
    expect(pivotOf(crate.id, trolleys.links!, trolleys.bodies)).toBeNull()
    const tug = presetById('tug')!.build()
    expect(pivotOf(tug.bodies.find((b) => b.name === 'Crate')!.id, tug.links!, tug.bodies)).toBeNull()

    const pin = body('Pin', [0, 5, 0], { motion: 'static' })
    const upper = body('Upper', [0, 4, 0])
    const lower = body('Lower', [0, 3, 0])
    const rods = [link('rod', pin, upper, 1), link('rod', upper, lower, 1)]
    // The upper bob hangs from the fixed pin although the lower bob hangs from it; the lower hangs from the upper.
    expect(pivotOf(upper.id, rods, [pin, upper, lower])!.bodyId).toBe(pin.id)
    const low = pivotOf(lower.id, rods, [pin, upper, lower], (i) => (i === upper.id ? [0.5, 4.1, 0] : undefined))!
    expect(low.bodyId).toBe(upper.id)
    expect(low.moving).toBe(true)
    expect(low.point).toEqual([0.5, 4.1, 0])
  })

  it('a rope ties to the surfaces: its straight arm is the rope plus the two reaches', () => {
    const { bodies, links } = presetById('ropeswing')!.build()
    const bob = bodies.find((b) => b.name === 'Bob')!
    const beam = bodies.find((b) => b.name === 'Beam')!
    const rope = links![0]
    const hang = pivotOf(bob.id, links!, bodies)!
    expect(hang.kind).toBe('rope')
    // A sphere of radius 0.18 and a 0.15 m box (reach half its smallest side, 0.075).
    expect(hang.length).toBeCloseTo(rope.length + 0.18 + 0.075, 12)
    expect(hang.armAt([0, -1, 0])).toBeCloseTo(rope.length + 0.18 + 0.075, 12)
    expect(beam.size[0]).toBe(0.15)
  })
})

describe('slack, the refusals and the rows', () => {
  it('a rod cannot be slack; a string or a rope is when the bob is clearly nearer than the length', () => {
    expect(isSlack('rod', 0.5, 2)).toBe(false)
    expect(isSlack('string', 2, 2)).toBe(false)
    expect(isSlack('string', 1.97, 2)).toBe(false)
    expect(isSlack('string', 1.5, 2)).toBe(true)
    expect(isSlack('rope', 1.5, 2)).toBe(true)
    // A rope swinging at 85° bows to 0.95 of its length on the engine and is still pulling.
    expect(isSlack('rope', 0.95 * 2, 2)).toBe(false)
    expect(isSlack('rope', 0.83 * 2, 2)).toBe(true)
    expect(slackSentence('rope')).toMatch(/^The rope is slack/)
  })

  it('180° and more are refused with a sentence, so is a non-number, and the depth plane in a flat world', () => {
    expect(angleRefusal(MAX_ANGLE, 'side', true, num)).toBeNull()
    expect(angleRefusal(-MAX_ANGLE, 'depth', false, num)).toBeNull()
    expect(angleRefusal(180, 'side', false, num)).toBe('A swing of 180 ° or more would put the bob on top of its pivot or past it. Choose an angle from -179 ° to 179 °.')
    expect(angleRefusal(-200, 'side', false, num)).toMatch(/180 ° or more/)
    expect(angleRefusal(Number.NaN, 'side', false, num)).toMatch(/number of degrees/)
    expect(angleRefusal(30, 'depth', true, num)).toMatch(/2D mode/)
    expect(angleRefusal(30, 'side', true, num)).toBeNull()
    // Its numbers go through the writer it is given: a different writer, a different sentence.
    expect(angleRefusal(200, 'side', false, (v, unit) => `<${v}${unit ?? ''}>`)).toContain('<180°>')
  })

  it('a flat world reads one angle (x–y) and offers one plane; 3-D reads the swing, both planes and the lean', () => {
    expect(rowsFor(true)).toEqual(['side'])
    expect(planesFor(true)).toEqual(['side'])
    expect(rowsFor(false)).toEqual(['theta', 'side', 'depth', 'lean'])
    expect(planesFor(false)).toEqual(['side', 'depth'])
  })
})

describe('the protractor drawing', () => {
  it('the arm is the arm at θ from the vertical, leaning to the side asked', () => {
    const right: Protractor = protractorOf(30, 1)
    expect(right.vertical[0]).toBeCloseTo(right.pivot[0], 12)
    expect(right.vertical[1]).toBeGreaterThan(right.pivot[1])
    expect(right.arm[0]).toBeCloseTo(right.pivot[0] + right.radius * 0.5, 10)
    expect(right.arm[1]).toBeCloseTo(right.pivot[1] + right.radius * Math.cos(30 * RAD), 10)
    const left = protractorOf(30, -1)
    expect(left.arm[0]).toBeCloseTo(left.pivot[0] - left.radius * 0.5, 10)
  })

  it('past 90° the arm points above the pivot, hanging straight has no arc, and it all fits the box', () => {
    const high = protractorOf(150, 1)
    expect(high.arm[1]).toBeLessThan(high.pivot[1])
    expect(protractorOf(0, 1).arc).toBe('')
    expect(protractorOf(30, 1).arc).toMatch(/^M [\d.]+ [\d.]+ A /)
    for (const t of [0, 45, 90, 135, 180]) {
      const d = protractorOf(t, 1)
      for (const [x, y] of [d.arm, d.vertical, ...d.ticks.flatMap((k) => [[k[0], k[1]], [k[2], k[3]]] as [number, number][])]) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(d.box.width)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(d.box.height)
      }
    }
  })
})

// ------------------------------------------------------------------ the real engine

/** The Pendulum preset in a real world, with the same calls the fold makes. */
async function pendulum(world: Partial<typeof DEFAULT_WORLD> = {}) {
  const built = presetById('pendulum')!.build()
  const settings = { ...DEFAULT_WORLD, ...(built.world ?? {}), ...world }
  const w = await SimWorld.create(settings)
  w.rebuild(built.bodies, built.links ?? [])
  const bob = built.bodies.find((b) => b.name === 'Bob')!
  const input = (over: Partial<PullBackInput> = {}): PullBackInput => ({
    bobId: bob.id,
    bodies: built.bodies,
    links: built.links ?? [],
    where: (i) => w.state(i)?.position as V3 | undefined,
    twoD: settings.twoD,
    engineTime: w.time,
    refusal: null,
    num,
    ...over
  })
  /** The fold's Set: plan, then place the bob at rest (and move the start when the plan says to). */
  const pull = (theta: number, plane: Plane) => {
    const plan = planPullBack(input(), theta, plane)
    if (plan.ok) w.placeBody(bob.id, plan.position)
    return plan
  }
  const angles = () => anglesOf(w.state(bob.id)!.position as V3, [0, 4, 0])!
  const frame = () => w.step(1 / 60)
  return { w, built, bob, settings, input, pull, angles, frame }
}

let live: SimWorld | null = null
afterEach(() => {
  live?.destroy()
  live = null
})

beforeAll(async () => {
  ;(await SimWorld.create()).destroy()
}, 30_000)

describe('the real engine swings from the angle that was set', () => {
  it('Set 30° in the side plane, then play: the first swing reaches 30° ± 0.5° on the other side, and the period is the formula’s ± 1 %', async () => {
    const s = await pendulum()
    live = s.w
    expect(s.pull(30, 'side').ok).toBe(true)
    // At rest at 30° exactly, before a single step.
    const start = s.angles()
    // Jolt holds positions as 32-bit floats: good to a millionth of a degree, not to a billionth.
    expect(start.side).toBeCloseTo(30, 4)
    expect(start.distance).toBeCloseTo(2, 5)
    expect(Math.hypot(...s.w.state(s.bob.id)!.velocity)).toBe(0)
    expect(Math.hypot(...s.w.state(s.bob.id)!.angularVelocity)).toBe(0)

    const T = pendulumExact(2, G, 30)
    // The first swing's largest angle on the other side: the lowest the side angle gets in the first half period.
    let other = 0
    let maxFirst = 0
    const crossings: number[] = []
    let prev = s.angles().side
    for (let k = 0; k < 60 * 20; k++) {
      s.frame()
      const a = s.angles()
      if (s.w.time <= T * 0.75) {
        other = Math.min(other, a.side)
        maxFirst = Math.max(maxFirst, a.side)
      }
      // Downward crossings of zero, with the instant found by interpolating the two frames.
      if (prev > 0 && a.side <= 0) crossings.push(s.w.time - 1 / 60 + (prev / (prev - a.side)) * (1 / 60))
      prev = a.side
    }
    expect(other).toBeLessThan(-29.5)
    expect(other).toBeGreaterThan(-30.5)
    expect(maxFirst).toBeLessThanOrEqual(30.0001)
    expect(crossings.length).toBeGreaterThan(4)
    const measured = (crossings[crossings.length - 1] - crossings[0]) / (crossings.length - 1)
    expect(Math.abs(measured - T) / T).toBeLessThan(0.01)
    // And the formula the fold shows is the bigger-than-small-swing one.
    expect(T).toBeGreaterThan(pendulumSmall(2, G))
  }, 60_000)

  it('Set 30° in the depth plane in a 3-D world: it swings through z–y and stays out of x–y', async () => {
    const s = await pendulum({ twoD: false })
    live = s.w
    expect(s.pull(30, 'depth').ok).toBe(true)
    const a0 = s.angles()
    expect(a0.depth).toBeCloseTo(30, 4)
    expect(a0.side).toBeCloseTo(0, 4)
    let low = 0
    let drift = 0
    for (let k = 0; k < 100; k++) {
      s.frame()
      const a = s.angles()
      low = Math.min(low, a.depth)
      drift = Math.max(drift, Math.abs(a.side))
    }
    // Half a period (1.44 s) later the depth angle has crossed zero and reached the far side.
    expect(low).toBeLessThan(-29)
    expect(drift).toBeLessThan(0.05)
  }, 60_000)

  it('Set works when the run is paused part-way: the bob is put at the new angle at rest and the run goes on from there', async () => {
    const s = await pendulum()
    live = s.w
    for (let k = 0; k < 90; k++) s.frame()
    expect(s.w.time).toBeGreaterThan(1)
    const plan = s.pull(-45, 'side')
    expect(plan.ok).toBe(true)
    // Part-way, the start (Reset) is left alone and only the body is placed.
    expect(plan.ok && plan.setsStart).toBe(false)
    const a = s.angles()
    expect(a.side).toBeCloseTo(-45, 4)
    expect(Math.hypot(...s.w.state(s.bob.id)!.velocity)).toBe(0)
    let high = 0
    for (let k = 0; k < 100; k++) {
      s.frame()
      high = Math.max(high, s.angles().side)
    }
    // Let go at −45°, it swings to about +45° on the other side (half a period is ~1.5 s).
    expect(high).toBeGreaterThan(42)
  }, 60_000)

  it('before the run the start moves with it; the clock at zero says so', async () => {
    const s = await pendulum()
    live = s.w
    const plan = planPullBack(s.input(), 20, 'side')
    expect(plan.ok && plan.setsStart).toBe(true)
  })

  it('a rod keeps its length through Set to 100°, and the plan puts the bob at the rod’s length', async () => {
    const pin = body('Pin', [0, 4, 0], { motion: 'static', size: [0.1, 0.1, 0.1], shape: 'box' })
    const bob = body('Bob', [0, 2, 0])
    const rod = link('rod', pin, bob, 2)
    const w = await SimWorld.create({ ...DEFAULT_WORLD, airDensity: 0 })
    live = w
    w.rebuild([pin, bob], [rod])
    const plan = planPullBack({ bobId: bob.id, bodies: [pin, bob], links: [rod], where: (i) => w.state(i)?.position as V3 | undefined, twoD: true, engineTime: 0, refusal: null, num }, 100, 'side')
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    w.placeBody(bob.id, plan.position)
    for (let k = 0; k < 60; k++) w.step(1 / 60)
    const a = anglesOf(w.state(bob.id)!.position as V3, [0, 4, 0])!
    expect(Math.abs(a.distance - 2)).toBeLessThan(0.01)
  }, 60_000)
})

describe('a rope pendulum: the arm includes the reaches, and the rope is taut where it is set', () => {
  it('Set 40° on the Rope swing puts the bob at the rope’s straight length and the rope stays taut', async () => {
    const built = presetById('ropeswing')!.build()
    const w = await SimWorld.create({ ...DEFAULT_WORLD, ...(built.world ?? {}) })
    live = w
    w.rebuild(built.bodies, built.links ?? [])
    const bob = built.bodies.find((b) => b.name === 'Bob')!
    const beam = built.bodies.find((b) => b.name === 'Beam')!
    const input: PullBackInput = { bobId: bob.id, bodies: built.bodies, links: built.links ?? [], where: (i) => w.state(i)?.position as V3 | undefined, twoD: true, engineTime: 0, refusal: null, num }
    const hang = pivotOf(bob.id, built.links!, built.bodies)!
    const plan = planPullBack(input, 40, 'side')
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.length).toBeCloseTo(hang.length, 12)
    w.placeBody(bob.id, plan.position)
    const at = (): V3 => w.state(bob.id)!.position as V3
    const start = anglesOf(at(), beam.position)!
    expect(start.side).toBeCloseTo(40, 4)
    expect(start.distance).toBeCloseTo(hang.length, 5)
    // A rope pulled out straight is not slack, and a bob let go swings without it going slack.
    expect(isSlack('rope', start.distance, hang.length)).toBe(false)
    let nearest = Infinity
    for (let k = 0; k < 120; k++) {
      w.step(1 / 60)
      nearest = Math.min(nearest, anglesOf(at(), beam.position)!.distance)
    }
    expect(nearest / hang.length).toBeGreaterThan(1 - SLACK_FRACTION.rope)
  }, 60_000)

  it('a rope that sags in a heap (bob much nearer than its length) is slack and the sentence says so', () => {
    expect(isSlack('rope', 1.0, 2.4)).toBe(true)
    expect(slackSentence('rope')).toMatch(/slack/)
  })
})

describe('replay: Set is refused with the recorder’s sentence, and the angle reads the shown step', () => {
  afterEach(() => {
    useTape.getState().backToLive()
  })

  it('stepping back enters replay; planPullBack refuses with replayRefusal(); the tape holds the bob where the angle was', async () => {
    const s = await pendulum()
    live = s.w
    const stop = startRecorder(s.w)
    try {
      useScene.getState().setPlaying(false)
      s.pull(30, 'side')
      for (let k = 0; k < 240; k++) s.w.stepOnce()
      const tape = tapes.live!
      expect(tape.last).toBeGreaterThanOrEqual(239)
      // The angle at two moments of the tape, read the way the fold reads them.
      useTape.getState().scrubTo(tape.first + 100.5)
      expect(useTape.getState().mode).toBe('replay')
      const sentence = replayRefusal()
      expect(sentence).toMatch(/^Replaying t = /)
      const plan: PullBackPlan = planPullBack(s.input({ refusal: sentence }), 10, 'side')
      expect(plan).toEqual({ ok: false, sentence })

      const shown = shownTape()
      const a = tapePositionOf(shown, useTape.getState().playhead, s.bob.id)!
      const pivot = tapePositionOf(shown, useTape.getState().playhead, 'pivot-not-on-tape')
      expect(pivot).toBeNull()
      // The shown step is a blend of steps 100 and 101: its position lies between theirs, on the arm.
      const r100 = tape.record(tape.first + 100)!
      const r101 = tape.record(tape.first + 101)!
      const i = tape.layout.bodies.indexOf(s.bob.id)
      expect(a[0]).toBeCloseTo((r100[i * 13] + r101[i * 13]) / 2, 5)
      const pivotAt = tapePositionOf(shown, useTape.getState().playhead, s.built.bodies.find((b) => b.name === 'Pivot')!.id)!
      const read = anglesOf(a, pivotAt)!
      // Not the angle it was set to (30°): 100 steps in, the bob has swung on toward the bottom.
      expect(read.theta).toBeLessThan(29.5)
      expect(Math.abs(read.distance - 2)).toBeLessThan(0.01)
    } finally {
      stop()
    }
  }, 60_000)

  it('tapePositionOf reads nothing from no tape, an empty tape or a body that is not on it', () => {
    expect(tapePositionOf(null, 3, 'x')).toBeNull()
    expect(tapePositionOf({ first: 0, last: -1, layout: { bodies: ['x'] }, record: () => null }, 0, 'x')).toBeNull()
    const rec = new Float32Array(13)
    rec[0] = 1
    rec[1] = 2
    rec[2] = 3
    const view: TapeView = { first: 0, last: 1, layout: { bodies: ['x'] }, record: () => rec }
    expect(tapePositionOf(view, 0.5, 'x')).toEqual([1, 2, 3])
    expect(tapePositionOf(view, 0.5, 'y')).toBeNull()
    // A playhead off either end holds at the end.
    expect(tapePositionOf(view, 99, 'x')).toEqual([1, 2, 3])
  })
})

describe('a rope whose bob reaches differently in different directions', () => {
  it('is set at the arm for the NEW direction, not the one it hung in', () => {
    const pin = body('Pin', [0, 5, 0], { motion: 'static', shape: 'box', size: [0.1, 0.1, 0.1] })
    // A cylinder reaches half its height (0.3 m) along its axis and its radius (0.2 m) across it.
    const weight = body('Weight', [0, 3, 0], { shape: 'cylinder', size: [0.2, 0.6, 0.2] })
    const rope = link('rope', pin, weight, 1.5)
    const input: PullBackInput = { bobId: weight.id, bodies: [pin, weight], links: [rope], where: () => undefined, twoD: true, engineTime: 0, refusal: null, num }
    const hanging = pivotOf(weight.id, [rope], [pin, weight])!
    expect(hanging.length).toBeCloseTo(1.5 + 0.05 + 0.3, 12)
    const level = planPullBack(input, 90, 'side')
    expect(level.ok).toBe(true)
    if (!level.ok) return
    expect(level.length).toBeCloseTo(1.5 + 0.05 + 0.2, 12)
    expect(level.length).toBeLessThan(hanging.length - 0.09)
    // And the bob really is that far from the pivot at that angle.
    expect(dist(level.position, pin.position)).toBeCloseTo(level.length, 12)
  })
})

describe('whereFor: what the readout reads', () => {
  const rec = new Float32Array(26)
  rec.set([7, 8, 9], 13)
  const tape: TapeView = { first: 0, last: 0, layout: { bodies: ['a', 'b'] }, record: () => rec }
  const live = { a: { position: [1, 2, 3] as V3 }, b: { position: [4, 5, 6] as V3 } }

  it('live: the engine’s published reading, and nothing for a body that has none yet', () => {
    const where = whereFor({ replaying: false, tape, playhead: 0, live })
    expect(where('a')).toEqual([1, 2, 3])
    expect(whereFor({ replaying: false, tape, playhead: 0, live: {} })('a')).toBeUndefined()
  })

  it('in a replay: the tape at the playhead, never the engine’s reading', () => {
    const where = whereFor({ replaying: true, tape, playhead: 0, live })
    expect(where('b')).toEqual([7, 8, 9])
    expect(where('a')).toEqual([0, 0, 0])
    expect(where('gone')).toBeUndefined()
    expect(whereFor({ replaying: true, tape: null, playhead: 0, live })('a')).toBeUndefined()
  })
})

describe('pullBack: the fold’s Set, against the real stores and the real engine', () => {
  async function stage(over: Partial<typeof DEFAULT_WORLD> = {}) {
    const built = presetById('pendulum')!.build()
    const w = await SimWorld.create({ ...DEFAULT_WORLD, ...(built.world ?? {}), ...over })
    useSandbox.getState().setScene(built.bodies, { ...DEFAULT_WORLD, ...(built.world ?? {}), ...over }, built.links)
    const s = useSandbox.getState()
    w.rebuild(s.bodies, s.links)
    engine.world = w
    live = w
    const bob = s.bodies.find((b) => b.name === 'Bob')!
    const def = () => useSandbox.getState().bodies.find((b) => b.id === bob.id)!
    const angles = () => anglesOf(w.state(bob.id)!.position as V3, [0, 4, 0])!
    return { w, bob, def, angles }
  }

  afterEach(() => {
    engine.world = null
    useSandbox.setState({ engineTime: 0, live: {} })
    useTape.getState().backToLive()
  })

  it('before the run: the start moves with the bob, at rest, and the definition (where Reset goes) is at the new angle; one undo puts it back', async () => {
    const s = await stage()
    const before = useSandbox.getState().bodies
    expect(pullBack(s.bob.id, 30, 'side', num)).toBe('Pulled back to 30 ° in the Side (x–y) plane, at rest.')
    const start = placeAtAngle([0, 4, 0], 2, 30, 'side')
    for (let i = 0; i < 3; i++) expect(s.def().position[i]).toBeCloseTo(start[i], 12)
    expect(s.def().velocity).toEqual([0, 0, 0])
    expect(s.angles().side).toBeCloseTo(30, 4)
    expect(Math.hypot(...s.w.state(s.bob.id)!.velocity)).toBe(0)
    // Nothing is published before a run: the readout reads the definition.
    expect(useSandbox.getState().live).toEqual({})
    // The body list is handed over again, which is what makes the viewport draw.
    expect(useSandbox.getState().bodies).not.toBe(before)
    expect(useSandbox.getState().canUndo()).toBe(true)
    useSandbox.getState().undo()
    expect(s.def().position[0]).toBeCloseTo(0.518, 12)
  }, 60_000)

  it('paused part-way: the body is placed and published, the start (Reset) is left alone', async () => {
    const s = await stage()
    for (let k = 0; k < 90; k++) s.w.step(1 / 60)
    useSandbox.setState({ engineTime: s.w.time, live: { [s.bob.id]: s.w.state(s.bob.id)! } })
    const start = [...s.def().position]
    const before = useSandbox.getState().bodies
    expect(pullBack(s.bob.id, -45, 'side', num)).toBe('Pulled back to -45 ° in the Side (x–y) plane, at rest.')
    expect(s.def().position).toEqual(start)
    expect(s.angles().side).toBeCloseTo(-45, 4)
    // What the panel reads now is the placed body, not the one from a moment ago.
    const shown = anglesOf(useSandbox.getState().live[s.bob.id].position, [0, 4, 0])!
    expect(shown.side).toBeCloseTo(-45, 4)
    // A new list of the same bodies: nothing changed, but the viewport redraws when the list does.
    expect(useSandbox.getState().bodies).not.toBe(before)
    expect(useSandbox.getState().bodies).toEqual(before)
  }, 60_000)

  it('refusals leave everything where it was: 180°, the depth plane in a flat world, a body that hangs from nothing', async () => {
    const s = await stage()
    const at = [...s.w.state(s.bob.id)!.position]
    expect(pullBack(s.bob.id, 180, 'side', num)).toMatch(/^A swing of 180 ° or more/)
    expect(pullBack(s.bob.id, 30, 'depth', num)).toMatch(/2D mode/)
    expect(pullBack(s.bob.id, Number.NaN, 'side', num)).toMatch(/number of degrees/)
    const pivot = useSandbox.getState().bodies.find((b) => b.name === 'Pivot')!
    expect(pullBack(pivot.id, 30, 'side', num)).toMatch(/does not hang from anything/)
    expect([...s.w.state(s.bob.id)!.position]).toEqual(at)
  }, 60_000)

  it('the depth plane works once the world is not flat', async () => {
    const s = await stage({ twoD: false })
    expect(pullBack(s.bob.id, 30, 'depth', num)).toBe('Pulled back to 30 ° in the Depth (z–y) plane, at rest.')
    expect(s.angles().depth).toBeCloseTo(30, 4)
    expect(s.angles().side).toBeCloseTo(0, 4)
  }, 60_000)

  it('in a replay Set is refused with the recorder’s sentence, and nothing moves', async () => {
    const s = await stage()
    const stop = startRecorder(s.w)
    try {
      useScene.getState().setPlaying(false)
      for (let k = 0; k < 120; k++) s.w.stepOnce()
      useTape.getState().scrubTo(tapes.live!.first + 50)
      const sentence = replayRefusal()
      expect(sentence).toMatch(/^Replaying t = /)
      const at = [...s.w.state(s.bob.id)!.position]
      expect(pullBack(s.bob.id, 10, 'side', num)).toBe(sentence)
      expect([...s.w.state(s.bob.id)!.position]).toEqual(at)
    } finally {
      stop()
    }
  }, 60_000)
})

describe('the fold in the panel (source pins: the test suite has no DOM)', () => {
  const fold = readSource('src/renderer/src/panels/sandbox/PendulumFold.tsx')
  const selected = readSource('src/renderer/src/panels/sandbox/Selected.tsx')

  it('Selected mounts it for a moving body, keyed by the body, after the Launcher', () => {
    expect(selected).toContain('{moves && <PendulumFold key={sel.id} sel={sel} />}')
    expect(selected.indexOf('<Launcher id')).toBeLessThan(selected.indexOf('<PendulumFold'))
  })

  it('the readout is live in a replay and the controls are locked: lock={false} on the fold, ReplayLock round the controls', () => {
    expect(fold).toContain('<Fold id="pendulum" open lock={false}>')
    expect(fold).toMatch(/<ReplayLock>[\s\S]*Pull back[\s\S]*<\/ReplayLock>/)
    expect(fold).toContain('replayRefusal()')
    expect(fold).toContain('whereFor({ replaying, tape, playhead, live })')
  })

  it('every button and the plane box is a 44 px target on a touch screen; no new key listener, no toFixed, no colour literal', () => {
    const tags = fold.match(/<(button|select)[^>]*>/g) ?? []
    expect(tags.length).toBeGreaterThanOrEqual(4)
    for (const tag of tags) expect(tag, tag).toContain('pointer-coarse:min-h-[44px]')
    expect(fold).not.toMatch(/addEventListener|onKeyDown|keydown/)
    expect(fold).not.toMatch(/toFixed|toPrecision|toExponential/)
    expect(fold).not.toMatch(/#[0-9a-fA-F]{3,8}/)
  })
})

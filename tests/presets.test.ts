// Every number a preset's sentence promises, checked against the formula it comes from. A
// student reads "lands after 1.01 s" and then reads the clock; if the sentence is wrong the
// simulator looks broken. The engine's side of the same promises is in sim.test.ts, and the
// few numbers that have no formula (a speed the engine's rolling contact settles on) are marked
// `measured` here and held to the sentence by sim.test.ts.

import { describe, expect, it } from 'vitest'
import { groupedPresets, presetBadges, PRESET_TOPICS, presetById, PRESETS } from '../src/renderer/src/sim/presets'
import { dragCoefficient, frontalArea } from '../src/renderer/src/sim/materials'
import { LINK_KINDS, ropeLinkMass, ropeSegments } from '../src/renderer/src/sim/links'

const G = 9.81
const TAU = 2 * Math.PI

/** Speed after falling `h` through air with terminal speed `vt`, as a fraction of vt. */
function dragFraction(h: number, vt: number): number {
  // y = (vt²/g) ln cosh(gt/vt), v = vt tanh(gt/vt)
  const u = Math.acosh(Math.exp((h * G) / (vt * vt)))
  return Math.tanh(u)
}

const terminal = (() => {
  const r = 0.15
  const m = 0.8
  return Math.sqrt((2 * m * G) / (1.225 * dragCoefficient('sphere') * frontalArea('sphere', [r, r, r], [0, -1, 0])))
})()

/** T for a pendulum of length L let go from θ (radians): the series a textbook footnote gives. */
const pendulumPeriod = (L: number, theta: number) => TAU * Math.sqrt(L / G) * (1 + theta ** 2 / 16 + (11 * theta ** 4) / 3072)

/** A number the engine settles on rather than a formula: sim.test.ts holds the sentence to it. */
const measured = (v: number) => v

/** The tug's rope: a tenth of its lightest load, cut into 20 cm links (the rope mass rule). */
const tugRope = ropeLinkMass([2, 4], ropeSegments(1.7)) * ropeSegments(1.7)

/**
 * What each sentence may claim, by unit. A number in the `about` is right when some value here
 * with the same unit rounds to it at the digits the sentence shows. The formula is the test.
 */
const EXPECTED: Record<string, [number, string][]> = {
  fall: [[1, 'kg'], [5, 'm'], [Math.sqrt((2 * 5) / G), 's'], [Math.sqrt(2 * G * 5), 'm/s']],
  projectile: [[14, 'm/s'], [(14 * 14 * Math.sin(Math.PI / 3)) / G, 'm'], [0.3 + (14 * Math.sin(Math.PI / 6)) ** 2 / (2 * G), 'm']],
  cliff: [[4, 'm'], [3, 'm/s'], [Math.sqrt(8 / G), 's'], [3 * Math.sqrt(8 / G), 'm']],
  drop: [[5, 'kg'], [0.5, 'kg'], [6, 'm'], [Math.sqrt(12 / G), 's']],
  moon: [[1.62, 'm/s²'], [5, 'm'], [Math.sqrt(10 / 1.62), 's'], [Math.sqrt(10 / G), 's']],
  terminal: [[0.8, 'kg'], [45, 'm'], [30, 'm'], [terminal, 'm/s'], [100 * dragFraction(45, terminal), '%'], [100 * dragFraction(30, terminal), '%']],
  ramp: [[1.5, 'm'], [Math.sqrt((10 * G * 1.5) / 7), 'm/s'], [Math.sqrt(2 * G * 1.5), 'm/s'], [measured(4.46), 'm/s']],
  rollslide: [],
  friction: [[6, 'm/s'], [36 / (2 * 0.4 * G), 'm']],
  seesaw: [[3, 'kg'], [1, 'm'], [1, 'kg'], [1.5, 'm'], [3, 'm']],
  atwood: [[1, 'kg'], [2, 'kg'], [G / 3, 'm/s²'], [0.5 * (G / 3) * 0.25, 'm'], [0.5, 's']],
  lift: [[4, 'kg'], [3, 'kg'], [G / 7, 'm/s²'], [3 * (G + G / 7), 'N']],
  balance: [[2, 'kg'], [2 * G, 'N'], [1, 'm']],
  crane: [[3, 'kg'], [2.5, 'm'], [3 * G, 'N']],
  bounce: [[3, 'm'], [0.64 * 3, 'm'], [0.64 ** 2 * 3, 'm'], [0.64 ** 3 * 3, 'm']],
  // The sentence quotes the centre, the number the Position row shows. The climb has no formula:
  // it is what the two corners leave of the 1.306 m the centre starts at.
  galileo: [[1.306, 'm'], [measured(1.14), 'm'], [1.306 - measured(1.14), 'm']],
  stack: [[2, 'kg'], [9, 'm/s'], [18, 'kg m/s'], [0.5 * 2 * 81, 'J']],
  collision: [[1, 'kg'], [5, 'm/s'], [3, 'kg'], [5, 'kg m/s'], [Math.abs(((1 - 0.9 * 3) / 4) * 5), 'm/s'], [((1 * 1.9) / 4) * 5, 'm/s']],
  sticky: [[1, 'kg'], [4, 'm/s'], [3, 'kg'], [4 / 4, 'm/s']],
  recoil: [[10, 'kg'], [0.5, 'kg'], [10 * 2.5, 'kg m/s']],
  crash: [[5, 'kg'], [8, 'm/s'], [40, 'kg m/s']],
  cradle: [],
  trolleys: [[2, 'kg'], [1, 'kg'], [6, 'm/s'], [6, 'kg m/s'], [5, 'kg'], [6 / 5, 'm/s']],
  // The Energy section's p adds up the two crates and never sees the rope links: the rope keeps
  // its own share of the 12, at the pair's 2 m/s.
  tug: [[4, 'kg'], [3, 'm/s'], [2, 'kg'], [12, 'kg m/s'], [6, 'kg'], [12 / 6, 'm/s'], [tugRope, 'kg'], [tugRope * 2, 'kg m/s'], [12 - tugRope * 2, 'kg m/s']],
  pendulum: [[2, 'm'], [TAU * Math.sqrt(2 / G), 's'], [pendulumPeriod(2, (53 * Math.PI) / 180), 's']],
  ropeswing: [[2, 'kg']],
  swingbridge: [[2.5, 'm'], [2, 'm'], [TAU * Math.sqrt(2 / G), 's'], [TAU * Math.sqrt(2.5 / G), 's']],
  spring: [[TAU * Math.sqrt(2 / 200), 's'], [2, 'kg'], [200, 'N/m']],
  springice: [[2, 'kg'], [50, 'N/m'], [0.6, 'm'], [TAU * Math.sqrt(2 / 50), 's']]
}

/** Every number with a unit in a sentence, with the digits it was written to. */
function claims(about: string): { text: string; unit: string }[] {
  const out: { text: string; unit: string }[] = []
  const re = /(\d+(?:\.\d+)?)\s?(kg m\/s|m\/s²|m\/s|N\/m|kg|m|s|N|J|%)(?![A-Za-z/²])/g
  for (const m of about.matchAll(re)) out.push({ text: m[1], unit: m[2] })
  return out
}

const decimals = (text: string) => (text.includes('.') ? text.split('.')[1].length : 0)
const roundTo = (v: number, d: number) => Number(v.toFixed(d))

describe('what the presets promise', () => {
  it('every number in every sentence comes from its formula', () => {
    for (const p of PRESETS) {
      const table = EXPECTED[p.id]
      expect(table, `${p.id} has no expectation table`).toBeDefined()
      const found = claims(p.about)
      for (const c of found) {
        const ok = table.some(([value, unit]) => unit === c.unit && roundTo(value, decimals(c.text)) === Number(c.text))
        expect(ok, `${p.id}: "${c.text} ${c.unit}" is not what the formula gives (${table.filter(([, u]) => u === c.unit).map(([v]) => v.toFixed(3)).join(', ')})`).toBe(true)
      }
    }
  })

  it('reads the claims the way they are written', () => {
    expect(claims('lands after √(2h/g) = 1.01 s at √(2gh) = 9.9 m/s, μ = 0.4 stops after 4.6 m; 200 N/m and 33.6 N; 18 kg m/s and 90 % of 20 m/s²')).toEqual([
      { text: '1.01', unit: 's' },
      { text: '9.9', unit: 'm/s' },
      { text: '4.6', unit: 'm' },
      { text: '200', unit: 'N/m' },
      { text: '33.6', unit: 'N' },
      { text: '18', unit: 'kg m/s' },
      { text: '90', unit: '%' },
      { text: '20', unit: 'm/s²' }
    ])
    // A sentence with no units makes no claims, and "2π" is not 2 of anything.
    expect(claims('T = 2π√(L/g), 15° from the vertical')).toEqual([])
  })

  it('no sentence shows a student code: no braces, backslashes or underscore subscripts', () => {
    // "C_d" in a sentence is read as C, an underscore and a d; the link cards are held to the
    // same rule in sandbox.test.ts.
    for (const p of PRESETS) expect(p.about, p.id).not.toMatch(/[{}_\\]/)
  })

  it('every sentence has a number to check, except the two that are only about what to watch', () => {
    for (const p of PRESETS) expect(claims(p.about).length > 0 || ['rollslide', 'cradle'].includes(p.id), p.id).toBe(true)
  })

  it('every preset with a link builds it, and the link names bodies in the scene', () => {
    for (const p of PRESETS) {
      const { bodies, links } = p.build()
      const ids = new Set(bodies.map((b) => b.id))
      for (const l of links ?? []) {
        expect(LINK_KINDS).toContain(l.kind)
        expect(ids.has(l.a) && ids.has(l.b), `${p.id}: ${l.kind} names a missing body`).toBe(true)
        if (l.kind === 'pulley') expect(ids.has(l.over!), `${p.id}: pulley without its wheel`).toBe(true)
        expect(l.length).toBeGreaterThan(0)
      }
    }
  })

  it('the grouped list covers every topic and every preset exactly once, in topic order', () => {
    const groups = groupedPresets()
    expect(groups.map((g) => g.topic)).toEqual(PRESET_TOPICS)
    const seen = groups.flatMap((g) => g.presets.map((p) => p.id))
    expect(seen.sort()).toEqual(PRESETS.map((p) => p.id).sort())
    expect(new Set(seen).size).toBe(PRESETS.length)
    for (const g of groups) {
      expect(g.presets.length).toBeGreaterThan(0)
      for (const p of g.presets) expect(p.topic).toBe(g.topic)
    }
  })

  it('badges say what an experiment joins things with, so ropes can be found', () => {
    expect(presetBadges(presetById('crane')!)).toEqual(['rope'])
    expect(presetBadges(presetById('atwood')!)).toEqual(['pulley'])
    expect(presetBadges(presetById('spring')!)).toEqual(['spring'])
    expect(presetBadges(presetById('fall')!)).toEqual([])
    // Five links of one kind is one badge.
    expect(presetBadges(presetById('cradle')!)).toEqual(['string'])
    const withRope = PRESETS.filter((p) => presetBadges(p).includes('rope')).map((p) => p.id)
    expect(withRope).toEqual(expect.arrayContaining(['ropeswing', 'crane', 'tug']))
  })

  it('the four new experiments are there, in the topics the plan put them in', () => {
    expect(presetById('crane')?.topic).toBe('Forces')
    expect(presetById('balance')?.topic).toBe('Forces')
    expect(presetById('tug')?.topic).toBe('Momentum')
    expect(presetById('swingbridge')?.topic).toBe('Oscillation')
    expect(PRESETS).toHaveLength(29)
  })
})

describe('af-sm2 — preset heights, rest points and lane friction match their sentences', () => {
  describe('H10: projectile greatest height center vs trail', () => {
    it('quotes 2.8 m greatest height matching ball center trail (y = 0.3 + 2.5)', () => {
      const p = presetById('projectile')!
      expect(p.about).toContain('greatest height 2.8 m')
      expect(p.about).not.toContain('greatest height 2.5 m')
      const { bodies } = p.build()
      const ball = bodies.find((b) => b.name === 'P')!
      expect(ball.position[1]).toBe(0.3)
      const vy = ball.velocity[1]
      const rise = (vy * vy) / (2 * 9.81)
      const peakCenterY = ball.position[1] + rise
      expect(peakCenterY).toBeCloseTo(2.8, 1)
    })
  })

  describe('H11: rolling against sliding lane friction and initial contact', () => {
    it('places ball and block on the slope without airborne drop', () => {
      const p = presetById('rollslide')!
      const { bodies } = p.build()
      const ball = bodies.find((b) => b.name === 'Ball')!
      const block = bodies.find((b) => b.name === 'Block')!

      // Slope surface at x = -5.2 is y = 2.7.
      // Ball radius 0.25 / cos(20.556°) ≈ 0.267 -> y = 2.967
      expect(ball.position[1]).toBeCloseTo(2.967, 3)

      // Block half-height 0.2 / cos(20.556°) ≈ 0.214 -> y = 2.914, rotated to lie flat on slope
      expect(block.position[1]).toBeCloseTo(2.914, 3)
      expect(block.rotation[2]).toBeCloseTo(-20.556, 3)
    })

    it('provides a dedicated frictionless lane for the sliding block', () => {
      const p = presetById('rollslide')!
      const { bodies } = p.build()
      const block = bodies.find((b) => b.name === 'Block')!
      const iceLane = bodies.find((b) => b.name === 'Ice lane')!
      expect(iceLane).toBeDefined()
      expect(iceLane.friction).toBe(0)
      expect(block.friction).toBe(0)
    })
  })

  describe('H12: recoil gun rests on the ice floor', () => {
    it('places gun and bullet center at y = 0.3 resting on the floor', () => {
      const p = presetById('recoil')!
      const { bodies } = p.build()
      const gun = bodies.find((b) => b.name === 'Gun')!
      const bullet = bodies.find((b) => b.name === 'Bullet')!
      // Gun height is 0.6 m, center at y = 0.3 rests directly on floor at y = 0
      expect(gun.position[1]).toBe(0.3)
      expect(gun.position[1] - gun.size[1] / 2).toBeCloseTo(0, 6)
      expect(bullet.position[1]).toBe(0.3)
    })
  })

  describe('H13: trolleys ball rests on the ice floor', () => {
    it('places incoming ball center at y = 0.2 resting on the floor', () => {
      const p = presetById('trolleys')!
      const { bodies } = p.build()
      const ball = bodies.find((b) => b.name === 'Ball')!
      // Default ball radius is 0.2 m, center at y = 0.2 rests directly on floor at y = 0
      expect(ball.position[1]).toBe(0.2)
      expect(ball.position[1] - ball.size[0]).toBeCloseTo(0, 6)
    })
  })

  describe('A18: the energy ramp ball rests on its slope (part head check)', () => {
    it('starts touching the slope, so the 1.5 m drop is the one the sentence quotes', () => {
      const { bodies } = presetById('ramp')!.build()
      const ball = bodies.find((b) => b.name === 'A')!
      // The slope runs 1.5 m down over 5 m: the surface at x = −4.4 is 1.5 × (1 − 0.1 / 5) = 1.47,
      // and the centre sits r / cos θ = 0.25 / cos(atan 0.3) above it. It started 2 cm in the air.
      const surface = 1.5 * (1 - 0.1 / 5)
      expect(ball.position[1]).toBeCloseTo(surface + 0.25 / Math.cos(Math.atan(0.3)), 3)
    })
  })
})

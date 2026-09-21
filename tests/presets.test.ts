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
  projectile: [[14, 'm/s'], [(14 * 14 * Math.sin(Math.PI / 3)) / G, 'm'], [(14 * Math.sin(Math.PI / 6)) ** 2 / (2 * G), 'm']],
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
  // The climb has no formula: it is what the two corners leave of the 1.106 m the underside starts at.
  galileo: [[measured(0.94), 'm'], [1.306 - 0.2, 'm']],
  stack: [[2, 'kg'], [9, 'm/s'], [18, 'kg m/s'], [0.5 * 2 * 81, 'J']],
  collision: [[1, 'kg'], [5, 'm/s'], [3, 'kg'], [5, 'kg m/s'], [Math.abs(((1 - 0.9 * 3) / 4) * 5), 'm/s'], [((1 * 1.9) / 4) * 5, 'm/s']],
  sticky: [[1, 'kg'], [4, 'm/s'], [3, 'kg'], [4 / 4, 'm/s']],
  recoil: [[10, 'kg'], [0.5, 'kg'], [10 * 2.5, 'kg m/s']],
  crash: [[5, 'kg'], [8, 'm/s'], [40, 'kg m/s']],
  cradle: [],
  trolleys: [[2, 'kg'], [1, 'kg'], [6, 'm/s'], [6, 'kg m/s'], [5, 'kg'], [6 / 5, 'm/s']],
  // The panel sums the crates: the rope keeps its own share of the 12, at the pair's 2 m/s.
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

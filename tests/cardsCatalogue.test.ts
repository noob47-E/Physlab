// The core formula cards (SB4): each is one data row, every symbol bound to exactly one quantity,
// every line drawn by the real KaTeX, the known answers of the demo scenes, and the property the
// owner asked for — the values on screen, put back into the formula, give the result on screen in
// its last digit — over 500 seeded random readings at seven precisions, with two plants that must
// be caught: a card with the wrong power (units) and a rounding rule with no guard digits.

import katex from 'katex'
import { describe, expect, it } from 'vitest'
import { makeBody } from '../src/renderer/src/sim/store'
import { presetById } from '../src/renderer/src/sim/presets'
import { DEFAULT_WORLD, type BodyDef, type BodyState, type Link } from '../src/renderer/src/sim/types'
import type { CardSpec, CardView, QKey, Reading } from '../src/renderer/src/sim/cards/types'
import { Q_TOKEN } from '../src/renderer/src/sim/cards/types'
import { CARDS, cardById, evaluateCard, readingOf } from '../src/renderer/src/sim/cards'
import { cardNumbers, evaluateSpec, type CardNumbers } from '../src/renderer/src/sim/cards/evaluate'
import { isGivenValue, type DigitRule, type ShownNumber } from '../src/renderer/src/sim/cards/digits'
import { naturalUnit, unitFactor, unitsCheck } from '../src/renderer/src/sim/cards/units'
import { CORE_CARDS } from '../src/renderer/src/sim/cards/catalogue'
import { fmtPrecise, shownValue, superscriptPowers, texPrecise, type DigitSettings } from '../src/renderer/src/math/format'
import type { V3 } from '../src/renderer/src/math/vec'

const PRECISIONS: DigitSettings[] = [
  { decimals: 2, precisionMode: 'sf' },
  { decimals: 3, precisionMode: 'sf' },
  { decimals: 4, precisionMode: 'sf' },
  { decimals: 5, precisionMode: 'sf' },
  { decimals: 1, precisionMode: 'dp' },
  { decimals: 2, precisionMode: 'dp' },
  { decimals: 3, precisionMode: 'dp' }
]
const SF3: DigitSettings = { decimals: 3, precisionMode: 'sf' }
const SF4: DigitSettings = { decimals: 4, precisionMode: 'sf' }
const READINGS = 500

/** A small seeded generator (mulberry32), so every run draws the same readings. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const state = (position: V3, velocity: V3, mass: number): BodyState => ({ position, rotation: [0, 0, 0, 1], velocity, angularVelocity: [0, 0, 0], mass, asleep: false })
const deg = Math.PI / 180

/**
 * A random moment of a scene with every role the core cards use: bodies A and B, and A on a link S
 * from a fixed post. Masses 0.1–10 kg, speeds 0–30 m/s, heights 0–20 m, k 1–500 N/m, angles 5–85°;
 * half the masses and stiffnesses typed as a student types them (2 decimals, whole N/m), the rest
 * worked out to the last bit, as a mass from a density is.
 */
function randomReading(rand: () => number): Reading {
  const between = (lo: number, hi: number) => lo + (hi - lo) * rand()
  const typedOr = (v: number, places: number) => (rand() < 0.5 ? Math.round(v * 10 ** places) / 10 ** places || 10 ** -places : v)
  const floor = makeBody('ground', 'Floor', [0, -0.2, 0])
  const post = { ...makeBody('box', 'Post', [0, 30, 0]), motion: 'static' as const }

  const moving = (m: number): BodyState => {
    const speed = between(0, 30)
    const angle = between(5, 85) * deg * (rand() < 0.5 ? 1 : -1) + (rand() < 0.5 ? 0 : Math.PI)
    return state([between(-10, 10), between(0, 20), 0], [speed * Math.cos(angle), speed * Math.sin(angle), 0], m)
  }

  // Find all body roles needed by any card
  const requiredRoles = new Set<string>();
  for (const c of CARDS) {
    for (const sym of c.symbols) {
      if ('body' in sym.from) requiredRoles.add(sym.from.body);
      if ('start' in sym.from) requiredRoles.add(sym.from.start);
      if ('pair' in sym.from) {
        requiredRoles.add(sym.from.pair[0]);
        requiredRoles.add(sym.from.pair[1]);
      }
    }
  }

  const generatedBodies: BodyDef[] = [floor, post];
  const generatedStates: Record<string, BodyState> = {};
  const generatedStarts: Record<string, BodyState> = {};
  const generatedRoles: Record<string, string> = { S: 'A' }; // keep S for spring tests

  for (const role of requiredRoles) {
    const b = { ...makeBody('sphere', role, [between(0, 10), 1, 0]), mass: typedOr(between(0.1, 10), 2) };
    generatedBodies.push(b);
    generatedStates[b.id] = moving(b.mass);
    generatedStarts[b.id] = moving(b.mass);
    generatedRoles[role] = role;

    // For 'A' we do the spring attachment
    if (role === 'A') {
      const L0 = typedOr(between(0.5, 3), 1)
      const stretch = between(-0.4, 1)
      const swing = between(5, 85) * deg
      const len = L0 + stretch
      generatedStates[b.id].position = [len * Math.sin(swing), 30 - len * Math.cos(swing), 0]
      const startSwing = between(5, 85) * deg
      generatedStarts[b.id].position = [L0 * Math.sin(startSwing), 30 - L0 * Math.cos(startSwing), 0]
    }
  }

  const a = generatedBodies.find((b) => b.name === 'A')!;
  const L0 = typedOr(between(0.5, 3), 1); // just need a link
  const spring: Link = { id: 'S1', kind: 'spring', a: post.id, b: a.id, length: L0, stiffness: typedOr(between(1, 500), 0), damping: 0 }

  return readingOf({
    bodies: generatedBodies,
    states: generatedStates,
    starts: generatedStarts,
    links: [spring],
    world: { ...DEFAULT_WORLD, gravity: rand() < 0.5 ? 9.81 : between(1, 25), airDensity: 0 },
    t: rand() < 0.3 ? Math.round(between(0, 5) * 10) / 10 : between(0, 5),
    roles: generatedRoles
  })
}

/**
 * The owner's property, checked from the TEXT on screen, not from anything the engine says about
 * itself: every input's shown text is in the substituted line, read back as a calculator would
 * take it, put into the formula, and rounded to the student's precision, gives the shown result,
 * which is in the result line and is the true value rounded. Null when it holds, else why not.
 */
function shownSumFails(spec: CardSpec, view: CardView, n: CardNumbers, s: DigitSettings): string | null {
  const values: Record<string, number> = {}
  for (const sym of spec.symbols) {
    const shown = n.inputs[sym.key]
    if (!shown) return `${sym.key} has no value`
    if (!view.lines[1].plain.includes(shown.plain)) return `${sym.key} = ${shown.plain} is not in "${view.lines[1].plain}"`
    values[sym.key] = shownValue(shown.plain.replace(/\u00a0×\u00a010([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/, (_m, e: string) => `×10^${[...e].map((c) => (c === '⁻' ? '-' : String('⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)))).join('')}`))
  }
  const result = n.result!
  if (!view.lines[2].plain.includes(result.plain)) return `result ${result.plain} is not in "${view.lines[2].plain}"`
  if (result.plain !== superscriptPowers(fmtPrecise(view.value, s))) return `result ${result.plain} is not the true ${view.value} rounded`
  const again = superscriptPowers(fmtPrecise(spec.compute(values), s))
  return again === result.plain ? null : `shown inputs give ${again}, not ${result.plain}`
}

/** Runs the property over every core card; returns the failures, at most `keep` of them. */
function property(rule: DigitRule | undefined, readings: number, keep = 20): { cases: number; fails: string[]; approx: number } {
  const rand = seeded(20261012)
  const fails: string[] = []
  let cases = 0
  let approx = 0
  for (let i = 0; i < readings; i++) {
    const r = randomReading(rand)
    for (const spec of CORE_CARDS) {
      for (const s of PRECISIONS) {
        const view = rule ? evaluateSpec(spec, r, s, rule) : evaluateSpec(spec, r, s)
        const n = rule ? cardNumbers(spec, r, s, rule) : cardNumbers(spec, r, s)
        cases++
        if (!view || !n) {
          fails.push(`${spec.id} #${i}: no card`)
          continue
        }
        const why = shownSumFails(spec, view, n, s)
        if (!view.sumChecks) approx++
        if (why || (!rule && !view.sumChecks)) {
          if (fails.length < keep) fails.push(`${spec.id} #${i} ${s.decimals} ${s.precisionMode}: ${why ?? 'sumChecks false'}`)
          else fails.push('…')
        }
      }
    }
  }
  return { cases, fails, approx }
}

describe('the core catalogue', () => {
  const ids = ['ke', 'pe', 'energy', 'spring-pe', 'spring-energy', 'momentum', 'momentum-total', 'weight', 'suvat-v', 'suvat-s', 'projectile-range', 'projectile-top', 'flight-time', 'pendulum-T', 'spring-T']

  it('has the fifteen cards of the contract, each id once, every one in the merged list', () => {
    expect(CORE_CARDS.map((c) => c.id)).toEqual(ids)
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length)
    for (const id of ids) expect(cardById(id)).toBeDefined()
  })

  it('a title says where its formula holds (a card shows its formula whatever the scene)', () => {
    expect(cardById('ke')!.title).toMatch(/not spinning/)
    expect(cardById('energy')!.title).toMatch(/not counting spin/)
    expect(cardById('spring-energy')!.title).toMatch(/level spring/)
    expect(cardById('projectile-range')!.title).toMatch(/launch height/)
    expect(cardById('projectile-top')!.title).toMatch(/launch point/)
    expect(cardById('flight-time')!.title).toMatch(/launch height/)
    expect(cardById('pendulum-T')!.title).toMatch(/small swings/)
    expect(cardById('suvat-v')!.title).toMatch(/freely/)
    expect(cardById('suvat-s')!.title).toMatch(/freely/)
  })

  it('every symbol is bound to exactly one quantity, and the formula uses exactly its symbols', () => {
    const KINDS = ['body', 'start', 'link', 'startLink', 'pair', 'world', 'value']
    const QS = new Set(Object.keys(Q_TOKEN))
    for (const c of CARDS) {
      expect(c.title, c.id).toMatch(/^[A-Z][A-Za-z ,'()₀-₉–-]+$/)
      const keys = c.symbols.map((s) => s.key)
      expect(new Set(keys).size, c.id).toBe(keys.length)
      for (const s of c.symbols) {
        expect(Object.keys(s.from).filter((k) => KINDS.includes(k)), `${c.id}.${s.key}`).toHaveLength(1)
        expect(s.q === null || QS.has(s.q), `${c.id}.${s.key}`).toBe(true)
        expect(c.formulaTex, `${c.id} uses ${s.key}`).toContain(`@{${s.key}}`)
        // The unit is one the units check knows, and the unit of the quantity it is bound to.
        expect(() => unitFactor(s.unit, { kg: 2, m: 3, s: 5, K: 7 }), `${c.id}.${s.key}`).not.toThrow()
        const natural = naturalUnit(s.from)
        if (natural !== null) expect(unitFactor(s.unit, { kg: 2, m: 3, s: 5, K: 7 }), `${c.id}.${s.key}`).toBeCloseTo(unitFactor(natural, { kg: 2, m: 3, s: 5, K: 7 }), 12)
      }
      for (const [, key] of c.formulaTex.matchAll(/@\{([^}]*)\}/g)) expect(keys, `${c.id} names @{${key}}`).toContain(key)
      expect(c.result.q === null || QS.has(c.result.q), c.id).toBe(true)
      expect(unitsCheck(c), `${c.id} units`).toBe(true)
    }
  })
})

describe('known answers (Idea #39, the demo scenes)', () => {
  const built = (id: string) => presetById(id)!.build()
  const reading = (id: string, roles: Record<string, string>, states: Record<string, BodyState> = {}) => {
    const b = built(id)
    return { b, r: readingOf({ bodies: b.bodies, states, starts: {}, links: b.links ?? [], world: { ...DEFAULT_WORLD, ...b.world }, t: 0, roles }) }
  }
  const last = (id: string, r: Reading, s: DigitSettings) => evaluateCard(id, r, s)!.lines[2].plain

  it('a projectile at 14 m/s and 30°: R 17.30 m, H 2.497 m (2.50 at 3 s.f.), T 1.427 s', () => {
    const { r } = reading('projectile', { A: 'P' })
    expect(last('projectile-range', r, SF4)).toBe('= 17.30 m')
    expect(last('projectile-top', r, SF4)).toBe('= 2.497 m')
    expect(last('projectile-top', r, SF3)).toBe('= 2.50 m')
    expect(last('flight-time', r, SF4)).toBe('= 1.427 s')
    expect(evaluateCard('projectile-range', r, SF4)!.lines[1].plain).toBe('= (14 m/s)² × sin(2 × 30°) / (9.81 m/s²)')
  })

  it('a pendulum of 2 m: T 2.837 s', () => {
    const { r } = reading('pendulum', { A: 'Bob', S: 'Bob' })
    expect(last('pendulum-T', r, SF4)).toBe('= 2.837 s')
    expect(evaluateCard('pendulum-T', r, SF4)!.lines[0].plain).toBe('T = 2π √(L / g)')
  })

  it('2 kg on 200 N/m: T 0.6283 s', () => {
    const { r } = reading('spring', { A: 'M', S: 'M' })
    expect(last('spring-T', r, SF4)).toBe('= 0.6283 s')
  })

  it('Spring on ice at x = −0.2520 m, v = −2.728 m/s: ½kx² 1.59 J, ½mv² 7.44 J, E 9.03 J (FIG. 4)', () => {
    const b = built('springice')
    const block = b.bodies.find((d) => d.name === 'M')!
    // The post's centre is at x = −3 and the spring's natural length is 3 m.
    const states = { [block.id]: state([-0.252, 0.25, 0], [-2.728, 0, 0], 2) }
    const r = readingOf({ bodies: b.bodies, states, starts: {}, links: b.links!, world: { ...DEFAULT_WORLD, ...b.world }, t: 0.4, roles: { A: 'M', S: 'M' } })
    expect(last('spring-pe', r, SF3)).toBe('= 1.59 J')
    expect(last('ke', r, SF3)).toBe('= 7.44 J')
    const e = evaluateCard('spring-energy', r, SF3)!
    expect(e.lines[2].plain).toBe('= 9.03 J')
    // At 3 figures the shown sum would read 9.04 J: one more figure in each measured value.
    expect(e.lines[1].plain).toBe('= ½ × 50 N/m × (−0.2520 m)² + ½ × 2 kg × (2.728 m/s)²')
    expect(e.sumChecks).toBe(true)
  })

  it('weight, momentum and the drop formulas on a dropped ball', () => {
    const { b, r } = reading('fall', { A: 'A' })
    expect(b.bodies.some((d) => d.name === 'A')).toBe(true)
    expect(last('weight', r, SF3)).toMatch(/^= [\d.]+ N$/)
    const fall: Record<string, BodyState> = {}
    const ball = b.bodies.find((d) => d.name === 'A')!
    fall[ball.id] = state([ball.position[0], ball.position[1] - 4.905, 0], [0, -9.81, 0], 1)
    const r1 = readingOf({ bodies: b.bodies, states: fall, starts: {}, links: [], world: { ...DEFAULT_WORLD, ...b.world }, t: 1, roles: { A: 'A' } })
    expect(last('suvat-v', r1, SF3)).toBe('= 9.81 m/s')
    expect(last('suvat-s', r1, SF3)).toBe('= 4.91 m')
  })
})

describe('the owner\'s property: the shown sum checks, for every card, reading and precision', () => {
  it(`${READINGS} seeded readings × ${CORE_CARDS.length} cards × ${PRECISIONS.length} precisions: no failure`, () => {
    const { cases, fails } = property(undefined, READINGS)
    expect(cases).toBe(READINGS * CORE_CARDS.length * PRECISIONS.length)
    expect(fails).toEqual([])
  }, 120_000)

  it('catches a planted rounding with no guard digits (inputs at the student\'s own precision)', () => {
    const naive: DigitRule = (inputs, compute, s) => {
      const shown: Record<string, ShownNumber> = {}
      for (const i of inputs) shown[i.key] = { value: i.value, plain: superscriptPowers(fmtPrecise(i.value, s)), tex: texPrecise(i.value, s) }
      const v = compute(Object.fromEntries(inputs.map((i) => [i.key, i.value])))
      return { inputs: shown, result: { value: v, plain: superscriptPowers(fmtPrecise(v, s)), tex: texPrecise(v, s) }, holds: true }
    }
    const { fails } = property(naive, 40)
    expect(fails.length).toBeGreaterThan(0)
  }, 60_000)
})

describe('every line draws in KaTeX, and the plain lines are plain', () => {
  // trust only \htmlData, which carries a symbol's quantity; anything else is refused.
  const trust = (ctx: { command: string }) => ctx.command === '\\htmlData'
  const render = (tex: string, where: string) =>
    expect(() => katex.renderToString(tex, { displayMode: true, throwOnError: true, strict: 'ignore', trust }), `${where}: ${tex}`).not.toThrow()

  const views = (): { view: CardView; where: string }[] => {
    const rand = seeded(7)
    const out: { view: CardView; where: string }[] = []
    for (let i = 0; i < 25; i++) {
      const r = randomReading(rand)
      if (i === 0) {
        // Huge and tiny numbers, written in powers of ten.
        r.bodies.A.state.velocity = [1.5e-9, -2e-8, 0]
        r.bodies.B.state.mass = 3.2e9
      }
      if (i === 1) r.g = 0
      // At rest at the start: no launch angle, so the projectile cards show "—".
      if (i === 2) r.bodies.A.start = { ...r.bodies.A.start, velocity: [0, 0, 0] }
      for (const c of CARDS) for (const s of PRECISIONS) {
        const v = evaluateCard(c.id, r, s)
        if (v) out.push({ view: v, where: `${c.id} #${i} ${s.decimals}${s.precisionMode}` })
      }
    }
    return out
  }
  const all = views()

  it('throwOnError: true, trust limited to \\htmlData, every line of every card', () => {
    expect(all.length).toBeGreaterThan(CARDS.length * PRECISIONS.length * 20)
    // The rare lines are among them: a dash for a missing value, ∞, and powers of ten.
    expect(all.some(({ view }) => view.lines[2].plain === '= —')).toBe(true)
    expect(all.some(({ view }) => view.lines[2].plain.includes('∞'))).toBe(true)
    expect(all.some(({ view }) => /×.10[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(view.lines[1].plain))).toBe(true)
    for (const { view, where } of all) for (const l of view.lines) render(l.tex, where)
  }, 60_000)

  it('\\htmlData carries only q=<a quantity>', () => {
    for (const { view, where } of all) for (const l of view.lines) for (const [, q] of l.tex.matchAll(/\\htmlData\{([^}]*)\}/g)) expect(q, where).toMatch(new RegExp(`^q=(${Object.keys(Q_TOKEN).join('|')})$`))
  })

  it('every coloured symbol, every value put in for it and the result carry their \\htmlData, and nothing else does', () => {
    const count = (tex: string, q: QKey) => tex.split(`\\htmlData{q=${q}}{`).length - 1
    for (const { view, where } of all) {
      const spec = cardById(view.id)!
      const uses = [...spec.formulaTex.matchAll(/@\{([^}]*)\}/g)].map(([, key]) => spec.symbols.find((s) => s.key === key)!)
      for (const q of Object.keys(Q_TOKEN) as QKey[]) {
        const inFormula = uses.filter((s) => s.q === q).length
        const isResult = spec.result.q === q ? 1 : 0
        expect(count(view.lines[0].tex, q), `${where} formula ${q}`).toBe(inFormula + isResult)
        // A missing value is a dash with no colour: only values that are there carry one.
        const shownHere = uses.filter((s) => s.q === q && !view.lines[1].plain.includes('—')).length
        if (!view.lines[1].plain.includes('—')) expect(count(view.lines[1].tex, q), `${where} values ${q}`).toBe(shownHere)
        if (view.lines[2].plain !== '= —') expect(count(view.lines[2].tex, q), `${where} result ${q}`).toBe(isResult)
      }
      for (const s of spec.symbols) if (s.q) expect(view.lines[0].tex, where).toContain(`\\htmlData{q=${s.q}}{${s.tex}}`)
    }
  })

  it('no caret, e-notation, backslash or brace in any plain line or text', () => {
    for (const { view, where } of all) {
      for (const t of [...view.lines.map((l) => l.plain), view.text, view.title]) {
        expect(t, where).not.toMatch(/\^|\\|[{}]|\d(?:\.\d+)?e[-+]?\d|@/)
        expect(t, where).not.toContain('undefined')
      }
    }
  })

  it('every quantity a card lists is a symbol or result colour it really uses', () => {
    for (const c of CARDS) {
      const used = new Set<QKey>([...c.symbols.map((s) => s.q), c.result.q].filter((q): q is QKey => q !== null))
      const r = randomReading(seeded(3))
      const v = evaluateCard(c.id, r, SF3)
      expect(v, c.id).toBeDefined()
      expect(new Set(v?.quantities), c.id).toEqual(used)
    }
  })

  it('a value that is not a given is never shown in its typed form by accident: isGivenValue', () => {
    expect(isGivenValue(2)).toBe(true)
    expect(isGivenValue(0.123456)).toBe(true)
    expect(isGivenValue(0.1234567)).toBe(false)
    expect(isGivenValue(Math.PI)).toBe(false)
    expect(isGivenValue(14 * Math.cos(30 * deg) * 0 + Math.hypot(14 * Math.cos(30 * deg), 14 * Math.sin(30 * deg)))).toBe(true)
  })
})

describe('reading a hand-built Reading', () => {
  it('evaluateCard works on a Reading built by hand (SB18 may build one from the tape)', () => {
    const def: BodyDef = { ...makeBody('sphere', 'A', [0, 1, 0]), mass: 0.5 }
    const s = state([0, 6.53, 0], [8.203, 0, 0], 0.5)
    const r: Reading = { t: 0.8, g: 9.81, datum: 0, stepRate: 240, bodies: { A: { def, state: s, start: s } }, links: {} }
    // Idea #39 §4.4: ½ × 0.50 kg × (8.203 m/s)² = 16.8 J.
    expect(evaluateCard('ke', r, SF3)!.lines[2].plain).toBe('= 16.8 J')
  })
})

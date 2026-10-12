// The live formula card engine (SB4, Idea #39 §4.4): a card is data, the Reading is built from the
// run by role, the numbers on a card are the true values at the student's precision with just enough
// extra digits in the inputs for the sum on screen to check, and the units are checked by scaling.
// Every test crosses a boundary: a scene into a Reading, a Reading into the lines a student reads.

import { describe, expect, it } from 'vitest'
import { makeBody, halfHeight, massOf } from '../src/renderer/src/sim/store'
import { groundTopOf, startStateOf, energyOf } from '../src/renderer/src/sim/energy'
import { dragCoefficient, frontalAreaTurned } from '../src/renderer/src/sim/materials'
import { presetById } from '../src/renderer/src/sim/presets'
import { DEFAULT_WORLD, rateOf, type BodyDef, type BodyState, type Link } from '../src/renderer/src/sim/types'
import type { CardSpec, LedgerReading, Reading } from '../src/renderer/src/sim/cards/types'
import { Q_TOKEN } from '../src/renderer/src/sim/cards/types'
import { CARDS, cardById, evaluateCard, mergeCards, readingOf } from '../src/renderer/src/sim/cards'
import { cardNumbers, evaluateSpec, plainOf } from '../src/renderer/src/sim/cards/evaluate'
import { honestDigits, GIVEN_FIGURES } from '../src/renderer/src/sim/cards/digits'
import { naturalUnit, unitFactor, unitsCheck, unitPlain, unitTex } from '../src/renderer/src/sim/cards/units'
import { isConstantSource, sourceValue, stepRateOf } from '../src/renderer/src/sim/cards/reading'
import { SCENE_CARDS } from '../src/renderer/src/sim/cards/sceneCards'
import { CORE_CARDS } from '../src/renderer/src/sim/cards/catalogue'
import type { V3 } from '../src/renderer/src/math/vec'

const SF3 = { decimals: 3, precisionMode: 'sf' as const }
const DP2 = { decimals: 2, precisionMode: 'dp' as const }

const state = (position: V3, velocity: V3, mass: number): BodyState => ({ position, rotation: [0, 0, 0, 1], velocity, angularVelocity: [0, 0, 0], mass, asleep: false })

/** A floor, and a 2 kg ball that has fallen 0.5 m from rest: the owner's example. */
function ownerExample(): { bodies: BodyDef[]; states: Record<string, BodyState> } {
  const floor = makeBody('ground', 'Floor', [0, -0.2, 0])
  const ball = { ...makeBody('sphere', 'Ball', [0, 3, 0]), mass: 2, massMode: 'mass' as const }
  const v = Math.sqrt(2 * 9.81 * 0.5)
  return { bodies: [floor, ball], states: { [ball.id]: state([0, 2.5, 0], [0, -v, 0], 2) } }
}

const readingFor = (bodies: BodyDef[], states: Record<string, BodyState>, roles: Record<string, string>, links: Link[] = [], t = 0): Reading =>
  readingOf({ bodies, states, starts: {}, links, world: { ...DEFAULT_WORLD, airDensity: 0 }, t, roles })

describe('the owner\'s example: a 2.0 kg ball that has fallen 0.5 m from rest, at 3 s.f.', () => {
  const { bodies, states } = ownerExample()
  const r = readingFor(bodies, states, { A: 'Ball' })
  const view = evaluateCard('ke', r, SF3)!

  it('shows v = 3.132 m/s and KE = 9.81 J, and the sum on screen checks', () => {
    expect(view.lines[1].plain).toBe('= ½ × 2 kg × (3.132 m/s)²')
    expect(view.lines[2].plain).toBe('= 9.81 J')
    expect(view.text).toBe('KE = 9.81 J')
    expect(view.sumChecks).toBe(true)
    expect(view.unitsCheck).toBe(true)
  })

  it('never shows (3.13 m/s)² beside 9.80 J', () => {
    const all = view.lines.map((l) => `${l.plain} ${l.tex}`).join(' ')
    expect(all).not.toContain('3.13 m/s)')
    expect(all).not.toContain('9.80')
    // ½ × 2 × 3.13² is 9.7969: the clash the extra digit removes.
    expect(Math.abs(0.5 * 2 * 3.13 ** 2 - 9.81)).toBeGreaterThan(0.005)
  })

  it('works out the result at full precision and shows it at the student\'s precision', () => {
    expect(view.value).toBeCloseTo(9.81, 12)
    expect(view.unit).toBe('J')
    expect(evaluateCard('ke', r, DP2)!.lines[2].plain).toBe('= 9.81 J')
  })

  it('wraps every symbol of the formula in \\htmlData with its quantity, and leaves a q-less symbol bare', () => {
    expect(view.lines[0].tex).toContain('\\htmlData{q=vel}{v}')
    expect(view.lines[0].tex).toContain('\\htmlData{q=vel}{\\mathrm{KE}}')
    // m is a plain number to the colour scheme (q null): never wrapped.
    expect(view.lines[0].tex).not.toMatch(/htmlData\{q=[a-z]+\}\{m\}/)
    expect(view.lines[0].plain).toBe('KE = ½ m v²')
    expect(view.quantities).toEqual(['vel'])
  })
})

describe('rounding honesty (digits.ts)', () => {
  it('adds a digit to an input only when the shown sum would not check without it', () => {
    // 4.00 m/s at 3 s.f.: ½ × 2 × 4.00² = 16.0 holds at once, so nothing is added.
    const d = honestDigits([{ key: 'm', value: 2, given: true }, { key: 'v', value: 4, given: false }], (v) => 0.5 * v.m * v.v ** 2, SF3)
    expect(d.inputs.v.plain).toBe('4.00')
    expect(d.result.plain).toBe('16.0')
    expect(d.holds).toBe(true)
  })

  it('keeps a typed given in its typed form: 2 kg and k = 50 N/m are never padded or rounded', () => {
    const d = honestDigits(
      [{ key: 'k', value: 50, given: true }, { key: 'x', value: 0.2520123, given: false }],
      (v) => 0.5 * v.k * v.x ** 2,
      SF3
    )
    expect(d.inputs.k.plain).toBe('50')
    // A given with more figures than the student asked for is still shown whole: it is exact.
    expect(honestDigits([{ key: 'g', value: 9.81, given: true }], (v) => v.g, { decimals: 1, precisionMode: 'dp' }).inputs.g.plain).toBe('9.81')
  })

  it('a number with more than GIVEN_FIGURES figures is not a typed given, whatever its source', () => {
    expect(GIVEN_FIGURES).toBe(6)
    const d = honestDigits([{ key: 'm', value: 110.98003481, given: true }], (v) => v.m, SF3)
    expect(d.inputs.m.plain).toBe('111')
  })

  it('writes a power of ten raised in plain text and as \\times 10^{…} in LaTeX, and reads it back', () => {
    const d = honestDigits([{ key: 'x', value: 1.234e-7, given: false }], (v) => v.x, SF3)
    expect(d.inputs.x.plain).toBe('1.23\u00a0×\u00a010⁻⁷')
    expect(d.inputs.x.tex).toBe('1.23\\times 10^{-7}')
    expect(d.result.plain).toBe('1.23\u00a0×\u00a010⁻⁷')
    expect(d.holds).toBe(true)
  })

  it('says so (holds false) when even STEP_GUARD_MAX more digits cannot make the shown sum check', () => {
    // compute ignores its input's rounding entirely only through a deliberately broken formula:
    // the shown x can never give back a result that depends on bits no shown digit holds.
    const d = honestDigits([{ key: 'x', value: 1 / 3, given: false }], (v) => (v.x === 1 / 3 ? 1 : 2), SF3)
    expect(d.holds).toBe(false)
  })
})

describe('units (units.ts): the check by scaling kg, m and s', () => {
  it('knows the units a card uses, as factors of kg, m, s', () => {
    const f = { kg: 2, m: 3, s: 5, K: 7 }
    expect(unitFactor('J', f)).toBeCloseTo(2 * 9 / 25, 12)
    expect(unitFactor('m/s²', f)).toBeCloseTo(3 / 25, 12)
    expect(unitFactor('kg m/s', f)).toBeCloseTo(6 / 5, 12)
    expect(unitFactor('N s', f)).toBeCloseTo(6 / 5, 12)
    expect(unitFactor('N/m', f)).toBeCloseTo(2 / 25, 12)
    expect(unitFactor('W', f)).toBeCloseTo(18 / 125, 12)
    expect(unitFactor('Hz', f)).toBeCloseTo(1 / 5, 12)
    expect(unitFactor('kg/m³', f)).toBeCloseTo(2 / 27, 12)
    expect(unitFactor('°', f)).toBe(1)
    expect(unitFactor('rad', f)).toBe(1)
    expect(unitFactor('', f)).toBe(1)
    expect(() => unitFactor('furlong', f)).toThrow()
  })

  it('writes a unit for KaTeX and for a sentence, never with a caret', () => {
    expect(unitTex('m/s²')).toBe('\\,\\text{m/s}^{2}')
    expect(unitTex('°')).toBe('^{\\circ}')
    expect(unitTex('')).toBe('')
    expect(unitPlain('m/s²')).toBe(' m/s²')
    expect(unitPlain('°')).toBe('°')
  })

  it('passes a right card and fails a planted ½mv (wrong power)', () => {
    expect(unitsCheck(cardById('ke')!)).toBe(true)
    const wrong: CardSpec = { ...cardById('ke')!, id: 'plant-half-mv', compute: (v) => 0.5 * v.m * v.v }
    expect(unitsCheck(wrong)).toBe(false)
  })

  it('fails a symbol whose unit is not the unit of the quantity it is bound to', () => {
    const ke = cardById('ke')!
    const lies: CardSpec = { ...ke, id: 'plant-unit', symbols: ke.symbols.map((s) => (s.key === 'v' ? { ...s, unit: 'm' } : s)) }
    expect(unitsCheck(lies)).toBe(false)
    expect(naturalUnit({ body: 'A', get: 'speed' })).toBe('m/s')
    expect(naturalUnit({ value: 2 })).toBeNull()
  })
})

describe('readingOf: roles by body name', () => {
  it('resolves each role to the body of that name and leaves a missing name out', () => {
    const { bodies, states } = ownerExample()
    const r = readingFor(bodies, states, { A: 'Ball', B: 'Nobody' })
    expect(Object.keys(r.bodies)).toEqual(['A'])
    expect(r.bodies.A.def.name).toBe('Ball')
    expect(r.bodies.A.state.position[1]).toBe(2.5)
    // No start state handed in: the definition's own, as the energy readout does before Play.
    expect(r.bodies.A.start.position[1]).toBe(3)
    expect(r.datum).toBe(groundTopOf(bodies))
    expect(r.g).toBe(9.81)
    // A card that needs the missing role is not shown at all.
    expect(evaluateCard('momentum-total', r, SF3)).toBeNull()
  })

  it('a link role names a body on the link, or both ends ("Pivot – Bob")', () => {
    const built = presetById('pendulum')!.build()
    const r1 = readingOf({ bodies: built.bodies, states: {}, starts: {}, links: built.links!, world: { ...DEFAULT_WORLD, ...built.world }, t: 0, roles: { A: 'Bob', S: 'Bob' } })
    const r2 = readingOf({ bodies: built.bodies, states: {}, starts: {}, links: built.links!, world: { ...DEFAULT_WORLD, ...built.world }, t: 0, roles: { S: 'Pivot – Bob' } })
    expect(r1.links.S.link.kind).toBe('string')
    expect(r2.links.S.link).toBe(r1.links.S.link)
    expect(r2.bodies.S).toBeUndefined()
    // The preset lets the bob go from 15°.
    expect(sourceValue({ link: 'S', get: 'angle' }, r1)).toBeCloseTo(15, 1)
    expect(sourceValue({ startLink: 'S', get: 'angle' }, r1)).toBeCloseTo(15, 1)
    expect(sourceValue({ link: 'S', get: 'L0' }, r1)).toBe(2)
    // A string has no k that means anything: a spring card on it is not shown.
    expect(sourceValue({ link: 'S', get: 'k' }, r1)).toBeUndefined()
    expect(evaluateCard('spring-pe', r1, SF3)).toBeNull()
    expect(evaluateCard('spring-T', r1, SF3)).toBeNull()
    expect(sourceValue({ link: 'S', get: 'length' }, r1)).toBeCloseTo(2, 2)
  })

  it('reads the step rate from the world settings', () => {
    // A world from before SB0 has only the old figure; since SB0 DEFAULT_WORLD carries a stepRate
    // (240), so such a world is written here without it.
    const old = (n: number) => ({ ...DEFAULT_WORLD, stepRate: undefined, collisionSteps: n }) as unknown as typeof DEFAULT_WORLD
    expect(stepRateOf(old(2))).toBe(120)
    expect(stepRateOf(old(1))).toBe(60)
    expect(stepRateOf(old(3))).toBe(240)
    expect(stepRateOf(old(8))).toBe(600)
    expect(stepRateOf({ ...DEFAULT_WORLD, stepRate: 240 } as typeof DEFAULT_WORLD)).toBe(240)
  })

  it('reads the rate the engine runs at: the cradle (stepRate 240 and collisionSteps 8) is 600 on a card too', () => {
    const cradle = { ...DEFAULT_WORLD, ...presetById('cradle')!.build().world }
    expect(rateOf(cradle)).toBe(600)
    expect(stepRateOf(cradle)).toBe(rateOf(cradle))
  })
})

describe('every Source kind works', () => {
  const floor = makeBody('ground', 'Floor', [0, -0.2, 0])
  const ball = { ...makeBody('sphere', 'Ball', [1, 2, 0]), size: [0.25, 0.25, 0.25] as V3, restitution: 0.8, friction: 0.5 }
  const crate = { ...makeBody('box', 'Crate', [3, 0.5, 0]), size: [0.4, 1, 0.4] as V3, restitution: 0.3, friction: 0.2, dragCd: 0.9 }
  const ramp = { ...makeBody('ramp', 'Slope', [-2, 1.5, 0]), size: [8, 3, 1.4] as V3 }
  const post = { ...makeBody('box', 'Post', [-3, 0.25, 0]), motion: 'static' as const }
  const block = { ...makeBody('box', 'Block', [0.6, 0.25, 0]), mass: 2 }
  const spring: Link = { id: 'L1', kind: 'spring', a: post.id, b: block.id, length: 3, stiffness: 50, damping: 0 }
  const bodies = [floor, ball, crate, ramp, post, block]
  const states = {
    [ball.id]: { ...state([1, 1.2, 0], [3, 4, 0], massOf(ball)), angularVelocity: [0, 0, 2] as V3 },
    [block.id]: state([0.348, 0.25, 0], [-2.728, 0, 0], 2)
  }
  const r: Reading = readingOf({ bodies, states, starts: {}, links: [spring], world: { ...DEFAULT_WORLD, airDensity: 1.2 }, t: 0.4, roles: { A: 'Ball', B: 'Crate', R: 'Slope', S: 'Block' } })
  r.bodies.A.acc = [0, -9.81, 0]
  const val = (s: Parameters<typeof sourceValue>[0]) => sourceValue(s, r)

  it('body values', () => {
    expect(val({ body: 'A', get: 'mass' })).toBe(massOf(ball))
    expect(val({ body: 'A', get: 'speed' })).toBeCloseTo(5, 12)
    expect(val({ body: 'A', get: 'vx' })).toBe(3)
    expect(val({ body: 'A', get: 'vy' })).toBe(4)
    expect(val({ body: 'A', get: 'x' })).toBe(1)
    expect(val({ body: 'A', get: 'height' })).toBeCloseTo(1.2 - groundTopOf(bodies), 12)
    expect(val({ body: 'A', get: 'bottom' })).toBeCloseTo(1.2 - halfHeight('sphere', ball.size) - groundTopOf(bodies), 12)
    // KE counts the spin, as the Energy panel does.
    const e = energyOf(ball, states[ball.id], 9.81, groundTopOf(bodies))
    expect(e.rotational).toBeGreaterThan(0)
    expect(val({ body: 'A', get: 'KE' })).toBeCloseTo(e.kinetic, 12)
    expect(val({ body: 'A', get: 'PE' })).toBeCloseTo(e.potential, 12)
    expect(val({ body: 'A', get: 'p' })).toBeCloseTo(massOf(ball) * 5, 12)
    expect(val({ body: 'A', get: 'a' })).toBeCloseTo(9.81, 12)
    expect(val({ body: 'A', get: 'ax' })).toBe(0)
    expect(val({ body: 'A', get: 'ay' })).toBe(-9.81)
    expect(val({ body: 'A', get: 'radius' })).toBe(0.25)
    expect(val({ body: 'A', get: 'cd' })).toBe(dragCoefficient('sphere'))
    expect(val({ body: 'A', get: 'area' })).toBeCloseTo(Math.PI * 0.25 ** 2, 12)
    expect(val({ body: 'A', get: 'vAngle' })).toBeCloseTo((Math.atan2(4, 3) * 180) / Math.PI, 12)
  })

  it('acceleration is null (not known) when the tape has not given it, never a made-up number', () => {
    expect(val({ body: 'B', get: 'a' })).toBeNull()
    expect(val({ body: 'B', get: 'ay' })).toBeNull()
  })

  it('a box has no radius; drag reads the typed Cd and the face turned to the motion', () => {
    expect(val({ body: 'B', get: 'radius' })).toBeNull()
    expect(val({ body: 'B', get: 'cd' })).toBe(0.9)
    // At rest the drag would start straight down: the face it meets is the top.
    expect(val({ body: 'B', get: 'area' })).toBeCloseTo(frontalAreaTurned('box', crate.size, [0, 0, 0, 1], [0, -1, 0]), 12)
  })

  it('a ramp\'s angle is atan(height / length), in degrees', () => {
    expect(val({ body: 'R', get: 'slopeAngle' })).toBeCloseTo(20.556, 3)
    expect(val({ body: 'A', get: 'slopeAngle' })).toBeNull()
  })

  it('start values come from the start, not the run', () => {
    expect(val({ start: 'A', get: 'height' })).toBeCloseTo(2 - groundTopOf(bodies), 12)
    expect(val({ start: 'A', get: 'speed' })).toBe(0)
    const s0 = startStateOf(ball, massOf(ball))
    expect(val({ start: 'A', get: 'x' })).toBe(s0.position[0])
  })

  it('link values: k, natural length, length now, stretch, angle', () => {
    expect(val({ link: 'S', get: 'k' })).toBe(50)
    expect(val({ link: 'S', get: 'L0' })).toBe(3)
    expect(val({ link: 'S', get: 'length' })).toBeCloseTo(3.348, 12)
    expect(val({ link: 'S', get: 'stretch' })).toBeCloseTo(0.348, 12)
    expect(val({ startLink: 'S', get: 'stretch' })).toBeCloseTo(0.6, 12)
    // A level spring lies at 90° from straight down.
    expect(val({ link: 'S', get: 'angle' })).toBeCloseTo(90, 9)
  })

  it('pair values combine the two roles as the engine does: max(e₁, e₂) and √(μ₁μ₂)', () => {
    expect(val({ pair: ['A', 'B'], get: 'eUsed' })).toBe(0.8)
    expect(val({ pair: ['A', 'B'], get: 'muUsed' })).toBeCloseTo(Math.sqrt(0.5 * 0.2), 12)
    expect(val({ pair: ['A', 'Nobody'], get: 'eUsed' })).toBeUndefined()
  })

  it('world values and plain numbers', () => {
    expect(val({ world: 'g' })).toBe(9.81)
    expect(val({ world: 't' })).toBe(0.4)
    expect(val({ world: 'rho' })).toBe(1.2)
    expect(val({ value: 0.4 })).toBe(0.4)
    expect(val({ body: 'Z', get: 'mass' })).toBeUndefined()
  })

  it('says which sources stay fixed through a run (only those can be typed givens)', () => {
    expect(isConstantSource({ body: 'A', get: 'mass' })).toBe(true)
    expect(isConstantSource({ body: 'A', get: 'speed' })).toBe(false)
    expect(isConstantSource({ start: 'A', get: 'speed' })).toBe(true)
    expect(isConstantSource({ link: 'S', get: 'k' })).toBe(true)
    expect(isConstantSource({ link: 'S', get: 'stretch' })).toBe(false)
    expect(isConstantSource({ world: 't' })).toBe(false)
    expect(isConstantSource({ world: 'g' })).toBe(true)
  })
})

describe('a value the reading does not have', () => {
  const a: CardSpec = {
    id: 'plant-f-ma',
    title: 'Force from the motion',
    formulaTex: '@{m}*@{a}',
    symbols: [
      { key: 'm', tex: 'm', unit: 'kg', q: null, from: { body: 'A', get: 'mass' } },
      { key: 'a', tex: 'a', unit: 'm/s²', q: 'acc', from: { body: 'A', get: 'a' } }
    ],
    result: { tex: 'F', unit: 'N', q: 'force' },
    compute: (v) => v.m * v.a
  }
  const { bodies, states } = ownerExample()

  it('shows "—" for the lines that need it, and a NaN value, never a made-up number', () => {
    const r = readingFor(bodies, states, { A: 'Ball' })
    const view = evaluateSpec(a, r, SF3)!
    expect(view.lines[1].plain).toBe('= 2 kg × —')
    expect(view.lines[2].plain).toBe('= —')
    expect(view.text).toBe('F = —')
    expect(Number.isNaN(view.value)).toBe(true)
    expect(view.sumChecks).toBe(false)
  })

  it('shows the number once the tape gives the acceleration', () => {
    const r = readingFor(bodies, states, { A: 'Ball' })
    r.bodies.A.acc = [0, -9.81, 0]
    const view = evaluateSpec(a, r, SF3)!
    expect(view.lines[2].plain).toBe('= 19.6 N')
    expect(view.sumChecks).toBe(true)
    expect(view.quantities).toEqual(['acc', 'force'])
  })

  it('cardNumbers hands back the numbers behind the lines', () => {
    const r = readingFor(bodies, states, { A: 'Ball' })
    r.bodies.A.acc = [0, -9.81, 0]
    const n = cardNumbers(a, r, SF3)!
    expect(n.inputs.a!.plain).toBe('9.81')
    expect(n.result!.plain).toBe('19.6')
  })
})

describe('the sign of a "down is positive" symbol', () => {
  it('suvat-v reads a launch upwards as a negative u, and the sum still checks', () => {
    const built = presetById('projectile')!.build()
    const r = readingOf({ bodies: built.bodies, states: {}, starts: {}, links: [], world: { ...DEFAULT_WORLD, ...built.world }, t: 0.5, roles: { A: 'P' } })
    const view = evaluateCard('suvat-v', r, SF3)!
    // 14 m/s at 30°: 7 m/s up is −7 m/s down; v = −7 + 9.81 × 0.5 = −2.095 m/s (still rising).
    expect(view.lines[1].plain).toBe('= −7 m/s + 9.81 m/s² × 0.500 s')
    expect(view.lines[2].plain).toBe('= −2.10 m/s')
    expect(view.sumChecks).toBe(true)
  })
})

describe('index.ts: one list of cards', () => {
  it('merges the core and scene cards and finds each by id', () => {
    expect(CARDS.length).toBe(CORE_CARDS.length + SCENE_CARDS.length)
    for (const c of CARDS) expect(cardById(c.id)).toBe(c)
    expect(cardById('no-such-card')).toBeUndefined()
    const { bodies, states } = ownerExample()
    expect(evaluateCard('no-such-card', readingFor(bodies, states, { A: 'Ball' }), SF3)).toBeNull()
  })

  it('refuses a duplicate id', () => {
    const ke = cardById('ke')!
    expect(() => mergeCards(CORE_CARDS, [{ ...ke }])).toThrow(/ke/)
  })

  it('a quantity\'s colour is its I-10 token', () => {
    expect(Q_TOKEN.vel).toBe('--q-vel')
    expect(Object.values(Q_TOKEN).every((t) => /^--q-[a-z]+$/.test(t))).toBe(true)
  })

  it('a Reading may carry the ledger\'s reading (I-9) untouched', () => {
    const ledger: LedgerReading = { kinetic: 1, height: 2, spring: 0, pushedIn: 0, hand: 0, drag: 0, rolling: 0, damper: 0, heat: 0, drift: null, sources: [], deltaT: {} }
    const { bodies, states } = ownerExample()
    const r = { ...readingFor(bodies, states, { A: 'Ball' }), ledger }
    expect(evaluateCard('ke', r, SF3)!.text).toBe('KE = 9.81 J')
  })
})

describe('a card line in ordinary characters (plainOf)', () => {
  it('writes the LaTeX a card uses as a sentence, bracketing only where a reader would misgroup', () => {
    expect(plainOf('\\tfrac{1}{2} m v^2')).toBe('½ m v²')
    expect(plainOf('\\frac{a + b}{c}')).toBe('(a + b) / c')
    expect(plainOf('\\frac{2 \\times 3}{9.81 m/s²}')).toBe('2 × 3 / (9.81 m/s²)')
    expect(plainOf('2\\pi \\sqrt{\\frac{L}{g}}')).toBe('2π √(L / g)')
    expect(plainOf('\\sin(2 \\theta) + \\cos \\theta')).toBe('sin(2 θ) + cos θ')
    expect(plainOf('v_0^2 - h_{0} + m_A')).toBe('v₀² − h₀ + mA')
    expect(plainOf('\\htmlData{q=vel}{v} = 30^{\\circ}')).toBe('v = 30°')
    expect(plainOf('\\mathrm{KE} \\approx \\Delta t')).toBe('KE ≈ Δ t')
  })
})

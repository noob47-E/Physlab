// SB10: the energy ledger (I-9), from the real engine and the real recorder in Node.
//
// Every joule of a run is somewhere: in motion, in height above the floor, in a spring, put in by a push or the hand,
// taken out by the air, rolling or a damper, or turned into heat where surfaces rub or hit. With nothing in the scene
// to lose energy to, what is left over is the step's own numerical drift, and the ledger says so.

import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { SimWorld } from '../src/renderer/src/sim/world'
import { presetById } from '../src/renderer/src/sim/presets'
import { DEFAULT_WORLD, type BodyDef, type Link, type WorldSettings } from '../src/renderer/src/sim/types'
import { REC_FLOATS } from '../src/renderer/src/sim/tape'
import { marksOf, startRecorder, tapes, type RunTape } from '../src/renderer/src/sim/recorder'
import { massOf } from '../src/renderer/src/sim/store'
import { ledgerAt, ledgerStart, statesAt, type LedgerReading, type LedgerScene } from '../src/renderer/src/sim/ledger'
import { ledgerText } from '../src/renderer/src/panels/sandbox/EnergyLedger'
import { formatMeasure } from '../src/renderer/src/math/format'
import { DEFAULT_SETTINGS } from '../src/renderer/src/core/store'
import { readSource } from './helpers/repo'

let n = 0
function body(over: Partial<BodyDef> = {}): BodyDef {
  return {
    id: `L${++n}`,
    name: `B${n}`,
    shape: 'sphere',
    size: [0.1, 0.1, 0.1],
    position: [0, 1, 0],
    rotation: [0, 0, 0],
    velocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    motion: 'dynamic',
    material: 'steel',
    massMode: 'mass',
    mass: 1,
    restitution: 0.3,
    friction: 0.5,
    linearDamping: 0,
    angularDamping: 0,
    color: '#fff',
    ...over
  }
}

interface Run {
  w: SimWorld
  scene: LedgerScene
  tape: () => RunTape
  at: (step?: number) => LedgerReading
  steps: (count: number) => void
}

async function run(bodies: BodyDef[], links: Link[] = [], world: Partial<WorldSettings> = {}): Promise<Run> {
  const settings = { ...DEFAULT_WORLD, ...world }
  const w = await SimWorld.create(settings)
  w.rebuild(bodies, links)
  stop = startRecorder(w)
  const scene: LedgerScene = { bodies, links, world: settings, massOf }
  const tape = () => tapes.live!
  return {
    w,
    scene,
    tape,
    at: (step) => ledgerAt(tape(), step ?? tape().last, scene),
    steps: (count) => {
      for (let i = 0; i < count; i++) w.stepOnce()
    }
  }
}

async function preset(id: string, over: Partial<WorldSettings> = {}): Promise<Run> {
  const built = presetById(id)!.build()
  return run(built.bodies, built.links ?? [], { ...(built.world ?? {}), ...over })
}

let stop: (() => void) | null = null
afterEach(() => {
  stop?.()
  stop = null
})

beforeAll(async () => {
  ;(await SimWorld.create()).destroy()
}, 30_000)

const total = (r: LedgerReading) => r.kinetic + r.height + r.spring
const place = (r: Run, name: string) => r.tape().layout.bodies.indexOf(r.scene.bodies.find((b) => b.name === name)!.id)
const speedAt = (r: Run, i: number, step: number) => {
  const rec = r.tape().record(step)!
  return Math.hypot(rec[i * REC_FLOATS + 7], rec[i * REC_FLOATS + 8], rec[i * REC_FLOATS + 9])
}

describe('Spring on ice (2 kg, 50 N/m, 0.6 m) at 240: nothing to lose energy to', () => {
  it('the total stays at 13.905 J within 1 % for 10 s while motion + height swings from 4.905 J to 13.9 J; the leftover is drift, under 1 %', async () => {
    const r = await preset('springice')
    expect(r.w.stepRate).toBe(240)
    // The tape begins with the first step (its record 0 is the start, read just before it).
    r.steps(1)
    const first = r.at(r.tape().first)
    expect(total(first)).toBeCloseTo(13.905, 2)
    let lo = Infinity
    let hi = -Infinity
    let worst = 0
    for (let s = 0; s < 10 * 240; s += 12) {
      r.steps(12)
      const L = r.at()
      worst = Math.max(worst, Math.abs(total(L) - 13.905) / 13.905)
      lo = Math.min(lo, L.kinetic + L.height)
      hi = Math.max(hi, L.kinetic + L.height)
      expect(L.heat).toBe(0)
      expect(L.drift).not.toBeNull()
      expect(Math.abs(L.drift!) / 13.905).toBeLessThan(0.01)
      expect(L.sources).toEqual([])
    }
    expect(worst).toBeLessThan(0.01)
    expect(lo).toBeLessThan(4.95)
    expect(hi).toBeGreaterThan(13.8)
  })
})

describe('Mass on a spring', () => {
  it('starts with ½ × 200 × 0.4² = 16 J in the spring (hook at 4 m, mass at 2.2 m, natural length 1.4 m)', async () => {
    const r = await preset('spring')
    r.steps(1)
    expect(r.at(r.tape().first).spring).toBeCloseTo(16, 4)
  })
})

describe('a 0.5 kg ball falling 3 s in air', () => {
  it('E₀ + W_drag − E(t) is the step’s free-fall deficit only (½g²Δt per kg per second), within 0.1 % of E₀; heat 0, air named', async () => {
    const ball = body({ name: 'Ball', position: [0, 60, 0], mass: 0.5, size: [0.1, 0.1, 0.1], angularDamping: 0 })
    const r = await run([ball], [], { airDensity: 1.225, wind: [0, 0, 0] })
    r.steps(3 * 240)
    const L = r.at()
    const e0 = total(r.at(r.tape().first))
    const g = DEFAULT_WORLD.gravity
    const deficit = 0.5 * g * g * (1 / 240) * 0.5 * 3
    expect(L.drag).toBeGreaterThan(0)
    expect(L.heat).toBe(0)
    // drift = E − E₀ − W_own = −(the step's deficit)
    expect(Math.abs(-L.drift! - deficit) / e0).toBeLessThan(0.001)
    expect(L.sources).toContain('air resistance')
  })
})

describe('Sliding to a stop (5 kg crate at 6 m/s, μ 0.4)', () => {
  it('90 J of heat ± 1 % when it stops, ΔT = 90 / (5 × 1700) = 0.0106 K, after 4.59 m ± 2 %', async () => {
    const r = await preset('friction')
    r.steps(1)
    const i = place(r, 'Crate')
    let stopped = -1
    for (let k = 0; k < 4 * 240 && stopped < 0; k++) {
      r.steps(1)
      if (speedAt(r, i, r.tape().last) < 1e-3) stopped = r.tape().last
    }
    expect(stopped).toBeGreaterThan(0)
    const L = r.at(stopped)
    expect(L.drift).toBeNull()
    expect(L.sources).toContain('friction where surfaces slide')
    expect(L.heat).toBeGreaterThan(90 * 0.99)
    expect(L.heat).toBeLessThan(90 * 1.01)
    const crate = r.scene.bodies.find((b) => b.name === 'Crate')!
    expect(L.deltaT[crate.id]).toBeCloseTo(L.heat / (5 * 1700), 6)
    expect(L.deltaT[crate.id]).toBeCloseTo(0.0106, 4)
    const x0 = r.tape().record(r.tape().first)![i * REC_FLOATS]
    const x1 = r.tape().record(stopped)![i * REC_FLOATS]
    expect(Math.abs(x1 - x0 - 4.59) / 4.59).toBeLessThan(0.02)
    // The floor is fixed: nothing of it is listed.
    expect(Object.keys(L.deltaT)).toEqual([crate.id])
  })
})

describe('Bouncing ball (e 0.8)', () => {
  it('each bounce turns 36 % ± 1 point of the kinetic energy into heat', async () => {
    const r = await preset('bounce')
    r.steps(4 * 240)
    const marks = marksOf(r.tape())
    expect(marks.length).toBeGreaterThanOrEqual(3)
    for (const m of marks.slice(0, 3)) {
      const before = r.at(m - 2)
      const after = r.at(m + 2)
      const share = (after.heat - before.heat) / before.kinetic
      expect(share).toBeGreaterThan(0.35)
      expect(share).toBeLessThan(0.37)
    }
    expect(r.at().sources).toContain('bounces that are not perfectly elastic')
  })
})

describe('a 2 N push on 1 kg for 1 s (no gravity, no air)', () => {
  it('pushed in 2.00 J ± 0.5 %, kinetic 2.00 J, heat 0, drift about 0', async () => {
    const box = body({ name: 'Box', shape: 'box', size: [0.2, 0.2, 0.2], position: [0, 0, 0], mass: 1 })
    const r = await run([box], [], { gravity: 0, airDensity: 0 })
    r.w.setActuators([{ bodyId: box.id, from: 0, until: 1, force: () => [2, 0, 0], label: 'push' }])
    r.steps(240 + 24)
    const L = r.at()
    expect(Math.abs(L.pushedIn - 2) / 2).toBeLessThan(0.005)
    expect(L.kinetic).toBeCloseTo(2, 3)
    expect(L.heat).toBe(0)
    expect(Math.abs(L.drift!)).toBeLessThan(0.01)
  })
})

describe('loss sources', () => {
  it('the default 0.05 spin damping is named on a body that spins, and not on one that does not', async () => {
    const spinner = body({ name: 'Spinner', position: [0, 0, 0], angularVelocity: [0, 0, 5], angularDamping: 0.05 })
    const still = body({ name: 'Still', position: [2, 0, 0], angularDamping: 0.05 })
    const r = await run([spinner, still], [], { gravity: 0, airDensity: 0 })
    r.steps(60)
    const L = r.at()
    expect(L.sources).toContain('the engine’s spin damping')
    expect(L.drift).toBeNull()
    expect(L.heat).toBeGreaterThan(0)
    // A body that only rests never brings the spin damping in.
    const r2 = await run([body({ name: 'Rest', position: [0, 0, 0], angularDamping: 0.05 })], [], { gravity: 0, airDensity: 0 })
    r2.steps(60)
    expect(r2.at().sources).toEqual([])
  })
  it('works from the start of the tape when stepped back (replay reads the same numbers it read live)', async () => {
    const r = await preset('friction')
    r.steps(120)
    const live = r.at()
    r.steps(240)
    expect(r.at(120 + r.tape().first)).toEqual(live)
  })
  it('ledgerStart gives the energy at the start back from any reading', async () => {
    const r = await preset('friction')
    r.steps(300)
    expect(ledgerStart(r.at())).toBeCloseTo(total(r.at(r.tape().first)), 6)
    const s = await preset('springice')
    s.steps(300)
    expect(ledgerStart(s.at())).toBeCloseTo(total(s.at(s.tape().first)), 6)
  })
})

describe('the Energy card (panels/sandbox/EnergyLedger.tsx)', () => {
  const reading = (over: Partial<LedgerReading>): LedgerReading => ({ kinetic: 0, height: 0, spring: 0, pushedIn: 0, hand: 0, drag: 0, rolling: 0, damper: 0, heat: 0, drift: null, sources: [], deltaT: {}, ...over })

  it('before a run: the start, nothing pushed in, nothing lost', () => {
    expect(ledgerText(null, 14.72, 240, DEFAULT_SETTINGS, null)).toEqual({
      start: 'at the start 14.72 J',
      pushed: 'pushed in 0 J',
      lost: 'lost to air 0 · rolling 0 · dampers 0 J',
      heat: 'heat 0 J · nothing lost yet'
    })
  })
  it('with heat: the heat and the body’s ΔT to two figures, "≈ 0.011 K"', () => {
    const t = ledgerText(reading({ heat: 90, deltaT: { c: 0.010588 } }), 0, 240, DEFAULT_SETTINGS, { name: 'Crate', deltaT: 0.010588 })
    expect(t.heat).toBe('heat 90 J · Crate ΔT ≈ 0.011 K')
    expect(t.start).toBe('at the start 90 J')
  })
  it('with nothing to lose energy to: the drift, as a share of the start, named as the step', () => {
    const t = ledgerText(reading({ kinetic: 48, drift: -0.16 }), 48, 240, DEFAULT_SETTINGS, null)
    expect(t.heat).toBe('drift −0.16 J (−0.33 %): the 1/240 s step, not physics')
  })
  it('reads the shown tape at the playhead, keeps every line on screen from the start (Fix 22), and uses the quantity colours', () => {
    const src = readSource('src/renderer/src/panels/sandbox/EnergyLedger.tsx')
    expect(src).toMatch(/shownTape\(\)/)
    expect(src).toMatch(/useTape\(/)
    expect(src).toMatch(/const step = tape \? \(mode === 'live' \? tape\.last : playhead\) : 0/)
    expect(src).toMatch(/ledgerAt\(tape, step, scene\)/)
    for (const line of ['text.start', 'text.pushed', 'text.lost', 'text.heat']) expect(src).toContain(`{${line}}`)
    expect(src).not.toMatch(/reading && </)
    for (const token of ['--q-vel', '--q-pos', '--q-spring', '--q-heat', '--q-work']) expect(src).toContain(`bg-[var(${token})]`)
    expect(src).toContain('Simplified: all the heat stays in the bodies that rubbed or hit.')
    expect(readSource('src/renderer/src/panels/Sandbox.tsx')).toMatch(/<EnergyLedger \/>/)
  })
})

describe('review fixes (gpt-5.4 medium r1)', () => {
  it('statesAt gives every body’s state at a step of the tape: the card’s rows read the same moment as its totals', async () => {
    const r = await preset('bounce')
    r.steps(300)
    const s = r.tape().first + 200
    const states = statesAt(r.tape(), s, r.scene)
    const ball = r.scene.bodies.find((b) => b.name === 'Ball')!
    const rec = r.tape().record(s)!
    const i = r.tape().layout.bodies.indexOf(ball.id)
    expect(states[ball.id].position).toEqual([rec[i * REC_FLOATS], rec[i * REC_FLOATS + 1], rec[i * REC_FLOATS + 2]])
    expect(states[ball.id].velocity[1]).toBe(rec[i * REC_FLOATS + 8])
    expect(states[ball.id].mass).toBe(massOf(ball))
    // Fixed bodies are not listed, as the panel's live values never list them.
    expect(Object.keys(states)).toEqual([ball.id])
    const src = readSource('src/renderer/src/panels/sandbox/EnergyLedger.tsx')
    expect(src).toMatch(/statesAt\(tape, step, scene\)/)
    expect(src).toMatch(/sceneEnergy\(bodies, links, states,/)
  })
  it('ΔT goes through the app’s number writer with the student’s settings (two figures), not fmtLabel', () => {
    const src = readSource('src/renderer/src/panels/sandbox/EnergyLedger.tsx')
    expect(src).not.toMatch(/fmtLabel/)
    const sci = DEFAULT_SETTINGS
    const t = ledgerText({ kinetic: 0, height: 0, spring: 0, pushedIn: 0, hand: 0, drag: 0, rolling: 0, damper: 0, heat: 90, drift: null, sources: [], deltaT: {} }, 0, 240, sci, { name: 'Crate', deltaT: 0.010588 })
    expect(t.heat).toContain(`ΔT ≈ ${formatMeasure(0.010588, 'number', { ...sci, precisionMode: 'sf', decimals: 2 })} K`)
  })
})

describe('review fixes (gpt-5.4 high adversarial r1)', () => {
  it('an edit part-way (a body placed by hand) is energy put in by hand, not drift: ½ × 50 × 0.2² = 1 J into an own spring', async () => {
    const hook = body({ name: 'Hook', shape: 'box', size: [0.1, 0.1, 0.1], position: [0, 0, 0], motion: 'static' })
    const mass = body({ name: 'Mass', position: [1, 0, 0], mass: 1 })
    const spring: Link = { id: `L${++n}`, kind: 'spring', a: hook.id, b: mass.id, length: 1, stiffness: 50, damping: 0 }
    const r = await run([hook, mass], [spring], { gravity: 0, airDensity: 0 })
    r.steps(24)
    r.w.placeBody(mass.id, [1.2, 0, 0])
    r.steps(1)
    const L = r.at()
    expect(L.sources).toEqual([])
    expect(L.hand).toBeGreaterThan(0.99)
    expect(L.hand).toBeLessThan(1.01)
    expect(Math.abs(L.drift!)).toBeLessThan(0.01)
    // At the start the mass sat at the spring's natural length: nothing.
    expect(ledgerStart(L)).toBeCloseTo(0, 6)
  })
  it('with a stiff spring the engine works, an edit never reads as negative heat (it read −2.7 J)', async () => {
    const hook = body({ name: 'Hook', shape: 'box', size: [0.1, 0.1, 0.1], position: [0, 0, 0], motion: 'static' })
    const mass = body({ name: 'Mass', position: [1, 0, 0], mass: 1 })
    const spring: Link = { id: `L${++n}`, kind: 'spring', a: hook.id, b: mass.id, length: 1, stiffness: 1e6, damping: 0 }
    const r = await run([hook, mass], [spring], { gravity: 0, airDensity: 0 })
    r.steps(24)
    expect(r.at().sources).toContain('a stiff spring the engine works itself')
    r.w.placeBody(mass.id, [1.01, 0, 0])
    r.steps(1)
    // The engine's soft spring spends most of the 50 J inside the step that follows the edit: what is left is by hand.
    expect(r.at().hand).toBeGreaterThan(0)
    for (let k = 0; k < 48; k++) {
      r.steps(1)
      expect(r.at().heat).toBeGreaterThan(-1e-3)
    }
  })
  it('air is not a source while nothing moves through it', async () => {
    const r = await run([body({ name: 'Rest', position: [0, 0, 0] })], [], { gravity: 0, airDensity: 1.225, wind: [0, 0, 0] })
    r.steps(60)
    expect(r.at().sources).toEqual([])
  })
  it('a body damped both ways names both: its damping and the engine’s spin damping', async () => {
    const b = body({ name: 'Both', position: [0, 0, 0], velocity: [1, 0, 0], angularVelocity: [0, 0, 10], linearDamping: 0.1, angularDamping: 0.05 })
    const r = await run([b], [], { gravity: 0, airDensity: 0 })
    r.steps(24)
    expect(r.at().sources).toEqual(['damping set on a body', 'the engine’s spin damping'])
  })
  it('a playhead between two steps reads the step the strip names (Math.floor(head + 1e-9))', async () => {
    const r = await preset('friction')
    r.steps(100)
    const k = r.tape().first + 50
    expect(r.at(k + 0.5)).toEqual(r.at(k))
    expect(r.at(k + 1 - 1e-12)).toEqual(r.at(k + 1))
  })
})

// SB15: theory and the honest gap (I-8). Every demo experiment predicts its formula's answer from its BUILT preset,
// measures the recorded run (the real engine and recorder in Node) and says why the two differ. At 600 steps a second
// unless a test says otherwise.

import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { SimWorld } from '../src/renderer/src/sim/world'
import { presetById } from '../src/renderer/src/sim/presets'
import { DEFAULT_WORLD, type StepRate } from '../src/renderer/src/sim/types'
import { startRecorder, tapes } from '../src/renderer/src/sim/recorder'
import { cardById } from '../src/renderer/src/sim/cards'
import { gapOf, theoryFor, type Built, type Measured, type Prediction, type Theory } from '../src/renderer/src/sim/theory'

const DEMO = ['fall', 'projectile', 'cliff', 'drop', 'moon', 'terminal', 'ramp', 'friction', 'atwood', 'lift', 'crane', 'bounce', 'collision', 'sticky', 'recoil', 'cradle', 'pendulum', 'spring', 'springice']
const SECONDS: Record<string, number> = { pendulum: 12, spring: 4, springice: 6, bounce: 4, terminal: 5, ramp: 3, friction: 3, moon: 3 }

beforeAll(async () => {
  ;(await SimWorld.create()).destroy()
}, 30_000)

let stop: (() => void) | null = null
afterEach(() => {
  stop?.()
  stop = null
})

interface Run {
  built: Built
  rate: number
  preds: Prediction[]
  meas: Measured[]
  pred: (key: string) => Prediction
  got: (key: string) => number
  gap: (key: string) => ReturnType<typeof gapOf>
}

async function run(id: string, rate: StepRate = 600, built: Built = presetById(id)!.build()): Promise<Run> {
  const world = { ...DEFAULT_WORLD, ...(built.world ?? {}), stepRate: rate }
  const w = await SimWorld.create(world)
  w.rebuild(built.bodies, built.links ?? [])
  stop = startRecorder(w)
  const n = (SECONDS[id] ?? 2.5) * w.stepRate
  for (let i = 0; i < n; i++) w.stepOnce()
  const th = theoryFor(id)!
  const preds = th.predict(built)
  const meas = th.measure(tapes.live!, built)
  stop()
  stop = null
  // Each run makes its own engine world: free it, or the WASM heap grows over the file.
  w.destroy()
  const pred = (key: string) => preds.find((p) => p.key === key)!
  const got = (key: string) => {
    const m = meas.find((x) => x.key === key)
    if (!m) throw new Error(`${id}: nothing measured for ${key}`)
    return m.value
  }
  return { built, rate: w.stepRate, preds, meas, pred, got, gap: (key) => gapOf(pred(key), { key, value: got(key) }, w.stepRate, built) }
}

const pct = (a: number, b: number) => (Math.abs(a - b) / Math.abs(b)) * 100

describe('every demo experiment has a theory', () => {
  it.each(DEMO)('%s: cards that exist, roles that name its bodies, predictions with units and formulas', (id) => {
    const th: Theory | null = theoryFor(id)
    expect(th, id).not.toBeNull()
    for (const c of th!.cards) expect(cardById(c), `${id} card ${c}`).toBeDefined()
    const built = presetById(id)!.build()
    const names = new Set(built.bodies.map((b) => b.name))
    for (const [role, name] of Object.entries(th!.roles)) if (role !== 'S') expect(names.has(name), `${id} role ${role} → ${name}`).toBe(true)
    for (const p of th!.predict(built)) {
      expect(Number.isFinite(p.value), `${id} ${p.key}`).toBe(true)
      expect(p.unit).not.toBe('')
      expect(p.formula).not.toBe('')
    }
  })
  it('a scene with no theory gives null', () => {
    expect(theoryFor('stack')).toBeNull()
    expect(theoryFor(null)).toBeNull()
  })
})

describe('projectile (14 m/s at 30°)', () => {
  it('predicts range 17.30 m, top 2.497 m, flight 1.427 s; at 600 range and flight within 0.15 %, the top exactly the stepped top', async () => {
    const r = await run('projectile')
    expect(r.pred('range').value).toBeCloseTo(17.3, 2)
    expect(r.pred('top').value).toBeCloseTo(2.497, 3)
    expect(r.pred('flight').value).toBeCloseTo(1.427, 3)
    expect(pct(r.got('range'), r.pred('range').value)).toBeLessThan(0.15)
    expect(pct(r.got('flight'), r.pred('flight').value)).toBeLessThan(0.15)
    expect(pct(r.got('top'), r.pred('top').stepped!(600))).toBeLessThan(0.01)
    for (const k of ['range', 'top', 'flight']) expect(r.gap(k).within, k).toBe(true)
  })
  it('at 240 the range is 0.29 % short and the reason names the step: v₀ₓδ = 5.1 cm', async () => {
    const r = await run('projectile', 240)
    const g = r.gap('range')
    expect(g.percent).toBeGreaterThan(-0.32)
    expect(g.percent).toBeLessThan(-0.26)
    expect(g.reason).toContain('1/240 s step')
    expect(g.reason).toContain('v₀ₓδ = 5.1 cm short')
    expect(g.within).toBe(true)
  })
})

describe('drops', () => {
  it('fall: 1.010 s at 9.90 m/s; the time’s reason is the step’s milliseconds', async () => {
    const r = await run('fall')
    expect(r.pred('time:A').value).toBeCloseTo(1.01, 2)
    expect(r.pred('speed:A').value).toBeCloseTo(9.9, 1)
    expect(pct(r.got('time:A'), r.pred('time:A').value)).toBeLessThan(0.15)
    expect(r.gap('time:A').reason).toMatch(/1\/600 s step: it lands δ = Δt g T \/ 2v = 0\.8 ms early/)
  })
  it('moon: 2.48 s; drop (vacuum): 1.11 s for both balls', async () => {
    const m = await run('moon')
    expect(m.pred('time:A').value).toBeCloseTo(2.48, 2)
    expect(m.gap('time:A').within).toBe(true)
    const d = await run('drop')
    for (const name of ['Heavy', 'Light']) {
      expect(d.pred(`time:${name}`).value).toBeCloseTo(1.11, 2)
      expect(d.gap(`time:${name}`).within).toBe(true)
    }
    expect(d.got('time:Heavy')).toBe(d.got('time:Light'))
  })
  it('cliff: 0.903 s and 2.71 m out, counted from where it left the ledge', async () => {
    const r = await run('cliff')
    expect(r.pred('time').value).toBeCloseTo(0.903, 3)
    expect(r.pred('distance').value).toBeCloseTo(2.709, 3)
    expect(r.gap('time').within).toBe(true)
    expect(r.gap('distance').within).toBe(true)
  })
})

describe('pendulum (2 m, 15°)', () => {
  it('small-swing 2.837 s, large-swing 2.849 s (2.853 s turning with the string); measured within 0.5 %; the small-swing gap names the swing size and the turning', async () => {
    const r = await run('pendulum')
    expect(r.pred('Tsmall').value).toBeCloseTo(2.837, 3)
    // SB61: the bob turns with its string, a physical pendulum: 2.8494 s × √(1 + 0.4r²/L²) = 2.8526 s.
    expect(r.pred('T').value).toBeCloseTo(2.8526, 3)
    expect(pct(r.got('T'), r.pred('T').value)).toBeLessThan(0.5)
    const g = r.gap('Tsmall')
    expect(g.within).toBe(true)
    expect(g.reason).toContain('a 15° swing is not small: 2π√(L/g)(1 + θ₀²/16) = 2.849 s')
    expect(g.reason).toContain('the bob turns with its string, √(1 + 0.4r²/L²) = 1.0011 longer')
  })
})

describe('springs', () => {
  it('spring: 0.6283 s; springice: 1.2566 s; measured within 0.5 %, the reason the step’s bounded wobble', async () => {
    const s = await run('spring')
    expect(s.pred('T').value).toBeCloseTo(0.6283, 4)
    expect(pct(s.got('T'), s.pred('T').value)).toBeLessThan(0.5)
    expect(s.gap('T').reason).toMatch(/the step's own wobble, within ±[\d.]+ %, with no drift/)
    const i = await run('springice')
    expect(i.pred('T').value).toBeCloseTo(1.2566, 4)
    expect(pct(i.got('T'), i.pred('T').value)).toBeLessThan(0.5)
  })
})

describe('pulleys', () => {
  it('atwood (SB59: 0.50 kg against 0.55 kg on a retort stand): 0.467 m/s², m₂ falls 5.84 cm in 0.5 s; at 240 the 0.83 % is the step’s ½at²(1 + Δt/t)', async () => {
    const r = await run('atwood')
    expect(r.pred('a').value).toBeCloseTo((0.05 / 1.05) * 9.81, 6)
    expect(r.pred('drop').value).toBeCloseTo(0.5 * (0.05 / 1.05) * 9.81 * 0.25, 6)
    expect(r.gap('drop').within).toBe(true)
    const s = await run('atwood', 240)
    expect(s.gap('drop').percent).toBeCloseTo(0.833, 1)
    expect(s.gap('drop').reason).toContain('½at²(1 + Δt/t), 0.83 % more')
    expect(pct(s.got('drop'), s.pred('drop').stepped!(240))).toBeLessThan(0.05)
  })
  it('lift: 1.40 m/s² and 33.6 N', async () => {
    const r = await run('lift')
    expect(r.pred('a').value).toBeCloseTo(1.4, 2)
    expect(r.pred('tension').value).toBeCloseTo(33.6, 1)
    expect(r.gap('a').within).toBe(true)
    expect(r.gap('tension').within).toBe(true)
  })
})

describe('friction and bounces', () => {
  it('friction: stops after 4.59 m (within 2 %), the reason how the engine mixes the two frictions', async () => {
    const r = await run('friction')
    expect(r.pred('stop').value).toBeCloseTo(4.59, 2)
    expect(pct(r.got('stop'), r.pred('stop').value)).toBeLessThan(2)
    expect(r.gap('stop').reason).toContain('square root of their two friction values')
  })
  it('bounce: tops 1.920, 1.229, 0.786 m and contacts 0.782, 2.033, 3.034 s; all within, a high top explained by v Δt', async () => {
    const r = await run('bounce')
    expect([1, 2, 3].map((k) => +r.pred(`top${k}`).value.toFixed(3))).toEqual([1.92, 1.229, 0.786])
    expect([1, 2, 3].map((k) => +r.pred(`hit${k}`).value.toFixed(3))).toEqual([0.782, 2.033, 3.034])
    for (const k of ['top1', 'top2', 'top3', 'hit1', 'hit2', 'hit3']) expect(r.gap(k).within, k).toBe(true)
    const s = await run('bounce', 240)
    expect(s.gap('top3').within).toBe(true)
    expect(s.gap('top3').reason).toMatch(/turns the ball round up to v Δt = 2(\.\d)? cm above the floor/)
  })
})

describe('collisions', () => {
  it('collision: A −2.13 m/s, B +2.38 m/s; sticky: 1.00 m/s; recoil: ±25 kg m/s', async () => {
    const c = await run('collision')
    expect(c.pred('vA').value).toBeCloseTo(-2.125, 3)
    expect(c.pred('vB').value).toBeCloseTo(2.375, 3)
    expect(c.gap('vA').within && c.gap('vB').within).toBe(true)
    const s = await run('sticky')
    expect(s.pred('vB').value).toBeCloseTo(1, 6)
    expect(s.gap('vB').within).toBe(true)
    const r = await run('recoil')
    expect(r.pred('p:Gun').value).toBeCloseTo(-25, 6)
    expect(r.pred('p:Bullet').value).toBeCloseTo(25, 6)
    expect(r.gap('p:Gun').within && r.gap('p:Bullet').within).toBe(true)
  })
  it('cradle: the last ball leaves at 1.921 m/s (e = 0.98), measured within 2 %', async () => {
    const r = await run('cradle')
    expect(r.pred('last').value).toBeCloseTo(1.921, 3)
    expect(r.gap('last').within).toBe(true)
  })
})

describe('air', () => {
  it('terminal: v_t = √(2mg/ρC_dA) from the build; the floor speed is the formula’s v_t √(1 − e^(−2gh/v_t²)) within 1 %, 94.8 % of v_t', async () => {
    const r = await run('terminal')
    const vt = r.pred('vt').value
    expect(vt).toBeCloseTo(19.64, 1)
    expect(pct(r.got('floor'), r.pred('floor').value)).toBeLessThan(1)
    // The preset's sentence says 95 %: the formula gives 94.8 % for 45 m, and so does the run.
    expect(r.got('floor') / vt).toBeGreaterThan(0.945)
    expect(r.gap('floor').reason).toContain('Air drag is ½ ρ C_d A v²')
  })
  it('ramp: √(10gh/7) at the bottom; measured within 3 %, the reason PhysLab’s rolling model', async () => {
    const r = await run('ramp')
    expect(r.gap('bottom').within).toBe(true)
    expect(r.gap('bottom').reason).toContain('Rolling resistance')
  })
})

describe('predictions come from the built preset', () => {
  it('a heavier m₂, a faster projectile, a longer pendulum and a stiffer spring each move their prediction', () => {
    const at = presetById('atwood')!.build()
    const heavier = { ...at, bodies: at.bodies.map((b) => (b.name === 'm₂' ? { ...b, mass: 3 } : b)) }
    expect(theoryFor('atwood')!.predict(heavier).find((p) => p.key === 'a')!.value).toBeCloseTo((2.5 / 3.5) * 9.81, 6)
    const pr = presetById('projectile')!.build()
    const faster = { ...pr, bodies: pr.bodies.map((b) => (b.name === 'P' ? { ...b, velocity: [b.velocity[0] * 2, b.velocity[1] * 2, 0] as [number, number, number] } : b)) }
    expect(theoryFor('projectile')!.predict(faster).find((p) => p.key === 'range')!.value).toBeCloseTo(4 * 17.3029, 2)
    const sp = presetById('spring')!.build()
    const stiffer = { ...sp, links: sp.links!.map((l) => ({ ...l, stiffness: 800 })) }
    expect(theoryFor('spring')!.predict(stiffer)[0].value).toBeCloseTo(0.6283 / 2, 4)
    const moon = presetById('fall')!.build()
    expect(theoryFor('fall')!.predict({ ...moon, world: { ...moon.world, gravity: 1.62 } })[0].value).toBeCloseTo(Math.sqrt(10 / 1.62), 6)
  })
})

describe('gapOf', () => {
  it('within the tolerance, or within it of the stepped formula, or no further off than the step allows', () => {
    const base: Prediction = { scene: 'spring', key: 'T', label: 'T', value: 1, unit: 's', formula: 'f', facts: theoryFor('spring')!.predict(presetById('spring')!.build())[0].facts, step: null }
    expect(gapOf(base, { key: 'T', value: 1.004 }, 600, { bodies: [] }).within).toBe(true)
    expect(gapOf(base, { key: 'T', value: 1.01 }, 600, { bodies: [] }).within).toBe(false)
    expect(gapOf({ ...base, stepped: () => 1.01 }, { key: 'T', value: 1.01 }, 600, { bodies: [] }).within).toBe(true)
    expect(gapOf({ ...base, allowance: () => 0.02 }, { key: 'T', value: 1.02 }, 600, { bodies: [] }).within).toBe(true)
    expect(gapOf(base, { key: 'T', value: 1.01 }, 600, { bodies: [] }).percent).toBeCloseTo(1, 9)
  })
})

describe('review fixes (gpt-5.4 r1): a theory gives nothing for an edited scene its formula no longer fits', () => {
  const edit = (id: string, name: string, patch: Record<string, unknown>): Built => {
    const b = presetById(id)!.build()
    return { ...b, bodies: b.bodies.map((d) => (d.name === name ? { ...d, ...patch } : d)) }
  }
  it('a renamed or deleted body: no predictions, no measurements, no throw', () => {
    const b = edit('projectile', 'P', { name: 'Q' })
    expect(theoryFor('projectile')!.predict(b)).toEqual([])
    const gone = presetById('cliff')!.build()
    expect(theoryFor('cliff')!.predict({ ...gone, bodies: gone.bodies.filter((d) => d.name !== 'Ledge') })).toEqual([])
  })
  it('ramp: a box cannot roll, so the rolling formula is not offered', () => {
    expect(theoryFor('ramp')!.predict(edit('ramp', 'A', { shape: 'box', size: [1, 1, 1] }))).toEqual([])
  })
  it('crane: a crate standing on the floor with a slack rope is not hanging: no tension prediction', () => {
    const b = presetById('crane')!.build()
    const slack = { ...b, links: b.links!.map((l) => ({ ...l, length: 6 })) }
    expect(theoryFor('crane')!.predict(slack)).toEqual([])
  })
  it('collision: a glancing hit is not the head-on formula', () => {
    expect(theoryFor('collision')!.predict(edit('collision', 'B', { position: [1, 0.3, 0.2] }))).toEqual([])
  })
  it('a drop thrown upwards: t = (u + √(u² + 2gh))/g and v = √(u² + 2gh)', () => {
    const b = edit('fall', 'A', { velocity: [0, 10, 0] })
    const [t, v] = theoryFor('fall')!.predict(b)
    const h = 5
    expect(t.value).toBeCloseTo((10 + Math.sqrt(100 + 2 * 9.81 * h)) / 9.81, 6)
    expect(v.value).toBeCloseTo(Math.sqrt(100 + 2 * 9.81 * h), 6)
  })
  it('a spring between two moving masses uses the reduced mass', () => {
    const b = presetById('springice')!.build()
    const post = b.bodies.find((d) => d.name === 'Post')!
    const free = { ...b, bodies: b.bodies.map((d) => (d === post ? { ...d, motion: 'dynamic' as const, massMode: 'mass' as const, mass: 2 } : d)) }
    // 2 kg and 2 kg: μ = 1 kg.
    expect(theoryFor('springice')!.predict(free)[0].value).toBeCloseTo(2 * Math.PI * Math.sqrt(1 / 50), 6)
  })
  it('a miss against a prediction of zero is a 100 % miss, never 0 %', () => {
    const p: Prediction = { ...theoryFor('collision')!.predict(presetById('collision')!.build())[0], value: 0 }
    const g = gapOf(p, { key: p.key, value: 0.72 }, 600, { bodies: [] })
    expect(g.percent).toBe(100)
    expect(g.within).toBe(false)
    expect(gapOf(p, { key: p.key, value: 0 }, 600, { bodies: [] }).within).toBe(true)
  })
  it('a formula shows e to three places, so 0.975 is not written 0.98', () => {
    const b = presetById('bounce')!.build()
    const e975 = { ...b, bodies: b.bodies.map((d) => ({ ...d, restitution: 0.975 })) }
    expect(theoryFor('bounce')!.predict(e975)[2].formula).toContain('0.975^6')
  })
})

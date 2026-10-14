import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import katex from 'katex'
import { CardTex, cardTexTrust } from '../src/renderer/src/render/sandbox/CardTex'
import { CardsDock, CardsDockView, cardsForScene, readingFromReadout, readStoredPref, writeStoredPref } from '../src/renderer/src/render/sandbox/CardsDock'
import { cardLink, useCardLink } from '../src/renderer/src/sim/cardLink'
import { cardsInView, gapRows, OPEN_CARDS } from '../src/renderer/src/sim/cardGaps'
import { theoryFor } from '../src/renderer/src/sim/theory'
import { presetById, PRESETS } from '../src/renderer/src/sim/presets'
import { SimWorld } from '../src/renderer/src/sim/world'
import { startRecorder, tapes } from '../src/renderer/src/sim/recorder'
import { DEFAULT_WORLD } from '../src/renderer/src/sim/types'
import { evaluateCard } from '../src/renderer/src/sim/cards'
import type { Reading } from '../src/renderer/src/sim/cards/types'
import type { BodyDef, BodyState, Link, WorldSettings } from '../src/renderer/src/sim/types'
import type { V3 } from '../src/renderer/src/math/vec'

describe('CardTex trust filter', () => {
  it('exports CardTex component', () => {
    expect(typeof CardTex).toBe('object') // React.memo component
  })

  it('allows \\htmlData only when key is q', () => {
    expect(cardTexTrust({ command: '\\htmlData', key: 'q' })).toBe(true)
  })

  it('refuses \\htmlData with any other key', () => {
    expect(cardTexTrust({ command: '\\htmlData', key: 'href' })).toBe(false)
    expect(cardTexTrust({ command: '\\htmlData', key: 'src' })).toBe(false)
    expect(cardTexTrust({ command: '\\htmlData', key: 'onclick' })).toBe(false)
    expect(cardTexTrust({ command: '\\htmlData' })).toBe(false)
  })

  it('refuses other commands like \\url, \\href, \\includegraphics', () => {
    expect(cardTexTrust({ command: '\\url' })).toBe(false)
    expect(cardTexTrust({ command: '\\href' })).toBe(false)
    expect(cardTexTrust({ command: '\\includegraphics' })).toBe(false)
    expect(cardTexTrust({ command: '\\htmlClass' })).toBe(false)
    expect(cardTexTrust({ command: '\\htmlStyle' })).toBe(false)
  })
})

describe('cardLink highlight store', () => {
  beforeEach(() => {
    cardLink.clear()
  })

  it('starts with no highlighted quantity', () => {
    expect(cardLink.highlighted).toBeNull()
    expect(useCardLink.getState().highlighted).toBeNull()
  })

  it('sets and clears highlight', () => {
    cardLink.set('vel')
    expect(cardLink.highlighted).toBe('vel')

    cardLink.set('pos')
    expect(cardLink.highlighted).toBe('pos')

    cardLink.clear()
    expect(cardLink.highlighted).toBeNull()
  })

  it('toggles highlight: second tap clears it', () => {
    cardLink.toggle('vel')
    expect(cardLink.highlighted).toBe('vel')

    // Tapping the same symbol clears the highlight
    cardLink.toggle('vel')
    expect(cardLink.highlighted).toBeNull()

    // Tapping a different symbol switches to it
    cardLink.toggle('acc')
    expect(cardLink.highlighted).toBe('acc')
    cardLink.toggle('force')
    expect(cardLink.highlighted).toBe('force')
  })
})

describe('cardsForScene selection', () => {
  it('exports CardsDock component', () => {
    expect(typeof CardsDockView).toBe('object') // React.memo component
    expect(typeof CardsDock).toBe('function') // the HUD's wired slot
  })

  it('shows theory cards when preset theory defines them', () => {
    const cards = cardsForScene({
      presetId: 'projectile',
      theory: { cards: ['projectile-range', 'projectile-time', 'ke'] },
      selectedBodyId: 'ball',
      hasBodies: true
    })
    expect(cards).toEqual(['projectile-range', 'projectile-time', 'ke'])
  })

  it('falls back to KE, PE, energy when theory is absent but a body is selected', () => {
    const cards = cardsForScene({
      presetId: null,
      theory: null,
      selectedBodyId: 'box-1',
      hasBodies: true
    })
    expect(cards).toEqual(['ke', 'pe', 'energy'])
  })

  it('shows KE, PE, energy when bodies exist even if none is selected', () => {
    const cards = cardsForScene({
      presetId: null,
      theory: null,
      selectedBodyId: null,
      hasBodies: true
    })
    expect(cards).toEqual(['ke', 'pe', 'energy'])
  })

  it('returns empty list when scene has no bodies and no theory', () => {
    const cards = cardsForScene({
      presetId: null,
      theory: null,
      selectedBodyId: null,
      hasBodies: false
    })
    expect(cards).toEqual([])
  })
})

describe('readingFromReadout', () => {
  const ball: BodyDef = {
    id: 'b1',
    name: 'Ball',
    shape: 'sphere',
    size: [0.25, 0.25, 0.25],
    position: [0, 5, 0],
    rotation: [0, 0, 0],
    velocity: [10, 0, 0],
    angularVelocity: [0, 0, 0],
    material: 'steel',
    mass: 2,
    massMode: 'mass',
    motion: 'dynamic',
    restitution: 0.5,
    friction: 0.2,
    linearDamping: 0,
    angularDamping: 0.05,
    color: 'steel'
  }

  const ballState: BodyState = {
    position: [2.5, 4.0, 0],
    rotation: [0, 0, 0, 1],
    velocity: [10, -4.9, 0],
    angularVelocity: [0, 0, 0],
    mass: 2,
    asleep: false
  }

  const world: WorldSettings = {
    gravity: 9.81,
    twoD: true,
    airDensity: 1.2,
    wind: [0, 0, 0],
    stepRate: 240,
    allowSleeping: true,
    timeScale: 1,
    collisionSteps: 4
  }

  it('builds a Reading from readout and applies acceleration when tape provides it', () => {
    const readout = {
      time: 0.5,
      bodyOrder: ['b1'],
      state: (id: string) => (id === 'b1' ? ballState : null)
    }

    const tapeAcc: V3 = [0, -9.81, 0]

    const reading = readingFromReadout({
      readout,
      bodies: [ball],
      starts: { b1: { position: [0, 5, 0], rotation: [0, 0, 0, 1], velocity: [10, 0, 0], angularVelocity: [0, 0, 0], mass: 2, asleep: false } },
      links: [],
      world,
      selectedBodyId: 'b1',
      getTapeAcc: (id: string) => (id === 'b1' ? tapeAcc : undefined)
    })

    expect(reading.t).toBe(0.5)
    expect(reading.g).toBe(9.81)
    expect(reading.stepRate).toBe(240)
    expect(reading.bodies['A']).toBeDefined()
    expect(reading.bodies['A'].def.name).toBe('Ball')
    expect(reading.bodies['A'].state.velocity).toEqual([10, -4.9, 0])
    expect(reading.bodies['A'].acc).toEqual([0, -9.81, 0])

    // Evaluates KE card on this reading cleanly
    const card = evaluateCard('ke', reading, { decimals: 2, precisionMode: 'dp' })
    expect(card).not.toBeNull()
    expect(card?.title).toBe('Kinetic energy (moving along, not spinning)')
    expect(card?.sumChecks).toBe(true)
    expect(card?.unitsCheck).toBe(true)
  })

  it('leaves acc undefined when tape does not provide it', () => {
    const readout = {
      time: 0,
      bodyOrder: ['b1'],
      state: (id: string) => (id === 'b1' ? ballState : null)
    }

    const reading = readingFromReadout({
      readout,
      bodies: [ball],
      starts: {},
      links: [],
      world,
      selectedBodyId: 'b1'
    })

    expect(reading.bodies['A'].acc).toBeUndefined()
  })
})

describe('localStorage preferences (try/catch safety)', () => {
  const originalLocalStorage = (globalThis as unknown as { localStorage?: unknown }).localStorage

  beforeEach(() => {
    const store = new Map<string, string>()
    ;(globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear()
    }
  })

  afterEach(() => {
    ;(globalThis as unknown as { localStorage: unknown }).localStorage = originalLocalStorage
  })

  it('reads and writes preference without throwing even if localStorage is blocked', () => {
    writeStoredPref('physlab.cardsDock.test', true)
    expect(readStoredPref('physlab.cardsDock.test', false)).toBe(true)

    writeStoredPref('physlab.cardsDock.test', false)
    expect(readStoredPref('physlab.cardsDock.test', true)).toBe(false)

    // Falls back to default when absent
    expect(readStoredPref('physlab.cardsDock.nonexistent', true)).toBe(true)
    expect(readStoredPref('physlab.cardsDock.nonexistent', false)).toBe(false)
  })

  it('catches and returns fallback when localStorage throws security or quota error', () => {
    ;(globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: () => {
        throw new Error('SecurityError: Access is denied')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      }
    }

    // Never throws!
    expect(() => writeStoredPref('test', true)).not.toThrow()
    expect(readStoredPref('test', true)).toBe(true)
    expect(readStoredPref('test', false)).toBe(false)
  })
})

describe('spot-check cards evaluation (SB18 Checks)', () => {
  const bodyA: BodyDef = {
    id: 'bA',
    name: 'Cart A',
    shape: 'box',
    size: [0.4, 0.2, 0.2],
    position: [0, 1.5, 0],
    rotation: [0, 0, 0],
    velocity: [3.0, 0, 0],
    angularVelocity: [0, 0, 0],
    material: 'steel',
    mass: 2.0,
    massMode: 'mass',
    motion: 'dynamic',
    restitution: 0.5,
    friction: 0.2,
    linearDamping: 0,
    angularDamping: 0.05,
    color: 'steel'
  }

  const linkS: Link = {
    id: 'link1',
    kind: 'spring',
    a: 'bA',
    b: 'bA',
    stiffness: 50,
    damping: 0,
    length: 1.0
  }

  const stateA: BodyState = {
    position: [0, 1.5, 0],
    rotation: [0, 0, 0, 1],
    velocity: [3.0, 0, 0],
    angularVelocity: [0, 0, 0],
    mass: 2.0,
    asleep: false
  }

  const reading: Reading = {
    t: 1.0,
    g: 9.81,
    datum: 0,
    stepRate: 240,
    bodies: {
      A: { def: bodyA, state: stateA, start: stateA }
    },
    links: {
      S: { link: linkS, stretch: 0.2 }
    }
  }

  const precision = { decimals: 2, precisionMode: 'dp' } as const

  it('spot-checks 1: Kinetic energy (ke)', () => {
    const card = evaluateCard('ke', reading, precision)
    expect(card).not.toBeNull()
    expect(card?.sumChecks).toBe(true)
    expect(card?.unitsCheck).toBe(true)
    expect(card?.value).toBeCloseTo(9.0) // 0.5 * 2.0 * 3^2 = 9.0 J
    expect(card?.lines.length).toBe(3)
  })

  it('spot-checks 2: Potential energy (pe)', () => {
    const card = evaluateCard('pe', reading, precision)
    expect(card).not.toBeNull()
    expect(card?.sumChecks).toBe(true)
    expect(card?.unitsCheck).toBe(true)
    expect(card?.value).toBeCloseTo(2.0 * 9.81 * 1.5) // 29.43 J
  })

  it('spot-checks 3: Energy of one body (energy)', () => {
    const card = evaluateCard('energy', reading, precision)
    expect(card).not.toBeNull()
    expect(card?.sumChecks).toBe(true)
    expect(card?.unitsCheck).toBe(true)
    expect(card?.value).toBeCloseTo(9.0 + 29.43) // 38.43 J
  })

  it('spot-checks 4: Momentum (momentum)', () => {
    const card = evaluateCard('momentum', reading, precision)
    expect(card).not.toBeNull()
    expect(card?.sumChecks).toBe(true)
    expect(card?.unitsCheck).toBe(true)
    expect(card?.value).toBeCloseTo(2.0 * 3.0) // 6.0 kg m/s
  })

  it('spot-checks 5: Spring energy (spring-energy)', () => {
    const card = evaluateCard('spring-energy', reading, precision)
    expect(card).not.toBeNull()
    expect(card?.sumChecks).toBe(true)
    expect(card?.unitsCheck).toBe(true)
    // 0.5 * 50 * 0.2^2 + 0.5 * 2.0 * 3.0^2 = 1.0 + 9.0 = 10.0 J
    expect(card?.value).toBeCloseTo(10.0)
  })

  it('Spring on ice at t = 0.400 s (FIG. 4 specification check)', () => {
    // k = 50 N/m, x = -0.2520 m, m = 2.0 kg, v = -2.728 m/s
    const springReading: Reading = {
      t: 0.4,
      g: 9.81,
      datum: 0,
      stepRate: 600,
      bodies: {
        A: {
          def: bodyA,
          state: { ...stateA, velocity: [-2.728, 0, 0] },
          start: stateA
        }
      },
      links: {
        S: { link: linkS, stretch: -0.252 }
      }
    }

    const card = evaluateCard('spring-energy', springReading, precision)
    expect(card).not.toBeNull()
    expect(card?.sumChecks).toBe(true)
    // 0.5 * 50 * (-0.252)^2 + 0.5 * 2.0 * (-2.728)^2 = 1.5876 + 7.441984 = 9.029584 J ≈ 9.03 J
    expect(card?.value).toBeCloseTo(9.03, 2)
  })
})

describe('KaTeX rendering with cardTexTrust', () => {
  it('renders KaTeX HTML with data-q="vel" when using \\htmlData{q=vel}{v}', () => {
    const html = katex.renderToString('\\htmlData{q=vel}{v}', {
      strict: 'ignore',
      trust: cardTexTrust,
      output: 'html'
    })
    expect(html).toContain('data-q="vel"')
    expect(html).toContain('v')
  })

  it('refuses unauthorized attributes in KaTeX', () => {
    const html = katex.renderToString('\\htmlData{href=bad}{v}', {
      strict: 'ignore',
      trust: cardTexTrust,
      output: 'html'
    })
    expect(html).not.toContain('data-href="bad"')
    expect(html).toContain('\\htmlData')
  })

  it('accepts real KaTeX context structure with attributes object', () => {
    expect(cardTexTrust({ command: '\\htmlData', attributes: { 'data-q': 'pos' } })).toBe(true)
    expect(cardTexTrust({ command: '\\htmlData', attributes: { 'data-q': 'vel' } })).toBe(true)
    expect(cardTexTrust({ command: '\\htmlData', attributes: { 'data-href': 'https://evil.com' } })).toBe(false)
    expect(cardTexTrust({ command: '\\htmlData', attributes: { 'data-q': 'pos', onclick: 'alert(1)' } })).toBe(false)
  })
})



// ---------------------------------------------------------------- wiring (Wed 14 Oct, the Pro: the owner asked where the formulas are)
describe('the dock in the app: the loaded experiment, the gap rows, the simple view', () => {
  it('the simple Sandbox shows one card for the loaded experiment (its first); All tools every card', () => {
    expect(cardsInView(['projectile-range', 'projectile-top', 'flight-time'], 'simple')).toEqual(['projectile-range'])
    expect(cardsInView(['projectile-range', 'projectile-top', 'flight-time'], 'all')).toEqual(['projectile-range', 'projectile-top', 'flight-time'])
    expect(OPEN_CARDS).toBe(3)
  })

  it('the projectile run gives its gap rows from the tape: formula, measured, the gap and its reason, through the number writer', async () => {
    ;(await SimWorld.create()).destroy()
    const built = presetById('projectile')!.build()
    const w = await SimWorld.create({ ...DEFAULT_WORLD, ...(built.world ?? {}), stepRate: 240 })
    w.rebuild(built.bodies, built.links ?? [])
    const stop = startRecorder(w)
    const th = theoryFor('projectile')!
    const num = (v: number) => v.toFixed(2)
    // Before the landing only the top can be measured; nothing at all before the first step.
    expect(gapRows(th, built, tapes.live ?? ({ first: 0, last: 0 } as never), 240, num)).toEqual([])
    for (let i = 0; i < 0.9 * 240; i++) w.stepOnce()
    expect(gapRows(th, built, tapes.live!, 240, num).map((r) => r.key)).not.toContain('range')
    for (let i = 0; i < 1.6 * 240; i++) w.stepOnce()
    const rows = gapRows(th, built, tapes.live!, 240, num)
    stop()
    w.destroy()
    const range = rows.find((r) => r.key === 'range')!
    expect(range.text).toMatch(/^Range: formula 17\.30 m · measured 17\.2\d m · gap −\d\.\d\d %: /)
    expect(range.within).toBe(true)
    expect(rows.map((r) => r.key)).toEqual(['range', 'top', 'flight'])
  }, 30_000)

  it('a scene that is not its experiment any more (a body renamed away) gives no rows', async () => {
    const built = presetById('projectile')!.build()
    const renamed = { ...built, bodies: built.bodies.map((b) => ({ ...b, name: b.name + ' x' })) }
    const th = theoryFor('projectile')!
    expect(gapRows(th, renamed, { first: 0, last: 10 } as never, 240, String)).toEqual([])
  })
})

describe('every demo experiment’s cards evaluate (the link role found from the A body)', () => {
  it.each(PRESETS.map((p) => p.id).filter((id) => theoryFor(id)))('%s', (id) => {
    const b = presetById(id)!.build()
    const th = theoryFor(id)!
    const r = readingFromReadout({ bodies: b.bodies, starts: {}, links: b.links ?? [], world: { ...DEFAULT_WORLD, ...(b.world ?? {}) }, roles: th.roles })
    for (const c of th.cards) expect(evaluateCard(c, r, { decimals: 2, precisionMode: 'dp' }), c).not.toBeNull()
  })
})

describe('the contract check: Spring on ice at t = 0.400 s, run at 600 (FIG. 4)', () => {
  it('the energy card reads ½ × 50 N/m × (−0.252 m)² + ½ × 2 kg × (2.728 m/s)² = 9.03 J (± the last digit)', async () => {
    ;(await SimWorld.create()).destroy()
    const built = presetById('springice')!.build()
    const world = { ...DEFAULT_WORLD, ...(built.world ?? {}), stepRate: 600 as const }
    const w = await SimWorld.create(world)
    w.rebuild(built.bodies, built.links ?? [])
    for (let i = 0; i < 0.4 * 600; i++) w.stepOnce()
    const th = theoryFor('springice')!
    const r = readingFromReadout({ readout: { time: w.time, state: (id) => w.state(id) }, bodies: built.bodies, starts: {}, links: built.links ?? [], world, roles: th.roles })
    const view = evaluateCard('spring-energy', r, { decimals: 2, precisionMode: 'dp' })!
    expect(w.time).toBeCloseTo(0.4, 9)
    w.destroy()
    const plain = view.lines.map((l) => l.plain).join(' ')
    console.info('SB18 springice 0.400 s:', plain)
    // SB4's card writes the substituted line and the sum (no middle line of the two energies, 1.59 J + 7.44 J): the
    // stretch, the speed and the total are FIG. 4's to the last digit.
    expect(plain).toContain('(−0.252 m)²')
    expect(plain).toContain('(2.728 m/s)²')
    expect(plain).toMatch(/= 9\.0[234] J$/)
  }, 30_000)
})

describe('review fixes (medium, Wed 14 Oct)', () => {
  it('a gap that rounds to zero is shown without a sign', () => {
    const th = { cards: [], roles: {}, tolerance: () => 1, predict: () => [{ scene: 'x', key: 'k', label: 'speed', value: 100, unit: 'm/s', formula: '', facts: { anyBounce: false, anySliding: false, anySpinDampingAboveZero: false, anyRope: false, anyEngineSpring: false, pendulumAmplitudeDeg: null, anyRolling: false, airDensity: 0, maxSpeed: 0, maxDistanceFromOrigin: 0, slowestBounceSpeed: null }, step: null }], measure: () => [{ key: 'k', value: 100.004 }] }
    const rows = gapRows(th as never, { bodies: [] }, { first: 0, last: 5 } as never, 240, (v) => v.toFixed(2))
    expect(rows[0].text).toContain('gap 0.00 %')
  })
})

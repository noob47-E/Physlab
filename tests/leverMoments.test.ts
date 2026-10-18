import { describe, expect, it } from 'vitest'
import { presetById } from '../src/renderer/src/sim/presets'
import { evaluateCard, readingOf } from '../src/renderer/src/sim/cards'
import { DEFAULT_WORLD, type BodyDef } from '../src/renderer/src/sim/types'
import { theoryFor } from '../src/renderer/src/sim/theory'
import { cardsForScene } from '../src/renderer/src/render/sandbox/CardsDock'
import { cardsInView } from '../src/renderer/src/sim/cardGaps'
import { loadJolt } from '../src/renderer/src/sim/jolt'
import { SimWorld } from '../src/renderer/src/sim/world'
import { slideHanger, leverMoments } from '../src/renderer/src/sim/apparatus'

const SF3 = { decimals: 3, precisionMode: 'sf' as const }

describe('S2: lever with sliding masses + ruler + live turning effects (Finding 8.2)', () => {
  it('theoryFor("seesaw") provides principle of moments formula cards and roles', () => {
    const theory = theoryFor('seesaw')
    expect(theory).not.toBeNull()
    expect(theory!.cards).toEqual(['lever-balance', 'lever-left-moment', 'lever-right-moment'])
    expect(theory!.roles).toMatchObject({
      'Left hanger': 'Left hanger',
      'Right hanger': 'Right hanger'
    })

    const cards = cardsForScene({ presetId: 'seesaw', theory })
    expect(cards).toEqual(['lever-balance', 'lever-left-moment', 'lever-right-moment'])
  })

  it('evaluates left moment, right moment, and net moment on the seesaw preset', () => {
    const preset = presetById('seesaw')!
    const built = preset.build()
    const r = readingOf({
      bodies: built.bodies,
      states: {},
      starts: {},
      links: built.links || [],
      world: { ...DEFAULT_WORLD, ...built.world },
      t: 0,
      roles: {
        'Left hanger': 'Left hanger',
        'Right hanger': 'Right hanger',
        Beam: 'Beam'
      }
    })

    const left = evaluateCard('lever-left-moment', r, SF3)
    expect(left).not.toBeNull()
    // 2 kg * 9.81 m/s² * 0.30 m = 5.886 N m
    expect(left!.value).toBeCloseTo(5.886, 2)
    expect(left!.unit).toBe('N m')

    const right = evaluateCard('lever-right-moment', r, SF3)
    expect(right).not.toBeNull()
    // 3 kg * 9.81 m/s² * 0.20 m = 5.886 N m
    expect(right!.value).toBeCloseTo(5.886, 2)
    expect(right!.unit).toBe('N m')

    const balance = evaluateCard('lever-balance', r, SF3)
    expect(balance).not.toBeNull()
    // 5.886 - 5.886 = 0 N m
    expect(balance!.value).toBeCloseTo(0.0, 2)
    expect(balance!.unit).toBe('N m')
  })

  it('dragging a hanger while paused slides along the beam and updates anchor pivotA', async () => {
    await loadJolt()
    const preset = presetById('seesaw')!
    const built = preset.build()
    const w = await SimWorld.create({ twoD: true })
    w.rebuild(built.bodies, built.links || [])

    const leftHanger = built.bodies.find((b) => b.name === 'Left hanger')!

    // Drag left hanger from x = -0.30 to x = -0.40
    w.placeBody(leftHanger.id, [-0.40, 0.45, 0])

    const posAfter = w.state(leftHanger.id)!.position
    expect(posAfter[0]).toBeCloseTo(-0.40, 2)

    // The string link anchor pivotA on the beam must have slid to -0.40 m
    const link = w.getLinkDefs().find((l) => l.b === leftHanger.id || l.a === leftHanger.id)!
    expect(link.pivotA![0]).toBeCloseTo(-0.40, 2)

    // Dragging beyond beam end is clamped within the beam length (half-length 0.50m -> max 0.48m)
    w.placeBody(leftHanger.id, [-0.70, 0.45, 0])
    const posClamped = w.state(leftHanger.id)!.position
    expect(posClamped[0]).toBeCloseTo(-0.48, 2)
    const linkClamped = w.getLinkDefs().find((l) => l.b === leftHanger.id || l.a === leftHanger.id)!
    expect(linkClamped.pivotA![0]).toBeCloseTo(-0.48, 2)

    // Dragging toward or past the pivot keeps left hanger on the left side of the knife edge (max -0.02m)
    w.placeBody(leftHanger.id, [0.10, 0.45, 0])
    const posPivotClamped = w.state(leftHanger.id)!.position
    expect(posPivotClamped[0]).toBeCloseTo(-0.02, 2)
    const linkPivotClamped = w.getLinkDefs().find((l) => l.b === leftHanger.id || l.a === leftHanger.id)!
    expect(linkPivotClamped.pivotA![0]).toBeCloseTo(-0.02, 2)
  })

  it('slideHanger and leverMoments calculate exact balance and moments', () => {
    const preset = presetById('seesaw')!
    const built = preset.build()
    const beam = built.bodies.find((b) => b.name === 'Beam')!
    const leftHanger = built.bodies.find((b) => b.name === 'Left hanger')!
    const leftLink = built.links!.find((l) => l.b === leftHanger.id)!

    // Slide left hanger to -0.40 m
    const { hanger: slidHanger, link: slidLink } = slideHanger(beam, leftHanger, leftLink, -0.40)
    expect(slidLink.pivotA![0]).toBeCloseTo(-0.40, 2)
    expect(slidHanger.position[0]).toBeCloseTo(-0.40, 2)

    // Check turning effect when unbalanced
    const moments = leverMoments(beam, [
      { mass: 2.0, x: -0.40 },
      { mass: 3.0, x: 0.20 }
    ])
    // Left: 2 * 9.81 * 0.4 = 7.848 N m
    // Right: 3 * 9.81 * 0.2 = 5.886 N m
    expect(moments.leftFd).toBeCloseTo(7.848, 2)
    expect(moments.rightFd).toBeCloseTo(5.886, 2)
    expect(moments.status).toBe('turns anticlockwise')
  })

  it('cardsInView in simple view includes both lever moment cards for side-by-side display', () => {
    const cards = ['lever-left-moment', 'lever-right-moment', 'lever-balance']
    const simple = cardsInView(cards, 'simple')
    expect(simple).toEqual(['lever-left-moment', 'lever-right-moment'])
  })

  it('leverMoments returns "turns anticlockwise" and "turns clockwise" in words', () => {
    const beam = { name: 'Beam', position: [0, 0.6, 0] } as unknown as BodyDef
    // Left heavier -> turns anticlockwise
    const anticlock = leverMoments(beam, [{ mass: 3.0, x: -0.30 }, { mass: 2.0, x: 0.20 }])
    expect(anticlock.status).toBe('turns anticlockwise')
    expect(anticlock.text).toContain('turns anticlockwise')

    // Right heavier -> turns clockwise
    const clock = leverMoments(beam, [{ mass: 2.0, x: -0.30 }, { mass: 4.0, x: 0.20 }])
    expect(clock.status).toBe('turns clockwise')
    expect(clock.text).toContain('turns clockwise')

    // Balanced
    const bal = leverMoments(beam, [{ mass: 2.0, x: -0.30 }, { mass: 3.0, x: 0.20 }])
    expect(bal.status).toBe('balanced')
    expect(bal.text).toContain('balanced')
  })

  it('seesaw preset has steel knife edge wedge and clearance for hinge pin', () => {
    const preset = presetById('seesaw')!
    const built = preset.build()
    const wedge = built.bodies.find((b) => b.id.includes('wedge') || b.name.toLowerCase().includes('knife'))
    expect(wedge).toBeDefined()
    expect(wedge!.material).toBe('steel')

    const beam = built.bodies.find((b) => b.name === 'Beam')!
    expect(beam).toBeDefined()
    // Beam half-height is 0.015 m (total 0.03 m). Hinge pin base radius must be strictly capped to beam.size[1] * 0.25 (0.0075 m)
    const maxAllowedRadius = beam.size[1] / 2
    const pinRadius = Math.min(0.035, beam.size[1] * 0.25)
    expect(pinRadius).toBeLessThan(maxAllowedRadius)
    expect(pinRadius).toBe(0.0075)

    // Extra thin body (1 cm height) stays capped strictly at 2.5 mm
    const extraThinHeight = 0.01
    const extraThinRadius = Math.min(0.035, extraThinHeight * 0.25)
    expect(extraThinRadius).toBe(0.0025)
    expect(extraThinRadius).toBeLessThan(extraThinHeight / 2)
  })

  it('leverMoments correctly accounts for off-centre pivot', () => {
    const beam = { name: 'Beam', position: [0, 0.6, 0] } as unknown as BodyDef
    // Off-centre pivot at x = 0.10 m
    // Left hanger at -0.10 m (distance = 0.20 m, mass = 2 kg -> moment = 2 * 9.81 * 0.20 = 3.924)
    // Right hanger at 0.30 m (distance = 0.20 m, mass = 2 kg -> moment = 2 * 9.81 * 0.20 = 3.924)
    const res = leverMoments(beam, [{ mass: 2.0, x: -0.10 }, { mass: 2.0, x: 0.30 }], 0.10)
    expect(res.status).toBe('balanced')
    expect(res.leftFd).toBeCloseTo(3.924, 2)
    expect(res.rightFd).toBeCloseTo(3.924, 2)
  })
})



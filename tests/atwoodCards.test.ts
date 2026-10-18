// S4 (report 8.4): loading the Atwood machine, the formula card showed only "Weight W = mg = 4.91 N" for m₁ - the textbook
// acceleration a = (m₂ − m₁)g / (m₁ + m₂) and the string tension were defined (sceneCards.ts) but never shown, because both pulley
// scenes listed the generic cards ['weight', 'suvat-s']. Lifting with a pulley had the same fault.

import { describe, expect, it } from 'vitest'
import { theoryFor } from '../src/renderer/src/sim/theory'
import { cardsForScene, readingFromReadout } from '../src/renderer/src/render/sandbox/CardsDock'
import { cardById, evaluateCard } from '../src/renderer/src/sim/cards'
import { presetById } from '../src/renderer/src/sim/presets'
import { DEFAULT_WORLD } from '../src/renderer/src/sim/types'

describe('S4: the pulley experiments show their own formula cards', () => {
  it('the Atwood machine shows its acceleration and its string tension, and no longer W = mg', () => {
    const shown = cardsForScene({ presetId: 'atwood', theory: theoryFor('atwood') })
    expect(shown).toEqual(['atwood-a', 'atwood-T'])
    expect(cardById('atwood-a')?.title).toBe('Acceleration of an Atwood machine')
    expect(cardById('atwood-a')?.formulaTex).toContain('\\frac{(@{m2} - @{m1}) * @{g}}{@{m1} + @{m2}}')
    expect(cardById('atwood-T')?.result.tex).toBe('T')
  })

  it('lifting with a pulley shows its acceleration and the rope’s tension too', () => {
    expect(cardsForScene({ presetId: 'lift', theory: theoryFor('lift') })).toEqual(['lift-a', 'lift-T'])
  })

  it('every card a scene names exists', () => {
    for (const id of ['atwood', 'lift']) for (const c of theoryFor(id)?.cards ?? []) expect(cardById(c), `${id}: ${c}`).toBeDefined()
  })

  it('…and gives a number in the dock, read the way the dock reads the scene (the cards find each mass by its name)', () => {
    const settings = { decimals: 2, precisionMode: 'dp' as const }
    const read = (id: string) => {
      const b = presetById(id)!.build()
      return readingFromReadout({ bodies: b.bodies, starts: {}, links: b.links ?? [], world: { ...DEFAULT_WORLD, ...(b.world ?? {}) }, roles: theoryFor(id)!.roles })
    }
    // 0.50 kg against 0.55 kg: a = 0.05 × 9.81 / 1.05 = 0.467 m/s², T = 2 × 0.50 × 0.55 × 9.81 / 1.05 = 5.14 N.
    expect(evaluateCard('atwood-a', read('atwood'), settings)?.value).toBeCloseTo(0.467, 3)
    expect(evaluateCard('atwood-T', read('atwood'), settings)?.value).toBeCloseTo(5.1386, 3)
    expect(evaluateCard('lift-a', read('lift'), settings)?.value).toBeCloseTo(1.4014, 2)
  })
})

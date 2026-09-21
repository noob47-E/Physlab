// The Sandbox's experiment search: a word typed in the box has to find the right presets and
// nothing else, every group falls back to the full list on an empty query, and every preset
// carries tags a search can actually use.

import { describe, expect, it } from 'vitest'
import { PRESETS, searchPresets } from '../src/renderer/src/sim/presets'

describe('preset tags', () => {
  it('every preset has 3 to 6 plain lowercase tags', () => {
    for (const p of PRESETS) {
      expect(p.tags.length, p.id).toBeGreaterThanOrEqual(3)
      expect(p.tags.length, p.id).toBeLessThanOrEqual(6)
      for (const t of p.tags) {
        expect(t, `${p.id}: "${t}"`).toBe(t.toLowerCase())
        expect(t, `${p.id}: "${t}"`).toMatch(/^[a-z][a-z ]*$/)
      }
    }
  })
})

describe('searchPresets', () => {
  it('an empty query returns every preset, in the usual order', () => {
    expect(searchPresets('')).toEqual(PRESETS)
    expect(searchPresets('   ')).toEqual(PRESETS)
  })

  it('"gravity" finds the free-fall and projectile presets, not the friction one', () => {
    const ids = searchPresets('gravity').map((p) => p.id)
    expect(ids).toEqual(expect.arrayContaining(['fall', 'projectile', 'drop', 'moon', 'cliff']))
    expect(ids).not.toContain('friction')
  })

  it('"rope pulley" finds the pulley presets, needing both words', () => {
    const ids = searchPresets('rope pulley').map((p) => p.id)
    expect(ids).toEqual(expect.arrayContaining(['atwood', 'lift', 'balance']))
    // "crane" has a rope but no pulley, so the second word rules it out.
    expect(ids).not.toContain('crane')
  })

  it('matches are case-insensitive and match a word from the about sentence too', () => {
    expect(searchPresets('PENDULUM').map((p) => p.id)).toContain('pendulum')
    expect(searchPresets('newton').map((p) => p.id)).toContain('cradle')
  })

  it('every query word must match somewhere', () => {
    expect(searchPresets('gravity xyzzy')).toEqual([])
  })

  it('a preset whose tags alone cover the query ranks before one that only matches in its sentence', () => {
    // Eight presets are tagged "energy"; collision, cradle and tug only say the word in their
    // sentence, so they belong after every tagged one whatever order the tagged ones keep.
    const ids = searchPresets('energy').map((p) => p.id)
    const tagged = PRESETS.filter((p) => p.tags.includes('energy')).map((p) => p.id)
    expect(tagged.length).toBeGreaterThan(0)
    expect(ids.length).toBeGreaterThan(tagged.length)
    expect(ids.slice(0, tagged.length).sort()).toEqual(tagged.sort())
    expect(ids.indexOf('collision')).toBeGreaterThan(ids.indexOf('springice'))
    // The same rule on a two-preset list, where the order of the list itself says the opposite.
    const aboutOnly = PRESETS.find((p) => p.id === 'ropeswing')!
    const byTag = PRESETS.find((p) => p.id === 'pendulum')!
    expect(aboutOnly.tags).not.toContain('string')
    expect(byTag.tags).toContain('string')
    expect(searchPresets('string', [aboutOnly, byTag]).map((p) => p.id)).toEqual(['pendulum', 'ropeswing'])
  })

  it('a plural finds the same presets as the word itself', () => {
    expect(searchPresets('springs').map((p) => p.id).sort()).toEqual(searchPresets('spring').map((p) => p.id).sort())
    expect(searchPresets('ropes pulleys').map((p) => p.id)).toEqual(expect.arrayContaining(['atwood', 'lift', 'balance']))
    for (const q of ['collisions', 'pendulums', 'masses']) expect(searchPresets(q).length, q).toBeGreaterThan(0)
  })

  it('matches the start of a word, never the middle of one', () => {
    // "Lifting with a pulley" and "Tug on a slack rope" both say "pair"; that is not air.
    const air = searchPresets('air').map((p) => p.id)
    expect(air).not.toContain('lift')
    expect(air).not.toContain('tug')
    expect(air).toContain('terminal')
    // A half-typed word still finds what it is heading for.
    expect(searchPresets('grav').map((p) => p.id)).toContain('fall')
    expect(searchPresets('swing').map((p) => p.id)).toContain('pendulum')
  })

  it('can search a narrower list than the full preset set', () => {
    const subset = PRESETS.filter((p) => p.topic === 'Oscillation')
    expect(searchPresets('spring', subset).map((p) => p.id).sort()).toEqual(['spring', 'springice'])
    expect(searchPresets('collision', subset)).toEqual([])
  })
})

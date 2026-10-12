import { describe, it, expect } from 'vitest'
import { MATERIAL_LOOKS, lookFor, type Tier, type Pattern, type MaterialLook } from '../src/renderer/src/sim/materialLooks'
import { MATERIALS } from '../src/renderer/src/sim/materials'

describe('materialLooks', () => {
  it('types are imported and checked', () => {
    const _tierCheck: Tier = 'low'
    const _patternCheck: Pattern = 'plain'
    const _lookCheck: Partial<MaterialLook> = {}
    expect(_tierCheck).toBeDefined()
    expect(_patternCheck).toBeDefined()
    expect(_lookCheck).toBeDefined()
  })
  it('every MATERIALS id has a row', () => {
    for (const material of MATERIALS) {
      expect(MATERIAL_LOOKS).toHaveProperty(material.id)
    }
  })

  it('every number within its range', () => {
    for (const id in MATERIAL_LOOKS) {
      const look = MATERIAL_LOOKS[id]
      expect(look.roughness).toBeGreaterThanOrEqual(0)
      expect(look.roughness).toBeLessThanOrEqual(1)
      expect(look.metalness).toBeGreaterThanOrEqual(0)
      expect(look.metalness).toBeLessThanOrEqual(1)
      expect(look.clearcoat).toBeGreaterThanOrEqual(0)
      expect(look.clearcoat).toBeLessThanOrEqual(1)
      expect(look.transmission).toBeGreaterThanOrEqual(0)
      expect(look.transmission).toBeLessThanOrEqual(1)
      expect(look.opacity).toBeGreaterThanOrEqual(0)
      expect(look.opacity).toBeLessThanOrEqual(1)
      expect(look.strength).toBeGreaterThanOrEqual(0)
      expect(look.strength).toBeLessThanOrEqual(1)
      expect(look.scale).toBeGreaterThan(0)
    }
  })

  it('base and tint2 are #rrggbb', () => {
    const hexPattern = /^#[0-9a-f]{6}$/i
    for (const id in MATERIAL_LOOKS) {
      const look = MATERIAL_LOOKS[id]
      expect(look.base).toMatch(hexPattern)
      expect(look.tint2).toMatch(hexPattern)
    }
  })

  it('low is always plain with no clearcoat or transmission', () => {
    for (const id in MATERIAL_LOOKS) {
      const look = lookFor(id, 'low')
      expect(look.pattern).toBe('plain')
      expect(look.strength).toBe(0)
      expect(look.clearcoat).toBe(0)
      expect(look.transmission).toBe(0)
    }
  })

  it('medium has no transmission and glass has opacity < 1 there', () => {
    for (const id in MATERIAL_LOOKS) {
      const look = lookFor(id, 'medium')
      expect(look.transmission).toBe(0)
    }
    const glassLook = lookFor('glass', 'medium')
    expect(glassLook.opacity).toBeLessThan(1)
  })

  it('high equals the row', () => {
    for (const id in MATERIAL_LOOKS) {
      const look = lookFor(id, 'high')
      expect(look).toEqual(MATERIAL_LOOKS[id])
    }
  })

  it('metals have metalness >= 0.5 and non-metals <= 0.1 except lead', () => {
    const metals = ['steel', 'aluminium', 'lead']
    for (const id in MATERIAL_LOOKS) {
      const look = MATERIAL_LOOKS[id]
      if (metals.includes(id)) {
        expect(look.metalness).toBeGreaterThanOrEqual(0.5)
      } else {
        expect(look.metalness).toBeLessThanOrEqual(0.1)
      }
    }
  })

  it('lookFor(unknown, high) equals steels row', () => {
    const look = lookFor('unknown', 'high')
    expect(look).toEqual(MATERIAL_LOOKS['steel'])
  })
})

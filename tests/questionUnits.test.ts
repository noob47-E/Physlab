// Units for question parts: dimension-aware conversion, formatting through the app's own
// formatters, and reading a unit a student typed after a number.

import { describe, expect, it } from 'vitest'
import { convertQuantity, formatQuantity, fromLengthUnit, lengthUnitId, unitFromTail, UNITS, unitsCompatible } from '../src/renderer/src/questions/units'
import type { LengthUnit } from '../src/renderer/src/core/types'
import { UNIT_IDS } from '../src/renderer/src/questions/pqjson'
import { readSource } from './helpers/repo'
import { substitute } from '../src/renderer/src/questions/variables'
import { texQuantity } from '../src/renderer/src/questions/units'

const PRECISION = { decimals: 2, precisionMode: 'dp' as const }

describe('UNITS', () => {
  it('has an entry, with a seven-slot dimension, for every UnitId', () => {
    for (const u of UNIT_IDS) {
      expect(UNITS[u]).toBeDefined()
      expect(UNITS[u].dim).toHaveLength(7)
      expect(UNITS[u].toSI).toBeGreaterThan(0)
    }
  })

  it('keeps rad/s and Hz apart even though both are "per second" in bare SI terms', () => {
    expect(unitsCompatible('rad/s', 'Hz')).toBe(false)
    expect(unitsCompatible('rad', '°')).toBe(true)
  })
})

describe('convertQuantity', () => {
  it('converts within a dimension and returns null across dimensions', () => {
    expect(convertQuantity(50, 'km/h', 'm/s')).toBeCloseTo(13.888888, 5)
    expect(convertQuantity(1, 'km', 'm')).toBe(1000)
    expect(convertQuantity(1, 'kg', 'N')).toBeNull()
    expect(convertQuantity(1, 'm', 's')).toBeNull()
  })

  it('converts °C and K through the offset', () => {
    expect(convertQuantity(0, '°C', 'K')).toBeCloseTo(273.15, 9)
    expect(convertQuantity(273.15, 'K', '°C')).toBeCloseTo(0, 9)
  })

  it('round-trips a value through every pair of units sharing a dimension', () => {
    for (const a of UNIT_IDS) {
      for (const b of UNIT_IDS) {
        if (!unitsCompatible(a, b)) continue
        const there = convertQuantity(3, a, b)
        expect(there).not.toBeNull()
        const back = convertQuantity(there as number, b, a)
        expect(back).toBeCloseTo(3, 6)
      }
    }
  })
})

describe('LengthUnit → UnitId', () => {
  it('maps the metric lengths onto their question unit and leaves unit, in and ft length-only', () => {
    expect(lengthUnitId('m')).toBe('m')
    expect(lengthUnitId('cm')).toBe('cm')
    expect(lengthUnitId('mm')).toBe('mm')
    expect(lengthUnitId('km')).toBe('km')
    for (const u of ['unit', 'in', 'ft'] as LengthUnit[]) expect(lengthUnitId(u)).toBeNull()
  })

  it('converts a scene length into a question unit, inches and feet through metres', () => {
    expect(fromLengthUnit(250, 'cm', 'm')).toBeCloseTo(2.5, 9)
    expect(fromLengthUnit(12, 'in', 'cm')).toBeCloseTo(30.48, 9)
    expect(fromLengthUnit(1, 'ft', 'mm')).toBeCloseTo(304.8, 9)
    expect(fromLengthUnit(1, 'ft', 's')).toBeNull()
    expect(fromLengthUnit(3, 'unit', 'm')).toBeNull()
  })

  it('round-trips every sized scene length through a question unit and back', () => {
    const inMetres: Record<LengthUnit, number | null> = { unit: null, mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048 }
    for (const u of Object.keys(inMetres) as LengthUnit[]) {
      const there = fromLengthUnit(7, u, 'cm')
      const metres = inMetres[u]
      if (metres === null) {
        expect(there).toBeNull()
        continue
      }
      expect(there).toBeCloseTo(7 * metres * 100, 9)
      // Back onto the grid: centimetres to metres, then metres to the scene unit's own size.
      const back = (convertQuantity(there as number, 'cm', 'm') as number) / metres
      expect(back).toBeCloseTo(7, 9)
    }
  })
})

describe('formatQuantity', () => {
  it('appends the label with a space, except a degree sign against the number', () => {
    expect(formatQuantity(12.5, 'm/s', PRECISION)).toBe('12.5 m/s')
    expect(formatQuantity(36.87, '°', PRECISION)).toBe('36.87°')
    expect(formatQuantity(4, 'none', PRECISION)).toBe('4')
  })

  it('goes to the scientific form for a very small or very large known value', () => {
    expect(formatQuantity(1.6e-19, 'C', PRECISION)).toContain('×10^')
    expect(formatQuantity(1.6e-19, 'C', PRECISION)).not.toContain(' 0 C')
    expect(formatQuantity(2.5e7, 'W', PRECISION)).toContain('×10^')
  })

  it('goes scientific for a known value that would otherwise round to 0 at the student\'s precision', () => {
    // The fixed 1e-3 cutoff let 0.0012 m print as "0 m" at 2 dp — the same text as a wrong
    // choice half its size, and the very thing the scientific form exists to prevent.
    expect(formatQuantity(0.0012, 'm', PRECISION)).toBe('1.2×10^-3 m')
    expect(formatQuantity(-0.0012, 'm', PRECISION)).toBe('−1.2×10^-3 m')
    expect(formatQuantity(0, 'm', PRECISION)).toBe('0 m')
    expect(formatQuantity(0.0012, 'm', { decimals: 4, precisionMode: 'dp' })).toBe('0.0012 m')
  })
})

describe('unitFromTail', () => {
  it('reads the longest matching unit off the end, leaving the number text', () => {
    expect(unitFromTail('50 km/h')).toEqual({ value: '50', unit: 'km/h' })
    expect(unitFromTail('12.5m/s')).toEqual({ value: '12.5', unit: 'm/s' })
    expect(unitFromTail('9.8 m/s²')).toEqual({ value: '9.8', unit: 'm/s²' })
    expect(unitFromTail('37°')).toEqual({ value: '37', unit: '°' })
  })

  it('finds no unit in a bare number or an unrecognised tail', () => {
    expect(unitFromTail('12.5')).toEqual({ value: '12.5', unit: null })
    expect(unitFromTail('5*sqrt(2)')).toEqual({ value: '5*sqrt(2)', unit: null })
    expect(unitFromTail('')).toEqual({ value: '', unit: null })
  })
})

describe('one home for unit formatting', () => {
  it('keeps the LaTeX units and the prompt-unit reader in units.ts, not copied into steps or numbas', () => {
    const units = readSource('src/renderer/src/questions/units.ts')
    for (const fn of ['texUnit', 'texQuantity', 'unitInPrompt']) {
      expect(units, fn).toContain(`export function ${fn}(`)
      expect(readSource('src/renderer/src/questions/steps.ts'), fn).not.toContain(`function ${fn}(`)
      expect(readSource('src/renderer/src/questions/numbas.ts'), fn).not.toContain(`function ${fn}(`)
    }
    expect(readSource('src/renderer/src/questions/variables.ts')).not.toContain('function chipNumber(')
  })
})

describe('a chip\'s number', () => {
  it('is formatQuantity\'s, so a small value never reads 0 and a Celsius reading has no space', () => {
    const at2 = { decimals: 2, precisionMode: 'dp' as const }
    const chip = substitute('I = {I}', { I: 0.0024 }, { I: 'A' }, at2)
    expect(chip).toBe(`I = ${formatQuantity(0.0024, 'A', at2)}`)
    expect(chip).not.toBe('I = 0 A')
    expect(substitute('{T}', { T: 20 }, { T: '°C' }, at2)).toBe('20°C')
    expect(substitute('{a}', { a: 30 }, { a: '°' }, at2)).toBe('30°')
    expect(substitute('{n}', { n: 3 }, {}, at2)).toBe('3')
    // The same value inside maths is not 0 either.
    expect(texQuantity(0.0024, 'A', at2)).not.toMatch(/^0\\,/)
    expect(texQuantity(0.0024, 'A', at2)).toContain('10^{')
  })
})

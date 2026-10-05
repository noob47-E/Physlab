// R2-2: a unit typed in a vector is dropped (the rule stays), and the panel says so in one line.

import { describe, expect, it } from 'vitest'
import { droppedUnits, droppedUnitsSentence } from '../src/renderer/src/panels/vectorCalcStore'

describe('droppedUnits: which typed units a vector line leaves out', () => {
  it('finds the unit in a component form', () => {
    expect(droppedUnits('<3 m, 4 m>')).toEqual(['m'])
    expect(droppedUnits('(3 m)\\hat{i}+(4 m)\\hat{j}')).toEqual(['m'])
  })

  it('finds the unit in size ∠ angle', () => {
    expect(droppedUnits('10 N∠30°')).toEqual(['N'])
  })

  it('finds every unit of a power or a quotient, once each', () => {
    expect(droppedUnits('3 m/s^2')).toEqual(['m', 's'])
    expect(droppedUnits('3 m/s^{2}')).toEqual(['m', 's'])
    expect(droppedUnits('3 m/s²')).toEqual(['m', 's'])
    expect(droppedUnits('3 m s⁻²')).toEqual(['ms'])
  })

  it('says nothing about plain numbers', () => {
    expect(droppedUnits('3\\hat{i}+4\\hat{j}')).toBeNull()
    expect(droppedUnits('10∠30°')).toBeNull()
    expect(droppedUnits('<3, 4>')).toBeNull()
    expect(droppedUnits('1.5×10^{-5}\\hat{k}')).toBeNull()
    expect(droppedUnits('')).toBeNull()
  })

  it('does not take another card’s name for a unit (B is a byte to mathjs)', () => {
    expect(droppedUnits('A+2B', ['A', 'B'])).toBeNull()
    expect(droppedUnits('2B', ['A', 'B'])).toBeNull()
    expect(droppedUnits('A×B', ['A', 'B'])).toBeNull()
  })

  it('does not take i, j, k, the angle sign or degrees for units', () => {
    expect(droppedUnits('3i+4j-2k')).toBeNull()
    expect(droppedUnits('5∠90°')).toBeNull()
    expect(droppedUnits('5∠1.5 rad')).toBeNull()
  })

  it('does not fail on a line that cannot be read', () => {
    expect(droppedUnits('3 +')).toBeNull()
  })
})

describe('droppedUnitsSentence', () => {
  it('is one plain line that never names a unit (typed spaces vanish, so "m s" is read as ms)', () => {
    expect(droppedUnitsSentence(['m'])).toBe('Units are left out in Vectors: the unit you typed is ignored, and only the numbers are used.')
    expect(droppedUnitsSentence(['ms'])).not.toMatch(/\bms\b/)
    expect(droppedUnitsSentence(['m', 's'])).toBe('Units are left out in Vectors: the units you typed are ignored, and only the numbers are used.')
  })
})

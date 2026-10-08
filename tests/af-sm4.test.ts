import { describe, expect, it } from 'vitest'
import { tableFrom } from '../src/renderer/src/sim/recording'

describe('P16 and P9: Sandbox captures', () => {
  it('requests a quadratic fit for height against time, and populates reads with 5 sig figs', () => {
    const samples = [
      { t: 1.2, x: 0, y: 5, v: 0, ke: 0, pe: 49.05, p: 0 }
    ]
    const table = tableFrom('Test', samples)
    
    // P16: fit should be quadratic for height against time
    expect(table.plot.fit).toBe('quadratic')
    
    // P9: reads should store the formatted string with trailing zeros
    expect(table.reads![0][0]).toBe('1.2000') // 1.2 to 5 sig figs
    expect(table.reads![0][2]).toBe('5.0000') // 5 to 5 sig figs
    
    // Rows should still contain the numeric values
    expect(table.rows[0][0]).toBe(1.2)
    expect(table.rows[0][2]).toBe(5)
  })
})

describe('Sandbox captures keep every value a number (part head check)', () => {
  it('a reading of 3 × 10⁻⁷ is a number in the row, and the text agrees with the row', () => {
    const table = tableFrom('Test', [{ t: 0.1, x: 3e-7, y: 5.25, v: 1e-9, ke: 0, pe: 0, p: 0 }])
    expect(table.rows[0][1]).toBe(3e-7)
    expect(table.rows[0][3]).toBe(1e-9)
    for (const [c, v] of table.rows[0].entries()) expect(Number(table.reads![0][c]), String(c)).toBe(v)
  })
})

describe('Sandbox captures send every quantity the panel plots (H30)', () => {
  it('has PE and momentum columns, filled from the reading', () => {
    const table = tableFrom('Test', [{ t: 0.1, x: 1, y: 2, v: 3, ke: 4.5, pe: 19.62, p: 3 }])
    expect(table.columns.map((c) => `${c.name} (${c.unit})`)).toEqual(['t (s)', 'x (m)', 'y (m)', 'v (m/s)', 'KE (J)', 'PE (J)', 'p (kg m/s)'])
    expect(table.rows[0]).toEqual([0.1, 1, 2, 3, 4.5, 19.62, 3])
    expect(table.reads![0].length).toBe(7)
  })
})

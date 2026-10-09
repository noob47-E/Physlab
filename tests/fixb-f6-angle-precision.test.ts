import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { toDeg, heading } from '../src/renderer/src/math/vec'
import { fmt } from '../src/renderer/src/math/format'

describe('F6: Vector Properties Angle precision', () => {
  it('heading([4, 3, 0]) in deg formats to 36.87 at 2 dp, but 36.8699 at default 4 dp', () => {
    const deg = toDeg(heading([4, 3, 0]))
    expect(fmt(deg, 4)).toBe('36.8699')
    expect(fmt(deg, 2)).toBe('36.87')
  })

  it('Properties component passes decimals setting to NumField for Angle and Magnitude', () => {
    // Check if the loaded/target Properties.tsx passes decimals to NumField
    const target = process.env.TEST_PATCHED_PROPERTIES 
      ? path.resolve(__dirname, '../patch2/Properties.tsx')
      : path.resolve(__dirname, '../src/renderer/src/panels/Properties.tsx')
    const code = fs.readFileSync(target, 'utf8')
    expect(code).toContain('decimals={decimals}')
  })
})

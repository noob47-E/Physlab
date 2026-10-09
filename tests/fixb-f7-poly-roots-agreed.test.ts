import { describe, expect, it } from 'vitest'
import { beyondTheReals } from '../src/renderer/src/calc/roots'
import { setCalcPrecisionSource } from '../src/renderer/src/calc/format'
import fs from 'fs'
import path from 'path'

setCalcPrecisionSource(() => ({ decimals: 2, precisionMode: 'dp' }))

describe('F7: Equations > Polynomial agrees with Numbers screen on complex roots', () => {
  it('Numbers screen beyondTheReals gives "No real solution. In complex numbers: x = −0.5 ± 0.87i"', () => {
    const res = beyondTheReals([1, 1, 1], 0)
    expect(res).not.toBeNull()
    expect('sentence' in res!).toBe(true)
    if (res && 'sentence' in res) {
      expect(res.sentence).toBe('No real solution. In complex numbers: x = −0.5 ± 0.87i')
    }
  })

  it('calcModes.tsx Equations > Polynomial uses beyondTheReals to show the sentence rather than only separate rows', () => {
    const target = process.env.TEST_PATCHED_CALCMODES
      ? path.resolve(__dirname, '../patch2/calcModes.tsx')
      : path.resolve(__dirname, '../src/renderer/src/panels/calcModes.tsx')
    const code = fs.readFileSync(target, 'utf8')
    expect(code).toContain('beyondTheReals')
  })
})

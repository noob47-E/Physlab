// CW3: two places took a unit off a written measure with a regular expression (render/Labels.tsx's
// point label, panels/ShapeInfo.tsx's sum of the parts' areas). The number writer now gives the
// number alone; these tests prove it writes exactly what the regex left, on a grid of values and
// settings, before the callers move (CLEANUP-PLAN.md CW3: no answer changes).

import { describe, expect, it } from 'vitest'
import { formatMeasure, measureNumber, texMeasure, type MeasureSettings } from '../src/renderer/src/math/format'
import { answerTex } from '../src/renderer/src/math/shapeFormulas'

const VALUES = [0, 1, -1, 0.5, 1 / 3, 2 / 3, Math.PI, Math.SQRT2, 12.345678, -0.000123, 1234567, 1e-7, 2.5e8, 1e12, 7.25]
const SETTINGS: MeasureSettings[] = [
  { decimals: 2, precisionMode: 'dp', unit: 'cm', unitPerSquare: 1, angleUnit: 'deg' },
  { decimals: 4, precisionMode: 'dp', unit: 'm', unitPerSquare: 0.5, angleUnit: 'deg' },
  { decimals: 3, precisionMode: 'sf', unit: 'mm', unitPerSquare: 10, angleUnit: 'rad' },
  { decimals: 0, precisionMode: 'dp', unit: 'km', unitPerSquare: 1000, angleUnit: 'deg' },
  { decimals: 3, precisionMode: 'sf', unit: 'cm', unitPerSquare: 1e9, angleUnit: 'deg' },
  { decimals: 2, precisionMode: 'dp', unit: 'cm', unitPerSquare: 1e-7, angleUnit: 'deg' }
]

describe('a measure written without its unit', () => {
  it('is what the point label got by cutting the unit off formatMeasure', () => {
    for (const s of SETTINGS) for (const v of VALUES) expect(measureNumber(v, 'length', s), `${v} at ${JSON.stringify(s)}`).toBe(formatMeasure(v, 'length', s).replace(/ \S+$/, ''))
  })

  it("is what ShapeInfo got by cutting the unit off the last side of a part's area", () => {
    for (const s of SETTINGS)
      for (const v of VALUES.filter((x) => x >= 0)) {
        const cut = answerTex(v, 'area', s).split('\\approx').pop()!.replace(/\\,\\text\{[^}]*\}(\^\d)?/, '')
        // The cut kept the space after \approx when there was an exact form; KaTeX draws TeX the same with or without it.
        expect(texMeasure(v, 'area', s, false), `${v} at ${JSON.stringify(s)}`).toBe(cut.trim())
      }
  })
})

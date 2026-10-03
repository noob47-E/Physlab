import { describe, expect, it } from 'vitest'
import { fmtLabel, superscriptPowers, type MeasureSettings } from '../src/renderer/src/math/format'
import { tickText } from '../src/renderer/src/render/gridLabels'
import { math, preprocess } from '../src/renderer/src/math/expr'
import { evalNumber, readStated } from '../src/renderer/src/questions/answerText'

// What a student sees can be typed or pasted back (AGENTS.md: revealed answers are marked right), so
// the no-break spaces must read exactly as ordinary ones do, in the command bar and in an answer box.
describe('W18 a shown raised power reads back with its no-break spaces', () => {
  const shown = [superscriptPowers('1.6×10^-19'), fmtLabel(6.02e23, 3), fmtLabel(-2.5e-8, { decimals: 2, precisionMode: 'sf' })]
  const plain = (s: string): string => s.replace(/\u00a0/g, ' ')
  it('the shown text really carries U+00A0', () => {
    for (const s of shown) expect(s).toContain('\u00a0')
  })
  it('the command bar reads the same number', () => {
    for (const s of shown) {
      const a = Number(math.evaluate(preprocess(s)))
      const b = Number(math.evaluate(preprocess(plain(s))))
      expect(a, s).toBe(b)
      expect(Number.isFinite(a), s).toBe(true)
    }
  })
  it('an answer box reads the same number', () => {
    for (const s of shown) {
      const a = evalNumber(s)
      expect(a, s).not.toBeNull()
      expect(a, s).toBe(evalNumber(plain(s)))
    }
  })
  it('a stated value with its uncertainty reads the same', () => {
    const s = `(6.63 ± 0.01)${superscriptPowers('×10^-34')}`
    expect(readStated(s)).toEqual(readStated(plain(s)))
    expect('error' in readStated(s)).toBe(false)
  })
})

const settings = (over: Partial<MeasureSettings> = {}): MeasureSettings =>
  ({ unit: 'unit', unitPerSquare: 1, decimals: 2, precisionMode: 'dp', angleUnit: 'deg', ...over }) as MeasureSettings

describe('W18 a raised power never wraps', () => {
  it('joins the mantissa, × and 10ⁿ with no-break spaces', () => {
    // An ordinary space let a narrow panel break "7.6 ×" from "10⁹ u".
    expect(superscriptPowers('7.6×10^9 u')).toBe('7.6\u00a0×\u00a010⁹ u')
    expect(superscriptPowers('1.49×10^-8')).not.toMatch(/ ×|× /)
  })
})

describe('W19 axis numbers at huge scales', () => {
  it('reads 2 × 10⁹, not 2×10^9, when one grid square is 10⁹ units', () => {
    const text = tickText(2, 1, settings({ unitPerSquare: 1e9 }))
    expect(text).not.toContain('^')
    expect(text).toBe('2\u00a0×\u00a010⁹')
  })
  it('leaves ordinary tick numbers alone', () => {
    expect(tickText(2, 1, settings())).toBe('2')
    expect(tickText(-0.5, 0.5, settings())).toBe('−0.5')
  })
})

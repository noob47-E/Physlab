// Every number on screen goes through here (Rule 4). Setting a measurement by typing it must be
// the exact mirror of reading it, or the drawing drifts a little each time; and a number written
// in the student's precision must read back as the number it was.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  angleFrom,
  angleTo,
  bearingText,
  fmt,
  fmtAngle,
  fmtIJK,
  fmtPoint,
  fmtPrecise,
  fmtSci,
  formatMeasure,
  measureValue,
  notation,
  setNotation,
  tex,
  texMeasure,
  texPrecise,
  toDMS,
  unitSuffix,
  worldValue,
  type MeasureKind,
  type MeasureSettings
} from '../src/renderer/src/math/format'
import type { LengthUnit } from '../src/renderer/src/core/types'

const S: MeasureSettings = { decimals: 2, precisionMode: 'dp', unit: 'cm', unitPerSquare: 1, angleUnit: 'deg' }
const SF = (n: number): MeasureSettings => ({ ...S, precisionMode: 'sf', decimals: n })
const DP = (n: number): MeasureSettings => ({ ...S, precisionMode: 'dp', decimals: n })

/** What a student would type back from the screen: the number before the unit, ASCII minus. */
const readBack = (text: string): number => {
  const m = text.match(/^(−?[\d.]+)(?:×10\^(-?\d+))?/)
  if (!m) return NaN
  const mant = Number(m[1].replace('−', '-'))
  return m[2] ? mant * 10 ** Number(m[2]) : mant
}

// The notation is a mutable global shared by every test file: put it back to the default.
const DEFAULT = { vector: 'arrow', components: 'ijk', direction: 'standard' } as const
beforeEach(() => setNotation(DEFAULT))
afterEach(() => setNotation(DEFAULT))

describe('fmtPrecise', () => {
  it('writes exactly zero as 0 in both modes, and never as −0', () => {
    expect(fmtPrecise(0, DP(3))).toBe('0')
    expect(fmtPrecise(0, SF(3))).toBe('0')
    expect(fmtPrecise(-0, DP(3))).toBe('0')
    expect(fmtPrecise(-0, SF(3))).toBe('0')
    expect(fmtPrecise(0, DP(0))).toBe('0')
    // A small negative that rounds away at this precision is 0 too: a midpoint at −0.0004
    // read "(−0, 5)" and a unit vector "1i − 0j".
    expect(fmt(-0.001, 2)).toBe('0')
    expect(fmtPrecise(-0.004, DP(2))).toBe('0')
    expect(fmtPrecise(-0.4, DP(0))).toBe('0')
    expect(formatMeasure(-0.001, 'length', DP(2))).toBe('0 cm')
    expect(formatMeasure(-0.00001, 'angle', DP(2))).toBe('0°')
    expect(fmtPoint([-0.0004, 5, 0])).toBe('(0, 5)')
    expect(fmtIJK([1, -0.0004, 0])).toBe('1i − 0j')
    expect(tex(-0.001, 2)).toBe('0')
    expect(texPrecise(-0.004, DP(2))).toBe('0')
    // But a negative that survives the rounding keeps its sign.
    expect(fmtPrecise(-0.005, DP(2))).toBe('−0.01')
    expect(fmt(-0.006, 2)).toBe('−0.01')
  })

  it('rounds to decimal places and trims the zeros, keeping a proper minus', () => {
    expect(fmtPrecise(3.14159, DP(2))).toBe('3.14')
    expect(fmtPrecise(2.5, DP(3))).toBe('2.5')
    expect(fmtPrecise(2, DP(4))).toBe('2')
    expect(fmtPrecise(-2.345, DP(2))).toBe('−2.35')
    expect(fmtPrecise(0.005, DP(2))).toBe('0.01')
    expect(fmtPrecise(1234567.891, DP(1))).toBe('1234567.9')
    expect(fmtPrecise(9.999, DP(2))).toBe('10')
  })

  it('keeps the trailing zeros that show significant figures', () => {
    expect(fmtPrecise(2.5, SF(3))).toBe('2.50')
    expect(fmtPrecise(0.5, SF(2))).toBe('0.50')
    expect(fmtPrecise(7, SF(4))).toBe('7.000')
    expect(fmtPrecise(-2.5, SF(3))).toBe('−2.50')
    expect(fmtPrecise(1234.567, SF(3))).toBe('1230')
    expect(fmtPrecise(0.00012345, SF(2))).toBe('0.00012')
    expect(fmtPrecise(99.99, SF(3))).toBe('100')
    // At least one figure, whatever the setting says.
    expect(fmtPrecise(3.7, SF(0))).toBe('4')
  })

  it('goes scientific for the huge and the tiny, with the minus on the mantissa', () => {
    expect(fmtPrecise(6.02214076e23, SF(3))).toBe('6.02×10^23')
    expect(fmtPrecise(6.674e-11, SF(3))).toBe('6.67×10^-11')
    expect(fmtPrecise(-6.674e-11, SF(3))).toBe('−6.67×10^-11')
    expect(fmtPrecise(3e9, DP(2))).toBe('3×10^9')
    expect(fmtPrecise(-3e9, DP(2))).toBe('−3×10^9')
    expect(fmtPrecise(0.00005, DP(2))).toBe('5×10^-5')
    expect(fmtPrecise(-0.00005, DP(2))).toBe('−5×10^-5')
    // The calculator's own formatter writes it the same way, so the two never disagree.
    expect(fmt(-9.5e-11, 1)).toBe('−9.5×10^-11')
  })

  it('keeps the zeros that show significant figures in the scientific form too', () => {
    // A detour through fmt() trimmed them: 3 s.f. of 2.5 read 2.50 but 3 s.f. of 2.5e-7 read 2.5×10^-7.
    expect(fmtPrecise(2.5e-7, SF(3))).toBe('2.50×10^-7')
    expect(fmtPrecise(1.5e-7, SF(3))).toBe('1.50×10^-7')
    expect(fmtPrecise(1.2e10, SF(4))).toBe('1.200×10^10')
    expect(fmtPrecise(2e12, SF(2))).toBe('2.0×10^12')
    expect(fmtPrecise(-2e12, SF(2))).toBe('−2.0×10^12')
    expect(fmtPrecise(1e9, SF(1))).toBe('1×10^9')
    // Either side of the switch to scientific, the count of figures is the same.
    expect(fmtPrecise(1e-6, SF(2))).toBe('0.0000010')
    expect(fmtPrecise(9.9e-7, SF(2))).toBe('9.9×10^-7')
    // The form is chosen after rounding, so a value prints the same as the value it rounds to:
    // 999 999 999.9 at 3 s.f. is 1.00×10^9, and choosing on the raw value used to print it as
    // 1000000000, ten digits for a three-figure setting.
    expect(fmtPrecise(9.9999e8, SF(3))).toBe('1.00×10^9')
    expect(fmtPrecise(999999999.9, SF(3))).toBe('1.00×10^9')
    expect(fmtPrecise(-999999999.9, SF(3))).toBe('−1.00×10^9')
    expect(fmtPrecise(999999999.9, SF(3))).toBe(fmtPrecise(1e9, SF(3)))
    // And a tiny value that rounds up to 10^-6 is written the way 10^-6 is.
    expect(fmtPrecise(9.9999e-7, SF(2))).toBe('0.0000010')
    expect(fmtPrecise(9.99999999e-7, SF(3))).toBe('0.00000100')
    expect(fmtPrecise(9.99e-7, SF(1))).toBe('0.000001')
    expect(fmtPrecise(9.99e-7, SF(1))).toBe(fmtPrecise(1e-6, SF(1)))
    expect(fmtPrecise(0.0000015, SF(2))).toBe('0.0000015')
    expect(texPrecise(1.5e-7, SF(3))).toBe('1.50\\times 10^{-7}')
    expect(texPrecise(-2e12, SF(2))).toBe('-2.0\\times 10^{12}')
    // Decimal places trim as fmt does, so the two writers never disagree.
    expect(fmtPrecise(2.5e-7, DP(4))).toBe('2.5×10^-7')
  })

  it('fmtSci writes any size in the student’s precision, with no noise floor', () => {
    expect(fmtSci(1.6e-19, SF(2))).toBe('1.6×10^-19')
    expect(fmtSci(1.6e-19, SF(3))).toBe('1.60×10^-19')
    expect(fmtSci(-1.6e-19, DP(4))).toBe('−1.6×10^-19')
    expect(fmtSci(12.5, SF(3))).toBe('1.25×10^1')
    expect(fmtSci(12.5, DP(2))).toBe('1.25×10^1')
    expect(fmtSci(0, SF(3))).toBe('0')
    expect(fmtSci(NaN, SF(3))).toBe('undefined')
    expect(fmtSci(-Infinity, SF(3))).toBe('−∞')
  })

  it('reads back as the number it was, to the precision asked for, at every scale', () => {
    const values = [1e-7, 0.00042, 0.5, 1, 3.14159, 42, 1234.5678, 987654321, 1.5e12, 6.02e23]
    for (const v of values) {
      for (const sign of [1, -1]) {
        const x = sign * v
        for (const digits of [1, 2, 3, 4, 6]) {
          const back = readBack(fmtPrecise(x, SF(digits)))
          expect(Math.abs(back - x) / Math.abs(x), `${x} at ${digits} s.f.`).toBeLessThanOrEqual(0.5 * 10 ** (1 - digits) + 1e-12)
        }
        for (const decimals of [0, 2, 4]) {
          const back = readBack(fmtPrecise(x, DP(decimals)))
          const abs = Math.abs(x)
          // Decimal places apply to the plain form; the scientific form keeps that many mantissa digits.
          const allow = abs >= 1e9 || abs < 1e-4 ? abs * 0.5 * 10 ** -decimals : 0.5 * 10 ** -decimals
          expect(Math.abs(back - x), `${x} at ${decimals} d.p.`).toBeLessThanOrEqual(allow + 1e-12)
        }
      }
    }
  })

  it('treats a value below 1e-12 as floating-point noise, on purpose', () => {
    // A point dragged onto the axis must read 0, not 3×10⁻¹⁷.
    expect(fmtPrecise(3e-17, DP(4))).toBe('0')
    expect(fmtPrecise(3e-17, SF(3))).toBe('0')
    expect(fmtPrecise(-1e-13, SF(3))).toBe('0')
  })

  it('says what it cannot write', () => {
    expect(fmtPrecise(NaN, DP(2))).toBe('undefined')
    expect(fmtPrecise(NaN, SF(2))).toBe('undefined')
    expect(fmtPrecise(Infinity, SF(2))).toBe('∞')
    expect(fmtPrecise(-Infinity, DP(2))).toBe('−∞')
  })

  it('has a KaTeX twin with an ASCII minus and a real exponent', () => {
    expect(texPrecise(-2.5, SF(3))).toBe('-2.50')
    expect(texPrecise(6.674e-11, SF(3))).toBe('6.67\\times 10^{-11}')
    expect(texPrecise(-3e9, DP(2))).toBe('-3\\times 10^{9}')
    expect(tex(-1.5e-7, 2)).toBe('-1.5\\times 10^{-7}')
  })
})

describe('measureValue and worldValue are mirrors', () => {
  const units: LengthUnit[] = ['unit', 'mm', 'cm', 'm', 'km', 'in', 'ft']
  const kinds: MeasureKind[] = ['length', 'area', 'volume', 'angle', 'direction', 'number']

  it('goes there and back for every kind, unit and scale', () => {
    for (const unit of units) {
      for (const unitPerSquare of [0.001, 0.25, 1, 2.5, 1000]) {
        const s = { ...S, unit, unitPerSquare }
        for (const kind of kinds) {
          for (const v of [0, 1e-6, 0.3, 7, 123.456, 1e6, -4.2]) {
            const shown = measureValue(v, kind, s)
            expect(worldValue(shown, kind, s), `${kind} ${unit} ×${unitPerSquare} ${v}`).toBeCloseTo(v, 9)
          }
        }
      }
    }
  })

  it('scales lengths, areas and volumes by the right power of the grid scale', () => {
    const s = { ...S, unitPerSquare: 2 }
    expect(measureValue(3, 'length', s)).toBe(6)
    expect(measureValue(3, 'area', s)).toBe(12)
    expect(measureValue(3, 'volume', s)).toBe(24)
    expect(measureValue(3, 'number', s)).toBe(3)
    expect(worldValue(6, 'length', s)).toBe(3)
    expect(worldValue(12, 'area', s)).toBe(3)
    expect(worldValue(24, 'volume', s)).toBe(3)
  })

  it('converts angles to the chosen unit and back, and leaves a bare number alone', () => {
    // The scene offers degrees and radians; grads exist only for the calculator's writers.
    for (const angleUnit of ['deg', 'rad'] as const) {
      const s = { ...S, angleUnit }
      for (const rad of [0, Math.PI / 6, Math.PI / 2, Math.PI, 2 * Math.PI, -0.75, 1e-9, 1e4]) {
        expect(worldValue(measureValue(rad, 'angle', s), 'angle', s)).toBeCloseTo(rad, 9)
        expect(worldValue(measureValue(rad, 'direction', s), 'direction', s)).toBeCloseTo(rad, 9)
        expect(measureValue(rad, 'angle', s)).toBe(angleFrom(rad, angleUnit))
        expect(worldValue(angleFrom(rad, angleUnit), 'angle', s)).toBeCloseTo(angleTo(angleFrom(rad, angleUnit), angleUnit), 12)
      }
    }
    expect(measureValue(Math.PI / 3, 'angle', S)).toBeCloseTo(60, 12)
    expect(angleFrom(Math.PI / 2, 'grad')).toBeCloseTo(100, 12)
    expect(angleTo(100, 'grad')).toBeCloseTo(Math.PI / 2, 12)
    expect(measureValue(1.5, 'angle', { ...S, angleUnit: 'rad' })).toBe(1.5)
    // An angle never picks up the grid scale.
    expect(measureValue(Math.PI, 'angle', { ...S, unitPerSquare: 100 })).toBeCloseTo(180, 12)
  })
})

describe('formatMeasure', () => {
  it('writes the unit for each kind, in the chosen length unit', () => {
    expect(formatMeasure(4, 'length', S)).toBe('4 cm')
    expect(formatMeasure(12, 'area', S)).toBe('12 cm²')
    expect(formatMeasure(8, 'volume', S)).toBe('8 cm³')
    expect(formatMeasure(8, 'number', S)).toBe('8')
    expect(formatMeasure(2, 'length', { ...S, unit: 'm', unitPerSquare: 0.5 })).toBe('1 m')
    expect(formatMeasure(3, 'area', { ...S, unit: 'km', unitPerSquare: 2 })).toBe('12 km²')
    expect(formatMeasure(1, 'length', { ...S, unit: 'unit' })).toBe('1 u')
    expect(formatMeasure(1, 'length', { ...S, unit: 'in' })).toBe('1 in')
    expect(formatMeasure(1, 'length', { ...S, unit: 'ft' })).toBe('1 ft')
    expect(formatMeasure(1, 'length', { ...S, unit: 'mm' })).toBe('1 mm')
  })

  it('writes angles in degrees, radians or grads with the right suffix', () => {
    expect(formatMeasure(Math.PI / 3, 'angle', S)).toBe('60°')
    expect(formatMeasure(Math.PI / 3, 'angle', { ...S, angleUnit: 'rad' })).toBe('1.05 rad')
    expect(fmtAngle(Math.PI / 2, 'grad')).toBe('100 grad')
    expect(unitSuffix('angle', { ...S, angleUnit: 'rad' })).toBe(' rad')
    expect(unitSuffix('direction', { ...S, angleUnit: 'rad' })).toBe(' rad')
    expect(formatMeasure(0, 'angle', S)).toBe('0°')
    expect(formatMeasure(-Math.PI / 4, 'angle', S)).toBe('−45°')
  })

  it('applies significant figures to the converted value, not the world value', () => {
    expect(formatMeasure(1234.567, 'length', SF(3))).toBe('1230 cm')
    expect(formatMeasure(2.5, 'length', SF(3))).toBe('2.50 cm')
    expect(formatMeasure(1, 'length', { ...SF(3), unitPerSquare: 2.5 })).toBe('2.50 cm')
    expect(formatMeasure(Math.PI / 6, 'angle', SF(4))).toBe('30.00°')
    expect(formatMeasure(Math.PI / 6, 'angle', DP(0))).toBe('30°')
  })

  it('writes a direction as a bearing only when bearings are on and the unit is degrees', () => {
    expect(formatMeasure(Math.PI / 6, 'direction', S)).toBe('30°')
    setNotation({ direction: 'bearing' })
    expect(notation().direction).toBe('bearing')
    expect(formatMeasure(Math.PI / 6, 'direction', S)).toBe('N 60° E')
    expect(formatMeasure(Math.PI / 2, 'direction', S)).toBe('N')
    expect(formatMeasure(0, 'direction', S)).toBe('E')
    expect(formatMeasure(Math.PI, 'direction', S)).toBe('W')
    expect(formatMeasure(-Math.PI / 2, 'direction', S)).toBe('S')
    expect(formatMeasure((5 * Math.PI) / 4, 'direction', S)).toBe('S 45° W')
    expect(formatMeasure(Math.atan2(4, 3), 'direction', SF(3))).toBe('N 36.9° E')
    // The corner of a triangle is never a bearing, and neither is a direction in radians.
    expect(formatMeasure(Math.PI / 6, 'angle', S)).toBe('30°')
    expect(formatMeasure(Math.PI / 6, 'direction', { ...S, angleUnit: 'rad' })).toBe('0.52 rad')
    expect(texMeasure(Math.PI / 6, 'direction', S)).toBe('\\text{N 60° E}')
    // A full turn is the same compass point as no turn at all.
    expect(formatMeasure(2 * Math.PI, 'direction', S)).toBe('E')
    expect(bearingText(NaN)).toBe('undefined')
  })

  it('reads back what it wrote, in every unit and mode', () => {
    for (const unit of ['unit', 'cm', 'm', 'km'] as LengthUnit[]) {
      for (const mode of [SF(4), DP(3)]) {
        const s = { ...mode, unit, unitPerSquare: 0.5 }
        for (const v of [0.25, 3, 12.5, 400, 1e7]) {
          for (const kind of ['length', 'area', 'volume'] as MeasureKind[]) {
            const exact = measureValue(v, kind, s)
            const shown = readBack(formatMeasure(v, kind, s))
            // The screen rounds to the precision asked for: 4 s.f. is a relative half-unit in
            // the fourth figure, 3 d.p. is half a thousandth in the shown unit.
            const allow = mode.precisionMode === 'sf' ? Math.abs(exact) * 5e-4 : 5e-4
            expect(Math.abs(shown - exact), `${kind} ${unit} ${v}`).toBeLessThanOrEqual(allow + 1e-12)
            // And the typed-back number lands on the world value to that same precision.
            expect(Math.abs(worldValue(shown, kind, s) - v), `${kind} ${unit} ${v} back`).toBeLessThanOrEqual(worldValue(allow, kind, s) + 1e-12)
          }
        }
      }
    }
    for (const angleUnit of ['deg', 'rad'] as const) {
      const s = { ...SF(5), angleUnit }
      for (const rad of [0.1, Math.PI / 6, 1.234, 3]) {
        const back = worldValue(readBack(formatMeasure(rad, 'angle', s)), 'angle', s)
        expect(Math.abs(back - rad) / rad).toBeLessThan(5e-5)
      }
    }
  })

  it('writes tiny and huge measurements without losing the unit', () => {
    expect(formatMeasure(1e-7, 'length', S)).toBe('1×10^-7 cm')
    expect(formatMeasure(2.5e12, 'area', SF(2))).toBe('2.5×10^12 cm²')
    expect(formatMeasure(-2.5e12, 'length', SF(2))).toBe('−2.5×10^12 cm')
    expect(texMeasure(2.5e12, 'area', SF(2))).toBe('2.5\\times 10^{12}\\,\\text{cm}^2')
    expect(texMeasure(4, 'length', S)).toBe('4\\,\\text{cm}')
    expect(texMeasure(Math.PI / 3, 'angle', S)).toBe('60^\\circ')
    expect(texMeasure(4, 'length', S, false)).toBe('4')
  })
})

describe('the smaller writers', () => {
  it('fmtAngle honours the unit, and bearings when they are on', () => {
    expect(fmtAngle(Math.PI / 4)).toBe('45°')
    expect(fmtAngle(Math.PI / 4, 'rad')).toBe('0.7854 rad')
    expect(fmtAngle(Math.PI / 4, 'grad')).toBe('50 grad')
    expect(fmtAngle(NaN)).toBe('undefined')
    setNotation({ direction: 'bearing' })
    expect(fmtAngle(Math.PI / 4)).toBe('N 45° E')
    expect(fmtAngle(Math.PI / 4, 'rad')).toBe('0.7854 rad')
  })

  it('writes a vector in the chosen notation, in the student’s precision', () => {
    expect(fmtIJK([3, -4, 0])).toBe('3i − 4j')
    expect(fmtIJK([0, 0, 0])).toBe('0')
    expect(fmtIJK([1.23456, 2, 3], SF(3))).toBe('1.23i + 2.00j + 3.00k')
    setNotation({ components: 'pair' })
    expect(fmtIJK([3, -4, 0])).toBe('(3, −4)')
    setNotation({ components: 'polar' })
    expect(fmtIJK([3, 4, 0])).toBe('5 ∠ 53.13°')
    setNotation({ components: 'polar', direction: 'bearing' })
    expect(fmtIJK([3, 4, 0])).toBe('5 ∠ N 36.87° E')
  })

  it('writes degrees, minutes and seconds and carries the seconds properly', () => {
    expect(toDMS(30.5)).toBe('30°30\'0"')
    expect(toDMS(-12.2575)).toBe('−12°15\'27"')
    expect(toDMS(29.999999)).toBe('30°0\'0"')
    expect(toDMS(0)).toBe('0°0\'0"')
  })
})

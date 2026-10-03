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
  fmtLabel,
  fmtPoint,
  fmtPrecise,
  fmtSci,
  formatMeasure,
  measureValue,
  notation,
  roundHalfAway,
  sciExponent,
  setNotation,
  superscriptPowers,
  tex,
  texIJK,
  texMeasure,
  texP,
  texPrecise,
  texSci,
  toDMS,
  toExponentialHalfAway,
  toFixedHalfAway,
  toPrecisionHalfAway,
  unitSuffix,
  worldValue,
  type MeasureKind,
  type MeasureSettings,
  type Precision
} from '../src/renderer/src/math/format'
import type { LengthUnit } from '../src/renderer/src/core/types'
import { calcEng, calcNum } from '../src/renderer/src/calc/format'
import { compareTriangles } from '../src/renderer/src/math/congruence'
import { statedAnswerTex } from '../src/renderer/src/questions/answerKinds'

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
    // read "(−0, 5)" and a unit vector "1i − 0j" (H4: the component that shows as 0 is now left out, "1i").
    expect(fmt(-0.001, 2)).toBe('0')
    expect(fmtPrecise(-0.004, DP(2))).toBe('0')
    expect(fmtPrecise(-0.4, DP(0))).toBe('0')
    expect(formatMeasure(-0.001, 'length', DP(2))).toBe('0 cm')
    expect(formatMeasure(-0.00001, 'angle', DP(2))).toBe('0°')
    expect(fmtPoint([-0.0004, 5, 0])).toBe('(0, 5)')
    expect(fmtIJK([1, -0.0004, 0])).toBe('1i')
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

// A double cannot hold 2.675: it holds 2.67499999999999982…, and toFixed, toPrecision and
// toExponential round that binary value, so a value the student typed or saw ending in 5 rounds
// DOWN — 25.37 ÷ 20 = 1.2685 read 1.268 at 4 s.f. where a scientific calculator shows 1.269. The one rule
// these pin: take the decimal the student saw (the shortest decimal that is the double, cut to
// the 15 significant figures a calculator holds, which only removes binary noise), round THAT
// half away from zero in decimal, and never sign a zero.
describe('P6 — halfway values round half away from zero, as a scientific calculator rounds them', () => {
  // (a) The acceptance cases, through the real formatters.
  it('25.37 ÷ 20 = 1.2685 reads 1.269 at 4 significant figures, as a scientific calculator shows it, not 1.268', () => {
    expect(fmtPrecise(25.37 / 20, SF(4))).toBe('1.269')
  })

  it('2.675 reads 2.68 at 2 decimal places, not 2.67', () => {
    expect(fmt(2.675, 2)).toBe('2.68')
  })

  it('1.005 reads 1.01 at 2 decimal places, not 1', () => {
    expect(fmt(1.005, 2)).toBe('1.01')
  })

  it('−2.675 reads −2.68 at 2 decimal places: away from zero, not towards it', () => {
    expect(fmt(-2.675, 2)).toBe('−2.68')
  })

  it('0.0012345 at 4 significant figures reads 0.001235, and 1.235×10^-3 in scientific form', () => {
    expect(fmtPrecise(0.0012345, SF(4))).toBe('0.001235')
    expect(fmtSci(0.0012345, SF(4))).toBe('1.235×10^-3')
  })

  it('9.9995 at 4 significant figures carries to 10.00, not 9.999', () => {
    expect(fmtPrecise(9.9995, SF(4))).toBe('10.00')
  })

  // (b) The same rule through every other writer.
  it('tex and texPrecise write 2.675 at 2 decimal places as 2.68', () => {
    expect(tex(2.675, 2)).toBe('2.68')
    expect(tex(-2.675, 2)).toBe('-2.68')
    expect(texPrecise(2.675, DP(2))).toBe('2.68')
  })

  it('formatMeasure writes a measured 2.675 at 2 decimal places as 2.68', () => {
    expect(formatMeasure(2.675, 'number', DP(2))).toBe('2.68')
    expect(formatMeasure(2.675, 'length', DP(2))).toBe('2.68 cm')
  })

  it('the scientific form rounds a halfway mantissa up: 1.2685×10^-11 is 1.269×10^-11 in every writer', () => {
    // 1.2685e-11 is stored as 1.26849999999999994e-11. (1.2685e-13 is stored just ABOVE the
    // halfway point, so toExponential already gets it right and it cannot show the fault here.)
    expect(fmtSci(1.2685e-11, DP(3))).toBe('1.269×10^-11')
    expect(texSci(1.2685e-11, DP(3))).toBe('1.269\\times 10^{-11}')
    expect(fmt(1.2685e-11, 3)).toBe('1.269×10^-11')
    expect(tex(1.2685e-11, 3)).toBe('1.269\\times 10^{-11}')
    expect(texPrecise(1.2685e-11, SF(4))).toBe('1.269\\times 10^{-11}')
  })

  it('sciExponent reads the power after the carry: 9.9995×10^-20 at 4 significant figures is 1.000×10^-19', () => {
    expect(fmtSci(9.9995e-20, SF(4))).toBe('1.000×10^-19')
    expect(sciExponent(9.9995e-20, SF(4))).toBe(-19)
  })

  it('toDMS carries 59.995 seconds into the next minute, never showing 59.99″ or 60″', () => {
    // 59.995/3600 degrees is 0°0′59.995″, which at 2 d.p. is 60.00″, so the minute carries. The
    // carry test compares the raw double (59.99499999999999) with 59.995 while fmt rounds the
    // decimal the student sees, so the two must agree or the fixed fmt writes 0°0′60″.
    expect(toDMS(59.995 / 3600)).toBe('0°1\'0"')
  })

  it('toDMS rounds the whole angle before splitting it: 12°34′59.995″ reads 12°35′0″', () => {
    // Splitting off the degrees and minutes first leaves seconds of 59.99499999999776 — noise
    // at the 14th figure, too big for the 15-figure step — which read 12°34′59.99″. The whole
    // angle in seconds is 45299.994999999995, which is 45299.995 to the calculator.
    expect(toDMS(12 + 34 / 60 + 59.995 / 3600)).toBe('12°35\'0"')
    expect(toDMS(-(12 + 34 / 60 + 59.995 / 3600))).toBe('−12°35\'0"')
    // And an angle that rounds to nothing is not signed.
    expect(toDMS(-1e-9)).toBe('0°0\'0"')
  })

  // (c) The calculator's own writers.
  it('calcNum writes 25.37 ÷ 20 at 4 significant figures as 1.269 and 2.675 at 2 decimal places as 2.68', () => {
    expect(calcNum(25.37 / 20, { decimals: 4, precisionMode: 'sf' })).toBe('1.269')
    expect(calcNum(2.675, { decimals: 2, precisionMode: 'dp' })).toBe('2.68')
  })

  it('calcNum rounds the mantissa of a value below 10^-12 half away, carrying a mantissa of 10 into the power', () => {
    expect(calcNum(1.2685e-13, { decimals: 4, precisionMode: 'sf' })).toBe('1.269×10^-13')
    expect(calcNum(9.9995e-13, { decimals: 4, precisionMode: 'sf' })).toBe('1×10^-12')
  })

  it('calcNum’s decimal-places floor (too few figures at 4 d.p.) writes 0.0012345 as 0.001235', () => {
    expect(calcNum(0.0012345, { decimals: 4, precisionMode: 'dp' })).toBe('0.001235')
  })

  it('calcEng writes 1268.5 at 4 significant figures as 1.269×10^3', () => {
    // 1268.5 ÷ 1000 is stored as 1.26849999999999996, the same fault one division later.
    expect(calcEng(1268.5, { decimals: 4, precisionMode: 'sf' })).toBe('1.269×10^3')
  })

  it('calcEng chooses the power of three after rounding: 999.95 at 4 s.f. is 1×10^3, never 1000×10^0', () => {
    expect(calcEng(999.95, { decimals: 4, precisionMode: 'sf' })).toBe('1×10^3')
    expect(calcEng(-999.95, { decimals: 4, precisionMode: 'sf' })).toBe('−1×10^3')
    // The same carry from below a band: 0.00099995 is 999.95×10^-6 unrounded.
    expect(calcEng(0.00099995, { decimals: 4, precisionMode: 'sf' })).toBe('1×10^-3')
    // In decimal places too: 999.996 at 2 places is 1000.00, which is 1×10^3.
    expect(calcEng(999.996, { decimals: 2, precisionMode: 'dp' })).toBe('1×10^3')
    // A carry that stays inside its band keeps the student's places: 99.996 is 100.00.
    expect(calcEng(99.996, { decimals: 2, precisionMode: 'dp' })).toBe('100×10^0')
    expect(calcEng(12345.678, { decimals: 2, precisionMode: 'dp' })).toBe('12.35×10^3')
  })

  // (d) Binary noise from a calculation is absorbed by the 15-figure step.
  it('0.35 × 3 (stored 1.0499999999999998) is 1.05 to the calculator, so it reads 1.1 at 1 decimal place', () => {
    expect(fmt(0.35 * 3, 1)).toBe('1.1')
    expect(fmtPrecise(0.35 * 3, SF(2))).toBe('1.1')
  })

  it('sin 30° (stored 0.49999999999999994) is 0.5, so it reads 1 at 0 decimal places', () => {
    expect(fmt(Math.sin(Math.PI / 6), 0)).toBe('1')
  })

  it('GUARD: 0.1 + 0.2 at 4 significant figures still reads 0.3000', () => {
    expect(fmtPrecise(0.1 + 0.2, SF(4))).toBe('0.3000')
  })

  // (e) No negative zero.
  it('a value that rounds to zero is never signed: −0.0004 at 2 decimal places is 0.00', () => {
    expect(toFixedHalfAway(-0.0004, 2)).toBe('0.00')
    expect(toFixedHalfAway(-0.004, 2)).toBe('0.00')
    expect(toFixedHalfAway(-5e-324, 2)).toBe('0.00')
    // toBe compares with Object.is, so a −0 fails here.
    expect(roundHalfAway(-0.0004, 2)).toBe(0)
  })

  it('GUARD: fmt, tex and fmtPrecise still write −0.0004 at 2 decimal places as 0, never −0', () => {
    expect(fmt(-0.0004, 2)).toBe('0')
    expect(tex(-0.0004, 2)).toBe('0')
    expect(fmtPrecise(-0.0004, DP(2))).toBe('0')
  })

  // (f) The shared helpers themselves. Every expected value is worked by hand from the rule.
  it('roundHalfAway rounds the decimal half away from zero, to places or to significant figures', () => {
    // The number returned is the double the rounded decimal names, so String() prints it back.
    expect(roundHalfAway(2.675, 2)).toBe(2.68)
    expect(roundHalfAway(-2.675, 2)).toBe(-2.68)
    expect(roundHalfAway(1.005, 2)).toBe(1.01)
    expect(roundHalfAway(1.45, 1)).toBe(1.5)
    expect(roundHalfAway(2.5, 0)).toBe(3)
    // Math.round(−2.5) is −2: half away from zero is not half up.
    expect(roundHalfAway(-2.5, 0)).toBe(-3)
    expect(roundHalfAway(0.35 * 3, 1)).toBe(1.1)
    expect(roundHalfAway(25.37 / 20, 4, 'sf')).toBe(1.269)
    expect(roundHalfAway(0.0012345, 4, 'sf')).toBe(0.001235)
    expect(roundHalfAway(9.9995, 4, 'sf')).toBe(10)
    expect(roundHalfAway(123456, 3, 'sf')).toBe(123000)
    expect(roundHalfAway(-123456, 3, 'sf')).toBe(-123000)
  })

  it('toFixedHalfAway writes exactly the places asked, carrying through nines', () => {
    expect(toFixedHalfAway(2.675, 2)).toBe('2.68')
    expect(toFixedHalfAway(-2.675, 2)).toBe('-2.68')
    expect(toFixedHalfAway(1.005, 2)).toBe('1.01')
    expect(toFixedHalfAway(9.995, 2)).toBe('10.00')
    expect(toFixedHalfAway(999.995, 2)).toBe('1000.00')
    expect(toFixedHalfAway(-999.995, 2)).toBe('-1000.00')
    expect(toFixedHalfAway(2, 3)).toBe('2.000')
    expect(toFixedHalfAway(0, 3)).toBe('0.000')
    expect(toFixedHalfAway(2.5, 0)).toBe('3')
    expect(toFixedHalfAway(-2.5, 0)).toBe('-3')
    expect(toFixedHalfAway(0.5, 0)).toBe('1')
    expect(toFixedHalfAway(123456789.125, 2)).toBe('123456789.13')
    expect(toFixedHalfAway(0.35 * 3, 1)).toBe('1.1')
    expect(toFixedHalfAway(5e-324, 2)).toBe('0.00')
  })

  it('toPrecisionHalfAway writes exactly the figures asked, as plain digits and never in exponent form', () => {
    expect(toPrecisionHalfAway(25.37 / 20, 4)).toBe('1.269')
    expect(toPrecisionHalfAway(2.5, 3)).toBe('2.50')
    expect(toPrecisionHalfAway(-2.675, 3)).toBe('-2.68')
    expect(toPrecisionHalfAway(123456, 3)).toBe('123000')
    expect(toPrecisionHalfAway(9.9995, 4)).toBe('10.00')
    expect(toPrecisionHalfAway(999.95, 4)).toBe('1000')
    expect(toPrecisionHalfAway(0.0012345, 4)).toBe('0.001235')
    expect(toPrecisionHalfAway(0.000099995, 4)).toBe('0.0001000')
    expect(toPrecisionHalfAway(1.2345e-7, 3)).toBe('0.000000123')
    expect(toPrecisionHalfAway(6.02214076e23, 4)).toBe('6022' + '0'.repeat(20))
  })

  it('toExponentialHalfAway writes as toExponential does, and a mantissa that reaches 10 moves the power', () => {
    expect(toExponentialHalfAway(1.2685e-13, 3)).toBe('1.269e-13')
    expect(toExponentialHalfAway(1.2685e-11, 3)).toBe('1.269e-11')
    expect(toExponentialHalfAway(6.02214076e23, 3)).toBe('6.022e+23')
    expect(toExponentialHalfAway(9.9995e-20, 3)).toBe('1.000e-19')
    expect(toExponentialHalfAway(9.9995, 3)).toBe('1.000e+1')
    expect(toExponentialHalfAway(-2.675, 2)).toBe('-2.68e+0')
    expect(toExponentialHalfAway(123456, 0)).toBe('1e+5')
    expect(toExponentialHalfAway(0, 2)).toBe('0.00e+0')
    // The 15-figure step must work on digits: 1.79769313486232e308 as a number is Infinity.
    expect(toExponentialHalfAway(1.7976931348623157e308, 3)).toBe('1.798e+308')
    expect(toExponentialHalfAway(5e-324, 0)).toBe('5e-324')
  })

  // (g) The ± form of a stated answer rounds by its own fixed places.
  it('statedAnswerTex rounds a value halfway at the uncertainty’s place up: 2.675 ± 0.03 is 2.68 ± 0.03', () => {
    expect(statedAnswerTex(2.675, 0.03, 'none', DP(2))).toBe('2.68 \\pm 0.03')
    // The shared power of ten: 2.675×10^6 ÷ 10^6 is stored as 2.67499999999999982.
    expect(statedAnswerTex(2.675e6, 3e4, 'none', DP(2))).toBe('\\left(2.68 \\pm 0.03\\right)\\times 10^{6}')
  })

  it('statedAnswerTex rounds a halfway uncertainty up to its one figure: 0.045 is 0.05', () => {
    expect(statedAnswerTex(1.2, 0.045, 'none', DP(2))).toBe('1.20 \\pm 0.05')
  })

  it('statedAnswerTex reads the uncertainty’s first figure from the decimal, not from the division by the shared power', () => {
    // 2×10^-24 ÷ 10^-23 is stored 0.19999999999999998: its first figure is 2, so one figure is
    // kept — it read (−7.08 ± 0.20)×10^-23.
    expect(statedAnswerTex(-7.0799462e-23, 2e-24, 'none', DP(2))).toBe('\\left(-7.1 \\pm 0.2\\right)\\times 10^{-23}')
    // 1×10^-29 ÷ 10^-26 is stored 0.0009999999999999998: its first figure is 1, so two figures
    // are kept — it read (5.300 ± 0.001)×10^-26.
    expect(statedAnswerTex(5.3e-26, 1e-29, 'none', DP(2))).toBe('\\left(5.3000 \\pm 0.0010\\right)\\times 10^{-26}')
  })

  // (h) Congruence reasons written without the caller's formatter.
  it('compareTriangles writes a 2.675 side as 2.68 when no length formatter is passed', () => {
    const c = compareTriangles(
      { names: ['A', 'B', 'C'], pts: [[0, 0, 0], [2.675, 0, 0], [0, 4, 0]] },
      { names: ['D', 'E', 'F'], pts: [[0, 0, 0], [-2.675, 0, 0], [0, 4, 0]] }
    )
    expect(c.test).toBe('SSS')
    expect(c.reasons.find((r) => r.startsWith('AB = DE ='))).toBe('AB = DE = 2.68')
  })
})

// The P6 acceptance table: 46 cases recomputed by hand from the written definition (Step 1: the
// shortest decimal JavaScript prints, cut to 15 significant figures half away from zero when it
// has more; Step 2: that decimal rounded half away from zero, with carries; a zero never signed)
// by GLM-5.3 and, separately, DeepSeek V4 Pro, never from this code. Both answered every row the
// same, and so did the part head's own working (.crew/p6-table-*.md in the part's worktree).
describe('P6 — the rounding rule against a table recomputed by the crew from its definition', () => {
  const TABLE: [id: number, fn: 'FIXED' | 'PREC' | 'EXP', input: string, n: number, want: string][] = [
    [1, 'FIXED', '2.675', 2, '2.68'],
    [2, 'FIXED', '-2.675', 2, '-2.68'],
    [3, 'FIXED', '1.005', 2, '1.01'],
    [4, 'FIXED', '0.125', 2, '0.13'],
    [5, 'FIXED', '0.135', 2, '0.14'],
    [6, 'FIXED', '1.45', 1, '1.5'],
    [7, 'FIXED', '8.345', 2, '8.35'],
    [8, 'FIXED', '0.045', 2, '0.05'],
    [9, 'FIXED', '1.0499999999999998', 1, '1.1'],
    [10, 'FIXED', '0.30000000000000004', 2, '0.30'],
    [11, 'FIXED', '-0.0004', 2, '0.00'],
    [12, 'FIXED', '-0.005', 2, '-0.01'],
    [13, 'FIXED', '0.5', 0, '1'],
    [14, 'FIXED', '2.5', 0, '3'],
    [15, 'FIXED', '-0.5', 0, '-1'],
    [16, 'FIXED', '999.995', 2, '1000.00'],
    [17, 'FIXED', '0.49999999999999994', 0, '1'],
    [18, 'FIXED', '12345.6789', 3, '12345.679'],
    [19, 'FIXED', '1e-7', 3, '0.000'],
    [20, 'FIXED', '4.999999999999999', 2, '5.00'],
    [21, 'PREC', '1.2685', 4, '1.269'],
    [22, 'PREC', '9.9995', 4, '10.00'],
    [23, 'PREC', '0.0012345', 4, '0.001235'],
    [24, 'PREC', '2.5', 3, '2.50'],
    [25, 'PREC', '123456', 3, '123000'],
    [26, 'PREC', '0.000123456', 2, '0.00012'],
    [27, 'PREC', '99.95', 3, '100'],
    [28, 'PREC', '-1.2685', 4, '-1.269'],
    [29, 'PREC', '4.35', 2, '4.4'],
    [30, 'PREC', '1.0000000000000002', 3, '1.00'],
    [31, 'PREC', '0.30000000000000004', 1, '0.3'],
    [32, 'PREC', '1.2674999999999998', 4, '1.268'],
    [33, 'PREC', '0.9995', 3, '1.00'],
    [34, 'PREC', '25.365', 4, '25.37'],
    [35, 'EXP', '1.2685e-13', 3, '1.269e-13'],
    [36, 'EXP', '6.02214076e+23', 3, '6.022e+23'],
    [37, 'EXP', '9.9995e-20', 3, '1.000e-19'],
    [38, 'EXP', '1.6e-19', 2, '1.60e-19'],
    [39, 'EXP', '-0.00012345', 3, '-1.235e-4'],
    [40, 'EXP', '2.5e-7', 0, '3e-7'],
    [41, 'EXP', '299792458', 2, '3.00e+8'],
    [42, 'EXP', '5e-324', 2, '5.00e-324'],
    [43, 'EXP', '1.7976931348623157e+308', 3, '1.798e+308'],
    [44, 'EXP', '0.30000000000000004', 3, '3.000e-1'],
    [45, 'EXP', '9.5e-13', 0, '1e-12'],
    [46, 'EXP', '0', 2, '0.00e+0']
  ]
  const write = { FIXED: toFixedHalfAway, PREC: toPrecisionHalfAway, EXP: toExponentialHalfAway }

  it('every input is the very string JavaScript prints for its number, so the table tests the doubles it names', () => {
    for (const [id, , input] of TABLE) expect(String(Number(input)), `case ${id}`).toBe(input)
  })

  it('every case comes out as the crew worked it out by hand', () => {
    const got = TABLE.map(([id, fn, input, n]) => `${id} ${fn}(${input}, ${n}) = ${write[fn](Number(input), n)}`)
    expect(got).toEqual(TABLE.map(([id, fn, input, n, want]) => `${id} ${fn}(${input}, ${n}) = ${want}`))
  })
})

// ---------------------------------------------------------------------------
// P-NUM (P3V6, H1–H4): five located faults in the number writers, each one reachable by a student:
// a label drawn on the canvas, a revealed ± answer, a KaTeX line, a number just under 10⁹, and a
// vector with a component that rounds to nothing. The expected strings were worked out from the
// rules above (rounding half away from zero, the 10⁻¹² noise floor, the 10⁹ switch), not copied
// from what the code printed.
// ---------------------------------------------------------------------------

/** The raised digits and minus a label uses, as plain characters — read here, independently of the code under test. */
const RAISED: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' }

/** A label turned back into what fmt writes: "\u00a0×\u00a010⁻⁸" becomes "×10^-8". */
const caretForm = (label: string): string =>
  label.replace(/\u00a0×\u00a010([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (_all, raised: string) => `×10^${[...raised].map((c) => RAISED[c]).join('')}`)

/** Every size, both signs, awkward mantissas and the edge doubles: what the label writers must survive. */
const sweepValues = (): number[] => {
  const out: number[] = [0, -0, NaN, Infinity, -Infinity, 5e-324, 1.7976931348623157e308, 999999999.996, 999999999.5, 0.000099999, 0.00009999]
  for (const mantissa of [1, 1.5, 2.5, 5.55555, 9.9995, 9.99999999]) {
    for (let e = -14; e <= 24; e++) for (const sign of [1, -1]) out.push(sign * Number(`${mantissa}e${e}`))
    for (const e of [-300, -100, 100, 300]) out.push(Number(`${mantissa}e${e}`))
  }
  return out
}
const SWEEP_PRECISIONS: Precision[] = [0, 1, 2, 3, 4, 6, ...[1, 2, 3, 4, 6].map((n) => SF(n)), ...[0, 2, 4].map((n) => DP(n))]

describe('P3V6 — a plain-text number with no caret: fmtLabel and superscriptPowers', () => {
  it('fmtLabel raises the power of ten, negative or two or three digits long: 1.49\u00a0×\u00a010⁻⁸, 6.02\u00a0×\u00a010²³', () => {
    expect(fmtLabel(1.49e-8, 2)).toBe('1.49\u00a0×\u00a010⁻⁸')
    expect(fmtLabel(-8.89e19, DP(2))).toBe('−8.89\u00a0×\u00a010¹⁹')
    expect(fmtLabel(6.02e23, 2)).toBe('6.02\u00a0×\u00a010²³')
    expect(fmtLabel(-6.02e23, 2)).toBe('−6.02\u00a0×\u00a010²³')
    expect(fmtLabel(1.49e-12, 2)).toBe('1.49\u00a0×\u00a010⁻¹²')
    expect(fmtLabel(1e100, 2)).toBe('1\u00a0×\u00a010¹⁰⁰')
    expect(fmtLabel(-1.5e300, 2)).toBe('−1.5\u00a0×\u00a010³⁰⁰')
    expect(fmtLabel(3e9, DP(2))).toBe('3\u00a0×\u00a010⁹')
  })

  it('fmtLabel keeps the zeros that show significant figures: 2.5×10⁻⁷ at 3 s.f. is 2.50\u00a0×\u00a010⁻⁷', () => {
    expect(fmtLabel(2.5e-7, SF(3))).toBe('2.50\u00a0×\u00a010⁻⁷')
    expect(fmtLabel(2.5, SF(3))).toBe('2.50')
    expect(fmtLabel(123456, SF(3))).toBe('123000')
    expect(fmtLabel(-6.674e-11, SF(3))).toBe('−6.67\u00a0×\u00a010⁻¹¹')
    expect(fmtLabel(1.2e10, SF(4))).toBe('1.200\u00a0×\u00a010¹⁰')
    expect(fmtLabel(6.02214076e23, SF(3))).toBe('6.02\u00a0×\u00a010²³')
    // The form is chosen after rounding: 999 999 999.996 at 2 s.f. is 1.0\u00a0×\u00a010⁹.
    expect(fmtLabel(999999999.996, SF(2))).toBe('1.0\u00a0×\u00a010⁹')
  })

  it('fmtLabel in decimal places trims the zeros, as fmt does', () => {
    expect(fmtLabel(2.5e-7, DP(4))).toBe('2.5\u00a0×\u00a010⁻⁷')
    expect(fmtLabel(0.000001, DP(2))).toBe('1\u00a0×\u00a010⁻⁶')
    expect(fmtLabel(-0.00005, DP(2))).toBe('−5\u00a0×\u00a010⁻⁵')
    expect(fmtLabel(2.5, DP(3))).toBe('2.5')
    expect(fmtLabel(5, DP(2))).toBe('5')
  })

  it('fmtLabel writes a number that needs no power exactly as fmt does: same rounding, same minus, 3 places by default', () => {
    expect(fmtLabel(2.675, 2)).toBe('2.68')
    expect(fmtLabel(-2.5, 0)).toBe('−3')
    expect(fmtLabel(0, 3)).toBe('0')
    expect(fmtLabel(-0, 2)).toBe('0')
    expect(fmtLabel(-0.0004, 2)).toBe('0')
    expect(fmtLabel(12345.678, 2)).toBe('12345.68')
    expect(fmtLabel(1.23456)).toBe('1.235')
    expect(fmtLabel(1.23456)).toBe(fmt(1.23456, 3))
    expect(fmtLabel(6.02e23)).toBe('6.02\u00a0×\u00a010²³')
  })

  it('fmtLabel writes anything below the 10⁻¹² noise floor as 0, as fmt does, so a dragged point shows no power', () => {
    expect(fmtLabel(5e-13, 3)).toBe('0')
    expect(fmtLabel(1e-300, 2)).toBe('0')
    expect(fmtLabel(9.9995e-20, 3)).toBe('0')
    expect(fmtLabel(-1e-13, DP(4))).toBe('0')
    expect(fmtLabel(3e-17, SF(3))).toBe('0')
    // The first value on the right side of the floor keeps its power.
    expect(fmtLabel(1e-12, 2)).toBe('1\u00a0×\u00a010⁻¹²')
  })

  it('fmtLabel says what it cannot write, as fmt does', () => {
    expect(fmtLabel(NaN, 3)).toBe('undefined')
    expect(fmtLabel(NaN, SF(3))).toBe('undefined')
    expect(fmtLabel(Infinity, 3)).toBe('∞')
    expect(fmtLabel(-Infinity, 3)).toBe('−∞')
    expect(fmtLabel(Infinity, SF(3))).toBe('∞')
    expect(fmtLabel(-Infinity, DP(2))).toBe('−∞')
  })

  it('fmtLabel never writes a caret, and is what fmt or fmtPrecise write once its power is turned back (a sweep of both modes)', () => {
    const bad: string[] = []
    let withPower = 0
    for (const v of sweepValues()) {
      for (const p of SWEEP_PRECISIONS) {
        const label = fmtLabel(v, p)
        const plain = typeof p === 'number' ? fmt(v, p) : fmtPrecise(v, p)
        if (label.includes('^')) bad.push(`${v} @ ${JSON.stringify(p)}: a caret in "${label}"`)
        else if (caretForm(label) !== plain) bad.push(`${v} @ ${JSON.stringify(p)}: "${label}" is not "${plain}"`)
        if (plain.includes('×')) withPower++
      }
    }
    expect(bad).toEqual([])
    // The sweep did reach the scientific form thousands of times, so the check above is not empty.
    expect(withPower).toBeGreaterThan(1000)
  })

  it('superscriptPowers rewrites every ×10^e, with all ten raised digits and the raised minus', () => {
    expect(superscriptPowers('1.5×10^-7')).toBe('1.5\u00a0×\u00a010⁻⁷')
    expect(superscriptPowers('−2×10^1234567890')).toBe('−2\u00a0×\u00a010¹²³⁴⁵⁶⁷⁸⁹⁰')
    expect(superscriptPowers('1×10^-1234567890')).toBe('1\u00a0×\u00a010⁻¹²³⁴⁵⁶⁷⁸⁹⁰')
    expect(superscriptPowers('5.00×10^0')).toBe('5.00\u00a0×\u00a010⁰')
    expect(superscriptPowers('(3×10^8, −4×10^-9)')).toBe('(3\u00a0×\u00a010⁸, −4\u00a0×\u00a010⁻⁹)')
  })

  it('superscriptPowers works on the lines the vector and point writers compose from fmt', () => {
    expect(superscriptPowers(fmtIJK([1.49e-8, 3e10, 0], 2))).toBe('1.49\u00a0×\u00a010⁻⁸i + 3\u00a0×\u00a010¹⁰j')
    expect(superscriptPowers(fmtPoint([1.49e-8, -3e10, 0], 2))).toBe('(1.49\u00a0×\u00a010⁻⁸, −3\u00a0×\u00a010¹⁰)')
    setNotation({ components: 'column' })
    expect(superscriptPowers(fmtIJK([1.49e-8, 3e10, 0], 2))).toBe('[1.49\u00a0×\u00a010⁻⁸; 3\u00a0×\u00a010¹⁰]')
  })

  it('superscriptPowers leaves everything else alone: x^2, LaTeX powers, e-notation, a power already raised', () => {
    for (const same of ['x^2', '2^10', 'a^-1', '10^3', '3×10^x', 'ab×10', '\\times 10^{-7}', '1.5\\times 10^{-7}', '1.23e-7', '1E+5', '1.5\u00a0×\u00a010⁻⁷', 'no power here', '', '−3.5']) {
      expect(superscriptPowers(same), same).toBe(same)
    }
    expect(superscriptPowers('x^2 = 1.5×10^-7')).toBe('x^2 = 1.5\u00a0×\u00a010⁻⁷')
  })

  it('superscriptPowers run twice changes nothing', () => {
    for (const text of ['1.5×10^-7', '(3×10^8, −4×10^-9)', 'x^2 = 1.5×10^-7', 'plain', fmtIJK([1.49e-8, 3e10, 0], 2), fmtSci(2.5e-7, SF(3)), fmtSci(5, SF(3))]) {
      const once = superscriptPowers(text)
      expect(superscriptPowers(once), text).toBe(once)
    }
  })

  it('superscriptPowers leaves no caret in anything fmt, fmtPrecise or fmtSci wrote (a sweep of both modes)', () => {
    const bad: string[] = []
    for (const v of sweepValues()) {
      for (const p of SWEEP_PRECISIONS) {
        const s = typeof p === 'number' ? DP(p) : p
        for (const text of [typeof p === 'number' ? fmt(v, p) : fmtPrecise(v, p), fmtSci(v, s)]) {
          const raised = superscriptPowers(text)
          if (raised.includes('^')) bad.push(`${v} @ ${JSON.stringify(p)}: a caret in "${raised}"`)
          else if (superscriptPowers(raised) !== raised) bad.push(`${v} @ ${JSON.stringify(p)}: "${raised}" changes on a second pass`)
        }
      }
    }
    expect(bad).toEqual([])
  })
})

describe('H1 — statedAnswerTex rounds the value at the uncertainty’s own place, even when that place is the tens or hundreds', () => {
  const s = DP(2)

  it('889.3 ± 220 is 900 ± 200, not 889 ± 200 (the value to the same place as the uncertainty)', () => {
    expect(statedAnswerTex(889.3, 220, 'none', s)).toBe('900 \\pm 200')
    expect(statedAnswerTex(889.3, 96, 'none', s)).toBe('900 \\pm 100')
    expect(statedAnswerTex(889.3, 2500, 'none', s)).toBe('1000 \\pm 3000')
  })

  it('an uncertainty under 10 leaves the value as it was: 889.3 ± 15, 0.559146 ± 0.03, 6.6261×10⁻³⁴ ± 1.2×10⁻³⁷', () => {
    expect(statedAnswerTex(889.3, 15, 'none', s)).toBe('889 \\pm 15')
    expect(statedAnswerTex(0.559146, 0.03, 'none', s)).toBe('0.56 \\pm 0.03')
    expect(statedAnswerTex(6.6261e-34, 1.2e-37, 'none', s)).toBe('\\left(6.6261 \\pm 0.0012\\right)\\times 10^{-34}')
  })

  it('a value that rounds away to nothing is 0, never −0: 30 ± 200 and −30 ± 200', () => {
    expect(statedAnswerTex(30, 200, 'none', s)).toBe('0 \\pm 200')
    expect(statedAnswerTex(-30, 200, 'none', s)).toBe('0 \\pm 200')
  })

  it('a negative value that survives its rounding keeps its sign: −889.3 ± 220 is −900 ± 200', () => {
    expect(statedAnswerTex(-889.3, 220, 'none', s)).toBe('-900 \\pm 200')
  })

  it('an uncertainty of 110 keeps 2 figures but its last one is the tens: 889.3 ± 110 is 890 ± 110', () => {
    expect(statedAnswerTex(889.3, 110, 'none', s)).toBe('890 \\pm 110')
  })

  it('a halfway value rounds away from zero at a negative place: 1250 ± 200 is 1300 ± 200, and −1250 ± 200 is −1300 ± 200', () => {
    expect(statedAnswerTex(1250, 200, 'none', s)).toBe('1300 \\pm 200')
    expect(statedAnswerTex(-1250, 200, 'none', s)).toBe('-1300 \\pm 200')
  })

  it('does not depend on the student’s own precision, and still carries its unit', () => {
    expect(statedAnswerTex(889.3, 220, 'none', SF(3))).toBe('900 \\pm 200')
    expect(statedAnswerTex(889.3, 220, 'none', DP(0))).toBe('900 \\pm 200')
    expect(statedAnswerTex(889.3, 220, 'm', s)).toBe('\\left(900 \\pm 200\\right)\\,\\mathrm{m}')
  })
})

describe('H2 — texPrecise and texSci write a number that is not finite the way tex writes it', () => {
  it('texPrecise writes undefined and the infinities as KaTeX, with an ASCII minus', () => {
    for (const s of [DP(2), SF(3)]) {
      expect(texPrecise(NaN, s)).toBe('\\text{undefined}')
      expect(texPrecise(Infinity, s)).toBe('\\infty')
      expect(texPrecise(-Infinity, s)).toBe('-\\infty')
    }
  })

  it('texSci writes the same', () => {
    for (const s of [DP(2), SF(3)]) {
      expect(texSci(NaN, s)).toBe('\\text{undefined}')
      expect(texSci(Infinity, s)).toBe('\\infty')
      expect(texSci(-Infinity, s)).toBe('-\\infty')
    }
  })

  it('texMeasure carries them through with the unit, and a bare number has none', () => {
    expect(texMeasure(NaN, 'length', S)).toBe('\\text{undefined}\\,\\text{cm}')
    expect(texMeasure(Infinity, 'length', S)).toBe('\\infty\\,\\text{cm}')
    expect(texMeasure(-Infinity, 'length', S)).toBe('-\\infty\\,\\text{cm}')
    expect(texMeasure(Infinity, 'area', S)).toBe('\\infty\\,\\text{cm}^2')
    expect(texMeasure(NaN, 'number', S)).toBe('\\text{undefined}')
  })

  it('agrees with tex, and no plain-text ∞ or U+2212 minus reaches KaTeX', () => {
    for (const v of [NaN, Infinity, -Infinity]) {
      for (const s of [DP(2), SF(3), SF(1)]) {
        expect(texPrecise(v, s)).toBe(tex(v))
        expect(texSci(v, s)).toBe(tex(v))
        expect(texPrecise(v, s)).not.toMatch(/[∞−]/)
        expect(texSci(v, s)).not.toMatch(/[∞−]/)
      }
    }
  })

  it('reaches KaTeX the same way through a vector: an infinite component is \\infty, not ∞', () => {
    expect(texIJK([Infinity, 1, 0], DP(2))).toBe('\\infty\\hat{i} + 1\\hat{j}')
  })

  it('leaves a finite number as it was', () => {
    expect(texSci(0, SF(3))).toBe('0')
    expect(texSci(1.6e-19, SF(2))).toBe('1.6\\times 10^{-19}')
    expect(texSci(-1.6e-19, DP(4))).toBe('-1.6\\times 10^{-19}')
    expect(texPrecise(-2.5, SF(3))).toBe('-2.50')
    expect(texPrecise(6.674e-11, SF(3))).toBe('6.67\\times 10^{-11}')
  })
})

describe('H3 — fmt and tex choose plain or scientific on the number as it will be shown', () => {
  it('999 999 999.996 at 2 decimal places is 1×10^9, as fmtPrecise writes it, not 1000000000', () => {
    expect(fmt(999999999.996, 2)).toBe('1×10^9')
    expect(fmt(-999999999.996, 2)).toBe('−1×10^9')
    expect(tex(999999999.996, 2)).toBe('1\\times 10^{9}')
    expect(tex(-999999999.996, 2)).toBe('-1\\times 10^{9}')
    expect(fmtPrecise(999999999.996, DP(2))).toBe('1×10^9')
    expect(texPrecise(999999999.996, DP(2))).toBe('1\\times 10^{9}')
    // It prints the way the number it rounds to prints.
    expect(fmt(999999999.996, 2)).toBe(fmt(1e9, 2))
    expect(tex(999999999.996, 2)).toBe(tex(1e9, 2))
  })

  it('it is the rounded value that counts: one that stays under 10⁹ is still plain, one that reaches it is not', () => {
    expect(fmt(999999999.4, 0)).toBe('999999999')
    expect(fmt(999999999.5, 0)).toBe('1×10^9')
    expect(fmt(999999999.994, 2)).toBe('999999999.99')
    expect(fmt(999999999.995, 2)).toBe('1×10^9')
    expect(fmt(999999999.996, 3)).toBe('999999999.996')
    expect(tex(999999999.4, 0)).toBe('999999999')
    expect(tex(999999999.5, 0)).toBe('1\\times 10^{9}')
    // The default is 4 places, so the ten figures of this one are all shown, until the fifth decimal carries.
    expect(fmt(999999999.9999)).toBe('999999999.9999')
    expect(fmt(999999999.99996)).toBe('1×10^9')
  })

  it('a value already at or over 10⁹ stays scientific', () => {
    expect(fmt(1e9, 2)).toBe('1×10^9')
    expect(fmt(1234567890, 2)).toBe('1.23×10^9')
    expect(tex(1234567890, 2)).toBe('1.23\\times 10^{9}')
  })

  it('the lower threshold stays on the number as it is: 0.000099 at 4 places keeps its power of ten', () => {
    expect(fmt(0.000099, 4)).toBe('9.9×10^-5')
    expect(fmt(0.00009999, 4)).toBe('9.999×10^-5')
    expect(fmt(0.0001, 4)).toBe('0.0001')
    expect(tex(0.000099, 4)).toBe('9.9\\times 10^{-5}')
    expect(tex(0.0001, 4)).toBe('0.0001')
    // Below 10⁻⁴ is below, whatever the mantissa does: this one carries to 1×10^-4.
    expect(fmt(0.000099999, 2)).toBe('1×10^-4')
    expect(tex(0.000099999, 2)).toBe('1\\times 10^{-4}')
  })
})

describe('H4 — a component that rounds to zero is left out of i, j, k form, and texP puts no brackets round a zero', () => {
  it('fmtIJK drops a component whose shown size is 0, as it drops an exact zero: 1i, not 1i − 0j', () => {
    expect(fmtIJK([1, -0.0004, 0], 3)).toBe('1i')
    expect(fmtIJK([1, 0.0004, 0], 3)).toBe('1i')
    expect(fmtIJK([-0.0004, 1, 0], 3)).toBe('1j')
    expect(fmtIJK([0.0004, 1, -2], 3)).toBe('1j − 2k')
    expect(fmtIJK([1, 2, -0.0004], 3)).toBe('1i + 2j')
    expect(fmtIJK([3, -0.004, 5], DP(2))).toBe('3i + 5k')
  })

  it('a vector whose every component rounds to zero is 0', () => {
    expect(fmtIJK([0.0004, -0.0004, 0.0004], 3)).toBe('0')
    expect(fmtIJK([-0.4, 0, 0], DP(0))).toBe('0')
    expect(fmtIJK([0, 0, 0])).toBe('0')
  })

  it('a component that survives its rounding keeps its sign and is written', () => {
    expect(fmtIJK([1, -0.0006, 0], 3)).toBe('1i − 0.001j')
    expect(fmtIJK([1, -0.0004, 0], 4)).toBe('1i − 0.0004j')
    expect(fmtIJK([3, -4, 0])).toBe('3i − 4j')
  })

  it('texIJK does the same', () => {
    expect(texIJK([1, -0.0004, 0], 3)).toBe('1\\hat{i}')
    expect(texIJK([-0.0004, 1, 0], 3)).toBe('1\\hat{j}')
    expect(texIJK([1, 2, -0.0004], DP(2))).toBe('1\\hat{i} + 2\\hat{j}')
    expect(texIJK([0.0004, -0.0004, 0], 3)).toBe('\\vec{0}')
    expect(texIJK([0, 0, 0])).toBe('\\vec{0}')
    expect(texIJK([1, -0.0006, 0], 3)).toBe('1\\hat{i} - 0.001\\hat{j}')
  })

  it('the pair, column and polar forms are as they were: fmt already writes an unsigned 0 there', () => {
    setNotation({ components: 'pair' })
    expect(fmtIJK([1, -0.0004, 0], 3)).toBe('(1, 0)')
    expect(texIJK([1, -0.0004, 0], 3)).toBe('\\left(1,\\; 0\\right)')
    setNotation({ components: 'column' })
    expect(fmtIJK([1, -0.0004, 0], 3)).toBe('[1; 0]')
    expect(texIJK([1, -0.0004, 0], 3)).toBe('\\begin{pmatrix}1 \\\\ 0\\end{pmatrix}')
    setNotation({ components: 'polar' })
    expect(fmtIJK([3, 4, 0], 2)).toBe('5 ∠ 53.13°')
  })

  it('texP puts no brackets round a value that rounds to zero: −0.0004 at 2 places is 0, not (0)', () => {
    expect(texP(-0.0004, 2)).toBe('0')
    expect(texP(-0.004, 2)).toBe('0')
    expect(texP(-1e-13, 2)).toBe('0')
    expect(texP(-0, 2)).toBe('0')
    expect(texP(0.0004, 2)).toBe('0')
  })

  it('texP still brackets a negative that survives its rounding, and leaves the rest alone', () => {
    expect(texP(-0.006, 2)).toBe('(-0.01)')
    expect(texP(-5)).toBe('(-5)')
    expect(texP(5)).toBe('5')
    expect(texP(-1.5e-7, 2)).toBe('(-1.5\\times 10^{-7})')
    expect(texP(-Infinity)).toBe('(-\\infty)')
    expect(texP(NaN)).toBe('\\text{undefined}')
  })
})

// ---------------------------------------------------------------------------
// P6 speed: toFixedHalfAway, toPrecisionHalfAway and fmtPrecise in significant figures take the
// built-in toFixed whenever a value is provably not near a halfway point, and parse its decimal
// digits (the exact rule) only otherwise. The results must not change by one character. So the
// fast functions are held against the exact rule — a frozen copy of it as it stood before the fast
// path, written out here so that no later edit of the code under test can move it — on a seeded
// sample that sits on, and just beside, every boundary the fast path has.
// ---------------------------------------------------------------------------

describe('P6 speed — the fast path gives exactly what the exact rule gives', () => {
  // ---- The exact rule, frozen: the shortest decimal String() prints, cut to 15 figures, then
  // rounded half away from zero in decimal digits; a zero is never signed. ----
  interface Dec {
    neg: boolean
    digits: string
    exp: number
  }
  const ZERO: Dec = { neg: false, digits: '', exp: 0 }
  const whole = (n: number): number => (Number.isFinite(n) ? Math.trunc(n) : 0)

  function roundDigits(d: Dec, n: number): Dec {
    if (d.digits.length <= n) return d
    if (n < 0) return ZERO
    if (d.digits.charCodeAt(n) < 53) {
      let end = n
      while (end > 0 && d.digits.charCodeAt(end - 1) === 48) end--
      return end === 0 ? ZERO : { neg: d.neg, digits: d.digits.slice(0, end), exp: d.exp }
    }
    let i = n - 1
    while (i >= 0 && d.digits.charCodeAt(i) === 57) i--
    if (i < 0) return { neg: d.neg, digits: '1', exp: d.exp + 1 }
    return { neg: d.neg, digits: d.digits.slice(0, i) + String.fromCharCode(d.digits.charCodeAt(i) + 1), exp: d.exp }
  }

  function decimalOf(v: number): Dec {
    let t = String(v)
    const neg = t.charCodeAt(0) === 45
    if (neg) t = t.slice(1)
    let e = 0
    const ei = t.indexOf('e')
    if (ei >= 0) {
      e = Number(t.slice(ei + 1))
      t = t.slice(0, ei)
    }
    const dot = t.indexOf('.')
    const frac = dot >= 0 ? t.length - dot - 1 : 0
    let all = dot >= 0 ? t.slice(0, dot) + t.slice(dot + 1) : t
    let lead = 0
    while (lead < all.length && all.charCodeAt(lead) === 48) lead++
    all = all.slice(lead)
    if (all === '') return ZERO
    let end = all.length
    while (all.charCodeAt(end - 1) === 48) end--
    const d: Dec = { neg, digits: all.slice(0, end), exp: all.length - 1 + e - frac }
    return d.digits.length > 15 ? roundDigits(d, 15) : d
  }

  function writeFixed(d: Dec, places: number): string {
    const { digits, exp } = d
    const int = exp < 0 || digits === '' ? '0' : digits.length > exp ? digits.slice(0, exp + 1) : digits + '0'.repeat(exp + 1 - digits.length)
    const sign = d.neg ? '-' : ''
    if (places <= 0) return sign + int
    const first = exp + 1
    const frac = (first < 0 ? '0'.repeat(-first) + digits : digits.slice(first)).slice(0, places).padEnd(places, '0')
    return `${sign}${int}.${frac}`
  }

  /** The decimal of a value, written to `places` places or to `figures` significant figures by the exact rule. */
  const fixedOf = (d: Dec, places: number): string => {
    const p = Math.max(0, whole(places))
    return writeFixed(d.digits === '' ? d : roundDigits(d, d.exp + p + 1), p)
  }
  const precisionOf = (d: Dec, figures: number): string => {
    const f = Math.max(1, whole(figures))
    const r = d.digits === '' ? d : roundDigits(d, f)
    return writeFixed(r, r.digits === '' ? f - 1 : f - 1 - r.exp)
  }
  const exactFixed = (v: number, places: number): string => fixedOf(decimalOf(v), places)
  const exactPrecision = (v: number, figures: number): string => precisionOf(decimalOf(v), figures)

  /** fmtPrecise in significant figures as it was: the form chosen on one rounding, the digits written by a second. */
  const exactPreciseSf = (v: number, figures: number): string => {
    if (Math.abs(v) < 1e-12) return '0'
    const digits = Math.max(1, figures)
    const abs = Math.abs(roundHalfAway(v, digits, 'sf'))
    if (abs >= 1e9 || abs < 1e-6) return fmtSci(v, SF(figures))
    return exactPrecision(v, digits).replace('-', '−')
  }

  // ---- The sample: a seeded generator, so it is the same on every run and every machine. ----
  /** mulberry32. */
  const seeded = (seed: number): (() => number) => {
    let a = seed | 0
    return () => {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  /** The Sandbox clock's own running sum of 1/60, which is where the slow test spent its time. */
  const clock: number[] = []
  for (let i = 0, t = 0; i < 60_000; i++, t += 1 / 60) clock.push(t)

  /** A value as it is, a neighbour a few units in its last place away, or one nudged by about the width of the margin the fast path keeps. */
  const nudge = (rand: () => number, x: number): number => {
    const r = rand()
    const y = r < 0.3 ? x : r < 0.6 ? x * (1 + (Math.floor(rand() * 9) - 4) * Number.EPSILON) : x * (1 + (rand() - 0.5) * (r < 0.8 ? 4e-14 : 4e-13))
    return Number.isFinite(y) ? y : x
  }

  /**
   * One positive value, and the decimal place and the figure count at which it sits on a boundary
   * (−1 where it has none), so the test can ask about the boundary itself and the places beside it.
   */
  const value = (rand: () => number): { x: number; place: number; figures: number } => {
    const int = (n: number): number => Math.floor(rand() * n)
    const digitsOf = (n: number): string => {
      let s = ''
      for (let i = 0; i < n; i++) s += int(10)
      return s
    }
    switch (int(13)) {
      case 0: {
        // Exactly halfway between two numbers of p places: (k + ½) ÷ 10^p.
        const k = Math.floor(rand() * 10 ** (1 + int(14)))
        const p = int(21)
        return { x: nudge(rand, (k + 0.5) / 10 ** p), place: p, figures: String(k).length }
      }
      case 1: {
        // A halfway decimal such as 1.2685 or 9.9995, at any size. Up to 14 figures, where the double's
        // noise and the 15-figure cut meet: 1.000000667121745 is a tie once cut, and the double is below it.
        const n = 1 + int(rand() < 0.5 ? 13 : 8)
        const shift = int(31) - 15
        return { x: nudge(rand, Number(`${1 + int(9)}.${digitsOf(n)}5e${shift}`)), place: n - shift, figures: n + 1 }
      }
      case 2: {
        // Noise: sums, products and quotients of short decimals (0.35 × 3 is 1.0499999999999998).
        const short = (): number => Number(`${int(1000)}.${digitsOf(1 + int(4))}`) * [1, 0.1, 0.01, 0.001, 1e-5, 10, 100][int(7)]
        const a = short()
        const b = short() || 1
        return { x: Math.abs([a + b, a * b, a / b, a * 3, a * 0.1, (a + b) * 0.35, Math.sqrt(a), a / 7, a * Math.PI][int(9)]), place: -1, figures: -1 }
      }
      case 3:
        return { x: clock[int(clock.length)], place: -1, figures: -1 }
      case 4: {
        // Runs of nines, which carry into a new decade.
        const nines = '9'.repeat(int(14)) || '0'
        const after = '9'.repeat(int(14))
        const x = Number(`${nines}.${after}${['', '5', '4', '49', '51', '9'][int(6)]}`) * 10 ** (int(21) - 12)
        return { x: nudge(rand, x), place: after.length, figures: nines.length + after.length }
      }
      case 5:
        // A hair under a power of ten, at every decade.
        return { x: nudge(rand, 10 ** (int(30) - 15) * (1 - [5, 0.5, 5e-3, 5e-4, 5e-5, 5e-6, 5e-7, 5e-9, 5e-11, 5e-13, 5e-15][int(11)] * (1 + (rand() - 0.5) * 1e-3))), place: -1, figures: 1 + int(15) }
      case 6:
        // Powers of ten and their neighbours.
        return { x: nudge(rand, Number(`1e${int(60) - 30}`)), place: -1, figures: 1 + int(15) }
      case 7: {
        // About to round to nothing, or to its first unit, at some place.
        const p = int(21)
        return { x: nudge(rand, ([0.5, 0.4999, 0.5001, 0.1, 1e-6, 0.49999999999999, 0.50000000000001][int(7)] * (1 + (rand() - 0.5) * 1e-9)) / 10 ** p), place: p, figures: -1 }
      }
      case 8:
        // Every size from 1e-15 to 1e14, with a full mantissa.
        return { x: 10 ** (rand() * 29 - 15) * (1 + rand() * 1e-3), place: -1, figures: -1 }
      case 9:
        // Short decimals at any size: 1.5, 0.125, 25.37.
        return { x: Number(`${Math.floor(rand() * 10 ** (1 + int(17)))}e${int(40) - 25}`), place: -1, figures: -1 }
      case 10:
        // Binary fractions, which are halfway in the double itself.
        return { x: (int(1 << 20) + 0.5) / 2 ** int(24), place: -1, figures: -1 }
      case 11:
        // A full random mantissa in any binade.
        return { x: (1 + rand()) * 2 ** (int(120) - 60), place: -1, figures: -1 }
      default:
        return { x: [5e-324, 1e-300, 1e300, 1.7976931348623157e308, 1.2345678901234568e20, 999999999.9999999, 999999999.5, 1e9, 1e-6, 9.9999e-7, 9.5e-7, 0.5, 1.5, 2.5, 0][int(15)], place: -1, figures: -1 }
    }
  }

  // A pure computation of about a second: given its own long timeout, so a PC under load can never
  // time it out (the slow test this part fixes was timed out that way).
  it('320 000 values at 0–20 places and 0–20 figures: toFixedHalfAway, toPrecisionHalfAway and fmtPrecise write what the exact rule writes', { timeout: 60_000 }, () => {
    const rand = seeded(0x5eed0902)
    /** The boundary's own place, or one beside it, most of the time; any place from 0 to 20 otherwise. */
    const pickAt = (hint: number): number => (hint >= 0 && hint <= 21 && rand() < 0.8 ? Math.min(20, Math.max(0, hint + Math.floor(rand() * 3) - 1)) : Math.floor(rand() * 21))
    const wrong: string[] = []
    let negative = 0
    let builtinAlone = 0
    let signedZero = 0
    let carried = 0
    const COUNT = 320_000
    for (let i = 0; i < COUNT; i++) {
      const { x, place, figures } = value(rand)
      const v = rand() < 0.4 ? -x : x
      const p = pickAt(place)
      const f = pickAt(figures)
      const d = decimalOf(v)

      const fixed = fixedOf(d, p)
      const gotFixed = toFixedHalfAway(v, p)
      if (gotFixed !== fixed && wrong.length < 10) wrong.push(`toFixedHalfAway(${String(v)}, ${p}) is ${gotFixed}; the exact rule writes ${fixed}`)

      const prec = precisionOf(d, f)
      const gotPrec = toPrecisionHalfAway(v, f)
      if (gotPrec !== prec && wrong.length < 10) wrong.push(`toPrecisionHalfAway(${String(v)}, ${f}) is ${gotPrec}; the exact rule writes ${prec}`)

      if (i % 6 === 0) {
        const sf = exactPreciseSf(v, f)
        const gotSf = fmtPrecise(v, SF(f))
        if (gotSf !== sf && wrong.length < 10) wrong.push(`fmtPrecise(${String(v)}, ${f} s.f.) is ${gotSf}; the exact rule writes ${sf}`)
      }

      // What the sample is made of: only a sample full of what the fast path must refuse proves it refuses it.
      if (v < 0) negative++
      if (i % 2 === 0 && x < 1e15 && x.toFixed(p) !== fixed.replace('-', '')) builtinAlone++
      if (i % 16 === 0) {
        if (v < 0 && /^0(\.0*)?$/.test(fixed)) signedZero++
        if (d.digits[0] === '9' && /^-?0*\.?0*10*(\.0*)?$/.test(prec)) carried++
      }
    }
    expect(wrong).toEqual([])
    expect(negative).toBeGreaterThan(COUNT / 3)
    // Places where the plain built-in toFixed writes different digits from the calculator's rule:
    // had the fast path not refused them, the lines above would have failed.
    expect(builtinAlone).toBeGreaterThan(10_000)
    // Negatives that round to nothing (they must read 0.00, never -0.00), and carries into a new decade.
    expect(signedZero).toBeGreaterThan(300)
    expect(carried).toBeGreaterThan(300)
  })

  it('every size from 10⁻¹⁵ to 10¹⁴ at every place and figure count from 0 to 20, beside each kind of boundary', () => {
    const wrong: string[] = []
    const mantissas = [1, 1.5, 2.5, 4.95, 5, 5.5, 9.5, 9.995, 9.9995, 9.99995, 9.999999999, 9.9999999999999]
    for (let e = -15; e <= 14; e++) {
      for (const m of mantissas) {
        for (const sign of [1, -1]) {
          const v = sign * Number(`${m}e${e}`)
          for (let n = 0; n <= 20; n++) {
            if (toFixedHalfAway(v, n) !== exactFixed(v, n)) wrong.push(`toFixedHalfAway(${String(v)}, ${n})`)
            if (toPrecisionHalfAway(v, n) !== exactPrecision(v, n)) wrong.push(`toPrecisionHalfAway(${String(v)}, ${n})`)
            if (fmtPrecise(v, SF(n)) !== exactPreciseSf(v, n)) wrong.push(`fmtPrecise(${String(v)}, ${n} s.f.)`)
          }
        }
      }
    }
    // The two edges where fmtPrecise changes form, with the rounding that lifts a number over them
    // (and 5×10⁻⁷, below which it goes straight to powers of ten).
    for (const base of [999999999, 999999999.4, 999999999.5, 999999999.9, 999999999.99999, 1e9, 1000000000.4, 4.9999999e-7, 5e-7, 5.0000001e-7, 9.4999999e-7, 9.9999999e-7, 9.9999995e-7, 9.99999e-7, 9.5e-7, 1e-6, 1.0000001e-6]) {
      for (const sign of [1, -1]) {
        for (let n = 0; n <= 20; n++) {
          const v = sign * base
          if (fmtPrecise(v, SF(n)) !== exactPreciseSf(v, n)) wrong.push(`fmtPrecise(${String(v)}, ${n} s.f.)`)
        }
      }
    }
    expect(wrong.slice(0, 10)).toEqual([])
  })

  it('toPrecisionHalfAway stays exact when log10 is out by one beside a power of ten: the decade it guesses is checked, not trusted', () => {
    // Some engines' log10 rounds up for a number a few units under a power of ten (this one does).
    // The fast path takes its first figure's place from log10, so here log10 is made out by one
    // over a whole band of relative distances either side of a power of ten.
    const realLog10 = Math.log10
    const rand = seeded(0x10c0de)
    const wrong: string[] = []
    try {
      for (const bias of [1e-9, -1e-9, 1e-6, -1e-6]) {
        Math.log10 = (x: number): number => realLog10(x) + bias
        for (let i = 0; i < 12_000; i++) {
          const rel = 10 ** -(2 + rand() * 14)
          const x = 10 ** (Math.floor(rand() * 24) - 9) * (1 + (rand() < 0.5 ? -rel : rel))
          const v = rand() < 0.3 ? -x : x
          const f = 1 + Math.floor(rand() * 15)
          const want = exactPrecision(v, f)
          if (toPrecisionHalfAway(v, f) !== want && wrong.length < 10) wrong.push(`bias ${bias}: toPrecisionHalfAway(${String(v)}, ${f}) is ${toPrecisionHalfAway(v, f)}; the exact rule writes ${want}`)
          const wantSf = exactPreciseSf(v, f)
          if (fmtPrecise(v, SF(f)) !== wantSf && wrong.length < 10) wrong.push(`bias ${bias}: fmtPrecise(${String(v)}, ${f} s.f.) is ${fmtPrecise(v, SF(f))}; the exact rule writes ${wantSf}`)
        }
      }
    } finally {
      Math.log10 = realLog10
    }
    expect(wrong).toEqual([])
  })

  it('the boundaries by name, worked out by hand from the rule', () => {
    // A halfway decimal the double holds a hair under: the built-in toFixed writes 2.67, 1.00, 1.0.
    expect(toFixedHalfAway(2.675, 2)).toBe('2.68')
    expect(toFixedHalfAway(-2.675, 2)).toBe('-2.68')
    expect(toFixedHalfAway(1.005, 2)).toBe('1.01')
    expect(toFixedHalfAway(0.35 * 3, 1)).toBe('1.1')
    // Not near a halfway point: the built-in's digits, unchanged.
    expect(toFixedHalfAway(123456.789, 2)).toBe('123456.79')
    expect(toFixedHalfAway(0.123456, 3)).toBe('0.123')
    expect(toFixedHalfAway(99999.99999, 3)).toBe('100000.000')
    // Rounding to nothing is unsigned; one unit is signed.
    expect(toFixedHalfAway(-0.004, 2)).toBe('0.00')
    expect(toFixedHalfAway(-1e-15, 2)).toBe('0.00')
    expect(toFixedHalfAway(-0.006, 2)).toBe('-0.01')
    expect(toFixedHalfAway(-0, 2)).toBe('0.00')
    expect(toFixedHalfAway(0, 0)).toBe('0')
    // More places than a double holds exactly, or than the built-in is trusted for.
    expect(toFixedHalfAway(0.1, 20)).toBe('0.10000000000000000000')
    // 1/3 is 0.333333333333333 to the 15 figures a calculator holds; the rest is zeros.
    expect(toFixedHalfAway(1 / 3, 25)).toBe('0.' + '3'.repeat(15) + '0'.repeat(10))
    // The decade edges of toPrecision: a carry into a new decade, and a number a hair under a power of ten.
    expect(toPrecisionHalfAway(9.9996, 4)).toBe('10.00')
    expect(toPrecisionHalfAway(0.99995, 4)).toBe('1.000')
    expect(toPrecisionHalfAway(99999.5, 5)).toBe('100000')
    expect(toPrecisionHalfAway(999.9999999999999, 4)).toBe('1000')
    expect(toPrecisionHalfAway(999.9999999999999, 15)).toBe('1000.00000000000')
    expect(toPrecisionHalfAway(1000, 4)).toBe('1000')
    expect(toPrecisionHalfAway(-1000, 1)).toBe('-1000')
    expect(toPrecisionHalfAway(0.1, 2)).toBe('0.10')
    expect(toPrecisionHalfAway(1e-5, 3)).toBe('0.0000100')
    expect(toPrecisionHalfAway(123456, 3)).toBe('123000')
    expect(toPrecisionHalfAway(0, 3)).toBe('0.00')
  })

  it('fmtPrecise in significant figures chooses plain or scientific on the digits it rounded to', () => {
    // 10⁹ and above, as rounded, are powers of ten; 999 999 999.4 is not.
    expect(fmtPrecise(999999999.9, SF(3))).toBe('1.00×10^9')
    expect(fmtPrecise(1e9, SF(3))).toBe('1.00×10^9')
    expect(fmtPrecise(999999999, SF(9))).toBe('999999999')
    expect(fmtPrecise(999999999.4, SF(10))).toBe('999999999.4')
    expect(fmtPrecise(-999999999.9, SF(3))).toBe('−1.00×10^9')
    // Under 10⁻⁶, as rounded, are powers of ten; 9.9999996×10⁻⁷ rounds up to 1.00×10⁻⁶ and stays plain.
    expect(fmtPrecise(9.9999996e-7, SF(3))).toBe('0.00000100')
    expect(fmtPrecise(9.99e-7, SF(3))).toBe('9.99×10^-7')
    expect(fmtPrecise(-9.99e-7, SF(3))).toBe('−9.99×10^-7')
    expect(fmtPrecise(1.5e-6, SF(3))).toBe('0.00000150')
    expect(fmtPrecise(-2.5, SF(3))).toBe('−2.50')
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { bearingText, fmtIJK, formatMeasure, setNotation, texMeasure, vecTex, type MeasureSettings } from '../src/renderer/src/math/format'
import { answerTex, circleReport, polygonReport } from '../src/renderer/src/math/shapeFormulas'
import type { V3 } from '../src/renderer/src/math/vec'
import { resetGlobals } from './helpers/globals'

beforeEach(resetGlobals)

const S: MeasureSettings = { decimals: 2, precisionMode: 'dp', unit: 'cm', unitPerSquare: 1, angleUnit: 'deg' }
const P = (...xy: number[]): V3[] => {
  const out: V3[] = []
  for (let i = 0; i < xy.length; i += 2) out.push([xy[i], xy[i + 1], 0])
  return out
}

describe('measurement formatting', () => {
  it('applies units, scale and precision', () => {
    expect(formatMeasure(4, 'length', S)).toBe('4 cm')
    expect(formatMeasure(12, 'area', S)).toBe('12 cm²')
    expect(formatMeasure(2, 'length', { ...S, unit: 'm', unitPerSquare: 0.5 })).toBe('1 m')
    expect(formatMeasure(3, 'area', { ...S, unitPerSquare: 2 })).toBe('12 cm²')
    expect(formatMeasure(Math.PI / 3, 'angle', S)).toBe('60°')
    expect(formatMeasure(1234.567, 'length', { ...S, precisionMode: 'sf', decimals: 3 })).toBe('1230 cm')
    // Significant figures must keep the zeros that show the precision.
    expect(formatMeasure(2.5, 'length', { ...S, precisionMode: 'sf', decimals: 3 })).toBe('2.50 cm')
    expect(formatMeasure(0.5, 'length', { ...S, precisionMode: 'sf', decimals: 2 })).toBe('0.50 cm')
    expect(formatMeasure(7, 'length', { ...S, precisionMode: 'sf', decimals: 4 })).toBe('7.000 cm')
    expect(texMeasure(12, 'area', S)).toBe('12\\,\\text{cm}^2')
  })
  it('writes a direction as a bearing when asked, but never an angle', () => {
    setNotation({ direction: 'bearing' })
    expect(formatMeasure(Math.PI / 6, 'direction', S)).toBe('N 60° E')
    expect(formatMeasure(Math.PI / 2, 'direction', S)).toBe('N')
    expect(formatMeasure((5 * Math.PI) / 4, 'direction', S)).toBe('S 45° W')
    expect(texMeasure(Math.PI / 6, 'direction', S)).toBe('\\text{N 60° E}')
    // A bearing keeps the student's significant figures, like every other measurement.
    expect(formatMeasure(Math.atan2(4, 3), 'direction', { ...S, precisionMode: 'sf', decimals: 3 })).toBe('N 36.9° E')
    expect(formatMeasure(NaN, 'direction', S)).toBe('undefined')
    // The corner of a triangle is an amount of turning, not a heading.
    expect(formatMeasure(Math.PI / 6, 'angle', S)).toBe('30°')
    // In radians a bearing makes no sense, so the direction is a plain angle again.
    expect(formatMeasure(Math.PI / 6, 'direction', { ...S, angleUnit: 'rad' })).toBe('0.52 rad')
    setNotation({ direction: 'standard' })
    expect(formatMeasure(Math.PI / 6, 'direction', S)).toBe('30°')
  })
  it('shows exact forms only when the decimal is rounded', () => {
    expect(answerTex(5.5, 'length', S)).toBe('5.5\\,\\text{cm}')
    expect(answerTex(Math.SQRT2 * 3, 'length', S)).toBe('3\\sqrt{2}\\,\\text{cm} \\approx 4.24\\,\\text{cm}')
    expect(answerTex(4 * Math.PI, 'area', S, true)).toContain('4\\pi')
  })
})

describe('shape reports', () => {
  it('rectangle: A = l × w with substitution', () => {
    const r = polygonReport(P(0, 0, 4, 0, 4, 3, 0, 3), ['A', 'B', 'C', 'D'], S)
    expect(r.name).toBe('Rectangle')
    const area = r.rows[0]
    expect(area.general).toBe('A = l \\times w')
    expect(area.symbols.map((s) => s.label)).toEqual(['AB', 'BC'])
    expect(area.substitution).toBe('A = 4 \\times 3')
    expect(area.value).toBeCloseTo(12)
    expect(r.rows.find((x) => x.title === 'Diagonal')?.value).toBeCloseTo(5)
  })
  it('triangle, trapezium, circle and general polygons', () => {
    const t = polygonReport(P(0, 0, 4, 0, 1, 3), ['A', 'B', 'C'], S)
    expect(t.rows[0].general).toBe('A = \\tfrac{1}{2} \\times b \\times h')
    expect(t.rows[0].value).toBeCloseTo(6)
    expect(t.rows.find((x) => x.title.includes('Heron'))?.value).toBeCloseTo(6)
    const trap = polygonReport(P(0, 0, 6, 0, 4, 2, 1, 2), ['A', 'B', 'C', 'D'], S)
    expect(trap.name).toBe('Trapezium')
    expect(trap.rows[0].value).toBeCloseTo(9)
    const c = circleReport([0, 0, 0], 2, 'O', S)
    expect(c.rows[0].value).toBeCloseTo(4 * Math.PI)
    const L = polygonReport(P(0, 0, 4, 0, 4, 2, 2, 2, 2, 4, 0, 4), ['A', 'B', 'C', 'D', 'E', 'F'], S)
    expect(L.note).toMatch(/Decompose/)
    expect(L.rows[0].value).toBeCloseTo(12)
  })
})

describe('notation choices', () => {
  it('writes vectors the way the chosen book does', () => {
    expect(vecTex('A')).toBe(String.raw`\vec{A}`)
    setNotation({ vector: 'bold', components: 'pair' })
    expect(vecTex('A')).toBe(String.raw`\mathbf{A}`)
    expect(fmtIJK([3, 4, 0])).toBe('(3, 4)')
    setNotation({ components: 'polar' })
    expect(fmtIJK([3, 4, 0])).toBe('5 ∠ 53.13°')
    setNotation({ components: 'ijk', vector: 'arrow' })
    expect(fmtIJK([3, 4, 0])).toBe('3i + 4j')
  })
  it('gives compass bearings when asked', () => {
    expect(bearingText(0)).toBe('E')
    expect(bearingText(Math.PI / 2)).toBe('N')
    expect(bearingText((3 * Math.PI) / 4)).toBe('N 45° W')
    expect(bearingText(-Math.PI / 4)).toBe('S 45° E')
  })
})

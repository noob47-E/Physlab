import katex from 'katex'
import { beforeEach, describe, expect, it } from 'vitest'
import { bearingText, fmtIJK, formatMeasure, setNotation, texMeasure, texUnit, vecTex, type MeasureKind, type MeasureSettings } from '../src/renderer/src/math/format'
import { answerTex, circleReport, polygonReport, type ShapeReport } from '../src/renderer/src/math/shapeFormulas'
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

describe('formula report in scientific notation (H1)', () => {
  // Numbers the report writes in powers of ten. Each shape is drawn at an ordinary size and the
  // student's "1 square =" setting makes it huge or tiny, which is how such a number reaches the
  // panel (and keeps the shape's name independent of the size).
  const SF3: MeasureSettings = { ...S, precisionMode: 'sf', decimals: 3 }
  const HUGE: MeasureSettings = { ...SF3, unitPerSquare: 1e9 }
  const TINY: MeasureSettings = { ...SF3, unitPerSquare: 1e-7 }
  const SCALES: [string, MeasureSettings][] = [
    ['3 s.f., 1 square = 10^9 cm', HUGE],
    ['3 s.f., 1 square = 10^12 cm', { ...SF3, unitPerSquare: 1e12 }],
    ['3 s.f., 1 square = 10^-7 cm', TINY],
    ['2 d.p., 1 square = 10^9 cm', { ...S, unitPerSquare: 1e9 }],
    ['2 d.p., 1 square = 10^-5 cm', { ...S, unitPerSquare: 1e-5 }]
  ]
  const N = ['A', 'B', 'C', 'D', 'E', 'F']
  const hexagon: V3[] = Array.from({ length: 6 }, (_, k) => [3 * Math.cos((k * Math.PI) / 3), 3 * Math.sin((k * Math.PI) / 3), 0])
  const SHAPES: V3[][] = [
    P(0, 0, 4, 0, 4, 4, 0, 4), // square
    P(0, 0, 4, 0, 4, 3, 0, 3), // rectangle
    P(0, 0, 4, 0, 5, 2, 1, 2), // parallelogram
    P(0, 0, 5, 0, 8, 4, 3, 4), // rhombus
    P(0, 0, 6, 0, 4, 2, 1, 2), // trapezium
    P(0, 0, 2, -1, 5, 0, 2, 1), // kite
    P(0, 0, 4, 0, 2, 2 * Math.sqrt(3)), // equilateral triangle
    P(0, 0, 4, 0, 0, 3), // right-angled triangle
    P(0, 0, 4, 0, 1, 3), // scalene triangle
    hexagon,
    P(0, 0, 4, 0, 4, 2, 2, 2, 2, 4, 0, 4) // L-shape (shoelace)
  ]
  const reports = (s: MeasureSettings): ShapeReport[] => [...SHAPES.map((pts) => polygonReport(pts, N, s)), circleReport([0, 0, 0], 2, 'O', s)]
  /**
   * KaTeX raises only the one token after a ^: "10^-7" raises the minus alone and leaves the 7 on
   * the line, "10^12" raises the 1 alone, and a second ^ on the same base ("10^9^2",
   * "10^{9}^2") is a "Double superscript" error.
   */
  const MISREAD_POWER = /\^(?:-|\d{2}|\d\^|\{[^}]*\}\^)/
  const expectRenders = (tex: string, where: string): void => {
    expect(() => katex.renderToString(tex, { throwOnError: true, strict: 'ignore' }), `${where}: ${tex}`).not.toThrow()
    expect(tex, where).not.toMatch(MISREAD_POWER)
  }
  /** The five rows that square a number: square, rectangle's diagonal, equilateral area, Pythagoras, circle. */
  const squares = (s: MeasureSettings): (string | undefined)[] => {
    const sub = (pts: V3[], title: string): string | undefined => polygonReport(pts, N, s).rows.find((r) => r.title === title)?.substitution
    return [
      sub(SHAPES[0], 'Area'),
      sub(SHAPES[1], 'Diagonal'),
      sub(SHAPES[6], 'Area'),
      sub(SHAPES[7], 'Hypotenuse (Pythagoras)'),
      circleReport([0, 0, 0], 2, 'O', s).rows.find((r) => r.title === 'Area')?.substitution
    ]
  }

  it('an answer in powers of ten stands alone; an exact form keeps its unit, once, after it', () => {
    // Before: the unit was cut off the answer by a pattern that stopped at the first backslash, so
    // a number written "1.26\times 10^{9}" put the whole answer where the unit belongs:
    // "400000000\pi1.26\times 10^{9}\,\text{cm}^2 \approx 1.26\times 10^{9}\,\text{cm}^2". At that
    // size the exact form itself cannot be trusted (a double cannot tell 4√2 × 10⁹ from
    // 11313708499/2, which is what was offered), and past 10²¹ JavaScript writes "1e+22".
    expect(answerTex(4 * Math.PI, 'area', { ...SF3, unitPerSquare: 1e4 }, true)).toBe(String.raw`1.26\times 10^{9}\,\text{cm}^2`)
    expect(answerTex(4 * Math.PI, 'area', { ...S, unitPerSquare: 1e5 }, true)).toBe(String.raw`1.26\times 10^{11}\,\text{cm}^2`)
    expect(answerTex(4 * Math.SQRT2, 'length', HUGE)).toBe(String.raw`5.66\times 10^{9}\,\text{cm}`)
    expect(answerTex(10 / 3, 'length', HUGE)).toBe(String.raw`3.33\times 10^{9}\,\text{cm}`)
    expect(answerTex(1e10 / 3, 'number', SF3)).toBe(String.raw`3.33\times 10^{9}`)
    expect(answerTex(Math.PI, 'area', { ...SF3, unitPerSquare: 1e11 }, true)).toBe(String.raw`3.14\times 10^{22}\,\text{cm}^2`)
    // Degrees are written ^\circ, with no "\," in front, so every angle lost its unit the same way:
    // "\frac{100}{3}33.33^\circ \approx 33.33^\circ".
    expect(answerTex((100 / 3) * (Math.PI / 180), 'angle', S)).toBe(String.raw`\frac{100}{3}^\circ \approx 33.33^\circ`)
    // A bearing is words, not a number and a unit, and 100/3 is its angle from east, not the 56.67
    // it shows: it stays as it is.
    setNotation({ direction: 'bearing' })
    expect(answerTex((100 / 3) * (Math.PI / 180), 'direction', S)).toBe('\\text{N 56.67° E}')
  })

  it('every answer in the panel ends with the decimal answer, with any exact form before it', () => {
    for (const [where, s] of SCALES) {
      for (const r of reports(s)) {
        for (const row of r.rows) {
          const asked: [number, MeasureKind][] = [[row.value, row.kind], ...row.symbols.map((y): [number, MeasureKind] => [y.value, y.kind])]
          for (const [v, kind] of asked) {
            // A circle's rows are asked for with their π factor, as ShapeInfo asks.
            const tex = answerTex(v, kind, s, r.name === 'Circle')
            const at = `${where}, ${r.name}, ${row.title}: ${tex}`
            const shown = texMeasure(v, kind, s)
            if (shown.includes('\\times 10^')) {
              expect(tex, at).toBe(shown)
            } else {
              // A plain answer (a perimeter at 10⁻⁵ cm a square, say) may keep an exact form, and
              // that form ends with the unit, once.
              const unit = texUnit(kind, s)
              const sides = tex.split(' \\approx ')
              expect(sides.length, at).toBeLessThanOrEqual(2)
              expect(sides[sides.length - 1], at).toBe(shown)
              expect(sides[0].indexOf(unit), at).toBe(sides[0].length - unit.length)
            }
            expectRenders(tex, at)
          }
        }
      }
    }
  })

  it('every worked substitution renders, with a power of ten in brackets before it is squared', () => {
    for (const [where, s] of SCALES) for (const r of reports(s)) for (const row of r.rows) expectRenders(row.substitution, `${where}, ${r.name}, ${row.title}`)
    expect(squares(HUGE)).toEqual([
      String.raw`A = (4.00\times 10^{9})^2`,
      String.raw`d = \sqrt{(4.00\times 10^{9})^2 + (3.00\times 10^{9})^2}`,
      String.raw`A = \frac{\sqrt{3}}{4} \times (4.00\times 10^{9})^2`,
      String.raw`c = \sqrt{(4.00\times 10^{9})^2 + (3.00\times 10^{9})^2}`,
      String.raw`A = \pi \times (2.00\times 10^{9})^2`
    ])
    expect(squares(TINY)).toEqual([
      String.raw`A = (4.00\times 10^{-7})^2`,
      String.raw`d = \sqrt{(4.00\times 10^{-7})^2 + (3.00\times 10^{-7})^2}`,
      String.raw`A = \frac{\sqrt{3}}{4} \times (4.00\times 10^{-7})^2`,
      String.raw`c = \sqrt{(4.00\times 10^{-7})^2 + (3.00\times 10^{-7})^2}`,
      String.raw`A = \pi \times (2.00\times 10^{-7})^2`
    ])
    // A number that is not squared needs no brackets, only a real power of ten.
    expect(polygonReport(SHAPES[1], N, TINY).rows[0].substitution).toBe(String.raw`A = 4.00\times 10^{-7} \times 3.00\times 10^{-7}`)
    expect(circleReport([0, 0, 0], 2, 'O', { ...S, unitPerSquare: 1e12 }).rows[1].substitution).toBe(String.raw`C = 2\pi \times 2\times 10^{12}`)
  })

  it('ordinary numbers are written exactly as before', () => {
    expect(squares(S)).toEqual(['A = (4)^2', 'd = \\sqrt{4^2 + 3^2}', 'A = \\frac{\\sqrt{3}}{4} \\times 4^2', 'c = \\sqrt{4^2 + 3^2}', 'A = \\pi \\times 2^2'])
    expect(squares(SF3)).toEqual(['A = (4.00)^2', 'd = \\sqrt{4.00^2 + 3.00^2}', 'A = \\frac{\\sqrt{3}}{4} \\times 4.00^2', 'c = \\sqrt{4.00^2 + 3.00^2}', 'A = \\pi \\times 2.00^2'])
    expect(answerTex(Math.PI * 4, 'area', S, true)).toBe('4\\pi\\,\\text{cm}^2 \\approx 12.57\\,\\text{cm}^2')
    expect(answerTex(1 / 3, 'angle', { ...S, angleUnit: 'rad' })).toBe('\\frac{1}{3}\\,\\text{rad} \\approx 0.33\\,\\text{rad}')
    expect(answerTex(1 / 3, 'number', S)).toBe('\\frac{1}{3} \\approx 0.33')
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

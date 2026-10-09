import { beforeEach, describe, expect, it } from 'vitest'
import { classifyPolygon, interiorAngles, sideLengths } from '../../src/renderer/src/math/shapes'
import { polygonArea, perimeter } from '../../src/renderer/src/math/geometry'
import { polygonReport, answerTex } from '../../src/renderer/src/math/shapeFormulas'
import { decompose } from '../../src/renderer/src/math/decompose'
import { resetGlobals } from '../helpers/globals'
import { expectGolden, goldenLine, seenOf } from './harness'
import { SHAPES } from './inputs/geometry'
import type { MeasureSettings } from '../../src/renderer/src/math/format'
import type { V3 } from '../../src/renderer/src/math/vec'

beforeEach(resetGlobals)

const SETTINGS: MeasureSettings = { decimals: 4, precisionMode: 'dp', unit: 'cm', unitPerSquare: 1, angleUnit: 'deg' }

const seenShape = (pts: V3[]): string =>
  seenOf(() => {
    const cls = classifyPolygon(pts)
    const area = polygonArea(pts)
    const perim = perimeter(pts)
    const angles = interiorAngles(pts).map(a => (a * 180 / Math.PI).toFixed(2))
    const sides = sideLengths(pts).map(s => s.toFixed(2))
    const report = polygonReport(pts, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], SETTINGS)
    const rows = report.rows.map(r => `${r.title}: ${r.substitution} => ${answerTex(r.value, r.kind, SETTINGS, false)}`).join(' | ')
    const decBasic = decompose(pts, 'basic')
    const decFormula = decompose(pts, 'formula')
    const decStr = (dec: ReturnType<typeof decompose>) => dec.parts.map((p) => `${p.cls.name} (${p.area.toFixed(2)})`).join(' + ')
    return `[${cls.name}] area=${area.toFixed(2)} perim=${perim.toFixed(2)} angles=[${angles.join(',')}] sides=[${sides.join(',')}] | Report: ${rows} | Decompose basic: ${decStr(decBasic)} | Decompose formula: ${decStr(decFormula)}`
  })

function sweep(): string[] {
  const lines: string[] = []
  for (const [name, pts] of Object.entries(SHAPES)) {
    lines.push(goldenLine(`shape ${name}`, seenShape(pts)))
  }
  return lines
}

describe('golden sweep: geometry', () => {
  it('is stable: two runs in a row give the same lines', () => {
    expect(sweep()).toEqual(sweep())
  })

  it('matches tests/golden/out/geometry.txt', () => {
    expectGolden('geometry', sweep())
  })
})

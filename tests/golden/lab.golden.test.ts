import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/renderer/src/math/cas', () => ({
  tryCas: () => null,
  runCas: () => null
}))

import { readTyped } from '../../src/renderer/src/lab/values'
import { cellNumber, parseTable } from '../../src/renderer/src/lab/csv'
import { fitOf, FIT_SHAPES, pmText } from '../../src/renderer/src/lab/fit'
import { resetGlobals } from '../helpers/globals'
import { expectGolden, goldenLine, seenOf } from './harness'
import { TYPED_CELLS, PASTED_CSV, FIT_TABLES } from './inputs/lab'

beforeEach(resetGlobals)

function sweep(): string[] {
  const lines: string[] = []
  
  for (const c of TYPED_CELLS) {
    lines.push(goldenLine(`readTyped "${c}"`, seenOf(() => JSON.stringify(readTyped(c)))))
    lines.push(goldenLine(`cellNumber "${c}" (dot)`, seenOf(() => String(cellNumber(c, false)))))
    lines.push(goldenLine(`cellNumber "${c}" (comma)`, seenOf(() => String(cellNumber(c, true)))))
  }
  
  for (const csv of PASTED_CSV) {
    lines.push(goldenLine(`parseTable ${JSON.stringify(csv)}`, seenOf(() => JSON.stringify(parseTable(csv)))))
  }
  
  for (const t of FIT_TABLES) {
    for (const shape of FIT_SHAPES) {
      lines.push(goldenLine(`fitOf ${t.name} ${shape}`, seenOf(() => {
        const f = fitOf(t.xs, t.ys, shape)
        if (!f) return 'null'
        const parts = [`expr: ${f.expr}`, `r2: ${f.r2}`]
        if (f.slope !== undefined) parts.push(`slope: ${f.slope}`)
        if (f.slopeError !== undefined) parts.push(`slopeError: ${f.slopeError}`)
        if (f.slope !== undefined) parts.push(`pmText: ${pmText(f.slope, f.slopeError)}`)
        return parts.join(', ')
      })))
    }
  }
  
  return lines
}

describe('golden sweep: lab', () => {
  it('is stable: two runs in a row give the same lines', () => {
    expect(sweep()).toEqual(sweep())
  })

  it('matches tests/golden/out/lab.txt', () => {
    expectGolden('lab', sweep())
  })
})

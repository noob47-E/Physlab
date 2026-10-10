// Golden sweep `reader` (CLEANUP-PLAN.md CW6a): what each input of the `bar` and `calc` sweeps becomes once it is
// read — before a route splits it (at =, into a command's inputs) and before mathjs works anything out. The one
// reader of typed maths is math/expr.ts preprocess; LaTeX from the maths field reaches it through
// math/latexToMath.ts, the LaTeX-to-text step. Each input is written as each route reads it: the bar's typed line
// through preprocess; the Calculator's (latexToMath, then keypadToMath, which ends in preprocess); the Vectors
// panel's (latexToMath with its vector signs, then preprocess); and latexToMath's text alone, which Pure Maths and
// the Maths screen read without preprocess. Bases mode (BASE_N, TESTED_BASE_N) is left out: it reads its own digits
// (evaluateBaseN), never latexToMath or preprocess. A change to either reader shows here line by line, which the
// answer sweeps only show where an answer moves.

import { beforeEach, describe, expect, it } from 'vitest'
import { preprocess } from '../../src/renderer/src/math/expr'
import { latexToMath } from '../../src/renderer/src/math/latexToMath'
import { keypadToMath } from '../../src/renderer/src/calc/engine'
import { resetGlobals } from '../helpers/globals'
import { expectGolden, goldenLine, seenOf } from './harness'
import { BAR_COMMANDS, COMMAS as BAR_COMMAS } from './inputs/bar'
import { ANGLE_LINES, BENCH, CMPLX, COMMAS, FIXED_ONCE, TESTED_CMPLX, TESTED_COMP } from './inputs/calc'

beforeEach(resetGlobals)

function sweep(): string[] {
  const lines: string[] = []
  for (const l of [...BAR_COMMANDS, ...BAR_COMMAS]) lines.push(goldenLine(`BAR ${l}`, seenOf(() => preprocess(l))))
  for (const l of [...BENCH, ...FIXED_ONCE, ...COMMAS, ...ANGLE_LINES, ...CMPLX, ...TESTED_COMP, ...TESTED_CMPLX]) {
    lines.push(goldenLine(`CALC ${l}`, seenOf(() => keypadToMath(latexToMath(l)))))
    lines.push(goldenLine(`VECTORS ${l}`, seenOf(() => preprocess(latexToMath(l, { vectorOps: true })))))
  }
  // Added after the lines above, so they keep their places: latexToMath's own text.
  for (const l of [...BENCH, ...FIXED_ONCE, ...COMMAS, ...ANGLE_LINES, ...CMPLX, ...TESTED_COMP, ...TESTED_CMPLX]) {
    lines.push(goldenLine(`LATEX ${l}`, seenOf(() => latexToMath(l))))
  }
  return lines
}

describe('golden sweep: reader', () => {
  it('is stable: two runs in a row give the same lines', () => {
    expect(sweep()).toEqual(sweep())
  })

  it('matches tests/golden/out/reader.txt', () => {
    expectGolden('reader', sweep())
  })
})

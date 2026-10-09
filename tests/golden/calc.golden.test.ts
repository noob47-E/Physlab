// Golden sweep `calc` (CLEANUP-PLAN.md §2): the Calculator's Maths screen, through evaluateInput —
// the main line, the extras, the exact form, or the refusal, exactly as the screen shows them.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { evaluateInput, type EvalOptions } from '../../src/renderer/src/calc/evaluateInput'
import type { FieldMode } from '../../src/renderer/src/calc/calcStore'
import { resetGlobals } from '../helpers/globals'
import { expectGolden, goldenLine, seenOf, freezeClock } from './harness'
import { ANGLE_LINES, BASE_N, BENCH, CMPLX, COMMAS, FIXED_ONCE, TESTED_BASE_N, TESTED_CMPLX, TESTED_COMP } from './inputs/calc'

beforeAll(freezeClock)
beforeEach(resetGlobals)

const seen = (mode: FieldMode, latex: string, opts: EvalOptions): string =>
  seenOf(() => {
    const r = evaluateInput(mode, latex, opts)
    if (!r) return '(nothing)'
    if (r.error) return `REFUSED ${r.error.sentence}${r.error.detail ? ` [${r.error.detail}]` : ''}`
    return [r.main, ...(r.extra ?? []), r.exact ? `exact ${r.exact}` : ''].filter(Boolean).join(' | ')
  })

function sweep(): string[] {
  const lines: string[] = []
  const deg: EvalOptions = { vars: { x: 2 }, ans: 0, angle: 'deg' }
  const rad: EvalOptions = { vars: { x: 2 }, ans: 0, angle: 'rad' }
  for (const l of [...BENCH, ...FIXED_ONCE, ...COMMAS]) lines.push(goldenLine(`COMP deg ${l}`, seen('COMP', l, deg)))
  for (const l of ANGLE_LINES) {
    lines.push(goldenLine(`COMP rad ${l}`, seen('COMP', l, rad)))
    lines.push(goldenLine(`COMP eng ${l}`, seen('COMP', l, { ...deg, eng: true })))
  }
  for (const l of CMPLX) lines.push(goldenLine(`CMPLX ${l}`, seen('CMPLX', l, rad)))
  for (const l of BASE_N) lines.push(goldenLine(`BASE-N hex ${l}`, seen('BASE-N', l, { ...deg, base: 16 })))
  // Added after the first lines, so they come after them: the fixed-once lines in radians, and
  // every line the Calculator's own tests type, in both angle units.
  for (const l of FIXED_ONCE) lines.push(goldenLine(`COMP rad ${l}`, seen('COMP', l, rad)))
  for (const l of TESTED_COMP) {
    lines.push(goldenLine(`COMP deg ${l}`, seen('COMP', l, deg)))
    lines.push(goldenLine(`COMP rad ${l}`, seen('COMP', l, rad)))
  }
  for (const l of TESTED_CMPLX) {
    lines.push(goldenLine(`CMPLX rad ${l}`, seen('CMPLX', l, rad)))
    lines.push(goldenLine(`CMPLX deg ${l}`, seen('CMPLX', l, deg)))
  }
  for (const l of TESTED_BASE_N) lines.push(goldenLine(`BASE-N hex ${l}`, seen('BASE-N', l, { ...deg, base: 16 })))
  return lines
}

describe('golden sweep: calc', () => {
  it('is stable: two runs in a row give the same lines', () => {
    expect(sweep()).toEqual(sweep())
  })

  it('matches tests/golden/out/calc.txt', () => {
    expectGolden('calc', sweep())
  })
})

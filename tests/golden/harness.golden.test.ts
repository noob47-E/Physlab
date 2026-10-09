// The harness's own check (CLEANUP-PLAN.md CW0): a golden file with one line changed, one missing
// or one too many is caught, and names the line. It writes a scratch golden file of its own and
// removes it after. Not run while golden files are being rewritten (that mode writes, not compares).

import fs from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { expectGolden, goldenDiff, goldenLine, goldenPath } from './harness'

const NAME = '__harness-self-check'
const LINES = [goldenLine('1 + 1', '2'), goldenLine('sin(30)', '0.5'), goldenLine('a\nb', 'c\r\nd')]

afterEach(() => {
  fs.rmSync(goldenPath(NAME), { force: true })
})

describe.skipIf(process.env.PHYSLAB_GOLDEN_UPDATE === '1')('golden harness', () => {
  it('passes the same lines, also from a file saved with CRLF line ends', () => {
    fs.writeFileSync(goldenPath(NAME), LINES.join('\r\n') + '\r\n')
    expect(goldenDiff(NAME, LINES)).toEqual([])
    expect(() => expectGolden(NAME, LINES)).not.toThrow()
  })

  it('catches one changed line and says which', () => {
    fs.writeFileSync(goldenPath(NAME), LINES.join('\n') + '\n')
    const changed = [LINES[0], goldenLine('sin(30)', '0.49999999999999994'), LINES[2]]
    expect(goldenDiff(NAME, changed)).toEqual(['line 2:', `  - ${LINES[1]}`, `  + ${changed[1]}`])
    expect(() => expectGolden(NAME, changed)).toThrow(/changed on 1 line/)
  })

  it('catches a line gone and a line added', () => {
    fs.writeFileSync(goldenPath(NAME), LINES.join('\n') + '\n')
    expect(() => expectGolden(NAME, LINES.slice(0, 2))).toThrow(/line 3/)
    expect(() => expectGolden(NAME, [...LINES, 'one more  =>  line'])).toThrow(/line 4/)
  })

  it('keeps every answer on one line', () => {
    expect(LINES[2]).toBe('a ⏎ b  =>  c ⏎ d')
  })

  it('refuses a sweep with no golden file yet, instead of passing it', () => {
    expect(() => expectGolden(NAME, LINES)).toThrow(/No golden file/)
  })
})

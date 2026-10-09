// Golden sweep `pure` (CLEANUP-PLAN.md §2): the Pure Maths screen, through runPure —
// the working title, method, every move line, the answers and the check line.

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { runPure, suggestJob, JOBS, type JobId } from '../../src/renderer/src/math/pure/run'
import type { Working } from '../../src/renderer/src/math/pure/work'
import { resetGlobals } from '../helpers/globals'
import { expectGolden, goldenLine, seenOf, freezeClock } from './harness'
import { BENCH, TABLE_JOBS, COMMAS, HUGE_EXPAND } from './inputs/pure'

vi.mock('../../src/renderer/src/math/cas', () => ({
  tryCas: vi.fn()
}))

beforeAll(freezeClock)
beforeEach(resetGlobals)

function formatWorking(w: Working): string {
  if (w.error) return `ERROR: ${w.error}`
  const out: string[] = []
  out.push(`TITLE: ${w.title}`)
  if (w.method) out.push(`METHOD: ${w.method}`)
  for (const m of w.moves) {
    const parts = [
      m.subgoal ? `[${m.subgoal}]` : '',
      m.head,
      m.rule ? `RULE: ${m.rule}` : '',
      m.tex ? `TEX: ${m.tex}` : '',
      m.note ? `NOTE: ${m.note}` : ''
    ].filter(Boolean)
    out.push(`MOVE: ${parts.join(' | ')}`)
  }
  for (const a of w.answers) {
    out.push(`ANSWER: ${a.label} = ${a.tex}`)
  }
  if (w.check) {
    out.push(`CHECK: ${w.check} [${w.checked ?? 'none'}]`)
  }
  if (w.noWorking) {
    out.push(`NO WORKING: ${w.reason ?? 'none'}`)
  }
  return out.join(' ⏎ ')
}

const seen = (job: JobId, input: string): string =>
  seenOf(() => formatWorking(runPure(job, input)))

function sweep(): string[] {
  const lines: string[] = []
  for (const j of JOBS) {
    lines.push(goldenLine(`JOB ${j.id} ${j.example}`, seen(j.id, j.example)))
  }
  for (const [job, input] of BENCH) {
    lines.push(goldenLine(`BENCH ${job} ${input}`, seen(job, input)))
  }
  for (const input of TABLE_JOBS) {
    lines.push(goldenLine(`TABLE ${input}`, seen('normal', input)))
  }
  for (const input of COMMAS) {
    lines.push(goldenLine(`COMMA ${input}`, seen(suggestJob(input), input)))
  }
  for (const input of HUGE_EXPAND) {
    lines.push(goldenLine(`HUGE ${input}`, seen('expand', input)))
  }
  return lines
}

describe('golden sweep: pure', () => {
  it('is stable: two runs in a row give the same lines', () => {
    expect(sweep()).toEqual(sweep())
  })

  it('matches tests/golden/out/pure.txt', () => {
    expectGolden('pure', sweep())
  })
})

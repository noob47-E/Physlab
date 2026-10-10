// Golden sweep `numbas` (CLEANUP-PLAN.md §2): Numbas .exam out and back in. There are no .exam fixture
// files in the repo (the tests build theirs inline), so the sweep takes the app's own bundled question
// sets: each set is written as an .exam (toExam) and read back (fromExam), and the sweep records what
// comes through — the titles, each part's kind and answer as read back, the import report, and
// whether the read-back questions keep their parts.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fromExam, toExam } from '../../src/renderer/src/questions/numbas'
import { bundledSets, loadBundled } from '../../src/renderer/src/questions/bank'
import { resetGlobals } from '../helpers/globals'
import { expectGolden, goldenLine, seenOf } from './harness'

vi.mock('../../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async () => ({ latex: '', text: '', numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {}, subscribe: () => () => {} },
  CAS_OPS: []
}))

beforeEach(resetGlobals)

const answerOf = (p: object): string => {
  const a = (p as { answer?: unknown }).answer
  return a === undefined ? '' : ` = ${JSON.stringify(a)}`
}

function sweep(): string[] {
  const lines: string[] = []
  const file = loadBundled()
  for (const set of bundledSets(file)) {
    const questions = set.questions
    lines.push(
      goldenLine(
        `SET ${set.title} (${questions.length} questions)`,
        seenOf(() => {
          const exam = toExam({ ...file, questions }, set.title)
          const back = fromExam(exam)
          const out: string[] = []
          if (back.report.length) out.push(`report: ${back.report.join(' | ')}`)
          for (const q of back.file.questions) {
            out.push(`${q.title}: ${q.parts.map((p) => `${p.type}${answerOf(p)}`).join('; ')}`)
          }
          const lost = questions.filter((q, i) => back.file.questions[i]?.parts.length !== q.parts.length).map((q) => q.title)
          out.push(lost.length ? `parts changed in: ${lost.join(', ')}` : 'every question keeps its parts')
          return out.join(' ⏎ ')
        })
      )
    )
  }
  return lines
}

describe('golden sweep: numbas', () => {
  it('is stable: two runs in a row give the same lines', () => {
    expect(sweep()).toEqual(sweep())
  })

  it('matches tests/golden/out/numbas.txt', () => {
    expectGolden('numbas', sweep())
  })
})

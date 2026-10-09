// Golden sweep `questions` (CLEANUP-PLAN.md §2, full): every bundled question on seeds 1–20 through
// the question player — prompt, each part's answer, marks at the tolerance edges and on each trap,
// the worked steps. Unlike the other sweeps it writes an indented block per question and seed
// (QUESTION, SEED, PROMPT, PART, EDGE, TRAP, STEPS) instead of `input  =>  seen` lines: 39,000 lines
// read better that way, and the diff still names each changed line by number.

import { describe, expect, it, beforeEach } from 'vitest'
import { GOLDEN_FULL, expectGolden } from './harness'
import { resetGlobals } from '../helpers/globals'
import { loadBundled } from '../../src/renderer/src/questions/bank'
import { playQuestion, checkPlayedPart } from '../../src/renderer/src/questions/player'
import { DEFAULT_SETTINGS } from '../../src/renderer/src/core/store'
import { SEEDS, EDGE_FACTORS } from './inputs/questions'

beforeEach(resetGlobals)

function sweep(): string[] {
  const lines: string[] = []
  const file = loadBundled()
  
  for (const q of file.questions) {
    lines.push(`QUESTION ${q.id}`)
    for (const seed of SEEDS) {
      const played = playQuestion(q, seed, DEFAULT_SETTINGS)
      lines.push(`  SEED ${seed}: ${played.problem.title}`)
      lines.push(`  PROMPT: ${played.problem.prompt}`)
      
      for (const p of played.parts) {
        lines.push(`    PART ${p.index}: ${p.prompt}`)
        lines.push(`      TEX: ${p.answerTex}`)
        if (p.answerText) lines.push(`      TEXT: ${p.answerText}`)
        
        if (p.field) {
          const val = p.field.value
          const tol = p.field.tol
          if (Number.isFinite(val) && Number.isFinite(tol)) {
            const edges = !(tol > 0) ? [val] : [...EDGE_FACTORS.map((f) => val - f * tol).reverse(), val, ...EDGE_FACTORS.map((f) => val + f * tol)]
            for (const edge of edges) {
              const ans = edge.toString()
              const check = checkPlayedPart(p, ans, played, DEFAULT_SETTINGS)
              lines.push(`      EDGE ${ans} => ${check.verdict} ${check.message || ''}`.trim())
            }
          }
          if (p.field.traps) {
            for (const trap of p.field.traps) {
              const check = checkPlayedPart(p, trap.value.toString(), played, DEFAULT_SETTINGS)
              lines.push(`      TRAP ${trap.value} => ${check.verdict} ${check.message || ''}`.trim())
            }
          }
        }
      }
      
      lines.push(`    STEPS:`)
      for (const move of played.working.moves) {
        lines.push(`      ${move.head} | ${move.tex}`)
      }
      for (const ans of played.working.answers) {
        lines.push(`      ANS: ${ans.label} | ${ans.tex}`)
      }
    }
  }
  // One line per entry, as goldenLine writes them: a newline inside a prompt or a step is shown as ⏎.
  return lines.map((l) => l.replace(/\r?\n/g, ' ⏎ '))
}

describe.skipIf(!GOLDEN_FULL)('golden sweep: questions', () => {
  it('is stable: two runs in a row give the same lines', () => {
    expect(sweep()).toEqual(sweep())
  }, 120_000)

  it('matches tests/golden/out/questions.txt', () => {
    expectGolden('questions', sweep())
  }, 120_000)
})

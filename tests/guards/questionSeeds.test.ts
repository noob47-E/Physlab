// Guard (CLEANUP-PLAN.md CW1): every built-in question on many seeds plays cleanly — nothing
// throws, no variant reports a problem, no answer is NaN, empty or "?", and no prompt, statement
// or worked step still shows a {var} chip unfilled. The `questions` golden sweep records seeds
// 1–20 exactly; this looks wider (1–100) for anything broken at all.

import { describe, expect, it } from 'vitest'
import { loadBundled } from '../../src/renderer/src/questions/bank'
import { playQuestion } from '../../src/renderer/src/questions/player'
import { DEFAULT_SETTINGS } from '../../src/renderer/src/core/store'
import type { PQQuestion } from '../../src/renderer/src/questions/pqjson'

const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1)

/** What is wrong with one question on one seed, in words; empty when nothing is. */
function faults(q: PQQuestion, seed: number): string[] {
  let played: ReturnType<typeof playQuestion>
  try {
    played = playQuestion(q, seed, DEFAULT_SETTINGS)
  } catch (e) {
    return [`throws: ${e instanceof Error ? e.message : String(e)}`]
  }
  const out: string[] = played.problems.map((p) => `problem: ${p}`)
  // A chip, not a LaTeX argument: \mathrm{m}, x^{b}, \frac{a}{b} hold names in braces too.
  const chip = new RegExp(`(?<![A-Za-z^_}])\\{(${q.variables.map((v) => v.name).join('|') || '(?!)'})\\}`)
  const shown = JSON.stringify([played.problem.prompt, played.statement, played.parts.map((p) => [p.prompt, p.promptLines]), played.working])
  const m = shown.match(chip)
  if (m) out.push(`shows ${m[0]} unfilled`)
  for (const p of played.parts) {
    // answerText is the reveal's words for a number, choice or Lego part; every other part reveals answerTex.
    const text = (p.answerText ?? p.answerTex ?? '').trim()
    const needsAnswer = p.part.type !== 'proof'
    if ((needsAnswer && (text === '' || text === '?')) || /NaN/.test(text) || /NaN/.test(p.answerTex ?? '')) out.push(`part ${p.index + 1} (${p.part.type}) answer "${text}"`)
    if (p.field && !Number.isFinite(p.field.value)) out.push(`part ${p.index + 1} value ${p.field.value}`)
  }
  return out
}

describe('guard: every built-in question plays on seeds 1–100', () => {
  const questions = loadBundled().questions
  it.each(questions.map((q) => [q.id, q] as const))('%s', (_id, q) => {
    const found = SEEDS.flatMap((s) => faults(q, s).map((f) => `seed ${s}: ${f}`))
    expect(found.slice(0, 5)).toEqual([])
  })
})

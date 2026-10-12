// The quadratic methods on the S1-gen TRAINING set (1,000 quadratics: rational, double, surd and complex roots in three
// difficulties) and on the scoreboard's "polynomial equations" (G3a). Every answer must equal its key (exact, root by root,
// in ℚ(√d, i)), every step must validate, and every decline is counted with its reason.

import { describe, it, expect } from 'vitest'
import { writeFileSync } from 'node:fs'
import generator from '../../engine/scoreboard/generator.json'
import { TRAINING } from '../corpus/data'
import { createStepRouter } from '../../../src/renderer/src/math/steps/router'
import { S1A_METHODS } from '../../../src/renderer/src/math/steps/methods'
import { quadraticFormulaMethod } from '../../../src/renderer/src/math/steps/methods/quadraticFormula'
import { validateWorking } from '../../../src/renderer/src/math/steps/validate'
import { readSurd } from '../../../src/renderer/src/math/steps/check-adapter'
import { algEq, type Alg } from '../../../src/renderer/src/math/check/field'
import type { Working } from '../../../src/renderer/src/math/steps/types'

const router = createStepRouter(S1A_METHODS)

/** The key's roots: "x = A or x = B", "x = A, x = B" or "x = A (multiplicity 2)", each as a G2-readable text. */
function keyRoots(answer: string): string[] {
  const body = answer.replace(/\s*\(multiplicity \d+\)/g, '').replace(/^x\s*=\s*/, '')
  return body.split(/\s+or\s+|\s*,\s*x\s*=\s*|,\s*/).map((s) => s.replace(/^x\s*=\s*/, '').trim()).filter(Boolean)
}

/** True when the answer's roots are the key's roots, as sets, each equal exactly. */
function sameRoots(got: Alg[], want: Alg[]): boolean {
  if (got.length !== want.length) return false
  return want.every((w) => got.some((g) => algEq(g, w))) && got.every((g) => want.some((w) => algEq(g, w)))
}

interface Outcome {
  id: string
  stratum: string
  declined: boolean
  reason: string
  passed: boolean
  problem: string
}

/** Why the methods decline a quadratic that is not declined by its shape. */
function declineReason(input: string, domain: 'real' | 'complex'): string {
  const powers = [...input.matchAll(/x\s*\^\s*\(?\s*(\d+)/g)].map((m) => Number(m[1]))
  const degree = powers.length ? Math.max(...powers) : 1
  if (degree > 2) return `degree ${degree}, not a quadratic`
  const applies = quadraticFormulaMethod.appliesTo({ job: 'solve', input, variable: 'x', domain } as never)
  if (typeof applies === 'object' && !applies.applies) {
    return /10\s*\^/.test(input) ? 'a coefficient written as a power of ten: not read exactly' : 'not read exactly as a quadratic'
  }
  return 'no method shows its steps'
}

function run(input: string, domain: 'real' | 'complex', key: string[]): { w: Working; ok: boolean; declined: boolean } {
  const w = router.solve({ job: 'solve', input, variable: 'x', domain })
  if (w.noWorking) return { w, ok: false, declined: true }
  const valid = validateWorking(w).valid
  const got = (Array.isArray(w.answer) ? w.answer : w.answer ? [w.answer] : []).map((a) => readSurd(a.value ?? ''))
  if (got.some((g) => g === null)) return { w, ok: false, declined: false }
  const want = key.map((k) => readSurd(k))
  if (want.some((g) => g === null)) return { w, ok: false, declined: false }
  return { w, ok: valid && sameRoots(got as Alg[], want as Alg[]), declined: false }
}

describe('S1-gen TRAINING quadratics: every answer equals its key, every step validates, declines counted', () => {
  it('1,000 items through the quadratic methods', () => {
    const items = TRAINING.families.quadratic.items
    expect(items).toHaveLength(1000)
    const outcomes: Outcome[] = []
    for (const item of items) {
      const domain: 'real' | 'complex' = item.stratum.startsWith('complex') ? 'complex' : 'real'
      const key = keyRoots(item.answer)
      const { w, ok, declined } = run(item.question, domain, key)
      outcomes.push({
        id: item.id,
        stratum: item.stratum,
        declined,
        reason: declined ? declineReason(item.question, domain) : '',
        passed: ok,
        problem: `${item.id} [${item.stratum}] ${item.question} => ${item.answer}${declined ? '' : ` (method ${w.method})`}`
      })
    }
    const failures = outcomes.filter((o) => !o.declined && !o.passed)
    const declines = outcomes.filter((o) => o.declined)
    const byStratum: Record<string, { items: number; passed: number; declined: number; failed: number }> = {}
    for (const o of outcomes) {
      const s = (byStratum[o.stratum] ??= { items: 0, passed: 0, declined: 0, failed: 0 })
      s.items++
      if (o.declined) s.declined++
      else if (o.passed) s.passed++
      else s.failed++
    }
    const report = {
      items: outcomes.length,
      passed: outcomes.filter((o) => o.passed).length,
      declined: declines.length,
      declineReasons: declines.reduce<Record<string, number>>((acc, o) => ({ ...acc, [o.reason]: (acc[o.reason] ?? 0) + 1 }), {}),
      failed: failures.length,
      byStratum,
      declinedItems: declines.map((o) => o.problem),
      failedItems: failures.map((o) => o.problem)
    }
    if (process.env.S1B_CORPUS_OUT) writeFileSync(process.env.S1B_CORPUS_OUT, JSON.stringify(report, null, 2))
    expect(failures.map((o) => o.problem)).toEqual([])
    expect(outcomes.length - declines.length).toBeGreaterThan(900)
  }, 900000)
})

describe('scoreboard polynomial equations (G3a): the quadratics are checked, the others are declined with their reason', () => {
  it('every quadratic gives its key, and every decline is counted with its reason', () => {
    const items = (generator as Array<{ id: string; class: string; stratum: string; question: string; answer: string }>).filter(
      (g) => g.class === 'polynomial equations'
    )
    expect(items).toHaveLength(300)
    const outcomes = items.map((item) => {
      const domain: 'real' | 'complex' = /\bi\b|\*i\b/.test(item.answer) ? 'complex' : 'real'
      const key = keyRoots(item.answer)
      const { ok, declined } = run(item.question, domain, key)
      return {
        id: item.id,
        stratum: item.stratum,
        declined,
        reason: declined ? declineReason(item.question, domain) : '',
        passed: ok,
        problem: `${item.id} [${item.stratum}] ${item.question} => ${item.answer}`
      }
    })
    const failures = outcomes.filter((o) => !o.declined && !o.passed)
    const declines = outcomes.filter((o) => o.declined)
    if (process.env.S1B_G3A_OUT) {
      writeFileSync(
        process.env.S1B_G3A_OUT,
        JSON.stringify(
          {
            items: outcomes.length,
            passed: outcomes.filter((o) => o.passed).length,
            declined: declines.length,
            declineReasons: declines.reduce<Record<string, number>>((acc, o) => ({ ...acc, [o.reason]: (acc[o.reason] ?? 0) + 1 }), {}),
            failed: failures.length,
            failedItems: failures.map((o) => o.problem)
          },
          null,
          2
        )
      )
    }
    expect(failures.map((o) => o.problem)).toEqual([])
  }, 900000)
})

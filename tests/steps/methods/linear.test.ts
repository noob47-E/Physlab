// Tests for the linear equation method (S1a): 300 seeded equations with a known answer, the two
// endings, planted wrong steps (judged by what the bridge renders), and the wording of the sentences.

import { describe, it, expect } from 'vitest'
import { createStepRouter } from '../../../src/renderer/src/math/steps/router'
import { linearOneVarMethod } from '../../../src/renderer/src/math/steps/methods/linearOneVar'
import { validateWorking } from '../../../src/renderer/src/math/steps/validate'
import { renderWorkingToDoc } from '../../../src/renderer/src/math/steps/render'
import type { Working } from '../../../src/renderer/src/math/steps/types'
import { rTex } from '../../../src/renderer/src/math/pure/rat'
import { linearItem, mulberry32 } from './seeded'
import { judge, plantMutants } from './planted'

const router = createStepRouter([linearOneVarMethod])

function solve(input: string, v = 'x'): Working {
  return router.solve({ job: 'solve', input, variable: v })
}

function afters(w: Working): string[] {
  return w.steps.map((s) => String(s.after))
}

/** A copy of the working with one displayed line changed. */
function withAfter(w: Working, index: number, after: string): Working {
  const copy = JSON.parse(JSON.stringify(w)) as Working
  copy.steps[index].after = after
  return copy
}

/** The planted line must be rejected by the validators AND show nothing on the page. */
function expectHidden(w: Working, label: string): void {
  expect(validateWorking(w).valid, `${label}: validators must reject`).toBe(false)
  const doc = renderWorkingToDoc(w)
  expect(doc.noWorking, `${label}: the bridge must report noWorking`).toBe(true)
  expect(doc.moves, `${label}: the bridge must show no moves`).toHaveLength(0)
}

describe('linear method: 300 seeded equations built from a known answer', () => {
  const rng = mulberry32(0x5a1a)
  const items = Array.from({ length: 300 }, () => linearItem(rng))

  it('gets the built answer for every item, and every step validates as valid', () => {
    for (const item of items) {
      const w = solve(item.input, item.v)
      expect(w.noWorking, item.input).toBeFalsy()
      expect(validateWorking(w).valid, item.input).toBe(true)
      const answer = Array.isArray(w.answer) ? w.answer[0] : w.answer
      expect(answer?.label, item.input).toBe(item.v)
      expect(answer?.tex, item.input).toBe(rTex(item.x0))
      expect(w.checked, item.input).toBe('ok')
    }
  }, 120_000) // 300 seeded workings, every step validated: about 6 s alone, 20 s under a full run

  it('finishes each item on the line v = answer, the key line of every working', () => {
    let finished = 0
    for (const item of items) {
      const w = solve(item.input, item.v)
      if (w.steps.length === 0) continue
      expect(afters(w).at(-1), item.input).toBe(`${item.v} = ${rTex(item.x0)}`)
      finished++
    }
    expect(finished).toBeGreaterThan(250)
  })

  it('shows an expansion when there is a bracket, and a clearing step when there is a fraction or decimal', () => {
    for (const item of items) {
      const w = solve(item.input, item.v)
      const rules = w.steps.map((s) => s.rule)
      expect(rules.includes('Expand brackets'), item.input).toBe(item.brackets)
      // A decimal clears by a power of ten ("Clear the decimals"); a fraction by its LCD ("Clear the fractions").
      const clears = rules.includes('Clear the fractions') || rules.includes('Clear the decimals')
      expect(clears, item.input).toBe(item.fractions)
    }
  })

  it('writes every sentence in plain words: no raw ^, no *, no LaTeX braces', () => {
    for (const item of items) {
      for (const step of solve(item.input, item.v).steps) {
        expect(step.sentence, item.input).not.toMatch(/[\^*{}\\]/)
      }
    }
  })

  it('every step declares its move, so no EquationEquiv is left to the "unknown" default', () => {
    for (const item of items) {
      for (const step of solve(item.input, item.v).steps) {
        if (step.kind === 'EquationEquiv') expect(step.op, item.input).toBeDefined()
      }
    }
  })
})

describe('linear method: the two endings', () => {
  it('no value of x works: 0 = 5 is shown, then a SolutionSetEq line says so', () => {
    const w = solve('x + 3 = x + 8')
    expect(validateWorking(w).valid).toBe(true)
    expect(afters(w)).toEqual(['3 = 8', '0 = 8 - 3', '0 = 5', '\\text{no value of x works}'])
    expect(w.steps.at(-1)?.kind).toBe('SolutionSetEq')
    expect(w.answer).toEqual({ label: 'x', tex: '\\text{no value of x works}' })
    expect(w.checked).toBeUndefined()
  })

  it('every real number is a solution: the last line is 0 = 0 and the answer says so', () => {
    const w = solve('x + 3 = x + 3')
    expect(validateWorking(w).valid).toBe(true)
    expect(afters(w)).toEqual(['3 = 3', '0 = 3 - 3', '0 = 0', '\\text{every real number}'])
    expect(w.steps.at(-1)?.kind).toBe('SolutionSetEq')
    expect(w.answer).toEqual({ label: 'x', tex: '\\text{every real number}' })
  })

  it('works through brackets: 2(x + 1) = 2x + 3 has no solution, 3(x - 2) + 4 = 3x - 2 is every real number', () => {
    const none = solve('2(x + 1) = 2x + 3')
    expect(validateWorking(none).valid).toBe(true)
    expect(none.answer).toEqual({ label: 'x', tex: '\\text{no value of x works}' })
    const all = solve('3(x - 2) + 4 = 3x - 2')
    expect(validateWorking(all).valid).toBe(true)
    expect(all.answer).toEqual({ label: 'x', tex: '\\text{every real number}' })
  })

  it('a wrong sum in the constant line is rejected: 0 = 6 written for 8 - 3 = 5', () => {
    const w = solve('x + 3 = x + 8')
    expectHidden(withAfter(w, 2, '0 = 6'), 'wrong sum 0 = 6')
  })

  it('a wrong sum written as an unevaluated line is rejected: 0 = 8 - 2 for 0 = 8 - 3', () => {
    const w = solve('x + 3 = x + 8')
    expectHidden(withAfter(w, 1, '0 = 8 - 2'), 'wrong unevaluated sum')
  })
})

describe('linear method: homogeneous equations (no constant term) are not exempt', () => {
  it('y + 6 = 4y + 6: the wrong line -4y = 0 for -3y = 0 is rejected', () => {
    const w = solve('y + 6 = 4y + 6', 'y')
    expect(afters(w)).toEqual(['-3y + 6 = 6', '-3y = 0', 'y = 0'])
    expectHidden(withAfter(w, 1, '-4y = 0'), 'y + 6 = 4y + 6 → -4y = 0')
  })

  it('y + y = 0: the wrong line 3y = 0 for 2y = 0 is rejected', () => {
    const w = solve('y + y = 0', 'y')
    expect(afters(w)).toEqual(['2y = 0', 'y = 0'])
    expectHidden(withAfter(w, 0, '3y = 0'), 'y + y = 0 → 3y = 0')
  })

  it('y/2 = 0: the wrong line 2y = 0 for y = 0 is rejected', () => {
    const w = solve('y/2 = 0', 'y')
    expect(afters(w)).toEqual(['y = 0'])
    expectHidden(withAfter(w, 0, '2y = 0'), 'y/2 = 0 → 2y = 0')
  })
})

describe('linear method: planted wrong steps are never shown', () => {
  // Each named case takes a real working and makes one step wrong in one way a student meets.
  const base = (input: string) => solve(input)

  const named: { label: string; working: Working; index: number; after: string }[] = [
    { label: 'sign slip: 2x = -8 for 2x = 8', working: base('2x + 3 = 11'), index: 0, after: '2x = -8' },
    { label: 'dropped constant: 2x = 11 for 2x = 8', working: base('2x + 3 = 11'), index: 0, after: '2x = 11' },
    { label: 'wrong divide: x = 2 for 2x = 8', working: base('2x + 3 = 11'), index: 1, after: 'x = 2' },
    { label: 'divide by 0', working: base('2x + 3 = 11'), index: 1, after: 'x = \\frac{4}{0}' },
    { label: 'wrong LCD: 4x + 3 = 12 for 24', working: base('x/3 + 1/4 = 2'), index: 0, after: '4x + 3 = 12' },
    { label: 'wrong LCD: 3x + 1 = 24 for 12', working: base('x/3 + 1/4 = 2'), index: 0, after: '3x + 1 = 24' },
    { label: 'dropped bracket term: 2x + 3 + 4 = 9', working: base('2(x + 3) + 4 = 9'), index: 0, after: '2x + 3 + 4 = 9' },
    { label: 'wrong collect: 2x + 1 = 9', working: base('2(x + 3) + 4 = 9'), index: 1, after: '2x + 1 = 9' },
    { label: 'wrong sum in the constant line: 0 = 6 for 0 = 5', working: base('x + 3 = x + 8'), index: 2, after: '0 = 6' },
    { label: 'zero for the constant line: 0 = 0 for 0 = 5', working: base('x + 3 = x + 8'), index: 2, after: '0 = 0' },
    { label: 'moved x the wrong way: -2x + 5 = -4 for -3x + 5 = -4', working: base('5 - x = 2x - 4'), index: 0, after: '-2x + 5 = -4' },
    { label: 'x-term sign flipped on the right: -x = 2x - 4', working: base('5 - x = 2x - 4'), index: 0, after: '-x = 2x - 4' },
    { label: 'answer off by one: x = 4 for x = 3', working: base('5 - x = 2x - 4'), index: 2, after: 'x = 4' },
    { label: 'wrong number after clearing decimals: 2x + 5 = 13', working: base('0.5x + 1.25 = 3'), index: 0, after: '2x + 5 = 13' }
  ]

  it.each(named.map((n) => [n.label, n] as const))('%s', (_label, n) => {
    expectHidden(withAfter(n.working, n.index, n.after), n.label)
  })

  it('every planted mutant over 60 seeded equations is rejected and hidden, with none accepted', () => {
    const rng = mulberry32(0x91a7)
    let total = 0
    let accepted = 0
    const kinds = new Set<string>()
    for (let i = 0; i < 60; i++) {
      const item = linearItem(rng)
      for (const m of plantMutants(solve(item.input, item.v))) {
        const r = judge(m)
        total++
        kinds.add(m.kind)
        if (r.accepted) accepted++
        expect(r.accepted, `${item.input} ${m.kind}`).toBe(false)
        expect(r.hidden, `${item.input} ${m.kind}`).toBe(true)
      }
    }
    expect(total).toBeGreaterThanOrEqual(15)
    expect(accepted).toBe(0)
    for (const kind of ['bump', 'sign', 'chainBreak', 'noOp', 'mislabel', 'sentence', 'rule', 'check', 'answerValue']) expect(kinds.has(kind), kind).toBe(true)
  }, 120_000) // 634 planted mutants, each rendered: about 10 s alone, 20 s under a full run
})

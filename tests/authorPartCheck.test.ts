// The Question Author's Solution tab, the line under each part's answer. It used to play the
// whole question and show `played.problems[0]` under every part: a part with no answer yet read,
// in red, 'PhysLab could not work out the answer to "", so it cannot mark it.', and part 2's box
// could carry part 1's complaint because the problems were question-wide.

import { describe, expect, it } from 'vitest'
import { blankQuestion, type PQQuestion } from '../src/renderer/src/questions/pqjson'
import { partCheck } from '../src/renderer/src/questions/authoring'
import { playQuestion } from '../src/renderer/src/questions/player'
import type { MeasureSettings } from '../src/renderer/src/math/format'

const SETTINGS = { decimals: 2, precisionMode: 'dp' } as MeasureSettings

const withParts = (answers: string[]): PQQuestion => ({
  ...blankQuestion(),
  title: 'Two parts',
  statement: 'A trolley of mass {m} is pushed with {F}.',
  variables: [
    { name: 'm', def: { kind: 'range', from: 2, to: 6, step: 1 }, unit: 'kg' },
    { name: 'F', def: { kind: 'range', from: 10, to: 20, step: 2 }, unit: 'N' }
  ],
  parts: answers.map((answer, i) => ({ type: 'number', prompt: `Part ${i + 1} asks this.`, answer, unit: 'm/s²', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }))
})

describe('the Solution tab line under each part', () => {
  it('a fresh question: the unanswered part gets a neutral nudge, not a red "could not work out"', () => {
    const c = partCheck(blankQuestion(), 0, 1, SETTINGS)
    expect(c).toEqual({ kind: 'empty', text: 'Write the answer, built from the variables.' })
  })

  it('two parts, one empty and one broken: each box shows its own message', () => {
    const q = withParts(['', 'F / (m - m)'])
    const first = partCheck(q, 0, 1, SETTINGS)
    const second = partCheck(q, 1, 1, SETTINGS)
    expect(first?.kind).toBe('empty')
    expect(second?.kind).toBe('problem')
    expect(second && 'text' in second ? second.text : '').toContain('Part 2 asks this.')
  })

  it('a broken part 1 no longer puts its complaint under a good part 2', () => {
    const q = withParts(['F / (m - m)', 'F / m'])
    const first = partCheck(q, 0, 1, SETTINGS)
    const second = partCheck(q, 1, 1, SETTINGS)
    expect(first?.kind).toBe('problem')
    expect(first && 'text' in first ? first.text : '').toContain('Part 1 asks this.')
    expect(second?.kind).toBe('answer')
    // Row 1's numbers, worked independently: the answer is F / m for them.
    const played = playQuestion(q, 1, SETTINGS)
    expect(second).toMatchObject({ kind: 'answer', text: played.parts[1].answerText })
    expect(played.parts[1].field!.value).toBeCloseTo(played.variant.values.F / played.variant.values.m, 12)
  })

  it('playQuestion files each part’s problem under that part’s key, and keeps the question-wide list', () => {
    const played = playQuestion(withParts(['F / (m - m)', 'F / m']), 1, SETTINGS)
    expect(played.partProblems.p0).toHaveLength(1)
    expect(played.partProblems.p1).toEqual([])
    expect(played.problems).toEqual(played.partProblems.p0)
  })
})

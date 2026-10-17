// Tests for Practice panel fixes
import { describe, expect, it } from 'vitest'
import { adjustHintMessage, checkAnswer } from '../src/renderer/src/math/checkAnswer'
import type { AnswerField } from '../src/renderer/src/math/problems'

const field = (over: Partial<AnswerField> = {}): AnswerField => ({
  key: 'a',
  label: 'A',
  value: 12.5,
  tol: 0.125,
  ...over
})

describe('Finding 9.1: Hint message should match what exists', () => {
  it('shows "Press Hint" message when question has hints', () => {
    const result = checkAnswer('10', field())
    expect(result.verdict).toBe('wrong')
    expect(result.message).toBe('Not quite. Press Hint to see the next step.')
    const adjusted = adjustHintMessage(result, true)
    expect(adjusted.message).toBe('Not quite. Press Hint to see the next step.')
  })

  it('shows "Show the full solution" message when question has no hints', () => {
    const result = checkAnswer('10', field())
    expect(result.verdict).toBe('wrong')
    expect(result.message).toBe('Not quite. Press Hint to see the next step.')
    const adjusted = adjustHintMessage(result, false)
    expect(adjusted.message).toBe('Not quite. Press Show the full solution to see how it is done.')
  })
})

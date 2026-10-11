// P-FIX-TREATAS part B (owner, 2026-10-10 20:42): "When a person removes everything from the command
// bar, or types the correct thing, that should not remain there at all." An error line belongs to the
// line it was given for: once the student changes the line, the red line goes, and a correct line
// never shows an old error.

import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async () => ({ latex: '', text: '', numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {}, subscribe: () => () => {} },
  CAS_OPS: []
}))

import { answerLineOf, editMark } from '../src/renderer/src/app/answerLineOf'
import type { LogEntry } from '../src/renderer/src/core/store'
import { answerStillFor } from '../src/renderer/src/calc/evaluateInput'

const entry = (e: Partial<LogEntry>): LogEntry => ({ id: 1, input: '', kind: 'result', ...e })

describe('the line under the command bar', () => {
  const wrong = entry({ id: 7, input: '2+*3', kind: 'error', text: "I can't read that — check the brackets." })

  it('shows the error for the line just run, while the bar is not touched again', () => {
    expect(answerLineOf([wrong], null)?.kind).toBe('error')
    // Edited before the error came back (the student typed while it ran): the error is newer, so it shows.
    expect(answerLineOf([wrong], 6)?.kind).toBe('error')
  })

  it('drops the error the moment the student changes the bar — emptying it or typing a correct line', () => {
    expect(answerLineOf([wrong], 7)).toBeNull()
  })

  it('shows the right answer once the correct line is run', () => {
    const right = entry({ id: 8, input: '2*3', kind: 'result', text: '6' })
    expect(answerLineOf([wrong, right], 7)).toMatchObject({ kind: 'result', text: '6' })
  })

  it('an engine line rewritten in place as an error after the student typed still shows; the next edit takes it away', () => {
    const pending = entry({ id: 9, input: 'solve x^2 = -1', kind: 'info', text: 'Solving…' })
    const typedWhilePending = editMark([pending])
    const landed = { ...pending, kind: 'error' as const, text: 'No real solution.' }
    expect(answerLineOf([landed], typedWhilePending)?.kind).toBe('error')
    expect(answerLineOf([landed], editMark([landed]))).toBeNull()
  })

  it('leaves an answer as it is today: it stays under the bar while the next line is typed', () => {
    const answer = entry({ id: 9, input: '2*3', kind: 'result', text: '6' })
    expect(answerLineOf([answer], 9)).toMatchObject({ kind: 'result', text: '6' })
  })
})

describe('the Maths screen (already so: the answer, error included, belongs to its line)', () => {
  const answered = { input: '2+\\times3', result: { error: { sentence: "I can't read that." } } }
  it('an error under a line goes when the line is emptied or changed', () => {
    expect(answerStillFor(answered, '')).toBeNull()
    expect(answerStillFor(answered, '2\\times3')).toBeNull()
    expect(answerStillFor(answered, '2+\\times3')).toBe(answered)
  })
})

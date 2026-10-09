// P-GCALC GC3: the answer line under the command bar. With the Console closed by default, the
// bar's newest answer or message must still be on screen, with the buttons the Console gives it.

import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/math/cas', () => ({
  cas: vi.fn(async () => ({ latex: '', text: '', numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {}, subscribe: () => () => {} },
  CAS_OPS: []
}))

import { ANSWER_COLOUR, answerLineOf } from '../src/renderer/src/app/answerLineOf'
import { runCommand } from '../src/renderer/src/lang/commands'
import { scene, type LogEntry } from '../src/renderer/src/core/store'
import { resetGlobals } from './helpers/globals'
import { readSource } from './helpers/repo'

const entry = (e: Partial<LogEntry>): LogEntry => ({ id: 1, input: '', kind: 'result', ...e })

describe('answerLineOf', () => {
  it('shows nothing before anything is typed', () => {
    expect(answerLineOf([])).toBeNull()
  })

  it('shows the newest entry, not the first', () => {
    const line = answerLineOf([entry({ id: 1, text: 'first' }), entry({ id: 2, text: 'second', kind: 'error' })])
    expect(line).toEqual({ text: 'second', tex: undefined, kind: 'error', steps: false, working: false, visualize: false })
  })

  it('offers the buttons the Console offers that entry', () => {
    const line = answerLineOf([entry({ tex: 'x = 2', solution: {} as never, working: () => {}, visualize: () => {} })])
    expect(line).toMatchObject({ tex: 'x = 2', steps: true, working: true, visualize: true })
  })

  it('colours an error as an error and a message quieter than an answer', () => {
    expect(ANSWER_COLOUR).toEqual({ result: 'var(--text)', error: 'var(--bad)', info: 'var(--text-dim)' })
  })

  it('shows what the bar really answered, through the real route', async () => {
    resetGlobals()
    scene().newScene()
    scene().clearLog()
    scene().setActiveSpace('graphing')
    await runCommand('2 + 3')
    expect(answerLineOf(scene().log)?.kind).toBe('result')
    await runCommand('sin at 30 ++')
    expect(answerLineOf(scene().log)?.kind).toBe('error')
  })
})

describe('where it is drawn', () => {
  it('sits directly under the command bar', () => {
    expect(readSource('src/renderer/src/app/CommandBar.tsx')).toMatch(/<\/div>\s*\{\/\*[^*]*\*\/\}\s*<AnswerLine \/>/)
  })

  it('uses the Console entry\'s own button words, and opens the Console', () => {
    const src = readSource('src/renderer/src/app/AnswerLine.tsx')
    const consoleSrc = readSource('src/renderer/src/panels/Console.tsx')
    for (const word of ['Steps', 'Show the working', 'Visualize']) {
      expect(src).toContain(`/> ${word}`)
      expect(consoleSrc).toContain(`/> ${word}`)
    }
    expect(src).toContain("showPanel('console')")
    expect(src).toContain('pointer-coarse:min-h-[44px]')
  })
})

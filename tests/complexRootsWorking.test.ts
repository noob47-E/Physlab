// C1: a quadratic with a negative discriminant, in the Calculator's working.
//
// The checked step framework used to answer x² − 2x + 8 = 0 with "No real solution" and worked the
// discriminant out only after that line, with no complex roots at all. Such a line is now answered by
// the older engine (math/pure/complex/solve.ts): the discriminant first, the sentence that there is no
// real solution, then the exact complex roots, each checked by putting it back into the equation.
// Every test goes through usePure.runLatex, the same door the Calculator's "Show the working" uses.
// LaTeX is written with String.raw so every backslash is the one the working really prints.

import { beforeEach, describe, expect, it } from 'vitest'
import { usePure } from '../src/renderer/src/math/pure/store'
import { stepWorkingFor } from '../src/renderer/src/math/steps/solve'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  usePure.setState({ working: null, input: '', inputLatex: '', history: [] })
})

/** Each typed line with its two exact complex roots, written the way the working writes them. */
const CASES: [string, string[]][] = [
  ['x^2-2x+8=0', [String.raw`1 + \sqrt{7}i`, String.raw`1 - \sqrt{7}i`]],
  ['-x^2+2x-8=0', [String.raw`1 + \sqrt{7}i`, String.raw`1 - \sqrt{7}i`]],
  ['x^2+x+1=0', [String.raw`-\frac{1}{2} + \frac{1}{2}\sqrt{3}i`, String.raw`-\frac{1}{2} - \frac{1}{2}\sqrt{3}i`]],
  ['x^2+4=0', ['2i', '-2i']],
  ['2x^2+3x+5=0', [String.raw`-\frac{3}{4} + \frac{1}{4}\sqrt{31}i`, String.raw`-\frac{3}{4} - \frac{1}{4}\sqrt{31}i`]]
]

type Move = { head: string; tex?: string }

/** The move that works the discriminant out, identified by its value line. */
const discriminantMove = (moves: Move[]): number => moves.findIndex((m) => (m.tex ?? '').includes(String.raw`\Delta = b^2 - 4ac =`))

/** The move that says there is no real solution. */
const noRealMove = (moves: Move[]): number => moves.findIndex((m) => /no real solution/i.test(m.head) || /no real solution/i.test(m.tex ?? ''))

/** The move that gives the two roots, joined by "or". */
const rootsMove = (moves: Move[]): number => moves.findIndex((m) => (m.tex ?? '').includes(String.raw`\text{or}`))

describe('C1: a negative discriminant gives the exact complex roots in the working', () => {
  it.each(CASES)('%s: the working is checked and its answers are the exact complex roots', (line, roots) => {
    usePure.getState().runLatex(line, 'auto')
    const w = usePure.getState().working
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.checked).toBe('ok')
    expect(w?.answers.map((a) => a.tex).sort()).toEqual([...roots].sort())
    // No answer may be the "No real solution" line or a decimal.
    for (const a of w?.answers ?? []) {
      expect(a.tex).not.toMatch(/No real solution/)
      expect(a.tex).not.toMatch(/\d\.\d/)
    }
  })

  it.each(CASES)('%s: the discriminant is worked out before the line that says there is no real solution, and that before the roots', (line) => {
    usePure.getState().runLatex(line, 'auto')
    const moves = usePure.getState().working?.moves ?? []
    const disc = discriminantMove(moves)
    const none = noRealMove(moves)
    const roots = rootsMove(moves)
    expect(disc).toBeGreaterThanOrEqual(0)
    expect(none).toBeGreaterThan(disc)
    expect(roots).toBeGreaterThan(none)
  })

  it.each(CASES)('%s: the step framework hands this line over, so the older engine answers it', (line) => {
    expect(stepWorkingFor({ job: 'solve', input: line, rawInput: line })).toBeNull()
  })

  it('x^2-5x+6=0 still factorises, with the same two rational roots', () => {
    usePure.getState().runLatex('x^2-5x+6=0', 'auto')
    const w = usePure.getState().working
    expect(w?.error).toBeUndefined()
    expect(w?.method).toBe('Factorising')
    expect(w?.answers.map((a) => a.tex)).toEqual(['2', '3'])
    expect(w?.checked).toBe('ok')
  })

  it('x^3-1=0 keeps its real working, with 1 as the only real answer', () => {
    usePure.getState().runLatex('x^3-1=0', 'auto')
    const w = usePure.getState().working
    expect(w?.error).toBeUndefined()
    expect(w?.answers.map((a) => a.tex)).toEqual(['1'])
    expect(w?.checked).toBe('ok')
    expect(stepWorkingFor({ job: 'solve', input: 'x^3-1=0', rawInput: 'x^3-1=0' })).not.toBeNull()
  })
})

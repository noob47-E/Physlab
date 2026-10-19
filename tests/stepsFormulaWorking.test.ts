// The Calculator's quadratic formula working (Another way, or the primary method when the roots are not rational).
//
// The student asked for the formula to be worked in order: read off a, b and c, work out the discriminant, put the
// numbers into x = (−b ± √(b² − 4ac)) / (2a), then give the answers. The moves are what the Working panel draws, in
// the order it draws them, so this file reads them from the store exactly as the panel does.

import { beforeEach, describe, expect, it } from 'vitest'
import { usePure } from '../src/renderer/src/math/pure/store'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  usePure.setState({ working: null, input: '', inputLatex: '', history: [] })
})

/** The formula working for a line: the primary working when the formula is the method, else its Another way. */
function formulaOf(latex: string) {
  usePure.getState().runLatex(latex, 'auto', { quiet: true })
  const w = usePure.getState().working
  expect(w).not.toBeNull()
  expect(w?.error).toBeUndefined()
  const formula = w?.method === 'Quadratic formula' ? w : w?.anotherWay
  return { w, formula }
}

/** The move that names a, b and c with their values (the minus sign is the typographic one the panel draws). */
function namesABC(head: string): boolean {
  return /a = 1\b/.test(head) && /b = [−-]5\b/.test(head) && /c = 6\b/.test(head)
}

describe('Calculator: the quadratic formula is worked in order', () => {
  it('x^2-5x+6=0: a, b, c, then the discriminant, then the formula with ±, then the answers 2 and 3', () => {
    const { formula } = formulaOf('x^2-5x+6=0')
    expect(formula?.method).toBe('Quadratic formula')
    expect(formula?.checked).toBe('ok')
    const moves = formula!.moves

    const iABC = moves.findIndex((m) => namesABC(m.head))
    const iDisc = moves.findIndex((m) => /discriminant/i.test(m.head) && /is 1\.?$/.test(m.head))
    const iFormula = moves.findIndex((m) => (m.tex ?? '').includes('\\pm'))
    const iFinal = moves.length - 1

    expect(iABC).toBeGreaterThanOrEqual(0)
    expect(iDisc).toBeGreaterThanOrEqual(0)
    expect(iABC).toBeLessThanOrEqual(iDisc)
    expect(iFormula).toBeGreaterThan(iDisc)
    expect(iFinal).toBeGreaterThan(iFormula)

    const formulaTex = moves[iFormula].tex ?? ''
    expect(formulaTex).toMatch(/\\pm/)
    expect(formulaTex).toMatch(/\\frac/)
    expect(formulaTex).toMatch(/5/)

    expect(moves[iFinal].tex ?? moves[iFinal].head).toMatch(/x = 2.*x = 3/)
    expect(formula!.answers).toEqual([
      { label: 'x', tex: '2' },
      { label: 'x', tex: '3' }
    ])
  })

  it('x^2+2x-1=0: the discriminant 8 and the ± formula are shown, and the surd roots -1 ± √2 are checked', () => {
    const { formula } = formulaOf('x^2+2x-1=0')
    expect(formula?.method).toBe('Quadratic formula')
    expect(formula?.checked).toBe('ok')
    const moves = formula!.moves

    const iDisc = moves.findIndex((m) => /discriminant/i.test(m.head) && /is 8\.?$/.test(m.head))
    const iFormula = moves.findIndex((m) => (m.tex ?? '').includes('\\pm'))
    expect(iDisc).toBeGreaterThanOrEqual(0)
    expect(iFormula).toBeGreaterThan(iDisc)
    expect(moves[moves.length - 1].tex ?? '').toMatch(/\\sqrt\{2\}/)
    expect(formula!.answers.map((a) => a.tex)).toEqual(['-1-\\sqrt{2}', '-1+\\sqrt{2}'])
  })

  it('2x^2-3x-2=0: the roots -1/2 and 2 come from the formula, in order, with the ± step shown', () => {
    const { formula } = formulaOf('2x^2-3x-2=0')
    expect(formula?.method).toBe('Quadratic formula')
    expect(formula?.checked).toBe('ok')
    const moves = formula!.moves

    const iDisc = moves.findIndex((m) => /discriminant/i.test(m.head) && /is 25\.?$/.test(m.head))
    const iFormula = moves.findIndex((m) => (m.tex ?? '').includes('\\pm'))
    expect(iDisc).toBeGreaterThanOrEqual(0)
    expect(iFormula).toBeGreaterThan(iDisc)
    expect(formula!.answers.map((a) => a.tex)).toEqual(['-\\frac{1}{2}', '2'])
  })

  it('x^2+x+1=0: the discriminant -3 is worked out before the conclusion "No real solution"', () => {
    const { formula } = formulaOf('x^2+x+1=0')
    expect(formula?.method).toBe('Quadratic formula')
    expect(formula?.checked).toBe('ok')
    const moves = formula!.moves

    const iDisc = moves.findIndex((m) => /discriminant/i.test(m.head) && /is [−-]3\.?$/.test(m.head))
    const iEnd = moves.length - 1
    expect(iDisc).toBeGreaterThanOrEqual(0)
    expect(iDisc).toBeLessThan(iEnd)
    expect(moves[iEnd].tex ?? moves[iEnd].head).toMatch(/No real solution/)
  })

  it('2x^2+4x=6: the equation is moved to one side and divided by 2 before the discriminant is worked out, so a, b and c are read off the line that gives them', () => {
    const { formula } = formulaOf('2x^2+4x=6')
    expect(formula?.method).toBe('Quadratic formula')
    expect(formula?.checked).toBe('ok')
    const moves = formula!.moves

    const iMove = moves.findIndex((m) => /^Move every term to the left side/.test(m.head))
    const iDivide = moves.findIndex((m) => /^Divide every term/.test(m.head))
    const iDisc = moves.findIndex((m) => /With a = 1, b = 2 and c = [−-]3,/.test(m.head) && /is 16\.?$/.test(m.head))
    const iFormula = moves.findIndex((m) => (m.tex ?? '').includes('\\pm'))

    expect(iMove).toBeGreaterThanOrEqual(0)
    expect(iDivide).toBeGreaterThan(iMove)
    expect(iDisc).toBeGreaterThan(iDivide)
    expect(iFormula).toBeGreaterThan(iDisc)
    expect(moves[iDisc].subgoal).toBe('Discriminant')
    expect(formula!.answers).toEqual([
      { label: 'x', tex: '-3' },
      { label: 'x', tex: '1' }
    ])
  })
})

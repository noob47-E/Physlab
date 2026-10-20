// The Calculator's quadratic formula working (Another way, or the primary method when the roots are not rational).
//
// The student asked for the formula to be worked in order: read off a, b and c, work out the discriminant, put the
// numbers into x = (−b ± √(b² − 4ac)) / (2a), then give the answers. The moves are what the Working panel draws, in
// the order it draws them, so this file reads them from the store exactly as the panel does.

import { beforeEach, describe, expect, it } from 'vitest'
import { usePure } from '../src/renderer/src/math/pure/store'
import { evaluateInput } from '../src/renderer/src/calc/evaluateInput'
import { reconcile } from '../src/renderer/src/calc/working'
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

  // Phase-0.9 (batch 36, merged into this branch) deliberately hands a real quadratic with no real root to the older
  // complex engine, so the Calculator shows the two complex roots exactly, worked out from the discriminant — not the
  // step framework's "No real solution" ending (that ending is still what the formula method itself gives, and
  // tests/steps/methods/quadratic.test.ts pins it). This test is the Calculator-facing one, so it follows the merge.
  it('x^2+x+1=0: the discriminant -3 is worked out before the exact complex roots', () => {
    const { formula } = formulaOf('x^2+x+1=0')
    expect(formula?.method).toBe('Quadratic formula')
    expect(formula?.checked).toBe('ok')
    const moves = formula!.moves

    const iDisc = moves.findIndex((m) => /Work out the discriminant/.test(m.subgoal ?? ''))
    const iKind = moves.findIndex((m) => /The discriminant is negative/.test(m.head))
    const iRoots = moves.findIndex((m) => /Take the plus and the minus in turn/.test(m.head))
    expect(iDisc).toBeGreaterThanOrEqual(0)
    expect(iKind).toBeGreaterThan(iDisc)
    expect(iRoots).toBeGreaterThan(iKind)
    expect(moves[iDisc].tex ?? '').toContain('-3')
    expect(formula!.answers.map((a) => a.tex)).toEqual([
      '-\\frac{1}{2} + \\frac{1}{2}\\sqrt{3}i',
      '-\\frac{1}{2} - \\frac{1}{2}\\sqrt{3}i'
    ])
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

describe('Calculator: the card reads a surd root the way the working writes it', () => {
  // A letter other than x makes "=" refuse, so the card falls back on the working's own checked answers. Those answers
  // are written as \frac{-1-\sqrt{5}}{2}; the card's plain text must keep the whole fraction, not flatten it.
  it('z^2+z-1=0: the card shows (-1-√5)/2 and (-1+√5)/2, not "-1-√52"', () => {
    usePure.getState().runLatex('z^2+z-1=0', 'auto', { quiet: true })
    const w = usePure.getState().working
    expect(w?.checked).toBe('ok')
    const card = evaluateInput('COMP', 'z^2+z-1=0', { vars: {}, ans: 0, angle: 'deg' })!
    const r = reconcile(card, w)
    expect(r.result.main).toContain('(-1-√5)/2')
    expect(r.result.main).toContain('(-1+√5)/2')
    expect(r.result.main).not.toContain('√52')
  })

  it('u^2-3u+1=0: the card shows (3-√5)/2 and (3+√5)/2', () => {
    usePure.getState().runLatex('u^2-3u+1=0', 'auto', { quiet: true })
    const w = usePure.getState().working
    expect(w?.checked).toBe('ok')
    const card = evaluateInput('COMP', 'u^2-3u+1=0', { vars: {}, ans: 0, angle: 'deg' })!
    const r = reconcile(card, w)
    expect(r.result.main).toContain('(3-√5)/2')
    expect(r.result.main).toContain('(3+√5)/2')
    expect(r.result.main).not.toContain('√52')
  })
})

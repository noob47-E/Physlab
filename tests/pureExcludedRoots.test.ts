// A fraction can hide a value the equation does not allow. parseExpr cancels x²/x down to x before
// any root is found, so the solver answers x = 0 for \frac{x^2}{x} = 0 and checks it against the
// cancelled sides, which pass. At x = 0 the typed fraction is 0/0, so the answer is not allowed.
// The working must leave such a root out and say why, and must keep every root the typed text
// allows.
//
// This goes through the Pure Math store, as the panel does, because the store is where the
// step framework is tried first and the solver is only the fallback.

import { describe, expect, it, vi } from 'vitest'
import { usePure } from '../src/renderer/src/math/pure/store'
import { runPure } from '../src/renderer/src/math/pure/run'
import type { Working } from '../src/renderer/src/math/pure/work'
import { evaluateInput, type EvalResult } from '../src/renderer/src/calc/evaluateInput'
import { reconcile } from '../src/renderer/src/calc/working'

// The algebra engine is replaced by a spy so a test can see whether the panel asked it at all.
// Everything else in the engine module stays the real one.
const askSpy = vi.hoisted(() => ({ ask: vi.fn() }))
vi.mock('../src/renderer/src/math/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/renderer/src/math/engine')>()
  return { ...actual, ask: (...args: unknown[]) => askSpy.ask(...args) }
})

/** A line typed as LaTeX, run the way the panel runs it, with no algebra-engine fallback. */
function solveTyped(latex: string): Working {
  usePure.getState().runLatex(latex, 'auto', { quiet: true })
  const w = usePure.getState().working
  if (!w) throw new Error('the store did not produce a working')
  return w
}

const answersOf = (w: Working): string[] => w.answers.map((a) => a.tex)

describe('a root that makes a typed denominator 0 is not an answer', () => {
  it.each([
    ['\\frac{x^2}{x}=0'],
    ['\\frac{x^2+3x}{x}=3'],
    ['\\frac{x^3}{x}=0'],
    ['\\frac{x^2+x}{x}=1'],
    ['\\frac{2x^2}{x}=0'],
    ['\\frac{x^4}{x^2}=0']
  ])('%s gives no answer, with the reason in words', (latex) => {
    const w = solveTyped(latex)
    expect(answersOf(w)).toEqual([])
    expect(w.checked).toBeUndefined()
    expect(w.error).toBe('No value of x works. x = 0 makes a denominator 0, so it is not allowed.')
  })

  it('does not say every value works when the cancelled sides agree but the typed fraction is 0/0 at 0', () => {
    // x²/x = x cancels to x = x, which every value satisfies. The typed left side is 0/0 at x = 0, so
    // "every value works" would be false: the sentence has to leave that one value out.
    const w = solveTyped('\\frac{x^2}{x}=x')
    expect(w.error).toBe('Both sides are the same, so every value of x works except x = 0, which makes a denominator 0.')
  })

  it('keeps the root the fraction allows and says which one it left out', () => {
    // (x³ − 2x²)/x = 0 cancels to x² − 2x = 0, whose roots are 0 and 2. Only 2 is allowed.
    const w = solveTyped('\\frac{x^3-2x^2}{x}=0')
    expect(w.error).toBeUndefined()
    expect(answersOf(w)).toEqual(['2'])
    expect(w.checked).toBe('ok')
    expect(w.moves.map((m) => m.head)).toContain('x = 0 makes a denominator 0, so it is not allowed.')
    expect(w.check).toMatch(/x = 2/)
  })
})

describe('equations that are not affected', () => {
  it('still solves a quadratic with two rational roots', () => {
    expect(answersOf(solveTyped('x^2-5x+6=0')).sort()).toEqual(['2', '3'])
  })

  it('still solves a linear equation', () => {
    expect(answersOf(solveTyped('2x+4=10'))).toEqual(['3'])
  })

  it('still gives x = 0 when there is no fraction', () => {
    expect(answersOf(solveTyped('x^2=0'))).toEqual(['0'])
  })

  it('still gives the complex roots of x² + 4 = 0', () => {
    const w = runPure('solve', 'x^2 + 4 = 0')
    expect(w.error).toBeUndefined()
    expect(answersOf(w)).toEqual(['2i', '-2i'])
  })

  it('does not shut out a root when the fraction has a denominator that is not 0 there', () => {
    expect(answersOf(solveTyped('\\frac{x}{2}=3'))).toEqual(['6'])
  })

  it('keeps a root even when a large power would overflow a double', () => {
    // x¹⁰⁰⁰ and x⁹⁹⁹ both overflow a double at x = 3, which would read as ∞/∞ = NaN and wrongly
    // refuse the root. The check is worked out with BigNumber, so 3¹⁰⁰⁰/3⁹⁹⁹ = 3 is still allowed.
    expect(answersOf(solveTyped('\\frac{x^{1000}}{x^{999}}=3'))).toEqual(['3'])
  })
})

describe('a fraction with a bracket on the bottom', () => {
  it('multiplies out to x²−4 = 4(x−2) and leaves out x = 2, where the typed bottom is 0', () => {
    // The only root of the multiplied-out equation is the double root 2, and the typed bottom x−2 is 0 there,
    // so no value of x works. The answer is not x = 2 and it is not a bracket refusal.
    const w = solveTyped('\\frac{x^2-4}{x-2}=4')
    expect(answersOf(w)).toEqual([])
    expect(w.checked).toBeUndefined()
    expect(w.error).toBe('No value of x works. x = 2 makes a denominator 0, so it is not allowed.')
    expect(w.finalRefusal).toBe(true)
  })

  it('still gives the root a bracket bottom allows: 1/(x+1) = 2 is −1/2', () => {
    // 1 = 2(x+1) has the root −1/2, which does not make the bottom x+1 zero, so the answer stands and is checked.
    const w = solveTyped('\\frac{1}{x+1}=2')
    expect(w.error).toBeUndefined()
    expect(w.checked).toBe('ok')
    expect(answersOf(w)).toHaveLength(1)
    expect(answersOf(w)[0]).toMatch(/frac\{1\}\{2\}/)
    expect(answersOf(w)[0]).toMatch(/-/)
  })

  it('says every value works except the one the bracket bottom makes 0, when both sides are the same', () => {
    // (x²−4)/(x−2) = x+2 cancels to x²−4 = (x+2)(x−2), the same on both sides; the typed bottom is 0 at x = 2.
    const w = solveTyped('\\frac{x^2-4}{x-2}=x+2')
    expect(w.error).toBe('Both sides are the same, so every value of x works except x = 2, which makes a denominator 0.')
  })
})

// ---------------------------------------------------------------- review round 2 (K4 fixer)
//
// The checkers found that the = card showed x near 0 under a refusal that allows no value, that a power of three
// or more asked the algebra engine and got x = 0, that a bracket bottom showed x = 2, and that a bottom holding a
// second letter was blamed on the letter solved for. Each one is pinned below.

describe('the = card gives way to a refusal that allows no value', () => {
  it.each([['\\frac{x^2}{x}=0'], ['\\frac{x^2-4}{x-2}=4'], ['\\frac{x^4}{x}=0'], ['\\frac{x^2}{x}=2x']])(
    '%s with x stored as 3 shows the refusal, with no number',
    (latex) => {
      const card = evaluateInput('COMP', latex, { vars: { x: 3 }, ans: 0, angle: 'deg' })
      expect(card).not.toBeNull()
      const w = solveTyped(latex)
      expect(w.finalRefusal).toBe(true)
      const shown = reconcile(card as EvalResult, w).result
      expect(shown.error?.sentence).toBe(w.error)
      expect(shown.value).toBeUndefined()
      expect(shown.solved).toBeFalsy()
      expect(shown.unconfirmed).toBe(true)
    }
  )

  it.each([
    ['\\frac{x^2+3x}{x}=3'],
    ['\\frac{x^3}{x}=0'],
    ['\\frac{x^2+x}{x}=1'],
    ['\\frac{2x^2}{x}=0'],
    ['\\frac{x^4}{x^2}=0'],
    ['\\frac{x^2}{x}=2x']
  ])('%s shows no number for any stored x (3, 0.5, -2, 7)', (latex) => {
    const w = solveTyped(latex)
    expect(w.finalRefusal).toBe(true)
    for (const stored of [3, 0.5, -2, 7]) {
      const card = evaluateInput('COMP', latex, { vars: { x: stored }, ans: 0, angle: 'deg' })
      expect(card).not.toBeNull()
      const shown = reconcile(card as EvalResult, w).result
      expect(shown.error?.sentence).toBe(w.error)
      expect(shown.value).toBeUndefined()
    }
  })

  it('leaves a card that is already a refusal as it is', () => {
    const w = solveTyped('\\frac{x^2}{x}=0')
    const refusal: EvalResult = { main: '', src: 'x^2/x=0', error: { sentence: 'Typing x = 5 does not store a value.' } }
    expect(reconcile(refusal, w).result).toEqual(refusal)
  })
})

describe('a power of three or more does not bring back a root a bottom forbids', () => {
  it('\\frac{x^4}{x}=0 has no value, and the algebra engine is not asked to find x = 0', () => {
    askSpy.ask.mockClear()
    askSpy.ask.mockResolvedValue({ solutions: [{ x: { latex: '0' } }] })
    usePure.getState().runLatex('\\frac{x^4}{x}=0', 'auto')
    const w = usePure.getState().working
    expect(askSpy.ask).not.toHaveBeenCalled()
    expect(w?.answers).toEqual([])
    expect(w?.error).toBe('No value of x works. x = 0 makes a denominator 0, so it is not allowed.')
  })

  it.each([['\\frac{x^5}{x^2}=0'], ['\\frac{x^3-2x^2}{x^2}=0']])('%s: the power refusal is final only where the bottom shares the root 0', (latex) => {
    // x⁵/x² cancels to x³, whose only root 0 is forbidden. (x³−2x²)/x² cancels to x−2, a line, and gives 2.
    const w = solveTyped(latex)
    if (latex === '\\frac{x^5}{x^2}=0') {
      expect(w.error).toBe('No value of x works. x = 0 makes a denominator 0, so it is not allowed.')
    } else {
      expect(w.error).toBeUndefined()
      expect(answersOf(w)).toEqual(['2'])
    }
  })

  it('\\frac{x^4-x}{x}=0 keeps its power-3 refusal, because its other root 1 is not forbidden', () => {
    // x⁴−x over x cancels to x³−1, which has no root at 0, so the step engine's refusal is not made final and the engine may answer.
    const w = solveTyped('\\frac{x^4-x}{x}=0')
    expect(w.error).toMatch(/power-3/)
    expect(w.finalRefusal).toBeUndefined()
  })
})

describe('a bottom holding a letter other than the one solved for', () => {
  it('\\frac{ab}{a}=0 solves for b, and notes that a is not 0 instead of refusing b = 0', () => {
    // The bottom holds a, not b, so b = 0 is allowed; only a = 0 is not, and the answer says so.
    const w = solveTyped('\\frac{ab}{a}=0')
    expect(w.error).toBeUndefined()
    expect(w.checked).toBe('ok')
    expect(answersOf(w)).toEqual(['0'])
    expect(w.check).toMatch(/Only where a is not 0/)
  })

  it('\\frac{xy}{x}=2 gives y = 2 with the note that x is not 0', () => {
    const w = solveTyped('\\frac{xy}{x}=2')
    expect(w.error).toBeUndefined()
    expect(w.checked).toBe('ok')
    expect(answersOf(w)).toEqual(['2'])
    expect(w.check).toMatch(/Only where x is not 0/)
  })

  it('a bottom holding the unknown and another letter is refused by the letter count, not answered', () => {
    const w = solveTyped('\\frac{x}{x+y}=0')
    expect(answersOf(w)).toEqual([])
    expect(w.error).toMatch(/exactly one letter/)
  })
})

// ---------------------------------------------------------------- review round 1 (K4 fixer)
//
// Two checkers found that a fraction coefficient such as 1/3 made the old reader throw, which kept
// the excluded root, and that a typed ÷ skipped the check. The root 0 is now decided from the typed
// division itself, with exact arithmetic, so none of these may show x = 0 as checked.

const NO_VALUE_ZERO = 'No value of x works. x = 0 makes a denominator 0, so it is not allowed.'

describe('a non-terminating fraction coefficient does not keep an excluded root', () => {
  it.each([
    ['\\frac{x^2}{x}=\\frac{1}{3}x'],
    ['\\frac{x^2}{x}=\\frac{2}{3}x'],
    ['\\frac{x^2}{x}+\\frac{1}{3}=\\frac{1}{3}'],
    ['\\frac{1}{3}\\cdot\\frac{x^2}{x}=0'],
    ['\\frac{x^3}{x}=\\frac{1}{3}x^2'],
    ['\\frac{x^2}{x}+x\\cdot\\frac{1}{3}=0']
  ])('%s gives no answer and no tick', (latex) => {
    const w = solveTyped(latex)
    expect(answersOf(w)).toEqual([])
    expect(w.checked).toBeUndefined()
    expect(w.error).toBe(NO_VALUE_ZERO)
  })

  it.each([
    ['\\frac{x^3}{x}=\\frac{1}{3}x'],
    ['\\frac{x^3-\\frac{1}{3}x^2}{x}=0'],
    ['\\frac{2x^5+2x^4}{x^3}=\\frac{2}{7}x']
  ])('%s keeps only the root the fraction allows', (latex) => {
    const w = solveTyped(latex)
    expect(w.error).toBeUndefined()
    expect(w.checked).toBe('ok')
    expect(answersOf(w)).toHaveLength(1)
    expect(answersOf(w)).not.toContain('0')
  })

  it('says "every value works except x = 0" when the cancelled sides agree and a fraction coefficient is present', () => {
    const w = solveTyped('\\frac{x^2}{x}=x+\\frac{1}{3}-\\frac{1}{3}')
    expect(w.error).toBe('Both sides are the same, so every value of x works except x = 0, which makes a denominator 0.')
  })
})

describe('a typed division sign is read like the other spellings of division', () => {
  it('x^2÷x=0 gives no answer and no tick', () => {
    const w = solveTyped('x^2÷x=0')
    expect(answersOf(w)).toEqual([])
    expect(w.checked).toBeUndefined()
    expect(w.error).toBe(NO_VALUE_ZERO)
  })

  it('x^2 ÷ x = 0 with spaces gives no answer and no tick', () => {
    const w = solveTyped('x^2 ÷ x = 0')
    expect(answersOf(w)).toEqual([])
    expect(w.checked).toBeUndefined()
  })
})

describe('an excluded root is decided exactly, so a kept root is not refused by rounding', () => {
  it.each([
    ['\\frac{3x^3-7x^2}{x}=0', '\\frac{7}{3}'],
    ['\\frac{7x^3-x^2}{x}=0', '\\frac{1}{7}'],
    ['\\frac{11x^3-x^2}{x}=0', '\\frac{1}{11}']
  ])('%s keeps its non-zero root as ok', (latex, root) => {
    const w = solveTyped(latex)
    expect(w.error).toBeUndefined()
    expect(w.checked).toBe('ok')
    expect(answersOf(w)).toEqual([root])
  })
})

describe('the algebra engine is not asked to replace a final refusal', () => {
  it.each([
    ['\\frac{x^2}{x}=0'],
    ['\\frac{x^2+3x}{x}=3'],
    ['\\frac{x^2}{x}=2x'],
    ['\\frac{x^4}{x^2}=0'],
    ['\\frac{x^2}{x}=\\frac{1}{3}x'],
    ['\\frac{x^4}{x}=0'],
    ['\\frac{x^2-4}{x-2}=4'],
    ['x^2÷x=0'],
    ['\\frac{x^2}{x}=x+\\frac{1}{3}-\\frac{1}{3}']
  ])('%s is not sent to the engine when the panel runs it (not quiet)', (latex) => {
    askSpy.ask.mockClear()
    askSpy.ask.mockResolvedValue({ solutions: [{ x: { latex: '0' } }] })
    usePure.getState().runLatex(latex, 'auto')
    const w = usePure.getState().working
    expect(w).not.toBeNull()
    expect(askSpy.ask).not.toHaveBeenCalled()
    expect(w?.answers).toEqual([])
    expect(w?.noWorking).toBeUndefined()
    expect(w?.error).toMatch(/denominator 0|every value of x works except x = 0/)
    expect(w?.error).not.toMatch(/another way/)
  })
})

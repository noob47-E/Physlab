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
  it('is refused in words, not answered as x = 2', () => {
    // The reader cannot divide by a bracket, so it refuses before any root is found. It says so
    // rather than answering x = 2, which the typed equation does not allow. A "no solution" answer
    // for this line would need the equation cross-multiplied first, which this fix does not do.
    const w = solveTyped('\\frac{x^2-4}{x-2}=4')
    expect(answersOf(w)).toEqual([])
    expect(w.error).toMatch(/Dividing by a bracket/)
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

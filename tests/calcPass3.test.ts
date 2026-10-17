// The Calculator, third pass: the one wrong answer the second reviewer found (DeepSeek, review 2, section 2).
//
// A polynomial whose only real root is repeated (multiplicity three or more) answered with the point the numeric search stopped
// at, not with the root: (x − 1)⁸ = 0 said x = 0.9840701616, because the search stops the moment |f| < 10⁻¹⁴ and for an m-fold
// root that is a distance of 10^(−14/m) from it. The exact route had the root all along (x = 1) and the single-root branch
// ignored it. The step engine refuses a power-8 equation, so nothing under the card disagreed either.
//
// Each test crosses a boundary: a typed line into an answer, and an answer plus a working into the card the screen draws.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { evaluateInput, varsAfter, type EvalResult } from '../src/renderer/src/calc/evaluateInput'
import { reconcile } from '../src/renderer/src/calc/working'
import { rootChecks } from '../src/renderer/src/calc/roots'
import { useCalc } from '../src/renderer/src/calc/calcStore'
import { runPure, suggestJob } from '../src/renderer/src/math/pure/run'
import type { Working } from '../src/renderer/src/math/pure/work'
import { resetGlobals } from './helpers/globals'

const START_VARS = useCalc.getState().vars
beforeEach(() => {
  resetGlobals()
  useCalc.setState({ vars: START_VARS })
})

/** "=" on a typed line (the field's LaTeX), with the letters the student has stored. */
const equals = (latex: string, vars: Record<string, unknown> = START_VARS, angle: 'deg' | 'rad' = 'deg'): EvalResult => {
  const r = evaluateInput('COMP', latex, { vars, ans: 0, angle })
  if (!r) throw new Error(`no answer for ${latex}`)
  return r
}

/** (x − a)ⁿ = 0 as the field writes it. */
const power = (a: number, n: number): string => String.raw`\left(x${a < 0 ? '+' : '-'}${Math.abs(a)}\right)^{${n}}=0`

describe('a repeated root is answered with the root itself, never the point a search stopped at', () => {
  it('(x − 1)ⁿ = 0 for n = 3 … 9 is x = 1, with nothing left over', () => {
    for (let n = 3; n <= 9; n++) {
      const r = equals(power(1, n))
      expect(r.error, `n = ${n}`).toBeUndefined()
      expect(r.main, `n = ${n}`).toBe('x = 1')
      expect(r.roots, `n = ${n}`).toEqual([1])
      expect(r.extra, `n = ${n}`).toEqual(['L − R = 0'])
    }
  })

  it('the cases the reviewer measured: (x − 1)⁸, (x − 1)³, (x + 2)³, (x − 3)⁴, (x − 1)⁴', () => {
    expect(equals(power(1, 8)).main).toBe('x = 1')
    expect(equals(power(1, 3)).main).toBe('x = 1')
    expect(equals(power(-2, 3)).main).toBe('x = −2')
    expect(equals(power(3, 4)).main).toBe('x = 3')
    expect(equals(power(1, 4)).main).toBe('x = 1')
  })

  it('the same polynomial typed out in full gives the same root', () => {
    expect(equals(String.raw`x^{3}-3x^{2}+3x-1=0`).main).toBe('x = 1')
    expect(equals(String.raw`x^{3}+6x^{2}+12x+8=0`).main).toBe('x = −2')
    expect(equals(String.raw`x^{4}-12x^{3}+54x^{2}-108x+81=0`).main).toBe('x = 3')
  })

  it('the stored x decides nothing: x³ = 0 is x = 0 whatever x was set to, and so are the others', () => {
    for (const start of [5, -7, 500]) {
      const vars = { ...START_VARS, x: start }
      expect(equals(String.raw`x^{3}=0`, vars).main, `x stored ${start}`).toBe('x = 0')
      expect(equals(power(1, 8), vars).main, `x stored ${start}`).toBe('x = 1')
      expect(equals(power(-2, 3), vars).main, `x stored ${start}`).toBe('x = −2')
    }
  })

  it('a double root is still x = 2, and a repeated root beside another is listed once each', () => {
    const double = equals(power(2, 2))
    expect(double.main).toBe('x = 2')
    expect(double.extra).toEqual(['L − R = 0'])
    // Two real roots: the list, smallest first as every screen lists a cubic or higher, each root once however often it repeats.
    const both = equals(String.raw`\left(x-2\right)^{2}\left(x+3\right)^{3}=0`)
    expect(both.roots).toEqual([-3, 2])
    expect(both.main).toBe('x₁ = −3, x₂ = 2')
  })

  it('a repeated root beside a complex pair keeps the pair under it', () => {
    const r = equals(String.raw`\left(x-1\right)^{3}\left(x^{2}+1\right)=0`)
    expect(r.main).toBe('x = 1')
    expect(r.extra).toEqual(['L − R = 0', 'Also, in complex numbers: x = ±i'])
  })

  it('the quadratic that has two roots is untouched: x² − 5x + 6 = 0 is x₁ = 3, x₂ = 2 and stores nothing', () => {
    const r = equals(String.raw`x^{2}-5x+6=0`)
    expect(r.main).toBe('x₁ = 3, x₂ = 2')
    expect(r.roots).toEqual([3, 2])
    expect(varsAfter(START_VARS, r)).toBe(START_VARS)
  })

  it('an equation that names its own x still stores it: x = 5 answers 5 and stores 5', () => {
    const r = equals('x=5')
    expect(r.main).toBe('x = 5')
    expect(varsAfter(START_VARS, r).x).toBe(5)
  })

  it('x³ = 0 with x set to 5 is the root 0 and stores nothing', () => {
    const vars = { ...START_VARS, x: 5 }
    const r = equals(String.raw`x^{3}=0`, vars)
    expect(r.main).toBe('x = 0')
    expect(varsAfter(vars, r)).toBe(vars)
  })
})

describe('a number the search stopped at is a root only if it checks', () => {
  it('a root put back comes out zero beside the terms that made it; a point that is no root does not', () => {
    // (x − 1)(x − 2) and (x − 1)⁸ expanded, highest power first.
    expect(rootChecks([1, -3, 2], 1)).toBe(true)
    expect(rootChecks([1, -3, 2], 2)).toBe(true)
    expect(rootChecks([1, -3, 2], 2.5)).toBe(false)
    expect(rootChecks([1, -8, 28, -56, 70, -56, 28, -8, 1], 1)).toBe(true)
    // The point the search stopped at for x² + 10⁻¹² = 0 (no real root at all).
    expect(rootChecks([1, 0, 1e-12], 6.689179984e-6)).toBe(false)
    expect(rootChecks([1, 0, 1], NaN)).toBe(false)
  })

  it('a number the exact route cannot back and the search found alone is marked approximate, and the card says so', async () => {
    // The exact route is made to find nothing (as for a polynomial whose roots all failed their check), so what is left is the search's own 0
    // for x² + 10⁻¹² = 0, with L − R = 10⁻¹²: not a root, and nothing to name the complex ones either.
    vi.resetModules()
    vi.doMock('../src/renderer/src/calc/roots', async (original) => ({
      ...(await original<typeof import('../src/renderer/src/calc/roots')>()),
      realAndPairs: () => ({ real: [], pairs: [], complete: false }),
      beyondTheReals: () => null
    }))
    try {
      const { evaluateInput: evaluate } = await import('../src/renderer/src/calc/evaluateInput')
      const { reconcile: reconcileCard } = await import('../src/renderer/src/calc/working')
      const r = evaluate('COMP', String.raw`x^{2}+0.000000000001=0`, { vars: START_VARS, ans: 0, angle: 'deg' })
      expect(r?.approximate).toBe(true)
      expect(r?.main).toBe('x = 0')
      const shown = reconcileCard(r as EvalResult, null)
      expect(shown.result.unconfirmed).toBe(true)
      expect(shown.result.extra?.join(' ')).toMatch(/approximate/)
      // A root that does check is not marked.
      const fine = evaluate('COMP', String.raw`x^{2}-4x+4=0`, { vars: START_VARS, ans: 0, angle: 'deg' })
      expect(fine?.approximate).toBeUndefined()
    } finally {
      vi.doUnmock('../src/renderer/src/calc/roots')
      vi.resetModules()
    }
  })

  it('a polynomial with no real root is not given a real one: x² + 10⁻¹² = 0 names its complex roots', () => {
    // The search stops at 6.7×10⁻⁶ with L − R = 4.6×10⁻¹¹ and called it x.
    const r = equals(String.raw`x^{2}+0.000000000001=0`)
    expect(r.main).toMatch(/^No real solution\. In complex numbers: x = ±/)
    expect(r.roots).toBeUndefined()
  })
})

describe('"=" and the working, when the step engine will not work the line', () => {
  /** What the screen does for a line: "=" first, then the step engine on the same line. */
  const card = (latex: string): { result: EvalResult; working: Working } => {
    const result = equals(latex)
    return { result, working: runPure(suggestJob(result.src), result.src) }
  }

  it('(x − 1)⁸ = 0: the step engine refuses the power, and the card it leaves alone says x = 1, not flagged', () => {
    const { result, working } = card(power(1, 8))
    expect(working.error).toBeDefined()
    const shown = reconcile(result, working)
    expect(shown.verdict).toBe('unchecked')
    expect(shown.result.main).toBe('x = 1')
    expect(shown.result.unconfirmed).toBeUndefined()
  })

  const unconfirmed: EvalResult = { main: 'x = 0.9840701616', src: 'x', value: 0.9840701616, roots: [0.9840701616], solved: true, approximate: true }

  it('a number nothing confirmed is said to be approximate when the working cannot check it: refused, empty, or unreadable', () => {
    const refused: Working = { title: 'Solve', input: 'x', moves: [], answers: [], error: 'This is a power-8 equation.' }
    const empty: Working = { title: 'Solve', input: 'x', moves: [{ head: 'a step' }], answers: [], checked: 'ok' }
    for (const w of [refused, empty, null]) {
      const shown = reconcile(unconfirmed, w)
      expect(shown.verdict).toBe('unchecked')
      expect(shown.result.unconfirmed).toBe(true)
      expect(shown.result.main).toBe('x = 0.9840701616')
      expect(shown.result.extra?.join(' ')).toMatch(/approximate/)
      expect(shown.line).toBeUndefined()
    }
  })

  it('…and when the working has an answer it cannot compare, as well', () => {
    const unreadable: Working = { title: 'Solve', input: 'x', moves: [{ head: 'a step' }], answers: [{ label: 'x =', tex: '\\text{none}' }], checked: 'ok' }
    const shown = reconcile(unconfirmed, unreadable)
    expect(shown.verdict).toBe('unchecked')
    expect(shown.result.unconfirmed).toBe(true)
  })

  it('…but a working that finds the same root confirms it, and the card is as it was', () => {
    const agrees: Working = { title: 'Solve', input: 'x', moves: [{ head: 'a step' }], answers: [{ label: 'x =', tex: '0.9840701616' }], checked: 'ok' }
    const shown = reconcile(unconfirmed, agrees)
    expect(shown.verdict).toBe('agree')
    expect(shown.result.unconfirmed).toBeUndefined()
  })

  it('a checked answer is never flagged: the same card without the mark is returned as it is', () => {
    const sure: EvalResult = { ...unconfirmed, approximate: undefined }
    expect(reconcile(sure, null).result).toBe(sure)
  })
})

// Three wrong answers the Calculator gave (AG-FULLTEST-16-REVIEWED, Mode 2, findings 2.1 to 2.4), pinned
// from the typed line to the answer a student reads.
//
// 2.1  6.02 × 10²³ mol⁻¹ × 1.6 × 10⁻¹⁹ C read C as the calculator's stored letter C (0), so = said "0 mol^-1".
// 2.2  x² − 5x + 6 = 0 said only "x = 2" and stored it; x² − 1 was worked out at the hidden x = 0 and said −1.
// 2.3  d/dx(x³ sin x) said "Those numbers do not fit this function" and Work it out factorised it.
// 2.4  ∫₀¹ 1/(1+x²) dx went to Divide under Work it out; = gave a decimal with no π/4 beside it.
//
// Every test starts from the store as the app starts (START_VARS), because the first two bugs were in what
// the store held before the student had typed a thing.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CasResult } from '../src/renderer/src/math/engine/sympy/worker'

// The algebra engine's worker is mocked, as tests/calculusWired.test.ts does: every call is recorded, none runs.
vi.mock('../src/renderer/src/math/engine/sympy/worker', async (orig) => {
  const real = await orig<typeof import('../src/renderer/src/math/engine/sympy/worker')>()
  return {
    ...real,
    cas: vi.fn(async (op: string): Promise<CasResult> => ({ latex: '', text: '', numeric: null, error: `no answer for ${op} in this test` }))
  }
})
vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { cas } from '../src/renderer/src/math/engine/sympy/worker'
import { evaluateInput, varsAfter, type EvalResult } from '../src/renderer/src/calc/evaluateInput'
import { engineAnswer } from '../src/renderer/src/calc/engineAnswer'
import { useCalc } from '../src/renderer/src/calc/calcStore'
import { math, setAngleMode } from '../src/renderer/src/math/expr'
import { suggestJob } from '../src/renderer/src/math/pure/run'
import { usePure } from '../src/renderer/src/math/pure/store'
import { scene } from '../src/renderer/src/core/store'
import { readSource } from './helpers/repo'
import { resetGlobals } from './helpers/globals'
import type { EngineResult } from '../src/renderer/src/math/engine/types'

/** The letters the Maths screen holds when the app starts, taken before any test writes to the store. */
const START_VARS = useCalc.getState().vars

beforeEach(() => {
  resetGlobals()
  scene().newScene()
  scene().setSettings({ angleUnit: 'deg' })
  vi.mocked(cas).mockClear()
  useCalc.setState({ vars: START_VARS })
})

/** What a press of = does with this field, on the store as it starts (or with `vars` given). */
const equals = (latex: string, angle: 'deg' | 'rad' = 'deg', vars: Record<string, unknown> = START_VARS): EvalResult => {
  const r = evaluateInput('COMP', latex, { vars, ans: 0, angle })
  if (!r) throw new Error(`no answer for ${latex}`)
  return r
}

const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))

// ---------------------------------------------------------------------------------------------------------
// 2.1  a unit after a number is a unit
// ---------------------------------------------------------------------------------------------------------

describe('2.1: a unit written after a number is a unit, never a stored letter', () => {
  it('no letter holds a value until the student gives it one', () => {
    // The root cause: A to F, M, x and y were stored as 0 from the start, so mathjs found a "variable" C
    // before it ever looked for the coulomb, and x² − 1 had an x to work at.
    expect(Object.keys(START_VARS)).toEqual([])
  })

  it('6.02×10²³ mol⁻¹ × 1.6×10⁻¹⁹ C is 96 320 C mol⁻¹ (the Faraday constant), not 0 mol^-1', () => {
    const typed = [
      String.raw`6.02\times 10^{23}mol^{-1}\times 1.6\times 10^{-19}C`,
      String.raw`6.02\times 10^{23}\mathrm{mol}^{-1}\times 1.6\times 10^{-19}\ \mathrm{C}`,
      String.raw`6.02\times 10^{23}\,\mathrm{mol}^{-1}\times 1.6\times 10^{-19}\,\mathrm{C}`
    ]
    for (const latex of typed) {
      const r = equals(latex)
      expect(r.error, latex).toBeUndefined()
      expect(r.main, latex).toBe('96320 C mol⁻¹')
    }
  })

  it('prints a unit power as a superscript, never with a caret', () => {
    expect(equals(String.raw`9.8\,\mathrm{m}\,\mathrm{s}^{-2}`).main).toBe('9.8 m s⁻²')
    expect(equals(String.raw`2\mathrm{m}\times 3\mathrm{m}`).main).toBe('6 m²')
    for (const latex of [String.raw`1\mathrm{mol}^{-1}`, String.raw`4\mathrm{kg}\,\mathrm{m}^{2}\,\mathrm{s}^{-2}`]) expect(equals(latex).main, latex).not.toMatch(/\^/)
  })

  it('C, A and F — letters the calculator also stores — are the coulomb, ampere and farad after a number', () => {
    expect(equals('3C').main).toBe('3 C')
    expect(equals('3A').main).toBe('3 A')
    expect(equals('3F').main).toBe('3 F')
    // Beside a prefix and in a product.
    expect(equals(String.raw`5\mathrm{mA}`).main).toBe('5 mA')
    expect(equals(String.raw`2\mathrm{A}\times 3\mathrm{V}`).main).toBe('6 W')
    // The charge of two electrons is a quantity in coulombs (mathjs writes it with a prefix of its own, 320 zC), never a bare 0.
    const charge = equals(String.raw`1.6\times 10^{-19}C\times 2`)
    expect(charge.main).toMatch(/^320 zC$/)
    expect((charge.value as { toNumber: (unit: string) => number }).toNumber('C')).toBeCloseTo(3.2e-19, 30)
  })

  it('every other unit symbol keeps working after a number', () => {
    const symbols: [string, string][] = [
      ['N', '5 N'],
      ['J', '5 J'],
      ['W', '5 W'],
      ['V', '5 V'],
      ['Pa', '5 Pa'],
      ['Hz', '5 Hz'],
      ['mol', '5 mol'],
      ['kPa', '5 kPa'],
      ['mm', '5 mm']
    ]
    for (const [symbol, shown] of symbols) {
      const r = equals(String.raw`5\,\mathrm{${symbol}}`)
      expect(r.error, symbol).toBeUndefined()
      expect(r.main, symbol).toBe(shown)
    }
  })

  it('Ω is the ohm, with its prefixes, and is written back as Ω', () => {
    expect(equals(String.raw`5\Omega`).main).toBe('5 Ω')
    expect(equals(String.raw`5k\Omega`).main).toBe('5 kΩ')
    expect(equals(String.raw`2\Omega\times 3\mathrm{A}`).main).toBe('6 V')
    expect(equals(String.raw`3\mathrm{V}\div 2\mathrm{A}`).main).toBe('1.5 Ω')
  })

  it('regression: 5 N × 2 m is still 10 J', () => {
    expect(equals(String.raw`5\mathrm{N}\times 2\mathrm{m}`).main).toBe('10 J')
  })

  it('a letter the student has given a value is a variable again: C = 5, then 2C is 10', () => {
    const stored = { ...START_VARS, C: 5 }
    expect(equals('2C', 'deg', stored).main).toBe('10')
    expect(equals('A+B', 'deg', { ...START_VARS, A: 3, B: 4 }).main).toBe('7')
    expect(equals('2A+1', 'deg', { ...START_VARS, A: 4 }).main).toBe('9')
    // An explicit 0 is still a value: it is not the same as never having been given one.
    expect(equals('C+1', 'deg', { ...START_VARS, C: 0 }).main).toBe('1')
  })

  it('regression: plain arithmetic, fractions, roots and degrees', () => {
    expect(equals(String.raw`2+3\times 4`).main).toBe('14')
    expect(equals(String.raw`\frac{1}{3}+\frac{1}{4}`).exact).toBe('\\frac{7}{12}')
    expect(equals(String.raw`\sqrt{-4}`).main).toBe('2i')
    expect(equals(String.raw`\sin 30`, 'deg').exact).toBe('\\frac{1}{2}')
    expect(equals(String.raw`\sin 30`, 'deg').main).toBe('0.5')
  })
})

// ---------------------------------------------------------------------------------------------------------
// 2.2  = on an equation gives every solution, and an unassigned letter has no hidden value
// ---------------------------------------------------------------------------------------------------------

describe('2.2: = on an equation gives every solution and stores nothing', () => {
  it('x² − 5x + 6 = 0 gives x = 3 and x = 2, the same set Work it out gives', () => {
    const r = equals(String.raw`x^{2}-5x+6=0`)
    expect(r.error).toBeUndefined()
    expect([...(r.roots ?? [])].sort((a, b) => a - b)).toEqual([2, 3])
    expect(r.main).toBe('x₁ = 3, x₂ = 2')
  })

  it('gives all the real roots of a cubic, a repeated root once, and a single root as before', () => {
    const cubic = [...(equals(String.raw`x^{3}-6x^{2}+11x-6=0`).roots ?? [])].sort((a, b) => a - b)
    expect(cubic).toHaveLength(3)
    cubic.forEach((root, i) => expect(near(root, i + 1), `root ${i + 1}`).toBe(true))
    expect(equals(String.raw`x^{3}-6x^{2}+11x-6=0`).main).toBe('x₁ = 1, x₂ = 2, x₃ = 3')
    expect(equals(String.raw`x^{2}-6x+9=0`).roots).toEqual([3])
    expect(equals(String.raw`x^{2}-6x+9=0`).main).toBe('x = 3')
    expect(equals(String.raw`2x+1=7`).main).toBe('x = 3')
    expect(equals(String.raw`x^{2}-2=0`).roots?.map((v) => Math.round(v * 1e6) / 1e6).sort((a, b) => a - b)).toEqual([-1.414214, 1.414214])
  })

  it('names the complex roots beside a real one, and says there is no real root when there is none', () => {
    const cubic = equals(String.raw`x^{3}-1=0`)
    expect(cubic.roots).toEqual([1])
    expect((cubic.extra ?? []).join(' ')).toMatch(/complex/)
    const none = equals(String.raw`x^{2}+4=0`)
    expect(none.error).toBeUndefined()
    expect(none.roots ?? []).toEqual([])
    expect(none.main).toMatch(/^No real solution\. In complex numbers: x = ±2i$/)
  })

  it('an equation that is not a polynomial still finds the root nearest the start, in the screen’s angle unit', () => {
    expect(equals(String.raw`\sin x=0.5`, 'deg').main).toBe('x = 30')
    expect(near(equals(String.raw`\sin x=0.5`, 'rad').roots?.[0] ?? NaN, Math.PI / 6)).toBe(true)
    expect(near(equals(String.raw`e^{x}=5`).roots?.[0] ?? NaN, Math.log(5))).toBe(true)
  })

  it('leaves the stored letters alone: x is not written by a solved equation', () => {
    for (const line of [String.raw`x^{2}-5x+6=0`, String.raw`2x+1=7`, String.raw`x^{2}=2`, String.raw`\sin x=0.5`, String.raw`x^{2}+4=0`]) {
      const r = equals(line)
      expect(varsAfter(START_VARS, r), line).toBe(START_VARS)
      expect('x' in varsAfter(START_VARS, r), line).toBe(false)
    }
  })

  it('only the student’s own x = 5 stores x', () => {
    const r = equals('x=5')
    expect(r.main).toBe('x = 5')
    expect(varsAfter(START_VARS, r)).toEqual({ x: 5 })
    expect(varsAfter(START_VARS, equals('x=2+3'))).toEqual({ x: 5 })
    // …and a letter beside it that is not the whole left side is an equation, not a store.
    expect(varsAfter(START_VARS, equals('2x=10'))).toBe(START_VARS)
  })

  it('an expression with a letter nobody gave a value is not worked out at a hidden 0', () => {
    const r = equals(String.raw`x^{2}-1`)
    expect(r.error).toBeUndefined()
    expect(r.main).not.toBe('−1')
    expect(r.main).toBe('x² − 1')
    expect(r.tex).toMatch(/x.*2.*-\s*1/)
    expect(r.value).toBeUndefined()
    expect(r.solved).toBeFalsy()
    expect(varsAfter(START_VARS, r)).toBe(START_VARS)
    expect(equals('2x+3x').main).toBe('5x')
    expect(equals(String.raw`\sin x+\sin x`).main).toBe('2 sin(x)')
  })

  it('the same line with x given a value is a number', () => {
    expect(equals(String.raw`x^{2}-1`, 'deg', { x: 3 }).main).toBe('8')
    expect(equals(String.raw`x^{2}-1`, 'deg', { x: 0 }).main).toBe('−1')
  })

  it('a line that only looks like a formula keeps its refusal: a comparison, a unit after a number, a name nobody knows', () => {
    for (const line of [String.raw`1<x<3`, String.raw`x+2C`, String.raw`foo+1`, String.raw`divide\left(x,2,3\right)`]) {
      const r = equals(line)
      expect(r.error, line).toBeDefined()
      expect(r.tex, line).toBeUndefined()
    }
  })

  it('a letter is a unit only right after a number: x + A with nothing stored stays the formula x + A (a lone A, B, C or F is a letter)', () => {
    // The rule of 2.1, said the other way round: 3C is three coulombs, and C on its own, with no number before it, is the letter C. x + A
    // answered "I don't know what x is" because A was refused as an ampere.
    const sum = equals('x+A')
    expect(sum.error).toBeUndefined()
    expect(sum.main).toBe('x + A')
    expect(sum.tex).toMatch(/x\s*\+\s*A/)
    expect(sum.value).toBeUndefined()
    expect((sum.extra ?? []).join(' ')).toMatch(/x and A have no value yet/)
    for (const [line, shown] of [['A+1', 'A + 1'], ['C', 'C'], ['F', 'F'], ['B-1', 'B − 1'], [String.raw`x\cdot C`, 'xC'], [String.raw`C\cdot x`, 'Cx']] as const) {
      const r = equals(line)
      expect(r.error, line).toBeUndefined()
      expect(r.main, line).toBe(shown)
      expect(r.tex, line).toBeDefined()
      expect(r.value, line).toBeUndefined()
    }
    // Given a value the letter is that value, and after a number it is still the unit.
    expect(equals('x+A', 'deg', { A: 3 }).main).toBe('x + 3')
    expect(equals('3C').main).toBe('3 C')
    expect(equals(String.raw`5\mathrm{A}+2\mathrm{A}`).main).toBe('7 A')
    // A line with a quantity in it keeps being read as one: 5 N ÷ A is newtons per ampere, as it was.
    expect(equals(String.raw`5\mathrm{N}\div\mathrm{A}`).error).toBeUndefined()
  })

  it('a coefficient the student typed is a coefficient, however small: 1×10⁻¹⁶x² + x = 0 has the roots 0 and −10¹⁶', () => {
    // polynomialInX dropped the leading term for being under 10⁻¹² of the largest, and polynomialRoots dropped one under 10⁻¹⁵ whatever
    // its size, so only x = 0 came back. Only a term that is round-off from the arithmetic done on the line is no term at all.
    const r = equals(String.raw`1\times 10^{-16}x^{2}+x=0`)
    expect(r.error).toBeUndefined()
    expect(r.roots).toHaveLength(2)
    expect(r.roots?.[0]).toBe(0)
    expect(near(r.roots?.[1] ?? 0, -1e16)).toBe(true)
    expect(r.main).toBe('x₁ = 0, x₂ = −1×10^16')
    expect(equals(String.raw`1\times 10^{-20}x^{2}-x+1=0`).roots).toHaveLength(2)
  })

  it('…while a leading term that is only round-off still goes: 0.1x² + 0.2x² = 0.3x² − x is x = 0, and x² + 4 = x² + 1 has no root', () => {
    const r = equals(String.raw`0.1x^{2}+0.2x^{2}=0.3x^{2}-x`)
    expect(r.roots).toEqual([0])
    expect(r.main).toBe('x = 0')
    expect(equals(String.raw`x^{2}+4=x^{2}+1`).error?.sentence).toMatch(/^No solution I can find/)
  })

  it('regression: a statement of numbers is marked true or false and stores nothing', () => {
    expect(equals(String.raw`\sum_{x=1}^{5}x^{2}=55`).main).toBe('true')
  })

  it('the Maths screen stores what varsAfter says, and nothing else', () => {
    const maths = readSource('src/renderer/src/panels/Maths.tsx')
    expect(maths).toContain('vars: varsAfter(s.vars, r)')
    expect(maths).not.toMatch(/r\.solved \? \{ \.\.\.s\.vars/)
  })
})

// ---------------------------------------------------------------------------------------------------------
// 2.3 and 2.4  textbook calculus notation
// ---------------------------------------------------------------------------------------------------------

/** The derivative the student wrote in radians, as a function of x. */
const slope = (x: number): number => 3 * x * x * Math.sin(x) + x ** 3 * Math.cos(x)

/** A formula the engine can read back, worked at x in radians. */
const valueIn = (formula: string, x: number): number => {
  setAngleMode('rad')
  try {
    return Number(math.evaluate(formula, { x }))
  } finally {
    setAngleMode('deg')
  }
}

describe('2.3: d/dx(x³ sin x) in = and in Work it out', () => {
  const DX = String.raw`\frac{d}{dx}\left(x^{3}\sin x\right)`

  it('= gives the derivative 3x² sin x + x³ cos x, not "Those numbers do not fit this function"', () => {
    const r = equals(DX)
    expect(r.error).toBeUndefined()
    expect(r.main).toBe('3x² sin(x) + x³ cos(x)')
    expect(r.tex).toMatch(/\\sin/)
    expect(r.tex).toMatch(/\\cos/)
    expect(r.value).toBeUndefined()
    // Not only the look of it: the formula is the slope at a few points, worked in radians.
    for (const x of [0.4, 1.1, 2.3]) expect(near(valueIn(r.formula ?? 'nan', x), slope(x)), `x = ${x}`).toBe(true)
  })

  it('calculus is in radians even with the angle setting on DEG: no π/180 anywhere', () => {
    const deg = equals(DX, 'deg')
    const rad = equals(DX, 'rad')
    expect(deg.main).toBe(rad.main)
    expect(deg.tex).toBe(rad.tex)
    expect(deg.main).not.toMatch(/π|180/)
    expect(deg.tex).not.toMatch(/pi|180/)
  })

  it('a stored letter is a constant, and the stored x is not substituted for the x being differentiated', () => {
    // d/dx(A x²) with A = 3 is 6x; the x of the line is the variable, not the stored x = 7.
    const r = equals(String.raw`\frac{d}{dx}\left(A\cdot x^{2}\right)`, 'deg', { A: 3, x: 7 })
    expect(r.error).toBeUndefined()
    expect(r.main).toBe('6x')
    for (const x of [0.5, 2]) expect(near(valueIn(r.formula ?? 'nan', x), 6 * x)).toBe(true)
  })

  it('hands what mathjs would get wrong to the algebra engine instead of showing it: 2ˣ, log x and the product ax', () => {
    // mathjs writes d/dx 2^x with log10(2) where ln 2 belongs; it differentiates ax as one unknown (answer 0).
    for (const typed of [String.raw`\frac{d}{dx}\left(2^{x}\right)`, String.raw`\frac{d}{dx}\left(\log x\right)`, String.raw`\frac{d}{dx}\left(ax^{2}\right)`]) {
      const r = equals(typed)
      expect(r.error, typed).toBeUndefined()
      expect(r.engine, typed).toMatchObject({ job: 'diff', req: { var: 'x', deg: false } })
      expect(r.main, typed).toBe('Working it out…')
      expect(r.tex, typed).toBeUndefined()
    }
  })

  it('d/dt of a function of t is worked in t', () => {
    const r = equals(String.raw`\frac{d}{dt}\left(t^{3}\right)`)
    expect(r.error).toBeUndefined()
    expect(r.main).toBe('3t²')
  })

  it('Work it out picks Differentiate by itself and sends the engine the expression and the letter', async () => {
    const line = 'diff(x^(3)sin(x), x)'
    expect(suggestJob(line)).toBe('differentiate')
    usePure.getState().runLatex(DX, 'auto')
    await Promise.resolve()
    const w = usePure.getState()
    expect(w.job).toBe('differentiate')
    expect(w.working?.title).toBe('Differentiate')
    await new Promise((r) => setTimeout(r, 0))
    const [op, payload] = vi.mocked(cas).mock.calls.at(-1)!
    expect(op).toBe('diff_steps')
    expect(payload).toMatchObject({ var: 'x' })
    expect(String(payload?.expr)).toMatch(/^x\^\(3\)\*?sin\(x\)$/)
  })

  it('Work it out leaves a plain expression for Factorise, and a sum that merely contains diff() alone', () => {
    expect(suggestJob('x^2-1')).toBe('factor')
    expect(suggestJob('diff(x^2, x) + 1')).not.toBe('differentiate')
  })
})

describe('2.4: ∫₀¹ 1/(1+x²) dx in = and in Work it out', () => {
  const INT = String.raw`\int_{0}^{1}\frac{1}{1+x^{2}}dx`

  it('= gives π/4 exactly, with ≈ 0.7853981634 as the decimal', () => {
    const r = equals(INT)
    expect(r.error).toBeUndefined()
    expect(r.main).toBe('0.7853981634')
    expect(r.exact).toBe('\\frac{\\pi}{4}')
  })

  it('the exact form is not found for a number that merely sits near a fraction', () => {
    // ∫₀¹ x² dx = 1/3 is found; the same decimal typed straight in as an integral of something else is not.
    expect(equals(String.raw`\int_{0}^{1}x^{2}dx`).exact).toBe('\\frac{1}{3}')
    expect(equals(String.raw`\int_{0}^{1}e^{-x^{2}}dx`).exact ?? null).toBeNull()
  })

  it('Work it out picks Integrate by itself, with the limits, and sends the engine the integrand', async () => {
    expect(suggestJob('integral(((1)/(1+x^(2))), 0, 1)')).toBe('integrate')
    usePure.getState().runLatex(INT, 'auto')
    await Promise.resolve()
    expect(usePure.getState().job).toBe('integrate')
    expect(usePure.getState().working?.title).toBe('Integrate')
    await new Promise((r) => setTimeout(r, 0))
    const [op, payload] = vi.mocked(cas).mock.calls.at(-1)!
    expect(op).toBe('integral_steps')
    expect(payload).toMatchObject({ var: 'x', lower: '0', upper: '1' })
    expect(String(payload?.expr).replace(/[\s()]/g, '')).toBe('1/1+x^2'.replace(/\s/g, ''))
  })

  it('an indefinite ∫ x² dx goes to Integrate too, in the letter of the integral', async () => {
    expect(suggestJob('integrate(x^(2), x)')).toBe('integrate')
    usePure.getState().runLatex(String.raw`\int x^{2}dx`, 'auto')
    await new Promise((r) => setTimeout(r, 0))
    expect(usePure.getState().job).toBe('integrate')
    const [op, payload] = vi.mocked(cas).mock.calls.at(-1)!
    expect(op).toBe('integral_steps')
    expect(payload).toMatchObject({ var: 'x' })
    expect(payload).not.toHaveProperty('lower')
  })

  it('= on an indefinite integral is handed to the algebra engine, and its answer carries + C', async () => {
    const r = equals(String.raw`\int x^{2}dx`)
    expect(r.error).toBeUndefined()
    expect(r.engine).toMatchObject({ job: 'integrate', req: { expr: 'x^(2)', var: 'x', deg: false } })
    const reply: EngineResult = { latex: '\\frac{x^{3}}{3}', text: 'x^3/3', numeric: null }
    const asked: unknown[] = []
    const answer = await engineAnswer(r.engine!, async (job, req) => {
      asked.push([job, req])
      return reply
    })
    expect(asked).toHaveLength(1)
    expect(answer).toEqual({ ok: true, main: 'x³/3 + C', tex: '\\frac{x^{3}}{3} + C' })
  })

  it('the Maths screen hands the line to the engine and puts the answer in only while its card is still the one held', () => {
    const maths = readSource('src/renderer/src/panels/Maths.tsx')
    expect(maths).toContain('engineAnswer(r.engine)')
    expect(maths).toContain('a.input === s.input && a.result === r')
  })

  it('an engine that cannot answer is a sentence, never its own words', async () => {
    const r = equals(String.raw`\int x^{2}dx`)
    const refused = await engineAnswer(r.engine!, async () => ({ latex: '', text: '', numeric: null, error: 'This took too long, so it was stopped.' }))
    expect(refused).toEqual({ ok: false, error: 'This took too long, so it was stopped.' })
    // An integral the engine hands back still written as an integral is not an answer.
    const unsolved = await engineAnswer(r.engine!, async () => ({ latex: '\\int e^{x^{3}}\\, dx', text: 'Integral(exp(x**3), x)', numeric: null }))
    expect(unsolved.ok).toBe(false)
  })
})

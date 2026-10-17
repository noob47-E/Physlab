// The Calculator, second pass (owner decisions of 17 Oct 2026, and AG-FULLTEST-16-REVIEWED findings 2.5 to 2.8):
//
//   1  ONE BUTTON. "=" is the only button: no "Work it out", no "Treat as". Under the answer the working is folded behind
//      "Show the working", picked automatically; "=" and the working never disagree, and when they do neither is shown as final.
//   2  Complex is not a mode: modulus, argument, conjugate and polar form are on Numbers' own answer card.
//   3  The More menu keeps Distributions, Equations, Inequalities, Ratio and Constants.
//   4  2.5 ten to the 1000 is not a thousand zeros; 2.6 the help's examples are written as a textbook writes them;
//      2.7 the keypad's close button has a label and the keypad does not sit over History; 2.8 one name, Calculator.
//   5  CALCULUS IS ALWAYS IN RADIANS, whatever DEG/RAD says (the owner's later decision): d/dx at a point, the definite
//      integral's number, the tangent and the shaded area drawn in the viewport; plain trig outside calculus follows the
//      setting, and a DEG screen says "Calculus uses radians." on the card.
//
// Each test crosses a boundary (a typed line into an answer, a typed line into a working, a source file into a promise)
// because that is where the bugs of this screen have always hidden.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { evaluateInput, tangentAt, type EvalResult } from '../src/renderer/src/calc/evaluateInput'
import { CALCULUS_IN_RADIANS } from '../src/renderer/src/calc/angle'
import { inRadians } from '../src/renderer/src/calc/formula'
import { reconcile, wantsWorking } from '../src/renderer/src/calc/working'
import { openPane } from '../src/renderer/src/calc/drawers'
import { CHIP_MODES, LISTED_MODES, MODE_HINTS, MODE_LABELS, MORE_MODES, useCalc } from '../src/renderer/src/calc/calcStore'
import { polyRoots } from '../src/renderer/src/calc/engine'
import { keepVerified, polynomialRootRows, realAndPairs } from '../src/renderer/src/calc/roots'
import { math, setAngleMode } from '../src/renderer/src/math/expr'
import { JOBS, runPure, suggestJob } from '../src/renderer/src/math/pure/run'
import { PANEL_TITLES } from '../src/renderer/src/app/panels'
import type { Working } from '../src/renderer/src/math/pure/work'
import { readSource } from './helpers/repo'
import { resetGlobals } from './helpers/globals'

const START_VARS = useCalc.getState().vars
beforeEach(() => {
  resetGlobals()
  useCalc.setState({ vars: START_VARS })
})

const equals = (latex: string, angle: 'deg' | 'rad' = 'deg'): EvalResult => {
  const r = evaluateInput('COMP', latex, { vars: START_VARS, ans: 0, angle })
  if (!r) throw new Error(`no answer for ${latex}`)
  return r
}
const maths = (): string => readSource('src/renderer/src/panels/Maths.tsx')

// ---------------------------------------------------------------------------------------------------------
// 5  calculus is in radians
// ---------------------------------------------------------------------------------------------------------

describe('calculus is always in radians, whatever DEG/RAD says', () => {
  const INT_SIN = String.raw`\int_{0}^{\pi}\sin x\,dx`
  const DDX_SIN_30 = String.raw`\operatorname{ddx}\left(\sin\left(x\right),30\right)`

  it('∫₀^π sin x dx is 2 in DEG as in RAD, with the one note on a DEG card', () => {
    const deg = equals(INT_SIN, 'deg')
    expect(deg.main).toBe('2')
    expect(deg.exact).toBe('2')
    expect(deg.extra).toContain(CALCULUS_IN_RADIANS)
    const rad = equals(INT_SIN, 'rad')
    expect(rad.main).toBe('2')
    expect(rad.extra ?? []).not.toContain(CALCULUS_IN_RADIANS)
    expect(CALCULUS_IN_RADIANS).toBe('Calculus uses radians.')
  })

  it('d/dx sin x at 30 is cos 30 (radians) in DEG as in RAD', () => {
    for (const angle of ['deg', 'rad'] as const) {
      const r = equals(DDX_SIN_30, angle)
      expect(Number(r.value), angle).toBeCloseTo(Math.cos(30), 7)
    }
    expect(equals(DDX_SIN_30, 'deg').extra).toContain(CALCULUS_IN_RADIANS)
  })

  it('says nothing of radians when the answer does not depend on the unit', () => {
    expect(equals(String.raw`\operatorname{ddx}\left(x^{3},2\right)`, 'deg').extra ?? []).not.toContain(CALCULUS_IN_RADIANS)
    expect(equals(String.raw`\int_{0}^{3}x^{2}\,dx`, 'deg').extra ?? []).not.toContain(CALCULUS_IN_RADIANS)
    expect(equals(String.raw`\sin 30`, 'deg').extra ?? []).not.toContain(CALCULUS_IN_RADIANS)
  })

  it('plain trig outside calculus still follows the setting: sin 30 is 1/2 in DEG, the sum of sin 30k too', () => {
    expect(equals(String.raw`\sin 30`, 'deg').exact).toBe('\\frac{1}{2}')
    expect(equals(String.raw`\sum_{x=1}^{1}\sin\left(30x\right)`, 'deg').main).toBe('0.5')
  })

  it('a limit or a point is read in the screen’s unit, the body in radians: ∫₀^{sin 30} x dx is 1/8 in DEG', () => {
    expect(Number(equals(String.raw`\int_{0}^{\sin 30}x\,dx`, 'deg').value)).toBeCloseTo(0.125, 12)
    expect(Number(equals(String.raw`\int_{0}^{\sin 30}x\,dx`, 'rad').value)).toBeCloseTo((Math.sin(30) ** 2) / 2, 12)
  })

  it('the textbook derivative says it too, in DEG with trig only', () => {
    expect(equals(String.raw`\frac{d}{dx}\left(\sin x\right)`, 'deg').extra).toContain(CALCULUS_IN_RADIANS)
    expect(equals(String.raw`\frac{d}{dx}\left(x^{3}\right)`, 'deg').extra ?? []).not.toContain(CALCULUS_IN_RADIANS)
    expect(equals(String.raw`\frac{d}{dx}\left(\sin x\right)`, 'rad').extra ?? []).not.toContain(CALCULUS_IN_RADIANS)
  })

  it('the tangent is drawn from the same radians: height sin 30 and slope cos 30 in DEG too', () => {
    const t = tangentAt('ddx(sin(x), 30)', { vars: {}, ans: 0, angle: 'deg' })
    expect(t.x0).toBe(30)
    expect(t.fx).toBeCloseTo(Math.sin(30), 12)
    expect(t.slope).toBeCloseTo(Math.cos(30), 7)
    expect(t.slope).toBe(Number(equals(DDX_SIN_30, 'deg').value))
  })

  it('inRadians turns a DEG picture into the radian one: the same curve whichever unit the screen is in', () => {
    setAngleMode('deg')
    try {
      for (const x of [0.4, 1.3, 2.2]) {
        const drawn = Number(math.evaluate(inRadians('sin(x) + cos(2 * x) + atan(x) + tan(x / 3)', 'deg'), { x }))
        expect(drawn).toBeCloseTo(Math.sin(x) + Math.cos(2 * x) + Math.atan(x) + Math.tan(x / 3), 12)
      }
    } finally {
      setAngleMode('deg')
    }
    // In RAD there is nothing to turn: the line is the line.
    expect(inRadians('sin(x)', 'rad')).toBe('sin(x)')
  })

  it('the viewport draws what the card says: the Calculator’s tangent, area and derivative graph are turned to radians in DEG', () => {
    const src = maths()
    const draw = src.slice(src.indexOf('const drawLine ='), src.indexOf('const draw = '))
    expect(draw).toMatch(/visualizeTangent\(inRadians\(keypadToMath\(t\.f\), angleUnit\)/)
    expect(draw).toMatch(/visualizeArea\(inRadians\(keypadToMath\(f\), angleUnit\)/)
    expect(draw).toMatch(/visualizeGraph\(`y = \$\{result\.formula\}`, \[inRadians\(result\.formula, angleUnit\)\]/)
  })
})

// ---------------------------------------------------------------------------------------------------------
// 1  one button, and a working that never disagrees with it
// ---------------------------------------------------------------------------------------------------------

describe('one button: = is the only button, the working is folded under its answer', () => {
  it('the screen has no Work it out button and no Treat as menu, and has one Show the working control', () => {
    const src = maths()
    expect(src).not.toContain('workOut(')
    expect(src).not.toContain('Treat as')
    expect(src).not.toContain('data-tour="work-it-out"')
    expect(src).not.toMatch(/<Play size=\{13\} \/> Work it out/)
    expect(src).toContain('Show the working')
    expect(src).toContain('data-tour="equals"')
  })

  it('= works the line out itself: a press of = asks the step engine too, quietly and without moving the keyboard', () => {
    const src = maths()
    expect(src).toMatch(/usePure\.getState\(\)\.runLatex\(s\.input, 'auto'/)
    expect(src).toContain('invited={() => false}')
  })

  it('picks the working by itself: algebra, equations, calculus, surds, complex numbers and whole numbers have one; plain arithmetic does not', () => {
    const wanted: [string, boolean][] = [
      ['6x^2 + 7x - 3', true],
      ['x^2 - 5x + 6 = 0', true],
      ['diff(x^(3)sin(x), x)', true],
      ['integral(((1)/(1+x^(2))), 0, 1)', true],
      ['sqrt(8)', true],
      ['sqrt(-4)', true],
      ['(3+4i)(1-2i)', true],
      ['360', true],
      ['12, 18', true],
      ['2+3*4', false],
      ['1/3 + 1/4', false],
      ['sin(30)', false],
      ['2/3 + sqrt(2)', true]
    ]
    for (const [line, yes] of wanted) expect(wantsWorking(line), line).toBe(yes)
    expect(suggestJob('diff(x^(3)sin(x), x)')).toBe('differentiate')
  })
})

describe('the answer and the working never disagree', () => {
  const working = (answers: [string, string][], over: Partial<Working> = {}): Working => ({
    title: 'Factorise',
    input: 'x',
    moves: [{ head: 'a step' }],
    answers: answers.map(([label, tex]) => ({ label, tex })),
    checked: 'ok',
    ...over
  })
  const card = (over: Partial<EvalResult>): EvalResult => ({ main: '', src: 'x', ...over })

  it('agrees when the two answers are the same number (an integral’s decimal and its π/4)', () => {
    const out = reconcile(card({ main: '0.7853981634', value: 0.7853981633974654, exact: '\\frac{\\pi}{4}' }), working([['Answer', '\\frac{\\pi}{4}']]))
    expect(out.verdict).toBe('agree')
    expect(out.result.main).toBe('0.7853981634')
    expect(out.line).toBeUndefined()
  })

  it('agrees on the same function written two ways: x² − 1 and (x − 1)(x + 1)', () => {
    const out = reconcile(card({ main: 'x² − 1', formula: 'x ^ 2 - 1', tex: 'x^{2}-1' }), working([['Answer', '\\left(x - 1\\right)\\left(x + 1\\right)']]))
    expect(out.verdict).toBe('agree')
  })

  it('agrees on the same roots, in either order, and on a complex number', () => {
    expect(reconcile(card({ main: 'x₁ = 3, x₂ = 2', roots: [3, 2] }), working([['x_1 =', '3'], ['x_2 =', '2']])).verdict).toBe('agree')
    expect(reconcile(card({ main: 'x₁ = 3, x₂ = 2', roots: [3, 2] }), working([['x_1 =', '2'], ['x_2 =', '3']])).verdict).toBe('agree')
    expect(reconcile(card({ main: '2i', value: math.complex(0, 2) }), working([['Answer', '2i'], ['Modulus', '2']])).verdict).toBe('agree')
  })

  it('a number that differs: neither is final, the working’s answer is shown, and the disagreement is logged', () => {
    const out = reconcile(card({ main: '14', value: 14 }), working([['14 =', '2 \\times 6']]))
    expect(out.verdict).toBe('differ')
    expect(out.result.unconfirmed).toBe(true)
    expect(out.result.tex).toBe('2 \\times 6')
    expect(out.result.main).toBe('2 × 6')
    expect(out.result.value).toBeUndefined()
    expect(out.result.exact ?? null).toBeNull()
    expect(out.line).toMatch(/^PHYSLAB_CHECK calc-disagree /)
    expect(out.line).toContain('14')
    expect(out.line).toContain('2 \\times 6')
  })

  it('roots, a formula and a complex number that differ are caught the same way', () => {
    expect(reconcile(card({ main: 'x₁ = 3, x₂ = 2', roots: [3, 2] }), working([['x_1 =', '3'], ['x_2 =', '5']])).verdict).toBe('differ')
    expect(reconcile(card({ main: 'x = 2', roots: [2] }), working([['x_1 =', '3'], ['x_2 =', '2']])).verdict).toBe('agree')
    expect(reconcile(card({ main: 'x² − 1', formula: 'x ^ 2 - 1' }), working([['Answer', '\\left(x - 1\\right)\\left(x + 2\\right)']])).verdict).toBe('differ')
    expect(reconcile(card({ main: '2i', value: math.complex(0, 2) }), working([['Answer', '3i']])).verdict).toBe('differ')
  })

  it('a complete list of roots that leaves one out is caught: the old "= gave only x = 2" bug', () => {
    expect(reconcile(card({ main: 'x = 2', roots: [2], rootsComplete: true }), working([['x_1 =', '3'], ['x_2 =', '2']])).verdict).toBe('differ')
  })

  it('does not claim a disagreement it cannot show: no working, a refusal, an answer it cannot read, a number too big', () => {
    expect(reconcile(card({ main: '14', value: 14 }), null).verdict).toBe('unchecked')
    expect(reconcile(card({ main: '14', value: 14 }), working([], { error: 'sqrt is not something I can factorise' })).verdict).toBe('unchecked')
    expect(reconcile(card({ main: '14', value: 14 }), working([['Answer', '\\text{no number here}']])).verdict).toBe('unchecked')
    expect(reconcile(card({ main: '10¹⁰⁰⁰' }), working([['10^{1000} =', '2^{1000} \\times 5^{1000}']])).verdict).toBe('unchecked')
  })

  it('a refusal to read the line, or an overflow, gives way to a working that has the answer (an HCF list)', () => {
    const refused = card({ main: '', error: { sentence: "I can't read that — check the brackets, and that every operator has a number on each side." } })
    const out = reconcile(refused, working([['HCF =', '6']]))
    expect(out.verdict).toBe('unchecked')
    expect(out.result.error).toBeUndefined()
    expect(out.result.tex).toBe('6')
    expect(out.line).toBeUndefined()
    // …but a refusal that is the answer stays: the line does not store a value.
    const stores = card({ main: '', error: { sentence: 'Typing A = … does not store a value. Under Variables, type the value beside A.' } })
    expect(reconcile(stores, working([['A =', '5']])).result.error).toBeDefined()
  })

  it('the screen logs a disagreement once, through console.warn', () => {
    const src = maths()
    expect(src).toContain('reconcile(')
    expect(src).toMatch(/console\.warn\(shown\.line\)/)
  })
})

// ---------------------------------------------------------------------------------------------------------
// 2  complex numbers are Numbers'
// ---------------------------------------------------------------------------------------------------------

describe('Complex is not a separate mode: its modulus, argument, conjugate and polar form are on Numbers’ card', () => {
  it('√−4 in Numbers carries them, in degrees', () => {
    const r = equals(String.raw`\sqrt{-4}`, 'deg')
    expect(r.main).toBe('2i')
    expect(r.complex).toEqual({ size: '2', angle: '90°', conjugate: '−2i', polar: '2∠90°' })
  })

  it('(3 + 4i)(1 − 2i) in Numbers, in degrees and in radians', () => {
    const deg = equals(String.raw`\left(3+4i\right)\left(1-2i\right)`, 'deg')
    expect(deg.main).toBe('11 − 2i')
    expect(deg.complex?.size).toBe('11.18033989')
    expect(deg.complex?.angle).toBe('−10.30484647°')
    expect(deg.complex?.conjugate).toBe('11 + 2i')
    expect(deg.complex?.polar).toBe('11.18033989∠−10.30484647°')
    const rad = equals(String.raw`\left(3+4i\right)\left(1-2i\right)`, 'rad')
    expect(rad.complex?.angle).toMatch(/^−0\.17985\d* rad$/)
  })

  it('a real answer has no complex card, and the answer of a line with i that comes out real has none either', () => {
    expect(equals(String.raw`2+3\times 4`).complex).toBeUndefined()
    expect(equals(String.raw`i\times i`).complex).toBeUndefined()
  })

  it('there is no Complex chip: the chips are Numbers and Bases, and a stored Complex history entry opens in Numbers', () => {
    expect(CHIP_MODES).toEqual(['COMP', 'BASE-N'])
    const src = maths()
    expect(src).toContain('CHIP_MODES.map(')
    expect(src).not.toMatch(/FIELD_MODES\.map\(/)
    expect(src).toMatch(/mode: h\.mode === 'CMPLX' \? 'COMP' : h\.mode/)
  })
})

// ---------------------------------------------------------------------------------------------------------
// 3 and 2.8  the More menu, one name for the screen
// ---------------------------------------------------------------------------------------------------------

describe('the More menu and the names on the screen', () => {
  it('More keeps Distributions, Equations, Inequalities, Ratio and Constants, in that order', () => {
    expect(MORE_MODES).toEqual(['DIST', 'EQUATION', 'INEQUALITY', 'RATIO', 'CONST'])
    expect(LISTED_MODES).toEqual(['COMP', 'BASE-N', 'DIST', 'EQUATION', 'INEQUALITY', 'RATIO', 'CONST'])
    for (const hidden of ['MATRIX', 'VECTOR', 'STAT', 'TABLE', 'SHEET', 'UNITS', 'MEASURE', 'CMPLX']) expect(LISTED_MODES as readonly string[]).not.toContain(hidden)
  })

  it('their code and labels are kept: every mode still has a label and a hint', () => {
    expect(Object.keys(MODE_LABELS)).toHaveLength(15)
    expect(Object.keys(MODE_HINTS)).toHaveLength(15)
  })

  it('the search palette offers the Calculator modes the menu offers, and no others', () => {
    const palette = readSource('src/renderer/src/app/SearchPalette.tsx')
    expect(palette).toContain('LISTED_MODES')
    expect(palette).not.toMatch(/Object\.keys\(MODE_LABELS\)/)
  })

  it('no hint repeats its own label (Matrices — Matrices), or starts with it', () => {
    for (const m of Object.keys(MODE_LABELS) as (keyof typeof MODE_LABELS)[]) {
      const label = MODE_LABELS[m].toLowerCase()
      const hint = MODE_HINTS[m].toLowerCase()
      expect(hint, m).not.toBe(label)
      expect(hint.startsWith(label), `${m}: "${MODE_HINTS[m]}" starts with "${MODE_LABELS[m]}"`).toBe(false)
    }
  })

  it('the panel tab says Calculator, as the mode does', () => {
    expect(PANEL_TITLES.maths).toBe('Calculator')
    expect(readSource('src/renderer/src/app/modes.ts')).not.toContain('One Maths screen')
  })
})

// ---------------------------------------------------------------------------------------------------------
// 2.5  ten to the 1000
// ---------------------------------------------------------------------------------------------------------

describe('2.5: 10^1000 is shown as 10¹⁰⁰⁰, never as a thousand zeros', () => {
  /** The longest run of digits in any string of a working: the thousand zeros are one run. */
  const longestRun = (w: Working): number => {
    const strings = [w.title, w.input, w.check ?? '', ...w.moves.flatMap((m) => [m.head, m.tex ?? '', m.note ?? '', m.rule ?? '']), ...w.answers.flatMap((a) => [a.label, a.tex])]
    return Math.max(...strings.map((s) => Math.max(0, ...(s.match(/\d+/g) ?? []).map((d) => d.length))))
  }

  it('the working of 10^1000 has no long run of digits and writes its powers as superscripts', () => {
    const w = runPure('factor', '10^(1000)')
    expect(w.error).toBeUndefined()
    expect(longestRun(w)).toBeLessThan(30)
    expect(w.title).toBe('Factorise 10¹⁰⁰⁰ into primes')
    expect(w.check).toBe('2¹⁰⁰⁰ × 5¹⁰⁰⁰ = 10¹⁰⁰⁰')
    expect(w.answers[0].tex).toBe('2^{1000} \\times 5^{1000}')
  })

  it('a number that is not a power of ten is shortened too, and a small one is left alone', () => {
    const w = runPure('factor', '3^(400)')
    expect(longestRun(w)).toBeLessThan(30)
    expect(w.check).toMatch(/^3⁴⁰⁰ = /)
    const small = runPure('primes', '360')
    expect(small.title).toBe('Factorise 360 into primes')
    expect(small.check).toBe('2³ × 3² × 5 = 360')
  })

  it('"=" gives the number itself, 10¹⁰⁰⁰, where it used to say it runs off to infinity', () => {
    const r = equals(String.raw`10^{1000}`)
    expect(r.error).toBeUndefined()
    expect(r.main).toBe('10¹⁰⁰⁰')
    const big = equals(String.raw`3^{700}`)
    expect(big.error).toBeUndefined()
    expect(big.main).toMatch(/^9\.\d+×10\^333$/)
    // 1 ÷ 0 is still no number.
    expect(equals(String.raw`1\div 0`).error?.sentence).toMatch(/divides by zero/)
  })
})

// ---------------------------------------------------------------------------------------------------------
// 2.6  examples as a textbook writes them
// ---------------------------------------------------------------------------------------------------------

describe('2.6: the examples in the help are written with textbook powers, not carets', () => {
  it('the list of what the screen can do typesets each example from its LaTeX, and the working shows no job menu', () => {
    const src = maths()
    expect(src).not.toMatch(/\{j\.example\}/)
    expect(src).toMatch(/<Tex tex=\{j\.exampleLatex\}/)
  })

  it('every example has LaTeX with its power written as a power', () => {
    for (const j of JOBS) {
      expect(j.exampleLatex, j.id).toBeTruthy()
      expect(j.exampleLatex, j.id).not.toMatch(/\*/)
    }
    expect(JOBS.find((j) => j.id === 'factor')?.exampleLatex).toBe('6x^2+7x-3')
  })
})

// ---------------------------------------------------------------------------------------------------------
// 2.7  the keypad
// ---------------------------------------------------------------------------------------------------------

describe('2.7: the keypad’s close button says what it is, and the keypad never covers a drawer', () => {
  it('the close button has the word Close beside its icon', () => {
    const src = maths()
    const popover = src.slice(src.indexOf('const KeypadPopover'), src.indexOf('function Answer('))
    expect(popover).toMatch(/<X size=\{12\} \/> Close/)
  })

  it('opening the keypad closes History and Variables; opening either closes the keypad', () => {
    const none = { keypad: false, vars: false, history: false }
    expect(openPane({ ...none, history: true, vars: true }, 'keypad')).toEqual({ keypad: true, vars: false, history: false })
    expect(openPane({ ...none, keypad: true }, 'history')).toEqual({ keypad: false, vars: false, history: true })
    expect(openPane({ ...none, keypad: true }, 'vars')).toEqual({ keypad: false, vars: true, history: false })
    // The two drawers stack, as they always did.
    expect(openPane({ ...none, history: true }, 'vars')).toEqual({ keypad: false, vars: true, history: true })
  })

  it('the screen uses it for every way of opening one of the three', () => {
    const src = maths()
    expect(src).toContain("openPane(panes, 'keypad')")
    expect(src).toContain("openPane(panes, 'history')")
    expect(src).toContain("openPane(panes, 'vars')")
  })
})

// ---------------------------------------------------------------------------------------------------------
// The second reviewer's cases (DeepSeek, section 2): every root, once, exact where it is, verified before it is shown
// ---------------------------------------------------------------------------------------------------------

describe('every root of a polynomial is found, shown once, exact where it is, and checked against the equation', () => {
  /** The polynomial's coefficients, highest power first, for each line below (worked out by hand, and the same ones Equations mode is given). */
  const CASES: { name: string; latex: string; coeffs: number[]; real: number[]; pairs: string[] }[] = [
    { name: 'x(x − 1)(x² + 1)', latex: String.raw`x\left(x-1\right)\left(x^{2}+1\right)=0`, coeffs: [1, -1, 1, -1, 0], real: [0, 1], pairs: ['±i'] },
    { name: 'x(x − 1)³(x² + 1)', latex: String.raw`x\left(x-1\right)^{3}\left(x^{2}+1\right)=0`, coeffs: [1, -3, 4, -4, 3, -1, 0], real: [0, 1], pairs: ['±i'] },
    { name: 'x(x − 1)³(x² − x + 1)', latex: String.raw`x\left(x-1\right)^{3}\left(x^{2}-x+1\right)=0`, coeffs: [1, -4, 7, -7, 4, -1, 0], real: [0, 1], pairs: ['0.5 ± 0.8660254038i'] },
    { name: '(x² + 1)(x² + 16)(x + 1)(x + 3)(x + 5)', latex: String.raw`\left(x^{2}+1\right)\left(x^{2}+16\right)\left(x+1\right)\left(x+3\right)\left(x+5\right)=0`, coeffs: [1, 9, 40, 168, 407, 399, 368, 240], real: [-5, -3, -1], pairs: ['±i', '±4i'] }
  ]

  it('gives each real root once, exactly, and the complex pairs in the note, with no fake pair for a root of 0', () => {
    for (const c of CASES) {
      const r = equals(c.latex)
      expect(r.error, c.name).toBeUndefined()
      expect(r.roots, c.name).toEqual(c.real)
      expect(r.rootsComplete, c.name).toBe(true)
      expect(r.main, c.name).toBe(c.real.map((v, i) => `x${'₁₂₃'[i]} = ${v < 0 ? '−' : ''}${Math.abs(v)}`).join(', '))
      expect(r.extra, c.name).toEqual([`Also, in complex numbers: x = ${c.pairs.join(' or x = ')}`])
    }
  })

  it('lists the same roots as Equations mode does for the same coefficients, in the same form', () => {
    for (const c of CASES) {
      const rows = polynomialRootRows(c.coeffs)
      const mine = equals(c.latex)
      expect(rows.filter((row) => !/[ij]|i$/.test(row.text)).map((row) => row.text), c.name).toEqual(c.real.map((v) => (v < 0 ? `−${Math.abs(v)}` : String(v))))
      expect(realAndPairs(c.coeffs).real, c.name).toEqual(mine.roots)
    }
  })

  it('a multiple root is one real root, never near-copies or a pair: (x − 1)³ is x = 1', () => {
    const pairs = realAndPairs([1, -3, 3, -1])
    expect(pairs).toMatchObject({ real: [1], pairs: [], complete: true })
    const mixed = realAndPairs(CASES[2].coeffs)
    expect(mixed.pairs).toEqual(['0.5 ± 0.8660254038i'])
  })

  it('polyRoots does not call a root of 0 a pair: no root of the product has an imaginary part of 10⁻³¹', () => {
    for (const c of CASES) for (const z of polyRoots(c.coeffs)) expect(z.im === 0 || Math.abs(z.im) > 1e-6, `${c.name}: ${z.re} + ${z.im}i`).toBe(true)
  })

  it('a root is shown only once it has been checked in the equation: the ones that fail are left out and the list says it is not complete', () => {
    // (x − 1)(x − 2): 1 is a root, 2.5 is not.
    const kept = keepVerified([1, -3, 2], [{ re: 1, im: 0 }, { re: 2.5, im: 0 }, { re: 2, im: 0 }])
    expect(kept.roots).toEqual([{ re: 1, im: 0 }, { re: 2, im: 0 }])
    expect(kept.complete).toBe(false)
    expect(keepVerified([1, -3, 2], [{ re: 1, im: 0 }, { re: 2, im: 0 }]).complete).toBe(true)
    // …and the tolerance is the size of the terms that made the answer, not an absolute 10⁻⁹: a root of 10⁸ checks.
    expect(keepVerified([1, -1e8, 0], [{ re: 0, im: 0 }, { re: 1e8, im: 0 }]).complete).toBe(true)
  })

  it('a polynomial whose coefficients are not whole decimals still has its roots polished and verified', () => {
    // 3x³ − 2x² − 7x + 6 … with a third written as a decimal the exact route cannot take: (x − 1)(x + 1.5)(x − 2/3·3) is not a thing to guess at.
    const rows = realAndPairs([1, -0.5, -0.5, 0])
    expect(rows.real).toHaveLength(3)
    for (const r of rows.real) expect(Math.abs(r * r * r - 0.5 * r * r - 0.5 * r)).toBeLessThan(1e-12)
  })
})

describe('the sentences: a unit is named as one, and x is not blamed for a letter that is not x’s', () => {
  it('2A + 1 says what a unit is and what to do, and no longer sends the student to the letter it just refused', () => {
    const r = equals(String.raw`2A+1`)
    expect(r.error?.sentence).toMatch(/read as a unit/)
    expect(r.error?.sentence).toMatch(/under Variables/)
    expect(r.error?.sentence).not.toMatch(/Use one of the letters A to F/)
  })

  it('a line with a quantity and a letter that has no value names the real trouble, not x', () => {
    const r = equals(String.raw`x+2C`)
    expect(r.error?.sentence).not.toMatch(/I don't know what x is/)
    expect(r.error?.sentence).toMatch(/unit/)
    expect(r.error?.sentence).toMatch(/x/)
  })

  it('A = 5 is still refused in words that point to Variables: a letter on its own side of = is not stored by typing', () => {
    expect(equals('A=5').error?.sentence).toMatch(/^Typing A = … does not store a value/)
    expect(equals('C = 2').error?.sentence).toMatch(/^Typing C = … does not store a value/)
  })

  it('a calculus line with a letter nobody gave a value is not turned into a formula in disguise', () => {
    const r = equals(String.raw`\int_{0}^{1}A\cdot x\,dx`)
    expect(r.tex).toBeUndefined()
    expect(r.error).toBeDefined()
  })
})

import katex from 'katex'
import { all, create } from 'mathjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  binomialCd,
  binomialPd,
  countSigFigs,
  dimensionsOf,
  evaluateBaseN,
  evaluateComp,
  exactForm,
  formatBase,
  formatValue,
  integrate,
  inverseNormal,
  normalCdf,
  poissonCd,
  poissonPd,
  polyInequality,
  polyRoots,
  propagate,
  roundSig,
  sciNotation,
  solveLinearSystem,
  statistics,
  toFraction
} from '../src/renderer/src/calc/engine'
import { polynomialRootRows } from '../src/renderer/src/calc/roots'
import { answerTex, polygonReport } from '../src/renderer/src/math/shapeFormulas'
import { calcEng, calcNum, mathFormatOptions, setCalcPrecisionSource } from '../src/renderer/src/calc/format'
import { casInDegrees } from '../src/renderer/src/calc/angle'
import { useCalc } from '../src/renderer/src/calc/calcStore'
import { parseAnswer } from '../src/renderer/src/math/checkAnswer'
import { fmt, type MeasureSettings } from '../src/renderer/src/math/format'
import { defineUnits, getAngleMode, math, preprocess, setAngleMode } from '../src/renderer/src/math/expr'
import { resetGlobals } from './helpers/globals'
import { CONSTANTS } from '../src/renderer/src/calc/constants'
import { UNIT_PRESETS, convertListed, convertTyped, unitLabel } from '../src/renderer/src/calc/units'
import { evaluateInput } from '../src/renderer/src/calc/evaluateInput'
import { errorSentence } from '../src/renderer/src/calc/errors'

const ctx = { vars: {}, ans: 0, angle: 'deg' as const }

// evaluateComp works in its context's angle and puts the mode it found back (H3), but a case that sets
// the angle mode itself would leave the global wherever it last was.
beforeEach(resetGlobals)

describe('COMP mode', () => {
  it('evaluates calculator-style input', () => {
    expect(Number(evaluateComp('sin(30)', ctx).value)).toBeCloseTo(0.5)
    expect(Number(evaluateComp('2×3÷4', ctx).value)).toBeCloseTo(1.5)
    expect(Number(evaluateComp('√(16)+3²', ctx).value)).toBeCloseTo(13)
    expect(Number(evaluateComp('nCr(5,2)', ctx).value)).toBe(10)
    expect(Number(evaluateComp('30°30\'', ctx).value)).toBeCloseTo(30.5)
    expect(Number(evaluateComp('ddx(x^3, 2)', ctx).value)).toBeCloseTo(12, 6)
    expect(Number(evaluateComp('integral(x^2, 0, 3)', ctx).value)).toBeCloseTo(9, 8)
    expect(Number(evaluateComp('sigma(x, 1, 100)', ctx).value)).toBe(5050)
    expect(Number(evaluateComp('Ans + 1', { ...ctx, ans: 41 }).value)).toBe(42)
  })
  it('solves equations and converts polar/rectangular', () => {
    expect(Number(evaluateComp('x^2 = 2', { ...ctx, vars: { x: 1 } }).value)).toBeCloseTo(Math.SQRT2)
    const pol = evaluateComp('Pol(3, 4)', ctx)
    expect(pol.text).toBe('r = 5')
    expect(pol.extra?.[0]).toContain('53.13')
    // An argument with its own comma must not split in the wrong place.
    expect(evaluateComp('Pol(max(1,3), 4)', ctx).text).toBe('r = 5')
    expect(evaluateComp('Pol(3*cos(0), 4)', ctx).text).toBe('r = 5')
    expect(Number(evaluateComp('Rec(√(4), 60)', ctx).value)).toBeCloseTo(1)
    expect(Number(evaluateComp('Rec(max(1,2), 60)', ctx).value)).toBeCloseTo(1)
  })
})

describe('exact forms', () => {
  it('recognises fractions, surds and π', () => {
    expect(exactForm(0.75)).toBe('\\frac{3}{4}')
    expect(exactForm(Math.SQRT2 / 2)).toBe('\\frac{\\sqrt{2}}{2}')
    expect(exactForm(Math.PI / 3)).toBe('\\frac{\\pi}{3}')
    expect(exactForm(2 * Math.sqrt(3))).toBe('2\\sqrt{3}')
    // A small number is not √0: v² rounds to the fraction 0/1 and 1 ÷ 500000 showed \\sqrt{0}.
    expect(exactForm(2e-6)).toBeNull()
    expect(exactForm(1e-8)).toBeNull()
    expect(exactForm(2.5e-9)).toBeNull()
  })
})

describe('equations', () => {
  it('finds polynomial roots including complex ones', () => {
    const r = polyRoots([1, -5, 6])
    expect(r.map((z) => z.re)).toEqual([2, 3].map((v) => expect.closeTo(v, 9) as unknown as number))
    const c = polyRoots([1, 0, 1])
    expect(Math.abs(c[0].im)).toBeCloseTo(1)
  })
  it('solves simultaneous equations', () => {
    const x = solveLinearSystem([[2, 1], [1, -1]], [7, 2])
    expect(x[0]).toBeCloseTo(3)
    expect(x[1]).toBeCloseTo(1)
  })
  it('solves inequalities', () => {
    const iv = polyInequality([1, -5, 6], '<')
    expect(iv).toHaveLength(1)
    expect(iv[0].from).toBeCloseTo(2)
    expect(iv[0].to).toBeCloseTo(3)
  })
})

describe('stats, distributions, base-n', () => {
  it('fits a line', () => {
    const s = statistics([1, 2, 3, 4], [3, 5, 7, 9], null, 'linear')
    expect(s.coef?.a).toBeCloseTo(1)
    expect(s.coef?.b).toBeCloseTo(2)
    expect(s.r).toBeCloseTo(1)
  })
  it('computes distributions', () => {
    expect(normalCdf(-1, 1)).toBeCloseTo(0.682689, 5)
    expect(inverseNormal(0.975)).toBeCloseTo(1.959964, 5)
    expect(binomialPd(2, 4, 0.5)).toBeCloseTo(0.375)
    expect(integrate((x) => Math.sin(x), 0, Math.PI)).toBeCloseTo(2, 9)
  })
  it('does BASE-N logic', () => {
    expect(evaluateBaseN('FF + 1', 16)).toBe(256)
    expect(formatBase(evaluateBaseN('1010 and 0110', 2), 2)).toBe('0010')
    expect(formatBase(-1, 16)).toBe('FFFFFFFF')
  })
})

describe('chapter 1 measurements', () => {
  it('counts significant figures', () => {
    expect(countSigFigs('0.00450').count).toBe(3)
    expect(countSigFigs('1200').count).toBe(2)
    expect(countSigFigs('1200.').count).toBe(4)
    expect(countSigFigs('3.20×10^4').count).toBe(3)
  })
  it('propagates uncertainties and finds dimensions', () => {
    const r = propagate('×', { value: 2, unc: 0.1 }, { value: 3, unc: 0.3 })
    expect(r.value).toBe(6)
    expect(r.unc).toBeCloseTo(0.9)
    expect(dimensionsOf('N')).toBe('[M L T^-2]')
  })
})

describe('the × key means what is on either side of it', () => {
  it('multiplies numbers', () => {
    expect(parseAnswer('2 × 3')).toBe(6)
    expect(parseAnswer('2.5\u00a0×\u00a010^3')).toBe(2500)
  })

  it('reads back the scientific notation PhysLab itself prints', () => {
    // fmt() writes small and large numbers as "1.234×10^-5"; rewriting every × to a cross
    // product meant the app could not read its own output.
    for (const v of [0.00001234, 1.5e10, -2.5e-7]) {
      expect(parseAnswer(fmt(v, 4))).toBeCloseTo(v, 12)
    }
  })

  it('still takes a cross product between vectors', () => {
    const r = math.evaluate(preprocess('<1, 0, 0> × <0, 1, 0>')) as number[]
    expect([r[0], r[1], r[2]]).toEqual([0, 0, 1])
  })
})

describe('calculus follows the angle mode, like the real calculator', () => {
  const deg = { vars: {}, ans: 0, angle: 'deg' as const }
  const rad = { vars: {}, ans: 0, angle: 'rad' as const }

  it('differentiates in degrees when the calculator is in DEG', () => {
    // d/dx sin(x°) = cos(x°) × π/180 — what a scientific calculator shows in DEG mode.
    expect(Number(evaluateComp('ddx(sin(x), 30)', deg).value)).toBeCloseTo((Math.cos(Math.PI / 6) * Math.PI) / 180, 6)
    expect(Number(evaluateComp('integral(sin(x), 0, 90)', deg).value)).toBeCloseTo(180 / Math.PI, 4)
  })

  it('is unchanged in RAD', () => {
    expect(Number(evaluateComp('ddx(sin(x), 30)', rad).value)).toBeCloseTo(Math.cos(30), 6)
    expect(Number(evaluateComp('integral(sin(x), 0, pi)', rad).value)).toBeCloseTo(2, 6)
  })

  it('leaves plain algebra alone in either mode', () => {
    expect(Number(evaluateComp('ddx(x^3, 2)', deg).value)).toBeCloseTo(12, 6)
    expect(Number(evaluateComp('integral(x^2, 0, 3)', rad).value)).toBeCloseTo(9, 8)
  })
})

describe('BASE-N arithmetic is whole-number arithmetic, one operator at a time', () => {
  it('divides as a calculator does, throwing the fraction away at each step', () => {
    // 7 ÷ 2 is 3 on the screen before it is multiplied: 6, not 7 (which is what working in
    // decimals and truncating at the very end used to give).
    expect(evaluateBaseN('7/2*2', 10)).toBe(6)
    expect(evaluateBaseN('7/2', 10)).toBe(3)
    expect(evaluateBaseN('-7/2', 10)).toBe(-3)
    expect(evaluateBaseN('100/3/3', 10)).toBe(11)
  })
  it('keeps the usual precedence, with brackets and the logic words', () => {
    expect(evaluateBaseN('2+3*4', 10)).toBe(14)
    expect(evaluateBaseN('(2+3)*4', 10)).toBe(20)
    expect(evaluateBaseN('1100 or 0011', 2)).toBe(15)
    expect(evaluateBaseN('1100 xor 1010', 2)).toBe(6)
    expect(evaluateBaseN('1100 xnor 1010', 2)).toBe(~6)
    expect(evaluateBaseN('not(0)', 2)).toBe(-1)
    expect(evaluateBaseN('neg(5)', 10)).toBe(-5)
    expect(evaluateBaseN('neg 5 + 7', 10)).toBe(2)
    // "and" between hex numbers is the word, not the digits a, d: A and D is 8, not a syntax error.
    expect(evaluateBaseN('A and D', 16)).toBe(8)
    expect(evaluateBaseN('DEAD and FF', 16)).toBe(0xad)
    expect(evaluateBaseN('17 + 1', 8)).toBe(16)
  })
  it('multiplies with 32-bit wrap-around, not through a rounded double', () => {
    // Two 31-bit numbers need 62 bits; the double rounds and the low word came out as 0.
    expect(evaluateBaseN('7FFFFFFF*7FFFFFFF', 16)).toBe(1)
    expect(evaluateBaseN('10000*10000', 16)).toBe(0)
    expect(evaluateBaseN('FFFF*FFFF', 16)).toBe(0xfffe0001 | 0)
  })
  it('refuses what it cannot read, and division by zero, with the calculator words', () => {
    expect(() => evaluateBaseN('5/0', 10)).toThrow('Math ERROR')
    expect(() => evaluateBaseN('2 +', 10)).toThrow('Syntax ERROR')
    expect(() => evaluateBaseN('12', 2)).toThrow('Syntax ERROR')
    expect(() => evaluateBaseN('(1+2', 10)).toThrow('Syntax ERROR')
    expect(() => evaluateBaseN('', 10)).toThrow('Syntax ERROR')
  })
})

describe('the calculator writes numbers with the precision setting', () => {
  it('follows decimal places or significant figures, whichever the student chose', () => {
    expect(calcNum(1 / 3, { decimals: 2, precisionMode: 'dp' })).toBe('0.33')
    expect(calcNum(1 / 3, { decimals: 4, precisionMode: 'sf' })).toBe('0.3333')
    expect(calcNum(123456.789, { decimals: 3, precisionMode: 'sf' })).toBe('123000')
    expect(calcNum(-2.5, { decimals: 1, precisionMode: 'dp' })).toBe('−2.5')
  })
  it('never pads an exact answer with zeros: 5 is 5', () => {
    expect(calcNum(5, { decimals: 10, precisionMode: 'sf' })).toBe('5')
    expect(calcNum(2.5, { decimals: 3, precisionMode: 'sf' })).toBe('2.5')
    expect(calcNum(5, { decimals: 2, precisionMode: 'dp' })).toBe('5')
    expect(evaluateComp('Pol(3, 4)', ctx).text).toBe('r = 5')
  })
  it('never shows 0 for something that is not 0, nor 0.01 for the fine-structure constant', () => {
    expect(calcNum(0.001, { decimals: 2, precisionMode: 'dp' })).toBe('0.001')
    expect(calcNum(0.0072973525693, { decimals: 2, precisionMode: 'dp' })).toBe('0.0073')
    expect(calcNum(0.05, { decimals: 2, precisionMode: 'dp' })).toBe('0.05')
    expect(calcNum(0.35, { decimals: 2, precisionMode: 'dp' })).toBe('0.35')
    expect(calcNum(0.123456, { decimals: 2, precisionMode: 'dp' })).toBe('0.12')
    expect(calcNum(-0.00042, { decimals: 2, precisionMode: 'dp' })).toBe('−0.00042')
    expect(calcNum(0, { decimals: 2, precisionMode: 'dp' })).toBe('0')
  })
  it('uses exponent form for very large and very small values, and the error words', () => {
    expect(calcNum(6.02214076e23, { decimals: 3, precisionMode: 'sf' })).toBe('6.02×10^23')
    expect(calcNum(1.6e-19, { decimals: 2, precisionMode: 'dp' })).toBe('1.6×10^-19')
    // Words, not a handheld's "Math ERROR" (0.6: nothing on the Maths screen reads like a handheld calculator).
    expect(calcNum(NaN)).toBe('no value')
    expect(calcNum(Infinity)).toBe('∞')
    expect(calcNum(-Infinity)).toBe('−∞')
  })
  it('writes engineering notation with the same digits', () => {
    expect(calcEng(12345, { decimals: 4, precisionMode: 'sf' })).toBe('12.35×10^3')
    expect(calcEng(0.00042, { decimals: 2, precisionMode: 'sf' })).toBe('420×10^-6')
    expect(calcEng(0)).toBe('0')
  })
  it('hands mathjs the same precision for complex numbers and matrices', () => {
    // Every number mathjs meets inside is written by calcNum at the precision handed over (G3), so it
    // is never padded either.
    expect(math.format(1 / 3, mathFormatOptions({ decimals: 4, precisionMode: 'sf' }))).toBe('0.3333')
    expect(math.format(math.complex(1 / 3, 2), mathFormatOptions({ decimals: 2, precisionMode: 'dp' }))).toBe('0.33 + 2i')
    // On the screen a complex result follows the calculator's never-pad rule like any number.
    setCalcPrecisionSource(() => ({ decimals: 2, precisionMode: 'dp' }))
    expect(formatValue(math.complex(1 / 3, 2))).toBe('0.33 + 2i')
    expect(formatValue(math.complex(0, -1))).toBe('−i')
    expect(formatValue(math.complex(2, 0))).toBe('2')
    expect(formatValue(math.complex(1.5, -2.25))).toBe('1.5 − 2.25i')
    setCalcPrecisionSource(() => ({ decimals: 10, precisionMode: 'sf' }))
  })
  it('takes the precision from wherever the panel points it', () => {
    setCalcPrecisionSource(() => ({ decimals: 1, precisionMode: 'dp' }))
    expect(calcNum(Math.PI)).toBe('3.1')
    setCalcPrecisionSource(() => ({ decimals: 10, precisionMode: 'sf' }))
    expect(calcNum(Math.PI)).toBe('3.141592654')
  })
})

describe('the algebra engine and the calculator agree about degrees', () => {
  it('sends the degree flag whenever the angle mode is degrees, letters or not', () => {
    // It used to be withheld when the expression had an x in it, so diff(sin(x)) in DEG mode
    // went out in radians while the keypad's own ddx worked in degrees.
    expect(casInDegrees('deg')).toBe(true)
    expect(casInDegrees('rad')).toBe(false)
    expect(casInDegrees('grad')).toBe(false)
  })
})

describe('a constant picked from the list', () => {
  it('waits for the maths field rather than landing at character 0', () => {
    useCalc.setState({ mode: 'CONST', input: '2*', pending: null })
    useCalc.getState().insert('c')
    // The text is untouched; the field will put the constant at its caret when it mounts.
    expect(useCalc.getState().input).toBe('2*')
    expect(useCalc.getState().mode).toBe('COMP')
    expect(useCalc.getState().takePending()).toBe('c')
    expect(useCalc.getState().takePending()).toBeNull()
  })
  it('returns to the keypad the student left for the CONST list', () => {
    // insert() only ever runs while the CONST list is on screen, so the mode at that moment is
    // never the keypad; the keypad has to be remembered from before the list was opened.
    useCalc.setState({ mode: 'CMPLX' })
    useCalc.setState({ mode: 'CONST' })
    useCalc.getState().insert('h')
    expect(useCalc.getState().mode).toBe('CMPLX')
    expect(useCalc.getState().takePending()).toBe('h')
    useCalc.setState({ mode: 'COMP' })
    useCalc.setState({ mode: 'CONST' })
    useCalc.getState().insert('c')
    expect(useCalc.getState().mode).toBe('COMP')
  })
})

describe('numbers below the grid formatter’s floor', () => {
  it('are written as a power of ten, not as 0', () => {
    expect(calcNum(6.674e-11, { decimals: 3, precisionMode: 'sf' })).toBe('6.67×10^-11')
    expect(calcNum(9.9999e-15, { decimals: 2, precisionMode: 'sf' })).toBe('1×10^-14')
    // Rounding the mantissa up to 10 makes the value exactly one power of ten: formatting it a
    // second time rounded 0.95 down and printed the non-normalised 0.9×10^-12.
    expect(calcNum(9.5e-13, { decimals: 1, precisionMode: 'sf' })).toBe('1×10^-12')
    expect(calcNum(-9.5e-13, { decimals: 1, precisionMode: 'sf' })).toBe('−1×10^-12')
    expect(calcNum(-1.602176634e-19, { decimals: 4, precisionMode: 'sf' })).toBe('−1.602×10^-19')
  })
})

describe('a constant inserted into the maths field', () => {
  it('evaluates under the spelling the field hands back', () => {
    // The list inserts h_P; MathLive writes it as a subscript and latexToMath returns hP.
    expect(Number(evaluateComp('h_P', ctx).value)).toBeCloseTo(6.62607015e-34, 40)
    expect(Number(evaluateComp('hP', ctx).value)).toBeCloseTo(6.62607015e-34, 40)
    // CODATA 2022 proton mass (was 1.67262192369e-27 under CODATA 2018).
    expect(Number(evaluateComp('2*mp', ctx).value)).toBeCloseTo(2 * 1.67262192595e-27, 33)
  })
})

describe('constants list pinned to CODATA 2022', () => {
  const byId = (id: string): number => CONSTANTS.find((c) => c.id === id)!.value

  it('holds the measured values that moved from CODATA 2018 (NIST SP 959, May 2024)', () => {
    // Constants fixed by the 2019 SI redefinition (h, e, k_B, N_A, c, and anything built only
    // from them) never move between adjustments and are covered by the h_P/e_ch checks above;
    // this pins the measured constants that CODATA 2022 actually revised.
    expect(byId('m_p')).toBe(1.67262192595e-27) // was 1.67262192369e-27
    expect(byId('m_n')).toBe(1.67492750056e-27) // was 1.67492749804e-27
    expect(byId('m_e')).toBe(9.1093837139e-31) // was 9.1093837015e-31
    expect(byId('a_0')).toBe(5.29177210544e-11) // was 5.29177210903e-11
    expect(byId('mu_N')).toBe(5.0507837393e-27) // was 5.0507837461e-27
    expect(byId('mu_B')).toBe(9.2740100657e-24) // was 9.2740100783e-24
    expect(byId('alpha_f')).toBe(7.2973525643e-3) // was 7.2973525693e-3
    expect(byId('r_e')).toBe(2.8179403205e-15) // was 2.8179403262e-15
    expect(byId('lambda_c')).toBe(2.42631023538e-12) // was 2.42631023867e-12
    expect(byId('gamma_p')).toBe(2.6752218708e8) // was 2.6752218744e8
    expect(byId('lambda_cp')).toBe(1.3214098536e-15) // was 1.32140985539e-15
    expect(byId('lambda_cn')).toBe(1.31959090382e-15) // was 1.31959090581e-15
    expect(byId('R_inf')).toBe(10973731.568157) // was 10973731.56816
    expect(byId('u_amu')).toBe(1.66053906892e-27) // was 1.6605390666e-27
    expect(byId('mu_p')).toBe(1.41060679545e-26) // was 1.41060679736e-26
    expect(byId('mu_e')).toBe(-9.2847646917e-24) // was -9.2847647043e-24
    expect(byId('mu_n')).toBe(-9.6623653e-27) // was -9.6623651e-27
    expect(byId('eps_0')).toBe(8.8541878188e-12) // was 8.8541878128e-12
    expect(byId('mu_0')).toBe(1.25663706127e-6) // was 1.25663706212e-6
    expect(byId('Z_0')).toBe(376.730313412) // was 376.730313668
    expect(byId('k_e')).toBe(8.9875517862e9) // was 8.9875517923e9, derived from eps_0
  })

  it('leaves the constants CODATA 2022 did not move alone', () => {
    // G is unchanged at this precision (Idea 12's own finding); exact-by-definition constants
    // (h, hbar, e, k_B, N_A, c, F, R, sigma_SB, phi_0, G_0, R_K, K_J, g_n, atm_std, t_C) cannot
    // move between adjustments.
    expect(byId('G_grav')).toBe(6.6743e-11)
    expect(byId('h_P')).toBe(6.62607015e-34)
    expect(byId('hbar')).toBe(1.054571817e-34)
    expect(byId('m_mu')).toBe(1.883531627e-28)
    expect(byId('mu_mu')).toBe(-4.4904483e-26)
  })
})

describe('exact form of a tiny number', () => {
  it('is not 0: 7 ÷ 3h used to show 0 as its exact answer', () => {
    expect(exactForm(1.5e-33)).toBeNull()
    expect(exactForm(0)).toBe('0')
    expect(exactForm(0.001)).toBe('\\frac{1}{1000}')
  })
})

describe('H10 — no invented exact fractions', () => {
  const maths = { vars: {}, ans: 0, angle: 'deg' as const }
  const settings = (unit: MeasureSettings['unit'], unitPerSquare: number): MeasureSettings => ({ decimals: 2, precisionMode: 'dp', unit, unitPerSquare, angleUnit: 'deg' })
  /** The answer line Geometry's report shows for a shape's row, as the shape panel asks for it. */
  const reportAnswer = (pts: [number, number, number][], title: string, s: MeasureSettings): string => {
    const row = polygonReport(pts, ['A', 'B', 'C', 'D', 'E', 'F'], s).rows.find((r) => r.title === title)
    if (!row) throw new Error(`no ${title} row`)
    return answerTex(row.value, row.kind, s)
  }

  it('Equations mode: the irrational roots of x² − 10000x + 1 = 0 are not fractions', () => {
    // x₁ read 99989999/9999 and x₂ read 1/10000: 10⁻¹¹ of their size away, which any number is.
    expect(polynomialRootRows([1, -10000, 1]).map((r) => r.tex)).toEqual([null, null])
    expect(exactForm(5000 + Math.sqrt(24999999))).toBeNull()
    expect(exactForm(1 / (5000 + Math.sqrt(24999999)))).toBeNull()
  })

  it('Geometry: a hexagon of radius 3 at 1 □ = 10 mm and a 4 × 4 square at 1 □ = 1000 km get their true forms', () => {
    const hexagon = Array.from({ length: 6 }, (_, k): [number, number, number] => [3 * Math.cos((Math.PI * k) / 3), 3 * Math.sin((Math.PI * k) / 3), 0])
    const area = reportAnswer(hexagon, 'Area', settings('mm', 10))
    // Was \frac{9968039}{4263} mm²; the area is 1350√3 mm² ≈ 2338.27 mm².
    expect(area).not.toContain('\\frac')
    expect(area).toContain('1350\\sqrt{3}')
    expect(area).toContain('2338.27')
    const diagonal = reportAnswer([[0, 0, 0], [4, 0, 0], [4, 4, 0], [0, 4, 0]], 'Diagonal', settings('km', 1000))
    // Was \frac{15641202}{2765} km; the diagonal is 4000√2 km ≈ 5656.85 km.
    expect(diagonal).not.toContain('\\frac')
    expect(diagonal).toContain('4000\\sqrt{2}')
    expect(diagonal).toContain('5656.85')
  })

  it('the Maths screen: an irrational answer above 10³ gets its own form or none, never a near fraction', () => {
    expect(evaluateInput('COMP', '4000×√(2)', maths)?.exact).toBe('4000\\sqrt{2}')
    expect(evaluateInput('COMP', '1350×√(3)', maths)?.exact).toBe('1350\\sqrt{3}')
    expect(evaluateInput('COMP', '1000×√(2)+0.5', maths)?.exact ?? null).toBeNull()
    expect(evaluateInput('COMP', '1000×π+0.5', maths)?.exact ?? null).toBeNull()
  })

  it('genuine fractions survive, from a few float operations too', () => {
    expect(exactForm(1 / 3)).toBe('\\frac{1}{3}')
    expect(exactForm(22 / 7)).toBe('\\frac{22}{7}')
    expect(exactForm(0.1 + 0.2)).toBe('\\frac{3}{10}')
    expect(exactForm(2 / 3 + 1 / 7)).toBe('\\frac{17}{21}')
    expect(exactForm(0.35 * 3)).toBe('\\frac{21}{20}')
    expect(exactForm(((1 / 3) * 7) / 2)).toBe('\\frac{7}{6}')
    expect(exactForm(1.1 - 1)).toBe('\\frac{1}{10}')
    expect(exactForm(1 / 9999)).toBe('\\frac{1}{9999}')
    // Large ones, with the small denominators a true form has there.
    expect(exactForm(1e6 / 3)).toBe('\\frac{1000000}{3}')
    expect(exactForm(2e9 / 3)).toBe('\\frac{2000000000}{3}')
    expect(exactForm(((5 * Math.PI) / 27) * 1e9)).toBe('\\frac{5000000000\\pi}{27}')
    // A typed decimal that only looks like a fraction stays a decimal.
    expect(exactForm(0.33333333333)).toBeNull()
    expect(exactForm(3.142857)).toBeNull()
    // Typed and on the screen.
    expect(evaluateInput('COMP', '22/7', maths)?.exact).toBe('\\frac{22}{7}')
    expect(evaluateInput('COMP', '0.1+0.2', maths)?.exact).toBe('\\frac{3}{10}')
    expect(evaluateInput('COMP', '2/3+1/7', maths)?.exact).toBe('\\frac{17}{21}')
  })

  it('surds and multiples of π survive, large ones too', () => {
    expect(exactForm(4000 * Math.SQRT2)).toBe('4000\\sqrt{2}')
    expect(exactForm(1350 * Math.sqrt(3))).toBe('1350\\sqrt{3}')
    expect(exactForm((27 * Math.sqrt(3)) / 8)).toBe('\\frac{27\\sqrt{3}}{8}')
    expect(exactForm(20000 * Math.sqrt(5))).toBe('20000\\sqrt{5}')
    expect(exactForm(1000 * Math.PI)).toBe('1000\\pi')
    expect(exactForm((49 / 4) * Math.PI)).toBe('\\frac{49\\pi}{4}')
    expect(exactForm((5 * Math.PI) / 54)).toBe('\\frac{5\\pi}{54}')
  })

  it('a sweep of 2 000 numbers between 10³ and 10⁶ finds no fraction that is not there', () => {
    // mulberry32, seeded: the same 2 000 numbers on every run.
    let seed = 20261003
    const random = (): number => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const invented: string[] = []
    for (let i = 0; i < 2000; i++) {
      // k√2 and kπ have their own form (k√2 none from about 5×10⁵, where the search through v²
      // stops); a product of two arbitrary numbers has none at all.
      let v: number
      let own: string | null = null
      if (i % 3 === 0) {
        const k = 708 + Math.floor(random() * 706398)
        v = k * Math.SQRT2
        own = `${k}\\sqrt{2}`
      } else if (i % 3 === 1) {
        const k = 319 + Math.floor(random() * 317990)
        v = k * Math.PI
        own = `${k}\\pi`
      } else {
        v = 10 ** (1.5 + 1.5 * random()) * 10 ** (1.5 + 1.5 * random())
      }
      const ex = exactForm(v)
      if (ex !== null && ex !== own) invented.push(`${v} → ${ex}`)
      const f = toFraction(v, 10000)
      if (f) invented.push(`${v} → ${f[0]}/${f[1]}`)
    }
    expect(invented).toEqual([])
  })

  it('writes a whole number from 10²¹ on in powers of ten, never as 1e+22', () => {
    expect(exactForm(1e22)).toBe('1\\times 10^{22}')
    expect(exactForm(-5e25)).toBe('-5\\times 10^{25}')
    expect(exactForm(2 ** 70)).toBe('1.18059162071741\\times 10^{21}')
    expect(exactForm(1e20)).toBe('100000000000000000000')
    for (const v of [1e22, -5e25, 2 ** 70]) expect(() => katex.renderToString(exactForm(v) ?? '', { throwOnError: true })).not.toThrow()
    // On the screens that show it: a root in Equations mode, and the Maths screen's answer.
    expect(polynomialRootRows([1, -1e22]).map((r) => r.tex)).toEqual(['1\\times 10^{22}'])
    const r = evaluateInput('COMP', '10^22', maths)
    expect(`${r?.main} ${r?.exact ?? ''}`).not.toMatch(/\de[+-]?\d/)
  })
})

describe('G3 — complex, matrix and unit values round like plain numbers', () => {
  const dp1 = { decimals: 1, precisionMode: 'dp' as const }
  afterEach(() => setCalcPrecisionSource(() => ({ decimals: 10, precisionMode: 'sf' })))

  it('0.35 × 3 is 1.1 at one decimal place in a complex number, a matrix and a unit, as it is alone', () => {
    const v = 0.35 * 3 // stored as 1.0499999999999998
    expect(calcNum(v, dp1)).toBe('1.1')
    expect(math.format(math.complex(v, 1), mathFormatOptions(dp1))).toBe('1.1 + i')
    expect(math.format(math.matrix([[v, 2], [3, 4]]), mathFormatOptions(dp1))).toBe('[[1.1, 2], [3, 4]]')
    expect(math.format(math.unit(v, 'm'), mathFormatOptions(dp1))).toBe('1.1 m')
    // The screen's formatter, at the student's own precision; a complex entry of a matrix too.
    setCalcPrecisionSource(() => dp1)
    expect(formatValue(math.matrix([[v, 2], [3, 4]]))).toBe('[[1.1, 2], [3, 4]]')
    expect(formatValue(math.matrix([[math.complex(v, 1), 2], [3, 4]]))).toBe('[[1.1 + i, 2], [3, 4]]')
    expect(formatValue(math.unit(v, 'm'))).toBe('1.1 m')
  })

  it('significant figures as plain numbers have them, with no e-notation', () => {
    const sf4 = { decimals: 4, precisionMode: 'sf' as const }
    expect(math.format(math.complex(123456.7, 1), mathFormatOptions(sf4))).toBe(`${calcNum(123456.7, sf4)} + i`)
    expect(math.format(math.complex(123456.7, 1), mathFormatOptions(sf4))).not.toMatch(/\de[+-]?\d/)
  })
})

describe('P8 — every unit the Units lists offer converts', () => {
  // The Units mode converts with math.unit(value, from).toNumber(to) on the app's one shared
  // mathjs instance (panels/calcModes.tsx, UnitsMode), so that is the call checked here. mathjs
  // 15.2.0 has no lightyear, u, knot, cal or kcal, and nothing defined them: picking one answered
  // 'Unit "lightyear" not found.' on the screen. "Charge & current" put coulombs beside amperes,
  // which can never convert into each other.
  const listOf = (category: string): string[] => UNIT_PRESETS.find(([name]) => name === category)?.[1] ?? []
  /** How far `got` is from `want`, as a fraction of `want`. */
  const rel = (got: number, want: number): number => Math.abs(got / want - 1)

  /** null when 1 `unit` goes to `first` and comes back as 1; otherwise what went wrong, naming the unit. */
  const roundTrip = (unit: string, first: string): string | null => {
    try {
      const there = math.unit(1, unit).toNumber(first)
      const back = math.unit(there, first).toNumber(unit)
      return Math.abs(back - 1) <= 1e-12 ? null : `${unit}: 1 ${unit} → ${there} ${first} → ${back} ${unit}, not 1`
    } catch (e) {
      return `${unit}: ${e instanceof Error ? e.message : String(e)}`
    }
  }

  for (const [category, units] of UNIT_PRESETS) {
    it(`${category}: every unit goes to ${units[0]} and back to 1`, () => {
      expect(units.map((u) => roundTrip(u, units[0])).filter((r) => r !== null)).toEqual([])
    })
  }

  it('the astronomical unit is 149 597 870 700 m exactly (IAU 2012)', () => {
    expect(rel(math.unit(1, 'au').toNumber('m'), 149597870700)).toBeLessThan(1e-12)
  })

  it('the light-year is c × one Julian year, 9 460 730 472 580 800 m', () => {
    expect(rel(math.unit(1, 'lightyear').toNumber('m'), 299792458 * 31557600)).toBeLessThan(1e-12)
    expect(rel(math.unit(1, 'lightyear').toNumber('m'), 9460730472580800)).toBeLessThan(1e-12)
  })

  it('the parsec is 648 000/π au', () => {
    expect(rel(math.unit(1, 'parsec').toNumber('au'), 648000 / Math.PI)).toBeLessThan(1e-12)
    expect(rel(math.unit(1, 'parsec').toNumber('m'), (648000 / Math.PI) * 149597870700)).toBeLessThan(1e-12)
  })

  it('the knot is one nautical mile an hour, 1852/3600 m/s', () => {
    expect(rel(math.unit(1, 'knot').toNumber('m/s'), 1852 / 3600)).toBeLessThan(1e-12)
  })

  it('the Mass list offers the atomic mass unit, 1.660 539 068 92×10⁻²⁷ kg (CODATA 2022)', () => {
    // Found by its value, not its name: u is also SUVAT's initial speed and the letter
    // preprocess() makes of μ (math/expr.ts), so the fix may offer it under a name that cannot
    // capture a student's letter on the shared instance.
    const worth = listOf('Mass').map((name) => {
      try {
        return { name, kg: math.unit(1, name).toNumber('kg') }
      } catch (e) {
        return { name, error: e instanceof Error ? e.message : String(e) }
      }
    })
    const amu = worth.filter((w) => w.kg !== undefined && rel(w.kg, 1.66053906892e-27) <= 1e-12).map((w) => w.name)
    const refused = worth.filter((w) => w.error).map((w) => `${w.name}: ${w.error}`)
    expect(amu, `no unit in the Mass list is worth 1.66053906892e-27 kg (${refused.join('; ')})`).not.toEqual([])
  })

  it('the calorie is 4.184 J and the kilocalorie 4184 J (thermochemical)', () => {
    expect(rel(math.unit(1, 'cal').toNumber('J'), 4.184)).toBeLessThan(1e-12)
    expect(rel(math.unit(1, 'kcal').toNumber('J'), 4184)).toBeLessThan(1e-12)
  })

  it('the Length list gains au and parsec, and no list drops a unit it offered', () => {
    expect(listOf('Length')).toEqual(expect.arrayContaining(['lightyear', 'au', 'parsec']))
    // Removing a unit is not a fix. u is left out here only because its name may change; its
    // value is checked above.
    const before = [
      ...['m', 'cm', 'mm', 'km', 'inch', 'ft', 'yard', 'mile', 'angstrom', 'lightyear', 'kg', 'g', 'mg', 'tonne', 'lb', 'oz'],
      ...['s', 'ms', 'minute', 'hour', 'day', 'year', 'm/s', 'km/h', 'mi/h', 'ft/s', 'knot', 'N', 'kN', 'dyn', 'lbf', 'kgf'],
      ...['J', 'kJ', 'cal', 'kcal', 'eV', 'kWh', 'erg', 'BTU', 'W', 'kW', 'hp', 'Pa', 'kPa', 'bar', 'atm', 'mmHg', 'psi', 'torr'],
      ...['degC', 'K', 'degF', 'deg', 'rad', 'grad', 'm^2', 'cm^2', 'km^2', 'hectare', 'acre', 'm^3', 'L', 'mL', 'cm^3', 'gallon'],
      ...['C', 'mC', 'uC', 'A', 'mA']
    ]
    expect(UNIT_PRESETS.flatMap(([, units]) => units)).toEqual(expect.arrayContaining(before))
  })

  it("keeps the calculator's AU constant at 149 597 870 700 m", () => {
    // The CONST list inserts AU_len (calcModes.tsx, ConstMode); the maths field hands it back as
    // AUlen, and constantScope() (calc/constants.ts) gives both spellings to the calculator. A
    // unit named au or AU must not change what it answers.
    expect(evaluateComp('AU_len', ctx).value).toBe(149597870700)
    expect(evaluateComp('AUlen', ctx).value).toBe(149597870700)
    const shown = evaluateInput('COMP', 'AU_len', { vars: {}, ans: 0, angle: 'deg' })
    expect(shown?.value).toBe(149597870700)
    expect(shown?.main).toBe('1.495978707×10^11')
    expect(shown?.error).toBeUndefined()
  })
})

describe('P8 — what the Units screen shows', () => {
  const listOf = (category: string): string[] => UNIT_PRESETS.find(([name]) => name === category)?.[1] ?? []
  const rel = (got: number, want: number): number => Math.abs(got / want - 1)

  it('a list answer is the number at the calculator precision, then the unit as the list shows it', () => {
    // The panel opens on Speed, 72 km/h → m/s.
    expect(convertListed(72, 'km/h', 'm/s')).toEqual({ text: '20 m/s', refused: false })
    expect(convertListed(1, 'parsec', 'lightyear').text).toBe('3.261563777 lightyear')
    // The atomic mass unit is the mathjs unit dalton, but the student reads u.
    expect(convertListed(1, 'kg', 'dalton').text).toBe('6.022140754×10^26 u')
    expect(convertListed(1, 'dalton', 'kg').text).toBe('1.660539069×10^-27 kg')
  })

  it('a list refusal is a sentence with no unit after it, never mathjs text', () => {
    // Before the fix the panel printed "Units do not match ('C' != '1 A') A".
    expect(convertListed(1, 'C', 'A')).toEqual({ text: 'C and A measure different things, so one cannot be changed into the other.', refused: true })
    expect(convertListed(1, 'ly', 'm')).toEqual({ text: `I don't know the unit "ly". For the light-year, type lightyear.`, refused: true })
    expect(convertListed(1, 'zorks', 'm').text).toBe(`I don't know the unit "zorks". Check the spelling, or pick a unit from the lists above.`)
  })

  it('the Mass list shows u for the atomic mass unit, and every other unit under its own name', () => {
    expect(listOf('Mass').map(unitLabel)).toEqual(['kg', 'g', 'mg', 'tonne', 'lb', 'oz', 'u'])
    const others = UNIT_PRESETS.flatMap(([, units]) => units).filter((u) => u !== 'dalton')
    expect(others.filter((u) => unitLabel(u) !== u)).toEqual([])
  })

  it('charge and current are two lists, and Speed stays fourth for the panel to open on', () => {
    expect(listOf('Charge')).toEqual(['C', 'mC', 'uC'])
    expect(listOf('Current')).toEqual(['A', 'mA'])
    expect(UNIT_PRESETS.map(([name]) => name)).not.toContain('Charge & current')
    expect(UNIT_PRESETS[3][0]).toBe('Speed')
    expect(UNIT_PRESETS[3][1]).toEqual(expect.arrayContaining(['km/h', 'm/s']))
  })

  it('the typed box answers with mathjs units and the calculator precision', () => {
    expect(convertTyped('5 N m to J')).toEqual({ text: '5 J', refused: false })
    expect(convertTyped('1 au to km')).toEqual({ text: '149597870.7 km', refused: false })
    expect(convertTyped('1 lightyear to km')).toEqual({ text: '9.460730473×10^12 km', refused: false })
    expect(convertTyped('2 + 3')).toEqual({ text: '5', refused: false })
    expect(convertTyped('   ')).toEqual({ text: '', refused: false })
    // mathjs's own format wrote ten figures whatever the student had chosen.
    setCalcPrecisionSource(() => ({ decimals: 4, precisionMode: 'sf' }))
    try {
      expect(convertTyped('1 mile to km').text).toBe('1.609 km')
      expect(convertListed(1, 'mile', 'km').text).toBe('1.609 km')
    } finally {
      setCalcPrecisionSource(() => ({ decimals: 10, precisionMode: 'sf' }))
    }
  })

  it('the typed box refuses in sentences, never "Undefined symbol" or "Units do not match"', () => {
    const said = (text: string) => convertTyped(text)
    expect(said('1 ly to km')).toEqual({ text: `I don't know the unit "ly". For the light-year, type lightyear.`, refused: true })
    expect(said('1 u to kg').text).toBe(`I don't know the unit "u". For the atomic mass unit, type dalton.`)
    expect(said('1 AU to km').text).toBe(`I don't know the unit "AU". For the astronomical unit, type au.`)
    expect(said('3 zorks to m').text).toBe(`I don't know the unit "zorks". Check the spelling, or pick a unit from the lists above.`)
    expect(said('5 C to A').text).toBe('Those two units measure different things, so one cannot be changed into the other.')
    expect(said('5 m + 2').text).toBe('Every number here needs its unit, for example 5 m + 20 cm.')
    expect(said('5 m to 3').text).toBe('After "to", type the unit to change into, for example 5 N m to J.')
    expect(said('km').text).toBe('Type a number with its unit, for example 5 N m to J.')
    for (const text of ['1 ly to km', '5 C to A', '5 m + 2', '5 m to 3', '5 N m to']) {
      expect(said(text).refused, text).toBe(true)
      expect(said(text).text, text).not.toMatch(/Undefined symbol|Units do not match|!=|expected:|function|char \d/)
    }
  })

  it('replaces the stale torr, mmHg, acre and electronvolt with exact values, keeping prefixes and aliases', () => {
    // mathjs 15.2.0: torr = mmHg = 133.322 Pa, acre = 4046.86 m², eV = 1.602176565e-19 J (CODATA 2010).
    expect(rel(math.unit(1, 'atm').toNumber('torr'), 760)).toBeLessThan(1e-12)
    expect(convertListed(1, 'atm', 'torr').text).toBe('760 torr')
    expect(rel(math.unit(1, 'mmHg').toNumber('Pa'), 133.322387415)).toBeLessThan(1e-12)
    expect(rel(math.unit(1, 'mmhg').toNumber('Pa'), 133.322387415)).toBeLessThan(1e-12)
    expect(rel(math.unit(1, 'acre').toNumber('hectare'), 0.40468564224)).toBeLessThan(1e-12)
    expect(rel(math.unit(1, 'acres').toNumber('m^2'), 4046.8564224)).toBeLessThan(1e-12)
    expect(rel(math.unit(1, 'eV').toNumber('J'), 1.602176634e-19)).toBeLessThan(1e-12)
    expect(rel(math.unit(1, 'MeV').toNumber('J'), 1.602176634e-13)).toBeLessThan(1e-12)
    expect(rel(math.unit(1, 'keV').toNumber('J'), 1.602176634e-16)).toBeLessThan(1e-12)
    expect(rel(math.unit(1, 'electronvolt').toNumber('J'), 1.602176634e-19)).toBeLessThan(1e-12)
    expect(rel(math.unit(1, 'megaelectronvolt').toNumber('J'), 1.602176634e-13)).toBeLessThan(1e-12)
    expect(rel(math.unit(1, 'electronvolts').toNumber('J'), 1.602176634e-19)).toBeLessThan(1e-12)
  })

  it('the units agree with the CONST list: au with AU_len, dalton with u_amu, eV with eV_J', () => {
    const constant = (id: string): number => CONSTANTS.find((c) => c.id === id)?.value ?? NaN
    expect(rel(math.unit(1, 'au').toNumber('m'), constant('AU_len'))).toBeLessThan(1e-12)
    expect(rel(math.unit(1, 'dalton').toNumber('kg'), constant('u_amu'))).toBeLessThan(1e-12)
    expect(rel(math.unit(1, 'eV').toNumber('J'), constant('eV_J'))).toBeLessThan(1e-12)
  })

  it('leaves u, pc, ly and AU free for the letters students type', () => {
    for (const name of ['u', 'pc', 'ly', 'AU']) expect(math.Unit.isValuelessUnit(name), name).toBe(false)
    // u is SUVAT's initial speed and what preprocess() makes of μ: as a unit, f = 0.3μ answered "f = 0.3".
    expect(() => math.evaluate('2u')).toThrow(/Undefined symbol u/)
    expect(() => math.evaluate(preprocess('0.3μ'))).toThrow(/Undefined symbol u/)
    const maths = evaluateInput('COMP', '2u', { vars: {}, ans: 0, angle: 'deg' })
    expect(maths?.error?.sentence).toMatch(/^I don't know what u is\./)
    expect(evaluateComp('AU_len', ctx).value).toBe(149597870700)
  })

  it('a speed worked out after a knot conversion stays in the units it was typed in', () => {
    // mathjs made a speed base for the knot and wrote every computed speed in knots after it:
    // 100 m / 9.58 s read "20.29 knot".
    expect(convertTyped('10 knot to km/h').text).toBe('18.52 km / h')
    expect(convertTyped('100 m / 9.58 s').text).toBe('10.43841336 m / s')
    expect(convertTyped('(10 km) / (2 h)').text).toBe('5 km / h')
    expect(Object.keys(math.Unit.UNIT_SYSTEMS.auto).filter((k) => /knot/i.test(k))).toEqual([])
  })

  // mathjs writes a worked-out answer in whatever unit its "auto" unit system holds for that
  // quantity, and Unit.parse resets that entry for every unit it reads. createUnit reads each name
  // it makes and each definition, so defining acre, eV, torr, mmHg, dalton and the knot once left
  // the system on acre, electronvolt, mmHg, dalton, hour and knot: 2 m * 2 m read "9.884e-4 acre",
  // 10 N * 2 m "124.8 exaelectronvolt", 10 N / (1 m^2) "0.075 mmHg", 10 N / (2 m/s^2) "3.0e+27
  // dalton" and 1 / (2 Hz) "1.4e-4 hour". The tests above parse acre, torr and eV on purpose,
  // which moves the same entries, so a case here starts from the system a new session has (mathjs
  // seeds "auto" from SI) and leaves the file's own state as it found it.
  type Systems = typeof math.Unit.UNIT_SYSTEMS
  const inNewSession = <T>(run: () => T): T => {
    const auto = math.Unit.UNIT_SYSTEMS.auto
    const kept = { ...auto }
    const put = (entries: typeof auto) => {
      for (const quantity of Object.keys(auto)) delete auto[quantity]
      Object.assign(auto, entries)
    }
    put(JSON.parse(JSON.stringify(math.Unit.UNIT_SYSTEMS.si)) as typeof auto)
    try {
      return run()
    } finally {
      put(kept)
    }
  }
  /** Every unit system as plain names, { auto: { ENERGY: 'J', … }, … }, so two can be compared whole. */
  const namesOf = (systems: Systems) =>
    Object.fromEntries(
      Object.entries(systems).map(([system, quantities]) => [
        system,
        Object.fromEntries(Object.entries(quantities).map(([quantity, e]) => [quantity, `${e.prefix.name}${(e.unit as unknown as { name: string }).name}`]))
      ])
    )
  const shown = (m: typeof math, text: string) => m.format(m.evaluate(text), 10)
  // Each answer as a bare mathjs 15.2.0 writes it: an area, two energies, a pressure, a mass, a
  // time and a speed, the quantities defineUnits() makes a unit for.
  const worked: [string, string][] = [
    ['2 m * 2 m', '4 m^2'],
    ['10 N * 2 m', '20 J'],
    ['10 N / (1 m^2)', '10 Pa'],
    ['3 W * 2 s', '6 J'],
    ['10 N / (2 m/s^2)', '5 kg'],
    ['1 / (2 Hz)', '0.5 s'],
    ['100 m / 9.58 s', '10.43841336 m / s']
  ]

  for (const [text, want] of worked) {
    it(`${text} is written ${want}, in mathjs's own unit, once the units are defined`, () => {
      inNewSession(() => {
        defineUnits()
        expect(shown(math, text)).toBe(want)
      })
    })
  }

  it("defining the units twice still leaves every answer in mathjs's own unit", () => {
    inNewSession(() => {
      defineUnits()
      defineUnits()
      for (const [text, want] of worked) expect(shown(math, text), text).toBe(want)
    })
  })

  it('the typed Units box answers a product of units in m^2 and J, not acres and exaelectronvolts', () => {
    inNewSession(() => {
      defineUnits()
      expect(convertTyped('2 m * 2 m')).toEqual({ text: '4 m^2', refused: false })
      expect(convertTyped('10 N * 2 m')).toEqual({ text: '20 J', refused: false })
    })
  })

  it('defining the units writes into no unit system', () => {
    inNewSession(() => {
      const before = namesOf(math.Unit.UNIT_SYSTEMS)
      defineUnits()
      expect(namesOf(math.Unit.UNIT_SYSTEMS)).toEqual(before)
    })
  })

  it("the app starts with the unit systems a bare mathjs has, and every answer in mathjs's own unit", async () => {
    // A second copy of math/expr.ts is a second app start: a new mathjs and its own defineUnits().
    // Two mathjs instances are built here, so the test is given 30 s for a PC that is busy.
    vi.resetModules()
    const started = await import('../src/renderer/src/math/expr')
    const bare = create(all, { number: 'number', precision: 64 })
    expect(namesOf(started.math.Unit.UNIT_SYSTEMS)).toEqual(namesOf(bare.Unit.UNIT_SYSTEMS))
    for (const [text, want] of worked) expect(shown(started.math, text), text).toBe(want)
  }, 30_000)

  it('defining the units again changes nothing (a hot reload runs math/expr.ts again)', () => {
    defineUnits()
    defineUnits()
    expect(rel(math.unit(1, 'knot').toNumber('m/s'), 1852 / 3600)).toBeLessThan(1e-12)
    expect(rel(math.unit(1, 'kcal').toNumber('J'), 4184)).toBeLessThan(1e-12)
    expect(rel(math.unit(1, 'atm').toNumber('torr'), 760)).toBeLessThan(1e-12)
    expect(Object.keys(math.Unit.BASE_UNITS).filter((k) => /knot/i.test(k))).toEqual([])
    expect(convertTyped('100 m / 9.58 s').text).toBe('10.43841336 m / s')
  })
})

describe('H9 — ∫ never hangs', () => {
  // vitest's timeout cannot stop a loop that never gives the thread back, so every integrand here
  // counts its own calls and throws once past a budget: on an engine that still hangs, that turns
  // the freeze into a failing test instead of a test run that never ends.
  const RUNAWAY = 3_000_000
  function counting(f: (x: number) => number): { f: (x: number) => number; calls: () => number } {
    let n = 0
    return {
      f: (x) => {
        if (++n > RUNAWAY) throw new Error(`RUNAWAY: still evaluating after ${RUNAWAY} calls`)
        return f(x)
      },
      calls: () => n
    }
  }
  const messageOf = (run: () => unknown): string => {
    try {
      run()
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
    return ''
  }
  /**
   * What the Maths screen shows for a thrown message. The headline is the generic one or the message
   * itself — never another sentence that sends the student to the wrong place (brackets, dividing by
   * zero) — and the words are on screen either way: errors.ts drops the small print of a message that
   * mentions "function" or "expected:".
   */
  const shown = (message: string): string => {
    const s = errorSentence(new Error(message))
    expect([message, "I can't work that out."]).toContain(s.sentence)
    return `${s.sentence} ${s.detail ?? ''}`
  }
  const onScreen = (r: ReturnType<typeof evaluateInput>): string => {
    expect(r?.error, 'a sentence, not an answer').toBeDefined()
    expect(r?.error?.sentence).toMatch(/^(I can't work that out\.|The area cannot be worked out)/)
    return `${r?.error?.sentence} ${r?.error?.detail ?? ''}`
  }
  const maths = { vars: {}, ans: 0, angle: 'deg' as const }

  it('an integrand with no value anywhere gives a sentence at once', () => {
    const c = counting(() => NaN)
    const said = messageOf(() => integrate(c.f, 0, 1))
    expect(said).toMatch(/no value at some points between the limits/)
    expect(shown(said)).toContain('no value at some points between the limits')
    expect(c.calls()).toBeLessThan(100)
  }, 3000)

  it('an integrand with no value on part of the range (√x from −1 to 1) gives the same sentence', () => {
    const c = counting(Math.sqrt)
    expect(messageOf(() => integrate(c.f, -1, 1))).toMatch(/no value at some points between the limits/)
    expect(c.calls()).toBeLessThan(100)
  }, 3000)

  it('an integrand that grows without limit (1 ÷ x across 0, ln x from 0) has its own sentence', () => {
    for (const [f, a, b] of [
      [(x: number) => 1 / x, -1, 1],
      [Math.log, 0, 1]
    ] as const) {
      const c = counting(f)
      const said = messageOf(() => integrate(c.f, a, b))
      expect(said).toMatch(/grows without limit at some point between the limits/)
      expect(shown(said)).toContain('grows without limit')
      expect(c.calls()).toBeLessThan(1000)
    }
  }, 3000)

  it('limits that are not ordinary numbers give a sentence before anything is evaluated', () => {
    for (const [a, b] of [
      [0, Infinity],
      [-Infinity, 0],
      [NaN, 1],
      [0, NaN],
      [-1e308, 1e308]
    ] as const) {
      const c = counting((x) => x)
      const said = messageOf(() => integrate(c.f, a, b))
      expect(said, `${a} to ${b}`).toMatch(/limits have to be ordinary numbers/)
      expect(shown(said)).toContain('ordinary numbers')
      expect(c.calls()).toBe(0)
    }
  }, 3000)

  it('a finite but wild integrand (sin 1/x down to 10⁻⁹) is given up on after a bounded amount of work', () => {
    const wild = counting((x) => Math.sin(1 / x))
    const t0 = performance.now()
    const said = messageOf(() => integrate(wild.f, 1e-9, 1))
    expect(said).toMatch(/too much going on between the limits/)
    expect(shown(said)).toContain('too much going on')
    // The budget is a few hundred thousand evaluations, nowhere near the 3 000 000 tripwire.
    expect(wild.calls()).toBeLessThan(1_000_000)
    expect(performance.now() - t0).toBeLessThan(2500)
    // Fast ripples over a long range are the same kind of integral.
    const ripples = counting((x) => Math.sin(1e7 * x))
    expect(messageOf(() => integrate(ripples.f, 0, 1000))).toMatch(/too much going on/)
    expect(ripples.calls()).toBeLessThan(1_000_000)
  }, 3000)

  it('integrals that take real work but have an answer still get it, and a normal integral is unchanged', () => {
    expect(integrate((x) => x * x, 0, 1)).toBeCloseTo(1 / 3, 12)
    expect(integrate(Math.sqrt, 0, 1)).toBeCloseTo(2 / 3, 12)
    expect(integrate(Math.sin, 0, Math.PI)).toBeCloseTo(2, 9)
    // A cusp at the end (a deep recursion down to the last bit) and 160 ripples (about 210 000
    // evaluations): both are inside the budget and keep their answers.
    const ripples = counting((x) => Math.sin(100 * x))
    expect(integrate(ripples.f, 0, 10)).toBeCloseTo((1 - Math.cos(1000)) / 100, 8)
  }, 3000)

  it('round-off beside the size of the integrand is 0, and a small answer on its own survives', () => {
    // These two came out as −8.9×10⁻¹⁶ and −1.4×10⁻¹⁶ on the Maths screen.
    expect(integrate(Math.cbrt, -8, 8)).toBe(0)
    expect(integrate(Math.sin, 0, 2 * Math.PI)).toBe(0)
    // The floor is relative to the integrand's own size, never absolute (1.6×10⁻¹⁹ is the electron's charge).
    expect(integrate(() => 1.6e-19, 0, 1)).toBeCloseTo(1.6e-19, 30)
    expect(integrate((x) => 1.6e-19 * x, 0, 1)).toBeCloseTo(8e-20, 30)
    // A real answer that is small beside the integrand is kept: ∫ of sin x + 10⁻⁹ over a period is 2π × 10⁻⁹.
    expect(integrate((x) => Math.sin(x) + 1e-9, 0, 2 * Math.PI)).toBeCloseTo(2 * Math.PI * 1e-9, 12)
  }, 3000)

  it('integrals typed inside one another share one budget, so a double integral cannot square the work', () => {
    // Each inner integral is affordable alone (a few thousand evaluations); the outer one asks for it
    // hundreds of times. Without a shared budget that is a million evaluations and a long freeze.
    const inner = counting((y) => Math.sin(30 * y))
    const outer = counting((x) => integrate(inner.f, 0, x))
    expect(messageOf(() => integrate(outer.f, 0, 10))).toMatch(/too much going on between the limits/)
    expect(inner.calls()).toBeLessThan(1_000_000)
    // The failed integral leaves nothing spent behind: the next one starts with the whole budget.
    expect(integrate((x) => x * x, 0, 3)).toBeCloseTo(9, 10)
    const again = counting((x) => Math.sin(100 * x))
    expect(integrate(again.f, 0, 10)).toBeCloseTo((1 - Math.cos(1000)) / 100, 8)
  }, 3000)

  it('x^(1/3) inside the integral is the real cube root, as it is on the main line', () => {
    // The cube root of a negative number is real here too, (−8)^(1/3) = −2: the area from −8 to 0 is
    // −(3/4) × 8^(4/3) = −12, and the whole odd curve from −8 to 8 cancels to 0.
    const half = evaluateInput('COMP', '\\int_{-8}^{0}x^{\\frac{1}{3}}\\,dx', maths)
    expect(half?.error).toBeUndefined()
    expect(Number(half?.value)).toBeCloseTo(-12, 8)
    const whole = evaluateInput('COMP', '\\int_{-8}^{8}x^{\\frac{1}{3}}\\,dx', maths)
    expect(whole?.error).toBeUndefined()
    expect(whole?.value).toBe(0)
    expect(whole?.main).toBe('0')
    // x^(2/3) is even: 2 × (3/5) × 8^(5/3) = 38.4
    expect(Number(evaluateInput('COMP', '\\int_{-8}^{8}x^{\\frac{2}{3}}\\,dx', maths)?.value)).toBeCloseTo(38.4, 8)
    // The same body in a slope and in a sum: the slope of the real cube root at −8 is 1/12.
    expect(Number(evaluateComp('ddx(x^(1/3), -8)', ctx).value)).toBeCloseTo(1 / 12, 6)
    const roots = [1, 2, 3, 4, 5, 6, 7, 8].reduce((s, k) => s + Math.cbrt(k), 0)
    expect(Number(evaluateComp('sigma(x^(1/3), -8, -1)', ctx).value)).toBeCloseTo(-roots, 9)
  }, 3000)

  it('typed on the Maths screen, an integrand with no value is a sentence, not a frozen app', () => {
    // √x on [−1, 1]: a root of a negative number, which has no real value.
    expect(onScreen(evaluateInput('COMP', '\\int_{-1}^{1}\\sqrt{x}\\,dx', maths))).toContain('no value at some points between the limits')
    // A with no value stored for it is the ampere to mathjs, a unit and not a number, so this froze too.
    // (Whether a stored A reaches the body is another item, H8: here only "an answer or a sentence".)
    const unit = evaluateInput('COMP', '\\int_{0}^{1}A\\cdot x\\,dx', maths)
    expect(unit?.error !== undefined || Number.isFinite(Number(unit?.value))).toBe(true)
    // 1 ÷ 0 as a limit is not a number.
    expect(onScreen(evaluateInput('COMP', '\\int_{0}^{\\frac{1}{0}}x\\,dx', maths))).toContain('ordinary numbers')
    // ln x from 0 grows without limit at the start.
    expect(onScreen(evaluateInput('COMP', '\\int_{0}^{1}\\ln\\left(x\\right)\\,dx', maths))).toContain('grows without limit')
  }, 3000)

  it('an ordinary integral typed on the Maths screen reads as before', () => {
    const r = evaluateInput('COMP', '\\int_{0}^{1}x^{2}\\,dx', maths)
    expect(r?.error).toBeUndefined()
    expect(Number(r?.value)).toBeCloseTo(1 / 3, 12)
    expect(r?.main).toBe('0.3333333333')
    expect(r?.exact).toBe('\\frac{1}{3}')
  }, 3000)
})

describe('H13 — Σ and Π never hang', () => {
  // The same trick as H9. vitest's timeout cannot stop a loop that never gives the thread back, so the
  // summand counts its own calls and throws once past a tripwire: on an engine that still hangs, that
  // turns the freeze into a failing test. The tripwire sits just above the million terms a line may
  // have; the one test that adds up a whole million (sigma(x, 1, 1000000)) has no counting in it.
  // Every test that types a line which would loop for ever starts with its counting twin, so an
  // engine that still loops fails on the twin and never reaches the real thing.
  const RUNAWAY = 1_100_000
  let calls = 0
  math.import(
    {
      h13term: (x: number): number => {
        if (++calls > RUNAWAY) throw new Error(`RUNAWAY: still going after ${RUNAWAY} terms`)
        return x
      }
    },
    { override: true }
  )
  beforeEach(() => {
    calls = 0
  })
  const messageOf = (go: () => unknown): string => {
    try {
      go()
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
    return ''
  }
  const run = (src: string) => evaluateComp(src, ctx)
  const value = (src: string): number => Number(run(src).value)
  const maths = { vars: {}, ans: 0, angle: 'deg' as const }

  const SUM_TOO_LONG = 'That sum has too many terms to add one by one — use a million terms or fewer.'
  const PRODUCT_TOO_LONG = 'That product has too many factors to multiply one by one — use a million factors or fewer.'
  const SUM_TOO_MUCH = 'That sum is too much work to add one by one — everything inside it counts, and it comes to more than a million calculations. Use fewer terms.'
  const PRODUCT_TOO_MUCH =
    'That product is too much work to multiply one by one — everything inside it counts, and it comes to more than a million calculations. Use fewer factors.'
  const SUM_BAD_LIMITS = 'That sum needs ordinary numbers for its limits — not ∞, and nothing too big to count up to.'
  const PRODUCT_BAD_LIMITS = 'That product needs ordinary numbers for its limits — not ∞, and nothing too big to count up to.'
  // The integral's own sentence (H9): a sum or product inside it that runs the budget out is its trouble too.
  const AREA_TOO_MUCH = 'The area cannot be worked out: there is too much going on between the limits. Try limits closer together, or split it into parts.'

  it('a sum of 10¹² terms is refused at once, in words — nothing is added', () => {
    expect(messageOf(() => run('sigma(h13term(x), 1, 1e12)'))).toBe(SUM_TOO_LONG)
    expect(calls, 'not one term was worked out').toBe(0)
    // The line as it was typed when it froze the app.
    expect(messageOf(() => run('sigma(x, 1, 1e12)'))).toBe(SUM_TOO_LONG)
  }, 10000)

  it('a product of 10¹² factors is refused at once, in words — nothing is multiplied', () => {
    expect(messageOf(() => run('product(h13term(x), 1, 1e12)'))).toBe(PRODUCT_TOO_LONG)
    expect(calls, 'not one factor was worked out').toBe(0)
    expect(messageOf(() => run('product(1, 1, 1e12)'))).toBe(PRODUCT_TOO_LONG)
  }, 10000)

  it('a million terms are allowed and a million and one are not, counted from the rounded limits', () => {
    expect(value('sigma(x, 1, 1000000)')).toBe(500000500000)
    expect(value('product(1, 1, 1000000)')).toBe(1)
    for (const src of ['sigma(h13term(x), 1, 1000001)', 'sigma(h13term(x), 0, 1000000)', 'sigma(h13term(x), -500000, 500000)', 'sigma(h13term(x), 0.4, 1000000.4)']) {
      calls = 0
      expect(messageOf(() => run(src)), src).toBe(SUM_TOO_LONG)
      expect(calls, `${src}: not one term was worked out`).toBe(0)
    }
  }, 20000)

  it('sums and products people really type are unchanged: the same numbers, added in the same order', () => {
    expect(value('sigma(x, 1, 100)')).toBe(5050)
    expect(value('product(x, 1, 5)')).toBe(120)
    expect(value('sigma(x^2, 1, 10)')).toBe(385)
    expect(value('product(x, 1, 10)')).toBe(3628800)
    // k = a, a + 1, … b, so this is the very double a plain loop gives.
    let basel = 0
    for (let k = 1; k <= 100000; k++) basel += 1 / (k * k)
    expect(value('sigma(1/x^2, 1, 100000)')).toBe(basel)
    // Limits that are not whole numbers are rounded, as they always were; an empty range adds nothing.
    expect(value('sigma(x, 1, 10.4)')).toBe(55)
    expect(value('sigma(x, 1, 10.5)')).toBe(66)
    expect(value('sigma(x, 0.6, 3)')).toBe(6)
    expect(value('product(x, 1, 4.6)')).toBe(120)
    expect(value('sigma(x, 5, 1)')).toBe(0)
    expect(value('product(x, 5, 1)')).toBe(1)
    expect(value('sigma(x, -3, 3)')).toBe(0)
    // The summand sees a, a + 1, … b and nothing else.
    expect(value('sigma(h13term(x), 1, 3)')).toBe(6)
    expect(calls).toBe(3)
    // Typed on the Maths screen.
    expect(evaluateInput('COMP', '\\sum_{x=1}^{100}x', maths)?.main).toBe('5050')
    expect(evaluateInput('COMP', '\\prod_{x=1}^{5}x', maths)?.main).toBe('120')
  }, 10000)

  it('a limit that is not an ordinary number is refused in words, before anything is worked out', () => {
    // ∞, 1 ÷ 0 and ln 0, a number with no value, a unit and a root of −1 are not numbers to count with.
    // (Σ of NaN, of a unit or of √−1 used to answer 0, with nothing to say a limit was wrong.)
    for (const limit of ['Infinity', '-Infinity', '1/0', 'ln(0)', 'NaN', '2 cm', 'sqrt(-1)']) {
      for (const [name, sentence] of [
        ['sigma', SUM_BAD_LIMITS],
        ['product', PRODUCT_BAD_LIMITS]
      ] as const) {
        for (const src of [`${name}(h13term(x), 1, ${limit})`, `${name}(h13term(x), ${limit}, 5)`]) {
          calls = 0
          expect(messageOf(() => run(src)), src).toBe(sentence)
          expect(calls, `${src}: not one term was worked out`).toBe(0)
        }
      }
    }
  }, 20000)

  it('a limit past 9×10¹⁵ is refused too: there one more than k is k again, so a count from it never moves', () => {
    // k + 1 = k at 10¹⁷, so `for k = 10¹⁷ to 10¹⁷` went round for ever although it is one term.
    expect(messageOf(() => run('sigma(h13term(x), 1e17, 1e17)'))).toBe(SUM_BAD_LIMITS)
    expect(messageOf(() => run('product(h13term(x), -1e17, -1e17)'))).toBe(PRODUCT_BAD_LIMITS)
    expect(calls, 'not one term was worked out').toBe(0)
    // With a million terms or more between the limits it is the number of terms that is the trouble.
    expect(messageOf(() => run('sigma(h13term(x), 1, 1e17)'))).toBe(SUM_TOO_LONG)
    expect(messageOf(() => run('product(h13term(x), 1e17, 1e18)'))).toBe(PRODUCT_TOO_LONG)
    expect(calls).toBe(0)
    // Whole numbers a person counts with are untouched, however far from 0: 10¹⁵ is nowhere near 2⁵³.
    expect(value('sigma(x, 1e15, 1e15 + 2)')).toBe(3e15 + 3)
  }, 10000)

  it('a sum or product inside an integral spends the integral’s budget, so it cannot slip past it', () => {
    // One that is bigger than the whole budget (300 000) all by itself …
    expect(messageOf(() => run('integral(sigma(h13term(x), 1, 400000), 0, 1)'))).toBe(AREA_TOO_MUCH)
    expect(calls, 'refused before a term was worked out').toBe(0)
    expect(messageOf(() => run('integral(product(h13term(1), 1, 400000), 0, 1)'))).toBe(AREA_TOO_MUCH)
    expect(calls).toBe(0)
    // … and one small enough for the budget once but not for the dozens of times the integral asks for it:
    // 100 000 terms at each evaluation of the integrand, and the integral needs about eighty evaluations.
    calls = 0
    expect(messageOf(() => run('integral(sigma(h13term(x), 1, 100000), 0, 1)'))).toBe(AREA_TOO_MUCH)
    expect(calls, 'the terms worked out stay inside the budget').toBeLessThanOrEqual(300_000)
    // A short one still has its answer.
    expect(value('integral(sigma(x, 1, 100), 0, 1)')).toBeCloseTo(5050, 9)
    expect(value('integral(product(x, 1, 5), 0, 2)')).toBeCloseTo(240, 9)
  }, 20000)

  it('sums and products typed inside each other, or around an integral, share one budget of a million', () => {
    // 2 terms, the first of which is a sum of a million terms: a million and two in all.
    expect(messageOf(() => run('sigma(sigma(h13term(x), 1, 1000000), 1, 2)'))).toBe(SUM_TOO_MUCH)
    expect(calls).toBe(0)
    expect(messageOf(() => run('product(sigma(h13term(1), 1, 1000000), 1, 2)'))).toBe(PRODUCT_TOO_MUCH)
    expect(calls).toBe(0)
    // A million integrals cannot be afforded, however cheap each is: the sum spends its budget first.
    expect(messageOf(() => run('sigma(integral(h13term(x), 0, 1), 1, 1000000)'))).toBe(SUM_TOO_MUCH)
    expect(calls).toBe(0)
    // One inner sum bigger than the whole budget says so about itself.
    expect(messageOf(() => run('sigma(sigma(h13term(x), 1, 2000000), 1, 2)'))).toBe(SUM_TOO_LONG)
    expect(calls).toBe(0)
    // The ones that fit keep their answers: 4 × (1 + 2 + 3), and three integrals of x from 0 to 1.
    expect(value('sigma(sigma(x, 1, 3), 1, 4)')).toBe(24)
    expect(value('sigma(integral(x, 0, 1), 1, 3)')).toBeCloseTo(1.5, 9)
  }, 20000)

  it('a refused line leaves nothing spent behind: the next line has its whole budget', () => {
    expect(messageOf(() => run('integral(sigma(h13term(x), 1, 100000), 0, 1)'))).toBe(AREA_TOO_MUCH)
    expect(messageOf(() => run('sigma(sigma(h13term(x), 1, 1000000), 1, 2)'))).toBe(SUM_TOO_MUCH)
    expect(value('integral(x^2, 0, 3)')).toBeCloseTo(9, 9)
    expect(value('sigma(x, 1, 100)')).toBe(5050)
    // A sum that spent its whole million does not shrink the next integral's 300 000: this one (160
    // ripples) takes about 210 000 evaluations, as in H9, and still has its answer.
    expect(value('sigma(x, 1, 1000000)')).toBe(500000500000)
    expect(integrate((x) => Math.sin(100 * x), 0, 10)).toBeCloseTo((1 - Math.cos(1000)) / 100, 8)
  }, 20000)

  it('each sentence is the headline on the Maths screen, in plain words', () => {
    for (const sentence of [SUM_TOO_LONG, PRODUCT_TOO_LONG, SUM_TOO_MUCH, PRODUCT_TOO_MUCH, SUM_BAD_LIMITS, PRODUCT_BAD_LIMITS, AREA_TOO_MUCH]) {
      // The headline itself, not "I can't work that out." with the sentence as small print.
      expect(errorSentence(new Error(sentence)), sentence).toEqual({ sentence })
      expect(sentence, 'no programming syntax in a student sentence').not.toMatch(/[()*^_{}\\]|sigma|product\(/)
    }
    // The twins first: these are the lines that used to freeze the app.
    expect(messageOf(() => run('sigma(h13term(x), 1, 1e12)'))).toBe(SUM_TOO_LONG)
    expect(messageOf(() => run('product(h13term(x), 1, 1e12)'))).toBe(PRODUCT_TOO_LONG)
    expect(messageOf(() => run('sigma(h13term(x), 1, Infinity)'))).toBe(SUM_BAD_LIMITS)
    expect(messageOf(() => run('sigma(integral(h13term(x), 0, 1), 1, 1000000)'))).toBe(SUM_TOO_MUCH)
    const sentenceOf = (mode: 'COMP' | 'CMPLX', tex: string): string | undefined => {
      const r = evaluateInput(mode, tex, maths)
      expect(r?.value, tex).toBeUndefined()
      return r?.error?.sentence
    }
    expect(sentenceOf('COMP', '\\sum_{x=1}^{1000000000000}x')).toBe(SUM_TOO_LONG)
    expect(sentenceOf('COMP', '\\sum_{x=1}^{10^{12}}x')).toBe(SUM_TOO_LONG)
    expect(sentenceOf('COMP', '\\prod_{x=1}^{1000000000000}x')).toBe(PRODUCT_TOO_LONG)
    expect(sentenceOf('CMPLX', '\\sum_{x=1}^{1000000000000}x')).toBe(SUM_TOO_LONG)
    // ∞ is on the keypad, and a series is what a student reaches for first.
    expect(sentenceOf('COMP', '\\sum_{x=1}^{\\infty}\\frac{1}{x^{2}}')).toBe(SUM_BAD_LIMITS)
    expect(sentenceOf('COMP', '\\prod_{x=1}^{\\infty}x')).toBe(PRODUCT_BAD_LIMITS)
    // A million integrals, one for each term of the sum: more than one line can work out.
    expect(sentenceOf('COMP', '\\sum_{x=1}^{1000000}\\int_{0}^{1}x\\,dx')).toBe(SUM_TOO_MUCH)
  }, 20000)
})

describe('P6 — Measure mode rounds the way it is written', () => {
  // The significant-figures card rounded the binary double behind the number the student sees:
  // 25.37 ÷ 20 is stored just under 1.2685, so it read 1.268 at 4 s.f. and 2.675 read 2.67. A
  // calculator rounds the digits it shows, half away from zero (docs/knowledge/numbers.md).
  it('rounds a halfway value up, as the student’s own calculator does', () => {
    expect(roundSig(25.37 / 20, 4)).toBe('1.269')
    expect(roundSig(1.2685, 4)).toBe('1.269')
    expect(roundSig(2.675, 3)).toBe('2.68')
    expect(roundSig(0.0012345, 4)).toBe('0.001235')
    expect(roundSig(1.005, 3)).toBe('1.01')
    // The carry moves the first figure, not the number of figures: 9.9995 is 10.00, four of them.
    expect(roundSig(9.9995, 4)).toBe('10.00')
  })

  it('a halfway value is rounded away from zero when it is negative, with the minus the app writes', () => {
    expect(roundSig(-2.675, 3)).toBe('−2.68')
    expect(roundSig(-1.2685, 4)).toBe('−1.269')
  })

  it('keeps the zeros that are significant figures', () => {
    expect(roundSig(1.2, 4)).toBe('1.200')
    expect(roundSig(2.5, 3)).toBe('2.50')
    expect(roundSig(0.00456, 5)).toBe('0.0045600')
    expect(roundSig(123456, 3)).toBe('123000')
    expect(roundSig(0, 3)).toBe('0')
  })

  it('reads the same in the bar, in the card and in the Calculator’s own writer', () => {
    // typed line → value (the bar and the Calculator) → text (the card): one number, one reading.
    const ans = Number(evaluateComp('25.37÷20', ctx).value)
    expect(roundSig(ans, 4)).toBe('1.269')
    expect(roundSig(ans, 4)).toBe(calcNum(ans, { decimals: 4, precisionMode: 'sf' }))
    expect(roundSig(2.675, 3)).toBe(calcNum(2.675, { decimals: 3, precisionMode: 'sf' }))
  })

  it('writes a very large or very small number with a real power of ten, never e-notation or a caret', () => {
    expect(roundSig(6.02214076e23, 4)).toBe('6.022\u00a0×\u00a010²³')
    // The charge on an electron is not drag noise: it must not read 0, and its zero is a figure.
    expect(roundSig(1.602176634e-19, 3)).toBe('1.60\u00a0×\u00a010⁻¹⁹')
    expect(roundSig(-7.25e12, 2)).toBe('−7.3\u00a0×\u00a010¹²')
    // 999 999 999.9 is under 10⁹ but rounds up to it, and is written as the rounded number is.
    expect(roundSig(999999999.9, 3)).toBe('1.00\u00a0×\u00a010⁹')
    for (const [v, n] of [[123456789012, 3], [6.02214076e23, 4], [1.602176634e-19, 3], [4.5e-9, 2], [-7.25e12, 2]] as const) {
      expect(roundSig(v, n), `${v} at ${n} s.f.`).toMatch(/^−?\d(\.\d+)?\u00a0×\u00a010[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+$/)
    }
  })

  it('never writes JavaScript’s words for a value that is not a number', () => {
    expect(roundSig(NaN, 3)).not.toMatch(/NaN|Infinity/)
    expect(roundSig(Infinity, 3)).not.toMatch(/NaN|Infinity/)
    expect(roundSig(-Infinity, 3)).not.toMatch(/NaN|Infinity/)
  })

  // "Scientific notation" line of the same card: the typed number's own figures, in a real power.
  it('writes the scientific notation of a typed number with its own figures and a real power of ten', () => {
    const card = (typed: string, value: number): string => sciNotation(value, countSigFigs(typed).count)
    expect(card('0.004560', 0.00456)).toBe('4.560\u00a0×\u00a010⁻³')
    expect(card('0.00450', 0.0045)).toBe('4.50\u00a0×\u00a010⁻³')
    expect(card('1200', 1200)).toBe('1.2\u00a0×\u00a010³')
    expect(card('1200.', 1200)).toBe('1.200\u00a0×\u00a010³')
    expect(card('3.20×10^4', 32000)).toBe('3.20\u00a0×\u00a010⁴')
    expect(card('1.2685', 1.2685)).toBe('1.2685\u00a0×\u00a010⁰')
    expect(card('-0.0012685', -0.0012685)).toBe('−1.2685\u00a0×\u00a010⁻³')
    // 3.20×10^4 was written "3.20 × 10^+4": a caret and a plus no student writes.
    expect(card('3.20×10^4', 32000)).not.toMatch(/[\^+]/)
  })

  it('rounds the scientific form half away from zero, and a carry moves the power', () => {
    expect(sciNotation(1.2685, 4)).toBe('1.269\u00a0×\u00a010⁰')
    expect(sciNotation(-0.0012685, 4)).toBe('−1.269\u00a0×\u00a010⁻³')
    expect(sciNotation(9.9995, 4)).toBe('1.000\u00a0×\u00a010¹')
    expect(sciNotation(6.02214076e23, 4)).toBe('6.022\u00a0×\u00a010²³')
  })

  it('stops at the 15 figures a number holds, and writes 0 as 0', () => {
    // 19 typed digits, of which only the first 15 are real: toExponential printed the double's noise.
    const typed = '0.1234567890123456789'
    expect(countSigFigs(typed).count).toBe(19)
    expect(sciNotation(Number(typed), countSigFigs(typed).count)).toBe('1.23456789012346\u00a0×\u00a010⁻¹')
    expect(sciNotation(0, 3)).toBe('0')
    expect(sciNotation(NaN, 3)).not.toMatch(/NaN|Infinity/)
  })
})

describe('H8 — ∫, d/dx, Σ and Π see stored letters and Ans', () => {
  // The body of an integral, a slope, a sum or a product is worked out in a copy of the line's own scope.
  // mathjs hands such a function that scope wrapped (a PartitionedMap, which is not a Map), and the copy took
  // the wrapper's own fields (a, b, bKeys) instead of the letters inside it: Ans, every stored letter and every
  // constant was out of sight in there. ∫(Ans·x) said "Undefined symbol Ans", d/dx(A·x²) read A as the ampere
  // and had no value, and a limit that was a stored letter, or the outer Σ's index, was an "Undefined symbol".
  // Each case goes both ways a line arrives: the field's LaTeX through the Maths screen's own function, and the
  // plain line the engine reads.
  const at = (vars: Record<string, unknown>, ans: unknown) => ({ vars, ans, angle: 'deg' as const })
  const field = (tex: string, vars: Record<string, unknown> = {}, ans: unknown = 0): number => {
    const r = evaluateInput('COMP', tex, at(vars, ans))
    expect(r?.error?.sentence, `${tex} should have an answer`).toBeUndefined()
    return Number(r?.value)
  }
  const line = (src: string, vars: Record<string, unknown> = {}, ans: unknown = 0): number => Number(evaluateComp(src, at(vars, ans)).value)

  it('Ans reaches the body of an integral, a slope, a sum and a product', () => {
    expect(field('\\int_{0}^{1}\\operatorname{Ans}\\cdot x\\,dx', {}, 4)).toBeCloseTo(2, 9)
    expect(line('integral(Ans*x, 0, 1)', {}, 4)).toBeCloseTo(2, 9)
    expect(line('ddx(Ans*x^2, 3)', {}, 4)).toBeCloseTo(24, 8)
    expect(line('sigma(Ans*x, 1, 3)', {}, 4)).toBe(24)
    expect(line('product(Ans, 1, 3)', {}, 4)).toBe(64)
  })

  it('a stored letter reaches the body of a slope, a sum, a product and an integral', () => {
    expect(field('\\operatorname{ddx}\\left(A\\cdot x^{2},3\\right)', { A: 2 })).toBeCloseTo(12, 8)
    expect(line('ddx(A*x^2, 3)', { A: 2 })).toBeCloseTo(12, 8)
    expect(field('\\sum_{x=1}^{3}A\\cdot x', { A: 2 })).toBe(12)
    expect(line('sigma(A*x, 1, 3)', { A: 2 })).toBe(12)
    expect(field('\\prod_{x=1}^{3}B', { B: 2 })).toBe(8)
    expect(line('product(B, 1, 3)', { B: 2 })).toBe(8)
    expect(field('\\int_{0}^{1}A\\cdot x\\,dx', { A: 6 })).toBeCloseTo(3, 9)
    expect(line('integral(A*x, 0, 1)', { A: 6 })).toBeCloseTo(3, 9)
  })

  it('every letter the Maths screen stores is seen in a body: A to F, M and y', () => {
    // E is Euler's number to mathjs, and A, C and F are units; a value stored under the letter wins over them.
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F', 'M', 'y']) {
      expect(line(`sigma(${letter}*x, 1, 3)`, { [letter]: 3 }), letter).toBe(18)
      expect(line(`integral(${letter}*x, 0, 2)`, { [letter]: 3 }), letter).toBeCloseTo(6, 9)
    }
  })

  it('nested sums and products read the outer index in their limits', () => {
    // 1 + 3 + 6 + … + 55: the first ten triangle numbers added up.
    expect(field('\\sum_{k=1}^{10}\\sum_{j=1}^{k}j')).toBe(220)
    expect(line('sigma(sigma(x, 1, x), 1, 10)')).toBe(220)
    // 1 × 3 × 6 × 10
    expect(field('\\prod_{k=1}^{4}\\sum_{j=1}^{k}j')).toBe(180)
    // An integral from 0 to the index, added for 1, 2, 3: ½ + 2 + 4½.
    expect(line('sigma(integral(x, 0, x), 1, 3)')).toBeCloseTo(7, 8)
    // An integral inside an integral: the inner one's upper limit is the outer one's x, ∫₀² ½x² dx.
    expect(line('integral(integral(x, 0, x), 0, 2)')).toBeCloseTo(4 / 3, 8)
  })

  it('the body’s own variable still shadows a stored x, while a limit and a point read the line’s own', () => {
    const x5 = { x: 5 }
    expect(line('integral(x, 0, 1)', x5)).toBeCloseTo(0.5, 9)
    expect(field('\\int_{0}^{1}x\\,dx', x5)).toBeCloseTo(0.5, 9)
    expect(line('ddx(x^2, 3)', x5)).toBeCloseTo(6, 8)
    expect(line('sigma(x, 1, 3)', x5)).toBe(6)
    expect(field('\\sum_{x=1}^{3}x', x5)).toBe(6)
    expect(line('product(x, 1, 4)', x5)).toBe(24)
    // The limits and the point are the line's own, where the stored x is the number 5: ∫₀⁵ x dx, and the slope of x² there.
    expect(line('integral(x, 0, x)', x5)).toBeCloseTo(12.5, 9)
    expect(line('ddx(x^2, x)', x5)).toBeCloseTo(10, 8)
    // … and any stored letter does as a limit or a point.
    expect(line('sigma(x, 1, M)', { M: 4 })).toBe(10)
    expect(field('\\int_{0}^{M}x^{2}\\,dx', { M: 3 })).toBeCloseTo(9, 9)
    expect(line('ddx(x^2, M)', { M: 4 })).toBeCloseTo(8, 8)
  })

  it('a constant from the list reaches a body, under either spelling', () => {
    const g = 9.80665 / 2
    expect(line('integral(gn*x, 0, 1)')).toBeCloseTo(g, 9)
    expect(line('integral(g_n*x, 0, 1)')).toBeCloseTo(g, 9)
    // The list inserts g_n; the field writes it as a subscript and latexToMath hands back gn.
    expect(field('\\int_{0}^{1}g_{n}\\cdot x\\,dx')).toBeCloseTo(g, 9)
    expect(line('sigma(c0, 1, 2)')).toBe(2 * 299792458)
    expect(line('sigma(c_0, 1, 2)')).toBe(2 * 299792458)
    // A tiny constant keeps all its figures through the slope: d/dx(ħx²) at 3 is 6ħ.
    expect(line('ddx(hbar*x^2, 3)') / (6 * 1.054571817e-34)).toBeCloseTo(1, 9)
  })

  it('a function the calculator keeps in scope, arg, is the same inside a body as outside it', () => {
    // arg answers in the angle mode, 45° for 1 + i in degrees; mathjs's own is in radians, which is what a body got
    // when it could not see the one in scope.
    expect(line('arg(1 + i)')).toBeCloseTo(45, 9)
    expect(line('sigma(arg(1 + i), 1, 1)')).toBeCloseTo(45, 9)
    expect(line('integral(arg(1 + i), 0, 1)')).toBeCloseTo(45, 9)
  })

  it('whatever the scope the line is worked out in: an object, a Map, and one body inside another', () => {
    // The app hands an object; mathjs wraps an object or a Map alike in a PartitionedMap for these functions.
    expect(math.evaluate('integral(A*x, 0, 1)', { A: 6 })).toBeCloseTo(3, 9)
    expect(math.evaluate('integral(A*x, 0, 1)', new Map([['A', 6]]))).toBeCloseTo(3, 9)
    // ∫₀ˣ 6t dt = 3x², and 3 × (1 + 4 + 9) added up for x = 1, 2, 3.
    expect(math.evaluate('sigma(integral(A*x, 0, x), 1, 3)', new Map([['A', 6]]))).toBeCloseTo(42, 8)
    expect(math.evaluate('sigma(sigma(A*x, 1, x), 1, 4)', { A: 2 })).toBe(40)
  })

  it('only the entries a body, a limit or a point names are read, so a sum inside a sum never walks the whole scope again at every term', () => {
    // 200 values nobody names, each counting its own reading. Copying the whole scope for every term of the
    // outer sum is 200 × 2 × 2000 readings; the tripwire turns that into a quick failure, as in H9 and H13.
    let reads = 0
    const scope: Record<string, unknown> = { A: 2 }
    for (let i = 0; i < 200; i++) {
      Object.defineProperty(scope, `v${i}`, {
        enumerable: true,
        get: () => {
          if (++reads > 10_000) throw new Error('RUNAWAY: the whole scope is read again at every term')
          return i
        }
      })
    }
    expect(math.evaluate('sigma(sigma(A, 1, 1), 1, 2000)', scope)).toBe(4000)
    expect(math.evaluate('sigma(sigma(A*x, 1, x), 1, 200)', scope)).toBe(2 * 1353400)
    expect(reads).toBe(0)
    // A name that is in the line is read, and read once for the whole call.
    expect(math.evaluate('integral(v7*x, 0, 1)', scope)).toBeCloseTo(3.5, 9)
    expect(reads).toBe(1)
  })

  it('the wrapper’s own fields are not letters in a body: a and bKeys are undefined there, as they are outside', () => {
    // The copy used to carry mathjs's a, b and bKeys into every body as stray objects.
    expect(() => line('sigma(a*x, 1, 3)')).toThrow('Undefined symbol a')
    expect(() => line('integral(bKeys*x, 0, 1)')).toThrow('Undefined symbol bKeys')
    expect(() => line('a')).toThrow('Undefined symbol a')
  })

  it('the line’s one budget (H13) still counts a sum whose inner limit is the outer index, which could not be typed before', () => {
    // 100 rows of 1, 1 + 2, 1 + 2 + 3, …: 100 × 101 × 102 ÷ 6.
    expect(line('sigma(sigma(x, 1, x), 1, 100)')).toBe(171700)
    // A million rows: the outer sum spends its million before the first term, so the first inner sum has nothing left
    // and the line says so at once, in its own words, instead of trying a million inner sums.
    expect(() => line('sigma(sigma(x, 1, x), 1, 1000000)')).toThrow(/^That sum is too much work/)
    expect(() => line('product(sigma(x, 1, x), 1, 1000000)')).toThrow(/^That product is too much work/)
    expect(() => line('sigma(integral(x, 0, x), 1, 1000000)')).toThrow(/^That sum is too much work/)
    // A refused line leaves nothing spent: the next one has its whole budget.
    expect(line('sigma(sigma(x, 1, x), 1, 10)')).toBe(220)
  })

  it('a call with an argument missing is refused as it always was, in the plain sentence, never answered', () => {
    // sigma(x, 1) has no upper limit, so there is no node to read names from. Reading names must not be what fails
    // first, or crash differently, or let the call through with a number.
    for (const src of ['sigma(x)', 'sigma(x, 1)', 'product(x, 1)', 'integral(x)', 'integral(x, 0)', 'ddx(x)']) {
      let thrown: unknown
      try {
        line(src)
      } catch (e) {
        thrown = e
      }
      expect(thrown, `${src} has no answer`).toBeInstanceOf(Error)
      expect(errorSentence(thrown).sentence, src).toBe("I can't work that out.")
    }
  })
})

describe('B2b — distributions at the edges, solve budget, letter = value, angle mode restored', () => {
  // ---- H2 ---------------------------------------------------------------------------------------------------------
  // The factorial form takes log p and log (1 − p), and 0 × log 0 is not a number: a coin that always lands tails
  // has 0 heads with probability 1, and the formula answered NaN for exactly that, and for every sum that passes it.
  const lnFact = (n: number): number => Number(math.lgamma(n + 1))
  // The formulas as they were, for the values in between: those must not move by a single bit.
  const binomialAsItWas = (x: number, N: number, p: number): number =>
    x < 0 || x > N || !Number.isInteger(x) ? 0 : Math.exp(lnFact(N) - lnFact(x) - lnFact(N - x) + x * Math.log(p) + (N - x) * Math.log(1 - p))
  const poissonAsItWas = (x: number, lambda: number): number => (x < 0 || !Number.isInteger(x) ? 0 : Math.exp(x * Math.log(lambda) - lambda - lnFact(x)))

  it('H2: Binomial with p = 0 has every bit of its mass on 0, and p = 1 on N — no NaN, and the sums are right', () => {
    const row = (p: number, N: number): number[] => Array.from({ length: N + 5 }, (_, i) => binomialPd(i - 2, N, p))
    // N = 10, p = 0: ten tries that never succeed.
    expect(binomialPd(0, 10, 0)).toBe(1)
    for (let x = 1; x <= 10; x++) expect(binomialPd(x, 10, 0), `P(X = ${x})`).toBe(0)
    // p = 1: ten tries that always succeed.
    expect(binomialPd(10, 10, 1)).toBe(1)
    for (let x = 0; x <= 9; x++) expect(binomialPd(x, 10, 1), `P(X = ${x})`).toBe(0)
    // Outside the values it can take, and between them, it is 0 as it always was.
    for (const p of [0, 1]) for (const x of [-1, 11, 2.5]) expect(binomialPd(x, 10, p), `p = ${p}, x = ${x}`).toBe(0)
    // The whole row is numbers, and adds up to 1.
    for (const p of [0, 1]) {
      const r = row(p, 10)
      expect(r.every(Number.isFinite), `p = ${p}`).toBe(true)
      expect(r.reduce((a, b) => a + b, 0)).toBe(1)
    }
    // P(X ≤ x): 1 from 0 on when nothing ever succeeds; 0 below N and 1 at N when everything does.
    for (let x = 0; x <= 10; x++) expect(binomialCd(x, 10, 0), `P(X ≤ ${x}), p = 0`).toBe(1)
    expect(binomialCd(-1, 10, 0)).toBe(0)
    for (let x = 0; x <= 9; x++) expect(binomialCd(x, 10, 1), `P(X ≤ ${x}), p = 1`).toBe(0)
    expect(binomialCd(10, 10, 1)).toBe(1)
    expect(binomialCd(9.9, 10, 1)).toBe(0)
    expect(binomialCd(25, 10, 1)).toBe(1)
    // N = 0 has one value, 0, whatever p is.
    expect(binomialPd(0, 0, 0)).toBe(1)
    expect(binomialPd(0, 0, 1)).toBe(1)
  })

  it('H2: Poisson with λ = 0 has all its mass on 0, and its sum is 1 from there on', () => {
    expect(poissonPd(0, 0)).toBe(1)
    for (let x = 1; x <= 6; x++) expect(poissonPd(x, 0), `P(X = ${x})`).toBe(0)
    expect(poissonPd(-1, 0)).toBe(0)
    expect(poissonPd(1.5, 0)).toBe(0)
    expect(poissonCd(0, 0)).toBe(1)
    expect(poissonCd(7, 0)).toBe(1)
    expect(poissonCd(-1, 0)).toBe(0)
  })

  it('H2: the values in between are the very numbers they were', () => {
    // Known values first: Binomial(10, 0.3) and Poisson(3).
    expect(binomialPd(3, 10, 0.3)).toBeCloseTo(0.266827932, 9)
    expect(binomialCd(3, 10, 0.3)).toBeCloseTo(0.6496107184, 9)
    expect(poissonPd(2, 3)).toBeCloseTo(0.2240418077, 9)
    expect(poissonCd(2, 3)).toBeCloseTo(0.4231900811, 9)
    // Then bit for bit against the formula as it was, so a rewrite that reordered the sum would be seen.
    for (const N of [1, 10, 50]) {
      for (const p of [0.05, 0.3, 0.5, 0.9999]) {
        for (let x = -1; x <= N + 1; x++) expect(binomialPd(x, N, p), `binomial x = ${x}, N = ${N}, p = ${p}`).toBe(binomialAsItWas(x, N, p))
      }
    }
    for (const lambda of [0.1, 1, 3.5, 40]) {
      for (let x = -1; x <= 60; x++) expect(poissonPd(x, lambda), `poisson x = ${x}, λ = ${lambda}`).toBe(poissonAsItWas(x, lambda))
    }
    // A probability that is not one is still not a number, as it was: nothing here invents an answer for it.
    expect(binomialPd(1, 10, -0.5)).toBeNaN()
    expect(binomialPd(1, 10, 1.5)).toBeNaN()
    expect(poissonPd(1, -2)).toBeNaN()
  })

  // ---- H14 --------------------------------------------------------------------------------------------------------
  // Counted in terms like H13, with the same tripwire: x = ? that never gives the thread back would otherwise freeze the
  // test run for minutes, so the summand counts its own calls and throws once past a little over the budget.
  const RUNAWAY = 1_100_000
  let terms = 0
  math.import(
    {
      b2bterm: (x: number): number => {
        if (++terms > RUNAWAY) throw new Error(`RUNAWAY: still going after ${RUNAWAY} terms`)
        return x
      }
    },
    { override: true }
  )
  beforeEach(() => {
    terms = 0
  })
  const messageOf = (go: () => unknown): string => {
    try {
      go()
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
    return ''
  }
  const maths = { vars: {}, ans: 0, angle: 'deg' as const }

  it('H14: x = ? spends ONE budget for the whole search, not a fresh one at every try', () => {
    // The twin first, as in H13: a hundred thousand terms a try, and the search tries thousands of values of x.
    // A budget of a million at every try let all of them through — 4 × 10⁸ terms, minutes with the screen frozen.
    expect(messageOf(() => evaluateComp('sigma(b2bterm(x), 1, 100000) = 5', ctx))).toMatch(/^That sum is too much work to add one by one/)
    expect(terms, 'every term worked out was paid for from the one budget').toBeLessThanOrEqual(1_000_000)
    expect(terms, 'the first tries were really worked out').toBeGreaterThan(100_000)
    // A product is the same, in its own words. (0*x keeps x in the line, so it is an equation in x; it has no root.)
    terms = 0
    expect(messageOf(() => evaluateComp('product(b2bterm(1), 1, 100000) + 0*x = 5', ctx))).toMatch(/^That product is too much work to multiply one by one/)
    expect(terms).toBeLessThanOrEqual(1_000_000)
    expect(terms).toBeGreaterThan(100_000)
    // The line as it was typed when it froze the app, on the Maths screen: its x is only the sum's index, so it is a
    // statement (P-FIX-BROWSER F1), worked out once — false, with nothing to keep — instead of a search for x.
    const r = evaluateInput('COMP', 'sigma(x,1,100000)=5', maths)
    expect(r?.main).toBe('false')
    expect(r?.value).toBeUndefined()
    expect(r?.solved).toBe(false)
  }, 20000)

  it('H14: an integral in the equation has the integral’s budget for the whole search, in the integral’s words', () => {
    // An equation with no real root whose every try is a cheap integral: the search used to go through 930 000
    // evaluations of the integrand before it said "No solution". It has the 300 000 a typed line has.
    expect(messageOf(() => evaluateComp('integral(b2bterm(x)^2, 0, x)^2 = -1', ctx))).toBe(
      'The area cannot be worked out: there is too much going on between the limits. Try limits closer together, or split it into parts.'
    )
    expect(terms).toBeLessThanOrEqual(300_000)
    expect(terms).toBeGreaterThan(0)
  }, 20000)

  it('H14: solves that fit the budget have their answers, and the budget starts again for the next line', () => {
    const value = (src: string, vars: Record<string, unknown> = {}): number => Number(evaluateComp(src, { ...ctx, vars }).value)
    // A root found with a sum, a product, an integral and a derivative in the line.
    expect(value('x + sigma(x, 1, 100) = 5100')).toBeCloseTo(50, 9)
    expect(value('integral(x^2, 0, x) = 9')).toBeCloseTo(3, 7)
    expect(value('ddx(x^3, x) = 12', { x: 1 })).toBeCloseTo(2, 5)
    expect(value('x^2 = 2', { x: 1 })).toBeCloseTo(Math.SQRT2, 9)
    // No root, searched within the budget (about 400 000 terms in all): "No solution", as before — not "too much work".
    expect(messageOf(() => evaluateComp('sigma(1/x^2, 1, 100) = 2', ctx))).toBe('No solution found')
    // The sums inside the search have the same numbers they always had.
    expect(evaluateInput('COMP', 'x+sigma(x,1,100)=5100', maths)?.main).toBe('x = 50')
    // A search that ran out of budget, or found its root, leaves nothing spent and nothing open behind it. (The counting
    // twin again: on an engine that still starts a budget at every try, this line is minutes, not a failing test.)
    expect(messageOf(() => evaluateComp('sigma(b2bterm(x), 1, 100000) = 5', ctx))).toMatch(/^That sum is too much work/)
    expect(value('sigma(x, 1, 1000000)')).toBe(500000500000)
    expect(value('integral(x^2, 0, 3)')).toBeCloseTo(9, 9)
    expect(value('x + sigma(x, 1, 100) = 5100')).toBeCloseTo(50, 9)
  }, 30000)

  // ---- H7 ---------------------------------------------------------------------------------------------------------
  const STORES_A = 'Typing A = … does not store a value. Under Variables, type the value beside A, or work the number out and press Store.'
  const STORES_ELSEWHERE = (name: string): string =>
    `Typing ${name} = … does not store a value. Under Variables, type the value beside one of the letters A to F, M, x or y, or work the number out and press Store.`

  it('H7: "A = 5" is refused in words, never answered as if it had been stored', () => {
    // It used to answer 5: mathjs assigned into a throwaway copy of the letters, so A kept its value — and the screen,
    // seeing an =, filed the 5 under x. The store is the screen's; the line is only handed a copy, so it cannot be
    // stored from here, and the sentence says where it can.
    const vars: Record<string, unknown> = { A: 3, x: 7 }
    expect(messageOf(() => evaluateComp('A = 5', { ...ctx, vars }))).toBe(STORES_A)
    expect(vars, 'nothing was changed behind the refusal').toEqual({ A: 3, x: 7 })
    for (const [typed, letter] of [
      ['A=5', 'A'],
      ['y = 2 + 3', 'y'],
      ['M=7', 'M'],
      ['F = 0.25', 'F'],
      ['A = B = 5', 'A'],
      ['(A = 5)', 'A']
    ] as const) {
      expect(messageOf(() => evaluateComp(typed, ctx)), typed).toBe(STORES_A.replaceAll('A', letter))
    }
    // On the Maths screen: a sentence, no answer, and nothing "solved" for the screen to file under x.
    const r = evaluateInput('COMP', 'A=5', { vars, ans: 0, angle: 'deg' })
    expect(r?.error?.sentence).toBe(STORES_A)
    expect(r?.value).toBeUndefined()
    expect(r?.solved).toBeUndefined()
    expect(r?.main).toBe('')
    expect(vars).toEqual({ A: 3, x: 7 })
  })

  it('H7: a name the Variables drawer does not hold, and a function, are refused the same way', () => {
    expect(messageOf(() => evaluateComp('speed = 5', ctx))).toBe(STORES_ELSEWHERE('speed'))
    // f(t) = t² used to answer "f(t)" with no value, and the screen filed that, nothing, under x.
    expect(messageOf(() => evaluateComp('f(t) = t^2', ctx))).toBe(STORES_ELSEWHERE('f(t)'))
    const r = evaluateInput('COMP', 'f(t)=t^2', { vars: { x: 7 }, ans: 0, angle: 'deg' })
    expect(r?.error?.sentence).toBe(STORES_ELSEWHERE('f(t)'))
    expect(r?.solved).toBeUndefined()
  })

  it('H7: the refusal is a headline in plain words, and nothing else that has an = changes', () => {
    for (const sentence of [STORES_A, STORES_ELSEWHERE('speed'), STORES_ELSEWHERE('f(t)')]) {
      // The headline itself, not "I can't work that out." with the sentence as small print.
      expect(errorSentence(new Error(sentence)), sentence).toEqual({ sentence })
    }
    expect(STORES_A, 'no programming syntax in a student sentence').not.toMatch(/[()*^_{}\\]|sigma|product\(/)
    // An equation in x is still solved, and the root is still the x the screen keeps.
    const solved = evaluateInput('COMP', 'x=5', maths)
    expect(solved?.main).toBe('x = 5')
    expect(solved?.value).toBe(5)
    expect(solved?.solved).toBe(true)
    // A line that uses a stored letter reads it, and an = with no name on its left keeps the sentence it always had.
    expect(Number(evaluateComp('2A + 1', { ...ctx, vars: { A: 4 } }).value)).toBe(9)
    expect(evaluateInput('COMP', 'A+B=7', maths)?.error?.sentence).toBe('Equations are solved in Numbers mode: type both sides with = and press x = ?')
    expect(evaluateInput('COMP', '5=5', maths)?.error?.sentence).toBe('Equations are solved in Numbers mode: type both sides with = and press x = ?')
    // Only the line as typed is refused. The converter writes "x=5" into the summand of a sum typed with an = after it,
    // which nobody typed as a store: that line is refused as it always was, not as a store.
    // Since P-FIX-BROWSER F1 it is checked as the statement it is: 1 + 2 + 3 = 5 is false.
    const sumThenEquals = evaluateInput('COMP', '\\sum_{x=1}^{3}x=5', maths)
    expect(sumThenEquals?.main).toBe('false')
    expect(sumThenEquals?.error?.sentence ?? '').not.toMatch(/does not store/)
  })

  // ---- H3 (engine half) ---------------------------------------------------------------------------------------------
  it('H3: evaluateComp works in the angle of its context and puts the angle it found back, whatever it answered', () => {
    // Inside the call the context decides …
    setAngleMode('deg')
    expect(Number(evaluateComp('sin(1)', { vars: {}, ans: 0, angle: 'rad' }).value)).toBeCloseTo(Math.sin(1), 12)
    expect(getAngleMode(), 'a screen left in degrees stays in degrees').toBe('deg')
    setAngleMode('rad')
    expect(Number(evaluateComp('sin(30)', { vars: {}, ans: 0, angle: 'deg' }).value)).toBeCloseTo(0.5, 12)
    expect(getAngleMode(), 'a screen left in radians stays in radians').toBe('rad')
    // … and after it a bare evaluation (the Table, a tangent) is in the mode that was there, not the last line's.
    setAngleMode('deg')
    evaluateComp('1', { vars: {}, ans: 0, angle: 'rad' })
    expect(Number(math.evaluate('sin(30)'))).toBeCloseTo(0.5, 12)
  })

  it('H3: every way out of evaluateComp restores the angle — an answer, Pol and Rec, a solve, an empty line, a refusal, a failed search', () => {
    for (const angle of ['deg', 'rad'] as const) {
      const other = angle === 'deg' ? 'rad' : 'deg'
      for (const src of ['sin(30)', 'Pol(3, 4)', 'Rec(5, 30)', 'x^2 = 2', 'sin(x) = 0.5', '', '1 +', 'sin(x) = 2', 'A = 5', '1/0']) {
        setAngleMode(other)
        try {
          evaluateComp(src, { vars: {}, ans: 0, angle })
        } catch {
          // The refusals and the errors are the point of half of these lines.
        }
        expect(getAngleMode(), `${JSON.stringify(src)} typed in ${angle} on a screen left in ${other}`).toBe(other)
      }
    }
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import {
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
  polyInequality,
  polyRoots,
  propagate,
  solveLinearSystem,
  statistics
} from '../src/renderer/src/calc/engine'
import { calcEng, calcNum, mathFormatOptions, setCalcPrecisionSource } from '../src/renderer/src/calc/format'
import { casInDegrees } from '../src/renderer/src/calc/angle'
import { useCalc } from '../src/renderer/src/calc/calcStore'
import { parseAnswer } from '../src/renderer/src/math/checkAnswer'
import { fmt } from '../src/renderer/src/math/format'
import { math, preprocess } from '../src/renderer/src/math/expr'
import { resetGlobals } from './helpers/globals'

const ctx = { vars: {}, ans: 0, angle: 'deg' as const }

// evaluateComp sets the angle mode from its context on every call, so each case leaves the
// global wherever it last was.
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
    expect(parseAnswer('2.5 × 10^3')).toBe(2500)
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
    // d/dx sin(x°) = cos(x°) × π/180 — what an fx-991EX shows in DEG mode.
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
    expect(calcNum(NaN)).toBe('Math ERROR')
    expect(calcNum(Infinity)).toBe('∞')
    expect(calcNum(-Infinity)).toBe('−∞')
  })
  it('writes engineering notation with the same digits', () => {
    expect(calcEng(12345, { decimals: 4, precisionMode: 'sf' })).toBe('12.35×10^3')
    expect(calcEng(0.00042, { decimals: 2, precisionMode: 'sf' })).toBe('420×10^-6')
    expect(calcEng(0)).toBe('0')
  })
  it('hands mathjs the same precision for complex numbers and matrices', () => {
    expect(mathFormatOptions({ decimals: 4, precisionMode: 'sf' })).toEqual({ precision: 4 })
    expect(mathFormatOptions({ decimals: 2, precisionMode: 'dp' })).toEqual({ notation: 'fixed', precision: 2 })
    expect(math.format(math.complex(1 / 3, 2), mathFormatOptions({ decimals: 2, precisionMode: 'dp' }))).toBe('0.33 + 2.00i')
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
    expect(Number(evaluateComp('2*mp', ctx).value)).toBeCloseTo(2 * 1.67262192369e-27, 33)
  })
})

describe('exact form of a tiny number', () => {
  it('is not 0: 7 ÷ 3h used to show 0 as its exact answer', () => {
    expect(exactForm(1.5e-33)).toBeNull()
    expect(exactForm(0)).toBe('0')
    expect(exactForm(0.001)).toBe('\\frac{1}{1000}')
  })
})

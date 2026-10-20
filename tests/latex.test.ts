import { beforeEach, describe, expect, it } from 'vitest'
import { latexToMath, tryLatexToMath } from '../src/renderer/src/math/latexToMath'
import { evaluateComp, hasFreeX } from '../src/renderer/src/calc/engine'
import { evaluateInput } from '../src/renderer/src/calc/evaluateInput'
import { allKeys } from '../src/renderer/src/calc/keys'
import { math, preprocess, setAngleMode, toV3 } from '../src/renderer/src/math/expr'
import { usePure } from '../src/renderer/src/math/pure/store'
import { resetGlobals } from './helpers/globals'

beforeEach(resetGlobals)

const calc = (latex: string, angle: 'deg' | 'rad' = 'deg') => Number(evaluateComp(latexToMath(latex), { vars: {}, ans: 0, angle }).value)

describe('latexToMath', () => {
  it('converts calculator input', () => {
    expect(calc('\\frac{1}{2}+\\frac{1}{4}')).toBeCloseTo(0.75)
    expect(calc('\\sqrt{16}+3^{2}')).toBeCloseTo(13)
    expect(calc('\\sqrt[3]{27}')).toBeCloseTo(3)
    expect(calc('\\sin\\left(30\\right)')).toBeCloseTo(0.5)
    expect(calc('\\sin 30^{\\circ}')).toBeCloseTo(0.5)
    expect(calc('\\cos^{-1}\\left(0.5\\right)')).toBeCloseTo(60)
    expect(calc('2\\pi')).toBeCloseTo(2 * Math.PI)
    expect(calc('\\log_{2}\\left(8\\right)')).toBeCloseTo(3)
    expect(calc('\\left|-5\\right|\\times 2')).toBeCloseTo(10)
    expect(calc('6\\div 4')).toBeCloseTo(1.5)
    // Calculus is in radians, whatever the setting says (the owner's decision of 17 Oct 2026): this is the familiar 2 in DEG too. It was
    // pinned at 0.0861 in DEG, the integral of sin(x°) over 0 to 3.14 degrees, a thin sliver of the same curve.
    expect(calc('\\int_{0}^{\\pi}\\sin x\\,dx', 'rad')).toBeCloseTo(2, 6)
    expect(calc('\\int_{0}^{\\pi}\\sin x\\,dx', 'deg')).toBeCloseTo(2, 6)
    expect(calc('\\sum_{x=1}^{10}x^{2}')).toBe(385)
    expect(calc('\\operatorname{ddx}\\left(x^3,2\\right)')).toBeCloseTo(12, 6)
    expect(calc('2.5\\times 10^{3}')).toBeCloseTo(2500)
  })
  it('converts vector input', () => {
    setAngleMode('deg')
    const scope = { A: [3, 4, 0], B: [1, 2, 0], i: [1, 0, 0], j: [0, 1, 0], k: [0, 0, 1] }
    const vec = (latex: string) => toV3(math.evaluate(preprocess(latexToMath(latex, { vectorOps: true })), scope))
    expect(vec('3\\hat{i}+4\\hat{j}')).toEqual([3, 4, 0])
    expect(vec('\\vec{A}+2\\vec{B}')).toEqual([5, 8, 0])
    const p = vec('10\\angle 30^{\\circ}')
    expect(p[0]).toBeCloseTo(8.660254)
    expect(vec('\\vec{A}\\times\\vec{B}')).toEqual([0, 0, 2])
    expect(math.evaluate(preprocess(latexToMath('\\vec{A}\\cdot\\vec{B}', { vectorOps: true })), scope)).toBe(11)
    expect(math.evaluate(preprocess(latexToMath('\\left|\\vec{A}\\right|', { vectorOps: true })), scope)).toBe(5)
    expect(latexToMath('F_{1}+F_2', { vectorOps: true })).toBe('F1+F2')
  })
  it('reads what a student types or pastes from a book', () => {
    // Implicit multiplication and a Unicode square, minus and unit vectors.
    expect(latexToMath('2x')).toBe('2x')
    expect(calc('3^{2}+4²')).toBeCloseTo(25)
    expect(latexToMath('x²+1')).toBe('x^(2)+1')
    expect(calc('5−8')).toBeCloseTo(-3)
    setAngleMode('deg')
    const scope = { i: [1, 0, 0], j: [0, 1, 0], k: [0, 0, 1] }
    const vec = (latex: string) => toV3(math.evaluate(preprocess(latexToMath(latex, { vectorOps: true })), scope))
    expect(vec('3î + 4ĵ')).toEqual([3, 4, 0])
    expect(vec('3i\u0302 + 4j\u0302 - 2k\u0302')).toEqual([3, 4, -2])
    expect(vec('\\begin{pmatrix}3\\\\4\\end{pmatrix}')).toEqual([3, 4, 0])
    expect(vec('\\begin{pmatrix} 1 \\\\ -2 \\\\ \\frac{1}{2} \\end{pmatrix}')).toEqual([1, -2, 0.5])
    expect(latexToMath('\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}')).toBe('([[1, 2], [3, 4]])')
    expect(calc('\\begin{vmatrix}1 & 2 \\\\ 3 & 4\\end{vmatrix}')).toBeCloseTo(-2)
    // A scalar in front of a column vector, the way a book writes 2a once columns are chosen.
    expect(vec('2\\begin{pmatrix}3\\\\4\\end{pmatrix}')).toEqual([6, 8, 0])
    expect(vec('\\begin{pmatrix}3\\\\4\\end{pmatrix}+\\begin{pmatrix}1\\\\1\\end{pmatrix}')).toEqual([4, 5, 0])
    // Vulgar fractions: the hint on the Vectors panel promises ½A.
    expect(vec('½(6\\hat{i}+8\\hat{j})')).toEqual([3, 4, 0])
    expect(calc('¾+¼')).toBeCloseTo(1)
  })
  it('refuses ± with a sentence instead of quietly picking +', () => {
    expect(() => latexToMath('x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}')).toThrow(/Choose \+ or −/)
    expect(() => latexToMath('3±2')).toThrow(/one case at a time/)
    expect(() => latexToMath('3\\mp2')).toThrow()
    // The render-safe form hands the sentence back instead of throwing.
    expect(tryLatexToMath('3±2')).toEqual({ src: '', problem: expect.stringMatching(/Choose \+ or −/) })
    expect(tryLatexToMath('3+2')).toEqual({ src: '3+2' })
  })
})

// G1 (polish part P-CALC). The field writes a root, a function and π as sqrt(…), sin(…) and π, and the
// converter used to glue whatever stood in front of them onto the name: "xsqrt", "isqrt", "Api". So x√2
// was refused as an unknown function, and a·tan 45° quietly became atan 45 — a real inverse function, so
// the screen answered 88.727… instead of 3. A plain "(" after a function name also took only the bracket
// itself as the argument (sin()30)), so \sin(30) was refused as "check the brackets".
// Every line goes through the real route, evaluateInput, exactly as the Maths screen runs it. The expected
// numbers are worked out by hand in the comments (the file's beforeEach(resetGlobals) restores degrees).
describe('G1 — a letter or π before a root or function is a product (field LaTeX → answer)', () => {
  const vars = { x: 2, A: 3, a: 3 }
  type Angle = 'deg' | 'rad'
  const rad = (degrees: number) => (degrees * Math.PI) / 180
  /** The value the Maths screen answers with, or the sentence it shows instead when it cannot. */
  const shown = (mode: 'COMP' | 'CMPLX', latex: string, angle: Angle = 'deg', scope: Record<string, unknown> = vars): unknown => {
    const r = evaluateInput(mode, latex, { vars: scope, ans: 0, angle })
    return r?.error ? `refused: ${r.error.sentence}` : r?.value
  }
  const complexOf = (v: unknown): { re: number; im: number } => {
    if (typeof v === 'object' && v !== null && 're' in v && 'im' in v) return v as { re: number; im: number }
    throw new Error(`not a complex answer: ${String(v)}`)
  }

  it('puts a product between a letter and a root: x√2, A√2, x∛27, 2x√3, e√2', () => {
    // x = 2, A = 3. 2·√2 = 2.828427…; 3·√2 = 4.242640…; 2·3 = 6 (the cube root of 27 is 3);
    // 2x√3 = 4·√3 = 6.928203…; e√2 = 2.718281… × 1.414213… = 3.844231…
    expect(shown('COMP', 'x\\sqrt{2}')).toBeCloseTo(2 * Math.SQRT2, 9)
    expect(shown('COMP', 'A\\sqrt{2}')).toBeCloseTo(3 * Math.SQRT2, 9)
    expect(shown('COMP', 'x\\sqrt[3]{27}')).toBeCloseTo(6, 9)
    expect(shown('COMP', '2x\\sqrt{3}')).toBeCloseTo(4 * Math.sqrt(3), 9)
    expect(shown('COMP', 'e\\sqrt{2}')).toBeCloseTo(Math.E * Math.SQRT2, 9)
    // A name that ends in a digit (the subscript of F_1) is still a name, not a number.
    expect(latexToMath('F_{1}\\sqrt{2}')).toBe('F1*sqrt(2)')
    // The calculus route reads these two lines the same way: the product arrives already apart.
    expect(latexToMath('2x\\cos\\left(x^{2}\\right)')).toBe('2x*cos(x^(2))')
    expect(latexToMath('\\theta\\sin\\theta')).toBe('θ*sin(θ)')
  })

  it('puts a product between π and a root, and between a letter and π', () => {
    // 2π√3 = 6.283185… × 1.732050… = 10.882796…; π√2 = 4.442882…; Aπ = 3π = 9.424777…; xπ = 2π = 6.283185…
    expect(shown('COMP', '2\\pi\\sqrt{3}')).toBeCloseTo(2 * Math.PI * Math.sqrt(3), 9)
    expect(shown('COMP', '\\pi\\sqrt{2}')).toBeCloseTo(Math.PI * Math.SQRT2, 9)
    expect(shown('COMP', 'A\\pi')).toBeCloseTo(3 * Math.PI, 9)
    expect(shown('COMP', 'x\\pi')).toBeCloseTo(2 * Math.PI, 9)
  })

  it('puts a product between a letter and a function, in degrees and in radians', () => {
    // x sin 30: in DEG sin 30° = 0.5, so 2 × 0.5 = 1; in RAD sin 30 = −0.988031…, so 2 × that = −1.976063…
    expect(shown('COMP', 'x\\sin\\left(30\\right)', 'deg')).toBeCloseTo(1, 9)
    expect(shown('COMP', 'x\\sin\\left(30\\right)', 'rad')).toBeCloseTo(2 * Math.sin(30), 9)
    // x ln 2 = 2 × 0.693147… = 1.386294…; x cos 60° = 2 × 0.5 = 1; x log₂ 8 = 2 × 3 = 6.
    expect(shown('COMP', 'x\\ln\\left(2\\right)')).toBeCloseTo(2 * Math.LN2, 9)
    expect(shown('COMP', 'x\\cos\\left(60\\right)')).toBeCloseTo(1, 9)
    expect(shown('COMP', 'x\\log_{2}\\left(8\\right)')).toBeCloseTo(6, 9)
    // The power or the −1 on the function name does not change that: x sin²30° = 2 × 0.25 = 0.5;
    // x sin⁻¹(0.5) = 2 × 30° = 60.
    expect(shown('COMP', 'x\\sin^{2}\\left(30\\right)')).toBeCloseTo(0.5, 9)
    expect(shown('COMP', 'x\\sin^{-1}\\left(0.5\\right)')).toBeCloseTo(60, 9)
  })

  it('a letter a before sin, cos or tan is a times it, never the inverse function asin, acos, atan', () => {
    // "a" + "tan" was spelt atan, a real function, so a tan 45° answered 88.727… (the angle whose tangent
    // is 45) and a cos 60° answered 4.787…i, with no hint anything was wrong. With a = 3:
    // 3 × tan 45° = 3 × 1 = 3; 3 × cos 60° = 3 × 0.5 = 1.5; 3 × sin 30° = 1.5; 3 × sin 2° = 0.104698…
    expect(shown('COMP', 'a\\tan\\left(45\\right)')).toBeCloseTo(3, 9)
    expect(shown('COMP', 'a\\cos\\left(60\\right)')).toBeCloseTo(1.5, 9)
    expect(shown('COMP', 'a\\sin\\left(30\\right)')).toBeCloseTo(1.5, 9)
    expect(shown('COMP', 'a\\sin x')).toBeCloseTo(3 * Math.sin(rad(2)), 9)
    // Without a value for a — what the screen has until the student gives one — the refusal names the
    // letter instead of answering with an inverse function.
    expect(shown('COMP', 'a\\tan\\left(45\\right)', 'deg', { x: 2 })).toMatch(/refused: I don't know what a is/)
  })

  it('Complex mode: a root after i, and 1/(√2 − i√5)', () => {
    // 1/(√2 − i√5) = (√2 + i√5)/(2 + 5) = 0.202030… + 0.319438…i
    const z = complexOf(shown('CMPLX', '\\frac{1}{\\sqrt{2}-i\\sqrt{5}}'))
    expect(z.re).toBeCloseTo(Math.SQRT2 / 7, 9)
    expect(z.im).toBeCloseTo(Math.sqrt(5) / 7, 9)
    // i√5 = 2.236067…i; 2i√3 = 3.464101…i
    const a = complexOf(shown('CMPLX', 'i\\sqrt{5}'))
    expect(a.re).toBeCloseTo(0, 9)
    expect(a.im).toBeCloseTo(Math.sqrt(5), 9)
    const b = complexOf(shown('CMPLX', '2i\\sqrt{3}'))
    expect(b.im).toBeCloseTo(2 * Math.sqrt(3), 9)
    // x sin 30° = 1 here too, and in radians 2 × sin 30 = −1.976063…
    expect(complexOf(shown('CMPLX', 'x\\sin\\left(30\\right)', 'deg')).re).toBeCloseTo(1, 9)
    expect(complexOf(shown('CMPLX', 'x\\sin\\left(30\\right)', 'rad')).re).toBeCloseTo(2 * Math.sin(30), 9)
  })

  it('plain brackets after a function name hold its whole argument, nested ones too', () => {
    // sin 30 = 0.5 in degrees, −0.988031… in radians; ln 2 = 0.693147…; log₂ 8 = 3.
    expect(shown('COMP', '\\sin(30)', 'deg')).toBeCloseTo(0.5, 9)
    expect(shown('COMP', '\\sin(30)', 'rad')).toBeCloseTo(Math.sin(30), 9)
    expect(shown('COMP', '\\ln(2)')).toBeCloseTo(Math.LN2, 9)
    expect(shown('COMP', '\\log_{2}(8)')).toBeCloseTo(3, 9)
    // Nested brackets: sin(2(15)) = sin 30° = 0.5. The power after the bracket is not part of it: sin(30)² = 0.25.
    expect(shown('COMP', '\\sin(2(15))')).toBeCloseTo(0.5, 9)
    expect(shown('COMP', '\\sin(30)^{2}')).toBeCloseTo(0.25, 9)
    // Two calls in a row: sin 2° cos 2° = 0.034899… × 0.999390… = 0.034878…
    expect(shown('COMP', '\\sin(x)\\cos(x)')).toBeCloseTo(Math.sin(rad(2)) * Math.cos(rad(2)), 9)
    // A function, and a root with a letter in front of it, inside the bracket:
    // sin(cos 60°) = sin 0.5° = 0.008726…; sin(2√2°) = sin 2.828427° = 0.049345…
    expect(shown('COMP', '\\sin(\\cos(60))')).toBeCloseTo(Math.sin(rad(0.5)), 9)
    expect(shown('COMP', '\\sin(x\\sqrt{2})')).toBeCloseTo(Math.sin(rad(2 * Math.SQRT2)), 9)
    // d/dx reads its body through the same argument reader, so plain brackets worked for it no better:
    // it came out as "diff(, x)x^(3))". It is now what the \left form has always given.
    expect(latexToMath('\\frac{d}{dx}(x^{3})')).toBe('diff(x^(3), x)')
    expect(latexToMath('\\frac{d}{dx}\\left(x^{3}\\right)')).toBe('diff(x^(3), x)')
  })

  it('a bracket that is never closed is closed where its group ends, as an unclosed \\left( is', () => {
    // sin(30 with no ) is sin(30); the } that ends the numerator is not swallowed as text.
    expect(latexToMath('\\sin(30')).toBe('sin(30)')
    expect(latexToMath('\\frac{\\sin(30}{2}')).toBe('((sin(30))/(2))')
    expect(latexToMath('\\left(\\sin(30\\right)')).toBe('(sin(30))')
    expect(latexToMath('\\sin\\left(30')).toBe('sin(30)')
  })

  it('the Working screen no longer meets a made-up function name', () => {
    // x√2 + x reached Working as "xsqrt(2)+x" and was refused as '"xsqrt" is not something I can factorise.'
    usePure.getState().runLatex('x\\sqrt{2}+x', 'auto')
    expect(usePure.getState().input).toBe('x*sqrt(2)+x')
    expect(usePure.getState().working?.error ?? '').not.toMatch(/xsqrt/)
    // 2π√3 reached it as "2πsqrt(3)", which mathjs read as a function called pisqrt.
    usePure.getState().runLatex('2\\pi\\sqrt{3}', 'auto')
    expect(usePure.getState().input).toBe('2π*sqrt(3)')
    expect(usePure.getState().working?.error ?? '').not.toMatch(/pisqrt/)
    // i next to its root is kept as the implicit product it is, with a space and not a "*": the Complex
    // working takes a typed sign for a product to multiply out, so with "*" 1/(√2 − i√5) lost its first
    // step (multiply by the conjugate). i√3 still picks the Complex job and works.
    expect(latexToMath('i\\sqrt{5}')).toBe('i sqrt(5)')
    expect(latexToMath('2i\\sqrt{3}')).toBe('2i sqrt(3)')
    expect(latexToMath('e^{i\\pi}')).toBe('e^(i π)')
    expect(latexToMath('\\frac{1}{\\sqrt{2}-i\\sqrt{5}}')).toBe('((1)/(sqrt(2)-i sqrt(5)))')
    usePure.getState().runLatex('i\\sqrt{3}', 'auto')
    expect(usePure.getState().job).toBe('complex')
    expect(usePure.getState().working?.error).toBeUndefined()
    usePure.getState().runLatex('\\frac{1}{\\sqrt{2}-i\\sqrt{5}}', 'auto')
    expect(usePure.getState().job).toBe('complex')
    expect(usePure.getState().working?.moves[0]?.head).toMatch(/conjugate/)
  })

  it('reads everything that already worked exactly as before', () => {
    // A number in front of a root, a function or π was always a product and is still written without a sign.
    expect(latexToMath('3\\sqrt{2}')).toBe('3sqrt(2)')
    expect(latexToMath('2\\pi')).toBe('2π')
    expect(latexToMath('2.5\\sin x')).toBe('2.5sin(x)')
    // A closing bracket or another root before a root is read as a product by mathjs already.
    expect(latexToMath('\\sqrt{x}\\sqrt{2}')).toBe('sqrt(x)sqrt(2)')
    expect(latexToMath('(x+1)\\sqrt{2}')).toBe('(x+1)sqrt(2)')
    expect(latexToMath('\\left(x+1\\right)\\sqrt{2}')).toBe('(x+1)sqrt(2)')
    expect(latexToMath('\\sin x\\cos x')).toBe('sin(x)cos(x)')
    expect(latexToMath('e^{x}\\sqrt{2}')).toBe('e^(x)sqrt(2)')
    // A sign typed on purpose, or a space, is the separator already and gets no second one.
    expect(latexToMath('x\\times\\sqrt{2}')).toBe('x*sqrt(2)')
    expect(latexToMath('x\\cdot\\sin x')).toBe('x*sin(x)')
    expect(latexToMath('x\\,\\sqrt{2}')).toBe('x sqrt(2)')
    // The calls themselves.
    expect(latexToMath('\\sin x')).toBe('sin(x)')
    expect(latexToMath('\\sin\\left(x\\right)')).toBe('sin(x)')
    expect(latexToMath('\\ln\\left(2\\right)')).toBe('ln(2)')
    expect(latexToMath('\\sqrt{2x}')).toBe('sqrt(2x)')
    expect(latexToMath('e^{x}')).toBe('e^(x)')
    expect(latexToMath('\\log_{2}\\left(8\\right)')).toBe('log(2, 8)')
    expect(latexToMath('\\sqrt[3]{27}')).toBe('nthRoot(27, 3)')
    expect(latexToMath('\\left|x\\right|')).toBe('|x|')
    expect(latexToMath('|x|')).toBe('|x|')
    // A letter in front of a bracket is still a call: x(2), f(2). Nothing is put between them.
    expect(latexToMath('f\\left(2\\right)')).toBe('f(2)')
    expect(latexToMath('x\\left(2\\right)')).toBe('x(2)')
    // And the same lines still answer: sin 2° = 0.034899…, ln 2, √4, |2|, e², 3.
    expect(shown('COMP', '\\sin x')).toBeCloseTo(Math.sin(rad(2)), 9)
    expect(shown('COMP', '\\sin\\left(x\\right)')).toBeCloseTo(Math.sin(rad(2)), 9)
    expect(shown('COMP', '\\ln\\left(2\\right)')).toBeCloseTo(Math.LN2, 9)
    expect(shown('COMP', '\\sqrt{2x}')).toBeCloseTo(2, 9)
    expect(shown('COMP', '\\sqrt{x}\\sqrt{2}')).toBeCloseTo(2, 9)
    expect(shown('COMP', '\\left|x\\right|')).toBeCloseTo(2, 9)
    expect(shown('COMP', 'e^{x}')).toBeCloseTo(Math.exp(2), 9)
    expect(shown('COMP', '\\log_{2}\\left(8\\right)')).toBeCloseTo(3, 9)
    expect(shown('COMP', '\\sqrt[3]{27}')).toBeCloseTo(3, 9)
    expect(shown('COMP', '3\\sqrt{2}')).toBeCloseTo(3 * Math.SQRT2, 9)
    expect(shown('COMP', '(x+1)\\sqrt{2}')).toBeCloseTo(3 * Math.SQRT2, 9)
  })

  it('a function the student defined is still called, not multiplied', () => {
    // f(n) = n + 100, so f(2) = 102 and f(x) with x = 2 is 102 as well.
    const f = (n: number) => n + 100
    expect(shown('COMP', 'f\\left(2\\right)', 'deg', { f })).toBe(102)
    expect(shown('COMP', 'f\\left(x\\right)', 'deg', { f, x: 2 })).toBe(102)
  })

  it('vector mode: a vector before a root is a scalar multiple, and a cross product stays ×', () => {
    expect(latexToMath('\\vec{A}\\sqrt{2}', { vectorOps: true })).toBe('A*sqrt(2)')
    expect(latexToMath('\\vec{A}\\times\\vec{B}', { vectorOps: true })).toBe('A×B')
    // A = (3, 4, 0), so A√2 = (3√2, 4√2, 0) = (4.242640…, 5.656854…, 0).
    setAngleMode('deg')
    const v = toV3(math.evaluate(preprocess(latexToMath('\\vec{A}\\sqrt{2}', { vectorOps: true })), { A: [3, 4, 0] }))
    expect(v[0]).toBeCloseTo(3 * Math.SQRT2, 9)
    expect(v[1]).toBeCloseTo(4 * Math.SQRT2, 9)
    expect(v[2]).toBe(0)
  })
})

// U1 (P-CALC). The ×10ˣ key is the one thing that makes a standard-form number; the × key, and a × typed
// or pasted, only ever multiply. The key used to write exactly what × then 10^ write (\times10^{…}), so
// 1 ÷ 2 ×10ˣ 3 read as (1 ÷ 2) × 10³ = 500, where the number the student built is 2×10³ and the answer is
// 1 ÷ 2000 = 0.0005 — a thousand times too big, with no error to warn anyone. The key now writes a mark of
// its own, \mathord{\times} (MathLive keeps it exactly as inserted and draws a tight ×10 beside the
// number), and the converter reads the mark with its 10^power as ONE number, written as a plain e-number
// so that every route that reads the line (the working, SymPy, the calculator) reads it the same way.
// Every line goes through evaluateInput, as the Maths screen runs it. The values are worked out by hand.
describe('U1 — only the ×10ˣ key makes a standard-form number; a plain × only multiplies (field LaTeX → answer)', () => {
  const e10 = allKeys().find((k) => k.id === 'e10')!
  /** The field after `before` is typed, the ×10ˣ key is pressed and `power` is typed into its box. */
  const keyed = (before: string, power: string): string => before + e10.tex!.replace(/#[0@]/, '').replace('#?', power)
  const value = (latex: string, vars: Record<string, unknown> = {}): unknown => {
    const r = evaluateInput('COMP', latex, { vars, ans: 0, angle: 'deg' })
    return r?.error ? `refused: ${r.error.sentence}` : r?.value
  }
  /** Within a hair of `want`, relative to its own size: 1.6×10⁻¹⁹ must not pass for 0. */
  const near = (got: unknown, want: number): void => {
    expect(typeof got, String(got)).toBe('number')
    expect((got as number) / want).toBeCloseTo(1, 12)
  }

  it('a plain × only multiplies: 2×100, 3×10+1, 2×10, ½×10³ and 1÷2×10³ read left to right', () => {
    expect(value('2\\times100')).toBe(200)
    expect(value('3\\times10+1')).toBe(31)
    expect(value('2\\times10')).toBe(20)
    // (1 ÷ 2) × 1000 = 500, whichever way the 1 ÷ 2 is written.
    expect(value('\\frac{1}{2}\\times10^{3}')).toBe(500)
    expect(value('1\\div2\\times10^{3}')).toBe(500)
    // The product of a plain × and a power of ten is still the number it spells: 6.02×10²³ × 2, 1.6×10⁻¹⁹.
    near(value('6.02\\times10^{23}\\times2'), 1.204e24)
    near(value('1.6\\times10^{-19}'), 1.6e-19)
  })

  it('the ×10ˣ key makes ONE number: 1 ÷ 2 ×10ˣ 3 is 1 ÷ 2000, not (1 ÷ 2) × 1000', () => {
    // 1 ÷ (2 × 10³) = 1 ÷ 2000 = 0.0005. The key's own LaTeX is used, so a change to the key is a change here.
    near(value(keyed('1\\div2', '3')), 0.0005)
    near(value(keyed('3', '8')), 3e8)
    // 6.02×10²³ × 2 = 1.204×10²⁴; a negative power, 1.6×10⁻¹⁹.
    near(value(`${keyed('6.02', '23')}\\times2`), 1.204e24)
    near(value(keyed('1.6', '-19')), 1.6e-19)
    // Wherever the number stands: as a divisor 6 ÷ 2×10⁻² = 6 ÷ 0.02 = 300; after a sign 5 + 2×10³ = 2005;
    // negative −2×10³ = −2000; inside a fraction 1 ÷ 2000 again; under a root √(4×10²) = √400 = 20.
    near(value(keyed('6\\div2', '-2')), 300)
    near(value(keyed('5+2', '3')), 2005)
    near(value(keyed('-2', '3')), -2000)
    near(value(`\\frac{1}{${keyed('2', '3')}}`), 0.0005)
    near(value(`\\sqrt{${keyed('4', '2')}}`), 20)
    // The number in front of it keeps its own digits: 12.5×10² = 1250, .5×10² = 50.
    near(value(keyed('12.5', '2')), 1250)
    near(value(keyed('.5', '2')), 50)
  })

  it('the mark reaches the linear text as a plain e-number, so every route reads the line the same way', () => {
    // The working (Work it out), SymPy and the calculator all read 1.6e-19; none of them knows a mark.
    expect(latexToMath(keyed('1.6', '-19'))).toBe('1.6e-19')
    expect(latexToMath(keyed('1\\div2', '3'))).toBe('1/2e3')
    expect(latexToMath(`x+${keyed('3', '8')}`)).toBe('x+3e8')
    expect(latexToMath(keyed('3', '8'), { vectorOps: true })).toBe('3e8')
    // …and the working really does read it: x + 3×10⁸ stays a sum of x and 300 000 000.
    const w = usePure.getState()
    w.runLatex(`x+${keyed('3', '8')}`, 'expand')
    expect(usePure.getState().working?.error).toBeUndefined()
    expect(usePure.getState().working?.answers.map((a) => a.tex).join(' ')).toContain('300000000')
  })

  it('after a bracket, a fraction, a root, a letter or a power the key means "times ten to the"', () => {
    // Only a number can be written in standard form; anything else in front of the key is scaled by 10ⁿ.
    near(value(keyed('\\left(1+2\\right)', '3')), 3000)
    near(value(keyed('\\frac{3}{2}', '3')), 1500)
    near(value(keyed('\\sqrt{4}', '3')), 2000)
    near(value(keyed('x', '3'), { x: 2 }), 2000)
    // A name is its letters and digits, Greek letters too: α2 is one name, scaled by 10³ (5 × 1000), and
    // is never α next to the number 2×10³.
    near(value(keyed('\\alpha2', '3'), { 'α2': 5 }), 5000)
    // The 3 in 2³ is the power of the 2, not the number the key follows: 2³ × 10⁴ = 80 000.
    near(value(keyed('2^{3}', '4')), 80000)
    // A percent takes the whole standard-form number: 3×10² % = 300 % = 3.
    near(value(`${keyed('3', '2')}\\%`), 3)
  })

  it('a power that is no whole number is read, and a power left empty is refused, never guessed', () => {
    near(value(keyed('2', '1+2')), 2000)
    near(value(keyed('2', '-1.5')), 2 * 10 ** -1.5)
    expect(value(keyed('3', ''))).toMatch(/^refused: /)
    expect(value('3\\mathord{\\times}10^{\\placeholder{}}')).toMatch(/^refused: /)
    // A digit typed after the power is not glued onto it: 2×10³ then 5 is refused (no sign between them),
    // never read as 2×10³⁵ — a number 10³² too big with nothing to say so.
    expect(value(`${keyed('2', '3')}5`)).toMatch(/^refused: /)
  })

  it('a mark whose 10 was edited away is only an ordinary ×', () => {
    // The student pressed Backspace into the 10, or typed another digit: nothing is standard form any more.
    expect(value('2\\mathord{\\times}10')).toBe(20)
    expect(value('2\\mathord{\\times}100')).toBe(200)
    expect(value('2\\mathord{\\times}1')).toBe(2)
    expect(value('3\\mathord{\\times}10+1')).toBe(31)
  })

  it('a pasted 1.6×10^-19 or 6.02×10^23 reads as the number it spells', () => {
    // MathLive reads a pasted ^ as TeX does: the superscript is only the minus, or only the first digit,
    // and the rest of the number is left on the line. Recorded in the browser (2026-10-02): the pasted text
    // 1.6×10^-19 became 1.6\times10^{-}19, 6.02×10^23 became 6.02\times10^23.
    near(value('1.6\\times10^{-}19'), 1.6e-19)
    near(value('6.02\\times10^23'), 6.02e23)
    near(value('1.6\\times10^{+}19'), 1.6e19)
    near(value('1.6\\times10^{-}19\\times2'), 3.2e-19)
    // The power stops where the digits stop: 5×10²³ ÷ 2, 2×10⁻³ ÷ 4.
    near(value('5\\times10^23\\div2'), 2.5e23)
    near(value('2\\times10^{-}3\\div4'), 5e-4)
    // Typed forms are untouched: a one-digit power and a braced one.
    near(value('3\\times10^8'), 3e8)
    near(value('2\\times10^{-3}'), 2e-3)
    // A pasted line is a multiplication (1 ÷ 1.6 × 10⁻¹⁹), like every plain ×: only the key builds one number.
    near(value('1\\div1.6\\times10^{-}19'), (1 / 1.6) * 1e-19)
  })

  // Round 2. The checker found two defects in round 1, both reproduced in the browser.
  it('a percent takes the whole number in front of it: a leading dot, a trailing dot and the key’s power included', () => {
    // .5×10² % is 50 % = 0.5 and 2.×10³ % is 2000 % = 20. The engine's percent rule wanted a digit first and
    // digits after a dot, so it took only "5e2" out of ".5e2%" (leaving ".(5e2/100)": "I can't read that") and
    // only "3" out of "2.e3%" (leaving "2.e(3/100)": "There is no function called e").
    near(value(`${keyed('.5', '2')}\\%`), 0.5)
    near(value(`${keyed('2.', '3')}\\%`), 20)
    near(value(`${keyed('3', '2')}\\%`), 3)
    near(value(`${keyed('1.6', '-2')}\\%`), 1.6e-4)
    // .5 % was refused before the key existed (".(5/100)"); it is 0.5 ÷ 100 = 0.005. 2. % is 0.02.
    near(value('.5\\%'), 0.005)
    near(value('2.\\%'), 0.02)
    // Guards: a whole number and a decimal keep their old answers, and the percent binds to its own number (6 ÷ 2 % = 6 ÷ 0.02).
    near(value('50\\%'), 0.5)
    near(value('12.5\\%'), 0.125)
    near(value('6\\div2\\%'), 300)
  })

  it('a number that begins in the middle of another number is not a percent of anything', () => {
    // 1.2.5 % was read as 1. × (2.5 %) and answered 0.025, a number nobody typed. A digit or a dot right
    // before a candidate means it is only the tail of something longer, so the line is refused instead.
    expect(value('1.2.5\\%')).toMatch(/^refused: /)
    expect(value('1..5\\%')).toMatch(/^refused: /)
  })

  it('a power that is a bracket or a sum still belongs to the number: ÷ 2×10⁻³ divides by 0.002', () => {
    // The mark, its 10 and its power are ONE number whatever the power looks like. Only a power of bare digits
    // was joined to the number in front of it; a power in a bracket or a sum became "×10^", a product, and
    // 1 ÷ 2 ×10ˣ (−3) answered (1 ÷ 2) × 10⁻³ = 0.0005 where the number is 2×10⁻³ and the answer 1 ÷ 0.002 = 500.
    near(value(keyed('1\\div2', '(-3)')), 500)
    near(value(keyed('1\\div2', '\\left(-3\\right)')), 500)
    // 6 ÷ (2×10⁻²) = 6 ÷ 0.02 = 300, not 0.03.
    near(value(keyed('6\\div2', '(-2)')), 300)
    near(value(keyed('6\\div2', '\\left(-2\\right)')), 300)
    // 1 ÷ (2×10^(1+2)) = 1 ÷ 2000 = 0.0005, not 500; with its own brackets or without.
    near(value(keyed('1\\div2', '(1+2)')), 0.0005)
    near(value(keyed('1\\div2', '1+2')), 0.0005)
    // Wherever the number stands: after a sign 5 − 2×10³ = −1995, negative −2×10³, in a fraction, under a
    // root √(4×10²) = 20, and followed by a product 2×10³ × 2 = 4000.
    near(value(keyed('5-2', '(1+2)')), 5 - 2000)
    near(value(keyed('-2', '(1+2)')), -2000)
    near(value(`\\frac{1}{${keyed('2', '(1+2)')}}`), 0.0005)
    near(value(`\\sqrt{${keyed('4', '(2)')}}`), 20)
    near(value(`${keyed('2', '(1+2)')}\\times2`), 4000)
    // A power that is no whole number: 1 ÷ (2×10^−1.5).
    near(value(keyed('1\\div2', '(-1.5)')), 1 / (2 * 10 ** -1.5))
  })

  it('the bracket or sum power reaches the linear text as one bracketed number; a bare power stays a plain e-number', () => {
    expect(latexToMath(keyed('1\\div2', '(-3)'))).toBe('1/(2*10^((-3)))')
    expect(latexToMath(keyed('1\\div2', '1+2'))).toBe('1/(2*10^(1+2))')
    expect(latexToMath(keyed('1.6', '(1+2)'))).toBe('(1.6*10^((1+2)))')
    expect(latexToMath(keyed('3', '1+2'), { vectorOps: true })).toBe('(3*10^(1+2))')
    // The bare power is still the plain e-number every route reads alike (the guards of the round before).
    expect(latexToMath(keyed('1\\div2', '3'))).toBe('1/2e3')
    expect(latexToMath(keyed('1.6', '-19'))).toBe('1.6e-19')
    // A power inside a power: 2 ×10ˣ (3 ×10ˣ 2) is 2×10^(3×10²), written with the inner number resolved too.
    expect(latexToMath(keyed('2', keyed('3', '2')))).toBe('(2*10^(3e2))')
  })

  it('anything in front of the key that is no plain number keeps scaling by ten to the power, whatever the power', () => {
    // No literal mantissa, no bracket added: (1+2) × 10^(1+2) = 3000; a letter, a name with a digit and a power.
    near(value(keyed('\\left(1+2\\right)', '(1+2)')), 3000)
    near(value(keyed('x', '(1+2)'), { x: 2 }), 2000)
    near(value(keyed('x2', '(1+2)'), { x2: 5 }), 5000)
    near(value(keyed('\\alpha2', '(1+2)'), { 'α2': 5 }), 5000)
    near(value(keyed('2^{3}', '(1+2)')), 8000)
    expect(latexToMath(keyed('\\left(1+2\\right)', '(1+2)'))).toBe('(1+2)*10^((1+2))')
    expect(latexToMath(keyed('x2', '(1+2)'))).toBe('x2*10^((1+2))')
    // A digit typed after the power is never glued on: refused, not read as 2×10³ × 5 or 2×10³⁵.
    expect(value(`${keyed('2', '(1+2)')}5`)).toMatch(/^refused: /)
    expect(value(`${keyed('2', '1+2')}5`)).toMatch(/^refused: /)
  })

  it('guards: a bare-digit power, a plain ×, 50 %, 2×100 and a name that ends in a digit are unchanged', () => {
    near(value(keyed('1\\div2', '3')), 0.0005)
    expect(value('1\\div2\\times10^{3}')).toBe(500)
    expect(value('1\\div2\\times10^3')).toBe(500)
    expect(value('50\\%')).toBe(0.5)
    expect(value('2\\times100')).toBe(200)
    // x2ᴇ3 is the name x2 times ten to the third, never the literal "x2e3" (a letter in front of a digit is a name).
    expect(value('x2ᴇ3', { x2: 5 })).toBe(5000)
  })
})

// G5 (polish part P-CALC). MathLive writes a function typed on the keyboard, and a fraction made with "/"
// after it, as \sin\frac{\pi}{6}: no bracket between them. fnArg knew only letters, digits and five Greek
// names after a bare function name, so a fraction or a root ended the argument as the empty string — the
// line reached the engine as sin()((π)/(6)), which mathjs refused ("Unexpected type of argument in
// function sin"), and the half-angle identity typed with fractions (sin x − sin 2x = −2 cos 3x/2 sin x/2)
// reached Working as cos()((3x)/(2)) and was refused too. A fraction or a root straight after a function
// name is now that function's argument, the way a book reads sin π/6, and gives the very text the typed
// brackets give. Every line goes through evaluateInput, as the Maths screen runs it; the expected numbers
// are worked out by hand in the comments.
describe('G5 — a fraction straight after a function name is its argument (field LaTeX → answer)', () => {
  beforeEach(resetGlobals)
  const rad = (degrees: number) => (degrees * Math.PI) / 180
  /** The value the Maths screen answers with, or the sentence it shows instead when it cannot. */
  const shown = (latex: string, angle: 'deg' | 'rad' = 'deg', vars: Record<string, unknown> = {}): unknown => {
    const r = evaluateInput('COMP', latex, { vars, ans: 0, angle })
    return r?.error ? `refused: ${r.error.sentence}` : r?.value
  }

  it('sin, cos and tan of a fraction in radians: sin π/6, cos π/3, tan π/4, sin 3π/2', () => {
    // sin(π/6) = 0.5; cos(π/3) = 0.5; tan(π/4) = 1; sin(3π/2) = −1.
    expect(shown('\\sin\\frac{\\pi}{6}', 'rad')).toBeCloseTo(0.5, 9)
    expect(shown('\\cos\\frac{\\pi}{3}', 'rad')).toBeCloseTo(0.5, 9)
    expect(shown('\\tan\\frac{\\pi}{4}', 'rad')).toBeCloseTo(1, 9)
    expect(shown('\\sin\\frac{3\\pi}{2}', 'rad')).toBeCloseTo(-1, 9)
  })

  it('in degrees the same kind of line follows the screen: sin 30/1, cos 180/3, tan 90/2, sin x/2 with x = 60', () => {
    // 30/1 = 30° → 0.5; 180/3 = 60° → cos 60° = 0.5; 90/2 = 45° → tan 45° = 1; 60/2 = 30° → 0.5.
    expect(shown('\\sin\\frac{30}{1}')).toBeCloseTo(0.5, 9)
    expect(shown('\\cos\\frac{180}{3}')).toBeCloseTo(0.5, 9)
    expect(shown('\\tan\\frac{90}{2}')).toBeCloseTo(1, 9)
    expect(shown('\\sin\\frac{x}{2}', 'deg', { x: 60 })).toBeCloseTo(0.5, 9)
    // The angle mode decides, not the text: in degrees π/6 = 0.5236…° and its sine is 0.009138…, not 0.5.
    expect(shown('\\sin\\frac{\\pi}{6}', 'deg')).toBeCloseTo(Math.sin(rad(Math.PI / 6)), 9)
  })

  it('log, ln and log with a base of a fraction: log 100/10, ln e²/e, log 1/1000, ln 1/e, log₂ 16/2', () => {
    // log(100/10) = log 10 = 1; ln(e²/e) = ln e = 1; log(1/1000) = −3; ln(1/e) = −1; log₂(16/2) = log₂ 8 = 3.
    expect(shown('\\log\\frac{100}{10}')).toBeCloseTo(1, 9)
    expect(shown('\\ln\\frac{e^{2}}{e}')).toBeCloseTo(1, 9)
    expect(shown('\\log\\frac{1}{1000}')).toBeCloseTo(-3, 9)
    expect(shown('\\ln\\frac{1}{e}')).toBeCloseTo(-1, 9)
    expect(shown('\\log_{2}\\frac{16}{2}')).toBeCloseTo(3, 9)
  })

  it('a root straight after a function name is its argument too: ln √e, log √100, sin √900, ln ∛e', () => {
    // ln(√e) = ½; log(√100) = log 10 = 1; in degrees sin(√900) = sin 30° = 0.5; ln(∛e) = ⅓.
    expect(shown('\\ln\\sqrt{e}')).toBeCloseTo(0.5, 9)
    expect(shown('\\log\\sqrt{100}')).toBeCloseTo(1, 9)
    expect(shown('\\sin\\sqrt{900}')).toBeCloseTo(0.5, 9)
    expect(shown('\\ln\\sqrt[3]{e}')).toBeCloseTo(1 / 3, 9)
  })

  it('the power or the −1 on the name comes first: sin² π/6, sin⁻¹ 1/2, arcsin 1/2, tan⁻¹ 3/3', () => {
    // sin²(π/6) = 0.25; in degrees sin⁻¹(1/2) = arcsin(1/2) = 30 and tan⁻¹(3/3) = tan⁻¹ 1 = 45.
    expect(shown('\\sin^{2}\\frac{\\pi}{6}', 'rad')).toBeCloseTo(0.25, 9)
    expect(shown('\\sin^{-1}\\frac{1}{2}')).toBeCloseTo(30, 9)
    expect(shown('\\arcsin\\frac{1}{2}')).toBeCloseTo(30, 9)
    expect(shown('\\tan^{-1}\\frac{3}{3}')).toBeCloseTo(45, 9)
  })

  it('the fraction is the argument and nothing after it: 2 sin π/6, sin π/6 + 1/2, sin π/6 × 2, sin π/6 cos π/3', () => {
    // 2 × 0.5 = 1; x sin π/6 with x = 2 is 2 × 0.5 = 1; sin(π/6) + 1/2 = 0.5 + 0.5 = 1 (an argument that swallowed
    // the + would be sin(π/6 + 1/2) = 0.8536…); 0.5 × 2 = 1; 0.5 × 0.5 = 0.25.
    expect(shown('2\\sin\\frac{\\pi}{6}', 'rad')).toBeCloseTo(1, 9)
    expect(shown('x\\sin\\frac{\\pi}{6}', 'rad', { x: 2 })).toBeCloseTo(1, 9)
    expect(shown('\\sin\\frac{\\pi}{6}+\\frac{1}{2}', 'rad')).toBeCloseTo(1, 9)
    expect(shown('\\sin\\frac{\\pi}{6}\\times2', 'rad')).toBeCloseTo(1, 9)
    expect(shown('\\sin\\frac{\\pi}{6}\\cos\\frac{\\pi}{3}', 'rad')).toBeCloseTo(0.25, 9)
  })

  it('guards: brackets, a braced group, a letter and a number still hold the argument exactly as before', () => {
    expect(shown('\\sin\\left(\\frac{\\pi}{6}\\right)', 'rad')).toBeCloseTo(0.5, 9)
    expect(shown('\\sin(\\frac{\\pi}{6})', 'rad')).toBeCloseTo(0.5, 9)
    expect(shown('\\sin{\\frac{\\pi}{6}}', 'rad')).toBeCloseTo(0.5, 9)
    // sin{30} = sin 30° = 0.5; sin 30 the same; sin x with x = 2 is sin 2° = 0.034899….
    expect(shown('\\sin{30}')).toBeCloseTo(0.5, 9)
    expect(shown('\\sin 30')).toBeCloseTo(0.5, 9)
    expect(shown('\\sin x', 'deg', { x: 2 })).toBeCloseTo(Math.sin(rad(2)), 9)
    expect(latexToMath('\\sin x')).toBe('sin(x)')
    expect(latexToMath('\\sin 2x')).toBe('sin(2x)')
    expect(latexToMath('\\sin 30^{\\circ}')).toBe('sin(30°)')
  })

  it('the line the engines read has no empty call, and is the very text the typed brackets give', () => {
    const pairs: [string, string][] = [
      ['\\sin\\frac{\\pi}{6}', '\\sin\\left(\\frac{\\pi}{6}\\right)'],
      ['\\cos\\dfrac{\\pi}{3}', '\\cos\\left(\\dfrac{\\pi}{3}\\right)'],
      ['\\tan\\tfrac{\\pi}{4}', '\\tan\\left(\\tfrac{\\pi}{4}\\right)'],
      ['\\ln\\frac{e^{2}}{e}', '\\ln\\left(\\frac{e^{2}}{e}\\right)'],
      ['\\log_{2}\\frac{16}{2}', '\\log_{2}\\left(\\frac{16}{2}\\right)'],
      ['\\sin^{-1}\\frac{1}{2}', '\\sin^{-1}\\left(\\frac{1}{2}\\right)'],
      ['\\ln\\sqrt{x}', '\\ln\\left(\\sqrt{x}\\right)'],
      ['\\cos\\sqrt[3]{8}', '\\cos\\left(\\sqrt[3]{8}\\right)'],
      // d/dx reads its body through the same argument reader: it came out as "diff(, x)((1)/(x))".
      ['\\frac{d}{dx}\\frac{1}{x}', '\\frac{d}{dx}\\left(\\frac{1}{x}\\right)'],
      ['\\frac{d}{dx}\\sqrt{x}', '\\frac{d}{dx}\\left(\\sqrt{x}\\right)']
    ]
    for (const [typed, bracketed] of pairs) {
      expect(latexToMath(typed), typed).toBe(latexToMath(bracketed))
      expect(latexToMath(typed), typed).not.toContain('()')
    }
    expect(latexToMath('\\sin\\frac{\\pi}{6}')).toBe('sin(((π)/(6)))')
    expect(latexToMath('\\ln\\sqrt{x}')).toBe('ln(sqrt(x))')
    expect(latexToMath('\\frac{d}{dx}\\frac{1}{x}')).toBe('diff(((1)/(x)), x)')
    // The half-angle line the Working field was given: both fractions belong to their functions.
    expect(latexToMath('-2\\cos\\frac{3x}{2}\\sin\\frac{x}{2}')).toBe('-2cos(((3x)/(2)))sin(((x)/(2)))')
  })

  it('the Working field takes the half-angle identity typed with fractions', () => {
    // sin x − sin 2x = −2 cos(3x/2) sin(x/2), typed as the names and then "/" with no bracket. It reached Working
    // as cos()((3x)/(2))sin()((x)/(2)), Auto chose Solve and answered '"sin" is not something I can factorise'.
    usePure.getState().runLatex('\\sin x-\\sin2x=-2\\cos\\frac{3x}{2}\\sin\\frac{x}{2}', 'auto')
    expect(usePure.getState().job).toBe('trigidentity')
    expect(usePure.getState().working?.error).toBeUndefined()
    expect(usePure.getState().working?.answers[0]?.label).toBe('Proved')
  })

  it('an unfinished fraction or root after a function name is refused, never answered', () => {
    expect(shown('\\sin\\frac{1}{}', 'rad')).toMatch(/^refused: /)
    expect(shown('\\sin\\frac{}{2}', 'rad')).toMatch(/^refused: /)
    expect(shown('\\sin\\frac{\\placeholder{}}{\\placeholder{}}', 'rad')).toMatch(/^refused: /)
    expect(shown('\\ln\\sqrt{}')).toMatch(/^refused: /)
    // A name with nothing at all after it was always refused and still is.
    expect(shown('\\sin')).toMatch(/^refused: /)
  })
})

describe('af-pl — latexToMath reads powers, functions, sums and subscripts as written', () => {
  describe('P-PARSE PL: an unbraced sign in a power', () => {
    it('reads 10^-3, 2^-12 and 10^+2 as one power', () => {
      expect(latexToMath('10^-3')).toBe('10^(-3)')
      expect(latexToMath('2^-12')).toBe('2^(-12)')
      expect(latexToMath('10^+2')).toBe('10^(+2)')
    })
  })

  describe('P-PARSE PL: a bare function takes Greek, degrees and factorial in its argument', () => {
    it('reads \\sin\\mu, \\sin 30° and \\sin x! as complete arguments', () => {
      expect(latexToMath('\\sin\\mu')).toBe('sin(μ)')
      expect(latexToMath('\\sin 30°')).toBe('sin(30°)')
      expect(latexToMath('\\sin x!')).toBe('sin(x!)')
    })
  })

  describe('P-PARSE PL: d/dx takes the whole body', () => {
    it('reads x^2 after d/dx as the body', () => {
      expect(latexToMath('\\frac{d}{dx} x^2')).toBe('diff(x^(2), x)')
    })
  })

  describe('P-PARSE PL: d/dθ reads a Greek denominator', () => {
    it('reads d/dθ of a bracketed sine with respect to θ', () => {
      expect(latexToMath('\\frac{d}{d\\theta}\\left(\\sin\\theta\\right)')).toBe('diff(sin(θ), θ)')
    })
  })

  describe('P-PARSE PL: an integral’s differential may be a Greek letter', () => {
    it('reads ∫ sinθ dθ as an integral in θ, not as sin(θ)·d·θ in x', () => {
      // The differential was only ever read when a Latin letter followed the d, so a Greek one stayed in the body
      // and the letter fell back to x: ∫ sinθ dθ reached the engine as integrate(sin(θ) dθ, x) and it answered
      // θ·d·x·sin θ. The working agreed with that, so a wrong answer was shown ticked.
      expect(latexToMath('\\int\\sin\\theta\\,d\\theta')).toBe('integrate(sin(θ), θ)')
      expect(latexToMath('\\int\\cos\\theta\\,d\\theta')).toBe('integrate(cos(θ), θ)')
      expect(latexToMath('\\int 2\\theta\\,d\\theta')).toBe('integrate(2θ, θ)')
      // A Latin differential and a definite integral read as they always did.
      expect(latexToMath('\\int x^{2}\\,dx')).toBe('integrate(x^(2), x)')
      expect(latexToMath('\\int_{0}^{2}x\\,dx')).toBe('integral(x, 0, 2)')
    })
  })

  describe('P-PARSE PL: \\operatorname{atan} after a name is a product', () => {
    it('reads x\\operatorname{atan}{x} as x·atan(x), not the one name xatan', () => {
      // The engine's plain LaTeX writes an inverse function with \operatorname and its text comes out the way
      // \sin's does, so a name in front was glued on: the integral check could not read xatan and left x·atan x
      // unchecked although the card and the working agreed.
      expect(latexToMath('x\\operatorname{atan}{\\left(x \\right)}')).toBe('x*atan((x))')
      expect(latexToMath('3\\operatorname{asinh}{\\left(x \\right)}')).toBe('3asinh((x))')
      expect(latexToMath('- \\operatorname{atan}{\\left(x \\right)}')).toBe('-atan((x))')
    })
  })

  describe('P-PARSE PL: standalone angle brackets', () => {
    it('reads \\langle and \\rangle as vector brackets', () => {
      expect(latexToMath('\\langle 1, 2 \\rangle')).toBe('<1,2>')
    })
  })

  describe('P-PARSE PL: sigma/prod stop at a relation and read an uppercase index', () => {
    it('does not swallow the equals sign after a sum, and reads an uppercase limit variable', () => {
      expect(latexToMath('\\sum_{x=1}^{n} f = 5')).toBe('sigma(f, 1, n)=5')
      expect(latexToMath('\\sum_{N=1}^{3} 2')).toBe('sigma(2, 1, 3)')
    })
    it('does not swallow a comparison after a product', () => {
      expect(latexToMath('\\prod_{n=1}^{3} 7 < 10')).toBe('product(7, 1, 3)<10')
    })
  })

  describe('P-PARSE PL: a non-alphanumeric subscript keeps its brackets', () => {
    it('reads a_{n+1} as one subscript', () => {
      expect(latexToMath('a_{n+1}')).toBe('a_(n+1)')
    })
  })

  describe('d/dx before a function name (part head check)', () => {
    it('reads the function as the body, not as something after an empty diff', () => {
      expect(latexToMath('\\frac{d}{dx}\\sin x')).toBe('diff(sin(x), x)')
      expect(latexToMath('\\frac{d}{d\\theta}\\cos\\theta')).toBe('diff(cos(θ), θ)')
    })
  })
})

describe('fixb-f1-sumStatement — a typed sum with = is a statement to check, not an equation to solve', () => {
  // F1 diagnostic (runs red on today's code, green after the fix in the findings note).
  //
  // The bug: on the Maths screen, typing with the keypad Σ for n = 1 to 5 of n² = 55 answers
  // "x = 2 / L − R = 0" with no true mark. The sum's index letter is rewritten to x in linear form
  // (latexToMath), so isEquationInX treats the line as "solve for x"; the residual is identically 0
  // (the sum is a constant), so the numeric search returns its own starting guess — the stored x —
  // as if it were a root. Expected: the statement is checked and marked true.
  //
  // Run with: npx vitest run --config _findings/vitest.findings.config.ts _findings/tests/f1-sumStatement.test.ts

  const opts = (x: number) => ({ vars: { x }, ans: 0, angle: 'deg' as const })

  describe('F1: a sum with = is a statement to check, not an equation to solve', () => {
    it('the keypad form of Σ n² from 1 to 5 = 55 is marked true', () => {
      const latex = '\\sum_{n=1}^{5}n^{2}=55'
      expect(latexToMath(latex)).toBe('sigma(x^(2), 1, 5)=55')
      const r = evaluateInput('COMP', latex, opts(2))!
      expect(r.error).toBeUndefined()
      expect(r.main).toBe('true')
      expect(r.extra).toEqual(['L − R = 0'])
      // Nothing numeric to keep: Ans and the stored x stay what they were.
      expect(r.value).toBeUndefined()
      expect(r.solved).toBe(false)
    })

    it('the linear form of the same line is marked true too', () => {
      const r = evaluateInput('COMP', 'sigma(x^2,1,5)=55', opts(2))!
      expect(r.error).toBeUndefined()
      expect(r.main).toBe('true')
    })

    it('solving and refusals around it are untouched', () => {
      // A statement that does not hold is marked false, with how far apart the sides are — not "give x a value".
      const f = evaluateInput('COMP', '\\sum_{x=1}^{3}x=5', opts(0))!
      expect(f.main).toBe('false')
      expect(f.extra).toEqual(['L − R = 1'])
      expect(f.solved).toBe(false)
      // An x outside the sum is still solved for.
      expect(evaluateInput('COMP', 'x+sigma(x,1,100)=5100', opts(0))!.main).toBe('x = 50')
      // A constant statement with no x at all keeps its sentence.
      expect(evaluateInput('COMP', '5=5', opts(0))!.error?.sentence).toBe('Equations are solved in Numbers mode: type both sides with = and press x = ?')
    })

    it('an x in the limits of a sum or an integral is the line\'s own x, still solved for (wave-head review)', () => {
      expect(hasFreeX('sigma(x^2, 1, 5)')).toBe(false)
      expect(hasFreeX('sigma(x^2, 1, x)')).toBe(true)
      expect(hasFreeX('integrate(t, t, 0, x)')).toBe(true)
      expect(hasFreeX('integrate(x, x, 0, 2)')).toBe(false)
      expect(hasFreeX('integral(x^2, 0, x)')).toBe(true)
    })

    it('"holds" is relative to the size of the sides: a large true sum is still marked true (wave-head review)', () => {
      // 1² + … + 100000² = 333338333350000; the float sum carries rounding far above 10⁻¹⁴.
      const r = evaluateInput('COMP', 'sigma(x^2,1,100000)=333338333350000', opts(2))!
      expect(r.main).toBe('true')
      // Wrong by one part in a billion is wrong.
      expect(evaluateInput('COMP', 'sigma(x^2,1,100000)=333338333000000', opts(2))!.main).not.toBe('true')
      expect(evaluateInput('COMP', 'sigma(1/x^2,1,100000)=1.6449240668982262', opts(2))!.main).toBe('true')
    })
  })

  describe('F1 review: no absolute floor on "holds"', () => {
    it('tiny sides are compared by their own size', () => {
      expect(evaluateInput('COMP', 'integral(1.6e-19*x,0,1)=1e-19', opts(0))!.main).toBe('false') // 8×10⁻²⁰ ≠ 10⁻¹⁹
      expect(evaluateInput('COMP', 'sigma(1e-20*x,1,3)=5e-20', opts(0))!.main).toBe('false') // 6×10⁻²⁰ ≠ 5×10⁻²⁰
      expect(evaluateInput('COMP', 'sigma(1e-20*x,1,3)=6e-20', opts(0))!.main).toBe('true')
      expect(evaluateInput('COMP', 'sigma(0*x,1,3)=0', opts(0))!.main).toBe('true') // both exactly 0
    })
  })
})

describe('fixb-f9-space-after-function — a space after a function name reads as the function of what follows', () => {
  // F9 review: the maths field now keeps a typed space as \; — after a function's name that space must
  // still read as "the function of what follows" (sin 30 = 0.5), on the Maths screen and a vector card.

  const opts = { vars: {}, ans: 0, angle: 'deg' as const }

  describe('a space after a function name', () => {
    it('reads as the function of what follows', () => {
      expect(latexToMath('\\sin\\;30')).toBe(latexToMath('\\sin 30'))
      expect(latexToMath('\\cos\\,60')).toBe(latexToMath('\\cos 60'))
      expect(latexToMath('\\ln\\;\\;2')).toBe(latexToMath('\\ln 2'))
      expect(latexToMath('\\sin^{2}\\;x')).toBe(latexToMath('\\sin^{2}x'))
      // After a log's base, and before d/dx's body (second checker pass).
      expect(latexToMath('\\log_{2}\\;8')).toBe(latexToMath('\\log_{2}8'))
      expect(latexToMath('\\frac{d}{dx}\\;x^{2}')).toBe(latexToMath('\\frac{d}{dx}x^{2}'))
    })

    it('log₂ 8 = 3 with a typed space after the base', () => {
      expect(evaluateInput('COMP', '\\log_{2}\\;8', opts)!.main).toBe('3')
    })

    it('gives the answer on the Maths screen: sin 30 = 0.5', () => {
      expect(evaluateInput('COMP', '\\sin\\;30', opts)!.main).toBe('0.5')
    })

    it('keeps the spaces that separate words: 10 N m ∠ 30°', () => {
      expect(latexToMath('10\\;N\\;m\\angle30^{\\circ}')).toMatch(/10 N m/)
    })
  })
})

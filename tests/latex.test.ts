import { describe, expect, it } from 'vitest'
import { latexToMath } from '../src/renderer/src/math/latexToMath'
import { evaluateComp } from '../src/renderer/src/calc/engine'
import { math, preprocess, setAngleMode, toV3 } from '../src/renderer/src/math/expr'

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
    // Calculus follows the angle mode, as on the real calculator: in RAD this is the familiar 2,
    // and in DEG the limits are 0 to 3.14 degrees, which is a thin sliver of the same curve.
    expect(calc('\\int_{0}^{\\pi}\\sin x\\,dx', 'rad')).toBeCloseTo(2, 6)
    expect(calc('\\int_{0}^{\\pi}\\sin x\\,dx', 'deg')).toBeCloseTo(0.0861, 4)
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
})

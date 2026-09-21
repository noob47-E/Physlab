import { beforeEach, describe, expect, it } from 'vitest'
import { directionAngles, toDeg } from '../src/renderer/src/math/vec'
import { compileScalar, inferKind, math, preprocess, setAngleMode, symbolsOf, toV3 } from '../src/renderer/src/math/expr'
import { resetGlobals } from './helpers/globals'

beforeEach(resetGlobals)

describe('preprocess', () => {
  it('turns tuples into points but leaves calls alone', () => {
    expect(preprocess('A = (3, 4)')).toBe('A = pt(3, 4)')
    expect(preprocess('f(1, 2)')).toBe('f(1, 2)')
    expect(preprocess('(cos(t), sin(t))')).toBe('pt(cos(t), sin(t))')
  })
  it('rewrites cross, dot, magnitude and polar notation', () => {
    // × dispatches on what is on either side: a cross product here, multiplication between numbers.
    expect(preprocess('A × B')).toBe('timesOrCross(A, B)')
    expect(preprocess('A · (B + C)')).toBe('dot(A, (B + C))')
    expect(preprocess('|A + B|')).toBe('mag(A + B)')
    expect(preprocess('10 ∠ 30°')).toBe('polarVec(10, 30 deg)')
    expect(preprocess('10 N at 30°')).toBe('polarVec(10 N, 30 deg)')
    expect(preprocess('<3, 4>')).toBe('vec(3, 4)')
  })
})

describe('mathjs helpers', () => {
  it('evaluates vector expressions', () => {
    setAngleMode('deg')
    const scope = { A: [3, 4, 0], B: [1, -2, 0], i: [1, 0, 0], j: [0, 1, 0], k: [0, 0, 1] }
    expect(toV3(math.evaluate(preprocess('A + B'), scope))).toEqual([4, 2, 0])
    expect(math.evaluate(preprocess('|A|'), scope)).toBeCloseTo(5)
    expect(math.evaluate(preprocess('A · B'), scope)).toBeCloseTo(-5)
    expect(toV3(math.evaluate(preprocess('3i + 4j'), scope))).toEqual([3, 4, 0])
    const p = toV3(math.evaluate(preprocess('10 ∠ 30°'), scope))
    expect(p[0]).toBeCloseTo(8.660254)
    expect(p[1]).toBeCloseTo(5)
    expect(math.evaluate('sin(30)')).toBeCloseTo(0.5)
    expect(math.evaluate('log(100)')).toBeCloseTo(2)
    expect(math.evaluate('log(2, 8)')).toBeCloseTo(3)
  })
  it('infers kinds', () => {
    const kinds: Record<string, 'point' | 'vector'> = { P: 'point', Q: 'point', A: 'vector' }
    const k = (s: string) => inferKind(math.parse(preprocess(s)), (n) => kinds[n])
    expect(k('P - Q')).toBe('vector')
    expect(k('P + A')).toBe('point')
    expect(k('2A')).toBe('vector')
    expect(k('A · A')).toBe('number')
    expect(k('(1, 2)')).toBe('point')
    expect(symbolsOf(math.parse('A + B * sin(x)')).sort()).toEqual(['A', 'B', 'x'])
  })
  it('compiles scalar functions', () => {
    const f = compileScalar('k * sin(x) + x^2', ['x'], () => ({ k: 2 }))
    expect(f({ x: Math.PI / 2 })).toBeCloseTo(2 + (Math.PI / 2) ** 2)
  })
})


describe('direction angles', () => {
  it('never returns NaN for axis-aligned vectors', () => {
    for (const v of [[1, 0, 0], [0, -2, 0], [0, 0, 3], [-1, 0, 0]] as [number, number, number][]) {
      const angs = directionAngles(v).map(toDeg)
      expect(angs.every(Number.isFinite)).toBe(true)
    }
    expect(directionAngles([1, 0, 0]).map(toDeg)).toEqual([0, 90, 90])
  })
})

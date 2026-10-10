// The SymPy adapter's spelling both ways (math/engine/sympy/spelling.ts). No golden sweep covers it:
// the `cas` sweep reads the worker's raw replies and the bar sweep stands in for the engine.

import { describe, expect, it } from 'vitest'
import { fromSymPyText, toSymPy } from '../../src/renderer/src/math/engine/sympy/spelling'

describe('the SymPy adapter spells a request for Python', () => {
  it('lambda as lamda, infinity as oo, and nothing else', () => {
    expect(toSymPy('lambda*x + lambda')).toBe('lamda*x + lamda')
    expect(toSymPy('e^(-x), Infinity, -∞')).toBe('e^(-x), oo, -oo')
    expect(toSymPy('lambdas + Infinityx + 2*x^2')).toBe('lambdas + Infinityx + 2*x^2')
  })
})

describe("an answer's plain form comes back in PhysLab's spelling", () => {
  it.each([
    ['x**2 - 1', 'x^2 - 1'],
    ['-x**2', '-x^2'],
    ['E**x', 'e^x'],
    ['exp(x)*E', 'exp(x)*e'],
    ['2*I', '2*i'],
    ['oo', 'Infinity'],
    ['-oo', '-Infinity'],
    ['zoo', 'NaN'],
    ['lamda**2', 'lambda^2'],
    ['log(x) + log(x + 1)', 'ln(x) + ln(x + 1)']
  ])('%s → %s', (sympy, physlab) => {
    expect(fromSymPyText(sympy)).toBe(physlab)
  })

  it('leaves names that only contain those letters alone', () => {
    expect(fromSymPyText('Ei(x) + E_1')).toBe('Ei(x) + E_1')
    expect(fromSymPyText('Integral(x**x, x)')).toBe('Integral(x^x, x)')
    expect(fromSymPyText('polylog(2, x) + loggamma(x)')).toBe('polylog(2, x) + loggamma(x)')
    expect(fromSymPyText('cos(x)/x')).toBe('cos(x)/x')
  })
})

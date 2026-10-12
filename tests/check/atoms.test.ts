// G2B: exact equality for answers with elementary functions (math/check/atoms.ts). Right derivatives in many written
// forms are 'equal'; perturbed wrong ones never are; identities that need more than atoms (sin² + cos² = 1) stay
// 'unknown'; domains follow G00; and every exact rewrite the reader makes is proved here by a case of its own.

import { describe, expect, it } from 'vitest'
import { atomDerivative } from '../../src/renderer/src/math/check/atoms'
import { derivativeCheck, elementaryEqual, expressionEqual, integralCheck, type ElementaryResult } from '../../src/renderer/src/math/check/checkers'
import { readMaths } from '../../src/renderer/src/math/check/parse'

type V = 'equal' | 'different' | 'unknown'

/** f, and right ways to write f′. */
const RIGHT: [string, string[]][] = [
  ['sin(x)', ['cos(x)']],
  ['cos(x)', ['-sin(x)', '(-1)*sin(x)']],
  ['e^x', ['e^x', 'exp(x)']],
  ['exp(x)', ['e^x']],
  ['ln(x)', ['1/x', 'x^(-1)']],
  ['sqrt(x)', ['1/(2sqrt(x))', '1/2*x^(-1/2)', 'sqrt(x)/(2x)', '0.5/x^(1/2)']],
  ['tan(x)', ['1 + tan(x)^2', '(sin(x)^2 + cos(x)^2)/cos(x)^2', '1 + sin(x)^2/cos(x)^2']],
  ['atan(x)', ['1/(1 + x^2)', '(x^2 + 1)^(-1)']],
  ['asin(x)', ['1/sqrt(1 - x^2)', '(1 - x^2)^(-1/2)']],
  ['acos(x)', ['-1/sqrt(1 - x^2)']],
  ['sinh(x)', ['cosh(x)', '(e^x + e^(-x))/2']],
  ['cosh(x)', ['sinh(x)', '(exp(x) - exp(-x))/2']],
  ['tanh(x)', ['1/cosh(x)^2', '1 - tanh(x)^2', 'sech(x)^2']],
  ['log(x)', ['1/(x ln(10))', '1/(ln(10)*x)', '(1/ln(10))/x']],
  ['x^3 sin(x)', ['3x^2 sin(x) + x^3 cos(x)', 'x^2(3sin(x) + x cos(x))']],
  ['x e^x', ['e^x + x e^x', '(1 + x)e^x', 'e^x (x + 1)']],
  ['x ln(x)', ['ln(x) + 1', '1 + ln(x)', 'ln(x) + x/x']],
  ['e^x sin(x)', ['e^x (sin(x) + cos(x))', 'e^x sin(x) + e^x cos(x)']],
  ['sin(x) cos(x)', ['cos(x)^2 - sin(x)^2', 'cos(x)cos(x) - sin(x)sin(x)']],
  ['sin(x)/x', ['(x cos(x) - sin(x))/x^2', 'cos(x)/x - sin(x)/x^2']],
  ['e^x/x', ['e^x (x - 1)/x^2', 'e^x/x - e^x/x^2']],
  ['ln(x)/x', ['(1 - ln(x))/x^2', '1/x^2 - ln(x)/x^2']],
  ['sin(2x)', ['2cos(2x)', '2*cos(x*2)']],
  ['cos(3x + 1)', ['-3sin(3x + 1)', '-3sin(1 + 3x)']],
  ['e^(2x)', ['2e^(2x)', '2exp(2x)', '2(e^x)^2', '2e^x e^x']],
  ['e^(-x^2)', ['-2x e^(-x^2)', '-2x/e^(x^2)']],
  ['ln(x^2 + 1)', ['2x/(x^2 + 1)', '2x (x^2 + 1)^(-1)']],
  ['sqrt(x^2 + 1)', ['x/sqrt(x^2 + 1)', 'x (x^2 + 1)^(-1/2)', 'x sqrt(x^2 + 1)/(x^2 + 1)']],
  ['sin(x^2)', ['2x cos(x^2)', 'cos(x^2)*2x']],
  ['cos(x)^2', ['-2sin(x)cos(x)', '-2cos(x)sin(x)']],
  ['sin(x)^3', ['3sin(x)^2 cos(x)']],
  ['tan(2x)', ['2(1 + tan(2x)^2)', '2 + 2tan(2x)^2']],
  ['atan(x^2)', ['2x/(1 + x^4)']],
  ['ln(sin(x))', ['cos(x)/sin(x)', 'cot(x)', 'csc(x)*cos(x)']],
  ['ln(cos(x))', ['-tan(x)', '-sin(x)/cos(x)']],
  ['e^(sin(x))', ['cos(x) e^(sin(x))', 'exp(sin(x))cos(x)']],
  ['sin(e^x)', ['e^x cos(e^x)']],
  ['sqrt(sin(x))', ['cos(x)/(2sqrt(sin(x)))', 'cos(x) sqrt(sin(x))/(2sin(x))']],
  ['ln(ln(x))', ['1/(x ln(x))']],
  ['e^(e^x)', ['e^(x + e^x)', 'e^x e^(e^x)']],
  ['sin(cos(x))', ['-sin(x) cos(cos(x))']],
  ['cos(sin(x^2))', ['-2x cos(x^2) sin(sin(x^2))']],
  ['e^(sin(2x))', ['2cos(2x) e^(sin(2x))']],
  ['ln(1 + e^x)', ['e^x/(1 + e^x)', '1/(1 + e^(-x))']],
  ['sqrt(1 + e^(2x))', ['e^(2x)/sqrt(1 + e^(2x))']],
  ['x^2 e^(-x)', ['(2x - x^2)e^(-x)', '2x e^(-x) - x^2 e^(-x)', 'x(2 - x)/e^x']],
  ['x sin(x) cos(x)', ['sin(x)cos(x) + x cos(x)^2 - x sin(x)^2']],
  ['(x^2 + 1) atan(x)', ['2x atan(x) + 1']],
  ['x asin(x)', ['asin(x) + x/sqrt(1 - x^2)']],
  ['e^x/(1 + e^x)', ['e^x/(1 + e^x)^2', 'e^x/(1 + 2e^x + e^(2x))']],
  ['sin(x)/(1 + cos(x))', ['(cos(x) + cos(x)^2 + sin(x)^2)/(1 + cos(x))^2']],
  ['ln(x^2)', ['2/x', '2x/x^2']],
  ['ln(|x|)', ['1/x']],
  ['sqrt(x) ln(x)', ['ln(x)/(2sqrt(x)) + 1/sqrt(x)', '(ln(x) + 2)/(2sqrt(x))']],
  ['x^(3/2)', ['(3/2)sqrt(x)', '1.5x^(1/2)', '3x/(2sqrt(x))']],
  ['x^(4/3)', ['(4/3)cbrt(x)', '4cbrt(x)/3', '(4/3)x^(1/3)']],
  ['cbrt(x^2 + 1)', ['2x/(3cbrt((x^2 + 1)^2))', '(2/3)x (x^2 + 1)^(-2/3)']],
  ['(sin(x) + cos(x))^2', ['2(sin(x) + cos(x))(cos(x) - sin(x))', '2cos(x)^2 - 2sin(x)^2']],
  ['1/sin(x)', ['-cos(x)/sin(x)^2', '-csc(x) cot(x)']],
  ['sec(x)', ['sec(x) tan(x)', 'sin(x)/cos(x)^2']],
  ['csc(x)', ['-csc(x) cot(x)']],
  ['cot(x)', ['-1 - cot(x)^2', '-(sin(x)^2 + cos(x)^2)/sin(x)^2']],
  ['e^(3x) sin(2x)', ['e^(3x)(3sin(2x) + 2cos(2x))']],
  ['ln(x + sqrt(x^2 + 1))', ['1/sqrt(x^2 + 1)']],
  ['asinh(x)', ['1/sqrt(x^2 + 1)']],
  ['acosh(x)', ['1/sqrt(x^2 - 1)']],
  ['atanh(x)', ['1/(1 - x^2)']],
  ['x^2 ln(x)', ['2x ln(x) + x', 'x(2ln(x) + 1)']],
  ['ln((x + 1)/(x + 2))', ['1/(x + 1) - 1/(x + 2)', '1/((x + 1)(x + 2))']],
  ['e^x + e^(-x)', ['e^x - e^(-x)', 'e^x - 1/e^x', '(e^(2x) - 1)/e^x']],
  ['x e^(x^2) sin(x)', ['e^(x^2)(sin(x) + 2x^2 sin(x) + x cos(x))']],
  ['sqrt(x^2 + 2x + 5)', ['(x + 1)/sqrt(x^2 + 2x + 5)', '(2x + 2)/(2sqrt(x^2 + 2x + 5))']],
  ['tan(x)^2', ['2tan(x)(1 + tan(x)^2)', '2tan(x) + 2tan(x)^3']],
  ['sqrt(4x)', ['1/sqrt(x)', '2/(2sqrt(x))', 'sqrt(x)/x']],
  ['sqrt(8x^2 + 8)', ['2x sqrt(2)/sqrt(x^2 + 1)', '8x/sqrt(8x^2 + 8)', '4x/sqrt(2x^2 + 2)']],
  ['a sin(b x)', ['a b cos(b x)']],
  ['sin(x)^2', ['2sin(x)cos(x)']],
  ['e^(2ln(x))', ['2e^(2ln(x))/x']],
  ['2^(1/2) x', ['sqrt(2)', '2^(1/2)']],
  ['x√3 + sin(x√2)', ['√3 + √2 cos(√2 x)']],
  ['ln(sqrt(x))', ['1/(2x)']],
  ['(x - 1)e^x', ['x e^x']],
  ['(x^2 - 2x + 2)e^x', ['x^2 e^x']],
  ['sin(x) - x cos(x)', ['x sin(x)']],
  ['(6*10^24) * exp(3*x + 4)', ['18000000000000*10^12*exp(3*x + 4)', '(6 * 10 ^ 24) * (3 * 1 + 0) * exp(3 * x + 4)']],
  ['(1*10^(-19)) * cos(-3*x - 1)', ['(1 * 10 ^ (-19)) * (-3 * 1 - 0) * -sin(-3 * x - 1)', '-3*10^(-19)*sin(3x + 1)']],
  ['exp(sin(-3*x^2 - 4))', ['-6*x*exp(-sin(3*x^2 + 4))*cos(3*x^2 + 4)', '(-3 * 2 * 1 * x ^ (2 - 1) - 0) * cos(-3 * x ^ 2 - 4) * exp(sin(-3 * x ^ 2 - 4))']],
  ['cos(-2*x)', ['-2*sin(2*x)', '-2 * 1 * -sin(-2 * x)']],
  ['(-x) * cos(-x + 4)', ['x*sin(x - 4) - cos(x - 4)', '(-1) * cos(-x + 4) + (-x) * (-1 + 0) * -sin(-x + 4)']],
  ['cos(cos(-x^2 + 4*x - 1))', ['(2*x - 4)*sin(x^2 - 4*x + 1)*sin(cos(x^2 - 4*x + 1))']],
  [
    '(4*x^2 - 2*x - 2) * ln(2*x^2 + 5*x + 7)',
    [
      '2*((4*x - 1)*(2*x^2 + 5*x + 7)*ln(2*x^2 + 5*x + 7) - (4*x + 5)*(-2*x^2 + x + 1))/(2*x^2 + 5*x + 7)',
      '(16*x^3*ln(2*x^2 + 5*x + 7) + 16*x^3 + 36*x^2*ln(2*x^2 + 5*x + 7) + 12*x^2 + 46*x*ln(2*x^2 + 5*x + 7) - 18*x - 14*ln(2*x^2 + 5*x + 7) - 10)/(2*x^2 + 5*x + 7)'
    ]
  ],
  [
    '(4*x^3 + 2*x^2 - 5*x - 6) * exp(-4*x^2 - 5*x + 5)',
    [
      '(-32*x^4 - 36*x^3 + 42*x^2 + 77*x + 25)*exp(-4*x^2 - 5*x + 5)',
      '-32*x^4*exp(-4*x^2 - 5*x + 5) - 36*x^3*exp(-4*x^2 - 5*x + 5) + 42*x^2*exp(-4*x^2 - 5*x + 5) + 77*x*exp(-4*x^2 - 5*x + 5) + 25*exp(-4*x^2 - 5*x + 5)'
    ]
  ],
  ['(x^2 + 3*x + 3)^(3/2)', ['(3/2)*(2*x + 3)*sqrt(x^2 + 3*x + 3)', '(3 / 2) * (2 * 1 * x ^ (2 - 1) + 3 * 1 + 0) * (x ^ 2 + 3 * x + 3) ^ ((3 / 2) - 1)', '(6*x + 9)*sqrt(x^2 + 3*x + 3)/2']],
  ['(5*x^3 - 4*x^2 + 2) * sqrt(x^2 + x + 4)', ['(15*x^2 - 8*x)*sqrt(x^2 + x + 4) + (5*x^3 - 4*x^2 + 2)*(2*x + 1)/(2*sqrt(x^2 + x + 4))']],
  // A divisor positive by its written shape (1 + u², e^u + 2, √u + 1) records no condition, even with a function in u.
  ['atan(x^3 + atan(x))', ['(3x^2 + 1/(1 + x^2))/(1 + (x^3 + atan(x))^2)']],
  ['asin(sin(x)/(sin(x)^2 + 2))', ['((cos(x)(sin(x)^2 + 2) - 2sin(x)^2 cos(x))/(sin(x)^2 + 2)^2)/sqrt(1 - (sin(x)/(sin(x)^2 + 2))^2)']],
  ['(-1/(5*10^18)) * exp(-6*x^2 + 3*x - 2)', ['3*(4*x - 1)*exp(-6*x^2 + 3*x - 2)/5000000000000000000', '(12*x*exp(-6*x^2 + 3*x - 2) - 3*exp(-6*x^2 + 3*x - 2))/(5*10^18)']]
]

/** f, a wrong f′, and what was done to it. */
const WRONG: [string, string, string][] = [
  ['sin(2x)', 'cos(2x)', 'chain'],
  ['sin(x^2)', 'cos(x^2)', 'chain'],
  ['e^(3x)', 'e^(3x)', 'chain'],
  ['e^(-x^2)', 'e^(-x^2)', 'chain'],
  ['ln(x^2 + 1)', '1/(x^2 + 1)', 'chain'],
  ['sqrt(x^2 + 1)', '1/(2sqrt(x^2 + 1))', 'chain'],
  ['cos(sin(x))', '-sin(sin(x))', 'chain'],
  ['tan(3x)', '1 + tan(3x)^2', 'chain'],
  ['atan(2x)', '1/(1 + 4x^2)', 'chain'],
  ['e^(sin(x))', 'e^(sin(x))', 'chain'],
  ['asin(2x)', '1/sqrt(1 - 4x^2)', 'chain'],
  ['sin(e^x)', 'cos(e^x)', 'chain'],
  ['sin(x)', '-cos(x)', 'sign'],
  ['cos(x)', 'sin(x)', 'sign'],
  ['e^(-x)', 'e^(-x)', 'sign'],
  ['x e^x', 'e^x - x e^x', 'sign'],
  ['sin(x)/x', '(x cos(x) + sin(x))/x^2', 'sign'],
  ['ln(cos(x))', 'tan(x)', 'sign'],
  ['x sin(x)', 'sin(x) - x cos(x)', 'sign'],
  ['acos(x)', '1/sqrt(1 - x^2)', 'sign'],
  ['cos(x)^2', '2sin(x)cos(x)', 'sign'],
  ['1/sin(x)', 'cos(x)/sin(x)^2', 'sign'],
  ['sin(x)', 'sin(x)', 'sincos'],
  ['cos(x)', '-cos(x)', 'sincos'],
  ['x sin(x)', 'cos(x) + x sin(x)', 'sincos'],
  ['sin(x^2)', '2x sin(x^2)', 'sincos'],
  ['e^x cos(x)', 'e^x (cos(x) - cos(x))', 'sincos'],
  ['sin(x)cos(x)', 'sin(x)^2 - cos(x)^2', 'sincos'],
  ['cos(3x)', '-3cos(3x)', 'sincos'],
  ['sin(cos(x))', '-cos(x)cos(cos(x))', 'sincos'],
  ['sin(2x)', '3cos(2x)', 'coefficient'],
  ['e^(2x)', 'e^(2x)*3', 'coefficient'],
  ['x^3 sin(x)', '2x^2 sin(x) + x^3 cos(x)', 'coefficient'],
  ['ln(x^2 + 1)', '3x/(x^2 + 1)', 'coefficient'],
  ['sqrt(x)', '1/(3sqrt(x))', 'coefficient'],
  ['x^(3/2)', '(1/2)sqrt(x)', 'coefficient'],
  ['sin(x)^3', '2sin(x)^2 cos(x)', 'coefficient'],
  ['e^(x^2)', '3x e^(x^2)', 'coefficient'],
  ['tan(x)', '2 + tan(x)^2', 'coefficient'],
  ['atan(x)', '1/(2 + x^2)', 'coefficient'],
  ['ln(x)', '1/(x + 1)', 'coefficient'],
  ['x e^x', 'x e^x', 'term'],
  ['x e^x', 'e^x', 'term'],
  ['x ln(x)', 'ln(x)', 'term'],
  ['x ln(x)', '1', 'term'],
  ['e^x sin(x)', 'e^x cos(x)', 'term'],
  ['sin(x) cos(x)', 'cos(x)^2', 'term'],
  ['x^2 sin(x) + e^x', '2x sin(x) + x^2 cos(x)', 'term'],
  ['sin(x)/x', 'cos(x)/x', 'term'],
  ['(x^2 + 1) atan(x)', '2x atan(x)', 'term'],
  ['x asin(x)', 'asin(x)', 'term'],
  ['ln(x)', 'x', 'lnFlip'],
  ['ln(x^2 + 1)', '(x^2 + 1)/(2x)', 'lnFlip'],
  ['ln(sin(x))', 'sin(x)/cos(x)', 'lnFlip'],
  ['ln(cos(x))', '-cos(x)/sin(x)', 'lnFlip'],
  ['ln(e^x + 1)', '(e^x + 1)/e^x', 'lnFlip'],
  ['ln(x^3 + x)', '(x^3 + x)/(3x^2 + 1)', 'lnFlip'],
  ['ln(2x + 1)', '(2x + 1)/2', 'lnFlip'],
  ['ln(sqrt(x))', 'sqrt(x)', 'lnFlip'],
  ['ln(ln(x))', 'x ln(x)', 'lnFlip'],
  ['ln(x)', 'ln(x)', 'other'],
  ['e^x', 'x e^(x - 1)', 'other'],
  ['x^x', 'x x^(x - 1)', 'other'],
  ['tan(x)', 'sec(x)', 'other'],
  ['log(x)', '1/x', 'other'],
  ['ln(x)', '1/(x ln(10))', 'other'],
  ['sqrt(x^2)', '1', 'other'],
  ['|x|', '1', 'other'],
  ['ln(|x|)', '1/|x|', 'other'],
  ['sinh(x)', 'cosh(x) + 1', 'other'],
  ['acosh(x)', '1/sqrt(x^2 + 1)', 'other'],
  ['asinh(x)', '1/sqrt(x^2 - 1)', 'other'],
  ['atanh(x)', '1/(1 + x^2)', 'other'],
  ['x^2', '2x + ln(x) - ln(x)', 'domain'],
  ['x^2', '2x + sqrt(-1 - x^2) - sqrt(-1 - x^2)', 'domain'],
  ['sin(x)', 'cos(x) + 0*sqrt(-x)', 'domain'],
  ['(6*10^24) * exp(3*x + 4)', '18000000000000000*10^9*exp(3*x + 4) + 1', 'coefficient'],
  ['(1*10^(-19)) * cos(-3*x - 1)', '3*10^(-19)*sin(3x + 1)', 'sign'],
  ['cos(-2*x)', '2*sin(2*x)', 'sign'],
  ['exp(sin(-3*x^2 - 4))', '-6*x*exp(sin(3*x^2 + 4))*cos(3*x^2 + 4)', 'sign']
]

describe('right derivatives in many written forms are equal', () => {
  const cases = RIGHT.flatMap(([f, gs]) => gs.map((g): [string, string] => [f, g]))
  it('there are at least 150 of them', () => expect(cases.length).toBeGreaterThanOrEqual(150))
  it.each(cases)('d/dx %s = %s', (f, g) => expect(derivativeCheck(f, 'x', g)).toBe('equal'))
})

describe('wrong derivatives are never equal', () => {
  it.each(WRONG)('d/dx %s ≠ %s (%s)', (f, g) => expect(derivativeCheck(f, 'x', g)).not.toBe('equal'))
  it('each kind of slip is there', () => {
    for (const kind of ['chain', 'sign', 'sincos', 'coefficient', 'term', 'lnFlip']) expect(WRONG.filter((w) => w[2] === kind).length).toBeGreaterThanOrEqual(8)
  })
})

describe('identities that need more than atoms stay unknown, never different', () => {
  const cases: [string, string][] = [
    ['sin(x)^2 + cos(x)^2', '1'],
    ['sin(2x)', '2sin(x)cos(x)'],
    ['cos(2x)', '1 - 2sin(x)^2'],
    ['cos(2x)', 'cos(x)^2 - sin(x)^2'],
    ['sin(x + 1)', 'sin(x)cos(1) + cos(x)sin(1)'],
    ['tan(x)^2 + 1', '1/cos(x)^2'],
    ['ln(2x)', 'ln(2) + ln(x)'],
    ['ln(x^2)', '2ln(|x|)'],
    ['sqrt(2)sqrt(3)', 'sqrt(6)'],
    ['ln(4)', '2ln(2)'],
    ['ln(e^x)', 'x'],
    ['atan(1/x)', 'acot(x)'],
    ['asin(x)', 'atan(x/sqrt(1 - x^2))']
  ]
  it.each(cases)('%s vs %s', (a, b) => expect(expressionEqual(a, b)).toBe('unknown'))
  it('in the calculus checkers too', () => {
    expect(derivativeCheck('tan(x)', 'x', 'sec(x)^2')).toBe('unknown')
    expect(derivativeCheck('tan(x)', 'x', '1/cos(x)^2')).toBe('unknown')
    expect(derivativeCheck('cot(x)', 'x', '-csc(x)^2')).toBe('unknown')
    expect(derivativeCheck('sin(x)^2', 'x', 'sin(2x)')).toBe('unknown')
    expect(integralCheck('sin(2x)', 'x', 'sin(x)^2')).toBe('unknown')
    expect(integralCheck('1/cos(x)^2', 'x', 'tan(x)')).toBe('unknown')
    expect(derivativeCheck('e^x', 'x', 'e^x (sin(x)^2 + cos(x)^2)')).toBe('unknown')
  })
  it('numbers still show a wrong one wrong', () => {
    expect(expressionEqual('sin(x)^2 + cos(x)^2', '1.000001')).toBe('different')
    expect(expressionEqual('sin(2x)', '2sin(x)')).toBe('different')
  })
})

describe('domains, per G00', () => {
  const cases: [string, string, V][] = [
    // ln x is defined for x > 0 only; ln|x| for x ≠ 0: different functions.
    ['ln(x)', 'ln(|x|)', 'different'],
    ['sqrt(x^2)', 'x', 'different'],
    ['sqrt(x^2)', '|x|', 'equal'],
    ['sqrt(x)^2', 'x', 'different'],
    ['sqrt(x)sqrt(x)', 'x', 'different'],
    ['sqrt(x)/sqrt(x)', '1', 'different'],
    ['tan(x)', 'sin(x)/cos(x)', 'equal'],
    ['tan(x)cos(x)', 'sin(x)', 'unknown'],
    ['x*ln(x)/x', 'ln(x)', 'equal'],
    ['(x^2 - 1)/(x - 1)*e^x', '(x + 1)*e^x', 'equal'],
    ['(1 + sin(x))/(1 + sin(x))', '1', 'unknown'],
    ['e^(ln(x))', 'x', 'different'],
    ['x + ln(x) - ln(x)', 'x', 'different'],
    ['sqrt(-1 - x^2) + x', 'x + sqrt(-1 - x^2)', 'unknown'],
    ['asin(x) + asin(x)', '2asin(x)', 'equal'],
    ['acosh(x)', 'acosh(x) + 0', 'equal']
  ]
  it.each(cases)('%s vs %s is %s', (a, b, v) => expect(expressionEqual(a, b)).toBe(v))

  it('the equal carries its conditions and points', () => {
    const tan: ElementaryResult = { verdict: 'equal', excluded: [], conditions: ['cos(x) ≠ 0'] }
    expect(elementaryEqual('tan(x)', 'sin(x)/cos(x)')).toEqual(tan)
    const r = elementaryEqual('(x^2 - 1)/(x - 1)*e^x', '(x + 1)*e^x')
    expect(r.verdict).toBe('equal')
    expect(r.excluded.map((e) => e.exact)).toEqual(['1'])
    expect(elementaryEqual('x*ln(x)/x', 'ln(x)')).toEqual({ verdict: 'equal', excluded: [{ value: 0, exact: '0' }], conditions: ['x > 0'] })
    expect(elementaryEqual('sqrt(8x)', '2sqrt(2x)').conditions).toEqual(['x ≥ 0'])
    expect(elementaryEqual('asin(x)', 'asin(x)').conditions).toEqual(['-x^2 + 1 ≥ 0'])
    expect(elementaryEqual('ln(sin(x))', 'ln(sin(x))').conditions).toEqual(['sin(x) > 0'])
    expect(elementaryEqual('ln(x)', 'ln(|x|)').verdict).toBe('different')
    // Two letters: a point is not a value of one of them, so every condition is text.
    expect(elementaryEqual('x*ln(y)/x', 'ln(y)')).toEqual({ verdict: 'equal', excluded: [], conditions: ['y > 0', 'x ≠ 0'] })
  })

  it('derivatives: the claimed one may be defined on more than f′, never on less', () => {
    expect(derivativeCheck('ln(x)', 'x', '1/x')).toBe('equal')
    expect(derivativeCheck('ln(|x|)', 'x', '1/x')).toBe('equal')
    expect(derivativeCheck('ln(sin(x))', 'x', 'cos(x)/sin(x)')).toBe('equal')
    expect(derivativeCheck('sqrt(x)', 'x', '1/(2sqrt(x))')).toBe('equal')
    // 1/tan x is cot x but for the points where cos x = 0, which a condition with sin or cos in it cannot list.
    expect(derivativeCheck('ln(sin(x))', 'x', '1/tan(x)')).toBe('unknown')
    // A hole where f may have no derivative (|u| or a root of u at u = 0) is not proved to be one: f's own form
    // decides, and x·|x| has a derivative at 0 though |x| has none. So these stay unknown, never equal.
    expect(derivativeCheck('|sin(x)|', 'x', 'cos(x) sin(x)/|sin(x)|')).toBe('unknown')
    expect(derivativeCheck('x^(1/3)', 'x', '1/(3x^(2/3))')).toBe('unknown')
    expect(derivativeCheck('x^(1/3)', 'x', 'cbrt(x)/(3x)')).toBe('unknown')
    expect(derivativeCheck('x|x|/2', 'x', 'x^2/|x|')).toBe('unknown')
    expect(derivativeCheck('x|x|/2', 'x', '|x|')).toBe('equal')
    expect(derivativeCheck('x^(4/3)', 'x', '(4/3)x/cbrt(x^2)')).toBe('unknown')
    // A point excluded by the rules is harmless only when it is isolated in x: |a·x| has none for a = 0, at any x.
    expect(atomDerivative(readMaths('x|x|'), 'x', readMaths('2|x|'))).toEqual({ same: true, covered: true })
    expect(atomDerivative(readMaths('|a x|'), 'x', readMaths('a^2 x/|a x|'))?.covered).toBe(false)
    expect(atomDerivative(readMaths('x|sin(x)|'), 'x', readMaths('|sin(x)| + x cos(x) sin(x)/|sin(x)|'))?.covered).toBe(false)
    expect(derivativeCheck('x^2', 'x', '2x + ln(x) - ln(x)')).not.toBe('equal')
    expect(derivativeCheck('sin(x)', 'x', 'cos(x) sqrt(x)/sqrt(x)')).not.toBe('equal')
    expect(derivativeCheck('sin(x)', 'x', 'cos(x) tan(x)/tan(x)')).not.toBe('equal')
    expect(derivativeCheck('e^x', 'x', 'e^x (1 + sin(x))/(1 + sin(x))')).not.toBe('equal')
    // a ≠ 0 leaves out every x at a = 0, not isolated points: only an f that needs a ≠ 0 itself allows it.
    expect(derivativeCheck('sin(x)', 'x', 'cos(x) a/a')).not.toBe('equal')
    expect(derivativeCheck('sin(x)/a', 'x', 'cos(x)/a')).toBe('equal')
    expect(integralCheck('cos(x)', 'x', 'sin(x) b/b')).not.toBe('equal')
    expect(derivativeCheck('sin(a x)', 'x', 'a cos(a x)')).toBe('equal')
  })

  it('a derivative or an antiderivative with a hole the right one has not is not equal (review G2B round 1)', () => {
    // Undefined at ±√2, where d/dx √(x² + 1) is defined; the numbers never land on ±√2, so the proof must say no.
    expect(derivativeCheck('sqrt(x^2+1)', 'x', 'x/sqrt(x^2+1) * (x^2-2)/(x^2-2)')).toBe('unknown')
    expect(integralCheck('cos(x)', 'x', 'sin(x) * (x^2-2)/(x^2-2)')).toBe('unknown')
    expect(atomDerivative(readMaths('sqrt(x^2+1)'), 'x', readMaths('x/sqrt(x^2+1) * (x^2-2)/(x^2-2)'))).toEqual({ same: true, covered: false })
    expect(atomDerivative(readMaths('sin(x)'), 'x', readMaths('cos(x) a/a'))).toEqual({ same: true, covered: false })
    // The quotient path too: G2 said 'equal' for these where both are defined.
    expect(derivativeCheck('x^2', 'x', '2x(x-1)/(x-1)')).toBe('unknown')
    expect(integralCheck('x', 'x', 'x^2/2 * (x-1)/(x-1)')).toBe('unknown')
    // A hole where the right one has one too is no hole: the real zeros are compared exactly.
    expect(derivativeCheck('ln(x^2 - 1)', 'x', '2x/((x - 1)(x + 1))')).toBe('equal')
    expect(derivativeCheck('1/(x^2 - 1)', 'x', '-2x/((x - 1)^2 (x + 1)^2)')).toBe('equal')
    expect(derivativeCheck('1/(x^2 - 2)', 'x', '-2x/(x^4 - 4x^2 + 4)')).toBe('equal')
    expect(derivativeCheck('sin(x)/(x^2 - 1)', 'x', '(cos(x)(x^2 - 1) - 2x sin(x))/((x - 1)^2 (x + 1)^2)')).toBe('equal')
    expect(integralCheck('1/(x^2 - 1)', 'x', '(ln(|x - 1|) - ln(|x + 1|))/2')).toBe('equal')
    expect(integralCheck('1/x', 'x', 'ln(|3x|)')).toBe('equal')
    // Review round 2 (Gemini) asked about these: x² + 1 has no real zero, so (x² + 1)/(x² + 1) is 1 on the whole real
    // line and is d/dx x; x(x² + 1)/(x² + 1) is x, which is not.
    expect(derivativeCheck('x', 'x', '(x^2 + 1)/(x^2 + 1)')).toBe('equal')
    expect(derivativeCheck('x', 'x', 'x*(x^2 + 1)/(x^2 + 1)')).toBe('different')
    expect(derivativeCheck('x', 'x', '(x^2 - 1)/(x^2 - 1)')).toBe('unknown')
    // A divisor > 0 only by a shape it does not have stays a condition: −1 + x², sin(x)² alone, 0 + |x|.
    expect(derivativeCheck('x', 'x', '(x^2 - 1 + sin(x)^2)/(x^2 - 1 + sin(x)^2)')).toBe('unknown')
    expect(derivativeCheck('x', 'x', '(0 + |x| + sin(x)^2)/(0 + |x| + sin(x)^2)')).not.toBe('equal')
    expect(derivativeCheck('x', 'x', '(1 + |x| + sin(x)^2)/(1 + |x| + sin(x)^2)')).toBe('equal')
  })

  it('integrals: F is defined wherever f is, but at isolated points', () => {
    expect(integralCheck('cos(x)', 'x', 'sin(x)')).toBe('equal')
    expect(integralCheck('cos(x)', 'x', 'sin(x) + 7')).toBe('equal')
    expect(integralCheck('1/x', 'x', 'ln(|x|)')).toBe('equal')
    expect(integralCheck('cot(x)', 'x', 'ln(|sin(x)|)')).toBe('equal')
    expect(integralCheck('tan(x)', 'x', '-ln(|cos(x)|)')).toBe('equal')
    expect(integralCheck('x e^x', 'x', '(x - 1)e^x + 3')).toBe('equal')
    expect(integralCheck('1/sqrt(x)', 'x', '2sqrt(x)')).toBe('equal')
    expect(integralCheck('sqrt(x)', 'x', '(2/3)x^(3/2)')).toBe('equal')
    expect(integralCheck('1/(1 + x^2)', 'x', 'atan(x)')).toBe('equal')
    expect(integralCheck('1/sqrt(1 - x^2)', 'x', 'asin(x)')).toBe('equal')
    expect(integralCheck('e^(2x)', 'x', 'e^(2x)/2')).toBe('equal')
    // ln(sin x) is defined only where sin x > 0; cot x on every x but kπ.
    expect(integralCheck('cot(x)', 'x', 'ln(sin(x))')).toBe('unknown')
    expect(integralCheck('cos(x)', 'x', '-sin(x)')).toBe('different')
    expect(integralCheck('e^(2x)', 'x', 'e^(2x)')).toBe('different')
    expect(integralCheck('x e^x', 'x', 'x e^x')).toBe('different')
    expect(integralCheck('1/x', 'x', 'ln(x^2)')).toBe('different')
    expect(integralCheck('2x', 'x', 'x^2 + sqrt(-x) - sqrt(-x)')).not.toBe('equal')
  })
})

describe('every exact rewrite, proved', () => {
  const cases: [string, string, V][] = [
    // √(k²u) = k√u for a rational k > 0, and √(k²) = |k|; a constant root is one atom.
    ['sqrt(9x + 9)', '3sqrt(x + 1)', 'equal'],
    ['sqrt(x/4)', 'sqrt(x)/2', 'equal'],
    ['sqrt(8)', '2sqrt(2)', 'equal'],
    ['sqrt(1/2)', 'sqrt(2)/2', 'equal'],
    ['sqrt(2)^2', '2', 'equal'],
    ['cbrt(-8x)', '-2cbrt(x)', 'equal'],
    ['cbrt(16)', '2cbrt(2)', 'equal'],
    // e^a·e^b = e^(a + b), (e^a)^n = e^(na), e^0 = 1, e = e^1.
    ['e^x e^(2x)', 'e^(3x)', 'equal'],
    ['e^x e^(-x)', '1', 'equal'],
    ['(e^x)^3', 'e^(3x)', 'equal'],
    ['exp(x)^(-2)', 'e^(-2x)', 'equal'],
    ['e e^x', 'e^(x + 1)', 'equal'],
    ['(e^x)^x', 'e^(x^2)', 'equal'],
    ['sqrt(e^(2x))', 'e^x', 'equal'],
    ['e^(sin(x)) e^(cos(x))', 'e^(sin(x) + cos(x))', 'equal'],
    // Integer powers of atoms: √u·√u = u on u ≥ 0 (the condition stays), |u|² = u², ∛u³ = u.
    ['sqrt(x^2 + 1)^2', 'x^2 + 1', 'equal'],
    ['|sin(x)|^2', 'sin(x)^2', 'equal'],
    ['cbrt(sin(x))^3', 'sin(x)', 'equal'],
    ['(x^(1/3))^3', 'x', 'equal'],
    ['sqrt(x^3)', 'x sqrt(x)', 'equal'],
    ['sqrt(-x^3)', '-x sqrt(-x)', 'equal'],
    ['x^(5/2)', 'x^2 sqrt(x)', 'equal'],
    // An odd root is multiplicative everywhere, so its argument is split into square-free parts; an even root is not.
    ['cbrt((x^2 + 1)^2)', 'cbrt(x^2 + 1)^2', 'equal'],
    ['cbrt(x^4 - 2x^2 + 1)', 'cbrt(x^2 - 1)^2', 'equal'],
    ['nthRoot((x + 1)^7, 5)', '(x + 1) nthRoot((x + 1)^2, 5)', 'equal'],
    ['sqrt((x^2 + 1)^2 x)', '(x^2 + 1) sqrt(x)', 'unknown'],
    // tan, sec, csc and cot as sin/cos, with the denominator's zeros kept out.
    ['tan(x)', 'sin(x)/cos(x)', 'equal'],
    ['sec(x)', '1/cos(x)', 'equal'],
    ['csc(x)', '1/sin(x)', 'equal'],
    ['cot(x)', 'cos(x)/sin(x)', 'equal'],
    ['tan(x)cot(x)', '1', 'unknown'],
    // Odd and even: sin(−u) = −sin u, cos(−u) = cos u, |−u| = |u|, asin, atan, asinh and atanh odd.
    ['sin(-x)', '-sin(x)', 'equal'],
    ['cos(1 - x)', 'cos(x - 1)', 'equal'],
    ['tan(-x)', '-tan(x)', 'equal'],
    ['|sin(-x)|', '|sin(x)|', 'equal'],
    ['asin(-x)', '-asin(x)', 'equal'],
    ['atan(-2x)', '-atan(2x)', 'equal'],
    ['asinh(-x)', '-asinh(x)', 'equal'],
    ['sin(0) + cos(0) + atan(0) + ln(1)', '1', 'equal'],
    // Hyperbolic functions as exponentials, an identity everywhere.
    ['sinh(x)', '(e^x - e^(-x))/2', 'equal'],
    ['cosh(x)^2 - sinh(x)^2', '1', 'equal'],
    ['tanh(x)', 'sinh(x)/cosh(x)', 'equal'],
    ['coth(x)', 'cosh(x)/sinh(x)', 'equal'],
    // log is base 10 in PhysLab: log(x) = ln(x)/ln(10).
    ['log(x)', 'ln(x)/ln(10)', 'equal'],
    ['log(100x)', 'ln(100x)/ln(10)', 'equal'],
    // Not rewritten: ln of a product or a power, and no branch identity.
    ['ln(x^2)', '2ln(x)', 'different'],
    ['ln(x e^x)', 'ln(x) + x', 'unknown'],
    ['sqrt(x^2 y^2)', '|x||y|', 'equal']
  ]
  it.each(cases)('%s vs %s is %s', (a, b, v) => expect(expressionEqual(a, b)).toBe(v))
})

describe('size limits and the time budget', () => {
  const timed = <T>(run: () => T): T => {
    const start = Date.now()
    const out = run()
    expect(Date.now() - start).toBeLessThan(2500)
    return out
  }
  it('deep nesting is not worked out exactly', () => {
    let f = 'x'
    for (let i = 0; i < 8; i++) f = `sin(${f})`
    expect(timed(() => expressionEqual(f, f))).toBe('unknown')
    let g = 'x'
    for (let i = 0; i < 5; i++) g = `sin(${g})`
    expect(timed(() => expressionEqual(g, g))).toBe('equal')
    expect(timed(() => derivativeCheck(f, 'x', '1'))).not.toBe('equal')
  })
  it('huge numbers are not worked out exactly', () => {
    expect(timed(() => expressionEqual('sqrt(((2^64)^64)^5 x)', 'sqrt(((2^64)^64)^5 x)'))).not.toBe('different')
    expect(timed(() => expressionEqual('nthRoot(3/((10^300)^60), 64) + sin(x)', 'sin(x) + nthRoot(3/((10^300)^60), 64)'))).not.toBe('different')
    expect(timed(() => derivativeCheck('e^2', 'e', '0'))).not.toBe('equal')
  })
  it('many functions, high degrees and big powers answer in time', () => {
    const many = Array.from({ length: 60 }, (_, k) => `sin(${k + 1}x)`).join(' + ')
    expect(timed(() => expressionEqual(many, many))).not.toBe('different')
    expect(timed(() => expressionEqual('sin(x)^200', 'sin(x)^200'))).not.toBe('different')
    expect(timed(() => expressionEqual('(sin(x) + cos(x) + e^x + 1)^40', '(1 + e^x + cos(x) + sin(x))^40'))).not.toBe('different')
    expect(timed(() => derivativeCheck('(sin(x) + cos(x) + e^x + x)^12', 'x', '12(sin(x) + cos(x) + e^x + x)^11 (cos(x) - sin(x) + e^x + 1)'))).not.toBe('different')
    expect(timed(() => derivativeCheck('e^(x^60) sin(x^60)', 'x', '60x^59 e^(x^60)(sin(x^60) + cos(x^60))'))).not.toBe('different')
  })
  it('every right form above answers in time', () => {
    let slowest = 0
    for (const [f, gs] of RIGHT) {
      for (const g of gs) {
        const start = Date.now()
        derivativeCheck(f, 'x', g)
        slowest = Math.max(slowest, Date.now() - start)
      }
    }
    expect(slowest).toBeLessThan(1500)
  }, 60_000)
})

// G2: the adversarial lists — the G2 contract's own, and the 16 canonical cases of the engine semantics contract
// (math/engine/semantics.ts ADVERSARIAL_CASES). Each pitfall answer must never be 'equal'.

import { describe, expect, it } from 'vitest'
import { ADVERSARIAL_CASES } from '../../src/renderer/src/math/engine/semantics'
import {
  derivativeCheck,
  expressionEqual,
  factorCheck,
  integralCheck,
  linearSystemCheck,
  numericEqual,
  partialFractionsCheck,
  polyEqual,
  polyRootsCheck,
  rationalEqual
} from '../../src/renderer/src/math/check/checkers'

const one = (value: string | number, multiplicity = 1) => ({ value: String(value), multiplicity })

describe("the G2 contract's adversarial list", () => {
  it('√(x²) vs x is different on the real line; √(x²) vs |x| is equal', () => {
    expect(expressionEqual('sqrt(x^2)', 'x')).toBe('different')
    expect(expressionEqual('sqrt(x^2)', '|x|')).toBe('equal')
  })
  it('log(x²) vs 2·log(x) is different: the domains differ', () => {
    expect(expressionEqual('log(x^2)', '2 log(x)')).toBe('different')
    expect(expressionEqual('ln(x^2)', '2 ln(x)')).toBe('different')
  })
  it('x(x − 1)/(x − 1) vs x is equal, with 1 excluded', () => {
    const r = rationalEqual('x(x-1)/(x-1)', 'x')
    expect(r.verdict).toBe('equal')
    expect(r.excluded.map((e) => e.exact)).toEqual(['1'])
  })
  it('x² − 2x + 1 with roots [1 (×1)] is different: the multiplicity is missing', () => {
    expect(polyRootsCheck('x^2-2x+1', [one(1)])).toBe('different')
  })
  it('x² − 1 with roots [1, −1, 2] is different', () => {
    expect(polyRootsCheck('x^2-1', [one(1), one(-1), one(2)])).toBe('different')
  })
  it('x² + 1 over the reals has no root; ±i only in Complex mode', () => {
    expect(polyRootsCheck('x^2+1', [])).toBe('equal')
    expect(polyRootsCheck('x^2+1', [one('i'), one('-i')])).toBe('different')
    expect(polyRootsCheck('x^2+1', [one('i'), one('-i')], 'complex')).toBe('equal')
  })
  it('tan x near π/2: no crash, no false verdict', () => {
    expect(numericEqual('tan(x)', 'sin(x)/cos(x)').verdict).toBe('unknown')
    expect(numericEqual('tan(x)', '-sin(x)/cos(x)').verdict).toBe('different')
    expect(derivativeCheck('tan(x)', 'x', 'sec(x)^2')).toBe('unknown')
  })
  it('coefficients 10⁻¹⁹ and 6·10²⁴ keep their exact size', () => {
    expect(polyEqual('1e-19 x + 6e24', '6e24 + x/10^19')).toBe('equal')
    expect(polyEqual('1e-19 x + 6e24', '6e24 + x/10^18')).toBe('different')
    expect(polyRootsCheck('1e-19 x - 6e24', [one('6e43')])).toBe('equal')
    expect(polyRootsCheck('1e-19 x - 6e24', [one('6e42')])).toBe('different')
  })
  it('(−8)^(1/3) vs −2 is equal: real odd roots', () => {
    expect(expressionEqual('(-8)^(1/3)', '-2')).toBe('equal')
    expect(expressionEqual('cbrt(-8)', '-2')).toBe('equal')
    expect(expressionEqual('nthRoot(-32, 5)', '-2')).toBe('equal')
  })
})

describe('a checker never throws: what it cannot read is unknown', () => {
  // Past pure/mono's power limit (1000) but under parse.ts's own (4096): mono's NotPolynomial must not escape. Each
  // verdict is the one the case deserves: 'unknown' where nothing can be read exactly, and 'different' only where the
  // numbers do show a difference ((x + 1)²⁰⁰⁰ is not 1), so a fallback that guessed 'different' would fail here.
  const huge = '(x+1)^2000'
  it.each([
    ['expressionEqual', () => expressionEqual(huge, '1'), 'different'],
    ['polyEqual', () => polyEqual(huge, '1'), 'unknown'],
    ['rationalEqual', () => rationalEqual(huge, '1').verdict, 'different'],
    ['factorCheck', () => factorCheck(huge, huge).verdict, 'unknown'],
    ['polyRootsCheck', () => polyRootsCheck(huge, [one(-1, 2000)]), 'unknown'],
    ['derivativeCheck', () => derivativeCheck(huge, 'x', '2000(x+1)^1999'), 'unknown'],
    ['integralCheck', () => integralCheck('x', 'x', huge), 'different'],
    ['partialFractionsCheck', () => partialFractionsCheck(`1/${huge}`, `1/${huge}`), 'unknown'],
    ['linearSystemCheck', () => linearSystemCheck([`${huge} = 1`], { kind: 'none' }), 'unknown'],
    ['numericEqual', () => numericEqual(huge, '1').verdict, 'different'],
    ['polyEqual on garbage', () => polyEqual('(((', 'x'), 'unknown'],
    ['polyRootsCheck on garbage', () => polyRootsCheck('x^2-1', [one('((('), one(1)]), 'unknown'],
    ['expressionEqual on garbage', () => expressionEqual('(((', 'x'), 'unknown'],
    ['linearSystemCheck on garbage', () => linearSystemCheck(['x + y = ((('], { kind: 'none' }), 'unknown']
  ])('%s', (_name, run, verdict) => {
    expect(() => run()).not.toThrow()
    expect(run()).toBe(verdict)
  })
})

describe('review cases (gpt-5.4): wrong things that must not be equal', () => {
  it('an equation is not an expression: x = 1 is not x − 1, and (x − 1)(x + 1) = 0 is not a factorisation', () => {
    expect(polyEqual('x-1', 'x=1')).not.toBe('equal')
    expect(expressionEqual('x+1', 'x+1=0')).not.toBe('equal')
    expect(rationalEqual('1/x', '1/x = 0').verdict).not.toBe('equal')
    expect(factorCheck('x^2-1', '(x-1)(x+1)=0').verdict).not.toBe('equal')
    // 'y = 2x' was 'different' even before (y − 2x is not 2x); '2x = 0' is the one that was read as 2x and passed.
    expect(derivativeCheck('x^2', 'x', 'y = 2x')).not.toBe('equal')
    expect(derivativeCheck('x^2', 'x', '2x = 0')).not.toBe('equal')
    expect(integralCheck('2x', 'x', 'x^2 = 0')).not.toBe('equal')
    expect(partialFractionsCheck('1/(x(x+1))', '1/x - 1/(x+1) = 0')).not.toBe('equal')
  })
  it('an answer value is never an equation: a root "1 = 0" is not 1, and x = "1 = y" is not x = 1 − y', () => {
    expect(polyRootsCheck('x^2-1', [one('1 = 0'), one(-1)])).not.toBe('equal')
    expect(linearSystemCheck(['x + y = 1', '2x + 2y = 2'], { kind: 'infinite', values: { x: '1 = y' } })).not.toBe('equal')
    expect(linearSystemCheck(['x + y = 3', 'x - y = 1'], { kind: 'unique', values: { x: 'x = 2', y: '1' } })).not.toBe('equal')
  })
  it('a listed unknown is not also a parameter: y = −y is not the line x + y = 0', () => {
    expect(linearSystemCheck(['x + y = 0'], { kind: 'infinite', values: { x: 'y', y: '-y' } })).not.toBe('equal')
    expect(linearSystemCheck(['x + y = 0'], { kind: 'infinite', values: { x: '-y', y: 'y' } })).toBe('equal')
    // Read literally, x = y and y = x is the line x = y.
    expect(linearSystemCheck(['x - y = 0'], { kind: 'infinite', values: { x: 'y', y: 'x' } })).toBe('equal')
    expect(linearSystemCheck(['x + y = 0'], { kind: 'infinite', values: { x: 'y', y: 'x' } })).not.toBe('equal')
  })
  it('a number mathjs would round is never read: 0x20000000000001 is not 0x20000000000000', () => {
    expect(expressionEqual('0x20000000000001', '0x20000000000000')).toBe('unknown')
    // 2⁵³ + 1 and 2⁵³ are one double: the difference read 0, not 1. (The review's second case, against
    // 9007199254740992 written out, was already 'unknown': sixteen figures are refused on their own.)
    expect(polyEqual('0x20000000000001 x - 0x20000000000000 x', '0')).toBe('unknown')
    expect(polyEqual('0x20000000000001 x - 0x20000000000000 x', 'x')).toBe('unknown')
    expect(polyEqual('0b101', '5')).toBe('unknown')
  })
  it('a bracketed whole power is a power: (x + 1)^(2) factorises x² + 2x + 1', () => {
    expect(factorCheck('x^2+2x+1', '(x+1)^(2)').verdict).toBe('equal')
  })
})

describe('found while closing the review: more wrong things that must not be equal', () => {
  it('a number a double cannot hold is never read: 10⁻⁴⁰⁰ is not 0, and two subnormals are not one', () => {
    expect(polyEqual('1e-400 x', '0')).not.toBe('equal')
    expect(expressionEqual('1e-400', '0')).not.toBe('equal')
    expect(rationalEqual('1e-400/x', '0').verdict).not.toBe('equal')
    expect(polyRootsCheck('x - 1e-400', [one(0)])).not.toBe('equal')
    expect(polyEqual('1.23456789e-320 x', '1.2345679e-320 x')).not.toBe('equal')
    expect(linearSystemCheck(['x = 1e-400'], { kind: 'unique', values: { x: '0' } })).not.toBe('equal')
  })
  it('a root named by another letter is not a root of x: y = 1 and z = −1 for x² − 1', () => {
    expect(polyRootsCheck('x^2-1', [one('y = 1'), one('z = -1')])).not.toBe('equal')
    expect(polyRootsCheck('x^2-1', [one('x = 1'), one('x = -1')])).toBe('equal')
    expect(polyRootsCheck('t^2-1', [one('t = 1'), one(-1)])).toBe('equal')
  })
  it('every letter written is an unknown: in x + z − z = 1, y = 2 the z is free, so (1, 2) is not unique', () => {
    expect(linearSystemCheck(['x + z - z = 1', 'y = 2'], { kind: 'unique', values: { x: '1', y: '2' } })).not.toBe('equal')
    expect(linearSystemCheck(['x + z - z = 1', 'y = 2'], { kind: 'infinite', values: { x: '1', y: '2' } })).toBe('equal')
    // A value for a letter no equation fixes is a claim about a free unknown.
    expect(linearSystemCheck(['x + y = 3', 'x - y = 1'], { kind: 'unique', values: { x: '2', y: '1', z: '7' } })).not.toBe('equal')
  })
  it('partial fractions: one term for each power of each factor, and none of them 0', () => {
    expect(partialFractionsCheck('2/(x+1)', '1/(x+1) + 1/(x+1)')).not.toBe('equal')
    expect(partialFractionsCheck('(x+1)/(x^2+1)', 'x/(x^2+1) + 1/(x^2+1)')).not.toBe('equal')
    expect(partialFractionsCheck('1/x', '1/x + 0/(x+1)')).not.toBe('equal')
    expect(partialFractionsCheck('2/(x+1)', '2/(x+1)')).toBe('equal')
  })
  it('a whole power of a number or of a product is still a factorisation', () => {
    expect(factorCheck('8x+8', '2^3(x+1)')).toEqual({ verdict: 'equal', irreducibleOverQ: [true] })
    expect(factorCheck('x^4-2x^2+1', '((x-1)(x+1))^2')).toEqual({ verdict: 'equal', irreducibleOverQ: [true, true] })
    expect(factorCheck('x^2-1', '(x^2-1)/x * x').verdict).not.toBe('equal')
    expect(factorCheck('x^2-1', '(x-1)(x+1)^(1/1)').verdict).toBe('equal')
    expect(factorCheck('x+1', '(x+1)*x^0').verdict).not.toBe('equal')
  })
  it('a fractional power with a huge root index is not worked out exactly, and does not hang', () => {
    // 0.333333333333 is not 1/3: x^0.999999999999 is not x, and the numbers see it at x = 10⁶.
    expect(expressionEqual('(x^3)^(0.333333333333)', 'x')).toBe('different')
    expect(polyRootsCheck('x^3-8', [one('8^(0.333333333333)')])).toBe('different')
  })
  // Each of these took from twelve seconds to several minutes on the window's own thread: Sturm chains over ℚ, and the
  // rational-root theorem's candidates for a 180-figure constant term.
  it('a big polynomial is answered quickly: worked out up to degree 64, unknown above', () => {
    expect(polyRootsCheck('(x+1)^40 + 3x^13 - 7x + 2', [])).toBe('different')
    expect(polyRootsCheck('(123456789x + 987654321)^20 + x', [])).toBe('different')
    expect(polyRootsCheck('(x+1)^200 + 3x^66 - 7x + 2', [])).toBe('unknown')
    expect(rationalEqual('1/((x+1)^40 + 3x - 2)', '1/((x+1)^40 + 3x - 2)').verdict).toBe('equal')
    expect(rationalEqual('1/((x+1)^100 + 3x - 2)', '1/((x+1)^100 + 3x - 2)')).toEqual({ verdict: 'equal', excluded: [], excludedComplete: false })
    expect(rationalEqual('1/((x+1)^100 + 3x - 2)', '1/((x+1)^100 + 3x - 1)').verdict).toBe('different')
    expect(partialFractionsCheck('1/((x+1)^100 + x)', '1/((x+1)^100 + x)')).not.toBe('equal')
    expect(expressionEqual('sqrt((x+1)^98 + x)', 'x')).not.toBe('equal')
    // Sparse and fully accounted for, a high degree is still decided.
    expect(polyRootsCheck('(x-1)^100', [one(1, 100)])).toBe('equal')
  }, 10_000)
})

describe('final review round 2 (gpt-5.4): two right answers it took for wrong, which stay equal', () => {
  it('a bracketed number is the content, like a bare one: (2)(x + 1) factorises 2x + 2; (1 + 1)(x + 1) does not', () => {
    expect(factorCheck('2x+2', '(2)*(x+1)')).toEqual({ verdict: 'equal', irreducibleOverQ: [true] })
    expect(factorCheck('2x+2', '2(x+1)')).toEqual({ verdict: 'equal', irreducibleOverQ: [true] })
    expect(factorCheck('2x+2', '(1+1)(x+1)').verdict).toBe('different')
  })
  it('a power with no term below it is its own decomposition: 1/(x + 1)² needs no 0/(x + 1)', () => {
    expect(partialFractionsCheck('1/(x+1)^2', '1/(x+1)^2')).toBe('equal')
    expect(partialFractionsCheck('1/(x+1)^2', '0/(x+1) + 1/(x+1)^2')).toBe('different')
  })
})

/** One check per canonical case: the pitfall answer is never 'equal', and the right one is not 'different'. */
const CANONICAL: Record<string, () => void> = {
  sqrt_x_sq: () => {
    expect(expressionEqual('sqrt(x^2)', 'x')).toBe('different')
    expect(expressionEqual('sqrt(x^2)', '|x|')).toBe('equal')
  },
  log_x_sq: () => {
    expect(expressionEqual('ln(x^2)', '2*ln(x)')).toBe('different')
    expect(expressionEqual('ln(x^2)', '2*ln(|x|)')).toBe('unknown')
  },
  cancelled_factor: () => {
    const r = rationalEqual('x*(x-1)/(x-1)', 'x')
    expect(r.verdict).toBe('equal')
    expect(r.excluded.map((e) => e.value)).toEqual([1])
  },
  pole_odd_inv_x: () => {
    expect(expressionEqual('1/x', '1/|x|')).toBe('different')
    expect(rationalEqual('1/x', '-1/x').verdict).toBe('different')
    expect(rationalEqual('1/x', 'x/x^2').excluded.map((e) => e.value)).toEqual([0])
  },
  pole_even_inv_x_sq: () => {
    expect(expressionEqual('1/x^2', '1/|x|^2')).toBe('equal')
    expect(expressionEqual('1/x^2', '-1/x^2')).toBe('different')
  },
  abs_val_diff: () => {
    expect(derivativeCheck('|x|', 'x', 'sign(x)')).toBe('unknown')
    expect(derivativeCheck('|x|', 'x', '1')).toBe('different')
    expect(derivativeCheck('|x|', 'x', '0')).toBe('different')
  },
  sign_func: () => {
    expect(expressionEqual('sign(x)', '|x|/x')).toBe('unknown')
    expect(expressionEqual('sign(x)', '1')).toBe('different')
    expect(expressionEqual('sgn(x)', 'x/x')).toBe('different')
  },
  piecewise: () => {
    // |x| is the piecewise −x, x: its derivative is not 1 on both sides, nor the slope of one side.
    expect(derivativeCheck('|x|', 'x', '1')).toBe('different')
    expect(derivativeCheck('|x|', 'x', '-1')).toBe('different')
    expect(expressionEqual('|x|', 'x')).toBe('different')
  },
  tan_pole: () => {
    expect(numericEqual('tan(x)', 'sin(x)/cos(x)').verdict).toBe('unknown')
    expect(expressionEqual('tan(x)', '1/cos(x)')).toBe('different')
  },
  double_root: () => {
    expect(polyRootsCheck('(x-2)^2 = 0', [one(2)])).toBe('different')
    expect(polyRootsCheck('(x-2)^2 = 0', [one(2, 2)])).toBe('equal')
  },
  missing_root: () => {
    expect(polyRootsCheck('x^2 = x', [one(1)])).toBe('different')
    expect(polyRootsCheck('x^2 = x', [one(0), one(1)])).toBe('equal')
  },
  extraneous_root_squaring: () => {
    expect(polyRootsCheck('x = sqrt(x + 2)', [one(2), one(-1)])).toBe('different')
    expect(polyRootsCheck('x = sqrt(x + 2)', [one(-1)])).toBe('different')
    expect(polyRootsCheck('x = sqrt(x + 2)', [one(2)])).toBe('unknown')
  },
  zero_times_inf: () => {
    const r = rationalEqual('x*(1/x)', '1')
    expect(r.verdict).toBe('equal')
    expect(r.excluded.map((e) => e.value)).toEqual([0])
  },
  odd_root_neg: () => {
    expect(expressionEqual('(-8)^(1/3)', '-2')).toBe('equal')
    expect(expressionEqual('(-8)^(1/3)', '1 + sqrt(3)*i')).not.toBe('equal')
    expect(polyRootsCheck('x^3 + 8', [one('1 + sqrt(3)*i')])).toBe('different')
  },
  euler_identity: () => {
    // e^(iπ) = −1 is Complex mode; on the real line the checkers neither confirm nor deny it.
    expect(expressionEqual('e^(i*pi)', '-1')).toBe('unknown')
    expect(expressionEqual('e^(i*pi)', '-1 + 1e-16*i')).not.toBe('equal')
  },
  extreme_coefficients: () => {
    expect(polyEqual('1e-19*x^2 + 6e24', '6e24 + 1e-19*x^2')).toBe('equal')
    expect(polyEqual('1e-19*x^2 + 6e24', '6e24')).toBe('different')
    // 10⁻¹⁹x² is 31 digits below 6·10²⁴ at every sampled |x| ≤ 10⁶: past the 25 digits numbers judge, so only the
    // exact check above sees it, and the numbers must not call it equal.
    expect(numericEqual('1e-19*x^2 + 6e24', '6e24').verdict).toBe('unknown')
    expect(numericEqual('1e-19*x^2 + 6e24', '6.0000001e24').verdict).toBe('different')
  }
}

describe('the 16 canonical adversarial cases (engine semantics contract)', () => {
  it('every canonical case has a check here', () => {
    expect(ADVERSARIAL_CASES.map((c) => c.id).sort()).toEqual(Object.keys(CANONICAL).sort())
  })
  it.each(ADVERSARIAL_CASES.map((c) => [c.id, c.pitfall] as const))('%s: %s', (id) => CANONICAL[id]())
})

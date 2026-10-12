// G2: the independent adversarial review of 12 Oct (35 240 cases against 9e5f9567). Its exact algebra held, but eight
// MUSTs were in reading the text and in time: each exact call it gave is here, with the verdict the case deserves, and
// every call must answer inside the time budget (verdict.ts). The review's own harness is kept outside the repo; its
// hand-made wrong answers are re-run here from attack-hand.json.

import { describe, expect, it } from 'vitest'
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
import hand from './attack-hand.json'

const one = (value: string | number, multiplicity = 1) => ({ value: String(value), multiplicity })

/** The call's result, and a failure if it took longer than a public call may (1.5 s budget, with room for load). */
function timed<T>(run: () => T): T {
  const start = Date.now()
  const out = run()
  expect(Date.now() - start).toBeLessThan(2500)
  return out
}

describe('MUST 1: a denominator that cancels still leaves its zeros out', () => {
  it('roots: 1/(1/(x − 1)) = 0 has no root, x/(1/(x − 2)) = 0 has only 0', () => {
    expect(polyRootsCheck('1/(1/(x-1))', [one(1)])).toBe('different')
    expect(polyRootsCheck('1/(1/(x-1))', [])).toBe('equal')
    expect(polyRootsCheck('1/(1/(x-1)) = 0', [one('x = 1')])).toBe('different')
    expect(polyRootsCheck('x/(1/(x-2)) = 0', [one(0), one(2)])).toBe('different')
    expect(polyRootsCheck('x/(1/(x-2)) = 0', [one(0)])).toBe('equal')
    expect(polyRootsCheck('((x-1)^(-1))^(-1)', [one(1)])).toBe('different')
    expect(polyRootsCheck('((x-1)^(-1))^(-2)', [one(1, 2)])).toBe('different')
    expect(polyRootsCheck('x^2/x = 0', [one(0)])).toBe('different')
    expect(polyRootsCheck('x^2/x = 0', [])).toBe('equal')
    expect(polyRootsCheck('(x^2-1)/(x-1) = 0', [one(-1)])).toBe('equal')
    expect(polyRootsCheck('(x^2-1)/(x-1) = 0', [one(-1), one(1)])).toBe('different')
  })
  it('a linear system: 1/(1/x) = 0 has no solution', () => {
    expect(linearSystemCheck(['1/(1/x) = 0'], { kind: 'unique', values: { x: '0' } })).toBe('different')
    expect(linearSystemCheck(['1/(1/x) = 0'], { kind: 'none' })).toBe('equal')
    expect(linearSystemCheck(['1/(1/(x-1)) + y = 1', 'y = 1'], { kind: 'unique', values: { x: '1', y: '1' } })).toBe('different')
    expect(linearSystemCheck(['1/(1/(x-1)) + y = 1', 'y = 1'], { kind: 'none' })).toBe('equal')
    expect(linearSystemCheck(['1/(1/(x-1)) + y = 2', 'y = 1'], { kind: 'unique', values: { x: '2', y: '1' } })).toBe('equal')
    // A whole line less a point is not affine: not decided.
    expect(linearSystemCheck(['1/(1/x) + y = 0'], { kind: 'infinite', values: { x: '-y' } })).toBe('unknown')
    // An answer's value with a letter below the line is not read.
    expect(linearSystemCheck(['x + y = 1', '2x + 2y = 2'], { kind: 'infinite', values: { x: '1/(1/(1 - y))' } })).toBe('unknown')
  })
  it('a polynomial has no letter below the line, even one that cancels', () => {
    expect(polyEqual('1/(1/(x-1))', 'x-1')).toBe('unknown')
    expect(polyEqual('1/(1/x)', 'x')).toBe('unknown')
    expect(polyEqual('((x-1)^(-1))^(-1)', 'x-1')).toBe('unknown')
    // rationalEqual says equal where both are defined, and names the point.
    const r = rationalEqual('1/(1/(x-1))', 'x-1')
    expect(r.verdict).toBe('equal')
    expect(r.excluded.map((e) => e.exact)).toEqual(['1'])
  })
  it('partial fractions: a fraction inside a term is not read', () => {
    expect(partialFractionsCheck('x^2+x', 'x/(1/(x+1))')).toBe('unknown')
    expect(partialFractionsCheck('1/(x+1)^2', '1/(x+1)/(x+1)')).toBe('unknown')
  })
  it('partial fractions: polynomial terms that add up to 0 are not the standard form', () => {
    expect(partialFractionsCheck('1/(x^2-1)', '1/(2(x-1)) - 1/(2(x+1)) + x - x')).toBe('different')
    expect(partialFractionsCheck('1/(x^2-1)', '1/(2(x-1)) - 1/(2(x+1))')).toBe('equal')
    expect(partialFractionsCheck('(x^2+1)/(x-1)', 'x + 1 + 2/(x-1)')).toBe('equal')
    expect(partialFractionsCheck('(2x+3)/(x^2+3x+2)', '1/(x+1) + 1/(x+2) + 0')).toBe('equal')
  })
})

describe('MUST 2: |…| right after a letter is |…|, not m·a·g', () => {
  it('x|x| is x times |x|', () => {
    expect(expressionEqual('x|x|', '-x|-x|')).toBe('different')
    expect(expressionEqual('x|x-1| + x|1-x|', '0')).toBe('different')
    expect(expressionEqual('x|x|', 'x*|x|')).toBe('equal')
    expect(expressionEqual('θ|θ|', '-θ|-θ|')).toBe('different')
    expect(expressionEqual('y|x|', '-y|-x|')).toBe('different')
    expect(expressionEqual('3x|x|', '3x^2|1|')).toBe('different')
    expect(polyEqual('x|x|', '-x|-x|')).toBe('unknown')
    expect(rationalEqual('x|x|', '-x|-x|').verdict).toBe('different')
    expect(factorCheck('x^2', 'x|x|').verdict).not.toBe('equal')
  })
  it('derivatives and integrals of x|x|', () => {
    expect(derivativeCheck('x|x|', 'x', 'x|2|')).toBe('different')
    expect(derivativeCheck('x|x|', 'x', '2|x|')).toBe('equal')
    expect(integralCheck('x|2|', 'x', 'x|x|')).toBe('different')
    expect(integralCheck('2x', 'x', 'x|x|')).toBe('different')
    expect(integralCheck('|x|', 'x', 'x|x|/2')).toBe('equal')
    expect(derivativeCheck('|x|^3', 'x', '3x|x|')).toBe('equal')
    expect(derivativeCheck('(x^2)^(3/2)', 'x', '3x|x|')).toBe('equal')
  })
  it('ln|x| is ln(|x|)', () => {
    expect(expressionEqual('ln|x|', '-ln|-x|')).toBe('different')
    expect(derivativeCheck('ln|x|', 'x', '1/x')).toBe('equal')
    expect(integralCheck('1/x', 'x', 'ln|x|')).toBe('equal')
    // Logarithms are not exact here; the numbers agree, so it stays unknown, never different.
    expect(expressionEqual('ln(x^2)', '2 ln|x|')).toBe('unknown')
    // x|x| = 4 holds at 2 but not at −2 (−2·2 ≠ 4): the bars are read, and −2 is shown wrong.
    expect(polyRootsCheck('x|x| = 4', [one(2), one(-2)])).toBe('different')
    expect(polyRootsCheck('x|x| = 4', [one(2)])).toBe('unknown')
  })
  it('bars pair as the shared reader pairs them, and an unpaired bar is not read', () => {
    // |…| inside |…| is not exact as a quotient; as atoms (G2B) |1 − |x|| is |−(|x| − 1)| = ||x| − 1|.
    expect(expressionEqual('||x|-1|', '|1-|x||')).toBe('equal')
    expect(expressionEqual('|x||x+1|', '|x^2+x|')).toBe('equal')
    expect(expressionEqual('|x', 'x')).toBe('unknown')
    expect(expressionEqual('2|x|/x', '2x/|x|')).toBe('equal')
  })
})

describe('MUST 3: √ and ∛ after a letter are roots, not s·q·r·t', () => {
  it('the √2 + √3 = √5 error is shown wrong', () => {
    expect(expressionEqual('x√2 + x√3', 'x√5')).toBe('different')
    expect(expressionEqual('x√2 + x√2', 'x√4')).toBe('different')
    expect(polyEqual('x√2 + x√2', 'x√4')).toBe('unknown')
    expect(expressionEqual('x∛2 + x∛6', 'x∛8')).toBe('different')
    expect(expressionEqual('x√(x+1) - x√x', 'x√1')).toBe('different')
    expect(derivativeCheck('x√2 + x√3', 'x', '√5')).toBe('different')
    expect(integralCheck('2√2', 'x', 'x√2 + x√6')).toBe('different')
  })
  it('right answers with a glued root', () => {
    expect(expressionEqual('x√9', '3x')).toBe('equal')
    // √8 = 2√2 (G2B: a constant root is an atom, its square factor taken out).
    expect(expressionEqual('2x√2', 'x√8')).toBe('equal')
    expect(expressionEqual('x√2', '√2 x')).not.toBe('different')
    expect(derivativeCheck('x^2√4', 'x', '4x')).toBe('equal')
  })
})

describe('MUST 4: a function name without its bracket is never a variable', () => {
  it.each([
    ['sin 2x', '2 sin x'],
    ['cos 2x', '2 cos x'],
    ['tan 2x', '2 tan x'],
    ['ln 2x', '2 ln x'],
    ['exp 2x', '2 exp x'],
    ['log 100', '100 log'],
    ['sqrt 4', '4 sqrt'],
    ['sin x', 'x sin'],
    ['tan x^2', 'x^2 tan'],
    ['cosx', 'xcos'],
    ['xsin(x)', 'sin(x) x'],
    ['arcsin(x)', 'arcsin(x)'],
    ['sin^2(x)', 'sin(x)^2'],
    ['E', 'E'],
    ['PI*x', 'x*PI'],
    ['gamma(x)', 'x gamma']
  ])('%s vs %s is unknown', (a, b) => {
    expect(expressionEqual(a, b)).toBe('unknown')
    expect(polyEqual(a, b)).toBe('unknown')
  })
  it('in the calculus checkers too', () => {
    expect(derivativeCheck('sin x^2', 'x', '2 sin x')).toBe('unknown')
    expect(integralCheck('sin 2x', 'x', 'sin x^2')).toBe('unknown')
    expect(derivativeCheck('sin x', 'x', 'sin')).toBe('unknown')
    expect(numericEqual('sin 2x', '2 sin x').verdict).toBe('unknown')
    // With its bracket, a function still reads: 2 sin(x) is not sin(2x), by numbers.
    expect(expressionEqual('sin(2x)', '2 sin(x)')).toBe('different')
    expect(expressionEqual('2sin(x)', '2*sin(x)')).toBe('equal')
  })
})

describe('MUST 5–8: every call answers within the budget', () => {
  it('sinh, cosh and exp past 10⁶ are skipped, not worked out for minutes', () => {
    expect(timed(() => numericEqual('cosh(x)^2 - sinh(x)^2', '1').verdict)).toBe('unknown')
    // Proved exactly since G2B (sinh and cosh as exponentials), and still inside the budget.
    expect(timed(() => derivativeCheck('sinh(x)', 'x', 'cosh(x)'))).toBe('equal')
    expect(timed(() => numericEqual('sinh(x)', 'sinh(x) + 1').verdict)).toBe('different')
    expect(timed(() => numericEqual('exp(x^2)', 'exp(x^2) + 1').verdict)).toBe('different')
    expect(timed(() => numericEqual('x^(x+0.5)', 'x^(x+0.5)').verdict)).toBe('unknown')
    expect(timed(() => numericEqual('sin(x^3)', 'sin(x^3)').verdict)).toBe('unknown')
  })
  it('a polynomial with huge numbers or degree: T₆₄(8192x) and Mignotte', () => {
    let T = '8192*x'
    for (let i = 0; i < 6; i++) T = `2*(${T})^2 - 1`
    const r = timed(() => rationalEqual(`1/(${T})`, `1/(${T})`))
    expect(r).toEqual({ verdict: 'equal', excluded: [], excludedComplete: false })
    expect(timed(() => expressionEqual(`1/(${T})`, `1/(${T}) + 1`))).toBe('different')
    // Two zeros 2⁻⁴⁶² apart are two excluded points, though they are one double.
    const M = 'x^64 - 2*(16384x - 1)^2'
    const m = timed(() => rationalEqual(`1/(${M})`, `1/(${M})`))
    expect(m.verdict).toBe('equal')
    expect(m.excluded.length).toBe(4)
    expect(m.excluded[1].value).toBe(m.excluded[2].value)
  })
  it('exact powers past their size are not built', () => {
    expect(timed(() => expressionEqual('((2^1000)^1000)^60', '((2^1000)^1000)^60 + 1'))).toBe('unknown')
    expect(timed(() => factorCheck('((9^1000)^1000)^40*x + 1', '((9^1000)^1000)^40*x + 1').verdict)).toBe('unknown')
    expect(timed(() => polyEqual('(x+1)^1000', '(1+x)^1000'))).toBe('unknown')
    expect(timed(() => polyEqual('(x+1)^200', '(1+x)^200'))).toBe('equal')
  })
  it('roots of multiplicity 300 and 250', () => {
    expect(timed(() => polyRootsCheck('(x - 1/3)^300*(x-2/7)^300', [one('1/3', 300), one('2/7', 300)]))).toBe('unknown')
    expect(timed(() => polyRootsCheck('(x^2 - 1/3)^500', [one('sqrt(1/3)', 250), one('-sqrt(1/3)', 250)]))).toBe('unknown')
    expect(timed(() => polyRootsCheck('(x - 1/3)^30*(x-2/7)^30', [one('1/3', 30), one('2/7', 30)]))).toBe('equal')
  })
  it('long and deep input', () => {
    const words = (n: number): string => Array.from({ length: n }, () => 'a').join(' ')
    // a·a·…·a, 2000 times, is not a.
    expect(timed(() => expressionEqual(words(2000), 'a'))).toBe('different')
    let nest = 'x'
    for (let i = 0; i < 300; i++) nest = `sin(${nest})`
    // √(−1 − x²) is defined nowhere on the real line, so nothing decides it; it must still answer in time.
    expect(timed(() => expressionEqual(`sqrt(-1-x^2) + ${nest}`, `sqrt(-1-x^2) + ${nest} + 1`))).toBe('unknown')
    const sum = (ks: number[]): string => ks.map((k) => `1/(x - ${k})`).join(' + ')
    const ks = Array.from({ length: 150 }, (_, k) => k)
    expect(timed(() => rationalEqual(sum(ks), sum([...ks].reverse())).verdict)).not.toBe('different')
    const forty = Array.from({ length: 40 }, (_, k) => k)
    expect(timed(() => expressionEqual(forty.map((k) => `|x - ${k}|`).join(' + '), forty.map((k) => `|${k} - x|`).join(' + ')))).not.toBe('different')
    const thirty = `1/(${Array.from({ length: 30 }, (_, k) => `(x - ${k})`).join('*')})`
    expect(timed(() => partialFractionsCheck(thirty, thirty))).not.toBe('equal')
  })
})

describe('SHOULD: two spellings of one surd are one number', () => {
  it('100003·√(2·100019) is √(2·100003²·100019)', () => {
    expect(polyRootsCheck('x^2 - 2*100003^2*100019', [one('100003*sqrt(2*100019)'), one('-sqrt(2*100003^2*100019)')])).toBe('equal')
    expect(polyRootsCheck('x^2 - 2*100003^2*100019', [one('100003*sqrt(2*100019)'), one('sqrt(2*100003^2*100019)')])).toBe('different')
    // As expressions the surds are not exact here (numbers agree, and never prove it).
    expect(expressionEqual('100003*sqrt(2*100019)', 'sqrt(2*100003^2*100019)')).toBe('unknown')
  })
})

interface HandCase {
  checker: string
  args: unknown[]
}
const CHECKERS: Record<string, (...args: never[]) => unknown> = {
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
}
const verdictOf = (v: unknown): string => (typeof v === 'string' ? v : (v as { verdict: string }).verdict)

describe("the review's hand-made wrong answers, re-run", () => {
  it(`${(hand as HandCase[]).length} wrong answers: none is equal, each answers within the budget`, () => {
    const falseEqual: string[] = []
    const slow: string[] = []
    for (const c of hand as HandCase[]) {
      const start = Date.now()
      const v = verdictOf(CHECKERS[c.checker](...(c.args as never[])))
      const ms = Date.now() - start
      const name = `${c.checker}(${c.args.map((a) => JSON.stringify(a)).join(', ')})`
      if (v === 'equal') falseEqual.push(name)
      if (ms > 2500) slow.push(`${name} ${ms} ms`)
    }
    expect(falseEqual).toEqual([])
    expect(slow).toEqual([])
  }, 120_000)
})

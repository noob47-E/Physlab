// EXPR (polish part P-NUM): a line typed with ×, · or the ×10 form must mean what it means on paper
// and on a scientific calculator. Everything a student types (command bar, answer boxes, Lab Data, the vector
// calculator) goes through math/expr.ts `preprocess`, which rewrites `a × b` into timesOrCross(a, b)
// and `a · b` into dot(a, b) (infixToCall). Three faults made it misread ordinary maths:
// - PREC: the operand scanners (leftOperandStart, rightOperandEnd) stop at ^, so × bound tighter
//   than a power on both sides: 2×3^2 was (2×3)^2 = 36 and 2^3×4 was 2^(3×4) = 4096.
// - E-NOTATION: both scanners took the e of 1.6e-19 for a letter and stopped at its sign, so
//   2×1.6e-19 was 2 × 1.6 × e − 19 = −10.30 and 1.6e-19×2 could not be read at all.
// - X10: the ×10 literal rule read one digit of the mantissa (12.5×10^3 was 1 × 2.5×10³ = 2500),
//   no "+" exponent, ran after ² ³ ⁻¹ had been rewritten (1.6×10⁻¹² was (1.6×10⁻¹)² = 0.0256),
//   knew only ×, and fired on the exponent of a power or of an e-number (3^2×10^3 was 3^2000).
// Every value is checked against plain JS arithmetic, through the app's own evaluator — preprocess
// then the exported mathjs instance, as the command bar, the answer checker and Lab Data run it —
// never against a rounded guess. Tests named GUARD pass today and must keep passing.
// The fix also brings in the wave head's grants, pinned below: DIV — × is worked out left to right
// with / and ÷ (1/2×3 was 1/6); SUP — a run of superscript digits is one exponent (2⁴, 10⁻³);
// DOT — · multiplies two numbers and scales a vector (2·3 and 2·A were refused); and THE
// CONVENTION — a×10ⁿ is one number wherever it stands, as a scientific calculator's ×10ˣ (standard form) key enters it.
// EXPR2 (three more decisions of the wave head, pinned below): STAR — only × · ⋅, the forms PhysLab
// prints, are ×10 signs, and a plain * is a plain multiplication, so 1/2*10^3 is 500 while 1/2×10^3
// is 0.0005; COMPLEX — × multiplies complex scalars (sqrt(-4)×sqrt(-9) is −6, not "Expected a vector
// or point"); PERCENT — a postfix % is always ÷100 as on a scientific calculator, never a modulo (that
// is "mod"), so 50% + 2 is 2.5 (mathjs read it as 50 mod 2 = 0).

import { beforeEach, describe, expect, it, vi } from 'vitest'

// The command bar's SymPy worker cannot start here, and the stylesheet is not loaded: the same two
// stand-ins tests/commands.test.ts uses. Neither touches the arithmetic under test.
vi.mock('../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async (op: string) => ({ latex: `\\text{${op}}`, text: `${op}(x)`, numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {} },
  CAS_OPS: []
}))
vi.mock('../src/renderer/src/app/theme', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/renderer/src/app/theme')>()),
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888'
}))

import { inferKind, math, preprocess, toV3, type ValueKind } from '../src/renderer/src/math/expr'
import { runCommand } from '../src/renderer/src/lang/commands'
import { scene, type LogEntry } from '../src/renderer/src/core/store'
import type { EvalResult } from '../src/renderer/src/core/types'
import { cardValue, type Card } from '../src/renderer/src/panels/vectorCalcStore'
import { resetGlobals } from './helpers/globals'

beforeEach(resetGlobals)

type Scope = Record<string, unknown>
/** What the app does with a typed line: preprocess, then the shared mathjs instance. */
const ev = (typed: string, scope: Scope = {}): unknown => math.evaluate(preprocess(typed), { ...scope })
type Case = [typed: string, want: number, scope?: Scope]

/** One test per line, so each misreading shows on its own. A GUARD passes today and must keep passing. */
function eachNumber(cases: Case[], why: string, guard = false): void {
  for (const [typed, want, scope] of cases) {
    it(`${guard ? 'GUARD: ' : ''}${typed} = ${want}${scope ? ` with ${JSON.stringify(scope)}` : ''} — ${why}`, () => {
      expect(ev(typed, scope)).toBe(want)
    })
  }
}

describe('EXPR: ×, · and the ×10 form follow ordinary precedence, and a number is read whole', () => {
  describe('PREC: a power is worked out before the × on either side of it', () => {
    eachNumber(
      [
        ['2×3^2', 2 * Math.pow(3, 2)],
        ['2^3×4', Math.pow(2, 3) * 4],
        ['2×(3+1)^2', 2 * Math.pow(3 + 1, 2)],
        ['a×b^2', 2 * Math.pow(3, 2), { a: 2, b: 3 }],
        ['2×3^2^2', 2 * Math.pow(3, Math.pow(2, 2))],
        ['2^2^2×3', Math.pow(2, Math.pow(2, 2)) * 3],
        ['2 × 3 ^ 2', 2 * Math.pow(3, 2)],
        ['3 ^ 2 × 2', Math.pow(3, 2) * 2],
        ['2×sqrt(4)^2', 2 * Math.pow(Math.sqrt(4), 2)],
        ['sqrt(4)^2×2', Math.pow(Math.sqrt(4), 2) * 2],
        ['2×2^sqrt(4)', 2 * Math.pow(2, Math.sqrt(4))],
        ['2×3^(1+1)', 2 * Math.pow(3, 1 + 1)],
        ['(1+2)^2×2', Math.pow(1 + 2, 2) * 2],
        ['2×(3×4)^2', 2 * Math.pow(3 * 4, 2)],
        ['2×3×4^2', 2 * 3 * Math.pow(4, 2)],
        ['2^3×4×5', Math.pow(2, 3) * 4 * 5],
        ['1.5×10^3×2^2', 1.5e3 * Math.pow(2, 2)]
      ],
      'the power binds tighter than ×'
    )
    // ² and ³ are what a scientific calculator and PhysLab itself print; they become ^2 and ^3 before the ×.
    eachNumber(
      [
        ['2×3²', 2 * Math.pow(3, 2)],
        ['3²×2', Math.pow(3, 2) * 2]
      ],
      'a superscript square binds tighter than ×'
    )
    eachNumber(
      [
        ['2×3^-1', 2 * Math.pow(3, -1)],
        ['2^-1×4', Math.pow(2, -1) * 4],
        ['e^-x×2', Math.pow(Math.E, -2) * 2, { x: 2 }],
        ['2×-3^2', 2 * -Math.pow(3, 2)],
        ['-2×3^2', -(2 * Math.pow(3, 2))]
      ],
      'a minus sign in or before a power stays with that power'
    )
    eachNumber(
      [
        ['2×3x^2', 2 * (3 * Math.pow(2, 2)), { x: 2 }],
        ['3x^2×2', 3 * Math.pow(2, 2) * 2, { x: 2 }],
        ['2×x^2', 2 * Math.pow(2, 2), { x: 2 }],
        ['x^2×x^3', Math.pow(2, 2) * Math.pow(2, 3), { x: 2 }],
        ['2×x^2×3', 2 * Math.pow(2, 2) * 3, { x: 2 }]
      ],
      'a power of a letter, with or without a number written against it, binds tighter than ×'
    )
    // mathjs reads 3! as a factorial (a scientific calculator's x! key): (2×3)! = 720, and "3!×2" could not be read.
    eachNumber(
      [
        ['2×3!', 2 * 6],
        ['3!×2', 6 * 2]
      ],
      'a factorial binds tighter than ×'
    )
    it('a power next to a vector: 2^2×A and A×2^2 are both 4A', () => {
      const A = ev('<1, 2, 0>')
      expect(toV3(ev('2^2×A', { A }))).toEqual([4, 8, 0])
      expect(toV3(ev('A×2^2', { A }))).toEqual([4, 8, 0])
    })
    it('GUARD: "2×3≠7" is still true — ≠ becomes !=, and its ! is not a factorial', () => {
      expect(ev('2×3≠7')).toBe(true)
    })
    it('GUARD: "2×3!=7" typed with ! is still true — the ! of != is not a factorial', () => {
      expect(ev('2×3!=7')).toBe(true)
    })
    // 3!^2×2 was 3!^(2×2) = 1296, and 50%×2 could not be read: × took nothing on its left.
    eachNumber(
      [
        ['3!^2×2', Math.pow(6, 2) * 2],
        ['50%×2', 0.5 * 2]
      ],
      'a postfix ! or % stays with its own operand'
    )
    eachNumber([['2×50%', 2 * 0.5]], 'a percent after the right operand reads as today', true)
  })

  describe('E-NOTATION: a number such as 1.6e-19 is one operand on either side of ×', () => {
    eachNumber(
      [
        ['2×1.6e-19', 2 * 1.6e-19],
        ['1.6e-19×2', 1.6e-19 * 2],
        ['2×1.6e+3', 2 * 1.6e3],
        ['3.2e-19×1e2', 3.2e-19 * 1e2],
        ['2×1.6E-19', 2 * 1.6e-19],
        ['2e-1×3', 2e-1 * 3]
      ],
      'the e and its signed exponent belong to the number'
    )
    eachNumber(
      [
        ['1.6e-19', 1.6e-19],
        ['2×1e3', 2 * 1e3],
        ['1e3×2', 1e3 * 2]
      ],
      'a number in e form reads as today',
      true
    )
    // A scanner that took any "e-digits" for an exponent would make these (rate−2)×3 and 2×(e−1).
    eachNumber(
      [
        ['e-2×3', Math.E - 2 * 3],
        ['2×e-1', 2 * Math.E - 1],
        ['rate-2×3', 10 - 2 * 3, { rate: 10 }],
        ['2×rate-1', 2 * 5 - 1, { rate: 5 }]
      ],
      'Euler’s e, or a name ending in e, is not the exponent of a number',
      true
    )
  })

  describe('X10: "mantissa × 10^exponent" is one number, written any way a student writes it', () => {
    eachNumber(
      [
        ['12.5×10^3', 12.5e3],
        ['16×10^-20', 1.6e-19],
        ['.5×10^3', 0.5e3]
      ],
      'the whole mantissa is read, not its last digit'
    )
    eachNumber([['2.5×10^+3', 2.5e3]], 'a + exponent is read')
    eachNumber(
      [
        ['1.6×10⁻¹⁹', 1.6e-19],
        ['1.6 × 10⁻¹⁹', 1.6e-19],
        ['1.6×10⁻¹²', 1.6e-12],
        ['6.02×10²³', 6.02e23],
        ['3×10⁸', 3e8],
        ['2 × 10⁻³', 2e-3]
      ],
      'a superscript exponent is read whole, before ² ³ ⁻¹ are rewritten'
    )
    eachNumber(
      [
        ['12.5·10^3', 12.5e3],
        // Exactly the literal: as a multiplication mathjs gives 1.6000000000000002e-19.
        ['1.6⋅10^-19', 1.6e-19],
        ['1.6·10^-19', 1.6e-19]
      ],
      'the sign may be × (above), · or ⋅ — the forms PhysLab prints — and the result is the literal'
    )
    eachNumber(
      [
        // Fired inside the name: a(2e3), "a is not a function".
        ['a2×10^3', 5 * 1e3, { a2: 5, a: 7 }],
        // Fired on the 2 of 3^2: 3^(2e3) = Infinity.
        ['3^2×10^3', Math.pow(3, 2) * Math.pow(10, 3)],
        // Fired on the 3 of 2^3: 2^(3e-2) = 1.021.
        ['2^3×10^-2', Math.pow(2, 3) * Math.pow(10, -2)],
        // Fired on the 9 of the exponent -19: 1.6e-1 × 9e3 = 1440.
        ['1.6e-19×10^3', 1.6e-19 * Math.pow(10, 3)],
        // The literal, then (1.6e-19 × 10)^3 = 4.1e-54.
        ['1.6×10^-19×10^3', 1.6e-19 * Math.pow(10, 3)]
      ],
      'the rule never takes a name’s digit, a power’s exponent or an e-number’s exponent for a mantissa'
    )
    eachNumber(
      [
        ['3×10^8', 3e8],
        ['6.02×10^23', 6.02e23],
        ['1.6×10^−19', 1.6e-19],
        ['2.5 × 10 ^ -3', 2.5e-3],
        ['1.5×10^(-3)', 1.5e-3],
        ['2.5×10²', 2.5e2],
        ['-1.6×10^-19', -1.6e-19],
        ['1.6×10^-19×2', 1.6e-19 * 2],
        ['2×1.6×10^-19', 2 * 1.6e-19],
        ['2 × 10^3 × 4', 2e3 * 4],
        // A plain * is an ordinary product, so a power before it is left alone as well: not 2^(3e2).
        ['2^3*10^2', Math.pow(2, 3) * Math.pow(10, 2)]
      ],
      'reads as today',
      true
    )
    eachNumber(
      [
        // The old rule's \)? took the closing bracket of the group around it: ((1.5e-3)×2, unread.
        ['(1.5×10^-3)×2', 1.5e-3 * 2],
        // An exponent that runs on is not the end of the number: 10^3^2 is 10^9 and 10^3! is 10^6.
        ['2×10^3^2', 2 * Math.pow(10, Math.pow(3, 2))],
        ['2×10^3!', 2 * Math.pow(10, 6)],
        // Not a ×10 literal at all: the old rule made it (1.6e3).5, read as 800.
        ['1.6×10^3.5', 1.6 * Math.pow(10, 3.5)]
      ],
      'the ×10 form is taken only when it is the whole number'
    )
    it('a ×10 magnitude reaches the angle form: 1.5×10^3 ∠ 30° is 1500 at 30°', () => {
      const [x, y, z] = toV3(ev('1.5×10^3 ∠ 30°'))
      expect(x).toBeCloseTo(1500 * Math.cos(Math.PI / 6), 9)
      expect(y).toBeCloseTo(1500 * Math.sin(Math.PI / 6), 9)
      expect(z).toBe(0)
    })
  })

  describe('DIV: × is worked out left to right with / and ÷, as * is', () => {
    // The left operand of × ran back only to the nearest sign, so it took the 2 of 1/2 alone:
    // 1/2×3 was 1/(2×3) = 1/6, and ½mv² typed as 1/2×4×3^2 was 1/72 of the right answer.
    eachNumber(
      [
        ['1/2×3', (1 / 2) * 3],
        ['6÷2×3', (6 / 2) * 3],
        ['1/2×4×3^2', (1 / 2) * 4 * Math.pow(3, 2)],
        ['1/2×4×3²', (1 / 2) * 4 * Math.pow(3, 2)],
        ['m/2×v^2', (4 / 2) * Math.pow(3, 2), { m: 4, v: 3 }],
        ['2/3^2×4', (2 / Math.pow(3, 2)) * 4],
        ['12/3×2/4', ((12 / 3) * 2) / 4],
        ['1/-2×3', (1 / -2) * 3],
        ['1-1/2×3', 1 - (1 / 2) * 3]
      ],
      'the / before the × is worked out first'
    )
    eachNumber(
      [
        ['3×1/2', (3 * 1) / 2],
        ['2×3/4', (2 * 3) / 4]
      ],
      'the right operand still stops at /',
      true
    )
    it('a / before a vector: 1/2×A is A/2', () => {
      expect(toV3(ev('1/2×A', { A: ev('<1, 2, 0>') }))).toEqual([0.5, 1, 0])
    })
  })

  describe('THE CONVENTION: a×10ⁿ is one number wherever it stands, as the ×10ˣ (standard form) key enters it', () => {
    // PhysLab prints 0.0005 as 5×10^-4 and must read that back as one number, so after a / the whole
    // ×10 form is the divisor — while an ordinary × after a / is worked out left to right.
    it('1/2×10^3 is 1/(2×10³) = 0.0005, while 1/2×3 is (1/2)×3 = 1.5 and 1/2×4×3^2 is 18', () => {
      expect(ev('1/2×10^3')).toBe(1 / 2e3)
      expect(ev('1/2×3')).toBe(1.5)
      expect(ev('1/2×4×3^2')).toBe(18)
    })
    eachNumber(
      [
        ['1/2·10^3', 1 / 2e3],
        ['1/2⋅10^3', 1 / 2e3]
      ],
      'written with · or ⋅, the ×10 form is one number too'
    )
    eachNumber(
      [
        ['−1.6×10^-19', -1.6e-19],
        ['+1.6×10^-19', 1.6e-19]
      ],
      'a sign before the ×10 form leaves the literal exact',
      true
    )
  })

  describe('STAR: a plain * is a plain multiplication — only × · ⋅ make a ×10 literal', () => {
    // * used to be a ×10 sign too, so 1/2*10^3 was the one number 2×10³ under a 1/ (0.0005) and
    // 1.6*10^-19 the literal 1.6e-19. Typed with *, as in mathjs and in a Numbas answer, the same
    // digits are ordinary products: (1/2) × 1000 = 500, and 1.6 × 10⁻¹⁹ worked out like any product.
    eachNumber(
      [
        ['1/2*10^3', (1 / 2) * Math.pow(10, 3)],
        ['1/2*10^-3', (1 / 2) * Math.pow(10, -3)],
        ['1.6*10^-19', 1.6 * Math.pow(10, -19)],
        ['1.6 * 10^-19', 1.6 * Math.pow(10, -19)],
        ['2*10^3', 2 * Math.pow(10, 3)],
        ['2.5 * 10 ^ -3', 2.5 * Math.pow(10, -3)],
        ['1.5*10^(-3)', 1.5 * Math.pow(10, -3)]
      ],
      'the * is an ordinary product'
    )
    it('1/2*10^3 is (1/2)×1000 = 500 while 1/2×10^3 is the one number 2×10³ under the 1/ = 0.0005', () => {
      expect(ev('1/2*10^3')).toBe(500)
      expect(ev('1/2×10^3')).toBe(1 / 2e3)
    })
    it('1.6*10^-19 is JavaScript’s 1.6 * 10 ** -19, not the literal 1.6e-19 that 1.6×10^-19 still reads back as', () => {
      expect(ev('1.6*10^-19')).toBe(1.6 * 10 ** -19)
      expect(ev('1.6×10^-19')).toBe(1.6e-19)
    })
  })

  describe('PERCENT: a postfix % is always a percent, the operand over 100 — never a modulo ("mod" is the modulo)', () => {
    // mathjs read 50% + 2 as 50 mod 2 = 0, 50% − 2 as 50 mod −2 = 0 and 7%3 as 7 mod 3 = 1, and worked
    // 2 + 50% out as the 2 plus 50 % of itself = 3 and 100 + 10% as 110. A scientific calculator's % key
    // divides by 100 and does nothing else.
    eachNumber(
      [
        ['50%', 50 / 100],
        ['50% + 2', 50 / 100 + 2],
        ['50% − 2', 50 / 100 - 2],
        ['50% - 2', 50 / 100 - 2],
        ['2 + 50%', 2 + 50 / 100],
        ['100 + 10%', 100 + 10 / 100],
        ['100 − 10%', 100 - 10 / 100],
        ['10%×50', (10 / 100) * 50],
        ['200×15%', 200 * (15 / 100)],
        ['(20+30)%', (20 + 30) / 100],
        ['50 %', 50 / 100],
        ['(50%)', 50 / 100],
        ['-50%', -(50 / 100)],
        ['50%%', 50 / 100 / 100]
      ],
      'the % is the operand over 100'
    )
    // The operand is the name, number, bracket or call the % is written against, as for a !: 3!% is
    // 6/100 and 2^3% is 2^(3/100) — a student who means the percent of 2³ writes (2^3)%.
    eachNumber(
      [
        ['x%', 20 / 100, { x: 20 }],
        ['2x%', (2 * 20) / 100, { x: 20 }],
        ['sqrt(100)%', Math.sqrt(100) / 100],
        ['3!%', 6 / 100],
        ['1.6e3%', 1.6e3 / 100],
        ['1.5×10^3%', 1.5e3 / 100],
        ['(2^3)%', Math.pow(2, 3) / 100],
        ['2^3%', Math.pow(2, 3 / 100)]
      ],
      'the % belongs to the operand it follows'
    )
    // The old pin "7%3×2 = (7 mod 3)×2 = 2" is the percent now: 7% is 0.07, and the 3 and the 2 multiply it.
    eachNumber(
      [
        ['7%3', (7 / 100) * 3],
        ['7%3×2', (7 / 100) * (3 * 2)]
      ],
      'a % is no modulo: what follows it multiplies, as on a scientific calculator'
    )
    eachNumber(
      [
        ['7 mod 3', 1],
        ['7 mod 3 + 1', 2]
      ],
      'the modulo is written mod, which mathjs reads as it stands',
      true
    )
    it('a percent scales a vector: 50%×A and A×50% are both half of A', () => {
      const A = ev('<1, 2, 0>')
      expect(toV3(ev('50%×A', { A }))).toEqual([0.5, 1, 0])
      expect(toV3(ev('A×50%', { A }))).toEqual([0.5, 1, 0])
    })
    it('a % with nothing before it is refused, not read as a number: "% 5" and "5 + %"', () => {
      expect(() => ev('% 5')).toThrow()
      expect(() => ev('5 + %')).toThrow()
    })
  })

  describe('COMPLEX: × multiplies complex scalars as * does; between vectors it is still the cross product', () => {
    // timesOrCross counted only a real number or a unit as a scalar, so two complex numbers fell
    // through to the cross product and were refused: "Expected a vector or point".
    const parts = (v: unknown) => [math.re(v as never), math.im(v as never)]
    it('sqrt(-4)×sqrt(-9) is −6, as sqrt(-4)*sqrt(-9) is', () => {
      const product = ev('sqrt(-4)×sqrt(-9)')
      expect(product).toEqual(math.evaluate('sqrt(-4)*sqrt(-9)'))
      expect(parts(product)).toEqual([-6, 0])
    })
    it('(2+sqrt(-1))×(3-sqrt(-1)) is 7 + i, as with *', () => {
      const product = ev('(2+sqrt(-1))×(3-sqrt(-1))')
      expect(product).toEqual(math.evaluate('(2+sqrt(-1))*(3-sqrt(-1))'))
      expect(parts(product)).toEqual([7, 1])
    })
    it('GUARD: a complex number times a real number multiplies: sqrt(-4)×2 and 2×sqrt(-4) are 4i', () => {
      expect(ev('sqrt(-4)×2')).toEqual(math.evaluate('sqrt(-4)*2'))
      expect(ev('2×sqrt(-4)')).toEqual(math.evaluate('2*sqrt(-4)'))
      expect(parts(ev('sqrt(-4)×2'))).toEqual([0, 4])
    })
    it('GUARD: a complex number next to a vector is still refused in words — a drawing has no complex arrows', () => {
      const A = ev('<1, 2, 0>')
      expect(() => ev('sqrt(-4)×A', { A })).toThrow('Expected a vector or point')
      expect(() => ev('A×sqrt(-4)', { A })).toThrow('Expected a vector or point')
    })
  })

  describe('SUP: a run of superscript digits is one exponent', () => {
    // Only ², ³ and ⁻¹ were read, one at a time: 2⁴ and 10⁻³ could not be read, and 2³² was 2^3^2 = 512.
    eachNumber(
      [
        ['2⁴', Math.pow(2, 4)],
        ['10⁻³', Math.pow(10, -3)],
        ['10⁺³', Math.pow(10, 3)],
        ['2³²', Math.pow(2, 32)],
        ['2×3⁴', 2 * Math.pow(3, 4)]
      ],
      'the whole run is the exponent'
    )
    eachNumber(
      [
        ['x²', Math.pow(3, 2), { x: 3 }],
        ['x⁻¹', Math.pow(4, -1), { x: 4 }]
      ],
      'reads as today',
      true
    )
    it('GUARD: 9.8 m/s² is still an acceleration of 9.8 m/s²', () => {
      expect((ev('9.8 m/s²') as { toNumber: (unit: string) => number }).toNumber('m/s^2')).toBe(9.8)
    })
  })

  describe('DOT: · multiplies two numbers and scales a vector; between two vectors it is the dot product', () => {
    // dot() took both sides for vectors, so 2·3, 5·√2 and 2·A were refused: "Expected a vector or point".
    eachNumber(
      [
        ['2·3', 2 * 3],
        ['2⋅3', 2 * 3],
        ['5·√2', 5 * Math.sqrt(2)],
        ['1/2·4', (1 / 2) * 4]
      ],
      'two numbers multiply'
    )
    const vectors = (): Scope => ({ A: ev('<1, 2, 0>'), B: ev('<3, -1, 2>') })
    it('a number and a vector: 2·A and A·2 are both 2A', () => {
      expect(toV3(ev('2·A', vectors()))).toEqual([2, 4, 0])
      expect(toV3(ev('A·2', vectors()))).toEqual([2, 4, 0])
    })
    it('GUARD: A·B is still the dot product 1', () => {
      expect(ev('A·B', vectors())).toBe(1)
    })
    // P-PARSE H4: a complex number is a scalar to · as it is to ×, so sqrt(-4)·2 is 4i (it was refused).
    it('a complex number beside a number is multiplied: sqrt(-4)·2 is 4i', () => {
      expect(String(ev('sqrt(-4)·2'))).toBe('4i')
    })
  })

  describe('GUARD: vector × and · mean what they mean today', () => {
    // The app's own vector values, as <…> makes them.
    const vectors = (): Scope => ({ A: ev('<1, 2, 0>'), B: ev('<3, -1, 2>'), C: ev('<0, 4, 1>') })
    it('GUARD: A×B is the cross product (4, −2, −7); 2×A and A×2 are 2A', () => {
      const s = vectors()
      expect(toV3(ev('A×B', s))).toEqual([4, -2, -7])
      expect(toV3(ev('2×A', s))).toEqual([2, 4, 0])
      expect(toV3(ev('A×2', s))).toEqual([2, 4, 0])
    })
    it('GUARD: (A×B)·C = −15 and |A×B| = √69', () => {
      const s = vectors()
      expect(ev('(A×B)·C', s)).toBe(-15)
      expect(ev('|A×B|', s)).toBeCloseTo(Math.sqrt(69), 12)
    })
    it('GUARD: A×B×C groups left to right: (A×B)×C = (26, −4, 16)', () => {
      expect(toV3(ev('A×B×C', vectors()))).toEqual([26, -4, 16])
    })
    it('GUARD: A·B×C and A×B·C are both the scalar triple product −15 (× is worked out before ·, as today)', () => {
      const s = vectors()
      expect(ev('A·B×C', s)).toBe(-15)
      expect(ev('A×B·C', s)).toBe(-15)
    })
    it('GUARD: a primed name stays one operand: A′×B and 2×A′', () => {
      const s = { ...vectors(), 'A′': ev('<1, 2, 0>') }
      expect(toV3(ev('A′×B', s))).toEqual([4, -2, -7])
      expect(toV3(ev('2×A′', s))).toEqual([2, 4, 0])
    })
  })

  describe('the command bar answers what the line means', () => {
    beforeEach(() => {
      resetGlobals()
      scene().newScene()
      scene().clearLog()
      scene().setActiveSpace('vectors')
      scene().setViewMode('2d')
    })
    const bar = async (line: string): Promise<LogEntry> => {
      await runCommand(line)
      return scene().log.at(-1) ?? ({ id: 0, input: '', kind: 'info' } as LogEntry)
    }
    const computedOf = (name: string) => scene().ev.values.get(scene().ev.names.get(name) ?? '')

    it('"2×3^2" answers = 18', async () => {
      expect((await bar('2×3^2')).text).toBe('= 18')
    })
    it('"12.5×10^3" answers = 12500', async () => {
      expect((await bar('12.5×10^3')).text).toBe('= 12500')
    })
    it('"k = 2×3^2" makes k = 18 (the stored definition is worked out by the scene evaluator)', async () => {
      await bar('k = 2×3^2')
      expect(computedOf('k')).toEqual({ type: 'number', value: 18 })
    })
    it('"1/2×4×3^2" answers = 18, "6÷2×3" answers = 9 and "2·3" answers = 6', async () => {
      expect((await bar('1/2×4×3^2')).text).toBe('= 18')
      expect((await bar('6÷2×3')).text).toBe('= 9')
      expect((await bar('2·3')).text).toBe('= 6')
    })
    // A fraction is shown with its exact form first ("= 5/2 ≈ 2.5"), so read the number the answer ends with.
    const numberOf = (e: LogEntry): string => (e.text ?? e.tex ?? '').split(/[=≈]|\\approx/).pop()?.trim() ?? ''
    it('"50% + 2" and "2 + 50%" both answer 2.5 — a percent is ÷100, never a modulo or an add-on', async () => {
      expect(numberOf(await bar('50% + 2'))).toBe('2.5')
      expect(numberOf(await bar('2 + 50%'))).toBe('2.5')
    })
    it('"7 mod 3" answers = 1 and "1/2*10^3" answers = 500', async () => {
      expect((await bar('7 mod 3')).text).toBe('= 1')
      expect((await bar('1/2*10^3')).text).toBe('= 500')
    })
    it('GUARD: "sqrt(-4)×sqrt(-9)" answers what "sqrt(-4)*sqrt(-9)" does, not a refusal', async () => {
      const typed = await bar('sqrt(-4)×sqrt(-9)')
      expect(typed.kind).toBe('result')
      expect(typed.text).toBe((await bar('sqrt(-4)*sqrt(-9)')).text)
    })
    it('GUARD: "2 × 3" answers = 6 and "12500" answers = 12500', async () => {
      expect((await bar('2 × 3')).text).toBe('= 6')
      expect((await bar('12500')).text).toBe('= 12500')
    })
    // M6: "2·A" is dot(2, A), and inferKind knew no dot, so the bar took it for a number: "C = 2·A" was
    // refused ("C: not a number") and "2·A" answered a bare "= [2, 4, 0]".
    it('"C = 2·A" makes the vector C = (2, 4, 0), and "2·A" answers as a vector — not "C: not a number" and a bare list', async () => {
      await bar('A = <1, 2, 0>')
      const made = await bar('C = 2·A')
      expect(made.kind).toBe('result')
      expect(computedOf('C')).toMatchObject({ type: 'vector', comp: [2, 4, 0] })
      const typed = await bar('2·A')
      expect(typed.kind).toBe('result')
      expect(typed.text ?? '').not.toContain('[')
      expect(typed.tex ?? '').toContain('\\hat{i}')
    })
  })

  describe('the vector calculator reads a card the same way', () => {
    const noScene = { values: new Map() } as unknown as EvalResult
    const card = (id: number, name: string, latex: string): Card => ({ id, name, entry: 'comp', latex, mag: '1', angle: '0', sceneId: '' })
    const A = card(81, 'A', '3\\hat{i}+4\\hat{j}')
    const P = card(82, 'P', '\\hat{i}+2\\hat{j}')
    /** Card B, typed under A = 3i + 4j and P = i + 2j. */
    const typedB = (latex: string) => {
      const B = card(83, 'B', latex)
      return cardValue(B, [A, P, B], noScene)
    }
    const cases: [latex: string, want: number[], why: string][] = [
      ['2\\times3^{2}\\hat{i}', [2 * Math.pow(3, 2), 0, 0], 'today (2×3)²i = 36i'],
      ['\\left|A\\right|^{2}\\times\\hat{i}', [Math.pow(5, 2), 0, 0], 'today |A|^(2×i), refused'],
      ['2^{3}\\times A', [8 * 3, 8 * 4, 0], 'today 2^(3×A), refused'],
      ['A\\times2^{3}', [3 * 8, 4 * 8, 0], 'today (A×2)³, "a vector cannot be squared"'],
      ['2\\times1.6e-19\\hat{i}', [2 * 1.6e-19, 0, 0], 'today 2 × 1.6 × e − 19i'],
      ['12.5\\times10^{3}\\hat{i}', [12.5e3, 0, 0], 'today 2500i'],
      ['6\\div2\\times3\\hat{i}', [9, 0, 0], 'today 6/(2×3i), refused'],
      ['2\\cdot A', [6, 8, 0], 'today refused: · took the 2 for a vector']
    ]
    for (const [latex, want, why] of cases) {
      it(`B = ${latex} is (${want.join(', ')}) — ${why}`, () => {
        expect(typedB(latex)).toEqual(want)
      })
    }
    it('GUARD: A × P is still the cross product (0, 0, 2), 2 × A is (6, 8, 0) and 2 × A × P is (0, 0, 4)', () => {
      expect(typedB('A\\times P')).toEqual([0, 0, 2])
      expect(typedB('2\\times A')).toEqual([6, 8, 0])
      expect(typedB('2\\times A\\times P')).toEqual([0, 0, 4])
    })
  })
})

// ---------------------------------------------------------------------------
// M1, M2, M6: three follow-ups to the above, found by the crew's review of preprocess and inferKind
// ---------------------------------------------------------------------------

// M1 — preprocess rewrote every · into dot(…) and then, in a second pass, every ⋅ (the other dot
// glyph). The pass for · ran to the end first, so with a ⋅ left of a · the · was made first and the
// line grouped right to left: A⋅B·C was dot(A, dot(B, C)), where A·B⋅C (the other order) was
// dot(dot(A, B), C). Both glyphs are one sign and one pass must group them left to right.
describe('M1: · and ⋅ are one sign, grouped left to right however they are mixed', () => {
  // With A·B = 1 and B·C = −2 the two groupings are different vectors: (A·B)C = C, A(B·C) = −2A.
  const vectors = (): Scope => ({ A: ev('<1, 2, 0>'), B: ev('<3, -1, 2>'), C: ev('<0, 4, 1>') })

  it('<1,0,0>⋅<0,1,0>·<1,1,0> is dot(dot(a, b), c) (today dot(a, dot(b, c)))', () => {
    expect(preprocess('<1,0,0>⋅<0,1,0>·<1,1,0>')).toBe('dot(dot(vec(1,0,0), vec(0,1,0)), vec(1,1,0))')
  })

  it('a ⋅ before a · groups as the other three spellings do — A⋅B·C, A·B⋅C, A⋅B⋅C and A·B·C are all dot(dot(A, B), C)', () => {
    for (const typed of ['A⋅B·C', 'A·B⋅C', 'A⋅B⋅C', 'A·B·C']) expect.soft(preprocess(typed), typed).toBe('dot(dot(A, B), C)')
  })

  it('four operands with the glyphs alternating group left to right too: a⋅b·c⋅d and a·b⋅c·d', () => {
    expect(preprocess('a⋅b·c⋅d')).toBe('dot(dot(dot(a, b), c), d)')
    expect(preprocess('a·b⋅c·d')).toBe('dot(dot(dot(a, b), c), d)')
  })

  it('the value is (A·B)C = (0, 4, 1), never A(B·C) = (−2, −4, 0), in every spelling', () => {
    for (const typed of ['A⋅B·C', 'A·B⋅C', 'A⋅B⋅C', 'A·B·C']) expect.soft(toV3(ev(typed, vectors())), typed).toEqual([0, 4, 1])
  })

  it('GUARD: ⋅ alone and beside × mean what · means — 2⋅3 = 6, A⋅B = 1, A⋅B×C = −15', () => {
    expect(ev('2⋅3')).toBe(6)
    expect(ev('A⋅B', vectors())).toBe(1)
    expect(ev('A⋅B×C', vectors())).toBe(-15)
  })
})

// M2 — the size of a size-and-angle (10 ∠ 30°, 10 N at 30°) was matched with a lowercase e only, so
// "1E3 ∠ 30°" was not rewritten at all: only its "3 ∠ 30°" was, which left "1E" in front of
// polarVec(3, 30 deg) and an error. mathjs and PhysLab's own readers take E as e.
describe('M2: the size of a size-and-angle may be written in e-notation with a capital E', () => {
  const POLAR: [typed: string, want: string][] = [
    ['1E3 ∠ 30°', 'polarVec(1E3, 30 deg)'],
    ['2.5E-1 ∠ 45°', 'polarVec(2.5E-1, 45 deg)'],
    ['1.0E+2 at 60°', 'polarVec(1.0E+2, 60 deg)'],
    ['5E0∠0°', 'polarVec(5E0, 0 deg)'],
    ['1E3 N ∠ 30°', 'polarVec(1E3 N, 30 deg)']
  ]
  for (const [typed, want] of POLAR) {
    it(`${typed} is ${want} (today the E is not matched)`, () => {
      expect(preprocess(typed)).toBe(want)
    })
  }

  it('1E3 ∠ 30° is the vector 1e3 ∠ 30° is — (1000 cos 30°, 500, 0) — and 2.5E-1 ∠ 90° points straight up', () => {
    const [x, y, z] = toV3(ev('1E3 ∠ 30°'))
    expect(x).toBeCloseTo(1000 * Math.cos(Math.PI / 6), 9)
    expect(y).toBeCloseTo(500, 9)
    expect(z).toBe(0)
    expect(toV3(ev('1E3 ∠ 30°'))).toEqual(toV3(ev('1e3 ∠ 30°')))
    const [ux, uy] = toV3(ev('2.5E-1 ∠ 90°'))
    expect(ux).toBeCloseTo(0, 12)
    expect(uy).toBeCloseTo(0.25, 12)
  })

  it('GUARD: the lowercase forms read as before — 1e3 ∠ 30°, 10 ∠ 30°, 10 N at 30° and 2.5e-1 ∠ 45°', () => {
    expect(preprocess('1e3 ∠ 30°')).toBe('polarVec(1e3, 30 deg)')
    expect(preprocess('10 ∠ 30°')).toBe('polarVec(10, 30 deg)')
    expect(preprocess('10 N at 30°')).toBe('polarVec(10 N, 30 deg)')
    expect(preprocess('2.5e-1 ∠ 45°')).toBe('polarVec(2.5e-1, 45 deg)')
  })
})

// M6 — dot() multiplies two numbers and scales a vector (DOT above), but inferKind knew no dot: any
// function outside its two lists is "a number", so "C = 2·A" was refused ("C: not a number") and
// "2·A" answered a bare "[2, 4, 0]" as if it were a number. A · is the product × is, so its kind is
// what * gives: two vectors (or points) make a number, and a number scales whichever is geometric.
// (× needs no case here: the command bar rewrites timesOrCross into cross or * before inferring.)
describe('M6: inferKind reads · as the product it is — a vector scaled is a vector, two vectors make a number', () => {
  const KINDS: Record<string, ValueKind> = { A: 'vector', B: 'vector', P: 'point', k: 'number' }
  const kind = (typed: string): ValueKind => inferKind(math.parse(preprocess(typed)), (name) => KINDS[name])

  it('a number and a vector, either way round, either glyph, is a vector — 2·A, A·2, k·A, A·k, 2⋅A, A⋅2, 2·(A + B), (A + B)·2', () => {
    for (const typed of ['2·A', 'A·2', 'k·A', 'A·k', '2⋅A', 'A⋅2', '2·(A + B)', '(A + B)·2']) expect.soft(kind(typed), typed).toBe('vector')
  })

  it('GUARD: two vectors are a number — A·B, A·(A + B), (A + B)·(A − B) — and so are two numbers — 2·3, 2·k, (2·3)·4', () => {
    for (const typed of ['A·B', 'A·(A + B)', '(A + B)·(A - B)', '2·3', '2·k', '(2·3)·4']) expect.soft(kind(typed), typed).toBe('number')
  })

  it('a product of products follows its brackets — A·B·A is (A·B)A, a vector; 2·A·B is (2A)·B, a number; A·(2·B) is a number', () => {
    expect(kind('A·B·A')).toBe('vector')
    expect(kind('2·A·B')).toBe('number')
    expect(kind('A·(2·B)')).toBe('number')
  })

  it('· and * have the same kind for every pairing of a number, a vector and a point — the way × and · are one product', () => {
    const operands = ['2', 'k', 'A', 'P']
    for (const left of operands) {
      for (const right of operands) expect.soft(kind(`${left}·${right}`), `${left}·${right} against ${left}*${right}`).toBe(kind(`${left}*${right}`))
    }
  })

  it('GUARD: what was a number or a vector stays one — A·A, 2*A, A + 2*A, A − B, 2 + 3', () => {
    expect(kind('A·A')).toBe('number')
    expect(kind('2*A')).toBe('vector')
    expect(kind('A + 2*A')).toBe('vector')
    expect(kind('A - B')).toBe('vector')
    expect(kind('2 + 3')).toBe('number')
  })
})

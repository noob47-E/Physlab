// The Giac adapter's spelling both ways (math/engine/giac/spelling.ts), as pure functions. The real
// engine reads and prints the same texts in tests/engine/giac.engine.test.ts; here every rule is
// pinned on its own, with outputs the vendored Giac 1.9 really printed (recorded 2026-10-12) as the
// table of known answers.

import katex from 'katex'
import { describe, expect, it } from 'vitest'
import {
  CANT_READ,
  CANT_SHOW,
  fromGiac,
  giacName,
  giacOf,
  lettersOf,
  physlabText,
  readEquation,
  readPhysLab,
  SpellingError,
  toGiac,
  type Tree
} from '../../src/renderer/src/math/engine/giac/spelling'
import { ADVERSARIAL_CASES } from '../../src/renderer/src/math/engine/semantics'
import { MUST_COVER, ROUND_TRIPS } from './giacCases'
import { GREEK_LETTERS } from '../../src/renderer/src/math/names'
import { math, setAngleMode } from '../../src/renderer/src/math/expr'

const RAD = { deg: false }
const DEG = { deg: true }

/** The sentence a reading refuses with, or null when it reads. */
function refusal(f: () => unknown): string | null {
  try {
    f()
    return null
  } catch (e) {
    if (e instanceof SpellingError) return e.sentence
    throw e
  }
}

/** A text's value at a point with mathjs alone (radians), real or complex, as [re, im]. */
function valueAt(text: string, scope: Record<string, number>): [number, number] {
  const v = math.evaluate(text, scope) as unknown
  if (typeof v === 'number') return [v, 0]
  const c = v as { re: number; im: number }
  return [c.re, c.im]
}

function sameValue(a: [number, number], b: [number, number]): boolean {
  const size = Math.max(Math.hypot(...a), Math.hypot(...b))
  if (!Number.isFinite(size)) return a[0] === b[0] && a[1] === b[1]
  return Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-9 * Math.max(1, size)
}

const renders = (tex: string): void => {
  expect(() => katex.renderToString(tex, { throwOnError: true }), tex).not.toThrow()
}

describe('the first draft (Jules, 2026-10-12) and what was wrong with it', () => {
  // Each case is one the regex draft got wrong, recorded by running it before it was replaced.
  it('never rewrites inside a word: "zoom" became z+infinitym', () => {
    expect(physlabText(readPhysLab('zoom'))).toBe('z*o*o*m')
    expect(toGiac('zoom', RAD)).not.toContain('infinity')
  })

  it('a power of a call stays a power of the call: sin(x)^(1/3) became sinsurd((x), 3)', () => {
    expect(toGiac('sin(x)^(1/3)', RAD)).toBe('surd(sin(v_x),3)')
  })

  it('every odd-bottom fraction is the real root, not only 1/n: x^(2/3), (−8)^(−1/3), cbrt(−8) went as typed', () => {
    expect(toGiac('x^(2/3)', RAD)).toBe('((surd(v_x,3))^(2))')
    expect(toGiac('(-8)^(-1/3)', RAD)).toBe('(1/(surd((-(8)),3)))')
    expect(toGiac('x^(-2/3)', RAD)).toBe('(1/((surd(v_x,3))^(2)))')
    expect(toGiac('cbrt(-8)', RAD)).toBe('surd((-(8)),3)')
  })

  it('π is π, not a letter: e^(i*pi) sent pi as the letter __physlab_pi__', () => {
    expect(toGiac('e^(i*pi)', RAD)).toBe('((exp(1))^(((i)*(pi))))')
  })

  it('log(a, b) is log base a of b: it became log10(2, 8)', () => {
    expect(toGiac('log(2, 8)', RAD)).toBe('logb(8,2)')
  })

  it('degrees reach Giac: sin(30°) went with its degree sign, and the angle setting was ignored', () => {
    expect(toGiac('sin(30°)', RAD)).toBe('sin(((30)*pi/180))')
    expect(toGiac('sin(30)', DEG)).toBe('sin((pi/180)*(30))')
  })

  it('implicit products are written out: 2x and x e^x went as typed', () => {
    expect(toGiac('2x', RAD)).toBe('((2)*(v_x))')
    expect(toGiac('x e^x', RAD)).toBe('((v_x)*(((exp(1))^(v_x))))')
  })

  it('a decimal is exact: 1e-19 went to Giac as a float', () => {
    expect(toGiac('1e-19', RAD)).toBe('((1)/(((10)^(19))))')
  })

  it('every letter is safe, not only the Greek names: Pi went through and Giac reads it as π', () => {
    expect(toGiac('Pi', RAD)).toBe('((v_P)*(v_i))'.replace('(v_i)', '(i)'))
  })

  it('no Giac name reaches the screen: LambertW, Si, order_size, list[…] and undef went through', () => {
    for (const giac of ['LambertW(1)', 'Si(v_x)', 'order_size(v_x)', 'bounded_function(1)', 'integrate(exp(ln(v_x)*v_x+ln(v_x))/v_x,v_x)', 'rootof([[1,0,-2],[1,0,1]])', 'x', 'Gamma(5)', 'seq[]', '"text"', "'x'", 'x%y']) {
      expect(fromGiac(giac), giac).toEqual({ ok: false, sentence: CANT_SHOW })
    }
  })

  it("a real root comes back real: surd(-8,3) became (-8)^(1/3), mathjs's complex principal value", () => {
    const r = fromGiac('surd(-8,3)')
    expect(r.ok && r.text).toBe('cbrt(-8)')
    expect(r.ok && math.evaluate(r.text)).toBe(-2)
  })

  it('|x| comes back as abs(x), which every reader reads: ||x|-1| could not be read back', () => {
    const r = fromGiac('abs(abs(v_x)-1)')
    expect(r.ok && r.text).toBe('abs(abs(x) - 1)')
    expect(r.ok && r.latex).toBe('\\left|\\left|x\\right| - 1\\right|')
  })

  it("Giac's unsigned infinity is not +∞: infinity became Infinity", () => {
    const r = fromGiac('infinity')
    expect(r.ok && r.text).toBe('NaN')
  })
})

describe('reading a request the way the algebra engine always has', () => {
  it.each([
    ['2x', '2*x'],
    ['xy', 'x*y'],
    ['te^t', 't*e^t'],
    ['x(x + 1)', 'x*(x + 1)'],
    ['(x + 1)(x - 1)', '(x + 1)*(x - 1)'],
    ['1/2x', '1/2*x'],
    ['2^3^2', '2^(3^2)'],
    ['-x^2', '-x^2'],
    ['x^-2', 'x^(-2)'],
    ['x²', 'x^2'],
    ['x⁻¹', 'x^(-1)'],
    ['3!', 'factorial(3)'],
    ['√2', 'sqrt(2)'],
    ['√(x + 1)', 'sqrt(x + 1)'],
    ['∛8', 'cbrt(8)'],
    ['∛-8', 'cbrt(-8)'],
    ['√-4', 'sqrt(-4)'],
    ['|x - 1|', 'abs(x - 1)'],
    ['||x| - 1|', 'abs(abs(x) - 1)'],
    ['2|x|', '2*abs(x)'],
    ['mag(x)', 'abs(x)'],
    ['Abs(x)', 'abs(x)'],
    ['sgn(x)', 'sign(x)'],
    ['θ + π', 'theta + pi'],
    ['2πr', '2*pi*r'],
    ['lambda*x', 'lambda*x'],
    ['thetasin(theta)', 'theta*sin(theta)'],
    ['xsin(x)', 'x*sin(x)'],
    ['E^x', 'e^x'],
    ['x ∞', 'x*Infinity'],
    ['oo', 'Infinity'],
    ['Infinity', 'Infinity'],
    ['ln(x) + log(x)', 'ln(x) + log(x)'],
    ['log(2, 8)', 'log(2, 8)'],
    ['cbrt(x)', 'cbrt(x)'],
    ['nthRoot(x, 5)', 'nthRoot(x, 5)'],
    ['nCr(5, 2)', 'combinations(5, 2)'],
    ['x1 + x_2 + v0', 'x1 + x_2 + v0'],
    ['arcsin(x)', 'asin(x)'],
    ['sin^2(x)', 'sin(x)^2'],
    ['2 × 3 ÷ 4 − 1', '2*3/4 - 1'],
    ['2·x', '2*x'],
    ['x**2', 'x^2']
  ])('%s reads as %s', (request, canonical) => {
    expect(physlabText(readPhysLab(request))).toBe(canonical)
  })

  it('a decimal is the number as written', () => {
    expect(physlabText(readPhysLab('0.15'))).toBe('15/10^2')
    expect(physlabText(readPhysLab('6e24'))).toBe('6*10^24')
    expect(physlabText(readPhysLab('1.6E-19'))).toBe('16/10^20')
    expect(physlabText(readPhysLab('.5'))).toBe('5/10^1')
  })

  it('a degree sign or the word deg marks degrees', () => {
    expect(toGiac('30°', RAD)).toBe('((30)*pi/180)')
    expect(toGiac('30 deg', RAD)).toBe('((30)*pi/180)')
    expect(toGiac('30°', DEG)).toBe('(30)')
  })

  it.each([['(x+'], ['x+*2'], ['sin('], ['2*/3'], ['sin x'], ['sinx'], ['cost'], ['x = 2'], ['x < 2'], ['[1, 2]'], ['{x}'], ['log(1, 2, 3)'], ['nthRoot(x, y)'], ['nthRoot(x, 0)'], ['1e999'], ['x $ 2'], ['']])(
    '%s is refused in a sentence',
    (request) => {
      expect(refusal(() => toGiac(request, RAD))).toBe(CANT_READ)
    }
  )

  it("a word is never one of Giac's commands: while(1) is a product of letters, as any run of letters is", () => {
    expect(physlabText(readPhysLab('while(1)'))).toBe('w*h*i*l*e*1')
    expect(toGiac('while(1)', RAD)).not.toContain('while')
  })

  it('an equation is its two sides; an expression equals 0; ≠, ≤ and == are refused', () => {
    const eq = readEquation('x^2 = 4')
    expect([physlabText(eq.lhs), physlabText(eq.rhs)]).toEqual(['x^2', '4'])
    expect(physlabText(readEquation('x - 1').rhs)).toBe('0')
    for (const bad of ['x != 2', 'x <= 2', 'x == 2', 'x = 1 = 2']) expect(refusal(() => readEquation(bad)), bad).toBe(CANT_READ)
  })

  it('lists the letters a request uses, constants and functions left out', () => {
    expect(lettersOf(readPhysLab('a*x^2 + b*x + c + sin(theta) + e + pi + i'))).toEqual(['a', 'b', 'c', 'theta', 'x'])
  })
})

describe('the names: no letter meets a Giac name', () => {
  it('every letter, Latin or Greek, goes to Giac behind the v_ prefix', () => {
    const names = [...'abcdfghjklmnopqrstuvwxyzABCDFGHIJKLMNOPQRSTUVWXYZ'].concat(GREEK_LETTERS.map((g) => g.name).filter((n) => n !== 'pi'))
    for (const n of names) expect(toGiac(n, RAD), n).toBe(giacName(n))
  })

  it("Giac's own names typed as letters stay letters: gamma, epsilon (a number to Giac), zeta, psi", () => {
    // Giac read epsilon as a number, Pi as π, Gamma and Psi as functions (recorded from the runtime).
    for (const n of ['gamma', 'beta', 'zeta', 'epsilon', 'psi', 'phi', 'eta']) expect(toGiac(`${n}^2`, RAD)).toBe(`((v_${n})^(2))`)
    // A capital Greek name is not a Greek letter in PhysLab's one list (math/names.ts): Latin letters.
    expect(physlabText(readPhysLab('Gamma'))).toBe('G*a*m*m*a')
  })

  it('every Greek letter typed as the letter itself reads as its name', () => {
    for (const g of GREEK_LETTERS) expect(physlabText(readPhysLab(g.letter))).toBe(g.name)
  })

  it('an answer letter comes back only through the prefix', () => {
    const r = fromGiac('v_theta^2+v_x1')
    expect(r.ok && r.text).toBe('theta^2 + x1')
    expect(fromGiac('theta').ok).toBe(false)
  })
})

describe("Giac's printed answers in PhysLab's spelling (printed by the vendored runtime, 2026-10-12)", () => {
  it.each([
    ['(v_x-1)*(v_x+1)', '(x - 1)*(x + 1)', '\\left(x - 1\\right) \\left(x + 1\\right)'],
    ['(v_x-1)*exp(v_x)', '(x - 1)*exp(x)', '\\left(x - 1\\right) e^{x}'],
    ['ln(abs(v_x))', 'ln(abs(x))', '\\ln\\left(\\left|x\\right|\\right)'],
    ['1/2*v_x-1/4*sin(2*v_x)', '1/2*x - 1/4*sin(2*x)', '\\frac{1}{2} x - \\frac{1}{4} \\sin\\left(2 x\\right)'],
    ['1/2/(v_x-1)-1/2/(v_x+1)', '1/2/(x - 1) - 1/2/(x + 1)', '\\frac{1}{2 \\left(x - 1\\right)} - \\frac{1}{2 \\left(x + 1\\right)}'],
    ['-1/v_x+1/2/(v_x-1)+1/2/(v_x+1)', '-1/x + 1/2/(x - 1) + 1/2/(x + 1)', '-\\frac{1}{x} + \\frac{1}{2 \\left(x - 1\\right)} + \\frac{1}{2 \\left(x + 1\\right)}'],
    ['(v_x+2*i)*(v_x-2*i)', '(x + 2*i)*(x - 2*i)', '\\left(x + 2 i\\right) \\left(x - 2 i\\right)'],
    ['(v_x+1+i)*(v_x+1-i)', '(x + 1 + i)*(x + 1 - i)', '\\left(x + 1 + i\\right) \\left(x + 1 - i\\right)'],
    ['5*sqrt(2)', '5*sqrt(2)', '5 \\sqrt{2}'],
    ['sqrt(pi)', 'sqrt(pi)', '\\sqrt{\\pi}'],
    ['exp(1)', 'e', 'e'],
    ['+infinity', 'Infinity', '\\infty'],
    ['-infinity', '-Infinity', '-\\infty'],
    ['1+v_x+1/2*v_x^2+1/6*v_x^3', '1 + x + 1/2*x^2 + 1/6*x^3', '1 + x + \\frac{1}{2} x^{2} + \\frac{1}{6} x^{3}'],
    ['-8^(1/3)', '-cbrt(8)', '-\\sqrt[3]{8}'],
    ['1/3*surd(v_x,3)/v_x', '1/3*cbrt(x)/x', '\\frac{\\frac{1}{3} \\sqrt[3]{x}}{x}'],
    ['2*1/3/v_x^(1/3)', '2*1/3/cbrt(x)', '\\frac{2 \\cdot 1}{3 \\sqrt[3]{x}}'],
    ['1/3*(v_x^(1/3))^-2', '1/3*cbrt(x)^(-2)', '\\frac{1}{3} \\sqrt[3]{x}^{-2}'],
    ['ln(v_x)/ln(10)', 'ln(x)/ln(10)', '\\frac{\\ln\\left(x\\right)}{\\ln\\left(10\\right)}'],
    ['-ln(abs(cos(v_x)))', '-ln(abs(cos(x)))', '-\\ln\\left(\\left|\\cos\\left(x\\right)\\right|\\right)'],
    ['1/sqrt(-v_x^2+1)', '1/sqrt(-x^2 + 1)', '\\frac{1}{\\sqrt{-x^{2} + 1}}'],
    ['sqrt(pi)/2*erf(v_x)', 'sqrt(pi)/2*erf(x)', '\\frac{\\sqrt{\\pi}}{2} \\operatorname{erf}\\left(x\\right)'],
    ['i*pi', 'i*pi', 'i \\pi'],
    ['(-i)*ln(2*i+i*sqrt(3))', '-i*ln(2*i + i*sqrt(3))', '-i \\ln\\left(2 i + i \\sqrt{3}\\right)'],
    ['1/2*v_x^2*sign(v_x)', '1/2*x^2*sign(x)', '\\frac{1}{2} x^{2} \\operatorname{sgn}\\left(x\\right)'],
    ['(-tan(v_x)^2+1)/(tan(v_x)^2+1)', '(-tan(x)^2 + 1)/(tan(x)^2 + 1)', '\\frac{-\\tan^{2}\\left(x\\right) + 1}{\\tan^{2}\\left(x\\right) + 1}'],
    ['6*(v_x-2)*(v_x+2)', '6*(x - 2)*(x + 2)', '6 \\left(x - 2\\right) \\left(x + 2\\right)'],
    ['2*(v_x-1)*(v_x+1)/3', '2*(x - 1)*(x + 1)/3', '\\frac{2 \\left(x - 1\\right) \\left(x + 1\\right)}{3}'],
    ['v_x^2+2*v_x+1', 'x^2 + 2*x + 1', 'x^{2} + 2 x + 1'],
    ['-60000000000000000000000000000000000000000000', '-60000000000000000000000000000000000000000000', '-60000000000000000000000000000000000000000000'],
    ['factorial(v_n)', 'factorial(n)', 'n!'],
    ['comb(10,3)', 'combinations(10, 3)', '\\binom{10}{3}'],
    ['acot(v_x)', 'acot(x)', '\\cot^{-1}\\left(x\\right)'],
    ['logb(8,2)', 'log(2, 8)', '\\log_{2}\\left(8\\right)'],
    ['v_theta*v_x_1', 'theta*x_1', '\\theta x_{1}'],
    ['exp(v_x)^2', 'exp(x)^2', '\\left(e^{x}\\right)^{2}']
  ])('%s → %s', (giac, text, latex) => {
    const r = fromGiac(giac)
    expect(r.ok, giac).toBe(true)
    if (!r.ok) return
    expect(r.text).toBe(text)
    expect(r.latex).toBe(latex)
    renders(r.latex)
    expect(r.approximate).toBe(false)
  })

  it('a decimal Giac worked out is marked approximate (solve(x = cos x) gave 0.739085133215)', () => {
    for (const g of ['0.739085133215', 'list[-1.16730397826]', '1.46265174591*v_x', '0.10000000000000000e-4']) {
      const r = fromGiac(g)
      expect(r.ok && r.approximate, g).toBe(true)
    }
  })

  it('a solve answer reads as a list, and a system as a list of rows', () => {
    const r = fromGiac('list[[2,1]]')
    expect(r.ok && r.tree).toEqual({ k: 'list', items: [{ k: 'list', items: [{ k: 'int', v: '2' }, { k: 'int', v: '1' }] }] })
    expect(fromGiac('[]').ok).toBe(true)
  })

  it('a negative number under an odd root would be the complex principal value, so it is refused', () => {
    expect(fromGiac('(-8)^(1/3)')).toEqual({ ok: false, sentence: CANT_SHOW })
  })

  it("reads every answer to the same numbers as Giac's own text means", () => {
    setAngleMode('rad')
    // Giac's text read by mathjs with surd as nthRoot (the real root), against PhysLab's text.
    const giacMeaning = (g: string): string => g.replace(/v_/g, '').replace(/surd\(/g, 'nthRoot(')
    for (const g of ['(v_x-1)*exp(v_x)', '1/2/(v_x-1)-1/2/(v_x+1)', '1/3*surd(v_x,3)/v_x', 'surd(v_x^2+1,3)', 'ln(abs(v_x))', '1/2*v_x-1/4*sin(2*v_x)', 'sqrt(pi)/2*erf(v_x)']) {
      const r = fromGiac(g)
      expect(r.ok).toBe(true)
      if (!r.ok) continue
      for (const x of [-2.5, -0.7, 0.3, 1.9, 4.2]) {
        if (/erf/.test(g) && x <= 0) continue
        expect(sameValue(valueAt(r.text, { x }), valueAt(giacMeaning(g), { x })), `${g} at ${x}`).toBe(true)
      }
    }
  })
})

describe('round trips: PhysLab → Giac → PhysLab keeps the value, and the form wherever no root is rewritten', () => {
  // Each text goes into Giac's spelling and is read back as if Giac had printed it unchanged
  // (tests/engine/giac.engine.test.ts sends the same texts through the real engine).
  const cases = ROUND_TRIPS

  it('has at least 150 round trips, each once, covering every function and form the spelling knows', () => {
    expect(cases.length).toBeGreaterThanOrEqual(150)
    expect(new Set(cases).size).toBe(cases.length)
    for (const form of MUST_COVER) expect(cases.some((c) => form.test(c)), String(form)).toBe(true)
  })

  it.each(cases)('%s', (text) => {
    setAngleMode('rad')
    const back = fromGiac(toGiac(text, RAD))
    expect(back.ok, text).toBe(true)
    if (!back.ok) return
    renders(back.latex)
    const canonical = physlabText(readPhysLab(text))
    // The form: what comes back is what was sent, except that an odd root is written as the real root it is.
    if (!/\^\(-?\d+\/\d+\)|cbrt|nthRoot|\/2\/3/.test(text)) expect(back.text, text).toBe(canonical)
    // The value, where every form is defined (mathjs's own power is the complex principal value, so
    // the request's odd roots are read as nthRoot, the real root PhysLab means by them).
    const real = canonical.replace(/(\w+|\([^()]*\))\^\((-?\d+)\/(\d+)\)/g, (_m, b: string, n: string, d: string) => (Number(d) % 2 ? `nthRoot(${b}, ${d})^(${n})` : `${b}^(${n}/${d})`))
    for (const pt of [0.37, 1.7, 2.9]) {
      const scope = { x: pt, y: pt + 1, t: pt, theta: pt, lambda: 2, alpha: 0.4, beta: 0.9, a: 1.5, b: -2, c: 0.5, m: 3, v: 2, x1: 1, x2: 2, v0: 4, C: 1.25 }
      const want = valueAt(real, scope)
      if (!Number.isFinite(want[0])) continue
      expect(sameValue(valueAt(back.text, scope), want), `${text} at ${pt}: ${back.text} vs ${real}`).toBe(true)
    }
  })

  it('a negative base under an odd root keeps the real root both ways: (−8)^(1/3) is −2', () => {
    const back = fromGiac(toGiac('(-8)^(1/3)', RAD))
    expect(back.ok && back.text).toBe('cbrt(-8)')
    expect(back.ok && math.evaluate(back.text)).toBe(-2)
    const neg = fromGiac(toGiac('(-32)^(3/5)', RAD))
    expect(neg.ok && math.evaluate(neg.text)).toBeCloseTo(-8, 12)
  })

  it('in degrees, trig arguments go as radians and inverse trig comes back in degrees', () => {
    setAngleMode('rad')
    const sin = fromGiac(toGiac('sin(x)', DEG))
    expect(sin.ok && sin.text).toBe('sin(pi/180*x)')
    const asin = fromGiac(toGiac('asin(x)', DEG))
    expect(asin.ok && asin.text).toBe('180/pi*asin(x)')
    expect(sin.ok && math.evaluate(sin.text, { x: 30 })).toBeCloseTo(0.5, 14)
  })
})

describe('the adversarial list (docs/knowledge/engine-semantics.md §7) through the spelling', () => {
  // Each case's maths as a request carries it. The engine's answers to them are in
  // tests/engine/giac.engine.test.ts; here each reads (or is refused in a sentence) and keeps its meaning.
  const requests: Record<string, string> = {
    sqrt_x_sq: 'sqrt(x^2)',
    log_x_sq: 'ln(x^2)',
    cancelled_factor: 'x*(x-1)/(x-1)',
    pole_odd_inv_x: '1/x',
    pole_even_inv_x_sq: '1/x^2',
    abs_val_diff: '|x|',
    sign_func: 'sgn(x)',
    piecewise: 'piecewise(x < 0, -x, x >= 0, x)',
    tan_pole: 'tan(x)',
    double_root: '(x-2)^2 = 0',
    missing_root: 'x^2 = x',
    extraneous_root_squaring: 'x = sqrt(x + 2)',
    zero_times_inf: 'x * (1/x)',
    odd_root_neg: '(-8)^(1/3)',
    euler_identity: 'e^(i*pi)',
    extreme_coefficients: '1e-19 * x + 6e24 = 0'
  }

  it('covers every case in the list', () => {
    expect(Object.keys(requests).sort()).toEqual(ADVERSARIAL_CASES.map((c) => c.id).sort())
  })

  it.each(Object.entries(requests))('%s', (id, request) => {
    if (id === 'piecewise') {
      // A piecewise function is nothing PhysLab's requests carry: refused, never half read.
      expect(refusal(() => readPhysLab(request))).toBe(CANT_READ)
      return
    }
    const side = (t: Tree): string => giacOf(t, RAD)
    const giac = request.includes('=') ? (({ lhs, rhs }) => `${side(lhs)}=${side(rhs)}`)(readEquation(request)) : side(readPhysLab(request))
    // Only Giac's plain syntax and the known names go out.
    expect(giac).toMatch(/^[\w()+\-*/^,=]+$/)
    const expected: Record<string, string> = {
      odd_root_neg: 'surd((-(8)),3)',
      sqrt_x_sq: 'sqrt(((v_x)^(2)))',
      log_x_sq: 'ln(((v_x)^(2)))',
      abs_val_diff: 'abs(v_x)',
      sign_func: 'sign(v_x)',
      euler_identity: '((exp(1))^(((i)*(pi))))',
      extreme_coefficients: '((((1)/(((10)^(19)))))*(v_x))+(((6)*(((10)^(24)))))=0'.replace(/^/, '((').replace('=0', ')=0')
    }
    if (expected[id] && id !== 'extreme_coefficients') expect(giac).toBe(expected[id])
    if (id === 'extreme_coefficients') expect(giac).toContain('((1)/(((10)^(19))))')
  })
})

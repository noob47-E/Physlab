// Review round 1 for the Calculator's limits (phase 09-C-LIMITS). Each block reproduces one finding from the
// checkers before its fix: a wrong answer shown as checked, or a check that passes without comparing the maths.
// The existing tests in tests/calcLimits.test.ts stay as they are.
//
// The soundness rule these tests hold to: a limit is either shown correctly or not shown at all. Where a case is
// declined, the test allows no wrong figure (a declined answer may be "no working", never a wrong value).

import { beforeEach, describe, expect, it } from 'vitest'
import { evaluateInput } from '../src/renderer/src/calc/evaluateInput'
import { shownNumber } from '../src/renderer/src/math/pure/limitWorking'
import { usePure } from '../src/renderer/src/math/pure/store'
import { resetGlobals } from './helpers/globals'

beforeEach(() => resetGlobals())

const OPTS = { vars: {}, ans: 0, angle: 'deg' as const }
const card = (latex: string) => evaluateInput('COMP', latex, OPTS)

function workingFor(latex: string) {
  usePure.getState().runLatex(latex, 'auto', { quiet: true })
  const w = usePure.getState().working
  if (!w) throw new Error(`no working for ${latex}`)
  return w
}

/** A shown value is within `relative` of the truth, or no value is shown at all. Never a wrong figure. */
function rightOrNothing(value: unknown, truth: number, relative: number): void {
  if (typeof value !== 'number') return
  expect(Math.abs(value - truth) / Math.abs(truth)).toBeLessThan(relative)
}

describe('a periodic function is never read as settling (samples off the 10^k grid)', () => {
  // sin(pi/x) and cos(2pi/x) take the same value at every point 1/G on a decimal grid, so the grid alone reads a
  // constant. A limit that does not exist must not come back as a checked number.
  const cases = [
    String.raw`\lim_{x\to0}\sin\frac{\pi}{x}`,
    String.raw`\lim_{x\to0}\cos\frac{2\pi}{x}`,
    String.raw`\lim_{x\to\infty}\sin(\pi x)`,
    String.raw`\lim_{x\to\infty}\cos(2\pi x)`,
    String.raw`\lim_{x\to\infty}\sin(10\pi x)`,
    String.raw`\lim_{x\to\infty}\sin(20\pi x)`,
    String.raw`\lim_{x\to1}\sin\frac{\pi}{x-1}`,
    String.raw`\lim_{x\to\infty}x\cos(\pi x)`,
    String.raw`\lim_{x\to\infty}\sin(\pi x)^2`
  ]
  for (const latex of cases) {
    it(`does not show a checked value for ${latex}`, () => {
      const r = card(latex)
      expect(r?.value).toBeUndefined()
      const w = workingFor(latex)
      if (w.checked === 'ok') expect(w.answers[0]?.tex).toBe('\\text{does not exist}')
    })
  }

  it('does not check the divergent sequences (-1)^n, cos(n pi), tan(n pi) and (-2)^n as settling', () => {
    for (const latex of [
      String.raw`\lim_{n\to\infty}(-1)^n`,
      String.raw`\lim_{n\to\infty}\cos(n\pi)`,
      String.raw`\lim_{n\to\infty}\tan(n\pi)=0`,
      String.raw`\lim_{n\to\infty}(-2)^n`
    ]) {
      expect(card(latex)?.value).toBeUndefined()
      const w = workingFor(latex)
      if (w.checked === 'ok') expect(w.answers[0]?.tex).toBe('\\text{does not exist}')
    }
  })
})

describe('a point that is not a short decimal is never read as a huge exact fraction', () => {
  it('gives 1 for the limit of 3x at 1/3, with no bogus exact fraction', () => {
    const r = card(String.raw`\lim_{x\to\frac{1}{3}}(3x)`)
    expect(r?.main).toBe('1')
    expect(r?.exact ?? '1').toBe('1')
  })

  it('gives 3 for 1/x at 1/3 and 1/2 for the quotient at 1/3, with no long denominator in the working', () => {
    expect(card(String.raw`\lim_{x\to\frac{1}{3}}\frac{1}{x}`)?.main).toBe('3')
    const w = workingFor(String.raw`\lim_{x\to\frac{1}{3}}\frac{3x-1}{9x^2-1}`)
    expect(w.answers[0]?.tex).toBe('\\frac{1}{2}')
    expect(JSON.stringify(w)).not.toMatch(/9999999999999999|10000000000000000|3333333333333333/)
  })

  it('keeps pi as pi-sized, not a fraction of a 15-digit decimal', () => {
    const w = workingFor(String.raw`\lim_{x\to\pi}(2x)`)
    expect(JSON.stringify(w)).not.toMatch(/3141592653589793|500000000000000/)
    expect(w.answers[0]?.tex).toMatch(/^6\.28318530/)
  })
})

describe('an infinite claim is never true for a finite limit', () => {
  it('says the claim = infinity for 3x+1 at 2 is false', () => {
    const r = card(String.raw`\lim_{x\to2}(3x+1)=\infty`)
    expect(r?.extra?.join(' ') ?? '').not.toMatch(/true/)
    expect(r?.extra?.join(' ') ?? '').toMatch(/false/)
  })

  it('says the claim = -infinity for 3x+1 at 2 is false', () => {
    const r = card(String.raw`\lim_{x\to2}(3x+1)=-\infty`)
    expect(r?.extra?.join(' ') ?? '').toMatch(/false/)
  })

  it('says 1/x at infinity = infinity is false (the limit is 0)', () => {
    const r = card(String.raw`\lim_{x\to\infty}\frac{1}{x}=\infty`)
    expect(r?.extra?.join(' ') ?? '').toMatch(/false/)
  })
})

describe('a small value is shown as its value, never as 0, and never as a made-up figure', () => {
  it('shows 3e-5 for 3e-5 sin x over x at 0', () => {
    const r = card(String.raw`\lim_{x\to0}0.00003\frac{\sin x}{x}`)
    rightOrNothing(r?.value, 3e-5, 1e-3)
    expect(r?.value).toBeCloseTo(3e-5, 9)
  })

  it('shows 1.6e-19 for 1.6e-19 sin x over x at 0', () => {
    const r = card(String.raw`\lim_{x\to0}1.6\cdot10^{-19}\frac{\sin x}{x}`)
    rightOrNothing(r?.value, 1.6e-19, 1e-3)
    expect(r?.value).toBeGreaterThan(0)
  })

  it('shows 3e-5 times e for 3e-5 (1 + 1/x)^x at infinity', () => {
    rightOrNothing(card(String.raw`\lim_{x\to\infty}0.00003(1+\frac{1}{x})^{x}`)?.value, 3e-5 * Math.E, 1e-3)
  })

  it('shows 1e-6 for 10^-6 sin x over x and 1e-5 for sin x over x minus 0.99999', () => {
    expect(card(String.raw`\lim_{x\to0}\frac{\sin x}{x}\cdot10^{-6}`)?.value).toBeCloseTo(1e-6, 12)
    expect(card(String.raw`\lim_{x\to0}\frac{\sin x}{x}-0.99999`)?.value).toBeCloseTo(1e-5, 10)
  })

  it('never shows 0 or any other wrong figure for 1/x plus 6.67e-11 at infinity (truth 6.67e-11)', () => {
    rightOrNothing(card(String.raw`\lim_{x\to\infty}(\frac{1}{x}+6.67\times10^{-11})`)?.value, 6.67e-11, 1e-3)
  })

  it('does not show a value for 10^-12 over x (the limit does not exist)', () => {
    const r = card(String.raw`\lim_{x\to0}\frac{10^{-12}}{x}`)
    expect(r?.value).toBeUndefined()
    expect(r?.main).toMatch(/does not exist/)
  })

  it('does not say the values settle on -0.00011 for 10^-9 over x (they grow without bound)', () => {
    const r = card(String.raw`\lim_{x\to0}\frac{0.000000001}{x}`)
    expect(r?.value).toBeUndefined()
    expect(r?.main ?? '').not.toMatch(/settle on/)
    expect(r?.main ?? '').toMatch(/does not exist/)
  })

  it('does not show 1 or "does not exist" for tanh(10^6 x) at 0, whose limit is 0', () => {
    const r = card(String.raw`\lim_{x\to0}\tanh(10^{6}x)`)
    expect(r?.main ?? '').not.toMatch(/does not exist/)
    expect(r?.value === 1).toBe(false)
    if (typeof r?.value === 'number') expect(r.value).toBe(0)
  })
})

describe('a trig value at a multiple of pi/2 is the value, not a floating residue', () => {
  it('gives 0 for cos x at pi/2', () => {
    expect(card(String.raw`\lim_{x\to\frac{\pi}{2}}\cos x`)?.main).toBe('0')
  })

  it('shows 0 in the working for sin x at pi', () => {
    const w = workingFor(String.raw`\lim_{x\to\pi}\sin x`)
    expect(w.answers[0]?.tex).toBe('0')
    expect(w.checked).toBe('ok')
  })
})

describe("L'Hopital's check line shows the values of the function the student typed", () => {
  it('prints the values of (e^x - 1)/x near 0, not those of its derivative e^x', () => {
    const w = workingFor(String.raw`\lim_{x\to0}\frac{e^x-1}{x}`)
    expect(w.checked).toBe('ok')
    // Each printed pair is f(x) = y: y must be the function's own value at the printed x, to the figures printed.
    // The derivative e^x differs from (e^x - 1)/x at the printed x in the sixth figure, so this tells them apart.
    const pairs = [...(w.check ?? '').replace(/−/g, '-').matchAll(/f\((-?[\d.]+)\) = (-?[\d.]+)/g)]
    expect(pairs.length).toBe(2)
    for (const [, x, shown] of pairs) {
      const xv = Number(x)
      expect(shown).toBe(shownNumber((Math.exp(xv) - 1) / xv, 6).replace(/−/g, '-'))
    }
  })
})

describe('a sampled value is never called true; a claim is compared with the unrounded value', () => {
  it('says the claim (1 + 1/x)^x = 2.71828 agrees, not that it is false', () => {
    const r = card(String.raw`\lim_{x\to\infty}(1+\frac{1}{x})^{x}=2.71828`)
    expect(r?.extra?.join(' ') ?? '').not.toMatch(/is false/)
    expect(r?.extra?.join(' ') ?? '').toMatch(/agrees/)
  })

  it('says the claim (1 + 1/x)^x = 3 is false', () => {
    const r = card(String.raw`\lim_{x\to\infty}(1+\frac{1}{x})^{x}=3`)
    expect(r?.extra?.join(' ') ?? '').toMatch(/is false/)
  })

  it('says a claim of 0 for a limit of 2e-10 is false, not true', () => {
    const r = card(String.raw`\lim_{x\to2}(0.0000000001x)=0`)
    expect(r?.extra?.join(' ') ?? '').toMatch(/is false/)
    expect(r?.extra?.join(' ') ?? '').not.toMatch(/true/)
  })
})

describe('a limit with a substituted value or a power that is exactly 0 is still answered', () => {
  // These were declined by the earlier check, whose tolerance was an absolute 10/G. They are plain textbook limits.
  it('gives 0 for x^3 - 8 at 2, 20x at 0, 1000(x - 3) at 3 and x^3 + 8 at -2', () => {
    for (const [latex, value] of [
      [String.raw`\lim_{x\to2}(x^3-8)`, 0],
      [String.raw`\lim_{x\to0}20x`, 0],
      [String.raw`\lim_{x\to3}1000(x-3)`, 0],
      [String.raw`\lim_{x\to-2}(x^3+8)`, 0]
    ] as const) {
      const w = workingFor(latex)
      expect(w.checked).toBe('ok')
      expect(Number(w.answers[0]?.tex)).toBe(value)
    }
  })

  it('gives 0 for 100/x and (x+1000)/x^2 at infinity, and infinity for x/2 and (x^2+1)/(2x+1)', () => {
    expect(card(String.raw`\lim_{x\to\infty}\frac{100}{x}`)?.main).toBe('0')
    expect(card(String.raw`\lim_{x\to\infty}\frac{x+1000}{x^2}`)?.main).toBe('0')
    expect(card(String.raw`\lim_{x\to\infty}\frac{x}{2}`)?.main).toBe('∞')
    expect(card(String.raw`\lim_{x\to\infty}\frac{x^2+1}{2x+1}`)?.main).toBe('∞')
  })

  it("still gives the standard and L'Hopital limits", () => {
    expect(card(String.raw`\lim_{x\to0}\frac{\cos x-1}{x^2}`)?.value).toBe(-0.5)
    expect(card(String.raw`\lim_{x\to0}\frac{\sin 3x}{x}`)?.value).toBe(3)
    expect(card(String.raw`\lim_{x\to3}\frac{x^2-9}{x-3}`)?.value).toBe(6)
  })
})

describe('divergent and oscillating sequences are not shown as checked values', () => {
  it('does not show a value for (-2)^n', () => {
    expect(card(String.raw`\lim_{n\to\infty}(-2)^n`)?.value).toBeUndefined()
  })

  it('does not show a value for tan(n pi)', () => {
    expect(card(String.raw`\lim_{n\to\infty}\tan(n\pi)=0`)?.value).toBeUndefined()
  })
})

// Round 1, second pass: the cases the review named beyond the first list. Each one either gets the right answer or no
// answer at all; a wrong figure or a bogus long fraction fails the test.

/** A shown value is exactly `truth` (to rounding), or no value is shown at all. */
function valueOrNothing(value: unknown, truth: number): void {
  if (typeof value !== 'number') return
  expect(Math.abs(value - truth)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(truth)))
}

describe('a point that is a fraction or pi or a root is read exactly or not at all', () => {
  it('gives the right limit at 2/3, -1/3 and 1/7, with no long decimal fraction in the working', () => {
    for (const [latex, truth] of [
      [String.raw`\lim_{x\to\frac{2}{3}}(3x)`, 2],
      [String.raw`\lim_{x\to-\frac{1}{3}}(3x)`, -1],
      [String.raw`\lim_{x\to\frac{1}{7}}(7x-1)`, 0],
      [String.raw`\lim_{x\to\frac{2}{3}}\frac{1}{x}`, 1.5]
    ] as const) {
      valueOrNothing(card(latex)?.value, truth)
      expect(JSON.stringify(workingFor(latex))).not.toMatch(/\d{13,}/)
    }
  })

  it('gives 2 pi for the quotient at pi, with no bogus fraction', () => {
    const latex = String.raw`\lim_{x\to\pi}\frac{x^2-\pi^2}{x-\pi}`
    valueOrNothing(card(latex)?.value, 2 * Math.PI)
    expect(JSON.stringify(workingFor(latex))).not.toMatch(/3141592653589793|500000000000000/)
  })

  it('gives 2 sqrt 2 for the quotient at sqrt 2, with no bogus fraction', () => {
    const latex = String.raw`\lim_{x\to\sqrt{2}}\frac{x^2-2}{x-\sqrt{2}}`
    valueOrNothing(card(latex)?.value, 2 * Math.SQRT2)
    expect(JSON.stringify(workingFor(latex))).not.toMatch(/14142135623730951|5000000000000000/)
  })

  it('shows the point as typed in the input line: 1/3 as a fraction, not 0.3333333333333333 over 10^16', () => {
    const w = workingFor(String.raw`\lim_{x\to\frac{1}{3}}(3x)`)
    expect(w.input).toContain(String.raw`\frac{1}{3}`)
    expect(JSON.stringify(w)).not.toMatch(/3333333333333333|10000000000000000/)
  })
})

describe('the textbook limits the earlier check declined are answered', () => {
  it('gives 0, infinity and does-not-exist where the function says so', () => {
    const cases: [string, string][] = [
      [String.raw`\lim_{x\to\infty}\frac{1000000}{x}`, '0'],
      [String.raw`\lim_{x\to\infty}\frac{2x^2}{3x}`, '∞'],
      [String.raw`\lim_{x\to\infty}\frac{x^2}{x+100}`, '∞'],
      [String.raw`\lim_{x\to\infty}\frac{x^2}{100x}`, '∞'],
      [String.raw`\lim_{x\to\infty}\frac{x^{100}}{x^{99}}`, '∞'],
      [String.raw`\lim_{x\to0}\frac{1}{1000x^2}`, '∞'],
      [String.raw`\lim_{x\to0}\frac{1}{2x}`, 'does not exist']
    ]
    for (const [latex, expected] of cases) {
      const main = card(latex)?.main ?? ''
      if (expected === 'does not exist') expect(main).toMatch(/does not exist/)
      else expect(main).toBe(expected)
    }
  })

  it('gives cos at pi/2 as 0 for cos(x/2) at pi and sin at pi/2 as 1', () => {
    expect(card(String.raw`\lim_{x\to\pi}\cos\frac{x}{2}`)?.main).toBe('0')
    expect(card(String.raw`\lim_{x\to\frac{\pi}{2}}\sin x`)?.main).toBe('1')
  })

  it('gives 6.67e-11 for 6.67e-11 plus 1/x and for (6.67e-11 x + 1)/x at infinity, or no value', () => {
    valueOrNothing(card(String.raw`\lim_{x\to\infty}\frac{6.67\times10^{-11}x+1}{x}`)?.value, 6.67e-11)
  })
})

describe('a claim about a sampled or exact value is judged at the figures it is shown to', () => {
  it('says a claim of 1.00005 for ln(1+x)/x at 0 agrees to the figures shown, and never calls it true', () => {
    // ln is not differentiated by the rule (mathjs has no derivative for the calculator's ln), so this limit is read
    // from the values near 0 to four figures: 1.00005 agrees with 1.000 at four figures, and the card says so.
    const r = card(String.raw`\lim_{x\to0}\frac{\ln(1+x)}{x}=1.00005`)
    expect(r?.extra?.join(' ') ?? '').toMatch(/agrees with 1\.00005 to the figures shown/)
    expect(r?.extra?.join(' ') ?? '').not.toMatch(/is true/)
  })

  it('says a claim of 1.002 for ln(1+x)/x at 0 is false at the figures shown', () => {
    const r = card(String.raw`\lim_{x\to0}\frac{\ln(1+x)}{x}=1.002`)
    expect(r?.extra?.join(' ') ?? '').toMatch(/is false/)
    expect(r?.extra?.join(' ') ?? '').not.toMatch(/is true/)
  })

  it('says the claim e for (1 + 1/x)^x at infinity agrees, and never calls a sampled value true', () => {
    const r = card(String.raw`\lim_{x\to\infty}(1+\frac{1}{x})^{x}=e`)
    expect(r?.extra?.join(' ') ?? '').toMatch(/agrees/)
    expect(r?.extra?.join(' ') ?? '').not.toMatch(/so the statement is true/)
  })

  it('says the claim 2.7183 for (1 + 1/x)^x at infinity agrees to the figures shown', () => {
    const r = card(String.raw`\lim_{x\to\infty}(1+\frac{1}{x})^{x}=2.7183`)
    expect(r?.extra?.join(' ') ?? '').toMatch(/agrees/)
  })

  it('says an infinite claim is false in the working too, for a finite limit', () => {
    expect(workingFor(String.raw`\lim_{x\to2}(3x+1)=\infty`).check).toMatch(/is false/)
    expect(workingFor(String.raw`\lim_{x\to2}(3x+1)=\infty`).check).not.toMatch(/is true/)
    expect(workingFor(String.raw`\lim_{x\to2}(3x+1)=-\infty`).check).toMatch(/is false/)
  })
})

describe('the check line prints the values of the function the student typed', () => {
  it('prints f(x) = y pairs for sin 3x over x at the printed x, the function the student typed', () => {
    const w = workingFor(String.raw`\lim_{x\to0}\frac{\sin 3x}{x}`)
    expect(w.checked).toBe('ok')
    const pairs = [...(w.check ?? '').replace(/−/g, '-').matchAll(/f\((-?[\d.]+)\) = (-?[\d.]+)/g)]
    expect(pairs.length).toBe(2)
    for (const [, x, shown] of pairs) {
      const xv = Number(x)
      const truth = Math.sin(3 * xv) / xv
      expect(Math.abs(Number(shown) - truth) / Math.abs(truth)).toBeLessThan(1e-4)
    }
  })
})

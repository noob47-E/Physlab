import { describe, expect, it } from 'vitest'
import katex from 'katex'
import { runPure } from '../src/renderer/src/math/pure/run'
import { exprTex, parseExpr } from '../src/renderer/src/math/pure/mono'

const renders = (tex: string): void => {
  expect(() => katex.renderToString(tex, { displayMode: true, throwOnError: true, strict: 'ignore' }), tex).not.toThrow()
}

describe('U3 side-by-side letters are separate variables', () => {
  it('reads a run of letters as single-letter variables', () => {
    expect(exprTex(parseExpr('ab'))).toBe('ab')
    expect(exprTex(parseExpr('9ab^2'))).toBe('9ab^{2}')
    expect(exprTex(parseExpr('6a^2b + 9ab^2'))).toBe('6a^{2}b + 9ab^{2}')
  })

  it('keeps a Greek letter whole: θ (typed or as the word theta) is one variable', () => {
    expect(exprTex(parseExpr('θ^2 - 4'))).toBe('\\theta^{2} - 4')
    expect(exprTex(parseExpr('theta^2 - 4'))).toBe('\\theta^{2} - 4')
    expect(exprTex(parseExpr('2aθ'))).toBe('2a\\theta')
  })

  it('HCF and Factorise treat the letters separately', () => {
    const hcf = runPure('hcf', '6a^2b, 9ab^2')
    expect(hcf.error).toBeUndefined()
    expect(hcf.answers[0].tex).toBe('3ab')
    expect(hcf.checked).toBe('ok')

    const factor = runPure('factor', 'x^2y + xy^2')
    expect(factor.error).toBeUndefined()
    expect(factor.answers[0].tex).toBe('xy\\left(x + y\\right)')
    expect(factor.checked).toBe('ok')
  })

  it('Expand 2ab(a + b) works and renders', () => {
    const w = runPure('expand', '2ab(a + b)')
    expect(w.error).toBeUndefined()
    expect(w.answers[0].tex).toBe('2a^{2}b + 2ab^{2}')
    expect(w.checked).toBe('ok')
    renders(w.answers[0].tex)
    for (const m of w.moves) if (m.tex) renders(m.tex)
  })
})

describe('U5 refusals do not pretend the job is factorise', () => {
  it('divide and expand negative-power refusals do not mention factorise', () => {
    const divide = runPure('divide', '(x^2 + x^-1)/x')
    expect(divide.error).toMatch(/negative power/i)
    expect(divide.error).not.toMatch(/factorise/i)

    const expand = runPure('expand', '(x^-1 + 1)(x + 1)')
    expect(expand.error).toMatch(/negative power/i)
    expect(expand.error).not.toMatch(/factorise/i)
  })
})

describe('U11 partial fractions take the sign out of a -x common factor', () => {
  it('1/(-x^2 - x) gives -1/x + 1/(x + 1)', () => {
    const w = runPure('partial', '1/(-x^2 - x)')
    expect(w.error).toBeUndefined()
    expect(w.answers[0].tex).toContain('-\\dfrac{1}{x}')
    expect(w.answers[0].tex).not.toContain('\\dfrac{1}{-x}')
    expect(w.answers[0].tex.replace(/\s+/g, '')).toBe('-\\dfrac{1}{x}+\\dfrac{1}{x+1}')
    expect(w.checked).toBe('ok')
    renders(w.answers[0].tex)
  })
})

describe('H1 a huge power is refused in words instead of freezing the window', () => {
  it('x^100000 in Expand and x^300000 + x in Factorise answer at once with a sentence about the power', () => {
    for (const [job, src] of [['expand', 'x^100000'], ['factor', 'x^300000 + x'], ['expand', '(x + 1)^5000']] as const) {
      const t = performance.now()
      const w = runPure(job, src)
      expect(performance.now() - t, src).toBeLessThan(1000)
      expect(w.error, src).toMatch(/power/i)
      expect(w.answers, src).toEqual([])
    }
  })

  it('powers up to 1000 still work: x^1000 + x factorises, x^1000 expands', () => {
    expect(runPure('factor', 'x^1000 + x').error).toBeUndefined()
    expect(runPure('expand', 'x^1000').answers[0].tex).toBe('x^{1000}')
  })

  it('with several letters the number of terms is what counts: (x + y + z)^300 is refused at once, ^60 works', () => {
    const t = performance.now()
    const w = runPure('expand', '(x + y + z)^300')
    expect(performance.now() - t).toBeLessThan(3000)
    expect(w.error).toMatch(/terms/)
    expect(runPure('expand', '(x + y + z)^60').error).toBeUndefined()
  })

  // The reader's own products (every tool but Expand, whose term-by-term table lives in run.ts:312
  // and is listed for its owner under "Outside my files").
  it('the limit holds for a product of powers too: (x + y + z)^30 (a + b + c)^30 is refused at once', () => {
    for (const src of ['(x + y + z)^20 (a + b + c)^20', '(x + y + z)^30 (a + b + c)^30']) {
      const t = performance.now()
      expect(() => parseExpr(src), src).toThrow(/terms|too big to multiply out/)
      expect(performance.now() - t, src).toBeLessThan(3000)
    }
    expect(parseExpr('(x + y)^10 (a + b)^10').length).toBe(121)
  })
})

describe('U11 follow-up: the sign moves inside Partial Fractions only, never in Factorise working', () => {
  it('Factorise −x² − x still takes out −x, with no "x-1(…)" line', () => {
    for (const src of ['-x^2 - x', '-x^3 - x^2', '-x y - x']) {
      const w = runPure('factor', src)
      expect(w.error, src).toBeUndefined()
      expect(w.checked, src).toBe('ok')
      for (const m of w.moves) expect(m.tex ?? '', src).not.toMatch(/[a-z]-1(\\left)?\(/)
    }
    expect(runPure('factor', '-x^2 - x').answers[0].tex).toBe(String.raw`-x\left(x + 1\right)`)
  })

  it('1/(−2x² − 2x) gives −1/(2x) + 1/(2(x + 1)), with no minus left inside a bottom', () => {
    const w = runPure('partial', '1/(-2x^2 - 2x)')
    expect(w.error).toBeUndefined()
    expect(w.checked).toBe('ok')
    expect(w.answers[0].tex).not.toMatch(/\{-\d*x\}/)
    renders(w.answers[0].tex)
  })
})

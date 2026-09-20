// Factorising over the complex numbers, and the exact surd arithmetic it stands on.
//
// The old tests asserted only that "2i" appeared somewhere in the answer, which is how
// (x − [2i])(x − [−2i]) shipped as a correct-but-unreadable answer with a "check" that checked
// nothing. These pin the printed brackets and prove the multiply-back really runs.

import { describe, expect, it } from 'vitest'
import katex from 'katex'
import { runPure } from '../src/renderer/src/math/pure/run'
import { rat, R0, R1 } from '../src/renderer/src/math/pure/rat'
import {
  checkProduct,
  cxs,
  cxsTex,
  linearFactorTex,
  quadraticRoots,
  spLinear,
  splitBiquadratic,
  surd,
  surdAdd,
  surdInv,
  surdMul,
  surdSqrt,
  surdTex
} from '../src/renderer/src/math/pure/cxpoly'
import { parseExpr } from '../src/renderer/src/math/pure/mono'
import { polyFromExpr } from '../src/renderer/src/math/pure/poly'

const renders = (tex: string): void => {
  expect(() => katex.renderToString(tex, { displayMode: true, throwOnError: true, strict: 'ignore' }), tex).not.toThrow()
}

describe('surds', () => {
  it('pull squares out of the root', () => {
    expect(surdTex(surd(R0, R1, 72n))).toBe('6\\sqrt{2}')
    expect(surdTex(surd(rat(3n), rat(2n), 5n))).toBe('3 + 2\\sqrt{5}')
    expect(surdTex(surd(R0, rat(1n, 2n), 4n))).toBe('1')
  })

  it('multiply and add exactly', () => {
    const r2 = surd(R0, R1, 2n)
    expect(surdTex(surdMul(r2, r2))).toBe('2')
    expect(surdTex(surdAdd(surd(R1, R1, 2n), surd(R1, rat(-1n), 2n)))).toBe('2')
    expect(surdTex(surdMul(surdInv(surd(R1, R1, 2n)), surd(R1, R1, 2n)))).toBe('1')
    expect(surdTex(surdSqrt(rat(1n, 2n)))).toBe('\\frac{1}{2}\\sqrt{2}')
  })

  it('refuse to combine different roots rather than guess', () => {
    expect(() => surdMul(surd(R0, R1, 2n), surd(R0, R1, 3n))).toThrow()
  })
})

describe('brackets are written the way a student writes them', () => {
  it('simplifies the signs when a root is subtracted', () => {
    expect(linearFactorTex('x', cxs(surd(R0), surd(rat(2n))))).toBe('\\left(x - 2i\\right)')
    expect(linearFactorTex('x', cxs(surd(R0), surd(rat(-2n))))).toBe('\\left(x + 2i\\right)')
    expect(linearFactorTex('x', cxs(surd(rat(-1n)), surd(rat(2n))))).toBe('\\left(x + 1 - 2i\\right)')
    expect(linearFactorTex('x', cxs(surd(R0), surd(R1)))).toBe('\\left(x - i\\right)')
    expect(linearFactorTex('x', cxs(surd(rat(-1n, 2n)), surd(R0, rat(1n, 2n), 3n)))).toBe('\\left(x + \\frac{1}{2} - \\frac{1}{2}\\sqrt{3}i\\right)')
  })

  it('writes complex surds without a plus-minus', () => {
    expect(cxsTex(cxs(surd(rat(3n)), surd(rat(-2n))))).toBe('3 - 2i')
    expect(cxsTex(cxs(surd(R0, rat(1n, 2n), 2n), surd(R0, rat(-1n, 2n), 2n)))).toBe('\\frac{1}{2}\\sqrt{2} - \\frac{1}{2}\\sqrt{2}i')
  })
})

describe('roots and the multiply-back check', () => {
  it('finds conjugate roots and multiplies them back to the quadratic', () => {
    const { poly } = polyFromExpr(parseExpr('x^2 + 4x + 13'))
    const [p, q] = quadraticRoots(surd(R1), surd(rat(4n)), surd(rat(13n)))!
    expect(cxsTex(p)).toBe('-2 + 3i')
    expect(cxsTex(q)).toBe('-2 - 3i')
    expect(checkProduct([spLinear(p), spLinear(q)], poly)).toBe(true)
  })

  it('fails the check when a factor is wrong', () => {
    const { poly } = polyFromExpr(parseExpr('x^2 + 4'))
    const wrong = cxs(surd(R0), surd(rat(3n)))
    expect(checkProduct([spLinear(wrong), spLinear(cxs(surd(R0), surd(rat(-3n))))], poly)).toBe(false)
  })

  it('splits x^4 + 4 and x^4 + 1 by completing the square', () => {
    const four = splitBiquadratic(polyFromExpr(parseExpr('x^4 + 4')).poly)!
    expect(surdTex(four.k)).toBe('2')
    const one = splitBiquadratic(polyFromExpr(parseExpr('x^4 + 1')).poly)!
    expect(surdTex(one.k)).toBe('\\sqrt{2}')
    expect(splitBiquadratic(polyFromExpr(parseExpr('x^4 + 3')).poly)).toBeNull()
  })
})

describe('Factorise with i', () => {
  it('prints x^2 + 4 as (x − 2i)(x + 2i) and really checks it', () => {
    const w = runPure('factorComplex', 'x^2 + 4')
    expect(w.error).toBeUndefined()
    expect(w.answers[0].tex).toBe('\\left(x - 2i\\right)\\left(x + 2i\\right)')
    expect(w.checked).toBe('ok')
    expect(w.check).toMatch(/the original/)
    expect(w.moves.some((m) => m.head.startsWith('Multiply back'))).toBe(true)
  })

  it('puts the real part first and drops the inner brackets', () => {
    const w = runPure('factorComplex', 'x^2 + 2x + 5')
    expect(w.answers[0].tex).toBe('\\left(x + 1 - 2i\\right)\\left(x + 1 + 2i\\right)')
    expect(w.checked).toBe('ok')
  })

  it('puts the leading coefficient at the front', () => {
    const w = runPure('factorComplex', '2x^2 + 2x + 5')
    expect(w.answers[0].tex.startsWith('2\\left(')).toBe(true)
    expect(w.checked).toBe('ok')
    const neg = runPure('factorComplex', '-x^2 - 4')
    expect(neg.answers[0].tex).toBe('-\\left(x - 2i\\right)\\left(x + 2i\\right)')
    expect(neg.checked).toBe('ok')
  })

  it('goes all the way down on x^4 - 16', () => {
    const w = runPure('factorComplex', 'x^4 - 16')
    expect(w.error).toBeUndefined()
    expect(w.answers[0].tex).toBe('\\left(x - 2\\right)\\left(x + 2\\right)\\left(x - 2i\\right)\\left(x + 2i\\right)')
    expect(w.checked).toBe('ok')
  })

  it('handles x^4 + 5x^2 + 4 through u = x^2', () => {
    const w = runPure('factorComplex', 'x^4 + 5x^2 + 4')
    expect(w.error).toBeUndefined()
    expect(w.answers[0].tex).toContain('\\left(x - i\\right)\\left(x + i\\right)')
    expect(w.answers[0].tex).toContain('\\left(x - 2i\\right)\\left(x + 2i\\right)')
    expect(w.checked).toBe('ok')
  })

  it('handles x^4 + 4 and x^4 + 1', () => {
    const four = runPure('factorComplex', 'x^4 + 4')
    expect(four.error).toBeUndefined()
    expect(four.answers[0].tex).toBe('\\left(x - 1 - i\\right)\\left(x - 1 + i\\right)\\left(x + 1 - i\\right)\\left(x + 1 + i\\right)')
    expect(four.checked).toBe('ok')

    const one = runPure('factorComplex', 'x^4 + 1')
    expect(one.error).toBeUndefined()
    expect(one.answers[0].tex).toContain('\\sqrt{2}')
    expect(one.checked).toBe('ok')
    renders(one.answers[0].tex)
    for (const m of one.moves) if (m.tex) renders(m.tex)
  })

  it('writes surd roots when the discriminant is positive but not square', () => {
    const w = runPure('factorComplex', 'x^2 - 2')
    expect(w.answers[0].tex).toBe('\\left(x - \\sqrt{2}\\right)\\left(x + \\sqrt{2}\\right)')
    expect(w.checked).toBe('ok')
  })

  it('refuses an input that already has i, with a sentence, and never throws', () => {
    for (const src of ['x^2 + 2i', '(x + i)(x - i)', 'i']) {
      const w = runPure('factorComplex', src)
      expect(w.error, src).toMatch(/already has i/)
    }
    expect(runPure('factor', 'x^2 + 2i').error).toMatch(/already has i/)
  })

  it('every step and answer renders in KaTeX', () => {
    for (const src of ['x^2 + 4', 'x^2 + 2x + 5', '2x^2 + 2x + 5', 'x^4 - 16', 'x^4 + 5x^2 + 4', 'x^4 + 4', 'x^2 + x + 1', 'x^3 + 8']) {
      const w = runPure('factorComplex', src)
      expect(w.error, src).toBeUndefined()
      expect(w.checked, src).toBe('ok')
      renders(w.answers[0].tex)
      for (const m of w.moves) {
        if (m.tex) renders(m.tex)
        if (m.rule) renders(m.rule)
      }
    }
  })
})

describe('the real Factorise offers to allow i', () => {
  it('when an irreducible quadratic is left', () => {
    expect(runPure('factor', 'x^2 + 4').offer?.job).toBe('factorComplex')
    expect(runPure('factor', 'x^4 - 16').offer?.job).toBe('factorComplex')
    expect(runPure('factor', 'x^2 - 4').offer).toBeUndefined()
    expect(runPure('factor', '6x^2 + 7x - 3').offer).toBeUndefined()
  })

  it('now factorises quadratics in disguise over the reals', () => {
    const w = runPure('factor', 'x^4 + 5x^2 + 4')
    expect(w.answers[0].tex).toBe('\\left(x^{2} + 1\\right)\\left(x^{2} + 4\\right)')
    expect(w.checked).toBe('ok')
    expect(w.moves.some((m) => m.head.includes('quadratic in disguise'))).toBe(true)
    const five = runPure('factor', 'x^4 - 5x^2 + 4')
    expect(five.answers[0].tex).toMatch(/x - 1/)
    expect(five.answers[0].tex).toMatch(/x - 2/)
    expect(five.checked).toBe('ok')
  })

  it('completes the square on x^4 + 4', () => {
    const w = runPure('factor', 'x^4 + 4')
    expect(w.answers[0].tex).toBe('\\left(x^{2} - 2x + 2\\right)\\left(x^{2} + 2x + 2\\right)')
    expect(w.checked).toBe('ok')
    expect(w.offer?.job).toBe('factorComplex')
  })
})

describe('Solve', () => {
  it('solves a linear equation with the moves shown', () => {
    const w = runPure('solve', '3x + 5 = 2x - 4')
    expect(w.error).toBeUndefined()
    expect(w.answers[0].tex).toBe('-9')
    expect(w.checked).toBe('ok')
    expect(w.moves[0].head).toMatch(/changes sign/)
    expect(runPure('solve', '2x = 7').answers[0].tex).toBe('\\frac{7}{2}')
    expect(runPure('solve', '4x - 8').answers[0].tex).toBe('2')
  })

  it('says when a linear equation has no answer or every answer', () => {
    expect(runPure('solve', 'x + 1 = x + 2').error).toMatch(/no value/)
    expect(runPure('solve', '2x + 2 = 2(x + 1)').error).toMatch(/every value/)
  })

  it('checks quadratic roots by substituting them back', () => {
    for (const src of ['x^2 + 4x + 13 = 0', 'x^2 - 2x - 1 = 0', '2x^2 + 3x - 2 = 0', 'x^2 + 6x + 9 = 0', 'x^2 + x + 1 = 0']) {
      expect(runPure('solve', src).checked, src).toBe('ok')
    }
  })

  it('refuses i with a sentence instead of throwing', () => {
    expect(runPure('solve', 'x^2 + 2i = 0').error).toMatch(/has i in it/)
    expect(runPure('solve', '(1 + i)x = 3').error).toMatch(/has i in it/)
  })
})

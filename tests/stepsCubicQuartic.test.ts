// Tests for Part S3: equations of degree 3 and 4 in math/steps/methods/cubicQuartic.ts.
//
// Pipeline: rational root test -> divide by (x - r) -> the quadratic (through the router)
// -> real or complex roots; every step validated (validate.ts), and final roots checked
// against the ORIGINAL equation.

import { describe, expect, it } from 'vitest'
import { createDefaultStepRouter, stepWorkingFor } from '../src/renderer/src/math/steps/solve'
import { defaultCheckAdapter, normalizeDisplayed } from '../src/renderer/src/math/steps/check-adapter'
import { validateWorking } from '../src/renderer/src/math/steps/validate'
import { CANT_SHOW_STEPS_REASON, type StepAnswer } from '../src/renderer/src/math/steps/types'
import { eqTex, monosOf, type Mono } from '../src/renderer/src/math/steps/methods/stepText'
import { eMul, evalAt, normalize, type Expr } from '../src/renderer/src/math/pure/mono'
import { bgcd, rat, rStr } from '../src/renderer/src/math/pure/rat'

function answerTexList(answer?: StepAnswer | StepAnswer[]): string[] {
  if (!answer) return []
  const list = Array.isArray(answer) ? answer : [answer]
  return list.map((a) => normalizeDisplayed(a.tex))
}

function answerValueList(answer?: StepAnswer | StepAnswer[]): string[] {
  if (!answer) return []
  const list = Array.isArray(answer) ? answer : [answer]
  return list.map((a) => normalizeDisplayed(a.value ?? a.tex))
}

describe('Part S3: Cubic and quartic equations (math/steps)', () => {
  const adapter = defaultCheckAdapter
  const router = createDefaultStepRouter(adapter)

  it('solves x^3 - 6x^2 + 11x - 6 = 0 with roots 1, 2, 3 and validates every step', () => {
    const problem = { job: 'solve', input: 'x^3 - 6x^2 + 11x - 6 = 0', variable: 'x' } as const
    const w = router.solve(problem)
    expect(w.noWorking).toBeFalsy()
    expect(w.checked).toBe('ok')
    expect(validateWorking(w, adapter).valid).toBe(true)
    expect(answerTexList(w.answer)).toEqual(['1', '2', '3'])

    // Verify it chains through the existing quadratic methods in subWorkings
    expect(w.subWorkings?.length).toBe(2)
    expect(w.subWorkings?.[0].input).toBe('x - 1 = 0')
    expect(w.subWorkings?.[1].input).toBe('x^2 - 5x + 6 = 0')

    // Verify rendering to PureWorkingDoc succeeds with check line
    const doc = stepWorkingFor(problem, adapter)
    expect(doc).not.toBeNull()
    expect(doc?.answers.map((a) => a.tex)).toEqual(['1', '2', '3'])
    expect(doc?.checked).toBe('ok')
    expect(doc?.check).toContain('both sides give 0')
  }, 30_000)

  it('solves x^3 - 1 = 0 in both real domain (1) and complex domain (1 and two complex roots)', () => {
    const realProb = { job: 'solve', input: 'x^3 - 1 = 0', variable: 'x', domain: 'real' } as const
    const wReal = router.solve(realProb)
    expect(wReal.noWorking).toBeFalsy()
    expect(wReal.checked).toBe('ok')
    expect(validateWorking(wReal, adapter, 'real').valid).toBe(true)
    expect(answerTexList(wReal.answer)).toEqual(['1'])

    const complexProb = { job: 'solve', input: 'x^3 - 1 = 0', variable: 'x', domain: 'complex' } as const
    const wComplex = router.solve(complexProb)
    expect(wComplex.noWorking).toBeFalsy()
    expect(wComplex.checked).toBe('ok')
    expect(validateWorking(wComplex, adapter, 'complex').valid).toBe(true)
    expect(answerTexList(wComplex.answer)).toEqual([
      '1',
      '\\frac{-1-i\\sqrt{3}}{2}',
      '\\frac{-1+i\\sqrt{3}}{2}'
    ])
    expect(wComplex.subWorkings?.some((s) => s.input === 'x^2 + x + 1 = 0')).toBe(true)
  }, 30_000)

  it('solves 2x^3 + 3x^2 - 11x - 6 = 0 with rational root -1/2 and integer roots -3, 2', () => {
    const problem = { job: 'solve', input: '2x^3 + 3x^2 - 11x - 6 = 0', variable: 'x' } as const
    const w = router.solve(problem)
    expect(w.noWorking).toBeFalsy()
    expect(w.checked).toBe('ok')
    expect(validateWorking(w, adapter).valid).toBe(true)
    expect(answerTexList(w.answer)).toEqual(['-3', '-1/2', '2'])
  }, 30_000)

  it('solves quartic x^4 - 5x^2 + 4 = 0 with roots -2, -1, 1, 2 and validates every step', () => {
    const problem = { job: 'solve', input: 'x^4 - 5x^2 + 4 = 0', variable: 'x' } as const
    const w = router.solve(problem)
    expect(w.noWorking).toBeFalsy()
    expect(w.checked).toBe('ok')
    expect(validateWorking(w, adapter).valid).toBe(true)
    expect(answerTexList(w.answer)).toEqual(['-2', '-1', '1', '2'])

    const doc = stepWorkingFor(problem, adapter)
    expect(doc).not.toBeNull()
    expect(doc?.answers.map((a) => a.tex)).toEqual(['-2', '-1', '1', '2'])
    expect(doc?.checked).toBe('ok')
  }, 30_000)

  it('declines a cubic with no rational root in words and never shows an invalid step', () => {
    for (const eq of ['x^3 + x + 1 = 0', 'x^3 - 3x + 1 = 0', 'x^3 + 2x - 5 = 0']) {
      const problem = { job: 'solve', input: eq, variable: 'x' } as const
      const w = router.solve(problem)
      expect(w.noWorking).toBe(true)
      expect(w.steps).toEqual([])
      expect(w.reason).toBe(CANT_SHOW_STEPS_REASON)
      expect(validateWorking(w, adapter).valid).toBe(true)
    }
  }, 30_000)

  it('handles cubics and quartics with repeated roots, zero root, or surd quadratic roots', () => {
    // Repeated root: (x - 1)^2 (x - 2) = x^3 - 4x^2 + 5x - 2 = 0
    const rep = router.solve({ job: 'solve', input: 'x^3 - 4x^2 + 5x - 2 = 0', variable: 'x' })
    expect(rep.noWorking).toBeFalsy()
    expect(validateWorking(rep, adapter).valid).toBe(true)
    expect(answerTexList(rep.answer)).toEqual(['1', '2'])

    // Triple root: (x - 2)^3 = x^3 - 6x^2 + 12x - 8 = 0
    const triple = router.solve({ job: 'solve', input: 'x^3 - 6x^2 + 12x - 8 = 0', variable: 'x' })
    expect(triple.noWorking).toBeFalsy()
    expect(validateWorking(triple, adapter).valid).toBe(true)
    expect(answerTexList(triple.answer)).toEqual(['2'])

    // Zero root: x^3 - 4x = 0 -> -2, 0, 2
    const zeroRoot = router.solve({ job: 'solve', input: 'x^3 - 4x = 0', variable: 'x' })
    expect(zeroRoot.noWorking).toBeFalsy()
    expect(validateWorking(zeroRoot, adapter).valid).toBe(true)
    expect(answerTexList(zeroRoot.answer)).toEqual(['-2', '0', '2'])

    // Irrational quadratic roots: (x - 1)(x^2 - 2) = x^3 - x^2 - 2x + 2 = 0
    const surdCubic = router.solve({ job: 'solve', input: 'x^3 - x^2 - 2x + 2 = 0', variable: 'x' })
    expect(surdCubic.noWorking).toBeFalsy()
    expect(validateWorking(surdCubic, adapter).valid).toBe(true)
    expect(answerTexList(surdCubic.answer)).toEqual(['-\\sqrt{2}', '1', '\\sqrt{2}'])
  }, 30_000)

  it('automatically checks 1,000 generated cubics with integer roots', () => {
    // Deterministic PRNG (LCG) generating 1,000 cubics a(x - r1)(x - r2)(x - r3) = 0
    let seed = 20261018
    const nextInt = (min: number, max: number): number => {
      seed = (seed * 48271) % 2147483647
      return min + (seed % (max - min + 1))
    }

    const linearFactor = (r: bigint): Expr =>
      normalize([
        { c: rat(1n), v: { x: 1 } },
        { c: rat(-r), v: {} }
      ])

    for (let i = 0; i < 1000; i++) {
      let r1 = BigInt(nextInt(-9, 9))
      const r2 = BigInt(nextInt(-9, 9))
      const r3 = BigInt(nextInt(-9, 9))
      if (r1 === 0n && r2 === 0n && r3 === 0n) r1 = 1n
      const scale = BigInt(nextInt(1, 3)) * (nextInt(0, 4) === 0 ? -1n : 1n)

      const poly = eMul(
        [{ c: rat(scale), v: {} }],
        eMul(linearFactor(r1), eMul(linearFactor(r2), linearFactor(r3)))
      )
      const monos: Mono[] = monosOf(poly, 'x')
      const eq = eqTex(monos, [], 'x')

      const w = router.solve({ job: 'solve', input: eq, variable: 'x' })
      expect(w.noWorking, `Failed on generated cubic #${i}: ${eq}`).toBeFalsy()
      expect(w.checked, `Check failed on #${i}: ${eq}`).toBe('ok')

      // router.solve already validates every working through validateWorking; also re-check explicitly on a sample
      if (i < 50) {
        const vRes = validateWorking(w, adapter)
        expect(vRes.valid, `Validation failed on #${i} (${eq}): ${vRes.reason}`).toBe(true)
      }

      const expectedRoots = [...new Set([r1, r2, r3])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      const actualValues = answerValueList(w.answer)
      expect(actualValues, `Wrong roots on #${i}: ${eq}`).toEqual(expectedRoots.map((r) => String(r)))

      // Also verify every returned root satisfies the original polynomial
      for (const r of expectedRoots) {
        expect(evalAt(poly, { x: rat(r) }).n, `Root ${r} did not satisfy ${eq}`).toBe(0n)
      }
    }
  }, 180_000)

  it('automatically checks generated cubics with rational roots (d1*x - n1)(d2*x - n2)(d3*x - n3) = 0', () => {
    let seed = 9876543
    const nextInt = (min: number, max: number): number => {
      seed = (seed * 48271) % 2147483647
      return min + (seed % (max - min + 1))
    }

    const factorExpr = (d: bigint, n: bigint): Expr =>
      normalize([
        { c: rat(d), v: { x: 1 } },
        { c: rat(-n), v: {} }
      ])

    for (let i = 0; i < 100; i++) {
      const d1 = BigInt(nextInt(1, 3))
      const n1 = BigInt(nextInt(-5, 5)) || 1n
      const d2 = BigInt(nextInt(1, 2))
      const n2 = BigInt(nextInt(-5, 5))
      const d3 = 1n
      const n3 = BigInt(nextInt(-5, 5))

      const poly = eMul(factorExpr(d1, n1), eMul(factorExpr(d2, n2), factorExpr(d3, n3)))
      const eq = eqTex(monosOf(poly, 'x'), [], 'x')

      const w = router.solve({ job: 'solve', input: eq, variable: 'x' })
      expect(w.noWorking, `Failed on rational cubic #${i}: ${eq}`).toBeFalsy()
      expect(w.checked).toBe('ok')
      if (i < 20) {
        expect(validateWorking(w, adapter).valid).toBe(true)
      }

      const roots = [rat(n1, d1), rat(n2, d2), rat(n3, d3)]
      const uniqueSorted: string[] = []
      roots
        .sort((a, b) => {
          const diff = a.n * b.d - b.n * a.d
          return diff < 0n ? -1 : diff > 0n ? 1 : 0
        })
        .forEach((r) => {
          const s = rStr(r)
          const g = bgcd(r.n < 0n ? -r.n : r.n, r.d)
          expect(g).toBe(1n)
          if (!uniqueSorted.includes(s)) uniqueSorted.push(s)
        })
      expect(answerValueList(w.answer)).toEqual(uniqueSorted)
    }
  }, 60_000)
})

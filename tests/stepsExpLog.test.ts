import { describe, expect, it } from 'vitest'
import { usePure } from '../src/renderer/src/math/pure/store'
import { createDefaultStepRouter } from '../src/renderer/src/math/steps/solve'
import { validateStep, validateWorking } from '../src/renderer/src/math/steps/validate'
import { equationStep } from '../src/renderer/src/math/steps/methods/equation'
import type { Working } from '../src/renderer/src/math/steps/types'

const METHOD = 'Exponential and logarithmic equation'

/** Type a LaTeX line as a student does and read the panel's working (no algebra engine call, so the test is quick). */
function typed(latex: string) {
  usePure.getState().runLatex(latex, 'auto', { quiet: true })
  return usePure.getState().working
}

describe('S3: exponential and logarithmic equations, through runLatex', () => {
  it('2^x = 8 is written as 2^3, the exponents are equated, and x = 3 is checked', () => {
    const w = typed('2^{x}=8')
    expect(w?.method).toBe(METHOD)
    expect(w?.checked).toBe('ok')
    expect(w?.answers[0].tex).toBe('3')
    expect(w?.moves.length).toBeGreaterThanOrEqual(3)
  })

  it('3^(2x - 1) = 27 is solved through the linear equation it leaves, x = 2', () => {
    const w = typed('3^{2x-1}=27')
    expect(w?.method).toBe(METHOD)
    expect(w?.checked).toBe('ok')
    expect(w?.answers[0].tex).toBe('2')
    expect(w?.moves.length).toBeGreaterThanOrEqual(3)
  })

  it('a power written with the same base on the right, 2^x = 2^3, skips the rewrite and gives x = 3', () => {
    const w = typed('2^{x}=2^{3}')
    expect(w?.method).toBe(METHOD)
    expect(w?.checked).toBe('ok')
    expect(w?.answers[0].tex).toBe('3')
    expect(w?.moves.length).toBeGreaterThanOrEqual(2)
  })

  it('log(x) = 2 is written as x = 10^2, worked out to x = 100, and checked', () => {
    const w = typed('\\log(x) = 2')
    expect(w?.method).toBe(METHOD)
    expect(w?.checked).toBe('ok')
    expect(w?.answers[0].tex).toBe('100')
    expect(w?.moves.length).toBeGreaterThanOrEqual(3)
  })

  it('leaves to the older path what this method cannot show: no whole power, a logarithmic answer, a log base subscript, two logs', () => {
    // 5^x = 12 and e^x = 5 have answers that are logarithms, ln(x + 1) = 2 is e squared minus one, and log_{2}(x) = 5 has a
    // subscript the page refuses on a working line. log(x) + log(x - 3) = 1 needs a root rejected by its logarithms.
    for (const latex of ['5^{x}=12', 'e^{x}=5', '\\ln(x+1)=2', '\\log_{2}(x)=5', '\\log(x)+\\log(x-3)=1']) {
      const w = typed(latex)
      expect(w?.method, latex).not.toBe(METHOD)
    }
  })

  it('a working whose answer is changed to a wrong number is never shown', () => {
    const router = createDefaultStepRouter()
    const working = router.solve({ job: 'solve', input: '2^(x)=8', variable: 'x' })
    expect(validateWorking(working).valid).toBe(true)
    const wrong: Working = { ...working, answer: { label: 'x', tex: '4', value: '4' } }
    expect(validateWorking(wrong).valid).toBe(false)
  })
})

describe('S3: wrong exponential and logarithmic steps are never valid', () => {
  it('writes 8 as 2 to the power 4 (that is 16)', () => {
    const step = equationStep('2^(x) = 8', '2^(x) = 2^(4)', { kind: 'write-as-power', base: '2', power: '4' }, 'x')
    expect(validateStep(step).verdict).not.toBe('valid')
  })

  it('writes 8 as 2 to the power 3 correctly, so the same move with power 3 is valid', () => {
    const step = equationStep('2^(x) = 8', '2^(x) = 2^(3)', { kind: 'write-as-power', base: '2', power: '3' }, 'x')
    expect(validateStep(step).verdict).toBe('valid')
  })

  it('cancels equal bases but keeps the wrong exponent 4 for 2^(x) = 2^(3)', () => {
    const step = equationStep('2^(x) = 2^(3)', 'x = 4', { kind: 'cancel-base', base: '2' }, 'x')
    expect(validateStep(step).verdict).not.toBe('valid')
  })

  it('cancels bases with a different base from the one written', () => {
    const step = equationStep('2^(x) = 2^(3)', 'x = 3', { kind: 'cancel-base', base: '3' }, 'x')
    expect(validateStep(step).verdict).not.toBe('valid')
  })

  it('cancels 2^(x) = 8 with no power written, which is not equal bases', () => {
    const step = equationStep('2^(x) = 8', 'x = 3', { kind: 'cancel-base', base: '2' }, 'x')
    expect(validateStep(step).verdict).not.toBe('valid')
  })

  it('turns log(x) = 2 into x = 10^3 (that is 1000)', () => {
    const step = equationStep('\\log(x) = 2', 'x = 10^(3)', { kind: 'log-to-power', base: '10' }, 'x')
    expect(validateStep(step).verdict).not.toBe('valid')
  })

  it('turns log(x) = 2 into x = 10^(2) with the wrong base 2', () => {
    const step = equationStep('\\log(x) = 2', 'x = 2^(2)', { kind: 'log-to-power', base: '2' }, 'x')
    expect(validateStep(step).verdict).not.toBe('valid')
  })

  it('works out 10^(2) as 101', () => {
    const step = equationStep('x = 10^(2)', 'x = 101', { kind: 'work-out-power' }, 'x')
    expect(validateStep(step).verdict).not.toBe('valid')
  })

  it('works out 10^(2) as 100 (the right value is accepted)', () => {
    const step = equationStep('x = 10^(2)', 'x = 100', { kind: 'work-out-power' }, 'x')
    expect(validateStep(step).verdict).toBe('valid')
  })
})

describe('S3: 200 generated a^(bx + c) = a^k cases are checked automatically', () => {
  it('every generated equation is worked, checked ok, and gives the whole-number x it was built from', () => {
    // A seeded generator, so a failure names the same case every run: x0 is chosen first, then the exponent k is
    // b*x0 + c, so every generated equation has the whole-number root x0.
    let seed = 20261019
    const next = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed % n
    }
    const failures: string[] = []
    for (let i = 0; i < 200; i++) {
      const a = [2, 3, 5][next(3)]
      const b = 1 + next(3)
      const x0 = next(7) - 2
      const k = next(6)
      const c = k - b * x0
      const exponent = `${b === 1 ? '' : String(b)}x${c === 0 ? '' : c > 0 ? `+${c}` : String(c)}`
      // Half the cases write the right side as a whole number, half as a power of the same base.
      const right = i % 2 === 0 ? String(a ** k) : `${a}^{${k}}`
      const latex = `${a}^{${exponent}}=${right}`
      const w = typed(latex)
      const got = w?.answers[0]?.tex.replace('−', '-')
      if (w?.method !== METHOD || w?.checked !== 'ok' || got !== String(x0)) {
        failures.push(`${latex} -> method ${String(w?.method)}, checked ${String(w?.checked)}, answer ${String(got)}, expected ${x0}`)
      }
    }
    expect(failures).toEqual([])
  })
})

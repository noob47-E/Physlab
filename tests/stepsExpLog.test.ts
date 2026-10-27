import { describe, expect, it } from 'vitest'
import { usePure } from '../src/renderer/src/math/pure/store'
import { createDefaultStepRouter } from '../src/renderer/src/math/steps/solve'
import { validateStep, validateWorking } from '../src/renderer/src/math/steps/validate'
import { equationStep } from '../src/renderer/src/math/steps/methods/equation'
import { expLogMethod } from '../src/renderer/src/math/steps/methods/expLog'
import { toDisplayTex } from '../src/renderer/src/math/steps/render'
import { displaySafe } from '../src/renderer/src/math/steps/displaySafe'
import { readLogTerm } from '../src/renderer/src/math/steps/check-adapter'
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

  it('log_{2}(x) = 5 is written as x = 2^(5), worked out to x = 32, and checked', () => {
    // latexToMath reads the subscript as log(2, x); the working keeps the line as typed, so the page draws the subscript.
    const w = typed('\\log_{2}(x)=5')
    expect(w?.method).toBe(METHOD)
    expect(w?.checked).toBe('ok')
    expect(w?.answers[0].tex).toBe('32')
    expect(w?.moves.length).toBeGreaterThanOrEqual(3)
  })

  it('log(2, x) = 5, the same logarithm as latexToMath reads it, is worked the same way', () => {
    const w = typed('\\log(2,x)=5')
    expect(w?.method).toBe(METHOD)
    expect(w?.checked).toBe('ok')
    expect(w?.answers[0].tex).toBe('32')
    expect(w?.moves.length).toBeGreaterThanOrEqual(3)
  })

  it('log_{b}(x) = c with a whole base b and power c gives x = b^c, worked and checked for every case', () => {
    const failures: string[] = []
    for (const b of [2, 3, 5]) {
      for (const c of [1, 2, 3, 4]) {
        const w = typed(`\\log_{${b}}(x)=${c}`)
        const want = String(b ** c)
        if (w?.method !== METHOD || w?.checked !== 'ok' || w?.answers[0]?.tex !== want || (w?.moves.length ?? 0) < 3) {
          failures.push(`log_${b}(x)=${c} -> method ${String(w?.method)}, checked ${String(w?.checked)}, answer ${String(w?.answers[0]?.tex)}, expected ${want}`)
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('leaves to the older path what this method does not work yet: non-bare ln', () => {
    // ln(x + 1) = 2 is e squared minus one; stays noWorking and the older path answers it.
    for (const latex of ['\\ln(x+1)=2']) {
      const w = typed(latex)
      expect(w?.method, latex).not.toBe(METHOD)
    }
    // log(x) + log(x - 3) = 1 is handled by logSumMethod and checked ok
    const wLogSum = typed('\\log(x)+\\log(x-3)=1')
    expect(wLogSum?.method).toBe(METHOD)
    expect(wLogSum?.checked).toBe('ok')
    expect(wLogSum?.answers).toEqual([{ label: 'x', tex: '5' }])
    for (const latex of ['5^{x}=12', 'e^{x}=5']) {
      const w = typed(latex)
      expect(w?.method, latex).toBe(METHOD)
      expect(w?.checked, latex).toBe('ok')
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

describe('S3 review: this method reads real equations only, and a negative power is written with a superscript minus', () => {
  it('2^(x) = 8 over the complex numbers is not worked by this method (it has infinitely many roots there)', () => {
    // Cancelling the base is not an equivalence over the complex numbers, so the real answer 3 must never be shown as the whole answer.
    const router = createDefaultStepRouter()
    const w = router.solve({ job: 'solve', input: '2^(x)=8', variable: 'x', domain: 'complex' })
    expect(w.method).not.toBe(METHOD)
    expect(expLogMethod.appliesTo({ job: 'solve', input: '2^(x)=8', variable: 'x', domain: 'complex' })).toMatchObject({ applies: false })
  })

  it('log(x^2 + 2) = 0 over the complex numbers is not worked by this method (its roots there are i and -i)', () => {
    const router = createDefaultStepRouter()
    const problem = { job: 'solve', input: 'log(x^(2)+2)=0', variable: 'x', rawInput: '\\log(x^{2}+2)=0' }
    const complexWorking = router.solve({ ...problem, domain: 'complex' })
    expect(complexWorking.method).not.toBe(METHOD)
    // The same equation over the real numbers keeps its working, which ends "No real solution".
    const realWorking = router.solve({ ...problem, domain: 'real' })
    expect(realWorking.method).toBe(METHOD)
    expect(validateWorking(realWorking, undefined, 'real').valid).toBe(true)
  })

  it('a working made over the real numbers is refused when it is checked as a complex problem', () => {
    // The move that cancels the base is real-only, so a complex problem never shows it, even if its working was built earlier.
    const router = createDefaultStepRouter()
    const realWorking = router.solve({ job: 'solve', input: '2^(x)=8', variable: 'x' })
    expect(realWorking.method).toBe(METHOD)
    expect(validateWorking(realWorking, undefined, 'real').valid).toBe(true)
    expect(validateWorking(realWorking, undefined, 'complex').valid).toBe(false)
  })

  it('2^(x) = 2^(-1) is titled and written with a superscript minus, not as 2 - 1, and checked ok with x = -1', () => {
    const w = typed('2^{x}=2^{-1}')
    expect(w?.method).toBe(METHOD)
    expect(w?.checked).toBe('ok')
    expect(w?.answers[0].tex).toBe('-1')
    expect(w?.input).toBe('2^{(x)}=2⁻¹')
    expect(w?.title).toBe('Solve 2^{(x)}=2⁻¹')
  })

  it('a power with a negative exponent is drawn as a superscript in headings, and a plain power is unchanged', () => {
    expect(toDisplayTex('x^{-1}')).toBe('x⁻¹')
    expect(toDisplayTex('2^{(-12)}')).toBe('2⁻¹²')
    expect(toDisplayTex('2^-1')).toBe('2⁻¹')
    expect(toDisplayTex('x^2-1')).toBe('x²-1')
  })
})

describe('S3 fix: a logarithm with a base is read in each form, and only a whole-number subscript on log is drawn', () => {
  it('readLogTerm reads log_{2}(x), log(2, x), log2(x) and log(x), and refuses log(x, 2)', () => {
    expect(readLogTerm('\\log_{2}(x)')).toEqual({ base: '2', arg: 'x' })
    expect(readLogTerm('log(2, x)')).toEqual({ base: '2', arg: 'x' })
    expect(readLogTerm('log2(x)')).toEqual({ base: '2', arg: 'x' })
    expect(readLogTerm('\\log(x)')).toEqual({ base: '10', arg: 'x' })
    expect(readLogTerm('log(x, 2)')).toBeNull()
    expect(readLogTerm('log2(x, 3)')).toBeNull()
  })

  it('log_{2}(x) = 5 becomes x = 2^(5) with the base it has; another power or another base is refused', () => {
    const right = equationStep('\\log_{2}(x) = 5', 'x = 2^(5)', { kind: 'log-to-power', base: '2' }, 'x')
    expect(validateStep(right).verdict).toBe('valid')
    const wrongPower = equationStep('\\log_{2}(x) = 5', 'x = 2^(4)', { kind: 'log-to-power', base: '2' }, 'x')
    expect(validateStep(wrongPower).verdict).not.toBe('valid')
    const wrongBase = equationStep('\\log_{2}(x) = 5', 'x = 3^(5)', { kind: 'log-to-power', base: '3' }, 'x')
    expect(validateStep(wrongBase).verdict).not.toBe('valid')
  })

  it('a log with a base and a linear argument, log_{3}(2x - 1) = 2, is solved through 2x - 1 = 9, x = 5, and checked', () => {
    const w = typed('\\log_{3}(2x-1)=2')
    expect(w?.method).toBe(METHOD)
    expect(w?.checked).toBe('ok')
    expect(w?.answers[0].tex).toBe('5')
    expect(w?.moves.length).toBeGreaterThanOrEqual(3)
  })

  it('a working for log_{2}(x) = 5 whose answer is changed to a wrong number is never shown', () => {
    const router = createDefaultStepRouter()
    const working = router.solve({ job: 'solve', input: 'log(2, x)=5', variable: 'x', rawInput: '\\log_{2}(x)=5' })
    expect(working.method).toBe(METHOD)
    expect(validateWorking(working).valid).toBe(true)
    const wrong: Working = { ...working, answer: { label: 'x', tex: '31', value: '31' } }
    expect(validateWorking(wrong).valid).toBe(false)
  })

  it('a subscript is drawn only as the base of a log: a subscript anywhere else is still refused', () => {
    expect(displaySafe('\\log_{2}(x)=5')).toBe(true)
    expect(displaySafe('x_{2}=5')).toBe(false)
    expect(displaySafe('\\log_{x}(y)=5')).toBe(false)
  })
})

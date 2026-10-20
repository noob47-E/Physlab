// Rational equations in one letter (S3b, math/steps/methods/rational.ts): a letter in a denominator.
//
// The examples go through the Calculator's own path (usePure.runLatex). Every answer is checked a second time here, by
// substitution into the equation as typed, with an engine that is not the framework's own checker. The steps are checked by
// the framework's validators, and hand-built wrong steps must be refused.

import { beforeEach, describe, expect, it } from 'vitest'
import { evaluate } from 'mathjs'
import { finishStep, sentenceFor } from '../src/renderer/src/math/steps/sentences'
import { usePure } from '../src/renderer/src/math/pure/store'
import { createDefaultStepRouter } from '../src/renderer/src/math/steps/solve'
import { evaluateInput } from '../src/renderer/src/calc/evaluateInput'
import { reconcile } from '../src/renderer/src/calc/working'
import {
  checkRationalEnding,
  defaultCheckAdapter,
  plainOfAlg,
  readSurd,
  texOfAlg
} from '../src/renderer/src/math/steps/check-adapter'
import { validateWorking } from '../src/renderer/src/math/steps/validate'
import { renderWorkingToDoc } from '../src/renderer/src/math/steps/render'
import { rat, rAdd, rDiv, rEq, rIsZero, rTex } from '../src/renderer/src/math/pure/rat'
import type { Working } from '../src/renderer/src/math/steps/types'
import { resetGlobals } from './helpers/globals'

const BS = String.fromCharCode(92)

/** The LaTeX a student's maths field gives for a fraction, as the Calculator passes it on. */
const frac = (num: string, den: string): string => `${BS}frac{${num}}{${den}}`

beforeEach(() => {
  resetGlobals()
  usePure.setState({ working: null, input: '', inputLatex: '', history: [] })
})

/** Solve through the Calculator's own path, quiet (no algebra-engine second opinion), and return the working on the page. */
function calculatorWorking(latex: string) {
  usePure.getState().runLatex(latex, 'auto', { quiet: true })
  return usePure.getState().working
}

/** The two sides of an input "L = R", evaluated at x by an independent engine (mathjs). */
function sidesAt(input: string, x: number): [number, number] {
  const [left, right] = input.split('=')
  return [Number(evaluate(left, { x })), Number(evaluate(right, { x }))]
}

/** A proposed answer holds in the equation as typed, and is not one of the values the denominators forbid. */
function holdsInOriginal(input: string, value: string, excluded: string[]): boolean {
  const x = Number(evaluate(value))
  if (excluded.some((e) => Math.abs(Number(evaluate(e)) - x) < 1e-12)) return false
  const [l, r] = sidesAt(input, x)
  return Number.isFinite(l) && Math.abs(l - r) < 1e-9
}

describe('Rational equations: the Calculator shows the working (S3b)', () => {
  it('1/x + 1/(x - 1) = 2: the roots (2 ± √2)/2 are shown and checked, after 0 and 1 are named as excluded', () => {
    const w = calculatorWorking(`${frac('1', 'x')}+${frac('1', 'x-1')}=2`)
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.noWorking).toBeFalsy()
    expect(w?.method).toBe('Rational equation')
    expect(w?.checked).toBe('ok')
    expect(w?.answers.map((a) => a.tex)).toEqual(['\\frac{2-\\sqrt{2}}{2}', '\\frac{2+\\sqrt{2}}{2}'])
    // The page's answers carry no decimal value, so the substitution reads the router's own answers (the same working).
    const routed = createDefaultStepRouter(defaultCheckAdapter).solve({ job: 'solve', input: '((1)/(x))+((1)/(x-1))=2', variable: 'x' })
    const values = (routed.answer ? (Array.isArray(routed.answer) ? routed.answer : [routed.answer]) : []).map((a) => a.value ?? '')
    expect(values.length).toBe(2)
    for (const value of values) {
      expect(holdsInOriginal('((1)/(x))+((1)/(x-1))=2', value, ['0', '1'])).toBe(true)
    }
    expect(w?.moves.length).toBeGreaterThanOrEqual(3)
    expect(w?.moves[0].head).toBe('x cannot be 0 or 1, because a denominator would be 0.')
    expect(w?.moves[0].rule).toBe('Excluded values')
    expect(w?.moves[1].rule).toBe('Multiply both sides')
    expect(w?.moves[1].head).toBe('Multiply both sides by x(x − 1)')
    // The polynomial's own working is shown under its heading, after the main steps.
    expect(w?.moves.some((m) => m.subgoal !== undefined)).toBe(true)
  })

  it('2/(x + 1) = 3/(x − 2): x = −7, with −1 and 2 named as excluded', () => {
    const w = calculatorWorking(`${frac('2', 'x+1')}=${frac('3', 'x-2')}`)
    expect(w?.noWorking).toBeFalsy()
    expect(w?.checked).toBe('ok')
    expect(w?.answers.map((a) => a.tex)).toEqual(['-7'])
    expect(holdsInOriginal('((2)/(x+1))=((3)/(x-2))', '-7', ['-1', '2'])).toBe(true)
    expect(w?.moves[0].head).toBe('x cannot be −1 or 2, because a denominator would be 0.')
    expect(w?.moves.length).toBeGreaterThanOrEqual(3)
  })

  it('x/(x − 2) = 2/(x − 2): no solution, because the only value x = 2 is excluded, and the working says so', () => {
    const w = calculatorWorking(`${frac('x', 'x-2')}=${frac('2', 'x-2')}`)
    expect(w?.noWorking).toBeFalsy()
    expect(w?.checked).toBe('ok')
    expect(w?.answers.map((a) => a.tex)).toEqual(['\\text{no value of x works}'])
    expect(w?.moves[0].head).toBe('x cannot be 2, because a denominator would be 0.')
    expect(w?.moves.length).toBeGreaterThanOrEqual(3)
    // The three main steps come first; the polynomial's own working is appended after them as its sub-working.
    const ending = w?.moves[2]
    expect(ending?.head).toBe('x = 2 makes a denominator 0, so no value of x works.')
    expect(ending?.rule).toBe('No solution')
  })

  it('(x + 1)/x = 3: x = 1/2, with 0 named as excluded', () => {
    const w = calculatorWorking(`${frac('x+1', 'x')}=3`)
    expect(w?.noWorking).toBeFalsy()
    expect(w?.checked).toBe('ok')
    expect(w?.answers.map((a) => a.tex)).toEqual(['\\frac{1}{2}'])
    expect(holdsInOriginal('((x+1)/(x))=3', '1/2', ['0'])).toBe(true)
    expect(w?.moves[0].head).toBe('x cannot be 0, because a denominator would be 0.')
    expect(w?.moves.length).toBeGreaterThanOrEqual(3)
  })

  it('3/x = x − 2: x = −1 or x = 3 (the quadratic the working reduces to is solved by the router)', () => {
    const w = calculatorWorking(`${frac('3', 'x')}=x-2`)
    expect(w?.noWorking).toBeFalsy()
    expect(w?.checked).toBe('ok')
    expect(w?.answers.map((a) => a.tex)).toEqual(['-1', '3'])
    expect(holdsInOriginal('((3)/(x))=x-2', '-1', ['0'])).toBe(true)
    expect(holdsInOriginal('((3)/(x))=x-2', '3', ['0'])).toBe(true)
    expect(w?.moves[0].head).toBe('x cannot be 0, because a denominator would be 0.')
    expect(w?.moves.length).toBeGreaterThanOrEqual(3)
  })
})

describe('Rational equations: every step is checked by the framework', () => {
  const router = createDefaultStepRouter(defaultCheckAdapter)
  const example = '((1)/(x))+((1)/(x-1))=2'
  const correct = (): Working => router.solve({ job: 'solve', input: example, variable: 'x' })
  const clone = (w: Working): Working => JSON.parse(JSON.stringify(w)) as Working

  it('the router gives a valid working: exclusion, multiplication, ending, with the polynomial as a sub-working', () => {
    const w = correct()
    expect(w.noWorking).toBeFalsy()
    expect(w.steps.map((s) => s.kind)).toEqual(['Implication', 'Implication', 'SolutionSetEq'])
    expect(w.steps[1].after).toBe('2x - 1 = 2x^2 - 2x')
    expect(w.subWorkings?.length).toBe(1)
    expect(w.subWorkings?.[0].input).toBe('2x - 1 = 2x^2 - 2x')
    expect(validateWorking(w, defaultCheckAdapter, 'real').valid).toBe(true)
    expect(renderWorkingToDoc(w, { job: 'solve', input: example, variable: 'x' }).noWorking).toBeFalsy()
  })

  it('an excluded-value statement that names the wrong values is refused; the exact values are accepted', () => {
    const check = (excluded: string[], after = example): string =>
      defaultCheckAdapter.checkImplication(example, after, undefined, { action: 'exclude', excluded })
    expect(check(['0', '1'])).toBe('valid')
    expect(check(['0'])).toBe('invalid')
    expect(check(['0', '2'])).toBe('invalid')
    expect(check(['0', '1', '1'])).toBe('invalid')
    // The exclusion does not change the equation: an after that differs is refused.
    expect(check(['0', '1'], '2x - 1 = 2x^2 - 2x')).toBe('invalid')
  })

  it('a multiplication that does not clear both sides is refused, and the right one is accepted', () => {
    const right = '2x - 1 = 2x^2 - 2x'
    const check = (after: string, multiplier: string): string =>
      defaultCheckAdapter.checkImplication(example, after, undefined, { action: 'multiply', multiplier })
    expect(check(right, 'x(x - 1)')).toBe('valid')
    // Wrong multiplier: x alone leaves the 1/(x − 1) fraction in place.
    expect(check(right, 'x')).toBe('invalid')
    // Wrong right side: 2x² − 2x + 1 is not 2 times x(x − 1).
    expect(check('2x - 1 = 2x^2 - 2x + 1', 'x(x - 1)')).toBe('invalid')
    // Wrong left side: a sign slipped in the first fraction.
    expect(check('1 - x + x = 2x^2 - 2x', 'x(x - 1)')).toBe('invalid')
    // A zero multiplier says nothing about the equation (every side becomes 0).
    expect(check(right, '0')).toBe('invalid')
  })

  it('a working whose sub-working solves some other polynomial is not shown', () => {
    const w = correct()
    w.subWorkings = [router.solve({ job: 'solve', input: 'x = 5', variable: 'x' })]
    expect(validateWorking(w, defaultCheckAdapter, 'real').valid).toBe(false)
  })

  it('an answer that leaves out one of the two roots is refused, even when the working says checked ok', () => {
    const w = correct()
    const ending = finishStep({
      kind: 'SolutionSetEq',
      before: w.steps[1].after,
      after: 'x = \\frac{2+\\sqrt{2}}{2}',
      sentence: '',
      data: { variable: 'x', domain: 'real', rational: true, original: w.input, solutions: ['(2 + sqrt(2))/2'], rejected: [] }
    })
    const bad: Working = {
      ...clone(w),
      steps: [w.steps[0], w.steps[1], ending],
      checked: 'ok',
      answer: [{ label: 'x', tex: '\\frac{2+\\sqrt{2}}{2}', value: '(2 + sqrt(2))/2' }]
    }
    expect(validateWorking(bad, defaultCheckAdapter, 'real').valid).toBe(false)
    expect(renderWorkingToDoc(bad, { job: 'solve', input: example, variable: 'x' }).moves).toEqual([])
  })

  it('an answer that includes an excluded value is refused, and rejecting a value that is not excluded is refused', () => {
    const original = '((x)/(x-2))=((2)/(x-2))'
    // x = 2 is a root of the polynomial and is excluded: it cannot be a solution.
    expect(checkRationalEnding(original, 'x = 2', ['2'], [], 'x', 'x = 2')).toBe('invalid')
    // Rejecting it is right, and the working then says no value works.
    expect(checkRationalEnding(original, 'x = 2', [], ['2'], 'x', '\\text{no value of x works}')).toBe('valid')
    // Rejecting 3 is refused: 3 is not a denominator's zero.
    expect(checkRationalEnding(original, 'x = 2', [], ['3'], 'x', '\\text{no value of x works}')).toBe('invalid')
  })

  it('an ending claims no solution where there is one, or lists a non-solution', () => {
    const original = '((2)/(x+1))=((3)/(x-2))'
    expect(checkRationalEnding(original, '2x - 4 = 3x + 3', [], [], 'x', '\\text{no value of x works}')).toBe('invalid')
    expect(checkRationalEnding(original, '2x - 4 = 3x + 3', ['-6'], [], 'x', 'x = -6')).toBe('invalid')
    expect(checkRationalEnding(original, '2x - 4 = 3x + 3', ['-7'], [], 'x', 'x = -7')).toBe('valid')
    // The displayed line must name exactly the kept value: a different sum is refused.
    expect(checkRationalEnding(original, '2x - 4 = 3x + 3', ['-7'], [], 'x', 'x = -8')).toBe('invalid')
  })

  it('the excluded-value statement and the surd solutions are sentences built from the typed data', () => {
    const exclusion = finishStep({
      kind: 'Implication',
      before: example,
      after: example,
      sentence: '',
      data: { action: 'exclude', variable: 'x', excluded: ['0', '1'] }
    })
    expect(exclusion.sentence).toBe('x cannot be 0 or 1, because a denominator would be 0.')
    expect(sentenceFor(exclusion)).toBe(exclusion.sentence)
    const root = readSurd('(2 + sqrt(2))/2')
    if (!root) throw new Error('the root should be readable exactly')
    expect(texOfAlg(root)).toBe('\\frac{2+\\sqrt{2}}{2}')
    expect(plainOfAlg(root)).toBe('(2 + sqrt(2))/2')
  })
})

describe('Rational equations: 100 generated a/(x + b) = c/(x + d), each checked by substitution', () => {
  // A fixed generator (a linear congruence), so the same 100 cases run every time.
  let seed = 20261019
  const next = (n: number): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed % n
  }

  const cases: Array<{ a: number; b: number; c: number; d: number }> = []
  while (cases.length < 100) {
    const a = 1 + next(9)
    const c = 1 + next(9)
    const b = next(11) - 5
    const d = next(11) - 5
    if (b !== d) cases.push({ a, b, c, d })
  }

  const denText = (b: number): string => (b === 0 ? 'x' : `x${b > 0 ? '+' : ''}${b}`)

  it('every generated equation is worked, and its answer (or the statement that none works) holds in the equation as typed', () => {
    const failures: string[] = []
    let withSolution = 0
    let withoutSolution = 0
    for (const { a, b, c, d } of cases) {
      const latex = `${frac(String(a), denText(b))}=${frac(String(c), denText(d))}`
      const w = calculatorWorking(latex)
      const label = `${a}/(${denText(b)}) = ${c}/(${denText(d)})`
      if (!w || w.error || w.noWorking || w.checked !== 'ok') {
        failures.push(`${label}: not worked`)
        continue
      }
      const shown = w.answers.map((x) => x.tex)
      // Exact: a(x + d) = c(x + b), so (a − c)x = cb − ad. The excluded values are −b and −d.
      const x0 = a === c ? null : rDiv(rat(BigInt(c * b - a * d)), rat(BigInt(a - c)))
      const excludedRoot = x0 !== null && [rat(BigInt(-b)), rat(BigInt(-d))].some((e) => rEq(e, x0))
      if (x0 === null || excludedRoot) {
        // Equal numerators (a = c, b ≠ d) or the one root is excluded: no value works.
        withoutSolution++
        if (shown.join('|') !== '\\text{no value of x works}') failures.push(`${label}: expected no value, got ${shown.join(' | ')}`)
        continue
      }
      withSolution++
      if (shown.length !== 1 || shown[0] !== rTex(x0)) {
        failures.push(`${label}: expected ${rTex(x0)}, got ${shown.join(' | ')}`)
        continue
      }
      // Substitution, exact: a/(x0 + b) = c/(x0 + d), with both denominators non-zero.
      const lhsDen = rAdd(x0, rat(BigInt(b)))
      const rhsDen = rAdd(x0, rat(BigInt(d)))
      if (rIsZero(lhsDen) || rIsZero(rhsDen)) {
        failures.push(`${label}: the root makes a denominator 0`)
        continue
      }
      const lhs = rDiv(rat(BigInt(a)), lhsDen)
      const rhs = rDiv(rat(BigInt(c)), rhsDen)
      if (!rEq(lhs, rhs)) failures.push(`${label}: substitution gives ${rTex(lhs)} and ${rTex(rhs)}`)
      if (!w.moves[0]?.head.startsWith('x cannot be')) failures.push(`${label}: no excluded-value statement first`)
    }
    expect(failures).toEqual([])
    expect(withSolution + withoutSolution).toBe(100)
    expect(withSolution).toBeGreaterThan(40)
    expect(withoutSolution).toBeGreaterThan(0)
  }, 120_000)
})

describe('Rational equations: what the method declines', () => {
  const router = createDefaultStepRouter(defaultCheckAdapter)

  it('a denominator that does not split into rational linear factors gives no working', () => {
    const w = router.solve({ job: 'solve', input: '1/(x^2 + 1) = 2', variable: 'x' })
    expect(w.noWorking).toBe(true)
    expect(w.steps.length).toBe(0)
  })

  it('x/x = 1 (every value but 0 is a solution, a whole line of answers) gives no working', () => {
    const w = router.solve({ job: 'solve', input: 'x/x = 1', variable: 'x' })
    expect(w.noWorking).toBe(true)
  })

  it('a plain linear equation with a constant denominator is still worked by the linear method', () => {
    const w = router.solve({ job: 'solve', input: 'x/2 + 1 = 3', variable: 'x' })
    expect(w.method).toBe('Linear equation in one variable')
    expect(validateWorking(w, defaultCheckAdapter, 'real').valid).toBe(true)
  })

  it('the complex domain is not worked by this method', () => {
    const w = router.solve({ job: 'solve', input: '1/x = 2', variable: 'x', domain: 'complex' })
    expect(w.method).not.toBe('Rational equation')
  })
})

describe('Rational equations: the "=" card and the working never disagree silently', () => {
  /** The card the Calculator gives for a line, joined with its working the way the screen joins them. */
  const joined = (text: string, latex: string) => {
    const working = calculatorWorking(latex)
    const card = evaluateInput('COMP', text, { vars: {}, ans: 0, angle: 'deg' })
    if (!card) throw new Error(`the quick answer for ${text} should be there`)
    return { card, working, r: reconcile(card, working) }
  }

  // Each of these lines has a quick root that is an excluded value (x = 1) or a huge number the search cannot confirm, while
  // the working, checked by putting it back together, says there is no solution at all. The card must not keep the root.
  const noSolutionLines: Array<[string, string]> = [
    ['(x^2-1)/(x-1)=2', `${frac('x^2-1', 'x-1')}=2`],
    ['1/(1/(x-1))=0', `${frac('1', frac('1', 'x-1'))}=0`],
    ['(x-1)^2/(x-1)=0', `${frac('(x-1)^2', 'x-1')}=0`],
    ['2/(x-1)+3/(x+1)=(5x+1)/(x^2-1)', `${frac('2', 'x-1')}+${frac('3', 'x+1')}=${frac('5x+1', 'x^2-1')}`],
    ['x/(x-1)^2=1/(x-1)', `${frac('x', '(x-1)^2')}=${frac('1', 'x-1')}`]
  ]

  it.each(noSolutionLines)('%s: the working says no value of x works, so the quick root is not kept on the card', (text, latex) => {
    const { r } = joined(text, latex)
    expect(r.verdict).toBe('differ')
    expect(r.result.main).toBe('no value of x works')
    expect(r.result.roots).toBeUndefined()
    expect(r.result.unconfirmed).toBe(true)
    expect(r.line).toMatch(/^PHYSLAB_CHECK calc-disagree /)
  })

  it('1/x + 1/(x - 1) = 2: the quick roots and the working agree, so the card stands as it is', () => {
    const { r } = joined('1/x+1/(x-1)=2', `${frac('1', 'x')}+${frac('1', 'x-1')}=2`)
    expect(r.verdict).toBe('agree')
    expect(r.result.unconfirmed).toBeFalsy()
  })

  it('a working whose own check failed does not overrule the quick root', () => {
    const { card, working } = joined('(x^2-1)/(x-1)=2', `${frac('x^2-1', 'x-1')}=2`)
    if (!working) throw new Error('the working should be there')
    const r = reconcile(card, { ...working, checked: 'failed' })
    expect(r.verdict).toBe('unchecked')
    expect(r.result.main).toBe('x = 1')
  })
})

describe('Rational equations: the break-it cases stay honest', () => {
  // Found by an independent numeric probe (every answer put back into the equation as typed). None of these may come out
  // with a wrong or excluded value marked checked; a refusal is a pass.
  it('x/(x + 1) = 1 − 1/(x + 1) is a whole line of answers (every x except −1): no root list is claimed', () => {
    const w = calculatorWorking(`${frac('x', 'x+1')}=1-${frac('1', 'x+1')}`)
    expect(w?.checked === 'ok' && (w?.answers.length ?? 0) > 0).toBe(false)
    expect(w?.answers ?? []).toEqual([])
  })

  it('1/(x − 2/(x + 1)) = 1: −2, −1 and 1 are all named as excluded, and ±√3 are the kept roots', () => {
    const w = calculatorWorking(`${frac('1', `x-${frac('2', 'x+1')}`)}=1`)
    expect(w?.method).toBe('Rational equation')
    expect(w?.checked).toBe('ok')
    expect(w?.answers.map((a) => a.tex)).toEqual(['-\\sqrt{3}', '\\sqrt{3}'])
    expect(w?.moves[0].head).toBe('x cannot be −2, −1 or 1, because a denominator would be 0.')
    for (const value of ['-sqrt(3)', 'sqrt(3)']) {
      expect(holdsInOriginal('(1)/(x-(2)/(x+1))=1', value, ['-2', '-1', '1'])).toBe(true)
    }
  })

  it('x²/x = 0: the only root of the cleared polynomial is the excluded 0, so the working says no value works', () => {
    const w = calculatorWorking(`${frac('x^2', 'x')}=0`)
    expect(w?.method).toBe('Rational equation')
    expect(w?.checked).toBe('ok')
    expect(w?.answers.map((a) => a.tex)).toEqual(['\\text{no value of x works}'])
    expect(w?.moves[0].head).toBe('x cannot be 0, because a denominator would be 0.')
  })

  it('1/x² = 1/x: 0 is excluded and x = 1 is kept', () => {
    const w = calculatorWorking(`${frac('1', 'x^2')}=${frac('1', 'x')}`)
    expect(w?.checked).toBe('ok')
    expect(w?.answers.map((a) => a.tex)).toEqual(['1'])
    expect(holdsInOriginal('(1)/(x^2)-(1)/(x)=0', '1', ['0'])).toBe(true)
  })

  it('1/(x − 1)³ = 1/(x − 1): the multiplier takes the highest power, so x = 0 or x = 2 (1 excluded)', () => {
    const w = calculatorWorking(`${frac('1', '(x-1)^3')}=${frac('1', 'x-1')}`)
    expect(w?.checked).toBe('ok')
    expect(w?.answers.map((a) => a.tex)).toEqual(['0', '2'])
    expect(holdsInOriginal('(1)/((x-1)^3)-(1)/(x-1)=0', '0', ['1'])).toBe(true)
    expect(holdsInOriginal('(1)/((x-1)^3)-(1)/(x-1)=0', '2', ['1'])).toBe(true)
  })

  it('(x² − 9)/(x + 3) = 0: x = −3 is excluded, so the one root kept is 3', () => {
    const w = calculatorWorking(`${frac('x^2-9', 'x+3')}=0`)
    expect(w?.checked).toBe('ok')
    expect(w?.answers.map((a) => a.tex)).toEqual(['3'])
    expect(holdsInOriginal('((x^2-9)/(x+3))=0', '3', ['-3'])).toBe(true)
  })

  it('the same work is done for a letter other than x: 1/a + 1/(a − 1) = 2 keeps the same two roots', () => {
    const w = calculatorWorking(`${frac('1', 'a')}+${frac('1', 'a-1')}=2`)
    expect(w?.checked).toBe('ok')
    expect(w?.answers.map((a) => a.tex)).toEqual(['\\frac{2-\\sqrt{2}}{2}', '\\frac{2+\\sqrt{2}}{2}'])
    expect(w?.moves[0].head).toBe('a cannot be 0 or 1, because a denominator would be 0.')
    for (const value of ['(2-sqrt(2))/2', '(2+sqrt(2))/2']) {
      const a = Number(evaluate(value))
      expect(Math.abs(Number(evaluate('(1)/(a)+(1)/(a-1)', { a })) - 2)).toBeLessThan(1e-9)
    }
  })
})

// Part R (radical equations) of the checked step engine: an equation with a square root is solved by isolating the root,
// squaring both sides, solving the squared equation through the router, and then putting every candidate back into the
// ORIGINAL equation. A candidate that does not hold (an extraneous root) is rejected in words; a square root is never
// negative, so an equation that makes one negative has no solution. Nothing is shown unless every check is exact.

import { describe, expect, it } from 'vitest'
import { usePure } from '../src/renderer/src/math/pure/store'
import { reconcile } from '../src/renderer/src/calc/working'
import { evaluateInput, type EvalResult } from '../src/renderer/src/calc/evaluateInput'
import { createDefaultStepRouter, stepWorkingFor } from '../src/renderer/src/math/steps/solve'
import { defaultCheckAdapter, normalizeDisplayed } from '../src/renderer/src/math/steps/check-adapter'
import { validateWorking, validateStep } from '../src/renderer/src/math/steps/validate'
import { CANT_SHOW_STEPS_REASON, type Problem, type StepAnswer, type Working } from '../src/renderer/src/math/steps/types'
import { resetGlobals } from './helpers/globals'

const adapter = defaultCheckAdapter
const router = createDefaultStepRouter(adapter)

function answerValues(answer?: StepAnswer | StepAnswer[]): string[] {
  if (!answer) return []
  const list = Array.isArray(answer) ? answer : [answer]
  return list.map((a) => normalizeDisplayed(a.value ?? a.tex))
}

/** The Calculator's answer list, as the texts the panel shows, normalised the same way. */
function texValues(list: { tex: string }[] | undefined): string[] {
  return (list ?? []).map((a) => normalizeDisplayed(a.tex))
}

function headsOf(moves: { head: string }[]): string[] {
  return moves.map((m) => m.head)
}

/** The calculator's working for a line typed as LaTeX (as the maths field sends it, with the "=" quiet flag). */
function calculatorWorking(latex: string) {
  resetGlobals()
  usePure.setState({ working: null, input: '', inputLatex: '', history: [] })
  usePure.getState().runLatex(latex, 'auto', { quiet: true })
  return usePure.getState().working
}

/** The sign written before a number in a typed sum: "+ 3", "- 3". */
function signed(v: number): string {
  return `${v < 0 ? '-' : '+'} ${Math.abs(v)}`
}

/** A fraction n/d in lowest terms with d > 0, as [n, d]. */
function reduceFraction(n: number, d: number): [number, number] {
  const g = gcd(Math.abs(n), Math.abs(d))
  const sign = d < 0 ? -1 : 1
  return [(sign * n) / g, (sign * d) / g]
}

function gcd(x: number, y: number): number {
  return y === 0 ? x : gcd(y, x % y)
}

/** A reduced fraction as the checks write a root: "3", "-1/2", "1/4". */
function fractionText(n: number, d: number): string {
  return d === 1 ? `${n}` : `${n}/${d}`
}

describe('Part R: radical equations in the checked step engine', () => {
  it('solves sqrt(x + 1) = x - 1 with x = 3 and rejects x = 0 in words', () => {
    const w = calculatorWorking(String.raw`\sqrt{x+1}=x-1`)
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.noWorking).toBeFalsy()
    expect(w?.answers).toEqual([{ label: 'x', tex: '3' }])
    expect(w?.checked).toBe('ok')
    expect(w?.moves.length).toBeGreaterThanOrEqual(3)
    expect(w?.moves[0].head).toBe('Square both sides')
    expect(w?.moves[0].rule).toBe('Squaring')
    const heads = headsOf(w?.moves ?? [])
    expect(heads.some((h) => /x = 0 .*not a solution/.test(h))).toBe(true)
    expect(heads.some((h) => /x = 3 .*is a solution/.test(h))).toBe(true)
  })

  it('solves sqrt(2x + 3) = x with x = 3 and rejects x = -1', () => {
    const w = calculatorWorking(String.raw`\sqrt{2x+3}=x`)
    expect(w?.noWorking).toBeFalsy()
    expect(w?.answers).toEqual([{ label: 'x', tex: '3' }])
    expect(w?.checked).toBe('ok')
    expect(headsOf(w?.moves ?? []).some((h) => /x = −1 .*not a solution/.test(h))).toBe(true)
  })

  it('isolates the root in sqrt(x) + 2 = x, solves x = 4 and rejects x = 1', () => {
    const w = calculatorWorking(String.raw`\sqrt{x}+2=x`)
    expect(w?.noWorking).toBeFalsy()
    expect(w?.answers).toEqual([{ label: 'x', tex: '4' }])
    expect(w?.checked).toBe('ok')
    expect(w?.moves[0].head).toBe('Subtract 2 from both sides')
    expect(headsOf(w?.moves ?? []).some((h) => /x = 1 .*not a solution/.test(h))).toBe(true)
  })

  it('squares both radicals in sqrt(x + 5) = sqrt(2x - 1) and solves x = 6', () => {
    const w = calculatorWorking(String.raw`\sqrt{x+5}=\sqrt{2x-1}`)
    expect(w?.noWorking).toBeFalsy()
    expect(w?.answers).toEqual([{ label: 'x', tex: '6' }])
    expect(w?.checked).toBe('ok')
    expect(headsOf(w?.moves ?? []).some((h) => /x = 6 .*is a solution/.test(h))).toBe(true)
  })

  it('says that sqrt(x - 3) = -2 has no solution, because a square root is never negative', () => {
    const w = calculatorWorking(String.raw`\sqrt{x-3}=-2`)
    expect(w?.noWorking).toBeFalsy()
    expect(w?.answers.length).toBe(1)
    expect(w?.answers[0].tex).toContain('No real solution')
    expect(w?.checked).toBe('ok')
    expect(headsOf(w?.moves ?? []).some((h) => /never negative/.test(h))).toBe(true)
  })

  it('writes the negative-root sentence with raised powers and no caret: √(x² − 3) = −2', () => {
    const w = calculatorWorking(String.raw`\sqrt{x^2-3}=-2`)
    expect(w?.noWorking).toBeFalsy()
    const heads = headsOf(w?.moves ?? [])
    expect(heads.some((h) => /never negative, so √\(x² − 3\) = −2 has no solution\./.test(h))).toBe(true)
    expect(heads.some((h) => h.includes('^'))).toBe(false)
  })

  it('rejects a root that makes the number under a square root negative (sqrt(-x - 1) = sqrt(x - 3))', () => {
    const w = calculatorWorking(String.raw`\sqrt{-x-1}=\sqrt{x-3}`)
    expect(w?.noWorking).toBeFalsy()
    expect(w?.answers[0].tex).toContain('No real solution')
    expect(w?.checked).toBe('ok')
    expect(headsOf(w?.moves ?? []).some((h) => /x = 1 makes the number under the root −2.*not a solution/.test(h))).toBe(true)
  })

  it('names the roots of the squared equation before putting them back', () => {
    const w = calculatorWorking(String.raw`\sqrt{x}=x-6`)
    expect(w?.answers).toEqual([{ label: 'x', tex: '9' }])
    expect(headsOf(w?.moves ?? []).some((h) => /has the roots 4 and 9, worked out below/.test(h))).toBe(true)
    expect(headsOf(w?.moves ?? []).some((h) => /x = 4 gives 2 on the left but −2 on the right, so it is not a solution/.test(h))).toBe(true)
  })

  it('keeps both roots of sqrt(x) = 2x, 0 and 1/4, because each one holds in the original', () => {
    const w = calculatorWorking(String.raw`\sqrt{x}=2x`)
    expect(w?.noWorking).toBeFalsy()
    expect(texValues(w?.answers)).toEqual(['0', '1/4'])
    expect(w?.checked).toBe('ok')
    expect(headsOf(w?.moves ?? []).some((h) => /x = 1\/4 .*is a solution/.test(h))).toBe(true)
  })

  it('keeps both signs of x when sqrt(x^2) = 3, since -3 and 3 each put a root of 9 back', () => {
    const w = calculatorWorking(String.raw`\sqrt{x^2}=3`)
    expect(w?.noWorking).toBeFalsy()
    expect(texValues(w?.answers)).toEqual(['-3', '3'])
    expect(w?.checked).toBe('ok')
  })

  it('says sqrt(x - 1) = x has no solution, because its squared quadratic has no real root', () => {
    const w = calculatorWorking(String.raw`\sqrt{x-1}=x`)
    expect(w?.noWorking).toBeFalsy()
    expect(w?.answers.length).toBe(1)
    expect(w?.answers[0].tex).toContain('No real solution')
    expect(w?.checked).toBe('ok')
  })

  it('reaches the same answer through stepWorkingFor with a plain typed problem', () => {
    const doc = stepWorkingFor({ job: 'solve', input: 'sqrt(x + 1) = x - 1', variable: 'x' }, adapter)
    expect(doc).not.toBeNull()
    expect(doc?.answers.map((a) => a.tex)).toEqual(['3'])
    expect(doc?.checked).toBe('ok')
  })

  it('does not contradict the calculator card for sqrt(x + 1) = x - 1', () => {
    const w = calculatorWorking(String.raw`\sqrt{x+1}=x-1`)
    const card: EvalResult | null = evaluateInput('COMP', 'sqrt(x+1)=x-1', { vars: {}, ans: 0, angle: 'deg' })
    if (card) expect(reconcile(card, w).verdict).not.toBe('differ')
  })

  it('gives no working for a shape it cannot do soundly, so the old answer stays', () => {
    for (const input of ['sqrt(x) + sqrt(x + 1) = 3', '2 sqrt(x) = x']) {
      const problem: Problem = { job: 'solve', input, variable: 'x' }
      const w = router.solve(problem)
      expect(w.noWorking).toBe(true)
      expect(w.reason).toBe(CANT_SHOW_STEPS_REASON)
    }
  })

  it('moves the squared equation to one side when the square leaves x^2 on both sides (sqrt(x^2 - 4) = x - 1)', () => {
    const w = calculatorWorking(String.raw`\sqrt{x^2-4}=x-1`)
    expect(w?.noWorking).toBeFalsy()
    expect(w?.answers).toEqual([{ label: 'x', tex: '5/2' }])
    expect(w?.checked).toBe('ok')
    const heads = headsOf(w?.moves ?? [])
    expect(heads[0]).toBe('Square both sides')
    expect(heads).toContain('Move every term to the left side')
    // The moved form is the squared equation with nothing on the right, and the sub-working solves that same form.
    expect((w?.moves ?? []).some((m) => /^Solve .*= 0$/.test(m.subgoal ?? ''))).toBe(true)
  })

  it('solves sqrt(x^2 - 6x + 9) = x as 3/2 and sqrt(4x^2 - 3) = 2x - 1 as 1 after moving the square to one side', () => {
    const a = calculatorWorking(String.raw`\sqrt{x^2-6x+9}=x`)
    expect(a?.noWorking).toBeFalsy()
    expect(a?.answers).toEqual([{ label: 'x', tex: '3/2' }])
    expect(a?.checked).toBe('ok')
    expect(headsOf(a?.moves ?? [])).toContain('Move every term to the left side')
    const b = calculatorWorking(String.raw`\sqrt{4x^2-3}=2x-1`)
    expect(b?.noWorking).toBeFalsy()
    expect(b?.answers).toEqual([{ label: 'x', tex: '1' }])
    expect(b?.checked).toBe('ok')
  })

  it('refuses a move-to-one-side step whose after is not the squared equation with nothing on the right', () => {
    const w = router.solve({ job: 'solve', input: 'sqrt(x^2 - 4) = x - 1', variable: 'x' })
    expect(w.noWorking).toBeFalsy()
    const move = JSON.parse(JSON.stringify(w.steps.find((s) => (s.op as { kind?: string } | undefined)?.kind === 'move-to-left')))
    expect(move).toBeTruthy()
    move.after = 'x - 5 = 0'
    expect(validateStep(move, adapter).verdict).not.toBe('valid')
  })

  it('still refuses a squared equation with infinitely many solutions, and never shows a wrong finite answer', () => {
    for (const input of ['sqrt(x^2 + 4x + 4) = x + 2', 'sqrt(x^2) = x', 'sqrt(x^2 + 2x + 1) = x + 1']) {
      const w = router.solve({ job: 'solve', input, variable: 'x' })
      expect(w.noWorking, input).toBe(true)
    }
    // A squared equation that is a perfect square (a double root) is declined rather than reported with a made-up
    // multiplicity; if a working is ever shown for it, the answer must be exactly the one root.
    const doubled = router.solve({ job: 'solve', input: 'sqrt(2x + 1) = x + 1', variable: 'x' })
    if (!doubled.noWorking) expect(answerValues(doubled.answer)).toEqual(['0'])
  })

  // ---- wrong steps must never be shown as valid ----

  it('refuses a working that keeps the extraneous root x = 0 as a solution', () => {
    const w = router.solve({ job: 'solve', input: 'sqrt(x + 1) = x - 1', variable: 'x' })
    expect(w.noWorking).toBeFalsy()
    expect(validateWorking(w, adapter, 'real').valid).toBe(true)
    const forged: Working = JSON.parse(JSON.stringify(w))
    forged.answer = [
      { label: 'x', tex: '0' },
      { label: 'x', tex: '3' }
    ]
    expect(validateWorking(forged, adapter, 'real').valid).toBe(false)
  })

  it('refuses a squaring step whose after is not the squared equation', () => {
    const w = router.solve({ job: 'solve', input: 'sqrt(x + 1) = x - 1', variable: 'x' })
    const step = JSON.parse(JSON.stringify(w.steps[0]))
    step.after = 'x + 1 = (x + 1)^2'
    expect(validateStep(step, adapter).verdict).not.toBe('valid')
  })

  it('refuses a root step that marks an extraneous candidate as a solution', () => {
    const w = router.solve({ job: 'solve', input: 'sqrt(x + 1) = x - 1', variable: 'x' })
    const forged: Working = JSON.parse(JSON.stringify(w))
    const last = forged.steps[forged.steps.length - 1]
    const data = last.data as { checks?: { value: string; ok: boolean }[] }
    if (data.checks) {
      for (const c of data.checks) if (c.value === '0') c.ok = true
    }
    expect(validateStep(last, adapter).verdict).not.toBe('valid')
  })

  it('refuses a claim of no solution for sqrt(x - 3) = 2, whose root x = 7 really holds', () => {
    const w = router.solve({ job: 'solve', input: 'sqrt(x - 3) = 2', variable: 'x' })
    expect(w.noWorking).toBeFalsy()
    expect(answerValues(w.answer)).toEqual(['7'])
    const forged: Working = JSON.parse(JSON.stringify(w))
    forged.answer = [{ label: 'x', tex: '\\text{No real solution}' }]
    expect(validateWorking(forged, adapter, 'real').valid).toBe(false)
  })

  // ---- generated cases: sqrt(a x + b) = c x + k, each answer checked by exact whole-number substitution ----

  it('solves 100 generated sqrt(ax + b) = cx + k cases and matches exact substitution wherever it shows a working', () => {
    // A small seeded generator, so the same 100 cases run every time.
    let seed = 20261019
    const next = (n: number): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed % n
    }
    const cases: { a: number; b: number; c: number; k: number; text: string }[] = []
    while (cases.length < 100) {
      const a = 1 + next(3)
      const b = next(11) - 5
      const c = 1 + next(2)
      const k = next(9) - 4
      cases.push({ a, b, c, k, text: `sqrt(${a}x ${signed(b)}) = ${c}x ${signed(k)}` })
    }
    let shown = 0
    let declined = 0
    let withRoots = 0
    let noneHold = 0
    for (const { a, b, c, k, text } of cases) {
      const w = router.solve({ job: 'solve', input: text, variable: 'x' })
      // Exact reference in whole numbers. Squaring gives c² x² + (2ck − a) x + (k² − b) = 0, whose discriminant decides it:
      // negative means no real root, a perfect square means rational roots (−B ± s) / (2c²), and anything else means
      // irrational roots, which this method declines rather than guessing a decimal.
      const A = c * c
      const B = 2 * c * k - a
      const C = k * k - b
      const disc = B * B - 4 * A * C
      const s = Math.round(Math.sqrt(Math.max(disc, 0)))
      if (disc >= 0 && s * s !== disc) {
        declined++
        expect(w.noWorking, `an irrational squared root must be declined: ${text}`).toBe(true)
        continue
      }
      expect(w.noWorking, `a rational case must be shown: ${text}`).toBeFalsy()
      // The squared equation's rational roots, each in lowest terms. A double root is listed once.
      const squared: [number, number][] = []
      if (disc >= 0) {
        for (const num of [-B - s, -B + s]) {
          const r = reduceFraction(num, 2 * A)
          if (!squared.some(([n, d]) => n === r[0] && d === r[1])) squared.push(r)
        }
      }
      // A root holds in the ORIGINAL equation when a x + b >= 0, c x + k >= 0 and the two sides agree. With r = n/d (d > 0)
      // that is a n + b d >= 0, c n + k d >= 0 and (a n + b d) d = (c n + k d)², all in whole numbers.
      const holds = squared
        .filter(([n, d]) => a * n + b * d >= 0 && c * n + k * d >= 0 && (a * n + b * d) * d === (c * n + k * d) ** 2)
        .sort(([n1, d1], [n2, d2]) => n1 * d2 - n2 * d1)
      if (holds.length === 0) noneHold++
      else withRoots++
      const expected =
        holds.length === 0
          ? [normalizeDisplayed('\\text{No real solution}')]
          : holds.map(([n, d]) => normalizeDisplayed(fractionText(n, d)))
      expect(answerValues(w.answer), text).toEqual(expected)
      expect(w.checked, text).toBe('ok')
      expect(validateWorking(w, adapter, 'real').valid, text).toBe(true)
      shown++
    }
    expect(shown + declined).toBe(100)
    // Most generated cases have rational roots or none, so most of them are shown, and both paths are exercised.
    expect(shown).toBeGreaterThanOrEqual(60)
    expect(withRoots).toBeGreaterThan(0)
    expect(noneHold).toBeGreaterThan(0)
  }, 120_000)
})

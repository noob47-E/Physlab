// Part S1e: inequalities in one letter, worked by the checked step engine.
//
// The Calculator's working for a line with < <= > >= (through runLatex), the router's working for generated
// inequalities checked against plain sampling, and workings that claim a wrong solution set, which must not be valid.

import { beforeEach, describe, expect, it } from 'vitest'
import { usePure } from '../src/renderer/src/math/pure/store'
import { createDefaultStepRouter } from '../src/renderer/src/math/steps/solve'
import { validateWorking } from '../src/renderer/src/math/steps/validate'
import { intervalForm, setData, setForm, type IneqPart } from '../src/renderer/src/math/steps/inequality'
import { finishStep } from '../src/renderer/src/math/steps/sentences'
import type { Step, Working } from '../src/renderer/src/math/steps/types'
import { rat } from '../src/renderer/src/math/pure/rat'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  usePure.setState({ working: null, input: '', inputLatex: '', history: [] })
})

/** The answers of the Calculator's working as label and text, for comparison. */
function answerTexts(): string[] {
  const w = usePure.getState().working
  return (w?.answers ?? []).map((a) => a.tex)
}

/** The Calculator's working for one typed LaTeX line, asserted to be a checked working by the step engine. */
function workedLine(latex: string): NonNullable<ReturnType<typeof usePure.getState>['working']> {
  usePure.getState().runLatex(latex, 'auto')
  const w = usePure.getState().working
  expect(w).not.toBeNull()
  expect(w?.error).toBeUndefined()
  expect(w?.noWorking).toBeFalsy()
  expect(w?.method).toBe('Inequalities')
  expect(w?.checked).toBe('ok')
  expect(w?.moves?.length ?? 0).toBeGreaterThanOrEqual(3)
  return w as NonNullable<typeof w>
}

describe('S1e: inequalities in the Calculator', () => {
  it('solves a linear inequality and gives the set and its interval form', () => {
    workedLine('3x-5<7')
    expect(answerTexts()).toEqual(['x < 4', '(-\\infty, 4)'])
  })

  it('flips the sign when dividing by a negative number, said in words', () => {
    const w = workedLine('-2x+1\\geq 5')
    expect(answerTexts()).toEqual(['x \\le -2', '(-\\infty, -2]'])
    const flip = w.moves.find((m) => m.head.includes('negative number'))
    expect(flip?.head).toBe('Divide both sides by −2: dividing by a negative number flips the sign')
    expect(flip?.rule).toBe('Divide by a negative: flip the sign')
  })

  it('solves a quadratic by its roots and the sign of each part', () => {
    const w = workedLine('x^2-5x+6>0')
    expect(answerTexts()).toEqual(['x < 2 \\text{ or } x > 3', '(-\\infty, 2) \\cup (3, \\infty)'])
    expect(w.moves.some((m) => m.head === 'Factorise the left side as (x − 2)(x − 3)')).toBe(true)
    expect(w.moves.some((m) => m.head.startsWith('Sign in each part: x < 2 is positive'))).toBe(true)
  })

  it('keeps the end points of a closed quadratic set', () => {
    workedLine('x^2-4x+3\\leq 0')
    expect(answerTexts()).toEqual(['1 \\le x \\le 3', '[1, 3]'])
  })

  it('leaves the pole of a fraction out of the set, and says so', () => {
    const w = workedLine('\\frac{x-1}{x+2}\\geq 0')
    expect(answerTexts()).toEqual(['x < -2 \\text{ or } x \\ge 1', '(-\\infty, -2) \\cup [1, \\infty)'])
    expect(w.moves.some((m) => m.head.includes('x = −2') && m.head.includes('left out'))).toBe(true)
  })

  it('solves an absolute value inequality between two points', () => {
    workedLine('|2x-1|<5')
    expect(answerTexts()).toEqual(['-2 < x < 3', '(-2, 3)'])
  })

  it('solves an absolute value inequality outside two points', () => {
    workedLine('|2x-1|\\geq 3')
    expect(answerTexts()).toEqual(['x \\le -1 \\text{ or } x \\ge 2', '(-\\infty, -1] \\cup [2, \\infty)'])
  })

  it('gives every real number or no value when the quadratic has no real roots', () => {
    workedLine('x^2+1>0')
    expect(answerTexts()).toEqual(['\\text{every real number}', '(-\\infty, \\infty)'])
    workedLine('x^2+1<0')
    expect(answerTexts()).toEqual(['\\text{no value of x works}', '\\varnothing'])
  })

  it('leaves an equation to its own method', () => {
    usePure.getState().runLatex('2x + 4 = 10', 'auto')
    expect(usePure.getState().working?.method).toBe('Linear equation in one variable')
  })
})

/** The router's working for one typed inequality, with no Calculator in between. */
function routed(input: string): Working {
  return createDefaultStepRouter().solve({ job: 'solve', input })
}

/** A solution set's intervals as numbers, read from the working's last step (the claim the step makes). */
function intervalsOfLast(w: Working): Array<{ lo: number | null; loC: boolean; hi: number | null; hiC: boolean }> {
  const last = w.steps[w.steps.length - 1]
  const data = last.data as { intervals: Array<{ lo: string | null; loClosed: boolean; hi: string | null; hiClosed: boolean }> }
  const num = (s: string | null): number | null => {
    if (s === null) return null
    const [n, d] = s.split('/')
    return Number(n) / Number(d ?? '1')
  }
  return data.intervals.map((iv) => ({ lo: num(iv.lo), loC: iv.loClosed, hi: num(iv.hi), hiC: iv.hiClosed }))
}

function inSet(x: number, set: ReturnType<typeof intervalsOfLast>): boolean {
  return set.some(
    (iv) => (iv.lo === null || (iv.loC ? x >= iv.lo : x > iv.lo)) && (iv.hi === null || (iv.hiC ? x <= iv.hi : x < iv.hi))
  )
}

/** A small deterministic random generator, so the same 200 inequalities are checked on every run. */
function generator(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** c2 x^2 + c1 x + c0 as text, the way a student types it. */
function polyText(c2: number, c1: number, c0: number): string {
  const parts: string[] = []
  const add = (c: number, body: string): void => {
    if (c === 0) return
    const mag = Math.abs(c)
    const coef = body === '' ? String(mag) : mag === 1 ? body : `${mag}${body}`
    if (parts.length === 0) parts.push(c < 0 ? `-${coef}` : coef)
    else parts.push(`${c < 0 ? '-' : '+'}${coef}`)
  }
  add(c2, 'x^2')
  add(c1, 'x')
  add(c0, '')
  return parts.length === 0 ? '0' : parts.join('')
}

const OPS = ['<', '<=', '>', '>='] as const

/** Whether "value rel 0" holds, for a whole number value. */
function relHolds(value: number, op: (typeof OPS)[number]): boolean {
  return op === '<' ? value < 0 : op === '<=' ? value <= 0 : op === '>' ? value > 0 : value >= 0
}

describe('S1e: 200 generated inequalities against sampling', () => {
  it('checks every linear and quadratic case: valid, and the same set as sampling at quarter points', () => {
    const rnd = generator(20261019)
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]
    const range = (lo: number, hi: number): number[] => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
    let checked = 0
    let linearValid = 0
    let quadraticZeroValid = 0

    // 100 linear: a x + b op c, with a, b, c whole numbers and a not 0.
    for (let i = 0; i < 100; i++) {
      const a = pick(range(-5, 5).filter((n) => n !== 0))
      const b = pick(range(-9, 9))
      const c = pick(range(-9, 9))
      const op = pick(OPS)
      const input = `${polyText(0, a, b)}${op}${c}`
      const w = routed(input)
      expect(w.noWorking, input).toBeFalsy()
      expect(validateWorking(w).valid, input).toBe(true)
      expect(w.checked, input).toBe('ok')
      linearValid++
      const set = intervalsOfLast(w)
      // The sample: x = k/4. Four times (a x + b − c) is a whole number, a·k + 4(b − c), with the same sign.
      for (let k = -80; k <= 80; k++) {
        const truth = relHolds(a * k + 4 * (b - c), op)
        expect(inSet(k / 4, set), `${input} at x=${k / 4}`).toBe(truth)
      }
      checked++
    }

    // 100 quadratic: a quadratic with whole-number roots, and a constant on the right (0 most of the time).
    for (let i = 0; i < 100; i++) {
      const r1 = pick(range(-4, 4))
      const r2 = pick(range(-4, 4))
      const lead = pick([1, -1, 2, -2])
      const shift = rnd() < 0.5 ? 0 : pick(range(-3, 3))
      const op = pick(OPS)
      const c2 = lead
      const c1 = -lead * (r1 + r2)
      const c0 = lead * r1 * r2 - shift
      const input = `${polyText(c2, c1, c0)}${op}0`
      const w = routed(input)
      // A quadratic is declined only when its real roots are irrational: the discriminant is positive and not a square.
      const disc = c1 * c1 - 4 * c2 * c0
      const perfectSquare = disc >= 0 && Math.round(Math.sqrt(disc)) ** 2 === disc
      if (w.noWorking) {
        expect(disc > 0 && !perfectSquare, input).toBe(true)
        continue
      }
      expect(disc < 0 || perfectSquare, input).toBe(true)
      expect(validateWorking(w).valid, input).toBe(true)
      expect(w.checked, input).toBe('ok')
      if (shift === 0) quadraticZeroValid++
      const set = intervalsOfLast(w)
      // The sample: x = k/4, and 16 times (c2 x² + c1 x + c0) is the whole number c2 k² + 4 c1 k + 16 c0, same sign.
      for (let k = -80; k <= 80; k++) {
        const truth = relHolds(c2 * k * k + 4 * c1 * k + 16 * c0, op)
        expect(inSet(k / 4, set), `${input} at x=${k / 4}`).toBe(truth)
      }
      checked++
    }

    // Every linear case, every quadratic with whole roots or none: the rest are declined, never shown wrong.
    expect(linearValid).toBe(100)
    expect(quadraticZeroValid).toBeGreaterThanOrEqual(40)
    expect(checked).toBeGreaterThanOrEqual(150)
  })
})

describe('S1e: workings that claim a wrong solution set are not valid', () => {
  /** A copy of a working whose last step, and its answers, claim `wrong` as the solution set. */
  function claimSet(w: Working, wrong: IneqPart[]): Working {
    const steps = w.steps.map((s) => ({ ...s }))
    const last = steps[steps.length - 1]
    const data = { variable: 'x', intervals: setData(wrong) }
    steps[steps.length - 1] = finishStep({ ...last, after: intervalForm(wrong), sentence: '', rule: undefined, data } as Step)
    return {
      ...w,
      steps,
      answer: [
        { label: '', tex: setForm(wrong, 'x', true) },
        { label: '', tex: intervalForm(wrong) }
      ]
    }
  }

  it('rejects the wrong relation for 3x - 5 < 7 (x > 4)', () => {
    const w = routed('3x-5<7')
    const bad = claimSet(w, [{ lo: rat(4), loClosed: false, hi: null, hiClosed: false }])
    expect(validateWorking(bad).valid).toBe(false)
  })

  it('rejects a closed end at 4 for 3x - 5 < 7 (4 does not satisfy it)', () => {
    const w = routed('3x-5<7')
    const bad = claimSet(w, [{ lo: null, loClosed: false, hi: rat(4), hiClosed: true }])
    expect(validateWorking(bad).valid).toBe(false)
  })

  it('rejects a closed [2, 3] for x^2 - 5x + 6 > 0', () => {
    const w = routed('x^2-5x+6>0')
    const bad = claimSet(w, [{ lo: rat(2), loClosed: true, hi: rat(3), hiClosed: true }])
    expect(validateWorking(bad).valid).toBe(false)
  })

  it('rejects a set that includes the excluded pole of (x - 1)/(x + 2) >= 0', () => {
    const w = routed('(x-1)/(x+2)>=0')
    const bad = claimSet(w, [
      { lo: null, loClosed: false, hi: rat(-2), hiClosed: true },
      { lo: rat(1), loClosed: true, hi: null, hiClosed: false }
    ])
    expect(validateWorking(bad).valid).toBe(false)
  })

  it('rejects an open end at 1 for (x - 1)/(x + 2) >= 0, where the fraction is 0', () => {
    const w = routed('(x-1)/(x+2)>=0')
    const bad = claimSet(w, [
      { lo: null, loClosed: false, hi: rat(-2), hiClosed: false },
      { lo: rat(1), loClosed: false, hi: null, hiClosed: false }
    ])
    expect(validateWorking(bad).valid).toBe(false)
  })

  it('rejects a half-open (-2, 3] for |2x - 1| < 5', () => {
    const w = routed('|2x-1|<5')
    const bad = claimSet(w, [{ lo: rat(-2), loClosed: false, hi: rat(3), hiClosed: true }])
    expect(validateWorking(bad).valid).toBe(false)
  })

  it('rejects a divide step that forgets to flip the sign for -2x + 1 >= 5', () => {
    const w = routed('-2x+1>=5')
    const steps = w.steps.map((s) => ({ ...s }))
    const divide = steps.find((s) => s.kind === 'IneqMove' && (s.data as { move?: { kind?: string } }).move?.kind === 'ineq-divide')
    expect(divide).toBeDefined()
    // The move now claims x >= -2 (no flip) and the rest of the working follows that wrong line.
    const wrongAfter = 'x >= -2'
    const idx = steps.indexOf(divide as Step)
    steps[idx] = { ...(divide as Step), after: wrongAfter }
    steps[idx + 1] = { ...steps[idx + 1], before: wrongAfter }
    const bad: Working = { ...w, steps }
    expect(validateWorking(bad).valid).toBe(false)
  })

  it('rejects a sign step whose signs are wrong for x^2 - 5x + 6 > 0', () => {
    const w = routed('x^2-5x+6>0')
    const steps = w.steps.map((s) => ({ ...s }))
    const idx = steps.findIndex((s) => s.kind === 'IneqSigns')
    const data = { ...(steps[idx].data as Record<string, unknown>), signs: ['+', '+', '+'] }
    steps[idx] = finishStep({ ...steps[idx], sentence: '', rule: undefined, data } as Step)
    expect(validateWorking({ ...w, steps }).valid).toBe(false)
  })
})

describe('S1e: the router never shows an inequality it cannot check', () => {
  it('declines an inequality with irrational roots, with no steps shown', () => {
    const w = routed('x^2-2>0')
    expect(w.noWorking).toBe(true)
    expect(w.steps).toHaveLength(0)
  })

  it('does not change how equations are split', () => {
    const w = routed('x^2-5x+6=0')
    expect(w.steps.length).toBeGreaterThan(0)
    expect(w.steps.some((s) => s.kind.startsWith('Ineq'))).toBe(false)
  })
})

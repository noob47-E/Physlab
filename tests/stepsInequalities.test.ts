// Part S1e: inequalities in one letter, worked by the checked step engine.
//
// The Calculator's working for a line with < <= > >= (through runLatex), the router's working for generated
// inequalities checked against plain sampling, and workings that claim a wrong solution set, which must not be valid.

import { beforeEach, describe, expect, it } from 'vitest'
import katex from 'katex'
import { usePure } from '../src/renderer/src/math/pure/store'
import { createDefaultStepRouter } from '../src/renderer/src/math/steps/solve'
import { validateWorking } from '../src/renderer/src/math/steps/validate'
import {
  agreesWithTypedSides,
  ineqDrawnTex,
  intervalForm,
  readInequality,
  setData,
  setForm,
  type IneqPart
} from '../src/renderer/src/math/steps/inequality'
import { finishStep } from '../src/renderer/src/math/steps/sentences'
import { reconcile } from '../src/renderer/src/calc/working'
import { evaluateInput } from '../src/renderer/src/calc/evaluateInput'
import { checkCalculatorGuess } from '../src/renderer/src/calc/guessCalc'
import { latexToMath } from '../src/renderer/src/math/latexToMath'
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
    expect(
      w.moves.some(
        (m) => m.head === 'Left side minus right side is positive for x < 2, negative for 2 < x < 3 and positive for x > 3.'
      )
    ).toBe(true)
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

  it('solves an absolute value against 0 and against a negative number', () => {
    // |g| is never negative: at 0 it is the one point where g is 0, and below 0 the relation is either true everywhere or
    // nowhere. The sign sentence names the expression as it reads (|x|, |x| + 1), never "|x| - 0" or "|x| - -1".
    workedLine('|x|\\leq 0')
    expect(answerTexts()).toEqual(['x = 0', '\\{0\\}'])
    expect(usePure.getState().working?.moves.some((m) => /\|x\| is positive for x < 0 and positive for x > 0\./.test(m.head))).toBe(true)
    workedLine('|x|<0')
    expect(answerTexts()).toEqual(['\\text{no value of x works}', '\\varnothing'])
    workedLine('|x|>0')
    expect(answerTexts()).toEqual(['x < 0 \\text{ or } x > 0', '(-\\infty, 0) \\cup (0, \\infty)'])
    workedLine('|x+3|\\leq 0')
    expect(answerTexts()).toEqual(['x = -3', '\\{-3\\}'])
    workedLine('|x|>-2')
    expect(answerTexts()).toEqual(['\\text{every real number}', '(-\\infty, \\infty)'])
    workedLine('|x|\\leq -1')
    expect(answerTexts()).toEqual(['\\text{no value of x works}', '\\varnothing'])
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

describe('S1e review: Auto leaves other jobs their lines and the imaginary unit alone', () => {
  it('keeps the Standard normal table for P(Z < 1.96) and its variants', () => {
    for (const line of ['P(Z<1.96)', 'P(Z>1.96)', 'P(Z<-1.5)', 'P(1.96>Z)']) {
      usePure.getState().runLatex(line, 'auto', { quiet: true })
      const w = usePure.getState().working
      expect(usePure.getState().job, line).toBe('normal')
      expect(w?.error, line).toBeUndefined()
      expect(w?.method, line).toMatch(/^Standard normal table/)
    }
  })

  it('sends a line with the imaginary unit to Complex, never to an inequality in i', () => {
    for (const line of ['3+2i<5', 'i^2+1>0', '3i-5\\leq 7', '|3+4i|<6', '3+2i>1', '2i<4', 'i^2<0']) {
      usePure.getState().runLatex(line, 'auto', { quiet: true })
      const w = usePure.getState().working
      expect(usePure.getState().job, line).toBe('complex')
      expect(w?.method, line).not.toBe('Inequalities')
    }
  })

  it('reads no inequality in i, e or pi', () => {
    expect(readInequality('2i<4')).toBeNull()
    expect(readInequality('i^2<0')).toBeNull()
    expect(readInequality('3+2i<5')).toBeNull()
    expect(readInequality('e<2')).toBeNull()
    expect(readInequality('pi<3')).toBeNull()
    expect(readInequality('x^2<4')).not.toBeNull()
  })

  it('keeps the old job for an inequality the step engine cannot work, such as irrational roots', () => {
    usePure.getState().runLatex('x^2-2>0', 'auto', { quiet: true })
    expect(usePure.getState().job).toBe('factor')
  })
})

describe('S1e review: the second check reads the typed sides, not the solver', () => {
  /** A solution part as a student would claim it: integer ends (null is an infinite end), each end open or closed. */
  const part = (lo: number | null, loClosed: boolean, hi: number | null, hiClosed: boolean): IneqPart => ({
    lo: lo === null ? null : rat(BigInt(lo)),
    loClosed,
    hi: hi === null ? null : rat(BigInt(hi)),
    hiClosed
  })

  it('agrees with the correct set of a quadratic, open and closed', () => {
    expect(agreesWithTypedSides('x^2-5x+6>0', [part(null, false, 2, false), part(3, false, null, false)])).toBe(true)
    expect(agreesWithTypedSides('x^2-5x+6>=0', [part(null, false, 2, true), part(3, true, null, true)])).toBe(true)
  })

  it('rejects a claimed set that is open where the typed relation allows equality, or closed where it does not', () => {
    expect(agreesWithTypedSides('x^2-5x+6>=0', [part(null, false, 2, false), part(3, false, null, false)])).toBe(false)
    expect(agreesWithTypedSides('x^2-5x+6>0', [part(null, false, 2, true), part(3, false, null, false)])).toBe(false)
  })

  it('rejects a set that includes the pole of a fraction, and accepts one that leaves it out', () => {
    expect(agreesWithTypedSides('(x-1)/(x+2)>=0', [part(null, false, -2, false), part(1, true, null, false)])).toBe(true)
    expect(agreesWithTypedSides('(x-1)/(x+2)>=0', [part(null, false, -2, true), part(1, true, null, false)])).toBe(false)
  })

  it('checks absolute values against the typed side, not a flipped one', () => {
    expect(agreesWithTypedSides('|2x-1|<5', [part(-2, false, 3, false)])).toBe(true)
    expect(agreesWithTypedSides('|2x-1|<5', [part(-2, false, 3, true)])).toBe(false)
    expect(agreesWithTypedSides('5>|2x-1|', [part(-2, false, 3, false)])).toBe(true)
    expect(agreesWithTypedSides('5>|2x-1|', [part(null, false, null, false)])).toBe(false)
  })

  it('agrees that a set is empty only when no point satisfies the typed inequality', () => {
    expect(agreesWithTypedSides('x^2+1<0', [])).toBe(true)
    expect(agreesWithTypedSides('x^2+1>0', [])).toBe(false)
    expect(agreesWithTypedSides('x^2+1>0', [part(null, false, null, false)])).toBe(true)
  })
})

describe('S1e round 2 review: the working says only what is true of the line it shows', () => {
  /** The Calculator's working for one typed LaTeX line, checked ok by the step engine (it may have only two steps). */
  function calcWorking(latex: string): NonNullable<ReturnType<typeof usePure.getState>['working']> {
    usePure.getState().runLatex(latex, 'auto', { quiet: true })
    const w = usePure.getState().working
    expect(w?.error, latex).toBeUndefined()
    expect(w?.noWorking, latex).toBeFalsy()
    expect(w?.method, latex).toBe('Inequalities')
    expect(w?.checked, latex).toBe('ok')
    return w as NonNullable<typeof w>
  }

  it('names no side for a denominator 0, whichever side the fraction is on', () => {
    const right = calcWorking('0>\\frac{x-1}{x+2}')
    expect(
      right.moves.some(
        (m) => m.head === 'The sides are equal when x = 1. A denominator is 0 when x = −2, so that point is left out.'
      )
    ).toBe(true)
    const left = calcWorking('x<\\frac{1}{x}')
    expect(left.moves.some((m) => m.head.includes('A denominator is 0 when x = 0, so that point is left out.'))).toBe(true)
    const both = calcWorking('\\frac{x}{x-1}>\\frac{x}{x+1}')
    expect(
      both.moves.some(
        (m) =>
          m.head === 'The sides are equal when x = 0. A denominator is 0 when x = −1 or x = 1, so those points are left out.'
      )
    ).toBe(true)
    for (const w of [right, left, both]) {
      expect(w.moves.some((m) => /left side is undefined/.test(m.head))).toBe(false)
    }
  })

  it('says which quantity is positive or negative, and gives no sign step for a linear line already solved', () => {
    expect(routed('-2x+1>=5').steps.some((s) => s.kind === 'IneqSigns')).toBe(false)
    const abs = calcWorking('|2x-1|\\geq 3')
    expect(
      abs.moves.some(
        (m) => m.head === '|2x − 1| − 3 is positive for x < −1, negative for −1 < x < 2 and positive for x > 2.'
      )
    ).toBe(true)
    const fraction = calcWorking('\\frac{x-1}{x+2}\\geq 0')
    expect(
      fraction.moves.some(
        (m) => m.head === 'Left side minus right side is positive for x < −2, negative for −2 < x < 1 and positive for x > 1.'
      )
    ).toBe(true)
  })

  it('draws every line of an inequality working as LaTeX that KaTeX reads: ≤ and ≥, fractions and no code-like brackets', () => {
    const lines = [
      'x\\le 3',
      '5-2x>=3x',
      '\\frac{x-1}{x+2}\\geq 0',
      '\\frac{x}{x^2-4}\\geq 0',
      '|x-1|\\leq 2',
      'x^2-4x+3\\leq 0',
      '\\frac{x}{x-1}>\\frac{x}{x+1}',
      '0>\\frac{x-1}{x+2}'
    ]
    for (const latex of lines) {
      const w = calcWorking(latex)
      expect(w.moves.length, latex).toBeGreaterThanOrEqual(2)
      for (const m of w.moves) {
        if (m.tex === undefined) continue
        expect(m.tex, `${latex}: ${m.tex}`).not.toMatch(/<=|>=|\//)
        expect(m.tex, `${latex}: ${m.tex}`).not.toMatch(/\^\{\(/)
        expect(() => katex.renderToString(m.tex as string, { displayMode: true, throwOnError: true, strict: 'ignore' }), `${latex}: ${m.tex}`).not.toThrow()
      }
    }
  })

  it('rejects a signs step that names another quantity than the one the line has', () => {
    const w = routed('|2x-1|>=3')
    const steps = w.steps.map((s) => ({ ...s }))
    const idx = steps.findIndex((s) => s.kind === 'IneqSigns')
    expect(idx).toBeGreaterThanOrEqual(0)
    const data = { ...(steps[idx].data as Record<string, unknown>), expression: 'left-minus-right' }
    steps[idx] = finishStep({ ...steps[idx], sentence: '', rule: undefined, data } as Step)
    expect(validateWorking({ ...w, steps }).valid).toBe(false)
  })
})

describe('S1e round 2 review: the drawing of a line reads as the line', () => {
  it('draws a rational term as a term: x^2 - 1/2 is not (x^2 - 1)/2', () => {
    expect(ineqDrawnTex('x^2-1/2>0')).toBe('x^2-\\frac{1}{2} > 0')
    expect(ineqDrawnTex('x^2 - 1/2 > 0')).toBe('x^2 - \\frac{1}{2} > 0')
  })

  it('draws the closed relations as \\le and \\ge, and a fraction side as \\frac', () => {
    expect(ineqDrawnTex('((x-1)/(x+2))>=0')).toBe('\\frac{x-1}{x+2} \\ge 0')
    expect(ineqDrawnTex('x<=3')).toBe('x \\le 3')
    expect(ineqDrawnTex('x^(2)-4<=0')).toBe('x^{2}-4 \\le 0')
  })
})

describe('S1e round 3 review: a deeply bracketed line is refused with a sentence, never thrown', () => {
  it('refuses 6000 nested bracket pairs and a < without overflowing the stack', () => {
    const deep = '('.repeat(6000) + 'x' + ')'.repeat(6000) + '<1'
    expect(() => usePure.getState().runLatex(deep, 'auto', { quiet: true })).not.toThrow()
    const w = usePure.getState().working
    expect(typeof w?.error).toBe('string')
    expect(w?.error).not.toMatch(/call stack/i)
    expect(usePure.getState().job).not.toBe('solve')
  })

  it('reads no line past the router limits (400 characters, 60 open brackets) as an inequality', () => {
    expect(readInequality('('.repeat(61) + 'x' + ')'.repeat(61) + '<1')).toBeNull()
    expect(readInequality('x' + '+x'.repeat(200) + '<1')).toBeNull()
    expect(readInequality('(x+1)<2')).not.toBeNull()
  })
})

describe('S1e round 3 review: the card keeps the inequality symbols, and Guess-first reads an inequality only as shown', () => {
  /** The Calculator's "=" card for a linear line, built the way the screen builds it. */
  const cardFor = (linear: string) => {
    const card = evaluateInput('COMP', linear, { vars: {}, ans: 0, angle: 'deg' })
    expect(card, `no card for ${linear}`).not.toBeNull()
    return card as NonNullable<typeof card>
  }

  it('keeps the relation and the infinite end in the card main', () => {
    usePure.getState().runLatex('-2x+1\\geq 5', 'auto', { quiet: true })
    const w = usePure.getState().working
    expect(w?.checked).toBe('ok')
    const r = reconcile(cardFor('-2x+1>=5'), w)
    expect(r.result.main).toBe('x ≤ -2, (-∞, -2]')
  })

  it('keeps ∪, ∞ and ∅ in the card main, and no LaTeX is left in it', () => {
    usePure.getState().runLatex('x^2>0', 'auto', { quiet: true })
    const wide = usePure.getState().working
    expect(wide?.checked).toBe('ok')
    const wideMain = reconcile(cardFor('x^2>0'), wide).result.main
    expect(wideMain).toContain('∪')
    expect(wideMain).toContain('∞')
    expect(wideMain).not.toMatch(/\\/)

    usePure.getState().runLatex('x^2<0', 'auto', { quiet: true })
    const empty = usePure.getState().working
    expect(empty?.checked).toBe('ok')
    expect(reconcile(cardFor('x^2<0'), empty).result.main).toContain('∅')

    usePure.getState().runLatex('x^2\\leq 0', 'auto', { quiet: true })
    const zero = usePure.getState().working
    expect(zero?.checked).toBe('ok')
    const zeroMain = reconcile(cardFor('x^2<=0'), zero).result.main
    expect(zeroMain).toContain('{0}')
    expect(zeroMain).not.toMatch(/\\/)
  })

  it('refuses a Guess-first answer to an inequality as unreadable, unless it is typed exactly as shown', () => {
    usePure.getState().runLatex('-2x+1\\geq 5', 'auto', { quiet: true })
    const shown = reconcile(cardFor('-2x+1>=5'), usePure.getState().working).result
    expect(checkCalculatorGuess('x ≤ -2, (-∞, -2]', shown).verdict).toBe('right')
    for (const guess of ['x<=-2', 'x \\le -2', 'x = -2', '-2', '0', '(-∞,-2]']) {
      expect(checkCalculatorGuess(guess, shown).verdict, guess).toBe('unreadable')
    }
  })
})

describe('S1e review round 4: a fraction inside a sum or product is never read as a polynomial', () => {
  // The bottom of each fraction is a letter, and x = 0 is where it is undefined, so x = 0 is never a solution. The
  // parser cancels x²/x to x without a word, so these lines must be declined rather than given a checked answer.
  const DECLINED = [
    '2+\\frac{x^2}{x}\\ge 2',
    'x+\\frac{x^2}{x}\\ge 0',
    '\\frac{x^2}{x}\\cdot 2<4',
    '\\frac{x^2}{x^2}+x>0',
    '(x+1)\\frac{x}{x}>0'
  ]

  it.each(DECLINED)('gives no checked answer for %s', (latex) => {
    usePure.getState().runLatex(latex, 'auto', { quiet: true })
    const w = usePure.getState().working
    expect(w?.checked === 'ok' && (w.answers ?? []).length > 0, latex).toBe(false)
  })

  it('reads none of them as an inequality, and the second check accepts no set for them', () => {
    const anySet = [{ lo: null, loClosed: false, hi: null, hiClosed: false }]
    for (const latex of DECLINED) {
      const text = latexToMath(latex)
      expect(readInequality(text), latex).toBeNull()
      expect(agreesWithTypedSides(text, anySet), latex).toBe(false)
    }
  })

  it('still reads a division by a number inside a sum, and a letter bottom at the top of a side', () => {
    workedLine('\\frac{x}{2}+1<3')
    expect(answerTexts()).toEqual(['x < 4', '(-\\infty, 4)'])
    expect(readInequality('x^2/x>0')).not.toBeNull()
  })
})

describe('S1e review round 4: the squared terms leave both sides first', () => {
  it('shows x² off both sides before the line is solved as a linear one', () => {
    const w = workedLine('x^2-5x+6>x^2-1')
    expect(answerTexts()).toEqual(['x < \\frac{7}{5}', '(-\\infty, \\frac{7}{5})'])
    expect(w.moves[0].head).toBe('Subtract x² from both sides')
    // The router's working holds each state as text: no state after the first move may still hold a power of x.
    const moves = routed('x^2-5x+6>x^2-1').steps.filter((s) => s.kind === 'IneqMove')
    expect(moves).toHaveLength(3)
    for (const s of moves) expect(s.after).not.toContain('^')
  })

  it('gives the same answers as before for other lines with x² on both sides', () => {
    workedLine('x^2+3x<x^2+6')
    expect(answerTexts()).toEqual(['x < 2', '(-\\infty, 2)'])
    workedLine('x^2-4x>x^2+8')
    expect(answerTexts()).toEqual(['x < -2', '(-\\infty, -2)'])
  })

  it('checks 60 generated lines with x² on both sides: valid, and the same set as sampling at quarter points', () => {
    const rnd = generator(20261020)
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]
    const range = (lo: number, hi: number): number[] => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
    for (let i = 0; i < 60; i++) {
      const k2 = pick([1, -1, 2, -2])
      const a = pick(range(-5, 5).filter((n) => n !== 0))
      const b = pick(range(-9, 9))
      const c = pick(range(-9, 9))
      const op = pick(OPS)
      const input = `${polyText(k2, a, b)}${op}${polyText(k2, 0, c)}`
      const w = routed(input)
      expect(w.noWorking, input).toBeFalsy()
      expect(validateWorking(w).valid, input).toBe(true)
      expect(w.checked, input).toBe('ok')
      const set = intervalsOfLast(w)
      // The difference of the two sides is a x + (b − c); four times it at x = k/4 is a k + 4(b − c), with the same sign.
      for (let k = -80; k <= 80; k++) {
        const truth = relHolds(a * k + 4 * (b - c), op)
        expect(inSet(k / 4, set), `${input} at x=${k / 4}`).toBe(truth)
      }
    }
  })
})

describe('S1e review round 4: the second check holds on every part, not only at the claimed ends', () => {
  const part = (lo: number | null, loClosed: boolean, hi: number | null, hiClosed: boolean): IneqPart => ({
    lo: lo === null ? null : rat(BigInt(lo)),
    loClosed,
    hi: hi === null ? null : rat(BigInt(hi)),
    hiClosed
  })

  it('rejects a set that merges two parts across a root', () => {
    expect(agreesWithTypedSides('x^2-5x+6>0', [part(null, false, null, false)])).toBe(false)
  })

  it('accepts the correct two parts of a quadratic, and rejects one that adds a part the typed sides leave out', () => {
    expect(agreesWithTypedSides('x^2-5x+6<0', [part(2, false, 3, false)])).toBe(true)
    expect(agreesWithTypedSides('x^2-5x+6<0', [part(2, false, 3, false), part(4, false, 5, false)])).toBe(false)
  })
})

describe('S1e review round 4: Auto keeps the normal-table and numeric lines their own wording', () => {
  it('keeps the Standard normal table for P(Z <= 1.96) and P(1.5 > Z)', () => {
    for (const line of ['P(Z<=1.96)', 'P(1.5>Z)']) {
      usePure.getState().runLatex(line, 'auto', { quiet: true })
      expect(usePure.getState().job, line).toBe('normal')
      expect(usePure.getState().working?.error, line).toBeUndefined()
    }
  })

  it('says a plain numeric comparison is just a number, not an inequality it cannot handle', () => {
    for (const line of ['3>2', '1<2']) {
      usePure.getState().runLatex(line, 'auto', { quiet: true })
      expect(usePure.getState().working?.error, line).toMatch(/^That is just a number/)
    }
  })
})

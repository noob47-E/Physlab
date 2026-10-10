// The fixed 10⁻¹² floors that stay, and why (CLEANUP-PLAN.md CW3b). math/noise.ts judges rounding
// noise against the sizes a number was worked out from; a line pinned here either means something
// else by 10⁻¹² — the number writer's own display floor, a width on a fixed window, a time in
// seconds, the digits a sentence can add — or is already relative, and its number (10⁻¹² against
// isNoise's 10⁻¹⁵) is CW9's to choose (P-CW2-REPORT, class 1). Each test holds a line's behaviour
// on both sides of its floor, so a later move shows at once what it would change.
//
// The it.fails at the end are floors that give a wrong answer today. They wait for the owner
// (polish\pro-account\OWNER-APPROVALS.md, CW3b-1 … CW3b-4) and are not applied.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async (op: string) => ({ latex: `\\text{${op}}`, text: `${op}(x)`, numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {}, subscribe: () => () => {} },
  CAS_OPS: []
}))
vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { evaluateComp, polyInequality, polyRoots, tidyComplex, type CalcContext } from '../src/renderer/src/calc/engine'
import { polynomialRootRows } from '../src/renderer/src/calc/roots'
import { scene, type LogEntry } from '../src/renderer/src/core/store'
import { solutionsInX } from '../src/renderer/src/core/visualize'
import { runCommand } from '../src/renderer/src/lang/commands'
import { compileScalar } from '../src/renderer/src/math/expr'
import type { MeasureSettings } from '../src/renderer/src/math/format'
import { isNoise } from '../src/renderer/src/math/noise'
import { complexWorking } from '../src/renderer/src/math/pure/complex'
import { trigWorking } from '../src/renderer/src/math/pure/trigIdentity'
import { cardLineTex, evaluateVectorLine, exprSolution, ijkLatex } from '../src/renderer/src/panels/vectorCalcStore'
import { inferVisual, solveSuvat } from '../src/renderer/src/questions/autoVisual'
import { playQuestion, showVisual, visualPlanFor, visualState } from '../src/renderer/src/questions/player'
import type { PQQuestion } from '../src/renderer/src/questions/pqjson'
import type { V3 } from '../src/renderer/src/math/vec'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  scene().newScene()
})

const CALC: CalcContext = { vars: {}, ans: 0, angle: 'deg' }
const SETTINGS: MeasureSettings = { decimals: 4, precisionMode: 'dp', unit: 'm', unitPerSquare: 1, angleUnit: 'deg' }

/** What the bar prints for a line, as the student reads it. */
async function bar(line: string): Promise<LogEntry> {
  scene().clearLog()
  await runCommand(line)
  return scene().log.at(-1) ?? ({ id: 0, input: '', kind: 'info' } as LogEntry)
}

/** solutionsInX as the bar calls it: (lhs) − (rhs), with the two sides. */
function solve(eq: string): ReturnType<typeof solutionsInX> {
  const at = eq.indexOf('=')
  const sides: [string, string] = [eq.slice(0, at), eq.slice(at + 1)]
  return solutionsInX(`(${sides[0]}) - (${sides[1]})`, sides, {})
}

/** A one-part question with whatever the test names; the licence and ids are filler. */
function question(over: Partial<PQQuestion> = {}): PQQuestion {
  return {
    id: 'q',
    title: 'A question',
    statement: 'Answer it.',
    variables: [],
    parts: [{ type: 'number', prompt: 'How much?', answer: '1', unit: 'none', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }],
    license: { id: 'CC BY 4.0', holder: 'PhysLab', source: 'PhysLab' },
    ...over
  }
}

const NO_VALUES = { seed: 0, values: {}, problems: [] }

describe('calc/engine.ts tidyComplex: a part under 10⁻¹² of the number’s own size is 0', () => {
  it('drops the polar key’s round-off, even where it is above isNoise’s 10⁻¹⁵ (2∠3690°), and keeps a tiny number on its own', () => {
    // 2∠90°: cos 90° × 2 leaves 1.2×10⁻¹⁶.
    expect(tidyComplex({ re: 1.2246467991473532e-16, im: 2 })).toEqual({ re: 0, im: 2 })
    // 2∠3690° (ten turns more) leaves 6.4×10⁻¹⁵ of the size: noise to this rule, a number to isNoise.
    const turned = { re: -1.2742516517498357e-14, im: 2 }
    expect(tidyComplex(turned)).toEqual({ re: 0, im: 2 })
    expect(isNoise(turned.re, turned.im)).toBe(false)
    expect(tidyComplex({ re: 1e-13, im: 1 })).toEqual({ re: 0, im: 1 })
    expect(tidyComplex({ re: 2e-12, im: 1 })).toEqual({ re: 2e-12, im: 1 })
    expect(tidyComplex({ re: 1.6e-19, im: 0 })).toEqual({ re: 1.6e-19, im: 0 })
  })

  it('the Calculator writes e^(iπ) as −1 and 10⁻¹³ + i as i', () => {
    expect(evaluateComp('e^(i*pi)', CALC).text).toBe('−1')
    expect(evaluateComp('(1e-13 + i)', CALC).text).toBe('i')
  })
})

describe('core/visualize.ts', () => {
  it('a curve that only touches zero is found at any scale (touchesAt: |F| at the bottom against 10⁻¹² of |F| around it)', async () => {
    expect((await bar('(x - y)^2 = 0')).text).toContain('only touches 0 without crossing it')
    expect((await bar('1e-20 (x - y)^2 = 0')).text).toContain('only touch without crossing')
  })

  it('two solutions of a quadratic closer than 10⁻¹² of their size are taken as one today (H26; parked, CW3b-6), 10⁻¹⁰ apart are two', () => {
    expect(solve('(x - 1)(x - 1.0000000000001) = 0')).toEqual({ kind: 'real', xs: [1] })
    expect(solve('(x - 1)(x - 1.0000000001) = 0')).toEqual({ kind: 'real', xs: [1, 1.0000000001] })
  })

  it('two sides that agree to 10⁻¹² of their size at every x tried are equal for every x (agreeAt)', () => {
    expect(solve('tan(x) cos(x) = sin(x)')).toEqual({ kind: 'every' })
    expect(solve('sin(x)^2 + cos(x)^2 = 1')).toEqual({ kind: 'every' })
    expect(solve('sin(x)^2 + cos(x)^2 = 1.0000000001')).not.toEqual({ kind: 'every' })
  })

  it('agreeAt is relative: the same identity holds at 10²⁰ (round-off near 10⁴) and a 10⁻⁴ gap at 10⁻²⁰ is still a gap', () => {
    // An absolute 10⁻¹² would call the first "not equal" and the second "equal for every x".
    expect(solve('1e20 sin(x)^2 + 1e20 cos(x)^2 = 1e20')).toEqual({ kind: 'every' })
    expect(solve('1e-20 sin(x)^2 + 1e-20 cos(x)^2 = 1.0001e-20')).not.toEqual({ kind: 'every' })
  })
})

describe('lang/commands.ts: a z the bar does not write (the writer’s 10⁻¹² floor) is no third dimension', () => {
  it('the example in a refusal keeps the student’s number of coordinates (isThreeD)', async () => {
    expect((await bar('x = (1, 2) + (0, 0, 1e-13)')).text).toContain('e.g. P = (1, 2).')
    expect((await bar('x = (1, 2) + (0, 0, 1e-11)')).text).toContain('e.g. P = (1, 2, 3).')
  })

  it('a vector gets its angle θ only while it has no z the line writes (vectorExtras)', async () => {
    expect((await bar('A = <3, 4, 1e-13>')).tex).toBe('A = 3\\hat{i} + 4\\hat{j},\\quad \\text{magnitude } 5,\\ \\theta = 53.13^\\circ')
    expect((await bar('A = <3, 4, 1e-11>')).tex).toBe('A = 3\\hat{i} + 4\\hat{j} + 1\\times 10^{-11}\\hat{k},\\quad \\text{magnitude } 5')
  })
})

describe('math/expr.ts sinc', () => {
  const sinc = compileScalar('sinc(x)', ['x'], () => ({})) as unknown as (v: Record<string, number>) => number

  it('is 1 at 0 and sin x / x elsewhere, NaN for NaN', () => {
    expect(sinc({ x: 0 })).toBe(1)
    expect(sinc({ x: -0 })).toBe(1)
    expect(sinc({ x: 1e-13 })).toBe(1)
    expect(sinc({ x: 5e-324 })).toBe(1)
    expect(sinc({ x: 1e-6 })).toBe(Math.sin(1e-6) / 1e-6)
    expect(sinc({ x: 1 })).toBe(Math.sin(1))
    expect(sinc({ x: NaN })).toBeNaN()
  })

  it('needs no floor but 0 itself: sin x is x to the last bit below 10⁻⁸, so sin x / x is exactly 1 under 10⁻¹²', () => {
    for (let i = 1; i <= 100000; i++) {
      const x = (i / 100000) * 1e-12
      expect(Math.sin(x) / x).toBe(1)
      expect(Math.sin(-x) / -x).toBe(1)
    }
    for (let e = -1074; e <= -40; e++) expect(Math.sin(2 ** e) / 2 ** e).toBe(1)
  })
})

describe('math/pure/complex.ts: a decimal answer is tidied as the Calculator tidies it', () => {
  it('e^(iπ) is −1, e^(iπ/2) is i, and a tiny answer on its own keeps its size', () => {
    expect(complexWorking('e^(i*pi)').answers).toEqual([{ label: 'Answer', tex: '\\approx -1' }])
    expect(complexWorking('e^(i*pi/2)').answers).toEqual([{ label: 'Answer', tex: '\\approx i' }])
    expect(complexWorking('3*e^(i*pi/2)').answers).toEqual([{ label: 'Answer', tex: '\\approx 3i' }])
    expect(complexWorking('1.6*10^(-19)*e^(i*pi)').answers).toEqual([{ label: 'Answer', tex: '\\approx -1.6\\times 10^{-19}' }])
  })
})

describe('math/pure/trigIdentity.ts: coefficients are tidied to 12 figures', () => {
  it('0.1 + 0.2 is 0.3 in a coefficient, so collecting like terms proves the identity', () => {
    expect(trigWorking('sin x + 0.1 sin x + 0.2 sin x = 1.3 sin x').answers?.[0].label).toBe('Proved')
  })
})

describe('panels/vectorCalcStore.ts', () => {
  it('a vector read off the drawing drops a drag’s noise under 10⁻¹² of a grid square; a held one only under 10⁻¹² of its own size (ijkLatex)', () => {
    expect(ijkLatex([2.875000000000001, 1e-13, 0])).toBe('2.875\\hat{i}')
    expect(ijkLatex([2.875000000000001, 1e-13, 0], true)).toBe('2.875\\hat{i}')
    expect(ijkLatex([1.6e-19, 0, 0])).toBe('0')
    expect(ijkLatex([1.6e-19, 0, 0], true)).toBe('1.6\\times 10^{-19}\\hat{i}')
    expect(ijkLatex([3, 4, 2e-12])).toBe('3\\hat{i}+4\\hat{j}')
  })

  it('a vector under the writer’s 10⁻¹² floor is written in scientific form, one at or over it by texIJK (texCardVector, cardLineTex)', () => {
    const s = scene().settings
    const line = (v: V3): string => cardLineTex('A', v, 'number', s)
    expect(line([1e-12, 0, 0])).toBe('\\vec{A} = {1\\times 10^{-12}\\hat{i}}\\quad |A| = {1\\times 10^{-12}}\\quad \\theta = 0^\\circ')
    expect(line([9.99e-13, 0, 0])).toBe('\\vec{A} = {9.99\\times 10^{-13}\\hat{i}}\\quad |A| = {9.99\\times 10^{-13}}\\quad \\theta = 0^\\circ')
    expect(line([1.6e-19, 1.2e-19, 0])).toBe('\\vec{A} = {\\left(1.6\\hat{i} + 1.2\\hat{j}\\right)\\times 10^{-19}}\\quad |A| = {2\\times 10^{-19}}\\quad \\theta = 36.87^\\circ')
    // A component under 10⁻¹² of the vector's own size is noise beside it: 5∠90° holds 3.06×10⁻¹⁶ in x.
    expect(line([5, 3.06e-16, 0])).toBe('\\vec{A} = 5\\hat{i}\\quad |A| = 5\\quad \\theta = 0^\\circ')
  })

  it('a typed line loses the noise of its own arithmetic, and a tiny result is written as itself (withoutNoise, exprSolution)', () => {
    const s = scene().settings
    expect(evaluateVectorLine('5\\angle30^{\\circ}+5\\angle210^{\\circ}', { i: [1, 0, 0], j: [0, 1, 0], k: [0, 0, 1] }).out).toEqual([0, 0, 0])
    expect(evaluateVectorLine('1.6\\times10^{-19}\\hat{i}', { i: [1, 0, 0], j: [0, 1, 0], k: [0, 0, 1] }).out).toEqual([1.6e-19, 0, 0])
    const cards = [{ name: 'A', v: [1e-10, 0, 0] as V3 }, { name: 'B', v: [1.6e-9, 0, 0] as V3 }]
    expect(exprSolution('A\\cdot B', cards, s).sol.answers).toEqual([{ label: 'value', tex: '1.6\\times 10^{-19}' }])
    expect(exprSolution('5\\angle30^{\\circ}+5\\angle210^{\\circ}', cards, s).sol.answers[0]).toEqual({ label: 'R', tex: '\\vec{0}' })
  })
})

describe('questions/autoVisual.ts: motion is drawn in seconds and m/s²', () => {
  it('a stretch of 10⁻¹² s or less is no motion to draw', () => {
    expect(solveSuvat({ u: 0, a: 2, t: 1e-12 } as never)).toBeNull()
    expect(solveSuvat({ u: 0, a: 2, t: 1.1e-12 } as never)).not.toBeNull()
  })

  it('an acceleration under 10⁻¹² m/s² is steady speed: the time is s/u, not the quadratic formula (firstTime)', () => {
    expect(solveSuvat({ u: 2, a: 1e-13, s: 20 } as never)!.t).toBe(10)
    expect(solveSuvat({ u: 2, a: 1e-11, s: 20 } as never)!.t).toBeCloseTo(10, 5)
  })

  it('the picture is a steady stretch under 10⁻¹² m/s² and an accelerating one at it (motionVisual)', () => {
    const at = (a: string) => inferVisual(question({ statement: `A car moving at 10 m/s accelerates at ${a} m/s² for 5 s.` }), NO_VALUES)!.visual.motion!.segments
    expect(at('0.000000000001')).toEqual([{ kind: 'accelerate', duration: '5', a: '1e-12' }])
    expect(at('0.0000000000001')).toEqual([{ kind: 'uniform', duration: '5', v: '10' }])
  })

  it('a turn on the −10…10 window is found to 10⁻¹² by the golden-section search, so the mark at x = 1/3 holds the answer (extremum)', () => {
    const q = question({ statement: '$$ y = 3x^{2} - 2x $$', parts: [{ type: 'number', prompt: 'Find the x-coordinate of the turning point.', answer: '1/3', unit: 'none', tolerance: { kind: 'absolute', value: 1e-4 }, marks: 1 }] })
    const auto = inferVisual(q, NO_VALUES)!
    expect(auto.rule).toBe('function')
    expect(auto.revealsAnswer).toBe(true)
  })

  it('a picture whose answer is over 10⁻¹² is held back until it is answered (fresh)', () => {
    const plan = visualPlanFor(playQuestion(chargeOnALine('1.1e-12'), 1, SETTINGS))
    expect(visualState(plan, false)).toBe('after-answer')
  })
})

/** A teacher's number line that marks the answer itself, a charge in coulombs. */
function chargeOnALine(value: string): PQQuestion {
  return question({
    statement: 'An electron carries a charge.',
    parts: [{ type: 'number', prompt: 'What is the size of the charge?', answer: value, unit: 'C', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }],
    picture: { kind: 'numberline', items: [{ label: 'the charge', value }] }
  } as Partial<PQQuestion>)
}

describe('[answer may change] floors that give a wrong answer today — waiting for the owner, not applied', () => {
  it.fails('CW3b-1: a polynomial whose roots are all under 10⁻¹² has them, not 0 (x³ − 10⁻³⁹ = 0 has x = 10⁻¹³)', () => {
    // polyRoots writes a real part under an absolute 10⁻¹² as 0 (and an imaginary part under 10⁻⁹).
    const roots = polyRoots([1, 0, 0, -1e-39])
    expect(roots.some((r) => r.im === 0 && Math.abs(r.re / 1e-13 - 1) < 1e-9)).toBe(true)
    expect(polynomialRootRows([1, 0, 0, -1e-39]).map((r) => r.text)).not.toEqual(['0', '0', '0'])
  })

  it.fails('CW3b-2: a polynomial inequality has the same answer at any scale (10⁻¹⁵x² − 10⁻¹⁵ ≤ 0 is −1 ≤ x ≤ 1, not every x)', () => {
    // polyInequality takes |p(x)| ≤ 10⁻¹² at an interval's middle as 0, and all of 10⁻¹⁵x² − 10⁻¹⁵ is that small.
    for (const op of ['<=', '>='] as const) expect(polyInequality([1e-15, 0, -1e-15], op)).toEqual(polyInequality([1, 0, -1], op))
  })

  it.fails('CW3b-3: a trig identity with a coefficient under 10⁻¹², or one 12 figures cannot hold, is not proved', () => {
    // A coefficient under 10⁻¹² is tidied to 0, and 1 + 10⁻¹³ to 1 at 12 figures: both lines below say "Proved".
    expect(trigWorking('10^(-13) sin(x) = 0').answers?.[0].label).not.toBe('Proved')
    expect(trigWorking('sin^2 x + cos^2 x = 1 + 10^(-13)').answers?.[0].label).not.toBe('Proved')
  })

  it.fails('CW3b-3 (second effect): a coefficient the student typed with 13 figures is written as typed in the steps, not cut to 12', () => {
    // clean() keeps 12 figures, and a step writes the tidied coefficient: 0.1234567890123 reads 0.123456789012.
    const w = trigWorking('sin(3x) * 0.1234567890123 = 0.1234567890123 (3 sin(x) - 4 sin(x)^3)')
    expect(JSON.stringify(w)).not.toMatch(/0\.123456789012(?!3)/)
  })

  it.fails('CW3b-4: a picture whose answer is under 10⁻¹² (an electron’s 1.6×10⁻¹⁹ C) is held back until it is answered', () => {
    // fresh() counts a drawn value under 10⁻¹² as the origin, so the number line was ready before the answer.
    const plan = visualPlanFor(playQuestion(chargeOnALine('1.6e-19'), 1, SETTINGS))
    expect(visualState(plan, false)).toBe('after-answer')
  })

  it.fails('CW3b-5: the note under a roots picture writes its numbers as a student reads them, not 0.333333333333', () => {
    // inferRoots builds the curve's formula with lit (12 figures, right for drawing it), and the note prints that formula.
    const played = playQuestion(rootsQuestion(), 1, SETTINGS)
    expect(showVisual(visualPlanFor(played), played, SETTINGS, true)).not.toContain('333333333333')
  })

  it.fails('CW3b-6: two solutions 10⁻¹³ apart are two, since the sentence’s extra digits can tell them apart (1 and 1.0000000000001)', () => {
    // The pair is taken as one when closer than 10⁻¹² of its size; at 2 d.p. the sentence may add 12 digits (MAX_EXTRA_DIGITS).
    const sol = solve('(x - 1)(x - 1.0000000000001) = 0')
    expect(sol?.kind === 'real' ? sol.xs.length : 0).toBe(2)
  })
})

describe('the roots picture: a formula in 12 figures (lit)', () => {
  it('is the curve through the answers, each root to 12 significant figures', () => {
    const auto = inferVisual(rootsQuestion(), NO_VALUES)!
    expect(auto.rule).toBe('roots')
    expect(auto.visual.picture).toEqual({ kind: 'curve', expr: '(x - 0.333333333333) * (x + 2)' })
  })
})

/** A roots question with no maths to draw, so the picture is built from its answers (inferRoots). */
function rootsQuestion(): PQQuestion {
  return question({
    statement: 'A curve crosses the x-axis twice.',
    parts: [{ type: 'roots', prompt: 'Where does it cross?', answer: ['1/3', '-2'], unit: 'none', tolerance: { kind: 'absolute', value: 0.01 }, marks: 2 }]
  } as Partial<PQQuestion>)
}

describe('found in passing (outside this part’s lines): the bar at and under the writer’s 10⁻¹² floor', () => {
  it.fails('A = <3, 4, 1e-12> is either in the plane or not: today its z is written and it still gets a plane angle θ', async () => {
    // The writer drops a z under 10⁻¹² (strictly); vectorExtras and isThreeD count one only over it.
    const tex = (await bar('A = <3, 4, 1e-12>')).tex ?? ''
    expect(tex.includes('\\hat{k}') && tex.includes('\\theta')).toBe(false)
  })

  it.fails('A = <2e-19, 1e-19, 3e-19> is written as itself, with its magnitude and no plane angle', async () => {
    // Today: "A = 0⃗, magnitude 0, θ = 26.57°" — the writer's display floor in describeComputed and
    // texPrecise, and vectorExtras' z test that mirrors it. The Vectors panel writes it in scientific form (H13).
    const tex = (await bar('A = <2e-19, 1e-19, 3e-19>')).tex ?? ''
    expect(tex).not.toContain('\\vec{0}')
    expect(tex).not.toContain('\\theta')
  })
})

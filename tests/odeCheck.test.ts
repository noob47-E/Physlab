// A function answer is checked in its own differential equation, never against the author's
// formula: sin x is right for y″ + y = 0 with y(0) = 0, y′(0) = 1 however it is written, and the
// braking speed v(s) is right both as √(5e^(−2s) − 1) and in its general form. Each part is read
// from a .pqjson file first, so the test marks what a teacher's file would give Practice.

import { beforeEach, describe, expect, it } from 'vitest'
import { resetGlobals } from './helpers/globals'
import { getAngleMode, setAngleMode } from '../src/renderer/src/math/expr'
import type { MeasureSettings } from '../src/renderer/src/math/format'
import { fmtPrecise } from '../src/renderer/src/math/format'
import { checkFunctionPart, NOT_A_SOLUTION, primed, ROUNDING_MESSAGE, type FunctionPart } from '../src/renderer/src/questions/odeCheck'
import { checkNumberPart, evaluateInVariables } from '../src/renderer/src/questions/parts'
import { parsePQFile, serializePQFile, type PQPart, type PQQuestion } from '../src/renderer/src/questions/pqjson'
import { drawVariables } from '../src/renderer/src/questions/variables'

beforeEach(() => resetGlobals())

const S: MeasureSettings = { decimals: 4, precisionMode: 'dp', unit: 'm', unitPerSquare: 1, angleUnit: 'deg' }

/** A question holding these parts, written to .pqjson text and read back. */
function throughFile(q: Omit<PQQuestion, 'license' | 'id' | 'title' | 'statement'>): PQQuestion {
  const full: PQQuestion = { id: 'q', title: 'Q', statement: 'Solve it.', license: { id: 'CC BY 4.0', holder: 'PhysLab' }, ...q }
  return parsePQFile(serializePQFile({ app: 'PhysLab', format: 'pqjson', version: 1, questions: [full] })).questions[0]
}

const fn = (q: PQQuestion, i = 0): FunctionPart => q.parts[i] as FunctionPart

/** y″ + y = 0, y(0) = 0, y′(0) = 1: the answer is sin x. */
const SHM = throughFile({
  variables: [],
  parts: [
    {
      type: 'function',
      prompt: 'Find y(x).',
      x: 'x',
      y: 'y',
      ode: "y'' + y = 0",
      initial: [
        { at: '0', order: 0, value: '0' },
        { at: '0', order: 1, value: '1' }
      ],
      model: 'sin(x)',
      marks: 2
    }
  ]
})

describe('y″ + y = 0 with y(0) = 0 and y′(0) = 1', () => {
  const mark = (text: string) => checkFunctionPart(text, fn(SHM), {})

  it('sin x is right, written any way a student writes it', () => {
    for (const t of ['sin(x)', 'y = sin(x)', 'y(x) = sin(x)', 'cos(x - pi/2)', '2 sin(x/2) cos(x/2)']) expect(mark(t), t).toEqual({ verdict: 'right' })
  })

  it('2 sin x solves the equation but starts wrong: y′(0) should be 1', () => {
    expect(mark('2 sin(x)')).toEqual({ verdict: 'wrong', message: 'That solves the equation but does not start where the question says: y′(0) should be 1.' })
  })

  it('sin x + cos x solves the equation but starts wrong: y(0) should be 0', () => {
    expect(mark('sin(x) + cos(x)')).toEqual({ verdict: 'wrong', message: 'That solves the equation but does not start where the question says: y(0) should be 0.' })
  })

  it('cos x misses both starting conditions, and both are named', () => {
    expect(mark('cos(x)').message).toBe('That solves the equation but does not start where the question says: y(0) should be 0 and y′(0) should be 1.')
  })

  it('eˣ does not solve the equation at all', () => {
    expect(mark('e^x')).toEqual({ verdict: 'wrong', message: NOT_A_SOLUTION })
    expect(mark('exp(x)')).toEqual({ verdict: 'wrong', message: NOT_A_SOLUTION })
    // Right at the start (y(0) = 0, y′(0) = 1) is not enough: x itself fails y″ + y = 0.
    expect(mark('x')).toEqual({ verdict: 'wrong', message: NOT_A_SOLUTION })
  })

  it('a constant left in is named, with what to do about it', () => {
    expect(mark('A sin(x)')).toEqual({ verdict: 'wrong', message: 'Your answer still has A in it: use the starting conditions to find its value.' })
    expect(mark('A sin(x) + B cos(x)').message).toBe('Your answer still has A and B in it: use the starting conditions to find their values.')
    expect(mark("y'' + 1").message).toBe('Write y as a formula in x alone, without y or its derivatives in it.')
  })

  it('an empty box is empty and nonsense is unreadable, never "wrong"', () => {
    expect(mark('  ')).toEqual({ verdict: 'empty' })
    expect(mark('sin(x')).toEqual({ verdict: 'unreadable', message: 'I could not read that. Type y as a formula in x, like 2 sin(x).' })
  })

  it('is worked in radians even while the calculator is in degrees, and leaves the mode as it found it', () => {
    setAngleMode('deg')
    expect(mark('sin(x)')).toEqual({ verdict: 'right' })
    expect(getAngleMode()).toBe('deg')
  })

  it('a formula with constants rounded (0.99999 sin x) is ticked with the rounding sentence', () => {
    expect(mark('0.99999 sin(x)')).toEqual({ verdict: 'right', message: ROUNDING_MESSAGE })
  })

  it('a function mathjs cannot differentiate (ln) is differentiated numerically and still marked', () => {
    // y = ln(1 + x) solves (1 + x) y″ + y′ = 0 with y(0) = 0, y′(0) = 1.
    const q = throughFile({ variables: [], parts: [{ ...fn(SHM), ode: "(1 + x) y'' + y' = 0", model: 'ln(1 + x)' }] })
    expect(checkFunctionPart('ln(1 + x)', fn(q), {})).toEqual({ verdict: 'right' })
    expect(checkFunctionPart('2 ln(1 + x)', fn(q), {}).message).toBe('That solves the equation but does not start where the question says: y′(0) should be 1.')
    // log is base 10 here (the calculator's convention): log(1 + x) solves the equation but starts at the wrong slope.
    expect(checkFunctionPart('log(1 + x)', fn(q), {}).message).toBe('That solves the equation but does not start where the question says: y′(0) should be 1.')
  })
})

/**
 * Braking with a speed-dependent force: m v dv/ds = −(F₀ + k v²), v(0) = u. With m = F₀ = k = 1 and
 * u = 2 the speed is v(s) = √(5e^(−2s) − 1), and it stops at s = ½ ln 5 = 0.8047 — so the check
 * runs from 0.1 to 0.7, where the speed is still real.
 */
function braking(k: number): PQQuestion {
  const one = (name: string, x: number) => ({ name, def: { kind: 'list' as const, items: [x] } })
  return throughFile({
    variables: [one('m', 1), one('F0', 1), one('k', k), one('u', 2)],
    parts: [
      {
        type: 'function',
        prompt: 'Find the speed v as a function of the distance s.',
        x: 's',
        y: 'v',
        ode: "m v v' = -(F0 + k v^2)",
        initial: [{ at: '0', order: 0, value: 'u' }],
        model: 'sqrt((u^2 + F0/k) e^(-2 k s/m) - F0/k)',
        sampleRange: [0.1, 0.7],
        marks: 3
      },
      { type: 'number', prompt: 'How far does it go before it stops?', answer: 'm/(2*k) * ln(1 + k*u^2/F0)', unit: 'm', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }
    ]
  })
}

describe('braking with a speed-dependent force (m = F₀ = k = 1, u = 2)', () => {
  const q = braking(1)
  const values = drawVariables(q, 1).values

  it('v(s) = √(5e^(−2s) − 1) is right', () => {
    expect(checkFunctionPart('sqrt(5 e^(-2 s) - 1)', fn(q), values)).toEqual({ verdict: 'right' })
    expect(checkFunctionPart('v(s) = √(5e^(−2s) − 1)', fn(q), values)).toEqual({ verdict: 'right' })
  })

  it('the general form √((u² + F₀/k)e^(−2ks/m) − F₀/k), in the question’s own letters, is right too', () => {
    expect(checkFunctionPart('sqrt((u^2 + F0/k) e^(-2 k s/m) - F0/k)', fn(q), values)).toEqual({ verdict: 'right' })
  })

  it('a speed that does not start at u, or ignores the drag, is wrong with the matching sentence', () => {
    expect(checkFunctionPart('sqrt(4 e^(-2 s) - 1)', fn(q), values).verdict).toBe('wrong')
    expect(checkFunctionPart('sqrt(10 e^(-2 s) - 1)', fn(q), values).message).toBe(
      'That solves the equation but does not start where the question says: v(0) should be 2.'
    )
    expect(checkFunctionPart('2 - s', fn(q), values)).toEqual({ verdict: 'wrong', message: NOT_A_SOLUTION })
  })

  it('a formula with no real value across the range says so instead of "does not solve"', () => {
    expect(checkFunctionPart('sqrt(e^(-2 s) - 5)', fn(q), values).message).toBe(
      'Your formula has no value at most points from s = 0.1 to 0.7, where the answer must hold.'
    )
  })

  it('the stopping distance s = (m/2k) ln(1 + ku²/F₀) is ½ ln 5 = 0.8047, where the model speed reaches 0', () => {
    const stop = evaluateInVariables((q.parts[1] as Extract<PQPart, { type: 'number' }>).answer, values)
    expect(fmtPrecise(stop, S)).toBe('0.8047')
    expect(stop).toBeCloseTo(0.5 * Math.log(5), 12)
    // The model's v² = (u² + F₀/k)e^(−2ks/m) − F₀/k is 0 there: the train has stopped.
    expect(evaluateInVariables('(u^2 + F0/k) e^(-2 k s/m) - F0/k', { ...values, s: stop })).toBeCloseTo(0, 9)
    expect(checkNumberPart('0.8047 m', q.parts[1] as Extract<PQPart, { type: 'number' }>, values, S).verdict).toBe('right')
  })

  it('at k = 10⁻⁶ the drag is gone and the stopping distance is mu²/(2F₀) = 2.0000', () => {
    const weak = braking(1e-6)
    const v = drawVariables(weak, 1).values
    const stop = evaluateInVariables((weak.parts[1] as Extract<PQPart, { type: 'number' }>).answer, v)
    // m u²/(2F₀) = 1 × 2²/(2 × 1) = 2, to the four places the design quotes.
    expect(fmtPrecise(stop, S)).toBe(fmtPrecise(2, S))
    expect(Math.abs(stop - 2)).toBeLessThan(5e-5)
    // Its speed is the constant-force one, √(u² − 2F₀s/m), to within the rounding band.
    const c = checkFunctionPart('sqrt(4 - 2 s)', fn(weak), v)
    expect(c.verdict).toBe('right')
  })
})

describe('the equation as written in a file', () => {
  it('reads y″, y′′ and y\'\' alike', () => {
    expect(primed("y'' + y' = 0")).toBe('y″ + y′ = 0')
    expect(primed('y′′ + y = 0')).toBe('y″ + y = 0')
  })

  it('a variable drawn in degrees enters the equation in radians', () => {
    // y″ + w² y = 0 with w = 1 (stored as the angle 57.2958° = 1 rad): sin(w x) with w in radians is the solution.
    const q = throughFile({
      variables: [{ name: 'w', def: { kind: 'list', items: [180 / Math.PI] }, unit: '°' }],
      parts: [{ ...fn(SHM), ode: "y'' + w^2 y = 0", initial: [{ at: '0', order: 0, value: '0' }] }]
    })
    expect(checkFunctionPart('sin(x)', fn(q), drawVariables(q, 1).values, { w: '°' })).toEqual({ verdict: 'right' })
  })
})

describe('a starting condition is measured against the function where it starts, not where it has grown', () => {
  /** One first- or second-order part in x (or `x`), read back from a file. */
  const part = (ode: string, initial: { at: string; order: 0 | 1; value: string }[], x = 'x'): FunctionPart =>
    fn(throughFile({ variables: [], parts: [{ type: 'function', prompt: 'Find y.', x, y: 'y', ode, initial, model: '0', marks: 1 }] }))

  it('y′ = 5y, y(0) = 1: 1.1 e^(5x) is wrong although e^(5x) reaches 148 across the range', () => {
    const p = part("y' = 5 y", [{ at: '0', order: 0, value: '1' }])
    expect(checkFunctionPart('e^(5x)', p, {})).toEqual({ verdict: 'right' })
    expect(checkFunctionPart('1.1 e^(5x)', p, {})).toEqual({ verdict: 'wrong', message: 'That solves the equation but does not start where the question says: y(0) should be 1.' })
  })

  it('y′ = 10y, y(0) = 1: 10 e^(10x) is wrong', () => {
    const p = part("y' = 10 y", [{ at: '0', order: 0, value: '1' }])
    expect(checkFunctionPart('e^(10x)', p, {})).toEqual({ verdict: 'right' })
    expect(checkFunctionPart('10 e^(10x)', p, {})).toEqual({ verdict: 'wrong', message: 'That solves the equation but does not start where the question says: y(0) should be 1.' })
  })

  it('y″ − 100y = 0, y(0) = 0, y′(0) = 10: sinh(10x) + 5e^(−10x) misses both conditions', () => {
    const p = part("y'' - 100 y = 0", [{ at: '0', order: 0, value: '0' }, { at: '0', order: 1, value: '10' }])
    expect(checkFunctionPart('sinh(10x)', p, {})).toEqual({ verdict: 'right' })
    expect(checkFunctionPart('sinh(10x) + 5 e^(-10x)', p, {}).message).toBe('That solves the equation but does not start where the question says: y(0) should be 0 and y′(0) should be 10.')
  })

  it('decay stays right, and y(0) = 0 still takes floating-point noise (sin x) while refusing 5', () => {
    expect(checkFunctionPart('e^(-10x)', part("y' = -10 y", [{ at: '0', order: 0, value: '1' }]), {})).toEqual({ verdict: 'right' })
    expect(checkFunctionPart('sin(x)', fn(SHM), {})).toEqual({ verdict: 'right' })
    expect(checkFunctionPart('sin(x) + 5', part("y'' + y = 5", [{ at: '0', order: 0, value: '0' }]), {}).message).toBe(
      'That solves the equation but does not start where the question says: y(0) should be 0.'
    )
  })
})

describe('the right function in the wrong letter', () => {
  const inT = fn(throughFile({ variables: [], parts: [{ type: 'function', prompt: 'Find y(t).', x: 't', y: 'y', ode: "y' = y", initial: [{ at: '0', order: 0, value: '1' }], model: 'e^t', marks: 1 }] }))

  it('eˣ for a part in t is told to use t, not to find the value of x', () => {
    expect(checkFunctionPart('e^x', inT, {})).toEqual({ verdict: 'wrong', message: 'Write it in t: your answer uses x.' })
    expect(checkFunctionPart('e^t', inT, {})).toEqual({ verdict: 'right' })
  })

  it('a lone constant that would not solve the equation in t is still a constant to find', () => {
    expect(checkFunctionPart('C', inT, {}).message).toBe('Your answer still has C in it: use the starting condition to find its value.')
  })
})

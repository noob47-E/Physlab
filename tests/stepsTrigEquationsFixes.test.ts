// Part 09-C-TRIG review fixes (round 1). Every case here was a wrong answer shown as checked, a check that proved nothing,
// a restriction silently dropped, or a false warning on a correct working. Each must now be refused, declined, or right.

import { describe, expect, it } from 'vitest'
import { createDefaultStepRouter } from '../src/renderer/src/math/steps/solve'
import { checkEquationOp, defaultCheckAdapter } from '../src/renderer/src/math/steps/check-adapter'
import { validateSolutionSetEq, validateStep, validateWorking } from '../src/renderer/src/math/steps/validate'
import { finishStep } from '../src/renderer/src/math/steps/sentences'
import { reconcile } from '../src/renderer/src/calc/working'
import type { EvalResult } from '../src/renderer/src/calc/evaluateInput'
import type { Working } from '../src/renderer/src/math/pure/work'

type Op = Parameters<typeof checkEquationOp>[2]

describe('09-C-TRIG review: non-polynomial equation moves (check-adapter)', () => {
  const eq = (op: Op, before: string, after: string): string => checkEquationOp(before, after, op, 'x')

  it('a multiplier that is a letter, a function or zero is never a proof', () => {
    expect(eq({ kind: 'divide-both', k: '\\sin(x)' }, '\\sin(x)\\cos(x)=\\sin(x)', '\\cos(x)=1')).not.toBe('valid')
    expect(eq({ kind: 'multiply-both', k: '\\sin(x)' }, '\\cos(x)=1', '\\sin(x)\\cos(x)=\\sin(x)')).not.toBe('valid')
    expect(eq({ kind: 'divide-both', k: '0' }, '0\\sin(x)=0', '\\sin(x)=0')).not.toBe('valid')
    expect(eq({ kind: 'divide-both', k: 'x' }, 'x\\sin(x)=x', '\\sin(x)=1')).not.toBe('valid')
    expect(eq({ kind: 'multiply-both', k: 'x-1' }, '\\sin(x)=\\frac{1}{2}', '\\sin(x)(x-1)=\\frac{x-1}{2}')).not.toBe('valid')
  })

  it('clear-fractions must use the LCD of the written denominators, and already-solved needs a number on the right', () => {
    expect(eq({ kind: 'clear-fractions', k: 'x*2' }, '\\frac{\\sin(x)}{2}=\\frac{1}{4}', '\\sin(x)\\cdot x=\\frac{x}{2}')).not.toBe('valid')
    expect(eq({ kind: 'already-solved' }, 'x=\\sin(x)', 'x=\\sin(x)')).not.toBe('valid')
  })

  it('a real exact multiplier still checks: 2 sin x = 1 divided by 2 is sin x = 1/2', () => {
    expect(eq({ kind: 'divide-both', k: '2' }, '2\\sin(x)=1', '\\sin(x)=\\frac{1}{2}')).toBe('valid')
  })
})

describe('09-C-TRIG review: solution sets and divide-cos (check-adapter, trig steps)', () => {
  it('a solution set with bare numbers is never valid by the display text alone', () => {
    const set = (values: string[], after: string) =>
      validateSolutionSetEq(
        finishStep({
          kind: 'SolutionSetEq',
          before: '\\sin(x) = \\frac{1}{2}',
          after,
          sentence: '',
          data: { variable: 'x', domain: 'real', solutions: values.map((value) => ({ value })) }
        }),
        defaultCheckAdapter
      )
    expect(set(['31'], 'x = 31')).not.toBe('valid')
    expect(set(['30'], 'x = 30')).not.toBe('valid')
    expect(set(['5'], 'x = 5')).not.toBe('valid')
  })

  it('divide-cos is refused when the before holds where cos x is 0 (the step loses that angle)', () => {
    const divide = (before: string, after: string) =>
      validateStep(
        finishStep({ kind: 'EquationEquiv', before, after, op: { kind: 'divide-cos' }, sentence: '', data: { variable: 'x' } }),
        defaultCheckAdapter
      ).verdict
    expect(divide('\\sin(x)\\cos(x)=\\cos(x)', '\\sin(x)=1')).not.toBe('valid')
    expect(divide('2\\sin(x)\\cos(x)=\\cos(x)', '2\\sin(x)=1')).not.toBe('valid')
    expect(divide('\\sin(x)=\\cos(x)', '\\tan(x)=1')).toBe('valid')
  })
})

describe('09-C-TRIG review: a trig working keeps its own function and argument', () => {
  const router = createDefaultStepRouter(defaultCheckAdapter)

  it('a sin back-substitution inside a cos problem is refused, the sin problem stays valid', () => {
    const sinW = router.solve({ job: 'solve', input: '\\sin(x)^2-\\sin(x)=0', variable: 'x' } as const)
    expect(validateWorking(sinW, defaultCheckAdapter).valid).toBe(true)
    const cosInput = '\\cos(x)^2-\\cos(x)=0'
    const bad = { ...sinW, input: cosInput, steps: [{ ...sinW.steps[0], before: cosInput }, ...sinW.steps.slice(1)] }
    const verdict = validateWorking(bad, defaultCheckAdapter)
    expect(verdict.valid).toBe(false)
    expect(verdict.reason).toMatch(/trig function or its argument/)
  })

  it('a back substitution in sin 2x inside a sin x problem is refused', () => {
    const w = router.solve({ job: 'solve', input: '\\sin(x)^2-\\sin(x)=0', variable: 'x' } as const)
    const wrong = { ...w, input: '\\sin(2x)^2-\\sin(2x)=0', steps: [{ ...w.steps[0], before: '\\sin(2x)^2-\\sin(2x)=0' }, ...w.steps.slice(1)] }
    const verdict = validateWorking(wrong, defaultCheckAdapter)
    expect(verdict.valid).toBe(false)
    expect(verdict.reason).toMatch(/trig function or its argument/)
  })
})

describe('09-C-TRIG review: restrictions and joined numbers (trig method)', () => {
  const router = createDefaultStepRouter(defaultCheckAdapter)
  const solveIn = (input: string, angleUnit: 'deg' | 'rad' = 'deg') =>
    router.solve({ job: 'solve', input, variable: 'x', angleUnit } as const)

  it('a restriction this does not read gives no working (it is never dropped)', () => {
    expect(solveIn('sin(x) = 1/2, 0<=x<=360, x>100').noWorking).toBe(true)
    expect(solveIn('sin(x) = 1/2, 0<=x<=90, 150<=x<=180').noWorking).toBe(true)
    expect(solveIn('sin(x) = 1/2, 0 <= \\theta <= 90').noWorking).toBe(true)
    expect(solveIn('sin(x) = 1/2, x > 100').noWorking).toBe(true)
    expect(solveIn('sin(x) = -1/2, 0<=x<=pi', 'rad').noWorking).toBe(true)
    expect(solveIn('sin(x) = -1/2, 0<=x<=\\frac{\\pi}{2}', 'rad').noWorking).toBe(true)
  })

  it('a plain range in whole degrees is still read: sin x = 1/2 in 0 to 90 is 30 only', () => {
    const w = solveIn('sin(x) = 1/2, 0<=x<=90')
    expect(w.noWorking).toBeFalsy()
    const answers = Array.isArray(w.answer) ? w.answer : [w.answer!]
    expect(answers.map((a) => a.value)).toEqual(['30'])
  })

  it('a star between two numbers gives no working (1*2 is not 12)', () => {
    expect(solveIn('1*2*sin(x) = 12').noWorking).toBe(true)
    expect(solveIn('1*2sin(x) = 12').noWorking).toBe(true)
    expect(solveIn('2*sin(x)*3 = 1').noWorking).toBe(true)
  })

  it('a star before a letter or a bracket is still read: 2*sin(x) = 1 gives 30 and 150', () => {
    const w = solveIn('2*sin(x) = 1')
    expect(w.noWorking).toBeFalsy()
    const answers = Array.isArray(w.answer) ? w.answer : [w.answer!]
    expect(answers.map((a) => a.value)).toEqual(['30', '150'])
  })
})

describe('09-C-TRIG review: the calculator card and working (calc/working)', () => {
  const card = (over: Partial<EvalResult>): EvalResult => ({ main: '', src: 'x', ...over })
  const trigWorking = (input: string, tex: string[], checked: 'ok' | 'failed' = 'ok'): Working =>
    ({
      title: 'Solve',
      input,
      moves: [{ head: 'a step' }],
      answers: tex.map((t) => ({ label: 'x', tex: t })),
      checked
    }) as unknown as Working

  it('a quick root a whole period away from a working root is the same root (-30 is 330)', () => {
    const out = reconcile(card({ main: 'x = -30', src: 'sin(x) = -1/2', roots: [-30], solved: true }), trigWorking('\\sin(x) = -\\frac{1}{2}', ['210', '330']))
    expect(out.verdict).toBe('agree')
  })

  it('a quick root -9960 is the same root as 120 in cos x = -1/2, and tan uses its own period (-45 is 135)', () => {
    expect(
      reconcile(card({ main: 'x = -9960', src: 'cos(x) = -1/2', roots: [-9960], solved: true }), trigWorking('\\cos(x) = -\\frac{1}{2}', ['120', '240'])).verdict
    ).toBe('agree')
    expect(reconcile(card({ main: 'x = -45', src: 'tan(x) = -1', roots: [-45], solved: true }), trigWorking('\\tan(x) = -1', ['135', '315'])).verdict).toBe(
      'agree'
    )
  })

  it('a quick root that is no period away from any working root still disagrees', () => {
    const out = reconcile(card({ main: 'x = 45', src: 'sin(x) = -1/2', roots: [45], solved: true }), trigWorking('\\sin(x) = -\\frac{1}{2}', ['210', '330']))
    expect(out.verdict).toBe('differ')
  })

  it('a disagreement shows π in its plain text (7π/6, not 7/6)', () => {
    const out = reconcile(
      card({ main: 'x = 45', src: 'sin(x) = -1/2', roots: [45], solved: true }),
      trigWorking('\\sin(x) = -\\frac{1}{2}', ['\\frac{7\\pi}{6}', '\\frac{11\\pi}{6}'])
    )
    expect(out.verdict).toBe('differ')
    expect(out.result.main).toContain('7π/6')
    expect(out.result.main).toContain('11π/6')
  })
})

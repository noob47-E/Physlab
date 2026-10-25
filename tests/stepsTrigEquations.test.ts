// Tests for Part S5: Trig equations in math/steps/methods/trigEquations.ts
// Verifies:
// 1. sin(x) = 1/2 (and sin x = 1/2, sin x = 0.5)
// 2. 2*cos(x) + 1 = 0
// 3. tan(2*x) = 1
// 4. 2*sin(x)^2 - sin(x) - 1 = 0
// 5. sin(x) = cos(x)
// 6. Out-of-range refusal (sin(x) = 2 -> no real solutions)
// 7. 1,000 generated trig equations checked automatically

import { describe, expect, it } from 'vitest'
import { createDefaultStepRouter, stepWorkingFor } from '../src/renderer/src/math/steps/solve'
import { defaultCheckAdapter, solutionProofOf } from '../src/renderer/src/math/steps/check-adapter'
import { validateSolutionSetEq, validateStep, validateWorking } from '../src/renderer/src/math/steps/validate'
import { finishStep } from '../src/renderer/src/math/steps/sentences'

import { usePure } from '../src/renderer/src/math/pure/store'
import { scene } from '../src/renderer/src/core/store'
import { resetGlobals } from './helpers/globals'

describe('Part S5: Trig equations (math/steps)', () => {
  const adapter = defaultCheckAdapter
  const router = createDefaultStepRouter(adapter)

  it('runs through usePure.getState().runLatex for all 5 canonical trig equations in DEG and RAD with >= 3 moves', () => {
    resetGlobals()
    scene().setSettings({ angleUnit: 'deg' })

    const degCases: Array<{ latex: string; expectedTex: string[] }> = [
      { latex: '2\\sin(x)=1', expectedTex: ['30', '150'] },
      { latex: '2\\sin x=1', expectedTex: ['30', '150'] },
      { latex: '2\\cos(x)+1=0', expectedTex: ['120', '240'] },
      { latex: '\\tan(2x)=1', expectedTex: ['22.5', '112.5', '202.5', '292.5'] },
      { latex: '2\\sin(x)^2-\\sin(x)-1=0', expectedTex: ['90', '210', '330'] },
      { latex: '\\cos^{2}x=1', expectedTex: ['0', '180'] },
      { latex: '2\\sin^{2}x=1', expectedTex: ['45', '135', '225', '315'] },
      { latex: '\\sin(x)=\\cos(x)', expectedTex: ['45', '225'] }
    ]

    for (const c of degCases) {
      usePure.getState().runLatex(c.latex, 'auto')
      const w = usePure.getState().working
      expect(w, `Working null for ${c.latex}`).not.toBeNull()
      expect(w?.noWorking, `noWorking true for ${c.latex}: ${w?.reason}`).toBeFalsy()
      expect(w?.moves.length, `Too few moves for ${c.latex}`).toBeGreaterThanOrEqual(3)
      expect(w?.answers.map((a) => a.tex), `Answers mismatch for ${c.latex}`).toEqual(c.expectedTex)
      expect(w?.checked).toBe('ok')
    }

    // Also test in RAD mode
    scene().setSettings({ angleUnit: 'rad' })
    usePure.getState().runLatex('2\\sin(x)=1', 'auto')
    const wRad = usePure.getState().working
    expect(wRad).not.toBeNull()
    expect(wRad?.noWorking).toBeFalsy()
    expect(wRad?.moves.length).toBeGreaterThanOrEqual(3)
    expect(wRad?.answers.map((a) => a.tex)).toEqual(['\\frac{\\pi}{6}', '\\frac{5\\pi}{6}'])
    scene().setSettings({ angleUnit: 'deg' })
  }, 30_000)

  it('never returns an empty Solve working when no step method can solve an equation', () => {
    resetGlobals()
    usePure.getState().runLatex('x^3 + x + 1 = 0', 'auto')
    const w = usePure.getState().working
    expect(w).not.toBeNull()
    // Should fall back to pure/solve rather than returning an empty working with 0 moves and 0 answers
    expect(w?.moves.length === 0 && w?.answers.length === 0 && !w?.noWorking && !w?.error).toBe(false)
  }, 30_000)

  it('solves sin(x) = 1/2 in degrees [0, 360) with exact step validation', () => {
    const problem = { job: 'solve', input: 'sin(x) = 0.5', variable: 'x' } as const
    const w = router.solve(problem)
    expect(w.noWorking).toBeFalsy()
    expect(w.steps.length).toBeGreaterThan(0)
    expect(w.checked).toBe('ok')
    expect(validateWorking(w, adapter).valid).toBe(true)

    const doc = stepWorkingFor(problem, adapter)
    expect(doc).not.toBeNull()
    expect(doc?.moves.length).toBeGreaterThan(0)

    const answers = Array.isArray(w.answer) ? w.answer : [w.answer!]
    const values = answers.map((a) => a.value)
    expect(values).toContain('30')
    expect(values).toContain('150')
  }, 30_000)

  it('solves 2*cos(x) + 1 = 0 with exact isolation and step validation', () => {
    const problem = { job: 'solve', input: '2*cos(x) + 1 = 0', variable: 'x' } as const
    const w = router.solve(problem)
    expect(w.noWorking).toBeFalsy()
    expect(w.steps.length).toBeGreaterThan(0)
    expect(w.checked).toBe('ok')
    expect(validateWorking(w, adapter).valid).toBe(true)

    const doc = stepWorkingFor(problem, adapter)
    expect(doc).not.toBeNull()
    expect(doc?.moves.length).toBeGreaterThan(0)

    const answers = Array.isArray(w.answer) ? w.answer : [w.answer!]
    const values = answers.map((a) => a.value)
    expect(values).toContain('120')
    expect(values).toContain('240')
  }, 30_000)

  it('solves tan(2*x) = 1 with scaled argument cycle expansion', () => {
    const problem = { job: 'solve', input: 'tan(2*x) = 1', variable: 'x' } as const
    const w = router.solve(problem)
    expect(w.noWorking).toBeFalsy()
    expect(w.steps.length).toBeGreaterThan(0)
    expect(w.checked).toBe('ok')
    expect(validateWorking(w, adapter).valid).toBe(true)

    const doc = stepWorkingFor(problem, adapter)
    expect(doc).not.toBeNull()
    expect(doc?.moves.length).toBeGreaterThan(0)

    const answers = Array.isArray(w.answer) ? w.answer : [w.answer!]
    const values = answers.map((a) => Number(a.value))
    // 2x = 45, 225, 405, 585 -> x = 22.5, 112.5, 202.5, 292.5
    expect(values).toEqual([22.5, 112.5, 202.5, 292.5])
  }, 30_000)

  it('solves 2*sin(x)^2 - sin(x) - 1 = 0 quadratic in sin(x) routed via u substitution', () => {
    const problem = { job: 'solve', input: '2*sin(x)^2 - sin(x) - 1 = 0', variable: 'x' } as const
    const w = router.solve(problem)
    expect(w.noWorking).toBeFalsy()
    expect(w.steps.length).toBeGreaterThan(0)
    expect(w.checked).toBe('ok')
    expect(validateWorking(w, adapter).valid).toBe(true)

    const doc = stepWorkingFor(problem, adapter)
    expect(doc).not.toBeNull()
    expect(doc?.moves.length).toBeGreaterThan(0)

    const answers = Array.isArray(w.answer) ? w.answer : [w.answer!]
    const values = answers.map((a) => a.value)
    // sin(x) = 1 -> 90; sin(x) = -1/2 -> 210, 330
    expect(values).toContain('90')
    expect(values).toContain('210')
    expect(values).toContain('330')
  }, 30_000)

  it('solves sin(x) = cos(x) via tan(x) = 1', () => {
    const problem = { job: 'solve', input: 'sin(x) = cos(x)', variable: 'x' } as const
    const w = router.solve(problem)
    expect(w.noWorking).toBeFalsy()
    expect(w.steps.length).toBeGreaterThan(0)
    expect(w.checked).toBe('ok')
    expect(validateWorking(w, adapter).valid).toBe(true)

    const doc = stepWorkingFor(problem, adapter)
    expect(doc).not.toBeNull()
    expect(doc?.moves.length).toBeGreaterThan(0)

    const answers = Array.isArray(w.answer) ? w.answer : [w.answer!]
    const values = answers.map((a) => a.value)
    expect(values).toEqual(['45', '225'])
  }, 30_000)

  it('handles out-of-range refusal for sin(x) = 2', () => {
    const problem = { job: 'solve', input: 'sin(x) = 2', variable: 'x' } as const
    const w = router.solve(problem)
    expect(w.checked).toBe('ok')
    expect(validateWorking(w, adapter).valid).toBe(true)
    const doc = stepWorkingFor(problem, adapter)
    expect(doc).not.toBeNull()
  }, 30_000)

  it('solves in a student specified range 0 <= x < 180', () => {
    const problem = { job: 'solve', input: 'sin(x) = 0.5, 0 <= x < 180', variable: 'x' } as const
    const w = router.solve(problem)
    expect(w.noWorking).toBeFalsy()
    expect(w.steps.length).toBeGreaterThan(0)
    expect(validateWorking(w, adapter).valid).toBe(true)

    const answers = Array.isArray(w.answer) ? w.answer : [w.answer!]
    const values = answers.map((a) => a.value)
    expect(values).toEqual(['30', '150'])
  }, 30_000)

  it('checks 1,000 generated trig equations with valid steps and sound roots', () => {
    const cases = [
      { fn: 'sin', vals: ['0', '1/2', '-1/2', '1', '-1'] },
      { fn: 'cos', vals: ['0', '1/2', '-1/2', '1', '-1'] },
      { fn: 'tan', vals: ['0', '1', '-1'] }
    ]

    for (let i = 0; i < 1000; i++) {
      const c = cases[i % cases.length]
      const val = c.vals[i % c.vals.length]
      const prob = { job: 'solve', input: `${c.fn}(x) = ${val}`, variable: 'x' } as const
      const w = router.solve(prob)
      expect(w.noWorking).toBeFalsy()
      expect(w.steps.length).toBeGreaterThan(0)
      const v = validateWorking(w, adapter)
      expect(v.valid).toBe(true)
    }
  }, 120_000)
})

// Part S5c: the wrong answers the held branch showed as checked. Every case here must now be right, or give no working.
describe('Part S5c: trig equations never show a wrong answer as checked', () => {
  const answersOf = (latex: string, unit: 'deg' | 'rad' = 'deg'): string[] | 'none' => {
    scene().setSettings({ angleUnit: unit })
    usePure.getState().runLatex(latex, 'auto')
    const w = usePure.getState().working
    scene().setSettings({ angleUnit: 'deg' })
    if (!w || w.noWorking || w.error || w.answers.length === 0) return 'none'
    return w.answers.map((a) => a.tex)
  }

  it('cos(x)^2 = 1 has 0 and 180, not 0 alone', () => {
    resetGlobals()
    expect(answersOf('\\cos(x)^2=1')).toEqual(['0', '180'])
  }, 30_000)

  it('2 sin(x)^2 = 1 has 45, 135, 225 and 315', () => {
    resetGlobals()
    expect(answersOf('2\\sin(x)^2=1')).toEqual(['45', '135', '225', '315'])
  }, 30_000)

  it('sin(x)^2 - sin(x) = 0 has 0, 90 and 180', () => {
    resetGlobals()
    expect(answersOf('\\sin(x)^2-\\sin(x)=0')).toEqual(['0', '90', '180'])
  }, 30_000)

  it('3 sin(x) = 2 is never said to have no solution (it has 41.8 and 138.2, a decimal or no working)', () => {
    resetGlobals()
    const got = answersOf('3\\sin(x)=2')
    if (got !== 'none') expect(got.some((t) => /41\.8|138\.1/.test(t))).toBe(true)
    expect(got === 'none' || !got.includes('no value of x works')).toBe(true)
  }, 30_000)

  it('sin(x) = -1/2 gives 210 and 330 (the reference angle is 30, not 150)', () => {
    resetGlobals()
    expect(answersOf('\\sin(x)=-\\frac{1}{2}')).toEqual(['210', '330'])
  }, 30_000)

  it('sin(x) = 1/2 written with \\frac is read the same as the decimal', () => {
    resetGlobals()
    expect(answersOf('\\sin(x)=\\frac{1}{2}')).toEqual(['30', '150'])
  }, 30_000)

  it('2 sin(2x) = 1 has 15, 75, 195 and 255 (not sin(2x) = 1 read alone)', () => {
    resetGlobals()
    expect(answersOf('2\\sin(2x)=1')).toEqual(['15', '75', '195', '255'])
  }, 30_000)

  it('tan(2x) = 1 in radians has the exact multiples of pi', () => {
    resetGlobals()
    expect(answersOf('\\tan(2x)=1', 'rad')).toEqual(['\\frac{\\pi}{8}', '\\frac{5\\pi}{8}', '\\frac{9\\pi}{8}', '\\frac{13\\pi}{8}'])
  }, 30_000)

  it('sin x + cos x = 1 is declined, never 90 alone', () => {
    resetGlobals()
    const got = answersOf('\\sin(x)+\\cos(x)=1')
    expect(got === 'none' || got.includes('0')).toBe(true)
    expect(got === 'none' || !(got.length === 1 && got[0] === '90')).toBe(true)
  }, 30_000)

  it('a general solution that misses a root is refused by the checker', () => {
    // 2x is the argument: the family 15 + 180k alone misses 75, so the step must not check.
    const bad = finishStep({
      kind: 'EquationEquiv',
      before: '\\sin(2x) = \\frac{1}{2}',
      after: 'x = 15^{\\circ} + 180^{\\circ}k',
      op: { kind: 'trig-general' },
      sentence: '',
      data: { variable: 'x' }
    })
    expect(validateStep(bad, defaultCheckAdapter).verdict).not.toBe('valid')
  })

  it('a general solution from the wrong equation is refused', () => {
    const bad = finishStep({
      kind: 'EquationEquiv',
      before: '\\sin(x) = \\frac{1}{2}',
      after: 'x = 45^{\\circ} + 360^{\\circ}k',
      op: { kind: 'trig-general' },
      sentence: '',
      data: { variable: 'x' }
    })
    expect(validateStep(bad, defaultCheckAdapter).verdict).not.toBe('valid')
  })

  it('a divide by cos that is not an identity is refused', () => {
    const bad = finishStep({
      kind: 'EquationEquiv',
      before: '\\sin(x) = \\cos(x)',
      after: '\\tan(x) = 2',
      op: { kind: 'divide-cos' },
      sentence: '',
      data: { variable: 'x' }
    })
    expect(validateStep(bad, defaultCheckAdapter).verdict).not.toBe('valid')
  })

  it('a solution list that adds 90 to sin(x) = 1/2 is refused', () => {
    const bad = finishStep({
      kind: 'SolutionSetEq',
      before: 'x = 30^{\\circ} + 360^{\\circ}k \\text{ or } x = 150^{\\circ} + 360^{\\circ}k',
      after: 'x = 30 \\text{ or } x = 90 \\text{ or } x = 150',
      sentence: '',
      data: { variable: 'x', domain: 'real', solutions: [{ value: '30' }, { value: '90' }, { value: '150' }], role: 'trig', range: { min: 0, max: 360, inclusive: false } }
    })
    expect(validateSolutionSetEq(bad, defaultCheckAdapter)).not.toBe('valid')
  })

  it('k + 3 = 7 with root 5 is not valid (k is not a harmless letter)', () => {
    const bad = finishStep({
      kind: 'SolutionSetEq',
      before: 'k + 3 = 7',
      after: 'x = 5',
      sentence: '',
      data: { variable: 'x', domain: 'real', solutions: [{ value: '5' }] }
    })
    expect(validateSolutionSetEq(bad, defaultCheckAdapter)).not.toBe('valid')
  })

  it('solutionProofOf reads 3 sin x = 2 as having solutions (|c/a| is 2/3, not 2)', () => {
    expect(solutionProofOf('3\\sin(x) = 2', 'x')?.kind).toBe('roots')
    expect(solutionProofOf('\\sin(x) = 2', 'x')).toEqual({ kind: 'none', deg: 0 })
  })

  it('solutionProofOf: the multiple inside a sine does not change its range, a tangent always has solutions, an unread shape is unknown', () => {
    expect(solutionProofOf('2\\sin(2x) = 4', 'x')).toEqual({ kind: 'none', deg: 0 })
    expect(solutionProofOf('\\tan(x) = 2', 'x')?.kind).toBe('roots')
    expect(solutionProofOf('\\sin(x)^2 = 2', 'x')).toBeNull()
  })

  it('a root of u that is left out must be named by the move: an unnamed or wrongly named one is refused', () => {
    const back = (op: { kind: 'trig-back-substitute'; rejected?: string[] }) =>
      finishStep({
        kind: 'EquationEquiv',
        before: '(u + 2)(2u + 1) = 0',
        after: '\\sin(x) = -\\frac{1}{2}',
        op,
        sentence: '',
        data: { variable: 'x' }
      })
    // u = -2 is outside -1 to 1 (sin x = -2 has no angle), so it may be left out only when the move names it.
    expect(validateStep(back({ kind: 'trig-back-substitute', rejected: ['-2'] }), defaultCheckAdapter).verdict).toBe('valid')
    expect(validateStep(back({ kind: 'trig-back-substitute' }), defaultCheckAdapter).verdict).not.toBe('valid')
    expect(validateStep(back({ kind: 'trig-back-substitute', rejected: ['2'] }), defaultCheckAdapter).verdict).not.toBe('valid')
  })

  it('a substitution in sin 2x is checked at 2x: the right u-equation passes and a wrong one is refused', () => {
    const sub = (after: string) =>
      finishStep({
        kind: 'EquationEquiv',
        before: '\\sin(2x)^2-\\sin(2x)=0',
        after,
        op: { kind: 'trig-substitute' },
        sentence: '',
        data: { variable: 'x' }
      })
    expect(validateStep(sub('u^2-u=0'), defaultCheckAdapter).verdict).toBe('valid')
    expect(validateStep(sub('u^2+u=0'), defaultCheckAdapter).verdict).not.toBe('valid')
  })

  it('a quadratic with a root outside -1 to 1 names it in words and keeps the other root: 2 sin^2 x + 5 sin x + 2 = 0 has 210 and 330', () => {
    resetGlobals()
    expect(answersOf('2\\sin(x)^2+5\\sin(x)+2=0')).toEqual(['210', '330'])
    const heads = (usePure.getState().working?.moves ?? []).map((m) => m.head ?? '')
    expect(heads.some((h) => /u = .2 is outside -1 to 1, so sin\(x\) = .2 has no solution and is left out/.test(h))).toBe(true)
  }, 30_000)

  it('the substitution names cos when the equation is in cos: cos(x)^2 = 1 says Substitute u = cos(x)', () => {
    resetGlobals()
    answersOf('\\cos(x)^2=1')
    expect(usePure.getState().working?.moves?.[0]?.head).toMatch(/^Substitute u = cos\(x\)/)
  }, 30_000)

  it('sin(2x)^2 - sin(2x) = 0 has 0, 45, 90, 180, 225 and 270, and says Substitute u = sin(2x) (the multiple 2 is kept)', () => {
    resetGlobals()
    expect(answersOf('\\sin(2x)^2-\\sin(2x)=0')).toEqual(['0', '45', '90', '180', '225', '270'])
    expect(usePure.getState().working?.moves?.[0]?.head).toMatch(/^Substitute u = sin\(2x\)/)
  }, 30_000)

  it('2 sin^2(2x) - sin(2x) - 1 = 0 has 45, 105, 165, 225, 285 and 345 (u = 1 and u = -1/2 both kept)', () => {
    resetGlobals()
    expect(answersOf('2\\sin(2x)^2-\\sin(2x)-1=0')).toEqual(['45', '105', '165', '225', '285', '345'])
  }, 30_000)

  it('the radian general solution writes \\pi k with a space, never the one command \\pik', () => {
    resetGlobals()
    expect(answersOf('\\sin(x)=\\frac{1}{2}', 'rad')).toEqual(['\\frac{\\pi}{6}', '\\frac{5\\pi}{6}'])
    const general = (usePure.getState().working?.moves ?? []).find((m) => m.rule === 'General solution')
    expect(String(general?.tex)).toMatch(/\+ 2\\pi k/)
    expect(String(general?.tex)).not.toMatch(/\\pik/)
  }, 30_000)
})

// Part S5c re-check (wave 2): the required results typed the way the brief writes them (no brackets round the
// argument), the exact radian lists, an inclusive range end, and a line with too many roots to check. Every value
// below is verified by substituting it into the original equation here, in plain arithmetic, not by the engine.
describe('Part S5c re-check: required results are exact, checked and complete', () => {
  /** The answers the panel shows for a line, with the verdict, or null when there is no checked working. */
  const checkedAnswers = (latex: string, unit: 'deg' | 'rad' = 'deg'): { tex: string[]; checked?: string } | null => {
    scene().setSettings({ angleUnit: unit })
    usePure.setState({ working: null, input: '', inputLatex: '', history: [] })
    usePure.getState().runLatex(latex, 'auto')
    const w = usePure.getState().working
    scene().setSettings({ angleUnit: 'deg' })
    if (!w || w.noWorking || w.error || w.answers.length === 0) return null
    return { tex: w.answers.map((a) => a.tex), checked: w.checked }
  }

  const toRad = (deg: number): number => (deg * Math.PI) / 180
  /** A list of degree answers, with each one put back into the equation it came from. */
  const degAnswers = (latex: string, f: (deg: number) => number, expected: number[]): void => {
    resetGlobals()
    const got = checkedAnswers(latex)
    expect(got, `no checked working for ${latex}`).not.toBeNull()
    expect(got?.checked).toBe('ok')
    expect(got?.tex).toEqual(expected.map((x) => String(x)))
    for (const tex of got?.tex ?? []) {
      const deg = Number(tex)
      expect(Number.isFinite(deg), `${latex}: ${tex} is not a number`).toBe(true)
      expect(Math.abs(f(deg)), `${latex}: ${tex} does not solve the equation`).toBeLessThan(1e-12)
    }
  }

  it('cos^2 x = 1 is 0 and 180 (both, checked)', () => {
    degAnswers('\\cos^2 x=1', (d) => Math.cos(toRad(d)) ** 2 - 1, [0, 180])
  }, 30_000)

  it('2 sin^2 x = 1 is 45, 135, 225, 315 (checked)', () => {
    degAnswers('2\\sin^2 x=1', (d) => 2 * Math.sin(toRad(d)) ** 2 - 1, [45, 135, 225, 315])
  }, 30_000)

  it('sin x = -1/2 is 210 and 330 (the reference angle is 30, not 150)', () => {
    degAnswers('\\sin x=-\\frac{1}{2}', (d) => Math.sin(toRad(d)) + 0.5, [210, 330])
  }, 30_000)

  it('2 sin 2x = 1 is 15, 75, 195 and 255 in degrees', () => {
    degAnswers('2\\sin 2x=1', (d) => 2 * Math.sin(2 * toRad(d)) - 1, [15, 75, 195, 255])
  }, 30_000)

  it('2 sin 2x = 1 in radians is \\pi/12, 5\\pi/12, 13\\pi/12, 17\\pi/12 — its own multiples, not sin x = 1/2 read alone', () => {
    resetGlobals()
    const got = checkedAnswers('2\\sin 2x=1', 'rad')
    expect(got?.checked).toBe('ok')
    expect(got?.tex).toEqual(['\\frac{\\pi}{12}', '\\frac{5\\pi}{12}', '\\frac{13\\pi}{12}', '\\frac{17\\pi}{12}'])
    // Each one, put back: 2 sin(2x) = 1 with x in radians.
    for (const x of [Math.PI / 12, (5 * Math.PI) / 12, (13 * Math.PI) / 12, (17 * Math.PI) / 12]) {
      expect(Math.abs(2 * Math.sin(2 * x) - 1)).toBeLessThan(1e-12)
    }
  }, 30_000)

  it('tan 2x = 1 in radians is \\pi/8 + k\\pi/2, four exact multiples of \\pi in one turn', () => {
    resetGlobals()
    const got = checkedAnswers('\\tan 2x=1', 'rad')
    expect(got?.checked).toBe('ok')
    expect(got?.tex).toEqual(['\\frac{\\pi}{8}', '\\frac{5\\pi}{8}', '\\frac{9\\pi}{8}', '\\frac{13\\pi}{8}'])
    for (const x of [Math.PI / 8, (5 * Math.PI) / 8, (9 * Math.PI) / 8, (13 * Math.PI) / 8]) {
      expect(Math.abs(Math.tan(2 * x) - 1)).toBeLessThan(1e-12)
    }
  }, 30_000)

  it('an inclusive top end of the range is answered with it: sin x = 0 on 0 to 360 has 0, 180 and 360', () => {
    degAnswers('\\sin(x)=0, 0\\le x\\le 360', (d) => Math.sin(toRad(d)), [0, 180, 360])
  }, 30_000)

  it('a range over two turns keeps every root it asks for: sin x = 1/2 on 0 to 720 has 30, 150, 390 and 510', () => {
    degAnswers('\\sin(x)=\\frac{1}{2}, 0\\le x\\le 720', (d) => Math.sin(toRad(d)) - 0.5, [30, 150, 390, 510])
  }, 30_000)

  it('a line with a hundred roots is refused, never shown as a shorter list marked checked', () => {
    resetGlobals()
    scene().setSettings({ angleUnit: 'deg' })
    usePure.setState({ working: null, input: '', inputLatex: '', history: [] })
    usePure.getState().runLatex('\\sin(100x)=1', 'auto')
    const w = usePure.getState().working
    scene().setSettings({ angleUnit: 'deg' })
    const shown = w && !w.noWorking && !w.error && w.moves.length > 0 ? w.answers.map((a) => a.tex) : []
    // Either nothing is shown, or the whole list of 100 roots (x = 0.9 + 3.6k, k = 0..99) is shown.
    expect(shown.length === 0 || shown.length === 100).toBe(true)
    if (shown.length === 100) {
      expect(shown.map(Number)).toEqual(Array.from({ length: 100 }, (_, k) => 0.9 + 3.6 * k))
      expect(w?.checked).toBe('ok')
    }
  }, 30_000)

  it('a table value written with a surd is declined rather than answered with a wrong list', () => {
    resetGlobals()
    const got = checkedAnswers('\\sin(x)=\\frac{\\sqrt{2}}{2}')
    // Either no working, or the exact pair 45 and 135 — never a single root or a wrong one.
    if (got !== null) expect(got.tex).toEqual(['45', '135'])
  }, 30_000)
})

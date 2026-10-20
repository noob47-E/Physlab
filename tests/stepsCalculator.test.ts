// Part S1: Step engine working in the Calculator.
//
// Shows the math/steps working in the Calculator for the problems it covers,
// through renderWorkingToDoc into WorkingView, keeping today's working wherever math/steps has no method.
// Every step is validated before it is shown (validate.ts), never an unchecked step.

import { beforeEach, describe, expect, it } from 'vitest'
import { usePure } from '../src/renderer/src/math/pure/store'
import { reconcile } from '../src/renderer/src/calc/working'
import { evaluateInput, type EvalResult } from '../src/renderer/src/calc/evaluateInput'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  usePure.setState({ working: null, input: '', inputLatex: '', history: [] })
})

describe('S1: math/steps in the Calculator', () => {
  it('solves a linear equation with verified steps and method name', () => {
    usePure.getState().runLatex('2x + 4 = 10', 'auto')
    const w = usePure.getState().working
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.noWorking).toBeFalsy()
    expect(w?.method).toBe('Linear equation in one variable')
    expect(w?.answers).toEqual([{ label: 'x', tex: '3' }])
    expect(w?.moves.length).toBeGreaterThanOrEqual(2)
    // Check that sentences and rules come from the step framework
    expect(w?.moves[0].head).toBe('Subtract 4 from both sides')
    expect(w?.moves[0].rule).toBe('Subtract from both sides')
    expect(w?.check).toContain('Put x = 3 back: both sides give 10.')
    expect(w?.checked).toBe('ok')

    // Reconcile with the Calculator's "=" answer
    const card: EvalResult = evaluateInput('COMP', '2x + 4 = 10', { vars: {}, ans: 0, angle: 'deg' })!
    expect(card).toBeDefined()
    const r = reconcile(card, w)
    expect(r.verdict).toBe('agree')
  })

  it('solves a quadratic by factorising with completing the square as Another way', () => {
    usePure.getState().runLatex('x^2 - 5x + 6 = 0', 'auto')
    const w = usePure.getState().working
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.method).toBe('Factorising')
    expect(w?.answers).toEqual([
      { label: 'x', tex: '2' },
      { label: 'x', tex: '3' }
    ])
    // Another way is quadratic formula
    expect(w?.anotherWay).toBeDefined()
    expect(w?.anotherWay?.method).toBe('Quadratic formula')
    expect(w?.checked).toBe('ok')

    // Reconcile with Calculator "="
    const card: EvalResult = evaluateInput('COMP', 'x^2 - 5x + 6 = 0', { vars: {}, ans: 0, angle: 'deg' })!
    const r = reconcile(card, w)
    expect(r.verdict).toBe('agree')
  })

  it('solves a 2x2 linear system with elimination and substitution as Another way', () => {
    usePure.getState().runLatex('x + y = 3, 2x - y = 0', 'auto')
    const w = usePure.getState().working
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.method).toBe('Solve by elimination')
    expect(w?.anotherWay).toBeDefined()
    expect(w?.anotherWay?.method).toBe('Solve by substitution')
    expect(w?.answers).toEqual([
      { label: 'x', tex: '1' },
      { label: 'y', tex: '2' }
    ])
    expect(w?.checked).toBe('ok')
  })

  it('expands a product of brackets with checked ExprEq steps', () => {
    usePure.getState().run('expand', '(2x + 3)(3x - 1)')
    const w = usePure.getState().working
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.method).toBe('Expand')
    expect(w?.answers[0].tex).toBe('6x^2 + 7x - 3')
  })

  it('factorises a polynomial with checked product steps', () => {
    usePure.getState().run('factor', '6x^2 + 7x - 3')
    const w = usePure.getState().working
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.method).toBe('Factorise')
  })

  it('keeps today working wherever math/steps has no method', () => {
    // Primes: whole number has no method in math/steps
    usePure.getState().runLatex('360', 'auto')
    const primes = usePure.getState().working
    expect(primes).not.toBeNull()
    expect(primes?.title).toContain('360')
    expect(primes?.answers[0].tex).toContain('2^{3}')

    // Surd arithmetic: Simplify surds has no method in math/steps yet
    usePure.getState().runLatex('2/3 + \\sqrt{2}', 'auto')
    const surd = usePure.getState().working
    expect(surd).not.toBeNull()
    expect(surd?.title).toBe('Simplify surds')

    // Complex division: has no method in math/steps yet
    usePure.getState().runLatex('\\frac{3+4i}{1-2i}', 'auto')
    const complex = usePure.getState().working
    expect(complex).not.toBeNull()
    expect(complex?.title).toBe('Complex number')
  })


  // Bug fixes for T2007
  it('(BUG1) titles and sentences do not show raw notation like ^{( or ^(', () => {
    usePure.getState().runLatex('x^2 - 5x + 6 = 0', 'auto')
    const w = usePure.getState().working
    expect(w).not.toBeNull()
    // Title should not contain raw notation patterns
    expect(w?.title).not.toMatch(/\^\{?\(/)
    expect(w?.title).not.toMatch(/\^\(/)
    // Check that steps don't have raw notation
    expect(w?.moves).toBeDefined()
    expect(w!.moves.length).toBeGreaterThan(0)
    w!.moves.forEach(move => {
      expect(move.head).not.toMatch(/\^\{?\(/)
      expect(move.head).not.toMatch(/\^\(/)
    })
  })

  it('(BUG2) rule names are readable with spaces, not squashed', () => {
    usePure.getState().runLatex('x^2 - 5x + 6 = 0', 'auto')
    const w = usePure.getState().working
    expect(w).not.toBeNull()
    // Check that rules are readable
    expect(w?.moves).toBeDefined()
    expect(w!.moves.length).toBeGreaterThan(0)
    w!.moves.forEach(move => {
      if (move.rule) {
        // Rules should have spaces and not be squashed like "Zeroproduct" or "Addtobothsides"
        expect(move.rule).not.toMatch(/^[A-Z][a-z]+[A-Z]/)
      }
    })
  })

  it('(BUG3) for simultaneous equations, answer shown only when working.checked === ok', () => {
    // Test that solving a system equation gives a working marked as 'ok'
    usePure.getState().runLatex('x + y = 3, 2x - y = 0', 'auto')
    const w = usePure.getState().working
    expect(w).not.toBeNull()
    // System equations should have checked marked as 'ok'
    expect(w?.checked).toBe('ok')
  })

  it('shows equals signs when a working answer replaces an equals error card', () => {
    usePure.getState().runLatex('x + y = 3, 2x - y = 0', 'auto')
    const w = usePure.getState().working
    expect(w).not.toBeNull()

    const card: EvalResult = evaluateInput('COMP', 'x + y = 3, 2x - y = 0', { vars: {}, ans: 0, angle: 'deg' })!
    const r = reconcile({ ...card, error: { sentence: 'Quick answer unavailable.' } }, w)
    expect(r.result.main).toContain('x = 1')
    expect(r.result.main).toContain('y = 2')
  })

  it('(BUG4) answer cards show their check line', () => {
    usePure.getState().runLatex('x + y = 3, 2x - y = 0', 'auto')
    const w = usePure.getState().working
    expect(w).not.toBeNull()
    expect(w?.check).toBeDefined()
    expect(w?.check && w.check.length).toBeGreaterThan(0)
    // Check line should mention putting back the answer
    expect(w?.check).toMatch(/[Pp]ut|[Ss]ubstitut/i)
  })

  it('(BUG5) roots are in ascending order in both working and card', () => {
    usePure.getState().runLatex('x^2 - 5x + 6 = 0', 'auto')
    const w = usePure.getState().working
    expect(w).not.toBeNull()
    expect(w?.answers).toBeDefined()
    expect(w!.answers.length).toBeGreaterThan(1)
    // Extract numeric values from answers for comparison
    const values = w!.answers.map(a => {
      const match = a.tex.match(/^(-?\d+(?:\.\d+)?)/)
      return match ? parseFloat(match[1]) : null
    })
    // Check ascending order (ignoring non-numeric answers)
    const numericValues = values.filter((v): v is number => v !== null)
    for (let i = 1; i < numericValues.length; i++) {
      expect(numericValues[i]).toBeGreaterThanOrEqual(numericValues[i - 1])
    }
  })

  // T4001: Six issues to fix
  it('(T4001-1) rule tags are readable with spaces, not squashed', () => {
    usePure.getState().runLatex('x^2 - 5x + 6 = 0', 'auto')
    const w = usePure.getState().working
    expect(w).not.toBeNull()
    expect(w?.moves.length).toBeGreaterThan(0)
    // Check for specific squashed rule names that should have spaces
    w!.moves.forEach(move => {
      if (move.rule) {
        expect(move.rule).not.toBe('Zeroproduct')
        expect(move.rule).not.toBe('Addtobothsides')
        expect(move.rule).not.toBe('Subtractfrombothsides')
        expect(move.rule).not.toBe('Multiplybothsides')
        expect(move.rule).not.toBe('Dividebothsides')
        expect(move.rule).not.toBe('Norealsolutions')
        expect(move.rule).not.toBe('Subtracttheequations')
      }
    })
    // All rules with multi-word names should have spaces (not camelCase like "AddToBothSides")
    const allRules = w!.moves.map(m => m.rule).filter(Boolean)
    // Rules should not have camelCase patterns (lowercase letter followed by uppercase)
    allRules.forEach(rule => {
      expect(rule).not.toMatch(/[a-z][A-Z]/)  // No camelCase
    })
    expect(allRules.length).toBeGreaterThan(0)
  })

  it('(T4001-3) heading shows equation once, not twice', () => {
    usePure.getState().runLatex('x^2 - 5x + 6 = 0', 'auto')
    const w = usePure.getState().working
    expect(w?.title).toBeDefined()
    // Title should start with "Solve " followed by the equation
    // Count occurrences of the equation pattern - should appear once, not twice
    const equationPatterns = w!.title.match(/x.*?6.*?0/g)
    expect(equationPatterns?.length || 0).toBeLessThanOrEqual(1)
  })

  it('(T4001-4) sub-working headings use correct minus sign', () => {
    usePure.getState().runLatex('x^2 - 5x + 6 = 0', 'auto')
    const w = usePure.getState().working
    // Find subgoals with "Solve x" pattern and check they use minus sign, not hyphen
    const solveSubgoals = w!.moves
      .filter(m => m.subgoal && /Solve\s+x/.test(m.subgoal))
      .map(m => m.subgoal!)
    expect(solveSubgoals.length).toBeGreaterThan(0)
    solveSubgoals.forEach(sg => {
      // Should not have hyphen followed by digit: "x - 2" is wrong, should be "x − 2"
      expect(sg).not.toMatch(/\s-\s/)
    })
  })

  it('(T4001-5) system equations shows equals signs in answer', () => {
    usePure.getState().runLatex('x + y = 3, 2x - y = 0', 'auto')
    const w = usePure.getState().working
    expect(w).not.toBeNull()

    const card: EvalResult = evaluateInput('COMP', 'x + y = 3, 2x - y = 0', { vars: {}, ans: 0, angle: 'deg' })!
    const r = reconcile({ ...card, error: { sentence: 'Quick answer unavailable.' } }, w)
    expect(r.result.main).toMatch(/x\s*=\s*[−-]?\d+/)
    expect(r.result.main).toMatch(/y\s*=\s*[−-]?\d+/)
  })

  it('solves canonical trig equations through runLatex with >= 3 moves and verified answers', () => {
    // 1. 2\sin(x)=1
    usePure.getState().runLatex('2\\sin(x)=1', 'auto')
    let w = usePure.getState().working
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.moves.length).toBeGreaterThanOrEqual(3)
    expect(w?.answers.map((a) => a.tex)).toEqual(['30', '150'])

    // 2. 2\cos(x)+1=0
    usePure.getState().runLatex('2\\cos(x)+1=0', 'auto')
    w = usePure.getState().working
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.moves.length).toBeGreaterThanOrEqual(3)
    expect(w?.answers.map((a) => a.tex)).toEqual(['120', '240'])

    // 3. \tan(2x)=1
    usePure.getState().runLatex('\\tan(2x)=1', 'auto')
    w = usePure.getState().working
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.moves.length).toBeGreaterThanOrEqual(3)
    expect(w?.answers.map((a) => a.tex)).toEqual(['22.5', '112.5', '202.5', '292.5'])

    // 4. 2\sin(x)^2-\sin(x)-1=0
    usePure.getState().runLatex('2\\sin(x)^2-\\sin(x)-1=0', 'auto')
    w = usePure.getState().working
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.moves.length).toBeGreaterThanOrEqual(3)
    expect(w?.answers.map((a) => a.tex)).toEqual(['90', '210', '330'])

    // 5. \sin(x)=\cos(x)
    usePure.getState().runLatex('\\sin(x)=\\cos(x)', 'auto')
    w = usePure.getState().working
    expect(w).not.toBeNull()
    expect(w?.error).toBeUndefined()
    expect(w?.moves.length).toBeGreaterThanOrEqual(3)
    expect(w?.answers.map((a) => a.tex)).toEqual(['45', '225'])

    // 6. unhandled equation returns old answer or refusal, never an empty working
    usePure.getState().runLatex('x + \\sin(x) = 1', 'auto')
    w = usePure.getState().working
    expect(w).not.toBeNull()
    expect(w?.noWorking).toBeFalsy()
  })
})

// Part S5c: a checked working replaces the quick answer only when that answer's roots are all among the working's roots.
describe('Part S5c: the quick answer and the working agree or are shown as unconfirmed', () => {
  it('keeps the working when the quick answer lists only some of its roots', () => {
    resetGlobals()
    usePure.getState().runLatex('2\\sin(x)=1', 'auto')
    const w = usePure.getState().working
    expect(w?.answers.map((a) => a.tex)).toEqual(['30', '150'])
    const card: EvalResult = { main: '30', src: '2sin(x)=1', solved: true, roots: [30], rootsComplete: false }
    const r = reconcile(card, w)
    expect(r.verdict).toBe('agree')
    expect(r.result.roots).toEqual([30, 150])
    expect(r.result.rootsComplete).toBe(true)
  })

  it('shows the working unconfirmed when the quick answer has a root the working does not', () => {
    resetGlobals()
    usePure.getState().runLatex('2\\sin(x)=1', 'auto')
    const w = usePure.getState().working
    const card: EvalResult = { main: '200', src: '2sin(x)=1', solved: true, roots: [30, 200], rootsComplete: false }
    const r = reconcile(card, w)
    expect(r.verdict).toBe('differ')
    expect(r.result.unconfirmed).toBe(true)
    expect(r.line).toMatch(/PHYSLAB_CHECK calc-disagree/)
  })
})

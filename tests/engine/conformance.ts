// The conformance suite every algebra-engine adapter passes (CLEANUP-PLAN.md CW15c): known answers
// from standard tables and textbooks, each checked numerically — never as a string, since engines
// write the same answer differently — plus each answer's own check (differentiate an integral back,
// substitute a solution back). A job an adapter does not list is skipped (and must be refused in a
// sentence). Drafted by the crew against math/engine/types.ts; run by tests/engine/*.conformance.test.ts.

import { describe, it, expect, beforeAll } from 'vitest'
import { math, setAngleMode } from '../../src/renderer/src/math/expr'
import type { EngineJob, EngineResult, EngineValue, MathEngine } from '../../src/renderer/src/math/engine/types'

interface ConformanceOptions {
  timeoutMs?: number
  /**
   * Gaps this adapter is known to have, by id, each with its reason. A declared gap must still be
   * there (the case then checks the adapter refuses), so fixing it fails the suite until the
   * declaration goes. Ids: 'infinite-number' (an answer whose number is infinite).
   */
  knownGaps?: Record<string, string>
}

export function engineConformance(name: string, makeEngine: () => Promise<MathEngine>, opts?: ConformanceOptions): void {
  describe(`engine conformance: ${name}`, () => {
    let engine: MathEngine
    const gap = (id: string): boolean => opts?.knownGaps?.[id] !== undefined

    beforeAll(async () => {
      // The answers' plain forms are read with PhysLab's own reader, whose trig follows the angle
      // mode: the checks work in radians (a request's own `deg` says what the engine works in).
      setAngleMode('rad')
      engine = await makeEngine()
    }, opts?.timeoutMs ?? 240000)

    function getComplex(val: unknown): { re: number, im: number } {
      if (typeof val === 'number') return { re: val, im: 0 }
      const c = val as { re?: unknown; im?: unknown } | null
      if (c && typeof c.re === 'number') return { re: c.re, im: typeof c.im === 'number' ? c.im : 0 }
      return { re: NaN, im: NaN }
    }

    function near(a: unknown, b: unknown, tol = 1e-9): boolean {
      const ca = getComplex(a)
      const cb = getComplex(b)
      if (!Number.isFinite(ca.re) && !Number.isFinite(cb.re) && ca.re === cb.re) return true
      const maxAbs = Math.max(1, Math.hypot(ca.re, ca.im), Math.hypot(cb.re, cb.im))
      return Math.hypot(ca.re - cb.re, ca.im - cb.im) <= tol * maxAbs
    }

    function checkValidResult(res: EngineResult) {
      expect(res.error).toBeUndefined()
      expect(typeof res.latex).toBe('string')
      expect(res.latex.length).toBeGreaterThan(0)
      expect(typeof res.text).toBe('string')
    }

    function checkSamples(text: string, expectedText: string, vars: string[] = ['x'], points: number[][] = [[0.1], [0.5], [1.2], [2.5], [3.1]]) {
      for (const pt of points) {
        const scope: Record<string, number> = {}
        vars.forEach((v, i) => scope[v] = pt[i])
        const actual = math.evaluate(text, scope)
        const expected = math.evaluate(expectedText, scope)
        expect(near(actual, expected), `at ${JSON.stringify(scope)}: ${text} != ${expectedText}`).toBe(true)
      }
    }

    function checkDerivative(F_text: string, f_text: string) {
      const points = [0.5, 1.2, 2.5, 3.1]
      for (const x of points) {
        const h = 1e-5 * Math.max(1, Math.abs(x))
        const F_plus = math.evaluate(F_text, { x: x + h })
        const F_minus = math.evaluate(F_text, { x: x - h })
        const numDiff = (F_plus - F_minus) / (2 * h)
        const expected = math.evaluate(f_text, { x })
        expect(near(numDiff, expected, 1e-5), `d/dx ${F_text} != ${f_text} at ${x}`).toBe(true)
      }
    }

    function checkEquation(lhs: string, rhs: string, vars: string[], solutions: Record<string, EngineValue>[]) {
      for (const sol of solutions) {
        const scope: Record<string, unknown> = {}
        for (const v of vars) {
          const num = sol[v].numeric
          if (num) {
            scope[v] = num.im ? math.complex(num.re, num.im) : num.re
          } else {
            scope[v] = math.evaluate(sol[v].text)
          }
        }
        const lVal = getComplex(math.evaluate(lhs, scope))
        const rVal = getComplex(math.evaluate(rhs, scope))
        const maxAbs = Math.max(1, Math.hypot(lVal.re, lVal.im), Math.hypot(rVal.re, rVal.im))
        const diff = Math.hypot(lVal.re - rVal.re, lVal.im - rVal.im)
        expect(diff <= 1e-9 * maxAbs, `${lhs} != ${rhs} for sol ${JSON.stringify(scope)}`).toBe(true)
      }
    }

    describe('exact', () => {
      it('finds exact forms of decimals', async () => {
        if (!engine.jobs.has('exact')) return // Not supported by this adapter
        
        // Known exact forms from standard arithmetic
        const cases = [
          { expr: '0.3333333333333333', expected: '1/3' },
          { expr: '1.4142135623730951', expected: 'sqrt(2)' },
          { expr: '0.5235987755982988', expected: 'pi/6' },
          { expr: '0.25', expected: '1/4' }
        ]
        for (const c of cases) {
          const res = await engine.ask('exact', { expr: c.expr, deg: false })
          checkValidResult(res)
          expect(res.text, `exact ${c.expr}`).not.toContain('.')
          expect(near(math.evaluate(res.text), math.evaluate(c.expected)), `exact ${c.expr}`).toBe(true)
        }
      })
    })

    describe('simplify', () => {
      it('simplifies expressions', async () => {
        if (!engine.jobs.has('simplify')) return
        
        // Standard trigonometric identity
        let res = await engine.ask('simplify', { expr: 'sin(x)^2+cos(x)^2', deg: false })
        checkValidResult(res)
        checkSamples(res.text, '1')
        
        // Rational simplification
        res = await engine.ask('simplify', { expr: '(x^2-1)/(x-1)', deg: false })
        checkValidResult(res)
        expect(res.text, 'simplify (x^2-1)/(x-1)').not.toContain('/')
        checkSamples(res.text, 'x+1')
        
        // Logarithmic identities (PhysLab's spelling: ln is the natural log, log is base 10)
        res = await engine.ask('simplify', { expr: 'ln(e^3)', deg: false })
        checkValidResult(res)
        expect(near(math.evaluate(res.text), 3), 'simplify ln(e^3)').toBe(true)
        res = await engine.ask('simplify', { expr: 'log(1000)', deg: false })
        checkValidResult(res)
        expect(near(math.evaluate(res.text), 3), 'simplify log(1000)').toBe(true)

        // Surd simplification
        res = await engine.ask('simplify', { expr: 'sqrt(50)', deg: false })
        checkValidResult(res)
        expect(near(math.evaluate(res.text), Math.sqrt(50)), 'simplify sqrt(50)').toBe(true)
      })
    })

    describe('expand', () => {
      it('expands expressions', async () => {
        if (!engine.jobs.has('expand')) return
        
        // Binomial expansion
        let res = await engine.ask('expand', { expr: '(x+2)^3', deg: false })
        checkValidResult(res)
        expect(res.text, 'expand (x+2)^3').not.toContain('(')
        checkSamples(res.text, '(x+2)^3')
        
        res = await engine.ask('expand', { expr: '(a+b)^2', deg: false })
        checkValidResult(res)
        expect(res.text, 'expand (a+b)^2').not.toContain('(')
        checkSamples(res.text, '(a+b)^2', ['a', 'b'], [[1, 2], [0.5, 1.5], [2, 3], [3, 4], [4, 5]])

        // Difference of two squares
        res = await engine.ask('expand', { expr: '(x-1)*(x+1)', deg: false })
        checkValidResult(res)
        expect(res.text, 'expand (x-1)*(x+1)').not.toContain('(')
        checkSamples(res.text, 'x^2-1')

        // Distribution
        res = await engine.ask('expand', { expr: 'x*(x+1)', deg: false })
        checkValidResult(res)
        expect(res.text, 'expand x*(x+1)').not.toContain('(')
        checkSamples(res.text, 'x^2+x')
      })
    })

    describe('factor', () => {
      it('factors expressions over rationals', async () => {
        if (!engine.jobs.has('factor')) return
        
        // Standard quadratic
        let res = await engine.ask('factor', { expr: 'x^2-5*x+6', deg: false })
        checkValidResult(res)
        expect(res.text.split('(').length - 1, 'factor x^2-5*x+6').toBeGreaterThanOrEqual(2)
        checkSamples(res.text, 'x^2-5*x+6')
        
        // Difference of two squares (repeated)
        res = await engine.ask('factor', { expr: 'x^4-16', deg: false })
        checkValidResult(res)
        checkSamples(res.text, 'x^4-16')

        // Difference of two cubes
        res = await engine.ask('factor', { expr: 'x^3-1', deg: false })
        checkValidResult(res)
        checkSamples(res.text, 'x^3-1')

        // Multivariate difference of two squares
        res = await engine.ask('factor', { expr: 'x^2-y^2', deg: false })
        checkValidResult(res)
        checkSamples(res.text, 'x^2-y^2', ['x', 'y'], [[1, 2], [0.5, 1.5], [2, 3], [3, 4], [4, 5]])
      })
    })

    describe('factorComplex', () => {
      it('factors expressions over complex numbers', async () => {
        if (!engine.jobs.has('factorComplex')) return
        
        // Sum of squares
        let res = await engine.ask('factorComplex', { expr: 'x^2+4', deg: false })
        checkValidResult(res)
        expect(res.text.toLowerCase(), 'factorComplex x^2+4').toContain('i')
        checkSamples(res.text, 'x^2+4')

        // Difference of fourth powers
        res = await engine.ask('factorComplex', { expr: 'x^4-1', deg: false })
        checkValidResult(res)
        expect(res.text.toLowerCase(), 'factorComplex x^4-1').toContain('i')
        checkSamples(res.text, 'x^4-1')

        // Irreducible over reals
        res = await engine.ask('factorComplex', { expr: 'x^2+2*x+2', deg: false })
        checkValidResult(res)
        expect(res.text.toLowerCase(), 'factorComplex x^2+2*x+2').toContain('i')
        checkSamples(res.text, 'x^2+2*x+2')

        res = await engine.ask('factorComplex', { expr: 'x^3+x', deg: false })
        checkValidResult(res)
        expect(res.text.toLowerCase(), 'factorComplex x^3+x').toContain('i')
        checkSamples(res.text, 'x^3+x')
      })
    })

    describe('apart', () => {
      it('computes partial fractions', async () => {
        if (!engine.jobs.has('apart')) return
        
        // Standard partial fractions from algebra texts
        let res = await engine.ask('apart', { expr: '1/(x^2-1)', deg: false })
        checkValidResult(res)
        expect(res.text.split('/').length - 1, 'apart 1/(x^2-1)').toBeGreaterThanOrEqual(2)
        checkSamples(res.text, '1/(x^2-1)')

        res = await engine.ask('apart', { expr: 'x/(x^2-4)', deg: false })
        checkValidResult(res)
        expect(res.text.split('/').length - 1, 'apart x/(x^2-4)').toBeGreaterThanOrEqual(2)
        checkSamples(res.text, 'x/(x^2-4)')

        res = await engine.ask('apart', { expr: '1/(x^3-x)', deg: false })
        checkValidResult(res)
        expect(res.text.split('/').length - 1, 'apart 1/(x^3-x)').toBeGreaterThanOrEqual(2)
        checkSamples(res.text, '1/(x^3-x)')

        res = await engine.ask('apart', { expr: '(x+1)/(x^2+x-2)', deg: false })
        checkValidResult(res)
        expect(res.text.split('/').length - 1, 'apart (x+1)/(x^2+x-2)').toBeGreaterThanOrEqual(2)
        checkSamples(res.text, '(x+1)/(x^2+x-2)')
      })
    })

    describe('diff', () => {
      it('differentiates expressions', async () => {
        if (!engine.jobs.has('diff')) return
        
        // Power rule
        let res = await engine.ask('diff', { expr: 'x^3', var: 'x', order: 1, deg: false })
        checkValidResult(res)
        checkSamples(res.text, '3*x^2')
        
        // Product rule
        res = await engine.ask('diff', { expr: 'sin(x)*x', var: 'x', order: 1, deg: false })
        checkValidResult(res)
        checkSamples(res.text, 'sin(x) + x*cos(x)')
        
        // Chain rule
        res = await engine.ask('diff', { expr: 'exp(2*x)', var: 'x', order: 1, deg: false })
        checkValidResult(res)
        checkSamples(res.text, '2*exp(2*x)')
        
        // Higher order derivative
        res = await engine.ask('diff', { expr: 'exp(2*x)', var: 'x', order: 2, deg: false })
        checkValidResult(res)
        checkSamples(res.text, '4*exp(2*x)')
        
        // Derivative at a point
        res = await engine.ask('diff', { expr: 'x^2', var: 'x', order: 1, at: '3', deg: false })
        checkValidResult(res)
        expect(res.value?.numeric?.re, 'diff x^2 at 3').toBe(6)
      })
    })

    describe('integrate', () => {
      it('computes indefinite integrals', async () => {
        if (!engine.jobs.has('integrate')) return
        
        // Integration by parts (Stewart, Calculus)
        let res = await engine.ask('integrate', { expr: 'x*exp(x)', var: 'x', deg: false })
        checkValidResult(res)
        checkDerivative(res.text, 'x*exp(x)')
        
        // Standard log integral
        res = await engine.ask('integrate', { expr: '1/x', var: 'x', deg: false })
        checkValidResult(res)
        checkDerivative(res.text, '1/x')
        
        // Trigonometric integral
        res = await engine.ask('integrate', { expr: 'sin(x)^2', var: 'x', deg: false })
        checkValidResult(res)
        checkDerivative(res.text, 'sin(x)^2')
      })
      
      it('computes definite integrals', async () => {
        if (!engine.jobs.has('integrate')) return
        
        // Improper integral
        let res = await engine.ask('integrate', { expr: 'exp(-x)', var: 'x', lower: '0', upper: 'Infinity', deg: false })
        checkValidResult(res)
        expect(near(math.evaluate(res.text), 1), 'integrate exp(-x) 0 to Infinity').toBe(true)
        
        // Improper integral with power
        res = await engine.ask('integrate', { expr: '1/x^2', var: 'x', lower: '1', upper: '∞', deg: false })
        checkValidResult(res)
        expect(near(math.evaluate(res.text), 1), 'integrate 1/x^2 1 to ∞').toBe(true)
        
        // Gaussian integral
        res = await engine.ask('integrate', { expr: 'exp(-x^2)', var: 'x', lower: '-Infinity', upper: 'Infinity', deg: false })
        checkValidResult(res)
        expect(near(math.evaluate(res.text), Math.sqrt(Math.PI)), 'integrate exp(-x^2) -Infinity to Infinity').toBe(true)
      })
    })

    describe('limit', () => {
      it('computes limits', async () => {
        if (!engine.jobs.has('limit')) return
        
        // Fundamental trigonometric limit
        let res = await engine.ask('limit', { expr: 'sin(x)/x', var: 'x', to: '0', deg: false })
        checkValidResult(res)
        expect(near(math.evaluate(res.text), 1), 'limit sin(x)/x at 0').toBe(true)
        
        // Definition of e
        res = await engine.ask('limit', { expr: '(1+1/n)^n', var: 'n', to: 'Infinity', deg: false })
        checkValidResult(res)
        expect(near(math.evaluate(res.text), Math.E), 'limit (1+1/n)^n at Infinity').toBe(true)
        
        // One-sided limit, to infinity
        res = await engine.ask('limit', { expr: '1/x', var: 'x', to: '0', dir: '+', deg: false })
        if (gap('infinite-number')) {
          expect(res.error, `known gap still there: ${opts?.knownGaps?.['infinite-number']}`).toBeDefined()
        } else {
          checkValidResult(res)
          expect(res.numeric?.re, 'limit 1/x at 0 dir +').toBe(Infinity)
        }
        
        // Squeeze theorem application
        res = await engine.ask('limit', { expr: 'x*sin(1/x)', var: 'x', to: 'Infinity', deg: false })
        checkValidResult(res)
        expect(near(math.evaluate(res.text), 1), 'limit x*sin(1/x) at Infinity').toBe(true)
      })
    })

    describe('series', () => {
      it('computes series expansions', async () => {
        if (!engine.jobs.has('series')) return
        
        // Maclaurin series for exp
        let res = await engine.ask('series', { expr: 'exp(x)', var: 'x', at: '0', n: 6, deg: false })
        checkValidResult(res)
        checkSamples(res.text, '1+x+x^2/2+x^3/6+x^4/24+x^5/120', ['x'], [[0.1], [0.2], [-0.1], [-0.5], [0.5]])
        
        // Maclaurin series for sin
        res = await engine.ask('series', { expr: 'sin(x)', var: 'x', at: '0', n: 8, deg: false })
        checkValidResult(res)
        checkSamples(res.text, 'x-x^3/6+x^5/120-x^7/5040', ['x'], [[0.1], [0.2], [-0.1], [-0.5], [0.5]])
        
        // Geometric series
        res = await engine.ask('series', { expr: '1/(1-x)', var: 'x', at: '0', n: 5, deg: false })
        checkValidResult(res)
        checkSamples(res.text, '1+x+x^2+x^3+x^4', ['x'], [[0.1], [0.2], [-0.1], [-0.5], [0.5]])

        // Maclaurin series for cos
        res = await engine.ask('series', { expr: 'cos(x)', var: 'x', at: '0', n: 4, deg: false })
        checkValidResult(res)
        checkSamples(res.text, '1-x^2/2', ['x'], [[0.1], [0.2], [-0.1], [-0.5], [0.5]])
      })
    })

    describe('solve', () => {
      it('solves equations and systems', async () => {
        if (!engine.jobs.has('solve')) return
        
        // Quadratic equation
        let res = await engine.ask('solve', { eqs: ['x^2-5*x+6=0'], vars: ['x'], deg: false })
        expect(res.error).toBeUndefined()
        let sols = res.solutions?.map(s => s.x.numeric?.re).sort()
        expect(sols, 'solve x^2-5*x+6=0').toEqual([2, 3])
        checkEquation('x^2-5*x+6', '0', ['x'], res.solutions!)
        
        // Linear system
        res = await engine.ask('solve', { eqs: ['x+y=3', 'x-y=1'], vars: ['x', 'y'], deg: false })
        expect(res.error).toBeUndefined()
        expect(res.solutions?.[0]?.x.numeric?.re, 'solve x+y=3, x-y=1 (x)').toBe(2)
        expect(res.solutions?.[0]?.y.numeric?.re, 'solve x+y=3, x-y=1 (y)').toBe(1)
        checkEquation('x+y', '3', ['x', 'y'], res.solutions!)
        checkEquation('x-y', '1', ['x', 'y'], res.solutions!)
        
        // Complex roots
        res = await engine.ask('solve', { eqs: ['x^2+1=0'], vars: ['x'], deg: false })
        expect(res.error).toBeUndefined()
        sols = res.solutions?.map(s => s.x.numeric?.im).sort()
        expect(sols, 'solve x^2+1=0').toEqual([-1, 1])
        checkEquation('x^2+1', '0', ['x'], res.solutions!)
        
        // Exponential equation
        res = await engine.ask('solve', { eqs: ['2^x=8'], vars: ['x'], deg: false })
        expect(res.error).toBeUndefined()
        expect(res.solutions?.[0]?.x.numeric?.re, 'solve 2^x=8').toBe(3)
        checkEquation('2^x', '8', ['x'], res.solutions!)
      })

      it('finds the unknowns itself when none are named (the bar sends an empty list)', async () => {
        if (!engine.jobs.has('solve')) return
        for (const vars of [[], undefined]) {
          const res = await engine.ask('solve', { eqs: ['x^2-4=0'], vars, deg: false })
          expect(res.error, `solve x^2-4=0 with vars ${JSON.stringify(vars)}`).toBeUndefined()
          expect(res.solutions?.map((s) => s.x.numeric?.re).sort(), `solve x^2-4=0 with vars ${JSON.stringify(vars)}`).toEqual([-2, 2])
        }
      })
    })

    describe('eval', () => {
      it('evaluates expressions with no letters', async () => {
        if (!engine.jobs.has('eval')) return
        for (const [expr, want] of [['2^10', 1024], ['sqrt(2)^2', 2], ['ln(e^2)', 2], ['log(100)', 2]] as const) {
          const res = await engine.ask('eval', { expr, deg: false })
          checkValidResult(res)
          expect(near(math.evaluate(res.text), want), `eval ${expr}`).toBe(true)
        }
      })
    })

    describe('deg', () => {
      it('respects degree mode', async () => {
        if (!engine.jobs.has('diff')) return

        const res = await engine.ask('diff', { expr: 'sin(x)', var: 'x', order: 1, deg: true })
        checkValidResult(res)
        checkSamples(res.text, 'pi/180*cos(pi*x/180)')
      })

      it('works a definite integral of trig in degrees', async () => {
        if (!engine.jobs.has('integrate')) return
        // ∫₀⁹⁰ cos(x°) dx = (180/π) sin 90° = 180/π
        const res = await engine.ask('integrate', { expr: 'cos(x)', var: 'x', lower: '0', upper: '90', deg: true })
        checkValidResult(res)
        expect(near(math.evaluate(res.text), 180 / Math.PI), 'integrate cos(x) 0..90 in degrees').toBe(true)
      })
    })

    describe('refusals', () => {
      it('returns readable errors for invalid input', async () => {
        if (!engine.jobs.has('simplify')) return
        const res = await engine.ask('simplify', { expr: '(x+', deg: false })
        expect(res.error).toBeDefined()
        expect(res.error).toContain(' ')
        expect(res.error?.endsWith('.')).toBe(true)
        const badWords = ['Traceback', 'SyntaxError', 'sympy', 'Python', 'line 1']
        for (const word of badWords) {
          expect(res.error).not.toContain(word)
        }
      })
      
      it('returns readable errors for unsupported jobs', async () => {
        const allJobs: EngineJob[] = [
          'exact', 'eval', 'simplify', 'expand', 'factor', 'factorComplex', 'apart',
          'diff', 'integrate', 'limit', 'series', 'solve'
        ]
        const missing = allJobs.find(j => !engine.jobs.has(j))
        if (missing) {
          const res = await engine.ask(missing as Exclude<EngineJob, 'integralSteps' | 'diffSteps'>, { expr: 'x', deg: false })
          expect(res.error).toBeDefined()
          expect(res.error).toContain(' ')
          expect(res.error?.endsWith('.')).toBe(true)
        }
      })
    })

    describe('steps', () => {
      it('provides integral steps', async () => {
        if (!engine.workSteps || !engine.jobs.has('integralSteps')) return
        
        const work = await engine.workSteps('integralSteps', { expr: 'x*exp(x)', var: 'x', deg: false }, { input: 'x e^x' })
        expect(work.error).toBeUndefined()
        expect(work.moves.length).toBeGreaterThan(0)
        expect(work.answers.length).toBeGreaterThan(0)
        expect(work.answers[0].tex.length).toBeGreaterThan(0)
      })
      
      it('provides diff steps', async () => {
        if (!engine.workSteps || !engine.jobs.has('diffSteps')) return
        
        const work = await engine.workSteps('diffSteps', { expr: 'x^2*sin(x)', var: 'x', order: 1, deg: false }, { input: 'x^2 \\sin(x)' })
        expect(work.error).toBeUndefined()
        expect(work.moves.length).toBeGreaterThan(0)
        expect(work.answers.length).toBeGreaterThan(0)
        expect(work.answers[0].tex.length).toBeGreaterThan(0)
      })
    })
  })
}

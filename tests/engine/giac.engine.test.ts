// The Giac adapter against the real runtime (headless, tests/engine/giacHeadless.ts): each G00 setting
// proved by what Giac does with it and without it, the real odd roots, every item of G00's adversarial
// list (docs/knowledge/engine-semantics.md §7), the answers Giac gets wrong and the adapter refuses,
// no Giac name on screen, and every spelling round trip through the engine itself.

import katex from 'katex'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { headlessGiacClient, headlessGiacEngine } from './giacHeadless'
import { MUST_COVER, ROUND_TRIPS } from './giacCases'
import { GIAC_JOBS, giacNumber, REFUSALS } from '../../src/renderer/src/math/engine/giac/adapter'
import { CANT_READ, CANT_SHOW, fromGiac, physlabText, readPhysLab, toGiac } from '../../src/renderer/src/math/engine/giac/spelling'
import { GIAC_SETUP, type GiacClient } from '../../src/renderer/src/math/engine/giac/worker'
import { ADVERSARIAL_CASES } from '../../src/renderer/src/math/engine/semantics'
import type { EngineJob, EngineRequest, EngineResult, MathEngine } from '../../src/renderer/src/math/engine/types'
import { math, setAngleMode } from '../../src/renderer/src/math/expr'

// Every case asks the real runtime; on a loaded machine that passes vitest's default 5 s.
vi.setConfig({ testTimeout: 30000 })

let engine: MathEngine
let client: GiacClient

beforeAll(async () => {
  setAngleMode('rad')
  const made = headlessGiacEngine()
  engine = made.engine
  client = made.client
  await client.run(['1'])
}, 60000)
afterAll(() => client.dispose())

const ask = (job: Exclude<EngineJob, 'integralSteps' | 'diffSteps'>, req: Omit<EngineRequest, 'deg'> & { deg?: boolean }): Promise<EngineResult> =>
  engine.ask(job, { deg: false, ...req })

/** The value of an answer's text at x (PhysLab's text read by mathjs alone, in radians). */
const at = (text: string, x: number): number => Number(math.evaluate(text, { x }))

/** One printed answer to a raw command, through the same client. */
async function raw(c: GiacClient, cmd: string): Promise<string> {
  const r = await c.run([cmd])
  if ('error' in r) throw new Error(r.error)
  return r.outs[0]
}

describe('the jobs', () => {
  it("Giac answers every job but exact and the two steps jobs, and refuses those in the words of the socket", async () => {
    expect([...engine.jobs].sort()).toEqual([...GIAC_JOBS].sort())
    expect(GIAC_JOBS).not.toContain('exact')
    expect((await engine.ask('exact', { expr: '0.5', deg: false })).error).toBe(REFUSALS.notThisJob)
    expect(engine.workSteps).toBeUndefined()
  })

  it('reads the numbers Giac prints, and refuses those a double cannot hold', () => {
    expect(giacNumber('0.10000000000000000e-4')).toBe(1e-5)
    expect(giacNumber('-1.4142135623730950488016887242')).toBe(-Math.SQRT2)
    expect(giacNumber('0.000000000000000000000000000000')).toBe(0)
    // 10^400 is not infinite and 2^-2000 is not 0.
    expect(giacNumber('0.10000000000000000e401')).toBeNull()
    expect(giacNumber('0.87098098162172167e-602')).toBeNull()
    expect(giacNumber('undef')).toBeNull()
    expect(giacNumber('1+2*i')).toBeNull()
  })
})

describe('G00 setup: each setting, proved by what Giac does with it and without it', () => {
  let flipped: GiacClient
  let approx: GiacClient
  beforeAll(async () => {
    // The same worker set up the other way round: each setting flipped, each answer changes. The
    // decimals of approx_mode would change every other answer too, so it is flipped on its own.
    const other: Record<string, { cmd: string; want: string }> = {
      'complex_mode:=0': { cmd: 'complex_mode:=1', want: '1' },
      'complex_variables:=0': { cmd: 'complex_variables:=1', want: '1' },
      'angle_radian:=1': { cmd: 'angle_radian:=0', want: '0' },
      'with_sqrt(0)': { cmd: 'with_sqrt(1)', want: '1' },
      'all_trig_solutions:=0': { cmd: 'all_trig_solutions:=1', want: '1' }
    }
    flipped = headlessGiacClient({ setup: GIAC_SETUP.map((s) => other[s.cmd] ?? s) })
    approx = headlessGiacClient({ setup: GIAC_SETUP.map((s) => (s.cmd === 'approx_mode:=0' ? { cmd: 'approx_mode:=1', want: '1' } : s)) })
    await Promise.all([flipped.run(['1']), approx.run(['1'])])
  }, 60000)
  afterAll(() => {
    flipped.dispose()
    approx.dispose()
  })

  it('sets six things, and each answers as wanted at every start', () => {
    expect(GIAC_SETUP.map((s) => s.cmd)).toEqual(['complex_mode:=0', 'complex_variables:=0', 'angle_radian:=1', 'with_sqrt(0)', 'all_trig_solutions:=0', 'approx_mode:=0'])
  })

  it('complex_mode 0, the real domain: x² + 1 = 0 has no real root (complex mode gives ±i)', async () => {
    expect(await raw(client, 'solve(v_x^2+1=0,v_x)')).toBe('[]')
    expect(await raw(flipped, 'solve(v_x^2+1=0,v_x)')).toBe('list[i,-i]')
  })

  it('complex_variables 0: a letter is real, so re(x) is x (otherwise it stays re(x))', async () => {
    expect(await raw(client, 're(v_x)')).toBe('v_x')
    expect(await raw(flipped, 're(v_x)')).not.toBe('v_x')
  })

  it('angle_radian 1: sin(π/6) is ½ and sin(30) is not (in degree mode sin(30) is ½)', async () => {
    expect(await raw(client, 'sin(pi/6)')).toBe('1/2')
    expect(await raw(client, 'sin(30)')).toBe('sin(30)')
    expect(await raw(flipped, 'sin(30)')).toBe('1/2')
  })

  it('with_sqrt 0: factor works over the rationals (otherwise x² − 2 splits into surds)', async () => {
    expect(await raw(client, 'factor(v_x^2-2)')).toBe('v_x^2-2')
    expect(await raw(flipped, 'factor(v_x^2-2)')).toBe('(v_x-sqrt(2))*(v_x+sqrt(2))')
  })

  it('all_trig_solutions 0: the principal solutions (otherwise every one, with an integer n_0)', async () => {
    expect(await raw(client, 'solve(sin(v_x)=1/2,v_x)')).toBe('list[1/6*pi,5/6*pi]')
    expect(await raw(flipped, 'solve(sin(v_x)=1/2,v_x)')).toMatch(/n_\d/)
  })

  it('approx_mode 0: exact answers (otherwise √2 is a decimal)', async () => {
    expect(await raw(client, 'sqrt(2)')).toBe('sqrt(2)')
    expect(await raw(approx, 'sqrt(2)')).toMatch(/^1\.414/)
  })

  it('degrees are not a Giac setting here: a request in degrees is answered in radians-free text', async () => {
    const r = await ask('eval', { expr: 'sin(30)', deg: true })
    expect(r.text).toBe('1/2')
    const s = await ask('solve', { eqs: ['sin(x) = 1/2'], vars: ['x'], deg: true })
    expect(s.solutions?.map((row) => row.x.text)).toEqual(['30', '150'])
    const a = await ask('eval', { expr: 'asin(1/2)', deg: true })
    expect(a.text).toBe('30')
    const d = await ask('diff', { expr: 'sin(x)', var: 'x', at: '90', deg: true })
    expect(d.value?.numeric?.re).toBe(0)
  })
})

describe('the real domain (G00 §1): a complex answer only when asked', () => {
  it.each([
    ['eval', 'sqrt(-4)'],
    ['eval', 'ln(-1)'],
    ['eval', 'asin(2)'],
    ['eval', '(-4)^(1/2)'],
    ['simplify', 'sqrt(-9)*2']
  ] as const)('%s %s has no real value', async (job, expr) => {
    expect((await ask(job, { expr })).error).toBe(REFUSALS.noRealValue)
  })

  it('a request that writes i asks for complex numbers, and gets them', async () => {
    expect((await ask('eval', { expr: '(2 + 3*i)*(1 - i)' })).numeric).toEqual({ re: 5, im: 1 })
    expect((await ask('eval', { expr: 'sqrt(-4) + 0*i' })).numeric).toEqual({ re: 0, im: 2 })
    expect((await ask('factorComplex', { expr: 'x^2 + 4' })).text).toBe('(x + 2*i)*(x - 2*i)')
  })

  it('no slope where the function has no real value, and no limit from a side where it has none', async () => {
    // d/dx ln x = 1/x is −1 at x = −1, where ln x has no real value; √x has no value left of 0.
    expect((await ask('diff', { expr: 'ln(x)', var: 'x', at: '-1' })).error).toBe(REFUSALS.noDerivative)
    expect((await ask('diff', { expr: 'sqrt(x)', var: 'x', at: '-4' })).error).toBe(REFUSALS.noDerivative)
    expect((await ask('diff', { expr: 'ln(x)', var: 'x', at: '2' })).value?.numeric).toEqual({ re: 0.5 })
    expect((await ask('limit', { expr: 'sqrt(x)', var: 'x', to: '0', dir: '-' })).error).toBe(REFUSALS.noLimit)
    expect((await ask('limit', { expr: 'sqrt(x)', var: 'x', to: '0' })).error).toBe(REFUSALS.noLimit)
    expect((await ask('limit', { expr: 'sqrt(x)', var: 'x', to: '0', dir: '+' })).numeric).toEqual({ re: 0 })
    expect((await ask('limit', { expr: 'ln(x)', var: 'x', to: '0', dir: '+' })).numeric?.re).toBe(-Infinity)
    expect((await ask('limit', { expr: 'cbrt(x)', var: 'x', to: '0' })).numeric).toEqual({ re: 0 })
  })

  it('solve: every root of a polynomial equation, real ones first and smallest first, then each pair a + bi, a − bi (owner, G3b-1)', async () => {
    const values = async (eq: string): Promise<Array<{ re: number; im?: number } | null>> =>
      ((await ask('solve', { eqs: [eq], vars: ['x'] })).solutions ?? []).map((r) => r.x.numeric)
    const s3 = Math.sqrt(3) / 2
    const cube = await values('x^3 = 1')
    expect(cube).toHaveLength(3)
    expect(cube[0]).toEqual({ re: 1 })
    expect(cube[1]?.re).toBeCloseTo(-0.5, 14)
    expect(cube[1]?.im).toBeCloseTo(s3, 14)
    expect(cube[2]?.re).toBeCloseTo(-0.5, 14)
    expect(cube[2]?.im).toBeCloseTo(-s3, 14)
    expect(await values('x^4 = 16')).toEqual([{ re: -2 }, { re: 2 }, { re: 0, im: 2 }, { re: 0, im: -2 }])
    expect(await values('x^2 + 2*x + 5 = 0')).toEqual([
      { re: -1, im: 2 },
      { re: -1, im: -2 }
    ])
    // A repeated root once, as the other engine lists it; x(x² + 1) has one real and two complex roots.
    expect(await values('(x - 2)^2*(x^2 + 1) = 0')).toEqual([{ re: 2 }, { re: 0, im: 1 }, { re: 0, im: -1 }])
    expect(await values('x^3 + x = 0')).toEqual([{ re: 0 }, { re: 0, im: 1 }, { re: 0, im: -1 }])
  })

  it('solve: an equation that is not polynomial keeps the real domain (its complex solutions only when there is no real one)', async () => {
    const texts = async (eq: string): Promise<string[]> => ((await ask('solve', { eqs: [eq], vars: ['x'] })).solutions ?? []).map((r) => r.x.text)
    expect(await texts('e^x = 2')).toEqual(['ln(2)'])
    expect(await texts('sqrt(x) = x - 2')).toEqual(['4'])
    expect(await texts('2^x = 8')).toEqual(['3'])
    expect(await texts('e^x = -1')).toEqual(['i*pi'])
    // A negative power of the unknown is not a polynomial (review, P-FIX-ALLROOTS): the real path, x = 1 alone.
    expect(await texts('x^(-3) = 1')).toEqual(['1'])
    expect(await texts('x^-3 = 1')).toEqual(['1'])
    expect(await texts('1/x^3 = 1')).toEqual(['1'])
  })
})

describe('real odd roots (G00 §2): (−8)^(1/3) = −2', () => {
  it("Giac's own power is the complex principal value, which is why the spelling sends surd", async () => {
    expect(await raw(client, '(-8)^(1/3)')).toContain('i')
    expect(await raw(client, 'surd(-8,3)')).toBe('-8^(1/3)')
  })

  it.each([
    ['(-8)^(1/3)', -2],
    ['(-8)^(2/3)', 4],
    ['(-8)^(-1/3)', -0.5],
    ['cbrt(-27)', -3],
    ['nthRoot(-32, 5)', -2],
    ['(-32)^(3/5)', -8],
    ['∛-8', -2]
  ])('eval %s = %d', async (expr, want) => {
    const r = await ask('eval', { expr })
    expect(r.error).toBeUndefined()
    expect(r.numeric).toEqual({ re: want })
  })

  it('in solve, simplify, diff and integrate the root of a negative is real', async () => {
    // x³ = −8: the real root −2 first, then the complex pair 1 ± √3 i (every root of a polynomial equation, G3b-1).
    const s = await ask('solve', { eqs: ['x^3 = -8'], vars: ['x'] })
    expect(s.solutions?.[0].x).toMatchObject({ text: '-2', numeric: { re: -2 } })
    expect(s.solutions?.slice(1).map((row) => [row.x.numeric?.re, Math.round((row.x.numeric?.im ?? 0) * 1e9) / 1e9])).toEqual([
      [1, Math.round(Math.sqrt(3) * 1e9) / 1e9],
      [1, -Math.round(Math.sqrt(3) * 1e9) / 1e9]
    ])
    const simp = await ask('simplify', { expr: 'x^(1/3)' })
    expect(at(simp.text, -8)).toBeCloseTo(-2, 12)
    // d/dx x^(1/3) = 1/(3 x^(2/3)), which is 1/12 at x = −8 with the real root.
    const d = await ask('diff', { expr: 'x^(1/3)', var: 'x', at: '-8' })
    expect(d.value?.numeric?.re).toBeCloseTo(1 / 12, 14)
    // ∫₋₈⁰ x^(1/3) dx = −(3/4)·16 = −12 with the real root.
    const i = await ask('integrate', { expr: 'x^(1/3)', var: 'x', lower: '-8', upper: '0' })
    expect(i.numeric?.re).toBeCloseTo(-12, 12)
  })
})

describe("G00's adversarial list (docs/knowledge/engine-semantics.md §7) through the engine", () => {
  // One check per case id; the list must stay covered as it grows.
  const checks: Record<string, () => Promise<void>> = {
    sqrt_x_sq: async () => {
      const r = await ask('simplify', { expr: 'sqrt(x^2)' })
      expect(r.text).toBe('abs(x)')
      expect(at(r.text, -3)).toBe(3)
    },
    log_x_sq: async () => {
      // Never 2 ln x, which has no value at x = −2.
      const r = await ask('simplify', { expr: 'ln(x^2)' })
      expect(at(r.text, -2)).toBeCloseTo(Math.log(4), 14)
    },
    cancelled_factor: async () => {
      // The engine answers x; reporting x ≠ 1 is the checkers' (G2): EngineResult has no field for it.
      const r = await ask('simplify', { expr: 'x*(x-1)/(x-1)' })
      expect(r.text).toBe('x')
    },
    pole_odd_inv_x: async () => {
      expect((await ask('limit', { expr: '1/x', var: 'x', to: '0' })).error).toBe(REFUSALS.sidesDiffer)
      expect((await ask('limit', { expr: '1/x', var: 'x', to: '0', dir: '+' })).numeric?.re).toBe(Infinity)
      expect((await ask('limit', { expr: '1/x', var: 'x', to: '0', dir: '-' })).numeric?.re).toBe(-Infinity)
      expect((await ask('eval', { expr: '1/0' })).error).toBe(REFUSALS.divideByZero)
    },
    pole_even_inv_x_sq: async () => {
      expect((await ask('limit', { expr: '1/x^2', var: 'x', to: '0' })).numeric?.re).toBe(Infinity)
      expect((await ask('limit', { expr: '1/x^2', var: 'x', to: '0', dir: '-' })).numeric?.re).toBe(Infinity)
    },
    abs_val_diff: async () => {
      expect((await ask('diff', { expr: '|x|', var: 'x', at: '0' })).error).toBe(REFUSALS.noDerivative)
      expect((await ask('diff', { expr: '|x|', var: 'x', at: '2' })).value?.numeric?.re).toBe(1)
      expect((await ask('diff', { expr: '|x|', var: 'x', at: '-2' })).value?.numeric?.re).toBe(-1)
    },
    sign_func: async () => {
      expect((await ask('limit', { expr: 'sgn(x)', var: 'x', to: '0' })).error).toBe(REFUSALS.sidesDiffer)
      expect((await ask('limit', { expr: 'sgn(x)', var: 'x', to: '0', dir: '+' })).numeric?.re).toBe(1)
      expect((await ask('limit', { expr: 'sgn(x)', var: 'x', to: '0', dir: '-' })).numeric?.re).toBe(-1)
      // Giac's derivative of sign x is 0, true everywhere but 0, where it has none: the jump is checked.
      expect((await ask('diff', { expr: 'sgn(x)', var: 'x', at: '0' })).error).toBe(REFUSALS.noDerivative)
      expect((await ask('eval', { expr: 'sgn(0)' })).numeric?.re).toBe(0)
    },
    piecewise: async () => {
      for (const job of ['simplify', 'diff'] as const) expect((await ask(job, { expr: 'piecewise(x < 0, -x, x >= 0, x)', var: 'x' })).error).toBe(CANT_READ)
    },
    tan_pole: async () => {
      expect((await ask('limit', { expr: 'tan(x)', var: 'x', to: 'pi/2' })).error).toBe(REFUSALS.sidesDiffer)
      expect((await ask('limit', { expr: 'tan(x)', var: 'x', to: 'pi/2', dir: '-' })).numeric?.re).toBe(Infinity)
      expect((await ask('limit', { expr: 'tan(x)', var: 'x', to: 'pi/2', dir: '+' })).numeric?.re).toBe(-Infinity)
      // Giac gives the principal value 0 for ∫₀^π tan x dx; it diverges.
      expect((await ask('integrate', { expr: 'tan(x)', var: 'x', lower: '0', upper: 'pi' })).error).toBe(REFUSALS.diverges)
    },
    double_root: async () => {
      // One row, x = 2; its multiplicity is the checkers' (G2), as the solve rows carry none.
      const r = await ask('solve', { eqs: ['(x-2)^2 = 0'], vars: ['x'] })
      expect(r.solutions?.map((row) => row.x.text)).toEqual(['2'])
    },
    missing_root: async () => {
      const r = await ask('solve', { eqs: ['x^2 = x'], vars: ['x'] })
      expect(r.solutions?.map((row) => row.x.numeric?.re)).toEqual([0, 1])
    },
    extraneous_root_squaring: async () => {
      const r = await ask('solve', { eqs: ['x = sqrt(x + 2)'], vars: ['x'] })
      expect(r.solutions?.map((row) => row.x.text)).toEqual(['2'])
    },
    zero_times_inf: async () => {
      expect((await ask('limit', { expr: 'x * (1/x)', var: 'x', to: '0' })).numeric).toEqual({ re: 1 })
    },
    odd_root_neg: async () => {
      expect((await ask('eval', { expr: '(-8)^(1/3)' })).numeric).toEqual({ re: -2 })
    },
    euler_identity: async () => {
      const r = await ask('eval', { expr: 'e^(i*pi)' })
      expect(r.text).toBe('-1')
      expect(r.numeric).toEqual({ re: -1 })
    },
    extreme_coefficients: async () => {
      const r = await ask('solve', { eqs: ['1e-19 * x + 6e24 = 0'], vars: ['x'] })
      expect(r.solutions?.[0].x.text).toBe(`-6${'0'.repeat(43)}`)
      expect(r.solutions?.[0].x.numeric?.re).toBe(-6e43)
    }
  }

  it('checks every case in the list', () => {
    expect(Object.keys(checks).sort()).toEqual(ADVERSARIAL_CASES.map((c) => c.id).sort())
  })

  it.each(ADVERSARIAL_CASES.map((c) => [c.id, c.pitfall]))('%s (pitfall: %s)', async (id) => {
    await checks[id]()
  }, 30000)
})

type Job = Exclude<EngineJob, 'integralSteps' | 'diffSteps'>
type Req = Omit<EngineRequest, 'deg'>

describe('answers Giac gets wrong, or cannot give exactly, are refused', () => {
  const refused: Array<[Job, Req, string]> = [
    // A definite integral across a pole: Giac gives the principal value (0) for each of these.
    ['integrate', { expr: '1/x', var: 'x', lower: '-1', upper: '1' }, REFUSALS.diverges],
    ['integrate', { expr: 'tan(x)', var: 'x', lower: '0', upper: 'pi' }, REFUSALS.diverges],
    // singular() lists tan's poles once (±π/2): the one at 5π/2 is found by sampling, and refused.
    ['integrate', { expr: 'tan(x)', var: 'x', lower: '5*pi/2 - 1', upper: '5*pi/2 + 1' }, REFUSALS.notExact],
    ['integrate', { expr: '1/(x - 3)', var: 'x', lower: '2', upper: '4' }, REFUSALS.diverges],
    ['integrate', { expr: '1/x', var: 'x', lower: '-Infinity', upper: 'Infinity' }, REFUSALS.diverges],
    // Only a decimal: x = cos x, x⁵ − x + 1 = 0, ∫₀¹ e^(x²) dx.
    ['solve', { eqs: ['x = cos(x)'], vars: ['x'] }, REFUSALS.notExact],
    ['solve', { eqs: ['x^5 - x + 1 = 0'], vars: ['x'] }, REFUSALS.notExact],
    ['integrate', { expr: 'exp(x^2)', var: 'x', lower: '0', upper: '1' }, REFUSALS.notExact],
    // An integral Giac cannot do, and forms PhysLab cannot show (Si, LambertW, rootof).
    ['integrate', { expr: 'x^x', var: 'x' }, REFUSALS.notExact],
    ['integrate', { expr: 'sin(x)/x', var: 'x' }, CANT_SHOW],
    ['solve', { eqs: ['x*e^x = 1'], vars: ['x'] }, CANT_SHOW],
    ['solve', { eqs: ['x^3 - 3*x + 1 = 0'], vars: ['x'] }, CANT_SHOW],
    // No limit, no value.
    ['limit', { expr: 'sin(1/x)', var: 'x', to: '0' }, REFUSALS.noLimit],
    ['eval', { expr: 'ln(0)' }, REFUSALS.noValue],
    ['eval', { expr: '0/0' }, REFUSALS.noValue],
    ['eval', { expr: '1/0' }, REFUSALS.divideByZero],
    ['diff', { expr: '1/x', var: 'x', at: '0' }, REFUSALS.noDerivative],
    ['solve', { eqs: ['0 = 0'], vars: ['x'] }, REFUSALS.everyValue(['x'])],
    ['apart', { expr: '1/(x*y - 1)' }, REFUSALS.notExact],
    ['eval', { expr: 'sin x' }, CANT_READ],
    ['simplify', { expr: '(x+' }, CANT_READ]
  ]
  it.each(refused)('%s %j', async (job, req, sentence) => {
    expect((await ask(job, req)).error).toBe(sentence)
  }, 30000)

  it('integrals that converge across a singular point still get their value', async () => {
    // ∫₋₁¹ x^(−1/3) dx = −3/2 + 3/2 = 0; ∫₋₁¹ dx/x² = +∞; ∫₀¹ dx/√x = 2; ∫₋₁² |x| dx = 5/2.
    expect((await ask('integrate', { expr: 'x^(-1/3)', var: 'x', lower: '-1', upper: '1' })).numeric).toEqual({ re: 0 })
    expect((await ask('integrate', { expr: '1/x^2', var: 'x', lower: '-1', upper: '1' })).numeric?.re).toBe(Infinity)
    expect((await ask('integrate', { expr: '1/sqrt(x)', var: 'x', lower: '0', upper: '1' })).numeric).toEqual({ re: 2 })
    expect((await ask('integrate', { expr: '|x|', var: 'x', lower: '-1', upper: '2' })).numeric).toEqual({ re: 2.5 })
    expect((await ask('integrate', { expr: 'tan(x)', var: 'x', lower: '0', upper: '1' })).numeric?.re).toBeCloseTo(-Math.log(Math.cos(1)), 14)
  }, 30000)

  it('a root that does not satisfy its equation is never shown (every row is put back)', async () => {
    // Giac's own answers satisfy these; the check is what would catch one that did not.
    for (const eq of ['x^2 - 5*x + 6 = 0', 'x = sqrt(x + 2)', 'sqrt(x) = x - 2', '2^x = 8', 'abs(x - 1) = 3']) {
      const r = await ask('solve', { eqs: [eq], vars: ['x'] })
      expect(r.error, eq).toBeUndefined()
      const [l, rhs] = eq.split('=')
      for (const row of r.solutions ?? []) expect(Math.abs(at(`(${l}) - (${rhs})`.replace(/sqrt/g, 'sqrt'), row.x.numeric?.re as number))).toBeLessThan(1e-12)
    }
  }, 30000)
})

describe('no Giac name ever reaches the screen', () => {
  // Hard requests whose answers Giac prints with its own names; whatever comes back, every name in
  // the text and the LaTeX is one PhysLab writes itself.
  const requests: Array<[Exclude<EngineJob, 'integralSteps' | 'diffSteps'>, Omit<EngineRequest, 'deg'>]> = [
    ['integrate', { expr: 'exp(-x^2)', var: 'x' }],
    ['integrate', { expr: '1/ln(x)', var: 'x' }],
    ['integrate', { expr: 'sin(x)/x', var: 'x' }],
    ['integrate', { expr: '1/(x^5 + x + 1)', var: 'x' }],
    ['integrate', { expr: 'sqrt(tan(x))', var: 'x' }],
    ['solve', { eqs: ['x^x = 2'], vars: ['x'] }],
    ['solve', { eqs: ['sin(x) = x/2'], vars: ['x'] }],
    ['solve', { eqs: ['x^4 + x + 1 = 0'], vars: ['x'] }],
    ['limit', { expr: 'x^x', var: 'x', to: '0' }],
    ['limit', { expr: 'cos(x)/x', var: 'x', to: 'Infinity' }],
    ['series', { expr: '1/sin(x)', var: 'x', at: '0', n: 4 }],
    ['series', { expr: 'sqrt(x)', var: 'x', at: '0', n: 3 }],
    ['simplify', { expr: 'gamma(x)' }],
    ['simplify', { expr: 'Gamma + Psi + Zeta + D + O' }],
    ['factor', { expr: 'x^4 + 1' }],
    ['factorComplex', { expr: 'x^3 + 2' }],
    ['diff', { expr: 'abs(sin(x))', var: 'x' }],
    ['diff', { expr: 'floor(x)', var: 'x' }],
    ['eval', { expr: 'factorial(1/2)' }],
    ['eval', { expr: 'asin(2)' }]
  ]
  const OURS = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'asin', 'acos', 'atan', 'acot', 'asec', 'acsc', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'exp', 'ln', 'log', 'sqrt', 'cbrt', 'nthRoot', 'abs', 'sign', 'factorial', 'combinations', 'permutations', 'floor', 'ceil', 'erf', 'pi', 'e', 'i', 'Infinity', 'x', 'gamma', 'G', 'a', 'm', 'P', 's', 'Z', 't', 'D', 'O'])
  const TEX = /\\(left|right|frac|sqrt|cdot|infty|pi|sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|ln|log|operatorname|binom|lfloor|rfloor|lceil|rceil|gamma|mathit|circ|text|tilde)\b/g

  it.each(requests)('%s %j', async (job, req) => {
    const r = await ask(job, req)
    const texts = [r.error ? '' : r.text, ...(r.solutions ?? []).flatMap((row) => Object.values(row).map((v) => v.text))]
    for (const t of texts) for (const name of t.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) expect(OURS.has(name), `${name} in ${t}`).toBe(true)
    const latexes = [r.latex, ...(r.solutions ?? []).flatMap((row) => Object.values(row).map((v) => v.latex))]
    for (const l of latexes) {
      for (const word of l.replace(TEX, '').match(/[A-Za-z]{2,}/g) ?? []) expect(['sgn', 'erf', 'undefined'].includes(word), `${word} in ${l}`).toBe(true)
      if (l) expect(() => katex.renderToString(l, { throwOnError: true })).not.toThrow()
    }
    if (r.error) expect(r.error).toMatch(/^[A-Z].*\.$/)
  }, 30000)
})

describe('every spelling round trip, through the engine itself', () => {
  // Each text goes to Giac, Giac evaluates and prints it in its own form, and the spelling reads that
  // back: the value must be the same as the text's own wherever both are real.
  it('has the 150 and more, each once, covering every function and form the spelling knows', () => {
    expect(ROUND_TRIPS.length).toBeGreaterThanOrEqual(150)
    expect(new Set(ROUND_TRIPS).size).toBe(ROUND_TRIPS.length)
    for (const form of MUST_COVER) expect(ROUND_TRIPS.some((c) => form.test(c)), String(form)).toBe(true)
  })

  it.each(ROUND_TRIPS)('%s', async (text) => {
    const printed = await raw(client, toGiac(text, { deg: false }))
    const back = fromGiac(printed)
    expect(back.ok, `${text} → Giac printed ${printed}`).toBe(true)
    if (!back.ok) return
    expect(() => katex.renderToString(back.latex, { throwOnError: true })).not.toThrow()
    const canonical = physlabText(readPhysLab(text))
    const real = canonical.replace(/(\w+|\([^()]*\))\^\((-?\d+)\/(\d+)\)/g, (_m, b: string, n: string, d: string) => (Number(d) % 2 ? `nthRoot(${b}, ${d})^(${n})` : `${b}^(${n}/${d})`))
    for (const x of [0.37, 1.7, 2.9]) {
      const scope = { x, y: x + 1, t: x, theta: x, lambda: 2, alpha: 0.4, beta: 0.9, a: 1.5, b: -2, c: 0.5, m: 3, v: 2, x1: 1, x2: 2, v0: 4, C: 1.25 }
      const want = math.evaluate(real, scope) as number | { re: number; im: number }
      const got = math.evaluate(back.text, scope) as number | { re: number; im: number }
      const w = typeof want === 'number' ? { re: want, im: 0 } : want
      const g = typeof got === 'number' ? { re: got, im: 0 } : got
      if (!Number.isFinite(w.re)) continue
      const size = Math.max(1, Math.hypot(w.re, w.im))
      expect(Math.hypot(g.re - w.re, g.im - w.im) / size, `${text} at ${x}: Giac printed ${printed}, read ${back.text}`).toBeLessThan(1e-9)
    }
  }, 30000)
})

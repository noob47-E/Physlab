// P-CAS batch W1: the algebra worker's own Python (the PRELUDE of workers/cas.worker.ts), run in
// the app's bundled Pyodide and SymPy, answering the payloads the app sends.
import { beforeAll, describe, expect, it } from 'vitest'
import { pathToFileURL } from 'node:url'
import { readSource, repoPath } from './helpers/repo'
import { CAS_OPS } from '../src/renderer/src/math/engine/sympy/worker'
import { derivativeWorking, type DerivTree } from '../src/renderer/src/math/engine/sympy/calculusSteps'

let run: (op: string, payload: string) => string
const ask = (op: string, payload: Record<string, unknown>): { text?: string; error?: string; detail?: string; value?: { text: string } } =>
  JSON.parse(run(op, JSON.stringify(payload)))
const reply = (op: string, payload: Record<string, unknown>): Record<string, unknown> => JSON.parse(run(op, JSON.stringify(payload)))

beforeAll(async () => {
  const src = readSource('src/renderer/src/workers/cas.worker.ts')
  const tag = 'const PRELUDE = String.raw`'
  const at = src.indexOf(tag) + tag.length
  const base = `${repoPath('src', 'renderer', 'public', 'pyodide')}/`
  const mod = (await import(/* @vite-ignore */ pathToFileURL(`${base}pyodide.mjs`).href)) as {
    loadPyodide: (o: object) => Promise<{ loadPackage: (p: string[]) => Promise<void>; runPython: (s: string) => void; globals: { get: (n: string) => unknown } }>
  }
  const py = await mod.loadPyodide({ indexURL: base })
  await py.loadPackage(['mpmath', 'sympy'])
  py.runPython(src.slice(at, src.indexOf('\n`\n', at)))
  run = py.globals.get('cas_run') as (op: string, payload: string) => string
}, 240_000)

describe('A27 log order: log(a, b) is log base a of b, as everywhere else in PhysLab', () => {
  it('log(2, 8) = 3 and log(100) = 2 (the crew lead that log(8, 2) "should" be 3 is refuted)', () => {
    expect(ask('simplify', { expr: 'log(2, 8)', deg: false }).text).toBe('3')
    expect(ask('simplify', { expr: 'log(100)', deg: false }).text).toBe('2')
  })
})

describe('L2: a Python error never reaches the student', () => {
  it('a half-typed line gets a plain sentence; the raw text is kept only as detail', () => {
    for (const expr of ['x + ', 'sin(', '2**']) {
      const r = ask('simplify', { expr, deg: false })
      expect(r.error, expr).toBe('I could not read that. Check the brackets and signs.')
      expect(r.error, expr).not.toMatch(/line \d|<string>|EOF|Error/)
      expect(r.detail, expr).toBeTruthy()
    }
  })
})

describe('L3: degree mode also applies inside a point, a limit and a bound', () => {
  it('d/dx sin(x) at x = asin(1) in degrees is the slope at 90°, which is 0', () => {
    const r = ask('diff', { expr: 'sin(x)', var: 'x', at: 'asin(1)', deg: true })
    expect(r.value?.text).toBe('0')
  })

  it('∫ from 0 to acos(0) of cos(x) dx in degrees is 180/π (the bound is 90°, not π/2)', () => {
    const r = ask('integrate', { expr: 'cos(x)', var: 'x', lower: '0', upper: 'acos(0)', deg: true })
    expect(r.text).toBe('180/pi')
  })

  it('radians are unchanged: ∫ from 0 to acos(0) of cos(x) dx = 1', () => {
    expect(ask('integrate', { expr: 'cos(x)', var: 'x', lower: '0', upper: 'acos(0)', deg: false }).text).toBe('1')
  })
})

// W1: the command bar sends its arguments as typed, so integrate(e^(-x), 0, ∞) reached the worker
// with the sign ∞ (which it could not read) and integrate(e^(-x), 0, Infinity) with mathjs's spelling,
// which its parser split into the letters I·n·f·i·n·i·t·y (i being √−1). The Maths screen already
// sends oo (U16, math/pure/store.ts); every other route reaches the worker's own parser.
describe('W1: ∞ and Infinity are infinity wherever the worker reads them', () => {
  it('∫ from 0 to ∞ of e^(−x) dx = 1, typed with ∞, with Infinity, or with oo', () => {
    for (const upper of ['∞', 'Infinity', 'oo']) {
      expect(ask('integrate', { expr: 'e^(-x)', var: 'x', lower: '0', upper, deg: false }).text, upper).toBe('1')
    }
  })

  it('the limit of 1/x as x → ∞ or −Infinity is 0, and ∫ from −∞ to 0 of e^x dx = 1', () => {
    expect(ask('limit', { expr: '1/x', var: 'x', to: '∞', deg: false }).text).toBe('0')
    expect(ask('limit', { expr: '1/x', var: 'x', to: '-Infinity', deg: false }).text).toBe('0')
    expect(ask('integrate', { expr: 'e^x', var: 'x', lower: '-∞', upper: '0', deg: false }).text).toBe('1')
  })
})

describe('from calculusSteps.test.ts: the join with the worker (A6-01)', () => {
  it('both ops are in CAS_OPS and have a branch in the worker', () => {
    // A missing branch answers "unknown operation", so an error here means the branch is gone.
    const integral = reply('integral_steps', { expr: 'x^2', deg: false })
    expect(integral.error).toBeUndefined()
    expect(integral.answer_text).toBe('x**3/3')
    const derivative = reply('diff_steps', { expr: 'x^2', deg: false })
    expect(derivative.error).toBeUndefined()
    expect(derivative.answer_text).toBe('2*x')
  })
})

describe('from calculusSteps.test.ts: the join with the worker (A6-04)', () => {
  it('an infinite value never reaches JSON as Infinity, which JSON.parse refuses', () => {
    // ∫ from −1 to 1 of 1/x² is an infinite area and of 1/x has no value (nan). Neither may leave
    // the worker as a number: JSON.parse refuses Infinity and NaN.
    for (const expr of ['1/x^2', '1/x']) {
      const raw = run('integral_steps', JSON.stringify({ expr, lower: '-1', upper: '1', deg: false }))
      expect(raw, expr).not.toContain('Infinity')
      const def = (JSON.parse(raw) as { definite: { numeric: unknown; infinite: boolean; diverges: boolean } }).definite
      expect(def.infinite || def.diverges, expr).toBe(true)
      expect(def.numeric, expr).toBeNull()
    }
    // The guard alone decides: Si(1)'s is_finite is None, and it still gets its decimal.
    const si = JSON.parse(run('integral_steps', JSON.stringify({ expr: 'sin(x)/x', lower: '0', upper: '1', deg: false }))) as {
      definite: { value: { text: string }; numeric: { re: number } | null }
    }
    expect(si.definite.value.text).toBe('Si(1)')
    expect(si.definite.numeric?.re).toBeCloseTo(0.946083070367183, 9)
  })
})

describe('from contracts.test.ts: the contract with the Python worker (A6-05)', () => {
  it('sends everything else an expression', () => {
    // Over the complex numbers: plain factor leaves x² + 4 whole, the extension splits it into conjugates.
    const r = ask('factor_complex', { expr: 'x^2+4', deg: true })
    expect(r.error).toBeUndefined()
    expect(r.text).toBe('(x - 2*I)*(x + 2*I)')
  })
})

describe('from contracts.test.ts: the contract with the Python worker (A6-06)', () => {
  it('only asks for operations the worker implements', () => {
    // An empty payload makes a real branch fail on its missing key, with a sentence. Only an
    // operation with no branch answers "unknown operation".
    for (const op of CAS_OPS) {
      if (op === 'warmup') continue // handled before the dispatch, not as a branch
      expect(ask(op, {}).error ?? '', op).not.toBe(`unknown operation ${op}`)
    }
  })

  it('diff and diff_steps cancel algebraic powers like (sqrt(x) - 1)', () => {
    const expr = '((sqrt(x+1))*(x^(3/2) - 1))/(x^(1/2) - 1)'
    const dSteps = reply('diff_steps', { expr, deg: false }) as unknown as DerivTree
    expect(dSteps.answer_text).toBe('(3*x**(3/2) + 3*sqrt(x) + 2*x + 1)/(2*sqrt(x)*sqrt(x + 1))')
    const dDiff = reply('diff', { expr, var: 'x', deg: false })
    expect(dDiff.text).toBe('(3*x**(3/2) + 3*sqrt(x) + 2*x + 1)/(2*sqrt(x)*sqrt(x + 1))')
    const w = derivativeWorking(dSteps, expr)
    expect(w.checked).toBe('ok')
    expect(w.answers[0]?.tex).toContain('3 x^{3/2} + 3 \\sqrt{x} + 2 x + 1')
  })
})

// P-CAS batch W1: the algebra worker's own Python (the PRELUDE of workers/cas.worker.ts), run in
// the app's bundled Pyodide and SymPy, answering the payloads the app sends.
import { beforeAll, describe, expect, it } from 'vitest'
import { pathToFileURL } from 'node:url'
import { readSource, repoPath } from './helpers/repo'

let run: (op: string, payload: string) => string
const ask = (op: string, payload: Record<string, unknown>): { text?: string; error?: string; detail?: string; value?: { text: string } } =>
  JSON.parse(run(op, JSON.stringify(payload)))

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

// P-GRAPH round 2 (found by P-GRAPH's last checker and the r8 crew review): solutions of an equation in x alone
// that were lost, invented or a few billionths off, a tangent near a pole, Vector(A, B), and 2·x in a graph.
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/math/engine/sympy/worker', () => ({ cas: vi.fn(async () => ({})), useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {} }, CAS_OPS: [] }))
vi.mock('../src/renderer/src/app/theme', () => ({ themeColor: (_n: string, f = '#888') => f, seriesColor: () => '#888', SERIES_COUNT: 6, useTheme: { getState: () => ({ theme: 'dark' }) } }))

import { solutionsInX } from '../src/renderer/src/core/visualize'

const sides = (line: string): [string, string] => line.split('=').map((s) => s.trim()) as [string, string]
const solve = (line: string) => {
  const [l, r] = sides(line)
  return solutionsInX(`(${l}) - (${r})`, [l, r], {})
}
const xs = (line: string): number[] => {
  const s = solve(line)
  return s?.kind === 'real' ? s.xs : []
}

describe('H29 — a quadratic with two real solutions a hair apart gets both exactly', () => {
  it('(x − 1)² = 10⁻²⁰ is 1 ± 10⁻¹⁰, not 0.999999995 and 1.000000003', () => {
    const got = xs('(x - 1)^2 = 1e-20')
    expect(got).toHaveLength(2)
    expect(Math.abs(got[0] - (1 - 1e-10))).toBeLessThan(1e-15)
    expect(Math.abs(got[1] - (1 + 1e-10))).toBeLessThan(1e-15)
  })
})

describe('H30 — two solutions near 0 are two', () => {
  it('x² = 10⁻²⁰ is ±10⁻¹⁰, and x² = 10⁻¹⁹ is ±3.16 × 10⁻¹⁰', () => {
    const a = xs('x^2 = 1e-20')
    expect(a).toHaveLength(2)
    expect(a[0] / -1e-10).toBeCloseTo(1, 12)
    expect(a[1] / 1e-10).toBeCloseTo(1, 12)
    expect(xs('x^2 = 1e-19')).toHaveLength(2)
  })

  it('guard: a double root is still one solution', () => {
    expect(xs('(x - 1)^2 = 0')).toEqual([1])
    expect(xs('x^2 = 0')).toEqual([0])
  })
})

describe('H27 — a steep curve that ends at a value off the axis has no root at its end', () => {
  // keyPoints on the default window, as the graph marks it; the bar's sentence comes from the same check.
  const rootsOf = async (formula: string, xMin = -10, xMax = 10): Promise<number[]> => {
    const { keyPoints } = await import('../src/renderer/src/math/graphs')
    const { compileScalar } = await import('../src/renderer/src/math/expr')
    const f = compileScalar(formula, ['x'], () => ({}))
    return keyPoints((x) => f({ x }), xMin, xMax)
      .filter((p) => p.kinds.includes('root'))
      .map((p) => p.x)
  }

  it('1e6√x + 0.01 and 1e9√x + 1 have no root at 0', async () => {
    expect(await rootsOf('1e6*sqrt(x) + 0.01')).toEqual([])
    expect(await rootsOf('1e9*sqrt(x) + 1')).toEqual([])
    // (Known limit: 10¹²√x + 0.01 on a window a million wide is still about 10⁶ at every point the edge check
    // looks at, and its 0.01 is within what an edge's own rounding leaves; REPORT.)
    expect(xs('1e6*sqrt(x) + 0.01 = 0')).toEqual([])
  })

  it('guard: √x, x^(1/4) and 10⁶√x end on the axis; √(9 − x²) at ±3; √x − 0.001 at 10⁻⁶', async () => {
    expect(await rootsOf('sqrt(x)')).toEqual([0])
    expect(await rootsOf('x^(1/4)')).toEqual([0])
    expect(await rootsOf('1e6*sqrt(x)')).toEqual([0])
    expect((await rootsOf('sqrt(9 - x^2)')).map((r) => Math.round(r * 1e9) / 1e9)).toEqual([-3, 3])
    const r = await rootsOf('sqrt(x) - 0.001')
    expect(r).toHaveLength(1)
    expect(r[0] / 1e-6).toBeCloseTo(1, 6)
  })
})

describe('H33 — a pole is never a solution', () => {
  it('gamma(x) = 3 lists no solution at 0, and exp(1/x) = 2 has only x = 1/ln 2', () => {
    const g = solve('gamma(x) = 3')
    const gxs = g?.kind === 'real' ? g.xs : []
    expect(gxs.some((x) => Math.abs(x) < 1e-6), JSON.stringify(gxs)).toBe(false)
    expect(gxs.length).toBeGreaterThan(0)
    const e = xs('exp(1/x) = 2')
    expect(e).toHaveLength(1)
    expect(e[0]).toBeCloseTo(1 / Math.LN2, 9)
  })

  it('guard: tan(x) = 1 keeps its solutions and 1/x = 0 still has none', () => {
    const t = solve('tan(x) = 1')
    expect(t?.kind === 'real' ? t.xs.some((x) => Math.abs(x - 45) < 1e-6 || Math.abs(x - Math.PI / 4) < 1e-9) : false).toBe(true)
    expect(xs('1/x = 0')).toEqual([])
  })
})

describe('H28 — Vector( ) of two vectors says what the command takes', () => {
  it('Vector(A, B) with vectors A and B is refused in words and offers B − A', async () => {
    const { runCommand } = await import('../src/renderer/src/lang/commands')
    const { scene } = await import('../src/renderer/src/core/store')
    scene().newScene()
    scene().clearLog()
    for (const l of ['A = <1, 2>', 'B = <3, 4>', 'Vector(A, B)']) await runCommand(l)
    const last = scene().log.at(-1)
    expect(last?.kind).toBe('error')
    expect(last?.text).toMatch(/Vector\( \) takes two points/)
    expect(last?.text).toContain('type B - A')
    expect(last?.text).not.toMatch(/does not know a function/)
  })
})

describe('H31 — a tangent near a pole or the end of a domain', () => {
  it('slopeAt reads 1/x at 0.01 as −10000 and finds a slope at 0.001; ln x at 0.001, √x at 0.0001', async () => {
    const { slopeAt } = await import('../src/renderer/src/math/graphs')
    expect(slopeAt((x) => 1 / x, 0.01)).toBeCloseTo(-10000, 3)
    expect(slopeAt((x) => 1 / x, 0.001) / -1e6).toBeCloseTo(1, 6)
    expect(slopeAt((x) => Math.log(x), 0.001)).toBeCloseTo(1000, 3)
    expect(slopeAt((x) => Math.sqrt(x), 0.0001)).toBeCloseTo(50, 4)
    // guards: an ordinary slope keeps its precision, a corner and a vertical tangent still have none
    expect(slopeAt((x) => x + 1, 0.001)).toBeCloseTo(1, 9)
    expect(slopeAt((x) => Math.sin(x), 1000)).toBeCloseTo(Math.cos(1000), 6)
    expect(slopeAt((x) => Math.abs(x - 1), 1)).toBeNaN()
    expect(slopeAt((x) => Math.cbrt(x), 0)).toBeNaN()
  })

  it('the bar draws the tangent to 1/x at 0.001 and names x as typed', async () => {
    const { runCommand } = await import('../src/renderer/src/lang/commands')
    const { scene } = await import('../src/renderer/src/core/store')
    scene().newScene()
    scene().clearLog()
    await runCommand('tangent(1/x, 0.001)')
    const last = scene().log.at(-1)
    expect(last?.kind, last?.text).toBe('result')
    expect(last?.text).toMatch(/x = 0\.001\b/)
  })
})

describe('H32 — · between numbers multiplies in a graph and an equation', () => {
  it('y = 2·x draws 2x, and x·2 = 6 is x = 3; a vector beside · is still refused in words', async () => {
    const { runCommand } = await import('../src/renderer/src/lang/commands')
    const { scene } = await import('../src/renderer/src/core/store')
    scene().newScene()
    scene().clearLog()
    await runCommand('y = 2·x')
    expect(scene().log.at(-1)?.kind, scene().log.at(-1)?.text).toBe('result')
    scene().newScene()
    scene().clearLog()
    await runCommand('x·2 = 6')
    expect(scene().log.at(-1)?.text).toContain('x = 3')
    scene().newScene()
    scene().clearLog()
    await runCommand('A = <1, 2>')
    await runCommand('y = A·x')
    expect(scene().log.at(-1)?.kind).toBe('error')
  })
})

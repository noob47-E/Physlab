// How a name written against a bracket is read (part P-PARSE, item R1), the constant phi in a
// formula (item R2), and a number written against a pair (D1). Every expected value is the maths
// on paper, never what the code printed.
//
// R1. On paper x(x + 1) is x times (x + 1). mathjs reads a name before a bracket as a call, so
// preprocess passed x(x + 1) on as a call to a function called x: a graph of y = x(x + 1) said
// "Graph created" and drew nothing, the bar answered a(a + 1) with "'a' is not a function", and the
// Calculator could not do A(B + 1). A real call stays a call: a function mathjs knows (sin, sqrt,
// ln, log, abs …), a function named in the names a route passes (a graph of the scene: f(x) = x²,
// then f(2)), and — when nothing says otherwise — the letters a function is named with (f, g, h,
// and p, q, which PhysLab names its graphs after). Names are only ever passed, never picked up, so a
// line read without them (the Calculator, a Problem Sets answer, Lab Data) reads the same whatever
// the scene holds.
//
// R2. A graph knew only pi, e, tau and Infinity by name and read any other name from the scene:
// y = phi*x drew nothing while the bar answered phi = 1.618…, and a slider called tau was passed
// over for 2π. A formula now reads a name as the bar does: the scene's own value first, then the
// number mathjs knows by that name.
//
// D1. 2(3, 4) went to mathjs as a call of 2 and was refused; a number written against a pair is a
// product, as 2 × (3, 4) already was.
//
// The routes are the real ones: a line typed on the command bar (runCommand against the real scene
// store, as tests/commands.test.ts drives it), a graph as it is drawn (compileScalar on the graph's
// stored formula with the scene's values, as GraphView compiles it), a typed Problem Sets answer
// (checkExpressionPart), the Calculator (evaluateComp), File New / Open / undo / redo on the store,
// and under them the reading in math/expr.ts itself (preprocess, compileScalar).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MathNode } from 'mathjs'

// The SymPy worker cannot start here, and the stylesheet is not loaded (as in commands.test.ts).
vi.mock('../src/renderer/src/math/cas', () => ({
  cas: vi.fn(async (op: string) => ({ latex: `\\text{${op}}`, text: `${op}(x)`, numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {} },
  CAS_OPS: []
}))
vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { runCommand } from '../src/renderer/src/lang/commands'
import { blankSceneFile, scene, type LogEntry } from '../src/renderer/src/core/store'
import type { GraphObj } from '../src/renderer/src/core/types'
import { visualizeGraph } from '../src/renderer/src/core/visualize'
import { compileScalar, math, namedConstant, preprocess, sceneNames, type SceneNames } from '../src/renderer/src/math/expr'
import { fmtPrecise } from '../src/renderer/src/math/format'
import { checkExpressionPart } from '../src/renderer/src/questions/parts'
import { evaluateComp } from '../src/renderer/src/calc/engine'
import { resetGlobals } from './helpers/globals'

const PHI = (1 + Math.sqrt(5)) / 2

/**
 * Flip with the lang/commands.ts patch in P-PARSE's REPORT (the bar's parseNode passes sceneNames()
 * to preprocess, and core/evaluate.ts parseExpr does for a definition): until then the bar reads every
 * line without the scene's names, and the tests under it would fail for that reason alone.
 */
const BAR_READS_SCENE_NAMES = true

function fresh(): void {
  resetGlobals()
  scene().newScene()
  scene().clearLog()
  scene().setActiveSpace('vectors')
  scene().setViewMode('2d')
}

const run = async (...lines: string[]): Promise<LogEntry> => {
  for (const l of lines) await runCommand(l)
  return scene().log.at(-1) ?? ({ id: 0, input: '', kind: 'info' } as LogEntry)
}
const errors = (): string[] => scene().log.filter((l) => l.kind === 'error').map((l) => `${l.input}: ${l.text}`)
const graphs = (): GraphObj[] => Object.values(scene().objects).filter((o): o is GraphObj => o.type === 'graph')
/** A graph's formula as the viewport draws it: compiled with the scene's live values. */
const drawnAt = (g: GraphObj, vars: Record<string, number>): number => compileScalar(g.exprs[0], Object.keys(vars), () => scene().ev.scope)(vars)
const numberNamed = (name: string): number | undefined => {
  const c = scene().ev.values.get(scene().ev.names.get(name) ?? '')
  return c?.type === 'number' ? c.value : undefined
}
/** The value of a formula in x at x = 2, as a graph reads it, with no scene values. */
const at2 = (formula: string): number => compileScalar(formula, ['x'], () => ({}))({ x: 2 })
/** The names a parsed line calls as functions. */
const calls = (line: string, names?: SceneNames): string[] => {
  const out: string[] = []
  math.parse(preprocess(line, names)).traverse((n: MathNode) => {
    if (n.type === 'FunctionNode') out.push((n as MathNode & { fn: { name: string } }).fn.name)
  })
  return out
}
const named = (values: string[], functions: string[] = []): SceneNames => ({ values: new Set(values), functions: new Set(functions) })
const expressionPart = (answer: string, symbols = ['x']) => ({ type: 'expression' as const, prompt: '', answer, symbols, marks: 1 })

describe('R1 a letter written against a bracket is a product, as on paper', () => {
  it('reads x(x + 1), 2x(x + 1) and t(t + 1) as products', () => {
    expect(at2('x(x + 1)')).toBe(6)
    expect(at2('2x(x + 1)')).toBe(12)
    expect(compileScalar('t(t + 1)', ['t'], () => ({}))({ t: 2 })).toBe(6)
    // Already a product before: the brackets round x are what x(x + 1) now means.
    expect(at2('(x)(x + 1)')).toBe(6)
    expect(at2('x*(x + 1)')).toBe(6)
  })

  it('reads a run of brackets, and a letter between brackets, the same way', () => {
    expect(at2('x(x + 1)(x + 2)')).toBe(24)
    expect(at2('(x + 1)x(x - 1)')).toBe(6)
    expect(at2('x(x(x + 1))')).toBe(12)
  })

  it('works a power or a ! on the bracket first, as on paper', () => {
    // x(x + 1)² is x · 9 = 18 at x = 2, not (x(x + 1))² = 36.
    expect(at2('x(x + 1)^2')).toBe(18)
    expect(at2('x(x + 1)²')).toBe(18)
    expect(at2('x(x + 1)!')).toBe(12)
    expect(at2('-x(x + 1)')).toBe(-6)
    // The product is one factor under a division, as 1/x y and 1/(x)(x + 1) already are: 1/(2 · 3).
    expect(at2('1/x(x + 1)')).toBeCloseTo(1 / 6, 15)
    // eˣ(x + 1), the slope of x eˣ: e² · 3 at x = 2, as e^x y is eˣ times y.
    expect(at2('e^x(x + 1)')).toBeCloseTo(3 * Math.exp(2), 13)
  })

  it('keeps the product whole beside × and ·', () => {
    expect(at2('2 × x(x + 1)')).toBe(12)
    expect(at2('x(x + 1) × 2')).toBe(12)
    expect(at2('x(x + 1) · 2')).toBe(12)
  })

  it('reads e, pi and theta before a bracket as the numbers they are', () => {
    expect(at2('e(x + 1)')).toBeCloseTo(3 * Math.E, 13)
    expect(at2('pi(2)')).toBeCloseTo(2 * Math.PI, 13)
    // r = θ(1 + θ), a spiral: θ is the polar graph's own letter.
    expect(compileScalar('theta(1 + theta)', ['theta', 't'], () => ({}))({ theta: 2, t: 0 })).toBe(6)
    // i on the bar is the unit vector, so i(2) is 2i.
    expect(math.evaluate(preprocess('i(2)'), { i: [1, 0, 0] })).toEqual([2, 0, 0])
  })

  it('takes a name whole, _ and digits included, as mathjs does: v_0(t + 1) and k1(x) multiply', () => {
    expect(compileScalar('v_0(t + 1)', ['t'], () => ({ v_0: 3 }))({ t: 2 })).toBe(9)
    expect(compileScalar('k1(x)', ['x'], () => ({ k1: 3 }))({ x: 2 })).toBe(6)
    expect(compileScalar('F_net(x)', ['x'], () => ({ F_net: 5 }))({ x: 2 })).toBe(10)
  })

  it('guard: a function mathjs knows is still called', () => {
    expect(at2('sin(x)')).toBe(Math.sin(2))
    expect(at2('sqrt(x + 2)')).toBe(2)
    expect(at2('abs(x - 5)')).toBe(3)
    expect(at2('|x - 5|')).toBe(3)
    expect(at2('ln(x)')).toBe(Math.log(2))
    expect(at2('log(100)')).toBe(2)
    expect(at2('exp(x)')).toBe(Math.exp(2))
    expect(at2('gamma(x + 1)')).toBe(2)
    expect(at2('√(x + 2)')).toBe(2)
    for (const line of ['sin(x)', 'sqrt(x + 2)', 'ln(x)', 'log(100)', 'abs(x)', 'gamma(x + 1)', 'pt(1, 2)', 'mag(x)', 'exp(x)', 're(x)']) {
      expect(preprocess(line), line).toBe(line)
    }
    expect(calls('2 × 3')).toEqual(['timesOrCross'])
    expect(calls('2 · 3')).toEqual(['dot'])
  })

  it('guard: a definition keeps its left side, and brackets holding a list are left as written', () => {
    for (const line of ['f(x) = x^2', 'g(t) = 3t + 1', 'h(x, y) = x + y', 'x(t) = 3t', 'A(1, 2)', 'f(x, y)', 'x(1, 2)']) expect(preprocess(line), line).toBe(line)
    expect(math.parse(preprocess('g(t) = 3t + 1')).type).toBe('FunctionAssignmentNode')
  })

  it('reads y = x(x + 1) as y equal to a product, and x(x + 1) = 6 as an equation, not as the definition of a function x', () => {
    expect(calls('y = x(x + 1)')).toEqual([])
    expect(calls('a = 2x(x + 1)')).toEqual([])
    // The bar takes an equation's two sides apart before reading them, as (left) - (right): x(x + 1) − 6
    // is 0 at x = 2 and x = −3, and 6 at x = 3.
    const sides = (x: number) => compileScalar('(x(x + 1)) - (6)', ['x', 'y'], () => ({}))({ x, y: 0 })
    expect([sides(2), sides(-3), sides(3)]).toEqual([0, 0, 6])
  })

  it('guard: f, g, h, p and q stay function letters, and a longer name a function, when no names are passed', () => {
    for (const line of ['f(2)', 'g(x + 1)', 'h(t)', 'p(2)', 'q(x)', 'f1(x)', 'ab(2)', 'sinn(x)', 'log_2(8)', 'f′(x)', 'ω(t + 1)', 'Φ(1.96)']) {
      expect(preprocess(line), line).toBe(line)
    }
    // On the bar phi(1.96) is the normal area Φ(1.96), so 2*phi(1.96) is never 2 × 1.618 × 1.96.
    expect(calls('2*phi(1.96)')).toEqual(['phi'])
  })

  it('reads the names it is given: a value multiplies the bracket, a function is called with it', () => {
    const scene1 = named(['p', 'r', 'mass', 'ω', 'A′'], ['k'])
    // p(1 + r), the money after a year at rate r: 100 × 1.05.
    expect(compileScalar('p(1 + r)', [], () => ({ p: 100, r: 0.05 }), scene1)({})).toBeCloseTo(105, 12)
    expect(compileScalar('mass(x + 1)', ['x'], () => ({ mass: 3 }), scene1)({ x: 2 })).toBe(9)
    expect(compileScalar('ω(x + 1)', ['x'], () => ({ ω: 3 }), scene1)({ x: 2 })).toBe(9)
    expect(math.evaluate(preprocess('A′(2)', scene1), { A: [1, 2, 0], 'A′': [3, 4, 0] })).toEqual([6, 8, 0])
    // A graph named k is a function, though k is one letter.
    expect(calls('k(x + 1)', scene1)).toEqual(['k'])
    // A value or a function wins over the letter rule both ways.
    expect(calls('f(x + 1)', named(['f']))).toEqual([])
    expect(calls('t2(x)', named([], ['t2']))).toEqual(['t2'])
    // A formula's own variables are values whatever else is passed: a Lab Data column called mass.
    expect(compileScalar('mass(v + 1)', ['mass', 'v'], () => ({}))({ mass: 2, v: 3 })).toBe(8)
  })

  describe('on the real routes', () => {
    beforeEach(fresh)

    it('the bar draws y = x(x + 1): 6 at x = 2', async () => {
      await run('y = x(x + 1)')
      expect(errors()).toEqual([])
      expect(graphs()).toHaveLength(1)
      expect(drawnAt(graphs()[0], { x: 2 })).toBe(6)
    })

    it('the bar draws the spiral r = θ(1 + θ): r = 6 at θ = 2', async () => {
      await run('r = θ(1 + θ)')
      expect(errors()).toEqual([])
      const g = graphs()[0]
      expect(g?.kind).toBe('polar')
      expect(compileScalar(g.exprs[0], ['theta', 't'], () => scene().ev.scope)({ theta: 2, t: 0 })).toBe(6)
    })

    it('the bar answers a(a + 1) = 6 for a = 2, and m(v − u) = 9 for m = 3, v = 5, u = 2', async () => {
      expect((await run('a = 2', 'a(a + 1)')).text).toBe('= 6')
      expect((await run('m = 3', 'v = 5', 'u = 2', 'm(v - u)')).text).toBe('= 9')
      expect(errors()).toEqual([])
    })

    it('reads a slider m before a bracket as the slider, as 5 m alone is 5 × m: 5 m(2) is 30 for m = 3', async () => {
      expect((await run('m = 3', '5 m(2)')).text).toBe('= 30')
      expect(errors()).toEqual([])
    })

    it('a slider defined as b = a(a + 1) is 6 for a = 2', async () => {
      await run('a = 2', 'b = a(a + 1)')
      expect(errors()).toEqual([])
      expect(numberNamed('b')).toBe(6)
    })

    it('guard: after f(x) = x², the bar still makes the graph f, and f(x + 1) and f(2) stay calls to f', async () => {
      await run('f(x) = x^2')
      expect(errors()).toEqual([])
      expect(graphs().map((g) => g.name)).toEqual(['f'])
      expect(calls('f(x + 1)', sceneNames())).toEqual(['f'])
      expect(calls('f(2)', sceneNames())).toEqual(['f'])
      // The bar has never worked a graph out at a number: f(2) is refused in words (P-GRAPH's sentence,
      // "f is a graph, so it cannot be used as a number in a formula yet"), and never read as f times 2.
      const last = await run('f(2)')
      expect(last.kind).toBe('error')
      expect(last.text).toMatch(/\bf is a graph\b/)
    })

    it('guard: a slider called sin or log leaves sin(30) and log(100) calls, refused as before', async () => {
      // What the bar did before this change, kept: the slider is made, and the call is refused.
      for (const [slider, line] of [['sin = 2', 'sin(30)'], ['log = 3', 'log(100)']]) {
        await run(slider)
        const last = await run(line)
        expect(last.kind, line).toBe('error')
        expect(last.text, line).toMatch(/is not a function/)
        expect(calls(line, sceneNames()), line).toEqual([line.slice(0, 3)])
      }
    })

    it("guard: the normal table still answers phi(1.96), Φ(1.96) and P(Z < 1.96), and P(A) is not answered", async () => {
      for (const line of ['phi(1.96)', 'Φ(1.96)', 'P(Z < 1.96)']) {
        const last = await run(line)
        expect(last.kind, line).toBe('result')
        expect(last.tex, line).toMatch(/0\.9750/)
      }
      // 2·Φ(1.96) is not worked by the table, and is refused — never 2 × 1.618 × 1.96 = 6.34.
      expect((await run('2*phi(1.96)')).kind).toBe('error')
      // PhysLab has no probability of an event: P(A) is refused in words, as before.
      const pa = await run('A = (1, 2)', 'P(A)')
      expect(pa.kind).toBe('error')
      expect(pa.text).not.toMatch(/Undefined|not a function|char \d/)
    })

    it('a typed Problem Sets answer x(x + 1) is marked right for x² + x, and x(x + 1)² for x³ + 2x² + x', () => {
      expect(checkExpressionPart('x(x+1)', expressionPart('x^2 + x'), {}).verdict).toBe('right')
      expect(checkExpressionPart('2x(x + 1)', expressionPart('2x^2 + 2x'), {}).verdict).toBe('right')
      expect(checkExpressionPart('x(x+1)^2', expressionPart('x^3 + 2x^2 + x'), {}).verdict).toBe('right')
      expect(checkExpressionPart('t(u - 4.9t)', expressionPart('u t - 4.9 t^2', ['t']), { u: 17 }).verdict).toBe('right')
      // guard: still wrong when it is wrong.
      expect(checkExpressionPart('x(x+1)', expressionPart('x^2 + 1'), {}).verdict).toBe('wrong')
    })

    it('the Calculator works A(B + 1) out as A × (B + 1)', () => {
      const ctx = { vars: { A: 2, B: 3 }, ans: 0, angle: 'deg' as const }
      expect(Number(evaluateComp('A(B+1)', ctx).value)).toBe(8)
      // guard: its own functions are still called.
      expect(Number(evaluateComp('Abs(-3)', ctx).value)).toBe(3)
    })
  })

  describe("the scene's names: recorded at every evaluation, read only where passed", () => {
    beforeEach(fresh)

    const values = () => [...sceneNames().values].sort()
    const functions = () => [...sceneNames().functions].sort()

    it('records the values and the graphs of the scene as it is, through File New, Open, undo and redo', async () => {
      await run('p = 100', 'mass = 3', 'A = (1, 2)', 'k(x) = x^2')
      expect(values()).toEqual(['A', 'mass', 'p'])
      expect(functions()).toEqual(['k'])
      const file = { ...blankSceneFile(), objects: scene().order.map((id) => scene().objects[id]) }
      scene().undo()
      expect(functions()).toEqual([])
      scene().undo()
      expect(values()).toEqual(['mass', 'p'])
      scene().redo()
      expect(values()).toEqual(['A', 'mass', 'p'])
      scene().newScene()
      expect([values(), functions()]).toEqual([[], []])
      scene().loadScene(file)
      expect([values(), functions()]).toEqual([['A', 'mass', 'p'], ['k']])
    })

    it('a slider p removed by undo makes p(2) a call again', async () => {
      await run('p = 100')
      expect(calls('p(2)', sceneNames())).toEqual([])
      scene().undo()
      expect(calls('p(2)', sceneNames())).toEqual(['p'])
    })

    it('a line read without names reads the same whatever the scene holds: the Calculator, Lab Data, Problem Sets', async () => {
      const lines = ['k(2)', 'p(2)', 'mass(2)', 'A(2)', 'x(x + 1)']
      const bare = lines.map((l) => preprocess(l))
      // A graph k and A, a slider p and mass: had the scene leaked in, k(2) and A(2) would be calls, p(2) and mass(2) products.
      await run('p = 100', 'mass = 3', 'k(x) = x^2', 'A(x) = 2x')
      expect(functions()).toEqual(['A', 'k'])
      expect(lines.map((l) => preprocess(l))).toEqual(bare)
      expect(Number(evaluateComp('A(B+1)', { vars: { A: 2, B: 3 }, ans: 0, angle: 'deg' }).value)).toBe(8)
      expect(compileScalar('k(x)', ['k', 'x'], () => ({}))({ k: 3, x: 2 })).toBe(6)
      expect(checkExpressionPart('p(1 + x)', expressionPart('p + p x'), { p: 2 }).verdict).toBe('right')
    })

    it("a scene object's own line reads the scene's names (core/evaluate.ts parseExpr): b = p(1 + r) is 105", async () => {
      await run('p = 100', 'r = 0.05', 'b = p(1 + r)')
      expect(errors()).toEqual([])
      expect(numberNamed('b')).toBeCloseTo(105, 12)
    })
  })

  describe.skipIf(!BAR_READS_SCENE_NAMES)('the command bar, once it passes the scene names (lang/commands.ts patch in REPORT)', () => {
    beforeEach(fresh)

    it('answers p(1 + 0.05) = 105 for a slider p = 100, and mass(2) = 6 for mass = 3', async () => {
      expect((await run('p = 100', 'p(1 + 0.05)')).text).toBe('= 105')
      expect((await run('mass = 3', 'mass(2)')).text).toBe('= 6')
      expect(errors()).toEqual([])
    })

    it('keeps k(2) a call to the graph k, as f(2) is', async () => {
      const f = await run('f(x) = x^2', 'f(2)')
      const k = await run('k(x) = x^2', 'k(2)')
      expect(k.kind).toBe(f.kind)
      // The same sentence with the graph's own name ("k is a graph, so it cannot be used as a number…").
      expect(k.text).toBe(f.text?.replace(/\bf\b/g, 'k'))
    })

    it('reads p(2) without the slider once undo has taken it away, and mass(2) after File New', async () => {
      await run('p = 100', 'undo')
      expect((await run('p(2)')).kind).toBe('error')
      await run('mass = 3')
      scene().newScene()
      expect((await run('mass(2)')).kind).toBe('error')
    })
  })
})

describe('D1 a number written against a pair is a product, as 2 × (3, 4) is', () => {
  beforeEach(fresh)

  it('the bar answers 2(3, 4) as (6, 8), the point 2 × (3, 4) gives, and 2.5(2, 4) as (5, 10)', async () => {
    const times = await run('2 × (3, 4)')
    const against = await run('2(3, 4)')
    expect(errors()).toEqual([])
    expect(against.tex).toBe(times.tex)
    expect(math.evaluate(preprocess('2(3, 4)'))).toEqual([6, 8, 0])
    expect(math.evaluate(preprocess('2.5(2, 4)'))).toEqual([5, 10, 0])
    expect(math.evaluate(preprocess('1e3(1, 2)'))).toEqual([1000, 2000, 0])
  })

  it('makes the point P = 2(3, 4) at (6, 8)', async () => {
    await run('P = 2(3, 4)')
    expect(errors()).toEqual([])
    const c = scene().ev.values.get(scene().ev.names.get('P') ?? '')
    expect(c?.type === 'point' ? c.p : null).toEqual([6, 8, 0])
  })

  it('guard: a name ending in a digit is still called with its pair — f2(1, 2), x2(1, 2), atan2(1, 1)', () => {
    expect(calls('f2(1, 2)')).toEqual(['f2'])
    expect(calls('x2(1, 2)')).toEqual(['x2'])
    expect(calls('atan2(1, 1)')).toEqual(['atan2'])
  })
})

describe('R2 phi is the golden ratio wherever a constant is read', () => {
  it('a formula reads phi as (1 + √5)/2', () => {
    expect(at2('phi*x')).toBeCloseTo(2 * PHI, 15)
    expect(at2('phi*x')).toBeCloseTo(1 + Math.sqrt(5), 15)
    expect(compileScalar('phi', [], () => ({}))({})).toBeCloseTo(PHI, 15)
  })

  it('names the numbers mathjs knows, for a check to share', () => {
    expect(namedConstant('phi')).toBeCloseTo(PHI, 15)
    expect(namedConstant('pi')).toBe(Math.PI)
    expect(namedConstant('e')).toBe(Math.E)
    expect(namedConstant('tau')).toBe(2 * Math.PI)
    expect(namedConstant('Infinity')).toBe(Infinity)
    for (const name of ['x', 'sin', 'm', 'toString', 'constructor', 'speedOfLight']) expect(namedConstant(name), name).toBeUndefined()
  })

  describe('on the real routes', () => {
    beforeEach(fresh)

    it('a graph of y = phi*x is drawn at 2φ for x = 2', () => {
      visualizeGraph('y = phi*x', ['phi*x'])
      expect(drawnAt(graphs()[0], { x: 2 })).toBeCloseTo(1 + Math.sqrt(5), 14)
    })

    it('the bar and a graph read phi alike — the golden ratio, then the slider phi = 2', async () => {
      const bar = await run('phi')
      const drawn = compileScalar('phi', [], () => scene().ev.scope)({})
      expect(drawn).toBeCloseTo(PHI, 15)
      expect(bar.text).toBe(`= ${fmtPrecise(PHI, scene().settings)}`)
      expect((await run('phi = 2', 'phi')).text).toBe('= 2')
      expect(compileScalar('phi*x', ['x'], () => scene().ev.scope)({ x: 2 })).toBe(4)
      expect(errors()).toEqual([])
    })

    it('a slider called tau is read as the slider, as the bar reads it: y = tau*x is 6 at x = 2 for tau = 3', async () => {
      await run('tau = 3', 'y = tau*x')
      expect(errors()).toEqual([])
      expect((await run('tau')).text).toBe('= 3')
      expect(drawnAt(graphs()[0], { x: 2 })).toBe(6)
    })

    it('guard: pi, e and tau with no slider of that name are the constants', () => {
      expect(compileScalar('pi + e + tau', [], () => scene().ev.scope)({})).toBeCloseTo(3 * Math.PI + Math.E, 14)
    })
  })
})

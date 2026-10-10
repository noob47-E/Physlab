// How typed maths is still misread: part P-PARSE, items R3 and R4 (the crew's parsing leads) and
// the H leads of the area hunt. Each describe is one lead checked against the code: every test in
// it fails until that lead is fixed, except the ones named "guard", which pass now and must keep
// passing — they hold a reading a careless fix would break. Every expected value is the maths on
// paper, recomputed by DeepSeek, never what the code printed.
//
// The routes are the real ones: a line typed on the command bar (runCommand against the real scene
// store, as tests/commands.test.ts drives it), a typed Problem Sets answer (checkAnswer,
// checkExpressionPart), the Calculator (evaluateInput with the LaTeX its keys write), a graph as it
// is drawn (compileScalar on the graph's stored line, as GraphView compiles it), and under each the
// reading in math/expr.ts itself (preprocess, splitArgs).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FunctionNode, MathNode } from 'mathjs'

// The SymPy worker cannot start here, and the stylesheet is not loaded (as in commands.test.ts).
vi.mock('../src/renderer/src/math/engine/sympy/worker', () => ({
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

import { compileScalar, math, preprocess, splitArgs } from '../src/renderer/src/math/expr'
import { runCommand } from '../src/renderer/src/lang/commands'
import { scene, type LogEntry } from '../src/renderer/src/core/store'
import type { SceneObject } from '../src/renderer/src/core/types'
import { cas } from '../src/renderer/src/math/engine/sympy/worker'
import { checkAnswer } from '../src/renderer/src/math/checkAnswer'
import { checkExpressionPart } from '../src/renderer/src/questions/parts'
import type { PQPart } from '../src/renderer/src/questions/pqjson'
import { evaluateInput } from '../src/renderer/src/calc/evaluateInput'
import { EXAMPLES } from '../src/renderer/src/panels/Examples'
import { resetGlobals } from './helpers/globals'

function fresh(): void {
  resetGlobals()
  scene().newScene()
  scene().clearLog()
  scene().setActiveSpace('vectors')
  scene().setViewMode('2d')
  vi.mocked(cas).mockClear()
}
beforeEach(fresh)

const run = async (...lines: string[]): Promise<LogEntry> => {
  for (const l of lines) await runCommand(l)
  return scene().log.at(-1) ?? ({ id: 0, input: '', kind: 'info' } as LogEntry)
}
const errors = (): string[] => scene().log.filter((l) => l.kind === 'error').map((l) => `${l.input}: ${l.text}`)
const named = (name: string): SceneObject | undefined => {
  const id = scene().ev.names.get(name)
  return id ? scene().objects[id] : undefined
}
const computedOf = (name: string) => scene().ev.values.get(scene().ev.names.get(name) ?? '')
const numberNamed = (name: string, value: number) => {
  expect(named(name)?.type, `${name} is a number`).toBe('number')
  const c = computedOf(name)
  expect(c?.type).toBe('number')
  if (c?.type === 'number') expect(c.value).toBeCloseTo(value, 8)
}
const vectorNamed = (name: string, comp: [number, number, number]) => {
  expect(named(name)?.type, `${name} is a vector`).toBe('vector')
  const c = computedOf(name)
  expect(c?.type).toBe('vector')
  if (c?.type === 'vector') c.comp.forEach((x, i) => expect(x).toBeCloseTo(comp[i], 6))
}
/** The value of the graph the bar drew, at `at`: its stored line compiled as GraphView compiles it. */
const drawn = (vars: string[], at: Record<string, number>): number => {
  const g = Object.values(scene().objects).find((o) => o.type === 'graph') as (SceneObject & { exprs: string[] }) | undefined
  expect(g, 'a graph was drawn').toBeDefined()
  return compileScalar(g!.exprs[0], vars, () => scene().ev.scope)(at)
}
/** The typed text as math/expr.ts reads it, worked out in the current angle mode (degrees here). */
const value = (typed: string, scope: Record<string, unknown> = {}): unknown => math.evaluate(preprocess(typed), { ...scope })
const expectVector = (v: unknown, comp: [number, number]) => {
  expect(Array.isArray(v), 'a vector').toBe(true)
  const a = v as number[]
  expect(a[0]).toBeCloseTo(comp[0], 8)
  expect(a[1]).toBeCloseTo(comp[1], 8)
}
const complexParts = (v: unknown): [number, number] => {
  const c = math.complex(v as never) as unknown as { re: number; im: number }
  return [c.re, c.im]
}
/** A typed Problem Sets number answer. */
const answer = (typed: string, v: number) => checkAnswer(typed, { key: 'a', label: 'A', value: v, tol: 1e-6 })
type ExpressionPart = Extract<PQPart, { type: 'expression' }>
/** A typed Problem Sets formula answer. */
const formula = (typed: string, ans: string, symbols: string[]) => {
  const part: ExpressionPart = { type: 'expression', prompt: 'Write the formula.', answer: ans, symbols, marks: 1 }
  return checkExpressionPart(typed, part, {})
}
/** The Calculator, given the LaTeX its keys write. */
const calculator = (mode: 'COMP' | 'CMPLX', latex: string) => evaluateInput(mode, latex, { vars: {}, ans: 0, angle: 'deg' })

// ---------------------------------------------------------------------------
// R3 (AGENTS.md "still open"; crew lead A01 "splitArgs breaks vectors in angle brackets")
// ---------------------------------------------------------------------------

describe('R3 splitArgs does not group <…>', () => {
  it('keeps a <…> vector whole as one argument', () => {
    expect(splitArgs('A, <1, 0>')).toEqual(['A', '<1, 0>'])
    expect(splitArgs('<3, 4>')).toEqual(['<3, 4>'])
    expect(splitArgs('<2, 0, 0>, <0, 3, 0>')).toEqual(['<2, 0, 0>', '<0, 3, 0>'])
    expect(splitArgs('A, <cos(t), sin(t)>')).toEqual(['A', '<cos(t), sin(t)>'])
    expect(splitArgs('⟨1, 2⟩, ⟨3, 4⟩')).toEqual(['⟨1, 2⟩', '⟨3, 4⟩'])
  })

  it('guard: a < or > that compares two things is not a bracket', () => {
    // A < with an operand before it is "less than". x < 3, x > 1 is two comparisons on paper,
    // though the text between its < and > looks like a vector to preprocess's <…> rule.
    expect(splitArgs('x < 0, -x, x')).toEqual(['x < 0', '-x', 'x'])
    expect(splitArgs('x^2, 0 < x < 2')).toEqual(['x^2', '0 < x < 2'])
    expect(splitArgs('x^2 < 4, x')).toEqual(['x^2 < 4', 'x'])
    expect(splitArgs('x < 3, x > 1')).toEqual(['x < 3', 'x > 1'])
  })

  it('cross(A, <1, 0>) on the bar works the cross product, as A × <1, 0> does', async () => {
    const last = await run('A = <3, 4>', 'cross(A, <1, 0>)')
    expect(errors()).toEqual([])
    // (3, 4, 0) × (1, 0, 0) = (0, 0, −4)
    expect(last.solution?.answers[0].tex).toContain('-4\\hat{k}')
  })

  // (angle(<1, 0>, <0, 1>) is left out: lang/commands.ts sends it to the geometry Angle command
  // whatever splitArgs does, as it asks only whether the two arguments are the names of vectors.)
  it('the word-form solvers take a <…> vector: resolve, magnitude, unit, dot', async () => {
    let last = await run('resolve(<3, 4>)')
    expect(last.tex).toMatch(/x = 3,\\quad [A-Z]y = 4/)
    last = await run('magnitude(<3, 4>)')
    expect(last.solution?.answers[0].tex).toBe('5')
    expect(last.solution?.answers[1].tex).toContain('53.13')
    last = await run('unit(<cos(30), sin(30)>)')
    expect(last.solution?.answers[0].tex).toContain('0.87\\hat{i}')
    expect(last.solution?.answers[0].tex).toContain('0.5\\hat{j}')
    last = await run('dot(<1, 2>, <3, 4>)')
    expect(last.solution?.answers[0].tex).toBe('11')
    expect(errors()).toEqual([])
  })

  it("the Torque lesson's last line runs: torque(<2, 0, 0>, <0, 3, 0>) is 6k̂", async () => {
    // Read from the lesson itself, so the test follows the lesson if its line changes.
    const lesson = EXAMPLES.find((e) => e.title.startsWith('Torque'))
    expect(lesson, 'the Torque lesson').toBeDefined()
    const line = lesson!.commands.find((c) => /^torque\(/i.test(c))
    expect(line, 'its torque(…) line').toBeDefined()
    for (const c of lesson!.commands) await runCommand(c)
    expect(errors()).toEqual([])
    const last = scene().log.at(-1)!
    expect(last.input).toBe(line)
    // r × F = (2, 0, 0) × (0, 3, 0) = (0, 0, 6), of size 6
    expect(last.solution?.answers[0].tex).toContain('6\\hat{k}')
    expect(last.solution?.answers[1].tex).toMatch(/^6\b/)
  })

  it('guard: an unclosed < is still refused', async () => {
    expect((await run('A = <3, 4>', 'cross(A, <1, 0)')).kind).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// B2b (the wave head's ruling on R3's rule): a number, a value or a closing bracket written against
// a vector multiplies it, as 2x is 2 × x — while a < and a > that compare stay comparisons. The
// crew's counterexamples to that rule, and the two faults its review of R3's fix found, are here.
// ---------------------------------------------------------------------------

describe('B2b a vector written against a value is multiplied by it', () => {
  it('reads 2<1, 2> as 2 × <1, 2> = <2, 4>, and 2 < 1 and x < 3 as before', () => {
    expect(preprocess('2<1, 2>')).toBe(preprocess('2 × <1, 2>'))
    expectVector(value('2<1, 2>'), [2, 4])
    expect(value('2 < 1')).toBe(false)
    expect(value('2<1')).toBe(false)
    expect(preprocess('x < 3')).toBe('x < 3')
    // × beside a vector keeps its meaning.
    expect(preprocess('A × <1, 0>')).toBe('timesOrCross(A, vec(1, 0))')
    expect(preprocess('2×<1,2>')).toBe('timesOrCross(2, vec(1,2))')
  })

  it("works inside a function's arguments", async () => {
    // |2<1, 2>| = |<2, 4>| = √(4 + 16) = √20
    expect(value('mag(2<1, 2>)')).toBeCloseTo(Math.sqrt(20), 10)
    expect(splitArgs('2<1, 2>, 3')).toEqual(['2<1, 2>', '3'])
    const last = await run('cross(2<1, 0>, <0, 1>)')
    expect(errors()).toEqual([])
    // (2, 0, 0) × (0, 1, 0) = (0, 0, 2)
    expect(last.solution?.answers[0].tex).toContain('2\\hat{k}')
  })

  it('guard: two comparisons in a list stay two comparisons', () => {
    // The > of a comparison always has an operand after it; a vector's > never does.
    const lists: [string, string[]][] = [
      ['x < 3, x > 1', ['x < 3', 'x > 1']],
      ['0 < x, y > 1', ['0 < x', 'y > 1']],
      ['x < 3, x > -1', ['x < 3', 'x > -1']],
      ['a < b, c > d', ['a < b', 'c > d']],
      ['x < 0, -x, x > 0, x', ['x < 0', '-x', 'x > 0', 'x']],
      ['x < 3, x > |y|', ['x < 3', 'x > |y|']]
    ]
    for (const [typed, parts] of lists) {
      expect(splitArgs(typed), typed).toEqual(parts)
      expect(preprocess(typed), typed).not.toContain('vec(')
    }
    expect(preprocess('piecewise(x < 0, -x, x > 0, x)')).toBe('piecewise(x < 0, -x, x > 0, x)')
  })

  it("the crew's counterexamples: a vector multiplied by a value, then added, measured or dotted", async () => {
    // 2<1, 2> + <3, 4> = <2, 4> + <3, 4> = <5, 8>
    expectVector(value('2<1,2> + <3,4>'), [5, 8])
    expect(value('|2<1,2>|')).toBeCloseTo(Math.sqrt(20), 10)
    expect(value('|2<1,2>| + 1')).toBeCloseTo(Math.sqrt(20) + 1, 10)
    // x = 3: x<1, 2> = <3, 6>; (x + 1)<1, 2> = <4, 8>; x<1, 2>·<3, 4> = <3, 6>·<3, 4> = 9 + 24 = 33
    expectVector(value('x<1,2>', { x: 3 }), [3, 6])
    expectVector(value('(x+1)<1,2>', { x: 3 }), [4, 8])
    expect(value('x<1,2>·<3,4>', { x: 3 })).toBeCloseTo(33, 10)
    // k = 2, t = 90 (degrees here): k<cos t, sin t> = 2<0, 1> = <0, 2>
    expectVector(value('k<cos(t), sin(t)>', { k: 2, t: 90 }), [0, 2])
    // 2|<3, 4>| = 2 × 5 = 10
    expect(value('2|<3,4>|')).toBeCloseTo(10, 10)
    // On the bar x is the graph's own variable (x = 3 draws the line x = 3), so the slider is k.
    await run('k = 3', 'B = k<1, 2>')
    expect(errors()).toEqual([])
    vectorNamed('B', [3, 6, 0])
  })

  it("the review's two faults: a vector's > ends an operand, and >= never closes a vector", () => {
    // The bar after |<3,4>|'s > closes the |…|, so the < after it compares, as in |x| < 3.
    expect(splitArgs('|<3,4>| < 3, |y| > 1')).toEqual(['|<3,4>| < 3', '|y| > 1'])
    expect(preprocess('|<3, 4>| < 3, |y| > 1')).toBe('mag(vec(3, 4)) < 3, mag(y) > 1')
    // >= compares, as <= does: <1, x >= 3> closes at its last >.
    expect(preprocess('<1, x >= 3>')).toBe('vec(1, x >= 3)')
  })
})

// ---------------------------------------------------------------------------
// R4 — the crew's parsing leads that are real and caused in math/expr.ts
// ---------------------------------------------------------------------------

describe('R4.1 π or θ against a letter fuses into one name', () => {
  it('reads πr², 2πr, rπ and rθ as products', () => {
    expect(value('πr^2', { r: 3 })).toBeCloseTo(28.2743338823, 8)
    expect(value('2πr', { r: 3 })).toBeCloseTo(18.8495559215, 8)
    expect(value('rπ', { r: 3 })).toBeCloseTo(9.4247779608, 8)
    expect(value('rθ', { r: 2, theta: 3 })).toBeCloseTo(6, 10)
  })

  it('the bar works out πr² and 2πr', async () => {
    await run('r = 3', 'a = πr^2', 'c = 2πr')
    expect(errors()).toEqual([])
    numberNamed('a', 28.2743338823)
    numberNamed('c', 18.8495559215)
  })

  it('the bar draws y = 2πx', async () => {
    // (The polar r = aθ is stored as "atheta" by lang/commands.ts itself, before this reading
    // runs: an outside cause, reported, not tested here.)
    await run('y = 2πx')
    expect(errors()).toEqual([])
    expect(drawn(['x'], { x: 2 })).toBeCloseTo(12.5663706144, 8)
  })

  it('a typed formula πr², 2πr or rθ is marked right', () => {
    expect(formula('πr^2', 'pi*r^2', ['r']).verdict).toBe('right')
    expect(formula('2πr', '2*pi*r', ['r']).verdict).toBe('right')
    expect(formula('rθ', 'r*theta', ['r', 'theta']).verdict).toBe('right')
  })
})

describe('R4.2 a superscript on a function name (sin⁻¹, sin²)', () => {
  it('reads sin⁻¹ as the inverse sine and sin² as the sine squared', () => {
    expect(value('sin⁻¹(0.5)')).toBeCloseTo(30, 10)
    expect(value('cos⁻¹(0.5)')).toBeCloseTo(60, 10)
    expect(value('tan⁻¹(1)')).toBeCloseTo(45, 10)
    expect(value('sin²(30)')).toBeCloseTo(0.25, 12)
  })

  it('guard: a superscript on a number or a bracket is still a power', () => {
    expect(value('3²')).toBe(9)
    expect(value('2⁻¹')).toBe(0.5)
    expect(value('(sin(30))²')).toBeCloseTo(0.25, 12)
  })

  it('the bar answers sin⁻¹(0.5) and sin²(30)', async () => {
    await run('s1 = sin⁻¹(0.5)', 's2 = sin²(30)')
    expect(errors()).toEqual([])
    numberNamed('s1', 30)
    numberNamed('s2', 0.25)
  })

  it('the bar draws y = sin²(x) + cos²(x) as the line y = 1', async () => {
    await run('y = sin²(x) + cos²(x)')
    expect(errors()).toEqual([])
    expect(drawn(['x'], { x: 0.7 })).toBeCloseTo(1, 12)
  })

  it('a typed answer sin⁻¹(0.5) and a typed formula sin²(x) + cos²(x) are marked right', () => {
    expect(answer('sin⁻¹(0.5)', 30).verdict).toBe('right')
    expect(formula('sin²(x) + cos²(x)', '1', ['x']).verdict).toBe('right')
  })
})

describe('R4.3 ∠ size with a unit of more than one word', () => {
  it('reads 10 kg m/s ∠ 30° and 10 N m at 30° as a vector of size 10 at 30°', () => {
    expectVector(value('10 kg m/s ∠ 30°'), [8.6602540378, 5])
    expectVector(value('10 kg m/s at 30°'), [8.6602540378, 5])
    expectVector(value('10 N m ∠ 30°'), [8.6602540378, 5])
  })

  it('the bar makes the momentum vectors p and q', async () => {
    await run('p = 10 kg m/s ∠ 30°', 'q = 10 kg m/s at 30°')
    expect(errors()).toEqual([])
    vectorNamed('p', [8.6602540378, 5, 0])
    vectorNamed('q', [8.6602540378, 5, 0])
  })
})

describe('R4.4 ∠ size given by a name or a bracket', () => {
  it('reads r ∠ 30° and (3 + 2) ∠ 30° as a vector of size 5 at 30°', () => {
    expectVector(value('r ∠ 30°', { r: 5 }), [4.3301270189, 2.5])
    expectVector(value('(3+2) ∠ 30°'), [4.3301270189, 2.5])
  })

  it('the bar makes A = r ∠ 30° from a number r, and B = (3 + 2) ∠ 30°', async () => {
    await run('r = 5', 'A = r ∠ 30°', 'B = (3+2) ∠ 30°')
    expect(errors()).toEqual([])
    vectorNamed('A', [4.3301270189, 2.5, 0])
    vectorNamed('B', [4.3301270189, 2.5, 0])
  })

  it('guard: a long word or sentence with no ∠ is read at once (the size rule once tried every split into unit words)', () => {
    for (const typed of ['kineticenergyofthebodyatthetopofthehill + 1', 'the ball goes up and then comes down quickly again and again', '10 abcdefghijklmnopqrstuvwxyzabcdefghij']) {
      const t = performance.now()
      try { preprocess(typed) } catch { /* only the time matters here */ }
      expect(performance.now() - t, typed).toBeLessThan(50)
    }
  })

  it('a size that is no number — a function or a point — is refused in words, never a vector of NaN', () => {
    expect(() => value('sin at 30')).toThrow(/size before ∠ must be a number/)
    expect(() => value('(1, 2) ∠ 30°')).toThrow(/size before ∠ must be a number/)
  })

  it('guard: a bracket written against a call is not taken for the size', () => {
    expect(() => value('sin(30) ∠ 30°')).toThrow()
    expect(preprocess('2 × r ∠ 30°')).toContain('polarVec(r, 30 deg)')
  })
})

// R5: a size in standard form with no number in front of its 10 — 10^(-5) ∠ 45°, as the keypad's
// 10ˣ key writes it — is the size 10⁻⁵. The rule took only a plain number before ∠, so the ")" in
// front of it left the line unread; the Vectors panel worked round it (sizeBeforeAngle, P-VEC2 R2-3).
describe('R5 ∠ size written as a power of ten', () => {
  // 10⁻⁵ at 45°: each part is 10⁻⁵ × cos 45° = 7.0710678119×10⁻⁶.
  const expectSmall = (v: unknown) => {
    expect(Array.isArray(v), 'a vector').toBe(true)
    const a = v as number[]
    expect(a[0] / 1e-5).toBeCloseTo(0.70710678119, 9)
    expect(a[1] / 1e-5).toBeCloseTo(0.70710678119, 9)
  }

  it('reads 1×10⁻⁵ ∠ 45°, 10^(-5) ∠ 45°, 10^-5 ∠ 45° and 10⁻⁵ at 45° as a vector of size 1×10⁻⁵ at 45°', () => {
    expectSmall(value('1×10⁻⁵∠45°'))
    expectSmall(value('10^(-5)∠45°'))
    expectSmall(value('10^-5 ∠ 45°'))
    expectSmall(value('10⁻⁵ at 45°'))
  })

  it('the bar makes E = 1×10⁻⁵∠45° and F = 10^(-5) ∠ 45°', async () => {
    await run('E = 1×10⁻⁵∠45°', 'F = 10^(-5) ∠ 45°')
    expect(errors()).toEqual([])
    vectorNamed('E', [7.0710678119e-6, 7.0710678119e-6, 0])
    vectorNamed('F', [7.0710678119e-6, 7.0710678119e-6, 0])
  })
})

describe('R4.5 nested absolute-value bars', () => {
  it('reads ||x| − 1| and |x − |y|| with the bars nested', () => {
    expect(value('||x|-1|', { x: -3 })).toBe(2)
    expect(value('||x| - 1|', { x: 0.5 })).toBe(0.5)
    expect(value('|x - |y||', { x: 1, y: -4 })).toBe(3)
  })

  it('guard: bars side by side are still two magnitudes', () => {
    expect(value('|a|·|b|', { a: -2, b: 3 })).toBe(6)
    expect(value('|a| + |b|', { a: -2, b: 3 })).toBe(5)
  })

  it('the bar works out ||a| − 1| and draws y = ||x| − 1|', async () => {
    await run('a = -3', 'b = ||a| - 1|')
    expect(errors()).toEqual([])
    numberNamed('b', 2)
    fresh()
    await run('y = ||x| - 1|')
    expect(errors()).toEqual([])
    expect(drawn(['x'], { x: -3 })).toBe(2)
    expect(drawn(['x'], { x: 0 })).toBe(1)
  })

  it('a typed answer ||−3| − 1| is marked right, and the Calculator\'s |x| key used twice gives 2', () => {
    expect(answer('||-3| - 1|', 2).verdict).toBe('right')
    const r = calculator('COMP', '\\left|\\left|-3\\right|-1\\right|')
    expect(r?.error).toBeUndefined()
    expect(r?.main).toBe('2')
  })
})

describe('R4.6 |z| of a complex number', () => {
  it('reads |3 + 4i| as the modulus 5', () => {
    expect(value('|3+4i|')).toBe(5)
  })

  it("the Calculator's |x| key gives |3 + 4i| = 5 in complex mode", () => {
    const r = calculator('CMPLX', '\\left|3+4i\\right|')
    expect(r?.error).toBeUndefined()
    expect(r?.main).toBe('5')
  })

  it('the bar works out |√−4| = 2, and a typed answer |3 + 4i| is marked right', async () => {
    await run('z1 = |sqrt(-4)|')
    expect(errors()).toEqual([])
    numberNamed('z1', 2)
    expect(answer('|3+4i|', 5).verdict).toBe('right')
  })
})

describe('R4.7 sec, csc and cot of a complex number', () => {
  it('works them out as 1/cos, 1/sin and cos/sin do', () => {
    // sec i = 1/cosh 1, csc i = −i/sinh 1, cot i = −i coth 1
    const sec = complexParts(value('sec(i)'))
    expect(sec[0]).toBeCloseTo(0.6480542737, 9)
    expect(sec[1]).toBeCloseTo(0, 12)
    const csc = complexParts(value('csc(i)'))
    expect(csc[0]).toBeCloseTo(0, 12)
    expect(csc[1]).toBeCloseTo(-0.8509181282, 9)
    const cot = complexParts(value('cot(i)'))
    expect(cot[0]).toBeCloseTo(0, 12)
    expect(cot[1]).toBeCloseTo(-1.3130352855, 9)
  })

  it('the Calculator in complex mode answers sec(i) as it answers cos(i)', () => {
    const r = calculator('CMPLX', '\\sec\\left(i\\right)')
    expect(r?.error).toBeUndefined()
    expect(complexParts(r?.value)[0]).toBeCloseTo(0.6480542737, 9)
  })
})

describe('R4.8 3 N × A takes N alone as the left operand', () => {
  it('takes the quantity 3 N as the left operand of ×', () => {
    const node = math.parse(preprocess('3 N × A'))
    const call = node.filter((n: MathNode) => n.type === 'FunctionNode' && (n as FunctionNode).fn.name === 'timesOrCross')[0] as FunctionNode | undefined
    expect(call, 'the × was read').toBeDefined()
    const left = call!.args[0].evaluate({}) as { toNumber: (u: string) => number }
    expect(left.toNumber('N')).toBe(3)
  })

  it('the bar makes F = 3 N × A from A = <3, 4>', async () => {
    await run('A = <3, 4>', 'F = 3 N × A')
    expect(errors()).toEqual([])
    vectorNamed('F', [9, 12, 0])
  })

  it('guard: ½mv² typed as 1/2 m × v^2 is still 9', async () => {
    await run('m = 2', 'v = 3', 'E = 1/2 m × v^2')
    expect(errors()).toEqual([])
    numberNamed('E', 9)
  })
})

// ---------------------------------------------------------------------------
// H — the area hunt's leads (DeepSeek + Gemini on math/expr.ts) that are real
// ---------------------------------------------------------------------------

describe('H1 ∛ without brackets', () => {
  it('reads ∛8, ∛-8 and ∛ 27 as cube roots', () => {
    expect(value('∛8')).toBeCloseTo(2, 12)
    expect(value('∛-8')).toBeCloseTo(-2, 12)
    expect(value('∛ 27')).toBeCloseTo(3, 12)
  })

  it('guard: ∛(8) is still 2', () => {
    expect(value('∛(8)')).toBeCloseTo(2, 12)
  })

  it('the bar works out ∛8 and ∛-8, and a typed answer ∛8 is marked right', async () => {
    await run('c1 = ∛8', 'c2 = ∛-8')
    expect(errors()).toEqual([])
    numberNamed('c1', 2)
    numberNamed('c2', -2)
    expect(answer('∛8', 2).verdict).toBe('right')
  })
})

describe('H2 √ of a number in e-notation', () => {
  it('reads √1e-3 as the root of 0.001, not √e − 3', () => {
    expect(value('√1e-3')).toBeCloseTo(0.0316227766, 10)
    expect(value('√1E-3')).toBeCloseTo(0.0316227766, 10)
  })

  it('guard: √2e3 is still the root of 2000', () => {
    expect(value('√2e3')).toBeCloseTo(44.7213595500, 8)
  })

  it('the bar works out √1e-3, and a typed answer √1e-3 is marked right', async () => {
    await run('s1 = √1e-3')
    expect(errors()).toEqual([])
    numberNamed('s1', 0.0316227766)
    expect(answer('√1e-3', 0.0316227766).verdict).toBe('right')
  })
})

// HELD for the next round (P-PARSE batch B7, not in the Pro-account queue): a real lead, proven by this
// failing test; it runs again when its batch is fixed.
describe('H3 mod in a drawn graph', () => {
  it('compiles x mod 3 as the modulo, positive for a negative x', () => {
    const f = compileScalar('x mod 3', ['x'], () => ({}))
    expect(f({ x: -5 })).toBe(1)
    expect(f({ x: -1 })).toBe(2)
  })

  it('guard: 5 mod 3 is still 2', () => {
    expect(compileScalar('x mod 3', ['x'], () => ({}))({ x: 5 })).toBe(2)
  })

  it('the bar draws y = x mod 3 at 1 for x = −5', async () => {
    await run('y = x mod 3')
    expect(errors()).toEqual([])
    expect(drawn(['x'], { x: -5 })).toBe(1)
  })
})

describe('H4 · between complex numbers', () => {
  it('multiplies two complex numbers, or one and a number, as × does', () => {
    const a = complexParts(value('sqrt(-4) · sqrt(-9)'))
    expect(a[0]).toBeCloseTo(-6, 12)
    expect(a[1]).toBeCloseTo(0, 12)
    const b = complexParts(value('(3+4i) · 2'))
    expect(b[0]).toBeCloseTo(6, 12)
    expect(b[1]).toBeCloseTo(8, 12)
  })

  it('the bar answers sqrt(-4) · sqrt(-9) = −6, as it answers the same line with ×', async () => {
    const last = await run('sqrt(-4) · sqrt(-9)')
    expect(errors()).toEqual([])
    expect(last.text).toBe('= -6')
  })
})

describe('H5 a space before a call\'s bracket beside × or ·', () => {
  it('reads 2 × sin (30), sin (30) × 2 and 2 · sqrt (4) with the call whole', () => {
    expect(value('2 × sin (30)')).toBeCloseTo(1, 12)
    expect(value('sin (30) × 2')).toBeCloseTo(1, 12)
    expect(value('2 · sqrt (4)')).toBeCloseTo(4, 12)
  })

  it('the bar works out 2 × sin (30), and a typed answer 2 × sin (30) is marked right', async () => {
    await run('h = 2 × sin (30)')
    expect(errors()).toEqual([])
    numberNamed('h', 1)
    expect(answer('2 × sin (30)', 1).verdict).toBe('right')
  })
})

describe('H6 atan2 of two lengths', () => {
  it('reads atan2(10 m, 5 m) as the angle of (5, 10)', () => {
    expect(value('atan2(10 m, 5 m)')).toBeCloseTo(63.4349488229, 8)
  })

  it('the bar works out atan2(10 m, 5 m)', async () => {
    await run('g1 = atan2(10 m, 5 m)')
    expect(errors()).toEqual([])
    numberNamed('g1', 63.4349488229)
  })
})

describe('H8 log with a base of a complex number', () => {
  it('works out log(2, i), the log to base 2 of i, as ln i / ln 2', () => {
    const z = complexParts(value('log(2, i)'))
    expect(z[0]).toBeCloseTo(0, 12)
    expect(z[1]).toBeCloseTo(2.2661800709, 9)
  })

  it('the Calculator in complex mode answers log₂(i)', () => {
    const r = calculator('CMPLX', '\\log_{2}\\left(i\\right)')
    expect(r?.error).toBeUndefined()
    const z = complexParts(r?.value)
    expect(z[0]).toBeCloseTo(0, 12)
    expect(z[1]).toBeCloseTo(2.2661800709, 9)
  })

  it('guard: log₂(8) is still 3', () => {
    expect(calculator('CMPLX', '\\log_{2}\\left(8\\right)')?.main).toBe('3')
  })
})

// The command bar (lang/commands.ts) is the app's primary input, and until now nothing tested it
// end to end: each solver had its own tests, and the routing from a typed line to the right one
// had none. These run real lines through runCommand against the real scene store, no DOM.
//
// Two things are mocked. The SymPy worker cannot start here, so `cas` records what it was asked
// and answers with a stand-in; and the stylesheet is not loaded, so colours fall back.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import katex from 'katex'

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

import { HELP, runCommand } from '../src/renderer/src/lang/commands'
import { QUICK_EXAMPLES } from '../src/renderer/src/ui/quickExamples'
import { scene, type LogEntry } from '../src/renderer/src/core/store'
import type { GraphObj, SceneObject, VectorObj } from '../src/renderer/src/core/types'
import { cas } from '../src/renderer/src/math/engine/sympy/worker'
import { usePure } from '../src/renderer/src/math/pure/store'
import { parseNormalQuery } from '../src/renderer/src/math/pure/zscore'
import { latexToMath } from '../src/renderer/src/math/latexToMath'
import { polyRoots } from '../src/renderer/src/calc/engine'
import { calcNum } from '../src/renderer/src/calc/format'
import { compileScalar, math, preprocess, symbolsOf } from '../src/renderer/src/math/expr'
import { implicitSegments, sampleParametric, verticalLineXs } from '../src/renderer/src/math/graphs'
import { resetGlobals } from './helpers/globals'

// Read fresh each time: vitest hands the mock a new calls array between tests.
const casCalls = () => vi.mocked(cas).mock.calls
const forgetCasCalls = () => vi.mocked(cas).mockClear()

function fresh(): void {
  resetGlobals()
  scene().newScene()
  scene().clearLog()
  scene().setActiveSpace('vectors')
  // newScene keeps the view: without this the `3d` example passed by whatever the test before
  // it had left, and reordering the table would have made it prove nothing.
  scene().setViewMode('2d')
  forgetCasCalls()
}

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
const renders = (tex: string | undefined): boolean => {
  if (!tex) return true
  katex.renderToString(tex, { throwOnError: true })
  return true
}

/**
 * The names the help text uses without defining them. A student who types `equilibrium(A, B, C)`
 * has made A, B and C first; the preamble does the same before each example.
 */
const PREAMBLE = ['A = <3, 4>', 'B = <2, -1>', 'C = <-1, 2>', 'P = (0, 0)', 'Q = (4, 0)', 'S = (0, 3)', 'r = <2, 0>', 'F = <0, 5>', 'd = <3, 0>', 'v = <1, 0>', 'q = 2']

interface Example {
  line: string
  /** Extra lines the example needs beyond the preamble (Perpendicular(P, f) wants a line f). */
  setup?: string[]
  /** What must be true afterwards, beyond "no error entry" and "the LaTeX renders". */
  check: (last: LogEntry) => void
}

const vectorNamed = (name: string, comp: [number, number, number]) => {
  const o = named(name)
  expect(o?.type, `${name} is a vector`).toBe('vector')
  const c = computedOf(name)
  expect(c?.type).toBe('vector')
  if (c?.type === 'vector') c.comp.forEach((x, i) => expect(x).toBeCloseTo(comp[i], 3))
}
const pointNamed = (name: string, p: [number, number, number]) => {
  expect(named(name)?.type, `${name} is a point`).toBe('point')
  const c = computedOf(name)
  expect(c?.type).toBe('point')
  if (c?.type === 'point') c.p.forEach((x, i) => expect(x).toBeCloseTo(p[i], 3))
}
const madeA = (type: SceneObject['type']) => {
  const before = new Set(PREAMBLE.map((l) => l.split('=')[0].trim()))
  const made = Object.values(scene().objects).filter((o) => !before.has(o.name) && !o.auxiliary)
  expect(made.map((o) => o.type), `a ${type} was made`).toContain(type)
}
const graphsOfKind = (kind: GraphObj['kind']): GraphObj[] => Object.values(scene().objects).filter((o): o is GraphObj => o.type === 'graph' && o.kind === kind)
const stepsTitled = (last: LogEntry, title: RegExp) => expect(last.solution?.title, 'has steps').toMatch(title)

const HELP_EXAMPLES: Example[] = [
  { line: 'A = (3, 4)', check: () => pointNamed('A', [3, 4, 0]) },
  { line: 'A = <3, 4>', check: () => vectorNamed('A', [3, 4, 0]) },
  { line: 'A = 3i + 4j', check: () => vectorNamed('A', [3, 4, 0]) },
  {
    line: 'F = 10 N ∠ 30°',
    check: (last) => {
      vectorNamed('F', [8.66, 5, 0])
      expect((named('F') as VectorObj).unit).toBe('N')
      // The steps are about F, not the solver's default A.
      stepsTitled(last, /Resolve F/)
    }
  },
  {
    line: 'R = A + B',
    check: (last) => {
      vectorNamed('R', [5, 3, 0])
      expect((named('R') as VectorObj).def.kind, 'live, not a copy of the numbers').toBe('expr')
      stepsTitled(last, /R = A \+ B/)
    }
  },
  {
    line: 'A · B',
    check: (last) => {
      expect(last.text).toBe('= 2')
      stepsTitled(last, /Scalar product/)
    }
  },
  {
    line: 'A × B',
    check: (last) => {
      expect(last.tex).toContain('-11\\hat{k}')
      stepsTitled(last, /Vector product/)
      expect(last.visualize, 'offers a drawing').toBeTypeOf('function')
    }
  },
  {
    line: '|A|',
    check: (last) => {
      expect(last.text).toBe('= 5')
      stepsTitled(last, /Magnitude and direction of A/)
    }
  },
  {
    line: 'unit(A)',
    check: (last) => {
      expect(last.tex).toContain('0.6\\hat{i} + 0.8\\hat{j}')
      stepsTitled(last, /Unit vector along A/)
    }
  },
  {
    line: 'angle(A, B)',
    check: (last) => {
      expect(last.tex).toContain('79.7')
      stepsTitled(last, /Angle between A and B/)
    }
  },
  {
    line: 'proj(B, A)',
    check: (last) => {
      expect(last.tex).toContain('0.24\\hat{i} + 0.32\\hat{j}')
      stepsTitled(last, /Projection of B on A/)
    }
  },
  {
    line: 'components(10, 30)',
    check: (last) => {
      expect(last.tex).toBe('Ax = 8.66,\\quad Ay = 5')
      stepsTitled(last, /Resolve A/)
    }
  },
  {
    line: 'resultant(5, 5, 120)',
    check: (last) => {
      expect(last.tex).toContain('R = 5\\,\\text{N}')
      stepsTitled(last, /Resultant of two forces/)
    }
  },
  {
    line: 'equilibrium(A, B, C)',
    check: (last) => {
      expect(last.tex).toContain('-4\\hat{i} - 5\\hat{j}')
      stepsTitled(last, /equilibrium/)
    }
  },
  {
    line: 'torque(r, F)',
    check: (last) => {
      expect(last.tex).toContain('10\\hat{k}')
      stepsTitled(last, /Torque/)
    }
  },
  {
    line: 'work(F, d)',
    check: (last) => {
      expect(last.tex).toContain('W = 0')
      stepsTitled(last, /Work/)
    }
  },
  {
    line: 'magforce(q, v, B)',
    check: (last) => {
      expect(last.tex).toContain('-2\\hat{k}')
      stepsTitled(last, /Magnetic force/)
    }
  },
  {
    line: 'Triangle((0,0), (4,0), (0,3))',
    check: (last) => {
      madeA('polygon')
      expect(last.tex).toContain('triangle, } 3 \\text{ sides, area } 6')
    }
  },
  {
    line: 'Segment(P, Q)',
    check: (last) => {
      madeA('segment')
      expect(last.tex).toContain('length } 4')
    }
  },
  { line: 'Line(P, Q)', check: () => madeA('line') },
  {
    line: 'Circle(P, 3)',
    check: (last) => {
      madeA('circle')
      expect(last.tex).toContain('r = 3')
    }
  },
  {
    line: 'Midpoint(P, Q)',
    check: (last) => {
      madeA('point')
      expect(last.tex).toContain('(2, 0, 0)')
    }
  },
  { line: 'Perpendicular(P, f)', setup: ['f = Line(P, Q)'], check: () => madeA('line') },
  {
    line: 'Intersect(f, g)',
    setup: ['f = Line(P, Q)', 'g = Line(Q, S)'],
    check: (last) => {
      madeA('point')
      expect(last.tex).toContain('(4, 0, 0)')
    }
  },
  {
    line: 'Angle(P, Q, S)',
    check: (last) => {
      madeA('angle')
      expect(last.tex).toContain('36.87')
    }
  },
  { line: 'y = x^2 - 4', check: () => madeA('graph') },
  {
    line: 'f(x) = sin(x)',
    check: () => {
      madeA('graph')
      expect(named('f')?.type).toBe('graph')
    }
  },
  {
    line: 'x^2 + y^2 = 9',
    check: (last) => {
      madeA('graph')
      expect(last.text).toMatch(/Implicit curve/)
    }
  },
  {
    line: 'y > x^2',
    check: (last) => {
      madeA('graph')
      expect(last.text).toMatch(/Shaded region/)
    }
  },
  {
    line: 'r = 2cos(θ)',
    check: (last) => {
      madeA('graph')
      expect(last.text).toMatch(/Polar curve/)
    }
  },
  {
    line: 'curve(cos(t), sin(t), 0, 2π)',
    check: (last) => {
      madeA('graph')
      expect(last.text).toMatch(/Parametric curve/)
    }
  },
  {
    line: 'z = sin(x)cos(y)',
    check: (last) => {
      madeA('graph')
      expect(last.text).toMatch(/Surface/)
      expect(scene().viewMode).toBe('3d')
    }
  },
  {
    line: 'piecewise(x^2 from -3 to 0, x from 0 to 2, 2 from 2 to 4)',
    check: (last) => {
      const g = graphsOfKind('piecewise')
      expect(g).toHaveLength(1)
      expect(g[0].pieces).toEqual([
        { expr: 'x^2', from: -3, to: 0 },
        { expr: 'x', from: 0, to: 2 },
        { expr: '2', from: 2, to: 4 }
      ])
      expect(last.text).toMatch(/Piecewise curve created with 3 pieces/)
    }
  },
  {
    line: 'between(x^2, x + 2, -1, 2)',
    check: (last) => {
      const g = graphsOfKind('between')
      expect(g).toHaveLength(1)
      expect(g[0].exprs).toEqual(['x^2', 'x + 2'])
      expect([g[0].tMin, g[0].tMax]).toEqual([-1, 2])
      expect(graphsOfKind('explicit'), 'both curves drawn in full').toHaveLength(2)
      expect(last.text).toMatch(/from x = −1 to 2: 4\.5\./)
      expect(Object.values(scene().objects).find((o) => o.type === 'text')?.text).toBe('area = 4.5')
    }
  },
  {
    line: 'tangent(x^2, 1)',
    check: (last) => {
      expect(graphsOfKind('explicit').map((g) => g.name)).toContain('tangent')
      expect(last.text).toMatch(/Tangent drawn at x = 1\. Its slope is 2\./)
    }
  },
  {
    line: 'k = 2',
    check: () => {
      const k = named('k')
      expect(k?.type).toBe('number')
      expect(k?.type === 'number' && k.slider, 'a slider you can drag').toBeTruthy()
    }
  },
  {
    line: 'solve(x^2 - 5x + 6 = 0)',
    check: (last) => {
      expect(last.tex).toBe('x_1 = 3,\\quad x_2 = 2')
      expect(last.working, 'offers the working').toBeTypeOf('function')
      expect(casCalls(), 'solved offline, without the algebra engine').toHaveLength(0)
    }
  },
  {
    line: 'diff(x^3)',
    check: (last) => {
      expect(casCalls()).toEqual([['diff', { expr: 'x^3', var: 'x', order: 1, deg: true }]])
      expect(last.tex).toContain('\\frac{d}{dx}')
    }
  },
  {
    line: 'integrate(x^2, 0, 3)',
    check: (last) => {
      expect(casCalls()).toEqual([['integrate', { expr: 'x^2', var: 'x', lower: '0', upper: '3', deg: true }]])
      expect(last.tex).toContain('\\int_{0}^{3}')
    }
  },
  {
    line: 'factor(x^2-1)',
    check: (last) => {
      expect(last.tex).toBe('\\left(x - 1\\right)\\left(x + 1\\right)')
      expect(casCalls()).toHaveLength(0)
    }
  },
  {
    line: 'P(Z < 1.96)',
    check: (last) => {
      expect(last.tex).toBe('\\text{P(Z < 1.96)} = 0.9750')
      expect(last.working, 'offers the working').toBeTypeOf('function')
    }
  },
  {
    line: 'P(45 < X < 60), X ~ N(50, 5^2)',
    check: (last) => {
      expect(last.tex).toBe('\\text{P(45 < X < 60)} = 0.8185')
    }
  },
  {
    line: 'invnorm(0.975)',
    check: (last) => {
      expect(last.tex).toBe('\\text{z} = 1.960')
    }
  },
  {
    line: 'invnorm(0.9), X ~ N(50, 10^2)',
    check: (last) => {
      expect(last.tex).toBe('\\text{x} = 62.82')
    }
  },
  {
    line: 'prove(sin 2x = 2 sin x cos x)',
    check: (last) => {
      expect(last.tex).toBe('\\text{Proved}\\;\\sin 2x = 2 \\sin x \\cos x')
      expect(last.working, 'offers the working').toBeTypeOf('function')
      expect(usePure.getState().working?.title).toBe('Prove sin 2x = 2 sin x cos x')
      expect(casCalls(), 'proved offline, without the algebra engine').toHaveLength(0)
    }
  },
  { line: 'delete A', check: () => expect(named('A')).toBeUndefined() },
  {
    line: 'undo',
    check: () => {
      // q = 2 is the last line of the preamble, so it is what an undo takes back.
      expect(named('q'), 'the last thing made is gone').toBeUndefined()
      expect(scene().order).toHaveLength(PREAMBLE.length - 1)
    }
  },
  { line: 'clear', check: () => expect(scene().order).toEqual([]) },
  // 2d and paused are the defaults, so each is checked from the other state or it proves nothing.
  { line: '2d', setup: ['3d'], check: () => expect(scene().viewMode).toBe('2d') },
  { line: '3d', setup: ['2d'], check: () => expect(scene().viewMode).toBe('3d') },
  { line: 'play', check: () => expect(scene().playing).toBe(true) },
  { line: 'pause', setup: ['play'], check: () => expect(scene().playing).toBe(false) }
]

/**
 * A help line is examples separated by runs of spaces (or "or", or "/"), then a note in words.
 * Splitting it this way is what lets the guard below see every example on a line, not just one:
 * `dot(A, B)` appended to the products line used to slip through untested.
 */
function examplesOn(line: string): string[] {
  return line
    .trim()
    .split(/\s{2,}/)
    .filter((c) => c !== 'or')
    .flatMap((c) => (HELP_EXAMPLES.some((e) => e.line === c) ? [c] : c.split(' / ')))
}
/** One-word notes the help uses that could otherwise be read as commands. */
const NOTES = new Set(['point', 'vector'])
/** The bar's word commands take a name after a space, so they have no operator or bracket to be seen by. */
const WORD_COMMANDS = /^(delete|del|remove|help)\b/
const looksLikeCommand = (c: string): boolean => /[=·×|<>^]|\w\(/.test(c) || WORD_COMMANDS.test(c) || (/^[a-z0-9]+$/.test(c) && !NOTES.has(c))

describe('every example in the help text works', () => {
  beforeEach(fresh)

  it('is tested here: the list above is the help text, example for example', () => {
    const lines = HELP.split('\n').slice(1)
    expect(lines.length).toBeGreaterThan(10)
    const chunks = lines.flatMap(examplesOn)
    for (const e of HELP_EXAMPLES) expect(chunks, `help shows ${e.line}`).toContain(e.line)
    // And no example in the help is untested: one added to the text has to be added here too,
    // whether it is a new line or a sixth entry on the products line.
    const tested = new Set(HELP_EXAMPLES.map((e) => e.line))
    for (const c of chunks) if (!tested.has(c)) expect(looksLikeCommand(c), `untested example: ${c}`).toBe(false)
    // The splitter itself: a note is not mistaken for an example, and an example is not a note.
    expect(looksLikeCommand('live resultant (updates when you drag A or B)')).toBe(false)
    expect(looksLikeCommand('dot(A, B)')).toBe(true)
    expect(looksLikeCommand('redo')).toBe(true)
    expect(looksLikeCommand('delete A'), 'a word command with a name after it').toBe(true)
  })

  for (const e of HELP_EXAMPLES) {
    it(e.line, async () => {
      for (const l of [...PREAMBLE, ...(e.setup ?? [])]) await runCommand(l)
      expect(errors(), 'the preamble itself').toEqual([])
      scene().clearLog()
      forgetCasCalls()
      const last = await run(e.line)
      expect(errors()).toEqual([])
      for (const l of scene().log) expect(renders(l.tex), `renders: ${l.tex}`).toBe(true)
      e.check(last)
    })
  }

  it('shows the help itself when asked', async () => {
    const last = await run('help')
    expect(last.kind).toBe('info')
    expect(last.text).toBe(HELP)
    expect((await run('?')).text).toBe(HELP)
  })
})

describe('the quick examples work one after another in an empty drawing', () => {
  beforeEach(fresh)

  it('runs them in order without an error entry', async () => {
    for (const e of QUICK_EXAMPLES) {
      const last = await run(e.insert)
      expect(errors(), e.insert).toEqual([])
      expect(last.kind, e.insert).toBe('result')
      expect(renders(last.tex)).toBe(true)
    }
    vectorNamed('A', [3, 4, 0])
    vectorNamed('B', [2, -1, 0])
    vectorNamed('R', [5, 3, 0])
    expect(Object.values(scene().objects).some((o) => o.type === 'polygon')).toBe(true)
    expect(Object.values(scene().objects).some((o) => o.type === 'graph')).toBe(true)
  })

  it('gives the cross product example its promised steps', async () => {
    const cross = QUICK_EXAMPLES.find((e) => /Cross product/.test(e.desc))!
    expect(cross.desc).toMatch(/with steps/)
    const last = await run('A = <3, 4>', 'B = <2, -1>', cross.insert)
    expect(last.solution?.title).toMatch(/Vector product/)
    expect(last.tex).toContain('-11\\hat{k}')
  })

  it('solves the equation example offline', async () => {
    const last = await run(QUICK_EXAMPLES.find((e) => e.insert.startsWith('solve'))!.insert)
    expect(last.tex).toBe('x_1 = 2,\\quad x_2 = -2')
    expect(casCalls()).toHaveLength(0)
  })
})

describe('routing to the vector solvers', () => {
  beforeEach(async () => {
    fresh()
    await run('A = <3, 4>', 'B = <2, -1>')
    scene().clearLog()
  })

  it('sends angle(A, B) to the angle-between solver, not the geometry angle', async () => {
    const last = await run('angle(A, B)')
    expect(errors()).toEqual([])
    expect(last.solution?.title).toBe('Angle between A and B')
    expect(last.solution?.answers[0].tex).toContain('79.7')
    // No angle object was drawn: that is what Angle(P, Q, S) with three points does.
    expect(Object.values(scene().objects).some((o) => o.type === 'angle')).toBe(false)
  })

  it('sends resolve(A) to the components solver and resolve(10, 30) to the size-and-angle one', async () => {
    let last = await run('resolve(A)')
    expect(last.solution?.title).toBe('Resolve A into rectangular components')
    expect(last.tex).toBe('Ax = 3,\\quad Ay = 4')
    last = await run('resolve(10, 30)')
    expect(last.solution?.title).toBe('Resolve A into rectangular components')
    expect(last.tex).toBe('Ax = 8.66,\\quad Ay = 5')
  })

  it('reads the components of a 3-D vector straight off it: 3, 4, 5 for 3i + 4j + 5k', async () => {
    // The literal is not the student's A = <3, 4>, so it is worked under the next free letter.
    for (const line of ['components(3i + 4j + 5k)', 'resolve(3i + 4j + 5k)']) {
      const last = await run(line)
      expect(errors(), line).toEqual([])
      expect(last.solution?.title, line).toBe('Components of C')
      const byLabel = Object.fromEntries((last.solution?.answers ?? []).map((a) => [a.label, a.tex]))
      expect(byLabel.Cx, line).toBe('3')
      expect(byLabel.Cy, line).toBe('4')
      expect(byLabel.Cz, line).toBe('5')
      expect(byLabel['|C|'], line).toBe('7.07')
    }
  })

  it('names the result after the assignment, in the steps and the drawing', async () => {
    let last = await run('D = A - B')
    expect(last.solution?.title).toBe('D = A − B')
    last = await run('E = 2A')
    expect(last.solution?.title).toBe('E = 2A')
    last = await run('N = A × B')
    expect(last.solution?.title).toMatch(/Vector product/)
    expect(last.tex).toMatch(/^N = /)
    vectorNamed('N', [0, 0, -11])
  })

  it('gives a compound operand the answer without working that names the wrong vector', async () => {
    // The steps can only name a symbol, and fell back to a default letter: `(A + B) × A` was
    // titled "Vector product A×A", and `A × (A + B)` worked through a B that was not B.
    for (const line of ['(A + B) × A', 'A × (A + B)', 'A × B × A', '(A + B) · A']) {
      const last = await run(line)
      expect(errors(), line).toEqual([])
      expect(last.kind, line).toBe('result')
      expect(last.solution, line).toBeUndefined()
    }
    expect((await run('(A + B) × A')).tex).toContain('11\\hat{k}')
  })

  it('never lends a working the letter of a vector the student already has', async () => {
    // The fallback letter was fixed at A or B: `A × <1, 0>` worked through "B = 1i" while the
    // student's B was <2, −1>, and the word-form `cross(A + B, A)` was "Vector product A×A".
    // A literal or compound operand takes the first letter no object in the drawing has.
    const steps = (last: LogEntry) => (last.solution?.steps ?? []).map((st) => st.tex ?? '').join(' ')
    let last = await run('A × <1, 0>')
    expect(last.solution?.title).toBe('Vector product A×C')
    expect(steps(last)).toContain('\\vec{C} = 1\\hat{i}')
    expect(steps(last)).not.toContain('\\vec{B}')
    last = await run('cross(A + B, A)')
    expect(errors()).toEqual([])
    expect(last.solution?.title).toBe('Vector product C×A')
    expect(steps(last)).toContain('\\vec{C} = 5\\hat{i} + 3\\hat{j}')
    expect(last.tex).toContain('11\\hat{k}')
    expect((await run('dot(A + B, A)')).solution?.title).toBe('Scalar product C·A')
    expect((await run('unit(A + B)')).solution?.title).toBe('Unit vector along C')
    expect((await run('components(A + B)')).tex).toBe('Cx = 5,\\quad Cy = 3')
    // Two nameless operands get two different letters, and the result a third.
    await run('C = <0, 0, 1>')
    last = await run('cross(A + B, 2B)')
    expect(last.solution?.title).toBe('Vector product D×E')
    expect(steps(last)).toContain('\\vec{F} =')
    expect(errors()).toEqual([])
  })
})

describe('the × key', () => {
  beforeEach(async () => {
    fresh()
    await run('A = <3, 4>', 'B = <2, -1>')
    scene().clearLog()
  })

  it('is a cross product between vectors, with steps, and the result can be kept as an object', async () => {
    // Before: `A × B` printed a bare "[0, 0, -11]" with no steps, and `C = A × B` refused with
    // "C: not a number", because the × is parsed as timesOrCross and nothing downstream knew it.
    const last = await run('A × B')
    expect(last.tex).toContain('-11\\hat{k}')
    expect(last.solution?.title).toBe('Vector product A×B')
    await run('C = A × B')
    expect(errors()).toEqual([])
    vectorNamed('C', [0, 0, -11])
    expect((named('C') as VectorObj).def.kind).toBe('expr')
  })

  it('is ordinary multiplication between numbers and between a number and a vector', async () => {
    expect((await run('2 × 3')).text).toBe('= 6')
    // Only with a number on the other side: `3 N × A` still fails, because the parser takes `N`
    // alone as the left operand of the × and then does not know it (math/expr.ts, infixToCall).
    expect((await run('3 N × 2')).text).toBe('= 6 N')
    // The way fmt prints a small number must read back as one number.
    expect((await run('2.5×10^3')).text).toBe('= 2500')
    const last = await run('2 × A')
    expect(last.tex).toContain('6\\hat{i} + 8\\hat{j}')
    expect(last.solution?.title).toBe('R = 2A')
    expect(errors()).toEqual([])
  })

  it('keeps a number × vector assignment as a live object, whichever side the number is on', async () => {
    // The bar resolved the × for its own answer but stored the line as typed, and the evaluator's
    // own × only knows vector × vector: `C = 2 × A` logged 2A and then errored with
    // "Expected a vector or point" on the object it had just made.
    let last = await run('C = 2 × A')
    expect(errors()).toEqual([])
    expect(last.solution?.title).toBe('C = 2A')
    vectorNamed('C', [6, 8, 0])
    expect((named('C') as VectorObj).def.kind, 'live, follows A').toBe('expr')
    await run('D = A × 2', 'G = 10 N ∠ 30°', 'H = 2 × G', 'k = 2 × 3')
    expect(errors()).toEqual([])
    vectorNamed('D', [6, 8, 0])
    vectorNamed('H', [17.321, 10, 0])
    expect(computedOf('k')).toEqual({ type: 'number', value: 6 })
    last = await run('A = <1, 1>')
    expect(errors()).toEqual([])
    vectorNamed('C', [2, 2, 0])
    vectorNamed('D', [2, 2, 0])
    expect(last.kind).toBe('result')
  })

  it('works inside a bigger expression', async () => {
    const last = await run('(A × B) · A')
    expect(last.text).toBe('= 0')
    expect(errors()).toEqual([])
  })

  it('stores a definition exactly the way it was typed', async () => {
    // The whole parsed tree used to be written back when any × was a product, so the Properties
    // field showed `Z = 2 × A × B` as cross(2 * A, B); then a product × was spelt `*` because the
    // evaluator's × refused a number on one side. Now the evaluator reads every × the bar does.
    const def = (name: string) => (named(name) as VectorObj).def as { kind: string; expr?: string }
    await run('Z = 2 × A × B', 'H = 2 × 10^3 × A', 'k = 3 N × 2')
    expect(errors()).toEqual([])
    expect(def('Z').expr).toBe('2 × A × B')
    expect(def('H').expr).toBe('2 × 10^3 × A')
    expect((named('k') as { expr: string }).expr).toBe('3 N × 2')
    vectorNamed('Z', [0, 0, -22])
    vectorNamed('H', [6000, 8000, 0])
    expect(computedOf('k')).toEqual({ type: 'number', value: 6 })
    // And the stored text is live: the evaluator reads it back after A changes.
    await run('A = <1, 0>')
    expect(errors()).toEqual([])
    vectorNamed('Z', [0, 0, -2])
    vectorNamed('H', [2000, 0, 0])
    // A vector × vector definition is kept exactly as typed.
    await run('W = A × B')
    expect(def('W').expr).toBe('A × B')
  })

  it('is read the same way when a definition is edited in the Properties panel', async () => {
    // The panel's formula field hands the text straight to the evaluator, with no bar in between
    // to rewrite it: `2 × A` typed there used to fail with "Expected a vector or point", and
    // `2 × 3` in a number's field the same way, although the bar accepted both.
    await run('C = A', 'k = 1')
    const cId = scene().ev.names.get('C')!
    const kId = scene().ev.names.get('k')!
    scene().updateObject(cId, (d) => {
      if (d.type === 'vector' && d.def.kind === 'expr') d.def.expr = '2 × A'
    })
    scene().updateObject(kId, (d) => {
      if (d.type === 'number') d.expr = '2 × 3 × 4'
    })
    expect([...scene().ev.errors.values()]).toEqual([])
    vectorNamed('C', [6, 8, 0])
    expect(computedOf('k')).toEqual({ type: 'number', value: 24 })
    scene().updateObject(cId, (d) => {
      if (d.type === 'vector' && d.def.kind === 'expr') d.def.expr = 'A × B × 2'
    })
    expect([...scene().ev.errors.values()]).toEqual([])
    vectorNamed('C', [0, 0, -22])
  })
})

describe('sums of vectors', () => {
  beforeEach(fresh)

  it('shows the resultant steps, whether assigned or typed bare', async () => {
    // A hand-made object shaped like a SymbolNode had no compile(), so the throw was swallowed
    // and R = A + B never had a "Show steps" button.
    await run('A = <3, 4>', 'B = <2, -1>', 'C = <1, 1>')
    expect((await run('R = A + B')).solution?.title).toBe('Resultant R = A + B')
    expect((await run('A + B')).solution?.title).toBe('Resultant R = A + B')
    const three = await run('T = A + B + C')
    expect(three.solution?.title).toBe('Resultant T = A + B + C')
    vectorNamed('T', [6, 4, 0])
  })

  it("keeps its head-to-tail helpers out of the student's alphabet", async () => {
    // The hidden tail point used to be named from the shared A, B, C… pool, so after R = A + B
    // the help's own next line, C = <-1, 2>, silently replaced it and broke the drawing of B′.
    await run('A = <3, 4>', 'B = <2, -1>', 'R = A + B')
    const helpers = Object.values(scene().objects).filter((o) => o.auxiliary)
    expect(helpers.map((o) => o.type).sort()).toEqual(['point', 'vector'])
    expect(helpers.map((o) => o.name).sort()).toEqual(['B′', 'B′tail'])
    await run('C = <-1, 2>', 'equilibrium(A, B, C)')
    expect(errors()).toEqual([])
    vectorNamed('C', [-1, 2, 0])
    expect(named('B′tail')?.type).toBe('point')
    expect(Object.values(scene().objects).filter((o) => o.auxiliary)).toHaveLength(2)
  })
})

describe('Pure Math from the command bar', () => {
  beforeEach(fresh)

  it('hands the Working field LaTeX, not the linear form that was typed', async () => {
    await run('factor(6x^2-x-1)')
    const p = usePure.getState()
    expect(p.job).toBe('factor')
    expect(p.input).toBe('6x^2-x-1')
    // 6x^2 would arrive in the field as x^(2) with a stray bracket if the linear text went in.
    expect(p.inputLatex).toBe('6x^{2}-x-1')
    await run('solve(x^2 - 5x + 6 = 0)')
    expect(usePure.getState().inputLatex).toBe('x^{2}-5x+6=0')
    await run('hcf(12, 18)')
    expect(usePure.getState().inputLatex).toBe('12,\\ 18')
  })

  it('writes an answer label KaTeX can draw: x_1 as maths, HCF as a word', async () => {
    // \text{x_1} is a KaTeX parse error, so every solve line in the bar rendered red.
    let last = await run('solve(x^2 - 5x + 6 = 0)')
    expect(last.tex).toBe('x_1 = 3,\\quad x_2 = 2')
    expect(renders(last.tex)).toBe(true)
    last = await run('hcf(12, 18)')
    expect(last.tex).toBe('\\text{HCF} = 6')
    last = await run('divide((x^3-1)/(x-1))')
    expect(last.tex).toBe('\\text{Quotient}\\;x^{2} + x + 1,\\quad \\text{Remainder}\\;0')
    expect(renders(last.tex)).toBe(true)
    // The parser spells θ as "theta", so the subscript has to be split off a longer name too:
    // \text{theta_1} was the same parse error over again.
    for (const line of ['solve(θ^2 = 4)', 'solve(theta^2 = 4)']) {
      last = await run(line)
      expect(last.tex, line).toBe('\\theta_1 = 2,\\quad \\theta_2 = -2')
      expect(renders(last.tex), line).toBe(true)
    }
    last = await run('solve(x1 + 2 = 5)')
    expect(last.tex).toBe('\\text{x1} = 3')
    expect(renders(last.tex)).toBe(true)
    // Every Greek letter, not a favourite few: sigma and rho came out as the words.
    for (const [word, letter] of [['sigma', '\\sigma'], ['rho', '\\rho'], ['kappa', '\\kappa'], ['psi', '\\psi']]) {
      last = await run(`solve(${word}^2 = 4)`)
      expect(last.tex, word).toBe(`${letter}_1 = 2,\\quad ${letter}_2 = -2`)
      expect(renders(last.tex), word).toBe(true)
    }
    // A prime's label is the number itself, which is not worth printing twice.
    expect((await run('primes(7)')).tex).toBe('7')
    expect((await run('primes(12)')).tex).toBe('12 = 2^{2} \\times 3')
  })

  it('reads divide(a, b) and partial(a, b) as the fraction a over b', async () => {
    // Two arguments used to fall through to plain evaluation and answer `I don't know "x"`.
    let last = await run('divide(x^3-1, x-1)')
    expect(errors()).toEqual([])
    expect(last.tex).toContain('\\text{Quotient}\\;x^{2} + x + 1')
    expect(usePure.getState().inputLatex).toBe('\\frac{x^{3}-1}{x-1}')
    last = await run('partial(3x+5, (x+1)(x+2))')
    expect(errors()).toEqual([])
    // A single factor below the line is not bracketed (Fix 4): 2/(x + 1), not 2/((x + 1)).
    expect(last.tex).toContain('\\dfrac{2}{x + 1}')
  })

  it('says why it refused when there is no other engine to try', async () => {
    const last = await run('primes(x)')
    expect(last.kind).toBe('error')
    expect(last.text).toBe('Prime factors need a whole number, like 360.')
    expect(casCalls()).toHaveLength(0)
  })

  it('still answers what the calculator can when the step engine refuses', async () => {
    // complex(3, 4) is mathjs's own complex(re, im); logging the refusal as the end of the road
    // took away an answer the bar used to give.
    const last = await run('complex(3, 4)')
    expect(errors()).toEqual([])
    expect(last.text).toBe('= 3 + 4i')
    expect(casCalls()).toHaveLength(0)
  })

  it('asks for two arguments, in words, when divide is given three', async () => {
    const last = await run('divide(x^3-1, x-1, 3)')
    expect(last.kind).toBe('error')
    expect(last.text).toBe('divide(numerator, denominator) or divide(fraction)')
    expect(casCalls()).toHaveLength(0)
  })

  it('divides plain numbers with the calculator, as its own refusal promises', async () => {
    // The refusal said "the calculator will do that one" and then the bar stopped.
    const last = await run('divide(10, 2)')
    expect(errors()).toEqual([])
    expect(last.text).toBe('= 5')
    expect(last.input, 'the log quotes what was typed').toBe('divide(10, 2)')
    // The e of 2e3 is not a letter to solve for: it went to SymPy's apart for a 500.
    expect((await run('divide(2e3, 4)')).text).toBe('= 500')
    expect(casCalls()).toHaveLength(0)
    // Nor is pi, which the calculator answers at once and then offers exactly (the stand-in
    // algebra engine answers at once, and its exact form replaces the line a moment later).
    // The decimal beside it is in the student's precision (polish H16), no longer ten places.
    await run('divide(pi, 2)')
    // The exact form is a follow-up the engine sends a moment later: let it land.
    await new Promise((r) => setTimeout(r, 0))
    expect(scene().log.at(-1)!.tex).toMatch(/\\approx 1\.57$/)
    expect(casCalls()).toEqual([['exact', { expr: '(pi)/(2)', deg: true }]])
  })

  it('sends a fraction the step engine refuses to the algebra engine, the way the Working panel does', async () => {
    // The refusal used to be logged as the end of the road, although math/pure/store.ts maps
    // divide and partial to SymPy's apart.
    for (const line of ['divide(sin(x), x)', 'partial(sin(x), x)', 'partial((sin(x))/(x))']) {
      forgetCasCalls()
      const last = await run(line)
      expect(errors(), line).toEqual([])
      expect(casCalls(), line).toEqual([['apart', { expr: '(sin(x))/(x)', deg: true }]])
      expect(last.kind, line).toBe('result')
    }
  })

  it('sends what the step engine refuses on to the algebra engine, under any spelling', async () => {
    for (const line of ['factorise(sin(x)+1)', 'factorize(sin(x)+1)', 'factor(sin(x)+1)']) {
      forgetCasCalls()
      await run(line)
      expect(casCalls(), line).toEqual([['factor', { expr: 'sin(x)+1', deg: true }]])
      expect(errors(), line).toEqual([])
    }
    forgetCasCalls()
    await run('solve(x^3 - x = 0)')
    expect(casCalls()).toEqual([['solve', { eqs: ['x^3 - x = 0'], vars: [], deg: true }]])
  })

  it('refuses arithmetic on a normal probability in words, never answering part of the line', async () => {
    // "1 - P(Z < 1.96)" once logged 0.9750 — the P(Z < 1.96) alone, the "1 -" dropped.
    for (const line of ['1 - P(Z < 1.96)', '2*P(Z > 1.96)', 'invnorm(0.9)+3']) {
      scene().clearLog()
      const last = await run(line)
      expect(last.kind, line).toBe('error')
      expect(last.text, line).toMatch(/one probability at a time/)
      expect(last.tex ?? '', line).not.toMatch(/0\.9750|0\.0250|1\.282/)
    }
  })

  it('sends X ~ N(…) to the Maths field as \\sim, not a bare ~ (a LaTeX space that showed "X N(50, 5²)")', async () => {
    const last = await run('P(45 < X < 60), X ~ N(50, 5^2)')
    expect(last.tex).toBe('\\text{P(45 < X < 60)} = 0.8185')
    const latex = usePure.getState().inputLatex
    expect(latex).toMatch(/X\\sim N/)
    expect(latex.replace(/\\sim/g, '')).not.toMatch(/~/)
    // What the field holds reads back as the same question when the student runs it from there.
    expect(parseNormalQuery(latexToMath(latex))).toMatchObject({ kind: 'between', a: 45, b: 60, dist: { mean: 50, sd: 5 } })
    // x_1 reaches the field as the subscript x₁, not as the escaped text "x\_1".
    await run('P(x_1 < X < x_2) = 0.95, X ~ N(50, 10^2)')
    const pair = usePure.getState().inputLatex
    expect(pair).toMatch(/x_\{1\}<X<x_\{2\}/)
    expect(pair).not.toMatch(/\\_/)
    expect(parseNormalQuery(latexToMath(pair))).toMatchObject({ kind: 'inverse', tail: 'central', pair: true, p: 0.95 })
  })

  it('a lone normal question that cannot be read is refused in words, never handed to the calculator', async () => {
    // "P(X < 65)" once said '"X" does not exist yet. Create it first, for example X = <1, 2> …'.
    const x = await run('P(X < 65)')
    expect(x.kind).toBe('error')
    expect(x.text).toMatch(/^X needs its distribution after the probability, as in P\(X < 65\), X ~ N\(50, 10²\)/)
    const z = await run('P(Z < 1), X ~ N(50, 10^2)')
    expect(z.kind).toBe('error')
    expect(z.text).toMatch(/^Z is already standard/)
    expect(z.text).not.toMatch(/Unexpected operator/)
  })

  it("leaves a student's own function p alone: p(2) is p at 2, not a normal question", async () => {
    // The bar does not yet call a graphed function at a number (f(2) says "f is a graph, so it
    // cannot be used as a number in a formula yet" too, polish H24), so the proof is that p(2) goes
    // exactly where f(2) goes: to the calculator, never to the normal table or its refusal, and the
    // Working panel's job is left as it was. The two answers are the same but for the name.
    usePure.getState().setJob('factor')
    const f = await run('f(x) = x^2', 'f(2)')
    const p = await run('p(x) = x^2', 'p(2)')
    expect(p.input).toBe('p(2)')
    expect(p.kind).toBe(f.kind)
    expect(p.text).toBe(f.text?.replace(/\bf\b/g, 'p'))
    expect(`${p.tex ?? ''} ${p.text ?? ''}`).not.toMatch(/probability|normal|0\.\d{4}/i)
    expect(usePure.getState().job).toBe('factor')
  })
})

describe("the algebra engine's angle unit", () => {
  // newScene keeps the settings, so the mode a test switched to would otherwise leak into the next.
  beforeEach(() => {
    fresh()
    scene().setSettings({ angleUnit: 'deg' })
  })

  it("is the scene's angle mode, whichever door the question came through", async () => {
    // The bar sent the flag; the Working panel's SymPy fallback sent none, so in DEG mode
    // solve(sin(x) = 0.5) answered 30 from the bar and π/6 from the panel, on the same screen.
    const fromWorkingPanel = async () => {
      forgetCasCalls()
      usePure.getState().run('solve', 'sin(x) = 0.5')
      await new Promise((r) => setTimeout(r, 0))
      return casCalls()
    }
    expect(scene().settings.angleUnit).toBe('deg')
    await run('solve(sin(x) = 0.5)')
    expect(casCalls()).toEqual([['solve', { eqs: ['sin(x) = 0.5'], vars: [], deg: true }]])
    expect(await fromWorkingPanel()).toEqual([['solve', { eqs: ['sin(x) = 0.5'], deg: true }]])

    scene().setSettings({ angleUnit: 'rad' })
    forgetCasCalls()
    await run('solve(sin(x) = 0.5)')
    expect(casCalls()).toEqual([['solve', { eqs: ['sin(x) = 0.5'], vars: [], deg: false }]])
    expect(await fromWorkingPanel()).toEqual([['solve', { eqs: ['sin(x) = 0.5'], deg: false }]])
    // The exact-form lookup after a plain calculation goes through the same decision.
    forgetCasCalls()
    await run('divide(pi, 2)')
    expect(casCalls()).toEqual([['exact', { expr: '(pi)/(2)', deg: false }]])
    scene().setSettings({ angleUnit: 'deg' })
  })

  it('says so when calculus was done in degrees, and only then', async () => {
    // In DEG mode integrate(sin(x), 0, pi) is ≈0.048 where every textbook says 2: the calculator
    // follows a scientific calculator, but the line has to say which unit it used.
    const note = /\\text\{\(angles in degrees; switch to RAD for the textbook form\)\}/
    let last = await run('integrate(sin(x), 0, pi)')
    expect(last.tex).toMatch(note)
    expect(renders(last.tex)).toBe(true)
    last = await run('diff(cos(x))')
    expect(last.tex).toMatch(note)
    // No angle in it: nothing to say.
    last = await run('integrate(x^2, 0, 3)')
    expect(last.tex).not.toMatch(note)
    // Not calculus: sin(x) means the same thing whichever way it is solved.
    last = await run('simplify(sin(x)^2 + cos(x)^2)')
    expect(last.tex).not.toMatch(note)
    scene().setSettings({ angleUnit: 'rad' })
    last = await run('integrate(sin(x), 0, pi)')
    expect(last.tex).not.toMatch(note)
    scene().setSettings({ angleUnit: 'deg' })
  })
})

describe("the bar answers in the student's precision", () => {
  // Rule 4: the answer line used to print numbers at ten digits, vectors and points at four and
  // the decimal beside an exact form at six, whatever the settings said, so `1/3` read
  // 0.3333333333 next to a panel showing |A| = 5.00.
  const refuse = () => vi.mocked(cas).mockResolvedValueOnce({ error: 'not now', latex: '', text: '', numeric: null })
  beforeEach(() => {
    fresh()
    scene().setSettings({ decimals: 2, precisionMode: 'dp' })
  })

  it('for numbers, units, vectors, points and the decimal beside an exact form', async () => {
    await run('A = <1, 2>')
    refuse()
    expect((await run('1/3')).text).toBe('= 0.33')
    expect((await run('7/3 N')).text).toBe('= 2.33 N')
    expect((await run('A / 3')).tex).toContain('0.33\\hat{i} + 0.67\\hat{j}')
    expect((await run('(1/3, 2/3)')).tex).toBe('(0.33, 0.67, 0)')
    vi.mocked(cas).mockResolvedValueOnce({ latex: '\\sqrt{2}', text: 'sqrt(2)', numeric: { re: Math.SQRT2 } })
    expect((await run('simplify(sqrt(2))')).tex).toBe('\\sqrt{2} \\approx 1.41')
    // Significant figures keep their zeros, the way the panels do.
    scene().setSettings({ decimals: 3, precisionMode: 'sf' })
    refuse()
    expect((await run('2/3')).text).toBe('= 0.667')
    refuse()
    expect((await run('1/2')).text).toBe('= 0.500')
    expect((await run('A / 3')).tex).toContain('0.333\\hat{i} + 0.667\\hat{j}')
    scene().setSettings({ decimals: 2, precisionMode: 'dp' })
  })
})

describe('what the bar refuses, in words', () => {
  beforeEach(fresh)

  it('names the missing object and shows how to make it', async () => {
    const last = await run('R = A + B')
    expect(last.kind).toBe('error')
    expect(last.text).toMatch(/"A" does not exist yet/)
    expect(last.text).toMatch(/A = <1, 2>/)
  })

  it('says a bracket is missing rather than quoting the parser', async () => {
    const last = await run('Circle((0,0), 3')
    expect(last.kind).toBe('error')
    expect(last.text).not.toMatch(/Unexpected|token|parse/i)
  })

  it('refuses a reserved name', async () => {
    const last = await run('pi = 3')
    expect(last.kind).toBe('error')
    expect(last.text).toMatch(/reserved/)
  })

  it('reports a delete of nothing', async () => {
    expect((await run('delete Z')).text).toBe('Nothing with that name.')
  })
})

// ---------------------------------------------------------------------------
// The graph routes say what they drew, and only that (polish wave, part P-GRAPH: P1, DRAW, P4).
// Every route used to store the formula and announce it; the viewport compiles it later and, when
// it does not parse or has no real value anywhere, draws nothing without a word.
// ---------------------------------------------------------------------------

/** What one typed line left behind: its last log entry and the objects it added. */
async function typed(line: string): Promise<{ last: LogEntry; made: SceneObject[] }> {
  const before = new Set(Object.keys(scene().objects))
  const last = await run(line)
  return { last, made: Object.values(scene().objects).filter((o) => !before.has(o.id)) }
}

/** The parser's own words, or a number that is not one: never what a student is told. */
const PARSER_TALK = /Invalid left hand side|Undefined symbol|SyntaxError|NaN|\(char \d+\)|Value expected|Parenthesis \) expected|Unexpected (end|operator|type)|unsupported (function|operator|syntax)/

/**
 * A refused line: an error entry in words that claims nothing is on the screen ("cannot be drawn"
 * is a refusal, "drawn" on its own a claim), nothing added to the scene, and the student left in
 * the space and the view they typed it in — landInGraphing runs only once a graph exists for that
 * reason, and a z = line has no 3D view to show when it has no surface. Returns the text.
 */
function expectRefused(line: string, { last, made }: { last: LogEntry; made: SceneObject[] }): string {
  const text = last.text ?? ''
  expect(last.input, line).toBe(line)
  expect(last.kind, `${line} → ${text}`).toBe('error')
  expect(text.trim(), line).not.toBe('')
  expect(text, line).not.toMatch(/created|Shaded|Region shaded/)
  expect(text.replace(/\b(cannot|can't|could not|not) be drawn/g, ''), line).not.toMatch(/drawn/)
  expect(text, line).not.toMatch(PARSER_TALK)
  expect(made.map((o) => `${o.type} ${o.name}`), `${line}: nothing added`).toEqual([])
  expect(scene().activeSpace, `${line}: the student stays where they were`).toBe('vectors')
  expect(scene().viewMode, `${line}: the view stays 2D`).toBe('2d')
  return text
}

/** A line that drew: a result in words, no error entry, and exactly one new graph of the kind asked for. */
function expectDrawn(line: string, { last, made }: { last: LogEntry; made: SceneObject[] }, said: RegExp, kind: GraphObj['kind']): GraphObj {
  expect(errors(), line).toEqual([])
  expect(last.kind, `${line} → ${last.text}`).toBe('result')
  expect(last.text, line).toMatch(said)
  const graphs = made.filter((o): o is GraphObj => o.type === 'graph')
  expect(graphs.map((g) => g.kind), line).toEqual([kind])
  return graphs[0]
}

/**
 * Whether something a line made draws the vertical line x = r, sampled the way the viewport
 * samples it (render/GraphView.tsx): an implicit curve by marching squares, an equation in x alone
 * (no y in it) from the roots of its formula, touching ones included (verticalLineXs, which the
 * viewport draws it from), a parametric curve at its points, a geometry line from its direction.
 * The window is off-centre on purpose (−9.7 to 10.3, and 333 cells for marching squares) so that no
 * grid column falls exactly on a whole number. On such a column F = (x − 1)², which touches zero
 * without crossing it, reads as a sign change and draws a line; between columns it draws nothing,
 * as it does in most views on screen — so a repeated root drawn that way could not pass here by
 * luck. Polish P4 moved the equations in x alone to verticalLineXs (marching squares cannot draw
 * (x − 1)² = 0 at all), and this judges them the same way: a correction of the helper to what the
 * viewport now does, not a weaker check: a line at r must still be among the roots it finds.
 */
function drawsVerticalLineAt(r: number, made: SceneObject[]): boolean {
  const near = (v: number) => Math.abs(v - r) < 0.1
  const tall = (ys: number[]) => ys.length > 1 && Math.max(...ys) - Math.min(...ys) > 10
  const scope = () => scene().ev.scope
  return made.some((o) => {
    try {
      if (o.type === 'graph' && (o.kind === 'implicit' || o.kind === 'inequality')) {
        const F = compileScalar(o.exprs[0], ['x', 'y'], scope)
        if (o.kind === 'implicit' && !symbolsOf(math.parse(preprocess(o.exprs[0]))).includes('y')) return verticalLineXs((x) => F({ x, y: 0 }), -9.7, 10.3).some(near)
        const seg = implicitSegments((x, y) => F({ x, y }), -9.7, 10.3, -9.7, 10.3, 333, 333)
        const ys: number[] = []
        for (let i = 0; i + 1 < seg.length; i += 2) if (near(seg[i][0]) && near(seg[i + 1][0])) ys.push(seg[i][1], seg[i + 1][1])
        return tall(ys)
      }
      if (o.type === 'graph' && o.kind === 'parametric') {
        const fx = compileScalar(o.exprs[0], ['t'], scope)
        const fy = compileScalar(o.exprs[1], ['t'], scope)
        const pts = sampleParametric((t) => fx({ t }), (t) => fy({ t }), o.tMin ?? 0, o.tMax ?? 2 * Math.PI, 3000, Infinity).flat()
        return tall(pts.filter((p) => near(p[0])).map((p) => p[1]))
      }
      const c = scene().ev.values.get(o.id)
      if (c?.type === 'line' || c?.type === 'ray' || c?.type === 'segment') {
        const { p, d } = c.line
        return Math.abs(d[1]) > 0 && Math.abs(d[0]) <= 1e-9 * Math.abs(d[1]) && near(p[0])
      }
    } catch {
      return false
    }
    return false
  })
}

describe('a line that holds several relations is refused, never shaded (polish P1)', () => {
  beforeEach(fresh)

  // The owner typed the help's graph examples run together in Graphing's bar and was told
  // "Shaded region created." with nothing drawn: the inequality pattern takes the first > and its
  // guard refuses only when two more angle brackets remain, never for an = on either side. A line
  // with two = and no < or > went on to the calculator, which quoted mathjs: "Invalid left hand
  // side of assignment operator = (char 23)".
  const SEVERAL = 'That line holds several equations — type one at a time.'
  const RUN_TOGETHER = [
    'y = x^2 - 4 x^2 + y^2 = 9 y = sin(x) y > x^2 - 4 r = 2cos(3θ) z = sin(x)cos(y) k = 2',
    'y = x^2 - 4 x^2 + y^2 = 9',
    'y = 2x z = 3',
    'x^2 + y^2 = 9 y = sin(x)',
    // An = beside a < or > is two relations as well: y = x² > 3 drew the 0-or-1 step of "x² > 3"
    // as "Graph created", y > x = 2 shaded y > 2 (the slow evaluator reads the x = 2 inside as the
    // number 2), and x > 1 = y shaded nothing under "Shaded region created.".
    'y = x^2 > 3',
    'y > x = 2',
    'x > 1 = y'
  ]
  for (const line of RUN_TOGETHER) {
    it(`refuses "${line}" in a sentence and adds nothing`, async () => {
      expect(expectRefused(line, await typed(line))).toContain(SEVERAL)
    })
  }

  // 1 < x < 3 was stored as one inequality with the true-or-false of x < 3 inside it: no shading,
  // and a dashed line at the last grid column before x = 3, under "Shaded region created.". The
  // others drew a wrong picture without a word (x < 3 > 1 shaded x < 1, x <= 3 <= 5 shaded x ≤ 1)
  // or, with three signs, said 'I don't know "x"'. Each is two inequalities; one is drawn at a time.
  for (const line of ['1 < x < 3', 'y < x < 3', 'y >= x >= 1', 'x < 3 > 1', 'x <= 3 <= 5', '1 < x < 3 < 5']) {
    it(`refuses the chained inequality "${line}", asking for one inequality at a time`, async () => {
      expect(expectRefused(line, await typed(line))).toContain('one at a time')
    })
  }

  for (const line of ['y > sin(x', 'y < 2x +']) {
    it(`says why "${line}" cannot be drawn instead of announcing a shaded region`, async () => {
      expect(expectRefused(line, await typed(line))).toMatch(/That inequality cannot be drawn: \S/)
    })
  }

  it('reads ≥ and ≤ as the inequalities they are', async () => {
    // preprocess (math/expr.ts) turns ≥ and ≤ into >= and <=, but tryGraph looks for a relation in
    // the line as typed, so y ≥ 2x answered: I don't know "y". The Calculator writes its own
    // inequality answers with ≤ and ≥ (panels/calcModes.tsx), so its answer could not be graphed.
    for (const [line, op] of [['y ≥ 2x', '>='], ['x ≤ 3', '<=']] as const) {
      fresh()
      const g = expectDrawn(line, await typed(line), /^Shaded region created\./, 'inequality')
      expect(g.op, line).toBe(op)
    }
  })

  it('still shades a single inequality and draws a single equation', async () => {
    for (const [line, op] of [['y > x^2 - 4', '>'], ['x <= 3', '<='], ['y >= 2x', '>=']] as const) {
      fresh()
      const g = expectDrawn(line, await typed(line), /^Shaded region created\./, 'inequality')
      expect(g.op, line).toBe(op)
    }
    fresh()
    const { last, made } = await typed('x = 2')
    expect(last.kind).toBe('result')
    expect(drawsVerticalLineAt(2, made), 'x = 2 is the vertical line').toBe(true)
  })

  it('leaves assignments and vector literals alone', async () => {
    // A vector literal brings a < and a > of its own and an assignment an =: a refusal that only
    // counts the signs would turn away the commonest lines the bar has.
    expect((await run('k = 2')).tex).toBe('k = 2')
    expect(named('k')?.type).toBe('number')
    await run('f(x) = x^2')
    expect(named('f')?.type).toBe('graph')
    await run('A = <1, 2>', 'B = <2, -1, 3>')
    vectorNamed('A', [1, 2, 0])
    vectorNamed('B', [2, -1, 3])
    expect((await run('A × <1, 0>')).tex).toContain('-2\\hat{k}')
    expect(errors()).toEqual([])
    // cross(A, <1, 0>) is refused today for another reason (splitArgs cuts <1, 0> at its comma and
    // the vector solver parses "<1": "Value expected (char 1)"), so this only checks that it is not
    // taken for two relations.
    const last = await run('cross(A, <1, 0>)')
    expect(last.text ?? '').not.toMatch(/one at a time|several|inequality/)
    expect(graphsOfKind('inequality')).toEqual([])
  })

  it('names the inequalities of a chain, and of a line that separates them with a comma', async () => {
    expect(expectRefused('1 < x < 3', await typed('1 < x < 3'))).toContain('type one at a time: 1 < x, then x < 3.')
    fresh()
    // The < of y < x, y > 2 follows a name, so it is a sign and not the start of the vector <x, y>.
    expect(expectRefused('y < x, y > 2', await typed('y < x, y > 2'))).toContain('type one at a time: y < x, then y > 2.')
  })

  it('refuses "not equal" in words instead of drawing the factorial curve y! = x', async () => {
    // y != x was split at the = of its != and drew y! = x; y ≠ x answered I don't know "y".
    for (const line of ['y != x', 'y ≠ x']) {
      fresh()
      const text = expectRefused(line, await typed(line))
      expect(text, line).toMatch(/"not equal"/)
      expect(text, line).toContain('y < x or y > x')
    }
  })

  it('reads == as one equals sign too many, in words', async () => {
    // It answered "Value expected (char 1)".
    expect(expectRefused('y == x', await typed('y == x'))).toContain('type y = x.')
  })
})

describe('every graph route checks it has something to draw before it says so (polish DRAW)', () => {
  beforeEach(fresh)

  // Each of these was announced ("Surface created", "Polar curve created", …) and drew nothing:
  // no real value anywhere, or a formula that does not parse. `between` checked only that its area
  // was finite, and an area of 0 over a curve with no value passed.
  const NOTHING: { route: string; line: string }[] = [
    { route: 'surface', line: 'z = sqrt(-1 - x^2 - y^2)' },
    { route: 'surface', line: 'z = sin(x' },
    { route: 'polar', line: 'r = sqrt(-1 - θ)' },
    { route: 'parametric', line: 'curve(sqrt(-1 - t^2), t, 0, 1)' },
    { route: 'parametric', line: 'curve(t^2 +, t)' },
    { route: 'piecewise', line: 'piecewise(sqrt(x) from -3 to -1)' },
    { route: 'inequality', line: 'x^2 + y^2 < -1' },
    { route: 'implicit', line: 'x^2 + y^2 = -1' },
    { route: 'explicit', line: 'y = sqrt(-1 - x^2)' },
    // Refused already, but in the parser's words: "Parenthesis ) expected (char 7)".
    { route: 'explicit', line: 'y = sin(x' },
    { route: 'between', line: 'between(sqrt(-1 - x^2), x, 0, 1)' }
  ]
  for (const { route, line } of NOTHING) {
    it(`${route}: refuses "${line}", which has nothing to draw, in words`, async () => {
      expectRefused(line, await typed(line))
    })
  }

  // y = q·x already names the missing q (graphIfFunctionOfX); every other route made a graph that
  // read q as no value and drew nothing, `between` shaded an area of 0, and `tangent` said the
  // curve had no value at the point.
  const UNKNOWN: { route: string; line: string }[] = [
    { route: 'surface', line: 'z = q*x' },
    { route: 'polar', line: 'r = q*θ' },
    { route: 'parametric', line: 'curve(q*t, t)' },
    { route: 'piecewise', line: 'piecewise(q*x from 0 to 1)' },
    { route: 'inequality', line: 'x^2 + y^2 < q' },
    { route: 'implicit', line: 'x^2 + y^2 = q' },
    { route: 'between', line: 'between(x^2, q*x, 0, 1)' },
    { route: 'tangent', line: 'tangent(q*x, 1)' }
  ]
  for (const { route, line } of UNKNOWN) {
    it(`${route}: names the unknown q in "${line}" and says how to make it`, async () => {
      const text = expectRefused(line, await typed(line))
      expect(text).toMatch(/Unknown name "q"/)
      expect(text).toMatch(/Make a slider first, e\.g\. q = 1/)
    })
  }

  it('still draws a curve that is real somewhere, however small or far off the screen', async () => {
    // A check in one huge window alone would miss the small circle (a grid of ±1000 in a few
    // hundred cells steps right over it), and one in the usual window would miss the far ones.
    const DRAWN: [string, RegExp, GraphObj['kind']][] = [
      ['z = sin(x)cos(y)', /^Surface created/, 'surface'],
      ['r = 2cos(3θ)', /^Polar curve created/, 'polar'],
      ['curve(cos(t), sin(t))', /^Parametric curve created/, 'parametric'],
      ['piecewise(x^2 from -3 to 0, x from 0 to 2)', /^Piecewise curve created with 2 pieces/, 'piecewise'],
      ['x^2 + y^2 = 9', /^Implicit curve created/, 'implicit'],
      ['y = sin(x)', /^Graph created/, 'explicit'],
      ['y = sqrt(x - 50)', /^Graph created/, 'explicit'],
      ['x^2 + y^2 = 10000', /^Implicit curve created/, 'implicit'],
      ['(x - 0.3)^2 + (y - 0.3)^2 = 0.01', /^Implicit curve created/, 'implicit'],
      // sampleExplicit breaks a line this steep into single points (a sampler fault, H3); the
      // check judges by the values, so it is still a graph.
      ['y = 10000x', /^Graph created/, 'explicit'],
      // tau is a constant, not a slider to make: the route's own check exempted only pi and e.
      ['y = tau', /^Graph created/, 'explicit']
    ]
    for (const [line, said, kind] of DRAWN) {
      fresh()
      expectDrawn(line, await typed(line), said, kind)
    }
  })

  it('reads a slider the student has made, in every route', async () => {
    // The same lines that are refused above while q does not exist.
    const DRAWN: [string, RegExp, GraphObj['kind']][] = [
      ['z = q*x', /^Surface created/, 'surface'],
      ['r = q*θ', /^Polar curve created/, 'polar'],
      ['curve(q*t, t)', /^Parametric curve created/, 'parametric'],
      ['piecewise(q*x from 0 to 1)', /^Piecewise curve created with 1 piece/, 'piecewise'],
      ['x^2 + y^2 < q', /^Shaded region created/, 'inequality'],
      ['x^2 + y^2 = q', /^Implicit curve created/, 'implicit'],
      ['y = q*x', /^Graph created/, 'explicit']
    ]
    for (const [line, said, kind] of DRAWN) {
      fresh()
      await run('q = 2')
      expectDrawn(line, await typed(line), said, kind)
    }
  })

  it("makes a curve that is empty only at the slider's current value, and says so", async () => {
    // The student may be about to move k: x² + y² = k is a circle for every k above 0.
    await run('k = -1')
    expectDrawn('x^2 + y^2 = k', await typed('x^2 + y^2 = k'), /^Implicit curve created — at k = −1 there is nothing to draw; move k to see it\./, 'implicit')
    // No value of k helps here, so it is refused like the same line without a slider.
    fresh()
    await run('k = 2')
    expect(expectRefused('x^2 + y^2 = -1 - k^2', await typed('x^2 + y^2 = -1 - k^2'))).toContain('no point (x, y) makes its two sides equal')
  })

  it('says a curve that only touches zero cannot be drawn, and offers it without the square', async () => {
    // (x − y)² is 0 along y = x and positive on both sides: the sign-change plotter draws it only
    // where a grid line happens to fall on it. It is neither "created" nor said to have no points.
    const text = expectRefused('(x - y)^2 = 0', await typed('(x - y)^2 = 0'))
    expect(text).toContain('only touches 0 without crossing it')
    expect(text).toContain('type it without the square: x - y = 0.')
    expect(text).not.toMatch(/no point/)
    fresh()
    expectDrawn('x - y = 0', await typed('x - y = 0'), /^Implicit curve created/, 'implicit')
  })

  it('says in words why the viewport could never show a formula', async () => {
    const CASES: [string, RegExp][] = [
      // sampleExplicit leaves out every point higher than 10⁷, so this was "created" and invisible.
      ['y = 1e8', /too large to draw/],
      ['y = foo(x)', /does not know a function called "foo"/],
      ['y = A*x', /"A" is not a number/],
      // · beside a vector written out is a dot product, which a graph cannot draw.
      ['y = <1, 2>·x', /dot product of two vectors/]
    ]
    for (const [line, said] of CASES) {
      fresh()
      if (line.includes('A*')) await run('A = <1, 2>')
      expect(expectRefused(line, await typed(line)), line).toMatch(said)
    }
    // P-PARSE R1/R2: a letter written against a bracket is a product and phi is the golden ratio, so these two,
    // once refused here ("reads as a function called x", "cannot read phi"), are drawn.
    // P-GRAPH2 H32: · between numbers multiplies, as × does, so y = 2·x is drawn (it was refused as a dot product).
    for (const line of ['y = x(x + 1)', 'y = phi*x', 'y = 2·x']) {
      fresh()
      const drawn = await typed(line)
      expect(drawn.last.kind, `${line} → ${drawn.last.text}`).toBe('result')
      expect(drawn.made.some((o) => o.type === 'graph'), line).toBe(true)
    }
  })

  it('checks a formula the graph compiler hands to mathjs in bounded time', async () => {
    // square() is mathjs's, not one the compiler computes itself, so every value goes through the
    // slow evaluator; checked over every window this curve with no points took seconds.
    const t0 = performance.now()
    await typed('square(x) + y^2 = -5')
    expect(performance.now() - t0).toBeLessThan(2000)
  })
})

describe('an equation in x alone is solved, not plotted as a curve (polish P4)', () => {
  beforeEach(() => {
    fresh()
    scene().setSettings({ decimals: 2, precisionMode: 'dp' })
  })

  // x² + 4x + 13 = 0 went to the implicit plotter as a curve in x and y, which found no sign change
  // anywhere and drew nothing under "Implicit curve created.". Drawing nothing is right — no real x
  // makes it true — and saying "created" is not.
  const NO_REAL = 'No real x makes this true — it has no points on the graph.'

  it('x² + 4x + 13 = 0: no real x, and the complex roots the way the Calculator gives them', async () => {
    const text = expectRefused('x^2 + 4x + 13 = 0', await typed('x^2 + 4x + 13 = 0'))
    expect(text).toContain(NO_REAL)
    // The Calculator's polynomial solver (polyRoots with calcNum, panels/calcModes.tsx) shows the
    // pair as x1 = −2 − 3i and x2 = −2 + 3i; the bar says it once, with ±.
    expect(text).toContain('In complex numbers: x = −2 ± 3i')
  })

  it("x² + x + 1 = 0: the complex roots written exactly, as the = card writes them", async () => {
    // Whole-number coefficients: −1/2 ± (√3/2)i. This was −0.5 ± 0.87i at two decimal places (the scene's default) until
    // the bar wrote a quadratic's pair exactly too; the decimal pair is what calc/roots.ts gives with no exact coefficients.
    const text = expectRefused('x^2 + x + 1 = 0', await typed('x^2 + x + 1 = 0'))
    expect(text).toContain(NO_REAL)
    expect(text).toContain('In complex numbers: x = −1/2 ± (√3/2)i')
  })

  // The owner's own example, typed on the bar: the same roots as x² − 2x + 8 = 0, written exactly as a textbook
  // writes them, the way the = card says them (calc/exactComplex.ts). The bar used to say "x = 1 ± 2.65i" here.
  it('−x² + 2x − 8 = 0: the complex pair is written exactly, as the = card writes it', async () => {
    const text = expectRefused('-x^2 + 2x - 8 = 0', await typed('-x^2 + 2x - 8 = 0'))
    expect(text).toContain(NO_REAL)
    expect(text).toContain('In complex numbers: x = 1 ± √7 i')
  })

  // The same equation typed with the keypad's own signs and a superscript: the bar reads it the same way.
  it('x² − 2x + 8 = 0 typed with ² and − signs: the same exact pair', async () => {
    const text = expectRefused('x² − 2x + 8 = 0', await typed('x² − 2x + 8 = 0'))
    expect(text).toContain('In complex numbers: x = 1 ± √7 i')
  })

  // A rounded decimal coefficient (0.3333 is not a simple fraction) has no exact pair, so the bar keeps the decimal
  // pair it always said: the search's two decimal places, and no surd.
  it('x² + 0.3333x + 1 = 0: a rounded decimal keeps the decimal pair, with no surd', async () => {
    const text = expectRefused('x^2 + 0.3333x + 1 = 0', await typed('x^2 + 0.3333x + 1 = 0'))
    expect(text).toContain(NO_REAL)
    expect(text).toMatch(/In complex numbers: x = −0\.1[67] ± 0\.99i\.$/)
    expect(text).not.toContain('√')
  })

  // sin(x) = 2 never reached the equation at all: the f(x) = route took "sin" for the name of a
  // new function and drew the horizontal line y = 2, labelled sin.
  for (const line of ['sin(x) = 2', 'e^x = -1']) {
    it(`${line}: no real x, and no complex roots quoted for a formula that is not a polynomial`, async () => {
      const text = expectRefused(line, await typed(line))
      expect(text).toContain(NO_REAL)
      expect(text).not.toContain('In complex numbers')
    })
  }

  // Marching squares draws x² = 4 because x² − 4 changes sign at each root; a repeated root such as
  // (x − 1)² = 0 touches zero without crossing it and is drawn only where a grid column lands
  // exactly on x = 1.
  const REAL: { line: string; roots: number[]; shown: string[] }[] = [
    { line: 'x^2 = 4', roots: [-2, 2], shown: ['x = −2', 'x = 2'] },
    { line: '(x - 1)^2 = 0', roots: [1], shown: ['x = 1'] },
    { line: 'x^3 = x', roots: [-1, 0, 1], shown: ['x = −1', 'x = 0', 'x = 1'] },
    { line: '2x + 1 = 0', roots: [-0.5], shown: ['x = −0.5'] },
    { line: 'e^x = 2', roots: [Math.LN2], shown: ['x = 0.69'] }
  ]
  for (const { line, roots, shown } of REAL) {
    it(`${line}: a vertical line at each solution, and the solutions named smallest first`, async () => {
      const { last, made } = await typed(line)
      expect(errors()).toEqual([])
      expect(last.kind).toBe('result')
      const text = last.text ?? ''
      expect(text).toContain('vertical line')
      expect(text).not.toMatch(/Implicit curve/)
      const at = shown.map((s) => text.indexOf(s))
      expect(at.every((i) => i >= 0), `"${text}" names ${shown.join(', ')}`).toBe(true)
      expect([...at].sort((a, b) => a - b), `"${text}" names them smallest first`).toEqual(at)
      for (const r of roots) expect(drawsVerticalLineAt(r, made), `a vertical line at x = ${r}`).toBe(true)
    })
  }

  it("names the solutions in the student's precision", async () => {
    scene().setSettings({ decimals: 4, precisionMode: 'dp' })
    try {
      const { last } = await typed('x^2 = 2')
      expect(last.text).toContain('x = −1.4142')
      expect(last.text).toContain('x = 1.4142')
    } finally {
      scene().setSettings({ decimals: 2, precisionMode: 'dp' })
    }
  })

  it('x = 2 is still the vertical line x = 2', async () => {
    const { last, made } = await typed('x = 2')
    expect(last.kind).toBe('result')
    expect(drawsVerticalLineAt(2, made)).toBe(true)
  })

  it('makes one implicit graph with the formula as typed, and a line that has a y in it is still a curve', async () => {
    const g = expectDrawn('x^2 = 4', await typed('x^2 = 4'), /vertical line/, 'implicit')
    expect(g.exprs.map((e) => e.replace(/\s/g, ''))).toEqual(['(x^2)-(4)'])
    expectDrawn('x^2 = y', await typed('x^2 = y'), /^Implicit curve created/, 'implicit')
  })

  // The f(x) = route took the name in front of (x) for a new function's: sin(x) = 2 made a graph
  // named sin, the horizontal line y = 2. A name mathjs has as a function is never a definition.
  it('a built-in function in front of (x) is an equation about it, not the name of a new function', async () => {
    const CASES: [string, RegExp][] = [
      ['sin(x) = y', /^Implicit curve created/],
      ['cos(x) = y', /^Implicit curve created/],
      ['sqrt(x) = 2', /^The solution is x = 4 — drawn as a vertical line\./],
      ['ln(x) = 1', /^The solution is x = 2\.72 — drawn as a vertical line\./],
      ['abs(x) = 3', /^The solutions are x = −3 and x = 3 — each drawn as a vertical line\./]
    ]
    for (const [line, said] of CASES) {
      const { last, made } = await typed(line)
      expect(last.kind, `${line} → ${last.text}`).toBe('result')
      expect(last.text, line).toMatch(said)
      expect(made.map((o) => (o.type === 'graph' ? o.kind : o.type)), line).toEqual(['implicit'])
      expect(named(line.split('(')[0]), `${line} must not define a function of that name`).toBeUndefined()
    }
  })

  it('f(x) = x^2 and g(x) = sin(x) still define graphs of those names', async () => {
    await run('f(x) = x^2', 'g(x) = sin(x)')
    expect(errors()).toEqual([])
    for (const name of ['f', 'g']) {
      const g = named(name)
      expect(g?.type, name).toBe('graph')
      expect((g as GraphObj).kind, name).toBe('explicit')
    }
  })

  it('sin(x) = 0.5: the six solutions nearest 0, and that the pattern repeats', async () => {
    const { last, made } = await typed('sin(x) = 0.5')
    expect(last.kind).toBe('result')
    const text = last.text ?? ''
    // 30° and 150° in every turn.
    for (const s of ['x = −5.76', 'x = −3.67', 'x = 0.52', 'x = 2.62', 'x = 6.81', 'x = 8.9']) expect(text, s).toContain(s)
    expect(text.match(/x = /g), text).toHaveLength(6)
    expect(text).toContain('The pattern repeats every 6.28.')
    for (const r of [Math.PI / 6, (5 * Math.PI) / 6]) expect(drawsVerticalLineAt(r, made), `a vertical line at x = ${r}`).toBe(true)
  })

  it('many solutions that do not repeat are said to go on, not to repeat', async () => {
    const text = (await typed('x*sin(x) = 0')).last.text ?? ''
    // The seventh is as near as the sixth (±3π): both are listed, or neither.
    expect(text).toContain('The solutions nearest 0 are x = −9.42, x = −6.28, x = −3.14, x = 0, x = 3.14, x = 6.28 and x = 9.42')
    expect(text).toContain('There are more solutions further out.')
    expect(text).not.toContain('repeats')
  })

  it('lists them all, and says nothing of more, when the nearest are all there are', async () => {
    // sin x = x/10 has seven solutions, every one within 9: the seventh pairs with the sixth.
    const text = (await typed('sin(x) = x/10')).last.text ?? ''
    expect(text).toContain('The solutions are x = −8.42, x = −7.07, x = −2.85, x = 0, x = 2.85, x = 7.07 and x = 8.42 — each drawn as a vertical line.')
    expect(text).not.toMatch(/more solutions|repeats/)
  })

  it('takes a solution that is lost in rounding beside 0 for 0: sin x = x is x = 0, not x = −2×10⁻⁸', async () => {
    // x − sin x is exactly 0 for every |x| below 4×10⁻⁸, and the scan found the edge of that stretch.
    for (const line of ['sin(x) = x', 'x = sin(x)']) expect((await typed(line)).last.text, line).toContain('The solution is x = 0 — drawn as a vertical line.')
    // A solution that is really there so close to 0 stays: sin x = 5×10⁻⁷ is not 0.
    // Raised, as every sentence writes a power of ten (P-CALC H18): it was "x = 5×10^-7".
    expect((await typed('sin(x) = 5e-7')).last.text).toContain('x = 5 × 10⁻⁷')
  })

  it('names a repeated root exactly, at any precision and however often it is repeated', async () => {
    // polyRoots alone finds (x − 1)³ only to a few millionths: 0.999994 at six figures.
    scene().setSettings({ decimals: 10, precisionMode: 'sf' })
    try {
      for (const [line, says] of [
        ['(x - 1)^3 = 0', 'The solution is x = 1 '],
        ['(x - 2)^4 = 0', 'The solution is x = 2 '],
        ['(x + 1)^2 * (x - 3) = 0', 'The solutions are x = −1 and x = 3 '],
        ['x^3 - 6x^2 + 11x - 6 = 0', 'The solutions are x = 1, x = 2 and x = 3 ']
      ]) {
        expect((await typed(line)).last.text, line).toContain(says)
      }
    } finally {
      scene().setSettings({ decimals: 2, precisionMode: 'dp' })
    }
  })

  it('gives each pair of complex solutions once, with ±', async () => {
    const CASES: [string, string][] = [
      ['x^2 + 1 = 0', 'x = ±i'],
      ['x^2 + 9 = 0', 'x = ±3i'],
      ['x^2 + 2x + 2 = 0', 'x = −1 ± i'],
      ['x^4 + 1 = 0', 'x = −0.71 ± 0.71i and x = 0.71 ± 0.71i']
    ]
    for (const [line, says] of CASES) expect(expectRefused(line, await typed(line)), line).toContain(`In complex numbers: ${says}.`)
  })

  it("gives them in the numbers the Calculator's polynomial mode shows", async () => {
    // x⁴ + 3x² + 2 = (x² + 1)(x² + 2): the roots are ±i and ±1.41i.
    const text = expectRefused('x^4 + 3x^2 + 2 = 0', await typed('x^4 + 3x^2 + 2 = 0'))
    const settings = scene().settings
    for (const r of polyRoots([1, 0, 3, 0, 2]).filter((z) => z.im > 0)) {
      const b = calcNum(r.im, settings)
      expect(text, `${b}i`).toContain(b === '1' ? 'i' : `${b}i`)
    }
    expect(text).toContain('x = ±i and x = ±1.41i')
  })

  it('names no complex solution for a polynomial that has real ones', async () => {
    const text = (await typed('x^3 = 1')).last.text ?? ''
    expect(text).toContain('The solution is x = 1 — drawn as a vertical line.')
    expect(text).not.toContain('complex')
  })

  it('a slider in the equation keeps the lines moving with it', async () => {
    await run('k = 4')
    const { last, made } = await typed('x^2 = k')
    expect(last.text).toContain('The solutions are x = −2 and x = 2')
    const g = made.find((o): o is GraphObj => o.type === 'graph')
    expect(g?.exprs[0], 'the stored formula is the student\'s own, with k in it').toContain('k')
    // The viewport compiles the stored formula against the live scope: move k and the lines move.
    await run('k = 9')
    const F = compileScalar(g!.exprs[0], ['x', 'y'], () => scene().ev.scope)
    expect(verticalLineXs((x) => F({ x, y: 0 }), -9.7, 10.3).map((x) => Math.round(x * 1e6) / 1e6)).toEqual([-3, 3])
  })

  it('a slider that leaves it empty for now still makes the graph, and says to move it', async () => {
    await run('k = -1')
    const { last, made } = await typed('x^2 = k')
    expect(errors()).toEqual([])
    expect(last.text).toMatch(/^Drawn as a vertical line at each solution — at k = −1 there is nothing to draw; move k to see it\./)
    expect(made.map((o) => o.type)).toEqual(['graph'])
  })

  it('an equation true for every x, or along a stretch of x, has no lines to draw, and says so', async () => {
    for (const line of ['x = x', '0*x = 0', '(x + 1)^2 = x^2 + 2x + 1', 'sin(x)^2 + cos(x)^2 = 1']) {
      expect(expectRefused(line, await typed(line)), line).toContain('its two sides are equal for every x, so there is no line to draw')
    }
    // |x| = x holds from 0 on, and floor(x) = 2 on [2, 3): the stretch's ends are not its solutions.
    for (const line of ['abs(x) = x', 'floor(x) = 2']) {
      expect(expectRefused(line, await typed(line)), line).toContain('equal along a whole stretch of x, not at separate values')
    }
  })

  it('refuses in words a solution too far out to draw, and a formula that does not read', async () => {
    expect(expectRefused('x = 1e7', await typed('x = 1e7'))).toContain('it lies more than a million units from the origin, too far out to draw')
    expect(expectRefused('x^2 = foo', await typed('x^2 = foo'))).toContain('Unknown name "foo"')
    expect(expectRefused('x^2 + = 4', await typed('x^2 + = 4'))).toContain('the formula is incomplete')
    // P-PARSE R1: x(x + 1) is a product, as on paper, so this equation is solved (it was refused as a call of x).
    expect((await typed('x(x + 1) = 0')).last.text).toContain('The solutions are x = −1 and x = 0')
  })

  it('1/x = 0 has no real solution: a pole is not a root', async () => {
    expect(expectRefused('1/x = 0', await typed('1/x = 0'))).toContain(NO_REAL)
  })
})

// ---------------------------------------------------------------------------
// A command with an input left out (polish wave, part P-GRAPH: H4). Square(P), cross(A) and
// resultant(5) read an input that was never typed and showed the student JavaScript's own words —
// "Cannot read properties of undefined (reading 'trim')" — where Line(P) already said "Wrong inputs
// for Line"; resultant(, 5, 3) and add() went further and answered "R = undefined N" and
// "θ = undefined". Each is refused in the sentence the file already has for that command.
// ---------------------------------------------------------------------------

describe('a command missing an argument says so in words', () => {
  beforeEach(async () => {
    fresh()
    await run('P = (0, 0)', 'A = <1, 2>', 'r = <1, 0>', 'F = <0, 3>', 'v = <2, 0>')
  })

  /** The file's own refusals: a geometry command names itself, a vector-solver command is named as typed. */
  const geometry = (cmd: string) => `Wrong inputs for ${cmd}. Type "help" to see examples.`
  const solver = (typedAs: string) => `Wrong inputs for ${typedAs}. Type "help" for examples.`
  /** JavaScript talking about a value it never got: never what a student is told. */
  const JS_TALK = ['Cannot read properties', 'undefined', 'TypeError', '(reading']

  const MISSING: { line: string; says: string }[] = [
    // The lines traced to a helper that read an input never typed.
    { line: 'Square(P)', says: geometry('Square') },
    { line: 'Square()', says: geometry('Square') },
    { line: 'RegularPolygon(P)', says: geometry('RegularPolygon') },
    { line: 'cross(A)', says: solver('cross') },
    { line: 'dot(A)', says: solver('dot') },
    { line: 'subtract(A)', says: solver('subtract') },
    { line: 'projection(A)', says: solver('projection') },
    { line: 'torque(r)', says: solver('torque') },
    { line: 'work(F)', says: solver('work') },
    { line: 'magforce(1, v)', says: solver('magforce') },
    { line: 'resultant(5)', says: solver('resultant') },
    // The same fault, found while tracing those: a comma with nothing after it, no inputs at all,
    // one number short; an empty sum and balance that were answered as zero; a blank first input
    // that was answered "R = undefined N" or "Ax = undefined", or refused as `"" is not a point`.
    { line: 'Square(P, )', says: geometry('Square') },
    { line: 'magnitude()', says: solver('magnitude') },
    { line: 'twoforces(1, 2)', says: solver('twoforces') },
    { line: 'add()', says: solver('add') },
    { line: 'equilibrium()', says: solver('equilibrium') },
    { line: 'resultant(, 5, 3)', says: solver('resultant') },
    { line: 'components(, 30)', says: solver('components') },
    { line: 'cross(, A)', says: solver('cross') },
    { line: 'Square(, P)', says: geometry('Square') },
    // Already in words before: kept so they stay so.
    { line: 'Line(P)', says: geometry('Line') },
    { line: 'Circle(P)', says: geometry('Circle') },
    { line: 'Triangle((0,0), (4,0))', says: 'Triangle needs at least 3 points' },
    { line: 'Polygon(A)', says: 'Polygon needs at least 3 points' },
    { line: 'angle(A)', says: geometry('Angle') },
    { line: 'midpoint(A)', says: geometry('Midpoint') },
    // Not a command of PhysLab's own but the calculator's distance, which reaches math/expr.ts's
    // toV3 with nothing for its second point: its own sentence, in words.
    { line: 'distance(A)', says: 'Expected a vector or point' }
  ]

  for (const { line, says } of MISSING) {
    it(`${line} → ${says}`, async () => {
      const { last, made } = await typed(line)
      expect(last.input, line).toBe(line)
      expect(last.kind, `${line} → ${last.text ?? last.tex}`).toBe('error')
      expect(last.text, line).toBe(says)
      for (const words of JS_TALK) expect(last.text, line).not.toContain(words)
      expect(made.map((o) => `${o.type} ${o.name}`), `${line}: nothing added`).toEqual([])
    })
  }

  // The refusal must not reach a line that has all its inputs: Square, RegularPolygon, subtract,
  // projection, twoforces and magnitude had no test of their own, and add and equilibrium of a
  // single vector are a sum and a balance of one.
  const WHOLE = ['Square(P, (1, 0))', 'RegularPolygon(P, (1, 0), 6)', 'cross(A, r)', 'dot(A, r)', 'subtract(A, r)', 'projection(A, r)', 'torque(r, F)', 'work(F, r)', 'magforce(1, v, F)', 'resultant(5, 5, 120)', 'twoforces(1, 2, 90)', 'magnitude(A)', 'add(A)', 'equilibrium(A)', 'components(10, 30)']
  for (const line of WHOLE) {
    it(`${line} with all its inputs still answers`, async () => {
      const last = await run(line)
      expect(errors(), line).toEqual([])
      expect(last.input, line).toBe(line)
      expect(last.kind, line).toBe('result')
      for (const words of JS_TALK) expect(`${last.text ?? ''} ${last.tex ?? ''}`, line).not.toContain(words)
    })
  }
})

// ---------------------------------------------------------------------------
// Polish wave, part P-GRAPH, round 2 and the H items. Each block starts as a failing test.
// ---------------------------------------------------------------------------

/** The words of every text label a line left behind (Text(...) makes a core/types.ts TextObj). */
const textsOf = (made: SceneObject[]): string[] => made.filter((o) => o.type === 'text').map((o) => (o as SceneObject & { text: string }).text)

describe('a label may hold equals signs of its own (polish P1, round 2)', () => {
  beforeEach(fresh)

  // P1 counted the relation signs of the whole line, so the quoted words of a label were counted as
  // equations: Text("F = ma = 10 N") answered "That line holds several equations" and made nothing,
  // where it made a text label before P1.
  const SEVERAL = 'That line holds several equations — type one at a time.'
  const LABELS: [string, string][] = [
    ['Text("F = ma = 10 N")', 'F = ma = 10 N'],
    ['Text("a = b = c")', 'a = b = c'],
    ["Text('a = b = c')", 'a = b = c'],
    ['Text("1 < x < 3 is a chain")', '1 < x < 3 is a chain'],
    ['Text("y = x^2 and z = 3", (1, 2))', 'y = x^2 and z = 3']
  ]
  for (const [line, shown] of LABELS) {
    it(`${line} makes a label that reads "${shown}"`, async () => {
      const { last, made } = await typed(line)
      expect(errors(), line).toEqual([])
      expect(last.kind, `${line} → ${last.text}`).not.toBe('error')
      expect(textsOf(made), line).toEqual([shown])
    })
  }

  it('names a label made on the right of an = sign too', async () => {
    const { made } = await typed('L = Text("a = b = c")')
    expect(errors()).toEqual([])
    expect(textsOf(made)).toEqual(['a = b = c'])
    expect(made.find((o) => o.type === 'text')?.name).toBe('L')
  })

  it('still refuses several equations typed outside the quotes', async () => {
    const OWNERS_LINE = 'y = x^2 - 4 x^2 + y^2 = 9 y = sin(x) y > x^2 - 4 r = 2cos(3θ) z = sin(x)cos(y) k = 2'
    for (const line of [OWNERS_LINE, 'Text("a = b") y = 2x z = 3', 'y = 2x "a = b" z = 3']) {
      fresh()
      expect(expectRefused(line, await typed(line)), line).toContain(SEVERAL)
    }
  })
})

describe('a point or a vector cannot be named x, y or z, which a graph uses (polish H8)', () => {
  beforeEach(fresh)

  // x, y and z are kept for graphs on purpose (tryAssignment leaves them alone), so these lines
  // reached a graph route, which could only say "it has no real value for any x" (or "for any x and
  // y from −6 to 6, the square the 3D view shows"): true, and no help to a student who meant a point.
  const NAMED: [string, string][] = [
    ['y = (1, 2)', 'y is the letter a graph uses, so it cannot name a point — call it something else, e.g. P = (1, 2).'],
    ['y = <1, 2>', 'y is the letter a graph uses, so it cannot name a vector — call it something else, e.g. A = <1, 2>.'],
    ['z = (1, 2, 3)', 'z is the letter a graph uses, so it cannot name a point — call it something else, e.g. P = (1, 2, 3).'],
    ['z = <1, 2, 3>', 'z is the letter a graph uses, so it cannot name a vector — call it something else, e.g. A = <1, 2, 3>.'],
    // The third letter of the same fault: this was announced "Implicit curve created" with nothing on the screen.
    ['x = (1, 2)', 'x is the letter a graph uses, so it cannot name a point — call it something else, e.g. P = (1, 2).']
  ]
  for (const [line, says] of NAMED) {
    it(`${line} → ${says}`, async () => {
      expect(expectRefused(line, await typed(line)), line).toBe(says)
    })
  }

  it('suggests a letter that no object has, so the advice never moves a point the student made', async () => {
    await run('P = (5, 5)', 'A = <1, 1>')
    expect(expectRefused('y = (1, 2)', await typed('y = (1, 2)'))).toContain('e.g. Q = (1, 2).')
    expect(expectRefused('y = <1, 2>', await typed('y = <1, 2>'))).toContain('e.g. B = <1, 2>.')
  })

  it('says it for a sum of points or vectors the scene already holds', async () => {
    await run('A = <1, 2>', 'B = <0, 1>')
    expect(expectRefused('y = A + B', await typed('y = A + B'))).toContain('y is the letter a graph uses, so it cannot name a vector')
  })

  it('leaves a formula alone: only a value that is a point or a vector on its own is a name for one', async () => {
    await run('A = <1, 2>')
    // A is a vector in a formula of x: still a graph, still refused for its own reason.
    expect(expectRefused('y = A*x', await typed('y = A*x'))).toMatch(/"A" is not a number/)
    // k is the unit vector's letter on the bar, but in a graph it is a slider to make.
    fresh()
    expect(expectRefused('y = 2k', await typed('y = 2k'))).toMatch(/Unknown name "k"/)
    // A number named by a letter is still a graph, and a formula in x and y still an equation.
    fresh()
    expectDrawn('y = 2x', await typed('y = 2x'), /^Graph created/, 'explicit')
    fresh()
    // x = 3 is still one implicit graph; since polish P4 the bar names the line it is, not the jargon.
    expectDrawn('x = 3', await typed('x = 3'), /^The solution is x = 3 — drawn as a vertical line\./, 'implicit')
    fresh()
    expectDrawn('z = x*y', await typed('z = x*y'), /^Surface created/, 'surface')
  })

  it('still lets a point or a vector have any other name', async () => {
    await run('P = (1, 2)', 'A = <1, 2>')
    expect(errors()).toEqual([])
    expect(named('P')?.type).toBe('point')
    expect(named('A')?.type).toBe('vector')
  })
})

describe('a curve beyond the view is told it is too far out, not that it has no points (polish H10)', () => {
  beforeEach(fresh)

  // drawability tries windows up to ±10⁶ (the view never reaches further). A curve that only exists
  // beyond them was told "no point (x, y) makes its two sides equal" or "no real value for any x":
  // false, and no help to a student who can move the numbers in.
  const FAR = 'it lies more than a million units from the origin, too far out to draw'
  const OUT: [string, string][] = [
    // A circle of radius 6.4×10⁶: smaller than one cell of the widest window tried far out.
    ['x^2 + y^2 = 4.1e13', `That curve cannot be drawn: ${FAR}.`],
    // Radius 2×10⁶: past the widest window of the view, but only just.
    ['x^2 + y^2 = 4e12', `That curve cannot be drawn: ${FAR}.`],
    ['y = sqrt(x - 10^7)', `That graph cannot be drawn: ${FAR}.`],
    ['x^2 + y^2 > 4.1e13', `That inequality cannot be drawn: ${FAR}.`],
    ['x > 1e8', `That inequality cannot be drawn: ${FAR}.`],
    // Values within reach are all above ten million, but the line comes down to zero far out.
    ['y = x - 1e8', `That graph cannot be drawn: ${FAR}.`]
  ]
  for (const [line, says] of OUT) {
    it(`${line} → ${says}`, async () => {
      expect(expectRefused(line, await typed(line)), line).toBe(says)
    })
  }

  it('keeps its own sentence for a curve that has no points anywhere', async () => {
    const SAME: [string, string][] = [
      ['x^2 + y^2 = -1', 'That curve cannot be drawn: no point (x, y) makes its two sides equal.'],
      ['y = sqrt(-1 - x^2)', 'That graph cannot be drawn: it has no real value for any x.'],
      ['x^2 + y^2 < -1', 'That inequality cannot be drawn: it is true for no area of the plane, so there is nothing to shade.'],
      // Values that are all too large stay too large, however far one looks.
      ['y = 1e8', 'That graph cannot be drawn: it has only values beyond ten million, too large to draw.']
    ]
    for (const [line, says] of SAME) {
      fresh()
      expect(expectRefused(line, await typed(line)), line).toBe(says)
    }
  })

  it('still draws a curve that is within reach, however big', async () => {
    const DRAWN: [string, RegExp, GraphObj['kind']][] = [
      ['x^2 + y^2 = 4e11', /^Implicit curve created/, 'implicit'],
      ['y = sqrt(x - 10^5)', /^Graph created/, 'explicit'],
      ['x^2 + y^2 > 4e11', /^Shaded region created/, 'inequality']
    ]
    for (const [line, said, kind] of DRAWN) {
      fresh()
      expectDrawn(line, await typed(line), said, kind)
    }
  })

  it('looks far out at the slider values the student has, not at the last one tried', async () => {
    // k = 4.1e13 makes a circle too big to see, and moving k brings it in: made, with the note.
    await run('k = 4.1e13')
    expectDrawn('x^2 + y^2 = k', await typed('x^2 + y^2 = k'), /^Implicit curve created — at k = .* there is nothing to draw; move k to see it\./, 'implicit')
    // No k helps x² + y² = −1 − k², so it is refused like the same line without a slider.
    fresh()
    await run('k = 2')
    expect(expectRefused('x^2 + y^2 = -1 - k^2', await typed('x^2 + y^2 = -1 - k^2'))).toContain('no point (x, y) makes its two sides equal')
    // This circle (radius 6.4×10⁶) exists for k = 2 alone, one of the values the sliders are tried
    // at but not the last of them: k = 0 is, and there is no circle at all. The student's k decides.
    fresh()
    await run('k = 2')
    const line = 'x^2 + y^2 = 4.1e13 - 4.1e13*(k - 2)^2'
    expect(expectRefused(line, await typed(line))).toContain(FAR)
    // The same line at a k that gives no circle anywhere keeps the plain sentence.
    fresh()
    await run('k = 0')
    expect(expectRefused(line, await typed(line))).toContain('no point (x, y) makes its two sides equal')
  })
})

describe('a tangent or a region that is not on the screen is not announced as drawn (polish H6)', () => {
  beforeEach(fresh)

  // The curve y = x³ is at 10⁹ where x = 1000, beyond the 10⁷ the viewport ever draws: only the
  // point T showed, and the line said "Tangent drawn". Two identical curves had no region between
  // them and the line said "Region shaded … 0".
  it('refuses a tangent where the curve is too far out to draw, and makes nothing', async () => {
    const text = expectRefused('tangent(x^3, 1000)', await typed('tangent(x^3, 1000)'))
    // The number is the app's own (math/format.ts fmtLabel): a power of ten is raised in a sentence
    // (1 × 10⁹), never written with a caret (polish H17; this read "1×10^9" before).
    expect(text).toBe('At x = 1000 the curve is at y = 1\u00a0×\u00a010⁹, too far out to draw, so its tangent cannot be shown there.')
    expect(text).not.toMatch(/slope|Tangent drawn/)
  })

  it('refuses a tangent past the limit on the other side, and says the y it would be at', async () => {
    const text = expectRefused('tangent(-x^3, 1000)', await typed('tangent(-x^3, 1000)'))
    expect(text).toBe('At x = 1000 the curve is at y = −1\u00a0×\u00a010⁹, too far out to draw, so its tangent cannot be shown there.')
  })

  it('still draws a tangent where the curve is within what the viewport draws', async () => {
    for (const [line, said, slope] of [
      ['tangent(x^2, 1)', /^Tangent drawn at x = 1\. Its slope is 2\./, 2],
      // y = 8×10⁶ here: high, but under the limit.
      ['tangent(x^3, 200)', /^Tangent drawn at x = 200\. Its slope is 120000\./, 120000],
      ['tangent(sin(x), 1000)', /^Tangent drawn at x = 1000\. Its slope is 0\.56/, 0.56]
    ] as [string, RegExp, number][]) {
      fresh()
      const { last, made } = await typed(line)
      expect(errors(), line).toEqual([])
      expect(last.text, line).toMatch(said)
      expect(made.map((o) => o.name), line).toEqual(expect.arrayContaining(['tangent', 'T']))
      expect(slope).toBeGreaterThan(0)
    }
  })

  const SAME = 'The two curves are the same between x = 0 and 1, so there is no region between them.'
  it('refuses a region between two curves that are the same, and makes nothing', async () => {
    expect(expectRefused('between(x, x, 0, 1)', await typed('between(x, x, 0, 1)'))).toBe(SAME)
    fresh()
    // The bounds as typed, either way round.
    expect(expectRefused('between(x, x, 1, 0)', await typed('between(x, x, 1, 0)'))).toBe(SAME)
  })

  it('knows two curves are the same when they are written differently', async () => {
    const line = 'between(sin(x)^2 + cos(x)^2, 1, 0, 3)'
    expect(expectRefused(line, await typed(line))).toBe('The two curves are the same between x = 0 and 3, so there is no region between them.')
  })

  it('still shades the region between two curves that differ', async () => {
    const { last, made } = await typed('between(x^2, x + 2, -1, 2)')
    expect(errors()).toEqual([])
    expect(last.text).toMatch(/^Region shaded\. Area between the curves from x = −1 to 2: 4\.5\./)
    expect(made.map((o) => o.name)).toEqual(expect.arrayContaining(['region', 'areaText']))
    // A region that is thin is still a region.
    fresh()
    expect((await typed('between(x, x + 0.1, 0, 1)')).last.text).toMatch(/^Region shaded\. Area between the curves from x = 0 to 1: 0\.1\./)
  })

  it('makes the region when only the slider keeps the curves the same, so it can be moved', async () => {
    // "Make a slider first, e.g. k = 1" is the app's own advice, and k = 1 makes y = k·x the same as y = x.
    await run('k = 1')
    const { last, made } = await typed('between(x, k*x, 0, 1)')
    expect(errors()).toEqual([])
    expect(last.text).toMatch(/^Region shaded — at k = 1 there is nothing to draw; move k to see it\./)
    expect(made.map((o) => o.name)).toContain('region')
    expect(made.map((o) => o.name), 'no area of 0 written on it').not.toContain('areaText')
    // No k changes y = x + 0·k, so there is nothing to wait for.
    fresh()
    await run('k = 1')
    expect(expectRefused('between(x, x + 0*k, 0, 1)', await typed('between(x, x + 0*k, 0, 1)'))).toBe(SAME)
  })
})

describe('small leftovers of the command bar (polish H7)', () => {
  beforeEach(async () => {
    fresh()
    await run('P = (0, 0)', 'A = <1, 2>', 'r = <1, 0>', 'F = <0, 3>')
  })

  const geometry = (cmd: string) => `Wrong inputs for ${cmd}. Type "help" to see examples.`
  const solver = (typedAs: string) => `Wrong inputs for ${typedAs}. Type "help" for examples.`

  // cross(A, r, F) answered A × r and Square(P, (1, 0), 3) built a square: an input the command
  // never reads is a slip, and the answer to the other two is not the answer to the line typed.
  it('refuses an input the command does not read, in the command\'s own words', async () => {
    await run('f = Line(P, (1, 1))', 'g = Line(P, (1, -1))')
    const EXTRA: [string, string][] = [
      ['cross(A, r, F)', solver('cross')],
      ['dot(A, r, F)', solver('dot')],
      ['magnitude(A, r)', solver('magnitude')],
      ['components(10, 30, 5)', solver('components')],
      ['resultant(5, 5, 120, 7)', solver('resultant')],
      ['torque(r, F, A)', solver('torque')],
      ['Square(P, (1, 0), 3)', geometry('Square')],
      ['Triangle(P, (4, 0), (0, 3), (1, 1))', geometry('Triangle')],
      ['RegularPolygon(P, (1, 0), 6, 7)', geometry('RegularPolygon')],
      ['Intersect(f, g, 1, 5)', geometry('Intersect')],
      ['Slider(1, 0, 10, 0.1, 5)', geometry('Slider')],
      ['Text("hi", (1, 2), 3)', geometry('Text')]
    ]
    for (const [line, says] of EXTRA) {
      const { last, made } = await typed(line)
      expect(last.kind, `${line} → ${last.text ?? last.tex}`).toBe('error')
      expect(last.text, line).toBe(says)
      expect(made.map((o) => `${o.type} ${o.name}`), `${line}: nothing added`).toEqual([])
    }
  })

  it('still answers a line that has exactly the inputs the command reads', async () => {
    await run('f = Line(P, (1, 1))', 'g = Line(P, (1, -1))')
    const WHOLE = ['cross(A, r)', 'components(10, 30)', 'components(A)', 'resultant(5, 5, 120)', 'Square(P, (1, 0))', 'RegularPolygon(P, (1, 0))', 'RegularPolygon(P, (1, 0), 6)', 'Triangle(P, (4, 0), (0, 3))', 'Intersect(f, g)', 'Intersect(f, g, 1)', 'Slider(1, 0, 10, 0.1)', 'Text("hi", (1, 2))', 'add(A, r, F)']
    for (const line of WHOLE) {
      const { last } = await typed(line)
      expect(errors(), line).toEqual([])
      expect(last.kind, line).toBe('result')
    }
  })

  // A triangle's centre of a point was refused by the evaluator after the point had been made, so
  // "B: needs a triangle" was said about a point that stayed in the drawing as an error.
  it('refuses the centre of something that is not a triangle, and leaves nothing behind', async () => {
    for (const cmd of ['Centroid', 'Circumcenter', 'Incenter', 'Orthocenter']) {
      const line = `${cmd}(P)`
      const { last, made } = await typed(line)
      expect(last.kind, line).toBe('error')
      expect(last.text, line).toBe(`${cmd} needs a triangle, and P is not one. Make a triangle first, e.g. T = Triangle((0, 0), (4, 0), (0, 3)), then ${cmd}(T).`)
      expect(made.map((o) => `${o.type} ${o.name}`), `${line}: nothing left behind`).toEqual([])
    }
  })

  it('says the same of a polygon with four corners, and does not offer a name that is taken', async () => {
    await run('Square(P, (1, 0))', 'T = (5, 5)')
    const polygon = Object.values(scene().objects).find((o) => o.type === 'polygon')!.name
    const { last, made } = await typed(`Centroid(${polygon})`)
    expect(last.kind).toBe('error')
    expect(last.text).toBe(`Centroid needs a triangle, and ${polygon} is not one. Make a triangle first, e.g. U = Triangle((0, 0), (4, 0), (0, 3)), then Centroid(U).`)
    expect(made).toEqual([])
  })

  it('still finds the centre of a triangle', async () => {
    await run('T = Triangle(P, (6, 0), (0, 3))', 'G = Centroid(T)')
    expect(errors()).toEqual([])
    pointNamed('G', [2, 1, 0])
  })

  const SIDES = 'A regular polygon needs a whole number of sides, 3 or more.'
  it('refuses a regular polygon whose number of sides is not a whole number, 3 or more', async () => {
    // 2 sides made a "polygon, area 0", 2.5 a triangle, and 0 or −3 a polygon of two corners.
    for (const n of ['2', '0', '-3', '2.5', '3/0', '1']) {
      const line = `RegularPolygon(P, (1, 0), ${n})`
      const { last, made } = await typed(line)
      expect(last.kind, `${line} → ${last.text ?? last.tex}`).toBe('error')
      expect(last.text, line).toBe(SIDES)
      expect(made.map((o) => `${o.type} ${o.name}`), `${line}: nothing added`).toEqual([])
    }
  })

  it('still makes a regular polygon of 3 or more sides', async () => {
    for (const n of [3, 4, 6, 12]) {
      fresh()
      await run('P = (0, 0)')
      const { last, made } = await typed(`RegularPolygon(P, (1, 0), ${n})`)
      expect(errors()).toEqual([])
      expect(last.kind).toBe('result')
      const polygon = made.find((o) => o.type === 'polygon') as (SceneObject & { points: string[] }) | undefined
      expect(polygon?.points.length, `${n} sides`).toBe(n)
    }
  })

  // The position of a label read no names: Text("hi", P) said `I don't know "P"` about a point that
  // was on the screen, and Text("hi", A) took the A for the unit ampere.
  it('puts a label at a point or a vector that exists', async () => {
    await run('Q = (3, 4)')
    for (const [line, at] of [['Text("hi", Q)', [3, 4, 0]], ['Text("hi", A)', [1, 2, 0]], ['Text("hi", Q + A)', [4, 6, 0]], ['Text("hi", (5, 6))', [5, 6, 0]]] as [string, number[]][]) {
      const { made } = await typed(line)
      expect(errors(), line).toEqual([])
      const label = made.find((o) => o.type === 'text') as (SceneObject & { p: number[]; text: string }) | undefined
      expect(label?.text, line).toBe('hi')
      expect(label?.p, line).toEqual(at)
    }
  })

  it('still says what it does not know about a position', async () => {
    const { last, made } = await typed('Text("hi", nothing)')
    expect(last.kind).toBe('error')
    expect(last.text).toBe('I don\'t know "nothing". Create it first, e.g. nothing = (1, 2).')
    expect(made).toEqual([])
  })

  it('refuses a label with nothing in it', async () => {
    for (const line of ['Text()', 'Text("")', 'Text(" ")', "Text('')"]) {
      const { last, made } = await typed(line)
      expect(last.kind, `${line} → ${last.text ?? last.tex}`).toBe('error')
      expect(last.text, line).toBe('Text needs something to show, e.g. Text("label").')
      expect(made.map((o) => `${o.type} ${o.name}`), `${line}: nothing added`).toEqual([])
    }
  })
})

describe('a piecewise curve is refused only when none of its pieces can be drawn (polish H11)', () => {
  beforeEach(fresh)

  // One piece with no real value (sqrt(x - 5) from 0 to 2) made the whole curve "cannot be drawn",
  // although x^2 from 2 to 4 drew: the check returned at the first piece that showed nothing.
  it('makes the curve and says which piece shows nothing', async () => {
    const line = 'piecewise(sqrt(x - 5) from 0 to 2, x^2 from 2 to 4)'
    const g = expectDrawn(line, await typed(line), /^Piecewise curve created with 2 pieces — the piece sqrt\(x - 5\) from 0 to 2 has no real value, so it shows nothing\./, 'piecewise')
    // The curve keeps both pieces as typed: the empty one draws nothing, and it can be edited later.
    expect(g.pieces?.map((p) => p.expr)).toEqual(['sqrt(x - 5)', 'x^2'])
  })

  it('names every piece that shows nothing, whichever reason it has', async () => {
    const CASES: [string, RegExp][] = [
      ['piecewise(sqrt(x - 5) from 0 to 2, x^2 from 2 to 4, sqrt(-x - 9) from 4 to 6)',
        /^Piecewise curve created with 3 pieces — the piece sqrt\(x - 5\) from 0 to 2 has no real value, so it shows nothing; the piece sqrt\(-x - 9\) from 4 to 6 has no real value, so it shows nothing\./],
      ['piecewise(x from 1 to 1, x^2 from 2 to 4)', /^Piecewise curve created with 2 pieces — the piece x from 1 to 1 has no stretch of x, so it shows nothing\./],
      ['piecewise(x^2 from 1e8 to 2e8, x from 0 to 1)', /^Piecewise curve created with 2 pieces — the piece x\^2 from 100000000 to 200000000 has only values beyond ten million, too large to draw, so it shows nothing\./]
    ]
    for (const [line, said] of CASES) {
      fresh()
      expectDrawn(line, await typed(line), said, 'piecewise')
    }
  })

  it('still refuses a curve none of whose pieces can be drawn, naming the first', async () => {
    expect(expectRefused('piecewise(sqrt(x) from -3 to -1)', await typed('piecewise(sqrt(x) from -3 to -1)'))).toBe('That piecewise curve cannot be drawn: the piece sqrt(x) from −3 to −1 has no real value.')
    fresh()
    const both = 'piecewise(sqrt(x - 5) from 0 to 2, sqrt(x - 9) from 2 to 4)'
    expect(expectRefused(both, await typed(both))).toBe('That piecewise curve cannot be drawn: the piece sqrt(x - 5) from 0 to 2 has no real value.')
  })

  it('says nothing extra when every piece draws', async () => {
    for (const [line, kind] of [['piecewise(x^2 from -3 to 0, x from 0 to 2)', /^Piecewise curve created with 2 pieces\./], ['piecewise(x^2 from 0 to 1)', /^Piecewise curve created with 1 piece\./]] as [string, RegExp][]) {
      fresh()
      const { last } = await typed(line)
      expect(errors()).toEqual([])
      expect(last.text, line).toMatch(kind)
      expect(last.text, line).not.toMatch(/shows nothing/)
    }
  })

  it('keeps the slider note when the whole curve is empty only at the slider values', async () => {
    // Every piece is empty at k = −1, and k = 1 brings them back: made, with the note about k.
    await run('k = -1')
    const line = 'piecewise(sqrt(k*x) from 0 to 2, sqrt(k*x) from 2 to 4)'
    expectDrawn(line, await typed(line), /^Piecewise curve created with 2 pieces — at k = −1 there is nothing to draw; move k to see it\./, 'piecewise')
  })
})

describe('calling a graph by its name is told what to do instead (polish H12)', () => {
  beforeEach(fresh)

  /** Setup lines that are graphs switch the student to Graphing, and a refused line is checked to leave them where they were. */
  const setup = async (...lines: string[]): Promise<void> => {
    await run(...lines)
    scene().setActiveSpace('vectors')
    scene().setViewMode('2d')
  }

  // After g(x) = sin(x), y = g(x)*2 was told "g(x) reads as a function called g — for a product,
  // type g*(x)": the advice for a slider, and g is not a number, so g*(x) draws nothing either.
  const NOT_A_NUMBER = (name: string) => `"${name}" is not a number, so it cannot be used in the function.`

  // P-PARSE R1: a slider or x written against a bracket multiplies it, as on paper — these were refused with
  // "reads as a function called k — for a product, type k*(x)".
  it('draws a slider or x written against a bracket as a product', async () => {
    await setup('k = 2')
    const k = await typed('y = k(x)')
    expect(k.last.kind, k.last.text).toBe('result')
    fresh()
    const x = await typed('y = x(x + 1)')
    expect(x.last.kind, x.last.text).toBe('result')
  })

  it('says a graph cannot use another graph, and writes the line with the formula in its place', async () => {
    await setup('g(x) = sin(x)')
    const CASES: [string, string][] = [
      ['y = g(x)*2', 'g is a graph, and a graph cannot use another graph yet — type its formula instead, e.g. y = sin(x)*2.'],
      ['y = 2*g(x)', 'g is a graph, and a graph cannot use another graph yet — type its formula instead, e.g. y = 2*sin(x).'],
      // The argument is put where x was.
      ['y = 2*g(x - 1)', 'g is a graph, and a graph cannot use another graph yet — type its formula instead, e.g. y = 2*sin(x - 1).'],
      ['y = g(2) + x', 'g is a graph, and a graph cannot use another graph yet — type its formula instead, e.g. y = sin(2) + x.']
    ]
    for (const [line, says] of CASES) {
      expect(expectRefused(line, await typed(line)), line).toBe(says)
    }
  })

  it('says it for the graph a line made on its own, which is called f', async () => {
    await setup('y = x^2')
    expect(Object.values(scene().objects).some((o) => o.type === 'graph' && o.name === 'f')).toBe(true)
    expect(expectRefused('y = f(x) + 1', await typed('y = f(x) + 1'))).toBe('f is a graph, and a graph cannot use another graph yet — type its formula instead, e.g. y = x^2 + 1.')
  })

  it('says it in the other routes too, without a line to write', async () => {
    await setup('g(x) = sin(x)')
    const text = expectRefused('z = g(x)*y', await typed('z = g(x)*y'))
    expect(text).toBe('g is a graph, and a graph cannot use another graph yet — type its formula instead: g(x) is sin(x).')
    // A graph that is not y = f(x) has no one formula to offer.
    fresh()
    await setup('x^2 + y^2 = 9')
    expect(expectRefused('y = f(x)', await typed('y = f(x)'))).toBe('f is a graph, and a graph cannot use another graph yet — type its formula instead.')
  })

  it('says a point, a vector or a line is not a number when it is called', async () => {
    await setup('A = <1, 2>', 'P = (3, 4)', 'Q = (1, 1)', 'L = Line(P, Q)')
    for (const name of ['A', 'P', 'L']) {
      const line = `y = ${name}(x)`
      expect(expectRefused(line, await typed(line)), line).toBe(NOT_A_NUMBER(name))
    }
  })

  it('does not change what a name that is used without a call is told', async () => {
    await setup('g(x) = sin(x)', 'A = <1, 2>')
    expect(expectRefused('y = A*x', await typed('y = A*x'))).toBe(NOT_A_NUMBER('A'))
    expect(expectRefused('y = g*x', await typed('y = g*x'))).toBe(NOT_A_NUMBER('g'))
    expect(expectRefused('y = foo(x)', await typed('y = foo(x)'))).toBe('That graph cannot be drawn: PhysLab does not know a function called "foo".')
  })
})

// ---------------------------------------------------------------------------
// A power too high to multiply out (polish wave, part P-GRAPH: P4, round 2). The degree cap of the
// exact route was read with a pattern that stops at the first digit after the ^, so 1e9 was taken
// for a power of 1 and x^1e9 was multiplied out term by term: minutes of looping and then an array
// of a billion places. The cap now looks at what the exponent comes to, however it is written, and
// an equation whose only x is one such power is solved from the power itself.
// ---------------------------------------------------------------------------

describe('a power too high to multiply out is solved without multiplying it out (polish P4, round 2)', () => {
  beforeEach(() => {
    fresh()
    scene().setSettings({ decimals: 2, precisionMode: 'dp' })
  })

  const NO_REAL = 'No real x makes this true — it has no points on the graph.'

  for (const line of ['x^1e9 = 0', 'x^(1e9) = 0', 'x^100000 = 0', 'x^1000000000 = 0', 'x^(10^9) = 0']) {
    it(`${line}: the solution x = 0, within a few seconds`, async () => {
      const t0 = performance.now()
      const text = (await typed(line)).last.text ?? ''
      expect(text).toContain('The solution is x = 0 — drawn as a vertical line.')
      expect(performance.now() - t0).toBeLessThan(3000)
    }, 5000)
  }

  for (const line of ['x^1e6 + 1 = 0', 'x^(1e6) + 1 = 0', 'x^1e9 + 1 = 0']) {
    it(`${line}: no real x`, async () => {
      expect(expectRefused(line, await typed(line))).toContain(NO_REAL)
    }, 5000)
  }

  // The closed form is exact, not a scan: the root of x^N = c is c^(1/N), and an odd N has one.
  it('names the real roots of a binomial power exactly, an even power with both signs and an odd one with its own', async () => {
    scene().setSettings({ decimals: 6, precisionMode: 'dp' })
    const CASES: [string, string][] = [
      ['x^1e6 = 1', 'The solutions are x = −1 and x = 1 — each drawn as a vertical line.'],
      ['x^1000001 = -1', 'The solution is x = −1 — drawn as a vertical line.'],
      ['x^1000001 = 1', 'The solution is x = 1 — drawn as a vertical line.'],
      ['3*x^100000 - 6 = 0', 'The solutions are x = −1.000007 and x = 1.000007 — each drawn as a vertical line.'],
      ['x^20 = 1', 'The solutions are x = −1 and x = 1 — each drawn as a vertical line.'],
      ['2*x^13 + 2 = 0', 'The solution is x = −1 — drawn as a vertical line.']
    ]
    for (const [line, says] of CASES) expect((await typed(line)).last.text, line).toContain(says)
  })

  it('an even power can never be below 0, an odd one can', async () => {
    expect(expectRefused('x^1e6 = -4', await typed('x^1e6 = -4'))).toContain(NO_REAL)
    expect(expectRefused('x^14 + 1 = 0', await typed('x^14 + 1 = 0'))).toContain(NO_REAL)
    // −4 is below 0 and has a root all the same: the 1000001st root of −4 is −1.0000014.
    scene().setSettings({ decimals: 6, precisionMode: 'dp' })
    expect((await typed('x^1000001 = -4')).last.text).toMatch(/^The solution is x = −1\.000001 — drawn/)
  })

  it('sides that cancel are equal for every x, or for none', async () => {
    expect(expectRefused('x^1e6 = x^1e6', await typed('x^1e6 = x^1e6'))).toContain('its two sides are equal for every x, so there is no line to draw')
    expect(expectRefused('x^1e6 = x^1e6 + 1', await typed('x^1e6 = x^1e6 + 1'))).toContain(NO_REAL)
  })

  // Anything else with a power that high is scanned, as a degree above the cap always was; it must
  // still come back, and say what the scan finds.
  it('a formula with more than the power in it is scanned and answers all the same', async () => {
    const t0 = performance.now()
    const text = (await typed('x^1e6 + x = 0')).last.text ?? ''
    expect(text).toContain('x = 0')
    expect(performance.now() - t0).toBeLessThan(3000)
  }, 8000)

  it('a power written larger than it is typed is read as it comes to: 10^9, 1e+9, 1E9', async () => {
    for (const line of ['x^(10^9) = 0', 'x^1e+9 = 0', 'x^1E9 = 0']) expect((await typed(line)).last.text, line).toContain('The solution is x = 0')
  }, 8000)
})

// ---------------------------------------------------------------------------
// An equation whose solution is where the formula ends (polish wave, part P-GRAPH: H13). √x = 0 and
// √(x − 3) = 0 were told "No real x makes this true": the scan looks for a sign change, and √x has
// no value on one side of its root. acos x = 0 and √(1 − x²) = 0 likewise. And √(x + 23.7) = 0,
// whose one solution is the first of the x at which the two sides are compared, was called a whole
// stretch of solutions because they agreed at that one x.
// ---------------------------------------------------------------------------

describe('an equation whose solution is where the formula ends (polish H13)', () => {
  beforeEach(() => {
    fresh()
    scene().setSettings({ decimals: 2, precisionMode: 'dp' })
  })

  const CASES: [string, number[], string][] = [
    ['sqrt(x) = 0', [0], 'The solution is x = 0 — drawn as a vertical line.'],
    ['sqrt(x - 3) = 0', [3], 'The solution is x = 3 — drawn as a vertical line.'],
    ['acos(x) = 0', [1], 'The solution is x = 1 — drawn as a vertical line.'],
    ['sqrt(1 - x^2) = 0', [-1, 1], 'The solutions are x = −1 and x = 1 — each drawn as a vertical line.'],
    ['sqrt(x + 23.7) = 0', [-23.7], 'The solution is x = −23.7 — drawn as a vertical line.'],
    ['sqrt(-x) = 0', [0], 'The solution is x = 0 — drawn as a vertical line.'],
    ['x*sqrt(x) = 0', [0], 'The solution is x = 0 — drawn as a vertical line.'],
    ['sqrt(9 - x^2) = 0', [-3, 3], 'The solutions are x = −3 and x = 3 — each drawn as a vertical line.']
  ]
  for (const [line, roots, says] of CASES) {
    it(`${line}: ${roots.map((r) => `x = ${r}`).join(' and ')}, with a vertical line at each`, async () => {
      const { last, made } = await typed(line)
      expect(errors()).toEqual([])
      expect(last.kind, `${line} → ${last.text}`).toBe('result')
      expect(last.text).toContain(says)
      // The helper looks at [−9.7, 10.3] only, as the viewport's first view does.
      for (const r of roots.filter((v) => Math.abs(v) < 9)) expect(drawsVerticalLineAt(r, made), `a vertical line at x = ${r}`).toBe(true)
    })
  }

  it('a formula that only tends to something else where it ends is still no solution: √x = −1, √x + 1 = 0 and 1/√x = 0', async () => {
    for (const line of ['sqrt(x) = -1', 'sqrt(x) + 1 = 0', '1/sqrt(x) = 0']) {
      expect(expectRefused(line, await typed(line)), line).toContain('No real x makes this true')
    }
  })

  // The two sides are compared at 61 x off the whole numbers; the first is −23.7. Agreeing at one
  // x of them is a stretch only if the sides go on agreeing a little way either side of it.
  it('two sides that meet at one of the x they are compared at are still one solution; a stretch is still a stretch', async () => {
    expect((await typed('sqrt(x + 23.7) = 0')).last.text).toContain('The solution is x = −23.7')
    expect((await typed('ln(x + 24.7) = 0')).last.text).toContain('The solution is x = −23.7')
    // A refusal is judged from the space the student typed it in, which a drawing changes.
    fresh()
    for (const line of ['abs(x) = x', 'floor(x) = 2']) expect(expectRefused(line, await typed(line)), line).toContain('equal along a whole stretch of x')
  })
})

// ---------------------------------------------------------------------------
// Two leads from the review of the first batch (polish wave, part P-GRAPH: H12 and H6, round 2).
// ---------------------------------------------------------------------------

describe('the line offered for a call to a graph writes out every call (polish H12, round 2)', () => {
  beforeEach(fresh)

  const setup = async (...lines: string[]): Promise<void> => {
    await run(...lines)
    scene().setActiveSpace('vectors')
    scene().setViewMode('2d')
  }
  const LEAD = 'g is a graph, and a graph cannot use another graph yet — type its formula instead'

  // Only the first call was replaced: y = g(x)*g(x) was offered as y = (sin(x)) * g(x), which is
  // refused in the same words, and a student who typed what was offered went round again.
  it('y = g(x)*g(x) is offered as y = sin(x)*sin(x)', async () => {
    await setup('g(x) = sin(x)')
    const CASES: [string, string][] = [
      ['y = g(x)*g(x)', `${LEAD}, e.g. y = sin(x)*sin(x).`],
      ['y = g(x) + 2*g(x - 1)', `${LEAD}, e.g. y = sin(x) + 2*sin(x - 1).`],
      ['y = g(x)^2 + g(2*x)', `${LEAD}, e.g. y = sin(x)^2 + sin(2*x).`],
      ['y = g(g(x))', `${LEAD}, e.g. y = sin(sin(x)).`]
    ]
    for (const [line, says] of CASES) {
      expect(expectRefused(line, await typed(line)), line).toBe(says)
    }
  })

  it('and the line it offers draws', async () => {
    await setup('g(x) = sin(x)', 'h(x) = x^2 + 1')
    for (const [line, offered] of [
      ['y = g(x)*g(x)', 'y = sin(x)*sin(x)'],
      ['y = g(x) + 2*g(x - 1)', 'y = sin(x) + 2*sin(x - 1)'],
      ['y = h(x)*h(x)*h(1)', 'y = (x^2 + 1)*(x^2 + 1)*(1^2 + 1)']
    ]) {
      const text = expectRefused(line, await typed(line))
      expect(text, line).toContain(`e.g. ${offered}.`)
      const again = await typed(offered)
      expect(again.last.kind, `${offered} → ${again.last.text}`).toBe('result')
      scene().setActiveSpace('vectors')
      scene().setViewMode('2d')
    }
  })

  it('a call with other than one argument has no formula to put in its place, and the sentence says what g(x) is', async () => {
    await setup('g(x) = sin(x)')
    expect(expectRefused('y = g(x) + g(1, 2)', await typed('y = g(x) + g(1, 2)'))).toBe(`${LEAD}: g(x) is sin(x).`)
  })
})

describe('two curves are the same only where they agree away from the grid they are looked at on (polish H6, round 2)', () => {
  beforeEach(() => {
    fresh()
    scene().setSettings({ decimals: 2, precisionMode: 'dp' })
  })

  const SAME = (a: string, b: string) => `The two curves are the same between x = ${a} and ${b}, so there is no region between them.`

  // The 401 points the two curves were compared at lined up with the zeros of sin(100πx) (every
  // x = 0.01k) and of sin x (every multiple of π): both were "the same as y = 0" and refused.
  // 1e12 and 1e12 + 1 differ by a millionth of a millionth of their size, which was inside the
  // tolerance, and the region between them has an area of 1.
  const SHADE: [string, number, string][] = [
    ['between(sin(100 pi x), 0, 0, 4)', 2.55, 'from x = 0 to 4'],
    ['between(sin(x), 0, 0, 400 pi)', 800, 'from x = 0 to 1256.64'],
    ['between(1e12, 1e12 + 1, 0, 1)', 1, 'from x = 0 to 1']
  ]
  for (const [line, area, span] of SHADE) {
    it(`${line} shades a region of area ${area}`, async () => {
      const { last, made } = await typed(line)
      expect(errors(), line).toEqual([])
      expect(last.kind, `${line} → ${last.text}`).toBe('result')
      expect(last.text).toMatch(new RegExp(`^Region shaded\\. Area between the curves ${span}: `))
      const said = Number(/: (\d+(?:\.\d+)?)\./.exec(last.text ?? '')?.[1])
      expect(Math.abs(said - area) / area, `area said ${said}`).toBeLessThan(0.01)
      expect(made.map((o) => o.name)).toEqual(expect.arrayContaining(['region', 'areaText']))
    })
  }

  it('still refuses two curves that are the same: written alike, written differently, or the same wave', async () => {
    const CASES: [string, string][] = [
      ['between(x, x, 0, 1)', SAME('0', '1')],
      ['between(sin(x)^2 + cos(x)^2, 1, 0, 3)', SAME('0', '3')],
      ['between(sin(x)^2 + cos(x)^2, 1, 0, 400 pi)', SAME('0', '1256.64')],
      ['between(sin(100 pi x), sin(100 pi x), 0, 4)', SAME('0', '4')],
      ['between((x + 1)^2, x^2 + 2*x + 1, 0, 3)', SAME('0', '3')],
      ['between(tan(x), sin(x)/cos(x), 0.1, 1.4)', SAME('0.1', '1.4')],
      ['between(1e12, 1e12, 0, 1)', SAME('0', '1')],
      ['between(sqrt(x)^2, x, 0, 2)', SAME('0', '2')]
    ]
    for (const [line, says] of CASES) {
      fresh()
      scene().setSettings({ decimals: 2, precisionMode: 'dp' })
      expect(expectRefused(line, await typed(line)), line).toBe(says)
    }
  })

  it('a region too thin to see is still a region: a gap of one part in 10^12 of the curves', async () => {
    const { last } = await typed('between(1e6, 1e6 + 0.000001, 0, 1)')
    expect(last.kind, last.text).toBe('result')
    expect(last.text).toMatch(/^Region shaded\./)
  })
})

// ---------------------------------------------------------------------------
// Round 3 of the review (polish wave, part P-GRAPH: P4r3-linear). The closed form for a lone high
// power took an equation for "a·u + b" in u = x^N after looking at it at four values of u only
// (0, 1, 2, −3), so a formula that happens to agree with a straight line there was read as one:
// u(u − 1)(u − 2)(u + 3) is 0 at all four and was "equal for every x", and floor, round, ceil and mod
// of x^20 passed for lines too. It is now read from the shape of the formula. And (x − 1)^100 is
// 0 over a stretch round 1 only because the power underflows: its solutions come from x − 1.
// ---------------------------------------------------------------------------

describe('a lone high power is read from the shape of the formula, not from four of its values (polish P4, round 3)', () => {
  beforeEach(() => {
    fresh()
    scene().setSettings({ decimals: 2, precisionMode: 'dp' })
  })

  const STRETCH = 'its two sides are equal along a whole stretch of x, not at separate values, so there are no lines to draw'

  it('a product of straight lines in x^20 is solved from its factors, not taken for a line that is 0 everywhere', async () => {
    const line = 'x^20*(x^20 - 1)*(x^20 - 2)*(x^20 + 3) = 0'
    const text = (await typed(line)).last.text ?? ''
    expect(errors(), line).toEqual([])
    // 2^(1/20) = 1.0353: the four values the old probe looked at (0, 1, 2, −3) are the roots of u.
    expect(text, line).toContain('The solutions are x = −1.04, x = −1, x = 0, x = 1 and x = 1.04 — each drawn as a vertical line.')
  })

  it('floor, round and ceil of a high power are a stretch of x, as the same of x² says, not one solution', async () => {
    const same = expectRefused('floor(x^2) = 0', await typed('floor(x^2) = 0'))
    expect(same).toContain(STRETCH)
    for (const line of ['floor(x^20) = 0', 'round(x^14) = 0', 'ceil(x^13) = 1']) {
      fresh()
      scene().setSettings({ decimals: 2, precisionMode: 'dp' })
      expect(expectRefused(line, await typed(line)), line).toContain(STRETCH)
    }
  })

  // Whole at x = 0, 1, 2^(1/20)…, so not "every x" and not "x = 0" alone. Every double past 2^53 is
  // whole, which is every x past 6.3 for a 20th power: there the two sides agree to the last digit.
  it('mod(x^20, 1) = 0 is not "equal for every x" and not the one solution x = 0', async () => {
    const text = expectRefused('mod(x^20, 1) = 0', await typed('mod(x^20, 1) = 0'))
    expect(text).toContain(STRETCH)
  })

  // The power of a number near 1 is 0 to the last digit over a stretch round 1: (x − 1)^100 is under
  // 10^−308 for x within 0.0069 of 1, so the scan found the end of that stretch as a second solution
  // (1.000367), and (x − 1)^1000 as a stretch of solutions. P^N = 0 comes to P = 0.
  it('(x − 1)^100 = 0 and (x − 1)^1000 = 0 have the one solution x = 1', async () => {
    for (const line of ['(x - 1)^100 = 0', '(x - 1)^1000 = 0', '0 = (x - 1)^100', '(x - 1)^1e9 = 0', '((x - 1)^30)^40 = 0']) {
      fresh()
      scene().setSettings({ decimals: 2, precisionMode: 'dp' })
      const { last, made } = await typed(line)
      expect(errors(), line).toEqual([])
      expect(last.text, line).toContain('The solution is x = 1 — drawn as a vertical line.')
      expect(made.map((o) => o.type), line).toEqual(['graph'])
    }
  })

  // The line itself is drawn from the formula as typed (render/GraphView.tsx), which is 0 over a
  // stretch for a power as high as 1000: only the sentence above is the solver's.
  it('(x − 1)^100 = 0 also has its one vertical line, at x = 1', async () => {
    const { made } = await typed('(x - 1)^100 = 0')
    expect(drawsVerticalLineAt(1, made)).toBe(true)
  })

  it('any base: (2x − 3)^100, (x² − 4)^50 and sin(x)^100 are solved from the base', async () => {
    expect((await typed('(2*x - 3)^100 = 0')).last.text).toContain('The solution is x = 1.5 — drawn as a vertical line.')
    fresh()
    scene().setSettings({ decimals: 2, precisionMode: 'dp' })
    expect((await typed('(x^2 - 4)^50 = 0')).last.text).toContain('The solutions are x = −2 and x = 2 — each drawn as a vertical line.')
    fresh()
    scene().setSettings({ decimals: 2, precisionMode: 'dp' })
    const wave = (await typed('sin(x)^100 = 0')).last.text ?? ''
    // No 0.00037: that was where sin(x)^100 stops being 0 to the last digit, not a solution.
    expect(wave).toContain('x = −3.14, x = 0, x = 3.14')
    expect(wave).toContain('The pattern repeats every 6.28')
  })

  it('a power that is not 0 on the other side is not reduced: (x − 1)^100 = 1 is x = 0 and x = 2', async () => {
    expect((await typed('(x - 1)^100 = 1')).last.text).toContain('The solutions are x = 0 and x = 2 — each drawn as a vertical line.')
  })

  // The answers that stand: a bare x to a high power is the closed form, as before.
  it('x^1e9 = 0, x^(1e9) = 0, x^1e6 = 1 and x^1e6 + 1 = 0 answer as they did', async () => {
    for (const line of ['x^1e9 = 0', 'x^(1e9) = 0']) expect((await typed(line)).last.text, line).toContain('The solution is x = 0 — drawn as a vertical line.')
    expect((await typed('x^1e6 = 1')).last.text).toContain('The solutions are x = −1 and x = 1 — each drawn as a vertical line.')
    fresh()
    expect(expectRefused('x^1e6 + 1 = 0', await typed('x^1e6 + 1 = 0'))).toContain('No real x makes this true — it has no points on the graph.')
  })
})

// ---------------------------------------------------------------------------
// H18 (polish wave, part P-GRAPH). The draw check kept a 600 ms clock, so on a busy PC the answer
// changed: x² + y² = −1 − k², which no k can ever draw, ran out of time in the middle of trying the
// slider and was made with "at k = 2 there is nothing to draw; move k to see it". A check now says
// only what it found; an ordinary formula is limited by the number of values it works out, which is
// the same on every machine, and the clock stays for a formula that goes through mathjs.
// ---------------------------------------------------------------------------

describe('the draw check does not say what it has not found, however busy the PC is (polish H18)', () => {
  const DIGITS = { decimals: 2, precisionMode: 'dp' as const }
  const NO_POINT = 'no point (x, y) makes its two sides equal'
  const FAR_OUT = 'it lies more than a million units from the origin, too far out to draw'
  const implicit = (lhs: string, rhs: string) => ({ kind: 'implicit' as const, exprs: [`(${lhs}) - (${rhs})`], sides: [lhs, rhs] as [string, string] })
  const NEVER = implicit('x^2 + y^2', '-1 - k^2')
  const CIRCLE = implicit('x^2 + y^2', 'k')
  const FAR = implicit('x^2 + y^2', '4.1e13 - 4.1e13*(k - 2)^2')

  /** A clock that gains `ms` on every look at it: a PC so busy that a thousand values take that long. */
  const slowClock = (ms: number) => {
    let t = 0
    return vi.spyOn(performance, 'now').mockImplementation(() => (t += ms))
  }

  it('a formula no slider value can draw is refused on a fast PC and on a slow one, never made with a note about the slider', async () => {
    const { drawability } = await import('../src/renderer/src/core/visualize')
    // 0.001 ms a value is a busy PC for a formula the compiler computes itself (0.00007 on a quiet one).
    for (const ms of [0.3, 0.5, 0.8, 1, 1.5, 2, 4]) {
      const clock = slowClock(ms)
      try {
        const r = drawability(NEVER, { k: 2 }, DIGITS)
        expect(r.ok, `clock ${ms} ms a look`).toBe(false)
        expect(r.ok ? '' : r.reason).toContain(NO_POINT)
      } finally {
        clock.mockRestore()
      }
    }
  }, 30000)

  it('a circle that appears when k moves keeps its note on a slow PC', async () => {
    const { drawability } = await import('../src/renderer/src/core/visualize')
    for (const ms of [0.3, 1, 4]) {
      const clock = slowClock(ms)
      try {
        const r = drawability(CIRCLE, { k: -1 }, DIGITS)
        expect(r, `clock ${ms} ms a look`).toEqual({ ok: true, note: 'at k = −1 there is nothing to draw; move k to see it' })
      } finally {
        clock.mockRestore()
      }
    }
  })

  it('a curve far out is told far out, not "no point", at any speed', async () => {
    const { drawability } = await import('../src/renderer/src/core/visualize')
    for (const ms of [0.3, 1, 4]) {
      const clock = slowClock(ms)
      try {
        const r = drawability(FAR, { k: 2 }, DIGITS)
        expect(r.ok, `clock ${ms} ms a look`).toBe(false)
        expect(r.ok ? '' : r.reason).toContain(FAR_OUT)
      } finally {
        clock.mockRestore()
      }
    }
  }, 30000)

  // Past what it may spend a check keeps quiet: the graph is made, as every graph was before the
  // check, and nothing is said of the sliders or of where the curve is. Swept over limits from none
  // at all to more than the check needs, so that it is cut off in the first look, in the middle of
  // the slider's values and in the look far out.
  it('a check cut off at any point says no more than it found', async () => {
    const { drawability } = await import('../src/renderer/src/core/visualize')
    const cuts = [1, 1024, 150_000, 450_000, 800_000, 1_300_000, 5_000_000]
    const finished = { never: 0, far: 0, circle: 0 }
    for (const values of cuts) {
      const limits = { ms: 0, values }
      const never = drawability(NEVER, { k: 2 }, DIGITS, {}, limits)
      if (never.ok) expect(never.note, `NEVER cut at ${values}`).toBeUndefined()
      else {
        expect(never.reason, `NEVER cut at ${values}`).toContain(NO_POINT)
        finished.never++
      }
      const far = drawability(FAR, { k: 2 }, DIGITS, {}, limits)
      if (far.ok) expect(far.note, `FAR cut at ${values}`).toBeUndefined()
      else {
        expect(far.reason, `FAR cut at ${values}`).toContain(FAR_OUT)
        finished.far++
      }
      // A note is the true one or none: a circle for k = 1 exists, and the note says moving k shows it.
      const circle = drawability(CIRCLE, { k: -1 }, DIGITS, {}, limits)
      expect(circle.ok, `CIRCLE cut at ${values}`).toBe(true)
      if (circle.ok && circle.note) {
        expect(circle.note).toBe('at k = −1 there is nothing to draw; move k to see it')
        finished.circle++
      }
    }
    // Cut at 1 it is quiet; with room to spare every answer is there.
    expect(drawability(NEVER, { k: 2 }, DIGITS, {}, { ms: 0, values: 1 })).toEqual({ ok: true })
    expect(finished.never).toBeGreaterThan(0)
    expect(finished.far).toBeGreaterThan(0)
    expect(finished.circle).toBeGreaterThan(0)
  }, 30000)

  // A formula mathjs works out value by value is slow whatever the PC: the clock still stops it.
  // 50 ms a look is 0.05 ms a value, ten times what separates a slow formula from a busy PC.
  it('a formula that goes through mathjs is still stopped by the clock, and made quietly', async () => {
    const { drawability } = await import('../src/renderer/src/core/visualize')
    const clock = slowClock(50)
    try {
      expect(drawability(implicit('square(x) + y^2', '-5 - k^2'), { k: 2 }, DIGITS)).toEqual({ ok: true })
    } finally {
      clock.mockRestore()
    }
  })
})

// ---------------------------------------------------------------------------
// H12, round 3 (polish wave, part P-GRAPH). The line offered for a call to a graph wrote out only
// the calls to the graph met first: after g(x) = sin(x) and h(x) = x^2, y = g(x) + h(x) was offered
// as "y = (sin(x)) + h(x)", which is refused in the same words once the h is met.
// ---------------------------------------------------------------------------

describe('every graph a line calls is written out in the line offered (polish H12, round 3)', () => {
  beforeEach(fresh)

  const setup = async (...lines: string[]): Promise<void> => {
    await run(...lines)
    scene().setActiveSpace('vectors')
    scene().setViewMode('2d')
  }
  /** The line a refusal offers: what stands after "e.g." in its last sentence. */
  const offeredIn = (text: string): string => {
    const m = /, e\.g\. (y = .+)\.$/.exec(text)
    expect(m, text).not.toBeNull()
    return m?.[1] ?? ''
  }
  /** Types the line offered and returns what it draws, as a function of x. */
  const drawnBy = async (offered: string): Promise<(x: number) => number> => {
    const again = await typed(offered)
    expect(again.last.kind, `${offered} → ${again.last.text}`).toBe('result')
    const graph = again.made.find((o): o is GraphObj => o.type === 'graph')
    expect(graph, offered).toBeDefined()
    const f = compileScalar(graph?.exprs[0] ?? '0', ['x'], () => ({}))
    scene().setActiveSpace('vectors')
    scene().setViewMode('2d')
    return (x) => f({ x })
  }

  it('y = g(x) + h(x) writes out both, and says both are graphs', async () => {
    await setup('g(x) = sin(x)', 'h(x) = x^2')
    const line = 'y = g(x) + h(x)'
    const text = expectRefused(line, await typed(line))
    expect(text).toMatch(/^g and h are graphs, and a graph cannot use another graph yet — type their formulas instead, e\.g\. y = /)
    const offered = offeredIn(text)
    expect(offered, 'no call to a graph is left in it').not.toMatch(/\b[gh]\s*\(/)
    const f = await drawnBy(offered)
    for (const x of [0.7, 1.9, -2.3]) expect(f(x)).toBeCloseTo(Math.sin(x) + x * x, 9)
  })

  it('writes them out in the order they are met, and every call of each', async () => {
    await setup('g(x) = sin(x)', 'h(x) = x^2')
    const line = 'y = 2*h(x) + g(x - 1)*h(2)'
    const text = expectRefused(line, await typed(line))
    expect(text).toMatch(/^h and g are graphs, /)
    const offered = offeredIn(text)
    expect(offered).not.toMatch(/\b[gh]\s*\(/)
    const f = await drawnBy(offered)
    for (const x of [0.7, 1.9, -2.3]) expect(f(x)).toBeCloseTo(2 * x * x + Math.sin(x - 1) * 4, 9)
  })

  it('y = g(h(x)) puts the inner graph into the outer one', async () => {
    await setup('g(x) = sin(x)', 'h(x) = x^2')
    const line = 'y = g(h(x))'
    const text = expectRefused(line, await typed(line))
    expect(text).toMatch(/^g and h are graphs, /)
    const offered = offeredIn(text)
    expect(offered).not.toMatch(/\b[gh]\s*\(/)
    const f = await drawnBy(offered)
    for (const x of [0.7, 1.9, -2.3]) expect(f(x)).toBeCloseTo(Math.sin(x * x), 9)
    // and the other way round
    fresh()
    await setup('g(x) = sin(x)', 'h(x) = x^2')
    const back = 'y = h(g(x))'
    const g = await drawnBy(offeredIn(expectRefused(back, await typed(back))))
    for (const x of [0.7, 1.9, -2.3]) expect(g(x)).toBeCloseTo(Math.sin(x) ** 2, 9)
  })

  it('three graphs are listed with "and" before the last', async () => {
    await setup('g(x) = sin(x)', 'h(x) = x^2', 'p(x) = x + 1')
    const line = 'y = g(x) + h(x) + p(x)'
    const text = expectRefused(line, await typed(line))
    expect(text).toMatch(/^g, h and p are graphs, and a graph cannot use another graph yet — type their formulas instead, e\.g\. y = /)
    const f = await drawnBy(offeredIn(text))
    for (const x of [0.7, 1.9]) expect(f(x)).toBeCloseTo(Math.sin(x) + x * x + x + 1, 9)
  })

  it('one graph called twice still reads in the singular, as before', async () => {
    await setup('g(x) = sin(x)')
    expect(expectRefused('y = g(x)*g(x)', await typed('y = g(x)*g(x)'))).toBe('g is a graph, and a graph cannot use another graph yet — type its formula instead, e.g. y = sin(x)*sin(x).')
  })

  it('a graph with no one formula among them is the one named, and no line is offered that still calls it', async () => {
    await setup('g(x) = sin(x)', 'x^2 + y^2 = 9')
    const circle = Object.values(scene().objects).find((o) => o.type === 'graph' && o.kind === 'implicit')
    expect(circle, 'the circle is a graph with a name').toBeDefined()
    const name = circle?.name ?? '?'
    const line = `y = g(x) + ${name}(x)`
    expect(expectRefused(line, await typed(line))).toBe(`${name} is a graph, and a graph cannot use another graph yet — type its formula instead.`)
  })

  it('a call with other than one argument to any of them has no formula to put in its place', async () => {
    await setup('g(x) = sin(x)', 'h(x) = x^2')
    const line = 'y = g(x) + h(1, 2)'
    expect(expectRefused(line, await typed(line))).toBe('h is a graph, and a graph cannot use another graph yet — type its formula instead: h(x) is x^2.')
  })
})

// ---------------------------------------------------------------------------
// P4, round 3 (polish wave, part P-GRAPH): what an equation in x alone and a graph letter say.
// ---------------------------------------------------------------------------

describe('two solutions that print alike are told apart, and a graph letter is not offered as a slider (polish P4, round 3)', () => {
  beforeEach(() => {
    fresh()
    scene().setSettings({ decimals: 2, precisionMode: 'dp' })
  })

  // 3.004, not 3.005: since P-GRAPH2 H29 a quadratic's pair is exact, and 3.005 at two places is 3.01, which
  // already tells apart from 3 (it was 3.00499… from polyRoots).
  it('x = 3 and x = 3.004 at two decimal places are not both listed as "x = 3"', async () => {
    const { last } = await typed('(x - 3)(x - 3.004) = 0')
    expect(last.kind).toBe('result')
    expect(last.text).toContain('The solutions are x = 3 and x = 3.004 — each drawn as a vertical line.')
  })

  it('does the same in significant figures', async () => {
    scene().setSettings({ decimals: 3, precisionMode: 'sf' })
    const { last } = await typed('(x - 3)(x - 3.004) = 0')
    expect(last.text).toContain('The solutions are x = 3 and x = 3.004 — each drawn as a vertical line.')
  })

  it('adds digits only to the solutions that need them, one more at a time', async () => {
    // 3, 3.0004 and 3.0006 are all "3" at two places and tell apart at four; 0.5 and 2.25 never needed more.
    const { last } = await typed('(x - 0.5)(x - 2.25)(x - 3)(x - 3.0004)(x - 3.0006) = 0')
    expect(last.text).toContain('x = 0.5, x = 2.25, x = 3, x = 3.0004 and x = 3.0006')
  })

  it('leaves solutions that already look different as they were', async () => {
    const { last } = await typed('(x - 1)(x - 2.5) = 0')
    expect(last.text).toContain('The solutions are x = 1 and x = 2.5 — each drawn as a vertical line.')
    fresh()
    scene().setSettings({ decimals: 2, precisionMode: 'dp' })
    // An irrational solution keeps the student's two places beside a pair that needed more.
    const mixed = await typed('(x^2 - 2)(x - 3)(x - 3.005) = 0')
    expect(mixed.last.text).toMatch(/x = −1\.41, x = 1\.41, x = 3 and x = 3\.005/)
  })

  it('f(x) = y says y is the letter graphs use, not "make a slider y = 1"', async () => {
    const text = expectRefused('f(x) = y', await typed('f(x) = y'))
    expect(text).toContain('Unknown name "y"')
    expect(text).toContain('y is the letter graphs use')
    expect(text).not.toMatch(/y = 1/)
    // The other letters a graph uses are told the same; a name that could be a slider still is.
    fresh()
    expect(expectRefused('y = z + x', await typed('y = z + x'))).toContain('z is the letter graphs use')
    fresh()
    expect(expectRefused('y = 2k', await typed('y = 2k'))).toMatch(/Make a slider first, e\.g\. k = 1/)
  })
})

// ---------------------------------------------------------------------------
// H15 (polish wave, part P-GRAPH). `y'' = -y` answered "y'': Undefined symbol y" and left a number
// object y'' in the scene, because x, y and z are known to the name check (they are a graph's
// letters) and the object was added before it was evaluated.
// ---------------------------------------------------------------------------

describe('a line that fails leaves nothing behind (polish H15)', () => {
  beforeEach(fresh)

  /** What a line did: the entry it logged, and the scene's objects before and after (by name and kind). */
  const attempt = async (line: string) => {
    const kinds = () => Object.values(scene().objects).map((o) => `${o.type} ${o.name}`).sort()
    const before = kinds()
    const last = await run(line)
    return { last, before, after: kinds() }
  }

  it("y'' = -y is a differential equation, said in a sentence, and no number y'' is made", async () => {
    const { last, before, after } = await attempt("y'' = -y")
    expect(last.kind).toBe('error')
    expect(last.text).toBe("y'' = -y looks like a differential equation, and the bar cannot solve those. Type the graph you expect instead, e.g. y = sin(x).")
    expect(after).toEqual(before)
  })

  it("f'' = 3 with no f says the same, and makes nothing", async () => {
    const { last, before, after } = await attempt("f'' = 3")
    expect(last.kind).toBe('error')
    expect(last.text).toMatch(/^f'' = 3 looks like a differential equation/)
    expect(after).toEqual(before)
    // The curly primes the app writes are primes too.
    const again = await attempt('g″ = 2')
    expect(again.last.text).toMatch(/^g″ = 2 looks like a differential equation/)
    expect(again.after).toEqual(again.before)
  })

  it("A' = (1, 2) still makes a point A', and so do the other primed names that are names", async () => {
    const { last } = await attempt("A' = (1, 2)")
    expect(last.kind).toBe('result')
    pointNamed("A'", [1, 2, 0])
    // a capital with two primes (the bar's own A″), a small letter with one prime (v′ beside v), and a doubled one beside its letter
    await run("A'' = (3, 4)", "v' = 5", 'f = 2', "f'' = 3")
    expect(errors()).toEqual([])
    pointNamed("A''", [3, 4, 0])
    expect(named("v'")?.type).toBe('number')
    expect(named("f''")?.type).toBe('number')
  })

  it('a line that uses y, x or z as a value says they are the graph letters, and makes nothing', async () => {
    for (const line of ['A = y + 1', 'B = <y, 1>', 'C = (x, 2)', 'n = 2z']) {
      const { last, before, after } = await attempt(line)
      expect(last.kind, line).toBe('error')
      expect(last.text, line).toMatch(/is the letter graphs use, so it has no value of its own here\. Use another letter for a number, e\.g\. a = 2\.$/)
      expect(last.text, line).not.toMatch(/Undefined symbol|\(1, 2\)/)
      expect(after, line).toEqual(before)
    }
    // and the same words for a bare x on the bar, where "create it first, e.g. x = (1, 2)" was refused
    const bare = await attempt('x + 1')
    expect(bare.last.text).toMatch(/^x is the letter graphs use/)
  })

  it('a line that cannot work leaves the old definition as it was', async () => {
    await run('a = 1')
    const { last, before, after } = await attempt('a = a + y')
    expect(last.kind).toBe('error')
    expect(after).toEqual(before)
    expect(computedOf('a')).toEqual({ type: 'number', value: 1 })
    expect(scene().ev.errors.get(scene().ev.names.get('a') ?? '')).toBeUndefined()
    // a loop is refused the same way, new name or old
    const loop = await attempt('n = n + 1')
    expect(loop.last.kind).toBe('error')
    expect(loop.last.text).toBe('n: n needs itself. This is a loop — give it a value that does not depend on it.')
    expect(loop.after).toEqual(loop.before)
    const again = await attempt('a = a * 2')
    expect(again.last.text).toBe('a: a needs itself. This is a loop — give it a value that does not depend on it.')
    expect(computedOf('a')).toEqual({ type: 'number', value: 1 })
  })

  it('a number that is not one can never become one, so 1/0 is refused', async () => {
    const { last, before, after } = await attempt('a = 1/0')
    expect(last.kind).toBe('error')
    expect(last.text).toBe('a: not a number')
    expect(after).toEqual(before)
  })

  it('but a value that mends when a slider moves stays, with its error said', async () => {
    await run('k = 0')
    const { last } = await attempt('a = 1/k')
    expect(last.kind).toBe('error')
    expect(last.text).toBe('a: not a number')
    expect(named('a')?.type).toBe('number')
    await run('k = 2')
    expect(computedOf('a')).toEqual({ type: 'number', value: 0.5 })
  })
})

// ---------------------------------------------------------------------------
// H8, the z of it (polish wave, part P-GRAPH). The example in the refusal was always two
// coordinates, so z = (1, 2, 3) was told "call it something else, e.g. P = (1, 2)".
// ---------------------------------------------------------------------------

describe('the example offered for a point or a vector named z has the student\'s coordinates (polish H8, z)', () => {
  beforeEach(fresh)

  it('three coordinates typed are three coordinates offered', async () => {
    for (const [line, example] of [
      ['z = (1, 2, 3)', 'P = (1, 2, 3)'],
      ['z = <1, 2, 3>', 'A = <1, 2, 3>'],
      ['y = (4, 5, 6)', 'P = (1, 2, 3)'],
      // typed with three coordinates, whatever the third is
      ['x = (1, 2, 0)', 'P = (1, 2, 3)']
    ]) {
      fresh()
      expect(expectRefused(line, await typed(line)), line).toMatch(new RegExp(`${example.replace(/[()<>]/g, (c) => '[' + c + ']')}[.]$`))
    }
  })

  it('two coordinates stay two, and the example is a free letter as before', async () => {
    await run('P = (5, 5)', 'A = <1, 1>')
    expect(expectRefused('z = (1, 2)', await typed('z = (1, 2)'))).toMatch(/e\.g\. Q = \(1, 2\)\.$/)
    expect(expectRefused('z = <1, 2>', await typed('z = <1, 2>'))).toMatch(/e\.g\. B = <1, 2>\.$/)
    expect(expectRefused('z = (7, 8, 9)', await typed('z = (7, 8, 9)'))).toMatch(/e\.g\. Q = \(1, 2, 3\)\.$/)
  })

  it('a sum of vectors the scene holds is offered in the dimensions it has', async () => {
    await run('A = <1, 2, 3>', 'B = <0, 1, 1>')
    expect(expectRefused('z = A + B', await typed('z = A + B'))).toMatch(/cannot name a vector — call it something else, e\.g\. C = <1, 2, 3>\.$/)
    fresh()
    await run('A = <1, 2>', 'B = <0, 1>')
    expect(expectRefused('z = A + B', await typed('z = A + B'))).toMatch(/e\.g\. C = <1, 2>\.$/)
  })
})

// ---------------------------------------------------------------------------
// H9 (polish wave, part P-GRAPH). The · key scales a vector when one side is a number, and kind
// inference knew it, but the bar's own rewrite of the line only knew the × key: `2·A` printed a
// bare "= [2, 4, 0]" with no steps, and `C = 2·A` was refused with "C: not a number".
// ---------------------------------------------------------------------------

describe('the · key between a number and a vector is a scaled vector, as × is (polish H9)', () => {
  beforeEach(async () => {
    fresh()
    await run('A = <1, 2>', 'B = <3, 4>')
    scene().clearLog()
  })

  it('a number · a vector is answered as a vector, with its steps, whichever side the number is on', async () => {
    for (const line of ['2·A', 'A·2', '2⋅A']) {
      scene().clearLog()
      const last = await run(line)
      expect(errors(), line).toEqual([])
      expect(last.text ?? '', line).not.toMatch(/\[/)
      expect(last.tex, line).toContain('2\\hat{i} + 4\\hat{j}')
      expect(last.solution?.title, line).toBe('R = 2A')
    }
  })

  it('C = 2·A is kept as a live vector (2, 4) that follows A', async () => {
    let last = await run('C = 2·A')
    expect(errors()).toEqual([])
    expect(last.solution?.title).toBe('C = 2A')
    vectorNamed('C', [2, 4, 0])
    expect((named('C') as VectorObj).def.kind, 'live, follows A').toBe('expr')
    await run('D = A·2', 'G = 10 N ∠ 30°', 'H = 2·G')
    expect(errors()).toEqual([])
    vectorNamed('D', [2, 4, 0])
    vectorNamed('H', [17.321, 10, 0])
    last = await run('A = <1, 1>')
    expect(errors()).toEqual([])
    vectorNamed('C', [2, 2, 0])
    expect(last.kind).toBe('result')
  })

  it('two vectors are still the dot product with its steps, and two numbers multiply', async () => {
    const last = await run('A·B')
    expect(errors()).toEqual([])
    expect(last.text).toBe('= 11')
    expect(last.solution).toBeTruthy()
    expect((await run('2·3')).text).toBe('= 6')
    expect(computedOf('k')).toBeUndefined()
    await run('k = 2·3')
    expect(errors()).toEqual([])
    expect(computedOf('k')).toEqual({ type: 'number', value: 6 })
  })
})

// ---------------------------------------------------------------------------
// H22 (polish wave, part P-GRAPH). The polar route spelt θ as theta with a bare replace before
// anything else read the line, so a slider written against it was glued to it: r = aθ became
// "atheta", a name nobody has, and was refused as one.
// ---------------------------------------------------------------------------

describe('a polar curve reads a slider or a call written against θ as a product (polish H22)', () => {
  beforeEach(fresh)

  const rAt = (g: GraphObj, theta: number): number => compileScalar(g.exprs[0], ['theta', 't'], () => scene().ev.scope)({ theta, t: theta })

  it('draws r = aθ, r = a θ, r = 2θ, r = 2cos(3θ) and r = θ, each with the value it is written with', async () => {
    for (const [line, at1] of [
      ['r = aθ', 2],
      ['r = a θ', 2],
      ['r = 2θ', 2],
      ['r = 2cos(3θ)', 2 * Math.cos(3)],
      ['r = θ', 1],
      ['r = 2aθ', 4],
      ['r = θa', 2],
      ['r = θcos(θ)', Math.cos(1)]
    ] as [string, number][]) {
      fresh()
      await run('a = 2')
      const g = expectDrawn(line, await typed(line), /^Polar curve created/, 'polar')
      expect(rAt(g, 1), line).toBeCloseTo(at1, 9)
    }
  })

  it('follows the slider when it moves', async () => {
    await run('a = 2')
    const g = expectDrawn('r = aθ', await typed('r = aθ'), /^Polar curve created/, 'polar')
    await run('a = 3')
    expect(rAt(g, 1)).toBeCloseTo(3, 9)
  })

  it('still names a slider that does not exist', async () => {
    const text = expectRefused('r = qθ', await typed('r = qθ'))
    expect(text).toMatch(/Unknown name "q"/)
  })
})

// ---------------------------------------------------------------------------
// H24 (polish wave, part P-GRAPH). The parser's own words ("Value expected (char 1)",
// "Unexpected operator , (char 2)") reached students. On this branch friendlyError already says
// each in words; what was left is the comma: 1,000 typed for a thousand was told to "write a
// decimal with a point, e.g. 2.5", which makes it 1.000 — one.
// ---------------------------------------------------------------------------

describe('a line the parser cannot read is answered in words (polish H24)', () => {
  beforeEach(fresh)

  it('refuses each in a sentence, never in the parser\'s words, and makes nothing', async () => {
    for (const line of ['1,000', ')', '(2 + 3', '2 +', '*3', 'y = (2,', '2)', '3 * * 4', 'k = 1,000']) {
      fresh()
      expectRefused(line, await typed(line))
    }
  })

  it('a comma between digits is told how a thousand and a decimal are typed', async () => {
    const COMMA = /a comma separates coordinates and inputs — type 1000 for a thousand, or 1\.5 for a decimal\.$/i
    for (const line of ['1,000', 'k = 1,000', '2,5']) {
      fresh()
      expect(expectRefused(line, await typed(line)), line).toMatch(COMMA)
    }
    fresh()
    expect(expectRefused('y = 2,5', await typed('y = 2,5'))).toMatch(/^That graph cannot be drawn: a comma separates coordinates and inputs/)
  })

  it('3 ++ 4 is 3 + (+4), as a scientific calculator reads it', async () => {
    expect((await run('3 ++ 4')).text).toBe('= 7')
    expect(errors()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// H16 (polish wave, part P-GRAPH). The decimal beside an exact form was written to ten places
// whatever the settings said: at 2 d.p. `1/3` read "= 1/3 ≈ 0.3333333333".
// ---------------------------------------------------------------------------

describe("the decimal beside an exact form is in the student's precision (polish H16)", () => {
  beforeEach(fresh)

  const exactThird = () => vi.mocked(cas).mockResolvedValueOnce({ latex: '\\frac{1}{3}', text: '1/3', numeric: null })
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('1/3 reads ≈ 0.33 at 2 decimal places and ≈ 0.333 at 3 significant figures', async () => {
    scene().setSettings({ decimals: 2, precisionMode: 'dp' })
    exactThird()
    await run('1/3')
    await settle()
    expect(scene().log.at(-1)?.tex).toBe('= \\frac{1}{3} \\approx 0.33')
    scene().setSettings({ decimals: 3, precisionMode: 'sf' })
    exactThird()
    await run('1/3')
    await settle()
    expect(scene().log.at(-1)?.tex).toBe('= \\frac{1}{3} \\approx 0.333')
    expect(casCalls().map((c) => c[0])).toEqual(['exact', 'exact'])
    scene().setSettings({ decimals: 2, precisionMode: 'dp' })
  })
})

// ---------------------------------------------------------------------------
// H20 (polish wave, part P-GRAPH). A slider's range comes from its value, so the cross-product
// lesson's k = 60 stopped at 120 while the lesson says "Past 180°, C flips downward".
// ---------------------------------------------------------------------------

describe('a slider used as an angle in degrees reaches a full turn (polish H20)', () => {
  beforeEach(fresh)

  const sliderOf = (name: string) => (named(name) as unknown as { slider?: { min: number; max: number; step: number } }).slider

  it("the cross-product lesson's k can be dragged past 180°, and its value stays inside the range", async () => {
    for (const line of ['3d', 'k = 60', 'A = <3, 0, 0>', 'B = 3 ∠ k°', 'C = A × B', 'Polygon((0,0,0), A, A + B, B)', 'A × B']) await run(line)
    expect(errors()).toEqual([])
    const k = sliderOf('k')
    expect(k?.max).toBeGreaterThanOrEqual(360)
    expect(k?.min).toBeLessThanOrEqual(0)
    expect(computedOf('k')).toEqual({ type: 'number', value: 60 })
  })

  it('a slider not used as an angle in degrees keeps the range its value gave it', async () => {
    await run('a = 2', 'k = 60', 'A = <1, 0>')
    const before = { a: sliderOf('a'), k: sliderOf('k') }
    expect(before.a).toEqual({ min: -5, max: 10, step: 0.1 })
    expect(before.k).toEqual({ min: -60, max: 120, step: 0.1 })
    // In radians, as a length, or as a factor: none of these is an angle in degrees.
    await run('B = 2 ∠ k', 'C = a·A', 'D = 3 ∠ 30°', 'm = 2a')
    expect(errors()).toEqual([])
    expect(sliderOf('a')).toEqual(before.a)
    expect(sliderOf('k')).toEqual(before.k)
  })

  it('a wider range the student already has is kept, and one undo takes the line back with it', async () => {
    await run('k = -400')
    const wide = sliderOf('k')
    expect(wide?.min).toBeLessThan(-360)
    await run('B = 3 ∠ k°')
    expect(sliderOf('k')?.min).toBe(wide?.min)
    expect(sliderOf('k')?.max).toBeGreaterThanOrEqual(360)
    fresh()
    await run('k = 60', 'B = 3 ∠ k°')
    scene().undo()
    expect(named('B')).toBeUndefined()
    expect(sliderOf('k')).toEqual({ min: -60, max: 120, step: 0.1 })
  })
})

// ---------------------------------------------------------------------------
// H23 (polish wave, part P-GRAPH). angle( ) and Vector( ) chose between the vector solver and the
// geometry command by the inputs' names alone, and splitArgs cuts <1, 0> at its comma: so
// angle(<1, 0>, <0, 1>) went to the geometry Angle and was told "Wrong inputs for Angle".
// ---------------------------------------------------------------------------

describe('angle( ) of two vectors goes to the vector solver, whether they are names or typed (polish H23)', () => {
  beforeEach(fresh)

  const answerFor = async (...lines: string[]) => {
    fresh()
    const last = await run(...lines)
    expect(errors(), lines.join(' ; ')).toEqual([])
    return { text: last.text, tex: last.tex, steps: last.solution?.steps?.length ?? 0, kind: last.kind }
  }

  it('answers angle(<1, 0>, <0, 1>) as it answers the same two vectors by name, with the steps', async () => {
    const byName = await answerFor('A = <1, 0>', 'B = <0, 1>', 'angle(A, B)')
    expect(byName.kind).toBe('result')
    expect(byName.steps).toBeGreaterThan(0)
    expect(await answerFor('angle(<1, 0>, <0, 1>)')).toEqual(byName)
    expect(await answerFor('B = <0, 1>', 'angle(<1, 0>, B)')).toEqual(byName)
    expect(await answerFor('A = <1, 0>', 'angle(A, <0, 1>)')).toEqual(byName)
    expect(await answerFor('A = <1, 0>', 'B = <0, 1>', 'angle(2A, B)')).toEqual(byName)
    expect(JSON.stringify(byName)).toMatch(/90/)
  })

  it('three points stay the geometry angle', async () => {
    await run('P = (0, 0)', 'Q = (1, 0)', 'S = (0, 1)')
    const { last, made } = await typed('angle(Q, P, S)')
    expect(errors()).toEqual([])
    expect(last.kind).toBe('result')
    expect(made.map((o) => o.type)).toContain('angle')
  })

  it('every vector-solver command reads a vector typed in angle brackets as one input', async () => {
    // cross(A, <1, 0>) was refused with the parser's "Value expected": its "<1" was one input.
    await run('A = <1, 2>')
    const last = await run('cross(A, <1, 0>)')
    expect(errors()).toEqual([])
    expect(last.tex).toContain('-2\\hat{k}')
    expect((await run('add(<1, 0>, <0, 1>)')).tex).toContain('1\\hat{i} + 1\\hat{j}')
    expect(errors()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// H12w (polish wave, part P-GRAPH). The line offered in place of a call to a graph was always
// "y = …" and in the parser's own spelling: tangent(g(x), 1) was offered "y = (sin(x))", and with
// g(x) = x^2, y = g(2x) was offered "y = ((2 x) ^ 2)".
// ---------------------------------------------------------------------------

describe('the line offered for a call to a graph is the line typed, written as a student writes it (polish H12w)', () => {
  const LEAD = 'is a graph, and a graph cannot use another graph yet — type its formula instead, e.g.'
  beforeEach(fresh)

  const offeredFor = async (setup: string, line: string): Promise<string> => {
    fresh()
    await run(setup)
    scene().setActiveSpace('vectors')
    scene().setViewMode('2d')
    scene().clearLog()
    const text = expectRefused(line, await typed(line))
    expect(text, line).toContain(LEAD)
    return text.slice(text.indexOf('e.g. ') + 5).replace(/\.$/, '')
  }

  it('tangent(g(x), 1) is offered tangent(sin(x), 1), and that line draws the tangent', async () => {
    const offered = await offeredFor('g(x) = sin(x)', 'tangent(g(x), 1)')
    expect(offered).toBe('tangent(sin(x), 1)')
    scene().clearLog()
    const again = await typed(offered)
    expect(again.last.kind, `${offered} → ${again.last.text}`).toBe('result')
    expect(errors()).toEqual([])
  })

  it('y = g(2x) with g(x) = x^2 is offered y = (2x)^2, and that line draws the same curve', async () => {
    for (const [line, offered] of [
      ['y = g(2x)', 'y = (2x)^2'],
      ['y = g(x + 1)', 'y = (x + 1)^2'],
      ['y = 3g(x)', 'y = 3x^2'],
      ['y = g(x)/2', 'y = x^2/2']
    ]) {
      expect(await offeredFor('g(x) = x^2', line), line).toBe(offered)
      const again = await typed(offered)
      expect(again.last.kind, `${offered} → ${again.last.text}`).toBe('result')
    }
  })

  // mathjs writes x times (1 / x) as "x * 1 / x", which is another shape, and failing that as
  // "x (1 / x)". Since P-PARSE R1 a letter against a bracket is a product, so it is offered as written on paper.
  it('x times a graph that is a quotient is offered as a product with its bracket, and that line draws', async () => {
    for (const [formula, offered] of [
      ['1/x', 'y = x(1/x)'],
      ['x/(x + 1)', 'y = x(x/(x + 1))']
    ]) {
      expect(await offeredFor(`g(x) = ${formula}`, 'y = x g(x)'), formula).toBe(offered)
      const again = await typed(offered)
      expect(again.last.kind, `${offered} → ${again.last.text}`).toBe('result')
    }
  })

  it('whatever graph and whatever way of writing the call, the line offered draws and is the curve that was typed', async () => {
    const GRAPHS = ['sin(x)', 'x^2', '1/x', 'e^x', '2x + 1', 'x/(x + 1)', 'x^3 - 2x', '-x^2', 'abs(x)']
    const LINES = [
      'y = g(2x)', 'y = 2g(x)', 'y = g(x)^2', 'y = g(x)g(x)', 'y = g(x)/g(x + 1)', 'y = -g(x)', 'y = g(-x)', 'y = g(x) - g(x - 1)',
      'y = g(x^2)', 'y = g(pi*x)', 'y = 1/g(x)', 'y = 2^g(x)', 'y = g(g(x))', 'y = x g(x)', 'y = x^2 g(x)', 'y = (x + 1) g(x)',
      'y = g(x) (x + 1)', 'y = x/g(x)', 'y = (g(x) + 1)^2', 'y = g(x) - (g(x) - 1)', 'y = g(2x)/(1 + g(x))'
    ]
    // Points where every graph above has a real value, so a difference is a difference of formula.
    const AT = [1.37, 1.9, 2.3, 3.1]
    const bad: string[] = []
    for (const formula of GRAPHS) {
      const g = (v: number): number => Number(math.evaluate(preprocess(formula), { x: v }))
      const value = (text: string, scope: Record<string, unknown>, x: number): number => Number(math.evaluate(preprocess(text.replace(/^y = /, '')), { ...scope, x }))
      for (const line of LINES) {
        const offered = await offeredFor(`g(x) = ${formula}`, line)
        const differs = AT.some((x) => {
          const want = value(line, { g }, x)
          return !(Math.abs(want - value(offered, {}, x)) <= 1e-9 * Math.max(1, Math.abs(want)))
        })
        const again = await typed(offered)
        if (differs || again.last.kind !== 'result') bad.push(`g(x) = ${formula}: ${line} → ${offered} (${differs ? 'another curve' : again.last.text})`)
      }
    }
    expect(bad).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// H17 (polish wave, part P-GRAPH). A power of ten in a plain sentence or a label written on a
// drawing came out in the plain-text form of the calculator's own answer line, "1×10^9", with a
// caret. Every such sentence and label now goes through fmtLabel (math/format.ts): "1 × 10⁹".
// (The answer lines themselves, "= 1×10^9", keep the calculator's form.)
// ---------------------------------------------------------------------------

describe('a power of ten in a sentence or a label on a drawing is raised, never written with a caret (polish H17)', () => {
  beforeEach(fresh)
  const CARET = /×\s?10\^/

  const labelOf = (name: string, made: SceneObject[]): string => {
    const o = made.find((m) => m.type === 'text' && m.name === name)
    return o && o.type === 'text' ? o.text : '(no such label)'
  }

  it('the slope and the point of a tangent, in the sentence and on the drawing', async () => {
    const { last, made } = await typed('tangent(1e-9*x, 1e9)')
    expect(errors()).toEqual([])
    expect(last.text).toMatch(/^Tangent drawn at x = 1\u00a0×\u00a010⁹\. Its slope is 1\u00a0×\u00a010⁻⁹\./)
    expect(labelOf('slopeText', made)).toBe('slope = 1\u00a0×\u00a010⁻⁹')
    const tangent = made.find((m) => m.type === 'graph' && m.name === 'tangent')
    expect(tangent && tangent.type === 'graph' ? tangent.source : '(no tangent)').toBe('tangent at x = 1\u00a0×\u00a010⁹')
  })

  it('the area between two curves, in the sentence and on the drawing', async () => {
    const { last, made } = await typed('between(1e-9*x^2, 0, 0, 1)')
    expect(errors()).toEqual([])
    expect(last.text).toMatch(/^Region shaded\. Area between the curves from x = 0 to 1: 3\.33\u00a0×\u00a010⁻¹⁰\./)
    expect(labelOf('areaText', made)).toBe('area = 3.33\u00a0×\u00a010⁻¹⁰')
  })

  it('the two curves that are the same between far-off bounds, and a slider whose value shows nothing', async () => {
    const same = expectRefused('between(x, x, 1e10, 2e10)', await typed('between(x, x, 1e10, 2e10)'))
    expect(same).toBe('The two curves are the same between x = 1\u00a0×\u00a010¹⁰ and 2\u00a0×\u00a010¹⁰, so there is no region between them.')
    fresh()
    await run('k = 1e10')
    const { last } = await typed('x^2 + y^2 = -k')
    expect(last.text).toContain('at k = 1\u00a0×\u00a010¹⁰ there is nothing to draw; move k to see it')
    expect(errors()).toEqual([])
  })

  it('no sentence of these routes keeps the caret form', async () => {
    for (const line of ['tangent(x^3, 1000)', 'tangent(1e-9*x, 1e9)', 'between(x, x, 1e10, 2e10)', 'between(1e-9*x^2, 0, 0, 1)']) {
      fresh()
      const { last } = await typed(line)
      expect(last.text, line).not.toMatch(CARET)
    }
  })
})

// ---------------------------------------------------------------------------
// H24 (polish wave, part P-GRAPH). After f(x) = x^2, a = f(2) said the evaluator's own words,
// "Undefined function f", and so did f(2), 1 + f(2), (f(2), 1) and a = f(x).
// ---------------------------------------------------------------------------

describe('a graph used as a number in a formula is told so in words, never "Undefined function" (polish H24)', () => {
  beforeEach(fresh)

  it('a = f(2) after f(x) = x^2, and every other place a number is read', async () => {
    await run('f(x) = x^2')
    for (const line of ['a = f(2)', 'f(2)', 'a = 1 + f(2)', 'A = (f(2), 1)', 'a = f(x)']) {
      const last = await run(line)
      expect(last.kind, line).toBe('error')
      expect(last.text, line).toBe('f is a graph, so it cannot be used as a number in a formula yet.')
    }
    // Nothing was made by the refused lines.
    expect(named('a')).toBeUndefined()
    expect(named('A')).toBeUndefined()
  })

  it('names the graph that was called, whatever its name', async () => {
    await run('h(x) = sin(x)')
    expect((await run('b = h(1)')).text).toBe('h is a graph, so it cannot be used as a number in a formula yet.')
  })

  it('a function that does not exist is told so in words as well', async () => {
    await run('f(x) = x^2')
    for (const line of ['b = foo(2)', 'foo(2)']) {
      const last = await run(line)
      expect(last.kind, line).toBe('error')
      expect(last.text, line).toBe('PhysLab does not know a function called "foo".')
    }
  })

  it('keeps what already works: a real function, a slider and a graph in a graph formula', async () => {
    await run('f(x) = x^2')
    expect((await run('a = sqrt(16)')).kind).toBe('result')
    // g(x) = f(2) + x is the graph route's own sentence (polish H12), unchanged.
    expect((await run('g(x) = f(2) + x')).text).toMatch(/^f is a graph, and a graph cannot use another graph yet/)
  })
})

// ---------------------------------------------------------------------------
// H26 (polish wave, part P-GRAPH). (x − 1)(x − 1.0000000000001) = 0 was answered "No real x ..." with
// "x = 1 ± 3.57×10^-9i": the PhysLab Calculator's polyRoots is good to about 10⁻⁸ beside a double
// root, and read a pair of real solutions 10⁻¹³ apart as a complex pair. The discriminant of
// its exact coefficients is 10⁻²⁶, positive, so both solutions are real.
// ---------------------------------------------------------------------------

describe('a quadratic with two real solutions that are very close is not called complex (polish H26)', () => {
  beforeEach(fresh)

  it('(x - 1)(x - 1.0000000000001) = 0 has real solutions, drawn as vertical lines', async () => {
    for (const line of ['(x - 1)(x - 1.0000000000001) = 0', 'x^2 - 2.0000000000001x + 1.0000000000001 = 0']) {
      fresh()
      const { last, made } = await typed(line)
      expect(errors(), line).toEqual([])
      expect(last.kind, `${line} → ${last.text}`).toBe('result')
      expect(last.text, line).toMatch(/^The solution is x = 1 — drawn as a vertical line\./)
      expect(made.some((o) => o.type === 'graph'), line).toBe(true)
    }
  })

  it('the same on the negative side, and with a bigger gap that polyRoots also misread', async () => {
    for (const [line, says] of [
      ['(x + 1)(x + 1.0000000000001) = 0', /^The solution is x = −1 — drawn as a vertical line\./],
      // 10⁻¹⁰ apart is two solutions, as (x − 1)² = 10⁻²⁰ is 1 ± 10⁻¹⁰ (P-GRAPH2 H29); 10⁻¹³ apart is one.
      ['(x - 3)(x - 3.0000000001) = 0', /^The solutions are x = 3 and x = 3\.0000000001 — each drawn as a vertical line\./]
    ] as [string, RegExp][]) {
      fresh()
      const { last } = await typed(line)
      expect(last.kind, `${line} → ${last.text}`).toBe('result')
      expect(last.text, line).toMatch(says)
    }
  })

  it('a quadratic whose discriminant is truly negative is still complex', async () => {
    const line = 'x^2 - 2x + 1.000001 = 0'
    expect(expectRefused(line, await typed(line))).toContain('No real x makes this true')
  })
})

describe('fixb-f4-sin-at-30 — typing "sin at 30" on the bar', () => {
  beforeEach(resetGlobals)

  describe('F4: typing "sin at 30"', () => {
    it('throws "The size before ∠ must be a number..." rather than "does not exist yet"', async () => {
      await runCommand('sin at 30')
      const lastLog = scene().log.at(-1)
      expect(lastLog?.kind).toBe('error')
      expect(lastLog?.text).toBe('The size before ∠ must be a number, like 10∠30° or 10 N at 30°.')
    })

    it('only there: a function name typed as a value still "does not exist yet", and makes nothing (checker review)', async () => {
      for (const line of ['a = gamma', 'E = gamma * m', 'W = 5 * distance', 'sum']) {
        scene().newScene()
        scene().clearLog()
        await runCommand(line)
        expect(scene().log.at(-1)?.text, line).toMatch(/does not exist yet/)
        expect(Object.keys(scene().objects), line).toEqual([])
      }
    })
  })
})

describe('CW7c: unit conversions and implicit curve undefined variable check', () => {
  beforeEach(resetGlobals)

  it('x = 2ly refuses undefined variable "ly" with a slider note rather than creating an implicit curve', async () => {
    await runCommand('x = 2ly')
    const lastLog = scene().log.at(-1)
    expect(lastLog?.kind).toBe('error')
    expect(lastLog?.text).toContain('Unknown name "ly" in the equation. Make a slider first, e.g. ly = 1')
  })

  it('converts units using "to" and handles incompatible units via calc/units.ts', async () => {
    await runCommand('5 km to m')
    const kmLog = scene().log.at(-1)
    expect(kmLog?.kind).toBe('result')
    expect(kmLog?.text).toContain('5000 m')

    await runCommand('5 km to kg')
    const kgLog = scene().log.at(-1)
    expect(kgLog?.kind).toBe('error')
    expect(kgLog?.text).toMatch(/measure different things/)
  })
})

describe('P-FIX-REVIEWS CW7c M1 and M2: variable names vs units and prototype keys', () => {
  beforeEach(resetGlobals)

  it('plain names u, pc, kn, Da, AU, amu, ly are not mistaken for units', async () => {
    const plainCases: [string, string][] = [
      ['u + 1', 'u'],
      ['2u', 'u'],
      ['v = u + 2', 'u'],
      ['s = u * 3 + a', 'u'],
      ['u + (5 kg to g)', 'u'],
      ['ly + 1', 'ly'],
      ['ly * 3 + a', 'ly'],
      ['pc + 1', 'pc'],
      ['kn + 1', 'kn'],
      ['Da + 1', 'Da'],
      ['AU + 1', 'AU'],
      ['amu + 1', 'amu']
    ]
    for (const [expr, sym] of plainCases) {
      await runCommand(expr)
      const last = scene().log.at(-1)
      expect(last?.kind).toBe('error')
      expect(last?.text).toContain(`"${sym}" does not exist yet. Create it first`)
      expect(last?.text).not.toContain("I don't know the unit")
    }
  })

  it('unit positions for TYPE_INSTEAD trigger helpful unit advice', async () => {
    const unitCases: [string, string][] = [
      ['2 ly', 'lightyear'],
      ['5 ly to m', 'lightyear'],
      ['5 m to ly', 'lightyear'],
      ['3 amu', 'dalton'],
      ['5 pc to m', 'parsec'],
      ['5 u to kg', 'dalton'],
      ['5 kg to u', 'dalton'],
      ['5 kn to m/s', 'knot'],
      ['2 Da', 'dalton'],
      ['2 AU', 'au']
    ]
    for (const [expr, advice] of unitCases) {
      await runCommand(expr)
      const last = scene().log.at(-1)
      expect(last?.kind).toBe('error')
      expect(last?.text).toContain("I don't know the unit")
      expect(last?.text).toContain(advice)
    }
  })

  it('mixed expressions inspect specific symbol node occurrence in traversal order', async () => {
    // Plain variable occurrence first -> "does not exist yet"
    await runCommand('u + (5 kg to u)')
    let last = scene().log.at(-1)
    expect(last?.kind).toBe('error')
    expect(last?.text).toContain('"u" does not exist yet')
    expect(last?.text).not.toContain("I don't know the unit")

    await runCommand('ly + (5 m to ly)')
    last = scene().log.at(-1)
    expect(last?.kind).toBe('error')
    expect(last?.text).toContain('"ly" does not exist yet')
    expect(last?.text).not.toContain("I don't know the unit")

    // Unit position occurrence first -> unit advice
    await runCommand('(5 kg to u) + z')
    last = scene().log.at(-1)
    expect(last?.kind).toBe('error')
    expect(last?.text).toContain("I don't know the unit \"u\"")

    await runCommand('(5 m to ly) + x')
    last = scene().log.at(-1)
    expect(last?.kind).toBe('error')
    expect(last?.text).toContain("I don't know the unit \"ly\"")
  })

  it('non-numeric left operand before unit name does not trigger unit advice', async () => {
    await runCommand('(u + 1) AU')
    let last = scene().log.at(-1)
    expect(last?.kind).toBe('error')
    expect(last?.text).toContain('"u" does not exist yet')
    expect(last?.text).not.toContain("I don't know the unit")

    await runCommand('(x / y) pc')
    last = scene().log.at(-1)
    expect(last?.kind).toBe('error')
    expect(last?.text).toContain('"pc" does not exist yet')
    expect(last?.text).not.toContain("I don't know the unit")

    await runCommand('a = 5')
    await runCommand('(a + 1) ly')
    last = scene().log.at(-1)
    expect(last?.kind).toBe('error')
    expect(last?.text).toContain('"ly" does not exist yet')
    expect(last?.text).not.toContain("I don't know the unit")

    for (const [expr, sym] of [
      ['ly^2', 'ly'],
      ['x / ly', 'ly'],
      ['pc / s', 'pc'],
      ['3 * ly', 'ly'],
      ['2 / ly', 'ly'],
      ['2 * x * ly', 'ly'],
      ['2 ^ ly', 'ly'],
      ['3 * pc + 1', 'pc'],
      ['x ly to m', 'ly'],
      ['(a+1) AU to m', 'AU']
    ] as const) {
      await runCommand(expr)
      last = scene().log.at(-1)
      expect(last?.kind).toBe('error')
      expect(last?.text).toContain(`"${sym}" does not exist yet`)
      expect(last?.text).not.toContain("I don't know the unit")
    }

    await runCommand('a = 5')
    await runCommand('(a+1) AU to m')
    last = scene().log.at(-1)
    expect(last?.kind).toBe('error')
    expect(last?.text).toContain('"AU" does not exist yet')
    expect(last?.text).not.toContain("I don't know the unit")
  })

  it('prototype keys do not hit TYPE_INSTEAD unit advice or show JS words', async () => {
    for (const expr of ['valueOf + 1', 'toString', 'constructor + 1', '2 constructor']) {
      await runCommand(expr)
      const last = scene().log.at(-1)
      expect(last?.kind).toBe('error')
      expect(last?.text).not.toContain('undefined')
      expect(last?.text).not.toContain('Object')
      expect(last?.text).not.toContain('I don\'t know the unit')
      expect(last?.text).toMatch(/does not exist yet|not a function|cannot read/i)
    }
  })
})


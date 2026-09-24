// The command bar (lang/commands.ts) is the app's primary input, and until now nothing tested it
// end to end: each solver had its own tests, and the routing from a typed line to the right one
// had none. These run real lines through runCommand against the real scene store, no DOM.
//
// Two things are mocked. The SymPy worker cannot start here, so `cas` records what it was asked
// and answers with a stand-in; and the stylesheet is not loaded, so colours fall back.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import katex from 'katex'

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

import { HELP, runCommand } from '../src/renderer/src/lang/commands'
import { QUICK_EXAMPLES } from '../src/renderer/src/ui/quickExamples'
import { scene, type LogEntry } from '../src/renderer/src/core/store'
import type { GraphObj, SceneObject, VectorObj } from '../src/renderer/src/core/types'
import { cas } from '../src/renderer/src/math/cas'
import { usePure } from '../src/renderer/src/math/pure/store'
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
      expect(last.tex).toContain('triangle, area } 6')
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
    // algebra engine answers before the line is even logged, so the exact form is already there).
    expect((await run('divide(pi, 2)')).tex).toMatch(/\\approx 1\.5707963/)
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
    // follows the fx-991EX, but the line has to say which unit it used.
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

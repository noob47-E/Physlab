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
import type { SceneObject, VectorObj } from '../src/renderer/src/core/types'
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
  { line: 'undo', check: () => expect(errors()).toEqual([]) },
  { line: 'clear', check: () => expect(scene().order).toEqual([]) },
  { line: '2d', check: () => expect(scene().viewMode).toBe('2d') },
  { line: '3d', check: () => expect(scene().viewMode).toBe('3d') },
  { line: 'play', check: () => expect(scene().playing).toBe(true) },
  { line: 'pause', check: () => expect(scene().playing).toBe(false) }
]

describe('every example in the help text works', () => {
  beforeEach(fresh)

  it('is tested here: the list above is the help text, line for line', () => {
    for (const e of HELP_EXAMPLES) expect(HELP, `help mentions ${e.line}`).toContain(e.line)
    // And no line of the help is untested: a line added to the text has to be added here too.
    const lines = HELP.split('\n').slice(1)
    expect(lines.length).toBeGreaterThan(10)
    for (const l of lines) expect(HELP_EXAMPLES.some((e) => l.includes(e.line)), `tested: ${l.trim()}`).toBe(true)
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
    for (const line of ['components(3i + 4j + 5k)', 'resolve(3i + 4j + 5k)']) {
      const last = await run(line)
      expect(errors(), line).toEqual([])
      expect(last.solution?.title, line).toBe('Components of A')
      const byLabel = Object.fromEntries((last.solution?.answers ?? []).map((a) => [a.label, a.tex]))
      expect(byLabel.Ax, line).toBe('3')
      expect(byLabel.Ay, line).toBe('4')
      expect(byLabel.Az, line).toBe('5')
      expect(byLabel['|A|'], line).toBe('7.07')
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
    let last = await run('A × B')
    expect(last.tex).toContain('-11\\hat{k}')
    expect(last.solution?.title).toBe('Vector product A×B')
    last = await run('C = A × B')
    expect(errors()).toEqual([])
    vectorNamed('C', [0, 0, -11])
    expect((named('C') as VectorObj).def.kind).toBe('expr')
  })

  it('is ordinary multiplication between numbers and between a number and a vector', async () => {
    expect((await run('2 × 3')).text).toBe('= 6')
    expect((await run('3 N × 2')).text).toBe('= 6 N')
    // The way fmt prints a small number must read back as one number.
    expect((await run('2.5×10^3')).text).toBe('= 2500')
    const last = await run('2 × A')
    expect(last.tex).toContain('6\\hat{i} + 8\\hat{j}')
    expect(last.solution?.title).toBe('R = 2A')
    expect(errors()).toEqual([])
  })

  it('works inside a bigger expression', async () => {
    const last = await run('(A × B) · A')
    expect(last.text).toBe('= 0')
    expect(errors()).toEqual([])
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
  })

  it('reads divide(a, b) and partial(a, b) as the fraction a over b', async () => {
    // Two arguments used to fall through to plain evaluation and answer `I don't know "x"`.
    let last = await run('divide(x^3-1, x-1)')
    expect(errors()).toEqual([])
    expect(last.tex).toContain('\\text{Quotient}\\;x^{2} + x + 1')
    expect(usePure.getState().inputLatex).toBe('\\frac{x^{3}-1}{x-1}')
    last = await run('partial(3x+5, (x+1)(x+2))')
    expect(errors()).toEqual([])
    expect(last.tex).toContain('\\dfrac{2}{\\left(x + 1\\right)}')
  })

  it('says why it refused when there is no other engine to try', async () => {
    const last = await run('primes(x)')
    expect(last.kind).toBe('error')
    expect(last.text).toBe('Prime factors need a whole number, like 360.')
    expect(casCalls()).toHaveLength(0)
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

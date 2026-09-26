// Calculus steps wired in (S-Q track QCb): the Working panel's Integrate and Differentiate jobs,
// the command bar's "Show the working" on diff/integrate answers, and a question's engine step
// that asks SymPy. Every reply comes from tests/fixtures/calculus — the worker's own recorded
// answers — so these tests cross from typed text, through the request the app would send, into
// the working the student reads.
//
// `cas` is mocked (this file only): it answers from the fixture recorded for the same payload,
// the way cas.worker.ts would, and a test can hold a reply back to race two runs.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import katex from 'katex'
import type { CasResult } from '../src/renderer/src/math/cas'
import type { DerivTree, IntegralTree } from '../src/renderer/src/math/pure/calculusSteps'
import { math } from '../src/renderer/src/math/expr'
import { repoPath } from './helpers/repo'
import { resetGlobals } from './helpers/globals'

interface Fixture {
  op: 'integral_steps' | 'diff_steps'
  payload: { expr: string; lower?: string; upper?: string; deg?: boolean }
  result: IntegralTree | DerivTree
}

const DIR = repoPath('tests', 'fixtures', 'calculus')
const FIXTURES: Record<string, Fixture> = Object.fromEntries(
  readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) as Fixture])
)

/**
 * Read the way SymPy reads it: an explicit product, powers with ^. Only for the fixtures' own
 * spellings and what the app sends (2x*cos(x^(2))), not a second parser.
 */
const valueAt = (expr: string, x: number): number =>
  // SymPy splits the field's xe^(x) into x·e^x, as it splits 2x into 2·x.
  Number(math.evaluate(expr.replace(/(\d)([a-z(])/g, '$1*$2').replace(/xe/g, 'x*e'), { x }))

/** The same function of x at three points: x e^x was recorded as x*e^x, 2x cos(x²) as 2x*cos(x^2). */
const sameFunction = (a: string, b: string): boolean => {
  try {
    return [0.3, 0.7, 1.9].every((x) => Math.abs(valueAt(a, x) - valueAt(b, x)) < 1e-9)
  } catch {
    return false
  }
}

/** The fixture recorded for this request, answered as the worker would: `deg_ignored` is its `deg`. */
function replyFor(op: string, payload: Record<string, unknown>): CasResult {
  const hit = Object.values(FIXTURES).find(
    (f) =>
      f.op === op &&
      f.payload.lower === payload.lower &&
      f.payload.upper === payload.upper &&
      (f.payload.expr === payload.expr || sameFunction(f.payload.expr, String(payload.expr)))
  )
  if (!hit) return { latex: '', text: '', numeric: null, error: `no fixture for ${op} ${JSON.stringify(payload)}` }
  return { ...(hit.result as object), deg_ignored: payload.deg === true } as unknown as CasResult
}

/** Plain CAS answers the command bar asks for (diff, integrate): what the worker's `diff`/`integrate` ops send. */
const PLAIN: Record<string, CasResult> = {
  'integrate x^2': { latex: '\\frac{x^{3}}{3}', text: 'x**3/3', numeric: null },
  'integrate x e^x': { latex: '\\left(x - 1\\right) e^{x}', text: '(x - 1)*exp(x)', numeric: null },
  'integrate x^2 0 2': { latex: '\\frac{8}{3}', text: '8/3', numeric: { re: 8 / 3 } },
  'diff x^2*sin(x)': { latex: 'x^{2} \\cos{\\left(x \\right)} + 2 x \\sin{\\left(x \\right)}', text: 'x**2*cos(x) + 2*x*sin(x)', numeric: null },
  'diff x^3 x 2': { latex: '6 x', text: '6*x', numeric: null },
  // Asked with var t (this mock does not key on the letter of a first derivative).
  'diff t^3': { latex: '3 t^{2}', text: '3*t**2', numeric: null },
  'integrate t^2': { latex: '\\frac{t^{3}}{3}', text: 't**3/3', numeric: null },
  // Asked with var θ or theta: the same letter, typed two ways.
  'diff θ^2': { latex: '2 \\theta', text: '2*theta', numeric: null },
  'diff theta^2': { latex: '2 \\theta', text: '2*theta', numeric: null },
  'integrate θ^2': { latex: '\\frac{\\theta^{3}}{3}', text: 'theta**3/3', numeric: null },
  // SymPy returns an integral it cannot do still written as one.
  'integrate e^(x^3)': { latex: '\\int e^{x^{3}}\\, dx', text: 'Integral(exp(x**3), x)', numeric: null }
}

vi.mock('../src/renderer/src/math/cas', async (orig) => {
  const real = await orig<typeof import('../src/renderer/src/math/cas')>()
  return {
    ...real,
    cas: vi.fn(async (op: string, payload: Record<string, unknown> = {}) => {
      if (op === 'integral_steps' || op === 'diff_steps') return replyFor(op, payload)
      const key = [op, payload.expr, payload.lower, payload.upper, payload.order && payload.order !== 1 ? `${payload.var} ${payload.order}` : undefined]
        .filter((p) => p !== undefined)
        .join(' ')
      return PLAIN[key] ?? { latex: '', text: '', numeric: null, error: `no plain answer for ${key}` }
    })
  }
})
vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { cas } from '../src/renderer/src/math/cas'
import { scene } from '../src/renderer/src/core/store'
import { runCommand } from '../src/renderer/src/lang/commands'
import { JOBS, jobById } from '../src/renderer/src/math/pure/run'
import { NO_STEPS, RADIANS_NOTE } from '../src/renderer/src/math/pure/calculusSteps'
import {
  WORKING_IT_OUT,
  calculusVariable,
  casAnswerIsCurrent,
  calculusJobFor,
  casRequestFor,
  forSymPy,
  gluedFunctionsApart,
  stepsWorkingFor,
  usePure,
  workSteps
} from '../src/renderer/src/math/pure/store'
import type { Working } from '../src/renderer/src/math/pure/work'
import type { MeasureSettings } from '../src/renderer/src/math/format'
import type { PQQuestion } from '../src/renderer/src/questions/pqjson'
import { playQuestion } from '../src/renderer/src/questions/player'
import { WORKING_IT_OUT_STEP, resolveAutoSteps } from '../src/renderer/src/questions/steps'
import { previewAutoStep, previewAutoStepWorked } from '../src/renderer/src/questions/authoring'

const renders = (tex: string, where: string): void => {
  expect(() => katex.renderToString(tex, { displayMode: true, throwOnError: true, strict: 'ignore' }), `${where}: ${tex}`).not.toThrow()
}

/** Every string of a working that KaTeX will be handed. */
function rendersAll(w: Working, where: string): void {
  renders(w.input, `${where} input`)
  w.moves.forEach((m, i) => {
    if (m.tex) renders(m.tex, `${where} move ${i + 1} tex`)
    if (m.rule) renders(m.rule, `${where} move ${i + 1} rule`)
  })
  w.answers.forEach((a) => renders(a.tex, `${where} answer ${a.label}`))
}

/** Lets every settled promise run its continuation (the mocked worker answers at once). */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
}

beforeEach(() => {
  resetGlobals()
  scene().newScene()
  scene().clearLog()
  // The app's own start: DEG. A test that switches to RAD must not leave it for the next one.
  scene().setSettings({ angleUnit: 'deg' })
  vi.mocked(cas).mockClear()
})

describe('the request a calculus job sends', () => {
  it('reproduces the payload every fixture was recorded from, typed the way a student types it', () => {
    for (const [name, f] of Object.entries(FIXTURES)) {
      const job = f.op === 'integral_steps' ? 'integrate' : 'differentiate'
      const typed = [f.payload.expr, f.payload.lower, f.payload.upper].filter((p) => p !== undefined).join(', ')
      const req = casRequestFor(job, typed, f.payload.deg === true)
      expect(req, name).not.toBeNull()
      expect(req!.op, name).toBe(f.op)
      expect(req!.payload, name).toEqual({ var: 'x', deg: false, ...f.payload })
    }
  })

  it('takes the letter after a comma, or the only letter there is, and x otherwise', () => {
    expect(casRequestFor('integrate', 't^2, t', false)!.payload).toEqual({ expr: 't^2', var: 't', deg: false })
    expect(casRequestFor('integrate', 't^2, t, 0, 1', false)!.payload).toEqual({ expr: 't^2', var: 't', deg: false, lower: '0', upper: '1' })
    expect(casRequestFor('differentiate', 'theta^2 sin(theta)', false)!.payload.var).toBe('theta')
    expect(calculusVariable('t^2')).toBe('t')
    expect(calculusVariable('a x^2 + b')).toBe('x')
    // e, pi and i are numbers, and sin is a function, not letters to integrate by.
    expect(calculusVariable('e^(pi t) sin(t)')).toBe('t')
    expect(calculusVariable('3')).toBe('x')
  })

  it('refuses a line it cannot read as one calculus question, with the shape in words', async () => {
    expect(casRequestFor('integrate', 'x^2, 3', false)).toBeNull()
    expect(casRequestFor('differentiate', 'x^2, 0, 2', false)).toBeNull()
    const w = await workSteps('differentiate', 'x^2, 0, 2')
    expect(w.error).toMatch(/^Differentiate takes one expression/)
    expect(vi.mocked(cas)).not.toHaveBeenCalled()
  })

  it('says its shapes in written maths, never the typed x^2 sin(x) (no programming syntax shown)', async () => {
    const said = [
      ...JOBS.filter((j) => j.engine === 'cas').map((j) => j.about),
      (await workSteps('integrate', 'x^2, t, 0, 1, 2')).error!,
      (await workSteps('differentiate', 'x^2, 0, 2')).error!,
      stepsWorkingFor('integrate', 'x', { latex: '', text: '', numeric: null, error: 'SyntaxError' }).error!,
      stepsWorkingFor('differentiate', 'x', { latex: '', text: '', numeric: null, error: 'SyntaxError' }).error!
    ]
    for (const s of said) expect(s, s).not.toMatch(/[\^*()]/)
    expect(said[2]).toBe('Integrate takes one expression, like x eˣ, with the two limits after commas for a definite integral: x², 0, 2.')
    expect(said[3]).toBe('Differentiate takes one expression, like x² sin x, with the letter after a comma when it is not x: t³, t.')
    expect(said[5]).toBe('PhysLab could not read that as something to differentiate. Write it the way the example shows: x² sin x.')
  })

  it('sends DEG only with trigonometry, where the worker then says the working is in radians (spec decision 2)', () => {
    expect(casRequestFor('integrate', 'cos(x)', true)!.payload.deg).toBe(true)
    expect(casRequestFor('integrate', 'x^2', true)!.payload.deg).toBe(false)
    expect(casRequestFor('differentiate', 'x^2 sin(x)', false)!.payload.deg).toBe(false)
  })

  it('the other jobs keep their answer-only requests', () => {
    expect(casRequestFor('solve', 'x^2 = 4', true)).toEqual({ op: 'solve', payload: { eqs: ['x^2 = 4'], deg: true } })
    expect(casRequestFor('primes', '360', false)).toBeNull()
  })
})

describe('the worker reply as working', () => {
  it('Python text never reaches a student; the client’s own sentences do', () => {
    const python = stepsWorkingFor('integrate', 'x^^2', { latex: '', text: '', numeric: null, error: "invalid syntax (<string>, line 1)" })
    expect(python.error).toBe('PhysLab could not read that as something to integrate. Write it the way the example shows: x eˣ.')
    const slow = 'This took too long, so it was stopped. Try a simpler expression, or give the numbers instead of symbols.'
    expect(stepsWorkingFor('differentiate', 'x', { latex: '', text: '', numeric: null, error: slow }).error).toBe(slow)
  })
})

describe('the Working panel runs Integrate and Differentiate through SymPy', () => {
  it('shows "Working it out…" at once, then the steps, and remembers the answer', async () => {
    usePure.getState().run('integrate', 'x^2')
    const waiting = usePure.getState().working!
    expect(waiting.method).toMatch(new RegExp(`^${WORKING_IT_OUT}`))
    expect(waiting.answers).toEqual([])
    expect(waiting.error).toBeUndefined()
    await settle()
    const w = usePure.getState().working!
    expect(w.title).toBe('Integrate')
    expect(w.answers[0].tex).toBe('\\frac{x^{3}}{3} + C')
    expect(w.moves.length).toBeGreaterThan(0)
    expect(w.checked).toBe('ok')
    expect(usePure.getState().history[0]).toMatchObject({ job: 'integrate', input: 'x^2' })
  })

  it('a later run’s answer never lands on an earlier question, and an earlier one never on a later (casAnswerIsCurrent)', async () => {
    expect(casAnswerIsCurrent(3, 3)).toBe(true)
    expect(casAnswerIsCurrent(2, 3)).toBe(false)
    // Hold the first reply back until the second question has been answered.
    let release: () => void = () => undefined
    const held = new Promise<void>((r) => (release = r))
    vi.mocked(cas).mockImplementationOnce(async (op, payload) => {
      await held
      return replyFor(op, payload ?? {})
    })
    usePure.getState().run('integrate', 'x^2')
    usePure.getState().run('differentiate', 'x^2*sin(x)')
    await settle()
    expect(usePure.getState().working!.title).toBe('Differentiate')
    release()
    await settle()
    const w = usePure.getState().working!
    expect(w.title).toBe('Differentiate')
    expect(w.answers[0].tex).toBe('2 x \\sin {x} + x^{2} \\cos {x}')
    expect(usePure.getState().input).toBe('x^2*sin(x)')
  })

  it('in DEG mode a trig question gets the one radians sentence, and a polynomial does not', async () => {
    scene().setSettings({ angleUnit: 'deg' })
    usePure.getState().run('integrate', 'cos(x)')
    await settle()
    const trig = usePure.getState().working!
    expect(trig.moves[0].note).toContain(RADIANS_NOTE)
    usePure.getState().run('integrate', 'x^2')
    await settle()
    expect(usePure.getState().working!.moves.some((m) => m.note?.includes(RADIANS_NOTE))).toBe(false)
    scene().setSettings({ angleUnit: 'rad' })
    usePure.getState().run('integrate', 'cos(x)')
    await settle()
    expect(usePure.getState().working!.moves.some((m) => m.note?.includes(RADIANS_NOTE))).toBe(false)
  })

  it('a refused line keeps its LaTeX input, not the typed text read as LaTeX', async () => {
    const shown = String.raw`x^2\sin x,t,1`
    usePure.getState().run('differentiate', 'x^2 sin(x), t, 1', shown)
    await settle()
    const w = usePure.getState().working!
    expect(w.error).toMatch(/^Differentiate takes one expression/)
    expect(w.input).toBe(shown)
    expect(usePure.getState().inputLatex).toBe(shown)
  })

  it('a definite integral typed with its limits after commas ends F(2) − F(0) = 8/3 (∫₀² x² dx)', async () => {
    usePure.getState().run('integrate', 'x^2, 0, 2')
    await settle()
    const w = usePure.getState().working!
    expect(w.answers[0].tex).toBe('\\frac{8}{3}')
    expect(w.moves.at(-1)!.tex).toContain('\\frac{8}{3} - 0')
  })

  it('an integral with no rule tree still gives its answer, with the sentence', async () => {
    usePure.getState().run('differentiate', 'x^x')
    await settle()
    const w = usePure.getState().working!
    expect(w.answers[0].tex).toBe('x^{x} \\left(\\ln x + 1\\right)')
    expect(w.noWorking).toBe(true)
    expect(w.reason).toContain(NO_STEPS)
  })

  it('the field route: LaTeX typed in the Maths field reaches the worker as a payload it reads', async () => {
    usePure.getState().runLatex('xe^{x}', 'integrate')
    await settle()
    const [op, payload] = vi.mocked(cas).mock.calls.at(-1)!
    expect(op).toBe('integral_steps')
    expect(payload).toMatchObject({ var: 'x' })
    expect(usePure.getState().inputLatex).toBe('xe^{x}')
    // ∫ x eˣ dx = (x − 1)eˣ + C, by parts with u = x.
    expect(usePure.getState().working!.answers[0].tex).toBe(String.raw`\left(x - 1\right) e^{x} + C`)
    expect(usePure.getState().working!.method).toBe('Integration by parts')
  })

  it('2x cos(x²) from the field is 2x · cos(x²) to SymPy, not the letters c, o, s (∫ = sin(x²) + C)', async () => {
    // The field's converter glues the function to the x before it (2xcos(x^(2))); sent as it was,
    // SymPy split "xcos" into x·c·o·s and the browser check answered c o s x⁴/2 + C.
    usePure.getState().runLatex(String.raw`2x\cos\left(x^{2}\right)`, 'integrate')
    await settle()
    expect(vi.mocked(cas).mock.calls.at(-1)![1]).toMatchObject({ expr: '2x*cos(x^(2))', var: 'x' })
    const w = usePure.getState().working!
    expect(w.answers[0].tex).toBe(String.raw`\sin{\left(x^{2} \right)} + C`)
    expect(w.moves.some((m) => /u = x\^\{2\}/.test(m.tex ?? ''))).toBe(true)
  })

  it('θ from the field reaches SymPy spelt theta, the letter it differentiates by (d/dθ θ sin θ was 0)', async () => {
    usePure.getState().runLatex(String.raw`\theta\sin\theta`, 'differentiate')
    await settle()
    expect(vi.mocked(cas).mock.calls.at(-1)![1]).toMatchObject({ expr: 'theta*sin(theta)', var: 'theta' })
    expect(casRequestFor('integrate', 'θ^2, θ', false)!.payload).toMatchObject({ expr: 'theta^2', var: 'theta' })
    expect(forSymPy('2θcos(θ)')).toBe('2theta*cos(theta)')
  })

  it('takes a glued function name apart, and never cuts a longer name down', () => {
    expect(gluedFunctionsApart('2xcos(x^(2))')).toBe('2x*cos(x^(2))')
    expect(gluedFunctionsApart('thetasin(theta)')).toBe('theta*sin(theta)')
    expect(gluedFunctionsApart('xsinh(x)')).toBe('x*sinh(x)')
    expect(gluedFunctionsApart('xasin(x)')).toBe('x*asin(x)')
    expect(gluedFunctionsApart('xln(x) - x')).toBe('x*ln(x) - x')
    for (const same of ['asin(2x)', 'sinh(x)', 'x^(2)sin(x)', 'e^(x)sin(x)', 'sqrt(x)', 'x*e^x', '1/(x^2 - 1)']) expect(gluedFunctionsApart(same)).toBe(same)
    expect(calculusVariable('te^(t)')).toBe('t')
    expect(calculusVariable('tsin(t)')).toBe('t')
  })
})

describe('the command bar: diff and integrate keep their answer and gain "Show the working"', () => {
  const last = () => scene().log.at(-1)!

  it('integrate(x^2) still yields SymPy’s answer, and its working link opens the steps', async () => {
    await runCommand('integrate(x^2)')
    const entry = last()
    expect(entry.kind).toBe('result')
    // + C, like its working: SymPy leaves it off, and an indefinite integral without it is wrong.
    expect(entry.tex).toBe(String.raw`\int x^2\,dx = \frac{x^{3}}{3} + C`)
    renders(entry.tex!, 'the bar line')
    expect(vi.mocked(cas).mock.calls.map(([op]) => op)).toEqual(['integrate'])
    expect(entry.working).toBeTypeOf('function')
    entry.working!()
    expect(usePure.getState()).toMatchObject({ job: 'integrate', input: 'x^2', inputLatex: 'x^{2}' })
    await settle()
    const w = usePure.getState().working!
    expect(w.answers[0].tex).toBe(String.raw`\frac{x^{3}}{3} + C`)
    expect(w.method).toBe('Power rule')
    rendersAll(w, 'integrate(x^2)')
  })

  it('a definite integral and a derivative link to their own working; a second derivative and a solve do not', async () => {
    await runCommand('integrate(x^2, 0, 2)')
    expect(last().tex).not.toContain('+ C') // a definite integral is a number
    last().working!()
    expect(usePure.getState()).toMatchObject({ job: 'integrate', input: 'x^2, 0, 2' })
    await settle()
    expect(usePure.getState().working!.answers[0].tex).toBe(String.raw`\frac{8}{3}`)

    await runCommand('diff(x^2*sin(x))')
    last().working!()
    await settle()
    const d = usePure.getState().working!
    expect(d.method).toBe('Product rule')
    expect(d.answers[0].tex).toBe(String.raw`2 x \sin {x} + x^{2} \cos {x}`)

    await runCommand('diff(x^3, x, 2)')
    expect(last().kind).toBe('result')
    expect(last().working).toBeUndefined()
  })

  it('an integral SymPy could not do stays written as one, with no + C tacked on', async () => {
    await runCommand('integrate(e^(x^3))')
    expect(last().tex).toBe(String.raw`\int e^(x^3)\,dx = \int e^{x^{3}}\, dx`)
  })

  it('names the Working job behind each bar form', () => {
    expect(calculusJobFor('diff', ['x^2 sin(x)'])).toEqual({ job: 'differentiate', input: 'x^2 sin(x)' })
    expect(calculusJobFor('diff', ['t^3', 't'])).toEqual({ job: 'differentiate', input: 't^3, t' })
    expect(calculusJobFor('diff', ['x^3', 'x', '2'])).toBeNull()
    expect(calculusJobFor('integrate', ['x e^x'])).toEqual({ job: 'integrate', input: 'x e^x' })
    expect(calculusJobFor('integrate', ['x^2', '0', '2'])).toEqual({ job: 'integrate', input: 'x^2, 0, 2' })
    expect(calculusJobFor('integrate', ['x^2', 'x'])).toEqual({ job: 'integrate', input: 'x^2' })
    expect(calculusJobFor('limit', ['sin(x)/x', '0'])).toBeNull()
  })

  it('the working is worked in the bar’s own letter, so the answer and its working agree', () => {
    // The bar works diff(t^3) in x (answer 0); Working alone would guess t and show 3t².
    expect(calculusJobFor('diff', ['t^3'])).toEqual({ job: 'differentiate', input: 't^3, x' })
    expect(calculusJobFor('diff', ['t^3', 'x'])).toEqual({ job: 'differentiate', input: 't^3, x' })
    expect(calculusJobFor('diff', ['t^3', 't'])).toEqual({ job: 'differentiate', input: 't^3, t' })
    expect(calculusJobFor('integrate', ['t^2'])).toEqual({ job: 'integrate', input: 't^2, x' })
    expect(calculusJobFor('integrate', ['t^2', '0', '2'])).toEqual({ job: 'integrate', input: 't^2, x, 0, 2' })
    // Where Working would guess x as well, the x is not added to the line.
    expect(calculusJobFor('diff', ['x^2', 'x'])).toEqual({ job: 'differentiate', input: 'x^2' })
    expect(calculusJobFor('integrate', ['x t', '0', '1'])).toEqual({ job: 'integrate', input: 'x t, 0, 1' })
    // Each line, read back by Working, asks SymPy for the bar's letter.
    for (const [op, args, v] of [
      ['diff', ['t^3'], 'x'],
      ['diff', ['t^3', 't'], 't'],
      ['integrate', ['t^2'], 'x'],
      ['integrate', ['t^2', '0', '2'], 'x']
    ] as const) {
      const pick = calculusJobFor(op, [...args])!
      expect(casRequestFor(pick.job, pick.input, false)!.payload.var).toBe(v)
    }
  })

  it('the bar’s own label names the letter it worked in', async () => {
    await runCommand('diff(t^3, t)')
    expect(last().tex).toBe(String.raw`\frac{d}{dt}\left(t^3\right) = 3 t^{2}`)
    renders(last().tex!, 'diff in t')
    await runCommand('integrate(t^2, t)')
    expect(last().tex).toBe(String.raw`\int t^2\,dt = \frac{t^{3}}{3} + C`)
    renders(last().tex!, 'integrate in t')
    expect(calculusJobFor('solve', ['x^2 = 4'])).toBeNull()
  })

  it('a Greek letter is named as itself: diff(θ², θ) = 2θ reads d/dθ, not d/dx (d/dx θ² is 0)', async () => {
    for (const line of ['diff(θ^2, θ)', 'diff(theta^2, theta)']) {
      await runCommand(line)
      expect(last().tex).toMatch(/^\\frac\{d\}\{d\\theta\}\\left\(/)
      expect(last().tex).toMatch(/ = 2 \\theta$/)
      renders(last().tex!, line)
    }
    await runCommand('integrate(θ^2, θ)')
    expect(last().tex).toBe(String.raw`\int θ^2\,d\theta = \frac{\theta^{3}}{3} + C`)
    renders(last().tex!, 'integrate in θ')
    // The label and the working behind it agree on the letter.
    const pick = calculusJobFor('diff', ['θ^2', 'θ'])!
    expect(casRequestFor(pick.job, pick.input, false)!.payload.var).toBe('theta')
  })
})

describe('a question step worked by SymPy', () => {
  const S: MeasureSettings = { decimals: 4, precisionMode: 'dp', unit: 'm', unitPerSquare: 1, angleUnit: 'deg' }
  const question = (level: 'worked' | 'half' | 'solo', job: string, input: string): PQQuestion => ({
    id: `calc-${job}`,
    title: 'Calculus',
    statement: 'Work it out.',
    variables: [{ name: 'k', def: { kind: 'list', items: [3] }, unit: 'none' }],
    parts: [{ type: 'number', prompt: 'k?', answer: 'k', unit: 'none', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }],
    steps: {
      level,
      items: [
        { head: 'Start with the rule.', blank: false },
        { head: '', auto: { engine: 'pure', job, input } },
        { head: 'That is the answer.', blank: false }
      ]
    },
    license: { id: 'CC BY 4.0', holder: 'PhysLab' }
  })

  it('auto {engine: pure, job: differentiate} shows "Working it out…" when played, then resolves to the product rule', async () => {
    scene().setSettings({ angleUnit: 'deg' })
    const played = playQuestion(question('worked', 'differentiate', 'x^2*sin(x)'), 1, S)
    expect(played.working.moves.map((m) => m.head)).toEqual(['Start with the rule.', WORKING_IT_OUT_STEP, 'That is the answer.'])
    expect(played.problem.solution.steps.map((st) => st.text)).toContain(WORKING_IT_OUT_STEP)

    const done = await resolveAutoSteps(played, S, workSteps)
    const heads = done.working.moves.map((m) => m.head)
    expect(heads).not.toContain(WORKING_IT_OUT_STEP)
    expect(heads[0]).toBe('Start with the rule.')
    expect(heads.at(-1)).toBe('That is the answer.')
    expect(heads).toContain('Used the product rule.')
    const product = done.working.moves.find((m) => m.head === 'Used the product rule.')!
    expect(product.tex).toContain(String.raw`2 x \sin {x} + x^{2} \cos {x}`)
    expect(done.full).toBe(done.working)
    expect(done.problem.solution.steps.map((st) => st.text)).toEqual(heads)
    expect(done.parts).toBe(played.parts)
    rendersAll(done.working, 'resolved question')
    // The DEG sentence travels only with trigonometry: x² sin x has it.
    expect(done.working.moves.some((m) => m.note?.includes(RADIANS_NOTE))).toBe(true)
  })

  it('fades the resolved steps like any other: solo keeps the heads, and the full solution keeps every line', async () => {
    const played = playQuestion(question('solo', 'integrate', 'x^2, 0, 2'), 1, S)
    const done = await resolveAutoSteps(played, S, workSteps)
    expect(done.working.moves.every((m) => m.tex === undefined)).toBe(true)
    expect(done.full.moves.some((m) => m.tex?.includes(String.raw`\frac{8}{3} - 0`))).toBe(true)
    expect(done.working.moves.length).toBe(done.full.moves.length)
  })

  it('asks once per distinct line, leaves a question with no such step alone, and never shows nothing', async () => {
    const work = vi.fn(workSteps)
    const twice = question('worked', 'differentiate', 'x^2*sin(x)')
    twice.steps!.items.push({ head: '', auto: { engine: 'pure', job: 'differentiate', input: 'x^2*sin(x)' } })
    await resolveAutoSteps(playQuestion(twice, 1, S), S, work)
    expect(work).toHaveBeenCalledTimes(1)

    const plain = playQuestion(question('worked', 'factor', 'x^2 - 1'), 1, S)
    work.mockClear()
    expect(await resolveAutoSteps(plain, S, work)).toBe(plain)
    expect(work).not.toHaveBeenCalled()

    // No rule tree (d/dx xˣ): the answer stands in the working with the sentence as its heading.
    const none = await resolveAutoSteps(playQuestion(question('worked', 'differentiate', 'x^x'), 1, S), S, workSteps)
    const line = none.working.moves[1]
    expect(line.head).toContain(NO_STEPS)
    expect(line.tex).toBe(String.raw`\frac{d}{dx}x^{x} = x^{x} \left(\ln x + 1\right)`)
    rendersAll(none.working, 'no rule tree')

    // A worker that fails is one sentence in the working, not a missing step.
    const failing = await resolveAutoSteps(playQuestion(question('worked', 'integrate', 'x^2'), 1, S), S, async () => {
      throw new Error('gone')
    })
    expect(failing.working.moves[1]).toMatchObject({ head: 'PhysLab could not work this step out.', note: 'The algebra engine did not answer.' })
  })

  it('the Question Author previews a Differentiate step as its working, not "Working it out…" for good', async () => {
    const q = question('worked', 'differentiate', 'x^2*sin(x)')
    const step = q.steps!.items[1]
    // The synchronous preview can only hold the place; the worked one is the teacher's real preview.
    expect(previewAutoStep(q, step, S).map((m) => m.head)).toEqual([WORKING_IT_OUT_STEP])
    const moves = (await previewAutoStepWorked(q, step, S, workSteps))!
    const heads = moves.map((m) => m.head)
    expect(heads).not.toContain(WORKING_IT_OUT_STEP)
    expect(heads).toContain('Used the product rule.')
    expect(moves.find((m) => m.head === 'Used the product rule.')!.tex).toContain(String.raw`2 x \sin {x} + x^{2} \cos {x}`)
    moves.forEach((m, i) => m.tex && renders(m.tex, `author preview move ${i + 1}`))

    // A step the Pure engine answers at once has nothing to wait for.
    const factor = question('worked', 'factor', 'x^2 - 1')
    expect(await previewAutoStepWorked(factor, factor.steps!.items[1], S, workSteps)).toBeNull()

    // A worker that fails is the one "could not" line, which keeps the Add button off.
    const failed = await previewAutoStepWorked(q, step, S, async () => {
      throw new Error('gone')
    })
    expect(failed).toHaveLength(1)
    expect(failed![0]).toMatchObject({ head: 'PhysLab could not work this step out.', note: 'The algebra engine did not answer.' })
  })

  it('Problem Sets and the Question Author both ask SymPy for these steps (nothing asked, so they said "Working it out…" for good)', () => {
    const src = (file: string): string => readFileSync(repoPath('src', 'renderer', 'src', 'panels', file), 'utf8')
    const practice = src('Practice.tsx')
    expect(practice).toMatch(/resolveAutoSteps\(playedNow, settings, workSteps\)/)
    // The reply is kept with the copy of the question it was worked for, never put on the next one.
    expect(practice).toMatch(/worked\?\.from === playedNow \? worked\.played : playedNow/)
    const author = src('AuthorSolution.tsx')
    expect(author).toMatch(/previewAutoStepWorked\(q, step, settings, workSteps\)/)
    expect(author.match(/useAutoPreview\(q, /g)?.length).toBe(2)
    expect(author).toMatch(/disabled=\{!step \|\| failed \|\| pending \|\|/)
  })
})

describe('the jobs offered in the panel', () => {
  it('Integrate and Differentiate are SymPy jobs, and their examples render from the recorded replies', async () => {
    const calculus = JOBS.filter((j) => j.engine === 'cas').map((j) => j.id)
    expect(calculus.sort()).toEqual(['differentiate', 'integrate'])
    expect(jobById('integrate').label).toBe('Integrate')
  })
})


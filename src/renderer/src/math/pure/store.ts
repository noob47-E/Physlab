// What the Working panel is showing, and everything it has been asked before.
//
// Only the job and the typed text are remembered. The working itself is recomputed on recall,
// which keeps the saved history tiny and means an improvement to a step generator improves every
// old entry too, instead of leaving stale working lying around.
//
// Two forms of the question are kept, and they are not interchangeable. `input` is the linear
// source the engine runs. `inputLatex` is what the student actually typed, and it is the only
// thing that may ever be written back into a maths field: feeding the linear form back turns
// x^(2) into a stray bracket on screen, because MathLive reads everything it is given as LaTeX.

import { create } from 'zustand'
import type { MathNode } from 'mathjs'
import { cas, useCasStatus, type CasOp, type CasResult } from '../cas'
import { calculusUnitNote, casInDegrees } from '../../calc/angle'
import { scene } from '../../core/store'
import { math, preprocess, splitArgs } from '../expr'
import type { DigitSettings } from '../format'
import { latexToMath } from '../latexToMath'
import { derivativeWorking, integralWorking, type DerivTree, type IntegralTree } from './calculusSteps'
import { jobById, runPure, suggestJob, type JobId } from './run'
import { failed, type Working } from './work'

export interface PureEntry {
  id: string
  job: JobId
  /** The linear source the engine ran. */
  input: string
  /** The LaTeX the student typed, so recalling an entry restores the field as it was. */
  latex: string
  /** Kept only so the list can be drawn without rerunning every entry. */
  title: string
  answer: string
  at: number
}

// v2: entries gained `latex`. Older ones have none, and backfilling it from `input` would put
// linear syntax back into the field — the exact bug this fixes — so the old list is simply dropped.
const KEY = 'physlab.pure.history.v2'
const CAP = 60

function load(): PureEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed.slice(0, CAP) as PureEntry[]) : []
  } catch {
    return []
  }
}

function save(items: PureEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, CAP)))
  } catch {
    // Storage blocked: history just will not survive a restart.
  }
}

interface PureState {
  job: JobId
  /** Linear source, for runPure. */
  input: string
  /** LaTeX, for the maths field. Never pass `input` where this is wanted. */
  inputLatex: string
  working: Working | null
  /** True while SymPy is being asked for an answer this engine could not work out itself. */
  asking: boolean
  /**
   * Counts every run. A SymPy answer carries the number of the run that asked for it, and is
   * dropped unless that is still the latest run. Comparing the input text instead let a slow
   * answer for an earlier problem land after the student had moved on to a later one with the
   * same text, or after a newer run had already answered.
   */
  runSeq: number
  history: PureEntry[]
  setInput: (s: string) => void
  setJob: (j: JobId) => void
  run: (job?: JobId, input?: string, latex?: string) => void
  /**
   * Run straight from a maths field. The LaTeX is converted here, inside the same guard as the
   * generators, so a refusal thrown by the converter (a ± the engine cannot use, say) is shown to
   * the student as a sentence. Converting in the panel first put that throw in the middle of a
   * render, where nothing catches it. 'auto' guesses the job from the shape of the text.
   */
  runLatex: (latex: string, job: JobId | 'auto') => void
  recall: (id: string) => void
  remove: (id: string) => void
  clearHistory: () => void
}

export const usePure = create<PureState>((set, get) => ({
  job: 'factor',
  input: '',
  inputLatex: '',
  working: null,
  asking: false,
  runSeq: 0,
  history: load(),

  setInput: (input) => set({ input }),
  setJob: (job) => set({ job }),

  run: (job, input, latex) => {
    const j = job ?? get().job
    const src = (input ?? get().input).trim()
    if (!src) return
    if (jobById(j).engine === 'cas') {
      // Integrate and Differentiate are worked by SymPy, which answers a moment later (seconds on
      // its first start). The panel says so at once rather than keeping the last question's
      // working on screen under the new one; the answer lands only while this is still the latest run.
      const shown = latex ?? src
      const runSeq = get().runSeq + 1
      set({ job: j, input: src, inputLatex: shown, working: workingItOut(j, shown), asking: false, runSeq })
      void askSteps(j, src, shown, runSeq, set, get)
      return
    }
    // Every generator is meant to return a readable refusal rather than throw, but a throw from
    // deep inside one used to leave the panel showing the previous problem with no explanation.
    // Whatever escapes becomes a refusal the student can read.
    let working: Working
    try {
      working = runPure(j, src)
    } catch (err) {
      working = failed(jobById(j).label, latex ?? src, err instanceof Error && err.message ? err.message : 'Something went wrong while working that out.')
    }
    // With no LaTeX given, the source doubles as the display form. That is only safe because the
    // callers that have real LaTeX always pass it; see the contract test.
    const shown = latex ?? src
    const runSeq = get().runSeq + 1
    set({ job: j, input: src, inputLatex: shown, working, asking: false, runSeq })

    if (!working.error) {
      remember(j, src, shown, working, set, get)
      return
    }

    // The answer is not optional. When this engine cannot show working, SymPy is asked for the
    // result alone, and the panel says plainly that the steps are missing.
    void askCas(j, src, shown, runSeq, set, get)
  },

  runLatex: (latex, job) => {
    let text: string
    try {
      text = latexToMath(latex).trim()
    } catch (err) {
      const label = jobById(job === 'auto' ? get().job : job).label
      const working = failed(label, latex, err instanceof Error && err.message ? err.message : 'I could not read that.')
      set({ inputLatex: latex, working, asking: false, runSeq: get().runSeq + 1 })
      return
    }
    if (!text) return
    get().run(job === 'auto' ? suggestJob(text) : job, text, latex)
  },

  recall: (id) => {
    const hit = get().history.find((h) => h.id === id)
    if (hit) get().run(hit.job, hit.input, hit.latex)
  },

  remove: (id) => {
    const next = get().history.filter((h) => h.id !== id)
    save(next)
    set({ history: next })
  },

  clearHistory: () => {
    save([])
    set({ history: [] })
  }
}))

/**
 * Which Pure Math jobs have a sensible SymPy equivalent to fall back on.
 *
 * `partial` and `divide` map to `apart`, not `simplify`. SymPy's simplify on a fraction returns
 * the fraction, so the panel would print the question back as though it were the answer — worse
 * than showing nothing.
 */
const CAS_OP: Partial<Record<JobId, CasOp>> = {
  factor: 'factor',
  // Not plain `factor`: SymPy's default factors over the rationals, so the fallback for
  // "Factorise with i" used to hand back x² + 4 untouched and call it the answer.
  factorComplex: 'factor_complex',
  expand: 'expand',
  solve: 'solve',
  partial: 'apart',
  divide: 'apart'
}

/** Put a finished answer into the history, moving a repeat of the same question to the top. */
function remember(job: JobId, src: string, latex: string, working: Working, set: (p: Partial<PureState>) => void, get: () => PureState): void {
  const entry: PureEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    job,
    input: src,
    latex,
    title: working.title,
    answer: working.answers[0]?.tex ?? '',
    at: Date.now()
  }
  const rest = get().history.filter((h) => !(h.job === job && h.input === src))
  const next = [entry, ...rest].slice(0, CAP)
  save(next)
  set({ history: next })
}

/**
 * The request for a job, as one pure function.
 *
 * This exists because the payload key is a contract with Python in another file, and it was wrong:
 * `solve` was sent `equations` while the worker reads `eqs`, so every fallback failed silently.
 * Stated once, it can be pinned by a test.
 */
export function casRequestFor(job: JobId, src: string, deg: boolean): { op: CasOp; payload: Record<string, unknown> } | null {
  if (job === 'integrate' || job === 'differentiate') {
    const req = stepsRequest(job, src, deg)
    return 'error' in req ? null : req
  }
  const op = CAS_OP[job]
  if (!op) return null
  // Sent with every request: without it the worker read radians, so solve(sin(x) = 0.5) answered
  // π/6 here and 30 in the command bar, in the same DEG mode on the same screen.
  return op === 'solve' ? { op, payload: { eqs: [src], deg } } : { op, payload: { expr: src, deg } }
}

/** True when a SymPy answer that was asked for by run `asked` may still be shown. */
export const casAnswerIsCurrent = (asked: number, latest: number): boolean => asked === latest

// ---------------------------------------------------------------------------------------------
// Calculus working (Integrate, Differentiate): SymPy's rule tree, set out by calculusSteps.ts
// ---------------------------------------------------------------------------------------------

/** What the panel says between asking SymPy and its reply. */
export const WORKING_IT_OUT = 'Working it out…'

/** The working shown while SymPy is asked: the question, nothing pretending to be an answer. */
function workingItOut(job: JobId, latex: string): Working {
  const starting = useCasStatus.getState().status !== 'ready'
  return {
    title: jobById(job).label,
    input: latex,
    // The first request waits for Pyodide to load; a bare "Working it out…" for ten seconds
    // reads as a hang.
    method: starting ? `${WORKING_IT_OUT} (starting the algebra engine, which takes a moment the first time)` : WORKING_IT_OUT,
    moves: [],
    answers: []
  }
}

/** Function names the worker reads, longest first so "asin" is never cut down to "a·sin". */
const FUNCTIONS = ['arcsin', 'arccos', 'arctan', 'asinh', 'acosh', 'atanh', 'asin', 'acos', 'atan', 'acot', 'sinh', 'cosh', 'tanh', 'sqrt', 'cbrt', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'exp', 'abs', 'log', 'ln']

/**
 * A function name glued to the letter before it, taken apart: "2xcos(x^(2))" → "2x*cos(x^(2))".
 * The Maths field's converter writes 2x cos(x²) that way, and SymPy's parser splits an unknown
 * name into single letters, so ∫ 2x cos(x²) dx came back as c·o·s·x⁴/2.
 */
export function gluedFunctionsApart(expr: string): string {
  return expr.replace(/[A-Za-z]+(?=\s*\()/g, (run) => {
    if (FUNCTIONS.includes(run)) return run
    // thetasin is theta·sin, not thet·asin: a split that leaves a whole name in front wins.
    const fits = FUNCTIONS.filter((f) => run.endsWith(f))
    const fn = fits.find((f) => WHOLE_NAMES.has(run.slice(0, -f.length)) || run.slice(0, -f.length) === 'pi') ?? fits[0]
    return fn ? `${run.slice(0, -fn.length)}*${fn}` : run
  })
}

const GREEK: Record<string, string> = {
  θ: 'theta', α: 'alpha', β: 'beta', γ: 'gamma', φ: 'phi', ω: 'omega', λ: 'lambda', μ: 'mu', τ: 'tau', σ: 'sigma', ρ: 'rho', ψ: 'psi'
}

/**
 * The line as the worker's parser needs it: Greek letters spelt out (the field writes θ, and the
 * letter to differentiate by is spelt theta, so d/dθ(θ sin θ) came back as 0), then glued
 * function names taken apart.
 */
export function forSymPy(expr: string): string {
  return gluedFunctionsApart(expr.replace(/[θαβγφωλμτσρψ]/g, (c) => GREEK[c]))
}

const NOT_VARIABLES = new Set(['e', 'E', 'pi', 'i', 'Infinity'])
/** Names that are one letter to a student, though spelt with several. */
const WHOLE_NAMES = new Set(['theta', 'alpha', 'beta', 'gamma', 'phi', 'omega', 'lambda', 'mu', 'tau', 'sigma', 'rho', 'psi'])

/**
 * The letter to integrate or differentiate by when the student names none: x when it is there,
 * otherwise the only letter there is (∫ t² gives t³/3, not t²x), otherwise x. A run of letters
 * with no sign between them is a product of single letters (te^t is t·e^t), as SymPy reads it.
 */
export function calculusVariable(expr: string): string {
  let names: string[]
  try {
    const node = math.parse(preprocess(gluedFunctionsApart(expr)))
    const fns = new Set<MathNode>()
    node.traverse((n) => {
      if (n.type === 'FunctionNode') fns.add((n as unknown as { fn: MathNode }).fn)
    })
    names = node
      .filter((n) => n.type === 'SymbolNode' && !fns.has(n))
      .flatMap((n) => {
        const name = (n as unknown as { name: string }).name
        return NOT_VARIABLES.has(name) || WHOLE_NAMES.has(name) ? [name] : name.split('')
      })
      .filter((n) => !NOT_VARIABLES.has(n))
  } catch {
    return 'x'
  }
  const distinct = [...new Set(names)]
  if (distinct.includes('x')) return 'x'
  return distinct.length === 1 ? distinct[0] : 'x'
}

const LETTER = /^(?:[A-Za-z]|theta)$/

/**
 * The typed line as the worker's payload: "x e^x", "x^2, 0, 2" (limits), "t^2, t" (a letter),
 * "t^2, t, 0, 1". The keys are the ones `integral_steps` / `diff_steps` read in cas.worker.ts,
 * pinned by the fixtures recorded from them. `deg` goes only with trigonometry, because the
 * worker's "worked in radians" sentence is noise under ∫x² dx.
 */
function stepsRequest(
  job: 'integrate' | 'differentiate',
  src: string,
  deg: boolean
): { op: CasOp; payload: Record<string, unknown> } | { error: string } {
  const parts = splitArgs(src)
    .map((p) => p.trim())
    .filter(Boolean)
  const expr = parts[0] === undefined ? undefined : forSymPy(parts[0])
  const named = parts.length === 2 || parts.length === 4 ? forSymPy(parts[1]) : undefined
  const limits = parts.length === 3 ? parts.slice(1) : parts.length === 4 ? parts.slice(2) : null
  // Integrate: f | f, letter | f, a, b | f, letter, a, b. Differentiate: f | f, letter.
  const lengthOk = parts.length >= 1 && parts.length <= (job === 'integrate' ? 4 : 2)
  if (!expr || !lengthOk || (named !== undefined && !LETTER.test(named))) return { error: shapeSentence(job) }
  const v = named ?? calculusVariable(expr)
  const trig = calculusUnitNote(job === 'integrate' ? 'integrate' : 'diff', expr, deg) !== null
  const payload: Record<string, unknown> = { expr, var: v, deg: trig }
  if (limits) {
    payload.lower = limits[0]
    payload.upper = limits[1]
  }
  return { op: job === 'integrate' ? 'integral_steps' : 'diff_steps', payload }
}

function shapeSentence(job: 'integrate' | 'differentiate'): string {
  return job === 'integrate'
    ? 'Integrate takes one expression, like x eˣ, with the two limits after commas for a definite integral: x², 0, 2.'
    : 'Differentiate takes one expression, like x² sin x, with the letter after a comma when it is not x: t³, t.'
}

/**
 * The Working job behind a command-bar answer, for its "Show the working" button: diff(f) and
 * diff(f, t) → Differentiate, integrate(f), integrate(f, t) and integrate(f, a, b) → Integrate.
 * A second derivative (diff(f, x, 2)) has no step tree, so it gets no button.
 */
export function calculusJobFor(casOp: string, args: string[]): { job: 'integrate' | 'differentiate'; input: string } | null {
  const [f, second, third] = args.map((a) => a.trim())
  if (!f) return null
  let pick: { job: 'integrate' | 'differentiate'; input: string } | null = null
  // The working must use the bar's letter: the bar works diff(t^3) and integrate(t^2, 0, 2) in x,
  // while a line with no letter is worked in the one Working guesses from the expression (t), so
  // the answer said 0 and its own working said 3t². An x is left off the line only where Working
  // would guess x too (x^2 stays "x^2", not "x^2, x"); any other letter is written as typed.
  const guessed = calculusVariable(forSymPy(f))
  const withLetter = (letter: string, rest: string[] = []): string =>
    letter === 'x' && guessed === 'x' ? [f, ...rest].join(', ') : [f, letter, ...rest].join(', ')
  if (casOp === 'diff') {
    if (third !== undefined && Number(third) !== 1) return null
    pick = { job: 'differentiate', input: withLetter(second || 'x') }
  } else if (casOp === 'integrate') {
    // The bar reads integrate(f, a, b) as limits in x, whatever a fourth argument says.
    pick = { job: 'integrate', input: args.length >= 3 ? withLetter('x', [second, third]) : withLetter(second || 'x') }
  }
  return pick && casRequestFor(pick.job, pick.input, false) ? pick : null
}

/** A worker failure in words: the client's own sentences stand; Python's text never reaches a student. */
function stepsErrorSentence(job: JobId, error: string): string {
  if (/^(This took too long|The algebra engine|Cancelled)/.test(error)) return error
  const verb = job === 'integrate' ? 'integrate' : 'differentiate'
  // The example as a student reads it: the job's own `example` is the typed form (x^2 sin(x)).
  const example = job === 'integrate' ? 'x eˣ' : 'x² sin x'
  return `PhysLab could not read that as something to ${verb}. Write it the way the example shows: ${example}.`
}

/** The worker's reply to a calculus job as the working the panel shows. Pure: fixtures go straight in. */
export function stepsWorkingFor(job: JobId, src: string, reply: CasResult | IntegralTree | DerivTree, digits?: DigitSettings): Working {
  const label = jobById(job).label
  if (reply.error) return failed(label, src, stepsErrorSentence(job, reply.error))
  try {
    return job === 'integrate' ? integralWorking(reply as IntegralTree, src, digits) : derivativeWorking(reply as DerivTree, src)
  } catch {
    return failed(label, src, 'Something went wrong while setting out that working.')
  }
}

/**
 * Integrate or Differentiate one line, the whole way: the request, SymPy, the working. Used by the
 * Working panel and by a question's engine step, which both need the same answer for the same line.
 */
export async function workSteps(job: JobId, src: string): Promise<Working> {
  const label = jobById(job).label
  if (job !== 'integrate' && job !== 'differentiate') return failed(label, src, 'This job is not worked by the algebra engine.')
  const settings = scene().settings
  const req = stepsRequest(job, src, casInDegrees(settings.angleUnit))
  if ('error' in req) return failed(label, src, req.error)
  try {
    return stepsWorkingFor(job, src, await cas(req.op, req.payload), settings)
  } catch {
    return failed(label, src, 'Something went wrong while working that out.')
  }
}

/** The Working panel's calculus route: under `runSeq`, like `askCas`, so an old reply never lands on a newer question. */
async function askSteps(
  job: JobId,
  src: string,
  latex: string,
  asked: number,
  set: (p: Partial<PureState>) => void,
  get: () => PureState
): Promise<void> {
  const done = await workSteps(job, src)
  if (!casAnswerIsCurrent(asked, get().runSeq)) return
  // A refusal carries the typed line as its input, and the panel renders input as LaTeX: sqrt(x)
  // came out as s·q·r·t. It keeps the display form the placeholder showed a moment earlier.
  const working = done.error ? { ...done, input: latex } : done
  set({ working })
  if (!working.error) remember(job, src, latex, working, set, get)
}

async function askCas(
  job: JobId,
  src: string,
  latex: string,
  asked: number,
  set: (p: Partial<PureState>) => void,
  get: () => PureState
): Promise<void> {
  const req = casRequestFor(job, src, casInDegrees(scene().settings.angleUnit))
  if (!req) return
  set({ asking: true })
  try {
    const res = await cas(req.op, req.payload)
    // The question may have moved on while Pyodide was waking up.
    if (!casAnswerIsCurrent(asked, get().runSeq)) return
    const current = get().working
    if (!current?.error) return
    // "x = 2" reads as an answer; a bare "2" does not say what it is the value of.
    const answer = res.solutions
      ? res.solutions
          .map((sol) =>
            Object.entries(sol)
              .map(([name, v]) => `${name} = ${v.latex}`)
              .join(',\\; ')
          )
          .filter(Boolean)
          .join(',\\quad ')
      : res.latex
    if (res.error || !answer) {
      set({ asking: false })
      return
    }
    const working: Working = {
      ...current,
      error: undefined,
      noWorking: true,
      answers: [{ label: 'Answer', tex: answer }],
      // The student is told why the steps are missing, not just that they are.
      reason: current.error,
      check: undefined
    }
    set({ asking: false, working })
    // An answer is an answer: it goes into the history like any other, and recalling it asks again.
    remember(job, src, latex, working, set, get)
  } catch {
    set({ asking: false })
  }
}

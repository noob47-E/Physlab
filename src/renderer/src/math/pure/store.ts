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
import { ask, useEngineStatus, workSteps as engineWorkSteps, type EngineJob, type EngineRequest } from '../engine'
import { casWaitNote, followCasStart } from '../../ui/casStatus'
import { calculusUnitNote, casInDegrees } from '../../calc/angle'
import { scene } from '../../core/store'
import { math, preprocess, splitArgs } from '../expr'
import { calculusCall } from '../calculusCall'
import { CONSTANT_NAMES, GREEK_LETTERS } from '../names'
import { latexToMath } from '../latexToMath'
import { jobById, runPure, suggestJob, type JobId } from './run'
import { failed, type Working } from './work'
import { stepWorkingFor } from '../steps/solve'

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
  /** True while the algebra engine is being asked for an answer this engine could not work out itself. */
  asking: boolean
  /**
   * Counts every run. An algebra-engine answer carries the number of the run that asked for it, and is
   * dropped unless that is still the latest run. Comparing the input text instead let a slow
   * answer for an earlier problem land after the student had moved on to a later one with the
   * same text, or after a newer run had already answered.
   */
  runSeq: number
  history: PureEntry[]
  setInput: (s: string) => void
  setJob: (j: JobId) => void
  /**
   * `quiet` is for the Calculator's = asking for the working of a line it has already answered: when the step engine refuses the line,
   * the algebra engine is not asked for a second opinion (a Work it out pressed by hand still is).
   */
  run: (job?: JobId, input?: string, latex?: string, opts?: { quiet?: boolean }) => void
  /**
   * Run straight from a maths field. The LaTeX is converted here, inside the same guard as the
   * generators, so a refusal thrown by the converter (a ± the engine cannot use, say) is shown to
   * the student as a sentence. Converting in the panel first put that throw in the middle of a
   * render, where nothing catches it. 'auto' guesses the job from the shape of the text.
   */
  runLatex: (latex: string, job: JobId | 'auto', opts?: { quiet?: boolean }) => void
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

  run: (job, input, latex, opts) => {
    const j = job ?? get().job
    const src = (input ?? get().input).trim()
    if (!src) return
    if (jobById(j).engine === 'cas') {
      // Integrate and Differentiate are worked by the algebra engine, which answers a moment later (seconds on
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
    const angleUnit = casInDegrees(scene().settings.angleUnit) ? 'deg' : 'rad'
    const stepped = stepWorkingFor({ job: j, input: src, rawInput: latex, angleUnit })
    if (stepped) {
      working = stepped
    } else {
      try {
        working = runPure(j, src)
      } catch (err) {
        working = failed(jobById(j).label, latex ?? src, err instanceof Error && err.message ? err.message : 'Something went wrong while working that out.')
      }
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

    // A power past the limit is past the algebra engine's time too: x^100000 kept "Checking that one a different way…" up for a
    // minute and then nothing. Its refusal already says how far this goes, so it stands at once.
    if (TOO_BIG.test(working.error)) return

    // The answer is not optional. When this engine cannot show working, the algebra engine is asked for the
    // result alone, and the panel says plainly that the steps are missing.
    if (!opts?.quiet) void askCas(j, src, shown, runSeq, set, get)
  },

  runLatex: (latex, job, opts) => {
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
    get().run(job === 'auto' ? suggestJob(text) : job, text, latex, opts)
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
 * Which Pure Math jobs the algebra engine can take over when this engine cannot show working.
 *
 * `partial` and `divide` map to `apart`, not `simplify`: simplify on a fraction returns the
 * fraction, so the panel would print the question back as though it were the answer — worse than
 * showing nothing.
 */
const ENGINE_JOB: Partial<Record<JobId, EngineJob>> = {
  factor: 'factor',
  // Not plain `factor`, which factors over the rationals: the fallback for "Factorise with i"
  // used to hand back x² + 4 untouched and call it the answer.
  factorComplex: 'factorComplex',
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
 * The algebra engine's request for a job, as one pure function, or null when the engine has no
 * such job. Stated once, so it can be pinned by a test (each adapter's own spelling of it is
 * pinned in turn: a wrong payload key once made every solve fallback fail in silence).
 */
export function engineRequestFor(job: JobId, src: string, deg: boolean): { job: EngineJob; req: EngineRequest } | null {
  if (job === 'integrate' || job === 'differentiate') {
    const r = stepsRequest(job, src, deg)
    return 'error' in r ? null : r
  }
  const engineJob = ENGINE_JOB[job]
  if (!engineJob) return null
  // Sent with every request: without it the engine read radians, so solve(sin(x) = 0.5) answered
  // π/6 here and 30 in the command bar, in the same DEG mode on the same screen.
  return engineJob === 'solve' ? { job: engineJob, req: { eqs: [src], deg } } : { job: engineJob, req: { expr: src, deg } }
}

/** True when an engine answer that was asked for by run `asked` may still be shown. */
export const casAnswerIsCurrent = (asked: number, latest: number): boolean => asked === latest

// ---------------------------------------------------------------------------------------------
// Calculus working (Integrate, Differentiate): worked by the algebra engine (math/engine)
// ---------------------------------------------------------------------------------------------

/** What the panel says between asking the algebra engine and its reply. */
export const WORKING_IT_OUT = 'Working it out…'

/** The working shown while the engine is asked: the question, nothing pretending to be an answer. */
function workingItOut(job: JobId, latex: string): Working {
  // The first request waits for the engine to load; a bare "Working it out…" for ten seconds reads
  // as a hang, so the sentence names the load stage and follows it while this working is shown.
  const at = (note: string): Working => ({
    title: jobById(job).label,
    input: latex,
    method: note ? `${WORKING_IT_OUT} ${note}` : WORKING_IT_OUT,
    moves: [],
    answers: []
  })
  let shown = at(casWaitNote(useEngineStatus.getState()))
  followCasStart(useEngineStatus, (note) => {
    // Only while this very working is on the panel; a newer question or the answer replaces it.
    if (usePure.getState().working !== shown) return
    shown = at(note)
    usePure.setState({ working: shown })
  })
  return shown
}

/** Function names the engine reads, longest first so "asin" is never cut down to "a·sin". */
const FUNCTIONS = ['arcsin', 'arccos', 'arctan', 'asinh', 'acosh', 'atanh', 'asin', 'acos', 'atan', 'acot', 'sinh', 'cosh', 'tanh', 'sqrt', 'cbrt', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'exp', 'abs', 'log', 'ln']

/**
 * A function name glued to the letter before it, taken apart: "2xcos(x^(2))" → "2x*cos(x^(2))".
 * The Maths field's converter writes 2x cos(x²) that way, and the engine's parser split an unknown
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

/**
 * The Greek letters this route spells out for the engine and takes as one letter, from the one list
 * (math/names.ts): the twelve it has spelt since it was built (Phase 0.9-QCb). The others are left as
 * typed. Spelling them too would change what reaches the engine, so it waits for the engine's adapter.
 */
const WHOLE_NAMES: ReadonlySet<string> = new Set(['theta', 'alpha', 'beta', 'gamma', 'phi', 'omega', 'lambda', 'mu', 'tau', 'sigma', 'rho', 'psi'])
const SPELT_LETTERS = GREEK_LETTERS.filter((g) => WHOLE_NAMES.has(g.name))
const SPELLING: Record<string, string> = Object.fromEntries(SPELT_LETTERS.map((g) => [g.letter, g.name]))
const SPELT_LETTER = new RegExp(`[${SPELT_LETTERS.map((g) => g.letter).join('')}]`, 'g')

/**
 * The line with every name spelt plainly, as an engine's parser needs it: Greek letters spelt out
 * (the field writes θ, and the letter to differentiate by is spelt theta, so d/dθ(θ sin θ) came
 * back as 0), then glued function names taken apart.
 */
export function spelledOut(expr: string): string {
  return gluedFunctionsApart(expr.replace(SPELT_LETTER, (c) => SPELLING[c]))
}

/** The names that stand for a number: e, pi, i and the rest are never the letter to work by. */
const NOT_VARIABLES = CONSTANT_NAMES

/**
 * The letter to integrate or differentiate by when the student names none: x when it is there,
 * otherwise the only letter there is (∫ t² gives t³/3, not t²x), otherwise x. A run of letters
 * with no sign between them is a product of single letters (te^t is t·e^t), as the engine reads it.
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

/** A letter to differentiate or integrate by: one Latin letter, or a Greek one spelt out (GLM #25). */
const isLetter = (named: string): boolean => /^[A-Za-z]$/.test(named) || WHOLE_NAMES.has(named)

/**
 * The typed line as the engine's request: "x e^x", "x^2, 0, 2" (limits), "t^2, t" (a letter),
 * "t^2, t, 0, 1". Infinity stays ∞ or Infinity, and lambda stays lambda: spelling them for one
 * engine is that engine's adapter's job. `deg` goes only with trigonometry, because the engine's
 * "worked in radians" sentence is noise under ∫x² dx.
 */
function stepsRequest(
  job: 'integrate' | 'differentiate',
  src: string,
  deg: boolean
): { job: EngineJob; req: EngineRequest } | { error: string } {
  // A derivative or integral as the field writes it — diff(f, x), integral(f, a, b) — is the same question as the
  // comma form below with its call taken off: the arguments are what Differentiate and Integrate are given.
  const call = calculusCall(src)
  const parts = (call ? call.args : splitArgs(src))
    .map((p) => p.trim())
    .filter(Boolean)
  const expr = parts[0] === undefined ? undefined : spelledOut(parts[0])
  const named = parts.length === 2 || parts.length === 4 ? spelledOut(parts[1]) : undefined
  const limits = parts.length === 3 ? parts.slice(1) : parts.length === 4 ? parts.slice(2) : null
  // Integrate: f | f, letter | f, a, b | f, letter, a, b. Differentiate: f | f, letter.
  const lengthOk = parts.length >= 1 && parts.length <= (job === 'integrate' ? 4 : 2)
  if (!expr || !lengthOk || (named !== undefined && !isLetter(named))) return { error: shapeSentence(job) }
  const v = named ?? calculusVariable(expr)
  const trig = calculusUnitNote(job === 'integrate' ? 'integrate' : 'diff', expr, deg) !== null
  const req: EngineRequest = { expr, var: v, deg: trig }
  if (limits) {
    req.lower = spelledOut(limits[0])
    req.upper = spelledOut(limits[1])
  }
  return { job: job === 'integrate' ? 'integralSteps' : 'diffSteps', req }
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
  const guessed = calculusVariable(spelledOut(f))
  const withLetter = (letter: string, rest: string[] = []): string =>
    letter === 'x' && guessed === 'x' ? [f, ...rest].join(', ') : [f, letter, ...rest].join(', ')
  if (casOp === 'diff') {
    if (third !== undefined && Number(third) !== 1) return null
    pick = { job: 'differentiate', input: withLetter(second || 'x') }
  } else if (casOp === 'integrate') {
    // The bar reads integrate(f, a, b) as limits in x, whatever a fourth argument says.
    pick = { job: 'integrate', input: args.length >= 3 ? withLetter('x', [second, third]) : withLetter(second || 'x') }
  }
  return pick && engineRequestFor(pick.job, pick.input, false) ? pick : null
}

/**
 * Integrate or Differentiate one line, the whole way: the request, the engine, the working (a
 * refusal comes back already in PhysLab's words). Used by the Working panel and by a question's
 * engine step, which both need the same answer for the same line.
 */
export async function workSteps(job: JobId, src: string): Promise<Working> {
  const label = jobById(job).label
  if (job !== 'integrate' && job !== 'differentiate') return failed(label, src, 'This job is not worked by the algebra engine.')
  const settings = scene().settings
  const req = stepsRequest(job, src, casInDegrees(settings.angleUnit))
  if ('error' in req) return failed(label, src, req.error)
  try {
    return await engineWorkSteps(req.job as 'integralSteps' | 'diffSteps', req.req, { input: src, digits: settings })
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
  const r = engineRequestFor(job, src, casInDegrees(scene().settings.angleUnit))
  if (!r) return
  set({ asking: true })
  try {
    const res = await ask(r.job as Exclude<EngineJob, 'integralSteps' | 'diffSteps'>, r.req)
    // The question may have moved on while the engine was waking up.
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
      otherWayFailed(asked, set, get)
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
    otherWayFailed(asked, set, get)
  }
}

/** The sentence a refusal ends with when the algebra engine could not answer either: the waiting line never just goes away. */
export const OTHER_WAY_FAILED = 'I tried another way as well, and it could not work this out either.'

/** A refusal so large that asking the engine would only make the student wait (mono.ts MAX_POWER, and the like). */
const TOO_BIG = /too big|too large|too many/i

function otherWayFailed(asked: number, set: (p: Partial<PureState>) => void, get: () => PureState): void {
  if (!casAnswerIsCurrent(asked, get().runSeq)) return
  const current = get().working
  if (!current?.error || current.error.includes(OTHER_WAY_FAILED)) return set({ asking: false })
  set({ asking: false, working: { ...current, error: `${current.error} ${OTHER_WAY_FAILED}` } })
}

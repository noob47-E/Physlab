// A question's worked steps, as the Working panel shows them. An author writes the steps once
// with `{var}` chips; here one drawn variant fills the chips in, every part's answer is worked
// out from the same numbers, and the result is the same `Working` shape the Pure Math tools
// produce, so the panel needs nothing new. Fading sits on top: a student who has got two in a
// row right sees less of the working next time, and one who slips sees more again. Headless:
// no React, no store, no DOM.

import type { SymbolNode } from 'mathjs'
import { inDegrees, math, preprocess } from '../math/expr'
import type { MeasureSettings } from '../math/format'
import { JOBS, runPure, type JobId } from '../math/pure/run'
import { texToPlain, type Answer, type Move, type Working } from '../math/pure/work'
import type { V3 } from '../math/vec'
import {
  solveAddition,
  solveAdditionCosineLaw,
  solveAdditionGraphical,
  solveAngleBetween,
  solveComponents,
  solveCross,
  solveDot,
  solveEquilibrium,
  solveMagneticForce,
  solveMagnitudeDirection,
  solveProjection,
  solveRelativeVelocity,
  solveResolve,
  solveScalarMultiply,
  solveSubtraction,
  solveTorque,
  solveTwoForces,
  solveUnitVector,
  solveWork,
  type NamedVec,
  type Solution,
  type SolverSettings
} from '../math/vectorSolver'
import { format2AnswerTex, statedAnswerTex } from './answerKinds'
import { isCommandArgument, type FadingLevel, type PQPart, type PQQuestion, type PQStep, type UnitId } from './pqjson'
import { toAbsoluteTol } from './parts'
import { revealSettings, texQuantity, texUnit } from './units'
import { substitute, type Variant } from './variables'
// A type only: player.ts builds on this file, so a value import back would be circular.
import type { Played } from './player'

/** The panel's own step shape plus the author's mark that fading may blank it. */
export interface StepMove extends Move {
  blank?: boolean
}

/** What the student sees on a blanked line in place of its maths. */
export const FILL_IN_NOTE = 'Fill this line in yourself, then reveal it.'

const COULD_NOT = 'PhysLab could not work this step out.'

// ---------------------------------------------------------------------------
// Numbers into LaTeX
// ---------------------------------------------------------------------------

const CHIP = /\{([A-Za-z][A-Za-z0-9_]*)\}/g

/**
 * Chips inside LaTeX: a value in brackets when negative, so `{a} \times 2` never reads
 * `-3 \times 2` as a subtraction, and when a unit sits under a power or a subscript, so
 * `{t}^2` with t = 5 s reads (5 s)² and not 5 s². A command's argument (`\mathrm{v}`) is LaTeX,
 * not a chip, as it is for Numbas.
 */
export function substituteTex(tex: string, values: Record<string, number>, units: Record<string, UnitId | undefined>, s: MeasureSettings): string {
  return tex.replace(CHIP, (chip, name: string, at: number) => {
    const v = values[name]
    if (v === undefined || Number.isNaN(v) || isCommandArgument(tex, at)) return chip
    const q = texQuantity(v, units[name], s)
    const next = tex.slice(at + chip.length).trimStart()[0]
    const raised = (next === '^' || next === '_') && texUnit(units[name]) !== ''
    return v < 0 || raised ? `\\left(${q}\\right)` : q
  })
}

// ---------------------------------------------------------------------------
// Words with maths in them
// ---------------------------------------------------------------------------

/**
 * A piece of what the student reads: plain words, or maths set by KaTeX — inline, or a display
 * line of its own. A teacher's Numbas file keeps its inline maths as `\(…\)`; handed to the panel
 * as plain text, the student read the backslashes and the LaTeX.
 */
export type Segment = { text: string } | { tex: string; display: boolean }

/** What an author's text is filled in from: the drawn values, their units, the student's precision. */
export type Fill = { values: Record<string, number>; units: Record<string, UnitId | undefined>; settings: MeasureSettings }

const INLINE = /\\\(([\s\S]*?)\\\)/

/**
 * One line of an author's text → segments with the numbers in. A line starting `$$` is display
 * maths; otherwise every `\(…\)` span is inline maths. Chips in words get the plain number and
 * unit, chips in maths the LaTeX one (`substituteTex`).
 */
export function lineSegments(line: string, f: Fill): Segment[] {
  const trimmed = line.trim()
  if (trimmed.startsWith('$$')) {
    return [{ tex: substituteTex(trimmed.replace(/^\$\$|\$\$$/g, ''), f.values, f.units, f.settings), display: true }]
  }
  const out: Segment[] = []
  // split with one capture group alternates words (even) and the maths inside \(…\) (odd).
  line.split(new RegExp(INLINE.source, 'g')).forEach((piece, k) => {
    if (k % 2 === 1) out.push({ tex: substituteTex(piece, f.values, f.units, f.settings), display: false })
    else if (piece !== '') out.push({ text: substitute(piece, f.values, f.units, f.settings) })
  })
  return out
}

/** A block of text → its non-empty lines as segments. */
export function textLines(text: string, f: Fill): Segment[][] {
  return text
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => lineSegments(l, f))
}

/** Segments read as one plain sentence: the maths spoken (texToPlain), never raw LaTeX. */
export function spokenOf(segments: Segment[]): string {
  return segments
    .map((s) => ('text' in s ? s.text : texToPlain(s.tex)))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

/** An author's text as one plain sentence with the numbers in and any inline maths spoken. */
const spoken = (text: string, f: Fill): string => spokenOf(textLines(text, f).flat())

// ---------------------------------------------------------------------------
// The answers
// ---------------------------------------------------------------------------

/** Text set inside \text{}: the characters TeX reads as commands are escaped, nothing else changes. */
export function texText(text: string): string {
  return text.replace(/[\\{}$&#%_^~]/g, (c) => (c === '\\' ? '\\textbackslash{}' : c === '^' ? '\\^{}' : c === '~' ? '\\~{}' : `\\${c}`))
}

/**
 * A mathjs expression with the drawn values in place of the variables, as LaTeX. A negative
 * value goes in brackets: `x - a` with a = −2 would otherwise print `x--2`, and `a^2` as
 * `{-2}^{2}`, which a student reads as −(2²).
 */
function texExpression(expr: string, values: Record<string, number>): string {
  const node = math.parse(preprocess(expr)).transform((n) => {
    if (n.type === 'SymbolNode') {
      const v = values[(n as SymbolNode).name]
      if (v !== undefined && Number.isFinite(v)) return v < 0 ? new math.ParenthesisNode(new math.ConstantNode(v)) : new math.ConstantNode(v)
    }
    return n
  })
  return node.toTex()
}

function evaluateIn(expr: string, values: Record<string, number>): number {
  // Always in degrees, as the variables were drawn (questions/variables.ts): a question's
  // answer must not change because the calculator was last left in radians.
  return Number(inDegrees(() => math.evaluate(preprocess(expr), { ...values })))
}

function answerFor(part: PQPart, values: Record<string, number>, units: Record<string, UnitId | undefined>, s: MeasureSettings): Answer {
  // Spoken, as the box above it is: an author's \(…\) in a prompt reached the reveal as backslashes.
  const label = spoken(part.prompt, { values, units, settings: s })
  if (part.type === 'number') {
    let v: number
    try {
      v = evaluateIn(part.answer, values)
    } catch {
      v = NaN
    }
    // A stated (Eₙ) part refuses a bare number, so its answer is revealed as value ± uncertainty.
    if (part.tolerance.kind === 'stated') {
      let u: number
      try {
        u = evaluateIn(part.tolerance.uref, values)
      } catch {
        u = NaN
      }
      return { label, tex: statedAnswerTex(v, u, part.unit, s) }
    }
    // Enough figures that the answer shown, typed back, marks right: 0.0538 m³, never 0.05 m³.
    return { label, tex: Number.isFinite(v) ? texQuantity(v, part.unit, revealSettings(v, toAbsoluteTol(part, v), s)) : '\\text{?}' }
  }
  if (part.type === 'expression') {
    try {
      return { label, tex: texExpression(part.answer, values) }
    } catch {
      return { label, tex: '\\text{?}' }
    }
  }
  if (part.type !== 'choice') return { label, tex: format2AnswerTex(part, values, s) }
  const right = part.choices.filter((c) => c.correct).map((c) => `\\text{${texText(substitute(c.text, values, units, s))}}`)
  return { label, tex: right.length > 0 ? right.join(',\\ ') : '\\text{?}' }
}

// ---------------------------------------------------------------------------
// Steps the engine writes
// ---------------------------------------------------------------------------

/** The vector solvers a step may name, with how many inputs each takes before its settings. */
const VECTOR_SOLVERS: Record<string, { fn: (...args: unknown[]) => Solution; arity: number }> = {
  solveComponents: { fn: solveComponents as never, arity: 4 },
  solveMagnitudeDirection: { fn: solveMagnitudeDirection as never, arity: 1 },
  solveResolve: { fn: solveResolve as never, arity: 1 },
  solveAddition: { fn: solveAddition as never, arity: 2 },
  solveAdditionCosineLaw: { fn: solveAdditionCosineLaw as never, arity: 3 },
  solveAdditionGraphical: { fn: solveAdditionGraphical as never, arity: 2 },
  solveSubtraction: { fn: solveSubtraction as never, arity: 3 },
  solveScalarMultiply: { fn: solveScalarMultiply as never, arity: 3 },
  solveUnitVector: { fn: solveUnitVector as never, arity: 1 },
  solveDot: { fn: solveDot as never, arity: 2 },
  solveAngleBetween: { fn: solveAngleBetween as never, arity: 2 },
  solveCross: { fn: solveCross as never, arity: 3 },
  solveProjection: { fn: solveProjection as never, arity: 2 },
  solveRelativeVelocity: { fn: solveRelativeVelocity as never, arity: 2 },
  solveTwoForces: { fn: solveTwoForces as never, arity: 4 },
  solveEquilibrium: { fn: solveEquilibrium as never, arity: 1 },
  solveTorque: { fn: solveTorque as never, arity: 2 },
  solveMagneticForce: { fn: solveMagneticForce as never, arity: 3 },
  solveWork: { fn: solveWork as never, arity: 2 }
}

export const VECTOR_SOLVER_NAMES: readonly string[] = Object.keys(VECTOR_SOLVERS)

const NUMBER = /^[-−+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i
const NAMED = /^([A-Za-z][A-Za-z0-9_]*)\s*[:=]\s*[<([]\s*(.+?)\s*[>)\]]$/
const TRIPLE = /^[<([]\s*(.+?)\s*[>)\]]$/

function readV3(inner: string, values: Record<string, number>): V3 {
  const parts = inner.split(',').map((p) => evaluateIn(p, values))
  if (parts.length < 2 || parts.length > 3 || parts.some((v) => !Number.isFinite(v))) throw new Error('not a vector')
  return [parts[0], parts[1], parts[2] ?? 0]
}

/**
 * One argument of a vector solver, read from the author's text after the chips are filled in:
 * a number (`{F}` → 30), a named vector (`A: <3, 4>` or `F = ({Fx}, {Fy})`), a bare vector
 * (`<1, 0, 0>`), several named vectors separated by `;`, a number the calculator can work out
 * (`1.6×10^-19`, which is how a chip prints a charge, or `2 * 3`), or a word (a name or a unit).
 */
export function readSolverArg(text: string, values: Record<string, number>): unknown {
  const t = text.trim().replace(/−/g, '-')
  if (NUMBER.test(t)) return Number(t)
  if (t.includes(';')) return t.split(';').map((piece) => readSolverArg(piece, values))
  const named = NAMED.exec(t)
  if (named) return { name: named[1], v: readV3(named[2], values) } satisfies NamedVec
  const triple = TRIPLE.exec(t)
  if (triple) return readV3(triple[1], values)
  // Last, so a vector is never mistaken for a number; a word with no digit (a unit such as `N`) is
  // never a number and is not tried, and `m/s^2` comes back from mathjs as a unit, not a number.
  if (/\d/.test(t)) {
    try {
      const v: unknown = inDegrees(() => math.evaluate(preprocess(t), { ...values }))
      if (typeof v === 'number' && Number.isFinite(v)) return v
    } catch {
      // Not something the calculator reads: it is a word.
    }
  }
  return t
}

/** What an engine step worked by SymPy shows until `resolveAutoSteps` has its reply. */
export const WORKING_IT_OUT_STEP = 'Working it out…'

/** Where a SymPy-worked step's reply is kept: its job and its line with this variant's numbers in. */
export const casStepKey = (job: string, input: string): string => `${job}\u0000${input}`

/** Integrate or Differentiate one line through SymPy (the app passes math/pure/store.ts `workSteps`). */
export type StepWorker = (job: JobId, input: string) => Promise<Working>

/** A SymPy-worked step's reply as moves: its steps, or its answer alone with the reason, never nothing. */
function casMoves(done: Working, cannot: (why?: string) => StepMove[]): StepMove[] {
  if (done.error) return cannot(done.error)
  if (done.moves.length) return done.moves.map((m) => ({ ...m, blank: false }))
  const answer = done.answers[0]?.tex
  if (answer === undefined) return cannot(done.reason)
  return [{ head: done.reason ?? COULD_NOT, tex: `${done.input} ${answer.startsWith('\\approx') ? '' : '= '}${answer}`, blank: false }]
}

/**
 * The moves an engine step contributes, or the one move that says it could not. A job SymPy
 * works (Integrate, Differentiate) cannot answer synchronously: it shows "Working it out…" until
 * its reply is in `resolved`.
 */
function autoMoves(
  step: PQStep,
  values: Record<string, number>,
  units: Record<string, UnitId | undefined>,
  s: MeasureSettings,
  resolved?: ReadonlyMap<string, Working>
): StepMove[] {
  const auto = step.auto!
  const cannot = (why?: string): StepMove[] => [{ head: COULD_NOT, note: why, blank: false }]
  if (auto.engine === 'pure') {
    const def = JOBS.find((j) => j.id === auto.job)
    if (!def) return cannot()
    const input = substitute(auto.input, values, {}, s)
    if (def.engine === 'cas') {
      const done = resolved?.get(casStepKey(def.id, input))
      return done ? casMoves(done, cannot) : [{ head: WORKING_IT_OUT_STEP, blank: false }]
    }
    const working = runPure(def.id, input)
    if (working.error) return cannot(working.error)
    return working.moves.map((m) => ({ ...m, blank: false }))
  }
  const solver = VECTOR_SOLVERS[auto.solver]
  if (!solver) return cannot()
  // Each chip is the value itself, not its text at the student's precision: filled in rounded,
  // a worked-out Fx = 25.98076 went into the solver as 25.98 and the working's last line could
  // disagree with the part's own answer in the last digit. The solver rounds what it shows.
  const exact = (text: string): string =>
    text.replace(CHIP, (chip, name: string) => {
      const v = values[name]
      return v === undefined || Number.isNaN(v) ? chip : String(v)
    })
  let args: unknown[]
  try {
    args = auto.args.map((a) => readSolverArg(exact(a), values))
  } catch {
    return cannot()
  }
  while (args.length < solver.arity) args.push(undefined)
  let solution: Solution
  try {
    solution = solver.fn(...args.slice(0, solver.arity), s satisfies SolverSettings)
  } catch {
    return cannot()
  }
  return solution.steps.map((st) => ({ head: st.text ?? '', tex: st.tex, blank: false })).filter((m) => m.head !== '' || m.tex !== undefined)
}

// ---------------------------------------------------------------------------
// Fading
// ---------------------------------------------------------------------------

/**
 * Less of the working as the student gets better. `worked` shows everything; `half` keeps the
 * heads and rules but blanks the maths of every move the author marked, with a note asking the
 * student to write that line; `solo` leaves only the heads (and the stage heading), so the
 * student reconstructs every line. The reveal itself — how many steps show first, "Let me try
 * first" — is the panel's existing machinery and is untouched.
 */
export function fadeMoves(moves: StepMove[], level: FadingLevel): Move[] {
  if (level === 'worked') return moves.map(({ blank: _blank, ...m }) => m)
  if (level === 'half') {
    return moves.map(({ blank, ...m }) => {
      if (!blank) return m
      const faded: Move = { head: m.head, note: FILL_IN_NOTE }
      if (m.rule !== undefined) faded.rule = m.rule
      if (m.subgoal !== undefined) faded.subgoal = m.subgoal
      return faded
    })
  }
  return moves.map((m) => (m.subgoal !== undefined ? { head: m.head, subgoal: m.subgoal } : { head: m.head }))
}

const LEVELS: readonly FadingLevel[] = ['worked', 'half', 'solo']

/**
 * Where the fading goes after an answer. `correctStreak` is how many the student has got right
 * in a row, counting the one just given: every second right answer in a row fades one level
 * further, and a wrong answer (a streak of 0) brings one level back. Nothing moves past `solo`
 * or before `worked`.
 */
export function nextLevel(level: FadingLevel, correctStreak: number): FadingLevel {
  const at = LEVELS.indexOf(level)
  if (correctStreak <= 0) return LEVELS[Math.max(0, at - 1)]
  if (correctStreak % 2 === 0) return LEVELS[Math.min(LEVELS.length - 1, at + 1)]
  return level
}

// ---------------------------------------------------------------------------
// The whole piece of working
// ---------------------------------------------------------------------------

const unitsOf = (q: PQQuestion): Record<string, UnitId | undefined> => Object.fromEntries(q.variables.map((v) => [v.name, v.unit]))

/**
 * A question and one drawn variant → the Working the panel shows: the author's steps with
 * the numbers in, engine-made steps spliced in where the author asked for them, and one
 * answer per part worked out from the same numbers. `checked` is `ok` because the answers
 * were computed from the variables — there is nothing to verify, and the panel must still show
 * its tick. `level` fades the steps; it defaults to the level saved with the question.
 */
export function stepsToWorking(
  q: PQQuestion,
  variant: Variant,
  settings: MeasureSettings,
  level?: FadingLevel,
  resolved?: ReadonlyMap<string, Working>
): Working {
  const { values } = variant
  const units = unitsOf(q)
  // Heads and notes are read as sentences, their inline maths spoken as a prompt's is: filled in
  // with the numbers alone, an author's "Use \(v_{0} = {u}\)" reached the student as
  // "Use \(v_0 = 16 m/s\)", since the panel's texToPlain strips commands but not \( \).
  const plain = (text: string): string => spoken(text, { values, units, settings })

  const moves: StepMove[] = []
  for (const step of q.steps?.items ?? []) {
    if (step.auto) {
      moves.push(...autoMoves(step, values, units, settings, resolved))
      continue
    }
    const m: StepMove = { head: plain(step.head), blank: step.blank === true }
    if (step.tex !== undefined) m.tex = substituteTex(step.tex, values, units, settings)
    if (step.rule !== undefined) m.rule = substituteTex(step.rule, values, units, settings)
    if (step.note !== undefined) m.note = plain(step.note)
    moves.push(m)
  }
  if (moves.length > 0) moves[0].subgoal = 'Working'

  const display = q.statement.split('\n').find((line) => line.startsWith('$$'))
  const input = display === undefined ? '' : substituteTex(display.replace(/^\$\$|\$\$$/g, ''), values, units, settings)

  return {
    title: plain(q.title),
    input,
    moves: fadeMoves(moves, level ?? q.steps?.level ?? 'worked'),
    answers: q.parts.map((p) => answerFor(p, values, units, settings)),
    checked: 'ok'
  }
}

/**
 * The SymPy replies a question's Integrate and Differentiate steps need, keyed by `casStepKey` for
 * `stepsToWorking`: `work` is asked once per distinct line, and a line it could not answer gets a
 * reply that says so, never a step left "Working it out…". Null when there is no such step. The
 * player (`resolveAutoSteps`) and the Question Author's preview of an engine step both use it.
 */
export async function workCasSteps(
  q: PQQuestion,
  values: Record<string, number>,
  settings: MeasureSettings,
  work: StepWorker
): Promise<Map<string, Working> | null> {
  const wanted = new Map<string, { job: JobId; input: string }>()
  for (const step of q.steps?.items ?? []) {
    const auto = step.auto
    if (auto?.engine !== 'pure') continue
    const def = JOBS.find((j) => j.id === auto.job)
    if (def?.engine !== 'cas') continue
    const input = substitute(auto.input, values, {}, settings)
    wanted.set(casStepKey(def.id, input), { job: def.id, input })
  }
  if (!wanted.size) return null
  const resolved = new Map<string, Working>()
  await Promise.all(
    [...wanted].map(async ([key, { job, input }]) => {
      let done: Working
      try {
        done = await work(job, input)
      } catch {
        done = { title: job, input, moves: [], answers: [], error: 'The algebra engine did not answer.' }
      }
      resolved.set(key, done)
    })
  )
  return resolved
}

/**
 * A played question with its SymPy-worked steps filled in. `playQuestion` has to answer at once,
 * so an Integrate or Differentiate step is drawn as "Working it out…"; this asks `work` for each
 * such step (once per distinct line), then sets the working, the full solution and the problem's
 * steps out again from the same numbers. A question with no such step comes back unchanged (the
 * same object, so Problem Sets knows there is nothing to swap in).
 */
export async function resolveAutoSteps(played: Played, settings: MeasureSettings, work: StepWorker): Promise<Played> {
  const q = played.question
  const resolved = await workCasSteps(q, played.variant.values, settings, work)
  if (!resolved) return played
  const working = stepsToWorking(q, played.variant, settings, played.level, resolved)
  const full = played.level === 'worked' ? working : stepsToWorking(q, played.variant, settings, 'worked', resolved)
  return {
    ...played,
    working,
    full,
    problem: { ...played.problem, solution: { ...played.problem.solution, steps: working.moves.map((m) => ({ text: m.head, tex: m.tex })) } }
  }
}

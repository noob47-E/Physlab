// A question's worked steps, as the Working panel shows them. An author writes the steps once
// with `{var}` chips; here one drawn variant fills the chips in, every part's answer is worked
// out from the same numbers, and the result is the same `Working` shape the Pure Math tools
// produce, so the panel needs nothing new. Fading sits on top: a student who has got two in a
// row right sees less of the working next time, and one who slips sees more again. Headless:
// no React, no store, no DOM.

import type { SymbolNode } from 'mathjs'
import { inDegrees, math, preprocess } from '../math/expr'
import { texPrecise, texSci, type MeasureSettings } from '../math/format'
import { JOBS, runPure, type JobId } from '../math/pure/run'
import type { Answer, Move, Working } from '../math/pure/work'
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
import type { FadingLevel, PQPart, PQQuestion, PQStep, UnitId } from './pqjson'
import { substitute, type Variant } from './variables'

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

/**
 * A unit as KaTeX sets it. `substitute` writes units as plain text ("2.5 m/s"), which is right
 * in a sentence and wrong in maths, where `m/s` would be three italic letters and `°` a stray
 * symbol. Only the units with a special character need a spelling of their own.
 */
const TEX_UNITS: Partial<Record<UnitId, string>> = {
  '°': '^{\\circ}',
  '°C': '^{\\circ}\\mathrm{C}',
  Ω: '\\Omega',
  'm/s²': '\\mathrm{m/s^{2}}',
  'N·m': '\\mathrm{N\\cdot m}',
  'kg·m/s': '\\mathrm{kg\\cdot m/s}',
  'm²': '\\mathrm{m^{2}}',
  'm³': '\\mathrm{m^{3}}'
}

export function texUnit(unit: UnitId | undefined): string {
  if (unit === undefined || unit === 'none') return ''
  return TEX_UNITS[unit] ?? `\\mathrm{${unit}}`
}

/**
 * A drawn value as LaTeX with its unit: the same numbers and the same scientific threshold as
 * the chips in the statement, so a step never contradicts the question above it. A degree sign
 * sits against its number; every other unit takes a thin space.
 */
export function texQuantity(v: number, unit: UnitId | undefined, s: Pick<MeasureSettings, 'decimals' | 'precisionMode'>): string {
  const abs = Math.abs(v)
  const number = abs >= 1e6 || (abs > 0 && abs < 1e-3) ? texSci(v, s) : texPrecise(v, s)
  const u = texUnit(unit)
  if (u === '') return number
  if (unit === '°' || unit === '°C') {
    // A degree is a superscript, and a scientific number already carries one: KaTeX refuses
    // 10^{-19}^{\circ} as a double superscript unless the number is grouped first.
    return number.includes('^') ? `{${number}}${u}` : `${number}${u}`
  }
  return `${number}\\,${u}`
}

const CHIP = /\{([A-Za-z][A-Za-z0-9_]*)\}/g

/**
 * Chips inside LaTeX: a value in brackets when negative, so `{a} \times 2` never reads
 * `-3 \times 2` as a subtraction, and when a unit sits under a power or a subscript, so
 * `{t}^2` with t = 5 s reads (5 s)² and not 5 s².
 */
export function substituteTex(tex: string, values: Record<string, number>, units: Record<string, UnitId | undefined>, s: MeasureSettings): string {
  return tex.replace(CHIP, (chip, name: string, at: number) => {
    const v = values[name]
    if (v === undefined || Number.isNaN(v)) return chip
    const q = texQuantity(v, units[name], s)
    const next = tex.slice(at + chip.length).trimStart()[0]
    const raised = (next === '^' || next === '_') && texUnit(units[name]) !== ''
    return v < 0 || raised ? `\\left(${q}\\right)` : q
  })
}

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
  const label = substitute(part.prompt, values, units, s)
  if (part.type === 'number') {
    let v: number
    try {
      v = evaluateIn(part.answer, values)
    } catch {
      v = NaN
    }
    return { label, tex: Number.isFinite(v) ? texQuantity(v, part.unit, s) : '\\text{?}' }
  }
  if (part.type === 'expression') {
    try {
      return { label, tex: texExpression(part.answer, values) }
    } catch {
      return { label, tex: '\\text{?}' }
    }
  }
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

/** The moves an engine step contributes, or the one move that says it could not. */
function autoMoves(step: PQStep, values: Record<string, number>, units: Record<string, UnitId | undefined>, s: MeasureSettings): StepMove[] {
  const auto = step.auto!
  const cannot = (why?: string): StepMove[] => [{ head: COULD_NOT, note: why, blank: false }]
  if (auto.engine === 'pure') {
    if (!JOBS.some((j) => j.id === auto.job)) return cannot()
    const working = runPure(auto.job as JobId, substitute(auto.input, values, {}, s))
    if (working.error) return cannot(working.error)
    return working.moves.map((m) => ({ ...m, blank: false }))
  }
  const solver = VECTOR_SOLVERS[auto.solver]
  if (!solver) return cannot()
  let args: unknown[]
  try {
    args = auto.args.map((a) => readSolverArg(substitute(a, values, {}, s), values))
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
export function stepsToWorking(q: PQQuestion, variant: Variant, settings: MeasureSettings, level?: FadingLevel): Working {
  const { values } = variant
  const units = unitsOf(q)
  const plain = (text: string): string => substitute(text, values, units, settings)

  const moves: StepMove[] = []
  for (const step of q.steps?.items ?? []) {
    if (step.auto) {
      moves.push(...autoMoves(step, values, units, settings))
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

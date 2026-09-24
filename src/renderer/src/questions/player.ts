// Playing one question: a PQJSON question and a seed become the Problem shape the Practice panel
// already plays (its answer boxes, its hints, its "Show the full solution"), plus what a PQ
// question has on top — expression and choice parts, worked steps that fade, and the "Show it"
// bindings: a picture drawn in Graphing, a motion drawn as x–t and v–t curves with its readings in
// Lab Data, an experiment loaded in the Sandbox with a push on a named body.
//
// The pure half (playQuestion, the plans, the marking) is tested headless; the three `show*`
// functions are the only ones that reach a store, and they go through the same entry points the
// command bar and the Sandbox's own preset list use.

import type { EvalFunction, MathNode, SymbolNode } from 'mathjs'
import { scene } from '../core/store'
import { frameGraphs, visualizeBetween, visualizeGraph, visualizePiecewise, visualizeTangentAt } from '../core/visualize'
import { useLab } from '../lab/labStore'
import type { Check } from '../math/checkAnswer'
import { inDegrees, math, preprocess } from '../math/expr'
import { fmtPrecise, type MeasureSettings } from '../math/format'
import type { AnswerField, Problem } from '../math/problems'
import type { Working } from '../math/pure/work'
import type { V3 } from '../math/vec'
import { useSandbox } from '../sim/store'
import { presetById } from '../sim/presets'
import { tableFrom } from '../sim/recording'
import type { Actuator } from '../sim/types'
import { checkChoicePart, generateChoices, type Choice } from './distractors'
import { motionPieces, motionTable, type MotionPieces } from './motion'
import { checkFormat2Part } from './answerKinds'
import { checkExpressionPart, checkNumberPart, evaluateInVariables, toAbsoluteTol } from './parts'
import type { FadingLevel, PQMotion, PQPart, PQPicture, PQQuestion, PQSandbox, UnitId } from './pqjson'
import { spokenOf, stepsToWorking, textLines, type Fill, type Segment } from './steps'
import { formatQuantity, UNITS } from './units'
import { plainFormula } from './plainFormula'
import { drawVariables, substitute, type Variant } from './variables'

/** The Problem shape without the vector topic and level a generated vector problem carries. */
export type QuestionProblem = Omit<Problem, 'topic' | 'level'>

// The text helpers live beside the steps, which need them too (a step's heading is read the same
// way as a prompt); the panel and the tests still reach them here.
export { lineSegments, spokenOf, textLines, type Segment } from './steps'

/** One option of a choice part: `text` spoken plainly (for marking and reading aloud), `segments` for the eye. */
export interface PlayedChoice extends Choice {
  segments: Segment[]
}

/** One part as the panel shows it: its prompt with the numbers in, and what it is marked against. */
export interface PlayedPart {
  /** The answer box's key in the panel's typed/checks maps. */
  key: string
  part: PQPart
  /** The prompt as a plain sentence: the box's label and its accessible name. No LaTeX. */
  prompt: string
  /** The prompt as the student sees it, each line's maths set by KaTeX. */
  promptLines: Segment[][]
  /** A number part's box, in the same shape a vector problem's box has. */
  field?: AnswerField
  /** A choice part's options for this variant, generated or as listed, in the order shown. */
  choices?: PlayedChoice[]
  /** Several right options: the student ticks every one that applies. */
  multi?: boolean
  /** The answer as text, for the reveal (a number part through formatQuantity). */
  answerText?: string
  /** The answer as LaTeX, for the reveal (every part). */
  answerTex: string
}

export interface Played {
  question: PQQuestion
  variant: Variant
  problem: QuestionProblem
  parts: PlayedPart[]
  /**
   * The statement with the numbers in, one entry per line, in the author's order: a `$$` line is
   * a single display segment, any other line its words with inline maths between them. Every
   * display line is kept — only the first used to be shown, and the rest vanished without a word.
   */
  statement: Segment[][]
  /** The worked steps at `level`, in the Working panel's shape. */
  working: Working
  /**
   * The same steps with nothing faded, for "Show the full solution": a line the student was
   * asked to fill in must be there to check against once they ask to see it.
   */
  full: Working
  level: FadingLevel
  /** Plain sentences about anything in this variant that could not be worked out; empty when all is well. */
  problems: string[]
  /**
   * The same sentences by the part they are about, keyed like `PlayedPart.key`; a problem with
   * the variables themselves belongs to no one part and is only in `problems`. The author's
   * Solution tab showed the question's first problem under every part, so part 2's box could
   * carry part 1's complaint.
   */
  partProblems: Record<string, string[]>
}

const unitsOf = (q: PQQuestion): Record<string, UnitId | undefined> => Object.fromEntries(q.variables.map((v) => [v.name, v.unit]))

/**
 * A question and a seed → everything the panel needs to play it. The number parts become the
 * same `AnswerField`s a vector problem has, so the existing field loop marks them; the hints are
 * the question's own steps (faded to `level`), and the full solution's answers are the steps'
 * answers, worked out from the same numbers as the statement.
 */
export function playQuestion(q: PQQuestion, seed: number, settings: MeasureSettings, level?: FadingLevel): Played {
  const variant = drawVariables(q, seed)
  const { values } = variant
  const fill: Fill = { values, units: unitsOf(q), settings }
  /** Words a student reads with no room for maths (a title, a verdict): any inline maths spoken. */
  const plain = (text: string): string => spokenOf(textLines(text, fill).flat())
  const lv = level ?? q.steps?.level ?? 'worked'
  const working = stepsToWorking(q, variant, settings, lv)
  const problems = [...variant.problems]
  const partProblems: Record<string, string[]> = {}

  const parts: PlayedPart[] = q.parts.map((part, i) => {
    const key = `p${i}`
    const own: string[] = (partProblems[key] = [])
    const flag = (sentence: string) => {
      problems.push(sentence)
      own.push(sentence)
    }
    const promptLines = textLines(part.prompt, fill)
    const prompt = spokenOf(promptLines.flat())
    const answerTex = working.answers[i]?.tex ?? '\\text{?}'
    const base = { key, part, prompt, promptLines, answerTex }
    if (part.type === 'number') {
      let value = NaN
      try {
        value = evaluateInVariables(part.answer, values)
      } catch {
        // Left NaN; the sentence below says so, and the box marks nothing as right.
      }
      if (!Number.isFinite(value)) flag(`PhysLab could not work out the answer to "${prompt}", so it cannot mark it.`)
      const traps = (part.traps ?? []).map((t) => ({ value: safeValue(t.value, values), why: plain(t.why) }))
      if (traps.some((t) => !Number.isFinite(t.value))) {
        flag(`PhysLab could not work out one of the mistakes "${prompt}" watches for, so it will not name that one.`)
      }
      const field: AnswerField = {
        key,
        label: prompt,
        unit: part.unit === 'none' ? undefined : UNITS[part.unit].label,
        value,
        tol: toAbsoluteTol(part, value),
        kind: part.kind,
        traps: traps.filter((t) => Number.isFinite(t.value))
      }
      return { ...base, field, answerText: Number.isFinite(value) ? formatQuantity(value, part.unit, settings) : '?' }
    }
    if (part.type === 'choice') {
      let raw: Choice[]
      try {
        raw = generateChoices(part, values, settings)
      } catch {
        // A generated choice whose right answer cannot be worked out has nothing to offer; the
        // part shows no options and the sentence below says why, instead of the panel crashing.
        flag(`PhysLab could not work out the options for "${prompt}".`)
        raw = []
      }
      // A listed choice may hold chips and maths too ("{v} m/s", "\(v = u\)"); a generated one is already a number.
      const choices = raw.map((c): PlayedChoice => {
        const segments = textLines(c.text, fill).flat()
        return { ...c, text: spokenOf(segments), segments, why: c.why === undefined ? undefined : plain(c.why) }
      })
      const right = choices.filter((c) => c.correct)
      return { ...base, choices, multi: right.length > 1, answerText: right.map((c) => c.text).join(', ') }
    }
    return base
  })

  const statement = textLines(q.statement, fill)
  const title = plain(q.title)

  const problem: QuestionProblem = {
    id: `${q.id}#${seed}`,
    title,
    prompt: statement.map(spokenOf).join(' '),
    fields: parts.flatMap((p) => (p.field ? [p.field] : [])),
    solution: {
      title,
      steps: working.moves.map((m) => ({ text: m.head, tex: m.tex })),
      answers: working.answers.map((a) => ({ label: a.label, tex: a.tex }))
    }
  }

  const full = lv === 'worked' ? working : stepsToWorking(q, variant, settings, 'worked')
  return { question: q, variant, problem, parts, statement, working, full, level: lv, problems, partProblems }
}

function safeValue(expr: string, values: Record<string, number>): number {
  try {
    return evaluateInVariables(expr, values)
  } catch {
    return NaN
  }
}

const CANNOT_MARK = 'PhysLab could not work out the answer to this part, so it cannot mark it.'

/**
 * Marks one part. A number part goes through `checkNumberPart` (units read and converted, then
 * `checkAnswer` with every diagnosis), an expression part through the three-stage check, a choice
 * part by the set of options ticked. A teacher's formula that cannot be worked out is a sentence
 * under the box, never a throw: thrown inside the panel's Check, it left every box unmarked and
 * said nothing at all.
 */
export function checkPlayedPart(p: PlayedPart, answer: string | number[], played: Played, settings: MeasureSettings): Check {
  const { values } = played.variant
  try {
    if (p.part.type === 'choice') return checkChoicePart(Array.isArray(answer) ? answer : [], p.choices ?? [])
    const text = Array.isArray(answer) ? '' : answer
    if (p.part.type === 'expression') return checkExpressionPart(text, p.part, values, unitsOf(played.question))
    if (p.part.type !== 'number') return checkFormat2Part(text, p.part, values, settings)
    // A trap that cannot be worked out is left out, so the student's answer is still marked; the
    // reason under a wrong answer is read with the numbers in, like everything else they see.
    const fill: Fill = { values, units: unitsOf(played.question), settings }
    const traps = (p.part.traps ?? [])
      .filter((t) => Number.isFinite(safeValue(t.value, values)))
      .map((t) => ({ ...t, why: spokenOf(textLines(t.why, fill).flat()) }))
    const c = checkNumberPart(text, { ...p.part, traps }, values, settings)
    // `checkAnswer`'s "close" reaches four times the tolerance — the vector problems' kindness to
    // a student who rounded early. A question's tolerance is its author's: 48.99 on 50 at 2 % is
    // outside it, and isCorrect counting "close" as right ticked it. The sentence stays.
    return c.verdict === 'close' ? { ...c, verdict: 'wrong' } : c
  } catch {
    return { verdict: 'wrong', message: CANNOT_MARK }
  }
}

// ---------------------------------------------------------------------------
// Numbers into formulas
// ---------------------------------------------------------------------------

/**
 * A formula in the question's variables with the drawn numbers written in, as text the graph can
 * compile. The graph reads its own names from the scene's sliders, so a question's `a` must be a
 * number by the time it gets there, or a slider called a would quietly change the picture. `keep`
 * are the drawing's own letters (x), never replaced even if the question has a variable so named.
 * A negative number goes in brackets: x^a with a = −2 must stay x^(−2).
 */
export function bindValues(expr: string, values: Record<string, number>, keep: readonly string[] = ['x']): string {
  const node = math.parse(preprocess(expr)).transform((n: MathNode) => {
    if (n.type === 'SymbolNode') {
      const name = (n as SymbolNode).name
      const v = values[name]
      if (!keep.includes(name) && v !== undefined && Number.isFinite(v)) {
        const c = new math.ConstantNode(Number(v.toPrecision(12)))
        return v < 0 ? new math.ParenthesisNode(c) : c
      }
    }
    return n
  })
  return node.toString()
}

function numberIn(expr: string, values: Record<string, number>, what: string): number {
  let v: number
  try {
    v = evaluateInVariables(expr, values)
  } catch {
    throw new Error(`PhysLab could not read ${what}: ${expr}.`)
  }
  if (!Number.isFinite(v)) throw new Error(`${what} works out to infinity or nothing: ${expr}.`)
  return v
}

// ---------------------------------------------------------------------------
// Pictures
// ---------------------------------------------------------------------------

export type PicturePlan =
  | { kind: 'curve'; expr: string; xMin?: number; xMax?: number }
  | { kind: 'piecewise'; pieces: { expr: string; from: number; to: number }[] }
  | { kind: 'between'; upper: string; lower: string; from: number; to: number; label?: string }
  | { kind: 'tangent'; expr: string; at: number }

/** A picture with this variant's numbers in: formulas bound, ends worked out. Throws a sentence. */
export function picturePlan(pic: PQPicture, played: Played, settings: MeasureSettings): PicturePlan {
  const { values } = played.variant
  const units = unitsOf(played.question)
  switch (pic.kind) {
    case 'curve':
      return {
        kind: 'curve',
        expr: bindValues(pic.expr, values),
        xMin: pic.xMin === undefined ? undefined : numberIn(pic.xMin, values, 'where the curve starts'),
        xMax: pic.xMax === undefined ? undefined : numberIn(pic.xMax, values, 'where the curve ends')
      }
    case 'piecewise':
      return {
        kind: 'piecewise',
        pieces: pic.pieces.map((p) => ({ expr: bindValues(p.expr, values), from: numberIn(p.from, values, 'where a piece starts'), to: numberIn(p.to, values, 'where a piece ends') }))
      }
    case 'between':
      return {
        kind: 'between',
        upper: bindValues(pic.upper, values),
        lower: bindValues(pic.lower, values),
        from: numberIn(pic.from, values, 'where the region starts'),
        to: numberIn(pic.to, values, 'where the region ends'),
        label: pic.label === undefined ? undefined : substitute(pic.label, values, units, settings)
      }
    case 'tangent':
      return { kind: 'tangent', expr: bindValues(pic.expr, values), at: numberIn(pic.at, values, 'the point the tangent touches') }
  }
}

// plainFormula lives beside the variables, whose problem sentences write formulas too; it is
// exported from here as well, where the picture note first used it.
export { plainFormula }

export interface PictureShown {
  /** One sentence on what was drawn, for the panel. */
  note: string
  /** The shaded region's area, or the tangent's slope, exactly as the drawing worked it out. */
  value?: number
}

/**
 * Everything the last "Show the picture" or "Draw the motion" put on the drawing, so the next
 * one replaces it. Each used to clear only its own kind: question 4's shaded region and its
 * "area = 20.83" stayed under question 5's motion plots.
 */
let questionDrawn: string[] = []

/**
 * Takes the previous question drawing away, runs this one and frames the camera on it. The old
 * one goes first so the new curves take the same names (xt, vt), not xt1 beside a deleted xt.
 */
function drawForQuestion<T>(draw: () => T): T {
  const s = scene()
  const alive = questionDrawn.filter((id) => s.objects[id])
  if (alive.length) s.removeObjects(alive)
  questionDrawn = []
  const before = new Set(scene().order)
  const out = draw()
  questionDrawn = scene().order.filter((id) => !before.has(id))
  frameGraphs(questionDrawn)
  return out
}

/**
 * Draws the picture in Graphing and says in one sentence what it shows. The shaded region's area
 * and the tangent's slope are written in the student's precision, the same numbers the drawing
 * carries on its labels.
 *
 * `hideValue` is for a question not yet answered: the area or the slope is usually exactly what
 * the question asks for, and "Show the picture" sits beside the answer box from the start. The
 * drawing then carries no "area =" or "slope =" label and the note says what was drawn without
 * the number.
 */
export function showPicture(plan: PicturePlan, settings: MeasureSettings, hideValue = false): PictureShown {
  const n = (v: number): string => fmtPrecise(v, settings)
  return drawForQuestion((): PictureShown => {
    switch (plan.kind) {
      case 'curve': {
        const shown = `y = ${plainFormula(plan.expr)}`
        visualizeGraph(shown, [plan.expr], 'explicit', { tMin: plan.xMin, tMax: plan.xMax })
        return { note: `Drawn: ${shown}.` }
      }
      case 'piecewise':
        visualizePiecewise(plan.pieces)
        return { note: `Drawn: one curve in ${n(plan.pieces.length)} pieces.` }
      case 'between': {
        const area = visualizeBetween(plan.upper, plan.lower, plan.from, plan.to, plan.label, hideValue)
        const where = `The shaded region between x = ${n(Math.min(plan.from, plan.to))} and x = ${n(Math.max(plan.from, plan.to))}`
        return hideValue ? { note: `${where} is the one whose area you are finding.` } : { note: `${where} has area ${n(area)}.`, value: area }
      }
      case 'tangent': {
        const { slope } = visualizeTangentAt(plan.expr, plan.at, hideValue)
        return hideValue ? { note: `Drawn: the tangent at x = ${n(plan.at)}.` } : { note: `The tangent at x = ${n(plan.at)} has slope ${n(slope)}.`, value: slope }
      }
    }
  })
}

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

/**
 * The Lab Data table each played question's readings went into, by the problem's id (question
 * and seed, so the same numbers). Every press used to append another identical table.
 */
const motionTables = new Map<string, string>()

export interface MotionShown {
  pieces: MotionPieces
  /** How many readings went into Lab Data, or 0 when the question asks for none. */
  rows: number
  note: string
}

const plotWords = (m: PQMotion): string => m.plots.map((p) => (p === 'x-t' ? 'position' : p === 'v-t' ? 'speed' : 'acceleration')).join(' and ')

/**
 * Draws the motion's chosen plots as piecewise curves (x across is time) and, when the question
 * asks for readings, adds a t, x, v table to Lab Data — `appendTable`, never `setTables`, so the
 * student's own tables stay. Throws a sentence when the motion cannot be worked out.
 */
export function showMotion(m: PQMotion, played: Played, settings: MeasureSettings): MotionShown {
  const { values } = played.variant
  const pieces = motionPieces(m, values)
  if (pieces.problems.length > 0) throw new Error(pieces.problems[0])
  if (pieces.x.length === 0) throw new Error('This motion has no stretch that lasts any time, so there is nothing to draw.')

  drawForQuestion(() => {
    for (const plot of m.plots) {
      const set = plot === 'x-t' ? pieces.x : plot === 'v-t' ? pieces.v : pieces.a
      visualizePiecewise(set, plot === 'x-t' ? 'xt' : plot === 'v-t' ? 'vt' : 'at')
    }
  })

  const note = `Drawn: ${plotWords(m)} against time for ${fmtPrecise(pieces.total, settings)} s (time runs along x).`
  let rows = 0
  if (m.sampleEvery !== undefined && m.sampleEvery.trim() !== '') {
    const every = numberIn(m.sampleEvery, values, 'how often the readings are taken')
    if (!(every > 0)) throw new Error('Readings must be taken some time apart; this question asks for every 0 s.')
    const lab = useLab.getState()
    const already = lab.tables.find((t) => t.id === motionTables.get(played.problem.id))
    if (already) {
      // Same question, same numbers, same readings: the table from the last press is still
      // there (perhaps with the student's own notes on it), so it is shown, not copied again.
      lab.setCurrent(already.id)
      return { pieces, rows: 0, note: `${note} Its readings are already in Lab Data, in "${already.title}".` }
    }
    const table = motionTable(pieces, every, played.problem.title)
    lab.appendTable(table)
    motionTables.set(played.problem.id, table.id)
    rows = table.rows.length
  }
  return { pieces, rows, note: rows > 0 ? `${note} ${fmtPrecise(rows, { decimals: 0, precisionMode: 'dp' })} readings are in a new Lab Data table.` : note }
}

// ---------------------------------------------------------------------------
// Sandbox
// ---------------------------------------------------------------------------

export interface PushPlan {
  body: string
  force: (t: number) => V3
  from: number
  until: number
}

export interface SandboxPlan {
  preset: string
  pushes: PushPlan[]
  record?: string
}

/**
 * The experiment with this variant's numbers in: each push's three force formulas compiled once
 * over t and the variables, its start and end worked out. A formula that has no value at some
 * moment pushes with nothing then, rather than handing the engine NaN, which Jolt spreads to
 * every body it touches.
 */
export function sandboxPlan(sb: PQSandbox, played: Played): SandboxPlan {
  const { values } = played.variant
  const pushes = sb.actuators.map((a): PushPlan => {
    let parts: EvalFunction[]
    try {
      parts = a.force.map((f) => math.compile(preprocess(f)) as EvalFunction)
    } catch {
      throw new Error(`PhysLab could not read the push on ${a.body}: (${a.force.join(', ')}).`)
    }
    const force = (t: number): V3 => {
      const scope = { ...values, t }
      const v = parts.map((c) => {
        try {
          const r = Number(inDegrees(() => c.evaluate({ ...scope })))
          return Number.isFinite(r) ? r : 0
        } catch {
          return 0
        }
      })
      return [v[0], v[1], v[2]]
    }
    // Checked once at the start so a formula naming something that does not exist is a sentence now, not a silent 0 N.
    try {
      parts.forEach((c) => inDegrees(() => c.evaluate({ ...values, t: 0 })))
    } catch {
      throw new Error(`PhysLab could not work out the push on ${a.body}: (${a.force.join(', ')}).`)
    }
    return {
      body: a.body,
      force,
      from: a.from === undefined ? 0 : numberIn(a.from, values, `when the push on ${a.body} starts`),
      until: a.until === undefined ? Infinity : numberIn(a.until, values, `when the push on ${a.body} stops`)
    }
  })
  return { preset: sb.preset, pushes, record: sb.record }
}

/**
 * What the Sandbox panel says about a question's push: its size when it is steady, and when it
 * acts. "Push from the question: 25 N on Crate, 0–2 s" — without it the crate sped up from 6 to
 * 8 m/s with nothing on screen to say why.
 */
export function describePush(p: PushPlan): string {
  const n = (v: number): string => fmtPrecise(v, { decimals: 2, precisionMode: 'dp' })
  const end = Number.isFinite(p.until) ? p.until : p.from + 10
  const samples = Array.from({ length: 9 }, (_, i) => p.force(p.from + ((end - p.from) * i) / 8))
  const first = samples[0]
  const size = Math.hypot(...first)
  const steady = samples.every((f) => f.every((c, k) => Math.abs(c - first[k]) <= 1e-9 * Math.max(1, size)))
  const what = steady ? `${n(size)} N` : 'a force that changes with time'
  const when = Number.isFinite(p.until) ? `${n(p.from)}–${n(p.until)} s` : `from ${n(p.from)} s on`
  return `Push from the question: ${what} on ${p.body}, ${when}`
}

/**
 * Loads the experiment by its id and puts the pushes on the bodies it names. `loadPreset` builds
 * the bodies with fresh ids every time, so the names are resolved against the bodies it has just
 * made, and only then are the pushes handed over. The recorded body (or the first pushed one) is
 * selected, which is what the Sandbox's recording chart and its Send to Lab Data follow.
 *
 * Every name is checked against what the preset builds before the student's own scene is
 * replaced: a misspelt body used to leave the Sandbox swapped for the experiment with no push on
 * it. The run is paused first, as the Sandbox's own preset list does, or a running simulation
 * started the push before the student pressed the Play the note asks for.
 */
export function showSandbox(plan: SandboxPlan): string {
  const preset = presetById(plan.preset)
  if (!preset) throw new Error(`This question's experiment, '${plan.preset}', is not in this PhysLab.`)
  const built = new Set(preset.build().bodies.map((b) => b.name))
  for (const p of plan.pushes) if (!built.has(p.body)) throw new Error(`The experiment has no body called ${p.body}, so PhysLab cannot push it.`)
  if (plan.record !== undefined && !built.has(plan.record)) throw new Error(`The experiment has no body called ${plan.record}, so PhysLab cannot record it.`)

  scene().setPlaying(false)
  if (!useSandbox.getState().loadPreset(plan.preset)) throw new Error(`This question's experiment, '${plan.preset}', is not in this PhysLab.`)
  const bodies = useSandbox.getState().bodies
  const idOf = (name: string): string => {
    const b = bodies.find((x) => x.name === name)
    if (!b) throw new Error(`The experiment has no body called ${name}, so PhysLab cannot push it.`)
    return b.id
  }
  const actuators: Actuator[] = plan.pushes.map((p) => ({ bodyId: idOf(p.body), force: p.force, from: p.from, until: p.until, label: describePush(p) }))
  useSandbox.getState().setActuators(actuators)
  const watched = plan.record ?? plan.pushes[0]?.body
  if (watched !== undefined) useSandbox.getState().select(idOf(watched))
  const names = [...new Set(plan.pushes.map((p) => p.body))]
  const loaded = names.length > 0 ? `Loaded the experiment with a push on ${names.join(' and ')}.` : 'Loaded the experiment.'
  // Nothing reaches Lab Data by itself; the note says which button sends the readings, or a
  // student waiting for a table to appear waited for nothing.
  return plan.record === undefined
    ? `${loaded} Press Play and watch the readings.`
    : `${loaded} Press Play and watch ${plan.record} on the Recording chart; when it has run, Send the readings to Lab Data here puts them in a table.`
}

/** The Lab Data table each run's readings went into, so a second press shows it instead of copying it. */
const sandboxTables = new Map<string, string>()

/**
 * The question's recorded body's readings from the Sandbox run, as a new Lab Data table — the
 * `record` → `tableFrom` → `appendTable` of the design, which nothing did: the question named a
 * body to record and the readings stayed in the Sandbox. `appendTable`, never `setTables`, so
 * the student's own tables stay. Throws a sentence when there is nothing to send yet.
 */
export function sendSandboxReadings(sb: PQSandbox, played: Played): { rows: number; note: string } {
  const name = sb.record
  if (name === undefined) throw new Error('This question does not ask for readings from the experiment.')
  const s = useSandbox.getState()
  const body = s.bodies.find((b) => b.name === name)
  if (!body) throw new Error(`The Sandbox has no body called ${name} just now. Press Open the experiment first, then Play.`)
  const samples = s.recording[body.id] ?? []
  if (samples.length < 2) throw new Error(`There are no readings of ${name} yet. Press Play in the Sandbox, let it run, then send them.`)
  // One run, one table: the same body, run and readings pressed twice are the same table.
  const key = `${played.problem.id}|${body.id}|${s.runNonce}|${samples.length}|${samples[samples.length - 1].t}`
  const lab = useLab.getState()
  const already = lab.tables.find((t) => t.id === sandboxTables.get(key))
  if (already) {
    lab.setCurrent(already.id)
    return { rows: 0, note: `These readings are already in Lab Data, in "${already.title}".` }
  }
  const table = { ...tableFrom(name, samples), title: `${name} — ${played.problem.title}` }
  lab.appendTable(table)
  sandboxTables.set(key, table.id)
  return { rows: table.rows.length, note: `${fmtPrecise(table.rows.length, { decimals: 0, precisionMode: 'dp' })} readings of ${name} are in a new Lab Data table, "${table.title}".` }
}

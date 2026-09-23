// Playing one question: a PQJSON question and a seed become the Problem shape the Practice panel
// already plays (its answer boxes, its hints, its "Show the full solution"), plus what a PQ
// question has on top — expression and choice parts, worked steps that fade, and the "Show it"
// bindings: a picture drawn in Graphing, a motion drawn as x–t and v–t curves with its readings in
// Lab Data, an experiment loaded in the Sandbox with a push on a named body.
//
// The pure half (playQuestion, the plans, the marking) is tested headless; the three `show*`
// functions are the only ones that reach a store, and they go through the same entry points the
// command bar and the Sandbox's own preset list use.

import type { EvalFunction, FunctionNode, MathNode, SymbolNode } from 'mathjs'
import { scene } from '../core/store'
import { visualizeBetween, visualizeGraph, visualizePiecewise, visualizeTangentAt } from '../core/visualize'
import { useLab } from '../lab/labStore'
import type { Check } from '../math/checkAnswer'
import { inDegrees, math, preprocess } from '../math/expr'
import { fmtPrecise, type MeasureSettings } from '../math/format'
import type { AnswerField, Problem } from '../math/problems'
import { texToPlain, type Working } from '../math/pure/work'
import type { V3 } from '../math/vec'
import { useSandbox } from '../sim/store'
import type { Actuator } from '../sim/types'
import { checkChoicePart, generateChoices, type Choice } from './distractors'
import { motionPieces, motionTable, type MotionPieces } from './motion'
import { checkExpressionPart, checkNumberPart, evaluateInVariables, toAbsoluteTol } from './parts'
import type { FadingLevel, PQMotion, PQPart, PQPicture, PQQuestion, PQSandbox, UnitId } from './pqjson'
import { stepsToWorking, substituteTex } from './steps'
import { formatQuantity, UNITS } from './units'
import { drawVariables, substitute, type Variant } from './variables'

/** The Problem shape without the vector topic and level a generated vector problem carries. */
export type QuestionProblem = Omit<Problem, 'topic' | 'level'>

/**
 * A piece of what the student reads: plain words, or maths set by KaTeX — inline, or a display
 * line of its own. A teacher's Numbas file keeps its inline maths as `\(…\)`; handed to the panel
 * as plain text, the student read the backslashes and the LaTeX.
 */
export type Segment = { text: string } | { tex: string; display: boolean }

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
}

const unitsOf = (q: PQQuestion): Record<string, UnitId | undefined> => Object.fromEntries(q.variables.map((v) => [v.name, v.unit]))

type Fill = { values: Record<string, number>; units: Record<string, UnitId | undefined>; settings: MeasureSettings }

const INLINE = /\\\(([\s\S]*?)\\\)/

/**
 * One line of an author's text → segments with the numbers in. A line starting `$$` is display
 * maths; otherwise every `\(…\)` span is inline maths. Chips in words get the plain number and
 * unit, chips in maths the LaTeX one (`substituteTex`), exactly as the steps do.
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

  const parts: PlayedPart[] = q.parts.map((part, i) => {
    const key = `p${i}`
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
      if (!Number.isFinite(value)) problems.push(`PhysLab could not work out the answer to "${prompt}", so it cannot mark it.`)
      const traps = (part.traps ?? []).map((t) => ({ value: safeValue(t.value, values), why: plain(t.why) }))
      if (traps.some((t) => !Number.isFinite(t.value))) {
        problems.push(`PhysLab could not work out one of the mistakes "${prompt}" watches for, so it will not name that one.`)
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
        problems.push(`PhysLab could not work out the options for "${prompt}".`)
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
  return { question: q, variant, problem, parts, statement, working, full, level: lv, problems }
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
 * A letter written straight before a bracket is a product: t(u − 4.9t) is t × (u − 4.9t). mathjs
 * reads it as a call to a function called t, every sample point failed, and a student who
 * factored out t was told the answer could not be read. Only the part's own letters and the
 * question's variables are read this way — sin(x) stays sine.
 */
export function lettersBeforeBrackets(text: string, letters: readonly string[]): string {
  let node: MathNode
  try {
    node = math.parse(preprocess(text))
  } catch {
    return text
  }
  const products = new Set(letters.filter((n) => typeof (math as unknown as Record<string, unknown>)[n] !== 'function'))
  let changed = false
  const rewrite = (n: MathNode): MathNode => {
    if (n.type !== 'FunctionNode') return n
    const call = n as FunctionNode
    if (call.fn.type !== 'SymbolNode' || !products.has((call.fn as SymbolNode).name) || call.args.length !== 1) return n
    changed = true
    return new math.OperatorNode('*', 'multiply', [call.fn as SymbolNode, new math.ParenthesisNode(call.args[0].transform(rewrite))])
  }
  const out = node.transform(rewrite)
  return changed ? out.toString() : text
}

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
    if (p.part.type === 'expression') {
      return checkExpressionPart(lettersBeforeBrackets(text, [...p.part.symbols, ...Object.keys(values)]), p.part, values)
    }
    // A trap that cannot be worked out is left out, so the student's answer is still marked; the
    // reason under a wrong answer is read with the numbers in, like everything else they see.
    const fill: Fill = { values, units: unitsOf(played.question), settings }
    const traps = (p.part.traps ?? [])
      .filter((t) => Number.isFinite(safeValue(t.value, values)))
      .map((t) => ({ ...t, why: spokenOf(textLines(t.why, fill).flat()) }))
    return checkNumberPart(text, { ...p.part, traps }, values, settings)
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

export interface PictureShown {
  /** One sentence on what was drawn, for the panel. */
  note: string
  /** The shaded region's area, or the tangent's slope, exactly as the drawing worked it out. */
  value?: number
}

/**
 * Draws the picture in Graphing and says in one sentence what it shows. The shaded region's area
 * and the tangent's slope are written in the student's precision, the same numbers the drawing
 * carries on its labels.
 */
export function showPicture(plan: PicturePlan, settings: MeasureSettings): PictureShown {
  const n = (v: number): string => fmtPrecise(v, settings)
  switch (plan.kind) {
    case 'curve':
      visualizeGraph(`y = ${plan.expr}`, [plan.expr], 'explicit', { tMin: plan.xMin, tMax: plan.xMax })
      return { note: `Drawn: y = ${plan.expr}.` }
    case 'piecewise':
      visualizePiecewise(plan.pieces)
      return { note: `Drawn: one curve in ${n(plan.pieces.length)} pieces.` }
    case 'between': {
      const area = visualizeBetween(plan.upper, plan.lower, plan.from, plan.to, plan.label)
      return { note: `The shaded region between x = ${n(Math.min(plan.from, plan.to))} and x = ${n(Math.max(plan.from, plan.to))} has area ${n(area)}.`, value: area }
    }
    case 'tangent': {
      const { slope } = visualizeTangentAt(plan.expr, plan.at)
      return { note: `The tangent at x = ${n(plan.at)} has slope ${n(slope)}.`, value: slope }
    }
  }
}

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

/** What the last "Show it" of a motion drew, so the next one replaces it instead of stacking. */
let motionDrawn: string[] = []

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

  const s = scene()
  const alive = motionDrawn.filter((id) => s.objects[id])
  if (alive.length) s.removeObjects(alive)
  const before = new Set(scene().order)
  for (const plot of m.plots) {
    const set = plot === 'x-t' ? pieces.x : plot === 'v-t' ? pieces.v : pieces.a
    visualizePiecewise(set, plot === 'x-t' ? 'xt' : plot === 'v-t' ? 'vt' : 'at')
  }
  motionDrawn = scene().order.filter((id) => !before.has(id))

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
 * Loads the experiment by its id and puts the pushes on the bodies it names. `loadPreset` builds
 * the bodies with fresh ids every time, so the names are resolved against the bodies it has just
 * made, and only then are the pushes handed over. The recorded body (or the first pushed one) is
 * selected, which is what the Sandbox's recording chart and its Send to Lab Data follow.
 */
export function showSandbox(plan: SandboxPlan): string {
  const sb = useSandbox.getState()
  if (!sb.loadPreset(plan.preset)) throw new Error(`This question's experiment, '${plan.preset}', is not in this PhysLab.`)
  const bodies = useSandbox.getState().bodies
  const idOf = (name: string): string => {
    const b = bodies.find((x) => x.name === name)
    if (!b) throw new Error(`The experiment has no body called ${name}, so PhysLab cannot push it.`)
    return b.id
  }
  const actuators: Actuator[] = plan.pushes.map((p) => ({ bodyId: idOf(p.body), force: p.force, from: p.from, until: p.until }))
  useSandbox.getState().setActuators(actuators)
  const watched = plan.record ?? plan.pushes[0]?.body
  if (watched !== undefined) useSandbox.getState().select(idOf(watched))
  const names = [...new Set(plan.pushes.map((p) => p.body))]
  const loaded = names.length > 0 ? `Loaded the experiment with a push on ${names.join(' and ')}.` : 'Loaded the experiment.'
  // The readings reach Lab Data through the Sandbox's own Send to Lab Data; nothing said so, and
  // a student waiting for a table to appear by itself waited for nothing.
  return plan.record === undefined
    ? `${loaded} Press Play and watch the readings.`
    : `${loaded} Press Play and watch ${plan.record} on the Recording chart; when it has run, Send to Lab Data under the chart puts the readings in a table.`
}

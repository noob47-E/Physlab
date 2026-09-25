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
import { frameGraphs, NORMAL_STRETCH, visualizeBetween, visualizeCurves, visualizeDots, visualizeGraph, visualizeNormal, visualizeNumberLine, visualizePiecewise, visualizeSolution, visualizeTangentAt } from '../core/visualize'
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
import { motionPieces, motionTable, type MotionPiece, type MotionPieces } from './motion'
import { checkFormat2Part } from './answerKinds'
import { answerValue, markWithECF, partShown, type ECFCheck } from './ecf'
import { checkLegoPart, legoAnswer, legoShapesNow } from './legoPart'
import { checkFunctionPart } from './odeCheck'
import { checkExpressionPart, checkNumberPart, evaluateInVariables, toAbsoluteTol } from './parts'
import type { FadingLevel, PQMotion, PQPart, PQPicture, PQQuestion, PQSandbox, UnitId } from './pqjson'
import { spokenOf, stepsToWorking, textLines, type Fill, type Segment } from './steps'
import { formatQuantity, revealSettings, unitOfComponents, UNITS } from './units'
import { hasVisual, visualOf, type VisualPlan } from './autoVisual'
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
  /**
   * The part's place in the author's list. A part hidden by its `showIf` is left out of `parts`,
   * so the shown parts' positions no longer match the author's: error carried forward, the
   * worked answers and the part letters all go by this instead.
   */
  index: number
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
  /** A matrix part's size: one box per entry, never a bracketed list to type. */
  matrix?: { rows: number; cols: number }
  /** A proof part's model proof, line by line with its maths set, shown once the student asks. */
  model?: Segment[][]
  /** A proof part's self-check list, one line per point to tick off against the student's own proof. */
  selfCheck?: Segment[][]
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

  // A part whose `showIf` fails for this variant is neither shown nor counted: it is left out here,
  // so the boxes, the marking and "all right" never see it.
  const shown = q.parts.flatMap((part, i) => (partShown(part, values) ? [{ part, i }] : []))
  const parts: PlayedPart[] = shown.map(({ part, i }): PlayedPart => {
    const key = `p${i}`
    const own: string[] = (partProblems[key] = [])
    const flag = (sentence: string) => {
      problems.push(sentence)
      own.push(sentence)
    }
    const promptLines = textLines(part.prompt, fill)
    const prompt = spokenOf(promptLines.flat())
    const answerTex = working.answers[i]?.tex ?? '\\text{?}'
    const base = { key, index: i, part, prompt, promptLines, answerTex }
    if (part.type === 'matrix') {
      const rows = part.answer.length
      const cols = part.answer[0]?.length ?? 0
      if (rows === 0 || cols === 0) flag(`"${prompt}" has no entries to fill in, so it cannot be marked.`)
      return { ...base, matrix: { rows, cols } }
    }
    if (part.type === 'proof') {
      return { ...base, model: textLines(part.model, fill), selfCheck: part.selfCheck.map((line) => textLines(line, fill).flat()) }
    }
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
      return { ...base, field, answerText: Number.isFinite(value) ? formatQuantity(value, part.unit, revealSettings(value, field.tol, settings)) : '?' }
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
export function checkPlayedPart(p: PlayedPart, answer: PartAnswer, played: Played, settings: MeasureSettings): Check {
  const { values } = played.variant
  try {
    if (p.part.type === 'choice') return checkChoicePart(isPicks(answer) ? answer : [], p.choices ?? [])
    // A matrix is typed box by box; nothing typed yet is a grid of empty boxes, never "type each
    // entry in its own box" for a student who has not started.
    if (p.part.type === 'matrix') return checkFormat2Part(isGrid(answer) ? answer : (blankAnswer(p) as string[][]), p.part, values, settings)
    // A Lego part's answer is what its pieces make on the Geometry drawing, one row of corners per
    // shape (legoAnswer); answerKinds had no way to see the drawing and called it unmarkable. While
    // the pieces are on the drawing they are read now, whoever marks: the answer handed in is the
    // one Check my shape stored, and pieces moved since would have been marked by their old tick.
    // Taken off the drawing (another part laid out), the last checked answer is what there is;
    // never laid out and never checked, the part is empty like an untouched box — "The pieces are
    // not in Geometry" is for a student who pressed Check my shape.
    if (p.part.type === 'lego') {
      const now = legoShapesNow(played, p)
      if (now) return checkLegoPart(legoAnswer(now), p.part, values)
      // No shapes at all is still a checked answer (isGrid wants a row): a list, never text.
      return Array.isArray(answer) ? checkLegoPart(isGrid(answer) ? answer : [], p.part, values) : { verdict: 'empty' }
    }
    const text = typeof answer === 'string' ? answer : ''
    if (p.part.type === 'expression') return checkExpressionPart(text, p.part, values, unitsOf(played.question))
    // A function answer is put back into its own equation; answerKinds has no way to mark one.
    if (p.part.type === 'function') return checkFunctionPart(text, p.part, values, unitsOf(played.question), settings)
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

/** What a student can give a part: typed text, the options ticked, or a matrix's entries row by row. */
export type PartAnswer = string | number[] | string[][]

const isGrid = (a: PartAnswer): a is string[][] => Array.isArray(a) && a.length > 0 && a.every((row) => Array.isArray(row))
const isPicks = (a: PartAnswer): a is number[] => Array.isArray(a) && a.every((x) => typeof x === 'number')

/** A part's answer before anything is typed or ticked: a matrix's empty boxes, a choice's no options, a blank box. */
export function blankAnswer(p: PlayedPart): PartAnswer {
  if (p.matrix) return Array.from({ length: p.matrix.rows }, () => Array.from({ length: p.matrix!.cols }, () => ''))
  return p.part.type === 'choice' ? [] : ''
}

/**
 * The parts that are marked and count towards "all right". A proof part is never marked on this
 * computer (it would need a proof language, which rule 2 rules out): it shows its model proof and
 * self-check list instead, and a question with one must still be finishable. A Lego part is
 * counted: its answer is what its pieces make on the Geometry drawing, which checkPlayedPart
 * reads at every Check, so a wrong shape keeps the question from being all right.
 */
export const countedParts = (played: Played): PlayedPart[] => played.parts.filter((p) => p.part.type !== 'proof')

/** One set of values in place of the variant's own, for marking with a student's earlier answers. */
const withValues = (played: Played, values: Record<string, number>): Played => ({ ...played, variant: { ...played.variant, values } })

/**
 * Marks every counted part of a played question as Practice's Check does: each part with its plain
 * marking, and — where the part carries error carried forward — again with the student's own
 * earlier answers, in the author's part order. A part (b) that used a wrong part (a) correctly is
 * right with the note "Marked using your answer to part (a): −4 m/s²"; the note and the marks it
 * earns travel on the check.
 */
export function markPlayed(played: Played, typed: Readonly<Record<string, PartAnswer>>, settings: MeasureSettings): Record<string, ECFCheck> {
  const earlier = new Map<number, number>()
  const out: Record<string, ECFCheck> = {}
  for (const p of countedParts(played)) {
    const answer = typed[p.key] ?? blankAnswer(p)
    const text = typeof answer === 'string' ? answer : ''
    // markWithECF reads the answer itself only for a function part (always typed text); every
    // other kind is marked through this closure, which holds the real answer — ticks or a grid.
    out[p.key] = markWithECF(p, text, played, earlier, settings, (values) => checkPlayedPart(p, answer, withValues(played, values), settings))
    const x = typeof answer === 'string' ? answerValue(p.part, answer) : null
    if (x !== null) earlier.set(p.index, x)
  }
  return out
}

// ---------------------------------------------------------------------------
// The depth ladder: a rung is a label and a filter, never a lock
// ---------------------------------------------------------------------------

/** The five rungs in the words of Idea 1's ladder (§7), first look to research. */
export const RUNG_NAMES: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'First look',
  2: 'School',
  3: 'Pre-university',
  4: 'University',
  5: 'Research'
}

/** "Depth 4 · University" — the label a question carries in the header and on its filter chip. */
export const rungLabel = (rung: 1 | 2 | 3 | 4 | 5): string => `Depth ${rung} · ${RUNG_NAMES[rung]}`

/** The rungs a set's questions are tagged with, lowest first: the chips worth offering. */
export function rungsIn(questions: readonly PQQuestion[]): (1 | 2 | 3 | 4 | 5)[] {
  return [...new Set(questions.flatMap((q) => (q.rung === undefined ? [] : [q.rung])))].sort((a, b) => a - b)
}

/**
 * The questions of a set at one depth, in the set's order; null is every question. A question with
 * no rung belongs to no depth: it is in "every depth" only, never guessed into one.
 */
export function questionsAtDepth(questions: readonly PQQuestion[], depth: number | null): PQQuestion[] {
  return depth === null ? [...questions] : questions.filter((q) => q.rung === depth)
}

/**
 * The question a "Go deeper" link leads to, looked up among the set's own questions by id, or the
 * sentence saying why there is none. The link is the author's; a set opened without the deeper
 * question (a teacher who shared only part of a set) must say so rather than show a dead button.
 */
export function resolveDeeper(q: PQQuestion, set: readonly PQQuestion[]): { question: PQQuestion } | { missing: string } | null {
  if (q.deeper === undefined) return null
  const id = q.deeper.trim()
  const found = set.find((other) => other.id === id && other !== q)
  if (found) return { question: found }
  return { missing: `This question leads on to a deeper one ("${id}"), but it is not in this set.` }
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
  | { kind: 'normal'; mean: number; sd: number; from?: number; to?: number }
  | { kind: 'vectors'; items: { name: string; v: V3; tail?: V3; role: 'input' | 'result'; unit?: string }[] }
  | { kind: 'dots'; count: number; perRow: number }
  | { kind: 'curves'; items: { expr: string; label: string; from?: number; to?: number }[] }
  | { kind: 'numberline'; items: { label: string; value: number }[] }

/** More dots than anyone counts by eye; a count past this is refused rather than drawn as a smear. */
export const MAX_DOTS = 400

/** The unit label an arrow's components are in (N for ["0", "-m2*g"]), or none when it cannot be told. */
function arrowUnit(components: string[], units: Record<string, UnitId | undefined>): string | undefined {
  const u = unitOfComponents(components, units)
  return u === null || UNITS[u].label === '' ? undefined : UNITS[u].label
}

/** Two or three component formulas → a vector in the plane or in space. */
function vectorIn(parts: string[], values: Record<string, number>, what: string): V3 {
  const c = parts.map((p) => numberIn(p, values, what))
  return [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0]
}

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
    case 'normal': {
      const sd = numberIn(pic.sd, values, 'the standard deviation')
      if (!(sd > 0)) throw new Error('A normal curve needs a standard deviation above 0.')
      const from = pic.from === undefined ? undefined : numberIn(pic.from, values, 'where the shading starts')
      const to = pic.to === undefined ? undefined : numberIn(pic.to, values, 'where the shading ends')
      if (from !== undefined && to !== undefined && !(from < to)) {
        throw new Error(`The shading must start below where it ends; this question has it from ${fmtPrecise(from, settings)} to ${fmtPrecise(to, settings)}.`)
      }
      return { kind: 'normal', mean: numberIn(pic.mean, values, 'the mean'), sd, from, to }
    }
    case 'vectors':
      if (pic.items.length === 0) throw new Error('This picture has no arrows to draw.')
      return {
        kind: 'vectors',
        items: pic.items.map((it) => ({
          name: it.name,
          v: vectorIn(it.v, values, `the arrow ${it.name}`),
          tail: it.tail === undefined ? undefined : vectorIn(it.tail, values, `where the arrow ${it.name} starts`),
          role: it.role ?? 'input',
          unit: arrowUnit(it.v, units)
        }))
      }
    case 'dots': {
      const count = numberIn(pic.count, values, 'how many dots to draw')
      if (!Number.isInteger(count) || count < 0) throw new Error(`Dots are counted in whole numbers; this picture asks for ${fmtPrecise(count, settings)}.`)
      if (count > MAX_DOTS) throw new Error(`${fmtPrecise(count, settings)} dots are too many to count by eye; PhysLab draws at most ${fmtPrecise(MAX_DOTS, settings)}.`)
      const perRow = pic.perRow !== undefined && Number.isInteger(pic.perRow) && pic.perRow > 0 ? pic.perRow : 10
      return { kind: 'dots', count, perRow }
    }
    case 'curves':
      if (pic.items.length === 0) throw new Error('This picture has no curves to draw.')
      return {
        kind: 'curves',
        items: pic.items.map((it) => ({
          expr: bindValues(it.expr, values),
          label: substitute(it.label, values, units, settings),
          from: it.from === undefined ? undefined : numberIn(it.from, values, 'where a curve starts'),
          to: it.to === undefined ? undefined : numberIn(it.to, values, 'where a curve ends')
        }))
      }
    case 'numberline':
      if (pic.items.length === 0) throw new Error('This question gives no numbers PhysLab could put on a number line.')
      return {
        kind: 'numberline',
        items: pic.items.map((it) => {
          const value = numberIn(it.value, values, it.label === '' ? 'a mark' : `the mark ${it.label}`)
          // A bare number is labelled by its value, through format.ts like every number shown.
          return { label: it.label === '' ? fmtPrecise(value, settings) : substitute(it.label, values, units, settings), value }
        })
      }
  }
}

// plainFormula lives beside the variables, whose problem sentences write formulas too; it is
// exported from here as well, where the picture note first used it.
export { plainFormula }
export { hasVisual, INFERRED_NOTE, type VisualPlan } from './autoVisual'

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
  // Every question picture is shown in Graphing (visualMode), but the Builder stamps what it
  // makes with the space the student is in: arrows asked for from Problem Sets, fresh from the
  // launch mode, were stamped 'vectors', and Graphing showed an empty viewport under "Drawn: the
  // arrows r and v".
  for (const id of questionDrawn) {
    if (scene().objects[id]?.space !== 'graphing') scene().updateObject(id, (d) => void (d.space = 'graphing'), false)
  }
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
      case 'normal': {
        const { area } = visualizeNormal(plan.mean, plan.sd, plan.from, plan.to, hideValue)
        const region =
          plan.from !== undefined && plan.to !== undefined
            ? `between ${n(plan.from)} and ${n(plan.to)}`
            : plan.to !== undefined
              ? `below ${n(plan.to)}`
              : plan.from !== undefined
                ? `above ${n(plan.from)}`
                : 'under the whole curve'
        const what = `the normal curve with mean ${n(plan.mean)} and standard deviation ${n(plan.sd)} on the z scale, z = (x − mean) ÷ sd, drawn ${n(NORMAL_STRETCH)} times taller than its density so its shape shows, and shaded ${region}`
        return hideValue
          ? { note: `Drawn: ${what}. The shaded part of the whole bell is the probability you are finding.` }
          : { note: `Drawn: ${what}. The shaded part of the whole bell is the probability, ${n(area)}.`, value: area }
      }
      case 'vectors': {
        const before = new Set(scene().order)
        visualizeSolution({
          title: '',
          steps: [],
          answers: [],
          visual: { vectors: plan.items.map((it) => ({ name: it.name, v: it.v, tail: it.tail, role: it.role })), mode: 'common-tail' }
        })
        // One arrow per item, in the items' order (common tail). The scene keeps a name it can
        // hold — m₂g became mg1, u₂ became u1 — so each arrow is labelled with its author's name,
        // which the tip chip and the component labels read, and measured in its own unit (N, not
        // grid squares) when its formula says what that is.
        const arrows = scene().order.filter((id) => !before.has(id) && scene().objects[id]?.type === 'vector')
        plan.items.forEach((it, i) => {
          const id = arrows[i]
          if (id === undefined) return
          scene().updateObject(
            id,
            (d) => {
              if (d.type !== 'vector') return
              if (d.name !== it.name) d.label = it.name
              if (it.unit) d.unit = it.unit
            },
            false
          )
        })
        const names = plan.items.map((it) => it.name)
        const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]
        return { note: names.length > 1 ? `Drawn: the arrows ${list}.` : `Drawn: the arrow ${list}.` }
      }
      case 'dots':
        visualizeDots(plan.count, plan.perRow)
        return { note: plan.count === 0 ? 'Drawn: no dots at all.' : `Drawn: dots in rows of ${n(plan.perRow)}.` }
      case 'curves':
        visualizeCurves(plan.items)
        return { note: `Drawn: ${plan.items.map((it) => it.label).join(', ')}.` }
      case 'numberline':
        visualizeNumberLine(plan.items)
        return { note: `Drawn on one number line: ${plan.items.map((it) => it.label).join(', ')}.` }
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

/**
 * The power of ten a motion plot's values are divided by so the plot is about as tall as it is
 * long. The drawing has one scale for both axes, and a car braking from 20 m/s over 70 m in 7 s
 * was framed on the 70: the 7 s wide curves were a sliver against the y-axis. Time is never
 * scaled — it is what the student reads across — and a small plot is left as it is, never blown
 * up into "tenths". 1 when the plot already fits.
 */
export function plotScale(pieces: readonly MotionPiece[], total: number): number {
  let peak = 0
  for (const p of pieces) {
    const f = math.compile(p.expr)
    for (let i = 0; i <= 40; i++) {
      const x = p.from + ((p.to - p.from) * i) / 40
      const y = Math.abs(Number(f.evaluate({ x })))
      if (Number.isFinite(y)) peak = Math.max(peak, y)
    }
  }
  if (!(total > 0) || !(peak > 0)) return 1
  return 10 ** Math.max(0, Math.round(Math.log10(peak / total)))
}

const SCALE_WORDS: Record<number, string> = { 1: '', 10: 'tens of ', 100: 'hundreds of ', 1000: 'thousands of ', 10000: 'tens of thousands of ' }

/** "position in tens of metres": what a plot shows, and in what, when its values are scaled. */
function plotWord(plot: PQMotion['plots'][number], scale: number): string {
  const [what, unit] = plot === 'x-t' ? ['position', 'metres'] : plot === 'v-t' ? ['speed', 'metres per second'] : ['acceleration', 'metres per second squared']
  if (scale === 1) return what
  const words = SCALE_WORDS[scale] ?? `${fmtPrecise(scale, { decimals: 0, precisionMode: 'dp' })} times `
  return `${what} in ${words}${unit}`
}

/**
 * Draws the motion's chosen plots as piecewise curves (x across is time) and, when the question
 * asks for readings, adds a t, x, v table to Lab Data — `appendTable`, never `setTables`, so the
 * student's own tables stay. Throws a sentence when the motion cannot be worked out.
 */
export function showMotion(m: PQMotion, played: Played, settings: MeasureSettings, earned = true): MotionShown {
  const { values } = played.variant
  const pieces = motionPieces(m, values)
  if (pieces.problems.length > 0) throw new Error(pieces.problems[0])
  if (pieces.x.length === 0) throw new Error('This motion has no stretch that lasts any time, so there is nothing to draw.')

  const words: string[] = []
  drawForQuestion(() => {
    for (const plot of m.plots) {
      const set = plot === 'x-t' ? pieces.x : plot === 'v-t' ? pieces.v : pieces.a
      const scale = plotScale(set, pieces.total)
      words.push(plotWord(plot, scale))
      const drawn = scale === 1 ? set : set.map((p) => ({ ...p, expr: `(${p.expr}) / ${scale}` }))
      visualizePiecewise(drawn, plot === 'x-t' ? 'xt' : plot === 'v-t' ? 'vt' : 'at')
    }
  })

  // The time is left out until the answer is earned: "for 40 s" under "How long?" was the answer.
  const what = words.join(' and ')
  const note = earned ? `Drawn: ${what} against time for ${fmtPrecise(pieces.total, settings)} s (time runs along x).` : `Drawn: ${what} against time (time runs along x).`
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
// One visual for any question (Fix 21)
// ---------------------------------------------------------------------------

const visualPlans = new WeakMap<Played, VisualPlan>()

/**
 * What this played question shows: the author's picture, motion or experiment; else a picture
 * inferred from its numbers; else its given quantities on a number line. Never nothing.
 */
export function visualPlanFor(played: Played): VisualPlan {
  // Practice asks on every render (every keystroke in an answer box), and working out what an
  // author's picture may show early samples each curve hundreds of times; a Played is fixed for
  // its variant, so its plan is worked out once.
  const known = visualPlans.get(played)
  if (known) return known
  const plan = visualOf(played.question, played.variant)
  visualPlans.set(played, plan)
  return plan
}

/**
 * Whether the visual can be drawn now, or only after the answer ("(after you answer)"): a
 * picture every part of which gives the answer away waits until the question is answered right
 * or its solution shown. That holds for an author's own picture and motion as for an inferred
 * one — the steady-speed journey's time axis ran to the 40 s it asked for, the ball's x–t curve
 * peaked at the height asked for — and the Sandbox experiment, which the student runs, is always
 * open. 'none' is a question with nothing to draw — no numbers for its number line — so no button
 * is offered; reported 'ready', its one "Show the picture" only drew an error.
 */
export function visualState(plan: VisualPlan, earned: boolean): 'ready' | 'after-answer' | 'none' {
  if (!hasVisual(plan)) return 'none'
  if (earned) return 'ready'
  // The experiment counts only when it is what the first button shows: beside a held-back
  // picture or motion it has its own "Open the experiment", and the first button stays waiting.
  if (plan.source === 'authored') return plan.early.picture || plan.early.motion || (plan.sandbox && !plan.picture && !plan.motion) ? 'ready' : 'after-answer'
  return plan.auto.early ? 'ready' : 'after-answer'
}

/** Where the visual is drawn: the Sandbox for a question whose only visual is its experiment, else Graphing. */
export function visualMode(plan: VisualPlan): 'graphing' | 'sandbox' {
  return plan.source === 'authored' && !plan.picture && !plan.motion && plan.sandbox ? 'sandbox' : 'graphing'
}

export const HELD_BACK = 'This picture shows the answer, so it appears once you have answered right or asked for the solution.'

/**
 * Draws the question's visual and says in a sentence what was drawn. Before the answer is earned
 * an inferred picture is drawn in its early form — the plots that do not end on the answer, the
 * curve without its tangent, the shading without its area — and every value label is held back;
 * once earned, the whole picture with its labels. Throws a sentence when there is nothing it may
 * draw yet (`HELD_BACK`) or the picture cannot be worked out.
 */
export function showVisual(plan: VisualPlan, played: Played, settings: MeasureSettings, earned: boolean): string {
  if (plan.source === 'authored') {
    // Before the answer, only what holds none of it: the curves, arrows and plots that do not end,
    // turn or run out on an answer (authoredEarly).
    const picture = earned ? plan.picture : plan.early.picture
    const motion = earned ? plan.motion : plan.early.motion
    if (picture) return showPicture(picturePlan(picture, played, settings), settings, !earned).note
    if (motion) return showMotion(motion, played, settings, earned).note
    // A held-back picture or motion is not swapped for the experiment beside it: Practice has
    // already switched to Graphing for the picture, and the experiment has its own button.
    if (plan.picture || plan.motion) throw new Error(HELD_BACK)
    if (plan.sandbox) return showSandbox(sandboxPlan(plan.sandbox, played))
    throw new Error('This question has nothing to show.')
  }
  const v = earned ? plan.auto.visual : plan.auto.early
  if (!v) throw new Error(HELD_BACK)
  if (v.picture) return showPicture(picturePlan(v.picture, played, settings), settings, !earned).note
  return showMotion(v.motion, played, settings, earned).note
}

/**
 * "Draw the motion" beside an author's picture: the motion in full once the answer is earned,
 * before that only its plots that hold no answer — or the held-back sentence when none is left.
 */
export function showAuthoredMotion(plan: VisualPlan, played: Played, settings: MeasureSettings, earned: boolean): string {
  if (plan.source !== 'authored' || !plan.motion) throw new Error('This question has no motion to draw.')
  const motion = earned ? plan.motion : plan.early.motion
  if (!motion) throw new Error(HELD_BACK)
  return showMotion(motion, played, settings, earned).note
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

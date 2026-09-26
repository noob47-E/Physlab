// Fix 21: a picture for every practice question. Most questions — three of the six bundled
// samples, and every question imported from Numbas — carried no picture, motion or experiment, so
// Practice offered nothing to look at. This reads a question's numbers and words and infers a
// picture where the author gave none: one stretch of steady acceleration for a SUVAT question, a
// vertical throw under −g, a free-body diagram, the curve in a "$$ f(x) = …" line (with its
// tangent or its shaded integral), a shaded normal curve, the answer's arrow or its roots — and,
// when nothing can be read, the given quantities on a labelled number line.
//
// A picture that gives the answer away (the x–t curve ending at the distance asked for, the
// tangent whose slope is the derivative, the shaded probability) is `revealsAnswer`; `early` is
// the part of it that may be shown before the student has earned the rest, or absent when every
// part of it gives the answer. Headless: no React, no store, no DOM.

import type { MathNode } from 'mathjs'
import { math, preprocess } from '../math/expr'
import { fmtPrecise, type MeasureSettings } from '../math/format'
import { latexToMath } from '../math/latexToMath'
import { motionPieces } from './motion'
import { evaluateInVariables } from './parts'
import { bandOf, DEFAULT_BAND, type MotionSegment, type PQMotion, type PQPicture, type PQQuestion, type PQSandbox, type Tolerance, type UnitId } from './pqjson'
import { lineSegments, spokenOf, substituteTex, type Fill } from './steps'
import { unitsCompatible, UNITS } from './units'
import type { Variant } from './variables'

/** One thing to draw: a picture in Graphing, or a motion drawn as x–t and v–t curves. */
export type Visual = { picture: PQPicture; motion?: undefined } | { motion: PQMotion; picture?: undefined }

export type InferRule = 'suvat' | 'vertical' | 'freebody' | 'function' | 'normal' | 'vector' | 'roots' | 'numberline'

export interface AutoVisual {
  rule: InferRule
  /** The whole picture, every number written in. */
  visual: Visual
  /**
   * What may be shown before the answer is earned — drawn with its values held back (no "area ="
   * or "slope =" label) — or absent when every part of the picture gives the answer away.
   */
  early?: Visual
  /** The whole picture shows the answer (its value, or its curve). */
  revealsAnswer: boolean
  /** One plain sentence on what PhysLab read from the question. */
  why: string
}

/** What a question shows: the author's own bindings, or a picture PhysLab drew from its numbers. */
export type VisualPlan =
  | {
      source: 'authored'
      picture?: PQPicture
      motion?: PQMotion
      sandbox?: PQSandbox
      /** What of the picture and the motion may be drawn before the answer is earned (`authoredEarly`). */
      early: { picture?: PQPicture; motion?: PQMotion }
    }
  | { source: 'inferred' | 'fallback'; auto: AutoVisual }

/** The line Practice shows under a picture PhysLab drew itself (Fix 21, spec risk 6). */
export const INFERRED_NOTE = "PhysLab drew this from the question's numbers."

// ---------------------------------------------------------------------------
// Reading the question
// ---------------------------------------------------------------------------

/**
 * Numbers go into the text in full: the words are read for their numbers, never shown, and a
 * rounded 9.81 read back as 9.8 would draw the wrong picture.
 */
const TEXT: MeasureSettings = { decimals: 10, precisionMode: 'dp', unit: 'm', unitPerSquare: 1, angleUnit: 'deg' }

interface QuestionText {
  /** The statement's words, numbers and units in, lower case, maths spoken. */
  statement: string
  /** Each part's prompt the same way. */
  prompts: string[]
  /** Statement then prompts: everything a rule reads its words from. */
  all: string
  /** Every display line and inline maths span, as LaTeX with the numbers in and no units. */
  maths: string[]
}

const INLINE_MATHS = /\\\(([\s\S]*?)\\\)/g

function readQuestion(q: PQQuestion, values: Record<string, number>): QuestionText {
  const units = Object.fromEntries(q.variables.map((v) => [v.name, v.unit]))
  const fill: Fill = { values, units, settings: TEXT }
  const maths: string[] = []
  const words = (text: string): string => {
    const lines: string[] = []
    for (const raw of text.split('\n')) {
      const line = raw.trim()
      if (line === '') continue
      if (line.startsWith('$$')) {
        // A display line is maths to read, not words: its chips can repeat a given quantity
        // ("s = ½ × 24 × 8" beside "24 m/s … 8 s"), and counting those twice would read two speeds.
        maths.push(substituteTex(line.replace(/^\$\$|\$\$$/g, ''), values, {}, TEXT))
        continue
      }
      for (const m of line.matchAll(INLINE_MATHS)) maths.push(substituteTex(m[1], values, {}, TEXT))
      lines.push(spokenOf(lineSegments(line, fill)))
    }
    return lines.join(' ').toLowerCase()
  }
  const statement = words(q.statement)
  const prompts = q.parts.map((p) => words(p.prompt))
  return { statement, prompts, all: [statement, ...prompts].join(' '), maths }
}

type Dimension = 'speed' | 'accel' | 'time' | 'length' | 'force' | 'mass' | 'angle'

interface Quantity {
  value: number
  dim: Dimension
  /** Where it stands in the text, and the words just before it ("g = ", "coefficient of"). */
  at: number
  before: string
}

/** Unit spellings a question uses after a number → what they measure and the factor to SI. Longest first. */
const UNIT_SPELLINGS: [string, Dimension, number][] = [
  ['metres per second squared', 'accel', 1], ['meters per second squared', 'accel', 1],
  ['m/s²', 'accel', 1], ['m/s^2', 'accel', 1], ['m/s2', 'accel', 1], ['m s⁻²', 'accel', 1], ['ms⁻²', 'accel', 1],
  ['kilometres per hour', 'speed', 1000 / 3600], ['kilometers per hour', 'speed', 1000 / 3600], ['km/h', 'speed', 1000 / 3600],
  ['metres per second', 'speed', 1], ['meters per second', 'speed', 1], ['m/s', 'speed', 1], ['m s⁻¹', 'speed', 1], ['ms⁻¹', 'speed', 1],
  ['milliseconds', 'time', 0.001], ['millisecond', 'time', 0.001], ['seconds', 'time', 1], ['second', 'time', 1], ['minutes', 'time', 60],
  ['minute', 'time', 60], ['hours', 'time', 3600], ['hour', 'time', 3600], ['secs', 'time', 1], ['sec', 'time', 1], ['min', 'time', 60],
  ['ms', 'time', 0.001], ['s', 'time', 1], ['h', 'time', 3600],
  ['kilometres', 'length', 1000], ['kilometers', 'length', 1000], ['kilometre', 'length', 1000], ['kilometer', 'length', 1000],
  ['centimetres', 'length', 0.01], ['centimeters', 'length', 0.01], ['millimetres', 'length', 0.001], ['millimeters', 'length', 0.001],
  ['metres', 'length', 1], ['meters', 'length', 1], ['metre', 'length', 1], ['meter', 'length', 1],
  ['km', 'length', 1000], ['cm', 'length', 0.01], ['mm', 'length', 0.001], ['m', 'length', 1],
  ['newtons', 'force', 1], ['newton', 'force', 1], ['kn', 'force', 1000], ['n', 'force', 1],
  ['kilograms', 'mass', 1], ['kilogram', 'mass', 1], ['kg', 'mass', 1], ['grams', 'mass', 0.001], ['gram', 'mass', 0.001], ['g', 'mass', 0.001],
  ['degrees', 'angle', 1], ['degree', 'angle', 1], ['°', 'angle', 1]
]

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const fromSuperscript = (s: string): number => Number(s.replace('⁻', '-').replace(/[⁰-⁹¹²³]/g, (c) => String(SUPERSCRIPT.indexOf(c))))

/** A number as the text writes it: −3, 0.4, 1.5×10⁶, 1.5×10^6. */
const NUMBER = String.raw`(?<![\p{L}\d.])([−-]?\d+(?:\.\d+)?)(?:\s*×\s*10(?:\^\{?([−-]?\d+)\}?|([⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+)))?`

const QUANTITY = new RegExp(`${NUMBER}\\s*(${UNIT_SPELLINGS.map(([u]) => escape(u)).join('|')})(?![\\p{L}\\d/^²⁻])`, 'gu')
const BARE_NUMBER = new RegExp(NUMBER, 'gu')

function numberOf(m: RegExpMatchArray): number {
  const base = Number(m[1].replace('−', '-'))
  if (m[2] !== undefined) return base * 10 ** Number(m[2].replace('−', '-'))
  if (m[3] !== undefined) return base * 10 ** fromSuperscript(m[3])
  return base
}

/** Every "number unit" in the words, in SI, in the order written. */
function quantitiesIn(text: string): Quantity[] {
  const out: Quantity[] = []
  for (const m of text.matchAll(QUANTITY)) {
    const spelled = UNIT_SPELLINGS.find(([u]) => u === m[4])
    if (!spelled) continue
    const at = m.index ?? 0
    out.push({ value: numberOf(m) * spelled[2], dim: spelled[1], at, before: text.slice(Math.max(0, at - 30), at) })
  }
  return out
}

const GRAVITY_BEFORE = /\bg\s*=\s*$/

/** The g a question gives ("take g = 9.8 m/s²"), else its variable called g, else standard gravity. */
function gravityOf(qs: Quantity[], values: Record<string, number>): number {
  const said = qs.find((x) => x.dim === 'accel' && GRAVITY_BEFORE.test(x.before))
  if (said) return Math.abs(said.value)
  if (Number.isFinite(values.g) && values.g > 0) return values.g
  return 9.81
}

/** The same value twice ("24 m/s … at 24 m/s") is one quantity said twice, not two. */
function distinct(qs: Quantity[]): Quantity[] {
  const out: Quantity[] = []
  for (const x of qs) if (!out.some((y) => y.dim === x.dim && same(y.value, x.value))) out.push(x)
  return out
}

const same = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b))

/** Twelve significant figures, the way a number goes into a formula here (motion.ts writes them so too). */
const lit = (v: number): string => String(Number(v.toPrecision(12)))

// ---------------------------------------------------------------------------
// What the answers are, so a picture can be checked against them
// ---------------------------------------------------------------------------

/** One number an answer box expects, with how far from it the part still marks a value right. */
interface Answer {
  value: number
  /** Absolute width: the part's own band, and never narrower than half the last place the author wrote. */
  tol: number
}

interface Answers {
  /**
   * Every number an answer box expects: number and generated-choice answers, roots, vector
   * components and sizes — each as the part asks for it and, when its unit is not SI, in SI too.
   * A picture is drawn in SI (a speed read as 72 km/h is drawn at 20 m/s), so an answer of 72 km/h
   * must be caught as 20 on the drawing; the part's own value is kept for the number line, whose
   * marks are the question's numbers as written.
   *
   * Each carries its part's tolerance: an author writes 3.28 s for a flight of 3.2838 s, and a
   * drawing that shows 3.2838 hands over a value the part marks right (review r1 of the 0.9 pass).
   */
  numbers: Answer[]
  /** Expression answers as functions of their one free symbol. */
  curves: ((x: number) => number)[]
}

/** Half the last decimal place an answer written as a plain decimal gives ("3.28" → 0.005), else 0. */
function writtenHalfStep(expr: string): number {
  const m = /^\s*[−-]?\d+\.(\d+)\s*$/.exec(expr)
  return m ? 0.5 * 10 ** -m[1].length : 0
}

function answersOf(q: PQQuestion, values: Record<string, number>): Answers {
  const numbers: Answer[] = []
  const curves: ((x: number) => number)[] = []
  const tryNum = (expr: string): number | null => {
    try {
      const v = evaluateInVariables(expr, values)
      return Number.isFinite(v) ? v : null
    } catch {
      return null
    }
  }
  /** The band's width about `size` (a vector's band is on its length), widened to what the author wrote. */
  const widthOf = (tolerance: Tolerance, size: number, expr: string): number => {
    const band = bandOf(tolerance)
    return Math.max(band.kind === 'relative' ? Math.abs(size) * band.value : band.value, writtenHalfStep(expr))
  }
  const push = (v: number | null, unit: UnitId, tol: number) => {
    if (v === null) return
    numbers.push({ value: v, tol })
    const info = UNITS[unit]
    if (info && (info.toSI !== 1 || info.offset)) numbers.push({ value: v * info.toSI + (info.offset ?? 0), tol: tol * Math.abs(info.toSI) })
  }
  const one = (expr: string, unit: UnitId, tolerance: Tolerance) => {
    const v = tryNum(expr)
    push(v, unit, v === null ? 0 : widthOf(tolerance, v, expr))
  }
  for (const p of q.parts) {
    if (p.type === 'number') one(p.answer, p.unit, p.tolerance)
    // A generated choice is marked by picking it; a drawing that shows its value to the band the
    // app marks by picks it out of the list just as surely.
    else if (p.type === 'choice' && p.distractors) one(p.distractors.correct, p.distractors.unit, DEFAULT_BAND)
    else if (p.type === 'roots') p.answer.forEach((r) => one(r, p.unit, p.tolerance))
    else if (p.type === 'vector') {
      const c = p.answer.map(tryNum)
      if (c.every((x) => x !== null)) {
        const size = Math.hypot(...(c as number[]))
        c.forEach((x, i) => push(x, p.unit, widthOf(p.tolerance, size, p.answer[i])))
        push(size, p.unit, widthOf(p.tolerance, size, ''))
      } else c.forEach((x, i) => push(x, p.unit, x === null ? 0 : widthOf(p.tolerance, x, p.answer[i])))
    } else if (p.type === 'expression' && p.symbols.length === 1) {
      const sym = p.symbols[0]
      curves.push((x: number) => {
        try {
          return evaluateInVariables(p.answer, { ...values, [sym]: x })
        } catch {
          return NaN
        }
      })
    }
  }
  return { numbers, curves }
}

/** Whether a shown value is one the part would mark right for this answer. */
const marksAs = (shown: number, a: Answer): boolean => Math.abs(shown - a.value) <= a.tol || same(shown, a.value)

const holdsAny = (shown: number[], answers: Answer[]): boolean => shown.some((s) => answers.some((a) => marksAs(s, a)))

/**
 * The same, by size: a motion is drawn with up (or forwards) positive, so a stone's impact speed
 * of 19.8 m/s ends the v–t line at −19.8, and the answer box asks for the speed, a size.
 */
const holdsSize = (shown: number[], answers: Answer[]): boolean =>
  shown.some((s) => answers.some((a) => marksAs(Math.abs(s), { value: Math.abs(a.value), tol: a.tol })))

/** Whether a drawn curve is an answer curve: equal at five points across where it is drawn. */
function curveIsAnswer(f: (x: number) => number, answers: Answers, from: number, to: number): boolean {
  const xs = [0.13, 0.31, 0.5, 0.67, 0.89].map((k) => from + (to - from) * k)
  return answers.curves.some((g) => xs.every((x) => Number.isFinite(f(x)) && Number.isFinite(g(x)) && same(f(x), g(x))))
}

// ---------------------------------------------------------------------------
// Motion: SUVAT and vertical throws
// ---------------------------------------------------------------------------

interface Suvat {
  u?: number
  v?: number
  a?: number
  t?: number
  s?: number
}

type Solved = Required<Suvat>

/**
 * The five SUVAT quantities from any three that are known: each equation is solved for its one
 * unknown until none is left. A speed from v² = u² + 2as takes the root at or above 0 (a body
 * moving one way), a time from s = ut + ½at² its first moment after the start. Four or five
 * knowns must agree with each other, or the question is not one steady stretch and nothing is drawn.
 */
export function solveSuvat(k: Suvat): Solved | null {
  const x: Suvat = { ...k }
  const given = Object.values(k).filter((v) => v !== undefined).length
  if (given < 3) return null
  const ok = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v)
  const sqrt = (v: number): number | undefined => (v < -1e-9 ? undefined : Math.sqrt(Math.max(0, v)))
  for (let pass = 0; pass < 4; pass++) {
    // With u, a and s known the time comes first, from the motion itself: v² = u² + 2as cannot
    // tell a ball going up from the same ball coming back down (s = 0 gives v = +u, which is the
    // throw, not the catch), but the first moment the body is at s can.
    if (!ok(x.t) && ok(x.u) && ok(x.a) && ok(x.s) && !ok(x.v)) x.t = firstTime(x.u, x.a, x.s)
    const { u, v, a, t, s } = x
    if (!ok(u)) {
      if (ok(v) && ok(a) && ok(t)) x.u = v - a * t
      else if (ok(v) && ok(s) && ok(t) && t !== 0) x.u = (2 * s) / t - v
      else if (ok(a) && ok(s) && ok(t) && t !== 0) x.u = s / t - (a * t) / 2
      else if (ok(v) && ok(a) && ok(s)) x.u = sqrt(v * v - 2 * a * s)
    }
    if (!ok(x.v)) {
      const U = x.u
      if (ok(U) && ok(a) && ok(t)) x.v = U + a * t
      else if (ok(U) && ok(s) && ok(t) && t !== 0) x.v = (2 * s) / t - U
      else if (ok(U) && ok(a) && ok(s)) x.v = sqrt(U * U + 2 * a * s)
    }
    if (!ok(x.a)) {
      const U = x.u
      const V = x.v
      if (ok(U) && ok(V) && ok(t) && t !== 0) x.a = (V - U) / t
      else if (ok(U) && ok(s) && ok(t) && t !== 0) x.a = (2 * (s - U * t)) / (t * t)
      else if (ok(U) && ok(V) && ok(s) && s !== 0) x.a = (V * V - U * U) / (2 * s)
    }
    if (!ok(x.t)) {
      const U = x.u
      const V = x.v
      const A = x.a
      if (ok(U) && ok(V) && ok(A) && A !== 0) x.t = (V - U) / A
      else if (ok(U) && ok(V) && ok(s) && U + V !== 0) x.t = (2 * s) / (U + V)
      else if (ok(U) && ok(A) && ok(s)) x.t = firstTime(U, A, s)
    }
    if (!ok(x.s)) {
      const U = x.u
      const A = x.a
      const T = x.t
      if (ok(U) && ok(A) && ok(T)) x.s = U * T + (A * T * T) / 2
    }
  }
  const { u, v, a, t, s } = x
  if (!ok(u) || !ok(v) || !ok(a) || !ok(t) || !ok(s) || !(t > 1e-12)) return null
  // Every equation must hold with the numbers as found, or four givens contradicted each other.
  const agree = same(v, u + a * t) && same(s, ((u + v) / 2) * t) && same(s, u * t + (a * t * t) / 2) && same(v * v, u * u + 2 * a * s)
  return agree ? { u, v, a, t, s } : null
}

/** The first moment after the start at which ut + ½at² = s, or undefined when there is none. */
function firstTime(u: number, a: number, s: number): number | undefined {
  if (Math.abs(a) < 1e-12) return u !== 0 && s / u > 0 ? s / u : undefined
  const disc = u * u + 2 * a * s
  if (disc < 0) return undefined
  const roots = [(-u + Math.sqrt(disc)) / a, (-u - Math.sqrt(disc)) / a].filter((r) => r > 1e-9).sort((p, q) => p - q)
  return roots[0]
}

const FROM_REST = /\b(from rest|from a standstill|initially at rest|starts? (?:off )?at rest|starting at rest|released from rest)\b/
// "Stops" is the body stopping, not "when the push stops": the pushed crate's second part asks how
// fast it moves when the push stops, and read as braking to rest it drew a crate slowing down.
const TO_REST = /\b(to rest|to a stop|to a halt|to a standstill|(?<!\b(?:push|pushing|force|engine|motor|thrust|pull|pulling|power|current|clock|timer|wind|rain)\s)(?:stops|stopping|stopped|halts))\b/
// Verbs of slowing only: "moves slowly", "a slower car" or "a slow start" are not braking, and
// read as braking they drew a car from rest going backwards.
const SLOWING = /\b(brak(?:e|es|ed|ing)|slow(?:s|ed|ing)(?:\s+down)?|slow\s+down|decelerat\w*|retard(?:s|ed|ing|ation))\b/
// "Vertically" alone is up; "thrown vertically downwards" was read as a throw up at its speed.
const THROWN_UP = /\b(thrown|projected|launched|fired|kicked|hit|thrown straight|shot)\s+(?:\w+\s+){0,2}?(up|upwards|upward|vertically(?!\s+down))\b/
const THROWN_DOWN = /\b(thrown|projected|launched|fired|shot)\s+(?:\w+\s+){0,2}?(down|downwards|downward)\b/
const DROPPED = /\b(dropped|falls?|let go|released)\b/
// What a speed given in a fall is, from the words just before it. Taken as a start speed with up
// positive, a landing speed ("hits the ground at 19.8 m/s") was drawn as a throw up to 40 m and a
// "downward speed of 5 m/s" rose first, for a second longer than the fall.
const SPEED_ROLES: ['final' | 'down' | 'up', RegExp][] = [
  ['final', /\b(?:(?:hits?|strikes?|reach(?:es)?|hitting|striking|reaching)\s+the\s+(?:ground|floor|water|sea)|lands?|landing|impact)\b/g],
  ['down', /\b(?:down|downward|downwards)\b/g],
  ['up', /\b(?:rising|ascending|upward|upwards|going up|moving up)\b/g]
]

/** The role of the speed at `at` in a fall: the cue nearest before it in its own sentence, or null for none. */
function speedRole(text: string, at: number): 'final' | 'down' | 'up' | null {
  // A decimal point is not a sentence end: "from 12.5 m with a downward speed of" keeps its cue.
  const clause = text.slice(Math.max(0, at - 60), at).split(/[.;!?](?!\d)/).pop() ?? ''
  let best: { role: 'final' | 'down' | 'up'; end: number } | null = null
  for (const [role, re] of SPEED_ROLES) {
    for (const m of clause.matchAll(re)) {
      const end = (m.index ?? 0) + m[0].length
      if (!best || end > best.end) best = { role, end }
    }
  }
  return best?.role ?? null
}
const FROM_HEIGHT = /\b(from a height|at a height|from the top of|above the ground|from a (?:cliff|tower|building|roof|balcony|bridge|balloon|helicopter))\b/
// A slope, ramp or incline: on one the normal reaction is perpendicular to it (mg cos θ) and the
// weight is resolved along it; drawn by the level-ground rule, N stood straight up at mg − F sin θ,
// which is wrong, so until an inclined-plane rule exists such a question gets no free-body diagram.
// A body released on one moves along it at its own acceleration, never falls under g, and a height
// it starts at is not the distance it goes along the slope.
const INCLINE = /\b(slope|ramp|incline[ds]?|inclined plane|hill|hillside)\b/
const HEIGHT_BEFORE = /\bheight\s+(?:of\s+)?$/
const LET_GO = /\b(released|let go|dropped)\b/

/**
 * An acceleration the question gives that is not g ("accelerates at 3 m/s²"): the body moves at
 * that, so it is not a fall. One within 2 % of g (a stone "accelerates at 10 m/s²") is g said
 * without "g =". `said` holds the quantities with "g =" taken out.
 */
function ownAcceleration(said: Quantity[], g: number): Quantity | undefined {
  return said.find((x) => x.dim === 'accel' && !(Math.abs(Math.abs(x.value) - g) <= 0.02 * g))
}

const STRETCHES = /\b(then|after that|afterwards|followed by|for a further|for another)\b/
// "How high" asks for the top only when no time is given: "how high is it after 0.5 s?" is the
// height then, and drawn to the top the asked moment was never the end of the picture.
const TOP = /\b(maximum height|greatest height|highest point|max(?:imum)? height|top of its (?:flight|path)|how high)\b/
const TOP_ALWAYS = /\b(maximum height|greatest height|highest point|max(?:imum)? height|top of its (?:flight|path))\b/
// A launch at an angle is a projectile, not a throw straight up: read as one, "projected upwards at
// 20 m/s at an angle of 30° to the horizontal" rose at the whole 20 m/s to 20 m, where it rises 5 m.
// A bare "horizontal" is not a launch: "dropped from 20 m onto horizontal ground" is a plain fall.
const AT_AN_ANGLE = /\b(?:angle|elevation|horizontally|(?:to|above|below|with|from) the horizontal|horizontal (?:velocity|speed|component|distance|range))\b/
// Two bodies in one question are two motions, never one: "a ball is dropped … a second ball is
// thrown downward at 5 m/s" drew one fall from 30 m starting at 5 m/s, which is neither ball.
// Each name with its own plural: "bodies", "lorries", "buses" and "people" are not the name plus "s".
const BODY = String.raw`(?:(?:ball|stone|car|object|particle|train|cyclist|runner|truck|bullet|vehicle|rock|person|boy|girl|motorcyclist|one)s?|bod(?:y|ies)|lorr(?:y|ies)|bus(?:es)?|people)`
const TWO_BODIES = new RegExp(String.raw`\b(?:(?:second|another|other)\s+${BODY}|(?:both|two)\s+(?:of\s+the\s+)?${BODY})\b`)

/** Whether the words name a second body, or one body dropped and one thrown. */
function twoBodies(text: string): boolean {
  return TWO_BODIES.test(text) || (/\bdropped\b/.test(text) && (THROWN_UP.test(text) || THROWN_DOWN.test(text)))
}

// The words just before a lone speed that make it the end speed: "reaching", "to", "final speed of",
// "lands at", "hits the ground at". Read as the start, "accelerates at 2 m/s² for 4 s, reaching a
// speed of 16 m/s" drew v0 = 16 climbing to 24 m/s, the question turned round.
const FINAL_BEFORE =
  /\b(?:reach\w*|attain\w*|to|finish\w*(?:\s+at)?|ends?\s+at|lands?(?:\s+at)?|landing\s+at|(?:hits?|strikes?)\s+the\s+(?:ground|floor|water|sea|wall|target)\s+at|final(?:\s+(?:speed|velocity))?(?:\s+(?:is|of|was|=))?)(?:\s+(?:a|its|the)\s+(?:final\s+)?(?:speed|velocity)\s+(?:of|is))?\s*$/

/** Whether the speed at `at` is an end speed by the words just before it, in its own sentence. */
function isFinalSpeed(text: string, at: number): boolean {
  const clause = text.slice(Math.max(0, at - 60), at).split(/[.;!?](?!\d)/).pop() ?? ''
  return FINAL_BEFORE.test(clause)
}

/** Readings about every tenth of the motion, on a 1-2-5 step, so the Lab Data table is a handful of rows. */
function readingStep(total: number): number {
  const raw = total / 10
  const p = 10 ** Math.floor(Math.log10(raw))
  const m = raw / p
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p
}

/**
 * One stretch of motion as a picture: x–t and v–t curves with a Lab Data table, and — when some
 * of that shows the answer — the plots that do not. What each part "holds": the v–t line starts at
 * u and ends at v when t is up; the x–t curve starts at x₀ and ends at x₀ + s when t is up; the
 * table holds all of that and the slope a between its rows.
 */
function motionVisual(k: Solved, x0: number, answers: Answers, rule: 'suvat' | 'vertical', why: string, wait = 0): AutoVisual {
  const seg: MotionSegment = Math.abs(k.a) < 1e-12 ? { kind: 'uniform', duration: lit(k.t), v: lit(k.u) } : { kind: 'accelerate', duration: lit(k.t), a: lit(k.a) }
  // `wait` is time standing still after a stretch that ends at rest (a car braked to a stop).
  const segments: MotionSegment[] = wait > 0 ? [seg, { kind: 'rest', duration: lit(wait) }] : [seg]
  const base: Omit<PQMotion, 'plots'> = { segments, v0: lit(k.u), ...(x0 !== 0 ? { x0: lit(x0) } : {}) }
  const total = k.t + wait
  const xAt = (tau: number): number => {
    const on = Math.min(tau, k.t)
    return x0 + k.u * on + (k.a * on * on) / 2
  }
  const vAt = (tau: number): number => (wait > 0 && tau > k.t ? 0 : k.u + k.a * tau)
  // A motion that turns (a ball at the top of its flight) marks the moment on both plots: the v–t
  // line crosses zero there and the x–t curve peaks at the top height, which is often what is asked.
  const turn = Math.abs(k.a) < 1e-12 ? NaN : -k.u / k.a
  const turns = turn > 1e-9 && turn <= k.t + 1e-9
  const turnAt = turns ? [turn] : []
  const topAt = turns ? [xAt(turn), xAt(turn) - x0] : []
  // Every reading the Lab Data table will hold, taken as motion.ts takes them: a middle row
  // ("after 2 s", v = 0 at t = 2) shows an answer as plainly as the last.
  const every = readingStep(total)
  const step = Math.max(every, total / 1000)
  const rows: number[] = []
  for (let i = 0; i <= Math.floor(total / step + 1e-9); i++) rows.push(i * step)
  if (Math.abs(rows[rows.length - 1] - total) > 1e-9) rows.push(total)
  const readings = rows.flatMap((tau) => [tau, xAt(tau), vAt(tau)])
  // A wait adds its end (the whole time) to both plots; the stop is k's own end.
  const ends = wait > 0 ? [k.t, total] : [k.t]
  const holds: Record<PQMotion['plots'][number] | 'table', boolean> = {
    'a-t': false,
    'v-t': holdsSize([k.u, k.v, ...ends, ...turnAt], answers.numbers) || curveIsAnswer(vAt, answers, 0, total),
    // The displacement s is read off a curve that starts at a height x₀ as plainly as its end.
    'x-t': holdsSize([x0, x0 + k.s, k.s, ...ends, ...turnAt, ...topAt], answers.numbers) || curveIsAnswer(xAt, answers, 0, total),
    table:
      holdsSize([k.u, k.v, ...ends, x0 + k.s, k.s, k.a, ...turnAt, ...topAt, ...readings], answers.numbers) ||
      curveIsAnswer(xAt, answers, 0, total) ||
      curveIsAnswer(vAt, answers, 0, total)
  }
  const plots: PQMotion['plots'] = ['v-t', 'x-t']
  const visual: Visual = { motion: { ...base, plots, sampleEvery: lit(every) } }
  const revealsAnswer = holds['v-t'] || holds['x-t'] || holds.table
  const safe = plots.filter((p) => !holds[p])
  const early: Visual | undefined = !revealsAnswer ? visual : safe.length > 0 ? { motion: { ...base, plots: safe } } : undefined
  return { rule, visual, early, revealsAnswer, why }
}

/**
 * Assigns the speeds a question gives to u and v by its words: from rest, to rest, first then
 * last, or — for a lone speed — by the words just before it ("reaching 16 m/s" is v).
 */
function speedsOf(text: string, given: Quantity[]): { u?: number; v?: number } | null {
  const speeds = given.map((x) => x.value)
  const fromRest = FROM_REST.test(text)
  const toRest = TO_REST.test(text)
  if (fromRest && toRest) return speeds.length === 0 ? { u: 0, v: 0 } : null
  if (speeds.length > 2) return null
  if (fromRest) return speeds.length > 1 ? null : { u: 0, v: speeds[0] }
  if (toRest) return speeds.length > 1 ? null : { u: speeds[0], v: 0 }
  if (speeds.length === 1 && isFinalSpeed(text, given[0].at)) return { v: speeds[0] }
  return { u: speeds[0], v: speeds[1] }
}

/** A number in a sentence the student may read: through format.ts, like every number shown. */
const fmtWhy = (v: number): string => fmtPrecise(v, { decimals: 4, precisionMode: 'dp' })

/**
 * A question about one stretch of steady acceleration: its speeds, time, distance and
 * acceleration read from the words with their units; "to rest" or "stops" is a final speed of
 * 0, "from rest" a starting one; braking or slowing makes a given acceleration a deceleration.
 * Three that agree draw one segment; a journey in several stretches (three times) is not read.
 */
function inferSuvat(text: QuestionText, qs: Quantity[], values: Record<string, number>, answers: Answers): AutoVisual | null {
  const incline = INCLINE.test(text.all)
  // On a slope a height is where the body starts, not how far it goes along the slope: "released
  // at a height of 2 m on a ramp and accelerates at 3 m/s² for 2 s" goes 6 m, and the 2 m taken
  // as its distance contradicted the rest.
  const said = qs.filter((x) => !GRAVITY_BEFORE.test(x.before) && !(incline && x.dim === 'length' && HEIGHT_BEFORE.test(x.before)))
  // A stone "released" or "let go" from a height is a fall under g, not a stretch of a given
  // acceleration: read here, "released from 20 m … after 1 s" solved an acceleration of its own.
  // A body on a slope, or one given an acceleration that is not g, moves at that instead: read as
  // a fall, the trolley released on a ramp at 3 m/s² for 2 s dropped from 2 m under g for 0.64 s.
  const falls =
    !incline &&
    ownAcceleration(said, gravityOf(qs, values)) === undefined &&
    (/\b(dropped|falls? from)\b/.test(text.all) || (DROPPED.test(text.all) && FROM_HEIGHT.test(text.all)))
  if (THROWN_UP.test(text.all) || THROWN_DOWN.test(text.all) || falls || twoBodies(text.all)) return null
  // A second stretch ("then … for 5 s", "for a further 100 m") is counted before equal values
  // merge: "accelerates … for 5 s, then continues steadily for 5 s" was one 5 s stretch ending at
  // 25 m where the journey goes 75 m. The merge is for one number said twice, not two stretches.
  const count = (d: Dimension) => said.filter((x) => x.dim === d).length
  if (STRETCHES.test(text.all) && (count('time') > 1 || count('length') > 1)) return null
  const kin = distinct(said)
  const of = (d: Dimension) => kin.filter((x) => x.dim === d).map((x) => x.value)
  const [speeds, accels, times, lengths] = [of('speed'), of('accel'), of('time'), of('length')]
  if (accels.length > 1 || times.length > 1 || lengths.length > 1) return null
  // A body released, let go or dropped with no speed given starts at rest: without it, "released
  // from 20 m and accelerates at 3 m/s² for 2 s" solved a start speed of 7 m/s the words never gave.
  const letGo = speeds.length === 0 && LET_GO.test(text.all)
  const uv = letGo ? { u: 0 } : speedsOf(text.all, kin.filter((x) => x.dim === 'speed'))
  if (!uv) return null
  let a = accels[0]
  // A body from rest can only speed up the way it goes: its acceleration is never turned round.
  if (a !== undefined && a > 0 && uv.u !== 0 && (SLOWING.test(text.all) || TO_REST.test(text.all))) a = -a
  const solved = solveSuvat({ ...uv, a, t: times[0], s: lengths[0] })
  if (!solved) return null
  // A braking body stops and stays stopped: "brakes at 4 m/s², how far in 8 s?" solved as one
  // stretch ran v from 20 to −12 m/s and drew the car reversing to 32 m, the classic trap drawn
  // as the physics. Past its stop it is drawn braking to rest and then standing still.
  const braked = solved.a < 0 && solved.u > 0 && solved.v < -1e-9 && (SLOWING.test(text.all) || TO_REST.test(text.all))
  const k = braked ? solveSuvat({ u: solved.u, v: 0, a: solved.a }) : solved
  if (!k) return null
  const wait = braked ? solved.t - k.t : 0
  // The sentence names only what the question gave: it is shown beside the picture from the
  // start, and "from 0 m/s to 20 m/s in 10 s" from the solved values stated the final speed asked for.
  const given: string[] = []
  if (FROM_REST.test(text.all) || letGo) given.push('from rest')
  else if (uv.u !== undefined) given.push(`from ${fmtWhy(uv.u)} m/s`)
  if (TO_REST.test(text.all)) given.push('to rest')
  else if (uv.v !== undefined) given.push(`to ${fmtWhy(uv.v)} m/s`)
  if (a !== undefined) given.push(a < 0 ? `slowing at ${fmtWhy(-a)} m/s²` : `at ${fmtWhy(a)} m/s²`)
  if (times[0] !== undefined) given.push(`for ${fmtWhy(times[0])} s`)
  if (lengths[0] !== undefined) given.push(`over ${fmtWhy(lengths[0])} m`)
  const what = braked ? 'steady braking until it stops, then standing still' : 'one stretch of steady acceleration'
  const why = `PhysLab read this as ${what}: ${given.join(', ')}.`
  return motionVisual(k, 0, answers, 'suvat', why, wait)
}

/**
 * A ball thrown straight up, or dropped: up is positive and a = −g, with g as the question gives
 * it. Thrown up with only its speed known, the picture follows the whole flight back to the hand
 * (s = 0); "maximum height" stops it at the top (v = 0); dropped from a height, it falls to the
 * ground from there.
 */
function inferVertical(text: QuestionText, qs: Quantity[], values: Record<string, number>, answers: Answers): AutoVisual | null {
  const up = THROWN_UP.test(text.all)
  const down = !up && (DROPPED.test(text.all) || THROWN_DOWN.test(text.all))
  // A body on a slope, or one the question gives an acceleration that is not g, does not fall
  // freely: drawn as one, the trolley released on a ramp at 3 m/s² for 2 s fell from 2 m at −9.81.
  // A launch at an angle is a projectile, and two bodies are two motions: neither is one vertical line.
  if ((!up && !down) || INCLINE.test(text.all) || twoBodies(text.all)) return null
  if (qs.some((x) => x.dim === 'angle') || AT_AN_ANGLE.test(text.all)) return null
  const said = qs.filter((x) => !GRAVITY_BEFORE.test(x.before))
  const told = gravityOf(qs, values)
  if (ownAcceleration(said, told)) return null
  // An acceleration within 2 % of g said without "g =" is the g the question works with.
  const g = Math.abs(said.find((x) => x.dim === 'accel')?.value ?? told)
  const kin = distinct(said)
  const of = (d: Dimension) => kin.filter((x) => x.dim === d).map((x) => x.value)
  const [speeds, times, lengths] = [of('speed'), of('time'), of('length')]
  if (speeds.length > 1 || times.length > 1 || lengths.length > 1) return null
  const a = -g
  if (up) {
    const u = speeds[0]
    if (u === undefined || !(u > 0)) return null
    // A landing or end speed ("lands at 25 m/s") is not the speed it is thrown at: no picture.
    const at = kin.find((x) => x.dim === 'speed')!.at
    if (speedRole(text.all, at) === 'final' || isFinalSpeed(text.all, at)) return null
    // Thrown from a height (a cliff top, a balcony), the ball starts there and, with no top or time
    // asked about, falls past the hand to the ground: s = −h. Drawn back to the hand it stopped
    // at 2u/g, short of the landing the question is usually about.
    const h = FROM_HEIGHT.test(text.all) && lengths[0] !== undefined && lengths[0] > 0 ? lengths[0] : undefined
    const landing = h === undefined ? null : solveSuvat({ u, a, s: -h })
    const until = times[0] !== undefined ? solveSuvat({ u, a, t: times[0] }) : null
    // With the ground known, a time past the landing ends at the landing, as a drop does: run on
    // for the time given, "where is it after 5 s?" drew the ball 52.5 m below the ground.
    const grounded = until !== null && landing !== null && until.t > landing.t
    const top = TOP_ALWAYS.test(text.all) || (TOP.test(text.all) && times[0] === undefined)
    const k = top ? solveSuvat({ u, v: 0, a }) : times[0] !== undefined ? (grounded ? landing : until) : solveSuvat({ u, a, s: h === undefined ? 0 : -h })
    if (!k) return null
    const from = h === undefined ? '' : ` from ${fmtWhy(h)} m above the ground`
    const end = grounded && k === landing ? ', drawn to the ground' : ''
    return motionVisual(k, h ?? 0, answers, 'vertical', `PhysLab read this as a throw straight up at ${fmtWhy(u)} m/s${from}, slowing at g = ${fmtWhy(g)} m/s² (up is positive, so a = ${fmtWhy(a)} m/s²)${end}.`)
  }
  const h = lengths[0]
  if (h === undefined || !(h > 0)) return null
  // A time the question gives ("how fast after 2 s?") ends the fall there, as a throw up does;
  // drawn to the ground, the whole fall passed through the asked moment in a row of its table.
  // A time past the landing is the fall to the ground.
  const given = kin.find((x) => x.dim === 'speed')
  let u = 0
  let start = 'starting from rest'
  if (given) {
    const role = speedRole(text.all, given.at)
    if (role === 'down') {
      u = -given.value
      start = `starting at ${fmtWhy(given.value)} m/s downwards`
    } else if (role === 'up') {
      u = given.value
      start = `starting at ${fmtWhy(given.value)} m/s upwards`
    } else if (role === 'final') {
      // The landing speed is the end of the fall from rest drawn anyway. One that disagrees with
      // √(2gh) by more than an author's rounding means a start speed the words did not give.
      if (!(Math.abs(Math.sqrt(2 * g * h) - given.value) <= 0.02 * given.value)) return null
    } else return null
  }
  const until = times[0] !== undefined ? solveSuvat({ u, a, t: times[0] }) : null
  const k = until && until.s >= -h ? until : solveSuvat({ u, a, s: -h })
  if (!k) return null
  const when = until && k === until ? `, for ${fmtWhy(k.t)} s` : ''
  return motionVisual(k, h, answers, 'vertical', `PhysLab read this as a fall from ${fmtWhy(h)} m, ${start}, with a = ${fmtWhy(-g)} m/s² (up is positive)${when}.`)
}

// ---------------------------------------------------------------------------
// Forces: a free-body diagram
// ---------------------------------------------------------------------------

// μ is not a \w letter, so "\bμ" after a space never matched and "μ = 0.2" drew no friction; the
// coefficient named with its letter too ("coefficient of friction μ = 0.2") is read.
const FRICTION_COEFF = /(?:coefficient of (?:kinetic |static |sliding )?friction\s*(?:\(?(?:μ|mu)\)?)?|(?<![A-Za-z])μ|\bmu\b)\s*(?:between [^.]*?)?(?:is|=|of)?\s*([−-]?\d+(?:\.\d+)?)/
const SURFACE = /\b(floor|ground|table|surface|road|track|ice|bench|horizontal)\b/
const ABOVE_HORIZONTAL = /\b(above|to|with) the horizontal\b/
const BELOW_HORIZONTAL = /\bbelow the horizontal\b/
const TO_VERTICAL = /\b(to|from|with) the vertical\b/

/**
 * A body on a level surface pulled or pushed by one force: the force, its weight mg, the normal
 * reaction and — when the question gives a coefficient of friction — the friction μN against the
 * motion, all from the body's centre. A force "at θ to the horizontal" is drawn at θ and lightens
 * the normal reaction by F sin θ. Only a question with one force and one mass is read.
 */
function inferFreeBody(text: QuestionText, qs: Quantity[], values: Record<string, number>, answers: Answers): AutoVisual | null {
  const forces = distinct(qs.filter((x) => x.dim === 'force')).map((x) => x.value)
  const masses = distinct(qs.filter((x) => x.dim === 'mass')).map((x) => x.value)
  if (forces.length !== 1 || masses.length !== 1 || !SURFACE.test(text.all) || INCLINE.test(text.all)) return null
  const [F] = forces
  const [m] = masses
  const g = gravityOf(qs, values)
  // The force's direction from the words: an angle said twice is one angle; "below the horizontal"
  // pushes down (N = mg + F sin θ); "to the vertical" is 90° − θ from the level. An angle measured
  // from anything else is not guessed: drawn level, 50 N at 30° gave N = 98 N where it is 73 N.
  const angles = distinct(qs.filter((x) => x.dim === 'angle')).map((x) => x.value)
  if (angles.length > 1) return null
  let degrees = 0
  if (angles.length === 1) {
    const [below, above, vertical] = [BELOW_HORIZONTAL.test(text.all), ABOVE_HORIZONTAL.test(text.all), TO_VERTICAL.test(text.all)]
    if (Number(below) + Number(above) + Number(vertical) !== 1) return null
    degrees = below ? -angles[0] : vertical ? 90 - angles[0] : angles[0]
  }
  const theta = (degrees * Math.PI) / 180
  const muMatch = FRICTION_COEFF.exec(text.all)
  const mu = muMatch ? Number(muMatch[1].replace('−', '-')) : undefined
  const W = m * g
  const Fx = F * Math.cos(theta)
  const Fy = F * Math.sin(theta)
  const N = W - Fy
  if (!(N >= 0)) return null
  type Item = { name: string; v: [number, number]; size: number }
  const items: Item[] = [{ name: 'F', v: [Fx, Fy], size: F }]
  // Friction is μN; only with a level pull is N = mg, and only then is it named μmg. A pull at an
  // angle lightens N, and "μmg" on that arrow taught a formula its length did not follow.
  if (mu !== undefined && mu > 0) items.push({ name: theta === 0 ? 'μmg' : 'μN', v: [-mu * N, 0], size: mu * N })
  items.push({ name: 'mg', v: [0, -W], size: W }, { name: 'N', v: [0, N], size: N })
  const picture = (list: Item[]): Visual => ({ picture: { kind: 'vectors', items: list.map((it) => ({ name: it.name, v: it.v.map(lit), role: 'input' as const })) } })
  const revealing = items.filter((it) => holdsAny([it.size, ...it.v.filter((c) => c !== 0)], answers.numbers))
  const safe = items.filter((it) => !revealing.includes(it))
  const revealsAnswer = revealing.length > 0
  const friction = mu !== undefined && mu > 0 ? `, friction μN with μ = ${fmtWhy(mu)}` : ''
  return {
    rule: 'freebody',
    visual: picture(items),
    early: !revealsAnswer ? picture(items) : safe.length > 0 ? picture(safe) : undefined,
    revealsAnswer,
    why: `PhysLab drew the forces on the ${fmtWhy(m)} kg body: the ${fmtWhy(F)} N force, its weight mg with g = ${fmtWhy(g)} m/s², the normal reaction N${friction}.`
  }
}

// ---------------------------------------------------------------------------
// A function in the maths: its curve, its tangent, its integral
// ---------------------------------------------------------------------------

const DERIVATIVE_WORDS = /\b(differentiat\w*|derivative|gradient|slope|tangent|rate of change|dy\/dx|stationary|turning point)/
// A turning-point question is about where the slope is 0, which the curve's own marks show: a
// tangent at the default x = 1 (slope 1 on x³ − 2x) had nothing to do with it.
const TURNING_WORDS = /\b(stationary|turning points?)\b/
const AT_X = /\bat x\s*=\s*([−-]?\d+(?:\.\d+)?)/

/** mathjs text for a formula in x alone (constants allowed), or null when it names anything else. */
function inX(expr: string): string | null {
  let node: MathNode
  try {
    node = math.parse(preprocess(expr))
  } catch {
    return null
  }
  const free = new Set<string>()
  node.traverse((n, path, parent) => {
    if (n.type === 'SymbolNode' && !(parent?.type === 'FunctionNode' && path === 'fn')) free.add((n as unknown as { name: string }).name)
  })
  for (const s of free) if (s !== 'x' && s !== 'pi' && s !== 'e') return null
  if (!free.has('x')) return null
  const f = fx(node.toString())
  // A formula with no value anywhere near the origin is not one to draw ("f(x) = log(−x − 100)").
  return [0.5, 1, 1.5, 2, -1, 3].some((x) => Number.isFinite(f(x))) ? node.toString() : null
}

const fx = (expr: string) => (x: number): number => {
  try {
    const v = evaluateInVariables(expr, { x })
    return typeof v === 'number' ? v : NaN
  } catch {
    return NaN
  }
}

interface FoundFunction {
  expr: string
  integral?: { from: number; to: number }
  /** A whole equation "lhs = rhs" in x (roots), as lhs − rhs. */
  equation?: boolean
}

/**
 * The first maths line that is a function of x: "f(x) = …", "y = …", an integral with numeric
 * limits, or an equation in x alone ("x² + x − 6 = 0", read as its left side minus its right).
 */
function functionIn(maths: string[]): FoundFunction | null {
  for (const tex of maths) {
    let text: string
    try {
      text = latexToMath(tex)
    } catch {
      continue
    }
    const integral = /^\s*integral\((.*),\s*([^,]+),\s*([^,]+)\)\s*$/.exec(text)
    if (integral) {
      const body = inX(integral[1])
      const a = Number(evaluateSafe(integral[2]))
      const b = Number(evaluateSafe(integral[3]))
      if (body && Number.isFinite(a) && Number.isFinite(b) && a !== b) return { expr: body, integral: { from: a, to: b } }
      continue
    }
    const sides = text.split('=')
    if (sides.length !== 2) continue
    const [lhs, rhs] = sides.map((s) => s.trim())
    if (/^[A-Za-z]\s*\(\s*x\s*\)$/.test(lhs) || lhs === 'y') {
      const body = inX(rhs)
      if (body) return { expr: body }
      continue
    }
    const whole = inX(`(${lhs}) - (${rhs})`)
    if (whole) return { expr: whole, equation: true }
  }
  return null
}

function evaluateSafe(expr: string): number {
  try {
    return evaluateInVariables(expr, {})
  } catch {
    return NaN
  }
}

/** Where the curve crosses the axis and turns, from −10 to 10: what the drawn curve marks as points. */
function curveMarks(f: (x: number) => number): number[] {
  const out: number[] = []
  const n = 2000
  let px = -10
  let py = f(px)
  let pd = NaN
  for (let i = 1; i <= n; i++) {
    const x = -10 + (20 * i) / n
    const y = f(x)
    if (Number.isFinite(py) && Number.isFinite(y)) {
      if (y === 0) out.push(x)
      else if (py * y < 0) out.push(bisect(f, px, x))
      const d = y - py
      if (Number.isFinite(pd) && pd * d < 0) {
        // The turn lies between the last three samples; the grid point beside it misses a
        // minimum at x = 1/3 (3x² − 2x) or ±0.8165 (x³ − 2x), and the drawing marks the true one.
        const t = extremum(f, px - 20 / n, x, pd < 0)
        out.push(px, py, t, f(t))
      }
      pd = d
    }
    px = x
    py = y
  }
  return out
}

/** Where f is least (or greatest) on [a, b], by golden-section search: one turn lies inside. */
function extremum(f: (x: number) => number, a: number, b: number, least: boolean): number {
  const g = (x: number): number => (least ? f(x) : -f(x))
  const r = (Math.sqrt(5) - 1) / 2
  let lo = a
  let hi = b
  for (let i = 0; i < 80 && hi - lo > 1e-12; i++) {
    const c = hi - r * (hi - lo)
    const d = lo + r * (hi - lo)
    if (g(c) <= g(d)) hi = d
    else lo = c
  }
  return (lo + hi) / 2
}

function bisect(f: (x: number) => number, a: number, b: number): number {
  let lo = a
  let hi = b
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (f(lo) * f(mid) <= 0) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

/**
 * A function in a display line: its curve; with derivative words, the tangent at the x the
 * question names (x = 1 when it names none) once the answer is earned, the bare curve before; an
 * integral with limits shades its region, its area held back until earned. A curve whose roots
 * or turning points are the answer, or which is itself the answer, waits for the answer too.
 */
function inferFunction(text: QuestionText, answers: Answers): AutoVisual | null {
  const found = functionIn(text.maths)
  if (!found || found.equation) return null
  const f = fx(found.expr)
  if (found.integral) {
    const { from, to } = found.integral
    const visual: Visual = { picture: { kind: 'between', upper: found.expr, lower: '0', from: lit(from), to: lit(to) } }
    return { rule: 'function', visual, early: visual, revealsAnswer: true, why: 'PhysLab drew the curve from the integral and shaded the region between it and the x-axis.' }
  }
  const curve: Visual = { picture: { kind: 'curve', expr: found.expr } }
  const curveReveals = holdsAny(curveMarks(f), answers.numbers) || curveIsAnswer(f, answers, -2, 2)
  const at = AT_X.exec(text.all)
  if (TURNING_WORDS.test(text.all) && !at) {
    return { rule: 'function', visual: curve, early: curveReveals ? undefined : curve, revealsAnswer: curveReveals, why: 'PhysLab drew the curve from the question; the points where it turns are marked on it.' }
  }
  if (DERIVATIVE_WORDS.test(text.all)) {
    let a = at ? Number(at[1].replace('−', '-')) : 1
    if (!Number.isFinite(f(a))) a = [0.5, 2, 1.5, -1].find((x) => Number.isFinite(f(x))) ?? a
    const visual: Visual = { picture: { kind: 'tangent', expr: found.expr, at: lit(a) } }
    return { rule: 'function', visual, early: curveReveals ? undefined : curve, revealsAnswer: true, why: `PhysLab drew the curve from the question, with its tangent at x = ${fmtWhy(a)}.` }
  }
  return { rule: 'function', visual: curve, early: curveReveals ? undefined : curve, revealsAnswer: curveReveals, why: 'PhysLab drew the curve from the question.' }
}

// ---------------------------------------------------------------------------
// The normal distribution
// ---------------------------------------------------------------------------

const NORMAL_WORDS = /\b(normal(?:ly)? distribut\w*|normal model|bell curve)\b|\bn\s*\(\s*[−-]?\d/
const MEAN = /\bmean\s*(?:of|is|=|μ\s*=)?\s*([−-]?\d+(?:\.\d+)?)/
const SD = /\bstandard deviation\s*(?:of|is|=|σ\s*=)?\s*(\d+(?:\.\d+)?)/
const VARIANCE = /\bvariance\s*(?:of|is|=)?\s*(\d+(?:\.\d+)?)/
const N_OF = /\bn\s*\(\s*([−-]?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(\^\s*2|²)?\s*\)/
const NUM = String.raw`([−-]?\d+(?:\.\d+)?)`
const REGIONS: [RegExp, (m: RegExpExecArray) => { from?: number; to?: number }][] = [
  // Both comparators as the one-sided forms take them: "P(40 ≤ X ≤ 60)" shaded the whole bell and,
  // once earned, stated its probability as 1. The reversed order "P(60 > X > 40)" is the same stretch.
  [new RegExp(String.raw`p\s*\(\s*${NUM}\s*[<≤]=?\s*[xz]\s*[<≤]=?\s*${NUM}\s*\)`), (m) => ({ from: n(m[1]), to: n(m[2]) })],
  [new RegExp(String.raw`p\s*\(\s*${NUM}\s*[>≥]=?\s*[xz]\s*[>≥]=?\s*${NUM}\s*\)`), (m) => ({ from: n(m[2]), to: n(m[1]) })],
  [new RegExp(String.raw`p\s*\(\s*[xz]\s*[<≤]=?\s*${NUM}\s*\)`), (m) => ({ to: n(m[1]) })],
  [new RegExp(String.raw`p\s*\(\s*[xz]\s*[>≥]=?\s*${NUM}\s*\)`), (m) => ({ from: n(m[1]) })],
  [new RegExp(String.raw`\bbetween\s+${NUM}[^\d−-]{0,12}?\s+and\s+${NUM}`), (m) => ({ from: n(m[1]), to: n(m[2]) })],
  [new RegExp(String.raw`\b(?:less than|fewer than|below|under|at most|no more than|smaller than|lower than|shorter than|lighter than)\s+${NUM}`), (m) => ({ to: n(m[1]) })],
  [new RegExp(String.raw`\b(?:more than|greater than|above|over|at least|no less than|exceeds?|exceeding|larger than|higher than|longer than|heavier than|taller than)\s+${NUM}`), (m) => ({ from: n(m[1]) })]
]

function n(s: string): number {
  return Number(s.replace('−', '-'))
}

/** The probability a normal picture shades, by Simpson's rule on the standard density (6σ for an open tail, as the drawing does). */
function normalArea(mean: number, sd: number, from?: number, to?: number): number {
  const z = (x: number | undefined, tail: number) => (x === undefined ? tail : Math.max(-6, Math.min(6, (x - mean) / sd)))
  const a = z(from, -6)
  const b = z(to, 6)
  if (!(b > a)) return 0
  const steps = 2000
  const h = (b - a) / steps
  const pdf = (x: number) => Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI)
  let sum = pdf(a) + pdf(b)
  for (let i = 1; i < steps; i++) sum += pdf(a + i * h) * (i % 2 ? 4 : 2)
  return (sum * h) / 3
}

/**
 * "Normally distributed with mean 50 and standard deviation 10" (or N(50, 10²), or a variance)
 * shades the region the question asks about — P(X < 65), "less than 65", "between 40 and 60" —
 * read from the parts' prompts first, then the statement. The shaded area is drawn before the
 * answer with its value held back; the area label waits for the answer.
 */
function inferNormal(text: QuestionText, answers: Answers): AutoVisual | null {
  if (!NORMAL_WORDS.test(text.all)) return null
  let mean: number | undefined
  let sd: number | undefined
  const nOf = N_OF.exec(text.all)
  if (nOf) {
    mean = n(nOf[1])
    sd = nOf[3] ? n(nOf[2]) : Math.sqrt(n(nOf[2]))
  }
  const m = MEAN.exec(text.all)
  if (m) mean = n(m[1])
  const s = SD.exec(text.all)
  const v = VARIANCE.exec(text.all)
  if (s) sd = n(s[1])
  else if (v) sd = Math.sqrt(n(v[1]))
  if (mean === undefined || sd === undefined || !(sd > 0)) return null
  let region: { from?: number; to?: number } = {}
  for (const where of [...text.prompts, text.statement]) {
    const hit = REGIONS.map(([re, read]) => {
      const r = re.exec(where)
      return r ? { at: r.index, region: read(r) } : null
    })
      .filter((x): x is { at: number; region: { from?: number; to?: number } } => x !== null)
      .sort((p, q) => p.at - q.at)[0]
    if (hit) {
      region = hit.region
      break
    }
  }
  // "Between 60 and 40" is the same stretch as between 40 and 60; drawn as written, its start
  // was above its end and the picture threw. Two equal ends shade nothing, so none is drawn.
  if (region.from !== undefined && region.to !== undefined) {
    if (region.from > region.to) region = { from: region.to, to: region.from }
    else if (region.from === region.to) region = {}
  }
  const picture: PQPicture = { kind: 'normal', mean: lit(mean), sd: lit(sd), ...(region.from !== undefined ? { from: lit(region.from) } : {}), ...(region.to !== undefined ? { to: lit(region.to) } : {}) }
  const area = normalArea(mean, sd, region.from, region.to)
  // An answer read from a four-place table (0.9332 for 0.93319…) is still this area; so is the
  // other side of it, which the shading gives away just as plainly.
  const revealsAnswer = answers.numbers.some((x) => [area, 1 - area].some((p) => Math.abs(x.value - p) < Math.max(5e-4, x.tol)))
  return { rule: 'normal', visual: { picture }, early: { picture }, revealsAnswer, why: `PhysLab drew the normal curve with mean ${fmtWhy(mean)} and standard deviation ${fmtWhy(sd)}, shaded where the question asks.` }
}

// ---------------------------------------------------------------------------
// Vector and roots answers
// ---------------------------------------------------------------------------

/**
 * A vector part's answer as an arrow from the origin, in the answer colour: it is the answer, so
 * it waits for it. The arrow takes the one capital letter the prompt names ("Find F"), else R.
 */
function inferVectorAnswer(q: PQQuestion, values: Record<string, number>): AutoVisual | null {
  const part = q.parts.find((p) => p.type === 'vector')
  if (!part || part.type !== 'vector') return null
  const c = part.answer.map((e) => {
    try {
      return evaluateInVariables(e, values)
    } catch {
      return NaN
    }
  })
  if (!c.every(Number.isFinite)) return null
  // A capital opening a sentence is a word, not a name: "A force of 3i + 4j…" named its arrow A.
  const named = [...part.prompt.matchAll(/\b([A-Z])\b/g)].find((m) => !/(?:^|[.!?:]\s+)$/.test(part.prompt.slice(0, m.index)))
  const name = named ? named[1] : 'R'
  return {
    rule: 'vector',
    visual: { picture: { kind: 'vectors', items: [{ name, v: c.map(lit), role: 'result' }] } },
    revealsAnswer: true,
    why: 'PhysLab drew the answer as an arrow from the origin.'
  }
}

/**
 * A roots part: the curve whose crossings are the roots — the question's own equation when a
 * maths line holds one, else (x − r₁)(x − r₂)… from the answer — shown once it is earned, since
 * the crossings are the answer.
 */
function inferRoots(q: PQQuestion, text: QuestionText, values: Record<string, number>): AutoVisual | null {
  const part = q.parts.find((p) => p.type === 'roots')
  if (!part || part.type !== 'roots') return null
  const found = functionIn(text.maths)
  let expr = found && !found.integral ? found.expr : null
  if (!expr) {
    const roots = part.answer.map((e) => {
      try {
        return evaluateInVariables(e, values)
      } catch {
        return NaN
      }
    })
    if (roots.length === 0 || !roots.every(Number.isFinite)) return null
    expr = roots.map((r) => (r < 0 ? `(x + ${lit(-r)})` : `(x - ${lit(r)})`)).join(' * ')
  }
  return { rule: 'roots', visual: { picture: { kind: 'curve', expr } }, revealsAnswer: true, why: 'PhysLab drew the curve whose crossings with the x-axis are the roots.' }
}

// ---------------------------------------------------------------------------
// The fallback: the given quantities on a number line
// ---------------------------------------------------------------------------

/** A variable name a student reads as a letter of the question: one letter, maybe one digit. */
const PLAIN_NAME = /^[A-Za-zα-ωΑ-Ω]\d?$/

/**
 * The question's given numbers on one labelled number line (the variables it shows, by name and
 * value, else the numbers in its words), leaving out any that equals an answer, so the line
 * never marks the answer. Empty when a question gives no numbers at all, or gives only its
 * answer: then there is nothing to draw, and `hasVisual` says so.
 */
export function numberLineOf(q: PQQuestion, variant: Variant): AutoVisual {
  const { values } = variant
  const answers = answersOf(q, values)
  const shown = [q.statement, ...q.parts.map((p) => p.prompt)].join('\n')
  const items: { label: string; value: string }[] = []
  for (const v of q.variables) {
    if (v.def.kind === 'expr' || !shown.includes(`{${v.name}}`)) continue
    const x = values[v.name]
    if (!Number.isFinite(x) || holdsAny([x], answers.numbers)) continue
    // A name is shown only when it reads as a letter of the question ("a", "v2", "θ"); an
    // author's identifier (len_ab, w_1, coeff1 — common in Numbas imports) is programming
    // syntax, so such a mark carries its value and unit alone.
    items.push({ label: PLAIN_NAME.test(v.name) ? `${v.name} = {${v.name}}` : `{${v.name}}`, value: lit(x) })
  }
  if (items.length === 0) {
    const text = readQuestion(q, values)
    const seen: number[] = []
    // The parts' prompts too: an imported or bundled question often gives its numbers there
    // ("What is 12 + 4?" under a bare "Answer it.").
    for (const m of [text.statement, ...text.prompts].join(' ').matchAll(BARE_NUMBER)) {
      const x = numberOf(m)
      if (!Number.isFinite(x) || holdsAny([x], answers.numbers) || seen.some((y) => same(x, y))) continue
      seen.push(x)
      // No label: the drawing writes the value through format.ts. lit(x) as a label showed
      // 0.00000015 as "1.5e-7", a JavaScript number, not 1.5×10⁻⁷.
      items.push({ label: '', value: lit(x) })
    }
  }
  const visual: Visual = { picture: { kind: 'numberline', items } }
  return { rule: 'numberline', visual, early: visual, revealsAnswer: false, why: "PhysLab put the question's numbers on a number line." }
}

// ---------------------------------------------------------------------------
// The two entry points
// ---------------------------------------------------------------------------

/**
 * A picture inferred from the question's numbers and words, or null when no rule reads it. The
 * rules run in order — SUVAT, a vertical throw, a free-body diagram, a function in the maths, a
 * normal distribution, a vector or roots answer — and the first that reads the question wins.
 */
export function inferVisual(q: PQQuestion, variant: Variant): AutoVisual | null {
  const { values } = variant
  const text = readQuestion(q, values)
  const qs = quantitiesIn(text.all)
  const answers = answersOf(q, values)
  return (
    inferSuvat(text, qs, values, answers) ??
    inferVertical(text, qs, values, answers) ??
    inferFreeBody(text, qs, values, answers) ??
    inferNormal(text, answers) ??
    inferFunction(text, answers) ??
    inferVectorAnswer(q, values) ??
    inferRoots(q, text, values)
  )
}

// ---------------------------------------------------------------------------
// An author's own picture, before the answer
// ---------------------------------------------------------------------------

/** Powers of ten a picture's axes are drawn to ("tenths of an amp", "litres", "hundreds of metres"). */
const TENS = [-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6].map((k) => 10 ** k)

/**
 * Whether a curve drawn to a scale shows an answer: its value, or its digits at the scale its
 * label names — the series circuit's V–I line ends at 10 × the current ("tenths of an amp"),
 * Charles's law at 1000 × the new volume ("litres"). A motion is drawn in SI and is never scaled:
 * a car braking for 7 s must not be held back because 7 × 10 is the 70 m it covers.
 */
/**
 * The shown values that are not simply a number the question gives: a stone dropped from 19.6 m
 * starts its x–t curve at 19.6, and that is the height the statement wrote, even when g = 9.8
 * makes the impact speed 19.6 m/s too. A value worked out from the givens (the echo's peak, the
 * journey's 40 s) stays in. A zero is the origin, a start from rest or the axis every curve begins
 * on: counted, it would hold back every picture of a question whose answer is 0.
 */
// Compares signed, not by size: a given of +5 must not hide a drawn −5, or a picture could show
// the exact value of an answer that happens to share a given's magnitude with the opposite sign
// before the question is answered. The sign is checked first: below about 5×10⁻⁷ `same` is an
// absolute test, so a given of +1×10⁻⁷ would otherwise still hide a drawn −1×10⁻⁷ (and a given
// of 0 a drawn 1×10⁻⁷).
const sameSign = (g: number, x: number): boolean => (g === 0 ? x === 0 : g > 0 === x > 0)
const fresh = (shown: number[], given: number[]): number[] => shown.filter((x) => Math.abs(x) > 1e-12 && !given.some((g) => sameSign(g, x) && same(g, x)))

const holdsSizeOf = (shown: number[], answers: Answer[]): boolean => holdsSize(shown, answers)

/**
 * As drawn, leaving out the givens (`fresh`); at another power of ten, every value — at 10 Ω the
 * V–I line ends at x = V, the given, which in "tenths of an amp" is the current asked for. A
 * height of exactly 1 is a wave's or a shape's "not to scale" height, not a reading: at every
 * power of ten it would hold any answer that is one (100 Hz, 10 m/s).
 */
const holdsScaledOf = (shown: number[], given: number[], answers: Answer[]): boolean =>
  holdsSize(fresh(shown, given), answers) || holdsSize(TENS.flatMap((k) => shown.filter((s) => s !== 0 && Math.abs(s) !== 1).map((s) => s * k)), answers)

/** The values a label writes in: each {name} is the variable's value. */
function labelValues(label: string, values: Record<string, number>): number[] {
  return [...label.matchAll(/\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}/g)].map((m) => values[m[1]]).filter((v) => Number.isFinite(v))
}

/** A formula in x with the question's values in; NaN where it has none. */
const inXOf = (expr: string, values: Record<string, number>) => (x: number): number => {
  try {
    return evaluateInVariables(expr, { ...values, x })
  } catch {
    return NaN
  }
}

/** Where a curve drawn from a to b crosses the axis and turns: marks a student reads off the grid. */
function turnsAndRoots(f: (x: number) => number, a: number, b: number): number[] {
  const out: number[] = []
  if (!(b > a)) return out
  // Where it crosses the y-axis: "y = 3x + 5 — where does it cut the y-axis?" is read off at x = 0.
  if (a < 0 && b > 0) out.push(f(0))
  const n = 400
  let px = a
  let py = f(a)
  let pd = NaN
  for (let i = 1; i <= n; i++) {
    const x = a + ((b - a) * i) / n
    const y = f(x)
    if (Number.isFinite(py) && Number.isFinite(y)) {
      if (py * y < 0) {
        const r = bisect(f, px, x)
        out.push(r)
      }
      const d = y - py
      if (Number.isFinite(pd) && pd * d < 0) {
        const t = extremum(f, Math.max(a, px - (b - a) / n), x, pd < 0)
        out.push(t, f(t))
      }
      pd = d
    }
    px = x
    py = y
  }
  return out
}

/** Where a curve on [from, to] starts and ends: the numbers its axes are read at. */
const endsOf = (f: (x: number) => number, from: number, to: number): number[] => [from, to, f(from), f(to)].filter((v) => Number.isFinite(v))

/** A picture's numbers, or undefined when one cannot be read (the player then says so itself). */
function numberOrNaN(expr: string | undefined, values: Record<string, number>): number {
  if (expr === undefined) return NaN
  try {
    return evaluateInVariables(expr, values)
  } catch {
    return NaN
  }
}

/**
 * The part of an author's picture that may be drawn before the answer, or undefined when all of
 * it shows the answer. What each kind shows: a curve its ends and — drawn with its roots and
 * turning points marked — those too; a shaded region its ends and the heights there (its area
 * label waits already); a tangent its point; a normal curve its mean, spread and ends; an arrow its
 * components, size and direction (the chip at its tip writes them); a number-line mark its value.
 * A list of curves or arrows or marks loses the ones that hold an answer and keeps the rest; a
 * single curve or region is all or nothing. Dots are what a counting question asks the student to
 * count, so they are the question, not its answer.
 */
function earlyPicture(pic: PQPicture, values: Record<string, number>, answers: Answers, given: number[]): PQPicture | undefined {
  const num = (e: string | undefined): number => numberOrNaN(e, values)
  const holdsSize = (shown: number[], a: Answer[]): boolean => holdsSizeOf(fresh(shown, given), a)
  const holdsScaled = (shown: number[], a: Answer[]): boolean => holdsScaledOf(shown, given, a)
  /**
   * Its ends and its label's numbers at any scale the axes may be drawn to; where it crosses and
   * turns only as drawn — a wave's height "not to scale" is 1, and at ten times that it is no
   * answer anyone reads off the drawing.
   */
  const curveHolds = (expr: string, from: number, to: number, label = ''): boolean => {
    const f = inXOf(expr, values)
    const turns = Number.isFinite(from) && Number.isFinite(to) ? turnsAndRoots(f, from, to).filter((v) => Number.isFinite(v)) : []
    return (
      holdsScaled([...endsOf(f, from, to), ...labelValues(label, values)], answers.numbers) ||
      holdsSize(turns, answers.numbers) ||
      (Number.isFinite(from) && Number.isFinite(to) && to > from && curveIsAnswer(f, answers, from, to))
    )
  }
  switch (pic.kind) {
    case 'curve': {
      const from = pic.xMin === undefined ? -10 : num(pic.xMin)
      const to = pic.xMax === undefined ? 10 : num(pic.xMax)
      // A lone curve is drawn with its roots and turning points marked.
      return curveHolds(pic.expr, from, to) ? undefined : pic
    }
    case 'piecewise': {
      const held = pic.pieces.some((p) => {
        const from = num(p.from)
        const to = num(p.to)
        return curveHolds(p.expr, from, to)
      })
      return held ? undefined : pic
    }
    case 'curves': {
      const kept = pic.items.filter((it) => {
        const from = it.from === undefined ? -5 : num(it.from)
        const to = it.to === undefined ? 5 : num(it.to)
        return !curveHolds(it.expr, from, to, it.label)
      })
      return kept.length === 0 ? undefined : kept.length === pic.items.length ? pic : { ...pic, items: kept }
    }
    case 'between': {
      const from = num(pic.from)
      const to = num(pic.to)
      const up = inXOf(pic.upper, values)
      const low = inXOf(pic.lower, values)
      const shown = [from, to, up(from), up(to), low(from), low(to), ...labelValues(pic.label ?? '', values)].filter((v) => Number.isFinite(v))
      // Drawn as the formulas say, never to a labelled scale: ½kx² is not "held" by kx at x = 0.2.
      return holdsSize(shown, answers.numbers) ? undefined : pic
    }
    case 'tangent': {
      const at = num(pic.at)
      const f = inXOf(pic.expr, values)
      return holdsSize([at, f(at)].filter((v) => Number.isFinite(v)), answers.numbers) || curveIsAnswer(f, answers, -10, 10) ? undefined : pic
    }
    case 'normal': {
      const shown = [num(pic.mean), num(pic.sd), num(pic.from), num(pic.to)].filter((v) => Number.isFinite(v))
      return holdsSize(shown, answers.numbers) ? undefined : pic
    }
    case 'vectors': {
      const kept = pic.items.filter((it) => {
        const c = it.v.map(num)
        if (!c.every((v) => Number.isFinite(v))) return true
        const size = Math.hypot(...c)
        const turn = (Math.atan2(c[1] ?? 0, c[0] ?? 0) * 180) / Math.PI
        return !holdsSize([...c, size, turn, (turn + 360) % 360], answers.numbers)
      })
      return kept.length === 0 ? undefined : kept.length === pic.items.length ? pic : { ...pic, items: kept }
    }
    case 'numberline': {
      const kept = pic.items.filter((it) => !holdsSize([num(it.value), ...labelValues(it.label, values)].filter((v) => Number.isFinite(v)), answers.numbers))
      return kept.length === 0 ? undefined : kept.length === pic.items.length ? pic : { ...pic, items: kept }
    }
    case 'dots':
      return pic
  }
}

/**
 * The plots of an author's motion that may be drawn before the answer, or undefined when every
 * one shows it. What a plot shows: where each stretch starts and ends on it, the time of every
 * join and of the end (time runs along x, so the axis gives it away — "How long?" for a 40 s
 * journey), and where the motion turns (the moment v crosses 0, the top height and the rise to it).
 * An early motion sends no readings to Lab Data: its table holds every number the plots hold.
 */
function earlyMotion(m: PQMotion, values: Record<string, number>, answers: Answers, given: GivenQuantity[]): PQMotion | undefined {
  const pieces = motionPieces(m, values)
  if (pieces.problems.length > 0 || pieces.stretches.length === 0) return undefined
  const first = pieces.stretches[0]
  // A given is no secret only in its own role: a stone dropped from 19.6 m (g = 9.8) lands at
  // 19.6 m/s, and the v–t line ending there hands over the speed, though the height was given.
  const givenAs = (unit: UnitId): number[] => given.filter((g) => g.unit !== undefined && unitsCompatible(g.unit, unit)).map((g) => g.si)
  const times: number[] = [pieces.total, ...pieces.stretches.flatMap((s) => [s.t0, s.t1])]
  const values_: Record<PQMotion['plots'][number], { shown: number[]; unit: UnitId }[]> = { 'x-t': [], 'v-t': [], 'a-t': [] }
  const at = (p: PQMotion['plots'][number], unit: UnitId, ...shown: number[]) => values_[p].push({ shown, unit })
  for (const s of pieces.stretches) {
    const tau = s.t1 - s.t0
    const x1 = s.x0 + s.v0 * tau + 0.5 * s.a * tau * tau
    at('x-t', 'm', s.x0, x1, x1 - s.x0, x1 - first.x0)
    at('v-t', 'm/s', s.v0, s.v0 + s.a * tau)
    at('a-t', 'm/s²', s.a)
    // A v–t line's slope is read off it from its ends. When the question gives how long the
    // stretch lasts, that is the working it asks for (a braking car's 20 m/s in 7 s); when it does
    // not, the drawing supplies the time and the slope is the answer handed over (a block sliding
    // to rest in a distance: a = −2.88 m/s² off the line).
    if (!givenAs('s').some((g) => same(g, tau))) at('v-t', 'm/s²', s.a)
    // The moment the stretch turns, if it does: v is 0 there and x is at its top (or bottom).
    const turn = s.a === 0 ? NaN : -s.v0 / s.a
    if (turn > 1e-9 && turn < tau - 1e-9) {
      const xTop = s.x0 + s.v0 * turn + 0.5 * s.a * turn * turn
      times.push(s.t0 + turn)
      at('x-t', 'm', xTop, xTop - s.x0, xTop - first.x0)
    }
  }
  const held = (p: PQMotion['plots'][number]): boolean =>
    holdsSize(fresh(times, givenAs('s')), answers.numbers) || values_[p].some((v) => holdsSize(fresh(v.shown, givenAs(v.unit)), answers.numbers))
  const safe = m.plots.filter((p) => !held(p))
  if (safe.length === 0) return undefined
  return { ...m, plots: safe, sampleEvery: undefined }
}

/** The values the question gives the student, as it writes them. */
function givenValues(q: PQQuestion, values: Record<string, number>): number[] {
  const text = [q.statement, ...q.parts.map((p) => p.prompt)].join('\n')
  return q.variables.filter((v) => new RegExp(`\\{\\s*${escape(v.name)}\\s*\\}`).test(text)).map((v) => values[v.name]).filter((v) => Number.isFinite(v))
}

/** A number the question gives the student, in SI, with the unit it was given in. */
interface GivenQuantity {
  si: number
  unit?: UnitId
}

/** The values the question gives the student: each variable its statement or a prompt writes in. */
function givenQuantities(q: PQQuestion, values: Record<string, number>): GivenQuantity[] {
  const text = [q.statement, ...q.parts.map((p) => p.prompt)].join('\n')
  return q.variables
    .filter((v) => new RegExp(`\\{\\s*${escape(v.name)}\\s*\\}`).test(text) && Number.isFinite(values[v.name]))
    .map((v) => {
      const info = v.unit ? UNITS[v.unit] : undefined
      return { si: info ? values[v.name] * info.toSI + (info.offset ?? 0) : values[v.name], unit: v.unit }
    })
}

/**
 * What an author's picture and motion may show before the answer is earned (the experiment is
 * run by the student, so it is always open). Each is absent when all of it holds an answer.
 */
export function authoredEarly(q: PQQuestion, variant: Variant): { picture?: PQPicture; motion?: PQMotion } {
  const given = givenQuantities(q, variant.values)
  const answers = answersOf(q, variant.values)
  // A picture's axes are named only in its labels, so any given counts there; the numbers a
  // picture shows are the question's own, as written, not converted.
  const picture = q.picture ? earlyPicture(q.picture, variant.values, answers, givenValues(q, variant.values)) : undefined
  const motion = q.motion ? earlyMotion(q.motion, variant.values, answers, given) : undefined
  return { ...(picture ? { picture } : {}), ...(motion ? { motion } : {}) }
}

/**
 * What a question shows: the author's picture, motion or experiment when there is one; else a
 * picture inferred from its numbers; else its given quantities on a number line — which is empty
 * for a question with no numbers ("Which of these is a vector?"), so `hasVisual` is false there.
 */
export function visualOf(q: PQQuestion, variant: Variant): VisualPlan {
  if (q.picture || q.motion || q.sandbox) return { source: 'authored', picture: q.picture, motion: q.motion, sandbox: q.sandbox, early: authoredEarly(q, variant) }
  const auto = inferVisual(q, variant)
  return auto ? { source: 'inferred', auto } : { source: 'fallback', auto: numberLineOf(q, variant) }
}

/**
 * Whether the plan has anything to draw. A fallback number line with no marks has not: the
 * player offered it as ready and drawing it only threw "This question gives no numbers…".
 */
export function hasVisual(plan: VisualPlan): boolean {
  if (plan.source === 'authored') return plan.picture !== undefined || plan.motion !== undefined || plan.sandbox !== undefined
  const pic = plan.auto.visual.picture
  return !(pic?.kind === 'numberline' && pic.items.length === 0)
}

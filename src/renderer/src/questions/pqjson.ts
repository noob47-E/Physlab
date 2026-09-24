// PQJSON: the question file. A Numbas-v10.0-compatible subset plus PhysLab's own bindings.
// Every expression string here is mathjs syntax on the app's own `math` instance, never JME;
// JME is translated at import time. Nothing in this file touches React, the DOM or a store.

import { fmtPrecise } from '../math/format'

export type LicenseId = 'CC BY 4.0' | 'CC BY-SA 4.0' | 'CC0 1.0'

export interface License {
  id: LicenseId
  /** Who to credit: the author's name(s), or the project. */
  holder: string
  /** Where it came from (the Numbas item URL, the OpenStax repo@commit, "PhysLab"). */
  source?: string
  /** The exact licence string as found at the source (kept verbatim for the NOTICE). */
  found?: string
}

export type UnitId =
  | 'none' | 'm' | 'cm' | 'mm' | 'km' | 's' | 'ms' | 'min' | 'h' | 'kg' | 'g'
  | 'N' | 'J' | 'W' | 'Pa' | 'm/s' | 'km/h' | 'm/s²' | 'rad/s' | 'rad' | '°' | 'Hz'
  | 'C' | 'V' | 'A' | 'Ω' | 'K' | '°C' | 'mol' | 'N·m' | 'kg·m/s' | 'm²' | 'm³'

export type VariableDef =
  /** An integer or decimal drawn from from..to in steps of step; `exclude` lists values never drawn (0, say). */
  | { kind: 'range'; from: number; to: number; step: number; exclude?: number[] }
  /** One of a short list. */
  | { kind: 'list'; items: number[] }
  /** Worked out from other variables, in mathjs syntax; may not refer to itself, directly or through others. */
  | { kind: 'expr'; expr: string }

export interface PQVariable {
  /** A letter or a short word: [A-Za-z][A-Za-z0-9_]*, never a mathjs reserved word (pi, e, i, sqrt …). */
  name: string
  def: VariableDef
  unit?: UnitId
  /** What it stands for, for the author's own eyes: "initial speed". */
  description?: string
}

/** How close an answer must be to the part's own: a band round it. */
export interface BandTolerance {
  kind: 'relative' | 'absolute'
  /** relative: a fraction (0.02 = 2 %); absolute: in the part's unit. */
  value: number
}

/**
 * Format 2, number parts only (rung 5): the student states their own uncertainty ("0.5591 ±
 * 0.0001") and the answer is right when the Eₙ test passes, |x − xref| ≤ √(u² + uref²).
 */
export interface StatedTolerance {
  kind: 'stated'
  /** The reference value's own standard uncertainty, a mathjs expression in the variables. */
  uref: string
  /** The largest uncertainty accepted, as a fraction of the student's value (default 0.1 = 10 %), so "± 1000" cannot pass. */
  maxRelU?: number
}

export type Tolerance = BandTolerance | StatedTolerance

/**
 * Format 2: error carried forward (Numbas adaptive marking). A part that `uses` an earlier part's
 * answer is also marked with the student's own earlier answer put in place of that variable.
 */
export interface ECF {
  uses: { part: number; variable: string }[]
  /** originalfirst: the true values first, the student's own if that fails; alwaysreplace: only the student's own. */
  strategy: 'originalfirst' | 'alwaysreplace'
  /** Marks taken off an answer that is right only by error carried forward. */
  penalty: number
}

/** Fields any part may carry in format 2. */
export interface PartCommon {
  ecf?: ECF
  /** A mathjs condition in the question's variables; the part is shown and counted only when it holds. */
  showIf?: string
}

export interface NamedTrap {
  /** mathjs expression in the variables: the wrong answer a known mistake gives. */
  value: string
  /** Plain sentence: "You used g = 10; this question says 9.8." */
  why: string
}

export type PQPart = (
  | {
      type: 'number'
      prompt: string
      /** mathjs expression in the variables. */
      answer: string
      unit: UnitId
      tolerance: Tolerance
      /** Reused from math/problems.ts AnswerField: a direction is checked round the circle, an angle is not. */
      kind?: 'number' | 'angle' | 'direction'
      traps?: NamedTrap[]
      marks: number
    }
  | {
      type: 'expression'
      prompt: string
      /** mathjs expression in the variables and the free symbols. */
      answer: string
      /** The free symbols the student may use, e.g. ['x']. */
      symbols: string[]
      /** Sampling range for the numeric check; default [1, 2]. */
      sampleRange?: [number, number]
      marks: number
    }
  | {
      type: 'choice'
      prompt: string
      /** At least one correct; several correct = "pick all that apply". */
      choices: { text: string; correct: boolean; why?: string }[]
      shuffle: boolean
      /** When set, choices are generated per variant from the rule set instead of listed (see §4.3). */
      distractors?: { correct: string; unit: UnitId; rules: DistractorRule[] }
      marks: number
    }
  // --- format 2 -----------------------------------------------------------
  | {
      type: 'vector'
      prompt: string
      /** Two or three mathjs expressions: the i, j (and k) components. */
      answer: string[]
      unit: UnitId
      /** A band on the distance between the two vectors (relative: of the answer's size). */
      tolerance: Tolerance
      marks: number
    }
  | {
      type: 'matrix'
      prompt: string
      /** Rows of mathjs expressions, all the same length. */
      answer: string[][]
      tolerance: Tolerance
      /** An entry may be typed as a fraction, 3/5 for 0.6. */
      allowFractions?: boolean
      /** Marks shared out entry by entry instead of all or nothing. */
      markPerCell?: boolean
      marks: number
    }
  | {
      type: 'roots'
      prompt: string
      /** Every root, as mathjs expressions; an empty list means "no real roots". */
      answer: string[]
      unit: UnitId
      tolerance: Tolerance
      /** A repeated root must then be typed as often as it repeats; otherwise it counts once. */
      multiplicity?: boolean
      marks: number
    }
  | {
      type: 'function'
      prompt: string
      /** The names of the free variable and of the function: "x" and "y", "t" and "v". */
      x: string
      y: string
      /** "lhs = rhs" in x, y, y′, y″ and the question's variables. */
      ode: string
      initial: { at: string; order: 0 | 1; value: string }[]
      /** The author's own solution, shown when the answer is revealed. */
      model: string
      sampleRange?: [number, number]
      marks: number
    }
  | {
      /** Rung 5: shown with a model proof and a self-check list, never marked offline. */
      type: 'proof'
      prompt: string
      model: string
      selfCheck: string[]
      /** Always 0 — the parser refuses anything else. Typed as a number so a part can be copied with new marks while its type changes. */
      marks: number
    }
  | {
      /** Rung 1: fill the target outline with Lego pieces. */
      type: 'lego'
      prompt: string
      /** The target outline's corners, each an [x, y] pair of expressions. */
      target: [string, string][]
      pieces: number
      marks: number
    }
) &
  PartCommon

/** The part kinds of format 1, which 0.7.0 reads. */
export const FORMAT1_PART_TYPES = ['number', 'expression', 'choice'] as const

/** A part 0.7.0 could already hold: number (with a band tolerance), expression or choice. */
export type Format1Part = (Extract<PQPart, { type: 'number' }> & { tolerance: BandTolerance }) | Extract<PQPart, { type: 'expression' | 'choice' }>

/** Every other part: the four answer kinds of format 2, proof and lego. */
export type Format2Part = Exclude<PQPart, { type: (typeof FORMAT1_PART_TYPES)[number] }>

/**
 * Whether a part is one that format 1 already had, with nothing of format 2 in its marking (a
 * stated tolerance). Code written for 0.7.0's three kinds narrows with this, so a new kind never
 * falls into its "else it must be a choice" branch.
 */
export function isFormat1Part(p: PQPart): p is Format1Part {
  if (p.type === 'number') return p.tolerance.kind !== 'stated'
  return p.type === 'expression' || p.type === 'choice'
}

/** The default band: one marking tolerance for the whole app, 2 % (PROGRAM §5, Idea 12). */
export const DEFAULT_BAND: BandTolerance = { kind: 'relative', value: 0.02 }

/**
 * A tolerance as a band. A stated (Eₙ) tolerance has no band of its own; where a band is needed
 * anyway — the Author's band editor, a Numbas range — it reads as the 2 % default.
 */
export const bandOf = (t: Tolerance): BandTolerance => (t.kind === 'stated' ? DEFAULT_BAND : t)

/**
 * The same format-2 part with `f` applied to every formula in it (answers, the ODE and its
 * starting values, the model, the Lego corners); prompts and sentences are left alone. Renaming
 * a variable goes through this, so a vector's components follow a renamed `F` like a number's
 * answer does.
 */
export function mapFormat2Formulas(p: Format2Part, f: (formula: string) => string): Format2Part {
  switch (p.type) {
    case 'vector':
    case 'roots':
      return { ...p, answer: p.answer.map(f) }
    case 'matrix':
      return { ...p, answer: p.answer.map((row) => row.map(f)) }
    case 'function':
      return { ...p, ode: f(p.ode), model: f(p.model), initial: p.initial.map((c) => ({ ...c, at: f(c.at), value: f(c.value) })) }
    case 'lego':
      return { ...p, target: p.target.map(([x, y]) => [f(x), f(y)] as [string, string]) }
    case 'proof':
      return p
  }
}

/**
 * Any part with `f` applied to the format-2 fields that name a variable outside its answer — the
 * condition that shows it, a stated part's reference uncertainty — and `rename` to each variable
 * an earlier answer is carried into. Renaming a variable goes through this too: a field left on
 * the old name makes the saved file refuse to open ("carries an answer into 'a', but 'a' is not
 * one of its variables").
 */
export function mapPartNames(p: PQPart, f: (formula: string) => string, rename: (name: string) => string): PQPart {
  const out: PQPart = { ...p }
  if (p.showIf !== undefined) out.showIf = f(p.showIf)
  if (p.ecf !== undefined) out.ecf = { ...p.ecf, uses: p.ecf.uses.map((u) => ({ ...u, variable: rename(u.variable) })) }
  if (out.type === 'number' && out.tolerance.kind === 'stated') out.tolerance = { ...out.tolerance, uref: f(out.tolerance.uref) }
  return out
}

/** Every formula in a format-2 part, in the order `mapFormat2Formulas` visits them. */
export function format2Formulas(p: Format2Part): string[] {
  const out: string[] = []
  mapFormat2Formulas(p, (s) => {
    out.push(s)
    return s
  })
  return out
}

export type DistractorRule =
  | 'sign'             // −answer
  | 'reciprocal'       // 1/answer
  | 'slope-for-value'  // TUG-K: reads the height where the slope was asked
  | 'value-for-slope'  // TUG-K: reads the slope where the height was asked
  | 'area-for-value'   // TUG-K: area under the curve instead of the value
  | 'ignore-initial'   // McDermott: drops v₀ or x₀
  | 'g-10'             // uses g = 10
  | 'half-double'      // ×2 or ÷2 (a lost ½)
  | 'power-of-ten'     // ×10 or ÷10

export type FadingLevel = 'worked' | 'half' | 'solo'

export interface PQStep {
  /** Spoken sentence, may contain {var} chips. */
  head: string
  /** LaTeX, may contain {var} chips; substituted values are formatted through formatQuantity. */
  tex?: string
  rule?: string
  note?: string
  /** 'half' fading blanks the moves marked `blank`; 'solo' shows only the heads. */
  blank?: boolean
  /** Set when the step is to be produced by the engine at play time rather than written. */
  auto?: { engine: 'pure'; job: string; input: string } | { engine: 'vectors'; solver: string; args: string[] }
}

export interface PQSteps {
  level: FadingLevel
  items: PQStep[]
}

export type PQPicture =
  | { kind: 'curve'; expr: string; xMin?: string; xMax?: string }
  | { kind: 'piecewise'; pieces: { expr: string; from: string; to: string }[] }
  | { kind: 'between'; upper: string; lower: string; from: string; to: string; label?: string }
  | { kind: 'tangent'; expr: string; at: string }

export type MotionSegment =
  | { kind: 'rest'; duration: string }
  | { kind: 'uniform'; duration: string; v: string }
  | { kind: 'accelerate'; duration: string; a: string }

export interface PQMotion {
  /** Segments run in order from x0, v0 (default 0). Every string is a mathjs expression in the variables. */
  x0?: string
  v0?: string
  segments: MotionSegment[]
  /** Which graphs to draw; each becomes one piecewise GraphObj. */
  plots: ('x-t' | 'v-t' | 'a-t')[]
  /** Also fill a Lab Data table with readings every `sampleEvery` seconds. */
  sampleEvery?: string
}

export interface PQSandbox {
  /** A sim/presets.ts id. */
  preset: string
  /** Body names in the preset's build() and the force on each, as three expressions in t (and the variables). */
  actuators: { body: string; force: [string, string, string]; from?: string; until?: string }[]
  /** Which body's readings to send to Lab Data. */
  record?: string
}

export interface PQQuestion {
  id: string
  title: string
  /** Plain text with {var} chips; a line starting with "$$" is display maths (LaTeX with chips). */
  statement: string
  variables: PQVariable[]
  parts: PQPart[]
  steps?: PQSteps
  picture?: PQPicture
  motion?: PQMotion
  sandbox?: PQSandbox
  license: License
  tags?: string[]
  /**
   * Provenance of an import; absent on a question written in PhysLab. `changes` (format 2) lists
   * what PhysLab altered, since CC BY and BY-SA require saying so.
   */
  imported?: { format: 'numbas'; itemUrl?: string; contributors?: string[]; changes?: string[] }
  /** Format 2: keep drawing variants until this mathjs condition in the variables holds, at most `maxRuns` times. */
  condition?: { when: string; maxRuns: number }
  /** Format 2: the depth-ladder rung, 1 (first look) to 5 (research) — a search label, never a lock. */
  rung?: 1 | 2 | 3 | 4 | 5
  /** Format 2: the id of a question that goes one rung deeper. */
  deeper?: string
}

/** The file formats this PhysLab reads. A file is written in the lowest one that holds it. */
export type PQVersion = 1 | 2

export interface PQFile {
  app: 'PhysLab'
  format: 'pqjson'
  /** On writing, `serializePQFile` sets this from what the questions use (`formatVersionOf`). */
  version: PQVersion
  questions: PQQuestion[]
}

// ---------------------------------------------------------------------------
// The closed lists the parser checks against
// ---------------------------------------------------------------------------

/** The three licences a question may carry; anything else is refused at import and at load. */
export const LICENSE_IDS: readonly LicenseId[] = ['CC BY 4.0', 'CC BY-SA 4.0', 'CC0 1.0']

export const UNIT_IDS: readonly UnitId[] = [
  'none', 'm', 'cm', 'mm', 'km', 's', 'ms', 'min', 'h', 'kg', 'g',
  'N', 'J', 'W', 'Pa', 'm/s', 'km/h', 'm/s²', 'rad/s', 'rad', '°', 'Hz',
  'C', 'V', 'A', 'Ω', 'K', '°C', 'mol', 'N·m', 'kg·m/s', 'm²', 'm³'
]

/**
 * Names a variable may not take: mathjs constants and the functions a student meets. A variable
 * called `e` would silently shadow Euler's number in every formula of the question, and one
 * called `sqrt` would make `sqrt(2)` an implicit product of a number and a bracket.
 */
export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  'pi', 'e', 'i', 'E', 'PI', 'Infinity', 'NaN', 'true', 'false',
  'sqrt', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'log10', 'exp',
  'abs', 'round', 'floor', 'ceil', 'mod', 'min', 'max'
])

/** The shape a variable name must have: a letter, then letters, digits or underscores. */
export const VARIABLE_NAME = /^[A-Za-z][A-Za-z0-9_]*$/

/**
 * Whether the `{…}` group starting at `at` in some LaTeX is a command's argument — the `{avg}` of
 * `\mathrm{avg}` — rather than a chip. Such a group is LaTeX, never a number to fill in: the
 * braking train's v_{\mathrm{avg}} went out to Numbas as \mathrm\var{avg} and could not come back.
 */
export function isCommandArgument(tex: string, at: number): boolean {
  // Straight against the name only: in `\times {t}` the space ends the command and {t} is a chip.
  return /\\[A-Za-z]+$/.test(tex.slice(0, at))
}

// ---------------------------------------------------------------------------
// Reading a file
// ---------------------------------------------------------------------------

/** Numbers quoted in a refusal sentence are not measurements, so the plain default precision does. */
const SENTENCE_PRECISION = { decimals: 4, precisionMode: 'dp' as const }
const num = (v: number): string => fmtPrecise(v, SENTENCE_PRECISION)

const NOT_A_FILE = 'This is not a PhysLab question file.'

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isUnit = (v: unknown): v is UnitId => isStr(v) && (UNIT_IDS as readonly string[]).includes(v)

/**
 * Reads a `.pqjson` text into a PQFile, or throws ONE plain sentence saying what is wrong. The
 * sentence is what the student or teacher sees, so it names the question and the field in words
 * — never a JSON path. Only the things a later stage cannot survive are checked here: the
 * licence (nothing without one may be bundled), the closed lists (units, licence ids), variable
 * names (a bad name breaks every formula that uses it), duplicate names, marks, ranges and an
 * empty part list. Formulas themselves are checked when the variables are drawn.
 */
export function parsePQFile(text: string): PQFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error(NOT_A_FILE)
  }
  if (!isObj(raw) || raw.app !== 'PhysLab' || raw.format !== 'pqjson' || raw.version === undefined) {
    throw new Error(NOT_A_FILE)
  }
  // Only a genuinely different number is "another format"; a version that is not a number at all
  // ("1" in quotes) would otherwise be refused as "format 1; this PhysLab reads format 1".
  if (!isNum(raw.version)) throw new Error(NOT_A_FILE)
  // A version-1 file holding a format-2 field is read as it stands rather than refused: the
  // fields say what the file is, and the next save writes the version that matches them.
  if (raw.version !== 1 && raw.version !== 2) {
    throw new Error(`This question file is format ${num(raw.version)}; this PhysLab reads formats 1 and 2.`)
  }
  if (!Array.isArray(raw.questions)) throw new Error(NOT_A_FILE)

  raw.questions.forEach((q, i) => checkQuestion(q, i))
  return raw as unknown as PQFile
}

/** "Question 'Projectile on a cliff'" — or "Question 3" when the file gave it no title. */
function label(q: Record<string, unknown>, index: number): string {
  return isStr(q.title) && q.title.trim() !== '' ? `Question '${q.title}'` : `Question ${num(index + 1)}`
}

function checkQuestion(q: unknown, index: number): void {
  if (!isObj(q)) throw new Error(`Question ${num(index + 1)} is not a question PhysLab can read.`)
  const who = label(q, index)

  // The licence comes first: a question without one may not be used whatever else it holds.
  // No licence object, or one with no id in it, both say nothing; only a named licence outside
  // the pool is quoted back as "is licensed '…'".
  if (!isObj(q.license) || !isStr(q.license.id) || q.license.id.trim() === '') {
    throw new Error(`${who} says nothing about its licence, so PhysLab cannot use it.`)
  }
  if (!(LICENSE_IDS as readonly string[]).includes(q.license.id)) {
    throw new Error(`${who} is licensed '${q.license.id}', which PhysLab may not bundle.`)
  }
  if (!isStr(q.license.holder)) throw new Error(`${who} does not say who holds its licence.`)

  if (!isStr(q.id) || q.id === '') throw new Error(`${who} has no id.`)
  if (!isStr(q.title)) throw new Error(`${who} has no title.`)
  if (!isStr(q.statement)) throw new Error(`${who} has no statement.`)
  if (!Array.isArray(q.variables)) throw new Error(`${who} has no list of variables.`)
  if (!Array.isArray(q.parts)) throw new Error(`${who} has no list of parts.`)
  if (q.parts.length === 0) throw new Error(`${who} has no parts to answer.`)

  const seen = new Set<string>()
  for (const v of q.variables) checkVariable(v, who, seen)
  q.parts.forEach((p, i) => checkPart(p, i, who, seen))
  checkFormat2Question(q, who)
}

/** The question-level fields of format 2: a condition on the variants, the rung, the deeper link, the list of changes. */
function checkFormat2Question(q: Record<string, unknown>, who: string): void {
  if (q.condition !== undefined) {
    const c = q.condition
    if (!isObj(c) || !isStr(c.when) || c.when.trim() === '' || !isNum(c.maxRuns) || !Number.isInteger(c.maxRuns) || c.maxRuns < 1) {
      throw new Error(`${who} keeps only some of its variants but does not say which: it needs a condition and a whole number of tries.`)
    }
  }
  if (q.rung !== undefined && !(isNum(q.rung) && Number.isInteger(q.rung) && q.rung >= 1 && q.rung <= 5)) {
    const shown = isNum(q.rung) ? num(q.rung) : String(q.rung)
    throw new Error(`${who} is on rung ${shown}; the rungs go from 1 to 5.`)
  }
  if (q.deeper !== undefined && (!isStr(q.deeper) || q.deeper.trim() === '')) {
    throw new Error(`${who} points to a deeper question but does not say which one.`)
  }
  if (isObj(q.imported) && q.imported.changes !== undefined && !(Array.isArray(q.imported.changes) && q.imported.changes.every(isStr))) {
    throw new Error(`${who} lists the changes made to it, but not as sentences.`)
  }
}

function checkVariable(v: unknown, who: string, seen: Set<string>): void {
  if (!isObj(v) || !isStr(v.name)) throw new Error(`${who} has a variable with no name.`)
  const name = v.name
  if (!VARIABLE_NAME.test(name)) {
    throw new Error(`${who} has a variable named '${name}'; a name is a letter, then letters, digits or underscores.`)
  }
  if (RESERVED_NAMES.has(name)) {
    throw new Error(`${who} uses '${name}' as a variable name, but that already means something in maths.`)
  }
  if (seen.has(name)) throw new Error(`${who} names two variables '${name}'.`)
  seen.add(name)

  if (v.unit !== undefined && !isUnit(v.unit)) {
    throw new Error(`${who} uses a unit PhysLab does not know: ${String(v.unit)}.`)
  }

  const def = v.def
  if (!isObj(def)) throw new Error(`${who} does not say how '${name}' is chosen.`)
  if (def.kind === 'range') {
    if (!isNum(def.from) || !isNum(def.to) || !isNum(def.step)) {
      throw new Error(`${who} gives '${name}' a range that is not three numbers (from, to, step).`)
    }
    if (def.step <= 0 || def.from > def.to) {
      throw new Error(
        `${who} gives '${name}' a range from ${num(def.from)} to ${num(def.to)} in steps of ${num(def.step)}, which PhysLab cannot draw from.`
      )
    }
    if (def.exclude !== undefined && !(Array.isArray(def.exclude) && def.exclude.every(isNum))) {
      throw new Error(`${who} lists values '${name}' must avoid, but they are not all numbers.`)
    }
  } else if (def.kind === 'list') {
    if (!Array.isArray(def.items) || !def.items.every(isNum)) {
      throw new Error(`${who} gives '${name}' a list that is not all numbers.`)
    }
    if (def.items.length === 0) throw new Error(`${who} gives '${name}' an empty list to choose from.`)
  } else if (def.kind === 'expr') {
    if (!isStr(def.expr) || def.expr.trim() === '') throw new Error(`${who} gives '${name}' no formula.`)
  } else {
    throw new Error(`${who} chooses '${name}' in a way PhysLab does not know: ${String(def.kind)}.`)
  }
}

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr)
const isWhole = (v: unknown): v is number => isNum(v) && Number.isInteger(v)

/** A band tolerance (relative or absolute), as every part with a tolerance but a stated number part carries. */
function isBand(t: unknown): boolean {
  return isObj(t) && (t.kind === 'relative' || t.kind === 'absolute') && isNum(t.value)
}

/** A vector, matrix or roots part's tolerance: a band, never a stated uncertainty. */
function checkBand(t: unknown, who: string, kind: string): void {
  if (isObj(t) && t.kind === 'stated') {
    throw new Error(`${who} asks for a stated uncertainty on a ${kind} part; only a number part can be marked that way.`)
  }
  if (!isBand(t)) throw new Error(`${who} has a ${kind} part that does not say how close an answer must be.`)
}

function checkPart(p: unknown, index: number, who: string, names: ReadonlySet<string>): void {
  if (!isObj(p) || !isStr(p.type)) throw new Error(`${who} has a part PhysLab cannot read.`)
  if (!isStr(p.prompt)) throw new Error(`${who} has a part with no prompt.`)
  const shown = isNum(p.marks) ? num(p.marks) : String(p.marks)
  // A proof is shown with its model and a self-check list, never marked offline, so it is the
  // one part worth nothing; any other part worth 0 would be a question nobody can score on.
  if (p.type === 'proof') {
    if (p.marks !== 0) throw new Error(`${who} gives a proof part ${shown} marks; a proof is shown, never marked, so it is worth 0.`)
  } else if (!isNum(p.marks) || p.marks <= 0) {
    throw new Error(`${who} has a part worth ${shown} marks; every part must be worth more than 0.`)
  }
  checkPartCommon(p, index, who, names)
  switch (p.type) {
    case 'number':
      if (!isStr(p.answer)) throw new Error(`${who} has a number part with no answer.`)
      if (!isUnit(p.unit)) throw new Error(`${who} uses a unit PhysLab does not know: ${String(p.unit)}.`)
      if (isObj(p.tolerance) && p.tolerance.kind === 'stated') {
        if (!isStr(p.tolerance.uref) || p.tolerance.uref.trim() === '') {
          throw new Error(`${who} has a number part marked against the student's own uncertainty, but gives no uncertainty for its own answer.`)
        }
        if (p.tolerance.maxRelU !== undefined && !(isNum(p.tolerance.maxRelU) && p.tolerance.maxRelU > 0)) {
          throw new Error(`${who} has a number part whose largest accepted uncertainty is not a number above 0.`)
        }
        return
      }
      if (!isBand(p.tolerance)) {
        throw new Error(`${who} has a number part that does not say how close an answer must be.`)
      }
      return
    case 'expression':
      if (!isStr(p.answer)) throw new Error(`${who} has an expression part with no answer.`)
      if (!Array.isArray(p.symbols) || !p.symbols.every(isStr)) {
        throw new Error(`${who} has an expression part that does not list the symbols a student may use.`)
      }
      return
    case 'choice':
      if (!Array.isArray(p.choices)) throw new Error(`${who} has a choice part with no choices.`)
      if (isObj(p.distractors) && !isUnit(p.distractors.unit)) {
        throw new Error(`${who} uses a unit PhysLab does not know: ${String(p.distractors.unit)}.`)
      }
      return
    case 'vector':
      if (!isStrings(p.answer) || p.answer.length < 2 || p.answer.length > 3) {
        throw new Error(`${who} has a vector part whose answer is not two or three components.`)
      }
      if (!isUnit(p.unit)) throw new Error(`${who} uses a unit PhysLab does not know: ${String(p.unit)}.`)
      checkBand(p.tolerance, who, 'vector')
      return
    case 'matrix': {
      const rows = p.answer
      if (!Array.isArray(rows) || rows.length === 0 || !rows.every((r) => isStrings(r) && r.length > 0 && r.length === (rows[0] as unknown[]).length)) {
        throw new Error(`${who} has a matrix part whose answer is not rows of entries, all the same length.`)
      }
      checkBand(p.tolerance, who, 'matrix')
      for (const flag of [p.allowFractions, p.markPerCell]) {
        if (flag !== undefined && typeof flag !== 'boolean') throw new Error(`${who} has a matrix part with a setting that is neither yes nor no.`)
      }
      return
    }
    case 'roots':
      // An empty list is allowed: it is the answer "no real roots".
      if (!isStrings(p.answer)) throw new Error(`${who} has a roots part whose answer is not a list of roots.`)
      if (!isUnit(p.unit)) throw new Error(`${who} uses a unit PhysLab does not know: ${String(p.unit)}.`)
      checkBand(p.tolerance, who, 'roots')
      if (p.multiplicity !== undefined && typeof p.multiplicity !== 'boolean') {
        throw new Error(`${who} has a roots part that does not say yes or no to counting repeated roots.`)
      }
      return
    case 'function':
      if (!isStr(p.x) || !isStr(p.y) || !VARIABLE_NAME.test(p.x) || !VARIABLE_NAME.test(p.y) || p.x === p.y) {
        throw new Error(`${who} has a function part that does not name its variable and its function.`)
      }
      if (!isStr(p.ode) || p.ode.split('=').length !== 2) throw new Error(`${who} has a function part whose equation does not have one = sign.`)
      if (!Array.isArray(p.initial) || !p.initial.every((c) => isObj(c) && isStr(c.at) && isStr(c.value) && (c.order === 0 || c.order === 1))) {
        throw new Error(`${who} has a function part with a starting condition PhysLab cannot read.`)
      }
      if (!isStr(p.model)) throw new Error(`${who} has a function part with no model answer.`)
      if (p.sampleRange !== undefined) {
        const r = p.sampleRange
        if (!Array.isArray(r) || r.length !== 2 || !isNum(r[0]) || !isNum(r[1]) || r[0] >= r[1]) {
          throw new Error(`${who} has a function part whose checking range is not two numbers, the smaller first.`)
        }
      }
      return
    case 'proof':
      if (!isStr(p.model) || p.model.trim() === '') throw new Error(`${who} has a proof part with no model proof.`)
      if (!isStrings(p.selfCheck)) throw new Error(`${who} has a proof part whose self-check list is not a list of sentences.`)
      return
    case 'lego':
      if (!Array.isArray(p.target) || p.target.length < 3 || !p.target.every((c) => isStrings(c) && c.length === 2)) {
        throw new Error(`${who} has a Lego part whose target outline is not three or more corners.`)
      }
      if (!isWhole(p.pieces) || p.pieces < 1) throw new Error(`${who} has a Lego part that does not say how many pieces it has.`)
      return
    default:
      throw new Error(`${who} has a part of a kind PhysLab does not know: ${p.type}.`)
  }
}

/** What any part may carry in format 2: an answer carried forward from an earlier part, and a condition for showing it. */
function checkPartCommon(p: Record<string, unknown>, index: number, who: string, names: ReadonlySet<string>): void {
  const n = num(index + 1)
  if (p.showIf !== undefined && (!isStr(p.showIf) || p.showIf.trim() === '')) {
    throw new Error(`${who} shows part ${n} only under a condition, but the condition is empty.`)
  }
  if (p.ecf === undefined) return
  const e = p.ecf
  if (!isObj(e) || !Array.isArray(e.uses) || e.uses.length === 0) {
    throw new Error(`${who} carries an earlier answer into part ${n} but does not say which.`)
  }
  for (const u of e.uses) {
    if (!isObj(u) || !isWhole(u.part) || !isStr(u.variable)) {
      throw new Error(`${who} carries an earlier answer into part ${n} but does not say which part and which variable.`)
    }
    // Only an earlier part: a later one has not been answered when this one is marked.
    if (u.part < 0 || u.part >= index) {
      throw new Error(`${who} has part ${n} use the answer to part ${num(u.part + 1)}, which does not come before it.`)
    }
    if (!names.has(u.variable)) {
      throw new Error(`${who} carries an answer into '${u.variable}' in part ${n}, but '${u.variable}' is not one of its variables.`)
    }
  }
  if (e.strategy !== 'originalfirst' && e.strategy !== 'alwaysreplace') {
    throw new Error(`${who} carries an answer forward into part ${n} in a way PhysLab does not know: ${String(e.strategy)}.`)
  }
  if (!isNum(e.penalty) || e.penalty < 0 || (isNum(p.marks) && e.penalty > p.marks)) {
    throw new Error(`${who} takes ${isNum(e.penalty) ? num(e.penalty) : String(e.penalty)} marks off part ${n} for a carried-forward answer, which the part cannot give.`)
  }
}

// ---------------------------------------------------------------------------
// Which format a file needs
// ---------------------------------------------------------------------------

/** The picture kinds and distractor rules format 1 already had; anything else is format 2. */
const FORMAT1_PICTURES: readonly string[] = ['curve', 'piecewise', 'between', 'tangent']
const FORMAT1_RULES: readonly string[] = [
  'sign', 'reciprocal', 'slope-for-value', 'value-for-slope', 'area-for-value', 'ignore-initial', 'g-10', 'half-double', 'power-of-ten'
]

/**
 * The lowest format that holds this question. Written against the format-1 lists rather than
 * the format-2 additions, so a picture kind or distractor rule another track adds later is
 * format 2 without this function hearing of it — and 0.7.0, which cannot read it, is never
 * handed it as a format-1 file.
 */
export function questionFormat(q: PQQuestion): PQVersion {
  if (q.condition !== undefined || q.rung !== undefined || q.deeper !== undefined || q.imported?.changes !== undefined) return 2
  if (q.picture !== undefined && !FORMAT1_PICTURES.includes(q.picture.kind)) return 2
  for (const p of q.parts) {
    if (!isFormat1Part(p) || p.ecf !== undefined || p.showIf !== undefined) return 2
    if (p.type === 'choice' && p.distractors?.rules.some((r) => !FORMAT1_RULES.includes(r))) return 2
  }
  return 1
}

/** 2 when any question uses a format-2 field, else 1 — so a plain file still opens in 0.7.0. */
export function formatVersionOf(file: Pick<PQFile, 'questions'>): PQVersion {
  return file.questions.some((q) => questionFormat(q) === 2) ? 2 : 1
}

// ---------------------------------------------------------------------------
// Writing a file
// ---------------------------------------------------------------------------

/**
 * A fresh id. `crypto.randomUUID` is what the app has; the fallback is for a runtime without it,
 * so that a test or a very old browser still gets a distinct id rather than a crash.
 */
function newId(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const hex = (n: number): string => Math.floor(Math.random() * 16 ** n).toString(16).padStart(n, '0')
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${hex(4)}-${hex(8)}${hex(4)}`
}

/** What the author starts from: one number part, worth one mark, checked to 2 %. */
export function blankQuestion(): PQQuestion {
  return {
    id: newId(),
    title: '',
    statement: '',
    variables: [],
    parts: [{ type: 'number', prompt: '', answer: '', unit: 'none', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }],
    license: { id: 'CC BY 4.0', holder: '' }
  }
}

/**
 * Keys that lead when an object is written, so a file reads top-down the way a person thinks
 * of it (what it is, then what it is called, then the rest); every other key follows in
 * alphabetical order. A fixed order means two saves of the same question give the same text.
 */
const LEADING_KEYS = ['app', 'format', 'version', 'id', 'title', 'name', 'type', 'kind']

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered)
  if (!isObj(value)) return value
  const keys = Object.keys(value).sort((a, b) => {
    const ia = LEADING_KEYS.indexOf(a)
    const ib = LEADING_KEYS.indexOf(b)
    const ra = ia === -1 ? LEADING_KEYS.length : ia
    const rb = ib === -1 ? LEADING_KEYS.length : ib
    return ra !== rb ? ra - rb : a < b ? -1 : a > b ? 1 : 0
  })
  const out: Record<string, unknown> = {}
  for (const k of keys) if (value[k] !== undefined) out[k] = ordered(value[k])
  return out
}

/**
 * The file text: two-space JSON with a stable key order, so it diffs cleanly between saves. The
 * version is worked out here from what the questions use, never taken from the object: the
 * Author, the bank and the Numbas import all build files as version 1, and a vector part saved
 * under that number would reach 0.7.0 as "a part of a kind PhysLab does not know".
 */
export function serializePQFile(f: PQFile): string {
  return JSON.stringify(ordered({ ...f, version: formatVersionOf(f) }), null, 2)
}

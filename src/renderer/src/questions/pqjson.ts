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

export interface Tolerance {
  kind: 'relative' | 'absolute'
  /** relative: a fraction (0.02 = 2 %); absolute: in the part's unit. */
  value: number
}

export interface NamedTrap {
  /** mathjs expression in the variables: the wrong answer a known mistake gives. */
  value: string
  /** Plain sentence: "You used g = 10; this question says 9.8." */
  why: string
}

export type PQPart =
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
  /** Provenance of an import; absent on a question written in PhysLab. */
  imported?: { format: 'numbas'; itemUrl?: string; contributors?: string[] }
}

export interface PQFile {
  app: 'PhysLab'
  format: 'pqjson'
  version: 1
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
  if (raw.version !== 1) throw new Error(`This question file is format ${num(raw.version)}; this PhysLab reads format 1.`)
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
  for (const p of q.parts) checkPart(p, who)
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

function checkPart(p: unknown, who: string): void {
  if (!isObj(p) || !isStr(p.type)) throw new Error(`${who} has a part PhysLab cannot read.`)
  if (!isStr(p.prompt)) throw new Error(`${who} has a part with no prompt.`)
  if (!isNum(p.marks) || p.marks <= 0) {
    const shown = isNum(p.marks) ? num(p.marks) : String(p.marks)
    throw new Error(`${who} has a part worth ${shown} marks; every part must be worth more than 0.`)
  }
  switch (p.type) {
    case 'number':
      if (!isStr(p.answer)) throw new Error(`${who} has a number part with no answer.`)
      if (!isUnit(p.unit)) throw new Error(`${who} uses a unit PhysLab does not know: ${String(p.unit)}.`)
      if (!isObj(p.tolerance) || (p.tolerance.kind !== 'relative' && p.tolerance.kind !== 'absolute') || !isNum(p.tolerance.value)) {
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
    default:
      throw new Error(`${who} has a part of a kind PhysLab does not know: ${p.type}.`)
  }
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

/** The file text: two-space JSON with a stable key order, so it diffs cleanly between saves. */
export function serializePQFile(f: PQFile): string {
  return JSON.stringify(ordered(f), null, 2)
}

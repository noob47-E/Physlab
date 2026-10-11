// Bridging Numbas marking criteria (tolerances, precision bands, gap-fills, adaptive marking)
// and PhysLab PQPart / ECF definitions.
// Pure moves from questions/numbas.ts (CW10a). Headless: no React, no store, no DOM.

import { math, symbolsOf } from '../../math/expr'
import { fmtPrecise } from '../../math/format'
import { isRecord as isObj } from '../../core/schema'
import {
  DEFAULT_BAND,
  type PQPart,
  type PQQuestion,
  type PQStep,
  type PQVariable,
  type Tolerance
} from '../pqjson'
import { jmeToMath, type JmeNode } from './jme'

export type Obj = Record<string, unknown>

/** Raised inside one question to skip it; `reason` completes "Question 'T' was skipped: it …". */
export class Skip extends Error {
  constructor(readonly reason: string) {
    super(reason)
  }
}

/**
 * Exact case first, then all-lowercase: Numbas's own rule for reading a part, because files
 * from older editors wrote `minvalue` and `checkingtype` where the schema now says `minValue`.
 */
export function tryGet(o: Obj, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(o, key)) return o[key]
  const lower = key.toLowerCase()
  return Object.prototype.hasOwnProperty.call(o, lower) ? o[lower] : undefined
}

export const asString = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')

/** Numbers quoted in a report sentence are not measurements, so the plain default precision does. */
const SENTENCE_PRECISION = { decimals: 4, precisionMode: 'dp' as const }
export const num = (v: number): string => fmtPrecise(v, SENTENCE_PRECISION)

/** What one question's text is read against: its variables, and any it adds for a `{a*b}` in the text. */
export interface TextContext {
  vars: PQVariable[]
  names: Set<string>
  /** Counts the variables made for expressions in the text, so their names stay distinct. */
  made: number
  /**
   * Variables defined as a matrix written out entry by entry (`matrix([1, 2], [3, 4])`). PhysLab's
   * variables are numbers, so these are not variables at all: a matrix part that names one reads
   * its entries from here, and nothing else may use it.
   */
  matrices: Map<string, JmeNode>
}

/** The closing line `toExam` writes for a number part's unit, read back so a set round-trips. */
export const UNIT_LINE = /^Give your answer in (.+)\.$/

// --- the tolerance of a number part ------------------------------------------

/** The one number an expression comes to when it mentions no variable, else null. */
function constantValue(expr: string): number | null {
  try {
    const node = math.simplify(expr)
    if (symbolsOf(node).length > 0) return null
    const v = Number(node.evaluate({}))
    return Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

/** The canonical forms `toExam` writes now: `(X) - abs(X) * (t)` / `(X) + abs(X) * (t)`. */
const REL_MIN = /^\((.*)\) - abs\(\1\) \* \(([0-9.eE+-]+)\)$/
const REL_MAX = /^\((.*)\) \+ abs\(\1\) \* \(([0-9.eE+-]+)\)$/
/**
 * The form older PhysLab exports wrote: `(X) * (1 - t)` / `(X) * (1 + t)`. It flips its own bounds
 * for a negative X, so `toExam` no longer writes it, but a file saved before this fix still reads
 * back correctly.
 */
const REL_MIN_OLD = /^\((.*)\) \* \(1 - ([0-9.eE+-]+)\)$/
const REL_MAX_OLD = /^\((.*)\) \* \(1 \+ ([0-9.eE+-]+)\)$/
const ABS_MIN = /^\((.*)\) - ([0-9.eE+-]+)$/
const ABS_MAX = /^\((.*)\) \+ ([0-9.eE+-]+)$/

/**
 * The precision a part states: a number, or a string that spells one ("2": the editor writes it
 * so). Blank (empty, spaces, null) or anything else is not stated, and comes back NaN. Number() read
 * the blank ones as 0, which for significant figures is a band of 500 %.
 */
export function statedPrecision(raw: unknown): number {
  if (typeof raw === 'number') return raw
  return typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
}

/**
 * The band a stated precision gives: half a unit in the last decimal place asked for (absolute),
 * or in the last significant figure (relative). Null for any other precision, or one that is not a
 * number.
 */
export function precisionBand(precisionType: string, precision: number | null): Tolerance | null {
  if (precision === null || !Number.isFinite(precision)) return null
  if (precisionType === 'dp') return { kind: 'absolute', value: 0.5 * 10 ** -precision }
  if (precisionType === 'sigfig') return { kind: 'relative', value: 0.5 * 10 ** (1 - precision) }
  return null
}

export interface NumberAnswer {
  answer: string
  tolerance: Tolerance
  /** Set when the tolerance had to be assumed. */
  note?: string
}

/**
 * Numbas marks a number part right when it lies between two JME expressions; PhysLab wants one
 * answer and one tolerance that holds for every variant. Equal bounds are the answer itself
 * (checked to the part's precision, or exactly when it names none: Numbas accepts only a number
 * between the bounds, "the smallest / largest value accepted as correct", so equal bounds leave
 * that one number — the matrix part reads the same way). Otherwise the answer is the
 * midpoint and the tolerance is recovered when the gap, or the gap as a fraction of the sum,
 * simplifies to a number; when neither does, 2 % is assumed and the report says so.
 */
export function readNumberAnswer(minText: string, maxText: string, precisionType: string, precision: number | null): NumberAnswer {
  let rel = [REL_MIN.exec(minText), REL_MAX.exec(maxText)]
  if (!(rel[0] && rel[1])) rel = [REL_MIN_OLD.exec(minText), REL_MAX_OLD.exec(maxText)]
  if (rel[0] && rel[1] && rel[0][1] === rel[1][1] && rel[0][2] === rel[1][2]) {
    return { answer: jmeToMath(rel[0][1]), tolerance: { kind: 'relative', value: Number(rel[0][2]) } }
  }
  const abs = [ABS_MIN.exec(minText), ABS_MAX.exec(maxText)]
  if (abs[0] && abs[1] && abs[0][1] === abs[1][1] && abs[0][2] === abs[1][2]) {
    return { answer: jmeToMath(abs[0][1]), tolerance: { kind: 'absolute', value: Number(abs[0][2]) } }
  }
  const min = jmeToMath(minText)
  const max = jmeToMath(maxText)
  if (min === max) {
    const band = precisionBand(precisionType, precision)
    if (band) return { answer: min, tolerance: band }
    // A precision the file asks for and this cannot read (a variable's name — 14 cached questions
    // write "precision": "precision" — an expression, or none given) is not "no precision": exact
    // would mark every answer typed at the stated precision wrong. The app's 2 % stands in, and
    // the report says so, as for a gap it cannot read below.
    if (precisionType === 'dp' || precisionType === 'sigfig') {
      return {
        answer: min,
        tolerance: { ...DEFAULT_BAND },
        note: `PhysLab could not read how many ${precisionType === 'dp' ? 'decimal places' : 'significant figures'} it asks for, so it accepts ${num(2)} %`
      }
    }
    // No precision at all: not the app's 2 %, which marked 101 right for an exact 100. A band of 0
    // still forgives the arithmetic's last bit (checkAnswer's noise floor), so a typed 1/3 matches
    // a worked-out 1/3.
    return { answer: min, tolerance: { kind: 'absolute', value: 0 } }
  }
  const midpoint = `((${min}) + (${max})) / 2`
  let answer = midpoint
  try {
    answer = math.simplify(midpoint).toString()
  } catch {
    // Keep the long form: the midpoint is still right, only longer than it need be.
  }
  const gap = constantValue(`((${max}) - (${min})) / 2`)
  if (gap !== null) return { answer, tolerance: { kind: 'absolute', value: Math.abs(gap) } }
  const fraction = constantValue(`((${max}) - (${min})) / ((${max}) + (${min}))`)
  if (fraction !== null) return { answer, tolerance: { kind: 'relative', value: Math.abs(fraction) } }
  return {
    answer,
    tolerance: { ...DEFAULT_BAND },
    note: `PhysLab could not read how close an answer must be, so it accepts ${num(2)} %`
  }
}

export const nonEmpty = (v: unknown): boolean =>
  (isObj(v) && Object.keys(v).length > 0) || (Array.isArray(v) && v.length > 0) || (typeof v === 'string' && v.trim() !== '')

export interface QuestionRead {
  parts: PQPart[]
  steps: PQStep[]
  statementLines: string[]
  notes: string[]
  /** Numbas's name for a part (`p0`, `p1g0`) → the index of the PhysLab part it became. */
  paths: Map<string, number>
  /** Adaptive marking to turn into `ecf` once every part is read and every name above is known. */
  carried: { index: number; label: string; source: Obj; inherited: boolean }[]
}

export const NUMBAS_MAX_RUNS = 100

/** Whether a Numbas part carries adaptive marking of its own: a non-empty list of replacements. */
export const replaces = (p: Obj): boolean => {
  const r = tryGet(p, 'variableReplacements')
  return Array.isArray(r) && r.length > 0
}

/** Numbas's name for a part in words, the way the report names parts: `p1g0` → "part 2, part 1". */
function pathWords(path: string): string {
  const m = /^p(\d+)(?:g(\d+))?$/.exec(path)
  if (!m) return 'a step inside another part'
  return m[2] === undefined ? `part ${num(Number(m[1]) + 1)}` : `part ${num(Number(m[1]) + 1)}, part ${num(Number(m[2]) + 1)}`
}

/**
 * Numbas's adaptive marking → PhysLab's error carried forward, once every part is read. Each
 * replacement names a variable and the part whose answer stands in for it; that part must have
 * come in as an earlier number part, or the question is skipped — marking the later part without
 * the student's own numbers would take marks Numbas gives. A gap-fill's replacements are handed to
 * its gaps, and a gap is never marked with its own answer or a later gap's, so those are passed by.
 */
export function readCarried(read: QuestionRead, ctx: TextContext): void {
  for (const c of read.carried) {
    const part = read.parts[c.index]
    const reps = tryGet(c.source, 'variableReplacements') as unknown[]
    const uses: { part: number; variable: string }[] = []
    for (const r of reps) {
      if (!isObj(r)) continue
      const variable = asString(r.variable)
      const path = asString(r.part)
      if (ctx.matrices.has(variable)) throw new Skip(`marks ${c.label} with an earlier answer put in place of the matrix ${variable}, which PhysLab can only take as an answer`)
      if (!ctx.names.has(variable)) throw new Skip(`marks ${c.label} with an earlier answer put in place of ${variable || 'a nameless variable'}, but there is no variable called that`)
      const k = read.paths.get(path)
      if (k === undefined) throw new Skip(`marks ${c.label} with the answer to ${pathWords(path)}, which PhysLab does not ask as one number`)
      if (k >= c.index) {
        if (c.inherited) continue
        throw new Skip(`marks ${c.label} with the answer to ${pathWords(path)}, which does not come before it`)
      }
      if (read.parts[k].type !== 'number') throw new Skip(`marks ${c.label} with the answer to ${pathWords(path)}, which is not a number`)
      if (r.must_go_first === true) read.notes.push(`${c.label} waits in Numbas until ${pathWords(path)} is answered; PhysLab marks it with whatever that part holds`)
      if (!uses.some((u) => u.part === k && u.variable === variable)) uses.push({ part: k, variable })
    }
    if (uses.length === 0) continue
    const strategy = asString(tryGet(c.source, 'variableReplacementStrategy')) === 'alwaysreplace' ? 'alwaysreplace' : 'originalfirst'
    const asked = Number(tryGet(c.source, 'adaptiveMarkingPenalty'))
    let penalty = Number.isFinite(asked) && asked > 0 ? asked : 0
    if (penalty > part.marks) {
      read.notes.push(`${c.label} takes ${num(penalty)} marks off an answer marked with an earlier one, more than it is worth; PhysLab takes ${num(part.marks)}`)
      penalty = part.marks
    }
    part.ecf = { uses, strategy, penalty }
  }
}

/**
 * Adaptive marking for Numbas export: PhysLab `ecf` → Numbas `variableReplacements`. A part this
 * file leaves out cannot be written, and the description says the part is marked without it.
 * Nor can a use of a part that is not one number: Numbas would put a vector's list where the
 * part's number goes, and `readCarried` refuses it, so the round trip dropped the whole
 * question without a word.
 */
export function writeCarried(q: PQQuestion, written: { index: number; part: Obj }[]): string[] {
  const paths = new Map(written.map((w, j) => [w.index, `p${j}`]))
  const notes: string[] = []
  for (const { index, part } of written) {
    const ecf = q.parts[index].ecf
    if (!ecf) continue
    const kept = ecf.uses.filter((u) => paths.has(u.part) && q.parts[u.part].type === 'number')
    for (const u of ecf.uses) {
      const said = `PhysLab marks part ${num(index + 1)} with the answer to part ${num(u.part + 1)}`
      if (!paths.has(u.part)) notes.push(`${said}, which this Numbas file leaves out, so Numbas marks it without.`)
      else if (q.parts[u.part].type !== 'number') notes.push(`${said}, which is not a single number Numbas can carry forward, so Numbas marks it without.`)
    }
    if (kept.length === 0) continue
    part.variableReplacements = kept.map((u) => ({ variable: u.variable, part: paths.get(u.part), must_go_first: false }))
    part.variableReplacementStrategy = ecf.strategy
    part.adaptiveMarkingPenalty = ecf.penalty
  }
  return notes
}

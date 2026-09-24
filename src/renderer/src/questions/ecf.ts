// Error carried forward (Numbas "adaptive marking") and parts shown only under a condition. A
// student whose part (a) was wrong but who used it correctly in part (b) has done part (b) right:
// part (b) is marked again with their own (a) put in place of the variable it came from, every
// formula that hangs off that variable worked out again, and — if that makes (b) right — it is
// ticked, with a note saying whose number it was marked with and the author's penalty taken off.
// Headless: no React, no store, no DOM. The plain marking of a part is the caller's, passed in
// (Practice passes the player's checkPlayedPart), so this file imports the player for its types
// only: checkPlayedPart stays plain, and nothing calls back and forth between the two.

import { parseAnswer, type Check } from '../math/checkAnswer'
import { inDegrees, math, preprocess } from '../math/expr'
import type { MeasureSettings } from '../math/format'
import { checkFunctionPart } from './odeCheck'
import { toAbsoluteTol } from './parts'
import type { ECF, PQPart, PQQuestion, UnitId } from './pqjson'
import type { Played, PlayedPart } from './player'
import { convertQuantity, formatQuantity, unitFromTail } from './units'
import { conditionHolds, orderVariables, partLetter, RANDOM_RANGE, type Variant } from './variables'

const CANNOT_MARK = 'PhysLab could not work out the answer to this part, so it cannot mark it.'

export { partLetter }

// ---------------------------------------------------------------------------
// Working the variables out again
// ---------------------------------------------------------------------------

/**
 * The question's values with some variables replaced (`overrides`, a student's own earlier
 * answers) and every formula variable worked out again from them, in `orderVariables` order, so a
 * formula two steps downstream of the replaced one follows it too (a wrong a gives a wrong s gives
 * a wrong average speed s/t). Drawn variables — a range, a list, a formula that draws with
 * randomRange — keep their drawn values: a student's answer changes what follows from it, never
 * what the question gave them.
 */
export function rederive(q: PQQuestion, variant: Variant, overrides: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...variant.values }
  const ordered = orderVariables(q.variables)
  // A question whose variables cannot be ordered never drew a variant worth marking against; the
  // replacement alone is the best that can be done, and its problems are already shown.
  if (!('order' in ordered)) return { ...out, ...overrides }
  const byName = new Map(q.variables.map((v) => [v.name, v]))
  for (const name of ordered.order) {
    if (Object.prototype.hasOwnProperty.call(overrides, name)) {
      out[name] = overrides[name]
      continue
    }
    const def = byName.get(name)!.def
    if (def.kind !== 'expr' || def.expr.includes(RANDOM_RANGE)) continue
    try {
      // In degrees and through `preprocess`, exactly as drawVariables worked it out the first time.
      out[name] = Number(inDegrees(() => math.evaluate(preprocess(def.expr), { ...out })))
    } catch {
      out[name] = NaN
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// A student's earlier answer as a number
// ---------------------------------------------------------------------------

/**
 * The number a student's answer to a part stands for, in that part's own unit — what error
 * carried forward puts in place of the variable. "−4 m/s²" is −4 for a part in m/s², "50 cm" is
 * 0.5 for a part in m. Null for anything that is not one number (a blank box, a vector, words).
 */
export function answerValue(part: PQPart, text: string): number | null {
  if (!text.trim()) return null
  const unit: UnitId = part.type === 'number' || part.type === 'roots' || part.type === 'vector' ? part.unit : 'none'
  const tail = unitFromTail(text)
  if (tail.unit !== null) {
    const raw = parseAnswer(tail.value)
    if (raw === null) return null
    if (tail.unit === unit) return raw
    return convertQuantity(raw, tail.unit, unit)
  }
  return parseAnswer(text)
}

// ---------------------------------------------------------------------------
// Marking with the student's own earlier answers
// ---------------------------------------------------------------------------

/** A mark: the verdict and sentence, the marks it earns, and — when the student's own earlier answers were used — a note saying so. */
export interface ECFCheck extends Check {
  /** "Marked using your answer to part (a): −4 m/s²" — shown under the box whenever the student's own numbers decided the mark. */
  ecfNote?: string
  /** Marks earned, after the author's penalty for an answer right only by error carried forward. */
  marks: number
  /** The part's full marks. */
  outOf: number
}

const unitsOf = (q: PQQuestion): Record<string, UnitId | undefined> => Object.fromEntries(q.variables.map((v) => [v.name, v.unit]))

/**
 * The plain marking of one part's answer against a set of values, with no error carried forward:
 * the caller's own (Practice: `(values) => checkPlayedPart(p, answer, played with values, settings)`).
 */
export type PlainMarker = (values: Record<string, number>) => Check

/** One part marked against a given set of values. A function part goes to its equation check; every other kind to the caller's plain marking. */
function markAgainst(p: PlayedPart, answer: string | number[], played: Played, values: Record<string, number>, settings: MeasureSettings, mark: PlainMarker): Check {
  if (p.part.type === 'function') {
    try {
      return checkFunctionPart(Array.isArray(answer) ? '' : answer, p.part, values, unitsOf(played.question), settings)
    } catch {
      return { verdict: 'wrong', message: CANNOT_MARK }
    }
  }
  try {
    return mark(values)
  } catch {
    return { verdict: 'wrong', message: CANNOT_MARK }
  }
}

/** Marks a check earns: a matrix shares its marks out entry by entry, anything else is all or nothing. */
function marksOf(c: Check, outOf: number): number {
  const shared = (c as Check & { marks?: unknown }).marks
  if (typeof shared === 'number' && Number.isFinite(shared)) return shared
  return c.verdict === 'right' ? outOf : 0
}

/**
 * Whether an earlier answer is the question's own value for the variable it stands for, within
 * the earlier part's tolerance. Such an answer is not an error to carry forward: −3.02 for −3 at
 * 2 % was marked right, and part (b) must be marked against the true −3, with no note and no
 * penalty — a student rounding sensibly is not docked for it later.
 */
function earlierIsRight(q: PQQuestion, partIndex: number, truth: number, x: number): boolean {
  if (!Number.isFinite(truth)) return false
  const earlier = q.parts[partIndex]
  const tol = earlier?.type === 'number' ? toAbsoluteTol(earlier, truth) : 0
  return Math.abs(x - truth) <= tol + 1e-9 * Math.max(1, Math.abs(truth))
}

/** The note: "Marked using your answer to part (a): −4 m/s²". */
function noteFor(q: PQQuestion, carried: { part: number; variable: string; value: number }[], settings: MeasureSettings): string {
  const units = unitsOf(q)
  const items = carried.map((c) => {
    const earlier = q.parts[c.part]
    const unit: UnitId = earlier?.type === 'number' ? earlier.unit : (units[c.variable] ?? 'none')
    return `part ${partLetter(c.part)}: ${formatQuantity(c.value, unit, settings)}`
  })
  const lead = items.length === 1 ? 'your answer to' : 'your answers to'
  return `Marked using ${lead} ${items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`}`
}

/**
 * Marks a part, carrying the student's earlier answers forward when the part says so (`ecf`).
 *
 * `earlier` holds the student's answers to earlier parts as numbers in each part's unit (see
 * `answerValue`), by part index. For each variable the part `uses`, an earlier answer that was
 * right keeps the true value; a wrong one replaces it, and `rederive` works everything downstream
 * out again. Then, as in Numbas:
 * - `originalfirst`: marked against the true values; if that is not right, marked again against
 *   the student's own — right that way earns the part's marks less `penalty`, with the note.
 * - `alwaysreplace`: marked against the student's own values only (so the true answer after a
 *   wrong part (a) is wrong), with the note; the penalty is taken off a right answer.
 * A part with no `ecf`, or whose earlier answers were all right or not given, is marked plainly.
 * Error carried forward only ever adds a way to be right under `originalfirst`; it never turns an
 * answer that is right against the true values wrong.
 *
 * `mark` is the part's plain marking against a set of values (see `PlainMarker`); a function part
 * is marked in its own equation here and never reaches it.
 */
export function markWithECF(
  p: PlayedPart,
  answer: string | number[],
  played: Played,
  earlier: ReadonlyMap<number, number>,
  settings: MeasureSettings,
  mark: PlainMarker
): ECFCheck {
  const q = played.question
  const values = played.variant.values
  const outOf = p.part.marks
  const plain = markAgainst(p, answer, played, values, settings, mark)
  const asIs = (c: Check): ECFCheck => ({ ...c, marks: marksOf(c, outOf), outOf })
  const ecf: ECF | undefined = p.part.ecf
  // A choice part's options were generated from the true values when the question was played;
  // marked against other values they would be the wrong options, so it is never re-marked.
  if (ecf === undefined || p.part.type === 'choice') return asIs(plain)
  // Nothing typed, or nothing PhysLab can read: there is no answer for the student's own numbers
  // to decide, so no note hangs under the empty box.
  if (plain.verdict === 'empty' || plain.verdict === 'unreadable') return asIs(plain)

  const overrides: Record<string, number> = {}
  const carried: { part: number; variable: string; value: number }[] = []
  for (const u of ecf.uses) {
    const x = earlier.get(u.part)
    if (x === undefined || !Number.isFinite(x)) continue
    if (earlierIsRight(q, u.part, values[u.variable], x)) continue
    overrides[u.variable] = x
    carried.push({ ...u, value: x })
  }
  if (carried.length === 0) return asIs(plain)
  if (ecf.strategy === 'originalfirst' && plain.verdict === 'right') return asIs(plain)

  const replaced = rederive(q, played.variant, overrides)
  const again = markAgainst(p, answer, played, replaced, settings, mark)
  const ecfNote = noteFor(q, carried, settings)
  if (again.verdict === 'right') {
    return { ...again, ecfNote, marks: Math.max(0, marksOf(again, outOf) - ecf.penalty), outOf }
  }
  // Under alwaysreplace the student's own numbers are the only ones marked against, so the note
  // says whose numbers decided the verdict; under originalfirst the plain verdict stands.
  return ecf.strategy === 'alwaysreplace' ? { ...again, ecfNote, marks: 0, outOf } : asIs(plain)
}

// ---------------------------------------------------------------------------
// Parts shown only when a condition holds
// ---------------------------------------------------------------------------

/**
 * Whether a part is shown (and counted) for these values: a part with no `showIf` always is. A
 * condition PhysLab cannot read shows the part rather than hide it — a hidden part is invisible
 * to the student, while a shown one at worst asks one question too many — and the author's
 * preview names the unreadable condition.
 */
export function partShown(part: PQPart, values: Record<string, number>): boolean {
  if (part.showIf === undefined) return true
  return conditionHolds(part.showIf, values) !== false
}

/** The indices of the parts this variant shows, in order. */
export function shownParts(q: PQQuestion, values: Record<string, number>): number[] {
  return q.parts.flatMap((p, i) => (partShown(p, values) ? [i] : []))
}

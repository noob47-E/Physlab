// The shapes of a question's nested fields, as plain yes-or-no checks on parsed JSON. `parsePQFile`
// used to look only at the top level of each question and part, so a hand-edited file with
// "choices": [null], "traps": {} or steps that were a word opened fine and crashed Problem Sets
// (or the Question Author) when the question came up, while the same question saved inside a .phys
// file was refused at once by core/migrate.ts's own copy of these checks (`partOk`, `PICTURE_OK`,
// `motionOk`, `sandboxOk`, `stepsOk`). Keep the two in step until migrate.ts calls these instead.
// Headless: no React, no store, no DOM. The sentences a teacher reads are pqjson.ts's business;
// this file only says whether a shape is one the Author panel and the player can draw.

import { math } from '../math/expr'
import type { FadingLevel, MotionSegment, PQMotion, PQPicture } from './pqjson'

type Raw = Record<string, unknown>

const isRecord = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr)
/** An optional field: absent, or of its type. A hand-edited `xMin: 0` is not a formula. */
const opt = (v: unknown, ok: (v: unknown) => boolean): boolean => v === undefined || ok(v)
/** A list of records, each passing `ok`. */
const each = (v: unknown, ok: (r: Raw) => boolean): boolean => Array.isArray(v) && v.every((r) => isRecord(r) && ok(r))

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

/** One written option of a choice part: a sentence, whether it is right, and (if it has one) why. */
export const optionOk = (c: unknown): boolean => isRecord(c) && isStr(c.text) && typeof c.correct === 'boolean' && opt(c.why, isStr)

/** Whether any written option is marked right: a part that lists its options needs one to be answerable. */
export const hasRightOption = (choices: readonly unknown[]): boolean => choices.some((c) => isRecord(c) && c.correct === true)

/** A number part's common mistakes: a list, each a wrong value (a formula) and the sentence saying why. */
export const trapsOk = (t: unknown): boolean => each(t, (x) => isStr(x.value) && isStr(x.why))

/**
 * True for a name mathjs itself supplies (pi, e, phi, sin …), which a letter a student may use in an
 * answer cannot take: the same test the Question Author applies to the letters it is given.
 */
export function mathOwnsName(name: string): boolean {
  const t = math.typeOf((math as unknown as Record<string, unknown>)[name])
  return t === 'number' || t === 'Complex' || t === 'boolean' || t === 'function'
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

const LEVELS: readonly unknown[] = ['worked', 'half', 'solo'] satisfies FadingLevel[]

/** A fading level the Solution tab can look up: it indexes a list of three, and an unknown one crashed on `.about`. */
export const stepLevelOk = (level: unknown): boolean => LEVELS.includes(level)

/**
 * A step's `auto` job, down to what the Solution tab reads: an engine step's `input.trim()` and a
 * vector step's `args`.
 */
const autoOk = (a: unknown): boolean =>
  isRecord(a) && ((a.engine === 'pure' && isStr(a.job) && isStr(a.input)) || (a.engine === 'vectors' && isStr(a.solver) && isStrings(a.args)))

/** The list of steps: each a sentence (`head`), with its maths, rule, note, blank flag and engine job when it has them. */
export const stepItemsOk = (items: unknown): boolean =>
  each(items, (st) => isStr(st.head) && opt(st.tex, isStr) && opt(st.rule, isStr) && opt(st.note, isStr) && opt(st.blank, (b) => typeof b === 'boolean') && opt(st.auto, autoOk))

// ---------------------------------------------------------------------------
// Picture, motion, Sandbox scene
// ---------------------------------------------------------------------------

/**
 * Each picture kind, down to the fields the Author panel's scene tab and the player read on their
 * first render: a piecewise picture with no `pieces` once crashed the scene tab at `pieces.map`.
 * Keyed on every kind of `PQPicture`, so a kind added there cannot be forgotten here: the file
 * stops compiling until it has its row.
 */
const PICTURE_OK: Record<PQPicture['kind'], (p: Raw) => boolean> = {
  curve: (p) => isStr(p.expr) && opt(p.xMin, isStr) && opt(p.xMax, isStr),
  piecewise: (p) => each(p.pieces, (s) => isStr(s.expr) && isStr(s.from) && isStr(s.to)),
  between: (p) => isStr(p.upper) && isStr(p.lower) && isStr(p.from) && isStr(p.to) && opt(p.label, isStr),
  tangent: (p) => isStr(p.expr) && isStr(p.at),
  normal: (p) => isStr(p.mean) && isStr(p.sd) && opt(p.from, isStr) && opt(p.to, isStr),
  vectors: (p) => each(p.items, (a) => isStr(a.name) && isStrings(a.v) && opt(a.tail, isStrings) && opt(a.role, (r) => r === 'input' || r === 'result')),
  dots: (p) => isStr(p.count) && opt(p.perRow, isNum),
  curves: (p) => each(p.items, (c) => isStr(c.expr) && isStr(c.label) && opt(c.from, isStr) && opt(c.to, isStr)),
  numberline: (p) => each(p.items, (m) => isStr(m.label) && isStr(m.value))
}

/** Whether `kind` is one of the picture kinds PhysLab draws. */
export const isPictureKind = (kind: unknown): boolean => isStr(kind) && Object.hasOwn(PICTURE_OK, kind)

/** A picture of a known kind with every field that kind needs. */
export const pictureOk = (p: unknown): boolean => isRecord(p) && isPictureKind(p.kind) && PICTURE_OK[p.kind as PQPicture['kind']](p)

const SEGMENT_OK: Record<MotionSegment['kind'], (s: Raw) => boolean> = {
  rest: () => true,
  uniform: (s) => isStr(s.v),
  accelerate: (s) => isStr(s.a)
}
const PLOTS: readonly unknown[] = ['x-t', 'v-t', 'a-t'] satisfies PQMotion['plots']

/** A motion as the scene tab lists its stretches (`segments.map`) and the player plots it. */
export const motionOk = (m: unknown): boolean =>
  isRecord(m) &&
  each(m.segments, (s) => isStr(s.duration) && isStr(s.kind) && Object.hasOwn(SEGMENT_OK, s.kind) && SEGMENT_OK[s.kind as MotionSegment['kind']](s)) &&
  Array.isArray(m.plots) &&
  m.plots.every((x) => PLOTS.includes(x)) &&
  opt(m.x0, isStr) &&
  opt(m.v0, isStr) &&
  opt(m.sampleEvery, isStr)

/** A Sandbox scene as the scene tab lists its pushes (`actuators.map`): each a body and three force formulas. */
export const sandboxOk = (s: unknown): boolean =>
  isRecord(s) &&
  isStr(s.preset) &&
  each(s.actuators, (a) => isStr(a.body) && isStrings(a.force) && a.force.length === 3 && opt(a.from, isStr) && opt(a.until, isStr)) &&
  opt(s.record, isStr)

// Marking the answer kinds of format 2: a vector, a matrix, a set of roots, and a number given
// with its own uncertainty (the Eₙ test). Every checker returns a `Check`, like a number part's,
// and names a known mistake in plain words instead of just saying "no". A wrong "incorrect" does
// the most damage to trust, so every band here errs on the side of a right answer.
// Headless: no React, no store, no DOM.

import type { Check } from '../math/checkAnswer'
import { inDegrees, math, preprocess } from '../math/expr'
import { fmtPrecise, texPrecise, type MeasureSettings } from '../math/format'
import { isReadError, readMatrixCell, readSet, readStated, readVector } from './answerText'
import type { Format2Part, PQPart, Tolerance, UnitId } from './pqjson'
import { bandOf } from './pqjson'
import { convertQuantity, texQuantity, texUnit, UNITS } from './units'

export type Precision = Pick<MeasureSettings, 'decimals' | 'precisionMode'>

type VectorPart = Extract<PQPart, { type: 'vector' }>
type MatrixPart = Extract<PQPart, { type: 'matrix' }>
type RootsPart = Extract<PQPart, { type: 'roots' }>

// The sentences parts.ts uses for the same situations. They are repeated rather than imported
// because parts.ts imports this file for the Eₙ test, and the cycle would load one half-empty.
const WRONG = 'Not quite. Press Hint to see the next step.'
const CANNOT_MARK = 'PhysLab could not work out the answer to this part, so it cannot mark it.'

/** Whole numbers in a sentence ("1 of the 2 roots"). */
const count = (n: number): string => fmtPrecise(n, { decimals: 0, precisionMode: 'dp' })
/** A percentage in a sentence: 16.7, 10. */
const pct = (fraction: number): string => fmtPrecise(fraction * 100, { decimals: 1, precisionMode: 'dp' })

/** A formula of the question's variables, in degrees (parts.ts's `evaluateInVariables`; see above for why it is not imported). */
function valueOf(expr: string, values: Record<string, number>): number {
  return Number(inDegrees(() => math.evaluate(preprocess(expr), { ...values })))
}

/**
 * The half-width of the band round a reference of size `size`. A relative band of a reference
 * that is 0 would be no band at all, and a root worked out as 1e-17 instead of 0 would then turn
 * a student's exact "0" wrong; `floor` is 10⁻⁹ times the size it belongs to (a root's own, the
 * vector's, the matrix's largest entry), far below any rounding a student does and far above
 * the arithmetic's.
 */
function halfWidth(t: Tolerance, size: number, floor: number): number {
  const b = bandOf(t)
  return (b.kind === 'relative' ? Math.abs(size) * b.value : b.value) + floor
}

/** A unit the student typed, as the factor that takes a value into the part's unit — or a sentence. */
function unitFactor(from: UnitId | null, to: UnitId, what: string): number | { error: string } {
  if (from === null || from === to) return 1
  if (to === 'none') return { error: `This box wants just the ${what}, with no unit.` }
  const one = convertQuantity(1, from, to)
  const zero = convertQuantity(0, from, to)
  if (one === null || zero === null) return { error: `That is in ${UNITS[from].name}; this box wants ${UNITS[to].name}.` }
  return one - zero
}

// ---------------------------------------------------------------------------
// A number with a stated uncertainty (rung 5)
// ---------------------------------------------------------------------------

/** The largest uncertainty accepted when the author sets none: 10 % of the student's value. */
export const DEFAULT_MAX_REL_U = 0.1

/**
 * The Eₙ test (ISO/IEC 17043): two results agree when |x − xref| ≤ √(u² + uref²), i.e. Eₙ ≤ 1.
 * `u` and `uref` are standard uncertainties; a value exactly on the edge agrees.
 */
export function enTest(x: number, u: number, xref: number, uref: number): { en: number; ok: boolean } {
  const gap = Math.abs(x - xref)
  const both = Math.hypot(u, uref)
  // A hair of slack for binary rounding, so a gap that is exactly the allowance is not lost to the 17th digit.
  const ok = gap <= both * (1 + 1e-9) + 4 * Number.EPSILON * Math.max(Math.abs(x), Math.abs(xref))
  // With no allowance at all, a gap inside that slack is the arithmetic's (0.3 against 0.1 + 0.2),
  // so Eₙ is 0 like the verdict says; it used to be ∞ beside "agrees, 1 or less agrees".
  const en = both === 0 ? (ok ? 0 : Infinity) : gap / both
  return { en, ok }
}

/**
 * Marks a value typed with its uncertainty ("0.5591 ± 0.0001") against a reference value and its
 * own uncertainty. The student's uncertainty is capped (`maxRelU` of their own value, 10 % by
 * default), or "± 1000" would agree with anything. A wrong answer is never told its Eₙ: with the
 * two uncertainties known, Eₙ gives |x − xref| away, and with it the answer.
 */
export function checkStated(
  text: string,
  ref: { x: number; u: number; unit: UnitId; maxRelU?: number },
  settings: Precision
): Check {
  if (!text.trim()) return { verdict: 'empty' }
  // An author's formula that gives no real number (sqrt(−1), or a uref like sqrt(a − b) on a bad
  // variant) is the question's fault: "further apart" would blame the student for it.
  if (!Number.isFinite(ref.x) || !Number.isFinite(ref.u)) return { verdict: 'wrong', message: CANNOT_MARK }
  const r = readStated(text)
  if (isReadError(r)) return { verdict: 'unreadable', message: r.error }
  const k = unitFactor(r.unit, ref.unit, 'number')
  if (typeof k !== 'number') return { verdict: 'wrong', message: k.error }
  const zero = r.unit === null || r.unit === ref.unit ? 0 : (convertQuantity(0, r.unit, ref.unit) ?? 0)
  const x = r.x * k + zero
  const u = Math.abs(r.u * k)

  const max = ref.maxRelU ?? DEFAULT_MAX_REL_U
  // Measured against the student's own value, the way a relative uncertainty is always quoted —
  // and quoting it against the reference would give the reference away (u ÷ 17.9 % = xref). A
  // value of 0 has no share to quote, so its sentence carries no number at all. Against a
  // reference that is itself exactly 0 (a net force, a displacement that cancels) the value is
  // the right one and the Eₙ test below judges it; refusing it there marked "0 ± 0.05" wrong
  // against 0 ± 0.05, an Eₙ of 0.
  if (x === 0 && u > 0 && ref.x !== 0) {
    return { verdict: 'wrong', parsed: x, message: 'Your value is 0, so your uncertainty cannot be judged against it. Check your value.' }
  }
  const rel = x !== 0 ? u / Math.abs(x) : 0
  if (rel > max * (1 + 1e-9)) {
    return {
      verdict: 'wrong',
      parsed: x,
      message: `Your uncertainty is ${pct(rel)} % of your value; this answer accepts at most ${pct(max)} %.`
    }
  }
  const { en, ok } = enTest(x, u, ref.x, ref.u)
  if (ok) {
    return {
      verdict: 'right',
      parsed: x,
      message: `Agrees with the reference value within the two uncertainties: Eₙ = ${fmtPrecise(en, settings)}, and 1 or less agrees.`
    }
  }
  return {
    verdict: 'wrong',
    parsed: x,
    message: "Your value and the reference value are further apart than your uncertainty and the reference's allow together."
  }
}

// ---------------------------------------------------------------------------
// Vectors
// ---------------------------------------------------------------------------

const AXES = ['i', 'j', 'k']
const dist = (a: number[], b: number[]): number => Math.hypot(...a.map((x, i) => x - b[i]))
const size = (a: number[]): number => Math.hypot(...a)

/**
 * Marks a vector typed as 3i + 4j, <3, 4> or 5∠53.13°: right when it lies within the band of the
 * answer (a relative band is a fraction of the answer's size). A wrong one is checked for the
 * mistakes students make with vectors — components swapped, one sign flipped, the whole vector
 * reversed, the right size in the wrong direction, the right direction at the wrong size.
 */
export function checkVectorPart(text: string, part: VectorPart, values: Record<string, number>, _settings: Precision): Check {
  if (!text.trim()) return { verdict: 'empty' }
  const ref = part.answer.map((e) => valueOf(e, values))
  if (ref.some((c) => !Number.isFinite(c))) return { verdict: 'wrong', message: CANNOT_MARK }
  const r = readVector(text)
  if (isReadError(r)) return { verdict: 'unreadable', message: r.error }
  const k = unitFactor(r.unit, part.unit, 'numbers')
  if (typeof k !== 'number') return { verdict: r.unit !== null && part.unit === 'none' ? 'unreadable' : 'wrong', message: k.error }
  let v = r.v.map((c) => c * k)

  // A 2-D answer typed with "+ 0k", or a 3-D one whose k part is 0 typed without it, is the same vector.
  if (v.length > ref.length && v.slice(ref.length).some((c) => c !== 0)) {
    return { verdict: 'wrong', message: 'This vector has only i and j components; yours has a k component too.' }
  }
  const n = ref.length
  v = [...v, 0, 0].slice(0, n)

  const tol = halfWidth(part.tolerance, size(ref), 1e-9 * Math.max(1, size(ref)))
  if (dist(v, ref) <= tol) return { verdict: 'right' }
  if (r.v.length < n && Math.abs(ref[2]) > tol) {
    return { verdict: 'wrong', message: 'This vector has three components, i, j and k; yours has two.' }
  }

  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const w = [...v]
      ;[w[a], w[b]] = [w[b], w[a]]
      if (dist(w, ref) <= tol) {
        const which = n === 2 ? 'the first number goes with i, the second with j' : `check which number goes with ${AXES[a]} and which with ${AXES[b]}`
        return { verdict: 'wrong', message: `The right numbers, but the components are swapped round: ${which}.` }
      }
    }
  }
  for (let a = 0; a < n; a++) {
    if (Math.abs(ref[a]) <= tol) continue
    const w = [...v]
    w[a] = -w[a]
    if (dist(w, ref) <= tol) {
      return { verdict: 'wrong', message: `Right size, but the ${AXES[a]} component has the wrong sign. Check which way it points.` }
    }
  }
  if (dist(v.map((c) => -c), ref) <= tol) {
    return { verdict: 'wrong', message: 'Right size, but pointing the opposite way. Check which point the vector goes from and which it goes to.' }
  }
  if (Math.abs(size(v) - size(ref)) <= tol) return { verdict: 'wrong', message: 'Right size, wrong direction.' }
  if (size(v) > 0 && dist(v.map((c) => (c / size(v)) * size(ref)), ref) <= tol) {
    return { verdict: 'wrong', message: 'Right direction, wrong size.' }
  }
  return { verdict: 'wrong', message: WRONG }
}

// ---------------------------------------------------------------------------
// Matrices
// ---------------------------------------------------------------------------

export type CellVerdict = 'right' | 'wrong' | 'empty' | 'unreadable'

export interface MatrixCheck extends Check {
  /** One verdict per entry, in the answer's rows and columns (empty when the sizes differ). */
  cells: CellVerdict[][]
  /** Marks earned: shared out entry by entry with `markPerCell`, else all or nothing. */
  marks: number
}

/**
 * Marks a matrix typed entry by entry (one box per entry, never a bracketed list). Each entry is
 * a number — or a fraction of whole numbers when `allowFractions` is set — within the band of the
 * answer's own entry. With `markPerCell` the marks are shared out over the entries.
 */
export function checkMatrixPart(cells: string[][], part: MatrixPart, values: Record<string, number>, _settings: Precision): MatrixCheck {
  const ref = part.answer.map((row) => row.map((e) => valueOf(e, values)))
  if (ref.some((row) => row.some((x) => !Number.isFinite(x)))) return { verdict: 'wrong', message: CANNOT_MARK, cells: [], marks: 0 }
  const rows = ref.length
  const cols = ref[0].length
  if (cells.length !== rows || cells.some((row) => row.length !== cols)) {
    const theirs = `${count(cells.length)} × ${count(cells[0]?.length ?? 0)}`
    return { verdict: 'wrong', message: `This answer is a ${count(rows)} × ${count(cols)} matrix; yours is ${theirs}.`, cells: [], marks: 0 }
  }
  const fractions = part.allowFractions === true
  const scale = Math.max(1, ...ref.flat().map(Math.abs))
  const got = cells.map((row, i) =>
    row.map((text, j): { verdict: CellVerdict; fraction?: boolean } => {
      if (text.trim() === '') return { verdict: 'empty' }
      const x = readMatrixCell(text, fractions)
      if (x === null) return { verdict: 'unreadable', fraction: !fractions && readMatrixCell(text, true) !== null }
      return { verdict: Math.abs(x - ref[i][j]) <= halfWidth(part.tolerance, ref[i][j], 1e-9 * scale) ? 'right' : 'wrong' }
    })
  )
  const verdicts = got.map((row) => row.map((c) => c.verdict))
  const flat = got.flat()
  if (flat.every((c) => c.verdict === 'empty')) return { verdict: 'empty', cells: verdicts, marks: 0 }
  const bad = got.flatMap((row, i) => row.map((c, j) => ({ ...c, i, j }))).find((c) => c.verdict === 'unreadable')
  if (bad) {
    const where = `row ${count(bad.i + 1)}, column ${count(bad.j + 1)}`
    const message = bad.fraction
      ? `Type each entry as a decimal: the entry in ${where} is a fraction, and this answer does not take fractions.`
      : `PhysLab could not read the entry in ${where}. Type a number like 0.6 or −2.`
    return { verdict: 'unreadable', message, cells: verdicts, marks: 0 }
  }
  if (flat.some((c) => c.verdict === 'empty')) {
    return { verdict: 'unreadable', message: 'Fill in every entry before checking.', cells: verdicts, marks: 0 }
  }
  const right = flat.filter((c) => c.verdict === 'right').length
  const total = flat.length
  if (right === total) return { verdict: 'right', cells: verdicts, marks: part.marks }
  const marks = part.markPerCell === true ? (part.marks * right) / total : 0
  return {
    verdict: 'wrong',
    message: `${count(right)} of the ${count(total)} entries ${right === 1 ? 'is' : 'are'} right.`,
    cells: verdicts,
    marks
  }
}

// ---------------------------------------------------------------------------
// A set of roots
// ---------------------------------------------------------------------------

/** Drops values within `tol(x)` of one already kept: a repeated root counts once. */
function distinct(xs: number[], tol: (x: number) => number): number[] {
  const out: number[] = []
  for (const x of xs) if (!out.some((y) => Math.abs(x - y) <= tol(y))) out.push(x)
  return out
}

/**
 * Pairs each typed value with a different root within its band, and counts what is left over.
 * Greedy is enough: the bands of two distinct roots never overlap at any tolerance an author
 * would set, so a value can only ever be near one of them.
 */
function matchRoots(given: number[], roots: number[], tol: (x: number) => number): { matched: number; extra: number } {
  const used = roots.map(() => false)
  let matched = 0
  let extra = 0
  for (const x of given) {
    const at = roots.findIndex((y, i) => !used[i] && Math.abs(x - y) <= tol(y))
    if (at === -1) extra++
    else {
      used[at] = true
      matched++
    }
  }
  return { matched, extra }
}

/**
 * Marks a set of roots typed as "2, −3", "x = 2 or x = −3" or "−3; 2", in any order. A repeated
 * root counts once unless the part sets `multiplicity` (then "2, 2" is needed for (x − 2)²). A
 * partial answer is told how many it has — "You have 1 of the 2 roots." — and a set with every
 * sign flipped is named, the mistake of reading the roots off (x − 2)(x + 3) as −2 and 3.
 */
export function checkRootsPart(text: string, part: RootsPart, values: Record<string, number>, _settings: Precision): Check {
  if (!text.trim()) return { verdict: 'empty' }
  let roots = part.answer.map((e) => valueOf(e, values))
  if (roots.some((x) => !Number.isFinite(x))) return { verdict: 'wrong', message: CANNOT_MARK }
  const read = readSet(text, part.unit)
  if (isReadError(read)) return { verdict: 'unreadable', message: read.error }
  let given = read
  // Each root's floor is its own size's: one shared scale took the largest value in the set, and
  // with roots 2 and 10⁹ it widened 2's 2 % band from 0.04 to 1.04, so "3, 1000000000" was right.
  const tol = (x: number): number => halfWidth(part.tolerance, x, 1e-9 * Math.max(1, Math.abs(x)))
  if (part.multiplicity !== true) {
    roots = distinct(roots, tol)
    given = distinct(given, tol)
  }

  if (roots.length === 0) {
    if (given.length === 0) return { verdict: 'right' }
    return { verdict: 'wrong', message: 'Put each value back into the equation: none of them makes it true.' }
  }
  if (given.length === 0) return { verdict: 'wrong', message: 'This equation does have real roots. Look again.' }

  const { matched, extra } = matchRoots(given, roots, tol)
  if (matched === roots.length && extra === 0) return { verdict: 'right' }
  if (matched === 0) {
    const flipped = matchRoots(given.map((x) => -x), roots, tol)
    if (flipped.matched === roots.length && flipped.extra === 0) {
      return { verdict: 'wrong', message: 'Right sizes, wrong signs. If (x − a) is a factor, the root is +a.' }
    }
    return { verdict: 'wrong', message: 'None of those is a root. Put each value back into the equation to check.' }
  }
  const have = `You have ${count(matched)} of the ${count(roots.length)} roots`
  if (extra === 0) {
    const repeated = part.multiplicity === true && distinct(roots, tol).length < roots.length
    return { verdict: 'wrong', message: `${have}.${repeated ? ' A repeated root is typed once for each time it repeats.' : ''}` }
  }
  return { verdict: 'wrong', message: `${have}, but ${extra === 1 ? '1 of your values is' : `${count(extra)} of your values are`} not a root.` }
}

// ---------------------------------------------------------------------------
// One entry point, and the revealed answer
// ---------------------------------------------------------------------------

/**
 * Marks a format-2 part from what was typed. A matrix takes its entries box by box, so a text
 * reaches it only by mistake; function, proof and Lego parts are marked by their own modules.
 */
export function checkFormat2Part(answer: string | string[][], part: Format2Part, values: Record<string, number>, settings: Precision): Check {
  const text = typeof answer === 'string' ? answer : ''
  switch (part.type) {
    case 'vector':
      return checkVectorPart(text, part, values, settings)
    case 'roots':
      return checkRootsPart(text, part, values, settings)
    case 'matrix':
      return Array.isArray(answer) ? checkMatrixPart(answer, part, values, settings) : { verdict: 'unreadable', message: 'Type each entry in its own box.' }
    case 'proof':
      return { verdict: 'unreadable', message: 'A proof is not marked on this computer: compare yours with the model proof and its checklist.' }
    case 'function':
    case 'lego':
      return { verdict: 'unreadable', message: 'PhysLab cannot mark this kind of answer here yet.' }
  }
}

/**
 * The right answer of a stated (Eₙ) part as LaTeX, in the form the part asks for — its value ±
 * its reference uncertainty — so a student who types back what is revealed is marked right. The
 * app's one ± rule (PROGRAM 0.9 §5, Idea 9) rounds it: the uncertainty to 1 significant figure,
 * 2 when its first digit is 1, and the value to that same decimal place — 0.5591460 ± 0.0000010.
 * A very large or very small value shares one power of ten: (6.6261 ± 0.0012)×10^{-34}.
 */
export function statedAnswerTex(value: number, uref: number, unit: UnitId, s: Precision): string {
  if (!Number.isFinite(value)) return '\\text{?}'
  const u = texUnit(unit)
  const withUnit = (body: string, grouped: boolean): string => (u === '' ? body : grouped ? `${body}\\,${u}` : `\\left(${body}\\right)\\,${u}`)
  if (!Number.isFinite(uref) || uref <= 0) return withUnit(`${texQuantity(value, 'none', s)} \\pm 0`, false)
  const big = Math.max(Math.abs(value), uref)
  const e = Math.floor(Math.log10(big))
  const power = e >= 6 || e <= -4 ? e : 0
  const x = value / 10 ** power
  const du = uref / 10 ** power
  const first = Math.floor(Math.log10(du))
  const digits = Math.floor(du / 10 ** first) === 1 ? 2 : 1
  const rounded = Number(du.toPrecision(digits))
  // toPrecision can carry into a new decade (0.96 → 1): count places from what was kept.
  const places = Math.max(0, digits - 1 - Math.floor(Math.log10(rounded)))
  // Fixed places, not format.ts's fmt: the ± rule keeps the zeros fmt trims (0.0000010 says 2
  // significant figures) and never turns a small uncertainty into its own power of ten.
  const show = (n: number): string => {
    const t = n.toFixed(places)
    return /^-0(\.0*)?$/.test(t) ? t.slice(1) : t
  }
  const body = `${show(x)} \\pm ${show(rounded)}`
  if (power === 0) return withUnit(body, false)
  return withUnit(`\\left(${body}\\right)\\times 10^{${power}}`, true)
}

/** A number as LaTeX without its sign, for joining terms: 8.66, 1.6×10^{-19}. */
const texAbs = (x: number, s: Precision): string => texQuantity(Math.abs(x), 'none', s)

/**
 * The right answer of a format-2 part as LaTeX, for the revealed answer and the worked
 * solution's last line (answers are mandatory, Rule 3): 8.66 i + 5 j N, a matrix in brackets,
 * the roots in a list.
 */
export function format2AnswerTex(part: Format2Part, values: Record<string, number>, s: Precision): string {
  try {
    switch (part.type) {
      case 'vector': {
        const v = part.answer.map((e) => valueOf(e, values))
        const terms = v
          .map((c, i) => ({ c, axis: `\\mathbf{${AXES[i]}}` }))
          .filter(({ c }) => fmtPrecise(c, s).replace('−', '') !== '0')
        if (terms.length === 0) return `\\mathbf{0}`
        const body = terms.map(({ c, axis }, i) => `${c < 0 ? (i === 0 ? '-' : ' - ') : i === 0 ? '' : ' + '}${texAbs(c, s)}\\,${axis}`).join('')
        const u = texUnit(part.unit)
        return u === '' ? body : `\\left(${body}\\right)\\,${u}`
      }
      case 'roots': {
        const roots = part.answer.map((e) => valueOf(e, values))
        if (roots.length === 0) return '\\text{no real roots}'
        return roots.map((x) => texQuantity(x, part.unit, s)).join(',\\ ')
      }
      case 'matrix': {
        const rows = part.answer.map((row) => row.map((e) => texPrecise(valueOf(e, values), s)).join(' & '))
        return `\\begin{pmatrix} ${rows.join(' \\\\ ')} \\end{pmatrix}`
      }
      case 'function':
        return `${part.y} = ${math.parse(preprocess(part.model)).toTex()}`
      case 'proof':
        return '\\text{see the model proof}'
      case 'lego':
        return '\\text{the target shape}'
    }
  } catch {
    return '\\text{?}'
  }
}

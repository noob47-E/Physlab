// From what is in the field to what the Maths screen shows, as one pure function.
//
// The screen used to make these decisions inline — which engine, what to say when it throws,
// whether an exact form is worth looking for — and none of it could be tested without a DOM.
// This takes the field's LaTeX (or the plain text of the Bases mode) and answers with the main
// line, the extras, the exact form when one is known at once, and a sentence when it fails.
// It never touches the store: the caller decides what to remember.

import { argOf, calcScope, keypadToMath, evaluateBaseN, evaluateComp, evaluateWithRealRoots, exactForm, formatBase, formatValue, isEquationInX, refuseStoring, tidyComplex, withAngle, type Base, type CalcContext, type CalcOutput } from './engine'
import { calcEng, calcNum } from './format'
import { constantScope } from './constants'
import { errorSentence, nonFiniteSentence, outsideBaseSentence, type ErrorSentence } from './errors'
import { beyondTheReals, polishedRoot, polynomialInX } from './roots'
import { math, splitArgs } from '../math/expr'
import { superscriptPowers } from '../math/format'
import { latexToMath } from '../math/latexToMath'
import type { FieldMode } from './calcStore'

export interface EvalOptions {
  vars: Record<string, unknown>
  ans: unknown
  angle: 'deg' | 'rad'
  /** Bases mode only. */
  base?: Base
  /** Engineering notation for the main line. */
  eng?: boolean
}

export interface EvalResult {
  /** The main line, as text. */
  main: string
  extra?: string[]
  /** An exact form (LaTeX) found offline: a fraction, a surd, a multiple of π. */
  exact?: string | null
  value?: unknown
  error?: ErrorSentence
  /** The linear text the engine ran, for the history and the algebra engine. */
  src: string
  /** True when SymPy is worth asking for an exact form this engine could not see. */
  askExact?: boolean
  /** True when the input was an equation and its root should become x. */
  solved?: boolean
}

/**
 * The two settings of the screen an answer depends on: the angle unit (Numbers and Complex read it in sin, arg and the
 * angle line) and the base (Bases reads it to read the line and to write the answer).
 */
export interface AnswerSettings {
  angle: 'deg' | 'rad'
  base: Base
}

/** An answer on the screen: the mode it was worked out under, the line it answers, and the settings it was worked out under. */
export interface Answered extends AnswerSettings {
  mode: FieldMode
  input: string
  result: EvalResult
}

/**
 * The answer that may stay under the field now that it holds `input`: the one it had if it still
 * answers that line, else none. The same object comes back when nothing changed, so a setState
 * with it is no render — a keystroke must not redraw the screen.
 */
export const answerStillFor = <A extends { input: string }>(answered: A | null, input: string): A | null => (answered && answered.input === input ? answered : null)

/**
 * The answer that may stay under the field now that the screen's settings are `now`: the one it had if it was
 * worked out under them, else none. Switching the angle unit or the base leaves the field's text alone, so
 * nothing else drops the answer — sin(30) answered 0.5 in degrees and still said 0.5 after the switch to radians,
 * where it is −0.988, and FF read as a hex number stayed after the base went back to decimal, where it is no number.
 * Only the setting a mode reads counts: Bases never reads the angle unit, and the other modes know no base (the
 * screen keeps its base while another mode is shown). The same object comes back when nothing changed, as
 * answerStillFor does, so a setState with it is no render.
 */
export function answerStillUnder(answered: Answered | null, now: AnswerSettings): Answered | null {
  if (!answered) return null
  const same = answered.mode === 'BASE-N' ? answered.base === now.base : answered.angle === now.angle
  return same ? answered : null
}

/** The field's LaTeX as the engine's linear syntax; Bases mode types linear text already. */
export function linearOf(mode: FieldMode, input: string): string {
  return mode === 'BASE-N' ? input : latexToMath(input)
}

/**
 * x = ? on an equation in x. The numeric search answers the way the handheld does, with the one root
 * nearest the stored x. When the equation is also a polynomial in x its roots are known exactly, and
 * that settles two things the search cannot: a repeated root is given as itself (not −2.999999917),
 * and when the search finds no real root the sentence says where the roots are instead of "no solution".
 */
function solveEquation(src: string, ctx: CalcContext): CalcOutput | { sentence: string } {
  const [left, right] = src.split('=')
  const scope = calcScope(ctx)
  // A search that starts on the answer stops at once and writes the same lines for it.
  const startingAt = (x: number): CalcOutput => evaluateComp(src, { ...ctx, vars: { ...ctx.vars, x } })
  // The coefficients are read after evaluateComp has returned, and a constant in one — sin(30) — is read in whatever
  // angle mode the maths holds by then, not the line's: x² + 1 + sin(30) = 0 on a RAD screen named the roots of the
  // DEG polynomial (±1.2247i for ±0.1094i), and a repeated root lost its polish the same way. The line's own angle
  // is set for the reading and the mode that was held is put back.
  const coefficients = (): number[] | null => withAngle(ctx.angle, () => polynomialInX(left, right, scope))
  try {
    const out = evaluateComp(src, ctx)
    const coeffs = coefficients()
    if (!coeffs || typeof out.value !== 'number') return out
    const exact = polishedRoot(coeffs, out.value)
    return exact === out.value ? out : startingAt(exact)
  } catch (e) {
    if (!(e instanceof Error) || !/No solution/i.test(e.message)) throw e
    const coeffs = coefficients()
    const beyond = coeffs ? beyondTheReals(coeffs, typeof ctx.vars.x === 'number' ? ctx.vars.x : 0) : null
    // Not a polynomial (sin x = 2): the sentence about where to start looking stays.
    if (!beyond) throw e
    return 'sentence' in beyond ? beyond : startingAt(beyond.root)
  }
}

/**
 * Evaluate one line. Returns null for an empty field. Never throws: a refusal from the
 * converter or the engine comes back as `error`, a sentence the student can act on.
 */
export function evaluateInput(mode: FieldMode, input: string, opts: EvalOptions): EvalResult | null {
  let src: string
  try {
    src = linearOf(mode, input).trim()
  } catch (e) {
    return { main: '', src: input, error: errorSentence(e) }
  }
  if (!src) return null
  try {
    if (mode === 'BASE-N') {
      const base = opts.base ?? 10
      // Checked before the engine sees it: the engine calls a 2 in binary a syntax error, and
      // the sentence for that sends the student to check the brackets.
      const outside = outsideBaseSentence(src, base)
      if (outside) return { main: '', src, error: outside }
      const v = evaluateBaseN(src, base)
      return {
        main: formatBase(v, base),
        extra: [`decimal ${formatBase(v, 10)}`, `hex ${formatBase(v, 16)}`, `binary ${formatBase(v, 2)}`, `octal ${formatBase(v, 8)}`],
        value: v,
        src
      }
    }
    if (mode === 'CMPLX') {
      // The line runs in the screen's angle and the mode that was held is put back, as evaluateComp does for the
      // Numbers mode: set and left, one Complex answer in radians made every later bare evaluation (the Table, a
      // tangent) work in radians without a word.
      return withAngle(opts.angle, (): EvalResult => {
        const node = math.parse(keypadToMath(src))
        // A = 5 here answered 5 and stored nothing — a number that looked like a stored letter (H7). Numbers mode
        // refuses it in words that point to Variables; this mode reads the same line the same way.
        refuseStoring(node)
        // arg follows the angle switch like atan2 does: the extras line under it says "angle 45°".
        // An odd root of a negative number is the real root here too, with the principal value in a note.
        const run = evaluateWithRealRoots(node, { ...constantScope(), ...opts.vars, i: math.complex(0, 1), Ans: opts.ans, arg: argOf })
        const v = run.value
        const raw = math.complex(v as never) as unknown as { re: number; im: number }
        if (!Number.isFinite(raw.re) || !Number.isFinite(raw.im)) return { main: '', src, error: nonFiniteSentence(Number.isNaN(raw.re) || Number.isNaN(raw.im) ? NaN : Infinity, src) }
        const c = tidyComplex(raw)
        const r = Math.hypot(c.re, c.im)
        const th = Math.atan2(c.im, c.re)
        // The same formatter as the Numbers mode, so 2 + i never reads "2 + 1i" here and "2 + i" there.
        const main = formatValue(math.complex(c.re, c.im))
        const deg = opts.angle === 'deg'
        return {
          main,
          extra: [...run.roots, `size ${calcNum(r)}, angle ${calcNum(deg ? (th * 180) / Math.PI : th)}${deg ? '°' : ' rad'}`, `conjugate ${formatValue(math.conj(math.complex(c.re, c.im)))}`],
          value: math.complex(c.re, c.im),
          src
        }
      })
    }
    const ctx: CalcContext = { vars: opts.vars, ans: opts.ans, angle: opts.angle }
    let out: CalcOutput
    if (isEquationInX(src)) {
      const answer = solveEquation(src, ctx)
      // No real root, but where the roots are is known: an answer to the question, not an error, and
      // no number to keep — so no x is stored from it and the eng chip leaves the sentence alone.
      if ('sentence' in answer) return { main: answer.sentence, src, exact: null, solved: false }
      out = answer
    } else {
      out = evaluateComp(src, ctx)
    }
    const num = typeof out.value === 'number' ? out.value : NaN
    if (typeof out.value === 'number' && !Number.isFinite(out.value)) return { main: '', src, error: nonFiniteSentence(out.value, src) }
    const solved = /=/.test(src)
    const exact = Number.isFinite(num) && !solved && !/^(Pol|Rec)/i.test(src) ? exactForm(num) : null
    return {
      main: opts.eng && Number.isFinite(num) ? calcEng(num) : out.text,
      extra: out.extra,
      exact: exact && exact !== String(num) ? exact : null,
      value: out.value,
      src,
      solved,
      // A whole number is its own exact form; letters, calculus and random numbers have none worth asking for.
      askExact: !exact && Number.isFinite(num) && !Number.isInteger(num) && !/[xy=]|ddx|integral|sigma|product|Ran/.test(src)
    }
  } catch (e) {
    return { main: '', src, error: errorSentence(e) }
  }
}

/**
 * The main line as the screen shows it: engineering notation is a way of reading the same
 * number, decided when the answer is drawn, so the eng chip changes the answer on screen at
 * once instead of at the next =. An equation's "x = …" and a complex number keep their text.
 *
 * A power of ten is drawn raised ("1.269 × 10⁰", as every label in the app draws it): calcEng and
 * calcNum write it with a caret, which is programming syntax that no screen of PhysLab shows, and
 * the same line carries a very large or small answer with the chip off. Only the drawing changes —
 * r.main and calcEng keep the caret form, and the digits are exactly the ones they wrote.
 */
export function mainLine(r: EvalResult, eng: boolean): string {
  if (!eng || r.solved || typeof r.value !== 'number' || !Number.isFinite(r.value)) return superscriptPowers(r.main)
  return superscriptPowers(calcEng(r.value))
}

/**
 * A line of the engine's text as the screen draws it anywhere but the answer itself — the extras
 * under the answer ("L − R = 4.440892099 × 10⁻¹⁶", "θ = …", the notes on a real root) and the
 * History drawer's results: the same raised power mainLine draws. calcNum writes "×10^-16" so the
 * number can be read back, and a caret is programming syntax that no screen of PhysLab shows.
 *
 * Only the drawing changes. r.extra and r.main (what History stores) keep the caret, the digits are
 * exactly the ones the engine wrote, and a History entry saved before this existed reads right
 * too, because the power is raised when the line is drawn and not when it is kept.
 *
 * A History entry is read back from localStorage, which a damaged entry can come from: one with no
 * text result draws blank, as the bare {h.result} it replaces did, instead of taking the drawer down.
 */
export const shownText = (text: string): string => (typeof text === 'string' ? superscriptPowers(text) : '')

/**
 * Whether a line is worth a frame's delay before it runs: an integral, a sum, a product or an
 * equation to solve can take tens of milliseconds, and running it inside the key press meant
 * the pressed key painted only after the answer. Plain arithmetic runs at once.
 */
export const isHeavy = (latex: string): boolean => /\\int|\\sum|\\prod|ddx|integral|sigma|product|=/.test(latex)

if (import.meta.env?.DEV && typeof window !== 'undefined') (window as unknown as { __mathsEvaluate?: typeof evaluateInput }).__mathsEvaluate = evaluateInput

/**
 * The letters an expression uses that "with values…" should ask about. `e` is a constant, not a
 * variable, and the calculator's own letters are A–F, M, x and y.
 */
export function lettersIn(src: string): string[] {
  return [...new Set(src.match(/\b[A-FMxy]\b/g) ?? [])]
}

/** What the viewport needs to draw the tangent of a `ddx(f, a)` line. */
export interface Tangent {
  /** The curve, as typed in the line. */
  f: string
  /** The point the tangent touches, and the curve's height there. */
  x0: number
  fx: number
  /** The slope, per unit of x in the screen's angle unit. */
  slope: number
}

/**
 * The numbers Visualize draws the tangent of a `ddx(f, a)` line from: the point a, the height f(a) and the slope —
 * every one worked out the way the answer card works the line out, in the screen's angle unit, and the slope by the
 * very call that makes the card's number.
 *
 * Maths.tsx used to work the height out in whatever mode the maths held and the slope in radians always, so in
 * degrees d/dx(sin(x), 30) drew the tangent through (30, 0.5) with the slope of cos(30 rad) = 0.154 under a card that
 * said 0.01511 (π/180 × cos 30°): a picture and an answer to two different questions. Each part here asks the engine,
 * which sets the line's angle for it and puts the mode that was held back.
 *
 * Throws a sentence for a line that is not a derivative at one point, or whose curve has no value or no slope there
 * (a drawn tangent with NaN in its formula is no tangent).
 */
export function tangentAt(input: string, ctx: CalcContext): Tangent {
  const call = input.trim().match(/^ddx\((.*)\)$/)
  const parts = call ? splitArgs(call[1]) : []
  if (parts.length !== 2) throw new Error('A tangent needs an expression and a point, like d/dx(x², 3).')
  const [f, a] = parts
  const x0 = Number(evaluateComp(a, ctx).value)
  const fx = Number(evaluateComp(f, { ...ctx, vars: { ...ctx.vars, x: x0 } }).value)
  const slope = Number(evaluateComp(input, ctx).value)
  if (![x0, fx, slope].every(Number.isFinite)) throw new Error('There is no tangent there: the curve has no value, or no slope, at that point.')
  return { f, x0, fx, slope }
}

/** The "with values…" boxes as numbers, or the letters whose boxes could not be read and a sentence saying so. */
export type ValueBoxes = { ok: true; values: Record<string, number> } | { ok: false; letters: string[]; sentence: string }

/** One box as a finite number in the screen's angle unit, or null: empty, letters, half a sum, 1 ÷ 0, an i, a unit. */
function readBox(text: string, angle: 'deg' | 'rad'): number | null {
  if (!text.trim()) return null
  try {
    const v: unknown = withAngle(angle, () => math.evaluate(keypadToMath(text)))
    // Only a number counts: true and a quoted "2" came back as a boolean and a string, and Number() made them 1 and 2.
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

/** A, A and C, A, B and C: the letters as a sentence names them. */
const namesOf = (letters: string[]): string => (letters.length < 2 ? letters.join('') : `${letters.slice(0, -1).join(', ')} and ${letters[letters.length - 1]}`)

/**
 * Reads every "with values…" box the way the rest of the calculator reads a number — fractions, π, standard form, a
 * percent, sin(30) in the screen's angle unit — and says which letters it could not.
 *
 * The form read its boxes inside the click handler with nothing to catch a refusal: a box with letters or half a sum
 * threw and Calculate did nothing at all, and an empty box, 1/0 or an i became NaN or ∞ and went into the stored
 * letters. The form keeps what the student typed either way; this only reads it. The sentence names the letters, in the
 * order of the boxes, and says what to type — a plain sentence, with no word of the engine's.
 */
export function readValueBoxes(boxes: Record<string, string>, angle: 'deg' | 'rad'): ValueBoxes {
  const values: Record<string, number> = {}
  const letters: string[] = []
  for (const [letter, text] of Object.entries(boxes)) {
    const n = readBox(text, angle)
    if (n === null) letters.push(letter)
    else values[letter] = n
  }
  if (!letters.length) return { ok: true, values }
  return { ok: false, letters, sentence: `I cannot read the value${letters.length > 1 ? 's' : ''} of ${namesOf(letters)}. Type a number, such as 2, 0.5 or 1/3.` }
}

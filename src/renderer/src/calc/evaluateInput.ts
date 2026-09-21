// From what is in the field to what the Maths screen shows, as one pure function.
//
// The screen used to make these decisions inline — which engine, what to say when it throws,
// whether an exact form is worth looking for — and none of it could be tested without a DOM.
// This takes the field's LaTeX (or the plain text of the Bases mode) and answers with the main
// line, the extras, the exact form when one is known at once, and a sentence when it fails.
// It never touches the store: the caller decides what to remember.

import { argOf, casioToMath, evaluateBaseN, evaluateComp, exactForm, formatBase, formatValue, tidyComplex, type Base } from './engine'
import { calcEng, calcNum } from './format'
import { constantScope } from './constants'
import { errorSentence, nonFiniteSentence, outsideBaseSentence, type ErrorSentence } from './errors'
import { math, setAngleMode } from '../math/expr'
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

/** An answer on the screen: the mode it was worked out under and the line it answers. */
export interface Answered {
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

/** The field's LaTeX as the engine's linear syntax; Bases mode types linear text already. */
export function linearOf(mode: FieldMode, input: string): string {
  return mode === 'BASE-N' ? input : latexToMath(input)
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
      setAngleMode(opts.angle)
      // arg follows the angle switch like atan2 does: the extras line under it says "angle 45°".
      const v = math.evaluate(casioToMath(src), { ...constantScope(), ...opts.vars, i: math.complex(0, 1), Ans: opts.ans, arg: argOf }) as unknown
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
        extra: [`size ${calcNum(r)}, angle ${calcNum(deg ? (th * 180) / Math.PI : th)}${deg ? '°' : ' rad'}`, `conjugate ${formatValue(math.conj(math.complex(c.re, c.im)))}`],
        value: math.complex(c.re, c.im),
        src
      }
    }
    const out = evaluateComp(src, { vars: opts.vars, ans: opts.ans, angle: opts.angle })
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
 */
export function mainLine(r: EvalResult, eng: boolean): string {
  if (!eng || r.solved || typeof r.value !== 'number' || !Number.isFinite(r.value)) return r.main
  return calcEng(r.value)
}

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

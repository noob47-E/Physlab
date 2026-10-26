// From what is in the field to what the Maths screen shows, as one pure function.
//
// The screen used to make these decisions inline — which engine, what to say when it throws,
// whether an exact form is worth looking for — and none of it could be tested without a DOM.
// This takes the field's LaTeX (or the plain text of the Bases mode) and answers with the main
// line, the extras, the exact form when one is known at once, and a sentence when it fails.
// It never touches the store: the caller decides what to remember.

import { argOf, calcScope, keypadToMath, evaluateBaseN, evaluateComp, evaluateWithRealRoots, exactForm, formatBase, formatValue, hasFreeX, isEquationInX, NoMeeting, noMeetingSentence, refuseStoring, tidyComplex, withAngle, type Base, type CalcContext, type CalcOutput } from './engine'
import { calcEng, calcNum } from './format'
import { constantScope } from './constants'
import { OWN_LETTERS, errorSentence, nonFiniteSentence, outsideBaseSentence, type ErrorSentence } from './errors'
import { beyondTheReals, polynomialInX, realAndPairs, rootChecks, rowLabel } from './roots'
import { exactQuadratic } from './exactComplex'
import { derivativeForm, hasQuantity, loneUnitLetters, openForm } from './formula'
import { CALCULUS_IN_RADIANS, usesAngles } from './angle'
import { bigNumberText } from '../math/pure/integers'
import { isConstant, parseExpr } from '../math/pure/mono'
import { CONSTANT_NAMES, GREEK_NAMES } from '../math/names'
import { math, splitArgs } from '../math/expr'
import { calculusCall } from '../math/calculusCall'
import { limitCall, type LimitCall } from '../math/limitCall'
import { claimSentence, shownNumber, workOutLimit } from '../math/pure/limitWorking'
import { rTex } from '../math/pure/rat'
import { superscriptPowers } from '../math/format'
import { latexToMath } from '../math/latexToMath'
import { linearSystemEliminationMethod, linearSystemSubstitutionMethod } from '../math/steps/methods/linearSystem'
import { ratOfText } from '../math/steps/check-adapter'
import { analyseInequality, intervalForm, readInequality, setForm } from '../math/steps/inequality'
import type { FieldMode } from './calcStore'
import type { EngineAsk } from './engineAnswer'

/** How many units in the last place two sides of a true statement may differ by (rounding in a long sum). */
const STATEMENT_ULPS = 1024

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
  /** True when the algebra engine is worth asking for an exact form this engine could not see. */
  askExact?: boolean
  /** True when the input was an equation that was solved: its answer reads "x = …". It stores nothing by itself (see `assign`). */
  solved?: boolean
  /** The answer when it is a formula and not a number (LaTeX): d/dx(x³ sin x), or x² − 1 while x has no value. */
  tex?: string
  /** That formula as a line the engine can read back (the same function, for a test or a graph). */
  formula?: string
  /** Every real solution of an equation, each once. */
  roots?: number[]
  /** True when `roots` is the whole list (a polynomial's real roots), not the one root a numeric search found. */
  rootsComplete?: boolean
  /**
   * What a complex answer is made of, for its card: its size (modulus), its angle (argument, in the screen's unit), its
   * conjugate and its polar form. These were the Complex mode's extras; Numbers has the same numbers now, so a student
   * does not have to know which mode a line belongs to.
   */
  complex?: { size: string; angle: string; conjugate: string; polar: string }
  /** The quick answer and the working disagreed: this is the working's answer, and neither is confirmed (calc/working.ts). */
  unconfirmed?: boolean
  /**
   * True when the answer is the solution set of an inequality, not a number or a list of roots. Guess-first takes such an answer only
   * as the card shows it (calc/guessCalc.ts): a number read out of the set would call a right guess wrong.
   */
  inequality?: boolean
  /**
   * True when the number is a root that only the numeric search stands behind and the search could not confirm to the figures shown: put back into
   * a polynomial it does not come out zero, or for any other equation the arithmetic could not place it (a repeated root that round-off hides, f
   * zero over a stretch of the line). Unless the working confirms it, the card says it is approximate and does not give it as the answer (calc/working.ts).
   */
  approximate?: boolean
  /**
   * The letter a line typed as `x = 5` stores, and the number. This is the only way a press of = writes to the
   * stored letters: solving x² − 5x + 6 = 0 used to write the root nearest the old x without a word.
   */
  assign?: { name: string; value: number }
  /** The algebra engine is to answer this line (an indefinite integral, a derivative mathjs could not do); `main` waits for it. */
  engine?: EngineAsk
}

/** What the answer says while the algebra engine is still working on it. */
const WORKING_ON_IT = 'Working it out…'

/**
 * How many units in the last place an integral's number may be from its exact form. The quadrature is good to
 * about 10⁻¹⁴ (π/4 comes out 77 units short), against the 4 a few operations cost; the guard against a number
 * that is merely luckily near a fraction stays as it is.
 */
const INTEGRAL_ROUND_OFF = 1000

/**
 * The two settings of the screen an answer depends on: the angle unit (Numbers and Complex read it in sin, arg and the
 * angle line) and the base (Bases reads it to read the line and to write the answer).
 */
interface AnswerSettings {
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
 *
 * A polynomial with two real roots or more answers with all of them (x² − 5x + 6 = 0 is 3 and 2, the pair Work it
 * out gives): the search can only ever find the one nearest the start, and "x = 2" for that equation was half the
 * answer. One real root beside a complex pair is still the one root, and the pair is named under it.
 *
 * One real root, found exactly, is the answer as it is: the search is not asked, because it stops short of a root repeated three times or more
 * ((x − 1)⁸ = 0 is x = 1, not the 0.9840701616 where |f| first fell under 10⁻¹⁴). The search answers alone only when the exact route found
 * no real root, and then what it finds is kept only if it checks (rootChecks).
 */
function solveEquation(src: string, ctx: CalcContext): CalcOutput | { sentence: string } | { real: number[]; pairs: string[]; complete: boolean } {
  const [left, right] = src.split('=')
  const scope = calcScope(ctx)
  // A search that starts on the answer stops at once and writes the same lines for it.
  const startingAt = (x: number): CalcOutput => evaluateComp(src, { ...ctx, vars: { ...ctx.vars, x } })
  // evaluateComp puts the angle mode it found back when it returns, and a constant in a coefficient — sin(30) — is
  // read in whatever mode the maths holds, not the line's: x² + 1 + sin(30) = 0 on a RAD screen named the roots of the
  // DEG polynomial (±1.2247i for ±0.1094i), and a repeated root lost its polish the same way. The line's own angle
  // is set for the reading and the mode that was held is put back.
  const coefficients = (): number[] | null => withAngle(ctx.angle, () => polynomialInX(left, right, scope))
  try {
    const known = coefficients()
    const roots = known ? realAndPairs(known) : null
    if (roots && roots.real.length >= 2) return roots
    // The complex pair beside one real root is said under it, where the residual of the root already is.
    const withPair = (o: CalcOutput): CalcOutput => (roots?.real.length === 1 && roots.pairs.length ? { ...o, extra: [...(o.extra ?? []), complexNote(roots.pairs)] } : o)
    // The one real root is known exactly (every root listed was put back into the polynomial first), so it is the answer and the search is not asked.
    // The search stops the moment |f| < 10⁻¹⁴, and for a root repeated m times that is 10^(−14/m) away: (x − 1)⁸ = 0 answered 0.9840701616.
    if (roots?.real.length === 1) return withPair(startingAt(roots.real[0]))
    const out = evaluateComp(src, ctx)
    if (!known || typeof out.value !== 'number') return out
    // The exact route found no real root, so the number the search stopped on stands on its own: it is a root if it checks, and when it does not
    // (x² + 10⁻¹² = 0 was "x = 6.7×10⁻⁶") the polynomial's complex roots are the answer. With none of those known it is kept, marked by the caller.
    if (rootChecks(known, out.value)) return out
    const beyond = beyondTheReals(known, out.value, exactQuadratic(left, right))
    return beyond && 'sentence' in beyond ? beyond : out
  } catch (e) {
    if (!(e instanceof Error) || !/No solution/i.test(e.message)) throw e
    // The two sides only meet at infinity (eˣ = 0): that is the answer, in words, and not "try giving x a value", which promises a root somewhere.
    if (e instanceof NoMeeting) return { sentence: noMeetingSentence(e.towards) }
    const coeffs = coefficients()
    const beyond = coeffs ? beyondTheReals(coeffs, typeof ctx.vars.x === 'number' ? ctx.vars.x : 0, exactQuadratic(left, right)) : null
    // Not a polynomial (sin x = 2): the sentence about where to start looking stays.
    if (!beyond) throw e
    return 'sentence' in beyond ? beyond : startingAt(beyond.root)
  }
}

/** The first argument of every ddx, integral, diff or integrate in the line: the body, whose angles calculus reads in radians. */
function calculusBodies(src: string): string[] {
  const bodies: string[] = []
  const open = /\b(ddx|integral|diff|integrate)\s*\(/g
  for (let m = open.exec(src); m; m = open.exec(src)) {
    let depth = 1
    let at = m.index + m[0].length
    const start = at
    for (; at < src.length && depth > 0; at++) depth += src[at] === '(' ? 1 : src[at] === ')' ? -1 : 0
    bodies.push(splitArgs(src.slice(start, at - 1))[0] ?? '')
  }
  return bodies
}

/** The one note a DEG card carries under a calculus answer: calculus used radians, and the line has an angle in it to say so about. */
const radiansNote = (src: string, angle: 'deg' | 'rad'): string[] => (angle === 'deg' && calculusBodies(src).some(usesAngles) ? [CALCULUS_IN_RADIANS] : [])

/** A complex answer's size, angle, conjugate and polar form, in the screen's angle unit; nothing for a real answer. */
function complexCard(value: unknown, angle: 'deg' | 'rad'): EvalResult['complex'] {
  if (!math.isComplex(value)) return undefined
  const c = tidyComplex(value as { re: number; im: number })
  if (c.im === 0) return undefined
  const size = calcNum(Math.hypot(c.re, c.im))
  const theta = Math.atan2(c.im, c.re)
  const turn = angle === 'deg' ? `${calcNum((theta * 180) / Math.PI)}°` : `${calcNum(theta)} rad`
  return { size, angle: turn, conjugate: formatValue(math.conj(math.complex(c.re, c.im))), polar: `${size}∠${turn}` }
}

/**
 * A whole number too big for a double (10¹⁰⁰⁰, 2²⁰⁰⁰) written as itself, or null when the line is not one. The numeric engine
 * overflows past 1.8×10³⁰⁸ and said "runs off to infinity" about a number that is perfectly finite; the exact engine holds it.
 */
function bigIntegerLine(src: string): string | null {
  try {
    const e = parseExpr(src)
    const k = isConstant(e) ? e[0]?.c : undefined
    return k && k.d === 1n ? bigNumberText(k.n) : null
  } catch {
    return null
  }
}

/** The complex roots of an equation that has real ones, said under them: each pair once, as −0.5 ± 0.866i. */
const complexNote = (pairs: string[]): string => `Also, in complex numbers: x = ${pairs.join(' or x = ')}`

/** "x has no value yet", in the words of the letters that have none. */
function noValueNote(letters: string[]): string {
  const names = letters.length < 2 ? letters.join('') : `${letters.slice(0, -1).join(', ')} and ${letters[letters.length - 1]}`
  return `${names} ${letters.length < 2 ? 'has' : 'have'} no value yet, so this stays a formula. Give ${letters.length < 2 ? 'it' : 'them'} a value under Variables to get a number.`
}

/**
 * d/dx(f) and ∫ f dx. The derivative is worked here, in radians whatever DEG says (calculus is: d/dx sin x is cos x), and
 * only shown once it has been checked against the slope of the line as typed; what mathjs cannot differentiate, and
 * every indefinite integral, is handed to the algebra engine, whose answer the screen puts in when it arrives.
 */
function textbookCalculus(name: 'diff' | 'integrate', args: string[], src: string, vars: Record<string, unknown>, angle: 'deg' | 'rad'): EvalResult {
  const [body, letter] = args
  const variable = letter ?? 'x'
  const note = radiansNote(src, angle)
  const extra = note.length ? note : undefined
  if (name === 'diff') {
    const form = derivativeForm(body, variable, vars)
    if (form) return { main: form.text, tex: form.tex, formula: form.src, extra, src, exact: null, solved: false }
  }
  const engine: EngineAsk = name === 'diff' ? { job: 'diff', req: { expr: body, var: variable, deg: false }, plusC: false } : { job: 'integrate', req: { expr: body, var: variable, deg: false }, plusC: true }
  return { main: WORKING_ON_IT, extra, src, exact: null, solved: false, engine }
}

/**
 * A limit on the "=" card: the value when it is found (as a fraction too, when it is one), ∞ or −∞, or a sentence when the
 * limit does not exist or its values do not settle. A "= …" after the limit is compared with the value and said under it.
 * The value is the one the working checks (math/pure/limitWorking.ts), so the card and the working cannot part company.
 */
function limitResult(lim: LimitCall, src: string, angle: 'deg' | 'rad'): EvalResult {
  const { answer, checked } = workOutLimit(lim)
  const claim = lim.claimed === undefined ? null : claimSentence(answer, lim.claimed)
  // Limits are worked in radians whatever the screen says (the rule for calculus), so a DEG card says so when the line has an angle in it.
  const note = angle === 'deg' && usesAngles(lim.body) ? [CALCULUS_IN_RADIANS] : []
  // A value read from the numbers near the point, with no rule behind it, is four figures, and the card says so.
  const estimated = answer.kind === 'value' && answer.check !== undefined ? ['Found from the values near the point, not by a rule, so the last figure may be off.'] : []
  // An infinity or "does not exist" that no exact rule gave is an estimate too: the card says it is not proved.
  const unproved = !checked && (answer.kind === 'infinite' || answer.kind === 'none') ? ['Not proved by a rule: this is read from the values near the point.'] : []
  const extra = [...(claim ? [claim.text] : []), ...estimated, ...unproved, ...note]
  const shared = { src, extra: extra.length ? extra : undefined, solved: false }
  switch (answer.kind) {
    case 'value':
      return { ...shared, main: shownNumber(answer.value, 10), exact: answer.exact && answer.exact.d !== 1n ? rTex(answer.exact) : null, value: answer.value, ...(checked ? {} : { approximate: true }) }
    case 'infinite':
      return { ...shared, main: answer.sign > 0 ? '∞' : '−∞', exact: null, ...(checked ? {} : { approximate: true }) }
    case 'none':
      return { ...shared, main: answer.text, exact: null, ...(checked ? {} : { unconfirmed: true }) }
    case 'unknown':
      return { ...shared, main: '', exact: null, error: { sentence: answer.reason } }
  }
}

/**
 * Simultaneous linear equations (e.g. "y = 2x + 1, x + y = 7" or "2x + y = 7, x - y = 2").
 * Recognizes comma-separated systems and solves them using the exact linear system step solver.
 */
function solveSimultaneous(src: string): EvalResult | null {
  if (!src.includes(',') || !src.includes('=')) return null
  const problem = { job: 'solve' as const, input: src }
  const aSub = linearSystemSubstitutionMethod.appliesTo(problem)
  const aElim = linearSystemEliminationMethod.appliesTo(problem)
  const okSub = typeof aSub === 'boolean' ? aSub : aSub.applies
  const okElim = typeof aElim === 'boolean' ? aElim : aElim.applies
  if (!okSub && !okElim) return null
  const w = linearSystemSubstitutionMethod.solve(problem, undefined as never)
  if (w.noWorking) return null
  if (Array.isArray(w.answer)) {
    const main = w.answer.map((a) => `${a.label} = ${a.tex}`).join(', ')
    const roots: number[] = []
    for (const a of w.answer) {
      const r = ratOfText(a.tex)
      if (r) {
        roots.push(Number(r.n) / Number(r.d))
      } else {
        const n = Number(a.tex)
        if (Number.isFinite(n)) roots.push(n)
      }
    }
    return {
      main,
      roots,
      rootsComplete: true,
      solved: true,
      src,
      exact: null
    }
  }
  if (w.answer && typeof w.answer === 'object') {
    const ans = w.answer as { label?: string; tex?: string }
    const text = (ans.tex ?? '').replace(/^\\text\{/, '').replace(/\}$/, '')
    return {
      main: text || 'No solution',
      roots: [],
      rootsComplete: true,
      solved: false,
      src,
      exact: null
    }
  }
  return null
}

/**
 * Inequalities in one variable (e.g. "x^2 - 4 < 0" or "2x + 3 > 7").
 * Routes <, >, <=, >= expressions to the exact inequality solver and renders interval solution card.
 */
function solveInequalityInput(src: string): EvalResult | null {
  if (!/[<>]|<=|>=|≤|≥/.test(src)) return null
  const withoutIneq = src.replace(/<=|>=|≤|≥/g, '')
  if (withoutIneq.includes('=')) return null
  const read = readInequality(src)
  if (!read) return null
  const analysis = analyseInequality(read)
  if (!analysis) return null
  const plain = setForm(analysis.set, read.v, false).replace(/−/g, '-')
  const tex = setForm(analysis.set, read.v, true)
  const interval = intervalForm(analysis.set)
  return {
    main: plain,
    tex,
    extra: interval && interval !== '\\varnothing' ? [interval] : undefined,
    inequality: true,
    solved: true,
    src,
    exact: null
  }
}

const BUILTIN_CALC_NAMES: ReadonlySet<string> = new Set([
  'Pol', 'pol', 'Rec', 'rec',
  'diff', 'integrate', 'integral', 'ddx', 'sigma', 'product',
  'Ans', 'ans'
])

const MATH_FUNCS: ReadonlySet<string> = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
  'asin', 'acos', 'atan', 'asec', 'acsc', 'acot', 'atan2',
  'sinh', 'cosh', 'tanh', 'sech', 'csch', 'coth',
  'asinh', 'acosh', 'atanh', 'asech', 'acsch', 'acoth',
  'exp', 'ln', 'log', 'log10', 'log2', 'sqrt', 'cbrt', 'nthRoot',
  'abs', 'sign', 'floor', 'ceil', 'round', 'gcd', 'lcm', 'mod',
  'arg', 'conj', 're', 'im'
])

const CONSTANT_SCOPE = constantScope()

function isValuelessUnit(name: string): boolean {
  try {
    return math.Unit.isValuelessUnit(name)
  } catch {
    return false
  }
}

function isKnownName(name: string, vars?: Record<string, unknown>): boolean {
  if (name.length <= 1) return true
  if (vars && name in vars) return true
  if (name in CONSTANT_SCOPE) return true
  if (name in (math as unknown as Record<string, unknown>)) return true
  if (CONSTANT_NAMES.has(name) || GREEK_NAMES.has(name)) return true
  if (BUILTIN_CALC_NAMES.has(name) || MATH_FUNCS.has(name)) return true
  if (isValuelessUnit(name)) return true
  return false
}

const BASE_VALID_SINGLE_LETTERS: ReadonlySet<string> = new Set([
  'A', 'B', 'C', 'D', 'E', 'F', 'M', 'x', 'y',
  'a', 'b', 'c', 'd', 'e', 'f', 'm',
  'i'
])

/** A typed line's runs of letters read as products (xe is x·e), the one reader the "=" path and the integral check share. */
export function readRunsAsMultiplication(expr: string, vars?: Record<string, unknown>): string {
  const assignMatch = expr.match(/^([A-Za-z_][A-Za-z0-9_]*(?:\s*\([^)]*\))?)\s*=(.*)$/)
  if (assignMatch) {
    return `${assignMatch[1]}=${readRunsAsMultiplication(assignMatch[2], vars)}`
  }

  const text = expr.replace(/([A-Za-z0-9])\s+(sin|cos|tan|sec|csc|cot|asin|acos|atan|sinh|cosh|tanh|ln|log|exp|sqrt)\b/g, '$1*$2')

  const validLetters = new Set(BASE_VALID_SINGLE_LETTERS)
  if (vars) {
    for (const k of Object.keys(vars)) {
      if (k.length === 1) validLetters.add(k)
    }
  }

  const multiNames = [
    ...new Set([
      ...(vars ? Object.keys(vars) : []),
      ...BUILTIN_CALC_NAMES,
      ...GREEK_NAMES
    ])
  ].filter((k) => typeof k === 'string' && k.length > 1)
  multiNames.sort((a, b) => b.length - a.length)
  const escaped = multiNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const splitRe = escaped.length ? new RegExp(`(${escaped.join('|')})`) : null

  return text.replace(/([A-Za-z]+(?:_[A-Za-z0-9]+)*)(\s*\()?/g, (match, ident: string, paren: string | undefined, offset: number, whole: string) => {
    if (paren !== undefined) return match
    // 0x1F and 0xFF are ONE hexadecimal number (0b11, 0o7 likewise), not 0·x·F·F: the letters that follow a lone 0 in
    // x, b or o are the number's digits, so the run is left whole. A 0 inside a longer number (10xFF) starts no number.
    if (/^[xbo]/.test(ident) && whole[offset - 1] === '0' && !/[\w.]/.test(whole[offset - 2] ?? '')) return match
    if (isKnownName(ident, vars)) return match
    if (ident.includes('_')) return match

    const parts = splitRe ? ident.split(splitRe).filter(Boolean) : [ident]
    const allValid = parts.every((part) => multiNames.includes(part) || part.split('').every((ch) => validLetters.has(ch)))
    if (!allValid) return match

    return parts
      .flatMap((part) => (multiNames.includes(part) ? [part] : part.split('')))
      .filter(Boolean)
      .join('*')
  })
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
      src = readRunsAsMultiplication(src, opts.vars)
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
    // A limit is its own question: the numeric engine has no lim(), and its answer is read from the values near the point, not from this line.
    const limit = limitCall(src)
    if (limit) return limitResult(limit, src, opts.angle)
    // d/dx(f) and ∫ f dx as a textbook writes them: a function, not a number. The numeric engine reads
    // diff() as mathjs's differences of a list ("Those numbers do not fit this function") and knows no integrate().
    const call = calculusCall(src)
    if (call && call.name !== 'integral' && call.args.length < 3) return textbookCalculus(call.name, call.args, src, opts.vars, opts.angle)
    // integrate(f, a, b) is the question ∫ₐᵇ f dx asks, which the numeric engine answers as integral(f, a, b).
    if (call?.name === 'integrate' && call.args.length === 3) src = `integral(${call.args.join(', ')})`
    const simultaneous = solveSimultaneous(src) ?? solveSimultaneous(readRunsAsMultiplication(src, opts.vars))
    if (simultaneous) return simultaneous
    const ineq = solveInequalityInput(src) ?? solveInequalityInput(readRunsAsMultiplication(src, opts.vars))
    if (ineq) return ineq
    src = readRunsAsMultiplication(src, opts.vars)
    const definite = calculusCall(src)?.name === 'integral'
    let out: CalcOutput
    let assign: { name: string; value: number } | undefined
    let polynomial = false
    let approximate = false
    if (isEquationInX(src)) {
      const [left, right] = src.split('=')
      // An equation whose x's are all the index variables of a Σ, Π, ∫ or d/dx is a statement about
      // two numbers, not something to solve: the search cannot tell the two apart, so a true
      // statement came back as "x = <the stored x>" ("Σ x² from 1 to 5 = 55" answered "x = 2" while x
      // was stored as 2; browser check CALC-10, F1). It is marked true or false and stores nothing (a
      // false one used to get "Try giving x a value", with no x to give). "Holds" is relative to the
      // size of the sides alone, and tight: a sum to 10⁵ carries rounding far above 10⁻¹⁴, while
      // 10⁹ = 10⁹ + 1 must stay false, and so must 1.6×10⁻¹⁹ = 10⁻¹⁹ — no absolute floor (AGENTS.md).
      // A side that is not a plain number (a unit, NaN) goes to the search as before.
      if (!hasFreeX(left) && !hasFreeX(right)) {
        const l = Number(evaluateComp(left, ctx).value)
        const r = Number(evaluateComp(right, ctx).value)
        if (Number.isFinite(l) && Number.isFinite(r)) {
          const holds = Math.abs(l - r) <= STATEMENT_ULPS * Number.EPSILON * Math.max(Math.abs(l), Math.abs(r))
          return { main: holds ? 'true' : 'false', src, extra: [`L − R = ${holds ? '0' : calcNum(l - r)}`], exact: null, solved: false }
        }
      }
      const answer = solveEquation(src, ctx)
      // No real root, but where the roots are is known: an answer to the question, not an error, and
      // no number to keep — so no x is stored from it and the eng chip leaves the sentence alone.
      if ('sentence' in answer) return { main: answer.sentence, src, exact: null, solved: false }
      if ('real' in answer) {
        // Two roots or more, each on its own label and in the order every screen lists them (calc/roots.ts).
        const lines = answer.real.map((r, i) => `${rowLabel(i, answer.real.length)} ${calcNum(r)}`)
        return { main: lines.join(', '), extra: answer.pairs.length ? [complexNote(answer.pairs)] : undefined, roots: answer.real, rootsComplete: answer.complete, src, exact: null, solved: true }
      }
      out = answer
      // A polynomial's real roots are all of them, and the search's one root is the whole answer too when there is only one.
      const coefficients = withAngle(opts.angle, () => polynomialInX(left, right, calcScope(ctx)))
      polynomial = coefficients !== null
      // A polynomial's root is checked by putting it back; any other equation's by the search itself, which says when it could not settle on its number.
      approximate = coefficients !== null ? typeof out.value === 'number' && !rootChecks(coefficients, out.value) : out.approximate === true
      // Solving never stores. Only the student's own "x = 5" does, and then the stored x is the 5 that was typed.
      if (typeof out.value === 'number' && ((left.trim() === 'x' && !hasFreeX(right)) || (right.trim() === 'x' && !hasFreeX(left)))) assign = { name: 'x', value: out.value }
    } else {
      // A lone A, B, C or F (x + A, C x, A + 1) has no number before it, so it is the letter and not the ampere, the byte, the coulomb or the farad:
      // the numeric reading would take it for the unit and refuse the line, so the line goes straight to the formula.
      const lone = loneUnitLetters(src, opts.vars, OWN_LETTERS).length ? openForm(src, opts.vars, OWN_LETTERS) : null
      if (lone) return { main: lone.form.text, tex: lone.form.tex, formula: lone.form.src, extra: [noValueNote(lone.letters)], src, exact: null, solved: false }
      try {
        out = evaluateComp(src, ctx)
      } catch (e) {
        // A letter nobody gave a value to is not 0: the line stays a formula in that letter (x² − 1 is x² − 1).
        const open = e instanceof Error && /Undefined symbol/.test(e.message) ? openForm(src, opts.vars, OWN_LETTERS) : null
        if (!open) {
          // A line that has a quantity in it and a letter with no value: the trouble is the mixture, and x is a perfectly good letter.
          const named = e instanceof Error ? /Undefined symbol\s+(\S+)/.exec(e.message)?.[1] : undefined
          if (named && OWN_LETTERS.test(named) && hasQuantity(src, opts.vars)) {
            return { main: '', src, error: { sentence: `${named} has no value yet, and a letter right after a number is read as a unit here (2C is two coulombs). Give ${named} a value under Variables, or take the units out of the line.` } }
          }
          throw e
        }
        return { main: open.form.text, tex: open.form.tex, formula: open.form.src, extra: [noValueNote(open.letters)], src, exact: null, solved: false }
      }
    }
    const num = typeof out.value === 'number' ? out.value : NaN
    if (typeof out.value === 'number' && !Number.isFinite(out.value)) {
      const big = bigIntegerLine(src)
      if (big !== null) return { main: big, src, exact: null, solved: false }
      return { main: '', src, error: nonFiniteSentence(out.value, src) }
    }
    const solved = /=/.test(src)
    const exact = Number.isFinite(num) && !solved && !/^(Pol|Rec)/i.test(src) ? exactForm(num, definite ? INTEGRAL_ROUND_OFF : undefined) : null
    const note = radiansNote(src, opts.angle)
    const complex = complexCard(out.value, opts.angle)
    return {
      main: opts.eng && Number.isFinite(num) ? calcEng(num) : out.text,
      extra: note.length ? [...(out.extra ?? []), ...note] : out.extra,
      ...(complex ? { complex } : {}),
      exact: exact && exact !== String(num) ? exact : null,
      value: out.value,
      src,
      solved,
      ...(solved && Number.isFinite(num) ? { roots: [num], rootsComplete: polynomial } : {}),
      ...(assign ? { assign } : {}),
      ...(approximate ? { approximate } : {}),
      // A whole number is its own exact form; letters, calculus and random numbers have none worth asking for.
      askExact: !exact && Number.isFinite(num) && !Number.isInteger(num) && !/[xy=]|ddx|integral|sigma|product|Ran/.test(src)
    }
  } catch (e) {
    return { main: '', src, error: errorSentence(e) }
  }
}

/**
 * The stored letters after an answer has been worked out: what the screen keeps for the next line.
 * One place decides, so a test can see what a press of = leaves behind without a DOM. The same object
 * comes back when nothing is to be stored, so a setState with it is no render.
 */
export function varsAfter(vars: Record<string, unknown>, r: EvalResult): Record<string, unknown> {
  return r.assign ? { ...vars, [r.assign.name]: r.assign.value } : vars
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
 * Whether the eng chip would change the answer on the screen: it sat under every answer — a sentence, true or false, the two roots of a
 * quadratic, a 5 — where pressing it did nothing, or only wrote 5 as 5 × 10⁰ (owner, 17 Oct: a stray "eng" under the answers). It is offered
 * where it rewrites the number with a power of ten: 96 320 is 96.32 × 10³, 0.5 is 500 × 10⁻³.
 */
export const engChanges = (r: EvalResult): boolean =>
  !r.error && typeof r.value === 'number' && Number.isFinite(r.value) && !/×\s*10\^0$/.test(calcEng(r.value)) && mainLine(r, true) !== mainLine(r, false)

/**
 * Whether Visualize has a picture to draw for the answered line (Maths.tsx drawLine, in its order): a tangent, an area, a derivative's graph, a
 * vector, a complex number, an equation's or a function's graph, a sum's bars. A plain number used to be "drawn" as a dot on the axis with a
 * slider beside it — a button on every answer for a picture that shows nothing (owner, 17 Oct: pictures only where they are possible).
 */
export function hasPicture(src: string, mode: FieldMode, r: EvalResult): boolean {
  if (r.error || mode === 'BASE-N' || !src.trim()) return false
  if (/^(ddx|integral|sigma)\(/.test(src) || /^(Pol|Rec)\(/i.test(src)) return true
  const dif = calculusCall(src)
  if (dif?.name === 'diff' && (dif.args[1] ?? 'x') === 'x' && !!r.formula) return true
  if (mode === 'CMPLX' && !!r.value && typeof r.value === 'object') return true
  return (/=/.test(src) && /x/.test(src)) || /(^|[^a-z])x([^a-z]|$)/.test(src)
}

/**
 * The graph Visualize draws for an equation l = r in x: the curve y = l − r, which crosses the axis at the roots (eˣ = 0 shows a curve that never
 * comes down to it). When one side is y itself, y = x² is the curve y = x², not y = y − (x²): that drew nothing, y having no value on a graph.
 */
export function equationGraph(l: string, r: string): { label: string; expr: string } {
  if (l.trim() === 'y' && !/(^|[^a-z])y([^a-z]|$)/.test(r)) return { label: `y = ${r.trim()}`, expr: keypadToMath(r.trim()) }
  if (r.trim() === 'y' && !/(^|[^a-z])y([^a-z]|$)/.test(l)) return { label: `y = ${l.trim()}`, expr: keypadToMath(l.trim()) }
  return { label: `y = ${l} − (${r})`, expr: `(${keypadToMath(l)}) - (${keypadToMath(r)})` }
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

/** What the viewport needs to draw the tangent of a `ddx(f, a)` line. */
interface Tangent {
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
 * every one worked out the way the answer card works the line out: the point in the screen's angle unit (plain trig
 * outside the curve), the curve and its slope in radians (calculus is), and the slope by the very call that makes
 * the card's number. The picture then draws the curve in radians too (calc/formula.ts inRadians).
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
  const fx = Number(evaluateComp(f, { ...ctx, angle: 'rad', vars: { ...ctx.vars, x: x0 } }).value)
  const slope = Number(evaluateComp(input, ctx).value)
  if (![x0, fx, slope].every(Number.isFinite)) throw new Error('There is no tangent there: the curve has no value, or no slope, at that point.')
  return { f, x0, fx, slope }
}

/** The "with values…" boxes as numbers, or the letters whose boxes could not be read and a sentence saying so. */
type ValueBoxes = { ok: true; values: Record<string, number> } | { ok: false; letters: string[]; sentence: string }

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

// Marking a number part or an expression part. A number part reuses `checkAnswer` from
// `math/checkAnswer.ts` unchanged — that is where sign, quadrant, radians and named-trap
// diagnoses live — and only adds unit handling on top; an expression part is its own three-stage
// check (exact, algebraic, numeric) since `checkAnswer` only ever compares two numbers.
// Headless: no React, no store, no DOM.

import type { FunctionNode, MathNode, SymbolNode } from 'mathjs'
import { getAngleMode, inDegrees, math, preprocess, setAngleMode, symbolsOf } from '../math/expr'
import type { MeasureSettings } from '../math/format'
import { checkAnswer, parseAnswer, UNIT_TAIL, type Check } from '../math/checkAnswer'
import type { AnswerField, Trap } from '../math/problems'
import { rngFor } from '../math/problems'
import type { PQPart, UnitId } from './pqjson'
import { convertQuantity, unitFromTail, UNITS } from './units'

export type Precision = Pick<MeasureSettings, 'decimals' | 'precisionMode'>

type NumberPart = Extract<PQPart, { type: 'number' }>
type ExpressionPart = Extract<PQPart, { type: 'expression' }>

/** The value a mathjs expression in the question's variables works out to, always in degrees. */
export function evaluateInVariables(expr: string, values: Record<string, number>): number {
  return Number(inDegrees(() => math.evaluate(preprocess(expr), { ...values })))
}

export function toAbsoluteTol(part: NumberPart, value: number): number {
  return part.tolerance.kind === 'relative' ? Math.abs(value) * part.tolerance.value : part.tolerance.value
}

/**
 * Marks a number part. `checkAnswer` does the actual comparison and every diagnosis; the only
 * work here is reading a unit tail the student may have typed and converting it to the part's
 * unit first — a different unit entirely (kg for a box that wants N) is refused before
 * `checkAnswer` ever sees a number, since no amount of tolerance makes that "close".
 */
export function checkNumberPart(text: string, part: NumberPart, values: Record<string, number>, settings: Precision): Check {
  const value = evaluateInVariables(part.answer, values)
  const tol = toAbsoluteTol(part, value)
  const traps: Trap[] = (part.traps ?? []).map((t) => ({ value: evaluateInVariables(t.value, values), why: t.why }))
  const field: AnswerField = {
    key: 'answer',
    label: part.prompt,
    unit: part.unit === 'none' ? undefined : UNITS[part.unit].label,
    value,
    tol,
    kind: part.kind,
    traps
  }

  // Whatever unit the tail names, `checkAnswer` gets the number without it: its own UNIT_TAIL
  // knows a dozen labels, so "50 km/h" for a km/h box (or "5 cm", "3 A", "20 °C") handed over
  // whole came back "I could not read that" although both number and unit were exactly right.
  const tail = unitFromTail(text)
  if (tail.unit !== null) {
    const raw = parseAnswer(tail.value)
    if (raw !== null) {
      if (tail.unit === part.unit) return checkAnswer(tail.value, field, settings)
      const converted = convertQuantity(raw, tail.unit, part.unit)
      if (converted === null) {
        return { verdict: 'wrong', message: `That is in ${UNITS[tail.unit].name}; this box wants ${UNITS[part.unit].name}.` }
      }
      return checkAnswer(String(converted), field, settings)
    }
  }
  // A tail `checkAnswer` would drop without a word, but not one read above ("5 KG", "5 S"):
  // marked on its number alone, a value in some other unit could come back right.
  const dropped = tail.unit === null ? UNIT_TAIL.exec(text.trim()) : null
  if (dropped && !/^units?$/i.test(dropped[1])) {
    const how = part.unit === 'none' ? 'This box wants just the number' : `Type it as ${UNITS[part.unit].label}, or leave the unit off`
    return { verdict: 'unreadable', message: `PhysLab could not read the unit "${dropped[1]}". ${how}.` }
  }
  return checkAnswer(text, field, settings)
}

// ---------------------------------------------------------------------------
// Expression parts
// ---------------------------------------------------------------------------

const UNREADABLE_MESSAGE = 'I could not read that. Type a number like 12.5, or an expression like 5*sqrt(2).'
const CLOSE_MESSAGE = 'Right up to rounding — check your constants.'
export const WRONG_MESSAGE = 'Not quite. Press Hint to see the next step.'

/**
 * True for a name mathjs itself supplies. Neither a question variable nor a symbol the part
 * allows, so it is not one of the free symbols a student's own answer may use.
 */
function isBuiltIn(name: string): boolean {
  const t = math.typeOf((math as unknown as Record<string, unknown>)[name])
  return t === 'number' || t === 'Complex' || t === 'boolean' || t === 'function'
}

/** Replaces every known variable's `SymbolNode` with its numeric value, leaving free symbols alone. */
function substituteValues(node: MathNode, values: Record<string, number>): MathNode {
  return node.transform((n) => {
    if (n.type === 'SymbolNode' && Object.prototype.hasOwnProperty.call(values, (n as unknown as { name: string }).name)) {
      return new math.ConstantNode(values[(n as unknown as { name: string }).name])
    }
    return n
  })
}

/** Whether `math.parse` + the known-variable substitution shows the expression to be zero everywhere. */
function symbolicallyZero(diff: string, values: Record<string, number>): boolean {
  let node: MathNode
  try {
    node = substituteValues(math.parse(preprocess(diff)), values)
  } catch {
    return false
  }
  try {
    const rationalized = math.rationalize(node)
    if (rationalized.toString().trim() === '0') return true
  } catch {
    // Not a polynomial (a trig or log term, say) — rationalize only handles polynomials.
  }
  try {
    const simplified = math.simplify(node)
    return simplified.type === 'ConstantNode' && Number((simplified as unknown as { value: number }).value) === 0
  } catch {
    return false
  }
}

/** One random point per symbol, `n` such points spread evenly across `[lo, hi]` (a 1-D Latin hypercube per symbol). */
function sampleGrid(symbols: string[], n: number, range: [number, number], seed: number): Record<string, number>[] {
  const r = rngFor(seed)
  const [lo, hi] = range
  const perms = symbols.map(() => {
    const p = Array.from({ length: n }, (_, i) => i)
    for (let i = p.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1))
      ;[p[i], p[j]] = [p[j], p[i]]
    }
    return p
  })
  const points: Record<string, number>[] = []
  for (let i = 0; i < n; i++) {
    const point: Record<string, number> = {}
    symbols.forEach((s, d) => {
      const u = (perms[d][i] + r()) / n
      point[s] = lo + u * (hi - lo)
    })
    points.push(point)
  }
  return points
}

/**
 * A letter written straight before a bracket is a product: t(u − 4.9t) is t × (u − 4.9t). mathjs
 * reads it as a call to a function called t, every sample point failed, and a student who
 * factored out t was told the answer could not be read. Only `letters` (the part's own symbols and
 * the question's variables) are read this way, and never a name mathjs knows as a function, so
 * sin(x), sqrt(x) and ln(x) stay what they are.
 */
export function lettersBeforeBrackets(text: string, letters: readonly string[]): string {
  let node: MathNode
  try {
    node = math.parse(preprocess(text))
  } catch {
    return text
  }
  const products = new Set(letters.filter((n) => typeof (math as unknown as Record<string, unknown>)[n] !== 'function'))
  let changed = false
  const rewrite = (n: MathNode): MathNode => {
    if (n.type !== 'FunctionNode') return n
    const call = n as FunctionNode
    if (call.fn.type !== 'SymbolNode' || !products.has((call.fn as SymbolNode).name) || call.args.length !== 1) return n
    changed = true
    return new math.OperatorNode('*', 'multiply', [call.fn as SymbolNode, new math.ParenthesisNode(call.args[0].transform(rewrite))])
  }
  const out = node.transform(rewrite)
  return changed ? out.toString() : text
}

/** Runs `fn` with the calculator in radians and puts the mode back after. */
function inRadians<T>(fn: () => T): T {
  const prev = getAngleMode()
  setAngleMode('rad')
  try {
    return fn()
  } finally {
    setAngleMode(prev)
  }
}

/**
 * The question's values as an expression part is sampled: in radians, like Numbas, so a variable
 * the author measured in degrees enters as its radian size and cos(θ) with θ = 30° is still
 * cos 30°, whether the student leaves θ in or types the number it comes to.
 */
function radianScope(values: Record<string, number>, units: Record<string, UnitId | undefined>): Record<string, number> {
  const out: Record<string, number> = { ...values }
  for (const [name, unit] of Object.entries(units)) if (unit === '°' && Number.isFinite(out[name])) out[name] = (out[name] * Math.PI) / 180
  return out
}

/**
 * Marks an expression part in three stages: parsed, then checked symbolically (exact for a
 * polynomial identity like `x²−1 ≡ (x−1)(x+1)`) and sampled numerically (catches everything
 * else, `sin(x)²+cos(x)² ≡ 1` among them). A symbol the part does not list — the student
 * answered in `t` when the part wants `x` — is wrong without any of that. `units` are the
 * question's variables' units, so an angle in degrees is read as one.
 *
 * Both sides are worked out in radians. In degrees the samples at x = 1…2 were 1°…2°, where sin
 * is a straight line and cos is 1: 2 sin x for sin 2x, 1 for cos x and sin x for tan x all came
 * back "right up to rounding", which counts as right.
 */
export function checkExpressionPart(
  text: string,
  part: ExpressionPart,
  values: Record<string, number>,
  units: Record<string, UnitId | undefined> = {}
): Check {
  if (!text.trim()) return { verdict: 'empty' }
  text = lettersBeforeBrackets(text, [...part.symbols, ...Object.keys(values)])

  let studentNode: MathNode
  try {
    studentNode = math.parse(preprocess(text))
  } catch {
    return { verdict: 'unreadable', message: UNREADABLE_MESSAGE }
  }

  const known = new Set(Object.keys(values))
  const allowed = new Set(part.symbols)
  const used = symbolsOf(studentNode).filter((n) => !known.has(n) && !isBuiltIn(n))
  const stray = used.find((n) => !allowed.has(n))
  if (stray !== undefined) {
    return { verdict: 'wrong', message: `The answer should only use ${part.symbols.join(', ')}.` }
  }

  // The sampled verdict is taken first and the algebra may only improve on it: mathjs folds a
  // constant within 1e-15 of zero to 0, so with e = 1.6e-19 substituted (e·E) − (2·e·E)
  // "simplified" to 0 and a student's answer twice the right one was marked right. Algebra can
  // still rescue noise near a zero crossing or too few finite points, never a wrong sample.
  const scope = radianScope(values, units)
  return inRadians(() => {
    const sampled = sampledCheck(text, part, scope)
    if (sampled.verdict === 'right') return sampled
    if (sampled.verdict !== 'wrong' && symbolicallyZero(`(${part.answer}) - (${text})`, scope)) return { verdict: 'right' }
    return sampled
  })
}

/** The numeric stage on its own: the two sides at 7 points per symbol across `sampleRange`, in whatever angle mode the caller set. */
function sampledCheck(text: string, part: ExpressionPart, values: Record<string, number>): Check {
  const range = part.sampleRange ?? [1, 2]
  const points = sampleGrid(part.symbols, 7, range, 1)
  let finite = 0
  let maxRelError = 0
  for (const point of points) {
    const scope = { ...values, ...point }
    let a: number
    let b: number
    try {
      a = Number(math.evaluate(preprocess(part.answer), { ...scope }))
      b = Number(math.evaluate(preprocess(text), { ...scope }))
    } catch {
      continue
    }
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    finite++
    // Relative to the larger side, never to max(1, |a|): that made the check absolute for every
    // answer below 1 and passed 2e-7·x for 1e-7·x — an electron-sized constant a factor of two
    // off. A side that is exactly zero (an identity that cancels) has nothing to be relative to,
    // so the other side must then be zero to within floating noise.
    const scale = Math.max(Math.abs(a), Math.abs(b))
    const rel = a === 0 || b === 0 ? (scale <= 1e-12 ? 0 : 1) : Math.abs(a - b) / scale
    maxRelError = Math.max(maxRelError, rel)
  }

  if (finite < 5) return { verdict: 'unreadable', message: 'PhysLab could not check enough points to mark that expression.' }
  if (maxRelError <= 1e-6) return { verdict: 'right' }
  if (maxRelError <= 1e-3) return { verdict: 'close', message: CLOSE_MESSAGE }
  return { verdict: 'wrong', message: WRONG_MESSAGE }
}

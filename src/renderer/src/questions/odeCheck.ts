// Marking a function answer (rung 4): the student writes y as a formula in x, and PhysLab checks
// it the way a teacher would — put it into the differential equation and see whether both sides
// agree, then see whether it starts where the question says. There is no single right way to
// write a solution (√(5e^(−2s) − 1) and the general form with u, F₀ and k in it are the same
// function), so the formula is never compared with the author's own; the equation is the judge.
// Headless: no React, no store, no DOM.

import type { EvalFunction, FunctionNode, MathNode, OperatorNode, ParenthesisNode, SymbolNode } from 'mathjs'
import type { Check } from '../math/checkAnswer'
import { getAngleMode, math, preprocess, setAngleMode, symbolsOf } from '../math/expr'
import { fmtPrecise, type MeasureSettings } from '../math/format'
import { lettersBeforeBrackets, withoutNameEquals } from './parts'
import type { PQPart, UnitId } from './pqjson'

export type FunctionPart = Extract<PQPart, { type: 'function' }>
export type Precision = Pick<MeasureSettings, 'decimals' | 'precisionMode'>

/** Numbers quoted in a sentence: y′(0) should be 1, v(0) should be 2. */
const SENTENCE_PRECISION: Precision = { decimals: 4, precisionMode: 'dp' }

/** The design's range: seven points between 0.1 and 1, clear of the x = 0 where many solutions start. */
export const DEFAULT_SAMPLE_RANGE: [number, number] = [0.1, 1]
const POINTS = 7

// Relative sizes of the mismatch. Exact arithmetic leaves ~10⁻¹⁵; a formula typed with its
// constants rounded (2.236 for √5) leaves ~10⁻⁴, which the expression parts already tick with
// the rounding sentence; anything bigger is a different function.
const EXACT = 1e-6
/** Differences taken numerically carry their own error of about 10⁻⁸; this stays far above it. */
const EXACT_NUMERIC = 1e-5
const ROUNDING = 1e-3

export const ROUNDING_MESSAGE = 'Right up to rounding — check your constants.'
export const NOT_A_SOLUTION = 'That formula does not solve the equation: put it into both sides and they do not come out equal.'

/**
 * The functions whose derivative mathjs writes the way this app evaluates them. `log` is left out
 * on purpose: here log(x) is base 10 (the calculator's convention), while mathjs differentiates
 * it as the natural log; `ln` is the app's own function, which mathjs cannot differentiate at all.
 * A formula using anything else is differentiated numerically instead.
 */
const SYMBOLIC_SAFE = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'sqrt', 'cbrt', 'exp', 'abs'])

/** True for a name mathjs itself supplies (pi, e, sin …), which is not a stray letter in an answer. */
function isBuiltIn(name: string): boolean {
  const t = math.typeOf((math as unknown as Record<string, unknown>)[name])
  return t === 'number' || t === 'Complex' || t === 'boolean' || t === 'function'
}

/** Runs `fn` with the calculator in radians and puts the mode back after: sin x in an equation is always radians. */
function inRadians<T>(fn: () => T): T {
  const prev = getAngleMode()
  setAngleMode('rad')
  try {
    return fn()
  } finally {
    setAngleMode(prev)
  }
}

/** A variable measured in degrees enters the equation as its radian size, as it does in an expression part. */
function radianScope(values: Record<string, number>, units: Record<string, UnitId | undefined>): Record<string, number> {
  const out: Record<string, number> = { ...values }
  for (const [name, unit] of Object.entries(units)) if (unit === '°' && Number.isFinite(out[name])) out[name] = (out[name] * Math.PI) / 180
  return out
}

/**
 * The equation with its primes in the one spelling the parser reads as part of a name: y'' and
 * y′′ become y″, y' becomes y′ (math/expr.ts lets a prime after a letter belong to the name,
 * while a plain apostrophe would start a string).
 */
export function primed(text: string): string {
  // A pair in either order too: y′' became y′′, two primes the parser reads as a name of its
  // own, not the y″ the checker puts in scope, and every answer "had no value" anywhere.
  return text.replace(/''|′′|′'|'′/g, '″').replace(/'/g, '′')
}

/** The additive terms of a side: y″ + y is [y″, y]; −(F₀ + kv²) is [F₀, kv²]. Their sizes give the scale a mismatch is measured against. */
function termsOf(node: MathNode): MathNode[] {
  if (node.type === 'ParenthesisNode') return termsOf((node as ParenthesisNode).content)
  if (node.type === 'OperatorNode') {
    const op = node as OperatorNode
    if ((op.fn === 'add' || op.fn === 'subtract') && op.args.length === 2) return [...termsOf(op.args[0]), ...termsOf(op.args[1])]
    if (op.fn === 'unaryMinus' || op.fn === 'unaryPlus') return termsOf(op.args[0])
  }
  return [node]
}

type Fn = (x: number) => number

/** A compiled formula as a function of x alone, NaN wherever it has no real value. */
function asFunction(node: MathNode, xName: string, scope: Record<string, number>): Fn {
  const code = node.compile()
  return (x) => {
    try {
      const v = code.evaluate({ ...scope, [xName]: x })
      return typeof v === 'number' ? v : NaN
    } catch {
      return NaN
    }
  }
}

/**
 * mathjs writes the derivative of aˣ as aˣ·log(a), meaning the natural log; evaluated here, where
 * log is base 10, d/ds e^(−2s) came out 0.434 times too small and the right braking speed was
 * marked "does not solve the equation". Every one-argument log mathjs writes becomes ln.
 */
function naturalLog(node: MathNode): MathNode {
  return node.transform((n) => {
    if (n.type !== 'FunctionNode') return n
    const call = n as FunctionNode
    if (call.fn.type === 'SymbolNode' && (call.fn as SymbolNode).name === 'log' && call.args.length === 1) {
      return new math.FunctionNode(new math.SymbolNode('ln'), call.args)
    }
    return n
  })
}

/**
 * y′ and y″ as functions. mathjs's own derivative when every function in the formula means the
 * same to mathjs as to this app; otherwise central differences with one Richardson step, whose
 * error (~h⁴) sits far below the rounding band.
 */
function derivativesOf(node: MathNode, xName: string, scope: Record<string, number>, h: number): { d1: Fn; d2: Fn; symbolic: boolean } {
  let symbolic = true
  node.traverse((n) => {
    if (n.type === 'FunctionNode') {
      const fn = (n as unknown as { fn: { name?: string } }).fn
      if (!fn.name || !SYMBOLIC_SAFE.has(fn.name)) symbolic = false
    }
  })
  if (symbolic) {
    try {
      const n1 = naturalLog(math.derivative(node, xName, { simplify: false }))
      const n2 = naturalLog(math.derivative(n1, xName, { simplify: false }))
      return { d1: asFunction(n1, xName, scope), d2: asFunction(n2, xName, scope), symbolic: true }
    } catch {
      // A form mathjs will not differentiate: the numeric route below still marks it.
    }
  }
  const f = asFunction(node, xName, scope)
  const c1 = (x: number, s: number): number => (f(x + s) - f(x - s)) / (2 * s)
  const c2 = (x: number, s: number): number => (f(x + s) - 2 * f(x) + f(x - s)) / (s * s)
  return {
    d1: (x) => (4 * c1(x, h / 2) - c1(x, h)) / 3,
    d2: (x) => (4 * c2(x, h / 2) - c2(x, h)) / 3,
    symbolic: false
  }
}

/** The x values the equation is checked at: seven, evenly across the range, ends included. */
function samplePoints([lo, hi]: [number, number]): number[] {
  return Array.from({ length: POINTS }, (_, i) => lo + ((hi - lo) * i) / (POINTS - 1))
}

/** "C", "A and B", "A, B and C". */
function listed(names: string[]): string {
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * Marks a function part. `text` is the student's formula for y in x ("sin(x)", "y = 2 sin(x)",
 * "v(s) = √(5e^(−2s) − 1)"); `values` are the question's drawn variables, which the formula may
 * use (u, F₀, k …); `units` their units, so an angle drawn in degrees enters in radians.
 *
 * 1. The formula must use only x and the question's variables; a constant left in (A sin x) is
 *    named, with what to do about it.
 * 2. With y := the formula, y′ and y″ worked out, the equation's two sides are compared at seven
 *    points across `sampleRange` (default 0.1 to 1). A point where the formula has no real value
 *    (√ of a negative) is skipped; five are needed.
 * 3. Each starting condition, y(at) = value or y′(at) = value.
 * "Does not solve the equation" and "solves it but does not start where the question says" are
 * separate sentences, because they send the student to different mistakes.
 */
export function checkFunctionPart(
  text: string,
  part: FunctionPart,
  values: Record<string, number>,
  units: Record<string, UnitId | undefined> = {},
  settings: Precision = SENTENCE_PRECISION
): Check {
  if (!text.trim()) return { verdict: 'empty' }
  const xName = part.x
  const yName = part.y
  const unreadable: Check = { verdict: 'unreadable', message: `I could not read that. Type ${yName} as a formula in ${xName}, like 2 sin(${xName}).` }

  let body = withoutNameEquals(primed(text), [xName])
  body = lettersBeforeBrackets(body, [xName, ...Object.keys(values)])
  let node: MathNode
  try {
    node = math.parse(preprocess(body))
  } catch {
    return unreadable
  }

  const [lhsText, rhsText] = primed(part.ode).split('=')
  let lhs: MathNode
  let rhs: MathNode
  try {
    lhs = math.parse(preprocess(lhsText))
    rhs = math.parse(preprocess(rhsText))
  } catch {
    return { verdict: 'unreadable', message: 'PhysLab could not read this part’s equation, so it cannot mark it.' }
  }
  const equation: Equation = {
    lhs: lhs.compile(),
    rhs: rhs.compile(),
    terms: [...termsOf(lhs), ...termsOf(rhs)].map((t) => t.compile()),
    xName,
    yName,
    range: part.sampleRange ?? DEFAULT_SAMPLE_RANGE,
    scope: radianScope(values, units)
  }

  const known = new Set(Object.keys(values))
  const names = symbolsOf(node)
  const stray = names.filter((n) => n !== xName && !known.has(n) && !isBuiltIn(n))
  if (stray.length > 0) {
    if (stray.some((n) => n === yName || n.startsWith(yName + '′') || n.startsWith(yName + '″'))) {
      return { verdict: 'wrong', message: `Write ${yName} as a formula in ${xName} alone, without ${yName} or its derivatives in it.` }
    }
    // eˣ typed for a part in t: the right function in the wrong letter, not a constant to find.
    // It counts as a wrong letter only when, written in the part's own letter, it solves the equation.
    if (stray.length === 1 && stray[0].length === 1 && !names.includes(xName)) {
      const renamed = renameSymbol(node, stray[0], xName)
      // Held to the main check's five points with a value: with none, `worst` is never raised
      // from 0, and √(−1 − x²) was told it only needed writing in t.
      const r = inRadians(() => residualOf(renamed, equation))
      if (r.finite >= 5 && r.worst <= ROUNDING) {
        return { verdict: 'wrong', message: `Write it in ${xName}: your answer uses ${stray[0]}.` }
      }
    }
    const one = stray.length === 1
    return {
      verdict: 'wrong',
      message: `Your answer still has ${listed(stray)} in it: use the starting ${part.initial.length === 1 ? 'condition' : 'conditions'} to find ${one ? 'its value' : 'their values'}.`
    }
  }

  return inRadians((): Check => {
    const { f, d1, finite, worst, symbolic } = residualOf(node, equation)
    const [lo, hi] = equation.range
    if (finite < 5) {
      return {
        verdict: 'wrong',
        message: `Your formula has no value at most points from ${xName} = ${fmtPrecise(lo, settings)} to ${fmtPrecise(hi, settings)}, where the answer must hold.`
      }
    }
    if (worst > ROUNDING) return { verdict: 'wrong', message: NOT_A_SOLUTION }
    let rounded = worst > (symbolic ? EXACT : EXACT_NUMERIC)

    const delta = 0.01 * (hi - lo)
    const misses: string[] = []
    for (const ic of part.initial) {
      let at: number
      let want: number
      // Worked in the equation's own terms — its scope, where a variable drawn in degrees is its
      // radian size, and in radians, where this callback already runs. The degree-mode formula
      // of the raw values made y(0) = θ with θ = 30° "should be 30" for y = θ cos(wx), a
      // solution the equation itself takes, and y(0) = sin 1 the sine of 1°.
      try {
        at = Number(math.evaluate(preprocess(ic.at), { ...equation.scope }))
        want = Number(math.evaluate(preprocess(ic.value), { ...equation.scope }))
      } catch {
        return { verdict: 'unreadable', message: 'PhysLab could not work out this part’s starting condition, so it cannot mark it.' }
      }
      const g = ic.order === 0 ? f : d1
      const got = g(at)
      // Relative to the function's size where the condition is set, never across the whole range:
      // e^(5x) is 148 at x = 1, and against that 1.1 e^(5x) missed y(0) = 1 by "only" 0.07 %. The
      // size just either side of the point keeps y(0) = 0 (sin x) from being held to a band of zero.
      const local = Math.max(0, ...[g(at - delta), g(at + delta)].filter(Number.isFinite).map(Math.abs))
      const scale = Math.max(Math.abs(want), Math.abs(got), local)
      const rel = !Number.isFinite(got) ? Infinity : scale === 0 ? (got === want ? 0 : 1) : Math.abs(got - want) / scale
      const name = `${yName}${ic.order === 1 ? '′' : ''}(${fmtPrecise(at, settings)})`
      if (rel > ROUNDING) misses.push(`${name} should be ${fmtPrecise(want, settings)}`)
      else if (rel > EXACT) rounded = true
    }
    if (misses.length > 0) {
      return { verdict: 'wrong', message: `That solves the equation but does not start where the question says: ${listed(misses)}.` }
    }
    return rounded ? { verdict: 'right', message: ROUNDING_MESSAGE } : { verdict: 'right' }
  })
}

/** A part's equation, compiled once, with where and in what it is checked. */
interface Equation {
  lhs: EvalFunction
  rhs: EvalFunction
  /** Each additive term of both sides: their sizes are the scale a mismatch is measured against. */
  terms: EvalFunction[]
  xName: string
  yName: string
  range: [number, number]
  scope: Record<string, number>
}

/** The formula with every use of one name (not as a function) replaced by another. */
function renameSymbol(node: MathNode, from: string, to: string): MathNode {
  return node.transform((n, path) => (n.type === 'SymbolNode' && path !== 'fn' && (n as SymbolNode).name === from ? new math.SymbolNode(to) : n))
}

/**
 * y := the formula, put into the equation at the seven sample points: how many points gave a
 * value, and the worst mismatch there relative to the size of the equation's terms. Call it in
 * radians.
 */
function residualOf(node: MathNode, eq: Equation): { f: Fn; d1: Fn; finite: number; worst: number; symbolic: boolean } {
  const { xName, yName, range, scope } = eq
  const h = 1e-3 * Math.max(range[1] - range[0], 1e-6)
  const d1Name = `${yName}′`
  const d2Name = `${yName}″`
  const f = asFunction(node, xName, scope)
  const { d1, d2, symbolic } = derivativesOf(node, xName, scope, h)

  let finite = 0
  let worst = 0
  for (const x of samplePoints(range)) {
    const y0 = f(x)
    const y1 = d1(x)
    const y2 = d2(x)
    if (![y0, y1, y2].every(Number.isFinite)) continue
    const at = { ...scope, [xName]: x, [yName]: y0, [d1Name]: y1, [d2Name]: y2 }
    let l: number
    let r: number
    let scale = 0
    try {
      l = Number(eq.lhs.evaluate({ ...at }))
      r = Number(eq.rhs.evaluate({ ...at }))
      for (const t of eq.terms) scale += Math.abs(Number(t.evaluate({ ...at })))
    } catch {
      continue
    }
    if (!Number.isFinite(l) || !Number.isFinite(r) || !Number.isFinite(scale)) continue
    finite++
    // Measured against the size of the equation's own terms, never against a side that is 0:
    // y″ + y = 0 has nothing on the right to be relative to.
    const diff = Math.abs(l - r)
    worst = Math.max(worst, scale === 0 ? (diff === 0 ? 0 : 1) : diff / scale)
  }
  return { f, d1, finite, worst, symbolic }
}

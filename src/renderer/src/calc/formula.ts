// A formula as an answer: what = shows when the line still has a letter in it, and what d/dx gives.
//
// A number is not the only thing a calculator can be right about. x² − 1 has no value until x has one, and
// d/dx(x³ sin x) is a function. Both used to be forced into a number — the first at a hidden x = 0, the
// second into mathjs's own diff() for lists — and came out wrong. Here they come out as what they are.
//
// Nothing is shown until it has been checked (AGENTS.md): a derivative is compared with the slope of the
// line as typed, and a simplified form with the form it came from, at a handful of points. mathjs has no
// notion of the calculator's log (base 10) and ln, and once wrote d/dx 2ˣ with log10 2 where ln 2 belongs, so
// a formula that does not agree with its source is dropped, never shown.

import type { MathNode } from 'mathjs'
import { math } from '../math/expr'
import { CONSTANT_NAMES, GREEK_NAMES } from '../math/names'
import { linearToLatex } from '../math/pure/run'
import { constantScope } from './constants'
import { keypadToMath, withAngle, type ExprNode } from './engine'
import { calcNum } from './format'

/** A formula written three ways: for the screen to read (text), to typeset (tex), and for the engine to read back (src). */
interface Formula {
  text: string
  tex: string
  src: string
}

// ---------------------------------------------------------------------------------------------------------
// Writing a formula as a student reads it
// ---------------------------------------------------------------------------------------------------------

const RAISED = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const raised = (digits: string): string => digits.replace(/\d/g, (d) => RAISED[Number(d)]).replace('-', '⁻')
/** The lower-case letters Unicode has a raised form of (there is none of q). */
const RAISED_LETTERS: Record<string, string> = { a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ' }

/** How tightly an operator binds, so a bracket goes where one is needed and nowhere else. */
const ADD = 1
const MUL = 3
const NEG = 4
const POW = 5
const ATOM = 9

interface Piece {
  s: string
  p: number
  /** A quotient: a/b is not a plain product, so a·(b/c) keeps its brackets. */
  quotient?: boolean
}

const wrap = (x: Piece, tighterThan: number): string => (x.p < tighterThan ? `(${x.s})` : x.s)

/** The names the calculator writes differently from mathjs. */
const SHOWN_NAME: Record<string, string> = { asin: 'arcsin', acos: 'arccos', atan: 'arctan', asec: 'arcsec', acsc: 'arccsc', acot: 'arccot' }

const operandsOf = (n: ExprNode): ExprNode[] => (n.args ?? []) as ExprNode[]
const isOp = (n: ExprNode, fn: string): boolean => n.type === 'OperatorNode' && n.fn === fn

/** What stands between two factors: nothing in 3x or xy, a space in x² sin(x), × between two numbers. */
function between(l: Piece, r: Piece): string {
  if (/^\d/.test(r.s)) return ' × '
  if (/^\(/.test(r.s)) return ''
  if (/^[√∛]/.test(r.s) && /^[\d.]+$/.test(l.s)) return ''
  const functionLike = /^[A-Za-zα-ωΑ-Ω]{2,}/u.test(r.s) || /^[√∛|]/.test(r.s)
  if (functionLike) return ' '
  // A single letter: next to a number or another single letter, it just follows (3x, xy, x²y).
  const leftIsLetters = /(?:^|[^A-Za-zα-ωΑ-Ω])[A-Za-zα-ωΑ-Ω][⁰-⁹⁻]*$/u.test(l.s) || /^[\d.]+$/.test(l.s) || /[⁰-⁹]$/.test(l.s)
  return leftIsLetters ? '' : ' '
}

function piece(n: ExprNode): Piece {
  switch (n.type) {
    case 'ParenthesisNode':
      return piece(n.content as ExprNode)
    case 'ConstantNode': {
      const v = n.value as unknown
      if (typeof v !== 'number') return { s: String(v), p: ATOM }
      return v < 0 ? { s: `−${calcNum(-v)}`, p: NEG } : { s: calcNum(v), p: ATOM }
    }
    case 'SymbolNode':
      return { s: n.name === 'pi' ? 'π' : String(n.name), p: ATOM }
    case 'FunctionNode': {
      const name = String((n.fn as { name?: string }).name ?? n.fn)
      const args = operandsOf(n).map(piece)
      if (name === 'sqrt' && args.length === 1) return { s: `√${/^[\w.π]+$/.test(args[0].s) ? args[0].s : `(${args[0].s})`}`, p: ATOM }
      if (name === 'cbrt' && args.length === 1) return { s: `∛${/^[\w.π]+$/.test(args[0].s) ? args[0].s : `(${args[0].s})`}`, p: ATOM }
      if (name === 'abs' && args.length === 1) return { s: `|${args[0].s}|`, p: ATOM }
      return { s: `${SHOWN_NAME[name] ?? name}(${args.map((a) => a.s).join(', ')})`, p: ATOM }
    }
    case 'OperatorNode': {
      const args = operandsOf(n)
      switch (n.fn) {
        case 'unaryPlus':
          return piece(args[0])
        case 'unaryMinus': {
          const a = piece(args[0])
          return { s: `−${wrap(a, MUL)}`, p: NEG }
        }
        case 'add':
          return args.map(piece).reduce((acc, r, i) => {
            if (i === 0) return r
            // a + (−b) is a − b.
            const cut = r.s.startsWith('−') && r.p >= MUL ? r.s.slice(1) : null
            return { s: cut === null ? `${acc.s} + ${r.s}` : `${acc.s} − ${cut}`, p: ADD }
          })
        case 'subtract': {
          const [a, b] = args.map(piece)
          return { s: `${a.s} − ${b.p <= ADD || b.p === NEG ? `(${b.s})` : b.s}`, p: ADD }
        }
        case 'multiply':
          return args.map(piece).reduce((acc, r, i) => {
            if (i === 0) return acc
            const right = r.p < MUL || r.p === NEG || r.quotient ? `(${r.s})` : r.s
            const left = acc.p < MUL || acc.quotient ? `(${acc.s})` : acc.s
            return { s: `${left}${between(acc, { s: right, p: r.p })}${right}`, p: MUL }
          })
        case 'divide': {
          const [a, b] = args.map(piece)
          return { s: `${wrap(a, MUL)}/${b.p <= MUL || b.p === NEG ? `(${b.s})` : b.s}`, p: MUL, quotient: true }
        }
        case 'pow': {
          const base = piece(args[0])
          const power = args[1]
          const bare = isOp(power, 'unaryMinus') ? operandsOf(power)[0] : power
          const digits = bare.type === 'ConstantNode' && Number.isInteger(bare.value) ? String(bare.value) : null
          // √x² would read as the root of x², so a root in the base keeps its brackets.
          const lower = /^[√∛]/.test(base.s) ? `(${base.s})` : wrap(base, ATOM)
          if (digits !== null) return { s: `${lower}${raised(isOp(power, 'unaryMinus') ? `-${digits}` : digits)}`, p: POW }
          // One letter raised too, as eˣ and xˣ: anything longer would need a raised raised, and keeps its bracket.
          const letter = piece(power).s
          if (/^−?[a-pr-z]$/.test(letter)) return { s: `${lower}${letter.replace('−', '⁻').replace(/[a-pr-z]/, (c) => RAISED_LETTERS[c])}`, p: POW }
          return { s: `${lower}^${wrap(piece(power), ATOM)}`, p: POW }
        }
      }
      break
    }
  }
  return { s: n.toString(), p: ATOM }
}

const FORWARD_TRIG = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot'])
const INVERSE_TRIG = new Set(['asin', 'acos', 'atan', 'atan2'])

/**
 * A line written for the calculator in the angle unit it is on, as the same line in radians: sin(x) is sin(x × 180 / π) in
 * DEG, asin(y) is asin(y) × π / 180. For the picture of a calculus answer: ∫, d/dx and the tangent are worked in radians, but
 * the viewport draws a curve with the screen's unit, and a tangent of cos 30 rad laid on the curve sin 30° is not that curve's
 * tangent. In RAD the line is returned as it was.
 */
export function inRadians(src: string, angle: 'deg' | 'rad'): string {
  if (angle === 'rad') return src
  const turn = (node: MathNode): MathNode => {
    const mapped = node.map(turn)
    if (!math.isFunctionNode(mapped)) return mapped
    const name = mapped.fn.name
    const args = mapped.args as MathNode[]
    if (FORWARD_TRIG.has(name) && args.length === 1) {
      const radians = new math.OperatorNode('/', 'divide', [new math.OperatorNode('*', 'multiply', [args[0], new math.ConstantNode(180)]), new math.SymbolNode('pi')])
      return new math.FunctionNode(name, [radians])
    }
    if (INVERSE_TRIG.has(name)) return new math.OperatorNode('/', 'divide', [new math.OperatorNode('*', 'multiply', [mapped, new math.SymbolNode('pi')]), new math.ConstantNode(180)])
    return mapped
  }
  try {
    return turn(math.parse(src)).toString({ parenthesis: 'auto', implicit: 'show' })
  } catch {
    return src
  }
}

/** A formula in all three of its writings. */
export function formulaOf(node: MathNode): Formula {
  const src = node.toString({ parenthesis: 'auto', implicit: 'show' })
  // ln and log are functions, typeset as such; a single letter mathjs also knows as a unit (A, C, F) is drawn upright as \mathrm{C}, but in a formula it is a letter.
  const tex = linearToLatex(sideBySide(node).toString({ parenthesis: 'auto', implicit: 'hide' }))
    .replace(/\\mathrm\{(ln|log)\}/g, '\\$1')
    .replace(/\\mathrm\{([A-Za-z])\}/g, '$1')
  return { text: piece(node as ExprNode).s, tex, src }
}

/**
 * The tree with every product whose right side is not a number written as an implicit one, which is typeset side by side:
 * a textbook writes 3x² sin x, not 3 · x² · sin x. Children first, so a product inside a product is turned too (mathjs
 * would otherwise bracket the one that was not).
 */
function sideBySide(node: MathNode): MathNode {
  const mapped = node.map(sideBySide)
  return math.isOperatorNode(mapped) && mapped.fn === 'multiply' && mapped.args.length === 2 && !math.isConstantNode(mapped.args[1]) ? new math.OperatorNode('*', 'multiply', mapped.args, true) : mapped
}

// ---------------------------------------------------------------------------------------------------------
// Checking a formula against the line it came from
// ---------------------------------------------------------------------------------------------------------

/** Points to try a formula at: ordinary numbers that keep clear of the places a function breaks. */
const SAMPLES = [0.31, 0.77, 1.23, 1.9, 2.6, 3.4, 5.7, 8.3, 13.1, 21.7]

/** Fewer agreeing points than this and the formula has not been checked. */
const NEEDED = 3

/** The letters a node names that are values (not the name of a function it calls). */
function lettersOf(node: MathNode): string[] {
  const names = new Set<string>()
  node.traverse((n, path) => {
    if (math.isSymbolNode(n) && path !== 'fn') names.add(n.name)
  })
  return [...names]
}

const CONSTANTS = constantScope()

/** A name mathjs reads as a unit (C, A, F, N…): after a number it is that unit, and it is never a letter of ours. */
const isUnitSymbol = (name: string): boolean => {
  try {
    return math.Unit.isValuelessUnit(name)
  } catch {
    return false
  }
}

/** A letter that stands for something already: π, e, i, a physical constant. */
const isKnownValue = (name: string): boolean => name in CONSTANTS || name in math

/**
 * What every letter of the node is worth at the k-th sample: the stored value when there is one, a constant's
 * own value, and a sample number for anything else. The variable itself is `at`.
 */
function scopeAt(names: string[], vars: Record<string, unknown>, variable: string | null, at: number, k: number): Record<string, unknown> {
  const scope: Record<string, unknown> = { ...CONSTANTS }
  names.forEach((name, i) => {
    if (name === variable) scope[name] = at
    else if (typeof vars[name] === 'number') scope[name] = vars[name]
    else if (!isKnownValue(name)) scope[name] = SAMPLES[(k + 2 * i + 1) % SAMPLES.length]
  })
  return scope
}

/**
 * The slope of f at x by the five-point rule, or NaN where it cannot be trusted: worked with a step and with half of it,
 * the two must agree to 10⁻⁸. A function that changes fast (eˣ² at x = 20) is not slope-able by any one step, and
 * the point is left out of the comparison rather than made to fail it.
 */
function slopeOf(f: (x: number) => number, x: number): number {
  const at = (h: number): number => (-f(x + 2 * h) + 8 * f(x + h) - 8 * f(x - h) + f(x - 2 * h)) / (12 * h)
  const h = 1e-3 * Math.max(1, Math.abs(x))
  const coarse = at(h)
  const fine = at(h / 2)
  return closeTo(coarse, fine, 1e-8) ? fine : NaN
}

const closeTo = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b))

/** The value of a compiled node at a scope, in radians (calculus is), or NaN. */
function valueOf(code: { evaluate: (scope: Record<string, unknown>) => unknown }, scope: Record<string, unknown>): number {
  try {
    const v = code.evaluate(scope)
    return typeof v === 'number' ? v : NaN
  } catch {
    return NaN
  }
}

/** Whether `derived` is the derivative of `source` with respect to `variable`, at enough points to be sure. */
function isDerivativeOf(derived: MathNode, source: MathNode, variable: string, vars: Record<string, unknown>): boolean {
  const names = [...new Set([...lettersOf(derived), ...lettersOf(source), variable])]
  const f = source.compile()
  const d = derived.compile()
  return withAngle('rad', () => {
    let agreed = 0
    for (let k = 0; k < SAMPLES.length; k++) {
      const at = SAMPLES[k]
      const slope = slopeOf((x) => valueOf(f, scopeAt(names, vars, variable, x, k)), at)
      const claimed = valueOf(d, scopeAt(names, vars, variable, at, k))
      if (!Number.isFinite(slope) || !Number.isFinite(claimed)) continue
      if (!closeTo(slope, claimed, 1e-6)) return false
      agreed++
    }
    return agreed >= NEEDED
  })
}

/**
 * Whether the node is a number at enough points once its letters have numbers: a formula. A comparison (1 < x < 3), a
 * call with the wrong number of arguments (divide(x, 2, 3)) and a line no number makes sense of are not formulas, and
 * keep the refusal they had instead of being shown as if they were an answer.
 */
function isFormula(node: MathNode, vars: Record<string, unknown>): boolean {
  const names = lettersOf(node)
  const f = node.compile()
  return withAngle('rad', () => {
    let numbers = 0
    for (let k = 0; k < SAMPLES.length; k++) if (Number.isFinite(valueOf(f, scopeAt(names, vars, null, 0, k)))) numbers++
    return numbers >= NEEDED
  })
}

/**
 * Whether two nodes are the same function of their letters: 'same' when they agree at enough points to be sure, 'different'
 * when they part at any point both have a value, and 'unknown' when too few points have a value in both to say. Worked in
 * radians, as both sides are written the same way.
 */
export function compareFunctions(a: MathNode, b: MathNode, vars: Record<string, unknown> = {}): 'same' | 'different' | 'unknown' {
  const names = [...new Set([...lettersOf(a), ...lettersOf(b)])]
  const fa = a.compile()
  const fb = b.compile()
  return withAngle('rad', () => {
    let agreed = 0
    for (let k = 0; k < SAMPLES.length; k++) {
      const scope = scopeAt(names, vars, null, 0, k)
      const va = valueOf(fa, scope)
      const vb = valueOf(fb, scope)
      if (!Number.isFinite(va) || !Number.isFinite(vb)) continue
      if (!closeTo(va, vb, 1e-9)) return 'different'
      agreed++
    }
    return agreed >= NEEDED ? 'same' : 'unknown'
  })
}

/**
 * The points an antiderivative is tried at, on both sides of ±1 and of 0. An arctanh is real on (−1, 1) only and ln x on x > 0 only,
 * so each form needs six points of its own stretch of the line, or the check could never say "the same" for it.
 */
const ANTIDERIVATIVE_POINTS = [-7.3, -3.1, -1.7, -0.85, -0.6, -0.35, -0.12, 0.27, 0.58, 0.81, 1.23, 1.9, 2.2, 2.6, 3.4, 4.4, 5.7, 8.3, 13.1]

/** Points at which two antiderivatives must agree before they are called the same. */
const ANTIDERIVATIVE_NEEDED = 6

/**
 * The step an antiderivative's slope is worked with: 10⁻⁵ of the point, far smaller than slopeOf's. At slopeOf's 10⁻³ the five-point rule
 * is wrong by about three parts in a million for e^(−100x), which a 10⁻⁷ check would reject at every point; at 10⁻⁵ it is far inside it.
 */
const ANTIDERIVATIVE_STEP = 1e-5

/**
 * The rounding a slope carries, per unit of the largest value the rule reads, over its step. A double holds about 2×10⁻¹⁶ of a value and the
 * rule adds up about 18 of them, so 10⁻¹⁴ leaves a margin of some thirty times the real rounding and no more.
 */
const ROUNDING_PER_VALUE = 1e-14

/** A slope is counted only when it is this many times its own rounding: a smaller slope cannot be told from rounding, and is left out. */
const COUNT_OVER_ROUNDING = 1e3

/** A slope and the rounding it carries. */
interface AntiderivativeSlope {
  value: number
  noise: number
}

/**
 * The slope of f at x by the five-point rule at ANTIDERIVATIVE_STEP (scaled by x, or by 1 near 0), or null where it cannot be trusted. The rule
 * is worked at the step and at half of it, and the two must agree to 10⁻⁷ of the slope and to the rounding. Nothing is judged against a fixed
 * floor: an integrand of 10⁻⁹ or 10⁻¹⁹ has slopes of that size, so its rounding is that size too, and it is checked as what it is.
 */
function antiderivativeSlope(f: (x: number) => number, x: number): AntiderivativeSlope | null {
  const step = ANTIDERIVATIVE_STEP * Math.max(1, Math.abs(x))
  const rule = (h: number): { slope: number; largest: number } | null => {
    const m2 = f(x - 2 * h)
    const m1 = f(x - h)
    const p1 = f(x + h)
    const p2 = f(x + 2 * h)
    if (![m2, m1, p1, p2].every(Number.isFinite)) return null
    return { slope: (m2 - 8 * m1 + 8 * p1 - p2) / (12 * h), largest: Math.max(Math.abs(m2), Math.abs(m1), Math.abs(p1), Math.abs(p2)) }
  }
  const coarse = rule(step)
  const fine = rule(step / 2)
  if (!coarse || !fine) return null
  const noise = (ROUNDING_PER_VALUE * Math.max(coarse.largest, fine.largest)) / (step / 2)
  if (Math.abs(coarse.slope - fine.slope) > 1e-7 * Math.abs(fine.slope) + noise) return null
  return { value: fine.slope, noise }
}

/**
 * A single letter, a subscripted one (a_1, which the reader leaves whole on purpose, or a1 once the converter has dropped the underscore), or a
 * word the calculator knows: a constant, or a Greek letter spelt out (theta).
 */
const isPlainName = (name: string): boolean =>
  name.length === 1 || name.includes('_') || /^[A-Za-z]\d+$/.test(name) || isKnownValue(name) || GREEK_NAMES.has(name) || CONSTANT_NAMES.has(name)

/**
 * Whether two indefinite integrals, written without their + C, are the same antiderivative: their slopes in `variable` agree at enough
 * points where both are real. Two antiderivatives of one line differ by a constant on each stretch where both are real, and a slope
 * does not see a constant, so ½ ln|(x − 1)/(x + 1)| + 3 and ½ ln|x − 1| − ½ ln|x + 1| are the same answer. 'different' when the slopes
 * part at a point both have a value and are bigger than their own rounding, and 'unknown' when too few points are real in both, or the slopes
 * are too small to tell from rounding, to say. Any other letter (a parameter) is held
 * at one value for each point's slopes, so only the variable moves while the slopes are taken.
 */
export function sameAntiderivative(a: MathNode, b: MathNode, variable: string): 'same' | 'different' | 'unknown' {
  const names = [...new Set([...lettersOf(a), ...lettersOf(b), variable])]
  // A longer name nobody knows is a run of letters the converter glued together and nothing split (xe for x·e). Held at one value it
  // would be a constant beside a function, so nothing is claimed about the pair.
  if (names.some((name) => !isPlainName(name))) return 'unknown'
  // The variable must occur in one of the two. With it in neither, every slope is exactly zero and every point is left out, so nothing is
  // compared. A letter the answers spell differently from the line's (θ for theta) is that case: it is unknown here, never agreed.
  if (!lettersOf(a).includes(variable) && !lettersOf(b).includes(variable)) return 'unknown'
  const fa = a.compile()
  const fb = b.compile()
  return withAngle('rad', () => {
    let agreed = 0
    for (let k = 0; k < ANTIDERIVATIVE_POINTS.length; k++) {
      const at = (x: number): Record<string, unknown> => scopeAt(names, {}, variable, x, k)
      const slopeA = antiderivativeSlope((x) => valueOf(fa, at(x)), ANTIDERIVATIVE_POINTS[k])
      const slopeB = antiderivativeSlope((x) => valueOf(fb, at(x)), ANTIDERIVATIVE_POINTS[k])
      if (!slopeA || !slopeB) continue
      const noise = slopeA.noise + slopeB.noise
      const size = Math.max(Math.abs(slopeA.value), Math.abs(slopeB.value))
      // A slope no bigger than its own rounding is not a slope: the point counts for neither agreement nor disagreement.
      if (size <= COUNT_OVER_ROUNDING * noise) continue
      // The tolerance is relative to the slope at this point (10⁻⁷ of it) plus its rounding, never a fixed size.
      if (Math.abs(slopeA.value - slopeB.value) > 1e-7 * size + noise) return 'different'
      agreed++
    }
    return agreed >= ANTIDERIVATIVE_NEEDED ? 'same' : 'unknown'
  })
}

const sameFunction = (a: MathNode, b: MathNode, vars: Record<string, unknown>): boolean => compareFunctions(a, b, vars) === 'same'

// ---------------------------------------------------------------------------------------------------------
// Reading a line as a formula
// ---------------------------------------------------------------------------------------------------------

/** The line's tree with every stored letter (but `keep`) replaced by its number: A x² with A = 3 is 3x². */
function withStoredValues(node: MathNode, vars: Record<string, unknown>, keep: string | null): MathNode {
  return node.transform((n, path) => {
    if (math.isSymbolNode(n) && path !== 'fn' && n.name !== keep) {
      const v = vars[n.name]
      if (typeof v === 'number' && Number.isFinite(v)) return new math.ConstantNode(v)
    }
    return n
  })
}

/**
 * The same tree with the log functions renamed between the calculator's spelling and mathjs's: the
 * calculator's ln is mathjs's log, and the calculator's log is mathjs's log10. Null when a log takes two
 * arguments, whose order the two disagree about.
 */
function renameLogs(node: MathNode, toMathjs: boolean): MathNode | null {
  let refused = false
  const out = node.transform((n) => {
    if (!math.isFunctionNode(n)) return n
    const name = n.fn.name
    const args = n.args as MathNode[]
    if (name === 'log' && args.length !== 1) refused = true
    const next = toMathjs ? (name === 'ln' ? 'log' : name === 'log' ? 'log10' : name) : name === 'log' ? 'ln' : name === 'log10' ? 'log' : name
    return next === name ? n : new math.FunctionNode(next, args)
  })
  return refused ? null : out
}

/**
 * d/dv of `body` as a formula, or null when mathjs cannot differentiate it or what it gave does not agree with
 * the slope of the line as typed (the caller then asks the algebra engine). Radians, as every textbook derivative
 * is: DEG is a setting for the angle of sin(30), and d/dx sin x is cos x in it.
 */
export function derivativeForm(body: string, variable: string, vars: Record<string, unknown>): Formula | null {
  try {
    const source = withStoredValues(math.parse(keypadToMath(body)), vars, variable)
    // ax is a product of two letters to the student and one unknown name to mathjs, whose derivative of it is 0: the
    // algebra engine reads it as the product it is.
    if (lettersOf(source).some((name) => name.length > 1 && !isKnownValue(name) && !isUnitSymbol(name))) return null
    const forMathjs = renameLogs(source, true)
    if (!forMathjs) return null
    const found = renameLogs(math.derivative(forMathjs, variable), false)
    if (!found || !isDerivativeOf(found, source, variable, vars)) return null
    return formulaOf(found)
  } catch {
    return null
  }
}

/**
 * The letters of a line that stand for nothing yet: the calculator's own letters with no value stored, and
 * nothing else. A name that is not a letter of the calculator (foo) is a mistake, and keeps its error.
 */
function unassignedLetters(node: MathNode, vars: Record<string, unknown>, own: RegExp): string[] {
  const { lone } = unitUses(node)
  return lettersOf(node).filter((name) => own.test(name) && typeof vars[name] !== 'number' && !isKnownValue(name) && (!isUnitSymbol(name) || lone.includes(name)))
}

/**
 * Whether the rightmost thing of a factor is a number, so that a unit symbol written right after it is that number's unit: the 1.6 of 1.6 C,
 * the 10⁻¹⁹ of 1.6×10⁻¹⁹ C, the π of 2π C, the bracketed (2 + 3) of (2 + 3) C.
 */
function endsInNumber(n: MathNode): boolean {
  const numeric = (m: MathNode): boolean => {
    let ok = true
    m.traverse((c, path) => {
      if (math.isSymbolNode(c) && path !== 'fn' && !isKnownValue(c.name)) ok = false
    })
    return ok
  }
  if (math.isConstantNode(n)) return true
  if (math.isParenthesisNode(n)) return numeric(n.content)
  if (math.isSymbolNode(n)) return isKnownValue(n.name)
  if (math.isFunctionNode(n)) return (n.args as MathNode[]).every(numeric)
  if (!math.isOperatorNode(n)) return false
  const args = n.args as MathNode[]
  switch (n.fn) {
    case 'unaryMinus':
    case 'unaryPlus':
      return endsInNumber(args[0])
    case 'multiply':
      return endsInNumber(args[1])
    case 'pow':
      return numeric(args[0])
    default:
      return false
  }
}

/**
 * The unit symbols of a line (C, A, F, N, m…) split by how they stand: a unit when it comes right after a number, as in 1.6 C, 10^(-19) C or
 * 5 N × 2 m — and a letter when it does not. A lone A, B, C or F, in x + A or A + 1 or C x, has no number before it, and the unit of nothing
 * is not a unit: it is the calculator's letter of that name (the rule 3C is three coulombs, said the other way round).
 */
function unitUses(root: MathNode): { units: string[]; lone: string[] } {
  const units: string[] = []
  const lone: string[] = []
  const walk = (n: MathNode, parent: MathNode | null, grand: MathNode | null, isName: boolean): void => {
    if (math.isSymbolNode(n) && !isName && isUnitSymbol(n.name)) {
      // A raised unit (mol^-1, C^2) is a quantity: it is the power that stands after the number.
      const raised = !!parent && math.isOperatorNode(parent) && parent.fn === 'pow' && (parent.args as MathNode[])[0] === n
      const slot: MathNode = raised ? parent : n
      const holder = raised ? grand : parent
      const after = !!holder && math.isOperatorNode(holder) && holder.fn === 'multiply' && (holder.args as MathNode[])[1] === slot && endsInNumber((holder.args as MathNode[])[0])
      ;(after ? units : lone).push(n.name)
      return
    }
    n.forEach((child, path) => walk(child, n, parent, path === 'fn'))
  }
  walk(root, null, null, false)
  return { units, lone }
}

/**
 * The calculator's own letters (A, B, C, F: the ones mathjs also knows as units) that stand alone in the line with nothing stored for them, when
 * the line has no quantity in it. For such a line the numeric reading, which would take the lone C for the coulomb, is not the student's.
 */
export function loneUnitLetters(src: string, vars: Record<string, unknown>, own: RegExp): string[] {
  try {
    const parsed = math.parse(keypadToMath(src))
    // A = 5 is a refusal of its own (typing it stores nothing); it is not a formula in the letter A.
    let top = parsed
    while (math.isParenthesisNode(top)) top = top.content
    if (math.isAssignmentNode(top) || math.isFunctionAssignmentNode(top)) return []
    const { units, lone } = unitUses(withStoredValues(parsed, vars, null))
    return units.length ? [] : [...new Set(lone)].filter((name) => own.test(name) && typeof vars[name] !== 'number')
  } catch {
    return []
  }
}

/** Whether the line has a quantity in it — a unit right after a number, 5 N or 1.6 C — which makes it a line of units, not of letters. */
export function hasQuantity(src: string, vars: Record<string, unknown>): boolean {
  try {
    return unitUses(withStoredValues(math.parse(keypadToMath(src)), vars, null)).units.length > 0
  } catch {
    return false
  }
}

/** The calculus and the series of the numeric engine: a line built on one is an answer to work out, not a formula to tidy. */
const WORKS = new Set(['ddx', 'integral', 'sigma', 'product', 'diff', 'integrate'])
const callsWork = (node: MathNode): boolean => {
  let found = false
  node.traverse((n) => {
    if (math.isFunctionNode(n) && WORKS.has(n.fn.name)) found = true
  })
  return found
}

/**
 * A line with a letter in it, as the simplest formula that is the same function, or null when the line is
 * not one (a name nobody knows, a unit, anything the checker does not agree with). The stored letters are
 * replaced by their numbers first, so only the letters with no value stay.
 */
export function openForm(src: string, vars: Record<string, unknown>, own: RegExp): { form: Formula; letters: string[] } | null {
  try {
    const parsed = math.parse(keypadToMath(src))
    const node = withStoredValues(parsed, vars, null)
    if (callsWork(node)) return null
    const letters = unassignedLetters(node, vars, own)
    if (!letters.length) return null
    // Every other name in it must be something the calculator can give a number to.
    const stray = lettersOf(node).filter((name) => !letters.includes(name) && !isKnownValue(name))
    // A quantity in the line (5 N, 1.6 C) makes it a line of units, not a formula in letters.
    if (unitUses(node).units.length) return null
    if (stray.length || !isFormula(node, vars)) return null
    let shown: MathNode = node
    try {
      const simpler = math.simplify(node)
      // Only when it is shorter: simplify turns (x³ − 6x² + 11x − 6)/(x − 1) into (x³ + 11x − 6(x² + 1))/(x − 1), the same function
      // in a form nobody would write. 2x + 3x → 5x is the kind of change it is for.
      if (simpler.toString().length <= node.toString().length && sameFunction(simpler, node, vars)) shown = simpler
    } catch {
      // simplify gave up: the line as typed, tidied, is still the answer.
    }
    return { form: formulaOf(shown), letters }
  } catch {
    return null
  }
}

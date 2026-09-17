// Expression layer shared by the command bar, dependent objects and graphs.
// - preprocess(): friendly syntax (×, ·, |A|, <3,4>, (3,4), 10∠30°, π, √) → mathjs syntax
// - math: a mathjs instance with vector/geometry helpers and angle-mode-aware trig
// - inferKind(): is an expression a number, point or vector?
// - compileScalar(): mathjs AST → fast native JS function for graph sampling

import { all, create, type MathNode } from 'mathjs'
import { angleBetween, cross as vcross, dot as vdot, len, normalize, project, type V3 } from './vec'

export const math = create(all, { number: 'number', precision: 64 })

let angleMode: 'deg' | 'rad' = 'deg'
export const setAngleMode = (m: 'deg' | 'rad') => {
  angleMode = m
}
export const getAngleMode = () => angleMode

type AnyVal = unknown

const isUnit = (x: AnyVal): x is { toNumber: (u: string) => number; formatUnits: () => string } =>
  typeof x === 'object' && x !== null && typeof (x as { toNumber?: unknown }).toNumber === 'function' && typeof (x as { formatUnits?: unknown }).formatUnits === 'function'

/** Angle argument → radians (numbers follow the angle mode, units convert). */
export function toRadians(x: AnyVal): number {
  if (isUnit(x)) return x.toNumber('rad')
  const n = Number(x)
  return angleMode === 'deg' ? (n * Math.PI) / 180 : n
}

/** Radians → the current angle mode. */
export const fromRadians = (r: number): number => (angleMode === 'deg' ? (r * 180) / Math.PI : r)

/** Strip a physical unit to its numeric value (in its own unit). */
export function plainNumber(x: AnyVal): number {
  if (isUnit(x)) return x.toNumber(x.formatUnits())
  return Number(x)
}

export function toV3(x: AnyVal): V3 {
  let arr: unknown = x
  if (arr && typeof arr === 'object' && typeof (arr as { toArray?: unknown }).toArray === 'function') {
    arr = (arr as { toArray: () => unknown }).toArray()
  }
  if (!Array.isArray(arr)) throw new Error('Expected a vector or point')
  const flat = (arr as unknown[]).flat(2).map((v) => plainNumber(v))
  if (flat.length < 2 || flat.length > 3) throw new Error('Vectors need 2 or 3 components')
  return [flat[0], flat[1], flat[2] ?? 0]
}

// Keep the original mathjs trig for complex numbers and matrices.
const origTrig: Record<string, (v: AnyVal) => AnyVal> = {}
for (const name of ['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'asin', 'acos', 'atan', 'atan2']) {
  origTrig[name] = (math as unknown as Record<string, (v: AnyVal) => AnyVal>)[name]
}
const origLog = (math as unknown as Record<string, (v: AnyVal) => AnyVal>).log

math.import(
  {
    sin: (x: AnyVal) => (typeof x === 'number' || isUnit(x) ? Math.sin(toRadians(x)) : origTrig.sin(x)),
    cos: (x: AnyVal) => (typeof x === 'number' || isUnit(x) ? Math.cos(toRadians(x)) : origTrig.cos(x)),
    tan: (x: AnyVal) => (typeof x === 'number' || isUnit(x) ? Math.tan(toRadians(x)) : origTrig.tan(x)),
    sec: (x: AnyVal) => 1 / Math.cos(toRadians(x)),
    csc: (x: AnyVal) => 1 / Math.sin(toRadians(x)),
    cot: (x: AnyVal) => 1 / Math.tan(toRadians(x)),
    asin: (x: AnyVal) => (typeof x === 'number' && Math.abs(x) <= 1 ? fromRadians(Math.asin(x)) : origTrig.asin(x)),
    acos: (x: AnyVal) => (typeof x === 'number' && Math.abs(x) <= 1 ? fromRadians(Math.acos(x)) : origTrig.acos(x)),
    atan: (x: AnyVal) => (typeof x === 'number' ? fromRadians(Math.atan(x)) : origTrig.atan(x)),
    atan2: (y: AnyVal, x: AnyVal) => fromRadians(Math.atan2(Number(y), Number(x))),
    // Casio convention: log(x) is base 10, log(a, b) is log base a of b, ln is natural.
    ln: (x: AnyVal) => (typeof x === 'number' && x > 0 ? Math.log(x) : origLog(x)),
    log: (a: AnyVal, b?: AnyVal) => {
      if (b === undefined) return typeof a === 'number' && a > 0 ? Math.log10(a) : math.divide(origLog(a) as never, Math.LN10)
      return Math.log(Number(b)) / Math.log(Number(a))
    },
    // vector & geometry helpers
    pt: (...c: AnyVal[]) => [plainNumber(c[0]), plainNumber(c[1]), c.length > 2 ? plainNumber(c[2]) : 0],
    vec: (...c: AnyVal[]) => [plainNumber(c[0]), plainNumber(c[1]), c.length > 2 ? plainNumber(c[2]) : 0],
    polarVec: (r: AnyVal, theta: AnyVal) => {
      const m = plainNumber(r)
      const t = toRadians(theta)
      return [m * Math.cos(t), m * Math.sin(t), 0]
    },
    cross: (a: AnyVal, b: AnyVal) => vcross(toV3(a), toV3(b)),
    dot: (a: AnyVal, b: AnyVal) => vdot(toV3(a), toV3(b)),
    mag: (a: AnyVal) => (typeof a === 'number' ? Math.abs(a) : isUnit(a) ? math.abs(a as never) : len(toV3(a))),
    unitVec: (a: AnyVal) => normalize(toV3(a)),
    angleBetween: (a: AnyVal, b: AnyVal) => fromRadians(angleBetween(toV3(a), toV3(b))),
    proj: (b: AnyVal, a: AnyVal) => project(toV3(b), toV3(a)),
    comps: (a: AnyVal) => toV3(a),
    xcomp: (a: AnyVal) => toV3(a)[0],
    ycomp: (a: AnyVal) => toV3(a)[1],
    zcomp: (a: AnyVal) => toV3(a)[2],
    direction: (a: AnyVal) => {
      const v = toV3(a)
      let t = Math.atan2(v[1], v[0])
      if (t < 0) t += 2 * Math.PI
      return fromRadians(t)
    },
    distance: (a: AnyVal, b: AnyVal) => len(vsub(toV3(a), toV3(b))),
    midpoint: (a: AnyVal, b: AnyVal) => {
      const p = toV3(a)
      const q = toV3(b)
      return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]
    }
  },
  { override: true }
)

function vsub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

// ---------------------------------------------------------------------------
// Friendly syntax → mathjs syntax
// ---------------------------------------------------------------------------

const IDENT = /[A-Za-z0-9_Ͱ-Ͽ']/

/** Finds the index of the bracket matching the one at `open`. */
function matchForward(s: string, open: number): number {
  const o = s[open]
  const c = o === '(' ? ')' : o === '[' ? ']' : '}'
  let depth = 0
  for (let i = open; i < s.length; i++) {
    if (s[i] === o) depth++
    else if (s[i] === c && --depth === 0) return i
  }
  return -1
}

function matchBackward(s: string, close: number): number {
  const c = s[close]
  const o = c === ')' ? '(' : c === ']' ? '[' : '{'
  let depth = 0
  for (let i = close; i >= 0; i--) {
    if (s[i] === c) depth++
    else if (s[i] === o && --depth === 0) return i
  }
  return -1
}

function hasTopLevelComma(s: string): boolean {
  let depth = 0
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (ch === ',' && depth === 0) return true
  }
  return false
}

/** `(3, 4)` → `pt(3, 4)` when the parentheses are not a function call. */
function tuplesToPoints(s: string): string {
  let out = ''
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (ch === '(') {
      let j = out.length - 1
      while (j >= 0 && out[j] === ' ') j--
      const prev = j >= 0 ? out[j] : ''
      const close = matchForward(s, i)
      if (close < 0) {
        out += s.slice(i)
        break
      }
      const inner = tuplesToPoints(s.slice(i + 1, close))
      const isCall = prev !== '' && (IDENT.test(prev) || prev === ')' || prev === ']')
      out += !isCall && hasTopLevelComma(inner) ? `pt(${inner})` : `(${inner})`
      i = close + 1
    } else {
      out += ch
      i++
    }
  }
  return out
}

function leftOperandStart(s: string, end: number): number {
  let i = end
  while (i >= 0 && s[i] === ' ') i--
  if (i < 0) return -1
  if (s[i] === ')' || s[i] === ']') {
    const open = matchBackward(s, i)
    if (open < 0) return -1
    i = open - 1
    while (i >= 0 && IDENT.test(s[i])) i--
    return i + 1
  }
  while (i >= 0 && (IDENT.test(s[i]) || s[i] === '.')) i--
  return i + 1
}

function rightOperandEnd(s: string, start: number): number {
  let i = start
  while (i < s.length && s[i] === ' ') i++
  if (s[i] === '-') i++
  if (s[i] === '(' || s[i] === '[') return matchForward(s, i)
  while (i < s.length && (IDENT.test(s[i]) || s[i] === '.')) i++
  if (s[i] === '(') return matchForward(s, i)
  return i - 1
}

/** Rewrites infix `a × b` into `fn(a, b)`. */
function infixToCall(s: string, op: string, fn: string): string {
  let guard = 0
  let idx = s.indexOf(op)
  while (idx >= 0 && guard++ < 100) {
    const ls = leftOperandStart(s, idx - 1)
    const re = rightOperandEnd(s, idx + op.length)
    if (ls < 0 || re < idx) break
    const left = s.slice(ls, idx).trim()
    const right = s.slice(idx + op.length, re + 1).trim()
    s = `${s.slice(0, ls)}${fn}(${left}, ${right})${s.slice(re + 1)}`
    idx = s.indexOf(op)
  }
  return s
}

export function preprocess(src: string): string {
  let s = src
    .replace(/[−–]/g, '-')
    .replace(/÷/g, '/')
    .replace(/π/g, 'pi')
    .replace(/θ/g, 'theta')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/√\s*([A-Za-z0-9_.]+)/g, 'sqrt($1)')
    .replace(/∛\s*\(/g, 'cbrt(')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/⁻¹/g, '^(-1)')
    .replace(/µ|μ/g, 'u')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/≠/g, '!=')
    .replace(/\*\*/g, '^')
  // magnitude/angle notation: 10 ∠ 30°, 10 N at 30°
  s = s.replace(
    /(\d+(?:\.\d+)?(?:e[-+]?\d+)?(?:\s*[A-Za-z]+(?:\/[A-Za-z]+)?(?:\^-?\d+)?)?)\s*(?:∠|\bat\b)\s*(-?\d+(?:\.\d+)?\s*°?|-?[A-Za-z_]\w*\s*°?|\([^()]*\)\s*°?)/g,
    'polarVec($1, $2)'
  )
  s = s.replace(/°/g, ' deg')
  s = s.replace(/[⟨<]([^<>=⟨⟩]*,[^<>=⟨⟩]*)[⟩>]/g, 'vec($1)')
  s = s.replace(/\|([^|]+)\|/g, 'mag($1)')
  s = tuplesToPoints(s)
  s = infixToCall(s, '×', 'cross')
  s = infixToCall(s, '·', 'dot')
  s = infixToCall(s, '⋅', 'dot')
  return s
}

// ---------------------------------------------------------------------------
// Kind inference
// ---------------------------------------------------------------------------

export type ValueKind = 'number' | 'point' | 'vector' | 'unknown'

const POINT_FNS = new Set(['pt', 'midpoint', 'Point', 'Midpoint'])
const VECTOR_FNS = new Set(['vec', 'cross', 'unitVec', 'polarVec', 'proj', 'comps', 'Vector', 'UnitVector'])

export function inferKind(node: MathNode, kindOf: (name: string) => ValueKind | undefined): ValueKind {
  const n = node as MathNode & Record<string, unknown>
  switch (node.type) {
    case 'ConstantNode':
      return 'number'
    case 'SymbolNode': {
      const name = n.name as string
      if (name === 'i' || name === 'j' || name === 'k') return kindOf(name) ?? 'vector'
      return kindOf(name) ?? 'number'
    }
    case 'ParenthesisNode':
      return inferKind(n.content as MathNode, kindOf)
    case 'ArrayNode':
      return 'vector'
    case 'FunctionNode': {
      const fname = ((n.fn as { name?: string })?.name ?? '') as string
      if (POINT_FNS.has(fname)) return 'point'
      if (VECTOR_FNS.has(fname)) return 'vector'
      return 'number'
    }
    case 'OperatorNode': {
      const args = n.args as MathNode[]
      const fn = n.fn as string
      if (args.length === 1) return inferKind(args[0], kindOf)
      const [ka, kb] = [inferKind(args[0], kindOf), inferKind(args[1], kindOf)]
      const geo = (k: ValueKind) => k === 'point' || k === 'vector'
      if (fn === 'add') {
        if (ka === 'point' || kb === 'point') return 'point'
        if (ka === 'vector' || kb === 'vector') return 'vector'
        return 'number'
      }
      if (fn === 'subtract') {
        if (ka === 'point' && kb === 'point') return 'vector'
        if (ka === 'point') return 'point'
        if (geo(ka) || geo(kb)) return 'vector'
        return 'number'
      }
      if (fn === 'multiply') {
        if (geo(ka) && geo(kb)) return 'number' // dot product
        if (geo(ka)) return ka
        if (geo(kb)) return kb
        return 'number'
      }
      if (fn === 'divide') return geo(ka) ? ka : 'number'
      return 'number'
    }
    default:
      return 'unknown'
  }
}

/** Free symbol names used in an expression (not function names). */
export function symbolsOf(node: MathNode): string[] {
  const names = new Set<string>()
  node.traverse((child, path, parent) => {
    if (child.type === 'SymbolNode') {
      const isFnName = parent?.type === 'FunctionNode' && path === 'fn'
      if (!isFnName) names.add((child as unknown as { name: string }).name)
    }
  })
  return [...names]
}

// ---------------------------------------------------------------------------
// Fast scalar compilation for graphs
// ---------------------------------------------------------------------------

const JS_FUNCS: Record<string, string> = {
  sin: 'Math.sin', cos: 'Math.cos', tan: 'Math.tan', asin: 'Math.asin', acos: 'Math.acos', atan: 'Math.atan',
  atan2: 'Math.atan2', sinh: 'Math.sinh', cosh: 'Math.cosh', tanh: 'Math.tanh', asinh: 'Math.asinh', acosh: 'Math.acosh',
  atanh: 'Math.atanh', sqrt: 'Math.sqrt', cbrt: 'Math.cbrt', abs: 'Math.abs', exp: 'Math.exp', log: 'F.log',
  ln: 'Math.log', log10: 'Math.log10', log2: 'Math.log2', floor: 'Math.floor', ceil: 'Math.ceil', round: 'Math.round',
  sign: 'Math.sign', min: 'Math.min', max: 'Math.max', pow: 'Math.pow', hypot: 'Math.hypot', mag: 'Math.abs',
  sec: 'F.sec', csc: 'F.csc', cot: 'F.cot', nthRoot: 'F.nthRoot', mod: 'F.mod', fix: 'Math.trunc', factorial: 'F.fact',
  gamma: 'F.gamma', sinc: 'F.sinc', heaviside: 'F.step', step: 'F.step', random: 'Math.random', mean: 'F.mean'
}

const F = {
  log: (a: number, b?: number) => (b === undefined ? Math.log10(a) : Math.log(b) / Math.log(a)),
  sec: (x: number) => 1 / Math.cos(x),
  csc: (x: number) => 1 / Math.sin(x),
  cot: (x: number) => 1 / Math.tan(x),
  // n % 2 is −1 for a negative odd n in JavaScript, so compare the size.
  nthRoot: (x: number, n: number) => (x < 0 && Math.abs(n % 2) === 1 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n)),
  mod: (a: number, b: number) => ((a % b) + b) % b,
  fact: (n: number) => math.gamma(n + 1),
  gamma: (n: number) => math.gamma(n),
  sinc: (x: number) => (Math.abs(x) < 1e-12 ? 1 : Math.sin(x) / x),
  step: (x: number) => (x < 0 ? 0 : 1),
  mean: (...a: number[]) => a.reduce((s, v) => s + v, 0) / a.length
}

const OPS: Record<string, string> = {
  add: '+', subtract: '-', multiply: '*', divide: '/', mod: '%', smaller: '<', larger: '>',
  smallerEq: '<=', largerEq: '>=', equal: '===', unequal: '!==', and: '&&', or: '||'
}

export type ScalarFn = (vars: Record<string, number>) => number

/**
 * Compiles an expression over variables (e.g. x, y, t) into a native JS function.
 * Other symbols are read from `scope` at call time so sliders update live.
 * Trig uses radians (graph convention).
 */
export function compileScalar(expr: string, varNames: string[], scope: () => Record<string, unknown>): ScalarFn {
  const node = math.parse(preprocess(expr))
  const vars = new Set(varNames)
  const gen = (nd: MathNode): string => {
    const n = nd as MathNode & Record<string, unknown>
    switch (nd.type) {
      case 'ConstantNode':
        return `(${Number(n.value)})`
      case 'SymbolNode': {
        const name = n.name as string
        if (vars.has(name)) return `v[${JSON.stringify(name)}]`
        if (name === 'pi') return '(Math.PI)'
        if (name === 'e') return '(Math.E)'
        if (name === 'tau') return '(2*Math.PI)'
        if (name === 'Infinity') return 'Infinity'
        return `N(s(), ${JSON.stringify(name)})`
      }
      case 'ParenthesisNode':
        return `(${gen(n.content as MathNode)})`
      case 'OperatorNode': {
        const args = n.args as MathNode[]
        const fn = n.fn as string
        if (fn === 'unaryMinus') return `(-${gen(args[0])})`
        if (fn === 'unaryPlus') return gen(args[0])
        if (fn === 'pow') return `Math.pow(${gen(args[0])}, ${gen(args[1])})`
        if (fn === 'factorial') return `F.fact(${gen(args[0])})`
        if (fn === 'not') return `(!${gen(args[0])} ? 1 : 0)`
        const op = OPS[fn]
        if (!op) throw new Error(`unsupported operator ${fn}`)
        return `(${gen(args[0])} ${op} ${gen(args[1])})`
      }
      case 'FunctionNode': {
        const fname = (n.fn as { name: string }).name
        const js = JS_FUNCS[fname]
        if (!js) throw new Error(`unsupported function ${fname}`)
        return `${js}(${(n.args as MathNode[]).map(gen).join(', ')})`
      }
      case 'ConditionalNode':
        return `(${gen(n.condition as MathNode)} ? ${gen(n.trueExpr as MathNode)} : ${gen(n.falseExpr as MathNode)})`
      default:
        throw new Error(`unsupported syntax ${nd.type}`)
    }
  }
  const N = (sc: Record<string, unknown>, name: string): number => {
    const val = sc[name]
    if (typeof val === 'number') return val
    return NaN
  }
  try {
    const body = `return (${gen(node)});`
    const f = new Function('v', 's', 'N', 'F', body) as (v: Record<string, number>, s: () => Record<string, unknown>, N: unknown, F: unknown) => number
    return (v) => Number(f(v, scope, N, F))
  } catch {
    // Fallback: slower mathjs evaluation with radians forced.
    const compiled = node.compile()
    return (v) => {
      const prev = angleMode
      angleMode = 'rad'
      try {
        return Number(compiled.evaluate({ ...scope(), ...v }))
      } catch {
        return NaN
      } finally {
        angleMode = prev
      }
    }
  }
}

/**
 * Splits `a, b, f(c, d)` into its arguments, ignoring commas inside brackets.
 * The command bar and the calculator share it so both read arguments the same way.
 */
export function splitArgs(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++
    if (ch === ')' || ch === ']') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

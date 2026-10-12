// G2: reading an answer the way PhysLab writes it (ln natural, log base 10, |x|, √, real odd roots) into an exact form
// the checkers can compare: a quotient of polynomials with rational coefficients. |A| and √(A²) are kept as named
// atoms, so √(x²) and |x| are the same thing and x is not. Anything else (π, sin, √2 as a coefficient) is NotExact,
// and the checker falls back to numbers (docs/knowledge/check.md).

import { type MathNode } from 'mathjs'
import { math, preprocess } from '../expr'
import { constExpr, eAdd, eMul, eNeg, ePow, eSub, isConstant, NotPolynomial, varExpr, varsOf, writeTimes, type Expr } from '../pure/mono'
import { exprFromPoly, pDeg, pDivMod, pMul, pSub, pTrim, polyFromExpr, type Poly } from '../pure/poly'
import { R0, R1, rAbs, rDiv, rEq, rFromNumber, rIsZero, rMul, rat, type Rat } from '../pure/rat'
import { ALG_I, algAdd, algInv, algIsRational, algMul, algNeg, algRat, algSqrtRational, algSub, NotInField, rationalRoot, type Alg } from './field'
import { checkSize, gcdOf, pDeriv } from './realroots'
import { NotExact, tick } from './verdict'

type Loose = { type: string; op?: string; fn?: { name?: string } | string; name?: string; value?: unknown; args?: MathNode[]; content?: MathNode }

/** The longest answer read, in characters: an engine's answer for school work is far shorter. */
const MAX_TEXT = 4000

/** True when a typed number has more significant digits than a double keeps: it cannot be read exactly. */
const tooManyDigits = (text: string): boolean =>
  (text.match(/\d+(?:\.\d+)?|\.\d+/g) ?? []).some((n) => n.replace('.', '').replace(/^0+/, '').replace(/0+$/, '').length > 15)

/** A number as typed: a decimal with an optional exponent, not the digits of a name such as x2. mathjs reads these runs. */
const LITERAL = /(?<![\p{L}\p{N}_$.])(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/gu

/** The exact value of a typed decimal, or null when a double cannot hold anything near it (10⁻⁴⁰⁰, 10⁴⁰⁰). */
function literalValue(s: string): Rat | null {
  const m = /^(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(s)
  if (!m) return null
  const frac = m[2] ?? ''
  const digits = (m[1] + frac).replace(/^0+/, '')
  if (!digits) return R0
  const e = Number(m[3] ?? '0') - frac.length
  if (digits.length > 400 || !Number.isSafeInteger(e) || digits.length + e > 310 || digits.length + e < -330) return null
  const n = BigInt(digits)
  return e >= 0 ? rat(n * 10n ** BigInt(e)) : rat(n, 10n ** BigInt(-e))
}

/**
 * Every number mathjs read is a decimal written in the text, and the double it became holds exactly that decimal.
 * Otherwise the reading is not the answer: 0x20000000000001 and 0x20000000000000 are one double, 1e-400 is 0, and a
 * subnormal such as 1.23456789e-320 keeps four figures.
 */
function checkNumbers(text: string, node: MathNode): void {
  const typed = (text.match(LITERAL) ?? []).map((s) => {
    const exact = literalValue(s)
    const v = Number(s)
    if (!exact || !Number.isFinite(v) || !rEq(rFromNumber(v), exact)) throw new NotExact(`${s} is not held exactly`)
    return v
  })
  const read: number[] = []
  node.traverse((m) => {
    const c = m as unknown as Loose
    if (c.type === 'ConstantNode' && typeof c.value === 'number') read.push(c.value)
  })
  const key = (vs: number[]): string => vs.map(String).sort().join(' ')
  if (key(typed) !== key(read)) throw new NotExact('a number was read as something not written')
}

// ---------------------------------------------------------------- reading the text

/**
 * Function names. A function is read only when it is followed by its bracket, and a run of letters that holds one any
 * other way is not read at all (see `checkNames`).
 */
const FUNCTION_NAMES = [
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'asin', 'acos', 'atan', 'asec', 'acsc', 'acot', 'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'sech', 'csch', 'coth', 'asinh', 'acosh', 'atanh', 'ln', 'log', 'log10', 'log2', 'lg', 'exp',
  'sqrt', 'cbrt', 'nthRoot', 'abs', 'mag', 'sign', 'sgn', 'floor', 'ceil', 'round', 'fix', 'gamma', 'factorial'
]
/** A function PhysLab's mathjs knows (sgn is read as sign). */
const callable = (name: string): boolean => typeof (math as unknown as Record<string, unknown>)[name === 'sgn' ? 'sign' : name] === 'function'
/** A function name inside a run of letters: xsin, arcsin (which mathjs does not know), lnmag, cosx. */
const FUNCTION_INSIDE = new RegExp(
  FUNCTION_NAMES.slice()
    .sort((a, b) => b.length - a.length)
    .join('|')
)
/** A name mathjs gives a meaning of its own (a function, or a constant such as E, PI, SQRT2): never a variable here. */
const isMathName = (name: string): boolean => (math as unknown as Record<string, unknown>)[name] !== undefined

/** The end of something a bar or a root sign multiplies: a letter, a digit, a closing bracket, a factorial, %, °. */
const OPERAND_END = /[\p{L}\p{N}_)\]!%°′]$/u

/**
 * The text with every |…| written as abs(…), and every √ or ∛ after something it multiplies given its ×, before the
 * shared reader (`preprocess`, then pure/mono's `writeTimes`) sees it. That reader writes |x| as mag(x) and √2 as
 * sqrt(2), but glued to a letter it then splits the name into letters: x|x| was read x·m·a·g·(x) and x√2 was
 * x·s·q·r·t·(2), so x|x| and −x|−x| came out "equal" (docs/knowledge/check.md, shared reader flaws). Bars pair the way
 * `preprocess` pairs them: a bar after something it can close, with one open, closes it. ln|x| is ln(|x|).
 */
function preRead(src: string): string {
  let out = ''
  const open: boolean[] = []
  for (const ch of src) {
    if (ch === '|') {
      const before = out.trimEnd()
      if (open.length && OPERAND_END.test(before)) {
        out += open.pop() ? '))' : ')'
        continue
      }
      const name = /[A-Za-z][A-Za-z0-9]*$/.exec(before)?.[0]
      if (name && FUNCTION_NAMES.includes(name) && callable(name)) {
        out += '(abs('
        open.push(true)
        continue
      }
      if (name && FUNCTION_INSIDE.test(name)) throw new NotExact(`${name} glued to a bar`)
      out += OPERAND_END.test(before) ? '*abs(' : 'abs('
      open.push(false)
      continue
    }
    if (ch === '√' || ch === '∛' || ch === '∜') {
      const before = out.trimEnd()
      const name = /[A-Za-z][A-Za-z0-9]*$/.exec(before)?.[0]
      if (name && FUNCTION_INSIDE.test(name)) throw new NotExact(`${name} glued to a root sign`)
      if (OPERAND_END.test(before)) out += '*'
    }
    out += ch
  }
  if (open.length) throw new NotExact('a | without its pair')
  return out
}

/**
 * Every function name is followed by its bracket, and no other run of letters holds one. mathjs reads "sin 2x" as the
 * product of a symbol sin, 2 and x, and the shared reader splits "xsin(x)" or "arcsin(x)" into letters: either way a
 * function became a variable, and sin 2x and 2 sin x came out "equal". PhysLab has no rule for a function without its
 * bracket, so it is not read here.
 */
function checkNames(text: string): void {
  for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9_]*/g)) {
    const id = m[0]
    const after = text.slice((m.index ?? 0) + id.length)
    if (FUNCTION_NAMES.includes(id) && callable(id)) {
      if (!/^\s*\(/.test(after)) throw new NotExact(`${id} without its bracket`)
      continue
    }
    if (FUNCTION_INSIDE.test(id)) throw new NotExact(`${id} holds a function name`)
  }
}

/**
 * PhysLab text as a mathjs tree. Throws NotExact when the text cannot be read, or holds a number that the reading would
 * change (more digits than a double keeps, a hexadecimal, a number past a double's range): nothing may be proved from it.
 * An equation "a = b" is read as a − (b) only where one is asked for (`equation`), as for the roots of an equation or a
 * system; anywhere else an equation is not an answer (x = 1 is not x − 1), so it is NotExact.
 */
export function readMaths(src: string, equation = false): MathNode {
  if (src.length > MAX_TEXT) throw new NotExact('too long')
  const text = preprocess(preRead(src.trim())).replace(/\bsgn\s*\(/g, 'sign(')
  if (!text) throw new NotExact('empty')
  checkNames(text)
  if (tooManyDigits(text)) throw new NotExact('too many digits')
  const sides = text.split(/(?<![<>=!])=(?!=)/).map(writeTimes)
  if (sides.length > 2) throw new NotExact('more than one =')
  if (sides.length === 2 && !equation) throw new NotExact('an equation, not an expression')
  let nodes: MathNode[]
  try {
    nodes = sides.map((s) => math.parse(s))
  } catch {
    throw new NotExact('unreadable')
  }
  sides.forEach((s, i) => checkNumbers(s, nodes[i]))
  return nodes.length === 2 ? new math.OperatorNode('-', 'subtract', [nodes[0], new math.ParenthesisNode(nodes[1])]) : nodes[0]
}

/** A root as typed, with its "x =" taken off; a root named by another letter ("y = 1" for an equation in x) is kept whole, and is then not read. */
export const rootText = (value: string, x: string): string => {
  const m = /^\s*([A-Za-z]\w*)\s*=(?!=)/.exec(value)
  return m && m[1] === x ? value.slice(m[0].length) : value
}

/** The letters of a tree: its symbols, but not function names or a name mathjs gives a meaning (π, e, i, E, SQRT2). */
export function lettersOf(...nodes: MathNode[]): string[] {
  const s = new Set<string>()
  for (const n of nodes) {
    n.traverse((m, _path, parent) => {
      const v = m as unknown as { type: string; name?: string }
      const p = parent as unknown as { type?: string; fn?: unknown } | null
      if (v.type === 'SymbolNode' && !(p?.type === 'FunctionNode' && p.fn === m) && !isMathName(String(v.name))) s.add(String(v.name))
    })
  }
  return [...s].sort()
}

export const fnName = (n: Loose): string => (typeof n.fn === 'string' ? n.fn : (n.fn?.name ?? ''))

// ---------------------------------------------------------------- exact quotients

/** num / den, both polynomials over ℚ in the variables and the atom names. */
export interface RF {
  num: Expr
  den: Expr
}

/** |arg|, standing in the polynomials as the variable `name`. arg holds no atom itself. */
export interface Atom {
  name: string
  arg: RF
}

/** What reading one expression found: the value, its atoms, and every denominator met (where it is undefined). */
export interface Exact {
  rf: RF
  atoms: Atom[]
  dens: Expr[]
}

const ONE = constExpr(R1)
export const rfConst = (q: Rat): RF => ({ num: constExpr(q), den: ONE })
export const rfAdd = (a: RF, b: RF): RF => ({ num: eAdd(eMul(a.num, b.den), eMul(b.num, a.den)), den: eMul(a.den, b.den) })
const rfSub = (a: RF, b: RF): RF => ({ num: eSub(eMul(a.num, b.den), eMul(b.num, a.den)), den: eMul(a.den, b.den) })
export const rfMul = (a: RF, b: RF): RF => ({ num: eMul(a.num, b.num), den: eMul(a.den, b.den) })
export function rfDiv(a: RF, b: RF): RF {
  if (b.num.length === 0) throw new NotExact('division by zero')
  return { num: eMul(a.num, b.den), den: eMul(a.den, b.num) }
}
export function rfPow(a: RF, k: number): RF {
  if (k >= 0) return { num: ePow(a.num, k), den: ePow(a.den, k) }
  if (a.num.length === 0) throw new NotExact('zero to a negative power')
  return { num: ePow(a.den, -k), den: ePow(a.num, -k) }
}
/** The rational number an RF is, or null when it has a variable. */
export function rfValue(a: RF): Rat | null {
  if (!isConstant(a.num) || !isConstant(a.den)) return null
  const n = a.num.length ? a.num[0].c : R0
  const d = a.den.length ? a.den[0].c : R0
  if (rIsZero(d)) throw new NotExact('division by zero')
  return rDiv(n, d)
}
/** a = b as functions where both are defined: a.num·b.den = b.num·a.den. */
export const rfSame = (a: RF, b: RF): boolean => eSub(eMul(a.num, b.den), eMul(b.num, a.den)).length === 0

const ATOM_PREFIX = 'abs§'
export const isAtomName = (v: string): boolean => v.startsWith(ATOM_PREFIX)
export const plainVars = (e: Expr): string[] => varsOf(e).filter((v) => !isAtomName(v))

/** Read src exactly. `atoms` is shared when two answers are read for one comparison, so equal |…| get one name. */
export function readExact(src: string | MathNode, atoms: Atom[] = []): Exact {
  const dens: Expr[] = []
  const node = typeof src === 'string' ? readMaths(src) : src
  try {
    return { rf: walk(node, atoms, dens), atoms, dens }
  } catch (err) {
    // pure/mono's own refusals (a power past its limit, say) mean the same here: not exact.
    if (err instanceof NotPolynomial) throw new NotExact(err.message)
    throw err
  }
}

function atomFor(arg: RF, atoms: Atom[]): RF {
  if (varsOf(arg.num).some(isAtomName) || varsOf(arg.den).some(isAtomName)) throw new NotExact('|…| inside |…|')
  const c = rfValue(arg)
  if (c) return rfConst(rAbs(c))
  let found = atoms.find((a) => rfSame(a.arg, arg))
  if (!found) {
    found = { name: `${ATOM_PREFIX}${atoms.length}`, arg }
    atoms.push(found)
  }
  return { num: varExpr(found.name), den: ONE }
}

function walk(node: MathNode, atoms: Atom[], dens: Expr[]): RF {
  tick()
  const n = node as unknown as Loose
  const sub = (m: MathNode): RF => walk(m, atoms, dens)
  switch (n.type) {
    case 'ConstantNode': {
      if (typeof n.value !== 'number' || !Number.isFinite(n.value)) throw new NotExact('not a number')
      return rfConst(rFromNumber(n.value))
    }
    case 'SymbolNode': {
      const name = String(n.name)
      // π, e, i, and every other name mathjs gives a meaning (E, SQRT2, sin written without its bracket).
      if (isMathName(name)) throw new NotExact(`${name} is not a variable`)
      return { num: varExpr(name), den: ONE }
    }
    case 'ParenthesisNode':
      return sub(n.content as MathNode)
    case 'OperatorNode': {
      const args = n.args ?? []
      switch (n.op) {
        case '+':
          return args.length === 1 ? sub(args[0]) : args.map(sub).reduce(rfAdd)
        case '-':
          if (args.length === 1) {
            const v = sub(args[0])
            return { num: eNeg(v.num), den: v.den }
          }
          return rfSub(sub(args[0]), sub(args[1]))
        case '*':
          return args.map(sub).reduce(rfMul)
        case '/': {
          const top = sub(args[0])
          const bottom = sub(args[1])
          dens.push(bottom.num)
          return rfDiv(top, bottom)
        }
        case '^':
          return power(sub(args[0]), args[1], atoms, dens)
      }
      throw new NotExact(`operator ${n.op}`)
    }
    case 'FunctionNode': {
      const name = fnName(n)
      const args = n.args ?? []
      // |x| reaches here as mag(x): preprocess writes a magnitude, and of a number it is the absolute value.
      if ((name === 'abs' || name === 'mag') && args.length === 1) return atomFor(sub(args[0]), atoms)
      if (name === 'sqrt' && args.length === 1) return root(sub(args[0]), 2, atoms)
      if (name === 'cbrt' && args.length === 1) return root(sub(args[0]), 3, atoms)
      if (name === 'nthRoot' && args.length === 2) {
        const k = rfValue(sub(args[1]))
        if (!k || k.d !== 1n || k.n < 1n || k.n > 64n) throw new NotExact('root index')
        return root(sub(args[0]), Number(k.n), atoms)
      }
      throw new NotExact(`function ${name}`)
    }
  }
  throw new NotExact(`node ${n.type}`)
}

/** base^exponent: whole powers exactly; a fraction p/q only when the q-th root is exact (real odd roots included). */
function power(base: RF, expNode: MathNode, atoms: Atom[], dens: Expr[]): RF {
  const exp = rfValue(walk(expNode, atoms, []))
  if (!exp) throw new NotExact('variable exponent')
  const p = Number(exp.n)
  const q = Number(exp.d)
  if (!Number.isSafeInteger(p) || Math.abs(p) > 4096) throw new NotExact('huge exponent')
  // A root index as large as nthRoot's own (64) at most: 0.333333333333 is a 10¹²-th root, and is not worked out.
  if (q > 64) throw new NotExact('root index')
  if (p < 0) dens.push(base.num)
  const b = q === 1 ? base : root(base, q, atoms)
  guardPower(b, Math.abs(p))
  return rfPow(b, p)
}

/** The largest total degree, and the largest coefficient's binary digits, a power may build. */
const MAX_POWER_DEGREE = 256
const MAX_POWER_BITS = 20_000
const bitsOf = (v: bigint): number => (v < 0n ? -v : v).toString(2).length

/**
 * NotExact when a^k would be too big to build: pure/mono multiplies a power out one factor at a time, past the reach of
 * the time budget, and ((2^1000)^1000)^60 took 14.5 s, (x + 1)^1000 two seconds. A school answer is far below both
 * limits; above them the answer is read by numbers, or is 'unknown'.
 */
function guardPower(a: RF, k: number): void {
  if (k <= 1) return
  for (const e of [a.num, a.den]) {
    let deg = 0
    let bits = 0
    for (const t of e) {
      deg = Math.max(deg, Object.values(t.v).reduce((s, p) => s + p, 0))
      bits = Math.max(bits, bitsOf(t.c.n), bitsOf(t.c.d))
    }
    if (deg * k > MAX_POWER_DEGREE) throw new NotExact('the power is too high to multiply out here')
    if ((bits + Math.log2(e.length + 1)) * k > MAX_POWER_BITS) throw new NotExact('the power is too big to multiply out here')
  }
}

/**
 * The real q-th root of base, exactly. A rational base needs a rational root ((−8)^(1/3) = −2; (−4)^(1/2) is not
 * real). A variable base must be a perfect q-th power S^q of one variable: odd q gives S, even q gives |S|.
 */
function root(base: RF, q: number, atoms: Atom[]): RF {
  const c = rfValue(base)
  if (c) {
    const r = rationalRoot(c, q)
    if (!r) throw new NotExact(c.n < 0n && q % 2 === 0 ? 'even root of a negative' : 'irrational root')
    return rfConst(r)
  }
  const top = perfectPower(base.num, q)
  const bottom = perfectPower(base.den, q)
  if (!top || !bottom) throw new NotExact('not a perfect power')
  const s: RF = { num: top, den: bottom }
  return q % 2 === 0 ? atomFor(s, atoms) : s
}

/** S with S^k = e (up to the real k-th root of e's constant), for e in one variable; null if there is none. */
function perfectPower(e: Expr, k: number): Expr | null {
  if (isConstant(e)) {
    const v = e.length ? e[0].c : R0
    const r = rationalRoot(v, k)
    return r ? constExpr(r) : null
  }
  const vs = varsOf(e)
  if (vs.length !== 1 || isAtomName(vs[0])) return null
  const p = polyFromExpr(e, vs[0]).poly
  try {
    checkSize(p)
  } catch {
    return null
  }
  const lead = p[p.length - 1]
  const lr = rationalRoot(lead, k)
  if (!lr) return null
  // Yun: p/lead = Π fᵢ^i; a k-th power exactly when k divides every i whose fᵢ is not constant. The greatest common
  // divisors are taken up to a constant (kept small: over ℚ as they came, a square root of a degree-60 polynomial took
  // 37 s), which scales c and d alike, so each fᵢ is made monic before it is used.
  const monic = pTrim(p.map((c) => rDiv(c, lead)))
  let s: Poly = [R1]
  const a = monic
  const b = pDeriv(a)
  const g = gcdOf(a, b)
  let c = pDivMod(a, g).q
  let d = pTrim(pSub(pDivMod(b, g).q, pDeriv(c)))
  for (let i = 1; pDeg(c) >= 1; i++) {
    tick()
    const f0 = gcdOf(c, d)
    const f = f0.map((x) => rDiv(x, f0[f0.length - 1]))
    if (pDeg(f) >= 1) {
      if (i % k !== 0) return null
      for (let j = 0; j < i / k; j++) s = pMul(s, f)
    }
    c = pDivMod(c, f).q
    d = pTrim(pSub(pDivMod(d, f).q, pDeriv(c)))
    if (i > 4096) return null
  }
  const out = exprFromPoly(s.map((x) => rMul(x, lr)), vs[0])
  return checkPower(out, k, e) ? out : null
}
/** The found root, raised to the k-th power, really is e: the proof does not rest on Yun's bookkeeping. */
const checkPower = (s: Expr, k: number, e: Expr): boolean => eSub(ePow(s, k), e).length === 0


// ---------------------------------------------------------------- exact roots

/**
 * A root as typed — 3/2, 1 − √2, (−1 + i√3)/2, ∛−8 — as an exact number (a + b√d) + (c + e√d)i, or NotInField when
 * it is not one (a cube root of 2, π, two different square roots). An "x =" in front is the caller's to take off
 * (`rootText`); an equation left in is NotExact.
 */
export function readAlg(src: string | MathNode): Alg {
  return algOf(typeof src === 'string' ? readMaths(src) : src)
}

function algOf(node: MathNode): Alg {
  const n = node as unknown as Loose
  switch (n.type) {
    case 'ConstantNode':
      if (typeof n.value !== 'number' || !Number.isFinite(n.value)) throw new NotInField('not a number')
      return algRat(rFromNumber(n.value))
    case 'SymbolNode':
      if (n.name === 'i') return ALG_I
      throw new NotInField(`${String(n.name)} is not exact here`)
    case 'ParenthesisNode':
      return algOf(n.content as MathNode)
    case 'OperatorNode': {
      const args = n.args ?? []
      if (n.op === '+') return args.length === 1 ? algOf(args[0]) : args.map(algOf).reduce(algAdd)
      if (n.op === '-') return args.length === 1 ? algNeg(algOf(args[0])) : algSub(algOf(args[0]), algOf(args[1]))
      if (n.op === '*') return args.map(algOf).reduce(algMul)
      if (n.op === '/') return algMul(algOf(args[0]), algInv(algOf(args[1])))
      if (n.op === '^') {
        const e = algOf(args[1])
        if (!algIsRational(e)) throw new NotInField('exponent')
        return algPower(algOf(args[0]), e.a)
      }
      throw new NotInField(`operator ${n.op}`)
    }
    case 'FunctionNode': {
      const name = fnName(n)
      const args = n.args ?? []
      if (name === 'sqrt' && args.length === 1) return algPower(algOf(args[0]), rat(1n, 2n))
      if (name === 'cbrt' && args.length === 1) return algPower(algOf(args[0]), rat(1n, 3n))
      if (name === 'nthRoot' && args.length === 2) {
        const k = algOf(args[1])
        if (!algIsRational(k) || k.a.d !== 1n || k.a.n < 1n || k.a.n > 64n) throw new NotInField('root index')
        return algPower(algOf(args[0]), rat(1n, k.a.n))
      }
      throw new NotInField(`function ${name}`)
    }
  }
  throw new NotInField(`node ${n.type}`)
}

/** x^(p/q): whole powers of anything; a fractional power only of a rational, square roots included. */
function algPower(x: Alg, e: Rat): Alg {
  const p = Number(e.n)
  const q = Number(e.d)
  if (!Number.isSafeInteger(p) || Math.abs(p) > 64 || q > 64) throw new NotInField('huge exponent')
  let base = x
  if (q !== 1) {
    if (!algIsRational(x)) throw new NotInField('root of an irrational')
    if (q === 2) base = algSqrtRational(x.a)
    else {
      const r = rationalRoot(x.a, q)
      if (!r) throw new NotInField('irrational root')
      base = algRat(r)
    }
  }
  let out = algRat(R1)
  for (let k = 0; k < Math.abs(p); k++) out = algMul(out, base)
  return p < 0 ? algInv(out) : out
}

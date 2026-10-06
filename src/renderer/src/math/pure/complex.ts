// Complex numbers, worked out the way they are taught.
//
// The trick that makes the working readable: `i` is parsed as an ordinary letter, so a product
// expands to 8 + 2i − 15i² first, and replacing i² with −1 is its own visible step. That is the
// step students actually have to learn, and hiding it inside the arithmetic teaches nothing.

import { type MathNode } from 'mathjs'
import {
  R0,
  R1,
  rAbs,
  rAdd,
  rCmp,
  rDiv,
  rEq,
  rFromNumber,
  rInv,
  rIsNeg,
  rIsOne,
  rIsZero,
  rMul,
  rNeg,
  rNum,
  rPow,
  rSqrt,
  rStr,
  rSub,
  rTex,
  rat,
  type Rat
} from './rat'
import { NotPolynomial, evalAt, exprTex, parseExpr, parseFraction, varsOf, writeTimes, type Expr } from './mono'
import { math, preprocess } from '../expr'
import { pDeg, pSub, pTex, pTexAt, pTexBracketed, polyFromExpr, exprFromPoly, type Poly } from './poly'
import { factorsOf } from './factor'
import { texAngle, type DigitSettings } from '../format'
import { calcNum } from '../../calc/format'
import { formatComplex } from '../../calc/engine'
import { labelTex, labelText } from '../../calc/labels'
import { scene } from '../../core/store'
import {
  checkProduct,
  cxs,
  cxsAdd,
  cxsConj,
  cxsIsReal,
  cxsMul,
  cxsOfRat,
  cxsTex,
  joinPieces,
  linearFactorTex,
  quadraticRoots,
  simplifySurd,
  spFromPoly,
  spLinear,
  splitBiquadratic,
  surd,
  surdAdd,
  surdEq,
  surdIsRational,
  surdIsZero,
  surdMul,
  surdNeg,
  surdPieces,
  surdPolyTex,
  surdSqrt,
  surdSub,
  surdTex,
  type CxS,
  type SignedTex,
  type SPoly,
  type Surd
} from './cxpoly'
import { Steps, failed, texToPlain, type Answer, type Working } from './work'

export { simplifySurd }

/** An exact complex number: both parts are fractions. */
export interface Cx {
  re: Rat
  im: Rat
}

export const cx = (re: Rat, im: Rat = R0): Cx => ({ re, im })
export const cxIsReal = (z: Cx): boolean => rIsZero(z.im)
export const cxAdd = (a: Cx, b: Cx): Cx => cx(rAdd(a.re, b.re), rAdd(a.im, b.im))
export const cxSub = (a: Cx, b: Cx): Cx => cx(rSub(a.re, b.re), rSub(a.im, b.im))
export const cxMul = (a: Cx, b: Cx): Cx =>
  cx(rSub(rMul(a.re, b.re), rMul(a.im, b.im)), rAdd(rMul(a.re, b.im), rMul(a.im, b.re)))
export const cxConj = (z: Cx): Cx => cx(z.re, rNeg(z.im))

/** A number squared as written by hand: 2², (−1)², (½)². */
const squaredTex = (r: Rat): string => (rIsNeg(r) || r.d !== 1n ? `\\left(${rTex(r)}\\right)^2` : `${rTex(r)}^2`)

/** A sum of numbers times suffixes (i, i²), each sign written once: "3 + 6i + 4i − 8i²". */
function signedTex(parts: { c: Rat; s: string }[]): string {
  const out = parts
    .filter((p) => !rIsZero(p.c))
    .map((p, i) => {
      const neg = rIsNeg(p.c)
      const m = neg ? rNeg(p.c) : p.c
      const body = rIsOne(m) && p.s ? p.s : `${rTex(m)}${p.s}`
      return i === 0 ? `${neg ? '-' : ''}${body}` : `${neg ? '-' : '+'} ${body}`
    })
  return out.length ? out.join(' ') : '0'
}

/** a + bi, written the way a student would: 3 − 2i, not 3 + (−2)i. */
export function cxTex(z: Cx): string {
  if (rIsZero(z.im)) return rTex(z.re)
  const coef = rIsOne(rAbs(z.im)) ? '' : rTex(rAbs(z.im))
  const body = `${coef}i`
  if (rIsZero(z.re)) return rIsNeg(z.im) ? `-${body}` : body
  return `${rTex(z.re)} ${rIsNeg(z.im) ? '-' : '+'} ${body}`
}

/** √n as LaTeX, already simplified: 6\sqrt{2}, or just 6 when it is exact. */
function rootTex(n: bigint): string {
  const { out, in: inner } = simplifySurd(n)
  if (inner === 1n) return String(out)
  return out === 1n ? `\\sqrt{${inner}}` : `${out}\\sqrt{${inner}}`
}

/**
 * √(p/q) as LaTeX, for a fraction under the root.
 *
 * Uses √(p/q) = √(pq)/q, the same rule the roots themselves are built with a few steps below.
 * The displayed step used to drop the denominator entirely and claim √(15/4) = √15.
 */
function surdOf(a: Rat): string {
  const { out, in: inner } = simplifySurd(a.n * a.d)
  const coef = rat(out, a.d)
  if (inner === 1n) return rTex(coef)
  return `${rIsOne(coef) ? '' : rTex(coef)}\\sqrt{${inner}}`
}

// ---------------------------------------------------------------- powers of i

/** Reduce an expression in the letter i to a single complex number, using i² = −1. */
export function reduceI(e: Expr): Cx {
  let z = cx(R0, R0)
  for (const t of e) {
    const others = Object.keys(t.v).filter((k) => k !== 'i')
    if (others.length) throw new NotPolynomial(`This still has ${others.join(', ')} in it, so it is not a plain complex number.`)
    const k = (t.v.i ?? 0) % 4
    if (k === 0) z = cxAdd(z, cx(t.c, R0))
    else if (k === 1) z = cxAdd(z, cx(R0, t.c))
    else if (k === 2) z = cxAdd(z, cx(rNeg(t.c), R0))
    else z = cxAdd(z, cx(R0, rNeg(t.c)))
  }
  return z
}

/** An expression in i, written in the order students write it: 8 + 2i − 15i². */
function iTex(e: Expr): string {
  const ordered = [...e].sort((a, b) => (a.v.i ?? 0) - (b.v.i ?? 0))
  if (ordered.length === 0) return '0'
  let out = ''
  ordered.forEach((t, idx) => {
    const k = t.v.i ?? 0
    const mag = rAbs(t.c)
    const coef = rIsOne(mag) && k > 0 ? '' : rTex(mag)
    const letter = k === 0 ? '' : k === 1 ? 'i' : `i^{${k}}`
    const body = `${coef}${letter}` || '1'
    if (idx === 0) out += rIsNeg(t.c) ? `-${body}` : body
    else out += rIsNeg(t.c) ? ` - ${body}` : ` + ${body}`
  })
  return out
}

const hasHighPowers = (e: Expr): boolean => e.some((t) => (t.v.i ?? 0) >= 2)

function powersOfIMove(e: Expr, s: Steps): void {
  if (!hasHighPowers(e)) return
  powerRuleMove(Math.max(...e.map((t) => t.v.i ?? 0)), s)
}

/** The rule step for the highest power of i in play, shared by both readers so they say it alike. */
function powerRuleMove(top: number, s: Steps): void {
  if (top < 2) return
  if (top === 2) {
    s.add('Replace i² with −1. That is the whole definition of i doing its work.', 'i^2 = -1', 'i = \\sqrt{-1} \\;\\Rightarrow\\; i^2 = -1')
  } else {
    s.add(
      `Powers of i go round in fours, so reduce every power down to i⁰, i¹, i² or i³ first.`,
      'i^1 = i,\\quad i^2 = -1,\\quad i^3 = -i,\\quad i^4 = 1',
      'i^{n} = i^{\\,n \\bmod 4}'
    )
  }
}

// ---------------------------------------------------------------- arithmetic

/**
 * `digits` is how the decimal row is written; by default the student's own precision, which is
 * what the calculator line above the working uses for the same number.
 */
export function complexWorking(src: string, digits: DigitSettings = studentDigits()): Working {
  const title = 'Complex number'
  // Both readers take a number from the double mathjs stores, so 12345678901234567 + i was worked
  // "exactly" as 12345678901234568 + i, and the numeric check, made in the same doubles, ticked it.
  // The reader below gives such a line its decimal answer and says why.
  if (typedPastExact(readable(src))) return surdComplexWorking(src, digits)
  let num: Expr
  let den: Expr
  try {
    const f = parseFraction(src)
    num = f.num
    den = f.den
  } catch (err) {
    // This reader holds fractions only. A line it refuses — a root, a fraction inside the line, a
    // negative power, π — goes to the one below, which takes surds and words its refusals for this
    // job. Before, 1/(√2 − √5i) ended at '"sqrt" is not something I can factorise' (P22).
    if (err instanceof NotPolynomial) return surdComplexWorking(src, digits)
    return failed(title, src, 'I could not read that.')
  }

  const isFraction = !(den.length === 1 && rIsOne(den[0].c) && Object.keys(den[0].v).length === 0)
  // A refusal carries maths, not the linear text the engine ran.
  const read = isFraction ? `\\dfrac{${exprTex(num)}}{${exprTex(den)}}` : exprTex(num)
  // Zero as typed — 1/(0i), 1/(i − i) — before the letters are counted: read as "no i here", the
  // line was sent to the calculator to divide by zero.
  if (den.length === 0) return failed(title, read, 'The bottom comes to zero.')
  const vars = [...new Set([...varsOf(num), ...varsOf(den)])]
  const strays = vars.filter((v) => v !== 'i')
  if (strays.length) return failed(title, read, `This has ${strays.join(', ')} in it. The complex tools work on numbers, not letters.`)
  if (vars.length === 0) return failed(title, read, NO_I)

  const input = isFraction ? `\\dfrac{${iTex(num)}}{${iTex(den)}}` : iTex(num)
  const s = new Steps()

  if (!isFraction) {
    s.goal('Simplify to a + bi').add('Multiply out and collect, treating i as an ordinary letter for now.', iTex(num), '\\text{expand as usual}')
    powersOfIMove(num, s)
    const z = reduceI(num)
    // Written from the expression, not from the line above it: after "i² = −1" a bare "= 8 − i"
    // read as i² = −1 = 8 − i (Fix 4).
    if (iTex(num) !== cxTex(z)) s.add('Now gather the real parts and the i parts separately.', `${iTex(num)} = ${cxTex(z)}`, 'a + bi:\\ \\text{real part } a,\\ \\text{imaginary part } b')
    return finishComplex(title, input, s, z, src, digits)
  }

  // Dividing: multiply top and bottom by the conjugate of the bottom.
  const dz = reduceI(den)
  if (rIsZero(dz.re) && rIsZero(dz.im)) return failed(title, input, 'The bottom comes to zero.')
  // Only when there is something to work out (Fix 4): "1 − 2i = 1 − 2i" was a step that changed nothing.
  if (iTex(den) !== cxTex(dz)) {
    s.goal('Simplify the bottom').add('Work the bottom out first, so it is one number of the form a + bi.', `${iTex(den)} = ${cxTex(dz)}`)
  }
  if (cxIsReal(dz)) {
    powersOfIMove(num, s)
    const nz = reduceI(num)
    const z = cx(rDiv(nz.re, dz.re), rDiv(nz.im, dz.re))
    s.add('The bottom is already a real number, so divide both parts by it.', `\\dfrac{${cxTex(nz)}}{${rTex(dz.re)}} = ${cxTex(z)}`)
    return finishComplex(title, input, s, z, src, digits)
  }

  const conj = cxConj(dz)
  s.goal('Multiply by the conjugate').add(
    'A complex number on the bottom is not allowed in a final answer, so multiply top and bottom by the conjugate of the bottom.',
    `\\dfrac{${iTex(num)}}{${cxTex(dz)}} \\times \\dfrac{${cxTex(conj)}}{${cxTex(conj)}}`,
    '(a+bi)(a-bi) = a^2 + b^2'
  )
  const nz = reduceI(num)
  const newTop = cxMul(nz, conj)
  const newBottom = rAdd(rMul(dz.re, dz.re), rMul(dz.im, dz.im))
  s.add(
    'The bottom becomes a real number, because the i terms cancel.',
    // "0 + 1" when the bottom is a pure i number said nothing; the squares are summed only when both are there.
    [
      `\\left(${cxTex(dz)}\\right)\\left(${cxTex(conj)}\\right)`,
      rIsZero(dz.re) ? '' : `${rTex(rMul(dz.re, dz.re))} + ${rTex(rMul(dz.im, dz.im))}`,
      rTex(newBottom)
    ]
      .filter(Boolean)
      .join(' = '),
    'a^2 - (bi)^2 = a^2 + b^2'
  )
  // Every product shown, then i² = −1 used, then the parts collected (Fix 4: each step shows the
  // work it describes). A link that says nothing new is left out rather than written twice.
  const ac = rMul(nz.re, conj.re)
  const bd = rMul(nz.im, conj.im)
  const links = [
    `\\left(${cxTex(nz)}\\right)\\left(${cxTex(conj)}\\right)`,
    signedTex([
      { c: ac, s: '' },
      { c: rMul(nz.re, conj.im), s: 'i' },
      { c: rMul(nz.im, conj.re), s: 'i' },
      { c: bd, s: 'i^{2}' }
    ]),
    signedTex([
      { c: ac, s: '' },
      { c: rAdd(rMul(nz.re, conj.im), rMul(nz.im, conj.re)), s: 'i' },
      { c: rNeg(bd), s: '' }
    ]),
    cxTex(newTop)
  ].filter((t, i, all) => i === 0 || t !== all[i - 1])
  s.add('Multiply out the top the same way, using i² = −1.', links.join(' = '))
  const z = cx(rDiv(newTop.re, newBottom), rDiv(newTop.im, newBottom))
  if (!rIsOne(newBottom)) s.add('Divide each part by the bottom.', `\\dfrac{${cxTex(newTop)}}{${rTex(newBottom)}} = ${cxTex(z)}`)
  return finishComplex(title, input, s, z, src, digits)
}

/**
 * The exact answer against mathjs's own complex arithmetic on the same source: an independent
 * route to the same number, so a tick here is a real comparison and not a restatement. Null when
 * mathjs cannot evaluate the source, in which case the check line carries no verdict.
 */
export function agreesNumerically(src: string, z: Cx): boolean | null {
  return agreesWith(src, rNum(z.re), rNum(z.im))
}

/** The source worked out by mathjs, or null when mathjs cannot work it out. */
function numericValue(src: string): { re: number; im: number } | null {
  try {
    // The same reading as the exact route: mathjs on its own takes "i(2+3i)" as a call to a
    // function named i and throws, which left the check with no verdict and no tick. |z| arrives
    // as mag(z), whose own version measures vectors and throws on a complex number, so |1 + √3i|
    // had no decimal answer either; here it is the modulus.
    const v = math.evaluate(writeTimes(preprocess(src)), { mag: (z: unknown) => math.abs(z as never) as unknown }) as unknown
    const re = typeof v === 'number' ? v : (v as { re?: number }).re
    const im = typeof v === 'number' ? 0 : (v as { im?: number }).im
    return typeof re === 'number' && typeof im === 'number' ? { re, im } : null
  } catch {
    return null
  }
}

/** agreesNumerically for an answer already turned into decimals (a surd answer has no Cx). */
function agreesWith(src: string, re: number, im: number): boolean | null {
  const v = numericValue(src)
  if (!v) return null
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))
  return near(v.re, re) && near(v.im, im)
}

// ---------------------------------------------------------------- the decimal answer

/**
 * The student's own precision. The calculator line above the working reads the same setting
 * (panels/Maths.tsx points calc/format.ts at it), so the decimal row matches it digit for digit.
 * Read here because runPure takes no settings, and the Working panel's store calls it as it is.
 */
function studentDigits(): DigitSettings {
  const { decimals, precisionMode } = scene().settings
  return { decimals, precisionMode }
}

/** calcNum's text made ready for KaTeX: the plain minus, and a real power of ten. */
const calcTex = (v: number, s: DigitSettings): string => calcNum(v, s).replace(/−/g, '-').replace(/×10\^(-?\d+)/, '\\times 10^{$1}')

/**
 * re + im·i written by the calculator line's own formatter (calc/engine.ts formatComplex), fed this
 * panel's digits: calcNum at the student's precision, made ready for KaTeX. The same number must
 * read the same in the bar, the Maths screen and the Working panel, and a copy of the rule did not
 * stay the same: this one left the i bare for a part that IS 1, the calculator for a part that is
 * WRITTEN 1, so at two decimal places 0.999 read "0.5 + i" above the working and "≈ 0.5 + 1i" in it.
 */
function decimalTex(re: number, im: number, s: DigitSettings): string {
  return formatComplex(re, im, (v) => calcTex(v, s), 'tex')
}

/**
 * Its own row, after the exact answer and never in place of it: 3/25 + 4/25 i is the answer, and
 * 0.12 + 0.16i is the number a student checks it against (P22: the working never gave one).
 */
const decimalRow = (re: number, im: number, s: DigitSettings): Answer => ({ label: 'As a decimal', tex: `\\approx ${decimalTex(re, im, s)}` })

/**
 * The argument in degrees. A tiny angle comes from texAngle as 5.73\times 10^{-6}^\circ, a double
 * superscript KaTeX refuses: 10 000 000 + i showed its Argument row in red. The degree sign is set
 * on a group of its own instead.
 */
const argumentTex = (re: number, im: number): string => texAngle(Math.atan2(im, re), 'deg', 2).replace(/(\^\{-?\d+\})\^\\circ$/, '$1\\,{}^\\circ')

/** Every complex answer also gets its modulus, argument and conjugate — they are always asked for. */
function finishComplex(title: string, input: string, s: Steps, z: Cx, src: string, digits: DigitSettings): Working {
  const modSq = rAdd(rMul(z.re, z.re), rMul(z.im, z.im))
  const exact = rSqrt(modSq)
  const modTex = exact ? rTex(exact) : modSq.d === 1n ? rootTex(modSq.n) : `\\sqrt{${rTex(modSq)}}`
  s.goal('Find modulus and argument').add(
    'The modulus is the distance from the origin on the Argand diagram.',
    // The parts go in before they are squared, so the student sees where 1 + 4 came from.
    `|z| = \\sqrt{${squaredTex(z.re)} + ${squaredTex(z.im)}} = \\sqrt{${rTex(rMul(z.re, z.re))} + ${rTex(rMul(z.im, z.im))}} = ${modTex}`,
    '|a+bi| = \\sqrt{a^2 + b^2}'
  )
  // texAngle rather than fmtAngle: fmtAngle honours the compass-bearing notation setting, and
  // "N 36.87° E" is not a thing anyone writes for the argument of a complex number.
  const argTex = argumentTex(rNum(z.re), rNum(z.im))
  const answers = [{ label: 'Answer', tex: cxTex(z) }]
  // A whole-number answer already is its own decimal.
  if (z.re.d !== 1n || z.im.d !== 1n) answers.push(decimalRow(rNum(z.re), rNum(z.im), digits))
  if (!cxIsReal(z)) {
    answers.push({ label: 'Modulus', tex: modTex })
    answers.push({ label: 'Argument', tex: argTex })
    answers.push({ label: 'Conjugate', tex: cxTex(cxConj(z)) })
  }
  const agrees = agreesNumerically(src, z)
  const said = cxIsReal(z) ? 'The i parts cancelled, so the answer is an ordinary real number.' : `Real part ${rTex(z.re)}, imaginary part ${rTex(z.im)}.`
  return {
    title,
    input,
    moves: s.moves,
    answers,
    check:
      agrees === false
        ? 'Careful: working it out numerically gives a different number. Treat this answer with suspicion.'
        : agrees
          ? `${said} Working it out numerically gives the same number.`
          : said,
    checked: agrees === null ? undefined : agrees ? 'ok' : 'failed'
  }
}

// ---------------------------------------------------------------- with square roots
//
// The reader above holds fractions only, so 1/(√2 − √5i) was refused with a sentence about
// factorising, and the student got no answer at all: Complex has no SymPy to fall back on (P22).
// Every line that reader refuses comes here. i is still a letter until the i² step, but each power
// of i carries a surd from cxpoly.ts (q + r√n), so √2, √8 = 2√2 and √−3 = √3·i stay exact. What
// one surd per part cannot hold — two different roots in one part, π, a sine — still gets its
// answer, as a decimal with the reason: an error would hide the whole answer card.

/** A line that has a value exact working here cannot hold; the message is the reason given. */
class CannotHold extends Error {}

const ZERO: Surd = surd(R0)
const ONE: Surd = surd(R1)

/** The highest power multiplied out by hand; (1 + √3i)⁶ is the textbook one. */
const MAX_POWER = 12

const WORKS_WITH = 'The Complex job works exactly with numbers, i and square roots'
// "Working this line out", not "the answer": (√2 + √3)(√2 − √3) + i is −1 + i, but its first bracket
// already holds two roots in one part.
const TWO_ROOTS = 'The Complex job keeps each part of a number to one kind of square root, and working this line out needs two different roots in the same part, like √2 + √3.'
const SOMETHING_ELSE = `${WORKS_WITH}, using +, −, ×, ÷ and whole-number powers, and this line has something else in it.`
const ROOT_OF_WHAT = 'The Complex job takes square roots of ordinary numbers, like √5 or √−3, and this line has the square root of something else.'
const NOT_WHOLE_POWER = 'The Complex job multiplies out whole-number powers, and this line has a power that is not a whole number.'
const TOO_HIGH = `The Complex job multiplies powers out by hand up to the ${MAX_POWER}th, and this one is higher.`
const SIZE_BARS = 'The Complex job gives |z| as the Modulus of every answer, so to see it exactly, work out the number inside the bars on its own.'
const HELD_ROUNDED = 'The Complex job works exactly with numbers it can hold to the last figure, and this line has one too long to hold exactly.'
const NO_I = 'There is no i here, so this is an ordinary sum — the calculator will do it.'

/** The functions the Maths field writes, named the way a student says them. */
const FUNCTION_WORDS: Record<string, string> = {
  sin: 'a sine',
  cos: 'a cosine',
  tan: 'a tangent',
  sec: 'a secant',
  csc: 'a cosecant',
  cot: 'a cotangent',
  asin: 'an inverse sine',
  acos: 'an inverse cosine',
  atan: 'an inverse tangent',
  sinh: 'a hyperbolic function',
  cosh: 'a hyperbolic function',
  tanh: 'a hyperbolic function',
  ln: 'a logarithm',
  log: 'a logarithm',
  exp: 'a power of e',
  nthRoot: 'a root other than a square root',
  cbrt: 'a cube root',
  factorial: 'a factorial'
}

const usesSentence = (name: string): string =>
  `${WORKS_WITH}, and this line also has ${FUNCTION_WORDS[name] ?? 'a function'} in it, so it cannot be worked out exactly here.`

/**
 * Why a one-argument operator other than a sign cannot be worked exactly. The factorial, 3!, is the
 * one the Maths field writes, and it is named: the surd working once read it as nothing at all, so
 * 3!√2 came out as 3√2 (P22b round 2).
 */
const oneArgument = (op: string | undefined): string => (op === '!' ? usesSentence('factorial') : SOMETHING_ELSE)

const neverEnds = (name: string): string =>
  `${WORKS_WITH}, and ${name === 'pi' ? 'π' : name} is a number that never ends, so it cannot be written exactly here.`

/** i as a letter: entry k is the surd in front of iᵏ, so [1, 2√3, 3] is 1 + 2√3i + 3i². */
type IPoly = Surd[]

function ipTrim(p: IPoly): IPoly {
  let n = p.length
  while (n > 1 && surdIsZero(p[n - 1])) n--
  return n === 0 ? [ZERO] : p.slice(0, n)
}

const ipIsOne = (p: IPoly): boolean => p.length === 1 && surdEq(p[0], ONE)
const ipEq = (a: IPoly, b: IPoly): boolean => a.length === b.length && a.every((c, k) => surdEq(c, b[k]))
const ipNeg = (p: IPoly): IPoly => p.map(surdNeg)
const ipAdd = (a: IPoly, b: IPoly): IPoly => ipTrim(Array.from({ length: Math.max(a.length, b.length) }, (_, k) => surdAdd(a[k] ?? ZERO, b[k] ?? ZERO)))
/** The highest power of i written; 2 or more means i² = −1 has work to do. */
const topPower = (p: IPoly): number => p.length - 1

/**
 * surdMul, plus the one product it refuses that is still a single root: √2·√3 = √6. Two bare roots
 * multiply under one root sign; (1 + √2)·√3 would need two roots in one number, and surdMul's
 * refusal stands. Without it (√2 + √3i)(√2 − √3i), which is 5, was beyond the working: its cross
 * terms √6i and −√6i cancel only after they have been written.
 */
function timesSurd(a: Surd, b: Surd): Surd {
  const bare = !surdIsRational(a) && !surdIsRational(b) && rIsZero(a.q) && rIsZero(b.q)
  return bare && a.n !== b.n ? surd(R0, rMul(a.r, b.r), a.n * b.n) : surdMul(a, b)
}

function ipMul(a: IPoly, b: IPoly): IPoly {
  const out: IPoly = new Array<Surd>(a.length + b.length - 1).fill(ZERO)
  a.forEach((x, i) => b.forEach((y, j) => (out[i + j] = surdAdd(out[i + j], timesSurd(x, y)))))
  return ipTrim(out)
}

function ipPow(p: IPoly, k: number): IPoly {
  let out: IPoly = [ONE]
  for (let n = 0; n < k; n++) out = ipMul(out, p)
  return out
}

/** i² = −1 at work: the powers of i go round in fours. */
function ipReduce(p: IPoly): CxS {
  let re = ZERO
  let im = ZERO
  p.forEach((c, k) => {
    if (k % 4 === 0) re = surdAdd(re, c)
    else if (k % 4 === 1) im = surdAdd(im, c)
    else if (k % 4 === 2) re = surdSub(re, c)
    else im = surdSub(im, c)
  })
  return cxs(re, im)
}

// cxpoly writes a coefficient in front of its root, ½√3, which suits the factoriser's roots. One
// number is written the way the textbook and the item write it: √2/7 + (√5/7)i, not (1/7)√2 +
// (1/7)√5i (P22). Sentences get the same number in plain characters, because texToPlain turns
// \frac{\sqrt{2}}{7} into "√27".

/** p/q on its own, or p/q times √n with the root on top: 3, \frac{3}{25}, 2\sqrt{3}, \frac{\sqrt{5}}{7}. */
function magTex(c: Rat, n?: bigint): string {
  if (n === undefined) return c.d === 1n ? String(c.n) : `\\frac{${c.n}}{${c.d}}`
  const top = c.n === 1n ? `\\sqrt{${n}}` : `${c.n}\\sqrt{${n}}`
  return c.d === 1n ? top : `\\frac{${top}}{${c.d}}`
}

/** A surd's signed pieces, each followed by `suffix` (i, i²); a two-piece number goes in brackets first. */
function piecesTex(s: Surd, suffix = ''): SignedTex[] {
  const bare: SignedTex[] = []
  if (!rIsZero(s.q)) bare.push({ neg: rIsNeg(s.q), body: magTex(rAbs(s.q)) })
  if (!rIsZero(s.r)) bare.push({ neg: rIsNeg(s.r), body: magTex(rAbs(s.r), s.n) })
  if (!suffix) return bare
  if (bare.length === 2) {
    // (1 + √2)i: the imaginary part written once, as "imaginary part 1 + √2" says, not i + √2i.
    const neg = bare[0].neg && bare[1].neg
    return [{ neg, body: `\\left(${joinPieces(neg ? bare.map((p) => ({ neg: false, body: p.body })) : bare)}\\right)${suffix}` }]
  }
  return bare.map((p) => ({ neg: p.neg, body: p.body === '1' ? suffix : `${p.body}${suffix}` }))
}

const sTex = (s: Surd): string => joinPieces(piecesTex(s))
/** a + bi, real part first: \frac{\sqrt{2}}{7} + \frac{\sqrt{5}}{7}i. */
const zTex = (z: CxS): string => joinPieces([...piecesTex(z.re), ...piecesTex(z.im, 'i')])

/** The same number for a sentence, in plain characters: √2/7, 3/25, -2 + 2√2. */
function sPlain(s: Surd): string {
  const pieces: SignedTex[] = []
  if (!rIsZero(s.q)) pieces.push({ neg: rIsNeg(s.q), body: rStr(rAbs(s.q)) })
  if (!rIsZero(s.r)) {
    const c = rAbs(s.r)
    const top = `${c.n === 1n ? '' : c.n}√${s.n}`
    pieces.push({ neg: rIsNeg(s.r), body: c.d === 1n ? top : `${top}/${c.d}` })
  }
  return joinPieces(pieces)
}

/** Written in the order students write it, i as a letter: 1 + 2√3i + 3i². */
const ipTex = (p: IPoly): string => joinPieces(p.flatMap((c, k) => piecesTex(c, k === 0 ? '' : k === 1 ? 'i' : `i^{${k}}`)))

/** A line read as one fraction, its top and bottom each multiplied out with i as a letter. */
interface Frac {
  num: IPoly
  den: IPoly
}

const whole = (num: IPoly): Frac => ({ num, den: [ONE] })
const fracNeg = (a: Frac): Frac => ({ num: ipNeg(a.num), den: a.den })
const fracTimes = (a: Frac, b: Frac): Frac => ({ num: ipMul(a.num, b.num), den: ipMul(a.den, b.den) })
const fracOver = (a: Frac, b: Frac): Frac => ({ num: ipMul(a.num, b.den), den: ipMul(a.den, b.num) })
function fracPlus(a: Frac, b: Frac): Frac {
  // A shared bottom is kept as it is, rather than squared by cross-multiplying.
  if (ipEq(a.den, b.den)) return { num: ipAdd(a.num, b.num), den: a.den }
  return { num: ipAdd(ipMul(a.num, b.den), ipMul(b.num, a.den)), den: ipMul(a.den, b.den) }
}

/** The fraction's value when it is an ordinary number — no i, no root — or null. */
function rationalOf(f: Frac): Rat | null {
  const [n] = f.num
  const [d] = f.den
  if (f.num.length !== 1 || f.den.length !== 1 || !surdIsRational(n) || !surdIsRational(d) || rIsZero(d.q)) return null
  return rDiv(n.q, d.q)
}

/** What the reader met on the way, for the first steps of the working. */
interface Seen {
  /**
   * Each square root as typed → its simplest form, kept only where the two differ. `named` is the
   * square the root gave up, √(25 × 2) for √50, which the working with no i writes between the two.
   */
  roots: Map<string, { tex: string; negative: boolean; fraction: boolean; named?: string }>
  /** An i, typed or brought in by the root of a negative number. */
  i: boolean
}

type Loose = { type: string; op?: string; args?: MathNode[]; content?: MathNode; value?: unknown; name?: string; fn?: { name?: string }; implicit?: boolean }

function readFrac(node: MathNode, seen: Seen): Frac {
  const n = node as unknown as Loose
  const args = n.args ?? []
  switch (n.type) {
    case 'ParenthesisNode':
      return readFrac(n.content as MathNode, seen)
    case 'ConstantNode':
      if (typeof n.value !== 'number' || !Number.isFinite(n.value)) throw new CannotHold(SOMETHING_ELSE)
      // As written, like every other Pure Math reader: 0.15 is 3/20.
      return whole([surd(rFromNumber(n.value))])
    case 'SymbolNode':
      if (n.name === 'i') {
        seen.i = true
        return whole([ZERO, ONE])
      }
      // Letters were refused before reading began, so this is π or e.
      throw new CannotHold(neverEnds(String(n.name)))
    case 'OperatorNode': {
      if (args.length === 1 && (n.op === '-' || n.op === '+')) {
        const a = readFrac(args[0], seen)
        return n.op === '-' ? fracNeg(a) : a
      }
      if (args.length !== 2) throw new CannotHold(args.length === 1 ? oneArgument(n.op) : SOMETHING_ELSE)
      const a = readFrac(args[0], seen)
      const b = readFrac(args[1], seen)
      if (n.op === '+') return fracPlus(a, b)
      if (n.op === '-') return fracPlus(a, fracNeg(b))
      if (n.op === '*') return fracTimes(a, b)
      if (n.op === '/') return fracOver(a, b)
      if (n.op === '^') return powerOf(a, b)
      throw new CannotHold(SOMETHING_ELSE)
    }
    case 'FunctionNode': {
      const name = n.fn?.name ?? ''
      if (name === 'sqrt' && args.length === 1) return whole(rootOf(node, args[0], seen))
      if (name === 'mag' || name === 'abs') throw new CannotHold(SIZE_BARS)
      throw new CannotHold(usesSentence(name))
    }
    default:
      throw new CannotHold(SOMETHING_ELSE)
  }
}

/** A whole-number power multiplied out; a negative one turns the fraction over. */
function powerOf(base: Frac, power: Frac): Frac {
  const k = rationalOf(power)
  if (k === null || k.d !== 1n) throw new CannotHold(NOT_WHOLE_POWER)
  const p = Number(k.n)
  if (Math.abs(p) > MAX_POWER) throw new CannotHold(TOO_HIGH)
  const up: Frac = { num: ipPow(base.num, Math.abs(p)), den: ipPow(base.den, Math.abs(p)) }
  return p >= 0 ? up : { num: up.den, den: up.num }
}

/** √ of an ordinary number: a surd, or for a negative number a surd times i (√−3 = √3·i). */
function rootOf(node: MathNode, inside: MathNode, seen: Seen): IPoly {
  const m = rationalOf(readFrac(inside, seen))
  if (m === null) throw new CannotHold(ROOT_OF_WHAT)
  const negative = rIsNeg(m)
  const value: IPoly = negative ? [ZERO, surdSqrt(rNeg(m))] : [surdSqrt(m)]
  if (negative) seen.i = true
  const typed = typedTex(node)
  const simplest = ipTex(value)
  if (typed !== simplest) seen.roots.set(typed, { tex: simplest, negative, fraction: m.d !== 1n, named: squareNamed(m) })
  return value
}

/** √50 as √(25 × 2) and √36 as √(6²): the square taken out of a whole number, named. Nothing for any other root. */
function squareNamed(m: Rat): string | undefined {
  if (m.d !== 1n || m.n < 1n) return undefined
  const { out, in: rest, tooBig } = simplifySurd(m.n)
  if (tooBig || out === 1n) return undefined
  return rest === 1n ? `\\sqrt{${out}^{2}}` : `\\sqrt{${out * out} \\times ${rest}}`
}

/** The whole line as one fraction, and whether it was typed as one plain fraction. */
function readLine(node: MathNode, seen: Seen): { frac: Frac; plain: boolean } {
  let top = node as unknown as Loose
  while (top.type === 'ParenthesisNode' && top.content) top = top.content as unknown as Loose
  if (top.type === 'OperatorNode' && top.op === '/' && top.args?.length === 2) {
    const a = readFrac(top.args[0], seen)
    const b = readFrac(top.args[1], seen)
    return { frac: fracOver(a, b), plain: ipIsOne(a.den) && ipIsOne(b.den) }
  }
  const frac = readFrac(node, seen)
  return { frac, plain: ipIsOne(frac.den) }
}

/** Letters other than i — π and e are numbers to a student, not letters. */
function straysOf(node: MathNode): string[] {
  const fns = new Set<MathNode>()
  node.traverse((n) => {
    if (n.type === 'FunctionNode') fns.add((n as unknown as { fn: MathNode }).fn)
  })
  const names = node.filter((n) => n.type === 'SymbolNode' && !fns.has(n)).map((n) => String((n as unknown as { name: string }).name))
  return [...new Set(names)].filter((v) => v !== 'i' && v !== 'pi' && v !== 'e').sort()
}

/** Where a piece of a line sits, which decides whether it needs brackets of its own. */
type Place = 'alone' | 'sumLeft' | 'sumRight' | 'minusRight' | 'firstFactor' | 'factor' | 'base' | 'negated'
/** rootForm is a simplified root such as 2√2 or √2/2; rootFormI one that ends in i, such as 2i for √−4. */
type Kind = 'sum' | 'negative' | 'product' | 'fraction' | 'power' | 'atom' | 'rootForm' | 'rootFormI'

function needsBrackets(kind: Kind, place: Place): boolean {
  switch (place) {
    case 'alone':
    case 'sumLeft':
      return false
    case 'sumRight':
      return kind === 'negative'
    case 'firstFactor':
      // 2√2 in front of i reads as 2√2i, as the answer writes it; (2√2)i made a step that only
      // took the brackets away. 2i in front of i would read as 2ii, so that one keeps them.
      return kind === 'sum' || kind === 'rootFormI'
    case 'base':
      return kind !== 'atom'
    default:
      // minusRight, factor, negated: 1 − (2 + i), 2(−i), −(1 + i).
      return kind === 'sum' || kind === 'negative' || ((kind === 'rootForm' || kind === 'rootFormI') && place === 'factor')
  }
}

const isI = (node: MathNode): boolean => (node as unknown as Loose).type === 'SymbolNode' && (node as unknown as Loose).name === 'i'

/** The factors of a product written side by side, 3i√2 → 3, i, √2; a × or a bracket ends the run. */
function implicitFactors(node: MathNode): MathNode[] {
  const n = node as unknown as Loose
  if (n.type === 'OperatorNode' && n.op === '*' && n.implicit && n.args?.length === 2) return [...implicitFactors(n.args[0]), ...implicitFactors(n.args[1])]
  return [node]
}

/** Two factors written next to each other, the way they were typed. */
function besides(left: string, right: string, implicit: boolean): string {
  // Side by side, 2 and 3 read as 23 and 2 and ½ as two and a half.
  if (!implicit || /^(?:\d|\.|\\d?frac)/.test(right)) return `${left} \\times ${right}`
  // 2πi drawn as 2\pii is a command KaTeX does not know: a space ends the name.
  return /\\[A-Za-z]+$/.test(left) && /^[A-Za-z]/.test(right) ? `${left} ${right}` : `${left}${right}`
}

/** A number as it was typed, for KaTeX: 1.5e30 is 1.5 × 10³⁰. */
function literalTex(text: string): string {
  const [mant, exp] = text.toLowerCase().split('e')
  return exp === undefined ? text : `${mant}\\times 10^{${Number(exp)}}`
}

/**
 * A line as LaTeX, the way it was typed: never the linear text the engine runs (sqrt(2) drawn as
 * the letters s·q·r·t). The converter's own brackets — round a fraction, its top and bottom, a
 * power, a root — go, because the drawn fraction groups them already; the student's brackets round
 * a sum or a product stay. With `roots`, each square root is written in its simplest form, which
 * is the line the working carries on from, and an i typed in front of what it multiplies goes
 * after it (i√5 is carried on as √5i, the way every line below writes it), so the first step never
 * exists only to move an i. `typed` holds the digits of a number the double mathjs stores could not
 * keep: 12345678901234567 is shown as typed, not as the …568 it was read as.
 */
function typedTex(root: MathNode, roots?: Seen['roots'], typed?: Map<MathNode, string>): string {
  const simplest = (n: Loose): string | undefined =>
    roots && n.type === 'FunctionNode' && n.fn?.name === 'sqrt' && n.args?.length === 1 ? roots.get(`\\sqrt{${typedTex(n.args[0])}}`)?.tex : undefined
  const kindOf = (n: Loose): Kind => {
    const s = simplest(n)
    if (s !== undefined) return /^(?:\d+|\\sqrt\{\d+\})$/.test(s) ? 'atom' : /i$/.test(s) ? 'rootFormI' : 'rootForm'
    if (n.type !== 'OperatorNode') return 'atom'
    // A factorial binds tighter than any product or sign, so 3!√2 needs no brackets; only a power does (below).
    if ((n.args?.length ?? 0) === 1) return n.op === '!' ? 'atom' : 'negative'
    return n.op === '+' || n.op === '-' ? 'sum' : n.op === '*' ? 'product' : n.op === '/' ? 'fraction' : n.op === '^' ? 'power' : 'atom'
  }
  const write = (node: MathNode, place: Place): string => {
    const n = node as unknown as Loose
    if (n.type === 'ParenthesisNode' && n.content) {
      if (place === 'alone') return write(n.content, place)
      const kind = kindOf(n.content as unknown as Loose)
      const keep = kind === 'sum' || kind === 'negative' || kind === 'product' || needsBrackets(kind, place)
      return keep ? `\\left(${write(n.content, 'alone')}\\right)` : write(n.content, place)
    }
    const body = bare(node)
    // A root raised to a power keeps its brackets: √5 with a 2 after it reads as the root of 5², and
    // (√5)² is what was typed (P22b: the header of the working for (√5)² read √5²). The same goes for
    // a root with a factorial after it, (√9)! (P22b round 2), and for a factorial raised to a power, (3!)².
    const rootBase = place === 'base' && ((n.type === 'FunctionNode' && n.fn?.name === 'sqrt' && simplest(n) === undefined) || (n.type === 'OperatorNode' && n.op === '!'))
    return needsBrackets(kindOf(n), place) || rootBase ? `\\left(${body}\\right)` : body
  }
  const bare = (node: MathNode): string => {
    const n = node as unknown as Loose
    const args = n.args ?? []
    if (n.type === 'ConstantNode') {
      const asTyped = typed?.get(node)
      if (asTyped !== undefined) return literalTex(asTyped)
      const text = String(n.value)
      return typeof n.value === 'number' && /e/i.test(text) ? rTex(rFromNumber(n.value)) : text
    }
    if (n.type === 'SymbolNode') return n.name === 'pi' ? '\\pi' : String(n.name)
    if (n.type === 'FunctionNode') {
      const name = n.fn?.name
      const s = simplest(n)
      if (s !== undefined) return s
      if (name === 'sqrt' && args.length === 1) return `\\sqrt{${write(args[0], 'alone')}}`
      if (name === 'nthRoot' && args.length === 2) return `\\sqrt[${write(args[1], 'alone')}]{${write(args[0], 'alone')}}`
      if ((name === 'mag' || name === 'abs') && args.length === 1) return `\\left|${write(args[0], 'alone')}\\right|`
      // The Maths field's log is base 10, log(a, b) is the log of b to base a, and ln is the natural
      // log (math/expr.ts). mathjs's own toTex writes log as \ln, so the header read ln(√10) beside the
      // base-10 decimal (P22b round 2), and it writes the two-argument log with its base the other way round.
      if (name === 'log' && args.length === 1) return `\\log\\left(${write(args[0], 'alone')}\\right)`
      if (name === 'log' && args.length === 2) return `\\log_{${write(args[0], 'alone')}}\\left(${write(args[1], 'alone')}\\right)`
      if (name === 'ln' && args.length === 1) return `\\ln\\left(${write(args[0], 'alone')}\\right)`
    }
    if (n.type === 'OperatorNode' && args.length === 1) {
      if (n.op === '-' || n.op === '+') return `${n.op}${write(args[0], 'negated')}`
      // A factorial follows what it acts on, 3! or (√2 + 1)!: every operator but the minus was written
      // as a plus in front, so the header for 3!√2 read "+3√2" (P22b round 2). Any other one-argument
      // operator falls through to mathjs's own writing below.
      if (n.op === '!') return `${write(args[0], 'base')}!`
    }
    if (n.type === 'OperatorNode' && args.length === 2) {
      const [a, b] = args
      if (n.op === '+') return `${write(a, 'sumLeft')} + ${write(b, 'sumRight')}`
      if (n.op === '-') return `${write(a, 'sumLeft')} - ${write(b, 'minusRight')}`
      if (n.op === '/') return `\\dfrac{${write(a, 'alone')}}{${write(b, 'alone')}}`
      if (n.op === '^') return `${write(a, 'base')}^{${write(b, 'alone')}}`
      if (n.op === '*') {
        if (roots && n.implicit) {
          const factors = implicitFactors(node)
          // mathjs reads −i√5 as (−i)·√5: that minus belongs to the whole product.
          const lead = factors[0] as unknown as Loose
          const minus = lead.type === 'OperatorNode' && lead.op === '-' && lead.args?.length === 1
          if (minus) factors[0] = (lead.args as MathNode[])[0]
          const is = factors.filter(isI)
          if (is.length === 1 && !isI(factors[factors.length - 1])) {
            const shown = [...factors.filter((f) => !isI(f)), is[0]].map((f, k) => write(f, k === 0 ? 'firstFactor' : 'factor')).reduce((l, r) => besides(l, r, true))
            return `${minus ? '-' : ''}${shown}`
          }
        }
        return besides(write(a, 'firstFactor'), write(b, 'factor'), Boolean(n.implicit))
      }
    }
    // Anything else (a sine, say) is only ever shown on a refusal; mathjs writes it well enough.
    return node.toTex({ parenthesis: 'auto', implicit: 'hide' }).replace(/~/g, '')
  }
  return write(root, 'alone')
}

/** One signed term per (surd, suffix), joined: √2 − √2i − √2i + √2i². */
const termsTex = (terms: [Surd, string][]): string => joinPieces(terms.flatMap(([v, suffix]) => piecesTex(v, suffix)))

/** A part squared as the modulus line writes it, sign and all, like squaredTex: (−2)², (2√3)². */
function surdSquaredTex(s: Surd): string {
  const t = sTex(s)
  return /^\d+$/.test(t) ? `${t}^2` : `\\left(${t}\\right)^2`
}

/** A part's size squared, for (a + bi)(a − bi) = a² + b²: (√2)² + (√5)², whatever the signs. */
function sizeSquaredTex(s: Surd): string {
  const pieces = surdPieces(s)
  return surdSquaredTex(pieces.length === 1 && pieces[0].neg ? surdNeg(s) : s)
}

/** Each link written once: a link that says nothing new is left out rather than repeated. */
const chain = (links: string[]): string => links.filter((t, k, all) => t !== '' && (k === 0 || t !== all[k - 1])).join(' = ')

const surdValue = (s: Surd): number => rNum(s.q) + rNum(s.r) * Math.sqrt(Number(s.n))
const isWhole = (s: Surd): boolean => surdIsRational(s) && s.q.d === 1n

function rootsMove(roots: Seen['roots'], s: Steps): void {
  const all = [...roots]
  const negative = all.filter(([, r]) => r.negative).length
  s.goal('Simplify the square roots').add(
    negative === all.length
      ? 'Write the square root of a negative number with i, since i² = −1.'
      : negative
        ? 'Write each square root in its simplest form, with i for the root of a negative number, since i² = −1.'
        : 'Write each square root in its simplest form.',
    all.map(([typed, r]) => `${typed} = ${r.tex}`).join(',\\quad '),
    // The rule that was used: √0.5 = √2/2 is the root of a fraction (√(p/q) = √(pq)/q, as surdSqrt
    // builds it), not a square taken out of a whole number.
    negative ? '\\sqrt{-k} = \\sqrt{k}\\,i' : all.some(([, r]) => r.fraction) ? '\\sqrt{\\dfrac{a}{b}} = \\dfrac{\\sqrt{ab}}{b}' : '\\sqrt{a^2 b} = a\\sqrt{b}'
  )
}

/**
 * A root left on the bottom is cleared the way surds are taught: multiply top and bottom by √n, or
 * by the conjugate surd q − r√n, since (q + r√n)(q − r√n) = q² − r²n.
 */
function rationalise(top: CxS, bottom: Surd, s: Steps): { top: CxS; bottom: Surd } {
  const alone = rIsZero(bottom.q)
  const by = alone ? surd(R0, R1, bottom.n) : surd(bottom.q, rNeg(bottom.r), bottom.n)
  const newBottom = timesSurd(bottom, by)
  const newTop = cxs(timesSurd(top.re, by), timesSurd(top.im, by))
  s.goal('Clear the root from the bottom').add(
    `The bottom has a root in it, so multiply top and bottom by ${sPlain(by)}${alone ? '' : ', its conjugate,'} to clear it.`,
    `\\dfrac{${zTex(top)}}{${sTex(bottom)}} \\times \\dfrac{${sTex(by)}}{${sTex(by)}} = \\dfrac{${zTex(newTop)}}{${sTex(newBottom)}}`,
    alone ? '\\sqrt{n} \\times \\sqrt{n} = n' : '(a + b\\sqrt{n})(a - b\\sqrt{n}) = a^2 - b^2 n'
  )
  return { top: newTop, bottom: newBottom }
}

/** Every number literal in a line, in the order a left-to-right walk of mathjs's tree meets them. */
const LITERAL = /(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi

/** The line the way both readers hand it to mathjs. */
const readable = (src: string): string => writeTimes(preprocess(src.trim().replace(/^=+|=+$/g, '')))

/**
 * Whether the exact working would start from some other number than the one typed. Both readers
 * take a number from the double mathjs stores, which holds about 16 figures: 12345678901234567 is
 * stored as …568, and 0.1000000000000000055 as 0.1.
 */
function heldRounded(text: string): boolean {
  const v = Number(text)
  if (!Number.isFinite(v)) return true
  const [mant, exp = '0'] = text.toLowerCase().split('e')
  const [whole, frac = ''] = mant.split('.')
  const k = Number(exp) - frac.length
  // Past 10^±400 a double holds nothing exactly anyway, and building the power would only be slow.
  if (Math.abs(k) > 400) return true
  const digits = BigInt(`${whole}${frac}` || '0')
  const typed = k >= 0 ? rat(digits * 10n ** BigInt(k)) : rat(digits, 10n ** BigInt(-k))
  return !rEq(typed, rFromNumber(v))
}

const typedPastExact = (line: string): boolean => [...line.matchAll(LITERAL)].some((m) => heldRounded(m[0]))

/** The digits as typed of each number mathjs could not hold, by its node, for the line shown back. */
function roundedLiterals(line: string, node: MathNode): Map<MathNode, string> | undefined {
  const texts = [...line.matchAll(LITERAL)].map((m) => m[0])
  const numbers = node.filter((n) => n.type === 'ConstantNode')
  // Typed order and tree order agree; when the counts do not, nothing is guessed.
  if (texts.length !== numbers.length) return undefined
  const out = new Map<MathNode, string>()
  numbers.forEach((n, k) => {
    if (heldRounded(texts[k])) out.set(n, texts[k])
  })
  return out
}

/**
 * What a piece of a typed line multiplies together. Two roots, two i's or two numbers in one
 * product is work to show; a root that simplifies with a number in front (√8 = 2√2, √4 = 2) is a
 * number too, so 2√8 is 2 × 2√2.
 */
interface Scan {
  roots: number
  is: number
  nums: number
  expand: boolean
}

/**
 * Whether a typed line holds anything to multiply out: a power, a bracket that is multiplied or
 * subtracted, two roots, two i's or two numbers in one product (√2·√3, √−3·i, 2√8), or a division
 * by more than a plain number. A line with none of these — i√5, √−4 + i, √3/2 + ½i — only needs
 * writing in the form a + bi, and a heading that says "multiply out" there describes work nobody
 * did. A line typed as one fraction is asked about its top and its bottom.
 */
function needsExpanding(node: MathNode, plainFraction: boolean): boolean {
  let top = node as unknown as Loose
  while (top.type === 'ParenthesisNode' && top.content) top = top.content as unknown as Loose
  if (plainFraction && top.type === 'OperatorNode' && top.op === '/' && top.args?.length === 2) {
    return scan(top.args[0], true).expand || scan(top.args[1], true).expand
  }
  return scan(node, true).expand
}

function scan(node: MathNode, whole: boolean): Scan {
  const n = node as unknown as Loose
  const args = n.args ?? []
  const nothing: Scan = { roots: 0, is: 0, nums: 0, expand: false }
  switch (n.type) {
    case 'ConstantNode':
      return { ...nothing, nums: 1 }
    case 'SymbolNode':
      return n.name === 'i' ? { ...nothing, is: 1 } : nothing
    case 'FunctionNode': {
      // √−3 brings an i of its own, so √−3·i is i times i; √8 brings the 2 of 2√2.
      const shape = args.length === 1 ? rootShape(args[0]) : { negative: false, scaled: false }
      return { roots: 1, is: shape.negative ? 1 : 0, nums: shape.scaled ? 1 : 0, expand: false }
    }
    case 'ParenthesisNode': {
      const inner = scan(n.content as MathNode, whole)
      const c = n.content as unknown as Loose
      const sum = c.type === 'OperatorNode' && (c.op === '+' || c.op === '-') && c.args?.length === 2
      return sum && !whole ? { ...inner, expand: true } : inner
    }
    case 'OperatorNode': {
      if (args.length === 1) return scan(args[0], false)
      if (args.length !== 2 || n.op === '^') return { ...nothing, expand: true }
      const a = scan(args[0], false)
      if (n.op === '/') return args[1].filter((m) => m.type === 'SymbolNode' || m.type === 'FunctionNode').length ? { ...a, expand: true } : a
      const b = scan(args[1], false)
      if (n.op === '*') {
        const roots = a.roots + b.roots
        const is = a.is + b.is
        const nums = a.nums + b.nums
        return { roots, is, nums, expand: a.expand || b.expand || roots > 1 || is > 1 || nums > 1 }
      }
      // A sum is not a factor: what is multiplied inside each term stays inside it.
      return { ...nothing, expand: a.expand || b.expand }
    }
    default:
      return nothing
  }
}

/** Whether a square root's number is negative, and whether its simplest form has a number in front. */
function rootShape(inside: MathNode): { negative: boolean; scaled: boolean } {
  try {
    const m = rationalOf(readFrac(inside, { roots: new Map(), i: false }))
    if (m === null) return { negative: false, scaled: false }
    const root = surdSqrt(rAbs(m))
    return { negative: rIsNeg(m), scaled: !(rIsZero(root.q) && rIsOne(rAbs(root.r))) }
  } catch {
    return { negative: false, scaled: false }
  }
}

/** \dfrac and \frac draw the same number; a step between the two would change nothing. */
const sameLine = (a: string, b: string): boolean => a.replace(/\\dfrac/g, '\\frac') === b.replace(/\\dfrac/g, '\\frac')

const A_PLUS_BI = 'a + bi:\\ \\text{real part } a,\\ \\text{imaginary part } b'

/** The reason a line gets its answer as a decimal, in words for this job. */
function reasonFor(err: unknown): string {
  if (err instanceof CannotHold) return err.message
  // cxpoly's own refusal: surdAdd and surdMul share one root or throw.
  if (err instanceof Error && /cannot be combined exactly/.test(err.message)) return TWO_ROOTS
  return 'The Complex job could not write this one exactly.'
}

/**
 * The answer as a decimal, with why there are no steps: answers are never optional. A line with no
 * i is "an ordinary sum, the calculator will do it" to the Complex job; the working for a line with
 * a root (`real`) is the one place that gives such a line its decimal, and says why it has no steps.
 */
function decimalAnswer(title: string, input: string, node: MathNode, src: string, why: string, digits: DigitSettings, real = false): Working {
  const v = numericValue(src)
  if (!v) return failed(title, input, why)
  if (!Number.isFinite(v.re) || !Number.isFinite(v.im)) return failed(title, input, 'Worked out with decimals this does not come to a number, so there is no answer to give.')
  // A part that is only round-off beside the other is 0, as on the calculator line
  // (calc/engine.ts tidyComplex): e^(iπ) is −1, not −1 + 1.2×10⁻¹⁶i.
  const eps = 1e-12 * Math.max(Math.abs(v.re), Math.abs(v.im))
  const re = Math.abs(v.re) < eps ? 0 : v.re
  const im = Math.abs(v.im) < eps ? 0 : v.im
  const typedI = node.filter((n) => n.type === 'SymbolNode' && (n as unknown as { name: string }).name === 'i').length > 0
  if (!typedI && im === 0 && !real) return failed(title, input, NO_I)
  return { title, input, moves: [], answers: [{ label: 'Answer', tex: `\\approx ${decimalTex(re, im, digits)}` }], noWorking: true, reason: why }
}

/**
 * Complex arithmetic with square roots in it, set out like the fractions-only working above.
 *
 * With `real`, a line that has no i is worked instead (P22b) by realSteps below, which keeps every
 * refusal of the reader above but words them for a line with no i. A root of a negative number
 * still brings its own i: that line is a complex number, and is worked as one.
 */
function surdComplexWorking(src: string, digits: DigitSettings, real = false): Working {
  const title = real ? SURD_TITLE : 'Complex number'
  const text = readable(src)
  let node: MathNode
  try {
    node = math.parse(text)
  } catch {
    // √2 + i = 0 was told to check its brackets; they were fine.
    if (text.includes('=')) {
      return failed(title, src, real ? 'This works out a number, such as √50 or 1/(√3 + 1), and this line is an equation.' : 'The Complex job works out a number, such as (2 + 3i)/(1 − i), and this line is an equation.')
    }
    return failed(title, src, 'I could not read that. Check the brackets and signs.')
  }
  const input = typedTex(node, undefined, roundedLiterals(text, node))
  const strays = straysOf(node)
  if (strays.length) return failed(title, input, `This has ${strays.join(', ')} in it. ${real ? 'Surds are worked on numbers' : 'The complex tools work on numbers'}, not letters.`)
  if (typedPastExact(text)) return decimalAnswer(title, input, node, src, real ? forSurds(HELD_ROUNDED) : HELD_ROUNDED, digits, real)
  const seen: Seen = { roots: new Map(), i: false }
  try {
    if (real) return realSteps(title, input, node, src, digits)
    const { frac, plain } = readLine(node, seen)
    if (!seen.i) return failed(title, input, NO_I)
    return surdSteps(title, input, node, frac, plain, seen, src, digits)
  } catch (err) {
    if (real && err instanceof ComplexLine) return surdComplexWorking(src, digits)
    if (real && err instanceof ZeroBottom) return failed(title, input, 'The bottom comes to zero.')
    return decimalAnswer(title, input, node, src, real ? realReasonFor(err) : reasonFor(err), digits, real)
  }
}

function surdSteps(title: string, input: string, node: MathNode, frac: Frac, plain: boolean, seen: Seen, src: string, digits: DigitSettings): Working {
  const s = new Steps()
  let { num, den } = frac
  if (seen.roots.size) rootsMove(seen.roots, s)
  // The line as typed, roots simplified: the first step starts from what the student wrote.
  const start = typedTex(node, seen.roots)
  const expand = needsExpanding(node, plain)
  // Terms over plain numbers with nothing to multiply out — √3/2 + ½i — are a + bi already. Made
  // into one fraction and divided back out, they went round in a circle to the line as typed.
  // (Anything else over a plain number is not caught here: (√3/2 + ½i)³ keeps its one fraction.)
  if (!plain && !expand && den.length === 1 && surdIsRational(den[0]) && !rIsZero(den[0].q)) {
    const over = surd(rInv(den[0].q))
    num = num.map((c) => timesSurd(c, over))
    den = [ONE]
  }

  if (ipIsOne(den)) {
    const expanded = ipTex(num)
    s.goal('Simplify to a + bi')
    if (!sameLine(start, expanded)) {
      // Said as what happened: "multiply out" only when something was multiplied (P22: i√5 = √5i
      // was headed "Multiply out and collect").
      s.add(
        expand ? 'Multiply out and collect, treating i as an ordinary letter for now.' : 'Write it in the form a + bi.',
        `${start} = ${expanded}`,
        expand ? '\\text{expand as usual}' : A_PLUS_BI
      )
    }
    powerRuleMove(topPower(num), s)
    const z = ipReduce(num)
    // From the expression, not from the line above it, as in the working above (Fix 4).
    if (expanded !== zTex(z)) s.add('Now gather the real parts and the i parts separately.', `${expanded} = ${zTex(z)}`, A_PLUS_BI)
    return finishSurd(title, input, s, z, src, digits)
  }

  const expanded = `\\dfrac{${ipTex(num)}}{${ipTex(den)}}`
  if (!sameLine(start, expanded)) {
    const [goal, head] = !plain
      ? ['Write it as one fraction', 'Write it as one fraction, multiplying out the top and the bottom with i as an ordinary letter.']
      : expand
        ? ['Multiply out the top and bottom', 'Multiply out the top and the bottom, treating i as an ordinary letter for now.']
        : ['Tidy the top and bottom', 'Write the top and the bottom each in the form a + bi.']
    s.goal(goal).add(head, `${start} = ${expanded}`)
  }
  const dz = ipReduce(den)
  if (surdIsZero(dz.re) && surdIsZero(dz.im)) return failed(title, input, 'The bottom comes to zero.')
  const nz = ipReduce(num)
  // Only what has something to work out (Fix 4): "1 − 2i = 1 − 2i" was a step that changed nothing.
  const tidyBottom = ipTex(den) !== zTex(dz)
  const tidyTop = ipTex(num) !== zTex(nz)
  const highest = Math.max(topPower(num), topPower(den))
  const iRule = highest < 2 ? undefined : highest === 2 ? 'i^2 = -1' : 'i^{n} = i^{\\,n \\bmod 4}'
  if (tidyBottom || tidyTop) s.goal(tidyBottom && tidyTop ? 'Simplify the top and bottom' : tidyBottom ? 'Simplify the bottom' : 'Simplify the top')
  if (tidyBottom) s.add('Work the bottom out first, so it is one number of the form a + bi.', `${ipTex(den)} = ${zTex(dz)}`, iRule)
  if (tidyTop) s.add(tidyBottom ? 'Work the top out the same way.' : 'Work the top out first, so it is one number of the form a + bi.', `${ipTex(num)} = ${zTex(nz)}`, iRule)

  let top = nz
  let bottom = dz.re
  const realBottom = cxsIsReal(dz)
  if (!realBottom) {
    const conj = cxsConj(dz)
    s.goal('Multiply by the conjugate').add(
      'A complex number on the bottom is not allowed in a final answer, so multiply top and bottom by the conjugate of the bottom.',
      `\\dfrac{${zTex(nz)}}{${zTex(dz)}} \\times \\dfrac{${zTex(conj)}}{${zTex(conj)}}`,
      '(a+bi)(a-bi) = a^2 + b^2'
    )
    // a² + b² straight from the parts. Multiplying the pair out term by term forms √2·√5i and
    // −√2·√5i, which cancel but each need a root the parts do not share (the multiply-back trap).
    const a2 = timesSurd(dz.re, dz.re)
    const b2 = timesSurd(dz.im, dz.im)
    bottom = surdAdd(a2, b2)
    const rooted = !surdIsRational(dz.re) || !surdIsRational(dz.im)
    s.add(
      'The bottom becomes a real number, because the i terms cancel.',
      chain([
        `\\left(${zTex(dz)}\\right)\\left(${zTex(conj)}\\right)`,
        // The squares are written out only where a root is squared, as the rational working does.
        rooted ? (surdIsZero(dz.re) ? sizeSquaredTex(dz.im) : `${sizeSquaredTex(dz.re)} + ${sizeSquaredTex(dz.im)}`) : '',
        surdIsZero(dz.re) ? '' : `${sTex(a2)} + ${sTex(b2)}`,
        sTex(bottom)
      ]),
      'a^2 - (bi)^2 = a^2 + b^2'
    )
    const [ac, ad, bc, bd] = [timesSurd(nz.re, conj.re), timesSurd(nz.re, conj.im), timesSurd(nz.im, conj.re), timesSurd(nz.im, conj.im)]
    top = cxs(surdSub(ac, bd), surdAdd(ad, bc))
    s.add(
      // A real top, 1 over √2 − √5i, makes no i² at all: the rule is named only when it is used.
      surdIsZero(bd) ? 'Multiply out the top the same way.' : 'Multiply out the top the same way, using i² = −1.',
      chain([
        `\\left(${zTex(nz)}\\right)\\left(${zTex(conj)}\\right)`,
        termsTex([
          [ac, ''],
          [ad, 'i'],
          [bc, 'i'],
          [bd, 'i^{2}']
        ]),
        termsTex([
          [ac, ''],
          [surdAdd(ad, bc), 'i'],
          [surdNeg(bd), '']
        ]),
        zTex(top)
      ])
    )
  }
  const rationalised = !surdIsRational(bottom)
  if (rationalised) ({ top, bottom } = rationalise(top, bottom, s))
  const over = bottom.q
  const z = cxs(timesSurd(top.re, surd(rInv(over))), timesSurd(top.im, surd(rInv(over))))
  const divided = `\\dfrac{${zTex(top)}}{${rTex(over)}}`
  // 2√2 over 3 is already written as \frac{2\sqrt{2}}{3}: dividing it out would change nothing.
  if (!rIsOne(over) && !sameLine(divided, zTex(z))) {
    s.add(realBottom && !rationalised ? 'The bottom is already a real number, so divide both parts by it.' : 'Divide each part by the bottom.', `${divided} = ${zTex(z)}`)
  }
  return finishSurd(title, input, s, z, src, digits)
}

/** finishComplex for an answer with roots in it: modulus, argument and conjugate, then the check. */
function finishSurd(title: string, input: string, s: Steps, z: CxS, src: string, digits: DigitSettings): Working {
  const re = surdValue(z.re)
  const im = surdValue(z.im)
  // |z|² squares each part against itself, which stays under its own root. When the two squares
  // sit under different roots, |z| is a root inside a root: the row is left out, never guessed.
  let modTex: string | null = null
  try {
    const a2 = timesSurd(z.re, z.re)
    const b2 = timesSurd(z.im, z.im)
    const modSq = surdAdd(a2, b2)
    if (surdIsRational(modSq)) {
      modTex = sTex(surdSqrt(modSq.q))
      s.goal('Find modulus and argument').add(
        'The modulus is the distance from the origin on the Argand diagram.',
        `|z| = \\sqrt{${surdSquaredTex(z.re)} + ${surdSquaredTex(z.im)}} = \\sqrt{${sTex(a2)} + ${sTex(b2)}} = ${modTex}`,
        '|a+bi| = \\sqrt{a^2 + b^2}'
      )
    }
  } catch {
    modTex = null
  }
  const answers: Answer[] = [{ label: 'Answer', tex: zTex(z) }]
  if (!isWhole(z.re) || !isWhole(z.im)) answers.push(decimalRow(re, im, digits))
  if (!cxsIsReal(z)) {
    if (modTex) answers.push({ label: 'Modulus', tex: modTex })
    answers.push({ label: 'Argument', tex: argumentTex(re, im) })
    answers.push({ label: 'Conjugate', tex: zTex(cxsConj(z)) })
  }
  const agrees = agreesWith(src, re, im)
  // Plain characters: the panel's texToPlain would read \frac{\sqrt{2}}{7} as "√27".
  const said = cxsIsReal(z) ? 'The i parts cancelled, so the answer is an ordinary real number.' : `Real part ${sPlain(z.re)}, imaginary part ${sPlain(z.im)}.`
  return {
    title,
    input,
    moves: s.moves,
    answers,
    check:
      agrees === false
        ? 'Careful: working it out numerically gives a different number. Treat this answer with suspicion.'
        : agrees
          ? `${said} Working it out numerically gives the same number.`
          : said,
    checked: agrees === null ? undefined : agrees ? 'ok' : 'failed'
  }
}

// ---------------------------------------------------------------- surds with no i
//
// 1/(√3 + 1), 3√2 + 2√2, (2 + √3)(2 − √3): numbers with a square root in them and no i. Auto sent
// every one to Factorise, which refused it as "just a number" (P22b), though the surd arithmetic
// above holds them all: a real surd is the same q + r√n with nothing imaginary. The steps are the
// textbook's — the largest square out of each root, like surds collected, a bottom cleared by its
// conjugate, (√a)² = a — and are written here rather than borrowed from surdSteps, whose steps are
// about i ("treating i as an ordinary letter") and would say nothing true about a line with none.
// Each operation is worked on the numbers the one before it left, in the order a pencil would do
// it. A sum of different roots, √2 + √3, which the reader above cannot hold, this working holds.

const SURD_TITLE = 'Simplify surds'

/** A bottom that comes to zero: said as the Complex job says it. */
class ZeroBottom extends Error {}

/** A line with an i in it, typed or brought by the root of a negative number: not this working's line. */
class ComplexLine extends Error {}

/**
 * A sum that ends with two roots that cannot be one number, √2 + √3: it is its own answer. The
 * working carries it out of the walk as written, with its value, and `lone` says that no step came
 * before it, so the answer is the line itself and has nothing to be checked against.
 */
class UnlikeRoots extends Error {
  constructor(
    readonly tex: string,
    readonly value: number,
    readonly lone: boolean
  ) {
    super('different roots')
  }
}

/**
 * A numeric line with a square root in it and nothing else that needs a letter (π and the functions
 * named here are numbers). isNumericLine (factor.ts) asks for a word boundary in front of a
 * function's name, and 3sqrt(2) — a number glued to its root, which is how 3√2 is typed — has none:
 * it kept its letters and was refused as something to factorise. A sine, cosine or tangent is left
 * out: the decimal here comes from mathjs in radians, the calculator line above it reads the
 * student's angle unit, and two answers for one line are worse than the refusal it always had.
 */
export function isSurdLine(src: string): boolean {
  let text: string
  try {
    text = readable(src)
  } catch {
    return false
  }
  if (!/(?<![A-Za-z_])sqrt\s*\(/.test(text)) return false
  return !/[A-Za-z]/.test(text.replace(/(?<![A-Za-z_])(?:sqrt|cbrt|nthRoot|abs|ln|log10|log2|log|exp|pi)(?![A-Za-z_\d])/g, ''))
}

/** The working for a numeric line with a root in it: steps, the exact answer, its decimal and a check. */
export function surdWorking(src: string, digits: DigitSettings = studentDigits()): Working {
  return surdComplexWorking(src, digits, true)
}

/** The reader's refusals are worded for the Complex job; a line with no i is not its line, so PhysLab says them. */
const forSurds = (reason: string): string => reason.replace(/^The Complex job/, 'PhysLab')

const BARS_OF_A_SURD = 'PhysLab does not work bars out exactly here, so to see the exact value, work out the number inside the bars on its own.'

/** The reason a line with no i gets its answer as a decimal, in words for this working. */
function realReasonFor(err: unknown): string {
  if (err instanceof Error && /cannot be combined exactly/.test(err.message)) {
    // cxpoly's own refusal, "√2 and √3 cannot be combined exactly": surdAdd and surdMul share one root or throw.
    const [, a, b] = err.message.match(/√(\d+) and √(\d+)/) ?? []
    return `${a && b ? `√${a} and √${b} are different roots` : 'This line has different roots in one number'}, and PhysLab keeps every number to one kind of root, so it cannot write this one out exactly.`
  }
  if (err instanceof CannotHold) return err.message === SIZE_BARS ? BARS_OF_A_SURD : forSurds(err.message)
  return 'PhysLab could not write this one exactly.'
}

/** A written part of a surd: the whole number, or the number in front of the root. */
interface Part {
  c: Rat
  n: bigint | null
}

function partsOf(s: Surd): Part[] {
  const out: Part[] = []
  if (!rIsZero(s.q)) out.push({ c: s.q, n: null })
  if (!rIsZero(s.r)) out.push({ c: s.r, n: s.n })
  return out
}

/**
 * A surd the way a textbook writes it: √3 − 1 and not −1 + √3 (a minus leads only when nothing
 * positive can), and (√3 − 1)/2 with two parts over one bottom. `plain` is for sentences, where
 * texToPlain would read \frac{\sqrt{3}}{2} as "√32".
 */
function surdWritten(s: Surd, plain = false): string {
  const part = (c: Rat, n: bigint | null): string => {
    if (n === null) return plain ? rStr(c) : magTex(c)
    if (!plain) return magTex(c, n)
    const top = `${c.n === 1n ? '' : c.n}√${n}`
    return c.d === 1n ? top : `${top}/${c.d}`
  }
  if (!plain && !rIsZero(s.q) && !rIsZero(s.r) && s.q.d === s.r.d && s.q.d > 1n) {
    const top = plusFirst([
      { neg: rIsNeg(s.q), body: String(rAbs(s.q).n) },
      { neg: rIsNeg(s.r), body: magTex(rat(rAbs(s.r).n), s.n) }
    ])
    const minus = top.every((p) => p.neg)
    return `${minus ? '-' : ''}\\frac{${joinPieces(minus ? top.map((p) => ({ ...p, neg: false })) : top)}}{${s.q.d}}`
  }
  return joinPieces(plusFirst(partsOf(s).map((p) => ({ neg: rIsNeg(p.c), body: part(rAbs(p.c), p.n) }))))
}

/** One part as a signed piece: the whole number, or the number in front of its root. */
const pieceOf = (p: Part): SignedTex => ({ neg: rIsNeg(p.c), body: p.n === null ? rTex(rAbs(p.c)) : magTex(rAbs(p.c), p.n) })

/** √3 − 1, not −1 + √3: when the first piece is a minus, the first positive one leads. */
function plusFirst(ps: SignedTex[]): SignedTex[] {
  const at = ps.findIndex((p) => !p.neg)
  return ps[0]?.neg && at > 0 ? [ps[at], ...ps.slice(0, at), ...ps.slice(at + 1)] : ps
}

const realTex = (s: Surd): string => surdWritten(s)
/** For a sentence, with the proper minus, −, as the hand-written sentences have it. */
const realPlain = (s: Surd): string => surdWritten(s, true).replace(/-/g, '−')

/**
 * A part of the line as typedTex writes it, in plain symbols for a sentence. texToPlain reads a
 * fraction only when its top and bottom hold no braces of their own, so the conjugate of
 * \frac{\sqrt{3}}{2} + 1 reached the student as "√32 - 1" (P22b round 2). Roots and fractions are
 * written here from the inside out, so none is left by the time texToPlain meets the rest: a top or
 * a bottom that is more than one number or root keeps its brackets, as does a fraction with a
 * factor straight after it, and the minus is the proper one.
 */
function typedPlain(tex: string): string {
  const grouped = (t: string): string => (/^[\d.]*(?:√[\d.]+)?$/.test(t) && t !== '' ? t : `(${t})`)
  let text = tex.replace(/\\left|\\right/g, '')
  for (let was = ''; was !== text; ) {
    was = text
    text = text
      .replace(/\\sqrt\{([^{}]*)\}/g, (_m, inside: string) => `√${grouped(inside)}`)
      .replace(/\\d?frac\{([^{}]*)\}\{([^{}]*)\}/g, (m: string, top: string, bottom: string, at: number, all: string) => {
        const flat = `${grouped(top)}/${grouped(bottom)}`
        return /^[√\d(A-Za-z\\]/.test(all.slice(at + m.length)) ? `(${flat})` : flat
      })
  }
  return texToPlain(text).replace(/-/g, '−')
}

/** A part of the line as it was written, and whether it is a sum or a minus that brackets must keep together. */
interface Typed {
  tex: string
  kind: 'sum' | 'negative' | 'other'
}

/**
 * A number as a factor, or as a term after the first: a sum goes in brackets, and so does a minus
 * that does not lead. `typed` is how the line wrote it, which a first step keeps (√3 + 1, not
 * 1 + √3); brackets then follow what was written (4 − 8 is a sum whatever number it comes to), and
 * otherwise follow the number (two parts are a sum).
 */
function operand(s: Surd, leading = false, typed?: Typed): string {
  const bracket = typed
    ? typed.kind === 'sum' || (typed.kind === 'negative' && !leading)
    : partsOf(s).length > 1 || (!leading && (rIsNeg(s.q) || rIsNeg(s.r)))
  const text = typed?.tex ?? realTex(s)
  return bracket ? `\\left(${text}\\right)` : text
}

/** One part of the first number times one part of the second, written before and after √n × √n = n is used. */
function partProduct(x: Part, y: Part): { before: SignedTex; after: SignedTex; squared: bigint | null } {
  const c = rMul(x.c, y.c)
  const neg = rIsNeg(c)
  const mag = rAbs(c)
  const coef = rIsOne(mag) ? '' : rTex(mag)
  if (x.n === null || y.n === null) {
    const body = x.n === null && y.n === null ? rTex(mag) : magTex(mag, (x.n ?? y.n) as bigint)
    return { before: { neg, body }, after: { neg, body }, squared: null }
  }
  if (x.n === y.n) {
    return { before: { neg, body: `${coef}\\left(\\sqrt{${x.n}}\\right)^2` }, after: { neg, body: rTex(rMul(mag, rat(x.n))) }, squared: x.n }
  }
  // Two different roots meet only as √a × √b on their own (timesSurd): they go under one root, and a square comes out.
  const under = x.n * y.n
  const { out, in: rest } = simplifySurd(under)
  const taken = rMul(mag, rat(out))
  return { before: { neg, body: `${coef}\\sqrt{${under}}` }, after: { neg, body: rest === 1n ? rTex(taken) : magTex(taken, rest) }, squared: null }
}

/** (a + b)(a − b), in either order of the two numbers: the part they share, and the part that changes sign. */
function conjugatePair(a: Surd, b: Surd): { first: Part; second: Part } | null {
  if (surdIsRational(a) || surdIsRational(b) || rIsZero(a.q) || rIsZero(b.q) || a.n !== b.n) return null
  if (rEq(a.q, b.q) && rEq(a.r, rNeg(b.r))) return { first: { c: a.q, n: null }, second: { c: a.r, n: a.n } }
  if (rEq(a.q, rNeg(b.q)) && rEq(a.r, b.r)) return { first: { c: a.r, n: a.n }, second: { c: a.q, n: null } }
  return null
}

/** A part squared as the difference of two squares writes it, 2² or (√3)², and what it comes to. */
function partSquared(p: Part): { tex: string; value: string } {
  const mag = rAbs(p.c)
  return p.n === null
    ? { tex: squaredTex(mag), value: rTex(rMul(mag, mag)) }
    : { tex: surdSquaredTex(surd(R0, mag, p.n)), value: rTex(rMul(rMul(mag, mag), rat(p.n))) }
}

const powSurd = (x: Surd, k: number): Surd => Array.from({ length: k }).reduce<Surd>((out) => timesSurd(out, x), ONE)

/** The roots rewritten, each with the square it gave up named: √50 = √(25 × 2) = 5√2. */
function realRootsMove(roots: Seen['roots'], s: Steps): void {
  const all = [...roots]
  s.goal('Simplify the square roots').add(
    all.some(([, r]) => r.fraction) ? 'Write each square root in its simplest form.' : 'Take the largest square number out of each root, so that nothing square is left under it.',
    all.map(([typed, r]) => (r.named ? `${typed} = ${r.named} = ${r.tex}` : `${typed} = ${r.tex}`)).join(',\\quad '),
    all.some(([, r]) => r.fraction) ? '\\sqrt{\\dfrac{a}{b}} = \\dfrac{\\sqrt{ab}}{b}' : '\\sqrt{a^2 b} = a\\sqrt{b}'
  )
}

/**
 * A pencil that works a line out one operation at a time, from the inside out, and writes a step
 * for each one that changes how the line is written: a product of two roots is a step, 3 × √2 is not.
 */
class Pencil {
  readonly s = new Steps()
  /** What the last step ended on, so a working that stops short of its answer can be finished. */
  last = ''

  /** The part of the line that is the whole line, once its brackets are off: a sum that ends there may end with two roots. */
  top?: MathNode

  /** `seen` collects the line's roots as they are met, each with its simplest form, for the step that sets them down. */
  constructor(private readonly seen: Seen) {}

  private write(goal: string | undefined, head: string, tex: string, rule: string | undefined, end: string): void {
    if (goal) this.s.goal(goal)
    this.s.add(head, tex, rule)
    this.last = end
  }

  /**
   * A part of the line worked out, with how it was written if no step was needed to work it out. A
   * first step that multiplies or divides starts from what was typed (√3 + 1), where the number it
   * came to would be written the textbook way round (1 + √3); once a step has changed the part, the
   * number is what the next step starts from.
   */
  private operandOf(node: MathNode): { v: Surd; typed?: Typed } {
    const before = this.s.moves.length
    const v = this.walk(node)
    if (this.s.moves.length !== before) return { v }
    const x = unwrapped(node) as unknown as Loose
    const signed = x.type === 'OperatorNode' && (x.op === '+' || x.op === '-')
    return { v, typed: { tex: typedTex(node, this.seen.roots), kind: signed ? (x.args?.length === 2 ? 'sum' : 'negative') : 'other' } }
  }

  /**
   * The number a part of the line comes to, with a step for each operation that changes how it is
   * written. This is the reader for a line with no i, and it refuses what readFrac above refuses,
   * in the same words: the reader above cannot hold √2 + √3 − √3 or a sum of different roots at
   * all, and this one holds both.
   */
  walk(node: MathNode): Surd {
    const n = node as unknown as Loose
    const args = n.args ?? []
    switch (n.type) {
      case 'ParenthesisNode':
        return this.walk(n.content as MathNode)
      case 'ConstantNode':
        if (typeof n.value !== 'number' || !Number.isFinite(n.value)) throw new CannotHold(SOMETHING_ELSE)
        // As written, like every other Pure Math reader: 0.15 is 3/20.
        return surd(rFromNumber(n.value))
      case 'SymbolNode':
        if (n.name === 'i') throw new ComplexLine()
        // Letters were refused before reading began, so this is π or e.
        throw new CannotHold(neverEnds(String(n.name)))
      case 'FunctionNode': {
        const name = n.fn?.name ?? ''
        if (name === 'mag' || name === 'abs') throw new CannotHold(SIZE_BARS)
        if (name !== 'sqrt' || args.length !== 1) throw new CannotHold(usesSentence(name))
        const root = rootOf(node, args[0], this.seen)
        // The root of a negative number brings its own i: the line is a complex number.
        if (this.seen.i) throw new ComplexLine()
        return root[0]
      }
      case 'OperatorNode': {
        // Only a sign is read through. Any other one-argument operator was too, as if it were not
        // there: 3!√2 was worked as 3√2, "already as simple as it gets", beside a calculator line of
        // 8.49 (P22b round 2). A factorial has no exact surd value here, so the line gets its decimal.
        if (args.length === 1 && (n.op === '-' || n.op === '+')) return n.op === '-' ? surdNeg(this.walk(args[0])) : this.walk(args[0])
        if (args.length !== 2) throw new CannotHold(args.length === 1 ? oneArgument(n.op) : SOMETHING_ELSE)
        if (n.op === '+' || n.op === '-') return this.run(node)
        if (n.op === '*' || n.op === '/') {
          const [a, b] = [this.operandOf(args[0]), this.operandOf(args[1])]
          return n.op === '*'
            ? this.multiply(a.v, b.v, { as: a.typed, bs: b.typed })
            : this.divide(a.v, b.v, a.typed, b.typed, b.typed === undefined ? undefined : this.turned(args[1]))
        }
        if (n.op === '^') {
          const base = this.operandOf(args[0])
          // The power is read on a pencil of its own: what is worked out inside it is not a step of this line.
          const power = new Pencil(this.seen).walk(args[1])
          if (!surdIsRational(power) || power.q.d !== 1n) throw new CannotHold(NOT_WHOLE_POWER)
          if (Math.abs(Number(power.q.n)) > MAX_POWER) throw new CannotHold(TOO_HIGH)
          return this.raise(base.v, Number(power.q.n), base.typed)
        }
        throw new CannotHold(SOMETHING_ELSE)
      }
      default:
        throw new CannotHold(SOMETHING_ELSE)
    }
  }

  /** A run of + and −, gathered once: each term is worked out first, in the order typed. */
  private run(node: MathNode): Surd {
    const terms: { neg: boolean; node: MathNode }[] = []
    const flatten = (m: MathNode, neg: boolean): void => {
      const x = m as unknown as Loose
      if (x.type === 'OperatorNode' && (x.op === '+' || x.op === '-') && x.args?.length === 2) {
        flatten(x.args[0], neg)
        terms.push({ neg: x.op === '-', node: x.args[1] })
      } else terms.push({ neg, node: m })
    }
    flatten(node, false)
    return this.gather(
      terms.map((t) => ({ neg: t.neg, v: this.walk(t.node) })),
      node === this.top
    )
  }

  /**
   * Like surds added: 2√3 + 3√3 = (2 + 3)√3, a step only where something is collected. The parts are
   * added up under the root each belongs to, so √2 + √3 − √3 is √2. Two roots that are left cannot be
   * one number (surdAdd refuses them the same way): at the top of the line they are the answer as
   * they stand, √2 + √3, and anywhere else the line is beyond this working.
   */
  private gather(terms: { neg: boolean; v: Surd }[], top = false): Surd {
    // Every part of every term, with the sign of its term folded in, in groups by the root it belongs to.
    const parts = terms.flatMap(({ neg, v }) => partsOf(v).map((p): Part => ({ c: neg ? rNeg(p.c) : p.c, n: p.n })))
    const groups = new Map<bigint | null, Part[]>()
    for (const p of parts) groups.set(p.n, [...(groups.get(p.n) ?? []), p])
    const sums = [...groups]
      .map(([n, ps]): Part => ({ n, c: ps.reduce((t, p) => rAdd(t, p.c), R0) }))
      .filter((p) => !rIsZero(p.c))
      .sort((x, y) => (x.n === y.n ? 0 : x.n === null ? -1 : y.n === null ? 1 : x.n < y.n ? -1 : 1))
    const roots = sums.filter((p) => p.n !== null)
    const unlike = roots.length > 1
    // Worded as cxpoly words it, so one reason covers a sum that cannot be put together and a product that cannot.
    if (unlike && !top) throw new Error(`√${roots[0].n} and √${roots[1].n} cannot be combined exactly`)
    const total = unlike ? ZERO : surd(sums.find((p) => p.n === null)?.c ?? R0, roots[0]?.c ?? R0, roots[0]?.n ?? 1n)
    const sumTex = unlike ? joinPieces(plusFirst(sums.map(pieceOf))) : realTex(total)
    const alike = [...groups].filter(([n, ps]) => n !== null && ps.length >= 2)
    const wholes = groups.get(null)?.length ?? 0
    if (alike.length || (wholes >= 2 && parts.some((p) => p.n !== null))) {
      const numbers = (ps: Part[]): string => joinPieces(ps.map((p) => ({ neg: rIsNeg(p.c), body: rTex(rAbs(p.c)) })))
      const grouped = [...groups]
        .sort(([x], [y]) => (x === y ? 0 : x === null ? -1 : y === null ? 1 : x < y ? -1 : 1))
        .flatMap(([n, ps]): SignedTex[] => (ps.length < 2 ? ps.map(pieceOf) : [{ neg: false, body: `\\left(${numbers(ps)}\\right)${n === null ? '' : `\\sqrt{${n}}`}` }]))
      const named = alike.length === 1 ? `√${alike[0][0]}` : 'each root'
      this.write(
        alike.length ? 'Collect like surds' : 'Add the whole numbers',
        alike.length && wholes >= 2
          ? `Collect like terms: add the whole numbers, and add the numbers in front of ${named}, since like surds have the same root.`
          : alike.length
            ? `Like surds have the same root, so add the numbers in front of ${named}.`
            : 'Add the whole numbers together.',
        chain([joinPieces(parts.map(pieceOf)), joinPieces(grouped), sumTex]),
        alike.length ? 'a\\sqrt{n} + b\\sqrt{n} = (a+b)\\sqrt{n}' : undefined,
        sumTex
      )
    }
    if (unlike) {
      const names = roots.map((p) => `√${p.n}`)
      const lone = this.s.moves.length === 0
      this.write(
        'Different roots',
        `${names.length === 2 ? `${names[0]} and ${names[1]} are different roots` : 'These roots are all different'}, so they cannot be added into one root: the answer is the sum as it stands.`,
        sumTex,
        undefined,
        sumTex
      )
      throw new UnlikeRoots(sumTex, sums.reduce((t, p) => t + (p.n === null ? rNum(p.c) : surdNumber(surd(R0, p.c, p.n))), 0), lone)
    }
    return total
  }

  /**
   * a × b, term by term: every part of one times every part of the other, then the roots squared away.
   * `head` words the step, `lead` starts its line (a power, (1 + √2)², for the bracket times itself),
   * and `as` and `bs` are how the line wrote the two numbers, when a first step keeps them.
   */
  private multiply(a: Surd, b: Surd, o: { head?: string; lead?: string; as?: Typed; bs?: Typed } = {}): Surd {
    const { head, lead } = o
    const p = timesSurd(a, b)
    const pa = partsOf(a)
    const pb = partsOf(b)
    // Whole numbers times whole numbers is arithmetic, and times 1 changes nothing.
    if (!pa.length || !pb.length || (surdIsRational(a) && surdIsRational(b)) || surdEq(a, ONE) || surdEq(b, ONE)) return p
    const result = realTex(p)
    const prods = pa.flatMap((x) => pb.map((y) => partProduct(x, y)))
    const squared = prods.find((q) => q.squared !== null)?.squared ?? null
    // 3 × √2 is already written 3√2: nothing is worked out.
    if (!lead && prods.length === 1 && squared === null && besides(operand(a, true), operand(b), true) === result) return p
    const [left, right] = [operand(a, true, o.as), operand(b, false, o.bs)]
    // Two brackets side by side are a product; anything else gets its ×, so 2 and 3 never read as 23.
    const operands = lead ?? (left.startsWith('\\left(') && right.startsWith('\\left(') ? `${left}${right}` : `${left} \\times ${right}`)
    const many = pa.length > 1 || pb.length > 1
    const pair = conjugatePair(a, b)
    if (pair) {
      const [one, two] = [partSquared(pair.first), partSquared(pair.second)]
      this.write(
        'Multiply out',
        head ?? 'Multiply the brackets. They differ only in the sign between their terms, so the middle terms cancel: (a + b)(a − b) = a² − b².',
        chain([operands, `${one.tex} - ${two.tex}`, `${one.value} - ${two.value}`, result]),
        '(a+b)(a-b) = a^2 - b^2',
        result
      )
      return p
    }
    const joined = !surdIsRational(a) && !surdIsRational(b) && a.n !== b.n
    this.write(
      'Multiply out',
      head ??
        (joined
          ? 'Multiply the numbers together and put the two roots under one root, then take out any square.'
          : squared !== null
            ? `Multiply ${many ? 'every term of the first by every term of the second' : 'the numbers together and the roots together'}, and use (√${squared})² = ${squared}.`
            : many
              ? 'Multiply every term of the first by every term of the second.'
              : 'Multiply the numbers together, keeping the root.'),
      chain([operands, joinPieces(prods.map((q) => q.before)), joinPieces(prods.map((q) => q.after)), result]),
      squared !== null ? '\\left(\\sqrt{a}\\right)^2 = a' : joined ? '\\sqrt{a} \\times \\sqrt{b} = \\sqrt{ab}' : undefined,
      result
    )
    return p
  }

  /** x to a whole power: a root and a number are raised separately, a bracket is multiplied by itself. */
  private raise(x: Surd, k: number, typed?: Typed): Surd {
    if (k < 0) {
      if (!surdIsRational(x)) {
        const [shown, base] = [typed?.tex ?? realTex(x), `\\left(${typed?.tex ?? realTex(x)}\\right)`]
        this.write(
          'Work out the power',
          'A negative power turns the number upside down: it is one over the same power without the minus.',
          `${base}^{${k}} = \\dfrac{1}{${k === -1 ? shown : `${base}^{${-k}}`}}`,
          'a^{-n} = \\dfrac{1}{a^{n}}',
          this.last
        )
      }
      return this.divide(ONE, this.raise(x, -k))
    }
    if (k === 0) return ONE
    if (k === 1 || surdIsRational(x) || surdIsZero(x)) return powSurd(x, k)
    if (!rIsZero(x.q)) {
      let acc = x
      for (let j = 2; j <= k; j++) {
        acc = this.multiply(acc, x, {
          head: j > 2 ? 'Multiply by the bracket once more.' : k > 2 ? `The bracket is multiplied by itself ${k} times, two at a time. Start with the first two.` : undefined,
          lead: j === 2 && k === 2 ? `\\left(${typed?.tex ?? realTex(x)}\\right)^{2}` : undefined,
          as: j === 2 ? typed : undefined,
          bs: typed
        })
      }
      return acc
    }
    // A number times a root: (c√n)^k = c^k (√n)^k, and (√n)^k is n for every pair of roots, times √n if one is left.
    const p = powSurd(x, k)
    const c = x.r
    const odd = k % 2 === 1
    const rooted = `\\left(\\sqrt{${x.n}}\\right)^{${k}}`
    const number = rIsNeg(c) || c.d !== 1n ? `\\left(${rTex(c)}\\right)^{${k}}` : `${rTex(c)}^{${k}}`
    this.write(
      'Work out the power',
      rIsOne(c) && k === 2 ? `Squaring undoes the square root: (√${x.n})² = ${x.n}.` : `Take the power of the number and of the root separately${k >= 2 ? `, and use (√${x.n})² = ${x.n}` : ''}.`,
      chain([
        `\\left(${typed?.tex ?? realTex(x)}\\right)^{${k}}`,
        rIsOne(c) ? rooted : `${number}${rooted}`,
        `${rIsOne(c) ? '' : `${rTex(rPow(c, k))} \\times `}${x.n ** BigInt(Math.floor(k / 2))}${odd ? `\\sqrt{${x.n}}` : ''}`,
        realTex(p)
      ]),
      '\\left(\\sqrt{a}\\right)^2 = a',
      realTex(p)
    )
    return p
  }

  /**
   * The conjugate of a bottom the line wrote as two terms, found the way a textbook finds it: the
   * sign between them turned round, √3 + 1 → √3 − 1 and 1 − √2 → 1 + √2. Nothing when the bottom is
   * not two plain terms (a sum inside a term would need brackets once its sign is turned).
   */
  private turned(bottom: MathNode): { v: Surd; tex: string; plain: string } | undefined {
    const sum = (m: MathNode): boolean => {
      const x = unwrapped(m) as unknown as Loose
      return x.type === 'OperatorNode' && (x.op === '+' || x.op === '-')
    }
    const two = unwrapped(bottom) as unknown as Loose
    if (!sum(bottom) || two.args?.length !== 2) return undefined
    const [left, right] = two.args
    if (sum(left) || sum(right)) return undefined
    try {
      const [l, r] = [new Pencil(this.seen).walk(left), new Pencil(this.seen).walk(right)]
      const sign = two.op === '+' ? '-' : '+'
      const [lt, rt] = [typedTex(left, this.seen.roots), typedTex(right, this.seen.roots)]
      // The sentence names the conjugate in the same terms, in the same order, as the step's maths.
      return { v: two.op === '+' ? surdSub(l, r) : surdAdd(l, r), tex: `${lt} ${sign} ${rt}`, plain: `${typedPlain(lt)} ${sign === '-' ? '−' : '+'} ${typedPlain(rt)}` }
    } catch {
      return undefined
    }
  }

  /**
   * a ÷ b, and a bottom with a root in it multiplied by √n or by its conjugate until it is a whole
   * number. `ta` and `tb` are how the line wrote the top and the bottom, and `turned` is the bottom's
   * conjugate as the line's own two terms give it, when the first step keeps what was typed.
   */
  private divide(a: Surd, b: Surd, ta?: Typed, tb?: Typed, turned?: { v: Surd; tex: string; plain: string }): Surd {
    if (surdIsZero(b)) throw new ZeroBottom()
    if (surdIsRational(b)) {
      const value = timesSurd(a, surd(rInv(b.q)))
      const written = `\\dfrac{${realTex(a)}}{${realTex(b)}}`
      if (!surdIsRational(a) && !sameLine(written, realTex(value))) {
        this.write(
          'Divide',
          rIsNeg(b.q)
            ? 'A minus sign on the bottom goes in front of the whole fraction.'
            : partsOf(a).length > 1
              ? 'Divide each term on the top by the bottom.'
              : 'Divide the top and the bottom by their common factor.',
          `${written} = ${realTex(value)}`,
          undefined,
          realTex(value)
        )
      }
      return value
    }
    const alone = rIsZero(b.q)
    // A root on its own is cleared by itself. Two terms are cleared by the conjugate, with the sign
    // between them turned round as they were written (1 + √3 by 1 − √3, a bottom that comes to −2:
    // the minus is carried to the top at the end, as a textbook does); a bottom worked out on the
    // way has no typed order, so its root's sign is turned.
    const typed = alone ? undefined : turned && surdIsRational(timesSurd(b, turned.v)) ? turned : undefined
    const by = alone ? surd(R0, R1, b.n) : typed ? typed.v : surd(b.q, rNeg(b.r), b.n)
    const [byTex, byPlain] = typed ? [typed.tex, typed.plain] : [realTex(by), realPlain(by)]
    this.write(
      'Clear the root from the bottom',
      alone
        ? `The bottom has a root in it, so multiply top and bottom by ${byPlain} to clear it.`
        : `The bottom has a root in it, so multiply top and bottom by its conjugate, ${byPlain}, to clear it.`,
      `\\dfrac{${ta?.tex ?? realTex(a)}}{${tb?.tex ?? realTex(b)}} \\times \\dfrac{${byTex}}{${byTex}}`,
      alone ? '\\sqrt{n} \\times \\sqrt{n} = n' : '(a + b\\sqrt{n})(a - b\\sqrt{n}) = a^2 - b^2 n',
      ''
    )
    const written: Typed | undefined = typed && { tex: typed.tex, kind: 'sum' }
    const bottom = this.multiply(b, by, {
      head: `The bottom becomes a whole number${alone ? `, since √${b.n} × √${b.n} = ${b.n}` : ', because the middle terms cancel'}.`,
      as: tb,
      bs: written
    })
    if (!surdIsRational(bottom) || surdIsZero(bottom)) throw new Error('the bottom did not come out as a whole number')
    const top = this.multiply(a, by, { head: 'Multiply out the top the same way.', as: ta, bs: written })
    const value = timesSurd(top, surd(rInv(bottom.q)))
    const over = rIsOne(bottom.q) ? realTex(top) : `\\dfrac{${realTex(top)}}{${realTex(bottom)}}`
    if (over !== this.last) {
      this.write(
        undefined,
        rIsNeg(bottom.q) ? 'Put the new top over the new bottom. A minus on the bottom turns every sign on the top round.' : 'Put the new top over the new bottom.',
        sameLine(over, realTex(value)) ? over : `${over} = ${realTex(value)}`,
        undefined,
        realTex(value)
      )
    }
    return value
  }
}

/** floor(√v) for a big whole number, by Newton's method. */
function isqrt(v: bigint): bigint {
  if (v < 2n) return v
  let x = v
  let y = (x + 1n) / 2n
  while (y < x) {
    x = y
    y = (x + v / x) / 2n
  }
  return x
}

/**
 * q + r√n as a double, with the root taken to 60 digits first. A high power of 4 − 2√3 is the
 * difference of two numbers near 10²³, and surdValue's doubles lose all of it: the decimal row read
 * 0 and the check called a right answer suspicious.
 */
function surdNumber(s: Surd): number {
  if (surdIsRational(s)) return rNum(s.q)
  const scale = 10n ** 60n
  const root = isqrt(s.n * scale * scale)
  return rNum(rat(s.q.n * s.r.d * scale + s.r.n * s.q.d * root, s.q.d * s.r.d * scale))
}

/** The steps for a line with no i, and the exact answer they come to. */
function realSteps(title: string, input: string, node: MathNode, src: string, digits: DigitSettings): Working {
  const seen: Seen = { roots: new Map(), i: false }
  const w = new Pencil(seen)
  w.top = unwrapped(node)
  let answer: string
  let value: number
  let whole = false
  let unlike: UnlikeRoots | undefined
  try {
    const z = w.walk(node)
    answer = realTex(z)
    value = surdNumber(z)
    whole = isWhole(z)
  } catch (err) {
    // A sum that ends with two different roots is its own answer, and its last step is already written.
    if (!(err instanceof UnlikeRoots)) throw err
    unlike = err
    answer = err.tex
    value = err.value
  }
  const start = typedTex(node, seen.roots)
  // √2 + 1 and 1 + √2 are the same terms: a line whose answer only turns it round has nothing in it to simplify.
  const asTyped = termsOf(start).join('|') === termsOf(answer).join('|')
  const untouched = asTyped && seen.roots.size === 0 && (unlike ? unlike.lone : w.s.moves.length === 0)
  if (untouched && !unlike) {
    w.s.add('This is already as simple as it gets: no root has a square factor to take out, and no two parts can be put together.', answer)
  } else if (!unlike && w.last !== answer && !asTyped) {
    // The last operation was whole-number arithmetic (2 + 3, 0 × √2), which is not a step of its own: the line ends on the answer.
    w.s.goal('Put it together').add('Work out what is left.', `${start} = ${answer}`)
  }
  // The roots are simplified first on the page, but are met in the order the line is worked: the step is written once all are known.
  if (seen.roots.size) {
    const first = new Steps()
    realRootsMove(seen.roots, first)
    w.s.moves.unshift(...first.moves)
  }
  const answers: Answer[] = [{ label: 'Answer', tex: answer }]
  if (!whole) answers.push(decimalRow(value, 0, digits))
  const agrees = agreesWith(src, value, 0)
  return {
    title,
    input,
    moves: w.s.moves,
    answers,
    // An answer that is the line itself has nothing to put back together, so no tick is given for it.
    // A numeric route that disagrees is said all the same: "nothing to check" once hid 3!√2's 8.49
    // behind an exact 3√2 (P22b round 2), and it is the one sign that an exact answer is wrong.
    check:
      agrees === false
        ? 'Careful: working it out numerically gives a different number. Treat this answer with suspicion.'
        : untouched
          ? 'The line was already in its simplest form, so there is nothing to check.'
          : agrees
            ? 'Working the line out numerically gives the same number as this exact answer.'
            : undefined,
    checked: agrees === false ? 'failed' : untouched || agrees === null ? undefined : 'ok'
  }
}

/** The part of the line a typed part comes to once its brackets are off. */
function unwrapped(m: MathNode): MathNode {
  let x = m
  while ((x as unknown as Loose).type === 'ParenthesisNode' && (x as unknown as Loose).content) x = (x as unknown as Loose).content as MathNode
  return x
}

/** The terms of a line with their signs, in no order: √2 + 1 and 1 + √2 hold the same terms. */
function termsOf(tex: string): string[] {
  const text = tex.replace(/\\dfrac/g, '\\frac').replace(/\\left|\\right|\s+/g, '')
  const terms: string[] = []
  let depth = 0
  let from = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '{' || c === '(') depth++
    else if (c === '}' || c === ')') depth--
    else if ((c === '+' || c === '-') && depth === 0 && i > from) {
      terms.push(text.slice(from, i))
      from = i
    }
  }
  terms.push(text.slice(from))
  return terms.map((t) => (t.startsWith('-') || t.startsWith('+') ? t : `+${t}`)).sort()
}

// ---------------------------------------------------------------- quadratics

/** A root written exactly: re ± coef·√rad, real or imaginary. */
interface Root {
  re: Rat
  coef: Rat
  rad: bigint
  imaginary: boolean
}

function rootText(r: Root, sign: 1 | -1): string {
  if (r.rad === 0n || rIsZero(r.coef)) return rTex(r.re)
  const { out, in: inner } = simplifySurd(r.rad)
  const mult = rMul(r.coef, rat(out))
  // A real root with nothing left under the root sign is an ordinary fraction: add it up rather
  // than leaving the student to read "5/2 + 1/2" and finish the sum themselves.
  if (inner === 1n && !r.imaginary) return rTex(sign === 1 ? rAdd(r.re, mult) : rSub(r.re, mult))
  const surd = inner === 1n ? '' : `\\sqrt{${inner}}`
  const unit = r.imaginary ? 'i' : ''
  const magnitude = rIsOne(rAbs(mult)) && (surd || unit) ? '' : rTex(rAbs(mult))
  const body = `${magnitude}${surd}${unit}` || '1'
  const s = sign === 1 ? (rIsNeg(mult) ? '-' : '+') : rIsNeg(mult) ? '+' : '-'
  if (rIsZero(r.re)) return s === '-' ? `-${body}` : body
  return `${rTex(r.re)} ${s} ${body}`
}

const HAS_I = 'This has i in it. Solve works on an equation in one ordinary letter; for sums with i, use Complex.'

/**
 * The unknown written as the answer labels write it (calc/labels.ts). The expression parser spells θ
 * out as "theta", and Solve put that word into its sentences ("Line the equation up as atheta² +
 * btheta + c = 0") and drew it in its maths as the italic letters t, h, e, t, a (H12): θ in words,
 * \theta in maths. Any other name is written as it comes, as before. The labels themselves keep the
 * engine's spelling ("theta_1 ="), which is what the command bar reads.
 */
const unknownTex = (name: string): string => labelTex(name) ?? name
const unknownWords = (name: string): string => labelText(name)

/**
 * A linear equation, solved the way it is solved on the board: collect, move across, divide.
 *
 * Solve used to refuse anything that was not a quadratic, which meant the simplest equations a
 * student meets were the ones the panel could not do.
 */
const TWO_EQUALS = 'An equation has one equals sign, and I found more than one.'

export function solveLinearWorking(src: string): Working {
  const title = 'Solve'
  const sides = src.split('=')
  // "2x = 6 = 3" used to be solved as 2x = 6, with the rest silently dropped.
  if (sides.length > 2) return failed(title, src, TWO_EQUALS)
  const [lhsSrc, rhsSrc = '0'] = sides
  let lhs: Expr
  let rhs: Expr
  try {
    lhs = parseExpr(lhsSrc)
    rhs = parseExpr(rhsSrc)
  } catch (err) {
    return failed(title, src, err instanceof NotPolynomial ? err.message : 'I could not read that.')
  }
  const vars = [...new Set([...varsOf(lhs), ...varsOf(rhs)])]
  if (vars.includes('i')) return failed(title, src, HAS_I)
  if (vars.length !== 1) return failed(title, src, `I need exactly one letter to solve for, and I found ${vars.length || 'none'}.`)
  const name = vars[0]
  // θ in the sentences and \theta in the maths (H12); `name` stays the engine's spelling, for the label.
  const [nameTex, nameWords] = [unknownTex(name), unknownWords(name)]
  const { poly: L } = polyFromExpr(lhs, name)
  const { poly: R } = polyFromExpr(rhs, name)
  // The difference is what matters: x² = x² + 1 has a square on each side and is still the
  // linear (and impossible) equation 0 = 1 once they are subtracted.
  if (pDeg(pSub(L, R)) > 1) return failed(title, src, 'That is not a linear equation.')

  const input = `${exprTex(lhs)} = ${exprTex(rhs)}`
  const s = new Steps()
  // a·x = c once every letter is on the left and every number on the right.
  const a = rSub(L[1] ?? R0, R[1] ?? R0)
  const c = rSub(R[0] ?? R0, L[0] ?? R0)
  const moved = !rIsZero(R[1] ?? R0) || !rIsZero(L[0] ?? R0)
  if (moved) {
    s.goal('Collect like terms').add(
      `Take every ${nameWords} term to the left and every number to the right. Anything that crosses the equals sign changes sign.`,
      `${pTex([R0, a], name)} = ${rTex(c)}`,
      '\\text{same thing done to both sides}'
    )
  }
  if (rIsZero(a)) {
    return failed(
      title,
      input,
      rIsZero(c) ? `Both sides are the same, so every value of ${nameWords} works.` : `The ${nameWords} terms cancel and ${rTex(L[0] ?? R0)} = ${rTex(R[0] ?? R0)} is false, so no value of ${nameWords} works.`
    )
  }
  const x = rDiv(c, a)
  if (rIsOne(a)) {
    s.goal('Isolate the letter').add(`So ${nameWords} is on its own.`, `${nameTex} = ${rTex(x)}`)
  } else if (a.d !== 1n) {
    // x/2 = 3 is taught as "multiply both sides by 2", never as "divide by a half".
    const d = rat(a.d)
    const an = rat(a.n)
    const cd = rMul(c, d)
    s.goal('Isolate the letter').add(
      `Multiply both sides by ${rTex(d)} to clear the fraction in front of ${nameWords}.`,
      `${pTex([R0, an], name)} = ${rTex(cd)}`,
      '\\text{same thing done to both sides}'
    )
    if (rIsOne(an)) s.add(`So ${nameWords} is on its own.`, `${nameTex} = ${rTex(x)}`)
    else s.add(`Divide both sides by ${rTex(an)}, the number in front of ${nameWords}.`, `${nameTex} = \\dfrac{${rTex(cd)}}{${rTex(an)}} = ${rTex(x)}`, `a${nameTex} = c \\;\\Rightarrow\\; ${nameTex} = c/a`)
  } else {
    s.goal('Isolate the letter').add(
      `Divide both sides by ${rTex(a)}, the number in front of ${nameWords}.`,
      `${nameTex} = \\dfrac{${rTex(c)}}{${rTex(a)}} = ${rTex(x)}`,
      `a${nameTex} = c \\;\\Rightarrow\\; ${nameTex} = c/a`
    )
  }
  const lv = evalAt(lhs, { [name]: x })
  const rv = evalAt(rhs, { [name]: x })
  const ok = rEq(lv, rv)
  // The value is shown going in, side by side (Fix 4): "3x + 4 = 10, 10 = 10" gave a result
  // without its working and then a line that changed nothing.
  const side = (e: Expr, v: Rat): string => (varsOf(e).length ? `${pTexAt(polyFromExpr(e, name).poly, name, x)} = ${rTex(v)}` : rTex(v))
  s.goal('Check the answer').add(
    `Put ${nameWords} = ${texToPlain(rTex(x))} into each side of the original equation: both sides must come to the same number.`,
    `\\text{LHS} = ${side(lhs, lv)},\\quad \\text{RHS} = ${side(rhs, rv)}`
  )
  return {
    title,
    input,
    method: 'Linear equation',
    moves: s.moves,
    answers: [{ label: `${name} =`, tex: rTex(x) }],
    check: ok ? `With ${nameWords} = ${rTex(x)} both sides come to ${rTex(lv)}.` : 'Careful: the two sides do not agree. Treat this answer with suspicion.',
    checked: ok ? 'ok' : 'failed'
  }
}

export function solveQuadraticWorking(src: string): Working {
  const title = 'Solve'
  if (src.split('=').length > 2) return failed(title, src, TWO_EQUALS)
  let left: Expr
  try {
    // "x^2 + 4 = 0" and "x^2 + 4" both mean the same thing here.
    const [lhs, rhs] = src.split('=')
    left = rhs === undefined ? parseExpr(lhs) : parseExpr(`(${lhs}) - (${rhs})`)
  } catch (err) {
    return failed(title, src, err instanceof NotPolynomial ? err.message : 'I could not read that.')
  }
  // Refused with a sentence: with i counted as a letter, polyFromExpr below would throw instead.
  if (varsOf(left).includes('i')) return failed(title, src, HAS_I)
  const vars = varsOf(left)
  // "x + 1 = x + 2" has no letter left once the sides are subtracted; the linear solver reads
  // the two sides separately and can say why there is no answer.
  if (vars.length === 0 && src.includes('=')) return solveLinearWorking(src)
  if (vars.length !== 1) return failed(title, src, `I need exactly one letter to solve for, and I found ${vars.length || 'none'}.`)
  const name = vars[0]
  const { poly } = polyFromExpr(left, name)
  if (pDeg(poly) <= 1) return solveLinearWorking(src)
  if (pDeg(poly) !== 2) return failed(title, src, `This is a power-${pDeg(poly)} equation. The step-by-step solver here does linear equations and quadratics.`)

  const [c, b, a] = [poly[0] ?? R0, poly[1] ?? R0, poly[2]]
  const input = `${pTex(poly, name)} = 0`
  const s = new Steps()
  // θ in the sentences and \theta in the maths (H12); `name` stays the engine's spelling, for the labels.
  const [nameTex, nameWords] = [unknownTex(name), unknownWords(name)]

  s.goal('Read off a, b, c').add(
    `Line the equation up as a${nameWords}² + b${nameWords} + c = 0 and read off the three numbers.`,
    `a = ${rTex(a)},\\quad b = ${rTex(b)},\\quad c = ${rTex(c)}`,
    `a${nameTex}^2 + b${nameTex} + c = 0`
  )
  const disc = rSub(rMul(b, b), rMul(rat(4n), rMul(a, c)))
  s.goal('Work out the discriminant').add(
    'Square b and take away 4ac — the sign of this number decides what kind of roots come out.',
    `\\Delta = b^2 - 4ac = \\left(${rTex(b)}\\right)^2 - 4\\left(${rTex(a)}\\right)\\left(${rTex(c)}\\right) = ${rTex(disc)}`,
    '\\Delta = b^2 - 4ac'
  )

  const sign = rCmp(disc, R0)
  const exact = rSqrt(rAbs(disc))
  if (sign > 0) {
    s.goal('See what kind of root').add(
      exact
        ? 'The discriminant is positive and a perfect square, so there are two different rational roots.'
        : 'The discriminant is positive but not a perfect square, so the two roots are real and involve a surd.',
      '\\Delta > 0 \\Rightarrow \\text{two different real roots}'
    )
  } else if (sign === 0) {
    s.goal('See what kind of root').add('The discriminant is zero, so both roots are the same.', '\\Delta = 0 \\Rightarrow \\text{one repeated root}')
  } else {
    s.goal('See what kind of root').add(
      'The discriminant is negative. A negative number has no real square root, so the roots are complex.',
      '\\Delta < 0 \\Rightarrow \\text{two complex roots}'
    )
    s.add(
      'Write the square root of the negative number with i, since i² = −1.',
      `\\sqrt{${rTex(disc)}} = \\sqrt{${rTex(rAbs(disc))} \\times (-1)} = ${surdOf(rAbs(disc))}\\,i`,
      'i = \\sqrt{-1} \\;\\Rightarrow\\; \\sqrt{-k} = i\\sqrt{k}'
    )
  }

  // −b is left out when b is 0: (± √20)/2, not (0 ± √20)/2.
  const minusB = rIsZero(b) ? '' : `${rTex(rNeg(b))} `
  s.goal('Use the quadratic formula').add(
    'Put everything into the quadratic formula.',
    // The root is worked out inside the formula before the two answers are read off (Fix 4):
    // (−4 ± √−36)/2 went straight to −2 ± 3i without the (−4 ± 6i)/2 between them.
    [
      `${nameTex} = \\dfrac{-b \\pm \\sqrt{\\Delta}}{2a}`,
      `\\dfrac{${minusB}\\pm \\sqrt{${rTex(disc)}}}{${rTex(rMul(rat(2n), a))}}`,
      sign !== 0 && disc.d === 1n && (sign < 0 || exact || surdOf(disc) !== `\\sqrt{${rTex(disc)}}`)
        ? `\\dfrac{${minusB}\\pm ${surdOf(rAbs(disc))}${sign < 0 ? '\\,i' : ''}}{${rTex(rMul(rat(2n), a))}}`
        : ''
    ]
      .filter(Boolean)
      .join(' = '),
    `${nameTex} = \\dfrac{-b \\pm \\sqrt{b^2-4ac}}{2a}`
  )

  const denom = rMul(rat(2n), a)
  const re = rDiv(rNeg(b), denom)
  let root: Root
  if (exact) {
    root = { re, coef: rDiv(exact, denom), rad: 1n, imaginary: sign < 0 }
  } else {
    // √(p/q) = √(pq)/q keeps everything under one whole-number root.
    const absD = rAbs(disc)
    const radicand = absD.n * absD.d
    root = { re, coef: rDiv(rat(1n, absD.d), denom), rad: radicand, imaginary: sign < 0 }
  }

  const r1 = rootText(root, 1)
  const r2 = rootText(root, -1)
  s.goal('Read off the roots').add(
    sign === 0 ? 'Both signs give the same value.' : 'Take the plus and the minus in turn.',
    sign === 0 ? `${nameTex} = ${rTex(re)}` : `${nameTex} = ${r1} \\quad\\text{or}\\quad ${nameTex} = ${r2}`
  )

  const answers =
    sign === 0
      ? [{ label: `${name} =`, tex: rTex(re) }]
      : [
          { label: `${name}_1 =`, tex: r1 },
          { label: `${name}_2 =`, tex: r2 }
        ]

  // Vieta's relations are the cheapest possible check and are on the syllabus anyway.
  const sum = rDiv(rNeg(b), a)
  const product = rDiv(c, a)
  s.goal('Check against the coefficients').add(
    'Add the roots and multiply them: the sum must be −b/a and the product c/a.',
    `${nameTex}_1 + ${nameTex}_2 = ${rTex(sum)} = -\\dfrac{b}{a},\\qquad ${nameTex}_1 ${nameTex}_2 = ${rTex(product)} = \\dfrac{c}{a}`,
    '\\text{sum} = -b/a,\\quad \\text{product} = c/a'
  )

  // The real check: each root, substituted exactly, has to make the polynomial zero.
  const ok = [rootValue(root, 1), rootValue(root, -1)].every((z) => isRootOf(poly, z))

  return {
    title,
    input,
    method: 'Quadratic formula',
    moves: s.moves,
    answers,
    check: !ok
      ? 'Careful: putting the roots back in does not give zero. Treat this answer with suspicion.'
      : sign < 0
        ? 'The two roots are conjugates — that always happens when the coefficients are real — and each one makes the equation zero exactly.'
        : `Sum of roots ${rTex(sum)}, product ${rTex(product)} — both match the coefficients.`,
    checked: ok ? 'ok' : 'failed'
  }
}

/** The exact value of a root written as re ± coef·√rad, as a complex surd. */
function rootValue(r: Root, sign: 1 | -1): CxS {
  const part: Surd = surd(R0, sign === 1 ? r.coef : rNeg(r.coef), r.rad)
  const re = surd(r.re)
  return r.imaginary ? { re, im: part } : { re: surd(rAdd(re.q, part.q), part.r, part.n), im: surd(R0) }
}

/** p(z) = 0, evaluated exactly (Horner's rule over complex surds). */
function isRootOf(p: Poly, z: CxS): boolean {
  try {
    let acc: CxS = cxsOfRat(R0)
    for (let i = p.length - 1; i >= 0; i--) acc = cxsAdd(cxsMul(acc, z), cxsOfRat(p[i]))
    return cxsIsReal(acc) && surdIsRational(acc.re) && rIsZero(acc.re.q)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------- factorising over ℂ

/** Everything gathered while the factors are being split, so the answer and the check agree. */
interface CxCollect {
  /** The number at the front: leading coefficients and any bare −1, multiplied together. */
  lead: Rat
  /** Brackets to print, in order, without the lead. */
  brackets: string[]
  /** The same factors as polynomials, in an order the check can multiply exactly. */
  factors: SPoly[]
  /** Set once any root that is not rational has been used: the answer is new. */
  anyNew: boolean
}

const leadTex = (lead: Rat): string => (rIsOne(lead) ? '' : rIsOne(rAbs(lead)) && rIsNeg(lead) ? '-' : rTex(lead))

/** "−b " at the top of the quadratic formula, or nothing when b is 0: (± √−16)/2, not (0 ± √−16)/2. */
function formulaTop(b: Surd): string {
  const t = surdTex(surdMul(surd(rat(-1n)), b))
  return t === '0' ? '' : `${t} `
}

/**
 * Split a quadratic with surd coefficients into its two linear factors, pushing the working.
 * Returns false when the roots would need a nested root, which no student is expected to write.
 */
function splitQuadratic(coeffs: Surd[], name: string, s: Steps, out: CxCollect): boolean {
  const [c, b, a] = coeffs
  const roots = quadraticRoots(a, b, c)
  if (!roots) return false
  const [p, q] = roots
  const shown = surdPolyTex(coeffs, name)
  const bracketed = `\\left(${shown}\\right)`
  const complex = !cxsIsReal(p)
  const disc = surdSub(surdMul(b, b), surdMul(surd(rat(4n)), surdMul(a, c)))
  // quadraticRoots only answers when the discriminant is rational, so its q part is the whole of
  // it. A perfect square there does not make the roots rational when a coefficient is a surd
  // (x² − 2√2x + 1 has Δ = 4 and roots √2 ± 1), and the sentence used to say it was not square.
  const square = surdIsRational(disc) && rSqrt(disc.q) !== null
  const bracketedPlain = texToPlain(bracketed)
  const discPlain = texToPlain(surdTex(disc))
  s.goal('Split each quadratic factor').add(
    complex
      ? `${bracketedPlain} has a negative discriminant (${discPlain}), so solve it with the quadratic formula and use its two roots.`
      : square
        ? `${bracketedPlain} has a surd in it, so its roots are surds even though the discriminant (${discPlain}) is a perfect square.`
        : `${bracketedPlain} has a positive discriminant (${discPlain}) that is not a perfect square, so its roots are surds.`,
    // The sentence says "solve it with the quadratic formula", so the formula is shown with its
    // numbers in before the roots (Fix 4: each sentence matches its maths).
    `${name} = \\dfrac{${formulaTop(b)}\\pm \\sqrt{${surdTex(disc)}}}{${surdTex(surdMul(surd(rat(2n)), a))}} \\;\\Rightarrow\\; ${name} = ${cxsTex(p)} \\quad\\text{or}\\quad ${name} = ${cxsTex(q)}`,
    complex ? '\\sqrt{-k} = i\\sqrt{k}' : `${name} = \\dfrac{-b \\pm \\sqrt{b^2-4ac}}{2a}`
  )
  // The leading coefficient of a quadratic is not rational when it came from a surd split; the
  // only such splits produced here are monic, so anything else is refused rather than mis-printed.
  if (!surdIsRational(a)) return false
  const lead = a.q
  const pair = `${linearFactorTex(name, p)}${linearFactorTex(name, q)}`
  s.add(
    `A quadratic with roots p and q is a(${name} − p)(${name} − q), so subtract each root from ${name}.`,
    `${bracketed} = ${leadTex(lead)}${pair}`,
    `a(${name}-p)(${name}-q)`
  )
  out.lead = rMul(out.lead, lead)
  out.brackets.push(pair)
  out.factors.push(spLinear(p), spLinear(q))
  out.anyNew = true
  return true
}

const NOT_EXACT = 'would need a root inside a root, or two different roots in one number, which I cannot write exactly.'

/**
 * A Greek unknown as the student wrote it: the parser spells θ out as "theta", and this job built its sentences and
 * its maths from that word ("subtract each root from theta", \left(theta^2 + 4\right) in italic letters). Every
 * sentence gets θ and every piece of maths \theta; the answer labels keep the engine's spelling, as the Solve job's do.
 */
function spellUnknown(w: Working, name: string): Working {
  const tex = unknownTex(name)
  if (tex === name) return w
  const words = unknownWords(name)
  const word = new RegExp(`(?<![A-Za-z\\\\])${name}(?![A-Za-z])`, 'g')
  const said = (t: string | undefined): string | undefined => t?.replace(word, words)
  const maths = (t: string | undefined): string | undefined => t?.replace(word, tex)
  return {
    ...w,
    title: said(w.title) ?? w.title,
    input: maths(w.input) ?? w.input,
    check: said(w.check),
    error: said(w.error),
    reason: said(w.reason),
    moves: w.moves.map((m) => ({ ...m, head: said(m.head) ?? m.head, subgoal: said(m.subgoal), note: said(m.note), tex: maths(m.tex), rule: maths(m.rule) })),
    answers: w.answers.map((a) => ({ ...a, tex: maths(a.tex) ?? a.tex }))
  }
}

export function factoriseComplexWorking(src: string): Working {
  const w = factoriseComplexSteps(src)
  try {
    const vars = varsOf(parseExpr(src))
    return vars.length === 1 ? spellUnknown(w, vars[0]) : w
  } catch {
    return w
  }
}

function factoriseComplexSteps(src: string): Working {
  const title = 'Factorise over complex numbers'
  let e: Expr
  try {
    e = parseExpr(src)
  } catch (err) {
    return failed(title, src, err instanceof NotPolynomial ? err.message : 'I could not read that.')
  }
  if (varsOf(e).includes('i')) {
    return failed(title, src, 'This already has i in it. Factorising with i starts from an ordinary expression, like x² + 4; the i appears in the answer, not the question.')
  }
  const vars = varsOf(e)
  if (vars.length !== 1) return failed(title, src, 'I need exactly one letter for this.')
  const name = vars[0]
  if (e.length === 0) return failed(title, src, 'That comes to zero, so there is nothing to factorise.')

  const s = new Steps()
  s.goal('Allow i into the answer').add(
    'Over the real numbers some quadratics will not factorise. Allowing i means every one of them will.',
    'i = \\sqrt{-1}',
    '\\text{every polynomial factorises over } \\mathbb{C}'
  )

  const { poly: whole } = polyFromExpr(e, name)
  const realParts = factorsOf(e)
  const realTex = realParts
    .map((p) => {
      const { poly } = polyFromExpr(p, name)
      return pDeg(poly) === 0 ? pTex(poly, name) : pTexBracketed(poly, name)
    })
    .join('')
  if (realParts.length > 1) s.goal('Factorise with real numbers first').add('Split off every factor that real numbers allow; i is only needed for what is left.', `${exprTex(e)} = ${realTex}`)

  const out: CxCollect = { lead: R1, brackets: [], factors: [], anyNew: false }
  for (const part of realParts) {
    const { poly } = polyFromExpr(part, name)
    const deg = pDeg(poly)
    if (deg === 0) {
      out.lead = rMul(out.lead, poly[0])
      continue
    }
    if (deg === 1) {
      out.brackets.push(pTexBracketed(poly, name))
      out.factors.push(spFromPoly(poly))
      continue
    }
    if (deg === 2) {
      if (!splitQuadratic(poly.map((c) => surd(c)), name, s, out)) {
        return failed(title, exprTex(e), `The roots of ${pTex(poly, name)} ${NOT_EXACT}`)
      }
      continue
    }
    // x⁴ + 1 = (x² + 1)² − (√2·x)²: the same completing-the-square move as over the reals, but
    // the middle term is a surd, so the two quadratics only exist once surds are allowed.
    const split = deg === 4 ? splitBiquadratic(poly) : null
    if (split) {
      const inner = [surd(split.s), surd(R0), surd(split.alpha)]
      // splitBiquadratic already hands back a tidy surd; a rational k (x⁴ + 4 has k = 2) lives
      // in its q part, so copying only the root part would drop it and print the inner square twice.
      const kx = split.k
      const minus = [inner[0], surdNeg(kx), inner[2]]
      const plus = [inner[0], kx, inner[2]]
      s.goal('Complete the square').add(
        `Write it as ${texToPlain(surdPolyTex(inner, name))} squared, which is this expression plus ${texToPlain(surdTex(surdMul(kx, kx)))}${name}², and take that away again as a square.`,
        `${pTex(poly, name)} = \\left(${surdPolyTex(inner, name)}\\right)^2 - \\left(${surdTex(kx)}${name}\\right)^2 = \\left(${surdPolyTex(minus, name)}\\right)\\left(${surdPolyTex(plus, name)}\\right)`,
        'a^2 - b^2 = (a-b)(a+b)'
      )
      if (!splitQuadratic(minus, name, s, out) || !splitQuadratic(plus, name, s, out)) {
        return failed(title, exprTex(e), `The roots of ${pTex(poly, name)} ${NOT_EXACT}`)
      }
      continue
    }
    return failed(title, exprTex(e), `There is a factor of power ${deg} left that I cannot split any further.`)
  }

  const ok = checkProduct([[cxsOfRat(out.lead)], ...out.factors], whole)
  const checked = ok ? 'ok' : 'failed'

  if (!out.anyNew) {
    return {
      title,
      input: exprTex(e),
      moves: s.moves,
      answers: [{ label: 'Answer', tex: realTex }],
      check: ok ? 'Every factor was already real, so nothing new appears by allowing i.' : 'Careful: multiplying back out did not match. Treat this answer with suspicion.',
      checked
    }
  }

  const answer = `${leadTex(out.lead)}${out.brackets.join('')}`
  // A single quadratic is already written in full by the move that split it: x² + 2x + 5 showed
  // "(x² + 2x + 5) = (x + 1 − 2i)(x + 1 + 2i)" and then the same equation again, under a sentence
  // promising a number at the front that was not there.
  if (!(realParts.length === 1 && pDeg(whole) === 2)) {
    const lead = leadTex(out.lead)
    const head = lead === '' ? 'Put the factors together.' : lead === '-' ? 'Put the factors together, with the minus sign at the front.' : 'Put the factors together, with the number at the front.'
    s.goal('Write the finished factors').add(head, `${exprTex(e)} = ${answer}`)
  }
  if (ok) {
    s.goal('Check by multiplying back').add(
      'Multiply back to check. Each pair of conjugate roots multiplies to a real quadratic, and the whole product comes back to the original.',
      `${answer} = ${exprTex(e)}`,
      '(x-p)(x-\\bar{p}) = x^2 - 2\\,\\mathrm{Re}(p)\\,x + |p|^2'
    )
  }
  return {
    title,
    input: exprTex(e),
    method: 'Roots over ℂ',
    moves: s.moves,
    answers: [{ label: 'Answer', tex: answer }],
    check: ok ? `Multiplying the factors back out gives ${exprTex(e)} — the original.` : 'Careful: multiplying back out did not match. Treat this answer with suspicion.',
    checked
  }
}

export { exprFromPoly, type Poly }

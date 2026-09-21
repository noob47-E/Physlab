// Complex numbers, worked out the way they are taught.
//
// The trick that makes the working readable: `i` is parsed as an ordinary letter, so a product
// expands to 8 + 2i − 15i² first, and replacing i² with −1 is its own visible step. That is the
// step students actually have to learn, and hiding it inside the arithmetic teaches nothing.

import {
  R0,
  R1,
  rAbs,
  rAdd,
  rCmp,
  rDiv,
  rEq,
  rIsNeg,
  rIsOne,
  rIsZero,
  rMul,
  rNeg,
  rNum,
  rSqrt,
  rSub,
  rTex,
  rat,
  type Rat
} from './rat'
import { NotPolynomial, evalAt, exprTex, parseExpr, parseFraction, varsOf, writeTimes, type Expr } from './mono'
import { math, preprocess } from '../expr'
import { pDeg, pSub, pTex, pTexBracketed, polyFromExpr, exprFromPoly, type Poly } from './poly'
import { factorsOf } from './factor'
import { texAngle } from '../format'
import {
  checkProduct,
  cxsAdd,
  cxsIsReal,
  cxsMul,
  cxsOfRat,
  cxsTex,
  linearFactorTex,
  quadraticRoots,
  simplifySurd,
  spFromPoly,
  spLinear,
  splitBiquadratic,
  surd,
  surdIsRational,
  surdMul,
  surdNeg,
  surdPolyTex,
  surdSub,
  surdTex,
  type CxS,
  type SPoly,
  type Surd
} from './cxpoly'
import { Steps, failed, texToPlain, type Working } from './work'

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
  const top = Math.max(...e.map((t) => t.v.i ?? 0))
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

export function complexWorking(src: string): Working {
  const title = 'Complex number'
  let num: Expr
  let den: Expr
  try {
    const f = parseFraction(src)
    num = f.num
    den = f.den
  } catch (err) {
    return failed(title, src, err instanceof NotPolynomial ? err.message : 'I could not read that.')
  }

  const vars = [...new Set([...varsOf(num), ...varsOf(den)])]
  const strays = vars.filter((v) => v !== 'i')
  if (strays.length) return failed(title, src, `This has ${strays.join(', ')} in it. The complex tools work on numbers, not letters.`)
  if (vars.length === 0) return failed(title, src, 'There is no i here, so this is an ordinary sum — the calculator will do it.')

  const isFraction = !(den.length === 1 && rIsOne(den[0].c) && Object.keys(den[0].v).length === 0)
  const input = isFraction ? `\\dfrac{${iTex(num)}}{${iTex(den)}}` : iTex(num)
  const s = new Steps()

  if (!isFraction) {
    s.goal('Simplify to a + bi').add('Multiply out and collect, treating i as an ordinary letter for now.', iTex(num), '\\text{expand as usual}')
    powersOfIMove(num, s)
    const z = reduceI(num)
    s.add('Now gather the real parts and the i parts separately.', `= ${cxTex(z)}`, 'a + bi:\\ \\text{real part } a,\\ \\text{imaginary part } b')
    return finishComplex(title, input, s, z, src)
  }

  // Dividing: multiply top and bottom by the conjugate of the bottom.
  const dz = reduceI(den)
  if (rIsZero(dz.re) && rIsZero(dz.im)) return failed(title, input, 'The bottom comes to zero.')
  s.goal('Simplify the bottom').add('Work the bottom out first, so it is one number of the form a + bi.', `${iTex(den)} = ${cxTex(dz)}`)
  if (cxIsReal(dz)) {
    powersOfIMove(num, s)
    const nz = reduceI(num)
    const z = cx(rDiv(nz.re, dz.re), rDiv(nz.im, dz.re))
    s.add('The bottom is already a real number, so divide both parts by it.', `\\dfrac{${cxTex(nz)}}{${rTex(dz.re)}} = ${cxTex(z)}`)
    return finishComplex(title, input, s, z, src)
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
    `\\left(${cxTex(dz)}\\right)\\left(${cxTex(conj)}\\right) = ${rTex(rMul(dz.re, dz.re))} + ${rTex(rMul(dz.im, dz.im))} = ${rTex(newBottom)}`,
    'a^2 - (bi)^2 = a^2 + b^2'
  )
  s.add('Multiply out the top the same way.', `\\left(${cxTex(nz)}\\right)\\left(${cxTex(conj)}\\right) = ${cxTex(newTop)}`)
  const z = cx(rDiv(newTop.re, newBottom), rDiv(newTop.im, newBottom))
  s.add('Divide each part by the bottom.', `= ${cxTex(z)}`)
  return finishComplex(title, input, s, z, src)
}

/**
 * The exact answer against mathjs's own complex arithmetic on the same source: an independent
 * route to the same number, so a tick here is a real comparison and not a restatement. Null when
 * mathjs cannot evaluate the source, in which case the check line carries no verdict.
 */
export function agreesNumerically(src: string, z: Cx): boolean | null {
  try {
    // The same reading as the exact route: mathjs on its own takes "i(2+3i)" as a call to a
    // function named i and throws, which left the check with no verdict and no tick.
    const v = math.evaluate(writeTimes(preprocess(src))) as unknown
    const re = typeof v === 'number' ? v : (v as { re?: number }).re
    const im = typeof v === 'number' ? 0 : (v as { im?: number }).im
    if (typeof re !== 'number' || typeof im !== 'number') return null
    const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))
    return near(re, rNum(z.re)) && near(im, rNum(z.im))
  } catch {
    return null
  }
}

/** Every complex answer also gets its modulus, argument and conjugate — they are always asked for. */
function finishComplex(title: string, input: string, s: Steps, z: Cx, src: string): Working {
  const modSq = rAdd(rMul(z.re, z.re), rMul(z.im, z.im))
  const exact = rSqrt(modSq)
  const modTex = exact ? rTex(exact) : modSq.d === 1n ? rootTex(modSq.n) : `\\sqrt{${rTex(modSq)}}`
  s.goal('Find modulus and argument').add(
    'The modulus is the distance from the origin on the Argand diagram.',
    `|z| = \\sqrt{${rTex(rMul(z.re, z.re))} + ${rTex(rMul(z.im, z.im))}} = ${modTex}`,
    '|a+bi| = \\sqrt{a^2 + b^2}'
  )
  // texAngle rather than fmtAngle: fmtAngle honours the compass-bearing notation setting, and
  // "N 36.87° E" is not a thing anyone writes for the argument of a complex number.
  const argTex = texAngle(Math.atan2(rNum(z.im), rNum(z.re)), 'deg', 2)
  const answers = [{ label: 'Answer', tex: cxTex(z) }]
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
      `Take every ${name} term to the left and every number to the right. Anything that crosses the equals sign changes sign.`,
      `${pTex([R0, a], name)} = ${rTex(c)}`,
      '\\text{same thing done to both sides}'
    )
  }
  if (rIsZero(a)) {
    return failed(
      title,
      input,
      rIsZero(c) ? `Both sides are the same, so every value of ${name} works.` : `The ${name} terms cancel and ${rTex(L[0] ?? R0)} = ${rTex(R[0] ?? R0)} is false, so no value of ${name} works.`
    )
  }
  const x = rDiv(c, a)
  if (rIsOne(a)) {
    s.goal('Isolate the letter').add(`So ${name} is on its own.`, `${name} = ${rTex(x)}`)
  } else if (a.d !== 1n) {
    // x/2 = 3 is taught as "multiply both sides by 2", never as "divide by a half".
    const d = rat(a.d)
    const an = rat(a.n)
    const cd = rMul(c, d)
    s.goal('Isolate the letter').add(
      `Multiply both sides by ${rTex(d)} to clear the fraction in front of ${name}.`,
      `${pTex([R0, an], name)} = ${rTex(cd)}`,
      '\\text{same thing done to both sides}'
    )
    if (rIsOne(an)) s.add(`So ${name} is on its own.`, `${name} = ${rTex(x)}`)
    else s.add(`Divide both sides by ${rTex(an)}, the number in front of ${name}.`, `${name} = \\dfrac{${rTex(cd)}}{${rTex(an)}} = ${rTex(x)}`, `a${name} = c \\;\\Rightarrow\\; ${name} = c/a`)
  } else {
    s.goal('Isolate the letter').add(
      `Divide both sides by ${rTex(a)}, the number in front of ${name}.`,
      `${name} = \\dfrac{${rTex(c)}}{${rTex(a)}} = ${rTex(x)}`,
      `a${name} = c \\;\\Rightarrow\\; ${name} = c/a`
    )
  }
  const lv = evalAt(lhs, { [name]: x })
  const rv = evalAt(rhs, { [name]: x })
  const ok = rEq(lv, rv)
  s.goal('Check the answer').add(
    'Put the answer back into the original equation to check both sides agree.',
    `${name} = ${rTex(x)}:\\quad ${exprTex(lhs)} = ${rTex(lv)},\\quad ${exprTex(rhs)} = ${rTex(rv)}`
  )
  return {
    title,
    input,
    method: 'Linear equation',
    moves: s.moves,
    answers: [{ label: `${name} =`, tex: rTex(x) }],
    check: ok ? `With ${name} = ${rTex(x)} both sides come to ${rTex(lv)}.` : 'Careful: the two sides do not agree. Treat this answer with suspicion.',
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

  s.goal('Read off a, b, c').add(
    `Line the equation up as a${name}² + b${name} + c = 0 and read off the three numbers.`,
    `a = ${rTex(a)},\\quad b = ${rTex(b)},\\quad c = ${rTex(c)}`,
    `a${name}^2 + b${name} + c = 0`
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

  s.goal('Use the quadratic formula').add(
    'Put everything into the quadratic formula.',
    `${name} = \\dfrac{-b \\pm \\sqrt{\\Delta}}{2a} = \\dfrac{${rTex(rNeg(b))} \\pm \\sqrt{${rTex(disc)}}}{${rTex(rMul(rat(2n), a))}}`,
    `${name} = \\dfrac{-b \\pm \\sqrt{b^2-4ac}}{2a}`
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
    sign === 0 ? `${name} = ${rTex(re)}` : `${name} = ${r1} \\quad\\text{or}\\quad ${name} = ${r2}`
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
    `${name}_1 + ${name}_2 = ${rTex(sum)} = -\\dfrac{b}{a},\\qquad ${name}_1 ${name}_2 = ${rTex(product)} = \\dfrac{c}{a}`,
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
    `${name} = ${cxsTex(p)} \\quad\\text{or}\\quad ${name} = ${cxsTex(q)}`,
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

export function factoriseComplexWorking(src: string): Working {
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
  s.goal('Write the finished factors').add('Put the factors together, with the number at the front.', `${exprTex(e)} = ${answer}`)
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

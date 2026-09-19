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
import { NotPolynomial, exprTex, parseExpr, parseFraction, varsOf, type Expr } from './mono'
import { MAX_TRIAL } from './limits'
import { pDeg, pTex, pTexBracketed, polyFromExpr, exprFromPoly, type Poly } from './poly'
import { factorsOf } from './factor'
import { texAngle } from '../format'
import { Steps, failed, type Working } from './work'

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

/**
 * Largest square taken out of a root: 72 becomes 6√2.
 *
 * Gives up after MAX_TRIAL divisors and says so. √n left unsimplified is still the right
 * number, which is what matters — an answer that is correct but untidy beats a frozen window.
 */
export function simplifySurd(n: bigint): { out: bigint; in: bigint; tooBig?: boolean } {
  let out = 1n
  let rest = n < 0n ? -n : n
  let steps = 0
  for (let d = 2n; d * d <= rest; d++) {
    if (steps++ > MAX_TRIAL) return { out: 1n, in: n < 0n ? -n : n, tooBig: true }
    while (rest % (d * d) === 0n) {
      out *= d
      rest /= d * d
    }
  }
  return { out, in: rest }
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
    s.add('Multiply and collect, treating i as an ordinary letter for now.', iTex(num), '\\text{expand as usual}')
    powersOfIMove(num, s)
    const z = reduceI(num)
    s.add('Now gather the real parts and the i parts separately.', `= ${cxTex(z)}`, 'a + bi:\\ \\text{real part } a,\\ \\text{imaginary part } b')
    return finishComplex(title, input, s, z)
  }

  // Dividing: multiply top and bottom by the conjugate of the bottom.
  const dz = reduceI(den)
  if (rIsZero(dz.re) && rIsZero(dz.im)) return failed(title, input, 'The bottom comes to zero.')
  s.add('Simplify the bottom first.', `${iTex(den)} = ${cxTex(dz)}`)
  if (cxIsReal(dz)) {
    powersOfIMove(num, s)
    const nz = reduceI(num)
    const z = cx(rDiv(nz.re, dz.re), rDiv(nz.im, dz.re))
    s.add('The bottom is already a real number, so divide both parts by it.', `\\dfrac{${cxTex(nz)}}{${rTex(dz.re)}} = ${cxTex(z)}`)
    return finishComplex(title, input, s, z)
  }

  const conj = cxConj(dz)
  s.add(
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
  return finishComplex(title, input, s, z)
}

/** Every complex answer also gets its modulus, argument and conjugate — they are always asked for. */
function finishComplex(title: string, input: string, s: Steps, z: Cx): Working {
  const modSq = rAdd(rMul(z.re, z.re), rMul(z.im, z.im))
  const exact = rSqrt(modSq)
  const modTex = exact ? rTex(exact) : modSq.d === 1n ? rootTex(modSq.n) : `\\sqrt{${rTex(modSq)}}`
  s.add(
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
  return {
    title,
    input,
    moves: s.moves,
    answers,
    check: cxIsReal(z)
      ? 'The i parts cancelled, so the answer is an ordinary real number.'
      : `Real part ${rTex(z.re)}, imaginary part ${rTex(z.im)}.`
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

export function solveQuadraticWorking(src: string): Working {
  const title = 'Solve'
  let left: Expr
  try {
    // "x^2 + 4 = 0" and "x^2 + 4" both mean the same thing here.
    const [lhs, rhs] = src.split('=')
    left = rhs === undefined ? parseExpr(lhs) : parseExpr(`(${lhs}) - (${rhs})`)
  } catch (err) {
    return failed(title, src, err instanceof NotPolynomial ? err.message : 'I could not read that.')
  }
  const vars = varsOf(left).filter((v) => v !== 'i')
  if (vars.length !== 1) return failed(title, src, `I need exactly one letter to solve for, and I found ${vars.length || 'none'}.`)
  const name = vars[0]
  const { poly } = polyFromExpr(left, name)
  if (pDeg(poly) !== 2) return failed(title, src, `This is a power-${pDeg(poly)} equation. The step-by-step solver here does quadratics.`)

  const [c, b, a] = [poly[0] ?? R0, poly[1] ?? R0, poly[2]]
  const input = `${pTex(poly, name)} = 0`
  const s = new Steps()

  s.add(
    `Line the equation up as a${name}² + b${name} + c = 0 and read off the three numbers.`,
    `a = ${rTex(a)},\\quad b = ${rTex(b)},\\quad c = ${rTex(c)}`,
    `a${name}^2 + b${name} + c = 0`
  )
  const disc = rSub(rMul(b, b), rMul(rat(4n), rMul(a, c)))
  s.add(
    'Work out the discriminant — it decides what kind of roots come out.',
    `\\Delta = b^2 - 4ac = \\left(${rTex(b)}\\right)^2 - 4\\left(${rTex(a)}\\right)\\left(${rTex(c)}\\right) = ${rTex(disc)}`,
    '\\Delta = b^2 - 4ac'
  )

  const sign = rCmp(disc, R0)
  const exact = rSqrt(rAbs(disc))
  if (sign > 0) {
    s.add(
      exact
        ? 'The discriminant is positive and a perfect square, so there are two different rational roots.'
        : 'The discriminant is positive but not a perfect square, so the two roots are real and involve a surd.',
      '\\Delta > 0 \\Rightarrow \\text{two different real roots}'
    )
  } else if (sign === 0) {
    s.add('The discriminant is zero, so both roots are the same.', '\\Delta = 0 \\Rightarrow \\text{one repeated root}')
  } else {
    s.add(
      'The discriminant is negative. A negative number has no real square root, so the roots are complex.',
      '\\Delta < 0 \\Rightarrow \\text{two complex roots}'
    )
    s.add(
      'As we know, the square root of a negative number is written with i.',
      `\\sqrt{${rTex(disc)}} = \\sqrt{${rTex(rAbs(disc))} \\times (-1)} = ${surdOf(rAbs(disc))}\\,i`,
      'i = \\sqrt{-1} \\;\\Rightarrow\\; \\sqrt{-k} = i\\sqrt{k}'
    )
  }

  s.add(
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
  s.add(
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
  s.add(
    'Check the pair against the coefficients.',
    `${name}_1 + ${name}_2 = ${rTex(sum)} = -\\dfrac{b}{a},\\qquad ${name}_1 ${name}_2 = ${rTex(product)} = \\dfrac{c}{a}`,
    '\\text{sum} = -b/a,\\quad \\text{product} = c/a'
  )

  return {
    title,
    input,
    method: 'Quadratic formula',
    moves: s.moves,
    answers,
    check:
      sign < 0
        ? 'The two roots are conjugates — that always happens when the coefficients are real.'
        : `Sum of roots ${rTex(sum)}, product ${rTex(product)} — both match the coefficients.`
  }
}

// ---------------------------------------------------------------- factorising over ℂ

export function factoriseComplexWorking(src: string): Working {
  const title = 'Factorise over complex numbers'
  let e: Expr
  try {
    e = parseExpr(src)
  } catch (err) {
    return failed(title, src, err instanceof NotPolynomial ? err.message : 'I could not read that.')
  }
  const vars = varsOf(e).filter((v) => v !== 'i')
  if (vars.length !== 1) return failed(title, src, 'I need exactly one letter for this.')
  const name = vars[0]

  const s = new Steps()
  s.add(
    'Over the real numbers some quadratics will not factorise. Allowing i means every one of them will.',
    'i = \\sqrt{-1}',
    '\\text{every polynomial factorises over } \\mathbb{C}'
  )

  const realParts = factorsOf(e)
  const realTex = realParts
    .map((p) => {
      const { poly } = polyFromExpr(p, name)
      return pDeg(poly) === 0 ? pTex(poly, name) : pTexBracketed(poly, name)
    })
    .join('')
  if (realParts.length > 1) s.add('Factorise as far as possible with real numbers first.', `${exprTex(e)} = ${realTex}`)

  const out: string[] = []
  let anyComplex = false
  for (const part of realParts) {
    const { poly } = polyFromExpr(part, name)
    const deg = pDeg(poly)
    if (deg <= 1) {
      out.push(deg === 0 ? pTex(poly, name) : pTexBracketed(poly, name))
      continue
    }
    if (deg > 2) {
      return failed(title, exprTex(e), `There is a factor of power ${deg} left that I cannot split any further.`)
    }
    const [c, b, a] = [poly[0] ?? R0, poly[1] ?? R0, poly[2]]
    const disc = rSub(rMul(b, b), rMul(rat(4n), rMul(a, c)))
    if (rCmp(disc, R0) >= 0) {
      out.push(pTexBracketed(poly, name))
      continue
    }
    anyComplex = true
    const denom = rMul(rat(2n), a)
    const re = rDiv(rNeg(b), denom)
    const exact = rSqrt(rAbs(disc))
    const root: Root = exact
      ? { re, coef: rDiv(exact, denom), rad: 1n, imaginary: true }
      : { re, coef: rDiv(rat(1n, rAbs(disc).d), denom), rad: rAbs(disc).n * rAbs(disc).d, imaginary: true }
    s.add(
      `${pTexBracketed(poly, name)} has a negative discriminant (${rTex(disc)}), so solve it with the quadratic formula and use its two roots.`,
      `${name} = ${rootText(root, 1)} \\quad\\text{or}\\quad ${name} = ${rootText(root, -1)}`,
      `\\sqrt{-k} = i\\sqrt{k}`
    )
    const lead = rIsOne(a) ? '' : rTex(a)
    s.add(
      'A quadratic with roots p and q is a(x − p)(x − q), so subtract each root from ' + name + '.',
      `${pTexBracketed(poly, name)} = ${lead}\\left(${name} - \\left[${rootText(root, 1)}\\right]\\right)\\left(${name} - \\left[${rootText(root, -1)}\\right]\\right)`,
      'a(x-p)(x-q)'
    )
    if (lead) out.push(lead)
    out.push(`\\left(${name} - \\left[${rootText(root, 1)}\\right]\\right)`)
    out.push(`\\left(${name} - \\left[${rootText(root, -1)}\\right]\\right)`)
  }

  if (!anyComplex) {
    return {
      title,
      input: exprTex(e),
      moves: s.moves,
      answers: [{ label: 'Answer', tex: realTex }],
      check: 'Every factor was already real, so nothing new appears by allowing i.'
    }
  }

  const answer = out.join('')
  s.add('Put the factors together.', `${exprTex(e)} = ${answer}`)
  return {
    title,
    input: exprTex(e),
    method: 'Roots over ℂ',
    moves: s.moves,
    answers: [{ label: 'Answer', tex: answer }],
    check: 'The complex factors come in conjugate pairs, which is why multiplying them back gives real coefficients.'
  }
}

export { exprFromPoly, type Poly }

// Complex numbers and surds (math/pure/complex.ts says how the jobs work): Solve (a linear or quadratic equation)
// and Factorise with i.
// Out of complex.ts as a pure move (CLEANUP-PLAN.md CW10b).

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
  rSqrt,
  rSub,
  rTex,
  rat,
  type Rat
} from '../rat'
import { NotPolynomial, evalAt, exprTex, parseExpr, typedLetters, varsOf, type Expr } from '../mono'
import { pDeg, pSub, pTex, pTexAt, pTexBracketed, polyFromExpr, type Poly } from '../poly'
import { discriminant, factorsOf } from '../factor'
import { labelTex, labelText } from '../../../calc/labels'
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
} from '../cxpoly'
import { Steps, failed, texToPlain, type Working } from '../work'
import { surdOf } from './numbers'

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

function solveLinearWorking(src: string): Working {
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
  // A letter whose terms all cancel (0x + 3 = 3, x − x + 3 = 3) has gone from the expression, but the student typed it:
  // it is the letter the sentence names ("every value of x works"), not a reason to say there is no letter at all.
  const typed = vars.length === 0 ? typedLetters(src).filter((n) => n !== 'i') : []
  if (vars.length !== 1 && typed.length !== 1) return failed(title, src, `I need exactly one letter to solve for, and I found ${vars.length || 'none'}.`)
  const name = vars.length === 1 ? vars[0] : typed[0]
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
  const side = (e: Expr, v: Rat): string => (varsOf(e).length ? `${pTexAt(polyFromExpr(e, name).poly, x)} = ${rTex(v)}` : rTex(v))
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
  const disc = discriminant(a, b, c)
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
    // Said in words before the roots: a student reading only "complex roots" can miss that the
    // equation has no real solution at all, which is the point of the answer.
    s.goal('See what kind of root').add(
      'The discriminant is negative, so there is no real solution. A negative number has no real square root, so the roots are complex.',
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

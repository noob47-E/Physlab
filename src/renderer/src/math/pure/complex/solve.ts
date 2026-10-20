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
import { NotPolynomial, bracketSides, divisionBottoms, eMul, eSub, evalAt, exprTex, exprTexBracketed, parseExpr, varsOf, type Expr, type SideParts } from '../mono'
import {
  exprFromPoly,
  findRationalRoot,
  pDeg,
  pDivMod,
  pEval,
  pGcd,
  pMul,
  pSub,
  pTex,
  pTexAt,
  pTexBracketed,
  pTrim,
  polyFromExpr,
  type Poly
} from '../poly'
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

// ---------------------------------------------------------------- roots the typed text does not allow

// parseExpr divides out a letter that stands on both the top and the bottom of a fraction (x²/x
// becomes x), and it refuses a division by a bracket. So the equation the solver works on can have a
// root at which a typed bottom is 0: for \frac{x^2}{x} = 0 that root is x = 0, and for
// \frac{x^2-4}{x-2} = 4 it is x = 2. The check on the solver's own sides passes at such a root, so the
// student would see a tick under an answer the typed equation does not allow.
//
// Every typed bottom that holds the unknown is read as a polynomial (divisionBottoms in mono.ts), and a
// value that makes one of them 0 is left out. Those checks are exact (rational or surd arithmetic), so no
// decimal or double is ever involved. A bracket on the bottom is cleared first (clearBrackets below), and
// then the sides are the typed sides at every value that no bottom makes 0.

/** The sentence that replaces an answer when the typed equation allows no value of the letter. */
const noValueWorks = (nameWords: string, leftOut: string, many = false): string =>
  `No value of ${nameWords} works. ${leftOut} ${many ? 'make' : 'makes'} a denominator 0, so ${many ? 'they are' : 'it is'} not allowed.`

/**
 * A refusal the algebra engine must not replace. The engine cancels x²/x itself and answers x = 0,
 * which the typed equation does not allow, so a refusal of this kind stands as it is (store.ts).
 */
const finalRefusal = (w: Working): Working => ({ ...w, finalRefusal: true })

/** The typed bottoms that hold the unknown (as polynomials in it), and a letter on a bottom that is not the unknown. */
interface Bottoms {
  exclude: Poly[]
  otherLetter: string | null
}

/**
 * The typed bottoms, read for the unknown. A bottom that holds the unknown leaves out the values that make it 0. A bottom
 * that holds only another letter is noted, since the answer then holds only where that letter is not 0. A bottom with two
 * letters in it, one of them the unknown, has no single value to leave out, so the line is refused.
 */
function bottomsOf(lhsSrc: string, rhsSrc: string, name: string): Bottoms {
  const exclude: Poly[] = []
  let otherLetter: string | null = null
  for (const bottom of [...divisionBottoms(lhsSrc), ...divisionBottoms(rhsSrc)]) {
    // A bottom this reader cannot make into a polynomial is taken to hold the unknown, so its 0 is refused: the safe mistake.
    if (bottom === null) {
      exclude.push([R0, R1])
      continue
    }
    const letters = varsOf(bottom)
    if (!letters.includes(name)) {
      otherLetter = otherLetter ?? letters[0] ?? null
      continue
    }
    if (letters.length !== 1) throw new NotPolynomial(`I need exactly one letter to solve for, and I found ${letters.length}.`)
    exclude.push(polyFromExpr(bottom, name).poly)
  }
  return { exclude, otherLetter }
}

/** The note that the answer holds only where a letter on a bottom is not 0, when the bottom holds a letter that is not the unknown. */
const onlyWhere = (otherLetter: string | null): string =>
  otherLetter ? ` Only where ${otherLetter} is not 0, because the typed fraction divides by ${otherLetter}.` : ''

/** p(at), evaluated exactly. */
function polyValue(p: Poly, at: Rat): Rat {
  let acc = R0
  for (let i = p.length - 1; i >= 0; i--) acc = rAdd(rMul(acc, at), p[i] ?? R0)
  return acc
}

/**
 * The rational values that make a bottom 0, or null when some root is not rational (a surd, or a complex one). A bottom that is
 * a power of the letter (x², 3x³) has only 0; a straight line has the one root it is solved for.
 */
function rationalRootsOf(p: Poly): Rat[] | null {
  if (pDeg(p) === 1) return [rNeg(rDiv(p[0] ?? R0, p[1] ?? R0))]
  const nonzero = p.flatMap((c, i) => (rIsZero(c) ? [] : [i]))
  if (nonzero.length === 1 && nonzero[0] >= 1) return [R0]
  return null
}

/** The "every value works" sentence, with the values that make a bottom 0 left out (named where they are rational). */
function identityExcept(nameWords: string, exclude: Poly[]): string {
  const values: Rat[] = []
  for (const p of exclude) {
    const roots = rationalRootsOf(p)
    if (roots === null) return `Both sides are the same, so every value of ${nameWords} works except the values that make a denominator 0.`
    for (const r of roots) if (!values.some((v) => rEq(v, r))) values.push(r)
  }
  const list = values.map((v) => `${nameWords} = ${texToPlain(rTex(v))}`).join(' or ')
  return `Both sides are the same, so every value of ${nameWords} works except ${list}, ${values.length > 1 ? 'which make' : 'which makes'} a denominator 0.`
}

/** Whether a value is one a typed bottom makes 0. */
const makesBottomZero = (exclude: Poly[], at: Rat): boolean => exclude.some((p) => rIsZero(polyValue(p, at)))

/**
 * The step that multiplies out a bracket on the bottom, so the sides shown are the ones the solver works on. The multiplier is the
 * lowest common bottom when both bottoms hold the same letter, so a bottom on both sides is not multiplied in twice; otherwise the
 * bottoms are multiplied together, as before.
 */
function clearFractionStep(s: Steps, bottoms: Bottoms, name: string, lhs: Expr, rhs: Expr, multiplier: Expr | null): void {
  const under = multiplier
    ? texToPlain(exprTexBracketed(multiplier))
    : bottoms.exclude.length
      ? bottoms.exclude.map((p) => texToPlain(pTexBracketed(p, name))).join(' and ')
      : 'the bottom of the fraction'
  s.goal('Clear the fraction').add(
    `Multiply both sides by ${under}, so the fraction goes. A value that makes that bottom 0 is not allowed, so it is left out at the end.`,
    `${exprTex(lhs)} = ${exprTex(rhs)}`,
    '\\text{same thing done to both sides}'
  )
}

/**
 * Both sides of an equation with a bracket on a bottom, cleared of it. `lhs` and `rhs` are the sides the solver works on; `typed`
 * keeps each side as the student wrote it (top over bottom), so the working shows and checks the fraction that was typed.
 */
interface Cleared {
  lhs: Expr
  rhs: Expr
  typed: { lhs: SideParts; rhs: SideParts }
  /** The lowest common bottom both sides were multiplied by, or null when each side was multiplied by the other side's bottom. */
  multiplier: Expr | null
}

/**
 * Clears the bracket bottoms of an equation, or returns null when no bracket is on a bottom. When both bottoms hold the same single
 * letter, both sides are multiplied by their lowest common bottom rather than by each other's bottom, so
 * \frac{-2x+3}{x+2} = \frac{-x^2+x+6}{x+2} stays a quadratic instead of growing a spare factor x + 2 and becoming a cubic.
 */
function clearBrackets(lhsSrc: string, rhsSrc: string): Cleared | null {
  const sides = bracketSides(lhsSrc, rhsSrc)
  if (!sides) return null
  const { lhs: l, rhs: r } = sides
  const letters = [...new Set([...varsOf(l.bottom), ...varsOf(r.bottom)])]
  if (letters.length === 1) {
    const name = letters[0]
    const bottomL = polyFromExpr(l.bottom, name).poly
    const bottomR = polyFromExpr(r.bottom, name).poly
    const common = pGcd(bottomL, bottomR)
    if (pDeg(common) >= 1) {
      // The lowest common bottom is bottomL times (bottomR / common). The left side needs bottomR / common as its multiplier,
      // and the right side needs bottomL / common.
      const toLeft = pDivMod(bottomR, common).q
      const toRight = pDivMod(bottomL, common).q
      return {
        lhs: eMul(l.top, exprFromPoly(toLeft, name)),
        rhs: eMul(r.top, exprFromPoly(toRight, name)),
        typed: sides,
        multiplier: exprFromPoly(pMul(toLeft, bottomL), name)
      }
    }
  }
  return { lhs: eMul(l.top, r.bottom), rhs: eMul(r.top, l.bottom), typed: sides, multiplier: null }
}

/** A typed side as the student wrote it: the fraction when there is one, and the plain side otherwise. */
const typedTex = (p: SideParts): string => (exprTex(p.bottom) === '1' ? exprTex(p.top) : `\\dfrac{${exprTex(p.top)}}{${exprTex(p.bottom)}}`)

/** The typed equation as LaTeX, for the working's input line. */
const typedInputTex = (c: Cleared): string => `${typedTex(c.typed.lhs)} = ${typedTex(c.typed.rhs)}`

/**
 * A cleared polynomial split into the part a typed bottom forbids and the part it allows. The forbidden part takes out every factor
 * that shares a root with a bottom (as many times as it occurs), and the allowed part keeps the rest, so allowed × forbidden is the
 * cleared polynomial exactly. No root of the allowed part is a root of any bottom.
 */
function splitForbidden(poly: Poly, exclude: Poly[]): { allowed: Poly; forbidden: Poly } {
  let allowed = pTrim(poly)
  let forbidden: Poly = [R1]
  for (const bottom of exclude) {
    for (;;) {
      const common = pGcd(allowed, bottom)
      if (pDeg(common) < 1) break
      allowed = pDivMod(allowed, common).q
      forbidden = pMul(forbidden, common)
    }
  }
  return { allowed, forbidden }
}

/** The distinct values a forbidden part makes 0, when every one of them is rational; null when some are not. */
function forbiddenValues(forbidden: Poly): Rat[] | null {
  const found: Rat[] = []
  let rest = pTrim(forbidden)
  while (pDeg(rest) >= 1) {
    const at = rIsZero(rest[0] ?? R0) ? R0 : findRationalRoot(rest)
    if (at === null) return null
    if (!found.some((v) => rEq(v, at))) found.push(at)
    rest = pDivMod(rest, [rNeg(at), R1]).q
  }
  return found
}

/** "x = 2 or x = -2" for the values a forbidden part makes 0, or null when they cannot all be named. */
function namedForbidden(forbidden: Poly, nameWords: string): { list: string; many: boolean } | null {
  const values = forbiddenValues(forbidden)
  if (!values || values.length === 0) return null
  return { list: values.map((v) => `${nameWords} = ${texToPlain(rTex(v))}`).join(' or '), many: values.length > 1 }
}

/** The part left over, written as a plain equation for the quadratic solver, highest power first: "(1)*x^2+(-1)=0". */
function plainEquation(p: Poly, name: string): string {
  const terms: string[] = []
  p.forEach((c, k) => {
    if (rIsZero(c)) return
    const coef = c.d === 1n ? `${c.n}` : `${c.n}/${c.d}`
    terms.push(`(${coef})${k === 0 ? '' : `*${name}${k > 1 ? `^${k}` : ''}`}`)
  })
  return `${terms.reverse().join('+')}=0`
}

/**
 * A power of three or more, which the step engine cannot solve, when a typed bottom shares a root with the cleared polynomial. The
 * cleared polynomial splits exactly into the part a bottom forbids and the part it allows (splitForbidden), so:
 *  - a bottom that shares no root keeps the old refusal, and the algebra engine answers as before;
 *  - when no part is allowed, no value works, and that refusal is final, naming the values a bottom makes 0 when they are rational;
 *  - when the allowed part is a line or a quadratic, it is solved with the forbidden values left out, and each answer is checked
 *    against the cleared equation (a quadratic is solved by the quadratic solver, and its steps are kept);
 *  - a larger allowed part is refused with no root given, because the algebra engine would answer the forbidden roots as well.
 */
function powerCase(title: string, src: string, poly: Poly, bottoms: Bottoms, name: string, nameWords: string, cleared: Cleared | null): Working {
  const power = pDeg(poly)
  const plain = failed(title, src, `This is a power-${power} equation. The step-by-step solver here does linear equations and quadratics.`)
  if (bottoms.exclude.length === 0) return plain
  const { allowed, forbidden } = splitForbidden(poly, bottoms.exclude)
  if (pDeg(forbidden) < 1) return plain
  const input = cleared ? typedInputTex(cleared) : `${pTex(poly, name)} = 0`
  const notes = `This is a power-${power} equation, which the step-by-step solver here does not do.`
  const named = namedForbidden(forbidden, nameWords)
  const leftOutWords = named ? `${named.list} ${named.many ? 'make' : 'makes'} a denominator 0, so ${named.many ? 'they are' : 'it is'} not allowed.` : ''
  if (pDeg(allowed) < 1) {
    const refusal = named
      ? noValueWorks(nameWords, named.list, named.many)
      : `No value of ${nameWords} works. Every value that would solve it makes a denominator 0, so it is not allowed.`
    return finalRefusal(failed(title, input, refusal))
  }
  if (pDeg(allowed) > 2) {
    const reason = leftOutWords || 'Some values that make a denominator 0 are not allowed.'
    return finalRefusal(failed(title, input, `${notes} ${reason} The other roots cannot be found here, so no answer is given.`))
  }
  const nameTex = unknownTex(name)
  const s = new Steps()
  if (cleared) clearFractionStep(s, bottoms, name, cleared.lhs, cleared.rhs, cleared.multiplier)
  s.goal('Split the cleared equation').add(
    'The factor that a typed bottom makes 0 is taken out, and what is left is the part that a value of the letter can satisfy.',
    `${pTexBracketed(allowed, name)}${pTexBracketed(forbidden, name)} = 0`,
    '\\text{allowed part} \\times \\text{forbidden part} = 0'
  )
  s.goal('Leave out the values the fraction does not allow').add(leftOutWords || 'The values that make a denominator 0 are left out.')
  if (pDeg(allowed) === 1) {
    const b = allowed[0] ?? R0
    const a = allowed[1]
    const root = rNeg(rDiv(b, a))
    // The forbidden part is not 0 at this root: a shared factor was taken out above, so nothing allowed is left sharing a root.
    if (rIsZero(pEval(forbidden, root))) return plain
    s.goal('Solve the part that is left').add(
      rIsOne(a) ? `Move the number across, so ${nameWords} is on its own.` : `Move the number across, then divide by ${rTex(a)}, the number in front of ${nameWords}.`,
      rIsOne(a) ? `${nameTex} = ${rTex(root)}` : `${nameTex} = \\dfrac{${rTex(rNeg(b))}}{${rTex(a)}} = ${rTex(root)}`
    )
    const check = `Put ${nameWords} = ${texToPlain(rTex(root))} into the cleared equation: it comes to 0, and no typed bottom is 0 there.`
    return { title, input, moves: s.moves, answers: [{ label: `${name} =`, tex: rTex(root) }], check: check + onlyWhere(bottoms.otherLetter), checked: 'ok' }
  }
  const sub = solveQuadraticWorking(plainEquation(allowed, name))
  if (sub.error || sub.checked !== 'ok' || sub.answers.length === 0) {
    return finalRefusal(failed(title, input, `${notes} ${leftOutWords} The other roots cannot be found here, so no answer is given.`.trim()))
  }
  return {
    title,
    input,
    moves: [...s.moves, ...sub.moves],
    answers: sub.answers,
    check: 'Each root makes the cleared equation 0, and no typed bottom is 0 at any of them.' + onlyWhere(bottoms.otherLetter),
    checked: 'ok'
  }
}

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
  let cleared: Cleared | null
  try {
    cleared = clearBrackets(lhsSrc, rhsSrc)
    lhs = cleared ? cleared.lhs : parseExpr(lhsSrc)
    rhs = cleared ? cleared.rhs : parseExpr(rhsSrc)
  } catch (err) {
    return failed(title, src, err instanceof NotPolynomial ? err.message : 'I could not read that.')
  }
  const vars = [...new Set([...varsOf(lhs), ...varsOf(rhs)])]
  if (vars.includes('i')) return failed(title, src, HAS_I)
  if (vars.length !== 1) return failed(title, src, `I need exactly one letter to solve for, and I found ${vars.length || 'none'}.`)
  const name = vars[0]
  // θ in the sentences and \theta in the maths (H12); `name` stays the engine's spelling, for the label.
  const [nameTex, nameWords] = [unknownTex(name), unknownWords(name)]
  let bottoms: Bottoms
  try {
    bottoms = bottomsOf(lhsSrc, rhsSrc, name)
  } catch (err) {
    return failed(title, src, err instanceof NotPolynomial ? err.message : 'I could not read that.')
  }
  const { poly: L } = polyFromExpr(lhs, name)
  const { poly: R } = polyFromExpr(rhs, name)
  // The difference is what matters: x² = x² + 1 has a square on each side and is still the
  // linear (and impossible) equation 0 = 1 once they are subtracted.
  if (pDeg(pSub(L, R)) > 1) return failed(title, src, 'That is not a linear equation.')

  // A cleared bracket shows the equation as it was typed, with its fractions; the cleared sides are shown in the first step.
  const input = cleared ? typedInputTex(cleared) : `${exprTex(lhs)} = ${exprTex(rhs)}`
  const s = new Steps()
  if (cleared) clearFractionStep(s, bottoms, name, lhs, rhs, cleared.multiplier)
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
    // A letter on the bottom cancels (x²/x = x becomes x = x), and the cancelled sides agree at every value except the ones that
    // make a typed bottom 0, which are left out of "every value".
    if (rIsZero(c)) {
      return bottoms.exclude.length
        ? finalRefusal(failed(title, input, identityExcept(nameWords, bottoms.exclude)))
        : failed(title, input, `Both sides are the same, so every value of ${nameWords} works.${onlyWhere(bottoms.otherLetter)}`)
    }
    const refusal = failed(title, input, `The ${nameWords} terms cancel and ${rTex(L[0] ?? R0)} = ${rTex(R[0] ?? R0)} is false, so no value of ${nameWords} works.`)
    return bottoms.exclude.length ? finalRefusal(refusal) : refusal
  }
  const x = rDiv(c, a)
  // A value that makes a typed bottom 0 is not an answer, so it is refused before any step is shown.
  if (makesBottomZero(bottoms.exclude, x)) return finalRefusal(failed(title, input, noValueWorks(nameWords, `${nameWords} = ${texToPlain(rTex(x))}`)))
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
  // A cleared bracket is checked on the fraction as typed (each side's top over its bottom), so the numbers printed are the ones
  // the student gets by putting x into the equation they wrote. A bottom that is 0 there gives no value, and the check fails.
  const typedValue = (p: SideParts): Rat | null => {
    const bottomAt = evalAt(p.bottom, { [name]: x })
    return rIsZero(bottomAt) ? null : rDiv(evalAt(p.top, { [name]: x }), bottomAt)
  }
  const lv = cleared ? typedValue(cleared.typed.lhs) : evalAt(lhs, { [name]: x })
  const rv = cleared ? typedValue(cleared.typed.rhs) : evalAt(rhs, { [name]: x })
  const ok = lv !== null && rv !== null && rEq(lv, rv)
  const shownLeft = lv ?? R0
  const shownRight = rv ?? R0
  // The value is shown going in, side by side (Fix 4): "3x + 4 = 10, 10 = 10" gave a result
  // without its working and then a line that changed nothing.
  const side = (e: Expr, v: Rat): string => (varsOf(e).length ? `${pTexAt(polyFromExpr(e, name).poly, x)} = ${rTex(v)}` : rTex(v))
  // A typed fraction is shown the way a substitution is written: its top and its bottom with x put in.
  const typedSide = (p: SideParts, v: Rat): string =>
    exprTex(p.bottom) === '1'
      ? side(p.top, v)
      : `\\dfrac{${pTexAt(polyFromExpr(p.top, name).poly, x)}}{${pTexAt(polyFromExpr(p.bottom, name).poly, x)}} = ${rTex(v)}`
  const shownLhs = cleared ? typedSide(cleared.typed.lhs, shownLeft) : side(lhs, shownLeft)
  const shownRhs = cleared ? typedSide(cleared.typed.rhs, shownRight) : side(rhs, shownRight)
  s.goal('Check the answer').add(
    `Put ${nameWords} = ${texToPlain(rTex(x))} into each side of the original equation: both sides must come to the same number.`,
    `\\text{LHS} = ${shownLhs},\\quad \\text{RHS} = ${shownRhs}`
  )
  return {
    title,
    input,
    method: 'Linear equation',
    moves: s.moves,
    answers: [{ label: `${name} =`, tex: rTex(x) }],
    check: (ok ? `With ${nameWords} = ${rTex(x)} both sides come to ${rTex(shownLeft)}.` : 'Careful: the two sides do not agree. Treat this answer with suspicion.') + onlyWhere(bottoms.otherLetter),
    checked: ok ? 'ok' : 'failed'
  }
}

export function solveQuadraticWorking(src: string): Working {
  const title = 'Solve'
  if (src.split('=').length > 2) return failed(title, src, TWO_EQUALS)
  let left: Expr
  // "x^2 + 4 = 0" and "x^2 + 4" both mean the same thing here.
  const [lhsSrc, rhsSrc] = src.split('=')
  let cleared: Cleared | null = null
  try {
    if (rhsSrc === undefined) {
      left = parseExpr(lhsSrc)
    } else {
      cleared = clearBrackets(lhsSrc, rhsSrc)
      left = cleared ? eSub(cleared.lhs, cleared.rhs) : parseExpr(`(${lhsSrc}) - (${rhsSrc})`)
    }
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
  let bottoms: Bottoms
  try {
    bottoms = bottomsOf(lhsSrc, rhsSrc ?? '0', name)
  } catch (err) {
    return failed(title, src, err instanceof NotPolynomial ? err.message : 'I could not read that.')
  }
  const { poly } = polyFromExpr(left, name)
  if (pDeg(poly) <= 1) return solveLinearWorking(src)
  // θ in the sentences and \theta in the maths (H12); `name` stays the engine's spelling, for the labels.
  const [nameTex, nameWords] = [unknownTex(name), unknownWords(name)]
  if (pDeg(poly) !== 2) return powerCase(title, src, poly, bottoms, name, nameWords, cleared)

  const [c, b, a] = [poly[0] ?? R0, poly[1] ?? R0, poly[2]]
  const input = cleared ? typedInputTex(cleared) : `${pTex(poly, name)} = 0`
  const s = new Steps()
  if (cleared) clearFractionStep(s, bottoms, name, cleared.lhs, cleared.rhs, cleared.multiplier)

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

  // With a zero discriminant both signs are the same root, so there is only one to test. A root that makes a typed bottom 0 is
  // not an answer; the test is exact, on the surd or rational root itself.
  const rootSigns: (1 | -1)[] = sign === 0 ? [1] : [1, -1]
  const undefinedRoots = bottoms.exclude.length ? rootSigns.filter((sg) => bottoms.exclude.some((p) => isRootOf(p, rootValue(root, sg)))) : []
  const leftOut = undefinedRoots.map((sg) => `${nameWords} = ${texToPlain(rootText(root, sg))}`).join(' or ')
  if (undefinedRoots.length === rootSigns.length) return finalRefusal(failed(title, input, noValueWorks(nameWords, leftOut, undefinedRoots.length > 1)))
  const kept = rootSigns.filter((sg) => !undefinedRoots.includes(sg))

  const r1 = rootText(root, 1)
  const r2 = rootText(root, -1)
  s.goal('Read off the roots').add(
    sign === 0 ? 'Both signs give the same value.' : 'Take the plus and the minus in turn.',
    sign === 0 ? `${nameTex} = ${rTex(re)}` : `${nameTex} = ${r1} \\quad\\text{or}\\quad ${nameTex} = ${r2}`
  )
  if (undefinedRoots.length) {
    s.goal('Leave out the root the fraction does not allow').add(`${leftOut} makes a denominator 0, so it is not allowed.`)
  }

  const answers =
    sign === 0
      ? [{ label: `${name} =`, tex: rTex(re) }]
      : undefinedRoots.length
        ? kept.map((sg) => ({ label: `${name} =`, tex: rootText(root, sg) }))
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

  // The real check: each root, substituted exactly, has to make the polynomial zero. It is exact all
  // the way, so a root such as 7/3 or 1/7 is never refused by rounding. With a root left out, the kept
  // roots are not 0, and the cancelled sides are the typed sides at every value other than 0, so this
  // exact check covers the typed equation too.
  const ok = [rootValue(root, 1), rootValue(root, -1)].every((z) => isRootOf(poly, z))
  // The kept roots are written out only in the sentence that uses them: rootText takes the surd apart,
  // which is the slow part of a huge discriminant, and the usual path never needs it here.
  const check =
    (undefinedRoots.length
      ? ok
        ? `Put ${nameWords} = ${kept.map((sg) => texToPlain(rootText(root, sg))).join(' or ')} back into the typed equation: both sides come to the same number.`
        : 'Careful: the two sides do not agree at that root. Treat this answer with suspicion.'
      : !ok
        ? 'Careful: putting the roots back in does not give zero. Treat this answer with suspicion.'
        : sign < 0
          ? 'The two roots are conjugates — that always happens when the coefficients are real — and each one makes the equation zero exactly.'
          : `Sum of roots ${rTex(sum)}, product ${rTex(product)} — both match the coefficients.`) + onlyWhere(bottoms.otherLetter)

  return {
    title,
    input,
    method: 'Quadratic formula',
    moves: s.moves,
    answers,
    check,
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

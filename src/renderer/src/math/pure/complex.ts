// Complex numbers, worked out the way they are taught.
//
// The trick that makes the working readable: `i` is parsed as an ordinary letter, so a product
// expands to 8 + 2i − 15i² first, and replacing i² with −1 is its own visible step. That is the
// step students actually have to learn, and hiding it inside the arithmetic teaches nothing.
//
// The parts live in math/pure/complex/: numbers.ts (exact numbers), parse.ts (reading a line), write.ts
// (writing it), surds.ts (a line with square roots, and Simplify surds' entry), real.ts (Simplify surds for a
// line with no i) and solve.ts (Solve and Factorise with i). This file keeps the Complex job and is the door:
// what it exported, it still exports, so its importers are unchanged. Runtime imports run numbers ← write ←
// parse ← real ← surds ← this file, and solve on numbers alone: a part must never import this file.

import { rAdd, rDiv, rIsOne, rIsZero, rMul, rNeg, rTex } from './rat'
import { NotPolynomial, exprTex, parseFraction, varsOf, type Expr } from './mono'
import { type DigitSettings } from '../format'
import { Steps, failed, type Working } from './work'
import { cx, cxIsReal, cxMul, cxConj, signedTex, cxTex, reduceI, iTex, powersOfIMove } from './complex/numbers'
import { NO_I, readable, typedPastExact } from './complex/parse'
import { studentDigits, finishComplex } from './complex/write'
import { surdComplexWorking } from './complex/surds'
export { agreesNumerically } from './complex/numbers'
export { isSurdLine, surdWorking } from './complex/surds'
export { solveQuadraticWorking, factoriseComplexWorking } from './complex/solve'


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


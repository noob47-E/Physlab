// Complex numbers and surds (math/pure/complex.ts says how the jobs work): the Complex job's working for a line with
// square roots (surdComplexWorking), and Simplify surds' entry for a line with no i (isSurdLine, surdWorking; real.ts
// works that one out).
// Out of complex.ts as a pure move (CLEANUP-PLAN.md CW10b).

import { type MathNode } from 'mathjs'
import { rInv, rIsOne, rIsZero, rTex } from '../rat'
import { math } from '../../expr'
import { latexToMath } from '../../latexToMath'
import { type DigitSettings } from '../../format'
import { tidyComplex } from '../../../calc/engine'
import {
  cxs,
  cxsConj,
  cxsIsReal,
  surd,
  surdAdd,
  surdIsRational,
  surdIsZero,
  surdNeg,
  surdSqrt,
  surdSub,
  type CxS
} from '../cxpoly'
import { Steps, failed, type Answer, type Working } from '../work'
import {
  powerRuleMove,
  numericValue,
  agreesWith,
  ONE,
  ipIsOne,
  topPower,
  timesSurd,
  ipReduce,
  type Frac
} from './numbers'
import {
  CannotHold,
  SIZE_BARS,
  HELD_ROUNDED,
  NO_I,
  type Seen,
  readLine,
  straysOf,
  readable,
  typedPastExact,
  roundedLiterals,
  needsExpanding,
  reasonFor
} from './parse'
import {
  studentDigits,
  decimalTex,
  decimalRow,
  argumentTex,
  sTex,
  zTex,
  sPlain,
  ipTex,
  typedTex,
  termsTex,
  surdSquaredTex,
  sizeSquaredTex,
  chain,
  surdValue,
  isWhole,
  rootsMove,
  rationalise,
  sameLine,
  A_PLUS_BI
} from './write'
import { ZeroBottom, ComplexLine, realSteps } from './real'

/**
 * The answer as a decimal, with why there are no steps: answers are never optional. A line with no
 * i is "an ordinary sum, the calculator will do it" to the Complex job; the working for a line with
 * a root (`real`) is the one place that gives such a line its decimal, and says why it has no steps.
 */
function decimalAnswer(title: string, input: string, node: MathNode, src: string, why: string, digits: DigitSettings, real = false): Working {
  const v = numericValue(src)
  if (!v) return failed(title, input, why)
  if (!Number.isFinite(v.re) || !Number.isFinite(v.im)) return failed(title, input, 'Worked out with decimals this does not come to a number, so there is no answer to give.')
  // A part that is only round-off beside the other is 0, by the calculator line's own rule, so the
  // two never disagree: e^(iπ) is −1, not −1 + 1.2×10⁻¹⁶i.
  const { re, im } = tidyComplex(v)
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
export function surdComplexWorking(src: string, digits: DigitSettings, real = false): Working {
  const title = real ? SURD_TITLE : 'Complex number'
  let normalized = src
  if (src.includes('\\')) {
    try {
      normalized = latexToMath(src)
    } catch {
      normalized = src
    }
  }
  const text = readable(normalized)
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
  const input = src.includes('\\') ? src : typedTex(node, undefined, roundedLiterals(text, node))
  const strays = straysOf(node)
  if (strays.length) return failed(title, input, `This has ${strays.join(', ')} in it. ${real ? 'Surds are worked on numbers' : 'The complex tools work on numbers'}, not letters.`)
  if (typedPastExact(text)) return decimalAnswer(title, input, node, normalized, real ? forSurds(HELD_ROUNDED) : HELD_ROUNDED, digits, real)
  const seen: Seen = { roots: new Map(), i: false }
  try {
    if (real) return realSteps(title, input, node, normalized, digits)
    const { frac, plain } = readLine(node, seen)
    if (!seen.i) return failed(title, input, NO_I)
    return surdSteps(title, input, node, frac, plain, seen, normalized, digits)
  } catch (err) {
    if (real && err instanceof ComplexLine) return surdComplexWorking(src, digits)
    if (real && err instanceof ZeroBottom) return failed(title, input, 'The bottom comes to zero.')
    return decimalAnswer(title, input, node, normalized, real ? realReasonFor(err) : reasonFor(err), digits, real)
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
    const s = src.includes('\\') ? latexToMath(src) : src
    text = readable(s)
  } catch {
    try {
      text = readable(src)
    } catch {
      return false
    }
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

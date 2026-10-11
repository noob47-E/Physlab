// Complex numbers and surds (math/pure/complex.ts says how the jobs work): writing the decimal answer, a surd, a
// typed line and the pieces of a real surd in TeX, with the steps and small helpers that writing needs (rootsMove,
// rationalise, realRootsMove, partProduct, powSurd).
// Out of complex.ts as a pure move (CLEANUP-PLAN.md CW10b).

import { type MathNode } from 'mathjs'
import {
  R0,
  R1,
  rAbs,
  rAdd,
  rEq,
  rFromNumber,
  rIsNeg,
  rIsOne,
  rIsZero,
  rMul,
  rNeg,
  rNum,
  rSqrt,
  rStr,
  rTex,
  rat,
  type Rat
} from '../rat'
import { texAngle, type DigitSettings } from '../../format'
import { calcNum, formatComplex } from '../../../calc/format'
import { scene } from '../../../core/store'
import {
  cxs,
  joinPieces,
  simplifySurd,
  surd,
  surdIsRational,
  surdNeg,
  surdPieces,
  type CxS,
  type SignedTex,
  type Surd
} from '../cxpoly'
import { Steps, texToPlain, type Answer, type Working } from '../work'
import {
  type Cx,
  cxIsReal,
  cxConj,
  squaredTex,
  cxTex,
  rootTex,
  agreesNumerically,
  ONE,
  type IPoly,
  timesSurd
} from './numbers'
import type { Seen, Loose } from './parse'

// ---------------------------------------------------------------- the decimal answer

/**
 * The student's own precision. The calculator line above the working reads the same setting
 * (panels/Maths.tsx points calc/format.ts at it), so the decimal row matches it digit for digit.
 * Read here because runPure takes no settings, and the Working panel's store calls it as it is.
 */
export function studentDigits(): DigitSettings {
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
export function decimalTex(re: number, im: number, s: DigitSettings): string {
  return formatComplex(re, im, (v) => calcTex(v, s), 'tex')
}

/**
 * Its own row, after the exact answer and never in place of it: 3/25 + 4/25 i is the answer, and
 * 0.12 + 0.16i is the number a student checks it against (P22: the working never gave one).
 */
export const decimalRow = (re: number, im: number, s: DigitSettings): Answer => ({ label: 'As a decimal', tex: `\\approx ${decimalTex(re, im, s)}` })

/**
 * The argument in degrees. A tiny angle comes from texAngle as 5.73\times 10^{-6}^\circ, a double
 * superscript KaTeX refuses: 10 000 000 + i showed its Argument row in red. The degree sign is set
 * on a group of its own instead.
 */
export const argumentTex = (re: number, im: number): string => texAngle(Math.atan2(im, re), 'deg', 2).replace(/(\^\{-?\d+\})\^\\circ$/, '$1\\,{}^\\circ')

/** Every complex answer also gets its modulus, argument and conjugate — they are always asked for. */
export function finishComplex(title: string, input: string, s: Steps, z: Cx, src: string, digits: DigitSettings): Working {
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

export const sTex = (s: Surd): string => joinPieces(piecesTex(s))
/** a + bi, real part first: \frac{\sqrt{2}}{7} + \frac{\sqrt{5}}{7}i. */
export const zTex = (z: CxS): string => joinPieces([...piecesTex(z.re), ...piecesTex(z.im, 'i')])

/** The same number for a sentence, in plain characters: √2/7, 3/25, -2 + 2√2. */
export function sPlain(s: Surd): string {
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
export const ipTex = (p: IPoly): string => joinPieces(p.flatMap((c, k) => piecesTex(c, k === 0 ? '' : k === 1 ? 'i' : `i^{${k}}`)))

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
export function besides(left: string, right: string, implicit: boolean): string {
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
export function typedTex(root: MathNode, roots?: Seen['roots'], typed?: Map<MathNode, string>): string {
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
export const termsTex = (terms: [Surd, string][]): string => joinPieces(terms.flatMap(([v, suffix]) => piecesTex(v, suffix)))

/** A part squared as the modulus line writes it, sign and all, like squaredTex: (−2)², (2√3)². */
export function surdSquaredTex(s: Surd): string {
  const t = sTex(s)
  return /^\d+$/.test(t) ? `${t}^2` : `\\left(${t}\\right)^2`
}

/** A part's size squared, for (a + bi)(a − bi) = a² + b²: (√2)² + (√5)², whatever the signs. */
export function sizeSquaredTex(s: Surd): string {
  const pieces = surdPieces(s)
  return surdSquaredTex(pieces.length === 1 && pieces[0].neg ? surdNeg(s) : s)
}

/** Each link written once: a link that says nothing new is left out rather than repeated. */
export const chain = (links: string[]): string => links.filter((t, k, all) => t !== '' && (k === 0 || t !== all[k - 1])).join(' = ')

export const surdValue = (s: Surd): number => rNum(s.q) + rNum(s.r) * Math.sqrt(Number(s.n))
export const isWhole = (s: Surd): boolean => surdIsRational(s) && s.q.d === 1n

export function rootsMove(roots: Seen['roots'], s: Steps): void {
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
export function rationalise(top: CxS, bottom: Surd, s: Steps): { top: CxS; bottom: Surd } {
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

/** \dfrac and \frac draw the same number; a step between the two would change nothing. */
export const sameLine = (a: string, b: string): boolean => a.replace(/\\dfrac/g, '\\frac') === b.replace(/\\dfrac/g, '\\frac')

export const A_PLUS_BI = 'a + bi:\\ \\text{real part } a,\\ \\text{imaginary part } b'

/** A written part of a surd: the whole number, or the number in front of the root. */
export interface Part {
  c: Rat
  n: bigint | null
}

export function partsOf(s: Surd): Part[] {
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
export const pieceOf = (p: Part): SignedTex => ({ neg: rIsNeg(p.c), body: p.n === null ? rTex(rAbs(p.c)) : magTex(rAbs(p.c), p.n) })

/** √3 − 1, not −1 + √3: when the first piece is a minus, the first positive one leads. */
export function plusFirst(ps: SignedTex[]): SignedTex[] {
  const at = ps.findIndex((p) => !p.neg)
  return ps[0]?.neg && at > 0 ? [ps[at], ...ps.slice(0, at), ...ps.slice(at + 1)] : ps
}

export const realTex = (s: Surd): string => surdWritten(s)
/** For a sentence, with the proper minus, −, as the hand-written sentences have it. */
export const realPlain = (s: Surd): string => surdWritten(s, true).replace(/-/g, '−')

/**
 * A part of the line as typedTex writes it, in plain symbols for a sentence. texToPlain reads a
 * fraction only when its top and bottom hold no braces of their own, so the conjugate of
 * \frac{\sqrt{3}}{2} + 1 reached the student as "√32 - 1" (P22b round 2). Roots and fractions are
 * written here from the inside out, so none is left by the time texToPlain meets the rest: a top or
 * a bottom that is more than one number or root keeps its brackets, as does a fraction with a
 * factor straight after it, and the minus is the proper one.
 */
export function typedPlain(tex: string): string {
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
export interface Typed {
  tex: string
  kind: 'sum' | 'negative' | 'other'
}

/**
 * A number as a factor, or as a term after the first: a sum goes in brackets, and so does a minus
 * that does not lead. `typed` is how the line wrote it, which a first step keeps (√3 + 1, not
 * 1 + √3); brackets then follow what was written (4 − 8 is a sum whatever number it comes to), and
 * otherwise follow the number (two parts are a sum).
 */
export function operand(s: Surd, leading = false, typed?: Typed): string {
  const bracket = typed
    ? typed.kind === 'sum' || (typed.kind === 'negative' && !leading)
    : partsOf(s).length > 1 || (!leading && (rIsNeg(s.q) || rIsNeg(s.r)))
  const text = typed?.tex ?? realTex(s)
  return bracket ? `\\left(${text}\\right)` : text
}

/** One part of the first number times one part of the second, written before and after √n × √n = n is used. */
export function partProduct(x: Part, y: Part): { before: SignedTex; after: SignedTex; squared: bigint | null } {
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
export function conjugatePair(a: Surd, b: Surd): { first: Part; second: Part } | null {
  if (surdIsRational(a) || surdIsRational(b) || rIsZero(a.q) || rIsZero(b.q) || a.n !== b.n) return null
  if (rEq(a.q, b.q) && rEq(a.r, rNeg(b.r))) return { first: { c: a.q, n: null }, second: { c: a.r, n: a.n } }
  if (rEq(a.q, rNeg(b.q)) && rEq(a.r, b.r)) return { first: { c: a.r, n: a.n }, second: { c: a.q, n: null } }
  return null
}

/** A part squared as the difference of two squares writes it, 2² or (√3)², and what it comes to. */
export function partSquared(p: Part): { tex: string; value: string } {
  const mag = rAbs(p.c)
  return p.n === null
    ? { tex: squaredTex(mag), value: rTex(rMul(mag, mag)) }
    : { tex: surdSquaredTex(surd(R0, mag, p.n)), value: rTex(rMul(rMul(mag, mag), rat(p.n))) }
}

export const powSurd = (x: Surd, k: number): Surd => Array.from({ length: k }).reduce<Surd>((out) => timesSurd(out, x), ONE)

/** The roots rewritten, each with the square it gave up named: √50 = √(25 × 2) = 5√2. */
export function realRootsMove(roots: Seen['roots'], s: Steps): void {
  const all = [...roots]
  s.goal('Simplify the square roots').add(
    all.some(([, r]) => r.fraction) ? 'Write each square root in its simplest form.' : 'Take the largest square number out of each root, so that nothing square is left under it.',
    all.map(([typed, r]) => (r.named ? `${typed} = ${r.named} = ${r.tex}` : `${typed} = ${r.tex}`)).join(',\\quad '),
    all.some(([, r]) => r.fraction) ? '\\sqrt{\\dfrac{a}{b}} = \\dfrac{\\sqrt{ab}}{b}' : '\\sqrt{a^2 b} = a\\sqrt{b}'
  )
}

// "=" and the working under it must never disagree.
//
// One button does both jobs now: = gives the answer (the numeric engine, or the formula path) and the step engine works the same line
// out underneath it, folded. They are two engines, so they can part company — over a line one reads differently, or a bug in either
// — and a student who reads one answer above and a different one in the steps has been told two things and given no way to know which
// is right. This is the join: it compares the two where they can be compared, and when they differ it shows NEITHER as final: the
// working's answer is put on the card (it is the one checked by putting it back together), marked unconfirmed, and the disagreement
// is returned as a line for the log. Where the two cannot be compared (no number to read, a refusal, a number too big) it says so and
// changes nothing: a disagreement is claimed only when it can be shown.
//
// Pure: no store, no console. The screen logs the line it is handed.

import { math } from '../math/expr'
import { latexToMath } from '../math/latexToMath'
import { calculusCall } from '../math/calculusCall'
import { isNumericLine } from '../math/pure/factor'
import { isSurdLine } from '../math/pure/complex'
import { suggestJob } from '../math/pure/run'
import { DETERMINANT_TITLE, INVERSE_TITLE, isMatrixLine } from '../math/pure/matrix'
import { texToPlain, type Working } from '../math/pure/work'
import { keypadToMath, withAngle } from './engine'
import { compareFunctions, sameAntiderivative } from './formula'
import { labelTex } from './labels'
import { readRunsAsMultiplication, type EvalResult } from './evaluateInput'
import { GREEK_LETTERS, GREEK_NAMES } from '../math/names'

type Verdict = 'agree' | 'differ' | 'unchecked'

interface Reconciled {
  result: EvalResult
  verdict: Verdict
  /** What to write in the log when the two differ. */
  line?: string
}

/** What the card says over the working's answer when the two parted. */
const DISAGREEMENT_NOTE = 'The quick answer and the working gave different answers for this line, so neither is confirmed. This is the working’s answer.'

/** What the card says under a number only the quick search stands behind, when the working cannot check it either. */
const APPROXIMATE_NOTE = 'Treat this value as approximate: the search could not confirm it to the figures shown, and the working could not check it.'

/** The card as it stands, or marked as unconfirmed with the reason when its number is one nothing has checked (EvalResult.approximate). */
const flagIfApproximate = (result: EvalResult): EvalResult => (result.approximate ? { ...result, extra: [...(result.extra ?? []), APPROXIMATE_NOTE], unconfirmed: true } : result)

/**
 * Whether a line has a working worth folding under its answer. Algebra, equations, calculus, surds, complex numbers, whole numbers
 * (their primes) and lists (HCF, LCM) do. A line of plain numbers — 2 + 3 × 4, 1/3 + 1/4, sin 30 — is a sum with nothing to show but its
 * answer: its "working" would be the prime factors of the result, which is not working out the line.
 */
export function wantsWorking(src: string): boolean {
  const s = src.trim()
  if (!s) return false
  if (calculusCall(s)) return true
  // A determinant or inverse of a typed matrix is all working: its numbers are a line of numbers, which would otherwise be
  // taken for a sum with nothing to show (M^(-1) has no letter in it, so the line below says no).
  if (isMatrixLine(s)) return true
  if (suggestJob(s) !== 'factor') return true
  return !isNumericLine(s) || isSurdLine(s)
}

// ---------------------------------------------------------------------------------------------------------
// Reading a working's answer
// ---------------------------------------------------------------------------------------------------------

type Num = number | { re: number; im: number }

/** The number a TeX answer stands for (a surd, a fraction, π/4, 2i), or null when it is not one. */
function numberOfTex(tex: string): Num | null {
  try {
    const v = withAngle('rad', () => math.evaluate(keypadToMath(latexToMath(tex))) as unknown)
    if (typeof v === 'number') return Number.isFinite(v) ? v : null
    if (math.isComplex(v)) {
      const c = v as { re: number; im: number }
      return Number.isFinite(c.re) && Number.isFinite(c.im) ? { re: c.re, im: c.im } : null
    }
  } catch {
    // Not a number: a formula, or a word.
  }
  return null
}

const parts = (n: Num): { re: number; im: number } => (typeof n === 'number' ? { re: n, im: 0 } : n)
const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b))
const sameNumber = (a: Num, b: Num, tol = 1e-8): boolean => near(parts(a).re, parts(b).re, tol) && near(parts(a).im, parts(b).im, tol)

/** A matrix as rows of numbers, when the value is one (mathjs gives a Matrix, or a plain array of rows); null for anything else. */
function gridOf(v: unknown): number[][] | null {
  const rows = typeof (v as { toArray?: unknown } | null)?.toArray === 'function' ? (v as { toArray(): unknown }).toArray() : v
  if (!Array.isArray(rows) || rows.length === 0) return null
  const grid: number[][] = []
  for (const row of rows) {
    if (!Array.isArray(row) || !row.every((x) => typeof x === 'number' && Number.isFinite(x))) return null
    grid.push(row as number[])
  }
  return grid
}

/** The matrix a TeX answer stands for, as numbers, or null when it is not one. */
function gridOfTex(tex: string): number[][] | null {
  try {
    return gridOf(withAngle('rad', () => math.evaluate(keypadToMath(latexToMath(tex))) as unknown))
  } catch {
    return null
  }
}

/** Whether two matrices have the same shape and the same numbers, to the precision the numeric engine works to. */
function sameGrid(a: number[][], b: number[][]): boolean {
  return a.length === b.length && a.every((row, i) => row.length === b[i].length && row.every((x, j) => sameNumber(x, b[i][j])))
}

/** The linear source of a TeX answer, or null when the converter cannot read it. */
function sourceOfTex(tex: string): string | null {
  try {
    return keypadToMath(latexToMath(tex))
  } catch {
    return null
  }
}

type Agreement = 'agree' | 'differ' | 'unknown'

/** The real roots a solving working lists, one per answer labelled x, x₁, x₂…; complex ones are left out. */
function realRootsOf(working: Working): number[] {
  const found: number[] = []
  for (const a of working.answers) {
    if (!/^([a-zA-Z]|\\theta)(_\d+)?\s*=?$/.test(a.label.trim())) continue
    const v = numberOfTex(a.tex)
    if (v !== null && parts(v).im === 0) found.push(parts(v).re)
  }
  return found
}

/** The sentence a working gives when no value works: the rational method's "no value of x works" or a quadratic's "No real solution". */
const NO_SOLUTION_TEX = /^\\text\{(no value of [a-zA-Z] works|No real solution)\}$/

/**
 * The period of the roots of a working's trig equation (one trig function of c·x), in the unit of its answers: 360° or 2π for a
 * sine or cosine and 180° or π for a tangent, divided by c. Null when the input is not such an equation, or when every answer is
 * zero and no π shows the unit (a zero alone cannot tell degrees from radians).
 */
function periodOf(working: Working): number | null {
  if (typeof working.input !== 'string') return null
  const terms = [...working.input.matchAll(/\\?(sin|cos|tan)\s*\(\s*([^()]*?)\s*\)/g)]
  if (terms.length === 0) return null
  const fns = new Set(terms.map((t) => t[1]))
  const args = new Set(terms.map((t) => t[2].replace(/\s+/g, '')))
  if (fns.size !== 1 || args.size !== 1) return null
  const m = /^(\d*)[a-zA-Z]$/.exec([...args][0])
  if (!m) return null
  const c = m[1] === '' ? 1 : Number(m[1])
  if (!(c > 0)) return null
  const inRadians = working.answers.some((a) => a.tex.includes('\\pi'))
  if (!inRadians && working.answers.every((a) => numberOfTex(a.tex) === 0)) return null
  const tangent = [...fns][0] === 'tan'
  const turn = inRadians ? (tangent ? Math.PI : 2 * Math.PI) : tangent ? 180 : 360
  return turn / c
}

/** Two roots are the same when they are equal, or differ by a whole number of periods of the equation's roots. */
function sameRoot(a: number, b: number, period: number | null): boolean {
  if (near(a, b, 1e-8)) return true
  if (period === null) return false
  const d = a - b
  return near(d, Math.round(d / period) * period, 1e-8)
}

/** The plain text of an answer, with π kept: texToPlain alone would drop the \pi and leave 7/6 for 7π/6. */
function plainOfAnswer(tex: string): string {
  return texToPlain(tex.replace(/\\frac\{(-?\d*)\\pi\}\{(\d+)\}/g, '$1π/$2').replace(/\\pi(?![a-zA-Z])/g, 'π'))
}

/**
 * The letter an indefinite integral is taken in: the one the line names, or x when it names none (the engine is asked with the same
 * default). Null when the card is not an indefinite integral: a definite one, a derivative or anything else.
 */
function integrationLetter(card: EvalResult): string | null {
  const call = calculusCall(card.src)
  if (call?.name !== 'integrate' || call.args.length > 2) return null
  return letterAsRead(call.args[1] ?? 'x')
}

const GREEK_NAME_OF: ReadonlyMap<string, string> = new Map(GREEK_LETTERS.map((g) => [g.letter, g.name]))

/**
 * The letter the line names, read the way the answers' TeX is read. The same converter reads both, and it spells \theta as theta, keeps
 * \alpha as the glyph α and turns \mu into u (the app's micro prefix). A glyph (θ) or a spelt name (alpha) is therefore looked up as its
 * TeX command and read the same way, so the letter and the answers name one letter. Left as typed, θ names a letter no answer contains,
 * and every answer would then agree with every other.
 */
const letterAsRead = (letter: string): string => {
  const name = GREEK_NAME_OF.get(letter) ?? (GREEK_NAMES.has(letter) ? letter : null)
  if (name === null) return letter
  return sourceOfTex(`\\${name}`) ?? letter
}

/** An answer written with its + C taken off, or null when it does not end with one (a definite value, an unreadable answer). */
function withoutConstant(tex: string): string | null {
  const m = /^([\s\S]*?)\s*\+\s*C$/.exec(tex.trim())
  return m ? m[1] : null
}

/**
 * The linear source with the names the reader cannot take apart put apart. The converter drops the underscore of a subscript (a_1 x is a1x,
 * v_0 t is v0t), and a Greek letter runs into the letter beside it (ωt): the reader splits ASCII runs only, so each would stay one name. A
 * letter with its digits is a name of its own (a1·x), and a Greek letter is one letter (ω·t) on either side of the letter it touches.
 */
const splitGlued = (linear: string): string =>
  linear
    .replace(/(_\d+|[A-Za-z]\d+)(?=[A-Za-zα-ωΑ-Ω])/gu, '$1*')
    .replace(/([A-Za-z])(?=[α-ωΑ-Ω])/gu, '$1*')
    .replace(/([α-ωΑ-Ω])(?=[A-Za-zα-ωΑ-Ω])/gu, '$1*')

/**
 * The engine's plain LaTeX writes its natural log as \log: the algebra engine's log is the natural one, and the calculator reads \log as
 * base 10. On the card's side the \log is read as \ln, which is what it is; the working already writes \ln.
 */
const naturalLogs = (tex: string): string => tex.replace(/\\log(?![A-Za-z_])/g, '\\ln')

/**
 * An indefinite integral's answer and the working's answer are the same when they are the same antiderivative: they may carry
 * different constants, and may be written in any form that is real on the same stretch of the line. Two forms of one antiderivative
 * have the same slope whatever constant each carries, so the check compares the slopes (sameAntiderivative), not the values with
 * one shared C, which called a constant difference a disagreement.
 */
function antiderivativeAgreement(card: EvalResult, working: Working, letter: string): Agreement {
  const mine = card.tex ? withoutConstant(naturalLogs(card.tex)) : null
  const theirs = withoutConstant(working.answers[0].tex)
  if (mine === null || theirs === null) return 'unknown'
  // The converter drops the space in x e^x, leaving the run xe, and n x leaves nx. Each letter the answer writes is passed to the reader
  // as a letter, so every run splits the way a typed one does: xe is x·e and nx is n·x. Greek letters and subscripts are split first.
  const reading = (tex: string): string | null => {
    const linear = sourceOfTex(tex)
    if (linear === null) return null
    const split = splitGlued(linear)
    const letters = Object.fromEntries([...new Set(split.match(/[A-Za-z]/g) ?? [])].map((c) => [c, 0]))
    return readRunsAsMultiplication(split, letters)
  }
  const left = reading(mine)
  const right = reading(theirs)
  if (!left || !right) return 'unknown'
  // The same text read the same way is the same function, so there is nothing left to check.
  if (left.replace(/\s+/g, '') === right.replace(/\s+/g, '')) return 'agree'
  try {
    const verdict = sameAntiderivative(math.parse(left), math.parse(right), letter)
    return verdict === 'same' ? 'agree' : verdict === 'different' ? 'differ' : 'unknown'
  } catch {
    return 'unknown'
  }
}

function agreement(card: EvalResult, working: Working): Agreement {
  const first = working.answers[0]
  // Roots: every root of the card is a root of the working; and when the card claims all of them, the working has no real root it left out.
  // A root that differs from a working root by whole periods is the same root (the quick search may give -30 where the working gives 330).
  if (card.roots) {
    const theirs = realRootsOf(working)
    if (theirs.length === 0) {
      // A working that says no value works, and passed its own check, rules out every root the quick search gives (a removable
      // singularity, or a number too big to confirm). That is a disagreement that can be shown, not a case that cannot be compared.
      const saysNoSolution = working.checked === 'ok' && working.answers.length === 1 && NO_SOLUTION_TEX.test(working.answers[0].tex)
      return card.roots.length > 0 && saysNoSolution ? 'differ' : 'unknown'
    }
    const period = periodOf(working)
    const has = (list: number[], r: number): boolean => list.some((q) => sameRoot(q, r, period))
    if (!card.roots.every((r) => has(theirs, r))) return 'differ'
    if (card.rootsComplete && !theirs.every((q) => has(card.roots ?? [], q))) return 'differ'
    return 'agree'
  }
  // A number (a real one, or a complex one): the same number to the precision the numeric engine works to.
  const mine = typeof card.value === 'number' ? card.value : math.isComplex(card.value) ? (card.value as { re: number; im: number }) : null
  if (mine !== null) {
    if (typeof mine === 'number' && !Number.isFinite(mine)) return 'unknown'
    const theirs = numberOfTex(first.tex)
    if (theirs === null) return 'unknown'
    return sameNumber(mine, theirs) ? 'agree' : 'differ'
  }
  // The inverse of a typed matrix: the same entries, cell by cell. Without this a wrong inverse working passed as unchecked.
  if (working.title === INVERSE_TITLE) {
    const mine = gridOf(card.value)
    if (mine) {
      const theirs = gridOfTex(first.tex)
      if (!theirs) return 'unknown'
      return sameGrid(mine, theirs) ? 'agree' : 'differ'
    }
  }
  // An indefinite integral is judged as an antiderivative (below), where a constant is allowed; a definite one is a number above.
  const letter = integrationLetter(card)
  if (letter !== null) return antiderivativeAgreement(card, working, letter)
  // A formula: the same function of its letters. A division's working answers a quotient and a remainder: when the remainder is
  // nothing the quotient is the line, and when it is not the line is the quotient plus a fraction this does not rebuild.
  const formula = card.formula ?? (card.tex ? sourceOfTex(card.tex) : null)
  if (!formula) return 'unknown'
  const quotient = working.answers.find((a) => a.label === 'Quotient')
  const remainder = working.answers.find((a) => a.label === 'Remainder')
  if (quotient && remainder && numberOfTex(remainder.tex) !== 0) return 'unknown'
  const theirs = sourceOfTex((quotient ?? first).tex)
  if (!theirs) return 'unknown'
  try {
    const verdict = compareFunctions(math.parse(formula), math.parse(theirs))
    return verdict === 'same' ? 'agree' : verdict === 'different' ? 'differ' : 'unknown'
  } catch {
    return 'unknown'
  }
}

/** Every answer of a working under its own label, the way the card lists roots: "x = −10,  x = 10". One answer keeps its label too. */
function labelledAnswers(working: Working): string {
  return working.answers
    .map((a) => {
      const label = labelTex(a.label)
      const shownLabel = label ? (/\s=$/.test(label) ? label : `${label} =`) : null
      return shownLabel ? `${shownLabel}\\; ${a.tex}` : a.tex
    })
    .join(',\\quad ')
}

/** What the card shows for a working's answers: one answer as it is, several each under its own label. */
function texOfAnswers(working: Working): string {
  if (working.answers.length === 1) return working.answers[0].tex
  return labelledAnswers(working)
}

/**
 * The card the working confirms, when the card holds one root the search found and not the whole list. The search stops at one
 * root, so "log(x²) = 2" showed x = −10 beside a checked working that lists x = −10 and x = 10. The card now takes every root the
 * working lists, each exact where it is one (a double root reads x = −1, not −0.9999999987), and guess mode checks against the same
 * list. Nothing new is claimed: agreement has already matched every card root to a root of the working. Only a checked working
 * whose answers are all real numbers is used; otherwise the card stands as it was.
 */
function rootsFromWorking(card: EvalResult, working: Working): EvalResult {
  if (!card.roots || card.rootsComplete || working.checked !== 'ok') return card
  const theirs = realRootsOf(working)
  if (theirs.length === 0 || theirs.length !== working.answers.length) return card
  // Two answers that are the same number would print twice, so the card keeps its own root rather than list one twice.
  for (let i = 0; i < theirs.length; i++) {
    for (let j = i + 1; j < theirs.length; j++) if (near(theirs[i], theirs[j], 1e-8)) return card
  }
  const tex = labelledAnswers(working)
  // π is kept on the plain-text line by the one rule in this file (plainOfAnswer): a second copy here would drift from it.
  const main = plainOfAnswer(tex)
  return { ...card, main, tex, roots: theirs, approximate: false }
}

/** The sentences an "=" refusal must NOT give way for: intentional rule refusals like variable storing. */
const REFUSAL_STAYS = /^Typing .+ does not store a value\./

/** A working's answer that is the solution set of an inequality is marked on its card, so Guess-first never reads a number out of the set. */
const inequalityMark = (working: Working): { inequality?: true } => (working.method === 'Inequalities' ? { inequality: true } : {})

/**
 * The card for a determinant the working agrees with. A determinant of a typed matrix is exact, so when mathjs's float is only round-off
 * away from the working's number (2.6×10⁻¹⁷ against 0 for a singular decimal matrix) the card shows the working's own number.
 */
function exactDeterminantCard(card: EvalResult, working: Working): EvalResult {
  if (working.title !== DETERMINANT_TITLE || working.answers.length !== 1) return card
  const exact = numberOfTex(working.answers[0].tex)
  if (typeof exact !== 'number' || typeof card.value !== 'number' || card.value === exact) return card
  return { ...card, main: texToPlain(working.answers[0].tex), tex: undefined, exact: null, value: exact }
}

/**
 * A checked working that proves a matrix has no inverse, against a card that still gives numbers for it (mathjs's float inverse of a
 * singular matrix is a grid of large numbers, not an error). The card is the working's sentence, marked unconfirmed like any other
 * disagreement. A card that already refuses keeps its own sentence (reconcile returns it unchanged).
 */
function noInverseCard(card: EvalResult, sentence: string): Reconciled {
  return {
    result: { main: sentence, src: card.src, extra: [DISAGREEMENT_NOTE], exact: null, solved: false, unconfirmed: true },
    verdict: 'differ',
    line: `PHYSLAB_CHECK calc-disagree line="${card.src}" quick="${card.main}" working="${sentence}"`
  }
}

/**
 * The card the screen shows, given the "=" answer and the working for the same line.
 *
 * If "=" cannot answer but the working answered the same job, the card shows the working's checked answer
 * (an HCF list; the primes of a number past a double; indefinite integration) — no disagreement, the numeric engine
 * simply could not answer. A refusal that is the answer itself (typing A = … does not store a value) or a working
 * whose check failed stays a refusal.
 */
export function reconcile(result: EvalResult, working: Working | null): Reconciled {
  // A checked working with no answer box can still conclude: a singular matrix has no inverse, and its conclusion is what the card says.
  if (working && !working.error && working.answers.length === 0 && working.checked === 'ok' && working.conclusion && !result.error) {
    return noInverseCard(result, working.conclusion)
  }
  // No working to compare with (the step engine refuses a power-8 equation): a number only the search stands behind is said to be approximate, and
  // every other card stands as it is.
  if (!working || working.error || working.answers.length === 0) return { result: flagIfApproximate(result), verdict: 'unchecked' }
  if (result.error) {
    if (working.checked !== 'ok' || REFUSAL_STAYS.test(result.error.sentence)) return { result, verdict: 'unchecked' }
    const tex = texOfAnswers(working)
    return { result: { main: plainOfAnswer(tex), src: result.src, tex, exact: null, solved: false, ...inequalityMark(working) }, verdict: 'unchecked' }
  }
  if (result.engine) return { result, verdict: 'unchecked' }
  if (result.solved && result.roots && !result.rootsComplete && working.checked === 'ok') {
    const theirs = realRootsOf(working)
    const period = periodOf(working)
    // The working fills in the roots the quick search listed only in part, and only when every one of those is among its own:
    // a quick answer with a root the working does not have is a disagreement, and falls through to be shown as one below.
    const listedInWorking = result.roots.every((r) => theirs.some((q) => sameRoot(q, r, period)))
    if (listedInWorking && (theirs.length > 1 || (theirs.length === 1 && !near(result.roots[0], theirs[0], 1e-8)))) {
      const tex = texOfAnswers(working)
      return {
        result: { ...result, main: plainOfAnswer(tex), tex, roots: theirs, rootsComplete: true, approximate: false },
        verdict: 'agree'
      }
    }
  }
  const verdict = agreement(result, working)
  if (verdict === 'agree') return { result: rootsFromWorking(exactDeterminantCard(result, working), working), verdict: 'agree' }
  if (verdict === 'unknown') return { result: flagIfApproximate(result), verdict: 'unchecked' }
  const tex = texOfAnswers(working)
  return {
    result: { main: plainOfAnswer(tex), src: result.src, tex, extra: [DISAGREEMENT_NOTE], exact: null, solved: false, unconfirmed: true, ...inequalityMark(working) },
    verdict: 'differ',
    line: `PHYSLAB_CHECK calc-disagree line="${result.src}" quick="${result.main}" working="${tex}"`
  }
}

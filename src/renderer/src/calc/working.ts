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
import { texToPlain, type Working } from '../math/pure/work'
import { keypadToMath, withAngle } from './engine'
import { compareFunctions } from './formula'
import { labelTex } from './labels'
import type { EvalResult } from './evaluateInput'

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

/** What the card shows for a working's answers: one answer as it is, several each under its own label. */
function texOfAnswers(working: Working): string {
  if (working.answers.length === 1) return working.answers[0].tex
  return working.answers
    .map((a) => {
      const label = labelTex(a.label)
      const shownLabel = label ? (/\s=$/.test(label) ? label : `${label} =`) : null
      return shownLabel ? `${shownLabel}\\; ${a.tex}` : a.tex
    })
    .join(',\\quad ')
}

/** The sentences an "=" refusal must NOT give way for: intentional rule refusals like variable storing. */
const REFUSAL_STAYS = /^Typing .+ does not store a value\./

/**
 * The card the screen shows, given the "=" answer and the working for the same line.
 *
 * If "=" cannot answer but the working answered the same job, the card shows the working's checked answer
 * (an HCF list; the primes of a number past a double; indefinite integration) — no disagreement, the numeric engine
 * simply could not answer. A refusal that is the answer itself (typing A = … does not store a value) or a working
 * whose check failed stays a refusal.
 */
export function reconcile(result: EvalResult, working: Working | null): Reconciled {
  // No working to compare with (the step engine refuses a power-8 equation): a number only the search stands behind is said to be approximate, and
  // every other card stands as it is.
  if (!working || working.error || working.answers.length === 0) return { result: flagIfApproximate(result), verdict: 'unchecked' }
  if (result.error) {
    if (working.checked !== 'ok' || REFUSAL_STAYS.test(result.error.sentence)) return { result, verdict: 'unchecked' }
    const tex = texOfAnswers(working)
    return { result: { main: plainOfAnswer(tex), src: result.src, tex, exact: null, solved: false }, verdict: 'unchecked' }
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
  if (verdict === 'agree') return { result, verdict: 'agree' }
  if (verdict === 'unknown') return { result: flagIfApproximate(result), verdict: 'unchecked' }
  const tex = texOfAnswers(working)
  return {
    result: { main: plainOfAnswer(tex), src: result.src, tex, extra: [DISAGREEMENT_NOTE], exact: null, solved: false, unconfirmed: true },
    verdict: 'differ',
    line: `PHYSLAB_CHECK calc-disagree line="${result.src}" quick="${result.main}" working="${tex}"`
  }
}

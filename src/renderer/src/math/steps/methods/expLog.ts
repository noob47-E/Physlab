// The exponential and logarithmic equation method (S3).
//
// Two shapes are worked: a power of a whole-number base equal to a power of that same base, or to a whole number that is
// one (2^(x) = 8 is written 2^(x) = 2^(3), then the exponents are equal); and a logarithm of the unknown equal to a whole
// number (log(x) = 2 becomes x = 10^(2), then x = 100). A base written with a subscript (log_{2}(x) = 5) is worked the same
// way: latexToMath writes it as log(2, x), readLogTerm reads that, and the working keeps the line as typed, so the page draws
// the subscript (displaySafe allows that one subscript, and only on log).
//
// Each move is one EquationEquiv with a declared op, checked exactly by checkExpLogOp (check-adapter.ts). What is left is a
// linear or quadratic equation, and the router solves it: its steps and its answer are the working's own. Anything else is
// noWorking(), so the older path answers it. That covers 5^(x) = 12, e^(x) = 5 and ln(x + 1) = 2, whose answers are logarithms:
// the exact checks read whole-number answers only, so a logarithm answer would not be put back into its equation (substitutionOf
// returns nothing for it), and a base e is not read at all. It also covers log(x) + log(x - 3) = 1, which needs a move that joins
// two logarithms and a step that rejects a root by evaluating its logarithms; neither exists yet. These four stay noWorking()
// until the checks can prove a logarithm answer, so nothing unchecked is ever drawn as a working. A power whose exponent
// holds a bracket inside its own bracket, such as 2^(x^(2)) = 16 or 2^((x + 1)(x - 3)) = 2^(4): drawnTex (displaySafe.ts)
// braces only a power whose bracket has no bracket inside, so the page would draw those lines differently from how they are
// read, and displaySafe refuses them.
// A complex problem is noWorking() too: cancelling a base is only an equivalence over the real numbers.

import type { Method, Problem, Step, StepRouter, Working } from '../types'
import { parseExactRat, readExpPower, readLogTerm, splitEquation, tryParsePoly } from '../check-adapter'
import { equationStep } from './equation'
import { noWorking } from './quadratic'
import { varsOf } from '../../pure/mono'
import { latexToMath } from '../../latexToMath'

const EXPLOG_ID = 'exp-log'
const METHOD_NAME = 'Exponential and logarithmic equation'

/** The largest exponent a working writes: the same bound the exact checks use (check-adapter.ts, MAX_LOG_POWER). */
const MAX_EXPONENT = 300
/** The most digits a computed power may have: a larger one would be a number no student can read off a working. */
const MAX_VALUE_DIGITS = 40

/**
 * This method reads the equation over the real numbers only. Cancelling a base is not an equivalence over the complex numbers
 * (2^(x) = 8 has infinitely many roots there, and log(x^(2) + 2) = 0 has i and -i instead of no root), so a complex problem
 * is left to the older path, which answers it as it did before. A problem with no domain is real.
 */
function isRealProblem(problem: Problem): boolean {
  return (problem.domain ?? 'real') === 'real'
}

/** A whole number written as text ("8", "-2"), or null. */
function wholeNumber(text: string): bigint | null {
  const r = parseExactRat(text)
  return r !== null && r.d === 1n ? r.n : null
}

/** A base a working may use: a whole number from 2 up (base "10" is the logarithm to base ten). */
function baseNumber(text: string): bigint | null {
  if (!/^\d+$/.test(text)) return null
  const b = BigInt(text)
  return b >= 2n && b <= 1000n ? b : null
}

/** The whole number n with base^n = c, for 0 <= n <= MAX_EXPONENT, or null when c is not an exact whole power of base. */
function exponentFor(base: bigint, c: bigint): bigint | null {
  if (c < 1n) return null
  let n = 0n
  let rest = c
  while (rest > 1n) {
    if (rest % base !== 0n) return null
    rest /= base
    n += 1n
    if (n > BigInt(MAX_EXPONENT)) return null
  }
  return rest === 1n ? n : null
}

/** A power equation: base^(exp) = c, where c is base^n. rhsAsPower: the right side is already a power of the same base. */
interface PowerShape {
  kind: 'power'
  left: string
  base: string
  exp: string
  n: bigint
  v: string
  rhsAsPower: boolean
}

/** A logarithm equation: log_base(arg) = c. */
interface LogShape {
  kind: 'log'
  left: string
  base: string
  arg: string
  c: bigint
  v: string
}

type Shape = PowerShape | LogShape

/** What the typed equation is, when it is one of the two shapes this method works; null otherwise. */
function identify(text: string): Shape | null {
  const sp = splitEquation(text)
  if (!sp) return null
  const power = readExpPower(sp.left)
  if (power) {
    const base = baseNumber(power.base)
    const e = tryParsePoly(power.exp)
    if (base === null || !e) return null
    const letters = varsOf(e)
    if (letters.length !== 1) return null
    const rightPower = readExpPower(sp.right)
    let n: bigint | null
    let rhsAsPower = false
    if (rightPower && rightPower.base === power.base) {
      n = wholeNumber(rightPower.exp)
      rhsAsPower = true
    } else {
      const c = wholeNumber(sp.right)
      n = c === null ? null : exponentFor(base, c)
    }
    if (n === null) return null
    return { kind: 'power', left: sp.left, base: power.base, exp: power.exp, n, v: letters[0], rhsAsPower }
  }
  const log = readLogTerm(sp.left)
  if (log) {
    const base = baseNumber(log.base)
    const a = tryParsePoly(log.arg)
    const c = wholeNumber(sp.right)
    if (base === null || !a || c === null || c < 0n || c > BigInt(MAX_EXPONENT)) return null
    const letters = varsOf(a)
    if (letters.length !== 1) return null
    if ((base ** c).toString().length > MAX_VALUE_DIGITS) return null
    return { kind: 'log', left: sp.left, base: log.base, arg: log.arg, c, v: letters[0] }
  }
  return null
}

/**
 * The line the working starts from. A logarithm is drawn as the student typed it (\log(x), which the page can draw); the
 * reading the router gets, log(x), is refused on the page because a plain run of letters reads as a word. Only the LaTeX
 * that reads as the same problem is used, so the working never shows a line that is not the typed problem.
 */
function startLine(input: string, raw: string | undefined): string {
  if (raw === undefined) return input
  try {
    if (latexToMath(raw).replace(/\s+/g, '') === input.replace(/\s+/g, '')) return raw.trim()
  } catch {
    // A line that does not read is drawn as its reading, which is then refused on the page if it cannot be drawn.
  }
  return input
}

/**
 * The rest of the working: the equation left after the move is solved by the router. Its steps are the working's own, and its
 * answer is the answer of the equation left. A reduced equation the router cannot show ends the method with noWorking().
 */
function solveRest(start: string, steps: Step[], reduced: string, v: string, router: StepRouter): Working {
  // The reduced equation is solved over the reals too: this method only takes real problems (isRealProblem).
  const sub = router.solve({ job: 'solve', input: reduced, variable: v, domain: 'real' })
  if (sub.noWorking || sub.steps.length === 0 || sub.answer === undefined) return noWorking()
  return {
    title: `Solve ${start}`,
    input: start,
    method: METHOD_NAME,
    steps: [...steps, ...sub.steps],
    answer: sub.answer
  }
}

export const expLogMethod: Method = {
  id: EXPLOG_ID,
  name: METHOD_NAME,
  order: 30,
  isAlternative: false,

  appliesTo(problem: Problem) {
    if (problem.job !== 'solve' && problem.job !== 'equation') return { applies: false, why: 'Job is not solve' }
    if (!isRealProblem(problem)) return { applies: false, why: 'Only real equations are worked by this method' }
    if (identify(String(problem.input))) return { applies: true }
    return { applies: false, why: 'Not a power or a logarithm of the unknown equal to a whole number' }
  },

  solve(problem: Problem, router: StepRouter): Working {
    if (!isRealProblem(problem)) return noWorking()
    const input = String(problem.input)
    const shape = identify(input)
    if (!shape) return noWorking()

    if (shape.kind === 'power') {
      // A power is drawn as typed (2^(x) = 8 reads and draws the same), so the working starts from the reading itself.
      const steps: Step[] = []
      let before = input
      if (!shape.rhsAsPower) {
        const powered = `${shape.left} = ${shape.base}^(${shape.n})`
        steps.push(equationStep(before, powered, { kind: 'write-as-power', base: shape.base, power: shape.n.toString() }, shape.v))
        before = powered
      }
      const reduced = `${shape.exp} = ${shape.n}`
      steps.push(equationStep(before, reduced, { kind: 'cancel-base', base: shape.base }, shape.v))
      return solveRest(input, steps, reduced, shape.v, router)
    }

    // A logarithm starts from the line as typed, when that reads as the same problem; see startLine.
    const start = startLine(input, problem.rawInput)
    const powered = `${shape.arg} = ${shape.base}^(${shape.c})`
    const value = (BigInt(shape.base) ** shape.c).toString()
    const worked = `${shape.arg} = ${value}`
    const steps: Step[] = [
      equationStep(start, powered, { kind: 'log-to-power', base: shape.base }, shape.v),
      equationStep(powered, worked, { kind: 'work-out-power' }, shape.v)
    ]
    return solveRest(start, steps, worked, shape.v, router)
  }
}

// Guess first checking for the Calculator: checks a student's guess against an evaluation result.
// Reuses math/checkAnswer.ts (numerical tolerance, wrong sign, power-of-ten traps) and
// math/check/checkers.ts (algebraic and expression equivalence).

import { parseAnswer, type Check } from '../math/checkAnswer'
import { expressionEqual } from '../math/check/checkers'
import { inDegrees, math, preprocess } from '../math/expr'
import type { MeasureSettings } from '../math/format'
import type { EvalResult } from './evaluateInput'

/**
 * Reads a number or mathematical expression (like 5*sqrt(2), 1 + sqrt 2, 3/4, 2pi, e)
 * as a finite number.
 */
function parseExprNumber(text: string): number | null {
  let s = text.trim()
  if (!s) return null
  // Strip variable assignment prefixes like "x = ", "x1 = ", "x_1 = "
  s = s.replace(/^[a-zA-Z](?:_?\d+)?\s*=\s*/, '')
  // Normalize unicode minus
  s = s.replace(/[−–—]/g, '-')
  // Normalize \sqrt{x} -> sqrt(x) and \sqrt x -> sqrt(x)
  s = s.replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)')
  s = s.replace(/\\sqrt\s*(\d+(?:\.\d+)?|[a-zA-Z_]\w*)/g, 'sqrt($1)')
  s = s.replace(/√\s*(\d+(?:\.\d+)?|[a-zA-Z_]\w*)/g, 'sqrt($1)')
  // sqrt followed by space and operand without parens: e.g. "sqrt 2" -> "sqrt(2)"
  s = s.replace(/\bsqrt\s+(\d+(?:\.\d+)?|[a-zA-Z_]\w*)/g, 'sqrt($1)')
  // Replace π with pi
  s = s.replace(/π/g, 'pi')

  // Try standard parseAnswer first
  const parsed = parseAnswer(s)
  if (parsed !== null && Number.isFinite(parsed)) return parsed

  // Try mathjs evaluate with preprocessing
  try {
    const val = inDegrees(() => math.evaluate(preprocess(s)))
    const num = typeof val === 'number' ? val : Number(val)
    if (Number.isFinite(num)) return num
  } catch {
    // ignore
  }

  return null
}

/**
 * Returns half a unit of the last digit shown or typed for a decimal representation,
 * or 1e-9 if the expected number is an exact integer.
 */
function halfUnitTol(shownText: string, typedText: string, v: number): number {
  if (Number.isInteger(v)) {
    return 1e-9
  }

  const decimalOrSci = /^(?:[+-]?\d+\.(\d+)(?:[eE]([+-]?\d+))?|[+-]?\d+(?:[eE]([+-]?\d+)))$/

  const mTyped = typedText.trim().match(decimalOrSci)
  if (mTyped) {
    const decimals = mTyped[1] ? mTyped[1].length : 0
    const exp = parseInt(mTyped[2] ?? mTyped[3] ?? '0', 10)
    return 0.5 * 10 ** (exp - decimals)
  }

  const mShown = shownText.trim().match(decimalOrSci)
  if (mShown) {
    const decimals = mShown[1] ? mShown[1].length : 0
    const exp = parseInt(mShown[2] ?? mShown[3] ?? '0', 10)
    return 0.5 * 10 ** (exp - decimals)
  }

  return 1e-9
}

/**
 * Checks a guess typed by the student against the calculation's result.
 * Returns a Check with verdict ('right' | 'close' | 'wrong' | 'empty' | 'unreadable')
 * and an explanatory message when appropriate.
 */
export function checkCalculatorGuess(
  guessText: string,
  result: EvalResult,
  _settings: Pick<MeasureSettings, 'decimals' | 'precisionMode'> = { decimals: 2, precisionMode: 'dp' }
): Check {
  const trimmed = guessText.trim()
  if (!trimmed) return { verdict: 'empty' }

  // Direct match against formatted result string, formula, or exact representation (handles Base-N, units, symbols)
  if (trimmed === result.main.trim()) {
    return { verdict: 'right', parsed: parseExprNumber(trimmed) ?? undefined }
  }
  if (result.exact && trimmed === result.exact.trim()) {
    return { verdict: 'right', parsed: parseExprNumber(trimmed) ?? undefined }
  }
  if (result.formula && trimmed === result.formula.trim()) {
    return { verdict: 'right', parsed: parseExprNumber(trimmed) ?? undefined }
  }

  // An inequality's answer is a set of intervals. The number and root checks below would read a number out of its text and call a
  // right answer wrong ("0" for x² ≤ 0), so only the answer typed exactly as the card shows it (checked above) is taken.
  if (result.inequality) {
    return { verdict: 'unreadable', message: 'Guess-first does not check an inequality yet. Type its answer exactly as the card shows it, or click "Show me".' }
  }

  // 1. Equation / polynomial roots (e.g. roots = [3, 2] or [1 + sqrt(2), 1 - sqrt(2)])
  if (result.roots && result.roots.length > 0) {
    // Split ONLY on commas, semicolons, and the word "and" (case-insensitive)
    const rawSegments = trimmed.split(/[,;]|\band\b/i).map((s) => s.trim()).filter(Boolean)
    const expandedParts: string[] = []

    for (const seg of rawSegments) {
      // Check for ± or \pm or +-
      const pmMatch = seg.match(/^(.*?)(?:±|\\pm|\+-)(.*)$/)
      if (pmMatch) {
        const head = pmMatch[1].trim()
        const tail = pmMatch[2].trim()
        if (!head || /^[a-zA-Z](?:_?\d+)?\s*=$/.test(head)) {
          const prefix = head ? `${head} ` : ''
          expandedParts.push(`${prefix}${tail}`, `${prefix}-${tail}`)
        } else {
          expandedParts.push(`${head} + ${tail}`, `${head} - ${tail}`)
        }
      } else {
        expandedParts.push(seg)
      }
    }

    const parsedNums: number[] = []
    for (const p of expandedParts) {
      const n = parseExprNumber(p)
      if (n === null) {
        return { verdict: 'unreadable', message: 'I could not read that. Type the solutions, for example: 3, 2.' }
      }
      parsedNums.push(n)
    }

    if (parsedNums.length === 0) {
      return { verdict: 'unreadable', message: 'I could not read that. Type the solutions, for example: 3, 2.' }
    }

    const expected = [...result.roots]
    const matchedExact = new Set<number>()
    const matchedClose = new Set<number>()

    for (const num of parsedNums) {
      // Exact match check (within half a unit of shown precision or 1e-7)
      let matchIdx = expected.findIndex(
        (exp, i) => !matchedExact.has(i) && Math.abs(num - exp) <= Math.max(1e-7, halfUnitTol(result.main, '', exp))
      )
      if (matchIdx !== -1) {
        matchedExact.add(matchIdx)
        matchedClose.add(matchIdx)
        continue
      }
      // Close match check (within about 2%)
      matchIdx = expected.findIndex(
        (exp, i) => !matchedClose.has(i) && Math.abs(num - exp) <= (exp !== 0 ? Math.abs(exp) * 0.02 : 0.02)
      )
      if (matchIdx !== -1) {
        matchedClose.add(matchIdx)
      }
    }

    if (matchedExact.size === expected.length && parsedNums.length === expected.length) {
      return { verdict: 'right', parsed: parsedNums[0] }
    }
    if (matchedClose.size === expected.length && parsedNums.length === expected.length) {
      return {
        verdict: 'close',
        parsed: parsedNums[0],
        message: 'Very close to the calculated solutions.'
      }
    }
    if (matchedClose.size > 0) {
      return {
        verdict: 'close',
        parsed: parsedNums[0],
        message: `Found ${matchedClose.size} of ${expected.length} solution${expected.length > 1 ? 's' : ''}. There is another!`
      }
    }
    return {
      verdict: 'wrong',
      parsed: parsedNums[0],
      message: 'Check the solutions to the equation.'
    }
  }

  // 2. Numerical value
  const targetVal = typeof result.value === 'number' ? result.value : parseAnswer(result.main)
  if (targetVal !== null && Number.isFinite(targetVal)) {
    const a = parseExprNumber(trimmed)
    if (a === null) {
      return { verdict: 'unreadable', message: 'I could not read that. Type a number like 12.5, or an expression like 5*sqrt(2).' }
    }

    const tolExact = Math.max(1e-9, halfUnitTol(result.main, trimmed, targetVal))

    // A guess is 'right' only when it equals the answer (exactly, or equal to the answer as shown, within half a unit of the last digit shown)
    if (Math.abs(a - targetVal) <= tolExact) {
      return { verdict: 'right', parsed: a }
    }

    // Check wrong sign note
    if (Math.abs(a - (-targetVal)) <= Math.max(tolExact, Math.abs(targetVal) * 0.02)) {
      return {
        verdict: 'wrong',
        parsed: a,
        message: 'Right size, wrong sign. Check the direction or the signs in your calculation.'
      }
    }

    // Check power of ten note
    for (const k of [-6, -3, -2, -1, 1, 2, 3, 6]) {
      const p = 10 ** k
      const shifted = targetVal * p
      const band = Math.max(1e-9, Math.abs(shifted) * 0.02)
      if (Number.isFinite(shifted) && targetVal !== 0 && Math.abs(a - shifted) <= band) {
        return {
          verdict: 'wrong',
          parsed: a,
          message: 'Right digits, wrong power of ten. Check the decimal point and units.'
        }
      }
    }

    // 'close' within about 2 %
    const tolClose = targetVal !== 0 ? Math.abs(targetVal) * 0.02 : 0.02
    if (Math.abs(a - targetVal) <= tolClose) {
      return { verdict: 'close', parsed: a, message: 'Close to the calculated answer.' }
    }

    // else 'wrong'
    return { verdict: 'wrong', parsed: a }
  }

  // 3. Complex number value { re, im }
  if (result.value && typeof result.value === 'object' && 're' in (result.value as Record<string, unknown>)) {
    const c = result.value as { re: number; im: number }
    const expectedExpr = c.im === 0 ? `${c.re}` : c.re === 0 ? `${c.im} * i` : `${c.re} + ${c.im} * i`
    const eq = expressionEqual(trimmed, expectedExpr)
    if (eq === 'equal') return { verdict: 'right' }
    if (eq === 'different') {
      // Check for conjugate or wrong sign
      const conj = expressionEqual(trimmed, `${c.re} - ${c.im} * i`)
      if (conj === 'equal') {
        return { verdict: 'wrong', message: 'Close: that is the complex conjugate (opposite imaginary sign).' }
      }
      return { verdict: 'wrong', message: 'Check both the real and imaginary parts.' }
    }
  }

  // 4. Formula or algebraic expression
  if (result.formula || result.tex || result.src) {
    const target = result.formula || result.src
    try {
      const eq = expressionEqual(trimmed, target)
      if (eq === 'equal') return { verdict: 'right' }
    } catch {
      // Fall through
    }
  }

  const a = parseExprNumber(trimmed)
  if (a === null) {
    return { verdict: 'unreadable', message: 'I could not read that. Type a number like 12.5, or an expression like 5*sqrt(2).' }
  }

  return { verdict: 'wrong', parsed: a }
}

// Shared helpers for the S1c tests (expanding and factorising). Not a test file: the expand and factorise tests import it.
//
// The independent side of every check lives here: integer polynomials multiplied with plain BigInt arithmetic, and the
// factor degrees of a product text read by bracket groups. Nothing here calls the method under test to build an answer.

import { validateStep, validateWorking } from '../../../src/renderer/src/math/steps/validate'
import { renderWorkingToDoc } from '../../../src/renderer/src/math/steps/render'
import { tryParsePoly } from '../../../src/renderer/src/math/steps/check-adapter'
import { exprDegree, type Expr } from '../../../src/renderer/src/math/pure/mono'
import type { Step, Working } from '../../../src/renderer/src/math/steps/types'

export { mulberry32 } from '../methods/seeded'

/** The longest number an item may carry: an integer with more significant digits (trailing zeros not counted) is declined. */
export const SIG_DIGIT_LIMIT = 15

/** True when some integer in the text has more than SIG_DIGIT_LIMIT significant digits. */
export function hasLongNumber(text: string): boolean {
  const runs = text.match(/\d+/g) ?? []
  return runs.some((r) => r.replace(/0+$/, '').length > SIG_DIGIT_LIMIT)
}

/**
 * The factor degrees of a product text, sorted. Each bracket group is one factor (its power repeats it); a constant group
 * and a numeric prefix are no factor; a monomial outside the brackets (3x, x^2) counts one factor per letter power; any
 * other outside sum is one factor. Null when a group is not read.
 */
export function factorDegrees(text: string): number[] | null {
  const out: number[] = []
  let outside = ''
  let i = 0
  while (i < text.length) {
    if (text[i] !== '(') {
      outside += text[i]
      i++
      continue
    }
    let depth = 0
    let j = i
    for (; j < text.length; j++) {
      if (text[j] === '(') depth++
      else if (text[j] === ')') {
        depth--
        if (depth === 0) break
      }
    }
    if (j >= text.length) return null
    const body = text.slice(i + 1, j)
    i = j + 1
    const pw = /^\s*\^\s*\(?(\d+)\)?/.exec(text.slice(i))
    const power = pw ? Number(pw[1]) : 1
    if (pw) i += pw[0].length
    if (!/[a-zA-Z]/.test(body)) continue
    const P = tryParsePoly(body)
    if (!P) return null
    const d = exprDegree(P)
    if (d === 0) continue
    for (let k = 0; k < power; k++) out.push(d)
  }
  const rest = outside.replace(/[\s*]/g, '')
  if (/[a-zA-Z]/.test(rest)) {
    const P = tryParsePoly(rest)
    if (!P) return null
    const d = exprDegree(P)
    if (P.length === 1) for (let k = 0; k < d; k++) out.push(1)
    else out.push(d)
  }
  return out.sort((a, b) => a - b)
}

/** The integer coefficients of an expression in x (index = power), or null when it has another letter or a fraction. */
export function coeffsOf(e: Expr, maxDeg = 12): bigint[] | null {
  const out: bigint[] = Array.from({ length: maxDeg + 1 }, () => 0n)
  for (const t of e) {
    if (Object.keys(t.v).some((n) => n !== 'x' && t.v[n] !== 0)) return null
    const p = t.v.x ?? 0
    if (p > maxDeg || t.c.d !== 1n) return null
    out[p] += t.c.n
  }
  return trimCoeffs(out)
}

/** Drops the zero coefficients above the top power. */
export function trimCoeffs(c: bigint[]): bigint[] {
  let top = c.length - 1
  while (top > 0 && c[top] === 0n) top--
  return c.slice(0, top + 1)
}

/** The product of two integer polynomials (index = power). */
export function mulCoeffs(a: bigint[], b: bigint[]): bigint[] {
  const out: bigint[] = Array.from({ length: a.length + b.length - 1 }, () => 0n)
  a.forEach((x, i) => b.forEach((y, j) => (out[i + j] += x * y)))
  return trimCoeffs(out)
}

/** A polynomial as student text, highest power first: "6x^2 + x - 2". */
export function polyText(c: bigint[]): string {
  let s = ''
  let first = true
  for (let p = c.length - 1; p >= 0; p--) {
    const k = c[p]
    if (k === 0n) continue
    const mag = k < 0n ? -k : k
    const coef = mag === 1n && p > 0 ? '' : mag.toString()
    const term = `${coef}${p > 0 ? 'x' : ''}${p > 1 ? `^${p}` : ''}`
    if (first) s += (k < 0n ? '-' : '') + term
    else s += ` ${k < 0n ? '-' : '+'} ${term}`
    first = false
  }
  return s || '0'
}

/** A rendered page shows a working only when every step is valid (Rule 0.2): true when the page shows any move. */
function pageShowsMoves(w: Working): boolean {
  return renderWorkingToDoc(w).moves.length > 0
}

/** The verdict of one mutant: accepted when its step validates, the working validates, or the page shows its moves. */
export function judgeMutant(step: Step | null, w: Working): { accepted: boolean; hidden: boolean } {
  const stepOk = step !== null && validateStep(step).verdict === 'valid'
  const workingOk = validateWorking(w).valid
  const shown = pageShowsMoves(w)
  return { accepted: stepOk || workingOk || shown, hidden: !shown }
}


/** The text of a working's first answer ('' when it has none). A working's answer may be one or a list. */
export function answerTex(w: Working): string {
  const a = w.answer
  const first = Array.isArray(a) ? a[0] : a
  return first ? String(first.tex) : ''
}

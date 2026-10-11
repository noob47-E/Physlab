// Text for the first methods (S1a): the states a working passes through, written two ways.
//
// A state is written as the validators read it (check-adapter.ts): a power is x^2, never x^{2}, and
// a fraction is \frac. A string with braces and no backslash is not converted by latexToMath, so
// x^{2} would fail to parse and every step would come back unknown. The plain form is for the
// sentences a student reads: x², −, fractions as 5/2, never code.

import { rAbs, rIsNeg, rIsZero, rStr, rTex, type Rat } from '../../pure/rat'
import type { Expr } from '../../pure/mono'

export const MINUS = '−'

/** One term of an expression in one letter: its coefficient and the letter's power. */
export interface Mono {
  c: Rat
  p: number
}

/** The terms of an expression in one letter, highest power first. Zero terms are dropped. */
export function monosOf(e: Expr, v: string): Mono[] {
  return e
    .map((t) => ({ c: t.c, p: t.v[v] ?? 0 }))
    .filter((m) => !rIsZero(m.c))
    .sort((a, b) => b.p - a.p)
}

const isUnit = (a: Rat): boolean => a.n === 1n && a.d === 1n

/** The magnitude of one term, LaTeX: 3x, \frac{1}{2}x, x^2, 7. The sign is added by the joiner. */
function monoBodyTex(m: Mono, v: string): string {
  const abs = rAbs(m.c)
  if (m.p === 0) return rTex(abs)
  const coef = isUnit(abs) ? '' : rTex(abs)
  return `${coef}${v}${m.p > 1 ? `^${m.p}` : ''}`
}

/** Terms joined with their signs, LaTeX: 2x^2 - 5x + 6. The list is written in the order given. */
export function joinTex(monos: Mono[], v: string): string {
  if (monos.length === 0) return '0'
  return monos
    .map((m, i) => {
      const body = monoBodyTex(m, v)
      const neg = rIsNeg(m.c)
      if (i === 0) return neg ? `-${body}` : body
      return neg ? ` - ${body}` : ` + ${body}`
    })
    .join('')
}

/** A whole number or a fraction, plain: 3, 5/2, −1/2 (the sign only when negative). */
export function ratPlain(a: Rat): string {
  const abs = rAbs(a)
  const num = abs.d === 1n ? abs.n.toString() : `${abs.n}/${abs.d}`
  return rIsNeg(a) ? `${MINUS}${num}` : num
}

/** The factor (d·x − n) of a root n/d, LaTeX-free so the validator reads it as typed: 2x + 1, x − 2, 3x. */
export function factorTex(d: bigint, n: bigint, v: string): string {
  const lead = d === 1n ? v : `${d}${v}`
  if (n === 0n) return lead
  return n < 0n ? `${lead} + ${-n}` : `${lead} - ${n}`
}

/** x, x − 5/2 or x + 1/2 as LaTeX: the shift of a variable by a number. */
export function shiftTex(v: string, s: Rat): string {
  if (rIsZero(s)) return v
  return rIsNeg(s) ? `${v} + ${rTex(rAbs(s))}` : `${v} - ${rTex(s)}`
}

/** The same shift as the validator reads it (fractions as 5/2): x - 5/2, x + 1/2. */
export function shiftAscii(v: string, s: Rat): string {
  if (rIsZero(s)) return v
  return rIsNeg(s) ? `${v} + ${rStr(rAbs(s))}` : `${v} - ${rStr(s)}`
}

/** The same shift for a student: x − 5/2, x + 1/2, or plain x. */
export function shiftPlain(v: string, s: Rat): string {
  if (rIsZero(s)) return v
  return rIsNeg(s) ? `${v} + ${ratPlain(rAbs(s))}` : `${v} ${MINUS} ${ratPlain(s)}`
}

/** A state as LaTeX-for-the-validator: both sides of an equation. */
export function eqTex(lhs: Mono[], rhs: Mono[], v: string): string {
  return `${joinTex(lhs, v)} = ${joinTex(rhs, v)}`
}


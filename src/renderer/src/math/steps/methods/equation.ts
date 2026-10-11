// The shared front of the equation methods (S1a): reading an equation, expanding brackets, collecting
// like terms and clearing fractions or decimals. Each move is one step with its own validator.
//
// Every move is an EquationEquiv with a declared op (types.ts, EquationOp), checked side by side. The
// sentence and rule come from the builder (sentences.ts, finishStep): a method never types them.
// Each step starts from the text the previous step ended on (Sides.text), so the chain holds; the first
// step starts from the problem as typed.

import { normalize, parseExpr, varsOf, type Expr } from '../../pure/mono'
import { rMul, rat } from '../../pure/rat'
import type { EquationOp, Problem, Step } from '../types'
import {
  decimalPlaces,
  distributeTerms,
  fractionDenominators,
  hasDecimalLiteral,
  hasRealProduct,
  lcmOf,
  literalsWithinLimit,
  splitEquation,
  stringifyNodeOrText
} from '../check-adapter'
import { finishStep } from '../sentences'
import { eqTex, joinTex, monosOf, type Mono } from './stepText'

/** A side of an equation as typed (raw: term by term, brackets expanded, not yet collected). */
interface SideRead {
  collected: Expr
  raw: Mono[]
  flagged: boolean
  /** The side has a real product (a bracket multiplied, or raised to a power of 2 or more). */
  real: boolean
}

interface Reading {
  v: string
  start: string
  left: SideRead
  right: SideRead
}

/**
 * The state of an equation: both sides, and the text the validators read. `text` is the state as the
 * working last wrote it (the input itself when nothing has been written yet), so the next step's
 * before is that text.
 */
export interface Sides {
  lhs: Expr
  rhs: Expr
  text: string
}

/** One EquationEquiv step from `before` to `after` by the declared move, its words built from the move. */
export function equationStep(before: string, after: string, op: EquationOp, v: string): Step {
  return finishStep({ kind: 'EquationEquiv', op, before, after, sentence: '', data: { variable: v } })
}

/** Build an expression from its terms in one letter (zero terms are dropped). */
export function exprOf(monos: Mono[], v: string): Expr {
  return normalize(monos.map((m) => ({ c: m.c, v: m.p === 0 ? {} : { [v]: m.p } })))
}

/** The sides of a state from expressions, with the text the validators will read. */
export function sidesOf(lhs: Expr, rhs: Expr, v: string): Sides {
  return { lhs, rhs, text: eqTex(monosOf(lhs, v), monosOf(rhs, v), v) }
}

/** Read one side: its collected form and its raw terms, bracket by bracket. Null if it is not a polynomial in v. */
function readSide(side: string, v: string): SideRead | null {
  let collected: Expr
  try {
    collected = parseExpr(side)
  } catch {
    return null
  }
  if (varsOf(collected).some((name) => name !== v)) return null
  // The expansion is written term by term, with nothing collected inside a bracket (review delta4, MUST 1).
  const raw = distributeTerms(side, v)
  if (raw === null) return null
  // A bracket is a bracket as typed, even when it collapses to one term (3(x/15 + 0)); a bracket
  // after a power (x^(2) from the Maths field's converter), or a slash (x/(-2): a denominator), is not one.
  const flagged = /(?<![\^/])\(/.test(side)
  return { collected, raw: raw.map((t) => ({ c: t.c, p: t.p })), flagged, real: hasRealProduct(side) }
}

/**
 * Read an equation for the methods. Null when the input is not one equation in one letter whose
 * sides are polynomials, or when the problem names another letter.
 */
export function readEquation(problem: Problem): Reading | null {
  // A literal beyond the exact limits is refused before anything reads it (review delta4, crash).
  if (!literalsWithinLimit(problem.input)) return null
  try {
    const split = splitEquation(problem.input)
    if (!split) return null
    const start = stringifyNodeOrText(problem.input)
    const lhs = parseExpr(split.left)
    const rhs = parseExpr(split.right)
    const names = new Set([...varsOf(lhs), ...varsOf(rhs)])
    if (names.size !== 1) return null
    const v = [...names][0]
    if (problem.variable && problem.variable !== v) return null
    const left = readSide(split.left, v)
    const right = readSide(split.right, v)
    if (!left || !right) return null
    return { v, start, left, right }
  } catch {
    return null
  }
}

/**
 * Expand the brackets (one step, the layout shows each product as it falls out) and collect like
 * terms (a second step, only if something was repeated or cancelled). Steps are appended to `steps`.
 * The returned text is the state the last step wrote, or the input when nothing was written.
 */
export function expandAndCollect(reading: Reading, steps: Step[]): Sides {
  const { v, start, left, right } = reading
  let prev = start
  if (left.flagged || right.flagged) {
    const expanded = `${joinTex(left.raw, v)} = ${joinTex(right.raw, v)}`
    const real = left.real || right.real
    steps.push(equationStep(prev, expanded, real ? { kind: 'expand-sides' } : { kind: 'remove-brackets' }, v))
    prev = expanded
  }
  const lhs = left.collected
  const rhs = right.collected
  const repeated =
    left.raw.length !== monosOf(lhs, v).length || right.raw.length !== monosOf(rhs, v).length
  if (repeated) {
    const collected = eqTex(monosOf(lhs, v), monosOf(rhs, v), v)
    steps.push(equationStep(prev, collected, { kind: 'collect-like-terms' }, v))
    prev = collected
  }
  return { lhs, rhs, text: prev }
}

/** Multiply every term of an expression by k. */
function scaleExpr(e: Expr, k: bigint): Expr {
  return normalize(e.map((t) => ({ c: rMul(t.c, rat(k)), v: { ...t.v } })))
}

/**
 * Clear the decimals, then the fractions, each as one scale step. The decimal step multiplies by the power of ten
 * that makes every decimal literal of the state whole (its own op, clear-decimals). The fraction step multiplies by
 * the LCD of the reduced denominators that appear in the state (clear-fractions). Each step's before is the text the
 * step starts from, so the validators read the same denominators and decimals the method used.
 */
export function clearDenominators(cur: Sides, v: string, steps: Step[]): Sides {
  let now = cur
  if (!literalsWithinLimit(now.text)) throw new Error('a literal beyond the exact limits')
  if (hasDecimalLiteral(now.text)) {
    const k = 10n ** BigInt(decimalPlaces(now.text))
    const next = sidesOf(scaleExpr(now.lhs, k), scaleExpr(now.rhs, k), v)
    steps.push(equationStep(now.text, next.text, { kind: 'clear-decimals', k: String(k) }, v))
    now = next
  }
  const dens = fractionDenominators(now.text)
  const k = dens === null ? 1n : lcmOf(dens)
  if (k > 1n) {
    const next = sidesOf(scaleExpr(now.lhs, k), scaleExpr(now.rhs, k), v)
    steps.push(equationStep(now.text, next.text, { kind: 'clear-fractions', k: String(k) }, v))
    now = next
  }
  return now
}

// G2: checking an answer to a system of linear equations by exact elimination over ℚ. The rank of the coefficients and
// of the augmented matrix decide which of the three kinds of answer is right; a unique answer must then satisfy every
// equation exactly, and a family, read literally as equations, must be exactly the solution set (docs/knowledge/check.md).

import { type MathNode } from 'mathjs'
import { constExpr, type Expr } from '../pure/mono'
import { R0, R1, rAdd, rDiv, rIsZero, rMul, rNeg, rSub, type Rat } from '../pure/rat'
import { lettersOf, plainVars, readExact, readMaths, rfValue } from './parse'
import { NotExact, safely, tick, type Verdict } from './verdict'

/**
 * An answer to a linear system. `unique`: a value for every unknown. `infinite`: each listed unknown in terms of
 * parameters (new letters, or unknowns left unlisted, which are then free). `none`: no solution.
 */
export type LinearAnswer =
  | { kind: 'unique'; values: Record<string, string> }
  | { kind: 'infinite'; values: Record<string, string> }
  | { kind: 'none' }

/** Σ coef·name + constant: an expression of degree ≤ 1. */
interface Linear {
  coef: Record<string, Rat>
  constant: Rat
}

/** coefficient of each name, and the constant, of an expression of degree ≤ 1; null when it is not linear. */
function linearParts(e: Expr): Linear | null {
  const coef: Record<string, Rat> = {}
  let constant = R0
  for (const t of e) {
    const names = Object.keys(t.v).filter((k) => t.v[k] !== 0)
    if (names.length === 0) constant = t.c
    else if (names.length === 1 && t.v[names[0]] === 1) coef[names[0]] = t.c
    else return null
  }
  return { coef, constant }
}

/**
 * A polynomial expression from a tree, and every denominator written in it that holds a letter (`holes`: where it is
 * undefined, though the division cancels, as in 1/(1/x)); null when the polynomial itself has a letter below the line.
 */
function polynomialOf(node: MathNode): { e: Expr; holes: Expr[] } | null {
  const { rf, atoms, dens } = readExact(node)
  if (atoms.length) return null
  const d = rfValue({ num: rf.den, den: constExpr(R1) })
  if (!d || rIsZero(d)) return null
  return { e: rf.num.map((t) => ({ c: rDiv(t.c, d), v: t.v })), holes: dens.filter((h) => plainVars(h).length) }
}

/** An answer's value as a polynomial, with no letter below the line anywhere (and never an equation), or null. */
function valueOf(text: string): Expr | null {
  const p = polynomialOf(readMaths(text))
  return p && !p.holes.length ? p.e : null
}

/** A linear expression from an answer's text (never an equation: "1 = y" is not 1 − y), or null. */
function linearValue(text: string): Linear | null {
  const e = valueOf(text)
  return e ? linearParts(e) : null
}

/** e at a point, exactly. */
function valueAt(e: Expr, at: Record<string, Rat>): Rat {
  let total = R0
  for (const t of e) {
    let term = t.c
    for (const [k, p] of Object.entries(t.v)) for (let i = 0; i < p; i++) term = rMul(term, at[k] ?? R0)
    total = rAdd(total, term)
  }
  return total
}

/** Rank of a matrix of rationals, by Gaussian elimination. */
function rank(rows0: Rat[][]): number {
  return reduce(rows0).pivots.length
}

/** Reduced row echelon form (Gauss–Jordan), and the column of each row's pivot. */
function reduce(rows0: Rat[][]): { rows: Rat[][]; pivots: number[] } {
  const rows = rows0.map((r) => [...r])
  const width = rows[0]?.length ?? 0
  const pivots: number[] = []
  let r = 0
  for (let c = 0; c < width && r < rows.length; c++) {
    tick()
    const p = rows.findIndex((row, i) => i >= r && !rIsZero(row[c]))
    if (p < 0) continue
    ;[rows[r], rows[p]] = [rows[p], rows[r]]
    const lead = rows[r][c]
    rows[r] = rows[r].map((v) => rDiv(v, lead))
    for (let i = 0; i < rows.length; i++) {
      if (i === r || rIsZero(rows[i][c])) continue
      const k = rows[i][c]
      rows[i] = rows[i].map((v, j) => rSub(v, rMul(k, rows[r][j])))
    }
    pivots.push(c)
    r++
  }
  return { rows, pivots }
}

/**
 * The points of Σ coef·v + constant = 0 (one row each) in the variables `vars`: one point and the directions that
 * span the rest, or null when the rows contradict each other.
 */
function affineSolutions(rows: Linear[], vars: string[]): { point: Rat[]; directions: Rat[][] } | null {
  const m = vars.length
  const { rows: rr, pivots } = reduce(rows.map((row) => [...vars.map((v) => row.coef[v] ?? R0), rNeg(row.constant)]))
  // A pivot in the last column is a row 0 = b with b ≠ 0: no point at all.
  if (pivots.includes(m)) return null
  const point = vars.map(() => R0)
  pivots.forEach((c, i) => (point[c] = rr[i][m]))
  const directions: Rat[][] = []
  for (let f = 0; f < m; f++) {
    if (pivots.includes(f)) continue
    const d = vars.map(() => R0)
    d[f] = R1
    pivots.forEach((c, i) => (d[c] = rNeg(rr[i][f])))
    directions.push(d)
  }
  return { point, directions }
}

function linearSystemCheckRaw(equations: string[], answer: LinearAnswer): Verdict {
  try {
    const nodes = equations.map((t) => readMaths(t, true))
    const read = nodes.map(polynomialOf)
    if (read.some((e) => e === null)) return 'unknown'
    const eqs = read.map((r) => r!.e)
    const holes = read.flatMap((r) => r!.holes)
    const parts = eqs.map(linearParts)
    if (parts.some((p) => p === null)) return 'unknown'
    const lin = parts as Linear[]
    // Every letter written in an equation is an unknown, even one that cancels (in x + z − z = 1, z is free), and so is
    // every letter the answer gives a value for: a value for a letter no equation fixes is a claim about a free unknown.
    const listed = answer.kind === 'none' ? [] : Object.keys(answer.values)
    const unknowns = [...new Set([...lettersOf(...nodes), ...eqs.flatMap((e) => plainVars(e)), ...listed])].sort()
    const A = lin.map((p) => unknowns.map((u) => p.coef[u] ?? R0))
    const aug = lin.map((p, i) => [...A[i], p.constant])
    const rA = rank(A)
    const rAug = rank(aug)
    const n = unknowns.length

    if (holes.length && rA === rAug) {
      // A denominator that cancels still leaves its zeros out of the solution set: 1/(1/x) = 0 has none. With one
      // solution point P, the answer is P, or no solution when P is such a zero. A whole family less those zeros is not
      // affine, and is not decided here.
      if (rA < n) return answer.kind === 'unique' ? 'different' : 'unknown'
      const p = affineSolutions(lin, unknowns)
      if (!p) return 'unknown'
      const at = Object.fromEntries(unknowns.map((u, j) => [u, p.point[j]]))
      if (holes.some((h) => rIsZero(valueAt(h, at)))) return answer.kind === 'none' ? 'equal' : 'different'
    }
    if (answer.kind === 'none') return rA < rAug ? 'equal' : 'different'
    if (rA < rAug) return 'different'

    if (answer.kind === 'unique') {
      if (rA < n) return 'different'
      const at: Record<string, Rat> = {}
      for (const u of unknowns) {
        const t = answer.values[u]
        if (t === undefined) return 'different'
        const e = valueOf(t)
        if (!e) return 'unknown'
        if (plainVars(e).length) return 'different'
        at[u] = e.length ? e[0].c : R0
      }
      // Every equation holds exactly at the values: Σ cᵤ·u + c = 0.
      return lin.every((p) => rIsZero(unknowns.reduce((s, u) => rAdd(s, rMul(p.coef[u] ?? R0, at[u])), p.constant))) ? 'equal' : 'different'
    }

    // infinite. The answer is read literally, as the equations u = f(…) in the unknowns and its parameters (new
    // letters): x = y, y = −y says y = 0, not "y is free". The unknowns' part of what those equations allow must be the
    // solution set: inside it, and as large (dimension n − rank).
    if (rA === n) return 'different'
    const rows: Linear[] = []
    for (const [u, t] of Object.entries(answer.values)) {
      const f = linearValue(t)
      if (!f) return 'unknown'
      const coef: Record<string, Rat> = {}
      for (const [k, c] of Object.entries(f.coef)) coef[k] = rNeg(c)
      coef[u] = rAdd(coef[u] ?? R0, R1)
      rows.push({ coef, constant: rNeg(f.constant) })
    }
    const params = [...new Set(rows.flatMap((r) => Object.keys(r.coef)))].filter((v) => !unknowns.includes(v)).sort()
    const family = affineSolutions(rows, [...unknowns, ...params])
    if (!family) return 'different'
    const at = (v: Rat[]): Rat[] => v.slice(0, n)
    const point = at(family.point)
    const directions = family.directions.map(at)
    for (const p of lin) {
      const value = unknowns.reduce((s, u, j) => rAdd(s, rMul(p.coef[u] ?? R0, point[j])), p.constant)
      if (!rIsZero(value)) return 'different'
      for (const d of directions) if (!rIsZero(unknowns.reduce((s, u, j) => rAdd(s, rMul(p.coef[u] ?? R0, d[j])), R0))) return 'different'
    }
    return (directions.length ? rank(directions) : 0) === n - rA ? 'equal' : 'different'
  } catch (err) {
    if (err instanceof NotExact) return 'unknown'
    throw err
  }
}

/** Guarded: an exception is 'unknown', never a crash at the caller. */
export const linearSystemCheck = safely(linearSystemCheckRaw, (): Verdict => 'unknown')

// Shared helpers for the S1d tests (simultaneous linear equations). Not a test file.
//
// The seeded systems are built backwards: a nonsingular matrix and a solution are drawn, and the right sides are the
// matrix times the solution, so the answer is known before any method runs. The textbook systems carry their lines,
// worked out by hand with the elimination rule (scale the first equation by |c₂|/g, the second by (c₁/g)·sign(c₂), then
// subtract; or add when the coefficients are opposite), written here without any method.

import type { Working } from '../../../src/renderer/src/math/steps/types'

export const LETTERS = ['x', 'y', 'z']

type Rng = () => number

/** A whole number in [−m, m]. */
function wholeIn(rng: Rng, m: number): number {
  return Math.floor(rng() * (2 * m + 1)) - m
}


/** The determinant of a 2×2 or 3×3 matrix of whole numbers. */
function determinant(a: number[][]): number {
  if (a.length === 2) return a[0][0] * a[1][1] - a[0][1] * a[1][0]
  return (
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0])
  )
}

/** One equation as the typed text: "2*x - 3*y = 7" (a zero coefficient is left out; the right side may be negative). */
function equationText(coefs: number[], rhs: number): string {
  let s = ''
  coefs.forEach((c, i) => {
    if (c === 0) return
    const mag = Math.abs(c)
    const body = mag === 1 ? LETTERS[i] : `${mag}*${LETTERS[i]}`
    if (s === '') s = c < 0 ? `-${body}` : body
    else s += c < 0 ? ` - ${body}` : ` + ${body}`
  })
  if (s === '') s = '0'
  return `${s} = ${rhs}`
}

/**
 * A seeded system of n equations in n letters, built backwards: a nonsingular matrix A, a solution s, and the right
 * sides A·s. Returns the typed text and the solution (whole numbers).
 */
export function systemOfRows(rng: Rng, n: number): { input: string; solution: number[] } {
  for (;;) {
    const A: number[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => wholeIn(rng, 9)))
    if (determinant(A) === 0) continue
    const solution = Array.from({ length: n }, () => wholeIn(rng, 9))
    const rhs = A.map((row) => row.reduce((acc, a, j) => acc + a * solution[j], 0))
    return { input: A.map((row, i) => equationText(row, rhs[i])).join(', '), solution }
  }
}

/** The ending a working ends in: 'solved', or the ending's op kind. */
export function endingOf(w: Working): string {
  const last = w.steps[w.steps.length - 1]
  if (last.kind !== 'SystemEq') return 'solved'
  const kind = (last.op as { kind?: string }).kind
  return kind === 'no-common-solution' || kind === 'infinitely-many' ? kind : 'solved'
}

interface TextbookSystem {
  input: string
  /** The line after each step, written out by hand. */
  lines: string[]
  /** How the system ends: 'solved', 'no-common-solution' or 'infinitely-many'. */
  ending: string
}

/** Twenty textbook systems in two letters: fifteen with one solution, two dependent, three inconsistent. */
export function textbookSystems(): TextbookSystem[] {
  return [
    { input: 'x + y = 5, x - y = 1', lines: ['x + y = 5, -2y = -4', 'x + y = 5, y = 2', 'x = 3, y = 2'], ending: 'solved' },
    {
      input: '2x + y = 7, x - y = 2',
      lines: ['2x + y = 7, 2x - 2y = 4', '2x + y = 7, -3y = -3', '2x + y = 7, y = 1', '2x = 6, y = 1', 'x = 3, y = 1'],
      ending: 'solved'
    },
    { input: 'x + 2y = 8, x - y = 2', lines: ['x + 2y = 8, -3y = -6', 'x + 2y = 8, y = 2', 'x = 4, y = 2'], ending: 'solved' },
    {
      input: '3x + y = 10, x - y = 2',
      lines: ['3x + y = 10, 3x - 3y = 6', '3x + y = 10, -4y = -4', '3x + y = 10, y = 1', '3x = 9, y = 1', 'x = 3, y = 1'],
      ending: 'solved'
    },
    {
      input: 'x + y = 4, 2x - y = 5',
      lines: ['2x + 2y = 8, 2x - y = 5', '2x + 2y = 8, -3y = -3', '2x + 2y = 8, y = 1', '2x = 6, y = 1', 'x = 3, y = 1'],
      ending: 'solved'
    },
    {
      input: '2x + 3y = 7, 4x + y = 9',
      lines: ['4x + 6y = 14, 4x + y = 9', '4x + 6y = 14, -5y = -5', '4x + 6y = 14, y = 1', '4x = 8, y = 1', 'x = 2, y = 1'],
      ending: 'solved'
    },
    {
      input: 'x - y = 1, x + y = 7',
      lines: ['x - y = 1, 2y = 6', 'x - y = 1, y = 3', 'x = 4, y = 3'],
      ending: 'solved'
    },
    {
      input: '3x - 2y = 4, x + 2y = 8',
      lines: ['3x - 2y = 4, 3x + 6y = 24', '3x - 2y = 4, 8y = 20', '3x - 2y = 4, y = 5/2', '3x = 9, y = 5/2', 'x = 3, y = 5/2'],
      ending: 'solved'
    },
    {
      input: 'x + y = 2, 2x + 2y = 4',
      lines: [
        '2x + 2y = 4, 2x + 2y = 4',
        '2x + 2y = 4, 0 = 0',
        '\\text{every pair of values on the line 2x + 2y = 4 works}'
      ],
      ending: 'infinitely-many'
    },
    {
      input: '2x + 4y = 6, x + 2y = 3',
      lines: [
        '2x + 4y = 6, 2x + 4y = 6',
        '2x + 4y = 6, 0 = 0',
        '\\text{every pair of values on the line 2x + 4y = 6 works}'
      ],
      ending: 'infinitely-many'
    },
    {
      input: 'x + y = 3, 2x + 2y = 7',
      lines: ['2x + 2y = 6, 2x + 2y = 7', '2x + 2y = 6, 0 = 1', '\\text{the equations have no common solution}'],
      ending: 'no-common-solution'
    },
    {
      input: '2x + y = 1, 4x + 2y = 5',
      lines: ['4x + 2y = 2, 4x + 2y = 5', '4x + 2y = 2, 0 = 3', '\\text{the equations have no common solution}'],
      ending: 'no-common-solution'
    },
    {
      input: 'x - 3y = 2, -2x + 6y = 1',
      lines: [
        '2x - 6y = 4, -2x + 6y = 1',
        '2x - 6y = 4, 2x - 6y = -1',
        '2x - 6y = 4, 0 = -5',
        '\\text{the equations have no common solution}'
      ],
      ending: 'no-common-solution'
    },
    {
      input: '2x + 3y = 12, 2x - y = 4',
      lines: ['2x + 3y = 12, -4y = -8', '2x + 3y = 12, y = 2', '2x = 6, y = 2', 'x = 3, y = 2'],
      ending: 'solved'
    },
    {
      input: 'x + 4y = 9, 3x + 2y = 7',
      lines: ['3x + 12y = 27, 3x + 2y = 7', '3x + 12y = 27, -10y = -20', '3x + 12y = 27, y = 2', '3x = 3, y = 2', 'x = 1, y = 2'],
      ending: 'solved'
    },
    {
      input: '5x + 2y = 16, x - 2y = 8',
      lines: ['5x + 2y = 16, 5x - 10y = 40', '5x + 2y = 16, -12y = 24', '5x + 2y = 16, y = -2', '5x = 20, y = -2', 'x = 4, y = -2'],
      ending: 'solved'
    },
    {
      input: 'x + y = 0, 2x - y = 9',
      lines: ['2x + 2y = 0, 2x - y = 9', '2x + 2y = 0, -3y = 9', '2x + 2y = 0, y = -3', '2x = 6, y = -3', 'x = 3, y = -3'],
      ending: 'solved'
    },
    {
      input: '4x + 3y = 1, x + y = 0',
      lines: ['4x + 3y = 1, 4x + 4y = 0', '4x + 3y = 1, y = -1', '4x = 4, y = -1', 'x = 1, y = -1'],
      ending: 'solved'
    },
    {
      input: '3x + y = 7, 2x + y = 5',
      lines: [
        '6x + 2y = 14, 2x + y = 5',
        '6x + 2y = 14, 6x + 3y = 15',
        '6x + 2y = 14, y = 1',
        '6x = 12, y = 1',
        'x = 2, y = 1'
      ],
      ending: 'solved'
    },
    {
      input: 'x - y = -1, 3x + 2y = 12',
      lines: ['3x - 3y = -3, 3x + 2y = 12', '3x - 3y = -3, 5y = 15', '3x - 3y = -3, y = 3', '3x = 6, y = 3', 'x = 2, y = 3'],
      ending: 'solved'
    }
  ]
}

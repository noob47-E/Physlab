// Determinants and inverses of a typed matrix, worked out step by step (the Calculator's = and Work it out).
//
// A 2 × 2 or 3 × 3 matrix of whole numbers or fractions is worked the way a textbook works it: the diagonal rule for a
// 2 × 2 determinant, expansion along the top row for a 3 × 3 (each minor shown), and the cofactors and the adjugate
// for an inverse. Every number is an exact fraction (rat.ts), never a decimal, because a student who reads 0.3333 where
// a third belongs cannot follow the next line.
//
// Nothing is shown unchecked. The determinant is checked a second way, by row reduction with exact fractions, and an
// inverse by multiplying it back into the matrix, which has to give the identity exactly. A check that does not agree
// gives no working at all, so the answer the other engines give stays as it was: a wrong working is never shown as
// checked.

import type { MathNode } from 'mathjs'
import { math, preprocess } from '../expr'
import { isConstant, parseExpr, tooManyDigits } from './mono'
import { R0, R1, rAdd, rDiv, rEq, rInv, rIsZero, rMul, rNeg, rStr, rSub, rTex, type Rat } from './rat'
import { Steps, type Working } from './work'

type Grid = Rat[][]

/** The title of a determinant working, and of an inverse working: the Calculator's check reads them to know a matrix working when it sees one. */
export const DETERMINANT_TITLE = 'Determinant'
export const INVERSE_TITLE = 'Inverse'

/** What a matrix with no inverse is given as: the working proves it, so it is the answer in place of mathjs's numbers. */
const NO_INVERSE_SENTENCE = 'This matrix has no inverse: its determinant is 0.'

const ORDINAL = ['first', 'second', 'third']

// ---------------------------------------------------------------------------------------------------------
// Reading the line
// ---------------------------------------------------------------------------------------------------------

/** The fields of a mathjs node this file reads. mathjs types them loosely, so they are read through this shape (as mono.ts does). */
interface Loose {
  type: string
  op?: string
  fn?: { name?: string }
  args?: Loose[]
  items?: Loose[]
  content?: Loose
  toString(): string
}

const loose = (n: MathNode): Loose => n as unknown as Loose

function unwrap(n: Loose): Loose {
  let cur = n
  while (cur.type === 'ParenthesisNode' && cur.content) cur = cur.content
  return cur
}

interface Request {
  job: 'det' | 'inv'
  literal: Loose
}

/** The matrix a line asks about, when the line is det(M), inv(M) or M^(-1) with M written out in brackets. */
function requestOf(node: MathNode): Request | null {
  const n = unwrap(loose(node))
  const name = n.type === 'FunctionNode' ? n.fn?.name : undefined
  if ((name === 'det' || name === 'inv') && n.args?.length === 1) return literalOf(name, n.args[0])
  // The x⁻¹ key on a matrix writes a power of −1, and for a matrix that power is its inverse.
  if (n.type === 'OperatorNode' && n.op === '^' && n.args?.length === 2 && unwrap(n.args[1]).toString().replace(/\s/g, '') === '-1') {
    return literalOf('inv', n.args[0])
  }
  return null
}

function literalOf(job: 'det' | 'inv', node: Loose): Request | null {
  const literal = unwrap(node)
  return literal.type === 'ArrayNode' ? { job, literal } : null
}

/**
 * One cell as an exact number: a whole number, a fraction or a decimal read as it was written. Anything else (a letter, i, π) is not.
 * The cell's text is the double mathjs made of it, which is the typed number only when it has at most 15 significant digits: requestFor
 * refuses a line with more, before any cell is read.
 */
function exactCell(cell: Loose): Rat | null {
  try {
    const e = parseExpr(cell.toString())
    if (e.length === 0) return R0
    if (e.length === 1 && isConstant(e)) return e[0].c
    return null
  } catch {
    return null
  }
}

/** The matrix as rows of exact numbers, when it is a square 2 × 2 or 3 × 3 and every cell is a number. */
function readGrid(literal: Loose): Grid | null {
  const rows = literal.items ?? []
  const n = rows.length
  if (n !== 2 && n !== 3) return null
  const grid: Grid = []
  for (const row of rows) {
    if (row.type !== 'ArrayNode') return null
    const cells = row.items ?? []
    if (cells.length !== n) return null
    const values: Rat[] = []
    for (const cell of cells) {
      const v = exactCell(cell)
      if (!v) return null
      values.push(v)
    }
    grid.push(values)
  }
  return grid
}

// ---------------------------------------------------------------------------------------------------------
// Arithmetic on exact grids, and the second way of getting a determinant
// ---------------------------------------------------------------------------------------------------------

const show = (r: Rat): string => rTex(r)

/** A number inside a product or a difference: a negative one in brackets, so its sign cannot be misread. */
const paren = (r: Rat): string => (r.n < 0n ? `(${rTex(r)})` : rTex(r))

const times = (a: Rat, b: Rat): string => `${paren(a)} \\times ${paren(b)}`

function matrixTex(env: 'pmatrix' | 'vmatrix', g: Grid): string {
  const rows = g.map((row) => row.map(show).join(' & ')).join(' \\\\ ')
  return `\\begin{${env}} ${rows} \\end{${env}}`
}
const pmat = (g: Grid): string => matrixTex('pmatrix', g)
const vmat = (g: Grid): string => matrixTex('vmatrix', g)

/** A sum written with its signs: 4 - 6 + 1, never 4 + -6. */
function sumTex(terms: Rat[]): string {
  return terms.map((t, i) => (i === 0 ? show(t) : t.n < 0n ? ` - ${show(rNeg(t))}` : ` + ${show(t)}`)).join('')
}

const det2 = (m: Grid): Rat => rSub(rMul(m[0][0], m[1][1]), rMul(m[0][1], m[1][0]))

/** The grid with row i and column j taken out: what is left of the matrix when a row and a column are crossed out. */
const minorOf = (g: Grid, i: number, j: number): Grid => g.filter((_, r) => r !== i).map((row) => row.filter((_, c) => c !== j))

const transpose = (g: Grid): Grid => g[0].map((_, j) => g.map((row) => row[j]))

function multiply(a: Grid, b: Grid): Grid {
  return a.map((row) => b[0].map((_, j) => row.reduce((sum, x, k) => rAdd(sum, rMul(x, b[k][j])), R0)))
}

const identityOf = (n: number): Grid => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? R1 : R0)))

const sameGrid = (a: Grid, b: Grid): boolean => a.every((row, i) => row.every((x, j) => rEq(x, b[i][j])))

/**
 * The determinant by row reduction, with exact fractions: swap rows for a zero pivot (each swap flips the sign), then
 * take the product of the pivots. It shares no step with the expansion the working shows, so agreeing with it is a real check.
 */
function detByElimination(g: Grid): Rat {
  const m = g.map((row) => [...row])
  const n = m.length
  let det = R1
  for (let k = 0; k < n; k++) {
    let p = k
    while (p < n && rIsZero(m[p][k])) p++
    if (p === n) return R0
    if (p !== k) {
      const swapped = m[p]
      m[p] = m[k]
      m[k] = swapped
      det = rNeg(det)
    }
    det = rMul(det, m[k][k])
    for (let i = k + 1; i < n; i++) {
      const f = rDiv(m[i][k], m[k][k])
      for (let j = k; j < n; j++) m[i][j] = rSub(m[i][j], rMul(f, m[k][j]))
    }
  }
  return det
}

// ---------------------------------------------------------------------------------------------------------
// The working
// ---------------------------------------------------------------------------------------------------------

/**
 * Adds the moves that work out the determinant of g and returns it. Null when a step does not agree with the row reduction:
 * the working is then not shown at all.
 */
function expandDet(g: Grid, s: Steps): Rat | null {
  if (g.length === 2) {
    const [[a, b], [c, d]] = g
    const ad = rMul(a, d)
    const bc = rMul(b, c)
    s.goal('Multiply the diagonals')
    s.add('Multiply the top-left number by the bottom-right number.', `${times(a, d)} = ${show(ad)}`, 'ad')
    s.add('Multiply the top-right number by the bottom-left number.', `${times(b, c)} = ${show(bc)}`, 'bc')
    const value = rSub(ad, bc)
    s.add('Take the second product away from the first.', `${show(ad)} - ${paren(bc)} = ${show(value)}`, 'ad - bc')
    return rEq(value, detByElimination(g)) ? value : null
  }

  // Expansion along the top row: each number times its minor, with the signs + − + across the row.
  const minors: Grid[] = [0, 1, 2].map((j) => minorOf(g, 0, j))
  const values: Rat[] = []
  s.goal('Find the minor of each top-row number')
  for (let j = 0; j < 3; j++) {
    const m = minors[j]
    const v = det2(m)
    // Each minor is checked on its own too, so a slip in one of the three cannot pass for the whole.
    if (!rEq(v, detByElimination(m))) return null
    s.add(
      `Cross out the top row and column ${j + 1}. What is left is the minor of the ${ORDINAL[j]} number.`,
      `M_{1${j + 1}} = ${vmat(m)} = ${times(m[0][0], m[1][1])} - ${times(m[0][1], m[1][0])} = ${show(v)}`
    )
    values.push(v)
  }
  s.goal('Multiply each top-row number by its minor, with signs plus, minus, plus')
  const terms: Rat[] = []
  for (let j = 0; j < 3; j++) {
    const prod = rMul(g[0][j], values[j])
    const term = j === 1 ? rNeg(prod) : prod
    const head = `Multiply the ${ORDINAL[j]} number of the top row by its minor${j === 1 ? ', and take the answer with a minus sign' : ''}.`
    s.add(head, j === 1 ? `-\\left(${times(g[0][j], values[j])}\\right) = ${show(term)}` : `${times(g[0][j], values[j])} = ${show(term)}`)
    terms.push(term)
  }
  const value = terms.reduce((a, b) => rAdd(a, b))
  s.add('Add the three terms.', `${sumTex(terms)} = ${show(value)}`)
  return rEq(value, detByElimination(g)) ? value : null
}

function determinantWorking(g: Grid): Working | null {
  const s = new Steps()
  const value = expandDet(g, s)
  if (value === null) return null
  return {
    title: DETERMINANT_TITLE,
    input: `\\det ${pmat(g)}`,
    method: g.length === 2 ? 'Diagonal products: ad − bc' : 'Expansion along the top row',
    moves: s.moves,
    answers: [{ label: 'det =', tex: show(value) }],
    check: `A second way, by row reduction with exact fractions, gives the same value: ${rStr(value)}.`,
    checked: 'ok'
  }
}

function inverseWorking(g: Grid): Working | null {
  const s = new Steps()
  const det = expandDet(g, s)
  if (det === null) return null
  const input = `${pmat(g)}^{-1}`
  // Nothing divides by a determinant of 0: the matrix has no inverse, and the working says so.
  if (rIsZero(det)) {
    s.add('The determinant is 0. An inverse would need division by 0, so this matrix has no inverse.', '\\det A = 0')
    return {
      title: INVERSE_TITLE,
      input,
      method: 'Determinant 0: no inverse',
      moves: s.moves,
      // No answer box: the sentence the working proves is its conclusion, and the Calculator's card says the same.
      answers: [],
      conclusion: NO_INVERSE_SENTENCE,
      check: 'No inverse (singular): the determinant is 0, so the matrix has no inverse.',
      checked: 'ok'
    }
  }
  const invDet = rInv(det)
  let adj: Grid
  if (g.length === 2) {
    const [[a, b], [c, d]] = g
    adj = [
      [d, rNeg(b)],
      [rNeg(c), a]
    ]
    s.goal('Make the adjugate')
    s.add('Swap the top-left and bottom-right numbers, and change the signs of the other two.', `\\operatorname{adj}A = ${pmat(adj)}`)
  } else {
    // The cofactor of each number is the determinant of what is left when its row and column are crossed out, with a
    // minus sign where its row plus column is odd. Each one is checked against the row reduction of its minor.
    const cof: Grid = []
    s.goal('Find the cofactor of each number')
    for (let i = 0; i < 3; i++) {
      const row: Rat[] = []
      for (let j = 0; j < 3; j++) {
        const m = minorOf(g, i, j)
        const v = det2(m)
        if (!rEq(v, detByElimination(m))) return null
        const negative = (i + j) % 2 === 1
        const c = negative ? rNeg(v) : v
        const shown = `${times(m[0][0], m[1][1])} - ${times(m[0][1], m[1][0])}`
        const at = `C_{${i + 1}${j + 1}}`
        const head = `Cofactor of the number in row ${i + 1}, column ${j + 1}: cross out its row and column, find the minor${negative ? ', and take it with a minus sign' : ''}.`
        s.add(head, negative ? `${at} = -${vmat(m)} = -\\left(${shown}\\right) = ${show(c)}` : `${at} = ${vmat(m)} = ${shown} = ${show(c)}`)
        row.push(c)
      }
      cof.push(row)
    }
    s.add('Put each cofactor in the place of its number: this is the matrix of cofactors.', pmat(cof))
    adj = transpose(cof)
    s.add('Turn the matrix of cofactors on its side, swapping rows and columns. This is the adjugate.', `\\operatorname{adj}A = ${pmat(adj)}`)
  }
  s.goal('Divide by the determinant')
  const X = adj.map((row) => row.map((x) => rMul(invDet, x)))
  s.add(`Multiply every number of the adjugate by 1 over the determinant (${rStr(det)}).`, `${show(invDet)} \\times ${pmat(adj)} = ${pmat(X)}`)
  // The inverse is checked by multiplying it back: A times the inverse must be the identity, exactly, or no working is shown.
  const product = multiply(g, X)
  if (!sameGrid(product, identityOf(g.length))) return null
  s.goal('Check by multiplying back')
  s.add('Multiply the matrix by this inverse. The identity matrix comes out, exactly.', `${pmat(g)} \\times ${pmat(X)} = ${pmat(product)}`)
  return {
    title: INVERSE_TITLE,
    input,
    method: g.length === 2 ? 'Swap and change signs, then divide by the determinant' : 'Adjugate, divided by the determinant',
    moves: s.moves,
    answers: [{ label: 'inverse =', tex: pmat(X) }],
    check: 'Checked: multiplying the matrix by this inverse gives the identity matrix exactly.',
    checked: 'ok'
  }
}

/**
 * The working for det(M), inv(M) or M^(-1) of a typed 2 × 2 or 3 × 3 matrix of numbers, or null when the line is not one or no
 * working can be shown soundly (a bigger matrix, a letter in it, a check that does not agree). A null leaves the answer as it was.
 */
export function matrixWorkingFor(src: string): Working | null {
  const request = requestFor(src)
  if (!request) return null
  const g = readGrid(request.literal)
  if (!g) return null
  try {
    return request.job === 'det' ? determinantWorking(g) : inverseWorking(g)
  } catch {
    return null
  }
}

/** Whether the line is a determinant or an inverse of a matrix written out, which the Calculator always gives a working. */
export function isMatrixLine(src: string): boolean {
  return requestFor(src) !== null
}

function requestFor(src: string): Request | null {
  try {
    const text = preprocess(src.trim())
    // The digit guard reads the text as it was typed. mathjs has already made each number a double by the time the tree is
    // read, and a double's text can be short when the typed number was not (99999999999999999999 reads back as 1 and zeros),
    // so a check on the tree would pass a number the working then gets wrong. A line with such a number has no working.
    if (tooManyDigits(text)) return null
    return requestOf(math.parse(text))
  } catch {
    return null
  }
}

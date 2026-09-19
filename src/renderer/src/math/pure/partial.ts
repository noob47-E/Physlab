// Partial fractions: taking one awkward fraction apart into the A/(x−1) + B/(x+2) pieces.
//
// Two methods are taught and both are shown where they apply: the cover-up rule, which is quick
// and only works for separate linear factors, and equating coefficients, which always works.

import { R0, R1, rDiv, rEq, rIsNeg, rIsZero, rMul, rNeg, rSub, rTex, rat, type Rat } from './rat'
import { NotPolynomial, exprTex, parseFraction, varsOf, type Expr } from './mono'
import {
  exprFromPoly,
  pAdd,
  pDeg,
  pDivMod,
  pEq,
  pEval,
  pIsZero,
  pLead,
  pMonomial,
  pNeg,
  pMul,
  pTex,
  pTexBracketed,
  pTrim,
  polyFromExpr,
  type Poly
} from './poly'
import { factorsOf } from './factor'
import { evalDisplayedSum } from './latexCheck'
import { Steps, failed, type Working } from './work'

const LETTERS = 'ABCDEFGHJKLMNP'.split('')

/** Solve a small exact linear system. Returns null when it has no single answer. */
function solveLinear(M: Rat[][], rhs: Rat[]): Rat[] | null {
  const n = M[0]?.length ?? 0
  const rows = M.map((r, i) => [...r, rhs[i]])
  let pivotRow = 0
  const where: number[] = new Array(n).fill(-1)
  for (let col = 0; col < n && pivotRow < rows.length; col++) {
    let sel = -1
    for (let r = pivotRow; r < rows.length; r++) {
      if (!rIsZero(rows[r][col])) {
        sel = r
        break
      }
    }
    if (sel < 0) continue
    ;[rows[pivotRow], rows[sel]] = [rows[sel], rows[pivotRow]]
    where[col] = pivotRow
    const p = rows[pivotRow][col]
    for (let c = col; c <= n; c++) rows[pivotRow][c] = rDiv(rows[pivotRow][c], p)
    for (let r = 0; r < rows.length; r++) {
      if (r === pivotRow || rIsZero(rows[r][col])) continue
      const f = rows[r][col]
      for (let c = col; c <= n; c++) rows[r][c] = rSub(rows[r][c], rMul(f, rows[pivotRow][c]))
    }
    pivotRow++
  }
  const out: Rat[] = new Array(n).fill(R0)
  for (let col = 0; col < n; col++) {
    if (where[col] < 0) return null // not pinned down
    out[col] = rows[where[col]][n]
  }
  // Every leftover row has to be 0 = 0, or the system contradicts itself.
  for (let r = pivotRow; r < rows.length; r++) if (!rIsZero(rows[r][n])) return null
  return out
}

interface Piece {
  base: Poly
  /** Which power of the base this piece sits over: 1, 2, … */
  j: number
  /** One unknown for a linear base, two for a quadratic. */
  unknowns: number[]
}

export function partialFractionsWorking(src: string): Working {
  const title = 'Partial fractions'
  let num: Expr
  let den: Expr
  try {
    const f = parseFraction(src)
    num = f.num
    den = f.den
  } catch (err) {
    return failed(title, src, err instanceof NotPolynomial ? err.message : 'I could not read that.')
  }

  const input = `\\dfrac{${exprTex(num)}}{${exprTex(den)}}`
  const vars = [...new Set([...varsOf(num), ...varsOf(den)])]
  if (vars.length === 0) return failed(title, input, 'There is no letter here, so there is nothing to split up.')
  if (vars.length > 1) return failed(title, input, `Partial fractions needs one letter, and this has ${vars.length} (${vars.join(', ')}).`)
  const name = vars[0]

  const { poly: N0 } = polyFromExpr(num, name)
  const { poly: D } = polyFromExpr(den, name)
  if (pIsZero(D)) return failed(title, input, 'The bottom is zero.')
  if (pDeg(D) === 0) return failed(title, input, 'The bottom has no letter in it, so this is not a fraction that needs splitting.')

  const s = new Steps()

  // Improper first: the whole-number part has to come out before anything else.
  let N = N0
  let whole: Poly = []
  if (pDeg(N) >= pDeg(D)) {
    const { q, r } = pDivMod(N, D)
    whole = q
    N = r
    s.add(
      `The top's power (${pDeg(N0)}) is not below the bottom's (${pDeg(D)}), so divide first and split only what is left over.`,
      `${input} = ${pTex(whole, name)} + \\dfrac{${pTex(N, name)}}{${pTex(D, name)}}`,
      '\\text{improper} \\Rightarrow \\text{divide out the whole part first}'
    )
    if (pIsZero(N)) {
      return {
        title,
        input,
        moves: s.moves,
        answers: [{ label: 'Answer', tex: pTex(whole, name) }],
        check: 'It divided exactly, so there is no fraction left to split.'
      }
    }
  }

  // Factorise the bottom.
  const rawFactors = factorsOf(exprFromPoly(D, name))
  let constant = R1
  const bases: Poly[] = []
  for (const f of rawFactors) {
    const { poly } = polyFromExpr(f, name)
    if (pDeg(poly) === 0) {
      constant = rMul(constant, poly[0] ?? R1)
      continue
    }
    if (pDeg(poly) > 2) {
      return failed(title, input, `The bottom has a factor of power ${pDeg(poly)} that I cannot break down further, so I cannot split this one.`)
    }
    bases.push(poly)
  }
  if (bases.length === 0) return failed(title, input, 'The bottom does not factorise, so it is already as simple as it gets.')

  // Gather repeats: (x+1)(x+1) becomes (x+1)².
  const grouped: { base: Poly; power: number }[] = []
  for (const b of bases) {
    const hit = grouped.find((g) => pEq(g.base, b))
    if (hit) hit.power++
    else grouped.push({ base: b, power: 1 })
  }

  const denTex = `${rTex(constant) === '1' ? '' : rTex(constant)}${grouped
    .map((g) => (g.power === 1 ? pTexBracketed(g.base, name) : `${pTexBracketed(g.base, name)}^{${g.power}}`))
    .join('')}`
  s.add('Factorise the bottom — that is what decides the shape of the answer.', `${pTex(D, name)} = ${denTex}`, '\\text{factorise the denominator}')

  // One unknown per linear piece, two per quadratic piece, one piece per power.
  const pieces: Piece[] = []
  let count = 0
  for (const g of grouped) {
    for (let j = 1; j <= g.power; j++) {
      const width = pDeg(g.base) // 1 → A, 2 → Ax + B
      pieces.push({ base: g.base, j, unknowns: Array.from({ length: width }, () => count++) })
    }
  }
  if (count > LETTERS.length) return failed(title, input, 'That needs more unknowns than I have letters for.')

  const numeratorTex = (p: Piece): string =>
    p.unknowns.length === 1
      ? LETTERS[p.unknowns[0]]
      : `${LETTERS[p.unknowns[0]]}${name} + ${LETTERS[p.unknowns[1]]}`
  const pieceTex = (p: Piece): string =>
    `\\dfrac{${numeratorTex(p)}}{${pTexBracketed(p.base, name)}${p.j > 1 ? `^{${p.j}}` : ''}}`

  const setup = pieces.map(pieceTex).join(' + ')
  s.add(
    `Each factor gets its own fraction. A linear factor takes a plain ${LETTERS[0]} on top; a quadratic one takes ${LETTERS[0]}${name} + ${LETTERS[1]}; a repeated factor gets one fraction for each power.`,
    `\\dfrac{${pTex(N, name)}}{${pTex(D, name)}} = ${setup}`,
    '\\text{one fraction per factor}'
  )

  // Multiply up and match coefficients.
  const contributions: Poly[] = []
  for (const p of pieces) {
    let rest = pTrim(D)
    for (let k = 0; k < p.j; k++) rest = pDivMod(rest, p.base).q
    for (let d = p.unknowns.length - 1; d >= 0; d--) {
      contributions[p.unknowns[d]] = pMul(pMonomial(p.unknowns.length - 1 - d), rest)
    }
  }
  s.add(
    'Multiply every term by the bottom, so the fractions disappear.',
    `${pTex(N, name)} = ${pieces
      .map((p) => {
        let rest = pTrim(D)
        for (let k = 0; k < p.j; k++) rest = pDivMod(rest, p.base).q
        return `\\left(${numeratorTex(p)}\\right)${pTexBracketed(rest, name)}`
      })
      .join(' + ')}`,
    '\\text{clear the denominators}'
  )

  const width = pDeg(D)
  const M: Rat[][] = []
  const rhs: Rat[] = []
  for (let k = 0; k < width; k++) {
    M.push(contributions.map((c) => c[k] ?? R0))
    rhs.push(N[k] ?? R0)
  }
  const sol = solveLinear(M, rhs)
  if (!sol) return failed(title, input, 'I could not pin the letters down — check that the fraction is written correctly.')

  // The cover-up rule, where it applies: it is the method students are expected to use.
  const allSimpleLinear = grouped.every((g) => g.power === 1 && pDeg(g.base) === 1)
  if (allSimpleLinear) {
    s.add(
      'Because every factor is different and linear, each letter can be read off directly: put in the value of ' +
        `${name} that makes one bracket zero, and the other terms vanish.`,
      undefined,
      '\\text{cover-up rule}'
    )
    for (const p of pieces) {
      const root = rDiv(rNeg(p.base[0] ?? R0), p.base[1])
      let rest = pTrim(D)
      rest = pDivMod(rest, p.base).q
      const top = pEval(N, root)
      const bottom = pEval(rest, root)
      s.add(
        `Put ${name} = ${rTex(root)} in, which kills every term except ${LETTERS[p.unknowns[0]]}.`,
        `${LETTERS[p.unknowns[0]]} = \\dfrac{${rTex(top)}}{${rTex(bottom)}} = ${rTex(rDiv(top, bottom))}`,
        `${name} = ${rTex(root)}`
      )
    }
  } else {
    s.add(
      'Multiply out and match the coefficient of each power on both sides — that gives one equation per power.',
      `\\begin{array}{rcl}\n${Array.from({ length: width }, (_, k) => {
        const lhs = M[k]
          .map((c, u) => (rIsZero(c) ? null : `${rTex(c) === '1' ? '' : rTex(c)}${LETTERS[u]}`))
          .filter(Boolean)
          .join(' + ')
        const power = k === 0 ? '\\text{units}' : k === 1 ? name : `${name}^{${k}}`
        return `${power} : & ${lhs || '0'} &= ${rTex(rhs[k])}`
      }).join(' \\\\\n')}\n\\end{array}`,
      '\\text{equate coefficients}'
    )
    s.add('Solve those equations together.', sol.map((v, i) => `${LETTERS[i]} = ${rTex(v)}`).join(',\\quad '))
  }

  // Each piece carries its own sign, built as it is made.
  //
  // This used to be a search-and-replace over the finished string, turning "+ \\dfrac{-" into
  // "- \\dfrac{". That negates the WHOLE fraction while only removing the minus from the first
  // term of its numerator, so (-x/2 + 1/2)/(x^2+1) was shown as -(x/2 + 1/2)/(x^2+1) — a different
  // expression, displayed under a green tick, because the check below looks at the coefficients
  // and never at the string the student actually reads.
  const shown = pieces
    .map((p) => {
      const tops = p.unknowns.map((u) => sol[u])
      const topPoly: Poly = pTrim(tops.slice().reverse())
      if (pIsZero(topPoly)) return null
      // A single negative term can be pulled out in front as a minus sign; a sum cannot, because
      // the minus would have to apply to every term in it.
      const single = topPoly.filter((c) => !rIsZero(c)).length === 1
      const negate = single && rIsNeg(pLead(topPoly))
      const top = negate ? pNeg(topPoly) : topPoly
      return {
        sign: negate ? ('-' as const) : ('+' as const),
        tex: `\\dfrac{${pTex(top, name)}}{${pTexBracketed(p.base, name)}${p.j > 1 ? `^{${p.j}}` : ''}}`
      }
    })
    .filter((x): x is { sign: '+' | '-'; tex: string } => x !== null)

  const head = pIsZero(whole) ? '' : pTex(whole, name)
  const answer = shown.reduce(
    (acc, piece, i) => (acc === '' && i === 0 ? (piece.sign === '-' ? `-${piece.tex}` : piece.tex) : `${acc} ${piece.sign} ${piece.tex}`),
    head
  )

  s.add('Put the values back into the fractions.', `${input} = ${answer}`)

  // Recombine and insist on the original before showing anything.
  let back: Poly = []
  for (const p of pieces) {
    let rest = pTrim(D)
    for (let k = 0; k < p.j; k++) rest = pDivMod(rest, p.base).q
    const tops = p.unknowns.map((u) => sol[u])
    const topPoly: Poly = pTrim(tops.slice().reverse())
    back = pAdd(back, pMul(topPoly, rest))
  }
  // Two checks on two different representations. The coefficient check proves the maths; the
  // display check proves that what the student is shown means the same thing. The old code only
  // had the first, which is exactly how a wrong answer got a green tick.
  // N0, not N: after an improper division N holds only the remainder, while the answer on screen
  // includes the whole part in front of the fractions.
  const ok = pEq(back, pTrim(N)) && displayedAgrees(answer, name, N0, D)

  return {
    title,
    input,
    method: allSimpleLinear ? 'Cover-up rule' : 'Equating coefficients',
    moves: s.moves,
    answers: [{ label: 'Answer', tex: answer }],
    check: ok
      ? `Adding the pieces back over a common denominator gives ${pTex(N, name)} on top — the original.`
      : 'Careful: adding the pieces back did not give the original. Treat this answer with suspicion.'
  }
}


/**
 * Does the answer as written mean the same as the question?
 *
 * Reads the displayed LaTeX back and compares it with num/den at several exact points. Poles are
 * skipped. A point that cannot be read at all counts as a failure, because an answer nobody can
 * parse is not one that has been checked.
 */
function displayedAgrees(answer: string, name: string, num: Poly, den: Poly): boolean {
  const probes = [rat(0n), rat(2n), rat(-3n), rat(1n, 2n), rat(5n)]
  let checked = 0
  for (const x of probes) {
    const d = pEval(den, x)
    if (rIsZero(d)) continue
    const want = rDiv(pEval(num, x), d)
    const got = evalDisplayedSum(answer, name, x)
    if (got === null) return false
    if (!rEq(got, want)) return false
    checked++
    if (checked >= 3) return true
  }
  return checked > 0
}

export { rat }

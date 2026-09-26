// Partial fractions: taking one awkward fraction apart into the A/(x−1) + B/(x+2) pieces.
//
// Two methods are taught and both are shown where they apply: the cover-up rule, which is quick
// and only works for separate linear factors, and equating coefficients, which always works.

import { R0, R1, commonDenominator, rDiv, rEq, rIsNeg, rIsZero, rMul, rNeg, rSub, rTex, rat, type Rat } from './rat'
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
  pOverTexSigned,
  pTexAt,
  pScale,
  pMul,
  pTex,
  pTexBracketed,
  pTrim,
  polyFromExpr,
  type Poly
} from './poly'
import { factorsOf } from './factor'
import { evalDisplayedSum } from './latexCheck'
import { Steps, failed, texToPlain, type Working } from './work'

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

/** ax² + bx + c with b² = 4ac is k(qx − p)²; the linear base and k, or null. */
function squaredLinear(poly: Poly): { base: Poly; k: Rat } | null {
  if (pDeg(poly) !== 2) return null
  const [c, b, a] = [poly[0] ?? R0, poly[1] ?? R0, poly[2]]
  if (!rIsZero(rSub(rMul(b, b), rMul(rat(4n), rMul(a, c))))) return null
  const root = rDiv(rNeg(b), rMul(rat(2n), a))
  // A root p/q gives the whole-number bracket (qx − p); what is left over is a number.
  const base: Poly = pTrim([rNeg(rat(root.n)), rat(root.d)])
  return { base, k: rDiv(a, rat(root.d * root.d)) }
}

/**
 * One piece of the answer with its sign pulled out and any fraction in its top cleared into the
 * bottom (Fix 4): (8/3)/(x − 1) is written 8/(3(x − 1)), never a fraction inside a fraction; and
 * a single factor below is not bracketed, A/(x − 1) not A/((x − 1)).
 */
function pieceOver(top: Poly, base: Poly, j: number, name: string): { sign: '+' | '-'; tex: string } {
  const k = commonDenominator(top)
  let whole = pScale(top, rat(k))
  const single = whole.filter((c) => !rIsZero(c)).length === 1
  const negate = single && rIsNeg(pLead(whole))
  if (negate) whole = pNeg(whole)
  // A bare letter (x, not 2x) can sit straight after a number: 3x², where 32x would misread.
  const plainBase = base.filter((c) => !rIsZero(c)).length === 1 && rEq(pLead(base), R1)
  const power = j > 1 ? `^{${j}}` : ''
  const below =
    k === 1n
      ? j > 1 || plainBase
        ? `${pTexBracketed(base, name)}${power}`
        : pTex(base, name)
      : plainBase
        ? `${k}${pTex(base, name)}${power}`
        : `${k}\\left(${pTex(base, name)}\\right)${power}`
  return { sign: negate ? '-' : '+', tex: `\\dfrac{${pTex(whole, name)}}{${below}}` }
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
    s.goal('Divide out the whole part').add(
      `The top's power (${pDeg(N0)}) is not below the bottom's (${pDeg(D)}), so divide first and split only what is left over.`,
      `${input} = ${pTex(whole, name)} ${pOverTexSigned(N, D, name)}`,
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
    // x² is x repeated, not a quadratic factor (Fix 4): the sentence promises "one fraction for
    // each power" of a repeated factor, and 1/(x²(x + 1)) used to come out as (−x + 1)/x² instead
    // of −1/x + 1/x². A quadratic with a double root is a linear factor squared.
    const twice = squaredLinear(poly)
    if (twice) {
      constant = rMul(constant, twice.k)
      bases.push(twice.base, twice.base)
      continue
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
  s.goal('Break the bottom into factors').add('Factorise the bottom — that is what decides the shape of the answer.', `${pTex(D, name)} = ${denTex}`, '\\text{factorise the denominator}')

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
    `\\dfrac{${numeratorTex(p)}}{${p.j > 1 ? `${pTexBracketed(p.base, name)}^{${p.j}}` : pTex(p.base, name)}}`

  const setup = pieces.map(pieceTex).join(' + ')
  s.goal('One fraction per factor').add(
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
  s.goal('Clear the fractions').add(
    'Multiply every term by the bottom, so the fractions disappear.',
    // What is left of the bottom is kept in its factors, the way it is written by hand:
    // "A(x + 2)", "Ax(x + 1)", "(Bx + C)(x − 1)" — not "(A)(x² + x)".
    // The bottom's number in front multiplies every piece, and its sign is written once per piece:
    // with a bottom of -(x - 2)(x + 1), "-A(x + 1) - B(x - 2)", not "-A(x + 1) + -B(x - 2)" (GLM #5).
    `${pTex(N, name)} = ${pieces
      .map((p, i) => {
        const size = rIsNeg(constant) ? rNeg(constant) : constant
        const sign = i === 0 ? (rIsNeg(constant) ? '-' : '') : rIsNeg(constant) ? ' - ' : ' + '
        const lead = `${sign}${rEq(size, R1) ? '' : rTex(size)}`
        const rest = grouped
          .map((g) => {
            const e = g.power - (pEq(g.base, p.base) ? p.j : 0)
            if (e <= 0) return ''
            const single = g.base.filter((c) => !rIsZero(c)).length === 1 && rEq(pLead(g.base), R1)
            return `${single ? pTex(g.base, name) : `\\left(${pTex(g.base, name)}\\right)`}${e > 1 ? `^{${e}}` : ''}`
          })
          .join('')
        const top = p.unknowns.length === 1 ? numeratorTex(p) : `\\left(${numeratorTex(p)}\\right)`
        return `${lead}${top}${rest}`
      })
      .join('')}`,
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
    s.goal('Find each letter').add(
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
      const L = LETTERS[p.unknowns[0]]
      // The substitution is shown, not just its result (Fix 4): "A = 8/3 = 8/3" said nothing about
      // where 8/3 came from. The value goes into the cleared identity, where every other letter's
      // bracket is zero, and the other brackets stay as factors so the student can see them.
      const others = pieces.filter((o) => o !== p)
      const lead = rEq(constant, R1) ? '' : rEq(constant, rNeg(R1)) ? '-' : rTex(constant)
      const restAt = others.map((o) => `\\left(${pTexAt(o.base, name, root)}\\right)`).join('')
      const coef = rEq(bottom, R1) ? '' : rEq(bottom, rNeg(R1)) ? '-' : rTex(bottom)
      const chain = [`${pTexAt(N, name, root)} = ${lead}${L}${restAt}`]
      if (!rEq(bottom, R1)) chain.push(`${rTex(top)} = ${coef}${L}`)
      chain.push(`${L} = ${rTex(rDiv(top, bottom))}`)
      s.add(`Put ${name} = ${texToPlain(rTex(root))} in, which kills every term except ${L}.`, chain.join(' \\;\\Rightarrow\\; '), `${name} = ${rTex(root)}`)
    }
  } else {
    s.goal('Find each letter').add(
      'Multiply out and match the coefficient of each power on both sides — that gives one equation per power.',
      `\\begin{array}{rcl}\n${Array.from({ length: width }, (_, k) => {
        // Each sign written once — "A - B", not "A + -1B" — and no space before the colon.
        const lhs = M[k]
          .map((c, u) => (rIsZero(c) ? null : { neg: rIsNeg(c), body: `${rEq(c, R1) || rEq(c, rNeg(R1)) ? '' : rTex(rIsNeg(c) ? rNeg(c) : c)}${LETTERS[u]}` }))
          .filter((t): t is { neg: boolean; body: string } => t !== null)
          .map((t, i) => (i === 0 ? `${t.neg ? '-' : ''}${t.body}` : `${t.neg ? '-' : '+'} ${t.body}`))
          .join(' ')
        const power = k === 0 ? '\\text{number}' : k === 1 ? name : `${name}^{${k}}`
        return `${power}: & ${lhs || '0'} &= ${rTex(rhs[k])}`
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
      // the minus would have to apply to every term in it. pieceOver does both.
      return pieceOver(topPoly, p.base, p.j, name)
    })
    .filter((x): x is { sign: '+' | '-'; tex: string } => x !== null)

  const head = pIsZero(whole) ? '' : pTex(whole, name)
  const answer = shown.reduce(
    (acc, piece, i) => (acc === '' && i === 0 ? (piece.sign === '-' ? `-${piece.tex}` : piece.tex) : `${acc} ${piece.sign} ${piece.tex}`),
    head
  )

  s.goal('Write the final answer').add('Put the values back into the fractions.', `${input} = ${answer}`)

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
      : 'Careful: adding the pieces back did not give the original. Treat this answer with suspicion.',
    checked: ok ? 'ok' : 'failed'
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

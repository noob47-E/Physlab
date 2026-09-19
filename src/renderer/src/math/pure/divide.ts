// Dividing one algebraic expression by another, long-division style.
//
// The working shows both the running commentary (divide, multiply, subtract, bring down) and the
// finished staircase, because students are marked on the staircase but learn from the commentary.

import { R0, rDiv, rIsNeg, rIsZero, rAbs, rNeg, rTex, type Rat } from './rat'
import { NotPolynomial, exprTex, exprTexBracketed, parseFraction, varsOf, type Expr } from './mono'
import {
  exprFromPoly,
  pDeg,
  pEval,
  pIsZero,
  pLead,
  pMonomial,
  pMul,
  pSub,
  pTex,
  pTexBracketed,
  pTrim,
  polyFromExpr,
  type Poly
} from './poly'
import { Steps, failed, type Working } from './work'

/** One term of a polynomial as it should appear inside a row of the staircase. */
const cell = (c: Rat, k: number, name: string, first: boolean): string => {
  if (rIsZero(c)) return ''
  const body = exprTex([{ c: rAbs(c), v: k === 0 ? {} : { [name]: k } }])
  if (first) return rIsNeg(c) ? `-${body}` : body
  return `${rIsNeg(c) ? '-' : '+'}\\,${body}`
}

/** Lay a polynomial out in columns by descending power, so rows line up under each other. */
function row(p: Poly, topDeg: number, name: string, lead = ''): string[] {
  const cells = new Array(topDeg + 2).fill('')
  cells[0] = lead
  let first = true
  for (let k = topDeg; k >= 0; k--) {
    const c = p[k] ?? R0
    if (rIsZero(c)) continue
    cells[topDeg - k + 1] = cell(c, k, name, first)
    first = false
  }
  return cells
}

export function divideWorking(src: string): Working {
  const title = 'Divide'
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
  if (den.length === 0) return failed(title, input, 'You cannot divide by zero.')
  const vars = [...new Set([...varsOf(num), ...varsOf(den)])]
  if (vars.length > 1) {
    return failed(title, input, `Long division needs one letter at a time, and this has ${vars.length} (${vars.join(', ')}).`)
  }
  if (vars.length === 0) return failed(title, input, 'Both parts are just numbers — the calculator will do that one.')

  const name = vars[0]
  const { poly: a } = polyFromExpr(num, name)
  const { poly: b } = polyFromExpr(den, name)
  if (pIsZero(b)) return failed(title, input, 'You cannot divide by zero.')
  if (pDeg(a) < pDeg(b)) {
    return {
      title,
      input,
      moves: [
        {
          head: 'The top has a lower power than the bottom, so the division stops before it starts.',
          rule: '\\deg(\\text{top}) < \\deg(\\text{bottom}) \\Rightarrow \\text{already a proper fraction}',
          tex: input
        }
      ],
      answers: [
        { label: 'Quotient', tex: '0' },
        { label: 'Remainder', tex: exprTex(num) }
      ],
      check: 'Nothing divides in, so the fraction is already in its simplest form.'
    }
  }

  const s = new Steps()
  const topDeg = pDeg(a)
  const rows: string[][] = [row(a, topDeg, name, '')]
  const quotient: Poly = new Array(pDeg(a) - pDeg(b) + 1).fill(R0)
  let rem = pTrim(a)
  let step = 0

  while (!pIsZero(rem) && pDeg(rem) >= pDeg(b)) {
    if (step++ > 64) break
    const shift = pDeg(rem) - pDeg(b)
    const factor = rDiv(pLead(rem), pLead(b))
    quotient[shift] = factor
    const piece = pMonomial(shift, factor)
    const product = pMul(piece, b)
    const next = pSub(rem, product)

    s.add(
      `Divide ${pTex(pMonomial(pDeg(rem), pLead(rem)), name)} by ${pTex(pMonomial(pDeg(b), pLead(b)), name)} to get ${pTex(piece, name)} — that is the next piece of the answer.`,
      `\\dfrac{${pTex(pMonomial(pDeg(rem), pLead(rem)), name)}}{${pTex(pMonomial(pDeg(b), pLead(b)), name)}} = ${pTex(piece, name)}`,
      '\\text{divide the leading terms}'
    )
    s.add(
      `Multiply ${pTexBracketed(piece, name)} by the divisor and subtract.`,
      `${pTexBracketed(rem, name)} - ${pTexBracketed(piece, name)}${pTexBracketed(b, name)} = ${pTexBracketed(next, name)}`,
      '\\text{multiply, then subtract}'
    )
    rows.push(row(product, topDeg, name, '-'))
    rows.push(row(next, topDeg, name, ''))
    rem = next
  }

  const q = pTrim(quotient)
  // The staircase, after the commentary, as the marker expects to see it.
  const cols = `r${new Array(topDeg + 1).fill('r').join('')}`
  const body = rows
    .map((r, i) => `${r.join(' & ')}${i > 0 && i % 2 === 1 ? ' \\\\ \\hline' : ' \\\\'}`)
    .join('\n')
  s.add(
    'Written out as the full division:',
    `\\begin{array}{r}\n\\text{quotient } ${pTex(q, name)} \\\\[4pt]\n\\end{array}\n\\begin{array}{${cols}}\n${body}\n\\end{array}`,
    `${pTexBracketed(b, name)} \\,\\overline{\\smash{)}\\,} ${pTexBracketed(a, name)}`
  )

  // Synthetic division is quicker and is on the syllabus, so it is offered when the divisor is x − a.
  if (pDeg(b) === 1 && b[1].n === 1n && b[1].d === 1n) {
    const root = rDiv(rNeg(b[0] ?? R0), b[1])
    s.add(
      `The divisor is ${pTex(b, name)}, so the remainder could have been read off in one line: put ${name} = ${rTex(root)} into the top.`,
      `f\\left(${rTex(root)}\\right) = ${rTex(pEval(a, root))}`,
      '\\text{remainder theorem: } f(a) = \\text{remainder}'
    )
  }

  const answers = [
    { label: 'Quotient', tex: pTex(q, name) },
    { label: 'Remainder', tex: pTex(rem, name) }
  ]
  if (!pIsZero(rem)) {
    answers.push({
      label: 'Altogether',
      tex: `${pTex(q, name)} + \\dfrac{${pTex(rem, name)}}{${pTex(b, name)}}`
    })
  }

  s.add(
    pIsZero(rem)
      ? `Nothing is left over, so ${exprTexBracketed(exprFromPoly(b, name))} divides exactly.`
      : `${pTex(rem, name)} is left over, and its power is now below the divisor's, so the division stops.`,
    pIsZero(rem)
      ? `${pTexBracketed(a, name)} = ${pTexBracketed(b, name)}${pTexBracketed(q, name)}`
      : `${pTexBracketed(a, name)} = ${pTexBracketed(b, name)}${pTexBracketed(q, name)} + ${pTex(rem, name)}`,
    '\\text{dividend} = \\text{divisor} \\times \\text{quotient} + \\text{remainder}'
  )

  return {
    title,
    input,
    method: 'Long division',
    moves: s.moves,
    answers,
    check: `${exprTex(exprFromPoly(pMul(b, q), name))}${pIsZero(rem) ? '' : ` + ${pTex(rem, name)}`} = ${exprTex(exprFromPoly(a, name))}`
  }
}

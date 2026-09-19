// HCF and LCM of algebraic expressions.
//
// Same idea as the whole-number version: factorise everything, then take the common factors at
// their lowest power for the HCF, and every factor at its highest power for the LCM. Showing the
// two side by side is the point — students routinely mix up which way round it goes.

import { R1, bgcd, blcm, rIsNeg, rIsOne, rMul, rNeg, rTex, rat, type Rat } from './rat'
import { NotPolynomial, exprTex, exprTexBracketed, isConstant, parseExpr, type Expr } from './mono'
import { factorsOf } from './factor'
import { Steps, failed, type Working } from './work'

interface Split {
  /** The plain number in front. */
  constant: Rat
  /** Each distinct bracket, and how many times it appears. */
  parts: { tex: string; expr: Expr; power: number }[]
}

/** Pull a sign out so (2 − x) and (x − 2) are recognised as the same factor. */
function orient(e: Expr): { expr: Expr; flipped: boolean } {
  if (e.length === 0 || !rIsNeg(e[0].c)) return { expr: e, flipped: false }
  return { expr: e.map((t) => ({ c: rNeg(t.c), v: t.v })), flipped: true }
}

function split(e: Expr): Split {
  let constant = R1
  const parts: Split['parts'] = []
  for (const f of factorsOf(e)) {
    if (isConstant(f)) {
      constant = rMul(constant, f[0]?.c ?? R1)
      continue
    }
    const { expr, flipped } = orient(f)
    if (flipped) constant = rNeg(constant)
    const tex = exprTex(expr)
    const hit = parts.find((p) => p.tex === tex)
    if (hit) hit.power++
    else parts.push({ tex, expr, power: 1 })
  }
  return { constant, parts }
}

const showSplit = (s: Split): string => {
  const num = rIsOne(s.constant) ? '' : rTex(s.constant)
  const body = s.parts.map((p) => `${exprTexBracketed(p.expr)}${p.power > 1 ? `^{${p.power}}` : ''}`).join('')
  return `${num}${body}` || '1'
}

/** HCF of the numeric parts: whole numbers use the ordinary rule. */
const numHcf = (rs: Rat[]): Rat => {
  if (!rs.every((r) => r.d === 1n)) return R1
  return rat(rs.reduce((a, r) => bgcd(a, r.n < 0n ? -r.n : r.n), 0n) || 1n)
}
const numLcm = (rs: Rat[]): Rat => {
  if (!rs.every((r) => r.d === 1n)) return rs.reduce((a, r) => rMul(a, r), R1)
  return rat(rs.reduce((a, r) => blcm(a, r.n < 0n ? -r.n : r.n), 1n))
}

function prepare(srcs: string[], title: string, symbol: string): { splits: Split[]; exprs: Expr[]; input: string } | Working {
  if (srcs.length < 2) return failed(title, srcs.join(', '), 'Give me at least two expressions, separated by a comma.')
  const exprs: Expr[] = []
  for (const src of srcs) {
    try {
      exprs.push(parseExpr(src))
    } catch (err) {
      return failed(title, srcs.join(', '), err instanceof NotPolynomial ? err.message : `I could not read "${src}".`)
    }
  }
  if (exprs.some((e) => e.length === 0)) return failed(title, srcs.join(', '), 'One of those comes to zero.')
  const input = `\\text{${symbol}}\\left(${exprs.map(exprTex).join(',\\; ')}\\right)`
  return { splits: exprs.map(split), exprs, input }
}

export function hcfAlgebraWorking(srcs: string[]): Working {
  const title = 'HCF'
  const prep = prepare(srcs, title, 'HCF')
  if (!('splits' in prep)) return prep
  const { splits, exprs, input } = prep
  const s = new Steps()

  s.add('Factorise every expression completely — the HCF can only be read off once they are in factors.', undefined, '\\text{factorise first}')
  splits.forEach((sp, i) => s.add(`Expression ${i + 1}:`, `${exprTex(exprs[i])} = ${showSplit(sp)}`))

  const constant = numHcf(splits.map((sp) => sp.constant))
  const common = splits[0].parts
    .map((p) => {
      const power = Math.min(...splits.map((sp) => sp.parts.find((q) => q.tex === p.tex)?.power ?? 0))
      return { ...p, power }
    })
    .filter((p) => p.power > 0)

  if (common.length === 0 && rIsOne(constant)) {
    s.add('No factor appears in every one of them, so they share nothing but 1.', '\\text{HCF} = 1')
    return { title, input, moves: s.moves, answers: [{ label: 'HCF =', tex: '1' }], check: 'These expressions have no common factor.' }
  }

  s.add(
    'Keep only the factors that appear in every expression, each at its lowest power.',
    showSplit({ constant, parts: common }),
    '\\text{HCF: common factors, } \\min \\text{ power}'
  )
  const answer = showSplit({ constant, parts: common })
  return {
    title,
    input,
    method: 'Factorise, then take the common factors',
    moves: s.moves,
    answers: [{ label: 'HCF =', tex: answer }],
    check: `Every expression above contains ${answer}.`
  }
}

export function lcmAlgebraWorking(srcs: string[]): Working {
  const title = 'LCM'
  const prep = prepare(srcs, title, 'LCM')
  if (!('splits' in prep)) return prep
  const { splits, exprs, input } = prep
  const s = new Steps()

  s.add('Factorise every expression completely.', undefined, '\\text{factorise first}')
  splits.forEach((sp, i) => s.add(`Expression ${i + 1}:`, `${exprTex(exprs[i])} = ${showSplit(sp)}`))

  const constant = numLcm(splits.map((sp) => sp.constant))
  const all: Split['parts'] = []
  for (const sp of splits) {
    for (const p of sp.parts) {
      const hit = all.find((q) => q.tex === p.tex)
      if (hit) hit.power = Math.max(hit.power, p.power)
      else all.push({ ...p })
    }
  }

  s.add(
    'Take every factor that appears anywhere, each at its highest power.',
    showSplit({ constant, parts: all }),
    '\\text{LCM: all factors, } \\max \\text{ power}'
  )
  const answer = showSplit({ constant, parts: all })
  return {
    title,
    input,
    method: 'Factorise, then take every factor',
    moves: s.moves,
    answers: [{ label: 'LCM =', tex: answer }],
    check: `${answer} divides by every expression above.`
  }
}

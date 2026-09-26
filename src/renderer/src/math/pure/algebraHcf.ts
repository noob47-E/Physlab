// HCF and LCM of algebraic expressions.
//
// Same idea as the whole-number version: factorise everything, then take the common factors at
// their lowest power for the HCF, and every factor at its highest power for the LCM. Showing the
// two side by side is the point — students routinely mix up which way round it goes.

import { R1, bgcd, blcm, rIsNeg, rIsOne, rMul, rNeg, rTex, rat, type Rat } from './rat'
import { NotPolynomial, constExpr, eEq, eMul, ePow, exprTex, exprTexBracketed, isConstant, parseExpr, varExpr, type Expr } from './mono'
import { factorsOf } from './factor'
import { Steps, failed, texToPlain, type Working } from './work'

/** One repeated factor: the thing being raised to a power, and the power. */
interface SplitPart {
  /** What makes two factors "the same": a variable name, or a bracket's tidied-up LaTeX. */
  key: string
  atom: Expr
  power: number
}

interface Split {
  /** The plain number in front. */
  constant: Rat
  parts: SplitPart[]
}

/** Pull a sign out so (2 − x) and (x − 2) are recognised as the same factor. */
function orient(e: Expr): { expr: Expr; flipped: boolean } {
  if (e.length === 0 || !rIsNeg(e[0].c)) return { expr: e, flipped: false }
  return { expr: e.map((t) => ({ c: rNeg(t.c), v: t.v })), flipped: true }
}

/**
 * Break an expression into a number and a list of powers.
 *
 * Factors used to be matched by their exact LaTeX, which meant x^2 and x^3 looked like two
 * unrelated things and hcf(x^2, x^3) came out as 1. A monomial is therefore pulled apart here:
 * its coefficient joins the number in front, and each letter becomes its own part carrying its
 * exponent, so the min/max logic below can compare powers of the same letter.
 */
function split(e: Expr): Split {
  let constant = R1
  const parts: SplitPart[] = []
  const merge = (key: string, atom: Expr, power: number): void => {
    const hit = parts.find((p) => p.key === key)
    if (hit) hit.power += power
    else parts.push({ key, atom, power })
  }

  for (const f of factorsOf(e)) {
    if (isConstant(f)) {
      constant = rMul(constant, f[0]?.c ?? R1)
      continue
    }
    if (f.length === 1) {
      // A single term: 12x^3 is 12 and x to the third, not one indivisible lump.
      const t = f[0]
      constant = rMul(constant, t.c)
      for (const name of Object.keys(t.v)) {
        if (t.v[name] > 0) merge(name, varExpr(name), t.v[name])
      }
      continue
    }
    const { expr, flipped } = orient(f)
    if (flipped) constant = rNeg(constant)
    merge(exprTex(expr), expr, 1)
  }
  return { constant, parts }
}

/** The split multiplied back together, so it can be compared with what was typed. */
const rebuild = (s: Split): Expr => s.parts.reduce((acc, p) => eMul(acc, ePow(p.atom, p.power)), constExpr(s.constant))

/**
 * Every split has to multiply back to its expression: the min/max of the powers is bookkeeping
 * that cannot go wrong, but the factorisation each split was read from can.
 */
const splitsAgree = (splits: Split[], exprs: Expr[]): boolean => splits.every((sp, i) => eEq(rebuild(sp), exprs[i]))

const SUSPECT = 'Careful: one of the factorisations does not multiply back to its expression. Treat this answer with suspicion.'

const showSplit = (s: Split): string => {
  const num = rIsOne(s.constant) ? '' : rTex(s.constant)
  // exprTexBracketed already leaves a single term unbracketed, so x^2 does not become (x)^2.
  const body = s.parts.map((p) => `${exprTexBracketed(p.atom)}${p.power > 1 ? `^{${p.power}}` : ''}`).join('')
  return `${num}${body}` || '1'
}

/** HCF of the numeric parts: hcf of the tops over lcm of the bottoms, so fractions work too. */
const numHcf = (rs: Rat[]): Rat => {
  const nz = rs.filter((r) => r.n !== 0n)
  if (!nz.length) return R1
  const n = nz.reduce((a, r) => bgcd(a, r.n < 0n ? -r.n : r.n), 0n) || 1n
  const d = nz.reduce((a, r) => blcm(a, r.d), 1n)
  return rat(n, d)
}
/** LCM of the numeric parts: lcm of the tops over hcf of the bottoms. */
const numLcm = (rs: Rat[]): Rat => {
  const nz = rs.filter((r) => r.n !== 0n)
  if (!nz.length) return R1
  const n = nz.reduce((a, r) => blcm(a, r.n < 0n ? -r.n : r.n), 1n)
  const d = nz.reduce((a, r) => bgcd(a, r.d), 0n) || 1n
  return rat(n, d)
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

  s.goal('Factorise every expression').add('Take out common factors and split each expression as far as it goes — the HCF can only be read off once they are in factors.', undefined, '\\text{factorise first}')
  splits.forEach((sp, i) => s.add(`Factorise ${texToPlain(exprTex(exprs[i]))}.`, `${exprTex(exprs[i])} = ${showSplit(sp)}`))

  const constant = numHcf(splits.map((sp) => sp.constant))
  const common = splits[0].parts
    .map((p) => {
      const power = Math.min(...splits.map((sp) => sp.parts.find((q) => q.key === p.key)?.power ?? 0))
      return { ...p, power }
    })
    .filter((p) => p.power > 0)

  if (common.length === 0 && rIsOne(constant)) {
    s.goal('Look for a shared factor').add('No factor appears in every one of them, so they share nothing but 1.', '\\text{HCF} = 1')
    const ok = splitsAgree(splits, exprs)
    return { title, input, moves: s.moves, answers: [{ label: 'HCF =', tex: '1' }], check: ok ? 'These expressions have no common factor.' : SUSPECT, checked: ok ? 'ok' : 'failed' }
  }

  s.goal('Keep the shared factors').add(
    'Keep only the factors that appear in every expression, each at its lowest power.',
    showSplit({ constant, parts: common }),
    '\\text{HCF: common factors, } \\min \\text{ power}'
  )
  const answer = showSplit({ constant, parts: common })
  const ok = splitsAgree(splits, exprs)
  return {
    title,
    input,
    method: 'Factorise, then take the common factors',
    moves: s.moves,
    answers: [{ label: 'HCF =', tex: answer }],
    check: ok ? `Every factorisation above multiplies back to its expression, and each one contains ${answer}.` : SUSPECT,
    checked: ok ? 'ok' : 'failed'
  }
}

export function lcmAlgebraWorking(srcs: string[]): Working {
  const title = 'LCM'
  const prep = prepare(srcs, title, 'LCM')
  if (!('splits' in prep)) return prep
  const { splits, exprs, input } = prep
  const s = new Steps()

  s.goal('Factorise every expression').add('Take out common factors and split each expression as far as it goes — the LCM is built from those factors.', undefined, '\\text{factorise first}')
  splits.forEach((sp, i) => s.add(`Factorise ${texToPlain(exprTex(exprs[i]))}.`, `${exprTex(exprs[i])} = ${showSplit(sp)}`))

  const constant = numLcm(splits.map((sp) => sp.constant))
  const all: SplitPart[] = []
  for (const sp of splits) {
    for (const p of sp.parts) {
      const hit = all.find((q) => q.key === p.key)
      if (hit) hit.power = Math.max(hit.power, p.power)
      else all.push({ ...p })
    }
  }

  s.goal('Take every factor you see').add(
    'Take every factor that appears anywhere, each at its highest power.',
    showSplit({ constant, parts: all }),
    '\\text{LCM: all factors, } \\max \\text{ power}'
  )
  const answer = showSplit({ constant, parts: all })
  const ok = splitsAgree(splits, exprs)
  return {
    title,
    input,
    method: 'Factorise, then take every factor',
    moves: s.moves,
    answers: [{ label: 'LCM =', tex: answer }],
    check: ok ? `Every factorisation above multiplies back to its expression, and ${answer} divides by each one.` : SUSPECT,
    checked: ok ? 'ok' : 'failed'
  }
}

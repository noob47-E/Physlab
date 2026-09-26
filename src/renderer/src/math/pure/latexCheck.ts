// Reading a displayed answer back, so it can be checked as written.
//
// "Nothing is shown until it has been checked" is only true if the check looks at the thing the
// student reads. A partial-fractions answer was once verified by recombining its internal
// coefficients while the LaTeX beside the green tick said something else entirely — the numbers
// were right and the formula was wrong, which is the worst possible combination.
//
// This is deliberately narrow: it reads the shape the Pure Math tools produce, a sum of \dfrac
// pieces with an optional whole part in front, and refuses anything it does not recognise rather
// than guessing. Refusing is safe; guessing would put the tick back on an unchecked answer.

import { R0, rAdd, rDiv, rIsZero, type Rat } from './rat'
import { NotPolynomial, evalAt, parseExpr } from './mono'
import { latexToMath } from '../latexToMath'

/** One term of a displayed sum. `den` is null for a whole-number part written without a fraction. */
export interface DisplayedTerm {
  sign: 1 | -1
  num: string
  den: string | null
}

/** The body of a `{...}` group starting at `open`, and the index just past its closing brace. */
function readGroup(s: string, open: number): { body: string; end: number } | null {
  if (s[open] !== '{') return null
  let depth = 0
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}') {
      depth--
      if (depth === 0) return { body: s.slice(open + 1, i), end: i + 1 }
    }
  }
  return null
}

const FRAC = /\\[dt]?frac\s*\{/

/**
 * Split a displayed sum into its signed terms. Returns null when the string is not the simple
 * shape this understands.
 */
export function splitDisplayedSum(latex: string): DisplayedTerm[] | null {
  const out: DisplayedTerm[] = []
  let rest = latex.trim()
  let sign: 1 | -1 = 1

  // A leading minus applies to the first term.
  if (rest.startsWith('-')) {
    sign = -1
    rest = rest.slice(1).trim()
  }

  let guard = 0
  while (rest.length > 0) {
    if (guard++ > 64) return null

    const m = FRAC.exec(rest)
    if (m && m.index === 0) {
      const open = m.index + m[0].length - 1
      const top = readGroup(rest, open)
      if (!top) return null
      const bottom = readGroup(rest, top.end)
      if (!bottom) return null
      out.push({ sign, num: top.body, den: bottom.body })
      rest = rest.slice(bottom.end).trim()
    } else {
      // A whole part in front: everything up to the next top-level + or - that starts a new term.
      const cut = m ? m.index : rest.length
      let head = rest.slice(0, cut)
      const trail = head.match(/([+-])\s*$/)
      let nextSign: 1 | -1 = 1
      if (trail) {
        nextSign = trail[1] === '-' ? -1 : 1
        head = head.slice(0, head.length - trail[0].length)
      }
      if (head.trim()) out.push({ sign, num: head.trim(), den: null })
      if (cut === rest.length) return out
      sign = nextSign
      rest = rest.slice(cut).trim()
      continue
    }

    // Between terms there must be a + or a -.
    if (rest.length === 0) break
    const op = rest[0]
    if (op !== '+' && op !== '-') return null
    sign = op === '-' ? -1 : 1
    rest = rest.slice(1).trim()
  }
  return out.length ? out : null
}

/** One fragment of displayed LaTeX, evaluated exactly. null when it cannot be read. */
function evalFragment(latex: string, name: string, at: Rat): Rat | null {
  try {
    const src = latexToMath(latex).trim()
    if (!src) return null
    return evalAt(parseExpr(src), { [name]: at })
  } catch (err) {
    if (err instanceof NotPolynomial) return null
    return null
  }
}

/**
 * Evaluate a displayed sum of fractions at one exact value.
 * null when the string cannot be read, or when a denominator is zero there.
 */
export function evalDisplayedSum(latex: string, name: string, at: Rat): Rat | null {
  const terms = splitDisplayedSum(latex)
  if (!terms) return null
  let total = R0
  for (const t of terms) {
    const top = evalFragment(t.num, name, at)
    if (top === null) return null
    let value = top
    if (t.den !== null) {
      const bottom = evalFragment(t.den, name, at)
      if (bottom === null || rIsZero(bottom)) return null
      value = rDiv(top, bottom)
    }
    total = rAdd(total, t.sign === -1 ? { n: -value.n, d: value.d } : value)
  }
  return total
}

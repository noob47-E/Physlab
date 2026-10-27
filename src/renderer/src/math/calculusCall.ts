// The calculus a textbook writes, as the converter reads it.
//
// latexToMath turns d/dx(f) into `diff(f, x)`, ∫ f dx into `integrate(f, x)` and ∫ₐᵇ f dx into
// `integral(f, a, b)`. Two screens need to know that such a line IS a derivative or an integral: the
// Maths screen's = (which answers it) and Work it out (which has to pick Differentiate or Integrate
// by itself, where it used to factorise the first and divide the second). One reader, so the two agree.

import { splitArgs } from './expr'

type CalculusName = 'diff' | 'integrate' | 'integral'

interface CalculusCall {
  name: CalculusName
  /** The arguments in the order written: diff(f, x), integrate(f, x), integral(f, a, b). */
  args: string[]
}

/** One name for a letter to work by: a Latin letter, or a Greek one spelt out as the converter does. */
const LETTER = /^(?:[A-Za-z]|alpha|beta|gamma|delta|theta|lambda|mu|tau|sigma|rho|psi|phi|omega|[Ͱ-Ͽ])$/

/**
 * Whether the text inside a call's brackets is the whole call: the bracket opened before it closes at
 * the very end. `diff(a) + diff(b)` starts with diff( and ends with ), but it is a sum of two calls.
 */
function wholeCall(inner: string): boolean {
  let depth = 0
  for (const ch of inner) {
    if (ch === '(') depth++
    else if (ch === ')' && --depth < 0) return false
  }
  return depth === 0
}

/**
 * The line as a derivative or an integral of its own, or null for anything else (a sum that has a
 * derivative in it, a matrix `diff([1, 4, 9])`, a call with the wrong shape). The shapes are the ones the
 * converter writes, and the ones the command bar writes: diff(f), diff(f, t), integrate(f), integrate(f, t),
 * integrate(f, a, b) and integral(f, a, b).
 */
export function calculusCall(src: string): CalculusCall | null {
  const m = /^(diff|derivative|integrate|integral)\(([\s\S]*)\)$/.exec(src.trim())
  if (!m || !wholeCall(m[2])) return null
  const rawName = m[1]
  const name: CalculusName = rawName === 'derivative' ? 'diff' : (rawName as CalculusName)
  const args = splitArgs(m[2])
  const n = args.length
  // diff([1, 4, 9]) is the differences of a list, a different function with the same name.
  if (args[0] === undefined || args[0].startsWith('[')) return null
  if (name === 'diff') return n === 1 || (n === 2 && LETTER.test(args[1])) ? { name, args } : null
  if (name === 'integrate') {
    if (n === 1 || (n === 2 && LETTER.test(args[1])) || n === 3) return { name, args }
    if (n === 4 && LETTER.test(args[1])) return { name, args }
    return null
  }
  return n === 3 ? { name, args } : null
}

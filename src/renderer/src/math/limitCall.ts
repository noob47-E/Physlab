// A limit as the calculator's linear text: lim(f, x, a) for a limit at a point, lim(f, x, a, 1) for x coming to a
// from above and lim(f, x, a, -1) for x coming to a from below. The Maths field's converter writes \lim_{x\to a} f
// this way (math/latexToMath.ts), and the "=" card and Work it out both read the same text here, so they cannot
// disagree about what a line asks.
//
// Not the command bar's limit(f, a): that is a bar command with its own reader and never reaches this one.

import { math, preprocess, splitArgs } from './expr'

export interface LimitCall {
  /** The expression the limit is of, as linear text. */
  body: string
  /** The letter that tends to the point, as written (x). */
  variable: string
  /** The point: a number, Infinity or -Infinity. NaN when the point is not a number, which the working refuses in words. */
  point: number
  /** 0 for both sides, 1 for x coming from above, −1 for x coming from below. */
  side: 0 | 1 | -1
  /** The "= …" after the limit, as linear text: what the line says the limit is. Absent when there is no "=". */
  claimed?: string
}

/** The index of the bracket that closes the one opened at `open`, or -1 when it is never closed. */
function closingBracket(text: string, open: number): number {
  let depth = 0
  for (let k = open; k < text.length; k++) {
    if (text[k] === '(') depth++
    else if (text[k] === ')' && --depth === 0) return k
  }
  return -1
}

/** The point as a number: an ordinary number, Infinity or -Infinity; NaN for anything else. */
function pointOf(text: string): number {
  try {
    const v = math.evaluate(preprocess(text))
    return typeof v === 'number' ? v : NaN
  } catch {
    return NaN
  }
}

/** The limit the linear text asks for, or null when it is not a lim(…) line at all. */
export function limitCall(src: string): LimitCall | null {
  const s = src.trim()
  if (!s.startsWith('lim(')) return null
  const close = closingBracket(s, 3)
  if (close < 0) return null
  const rest = s.slice(close + 1).trim()
  let claimed: string | undefined
  if (rest !== '') {
    if (!rest.startsWith('=')) return null
    claimed = rest.slice(1).trim()
    if (claimed === '') return null
  }
  const args = splitArgs(s.slice(4, close))
  if (args.length < 3 || args.length > 4 || args[0] === '') return null
  const side = args[3] === undefined ? 0 : Number(args[3])
  if (side !== 0 && side !== 1 && side !== -1) return null
  return { body: args[0], variable: args[1], point: pointOf(args[2]), side: side as 0 | 1 | -1, ...(claimed === undefined ? {} : { claimed }) }
}

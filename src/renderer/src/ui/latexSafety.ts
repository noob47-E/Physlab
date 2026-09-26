// Is this string safe to write into a maths field?
//
// MathLive reads whatever it is handed as LaTeX. PhysLab also carries expressions in its own
// linear form — x^(2), (a)/(b), sqrt(x) — and the two look similar enough that they got mixed up:
// the Working panel wrote the linear form back into the field, so pressing a button turned the
// student's 6x² + 7x − 3 into 6x^(2) + 7x − 3 with a stray bracket on screen.
//
// Pure and DOM-free, so the rule can be asserted in a test instead of being a thing to remember.

/** A linear-syntax fragment, and how to say what is wrong with it. */
const SIGNS: { re: RegExp; what: string }[] = [
  { re: /\^\s*\(/, what: 'a power written with brackets, ^( — LaTeX wants ^{ }' },
  { re: /(^|[^\\])\*/, what: 'a * for multiply — LaTeX has no *' },
  { re: /(^|[^a-zA-Z\\])(sqrt|nthRoot|integral|sigma|abs)\s*\(/, what: 'a function written without its backslash' },
  { re: /[°∠×·]/, what: 'a symbol from the linear notation (° ∠ × ·)' }
]

/** A slash that is not inside a \frac is linear division rather than LaTeX. */
function looseSlash(s: string): boolean {
  if (!s.includes('/')) return false
  // \frac and friends never contain a bare slash, so any slash at all is the linear form.
  return !/\\[dt]?frac/.test(s)
}

/**
 * Every reason this string is not safe as LaTeX. Empty when it is fine.
 * Returning reasons rather than a bare boolean makes a failing test say what it found.
 */
export function linearSyntaxIn(s: string): string[] {
  const out: string[] = []
  for (const { re, what } of SIGNS) if (re.test(s)) out.push(what)
  if (looseSlash(s)) out.push('a / for divide outside a \\frac')
  return out
}

export const isFieldSafeLatex = (s: string): boolean => linearSyntaxIn(s).length === 0

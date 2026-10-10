// PhysLab's spelling to SymPy's, and SymPy's answers back to PhysLab's. Only what is SymPy's or
// Python's own lives here; the rest of the spelling (Greek letters spelt out, a function name
// glued to a letter taken apart) is PhysLab's reading, done before a request is made.

/** lambda is a word Python keeps for itself, so SymPy spells the letter lamda (and prints it \lambda). */
const pySpelling = (s: string): string => s.replace(/\blambda\b/g, 'lamda')

/**
 * Infinity as the worker reads it. The Maths field turns ∞ into mathjs's `Infinity`, a name SymPy
 * does not know, so its parser split it into the letters I·n·f·i·n·i·t·y (i being √−1) and
 * ∫₀^∞ e^(−x) dx came back as 1 − e^(i f n² t y). SymPy spells infinity `oo`.
 */
const infinitySpelling = (s: string): string => s.replace(/\bInfinity\b|∞/g, 'oo')

/** A request's expression, equation, letter or bound as the worker's parser reads it. */
export const toSymPy = (s: string): string => infinitySpelling(pySpelling(s))

/**
 * An answer's plain form in PhysLab's spelling, readable by PhysLab's own reader: x**2 is x^2,
 * E is e, I is i, oo is Infinity, zoo (complex infinity) is NaN, which is what it is as a number,
 * and log is ln: SymPy's log is the natural log, PhysLab's log is base 10.
 */
export const fromSymPyText = (s: string): string =>
  s
    .replace(/\*\*/g, '^')
    .replace(/\bzoo\b/g, 'NaN')
    .replace(/\boo\b/g, 'Infinity')
    .replace(/\bE\b/g, 'e')
    .replace(/\bI\b/g, 'i')
    .replace(/\blamda\b/g, 'lambda')
    .replace(/\blog\(/g, 'ln(')

// How an answer's label is written for the student.
//
// The pure-maths engine names an answer in a plain string: "x_1 =", "theta_2 =", "Quotient", "HCF =".
// math/pure/complex.ts builds a quadratic's labels that way on purpose, because the command bar's own
// label() (lang/commands.ts) reads the underscore and turns it into TeX. That format must not change.
// The Working panel has to do the same job, but it showed the string as it came, so a student read
// "x_1 =" where a textbook writes x₁ =, and Copy put "x_1" on the clipboard.
//
// The decision lives here, apart from React, so it can be tested without a screen:
//   labelTex(label)       TeX for a symbol label, the trailing "=" included, or null for a word, which the
//                         panel keeps as plain text. A symbol is the name of an unknown as the engine
//                         writes it: a letter (x =, z), a Greek name (theta =), or any name with a
//                         subscript number (x_1 =, theta_2 =, speed_1 =). The command bar draws a bare
//                         letter as maths too, so the panel and the bar agree.
//   labelText(label)      the label as plain characters, subscripts as Unicode ("x₁ =", "θ₂ ="), for Copy.
//                         A label that is not a symbol, or a plain letter with nothing to convert, comes
//                         back unchanged.
//   answerCopyLine(a)     the line Copy writes for one answer.
//
// A word is everything else: Answer, Quotient, "HCF =", "As a decimal", "12 =", "P(Z < 1.96)", and any label
// already written with Unicode (x₁, θ₂ =), which must not be converted twice. A name of two or more letters
// with no subscript ("speed =") is a word too: nothing tells it from "HCF =", and the bar draws both
// upright, as text, anyway.
//
// tests/answerLabels.test.ts pins what each must do.

/**
 * The Greek names the expression parser spells out (θ → theta), with the letter Copy writes for each.
 * lang/commands.ts keeps the same 22 names for the bar and does not export them, so this is a copy:
 * each name is also the KaTeX command (\theta), which is why pi (a constant) and omicron (no KaTeX
 * command) are not here. A Map, not an object, so an unknown named "constructor" is not read as a
 * property every object has.
 */
const GREEK = new Map<string, string>([
  ['alpha', 'α'], ['beta', 'β'], ['gamma', 'γ'], ['delta', 'δ'], ['epsilon', 'ε'], ['zeta', 'ζ'], ['eta', 'η'], ['theta', 'θ'],
  ['iota', 'ι'], ['kappa', 'κ'], ['lambda', 'λ'], ['mu', 'μ'], ['nu', 'ν'], ['xi', 'ξ'], ['rho', 'ρ'], ['sigma', 'σ'],
  ['tau', 'τ'], ['upsilon', 'υ'], ['phi', 'φ'], ['chi', 'χ'], ['psi', 'ψ'], ['omega', 'ω']
])

const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉'

/** "10" → "₁₀": every digit of the number is a subscript, not only the first. */
const subscript = (digits: string): string => digits.replace(/\d/g, (d) => SUBSCRIPT_DIGITS[Number(d)])

/**
 * A name, then an optional _number for its subscript, then an optional "=". Plain ASCII letters and
 * digits only, so a label already written with Unicode subscripts or Greek letters never matches and
 * is left as it stands.
 */
const SYMBOL_LABEL = /^([A-Za-z]+)(?:_(\d+))?(\s*=)?$/

interface SymbolLabel {
  name: string
  /** The subscript's digits ("1", "10"), when the label has one. */
  sub: string | undefined
  /** Whether the label ends with "=". */
  equals: boolean
}

/** The label as a symbol, or null when it is a word. Both functions below read a label through this one. */
function readSymbol(label: string): SymbolLabel | null {
  const m = SYMBOL_LABEL.exec(label.trim())
  if (!m) return null
  const [, name, sub, equals] = m
  // With no subscript only a letter or a Greek name is a symbol: "Answer" and "HCF" are words.
  if (sub === undefined && name.length > 1 && !GREEK.has(name)) return null
  return { name, sub, equals: equals !== undefined }
}

/** The label as TeX when it is a symbol (x_1 = → x_{1} =), or null when it is a word the panel keeps as text. */
export function labelTex(label: string): string | null {
  const s = readSymbol(label)
  if (!s) return null
  // The same three cases as the bar's label(): a Greek command, a lone letter, a longer name as text.
  // The subscript is braced so that x_10 is one subscript: KaTeX reads a bare x_10 as x₁ followed by 0.
  const name = GREEK.has(s.name) ? `\\${s.name}` : s.name.length === 1 ? s.name : `\\text{${s.name}}`
  return `${name}${s.sub === undefined ? '' : `_{${s.sub}}`}${s.equals ? ' =' : ''}`
}

/** The label as plain text for Copy: "x_1 =" → "x₁ =", "theta_2 =" → "θ₂ =", a word unchanged. */
export function labelText(label: string): string {
  const s = readSymbol(label)
  // A word, or a plain letter with no subscript and no Greek name to spell: copied as it came.
  if (!s || (s.sub === undefined && !GREEK.has(s.name))) return label
  return `${GREEK.get(s.name) ?? s.name}${s.sub === undefined ? '' : subscript(s.sub)}${s.equals ? ' =' : ''}`
}

/** What Copy writes for one answer: its label, then its answer. */
export function answerCopyLine(a: { label: string; tex: string }): string {
  return `${labelText(a.label)} ${a.tex}`
}

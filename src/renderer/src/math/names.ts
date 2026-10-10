// The one list of Greek letters, and of the names that stand for a number rather than an unknown.
//
// A student types θ, and the expression reader spells it "theta" (math/expr.ts preprocess). Pure
// Maths keeps a spelt name whole as one letter (math/pure/mono.ts writeTimes), the calculus route
// spells letters out for the algebra engine (math/pure/store.ts spelledOut), and an answer label
// writes the name back as θ or \theta (calc/labels.ts). Those three kept alphabets of their own, of
// 23, 12 and 22 letters, so a letter could be one name in one place and three letters in another.
// They take their letters from here now, and each says where it uses them which it reads, and why.
// Other copies remain outside Pure Maths (the bar's, the LaTeX and HTML readers', the engine
// adapter's): docs/knowledge/pure-maths.md lists them.

/**
 * One Greek letter: its spelt name, which is also its KaTeX command (\theta), and the letter itself.
 * KaTeX draws two of the commands in their other forms, as TeX does: \epsilon as ϵ and \phi as ϕ.
 */
interface GreekLetter {
  readonly name: string
  readonly letter: string
}

/** The 24 lowercase Greek letters, in the alphabet's order. */
export const GREEK_LETTERS: readonly GreekLetter[] = [
  { name: 'alpha', letter: 'α' },
  { name: 'beta', letter: 'β' },
  { name: 'gamma', letter: 'γ' },
  { name: 'delta', letter: 'δ' },
  { name: 'epsilon', letter: 'ε' },
  { name: 'zeta', letter: 'ζ' },
  { name: 'eta', letter: 'η' },
  { name: 'theta', letter: 'θ' },
  { name: 'iota', letter: 'ι' },
  { name: 'kappa', letter: 'κ' },
  { name: 'lambda', letter: 'λ' },
  { name: 'mu', letter: 'μ' },
  { name: 'nu', letter: 'ν' },
  { name: 'xi', letter: 'ξ' },
  { name: 'omicron', letter: 'ο' },
  { name: 'pi', letter: 'π' },
  { name: 'rho', letter: 'ρ' },
  { name: 'sigma', letter: 'σ' },
  { name: 'tau', letter: 'τ' },
  { name: 'upsilon', letter: 'υ' },
  { name: 'phi', letter: 'φ' },
  { name: 'chi', letter: 'χ' },
  { name: 'psi', letter: 'ψ' },
  { name: 'omega', letter: 'ω' }
]

/** Every spelt name, pi among them: each is one letter to a student, though written with several. */
export const GREEK_NAMES: ReadonlySet<string> = new Set(GREEK_LETTERS.map((g) => g.name))

/**
 * The names that stand for a number: e (and E), pi, i and Infinity. The calculus route never guesses
 * one of them as the letter to work by, and Pure Maths never splits pi or Infinity into letters.
 */
export const CONSTANT_NAMES: ReadonlySet<string> = new Set(['e', 'E', 'pi', 'i', 'Infinity'])

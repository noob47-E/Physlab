// One corpus for every reader and writer of names and Greek letters (CW6c): what a student types as
// an unknown, a label the engine writes, and a name in a formula. tests/nameList.test.ts pins what
// each makes of every line, so that moving their lists into math/names.ts can be proved to change
// nothing.

const SPELT = [
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi',
  'omicron', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega'
]
const LETTERS = [...'αβγδεζηθικλμνξοπρστυφχψω']

export const CORPUS: string[] = [
  ...SPELT,
  ...LETTERS,
  // capitals, other forms of a letter, and look-alikes
  'Theta', 'THETA', 'Θ', 'Δ', 'Ω', 'Lambda', 'varphi', 'ϕ', 'ϑ', 'ς', 'µ', 'lamda',
  // constants and plain letters
  'e', 'E', 'i', 'Infinity', 'x', 'y', 't', 'a', 'A', 'z', 'Z', 'I',
  // runs of letters
  'ab', 'abc', 'atheta', '2atheta', 'thetax', 'xtheta', 'alphabeta', 'xalpha', 'lambdax', 'thetasin(x)', 'xcos(x)',
  'pitheta', 'ipi', 'isqrt(2)', 'sinx', 'sin(x)', 'tan(θ)', 'HCF', 'Answer', 'speed', 'constructor', 'toString',
  '__proto__',
  // expressions with Greek unknowns
  'θ^2 - 1', 'θ^2 + 5θ + 6', 'α^2 - 4', '2aθ', 'theta^2 + 5theta + 6', 'x^2 + θx', 'sin(θ) + θ', 'λ e^(λ t)',
  'μ^2 - σ^2', 'ψ ω', 'δ^2 - 1', 'ε x', 'omicron^2 - 1', 'φ^2 + φ', 'e^x', 'x e^x', 't^2', '2πr', 'r θ',
  // labels as the engine writes them
  'x =', 'x_1 =', 'theta_2 =', 'speed_1 =', 'x_10', 'alpha_1', 'omicron_1 =', 'pi =', 'x₁ =', 'θ₂ =', 'HCF =',
  '12 =', 'As a decimal', 'P(Z < 1.96)',
  // names in a formula
  'A′', 'A″', 'Aα', 'θ′', 'B2A', '2A', 'x1', 'a1', 'αa', "A'", 'A_1', 'Ͱ', 'Ͽ', 'ϰ', '',
  ' ', '1', '1.5', '?'
]

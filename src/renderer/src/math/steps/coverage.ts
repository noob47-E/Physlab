// The catalogue of every mathematical answer kind the Calculator provides.
// Part of the PhysLab step engine (S2 coverage gate).
//
// Every problem family from S1 to S11 is listed here. The coverage gate test
// asserts that every kind either has a sound, validated step method in the
// step framework or is explicitly in the allow-list of gaps shrinking to zero.

import type { Problem } from './types'

type StepFamily =
  | 'linear-and-quadratic' // S1
  | 'polynomial-products' // S1
  | 'higher-equations' // S3 (cubic, quartic, trig, exp, log, radical, rational)
  | 'inequalities' // S4 (linear, quadratic, rational, modulus)
  | 'differentiation' // S5 (rules, implicit, parametric, tangents, stationary)
  | 'integration' // S6 (substitution, parts, partial fractions, trig sub, definite)
  | 'limits-and-series' // S7 (limits, Taylor/Maclaurin, binomial, sums)
  | 'matrices' // S8 (det, inv, systems, eigenvalues)
  | 'complex-numbers' // S9 (polar, De Moivre, roots, loci)
  | 'statistics' // S10 (summary, regression, distributions)
  | 'vectors-and-physics' // S11 (vectors 3D, SUVAT, dynamics)

interface CalculatorAnswerKind {
  id: string
  family: StepFamily
  title: string
  example: string
  problem: Problem
}

export const CALCULATOR_ANSWER_KINDS: CalculatorAnswerKind[] = [
  // --- S1: Linear, Quadratic, 2x2/3x3 Systems, Expand, Factorise ---
  {
    id: 'linear-equation-1var',
    family: 'linear-and-quadratic',
    title: 'Linear equation in one variable',
    example: '2x + 4 = 10',
    problem: { job: 'solve', input: '2x + 4 = 10', variable: 'x' }
  },
  {
    id: 'quadratic-factorise',
    family: 'linear-and-quadratic',
    title: 'Quadratic equation by factorising',
    example: 'x^2 - 5x + 6 = 0',
    problem: { job: 'solve', input: 'x^2 - 5x + 6 = 0', variable: 'x' }
  },
  {
    id: 'quadratic-formula',
    family: 'linear-and-quadratic',
    title: 'Quadratic equation by formula',
    example: 'x^2 + 2x - 1 = 0',
    problem: { job: 'solve', input: 'x^2 + 2x - 1 = 0', variable: 'x' }
  },
  {
    id: 'quadratic-square',
    family: 'linear-and-quadratic',
    title: 'Quadratic equation by completing the square',
    example: 'x^2 + 4x + 1 = 0',
    problem: { job: 'solve', input: 'x^2 + 4x + 1 = 0', variable: 'x' }
  },
  {
    id: 'linear-system-2x2-elimination',
    family: 'linear-and-quadratic',
    title: '2x2 linear system by elimination',
    example: 'x + y = 3, 2x - y = 0',
    problem: { job: 'solve', input: 'x + y = 3, 2x - y = 0', variable: 'x' }
  },
  {
    id: 'linear-system-2x2-substitution',
    family: 'linear-and-quadratic',
    title: '2x2 linear system by substitution',
    example: 'x + 2y = 8, x - y = 2',
    problem: { job: 'solve', input: 'x + 2y = 8, x - y = 2', variable: 'x' }
  },
  {
    id: 'linear-system-3x3',
    family: 'linear-and-quadratic',
    title: '3x3 linear system',
    example: 'x + y + z = 6, 2y + 5z = -4, 2x + 5y - z = 27',
    problem: { job: 'solve', input: 'x + y + z = 6, 2y + 5z = -4, 2x + 5y - z = 27', variable: 'x' }
  },
  {
    id: 'expand-polynomial',
    family: 'polynomial-products',
    title: 'Expand polynomial brackets',
    example: '(x + 1)(x + 2)',
    problem: { job: 'expand', input: '(x + 1)(x + 2)' }
  },
  {
    id: 'factorise-polynomial',
    family: 'polynomial-products',
    title: 'Factorise polynomial',
    example: 'x^2 - 1',
    problem: { job: 'factor', input: 'x^2 - 1' }
  },

  // --- S3: Higher Equations ---
  {
    id: 'cubic-equation',
    family: 'higher-equations',
    title: 'Cubic equation',
    example: 'x^3 - 6x^2 + 11x - 6 = 0',
    problem: { job: 'solve', input: 'x^3 - 6x^2 + 11x - 6 = 0', variable: 'x' }
  },
  {
    id: 'quartic-equation',
    family: 'higher-equations',
    title: 'Quartic equation',
    example: 'x^4 - 5x^2 + 4 = 0',
    problem: { job: 'solve', input: 'x^4 - 5x^2 + 4 = 0', variable: 'x' }
  },
  {
    id: 'trig-equation',
    family: 'higher-equations',
    title: 'Trigonometric equation',
    example: 'sin(x) = 0.5',
    problem: { job: 'solve', input: 'sin(x) = 0.5', variable: 'x' }
  },
  {
    id: 'exponential-equation',
    family: 'higher-equations',
    title: 'Exponential equation',
    example: '2^x = 8',
    problem: { job: 'solve', input: '2^x = 8', variable: 'x' }
  },
  {
    id: 'logarithmic-equation',
    family: 'higher-equations',
    title: 'Logarithmic equation',
    example: 'log(x, 2) = 3',
    problem: { job: 'solve', input: 'log(x, 2) = 3', variable: 'x' }
  },
  {
    id: 'radical-equation',
    family: 'higher-equations',
    title: 'Equation with square roots',
    example: 'sqrt(x + 1) = x - 1',
    problem: { job: 'solve', input: 'sqrt(x + 1) = x - 1', variable: 'x' }
  },
  {
    id: 'rational-equation',
    family: 'higher-equations',
    title: 'Equation with letter in denominator',
    example: '1/x + 1/(x - 1) = 2',
    problem: { job: 'solve', input: '1/x + 1/(x - 1) = 2', variable: 'x' }
  },
  {
    id: 'divide-polynomial',
    family: 'polynomial-products',
    title: 'Polynomial long division',
    example: '(x^3 - 6x^2 + 11x - 6)/(x - 1)',
    problem: { job: 'divide', input: '(x^3 - 6x^2 + 11x - 6)/(x - 1)' }
  },
  {
    id: 'partial-fractions',
    family: 'polynomial-products',
    title: 'Partial fractions decomposition',
    example: '(3x + 5)/((x + 1)(x + 2))',
    problem: { job: 'partial', input: '(3x + 5)/((x + 1)(x + 2))' }
  },

  // --- S4: Inequalities ---
  {
    id: 'linear-inequality',
    family: 'inequalities',
    title: 'Linear inequality',
    example: '2x - 3 < 5',
    problem: { job: 'solve', input: '2x - 3 < 5', variable: 'x' }
  },
  {
    id: 'quadratic-inequality',
    family: 'inequalities',
    title: 'Quadratic inequality',
    example: 'x^2 - 4x + 3 >= 0',
    problem: { job: 'solve', input: 'x^2 - 4x + 3 >= 0', variable: 'x' }
  },
  {
    id: 'rational-inequality',
    family: 'inequalities',
    title: 'Rational inequality',
    example: '(x - 1)/(x + 2) > 0',
    problem: { job: 'solve', input: '(x - 1)/(x + 2) > 0', variable: 'x' }
  },
  {
    id: 'modulus-inequality',
    family: 'inequalities',
    title: 'Modulus inequality',
    example: 'abs(2x - 1) <= 3',
    problem: { job: 'solve', input: 'abs(2x - 1) <= 3', variable: 'x' }
  },

  // --- S5: Differentiation ---
  {
    id: 'derivative-polynomial',
    family: 'differentiation',
    title: 'Derivative of polynomial',
    example: 'diff(x^3 - 2x + 1, x)',
    problem: { job: 'differentiate', input: 'diff(x^3 - 2x + 1, x)', variable: 'x' }
  },
  {
    id: 'derivative-product-rule',
    family: 'differentiation',
    title: 'Product rule derivative',
    example: 'diff(x^2 * sin(x), x)',
    problem: { job: 'differentiate', input: 'diff(x^2 * sin(x), x)', variable: 'x' }
  },
  {
    id: 'derivative-quotient-rule',
    family: 'differentiation',
    title: 'Quotient rule derivative',
    example: 'diff(x / (x + 1), x)',
    problem: { job: 'differentiate', input: 'diff(x / (x + 1), x)', variable: 'x' }
  },
  {
    id: 'derivative-chain-rule',
    family: 'differentiation',
    title: 'Chain rule derivative',
    example: 'diff(sin(x^2), x)',
    problem: { job: 'differentiate', input: 'diff(sin(x^2), x)', variable: 'x' }
  },
  {
    id: 'derivative-second',
    family: 'differentiation',
    title: 'Second derivative',
    example: 'diff(diff(x^4, x), x)',
    problem: { job: 'differentiate', input: 'diff(diff(x^4, x), x)', variable: 'x' }
  },
  {
    id: 'derivative-implicit',
    family: 'differentiation',
    title: 'Implicit differentiation',
    example: 'x^2 + y^2 = 25',
    problem: { job: 'differentiate', input: 'x^2 + y^2 = 25', variable: 'x' }
  },
  {
    id: 'derivative-parametric',
    family: 'differentiation',
    title: 'Parametric differentiation',
    example: 'x = cos(t), y = sin(t)',
    problem: { job: 'differentiate', input: 'x = cos(t), y = sin(t)', variable: 't' }
  },
  {
    id: 'derivative-logarithmic',
    family: 'differentiation',
    title: 'Logarithmic differentiation',
    example: 'diff(x^x, x)',
    problem: { job: 'differentiate', input: 'diff(x^x, x)', variable: 'x' }
  },
  {
    id: 'tangent-normal',
    family: 'differentiation',
    title: 'Tangent and normal to curve',
    example: 'tangent(x^2, x = 2)',
    problem: { job: 'tangent', input: 'tangent(x^2, x = 2)', variable: 'x' }
  },
  {
    id: 'stationary-points',
    family: 'differentiation',
    title: 'Stationary points of curve',
    example: 'stationary(x^3 - 3x)',
    problem: { job: 'stationary', input: 'stationary(x^3 - 3x)', variable: 'x' }
  },

  // --- S6: Integration ---
  {
    id: 'integral-polynomial',
    family: 'integration',
    title: 'Polynomial integration',
    example: 'integrate(x^2 + 2x, x)',
    problem: { job: 'integrate', input: 'integrate(x^2 + 2x, x)', variable: 'x' }
  },
  {
    id: 'integral-substitution',
    family: 'integration',
    title: 'Integration by substitution',
    example: 'integrate(2x * cos(x^2), x)',
    problem: { job: 'integrate', input: 'integrate(2x * cos(x^2), x)', variable: 'x' }
  },
  {
    id: 'integral-by-parts',
    family: 'integration',
    title: 'Integration by parts',
    example: 'integrate(x * exp(x), x)',
    problem: { job: 'integrate', input: 'integrate(x * exp(x), x)', variable: 'x' }
  },
  {
    id: 'integral-partial-fractions',
    family: 'integration',
    title: 'Integration via partial fractions',
    example: 'integrate(1 / (x^2 - 1), x)',
    problem: { job: 'integrate', input: 'integrate(1 / (x^2 - 1), x)', variable: 'x' }
  },
  {
    id: 'integral-trig-substitution',
    family: 'integration',
    title: 'Integration by trig substitution',
    example: 'integrate(sqrt(1 - x^2), x)',
    problem: { job: 'integrate', input: 'integrate(sqrt(1 - x^2), x)', variable: 'x' }
  },
  {
    id: 'integral-definite',
    family: 'integration',
    title: 'Definite integral with limits',
    example: 'integral(x^2, 0, 1)',
    problem: { job: 'integrate', input: 'integral(x^2, 0, 1)', variable: 'x' }
  },

  // --- S7: Limits and Series ---
  {
    id: 'limit-direct',
    family: 'limits-and-series',
    title: 'Direct limit substitution',
    example: 'limit(x^2 + 1, x, 2)',
    problem: { job: 'limit', input: 'limit(x^2 + 1, x, 2)', variable: 'x' }
  },
  {
    id: 'limit-factor-cancel',
    family: 'limits-and-series',
    title: 'Limit by factoring and cancelling',
    example: 'limit((x^2 - 1)/(x - 1), x, 1)',
    problem: { job: 'limit', input: 'limit((x^2 - 1)/(x - 1), x, 1)', variable: 'x' }
  },
  {
    id: 'limit-lhopital',
    family: 'limits-and-series',
    title: "Limit by L'Hopital's rule",
    example: 'limit(sin(x)/x, x, 0)',
    problem: { job: 'limit', input: 'limit(sin(x)/x, x, 0)', variable: 'x' }
  },
  {
    id: 'series-taylor-maclaurin',
    family: 'limits-and-series',
    title: 'Taylor and Maclaurin series expansion',
    example: 'series(sin(x), x, 0, 4)',
    problem: { job: 'series', input: 'series(sin(x), x, 0, 4)', variable: 'x' }
  },
  {
    id: 'series-binomial',
    family: 'limits-and-series',
    title: 'Binomial expansion theorem',
    example: 'binomial(1 + x, 1/2)',
    problem: { job: 'series', input: 'binomial(1 + x, 1/2)', variable: 'x' }
  },
  {
    id: 'series-sum',
    family: 'limits-and-series',
    title: 'Series summation',
    example: 'sum(n, 1, 10)',
    problem: { job: 'sum', input: 'sum(n, 1, 10)' }
  },

  // --- S8: Matrices ---
  {
    id: 'matrix-determinant-2x2',
    family: 'matrices',
    title: '2x2 matrix determinant',
    example: 'det([[1, 2], [3, 4]])',
    problem: { job: 'det', input: 'det([[1, 2], [3, 4]])' }
  },
  {
    id: 'matrix-determinant-3x3',
    family: 'matrices',
    title: '3x3 matrix determinant by cofactors',
    example: 'det([[1, 2, 3], [0, 1, 4], [5, 6, 0]])',
    problem: { job: 'det', input: 'det([[1, 2, 3], [0, 1, 4], [5, 6, 0]])' }
  },
  {
    id: 'matrix-inverse-2x2',
    family: 'matrices',
    title: '2x2 matrix inverse',
    example: 'inv([[1, 2], [3, 4]])',
    problem: { job: 'inv', input: 'inv([[1, 2], [3, 4]])' }
  },
  {
    id: 'matrix-inverse-3x3',
    family: 'matrices',
    title: '3x3 matrix inverse by adjugate / row reduction',
    example: 'inv([[1, 2, 3], [0, 1, 4], [5, 6, 0]])',
    problem: { job: 'inv', input: 'inv([[1, 2, 3], [0, 1, 4], [5, 6, 0]])' }
  },
  {
    id: 'matrix-eigenvalues',
    family: 'matrices',
    title: 'Matrix eigenvalues',
    example: 'eigenvalues([[2, 1], [1, 2]])',
    problem: { job: 'eigenvalues', input: 'eigenvalues([[2, 1], [1, 2]])' }
  },

  // --- S9: Complex Numbers ---
  {
    id: 'complex-arithmetic',
    family: 'complex-numbers',
    title: 'Complex arithmetic',
    example: '(1 + 2i) * (3 - 4i)',
    problem: { job: 'complex', input: '(1 + 2i) * (3 - 4i)' }
  },
  {
    id: 'complex-polar-form',
    family: 'complex-numbers',
    title: 'Complex polar / exponential form',
    example: 'polar(1 + i)',
    problem: { job: 'polar', input: 'polar(1 + i)' }
  },
  {
    id: 'complex-demoivre',
    family: 'complex-numbers',
    title: "De Moivre's theorem powers",
    example: '(cos(pi/6) + i*sin(pi/6))^6',
    problem: { job: 'complex', input: '(cos(pi/6) + i*sin(pi/6))^6' }
  },
  {
    id: 'complex-roots',
    family: 'complex-numbers',
    title: 'N-th roots of a complex number',
    example: 'roots(z^3 = 1)',
    problem: { job: 'roots', input: 'z^3 = 1', variable: 'z' }
  },

  // --- S10: Statistics and Probability ---
  {
    id: 'statistics-summary',
    family: 'statistics',
    title: 'Summary statistics (mean, median, SD)',
    example: 'stats(1, 2, 3, 4, 5)',
    problem: { job: 'stats', input: 'stats(1, 2, 3, 4, 5)' }
  },
  {
    id: 'statistics-regression',
    family: 'statistics',
    title: 'Linear regression line and correlation',
    example: 'regression([(1, 2), (2, 3), (3, 5)])',
    problem: { job: 'regression', input: 'regression([(1, 2), (2, 3), (3, 5)])' }
  },
  {
    id: 'probability-normal',
    family: 'statistics',
    title: 'Normal distribution z-score and probability',
    example: 'normal(0, 1, 1.96)',
    problem: { job: 'normal', input: 'normal(0, 1, 1.96)' }
  },

  // --- S11: Vectors and Physics ---
  {
    id: 'vector-dot-cross',
    family: 'vectors-and-physics',
    title: 'Vector dot and cross product',
    example: 'dot(<1, 2, 3>, <4, 5, 6>)',
    problem: { job: 'dot', input: 'dot(<1, 2, 3>, <4, 5, 6>)' }
  },
  {
    id: 'physics-suvat',
    family: 'vectors-and-physics',
    title: 'SUVAT kinematics motion equations',
    example: 'suvat(u = 0, a = 9.8, t = 2)',
    problem: { job: 'physics', input: 'suvat(u = 0, a = 9.8, t = 2)' }
  },
  {
    id: 'physics-newton-fma',
    family: 'vectors-and-physics',
    title: "Newton's second law formula solving",
    example: 'solve(F = m*a, a)',
    problem: { job: 'physics', input: 'solve(F = m*a, a)' }
  },
  {
    id: 'units-conversion',
    family: 'vectors-and-physics',
    title: 'Units and significant figures conversion',
    example: '36 km/h to m/s',
    problem: { job: 'units', input: '36 km/h to m/s' }
  }
]

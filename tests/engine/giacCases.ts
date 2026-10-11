// The spelling's round trips, shared by the pure test (giac-spelling.test.ts, which reads each back
// as if Giac had printed it unchanged) and the engine test (giac.engine.test.ts, which sends each
// through the real runtime and reads what it prints): texts as a request carries them, covering every
// function, constant and form the spelling knows (MUST_COVER says which). 160 of them.
export const ROUND_TRIPS: readonly string[] = [
  'x', '2*x', 'x^2 - 1', '(x - 1)*(x + 1)', 'x^3 + 6*x^2 + 12*x + 8', '1/x', '1/(x^2 + 1)', 'x/(x^2 - 4)', '(x + 1)/(x^2 + x - 2)', 'sqrt(x)',
  'sqrt(x^2 + 1)', 'cbrt(x)', 'cbrt(x - 3)', 'x^(1/3)', 'x^(2/3)', 'x^(-1/3)', 'x^(1/5)', 'nthRoot(x, 5)', 'x^(3/2)', 'x^(1/2)',
  'abs(x)', 'abs(x - 2)', 'abs(abs(x) - 1)', 'sign(x - 1)', 'exp(x)', 'e^x', 'e^(2*x)', 'exp(-x^2)', 'ln(x)', 'ln(x^2 + 1)',
  'log(x)', 'log(100*x)', 'log(2, x)', 'log(x, 8)', 'sin(x)', 'cos(x)', 'tan(x)', 'sec(x)', 'csc(x)', 'cot(x)',
  'asin(x/4)', 'acos(x/3)', 'atan(x)', 'acot(x)', 'sinh(x)', 'cosh(x)', 'tanh(x)', 'asinh(x)', 'atan(x)^2', 'sin(x)^2 + cos(x)^2',
  'sin(2*x)', 'cos(x/2)', 'tan(x + pi/4)', 'x*sin(x)', 'x^2*cos(x)', 'exp(x)*sin(x)', 'x*exp(x)', 'x*ln(x)', 'ln(abs(x))', 'sqrt(1 - x^2/9)',
  'pi*x', 'x + pi', 'x*e', 'e*pi*x', '2^x', '3^(x - 1)', 'x^x', '(x + 1)^10', '(2*x - 3)^5', '-x',
  '-(x + 1)', '-x^2', '(-x)^2', '(-x)^3', 'x - (x - 1)', 'x - -x', '1/2*x', 'x/2/3', '(1/2)/(x + 1)', '2/(3*x)',
  'x*y', 'x^2*y + y^2*x', 'theta^2', 'sin(theta)', 'lambda*t', 'alpha + beta', 'x1 + x2', 'a*x^2 + b*x + c', '(a + b)^2', 'm*v^2/2',
  'factorial(4)*x', 'nCr(5, 2)*x', 'floor(x)', 'ceil(x)', '15/10^2*x', '6*10^24*x', '16/10^20*x', 'x^2/10^3', '10^(-3)*x', '1/(x - 1) - 1/(x + 1)',
  '1/(x*(x - 1))', '(x^2 + 1)/(x^3 + x)', 'x/(1 + x)^2', '1/sqrt(x)', '1/cbrt(x)', 'cbrt(x)^2', 'sqrt(x)*cbrt(x)', 'exp(sqrt(x))', 'ln(sqrt(x))', 'sin(cbrt(x))',
  'abs(sin(x))', 'abs(x)/x', 'x*abs(x)', 'sign(x)*x', 'exp(-x)*cos(x)', 'tanh(x)^2', 'cosh(x)^2 - sinh(x)^2', 'atan(1/x)', 'asin(x/4)^2', 'acos(x/5) + asin(x/5)',
  'ln(x + 1) - ln(x)', 'log(x^2)', 'exp(ln(x))', 'x^(1/7)', 'x^(4/9)', '(x^2 + 1)^(1/3)', '(x^2 + 1)^(-2/3)', 'x^(5/3)', 'cbrt(x^2 + 1)*x', 'x/cbrt(x^2 + 1)',
  '2^(1/3)', '3^(2/5)', '5^(1/2)', '(1/2)^(1/3)', 'x*2^(1/3)', 'x + 2^(1/3)', '-2^(1/3)', '(x + 2)^(1/3) - x^(1/3)', 'x^(1/3)*y', 'y^(2/3) + x',
  'i*x', 'x + i', '(x + i)*(x - i)', 'e^(i*x)', '2*i*pi', 'x^2 + 2*x + 2', 'sin(pi*x/180)', 'pi/180*cos(pi*x/180)', 'x^2/2 + C*x', 'v0*t + a*t^2/2',
  'acosh(x + 2)', 'atanh(x/4)', 'asec(x + 2)', 'acsc(x + 2)', 'nPr(5, 2)*x', 'log10(x)', 'arcsin(x/4)', 'sgn(x - 1)', 'mag(x - 2)', 'Abs(x)'
]

/**
 * What the corpus must hold, each at least once: every function name the spelling reads in a request,
 * and the forms it rewrites (odd-bottom powers of either sign, an even-bottom power, nested bars, i, e, π,
 * a decimal written exactly, degrees as radians, log base a). A case taken out fails the tests that read this.
 */
export const MUST_COVER: readonly RegExp[] = [
  ...['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'asin', 'acos', 'atan', 'acot', 'asec', 'acsc', 'arcsin', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'exp', 'ln', 'log', 'log10', 'sqrt', 'cbrt', 'nthRoot', 'abs', 'Abs', 'mag', 'sign', 'sgn', 'factorial', 'nCr', 'nPr', 'floor', 'ceil'].map(
    (f) => new RegExp(`(^|[^\\w])${f}\\(`)
  ),
  /\^\(1\/3\)/,
  /\^\(2\/3\)/,
  /\^\(-1\/3\)/,
  /\^\(-2\/3\)/,
  /\^\(3\/2\)/,
  /abs\(abs\(/,
  /\bpi\b/,
  /\bi\b/,
  /\be\b/,
  /10\^24/,
  /pi\/180/,
  /log\(2, x\)/,
  /\btheta\b/,
  /x\/cbrt\(x\^2 \+ 1\)/
]

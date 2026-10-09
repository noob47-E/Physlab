// The `cas` sweep's jobs (CLEANUP-PLAN.md §2): requests as the app sends them to the algebra
// worker (op, payload). The first FAST_COUNT are the fast subset every quick run makes; all of them
// run in the full sweep. Lines are only ever appended.

export const FAST_COUNT = 10

export const CAS_JOBS: [string, Record<string, unknown>][] = [
  // The fast subset: one of each kind of job.
  ['simplify', { expr: 'sin(x)^2+cos(x)^2' }],
  ['expand', { expr: '(x+2)^6' }],
  ['factor', { expr: 'x^4-16' }],
  ['apart', { expr: '1/(x^2-1)' }],
  ['diff', { expr: 'x^2*sin(x)', var: 'x', order: 1 }],
  ['integrate', { expr: 'x*exp(x)', var: 'x' }],
  ['integrate', { expr: 'exp(-x)', var: 'x', lower: '0', upper: 'oo' }],
  ['limit', { expr: 'sin(x)/x', var: 'x', to: '0' }],
  ['series', { expr: 'exp(x)', var: 'x', at: '0', n: 6 }],
  ['solve', { eqs: ['x^2-5x+6=0'], vars: ['x'] }],

  // simplify, exact, eval
  ['simplify', { expr: '(x^2-1)/(x-1)' }],
  ['simplify', { expr: 'log(2, 8)' }],
  ['simplify', { expr: 'sqrt(50)' }],
  ['simplify', { expr: 'sin(30)', deg: true }],
  ['simplify', { expr: '(-8)^(1/3)' }],
  ['simplify', { expr: 'exp(i*pi)+1' }],
  ['exact', { expr: '0.3333333333333333' }],
  ['exact', { expr: '1.4142135623730951' }],
  ['eval', { expr: 'cos(60)^2', deg: true }],
  ['eval', { expr: '2^100' }],
  // expand, factor
  ['expand', { expr: '(a+b)^5' }],
  ['expand', { expr: '(2x-3)(x+4)' }],
  ['factor', { expr: 'x^2+4' }],
  ['factor', { expr: '6a^2b+9ab^2' }],
  ['factor', { expr: 'x^3-1' }],
  ['factor_complex', { expr: 'x^2+4' }],
  ['factor_complex', { expr: 'x^4-1' }],
  ['apart', { expr: '(x+3)/(2x^3)' }],
  ['apart', { expr: '1/(x^3(x+1))' }],
  // diff
  ['diff', { expr: 'exp(x)*cos(x)', var: 'x', order: 2 }],
  ['diff', { expr: 'x^x', var: 'x', order: 1 }],
  ['diff', { expr: 'sin(x)', var: 'x', order: 1, deg: true }],
  ['diff', { expr: 'ln(x^2+1)', var: 'x', order: 1, at: '1' }],
  ['diff', { expr: 't^3-4t', var: 't', order: 1 }],
  // integrate
  ['integrate', { expr: 'sin(x)^2', var: 'x' }],
  ['integrate', { expr: '1/x', var: 'x', lower: '1', upper: 'e' }],
  ['integrate', { expr: '1/x^2', var: 'x', lower: '1', upper: '∞' }],
  ['integrate', { expr: 'exp(-x^2)', var: 'x', lower: '-oo', upper: 'oo' }],
  ['integrate', { expr: '1/x', var: 'x', lower: '-1', upper: '1' }],
  ['integrate', { expr: 'sqrt(1-x^2)', var: 'x', lower: '0', upper: '1' }],
  ['integrate', { expr: 'cos(x)', var: 'x', lower: '0', upper: '90', deg: true }],
  // limit, with ∞ as the bar writes it and as Python does
  ['limit', { expr: '1/x', var: 'x', to: 'oo' }],
  ['limit', { expr: '(1+1/n)^n', var: 'n', to: '∞' }],
  ['limit', { expr: '1/x', var: 'x', to: '0', dir: '+' }],
  ['limit', { expr: '1/x', var: 'x', to: '0', dir: '-' }],
  ['limit', { expr: '1/x', var: 'x', to: '0' }],
  ['limit', { expr: 'x*sin(1/x)', var: 'x', to: 'Infinity' }],
  // series
  ['series', { expr: 'sin(x)', var: 'x', at: '0', n: 8 }],
  ['series', { expr: 'ln(x)', var: 'x', at: '1', n: 4 }],
  ['series', { expr: '1/(1-x)', var: 'x', at: '0', n: 5 }],
  // solve
  ['solve', { eqs: ['x+y=3', 'x-y=1'], vars: ['x', 'y'] }],
  ['solve', { eqs: ['x^3-6x^2+11x-6=0'], vars: ['x'] }],
  ['solve', { eqs: ['x^2+1=0'], vars: ['x'] }],
  ['solve', { eqs: ['sin(x)=1/2'], vars: ['x'] }],
  ['solve', { eqs: ['2^x=8'], vars: ['x'] }],
  ['solve', { eqs: ['x^2=x^2'], vars: ['x'] }],
  ['solve', { eqs: ['a*x+b=0'], vars: ['x'] }],
  // refusals: the sentence a student reads, never Python's own text
  ['simplify', { expr: '(x+' }],
  ['simplify', { expr: '1/0' }],
  ['frobnicate', { expr: 'x' }]
]

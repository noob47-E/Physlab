// The `pure` sweep's inputs (CLEANUP-PLAN.md §2): what a student types on the Pure Maths screen.
// Fixed: a line may be added at the end (and the golden file regenerated in its own commit),
// never edited or reordered.

import type { JobId } from '../../../src/renderer/src/math/pure/run'

/** The 20 bench inputs from 09/speed/bench.test.ts. */
export const BENCH: [JobId, string][] = [
  ['factor', 'x^2+5x+6'], ['factor', '6a^2b+9ab^2'], ['factor', 'x^3-1'], ['factor', '2x^2-8'],
  ['expand', '(x+1)^5'], ['expand', '(2x-3)(x+4)'], ['expand', '(a+b+c)^4'],
  ['divide', '(x^3-1)/(x-1)'], ['divide', '(2x^3+3x^2-1)/(x+1)'],
  ['partial', '1/(x^2-1)'], ['partial', '(x+3)/(2x^3)'], ['partial', '1/(x^3(x+1))'],
  ['hcf', '84, 126'], ['lcm', '12, 18, 30'], ['primes', '360360'],
  ['solve', 'x^2-5x+6=0'], ['solve', '2x+3=11'], ['complex', '(3+4i)(1-2i)'],
  ['trigidentity', 'sin(2x) = 2 sin x cos x'], ['factorComplex', 'x^2+4']
]

/** The table jobs (normal distribution). */
export const TABLE_JOBS: string[] = [
  'P(Z < 1.96)', 'P(45 < X < 60)', 'invnorm(0.975)'
]

/** The comma corpus: only Lab Data cells read a decimal comma; these must not change. */
export const COMMAS: string[] = [
  '3,5', '1,000', '2,5+1', 'f(1,2)', '\\left(1,2\\right)'
]

/** The huge-Expand corpus. */
export const HUGE_EXPAND: string[] = [
  '(a+b+c)^12', '(x+1)^40'
]

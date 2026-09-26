// Every piece of LaTeX Pure Math produces has to survive KaTeX.
//
// The step generators build LaTeX by hand — arrays for the division staircase and the prime
// ladder, \dfrac for partial fractions, \sqrt for surds. A stray brace shows up in the app as a
// red error where the maths should be, and nothing else in the suite would catch it, so the real
// renderer is run over the real output here.

import { describe, expect, it } from 'vitest'
import katex from 'katex'
import { JOBS, runPure, type JobId } from '../src/renderer/src/math/pure/run'
import { stepsWorkingFor } from '../src/renderer/src/math/pure/store'
import type { Working } from '../src/renderer/src/math/pure/work'
import { recordedFor } from './helpers/calculusFixtures'

const renders = (tex: string, where: string): void => {
  expect(() => katex.renderToString(tex, { displayMode: true, throwOnError: true, strict: 'ignore' }), `${where}: ${tex}`).not.toThrow()
}

/** Everything in one worked answer that will be handed to KaTeX. */
function checkAll(job: JobId, src: string): void {
  checkWorking(job, runPure(job, src))
}

function checkWorking(job: JobId, w: Working): void {
  if (w.error) return
  renders(w.input, `${job} input`)
  w.moves.forEach((m, i) => {
    if (m.tex) renders(m.tex, `${job} move ${i + 1} tex`)
    if (m.rule) renders(m.rule, `${job} move ${i + 1} rule`)
  })
  w.answers.forEach((a) => renders(a.tex, `${job} answer "${a.label}"`))
}

describe('the LaTeX Pure Math writes', () => {
  it('renders for every example offered in the panel, SymPy-worked ones from their recorded replies', () => {
    for (const job of JOBS) {
      if (job.engine !== 'cas') {
        checkAll(job.id, job.example)
        continue
      }
      const w = stepsWorkingFor(job.id, job.example, recordedFor(job.id, job.example))
      // An example that refuses or has no steps would teach nothing on the one-tap "What can it do?".
      expect(w.error, job.id).toBeUndefined()
      expect(w.moves.length, job.id).toBeGreaterThan(0)
      checkWorking(job.id, w)
    }
  })

  it('renders for the awkward shapes: ladders, staircases, surds, repeated and quadratic factors', () => {
    const cases: [JobId, string][] = [
      ['primes', '5040'],
      ['primes', '97'],
      ['hcf', '84, 132, 210'],
      ['lcm', '9, 12, 21'],
      ['hcf', 'x^2 - 1, x^2 + 2x + 1'],
      ['lcm', '2x^2 - 8, 3x + 6'],
      ['divide', '(2x^3 + 3x^2 - 11x - 6)/(x^2 - 4)'],
      ['divide', '(x^4 - 1)/(x + 1)'],
      ['divide', '(x^2 + 1)/(x^3 - 2)'],
      ['partial', '(3x + 5)/((x + 1)(x + 2))'],
      ['partial', '(x + 3)/((x + 1)^2)'],
      ['partial', '(2x + 1)/((x + 1)(x^2 + 1))'],
      ['partial', '(x^3)/((x + 1)(x + 2))'],
      ['factor', '6x^2 + 7x - 3'],
      ['factor', 'x^4 - 16'],
      ['factor', 'x^3 - 6x^2 + 11x - 6'],
      ['factor', '27a^3 + 8b^3'],
      ['factor', '6x^2*y + 9x*y^2'],
      ['factor', 'x^2 + 6x + 9'],
      ['solve', 'x^2 + 4x + 13 = 0'],
      ['solve', 'x^2 - 2x - 1 = 0'],
      ['solve', '2x^2 + 3x - 2 = 0'],
      ['solve', 'x^2 + 6x + 9 = 0'],
      ['complex', '(2 + 3i)/(1 - i)'],
      ['complex', '(2 + 3i)(4 - 5i)'],
      ['complex', 'i^7 + i^2'],
      ['complex', '3 + 4i'],
      ['factorComplex', 'x^2 + 4'],
      ['factorComplex', 'x^4 - 16'],
      ['factorComplex', '2x^2 + 2x + 5'],
      ['expand', '(x + 2)(x - 3)(x + 1)'],
      ['expand', '(x + 2)^2 - (x - 2)^2'],
      ['expand', '2x(x + 1)'],
      ['expand', '(x + 1)^9'],
      ['solve', 'x/2 + 1 = 4'],
      ['solve', '3x/4 = 6'],
      ['factorComplex', 'x^4 + 2x^2 + 4'],
      ['factorComplex', 'x^4 + 1'],
      ['hcf', 'x^2 - 1, x^2 + 2x + 1'],
      ['lcm', '4x, 6x^2']
    ]
    for (const [job, src] of cases) checkAll(job, src)
  })

  it('renders even the fractions that are not whole numbers', () => {
    for (const src of ['0.5x^2 - 2', 'x^2 - 1/4', '(x/2 + 1)(x/2 - 1)']) checkAll('factor', src)
    for (const src of ['2x^2 + 3x - 4 = 0', 'x^2 + x + 1 = 0']) checkAll('solve', src)
  })
})

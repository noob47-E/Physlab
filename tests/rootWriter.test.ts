// CW7a, one root writer: every route that works out a quadratic's discriminant, pinned over one
// corpus of quadratics and biquadratics — Factorise (with and without i), Solve, Partial Fractions
// (a repeated quadratic factor) and the bar's solutions in x (core/visualize.ts, whose real pair is
// worked from the exact discriminant). tests/fixtures/rootWriters.txt holds what each gave on
// phase-0.9 b296b6b, before their copies of b² − 4ac became one; the change must leave every line as
// it is. PHYSLAB_GOLDEN_UPDATE=1 npx vitest run tests/rootWriter.test.ts rewrites it, only in a
// commit of its own that names an approved change.

import fs from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/math/engine/sympy/worker', () => ({ tryCas: () => null, runCas: () => null }))

import { factoriseWorking } from '../src/renderer/src/math/pure/factor'
import { factoriseComplexWorking, solveQuadraticWorking } from '../src/renderer/src/math/pure/complex'
import { partialFractionsWorking } from '../src/renderer/src/math/pure/partial'
import { solutionsInX } from '../src/renderer/src/core/visualize'
import { resetGlobals } from './helpers/globals'
import { REPO_ROOT } from './helpers/repo'

beforeEach(resetGlobals)

const PINNED = join(REPO_ROOT, 'tests', 'fixtures', 'rootWriters.txt')

/** Quadratics with every kind of discriminant (square, surd, zero, negative), large and tiny ones, and biquadratics. */
const QUADRATICS = [
  'x^2 - 1', 'x^2 + 5x + 6', 'x^2 - 2', 'x^2 + 1', 'x^2 + 2x + 1', '4x^2 - 4x + 1', '2x^2 + 3x - 2', 'x^2 - x - 1',
  '9x^2 - 6x + 1', 'x^2 + x + 1', '3x^2 - 12', 'x^2 - 10000x + 1', 'x^2 + 1000001x + 1000000', '6x^2 + x - 15',
  '-x^2 + 4', 'x^2/2 - 2', 'x^2 + x/3 - 2/9', '25x^2 + 20x + 4', 'x^2 - 6x + 13', '2x^2 - 7', 'x^2 + 4x - 1',
  'x^4 - 5x^2 + 4', 'x^4 + 3x^2 + 2', 'x^4 - 2x^2 + 1', 'x^4 + 1', 'x^4 - 4', 'x^4 + 4', 'x^4 - 10x^2 + 1',
  'x^4 + x^2 + 1', '4x^4 - 17x^2 + 4', 'x^2', '5x^2 + 0x + 0', 'x^2 - 2x + 1 - 1/10^20'
]

const said = (run: () => unknown): string => {
  try {
    return JSON.stringify(run()) ?? 'undefined'
  } catch (e) {
    return `THROWS ${e instanceof Error ? e.message : String(e)}`
  }
}

const READERS: [string, (q: string) => string][] = [
  ['factorise', (q) => said(() => factoriseWorking(q))],
  ['factorise with i', (q) => said(() => factoriseComplexWorking(q))],
  ['solve', (q) => said(() => solveQuadraticWorking(`${q} = 0`))],
  ['partial fractions 1/q', (q) => said(() => partialFractionsWorking(`1/(${q})`))],
  ['partial fractions 1/(x q)', (q) => said(() => partialFractionsWorking(`(x + 3)/((x - 5)(${q}))`))],
  ['bar solutions', (q) => said(() => solutionsInX(q, [q, '0'], {}))]
]

function readings(): string[] {
  return QUADRATICS.flatMap((q) => READERS.map(([name, read]) => `${JSON.stringify(q)}  ${name}  =>  ${read(q)}`))
}

describe('CW7a: every route that works out a discriminant, over one corpus', () => {
  it('gives every corpus line exactly as phase-0.9 b296b6b did (tests/fixtures/rootWriters.txt)', () => {
    const lines = readings()
    if (process.env.PHYSLAB_GOLDEN_UPDATE === '1') fs.writeFileSync(PINNED, lines.join('\n') + '\n')
    const old = fs.readFileSync(PINNED, 'utf8').replace(/\r\n/g, '\n').split('\n')
    if (old.at(-1) === '') old.pop()
    const changed: string[] = []
    for (let i = 0; i < Math.max(old.length, lines.length); i++) {
      if (old[i] !== lines[i]) changed.push(`line ${i + 1}:\n  - ${old[i] ?? '(none)'}\n  + ${lines[i] ?? '(none)'}`)
    }
    expect(changed.slice(0, 20).join('\n'), `${changed.length} line(s) changed`).toBe('')
  }, 60_000)
})

// [answer may change] items, proved here and NOT applied: each it.fails passes while the app still
// answers as it does today, and fails (so the line must move to an ordinary `it`) once the owner's
// approved change lands. OWNER-APPROVALS.md has one row per item.
describe('CW7a, parked for the owner', () => {
  // CW7a-1: core/visualize.ts takes any power with an exponent above 12 (MAX_EXACT_DEGREE) for a high
  // power of x, even when what is raised is a number, so 10^20 or 2^40 sends the line to the
  // high-power route, which finds one rough solution or none. The same numbers written in digits
  // are solved exactly. On the bar, x² − 2x + 1 = 1/10²⁰ answers "The solution is x = 1".
  it('CW7a-1 evidence: a number to a high power is solved roughly, the same number in digits exactly', () => {
    expect(solutionsInX('x^2 - 2x + 1 - 1/10^20', ['x^2 - 2x + 1 - 1/10^20', '0'], {})).toEqual({ kind: 'real', xs: [1.0000000015430657] })
    expect(solutionsInX('x^2 - 2x + 1 - 1/100000000000000000000', ['x^2 - 2x + 1 - 1/100000000000000000000', '0'], {})).toEqual({ kind: 'real', xs: [0.9999999998999999, 1.0000000001] })
    expect(solutionsInX('x^2 - 10^20', ['x^2 - 10^20', '0'], {})).toEqual({ kind: 'none', complex: [] })
  })
  it.fails('CW7a-1: x² − 2x + 1 = 1/10²⁰ has the two solutions 1 ± 10⁻¹⁰, as it has written in digits', () => {
    expect(solutionsInX('x^2 - 2x + 1 - 1/10^20', ['x^2 - 2x + 1 - 1/10^20', '0'], {})).toEqual({ kind: 'real', xs: [0.9999999998999999, 1.0000000001] })
  })
  it.fails('CW7a-1: x² = 10²⁰ has the two real solutions ±10¹⁰, and x² = 2⁴⁰ has ±2²⁰', () => {
    expect(solutionsInX('x^2 - 10^20', ['x^2 - 10^20', '0'], {})).toEqual({ kind: 'real', xs: [-1e10, 1e10] })
    expect(solutionsInX('x^2 - 2^40', ['x^2 - 2^40', '0'], {})).toEqual({ kind: 'real', xs: [-1048576, 1048576] })
  })
})

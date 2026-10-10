// Golden sweep `roots` (CLEANUP-PLAN.md §2): equations in x alone, each typed on the bar (the
// sentence a student reads: its roots, or why there are none, with the complex ones) and solved by
// core/visualize.ts solutionsInX (the roots themselves, to 12 significant figures) — with a slider
// at five values, and the seeded root-set fuzz (near-double, repeated, clustered and complex roots).

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async () => ({ latex: '', text: '', numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {}, subscribe: () => () => {} },
  CAS_OPS: []
}))

import { resetGlobals } from '../helpers/globals'
import { expectGolden, goldenLine, seenOf, freezeClock } from './harness'
import { ROOTS_FUZZ, SLIDER_VALUES, SLIDER_EQS } from './inputs/roots'
import { solutionsInX } from '../../src/renderer/src/core/visualize'
import { runCommand } from '../../src/renderer/src/lang/commands'
import { scene } from '../../src/renderer/src/core/store'

beforeAll(freezeClock)
beforeEach(resetGlobals)

const num = (v: number): string => (Number.isFinite(v) ? String(Number(v.toPrecision(12))) : String(v))

/** What the solver finds, as the bar's own call makes it: (lhs) − (rhs), with the scene's names. */
function solved(eq: string, scope: Record<string, unknown>): string {
  return seenOf(() => {
    const at = eq.indexOf('=')
    const sides: [string, string] = [eq.slice(0, at), eq.slice(at + 1)]
    const sol = solutionsInX(`(${sides[0]}) - (${sides[1]})`, sides, scope)
    if (!sol) return 'nothing (too slow, or not solvable now)'
    if (sol.kind === 'none') return `no real x; complex ${sol.complex.map((c) => `${num(c.re)} ${c.im < 0 ? '-' : '+'} ${num(Math.abs(c.im))}i`).join(', ') || 'none'}`
    if (sol.kind === 'every') return 'every x'
    if (sol.kind === 'stretch') return 'a whole stretch of x'
    const more = sol.more === undefined ? '' : sol.more === 'further' ? ' (more further out)' : ` (repeats every ${num(sol.more.period)})`
    return `x = ${sol.xs.map(num).join(', ')}${more}`
  })
}

/** What the bar prints for the line, with the slider set first when there is one. */
async function typed(eq: string, a: number | null): Promise<string> {
  resetGlobals()
  scene().newScene()
  // A new scene keeps the last one's space: start each line in Vectors, the app's first space.
  scene().setActiveSpace('vectors')
  if (a !== null) await runCommand(`a = ${a}`)
  scene().clearLog()
  await runCommand(eq)
  const last = scene().log.at(-1)
  return last ? `${last.kind}: ${last.text}` : 'nothing printed'
}

async function sweep(): Promise<string[]> {
  const lines: string[] = []
  for (const eq of SLIDER_EQS)
    for (const a of SLIDER_VALUES) {
      lines.push(goldenLine(`BAR ${eq} (a = ${a})`, await typed(eq, a)))
      lines.push(goldenLine(`SOLVE ${eq} (a = ${a})`, solved(eq, { a })))
    }
  for (const eq of ROOTS_FUZZ) {
    lines.push(goldenLine(`BAR ${eq}`, await typed(eq, null)))
    lines.push(goldenLine(`SOLVE ${eq}`, solved(eq, {})))
  }
  return lines
}

describe('golden sweep: roots', () => {
  it('is stable: two runs in a row give the same lines', async () => {
    expect(await sweep()).toEqual(await sweep())
  }, 120_000)

  it('matches tests/golden/out/roots.txt', async () => {
    expectGolden('roots', await sweep())
  }, 120_000)
})

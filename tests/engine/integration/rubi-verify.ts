// Re-verifies converted items of Rubi's integration test suite (section 1, algebraic functions).
//
// The converter (scripts/rubi/convert-tests.mjs) wrote section1.json from the suite. This module does not trust that
// file: each kept item's antiderivative is differentiated symbolically with mathjs (simplify off) and compared with its
// integrand at 40 significant digits, at five points inside the domain (at least three are required), under the constant
// set the item records. Any mismatch, or any failure to verify, is reported. Nothing here catches an exception: an
// unexpected error fails the test that calls it.
//
// The algorithm is the same as verify() in the converter. The two copies sit side by side on purpose: a test that
// imported the converter would trust the code it is checking.
//
// Two modes. The default run (rubi-section1.test.ts) checks the files' counts and fields and re-verifies a fixed sample
// (sampleItems). The full re-verification of every kept item runs only with PHYSLAB_RUBI_FULL=1 (npm run
// test:rubi-full), in nine parts (rubi-section1-01.test.ts to rubi-section1-09.test.ts), each within its own time limit.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { create, all, type BigNumber } from 'mathjs'
import { REPO_ROOT } from '../../helpers/repo'

const math = create(all)
math.config({ number: 'BigNumber', precision: 40 })

/** The same constant sets, grid, tolerance and point count as the converter. */
const CONSTANT_SETS = [
  ['1.3', '0.7', '2.1', '1.6', '0.9', '1.15', '0.55', '2.6', '1.45', '0.35'],
  ['-1.3', '0.7', '-2.1', '1.6', '-0.9', '1.15', '-0.55', '2.6', '-1.45', '0.35'],
]
const GRID = ['0.25', '0.5', '0.75', '0.9', '1.1', '1.4', '1.7', '2.2', '2.7', '3.3', '4.1', '5',
  '-0.25', '-0.5', '-0.9', '-1.4', '-2.2', '-3.3']
const POINTS_WANTED = 5
const MIN_VALID_POINTS = 3
const TOLERANCE = '1e-30'

/** How many kept items the default run re-verifies: an even share for each source file, 300 in all. */
const SAMPLE_SIZE = 300

interface Kept {
  id: string
  integrand: string
  variable: string
  antiderivative: string
  rubiSteps: number
  source: string
  validPoints: number
  constantSet: number
}

type Verdict = { ok: true; validPoints: number; constantSet: number } | { ok: false; reason: string }

const isRealFinite = (v: unknown): boolean => math.typeOf(v) === 'BigNumber' && (v as BigNumber).isFinite()

/** The verification of one item, as the converter runs it. */
function verifyItem(integrand: string, antiderivative: string, variable: string): Verdict {
  const f = math.parse(integrand)
  const F = math.parse(antiderivative)
  const dF = math.derivative(F, variable, { simplify: false })
  const namespace = math as unknown as Record<string, unknown>
  const deps = new Set<string>()
  for (const node of [f, F]) {
    node.traverse((n) => {
      if (n.type === 'SymbolNode') {
        const name = (n as unknown as { name: string }).name
        if (name !== variable && namespace[name] === undefined) deps.add(name)
      }
    })
  }
  const names = [...deps].sort()
  const cf = f.compile()
  const cdF = dF.compile()
  const tol = math.bignumber(TOLERANCE) as BigNumber
  let best = 0
  for (let set = 0; set < CONSTANT_SETS.length; set++) {
    const scope: Record<string, unknown> = {}
    names.forEach((name, k) => {
      scope[name] = math.bignumber(CONSTANT_SETS[set][k % CONSTANT_SETS[set].length])
    })
    let valid = 0
    for (const p of GRID) {
      if (valid === POINTS_WANTED) break
      const s = { ...scope, [variable]: math.bignumber(p) }
      const a: unknown = cf.evaluate(s)
      const b: unknown = cdF.evaluate(s)
      if (!isRealFinite(a) || !isRealFinite(b)) continue
      const scale = math.max(math.bignumber(1), math.abs(a as BigNumber), math.abs(b as BigNumber)) as BigNumber
      const diff = math.abs(math.subtract(a as BigNumber, b as BigNumber)) as BigNumber
      if (math.larger(diff, math.multiply(tol, scale) as BigNumber)) {
        return { ok: false, reason: `differs from the integrand at ${variable} = ${p} (constant set ${set + 1})` }
      }
      valid++
    }
    if (valid >= MIN_VALID_POINTS) return { ok: true, validPoints: valid, constantSet: set + 1 }
    best = Math.max(best, valid)
  }
  return { ok: false, reason: `only ${best} real points inside the domain under each constant set` }
}

/** The converted items, read from section1.json. */
export function loadKept(): Kept[] {
  return JSON.parse(readFileSync(join(REPO_ROOT, 'tests', 'engine', 'integration', 'section1.json'), 'utf8')) as Kept[]
}

/**
 * A fixed sample of the kept items, the same on every run. The source files are taken in the order they first appear,
 * and file g contributes an even stride of its own items: floor((g+1)*300/G) - floor(g*300/G) of them, seven or eight
 * for the G files that have kept items. The sample therefore spans the whole section, and it is exactly 300 items when
 * every file has enough.
 */
export function sampleItems(kept: Kept[]): Kept[] {
  const bySource = new Map<string, Kept[]>()
  for (const item of kept) {
    const list = bySource.get(item.source)
    if (list) list.push(item)
    else bySource.set(item.source, [item])
  }
  const groups = [...bySource.values()]
  const sample: Kept[] = []
  groups.forEach((items, g) => {
    const quota = Math.floor(((g + 1) * SAMPLE_SIZE) / groups.length) - Math.floor((g * SAMPLE_SIZE) / groups.length)
    const take = Math.min(quota, items.length)
    for (let j = 0; j < take; j++) sample.push(items[Math.floor((j * items.length) / take)])
  })
  return sample
}

/** Item indices [start, end) of part `part` (1-based) out of `parts`: together the parts cover every item once. */
function partRange(total: number, part: number, parts: number): [number, number] {
  return [Math.floor(((part - 1) * total) / parts), Math.floor((part * total) / parts)]
}

/** The problems found in the given items, or an empty list when every one re-verifies. */
export function checkItems(items: Kept[]): string[] {
  const problems: string[] = []
  for (const item of items) {
    if (item.variable !== 'x') problems.push(`${item.id}: variable ${item.variable}`)
    if (!Number.isInteger(item.rubiSteps)) problems.push(`${item.id}: steps ${item.rubiSteps} is not an integer`)
    const verdict = verifyItem(item.integrand, item.antiderivative, item.variable)
    if (!verdict.ok) {
      problems.push(`${item.id}: ${verdict.reason}`)
      continue
    }
    if (verdict.constantSet !== item.constantSet) problems.push(`${item.id}: constant set ${verdict.constantSet}, recorded ${item.constantSet}`)
    if (verdict.validPoints !== item.validPoints) problems.push(`${item.id}: ${verdict.validPoints} valid points, recorded ${item.validPoints}`)
    if (item.validPoints < MIN_VALID_POINTS || item.validPoints > POINTS_WANTED) problems.push(`${item.id}: ${item.validPoints} valid points`)
  }
  return problems
}

/** The problems found in part `part` of `parts` of the converted items, or an empty list when all re-verify. */
export function checkPart(part: number, parts: number): string[] {
  const kept = loadKept()
  const [start, end] = partRange(kept.length, part, parts)
  return checkItems(kept.slice(start, end))
}
